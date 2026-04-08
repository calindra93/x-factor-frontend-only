/**
 * SOCIAL MEDIA MODULE (Turn Engine — Order 4)
 * Sole owner of social media growth, backlog views, and passive revenue per turn.
 * All math imported from socialMediaMath.ts (single source of truth).
 * turnProcessorCore does NOT touch social accounts — this module handles everything.
 */

import {
  calcPassiveGrowth,
  calcBacklogViews,
  calcPassiveRevenue,
  calcViewToFollowerConversion,
  canMonetize,
  monetizationProgress,
  MONETIZATION_GATES,
  pickReactionChannels,
  generateReactionTitle,
  calcVidWaveAdRevenue,
  calcLoopTokRevenue
} from './socialMediaMath.ts';
import { applyRunawayPlatformBoost } from './runawaySongMechanic.ts';
import { generateReactionThumbnail, generateProceduralReactionThumbnail } from './thumbnailGenerator.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { computeSponsoredBoost, computeVidWaveFollowerTrickle } from './socialMedia/vidwaveMath.ts';
import { processLoopTokTick, updateSoundMetricsGlobal } from './socialMedia/looptokTickModule.ts';
import { computeDiscoveryConversion } from './discoveryConversion.ts';
import { computeSocialFollowerChurn } from './followerChurn.ts';
import { SOCIAL_VIRAL_CAPS } from './constants/economyCaps.ts';

function N(v: unknown): number { return Number(v) || 0; }
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SHORTS_POST_SHARE = 0.3;
const SHORTS_BACKLOG_VIEW_SHARE = 0.4;
const MAX_FOLLOWER_BOOST = 5;
const MAX_REVENUE_BOOST = 10;
const MAX_VIEWS_BOOST = 100;

// Algorithm mood multipliers for passive follower growth per platform.
// Keep in sync with AlgorithmMood enum in algorithmMoodModule.ts when new moods are added.
const INSTAVIBE_MOOD_MULT: Record<string, number> = {
  mainstream:   1.04, // Polished aesthetic content performs well
  nostalgic:    1.06, // Throwback posts trend on InstaVibe
  experimental: 0.96, // Niche content doesn't land as well visually
  underground:  0.94, // Underground moods bypass InstaVibe
  beef_season:  0.98, // Drama goes to LoopTok/Xpress, not InstaVibe
  messy:        1.02, // Mild boost — messy content still performs
};
const VIDWAVE_MOOD_MULT: Record<string, number> = {
  mainstream:   1.02, // Steady watch time boost
  nostalgic:    1.08, // Long-form nostalgia/documentary content peaks on VidWave
  experimental: 1.05, // Deep-dive experimental content finds its audience
  underground:  1.03, // Underground scenes build dedicated watch communities
  beef_season:  1.06, // Drama docs and reaction content spike
  messy:        1.04, // Messy drama = high rewatch
};

interface SocialModuleContext {
  entities: any;
  stageOnly?: boolean;
  runawaySong?: any;
  rng?: { random?: () => number };
  fandomModifiers?: any;
  audienceModifiers?: any;
  industryPerceptionModifiers?: any;
  audienceQualityModifiers?: any;
  careerTrendEffects?: any;
  globalTurnId: number;
  algorithmMood?: string;
  platformSpotlight?: string;
}

export async function processSocialMediaForPlayer(ctx: SocialModuleContext, player: any) {
  const {
    entities,
    stageOnly = false,
    runawaySong,
    rng,
    fandomModifiers = {},
    audienceModifiers = {},
    industryPerceptionModifiers = {},
    audienceQualityModifiers = {},
    careerTrendEffects = {},
    algorithmMood = 'mainstream',
    platformSpotlight = 'looptok',
  } = ctx;
  const narrativeSocialMult = Math.max(0.85, Math.min(1.15, Number(industryPerceptionModifiers?.influenceCaps?.socialInfluenceMult) || 1));
  const culturalGravity = Math.max(0.85, Math.min(1.15, Number(audienceQualityModifiers?.culturalGravity) || 1));
  const qualityViralityMult = Math.max(0.90, Math.min(1.10, (1 + (1 - culturalGravity) * 0.10) * (Number(careerTrendEffects?.viralityTendencyAdj) || 1)));
  // Use provided RNG or fallback
  const rngRandom = rng?.random;
  const random = rngRandom ? () => rngRandom() : Math.random;
  const notifications: any[] = [];
  const accountUpdates: any[] = [];
  const turnEvents: any[] = [];

  // Accumulators for the turn summary
  let totalFollowerGrowth = 0;
  let totalSocialRevenue = 0;
  let totalBacklogViews = 0;
  let totalVidWaveAdRevenue = 0;
  let totalVidWaveImpressions = 0;
  let totalVidWaveSponsoredBoostRevenue = 0;
  let totalLoopTokRevenue = 0;
  let totalLoopTokChallengeBonus = 0;
  const prevFandomLaborPool: Record<string, number> = (ctx as any)?.prevFandomLaborPool || {};
  const memeClipTotal = (prevFandomLaborPool.meme || 0) + (prevFandomLaborPool.clipping || 0);
  const playerFansForLaborBoost = N(player.fans ?? player.followers) || 1;
  const memeClipReachBoost = memeClipTotal > 0
    ? Math.min(0.12, (memeClipTotal / playerFansForLaborBoost) * 0.12)
    : 0;
  
  // Track revenue per platform for grouped notification
  const revenueByPlatform: Record<string, number> = {};
  const vidwaveAdRevenueLog: any[] = [];
  const looptokRevenueLog: any[] = [];

  const socialAccounts = ctx?.prefetchData?.socialAccountsByPlayer?.get(player.id)
    || await entities.SocialAccount.filter({ artist_id: player.id });

  for (const account of socialAccounts) {
    const platform: string = account.platform;
    const currentFollowers = N(account.followers);
    const currentViews = N(account.total_views);
    const currentRevenue = N(account.total_revenue);
    const totalPosts = N(account.total_posts);

    // Count shorts for backlog calculation
    // (approximate: assume 30% of vidwave posts are shorts)
    const shortsCount = platform === 'vidwave' ? Math.floor(totalPosts * SHORTS_POST_SHARE) : 0;

    // 1. Passive follower growth (organic discovery, algorithm, search)
    let followerGrowth = calcPassiveGrowth({
      platform,
      followers: currentFollowers,
      hype: N(player.hype),
      totalPosts,
      careerStage: player.career_stage || 'Unknown',
      rng: random()
    });

    const followerConversionAdj = Math.max(0.9, Math.min(1.1, Number(careerTrendEffects?.followerConversionAdj) || 1));
    followerGrowth = computeDiscoveryConversion(followerGrowth * narrativeSocialMult * followerConversionAdj, {
      audienceQualityModifiers,
      careerTrendEffects,
    });
    const socialChurn = computeSocialFollowerChurn(currentFollowers, {
      sentimentChurnDelta: Number(audienceModifiers?.churnDelta) || 0,
      retentionMultAdj: Number(careerTrendEffects?.retentionMultAdj) || 1,
      stabilityDampeningMult: Number(audienceQualityModifiers?.stabilityDampeningMult) || 1,
      hype: N(player.hype),
    });
    followerGrowth -= socialChurn.churnLoss;

    // Platform spotlight: the globally spotlighted platform gets a 15% follower growth boost this turn
    if (platform === platformSpotlight) {
      followerGrowth = Math.floor(followerGrowth * 1.15);
    }

    // Algorithm mood: platform-specific follower growth modifiers
    if (platform === 'instavibe') {
      followerGrowth = Math.floor(followerGrowth * (INSTAVIBE_MOOD_MULT[algorithmMood] ?? 1.0));
    }
    if (platform === 'vidwave') {
      followerGrowth = Math.floor(followerGrowth * (VIDWAVE_MOOD_MULT[algorithmMood] ?? 1.0));
    }

    // 2. Backlog views (old content being watched — evergreen effect)
    let backlogViews = calcBacklogViews({
      platform,
      followers: currentFollowers + followerGrowth,
      totalPosts,
      shortsCount,
      hype: N(player.hype),
      rng: random()
    });
    backlogViews = Math.floor(backlogViews * qualityViralityMult * narrativeSocialMult);
    if (platform === 'looptok' && memeClipReachBoost > 0) {
      backlogViews = Math.floor(backlogViews * (1 + memeClipReachBoost));
    }
    const backlogViewsRaw = backlogViews;
    const backlogViewsCap = SOCIAL_VIRAL_CAPS.backlogViewsPerTurn[platform as keyof typeof SOCIAL_VIRAL_CAPS.backlogViewsPerTurn] || SOCIAL_VIRAL_CAPS.backlogViewsPerTurn.xpress;
    backlogViews = Math.min(backlogViews, backlogViewsCap);

    // 3. Shorts → subscriber conversion (shorts viewers discover long-form)
    const shortsConversion = platform === 'vidwave' && shortsCount > 0
      ? calcViewToFollowerConversion({
          platform,
          views: Math.floor(backlogViews * SHORTS_BACKLOG_VIEW_SHARE), // ~40% of backlog from shorts
          isShort: true,
          hype: N(player.hype)
        })
      : 0;

    // 4. Passive revenue (only if monetized)
    let revenueResult = calcPassiveRevenue({
      platform,
      backlogViews,
      socialAccount: { ...account, followers: currentFollowers + followerGrowth },
      careerStage: player.career_stage || 'Unknown',
      hype: N(player.hype)
    });
    let passiveRevenue = revenueResult.revenue || 0;

    // 5. VidWave ad revenue (separate tracking for VidWave only)
    let vidwaveAdRevenue = 0;
    let vidwaveImpressions = 0;
    let vidwaveCpmRate = 0;
    let vidwaveRevenueTier = 'bronze';
    
    if (platform === 'vidwave') {
      const adRevenueResult = calcVidWaveAdRevenue({
        backlogViews,
        socialAccount: { ...account, followers: currentFollowers + followerGrowth },
        careerStage: player.career_stage || 'Unknown',
        hype: N(player.hype)
      });
      
      vidwaveAdRevenue = adRevenueResult.adRevenue;
      vidwaveImpressions = adRevenueResult.impressions;
      vidwaveCpmRate = adRevenueResult.cpmRate;
      vidwaveRevenueTier = adRevenueResult.revenueTier;
      
      // Add to VidWave specific totals
      totalVidWaveAdRevenue += vidwaveAdRevenue;
      totalVidWaveImpressions += vidwaveImpressions;
      
      // NOTE: We only persist per-video ad revenue rows (with post_id) later in
      // accrueVidWaveVideoRevenue(). Account-level rows here would have null post_id,
      // which cannot be idempotent against the (player_id, global_turn_id, post_id)
      // unique key.
    }

    // 6. LoopTok revenue tracking (separate from passive revenue)
    let looptokRevenue = 0;
    let looptokRate = 0;
    let looptokRevenueTier = 'creator_fund';
    let looptokAlgorithmMultiplier = 1.0;
    
    if (platform === 'looptok') {
      const looptokResult = calcLoopTokRevenue({
        views: backlogViews,
        socialAccount: { ...account, followers: currentFollowers + followerGrowth },
        careerStage: player.career_stage || 'Unknown',
        isViral: false // Will be determined from recent posts
      });
      
      looptokRevenue = looptokResult.revenue;
      looptokRate = looptokResult.rate;
      looptokRevenueTier = account.followers >= 10000 ? 'brand_deal' : 
                           account.followers >= 5000 ? 'marketplace' : 'creator_fund';
      
      // Get algorithm multiplier from creator state (prefetch-first)
      try {
        const prefetchedCreatorState = ctx?.prefetchData?.looptokCreatorStateByPlayer?.get(player.id);
        if (prefetchedCreatorState) {
          looptokAlgorithmMultiplier = prefetchedCreatorState.algorithm_multiplier || 1.0;
        } else {
          const { data: creatorState } = await supabaseAdmin
            .from('looptok_creator_state')
            .select('algorithm_multiplier')
            .eq('artist_id', player.id)
            .single();
          looptokAlgorithmMultiplier = creatorState?.algorithm_multiplier || 1.0;
        }
        looptokRevenue *= looptokAlgorithmMultiplier;
      } catch (_) {
        // Creator state might not exist, use default
      }
      
      // Add to LoopTok specific totals
      totalLoopTokRevenue += looptokRevenue;
      
      // Create revenue log entry for LoopTok
      looptokRevenueLog.push({
        global_turn_id: ctx.globalTurnId,
        player_id: player.id,
        post_id: null, // Account-level revenue for this turn
        revenue: looptokRevenue,
        rate: looptokRate,
        revenue_tier: looptokRevenueTier,
        is_viral: false,
        algorithm_multiplier: looptokAlgorithmMultiplier,
        challenge_bonus: 0,
        metadata: {
          backlog_views: backlogViews,
          followers: currentFollowers + followerGrowth,
          career_stage: player.career_stage || 'Unknown'
        }
      });
    }

    // --- APPLY RUNAWAY BOOST (Passive Growth) ---
    let runawayBoostApplied = false;
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      const baseMetrics = { followerGrowth, passiveViews: backlogViews, revenue: passiveRevenue + vidwaveAdRevenue };
      const boosted = applyRunawayPlatformBoost(baseMetrics, runawaySong.runawayData, turnsSinceDetected);
      
      // Apply runaway caps to prevent infinite growth

      followerGrowth = Math.min(followerGrowth, Math.floor(baseMetrics.followerGrowth * MAX_FOLLOWER_BOOST));
      backlogViews = Math.min(backlogViews, Math.floor(baseMetrics.passiveViews * MAX_VIEWS_BOOST));
      
      // Apply runaway boost to both passive and ad revenue proportionally
      const totalBaseRevenue = passiveRevenue + vidwaveAdRevenue;
      if (totalBaseRevenue > 0) {
        const passiveRatio = passiveRevenue / totalBaseRevenue;
        const adRatio = vidwaveAdRevenue / totalBaseRevenue;
        
        const boostedTotalRevenue = Math.min(totalBaseRevenue, baseMetrics.revenue * MAX_REVENUE_BOOST);
        passiveRevenue = Math.floor(boostedTotalRevenue * passiveRatio);
        vidwaveAdRevenue = Math.floor(boostedTotalRevenue * adRatio);
      }
      
      runawayBoostApplied = true;
      
      // Log runaway boost event
      turnEvents.push({
        global_turn_id: ctx.globalTurnId,
        player_id: player.id,
        module: 'social_media',
        event_type: 'RUNAWAY_BOOST',
        description: `Runaway song boost applied to ${platform}`,
        deltas: {
          follower_growth: followerGrowth - baseMetrics.followerGrowth,
          views_boost: backlogViews - baseMetrics.passiveViews,
          revenue_boost: (passiveRevenue + vidwaveAdRevenue) - totalBaseRevenue
        },
        metadata: {
          platform,
          turns_since_detected: turnsSinceDetected,
          runaway_strength: runawaySong.runawayData?.strength || 0,
          caps_applied: {
            max_follower_boost: MAX_FOLLOWER_BOOST,
            max_revenue_boost: MAX_REVENUE_BOOST,
            max_views_boost: MAX_VIEWS_BOOST
          }
        }
      });
    }

    // Total growth for this account
    const rawAccountGrowth = followerGrowth + shortsConversion;
    const followerGrowthCap = SOCIAL_VIRAL_CAPS.followerGainPerTurn[platform as keyof typeof SOCIAL_VIRAL_CAPS.followerGainPerTurn] || SOCIAL_VIRAL_CAPS.followerGainPerTurn.xpress;
    const totalAccountGrowth = Math.min(rawAccountGrowth, followerGrowthCap);
    const newFollowerCount = Math.max(0, currentFollowers + totalAccountGrowth);
    const newViewCount = currentViews + backlogViews;

    // Total revenue for this account (passive + ad revenue for VidWave)
    const totalAccountRevenue = passiveRevenue + vidwaveAdRevenue;

    // Accumulate totals
    totalFollowerGrowth += totalAccountGrowth;
    totalSocialRevenue += totalAccountRevenue;
    totalBacklogViews += backlogViews;

    // Build account update (patch format for turnEngine commit phase)
    const patch = {
      followers: newFollowerCount,
      total_views: newViewCount,
      total_revenue: currentRevenue + totalAccountRevenue,
      account_level: Math.floor(newFollowerCount / 1000) + 1,
      verified: newFollowerCount > 10000,
      monetized: canMonetize(platform, { followers: newFollowerCount, total_views: newViewCount })
    };

    if (!stageOnly) {
      await entities.SocialAccount.update(account.id, patch);
    } else {
      accountUpdates.push({ id: account.id, patch });
    }

    // Milestone notifications
    const milestones = [
      { threshold: 1000, label: '1K', priority: 'medium' as const },
      { threshold: 10000, label: '10K', priority: 'medium' as const },
      { threshold: 100000, label: '100K', priority: 'high' as const }
    ];
    for (const ms of milestones) {
      if (newFollowerCount >= ms.threshold && currentFollowers < ms.threshold) {
        notifications.push({
          player_id: player.id,
          type: 'SOCIAL_MEDIA_MILESTONE',
          title: `${ms.label} Followers on ${platform}!`,
          subtitle: `Your ${platform} account hit ${ms.label} followers!`,
          body: `Congratulations! Your ${platform} presence reached ${ms.label} followers.`,
          deep_links: [{ label: 'View Social', route: 'Career', params: { openApp: 'social' } }],
          idempotency_key: `social_milestone_${ms.label}_${platform}_${player.id}_${ctx.globalTurnId}`,
          priority: ms.priority,
          is_read: false
        });
      }
    }

    // Monetization unlocked notification
    const wasMonetized = canMonetize(platform, account);
    const nowMonetized = canMonetize(platform, { followers: newFollowerCount, total_views: newViewCount });
    if (nowMonetized && !wasMonetized) {
      notifications.push({
        player_id: player.id,
        type: 'MONETIZATION_UNLOCKED',
        title: `${platform} Monetization Unlocked!`,
        subtitle: `You can now earn revenue from ${platform}!`,
        body: `Your ${platform} account met the monetization requirements. Revenue will now be generated from your content.`,
        deep_links: [{ label: 'View Social', route: 'Career', params: { openApp: 'social' } }],
        idempotency_key: `monetization_unlock_${platform}_${player.id}_${ctx.globalTurnId}`,
        priority: 'high',
        is_read: false
      });
    }


    if (backlogViewsRaw > backlogViews || rawAccountGrowth > totalAccountGrowth) {
      turnEvents.push({
        global_turn_id: ctx.globalTurnId,
        player_id: player.id,
        module: 'social_media',
        event_type: 'SOCIAL_VIRAL_EVENT',
        description: `${platform} virality clamped`,
        deltas: {
          backlog_views_delta: backlogViews,
          follower_delta: totalAccountGrowth,
        },
        metadata: {
          idempotency_key: `social_viral_event:${player.id}:${ctx.globalTurnId}:${platform}:passive`,
          platform,
          post_id: null,
          base_metric_name: 'backlog_views',
          base_metric_value: backlogViewsRaw,
          engagement_rate_used: null,
          multipliers_applied: {
            qualityViralityMult,
            narrativeSocialMult,
            followerConversionAdj,
          },
          final_multiplier: Math.round((qualityViralityMult * narrativeSocialMult) * 1000) / 1000,
          cap_hit: true,
          cap_name: backlogViewsRaw > backlogViews ? 'social_backlog_views_per_turn' : 'social_followers_per_turn',
          final_applied_deltas: {
            backlog_views: backlogViews,
            follower_growth: totalAccountGrowth,
          }
        }
      });
    }

    // Track revenue per platform for grouped notification (include ad revenue)
    const totalPlatformRevenue = totalAccountRevenue;
    if (totalPlatformRevenue > 0) {
      revenueByPlatform[platform] = totalPlatformRevenue;
    }
  }

  // Log main social media update event
  turnEvents.push({
    global_turn_id: ctx.globalTurnId,
    player_id: player.id,
    module: 'social_media',
    event_type: 'SOCIAL_MEDIA_UPDATE',
    description: `Social media processing completed`,
    deltas: {
      total_follower_growth: totalFollowerGrowth,
      total_social_revenue: totalSocialRevenue,
      total_backlog_views: totalBacklogViews,
      vidwave_ad_revenue: totalVidWaveAdRevenue,
      vidwave_impressions: totalVidWaveImpressions,
      vidwave_sponsored_boost_revenue: Math.round(totalVidWaveSponsoredBoostRevenue * 100) / 100,
      platforms_processed: socialAccounts.length
    },
    metadata: {
      revenue_by_platform: revenueByPlatform,
      runaway_boost_applied: runawaySong?.hasRunaway || false,
      accounts_updated: accountUpdates.length,
      vidwave_ad_revenue_records: vidwaveAdRevenueLog.length
    }
  });

  // ── INSTAVIBE ENGAGEMENT GROWTH ──────────────────────────────────────────
  try {
    await growInstaVibeEngagement(entities, player, ctx.globalTurnId, random);
  } catch (e) {
    console.error('[socialMediaModule] InstaVibe engagement growth error:', e);
  }

  // ── LOOPTOK ENGAGEMENT ACCRUAL ────────────────────────────────────────────
  try {
    await growLoopTokEngagement(entities, player, ctx.globalTurnId, random);
  } catch (e) {
    console.error('[socialMediaModule] LoopTok engagement accrual error:', e);
  }

  // ── VIDWAVE PER-VIDEO TRICKLE ACCRUAL ─────────────────────────────────────
  // Accrue impressions, ad revenue, engagement, and followers for each VidWave
  // video within its earning window. This replaces the old instant-payout model.
  let vidwaveTrickleRevenue = 0;
  let vidwaveTrickleFollowers = 0;
  let vidwaveFollowerGainApplied = 0;
  try {
    const trickleResult = await accrueVidWaveVideoRevenue(player, ctx.globalTurnId, !!ctx?.stageOnly, ctx?.prefetchData);
    vidwaveTrickleRevenue = trickleResult.totalRevenue;
    vidwaveTrickleFollowers = trickleResult.totalFollowerGain;
    const maxVidWaveFollowerGain = Math.max(0, Math.floor(N(player.followers) * 0.05));
    vidwaveFollowerGainApplied = Math.min(vidwaveTrickleFollowers, maxVidWaveFollowerGain);
    totalVidWaveSponsoredBoostRevenue += Number(trickleResult.totalSponsoredBoostRevenue || 0);
    totalFollowerGrowth += vidwaveFollowerGainApplied;

    // Merge per-video ad revenue log entries
    for (const entry of trickleResult.adRevenueLogEntries) {
      vidwaveAdRevenueLog.push(entry);
    }

    if (trickleResult.videosAccrued > 0) {
      turnEvents.push({
        global_turn_id: ctx.globalTurnId,
        player_id: player.id,
        module: `social_media:payout:${player.id}:${ctx.globalTurnId}:vidwave`,
        event_type: 'SOCIAL_PAYOUT_TICK',
        description: `VidWave paid out $${vidwaveTrickleRevenue.toFixed(2)} across ${trickleResult.videosAccrued} video(s)`,
        deltas: {
          vidwave_trickle_revenue: vidwaveTrickleRevenue,
          vidwave_trickle_followers: vidwaveFollowerGainApplied,
          videos_accrued: trickleResult.videosAccrued
        },
        metadata: {
          idempotency_key: `social_payout_tick:${player.id}:${ctx.globalTurnId}:vidwave`,
          source_module: 'social_media',
          platform: 'vidwave',
          post_id: null,
          base_metric_name: 'impressions',
          base_metric_value: trickleResult.perVideoBreakdown.reduce((sum: number, item: any) => sum + (Number(item.impressions) || 0), 0),
          impressions_used: trickleResult.perVideoBreakdown.reduce((sum: number, item: any) => sum + (Number(item.impressions) || 0), 0),
          CPM_used: trickleResult.perVideoBreakdown.length > 0
            ? Math.round((trickleResult.perVideoBreakdown.reduce((sum: number, item: any) => sum + (Number(item.revenue) || 0), 0) / Math.max(1, trickleResult.perVideoBreakdown.reduce((sum: number, item: any) => sum + (Number(item.impressions) || 0), 0) / 1000)) * 100) / 100
            : 0,
          revenue_delta: vidwaveTrickleRevenue,
          per_video: trickleResult.perVideoBreakdown
        }
      });

    if (Number(trickleResult.totalSponsoredBoostRevenue || 0) > 0) {
      notifications.push({
        player_id: player.id,
        global_turn_id: ctx.globalTurnId,
        created_turn_index: ctx.globalTurnId,
        type: 'VIDWAVE_SPONSORED_REVENUE',
        title: 'Sponsored VidWave Uplift',
        subtitle: `+$${Number(trickleResult.totalSponsoredBoostRevenue || 0).toFixed(2)} from sponsorship boosts`,
        body: `Your sponsored VidWave content added +$${Number(trickleResult.totalSponsoredBoostRevenue || 0).toFixed(2)} in incremental ad revenue this turn.`,
        metrics: {
          sponsored_uplift: Number(trickleResult.totalSponsoredBoostRevenue || 0),
          turn: ctx.globalTurnId,
          platform: 'vidwave'
        },
        idempotency_key: `vidwave_sponsored_revenue:${player.id}:${ctx.globalTurnId}`,
        group_key: `vidwave:${player.id}:sponsored_revenue`,
        priority: 'low',
        is_read: false,
      });
    }
    }
  } catch (e) {
    console.error('[socialMediaModule] VidWave trickle accrual error:', e);
  }

  // Beef-driven subtweet posts — feeds controversyTickModule on the next turn
  let beefSubtweetPosts: any[] = [];
  try {
    beefSubtweetPosts = await generateBeefSubtweet(player, algorithmMood, random, ctx.globalTurnId);
  } catch (e) {
    console.error('[socialMediaModule] Beef subtweet generation error (non-fatal):', e);
  }

  // Auto-generate reaction videos for any new music videos
  let reactionPosts: any[] = [];
  try {
    reactionPosts = await generateReactionVideosForPlayer(entities, player, ctx.globalTurnId, random, runawaySong);
  } catch (e) {
    console.error('[socialMediaModule] Reaction video generation error:', e);
    turnEvents.push({
      global_turn_id: ctx.globalTurnId,
      player_id: player.id,
      module: 'social_media',
      event_type: 'SOCIAL_MEDIA_ERROR',
      description: `Reaction video generation failed: ${e instanceof Error ? e.message : String(e)}`,
      deltas: {},
      metadata: {
        error_type: 'reaction_generation',
        non_fatal: true
      }
    });
  }

  // ── LoopTok tick: algorithm state, pillars, challenge progress ──
  let looptokCreatorStateUpserts: any[] = [];
  let looptokChallengeParticipationUpdates: any[] = [];
  let looptokChallengeAwards: any[] = [];
  let looptokAlgoState: string = 'neutral';
  let looptokSuppressedStreak = 0;
  try {
    const looptokResult = await processLoopTokTick({
      player,
      globalTurnId: ctx.globalTurnId,
      fandomModifiers: { heat: N(fandomModifiers?.heat ?? 50), fatigue: N(fandomModifiers?.fatigue ?? 0) },
      brandSafety: N(audienceQualityModifiers?.brandSafetyScore ?? 60),
      fanProfile: null, // loaded internally
      algorithmMood,
    });

    if (looptokResult.creatorStateUpsert) {
      looptokCreatorStateUpserts.push(looptokResult.creatorStateUpsert);
    }
    looptokChallengeParticipationUpdates = looptokResult.challengeParticipationUpdates;
    looptokChallengeAwards = looptokResult.challengeAwards;
    looptokAlgoState = looptokResult.algoState || 'neutral';
    if (looptokAlgoState === 'suppressed') looptokSuppressedStreak += 1;
    turnEvents.push(...looptokResult.turnEvents);
    notifications.push(...looptokResult.notifications);

    // Cross-platform boost: if player has a trending LoopTok sound, add streaming income boost
    if (looptokResult.trendingPlayerSoundBoost > 0) {
      totalSocialRevenue = Math.round(totalSocialRevenue * (1 + looptokResult.trendingPlayerSoundBoost) * 100) / 100;
    }

    // Apply LoopTok algo multiplier to LoopTok revenue/growth in existing accounts
    // (already factored into passive growth above via platform rates, but algo state
    //  provides an additional reach modifier applied at post-creation time)
  } catch (e) {
    console.error('[socialMediaModule] LoopTok tick error (non-fatal):', e);
    turnEvents.push({
      global_turn_id: ctx.globalTurnId,
      player_id: player.id,
      module: 'social_media',
      event_type: 'SOCIAL_MEDIA_ERROR',
      description: `LoopTok tick failed: ${e instanceof Error ? e.message : String(e)}`,
      deltas: {},
      metadata: { error_type: 'looptok_tick', non_fatal: true },
    });
  }

  return {
    success: true,
    deltas: {
      // Use additive boost keys (same pattern as tour_income_boost / brand_deal_income_boost)
      // so turnEngine.ts applies these on top of whatever turnProcessorCore already set,
      // instead of overwriting with absolute values.
      artistProfile: {
        social_income_boost: totalSocialRevenue,
        social_follower_boost: totalFollowerGrowth,
      },
      turn_metrics: {
        social_revenue: totalSocialRevenue,
        social_follower_growth: totalFollowerGrowth,
        social_backlog_views: totalBacklogViews,
        vidwave_ad_revenue: totalVidWaveAdRevenue,
        vidwave_impressions: totalVidWaveImpressions,
        vidwave_sponsored_boost_revenue: Math.round(totalVidWaveSponsoredBoostRevenue * 100) / 100,
        looptok_revenue: totalLoopTokRevenue,
        looptok_challenge_bonus: totalLoopTokChallengeBonus,
        social_posts_created: reactionPosts.length + beefSubtweetPosts.length, // consumed by fandomSegmentsModule
      },
      social_account_updates: accountUpdates,
      notifications_to_create: notifications,
      social_posts_to_create: [...reactionPosts, ...beefSubtweetPosts],
      turn_events: turnEvents,
      vidwave_ad_revenue_log: vidwaveAdRevenueLog,
      looptok_revenue_log: looptokRevenueLog,
      looptok_creator_state_upserts: looptokCreatorStateUpserts,
      looptok_challenge_participation_updates: looptokChallengeParticipationUpdates,
      looptok_challenge_awards: looptokChallengeAwards,
      looptok_algo_state: looptokAlgoState,
      looptok_suppressed_streak: looptokSuppressedStreak,
    }
  };
}

/**
 * VIDWAVE PER-VIDEO TRICKLE ACCRUAL
 * For each VidWave video within its earning window, accrue:
 *   - impressions (from expected_total_impressions using decay weights)
 *   - views (from impressions * view_rate)
 *   - engagement (likes/comments/shares from views * rates)
 *   - ad revenue (from impressions using calcVidWaveAdRevenue-style CPM)
 *   - follower gain (from views * follower_conversion_rate, capped)
 *
 * Idempotent: only accrues turns between last_accrued_turn+1 and current turn.
 * Writes per-video rows to vidwave_ad_revenue_log with unique (player_id, global_turn_id, post_id).
 * Updates vidwave_video_state lifetime totals and last_accrued_turn.
 * Updates social_posts with accumulated stats.
 */
async function accrueVidWaveVideoRevenue(player: any, currentTurn: number, stageOnly = false, prefetchData?: any) {
  const result = {
    totalRevenue: 0,
    totalFollowerGain: 0,
    videosAccrued: 0,
    adRevenueLogEntries: [] as any[],
    perVideoBreakdown: [] as any[],
    totalSponsoredBoostRevenue: 0,
  };

  // Find all eligible videos: created before current turn, not fully accrued
  let videos: any[] | null = null;
  const prefetchedVideos = prefetchData?.vidwaveVideoStateByPlayer?.get(player.id);
  if (prefetchedVideos) {
    videos = prefetchedVideos.filter((v: any) => v.created_turn < currentTurn && v.last_accrued_turn < currentTurn);
  } else {
    const { data, error } = await supabaseAdmin
      .from('vidwave_video_state')
      .select('*')
      .eq('artist_id', player.id)
      .lt('created_turn', currentTurn)
      .lt('last_accrued_turn', currentTurn);
    if (error) return result;
    videos = data;
  }

  if (!videos || videos.length === 0) return result;

  const postIds = videos.map((v: any) => v.post_id).filter(Boolean);

  // Load collaboration_artist_id for collab revenue split
  const { data: collabRows } = await supabaseAdmin
    .from('social_posts')
    .select('id, collaboration_artist_id')
    .in('id', postIds.length > 0 ? postIds : ['00000000-0000-0000-0000-000000000000'])
    .not('collaboration_artist_id', 'is', null);
  const collabByPostId = new Map<string, string>(
    (collabRows || []).filter((r: any) => r.collaboration_artist_id).map((r: any) => [r.id, r.collaboration_artist_id])
  );
  const minStartTurn = videos.reduce((min: number, v: any) => {
    const start = N(v.last_accrued_turn) + 1;
    return min === 0 ? start : Math.min(min, start);
  }, 0);

  const { data: existingFollowerRows } = await supabaseAdmin
    .from('vidwave_ad_revenue_log')
    .select('post_id, global_turn_id, metadata')
    .eq('player_id', player.id)
    .in('post_id', postIds.length > 0 ? postIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('global_turn_id', minStartTurn)
    .lte('global_turn_id', currentTurn);

  const existingFollowerByKey = new Map<string, number>();
  for (const row of existingFollowerRows || []) {
    const key = `${row.post_id}:${row.global_turn_id}`;
    const logged = Number(row?.metadata?.follower_delta);
    if (Number.isFinite(logged) && logged >= 0) {
      existingFollowerByKey.set(key, Math.floor(logged));
    }
  }
  const { data: sponsoredRows } = await supabaseAdmin
    .from('sponsored_content')
    .select('content_id, contract_id')
    .eq('platform', 'vidwave')
    .in('content_id', postIds.length > 0 ? postIds : ['00000000-0000-0000-0000-000000000000']);

  const contractIds = (sponsoredRows || []).map((r: any) => r.contract_id).filter(Boolean);
  let contractRows: any[] | null = null;
  const prefetchedContracts = prefetchData?.brandDealContractsByPlayer?.get(player.id);
  if (prefetchedContracts && contractIds.length > 0) {
    const contractIdSet = new Set(contractIds);
    contractRows = prefetchedContracts.filter((c: any) => contractIdSet.has(c.id));
  } else if (contractIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('brand_deal_contracts')
      .select('id, status, platform_scope, start_turn_id, end_turn_id, tier, category, persona_fit_score')
      .in('id', contractIds);
    contractRows = data;
  }

  const sponsoredByPost = new Map<string, any>();
  const contractById = new Map((contractRows || []).map((c: any) => [c.id, c]));
  for (const row of sponsoredRows || []) {
    const contract = contractById.get(row.contract_id);
    if (contract) sponsoredByPost.set(row.content_id, contract);
  }

  const scopeIncludesVidWave = (scope: any) => {
    if (Array.isArray(scope)) return scope.includes('vidwave') || scope.includes('cross_platform');
    if (typeof scope === 'string') return scope === 'vidwave' || scope === 'cross_platform';
    return false;
  };

  const playerFollowers = N(player.followers);

  for (const video of videos) {
    const earningWindow = video.earning_window || 6;
    const curve = video.curve || {};
    const weights: number[] = curve.weights || [0.30, 0.22, 0.16, 0.12, 0.10, 0.10];
    const viewRate = clamp(N(curve.view_rate || 0.6), 0.2, 0.95);
    const cLikeRate = clamp(N(curve.like_rate || 0.05), 0.005, 0.25);
    const cCommentRate = clamp(N(curve.comment_rate || 0.01), 0.001, 0.08);
    const cShareRate = clamp(N(curve.share_rate || 0.003), 0.0001, 0.05);

    let videoRevenue = 0;
    let videoFollowerGain = 0;
    let videoImpressions = 0;
    let videoViews = 0;
    let videoLikes = 0;
    let videoComments = 0;
    let videoShares = 0;
    let videoSponsoredBoostRevenue = 0;

    // Accrue each missing turn within the earning window
    const startTurn = N(video.last_accrued_turn) + 1;
    const endTurn = Math.min(currentTurn, N(video.created_turn) + earningWindow);

    if (startTurn > endTurn) continue;

    for (let t = startTurn; t <= endTurn; t++) {
      const turnIndex = t - N(video.created_turn) - 1;
      if (turnIndex < 0 || turnIndex >= weights.length) continue;

      const weight = weights[turnIndex];

      const remainingImpressions = N(video.expected_total_impressions) - N(video.lifetime_impressions) - videoImpressions;
      let baseImpressionsDelta = Math.round(N(video.expected_total_impressions) * weight);
      baseImpressionsDelta = Math.min(baseImpressionsDelta, Math.max(0, remainingImpressions));

      const remainingRevenue = N(video.expected_total_ad_revenue) - N(video.lifetime_ad_revenue) - videoRevenue;
      let baseRevenueDelta = Math.round(N(video.expected_total_ad_revenue) * weight * 100) / 100;
      baseRevenueDelta = Math.min(baseRevenueDelta, Math.max(0, remainingRevenue));

      const baseCpm = baseImpressionsDelta > 0
        ? Math.round((baseRevenueDelta / (baseImpressionsDelta / 1000)) * 100) / 100
        : 0;

      const contract = sponsoredByPost.get(video.post_id);
      const isActiveSponsored = Boolean(
        contract &&
        contract.status === 'active' &&
        scopeIncludesVidWave(contract.platform_scope) &&
        t >= N(contract.start_turn_id) &&
        t <= N(contract.end_turn_id)
      );

      let boostedImpressionsDelta = baseImpressionsDelta;
      let boostedCpm = baseCpm;
      let boostedRevenueDelta = baseRevenueDelta;
      let boostMeta: any = null;

      if (isActiveSponsored && baseImpressionsDelta > 0) {
        const isCrossPlatformContract = Array.isArray(contract.platform_scope)
          ? contract.platform_scope.includes('cross_platform')
          : contract.platform_scope === 'cross_platform';

        const boost = computeSponsoredBoost({
          contractTier: contract.tier,
          contractCategory: contract.category,
          personaFitScore: contract.persona_fit_score ?? 0.5,
          videoAgeTurns: turnIndex,
          isCrossPlatform: isCrossPlatformContract,
          baseImpressions: baseImpressionsDelta,
          baseCpm,
        });

        boostedImpressionsDelta = boost.boostedImpressions;
        boostedCpm = boost.boostedCpm;
        boostedRevenueDelta = Math.round((boostedImpressionsDelta / 1000) * boostedCpm * 100) / 100;
        videoSponsoredBoostRevenue += Math.max(0, boostedRevenueDelta - baseRevenueDelta);
        result.totalSponsoredBoostRevenue += Math.max(0, boostedRevenueDelta - baseRevenueDelta);
        boostMeta = boost;
      }

      boostedImpressionsDelta = Math.min(boostedImpressionsDelta, SOCIAL_VIRAL_CAPS.payoutImpressionsPerTurnByPost);
      const viewsDelta = Math.min(Math.floor(boostedImpressionsDelta * viewRate), SOCIAL_VIRAL_CAPS.payoutViewsPerTurnByPost);
      const likesDelta = Math.floor(viewsDelta * cLikeRate);
      const commentsDelta = Math.floor(viewsDelta * cCommentRate);
      const sharesDelta = Math.floor(viewsDelta * cShareRate);

      const logKey = `${video.post_id}:${t}`;
      const existingFollowerDelta = existingFollowerByKey.get(logKey);

      let followerDelta = 0;
      let followerBreakdown: any = null;

      if (Number.isFinite(existingFollowerDelta as number)) {
        followerDelta = Math.max(0, Math.floor(Number(existingFollowerDelta) || 0));
      } else {
        const productionTier = Number(video?.metadata?.production_tier ?? 0);
        const contentQuality = Math.max(0.5, Math.min(1.0, 0.5 + productionTier * 0.125));

        const followerResult = computeVidWaveFollowerTrickle({
          viewsThisTurn: viewsDelta,
          videoAgeTurns: turnIndex,
          currentFollowers: playerFollowers,
          contentQuality,
          personaFitScore: contract?.persona_fit_score ?? 0.5,
          isSponsored: isActiveSponsored,
        });

        followerDelta = followerResult.followerDelta;
        followerBreakdown = followerResult.breakdown;
      }

      videoImpressions += boostedImpressionsDelta;
      videoViews += viewsDelta;
      videoLikes += likesDelta;
      videoComments += commentsDelta;
      videoShares += sharesDelta;
      const remainingPerVideoRevenueCap = Math.max(0, SOCIAL_VIRAL_CAPS.payoutRevenuePerTurnByPost - videoRevenue);
      const remainingPerPlayerRevenueCap = Math.max(0, SOCIAL_VIRAL_CAPS.payoutRevenuePerTurnByPlayer - result.totalRevenue);
      const cappedRevenueDelta = Math.min(boostedRevenueDelta, remainingPerVideoRevenueCap, remainingPerPlayerRevenueCap);

      videoRevenue += cappedRevenueDelta;
      videoFollowerGain += followerDelta;

      result.adRevenueLogEntries.push({
        global_turn_id: t,
        player_id: player.id,
        post_id: video.post_id,
        ad_revenue: cappedRevenueDelta,
        impressions: boostedImpressionsDelta,
        cpm_rate: boostedCpm,
        monetized: cappedRevenueDelta > 0,
        revenue_tier: cappedRevenueDelta >= 100 ? 'diamond' : cappedRevenueDelta >= 50 ? 'platinum' : cappedRevenueDelta >= 25 ? 'gold' : cappedRevenueDelta >= 10 ? 'silver' : 'bronze',
        metadata: {
          turn_index: turnIndex,
          weight,
          views_delta: viewsDelta,
          sponsored: isActiveSponsored,
          contract_id: contract?.id || null,
          follower_delta: followerDelta,
          follower_breakdown: followerBreakdown,
          base_impressions: baseImpressionsDelta,
          boosted_impressions: boostedImpressionsDelta,
          base_cpm: baseCpm,
          boosted_cpm: boostedCpm,
          base_revenue: baseRevenueDelta,
          boosted_revenue: cappedRevenueDelta,
          sponsored_boost_revenue: Math.max(0, cappedRevenueDelta - baseRevenueDelta),
          cap_hit: cappedRevenueDelta < boostedRevenueDelta || boostedImpressionsDelta >= SOCIAL_VIRAL_CAPS.payoutImpressionsPerTurnByPost || viewsDelta >= SOCIAL_VIRAL_CAPS.payoutViewsPerTurnByPost,
          cap_name: cappedRevenueDelta < boostedRevenueDelta
            ? (remainingPerPlayerRevenueCap <= remainingPerVideoRevenueCap ? 'vidwave_player_revenue_per_turn' : 'vidwave_post_revenue_per_turn')
            : (boostedImpressionsDelta >= SOCIAL_VIRAL_CAPS.payoutImpressionsPerTurnByPost ? 'vidwave_post_impressions_per_turn' : (viewsDelta >= SOCIAL_VIRAL_CAPS.payoutViewsPerTurnByPost ? 'vidwave_post_views_per_turn' : null)),
          final_applied_deltas: {
            impressions_delta: boostedImpressionsDelta,
            views_delta: viewsDelta,
            revenue_delta: cappedRevenueDelta,
            follower_delta: followerDelta,
          },
          multipliers_applied: {
            weight,
            sponsored_impressions_mult: boostMeta?.impressionsMultiplier ?? 1,
            sponsored_cpm_mult: boostMeta?.cpmMultiplier ?? 1,
          },
          final_multiplier: Math.round(((boostMeta?.impressionsMultiplier ?? 1) * (boostMeta?.cpmMultiplier ?? 1)) * 1000) / 1000,
          boost_multipliers: boostMeta ? {
            impressions: boostMeta.impressionsMultiplier,
            cpm: boostMeta.cpmMultiplier,
          } : null,
        }
      });
    }

    if (videoRevenue <= 0 && videoImpressions <= 0) continue;

    const newLifetimeImpressions = N(video.lifetime_impressions) + videoImpressions;
    const newLifetimeAdRevenue = N(video.lifetime_ad_revenue) + videoRevenue;
    const newLifetimeFollowerGain = N(video.lifetime_follower_gain) + videoFollowerGain;
    const newLifetimeViews = N(video.lifetime_views) + videoViews;
    const newLifetimeLikes = N(video.lifetime_likes) + videoLikes;
    const newLifetimeComments = N(video.lifetime_comments) + videoComments;
    const newLifetimeShares = N(video.lifetime_shares) + videoShares;

    if (!stageOnly) {
      await supabaseAdmin.from('vidwave_video_state').update({
        last_accrued_turn: endTurn,
        lifetime_impressions: newLifetimeImpressions,
        lifetime_ad_revenue: newLifetimeAdRevenue,
        lifetime_follower_gain: newLifetimeFollowerGain,
        lifetime_views: newLifetimeViews,
        lifetime_likes: newLifetimeLikes,
        lifetime_comments: newLifetimeComments,
        lifetime_shares: newLifetimeShares
      }).eq('post_id', video.post_id);

      await supabaseAdmin.from('social_posts').update({
        views: newLifetimeViews,
        likes: newLifetimeLikes,
        comments: newLifetimeComments,
        shares: newLifetimeShares,
        revenue: newLifetimeAdRevenue
      }).eq('id', video.post_id);
    }

    result.totalRevenue += videoRevenue;
    result.totalFollowerGain += videoFollowerGain;
    result.videosAccrued++;

    // ── Collab revenue split (70/30) ──────────────────────────────────────────
    // If this video has a collaboration_artist_id, credit 30% of revenue to them
    if (!stageOnly && videoRevenue > 0) {
      const collabArtistId = collabByPostId.get(video.post_id);
      if (collabArtistId) {
        const collabShare = Math.floor(videoRevenue * 0.3 * 100) / 100;
        try {
          const { data: collabProfile } = await supabaseAdmin
            .from('profiles')
            .select('income')
            .eq('id', collabArtistId)
            .single();
          if (collabProfile) {
            await supabaseAdmin.from('profiles')
              .update({ income: N((collabProfile as any).income) + collabShare })
              .eq('id', collabArtistId);
          }
        } catch (collabRevErr: any) {
          console.warn('[SocialMedia] Collab revenue credit failed (non-fatal):', collabRevErr.message);
        }
      }
    }

    result.perVideoBreakdown.push({
      post_id: video.post_id,
      revenue: videoRevenue,
      impressions: videoImpressions,
      views: videoViews,
      follower_gain: videoFollowerGain,
      sponsored_boost_revenue: videoSponsoredBoostRevenue,
      turns_accrued: endTurn - startTurn + 1
    });
  }

  return result;
}

/**
 * INSTAVIBE ENGAGEMENT GROWTH
 * Each turn, grow like_count and comment_count on published instavibe posts.
 * Instagram-style tapering decay: posts get heavy engagement in the first few
 * turns after posting, then taper off exponentially (like real Instagram).
 *
 * Decay formula: multiplier = base * exp(-k * ageTurns)
 *   - Age 0-2 turns: high burst (0.8-1.0x of followers)
 *   - Age 3-7 turns: tapering (0.3-0.5x)
 *   - Age 8-20 turns: slow trickle (0.05-0.15x)
 *   - Age 20+ turns: near-zero (0.01x)
 */
async function growInstaVibeEngagement(entities: any, player: any, globalTurnId: number, random: () => number) {
  const posts = await entities.SocialPost.filter({
    artist_id: player.id,
    platform: 'instavibe',
    status: 'published',
  });

  if (!posts || posts.length === 0) return;

  const hype = N(player.hype);
  const followers = N(player.followers);
  // Base engagement pool scales with followers and hype
  const baseEngagementPool = Math.max(10, followers * 0.002 + hype * 0.5);

  for (const post of posts) {
    // Estimate post age in turns (approximate: 1 turn ≈ 1 in-game day)
    const postedAt = post.created_at ? new Date(post.created_at).getTime() : Date.now();
    const ageMs = Date.now() - postedAt;
    const ageTurns = Math.max(0, Math.floor(ageMs / (3600 * 1000))); // 1 turn = 1 real hour

    // Tapering decay: Instagram-style engagement curve
    // k=0.18 gives ~50% drop by turn 4, ~10% by turn 13
    const decayMult = Math.exp(-0.18 * ageTurns);
    if (decayMult < 0.005) continue; // Effectively zero — skip very old posts

    // Randomize per-post so not all posts grow identically
    const rngVal = 0.4 + random() * 0.6;
    const likeGain = Math.floor(baseEngagementPool * decayMult * rngVal);
    const commentGain = Math.floor(likeGain * (0.05 + random() * 0.08)); // ~5-13% of likes

    if (likeGain <= 0 && commentGain <= 0) continue;

    const newLikeCount = N(post.like_count) + likeGain;
    const newCommentCount = N(post.comment_count) + commentGain;

    await entities.SocialPost.update(post.id, {
      like_count: newLikeCount,
      comment_count: newCommentCount,
    });
  }
}

/**
 * LOOPTOK ENGAGEMENT ACCRUAL
 * Each turn, trickle likes and comments onto published LoopTok posts.
 * LoopTok decays faster than InstaVibe (shorter attention spans, faster feed).
 * Base is views-driven (0.1% of views per turn) rather than follower-driven.
 *
 * Only runs on posts < 30 turns old. Adds 0.1-0.3% of views as new likes per turn,
 * with a comment rate of ~5-10% of new likes.
 */
async function growLoopTokEngagement(entities: any, player: any, globalTurnId: number, random: () => number) {
  const posts = await entities.SocialPost.filter({
    artist_id: player.id,
    platform: 'looptok',
    status: 'published',
  });

  if (!posts || posts.length === 0) return;

  for (const post of posts) {
    const views = N(post.views);
    if (views <= 0) continue;

    // Estimate post age in turns (1 real hour ≈ 1 turn)
    const postedAt = post.created_at ? new Date(post.created_at).getTime() : Date.now();
    const ageTurns = Math.max(0, Math.floor((Date.now() - postedAt) / (3600 * 1000)));

    // Only accrue on posts < 30 turns old
    if (ageTurns >= 30) continue;

    // LoopTok decays faster: k=0.25 → ~50% drop by turn 3, near-zero by turn 18
    const decayMult = Math.exp(-0.25 * ageTurns);
    if (decayMult < 0.005) continue;

    // 0.1–0.3% of views per turn, decayed by age
    const likeRate = 0.001 + random() * 0.002; // 0.1-0.3%
    const likeGain = Math.floor(views * likeRate * decayMult);
    const commentGain = Math.floor(likeGain * (0.05 + random() * 0.05)); // 5-10% of likes

    if (likeGain <= 0 && commentGain <= 0) continue;

    await entities.SocialPost.update(post.id, {
      likes: N(post.likes) + likeGain,
      comments: N(post.comments) + commentGain,
    });
  }
}

/**
 * BEEF-SUBTWEET AUTO-WRITER
 *
 * When a player is in an active beef, probabilistically creates an organic
 * "subtweet" post on Xpress targeting the rival. This feeds the
 * controversyTickModule (order 4.55), which queries:
 *   social_posts WHERE artist_id = player AND subtweet_target_id IS NOT NULL
 *
 * Posts are committed in PHASE B. The controversy tick reads them the NEXT turn
 * (expected 1-turn lag — by design given the staging architecture).
 *
 * Probability is mood-gated:
 *   - beef_season: 30%    - messy: 15%    - other: 4%
 */
async function generateBeefSubtweet(
  player: any,
  algorithmMood: string,
  random: () => number,
  globalTurnId: number
): Promise<any[]> {
  try {
    const moodChance = algorithmMood === 'beef_season' ? 0.30
      : algorithmMood === 'messy' ? 0.15
      : 0.04;
    if (random() > moodChance) return [];

    const { data: activeBeefs } = await supabaseAdmin
      .from('beefs')
      .select('id, aggressor_id, target_id, severity, status')
      .or(`aggressor_id.eq.${player.id},target_id.eq.${player.id}`)
      .eq('status', 'active')
      .limit(1);

    if (!activeBeefs?.length) return [];

    const beef = activeBeefs[0];
    const rivalId = beef.aggressor_id === player.id ? beef.target_id : beef.aggressor_id;
    if (!rivalId) return [];

    const dissTemplates = [
      'Some people really show their true colors when things get tough...',
      'Not gonna name names but we all know who moved different.',
      "Character is what you do when nobody's watching.",
      "Receipts don't lie. Just saying.",
      'Stay humble or get humbled.',
      "The music always tells the truth even when people don't.",
      'Actions speak. And yours are very loud.',
      "Some of y'all need to sit with that energy you bring.",
    ];
    const caption = dissTemplates[Math.floor(random() * dissTemplates.length)];
    const baseFollowers = N(player.fans ?? player.followers);

    return [{
      artist_id: player.id,
      platform: 'xpress',
      post_type: 'text',
      title: caption.substring(0, 60),
      caption,
      views: Math.floor(100 + baseFollowers * 0.03),
      likes: 0,
      comments: 0,
      shares: 0,
      engagement_rate: 0,
      revenue: 0,
      energy_cost: 0,
      status: 'published',
      subtweet_target_id: rivalId,
      alignment_tag: 'diss',
      metadata: {
        is_auto_generated: true,
        beef_id: beef.id,
        beef_severity: N(beef.severity),
        auto_subtweet: true,
        turn_id: globalTurnId,
      },
    }];
  } catch (err: any) {
    console.error('[socialMediaModule] Beef subtweet error (non-fatal):', err.message);
    return [];
  }
}

/**
 * AUTO-GENERATE REACTION VIDEOS
 * When a player uploads an official Music Video, NPC reaction channels
 * create reaction videos the next turn. Reactions reference the original post
 * and generate their own views/engagement based on the original's performance.
 *
 * FREQUENCY: Only runs 30% of the time (roughly weekly instead of daily)
 * to prevent overwhelming the feed with NPC content.
 */
export async function generateReactionVideosForPlayer(entities: any, player: any, turnId: number, random: () => number = Math.random, runawaySong: any = null) {
  const postsToCreate: any[] = [];

  // Only generate reactions 30% of the time (roughly weekly)
  // Exception: Always generate for runaway songs or viral content
  const shouldGenerate = runawaySong || (turnId % 10 < 3); // 30% chance based on turn
  if (!shouldGenerate) {
    return [];
  }

  // Find music videos posted recently that don't already have reactions
  const recentPosts = await entities.SocialPost.filter({
    artist_id: player.id,
    platform: 'vidwave'
  });

  // Filter to official music videos and live performances (check post_type and metadata.video_type)
  const musicVideos = recentPosts.filter((p: any) => {
    const vt = p.metadata?.video_type || p.post_type;
    return vt === 'music_video' || vt === 'live_performance';
  });

  if (musicVideos.length === 0) return [];

  for (const mv of musicVideos) {
    // Check if reactions already exist for this video
    const existingReactions = await entities.SocialPost.filter({
      reacting_to_post_id: mv.id
    });
    
    // Skip if we already have enough reactions (limit is now dynamic, but hard cap at 4 to prevent infinite loop if we re-run)
    if (existingReactions.length >= 4) continue; 
    if (existingReactions.length > 0) continue; // Partial — skip to avoid duplicates

    // Determine context
    const mvViews = N(mv.views);
    const hype = N(player.hype);
    const isRunaway = runawaySong?.songId && (mv.metadata?.linked_release_id === runawaySong.songId);
    const isViral = mvViews > 100000 || hype > 80;

    // Determine number of reactions (1-2 normally, 3-4 if viral/runaway)
    let reactionCount = 1 + (turnId % 2); // 1 or 2
    if (isRunaway) reactionCount = 3 + (turnId % 2); // 3 or 4
    else if (isViral) reactionCount = 2 + (turnId % 2); // 2 or 3

    // Pick random channels using turnId as seed for variety
    const channels = pickReactionChannels(reactionCount, turnId + (mv.id?.charCodeAt?.(0) || 0), isViral, isRunaway);
    const artistName = player.artist_name || 'Unknown Artist';
    const mvTitle = mv.title || 'Music Video';

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const reactionTitle = generateReactionTitle(ch, artistName, mvTitle, i);

      // Generate AI thumbnail (async)
      let thumbnailUrl;
      try {
        thumbnailUrl = await generateReactionThumbnail(reactionTitle, artistName, ch, isViral || !!ch.isCelebrity);
      } catch (error) {
        console.warn('[socialMediaModule] AI thumbnail generation failed, using fallback:', error);
        // Fallback to procedural generation
        thumbnailUrl = generateProceduralReactionThumbnail(reactionTitle, artistName, ch, isViral || !!ch.isCelebrity);
      }

      // Reaction views scale off original MV views + channel multiplier
      // Celebrities get HUGE multipliers
      const baseReactionViews = Math.floor(mvViews * 0.05 * ch.viewMult * (0.6 + random() * 0.8));
      const reactionViews = Math.max(500, baseReactionViews);
      
      const likes = Math.floor(reactionViews * (0.03 + random() * 0.04));
      const comments = Math.floor(likes * (0.1 + random() * 0.1));
      const shares = Math.floor(likes * 0.03);

      postsToCreate.push({
        // NPC reactions should NOT be attributed to the player
        artist_id: null, // Not a player post
        source_type: 'npc_reaction', // Clearly mark as NPC content
        platform: 'vidwave',
        post_type: 'video',
        title: reactionTitle,
        caption: `${ch.icon} ${ch.tagline}`,
        thumbnail_url: thumbnailUrl,
        reacting_to_post_id: mv.id,
        views: reactionViews,
        likes,
        comments,
        shares,
        saves: Math.floor(likes * 0.05),
        engagement_rate: Math.floor((likes + comments + shares) / reactionViews * 1000) / 10,
        revenue: 0,
        is_viral: isViral || ch.isCelebrity,
        viral_multiplier: ch.viewMult,
        status: 'published',
        energy_cost: 0,
        is_ai_generated: true,
        metadata: {
          video_type: 'reaction',
          pillar_type: 'reactions',
          is_npc_reaction: true,
          is_npc: true,
          posted_by_outlet: true,
          about_artist_id: player.id, // The artist being reacted TO
          reaction_channel: ch.id,
          reaction_channel_name: ch.name,
          reaction_channel_icon: ch.icon,
          reaction_sentiment: ch.sentiment,
          thumbnail_overlay: ch.overlay || '👀',
          original_video_title: mvTitle,
          is_celebrity: !!ch.isCelebrity,
          npc_username: ch.name, // Use channel name as username
          npc_handle: `@${ch.id.replace(/_/g, '')}` // Generate handle from channel ID
        }
      });
    }
  }

  return postsToCreate;
}
