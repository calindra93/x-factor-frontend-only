export function inferNotificationTurnIndex(notif) {
  if (!notif || typeof notif !== 'object') return null;

  const orderedFields = [notif.created_turn_index, notif.turn_id, notif.global_turn_id];
  const inferred = orderedFields.map((v) => Number(v)).find((v) => Number.isFinite(v));
  return Number.isFinite(inferred) ? inferred : null;
}

function formatTurnAge(notifTurn, currentTurnIndex, turnsPerDay) {
  const currentTurn = Number(currentTurnIndex);
  if (!Number.isFinite(notifTurn) || !Number.isFinite(currentTurn)) return 'Unknown Age';

  const ageTurns = Math.max(0, currentTurn - notifTurn);
  const ageDays = Math.floor(ageTurns / turnsPerDay);

  if (ageDays <= 0) return 'Now';
  if (ageDays === 1) return '1 Day Ago';
  return `${ageDays} Days Ago`;
}

export function formatRelativeTurnLabel(notif, currentTurnIndex, turnsPerDay = 1) {
  const notifTurn = inferNotificationTurnIndex(notif);
  if (Number.isFinite(notifTurn)) {
    return formatTurnAge(notifTurn, currentTurnIndex, turnsPerDay);
  }

  const createdAt = notif?.created_at ? new Date(notif.created_at) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = Math.floor(Math.max(0, ageMs) / (24 * 60 * 60 * 1000));
    if (ageDays <= 0) return 'Now (Real Time Fallback)';
    if (ageDays === 1) return '1 Day Ago (Real Time Fallback)';
    return `${ageDays} Days Ago (Real Time Fallback)`;
  }

  return 'Unknown Age';
}
