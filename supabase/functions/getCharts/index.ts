/**
 * getCharts — read-only edge function for chart retrieval.
 *
 * Inputs (query params or JSON body):
 *   chart_key   (required) — e.g. 'hot100_weekly_usa'
 *   mode        'current' | 'by_turn' | 'latest_published'  (default: 'current')
 *   turn        int   — used when mode='by_turn'
 *   limit       int   — override chart limit (max = chart definition limit_size)
 *   sort        'position' | 'score' | 'streams'  (default: 'position')
 *
 * Publish gating (weekly charts only):
 *   current < preview_turn    → status 'hidden',    return last published run
 *   preview_turn ≤ current < publish_turn  → status 'preview', return top 10
 *   current ≥ publish_turn    → status 'published', return full chart
 *
 * Daily charts are always 'published'.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getChartWeekInfo, getChartVisibility, ChartVisibility } from '../_shared/chartWeek.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

(globalThis as any).Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let params: Record<string, string> = {};

    if (req.method === 'POST') {
      params = await req.json().catch(() => ({}));
    } else {
      for (const [k, v] of url.searchParams.entries()) params[k] = v;
    }

    const chart_key: string | undefined = params.chart_key;
    if (!chart_key) {
      return Response.json({ error: 'chart_key is required' }, { status: 400, headers: corsHeaders });
    }

    const mode = (params.mode as 'current' | 'by_turn' | 'latest_published') || 'current';
    const requestedTurn = params.turn ? parseInt(params.turn) : null;
    const limitOverride = params.limit ? parseInt(params.limit) : null;
    const sort = (params.sort as 'position' | 'score' | 'streams') || 'position';

    // Load chart definition
    const { data: def, error: defErr } = await supabase
      .from('chart_definitions')
      .select('*')
      .eq('chart_key', chart_key)
      .maybeSingle();

    if (defErr || !def) {
      return Response.json({ error: `Unknown chart_key: ${chart_key}` }, { status: 404, headers: corsHeaders });
    }

    // Determine current global turn id
    const { data: turnState } = await supabase
      .from('turn_state')
      .select('global_turn_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentTurnId = turnState?.global_turn_id ?? 1;

    // Determine which run to return based on mode + gating
    let targetRun: any = null;
    let visibility: ChartVisibility = 'published';
    let effectiveLimit = Math.min(limitOverride ?? def.limit_size, def.limit_size);

    if (mode === 'by_turn' && requestedTurn != null) {
      // Return the run whose tracking window contains the requested turn
      const { data: run } = await supabase
        .from('chart_runs')
        .select('*')
        .eq('chart_id', def.chart_id)
        .lte('tracking_start_turn', requestedTurn)
        .gte('tracking_end_turn', requestedTurn)
        .order('tracking_end_turn', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetRun = run;
      if (targetRun) {
        visibility = getChartVisibility(currentTurnId, targetRun.preview_turn, targetRun.publish_turn);
      }
    } else if (mode === 'latest_published') {
      const { data: run } = await supabase
        .from('chart_runs')
        .select('*')
        .eq('chart_id', def.chart_id)
        .eq('status', 'published')
        .order('tracking_end_turn', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetRun = run;
      visibility = 'published';
    } else {
      // 'current' mode: apply publish gating logic
      if (def.cadence === 'weekly') {
        const weekInfo = getChartWeekInfo(currentTurnId);

        // Try to find the run for the current chart week
        const { data: currentWeekRun } = await supabase
          .from('chart_runs')
          .select('*')
          .eq('chart_id', def.chart_id)
          .eq('chart_week_key', weekInfo.chart_week_key)
          .maybeSingle();

        if (currentWeekRun) {
          visibility = getChartVisibility(
            currentTurnId,
            currentWeekRun.preview_turn,
            currentWeekRun.publish_turn
          );

          if (visibility === 'hidden') {
            // Return last published run instead
            const { data: lastPublished } = await supabase
              .from('chart_runs')
              .select('*')
              .eq('chart_id', def.chart_id)
              .eq('status', 'published')
              .order('tracking_end_turn', { ascending: false })
              .limit(1)
              .maybeSingle();
            targetRun = lastPublished;
            visibility = 'published';
          } else if (visibility === 'preview') {
            targetRun = currentWeekRun;
            effectiveLimit = Math.min(10, effectiveLimit); // top 10 only during preview
          } else {
            targetRun = currentWeekRun;
          }
        } else {
          // No run for current week yet — return last published
          const { data: lastPublished } = await supabase
            .from('chart_runs')
            .select('*')
            .eq('chart_id', def.chart_id)
            .eq('status', 'published')
            .order('tracking_end_turn', { ascending: false })
            .limit(1)
            .maybeSingle();
          targetRun = lastPublished;
          visibility = targetRun ? 'published' : 'hidden';
        }
      } else {
        // Daily: just return most recent run
        const { data: run } = await supabase
          .from('chart_runs')
          .select('*')
          .eq('chart_id', def.chart_id)
          .order('tracking_end_turn', { ascending: false })
          .limit(1)
          .maybeSingle();
        targetRun = run;
        visibility = 'published';
      }
    }

    if (!targetRun) {
      return Response.json({
        chart_key,
        cadence: def.cadence,
        entity_type: def.entity_type,
        region_scope: def.region_scope,
        region_code: def.region_code,
        limit_size: def.limit_size,
        status: 'hidden',
        visibility: 'hidden',
        message: 'No chart data available yet',
        entries: [],
      }, { headers: corsHeaders });
    }

    // Load entries from chart_entries, with entity metadata join
    let entryQuery = supabase
      .from('chart_entries')
      .select(`
        entity_id,
        artist_id,
        position,
        score,
        metric_streams,
        metric_paid_streams,
        metric_free_streams,
        metric_video_streams,
        metric_sales_units,
        metric_radio_impressions,
        metric_pure_album_sales,
        metric_tea_units,
        metric_sea_units,
        previous_position,
        movement,
        peak_position,
        weeks_on_chart,
        debut_flag
      `)
      .eq('run_id', targetRun.run_id)
      .limit(effectiveLimit);

    // Sort
    if (sort === 'score') {
      entryQuery = entryQuery.order('score', { ascending: false });
    } else if (sort === 'streams') {
      entryQuery = entryQuery.order('metric_streams', { ascending: false });
    } else {
      entryQuery = entryQuery.order('position', { ascending: true });
    }

    const { data: rawEntries, error: entryErr } = await entryQuery;
    if (entryErr) throw new Error(`chart_entries query: ${entryErr.message}`);

    const entityIds = (rawEntries || []).map((e: any) => e.entity_id);
    const artistIds = (rawEntries || []).map((e: any) => e.artist_id);

    // Load release metadata
    const releaseMap: Record<string, any> = {};
    if (entityIds.length > 0) {
      const { data: releases } = await supabase
        .from('releases')
        .select('id, title, release_name, project_type, scheduled_turn')
        .in('id', entityIds);
      for (const r of releases || []) releaseMap[r.id] = r;
    }

    // Load artist metadata
    const profileMap: Record<string, any> = {};
    const uniqueArtistIds = [...new Set(artistIds)];
    if (uniqueArtistIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, artist_name, genre, region')
        .in('id', uniqueArtistIds);
      for (const p of profiles || []) profileMap[p.id] = p;
    }

    // Build enriched entries
    const entries = (rawEntries || []).map((e: any) => {
      const release = releaseMap[e.entity_id] || {};
      const profile = profileMap[e.artist_id] || {};
      const movementLabel =
        e.debut_flag ? 'NEW'
        : e.movement == null ? '-'
        : e.movement > 0 ? `▲${e.movement}`
        : e.movement < 0 ? `▼${Math.abs(e.movement)}`
        : '—';

      return {
        position: e.position,
        last_week: e.previous_position,
        movement: e.movement,
        movement_label: movementLabel,
        peak_position: e.peak_position,
        weeks_on_chart: e.weeks_on_chart,
        debut_flag: e.debut_flag,

        entity_id: e.entity_id,
        title: release.title || release.release_name || 'Unknown',
        artist_name: profile.artist_name || 'Unknown',
        artist_id: e.artist_id,
        genre: profile.genre,
        region: profile.region,

        score: e.score,
        metric_streams: e.metric_streams,
        metric_paid_streams: e.metric_paid_streams,
        metric_sales_units: e.metric_sales_units,
        metric_radio_impressions: e.metric_radio_impressions,
        metric_pure_album_sales: e.metric_pure_album_sales,
        metric_tea_units: e.metric_tea_units,
        metric_sea_units: e.metric_sea_units,
      };
    });

    return Response.json({
      chart_key,
      cadence: def.cadence,
      entity_type: def.entity_type,
      region_scope: def.region_scope,
      region_code: def.region_code,
      limit_size: def.limit_size,

      run_id: targetRun.run_id,
      tracking_start_turn: targetRun.tracking_start_turn,
      tracking_end_turn: targetRun.tracking_end_turn,
      chart_week_key: targetRun.chart_week_key,
      preview_turn: targetRun.preview_turn,
      publish_turn: targetRun.publish_turn,
      post_date_turn: targetRun.post_date_turn,
      generated_at: targetRun.generated_at,

      status: targetRun.status,
      visibility,
      current_turn: currentTurnId,
      preview_note: visibility === 'preview' ? 'Top 10 preview — full chart available on publish_turn' : null,

      entries,
    }, { headers: corsHeaders });

  } catch (err: any) {
    console.error('[getCharts] Error:', err);
    return Response.json(
      { error: 'Internal error', details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
});
