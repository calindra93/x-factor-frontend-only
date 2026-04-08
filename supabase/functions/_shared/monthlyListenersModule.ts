/**
 * MONTHLY LISTENERS MODULE - Spotify-style rolling 28-day unique listeners (sole writer)
 *
 * ML = sum of 4 weekly unique listener buckets (w1+w2+w3+w4).
 * This IS the Spotify rolling-28-day model. Bucket rotation every 7 turns
 * provides natural smoothing — no EMA needed.
 *
 * Runs every turn. Reads staged w1-w4 from ctx.stagedFanProfile
 * (populated by fansUpdateModule at order 2, threaded via results.deltas.fanProfile).
 * Falls back to live fanProfile buckets if staged values are unavailable.
 *
 * Month boundary (turn % 30 === 0): snapshots last_monthly_listeners,
 * updates listener_growth_trend.
 */

const COMPRESSION_THRESHOLD = 10_000_000; // log compression kicks in above 10M
const MIN_LISTENERS = 100;

export async function updateMonthlyListenersForPlayer(
  player: any,
  fanProfile: any,
  turnId: any,
  _entities: any,
  ctx: any = {}
): Promise<any> {
  if (!player?.id || !fanProfile) return null;

  // Prefer staged fan profile (written by fansUpdateModule this turn at order 2).
  // Falls back to live DB values if staging unavailable.
  const staged = ctx?.stagedFanProfile || null;
  const src = staged || fanProfile;

  const w1 = Number(src.weekly_unique_w1) || 0;
  const w2 = Number(src.weekly_unique_w2) || 0;
  const w3 = Number(src.weekly_unique_w3) || 0;
  const w4 = Number(src.weekly_unique_w4) || 0;

  const followers = Number(player.followers) || 0;
  // prevML: used as smoothing baseline and event log reference (last turn's written value)
  const prevML = Number(fanProfile.monthly_listeners) || 0;
  // prevMonthML: snapshot from the last month boundary — used for month-over-month growth trend
  const prevMonthML = Number(fanProfile.last_monthly_listeners) || prevML;
  const isMonthBoundary = (Number(turnId) % 30) === 0;

  // Rolling 28-day unique listener count (Spotify model: sum of 4 weekly buckets)
  const unique28 = w1 + w2 + w3 + w4;

  // Log compression above 10M: prevents runaway inflation at mega-scale while keeping
  // lower values fully linear (accurate for 95%+ of players).
  const excess = Math.max(0, unique28 - COMPRESSION_THRESHOLD);
  const compressed = excess > 0
    ? COMPRESSION_THRESHOLD + Math.floor(Math.pow(excess, 0.85))
    : unique28;

  // Absolute floor: ML never drops below 10% of followers
  const followerFloor = Math.max(MIN_LISTENERS, Math.floor(followers * 0.10));
  const finalML = Math.max(compressed, followerFloor);

  const updates: any = {
    monthly_listeners: finalML,
  };
  let monthBoundaryGrowthRate = 0;

  // Month-boundary snapshot and trend metrics
  if (isMonthBoundary) {
    // True month-over-month growth: compare to previous month boundary snapshot
    monthBoundaryGrowthRate = prevMonthML > 0
      ? ((finalML - prevMonthML) / prevMonthML) * 100
      : 0;

    updates.last_monthly_listeners = finalML;
    updates.last_monthly_listeners_turn = Number(turnId);
    updates.listener_growth_trend = Math.round(monthBoundaryGrowthRate);
    // NOTE: retention_rate is intentionally NOT written here.
    // fansUpdateModule (order 2) owns retention_rate + retention_delta as a consistent pair.
    // Writing retention_rate here without updating retention_delta would corrupt the delta.
  }

  console.log(
    `[MonthlyListeners] turn=${turnId} player=${player.artist_name || player.id} ` +
    `buckets=${w1}/${w2}/${w3}/${w4} unique28=${unique28} finalML=${finalML} ` +
    `staged=${!!staged} monthBoundary=${isMonthBoundary}`
  );

  // On month boundaries: month-over-month rate (vs last_monthly_listeners snapshot).
  // On non-boundary turns: turn-over-turn rate (vs previous turn's monthly_listeners).
  // Using prevMonthML on non-boundary turns produces misleadingly large numbers since
  // ML hasn't changed much in a single turn vs. a full month ago.
  const growthRateForEvent = isMonthBoundary
    ? monthBoundaryGrowthRate
    : (prevML > 0 ? ((finalML - prevML) / prevML) * 100 : 0);

  const turnEvent = {
    global_turn_id: Number(turnId),
    player_id: player.id,
    module: 'MonthlyListenersModule',
    event_type: isMonthBoundary ? 'monthly_aggregation' : 'ml_update',
    description: isMonthBoundary
      ? `Monthly listeners: ${finalML.toLocaleString()} (${growthRateForEvent >= 0 ? '+' : ''}${growthRateForEvent.toFixed(1)}%)`
      : `ML updated: ${finalML.toLocaleString()}`,
    deltas: {
      monthly_listeners_snapshot: finalML,
      previous: prevML,
      unique28,
      w1, w2, w3, w4,
      staged: !!staged,
    },
    metadata: {}
  };

  return {
    success: true,
    deltas: {
      fanProfile: updates,
      turn_events: [turnEvent],
    }
  };
}
