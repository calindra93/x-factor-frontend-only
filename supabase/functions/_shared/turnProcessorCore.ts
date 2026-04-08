/**
 * TURN PROCESSOR - CORE LOOP (Batch 3.1 - Staging Compatible)
 * Pure staging function: returns deltas only, NO entity writes during staging
 * Modules run inside scheduler/turnEngine which handles writes in commit phase
 * turnEngine owns idempotency, history, and notification creation
 */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Supabase returns numeric/decimal columns as strings — coerce to number
function N(v: any): number { return Number(v) || 0; }

import {
  calculateReleaseStreams,
  distributeStreamsByPlatform,
  computeMerchSales,
  calculateTurnPayout,
  calculateGigRevenue,
  getNextLifecycleState,
  calculateBrandDealRevenue,
  calculateFanSubRevenue,
  calculateSyncLicensing,
  calculateCollabRevenue,
  computeMoodStreamBonus,
  computeSegmentSentimentStreamMultiplier,
  calculatePhysicalMediaRevenue,
  PLATFORM_PAYOUT_RATES,
  ERA_MULTIPLIER_DEFAULTS,
  PHYSICAL_MEDIA_STREAM_BOOST,
  isTerminalState,
  LIFECYCLE_DURATIONS,
} from './economyMath.ts';
import { enforceReleaseInvariants } from './releaseStateInvariants.ts';
import { evaluateReleaseOutcome, POSITIVE_OUTCOMES } from './releaseOutcomeEvaluator.ts';
import { computeFollowerChurnLoss } from './followerChurn.ts';
import { DIRECTABLE_FANDOM_SEGMENT_TYPES } from './fandomCanonicalSelectors.ts';
import {
  processRunawaySongMechanic,
  applyRunawayStreamMultiplier,
  applyRunawayFollowerBoost,
  applyRunawayPhysicalBoost,
  applyRunawayRevenueMultiplier
} from './runawaySongMechanic.ts';
import { 
  getCanonicalAttribution, 
  validateRemixCreation, 
  validateDeluxeCreation 
} from './releaseCanonicalAttribution.ts';

import { calculateCareerSetback } from './careerProgressionLogic.ts';
import { computePlayerActivity } from './playerActivity.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { inferTrendForRelease } from './trendEvolutionModule.ts';
import { buildReleasePipelineTelemetryEvent } from './releasePipelineTelemetry.ts';

async function createDeterministicRNG(playerId: string, turnId: number, secret = 'xfactor-rng-v1') {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${playerId}-${turnId}-${secret}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const seed = new Uint8Array(hashBuffer);
  
  let state = (seed[0] << 24) | (seed[1] << 16) | (seed[2] << 8) | seed[3];
  
  return {
    random() {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    },
    randomInt(min: number, max: number) {
      return Math.floor(this.random() * (max - min)) + min;
    }
  };
}

/**
 * Process player turn - STAGING ONLY
 * NO entity writes. Returns deltas for scheduler aggregation.
 * Idempotency, history, notifications are handled by turnEngine.
 */
export async function processPlayerTurn(player: any, globalTurnId: number, entities: any, ctx: any = {}) {
  if (!player?.id) return { success: false, error: 'No player ID' };

  // Invariant #1 guard: lifecycle_state_changed_turn must always use game turn, never wall-clock time
  // globalTurnId should never exceed plausible game turn count (100k turns ≈ 274 years at 1 turn/day)
  if (globalTurnId > 100000) {
    console.error(`[Core][INVARIANT_VIOLATION] globalTurnId=${globalTurnId} exceeds plausible game turn — possible Date.now() poisoning`);
    throw new Error(`globalTurnId (${globalTurnId}) exceeds plausible game turn threshold`);
  }

  try {
    const rng = await createDeterministicRNG(player.id, globalTurnId);

  // ── Prefetch data access (bulk-loaded by turnWorkerProcessor, eliminates N+1 queries) ──
  const _pf = ctx?.runtimeContext?.prefetchData || ctx?.prefetch || null;
  const _pfReleases: any[] | null = _pf?.releasesByPlayer?.get(player.id) || null;
  const _pfSongs: any[] | null = _pf?.songsByPlayer?.get(player.id) || null;
  const _pfMerch: any[] | null = _pf?.fullMerchByPlayer?.get(player.id) || null;
  const _pfSocialAccounts: any[] | null = _pf?.socialAccountsByPlayer?.get(player.id) || null;
  const _pfProjects: any[] | null = _pf?.projectsByPlayer?.get(player.id) || null;
  const _pfNews: any[] | null = _pf?.newsItemsByPlayer?.get(player.id) || null;
  const _pfCerts: Map<string, any[]> | null = _pf?.certificationsByRelease || null;
  const _pfFandomSegs: any[] | null = _pf?.fandomSegmentsByPlayer?.get(player.id) || null;
  const _pfFanProfile: any | null = _pf?.fanProfilesByPlayer?.get(player.id) ?? null;
  const _pfAlgoBoostsByRelease: Map<string, any[]> | null = _pf?.algoBoostsByPlayer?.get(player.id) || null;
  let fanProfileData: any = _pfFanProfile;

  // Load active era for multipliers
  let eraMultipliers = { ...ERA_MULTIPLIER_DEFAULTS };
  let eraOutcome: 'triumph' | 'flop' | null = null;
  try {
    // Use prefetched era from runtimeContext (already loaded by executeTurnModules)
    const activeEra = ctx?.runtimeContext?.activeEra || (await entities.Era?.filter({ artist_id: player.id, is_active: true }) || [])[0];
    if (activeEra) {
      eraMultipliers.streaming = activeEra.current_multiplier_streaming || 1;
      eraMultipliers.virality = activeEra.current_multiplier_virality || 1;
      eraMultipliers.retention = activeEra.current_multiplier_retention || 1;
      eraMultipliers.hype_decay = activeEra.current_multiplier_hype_decay || 1;
      // Derive era outcome signal for the release outcome evaluator
      if (activeEra.is_flop) eraOutcome = 'flop';
      else if (Number(activeEra.momentum) > 50) eraOutcome = 'triumph';
    }
  } catch (e: any) {
    console.error(`[Core] Era multiplier load failed for ${player.id}:`, e);
  }

  // 0a. CAREER TREND MODIFIERS — derived from runtimeTrendEffects (ctx.careerTrendEffects)
  // populated by turnScheduler pre-turn via applyCareerTrendEffects() — camelCase keys
  const runtimeTrendEffects = ctx?.careerTrendEffects || {};

  // 0a.3. ALGORITHM MOOD — global industry vibe set by algorithmMoodModule each turn
  const algorithmMood: string = ctx?.algorithmMood || 'mainstream';
  // Map of release_id → trend status ('rising'|'peak') for releases linked to active trends
  const activeTrendsByRelease: Record<string, string> = ctx?.activeTrendsByRelease || {};
  // Whether this player has a non-resolved controversy case (drives messy mood bonus)
  const hasActiveControversy: boolean = ctx?.hasActiveControversy === true;

  // 0a.2. PHASE 6 EFFECTS — all values passed from turnScheduler runtimeContext.phase6
  const superfansStreamBoost    = Number(ctx?.superfansStreamBoost)    || 0;
  const superfansMerchBoost     = Number(ctx?.superfansMerchBoost)     || 0;
  const superfansTourBoost      = Number(ctx?.superfansTourBoost)      || 0;
  const superfansRetentionBoost = Number(ctx?.superfansRetentionBoost) || 0;
  const p6ChurnMultiplier            = Number(ctx?.churnMultiplier)            || 1;
  const p6DiscoveryQualityMultiplier = Number(ctx?.discoveryQualityMultiplier) || 1;
  const p6NostalgiaChurnReduction    = Number(ctx?.nostalgiaChurnReduction)    || 0;
  const p6NostalgiaDiscoveryBoost    = Number(ctx?.nostalgiaDiscoveryBoost)    || 0;
  const p6PlatformSpikeModifier      = Number(ctx?.platformSpikeModifier)      || 0;
  const p6PlatformSustainPenalty     = Number(ctx?.platformSustainPenalty)     || 0;
  const p6BrandQualityModifier       = Number(ctx?.brandQualityModifier)       || 0;
  // Glamour & Community vector effects
  const p6GlamourSocialViralityBoost  = Number(ctx?.glamourSocialViralityBoost) || 0;
  const p6GlamourBrandDealBoost       = Number(ctx?.glamourBrandDealBoost)      || 0;
  const p6CommunityChurnReduction     = Number(ctx?.communityChurnReduction)    || 0;
  const p6CommunityOrganicGrowthBoost = Number(ctx?.communityOrganicGrowthBoost) || 0;
  // Fatigue soft state
  const p6FatigueSoftState = ctx?.fatigueSoftState || null;

  // Segment sentiment records for stream multiplier
  const segmentSentiments: Record<string, number> = {};
  const segmentCounts: Record<string, number> = {};
  if (_pfFandomSegs) {
    for (const seg of _pfFandomSegs) {
      segmentSentiments[seg.segment_type] = seg.sentiment ?? 50;
      segmentCounts[seg.segment_type] = seg.count ?? 0;
    }
    console.log(`[Core][SegSentiment] player=${player.id} loaded ${_pfFandomSegs.length} segments: ${JSON.stringify(segmentSentiments)}`);
  } else {
    console.log(`[Core][SegSentiment] player=${player.id} no fandom_segments prefetched`);
  }

  // Fandom labor pool (from previous tick's fandom_segments.labor_output)
  // Used to compute streaming boost and social promo boost
  const fandomLaborPool: Record<string, number> = ctx?.fandomLaborPool || {};
  const totalFanStreamingLabor = fandomLaborPool.streaming || 0;
  const totalFanPromoLabor = fandomLaborPool.promo || 0;
  const playerFans = Number(player.fans ?? player.followers) || 1;
  // Streaming boost: labor / fans * 0.15, capped at +15%
  const fandomStreamBoostMult = Math.min(1.15, 1.0 + (totalFanStreamingLabor / playerFans) * 0.15);
  // Promo boost for social discovery (capped at +10%)
  const fandomPromoBoostMult = Math.min(1.10, 1.0 + (totalFanPromoLabor / playerFans) * 0.10);

  // revenue_penalty: derive from worst-case revenue adj across merch/discovery (negative trends < 1.0)
  // Use merchConversionAdj as the broadest revenue signal: FLOP=0.88→-12%, SLUMP=0.92→-8%, DORMANT=base
  const _rteMerchAdj   = Number(runtimeTrendEffects?.merchConversionAdj)          || 1.0;
  const _rteDiscAdj    = Number(runtimeTrendEffects?.discoveryConversionMultAdj)   || 1.0;
  // revenue penalty = average of the two worst-case adjs minus 1 (negative when < 1.0)
  const trendRevenuePenalty = Math.min(0, ((_rteMerchAdj + _rteDiscAdj) / 2) - 1);

  // marketing_efficiency_bonus: brandDealChanceAdj captures VIRAL(+8%) / COMEBACK(+10%)
  const _rteBrandAdj   = Number(runtimeTrendEffects?.brandDealChanceAdj)           || 1.0;
  const trendMarketingBonus = Math.max(0, _rteBrandAdj - 1);

  // retention_bonus: retentionMultAdj (LEGACY +6%, GOAT +8%)
  const _rteRetAdj     = Number(runtimeTrendEffects?.retentionMultAdj)             || 1.0;
  const trendRetentionBonus = Math.max(0, _rteRetAdj - 1);

  // follower growth mult: followerConversionAdj (ONE_HIT_WONDER/DORMANT suppress it)
  const trendFollowerGrowthMult = Number(runtimeTrendEffects?.followerConversionAdj) || 1.0;

  // hype decay boost: decayRateAddend (positive = faster decay; ONE_HIT_WONDER +0.001, FLOP +0.002)
  // Scale to legacy hype boost units (addend * 200 maps 0.001→0.2, 0.002→0.4)
  const trendHypeDecayBoost = Math.max(0, Number(runtimeTrendEffects?.decayRateAddend) || 0) * 200;

  // 0b. EPHEMERAL BUZZ — hype-driven temporary clout from recent activity + news
  let buzzClout = 0;
  try {
    const recentNews = _pfNews?.slice(0, 10) || await entities.NewsItem?.filter({ artist_id: player.id }, '-created_at', 10) || [];
    const newsWindow = 7; // only count news from last 7 turns
    for (const item of recentNews) {
      const turnAge = globalTurnId - (N(item.posted_turn) || globalTurnId);
      if (turnAge <= newsWindow) {
        const impact = N(item.impact_score);
        const decayFactor = 1 - (turnAge / (newsWindow + 1)); // linear decay
        buzzClout += Math.floor(impact * decayFactor);
      }
    }
    // Hype contribution: high hype = temporary clout surge
    buzzClout += Math.floor(N(player.hype) * 0.3);
    buzzClout = Math.min(buzzClout, 200); // cap ephemeral buzz at 200
  } catch (e: any) {
    console.error(`[Core] Buzz clout calc failed for ${player.id}:`, e?.message);
    buzzClout = Math.floor(N(player.hype) * 0.3); // fallback: hype only
  }
  const effectiveClout = N(player.clout) + buzzClout;

  const summary: any = {
    energy_restored: 0,
    inspiration_gained: 0,
    income_gained: 0,
    streams_earned: 0,
    fan_growth: 0,
    follower_growth: 0,
    hype_change: 0,
    clout_gain: 0,
    merch_revenue: 0,
    releases_activated: 0,
    platform_streams: {
      Streamify: 0,
      Soundburst: 0,
      AppleCore: 0
    },
    platform_revenue: {
      Streamify: 0,
      Soundburst: 0,
      AppleCore: 0
    },
    merch_units_sold: 0,
    merch_stream_boost: 0,
    merch_hype_boost: 0,
    touring_revenue: 0,
    gigs_completed: 0,
    social_revenue: 0,
    brand_deal_revenue: 0,
    fan_sub_revenue: 0,
    sync_licensing_revenue: 0,
    collab_revenue: 0,
    social_fan_growth: 0,
    social_follower_growth: 0,
    releases_aged: 0,
    release_outcome_events: [] as Array<{ release_id: string; release_name: string; outcome: string; lifetime_streams: number }>,
    revival_events: [] as Array<{ release_id: string; release_name: string; reason: string; revival_number: number }>,
    expenses: 0,
    net_income_applied: 0,
    // Phase 6 Glamour & Community & Fatigue for downstream modules
    p6_glamour_social_virality_boost: p6GlamourSocialViralityBoost,
    p6_glamour_brand_deal_boost: p6GlamourBrandDealBoost,
    p6_community_churn_reduction: p6CommunityChurnReduction,
    p6_community_organic_growth_boost: p6CommunityOrganicGrowthBoost,
    p6_fatigue_soft_state: p6FatigueSoftState,
  };
  const telemetryEvents: any[] = [];

  // 1. REFRESH RESOURCES (partial restore - makes energy management meaningful)
  const maxEnergy = N(player.max_energy) || 100;
  const currentEnergy = N(player.energy);
  const energyRestore = Math.floor(maxEnergy * 0.75);
  summary.energy_restored = Math.min(maxEnergy - currentEnergy, energyRestore);
  const currentInspiration = N(player.inspiration);
  summary.inspiration_gained = Math.min(100 - currentInspiration, 80);

  // 2. FIND SCHEDULED RELEASES (collect for delta, no write)
  let releaseUpdates = [];
  let songsUpdates: { id: string; patch: Record<string, any> }[] = [];
  try {
    // Use lte so overdue scheduled releases (turn skipped / stale currentTurnId at creation) still activate
    // Case-insensitive check: some seed data wrote lowercase 'scheduled' (I-02 fix)
    const scheduledReleases = _pfReleases
      ? _pfReleases.filter((r: any) => String(r.lifecycle_state).toLowerCase() === 'scheduled' && N(r.scheduled_turn) <= globalTurnId)
      : (await supabaseAdmin
          .from('releases')
          .select('*')
          .eq('artist_id', player.id)
          .ilike('lifecycle_state', 'scheduled')
          .lte('scheduled_turn', globalTurnId)).data || [];
    
    // Guard: skip orphan singles (zero linked songs) to prevent engine processing broken releases
    // The prevent_empty_released_single() DB trigger would abort updates to these anyway
    const validScheduledReleases = scheduledReleases.filter((r: any) => {
      if (!r.project_type || r.project_type.toLowerCase() !== 'single') return true;
      // Singles must have at least one song linked, otherwise the release is orphaned
      const linkedSongs = (_pfSongs || []).filter((s: any) => s.release_id === r.id || s.single_release_id === r.id);
      if (linkedSongs.length === 0) {
        console.warn(`[Core][OrphanGuard] Skipping orphan single release ${r.id} (${r.name || r.title}) — zero linked songs`);
        return false;
      }
      return true;
    });
    
    const activeEraId = player.active_era_id || null;
    const activeTrends = ctx?.activeTrends || [];
    
    releaseUpdates = validScheduledReleases.map((r: any) => {
      // Auto-assign linked_trend_id based on release attributes vs active trends
      const linkedTrendId = inferTrendForRelease(
        {
          genre: r.genre || player.genre || null,
          isDissTrack: r.is_diss_track === true,
          experimentalFactor: Number(r.experimental_factor) || 0,
          playerGenre: player.genre || null,
        },
        activeTrends,
        ctx?.algorithmMood || 'mainstream'
      );

      return {
        id: r.id,
        patch: {
          lifecycle_state: 'Hot', 
          release_status: 'released', 
          lifecycle_state_changed_turn: globalTurnId,
          followers_at_release: N(player.fans ?? player.followers) || null,
          hot_phase_streams: 0,
          ...(linkedTrendId && { linked_trend_id: linkedTrendId }),
          ...(activeEraId && !r.era_id ? { era_id: activeEraId } : {})
        }
      };
    });
    summary.releases_activated = validScheduledReleases.length;
    // Store release name/type for news module release_drop articles
    if (validScheduledReleases.length > 0) {
      const firstRelease = validScheduledReleases[0];
      summary.latest_release_name = firstRelease.name || firstRelease.title || null;
      summary.latest_release_type = firstRelease.project_type || firstRelease.kind || 'Single';
      // Emit average quality for fandom engine (fandomSegmentsModule reads this)
      const qualSum = validScheduledReleases.reduce((s: number, r: any) => s + Number(r.quality_score ?? r.quality ?? 0), 0);
      summary.release_quality_score = Math.round(qualSum / validScheduledReleases.length);
    }

    // Collect project status updates as deltas (no writes during staging)
    for (const release of validScheduledReleases) {
      if (release.project_id) {
        releaseUpdates.push({
          id: release.project_id,
          patch: { project_status: 'released' },
          _entity: 'Project'
        });
      }
    }

    // Also count immediate releases (created as Hot directly on this turn)
    // These bypass the Scheduled→Hot transition but should still count for era tracking
    if (summary.releases_activated === 0) {
      const immediateReleases = _pfReleases
        ? _pfReleases.filter((r: any) => N(r.scheduled_turn) === globalTurnId && r.lifecycle_state === 'Hot')
        : await entities.Release.filter({
            artist_id: player.id,
            scheduled_turn: globalTurnId,
            lifecycle_state: 'Hot'
          });
      summary.releases_activated += immediateReleases.length;
    }
  } catch (e: any) {
    console.error(`[Core] Release query failed for ${player.id}:`, e.message);
  }

  // 2. RUNAWAY SONG DETECTION — Check for breakout hits before processing streams
  const ACTIVE_LIFECYCLE_STATES = ['Hot', 'Trending', 'Momentum', 'Stable', 'Declining'];
  const runawayReleases = _pfReleases
    ? _pfReleases.filter((r: any) => ACTIVE_LIFECYCLE_STATES.includes(r.lifecycle_state))
    : await entities.Release.filter({
        artist_id: player.id,
        lifecycle_state: ACTIVE_LIFECYCLE_STATES
      });
  const runawayResults = await processRunawaySongMechanic(player, runawayReleases, eraMultipliers, globalTurnId, entities);

  // 3. STREAMING REVENUE (60% boost in base calculation) with canonical attribution
  let streamingRevenue = 0;
  try {
    // Reuse the same lifecycle filter as runawayReleases (identical query)
    const activeReleases = runawayReleases;
    
    // Get all songs for attribution logic
    const allSongs = _pfSongs || await entities.Song.filter({ artist_id: player.id });
    
    if (activeReleases.length > 0) {
      const followerBase = N((player.fans ?? player.followers));
      const hypeBase = N(player.hype) || 30;
      
      let totalStreams = 0;
      
      // Track canonical attribution to prevent double-counting
      const canonicalAttribution = new Map<string, { streams: number; revenue: number }>();
      
      const nonHitStreamMult = Number(runtimeTrendEffects?.nonHitStreamMult) || 1.0;
      const hitReleaseId = runawayResults.hasRunaway ? runawayResults.runawayData?.releaseId : null;

      for (const release of activeReleases) {
        let streams = calculateReleaseStreams({
          followers: followerBase,
          hype: hypeBase,
          lifecycleState: release.lifecycle_state,
          randomUnit: rng.random(),
          eraStreamingMult: eraMultipliers.streaming,
          eraViralityMult: eraMultipliers.virality
        });
        
        // Apply runaway song multiplier if applicable
        if (runawayResults.hasRunaway) {
          const turnsSinceDetected = globalTurnId - (runawayResults.runawayData?.detectedTurn || globalTurnId);
          streams = applyRunawayStreamMultiplier(streams, runawayResults.runawayData, turnsSinceDetected);
        }

        // ONE_HIT_WONDER: suppress streams on non-hit releases (-50% by default)
        if (nonHitStreamMult < 1.0 && hitReleaseId && release.id !== hitReleaseId) {
          streams = Math.floor(streams * nonHitStreamMult);
        }

        // ALGORITHM MOOD BONUS: modulate streams based on global industry vibe
        const moodMult = computeMoodStreamBonus({
          releaseGenre:      release.genre || player.genre || null,
          playerGenre:       player.genre || null,
          isDissTrack:       release.is_diss_track === true,
          releaseAgeInTurns: Math.max(0, globalTurnId - N(release.scheduled_turn || 0)),
          lifecycleState:    release.lifecycle_state || 'Stable',
          hasActiveControversy,
          linkedTrendStatus: activeTrendsByRelease[release.id] ?? null,
          algorithmMood,
          experimentalFactor: Number(release.experimental_factor) || 0,
        });
        if (moodMult !== 1.0) {
          streams = Math.floor(streams * moodMult);
        }

        // SEGMENT SENTIMENT STREAM MULTIPLIER: fan sentiment affects streaming
        const sentimentMult = computeSegmentSentimentStreamMultiplier(segmentSentiments, segmentCounts);
        if (sentimentMult !== 1.0) {
          console.log(`[Core][SegSentiment] player=${player.id} release=${release.id} sentimentMult=${sentimentMult.toFixed(3)} streams ${streams}→${Math.floor(streams * sentimentMult)}`);
          streams = Math.floor(streams * sentimentMult);
        }

        // Fandom streaming labor boost (stans streaming your catalog)
        if (fandomStreamBoostMult > 1.0) {
          streams = Math.floor(streams * fandomStreamBoostMult);
        }

        const streamSplit = distributeStreamsByPlatform(streams, rng.random());
        const releaseAlgoBoosts: any[] = _pfAlgoBoostsByRelease?.get(release.id) || [];
        if (releaseAlgoBoosts.length > 0) {
          const split = streamSplit as Record<string, number>;
          for (const boost of releaseAlgoBoosts) {
            // DB uses "SoundBurst" while runtime split keys use "Soundburst".
            const platform = boost.platform === 'SoundBurst' ? 'Soundburst' : boost.platform;
            if (split[platform] === undefined) continue;

            const mult = Number(boost.stream_bonus_multiplier);
            if (!Number.isFinite(mult) || mult < 1.0) {
              console.warn(`[Core][AlgoBoost] SKIP invalid multiplier: player=${player.id} release=${release.id} boost=${boost.boost_type} mult=${boost.stream_bonus_multiplier}`);
              continue;
            }

            const before = split[platform];
            split[platform] = Math.round(before * mult);
            console.log(`[Core][AlgoBoost] player=${player.id} release=${release.id} platform=${platform} boost=${boost.boost_type} mult=${mult} streams ${before}->${split[platform]}`);
          }
        }

        let releaseRevenue = 0;
        Object.entries(streamSplit).forEach(([platform, value]) => {
          const rate = (PLATFORM_PAYOUT_RATES as Record<string, number>)[platform] || 0.004;
          summary.platform_streams[platform] = (summary.platform_streams[platform] || 0) + value;
          summary.platform_revenue[platform] = (summary.platform_revenue[platform] || 0) + value * rate;
          releaseRevenue += value * rate;
        });

        // GUARD: Skip releases with no songs to prevent ghost revenue
        // Also check single_release_id for songs released as standalone singles from albums
        const releaseSongs = allSongs.filter((song: any) => song.release_id === release.id || song.single_release_id === release.id);
        if (releaseSongs.length === 0) {
          console.log(`[Core] Skipping release ${release.id} (${release.project_type}) - no songs found`);
          continue; // Skip to next release
        }
        
        // CANONICAL ATTRIBUTION: Prevent double-counting across remixes/deluxes/singles
        let attributedStreams = 0;
        let attributedRevenue = 0;

        // Quality-weighted stream distribution: higher quality songs get more streams
        // Lead track (index 0 in tracklist) gets a position bonus
        const tracklistOrder = Array.isArray(release.tracklist) ? release.tracklist : [];
        const LEAD_TRACK_BONUS = 1.2; // 20% bonus for lead/first track

        // Compute quality weights for each song
        const songWeights: { song: any; weight: number }[] = releaseSongs.map((s: any) => {
          const quality = Number(s.quality) || 50;
          // Base weight from quality (range ~0.5 to ~1.5 for quality 25-100)
          let weight = quality / 66.7; // quality 50 → ~0.75, quality 100 → ~1.5
          // Lead track position bonus
          const trackIdx = tracklistOrder.indexOf(s.id);
          if (trackIdx === 0) weight *= LEAD_TRACK_BONUS;
          return { song: s, weight: Math.max(0.1, weight) };
        });

        const totalWeight = songWeights.reduce((sum, sw) => sum + sw.weight, 0);

        for (const { song, weight } of songWeights) {
          const share = totalWeight > 0 ? weight / totalWeight : 1 / releaseSongs.length;
          const streamsPerTrack = Math.floor(streams * share);
          const revenuePerTrack = releaseRevenue * share;

          // When a song is on this release via single_release_id (not release_id),
          // pass it with release_id pointing to the single so attribution routes correctly.
          // Without this, album singles get canonicalReleaseId=album_id which never matches
          // the single release, causing 0 streams on all standalone singles from albums.
          const isViaSingleRef = song.single_release_id === release.id && song.release_id !== release.id;
          const songCtx = isViaSingleRef ? { ...song, release_id: release.id } : song;
          const attribution = getCanonicalAttribution(songCtx, activeReleases, streamsPerTrack, revenuePerTrack);

          // Only count if this release is the canonical attribution target
          if (attribution.canonicalReleaseId === release.id) {
            attributedStreams += attribution.streams;
            attributedRevenue += attribution.revenue;

            // Per-track metrics: accumulate song-level stream deltas
            // Distribute platform streams proportionally by this song's share
            const songPlatformDeltas: Record<string, number> = {};
            for (const [platform, platformTotal] of Object.entries(streamSplit)) {
              songPlatformDeltas[platform] = Math.floor(Number(platformTotal) * share);
            }

            songsUpdates.push({
              id: song.id,
              patch: {
                lifetime_streams: N(song.lifetime_streams) + attribution.streams,
                turn_streams_delta: attribution.streams,
                platform_streams: Object.fromEntries(
                  Object.entries(songPlatformDeltas).map(([p, delta]) => [
                    p,
                    N(song.platform_streams?.[p]) + delta
                  ])
                ),
              }
            });
          }
        }
        
        totalStreams += attributedStreams;
        streamingRevenue += attributedRevenue;

        const releasePatch: any = {
          lifetime_streams: N(release.lifetime_streams) + attributedStreams,
          lifetime_revenue: N(release.lifetime_revenue) + attributedRevenue,
          platform_streams: {
            ...(release.platform_streams || {}),
            Streamify: N(release.platform_streams?.Streamify) + streamSplit.Streamify,
            Soundburst: N(release.platform_streams?.Soundburst) + streamSplit.Soundburst,
            AppleCore: N(release.platform_streams?.AppleCore) + streamSplit.AppleCore
          },
          // Charts v2: per-turn stream delta markers (underscore prefix = not persisted to DB)
          _streams_this_turn: attributedStreams,
          _region_streams: player.region ? { [player.region]: attributedStreams } : {},
        };

        // Track Hot-phase streams for Sleeper Hit detection in the outcome evaluator
        if (release.lifecycle_state === 'Hot') {
          releasePatch.hot_phase_streams = N(release.hot_phase_streams) + attributedStreams;
        }

        // Track Stable-phase streams for SleeperHit/StrongStart detection in the outcome evaluator
        if (release.lifecycle_state === 'Stable') {
          releasePatch.stable_phase_streams = N(release.stable_phase_streams ?? 0) + attributedStreams;
        }

        // LIFECYCLE GATE: Track peak streams (max of current peak vs this turn's streams)
        releasePatch.streams_peak_lifetime = Math.max(
          N(release.streams_peak_lifetime ?? 0),
          attributedStreams
        );

        // LIFECYCLE AGING: progress releases through lifecycle states with invariant enforcement
        const turnsSinceChange = globalTurnId - (release.lifecycle_state_changed_turn || release.scheduled_turn || 0);
        let nextState = getNextLifecycleState(release.lifecycle_state, turnsSinceChange);

        // ── PERFORMANCE-GATED TRANSITIONS ──────────────────────────────────────
        // Gate 1: Stable → Declining — blocked if streams ≥ 50% of stable-entry baseline
        if (nextState === 'Declining' && release.lifecycle_state === 'Stable') {
          const stableBaseline = N(release.streams_at_stable_entry);
          if (stableBaseline > 0 && attributedStreams >= stableBaseline * 0.50) {
            console.log(`[Core][StableGate] BLOCKED Stable→Declining for release ${release.id}: streams=${attributedStreams} baseline=${stableBaseline} threshold=${Math.floor(stableBaseline * 0.50)} (${((attributedStreams / stableBaseline) * 100).toFixed(1)}% of baseline)`);
            nextState = null; // Block transition — release stays in Stable
          } else if (stableBaseline > 0) {
            console.log(`[Core][StableGate] ALLOWED Stable→Declining for release ${release.id}: streams=${attributedStreams} baseline=${stableBaseline} threshold=${Math.floor(stableBaseline * 0.50)} (${((attributedStreams / stableBaseline) * 100).toFixed(1)}% of baseline)`);
          }
        }

        // Gate 2: Declining → Terminal — revival check
        // If streams spike to ≥ 30% of lifetime peak AND revival budget remains AND cooldown met,
        // revive back to Stable instead of transitioning to terminal.
        // NOTE: Beef winner revival (beefTickModule.ts) is a separate legacy mechanism that
        // hard-resets to Hot without counting against revival_count. It is intentionally
        // left as a documented exception — see v2 spec Section B3.
        if (nextState === 'Archived' && release.lifecycle_state === 'Declining') {
          // F4 fix: Use effective peak (max of stored and current turn) to handle same-turn spikes
          const peakStreams = Math.max(N(release.streams_peak_lifetime ?? 0), attributedStreams);
          const revivalCount = N(release.revival_count ?? 0);
          const lastRevivedTurn = release.last_revived_turn != null ? N(release.last_revived_turn) : null;
          const cooldownMet = lastRevivedTurn == null || (globalTurnId - lastRevivedTurn) >= 168;

          const revivalPctOfPeak = peakStreams > 0 ? ((attributedStreams / peakStreams) * 100).toFixed(1) : '0.0';
          const cooldownTurns = lastRevivedTurn != null ? globalTurnId - lastRevivedTurn : null;

          if (peakStreams > 0
              && attributedStreams >= peakStreams * 0.30
              && revivalCount < 2
              && cooldownMet) {
            // REVIVAL: cancel terminal transition, return to Stable
            nextState = null; // prevent terminal evaluation below

            // Determine revival reason based on current context
            const trendStatus = activeTrendsByRelease[release.id];
            let revivalReason = 'stream_spike';
            if (trendStatus === 'peak') revivalReason = 'trend_peak';
            else if (trendStatus === 'rising') revivalReason = 'trend_rising';
            else if (algorithmMood === 'nostalgic') revivalReason = 'mood_nostalgia';
            else if (algorithmMood === 'underground') revivalReason = 'mood_underground';
            else if (algorithmMood === 'tour_season') revivalReason = 'mood_tour_season';

            console.log(`[Core][Revival] TRIGGERED for release ${release.id}: reason=${revivalReason} streams=${attributedStreams} peak=${peakStreams} (${revivalPctOfPeak}% of peak) revival#=${revivalCount + 1}/2 cooldownTurns=${cooldownTurns ?? 'never'}`);

            releasePatch.lifecycle_state = 'Stable';
            releasePatch.lifecycle_state_changed_turn = globalTurnId;
            releasePatch.revival_count = revivalCount + 1;
            releasePatch.last_revived_turn = globalTurnId;
            releasePatch.revival_trigger_reason = revivalReason;
            releasePatch.streams_at_stable_entry = attributedStreams; // new baseline

            summary.revival_events.push({
              release_id: release.id,
              release_name: (release as any).name || (release as any).title || 'Release',
              reason: revivalReason,
              revival_number: revivalCount + 1,
            });

            summary.releases_aged++; // count as a lifecycle event
          } else {
            // Log why revival was rejected for debugging
            const rejectReasons = [];
            if (peakStreams <= 0) rejectReasons.push('no_peak_streams');
            if (attributedStreams < peakStreams * 0.30) rejectReasons.push(`below_threshold(${revivalPctOfPeak}%<30%)`);
            if (revivalCount >= 2) rejectReasons.push(`max_revivals(${revivalCount}/2)`);
            if (!cooldownMet) rejectReasons.push(`cooldown_not_met(${cooldownTurns}/${168})`);
            console.log(`[Core][Revival] REJECTED for release ${release.id}: ${rejectReasons.join(', ')} streams=${attributedStreams} peak=${peakStreams}`);
          }
        }

        // --- DYNAMIC PERFORMANCE_CLASS UPDATE (projection mode) ---
        // For every active release, evaluate the current performance projection
        // This runs each turn so the player sees their song trending toward an outcome
        if (!isTerminalState(release.lifecycle_state)) {
          try {
            const outcomeResult = evaluateReleaseOutcome({
              release,
              songs: releaseSongs.map((s: any) => ({
                quality: Number(s.quality) || 50,
                setlist_count: Number(s.setlist_count) || 0,
              })),
              fanSentiment: fanProfileData ? Number(fanProfileData.sentiment) || 0.5 : 0.5,
              certifications: [],  // Certs skipped in projection mode for performance; evaluator uses engagement/stream signals instead
              eraOutcome,
              runawayData: runawayResults.hasRunaway ? runawayResults.runawayData : null,
              followerCountAtRelease: Math.max(1, N(release.followers_at_release ?? player.fans ?? player.followers)),
              averageStreamsPerTurnDuringStable: Math.floor(N(release.stable_phase_streams ?? 0) / (LIFECYCLE_DURATIONS.Stable || 168)),
              hotPhaseStreams: N(release.hot_phase_streams ?? 0),
              currentLifecyclePhase: release.lifecycle_state || 'Hot',
              mode: 'projection',
              // Engagement & algorithm signals for richer classification
              engagementRate: Number(fanProfileData?.engagement_rate) || 0,
              socialGrowthRate: Number(fanProfileData?.listener_growth_trend) || 0,
              algorithmMood: algorithmMood,
              linkedTrendStatus: activeTrendsByRelease[release.id] ?? null,
            });
            releasePatch.performance_class = outcomeResult.performanceClass;
            releasePatch.performance_class_confidence = outcomeResult.confidence;
          } catch (evalErr: any) {
            console.warn(`[Core] performance_class projection failed for release ${release.id}:`, evalErr?.message);
          }
        }

        if (nextState) {
          // --- TERMINAL TRANSITION: evaluate final outcome ---
          // When Declining → Archived, run evaluator in 'final' mode to determine the real outcome
          let effectiveNextState = nextState;
          if (nextState === 'Archived' && release.lifecycle_state === 'Declining') {
            try {
              // Load certifications for this release (bulk-prefetched or fallback)
              const certRows = _pfCerts?.get(release.id)
                || (await supabaseAdmin
                    .from('certifications')
                    .select('certification_level')
                    .eq('release_id', release.id)).data
                || [];
              const certifications = certRows.map((c: any) => ({
                certification_type: c.certification_level,
              }));

              // Load all artist releases to compute totalArtistSingles and hasOtherHits
              const allArtistReleases = _pfReleases
                || (await supabaseAdmin
                    .from('releases')
                    .select('id, lifecycle_state, performance_class, project_type')
                    .eq('artist_id', player.id)).data
                || [];
              const totalArtistSingles = allArtistReleases.filter((r: any) => r.project_type === 'Single').length;
              // A release "has other hits" if any OTHER terminal release is not Archived/Flop/DeepCut
              const hasOtherHits = allArtistReleases.some(
                (r: any) => r.id !== release.id && (POSITIVE_OUTCOMES.has(r.lifecycle_state) || POSITIVE_OUTCOMES.has(r.performance_class))
              );

              const finalResult = evaluateReleaseOutcome({
                release,
                songs: releaseSongs.map((s: any) => ({
                  quality: Number(s.quality) || 50,
                  setlist_count: Number(s.setlist_count) || 0,
                })),
                fanSentiment: fanProfileData ? Number(fanProfileData.sentiment) || 0.5 : 0.5,
                certifications,
                eraOutcome,
                runawayData: runawayResults.hasRunaway ? runawayResults.runawayData : null,
                followerCountAtRelease: Math.max(1, N(release.followers_at_release ?? player.fans ?? player.followers)),
                averageStreamsPerTurnDuringStable: Math.floor(N(release.stable_phase_streams ?? 0) / (LIFECYCLE_DURATIONS.Stable || 168)),
                hotPhaseStreams: N(release.hot_phase_streams ?? 0),
                currentLifecyclePhase: 'Declining',
                mode: 'final',
                // Engagement & algorithm signals for richer classification
                engagementRate: Number(fanProfileData?.engagement_rate) || 0,
                socialGrowthRate: Number(fanProfileData?.listener_growth_trend) || 0,
                algorithmMood: algorithmMood,
                linkedTrendStatus: activeTrendsByRelease[release.id] ?? null,
                totalArtistSingles,
                hasOtherHits,
              });
              effectiveNextState = finalResult.performanceClass;
              // Lock performance_class and confidence at terminal (legacy dual-write)
              releasePatch.performance_class = finalResult.performanceClass;
              releasePatch.performance_class_confidence = 1.0;
              releasePatch.outcome_evaluated_turn = globalTurnId;

              // Plan 016 §7.3 — Dual-write: populate final_outcome_class alongside legacy fields.
              // Immutability guard: only set if not already populated (release.final_outcome_class == null).
              // The commit pipeline does NOT enforce immutability — this guard does.
              if ((release as any).final_outcome_class == null) {
                releasePatch.final_outcome_class = finalResult.performanceClass;
                releasePatch.final_outcome_source = 'engine_final';
                releasePatch.classification_model_version = 'v1.0';
              }

              // Emit outcome event so notificationsGenerator can fire RELEASE_OUTCOME alerts
              summary.release_outcome_events.push({
                release_id: release.id,
                release_name: (release as any).name || (release as any).title || 'Release',
                outcome: finalResult.performanceClass,
                lifetime_streams: N(release.lifetime_streams),
              });
            } catch (evalErr: any) {
              console.warn(`[Core] Terminal outcome evaluation failed for release ${release.id}:`, evalErr?.message);
              // Fall back to default 'Archived'
              effectiveNextState = 'Archived';
              telemetryEvents.push(
                buildReleasePipelineTelemetryEvent({
                  eventType: 'release_pipeline_terminal_fallback',
                  module: 'turnProcessorCore',
                  globalTurnId,
                  playerId: player.id,
                  reasonCode: 'terminal_evaluator_fallback',
                  traceId: `${globalTurnId}:terminal_fallback:${release.id}`,
                  description: `Terminal evaluator fallback for release ${release.id}`,
                  metadata: {
                    release_id: release.id,
                    prior_lifecycle_state: release.lifecycle_state || null,
                    fallback_next_state: 'Archived',
                    error_message: evalErr?.message ? String(evalErr.message) : String(evalErr),
                  },
                }),
              );
            }
          }

          // Apply invariant enforcement to ensure consistency
          const invariants = enforceReleaseInvariants(release, effectiveNextState);

          // Apply invariant patches
          Object.assign(releasePatch, invariants.releasePatch);

          // LIFECYCLE GATE: Record streams baseline when entering Stable for the first time or via normal progression
          if (effectiveNextState === 'Stable' && release.lifecycle_state !== 'Stable') {
            releasePatch.streams_at_stable_entry = attributedStreams;
            console.log(`[Core][StableEntry] release ${release.id}: baseline=${attributedStreams} from=${release.lifecycle_state}→Stable`);
          }

          // Always stamp lifecycle_state_changed_turn with the game turn number.
          // enforceReleaseInvariants intentionally does NOT set this field to avoid
          // Date.now() (ms since epoch) poisoning the turn-delta math.
          releasePatch.lifecycle_state_changed_turn = globalTurnId;

          // Note: project updates will be handled in a separate batch after we collect all project IDs
          // to avoid async issues in the map

          summary.releases_aged++;
        }

        // PLAYLIST PLACEMENT: assign organic playlist placements based on lifecycle + genre
        const effectiveState = nextState || release.lifecycle_state;
        const genre = release.genre || player.genre || '';
        const placements = [];
        if (effectiveState === 'Hot') {
          placements.push({ platform: 'Streamify', type: 'editorial', name: `${genre} Essentials`, boost: 2.0 });
          placements.push({ platform: 'AppleCore', type: 'editorial', name: `${genre} Today`, boost: 2.0 });
          placements.push({ platform: 'SoundBurst', type: 'underground', name: `${genre} Underground`, boost: 1.8 });
        } else if (effectiveState === 'Trending') {
          placements.push({ platform: 'Streamify', type: 'algorithmic', name: `${genre} Radar`, boost: 1.4 });
          placements.push({ platform: 'AppleCore', type: 'curated', name: `${genre} Sessions`, boost: 1.3 });
        } else if (effectiveState === 'Momentum') {
          placements.push({ platform: 'Streamify', type: 'algorithmic', name: `${genre} Finds`, boost: 1.1 });
        }
        if (placements.length > 0) {
          releasePatch.playlist_placements = placements;
          releasePatch.algorithmic_boost = placements.reduce((max, p) => Math.max(max, p.boost), 1.0);
        }

        releaseUpdates.push({ id: release.id, patch: releasePatch });
      }
      
      // PROJECT INVARIANT UPDATES: Handle project status changes from lifecycle aging
      // Collect all project IDs that need invariant checks
      const projectIdsNeedingUpdate = new Set();
      for (const update of releaseUpdates) {
        if (update.patch.lifecycle_state && update.id) {
          // This release had a lifecycle state change, check if project needs update
          const originalRelease = activeReleases.find(r => r.id === update.id);
          if (originalRelease?.project_id) {
            projectIdsNeedingUpdate.add(originalRelease.project_id);
          }
        }
      }
      
      // Process project invariant updates
      if (projectIdsNeedingUpdate.size > 0) {
        const projectIdSet = Array.from(projectIdsNeedingUpdate);
        const projectsNeedingUpdate = _pfProjects
          ? _pfProjects.filter((p: any) => projectIdSet.includes(p.id))
          : await entities.Project?.filter({
              id: projectIdSet
            }) || [];
        
        for (const project of projectsNeedingUpdate) {
          const relatedReleases = activeReleases.filter(r => r.project_id === project.id);
          const hasProgressedRelease = relatedReleases.some(r => 
            [
              'hot', 'trending', 'momentum', 'stable', 'declining',
              'archived', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
              'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder',
            ].includes((r.lifecycle_state || '').toLowerCase())
          );
          
          if (hasProgressedRelease && (project.project_status || '').toLowerCase() === 'scheduled') {
            releaseUpdates.push({
              id: project.id,
              patch: { project_status: 'released' },
              _entity: 'Project'
            });
          }
        }
      }
      
      // BIDIRECTIONAL ALBUM ↔ SINGLE BOOST
      // Standalone singles boost their parent album; albums provide a stream floor for their singles
      const singleBoostToAlbum = 0.12; // 12% of single's streams boost parent album
      const albumFloorForSingle = 0.05; // single gets at least 5% of album's per-turn streams

      for (const update of releaseUpdates) {
        if (update._entity === 'Project') continue;
        const rel = activeReleases.find((r: any) => r.id === update.id);
        if (!rel) continue;

        // If this is a standalone single, boost parent album
        if (rel.project_type === 'Single') {
          const singleSongs = allSongs.filter((s: any) => s.single_release_id === rel.id);
          for (const ss of singleSongs) {
            // Find parent album (the song's original release_id)
            if (ss.release_id && ss.release_id !== rel.id) {
              const albumUpdate = releaseUpdates.find((u: any) => u.id === ss.release_id && !u._entity);
              if (albumUpdate) {
                const singleTurnStreams = update.patch._streams_this_turn || 0;
                const albumBoost = Math.floor(singleTurnStreams * singleBoostToAlbum);
                if (albumBoost > 0) {
                  albumUpdate.patch.lifetime_streams = (albumUpdate.patch.lifetime_streams || 0) + albumBoost;
                }
              }
            }
          }
        }

        // If this is an album/EP, provide stream floor for its standalone singles
        if (['Album', 'EP', 'Deluxe'].includes(rel.project_type)) {
          const albumTurnStreams = update.patch._streams_this_turn || 0;
          const floorStreams = Math.floor(albumTurnStreams * albumFloorForSingle);
          if (floorStreams > 0) {
            const albumSingles = activeReleases.filter((r: any) =>
              r.project_type === 'Single' && allSongs.some((s: any) =>
                s.single_release_id === r.id && s.release_id === rel.id
              )
            );
            for (const single of albumSingles) {
              const singleUpdate = releaseUpdates.find((u: any) => u.id === single.id && !u._entity);
              if (singleUpdate) {
                const currentTurnStreams = singleUpdate.patch._streams_this_turn || 0;
                if (currentTurnStreams < floorStreams) {
                  const boost = floorStreams - currentTurnStreams;
                  singleUpdate.patch.lifetime_streams = (singleUpdate.patch.lifetime_streams || 0) + boost;
                  totalStreams += boost;
                }
              }
            }
          }
        }
      }

      // Apply superfans stream boost on top of base streaming revenue
      if (superfansStreamBoost > 0) {
        streamingRevenue *= (1 + superfansStreamBoost);
      }
      // Phase 6: platform spike modifier — high heat boosts stream visibility
      if (p6PlatformSpikeModifier > 0) {
        streamingRevenue *= (1 + p6PlatformSpikeModifier);
      }
      // Phase 6: platform sustain penalty — high fatigue suppresses streams
      if (p6PlatformSustainPenalty > 0) {
        streamingRevenue *= Math.max(0.85, 1 - p6PlatformSustainPenalty);
      }
      summary.streams_earned = totalStreams;
      summary.streaming_revenue = Math.floor(streamingRevenue);
      summary.income_gained = Math.floor(streamingRevenue);
    }
  } catch (e: any) {
    console.error(`[Core] Streaming calculation failed for ${player.id}:`, e.message);
  }

  // 3b. FANDOM SEGMENTS — pre-fetched here so merch and fan sub sections both use the same data.
  // Falls back to all-zeros (fanSegmentMerchMult → 1.0) for new players with no segment rows yet.
  let _fanSegStans = 0;
  let _fanSegCore = 0;
  let _fanSegCasual = 0;
  let _fanSegTrendChaser = 0;
  try {
    const supabase = ctx?.supabaseAdmin || ctx?.supabaseClient;
    if (_pfFandomSegs) {
      for (const seg of _pfFandomSegs) {
        if (seg.segment_type === 'stan')   _fanSegStans  = Number(seg.count) || 0;
        if (seg.segment_type === 'core')   _fanSegCore   = Number(seg.count) || 0;
        if (seg.segment_type === 'casual') _fanSegCasual = Number(seg.count) || 0;
        if (seg.segment_type === 'trend_chaser') _fanSegTrendChaser = Number(seg.count) || 0;
      }
    } else if (supabase) {
      const { data: _segs } = await supabase
        .from('fandom_segments')
        .select('segment_type, count')
        .eq('player_id', player.id)
        .in('segment_type', DIRECTABLE_FANDOM_SEGMENT_TYPES.filter((segmentType) => segmentType !== 'og'));
      for (const seg of _segs || []) {
        if (seg.segment_type === 'stan')   _fanSegStans  = Number(seg.count) || 0;
        if (seg.segment_type === 'core')   _fanSegCore   = Number(seg.count) || 0;
        if (seg.segment_type === 'casual') _fanSegCasual = Number(seg.count) || 0;
        if (seg.segment_type === 'trend_chaser') _fanSegTrendChaser = Number(seg.count) || 0;
      }
    }
  } catch (_segPrefetchErr: any) {
    // Non-fatal — merch and fan sub will fall back to scalar boosts only
    console.warn(`[Core] fandom_segments prefetch failed for ${player.id}`);
  }
  const _fanSegTotal = Math.max(1, _fanSegStans + _fanSegCore + _fanSegCasual + _fanSegTrendChaser);
  const fanSegmentMerchMult = clamp(
    (_fanSegStans * 1.5 + _fanSegCore * 1.2 + _fanSegCasual * 1.0 + _fanSegTrendChaser * 0.8) / _fanSegTotal,
    0.85,
    1.35
  );

  // 4. MERCH SALES (FIXED & BOOSTED) + AUTO-RESTOCK + PRODUCTION + SCANDAL TRIGGERS
  let merchUpdates = [];
  let merchRevenue = 0;
  let merchRestockCost = 0;
  let scandalTriggered = false;
  let limitedSelloutHypeBoost = 0;
  let merchScandalHypePenalty = 0;
  let merchScandalCloutPenalty = 0;
  let merchScandalFollowerLoss = 0;
  let merchSkippedRestocks = 0;
  let merchSkippedRestockCost = 0;
  // Sourcing-driven essence nudges: positive for Ethical, negative for scandal
  let merchEssenceNudge: { authenticity: number; rebellion: number } = { authenticity: 0, rebellion: 0 };
  
  function queueMerchUpdate(id: string, patch: Record<string, unknown>) {
    const existing = merchUpdates.find((update: any) => update.id === id);
    if (existing) {
      existing.patch = { ...existing.patch, ...patch };
      return;
    }
    merchUpdates.push({ id, patch });
  }
  
  // VidWave merch shelf boost (Diamond Play Button perk)
  let vidwaveShelfBoost = 1.0;
  try {
    const vidwaveAccounts = _pfSocialAccounts
      ? _pfSocialAccounts.filter((a: any) => a.platform === 'vidwave')
      : await entities.SocialAccount.filter({ artist_id: player.id, platform: 'vidwave' });
    if (vidwaveAccounts?.[0]?.merch_shelf_enabled) {
      vidwaveShelfBoost = 1.2; // 20% boost
    }
  } catch (e: any) {
    console.warn('[Core] Failed to load VidWave shelf status:', e.message);
  }
  
  try {
    const allMerch = _pfMerch || await entities.Merch.filter({ artist_id: player.id });
    
    // Process production delays (Scheduled → Active after production time)
    for (const merch of allMerch) {
      if (merch.status === 'Scheduled' && merch.production_started_turn) {
        const productionTime = N(merch.production_time) || 3;
        const turnsElapsed = globalTurnId - N(merch.production_started_turn);
        
        if (turnsElapsed >= productionTime) {
          queueMerchUpdate(merch.id, {
            status: 'Active',
            production_complete_turn: globalTurnId
          });
        }
      }
    }
    
    const activeMerch = allMerch.filter(m => m.status === 'Active');
    
    for (const merch of activeMerch) {
      // Auto-restock logic
      if (merch.restock_mode === 'auto') {
        const stock = N(merch.stock);
        const targetOnHand = N(merch.target_on_hand);
        const restockBatch = N(merch.restock_batch) || 50;
        const restockInterval = N(merch.restock_interval_turns) || 1;
        const lastRestockTurn = N(merch.last_restock_turn) || 0;
        const maxTotalUnits = merch.max_total_units ? N(merch.max_total_units) : null;
        const totalManufactured = N(merch.units_manufactured);

        const queuedPatch = merchUpdates.find((update: any) => update.id === merch.id)?.patch || {};
        const effectiveStock = N((queuedPatch as any).stock ?? stock);
        const effectiveManufactured = N((queuedPatch as any).units_manufactured ?? totalManufactured);
        const effectiveLastRestockTurn = N((queuedPatch as any).last_restock_turn ?? lastRestockTurn);

        const shouldRestock = effectiveStock < targetOnHand && (globalTurnId - effectiveLastRestockTurn) >= restockInterval;
        const canRestock = !maxTotalUnits || (effectiveManufactured < maxTotalUnits);
        
        if (shouldRestock && canRestock) {
          const unitsToAdd = Math.min(restockBatch, targetOnHand - effectiveStock);
          const cappedUnits = maxTotalUnits ? Math.min(unitsToAdd, maxTotalUnits - effectiveManufactured) : unitsToAdd;
          
          if (cappedUnits > 0) {
            // Calculate restock cost
            const baseCost = getMerchBaseCost(merch.merch_type);
            const sourcingMult = getSourcingCostMult(merch.sourcing_tier);
            const restockCost = Math.ceil(baseCost * cappedUnits * sourcingMult);
            
            const availableCash = N(player.income);
            const canAffordRestock = availableCash >= restockCost;
            
            if (canAffordRestock) {
              merchRestockCost += restockCost;
              
              queueMerchUpdate(merch.id, {
                stock: effectiveStock + cappedUnits,
                units_manufactured: effectiveManufactured + cappedUnits,
                restock_count: N((queuedPatch as any).restock_count ?? merch.restock_count) + 1,
                last_restock_turn: globalTurnId
              });
            } else {
              merchSkippedRestocks += 1;
              merchSkippedRestockCost += restockCost;
            }
          }
        }
      }
      

      // Sourcing-driven identity nudges
      if (merch.sourcing_tier === 'Ethical') {
        merchEssenceNudge.authenticity += 1;
        merchEssenceNudge.rebellion += 0.5;
      }
      if (merch.sourcing_tier === 'Standard') {
        merchEssenceNudge.authenticity += 0.25;
      }

      // Controversy milestone check moved to after sales calculation (see below)

      // Lifecycle tracking: increment active_turns_count for active items
      const currentActiveTurns = N(merch.active_turns_count);
      const maxActiveTurns = merch.max_active_turns ? N(merch.max_active_turns) : null;
      // Expire items that have exceeded their lifecycle (Limited/Exclusive editions)
      if (maxActiveTurns && currentActiveTurns >= maxActiveTurns) {
        queueMerchUpdate(merch.id, { status: 'Expired' });
        continue; // Skip sales for expired items
      }
      
      // Sales calculation
      const queuedPatch = merchUpdates.find((update: any) => update.id === merch.id)?.patch || {};
      const effectiveUnitsManufactured = N((queuedPatch as any).units_manufactured ?? merch.units_manufactured);
      const effectiveUnitsSold = N((queuedPatch as any).units_sold ?? merch.units_sold);
      const effectiveStockBeforeSale = N((queuedPatch as any).stock ?? merch.stock);
      const effectiveRestockCount = N((queuedPatch as any).restock_count ?? merch.restock_count);
      const effectiveLastRestockTurn = N((queuedPatch as any).last_restock_turn ?? merch.last_restock_turn);
      const unitsRemaining = effectiveUnitsManufactured - effectiveUnitsSold;
      if (unitsRemaining <= 0) {
        const selloutPatch: any = { status: 'Sold Out' };
        if (!merch.sellout_achieved) {
          selloutPatch.sellout_achieved = true;
          // Limited/Exclusive sell-out hype boost — fast sell-outs generate buzz
          const isLimitedDrop = merch.edition === 'Limited' || merch.edition === 'Exclusive';
          if (isLimitedDrop) {
            const editionBoost = merch.edition === 'Exclusive' ? 6 : 4;
            limitedSelloutHypeBoost += editionBoost;
          }
        }
        queueMerchUpdate(merch.id, selloutPatch);
        continue;
      }
      
      const salesResult = computeMerchSales({
        followers: Math.floor(N((player.fans ?? player.followers)) * Math.max(0.85, Math.min(1.15, (Number(runtimeTrendEffects?.merchConversionAdj) || 1) + superfansMerchBoost)) * fanSegmentMerchMult),
        hype: N(player.hype) || 30,
        unitsRemaining: Math.min(unitsRemaining, effectiveStockBeforeSale), // cap by on-hand stock
        pricePerUnit: N(merch.price_per_unit),
        randomUnit: rng.random(),
        merchType: merch.merch_type || '',
        edition: merch.edition || 'Standard',
        priceAnchor: getMerchBasePrice(merch.merch_type || ''),
        activeTurns: currentActiveTurns,
        hasActiveRelease: summary.releases_activated > 0,
        isOnTour: !!(ctx?.hasActiveTour),
      });
      const actualSales = salesResult.unitsSold;
      
      if (actualSales > 0) {
        const revenue = salesResult.revenue * vidwaveShelfBoost;
        merchRevenue += revenue;
        summary.merch_units_sold += actualSales;
        summary.merch_stream_boost += salesResult.streamBoost || 0;
        summary.merch_hype_boost += salesResult.hypeBoost || 0;
        
        const newTotal = effectiveUnitsSold + actualSales;
        const isSoldOut = newTotal >= effectiveUnitsManufactured;
        const stockAfterSales = Math.max(0, effectiveStockBeforeSale - actualSales);
        const salesPatch: any = {
          units_sold: newTotal,
          stock: stockAfterSales,
          total_revenue: N(merch.total_revenue) + revenue,
          active_turns_count: currentActiveTurns + 1,
          status: isSoldOut ? 'Sold Out' : 'Active'
        };
        // Mark sellout and award hype boost for limited/exclusive drops
        if (isSoldOut && !merch.sellout_achieved) {
          salesPatch.sellout_achieved = true;
          const isLimitedDrop = merch.edition === 'Limited' || merch.edition === 'Exclusive';
          if (isLimitedDrop) {
            limitedSelloutHypeBoost += merch.edition === 'Exclusive' ? 6 : 4;
          }
        }

        // Milestone-based controversy check for questionable sourcing (invariant #3)
        // Only triggers when crossing 500 / 2k / 10k / 50k unit milestones
        const CONTROVERSY_MILESTONES = [500, 2000, 10000, 50000];
        if (merch.sourcing_tier === 'Questionable' && !merch.controversy_triggered) {
          const prevTotal = effectiveUnitsSold;
          const crossedMilestone = CONTROVERSY_MILESTONES.some(m => prevTotal < m && newTotal >= m);
          if (crossedMilestone) {
            const followers = N(player.fans ?? player.followers);
            // Scale risk by fame: underground barely risks it, superstars get cooked
            const fameRisk = followers > 100000 ? 0.60 : followers > 50000 ? 0.40 : followers > 10000 ? 0.20 : 0.08;
            if (rng.random() < fameRisk) {
              scandalTriggered = true;
              salesPatch.controversy_triggered = true;
              const severity = followers > 100000 ? 1.5 : followers > 50000 ? 1.2 : 1.0;
              merchScandalHypePenalty += Math.floor(5 * severity);
              merchScandalCloutPenalty += Math.floor(3 * severity);
              merchScandalFollowerLoss += Math.floor(followers * 0.005 * severity);
              merchEssenceNudge.authenticity -= 3;
              merchEssenceNudge.rebellion -= 2;
            }
          }
        }

        if (merch.restock_mode === 'auto' && !isSoldOut) {
          const targetOnHand = N(merch.target_on_hand);
          const restockBatch = N(merch.restock_batch) || 50;
          const restockInterval = N(merch.restock_interval_turns) || 1;
          const maxTotalUnits = merch.max_total_units ? N(merch.max_total_units) : null;
          const shouldRestockAfterSale = stockAfterSales < targetOnHand && (globalTurnId - effectiveLastRestockTurn) >= restockInterval;
          const canRestockAfterSale = !maxTotalUnits || effectiveUnitsManufactured < maxTotalUnits;

          if (shouldRestockAfterSale && canRestockAfterSale) {
            const unitsToAdd = Math.min(restockBatch, targetOnHand - stockAfterSales);
            const cappedUnits = maxTotalUnits ? Math.min(unitsToAdd, maxTotalUnits - effectiveUnitsManufactured) : unitsToAdd;

            if (cappedUnits > 0) {
              const baseCost = getMerchBaseCost(merch.merch_type);
              const sourcingMult = getSourcingCostMult(merch.sourcing_tier);
              const restockCost = Math.ceil(baseCost * cappedUnits * sourcingMult);
              const availableCash = N(player.income);

              if (availableCash >= restockCost) {
                merchRestockCost += restockCost;
                salesPatch.stock = stockAfterSales + cappedUnits;
                salesPatch.units_manufactured = effectiveUnitsManufactured + cappedUnits;
                salesPatch.restock_count = effectiveRestockCount + 1;
                salesPatch.last_restock_turn = globalTurnId;
              } else {
                merchSkippedRestocks += 1;
                merchSkippedRestockCost += restockCost;
              }
            }
          }
        }

        queueMerchUpdate(merch.id, salesPatch);
      } else {
        // No sales this turn — still age the item for lifecycle sunset
        queueMerchUpdate(merch.id, { active_turns_count: currentActiveTurns + 1 });
      }
    }
    
    summary.merch_revenue = merchRevenue;
    summary.merch_restock_cost = merchRestockCost;
    summary.merch_scandal_triggered = scandalTriggered;
    summary.merch_scandal_hype_penalty = merchScandalHypePenalty;
    summary.merch_scandal_clout_penalty = merchScandalCloutPenalty;
    summary.merch_scandal_follower_loss = merchScandalFollowerLoss;
    summary.merch_limited_sellout_hype_boost = limitedSelloutHypeBoost;
    summary.merch_skipped_restock_count = merchSkippedRestocks;
    summary.merch_skipped_restock_cost = merchSkippedRestockCost;
    summary.merch_essence_nudge = merchEssenceNudge;
  } catch (e: any) {
    console.error(`[Core] Merch processing failed for ${player.id}:`, e.message);
  }
  
  // Helper functions for merch costs
  function getMerchBaseCost(type: string): number {
    const costs: Record<string, number> = {
      'T-Shirt': 5, 'Hoodie': 12, 'Hat': 4, 'Poster': 1, 'Vinyl': 8, 'CD': 2,
      'Cassette': 1, 'Sneakers': 25, 'Perfume': 10, 'Tote Bag': 3, 'Beanie': 3,
      'Snapback': 4, 'Mug': 2
    };
    return costs[type] || 5;
  }
  
  function getMerchBasePrice(type: string): number {
    const prices: Record<string, number> = {
      'CD': 15,
      'Vinyl': 35,
      'Cassette': 12,
      'T-Shirt': 25,
      'Hoodie': 55,
      'Hat': 20,
      'Snapback': 20,
      'Beanie': 18,
      'Sneakers': 95,
      'Perfume': 50,
      'Poster': 12,
      'Mug': 12,
      'Tote Bag': 20,
    };
    return prices[type] || Math.max(1, getMerchBaseCost(type) * 4);
  }
  
  function getSourcingCostMult(tier: string): number {
    const mults: Record<string, number> = {
      'Ethical': 1.4,
      'Standard': 1.0,
      'Questionable': 0.65
    };
    return mults[tier] || 1.0;
  }

  // 4b. TOURING REVENUE
  // NOTE: Tour processing (gigs, revenue, fatigue, morale, events) is handled by touringManager (order 5).
  // touringManager sets deltas.turn_metrics.touring_revenue and deltas.artistProfile.income.
  // Core reads summary.touring_revenue which is set by the touring module via runtimeContext.
  let touringRevenue = N(summary.touring_revenue);
  // Phase 6: superfans tour turnout boost
  if (superfansTourBoost > 0 && touringRevenue > 0) {
    touringRevenue = Math.floor(touringRevenue * (1 + superfansTourBoost));
  }
  let gigUpdates: any[] = [];
  let tourUpdates: any[] = [];

  // 4c. SOCIAL MEDIA REVENUE & GROWTH
  // NOTE: Social revenue and follower growth are calculated by socialMediaModule (order 4).
  // socialMediaModule sets summary.social_revenue and summary.social_fan_growth.
  // Here we only handle brand deal revenue (economy concern, not social media).
  let socialRevenue = N(summary.social_revenue); // Set by socialMediaModule if it ran before core
  let socialAccountUpdates: any[] = []; // socialMediaModule owns these updates

  // 4d. BRAND DEAL REVENUE
  // NOTE: Brand deal revenue is now computed by brandDealsModule (order 4.8) via per-turn
  // contract payouts. Core does NOT auto-generate brand deal revenue to prevent double-counting.
  // brandDealsModule sets turn_metrics.brand_deal_revenue and uses brand_deal_income_boost
  // additive delta (resolved in turnEngine commit phase, same pattern as tour_income_boost).
  let brandDealRevenue = 0;
  // Read brand_deal_revenue from runtimeContext if brandDealsModule already ran (it runs at 4.8, after core at 1)
  // This won't be set yet since core runs first, but the turn_metrics merge in turnScheduler
  // will make it available for the final payout calculation via runtimeContext.
  summary.brand_deal_revenue = 0; // Placeholder — actual value set by brandDealsModule

  // 4e. FAN SUBSCRIPTION REVENUE (recurring from loyal fans)
  // Uses fandom_segments (canonical Phase 6 data) for stan/core counts.
  let fanSubRevenue = 0;
  try {
    if (!fanProfileData) {
      const fanProfiles = await entities.FanProfile?.filter({ artist_id: player.id }) || [];
      fanProfileData = fanProfiles[0] || null;
    }
    if (fanProfileData) {
      const totalFollowers = N((player.fans ?? player.followers));

      // Reuse pre-fetched fandom_segments data from section 3b (stan/core/casual/trend_chaser).
      // Falls back to 0 if segments were not yet populated (new player).
      const stansCount = _fanSegStans;
      const coreCount = _fanSegCore;

      const fanSubResult = calculateFanSubRevenue({
        followers: totalFollowers,
        stans: stansCount,
        coreFans: coreCount,
        hype: N(player.hype) || 30,
        randomUnit: rng.random()
      });
      fanSubRevenue = fanSubResult.revenue;
    }
    summary.fan_sub_revenue = fanSubRevenue;
  } catch (e: any) {
    console.error(`[Core] Fan sub revenue failed for ${player.id}:`, e.message);
  }

  // 4f. SYNC LICENSING (random windfall — song placed in media)
  let syncRevenue = 0;
  try {
    const activeReleaseCount = _pfReleases
      ? _pfReleases.filter((r: any) => ['Hot', 'Trending', 'Momentum', 'Stable'].includes(r.lifecycle_state)).length
      : (await entities.Release?.filter({
          artist_id: player.id,
          lifecycle_state: ['Hot', 'Trending', 'Momentum', 'Stable']
        }) || []).length;
    const syncResult = calculateSyncLicensing({
      clout: N(player.clout),
      careerStage: player.career_stage || 'Unknown',
      activeReleases: activeReleaseCount,
      randomUnit: rng.random()
    });
    syncRevenue = syncResult.revenue;
    summary.sync_licensing_revenue = syncRevenue;
    if (syncResult.placed) {
      console.log(`[Core] ${player.artist_name} sync placement: ${syncResult.description} for $${syncRevenue}`);
    }
  } catch (e: any) {
    console.error(`[Core] Sync licensing failed for ${player.id}:`, e.message);
  }

  // 4g. COLLABORATION REVENUE (share of collab release streams)
  let collabRevenue = 0;
  try {
    const collabReleases = await entities.Release?.filter({
      featured_artist_id: player.id,
      lifecycle_state: ['Hot', 'Trending', 'Momentum', 'Stable']
    }) || [];
    if (collabReleases.length > 0) {
      const collabResult = calculateCollabRevenue({
        collabReleases,
        followers: N((player.fans ?? player.followers)),
        randomUnit: rng.random()
      });
      collabRevenue = collabResult.revenue;
    }
    summary.collab_revenue = collabRevenue;
  } catch (e: any) {
    console.error(`[Core] Collab revenue failed for ${player.id}:`, e.message);
  }

  // 3c. PHYSICAL MEDIA (CD/Vinyl/Cassette)
  let physicalResult = calculatePhysicalMediaRevenue({
    followers: N((player.fans ?? player.followers)),
    hype: N(player.hype),
    hasHotRelease: summary.releases_activated > 0,
    careerStage: player.career_stage || 'Unknown',
    randomUnit: rng.random()
  });

  // Apply runaway song physical boost if applicable
  if (runawayResults.hasRunaway) {
    const turnsSinceDetected = globalTurnId - (runawayResults.runawayData?.detectedTurn || globalTurnId);
    physicalResult.revenue = applyRunawayPhysicalBoost(physicalResult.revenue, runawayResults.runawayData, turnsSinceDetected);
  }

  // Add physical media stream boost to total streams
  if (summary.merch_stream_boost > 0) {
    summary.streams_earned += summary.merch_stream_boost;
    streamingRevenue += summary.merch_stream_boost * 0.019; // Weighted avg payout
  }

  // Apply runaway song revenue multiplier if applicable
  if (runawayResults.hasRunaway) {
    const turnsSinceDetected = globalTurnId - (runawayResults.runawayData?.detectedTurn || globalTurnId);
    streamingRevenue = applyRunawayRevenueMultiplier(streamingRevenue, runawayResults.runawayData, turnsSinceDetected);
    merchRevenue = applyRunawayRevenueMultiplier(merchRevenue, runawayResults.runawayData, turnsSinceDetected);
    touringRevenue = applyRunawayRevenueMultiplier(touringRevenue, runawayResults.runawayData, turnsSinceDetected);
    socialRevenue = applyRunawayRevenueMultiplier(socialRevenue, runawayResults.runawayData, turnsSinceDetected);
  }

  // CLOUT MULTIPLIER — uses effective_clout (base + ephemeral buzz)
  // Subtle: 1.0x at 0 clout, ~1.05x at 50, ~1.12x at 200, ~1.25x at 500+
  const cloutRevenueMult = 1 + Math.min(0.25, effectiveClout / 2000);
  streamingRevenue = Math.floor(streamingRevenue * cloutRevenueMult);
  merchRevenue = Math.floor(merchRevenue * cloutRevenueMult);
  brandDealRevenue = Math.floor(brandDealRevenue * cloutRevenueMult);

  // CAREER TREND MODIFIERS — applied after clout multiplier
  // revenue_penalty: SLUMP(-5%), FLOP(-8%), DORMANT(-3%) — stacks additively
  // marketing_efficiency_bonus: VIRAL(+10%), COMEBACK(+8%) — boosts discovery-driven revenue
  if (trendRevenuePenalty !== 0) {
    const penaltyMult = 1 + trendRevenuePenalty; // e.g. 1 + (-0.08) = 0.92
    streamingRevenue = Math.floor(streamingRevenue * penaltyMult);
    merchRevenue     = Math.floor(merchRevenue     * penaltyMult);
    touringRevenue   = Math.floor(touringRevenue   * penaltyMult);
    socialRevenue    = Math.floor(socialRevenue    * penaltyMult);
  }
  if (trendMarketingBonus > 0) {
    // Marketing bonus boosts brand deal and streaming discovery revenue
    const mktMult = 1 + trendMarketingBonus;
    brandDealRevenue  = Math.floor(brandDealRevenue  * mktMult);
    streamingRevenue  = Math.floor(streamingRevenue  * mktMult);
  }
  // Store for turn_metrics so UI can display them
  summary.trend_revenue_penalty   = trendRevenuePenalty;
  summary.trend_marketing_bonus   = trendMarketingBonus;
  summary.trend_retention_bonus   = trendRetentionBonus;

  const totalBrandAndNew = brandDealRevenue + fanSubRevenue + syncRevenue + collabRevenue;
  
  // Add merch restock costs to expenses
  const totalExpenses = (summary.expenses || 0) + merchRestockCost;
  
  const payout = calculateTurnPayout({
    streamingRevenue,
    merchRevenue,
    touringRevenue,
    socialRevenue,
    brandDealRevenue: totalBrandAndNew,
    expenses: totalExpenses
  });
  summary.income_gained = payout.net; // Use net instead of gross to account for expenses
  summary.expenses = totalExpenses;
  summary.net_income_applied = payout.appliedIncomeDelta;

  // 5. FOLLOWER GROWTH — REALISTIC PACING WITH SOFT CAPS
  //    Target: Underground→Local Act in ~60-90 turns, Local→Indie in ~200+ turns
  //    500 followers → ~2-5/turn, 5K → ~8-20/turn, 50K → ~30-80/turn
  //    Growth comes from: streams (primary), hype, releases, tours
  const existingTourGrowth = summary.fan_growth || 0;
  const currentFollowers = N((player.fans ?? player.followers));
  // Stream-driven growth: listeners discover you through streams
  const streamFollowers = Math.floor(summary.streams_earned * 0.0008); // ~1 follower per 1,250 streams
  const organicBase = Math.floor(currentFollowers * 0.0002) + 1; // Discovery floor
  const hypeGrowthMult = 0.5 + (N(player.hype) || 30) / 100;
  const randomFactor = 0.8 + (rng.random() * 0.4);
  const discoveryGrowthMult = Math.max(1, 1 + (Number(ctx?.communityOrganicGrowthBoost) || 0));
  const releaseBonus = summary.releases_activated > 0 ? Math.floor(organicBase * 2) : 0;

  // CLOUT FOLLOWER BOOST — uses effective_clout (base + ephemeral buzz)
  // Subtle: 1.0x at 0 clout, ~1.03x at 50, ~1.08x at 200, ~1.15x at 500+
  const cloutGrowthMult = 1 + Math.min(0.15, effectiveClout / 3500);
  // CAREER TREND: retention bonus boosts fan retention (LEGACY +5%, GOAT +10%)
  // marketing bonus boosts discovery/organic growth (VIRAL +10%, COMEBACK +8%)
  const trendGrowthMult = 1 + Math.max(0, trendRetentionBonus) + Math.max(0, trendMarketingBonus * 0.5);
  // Apply inactivity suppression: ONE_HIT_WONDER/DORMANT/PASSED_PRIME reduce organic discovery
  const inactivityGrowthMult = trendFollowerGrowthMult; // 1.0 normal, 0.6 OHW, 0.45 DORMANT
  let organicGrowth = Math.floor((streamFollowers + organicBase + releaseBonus) * hypeGrowthMult * randomFactor * cloutGrowthMult * trendGrowthMult * inactivityGrowthMult);

  // SOFT CAPS & DIMINISHING RETURNS FOR CORE FANS
  // Allow growth to 5M+ but with progressively harsher diminishing returns
  let coreGrowthMultiplier = 1.0;
  if (currentFollowers > 2_000_000) {
    // 2M+ : Heavy diminishing returns (0.1x - 0.3x)
    const excess = currentFollowers - 2_000_000;
    const diminishingFactor = Math.max(0.1, 1 - (excess / 8_000_000)); // Approaches 0.1x at 10M
    coreGrowthMultiplier *= diminishingFactor;
  } else if (currentFollowers > 500_000) {
    // 500K-2M : Moderate diminishing returns (0.3x - 0.7x)
    const excess = currentFollowers - 500_000;
    const diminishingFactor = Math.max(0.3, 1 - (excess / 2_000_000)); // Approaches 0.3x at 2M
    coreGrowthMultiplier *= diminishingFactor;
  } else if (currentFollowers > 100_000) {
    // 100K-500K : Light diminishing returns (0.7x - 0.9x)
    const excess = currentFollowers - 100_000;
    const diminishingFactor = Math.max(0.7, 1 - (excess / 1_000_000)); // Approaches 0.7x at 500K
    coreGrowthMultiplier *= diminishingFactor;
  }

  // Phase 6: discovery quality multiplier (segment composition affects organic discovery)
  const p6DiscoveryMult = p6DiscoveryQualityMultiplier * (1 + p6NostalgiaDiscoveryBoost);
  // Community vector: organic growth boost (up to +6%)
  const p6CommunityGrowthMult = 1 + p6CommunityOrganicGrowthBoost;
  // Fandom promo labor boost: fans promoting your music amplifies organic discovery
  organicGrowth = Math.floor(organicGrowth * coreGrowthMultiplier * discoveryGrowthMult * p6DiscoveryMult * p6CommunityGrowthMult * fandomPromoBoostMult);

  // Apply runaway song follower boost if applicable
  if (runawayResults.hasRunaway) {
    const turnsSinceDetected = globalTurnId - (runawayResults.runawayData?.detectedTurn || globalTurnId);
    organicGrowth = applyRunawayFollowerBoost(organicGrowth, runawayResults.runawayData, turnsSinceDetected);
  }

  // Pass unified player activity signal to churn computation
  const playerActivity = ctx?.playerActivity || ctx?.runtimeContext?.playerActivity;
  const churnResult = computeFollowerChurnLoss(currentFollowers, {
    sentimentChurnDelta: Number(ctx?.audienceModifiers?.churnDelta) || 0,
    retentionMultAdj: Number(runtimeTrendEffects?.retentionMultAdj) || 1,
    trendFollowerGrowthMult,
    consecutiveDeclineTurns: N(player.consecutive_decline_turns) || 0,
    listenerGrowthTrendPct: Number(fanProfileData?.listener_growth_trend) || 0,
    inGracePeriod: playerActivity?.inGracePeriod ?? true,
    postGraceDecayRate: playerActivity?.postGraceDecayRate ?? 0,
  });
  // Phase 6: apply churn multiplier (segment composition), retention boost (superfans),
  // and nostalgia churn reduction to final churn loss
  let adjustedChurnLoss = churnResult.loss;
  if (p6ChurnMultiplier !== 1) {
    adjustedChurnLoss = Math.floor(adjustedChurnLoss * p6ChurnMultiplier);
  }
  // Superfans retention boost reduces churn (e.g. 0.004 = -0.4% churn reduction)
  if (superfansRetentionBoost > 0) {
    adjustedChurnLoss = Math.max(0, adjustedChurnLoss - Math.floor(currentFollowers * superfansRetentionBoost));
  }
  // Nostalgia churn reduction (inactive artists with legacy get some protection)
  if (p6NostalgiaChurnReduction > 0) {
    adjustedChurnLoss = Math.floor(adjustedChurnLoss * (1 - p6NostalgiaChurnReduction));
  }
  // Community vector: churn reduction (up to -4%)
  if (p6CommunityChurnReduction > 0) {
    adjustedChurnLoss = Math.floor(adjustedChurnLoss * (1 - p6CommunityChurnReduction));
  }
  summary.follower_churn_loss = adjustedChurnLoss;
  summary.follower_churn_rate = Number((adjustedChurnLoss / Math.max(1, currentFollowers)).toFixed(5));
  summary.follower_growth = Math.max(0, organicGrowth);
  summary.fan_growth = existingTourGrowth + organicGrowth - adjustedChurnLoss - merchScandalFollowerLoss;

  // 5b. HYPE BOOST from activity — multiple sources keep hype alive
  const currentHype = N(player.hype) || 30;
  let hypeBoostTotal = 0;
  if (summary.releases_activated > 0) {
    hypeBoostTotal += 3 + summary.releases_activated * 2;
  }
  if (summary.gigs_completed > 0) {
    hypeBoostTotal += Math.min(5, summary.gigs_completed * 1.5);
  }
  // Physical media (CD/Vinyl) sales boost hype — fans engaging deeply
  if (summary.merch_hype_boost > 0) {
    hypeBoostTotal += summary.merch_hype_boost;
  }
  // Streaming activity generates buzz — big stream counts keep you relevant
  if (summary.streams_earned > 0) {
    // 1K streams → +0.3, 10K → +1, 100K → +2, 1M → +3, 10M → +4
    hypeBoostTotal += Math.min(4, Math.log10(Math.max(1, summary.streams_earned)) - 2.5);
  }
  // Social media activity generates hype
  if (summary.social_revenue > 0 || summary.social_fan_growth > 0) {
    hypeBoostTotal += Math.min(2, (summary.social_fan_growth || 0) * 0.01 + (summary.social_revenue > 0 ? 0.5 : 0));
  }
  // Sample quality modifier — released songs that sample high-quality originals get a virality bonus
  // Plugs into existing hype system; does not introduce new tracking.
  // Bonus: +0.5 to +2.0 per active released sample, scaled by original song quality.
  try {
    const sampledSongs = _pfSongs
      ? _pfSongs.filter((s: any) => s.is_remix && s.remix_type === 'sample' && s.release_status === 'released')
      : await entities.Song?.filter({
          artist_id: player.id,
          is_remix: true,
          remix_type: 'sample',
          release_status: 'released',
        }) || [];
    if (sampledSongs.length > 0) {
      const originalIds = sampledSongs.map((s: any) => s.original_song_id).filter(Boolean);
      if (originalIds.length > 0) {
        const originals = await Promise.all(
          originalIds.map((id: string) => entities.Song?.filter({ id }).then((r: any[]) => r?.[0]).catch(() => null))
        );
        let sampleBonus = 0;
        for (const orig of originals) {
          if (!orig) continue;
          const q = N(orig.quality);
          // Quality 50 → +0.5, quality 80 → +1.2, quality 100 → +2.0 (capped)
          sampleBonus += Math.min(2.0, (q / 100) * 2.0);
        }
        hypeBoostTotal += Math.min(3, sampleBonus); // cap total sample bonus at +3
      }
    }
  } catch (_) { /* non-fatal */ }
  // Limited edition sell-out hype boost — selling out exclusive/limited drops generates buzz
  if (limitedSelloutHypeBoost > 0) {
    hypeBoostTotal += limitedSelloutHypeBoost;
  }
  // Floor recovery: active players with followers slowly regain hype toward a baseline
  // Baseline = 20 + log10(followers) * 5 (e.g. 500 followers → 33, 10K → 40, 1M → 50)
  const hypeBaseline = Math.min(60, 20 + Math.log10(Math.max(1, currentFollowers)) * 5);
  if (currentHype < hypeBaseline) {
    hypeBoostTotal += Math.min(2, (hypeBaseline - currentHype) * 0.1);
  }

  // 6. HYPE DECAY — faster decay, especially at high levels and in FADE
  //    Hype is hard to maintain without constant activity
  //    At 30 hype: lose ~0.5/turn. At 70: lose ~2/turn. At 100: lose ~4/turn.
  const baseDecayRate = 0.01 + (currentHype / 2500); // 1.0% at 0, 5% at 100
  const decayRate = baseDecayRate * eraMultipliers.hype_decay * (1 + trendHypeDecayBoost);
  summary.hype_change = Math.floor(hypeBoostTotal) - Math.floor(currentHype * decayRate) - merchScandalHypePenalty;

  // 7. CLOUT UPDATE — slow, prestige-based growth
  //    Clout represents industry respect. It grows slowly from sustained success.
  //    Target: Underground ~0-2/turn, Local Act ~1-3, Indie ~2-5, Rising ~3-8
  //    500 followers → ~2-5/turn, 5K → ~8-20/turn, 50K → ~30-80/turn
  //    Growth comes from: streams (primary), hype, releases, tours
  const currentClout = N(player.clout);
  const cloutDiminishing = Math.max(0.05, 1.0 / (1 + currentClout / 100));
  // Followers contribute less, streams and hype contribute more
  const followerClout = Math.floor(Math.pow(currentFollowers, 0.4) * 0.02 * cloutDiminishing);
  const hypeClout = Math.floor(((N(player.hype) || 30) / 25) * cloutDiminishing);
  const streamsClout = Math.floor(Math.pow(summary.streams_earned, 0.4) * 0.01 * cloutDiminishing);
  const rawCloutGain = followerClout + hypeClout + streamsClout;
  // Tight caps: underground artists gain 1-3 clout/turn max
  const cloutCap = currentClout < 20 ? 3 : currentClout < 80 ? 5 : currentClout < 200 ? 8 : currentClout < 500 ? 12 : 18;
  summary.clout_gain = Math.max(0, Math.min(rawCloutGain, cloutCap) - merchScandalCloutPenalty);
  summary.buzz_clout = buzzClout;
  summary.effective_clout = currentClout + summary.clout_gain + buzzClout;

  // Career stage ownership contract:
  // `careerProgressionPipeline` is the single writer for players.career_stage.
  // Core computes economics only and never mutates career_stage.
  // Keep projected followers for setback math only.
  const projectedFollowers = Math.max(0, Math.floor(N((player.fans ?? player.followers)) + summary.fan_growth));

  // Economy v4: Career setback mechanics — apply penalties for sustained poor performance
  const hasPreviousIncomeBaseline = Number.isFinite(Number(player.previous_turn_income));
  const previousIncome = hasPreviousIncomeBaseline ? N(player.previous_turn_income) : 0;
  const currentIncome = summary.income_gained || 0;
  const revenueDecline = previousIncome > 0 ? Math.max(0, 1 - (currentIncome / previousIncome)) : 0;
  const hasPreviousFollowerBaseline = Number.isFinite(Number(player.previous_turn_followers));
  const previousFollowers = hasPreviousFollowerBaseline ? N(player.previous_turn_followers) : 0;
  const followerDecline = previousFollowers > 0 ? Math.max(0, 1 - (projectedFollowers / previousFollowers)) : 0;
  const setbackResult = calculateCareerSetback(player, N(player.consecutive_decline_turns) || 0, {
    revenueDecline,
    followerDecline,
    previousIncome,
    eraFlop: false, // Will be set by era processor if applicable
    tension: N(player.era_tension) || 0
  });
  summary.career_setback = setbackResult;

  // Apply setback effects to deltas
  let setbackFollowerLoss = 0;
  let setbackHypeDamage = 0;
  let setbackCloutDamage = 0;
  if (setbackResult.hasSetback) {
    for (const effect of setbackResult.effects) {
      if (effect.type === 'follower_loss') setbackFollowerLoss = effect.value;
      if (effect.type === 'hype_damage') setbackHypeDamage = effect.value;
      if (effect.type === 'clout_damage') setbackCloutDamage = effect.value;
    }
  }

  const artistProfileDelta: any = {
    energy: Math.floor(Math.min(maxEnergy, currentEnergy + summary.energy_restored)),
    inspiration: Math.floor(Math.min(100, currentInspiration + summary.inspiration_gained)),
    income: Math.max(0, N(player.income) + summary.net_income_applied),
    fans: Math.max(0, Math.floor(N((player.fans ?? player.followers)) + summary.fan_growth + setbackFollowerLoss)),
    followers: Math.max(0, Math.floor(N((player.fans ?? player.followers)) + summary.fan_growth + setbackFollowerLoss)),
    hype: Math.floor(Math.max(10, currentHype + summary.hype_change + setbackHypeDamage)),
    clout: Math.max(0, Math.floor(N(player.clout) + summary.clout_gain + setbackCloutDamage)),
    // Keep signed growth visible so downstream systems can distinguish flat vs decline turns.
    // Use 2 decimal places to avoid rounding to 0 for large follower bases with small per-turn deltas.
    fan_growth: Number(((summary.fan_growth / Math.max(1, (player.fans ?? player.followers))) * 100).toFixed(2)),
    follower_growth: Number(((summary.fan_growth / Math.max(1, (player.fans ?? player.followers))) * 100).toFixed(2))
  };


  // Return staged deltas (no writes, no history, no notifications)
  if (ctx?.debug_turn_economy && (!ctx?.debug_player_id || ctx.debug_player_id === player.id)) {
    console.log('[Core][DebugEconomy]', JSON.stringify({
      turn: globalTurnId,
      player_id: player.id,
      inputs: {
        followers: N((player.fans ?? player.followers)),
        hype: N(player.hype) || 30,
        active_release_count: releaseUpdates.length,
        active_merch_count: merchUpdates.length,
        era_multipliers: eraMultipliers
      },
      outputs: summary
    }));
  }

  // Add runaway results to summary for notification processing
  summary.runawaySong = runawayResults;

  return {
    success: true,
    deltas: {
      artistProfile: artistProfileDelta,
      releases_updates: releaseUpdates,
      songs_updates: songsUpdates,
      merch_updates: merchUpdates,
      gig_updates: gigUpdates,
      tour_updates: tourUpdates,
      social_account_updates: socialAccountUpdates,
      turn_event: {
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'TurnProcessorCore',
        event_type: 'turn_summary',
        description: `Core turn ${globalTurnId} processed`,
        deltas: summary,
        metadata: {
          streams: summary.streams_earned,
          revenue: summary.income_gained,
          followers: summary.fan_growth,
          platform_streams: summary.platform_streams,
          merch_units_sold: summary.merch_units_sold,
          merch_revenue: summary.merch_revenue,
          merch_stream_boost: summary.merch_stream_boost,
          touring_revenue: summary.touring_revenue,
          gigs_completed: summary.gigs_completed,
          social_revenue: summary.social_revenue,
          brand_deal_revenue: summary.brand_deal_revenue,
          fan_sub_revenue: summary.fan_sub_revenue,
          sync_licensing_revenue: summary.sync_licensing_revenue,
          collab_revenue: summary.collab_revenue,
          social_fan_growth: summary.social_fan_growth,
          releases_aged: summary.releases_aged,
          expenses: summary.expenses,
          net_income_applied: summary.net_income_applied
        }
      },
      turn_events: telemetryEvents,
      turn_metrics: summary
    }
  };
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[turnProcessorCore] Fatal error for player ${player.id}:`, errMsg, error);
    return {
      success: false,
      error: `turnProcessorCore: ${errMsg}`,
      deltas: {}
    };
  }
}

/**
 * DEPRECATED: Old automation endpoint - now replaced by unified turnEngine
 * Kept for backward compatibility reference only
 */
export async function handleRequest(req: any) {
  return Response.json(
    { error: 'turnProcessorCore automation deprecated. Use turnEngine instead.' },
    { status: 410 }
  );
}

if ((import.meta as any).main) {
  (globalThis as any).Deno.serve(handleRequest);
}
