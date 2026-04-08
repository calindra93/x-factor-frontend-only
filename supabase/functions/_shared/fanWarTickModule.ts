/**
 * Fan War Tick Module — Runs every turn per player
 * ─────────────────────────────────────────────────
 * 1. Decay/escalate active fan wars based on intensity + duration
 * 2. Check for organic fan war triggers (sentiment divergence, controversy)
 * 3. Generate NPC content for escalated wars
 * 4. Auto-resolve stale wars
 * 5. Update fan_profiles sentiment drift toward neutral
 *
 * Returns standard deltas: { news_items_to_create, social_posts_to_create, notifications_to_create, turn_event }
 */

// TASK 5 DECISION-PENDING SENTIMENT COMPATIBILITY:
// This module is still allowed to use the legacy sentiment adapter until Task 6
// replaces the remaining fan-war compatibility path with canonical selectors or
// a reduced scalar-only sentiment layer. Do not expand this adapter usage.

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { computeBeefReleaseQuality, calculateDissTrackScore, calculateControversyLevel, BEEF_RESPONSE_WINDOW } from './beefMath.ts';
import {
  generateFanWarNews,
  deriveLegacyArchetypeSentiments,
} from './fanSentimentEngine.ts';
import {
  buildLegacyEssenceArchetypeDistribution,
  selectCanonicalFandomSignals,
} from './fandomCanonicalSelectors.ts';
import { pickCanonicalMediaOutlet } from './socialMediaMath.ts';
import { generateFanContentThumbnail } from './thumbnailGenerator.ts';
import { clampDefenseMultiplier, clampWarIntensityMultiplier } from './sentimentModifiers.ts';
import {
  computeWarMomentum,
  computeSympathyMultiplier,
  isWarCooldownActive,
} from './fandomSegmentsEngine.ts';

const N = (v: any) => Number(v) || 0;

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENT-BASED FAN WAR TRIGGER (Wave 4 — six-segment sentiment rebuild)
// ─────────────────────────────────────────────────────────────────────────────
// This function uses segment sentiment divergence instead of legacy archetype
// sentiments. Falls through to legacy path if segments unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export interface FanWarTriggerResult {
  shouldTrigger: boolean;
  intensity: number;
  reason: string;
  primarySegments: string[];
  divergence: number;
}

/**
 * Segment-based fan war trigger (new system).
 * 
 * PATH 1: Sentiment divergence — triggers when at least one segment is hostile (<25)
 *         and another is enthusiastic (>75) with divergence >50.
 * 
 * PATH 2: High-profile controversy — triggers probabilistically when artist has
 *         high clout, recent controversy, and elevated hype.
 * 
 * @param segmentSentiments - Record of segment_type -> sentiment value
 * @param segmentCounts - Record of segment_type -> fan count (filters out empty segments)
 * @param hype - Player's current hype (0-100)
 * @param clout - Player's current clout
 * @param recentControversy - Whether player has recent controversy
 */
export function shouldTriggerFanWarFromSegments(
  segmentSentiments: Record<string, number>,
  segmentCounts: Record<string, number>,
  hype: number,
  clout: number,
  recentControversy: boolean,
): FanWarTriggerResult {
  const sentimentValues = Object.entries(segmentSentiments)
    .filter(([seg, _]) => (segmentCounts[seg] || 0) > 0)
    .map(([seg, val]) => ({ segment: seg, sentiment: val }));

  if (sentimentValues.length < 2) {
    return { shouldTrigger: false, intensity: 0, reason: '', primarySegments: [], divergence: 0 };
  }

  const hostile = sentimentValues.filter(s => s.sentiment < 25);
  const enthusiastic = sentimentValues.filter(s => s.sentiment > 75);

  // ─── PATH 1: Sentiment divergence trigger ───
  // Requires at least one hostile and one enthusiastic segment with >50 divergence
  if (hostile.length >= 1 && enthusiastic.length >= 1) {
    const maxEnthusiastic = Math.max(...enthusiastic.map(e => e.sentiment));
    const minHostile = Math.min(...hostile.map(h => h.sentiment));
    const divergence = maxEnthusiastic - minHostile;

    if (divergence > 50) {
      const hostileSeg = hostile.find(h => h.sentiment === minHostile)!;
      const enthSeg = enthusiastic.find(e => e.sentiment === maxEnthusiastic)!;

      // Intensity: base 40 + scaled by divergence (up to 85), boosted by hype
      const baseIntensity = Math.min(85, 40 + Math.floor(divergence * 0.6));
      const hypeBoost = Math.floor((hype / 100) * 15);
      const intensity = Math.min(95, baseIntensity + hypeBoost);

      return {
        shouldTrigger: true,
        intensity,
        reason: `Sentiment divergence (${divergence}) between ${hostileSeg.segment} and ${enthSeg.segment}`,
        primarySegments: [hostileSeg.segment, enthSeg.segment],
        divergence,
      };
    }
  }

  // ─── PATH 2: High-profile controversy fallback ───
  // 30% chance when clout >500, recent controversy, and hype >50
  if (clout > 500 && recentControversy && hype > 50) {
    const roll = Math.random();
    if (roll < 0.3) {
      return {
        shouldTrigger: true,
        intensity: Math.min(75, 50 + Math.floor((clout / 100) * 5) + Math.floor(hype * 0.3)),
        reason: 'High-profile controversy with elevated hype',
        primarySegments: ['stan', 'critic'],
        divergence: 0,
      };
    }
  }

  return { shouldTrigger: false, intensity: 0, reason: '', primarySegments: [], divergence: 0 };
}

// Seeded RNG — same pattern as chartUpdateModule.ts and festivalGlobalModule.ts
function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

async function resolveBeefEpicenterContext(supabase: typeof supabaseAdmin, playerId: string) {
  let epicenterCityId: string | null = null;
  let epicenterCityName: string | null = null;

  try {
    const { data: activeTour } = await supabase
      .from('tours')
      .select('id')
      .eq('artist_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (activeTour?.id) {
      const { data: currentGig } = await supabase
        .from('gigs')
        .select('city')
        .eq('tour_id', activeTour.id)
        .eq('status', 'Booked')
        .order('scheduled_turn', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (currentGig?.city) {
        const { data: scene } = await supabase
          .from('city_scenes')
          .select('id, city_name')
          .eq('city_name', currentGig.city)
          .maybeSingle();
        if (scene) {
          epicenterCityId = scene.id;
          epicenterCityName = scene.city_name;
        }
      }
    }

    if (!epicenterCityId) {
      const { data: topRep } = await supabase
        .from('player_city_reputation')
        .select('city_id, city_scenes(city_name)')
        .eq('player_id', playerId)
        .order('reputation_score', { ascending: false })
        .limit(1)
        .maybeSingle();
      epicenterCityId = topRep?.city_id || null;
      epicenterCityName = topRep?.city_scenes?.city_name || null;
    }
  } catch {
    // non-fatal
  }

  return { epicenterCityId, epicenterCityName };
}

/**
 * Generate typed fan war NPC posts with 4 content types:
 * - LoopTok (short video clip reaction) — always eligible
 * - fan_cam (tribute/highlight video) — always eligible
 * - analysis (breakdown post) — only at intensity ≥ 50
 * - meme (highest frequency, scales with hype)
 * Volume scales with followers, hype, and clout.
 * Returns an array of post objects ready for insertion as NPC Xpress posts.
 */
function generateTypedFanWarPosts(
  artistName: string,
  intensity: number,
  hype: number,
  clout: number,
  followers: number,
  primaryArchetypes: string[],
): Array<{
  platform: string;
  post_type: string;
  title: string;
  caption: string;
  views: number;
  fan_war_content_type: string;
  metadata: Record<string, any>;
}> {
  const posts: Array<any> = [];

  // Volume: 1 post baseline, +1 if high followers, +1 if high hype
  const volumeBase = 1 + (followers > 50000 ? 1 : 0) + (hype > 60 ? 1 : 0);
  const numPosts = Math.min(4, Math.max(1, volumeBase));

  // Weighted pool of content types
  type ContentEntry = {
    type: string;
    platform: string;
    post_type: string;
    weight: number;
    minIntensity: number;
    templates: Array<{ title: string; caption: string }>;
    viewMult: number;
  };

  const contentPool: ContentEntry[] = [
    {
      type: 'looptok',
      platform: 'looptok',
      post_type: 'short',
      weight: 3,
      minIntensity: 0,
      templates: [
        { title: `POV: ${artistName} fans checking the timeline during the war`, caption: '💀💀💀' },
        { title: `${artistName} stans vs haters compilation`, caption: 'The comments are WILD' },
        { title: `When ${artistName} drops and the fanbase splits`, caption: 'Every. Single. Time.' },
        { title: `Live footage of ${artistName} fans defending their fave`, caption: 'They don\'t play 🔥' },
      ],
      viewMult: 0.0002,
    },
    {
      type: 'fan_cam',
      platform: 'looptok',
      post_type: 'short',
      weight: 2,
      minIntensity: 0,
      templates: [
        { title: `${artistName} fan cam — the energy is unreal`, caption: 'We ride at dawn 🫡' },
        { title: `${artistName} best moments (fan war era edition)`, caption: 'They stay winning' },
        { title: `${artistName} edits that go hard during the drama 🔥`, caption: 'Fan-made content hits different' },
      ],
      viewMult: 0.00015,
    },
    {
      type: 'analysis',
      platform: 'vidwave',
      post_type: 'video',
      weight: 2,
      minIntensity: 50, // Only eligible at intensity ≥ 50
      templates: [
        { title: `Why ${artistName}'s Fanbase is at WAR (Full Breakdown)`, caption: 'The drama explained' },
        { title: `${artistName} Fan War: Who's RIGHT? (Hot Take)`, caption: 'Both sides have a point...' },
        { title: `The ${artistName} Situation is WORSE Than You Think`, caption: 'A deep analysis of the fan divide' },
        { title: `Breaking Down the ${artistName} Fan War — What's Really Going On`, caption: 'Industry impact analysis' },
      ],
      viewMult: 0.0004,
    },
    {
      type: 'meme',
      platform: 'xpress',
      post_type: 'text',
      weight: 4 + Math.floor(hype / 25), // Highest frequency, scales with hype
      minIntensity: 0,
      templates: [
        { title: '', caption: `${artistName} fans are FIGHTING in the comments rn 💀` },
        { title: '', caption: `Not the ${artistName} stans starting a whole war on the TL 😭` },
        { title: '', caption: `Being a ${artistName} fan is exhausting but here I am 😤` },
        { title: '', caption: `${artistName} really has the most toxic AND loyal fanbase simultaneously` },
        { title: '', caption: `Y'all are delusional if you think ${artistName} isn't the best rn 🔥` },
        { title: '', caption: `The ${artistName} discourse is exhausting. Can we just enjoy the music?` },
      ],
      viewMult: 0.0001,
    },
  ];

  // Filter by minimum intensity and build weighted selection
  const eligible = contentPool.filter(c => intensity >= c.minIntensity);
  const totalWeight = eligible.reduce((s, c) => s + c.weight, 0);

  for (let i = 0; i < numPosts; i++) {
    // Weighted random selection
    let roll = Math.random() * totalWeight;
    let picked: ContentEntry | null = null;
    for (const entry of eligible) {
      roll -= entry.weight;
      if (roll <= 0) { picked = entry; break; }
    }
    if (!picked) picked = eligible[eligible.length - 1];

    const template = picked.templates[Math.floor(Math.random() * picked.templates.length)];
    const baseViews = Math.floor(followers * picked.viewMult * (intensity / 50) * (0.5 + Math.random()) * (1 + hype / 200));
    const views = Math.max(10, baseViews);

    posts.push({
      platform: picked.platform,
      post_type: picked.post_type,
      title: template.title,
      caption: template.caption,
      views,
      fan_war_content_type: picked.type,
      metadata: {
        is_fan_war: true,
        is_npc: true,
        fan_war_content_type: picked.type,
        artist_name: artistName,
        primary_archetypes: primaryArchetypes,
        intensity,
      },
    });
  }

  return posts;
}

export async function processFanWarTick(player: any, globalTurnId: number, entities: any, ctx: any = {}) {
  const supabase = supabaseAdmin;
  const deltas: Record<string, any> = {
    news_items_to_create: [],
    social_posts_to_create: [],
    notifications_to_create: [],
    controversy_case_updates: [],
    fan_war_updates: [],
    fan_war_inserts: [],
    fan_war_turn_inserts: [],
    beef_inserts: [],
    xpress_event_requests: [],
    releases_updates: [],
    fanProfile: {},
    turn_event: null
  };

  try {
    // Load fan profile
    const { data: fanProfile } = await supabase
      .from('fan_profiles')
      .select('id, artist_id, overall_sentiment')
      .eq('artist_id', player.id)
      .maybeSingle();

    if (!fanProfile) return { success: true, deltas };

    const fandomModifiers = ctx?.fandomModifiers || null;
    let archetypes = fandomModifiers?.derivedEssenceArchetypes || null;

    if (!archetypes) {
      const [{ data: fandomRow }, { data: segmentRows }] = await Promise.all([
        supabase
          .from('fandoms')
          .select('fan_morale, brand_trust, toxicity_score')
          .eq('player_id', player.id)
          .maybeSingle(),
        supabase
          .from('fandom_segments')
          .select('segment_type, count, loyalty, morale')
          .eq('player_id', player.id),
      ]);

      archetypes = buildLegacyEssenceArchetypeDistribution(
        selectCanonicalFandomSignals({
          segments: segmentRows || [],
          fandom: fandomRow || null,
        }),
      );
    }

    const industryPerception = ctx?.industryPerceptionModifiers || null;
    const controversyBoost = N(industryPerception?.controversyArc?.engagementReadinessBoost);
    const readiness = N(fandomModifiers?.engagementReadiness);
    const essence = fandomModifiers?.essenceVectors || {};
    const defenseMitigationMult = Math.max(
      1,
      1 + Math.max(0, (readiness - 55) / 200) + Math.max(0, N(essence?.community) - 50) / 250,
    );
    const fanWarIntensityMult = Math.max(0.85, Math.min(1.25, N(fandomModifiers?.fanWarIntensityMult) || 1));
    const audienceWarMult = clampWarIntensityMultiplier(N(ctx?.audienceModifiers?.warIntensityMult) || 1);
    const audienceDefenseMult = clampDefenseMultiplier(N(ctx?.audienceModifiers?.defenseMult) || 1);
    const phase6HeatMult = Math.max(0, Math.min(1.25, N(ctx?.audienceModifiers?.phase6Heat) || 1));
    const combinedWarMult = clampWarIntensityMultiplier(fanWarIntensityMult * audienceWarMult * phase6HeatMult);
    const defenseDelta = Math.max(0, Math.min(6, Math.round(((defenseMitigationMult * audienceDefenseMult) - 1) * 30)));

    const sentiments = deriveLegacyArchetypeSentiments(fanProfile);

    // ─── 0. DISS TRACK CHECK ───
    // If the player dropped a diss track this turn, force a fan war against the target
    const { data: dissTrackReleases } = await supabase
      .from('releases')
      .select('id, title, diss_track_target_id')
      .eq('artist_id', player.id)
      .eq('is_diss_track', true)
      .gte('created_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (dissTrackReleases && dissTrackReleases.length > 0) {
      const dissTrack = dissTrackReleases[0];
      const targetId = dissTrack.diss_track_target_id;
      // Check if there's already an active/escalated war with this target (any trigger)
      const { data: existingActiveWar } = await supabase
        .from('fan_wars')
        .select('id')
        .eq('artist_id', player.id)
        .eq('rival_artist_id', targetId)
        .in('status', ['active', 'escalated'])
        .limit(1);

      if (!existingActiveWar || existingActiveWar.length === 0) {
        const dissIntensity = Math.min(90, 55 + Math.round(N(player.hype) * 0.3));
        const stagedWarId = crypto.randomUUID();
        const newDissWar = {
          id: stagedWarId,
          artist_id: player.id,
          rival_artist_id: targetId || null,
          intensity: dissIntensity,
          duration_turns: 0,
          max_duration_turns: 12,
          source_trigger: 'diss_track',
          trigger_details: { release_id: dissTrack.id, title: dissTrack.title, diss_track: true },
          primary_archetypes_involved: ['underground_purists', 'trend_chasers'],
          status: dissIntensity >= 70 ? 'escalated' : 'active',
          started_turn: globalTurnId,
        };
        deltas.fan_war_inserts.push(newDissWar);

        if (newDissWar) {
          // ─── CREATE BEEF (chain tracker) ───
          let beefId: string | null = null;
          let epicenterCityId: string | null = null;
          let epicenterCityName: string | null = null;
          if (targetId) {
            const epicenterContext = await resolveBeefEpicenterContext(supabase, player.id);
            epicenterCityId = epicenterContext.epicenterCityId;
            epicenterCityName = epicenterContext.epicenterCityName;
            // Score the initial diss track
            const { data: initSongs } = await supabase
              .from('songs').select('quality').eq('release_id', dissTrack.id);
            const avgQuality = computeBeefReleaseQuality(initSongs || []);
            const initScore = calculateDissTrackScore({
              songQuality: avgQuality,
              artistHype: N(player.hype),
              artistClout: N(player.clout),
            });
            const initControversy = calculateControversyLevel({
              aggressorClout: N(player.clout),
              targetClout: 0, // target clout loaded at resolution
              chainLength: 1,
            });

            beefId = crypto.randomUUID();
            deltas.beef_inserts.push({
              id: beefId,
              aggressor_id: player.id,
              target_id: targetId,
              epicenter_city_id: epicenterCityId,
              status: 'active',
              turn_initiated: globalTurnId,
              response_window_ends: globalTurnId + BEEF_RESPONSE_WINDOW,
              last_response_turn: globalTurnId,
              chain_length: 1,
              aggressor_score: initScore,
              target_score: 0,
              controversy_level: initControversy,
              fan_war_id: newDissWar.id,
              initiating_release_id: dissTrack.id,
            });

            deltas.releases_updates.push({
              id: dissTrack.id,
              patch: { beef_id: beefId },
            });
          }

          deltas.notifications_to_create.push({
            player_id: player.id,
            type: 'HIGHLIGHT',
            title: 'Diss Track Dropped! 🎤🔥',
            subtitle: epicenterCityName ? `"${dissTrack.title}" is live • ${epicenterCityName}` : `"${dissTrack.title}" is live`,
            body: `"${dissTrack.title}" just ignited the internet.${epicenterCityName ? ` The first wave is hitting ${epicenterCityName}.` : ''} Fan war started with intensity ${dissIntensity}. Your stans are ready to ride.`,
            is_read: false,
            metrics: { fan_war_id: newDissWar.id, intensity: dissIntensity, diss_track: true, beef_id: beefId, epicenter_city_id: epicenterCityId || null, epicenter_city_name: epicenterCityName || null },
            idempotency_key: `diss_track:${player.id}:${dissTrack.id}`,
          });

          deltas.news_items_to_create.push({
            artist_id: player.id,
            headline: epicenterCityName
              ? `${player.artist_name || 'Artist'} sparks a regional beef wave in ${epicenterCityName}`
              : `${player.artist_name || 'Artist'} sparks a new diss-track beef`,
            body: epicenterCityName
              ? `"${dissTrack.title}" has pushed tensions into ${epicenterCityName}, where fan factions are already mobilizing around the fallout.`
              : `"${dissTrack.title}" has triggered a new diss-track conflict, with fan factions already mobilizing around the fallout.`,
            category: 'controversy',
            sentiment: 'negative',
            created_at: new Date().toISOString(),
            metadata: { beef_id: beefId, fan_war_id: newDissWar.id, epicenter_city_id: epicenterCityId || null, epicenter_city_name: epicenterCityName || null, track_title: dissTrack.title, target_id: targetId || null }
          });

          // Trigger beef news article generation and NPC Xpress posts
          if (targetId) {
            const { data: targetProfile } = await supabase
              .from('players')
              .select('artist_name')
              .eq('id', targetId)
              .single();
            
            deltas.beef_started = true;
            deltas.beef_target_name = targetProfile?.artist_name || 'another artist';
            deltas.beef_track_title = dissTrack.title;
            deltas.beef_epicenter_city_name = epicenterCityName || null;

            deltas.xpress_event_requests.push({
              type: 'beef_started',
              aggressorName: player.artist_name || 'An artist',
              targetName: targetProfile?.artist_name || 'another artist',
              trackTitle: dissTrack.title,
              epicenterCityName: epicenterCityName || null,
              epicenterCityId: epicenterCityId || null,
              globalTurnId,
              followers: Number(player.followers) || 0,
              hype: Number(player.hype) || 0,
              clout: Number(player.clout) || 0,
              severity: Math.min(1, Math.max(0.45, (Number(player.hype) || 0) / 100 + (Number(player.clout) || 0) / 200)),
            });
          }

          // If there's a target, notify them with response window info
          if (targetId) {
            deltas.notifications_to_create.push({
              player_id: targetId,
              type: 'HIGHLIGHT',
              title: 'You Got Dissed! 🎤🔥',
              subtitle: epicenterCityName ? `${player.artist_name || 'An artist'} came for you • ${epicenterCityName}` : `${player.artist_name || 'An artist'} came for you`,
              body: `${player.artist_name || 'An artist'} just dropped a diss track targeting you.${epicenterCityName ? ` The first regional shockwave is centered in ${epicenterCityName}.` : ''} You have ${BEEF_RESPONSE_WINDOW} turns to respond with your own diss track. The fandoms are mobilizing.`,
              is_read: false,
              metrics: { attacker_id: player.id, fan_war_id: newDissWar.id, beef_id: beefId, response_window: BEEF_RESPONSE_WINDOW, epicenter_city_id: epicenterCityId || null, epicenter_city_name: epicenterCityName || null },
              idempotency_key: `diss_track_target:${targetId}:${dissTrack.id}`,
            });
          }
        }
      }
    }

    // ─── 1. TICK ACTIVE FAN WARS ───
    const { data: activeWars } = await supabase
      .from('fan_wars')
      .select('*')
      .eq('artist_id', player.id)
      .in('status', ['active', 'escalated', 'cooling']);

    // Get fandom labor pool for momentum calculation
    const fandomLaborPool = ctx?.fandomLaborPool || {};
    const challengerDefenseLabor = N(fandomLaborPool?.defense) + N(fandomLaborPool?.promo);

    for (const war of (activeWars || [])) {
      const newDuration = N(war.duration_turns) + 1;
      let newIntensity = Math.round(N(war.intensity) * combinedWarMult);
      let newStatus = war.status;

      // Seeded RNG for deterministic catchup replay — seed on warId + turnId
      const warRng = mulberry32(hashStr(`${war.id}-${globalTurnId}`));

      // Natural decay: intensity drops per turn based on current status
      // active: 2-6 pts/turn, escalated (≥70): 1-3 pts/turn, cooling (≤15): 5-10 pts/turn
      if (war.status === 'cooling') {
        newIntensity = Math.max(0, newIntensity - (5 + Math.floor(warRng() * 6))); // 5-10
      } else if (war.status === 'escalated') {
        newIntensity = Math.max(0, newIntensity - (1 + Math.floor(warRng() * 3))); // 1-3
      } else {
        // 'active' or any other status
        newIntensity = Math.max(0, newIntensity - (2 + Math.floor(warRng() * 5))); // 2-6
      }

      // Defense Squad can dampen active conflict intensity
      if (defenseDelta > 0 && newStatus !== "resolved") {
        newIntensity = Math.max(0, newIntensity - defenseDelta);
      }

      // ─── TWO-SIDED MOMENTUM ───
      // Compute momentum for both sides using fandom labor
      let targetLaborThisTick = 0;
      const warTargetId = war.target_id || war.rival_artist_id || null;
      if (warTargetId) {
        // Load target's fandom labor pool (defense + promo)
        const { data: targetSegs } = await supabase
          .from('fandom_segments')
          .select('labor_output')
          .eq('player_id', warTargetId);
        for (const seg of (targetSegs || [])) {
          const lo = seg.labor_output || {};
          targetLaborThisTick += N(lo.defense) + N(lo.promo);
        }
      }

      // Anti-grief: sympathy multiplier for David vs Goliath
      const sympathy = N(war.sympathy_multiplier) || computeSympathyMultiplier(
        N(player.followers), warTargetId ? 0 : 0 // Will use stored value if available
      );

      const momentumResult = computeWarMomentum(
        N(war.challenger_momentum), N(war.target_momentum),
        challengerDefenseLabor, targetLaborThisTick,
        N(war.duration_turns), N(war.max_duration_turns),
        war.challenger_id || war.artist_id, warTargetId,
        sympathy,
      );

      // ─── OUTCOME DETERMINATION ───
      let outcomeType = null;
      let winnerId = null;
      if (newIntensity <= 5 || newDuration >= N(war.max_duration_turns) || momentumResult.outcomeReady) {
        newStatus = 'resolved';
        newIntensity = 0;

        // Use momentum-based outcome if available, else default
        if (momentumResult.outcome) {
          outcomeType = momentumResult.outcome;
          winnerId = momentumResult.winnerId;
        } else {
          outcomeType = 'draw';
        }

        // Generate resolution notification with outcome
        const outcomeLabel = outcomeType === 'decisive_win' ? 'Decisive Victory' :
          outcomeType === 'narrow_win' ? 'Narrow Victory' :
          outcomeType === 'mutual_destruction' ? 'Mutual Destruction' : 'Draw';

        deltas.notifications_to_create.push({
          player_id: player.id,
          type: 'HIGHLIGHT',
          title: `Fan War ${outcomeLabel}`,
          subtitle: `Settled after ${newDuration} turns`,
          body: `The fan war has ended after ${newDuration} turns with a ${outcomeLabel.toLowerCase()}. ${winnerId === player.id ? 'Your fanbase came out on top!' : winnerId ? 'The other side prevailed.' : 'Both sides are exhausted.'}`,
          is_read: false,
          metrics: { fan_war_id: war.id, final_intensity: 0, outcome: outcomeType, winner_id: winnerId },
          idempotency_key: `fan_war_resolved:${player.id}:${war.id}`,
        });

        // Set cooldown: 5 ticks between same pair
        const cooldownUntil = warTargetId ? globalTurnId + 5 : null;

        // Update war with outcome + cooldown
        deltas.fan_war_updates.push({
          id: war.id,
          patch: {
            intensity: 0,
            duration_turns: newDuration,
            status: 'resolved',
            outcome_type: outcomeType,
            challenger_momentum: momentumResult.challengerMomentum,
            target_momentum: momentumResult.targetMomentum,
            resolved_turn: globalTurnId,
            war_cooldown_until: cooldownUntil,
            outcome_summary: { outcome: outcomeType, winner_id: winnerId, final_momentum: momentumResult.netMomentum },
          },
        });

        deltas.fan_war_turn_inserts.push({
          war_id: war.id,
          tick_number: globalTurnId,
          challenger_labor_spent: challengerDefenseLabor,
          target_labor_spent: targetLaborThisTick,
          momentum_delta: momentumResult.netMomentum - (N(war.challenger_momentum) - N(war.target_momentum)),
          events: [{ type: 'resolved', outcome: outcomeType, winner_id: winnerId }],
        });

        continue; // Skip the rest of the loop for resolved wars
      }

      // Escalated/active wars generate typed NPC content each turn
      if ((war.status === 'escalated' || war.status === 'active') && newStatus !== 'resolved') {
        const warContentChance = war.status === 'escalated' ? 0.55 : 0.25;
        if (Math.random() < warContentChance) {
          const typedPosts = generateTypedFanWarPosts(
            player.artist_name || 'Artist', newIntensity, N(player.hype), N(player.clout), N(player.followers),
            war.primary_archetypes_involved || []
          );
          for (const post of typedPosts) {
            const outlet = await pickCanonicalMediaOutlet(post.platform, globalTurnId + Math.floor(Math.random() * 100));
            const thumb = post.platform === 'xpress'
              ? null
              : generateFanContentThumbnail(
                  post.title || post.caption,
                  player.artist_name || 'Artist',
                  outlet.name,
                  outlet.icon,
                  post.fan_war_content_type,
                );
            deltas.social_posts_to_create.push({
              artist_id: null,
              source_type: 'npc_reaction',
              platform: post.platform,
              post_type: post.post_type,
              title: post.title,
              caption: post.caption,
              ...(thumb ? { thumbnail_url: thumb } : {}),
              views: post.views,
              likes: Math.floor(post.views * 0.06),
              comments: Math.floor(post.views * 0.02),
              shares: Math.floor(post.views * 0.01),
              status: 'published',
              metadata: {
                ...post.metadata,
                fan_war_id: war.id,
                auto_generated: true,
                fan_war_content_type: post.fan_war_content_type,
                media_outlet_id: outlet.id,
                media_outlet_name: outlet.name,
                media_outlet_handle: outlet.handle,
                media_outlet_icon: outlet.icon,
                platform_pfp: outlet.avatarUrl,
                posted_by_outlet: true,
              }
            });
          }
        }
      }

      // High-intensity wars generate news
      if (newIntensity >= 60 && newStatus !== 'resolved' && Math.random() < 0.25) {
        const news = await generateFanWarNews(
          player.artist_name || 'Artist', null, newIntensity, war.source_trigger
        );
        for (const n of news.slice(0, 1)) {
          deltas.news_items_to_create.push({
            artist_id: player.id,
            headline: n.headline,
            body: n.body,
            category: n.category,
            impact_score: n.impact_score,
            source: n.source,
            metadata: { is_fan_war: true, fan_war_id: war.id, intensity: newIntensity, auto_generated: true }
          });
        }
      }

      // Status transitions: escalated ≥70, cooling ≤15, resolved at 0 or max duration
      if (newStatus !== 'resolved') {
        if (newIntensity >= 70) {
          newStatus = 'escalated';
        } else if (newIntensity <= 15 && newIntensity > 0) {
          newStatus = 'cooling';
        } else if (newIntensity > 15 && newIntensity < 70) {
          newStatus = 'active';
        }
      }

      // Update war in DB with momentum
      deltas.fan_war_updates.push({
        id: war.id,
        patch: {
          intensity: newIntensity,
          duration_turns: newDuration,
          status: newStatus,
          challenger_momentum: momentumResult.challengerMomentum,
          target_momentum: momentumResult.targetMomentum,
          public_attention: Math.min(200, N(war.public_attention) + Math.floor(newIntensity * 0.3)),
        },
      });

      deltas.fan_war_turn_inserts.push({
        war_id: war.id,
        tick_number: globalTurnId,
        challenger_labor_spent: challengerDefenseLabor,
        target_labor_spent: targetLaborThisTick,
        momentum_delta: momentumResult.netMomentum - (N(war.challenger_momentum) - N(war.target_momentum)),
        events: [{ type: 'tick', intensity: newIntensity, status: newStatus }],
      });
    }

    // ─── 2. ORGANIC FAN WAR CHECK ───
    // Only check if no active/escalated wars exist
    const hasActiveWar = (activeWars || []).some((w: any) => w.status === 'active' || w.status === 'escalated');
    if (!hasActiveWar) {
      // Check recent controversy (negative news in last 3 turns)
      const { data: recentNews } = await supabase
        .from('news_items')
        .select('id')
        .eq('artist_id', player.id)
        .eq('category', 'controversy')
        .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      const recentControversy = (recentNews || []).length > 0;

      let recentControversyCase: { id: string } | null = null;
      if (recentControversy) {
        const { data: recentControversyCases } = await supabase
          .from('controversy_cases')
          .select('id, public_attention, created_at')
          .eq('player_id', player.id)
          .neq('phase', 'resolved')
          .is('escalated_fan_war_id', null)
          .order('public_attention', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        recentControversyCase = recentControversyCases?.[0] || null;
      }

      // ────────────────────────────────────────────────────────────────────────
      // SEGMENT-BASED TRIGGER (Wave 4) — Try new system first
      // ────────────────────────────────────────────────────────────────────────
      // Query fandom_segments for segment sentiments and fan counts
      const { data: playerSegments } = await supabase
        .from('fandom_segments')
        .select('segment_type, sentiment, count')
        .eq('player_id', player.id);

      let segmentBasedWarTriggered = false;

      if (playerSegments && playerSegments.length > 0) {
        // Build segment sentiment and count maps
        const segSentiments: Record<string, number> = {};
        const segCounts: Record<string, number> = {};
        for (const seg of playerSegments) {
          segSentiments[seg.segment_type] = N(seg.sentiment) || 50;
          segCounts[seg.segment_type] = N(seg.count) || 0;
        }
        console.log(`[FanWarTick][SegTrigger] player=${player.id} segments=${playerSegments.length} sentiments=${JSON.stringify(segSentiments)}`);

        // Check war cooldown — respect per-pair cooldown from recent wars
        const { data: recentResolvedWars } = await supabase
          .from('fan_wars')
          .select('war_cooldown_until')
          .eq('artist_id', player.id)
          .not('war_cooldown_until', 'is', null)
          .order('resolved_turn', { ascending: false })
          .limit(1);

        const cooldownUntil = recentResolvedWars?.[0]?.war_cooldown_until ?? null;
        const onCooldown = isWarCooldownActive(cooldownUntil, globalTurnId);

        if (!onCooldown) {
          // Try segment-based fan war trigger
          const segmentWarCheck = shouldTriggerFanWarFromSegments(
            segSentiments,
            segCounts,
            N(player.hype),
            N(player.clout),
            recentControversy,
          );

          const effectiveReadiness = Math.min(100, readiness + controversyBoost);
          const readinessGatePassed = effectiveReadiness >= 35 || recentControversy;

          console.log(`[FanWarTick][SegTrigger] player=${player.id} shouldTrigger=${segmentWarCheck.shouldTrigger} divergence=${segmentWarCheck.divergence ?? 'n/a'} intensity=${segmentWarCheck.intensity ?? 0} readiness=${effectiveReadiness} readinessGate=${readinessGatePassed} cooldown=${onCooldown} reason=${segmentWarCheck.reason || 'none'}`);

          if (segmentWarCheck.shouldTrigger && readinessGatePassed) {
            segmentBasedWarTriggered = true;

            const stagedWarId = crypto.randomUUID();
            // Map segment names to legacy archetype names for backward compatibility
            const mappedArchetypes = segmentWarCheck.primarySegments.map(seg => {
              const SEGMENT_TO_ARCHETYPE: Record<string, string> = {
                'stan': 'trend_chasers',
                'critic': 'underground_purists',
                'casual': 'mainstream',
                'superfan': 'trend_chasers',
                'bandwagon': 'mainstream',
                'dormant': 'casual_fans',
              };
              return SEGMENT_TO_ARCHETYPE[seg] || seg;
            });

            const newWar = {
              id: stagedWarId,
              artist_id: player.id,
              intensity: Math.max(10, Math.min(95, Math.round(segmentWarCheck.intensity + (N(essence.rebellion) - N(essence.community)) * 0.08))),
              duration_turns: 0,
              max_duration_turns: 10,
              source_trigger: 'segment_divergence',
              trigger_details: {
                reason: segmentWarCheck.reason,
                divergence: segmentWarCheck.divergence,
                primary_segments: segmentWarCheck.primarySegments,
                segment_based: true,
                controversy_case_id: recentControversyCase?.id || null,
              },
              primary_archetypes_involved: mappedArchetypes,
              status: segmentWarCheck.intensity >= 50 ? 'escalated' : 'active',
              started_turn: globalTurnId,
            };
            deltas.fan_war_inserts.push(newWar);
            console.log(`[FanWarTick][SegTrigger] WAR CREATED player=${player.id} warId=${stagedWarId} intensity=${newWar.intensity} source=segment_divergence segments=[${segmentWarCheck.primarySegments.join(',')}] divergence=${segmentWarCheck.divergence}`);

            if (recentControversyCase?.id) {
              deltas.controversy_case_updates.push({
                id: recentControversyCase.id,
                patch: {
                  escalated_fan_war_id: newWar.id,
                  escalated_to_fan_war_at_turn: globalTurnId,
                  escalation_reason: segmentWarCheck.reason || 'Segment sentiment divergence',
                },
              });
            }

            // Generate initial NPC content for segment-based war
            const warPosts = generateTypedFanWarPosts(
              player.artist_name || 'Artist',
              segmentWarCheck.intensity,
              N(player.hype),
              N(player.clout),
              N(player.followers),
              mappedArchetypes,
            );
            for (const post of warPosts.slice(0, 2)) {
              const outlet = await pickCanonicalMediaOutlet(post.platform, globalTurnId + Math.floor(Math.random() * 100));
              const thumb = post.platform === 'xpress'
                ? null
                : generateFanContentThumbnail(
                    post.title || post.caption,
                    player.artist_name || 'Artist',
                    outlet.name,
                    outlet.icon,
                    post.fan_war_content_type,
                  );
              deltas.social_posts_to_create.push({
                artist_id: null,
                source_type: 'npc_reaction',
                platform: post.platform,
                post_type: post.post_type,
                title: post.title,
                caption: post.caption,
                ...(thumb ? { thumbnail_url: thumb } : {}),
                views: post.views,
                likes: Math.floor(post.views * 0.07),
                comments: Math.floor(post.views * 0.025),
                shares: Math.floor(post.views * 0.01),
                engagement_rate: Math.min(99, Math.floor(0.07 * 1000) / 10),
                status: 'published',
                metadata: {
                  ...post.metadata,
                  fan_war_id: newWar.id,
                  auto_generated: true,
                  media_outlet_id: outlet.id,
                  media_outlet_name: outlet.name,
                  media_outlet_handle: outlet.handle,
                  media_outlet_icon: outlet.icon,
                  platform_pfp: outlet.avatarUrl,
                  posted_by_outlet: true,
                  segment_based: true,
                },
              });
            }

            // Generate initial news for segment-based war
            const news = await generateFanWarNews(
              player.artist_name || 'Artist',
              null,
              segmentWarCheck.intensity,
              segmentWarCheck.reason,
            );
            for (const n of news.slice(0, 1)) {
              deltas.news_items_to_create.push({
                artist_id: player.id,
                headline: n.headline,
                body: n.body,
                category: n.category,
                impact_score: n.impact_score,
                source: n.source,
                metadata: {
                  is_fan_war: true,
                  fan_war_id: newWar.id,
                  intensity: segmentWarCheck.intensity,
                  segment_based: true,
                  primary_segments: segmentWarCheck.primarySegments,
                },
              });
            }

            // Notification
            deltas.notifications_to_create.push({
              player_id: player.id,
              type: 'HIGHLIGHT',
              title: 'Fan War Erupted!',
              subtitle: `Intensity: ${segmentWarCheck.intensity}`,
              body: `Your fanbase is at war! ${segmentWarCheck.reason}. Intensity: ${segmentWarCheck.intensity}. Check PR Management to intervene.`,
              is_read: false,
              metrics: {
                fan_war_id: newWar.id,
                intensity: segmentWarCheck.intensity,
                primary_segments: segmentWarCheck.primarySegments,
                divergence: segmentWarCheck.divergence,
              },
              idempotency_key: `fan_war_erupted:${player.id}:${newWar.id}`,
            });
          }
        }
      }

    }

    // ─── 3. SENTIMENT DRIFT TOWARD NEUTRAL ───
    // Each turn, all sentiments drift 1-2 points toward 50 (neutral)
    // Uses Math.sign(50 - sentiment) * randomInt(1, 2) clamped to [0, 100]
    const driftedSentiments = { ...sentiments };
    let changed = false;
    Object.keys(driftedSentiments).forEach(arch => {
      const current = N(driftedSentiments[arch]);
      if (current === 50) return; // Already at neutral
      const direction = Math.sign(50 - current); // +1 if below 50, -1 if above
      const drift = direction * (1 + Math.floor(Math.random() * 2)); // 1 or 2 points toward 50
      driftedSentiments[arch] = Math.max(0, Math.min(100, current + drift));
      changed = true;
    });

    if (changed) {
      // Recalculate overall
      const totalFans = Object.values(archetypes).reduce((s: number, v: any) => s + N(v), 0);
      let weightedOverall = 0;
      Object.entries(driftedSentiments).forEach(([arch, sent]) => {
        weightedOverall += N(sent) * (N(archetypes[arch]) / Math.max(1, totalFans));
      });

      deltas.fanProfile = {
        overall_sentiment: Math.round(weightedOverall),
        last_sentiment_update_turn: globalTurnId
      };
    }

    // ─── 4. EMERGENT FAN CONTENT GENERATION ───
    // Fans create LoopToks, analyses, fan cams based on player activity
    // Probability scales with hype, clout, and follower count
    const hype = N(player.hype);
    const clout = N(player.clout);
    const followers = N(player.followers);
    const overallSent = N(fanProfile.overall_sentiment || 50);

    // Base chance: 10% at low activity, up to 40% at high activity
    const fanContentChance = Math.min(0.4, 0.05 + (hype / 400) + (clout / 5000) + (followers / 500000));

    if (Math.random() < fanContentChance && followers >= 200) {
      // Load recent releases for content context
      const { data: recentReleases } = await supabase
        .from('releases')
        .select('title, lifetime_streams')
        .eq('artist_id', player.id)
        .order('created_at', { ascending: false })
        .limit(3);

      const artistName = player.artist_name || 'Artist';
      const topRelease = recentReleases?.[0];

      // Fan content templates by type
      const FAN_CONTENT_TYPES = [
        {
          type: 'fan_looptok',
          platform: 'looptok',
          post_type: 'short',
          templates: [
            { title: `POV: You discover ${artistName} for the first time`, caption: 'Welcome to the fandom 🫶' },
            { title: `${artistName} appreciation post 💕`, caption: `Day ${Math.floor(Math.random() * 365)} of being obsessed` },
            { title: `Ranking every ${artistName} song (controversial)`, caption: 'Don\'t come for me 😭' },
            { title: `When ${artistName} hits different at 2am`, caption: 'The vibes are immaculate ✨' },
            { title: `${artistName} fan check! 🔥`, caption: `Real ones know every lyric` },
            topRelease ? { title: `"${topRelease.title}" on repeat for ${Math.floor(1 + Math.random() * 30)} days straight`, caption: 'Send help 😩' } : null,
            topRelease ? { title: `My reaction to ${artistName} - ${topRelease.title}`, caption: 'I was NOT ready 🤯' } : null,
          ].filter(Boolean),
          viewMult: 0.0002
        },
        {
          type: 'fan_analysis',
          platform: 'vidwave',
          post_type: 'video',
          templates: [
            { title: `Why ${artistName} is the Future of Music (Deep Dive)`, caption: 'A comprehensive analysis' },
            { title: `${artistName}'s Musical Evolution: A Timeline`, caption: 'From underground to mainstream' },
            { title: `The Genius of ${artistName}'s Production Style`, caption: 'Breaking down the sound' },
            { title: `Is ${artistName} Overrated or Underrated? (Honest Take)`, caption: 'Let\'s discuss' },
            topRelease ? { title: `${artistName} - "${topRelease.title}" | Full Album/Track Breakdown`, caption: 'Every detail analyzed' } : null,
          ].filter(Boolean),
          viewMult: 0.0004
        },
        {
          type: 'fan_cam',
          platform: 'looptok',
          post_type: 'short',
          templates: [
            { title: `${artistName} fan cam compilation 🎥`, caption: 'The energy is UNMATCHED' },
            { title: `Best ${artistName} live moments`, caption: 'Goosebumps every time' },
            { title: `${artistName} edits that go hard 🔥`, caption: 'Fan-made content hits different' },
          ],
          viewMult: 0.00015
        },
        {
          type: 'fan_meme',
          platform: 'xpress',
          post_type: 'text',
          templates: [
            { title: '', caption: `${artistName} fans when the new drop hits: 🏃‍♂️💨` },
            { title: '', caption: `Nobody: \nAbsolutely nobody: \n${artistName} fans: *plays the same song 47 times*` },
            { title: '', caption: `Being a ${artistName} fan is a full-time job and I'm employee of the month 🏆` },
            overallSent < 40 ? { title: '', caption: `${artistName} really testing our loyalty rn... still here tho 😤` } : null,
            overallSent > 70 ? { title: '', caption: `${artistName} can do no wrong rn. We're in the golden era 👑` } : null,
          ].filter(Boolean),
          viewMult: 0.0001
        }
      ];

      // Pick 1-2 random content types
      const numContent = Math.random() < 0.3 ? 2 : 1;
      const shuffled = [...FAN_CONTENT_TYPES].sort(() => Math.random() - 0.5);

      for (let i = 0; i < Math.min(numContent, shuffled.length); i++) {
        const contentType = shuffled[i];
        const template = contentType.templates[Math.floor(Math.random() * contentType.templates.length)];
        if (!template) continue;

        const baseViews = Math.floor(followers * contentType.viewMult * (0.5 + Math.random()) * (1 + hype / 200));
        const views = Math.max(10, baseViews);
        const likes = Math.floor(views * (0.05 + Math.random() * 0.1));

        // Pick a media outlet account for this content (NOT the artist)
        const outlet = await pickCanonicalMediaOutlet(contentType.platform, globalTurnId + i);

        // Generate AI thumbnail for this fan content
        const fanThumb = generateFanContentThumbnail(
          template.title || template.caption,
          artistName,
          outlet.name,
          outlet.icon,
          contentType.type
        );

        deltas.social_posts_to_create.push({
          artist_id: null, // Fan content is posted by media outlets, not the artist
          platform: contentType.platform,
          post_type: contentType.post_type,
          title: template.title,
          caption: template.caption,
          thumbnail_url: fanThumb,
          views,
          likes,
          comments: Math.floor(likes * 0.2),
          shares: Math.floor(likes * 0.1),
          engagement_rate: Math.min(99, Math.floor((likes / Math.max(1, views)) * 1000) / 10),
          status: 'published',
          metadata: {
            is_fan_content: true,
            is_npc: true,
            fan_content_type: contentType.type,
            artist_name: artistName,
            about_artist_id: player.id, // This content is ABOUT the artist
            overall_sentiment: overallSent,
            auto_generated: true,
            media_outlet_id: outlet.id,
            media_outlet_name: outlet.name,
            media_outlet_handle: outlet.handle,
            media_outlet_icon: outlet.icon,
            platform_pfp: outlet.avatarUrl,
            posted_by_outlet: true
          }
        });
      }
    }

    if (defenseDelta > 0 && (activeWars || []).length > 0) {
      deltas.artistProfile = {
        hype: Math.min(100, N(player.hype) + 1),
      };
    }

    // Turn event log
    deltas.turn_event = {
      event_type: 'fan_war_tick',
      player_id: player.id,
      global_turn_id: globalTurnId,
      deltas: {
        active_wars: (activeWars || []).length,
        sentiment_drifted: changed,
        posts_generated: deltas.social_posts_to_create.length,
        news_generated: deltas.news_items_to_create.length
      }
    };

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[FanWarTick] Error for ${player.id}:`, errMsg);
    return { success: false, error: errMsg, deltas };
  }

  return { success: true, deltas };
}
