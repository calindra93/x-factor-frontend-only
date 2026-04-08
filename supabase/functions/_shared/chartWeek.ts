/**
 * chartWeek.ts — Turn-to-week mapping helpers
 *
 * Billboard cadence simulation:
 *   turn_of_week 1 = Friday   (tracking starts)
 *   turn_of_week 2 = Saturday
 *   turn_of_week 3 = Sunday   (top-10 preview)
 *   turn_of_week 4 = Monday
 *   turn_of_week 5 = Tuesday  (full chart publish, or Wednesday if holiday)
 *   turn_of_week 6 = Wednesday
 *   turn_of_week 7 = Thursday (tracking ends — chart computed after this turn)
 *
 * Base anchor: BASE_TURN is treated as a Friday (turn_of_week = 1).
 * chart_week_key = floor((globalTurnId - BASE_TURN) / 7)
 *   — increments every 7 turns, uniquely identifies a chart week.
 */

export const BASE_TURN = 1; // Turn 1 is a Friday

export type TurnOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ChartWeekInfo {
  /** 1 = Friday … 7 = Thursday */
  turn_of_week: TurnOfWeek;
  /** Integer bucket that increments every 7 turns */
  chart_week_key: number;
  /** Friday turn that opens this week's tracking window */
  tracking_start_turn: number;
  /** Thursday turn that closes this week's tracking window */
  tracking_end_turn: number;
  /** Sunday turn — top-10 preview becomes visible */
  preview_turn: number;
  /** Tuesday turn (or Wednesday if holiday shifted) — full chart published */
  publish_turn: number;
  /** Saturday following publish — chart post-date (Billboard dating convention) */
  post_date_turn: number;
  /** True if this turn is the last turn of the tracking window (Thursday) */
  is_tracking_end: boolean;
}

/**
 * Compute chart week information for a given globalTurnId.
 *
 * @param globalTurnId   Current turn number
 * @param holidayMondays Optional set of turn IDs that are Monday holidays.
 *                       If the Monday of this chart week is a holiday,
 *                       publish_turn shifts from Tuesday to Wednesday.
 */
export function getChartWeekInfo(
  globalTurnId: number,
  holidayMondays: Set<number> = new Set()
): ChartWeekInfo {
  const offset = globalTurnId - BASE_TURN;
  // turn_of_week: 1..7 (1 = Friday)
  const turn_of_week = ((offset % 7) + 7) % 7 + 1 as TurnOfWeek;
  const chart_week_key = Math.floor(offset / 7);

  // tracking_start_turn = the Friday of this week
  const tracking_start_turn = globalTurnId - (turn_of_week - 1);
  // tracking_end_turn = the Thursday = Friday + 6
  const tracking_end_turn = tracking_start_turn + 6;

  // preview_turn = Sunday = Friday + 2
  const preview_turn = tracking_start_turn + 2;

  // Monday of this week = tracking_start_turn + 3
  const monday_turn = tracking_start_turn + 3;
  const isHoliday = holidayMondays.has(monday_turn);

  // publish_turn = Tuesday (+4) or Wednesday (+5) if holiday
  const publish_turn = isHoliday
    ? tracking_start_turn + 5
    : tracking_start_turn + 4;

  // post_date_turn = following Saturday = publish_turn + 4
  const post_date_turn = publish_turn + 4;

  return {
    turn_of_week,
    chart_week_key,
    tracking_start_turn,
    tracking_end_turn,
    preview_turn,
    publish_turn,
    post_date_turn,
    is_tracking_end: turn_of_week === 7,
  };
}

/**
 * Determine the visibility status of a chart run relative to currentTurnId.
 *
 * Returns:
 *   'hidden'    — chart not yet previewed (before Sunday)
 *   'preview'   — top-10 only visible (Sunday to Tuesday exclusive)
 *   'published' — full chart visible (Tuesday/Wednesday onwards)
 */
export type ChartVisibility = 'hidden' | 'preview' | 'published';

export function getChartVisibility(
  currentTurnId: number,
  preview_turn: number,
  publish_turn: number
): ChartVisibility {
  if (currentTurnId >= publish_turn) return 'published';
  if (currentTurnId >= preview_turn) return 'preview';
  return 'hidden';
}

/**
 * For a given currentTurnId, find the chart_week_key of the last
 * completed tracking window (i.e. the last Thursday that has passed).
 * Returns null if no complete week has elapsed since BASE_TURN.
 */
export function getLastCompletedWeekKey(currentTurnId: number): number | null {
  const info = getChartWeekInfo(currentTurnId);
  // If we're in the middle of a week, the last completed week is week_key - 1
  // If we're exactly on Thursday (tracking_end), that week just closed
  if (info.is_tracking_end) return info.chart_week_key;
  if (info.chart_week_key === 0 && info.turn_of_week < 7) return null;
  return info.chart_week_key - 1;
}

/**
 * Given a chart_week_key, return the canonical turns for that week.
 */
export function getWeekTurns(weekKey: number): {
  tracking_start_turn: number;
  tracking_end_turn: number;
  preview_turn: number;
  publish_turn: number;
  post_date_turn: number;
  chart_week_key: number;
} {
  const tracking_start_turn = BASE_TURN + weekKey * 7;
  const tracking_end_turn = tracking_start_turn + 6;
  const preview_turn = tracking_start_turn + 2;
  const publish_turn = tracking_start_turn + 4;
  const post_date_turn = publish_turn + 4;
  return {
    tracking_start_turn,
    tracking_end_turn,
    preview_turn,
    publish_turn,
    post_date_turn,
    chart_week_key: weekKey,
  };
}
