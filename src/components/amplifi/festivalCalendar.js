export const FESTIVAL_TURNS_PER_YEAR = 365;
export const FESTIVAL_INGAME_EPOCH = new Date('2020-01-01T00:00:00Z');
export const FESTIVAL_MIN_APPS_OPEN_DURATION = 7;
export const FESTIVAL_MIN_REVIEW_DURATION = 3;
export const FESTIVAL_MIN_SETLIST_WINDOW = 5;
export const FESTIVAL_IDEAL_APPS_LEAD_TIME = 21;

export function turnToFestivalDate(turnId) {
  if (turnId == null || Number.isNaN(Number(turnId))) return null;
  const date = new Date(FESTIVAL_INGAME_EPOCH);
  date.setUTCDate(date.getUTCDate() + Number(turnId));
  return date;
}

export function formatFestivalTurnDate(turnId) {
  const date = turnToFestivalDate(turnId);
  if (!date) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function turnForFestivalWeek(year, week) {
  if (year == null || !week) return null;
  return year * FESTIVAL_TURNS_PER_YEAR + (Number(week) - 1) * 7;
}

export function getFestivalStartTurnFromInstance(instance) {
  return turnForFestivalWeek(instance?.in_game_year, instance?.window_week);
}

export function getFestivalEndTurn(instance) {
  const startTurn = getFestivalStartTurnFromInstance(instance);
  if (startTurn == null) return null;
  return startTurn + Math.max(1, Number(instance?.day_count || 1)) - 1;
}

export function getEffectiveFestivalStatus(instance, currentTurn) {
  const storedStatus = String(instance?.status || 'SCHEDULED').toUpperCase();
  const turn = Number(currentTurn);
  if (!Number.isFinite(turn)) return storedStatus;
  if (storedStatus === 'COMPLETE' || storedStatus === 'LIVE') return storedStatus;

  const lineupLockTurn = Number(instance?.lineup_lock_turn_id);
  const applicationsCloseTurn = Number(instance?.applications_close_turn_id);
  const applicationsOpenTurn = Number(instance?.applications_open_turn_id);

  if (Number.isFinite(lineupLockTurn) && turn >= lineupLockTurn) {
    return storedStatus === 'COMPLETE' ? 'COMPLETE' : 'LOCKED';
  }

  if (Number.isFinite(applicationsCloseTurn) && turn >= applicationsCloseTurn) {
    return storedStatus === 'LOCKED' || storedStatus === 'LIVE' || storedStatus === 'COMPLETE'
      ? storedStatus
      : 'CLOSED';
  }

  if (Number.isFinite(applicationsOpenTurn) && turn >= applicationsOpenTurn) {
    return storedStatus === 'CLOSED' || storedStatus === 'LOCKED' || storedStatus === 'LIVE' || storedStatus === 'COMPLETE'
      ? storedStatus
      : 'OPEN';
  }

  return storedStatus;
}

export function resolveFestivalPreviewYear(currentTurn, seasonalWindows = []) {
  const currentYear = Math.floor(Number(currentTurn || 0) / FESTIVAL_TURNS_PER_YEAR);
  const currentWeek = Math.ceil(((Number(currentTurn || 0) % FESTIVAL_TURNS_PER_YEAR) + 1) / 7) || 1;
  const weeks = seasonalWindows.map((window) => Number(window?.week || 0)).filter(Boolean).sort((a, b) => a - b);
  if (!weeks.length) return currentYear;
  return weeks.some((week) => week >= currentWeek) ? currentYear : currentYear + 1;
}

export function buildFestivalPreviewInstance(festival, currentTurn) {
  const previewYear = resolveFestivalPreviewYear(currentTurn, festival?.seasonal_windows || []);
  const previewWeek = Number(festival?.seasonal_windows?.[0]?.week || 0);
  const startTurn = turnForFestivalWeek(previewYear, previewWeek);
  if (startTurn == null) {
    return {
      id: null,
      festival_id: festival?.id,
      festival,
      status: 'SCHEDULED',
      in_game_year: previewYear,
      window_week: previewWeek,
      applications_open_turn_id: null,
      applications_close_turn_id: null,
      lineup_lock_turn_id: null,
      day_count: festival?.day_count,
    };
  }

  const lineupLockTurn = startTurn - FESTIVAL_MIN_SETLIST_WINDOW;
  const applicationsCloseTurn = lineupLockTurn - FESTIVAL_MIN_REVIEW_DURATION;
  const applicationsOpenTurn = Math.max(Number(currentTurn || 0), startTurn - FESTIVAL_IDEAL_APPS_LEAD_TIME);

  return {
    id: null,
    festival_id: festival?.id,
    festival,
    status: 'SCHEDULED',
    in_game_year: previewYear,
    window_week: previewWeek,
    applications_open_turn_id: applicationsOpenTurn,
    applications_close_turn_id: applicationsCloseTurn,
    lineup_lock_turn_id: lineupLockTurn,
    day_count: festival?.day_count,
  };
}
