/**
 * chartsScoring.ts — Billboard-style scoring formulas
 *
 * Hot 100 score = weighted sum of:
 *   paid_streams × 1.25
 *   free_streams × 1.00
 *   video_streams × 0.50
 *   track_sales_units × 150.0
 *   radio_impressions × 0.0  (stub — zero-weighted, column reserved)
 *
 * Billboard 200 album_units =
 *   pure_album_sales
 *   + TEA  = track_sales_units / 10
 *   + SEA  = album_streams / 1500
 *
 * All weights are configurable via ChartsWeights (loaded from progression_config or defaults).
 */

export interface ChartsWeights {
  paid_stream_weight: number;       // default 1.25
  free_stream_weight: number;       // default 1.00
  video_stream_weight: number;      // default 0.50
  track_sales_weight: number;       // default 150.0
  radio_weight: number;             // default 0.0 (stub)
  sea_divisor: number;              // default 1500
  tea_divisor: number;              // default 10
}

export const DEFAULT_WEIGHTS: ChartsWeights = {
  paid_stream_weight: 1.25,
  free_stream_weight: 1.00,
  video_stream_weight: 0.50,
  track_sales_weight: 150.0,
  radio_weight: 0.0,
  sea_divisor: 1500,
  tea_divisor: 10,
};

export interface Hot100Metrics {
  paid_streams: number;
  free_streams: number;
  video_streams: number;
  track_sales_units: number;
  radio_impressions: number;
}

export interface BB200Metrics {
  pure_album_sales: number;
  track_sales_units: number;
  album_streams: number;  // total on-demand audio+video streams of all tracks on album
}

/**
 * Compute Hot 100 score for a song over its tracking window.
 * Higher = better rank.
 */
export function computeHot100Score(
  metrics: Hot100Metrics,
  weights: ChartsWeights = DEFAULT_WEIGHTS
): number {
  return (
    metrics.paid_streams * weights.paid_stream_weight +
    metrics.free_streams * weights.free_stream_weight +
    metrics.video_streams * weights.video_stream_weight +
    metrics.track_sales_units * weights.track_sales_weight +
    metrics.radio_impressions * weights.radio_weight
  );
}

/**
 * Compute Billboard 200 album units for an album over its tracking window.
 * album_units = pure_album_sales + TEA + SEA
 */
export function computeBB200AlbumUnits(
  metrics: BB200Metrics,
  weights: ChartsWeights = DEFAULT_WEIGHTS
): { album_units: number; tea_units: number; sea_units: number } {
  const tea_units = metrics.track_sales_units / weights.tea_divisor;
  const sea_units = metrics.album_streams / weights.sea_divisor;
  const album_units = metrics.pure_album_sales + tea_units + sea_units;
  return { album_units, tea_units, sea_units };
}

/**
 * Tie-breaking comparator for chart entries.
 * Primary: score DESC
 * Secondary: metric_streams DESC
 * Tertiary: entity_id ASC (deterministic stable sort)
 */
export function compareChartEntries(
  a: { score: number; metric_streams: number; entity_id: string },
  b: { score: number; metric_streams: number; entity_id: string }
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.metric_streams !== a.metric_streams) return b.metric_streams - a.metric_streams;
  return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
}

/**
 * Attribute region_streams from a release's jsonb breakdown.
 *
 * region_scope controls which region buckets are summed:
 *   'USA'        — only key 'USA' (or 'us','united states' normalized)
 *   'Global'     — sum ALL regions
 *   'GlobalExUS' — sum all regions EXCEPT USA
 *   'Region'     — only the specific regionCode
 *
 * Falls back to total streams when region breakdown is unavailable.
 */
export function attributeStreamsForScope(
  totalStreams: number,
  regionStreams: Record<string, number> | null | undefined,
  regionScope: 'USA' | 'Global' | 'GlobalExUS' | 'Region',
  regionCode?: string
): number {
  if (!regionStreams || Object.keys(regionStreams).length === 0) {
    // No regional breakdown — apply scope discount heuristic
    if (regionScope === 'USA') return Math.floor(totalStreams * 0.40); // ~40% USA
    if (regionScope === 'GlobalExUS') return Math.floor(totalStreams * 0.60);
    return totalStreams; // Global
  }

  const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s_-]/g, '');
  const USA_KEYS = new Set(['usa', 'us', 'unitedstates', 'unitedstatesofamerica']);

  const isUSA = (k: string) => USA_KEYS.has(normalizeKey(k));

  let total = 0;

  if (regionScope === 'USA') {
    for (const [k, v] of Object.entries(regionStreams)) {
      if (isUSA(k)) total += Number(v) || 0;
    }
  } else if (regionScope === 'Global') {
    for (const v of Object.values(regionStreams)) total += Number(v) || 0;
  } else if (regionScope === 'GlobalExUS') {
    for (const [k, v] of Object.entries(regionStreams)) {
      if (!isUSA(k)) total += Number(v) || 0;
    }
  } else if (regionScope === 'Region' && regionCode) {
    const normalTarget = normalizeKey(regionCode);
    for (const [k, v] of Object.entries(regionStreams)) {
      if (normalizeKey(k) === normalTarget) total += Number(v) || 0;
    }
  }

  return total;
}

/**
 * Aggregate release_turn_metrics rows over a window [startTurn, endTurn]
 * for a specific region scope.
 *
 * Returns a map: entity_id → aggregated metrics object.
 */
export interface AggregatedMetrics {
  entity_id: string;
  artist_id: string;
  metric_streams: number;
  metric_paid_streams: number;
  metric_free_streams: number;
  metric_video_streams: number;
  metric_sales_units: number;
  metric_radio_impressions: number;
  metric_pure_album_sales: number;
  lifetime_streams: number; // max across turns (for certification)
}

export function aggregateWindowMetrics(
  rows: Array<{
    release_id: string;
    artist_id: string;
    streams_this_turn: number;
    paid_streams: number;
    free_streams: number;
    video_streams: number;
    region_streams: Record<string, number> | null;
    track_sales_units: number;
    album_sales_units: number;
    radio_impressions: number;
    lifetime_streams: number;
  }>,
  regionScope: 'USA' | 'Global' | 'GlobalExUS' | 'Region',
  regionCode?: string
): Map<string, AggregatedMetrics> {
  const acc = new Map<string, AggregatedMetrics>();

  for (const row of rows) {
    const scopedStreams = attributeStreamsForScope(
      row.streams_this_turn,
      row.region_streams,
      regionScope,
      regionCode
    );
    // Proportionally scale paid/free/video to scoped total
    const rawTotal = row.streams_this_turn || 1;
    const ratio = scopedStreams / rawTotal;

    const existing = acc.get(row.release_id);
    if (existing) {
      existing.metric_streams += scopedStreams;
      existing.metric_paid_streams += Math.floor((row.paid_streams || 0) * ratio);
      existing.metric_free_streams += Math.floor((row.free_streams || 0) * ratio);
      existing.metric_video_streams += Math.floor((row.video_streams || 0) * ratio);
      existing.metric_sales_units += row.track_sales_units || 0;
      existing.metric_radio_impressions += row.radio_impressions || 0;
      existing.metric_pure_album_sales += row.album_sales_units || 0;
      existing.lifetime_streams = Math.max(existing.lifetime_streams, row.lifetime_streams || 0);
    } else {
      acc.set(row.release_id, {
        entity_id: row.release_id,
        artist_id: row.artist_id,
        metric_streams: scopedStreams,
        metric_paid_streams: Math.floor((row.paid_streams || 0) * ratio),
        metric_free_streams: Math.floor((row.free_streams || 0) * ratio),
        metric_video_streams: Math.floor((row.video_streams || 0) * ratio),
        metric_sales_units: row.track_sales_units || 0,
        metric_radio_impressions: row.radio_impressions || 0,
        metric_pure_album_sales: row.album_sales_units || 0,
        lifetime_streams: row.lifetime_streams || 0,
      });
    }
  }

  return acc;
}
