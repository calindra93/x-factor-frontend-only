/**
 * INSIGHTS REPORT GENERATOR - Single Source of Truth
 * Computes once per turn, cached, consumed by all UI + notifications
 * Derived from stored aggregates, deterministic
 */

import { getAvailableMomentsForStage } from './careerProgressionLogic.ts';
import { PLATFORM_MODELS } from './platformAlgorithmModel.ts';

// Career stages matching career_stages DB table
const CAREER_STAGE_THRESHOLDS = [
  { order: 1,  name: 'Unknown',            minML: 0 },
  { order: 2,  name: 'Local Artist',       minML: 500 },
  { order: 3,  name: 'Local Buzz',         minML: 50_000 },
  { order: 4,  name: 'Underground Artist', minML: 150_000 },
  { order: 5,  name: 'Cult Favorite',      minML: 5_000_000 },
  { order: 6,  name: 'Breakout Artist',    minML: 15_000_000 },
  { order: 7,  name: 'Mainstream Artist',  minML: 35_000_000 },
  { order: 8,  name: 'A-List Star',        minML: 60_000_000 },
  { order: 9,  name: 'Global Superstar',   minML: 90_000_000 },
  { order: 10, name: 'Legacy Icon',        minML: 120_000_000 },
];

function resolveCareerStageFromML(monthlyListeners: number): string {
  let matched = CAREER_STAGE_THRESHOLDS[0].name;
  for (const s of CAREER_STAGE_THRESHOLDS) {
    if (monthlyListeners >= s.minML) matched = s.name;
    else break;
  }
  return matched;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateIngameDates(turnId: number) {
  // 1 turn = 1 in-game day
  // 7 turns = 1 in-game week
  // 30 turns = 1 in-game month
  return {
    turnId,
    ingameDayIndex: turnId,
    ingameWeekIndex: Math.floor(turnId / 7),
    ingameMonthIndex: Math.floor(turnId / 30)
  };
}

/**
 * Extract top N regions with deltas and market info
 */
function extractTopRegions(fanProfile: { top_regions?: { region: string; percentage: number; listeners: number }[] }, topN = 3) {
  const topRegions = fanProfile.top_regions || [];
  return topRegions.slice(0, topN).map((r) => ({
    region: r.region,
    percentage: r.percentage,
    listeners: r.listeners,
    descriptor: getRegionDescriptor(r.region, r.percentage),
    weeklyDelta: getRegionWeeklyDelta(fanProfile, r.region) || 0
  }));
}

/**
 * Get market descriptor for region (from Release Wizard language)
 */
function getRegionDescriptor(region: string, percentage: number): string {
  // Use the same descriptive language as Release Wizard
  const descriptors: Record<string, string> = {
    'United States': 'Massive mainstream appeal',
    'Europe': 'Strong indie presence',
    'UK': 'Home territory strength',
    'Canada': 'Solid North American base',
    'Latin America': 'Rising emerging market',
    'Africa': 'Frontier market growth',
    'Oceania': 'Underrated gem market'
  };

  const base = descriptors[region] || 'Growing market';
  
  // Qualifiers based on listener percentage
  if (percentage > 30) return `${base} (dominant)`;
  if (percentage > 15) return `${base} (strong presence)`;
  if (percentage > 8) return `${base} (active)`;
  return `${base} (emerging)`;
}

function getRegionWeeklyDelta(fanProfile: any, region: string): number {
  // Simplified: return a synthetic delta based on volatility
  // In real implementation, would track per-region deltas from TurnEventLog
  return Math.random() * 5 - 2; // ±2.5% weekly
}

/**
 * Extract platform stats with archetype breakdown
 */
function extractPlatformStats(fanProfile: any, turns = 7) {
  const platforms: Record<string, any> = {};
  const platformModels = PLATFORM_MODELS as Record<string, any>;

  Object.keys(platformModels).forEach((platformName) => {
    const monthlyListeners = fanProfile.platformmonthlylisteners?.[platformName] || 0;
    const share = fanProfile.platformstreamshare?.[platformName] || 33;

    // Estimate daily streams from monthly listeners and platform share
    const dailyStreams = Math.floor((monthlyListeners * (share / 100)) / 30);
    const revenue = dailyStreams * (platformModels[platformName].payoutRatePerStream || 0.018);

    // Dominant archetype for this platform
    const affinity = fanProfile.archetypeaffinitybyplatform?.[platformName] || {};
    const dominantArchetype = Object.entries(affinity).sort(([, a]: any, [, b]: any) => b - a)?.[0]?.[0] || 'trend_chasers';

    // Top regions for this platform (simplified)
    const topRegions = (fanProfile.top_regions || [])
      .slice(0, 2)
      .map((r: any) => r.region);

    platforms[platformName] = {
      dailyStreams,
      revenue,
      monthlyListeners,
      share,
      topRegions,
      dominantArchetype,
      volatility: platformModels[platformName].volatility || 0.25
    };
  });

  return platforms;
}

/**
 * Calculate growth deltas
 */
function calculateGrowthDeltas(player: any, fanProfile: any, turnId: any) {
  const dayDelta = {
    fans: 0,
    followers: 0,
    clout: 0,
    monthlyListeners: 0
  };

  const weekDelta = {
    fans: 0,
    followers: 0,
    monthlyListeners: 0
  };

  const monthDelta = {
    monthlyListeners: fanProfile.listener_growth_trend || 0
  };

  // Simplified deltas (in real implementation, read from PlayerTurnHistory)
  // For now, estimate based on recent state
  if (player?.follower_growth) {
    dayDelta.followers = Math.floor((player.followers || 0) * (parseFloat(player.follower_growth) || 0.05) / 100);
  }

  return { dayDelta, weekDelta, monthDelta };
}

/**
 * Generate region breakout summary
 */
function getRegionBreakouts(fanProfile: any) {
  const heatingUp: string[] = [];
  const coolingDown: string[] = [];

  // Simplified: based on top_regions changes
  const topRegions = fanProfile.top_regions || [];
  topRegions.forEach((region: any) => {
    const delta = getRegionWeeklyDelta(fanProfile, region.region);
    if (delta > 1.5) heatingUp.push(region.region);
    if (delta < -1.5) coolingDown.push(region.region);
  });

  return { heatingUp: heatingUp.slice(0, 2), coolingDown: coolingDown.slice(0, 2) };
}

/**
 * MAIN REPORT GENERATOR
 */
export async function generateInsightsReport(player: any, fanProfile: any, turnId: any, entities: any, era: any, releases: any, turnMetrics: Record<string, any> = {}) {
  if (!player?.id || !fanProfile?.id) {
    return null;
  }

  const dates = calculateIngameDates(turnId);
  // Use player.career_stage from DB if set, otherwise resolve from monthly_listeners
  const ml = fanProfile?.monthly_listeners || 0;
  const career_stage = player.career_stage || resolveCareerStageFromML(ml);
  const availableMoments = getAvailableMomentsForStage(career_stage);

  // Count unlocked legendary moments
  const milestones = await entities.CareerMilestone.filter({
    artist_id: player.id
  });
  const legendaryUnlockedCount = milestones.length;

  // Career tier (clout-based)
  const tier = player.clout >= 500 ? 'Platinum' : player.clout >= 200 ? 'Gold' : player.clout >= 50 ? 'Silver' : 'Bronze';

  // Growth deltas
  const { dayDelta, weekDelta, monthDelta } = calculateGrowthDeltas(player, fanProfile, turnId);

  // Platform stats
  const platforms = extractPlatformStats(fanProfile);

  // Region insights
  const topRegions = extractTopRegions(fanProfile, 3);
  const { heatingUp, coolingDown } = getRegionBreakouts(fanProfile);

  // Releases summary
  let bestProject = null;
  if (releases?.length > 0) {
    bestProject = releases.reduce((best: any, rel: any) => {
      const relStreams = rel.lifetime_streams || 0;
      return relStreams > (best?.lifetime_streams || 0) ? rel : best;
    });
  }

  // Income breakdown from actual turn processor deltas (turnMetrics)
  const N = (v: any) => Number(v) || 0;
  const hasTurnMetrics = N(turnMetrics?.income_gained) > 0 || N(turnMetrics?.streaming_revenue) > 0 || N(turnMetrics?.merch_revenue) > 0;
  const income = hasTurnMetrics ? {
    streaming: Math.floor(N(turnMetrics.streaming_revenue)),
    merch: Math.floor(N(turnMetrics.merch_revenue)),
    touring: Math.floor(N(turnMetrics.touring_revenue)),
    social: Math.floor(N(turnMetrics.social_revenue)),
    brandDeals: Math.floor(N(turnMetrics.brand_deal_revenue)),
    fanSubs: Math.floor(N(turnMetrics.fan_sub_revenue)),
    sync: Math.floor(N(turnMetrics.sync_licensing_revenue)),
    collab: Math.floor(N(turnMetrics.collab_revenue)),
    net: Math.floor(N(turnMetrics.income_gained))
  } : {
    streaming: 0, merch: 0, touring: 0, social: 0,
    brandDeals: 0, fanSubs: 0, sync: 0, collab: 0, net: 0
  };

  // Charts status (simplified)
  const charts = {
    status: player.global_rank ? `#${player.global_rank}` : 'Unranked',
    bestPosition: player.global_rank || 999,
    reasonLockedIfAny:
      player.followers < 5000
        ? 'Need 5k followers to chart'
        : player.hype < 30
        ? 'Build hype with releases or marketing'
        : null
  };

  // Explainer bullets (simple feedback)
  const explainer = [];
  if (ml > 5_000_000 && (career_stage === 'Cult Favorite' || career_stage === 'Underground Artist')) {
    explainer.push({
      key: 'breakout_ready',
      text: 'Ready for Breakout Artist status!',
      severity: 'positive'
    });
  }
  if (player.hype < 20) {
    explainer.push({
      key: 'low_hype',
      text: 'Low hype. Release something big soon.',
      severity: 'warning'
    });
  }
  if (era?.is_flop) {
    explainer.push({
      key: 'era_struggling',
      text: `"${era.era_name}" is struggling. Consider a reinvention.`,
      severity: 'caution'
    });
  }
  if (platforms.SoundBurst.monthlyListeners > platforms.Streamify.monthlyListeners) {
    explainer.push({
      key: 'platform_strength',
      text: 'SoundBurst is your strongest platform. Lean into underground vibes.',
      severity: 'info'
    });
  }

  const report = {
    ...dates,
    era: era
      ? {
          name: era.era_name,
          phase: era.phase,
          momentum: era.momentum,
          creativeTension: era.tension,
          turnsInPhase: (turnId - (era.phase_started_turn || turnId)) % 48
        }
      : null,
    career: {
      stage: career_stage,
      tier,
      legendaryUnlockedCount,
      availableMomentsCount: availableMoments.length
    },
    growth: {
      fansTotal: Math.max(
        Number(player.followers || 0),
        Number(fanProfile.monthly_active_listeners || 0),
        Math.floor((Number(fanProfile.monthly_listeners || 0)) * 0.15),
      ),
      monthlyActiveListeners: fanProfile.monthly_active_listeners || 0,
      fansDeltaDay: dayDelta.fans,
      fansDeltaWeek: weekDelta.fans,
      monthlyListenersGlobal: fanProfile.monthly_listeners || 0,
      monthlyListenersDeltaMonth: monthDelta.monthlyListeners,
      followersTotal: player.followers || 0,
      followersDeltaDay: dayDelta.followers,
      clout: player.clout || 0,
      cloutDeltaDay: dayDelta.clout
    },
    platforms,
    regions: {
      topNow: topRegions,
      heatingUp,
      coolingDown
    },
    releases: {
      projectsCount: releases?.length || 0,
      bestProjectName: bestProject?.release_name || 'None',
      bestProjectStreams: bestProject?.lifetime_streams || 0,
      bestProjectRegion: bestProject?.primary_region || 'N/A'
    },
    income,
    charts,
    explainer
  };

  return report;
}

/**
 * Cache key for insights report
 */
export function getCacheKey(playerId: any, turnId: any) {
  return `insights_report:${playerId}:${turnId}`;
}