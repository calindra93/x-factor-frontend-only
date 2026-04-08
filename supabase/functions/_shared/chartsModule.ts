/**
 * chartsModule.ts — Billboard-style chart generation module
 *
 * Runs ONCE per turn in the global post-player section of turnEngine.ts,
 * AFTER all player streams are finalized and release_turn_metrics is written.
 *
 * Responsibilities:
 *   • Always generate DAILY chart runs every turn.
 *   • Generate WEEKLY chart runs ONLY on Thursday turns (turn_of_week === 7).
 *   • Compute movement, peak_position, weeks_on_chart for weekly runs.
 *   • Never re-simulate streams — reads only from release_turn_metrics.
 *   • All writes are idempotent via UNIQUE constraints + upserts.
 *   • Emits chart/certification notifications.
 *
 * Integration point: called after chartUpdateModule (v1 legacy) in turnEngine.ts.
 * The v1 module is kept for backward compatibility; v2 runs independently.
 */

import {
  getChartWeekInfo,
  getChartVisibility,
} from './chartWeek.ts';

import {
  DEFAULT_WEIGHTS,
  ChartsWeights,
  computeHot100Score,
  computeBB200AlbumUnits,
  compareChartEntries,
  aggregateWindowMetrics,
  AggregatedMetrics,
} from './chartsScoring.ts';

import { getStageIndex } from './constants/careerStages.ts';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ChartDefinition {
  chart_id: string;
  chart_key: string;
  entity_type: 'song' | 'album';
  cadence: 'daily' | 'weekly';
  region_scope: 'USA' | 'Global' | 'GlobalExUS' | 'Region';
  region_code: string | null;
  limit_size: number;
  is_active: boolean;
}

interface ChartRun {
  run_id: string;
  chart_id: string;
  tracking_start_turn: number;
  tracking_end_turn: number;
  chart_week_key: number;
  preview_turn: number;
  publish_turn: number;
  post_date_turn: number;
  status: 'generated' | 'published';
}

interface ChartEntry {
  run_id: string;
  entity_id: string;
  artist_id: string;
  position: number;
  score: number;
  metric_streams: number;
  metric_paid_streams: number;
  metric_free_streams: number;
  metric_video_streams: number;
  metric_sales_units: number;
  metric_radio_impressions: number;
  metric_pure_album_sales: number;
  metric_tea_units: number;
  metric_sea_units: number;
  previous_position: number | null;
  movement: number | null;
  peak_position: number;
  weeks_on_chart: number;
  debut_flag: boolean;
  new_peak_flag?: boolean;
}

interface DailyChartHistoryRow {
  chart_id: string;
  entity_id: string;
  artist_id: string;
  global_turn_id: number;
  position: number;
  score: number;
  metric_streams: number;
  peak_position_so_far: number;
  days_on_chart: number;
  first_seen_turn: number;
  last_seen_turn: number;
}

interface ChartSummaryMove {
  entity_id: string;
  position: number;
  previous_position: number | null;
  movement: number;
  debut_flag: boolean;
}

interface ChartSummaryByArtist {
  total_entries: number;
  debuts: number;
  moved_up: number;
  moved_down: number;
  new_peaks: number;
  number_ones: number;
  top_moves: ChartSummaryMove[];
}

interface WeeklyChartHistory {
  position: number | null;
  peak_position: number;
  weeks_on_chart: number;
}

// ─────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────

export async function processChartsV2ForTurn(
  globalTurnId: number,
  supabaseClient: any,
  ctx: any = {},
  firstPlayerId?: string | null
): Promise<{ success: boolean; runs_created: number; entries_written: number; errors: string[]; chart_summaries_by_artist: Record<string, ChartSummaryByArtist> }> {
  const errors: string[] = [];
  let runs_created = 0;
  let entries_written = 0;
  const chart_summaries_by_artist: Record<string, ChartSummaryByArtist> = {};

  try {
    // 1. Load chart week info
    const weekInfo = getChartWeekInfo(globalTurnId);

    // 2. Load holiday set (for publish shift)
    let holidayMondays = new Set<number>();
    try {
      const { data: holidays } = await supabaseClient
        .from('chart_holidays')
        .select('turn_id');
      for (const h of holidays || []) holidayMondays.add(Number(h.turn_id));
    } catch (_) {
      console.warn('[chartsModule] chart_holidays fetch failed (non-fatal) — using no-holiday schedule');
    }

    // Re-compute with holidays
    const weekInfoFinal = getChartWeekInfo(globalTurnId, holidayMondays);

    // 3. Load chart definitions
    const { data: chartDefs, error: defErr } = await supabaseClient
      .from('chart_definitions')
      .select('*')
      .eq('is_active', true);
    if (defErr) throw new Error(`Failed to load chart_definitions: ${defErr.message}`);

    // 4. Use default scoring weights (charts_config column removed)
    const weights: ChartsWeights = { ...DEFAULT_WEIGHTS };

    // 5. Process each chart definition
    for (const def of chartDefs as ChartDefinition[]) {
      try {
        if (def.cadence === 'daily') {
          await processDailyChart(
            def, globalTurnId, weekInfoFinal,
            supabaseClient, weights
          );
          runs_created++;
          entries_written += def.limit_size; // approximate
        } else if (def.cadence === 'weekly' && weekInfoFinal.is_tracking_end) {
          // Weekly charts only generated on Thursday (turn_of_week === 7)
          const result = await processWeeklyChart(
            def, globalTurnId, weekInfoFinal,
            supabaseClient, weights
          );
          runs_created++;
          entries_written += result.entries_count;
          mergeChartSummaries(chart_summaries_by_artist, result.chart_summaries_by_artist);
        }
      } catch (chartErr: any) {
        const msg = `[ChartsV2] chart_key=${def.chart_key} turn=${globalTurnId}: ${chartErr?.message || String(chartErr)}`;
        errors.push(msg);
        console.error(msg);
      }
    }

    // 6. Mark weekly runs as 'published' once publish_turn arrives
    // (This is idempotent — updates status for runs where current turn >= publish_turn)
    if (!weekInfoFinal.is_tracking_end) {
      await markPublishedRuns(globalTurnId, supabaseClient);
    }

    // 7. Log turn event (global event, requires firstPlayerId for NOT NULL constraint)
    if (firstPlayerId) {
      try {
        await supabaseClient.from('turn_event_log').insert({
          global_turn_id: globalTurnId,
          player_id: firstPlayerId,
          module: 'charts',
          event_type: 'charts_v2_generated',
          description: `Charts v2: runs_created=${runs_created}, entries=${entries_written}, errors=${errors.length}`,
          metadata: {
            turn_of_week: weekInfoFinal.turn_of_week,
            is_tracking_end: weekInfoFinal.is_tracking_end,
            chart_week_key: weekInfoFinal.chart_week_key,
            runs_created,
            entries_written,
            errors: errors.slice(0, 5),
          },
        });
      } catch (_) { /* non-fatal logging */ }
    } else {
      console.warn('[chartsModule] Skipping charts_v2_generated event — no firstPlayerId available');
    }

  } catch (outerErr: any) {
    const msg = outerErr?.message || String(outerErr);
    errors.push(msg);
    console.error(`[ChartsV2] Fatal error turn=${globalTurnId}: ${msg}`);
    return { success: false, runs_created, entries_written, errors, chart_summaries_by_artist };
  }

  return { success: errors.length === 0, runs_created, entries_written, errors, chart_summaries_by_artist };
}

// ─────────────────────────────────────────────────────────────
// Daily chart processing
// ─────────────────────────────────────────────────────────────

async function processDailyChart(
  def: ChartDefinition,
  globalTurnId: number,
  weekInfo: ReturnType<typeof getChartWeekInfo>,
  supabaseClient: any,
  weights: ChartsWeights
): Promise<void> {
  // For daily charts, tracking window = single turn
  const tracking_start_turn = globalTurnId;
  const tracking_end_turn = globalTurnId;

  // Check idempotency — skip if run already exists for this turn
  const { data: existingRun } = await supabaseClient
    .from('chart_runs')
    .select('run_id')
    .eq('chart_id', def.chart_id)
    .eq('tracking_end_turn', tracking_end_turn)
    .maybeSingle();

  if (existingRun) return; // Already generated this turn — idempotent exit

  // Load metrics for this single turn
  const { data: metrics, error: metricsErr } = await supabaseClient
    .from('release_turn_metrics')
    .select('release_id, artist_id, streams_this_turn, paid_streams, free_streams, video_streams, region_streams, track_sales_units, album_sales_units, radio_impressions, lifetime_streams')
    .eq('global_turn_id', globalTurnId)
    .gt('streams_this_turn', 0);

  if (metricsErr) throw new Error(`metrics query: ${metricsErr.message}`);

  let dailyMetrics = metrics || [];

  // BB200 album charts: filter to Album/EP releases only (exclude Singles)
  if (def.entity_type === 'album' && dailyMetrics.length > 0) {
    const releaseIds = [...new Set(dailyMetrics.map((m: any) => m.release_id))];
    const { data: relRows } = await supabaseClient
      .from('releases')
      .select('id, project_type')
      .in('id', releaseIds);
    const albumReleaseIds = new Set(
      (relRows || []).filter((r: any) => r.project_type === 'Album' || r.project_type === 'EP').map((r: any) => r.id)
    );
    dailyMetrics = dailyMetrics.filter((m: any) => albumReleaseIds.has(m.release_id));
  }

  const aggregated = aggregateWindowMetrics(
    dailyMetrics,
    def.region_scope,
    def.region_code ?? undefined
  );

  // Build and score candidates
  const candidates = buildScoredCandidates(def, aggregated, weights);
  const ranked = candidates.sort(compareChartEntries).slice(0, def.limit_size);

  if (ranked.length === 0) return; // Nothing to chart

  // Create chart run
  const { data: newRun, error: runErr } = await supabaseClient
    .from('chart_runs')
    .insert({
      chart_id: def.chart_id,
      global_turn_id: globalTurnId,
      tracking_start_turn,
      tracking_end_turn,
      chart_week_key: weekInfo.chart_week_key,
      preview_turn: globalTurnId,
      publish_turn: globalTurnId,
      post_date_turn: globalTurnId,
      status: 'published', // daily charts are immediately published
    })
    .select('run_id')
    .single();

  if (runErr) {
    if (runErr.code === '23505') return; // duplicate — already created
    throw new Error(`chart_runs insert: ${runErr.message}`);
  }

  const run_id = newRun.run_id;

  const rankedEntityIds = ranked.map((c) => c.entity_id);
  const previousHistoryByEntity = new Map<string, Pick<DailyChartHistoryRow, 'peak_position_so_far' | 'days_on_chart' | 'first_seen_turn'>>();
  if (rankedEntityIds.length > 0) {
    const { data: previousHistoryRows, error: historyErr } = await supabaseClient
      .from('daily_chart_history_v2')
      .select('entity_id, peak_position_so_far, days_on_chart, first_seen_turn')
      .eq('chart_id', def.chart_id)
      .in('entity_id', rankedEntityIds)
      .order('global_turn_id', { ascending: false });

    if (historyErr && historyErr.code !== 'PGRST205' && historyErr.code !== '42P01') {
      throw new Error(`daily_chart_history_v2 query: ${historyErr.message}`);
    }

    for (const row of previousHistoryRows || []) {
      if (previousHistoryByEntity.has(row.entity_id)) continue;
      previousHistoryByEntity.set(row.entity_id, {
        peak_position_so_far: Number(row.peak_position_so_far) || Number.MAX_SAFE_INTEGER,
        days_on_chart: Number(row.days_on_chart) || 0,
        first_seen_turn: Number(row.first_seen_turn) || globalTurnId,
      });
    }
  }

  // Insert entries (no previous run to compare for daily — simpler)
  const entryRows = ranked.map((c, i) => ({
    run_id,
    entity_id: c.entity_id,
    artist_id: c.artist_id,
    position: i + 1,
    score: Math.round(c.score * 100) / 100,
    metric_streams: c.metric_streams,
    metric_paid_streams: c.metric_paid_streams,
    metric_free_streams: c.metric_free_streams,
    metric_video_streams: c.metric_video_streams,
    metric_sales_units: c.metric_sales_units,
    metric_radio_impressions: c.metric_radio_impressions,
    metric_pure_album_sales: c.metric_pure_album_sales,
    metric_tea_units: c.metric_tea_units,
    metric_sea_units: c.metric_sea_units,
    previous_position: null,
    movement: null,
    peak_position: i + 1,
    weeks_on_chart: 1,
    debut_flag: true,
  }));

  const historyRows = buildDailyChartHistoryRows(def.chart_id, globalTurnId, ranked, previousHistoryByEntity);

  if (entryRows.length > 0) {
    const { error: entryErr } = await supabaseClient
      .from('chart_entries')
      .insert(entryRows);
    if (entryErr && entryErr.code !== '23505') {
      throw new Error(`chart_entries insert (daily): ${entryErr.message}`);
    }
  }

  if (historyRows.length > 0) {
    const { error: historyInsertErr } = await supabaseClient
      .from('daily_chart_history_v2')
      .upsert(historyRows, { onConflict: 'chart_id,entity_id,global_turn_id', ignoreDuplicates: true });
    if (historyInsertErr && historyInsertErr.code !== '42P01') {
      throw new Error(`daily_chart_history_v2 insert: ${historyInsertErr.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Weekly chart processing
// ─────────────────────────────────────────────────────────────

async function processWeeklyChart(
  def: ChartDefinition,
  globalTurnId: number,
  weekInfo: ReturnType<typeof getChartWeekInfo>,
  supabaseClient: any,
  weights: ChartsWeights
): Promise<{ entries_count: number; chart_summaries_by_artist: Record<string, ChartSummaryByArtist> }> {
  const { tracking_start_turn, tracking_end_turn, preview_turn, publish_turn, post_date_turn, chart_week_key } = weekInfo;

  // Idempotency check
  const { data: existingRun } = await supabaseClient
    .from('chart_runs')
    .select('run_id')
    .eq('chart_id', def.chart_id)
    .eq('tracking_end_turn', tracking_end_turn)
    .maybeSingle();

  if (existingRun) return { entries_count: 0, chart_summaries_by_artist: {} };

  // Load metrics across the full 7-turn tracking window
  const isSoundburstChart = def.chart_key.startsWith('soundburst_underground_');
  const { data: metrics, error: metricsErr } = await supabaseClient
    .from('release_turn_metrics')
    .select('release_id, artist_id, streams_this_turn, paid_streams, free_streams, video_streams, region_streams, track_sales_units, album_sales_units, radio_impressions, lifetime_streams')
    .gte('global_turn_id', tracking_start_turn)
    .lte('global_turn_id', tracking_end_turn)
    .gt('streams_this_turn', 0);

  if (metricsErr) throw new Error(`weekly metrics query: ${metricsErr.message}`);

  let allMetrics = metrics || [];

  // BB200 album charts: filter to Album/EP releases only (exclude Singles)
  if (def.entity_type === 'album' && allMetrics.length > 0) {
    const releaseIds = [...new Set(allMetrics.map((m: any) => m.release_id))];
    const { data: relRows } = await supabaseClient
      .from('releases')
      .select('id, project_type')
      .in('id', releaseIds);
    const albumReleaseIds = new Set(
      (relRows || []).filter((r: any) => r.project_type === 'Album' || r.project_type === 'EP').map((r: any) => r.id)
    );
    allMetrics = allMetrics.filter((m: any) => albumReleaseIds.has(m.release_id));
  }

  // For Soundburst charts, also load radio-only entries (streams=0, radio_impressions>0)
  if (isSoundburstChart) {
    const { data: radioOnly } = await supabaseClient
      .from('release_turn_metrics')
      .select('release_id, artist_id, streams_this_turn, paid_streams, free_streams, video_streams, region_streams, track_sales_units, album_sales_units, radio_impressions, lifetime_streams')
      .gte('global_turn_id', tracking_start_turn)
      .lte('global_turn_id', tracking_end_turn)
      .eq('streams_this_turn', 0)
      .gt('radio_impressions', 0);
    if (radioOnly?.length) {
      allMetrics = allMetrics.concat(radioOnly);
    }
  }

  const aggregated = aggregateWindowMetrics(
    allMetrics,
    def.region_scope,
    def.region_code ?? undefined
  );

  // For Soundburst charts, look up career stages to apply bias
  const careerStageByArtist = new Map<string, string>();
  if (isSoundburstChart && aggregated.size > 0) {
    const artistIds = [...new Set([...aggregated.values()].map((m: AggregatedMetrics) => m.artist_id))];
    if (artistIds.length > 0) {
      const { data: profiles } = await supabaseClient
        .from('players')
        .select('id, career_stage')
        .in('id', artistIds);
      for (const p of (profiles || [])) {
        careerStageByArtist.set(p.id, p.career_stage || 'Unknown');
      }
    }
  }

  // Score candidates
  const candidates = buildScoredCandidates(def, aggregated, weights, careerStageByArtist);
  const ranked = candidates.sort(compareChartEntries).slice(0, def.limit_size);

  if (ranked.length === 0) return { entries_count: 0, chart_summaries_by_artist: {} };

  // Find previous week's run for movement and the most recent prior appearance for continuity.
  const prevWeekKey = chart_week_key - 1;
  const { data: prevRun } = await supabaseClient
    .from('chart_runs')
    .select('run_id')
    .eq('chart_id', def.chart_id)
    .eq('chart_week_key', prevWeekKey)
    .maybeSingle();

  // Build previous position lookup
  const prevPositions = new Map<string, WeeklyChartHistory>();
  if (prevRun) {
    const { data: prevEntries } = await supabaseClient
      .from('chart_entries')
      .select('entity_id, position, peak_position, weeks_on_chart')
      .eq('run_id', prevRun.run_id);
    for (const e of prevEntries || []) {
      prevPositions.set(e.entity_id, {
        position: e.position,
        peak_position: e.peak_position,
        weeks_on_chart: e.weeks_on_chart,
      });
    }
  }

  const rankedEntityIds = ranked.map((candidate) => candidate.entity_id);
  const latestPriorHistoryByEntity = new Map<string, WeeklyChartHistory>();
  if (rankedEntityIds.length > 0) {
    const { data: priorEntries } = await supabaseClient
      .from('chart_entries')
      .select('entity_id, position, peak_position, weeks_on_chart, chart_runs!inner(chart_id, chart_week_key)')
      .in('entity_id', rankedEntityIds)
      .eq('chart_runs.chart_id', def.chart_id)
      .lt('chart_runs.chart_week_key', chart_week_key)
      .order('chart_week_key', { foreignTable: 'chart_runs', ascending: false });
    for (const entry of priorEntries || []) {
      if (latestPriorHistoryByEntity.has(entry.entity_id)) continue;
      latestPriorHistoryByEntity.set(entry.entity_id, {
        position: entry.position,
        peak_position: entry.peak_position,
        weeks_on_chart: entry.weeks_on_chart,
      });
    }
  }

  // Create chart run — status 'generated' until publish_turn arrives
  const { data: newRun, error: runErr } = await supabaseClient
    .from('chart_runs')
    .insert({
      chart_id: def.chart_id,
      global_turn_id: globalTurnId,
      tracking_start_turn,
      tracking_end_turn,
      chart_week_key,
      preview_turn,
      publish_turn,
      post_date_turn,
      status: 'generated',
    })
    .select('run_id')
    .single();

  if (runErr) {
    if (runErr.code === '23505') return { entries_count: 0, chart_summaries_by_artist: {} };
    throw new Error(`weekly chart_runs insert: ${runErr.message}`);
  }

  const run_id = newRun.run_id;

  // Build entries with movement / peak / weeks_on_chart
  const entryRows: ChartEntry[] = buildWeeklyChartEntries(ranked, run_id, prevPositions, latestPriorHistoryByEntity);

  const entryInsertRows = entryRows.map(({ new_peak_flag, ...row }) => row);

  if (entryRows.length > 0) {
    const { error: entryErr } = await supabaseClient
      .from('chart_entries')
      .insert(entryInsertRows);
    if (entryErr && entryErr.code !== '23505') {
      throw new Error(`chart_entries insert (weekly): ${entryErr.message}`);
    }
  }

  // Generate chart notifications for Hot 100 weekly USA only (to avoid notification spam)
  if (def.chart_key === 'hot100_weekly_usa' && entryRows.length > 0) {
    await generateChartNotifications(entryRows, supabaseClient);
  }

  return {
    entries_count: entryRows.length,
    chart_summaries_by_artist: buildChartSummariesByArtist(entryRows),
  };
}

function buildChartSummariesByArtist(entries: ChartEntry[]): Record<string, ChartSummaryByArtist> {
  const summaries: Record<string, ChartSummaryByArtist> = {};

  for (const entry of entries) {
    if (!summaries[entry.artist_id]) {
      summaries[entry.artist_id] = {
        total_entries: 0,
        debuts: 0,
        moved_up: 0,
        moved_down: 0,
        new_peaks: 0,
        number_ones: 0,
        top_moves: [],
      };
    }

    const summary = summaries[entry.artist_id];
    summary.total_entries += 1;
    if (entry.debut_flag) summary.debuts += 1;
    if ((entry.movement ?? 0) > 0) summary.moved_up += 1;
    if ((entry.movement ?? 0) < 0) summary.moved_down += 1;
    if (entry.position === 1) summary.number_ones += 1;
    if (entry.new_peak_flag) {
      summary.new_peaks += 1;
    }
    if (entry.debut_flag || (entry.movement ?? 0) > 0) {
      summary.top_moves.push({
        entity_id: entry.entity_id,
        position: entry.position,
        previous_position: entry.previous_position,
        movement: entry.debut_flag ? 0 : (entry.movement ?? 0),
        debut_flag: entry.debut_flag,
      });
    }
  }

  for (const summary of Object.values(summaries)) {
    summary.top_moves = summary.top_moves
      .sort((a, b) => Number(b.debut_flag) - Number(a.debut_flag) || b.movement - a.movement || a.position - b.position)
      .slice(0, 3);
  }

  return summaries;
}

function mergeChartSummaries(
  target: Record<string, ChartSummaryByArtist>,
  source: Record<string, ChartSummaryByArtist>
): void {
  for (const [artistId, summary] of Object.entries(source || {})) {
    if (!target[artistId]) {
      target[artistId] = {
        total_entries: 0,
        debuts: 0,
        moved_up: 0,
        moved_down: 0,
        new_peaks: 0,
        number_ones: 0,
        top_moves: [],
      };
    }

    const merged = target[artistId];
    merged.total_entries += Number(summary.total_entries) || 0;
    merged.debuts += Number(summary.debuts) || 0;
    merged.moved_up += Number(summary.moved_up) || 0;
    merged.moved_down += Number(summary.moved_down) || 0;
    merged.new_peaks += Number(summary.new_peaks) || 0;
    merged.number_ones += Number(summary.number_ones) || 0;
    merged.top_moves = [...merged.top_moves, ...(summary.top_moves || [])]
      .sort((a, b) => Number(b.debut_flag) - Number(a.debut_flag) || b.movement - a.movement || a.position - b.position)
      .slice(0, 3);
  }
}

// ─────────────────────────────────────────────────────────────
// Shared: score candidates from aggregated metrics
// ─────────────────────────────────────────────────────────────

interface ScoredCandidate {
  entity_id: string;
  artist_id: string;
  score: number;
  metric_streams: number;
  metric_paid_streams: number;
  metric_free_streams: number;
  metric_video_streams: number;
  metric_sales_units: number;
  metric_radio_impressions: number;
  metric_pure_album_sales: number;
  metric_tea_units: number;
  metric_sea_units: number;
}

export function buildDailyChartHistoryRows(
  chartId: string,
  globalTurnId: number,
  ranked: ScoredCandidate[],
  previousHistoryByEntity: Map<string, Pick<DailyChartHistoryRow, 'peak_position_so_far' | 'days_on_chart' | 'first_seen_turn'>> = new Map()
): DailyChartHistoryRow[] {
  return ranked.map((candidate, index) => {
    const position = index + 1;
    const previous = previousHistoryByEntity.get(candidate.entity_id);

    return {
      chart_id: chartId,
      entity_id: candidate.entity_id,
      artist_id: candidate.artist_id,
      global_turn_id: globalTurnId,
      position,
      score: Math.round(candidate.score * 100) / 100,
      metric_streams: candidate.metric_streams,
      peak_position_so_far: previous ? Math.min(previous.peak_position_so_far, position) : position,
      days_on_chart: previous ? previous.days_on_chart + 1 : 1,
      first_seen_turn: previous ? previous.first_seen_turn : globalTurnId,
      last_seen_turn: globalTurnId,
    };
  });
}

export function buildWeeklyChartEntries(
  ranked: ScoredCandidate[],
  runId: string,
  previousWeekByEntity: Map<string, WeeklyChartHistory> = new Map(),
  latestPriorHistoryByEntity: Map<string, WeeklyChartHistory> = new Map()
): ChartEntry[] {
  return ranked.map((candidate, index) => {
    const position = index + 1;
    const previousWeek = previousWeekByEntity.get(candidate.entity_id);
    const latestPrior = latestPriorHistoryByEntity.get(candidate.entity_id);
    const continuity = previousWeek || latestPrior;
    const previous_position = previousWeek?.position ?? null;
    const movement = Number.isFinite(position) && previous_position != null ? previous_position - position : null;
    const peak_position = continuity
      ? Math.min(continuity.peak_position, position)
      : position;
    const weeks_on_chart = continuity ? continuity.weeks_on_chart + 1 : 1;
    const debut_flag = !latestPrior;
    const new_peak_flag = !!continuity && position < continuity.peak_position;

    return {
      run_id: runId,
      entity_id: candidate.entity_id,
      artist_id: candidate.artist_id,
      position,
      score: Math.round(candidate.score * 100) / 100,
      metric_streams: candidate.metric_streams,
      metric_paid_streams: candidate.metric_paid_streams,
      metric_free_streams: candidate.metric_free_streams,
      metric_video_streams: candidate.metric_video_streams,
      metric_sales_units: candidate.metric_sales_units,
      metric_radio_impressions: candidate.metric_radio_impressions,
      metric_pure_album_sales: candidate.metric_pure_album_sales,
      metric_tea_units: candidate.metric_tea_units,
      metric_sea_units: candidate.metric_sea_units,
      previous_position,
      movement,
      peak_position,
      weeks_on_chart,
      debut_flag,
      new_peak_flag,
    };
  });
}

function buildScoredCandidates(
  def: ChartDefinition,
  aggregated: Map<string, AggregatedMetrics>,
  weights: ChartsWeights,
  careerStageByArtist?: Map<string, string>
): ScoredCandidate[] {
  const results: ScoredCandidate[] = [];
  const isSoundburstRadioChart = def.chart_key.startsWith('soundburst_underground_');

  for (const [, m] of aggregated) {
    if (!isSoundburstRadioChart && m.metric_streams <= 0) continue;

    let score: number;
    let tea_units = 0;
    let sea_units = 0;

    if (isSoundburstRadioChart) {
      const rawScore = Number(m.metric_radio_impressions || 0);
      // Career stage bias: heavily favor early-career artists
      const artistStage = careerStageByArtist?.get(m.artist_id) || 'Unknown';
      const stageIdxRaw = getStageIndex(artistStage);
      const stageIdx = stageIdxRaw >= 0 ? stageIdxRaw : getStageIndex('Unknown');
      const stageBias = stageIdx <= 3
        ? 1.0 + (3 - stageIdx) * 0.25  // Unknown=1.75x, Local Artist=1.5x, Local Buzz=1.25x, Underground=1.0x
        : Math.max(0.30, 1.0 - (stageIdx - 3) * 0.15);  // Cult Fav=0.85x, Breakout=0.7x, ... Legacy=0.3x
      score = rawScore * stageBias;
    } else if (def.entity_type === 'song') {
      score = computeHot100Score(
        {
          paid_streams: m.metric_paid_streams,
          free_streams: m.metric_free_streams,
          video_streams: m.metric_video_streams,
          track_sales_units: m.metric_sales_units,
          radio_impressions: m.metric_radio_impressions,
        },
        weights
      );
    } else {
      // Billboard 200: albums (releases with project_type='album' or 'EP')
      const bb200 = computeBB200AlbumUnits(
        {
          pure_album_sales: m.metric_pure_album_sales,
          track_sales_units: m.metric_sales_units,
          album_streams: m.metric_streams,
        },
        weights
      );
      score = bb200.album_units;
      tea_units = bb200.tea_units;
      sea_units = bb200.sea_units;
    }

    if (score <= 0) continue;

    results.push({
      entity_id: m.entity_id,
      artist_id: m.artist_id,
      score,
      metric_streams: m.metric_streams,
      metric_paid_streams: m.metric_paid_streams,
      metric_free_streams: m.metric_free_streams,
      metric_video_streams: m.metric_video_streams,
      metric_sales_units: m.metric_sales_units,
      metric_radio_impressions: m.metric_radio_impressions,
      metric_pure_album_sales: m.metric_pure_album_sales,
      metric_tea_units: tea_units,
      metric_sea_units: sea_units,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Mark published runs
// ─────────────────────────────────────────────────────────────

async function markPublishedRuns(
  globalTurnId: number,
  supabaseClient: any
): Promise<void> {
  try {
    await supabaseClient
      .from('chart_runs')
      .update({ status: 'published' })
      .eq('status', 'generated')
      .lte('publish_turn', globalTurnId);
  } catch (_) { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────────
// Notifications for weekly Hot 100
// ─────────────────────────────────────────────────────────────

async function generateChartNotifications(
  entries: ChartEntry[],
  supabaseClient: any
): Promise<void> {
  const notifications: any[] = [];

  for (const entry of entries) {
    // New peak notification
    if (!entry.debut_flag && entry.previous_position != null && entry.position < entry.peak_position) {
      // Actually: peak was already updated so we check if it's a new peak
      // peak_position = min(prev_peak, current_position) — if equal to current, it's a new peak
    }

    // #1 notification (idempotent per entity)
    if (entry.position === 1) {
      notifications.push({
        player_id: entry.artist_id,
        type: 'ACHIEVEMENT',
        title: '#1 on the Weekly Hot 100!',
        subtitle: 'You reached the top of the charts!',
        body: 'Your release is the #1 song this week. A career milestone!',
        priority: 'high',
        is_read: false,
        metrics: { chart_key: 'hot100_weekly_usa', release_id: entry.entity_id },
        deep_links: { page: 'ChartsApp', tab: 'weekly' },
        idempotency_key: `chart_v2_number1_${entry.entity_id}_${entry.run_id}`,
      });
    }
  }

  for (const notif of notifications) {
    try {
      await supabaseClient
        .from('notifications')
        .insert(notif);
    } catch (_) { /* idempotency — ignore duplicate key */ }
  }
}
