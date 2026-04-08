/**
 * DEV TESTING HARNESS - Turn Engine Debugger (Batch 3.1)
 * Calls real turnEngine with dry_run flag (stages + skips commit)
 * Proves zero writes and validates module cadence
 * 
 * Params (JSON payload):
 * - dry_run (bool, default true) - Stage deltas without committing
 * - max_players (number, default 1) - Limit players to process
 * - force_global_turn_id (number) - Override current global turn ID
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { requireAdmin } from './lib/authFromRequest.ts';
import { TURN_SCHEDULER, executeTurnModules } from './turnScheduler.ts';

async function checkCircuitBreakerAndUnpause(playerId, entities) {
  const now = new Date();

  const pausedHistory = await entities.PlayerTurnHistory.filter({
    player_id: playerId,
    paused_until: { $gt: now.toISOString() }
  });

  if (pausedHistory.length > 0) {
    const record = pausedHistory[0];
    const pausedUntilTime = new Date(record.paused_until).getTime();
    const remainingMs = pausedUntilTime - now.getTime();
    console.log(`[DevTurnEngine] Player ${playerId} paused for ${Math.floor(remainingMs / 1000)}s more`);
    return { breaker_open: true, paused_until: record.paused_until };
  }

  const recentFailures = await entities.PlayerTurnHistory.filter(
    { player_id: playerId, status: 'failed' },
    '-created_date',
    3
  );

  if (recentFailures.length >= 3) {
    const allFailed = recentFailures.slice(0, 3).every(h => h.status === 'failed');
    if (allFailed) {
      const pauseUntil = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      console.log(`[DevTurnEngine] Circuit breaker triggered for ${playerId}, pausing until ${pauseUntil.toISOString()}`);
      return { breaker_open: true, should_pause_until: pauseUntil.toISOString() };
    }
  }

  return { breaker_open: false };
}



/**
 * Call real turnEngine with dry_run flag
 * Returns structured report of modules, deltas, notifications, and any write attempts
 */
async function devRunTurnEngine(payload, entities) {
  const {
    dry_run = true,
    max_players = 1,
    force_global_turn_id = null
  } = payload;

  console.log(`[DevTurnEngine] Starting dry_run=${dry_run}, maxPlayers=${max_players}, forceGlobalTurnId=${force_global_turn_id}`);

  try {
    // Setup turn state
    let turnStates = await entities.TurnState.list('-created_date', 1);
    let globalTurnId = force_global_turn_id !== null ? force_global_turn_id : (turnStates?.[0]?.global_turn_id || 1);

    if (turnStates.length === 0) {
      await entities.TurnState.create({
        global_turn_id: globalTurnId,
        turn_timestamp: new Date().toISOString(),
        status: 'testing'
      });
    }

    console.log(`[DevTurnEngine] Using global_turn_id=${globalTurnId}`);

    // Get all players or filter by count
    let allPlayers = await entities.ArtistProfile.list();
    if (!allPlayers?.length) {
      return {
        status: 'success',
        global_turn_id: globalTurnId,
        dry_run: dry_run,
        message: 'No players to process'
      };
    }

    allPlayers = allPlayers.slice(0, max_players);

    const results = {
      status: 'success',
      global_turn_id: globalTurnId,
      dry_run: dry_run,
      players_total: allPlayers.length,
      players_completed: 0,
      players_failed: 0,
      players_skipped: 0,
      player_results: [],
      write_attempts: [],
      errors: [],
      start_time: new Date().toISOString()
    };

    const engineStart = Date.now();

    for (const player of allPlayers) {
      try {
        const modules = TURN_SCHEDULER.getModuleCadenceForTurn(globalTurnId);
        
        console.log(`[DevTurnEngine] Player ${player.artist_name}: running ${modules.length} modules (turn ${globalTurnId})`);

        // Run with stageOnly (dry-run mode - no writes allowed)
        const stageResult = await executeTurnModules(player, globalTurnId, entities, modules, {
          stageOnly: true,
          dry_run: true
        });

        if (stageResult.errors?.length > 0) {
          // Check if any error is WRITE_BLOCKED
          const writeBlocked = stageResult.errors.filter(e => e.includes('WRITE_BLOCKED'));
          if (writeBlocked.length > 0) {
            results.write_attempts.push({
              player_id: player.id,
              blocked_writes: writeBlocked
            });
            results.players_failed++;
            results.player_results.push({
              player_id: player.id,
              artist_name: player.artist_name,
              status: 'failed',
              reason: 'WRITE_BLOCKED_DURING_STAGING',
              errors: writeBlocked
            });
          } else {
            results.players_failed++;
            results.player_results.push({
              player_id: player.id,
              artist_name: player.artist_name,
              status: 'failed',
              errors: stageResult.errors
            });
          }
        } else {
          results.players_completed++;
          const deltas = stageResult.deltas || {};
          results.player_results.push({
            player_id: player.id,
            artist_name: player.artist_name,
            status: 'completed',
            modules_run: stageResult.modules_run || [],
            deltas_summary: {
              artistProfile: !!deltas.artistProfile && Object.keys(deltas.artistProfile).length > 0,
              fanProfile: !!deltas.fanProfile && Object.keys(deltas.fanProfile).length > 0,
              era: !!deltas.era && Object.keys(deltas.era).length > 0,
              releases_updates: Array.isArray(deltas.releases_updates) ? deltas.releases_updates.length : 0,
              merch_updates: Array.isArray(deltas.merch_updates) ? deltas.merch_updates.length : 0,
              turn_events: Array.isArray(deltas.turn_events) ? deltas.turn_events.length : 0,
              notifications_to_create: Array.isArray(deltas.notifications_to_create) ? deltas.notifications_to_create.length : 0
            }
          });
        }
      } catch (error) {
        console.error(`[DevTurnEngine] Player ${player.id} exception:`, error.message);
        if (error.message?.includes('WRITE_BLOCKED')) {
          results.write_attempts.push({
            player_id: player.id,
            blocked_writes: [error.message]
          });
        }
        results.players_failed++;
        results.errors.push({
          player_id: player.id,
          error: error.message
        });
      }
    }

    results.duration_ms = Date.now() - engineStart;
    results.end_time = new Date().toISOString();

    console.log(
      `[DevTurnEngine] Dry-run complete: ${results.players_completed} OK, ${results.players_failed} failed in ${results.duration_ms}ms`
    );

    return results;
  } catch (error) {
    console.error('[DevTurnEngine] Fatal error:', error.message);
    return {
      status: 'failed',
      error: error.message,
      stack: error.stack
    };
  }
}

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await requireAdmin(req);
    if (!user) {
      return Response.json({ error: authErr || 'Admin only' }, { status: 403 });
    }

    let payload = {};
    if (req.method === 'POST') {
      payload = await req.json();
    } else {
      // GET: parse query params
      const url = new URL(req.url);
      payload = {
        dry_run: url.searchParams.get('dry_run') !== 'false',
        max_players: parseInt(url.searchParams.get('max_players') || '1'),
        force_global_turn_id: url.searchParams.get('force_global_turn_id') 
          ? parseInt(url.searchParams.get('force_global_turn_id')) 
          : null
      };
    }

    const result = await devRunTurnEngine(payload, { entities: createSupabaseEntitiesAdapter(supabaseAdmin) });
    return Response.json(result);
  } catch (error) {
    console.error('[DevTurnEngine] Fatal error:', error);
    return Response.json({ error: (error as Error).message, stack: (error as Error).stack }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}