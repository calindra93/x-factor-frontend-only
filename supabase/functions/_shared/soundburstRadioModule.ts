import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { getStageIndex } from './constants/careerStages.ts';
import { seedRng } from './fandomPhase6.ts';
import { calculateRadioIncome } from './economyMath.ts';

// ─── Constants ──────────────────────────────────────────────────────────

const LISTENER_RECALC_INTERVAL = 7;
const NPC_LISTENER_FLOOR_MULT = 0.5;
const NPC_LISTENER_CEILING_MULT = 3.0;
const PLAYER_SHOW_MIN_LISTENERS = 25;
const PLAYER_SHOW_MAX_LISTENERS = 1500;

const REPUTATION_DECAY_NO_HOST = 5;
const REPUTATION_DECAY_NO_SUBS = 3;
const REPUTATION_DECAY_THRESHOLD = 14;
const TASTEMAKER_REPUTATION_THRESHOLD = 50;

const DISCOVERY_BASE_CHANCE = 0.03;
const DISCOVERY_MAX_CHANCE = 0.12;
const DISCOVERY_IMPRESSION_THRESHOLD = 100;
const DISCOVERY_EVENT_EXPIRY_TURNS = 2;

const IMPRESSION_STAGE_PENALTY_PER_LEVEL = 0.12;
const IMPRESSION_STAGE_PENALTY_FLOOR = 0.40;

// ─── Helpers ────────────────────────────────────────────────────────────

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function N(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildRadioNoActivityEvent(playerId: string, globalTurnId: number, reasonCode: string, metadata: Record<string, any> = {}) {
  return {
    global_turn_id: globalTurnId,
    player_id: playerId,
    module: 'soundburstRadio',
    event_type: 'RADIO_NO_ACTIVITY',
    description: `Soundburst radio had no state change (${reasonCode})`,
    metadata: {
      reason_code: reasonCode,
      ...metadata,
    },
    created_at: new Date().toISOString(),
  };
}

function buildRadioDiscoverySkippedEvent(playerId: string, globalTurnId: number, reasonCode: string, metadata: Record<string, any> = {}) {
  return {
    global_turn_id: globalTurnId,
    player_id: playerId,
    module: 'soundburstRadio',
    event_type: 'RADIO_DISCOVERY_SKIPPED',
    description: `Soundburst discovery did not fire (${reasonCode})`,
    metadata: {
      reason_code: reasonCode,
      ...metadata,
    },
    created_at: new Date().toISOString(),
  };
}

function computeStageImpressionMult(careerStage: string): number {
  const idx = getStageIndex(careerStage);
  if (idx <= 3) return 1.0;
  return Math.max(IMPRESSION_STAGE_PENALTY_FLOOR, 1.0 - (idx - 3) * IMPRESSION_STAGE_PENALTY_PER_LEVEL);
}

// ─── Main Per-Player Processing ─────────────────────────────────────────

export async function processSoundburstRadio(
  player: any,
  _unused: null,
  globalTurnId: number,
  entities: any,
  ctx: any
): Promise<{ success: boolean; deltas?: any; error?: string }> {
  try {
    const emptyDeltas = {
      release_turn_metrics: [],
      soundburst_radio_submission_updates: [],
      turn_events: [],
      notifications_to_create: [],
      soundburst_radio_show_updates: [],
      soundburst_radio_discovery_creates: [],
    };

    const playerActivity = ctx?.runtimeContext?.playerActivity;
    if (playerActivity && !playerActivity.isActive && !playerActivity.inGracePeriod) {
      return { success: true, deltas: emptyDeltas };
    }

    const { data: activeRows, error: activeErr } = await supabaseAdmin
      .from('soundburst_radio_submissions')
      .select('id, show_id, release_id, impressions_per_turn, total_turns_active, expires_turn, status, submission_type')
      .eq('player_id', player.id)
      .in('status', ['accepted', 'pending']);

    if (activeErr) {
      return { success: false, error: `soundburst submissions query failed: ${activeErr.message}` };
    }

    const submissions = activeRows || [];
    if (submissions.length === 0) {
      return {
        success: true,
        deltas: {
          ...emptyDeltas,
          turn_events: [buildRadioNoActivityEvent(player.id, globalTurnId, 'no_radio_submissions')],
        },
      };
    }

    const careerStage = player.career_stage || 'Unknown';
    const stageImpressionMult = computeStageImpressionMult(careerStage);

    const updates: any[] = [];
    const releaseTurnMetrics: any[] = [];
    const turnEvents: any[] = [];
    const notifications: any[] = [];
    const discoveryCreates: any[] = [];

    // Pre-fetch show info for notifications and discovery
    const showIds = [...new Set(submissions.map((s: any) => s.show_id).filter(Boolean))];
    let showMap = new Map<string, any>();
    if (showIds.length > 0) {
      const { data: shows } = await supabaseAdmin
        .from('soundburst_radio_shows')
        .select('id, name, region, show_tier, listener_count')
        .in('id', showIds);
      for (const s of (shows || [])) showMap.set(s.id, s);
    }

    // Pre-fetch release titles for notifications
    const releaseIds = [...new Set(submissions.map((s: any) => s.release_id).filter(Boolean))];
    let releaseMap = new Map<string, any>();
    if (releaseIds.length > 0) {
      const { data: releases } = await supabaseAdmin
        .from('releases')
        .select('id, title, release_name')
        .in('id', releaseIds);
      for (const r of (releases || [])) releaseMap.set(r.id, r);
    }

    let totalImpressionsThisTurn = 0;
    let totalRadioIncomeThisTurn = 0;
    let acceptedCount = 0;
    let pendingCount = 0;
    let discoveryEligibleCount = 0;
    let discoveryThresholdMissCount = 0;
    let discoveryExpiringCount = 0;
    let discoveryStageGateCount = 0;
    let discoveryRollMissCount = 0;

    const { data: hostedShowThisTurn } = await supabaseAdmin
      .from('soundburst_radio_shows')
      .select('id, name, listener_count, last_hosted_turn')
      .eq('host_player_id', player.id)
      .eq('status', 'active')
      .eq('last_hosted_turn', globalTurnId)
      .maybeSingle();

    if (hostedShowThisTurn) {
      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'soundburstRadio',
        event_type: 'RADIO_HOST',
        description: `Hosted episode for ${hostedShowThisTurn.name}`,
        metadata: {
          show_id: hostedShowThisTurn.id,
          show_name: hostedShowThisTurn.name,
        },
        created_at: new Date().toISOString(),
      });

      notifications.push({
        player_id: player.id,
        type: 'RADIO_HOST',
        title: `Episode Hosted: ${hostedShowThisTurn.name}`,
        subtitle: `Your hosted show episode aired this turn`,
        body: `Hosting consistently increases your show reputation and listener retention.`,
        priority: 'medium',
        metrics: {
          show_id: hostedShowThisTurn.id,
          show_name: hostedShowThisTurn.name,
          listener_count: hostedShowThisTurn.listener_count,
        },
        deep_links: [{ label: 'View Radio', route: 'Career', params: { openApp: 'soundburst', tab: 'radio' } }],
        idempotency_key: `radio_host:${player.id}:${hostedShowThisTurn.id}:${globalTurnId}`,
      });
    }

    for (const row of submissions) {
      const expiresTurn = N(row.expires_turn);
      const totalTurnsActive = N(row.total_turns_active);
      const maxDuration = row.submission_type === 'live_recording' ? 7 : 14;
      const nextTurnsActive = totalTurnsActive + 1;
      const shouldExpireNow = (expiresTurn > 0 && expiresTurn <= globalTurnId) || nextTurnsActive >= maxDuration;

      if (row.status === 'pending' && expiresTurn > 0 && expiresTurn <= globalTurnId) {
        updates.push({ id: row.id, patch: { status: 'expired', resolved_turn: globalTurnId } });
        continue;
      }

      if (row.status !== 'accepted') {
        if (row.status === 'pending') pendingCount += 1;
        continue;
      }

      acceptedCount += 1;

      const rawImpressions = Math.floor(N(row.impressions_per_turn));
      const impressionsThisTurn = clamp(0, Math.round(rawImpressions * stageImpressionMult), 10_000_000);

      if (impressionsThisTurn > 0) {
        releaseTurnMetrics.push({
          global_turn_id: globalTurnId,
          release_id: row.release_id,
          artist_id: player.id,
          streams_this_turn: 0,
          paid_streams: 0,
          free_streams: 0,
          video_streams: 0,
          region_streams: {},
          track_sales_units: 0,
          album_sales_units: 0,
          radio_impressions: impressionsThisTurn,
          lifetime_streams: 0,
        });

        totalImpressionsThisTurn += impressionsThisTurn;

        const show = showMap.get(row.show_id);
        totalRadioIncomeThisTurn += calculateRadioIncome(impressionsThisTurn, show?.show_tier || 'underground');

        turnEvents.push({
          global_turn_id: globalTurnId,
          player_id: player.id,
          module: 'soundburstRadio',
          event_type: 'RADIO_AIRPLAY',
          description: `Soundburst airplay generated ${impressionsThisTurn} radio impressions`,
          metadata: {
            submission_id: row.id,
            release_id: row.release_id,
            show_id: row.show_id,
            impressions_this_turn: impressionsThisTurn,
          },
          created_at: new Date().toISOString(),
        });

        if (row.submission_type === 'live_recording') {
          turnEvents.push({
            global_turn_id: globalTurnId,
            player_id: player.id,
            module: 'soundburstRadio',
            event_type: 'RADIO_LIVE_BROADCAST',
            description: `Live recording broadcast generated ${impressionsThisTurn} radio impressions`,
            metadata: {
              submission_id: row.id,
              show_id: row.show_id,
              release_id: row.release_id,
              impressions_this_turn: impressionsThisTurn,
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      updates.push({
        id: row.id,
        patch: {
          total_turns_active: nextTurnsActive,
          ...(shouldExpireNow ? { status: 'expired', resolved_turn: globalTurnId } : {}),
        },
      });

      // ── Discovery Event Check ──────────────────────────────────
      if (
        row.status === 'accepted' &&
        rawImpressions >= DISCOVERY_IMPRESSION_THRESHOLD &&
        !shouldExpireNow
      ) {
        discoveryEligibleCount += 1;
        const stageIdx = getStageIndex(careerStage);
        if (stageIdx > 4) {
          discoveryStageGateCount += 1;
          continue;
        }
        const show = showMap.get(row.show_id);
        const showRegion = show?.region || '';

        // Compute discovery chance — biased toward early career
        const regionReps = player.regional_clout || {};
        const avgRegionRep = N(regionReps[showRegion]);
        const regionBonus = Math.min(0.05, avgRegionRep / 1000);
        const tierBonus = show?.show_tier === 'tastemaker' ? 0.02 : 0;
        // Higher stage = lower chance (inverse bias)
        const stageChanceMult = stageIdx <= 3 ? 1.0 : Math.max(0.2, 1.0 - (stageIdx - 3) * 0.2);
        const totalChance = Math.min(DISCOVERY_MAX_CHANCE, (DISCOVERY_BASE_CHANCE + regionBonus + tierBonus) * stageChanceMult);

        const rng = seedRng(`${player.id}:radio_discovery:${row.id}`, globalTurnId);
        const roll = rng();

        if (roll < totalChance) {
          // Weighted random event type
          const typeRoll = rng();
          let eventType: string;
          if (typeRoll < 0.50) eventType = 'gig_offer';
          else if (typeRoll < 0.80) eventType = 'collab_offer';
          else eventType = 'playlist_feature';

          const releaseInfo = releaseMap.get(row.release_id);
          const releaseTitle = releaseInfo?.title || releaseInfo?.release_name || 'your track';

          discoveryCreates.push({
            player_id: player.id,
            submission_id: row.id,
            event_type: eventType,
            status: 'pending',
            details: {
              show_name: show?.name || 'Unknown Show',
              show_region: showRegion,
              release_title: releaseTitle,
              release_id: row.release_id,
            },
            triggered_turn: globalTurnId,
            expires_turn: globalTurnId + DISCOVERY_EVENT_EXPIRY_TURNS,
          });

          const eventLabels: Record<string, string> = {
            gig_offer: `A venue owner in ${showRegion} heard "${releaseTitle}" on ${show?.name || 'the radio'} and wants to book you!`,
            collab_offer: `A producer heard "${releaseTitle}" on ${show?.name || 'the radio'} and wants to collaborate!`,
            playlist_feature: `A curator is featuring "${releaseTitle}" on a premium Soundburst playlist!`,
          };

          notifications.push({
            player_id: player.id,
            type: 'RADIO_DISCOVERY',
            title: eventType === 'gig_offer' ? 'Gig Offer from Radio!' : eventType === 'collab_offer' ? 'Collab Offer from Radio!' : 'Playlist Feature!',
            subtitle: eventLabels[eventType],
            body: `Your Soundburst Radio airplay caught someone's attention. Check your radio dashboard for details.`,
            priority: 'high',
            metrics: {
              event_type: eventType,
              show_id: row.show_id,
              submission_id: row.id,
              release_id: row.release_id,
              region: showRegion,
            },
            deep_links: [{ label: 'View Radio', route: 'Career', params: { openApp: 'soundburst', tab: 'radio' } }],
            idempotency_key: `radio_discovery:${player.id}:${row.id}:${globalTurnId}`,
          });
        } else {
          discoveryRollMissCount += 1;
        }
      } else if (row.status === 'accepted') {
        if (rawImpressions < DISCOVERY_IMPRESSION_THRESHOLD) {
          discoveryThresholdMissCount += 1;
        } else if (shouldExpireNow) {
          discoveryExpiringCount += 1;
        }
      }
    }

    // Consolidated RADIO_AIRPLAY notification (one per turn, not per submission)
    if (totalImpressionsThisTurn > 0) {
      const acceptedCount = submissions.filter((s: any) => s.status === 'accepted').length;
      notifications.push({
        player_id: player.id,
        type: 'RADIO_AIRPLAY',
        title: `Your music is on air! 📻`,
        subtitle: `${totalImpressionsThisTurn.toLocaleString()} listeners tuned in across ${acceptedCount} show${acceptedCount > 1 ? 's' : ''}`,
        body: `Share on social media with radio tags to boost your reach!`,
        priority: 'medium',
        metrics: {
          total_impressions: totalImpressionsThisTurn,
          active_submissions: acceptedCount,
        },
        deep_links: [
          { label: 'Share on Xpress', route: 'Social', params: { openApp: 'xpress', prefillType: 'radio_shoutout' } },
          { label: 'View Radio', route: 'Career', params: { openApp: 'soundburst', tab: 'radio' } },
        ],
        idempotency_key: `radio_airplay:${player.id}:${globalTurnId}`,
      });
    }

    if (acceptedCount === 0) {
      turnEvents.push(
        buildRadioNoActivityEvent(player.id, globalTurnId, 'no_accepted_radio_submissions', {
          submission_count: submissions.length,
          pending_count: pendingCount,
        })
      );
    } else if (discoveryCreates.length === 0) {
      let reasonCode = 'radio_discovery_not_triggered';
      if (discoveryEligibleCount === 0) {
        reasonCode = discoveryThresholdMissCount > 0
          ? 'radio_discovery_below_impression_threshold'
          : discoveryExpiringCount > 0
            ? 'radio_discovery_expiring_this_turn'
            : 'no_discovery_eligible_submissions';
      } else if (discoveryStageGateCount === discoveryEligibleCount) {
        reasonCode = 'career_stage_ineligible_for_radio_discovery';
      } else if (discoveryRollMissCount === discoveryEligibleCount - discoveryStageGateCount) {
        reasonCode = 'radio_discovery_roll_missed';
      }

      turnEvents.push(
        buildRadioDiscoverySkippedEvent(player.id, globalTurnId, reasonCode, {
          accepted_count: acceptedCount,
          discovery_eligible_count: discoveryEligibleCount,
          below_threshold_count: discoveryThresholdMissCount,
          expiring_count: discoveryExpiringCount,
          stage_gate_count: discoveryStageGateCount,
          roll_miss_count: discoveryRollMissCount,
        })
      );
    }

    return {
      success: true,
      deltas: {
        release_turn_metrics: releaseTurnMetrics,
        soundburst_radio_submission_updates: updates,
        turn_events: turnEvents,
        notifications_to_create: notifications,
        soundburst_radio_show_updates: [],
        soundburst_radio_discovery_creates: discoveryCreates,
        ...(totalRadioIncomeThisTurn > 0 ? { artistProfile: { radio_income_boost: totalRadioIncomeThisTurn } } : {}),
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

// ─── Weekly Show Recalculation (listener counts + reputation) ────────────
// Called once per 7-turn cycle for isFirstPlayer only

export async function recalculateRadioShows(
  globalTurnId: number,
  _entities: any,
  _ctx: any,
): Promise<{ success: boolean; show_updates: any[]; error?: string }> {
  try {
    if (globalTurnId % LISTENER_RECALC_INTERVAL !== 0) {
      return { success: true, show_updates: [] };
    }

    const { data: allShows, error: showsErr } = await supabaseAdmin
      .from('soundburst_radio_shows')
      .select('*')
      .eq('status', 'active');

    if (showsErr || !allShows?.length) {
      return { success: true, show_updates: [] };
    }

    // ── NPC auto-rotation: fetch eligible releases for curated_playlist ──
    const LIFECYCLE_PRIORITY: Record<string, number> = {
      hot: 100, trending: 92, momentum: 84, strongstart: 76, stable: 68,
      Hot: 100, Trending: 92, Momentum: 84, StrongStart: 76, Stable: 68,
    };
    const ELIGIBLE_STATES = ['hot', 'trending', 'momentum', 'strongstart', 'stable',
      'Hot', 'Trending', 'Momentum', 'StrongStart', 'Stable'];
    const CAREER_STAGE_PRIORITY_RADIO: Record<string, number> = {
      Unknown: 100, 'Local Artist': 95, 'Local Buzz': 90, 'Underground Artist': 85,
      'Cult Favorite': 75, 'Breakout Artist': 45, 'Mainstream Artist': 20,
      'A-List Star': 10, 'Global Superstar': 5, 'Legacy Icon': 0,
    };

    const { data: eligibleReleases } = await supabaseAdmin
      .from('releases')
      .select('id, genre, lifecycle_state, artist_id')
      .in('lifecycle_state', ELIGIBLE_STATES)
      .eq('release_status', 'released');

    const eligibleReleasesData = eligibleReleases || [];

    // Fetch career stages for eligible artists
    const eligibleArtistIds = [...new Set(eligibleReleasesData.map((r: any) => r.artist_id).filter(Boolean))];
    let careerStageByArtist = new Map<string, string>();
    if (eligibleArtistIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('players')
        .select('id, career_stage')
        .in('id', eligibleArtistIds);
      for (const p of (profiles || [])) careerStageByArtist.set(p.id, p.career_stage || 'Unknown');
    }

    // Query accepted submissions in the last 7 turns for quality and activity
    const { data: recentSubmissions } = await supabaseAdmin
      .from('soundburst_radio_submissions')
      .select('show_id, status, impressions_per_turn, release_id')
      .in('status', ['accepted'])
      .gte('submitted_turn', globalTurnId - LISTENER_RECALC_INTERVAL);

    // Query social mentions in the last 7 turns by radio alignment tags.
    const windowStartIso = new Date(Date.now() - LISTENER_RECALC_INTERVAL * 60 * 60 * 1000).toISOString();
    const { data: recentRadioPosts } = await supabaseAdmin
      .from('social_posts')
      .select('artist_id, alignment_tag, metadata, created_at')
      .in('alignment_tag', ['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo'])
      .gte('created_at', windowStartIso);

    const submissionsByShow = new Map<string, any[]>();
    for (const sub of (recentSubmissions || [])) {
      if (!submissionsByShow.has(sub.show_id)) submissionsByShow.set(sub.show_id, []);
      submissionsByShow.get(sub.show_id)!.push(sub);
    }

    const activeShowByHost = new Map<string, string>();
    for (const show of allShows) {
      if (show.host_player_id) {
        activeShowByHost.set(show.host_player_id, show.id);
      }
    }

    const socialMentionsByShow = new Map<string, number>();
    for (const post of (recentRadioPosts || [])) {
      const metadata = post?.metadata && typeof post.metadata === 'object' ? post.metadata : {};
      const metadataShowId = (metadata as any)?.show_id ? String((metadata as any).show_id) : null;
      const fallbackShowId = post.artist_id ? activeShowByHost.get(post.artist_id) : null;
      const targetShowId = metadataShowId || fallbackShowId;
      if (!targetShowId) continue;
      socialMentionsByShow.set(targetShowId, (socialMentionsByShow.get(targetShowId) || 0) + 1);
    }

    // Query quality scores of releases on each show
    const releaseIds = [...new Set((recentSubmissions || []).map((s: any) => s.release_id).filter(Boolean))];
    let qualityByRelease = new Map<string, number>();
    if (releaseIds.length > 0) {
      const { data: releases } = await supabaseAdmin
        .from('releases')
        .select('id, quality_score')
        .in('id', releaseIds);
      for (const r of (releases || [])) qualityByRelease.set(r.id, N(r.quality_score));
    }

    // Algorithm mood from global turn_state
    const { data: configRow } = await supabaseAdmin
      .from('turn_state')
      .select('algorithm_mood')
      .eq('id', 1)
      .limit(1)
      .maybeSingle();
    const algorithmMood = configRow?.algorithm_mood || 'neutral';

    const showUpdates: any[] = [];

    for (const show of allShows) {
      const showSubs = submissionsByShow.get(show.id) || [];
      const baseListeners = N(show.base_listener_count) || N(show.listener_count) || 100;
      const repScore = N(show.reputation_score);
      const socialMentions = socialMentionsByShow.get(show.id) || 0;

      // ── Compute listener count multipliers ──
      const reputationMult = 1.0 + Math.min(1.0, repScore / 100);
      const socialMentionMult = 1.0 + Math.min(0.5, socialMentions * 0.05);

      // Submission quality average
      let avgQuality = 0;
      if (showSubs.length > 0) {
        const totalQ = showSubs.reduce((sum, s) => sum + (qualityByRelease.get(s.release_id) || 50), 0);
        avgQuality = totalQ / showSubs.length;
      }
      const qualityMult = 1.0 + Math.min(0.3, avgQuality / 300);

      // Algorithm mood
      let moodMult = 1.0;
      if (algorithmMood === 'underground') moodMult = 1.2;
      else if (algorithmMood === 'experimental') moodMult = 1.1;
      else if (algorithmMood === 'mainstream') moodMult = 0.9;

      // Region activity (simplified — count submissions as a proxy)
      const regionActivityMult = 1.0 + Math.min(0.3, showSubs.length * 0.05);

      let newListenerCount = Math.floor(
        baseListeners * reputationMult * socialMentionMult * qualityMult * moodMult * regionActivityMult
      );

      // Clamp based on show type
      if (show.is_npc) {
        newListenerCount = clamp(
          Math.floor(baseListeners * NPC_LISTENER_FLOOR_MULT),
          newListenerCount,
          Math.floor(baseListeners * NPC_LISTENER_CEILING_MULT),
        );
      } else {
        newListenerCount = clamp(PLAYER_SHOW_MIN_LISTENERS, newListenerCount, PLAYER_SHOW_MAX_LISTENERS);
      }

      // ── Compute reputation (player shows only) ──
      let newReputation = repScore;
      if (!show.is_npc) {
        // Quality inputs (50%)
        const qualityInput = Math.min(20, Math.round(avgQuality / 5));

        // Genre consistency (check if curated tracks match genre_focus)
        const genreFocus = Array.isArray(show.genre_affinity) ? show.genre_affinity : [];
        const genreConsistency = genreFocus.length > 0 ? 15 : 7; // Simplified — full check needs release genres

        // Hosting frequency
        const lastHosted = N(show.last_hosted_turn);
        const turnsSinceHost = lastHosted > 0 ? globalTurnId - lastHosted : REPUTATION_DECAY_THRESHOLD + 1;
        const recentEpisodes = N(show.hosting_frequency);
        const hostingInput = Math.min(15, recentEpisodes * 5);

        // Outcome outputs (50%) — simplified for Phase 1
        // Chart placements would require cross-referencing chart_entries (Phase 2)
        const chartInput = 0;

        // Listener growth
        const prevListeners = N(show.listener_count);
        const growth = prevListeners > 0 ? (newListenerCount - prevListeners) / prevListeners : 0;
        const growthInput = Math.min(15, Math.max(0, Math.round(growth * 100)));

        // Social mentions
        const socialInput = Math.min(15, socialMentions * 3);

        const totalReputation = qualityInput + genreConsistency + hostingInput + chartInput + growthInput + socialInput;

        // Decay
        let decay = 0;
        if (turnsSinceHost > REPUTATION_DECAY_THRESHOLD) decay += REPUTATION_DECAY_NO_HOST;
        if (showSubs.length === 0 && turnsSinceHost > REPUTATION_DECAY_THRESHOLD) decay += REPUTATION_DECAY_NO_SUBS;

        // Apply: weighted blend toward computed value with decay
        newReputation = clamp(0, Math.round(repScore * 0.7 + totalReputation * 0.3) - decay, 100);

        // Tier progression
      }

      const newTier = newReputation >= TASTEMAKER_REPUTATION_THRESHOLD && !show.is_npc ? 'tastemaker' : show.show_tier;

      // ── NPC auto-rotation: rebuild curated_playlist from eligible releases ──
      let newCuratedPlaylist = show.curated_playlist;
      if (show.is_npc && Array.isArray(show.genre_affinity) && show.genre_affinity.length > 0) {
        const genreSet = new Set(show.genre_affinity.map((g: string) => g.toLowerCase()));
        const matched = eligibleReleasesData.filter((r: any) =>
          r.genre && genreSet.has(String(r.genre).toLowerCase())
        );
        matched.sort((a: any, b: any) => {
          const lp = (LIFECYCLE_PRIORITY[a.lifecycle_state] ?? 0) - (LIFECYCLE_PRIORITY[b.lifecycle_state] ?? 0);
          if (lp !== 0) return -lp; // higher lifecycle priority first
          const stageA = CAREER_STAGE_PRIORITY_RADIO[careerStageByArtist.get(a.artist_id) || 'Unknown'] ?? 70;
          const stageB = CAREER_STAGE_PRIORITY_RADIO[careerStageByArtist.get(b.artist_id) || 'Unknown'] ?? 70;
          return stageB - stageA; // higher stage priority (earlier career) first
        });
        newCuratedPlaylist = matched.slice(0, 8).map((r: any) => r.id);
      }

      showUpdates.push({
        id: show.id,
        patch: {
          listener_count: newListenerCount,
          reputation_score: show.is_npc ? repScore : newReputation,
          last_listener_recalc_turn: globalTurnId,
          show_tier: newTier,
          social_mention_count: socialMentions,
          hosting_frequency: 0,    // Reset for next cycle
          curated_playlist: newCuratedPlaylist,
        },
      });
    }

    return { success: true, show_updates: showUpdates };
  } catch (error: any) {
    console.error('[SoundburstRadio] recalculateRadioShows error:', error);
    return { success: false, show_updates: [], error: String(error) };
  }
}
