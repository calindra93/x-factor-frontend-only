/**
 * CONTROVERSY TICK MODULE — Turn Engine Integration
 * ──────────────────────────────────────────────────
 * Runs at order 4.55 every turn (after socialMediaModule, before fanWarTick).
 * 1. Advances active controversy_cases through phases
 * 2. Checks for new controversy triggers from social posts this tick
 * 3. Updates fandom controversy_shadow
 * 4. Returns deltas: notifications, brand_trust/fan_morale signals, turn_events
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  advanceControversy,
  createControversyFromTrigger,
  computeControversySignal,
  checkPostControversyTrigger,
  type ControversyCase,
  type ControversyType,
} from './controversyEngine.ts';
import { evaluateControversySourcePost } from './controversyVerdict.ts';
import { computeControversyRegionalImpact } from './sceneMath.ts';

const N = (v: unknown): number => Number(v) || 0;

async function loadEpicenterContext(supabase: any, playerId: string, cityId: string | null) {
  if (!cityId) {
    return {
      scene: null,
      rep: null,
      hasJournalistContact: false,
      journalistMitigation: 0,
    };
  }

  try {
    const [{ data: scene }, { data: rep }, { data: contacts }] = await Promise.all([
      supabase.from('city_scenes').select('id, city_name, controversy_tolerance').eq('id', cityId).maybeSingle(),
      supabase.from('player_city_reputation').select('city_id, reputation_score').eq('player_id', playerId).eq('city_id', cityId).maybeSingle(),
      supabase
        .from('scene_contacts')
        .select('id, role')
        .eq('city_id', cityId)
        .eq('role', 'journalist'),
    ]);

    let hasJournalistContact = false;
    let journalistMitigation = 0;
    if ((contacts || []).length > 0) {
      const journalistIds = contacts.map((contact: any) => contact.id).filter(Boolean);
      if (journalistIds.length > 0) {
        const { data: rels } = await supabase
          .from('player_contact_relationships')
          .select('contact_id, relationship_level, relationship_points')
          .eq('player_id', playerId)
          .in('contact_id', journalistIds);
        const bestRel = (rels || []).reduce((best: any, rel: any) => {
          const score = Math.max(N(rel.relationship_level), N(rel.relationship_points) / 25);
          return !best || score > best.score ? { score } : best;
        }, null);
        if (bestRel) {
          hasJournalistContact = true;
          journalistMitigation = Math.min(0.2, bestRel.score * 0.03);
        }
      }
    }

    return {
      scene,
      rep,
      hasJournalistContact,
      journalistMitigation,
    };
  } catch {
    return {
      scene: null,
      rep: null,
      hasJournalistContact: false,
      journalistMitigation: 0,
    };
  }
}

export async function processControversyTick(
  player: any,
  globalTurnId: number,
  entities: any,
  ctx: any = {},
): Promise<{
  success: boolean;
  deltas: Record<string, any>;
  controversySignal?: { activeCount: number; totalActiveTicks: number; hasPeakPhase: boolean };
}> {
  const supabase = supabaseAdmin;
  const deltas: Record<string, any> = {
    notifications_to_create: [],
    turn_events: [],
    social_post_metadata_updates: [],
    controversy_case_updates: [],
    controversy_case_inserts: [],
    scene_deltas: {
      city_reputation_upserts: [],
      contact_relationship_upserts: [],
      trending_genre_updates: [],
      opening_act_crossover: [],
      turn_events: [],
      notifications_to_create: [],
    },
    brand_trust_delta: 0,
    fan_morale_delta: 0,
    controversy_shadow: false,
    controversy_shadow_ticks_remaining: 0,
  };

  try {
    // ── Load active controversy cases ────────────────────────────────────────
    const { data: allCases } = await supabase
      .from('controversy_cases')
      .select('*')
      .eq('player_id', player.id);

    const allPlayerCases: ControversyCase[] = (allCases || []) as ControversyCase[];
    const cases: ControversyCase[] = allPlayerCases.filter((c) => c.phase !== 'resolved');
    const persistedCasesBySourcePostId = new Set(
      allPlayerCases
        .map((c: any) => String(c?.trigger_details?.source_post_id || ''))
        .filter(Boolean),
    );

    // ── Resolve epicenter city for new controversies ─────────────────────────
    let epicenterCityId: string | null = null;
    try {
      // If player is on tour, use the gig city; otherwise pick their highest-rep city
      const { data: activeTour } = await supabase
        .from('tours').select('id, region').eq('artist_id', player.id).eq('status', 'active').limit(1).maybeSingle();
      if (activeTour) {
        const { data: currentGig } = await supabase
          .from('gigs').select('city').eq('tour_id', activeTour.id).eq('status', 'Booked').order('scheduled_turn', { ascending: true }).limit(1).maybeSingle();
        if (currentGig?.city) {
          const { data: scene } = await supabase.from('city_scenes').select('id').eq('city_name', currentGig.city).maybeSingle();
          if (scene) epicenterCityId = scene.id;
        }
      }
      if (!epicenterCityId) {
        // Fallback: highest reputation city
        const { data: topRep } = await supabase
          .from('player_city_reputation').select('city_id').eq('player_id', player.id).order('reputation_score', { ascending: false }).limit(1).maybeSingle();
        if (topRep) epicenterCityId = topRep.city_id;
      }
    } catch { /* non-critical */ }

    const fallbackEpicenterContext = await loadEpicenterContext(supabase, player.id, epicenterCityId);
    const epicenterScene = fallbackEpicenterContext.scene;

    // ── Load fandom for pillar effects ───────────────────────────────────────
    const { data: fandomRow } = await supabase
      .from('fandoms')
      .select('identity_pillars')
      .eq('player_id', player.id)
      .maybeSingle();

    const pillars: string[] = (fandomRow?.identity_pillars as string[]) || [];
    // Empowerment pillar (formerly activist): 2× controversy recovery
    const controversyRecoveryMult = (pillars.includes('empowerment') || pillars.includes('activist')) ? 2.0 : 1.0;
    // Fashion_culture pillar (formerly diva): +15% controversy severity
    const controversySeverityMult = (pillars.includes('fashion_culture') || pillars.includes('diva')) ? 1.15 : 1.0;
    // Platform spotlight bonus from hype
    const platformSpotlightBonus = N(player?.hype) > 70 ? 0.3 : 0;

    // ── Advance each active case ─────────────────────────────────────────────
    for (const c of cases) {
      const result = advanceControversy(
        c, globalTurnId, platformSpotlightBonus,
        controversyRecoveryMult, controversySeverityMult,
      );

      const caseEpicenterContext = await loadEpicenterContext(supabase, player.id, c.epicenter_city_id || null);
      const cityContext = caseEpicenterContext.scene;
      const currentCityRep = caseEpicenterContext.rep;
      const cityTolerance = Number(cityContext?.controversy_tolerance ?? 0.5);
      const localRepDelta = c.epicenter_city_id
        ? computeControversyRegionalImpact({
            controversySeverity: N(c.severity),
            cityTolerance,
            playerReputation: N(currentCityRep?.reputation_score),
            hasJournalistContact: caseEpicenterContext.hasJournalistContact,
            journalistMitigation: caseEpicenterContext.journalistMitigation,
          })
        : 0;

      if (c.epicenter_city_id) {
        deltas.scene_deltas.city_reputation_upserts.push({
          player_id: player.id,
          city_id: c.epicenter_city_id,
          patch: {
            reputation_score: Math.max(0, N(currentCityRep?.reputation_score) + localRepDelta),
          },
        });
      }

      if (Object.keys(result.patch).length > 0) {
        deltas.controversy_case_updates.push({
          id: c.id,
          patch: result.patch,
        });
      }

      // Accumulate deltas
      deltas.brand_trust_delta += result.brandTrustDelta;
      deltas.fan_morale_delta += result.fanMoraleDelta;

      // Notifications
      for (const notif of result.notifications) {
        deltas.notifications_to_create.push({
          player_id: player.id,
          type: notif.priority === 'critical' ? 'ALERT' : 'HIGHLIGHT',
          title: notif.title,
          subtitle: cityContext?.city_name ? `${notif.subtitle} • ${cityContext.city_name}` : notif.subtitle,
          body: cityContext?.city_name ? `${notif.body} Local impact is centered in ${cityContext.city_name}.` : notif.body,
          is_read: false,
          metrics: { controversy_id: c.id, phase: result.patch.phase || c.phase, epicenter_city_id: c.epicenter_city_id || null, local_rep_delta: localRepDelta },
          idempotency_key: `controversy:${c.id}:${globalTurnId}:${result.events.join(',')}`,
        });
      }

      // Turn events
      for (const evt of result.events) {
        deltas.turn_events.push({
          module: 'controversyTick',
          event_type: `controversy_${evt}`,
          player_id: player.id,
          global_turn_id: globalTurnId,
          deltas: {
            controversy_id: c.id,
            controversy_type: c.controversy_type,
            phase: result.patch.phase || c.phase,
            brand_trust_delta: result.brandTrustDelta,
            fan_morale_delta: result.fanMoraleDelta,
            epicenter_city_id: c.epicenter_city_id || null,
            epicenter_city_name: cityContext?.city_name || null,
            local_reputation_delta: localRepDelta,
            controversy_tolerance: cityTolerance,
          },
        });
      }
    }

    // ── Check for new controversy triggers from recent social posts ───────────
    // Turn-based lookup is authoritative here. Wall-clock windows can miss or
    // double-count posts when turn cadence drifts or workers retry around the hour.
    const postWindowStartTurn = Math.max(0, globalTurnId - 1);
    const { data: recentPosts } = await supabase
      .from('social_posts')
      .select('id, alignment_tag, subtweet_target_id, platform, metadata, global_turn_id, created_turn_index')
      .eq('artist_id', player.id)
      .not('subtweet_target_id', 'is', null)
      .or(`created_turn_index.gte.${postWindowStartTurn},global_turn_id.gte.${postWindowStartTurn}`)
      .limit(5);

    const stagedCasesBySourcePostId = new Set<string>();
    const stagedVerdictsByPostId = new Map<string, Record<string, any>>();

    for (const post of (recentPosts || [])) {
      const evaluation = evaluateControversySourcePost({
        post,
        playerId: player.id,
        globalTurnId,
        playerHype: N(player?.hype),
        playerFollowers: N(player?.fans ?? player?.followers),
        persistedSourceVerdict: (post as any)?.metadata?.controversy_trigger || null,
        stagedSourceVerdict: stagedVerdictsByPostId.get(String(post.id)) || null,
        persistedCasesBySourcePostId,
        stagedCasesBySourcePostId,
        evaluateTrigger: ({ post, playerHype, playerFollowers, seed }) =>
          checkPostControversyTrigger(post, playerHype, playerFollowers, seed),
        buildControversyCase: ({ trigger, post }) =>
          createControversyFromTrigger(
            player.id,
            trigger.type as ControversyType,
            globalTurnId,
            {
              severity: trigger.severity,
              credibility: trigger.credibility,
              memeability: trigger.memeability,
              originator_player_id: post.subtweet_target_id,
              trigger_details: { source_post_id: post.id, platform: post.platform },
            },
          ),
      });

      if (!evaluation) {
        continue;
      }

      deltas.social_post_metadata_updates.push(evaluation.socialPostMetadataUpdate);
      stagedVerdictsByPostId.set(String(post.id), evaluation.verdict);

      if (evaluation.controversyCase) {
        const stagedId = crypto.randomUUID();
        const stagedCase = { ...evaluation.controversyCase, id: stagedId, epicenter_city_id: epicenterCityId };
        deltas.controversy_case_inserts.push(stagedCase);
        stagedCasesBySourcePostId.add(String(post.id));
        deltas.notifications_to_create.push({
          player_id: player.id,
          type: 'ALERT',
          title: 'Controversy Alert!',
          subtitle: epicenterScene?.city_name
            ? `A ${evaluation.verdict.controversy_type?.replace(/_/g, ' ')} just blew up in ${epicenterScene.city_name}`
            : `A ${evaluation.verdict.controversy_type?.replace(/_/g, ' ')} just blew up`,
          body: `Your subtweet just sparked a controversy. Severity: ${evaluation.controversyCase.severity}.${epicenterScene?.city_name ? ` Local fallout is centered in ${epicenterScene.city_name}.` : ''} Respond quickly to minimize damage.`,
          is_read: false,
          metrics: { controversy_id: stagedId, trigger: 'subtweet', epicenter_city_id: epicenterCityId || null, epicenter_city_name: epicenterScene?.city_name || null },
          idempotency_key: `controversy_new:${player.id}:${post.id}:${globalTurnId}`,
        });
        cases.push(stagedCase as ControversyCase);
      }
    }

    // ── Compute controversy signal for other modules ─────────────────────────
    const signal = computeControversySignal(cases);

    // Update controversy shadow on fandom
    if (signal.activeCount > 0) {
      deltas.controversy_shadow = true;
      deltas.controversy_shadow_ticks_remaining = signal.totalActiveTicks + 3; // lingers 3 ticks after
    }

    // Turn event summary
    deltas.turn_events.push({
      module: 'controversyTick',
      event_type: 'controversy_tick',
      player_id: player.id,
      global_turn_id: globalTurnId,
      deltas: {
        active_controversies: signal.activeCount,
        brand_trust_delta: deltas.brand_trust_delta,
        fan_morale_delta: deltas.fan_morale_delta,
        epicenter_city_id: epicenterCityId,
        epicenter_city_name: epicenterScene?.city_name || null,
      },
    });

    return { success: true, deltas, controversySignal: signal };

  } catch (err: any) {
    console.error(`[ControversyTick] Error for ${player.id}:`, err.message);
    return { success: false, deltas };
  }
}
