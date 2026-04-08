import { TURN_SCHEDULER, executeTurnModules } from './turnScheduler.ts';
import { buildTurnCompletionUpdate } from './turnEngineState.js';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { processChartsV2ForTurn } from './chartsModule.ts';
import { processCertificationsForTurn } from './certificationModule.ts';
import { processMediaPostsForTurn, generateNPCArtistPost } from './mediaPostGenerator.ts';
import { ECONOMY_DELTA_LARGE_THRESHOLDS } from './constants/economyCaps.ts';
import { postBeefStartedToXpress, postBeefResponseToXpress } from './npcXpressModule.ts';
import { updateSoundMetricsGlobal } from './socialMedia/looptokTickModule.ts';
import { processFestivalGlobalModule } from './festivalGlobalModule.ts';
import { processRemixContestsForTurn } from './remixContestModule.ts';
import { commitSceneDeltas } from './sceneSystemModule.ts';
import { aggregateOpenerTourCredits } from './turnEngineIncomeCredits.ts';
import { processAlgorithmMoodForTurn, type AlgorithmMood } from './algorithmMoodModule.ts';
import { processTrendsForTurn } from './trendEvolutionModule.ts';
import { buildReleasePipelineTelemetryEvent } from './releasePipelineTelemetry.ts';
import { TERMINAL_STATES } from './economyMath.ts';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const LOCK_TOKEN_PREFIX = 'turnengine:';



function generateLockToken() {
  return LOCK_TOKEN_PREFIX + Math.random().toString(36).slice(2, 11) + ':' + Date.now();
}

async function commitStagedSocialPosts(entities: any, socialPosts: any[] = []) {
  await Promise.allSettled(
    (socialPosts || []).map((postPayload: any) =>
      entities.SocialPost.create(postPayload)
        .catch((_: any) => { /* idempotency / non-fatal */ })
    )
  );
}

async function emitReleasePipelineEvent(entities: any, event: Record<string, unknown>) {
  // Intentional direct upsert: these are non-critical observability markers.
  // Failures are logged and must not block turn completion or alter turn outcomes.
  try {
    const { error } = await entities.supabaseClient
      .from('turn_event_log')
      .upsert(event, { onConflict: 'player_id,global_turn_id,module,event_type' });
    if (error) {
      console.warn(`[TurnEngine] release_pipeline event upsert failed (non-fatal): ${error.message}`);
    }
  } catch (e: any) {
    console.warn(`[TurnEngine] release_pipeline event insert threw (non-fatal): ${e?.message || e}`);
  }
}

// Terminal lifecycle states that should have outcome metadata.
// Derived from the canonical TERMINAL_STATES set in economyMath.ts — do NOT fork this list.
const TERMINAL_LIFECYCLE_STATES = Array.from(TERMINAL_STATES);

// Warning prefixes that are informational (batch-tier fallbacks, missing-but-unwritten opener rows)
// and should NOT flip a player's turn status to partial_success.
// Material failures (module_error, v2_rpc, opener_income_write, scene_system, etc.) are NOT listed here
// and will still trigger partial_success.
const INFORMATIONAL_WARNING_PREFIXES = ['batch_', 'opener_income_missing'];

function normalizeWorkerQueueFailureReason(message: string | null | undefined): string {
  const text = String(message || '').toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('stale claim reaped')) return 'stale_claim_reaped';
  if (text.includes('aborterror') || text.includes('timed out') || text.includes('timeout')) return 'dispatch_timeout';
  if (text.includes('http 5')) return 'worker_http_5xx';
  if (text.includes('http 4')) return 'worker_http_4xx';
  if (text.includes('rpc')) return 'commit_rpc_error';
  if (text.includes('claim')) return 'claim_failed';
  if (text.includes('fetch')) return 'dispatch_fetch_failed';
  return 'worker_failed';
}

/**
 * Emits global release-pipeline health counters once per turn.
 *
 * These counters measure global database state — they are NOT per-player metrics.
 * `firstPlayerId` satisfies the turn_event_log.player_id NOT NULL constraint.
 * It serves purely as a DB upsert key; do not interpret it as "this player's data".
 */
async function emitReleasePipelineContradictionCounters(entities: any, globalTurnId: number, firstPlayerId: string) {
  try {
    // Run 5 separate queries for explicit, unambiguous counters:
    // 1. progressed_with_scheduled_project_status: lifecycle != 'Scheduled' AND project_status = 'scheduled'
    // 2. progressed_with_scheduled_release_status: lifecycle != 'Scheduled' AND release_status = 'scheduled'
    // 3. terminal_missing_metadata: terminal lifecycle state AND (final_outcome_class IS NULL OR outcome_evaluated_turn IS NULL OR outcome_evaluated_turn < 0)
    // 4. poisoned_lifecycle_state_changed_turn: lifecycle_state_changed_turn > 10000000 (timestamp-like values)
    // 5. released_song_missing_release_linkage: songs with release_status='released' and no release_id/single_release_id

    const [
      progressedScheduledProjectRes,
      progressedScheduledReleaseRes,
      terminalMissingRes,
      poisonedTurnRes,
      releasedUnlinkedSongsRes,
    ] = await Promise.all([
      // 1. Progressed releases with scheduled project_status
      entities.supabaseClient
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .neq('lifecycle_state', 'Scheduled')
        .eq('project_status', 'scheduled'),

      // 2. Progressed releases with scheduled release_status
      entities.supabaseClient
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .neq('lifecycle_state', 'Scheduled')
        .eq('release_status', 'scheduled'),

      // 3. Terminal releases missing outcome metadata
      // Terminal states should have final_outcome_class AND valid outcome_evaluated_turn (>= 0)
      entities.supabaseClient
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .in('lifecycle_state', TERMINAL_LIFECYCLE_STATES)
        .or('final_outcome_class.is.null,outcome_evaluated_turn.is.null,outcome_evaluated_turn.lt.0'),

      // 4. Poisoned lifecycle_state_changed_turn (timestamp-like values instead of turn numbers)
      entities.supabaseClient
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .gt('lifecycle_state_changed_turn', 10000000),

      // 5. Released songs with no release linkage
      entities.supabaseClient
        .from('songs')
        .select('id', { count: 'exact', head: true })
        .eq('release_status', 'released')
        .is('release_id', null)
        .is('single_release_id', null),
    ]);

    // Check each query for errors before consuming counts.
    // PostgREST returns { count: null, error: {...} } on failure.
    // DO NOT substitute 0 for a failed query — that would emit a fake "no problems found" signal
    // that is indistinguishable from a genuine zero count.
    // Instead: emit count=-1 with query_failed=true so operators can distinguish
    // "query failed" from "zero contradictions found".
    const queryResults = [
      { eventType: 'release_pipeline_counter_progressed_scheduled_project_status', reasonCode: 'progressed_with_scheduled_project_status', res: progressedScheduledProjectRes },
      { eventType: 'release_pipeline_counter_progressed_scheduled_release_status', reasonCode: 'progressed_with_scheduled_release_status', res: progressedScheduledReleaseRes },
      { eventType: 'release_pipeline_counter_terminal_missing_metadata', reasonCode: 'terminal_missing_metadata', res: terminalMissingRes },
      { eventType: 'release_pipeline_counter_poisoned_lifecycle_turn', reasonCode: 'poisoned_lifecycle_state_changed_turn', res: poisonedTurnRes },
      { eventType: 'release_pipeline_counter_released_song_unlinked', reasonCode: 'released_song_missing_release_linkage', res: releasedUnlinkedSongsRes },
    ];

    const counters: Array<{ eventType: string; reasonCode: string; count: number; queryFailed: boolean; queryError?: string }> = queryResults.map(({ eventType, reasonCode, res }) => {
      if (res?.error) {
        console.warn(`[TurnEngine] pipeline counter query failed for ${reasonCode}: ${res.error.message}`);
        return { eventType, reasonCode, count: -1, queryFailed: true, queryError: res.error.message };
      }
      return { eventType, reasonCode, count: Number(res?.count ?? 0), queryFailed: false };
    });

    await Promise.all(
      counters.map((counter) =>
        emitReleasePipelineEvent(
          entities,
          buildReleasePipelineTelemetryEvent({
            eventType: counter.eventType,
            module: 'turnEngine',
            globalTurnId,
            playerId: firstPlayerId,
            reasonCode: counter.reasonCode,
            traceId: `${globalTurnId}:counter:${counter.reasonCode}`,
            description: counter.queryFailed
              ? `Release pipeline counter ${counter.reasonCode} QUERY FAILED: ${counter.queryError}`
              : `Release pipeline counter ${counter.reasonCode}=${counter.count}`,
            metadata: {
              count: counter.queryFailed ? null : counter.count,
              query_failed: counter.queryFailed,
              ...(counter.queryFailed ? { query_error: counter.queryError } : {}),
              is_debug: false,
            },
          }),
        ),
      ),
    );
  } catch (e: any) {
    console.warn(`[TurnEngine] contradiction counter telemetry failed (non-fatal): ${e?.message || e}`);
  }
}

// === TEST SEAMS ===
// These exports are for unit testing only. They expose internal functions
// so tests can verify telemetry behavior without running the full turn engine.
// IMPORTANT: These are NOT part of the public API and should not be used in production code.
// For TERMINAL_LIFECYCLE_STATES, import TERMINAL_STATES from economyMath.ts directly.
export const __test_emitReleasePipelineEvent = emitReleasePipelineEvent;
export const __test_emitReleasePipelineContradictionCounters = emitReleasePipelineContradictionCounters;

async function enrichTurnRecapsWithChartSummaries(
  globalTurnId: number,
  supabaseClient: any,
  chartSummariesByArtist: Record<string, any> = {}
) {
  for (const [artistId, chartSummary] of Object.entries(chartSummariesByArtist || {})) {
    try {
      const { data: existing } = await supabaseClient
        .from('notifications')
        .select('id, metrics')
        .eq('player_id', artistId)
        .eq('global_turn_id', globalTurnId)
        .eq('type', 'TURN_RECAP')
        .maybeSingle();

      if (!existing?.id) continue;

      const metrics = {
        ...(existing.metrics || {}),
        chart_summary: chartSummary,
      };

      const notableMoves = Array.isArray(chartSummary?.top_moves) ? chartSummary.top_moves.length : 0;
      const summaryParts: string[] = [];
      if (Number(chartSummary?.debuts) > 0) summaryParts.push(`${chartSummary.debuts} debut${chartSummary.debuts === 1 ? '' : 's'}`);
      if (Number(chartSummary?.moved_up) > 0) summaryParts.push(`${chartSummary.moved_up} climbed`);
      if (Number(chartSummary?.number_ones) > 0) summaryParts.push(`${chartSummary.number_ones} hit #1`);
      if (notableMoves > 0 && summaryParts.length === 0) summaryParts.push(`${notableMoves} notable move${notableMoves === 1 ? '' : 's'}`);

      await supabaseClient
        .from('notifications')
        .update({
          metrics,
          body: summaryParts.length > 0
            ? `${summaryParts.join(' · ')}. ${(existing.metrics || {}).follower_change != null ? `Fans: +${existing.metrics.follower_change}. ` : ''}Check Charts for details.`
            : undefined,
        })
        .eq('id', existing.id);
    } catch (_) {
      // non-fatal recap enrichment
    }
  }
}

async function acquireLock(entities: any) {
  const now = new Date();
  const lockToken = generateLockToken();
  const lockUntil = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  const turnStates = await entities.TurnState.list('-updated_at', 1);
  if (turnStates.length === 0) {
    const created = await entities.TurnState.create({
      id: 1,
      global_turn_id: 1,
      turn_timestamp: now.toISOString(),
      status: 'processing',
      locked_by: 'turnengine',
      locked_until: lockUntil.toISOString(),
      lock_token: lockToken,
      started_at: now.toISOString(),
      updated_at: now.toISOString()
    });
    return { acquired: true, turnState: created, lockToken };
  }

  const turnState = turnStates[0];
  if (turnState.locked_by && turnState.locked_until && now.getTime() < new Date(turnState.locked_until).getTime()) {
    return { acquired: false, reason: 'locked' };
  }

  await entities.TurnState.update(turnState.id, {
    locked_by: 'turnengine',
    locked_until: lockUntil.toISOString(),
    lock_token: lockToken,
    started_at: now.toISOString(),
    status: 'processing',
    updated_at: now.toISOString()
  });

  return { acquired: true, turnState, lockToken };
}

async function releaseLock(entities: any, turnStateId: any) {
  await entities.TurnState.update(turnStateId, {
    locked_by: null,
    locked_until: null,
    lock_token: null,
    updated_at: new Date().toISOString()
  });
}

async function checkCircuitBreakerAndUnpause(playerId: any, entities: any) {
  const now = new Date();
  const pausedHistory = await entities.PlayerTurnHistory.filter({
    player_id: playerId,
    paused_until: { $gt: now.toISOString() }
  });

  if (pausedHistory.length > 0) {
    return { breaker_open: true, paused_until: pausedHistory[0].paused_until };
  }

  const recentAttempts = await entities.PlayerTurnHistory.filter(
    { player_id: playerId },
    '-created_at',
    CIRCUIT_BREAKER_THRESHOLD
  );

  if (recentAttempts.length >= CIRCUIT_BREAKER_THRESHOLD && recentAttempts.every((h: any) => h.status === 'failed')) {
    return {
      breaker_open: true,
      should_pause_until: new Date(now.getTime() + CIRCUIT_BREAKER_COOLDOWN_MS).toISOString()
    };
  }

  return { breaker_open: false };
}

function hasMeaningfulStagedWork(stagingDeltas: any = {}): boolean {
  if (!stagingDeltas || typeof stagingDeltas !== 'object') return false;

  return Object.entries(stagingDeltas).some(([, value]) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
}

function sanitizeNumericPatch(scope: string, patch: Record<string, any>, player: any): Record<string, any> {
  if (!patch || typeof patch !== 'object') return {};

  const sanitized: Record<string, any> = { ...patch };
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value !== 'number') continue;

    if (!Number.isFinite(value)) {
      console.error(`[OVERFLOW_CLAMP] ${scope}.${key} = ${value} → skipping field for ${player.id} (${player.artist_name})`);
      delete sanitized[key];
      continue;
    }

    if (Math.abs(value) > 2_000_000_000) {
      console.error(`[OVERFLOW_CLAMP] ${scope}.${key} = ${value} → clamping for ${player.id} (${player.artist_name})`);
      sanitized[key] = Math.sign(value) * 2_000_000_000;
      continue;
    }

    if (Math.abs(value) > 1_000_000 || (Math.abs(value) > 0 && Math.abs(value) < 1 && key !== 'algorithmic_boost')) {
      console.error(`[OVERFLOW_DIAG] ${scope}.${key} = ${value} for player ${player.id} (${player.artist_name})`);
    }
  }

  return sanitized;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pre-commit helper: resolve additive boosts and sanitize staged deltas
// Shared between processPlayerTurn (commitOnly) and bulk commit path.
// Mutates stagingDeltas in place (same semantics as original inline code).
// ═══════════════════════════════════════════════════════════════════════════
function resolveAdditiveBoosts(player: any, stagingDeltas: any, result: any, globalTurnId: number) {
  if (Object.keys(stagingDeltas.artistProfile || {}).length > 0) {
    if (stagingDeltas.artistProfile.tour_hype_boost && stagingDeltas.artistProfile.hype != null) {
      stagingDeltas.artistProfile.hype = Math.floor(Math.min(100, stagingDeltas.artistProfile.hype + stagingDeltas.artistProfile.tour_hype_boost));
    }
    delete stagingDeltas.artistProfile.tour_hype_boost;

    if (stagingDeltas.artistProfile.tour_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.tour_income_boost);
    }
    delete stagingDeltas.artistProfile.tour_income_boost;

    if (stagingDeltas.artistProfile.tour_follower_boost && stagingDeltas.artistProfile.followers != null) {
      stagingDeltas.artistProfile.followers = Math.max(0, Math.floor(stagingDeltas.artistProfile.followers + stagingDeltas.artistProfile.tour_follower_boost));
    }
    delete stagingDeltas.artistProfile.tour_follower_boost;

    if (stagingDeltas.artistProfile.tour_clout_boost) {
      if (stagingDeltas.artistProfile.clout != null) {
        stagingDeltas.artistProfile.clout = Math.max(0, Math.min(2_000_000, stagingDeltas.artistProfile.clout + stagingDeltas.artistProfile.tour_clout_boost));
      } else {
        stagingDeltas.artistProfile.clout = Math.max(0, Math.min(2_000_000, (Number(player.clout) || 0) + stagingDeltas.artistProfile.tour_clout_boost));
      }
    }
    delete stagingDeltas.artistProfile.tour_clout_boost;

    if (stagingDeltas.artistProfile.brand_deal_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.brand_deal_income_boost);
    }
    delete stagingDeltas.artistProfile.brand_deal_income_boost;

    if (stagingDeltas.artistProfile.radio_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.radio_income_boost);
    }
    delete stagingDeltas.artistProfile.radio_income_boost;

    if (stagingDeltas.artistProfile.social_income_boost) {
      if (stagingDeltas.artistProfile.income != null) {
        stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.social_income_boost);
      } else {
        stagingDeltas.artistProfile.income = Math.max(0, (Number(player.income) || 0) + stagingDeltas.artistProfile.social_income_boost);
      }
    }
    delete stagingDeltas.artistProfile.social_income_boost;

    if (stagingDeltas.artistProfile.social_follower_boost) {
      if (stagingDeltas.artistProfile.followers != null) {
        stagingDeltas.artistProfile.followers = Math.max(0, Math.floor(stagingDeltas.artistProfile.followers + stagingDeltas.artistProfile.social_follower_boost));
        stagingDeltas.artistProfile.fans = stagingDeltas.artistProfile.followers;
      } else {
        const base = Math.max(0, Math.floor((Number(player.followers) || 0) + stagingDeltas.artistProfile.social_follower_boost));
        stagingDeltas.artistProfile.followers = base;
        stagingDeltas.artistProfile.fans = base;
      }
    }
    delete stagingDeltas.artistProfile.social_follower_boost;

    if (result?.runtimeContext?.playerActivity?.isActive) {
      stagingDeltas.artistProfile.last_active_turn = globalTurnId;
    }

    stagingDeltas.artistProfile = sanitizeNumericPatch('artistProfile', stagingDeltas.artistProfile, player);
  }

  if (Object.keys(stagingDeltas.fanProfile || {}).length > 0) {
    stagingDeltas.fanProfile = sanitizeNumericPatch('fanProfile', stagingDeltas.fanProfile, player);
  }
  if (Object.keys(stagingDeltas.era || {}).length > 0) {
    stagingDeltas.era = sanitizeNumericPatch('era', stagingDeltas.era, player);
  }
}

function mergeReleaseTurnMetricsRows(inputRows: any[]): any[] {
  const merged = new Map<string, any>();
  for (const row of inputRows) {
    const key = `${row.release_id}:${row.global_turn_id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row, region_streams: row.region_streams || {} });
      continue;
    }
    const incomingRegionStreams = row.region_streams || {};
    const mergedRegionStreams = { ...(existing.region_streams || {}) };
    for (const [region, value] of Object.entries(incomingRegionStreams)) {
      mergedRegionStreams[region] = Number(mergedRegionStreams[region] || 0) + Number(value || 0);
    }
    existing.streams_this_turn = Number(existing.streams_this_turn || 0) + Number(row.streams_this_turn || 0);
    existing.paid_streams = Number(existing.paid_streams || 0) + Number(row.paid_streams || 0);
    existing.free_streams = Number(existing.free_streams || 0) + Number(row.free_streams || 0);
    existing.video_streams = Number(existing.video_streams || 0) + Number(row.video_streams || 0);
    existing.track_sales_units = Number(existing.track_sales_units || 0) + Number(row.track_sales_units || 0);
    existing.album_sales_units = Number(existing.album_sales_units || 0) + Number(row.album_sales_units || 0);
    existing.radio_impressions = Number(existing.radio_impressions || 0) + Number(row.radio_impressions || 0);
    existing.lifetime_streams = Math.max(Number(existing.lifetime_streams || 0), Number(row.lifetime_streams || 0));
    existing.region_streams = mergedRegionStreams;
  }
  return [...merged.values()];
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 Commit Pipeline — Pack all staging deltas into a single RPC payload
// Replaces 42+ sequential PostgREST round-trips with one server-side call
// ═══════════════════════════════════════════════════════════════════════════
function packDeltasForCommitV2(
  playerId: string,
  globalTurnId: number,
  stagingDeltas: any,
  runtimeContext: any,
  player: any,
  options: { skipReleaseTier?: boolean, skipFandomTier?: boolean, skipInsertsTier?: boolean },
): { patches: any[], upserts: any[], inserts: any[] } {
  const patches: any[] = [];
  const upserts: any[] = [];
  const inserts: any[] = [];
  const now = new Date().toISOString();

  // ── Core profile patches ──
  if (Object.keys(stagingDeltas.artistProfile || {}).length > 0) {
    patches.push({ table: 'profiles', id: playerId, data: { ...stagingDeltas.artistProfile, updated_at: now } });
  }
  const fanProfileId = runtimeContext?.fanProfile?.id ?? runtimeContext?.fanProfileId;
  if (fanProfileId && Object.keys(stagingDeltas.fanProfile || {}).length > 0) {
    patches.push({ table: 'fan_profiles', id: fanProfileId, data: { ...stagingDeltas.fanProfile, updated_at: now } });
  }
  const eraId = runtimeContext?.activeEra?.id ?? runtimeContext?.activeEraId;
  if (eraId && Object.keys(stagingDeltas.era || {}).length > 0) {
    patches.push({ table: 'eras', id: eraId, data: { ...stagingDeltas.era, updated_at: now } });
  }

  // ── Revenue log upserts ──
  for (const entry of (stagingDeltas.vidwave_ad_revenue_log || [])) {
    upserts.push({ table: 'vidwave_ad_revenue_log', conflict: 'player_id,global_turn_id,post_id', data: entry });
  }
  for (const entry of (stagingDeltas.looptok_revenue_log || [])) {
    upserts.push({ table: 'looptok_revenue_log', conflict: 'player_id,global_turn_id,post_id', data: entry });
  }

  // ── Social accounts ──
  for (const update of (stagingDeltas.social_account_updates || [])) {
    if (update.id) patches.push({ table: 'social_accounts', id: update.id, data: { ...sanitizeNumericPatch('social_account', update.patch || {}, player), updated_at: now } });
  }

  // ── Release tier ──
  if (!options.skipReleaseTier) {
    for (const update of (stagingDeltas.releases_updates || [])) {
      if (update._entity === 'Project') {
        const cleanPatch = sanitizeNumericPatch('project', update.patch || {}, player);
        if (update.id) patches.push({ table: 'projects', id: update.id, data: { ...cleanPatch, updated_at: now } });
      } else {
        const rawPatch = update.patch || {};
        const { _streams_this_turn: _s, _region_streams: _r, ...cleanRawPatch } = rawPatch;
        const cleanPatch = sanitizeNumericPatch('release', cleanRawPatch, player);
        if (update.id) patches.push({ table: 'releases', id: update.id, data: { ...cleanPatch, updated_at: now } });
      }
    }

    // Songs (merge duplicates for same songId)
    const songUpdates = stagingDeltas.songs_updates || [];
    if (songUpdates.length > 0) {
      const merged = new Map<string, any>();
      for (const update of songUpdates) {
        const existing = merged.get(update.id);
        if (!existing) {
          merged.set(update.id, { ...update.patch });
        } else {
          existing.lifetime_streams = Math.max(existing.lifetime_streams || 0, update.patch?.lifetime_streams || 0);
          existing.turn_streams_delta = (existing.turn_streams_delta || 0) + (update.patch?.turn_streams_delta || 0);
          for (const [platform, val] of Object.entries(update.patch?.platform_streams || {})) {
            existing.platform_streams = existing.platform_streams || {};
            existing.platform_streams[platform] = Math.max(existing.platform_streams[platform] || 0, Number(val) || 0);
          }
        }
      }
      for (const [songId, patch] of merged.entries()) {
        patches.push({ table: 'songs', id: songId, data: { ...patch, updated_at: now } });
      }
    }

    // release_turn_metrics (merge then upsert)
    const mergedRtm = mergeReleaseTurnMetricsRows(stagingDeltas.release_turn_metrics || []);
    for (const rtm of mergedRtm) {
      upserts.push({ table: 'release_turn_metrics', conflict: 'release_id,global_turn_id', data: rtm });
    }
  }

  // ── SoundBurst ──
  for (const update of (stagingDeltas.soundburst_radio_submission_updates || [])) {
    if (update.id) patches.push({ table: 'soundburst_radio_submissions', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const update of (stagingDeltas.soundburst_radio_show_updates || [])) {
    if (update.id) patches.push({ table: 'soundburst_radio_shows', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const row of (stagingDeltas.soundburst_radio_discovery_creates || [])) {
    inserts.push({ table: 'soundburst_radio_discovery_events', data: { ...row, created_at: now, updated_at: now } });
  }

  // ── Sample clearance requests ──
  for (const update of (stagingDeltas.sample_request_updates || [])) {
    if (update.id) patches.push({ table: 'sample_requests', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const row of (stagingDeltas.sample_royalty_payment_upserts || [])) {
    upserts.push({ table: 'sample_royalty_payments', conflict: 'sampling_song_id,global_turn_id', data: sanitizeNumericPatch('sample_royalty_payment', row, player) });
  }
  for (const row of (stagingDeltas.sample_achievement_upserts || [])) {
    upserts.push({ table: 'sample_achievements', conflict: 'artist_id,tier', data: sanitizeNumericPatch('sample_achievement', row, player) });
  }

  // ── AppleCore editorial ──
  for (const update of (stagingDeltas.editorial_submission_updates || [])) {
    if (update.id) patches.push({ table: 'editorial_submissions', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const update of (stagingDeltas.editorial_curator_updates || [])) {
    if (update.id) patches.push({ table: 'editorial_curators', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const update of (stagingDeltas.interview_slot_updates || [])) {
    if (update.id) patches.push({ table: 'applecore_interview_slots', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }
  for (const row of (stagingDeltas.applecore_award_upserts || [])) {
    upserts.push({ table: 'applecore_awards', conflict: 'award_year,category,player_id', data: { ...row, created_at: now } });
  }
  for (const row of (stagingDeltas.editorial_submission_creates || [])) {
    inserts.push({ table: 'editorial_submissions', data: { ...row, created_at: now, updated_at: now } });
  }

  // ── Merch / Gigs / Tours ──
  for (const update of (stagingDeltas.merch_updates || [])) {
    if (update.id) patches.push({ table: 'merch', id: update.id, data: { ...sanitizeNumericPatch('merch', update.patch || {}, player), updated_at: now } });
  }
  for (const update of (stagingDeltas.gig_updates || [])) {
    if (update.id) patches.push({ table: 'gigs', id: update.id, data: { ...sanitizeNumericPatch('gig', update.patch || {}, player), updated_at: now } });
  }
  for (const update of (stagingDeltas.tour_updates || [])) {
    if (update.id) patches.push({ table: 'tours', id: update.id, data: { ...sanitizeNumericPatch('tour', update.patch || {}, player), updated_at: now } });
  }

  // ── Tour details ──
  for (const update of (stagingDeltas.tour_event_updates || [])) {
    if (update.id) patches.push({ table: 'tour_events', id: update.id, data: { ...sanitizeNumericPatch('tour_event', update.patch || {}, player), updated_at: now } });
  }
  for (const update of (stagingDeltas.tour_crew_updates || [])) {
    if (update.id) patches.push({ table: 'tour_crew_members', id: update.id, data: { ...sanitizeNumericPatch('tour_crew_update', update.patch || {}, player), updated_at: now } });
  }
  for (const update of (stagingDeltas.tour_sponsorship_updates || [])) {
    if (update.id) patches.push({ table: 'tour_sponsorships', id: update.id, data: { ...sanitizeNumericPatch('tour_sponsorship_update', update.patch || {}, player), updated_at: now } });
  }
  for (const create of (stagingDeltas.tour_choice_event_creates || [])) {
    inserts.push({ table: 'tour_choice_events', data: { ...create, created_at: now } });
  }
  for (const update of (stagingDeltas.tour_choice_event_updates || [])) {
    if (update.id) patches.push({ table: 'tour_choice_events', id: update.id, data: { ...sanitizeNumericPatch('tour_choice_event_update', update.patch || {}, player), updated_at: now } });
  }
  for (const update of (stagingDeltas.tour_opening_act_updates || [])) {
    if (update.id) patches.push({ table: 'tour_opening_acts', id: update.id, data: { ...(update.patch || {}), updated_at: now } });
  }

  // ── News items ──
  if (!options.skipInsertsTier) {
    for (const item of (stagingDeltas.news_items_to_create || [])) {
      inserts.push({ table: 'news_items', data: item });
    }
  }

  // ── Fandom tier ──
  if (!options.skipFandomTier) {
    const phase6Patch = stagingDeltas.fandom_phase6_patch || {};
    const fandomUpdates = stagingDeltas.fandom_updates || [];
    const segmentsPatch = fandomUpdates.find((u: any) => u.player_id === playerId)?.patch || {};
    const mergedFandomPatch = sanitizeNumericPatch('fandom', { ...segmentsPatch, ...phase6Patch }, player);
    if (Object.keys(mergedFandomPatch).length > 0) {
      upserts.push({ table: 'fandoms', conflict: 'player_id', data: { player_id: playerId, ...mergedFandomPatch, updated_at: now } });
    }
    for (const update of fandomUpdates.filter((u: any) => u.player_id !== playerId)) {
      upserts.push({ table: 'fandoms', conflict: 'player_id', data: { player_id: update.player_id, ...sanitizeNumericPatch('fandom_update', update.patch || {}, player) } });
    }
    // Pre-merge heterogeneous patches by (player_id, segment_type) to avoid
    // duplicate upserts where the last-write-wins would lose sentiment or count data.
    const perSegKeyV1 = new Map<string, Record<string, unknown>>();
    for (const seg of (stagingDeltas.fandom_segment_updates || [])) {
      const { player_id, segment_type, ...patch } = seg;
      const key = `${player_id}::${segment_type}`;
      const existing = perSegKeyV1.get(key) || { player_id, segment_type };
      perSegKeyV1.set(key, { ...existing, ...sanitizeNumericPatch(`fandom_segment.${segment_type}`, patch, player) });
    }
    for (const merged of perSegKeyV1.values()) {
      const { player_id, segment_type, ...cleanPatch } = merged as any;
      upserts.push({ table: 'fandom_segments', conflict: 'player_id,segment_type', data: { player_id, segment_type, ...cleanPatch } });
    }
    if (perSegKeyV1.size > 0) {
      console.log(`[CommitPipeline][SegSentiment] player=${playerId} merged=${perSegKeyV1.size} segments=[${Array.from(perSegKeyV1.values()).map((s: any) => `${s.segment_type}:${s.sentiment ?? '-'}`).join(',')}]`);
    }
    if (stagingDeltas.fandom_metrics_snapshot) {
      upserts.push({ table: 'fandom_metrics_snapshots', conflict: 'player_id,tick_number', data: stagingDeltas.fandom_metrics_snapshot });
    }
  }

  // ── Career shadow profile ──
  if (!options.skipInsertsTier && stagingDeltas.career_shadow_profile_upsert) {
    const sanitized = Object.fromEntries(
      Object.entries(stagingDeltas.career_shadow_profile_upsert).filter(([key]) => !key.startsWith('_')),
    );
    upserts.push({ table: 'career_shadow_profiles', conflict: 'player_id', data: sanitized });
  }

  // ── Controversy ──
  for (const update of (stagingDeltas.controversy_case_updates || [])) {
    const patch = sanitizeNumericPatch('controversy_case_update', { ...(update.patch || {}) }, player);
    // NOTE: controversy_cases has no `status` column — lifecycle is tracked via `phase`.
    // The old code synthesized a `status` field that would cause the v2 RPC insert to fail.
    delete patch.status;
    if (update.id) patches.push({ table: 'controversy_cases', id: update.id, data: { ...patch, updated_at: now } });
  }
  for (const row of (stagingDeltas.controversy_case_inserts || [])) {
    const sanitized = sanitizeNumericPatch('controversy_case_insert', { ...row }, player);
    // Remove synthesized `status` — not a real column; phase is the lifecycle signal.
    delete sanitized.status;
    inserts.push({ table: 'controversy_cases', data: sanitized });
  }

  // ── Fan wars / Beefs ──
  for (const update of (stagingDeltas.fan_war_updates || [])) {
    if (update.id) patches.push({ table: 'fan_wars', id: update.id, data: { ...sanitizeNumericPatch('fan_war_update', update.patch || {}, player), updated_at: now } });
  }
  for (const row of (stagingDeltas.fan_war_inserts || [])) {
    inserts.push({ table: 'fan_wars', data: sanitizeNumericPatch('fan_war_insert', row, player) });
  }
  for (const row of (stagingDeltas.fan_war_turn_inserts || [])) {
    inserts.push({ table: 'fan_war_turns', data: sanitizeNumericPatch('fan_war_turn_insert', row, player) });
  }
  for (const row of (stagingDeltas.beef_inserts || [])) {
    inserts.push({ table: 'beefs', data: sanitizeNumericPatch('beef_insert', row, player) });
  }
  for (const update of (stagingDeltas.beef_updates || [])) {
    if (update.id) patches.push({ table: 'beefs', id: update.id, data: { ...sanitizeNumericPatch('beef_update', update.patch || {}, player), updated_at: now } });
  }

  // ── Brand deals ──
  for (const update of (stagingDeltas.brand_deal_updates || [])) {
    if (update.id) patches.push({ table: 'brand_deals', id: update.id, data: { ...sanitizeNumericPatch('brand_deal_update', update.patch || {}, player), updated_at: now } });
  }
  for (const newDeal of (stagingDeltas.brand_deal_creates || [])) {
    inserts.push({ table: 'brand_deals', data: newDeal });
  }
  for (const update of (stagingDeltas.brand_deal_contract_updates || [])) {
    if (update.id) patches.push({ table: 'brand_deal_contracts', id: update.id, data: { ...sanitizeNumericPatch('brand_deal_contract_update', update.patch || {}, player), updated_at: now } });
  }
  for (const payout of (stagingDeltas.brand_deal_payout_log_inserts || [])) {
    const conflictKey = payout?.idempotency_key ? 'idempotency_key' : 'contract_id,turn_id,payout_type';
    upserts.push({ table: 'brand_deal_payout_log', conflict: conflictKey, data: payout });
  }
  for (const statsRow of (stagingDeltas.player_brand_stats_upserts || [])) {
    upserts.push({ table: 'player_brand_stats', conflict: 'artist_id,platform', data: sanitizeNumericPatch('player_brand_stats', statsRow, player) });
  }
  for (const affinityRow of (stagingDeltas.player_brand_affinity_upserts || [])) {
    upserts.push({ table: 'player_brand_affinity', conflict: 'player_id,brand_key', data: sanitizeNumericPatch('player_brand_affinity', affinityRow, player) });
  }

  // ── Turn events (idempotent types as upserts, others as inserts) ──
  const idempotentEventTypes = new Set([
    'SOCIAL_VIRAL_EVENT',
    'SOCIAL_PAYOUT_TICK',
    'BRAND_DEAL_PAYOUT',
    'ECONOMY_DELTA_LARGE',
    'release_pipeline_terminal_fallback',
  ]);
  const validTurnEventCols = new Set(['global_turn_id', 'player_id', 'module', 'event_type', 'description', 'deltas', 'metadata', 'created_at']);
  for (const event of (stagingDeltas.turn_events || [])) {
    if (!event.global_turn_id) event.global_turn_id = globalTurnId;
    if (!event.player_id) event.player_id = playerId;
    if (!event.module) event.module = 'unknown';
    // Strip any fields not in the actual turn_event_log schema
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event)) {
      if (validTurnEventCols.has(k)) sanitized[k] = v;
    }
    if (idempotentEventTypes.has(String(event?.event_type || ''))) {
      upserts.push({ table: 'turn_event_log', conflict: 'player_id,global_turn_id,module,event_type', data: sanitized });
    } else {
      inserts.push({ table: 'turn_event_log', data: sanitized });
    }
  }

  // ── Milestones / Career events / Notifications ──
  for (const m of (stagingDeltas.milestones_to_create || [])) { inserts.push({ table: 'career_milestones', data: m }); }
  for (const e of (stagingDeltas.career_events_to_create || [])) { inserts.push({ table: 'career_events', data: e }); }
  for (const n of (stagingDeltas.notifications_to_create || [])) { inserts.push({ table: 'notifications', data: n }); }

  // ── Social posts ──
  for (const post of (stagingDeltas.social_posts_to_create || [])) { inserts.push({ table: 'social_posts', data: post }); }
  for (const update of (stagingDeltas.social_post_metadata_updates || [])) {
    if (update.id) {
      patches.push({
        table: 'social_posts',
        id: update.id,
        data: { ...(update.patch || {}), updated_at: now },
      });
    }
  }

  // ── Career trends ──
  for (const trend of (stagingDeltas.career_trend_events || [])) {
    upserts.push({ table: 'career_trend_events', conflict: 'player_id,global_turn_id', data: trend });
  }

  // ── LoopTok ──
  for (const state of (stagingDeltas.looptok_creator_state_upserts || [])) {
    upserts.push({ table: 'looptok_creator_state', conflict: 'artist_id', data: state });
  }
  for (const update of (stagingDeltas.looptok_challenge_participation_updates || [])) {
    if (update.id) patches.push({ table: 'looptok_challenge_participation', id: update.id, data: sanitizeNumericPatch('looptok_challenge_participation_update', update.patch || {}, player) });
  }

  return { patches, upserts, inserts };
}

async function processPlayerTurn(
  player: any, globalTurnId: any, entities: any,
  shouldPauseUntil: any = null, engineCtx: any = {},
  executeModules = executeTurnModules,
  options: {
    mode?: 'full' | 'stage' | 'commitOnly',
    stagedPayload?: any,
    skipReleaseTier?: boolean,
    skipFandomTier?: boolean,
    skipInsertsTier?: boolean,
  } = {},
) {
  const mode = options.mode || 'full';
  const startTime = options.stagedPayload?.startTimeMs || Date.now();
  const startedAt = new Date().toISOString();

  // ═══ commitOnly mode: skip module execution, jump straight to commit ═══
  let historyRecord: any;
  let result: any;
  let stagingDeltas: any;

  if (mode === 'commitOnly' && options.stagedPayload) {
    historyRecord = options.stagedPayload.historyRecord;
    result = options.stagedPayload.moduleResult || {};
    stagingDeltas = options.stagedPayload.stagingDeltas || {};
    shouldPauseUntil = options.stagedPayload.shouldPauseUntil ?? shouldPauseUntil;
    // Jump to commit section below
  } else {
    // ═══ full or stage mode: run modules ═══
    try {
      const idempotencyKey = `turn:${globalTurnId}:player:${player.id}:core`;

      // B4: Use prefetched idempotency data if available, else fall back to per-player query
      const prefetchedHistory = engineCtx?.prefetch?.idempotencyByPlayer?.get(player.id);
      let existing: any[];
      if (prefetchedHistory) {
        existing = [prefetchedHistory];
      } else {
        existing = await entities.PlayerTurnHistory.filter({ player_id: player.id, idempotency_key: idempotencyKey });
      }

      if (existing.length > 0) {
        historyRecord = existing[0];
        if (historyRecord.status === 'completed' || historyRecord.status === 'partial_success') {
          return { success: true, skipped: true, reason: 'already_completed' };
        }
        await entities.PlayerTurnHistory.update(historyRecord.id, {
          status: 'started',
          started_at: startedAt,
          attempt_count: (historyRecord.attempt_count || 1) + 1,
          updated_at: new Date().toISOString()
        });
      } else {
        historyRecord = await entities.PlayerTurnHistory.create({
          player_id: player.id,
          global_turn_id: globalTurnId,
          module: 'turnEngine',
          idempotency_key: idempotencyKey,
          status: 'started',
          started_at: startedAt,
          attempt_count: 1,
          paused_until: shouldPauseUntil,
          created_at: startedAt,
          updated_at: startedAt
        });
      }

      const modules = TURN_SCHEDULER.getModuleCadenceForTurn(globalTurnId);
      result = await executeModules(player, globalTurnId, entities, modules, { stageOnly: true, ...engineCtx });

      stagingDeltas = result.deltas || {};

      // ═══ stage mode: return staged payload WITHOUT committing ═══
      if (mode === 'stage') {
        const shouldFailWithoutCommit = !!(result.errors?.length) && !hasMeaningfulStagedWork(stagingDeltas);
        if (shouldFailWithoutCommit) {
          await entities.PlayerTurnHistory.update(historyRecord.id, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            error_message: result.errors[0],
            last_module: result.lastModule || 'unknown',
            deltas_applied: result.deltas || {},
            paused_until: shouldPauseUntil || null,
            updated_at: new Date().toISOString()
          });
          return { success: false, errors: result.errors, deltas: result.deltas };
        }
        return {
          status: 'staged',
          stagedPayload: {
            stagingDeltas,
            historyRecord,
            moduleResult: result,
            shouldPauseUntil,
            startTimeMs: startTime,
          },
        };
      }
    } catch (error) {
      // Re-throw for outer catch to handle
      throw error;
    }
  }

  // ═══ COMMIT SECTION (full mode or commitOnly mode) ═══
  try {
  const shouldFailWithoutCommit = !!(result?.errors?.length) && !hasMeaningfulStagedWork(stagingDeltas);

  if (shouldFailWithoutCommit) {
    await entities.PlayerTurnHistory.update(historyRecord.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_message: result.errors[0],
      last_module: result.lastModule || 'unknown',
      deltas_applied: result.deltas || {},
      paused_until: shouldPauseUntil || null,
      updated_at: new Date().toISOString()
    });
    return { success: false, errors: result.errors, deltas: result.deltas };
  }
  const commitWarnings: string[] = [];
  const recordCommitWarning = (scope: string, detail: string) => {
    const warning = `${scope}: ${detail}`;
    commitWarnings.push(warning);
    console.error(`[TurnEngine][CommitWarning] player=${player.artist_name || player.id} turn=${globalTurnId} ${warning}`);
  };
  const nonFatalQuery = async (query: any, onError?: (error: any) => void) => {
    try {
      await query;
    } catch (error) {
      onError?.(error);
    }
  };

  if (result?.errors?.length) {
    for (const err of result.errors) {
      recordCommitWarning('module_error', err);
    }
  }

  // ═══ Pre-resolve additive boosts (must happen before any commit path) ═══
  if (Object.keys(stagingDeltas.artistProfile || {}).length > 0) {
    // Resolve additive touring deltas into absolute values before writing to DB
    // This prevents later modules from overwriting earlier module values via spread merge
    if (stagingDeltas.artistProfile.tour_hype_boost && stagingDeltas.artistProfile.hype != null) {
      stagingDeltas.artistProfile.hype = Math.floor(Math.min(100, stagingDeltas.artistProfile.hype + stagingDeltas.artistProfile.tour_hype_boost));
    }
    delete stagingDeltas.artistProfile.tour_hype_boost;

    if (stagingDeltas.artistProfile.tour_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.tour_income_boost);
    }
    delete stagingDeltas.artistProfile.tour_income_boost;

    if (stagingDeltas.artistProfile.tour_follower_boost && stagingDeltas.artistProfile.followers != null) {
      stagingDeltas.artistProfile.followers = Math.max(0, Math.floor(stagingDeltas.artistProfile.followers + stagingDeltas.artistProfile.tour_follower_boost));
    }
    delete stagingDeltas.artistProfile.tour_follower_boost;

    // Resolve tour clout boost (additive delta from tour completion consequences)
    if (stagingDeltas.artistProfile.tour_clout_boost) {
      if (stagingDeltas.artistProfile.clout != null) {
        stagingDeltas.artistProfile.clout = Math.max(0, Math.min(2_000_000, stagingDeltas.artistProfile.clout + stagingDeltas.artistProfile.tour_clout_boost));
      } else {
        stagingDeltas.artistProfile.clout = Math.max(0, Math.min(2_000_000, (Number(player.clout) || 0) + stagingDeltas.artistProfile.tour_clout_boost));
      }
    }
    delete stagingDeltas.artistProfile.tour_clout_boost;

    // Resolve brand deal income boost (additive delta from brandDealsModule, same pattern as tour_income_boost)
    if (stagingDeltas.artistProfile.brand_deal_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.brand_deal_income_boost);
    }
    delete stagingDeltas.artistProfile.brand_deal_income_boost;

    // Resolve radio spin income (additive delta from soundburstRadioModule)
    if (stagingDeltas.artistProfile.radio_income_boost && stagingDeltas.artistProfile.income != null) {
      stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.radio_income_boost);
    }
    delete stagingDeltas.artistProfile.radio_income_boost;

    // Resolve social media income and follower boosts (additive deltas from socialMediaModule)
    if (stagingDeltas.artistProfile.social_income_boost) {
      if (stagingDeltas.artistProfile.income != null) {
        stagingDeltas.artistProfile.income = Math.max(0, stagingDeltas.artistProfile.income + stagingDeltas.artistProfile.social_income_boost);
      } else {
        stagingDeltas.artistProfile.income = Math.max(0, (Number(player.income) || 0) + stagingDeltas.artistProfile.social_income_boost);
      }
    }
    delete stagingDeltas.artistProfile.social_income_boost;

    if (stagingDeltas.artistProfile.social_follower_boost) {
      if (stagingDeltas.artistProfile.followers != null) {
        stagingDeltas.artistProfile.followers = Math.max(0, Math.floor(stagingDeltas.artistProfile.followers + stagingDeltas.artistProfile.social_follower_boost));
        stagingDeltas.artistProfile.fans = stagingDeltas.artistProfile.followers;
      } else {
        const base = Math.max(0, Math.floor((Number(player.followers) || 0) + stagingDeltas.artistProfile.social_follower_boost));
        stagingDeltas.artistProfile.followers = base;
        stagingDeltas.artistProfile.fans = base;
      }
    }
    delete stagingDeltas.artistProfile.social_follower_boost;

    // Update last_active_turn if player was active this turn (moved from turnScheduler
    // because stageOnly=true blocks direct writes during module execution)
    if (result?.runtimeContext?.playerActivity?.isActive) {
      stagingDeltas.artistProfile.last_active_turn = globalTurnId;
    }

    // Diagnostic: log any suspiciously large or non-finite values before writing.
    // Also clamp or reject corrupted values so they are never written to the DB.
    stagingDeltas.artistProfile = sanitizeNumericPatch('artistProfile', stagingDeltas.artistProfile, player);
  }

  if (Object.keys(stagingDeltas.fanProfile || {}).length > 0) {
    stagingDeltas.fanProfile = sanitizeNumericPatch('fanProfile', stagingDeltas.fanProfile, player);
  }
  if (Object.keys(stagingDeltas.era || {}).length > 0) {
    stagingDeltas.era = sanitizeNumericPatch('era', stagingDeltas.era, player);
  }

  // ═══ Phase 4: V2 RPC Batch Commit ═══
  // Single server-side RPC replaces 42+ sequential PostgREST round-trips.
  // Pre-commit mutations (xpress events, economy delta) must run before packing.

  // Pre-commit: Xpress event requests → generate NPC social posts to append before packing
  const xpressPostResults = await Promise.allSettled(
    (stagingDeltas.xpress_event_requests || []).map(async (request: any) => {
      try {
        if (request.type === 'beef_started') {
          return await postBeefStartedToXpress(
            request.aggressorName, request.targetName, request.trackTitle, request.globalTurnId,
            { followers: request.followers, hype: request.hype, clout: request.clout, severity: request.severity,
              epicenterCityId: request.epicenterCityId, epicenterCityName: request.epicenterCityName },
          );
        }
        if (request.type === 'beef_response') {
          return await postBeefResponseToXpress(
            request.responderName, request.aggressorName, request.trackTitle, request.globalTurnId,
            { followers: request.followers, hype: request.hype, clout: request.clout, severity: request.severity,
              epicenterCityId: request.epicenterCityId, epicenterCityName: request.epicenterCityName },
          );
        }
        return [];
      } catch (_) { return []; }
    })
  );
  const xpressPostsToCreate = xpressPostResults.flatMap((resultItem: any) =>
    resultItem.status === 'fulfilled' && Array.isArray(resultItem.value) ? resultItem.value : []
  );
  if (xpressPostsToCreate.length > 0) {
    if (!Array.isArray(stagingDeltas.social_posts_to_create)) stagingDeltas.social_posts_to_create = [];
    stagingDeltas.social_posts_to_create.push(...xpressPostsToCreate);
  }

  // Pre-commit: Economy delta large check → append diagnostic event before turn_events are packed
  const nextArtistProfile = stagingDeltas.artistProfile || {};
  const followerDelta = typeof nextArtistProfile.followers === 'number' ? Math.floor(nextArtistProfile.followers - (Number(player.followers) || 0)) : 0;
  const cloutDelta = typeof nextArtistProfile.clout === 'number' ? Math.floor(nextArtistProfile.clout - (Number(player.clout) || 0)) : 0;
  const moneyDelta = typeof nextArtistProfile.income === 'number' ? Math.floor(nextArtistProfile.income - (Number(player.income) || 0)) : 0;
  if (
    followerDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.followers ||
    cloutDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.clout ||
    moneyDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.money
  ) {
    if (!Array.isArray(stagingDeltas.turn_events)) stagingDeltas.turn_events = [];
    stagingDeltas.turn_events.push({
      player_id: player.id,
      global_turn_id: globalTurnId,
      event_type: 'ECONOMY_DELTA_LARGE',
      module: 'turn_engine:economy_delta_large',
      description: 'Large economy delta detected: A single-turn economy grant crossed large-delta thresholds.',
      metadata: {
        idempotency_key: `economy_delta_large:${player.id}:${globalTurnId}`,
        source_module: 'turnEngine.commit',
        thresholds: { followers: ECONOMY_DELTA_LARGE_THRESHOLDS.followers, clout: ECONOMY_DELTA_LARGE_THRESHOLDS.clout, money: ECONOMY_DELTA_LARGE_THRESHOLDS.money },
        breakdown: { followers: followerDelta, clout: cloutDelta, money: moneyDelta },
      },
    });
  }

  if (Array.isArray(stagingDeltas.looptok_revenue_log) && stagingDeltas.looptok_revenue_log.length > 0) {
    if (!stagingDeltas.turn_metrics) stagingDeltas.turn_metrics = {};
    const expectedLoopTokRows = stagingDeltas.looptok_revenue_log.length;
    stagingDeltas.turn_metrics.looptok_revenue_log_expected = expectedLoopTokRows;

    try {
      const { data: previousLoopTokRow, error: previousLoopTokErr } = await entities.supabaseClient
        .from('looptok_revenue_log')
        .select('global_turn_id')
        .eq('player_id', player.id)
        .lt('global_turn_id', globalTurnId)
        .order('global_turn_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousLoopTokErr) {
        console.warn(`[TurnEngine][LoopTokRevenue] Failed to read historical revenue rows for ${player.id}: ${previousLoopTokErr.message}`);
      } else {
        const lastLoggedTurn = Number(previousLoopTokRow?.global_turn_id || 0) || null;
        const noWriteStreak = lastLoggedTurn == null
          ? Math.max(0, globalTurnId - 1)
          : Math.max(0, globalTurnId - lastLoggedTurn - 1);

        stagingDeltas.turn_metrics.looptok_revenue_last_logged_turn = lastLoggedTurn;
        stagingDeltas.turn_metrics.looptok_revenue_no_write_streak = noWriteStreak;

        if (noWriteStreak >= 3) {
          if (!Array.isArray(stagingDeltas.turn_events)) stagingDeltas.turn_events = [];
          stagingDeltas.turn_events.push({
            player_id: player.id,
            global_turn_id: globalTurnId,
            event_type: 'LOOPTOK_REVENUE_ALERT',
            module: 'social_media',
            description: `LoopTok revenue log has a ${noWriteStreak}-turn write gap before turn ${globalTurnId}`,
            metadata: {
              idempotency_key: `looptok_revenue_alert:${player.id}:${globalTurnId}`,
              reason_code: 'no_write_streak',
              last_logged_turn: lastLoggedTurn,
              no_write_streak: noWriteStreak,
              expected_rows_this_turn: expectedLoopTokRows,
            },
          });
          console.warn(`[TurnEngine][LoopTokRevenueAlert] player=${player.id} turn=${globalTurnId} last_logged_turn=${lastLoggedTurn ?? 'none'} no_write_streak=${noWriteStreak}`);
        }
      }
    } catch (loopTokHistoryErr) {
      console.warn(`[TurnEngine][LoopTokRevenue] Historical gap check failed for ${player.id}: ${String(loopTokHistoryErr)}`);
    }
  }

  // Pack all staging deltas into v2 RPC format (patches, upserts, inserts)
  const v2Deltas = packDeltasForCommitV2(
    player.id, globalTurnId, stagingDeltas, result?.runtimeContext || {}, player,
    { skipReleaseTier: !!options?.skipReleaseTier, skipFandomTier: !!options?.skipFandomTier, skipInsertsTier: !!options?.skipInsertsTier },
  );

  const totalV2Ops = v2Deltas.patches.length + v2Deltas.upserts.length + v2Deltas.inserts.length;
  if (totalV2Ops > 0) {
    const { data: rpcResult, error: rpcError } = await entities.supabaseClient.rpc('process_player_turn_commit_v2', {
      p_player_id: player.id,
      p_global_turn_id: globalTurnId,
      p_deltas: v2Deltas,
    });

    if (rpcError) {
      console.error(`[TurnEngine] V2 RPC commit failed for ${player.id}: ${rpcError.message}`);
      recordCommitWarning('v2_rpc', `RPC error: ${rpcError.message}`);
    } else {
      const rpcData = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (rpcData?.errors?.length > 0) {
        for (const err of rpcData.errors) recordCommitWarning('v2_rpc_partial', err);
      }
      console.log(`[TurnEngine] V2 RPC committed ${rpcData?.tables_written || 0} table ops for ${player.id} in ${rpcData?.duration_ms || '?'}ms`);
    }
  }

  if (Array.isArray(stagingDeltas.looptok_revenue_log) && stagingDeltas.looptok_revenue_log.length > 0) {
    try {
      const expectedLoopTokRows = Number(stagingDeltas.turn_metrics?.looptok_revenue_log_expected || 0);
      const { count, error: loopTokReconcileErr } = await entities.supabaseClient
        .from('looptok_revenue_log')
        .select('player_id', { count: 'exact', head: true })
        .eq('player_id', player.id)
        .eq('global_turn_id', globalTurnId);

      if (!stagingDeltas.turn_metrics) stagingDeltas.turn_metrics = {};
      if (loopTokReconcileErr) {
        stagingDeltas.turn_metrics.looptok_revenue_log_reconciled = false;
        console.warn(`[TurnEngine][LoopTokRevenue] Reconciliation query failed for ${player.id} turn ${globalTurnId}: ${loopTokReconcileErr.message}`);
      } else {
        const actualLoopTokRows = Number(count || 0);
        stagingDeltas.turn_metrics.looptok_revenue_log_actual = actualLoopTokRows;
        stagingDeltas.turn_metrics.looptok_revenue_log_reconciled = actualLoopTokRows === expectedLoopTokRows;
        console.log(`[TurnEngine][LoopTokRevenueReconcile] player=${player.id} turn=${globalTurnId} expected=${expectedLoopTokRows} actual=${actualLoopTokRows}`);
        if (actualLoopTokRows !== expectedLoopTokRows) {
          recordCommitWarning('looptok_revenue_reconcile_mismatch', `expected=${expectedLoopTokRows} actual=${actualLoopTokRows}`);
        }
      }
    } catch (loopTokReconcileCatch) {
      console.warn(`[TurnEngine][LoopTokRevenue] Reconciliation failed for ${player.id}: ${String(loopTokReconcileCatch)}`);
    }
  }

  // Post-RPC: Cross-player profile updates (write to OTHER players' rows — can't use per-player RPC)
  await Promise.allSettled(
    (stagingDeltas.artist_profile_updates || []).map((update: any) => {
      const cleanPatch = sanitizeNumericPatch('artist_profile_update', update.patch || {}, player);
      return entities.ArtistProfile.update(update.id, { ...cleanPatch, updated_at: new Date().toISOString() })
        .catch((_e: any) => recordCommitWarning('cross_player_artist', String(_e)));
    })
  );
  await Promise.allSettled(
    (stagingDeltas.fan_profile_updates || []).map(async (update: any) => {
      try {
        const targetFanProfileId = (update.artist_id === player.id
          ? (result?.runtimeContext?.fanProfile?.id ?? result?.runtimeContext?.fanProfileId)
          : null) ?? (await entities.FanProfile.filter({ artist_id: update.artist_id }))?.[0]?.id;
        if (!targetFanProfileId) return;
        const cleanPatch = sanitizeNumericPatch('fan_profile_update', update.patch || {}, player);
        await entities.FanProfile.update(targetFanProfileId, { ...cleanPatch, updated_at: new Date().toISOString() });
      } catch (e) { recordCommitWarning('cross_player_fan', String(e)); }
    })
  );

  // Post-RPC: Credit opener/co-headliner tour income
  // opener_tour_credits staged by touringManager; applied here because it writes to OTHER players' profiles
  if ((stagingDeltas.opener_tour_credits || []).length > 0) {
    const aggregatedCredits = aggregateOpenerTourCredits(stagingDeltas.opener_tour_credits as any[]);
    await Promise.allSettled(
      aggregatedCredits.map(async (credit: any) => {
        try {
          const { data: openerProfile, error: fetchErr } = await entities.supabaseClient
            .from('profiles')
            .select('income')
            .eq('id', credit.opener_id)
            .single();
          if (fetchErr || !openerProfile) {
            recordCommitWarning('opener_income_missing', `opener_id=${credit.opener_id} gig=${credit.gig_id || 'unknown'}`);
            return;
          }
          const newIncome = Math.max(0, (openerProfile.income || 0) + credit.income);
          const { error: updateErr } = await entities.supabaseClient
            .from('profiles')
            .update({ income: newIncome, updated_at: new Date().toISOString() })
            .eq('id', credit.opener_id);
          if (updateErr) {
            recordCommitWarning('opener_income_write', `opener_id=${credit.opener_id}: ${updateErr.message}`);
            return;
          }
          console.log(`[TurnEngine] Opener income credited: ${credit.opener_id} +$${credit.income} (${credit.credit_count} credits, tour=${credit.tour_id || 'unknown'} gig=${credit.gig_id || 'unknown'} turn=${globalTurnId})`);
        } catch (e: any) {
          recordCommitWarning('opener_income_commit', String(e));
        }
      })
    );
  }

  // Post-RPC: LoopTok challenge awards (composite key WHERE clause — can't use v2 patch helper)
  await Promise.allSettled(
    (stagingDeltas.looptok_challenge_awards || []).map((award: any) =>
      nonFatalQuery(
        entities.supabaseClient.from('looptok_challenge_participation').update({
          award_level: award.award_level, reward_applied: true, updated_at: new Date().toISOString(),
        }).eq('challenge_id', award.challenge_id).eq('artist_id', award.artist_id)
      )
    )
  );

  // Post-RPC: Fandom metrics prune (non-blocking fire-and-forget)
  if (!options?.skipFandomTier && stagingDeltas.fandom_metrics_snapshot) {
    (async () => { try { await entities.supabaseClient.rpc('prune_fandom_metrics_snapshots'); } catch { /* non-blocking */ } })();
  }

  // Commit scene system deltas (city reputations, contacts, trending genres, opening act crossover)
  if (stagingDeltas.scene_deltas) {
    try {
      await commitSceneDeltas(stagingDeltas.scene_deltas);
    } catch (sceneErr) {
      recordCommitWarning('scene_system', String(sceneErr));
    }
  }

    const materialWarnings = commitWarnings.filter(
      w => !INFORMATIONAL_WARNING_PREFIXES.some(p => w.startsWith(p))
    );
    const playerTurnStatus = materialWarnings.length > 0 ? 'partial_success' : 'completed';

    await entities.PlayerTurnHistory.update(historyRecord.id, {
      status: playerTurnStatus,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      deltas_applied: commitWarnings.length > 0
        ? { ...stagingDeltas, commit_warnings: commitWarnings }
        : stagingDeltas,
      error_message: commitWarnings.length > 0 ? commitWarnings[0] : null,
      paused_until: null,
      updated_at: new Date().toISOString()
    });

    return {
      success: true,
      skipped: false,
      status: playerTurnStatus,
      deltas: stagingDeltas,
      warnings: commitWarnings,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[TurnEngine] processPlayerTurn fatal for ${player.id}:`, error);
    if (historyRecord?.id) {
      try {
        await entities.PlayerTurnHistory.update(historyRecord.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error_message: errMsg,
          last_module: 'turnEngine.commit',
          paused_until: shouldPauseUntil || null,
          updated_at: new Date().toISOString()
        });
      } catch (historyError) {
        console.error(`[TurnEngine] Failed to persist player turn failure for ${player.id}:`, historyError);
      }
    }
    return { success: false, skipped: false, errors: [errMsg] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Cross-player batch commit — reduces N individual PostgREST calls
// into a small number of batch upserts for releases, fandoms, and inserts.
// ═══════════════════════════════════════════════════════════════════════════
async function commitStagedPlayerBatch(
  stagedEntries: Array<{ player: any, playerEngineCtx: any, stagedPayload: any }>,
  globalTurnId: number,
  entities: any,
  executeModules: any,
  useBulkCommit = false,
) {
  if (!stagedEntries.length) return [];

  // ═══ BATCH RELEASE TIER ═══
  let batchReleaseTierApplied = false;
  const batchWarningMessages: string[] = [];

  try {
    const batchReleaseMap = new Map<string, any>();
    const batchProjectMap = new Map<string, any>();
    const batchRtmInputRows: any[] = [];
    const batchSongRows = new Map<string, any>();

    for (const entry of stagedEntries) {
      const player = entry.player;
      const stagedDeltas = entry.stagedPayload?.stagingDeltas || {};

      // Build lookup of prefetched releases for CHECK constraint fields
      const playerReleases = entry.playerEngineCtx?.prefetch?.releasesByPlayer?.get(player.id) || [];
      const releaseLookup = new Map<string, any>();
      for (const rel of playerReleases) releaseLookup.set(rel.id, rel);

      for (const update of (stagedDeltas.releases_updates || [])) {
        if (update?._entity === 'Project') {
          const cleanPatch = sanitizeNumericPatch('project.batch', update.patch || {}, player);
          const existing = batchProjectMap.get(update.id) || {};
          batchProjectMap.set(update.id, { ...existing, id: update.id, artist_id: player.id, ...cleanPatch, updated_at: new Date().toISOString() });
        } else {
          const { _streams_this_turn: _s, _region_streams: _r, ...rawPatch } = update.patch || {};
          const cleanPatch = sanitizeNumericPatch('release.batch', rawPatch, player);
          // CRITICAL: PostgreSQL NOT NULL columns are evaluated on speculative INSERT
          // BEFORE ON CONFLICT resolution. All NOT NULL columns must be present
          // in every batch row because PostgREST normalizes the column union.
          const existingRelease = releaseLookup.get(update.id);
          const existing = batchReleaseMap.get(update.id);
          const requiredFields: Record<string, any> = {
            artist_id: player.id,
            title: cleanPatch.title ?? existing?.title ?? existingRelease?.title ?? existingRelease?.release_name ?? null,
            lifecycle_state: cleanPatch.lifecycle_state ?? existing?.lifecycle_state ?? existingRelease?.lifecycle_state ?? 'Scheduled',
            lifetime_streams: cleanPatch.lifetime_streams ?? existing?.lifetime_streams ?? existingRelease?.lifetime_streams ?? 0,
            lifetime_revenue: cleanPatch.lifetime_revenue ?? existing?.lifetime_revenue ?? existingRelease?.lifetime_revenue ?? 0,
            platform_streams: cleanPatch.platform_streams ?? existing?.platform_streams ?? existingRelease?.platform_streams ?? {},
            metadata: cleanPatch.metadata ?? existing?.metadata ?? existingRelease?.metadata ?? {},
            platforms: cleanPatch.platforms ?? existing?.platforms ?? existingRelease?.platforms ?? [],
            scheduled_hype_bonus_pct: cleanPatch.scheduled_hype_bonus_pct ?? existing?.scheduled_hype_bonus_pct ?? existingRelease?.scheduled_hype_bonus_pct ?? 0,
            target_regions: cleanPatch.target_regions ?? existing?.target_regions ?? existingRelease?.target_regions ?? [],
            virality_modifier_bonus_pct: cleanPatch.virality_modifier_bonus_pct ?? existing?.virality_modifier_bonus_pct ?? existingRelease?.virality_modifier_bonus_pct ?? 0,
            surprise_drop: cleanPatch.surprise_drop ?? existing?.surprise_drop ?? existingRelease?.surprise_drop ?? false,
            is_diss_track: cleanPatch.is_diss_track ?? existing?.is_diss_track ?? existingRelease?.is_diss_track ?? false,
            hot_phase_streams: cleanPatch.hot_phase_streams ?? existing?.hot_phase_streams ?? existingRelease?.hot_phase_streams ?? 0,
            stable_phase_streams: cleanPatch.stable_phase_streams ?? existing?.stable_phase_streams ?? existingRelease?.stable_phase_streams ?? 0,
          };
          // Merge: cleanPatch first, then requiredFields so integrity fields always win
          batchReleaseMap.set(update.id, { ...(existing || {}), id: update.id, ...cleanPatch, ...requiredFields, updated_at: new Date().toISOString() });
        }
      }

      for (const rtmRow of (stagedDeltas.release_turn_metrics || [])) {
        batchRtmInputRows.push(rtmRow);
      }

      // Collect song updates for batch commit
      for (const update of (stagedDeltas.songs_updates || [])) {
        const existing = batchSongRows.get(update.id);
        if (!existing) {
          batchSongRows.set(update.id, { id: update.id, ...update.patch, updated_at: new Date().toISOString() });
        } else {
          // Merge: accumulate turn_streams_delta, take max lifetime_streams
          existing.lifetime_streams = Math.max(existing.lifetime_streams || 0, update.patch.lifetime_streams || 0);
          existing.turn_streams_delta = (existing.turn_streams_delta || 0) + (update.patch.turn_streams_delta || 0);
          for (const [platform, val] of Object.entries(update.patch.platform_streams || {})) {
            existing.platform_streams = existing.platform_streams || {};
            existing.platform_streams[platform] = Math.max(
              existing.platform_streams[platform] || 0,
              Number(val) || 0
            );
          }
        }
      }
    }

    const batchReleaseOps: Promise<any>[] = [];

    const batchReleaseRows = Array.from(batchReleaseMap.values());
    if (batchReleaseRows.length > 0) {
      batchReleaseOps.push(
        entities.supabaseClient.from('releases')
          .upsert(batchReleaseRows, { onConflict: 'id' })
          .then(({ error }: any) => { if (error) throw new Error(`releases batch upsert: ${error.message}`); })
      );
    }
    const batchProjectRows = Array.from(batchProjectMap.values());
    if (batchProjectRows.length > 0) {
      batchReleaseOps.push(
        entities.supabaseClient.from('projects')
          .upsert(batchProjectRows, { onConflict: 'id' })
          .then(({ error }: any) => { if (error) throw new Error(`projects batch upsert: ${error.message}`); })
      );
    }

    // Batch commit per-track metrics
    const songRowsArray = Array.from(batchSongRows.values());
    if (songRowsArray.length > 0) {
      batchReleaseOps.push(
        entities.supabaseClient.from('songs')
          .upsert(songRowsArray, { onConflict: 'id', ignoreDuplicates: false })
          .then(({ error }: any) => { if (error) console.error(`songs batch upsert: ${error.message}`); })
      );
    }

    const mergedRtmRows = mergeReleaseTurnMetricsRows(batchRtmInputRows);
    if (mergedRtmRows.length > 0) {
      batchReleaseOps.push(
        entities.supabaseClient.from('release_turn_metrics')
          .upsert(mergedRtmRows, { onConflict: 'release_id,global_turn_id' })
          .then(({ error }: any) => { if (error) throw new Error(`rtm batch upsert: ${error.message}`); })
      );
    }

    if (batchReleaseOps.length > 0) {
      await Promise.all(batchReleaseOps);
      batchReleaseTierApplied = true;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    batchWarningMessages.push(`batch_release_tier_fallback: ${errMsg}`);
    console.error(`[TurnEngine][BatchCommit] release-tier failed, falling back: ${errMsg}`);
  }

  // ═══ BATCH FANDOM TIER ═══
  let batchFandomTierApplied = false;
  try {
    const batchFandomSegmentRows: any[] = [];
    const batchFandomMetricsRows: any[] = [];
    const batchFandomUpsertRows: any[] = [];

    for (const entry of stagedEntries) {
      const player = entry.player;
      const stagedDeltas = entry.stagedPayload?.stagingDeltas || {};

      // Pre-merge heterogeneous patches: fandomSegmentsSentimentModule (sentiment)
      // and fandomSegmentsModule (count/loyalty/morale/fatigue) both push to
      // fandom_segment_updates. Sending mixed column sets in one .upsert() causes
      // PostgREST to normalize absent columns to null, violating NOT NULL on sentiment.
      const perSegKey = new Map<string, Record<string, unknown>>();
      for (const seg of (stagedDeltas.fandom_segment_updates || [])) {
        const { player_id, segment_type, ...patch } = seg;
        const key = `${player_id}::${segment_type}`;
        const existing = perSegKey.get(key) || { player_id, segment_type };
        perSegKey.set(key, { ...existing, ...sanitizeNumericPatch(`fandom_segment.${segment_type}`, patch, player) });
      }
      for (const merged of perSegKey.values()) {
        batchFandomSegmentRows.push(merged);
      }
      if (perSegKey.size > 0) {
        console.log(`[CommitV2][SegSentiment] player=${player.id} merged=${perSegKey.size} segments=[${Array.from(perSegKey.values()).map((s: any) => `${s.segment_type}:${s.sentiment ?? '-'}`).join(',')}]`);
      }

      if (stagedDeltas.fandom_metrics_snapshot) {
        batchFandomMetricsRows.push(stagedDeltas.fandom_metrics_snapshot);
      }

      const phase6Patch = stagedDeltas.fandom_phase6_patch || {};
      const fandomUpdates = stagedDeltas.fandom_updates || [];
      const segmentsPatch = fandomUpdates.find((u: any) => u.player_id === player.id)?.patch || {};
      const mergedFandomPatch = sanitizeNumericPatch('fandom', { ...segmentsPatch, ...phase6Patch }, player);
      if (Object.keys(mergedFandomPatch).length > 0) {
        batchFandomUpsertRows.push({ player_id: player.id, ...mergedFandomPatch, updated_at: new Date().toISOString() });
      }
      for (const update of fandomUpdates.filter((u: any) => u.player_id !== player.id)) {
        batchFandomUpsertRows.push({ player_id: update.player_id, ...sanitizeNumericPatch('fandom_update', update.patch || {}, player), updated_at: new Date().toISOString() });
      }
    }

    const batchFandomOps: Promise<any>[] = [];
    if (batchFandomSegmentRows.length > 0) {
      batchFandomOps.push(
        entities.supabaseClient.from('fandom_segments')
          .upsert(batchFandomSegmentRows, { onConflict: 'player_id,segment_type' })
          .then(({ error }: any) => { if (error) throw new Error(`fandom_segments: ${error.message}`); })
      );
    }
    if (batchFandomMetricsRows.length > 0) {
      batchFandomOps.push(
        entities.supabaseClient.from('fandom_metrics_snapshots')
          .upsert(batchFandomMetricsRows, { onConflict: 'player_id,tick_number' })
          .then(({ error }: any) => { if (error) throw new Error(`fandom_metrics: ${error.message}`); })
      );
    }
    if (batchFandomUpsertRows.length > 0) {
      batchFandomOps.push(
        entities.supabaseClient.from('fandoms')
          .upsert(batchFandomUpsertRows, { onConflict: 'player_id' })
          .then(({ error }: any) => { if (error) throw new Error(`fandoms: ${error.message}`); })
      );
    }
    if (batchFandomOps.length > 0) {
      await Promise.all(batchFandomOps);
      batchFandomTierApplied = true;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    batchWarningMessages.push(`batch_fandom_tier_fallback: ${errMsg}`);
    console.error(`[TurnEngine][BatchCommit] fandom-tier failed, falling back: ${errMsg}`);
  }

  // ═══ BATCH INSERTS TIER ═══
  let batchInsertsTierApplied = false;
  try {
    const batchNewsRows: any[] = [];
    const batchShadowProfileRows: any[] = [];

    for (const entry of stagedEntries) {
      const stagedDeltas = entry.stagedPayload?.stagingDeltas || {};
      for (const newsItem of (stagedDeltas.news_items_to_create || [])) batchNewsRows.push(newsItem);
      if (stagedDeltas.career_shadow_profile_upsert) {
        batchShadowProfileRows.push(
          Object.fromEntries(Object.entries(stagedDeltas.career_shadow_profile_upsert).filter(([key]) => !key.startsWith('_')))
        );
      }
    }

    const batchInsertsOps: Promise<any>[] = [];
    if (batchNewsRows.length > 0) {
      batchInsertsOps.push(
        entities.supabaseClient.from('news_items').insert(batchNewsRows)
          .then(({ error }: any) => { if (error) throw new Error(`news_items: ${error.message}`); })
      );
    }
    if (batchShadowProfileRows.length > 0) {
      batchInsertsOps.push(
        entities.supabaseClient.from('career_shadow_profiles')
          .upsert(batchShadowProfileRows, { onConflict: 'player_id' })
          .then(({ error }: any) => { if (error) throw new Error(`shadow_profiles: ${error.message}`); })
      );
    }
    if (batchInsertsOps.length > 0) {
      await Promise.all(batchInsertsOps);
      batchInsertsTierApplied = true;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    batchWarningMessages.push(`batch_inserts_tier_fallback: ${errMsg}`);
    console.error(`[TurnEngine][BatchCommit] inserts-tier failed, falling back: ${errMsg}`);
  }

  // Prune fandom metrics snapshots once per batch (non-blocking)
  if (batchFandomTierApplied) {
    (async () => { try { await entities.supabaseClient.rpc('prune_fandom_metrics_snapshots'); } catch { /* non-blocking */ } })();
  }

  // ═══ BULK COMMIT PATH (worker mode — single RPC for all players) ═══
  if (useBulkCommit) {
    return await commitPlayersBulkRpc(
      stagedEntries, globalTurnId, entities,
      { release: batchReleaseTierApplied, fandom: batchFandomTierApplied, inserts: batchInsertsTierApplied },
      batchWarningMessages,
    );
  }

  // Per-player commit for remaining tables (chunked to avoid overwhelming DB)
  const COMMIT_CHUNK_SIZE = 20;
  const commitResults: any[] = [];
  for (let i = 0; i < stagedEntries.length; i += COMMIT_CHUNK_SIZE) {
    const chunk = stagedEntries.slice(i, i + COMMIT_CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async ({ player, playerEngineCtx, stagedPayload }) => {
        try {
          const commitResult = await processPlayerTurn(
            player, globalTurnId, entities,
            stagedPayload?.shouldPauseUntil ?? null,
            playerEngineCtx, executeModules,
            {
              mode: 'commitOnly',
              stagedPayload,
              skipReleaseTier: batchReleaseTierApplied,
              skipFandomTier: batchFandomTierApplied,
              skipInsertsTier: batchInsertsTierApplied,
            },
          );
          if (commitResult.success) {
            return {
              type: commitResult.skipped ? 'skipped' : 'success',
              player,
              warnings: [...(commitResult.warnings || []), ...batchWarningMessages],
            };
          }
          return { type: 'failed', player, errors: commitResult.errors || ['Deferred commit failed'] };
        } catch (error) {
          return { type: 'failed', player, errors: [error instanceof Error ? error.message : String(error)] };
        }
      })
    );
    commitResults.push(...chunkResults);
  }
  return commitResults;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk commit path — runs pre-commit for all players, packs v2 deltas,
// calls process_player_turn_commit_v2_bulk (one RPC for all players),
// then runs post-commit work and history updates in parallel.
// Falls back to per-player RPC if the bulk function is unavailable.
// ═══════════════════════════════════════════════════════════════════════════
async function commitPlayersBulkRpc(
  stagedEntries: Array<{ player: any, playerEngineCtx: any, stagedPayload: any }>,
  globalTurnId: number,
  entities: any,
  batchTierOpts: { release: boolean, fandom: boolean, inserts: boolean },
  batchWarningMessages: string[],
): Promise<any[]> {
  const commitResults: any[] = [];

  type PreparedEntry = {
    player: any;
    historyRecord: any;
    stagingDeltas: any;
    result: any;
    v2Deltas: { patches: any[]; upserts: any[]; inserts: any[] };
    startTime: number;
    commitWarnings: string[];
    shouldPauseUntil: any;
  };
  const preparedEntries: PreparedEntry[] = [];

  // ── Step 1: Xpress events for all players (async, parallel) ──
  await Promise.allSettled(stagedEntries.map(async ({ stagedPayload }) => {
    const stagingDeltas = stagedPayload?.stagingDeltas || {};
    const xpressPostResults = await Promise.allSettled(
      (stagingDeltas.xpress_event_requests || []).map(async (request: any) => {
        try {
          if (request.type === 'beef_started') {
            return await postBeefStartedToXpress(
              request.aggressorName, request.targetName, request.trackTitle, request.globalTurnId,
              { followers: request.followers, hype: request.hype, clout: request.clout, severity: request.severity,
                epicenterCityId: request.epicenterCityId, epicenterCityName: request.epicenterCityName },
            );
          }
          if (request.type === 'beef_response') {
            return await postBeefResponseToXpress(
              request.responderName, request.aggressorName, request.trackTitle, request.globalTurnId,
              { followers: request.followers, hype: request.hype, clout: request.clout, severity: request.severity,
                epicenterCityId: request.epicenterCityId, epicenterCityName: request.epicenterCityName },
            );
          }
          return [];
        } catch (_) { return []; }
      })
    );
    const xpressPostsToCreate = xpressPostResults.flatMap((r: any) =>
      r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []
    );
    if (xpressPostsToCreate.length > 0) {
      if (!Array.isArray(stagingDeltas.social_posts_to_create)) stagingDeltas.social_posts_to_create = [];
      stagingDeltas.social_posts_to_create.push(...xpressPostsToCreate);
    }
  }));

  // ── Step 2: Pre-commit mutations + pack v2 deltas for all players ──
  for (const entry of stagedEntries) {
    const player = entry.player;
    const result = entry.stagedPayload?.moduleResult || {};
    const stagingDeltas = entry.stagedPayload?.stagingDeltas || {};
    const startTime = entry.stagedPayload?.startTimeMs || Date.now();
    const historyRecord = entry.stagedPayload?.historyRecord;
    const shouldPauseUntil = entry.stagedPayload?.shouldPauseUntil;
    const commitWarnings: string[] = [...batchWarningMessages];

    if (result?.errors?.length) {
      for (const err of result.errors) commitWarnings.push(`module_error: ${err}`);
    }

    const shouldFailWithoutCommit = !!(result?.errors?.length) && !hasMeaningfulStagedWork(stagingDeltas);
    if (shouldFailWithoutCommit) {
      if (historyRecord?.id) {
        try {
          await entities.PlayerTurnHistory.update(historyRecord.id, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
            error_message: result.errors[0],
            last_module: result.lastModule || 'unknown',
            deltas_applied: result.deltas || {},
            paused_until: shouldPauseUntil || null,
            updated_at: new Date().toISOString()
          });
        } catch (_) { /* non-fatal */ }
      }
      commitResults.push({ type: 'failed', player, errors: result.errors || ['stage failed'] });
      continue;
    }

    // Resolve additive boosts + sanitize (shared helper)
    resolveAdditiveBoosts(player, stagingDeltas, result, globalTurnId);

    // Economy delta check → append diagnostic event
    const nextArtistProfile = stagingDeltas.artistProfile || {};
    const followerDelta = typeof nextArtistProfile.followers === 'number' ? Math.floor(nextArtistProfile.followers - (Number(player.followers) || 0)) : 0;
    const cloutDelta = typeof nextArtistProfile.clout === 'number' ? Math.floor(nextArtistProfile.clout - (Number(player.clout) || 0)) : 0;
    const moneyDelta = typeof nextArtistProfile.income === 'number' ? Math.floor(nextArtistProfile.income - (Number(player.income) || 0)) : 0;
    if (
      followerDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.followers ||
      cloutDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.clout ||
      moneyDelta > ECONOMY_DELTA_LARGE_THRESHOLDS.money
    ) {
      if (!Array.isArray(stagingDeltas.turn_events)) stagingDeltas.turn_events = [];
      stagingDeltas.turn_events.push({
        player_id: player.id,
        global_turn_id: globalTurnId,
        event_type: 'ECONOMY_DELTA_LARGE',
        module: 'turn_engine:economy_delta_large',
        description: 'Large economy delta detected: A single-turn economy grant crossed large-delta thresholds.',
        metadata: {
          idempotency_key: `economy_delta_large:${player.id}:${globalTurnId}`,
          source_module: 'turnEngine.bulkCommit',
          thresholds: { followers: ECONOMY_DELTA_LARGE_THRESHOLDS.followers, clout: ECONOMY_DELTA_LARGE_THRESHOLDS.clout, money: ECONOMY_DELTA_LARGE_THRESHOLDS.money },
          breakdown: { followers: followerDelta, clout: cloutDelta, money: moneyDelta },
        },
      });
    }

    // Pack v2 deltas
    const v2Deltas = packDeltasForCommitV2(
      player.id, globalTurnId, stagingDeltas, result?.runtimeContext || {}, player,
      { skipReleaseTier: batchTierOpts.release, skipFandomTier: batchTierOpts.fandom, skipInsertsTier: batchTierOpts.inserts },
    );

    preparedEntries.push({ player, historyRecord, stagingDeltas, result, v2Deltas, startTime, commitWarnings, shouldPauseUntil });
  }

  // ── Step 3: Bulk RPC call (one DB round-trip for all players) ──
  const bulkPayload = preparedEntries
    .filter(e => e.v2Deltas.patches.length + e.v2Deltas.upserts.length + e.v2Deltas.inserts.length > 0)
    .map(e => ({
      player_id: e.player.id,
      global_turn_id: globalTurnId,
      deltas: e.v2Deltas,
    }));

  const bulkRpcResults = new Map<string, any>();
  if (bulkPayload.length > 0) {
    const rpcStart = Date.now();
    const { data: rpcResult, error: rpcError } = await entities.supabaseClient.rpc('process_player_turn_commit_v2_bulk', {
      p_entries: bulkPayload,
    });
    const rpcMs = Date.now() - rpcStart;

    if (rpcError) {
      console.error(`[TurnEngine][BulkCommit] Bulk RPC failed (${rpcError.message}), falling back to per-player RPCs`);
      // Fallback: fire per-player RPCs in parallel
      await Promise.all(preparedEntries.map(async (entry) => {
        const totalOps = entry.v2Deltas.patches.length + entry.v2Deltas.upserts.length + entry.v2Deltas.inserts.length;
        if (totalOps === 0) return;
        try {
          const { data: r, error: e } = await entities.supabaseClient.rpc('process_player_turn_commit_v2', {
            p_player_id: entry.player.id,
            p_global_turn_id: globalTurnId,
            p_deltas: entry.v2Deltas,
          });
          if (e) entry.commitWarnings.push(`v2_rpc_fallback: ${e.message}`);
          else {
            const d = Array.isArray(r) ? r[0] : r;
            if (d?.errors?.length > 0) for (const err of d.errors) entry.commitWarnings.push(`v2_rpc_partial: ${err}`);
            bulkRpcResults.set(entry.player.id, d);
          }
        } catch (err) { entry.commitWarnings.push(`v2_rpc_fallback: ${err}`); }
      }));
    } else {
      const parsed = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      const serverMs = parsed?.total_duration_ms || '?';
      console.log(`[TurnEngine][BulkCommit] Bulk RPC committed ${bulkPayload.length} players in ${serverMs}ms server / ${rpcMs}ms round-trip`);

      for (const pr of (parsed?.results || [])) {
        const playerResult = pr?.result || {};
        bulkRpcResults.set(pr?.player_id, playerResult);
        if (playerResult?.errors?.length > 0) {
          const entry = preparedEntries.find(e => e.player.id === pr?.player_id);
          if (entry) {
            for (const err of playerResult.errors) entry.commitWarnings.push(`v2_rpc_partial: ${err}`);
          }
        }
      }
    }
  }

  // ── Step 4: Post-commit work for all players (parallel) ──
  await Promise.allSettled(preparedEntries.map(async (entry) => {
    const { player, stagingDeltas, result } = entry;

    // Cross-player profile updates (write to OTHER players' rows)
    await Promise.allSettled(
      (stagingDeltas.artist_profile_updates || []).map((update: any) => {
        const cleanPatch = sanitizeNumericPatch('artist_profile_update', update.patch || {}, player);
        return entities.ArtistProfile.update(update.id, { ...cleanPatch, updated_at: new Date().toISOString() })
          .catch((_e: any) => entry.commitWarnings.push(`cross_player_artist: ${_e}`));
      })
    );
    await Promise.allSettled(
      (stagingDeltas.fan_profile_updates || []).map(async (update: any) => {
        try {
          const targetFanProfileId = (update.artist_id === player.id
            ? (result?.runtimeContext?.fanProfile?.id ?? result?.runtimeContext?.fanProfileId)
            : null) ?? (await entities.FanProfile.filter({ artist_id: update.artist_id }))?.[0]?.id;
          if (!targetFanProfileId) return;
          const cleanPatch = sanitizeNumericPatch('fan_profile_update', update.patch || {}, player);
          await entities.FanProfile.update(targetFanProfileId, { ...cleanPatch, updated_at: new Date().toISOString() });
        } catch (e) { entry.commitWarnings.push(`cross_player_fan: ${e}`); }
      })
    );

    // LoopTok challenge awards (composite key WHERE — can't use v2 patch helper)
    await Promise.allSettled(
      (stagingDeltas.looptok_challenge_awards || []).map((award: any) =>
        entities.supabaseClient.from('looptok_challenge_participation').update({
          award_level: award.award_level, reward_applied: true, updated_at: new Date().toISOString(),
        }).eq('challenge_id', award.challenge_id).eq('artist_id', award.artist_id)
          .then(() => {}).catch(() => {})
      )
    );

    // Post-commit: Credit opener/co-headliner tour income (writes to OTHER players' profiles)
    if ((stagingDeltas.opener_tour_credits || []).length > 0) {
      const aggregatedCredits = aggregateOpenerTourCredits(stagingDeltas.opener_tour_credits as any[]);
      await Promise.allSettled(
        aggregatedCredits.map(async (credit: any) => {
          try {
            const { data: openerProfile, error: fetchErr } = await entities.supabaseClient
              .from('profiles')
              .select('income')
              .eq('id', credit.opener_id)
              .single();
            if (fetchErr || !openerProfile) {
              entry.commitWarnings.push(`opener_income_missing: opener_id=${credit.opener_id} gig=${credit.gig_id || 'unknown'}`);
              return;
            }
            const newIncome = Math.max(0, (openerProfile.income || 0) + credit.income);
            const { error: updateErr } = await entities.supabaseClient
              .from('profiles')
              .update({ income: newIncome, updated_at: new Date().toISOString() })
              .eq('id', credit.opener_id);
            if (updateErr) {
              entry.commitWarnings.push(`opener_income_write: opener_id=${credit.opener_id}: ${updateErr.message}`);
              return;
            }
            console.log(`[TurnEngine] Opener income credited: ${credit.opener_id} +$${credit.income} (${credit.credit_count} credits, tour=${credit.tour_id || 'unknown'} gig=${credit.gig_id || 'unknown'})`);
          } catch (e: any) {
            entry.commitWarnings.push(`opener_income_commit: ${String(e)}`);
          }
        })
      );
    }

    // Scene deltas commit
    if (stagingDeltas.scene_deltas) {
      try { await commitSceneDeltas(stagingDeltas.scene_deltas); }
      catch (sceneErr) { entry.commitWarnings.push(`scene_system: ${sceneErr}`); }
    }
  }));

  // ── Step 5: Update history records + collect final results (parallel) ──
  await Promise.all(preparedEntries.map(async (entry) => {
    const { player, historyRecord, stagingDeltas, commitWarnings, startTime } = entry;
    const playerTurnStatus = commitWarnings.filter(
      w => !INFORMATIONAL_WARNING_PREFIXES.some(p => w.startsWith(p))
    ).length > 0 ? 'partial_success' : 'completed';

    try {
      await entities.PlayerTurnHistory.update(historyRecord.id, {
        status: playerTurnStatus,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        deltas_applied: commitWarnings.length > 0
          ? { ...stagingDeltas, commit_warnings: commitWarnings }
          : stagingDeltas,
        error_message: commitWarnings.length > 0 ? commitWarnings[0] : null,
        paused_until: null,
        updated_at: new Date().toISOString()
      });
    } catch (historyErr) {
      console.error(`[TurnEngine][BulkCommit] History update failed for ${player.id}: ${historyErr}`);
    }

    commitResults.push({
      type: playerTurnStatus === 'completed' ? 'success' : 'success',
      player,
      warnings: commitWarnings,
    });
  }));

  return commitResults;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6: Worker batch processor — exported for turnWorkerProcessor.ts
// ═══════════════════════════════════════════════════════════════════════════
export async function processPlayerBatchForWorker(
  allPlayers: any[],
  globalTurnId: number,
  entities: any,
  engineCtx: any,
  prefetch: any,
  activeControversyPlayerIds: Set<string>,
  radioSubsByPlayerRegion: Map<string, Record<string, number>>,
  executeModules: any,
) {
  const firstPlayerId = allPlayers[0]?.id;
  const BATCH_SIZE = 30;  // Bulk prefetch eliminates N+1 DB contention
  const playerBatches: any[][] = [];
  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    playerBatches.push(allPlayers.slice(i, i + BATCH_SIZE));
  }

  const allStagedEntries: Array<{player: any, playerEngineCtx: any, stagedPayload: any}> = [];
  let processed = 0, failed = 0, skipped = 0, paused = 0;
  const warnings: string[] = [];

  // PHASE A: Stage all players (instrumented)
  const stageStart = Date.now();
  for (const batch of playerBatches) {
    const batchResults = await Promise.all(
      batch.map(async (player) => {
        const playerEngineCtx = {
          ...(player.id === firstPlayerId ? { ...engineCtx, isFirstPlayer: true } : engineCtx),
          hasActiveControversy: activeControversyPlayerIds.has(player.id),
          active_radio_submissions_by_region: radioSubsByPlayerRegion.get(player.id) || {},
          prefetch,
        };
        try {
          const result = await processPlayerTurn(
            player, globalTurnId, entities, null, playerEngineCtx, executeModules,
            { mode: 'stage' }
          );
          if (result.status === 'staged') {
            return { type: 'staged', player, playerEngineCtx, stagedPayload: result.stagedPayload };
          }
          if (result.success && result.skipped) { skipped++; return null; }
          if (result.success) { processed++; return null; }
          failed++;
          return null;
        } catch (error) {
          failed++;
          console.error(`[WorkerBatch] Player ${player.id} staging error: ${error}`);
          return null;
        }
      })
    );
    for (const r of batchResults) {
      if (r?.type === 'staged') allStagedEntries.push(r as any);
    }
  }
  const stageMs = Date.now() - stageStart;

  // PHASE B: Commit all staged players (bulk RPC path, instrumented)
  let commitMs = 0;
  if (allStagedEntries.length > 0) {
    const commitStart = Date.now();
    const commitResults = await commitStagedPlayerBatch(allStagedEntries, globalTurnId, entities, executeModules, true);
    commitMs = Date.now() - commitStart;
    for (const r of commitResults) {
      if (r.type === 'success') processed++;
      else if (r.type === 'skipped') skipped++;
      else if (r.type === 'failed') failed++;
      if (r.warnings?.length) warnings.push(...r.warnings);
    }
  }

  console.log(`[WorkerBatch] Timing: stage=${stageMs}ms commit=${commitMs}ms players=${allPlayers.length} staged=${allStagedEntries.length}`);

  return { processed, failed, skipped, paused, warnings, stage_ms: stageMs, commit_ms: commitMs };
}

export async function runTurnEngine(supabaseClient = supabaseAdmin, payload = {}) {
  const entities = createSupabaseEntitiesAdapter(supabaseClient);
  return runTurnEngineWithEntities(entities, payload, executeTurnModules);
}


export async function runTurnEngineWithEntities(entities: any, payload: any = {}, executeModules = executeTurnModules) {
  const lockResult = await acquireLock(entities);
  if (!lockResult.acquired) {
    return { status: 'skipped', reason: lockResult.reason || 'lock_failed' };
  }

  const { turnState } = lockResult;
  const globalTurnId = turnState.global_turn_id;

  // Read algorithm_mood persisted from the previous turn (defaults to 'mainstream' on first run)
  const currentAlgorithmMood = (turnState.algorithm_mood || 'mainstream') as AlgorithmMood;

  const engineCtx = {
    debug_turn_economy: payload?.debug_turn_economy === true,
    debug_player_id: payload?.debug_player_id || null,
    supabaseAdmin: entities.supabaseClient,
    flags: {},
    algorithmMood: currentAlgorithmMood,
    platformSpotlight: (turnState.platform_spotlight || 'looptok') as string,
    globalTurnId,
    activeTrendsByRelease: {} as Record<string, string>,
    activeTrends: [] as any[],
  };

  try {

    const allPlayers = await entities.ArtistProfile.list();
    if (!allPlayers?.length) {
      return { status: 'success', global_turn_id: globalTurnId, players_processed: 0, message: 'No players to process' };
    }

    const results = {
      global_turn_id: globalTurnId,
      players_processed: 0,
      players_failed: 0,
      players_skipped: 0,
      players_already_done: 0,
      players_paused: 0,
      duration_ms: 0,
      start_time: new Date().toISOString()
    };
    const workerQueueMetrics = {
      mode: payload?.use_worker_queue !== false ? 'worker_queue' : 'direct',
      batch_count: 0,
      batch_size: 0,
      merged_remainder_players: 0,
      dispatch_http_failures: 0,
      dispatch_timeouts: 0,
      dispatch_fetch_failures: 0,
      redispatched_batches: 0,
      stale_claim_reap_runs: 0,
      stale_claims_reaped: 0,
      retried_batches: 0,
      failed_batches: 0,
      status_counts: {
        pending: 0,
        claimed: 0,
        done: 0,
        failed: 0,
      },
      failure_reasons: {} as Record<string, number>,
      fallback_reason: null as string | null,
    };
    (results as any).worker_queue_metrics = workerQueueMetrics;
    const globalPostPlayerDeltas: { social_posts_to_create: any[] } = {
      social_posts_to_create: [],
    };

    const engineStart = Date.now();

    // ═══════════════════════════════════════════════════════════════════
    // BULK PRE-FETCH: Load shared data for ALL players in parallel
    // Eliminates N+1 queries (was ~11+ queries per player → ~11 total)
    // ═══════════════════════════════════════════════════════════════════
    const allPlayerIds = allPlayers.map((p: any) => p.id);
    const prefetch: Record<string, any> = {};

    try {
      const [
        idempotencyRes,
        fanProfilesRes,
        allErasRes,
        fandomsRes,
        fandomSegmentsRes,
        activeReleasesRes,
        activeMerchRes,
        activeBrandDealsRes,
        activeToursRes,
        festivalActivityRes,
        cityRepsRes,
      ] = await Promise.all([
        // B4: Bulk idempotency check — fetch ALL history for this turn
        entities.supabaseClient
          .from('player_turn_history')
          .select('id,player_id,idempotency_key,status,attempt_count,paused_until')
          .eq('global_turn_id', globalTurnId)
          .eq('module', 'turnEngine'),
        // Fan profiles for all players
        entities.supabaseClient
          .from('fan_profiles')
          .select('*')
          .in('artist_id', allPlayerIds),
        // All eras for all players
        entities.supabaseClient
          .from('eras')
          .select('*')
          .in('artist_id', allPlayerIds),
        // Fandoms for all players
        entities.supabaseClient
          .from('fandoms')
          .select('player_id,fan_segments,loyalty,heat,fatigue,imprint,superfans_share,region_bias,inactivity_turns,consecutive_high_fatigue_turns,release_cadence,updated_at')
          .in('player_id', allPlayerIds),
        // Fandom segments for all players
        entities.supabaseClient
          .from('fandom_segments')
          .select('player_id,segment_type,count,loyalty,labor_output')
          .in('player_id', allPlayerIds),
        // Activity checks — just need existence, so limit per player
        entities.supabaseClient
          .from('releases')
          .select('id,artist_id')
          .in('artist_id', allPlayerIds)
          .in('lifecycle_state', ['Hot', 'Stable', 'Trending', 'Momentum']),
        entities.supabaseClient
          .from('merch')
          .select('id,artist_id')
          .in('artist_id', allPlayerIds)
          .eq('status', 'Active')
          .gt('stock', 0),
        entities.supabaseClient
          .from('brand_deal_contracts')
          .select('id,player_id')
          .in('player_id', allPlayerIds)
          .eq('status', 'active'),
        entities.supabaseClient
          .from('tours')
          .select('id,artist_id')
          .in('artist_id', allPlayerIds)
          .in('status', ['active', 'in_progress', 'scheduled']),
        entities.supabaseClient
          .from('festival_submissions')
          .select('id,artist_id')
          .in('artist_id', allPlayerIds)
          .in('status', ['submitted', 'accepted', 'lineup']),
        // City reputation for all players
        entities.supabaseClient
          .from('player_city_reputation')
          .select('player_id,city_id,reputation_score')
          .in('player_id', allPlayerIds),
      ]);

      // Build lookup maps keyed by player_id
      // Idempotency: map by player_id for O(1) lookup
      const idempotencyByPlayer = new Map<string, any>();
      for (const row of (idempotencyRes?.data || []) as any[]) {
        idempotencyByPlayer.set(row.player_id, row);
      }
      prefetch.idempotencyByPlayer = idempotencyByPlayer;

      // Fan profiles: map by artist_id
      const fanProfilesByPlayer = new Map<string, any>();
      for (const fp of (fanProfilesRes?.data || []) as any[]) {
        fanProfilesByPlayer.set(fp.artist_id, fp);
      }
      prefetch.fanProfilesByPlayer = fanProfilesByPlayer;

      // Eras: map by artist_id → array
      const erasByPlayer = new Map<string, any[]>();
      for (const era of (allErasRes?.data || []) as any[]) {
        const list = erasByPlayer.get(era.artist_id) || [];
        list.push(era);
        erasByPlayer.set(era.artist_id, list);
      }
      prefetch.erasByPlayer = erasByPlayer;

      // Fandoms: map by player_id
      const fandomsByPlayer = new Map<string, any>();
      for (const f of (fandomsRes?.data || []) as any[]) {
        fandomsByPlayer.set(f.player_id, f);
      }
      prefetch.fandomsByPlayer = fandomsByPlayer;

      // Fandom segments: map by player_id → array
      const fandomSegmentsByPlayer = new Map<string, any[]>();
      for (const seg of (fandomSegmentsRes?.data || []) as any[]) {
        const list = fandomSegmentsByPlayer.get(seg.player_id) || [];
        list.push(seg);
        fandomSegmentsByPlayer.set(seg.player_id, list);
      }
      prefetch.fandomSegmentsByPlayer = fandomSegmentsByPlayer;

      // Activity checks: build sets of player_ids that have active items
      const playersWithActiveRelease = new Set<string>();
      for (const r of (activeReleasesRes?.data || []) as any[]) playersWithActiveRelease.add(r.artist_id);
      const playersWithActiveMerch = new Set<string>();
      for (const m of (activeMerchRes?.data || []) as any[]) playersWithActiveMerch.add(m.artist_id);
      const playersWithActiveBrandDeal = new Set<string>();
      for (const b of (activeBrandDealsRes?.data || []) as any[]) playersWithActiveBrandDeal.add(b.player_id);
      const playersWithActiveTour = new Set<string>();
      for (const t of (activeToursRes?.data || []) as any[]) playersWithActiveTour.add(t.artist_id);
      const playersWithFestival = new Set<string>();
      for (const f of (festivalActivityRes?.data || []) as any[]) playersWithFestival.add(f.artist_id);
      prefetch.activityByPlayer = {
        hasActiveRelease: playersWithActiveRelease,
        hasActiveMerch: playersWithActiveMerch,
        hasActiveBrandDeal: playersWithActiveBrandDeal,
        hasActiveTour: playersWithActiveTour,
        hasFestival: playersWithFestival,
      };

      // City reputation: map by player_id → array of {city_id, reputation_score}
      const cityRepsByPlayer = new Map<string, any[]>();
      for (const cr of (cityRepsRes?.data || []) as any[]) {
        const list = cityRepsByPlayer.get(cr.player_id) || [];
        list.push(cr);
        cityRepsByPlayer.set(cr.player_id, list);
      }
      prefetch.cityRepsByPlayer = cityRepsByPlayer;

      // Bulk-load city_scenes for all referenced cities
      const allCityIds = [...new Set((cityRepsRes?.data || []).map((cr: any) => cr.city_id))];
      if (allCityIds.length > 0) {
        const { data: cityScenes } = await entities.supabaseClient
          .from('city_scenes')
          .select('id,region,genre_weights,trending_genre')
          .in('id', allCityIds);
        const cityScenesMap = new Map<string, any>();
        for (const cs of (cityScenes || []) as any[]) {
          cityScenesMap.set(String(cs.id), cs);
        }
        prefetch.cityScenesMap = cityScenesMap;
      } else {
        prefetch.cityScenesMap = new Map();
      }

      const prefetchMs = Date.now() - engineStart;
      console.log(`[TurnEngine] Bulk pre-fetch complete: ${allPlayerIds.length} players, ${idempotencyByPlayer.size} history records, ${prefetchMs}ms`);
    } catch (prefetchErr: any) {
      console.error(`[TurnEngine] Bulk pre-fetch failed, falling back to per-player queries:`, prefetchErr?.message);
      // prefetch stays empty — executeTurnModules will fall back to per-player queries
    }

    // Parallel processing with batching to prevent timeout
    // Process players in batches of 10 concurrently (safe after bulk pre-fetch reduces DB contention)
    const BATCH_SIZE = 10;
    const playerBatches: any[][] = [];
    for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
      playerBatches.push(allPlayers.slice(i, i + BATCH_SIZE));
    }

    const firstPlayerId = allPlayers[0]?.id;

    // Pre-load active trend statuses once per turn (for per-release mood bonuses in §3)
    try {
      const { data: peakTrends } = await supabaseAdmin
        .from('trends')
        .select('id, status, category, heat_score')
        .eq('is_active', true)
        .in('status', ['rising', 'peak']);

      if (peakTrends?.length) {
        const trendIds = (peakTrends as any[]).map((t: any) => t.id);
        const { data: linkedReleases } = await supabaseAdmin
          .from('releases')
          .select('id, linked_trend_id')
          .in('linked_trend_id', trendIds);

        const trendStatusMap = Object.fromEntries(
          (peakTrends as any[]).map((t: any) => [t.id, t.status])
        );
        engineCtx.activeTrendsByRelease = Object.fromEntries(
          ((linkedReleases || []) as any[]).map((r: any) => [r.id, trendStatusMap[r.linked_trend_id]])
        );
        // Expose full active trends array for inferTrendForRelease() scoring
        engineCtx.activeTrends = (peakTrends as any[]);
      }
    } catch (_) { /* non-fatal — trend bonuses degrade gracefully to 1.0 */ }

    // Pre-load players with active controversies (for messy mood bonus in §3)
    const activeControversyPlayerIds = new Set<string>();
    try {
      const { data: activeContros } = await supabaseAdmin
        .from('controversy_cases')
        .select('player_id')
        .neq('phase', 'resolved');
      for (const c of (activeContros || []) as any[]) {
        if (c.player_id) activeControversyPlayerIds.add(c.player_id);
      }
    } catch (_) { /* non-fatal */ }

    const radioSubsByPlayerRegion = new Map<string, Record<string, number>>();
    try {
      const { data: radioRows } = await supabaseAdmin
        .from('soundburst_radio_submissions')
        .select('player_id, soundburst_radio_shows!inner(region)')
        .eq('status', 'accepted');

      for (const row of (radioRows || []) as any[]) {
        const playerId = row?.player_id;
        const showRegion = Array.isArray(row?.soundburst_radio_shows)
          ? row.soundburst_radio_shows[0]?.region
          : row?.soundburst_radio_shows?.region;
        if (!playerId || !showRegion) continue;

        const regionMap = radioSubsByPlayerRegion.get(playerId) || {};
        regionMap[showRegion] = Number(regionMap[showRegion] || 0) + 1;
        radioSubsByPlayerRegion.set(playerId, regionMap);
      }
    } catch (_) { /* non-fatal */ }

    // Timeout budget guard: skip remaining batches if we're running out of time.
    // Supabase edge functions have ~25s limit; reserve 4s for post-player modules + commit.
    // Pass timeout_budget_ms in the request payload to override (e.g. 2000 for local Docker testing).
    const TIMEOUT_BUDGET_MS = payload?.timeout_budget_ms ?? 20_000;
    const SAFETY_MARGIN_MS = payload?.timeout_budget_ms ? 400 : 4_000;
    let budgetExhausted = false;
    let batchIndex = 0;

    // ═══ Phase 6: Worker queue dispatch mode (default) ═══
    // Worker queue is the default processing path — avoids the coordinator's
    // 25s edge function wall-clock limit by delegating to turnWorker functions
    // with their own 300s budget. Pass use_worker_queue=false to opt out.
    let workerQueueHandled = false;
    if (payload?.use_worker_queue !== false) {
      const WORKER_BATCH_SIZE = payload?.worker_batch_size ?? 30;
      const WORKER_BATCH_MIN = 5; // Merge tiny remainders into the last full batch
      const workerBatches: string[][] = [];
      workerQueueMetrics.batch_size = WORKER_BATCH_SIZE;
      for (let i = 0; i < allPlayerIds.length; i += WORKER_BATCH_SIZE) {
        workerBatches.push(allPlayerIds.slice(i, i + WORKER_BATCH_SIZE));
      }
      // Merge tiny last batch into previous to avoid spinning up a worker for <5 players
      if (workerBatches.length > 1 && workerBatches[workerBatches.length - 1].length < WORKER_BATCH_MIN) {
        const tiny = workerBatches.pop()!;
        workerQueueMetrics.merged_remainder_players = tiny.length;
        workerBatches[workerBatches.length - 1].push(...tiny);
        console.log(`[TurnEngine] Merged ${tiny.length} remainder players into batch ${workerBatches.length - 1} (now ${workerBatches[workerBatches.length - 1].length} players)`);
      }
      workerQueueMetrics.batch_count = workerBatches.length;

      console.log(`[TurnEngine] Worker queue mode: dispatching ${workerBatches.length} batches for ${allPlayerIds.length} players`);

      // Insert queue entries
      const queueInserts = workerBatches.map((playerIds, idx) => ({
        global_turn_id: globalTurnId,
        batch_index: idx,
        player_ids: playerIds,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      const { data: queueRows, error: queueErr } = await entities.supabaseClient
        .from('turn_player_queue')
        .insert(queueInserts)
        .select('id, batch_index');

      if (queueErr) {
        workerQueueMetrics.fallback_reason = `queue_insert_failed:${queueErr.message}`;
        console.error(`[TurnEngine] Failed to insert worker queue entries: ${queueErr.message}. Falling back to direct processing.`);
        // Fall through to direct processing below
      } else {
        // Dispatch worker invocations via direct fetch (bypasses pg_net async latency)
        const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/turnWorker`;
        const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        const dispatchWorker = async (queueId: string, batchIdx: number) => {
          try {
            // Use AbortController to timeout if worker takes >120s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120_000);
            const resp = await fetch(workerUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${svcKey}`,
              },
              body: JSON.stringify({ queue_id: queueId, global_turn_id: globalTurnId }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
              workerQueueMetrics.dispatch_http_failures += 1;
              console.error(`[TurnEngine] Worker dispatch HTTP ${resp.status} for batch ${batchIdx}: ${body}`);
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              workerQueueMetrics.dispatch_timeouts += 1;
              console.warn(`[TurnEngine] Worker dispatch timed out for batch ${batchIdx} — worker may still be processing`);
            } else {
              workerQueueMetrics.dispatch_fetch_failures += 1;
              console.error(`[TurnEngine] Worker dispatch fetch failed for batch ${batchIdx}: ${err?.message || err}`);
            }
          }
        };

        // Fire all worker dispatches concurrently — await to ensure HTTP requests are sent
        const dispatchPromises = (queueRows || []).map((row: any) =>
          dispatchWorker(row.id, row.batch_index)
        );
        await Promise.allSettled(dispatchPromises);
        console.log(`[TurnEngine] All ${dispatchPromises.length} worker dispatches fired`);

        // Poll for completion (max 5 min with 1s intervals)
        // Edge function wall clock is ~150s. Compute remaining poll budget dynamically
        // to avoid exceeding the gateway timeout. Reserve 10s for post-poll result gathering.
        const EDGE_FUNCTION_BUDGET_MS = payload?.edge_function_budget_ms ?? 150_000;
        const POST_POLL_RESERVE_MS = 10_000;
        const elapsedBeforePoll = Date.now() - engineStart;
        const POLL_TIMEOUT_MS = Math.max(10_000, EDGE_FUNCTION_BUDGET_MS - elapsedBeforePoll - POST_POLL_RESERVE_MS);
        console.log(`[TurnEngine] Poll budget: ${POLL_TIMEOUT_MS}ms (elapsed pre-poll: ${elapsedBeforePoll}ms)`);
        const POLL_INTERVAL_MS = 1_000;
        const RE_DISPATCH_INTERVAL_MS = 15_000; // Re-dispatch pending entries every 15s
        const pollStart = Date.now();
        let allComplete = false;
        let lastReDispatchTime = 0; // Timestamp of last re-dispatch (0 = never)

        while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
          const { data: pendingRows } = await entities.supabaseClient
            .from('turn_player_queue')
            .select('id, status, batch_index')
            .eq('global_turn_id', globalTurnId)
            .in('status', ['pending', 'claimed']);

          if (!pendingRows?.length) {
            allComplete = true;
            break;
          }

          const pollElapsed = Date.now() - pollStart;
          const timeSinceLastReDispatch = pollElapsed - lastReDispatchTime;

          // Periodic re-dispatch: if any entries are 'pending' (never claimed or reaped back), re-invoke
          // Rate-limited to once per RE_DISPATCH_INTERVAL_MS
          if (pollElapsed > RE_DISPATCH_INTERVAL_MS && timeSinceLastReDispatch >= RE_DISPATCH_INTERVAL_MS) {
            const stillPending = (pendingRows || []).filter((r: any) => r.status === 'pending');
            if (stillPending.length > 0) {
              workerQueueMetrics.redispatched_batches += stillPending.length;
              console.warn(`[TurnEngine] Re-dispatching ${stillPending.length} pending batches at ${pollElapsed}ms (interval: ${Math.round(timeSinceLastReDispatch)}ms)`);
              for (const row of stillPending) {
                dispatchWorker(row.id, row.batch_index).catch(() => {});
              }
              lastReDispatchTime = pollElapsed;
            }
          }

          // Reap stale claims (workers that crashed) every 30s of polling
          if (pollElapsed > 30_000 && pollElapsed % 30_000 < POLL_INTERVAL_MS) {
            try {
              const { data: reapedCount, error: reapErr } = await entities.supabaseClient.rpc('reap_stale_turn_claims', {
                p_global_turn_id: globalTurnId,
                p_stale_seconds: 90,
              });
              if (reapErr) console.warn(`[TurnEngine] Reap stale claims warning: ${reapErr.message}`);
              const reaped = Number(reapedCount || 0);
              if (reaped > 0) {
                workerQueueMetrics.stale_claim_reap_runs += 1;
                workerQueueMetrics.stale_claims_reaped += reaped;
                console.warn(`[TurnEngine] Reaped ${reaped} stale worker claim(s) for turn ${globalTurnId}`);
              }
            } catch (_) { /* non-fatal */ }
          }

          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // Gather results from completed queue entries
        const { data: completedRows } = await entities.supabaseClient
          .from('turn_player_queue')
          .select('batch_index, status, retry_count, error_message, result_summary')
          .eq('global_turn_id', globalTurnId);

        for (const row of (completedRows || []) as any[]) {
          const statusKey = String(row.status || 'pending') as 'pending' | 'claimed' | 'done' | 'failed';
          if (workerQueueMetrics.status_counts[statusKey] != null) {
            workerQueueMetrics.status_counts[statusKey] += 1;
          }
          if (Number(row.retry_count || 0) > 0) {
            workerQueueMetrics.retried_batches += 1;
          }
          if (row.status === 'failed') {
            workerQueueMetrics.failed_batches += 1;
            const reason = normalizeWorkerQueueFailureReason(row.error_message);
            workerQueueMetrics.failure_reasons[reason] = (workerQueueMetrics.failure_reasons[reason] || 0) + 1;
          }
          const summary = row.result_summary || {};
          results.players_processed += summary.processed || 0;
          results.players_failed += summary.failed || 0;
          // Worker "skipped" = idempotency skip (already processed), NOT budget-guard skip.
          // Count as already_done (which doesn't block turn advancement) rather than
          // players_skipped (which does block advancement and is reserved for budget guards).
          results.players_already_done += summary.skipped || 0;
          results.players_paused += summary.paused || 0;
        }

        if (!allComplete) {
          workerQueueMetrics.fallback_reason = 'worker_queue_poll_timeout';
          console.warn(`[TurnEngine] Worker queue poll timed out. Some batches may still be processing.`);
          budgetExhausted = true;
        }

        console.log(`[TurnEngine][WorkerQueueMetrics] ${JSON.stringify({
          global_turn_id: globalTurnId,
          ...workerQueueMetrics,
        })}`);

        // Skip the direct processing loop below — workers handled it
        workerQueueHandled = true;
      }

      if (!queueErr) {
        workerQueueHandled = true;
      }
      // If queueErr, workerQueueHandled stays false — fall through to direct processing
    }

    // ═══ Direct processing mode (default or worker queue fallback) ═══
    if (!workerQueueHandled) {

    const ENABLE_DEFERRED_BATCH_COMMIT = payload?.deferred_batch_commit !== false;

    // ═══ PHASE A: COMPUTE (all players stage, zero writes when deferred) ═══
    const allStagedEntries: Array<{player: any, playerEngineCtx: any, stagedPayload: any}> = [];
    const immediateResults: any[] = [];

    for (const batch of playerBatches) {
      const elapsed = Date.now() - engineStart;
      const remaining = TIMEOUT_BUDGET_MS - elapsed;
      if (remaining < SAFETY_MARGIN_MS) {
        const skippedCount = playerBatches.slice(batchIndex).reduce((n: number, b: any[]) => n + b.length, 0);
        console.warn(`[TurnEngine] Budget guard: ${elapsed}ms elapsed. Skipping ${skippedCount} players.`);
        results.players_skipped += skippedCount;
        budgetExhausted = true;
        break;
      }
      batchIndex++;

      const batchPromises = batch.map(async (player) => {
        try {
          const breakerCheck = await checkCircuitBreakerAndUnpause(player.id, entities);
          if (breakerCheck.breaker_open) {
            return { type: 'paused', player };
          }

          const playerEngineCtx = {
            ...(player.id === firstPlayerId ? { ...engineCtx, isFirstPlayer: true } : engineCtx),
            hasActiveControversy: activeControversyPlayerIds.has(player.id),
            active_radio_submissions_by_region: radioSubsByPlayerRegion.get(player.id) || {},
            prefetch,
          };

          const playerResult = await processPlayerTurn(
            player, globalTurnId, entities,
            breakerCheck.should_pause_until, playerEngineCtx, executeModules,
            ENABLE_DEFERRED_BATCH_COMMIT ? { mode: 'stage' } : {}
          );

          if (playerResult.status === 'staged' && playerResult.stagedPayload) {
            return { type: 'staged', player, playerEngineCtx, stagedPayload: playerResult.stagedPayload };
          }
          if (playerResult.success) {
            return { type: playerResult.skipped ? 'skipped' : 'success', player, warnings: playerResult.warnings || [] };
          }
          return { type: 'failed', player, errors: playerResult.errors };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(`[TurnEngine] Unhandled error for player ${player.artist_name || player.id}: ${errMsg}`);
          return { type: 'failed', player, errors: [errMsg] };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        if (result.type === 'staged') {
          allStagedEntries.push(result as any);
        } else {
          immediateResults.push(result);
        }
      }
    }

    // ═══ PHASE B: COMMIT (single pass for all staged work) ═══
    if (allStagedEntries.length > 0) {
      console.log(`[TurnEngine] Phase B: committing ${allStagedEntries.length} staged players in single pass`);
      const commitResults = await commitStagedPlayerBatch(allStagedEntries, globalTurnId, entities, executeModules);
      immediateResults.push(...commitResults);
    }

    // ═══ Aggregate all results ═══
    for (const result of immediateResults) {
      if (result.type === 'paused') {
        results.players_paused++;
      } else if (result.type === 'skipped') {
        results.players_already_done++;
      } else if (result.type === 'success') {
        results.players_processed++;
        if (result.warnings?.length) {
          (results as any).commit_warnings = [
            ...(((results as any).commit_warnings || []) as string[]),
            ...result.warnings.map((warning: string) => `${result.player?.artist_name || result.player?.id || 'unknown'}: ${warning}`),
          ];
        }
      } else if (result.type === 'failed') {
        results.players_failed++;
        const rawError: any = result.errors?.[0] || 'Unknown turn processing error';
        const errMsg = typeof rawError === 'string' ? rawError :
                       (rawError instanceof Error ? rawError.message :
                       (typeof rawError === 'object' ? JSON.stringify(rawError) : String(rawError)));
        console.error(`[TurnEngine] Player ${result.player?.artist_name || result.player?.id} failed turn ${globalTurnId}: ${errMsg}`);
        try {
          await entities.Notification.create({
            player_id: result.player?.id,
            type: 'TURN_ERROR',
            title: 'Turn Processing Error',
            subtitle: `Turn ${globalTurnId} encountered an issue`,
            body: `Error: ${errMsg}. The game will retry on the next turn cycle.`,
            priority: 'high',
            is_read: false,
            idempotency_key: `turn_error_${globalTurnId}_${result.player?.id}`
          });
        } catch (_) { /* non-fatal */ }
      }
    }

    } // end direct processing mode

    // === GLOBAL POST-PLAYER MODULES ===
    // Only run when ALL players have been processed. If budget exhausted (direct mode
    // skipped players or worker queue poll timed out), defer to next invocation.
    if (!budgetExhausted) {
    // === CERTIFICATIONS MODULE ===
    // processCertificationsForTurn owns certification writes. v1 chartUpdateModule call removed (Plan 049).
    try {
      const certResult = await processCertificationsForTurn(globalTurnId, entities, firstPlayerId ?? '');
      if (certResult?.success) {
        // Commit new certifications only — strip internal fields before insert
        const certCreates = certResult.certification_creates || [];
        const certResults = await Promise.allSettled(
          certCreates.map((cert: any) => {
            const { _release_title, ...certPayload } = cert;
            return entities.Certification.create(certPayload)
              .catch((e: any) => console.error(`[cert create] FAILED release=${certPayload.release_id} detail=${certPayload.certification_detail}:`, e));
          })
        );
        const certSuccessIndices = new Set<number>(
          certResults.reduce((acc: number[], r, i) => {
            if (r.status === 'fulfilled') acc.push(i);
            return acc;
          }, [])
        );

        // Commit cert notifications ONLY for certs that actually inserted
        await Promise.allSettled(
          (certResult.notification_creates || [])
            .filter((certNotif: any) => certSuccessIndices.has(certNotif._cert_index))
            .map((certNotif: any) => {
              const { _cert_index, ...notifPayload } = certNotif;
              return entities.Notification.create(notifPayload)
                .catch((_: any) => { /* non-fatal: idempotency constraint */ });
            })
        );
      } else {
        console.error(`[TurnEngine] Certifications module returned success=false — skipping cert commit for turn ${globalTurnId}`);
        await emitReleasePipelineEvent(
          entities,
          buildReleasePipelineTelemetryEvent({
            eventType: 'release_pipeline_cert_module_failed',
            module: 'turnEngine',
            globalTurnId,
            playerId: firstPlayerId ?? '',
            reasonCode: 'cert_module_success_false',
            traceId: `${globalTurnId}:cert_failed`,
            description: 'certificationModule returned success=false — certifications skipped this turn',
            metadata: { is_debug: false },
          }),
        );
      }
    } catch (certError: unknown) {
      const certErrMsg = certError instanceof Error ? certError.message : String(certError);
      console.error(`[TurnEngine] Certifications module error (non-fatal): ${certErrMsg}`);
    }

    // === CHARTS V2 MODULE (Billboard-style) ===
    // Reads release_turn_metrics (written during per-player commit phase).
    // Generates daily runs every turn; weekly runs only on Thursday (turn_of_week === 7).
    try {
      const chartsV2Result = await processChartsV2ForTurn(globalTurnId, supabaseAdmin, engineCtx, firstPlayerId);
      if (chartsV2Result?.chart_summaries_by_artist && Object.keys(chartsV2Result.chart_summaries_by_artist).length > 0) {
        await enrichTurnRecapsWithChartSummaries(globalTurnId, supabaseAdmin, chartsV2Result.chart_summaries_by_artist);
      }
    } catch (chartsV2Error: unknown) {
      const v2ErrMsg = chartsV2Error instanceof Error ? chartsV2Error.message : String(chartsV2Error);
      console.error(`[TurnEngine] Charts v2 module error (non-fatal): ${v2ErrMsg}`);
      if (firstPlayerId) {
        await emitReleasePipelineEvent(
          entities,
          buildReleasePipelineTelemetryEvent({
            eventType: 'release_pipeline_chart_v2_catch',
            module: 'turnEngine',
            globalTurnId,
            playerId: firstPlayerId,
            reasonCode: 'chart_v2_non_fatal_catch',
            traceId: `${globalTurnId}:chart_v2_catch`,
            description: 'Chart v2 module non-fatal catch recorded',
            metadata: {
              error_message: v2ErrMsg,
              error_class: chartsV2Error instanceof Error ? chartsV2Error.name : 'UnknownError',
              is_debug: false,
            },
          }),
        );
      } else {
        console.warn('[TurnEngine] Charts v2 catch: cannot emit telemetry — no firstPlayerId');
      }
    }

    if (firstPlayerId) {
      await emitReleasePipelineContradictionCounters(entities, globalTurnId, firstPlayerId);
    }

    // === MEDIA POST GENERATION MODULE ===
    // Generate AI-driven media posts for significant events (certifications, chart entries, etc.)
    try {
      // Collect media-worthy events from this turn
      const mediaEvents: Array<{ type: any; details: any; artistId: string; artistName: string; artistGenre: string; importance: number }> = [];
      
      // Check for recent certifications in the database (from this turn)
      const recentCerts = await entities.Certification.filter({ turn_achieved: globalTurnId });
      for (const cert of recentCerts || []) {
        const artist = allPlayers.find((p: any) => p.id === cert.artist_id);
        if (artist) {
          // Fetch release title
          let releaseTitle = 'Track';
          try {
            const release = await entities.Release.get(cert.release_id);
            releaseTitle = release?.title || 'Track';
          } catch (_) { /* use default */ }
          
          mediaEvents.push({
            type: 'certification',
            details: {
              title: releaseTitle,
              certification: cert.certification_detail || cert.certification_level,
              streams: cert.streams_at_certification,
              reference_id: cert.release_id
            },
            artistId: artist.id,
            artistName: artist.artist_name || 'Artist',
            artistGenre: artist.genre || 'General',
            importance: cert.certification_level === 'Diamond' ? 1.0 : 
                       cert.certification_level === 'Platinum' ? 0.8 : 0.6
          });
        }
      }
      
      // Generate media posts for collected events
      if (mediaEvents.length > 0) {
        const generatedMediaPosts = await processMediaPostsForTurn({ entities, globalTurnId }, mediaEvents);
        if (generatedMediaPosts.length > 0) {
          globalPostPlayerDeltas.social_posts_to_create.push(...generatedMediaPosts);
        }
      }
      
      // Generate occasional NPC artist posts with a calmer cadence so Xpress does not flood
      // Roughly every 5th turn with a small offset window for variety
      const shouldGenerateNPCPosts = (globalTurnId % 5 === 0) || (globalTurnId % 13 === 1);
      if (shouldGenerateNPCPosts) {
        const npcArtists = allPlayers.filter((p: any) => p.is_npc === true);
        const momentumEligibleNpcs = npcArtists.filter((npc: any) => {
          const followers = Number(npc.followers) || 0;
          const hype = Number(npc.hype) || 0;
          const clout = Number(npc.clout) || 0;
          return hype >= 58 || clout >= 52 || followers >= 120000;
        });
        const npcPool = momentumEligibleNpcs.length > 0 ? momentumEligibleNpcs : npcArtists;
        // Pick just 1 NPC per eligible turn
        const npcSample = npcPool.sort(() => Math.random() - 0.5).slice(0, 1);
        for (const npc of npcSample) {
          try {
            const npcPost = await generateNPCArtistPost(entities, npc);
            if (npcPost) {
              globalPostPlayerDeltas.social_posts_to_create.push(npcPost);
            }
          } catch (_) { /* non-fatal */ }
        }
      }
    } catch (mediaError: unknown) {
      const mediaErrMsg = mediaError instanceof Error ? mediaError.message : String(mediaError);
      console.error(`[TurnEngine] Media post module error (non-fatal): ${mediaErrMsg}`);
    }

    // === LOOPTOK GLOBAL SOUND METRICS ===
    // Update NPC-driven sound usage metrics once per turn (idempotent)
    try {
      const soundResult = await updateSoundMetricsGlobal(globalTurnId);
      await Promise.allSettled(
        soundResult.soundMetricsInserts.map(async (insert: any) => {
          const { error } = await supabaseAdmin
            .from('looptok_sound_metrics')
            .upsert(insert, { onConflict: 'sound_id,global_turn_id', ignoreDuplicates: true });
          if (error) console.error('[sound metrics upsert]', error.message);
        })
      );
      await Promise.allSettled(
        soundResult.turnEvents.map(async (event: any) => {
          const { error } = await supabaseAdmin
            .from('turn_event_log')
            .upsert(event, { onConflict: 'player_id,global_turn_id,module,event_type', ignoreDuplicates: true });
          if (error) console.error('[turn event log upsert]', error.message);
        })
      );
    } catch (soundError: unknown) {
      const soundErrMsg = soundError instanceof Error ? soundError.message : String(soundError);
      console.error(`[TurnEngine] LoopTok sound metrics error (non-fatal): ${soundErrMsg}`);
    }

    await commitStagedSocialPosts(entities, globalPostPlayerDeltas.social_posts_to_create);

    // === REMIX CONTEST MODULE ===
    try {
      await processRemixContestsForTurn(globalTurnId, supabaseAdmin, engineCtx);
    } catch (remixErr: unknown) {
      const remixErrMsg = remixErr instanceof Error ? remixErr.message : String(remixErr);
      console.error(`[TurnEngine] Remix contest module error (non-fatal): ${remixErrMsg}`);
    }

    // === ALGORITHM MOOD UPDATE ===
    // Recomputes algorithm_mood based on this turn's events (fan wars, controversies, trends).
    // Written to turn_state so next turn's engineCtx sees the updated mood.
    try {
      await processAlgorithmMoodForTurn(supabaseAdmin, globalTurnId, currentAlgorithmMood);
    } catch (moodErr: unknown) {
      const msg = moodErr instanceof Error ? moodErr.message : String(moodErr);
      console.error(`[TurnEngine] Algorithm mood module error (non-fatal): ${msg}`);
    }

    // === TREND EVOLUTION MODULE ===
    // Advances heat/decay lifecycle for all active trends; seeds new NPC trends every 14 turns.
    try {
      await processTrendsForTurn(supabaseAdmin, globalTurnId, currentAlgorithmMood);
    } catch (trendErr: unknown) {
      const msg = trendErr instanceof Error ? trendErr.message : String(trendErr);
      console.error(`[TurnEngine] Trend evolution module error (non-fatal): ${msg}`);
    }

    // === FESTIVAL GLOBAL MODULE ===
    try {
      await processFestivalGlobalModule(globalTurnId, supabaseAdmin);
    } catch (festErr: unknown) {
      const msg = festErr instanceof Error ? festErr.message : String(festErr);
      console.error(`[TurnEngine] Festival module error (non-fatal): ${msg}`);
    }

    // === CHART HISTORY RETENTION (once per in-game year) ===
    if (globalTurnId % 365 === 0) {
      try {
        await supabaseAdmin.rpc('prune_chart_history');
      } catch (e) {
        console.warn('[prune_chart_history] failed (non-fatal):', e);
      }
    }

    } // end global modules gate (!budgetExhausted)

    results.duration_ms = Date.now() - engineStart;
    (results as any).end_time = new Date().toISOString();

    const completedAt = new Date().toISOString();
    const latestState = (await entities.TurnState.list('-updated_at', 1))?.[0] || turnState;

    // If budget exhausted, do NOT advance the turn counter — remaining players
    // need to be processed on the next invocation of the same turn.
    if (budgetExhausted || results.players_skipped > 0) {
      await entities.TurnState.update(turnState.id, {
        status: 'idle',
        locked_by: null,
        locked_until: null,
        lock_token: null,
        players_processed: (latestState.players_processed || 0) + (results.players_processed || 0),
        players_skipped: results.players_skipped || 0,
        duration_ms: results.duration_ms,
        updated_at: new Date().toISOString()
      });
      return { 
        status: 'partial_success', 
        reason: budgetExhausted ? 'budget_exhausted' : 'players_skipped', 
        budget_exhausted: budgetExhausted,
        ...results, 
        global_turn_id: globalTurnId,
        resume_needed: true 
      };
    }

    const completionPatch = buildTurnCompletionUpdate(latestState, globalTurnId, { ...results, total_players: allPlayers.length }, completedAt);

    // Always advance turn, even if some players failed
    // Failed players will be retried in later runs via circuit breaker/backoff
    await entities.TurnState.update(turnState.id, {
      ...completionPatch,
      // Track the last fully successful turn (all players processed, none failed/skipped)
      last_completed_turn_id: (results.players_failed === 0) ? globalTurnId : latestState.last_completed_turn_id,
      last_completed_turn_timestamp: (results.players_failed === 0) ? completedAt : latestState.last_completed_turn_timestamp,
      updated_at: new Date().toISOString()
    });

    if (results.players_failed > 0) {
      return { 
        status: 'partial_success', 
        reason: 'players_failed', 
        ...results, 
        next_global_turn_id: globalTurnId + 1 
      };
    }

    return { status: 'success', ...results, next_global_turn_id: globalTurnId + 1 };
  } catch (error) {
    await entities.TurnState.update(turnState.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const errMsg = error instanceof Error ? error.message : (error as any)?.message || JSON.stringify(error);
    return { status: 'failed', error: errMsg };
  } finally {
    await releaseLock(entities, turnState.id);
  }
}
/**
 * Single-player catchup: process ONE player for a specific turn ID.
 * Does NOT acquire the global lock or advance the global turn counter.
 * Safe to call repeatedly — idempotent via player_turn_history idempotency_key.
 */
export async function runSinglePlayerCatchup(playerId: string, turnId: number) {
  const entities = createSupabaseEntitiesAdapter(supabaseAdmin);
  const engineCtx = {
    debug_turn_economy: false,
    debug_player_id: null,
    supabaseAdmin,
    flags: {},
  };

  // Load the specific player
  const allProfiles = await entities.ArtistProfile.list();
  const player = allProfiles.find((p: any) => p.id === playerId);
  if (!player) {
    return { status: 'error', error: `Player ${playerId} not found` };
  }

  // Process turn for this single player (idempotent — skips if already completed)
  const result = await processPlayerTurn(player, turnId, entities, null, engineCtx, executeTurnModules);

  return {
    status: result.success ? 'success' : 'failed',
    player_id: playerId,
    artist_name: player.artist_name,
    turn_id: turnId,
    skipped: result.skipped || false,
    errors: result.errors || [],
    warnings: result.warnings || [],
  };
}
