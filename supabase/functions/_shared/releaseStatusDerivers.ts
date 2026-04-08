/**
 * RELEASE STATUS DERIVERS
 *
 * Pure helper functions extracted from turnScheduler.ts career-trend derivation block.
 * These compute the three scheduling signals used by evaluateCareerTrend():
 *   - consecutiveFlops
 *   - hasChartingRelease
 *   - chartPresenceRate
 *
 * Plan 016 §7.6: These helpers prefer final_outcome_class when present, falling back
 * to legacy lifecycle_state. This dual-read pattern enables gradual migration without
 * breaking existing behavior.
 *
 * PURE FUNCTIONS — no DB access, no side effects.
 */

// PUBLIC_INTERFACE
/**
 * Minimal release shape required by the deriver functions.
 * Uses `final_outcome_class` (new) with fallback to `lifecycle_state` (legacy).
 */
export interface ReleaseForDeriver {
  id: string;
  lifecycle_state?: string | null;
  /** Plan 016 §4 — immutable final outcome; preferred over lifecycle_state for terminal checks */
  final_outcome_class?: string | null;
}

// PUBLIC_INTERFACE
/**
 * Minimal chart entry shape: entity_id links to release id.
 */
export interface ChartEntryForDeriver {
  entity_id: string;
  position?: number | null;
  peak_position?: number | null;
  weeks_on_chart?: number | null;
  chart_runs?: { global_turn_id?: number | null } | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the effective terminal-outcome label for a release.
 * Plan 016 §7.6 dual-read: prefer final_outcome_class if non-null, else lifecycle_state.
 */
function effectiveOutcome(rel: ReleaseForDeriver): string | null {
  return rel.final_outcome_class ?? rel.lifecycle_state ?? null;
}

// PUBLIC_INTERFACE
/**
 * Compute consecutive flops from most-recent releases backward.
 *
 * A release is a "flop" if:
 *   1) Its effective outcome (final_outcome_class ?? lifecycle_state) is 'Flop',
 *      'Archived', or 'Declining' — AND
 *   2) It never appeared on any chart (entity_id not in the chart entries set).
 *
 * Stops at the first non-flop release (chronological order, most-recent-first).
 *
 * @param allReleases - Releases ordered most-recent first.
 * @param chartEntries - All chart entries for this artist.
 * @returns Number of consecutive flops from most-recent release backward.
 */
export function computeConsecutiveFlops(
  allReleases: ReleaseForDeriver[],
  chartEntries: ChartEntryForDeriver[],
): number {
  const entityIdsWithChart = new Set(chartEntries.map((c) => c.entity_id));
  let count = 0;

  for (const rel of allReleases) {
    const outcome = effectiveOutcome(rel);
    const isFlop =
      (outcome === 'Declining' || outcome === 'Archived' || outcome === 'Flop') &&
      !entityIdsWithChart.has(rel.id);

    if (isFlop) {
      count++;
    } else {
      break; // stop at first non-flop
    }
  }

  return count;
}

// PUBLIC_INTERFACE
/**
 * Returns true if any release is currently in an active/hot phase.
 *
 * Checks lifecycle_state only — active phases (Hot, Trending, Momentum) are never
 * stored in final_outcome_class, so no dual-read is needed here.
 *
 * @param allReleases - Any order of releases.
 * @returns true if at least one release is Hot, Trending, or Momentum.
 */
export function computeHasChartingRelease(allReleases: ReleaseForDeriver[]): boolean {
  return allReleases.some(
    (r) =>
      r.lifecycle_state === 'Hot' ||
      r.lifecycle_state === 'Trending' ||
      r.lifecycle_state === 'Momentum',
  );
}

// PUBLIC_INTERFACE
/**
 * Compute chart presence rate: fraction of the last N turns that had at least
 * one chart entry for this artist.
 *
 * @param chartEntries - All chart entries with chart_runs join.
 * @param globalTurnId - Current game turn id.
 * @param lookbackTurns - Number of turns to look back (default: 12).
 * @param fallbackHasChartingRelease - If true and no recent entries, return 0.25 fallback.
 * @returns Rate [0, 1].
 */
export function computeChartPresenceRate(
  chartEntries: ChartEntryForDeriver[],
  globalTurnId: number,
  lookbackTurns = 12,
  fallbackHasChartingRelease = false,
): number {
  const recentEntries = chartEntries.filter(
    (c) => ((c.chart_runs as any)?.global_turn_id ?? 0) >= globalTurnId - lookbackTurns,
  );

  if (recentEntries.length === 0) {
    return fallbackHasChartingRelease ? 0.25 : 0;
  }

  const turnsWithChart = new Set(
    recentEntries.map((c) => (c.chart_runs as any)?.global_turn_id),
  );
  return Math.min(1, turnsWithChart.size / lookbackTurns);
}
