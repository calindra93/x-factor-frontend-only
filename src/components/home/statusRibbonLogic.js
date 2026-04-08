export const formatInGameDate = (turnId) => {
  const safeTurnId = Number.isFinite(Number(turnId)) && Number(turnId) >= 0 ? Number(turnId) : 0;
  const inGameDate = new Date(Date.UTC(2020, 0, 1));
  inGameDate.setUTCDate(inGameDate.getUTCDate() + safeTurnId);

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(inGameDate);
};

const parseTurnTimestamp = (timestamp) => {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getLatestTurnState = (turnStates) => {
  if (!Array.isArray(turnStates) || turnStates.length === 0) {
    return null;
  }

  let latest = null;

  for (const state of turnStates) {
    const turnId = Number(state?.current_turn_id);
    if (!Number.isFinite(turnId) || turnId < 0) {
      continue;
    }

    const timestamp = parseTurnTimestamp(state?.turn_timestamp);
    if (!latest || turnId > latest.currentTurnId) {
      latest = { currentTurnId: turnId, turnTimestamp: timestamp };
      continue;
    }

    if (turnId === latest.currentTurnId && timestamp && (!latest.turnTimestamp || timestamp > latest.turnTimestamp)) {
      latest = { currentTurnId: turnId, turnTimestamp: timestamp };
    }
  }

  return latest;
};

export const getCurrentTurnId = (turnStates) => {
  return getLatestTurnState(turnStates)?.currentTurnId ?? null;
};

export const getNextTurnDiffMs = (now, turnTimestamp) => {
  const nowDate = now instanceof Date ? now : new Date(now);
  const validNow = Number.isNaN(nowDate.getTime()) ? new Date() : nowDate;
  const lastTurnDate = parseTurnTimestamp(turnTimestamp);

  if (!lastTurnDate) {
    const nextHour = new Date(validNow);
    nextHour.setHours(validNow.getHours() + 1, 0, 0, 0);
    return Math.max(0, nextHour.getTime() - validNow.getTime());
  }

  const nextTurnDate = new Date(lastTurnDate.getTime() + (60 * 60 * 1000));
  return Math.max(0, nextTurnDate.getTime() - validNow.getTime());
};
