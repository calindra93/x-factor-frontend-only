import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { getStageIndex } from './constants/careerStages.ts';
import { seedRng } from './fandomPhase6.ts';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CURATOR_RECALC_INTERVAL = 7;

/** Genre-match acceptance rate multiplier when release genre âˆˆ curator genre_focus */
const GENRE_MATCH_ACCEPTANCE_BONUS = 1.35;
/** Genre-mismatch penalty (curator has genre_focus, release doesn't match) */
const GENRE_MISMATCH_ACCEPTANCE_PENALTY = 0.5;

/** Higher career stage â†’ lower acceptance bonus at major curators */
const STAGE_ACCEPTANCE_MULT: Record<string, number> = {
  'Unknown': 0.8, 'Local Artist': 0.85, 'Local Buzz': 0.9, 'Underground Artist': 1.0,
  'Cult Favorite': 1.05, 'Breakout Artist': 1.1, 'Mainstream Artist': 1.15,
  'A-List Star': 1.2, 'Global Superstar': 1.25, 'Legacy Icon': 1.3,
};

/** NPC curators rotate playlists based on eligible release lifecycle states */
const LIFECYCLE_PRIORITY: Record<string, number> = {
  hot: 100, trending: 92, momentum: 84, strongstart: 76, stable: 68,
  Hot: 100, Trending: 92, Momentum: 84, StrongStart: 76, Stable: 68,
};
const ELIGIBLE_STATES = [
  'hot', 'trending', 'momentum', 'strongstart', 'stable',
  'Hot', 'Trending', 'Momentum', 'StrongStart', 'Stable',
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function N(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildEditorialNoActivityEvent(playerId: string, globalTurnId: number, reasonCode: string, metadata: Record<string, any> = {}) {
  return {
    global_turn_id: globalTurnId,
    player_id: playerId,
    module: 'applecoreEditorial',
    event_type: 'EDITORIAL_NO_ACTIVITY',
    description: `AppleCore editorial had no state change (${reasonCode})`,
    metadata: {
      reason_code: reasonCode,
      ...metadata,
    },
    created_at: new Date().toISOString(),
  };
}

// â”€â”€â”€ Main Per-Player Processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function processApplecoreEditorial(
  player: any,
  _unused: null,
  globalTurnId: number,
  entities: any,
  ctx: any
): Promise<{ success: boolean; deltas?: any; error?: string }> {
  try {
    const emptyDeltas = {
      editorial_submission_updates: [],
      turn_events: [],
      notifications_to_create: [],
      interview_slot_updates: [],
      news_items_to_create: [],
    };

    const playerActivity = ctx?.runtimeContext?.playerActivity;
    if (playerActivity && !playerActivity.isActive && !playerActivity.inGracePeriod) {
      return { success: true, deltas: emptyDeltas };
    }

    // â"€â"€ Process interview slots FIRST (independent of editorial submissions) â"€â"€
    const interviewResult = await processInterviewSlots(player, globalTurnId);

    // â”€â”€ Fetch all pending + accepted submissions for this player â”€â”€
    const { data: submissionRows, error: subErr } = await supabaseAdmin
      .from('editorial_submissions')
      .select('id, curator_id, release_id, submitted_turn, status, stream_bonus_multiplier, bonus_active_until_turn, resolved_turn')
      .eq('player_id', player.id)
      .in('status', ['pending', 'accepted']);

    if (subErr) {
      return { success: false, error: `editorial submissions query failed: ${subErr.message}` };
    }

    const submissions = submissionRows || [];
    if (submissions.length === 0) {
      // No editorial submissions, but still return interview results
      return {
        success: true,
        deltas: {
          editorial_submission_updates: [],
          turn_events: [
            ...interviewResult.turnEvents,
            buildEditorialNoActivityEvent(player.id, globalTurnId, 'no_editorial_submissions'),
          ],
          notifications_to_create: [...interviewResult.notificationsToCreate],
          interview_slot_updates: interviewResult.interviewUpdates,
          news_items_to_create: interviewResult.newsItemsToCreate,
        },
      };
    }

    // â”€â”€ Pre-fetch curators â”€â”€
    const curatorIds = [...new Set(submissions.map((s: any) => s.curator_id).filter(Boolean))];
    let curatorMap = new Map<string, any>();
    if (curatorIds.length > 0) {
      const { data: curators } = await supabaseAdmin
        .from('editorial_curators')
        .select('id, platform, name, playlist_slug, genre_focus, tier, min_clout, min_quality, min_release_turns, acceptance_rate, stream_bonus_mult, bonus_duration_turns, cooldown_turns, review_delay_turns')
        .in('id', curatorIds);
      for (const c of (curators || [])) curatorMap.set(c.id, c);
    }

    // â”€â”€ Pre-fetch releases â”€â”€
    const releaseIds = [...new Set(submissions.map((s: any) => s.release_id).filter(Boolean))];
    let releaseMap = new Map<string, any>();
    if (releaseIds.length > 0) {
      const { data: releases } = await supabaseAdmin
        .from('releases')
        .select('id, title, release_name, genre, quality_score, lifecycle_state, release_status, lifecycle_state_changed_turn')
        .in('id', releaseIds);
      for (const r of (releases || [])) releaseMap.set(r.id, r);
    }

    const updates: any[] = [];
    const turnEvents: any[] = [];
    const notifications: any[] = [];
    let pendingReviewCount = 0;
    let activePlacementCount = 0;

    const careerStage = player.career_stage || 'Unknown';
    const playerClout = N(player.clout);

    for (const row of submissions) {
      const curator = curatorMap.get(row.curator_id);
      if (!curator) continue;

      // â”€â”€ 1. PENDING â†’ evaluate after review_delay_turns â”€â”€
      if (row.status === 'pending') {
        const turnsSinceSubmission = globalTurnId - N(row.submitted_turn);
        if (turnsSinceSubmission < N(curator.review_delay_turns)) {
          pendingReviewCount += 1;
          continue; // Still under review
        }

        const release = releaseMap.get(row.release_id);
        const decision = evaluateSubmission(player, release, curator, globalTurnId, careerStage, playerClout);

        if (decision.accepted) {
          const bonusUntil = globalTurnId + N(curator.bonus_duration_turns);
          updates.push({
            id: row.id,
            patch: {
              status: 'accepted',
              resolved_turn: globalTurnId,
              stream_bonus_multiplier: N(curator.stream_bonus_mult),
              bonus_active_until_turn: bonusUntil,
            },
          });

          const releaseName = release?.title || release?.release_name || 'your track';
          turnEvents.push({
            global_turn_id: globalTurnId,
            player_id: player.id,
            module: 'applecoreEditorial',
            event_type: 'EDITORIAL_ACCEPTED',
            description: `"${releaseName}" was added to ${curator.name} (${curator.platform})`,
            metadata: {
              submission_id: row.id,
              release_id: row.release_id,
              curator_id: curator.id,
              curator_name: curator.name,
              platform: curator.platform,
              stream_bonus_mult: N(curator.stream_bonus_mult),
              bonus_duration_turns: N(curator.bonus_duration_turns),
            },
            created_at: new Date().toISOString(),
          });

          notifications.push({
            player_id: player.id,
            type: 'EDITORIAL_ACCEPTED',
            title: `Playlist Placement: ${curator.name}`,
            subtitle: `"${releaseName}" was added to ${curator.name} on ${curator.platform}!`,
            body: `Your streams will receive a ${Math.round((N(curator.stream_bonus_mult) - 1) * 100)}% boost for the next ${N(curator.bonus_duration_turns)} turns.`,
            priority: curator.tier === 'major' ? 'high' : 'medium',
            metrics: {
              curator_id: curator.id,
              curator_name: curator.name,
              platform: curator.platform,
              tier: curator.tier,
              stream_bonus_mult: N(curator.stream_bonus_mult),
              bonus_duration_turns: N(curator.bonus_duration_turns),
            },
            deep_links: [{ label: 'View Release', route: 'Studio', params: { releaseId: row.release_id } }],
            idempotency_key: `editorial_accepted:${player.id}:${row.id}:${globalTurnId}`,
          });
        } else {
          updates.push({
            id: row.id,
            patch: {
              status: 'rejected',
              resolved_turn: globalTurnId,
              rejection_reason: decision.reason,
            },
          });

          const releaseName = release?.title || release?.release_name || 'your track';
          turnEvents.push({
            global_turn_id: globalTurnId,
            player_id: player.id,
            module: 'applecoreEditorial',
            event_type: 'EDITORIAL_REJECTED',
            description: `"${releaseName}" was not selected for ${curator.name} (${curator.platform})`,
            metadata: {
              submission_id: row.id,
              release_id: row.release_id,
              curator_id: curator.id,
              rejection_reason: decision.reason,
            },
            created_at: new Date().toISOString(),
          });

          notifications.push({
            player_id: player.id,
            type: 'EDITORIAL_REJECTED',
            title: `Pitch Declined: ${curator.name}`,
            subtitle: `"${releaseName}" wasn't selected for ${curator.name} this time.`,
            body: rejectionHint(decision.reason, curator),
            priority: 'low',
            metrics: {
              curator_id: curator.id,
              rejection_reason: decision.reason,
            },
            deep_links: [{ label: 'View Release', route: 'Studio', params: { releaseId: row.release_id } }],
            idempotency_key: `editorial_rejected:${player.id}:${row.id}:${globalTurnId}`,
          });
        }
        continue;
      }

      // â”€â”€ 2. ACCEPTED â†’ check if bonus window has expired â”€â”€
      if (row.status === 'accepted') {
        const bonusUntil = N(row.bonus_active_until_turn);
        if (bonusUntil > 0 && globalTurnId > bonusUntil) {
          updates.push({
            id: row.id,
            patch: {
              status: 'expired',
            },
          });

          turnEvents.push({
            global_turn_id: globalTurnId,
            player_id: player.id,
            module: 'applecoreEditorial',
            event_type: 'EDITORIAL_EXPIRED',
            description: `Editorial placement on ${curator.name} has ended`,
            metadata: {
              submission_id: row.id,
              curator_id: curator.id,
              curator_name: curator.name,
            },
            created_at: new Date().toISOString(),
          });
        } else {
          activePlacementCount += 1;
        }
      }
    }

    if (updates.length === 0) {
      let reasonCode = 'no_editorial_state_change';
      if (pendingReviewCount > 0) {
        reasonCode = 'all_submissions_under_review';
      } else if (activePlacementCount > 0) {
        reasonCode = 'editorial_bonus_still_active';
      }

      turnEvents.push(
        buildEditorialNoActivityEvent(player.id, globalTurnId, reasonCode, {
          submission_count: submissions.length,
          pending_review_count: pendingReviewCount,
          active_placement_count: activePlacementCount,
        })
      );
    }


    return {
      success: true,
      deltas: {
        editorial_submission_updates: updates,
        turn_events: [...turnEvents, ...interviewResult.turnEvents],
        notifications_to_create: [...notifications, ...interviewResult.notificationsToCreate],
        interview_slot_updates: interviewResult.interviewUpdates,
        news_items_to_create: interviewResult.newsItemsToCreate,
      },
    };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

// â”€â”€â”€ Submission Evaluation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EvalResult {
  accepted: boolean;
  reason: string;
}

function evaluateSubmission(
  player: any,
  release: any,
  curator: any,
  globalTurnId: number,
  careerStage: string,
  playerClout: number,
): EvalResult {
  // Hard gates
  if (playerClout < N(curator.min_clout)) {
    return { accepted: false, reason: 'min_clout' };
  }

  const qualityScore = N(release?.quality_score);
  if (qualityScore < N(curator.min_quality)) {
    return { accepted: false, reason: 'min_quality' };
  }

  const releaseTurnsLive = release?.lifecycle_state_changed_turn
    ? globalTurnId - N(release.lifecycle_state_changed_turn)
    : 0;
  // Use release age from its first release turn, not lifecycle change
  // For min_release_turns, count turns since release was released
  if (N(curator.min_release_turns) > 0 && releaseTurnsLive < N(curator.min_release_turns)) {
    return { accepted: false, reason: 'min_release_turns' };
  }

  // Genre match check
  const curatorGenres: string[] = Array.isArray(curator.genre_focus) ? curator.genre_focus : [];
  const releaseGenre = String(release?.genre || '').toLowerCase();
  let genreMult = 1.0;

  if (curatorGenres.length > 0) {
    const genreSet = new Set(curatorGenres.map((g: string) => g.toLowerCase()));
    if (releaseGenre && genreSet.has(releaseGenre)) {
      genreMult = GENRE_MATCH_ACCEPTANCE_BONUS;
    } else {
      genreMult = GENRE_MISMATCH_ACCEPTANCE_PENALTY;
    }
  }

  // Career stage multiplier (bigger artists have higher acceptance at major curators)
  const stageMult = STAGE_ACCEPTANCE_MULT[careerStage] ?? 1.0;

  // Quality bonus: higher quality â†’ better chance (linear 0-100 â†’ 0.8-1.2)
  const qualityMult = 0.8 + (qualityScore / 100) * 0.4;

  // Final acceptance probability
  const baseRate = N(curator.acceptance_rate);
  const finalRate = clamp(0.02, baseRate * genreMult * stageMult * qualityMult, 0.95);

  // Seeded RNG for determinism
  const rng = seedRng(`${player.id}:editorial:${curator.id}:${release?.id}`, globalTurnId);
  const roll = rng();

  if (roll >= finalRate) {
    // Distinguish between "close miss" and genre mismatch
    if (genreMult < 1.0) {
      return { accepted: false, reason: 'genre_mismatch' };
    }
    return { accepted: false, reason: 'rng' };
  }

  return { accepted: true, reason: '' };
}

// â”€â”€â”€ Rejection Hint (player-facing flavour text) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rejectionHint(reason: string, curator: any): string {
  switch (reason) {
    case 'min_clout':
      return `${curator.name} is looking for artists with more industry presence. Keep building your reputation!`;
    case 'min_quality':
      return `The production quality didn't quite meet ${curator.name}'s standards. Polish your next release and try again.`;
    case 'min_release_turns':
      return `${curator.name} prefers tracks that have had time to build momentum. Let your release breathe before pitching.`;
    case 'genre_mismatch':
      return `${curator.name} is focused on other genres right now. Try a curator that aligns with your sound.`;
    case 'rng':
    default:
      return `Competition was fierce this cycle. Keep releasing quality music and pitch again after the cooldown.`;
  }
}

// â”€â”€â”€ Weekly NPC Curator Evaluation (playlist rotation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called once per 7-turn cycle for isFirstPlayer only.
// Mirrors soundburstRadioModule.recalculateRadioShows â€” rotates NPC
// editorial curators' implicit playlists based on eligible releases,
// algorithm mood, and recent submission activity.

export async function recalculateEditorialCurators(
  globalTurnId: number,
  _entities: any,
  _ctx: any,
): Promise<{ success: boolean; curator_updates: any[]; error?: string }> {
  try {
    if (globalTurnId % CURATOR_RECALC_INTERVAL !== 0) {
      return { success: true, curator_updates: [] };
    }

    const { data: allCurators, error: curErr } = await supabaseAdmin
      .from('editorial_curators')
      .select('*')
      .eq('active', true);

    if (curErr || !allCurators?.length) {
      return { success: true, curator_updates: [] };
    }

    // â”€â”€ Fetch eligible releases for rotation â”€â”€
    const { data: eligibleReleases } = await supabaseAdmin
      .from('releases')
      .select('id, genre, lifecycle_state, artist_id, quality_score')
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

    // â”€â”€ Recent submission activity per curator â”€â”€
    const { data: recentSubs } = await supabaseAdmin
      .from('editorial_submissions')
      .select('curator_id, status')
      .in('status', ['accepted', 'pending'])
      .gte('submitted_turn', globalTurnId - CURATOR_RECALC_INTERVAL);

    const submissionCountByCurator = new Map<string, number>();
    for (const sub of (recentSubs || [])) {
      submissionCountByCurator.set(sub.curator_id, (submissionCountByCurator.get(sub.curator_id) || 0) + 1);
    }

    // â”€â”€ Algorithm mood â”€â”€
    const { data: configRow } = await supabaseAdmin
      .from('turn_state')
      .select('algorithm_mood')
      .eq('id', 1)
      .limit(1)
      .maybeSingle();
    const algorithmMood = configRow?.algorithm_mood || 'neutral';

    const curatorUpdates: any[] = [];

    // Career stage priority: earlier career = higher priority for emerging curators
    const CAREER_STAGE_PRIORITY: Record<string, number> = {
      'Unknown': 100, 'Local Artist': 95, 'Local Buzz': 90, 'Underground Artist': 85,
      'Cult Favorite': 75, 'Breakout Artist': 55, 'Mainstream Artist': 35,
      'A-List Star': 20, 'Global Superstar': 10, 'Legacy Icon': 5,
    };

    for (const curator of allCurators) {
      const genreFocus: string[] = Array.isArray(curator.genre_focus) ? curator.genre_focus : [];
      const genreSet = new Set(genreFocus.map((g: string) => g.toLowerCase()));

      // Filter eligible releases by genre affinity (if set)
      let matched = eligibleReleasesData;
      if (genreSet.size > 0) {
        matched = matched.filter((r: any) =>
          r.genre && genreSet.has(String(r.genre).toLowerCase())
        );
      }

      // Sort by lifecycle priority, then quality, then career stage fit
      matched.sort((a: any, b: any) => {
        const lp = (LIFECYCLE_PRIORITY[a.lifecycle_state] ?? 0) - (LIFECYCLE_PRIORITY[b.lifecycle_state] ?? 0);
        if (lp !== 0) return -lp;

        const qa = N(a.quality_score) - N(b.quality_score);
        if (qa !== 0) return -qa;

        // For emerging/mid curators, prioritize earlier-career artists
        if (curator.tier !== 'major') {
          const stageA = CAREER_STAGE_PRIORITY[careerStageByArtist.get(a.artist_id) || 'Unknown'] ?? 70;
          const stageB = CAREER_STAGE_PRIORITY[careerStageByArtist.get(b.artist_id) || 'Unknown'] ?? 70;
          return stageB - stageA;
        }
        return 0;
      });

      // Acceptance rate adjustment based on mood + activity
      let adjustedAcceptanceRate = N(curator.acceptance_rate);

      // Mood modulation: experimental mood â†’ curators more open; mainstream â†’ pickier
      if (algorithmMood === 'experimental') adjustedAcceptanceRate *= 1.15;
      else if (algorithmMood === 'underground') adjustedAcceptanceRate *= 1.10;
      else if (algorithmMood === 'mainstream') adjustedAcceptanceRate *= 0.95;
      else if (algorithmMood === 'nostalgic') adjustedAcceptanceRate *= 1.05;

      // High submission volume â†’ slightly pickier (competitive)
      const subCount = submissionCountByCurator.get(curator.id) || 0;
      if (subCount > 5) adjustedAcceptanceRate *= 0.9;

      adjustedAcceptanceRate = clamp(0.02, adjustedAcceptanceRate, 0.95);

      // Build curated playlist (top 8 releases)
      const curatedPlaylist = matched.slice(0, 8).map((r: any) => r.id);

      curatorUpdates.push({
        id: curator.id,
        patch: {
          acceptance_rate: Math.round(adjustedAcceptanceRate * 1000) / 1000,
          // Note: no direct "curated_playlist" column on editorial_curators;
          // the rotation is implicit via the acceptance logic + eligible release pool.
          // We store the last recalc turn for observability.
          updated_at: new Date().toISOString(),
        },
        _meta: {
          curated_playlist: curatedPlaylist,
          algorithm_mood: algorithmMood,
          submission_count: subCount,
        },
      });
    }

    return { success: true, curator_updates: curatorUpdates };
  } catch (error: any) {
    console.error('[ApplecoreEditorial] recalculateEditorialCurators error:', error);
    return { success: false, curator_updates: [], error: String(error) };
  }
}

// â”€â”€â”€ Interview Slots Processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called per-player from processApplecoreEditorial().
// Publishes pending interview slots whose publish_turn has arrived,
// emitting INTERVIEW_PUBLISHED turn_event + news item + notification.
// The turn_event is read by fandomSegmentsSentimentModule (order 4.45)
// to apply per-segment morale boosts.

const INTERVIEW_SLOT_CONFIG: Record<string, { reviewDelay: number; cost: number; newsPriority: number; moraleCore: number; moraleStan: number; moraleCasual: number }> = {
  feature:       { reviewDelay: 3, cost: 2500, newsPriority: 16, moraleCore: 6,  moraleStan: 10, moraleCasual: 3 },
  cover_story:   { reviewDelay: 5, cost: 4000, newsPriority: 22, moraleCore: 9,  moraleStan: 14, moraleCasual: 5 },
  zane_session:  { reviewDelay: 7, cost: 6500, newsPriority: 28, moraleCore: 12, moraleStan: 18, moraleCasual: 7 },
};

export function getInterviewSlotConfig(slotType: string) {
  return INTERVIEW_SLOT_CONFIG[slotType] ?? INTERVIEW_SLOT_CONFIG.feature;
}

export async function processInterviewSlots(
  player: any,
  globalTurnId: number,
): Promise<{ interviewUpdates: any[]; turnEvents: any[]; notificationsToCreate: any[]; newsItemsToCreate: any[] }> {
  const interviewUpdates: any[] = [];
  const turnEvents: any[] = [];
  const notificationsToCreate: any[] = [];
  const newsItemsToCreate: any[] = [];

  try {
    const { data: readySlots, error } = await supabaseAdmin
      .from('applecore_interview_slots')
      .select('id, slot_type, publish_turn, morale_boost_core, morale_boost_stan, morale_boost_casual, news_priority')
      .eq('player_id', player.id)
      .eq('status', 'pending')
      .lte('publish_turn', globalTurnId);

    if (error || !readySlots?.length) return { interviewUpdates, turnEvents, notificationsToCreate, newsItemsToCreate };

    for (const slot of readySlots) {
      interviewUpdates.push({
        id: slot.id,
        patch: {
          status: 'published',
          resolved_turn: globalTurnId,
          cooldown_expires_turn: globalTurnId + 28,
        },
      });

      const slotType = slot.slot_type || 'feature';
      const slotLabel = slotType === 'zane_session' ? 'Zane Session' : slotType === 'cover_story' ? 'Cover Story' : 'Feature';

      // Turn event â€” picked up by fandomSegmentsSentimentModule via runtimeContext
      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'applecoreEditorial',
        event_type: 'INTERVIEW_PUBLISHED',
        description: `AppleCore ${slotLabel} published for ${player.artist_name || player.name}`,
        metadata: {
          slot_id: slot.id,
          slot_type: slotType,
          morale_boost_core: N(slot.morale_boost_core),
          morale_boost_stan: N(slot.morale_boost_stan),
          morale_boost_casual: N(slot.morale_boost_casual),
        },
        created_at: new Date().toISOString(),
      });

      // News item
      newsItemsToCreate.push({
        artist_id: player.id,
        event_type: 'press_feature',
        priority: N(slot.news_priority),
        context: {
          platform: 'AppleCore',
          slot_type: slotType,
          source_label: `AppleCore ${slotLabel}`,
        },
      });

      // Notification
      notificationsToCreate.push({
        player_id: player.id,
        type: 'INTERVIEW_PUBLISHED',
        title: `Your AppleCore ${slotLabel} Is Live`,
        subtitle: `Apple Radio just published your exclusive ${slotLabel.toLowerCase()}.`,
        body: `Fans are reacting â€” expect a morale lift across your core and stan segments over the next few turns.`,
        priority: slotType === 'zane_session' ? 'high' : 'medium',
        metrics: { slot_type: slotType, news_priority: N(slot.news_priority) },
        deep_links: [{ label: 'View on AppleCore', route: 'AppleCoreApp', params: {} }],
        idempotency_key: `interview_published:${player.id}:${slot.id}:${globalTurnId}`,
      });
    }
  } catch (err: any) {
    console.error('[ApplecoreEditorial] processInterviewSlots error:', err);
  }

  return { interviewUpdates, turnEvents, notificationsToCreate, newsItemsToCreate };
}

// â”€â”€â”€ Annual Award Cycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Runs ONCE per in-game year when globalTurnId % 365 === 0.
// Called for isFirstPlayer only (global singleton).
// Nominates top 5 per category, inserts into applecore_awards,
// inserts editorial_submission stream boosts for all nominees,
// emits AWARD_WON turn_events for winners, creates news items + notifications.

const AWARD_CYCLE_INTERVAL = 365;

// "Award Nominee" special curator â€” a seeded sentinel curator_id for award boosts.
// We insert an editorial_submission with a fabricated curator_id using a fixed UUID
// so that turnProcessorCore can apply the stream boost without special-casing.
// The curator row is seeded in the migration as 'applecore_award_nominee' playlist_slug.
const AWARD_CURATOR_SLUG = 'applecore_award_nominee';

export async function processAwardCycle(
  globalTurnId: number,
  supabaseAdmin: any,
): Promise<{
  success: boolean;
  awards_created: number;
  error?: string;
  turn_events?: any[];
  notifications?: any[];
  news_items_to_create?: any[];
  applecore_award_upserts?: any[];
  editorial_submission_creates?: any[];
}> {
  if (globalTurnId % AWARD_CYCLE_INTERVAL !== 0) {
    return { success: true, awards_created: 0 };
  }

  const awardYear = Math.floor(globalTurnId / AWARD_CYCLE_INTERVAL);

  // Idempotency: skip if already ran for this year
  const { data: existing } = await supabaseAdmin
    .from('applecore_awards')
    .select('id')
    .eq('award_year', awardYear)
    .limit(1);
  if (existing?.length) return { success: true, awards_created: 0 };

  try {
    const yearStartTurn = (awardYear - 1) * AWARD_CYCLE_INTERVAL;

    // â”€â”€ Fetch releases from this year â”€â”€
    const { data: releasesThisYear } = await supabaseAdmin
      .from('releases')
      .select('id, artist_id, project_type, quality_score, lifetime_streams, lifecycle_state')
      .gte('scheduled_turn', yearStartTurn)
      .lt('scheduled_turn', globalTurnId)
      .eq('release_status', 'released');

    const releases = releasesThisYear || [];

    // â”€â”€ Fetch all players for career stage data â”€â”€
    const artistIds = [...new Set(releases.map((r: any) => r.artist_id).filter(Boolean))];
    let careerStageByArtist = new Map<string, number>();
    let playerNameByArtist = new Map<string, string>();
    if (artistIds.length > 0) {
      const { data: players } = await supabaseAdmin
        .from('players')
        .select('id, career_stage, artist_name, name')
        .in('id', artistIds);
      for (const p of (players || [])) {
        const stageIdx = getStageIndex(p.career_stage || 'Unknown');
        careerStageByArtist.set(p.id, stageIdx);
        playerNameByArtist.set(p.id, p.artist_name || p.name || 'Unknown');
      }
    }

    // â”€â”€ Fetch award nominee curator id â”€â”€
    const { data: nomineeRow } = await supabaseAdmin
      .from('editorial_curators')
      .select('id, stream_bonus_mult, bonus_duration_turns')
      .eq('playlist_slug', AWARD_CURATOR_SLUG)
      .maybeSingle();
    const nomineeCurator = nomineeRow;

    // â”€â”€ Category: Song of the Year (highest lifetime_streams, single/track) â”€â”€
    const songCandidates = releases
      .filter((r: any) => r.project_type === 'Single' || r.project_type === 'Track' || !r.project_type)
      .sort((a: any, b: any) => N(b.lifetime_streams) - N(a.lifetime_streams));

    // â”€â”€ Category: Album of the Year (highest avg quality_score, album/EP) â”€â”€
    const albumCandidates = releases
      .filter((r: any) => r.project_type === 'Album' || r.project_type === 'EP')
      .sort((a: any, b: any) => N(b.quality_score) - N(a.quality_score));

    // â”€â”€ Category: Artist of the Year (highest quality_score + career_stage delta) â”€â”€
    const artistScoreByPlayer = new Map<string, { score: number; bestReleaseId: string }>();
    for (const r of releases) {
      const stage = careerStageByArtist.get(r.artist_id) ?? 1;
      const score = N(r.quality_score) + stage * 10;
      const prev = artistScoreByPlayer.get(r.artist_id);
      if (!prev || score > prev.score) {
        artistScoreByPlayer.set(r.artist_id, { score, bestReleaseId: r.id });
      }
    }
    const artistCandidates = [...artistScoreByPlayer.entries()]
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, 5)
      .map(([artistId, data]) => ({ artist_id: artistId, release_id: data.bestReleaseId }));

    // â”€â”€ Category: Breakthrough Artist (highest career_stage advancement proxy) â”€â”€
    // Use career_stage Ã— quality_score for artists at stages 2-5 (early-mid)
    const breakthroughCandidates = [...artistScoreByPlayer.entries()]
      .filter(([artistId]) => {
        const stage = careerStageByArtist.get(artistId) ?? 1;
        return stage >= 2 && stage <= 6;
      })
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, 5)
      .map(([artistId, data]) => ({ artist_id: artistId, release_id: data.bestReleaseId }));

    const categoryNominees: Record<string, { artist_id: string; release_id: string | null }[]> = {
      song_of_year: songCandidates.slice(0, 5).map((r: any) => ({ artist_id: r.artist_id, release_id: r.id })),
      album_of_year: albumCandidates.slice(0, 5).map((r: any) => ({ artist_id: r.artist_id, release_id: r.id })),
      artist_of_year: artistCandidates.slice(0, 5),
      breakthrough_artist: breakthroughCandidates.slice(0, 5),
    };

    const awardRows: any[] = [];
    const streamBoostInserts: any[] = [];
    const notificationInserts: any[] = [];
    const newsItems: any[] = [];
    const turnEventInserts: any[] = [];

    for (const [category, nominees] of Object.entries(categoryNominees)) {
      if (!nominees.length) continue;

      nominees.forEach((nom, idx) => {
        const position = idx + 1;
        const isWinner = position === 1;
        const boost = isWinner ? 1.5 : 1.2;
        const duration = isWinner ? 14 : 7;

        awardRows.push({
          award_year: awardYear,
          category,
          player_id: nom.artist_id,
          release_id: nom.release_id || null,
          position,
          stream_boost_multiplier: boost,
          boost_expires_turn: globalTurnId + duration,
          awarded_turn: globalTurnId,
        });

        // Stream boost via editorial_submissions (reuses existing pipeline)
        if (nomineeCurator) {
          streamBoostInserts.push({
            player_id: nom.artist_id,
            release_id: nom.release_id,
            curator_id: nomineeCurator.id,
            submitted_turn: globalTurnId,
            status: 'accepted',
            resolved_turn: globalTurnId,
            stream_bonus_multiplier: boost,
            bonus_active_until_turn: globalTurnId + duration,
          });
        }

        const categoryLabel: Record<string, string> = {
          artist_of_year: 'Artist of the Year',
          album_of_year: 'Album of the Year',
          breakthrough_artist: 'Breakthrough Artist',
          song_of_year: 'Song of the Year',
        };
        const label = categoryLabel[category] || 'Award';
        const artistName = playerNameByArtist.get(nom.artist_id) || 'this artist';

        // Notification
        notificationInserts.push({
          player_id: nom.artist_id,
          type: isWinner ? 'AWARD_WON' : 'AWARD_NOMINATED',
          title: isWinner ? `You Won AppleCore ${label}!` : `AppleCore ${label} Nomination`,
          subtitle: isWinner
            ? `You've been named AppleCore's ${label} for Year ${awardYear}.`
            : `You've been shortlisted for AppleCore ${label}.`,
          body: isWinner
            ? `Your streams will receive a 50% AppleCore boost for the next 14 turns. Congratulations.`
            : `You're in the top 5 for ${label} â€” a meaningful industry recognition.`,
          priority: isWinner ? 'high' : 'medium',
          metrics: { category, position, award_year: awardYear, boost },
          deep_links: [{ label: 'View Awards', route: 'AppleCoreApp', params: { tab: 'awards' } }],
          idempotency_key: `award:${nom.artist_id}:${category}:${awardYear}`,
        });

        // Turn event for winner â†’ fandomSegmentsSentimentModule picks up AWARD_WON
        if (isWinner) {
          turnEventInserts.push({
            global_turn_id: globalTurnId,
            player_id: nom.artist_id,
            module: 'applecoreEditorial',
            event_type: 'AWARD_WON',
            description: `Won AppleCore ${label} for Year ${awardYear}`,
            metadata: { category, award_year: awardYear, artist_name: artistName },
            created_at: new Date().toISOString(),
          });

          // News item for winner
          newsItems.push({ artist_id: nom.artist_id, event_type: 'award_win', priority: 28, category, position: 1, award_year: awardYear });
        }
      });
    }


    // NOTE: All persistence now happens via staged deltas returned below.
    // The commit pipeline handles applecore_award_upserts, editorial_submission_creates,
    // notifications, and turn_events.


    return {
      success: true,
      awards_created: awardRows.length,
      turn_events: turnEventInserts,
      notifications: notificationInserts.map((n: any) => ({
        ...n,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      news_items_to_create: newsItems,
      applecore_award_upserts: awardRows,
      editorial_submission_creates: streamBoostInserts,
    };
  } catch (err: any) {
    console.error('[ApplecoreEditorial] processAwardCycle error:', err);
    return { success: false, awards_created: 0, error: String(err) };
  }
}
