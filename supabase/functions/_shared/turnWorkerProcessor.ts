// ============================================================================
// turnWorkerProcessor.ts — Worker logic for parallel turn processing (Phase 6)
// ============================================================================
// Each worker instance:
//   1. Claims a queue entry (atomic via RPC)
//   2. Loads its player subset + scoped prefetch
//   3. Stages all players (PHASE A — compute, no DB writes)
//   4. Commits all staged players (PHASE B — batch commit)
//   5. Reports results to queue
//
// Workers do NOT run global modules (charts, mood, trends, festival, media).
// The coordinator handles those after all workers complete.
// ============================================================================

import { TURN_SCHEDULER, executeTurnModules } from './turnScheduler.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { processPlayerBatchForWorker } from './turnEngine.ts';
import type { AlgorithmMood } from './algorithmMoodModule.ts';

// Worker processes its claimed batch of players for a given turn.
// Re-uses the same processPlayerTurn + commitStagedPlayerBatch from turnEngine.ts,
// imported dynamically to avoid circular deps (they share the same Deno isolate via bundler).
async function runWorkerBatch(
  queueId: string,
  globalTurnId: number,
  workerId: string,
  supabaseClient: any = supabaseAdmin,
) {
  const startTime = Date.now();
  const entities = createSupabaseEntitiesAdapter(supabaseClient);

  // Step 1: Claim the queue entry atomically
  const { data: claimed, error: claimErr } = await supabaseClient.rpc(
    'claim_turn_queue_entry',
    { p_queue_id: queueId, p_worker_id: workerId }
  );

  if (claimErr || !claimed?.length) {
    console.warn(`[TurnWorker:${workerId}] Failed to claim queue entry ${queueId}: ${claimErr?.message || 'already claimed or missing'}`);
    return { status: 'skipped', reason: 'claim_failed', queue_id: queueId };
  }

  const queueEntry = claimed[0];
  const playerIds: string[] = queueEntry.player_ids || [];

  if (!playerIds.length) {
    await supabaseClient.rpc('complete_turn_queue_entry', {
      p_queue_id: queueId,
      p_result_summary: { processed: 0, failed: 0, skipped: 0, warnings: [] },
    });
    return { status: 'done', processed: 0, queue_id: queueId };
  }

  console.log(`[TurnWorker:${workerId}] Claimed batch ${queueEntry.batch_index} with ${playerIds.length} players for turn ${globalTurnId}`);

  try {
    // Step 2: Load global context (same as coordinator, small reads)
    const { data: turnStateRows } = await supabaseClient
      .from('turn_state')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    const turnState = turnStateRows?.[0] || {};
    const currentAlgorithmMood = (turnState.algorithm_mood || 'mainstream') as AlgorithmMood;

    const engineCtx: any = {
      supabaseAdmin: supabaseClient,
      flags: {},
      algorithmMood: currentAlgorithmMood,
      platformSpotlight: (turnState.platform_spotlight || 'looptok') as string,
      globalTurnId,
      activeTrendsByRelease: {} as Record<string, string>,
      activeTrends: [] as any[],
      isWorker: true, // signal to downstream modules this is a worker context
    };

    // Load context, players, and prefetch ALL in a single parallel batch
    // (Previously: trends, controversies, radio were sequential BEFORE the big Promise.all)
    const activeControversyPlayerIds = new Set<string>();
    const radioSubsByPlayerRegion = new Map<string, Record<string, number>>();
    const prefetch: Record<string, any> = {};

    const [
      // Context queries (were sequential)
      peakTrendsRes,
      activeControsRes,
      radioRowsRes,
      // Player records
      playersRes,
      // Prefetch queries (were already parallel but ran AFTER context)
      idempotencyRes,
      fanProfilesRes,
      allErasRes,
      fandomsRes,
      fandomSegmentsRes,
      activeReleasesRes,
      activeMerchRes,
      activeBrandDealsRes,
      activeToursRes,
      festivalActivityRes,
      cityRepsRes,
      fanWarsRes,
      recentSocialPostsRes,
      playerBrandStatsRes,
      playerReleasesRes,
      playerChartEntriesRes,
      // ── Phase: Extended prefetch for N+1 elimination ──
      allSongsRes,
      socialAccountsRes,
      fullMerchRes,
      projectsRes,
      newsItemsRes,
      // ── Phase: Social/Brand module prefetch for N+1 elimination ──
      looptokCreatorStateRes,
      vidwaveVideoStateRes,
      fullBrandDealContractsRes,
      playerBrandAffinityRes,
    ] = await Promise.all([
      // Context
      supabaseClient
        .from('trends')
        .select('id, status, category, heat_score')
        .eq('is_active', true)
        .in('status', ['rising', 'peak']),
      supabaseClient
        .from('controversy_cases')
        .select('player_id')
        .neq('phase', 'resolved')
        .in('player_id', playerIds),
      supabaseClient
        .from('soundburst_radio_submissions')
        .select('player_id, soundburst_radio_shows!inner(region)')
        .eq('status', 'accepted')
        .in('player_id', playerIds),
      // Players
      supabaseClient
        .from('profiles')
        .select('*')
        .in('id', playerIds),
      // Prefetch
      supabaseClient
        .from('player_turn_history')
        .select('id,player_id,idempotency_key,status,attempt_count,paused_until')
        .eq('global_turn_id', globalTurnId)
        .eq('module', 'turnEngine')
        .in('player_id', playerIds),
      supabaseClient
        .from('fan_profiles')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('eras')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('fandoms')
        .select('*')
        .in('player_id', playerIds),
      supabaseClient
        .from('fandom_segments')
        .select('*')
        .in('player_id', playerIds),
      supabaseClient
        .from('releases')
        .select('id,artist_id')
        .in('artist_id', playerIds)
        .in('lifecycle_state', ['Hot', 'Stable', 'Trending', 'Momentum']),
      supabaseClient
        .from('merch')
        .select('id,artist_id')
        .in('artist_id', playerIds)
        .eq('status', 'Active')
        .gt('stock', 0),
      supabaseClient
        .from('brand_deal_contracts')
        .select('id,player_id')
        .in('player_id', playerIds)
        .eq('status', 'active'),
      supabaseClient
        .from('tours')
        .select('id,artist_id')
        .in('artist_id', playerIds)
        .in('status', ['active', 'in_progress', 'scheduled']),
      supabaseClient
        .from('festival_submissions')
        .select('id,artist_id')
        .in('artist_id', playerIds)
        .in('status', ['submitted', 'accepted', 'lineup']),
      supabaseClient
        .from('player_city_reputation')
        .select('*')
        .in('player_id', playerIds),
      supabaseClient
        .from('fan_wars')
        .select('id,artist_id,status')
        .in('artist_id', playerIds)
        .in('status', ['active', 'escalated', 'resolved']),
      supabaseClient
        .from('social_posts')
        .select('id,artist_id,is_viral,is_god_tier_viral,created_at')
        .in('artist_id', playerIds)
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
      supabaseClient
        .from('player_brand_stats')
        .select('artist_id,brand_safety_rating,reputation_modifier,total_deals_completed,active_deal_count,marketing_persona_primary')
        .in('artist_id', playerIds),
      supabaseClient
        .from('releases')
        .select('*')
        .in('artist_id', playerIds)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabaseClient
        .from('chart_entries')
        .select('run_id,entity_id,position,peak_position,weeks_on_chart,artist_id,chart_runs!run_id(global_turn_id)')
        .in('artist_id', playerIds)
        .limit(5000),
      // ── Extended prefetch: eliminate N+1 queries in turnProcessorCore + other modules ──
      supabaseClient
        .from('songs')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('social_accounts')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('merch')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('projects')
        .select('*')
        .eq('is_deleted', false)
        .in('artist_id', playerIds),
      supabaseClient
        .from('news_items')
        .select('*')
        .in('artist_id', playerIds)
        .order('created_at', { ascending: false })
        .limit(5000),
      // ── Social/Brand module prefetch: eliminate N+1 queries ──
      supabaseClient
        .from('looptok_creator_state')
        .select('artist_id,algorithm_multiplier')
        .in('artist_id', playerIds),
      supabaseClient
        .from('vidwave_video_state')
        .select('*')
        .in('artist_id', playerIds),
      supabaseClient
        .from('brand_deal_contracts')
        .select('*')
        .in('player_id', playerIds),
      supabaseClient
        .from('player_brand_affinity')
        .select('*')
        .in('player_id', playerIds),
    ]);

    // Step 3: Validate player records
    const allPlayers = playersRes?.data;
    const playersErr = playersRes?.error;
    if (playersErr || !allPlayers?.length) {
      throw new Error(`Failed to load players: ${playersErr?.message || 'no players found'}`);
    }

    // Process context results (trends, controversies, radio)
    try {
      const peakTrends = peakTrendsRes?.data as any[] || [];
      if (peakTrends.length) {
        const trendIds = peakTrends.map((t: any) => t.id);
        const { data: linkedReleases } = await supabaseClient
          .from('releases')
          .select('id, linked_trend_id')
          .in('linked_trend_id', trendIds);

        const trendStatusMap = Object.fromEntries(peakTrends.map((t: any) => [t.id, t.status]));
        engineCtx.activeTrendsByRelease = Object.fromEntries(
          ((linkedReleases || []) as any[]).map((r: any) => [r.id, trendStatusMap[r.linked_trend_id]])
        );
        engineCtx.activeTrends = peakTrends;
      }
    } catch (_) { /* non-fatal — trend bonuses degrade gracefully to 1.0 */ }

    for (const c of (activeControsRes?.data || []) as any[]) {
      if (c.player_id) activeControversyPlayerIds.add(c.player_id);
    }

    for (const row of (radioRowsRes?.data || []) as any[]) {
      const playerId = row?.player_id;
      const showRegion = Array.isArray(row?.soundburst_radio_shows)
        ? row.soundburst_radio_shows[0]?.region
        : row?.soundburst_radio_shows?.region;
      if (!playerId || !showRegion) continue;
      const regionMap = radioSubsByPlayerRegion.get(playerId) || {};
      regionMap[showRegion] = Number(regionMap[showRegion] || 0) + 1;
      radioSubsByPlayerRegion.set(playerId, regionMap);
    }

    // Step 4: Build prefetch lookup maps
    try {

      // Build lookup maps (identical to turnEngine prefetch map-building)
      const idempotencyByPlayer = new Map<string, any>();
      for (const row of (idempotencyRes?.data || []) as any[]) {
        idempotencyByPlayer.set(row.player_id, row);
      }
      prefetch.idempotencyByPlayer = idempotencyByPlayer;

      const fanProfilesByPlayer = new Map<string, any>();
      for (const fp of (fanProfilesRes?.data || []) as any[]) {
        fanProfilesByPlayer.set(fp.artist_id, fp);
      }
      prefetch.fanProfilesByPlayer = fanProfilesByPlayer;

      const erasByPlayer = new Map<string, any[]>();
      for (const era of (allErasRes?.data || []) as any[]) {
        const list = erasByPlayer.get(era.artist_id) || [];
        list.push(era);
        erasByPlayer.set(era.artist_id, list);
      }
      prefetch.erasByPlayer = erasByPlayer;

      const fandomsByPlayer = new Map<string, any>();
      for (const f of (fandomsRes?.data || []) as any[]) {
        fandomsByPlayer.set(f.player_id, f);
      }
      prefetch.fandomsByPlayer = fandomsByPlayer;

      const fandomSegmentsByPlayer = new Map<string, any[]>();
      for (const seg of (fandomSegmentsRes?.data || []) as any[]) {
        const list = fandomSegmentsByPlayer.get(seg.player_id) || [];
        list.push(seg);
        fandomSegmentsByPlayer.set(seg.player_id, list);
      }
      prefetch.fandomSegmentsByPlayer = fandomSegmentsByPlayer;

      const playersWithActiveRelease = new Set<string>();
      for (const r of (activeReleasesRes?.data || []) as any[]) playersWithActiveRelease.add(r.artist_id);
      const playersWithActiveMerch = new Set<string>();
      for (const m of (activeMerchRes?.data || []) as any[]) playersWithActiveMerch.add(m.artist_id);
      const playersWithActiveBrandDeal = new Set<string>();
      for (const b of (activeBrandDealsRes?.data || []) as any[]) playersWithActiveBrandDeal.add(b.player_id);
      const playersWithActiveTour = new Set<string>();
      for (const t of (activeToursRes?.data || []) as any[]) playersWithActiveTour.add(t.artist_id);
      const playersWithFestival = new Set<string>();
      for (const f of (festivalActivityRes?.data || []) as any[]) playersWithFestival.add(f.artist_id);
      prefetch.activityByPlayer = {
        hasActiveRelease: playersWithActiveRelease,
        hasActiveMerch: playersWithActiveMerch,
        hasActiveBrandDeal: playersWithActiveBrandDeal,
        hasActiveTour: playersWithActiveTour,
        hasFestival: playersWithFestival,
      };

      const cityRepsByPlayer = new Map<string, any[]>();
      for (const cr of (cityRepsRes?.data || []) as any[]) {
        const list = cityRepsByPlayer.get(cr.player_id) || [];
        list.push(cr);
        cityRepsByPlayer.set(cr.player_id, list);
      }
      prefetch.cityRepsByPlayer = cityRepsByPlayer;

      // Full city_scenes prefetch (all cities, all columns) — shared across sceneSystemModule + touringManager
      try {
        const { data: allCityScenes } = await supabaseClient
          .from('city_scenes')
          .select('*')
          .limit(100);
        const allCityScenesMap = new Map<string, any>();
        for (const cs of (allCityScenes || []) as any[]) {
          allCityScenesMap.set(String(cs.id), cs);
        }
        prefetch.allCityScenesMap = allCityScenesMap;
      } catch (_) {
        prefetch.allCityScenesMap = new Map();
      }

      // Compact city scenes map (limited columns, keyed by city ID — for brandDeals etc.)
      const allCityIds = [...new Set((cityRepsRes?.data || []).map((cr: any) => cr.city_id))];
      if (allCityIds.length > 0) {
        const cityScenesMap = new Map<string, any>();
        // Reuse allCityScenesMap data instead of a separate query
        for (const cityId of allCityIds) {
          const cs = prefetch.allCityScenesMap?.get(cityId);
          if (cs) cityScenesMap.set(cityId, cs);
        }
        prefetch.cityScenesMap = cityScenesMap;
      } else {
        prefetch.cityScenesMap = new Map();
      }

      const fanWarsByPlayer = new Map();
      for (const fw of (fanWarsRes?.data || [])) {
        const list = fanWarsByPlayer.get(fw.artist_id) || [];
        list.push(fw);
        fanWarsByPlayer.set(fw.artist_id, list);
      }
      prefetch.fanWarsByPlayer = fanWarsByPlayer;

      const recentSocialPostsByPlayer = new Map();
      for (const sp of (recentSocialPostsRes?.data || [])) {
        const list = recentSocialPostsByPlayer.get(sp.artist_id) || [];
        list.push(sp);
        recentSocialPostsByPlayer.set(sp.artist_id, list);
      }
      prefetch.recentSocialPostsByPlayer = recentSocialPostsByPlayer;

      const playerBrandStatsByPlayer = new Map();
      for (const bs of (playerBrandStatsRes?.data || [])) {
        playerBrandStatsByPlayer.set(bs.artist_id, bs);
      }
      prefetch.playerBrandStatsByPlayer = playerBrandStatsByPlayer;

      const releasesByPlayer = new Map();
      for (const rel of (playerReleasesRes?.data || [])) {
        const list = releasesByPlayer.get(rel.artist_id) || [];
        list.push(rel);
        releasesByPlayer.set(rel.artist_id, list);
      }
      prefetch.releasesByPlayer = releasesByPlayer;

      const chartEntriesByPlayer = new Map();
      for (const ce of (playerChartEntriesRes?.data || [])) {
        const list = chartEntriesByPlayer.get(ce.artist_id) || [];
        list.push(ce);
        chartEntriesByPlayer.set(ce.artist_id, list);
      }
      prefetch.chartEntriesByPlayer = chartEntriesByPlayer;

      // ── Extended prefetch Maps: eliminate N+1 queries in per-player modules ──
      const songsByPlayer = new Map<string, any[]>();
      for (const song of (allSongsRes?.data || []) as any[]) {
        const list = songsByPlayer.get(song.artist_id) || [];
        list.push(song);
        songsByPlayer.set(song.artist_id, list);
      }
      prefetch.songsByPlayer = songsByPlayer;

      const socialAccountsByPlayer = new Map<string, any[]>();
      for (const acc of (socialAccountsRes?.data || []) as any[]) {
        const list = socialAccountsByPlayer.get(acc.artist_id) || [];
        list.push(acc);
        socialAccountsByPlayer.set(acc.artist_id, list);
      }
      prefetch.socialAccountsByPlayer = socialAccountsByPlayer;

      const fullMerchByPlayer = new Map<string, any[]>();
      for (const m of (fullMerchRes?.data || []) as any[]) {
        const list = fullMerchByPlayer.get(m.artist_id) || [];
        list.push(m);
        fullMerchByPlayer.set(m.artist_id, list);
      }
      prefetch.fullMerchByPlayer = fullMerchByPlayer;

      const projectsByPlayer = new Map<string, any[]>();
      for (const p of (projectsRes?.data || []) as any[]) {
        const list = projectsByPlayer.get(p.artist_id) || [];
        list.push(p);
        projectsByPlayer.set(p.artist_id, list);
      }
      prefetch.projectsByPlayer = projectsByPlayer;

      const newsItemsByPlayer = new Map<string, any[]>();
      for (const n of (newsItemsRes?.data || []) as any[]) {
        const list = newsItemsByPlayer.get(n.artist_id) || [];
        list.push(n);
        newsItemsByPlayer.set(n.artist_id, list);
      }
      prefetch.newsItemsByPlayer = newsItemsByPlayer;

      // ── Social/Brand module prefetch Maps ──
      const looptokCreatorStateByPlayer = new Map<string, any>();
      for (const lcs of (looptokCreatorStateRes?.data || []) as any[]) {
        looptokCreatorStateByPlayer.set(lcs.artist_id, lcs);
      }
      prefetch.looptokCreatorStateByPlayer = looptokCreatorStateByPlayer;

      const vidwaveVideoStateByPlayer = new Map<string, any[]>();
      for (const vv of (vidwaveVideoStateRes?.data || []) as any[]) {
        const list = vidwaveVideoStateByPlayer.get(vv.artist_id) || [];
        list.push(vv);
        vidwaveVideoStateByPlayer.set(vv.artist_id, list);
      }
      prefetch.vidwaveVideoStateByPlayer = vidwaveVideoStateByPlayer;

      const brandDealContractsByPlayer = new Map<string, any[]>();
      for (const bdc of (fullBrandDealContractsRes?.data || []) as any[]) {
        const list = brandDealContractsByPlayer.get(bdc.player_id) || [];
        list.push(bdc);
        brandDealContractsByPlayer.set(bdc.player_id, list);
      }
      prefetch.brandDealContractsByPlayer = brandDealContractsByPlayer;

      const playerBrandAffinityByPlayer = new Map<string, any[]>();
      for (const pba of (playerBrandAffinityRes?.data || []) as any[]) {
        const list = playerBrandAffinityByPlayer.get(pba.player_id) || [];
        list.push(pba);
        playerBrandAffinityByPlayer.set(pba.player_id, list);
      }
      prefetch.playerBrandAffinityByPlayer = playerBrandAffinityByPlayer;

      // Build certifications map keyed by release_id (from full releases)
      // Done as a secondary query using release IDs from playerReleasesRes
      const allReleaseIds = (playerReleasesRes?.data || []).map((r: any) => r.id);
      if (allReleaseIds.length > 0) {
        const { data: certRows } = await supabaseClient
          .from('certifications')
          .select('release_id,certification_level')
          .in('release_id', allReleaseIds);
        const certificationsByRelease = new Map<string, any[]>();
        for (const cert of (certRows || []) as any[]) {
          const list = certificationsByRelease.get(cert.release_id) || [];
          list.push(cert);
          certificationsByRelease.set(cert.release_id, list);
        }
        prefetch.certificationsByRelease = certificationsByRelease;
      } else {
        prefetch.certificationsByRelease = new Map();
      }

      console.log(`[TurnWorker:${workerId}] Prefetch complete for ${playerIds.length} players (${songsByPlayer.size} songPlayers, ${socialAccountsByPlayer.size} socialPlayers, ${fullMerchByPlayer.size} merchPlayers, ${projectsByPlayer.size} projectPlayers)`);
    } catch (prefetchErr: any) {
      console.error(`[TurnWorker:${workerId}] Prefetch failed, falling back to per-player queries:`, prefetchErr?.message);
    }

    // Step 5: Process players using the shared batch processor
    // processPlayerBatchForWorker is statically imported from turnEngine.ts
    // (safe now that Deno.serve has been moved to turnEngine/index.ts)
    const prefetchMs = Date.now() - startTime;

    // Step 6: Process players using the shared batch processor
    const result = await processPlayerBatchForWorker(
      allPlayers,
      globalTurnId,
      entities,
      engineCtx,
      prefetch,
      activeControversyPlayerIds,
      radioSubsByPlayerRegion,
      executeTurnModules,
    );

    // Step 7: Report results to queue
    const resultSummary = {
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
      paused: result.paused,
      warnings: result.warnings || [],
      duration_ms: Date.now() - startTime,
      prefetch_ms: prefetchMs,
      stage_ms: result.stage_ms || 0,
      commit_ms: result.commit_ms || 0,
    };

    await supabaseClient.rpc('complete_turn_queue_entry', {
      p_queue_id: queueId,
      p_result_summary: resultSummary,
    });

    console.log(`[TurnWorker:${workerId}] Batch ${queueEntry.batch_index} complete: ${result.processed} processed, ${result.failed} failed, ${Date.now() - startTime}ms`);

    return {
      status: 'done',
      queue_id: queueId,
      batch_index: queueEntry.batch_index,
      ...resultSummary,
    };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[TurnWorker:${workerId}] Fatal error processing batch:`, errMsg);

    // Report failure to queue
    try {
      await supabaseClient.rpc('fail_turn_queue_entry', {
        p_queue_id: queueId,
        p_error: errMsg,
      });
    } catch (reportErr) {
      console.error(`[TurnWorker:${workerId}] Failed to report failure:`, reportErr);
    }

    return {
      status: 'failed',
      queue_id: queueId,
      error: errMsg,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// HTTP Handler — Deno.serve entry point for the turnWorker edge function
// ============================================================================
(globalThis as any).Deno.serve(async (req: any) => {
  try {
    const payload = await req.json().catch(() => ({}));

    const { queue_id, global_turn_id } = payload;

    if (!queue_id || !global_turn_id) {
      return Response.json(
        { error: 'Missing required fields: queue_id, global_turn_id' },
        { status: 400 }
      );
    }

    // Generate a unique worker ID for this invocation
    const workerId = 'w:' + Math.random().toString(36).slice(2, 9) + ':' + Date.now();

    const result = await runWorkerBatch(queue_id, global_turn_id, workerId);

    return Response.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[TurnWorker] Unhandled error:', errMsg);
    return Response.json(
      { error: 'TURN_WORKER_UNHANDLED_ERROR', message: errMsg },
      { status: 500 }
    );
  }
});
