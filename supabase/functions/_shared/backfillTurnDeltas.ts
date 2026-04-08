import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { requireAdmin } from './lib/authFromRequest.ts';
import { TURN_SCHEDULER, executeTurnModules } from './turnScheduler.ts';

async function applyDeltasForPlayer(entities, player, stagingDeltas) {
  if (Object.keys(stagingDeltas.artistProfile || {}).length > 0) {
    await entities.ArtistProfile.update(player.id, stagingDeltas.artistProfile);
  }

  if (Object.keys(stagingDeltas.fanProfile || {}).length > 0) {
    const fanProfiles = await entities.FanProfile.filter({ artist_id: player.id });
    if (fanProfiles?.[0]) {
      await entities.FanProfile.update(fanProfiles[0].id, stagingDeltas.fanProfile);
    }
  }

  if (stagingDeltas.releases_updates?.length > 0) {
    for (const update of stagingDeltas.releases_updates) {
      await entities.Release.update(update.id, update.patch);

      // Optional: propagate release stream deltas to project/song if entities exist.
      try {
        if (entities.Project && update.patch?.lifetime_streams !== undefined) {
          const release = await entities.Release.get(update.id);
          if (release?.project_id) {
            const projects = await entities.Project.filter({ id: release.project_id, artist_id: player.id });
            if (projects?.[0]) {
              await entities.Project.update(projects[0].id, {
                lifetime_streams: (projects[0].lifetime_streams || 0) + (update.patch.lifetime_streams - (release.lifetime_streams || 0))
              });
            }
          }
        }
      } catch (_) {
        // Non-blocking for installs without Project entity.
      }
    }
  }

  if (stagingDeltas.merch_updates?.length > 0) {
    for (const update of stagingDeltas.merch_updates) {
      await entities.Merch.update(update.id, update.patch);
    }
  }

  if (stagingDeltas.turn_events?.length > 0) {
    for (const event of stagingDeltas.turn_events) {
      await entities.TurnEventLog.create(event);
    }
  }
}

async function runBackfill(entities, { startTurnIndex, endTurnIndex, playerIds = [], debug_turn_economy = false }) {
  const players = playerIds.length
    ? (await Promise.all(playerIds.map((id) => entities.ArtistProfile.get(id).catch(() => null)))).filter(Boolean)
    : await entities.ArtistProfile.list();

  const results = {
    startTurnIndex,
    endTurnIndex,
    players: players.length,
    turns_processed: 0,
    turns_skipped_idempotent: 0,
    turn_errors: []
  };

  for (let turn = startTurnIndex; turn <= endTurnIndex; turn++) {
    const modules = TURN_SCHEDULER.getModuleCadenceForTurn(turn);

    for (const player of players) {
      const idempotencyKey = `backfill:${player.id}:${turn}`;
      const existing = await entities.PlayerTurnHistory.filter({
        player_id: player.id,
        global_turn_id: turn,
        backfill_idempotency_key: idempotencyKey,
        backfill_applied: true
      });

      if (existing?.length > 0) {
        results.turns_skipped_idempotent++;
        continue;
      }

      try {
        const stage = await executeTurnModules(player, turn, entities, modules, {
          stageOnly: true,
          debug_turn_economy,
          debug_player_id: player.id
        });

        if (stage.errors?.length) {
          throw new Error(stage.errors.join('; '));
        }

        await applyDeltasForPlayer(entities, player, stage.deltas || {});

        const history = await entities.PlayerTurnHistory.filter({ player_id: player.id, global_turn_id: turn });
        if (history?.[0]) {
          await entities.PlayerTurnHistory.update(history[0].id, {
            backfill_applied: true,
            backfill_applied_at: new Date().toISOString(),
            backfill_idempotency_key: idempotencyKey,
            backfill_deltas_applied: stage.deltas || {},
            status: 'completed'
          });
        } else {
          await entities.PlayerTurnHistory.create({
            player_id: player.id,
            global_turn_id: turn,
            status: 'completed',
            attempt_count: 1,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            deltas_applied: stage.deltas || {},
            backfill_applied: true,
            backfill_applied_at: new Date().toISOString(),
            backfill_idempotency_key: idempotencyKey,
            backfill_deltas_applied: stage.deltas || {}
          });
        }

        Object.assign(player, {
          ...player,
          ...(stage.deltas?.artistProfile || {})
        });

        results.turns_processed++;
      } catch (error) {
        results.turn_errors.push({ player_id: player.id, turn, error: error.message });
      }
    }
  }

  return results;
}

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await requireAdmin(req);
    if (!user) {
      return Response.json({ error: authErr || 'Admin only' }, { status: 403 });
    }

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

    const payload = await req.json().catch(() => ({}));
    const startTurnIndex = Number(payload.startTurnIndex);
    const endTurnIndex = Number(payload.endTurnIndex);

    if (!Number.isFinite(startTurnIndex) || !Number.isFinite(endTurnIndex) || startTurnIndex > endTurnIndex) {
      return Response.json({ error: 'Invalid range. Provide startTurnIndex <= endTurnIndex' }, { status: 400 });
    }

    const result = await runBackfill(entities, {
      startTurnIndex,
      endTurnIndex,
      playerIds: Array.isArray(payload.playerIds) ? payload.playerIds : [],
      debug_turn_economy: !!payload.debug_turn_economy
    });

    return Response.json({ status: 'success', ...result });
  } catch (error) {
    return Response.json({ error: (error as Error).message, stack: (error as Error).stack }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
