/**
 * Turn Math Utilities — Pure, stateless calculations for turn progression.
 * Single source of truth for all turn/date logic.
 *
 * IMPORTANT:
 * - Turn index is the only source of truth for in-game calendar display.
 * - Turn 0 epoch: 2020-01-01 00:00:00 UTC (Wed, Jan 1, 2020)
 * - Real scheduler cadence is hourly, but game calendar progression is turn-based.
 */

const TURN_INTERVAL_MS = 60 * 60 * 1000; // Real turn scheduler cadence (1 hour)

// Inferred from scheduler cadence semantics: weekly modules run every 7 turns
// and monthly modules run every 30 turns, so one turn maps to one in-game day.
export const TURNS_PER_GAME_DAY = 1;

const GAME_START_YEAR = 2020;
const GAME_START_MONTH_INDEX = 0; // January
const GAME_START_DAY = 1;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toSafeTurnIndex(turnIndex) {
  const parsed = Number(turnIndex);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

/**
 * Convert turn index to in-game date parts.
 *
 * Math:
 * - Start from Jan 1, 2020 UTC.
 * - Convert turns to elapsed in-game days.
 * - Because TURNS_PER_GAME_DAY = 1, day offset equals turn index.
 *
 * @param {number} turnIndex
 * @returns {{ weekday: string, month: string, day: number, year: number }}
 */
export function turnIndexToGameDate(turnIndex) {
  const safeTurnIndex = toSafeTurnIndex(turnIndex);
  const dayOffset = Math.floor(safeTurnIndex / TURNS_PER_GAME_DAY);
  const gameDate = new Date(Date.UTC(GAME_START_YEAR, GAME_START_MONTH_INDEX, GAME_START_DAY + dayOffset));

  return {
    weekday: WEEKDAY_SHORT[gameDate.getUTCDay()],
    month: MONTH_SHORT[gameDate.getUTCMonth()],
    day: gameDate.getUTCDate(),
    year: gameDate.getUTCFullYear()
  };
}

/**
 * Calculate current turn ID based on turn timestamp and current time.
 * Pure function; relies on caller providing accurate timestamps.
 */
export function calculateCurrentTurnId(turnTimestamp, now = new Date()) {
  if (!turnTimestamp) return 0;

  const turnDate = new Date(turnTimestamp);
  const nowDate = now instanceof Date ? now : new Date(now);

  const elapsedMs = nowDate.getTime() - turnDate.getTime();
  const turnsSinceLastUpdate = Math.floor(elapsedMs / TURN_INTERVAL_MS);

  return Math.max(0, turnsSinceLastUpdate);
}

/**
 * Calculate time (in ms) until the next turn fires.
 */
export function calculateNextTurnDiffMs(turnTimestamp, _currentTurnId = 0, now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  // Turn scheduler runs on the top of every UTC hour.
  // Use UTC hour boundaries directly so countdown always matches cron cadence.
  const nextUtcHour = new Date(nowDate);
  nextUtcHour.setUTCMinutes(0, 0, 0);
  nextUtcHour.setUTCHours(nowDate.getUTCHours() + 1);
  return Math.max(0, nextUtcHour.getTime() - nowDate.getTime());
}

export function formatInGameDate(turnIndex) {
  const { weekday, month, day, year } = turnIndexToGameDate(turnIndex);
  return `${weekday}, ${month} ${day}, ${year}`;
}

export function formatInGameDateLong(turnIndex) {
  const safeTurnIndex = toSafeTurnIndex(turnIndex);
  const dayOffset = Math.floor(safeTurnIndex / TURNS_PER_GAME_DAY);
  const gameDate = new Date(Date.UTC(GAME_START_YEAR, GAME_START_MONTH_INDEX, GAME_START_DAY + dayOffset));
  return `${WEEKDAY_LONG[gameDate.getUTCDay()]}, ${MONTH_LONG[gameDate.getUTCMonth()]} ${gameDate.getUTCDate()}, ${gameDate.getUTCFullYear()}`;
}

/**
 * Format milliseconds as MM:SS countdown.
 */
export function formatCountdown(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get next turn timestamp based on current turn.
 */
export function getNextTurnTimestamp(turnTimestamp) {
  const turnDate = new Date(turnTimestamp);
  return new Date(turnDate.getTime() + TURN_INTERVAL_MS);
}
