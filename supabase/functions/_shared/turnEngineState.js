export function buildTurnCompletionUpdate(turnState, globalTurnId, results, completedAtISO) {
  const safeResults = results || {};

  if (!turnState || turnState.global_turn_id !== globalTurnId) {
    throw new Error(`TurnState guard mismatch for increment. expected=${globalTurnId} actual=${turnState?.global_turn_id}`);
  }

  const nextTurnId = globalTurnId + 1;
  const hasFailures = (safeResults.players_failed || 0) > 0;
  // Include players_already_done (idempotent skips) so total_players reflects the full player set,
  // not just players who were newly processed this run. Also honor an explicit override when passed.
  const totalPlayers = safeResults.total_players != null
    ? safeResults.total_players
    : (safeResults.players_processed || 0) + (safeResults.players_failed || 0) + (safeResults.players_skipped || 0) + (safeResults.players_paused || 0) + (safeResults.players_already_done || 0);

  // Always advance the turn, even if some players failed
  // This prevents a single failing player from blocking global turn advancement
  return {
    status: hasFailures ? 'partial_success' : 'completed',
    players_processed: safeResults.players_processed || 0,
    players_failed: safeResults.players_failed || 0,
    players_skipped: safeResults.players_skipped || 0,
    players_paused: safeResults.players_paused || 0,
    total_players: totalPlayers,
    completed_at: completedAtISO,
    duration_ms: safeResults.duration_ms || 0,
    global_turn_id: nextTurnId,
    current_turn_id: nextTurnId,
    turn_timestamp: completedAtISO
  };
}
