/**
 * Platform Algorithm Model - Distinct behaviors for Streamify, AppleCore, SoundBurst
 * Deterministic, knob-based, no ML
 */

export const PLATFORM_MODELS = {
  Streamify: {
    name: 'Streamify',
    discoveryRateBase: 0.12,
    algorithmicPlaylistWeight: 0.75,
    editorialPlaylistWeight: 0.25,
    playlistBiasByGenre: {
      'Hip-Hop': 1.2,
      'Rap': 1.15,
      'Pop': 1.1,
      'Trap': 1.05
    },
    regionalPenetration: {
      'United States': 0.95,
      'Canada': 0.85,
      'Europe': 0.75,
      'Latin America': 0.65,
      'Africa': 0.55,
      'UK': 0.9,
      'Oceania': 0.7
    },
    followerToListenerMultiplier: 1.5,
    listenerToFanConversionByArchetype: {
      critics_adjacent: 0.06,
      nostalgia_seekers: 0.08,
      trend_chasers: 0.12,
      underground_purists: 0.04
    },
    payoutRatePerStream: 0.018,
    volatility: 0.25,
    description: 'Algorithmic leader, trend-friendly, high reach'
  },
  AppleCore: {
    name: 'AppleCore',
    discoveryRateBase: 0.08,
    algorithmicPlaylistWeight: 0.45,
    editorialPlaylistWeight: 0.55,
    playlistBiasByGenre: {
      'Pop': 1.25,
      'R&B': 1.15,
      'Indie': 1.1,
      'Alternative': 1.05
    },
    regionalPenetration: {
      'United States': 0.88,
      'Canada': 0.82,
      'Europe': 0.85,
      'Latin America': 0.45,
      'Africa': 0.35,
      'UK': 0.88,
      'Oceania': 0.8
    },
    followerToListenerMultiplier: 1.8,
    listenerToFanConversionByArchetype: {
      critics_adjacent: 0.11,
      nostalgia_seekers: 0.1,
      trend_chasers: 0.05,
      underground_purists: 0.04
    },
    payoutRatePerStream: 0.022,
    volatility: 0.15,
    description: 'Editorial curator, quality-focused, premium audience'
  },
  SoundBurst: {
    name: 'SoundBurst',
    discoveryRateBase: 0.15,
    algorithmicPlaylistWeight: 0.65,
    editorialPlaylistWeight: 0.35,
    playlistBiasByGenre: {
      'Indie': 1.3,
      'UK Drill': 1.25,
      'Electronic': 1.2,
      'Alternative': 1.15
    },
    regionalPenetration: {
      'United States': 0.7,
      'Canada': 0.75,
      'Europe': 0.88,
      'Latin America': 0.55,
      'Africa': 0.65,
      'UK': 0.95,
      'Oceania': 0.78
    },
    followerToListenerMultiplier: 2.2,
    listenerToFanConversionByArchetype: {
      critics_adjacent: 0.07,
      nostalgia_seekers: 0.05,
      trend_chasers: 0.08,
      underground_purists: 0.16
    },
    payoutRatePerStream: 0.016,
    volatility: 0.35,
    description: 'Independent-friendly, underground-focused, volatile discovery'
  }
};

/**
 * Calculate daily streams per platform
 * Factors: release strength, clout, discovery rate, region fit, playlist placement, archetype mix
 */
export function calculateDailyStreamsByPlatform(
  releaseData,
  platformName,
  clout,
  regionShareMap,
  archetypeMap,
  hype,
  daysElapsed
) {
  const platform = PLATFORM_MODELS[platformName];
  if (!platform) return 0;

  // Base streams from release quality + artist clout
  const qualityFactor = (releaseData?.quality || 70) / 100;
  const cloutFactor = 1 + clout / 1000;
  const hypeFactor = 1 + (hype || 30) / 100;

  // Discovery boost (early release gets higher boost)
  const discoveryDecay = Math.max(0.3, 1 - daysElapsed / 30);
  const discovery = platform.discoveryRateBase * discoveryDecay;

  // Regional penetration adjustment
  let regionalMultiplier = 0;
  Object.entries(regionShareMap || {}).forEach(([region, share]) => {
    const penetration = platform.regionalPenetration[region] || 0.5;
    regionalMultiplier += (share / 100) * penetration;
  });

  // Genre bias
  const genreBias = releaseData?.genre
    ? platform.playlistBiasByGenre[releaseData.genre] || 1.0
    : 1.0;

  // Archetype attraction to platform
  let archetypeAttraction = 0;
  Object.entries(archetypeMap || {}).forEach(([archetype, count]) => {
    const affinity = platform.listenerToFanConversionByArchetype[archetype] || 0.06;
    archetypeAttraction += (count / 100) * affinity;
  });

  // Combine factors: base * quality * clout * hype * discovery * regional * genre * archetype
  const baseStreams = 500; // Per-platform base
  const totalStreams = Math.floor(
    baseStreams * qualityFactor * cloutFactor * hypeFactor * discovery * regionalMultiplier * genreBias * (1 + archetypeAttraction)
  );

  return Math.max(10, totalStreams);
}

/**
 * Convert streams to listeners by platform and archetype
 */
export function convertStreamsToListeners(streams, platformName, archetypeDistribution) {
  const platform = PLATFORM_MODELS[platformName];
  if (!platform) return 0;

  // Base conversion: listeners = streams / avg streams per listener
  // Adjust by archetype mix
  let archetypeWeightedConversion = 0;
  Object.entries(archetypeDistribution || {}).forEach(([archetype, percentage]) => {
    const conversionRate = platform.listenerToFanConversionByArchetype[archetype] || 0.06;
    archetypeWeightedConversion += (percentage / 100) * conversionRate;
  });

  const listeners = Math.floor(streams * archetypeWeightedConversion);
  return Math.max(1, listeners);
}

/**
 * Convert listeners to followers by platform
 */
export function convertListenersToFollowers(listeners, platformName) {
  const platform = PLATFORM_MODELS[platformName];
  if (!platform) return 0;

  const followers = Math.floor(listeners / platform.followerToListenerMultiplier);
  return Math.max(0, followers);
}

/**
 * Calculate platform income from streams
 */
export function calculatePlatformRevenue(streams, platformName) {
  const platform = PLATFORM_MODELS[platformName];
  if (!platform) return 0;

  return streams * platform.payoutRatePerStream;
}

/**
 * Get platform volatility factor for RNG
 */
export function getPlatformVolatility(platformName) {
  const platform = PLATFORM_MODELS[platformName];
  return platform?.volatility || 0.25;
}