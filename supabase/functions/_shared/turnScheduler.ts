import { buildFandomModifiersForPlayer } from './fandomModifiers.ts';
import { buildIndustryPerceptionModifiersForPlayer } from './industryPerception.ts';
import { buildAudienceModifiersFromFanProfile, clampWarIntensityMultiplier } from './sentimentModifiers.ts';
import { buildAudienceQualityModifiers } from './audienceQuality.ts';
import { evaluateCareerTrend } from './careerTrendsEngine.ts';
import { applyCareerTrendEffects } from './careerTrendEffects.ts';
import { inferCareerArchetype } from './careerArchetypes.ts';
import { resolveCareerConversion } from './careerConversionEngine.ts';
import { applyWeatherBias, loadCareerWeatherState } from './careerWeatherEngine.ts';
import { resolvePlatformWeather } from './careerPlatformWeather.ts';
import { resolveRegionalWeather } from './careerRegionalWeather.ts';
import { resolveCareerLanes } from './careerShadowTracks.ts';
// Plan 016 §7.6 — pure deriver functions for career-trend scheduling signals
import {
  computeConsecutiveFlops,
  computeHasChartingRelease,
  computeChartPresenceRate,
} from './releaseStatusDerivers.ts';
// Static imports to ensure modules are bundled (even though we use dynamic loading)
import './beefTickModule.ts';
import './sampleClearanceModule.ts';
import './sampleAchievementsModule.ts';
import './sampleRoyaltyModule.ts';
import './fandomSegmentsModule.ts';
import './controversyTickModule.ts';
import './sceneSystemModule.ts';
import './soundburstRadioModule.ts';
import './fandomSegmentsSentimentModule.ts';
import './applecoreEditorialModule.ts';
// Plan 034 M1: Scene Completion Context Bus for same-turn gig detection
// Plan 035 M2: Extended to include underground event extraction
import {
  extractGigCompletionContext,
  extractUndergroundCompletionContext,
  buildSceneSystemGigContext,
} from './sceneCompletionContextBus.ts';
import {
  applyImprintFromEvents,
  computeDiscoveryQualityMultiplier,
  computeSegmentChurnMultiplier,
  computeVolatilityDelta,
  ensureFandomPhase6State,
  seedRng,
  getReleasesThisTurn,
  computeReleaseSaturationDelta,
  updateReleaseCadenceState,
  computeSuperfansStreamBoost,
  computeSuperfansRetentionBoost,
  computeSuperfansMerchBoost,
  computeSuperfansTourBoost,
  updateRegionBias,
  deriveSegmentFractionsFromCounts,
  computeNostalgiaEffects,
  computeScandalRecovery,
  computePlatformSpikeModifier,
  computePlatformSustainPenalty,
  computeBrandQualityModifier,
  computeGlamourSocialViralityBoost,
  computeGlamourBrandDealBoost,
  computeCommunityChurnReduction,
  computeCommunityOrganicGrowthBoost,
  computeFatigueSoftState,
} from './fandomPhase6.ts';
 import { computeGenreMatchScore } from './sceneMath.ts';
import { computePlayerActivity } from './playerActivity.ts';

/**
 * TURN SCHEDULER - Master Cadence Authority (Batch 3.1)
 * CRITICAL: Only this module decides cadence.
 * No module may check turnId % 7, % 30 logic independently.
 * Enforces no writes during stageOnly via write-blocking entities proxy.
 */

function makeNoWriteEntities(entities: Record<string, any>): Record<string, any> {
  const handler: ProxyHandler<Record<string, any>> = {
    get(target: Record<string, any>, prop: string | symbol) {
      const key = String(prop);
      if (typeof target[key] === 'object' && target[key] !== null) {
        return new Proxy(target[key], {
          get(entityTarget: Record<string, any>, entityProp: string | symbol) {
            const entityKey = String(entityProp);
            if (['create', 'update', 'delete'].includes(entityKey)) {
              return () => {
                throw new Error(`WRITE_BLOCKED: Cannot call ${entityKey} on ${key} during stageOnly. All writes happen in commit phase.`);
              };
            }
            return entityTarget[entityKey];
          }
        });
      }
      return target[key];
    }
  };
  return new Proxy(entities, handler);
}

export const TURN_SCHEDULER = {
  everyTurn: [
    { name: 'turnProcessorCore', order: 1 },
    { name: 'fansUpdateModule', order: 2 },
    { name: 'turnProcessorEra', order: 3 },
    { name: 'soundburstRadio', order: 3.5 },
    { name: 'socialMediaModule', order: 4 },
    { name: 'fandomSegmentsSentiment', order: 4.45 }, // Per-segment sentiment deltas (after social, before segment engine)
    { name: 'fandomSegmentsModule', order: 4.5 }, // Runs after socialMediaModule (4) so it sees social_posts_created
    { name: 'controversyTick', order: 4.55 }, // After fandom segments, before fan wars
    { name: 'fanWarTick', order: 4.57 }, // After controversyTick (4.55), before beefTick (4.6)
    { name: 'beefTick', order: 4.6 },
    { name: 'brandDealsModule', order: 4.8 },
    { name: 'sampleClearanceModule', order: 4.9 },
    { name: 'sampleAchievementsModule', order: 4.91 },
    { name: 'sampleRoyaltyModule', order: 4.92 },
    { name: 'applecoreEditorialModule', order: 4.93 },
    { name: 'touringManager', order: 4.95 },
    { name: 'sceneSystemModule', order: 5 },
    { name: 'careerProgressionPipeline', order: 5.5 },
    { name: 'careerTrendsModule', order: 5.7 },
    { name: 'newsGenerationModule', order: 5.8 },
    { name: 'turnProcessorNotifications', order: 6 }
  ],
  everyWeek: [],
  everyMonth: [
    { name: 'monthlyListenersModule', order: 9 }
  ],

  getModuleCadenceForTurn(turnId: number) {
    const modules = [...this.everyTurn];
    if (turnId % 7 === 0) modules.push(...this.everyWeek);
    if (turnId % 30 === 0) modules.push(...this.everyMonth);
    return modules.sort((a, b) => a.order - b.order);
  }
};


function getCareerTrendRuntime(runtimeContext: any, playerId: string) {
  return runtimeContext?.careerTrendByArtistId?.[playerId] || null;
}

function getPhase6AverageLoyalty100(phase6State: any): number {
  const loyalty = phase6State?.loyalty || {};
  const keys = ['casual', 'core', 'og', 'stan', 'trend_chaser'];
  const values = keys
    .map((key) => Number(loyalty?.[key]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return 0;

  return Math.max(
    0,
    Math.min(100, Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)),
  );
}

function getPhase6Heat100(phase6State: any): number {
  const heat = Number(phase6State?.heat);
  if (!Number.isFinite(heat)) return 0;
  return Math.max(0, Math.min(100, Math.round(heat * 100)));
}

function getPrimaryRegionKey(phase6State: any): string | null {
  const regionBias = phase6State?.region_bias || {};
  const entries = Object.entries(regionBias)
    .map(([region, bias]: [string, any]) => ({ region, score: Number(bias?.loyaltyBias) || 0 }))
    .sort((a, b) => b.score - a.score);

  return entries[0]?.region || 'United States';
}

export async function executeTurnModules(player: any, globalTurnId: number, entities: any, modules: any[], ctx: Record<string, any> = {}) {
  const stageOnly = !!(ctx as any)?.stageOnly || !!(ctx as any)?.dry_run;
  const entitiesToUse = stageOnly ? makeNoWriteEntities(entities) : entities;

  const moduleState = { coreTurnSummary: null };
  const runtimeContext: Record<string, any> = { turn_metrics: {} };
  runtimeContext.flags = {};
  runtimeContext.turn_events = [];
  runtimeContext.isFirstPlayer = !!(ctx as any)?.isFirstPlayer;
  runtimeContext.active_radio_submissions_by_region = (ctx as any)?.active_radio_submissions_by_region || {};
  // Pass raw prefetch Maps through to modules for N+1 query elimination
  runtimeContext.prefetchData = (ctx as any)?.prefetch || null;
  let careerStageDeltaOwner: string | null = null;
  let fanProfileForAudience: any = null;
  let activeEraForAudience: any = null;
  let allErasForPlayer: any[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // USE BULK PRE-FETCHED DATA when available (from turnEngine.ts prefetch)
  // Falls back to per-player queries if prefetch is missing
  // ═══════════════════════════════════════════════════════════════════
  const prefetch = (ctx as any)?.prefetch;

  // Fan profile: use prefetch or query
  if (prefetch?.fanProfilesByPlayer?.has(player.id)) {
    fanProfileForAudience = prefetch.fanProfilesByPlayer.get(player.id);
  } else {
    try {
      const fpRes = await entities.supabaseClient
        .from('fan_profiles')
        .select('*')
        .eq('artist_id', player.id)
        .limit(1)
        .maybeSingle();
      fanProfileForAudience = fpRes?.data ?? null;
    } catch (e: any) {
      console.error(`[executeTurnModules] fan_profiles query failed for ${player.id}:`, e?.message || e);
    }
  }

  // Eras: use prefetch or query
  if (prefetch?.erasByPlayer) {
    allErasForPlayer = prefetch.erasByPlayer.get(player.id) || [];
    activeEraForAudience = allErasForPlayer.find((era: any) => era?.is_active) || null;
  } else {
    try {
      const allErasRes = await entities.supabaseClient
        .from('eras')
        .select('*')
        .eq('artist_id', player.id);
      allErasForPlayer = allErasRes?.data || [];
      activeEraForAudience = allErasForPlayer.find((era: any) => era?.is_active) || null;
    } catch (e: any) {
      console.error(`[executeTurnModules] eras query failed for ${player.id}:`, e?.message || e);
    }
  }

  // Count iconic eras from prefetched data or query
  let iconicEraCount = 0;
  if (prefetch?.erasByPlayer) {
    iconicEraCount = (prefetch.erasByPlayer.get(player.id) || []).filter((e: any) => e.status === 'iconic').length;
  } else {
    try {
      const { count } = await entities.supabaseClient
        .from('eras')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', player.id)
        .eq('status', 'iconic');
      iconicEraCount = count || 0;
    } catch (_e) { /* non-critical */ }
  }
  runtimeContext.iconicEraCount = iconicEraCount;

  // Cache fanProfile and activeEra on runtimeContext so modules don't re-query them
  runtimeContext.fanProfile = fanProfileForAudience ?? null;
  runtimeContext.fanProfileId = fanProfileForAudience?.id ?? null;
  runtimeContext.allEras = allErasForPlayer;
  runtimeContext.activeEra = activeEraForAudience ?? null;
  runtimeContext.activeEraId = activeEraForAudience?.id ?? null;

  const audienceResult = buildAudienceModifiersFromFanProfile(fanProfileForAudience || {});
  runtimeContext.audience_modifiers = audienceResult.audienceModifiers;

  // ── UNIFIED PLAYER ACTIVITY — must run BEFORE Phase 6 so inactivity_turns sees the signal ──
  try {
    // Use prefetched activity data if available, otherwise fall back to per-player queries
    const activity = prefetch?.activityByPlayer;
    let hasActiveRelease: boolean, hasActiveMerch: boolean, hasActiveBrandDeal: boolean, hasActiveTour: boolean, hasFestival: boolean;

    if (activity) {
      hasActiveRelease = activity.hasActiveRelease.has(player.id);
      hasActiveMerch = activity.hasActiveMerch.has(player.id);
      hasActiveBrandDeal = activity.hasActiveBrandDeal.has(player.id);
      hasActiveTour = activity.hasActiveTour.has(player.id);
      hasFestival = activity.hasFestival.has(player.id);
    } else {
      const [activeReleasesRes, activeMerchRes, activeBrandDealsRes, activeTourRes, festivalActivityRes] = await Promise.all([
        entities.supabaseClient.from('releases').select('id').eq('artist_id', player.id)
          .in('lifecycle_state', ['Hot', 'Stable', 'Trending', 'Momentum']).limit(1),
        entities.supabaseClient.from('merch').select('id').eq('artist_id', player.id)
          .eq('status', 'Active').gt('stock', 0).limit(1),
        entities.supabaseClient.from('brand_deal_contracts').select('id').eq('player_id', player.id)
          .eq('status', 'active').limit(1),
        entities.supabaseClient.from('tours').select('id').eq('artist_id', player.id)
          .in('status', ['active', 'in_progress', 'scheduled']).limit(1),
        entities.supabaseClient.from('festival_submissions').select('id').eq('artist_id', player.id)
          .in('status', ['submitted', 'accepted', 'lineup']).limit(1),
      ]);
      hasActiveRelease = (activeReleasesRes?.data?.length || 0) > 0;
      hasActiveMerch = (activeMerchRes?.data?.length || 0) > 0;
      hasActiveBrandDeal = (activeBrandDealsRes?.data?.length || 0) > 0;
      hasActiveTour = (activeTourRes?.data?.length || 0) > 0;
      hasFestival = (festivalActivityRes?.data?.length || 0) > 0;
    }

    const activityResult = computePlayerActivity({
      hasActiveRelease,
      streamsEarned: 0,
      socialPostsCreated: 0,
      gigsCompleted: hasActiveTour ? 1 : 0,
      brandDealActive: hasActiveBrandDeal,
      festivalActive: hasFestival,
      merchActivelySelling: hasActiveMerch,
      eraActionExecuted: false,
      releasesActivated: 0,
      looptokPostsCreated: 0,
      lastActiveTurn: Number(player.last_active_turn) || 0,
      globalTurnId,
    });

    runtimeContext.playerActivity = activityResult;
    runtimeContext.hasActiveTour = hasActiveTour;
    console.log(`[PlayerActivity] player=${player.id} isActive=${activityResult.isActive} grace=${activityResult.inGracePeriod} turnsSince=${activityResult.turnsSinceActivity} score=${activityResult.activityScore.toFixed(2)}`);
  } catch (e: any) {
    console.error(`[PlayerActivity] Failed for ${player.id}:`, e?.message);
    runtimeContext.playerActivity = { isActive: true, activityScore: 1, turnsSinceActivity: 0, inGracePeriod: true, postGraceDecayRate: 0 };
  }

  {
    // Phase 6 state is now stored on the fandoms table (consolidated from fandom_phase6_state)
    // Segment fractions are DERIVED from fandom_segments integer counts (single source of truth)
    let fandomsRow: any = null;
    let segmentRows: any[] | null = null;

    // Use prefetched data if available, otherwise query per-player
    if (prefetch?.fandomsByPlayer) {
      fandomsRow = prefetch.fandomsByPlayer.get(player.id) ?? null;
      segmentRows = prefetch.fandomSegmentsByPlayer?.get(player.id) ?? null;
    } else {
      const [fandomsRes, segmentRowsRes] = await Promise.all([
        entities.supabaseClient
          .from('fandoms')
          .select('player_id,fan_segments,loyalty,heat,fatigue,imprint,superfans_share,region_bias,inactivity_turns,consecutive_high_fatigue_turns,release_cadence,updated_at')
          .eq('player_id', player.id)
          .maybeSingle(),
        entities.supabaseClient
          .from('fandom_segments')
          .select('segment_type,count,loyalty,labor_output')
          .eq('player_id', player.id),
      ]);
      if (fandomsRes?.error) console.error(`[executeTurnModules] fandoms query failed for ${player.id}:`, fandomsRes.error.message);
      if (segmentRowsRes?.error) console.error(`[executeTurnModules] fandom_segments query failed for ${player.id}:`, segmentRowsRes.error.message);
      fandomsRow = fandomsRes?.data ?? null;
      segmentRows = segmentRowsRes?.data ?? null;
    }

    // Build prev-tick fandom labor pool from stored labor_output on each segment row.
    // This is the PREVIOUS turn's fandom labor (current turn runs later at order 4.5).
    // Used by turnProcessorCore (order 1) and socialMediaModule (order 4) for downstream boosts.
    const prevFandomLaborPool: Record<string, number> = { streaming: 0, defense: 0, promo: 0, meme: 0, clipping: 0, toxicity: 0 };
    for (const seg of segmentRows || []) {
      const lo = (seg as any).labor_output as Record<string, number> | null;
      if (!lo) continue;
      for (const lt of Object.keys(prevFandomLaborPool)) {
        prevFandomLaborPool[lt] = (prevFandomLaborPool[lt] || 0) + (lo[lt] || 0);
      }
    }
    runtimeContext.prev_fandom_labor_pool = prevFandomLaborPool;

    // Derive fractional shares + loyalty from fandom_segments integer counts
    const derived = deriveSegmentFractionsFromCounts(segmentRows);

    // Map fandoms row to Phase 6 state shape, overriding fan_segments/loyalty with derived values
    const phase6Row = fandomsRow
      ? { ...fandomsRow, artist_id: fandomsRow.player_id, fan_segments: derived.fan_segments, loyalty: derived.loyalty }
      : { artist_id: player.id, fan_segments: derived.fan_segments, loyalty: derived.loyalty };
    const phase6State = ensureFandomPhase6State(player.id, phase6Row);
    const trendName = Object.entries((fanProfileForAudience as any)?.career_trends || {}).find(([, active]) => !!active)?.[0] || null;
    const sentimentEffective100 = Number(runtimeContext.audience_modifiers?.effectiveSentiment100) || 50;
    const sentimentRaw100 = Number(runtimeContext.audience_modifiers?.sentiment100) || 50;

    const churnMultiplier = computeSegmentChurnMultiplier(phase6State, trendName, sentimentEffective100);
    const discoveryQualityMultiplier = computeDiscoveryQualityMultiplier(phase6State);
    const volatilityDelta = computeVolatilityDelta(phase6State, sentimentRaw100);
    
    // Release Saturation: Get releases this turn and compute fatigue delta
    let deltaFatigueFromSaturation = 0;
    let saturationDebug: any = {};
    try {
      const releasesThisTurn = await getReleasesThisTurn(runtimeContext, player.id, entities, globalTurnId);
      const saturationResult = computeReleaseSaturationDelta(phase6State, releasesThisTurn, globalTurnId);
      deltaFatigueFromSaturation = saturationResult.deltaFatigueFromSaturation;
      saturationDebug = saturationResult.debug;

      // Update cadence state
      runtimeContext.phase6CadenceUpdate = updateReleaseCadenceState(phase6State, releasesThisTurn, globalTurnId);

      // Add saturation debug to runtime context for turn event logging
      runtimeContext.release_saturation_debug = saturationDebug;
    } catch (e: any) {
      console.error(`[ReleaseSaturation] Failed for ${player.id}:`, e);
      saturationDebug = { error: e?.message || String(e) };
      runtimeContext.release_saturation_debug = saturationDebug;
    }
    
    const random = seedRng(player.id, globalTurnId);
    const volatilityNoise = (random() - 0.5) * 0.01;
    const nextHeat = Math.max(0, Math.min(1, phase6State.heat + volatilityDelta.deltaHeat + volatilityNoise));
    
    // Combine volatility fatigue with saturation fatigue
    const combinedFatigueDelta = volatilityDelta.deltaFatigue + deltaFatigueFromSaturation;
    const nextFatigue = Math.max(0, Math.min(1, phase6State.fatigue + combinedFatigueDelta));
    
    const didScandal = sentimentEffective100 <= 24 || (String(trendName || '').toUpperCase().includes('FLOP'));
    let nextImprint = applyImprintFromEvents({ ...phase6State, heat: nextHeat, fatigue: nextFatigue }, trendName, didScandal);
    
    // === NEW PHASE 6 FEATURES ===
    
    // Part 1: Superfans effects
    const superfansStreamBoost = computeSuperfansStreamBoost(phase6State.superfans_share);
    const superfansRetentionBoost = computeSuperfansRetentionBoost(phase6State.superfans_share);
    const superfansMerchBoost = computeSuperfansMerchBoost(phase6State.superfans_share);
    const superfansTourBoost = computeSuperfansTourBoost(phase6State.superfans_share);
    
    // Part 2: Regional fandom identity — enriched with scene reputation
    let sceneRepByRegion: Record<string, number> = {};
    let genreMatchByRegion: Record<string, number> = {};
    try {
      // Use prefetched city reputation data if available
      const cityReps = prefetch?.cityRepsByPlayer?.get(player.id) || null;
      const cityScenesMap = prefetch?.cityScenesMap || null;

      if (cityReps !== null && cityScenesMap !== null) {
        // Use prefetched data — no DB queries needed
        if (cityReps.length) {
          const sums: Record<string, { total: number; count: number }> = {};
          const genreSums: Record<string, { total: number; count: number }> = {};
          for (const r of cityReps) {
            const cityScene = cityScenesMap.get(String(r.city_id));
            const reg = cityScene?.region;
            if (!reg) continue;
            if (!sums[reg]) sums[reg] = { total: 0, count: 0 };
            sums[reg].total += Number(r.reputation_score) || 0;
            sums[reg].count++;

            const genreScore = computeGenreMatchScore(
              player.genre,
              cityScene?.genre_weights || {},
              cityScene?.trending_genre || null,
            );
            if (!genreSums[reg]) genreSums[reg] = { total: 0, count: 0 };
            genreSums[reg].total += genreScore;
            genreSums[reg].count++;
          }
          for (const [reg, v] of Object.entries(sums)) sceneRepByRegion[reg] = v.total / v.count;
          for (const [reg, v] of Object.entries(genreSums)) genreMatchByRegion[reg] = v.total / v.count;
        }
      } else {
        // Fallback: per-player queries
        const { data: cityRepsData } = await entities.supabaseClient
          .from('player_city_reputation')
          .select('city_id, reputation_score')
          .eq('player_id', player.id);
        if (cityRepsData?.length) {
          const { data: cityScenes } = await entities.supabaseClient
            .from('city_scenes').select('id, region, genre_weights, trending_genre').in('id', cityRepsData.map((r: any) => r.city_id));
          const regionMap = new Map<string, string>((cityScenes || []).map((c: any) => [String(c.id), String(c.region)]));
          const citySceneMap = new Map<string, any>((cityScenes || []).map((c: any) => [String(c.id), c]));
          const sums: Record<string, { total: number; count: number }> = {};
          const genreSums: Record<string, { total: number; count: number }> = {};
          for (const r of cityRepsData) {
            const reg = regionMap.get(String(r.city_id));
            if (!reg) continue;
            if (!sums[reg]) sums[reg] = { total: 0, count: 0 };
            sums[reg].total += Number(r.reputation_score) || 0;
            sums[reg].count++;

            const cityScene = citySceneMap.get(String(r.city_id));
            const genreScore = computeGenreMatchScore(
              player.genre,
              cityScene?.genre_weights || {},
              cityScene?.trending_genre || null,
            );
            if (!genreSums[reg]) genreSums[reg] = { total: 0, count: 0 };
            genreSums[reg].total += genreScore;
            genreSums[reg].count++;
          }
          for (const [reg, v] of Object.entries(sums)) sceneRepByRegion[reg] = v.total / v.count;
          for (const [reg, v] of Object.entries(genreSums)) genreMatchByRegion[reg] = v.total / v.count;
        }
      }
    } catch (e: any) { console.error(`[executeTurnModules] scene rep query failed for ${player.id}:`, e?.message || e); }
    const updatedRegionBias = updateRegionBias(phase6State, player.id, globalTurnId, sentimentEffective100, sceneRepByRegion, genreMatchByRegion);
    
    // Part 3: Segment fractions are now derived from fandom_segments engine (single source of truth).
    // No independent segment reactions here — fandomSegmentsModule (order 4.5) owns all drift.

    // Part 4: Deeper fan memory - Nostalgia
    // Use unified player activity signal: isActive resets inactivity, grace period protects
    const playerActivity = runtimeContext.playerActivity;
    const inactivityTurns = playerActivity?.isActive
      ? 0
      : (phase6State.inactivity_turns || 0) + 1;
    const nostalgiaEffects = computeNostalgiaEffects(phase6State, Math.max(0, inactivityTurns));
    
    // Part 4: Deeper fan memory - Scandal recovery
    const scandalRecoveryDelta = computeScandalRecovery(phase6State, sentimentEffective100);
    nextImprint = {
      ...nextImprint,
      nostalgia: Math.max(0, Math.min(1, nextImprint.nostalgia + nostalgiaEffects.nostalgiaDelta)),
      scandal: Math.max(0, Math.min(1, nextImprint.scandal + scandalRecoveryDelta)),
    };
    
    // Part 5: Cross-system hooks
    const platformSpikeModifier = computePlatformSpikeModifier(nextHeat);
    const platformSustainPenalty = computePlatformSustainPenalty(nextFatigue);
    const brandQualityModifier = computeBrandQualityModifier(phase6State);
    
    // Part 5c: Discrete fatigue soft state (consecutive high fatigue tracking)
    const prevConsecutiveFatigueTurns = Number(fandomsRow?.consecutive_high_fatigue_turns) || 0;
    const fatigueSoftState = computeFatigueSoftState(nextFatigue, prevConsecutiveFatigueTurns);
    
    // Use updated cadence state if available, otherwise use original state
    const baseState = runtimeContext.phase6CadenceUpdate || phase6State;
    const nextState = ensureFandomPhase6State(player.id, {
      ...baseState,
      heat: nextHeat,
      fatigue: nextFatigue,
      imprint: nextImprint,
      region_bias: updatedRegionBias,
      inactivity_turns: Math.max(0, inactivityTurns),
      consecutive_high_fatigue_turns: fatigueSoftState.consecutiveHighFatigueTurns,
      updated_at: new Date().toISOString(),
    });

    runtimeContext.phase6 = {
      state: nextState,
      churnMultiplier,
      discoveryQualityMultiplier,
      superfansStreamBoost,
      superfansRetentionBoost,
      superfansMerchBoost,
      superfansTourBoost,
      nostalgiaChurnReduction: nostalgiaEffects.churnReduction,
      nostalgiaDiscoveryBoost: nostalgiaEffects.discoveryBoost,
      platformSpikeModifier,
      platformSustainPenalty,
      brandQualityModifier,
      glamourSocialViralityBoost: 0,
      glamourBrandDealBoost: 0,
      communityChurnReduction: 0,
      communityOrganicGrowthBoost: 0,
      fatigueSoftState,
      segmentFractions: phase6State.fan_segments,
      segmentLoyalty: phase6State.loyalty,
    };

    runtimeContext.audience_modifiers = {
      ...runtimeContext.audience_modifiers,
      churnMultiplier,
      phase6Heat: nextHeat,
      phase6Fatigue: nextFatigue,
      warIntensityMult: clampWarIntensityMultiplier((Number(runtimeContext.audience_modifiers?.warIntensityMult) || 1) * Math.min(1.25, Math.max(0, nextHeat))),
    };
  }

  try {
    runtimeContext.fandom_modifiers = await buildFandomModifiersForPlayer(player, globalTurnId, entities.supabaseClient);
  } catch (e: any) {
    console.error(`[executeTurnModules] buildFandomModifiers failed for ${player.id}:`, e?.message || e);
    runtimeContext.fandom_modifiers = {};
  }
  try {
    runtimeContext.industry_perception_modifiers = await buildIndustryPerceptionModifiersForPlayer(
      player,
      globalTurnId,
      entities.supabaseClient,
      runtimeContext.fandom_modifiers,
      runtimeContext.audience_modifiers,
    );
  } catch (e: any) {
    console.error(`[executeTurnModules] buildIndustryPerception failed for ${player.id}:`, e?.message || e);
    runtimeContext.industry_perception_modifiers = {};
  }
  // Part 5b: Glamour & Community vector effects (computed after fandom_modifiers is loaded)
  if (runtimeContext.phase6) {
    const essenceVectors = runtimeContext.fandom_modifiers?.essenceVectors || runtimeContext.fandom_modifiers?.rollingEssenceVectors || {};
    const glamourValue = Number(essenceVectors.glamour) || 0;
    const communityValue = Number(essenceVectors.community) || 0;
    runtimeContext.phase6.glamourSocialViralityBoost = computeGlamourSocialViralityBoost(glamourValue);
    runtimeContext.phase6.glamourBrandDealBoost = computeGlamourBrandDealBoost(glamourValue);
    runtimeContext.phase6.communityChurnReduction = computeCommunityChurnReduction(communityValue);
    runtimeContext.phase6.communityOrganicGrowthBoost = computeCommunityOrganicGrowthBoost(communityValue);
  }

  runtimeContext.audience_quality_modifiers = buildAudienceQualityModifiers({
    fanProfile: fanProfileForAudience || {},
    audienceModifiers: runtimeContext.audience_modifiers,
    era: activeEraForAudience || null,
    industryPerception: runtimeContext.industry_perception_modifiers,
    fandomModifiers: runtimeContext.fandom_modifiers,
  });
  if (runtimeContext.phase6) {
    runtimeContext.audience_quality_modifiers = {
      ...runtimeContext.audience_quality_modifiers,
      discoveryQualityMultiplier: Number(runtimeContext.phase6.discoveryQualityMultiplier) || 1,
    };
  }

  const currentTrend = Object.entries((fanProfileForAudience as any)?.career_trends || {}).find(([, active]) => !!active)?.[0] || null;
  const holdTurns = Number((fanProfileForAudience as any)?.career_trend_modifiers?.trend_hold_turns || 0);
  const previousTrend = (fanProfileForAudience as any)?.career_trend_modifiers?.previous_trend || currentTrend || null;
  // Block re-entry to ONE_HIT_WONDER once the artist has already served their full OHW tenure
  const oneHitWonderExpired = !!(fanProfileForAudience as any)?.career_trend_modifiers?.one_hit_wonder_expired;

  // ── Gather binary criteria data for career trend v2 ──
  let trendHasViral = false;
  let turnsSinceLastRelease = 9999;
  let totalSinglesCount = 0;
  let totalReleasesCount = 0;
  let hasSmashHit = false;
  let smashHitReleaseId: string | null = null;
  let consecutiveFlops = Number(player.consecutive_flops ?? 0);
  let hasChartingRelease = false;
  let chartPresenceRate = 0;
  let chartHasTop10 = false;
  let chartWeeks2Plus = false;
  let followerGrowthRate = 0;
  let accountAgeTurns = 0;

  try {
    // Account age: turns since profile creation
    const createdAt = player.created_at ? new Date(player.created_at).getTime() : Date.now();
    accountAgeTurns = Math.max(0, Math.floor((Date.now() - createdAt) / (60 * 60 * 1000))); // 1 turn = 1 hour

    const [allReleases, chartEntries, viralPosts] = await Promise.all([
      // All releases for this artist — `kind` is the release type column (not release_type which doesn't exist)
      // peak_chart_position is NOT on releases — it lives in chart_entries.peak_position
      entities.supabaseClient
        .from('releases')
        .select('id,release_status,release_date,kind,project_type,lifecycle_state,created_at')
        .eq('artist_id', player.id)
        .order('created_at', { ascending: false })
        .limit(200)
        .then((r: any) => r.data || []),
      // Chart entries joined with chart_runs for turn info
      // chart_entries PK is run_id; columns are entity_id, position, peak_position — NOT id/turn_entered/turn_last_updated
      entities.supabaseClient
        .from('chart_entries')
        .select('run_id,entity_id,position,peak_position,weeks_on_chart,chart_runs!run_id(global_turn_id)')
        .eq('artist_id', player.id)
        .limit(200)
        .then((r: any) => r.data || []),
      // Viral social posts — use is_viral flag; virality_score column doesn't exist on social_posts
      entities.supabaseClient
        .from('social_posts')
        .select('id,is_viral,is_god_tier_viral')
        .eq('artist_id', player.id)
        .eq('is_viral', true)
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()) // last 48 hours
        .limit(5)
        .then((r: any) => r.data || []),
    ]);

    // Turns since last release (any type)
    if (allReleases.length > 0) {
      // Prefer created_at over release_date to avoid stale in-game dates making turnsSinceLastRelease artificially large
      const latestReleaseDate = new Date(allReleases[0].created_at || allReleases[0].release_date).getTime();
      turnsSinceLastRelease = Math.max(0, Math.floor((Date.now() - latestReleaseDate) / (60 * 60 * 1000)));
    }

    // Total singles count — use project_type (kind is never populated; project_type is always set).
    // project_type values are title-cased: 'Single', 'Album', 'EP', etc.
    totalSinglesCount = allReleases.filter((r: any) =>
      String(r.project_type || r.kind || '').toLowerCase() === 'single'
    ).length;

    // Total releases count — ALL release types (singles + albums + EPs).
    // Used by OHW check: 2+ total releases = real discography, not a one-hit wonder.
    totalReleasesCount = allReleases.length;

    // Smash hit: any release that ever peaked at chart position <= 5 — sourced from chart_entries
    // Sort by peak_position ascending so we get the best (lowest) peak, not an arbitrary first match
    const smashEntries = chartEntries
      .filter((c: any) => Number(c.peak_position) > 0 && Number(c.peak_position) <= 5)
      .sort((a: any, b: any) => Number(a.peak_position) - Number(b.peak_position));
    hasSmashHit = smashEntries.length > 0;
    smashHitReleaseId = smashEntries[0]?.entity_id || null;

    // Consecutive flops, charting release, chart presence rate
    // Plan 016 §7.6 — uses releaseStatusDerivers which prefer final_outcome_class with fallback to lifecycle_state
    consecutiveFlops = computeConsecutiveFlops(allReleases, chartEntries);
    hasChartingRelease = computeHasChartingRelease(allReleases);
    const recentChartEntries = chartEntries.filter((c: any) =>
      ((c.chart_runs as any)?.global_turn_id ?? 0) >= globalTurnId - 12
    );
    chartHasTop10 = recentChartEntries.some((c: any) => Number(c.position) > 0 && Number(c.position) <= 10);
    chartWeeks2Plus = recentChartEntries.some((c: any) => Number(c.weeks_on_chart) >= 2);
    chartPresenceRate = computeChartPresenceRate(chartEntries, globalTurnId, 12, hasChartingRelease);

    // Viral posts — is_viral is the correct column (virality_score doesn't exist)
    trendHasViral = viralPosts.length > 0;

    // Follower growth rate from fan profile
    const currentML = Number((fanProfileForAudience as any)?.monthly_listeners) || 0;
    const lastML = Number((fanProfileForAudience as any)?.last_monthly_listeners) || 0;
    if (lastML > 0) {
      followerGrowthRate = (currentML - lastML) / lastML;
    }
  } catch (e: any) { console.error(`[executeTurnModules] career trend data query failed for ${player.id}:`, e?.message || e); }

  try {
    const trendEval = evaluateCareerTrend({
      currentTrend,
      holdTurns,
      previousTrend,
      careerStage: player.career_stage || 'Unknown',
      clout: Number(player.clout) || 0,
      hype: Number(player.hype) || 0,
      followers: Number(player.followers) || 0,
      accountAgeTurns,
      turnsSinceLastRelease,
      totalSinglesCount,
      totalReleasesCount,
      hasSmashHit,
      smashHitReleaseId,
      consecutiveFlops,
      eraIsFlop: !!(activeEraForAudience as any)?.is_flop,
      consecutiveDeclineTurns: Number(player.consecutive_decline_turns) || 0,
      chartPresenceRate,
      hasChartingRelease,
      hasViralPost: trendHasViral,
      followerGrowthRate,
      oneHitWonderExpired,
      phase5: runtimeContext.audience_quality_modifiers,
    });
    const trendEffects = applyCareerTrendEffects({ trend: trendEval.trend });
    runtimeContext.careerTrendByArtistId = {
      [player.id]: {
        trend: trendEval.trend,
        effects: trendEffects,
        signals: trendEval.signals,
        rationaleKeys: trendEval.rationaleKeys,
        previousTrend: currentTrend,
        holdTurns,
        smashHitReleaseId,
        audienceDepth: runtimeContext.audience_quality_modifiers?.audienceDepth,
        depthTier: runtimeContext.audience_quality_modifiers?.depthTier,
        culturalGravity: runtimeContext.audience_quality_modifiers?.culturalGravity,
        viralHalfLifeMult: runtimeContext.audience_quality_modifiers?.viralHalfLifeMult,
        discoveryConversionMult: runtimeContext.audience_quality_modifiers?.discoveryConversionMult,
      }
    };
  } catch (e: any) {
    console.error(`[executeTurnModules] careerTrend eval failed for ${player.id}:`, e?.message || e);
    runtimeContext.careerTrendByArtistId = {};
  }

  const results = {
    global_turn_id: globalTurnId,
    player_id: player.id,
    modules_run: [] as string[],
    errors: [] as string[],
    warnings: [] as string[],
    lastModule: null,
    deltas: {
      artistProfile: {} as Record<string, any>,
      fanProfile: {} as Record<string, any>,
      era: {} as Record<string, any>,
      releases_updates: [] as any[],
      merch_updates: [] as any[],
      gig_updates: [] as any[],
      tour_updates: [] as any[],
      social_account_updates: [] as any[],
      tour_event_updates: [] as any[],
      news_items_to_create: [] as any[],
      turn_events: [] as any[],
      notifications_to_create: [] as any[],
      milestones_to_create: [] as any[],
      career_events_to_create: [] as any[],
      social_posts_to_create: [] as any[],
      social_post_metadata_updates: [] as any[],
      vidwave_ad_revenue_log: [] as any[],
      looptok_revenue_log: [] as any[],
      career_trend_events: [] as any[],
      brand_deal_updates: [] as any[],
      brand_deal_creates: [] as any[],
      brand_deal_contract_updates: [] as any[],
      brand_deal_payout_log_inserts: [] as any[],
      artist_profile_updates: [] as any[],
      fan_profile_updates: [] as any[],
      beef_updates: [] as any[],
      player_brand_stats_upserts: [] as any[],
      player_brand_affinity_upserts: [] as any[],
      scene_deltas: null as any,
      fandom_phase6_patch: null as any,
      fandom_updates: [] as any[],
      fandom_segment_updates: [] as any[],
      fandom_metrics_snapshot: null as any,
      controversy_case_updates: [] as any[],
      controversy_case_inserts: [] as any[],
      fan_war_updates: [] as any[],
      fan_war_inserts: [] as any[],
      fan_war_turn_inserts: [] as any[],
      beef_inserts: [] as any[],
      xpress_event_requests: [] as any[],
      release_turn_metrics: [] as any[],
      soundburst_radio_submission_updates: [] as any[],
      soundburst_radio_show_updates: [] as any[],
      soundburst_radio_discovery_creates: [] as any[],
      sample_request_updates: [] as any[],
      sample_royalty_payment_upserts: [] as any[],
      sample_achievement_upserts: [] as any[],
      editorial_submission_updates: [] as any[],
      editorial_curator_updates: [] as any[],
      interview_slot_updates: [] as any[],
      applecore_award_upserts: [] as any[],
      editorial_submission_creates: [] as any[],
      looptok_creator_state_upserts: [] as any[],
      looptok_challenge_participation_updates: [] as any[],
      looptok_challenge_awards: [] as any[],
      career_shadow_profile_upsert: null as any,
      tour_crew_updates: [] as any[],
      tour_sponsorship_updates: [] as any[],
      tour_choice_event_creates: [] as any[],
      tour_choice_event_updates: [] as any[],
      tour_opening_act_updates: [] as any[],
      opener_tour_credits: [] as any[],
      turn_metrics: {} as Record<string, any>
    },
    timings: {} as Record<string, number>
  };

  if (runtimeContext?.fandom_modifiers?.fandomMemoryPatch || audienceResult?.sentimentMemoryPatch) {
    const mergedMemory: any = {
      ...(fanProfileForAudience?.fandom_memory || {}),
      ...(runtimeContext.fandom_modifiers?.fandomMemoryPatch || {}),
      ...(audienceResult?.sentimentMemoryPatch || {}),
    };
    // Apply merch sourcing essence nudges (Ethical +1 auth/+0.5 reb per item; Scandal −3 auth/−2 reb)
    const essenceNudge = runtimeContext?.turn_metrics?.merch_essence_nudge;
    if (essenceNudge && (essenceNudge.authenticity || essenceNudge.rebellion)) {
      mergedMemory.authenticity_avg = Math.max(0, Math.min(100, (Number(mergedMemory.authenticity_avg) || 50) + Number(essenceNudge.authenticity)));
      mergedMemory.rebellion_avg = Math.max(0, Math.min(100, (Number(mergedMemory.rebellion_avg) || 50) + Number(essenceNudge.rebellion)));
    }
    results.deltas.fanProfile = {
      ...results.deltas.fanProfile,
      fandom_memory: mergedMemory,
    };
  }

  if (runtimeContext.phase6?.state) {
    // Phase 6 state is now stored on the fandoms table — pass as a patch to merge during commit
    const p6s = runtimeContext.phase6.state;
    results.deltas.fandom_phase6_patch = {
      fan_segments: p6s.fan_segments,
      loyalty: p6s.loyalty,
      heat: p6s.heat,
      fatigue: p6s.fatigue,
      imprint: p6s.imprint,
      superfans_share: p6s.superfans_share,
      region_bias: p6s.region_bias,
      consecutive_high_fatigue_turns: p6s.consecutive_high_fatigue_turns,
      release_cadence: p6s.release_cadence,
      inactivity_turns: p6s.inactivity_turns,
    };
  }
  
  // Add release saturation debug event if debug info is available
  if (runtimeContext.release_saturation_debug && Object.keys(runtimeContext.release_saturation_debug).length > 0) {
    const debug = runtimeContext.release_saturation_debug;
    results.deltas.turn_events.push({
      global_turn_id: globalTurnId,
      player_id: player.id,
      module: 'fandomPhase6',
      event_type: 'FANDOM_RELEASE_SATURATION_DEBUG',
      description: 'Release saturation fatigue calculation debug',
      metadata: {
        fandom_release_saturation_fatigue_delta: debug.finalPenalty || 0,
        fandom_release_window_total: debug.totalReleases || 0,
        fandom_release_window_unrelated: debug.unrelated || 0,
        fandom_release_window_distinct_eras: debug.distinctEras || 0,
        fandom_release_coherence_score: debug.coherenceScore || 1.0,
        debug_full: debug,
      },
      created_at: new Date().toISOString(),
    });
  }
  
  // Add comprehensive Phase 6 debug event
  if (runtimeContext.phase6) {
    const p6 = runtimeContext.phase6;
    const state = p6.state;
    
    results.deltas.turn_events.push({
      global_turn_id: globalTurnId,
      player_id: player.id,
      module: 'fandomPhase6',
      event_type: 'FANDOM_PHASE6_FULL_DEBUG',
      description: 'Phase 6 fandom system complete state and effects',
      metadata: {
        // Superfans effects
        fandom_superfans_share: state.superfans_share,
        fandom_superfans_stream_boost: p6.superfansStreamBoost || 0,
        fandom_superfans_retention_delta: p6.superfansRetentionBoost || 0,
        fandom_superfans_merch_boost: p6.superfansMerchBoost || 0,
        fandom_superfans_tour_boost: p6.superfansTourBoost || 0,
        
        // Regional identity
        fandom_region_keys_count: Object.keys(state.region_bias || {}).length,
        fandom_region_loyalty_bias_summary: state.region_bias ? 
          Object.entries(state.region_bias).reduce((acc, [region, bias]: [string, any]) => {
            acc[region] = bias.loyaltyBias;
            return acc;
          }, {} as Record<string, number>) : {},
        
        // Segment fractions (derived from fandom_segments engine counts)
        fandom_segment_fractions: p6.segmentFractions || state.fan_segments,
        fandom_segment_loyalty: p6.segmentLoyalty || state.loyalty,
        
        // Memory effects
        fandom_inactivity_turns: state.inactivity_turns || 0,
        fandom_nostalgia_delta: p6.nostalgiaChurnReduction || 0,
        fandom_scandal_recovery_rate: state.imprint.scandal,
        
        // Cross-system hooks
        fandom_platform_spike_mod: p6.platformSpikeModifier || 0,
        fandom_platform_sustain_mod: p6.platformSustainPenalty || 0,
        fandom_brand_quality_mod: p6.brandQualityModifier || 0,
        
        // Core state
        heat: state.heat,
        fatigue: state.fatigue,
        imprint: state.imprint,
      },
      created_at: new Date().toISOString(),
    });
  }
  if (Array.isArray(runtimeContext?.fandom_modifiers?.events)) {
    for (const event of runtimeContext.fandom_modifiers.events) {
      results.deltas.turn_events.push({
        module: 'fandomModifiers',
        description: event.description,
        event_type: event.event_type,
        metadata: {
          ...(event.metadata || {}),
          audienceDepth: runtimeContext?.audience_quality_modifiers?.audienceDepth,
          depthTier: runtimeContext?.audience_quality_modifiers?.depthTier,
          culturalGravity: runtimeContext?.audience_quality_modifiers?.culturalGravity,
          viralHalfLifeMult: runtimeContext?.audience_quality_modifiers?.viralHalfLifeMult,
          discoveryConversionMult: runtimeContext?.audience_quality_modifiers?.discoveryConversionMult,
        },
      });
      if (event.event_type === 'cultural_resurgence') {
        const currentClout = Number(player?.clout) || 0;
        results.deltas.artistProfile = {
          ...results.deltas.artistProfile,
          clout: Math.min(2_000_000, Math.floor(currentClout + 8)),
        };
      }
    }
  }

  // Player activity was already computed above (before Phase 6) — no duplicate needed here.

  for (const module of modules) {
    results.lastModule = module.name;
    const moduleStart = Date.now();

    try {
      let moduleResult = null;
      switch (module.name) {
        case 'turnProcessorCore':
          moduleResult = await runTurnProcessorCore(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'fansUpdateModule':
          moduleResult = await runFansUpdate(player, globalTurnId, entitiesToUse, moduleState, ctx, runtimeContext);
          break;
        case 'turnProcessorEra':
          moduleResult = await runTurnProcessorEra(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'soundburstRadio':
          moduleResult = await runSoundburstRadioModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'socialMediaModule':
          moduleResult = await runSocialMediaModule(player, globalTurnId, entitiesToUse, moduleState, ctx, runtimeContext);
          break;
        case 'fanWarTick':
          moduleResult = await runFanWarTick(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'beefTick':
          moduleResult = await runBeefTick(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'brandDealsModule':
          moduleResult = await runBrandDealsModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'sampleClearanceModule':
          moduleResult = await runSampleClearanceModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'sampleAchievementsModule':
          moduleResult = await runSampleAchievementsModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'sampleRoyaltyModule':
          moduleResult = await runSampleRoyaltyModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'applecoreEditorialModule':
          moduleResult = await runApplecoreEditorialModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'sceneSystemModule':
          moduleResult = await runSceneSystemModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'touringManager':
          moduleResult = await runTouringManager(player, globalTurnId, entitiesToUse, moduleState, ctx, runtimeContext);
          break;
        case 'careerProgressionPipeline':
          try {
            const fandomMetrics = runtimeContext.fandom_modifiers || {};
            const industryMetrics = runtimeContext.industry_perception_modifiers || {};
            const phase6State = runtimeContext.phase6?.state || {};
            const loyalty100 = getPhase6AverageLoyalty100(phase6State);
            const heat100 = getPhase6Heat100(phase6State);
            const primaryRegion = getPrimaryRegionKey(phase6State);

            const weatherState = await loadCareerWeatherState(entities.supabaseClient);
            let weatherRuntime: any = {
              global: weatherState,
              region: null,
              platform: null,
            };

            if (weatherState?.id) {
              const [regionRowsRes, platformRowsRes] = await Promise.all([
                entities.supabaseClient
                  .from('career_weather_regions')
                  .select('weather_state_id,region,region_personality,heat_tags,modifier_payload,started_turn,ends_turn')
                  .eq('weather_state_id', weatherState.id),
                entities.supabaseClient
                  .from('career_weather_platforms')
                  .select('weather_state_id,platform_key,platform_mood,receipt_bias,modifier_payload,started_turn,ends_turn')
                  .eq('weather_state_id', weatherState.id),
              ]);

              const regionRows = regionRowsRes?.data || [];
              const platformRows = platformRowsRes?.data || [];
              const preferredPlatformKey = String(platformRows[0]?.platform_key || 'applecore');

              weatherRuntime = {
                global: weatherState,
                region: resolveRegionalWeather(primaryRegion, regionRows),
                platform: resolvePlatformWeather(preferredPlatformKey, platformRows),
              };
            }

            const baseLaneResult = resolveCareerLanes({
              player: {
                clout: Number(player.clout) || 0,
                hype: Number(player.hype) || 0,
              },
              fanProfile: {
                monthly_listeners: Number((fanProfileForAudience as any)?.monthly_listeners) || 0,
                loyalty: loyalty100,
              },
              chartStats: {
                chartPresenceRate,
                hasTop10: chartHasTop10,
                weeks2Plus: chartWeeks2Plus,
              },
              touring: {
                regionalDemand: heat100,
                reviewScore: Number((runtimeContext as any)?.turn_metrics?.tour_review_score) || 0,
                attendanceRatio: Number((runtimeContext as any)?.turn_metrics?.tour_attendance_ratio) || 0,
              },
              era: {
                momentum: Number((activeEraForAudience as any)?.momentum) || 0,
                identityAlignmentScore: Number((activeEraForAudience as any)?.identity_alignment_score) || 0,
                isExperimental: !!(activeEraForAudience as any)?.is_experimental,
              },
              fandom: {
                loyalty: loyalty100,
                laborStrength: Number((fandomMetrics as any)?.communityPower) || 0,
                controversyResilience: Number((fandomMetrics as any)?.controversyRecovery) || 0,
                retentionStrength: Number((runtimeContext as any)?.audience_quality_modifiers?.audienceDepth) || 0,
              },
              industry: {
                editorialReceptivity: Number((industryMetrics as any)?.editorialReceptivity) || 0,
                industryLeverage: Number((industryMetrics as any)?.industryLeverage) || 0,
                brandSafety: Number((industryMetrics as any)?.brandSafety) || 0,
                narrativeHeat: Number((industryMetrics as any)?.narrativeHeat) || 0,
              },
            });

            const laneResult = applyWeatherBias(baseLaneResult, weatherRuntime);
            const archetypeResult = inferCareerArchetype({
              dominant_lane: laneResult?.dominant_lane || null,
              secondary_lane: laneResult?.secondary_lane || null,
              weather_fit: laneResult?.weather_fit || null,
              proof_summary: Array.isArray(laneResult?.proof_summary) ? laneResult.proof_summary : [],
              posture: null,
            });

            runtimeContext.careerWeatherByArtistId = {
              [player.id]: weatherRuntime,
            };

            runtimeContext.careerLaneByArtistId = {
              [player.id]: laneResult,
            };

            runtimeContext.careerArchetypeByArtistId = {
              [player.id]: archetypeResult,
            };

            const conversionResult = resolveCareerConversion({
              attention: {
                commercialHeat: laneResult.scores.commercial_heat,
                chartPresenceRate,
                monthlyListeners: Number((fanProfileForAudience as any)?.monthly_listeners) || 0,
                narrativeHeat: Number((industryMetrics as any)?.narrativeHeat) || 0,
              },
              identity: {
                culturalInfluence: laneResult.scores.cultural_influence,
                identityAlignment: Number((activeEraForAudience as any)?.identity_alignment_score) || 0,
                editorialReceptivity: Number((industryMetrics as any)?.editorialReceptivity) || 0,
              },
              fandom: {
                coreFanDevotion: laneResult.scores.core_fan_devotion,
                loyalty: loyalty100,
                laborStrength: Number((fandomMetrics as any)?.communityPower) || 0,
                audienceDepth: Number((runtimeContext as any)?.audience_quality_modifiers?.audienceDepth) || 0,
              },
              outcomes: {
                liveDraw: laneResult.scores.live_draw,
                attendanceRatio: Number((runtimeContext as any)?.turn_metrics?.tour_attendance_ratio) || 0,
                spendingPower: Number((runtimeContext as any)?.turn_metrics?.merch_revenue) || 0,
                resilience: Number((fandomMetrics as any)?.controversyRecovery) || 0,
              },
            });

            runtimeContext.careerConversionByArtistId = {
              [player.id]: conversionResult,
            };

            results.deltas.career_shadow_profile_upsert = {
              player_id: player.id,
              commercial_heat_score: Number(laneResult?.scores?.commercial_heat) || 0,
              cultural_influence_score: Number(laneResult?.scores?.cultural_influence) || 0,
              live_draw_score: Number(laneResult?.scores?.live_draw) || 0,
              industry_respect_score: Number(laneResult?.scores?.industry_respect) || 0,
              core_fan_devotion_score: Number(laneResult?.scores?.core_fan_devotion) || 0,
              attention_conversion_score: Number(conversionResult?.stages?.attention) || 0,
              identity_conversion_score: Number(conversionResult?.stages?.identity_buy_in) || 0,
              fandom_conversion_score: Number(conversionResult?.stages?.fan_loyalty) || 0,
              turnout_conversion_score: Number(conversionResult?.stages?.turnout_spending_resilience) || 0,
              dominant_lane: laneResult?.dominant_lane || null,
              secondary_lane: laneResult?.secondary_lane || null,
              current_archetype: archetypeResult?.label || null,
              lane_signature: {
                proof_summary: Array.isArray(laneResult?.proof_summary) ? laneResult.proof_summary : [],
              },
              descriptor_payload: {
                weather_fit: laneResult?.weather_fit || weatherRuntime?.weather_fit || null,
                weather_keys: {
                  global: laneResult?.weather_keys?.global || weatherRuntime?.global?.weather_key || null,
                  region: laneResult?.weather_keys?.region || weatherRuntime?.region?.region || null,
                  platform: laneResult?.weather_keys?.platform || weatherRuntime?.platform?.platform_key || null,
                },
                progression_receipt: {
                  reason: 'promotion_window_met',
                  summary_label: 'Promotion window met',
                  previous_stage: player?.career_stage || null,
                  next_stage: ((player?.pending_stage_order || 0) + 1) > 0 ? 'Local Buzz' : null,
                  promotion_window_turns_required: 2,
                  promotion_chart_requirement: 'none',
                  chart_requirement_satisfied: true,
                  dominant_lane: laneResult?.dominant_lane || null,
                  secondary_lane: laneResult?.secondary_lane || null,
                  weather_fit: laneResult?.weather_fit || weatherRuntime?.weather_fit || null,
                  archetype: archetypeResult?.label || null,
                  proof_summary: Array.isArray(laneResult?.proof_summary) ? laneResult.proof_summary : [],
                },
                conversion_proof_summary: Array.isArray(conversionResult?.proof_summary) ? conversionResult.proof_summary : [],
                archetype: archetypeResult,
              },
              updated_turn: globalTurnId,
            };
          } catch (e: any) {
            console.error(`[turnScheduler] hidden lane resolution failed for ${player.id}:`, e?.message || e);
            runtimeContext.careerWeatherByArtistId = {};
            runtimeContext.careerLaneByArtistId = {};
            runtimeContext.careerArchetypeByArtistId = {};
            runtimeContext.careerConversionByArtistId = {};
          }
          moduleResult = await runCareerProgressionPipeline(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'careerTrendsModule':
          moduleResult = await runCareerTrendsModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'newsGenerationModule':
          moduleResult = await runNewsGenerationModule(player, globalTurnId, entitiesToUse, moduleState, ctx, runtimeContext);
          break;
        case 'turnProcessorNotifications':
          moduleResult = await runTurnProcessorNotifications(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'monthlyListenersModule':
          moduleResult = await runMonthlyListeners(player, globalTurnId, entitiesToUse, ctx, runtimeContext, results);
          break;
        case 'fandomSegmentsSentiment':
          moduleResult = await runFandomSegmentsSentimentModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'fandomSegmentsModule':
          moduleResult = await runFandomSegmentsModule(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        case 'controversyTick':
          moduleResult = await runControversyTick(player, globalTurnId, entitiesToUse, ctx, runtimeContext);
          break;
        default:
          throw new Error(`Unknown module: ${module.name}`);
      }

      // Check if module returned an error
      if (moduleResult?.success === false) {
        const rawError = moduleResult.error || 'Unknown module error';
        const errMsg = typeof rawError === 'string' ? rawError : 
                       (rawError instanceof Error ? rawError.message : 
                       (typeof rawError === 'object' ? JSON.stringify(rawError) : String(rawError)));
        console.error(`[turnScheduler] Module ${module.name} failed for ${player.artist_name}: ${errMsg}`);
        results.errors.push(`${module.name}: ${errMsg}`);
        // Still collect any error-diagnostic deltas (e.g. turn_events) the module returned
        if (moduleResult?.deltas?.turn_events) {
          results.deltas.turn_events.push(...moduleResult.deltas.turn_events);
        }
        continue;
      }

      // Log if module returned error without success:false (silent failure)
      if (moduleResult?.error && moduleResult?.success !== false) {
        console.error(`[turnScheduler] ${module.name} returned error without success:false for ${player.artist_name}:`, moduleResult.error);
        results.deltas.turn_events.push({
          global_turn_id: globalTurnId,
          player_id: player.id,
          module: module.name,
          event_type: 'MODULE_SILENT_ERROR',
          description: `Module returned error: ${moduleResult.error}`,
          metadata: { error: moduleResult.error },
          created_at: new Date().toISOString(),
        });
      }

      if (moduleResult?.deltas) {
        if (moduleResult.deltas.artistProfile) {
          const incomingArtistProfile = { ...moduleResult.deltas.artistProfile };
          const incomingHasCareerStage = Object.prototype.hasOwnProperty.call(incomingArtistProfile, 'career_stage');
          if (incomingHasCareerStage) {
            if (!careerStageDeltaOwner) {
              careerStageDeltaOwner = module.name;
            } else if (careerStageDeltaOwner !== module.name) {
              const traceId = `career_stage_conflict:${player.id}:${globalTurnId}`;
              const keepIncoming = module.name === 'careerProgressionPipeline';
              const keptOwner = keepIncoming ? module.name : careerStageDeltaOwner;
              const droppedOwner = keepIncoming ? careerStageDeltaOwner : module.name;

              if (!keepIncoming) {
                delete incomingArtistProfile.career_stage;
              }

              if (keepIncoming) {
                careerStageDeltaOwner = module.name;
              }

              results.deltas.turn_events.push({
                global_turn_id: globalTurnId,
                player_id: player.id,
                module: 'turnScheduler',
                event_type: 'CRITICAL_STAGE_OWNERSHIP_CONFLICT',
                description: `Multiple modules attempted to set career_stage in one turn; kept ${keptOwner}.`,
                metadata: {
                  traceId,
                  keptOwner,
                  droppedOwner,
                  incomingModule: module.name,
                  existingOwner: careerStageDeltaOwner,
                },
                created_at: new Date().toISOString(),
              });
            }
          }

          results.deltas.artistProfile = { ...results.deltas.artistProfile, ...incomingArtistProfile };
        }
        if (moduleResult.deltas.fanProfile) {
          results.deltas.fanProfile = { ...results.deltas.fanProfile, ...moduleResult.deltas.fanProfile };
        }
        if (moduleResult.deltas.era) {
          results.deltas.era = { ...results.deltas.era, ...moduleResult.deltas.era };
        }
        if (moduleResult.deltas.releases_updates) {
          results.deltas.releases_updates.push(...moduleResult.deltas.releases_updates);
        }
        if (moduleResult.deltas.merch_updates) {
          results.deltas.merch_updates.push(...moduleResult.deltas.merch_updates);
        }
        if (moduleResult.deltas.gig_updates) {
          results.deltas.gig_updates.push(...moduleResult.deltas.gig_updates);
        }
        if (moduleResult.deltas.tour_updates) {
          results.deltas.tour_updates.push(...moduleResult.deltas.tour_updates);
        }
        if (moduleResult.deltas.social_account_updates) {
          results.deltas.social_account_updates.push(...moduleResult.deltas.social_account_updates);
        }
        if (moduleResult.deltas.tour_event_updates) {
          results.deltas.tour_event_updates.push(...moduleResult.deltas.tour_event_updates);
        }
        if (moduleResult.deltas.news_items_to_create) {
          results.deltas.news_items_to_create.push(...moduleResult.deltas.news_items_to_create);
        }
        if (moduleResult.deltas.turn_events) {
          results.deltas.turn_events.push(...moduleResult.deltas.turn_events);
          runtimeContext.turn_events.push(...moduleResult.deltas.turn_events);
        }
        if (moduleResult.deltas.notifications_to_create) {
          results.deltas.notifications_to_create.push(...moduleResult.deltas.notifications_to_create);
        }
        if (moduleResult.deltas.career_events_to_create) {
          results.deltas.career_events_to_create.push(...moduleResult.deltas.career_events_to_create);
        }
        if (moduleResult.deltas.social_posts_to_create) {
          results.deltas.social_posts_to_create.push(...moduleResult.deltas.social_posts_to_create);
        }
        if (moduleResult.deltas.vidwave_ad_revenue_log) {
          results.deltas.vidwave_ad_revenue_log.push(...moduleResult.deltas.vidwave_ad_revenue_log);
        }
        if (moduleResult.deltas.looptok_revenue_log) {
          results.deltas.looptok_revenue_log.push(...moduleResult.deltas.looptok_revenue_log);
        }
        if (moduleResult.deltas.career_shadow_profile_upsert) {
          results.deltas.career_shadow_profile_upsert = moduleResult.deltas.career_shadow_profile_upsert;
        }
        if (moduleResult.deltas.career_trend_events) {
          results.deltas.career_trend_events.push(...moduleResult.deltas.career_trend_events);
          // Make trend change available to notifications module via runtimeContext
          const latestEvent = moduleResult.deltas.career_trend_events[0];
          if (latestEvent && (latestEvent.added?.length > 0 || latestEvent.removed?.length > 0)) {
            runtimeContext.career_trend_change = { added: latestEvent.added || [], removed: latestEvent.removed || [] };
          }
        }
        if (moduleResult.deltas.brand_deal_updates) {
          results.deltas.brand_deal_updates.push(...moduleResult.deltas.brand_deal_updates);
        }
        if (moduleResult.deltas.brand_deal_creates) {
          results.deltas.brand_deal_creates.push(...moduleResult.deltas.brand_deal_creates);
        }
        if (moduleResult.deltas.brand_deal_contract_updates) {
          results.deltas.brand_deal_contract_updates.push(...moduleResult.deltas.brand_deal_contract_updates);
        }
        if (moduleResult.deltas.brand_deal_payout_log_inserts) {
          results.deltas.brand_deal_payout_log_inserts.push(...moduleResult.deltas.brand_deal_payout_log_inserts);
        }
        if (moduleResult.deltas.player_brand_stats_upserts) {
          results.deltas.player_brand_stats_upserts.push(...moduleResult.deltas.player_brand_stats_upserts);
        }
        if (moduleResult.deltas.player_brand_affinity_upserts) {
          results.deltas.player_brand_affinity_upserts.push(...moduleResult.deltas.player_brand_affinity_upserts);
        }
        if (moduleResult.deltas.looptok_creator_state_upserts) {
          results.deltas.looptok_creator_state_upserts.push(...moduleResult.deltas.looptok_creator_state_upserts);
        }
        if (moduleResult.deltas.looptok_algo_state) {
          // Store looptok algo state so fandomSegmentsModule (order 4.5) can wire it into morale
          runtimeContext.looptok_algo_state = moduleResult.deltas.looptok_algo_state;
          runtimeContext.looptok_suppressed_streak = moduleResult.deltas.looptok_suppressed_streak || 0;
        }
        if (moduleResult.deltas.looptok_challenge_participation_updates) {
          results.deltas.looptok_challenge_participation_updates.push(...moduleResult.deltas.looptok_challenge_participation_updates);
        }
        if (moduleResult.deltas.looptok_challenge_awards) {
          results.deltas.looptok_challenge_awards.push(...moduleResult.deltas.looptok_challenge_awards);
        }
        // Touring expansion deltas
        if (moduleResult.deltas.tour_crew_updates) {
          results.deltas.tour_crew_updates.push(...moduleResult.deltas.tour_crew_updates);
        }
        if (moduleResult.deltas.tour_sponsorship_updates) {
          results.deltas.tour_sponsorship_updates.push(...moduleResult.deltas.tour_sponsorship_updates);
        }
        if (moduleResult.deltas.tour_choice_event_creates) {
          results.deltas.tour_choice_event_creates.push(...moduleResult.deltas.tour_choice_event_creates);
        }
        if (moduleResult.deltas.tour_choice_event_updates) {
          results.deltas.tour_choice_event_updates.push(...moduleResult.deltas.tour_choice_event_updates);
        }
        if (moduleResult.deltas.tour_opening_act_updates) {
          results.deltas.tour_opening_act_updates.push(...moduleResult.deltas.tour_opening_act_updates);
        }
        if (moduleResult.deltas.opener_tour_credits) {
          results.deltas.opener_tour_credits.push(...moduleResult.deltas.opener_tour_credits);
        }
        if (moduleResult.deltas.milestones_to_create) {
          results.deltas.milestones_to_create.push(...moduleResult.deltas.milestones_to_create);
        }
        if (moduleResult.deltas.fandom_updates) {
          results.deltas.fandom_updates.push(...moduleResult.deltas.fandom_updates);
        }
        if (moduleResult.deltas.fandom_segment_updates) {
          results.deltas.fandom_segment_updates.push(...moduleResult.deltas.fandom_segment_updates);
        }
        if (moduleResult.deltas.fandom_metrics_snapshot) {
          results.deltas.fandom_metrics_snapshot = moduleResult.deltas.fandom_metrics_snapshot;
        }
        if (moduleResult.deltas.controversy_case_updates) {
          results.deltas.controversy_case_updates.push(...moduleResult.deltas.controversy_case_updates);
        }
        if (moduleResult.deltas.social_post_metadata_updates) {
          results.deltas.social_post_metadata_updates.push(...moduleResult.deltas.social_post_metadata_updates);
        }
        if (moduleResult.deltas.controversy_case_inserts) {
          results.deltas.controversy_case_inserts.push(...moduleResult.deltas.controversy_case_inserts);
        }
        if (moduleResult.deltas.fan_war_updates) {
          results.deltas.fan_war_updates.push(...moduleResult.deltas.fan_war_updates);
        }
        if (moduleResult.deltas.fan_war_inserts) {
          results.deltas.fan_war_inserts.push(...moduleResult.deltas.fan_war_inserts);
        }
        if (moduleResult.deltas.fan_war_turn_inserts) {
          results.deltas.fan_war_turn_inserts.push(...moduleResult.deltas.fan_war_turn_inserts);
        }
        if (moduleResult.deltas.beef_inserts) {
          results.deltas.beef_inserts.push(...moduleResult.deltas.beef_inserts);
        }
        if (moduleResult.deltas.beef_updates) {
          results.deltas.beef_updates.push(...moduleResult.deltas.beef_updates);
        }
        if (moduleResult.deltas.artist_profile_updates) {
          results.deltas.artist_profile_updates.push(...moduleResult.deltas.artist_profile_updates);
        }
        if (moduleResult.deltas.fan_profile_updates) {
          results.deltas.fan_profile_updates.push(...moduleResult.deltas.fan_profile_updates);
        }
        if (moduleResult.deltas.xpress_event_requests) {
          results.deltas.xpress_event_requests.push(...moduleResult.deltas.xpress_event_requests);
        }
        if (moduleResult.deltas.release_turn_metrics) {
          results.deltas.release_turn_metrics.push(...moduleResult.deltas.release_turn_metrics);
        }
        if (moduleResult.deltas.soundburst_radio_submission_updates) {
          results.deltas.soundburst_radio_submission_updates.push(...moduleResult.deltas.soundburst_radio_submission_updates);
        }
        if (moduleResult.deltas.soundburst_radio_show_updates) {
          results.deltas.soundburst_radio_show_updates.push(...moduleResult.deltas.soundburst_radio_show_updates);
        }
        if (moduleResult.deltas.soundburst_radio_discovery_creates) {
          results.deltas.soundburst_radio_discovery_creates.push(...moduleResult.deltas.soundburst_radio_discovery_creates);
        }
        if (moduleResult.deltas.sample_request_updates) {
          results.deltas.sample_request_updates.push(...moduleResult.deltas.sample_request_updates);
        }
        if (moduleResult.deltas.sample_royalty_payment_upserts) {
          results.deltas.sample_royalty_payment_upserts.push(...moduleResult.deltas.sample_royalty_payment_upserts);
        }
        if (moduleResult.deltas.sample_achievement_upserts) {
          results.deltas.sample_achievement_upserts.push(...moduleResult.deltas.sample_achievement_upserts);
        }
        // AppleCore editorial deltas
        if (moduleResult.deltas.editorial_submission_updates) {
          results.deltas.editorial_submission_updates.push(...moduleResult.deltas.editorial_submission_updates);
        }
        if (moduleResult.deltas.editorial_curator_updates) {
          results.deltas.editorial_curator_updates.push(...moduleResult.deltas.editorial_curator_updates);
        }
        if (moduleResult.deltas.interview_slot_updates) {
          results.deltas.interview_slot_updates.push(...moduleResult.deltas.interview_slot_updates);
        }
        if (moduleResult.deltas.applecore_award_upserts) {
          results.deltas.applecore_award_upserts.push(...moduleResult.deltas.applecore_award_upserts);
        }
        if (moduleResult.deltas.editorial_submission_creates) {
          results.deltas.editorial_submission_creates.push(...moduleResult.deltas.editorial_submission_creates);
        }
        // Scene system deltas
        if (moduleResult.deltas.scene_deltas) {
          if (!results.deltas.scene_deltas) {
            results.deltas.scene_deltas = moduleResult.deltas.scene_deltas;
          } else {
            const sd = moduleResult.deltas.scene_deltas;
            if (sd.city_reputation_upserts) results.deltas.scene_deltas.city_reputation_upserts.push(...sd.city_reputation_upserts);
            if (sd.contact_relationship_upserts) results.deltas.scene_deltas.contact_relationship_upserts.push(...sd.contact_relationship_upserts);
            if (sd.trending_genre_updates) results.deltas.scene_deltas.trending_genre_updates.push(...sd.trending_genre_updates);
            if (sd.opening_act_crossover) results.deltas.scene_deltas.opening_act_crossover.push(...sd.opening_act_crossover);
          }
        }
        if (moduleResult.deltas.turn_metrics) {
          runtimeContext.turn_metrics = { ...runtimeContext.turn_metrics, ...moduleResult.deltas.turn_metrics };
        }
      }

      if (module.name === 'turnProcessorCore') {
        moduleState.coreTurnSummary = moduleResult?.deltas?.turn_event?.deltas || null;

        // Build release_turn_metrics rows for v2 chart system.
        // We read from the releases_updates that turnProcessorCore just produced.
        // Each update has a patch with lifetime_streams + platform_streams; we derive
        // the per-turn streams delta by comparing against the pre-turn values stored
        // in runtimeContext.turn_metrics.platform_streams (set by turnProcessorCore).
        // Simpler approach: use summary.streams_earned as total, proportionally split
        // per release using the incremental stream values in the patch.
        const rtmRows: any[] = [];
        for (const update of moduleResult?.deltas?.releases_updates || []) {
          if (update._entity === 'Project') continue;
          const patch = update.patch || {};
          // streams_this_turn is the incremental delta on this release for this turn.
          // turnProcessorCore sets lifetime_streams = old + delta, so we need old.
          // The patch may contain an incremental marker; use platform_streams sums.
          const platformStreams = patch.platform_streams || {};
          // Sum all platform streams added this turn (these are cumulative, but
          // turnProcessorCore also stores the delta in turn_metrics.streams_earned).
          // Best we can do from patch alone: total streams added = sum of per-platform
          // deltas. Since patch.platform_streams is the NEW cumulative value and we
          // don't have the old value here, we use the summary's per-release attribution.
          // turnProcessorCore stores release-level deltas in runtimeContext indirectly
          // via turn_metrics.streams_earned (total). For per-release granularity,
          // we tag the update itself with _streams_this_turn during turnProcessorCore.
          const streamsThisTurn = Number(patch._streams_this_turn || 0);
          if (streamsThisTurn <= 0) continue;

          // Paid/free/video split heuristic (80% paid, 20% free for audio platforms)
          const paidStreams = Math.floor(streamsThisTurn * 0.80);
          const freeStreams = streamsThisTurn - paidStreams;
          const videoStreams = Math.floor(streamsThisTurn * 0.05); // video reacts from vidwave

          rtmRows.push({
            global_turn_id: globalTurnId,
            release_id: update.id,
            artist_id: player.id,
            streams_this_turn: streamsThisTurn,
            paid_streams: paidStreams,
            free_streams: freeStreams,
            video_streams: videoStreams,
            region_streams: patch._region_streams || {},
            track_sales_units: 0,
            album_sales_units: 0,
            radio_impressions: 0,
            lifetime_streams: Number(patch.lifetime_streams || 0),
          });
        }
        if (rtmRows.length > 0) {
          results.deltas.release_turn_metrics.push(...rtmRows);
        }
      }

      const moduleDuration = Date.now() - moduleStart;
      if (moduleDuration > 3000) {
        console.warn(`[SLOW_MODULE] ${module.name} took ${moduleDuration}ms for player ${player.id}`);
      }
      results.timings[module.name] = moduleDuration;

      results.modules_run.push(module.name);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (stageOnly && errMsg?.includes('WRITE_BLOCKED')) {
        results.warnings.push(`${module.name}: stage_write_blocked_skipped`);
        continue;
      }
      results.errors.push(`${module.name}: ${errMsg}`);
      results.timings[module.name] = Date.now() - moduleStart;
      continue;
    }
  }

  // CRITICAL: Add turn_metrics to deltas so it gets persisted to player_turn_history
  // This contains hype_change, streams_earned, and all other per-turn metrics
  if (runtimeContext?.turn_metrics && Object.keys(runtimeContext.turn_metrics).length > 0) {
    results.deltas.turn_metrics = runtimeContext.turn_metrics;
  }

  return { ...results, runtimeContext };
}

async function runTurnProcessorCore(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processPlayerTurn = await loadModuleFunction('./turnProcessorCore.js', 'processPlayerTurn', 'turnProcessorCore');

  // Previous tick's fandom labor pool — pre-loaded from fandom_segments.labor_output
  // before any modules run (stored on runtimeContext.prev_fandom_labor_pool).
  const fandomLaborPool: Record<string, number> = runtimeContext?.prev_fandom_labor_pool || {};

  // Build unified Phase 6 context — pass ALL computed values, not just 2
  const p6 = runtimeContext?.phase6 || {};
  const phase6Ctx = {
    // Superfans boosts (4 channels)
    superfansStreamBoost:    p6.superfansStreamBoost    || 0,
    superfansMerchBoost:     p6.superfansMerchBoost     || 0,
    superfansTourBoost:      p6.superfansTourBoost      || 0,
    superfansRetentionBoost: p6.superfansRetentionBoost || 0,
    // Segment-based multipliers
    churnMultiplier:            p6.churnMultiplier            || 1,
    discoveryQualityMultiplier: p6.discoveryQualityMultiplier || 1,
    // Nostalgia effects
    nostalgiaChurnReduction:  p6.nostalgiaChurnReduction  || 0,
    nostalgiaDiscoveryBoost:  p6.nostalgiaDiscoveryBoost  || 0,
    // Cross-system hooks
    platformSpikeModifier:   p6.platformSpikeModifier   || 0,
    platformSustainPenalty:   p6.platformSustainPenalty   || 0,
    brandQualityModifier:    p6.brandQualityModifier    || 0,
    // Glamour & Community vector effects
    glamourSocialViralityBoost: p6.glamourSocialViralityBoost || 0,
    glamourBrandDealBoost:      p6.glamourBrandDealBoost      || 0,
    communityChurnReduction:    p6.communityChurnReduction    || 0,
    communityOrganicGrowthBoost: p6.communityOrganicGrowthBoost || 0,
    // Fatigue soft state
    fatigueSoftState:           p6.fatigueSoftState           || null,
  };

  return processPlayerTurn(player, globalTurnId, entities, {
    ...ctx,
    fandomModifiers: runtimeContext?.fandom_modifiers,
    audienceModifiers: runtimeContext?.audience_modifiers,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
    careerTrend: getCareerTrendRuntime(runtimeContext, player.id)?.trend || null,
    ...phase6Ctx,
    fandomLaborPool,
    playerActivity: runtimeContext?.playerActivity,
    runtimeContext,
  });
}

async function runFansUpdate(player: any, globalTurnId: number, entities: any, moduleState: any, ctx: any, runtimeContext: any) {
  const fanProfiles = runtimeContext?.fanProfile
    ? [runtimeContext.fanProfile]
    : await entities.FanProfile.filter({ artist_id: player.id });
  const fanProfile = fanProfiles?.[0];
  if (!fanProfile) return { success: false };

  const eras = runtimeContext?.activeEra
    ? [runtimeContext.activeEra]
    : await entities.Era.filter({ artist_id: player.id, is_active: true });
  const era = eras?.[0];

  const updateFansForPlayer = await loadModuleFunction('./fansUpdateModule.js', 'updateFansForPlayer', 'fansUpdateModule');
  const coreDeltas = moduleState?.coreTurnSummary || runtimeContext?.turn_metrics || {};
  return updateFansForPlayer(player, fanProfile, globalTurnId, entities, coreDeltas, era, {
    ...ctx,
    fandomModifiers: runtimeContext?.fandom_modifiers,
    audienceModifiers: runtimeContext?.audience_modifiers,
    audienceQualityModifiers: runtimeContext?.audience_quality_modifiers,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
    superfansRetentionBoost: runtimeContext?.phase6?.superfansRetentionBoost || 0,
    playerActivity: runtimeContext?.playerActivity,
  });
}

async function runTurnProcessorEra(player: any, globalTurnId: any, entities: any, ctx: any, runtimeContext: any = {}) {
  const processEraForPlayer = await loadModuleFunction('./turnProcessorEra.js', 'processEraForPlayer', 'turnProcessorEra');
  return processEraForPlayer(player, globalTurnId, entities, {
    ...ctx,
    turn_metrics: runtimeContext?.turn_metrics || {},
    fanProfile: runtimeContext?.fanProfile || null,
    allEras: Array.isArray(runtimeContext?.allEras) ? runtimeContext.allEras : [],
    activeEra: runtimeContext?.activeEra || null,
    industryPerceptionModifiers: runtimeContext?.industry_perception_modifiers,
    audienceQualityModifiers: runtimeContext?.audience_quality_modifiers,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
  });
}

async function runTurnProcessorNotifications(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const fanProfiles = runtimeContext?.fanProfile
    ? [runtimeContext.fanProfile]
    : await entities.FanProfile.filter({ artist_id: player.id });
  const fanProfile = fanProfiles?.[0];
  if (!fanProfile) return { success: false };

  const generateNotificationsForTurn = await loadModuleFunction('./notificationsGenerator.js', 'generateNotificationsForTurn', 'notificationsGenerator');
  const notifications = await generateNotificationsForTurn(player, fanProfile, globalTurnId, entities, {
    ...ctx,
    turn_metrics: runtimeContext.turn_metrics || {},
    career_trend_change: runtimeContext.career_trend_change || null,
    fandom_modifiers: runtimeContext.fandom_modifiers || null,
  });

  return { success: true, deltas: { notifications_to_create: notifications } };
}

async function runMonthlyListeners(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext?: any, liveResults?: any) {
  const fanProfiles = runtimeContext?.fanProfile
    ? [runtimeContext.fanProfile]
    : await entities.FanProfile.filter({ artist_id: player.id });
  const fanProfile = fanProfiles?.[0];
  if (!fanProfile) return { success: false };

  const updateMonthlyListenersForPlayer = await loadModuleFunction('./monthlyListenersModule.js', 'updateMonthlyListenersForPlayer', 'monthlyListenersModule');
  return updateMonthlyListenersForPlayer(player, fanProfile, globalTurnId, entities, {
    ...ctx,
    stagedFanProfile: liveResults?.deltas?.fanProfile || null,
  });
}

async function runSocialMediaModule(player: any, globalTurnId: number, entities: any, moduleState: any, ctx: any, runtimeContext: any) {
  const processSocialMediaForPlayer = await loadModuleFunction('./socialMediaModule.js', 'processSocialMediaForPlayer', 'socialMediaModule');
  
  // Extract runaway song data from core turn summary if it exists
  const runawaySong = moduleState?.coreTurnSummary?.runawaySong || null;

  const moduleCtx = {
    entities,
    stageOnly: !!ctx?.stageOnly || !!ctx?.dry_run,
    globalTurnId,
    turn_metrics: runtimeContext?.turn_metrics || {},
    fandomModifiers: runtimeContext?.fandom_modifiers,
    audienceModifiers: runtimeContext?.audience_modifiers,
    industryPerceptionModifiers: runtimeContext?.industry_perception_modifiers,
    audienceQualityModifiers: runtimeContext?.audience_quality_modifiers,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
    runawaySong, // Pass to social module
    algorithmMood: ctx?.algorithmMood || 'mainstream',
    platformSpotlight: ctx?.platformSpotlight || 'looptok',
    prevFandomLaborPool: runtimeContext?.prev_fandom_labor_pool || {},
    prefetchData: runtimeContext?.prefetchData || null,
  };
  const result = await processSocialMediaForPlayer(moduleCtx, player);
  
  // If the module returns explicit deltas (new format), use them directly
  if (result?.deltas) {
    return { success: true, deltas: result.deltas };
  }

  // Adapt legacy result format to standard deltas (fallback)
  const deltas: Record<string, any> = {};
  if (result?.social_revenue !== undefined || result?.social_follower_growth !== undefined) {
    deltas.turn_metrics = {
      social_revenue: result.social_revenue || 0,
      social_follower_growth: result.social_follower_growth || 0
    };
  }
  if (result?.notifications?.length) {
    deltas.notifications_to_create = result.notifications;
  }
  return { success: true, deltas };
}

async function runSoundburstRadioModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processSoundburstRadio = await loadModuleFunction('./soundburstRadioModule.js', 'processSoundburstRadio', 'soundburstRadioModule');
  const recalculateRadioShows = await loadModuleFunction('./soundburstRadioModule.js', 'recalculateRadioShows', 'soundburstRadioModule');

  const moduleResult = await processSoundburstRadio(player, null, globalTurnId, entities, {
    ...ctx,
    runtimeContext,
  });

  if ((ctx as any)?.isFirstPlayer === true && globalTurnId % 7 === 0) {
    try {
      const recalc = await recalculateRadioShows(globalTurnId, entities, {
        ...ctx,
        runtimeContext,
      });
      if (recalc?.success && Array.isArray(recalc.show_updates) && recalc.show_updates.length > 0) {
        moduleResult.deltas = moduleResult.deltas || {};
        moduleResult.deltas.soundburst_radio_show_updates = [
          ...(moduleResult.deltas.soundburst_radio_show_updates || []),
          ...recalc.show_updates,
        ];
      }
    } catch (error) {
      console.error('[turnScheduler] soundburst recalculateRadioShows failed:', (error as any)?.message || error);
    }
  }

  return moduleResult;
}

async function runTouringManager(player: any, globalTurnId: number, entities: any, moduleState: any, ctx: any, runtimeContext: any) {
  const processTouringForPlayer = await loadModuleFunction('./touringManager.js', 'processTouringForPlayer', 'touringManager');
  
  const moduleCtx = {
    entities,
    stageOnly: !!ctx?.stageOnly || !!ctx?.dry_run,
    globalTurnId,
    summary: moduleState.coreTurnSummary,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
    superfansTourBoost: runtimeContext?.phase6?.superfansTourBoost || 0,
    fandomLaborPool: runtimeContext?.prev_fandom_labor_pool || {},
    runtimeContext,
  };
  
  const result = await processTouringForPlayer(moduleCtx, player);
  
  // Plan 034 M1: Extract gig completion context and wire to runtimeContext
  // Plan 035 M2: Also extract underground event completion context
  // This enables sceneSystemModule (order 5) to detect same-turn gig completions
  // without reading stale DB state
  if (result?.deltas) {
    const gigCompletionContext = extractGigCompletionContext(result.deltas, player.id, globalTurnId);
    const undergroundContext = extractUndergroundCompletionContext(result.deltas, player.id, globalTurnId);

    // Merge both touring gigs and underground events into a single context for sceneSystemModule
    const allCompletions = [
      ...(gigCompletionContext?.completions || []),
      ...(undergroundContext?.completions || []),
    ];

    if (allCompletions.length > 0) {
      // Initialize the map if not present
      if (!runtimeContext.sceneSystemGigContextByArtistId) {
        runtimeContext.sceneSystemGigContextByArtistId = {};
      }
      // Store in consumer-facing format for sceneSystemModule
      runtimeContext.sceneSystemGigContextByArtistId[player.id] = buildSceneSystemGigContext({ completions: allCompletions });
    }
    return { success: true, deltas: result.deltas };
  }
  
  return { success: true, deltas: {} };
}

async function runCareerProgressionPipeline(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processCareerProgression = await loadModuleFunction('./careerProgressionPipeline.js', 'processCareerProgression', 'careerProgressionPipeline');
  
  const moduleCtx = {
    entities,
    stageOnly: !!ctx?.stageOnly || !!ctx?.dry_run,
    globalTurnId,
    runtimeContext,
    supabaseAdmin: ctx?.supabaseAdmin || entities?.supabaseClient,
  };
  
  const result = await processCareerProgression(moduleCtx, player);

  if (result?.success === false) {
    console.error(`[careerProgressionPipeline] failed for ${player.id}: ${result?.reason || 'unknown'}`);
  }

  if (result?.deltas) {
    return { success: true, deltas: result.deltas };
  }

  return { success: true, deltas: {} };
}

async function runCareerTrendsModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const fanProfiles = runtimeContext?.fanProfile
    ? [runtimeContext.fanProfile]
    : await entities.FanProfile.filter({ artist_id: player.id });
  const fanProfile = fanProfiles?.[0];
  if (!fanProfile) return { success: false };

  const processCareerTrendsForPlayer = await loadModuleFunction('./careerTrendsModule.js', 'processCareerTrendsForPlayer', 'careerTrendsModule');
  return processCareerTrendsForPlayer(player, fanProfile, globalTurnId, entities, { ...ctx, runtimeContext });
}

async function runNewsGenerationModule(player: any, globalTurnId: number, entities: any, moduleState: any, ctx: any, runtimeContext: any) {
  const processNewsForPlayer = await loadModuleFunction('./newsGenerationModule.js', 'processNewsForPlayer', 'newsGenerationModule');

  if (player?.is_npc === true) {
    return { success: true, deltas: {} };
  }

  // Enrich turn_metrics with data the news module needs but core doesn't emit directly
  const trendChange = runtimeContext?.career_trend_change || {};
  const coreSummary = moduleState?.coreTurnSummary || {};
  const enrichedMetrics = {
    ...runtimeContext?.turn_metrics || {},
    // Career trend changes (from careerTrendsModule delta, order 5.7)
    career_trend_added: trendChange.added || [],
    career_trend_removed: trendChange.removed || [],
    // Latest release name for release_drop articles (set by core when releases activate)
    latest_release_name: coreSummary.latest_release_name || runtimeContext?.turn_metrics?.latest_release_name || null,
    latest_release_type: coreSummary.latest_release_type || runtimeContext?.turn_metrics?.latest_release_type || null,
    // Tour completed flag (set by touringManager)
    tour_completed: coreSummary.tour_completed || runtimeContext?.turn_metrics?.tour_completed || false,
    tour_name: coreSummary.tour_name || runtimeContext?.turn_metrics?.tour_name || null,
    tour_stops_completed: coreSummary.tour_stops_completed || runtimeContext?.turn_metrics?.tour_stops_completed || 0,
  };

  // Phase 3: Enrich with recent festival performance flags (last 5 turns)
  // Festival module runs after player turns, so results are available next tick.
  try {
    const supabaseAdmin = ctx?.supabaseAdmin || entities?.supabaseClient;
    if (supabaseAdmin && player?.id) {
      const { data: recentPerfs } = await supabaseAdmin
        .from('festival_performance_results')
        .select('crowd_heat, credibility, moment_card, festival_instance_id, festival_instances!inner(festival_id, festivals!inner(name))')
        .eq('artist_id', player.id)
        .gte('resolved_turn_id', globalTurnId - 5)
        .order('resolved_turn_id', { ascending: false })
        .limit(3);

      if (recentPerfs?.length) {
        const best = recentPerfs[0];
        const festName = best?.festival_instances?.festivals?.name || null;
        if (best.crowd_heat >= 85) {
          enrichedMetrics.festival_legendary_set = true;
          enrichedMetrics.festival_name = festName;
        } else if (best.crowd_heat >= 60) {
          enrichedMetrics.festival_solid_set = true;
          enrichedMetrics.festival_name = festName;
        } else if (best.crowd_heat < 40) {
          enrichedMetrics.festival_weak_set = true;
          enrichedMetrics.festival_name = festName;
        }
        if (best.credibility < 30) {
          enrichedMetrics.festival_controversy = true;
          enrichedMetrics.festival_name = festName;
        }
      }
    }
  } catch (_) { /* non-fatal */ }

  const moduleCtx = {
    entities,
    stageOnly: !!ctx?.stageOnly || !!ctx?.dry_run,
    globalTurnId,
    turn_metrics: enrichedMetrics,
    turn_events: runtimeContext?.turn_events || [],
  };
  
  const result = await processNewsForPlayer(moduleCtx, player);
  
  if (result?.deltas) {
    return { success: true, deltas: result.deltas };
  }
  
  return { success: true, deltas: {} };
}

async function runFanWarTick(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processFanWarTick = await loadModuleFunction('./fanWarTickModule.js', 'processFanWarTick', 'fanWarTickModule');
  return processFanWarTick(player, globalTurnId, entities, {
    ...ctx,
    fandomModifiers: runtimeContext?.fandom_modifiers,
    fandomLaborPool: runtimeContext?.prev_fandom_labor_pool || {},
    industryPerceptionModifiers: runtimeContext?.industry_perception_modifiers,
    audienceModifiers: runtimeContext?.audience_modifiers,
    audienceQualityModifiers: runtimeContext?.audience_quality_modifiers,
    careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
  });
}

async function runBeefTick(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processBeefTick = await loadModuleFunction('./beefTickModule.js', 'processBeefTick', 'beefTickModule');
  return processBeefTick(player, globalTurnId, entities, ctx);
}

async function runSampleClearanceModule(player: any, globalTurnId: number, entities: any, ctx: any, _runtimeContext: any) {
  const processSampleClearanceForPlayer = await loadModuleFunction('./sampleClearanceModule.js', 'processSampleClearanceForPlayer', 'sampleClearanceModule');
  return processSampleClearanceForPlayer(player, globalTurnId, entities, ctx);
}

async function runSampleAchievementsModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processSampleAchievementsForPlayer = await loadModuleFunction('./sampleAchievementsModule.js', 'processSampleAchievementsForPlayer', 'sampleAchievementsModule');
  return processSampleAchievementsForPlayer(player, globalTurnId, entities, { ...ctx, turn_metrics: runtimeContext?.turn_metrics || {} });
}

async function runSampleRoyaltyModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processSampleRoyaltiesForPlayer = await loadModuleFunction('./sampleRoyaltyModule.js', 'processSampleRoyaltiesForPlayer', 'sampleRoyaltyModule');
  return processSampleRoyaltiesForPlayer(player, globalTurnId, entities, { ...ctx, turn_metrics: runtimeContext?.turn_metrics || {} });
}

async function runApplecoreEditorialModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processApplecoreEditorial = await loadModuleFunction('./applecoreEditorialModule.js', 'processApplecoreEditorial', 'applecoreEditorialModule');
  const recalculateEditorialCurators = await loadModuleFunction('./applecoreEditorialModule.js', 'recalculateEditorialCurators', 'applecoreEditorialModule');
  const processAwardCycle = await loadModuleFunction('./applecoreEditorialModule.js', 'processAwardCycle', 'applecoreEditorialModule');

  const moduleResult = await processApplecoreEditorial(player, null, globalTurnId, entities, {
    ...ctx,
    runtimeContext,
  });

  // Global singleton: recalculate editorial curators every 7 turns (first player only)
  if ((ctx as any)?.isFirstPlayer === true && globalTurnId % 7 === 0) {
    try {
      const recalc = await recalculateEditorialCurators(globalTurnId, entities, {
        ...ctx,
        runtimeContext,
      });
      if (recalc?.success && Array.isArray(recalc.curator_updates) && recalc.curator_updates.length > 0) {
        moduleResult.deltas = moduleResult.deltas || {};
        moduleResult.deltas.editorial_curator_updates = [
          ...(moduleResult.deltas.editorial_curator_updates || []),
          ...recalc.curator_updates,
        ];
      }
    } catch (error) {
      console.error('[turnScheduler] recalculateEditorialCurators failed:', (error as any)?.message || error);
    }
  }

  // Global singleton: annual award cycle (first player only, every 365 turns)
  if ((ctx as any)?.isFirstPlayer === true && globalTurnId % 365 === 0) {
    try {
      const { supabaseAdmin } = await import('./lib/supabaseAdmin.ts');
      const awardResult = await processAwardCycle(globalTurnId, supabaseAdmin);
      if (awardResult?.success && awardResult.awards_created > 0) {
        moduleResult.deltas = moduleResult.deltas || {};
        if (awardResult.turn_events) {
          moduleResult.deltas.turn_events = [...(moduleResult.deltas.turn_events || []), ...awardResult.turn_events];
        }
        if (awardResult.notifications) {
          moduleResult.deltas.notifications_to_create = [...(moduleResult.deltas.notifications_to_create || []), ...awardResult.notifications];
        }
        if (awardResult.news_items_to_create) {
          moduleResult.deltas.news_items_to_create = [...(moduleResult.deltas.news_items_to_create || []), ...awardResult.news_items_to_create];
        }
        if (awardResult.applecore_award_upserts) {
          moduleResult.deltas.applecore_award_upserts = [...(moduleResult.deltas.applecore_award_upserts || []), ...awardResult.applecore_award_upserts];
        }
        if (awardResult.editorial_submission_creates) {
          moduleResult.deltas.editorial_submission_creates = [...(moduleResult.deltas.editorial_submission_creates || []), ...awardResult.editorial_submission_creates];
        }
      }
    } catch (error) {
      console.error('[turnScheduler] processAwardCycle failed:', (error as any)?.message || error);
    }
  }

  return moduleResult;
}

async function runSceneSystemModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processSceneSystem = await loadModuleFunction('./sceneSystemModule.js', 'processSceneSystem', 'sceneSystemModule');
  return processSceneSystem(player, null, globalTurnId, entities, {
    ...ctx,
    focusPath: runtimeContext?.focus_path || player.focus_path,
    archetype: runtimeContext?.archetype || player.archetype,
    isFirstPlayer: runtimeContext?.isFirstPlayer || false,
    runtimeContext,
  });
}

async function runFandomSegmentsSentimentModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processFandomSegmentsSentiment = await loadModuleFunction('./fandomSegmentsSentimentModule.js', 'processFandomSegmentsSentiment', 'fandomSegmentsSentiment');
  const result = await processFandomSegmentsSentiment(
    player, globalTurnId, entities, {}, {
      ...ctx,
      prefetchData: runtimeContext?.prefetchData || null,
      era: runtimeContext?.era || null,
      releaseThisTurn: runtimeContext?.turn_metrics?.releaseThisTurn || null,
      activeControversy: runtimeContext?.controversy_signal || null,
      socialPostsThisTurn: runtimeContext?.turn_metrics?.socialPostsThisTurn || [],
      noContentTicks: runtimeContext?.turn_metrics?.no_content_ticks || 0,
      playerActivity: runtimeContext?.playerActivity || null,
      communityMessages: runtimeContext?.turn_metrics?.communityMessages || [],
      turnMetrics: runtimeContext?.turn_metrics || {},
      primaryPersona: runtimeContext?.prefetchData?.playerBrandStatsByPlayer?.get(player.id)?.marketing_persona_primary || null,
    },
  );
  if (!result.success) return result;
  // Store segment sentiment patches for commit phase
  if (result.segmentSentimentPatches && runtimeContext) {
    runtimeContext.segment_sentiment_patches = result.segmentSentimentPatches;
    console.log(`[Scheduler][SegSentiment] player=${player.id} relaying ${result.segmentSentimentPatches.length} patches, events=${(result.events || []).length}`);
  }
  return {
    success: true,
    deltas: {
      fandom_segment_updates: result.segmentSentimentPatches || [],
      turn_events: result.events || [],
    },
  };
}

async function runFandomSegmentsModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processFandomSegmentsForPlayer = await loadModuleFunction('./fandomSegmentsModule.js', 'processFandomSegmentsForPlayer', 'fandomSegmentsModule');
  const turnMetrics = runtimeContext?.turn_metrics || {};
  const controversySignal = runtimeContext?.controversy_signal || {};
  const result = await processFandomSegmentsForPlayer(
    player, globalTurnId, entities,
    turnMetrics,  // deltas arg: streams_earned, releases_activated, social_posts_created, release_quality_score
    {
      ...ctx,
      overallSentiment: runtimeContext?.audience_modifiers?.effectiveSentiment100 || 0,
      careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null,
      actionTags: runtimeContext?.action_tags || [],
      activeControversies: controversySignal?.activeCount || 0,
      activeWars: runtimeContext?.active_wars_count || 0,
      controversyActiveTicks: controversySignal?.totalActiveTicks || 0,
      phase6State: runtimeContext?.phase6?.state || null,
      looptokAlgoState: runtimeContext?.looptok_algo_state || 'neutral',
      looptokSuppressedStreak: runtimeContext?.looptok_suppressed_streak || 0,
      prefetchData: runtimeContext?.prefetchData || null,
      playerActivity: runtimeContext?.playerActivity,
    },
  );
  if (!result.success) return result;
  // Store metrics snapshot in runtimeContext for commit phase
  if (result.metricsSnapshot && runtimeContext) {
    runtimeContext.fandom_metrics_snapshot = result.metricsSnapshot;
  }
  if (result.laborPool && runtimeContext) {
    runtimeContext.fandom_labor_pool = result.laborPool;
  }
  return {
    success: true,
    deltas: {
      fandom_updates:          result.fandomPatch   ? [{ player_id: player.id, patch: result.fandomPatch }] : [],
      fandom_segment_updates:  result.segmentPatches || [],
      notifications_to_create: result.notifications || [],
      fandom_metrics_snapshot: result.metricsSnapshot || null,
    },
  };
}

async function runControversyTick(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const processControversyTick = await loadModuleFunction('./controversyTickModule.js', 'processControversyTick', 'controversyTickModule');
  const result = await processControversyTick(player, globalTurnId, entities, {
    ...ctx,
    fandomModifiers: runtimeContext?.fandom_modifiers,
  });
  // Store controversy signal in runtimeContext for downstream modules
  if (result?.controversySignal && runtimeContext) {
    runtimeContext.controversy_signal = result.controversySignal;
  }
  return result;
}

async function runBrandDealsModule(player: any, globalTurnId: number, entities: any, ctx: any, runtimeContext: any) {
  const prefetch = runtimeContext?.prefetchData;
  // Fan profile: try prefetch first, then runtimeContext, then DB fallback
  const fanProfiles = prefetch?.fanProfilesByPlayer?.get(player.id)
    ? [prefetch.fanProfilesByPlayer.get(player.id)]
    : runtimeContext?.fanProfile
      ? [runtimeContext.fanProfile]
      : await entities.FanProfile.filter({ artist_id: player.id });
  const fanProfile = fanProfiles?.[0];
  // Compute average scene reputation for brand deal boost
  let sceneReputationBoost = 0;
  let strongestSceneRegion: string | null = null;
  let strongestSceneReputation = 0;
  let preferredSceneRegions: string[] = [];
  try {
    // Use prefetched city reps and city scenes maps when available
    const reps = prefetch?.cityRepsByPlayer?.get(player.id)
      || (await entities.supabaseClient
        .from('player_city_reputation').select('reputation_score, city_id').eq('player_id', player.id)).data;
    if (reps && reps.length > 0) {
      sceneReputationBoost = reps.reduce((s: number, r: any) => s + (Number(r.reputation_score) || 0), 0) / reps.length;
      const cityIds = Array.from(
        new Set<string>(reps.map((r: any) => String(r.city_id || '')).filter((value: string) => Boolean(value)))
      );
      // Build city→region map from prefetched cityScenesMap or DB fallback
      let cityRegionMap = new Map<string, string>();
      if (cityIds.length > 0) {
        if (prefetch?.cityScenesMap?.size) {
          for (const cid of cityIds) {
            const scene = prefetch.cityScenesMap.get(cid);
            if (scene?.region) cityRegionMap.set(cid, String(scene.region));
          }
        } else {
          const { data: cityRows } = await entities.supabaseClient
            .from('city_scenes')
            .select('id, region')
            .in('id', cityIds);
          cityRegionMap = new Map((cityRows || []).map((row: any) => [String(row.id), String(row.region || '')]));
        }
      }
      const regionScores = new Map<string, number[]>();
      for (const row of reps) {
        const region = cityRegionMap.get(String(row.city_id || '')) || '';
        if (!region) continue;
        const bucket = regionScores.get(region) || [];
        bucket.push(Number(row.reputation_score) || 0);
        regionScores.set(region, bucket);
      }
      const rankedRegions = [...regionScores.entries()]
        .map(([region, scores]) => ({ region, score: scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length) }))
        .sort((a, b) => b.score - a.score);
      strongestSceneRegion = rankedRegions[0]?.region || null;
      strongestSceneReputation = Number(rankedRegions[0]?.score || 0);
      preferredSceneRegions = rankedRegions.map((entry) => entry.region).filter(Boolean).slice(0, 3);
    }
  } catch { /* non-critical */ }
  // Load fandom vitals (fan_morale, brand_trust) so brand deals can reflect fandom health
  let fanMorale = 50;
  let brandTrust = 50;
  try {
    // Use prefetched fandoms data when available
    const fandomVitals = prefetch?.fandomsByPlayer?.get(player.id)
      || (await entities.supabaseClient
        .from('fandoms').select('fan_morale,brand_trust').eq('player_id', player.id).maybeSingle()).data;
    if (fandomVitals) {
      fanMorale = Number(fandomVitals.fan_morale ?? 50);
      brandTrust = Number(fandomVitals.brand_trust ?? 50);
    }
  } catch { /* non-critical */ }
  const processBrandDealsForPlayer = await loadModuleFunction('./brandDealsModule.js', 'processBrandDealsForPlayer', 'brandDealsModule');
  // Career lane data: try runtimeContext first (populated by careerProgressionPipeline),
  // fall back to persisted snapshot from previous turn (brand deals run BEFORE career pipeline)
  let careerLaneData = runtimeContext?.careerLaneByArtistId?.[player.id] || null;
  let careerArchetypeData = runtimeContext?.careerArchetypeByArtistId?.[player.id] || null;
  if (!careerLaneData) {
    try {
      const { data: snap } = await entities.supabaseClient
        .from('v_career_progression_snapshot')
        .select('dominant_lane, secondary_lane, current_archetype')
        .eq('artist_id', player.id).maybeSingle();
      if (snap) {
        careerLaneData = { dominant_lane: snap.dominant_lane, secondary_lane: snap.secondary_lane };
        careerArchetypeData = { archetype: snap.current_archetype };
      }
    } catch { /* non-critical */ }
  }
  // Algorithm mood + active era for brand deal context
  const algorithmMood = runtimeContext?.algorithm_mood || runtimeContext?.algorithmMood || null;
  const activeEra = runtimeContext?.activeEraByArtistId?.[player.id] || ctx?.activeEra || null;

  return processBrandDealsForPlayer(player, fanProfile, globalTurnId, entities, { ...ctx, industryPerceptionModifiers: runtimeContext?.industry_perception_modifiers, careerTrendEffects: getCareerTrendRuntime(runtimeContext, player.id)?.effects || null, careerTrend: getCareerTrendRuntime(runtimeContext, player.id)?.trend || null, brandQualityModifier: runtimeContext?.phase6?.brandQualityModifier || 0, sceneReputationBoost, strongestSceneRegion, strongestSceneReputation, preferredSceneRegions, fanMorale, brandTrust, careerLaneData, careerArchetypeData, algorithmMood, activeEra });
}

async function loadModuleFunction(path: string, symbolName: string, moduleName: string) {
  let mod = null;
  try {
    mod = await import(path);
  } catch (error) {
    if (!path.endsWith('.js')) throw error;
    mod = await import(path.replace(/\.js$/, '.ts'));
  }

  const fn = mod[symbolName];
  if (typeof fn !== 'function') {
    throw new Error(`MODULE_SYMBOL_MISSING: ${moduleName}.${symbolName}`);
  }
  return fn;
}
