/**
 * RUNAWAY SONG MECHANIC - For those "lightning in a bottle" moments
 * 
 * When a song massively outperforms expectations, it becomes a "runaway hit"
 * This triggers massive cascading effects across ALL systems:
 * - Streams multiply across all platforms
 * - Follower growth explodes
 * - Physical sales surge
 * - Social media posts referencing the song get viral boosts
 * - BUT... creates high risk of being a "one-hit wonder"
 */

import { LIFECYCLE_STREAM_MULTIPLIERS, PLAYLIST_BOOST } from './economyMath.ts';

// A runaway hit exceeds expectations by this multiplier
const RUNAWAY_THRESHOLD_MULTIPLIER = 3; // 3x expected performance = runaway (more achievable)

// How long runaway effects last (in turns) - 7 days with rapid decay
const RUNAWAY_DURATION = 14; // ~1 week of boosted performance

// Risk factors for becoming a one-hit wonder
const ONE_HIT_RISK_BASE = 0.3; // 30% base chance after runaway
const ONE_HIT_RISK_DECAY = 0.1; // Risk decreases 10% per turn after peak

/**
 * Detect if a release has become a runaway hit
 */
export function detectRunawayHit(release: any, expectedStreams: number, actualStreams: number): any {
  if (!release || actualStreams < 5000) return null;
  
  // Only detect runaway on Hot releases — accumulated historical streams on Stable/Declining
  // releases are NOT runaway events, they're just successful back-catalog.
  if (release.lifecycle_state !== 'Hot') return null;

  // Compare only the per-turn streams delta, not lifetime total.
  // actualStreams here is the per-turn streams value passed from the caller.
  const multiplier = actualStreams / Math.max(expectedStreams, 1);
  
  if (multiplier >= RUNAWAY_THRESHOLD_MULTIPLIER) {
    return {
      isRunaway: true,
      multiplier: Math.min(multiplier, 10),
      strength: Math.min(multiplier / RUNAWAY_THRESHOLD_MULTIPLIER, 1.5),
      detectedTurn: release.lifecycle_state_changed_turn || release.scheduled_turn || 0
    };
  }
  
  return null;
}

/**
 * Apply runaway effects to stream calculations
 */
export function applyRunawayStreamMultiplier(baseStreams: number, runawayData: any, turnsSinceDetected: number): number {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseStreams;
  
  // Rapid decay - strong initial boost that drops quickly
  const decayFactor = Math.max(0.1, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.9);
  const runawayMultiplier = 1 + (runawayData.strength * 1.5 * decayFactor); // Max 4x boost, decays fast
  
  return Math.floor(baseStreams * runawayMultiplier);
}

/**
 * Apply runaway effects to revenue calculations
 */
export function applyRunawayRevenueMultiplier(baseRevenue: number, runawayData: any, turnsSinceDetected: number): number {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseRevenue;
  
  // Revenue gets good boost but not insane
  const decayFactor = Math.max(0.2, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.8);
  const revenueMultiplier = 1 + (runawayData.strength * 3.5 * decayFactor); // Max 8x boost
  
  return Math.floor(baseRevenue * revenueMultiplier);
}

/**
 * Apply runaway effects to follower growth
 */
export function applyRunawayFollowerBoost(baseFollowerGrowth: number, runawayData: any, turnsSinceDetected: number): number {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseFollowerGrowth;
  
  // Follower growth gets good boost but not insane
  const decayFactor = Math.max(0.15, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.85);
  const followerMultiplier = 1 + (runawayData.strength * 2.5 * decayFactor); // Max 6x boost
  
  return Math.floor(baseFollowerGrowth * followerMultiplier);
}

/**
 * Apply runaway effects to physical media sales
 */
export function applyRunawayPhysicalBoost(basePhysicalSales: number, runawayData: any, turnsSinceDetected: number): number {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return basePhysicalSales;
  
  // Physical sales get good boost but not insane
  const decayFactor = Math.max(0.25, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.75);
  const physicalMultiplier = 1 + (runawayData.strength * 2 * decayFactor); // Max 5x boost
  
  return Math.floor(basePhysicalSales * physicalMultiplier);
}

/**
 * Boost social media posts that reference the runaway song
 */
export function applyRunawaySocialBoost(baseMetrics: any, socialPost: any, runawayData: any, turnsSinceDetected: number): any {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseMetrics;
  
  // Check if post references the runaway song
  const referencesSong = socialPost.title?.includes(runawayData.releaseTitle) ||
                        socialPost.caption?.includes(runawayData.releaseTitle) ||
                        socialPost.metadata?.linked_release_id === runawayData.releaseId;
  
  if (!referencesSong) return baseMetrics;
  
  // Social posts about the runaway song get good viral boost
  const decayFactor = Math.max(0.15, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.85);
  const socialMultiplier = 1 + (runawayData.strength * 3.5 * decayFactor); // Max 8x boost
  
  return {
    ...baseMetrics,
    views: Math.floor(baseMetrics.views * socialMultiplier),
    likes: Math.floor(baseMetrics.likes * socialMultiplier * 1.5), // Likes get extra boost
    comments: Math.floor(baseMetrics.comments * socialMultiplier * 2), // Comments explode
    shares: Math.floor(baseMetrics.shares * socialMultiplier * 3), // Shares go viral
  };
}

/**
 * Apply runaway effects to generic platform metrics (passive growth/revenue)
 */
export function applyRunawayPlatformBoost(baseMetrics: any, runawayData: any, turnsSinceDetected: number): any {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseMetrics;
  
  // specific decay factor for platform-wide metrics
  const decayFactor = Math.max(0.15, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.85);
  const platformMultiplier = 1 + (runawayData.strength * 2.0 * decayFactor); // Good boost (max ~5x)
  
  return {
    ...baseMetrics,
    followerGrowth: Math.floor((baseMetrics.followerGrowth || 0) * platformMultiplier),
    passiveViews: Math.floor((baseMetrics.passiveViews || 0) * platformMultiplier),
    revenue: (baseMetrics.revenue || 0) * platformMultiplier
  };
}

/**
 * Calculate one-hit wonder risk after runaway success
 */
export function calculateOneHitWonderRisk(runawayData: any, turnsSinceDetected: number, eraContext: any): number {
  if (!runawayData) return 0;
  
  // Base risk starts high, decays over time
  const timeDecay = Math.max(0, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.5);
  let risk = ONE_HIT_RISK_BASE * timeDecay;
  
  // If current era is underperforming compared to runaway, risk increases
  const eraPerformance = typeof eraContext === 'number' ? eraContext : (eraContext?.performance ?? 0.5);
  if (eraPerformance < 0.5) { // Era performing at less than 50% of runaway's success
    risk += 0.4; // Add 40% risk
  }
  
  // If artist hasn't released follow-up content, risk increases
  const hasNewRelease = typeof eraContext === 'object' ? eraContext?.hasNewRelease : false;
  if (turnsSinceDetected > 7 && !hasNewRelease) {
    risk += 0.3; // Add 30% risk
  }
  
  return Math.min(0.95, risk); // Cap at 95% risk
}

/**
 * Update era tension based on runaway pressure
 */
export function applyRunawayEraPressure(baseTension: number, runawayData: any, turnsSinceDetected: number): number {
  if (!runawayData || turnsSinceDetected > RUNAWAY_DURATION) return baseTension;
  
  // Massive pressure to follow up success
  const pressureFactor = Math.max(0, 1 - (turnsSinceDetected / RUNAWAY_DURATION));
  const tensionIncrease = runawayData.strength * 15 * pressureFactor; // Up to 75 tension
  
  return Math.min(100, baseTension + tensionIncrease);
}

/**
 * Generate notifications for runaway moments
 */
export function generateRunawayNotifications(player: any, runawayData: any, entities: any): any[] {
  if (!runawayData) return [];
  
  const notifications = [];
  
  // Initial breakout notification
  if (runawayData.isNewlyDetected) {
    notifications.push({
      player_id: player.id,
      type: 'BREAKOUT_HIT',
      title: '🚀 BREAKOUT HIT!',
      subtitle: `"${runawayData.releaseTitle}" is exploding!`,
      body: `Your song is performing ${Math.floor(runawayData.multiplier)}x better than expected. This is a career-defining moment!`,
      metrics: { 
        streams: runawayData.actualStreams,
        multiplier: runawayData.multiplier,
        release_title: runawayData.releaseTitle,
        revenue_boost: 'INSANE REVENUE GAINS!'
      },
      deep_links: [{ label: 'View Release', route: 'Career', params: { openApp: 'releases' } }],
      is_read: false,
      priority: 'critical'
    });
  }
  
  // One-hit wonder warning
  const oneHitRisk = calculateOneHitWonderRisk(runawayData, runawayData.turnsSinceDetected, { hasNewRelease: false });
  if (oneHitRisk > 0.6) {
    notifications.push({
      player_id: player.id,
      type: 'ONE_HIT_WARNING',
      title: '⚠️ One-Hit Wonder Risk',
      subtitle: 'The pressure is on to follow up this success',
      body: `The industry is watching. Can you deliver another hit, or will this be your only moment in the spotlight?`,
      metrics: { risk: Math.floor(oneHitRisk * 100) },
      deep_links: [{ label: 'Plan Next Release', route: 'Career', params: { openApp: 'era' } }],
      is_read: false,
      priority: 'high'
    });
  }
  
  return notifications;
}

/**
 * Main entry point - process runaway song mechanics
 */
export async function processRunawaySongMechanic(player: any, releases: any[], eraData: any, globalTurnId: number, entities: any) {
  const results: any = {
    hasRunaway: false,
    runawayData: null as any,
    streamMultiplier: 1,
    followerMultiplier: 1,
    physicalMultiplier: 1,
    revenueMultiplier: 1,
    eraTensionIncrease: 0,
    oneHitRisk: 0,
    notifications: [] as any[]
  };
  
  // Find the most recent release
  const latestRelease = releases?.[0];
  if (!latestRelease) return results;
  
  // Calculate expected vs actual per-turn streams (NOT lifetime total)
  // Lifetime streams accumulate over many turns and would always trigger runaway for successful artists.
  // We compare per-turn stream rate: lifetime / max(turns_active, 1)
  // Use fans ?? followers to match the dual-field naming convention used throughout the engine
  const expectedStreams = 5000 + Math.pow(player.fans || player.followers || 0, 0.8) * 2;
  const turnsActive = Math.max(1, latestRelease.lifecycle_state_changed_turn
    ? globalTurnId - (latestRelease.lifecycle_state_changed_turn || globalTurnId)
    : 1);
  const perTurnStreams = Math.floor((latestRelease.lifetime_streams || 0) / turnsActive);
  
  // Check for runaway hit using per-turn rate
  const runawayData = detectRunawayHit(latestRelease, expectedStreams, perTurnStreams);
  if (!runawayData) return results;
  
  // Calculate turns since detection
  const turnsSinceDetected = globalTurnId - runawayData.detectedTurn;
  
  // Apply all runaway effects
  results.hasRunaway = true;
  results.runawayData = {
    ...runawayData,
    releaseTitle: latestRelease.release_name,
    releaseId: latestRelease.id,
    actualStreams: perTurnStreams,
    turnsSinceDetected: turnsSinceDetected,
    isNewlyDetected: turnsSinceDetected === 0
  };
  
  results.streamMultiplier = Math.min(4, 1 + (runawayData.strength * 3 * Math.max(0.2, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.7)));
  results.followerMultiplier = Math.min(4, 1 + (runawayData.strength * 8 * Math.max(0.1, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.8)));
  results.physicalMultiplier = Math.min(4, 1 + (runawayData.strength * 5 * Math.max(0.3, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.6)));
  results.revenueMultiplier = Math.min(4, 1 + (runawayData.strength * 12 * Math.max(0.3, 1 - (turnsSinceDetected / RUNAWAY_DURATION) * 0.6)));
  results.eraTensionIncrease = runawayData.strength * 15 * Math.max(0, 1 - (turnsSinceDetected / RUNAWAY_DURATION));
  results.oneHitRisk = calculateOneHitWonderRisk(runawayData, turnsSinceDetected, eraData);
  
  // Generate notifications
  results.notifications = await generateRunawayNotifications(player, results.runawayData, entities);
  
  return results;
}
