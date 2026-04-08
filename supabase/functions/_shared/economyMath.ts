import { getMoodGenreAffinity, getGenreTrait } from './genreTraits.ts';

export const PLATFORM_KEYS = ['Streamify', 'Soundburst', 'AppleCore'] as const;

export type PlatformKey = typeof PLATFORM_KEYS[number];

// Game-balanced payout rates (boosted ~2x real-world to reward gameplay)
// These are per-stream rates — revenue = streams × rate
export const PLATFORM_PAYOUT_RATES: Record<PlatformKey, number> = {
  Streamify: 0.018,
  Soundburst: 0.015,
  AppleCore: 0.025
};

// Radio spin payout: supplemental income on top of streaming revenue
// Base: $0.001/impression; tastemaker-tier shows pay 2×
export const RADIO_PAYOUT_RATES = {
  base: 0.001,
  tastemaker_mult: 2.0,
};

export function calculateRadioIncome(impressions: number, showTier: string): number {
  const mult = showTier === 'tastemaker' ? RADIO_PAYOUT_RATES.tastemaker_mult : 1.0;
  return Math.round(impressions * RADIO_PAYOUT_RATES.base * mult * 100) / 100;
}

export type LifecycleState =
  | 'Scheduled' | 'Hot' | 'Trending' | 'Momentum' | 'Stable' | 'Declining'
  | 'Archived' | 'Legacy' | 'CultClassic' | 'SleeperHit' | 'DeepCut' | 'Flop'
  | 'Legendary' | 'Classic' | 'SmashHit' | 'Hit' | 'Solid' | 'StrongStart' | 'OneHitWonder';

/**
 * Alias for the outcome label set — identical to terminal lifecycle states.
 * Used for `performance_class` during active phases and final outcome on terminal.
 * Includes both original and expanded classification labels.
 */
export type LifecycleOutcome =
  | 'Archived' | 'Legacy' | 'CultClassic' | 'SleeperHit' | 'DeepCut' | 'Flop'
  | 'Legendary' | 'Classic' | 'SmashHit' | 'Hit' | 'Solid' | 'StrongStart' | 'OneHitWonder';

/** Set of terminal / outcome lifecycle states. Use isTerminalState() for checks. */
export const TERMINAL_STATES: ReadonlySet<LifecycleState> = new Set([
  'Archived', 'Legacy', 'CultClassic', 'SleeperHit', 'DeepCut', 'Flop',
  'Legendary', 'Classic', 'SmashHit', 'Hit', 'Solid', 'StrongStart', 'OneHitWonder',
]);

/** Set of active (in-progress) lifecycle phases. */
export const ACTIVE_STATES: ReadonlySet<LifecycleState> = new Set([
  'Scheduled', 'Hot', 'Trending', 'Momentum', 'Stable', 'Declining',
]);

// PUBLIC_INTERFACE
/**
 * Check whether a lifecycle state value is a terminal outcome.
 * @param state - The lifecycle_state value
 */
export function isTerminalState(state: string | null | undefined): boolean {
  return !!state && TERMINAL_STATES.has(state as LifecycleState);
}

// Lifecycle state multipliers for streaming
// These multiply the base stream calculation per release
export const LIFECYCLE_STREAM_MULTIPLIERS: Record<LifecycleState, number> = {
  Scheduled: 0,
  Hot: 6.0,          // First week energy — big spike, this is the payoff
  Trending: 3.5,     // Still climbing charts — strong revenue window
  Momentum: 2.0,     // Solid but slowing
  Stable: 1.0,       // Catalogue streams — still meaningful
  Declining: 0.4,    // Fading from playlists
  Archived: 0.1,     // Deep cuts only (default terminal)
  Legacy: 0.35,      // Timeless hits — strong catalogue streams
  CultClassic: 0.25, // Fan-favourite — moderate but dedicated streams
  SleeperHit: 0.30,  // Slow burn — grew significantly over time
  DeepCut: 0.15,     // Low streams but loved by core fans
  Flop: 0.05,        // Commercial dud — slight residual streams
  Legendary: 0.45,   // All-time great — exceptional catalogue streams
  Classic: 0.38,     // Timeless — fans keep coming back
  SmashHit: 0.40,    // Massive commercial success — strong catalogue
  Hit: 0.32,         // Solid performer — good catalogue streams
  Solid: 0.20,       // Reliable entry — moderate catalogue streams
  StrongStart: 0.18, // Debuted strong — decent residual
  OneHitWonder: 0.28, // The one big song — still gets streams
};

// Playlist/algorithmic boost for eligible releases
// Only Hot/Trending releases get meaningful playlist placement
export const PLAYLIST_BOOST: Record<LifecycleState, number> = {
  Scheduled: 0,
  Hot: 3.0,          // Editorial playlist placement — huge for discovery
  Trending: 2.0,     // Algorithmic recommendation boost
  Momentum: 1.4,     // Minor discovery feed inclusion
  Stable: 1.0,       // No boost
  Declining: 0.8,    // Falling off playlists
  Archived: 0.3,     // Rarely surfaced
  Legacy: 0.8,       // Still gets nostalgic playlist placements
  CultClassic: 0.6,  // Niche playlists
  SleeperHit: 0.7,   // Algorithm discovery bonus
  DeepCut: 0.4,      // Core fan playlists
  Flop: 0.1,         // Almost never surfaced
  Legendary: 0.9,    // All-time great — always in playlists
  Classic: 0.85,     // Timeless — curated playlist staple
  SmashHit: 0.85,    // Massive hit — algorithm loves it
  Hit: 0.75,         // Solid performer — regular playlist inclusion
  Solid: 0.5,        // Reliable — occasional playlist appearance
  StrongStart: 0.45, // Debuted strong — fading from playlists
  OneHitWonder: 0.7, // The one big song — still gets surfaced
};

// How many turns a release stays in each lifecycle phase before aging
// Total active life = 480 turns (~20 real days at hourly turns). Catalogue streams continue forever.
// Terminal states use -1 = permanent (no further progression).
export const LIFECYCLE_DURATIONS: Record<LifecycleState, number> = {
  Scheduled: 0,
  Hot: 48,           // 2 real days — release week energy, initial buzz
  Trending: 72,      // 3 real days — climbing charts, discovery window
  Momentum: 96,      // 4 real days — solid but slowing, playlist carry
  Stable: 168,       // 7 real days — catalogue heartland, Stable gate operates here
  Declining: 96,     // 4 real days — fading, revival window
  Archived: -1,      // Permanent - minimal passive streams
  Legacy: -1,        // Permanent - strong catalogue streams
  CultClassic: -1,   // Permanent - dedicated fan streams
  SleeperHit: -1,    // Permanent - steady growth streams
  DeepCut: -1,       // Permanent - core fan streams
  Flop: -1,          // Permanent - minimal residual
  Legendary: -1,     // Permanent - all-time great
  Classic: -1,       // Permanent - timeless
  SmashHit: -1,      // Permanent - massive commercial success
  Hit: -1,           // Permanent - solid performer
  Solid: -1,         // Permanent - reliable catalog entry
  StrongStart: -1,   // Permanent - debuted strong
  OneHitWonder: -1,  // Permanent - one big moment
};

export const LIFECYCLE_PROGRESSION: Record<LifecycleState, LifecycleState | null> = {
  Scheduled: 'Hot',
  Hot: 'Trending',
  Trending: 'Momentum',
  Momentum: 'Stable',
  Stable: 'Declining',
  Declining: 'Archived',   // Default; turnProcessorCore overrides via evaluator
  Archived: null,
  Legacy: null,
  CultClassic: null,
  SleeperHit: null,
  DeepCut: null,
  Flop: null,
  Legendary: null,
  Classic: null,
  SmashHit: null,
  Hit: null,
  Solid: null,
  StrongStart: null,
  OneHitWonder: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate streams per release per turn.
 * 
 * REBALANCE v4 TARGETS (per release, per turn):
 *   Underground (500 followers):  Hot ~7K,   Stable ~390
 *   Local Act (5K followers):     Hot ~32K,  Stable ~1.8K
 *   Indie Darling (25K):          Hot ~106K, Stable ~5.9K
 *   Rising Star (100K):           Hot ~288K, Stable ~16K
 *   Mainstream (500K):            Hot ~990K, Stable ~55K
 *
 * Formula: base = 100 + followers^0.7
 *   Multiplied by lifecycle (Hot=6x), playlist (Hot=3x), hype, era, random.
 *   Revenue = streams × weighted_avg_payout (~$0.013/stream)
 *   500 followers Hot: ~4K streams × $0.013 = ~$52/turn
 */
export function calculateReleaseStreams(params: {
  followers?: number;
  hype?: number;
  lifecycleState?: LifecycleState;
  randomUnit?: number;
  eraStreamingMult?: number;
  eraViralityMult?: number;
}): number {
  const { followers = 0, hype = 30, lifecycleState = 'Stable', randomUnit = 0.5, eraStreamingMult = 1, eraViralityMult = 1 } = params;
  
  // Enhanced base for low-follower tiers to meet dev bible targets
  const f = Math.max(0, followers);
  let baseStreams: number;
  
  if (f <= 1000) {
    // Underground tier: calibrated for 3K-15K range for Hot releases
    baseStreams = 150 + f * 0.8 + Math.pow(f, 0.6) * 2;
  } else if (f <= 10000) {
    // Local Act tier: calibrated for 15K-60K range for Hot releases  
    baseStreams = 400 + f * 0.4 + Math.pow(f, 0.65) * 1.8;
  } else {
    // Higher tiers: original formula
    const knee = 1_000_000;
    const baseAtKnee = Math.pow(knee, 0.7);
    const tail = f > knee ? Math.pow(f - knee, 0.55) * 20 : 0;
    baseStreams = 100 + (f <= knee ? Math.pow(f, 0.7) : baseAtKnee + tail);
  }
  
  const stateMultiplier = LIFECYCLE_STREAM_MULTIPLIERS[lifecycleState] || 0.5;
  const playlistBoost = PLAYLIST_BOOST[lifecycleState] || 1.0;
  // Hype effect: 0 hype = 0.6x, 50 hype = 1.0x, 100 hype = 1.4x
  const hypeMultiplier = 0.6 + (hype / 125);
  const randomFactor = 0.85 + randomUnit * 0.3;
  const streams = Math.floor(baseStreams * stateMultiplier * playlistBoost * hypeMultiplier * eraStreamingMult * eraViralityMult * randomFactor);
  return Math.max(0, streams);
}

export function distributeStreamsByPlatform(totalStreams: number, randomUnit = 0.5): Record<PlatformKey, number> {
  if (totalStreams <= 0) {
    return { Streamify: 0, Soundburst: 0, AppleCore: 0 };
  }

  const soundburstTilt = (randomUnit - 0.5) * 0.08;
  const appleTilt = (0.5 - randomUnit) * 0.06;

  const raw = {
    Streamify: clamp(0.5 + (0.5 - randomUnit) * 0.04, 0.42, 0.58),
    Soundburst: clamp(0.28 + soundburstTilt, 0.18, 0.36),
    AppleCore: clamp(0.22 + appleTilt, 0.16, 0.34)
  };

  const sum = raw.Streamify + raw.Soundburst + raw.AppleCore;
  const normalized = {
    Streamify: raw.Streamify / sum,
    Soundburst: raw.Soundburst / sum,
    AppleCore: raw.AppleCore / sum
  };

  const streamify = Math.floor(totalStreams * normalized.Streamify);
  const soundburst = Math.floor(totalStreams * normalized.Soundburst);
  const applecore = Math.max(0, totalStreams - streamify - soundburst);

  return { Streamify: streamify, Soundburst: soundburst, AppleCore: applecore };
}

// Physical media types that boost streaming metrics when sold
export const PHYSICAL_MEDIA_TYPES = ['CD', 'Vinyl', 'Cassette'] as const;
export type PhysicalMediaType = typeof PHYSICAL_MEDIA_TYPES[number];

// Physical media stream boost: each unit sold generates bonus streams
// CDs/Vinyls represent fans who REALLY engage with the music
export const PHYSICAL_MEDIA_STREAM_BOOST: Record<PhysicalMediaType, { streamsPerUnit: number; hypePerUnit: number; discoveryMult: number }> = {
  CD: { streamsPerUnit: 15, hypePerUnit: 0.02, discoveryMult: 1.2 },
  Vinyl: { streamsPerUnit: 25, hypePerUnit: 0.05, discoveryMult: 1.5 },
  Cassette: { streamsPerUnit: 10, hypePerUnit: 0.01, discoveryMult: 1.1 }
};

/**
 * Merch sales per turn — realistic scaling with spurts.
 *
 * Real merch patterns: slow baseline with spikes around releases, tours, viral moments.
 * Uses log-scaled follower base so mega-artists sell hundreds-to-low-thousands per day,
 * not tens of thousands. Event multipliers create natural sales spurts.
 *
 * Approximate daily sales at baseline (no events, mid hype):
 *   1K followers  → 2-8 units      100K followers → 30-120 units
 *   10K followers → 10-40 units     1M followers   → 60-250 units
 *   10M followers → 100-400 units
 *
 * During release week + tour: 3-5x baseline. Occasional random spurts (2x).
 */
export function computeMerchSales(params: {
  followers?: number;
  hype?: number;
  unitsRemaining?: number;
  pricePerUnit?: number;
  randomUnit?: number;
  merchType?: string;
  edition?: string;
  priceAnchor?: number;
  activeTurns?: number;
  hasActiveRelease?: boolean;
  isOnTour?: boolean;
}): { unitsSold: number; revenue: number; streamBoost: number; hypeBoost: number } {
  const {
    followers = 0,
    hype = 30,
    unitsRemaining = 0,
    pricePerUnit = 0,
    randomUnit = 0.5,
    merchType = '',
    edition = 'Standard',
    priceAnchor = pricePerUnit || 1,
    activeTurns = 0,
    hasActiveRelease = false,
    isOnTour = false,
  } = params;

  if (unitsRemaining <= 0 || followers <= 0) {
    return { unitsSold: 0, revenue: 0, streamBoost: 0, hypeBoost: 0 };
  }

  // Log-scaled follower base: diminishing returns above 10K.
  // 1K→1K, 10K→10K, 100K→43K, 1M→76K, 10M→110K effective buyers
  const logFollowers = followers <= 10_000
    ? followers
    : 10_000 + Math.log10(followers / 10_000) * 33_000;

  // Base rate: 0.2-0.8% of effective followers buy per turn (RNG variance)
  const baseSalesRate = 0.002 + randomUnit * 0.006;

  const hypeMultiplier = 0.8 + hype / 60; // 0.8x at 0 hype, 2.47x at 100 hype

  // Edition: Limited/Exclusive sell fewer units but at premium prices
  const editionSaleMult = ({ Standard: 1.0, Limited: 0.7, Exclusive: 0.4 } as Record<string, number>)[edition] || 1.0;
  const editionPriceMod = ({ Standard: 1.0, Limited: 1.35, Exclusive: 1.8 } as Record<string, number>)[edition] || 1.0;

  // Price elasticity: overpriced items sell less
  const anchor = Math.max(1, priceAnchor || pricePerUnit || 1);
  const relativePrice = Math.max(0.1, pricePerUnit / anchor);
  const priceElasticityMult = clamp(1.35 - ((relativePrice - 1) * 0.35), 0.45, 1.25);

  // Lifecycle freshness: new items sell better, old items taper off.
  // 100% at launch → 40% by turn 120. Minimum 40% — merch never fully dies.
  const freshnessMult = clamp(1.0 - (activeTurns / 200), 0.4, 1.0);

  // Event-driven spurts: release week and touring create natural sales spikes
  let eventMult = 1.0;
  if (hasActiveRelease) eventMult += 0.8;  // +80% during release window
  if (isOnTour) eventMult += 0.5;           // +50% during tour

  // Random spurt: 15% chance of a 2x sales day, 5% chance of 3x (viral moment, playlist feature)
  const spurtMult = randomUnit > 0.95 ? 3.0 : randomUnit > 0.85 ? 2.0 : 1.0;

  const potentialSales = Math.floor(
    logFollowers * baseSalesRate * hypeMultiplier * editionSaleMult
    * priceElasticityMult * freshnessMult * eventMult * spurtMult
  );

  // Cap by both total remaining inventory AND physical stock on hand — stock is the per-turn limit
  // Minimum floor of 1 unit/turn if stock exists (someone always buys)
  const unitsSold = Math.min(unitsRemaining, Math.max(1, potentialSales));
  const revenue = unitsSold * pricePerUnit * editionPriceMod;

  // Physical media bonus: CDs/Vinyls boost streams and hype
  let streamBoost = 0;
  let hypeBoost = 0;
  const mediaBoost = PHYSICAL_MEDIA_STREAM_BOOST[merchType as PhysicalMediaType];
  if (mediaBoost) {
    streamBoost = unitsSold * mediaBoost.streamsPerUnit;
    hypeBoost = Math.min(5, unitsSold * mediaBoost.hypePerUnit);
  }

  return { unitsSold, revenue, streamBoost, hypeBoost };
}

export function calculateTurnPayout(params: {
  streamingRevenue?: number;
  merchRevenue?: number;
  touringRevenue?: number;
  socialRevenue?: number;
  brandDealRevenue?: number;
  expenses?: number;
}): {
  gross: number;
  net: number;
  breakdown: Record<string, number>;
  appliedIncomeDelta: number;
} {
  const { streamingRevenue = 0, merchRevenue = 0, touringRevenue = 0, socialRevenue = 0, brandDealRevenue = 0, expenses = 0 } = params;
  
  const gross = streamingRevenue + merchRevenue + touringRevenue + socialRevenue + brandDealRevenue;
  const net = gross - expenses;
  return {
    gross,
    net,
    breakdown: { streamingRevenue, merchRevenue, touringRevenue, socialRevenue, brandDealRevenue, expenses },
    appliedIncomeDelta: Math.max(0, Math.floor(net))
  };
}

export function calculateSocialRevenue(params: {
  looptokViews?: number;
  instavibeReach?: number;
  vidwaveViews?: number;
}): {
  looptok: number;
  instavibe: number;
  vidwave: number;
  total: number;
} {
  const { looptokViews = 0, instavibeReach = 0, vidwaveViews = 0 } = params;
  
  // Boosted social revenue rates for rewarding gameplay (v4)
  const looptokRev = looptokViews * 0.0003;    // ~$0.30 per 1K views (creator fund + brand)
  const instavibeRev = instavibeReach * 0.0005; // ~$0.50 per 1K reach (sponsored)
  const vidwaveRev = vidwaveViews * 0.008;      // ~$8 per 1K views (ad revenue)
  return {
    looptok: looptokRev,
    instavibe: instavibeRev,
    vidwave: vidwaveRev,
    total: looptokRev + instavibeRev + vidwaveRev
  };
}

export function calculateGigRevenue(params: {
  attendance?: number;
  ticketPrice?: number;
  merchBoost?: number;
  venueCost?: number;
  travelCost?: number;
}): {
  ticketRevenue: number;
  merchRevenue: number;
  gross: number;
  expenses: number;
  net: number;
} {
  const { attendance = 0, ticketPrice = 25, merchBoost = 1, venueCost = 500, travelCost = 0 } = params;
  
  const ticketRevenue = attendance * ticketPrice;
  const gigMerchRevenue = attendance * 5.0 * merchBoost; // Boosted gig merch
  const gross = ticketRevenue + gigMerchRevenue;
  const expenses = venueCost + travelCost;
  return {
    ticketRevenue,
    merchRevenue: gigMerchRevenue,
    gross,
    expenses,
    net: gross - expenses
  };
}

// ═══════════════════════════════════════════════════════════════════
// NEW REVENUE STREAMS (v4)
// ═══════════════════════════════════════════════════════════════════

/**
 * Brand deal revenue per turn.
 * Unlocks at 500+ followers. Scales with followers, hype, and career stage.
 * Underground: $50-200/turn. Local Act: $200-800. Indie Darling: $500-2K.
 * Rising Star: $1K-5K. Mainstream: $3K-15K.
 */
export function calculateBrandDealRevenue(params: {
  followers?: number;
  hype?: number;
  careerStage?: string;
  clout?: number;
  randomUnit?: number;
}): { revenue: number; deals: number } {
  const { followers = 0, hype = 30, careerStage = 'Underground', clout = 0, randomUnit = 0.5 } = params;
  
  if (followers < 500) return { revenue: 0, deals: 0 };

  const stageMultipliers: Record<string, number> = {
    'Underground': 0.5, 'Local Act': 1.0, 'Indie Darling': 2.0,
    'Rising Star': 4.0, 'Mainstream': 8.0, 'Superstar': 15.0, 'Legend': 25.0
  };
  const stageMult = stageMultipliers[careerStage] || 0.5;
  const hypeBoost = 0.5 + hype / 80; // 0.5x at 0, 1.75x at 100
  const cloutBoost = 1 + clout / 200; // Clout adds prestige premium
  const randomFactor = 0.6 + randomUnit * 0.8; // 0.6x - 1.4x

  // Base: $100/turn scaled by everything
  const revenue = Math.floor(100 * stageMult * hypeBoost * cloutBoost * randomFactor);
  const deals = revenue > 0 ? Math.max(1, Math.floor(revenue / 200)) : 0;

  return { revenue, deals };
}

/**
 * Fan subscription/patronage revenue per turn.
 * Recurring income from dedicated fans. Based on stans + core fans.
 * Even underground artists get a trickle from their most loyal fans.
 * 500 followers (5 stans, 25 core): ~$15-30/turn
 * 5K followers (50 stans, 250 core): ~$150-300/turn
 */
export function calculateFanSubRevenue(params: {
  followers?: number;
  stans?: number;
  coreFans?: number;
  hype?: number;
  randomUnit?: number;
}): { revenue: number; subscribers: number } {
  const { followers = 0, stans = 0, coreFans = 0, hype = 30, randomUnit = 0.5 } = params;
  
  if (followers < 100) return { revenue: 0, subscribers: 0 };

  const paidStanSubsRaw = Math.floor(stans * 0.12);
  const paidCoreSubsRaw = Math.floor(coreFans * 0.01);
  const subscriberCap = Math.floor(followers * 0.03);
  const paidStanSubs = Math.min(paidStanSubsRaw, subscriberCap);
  const remainingCap = Math.max(0, subscriberCap - paidStanSubs);
  const paidCoreSubs = Math.min(paidCoreSubsRaw, remainingCap);
  const subscribers = paidStanSubs + paidCoreSubs;
  const stanRevenue = paidStanSubs * 4.0;
  const coreRevenue = paidCoreSubs * 0.75;
  const hypeBoost = Math.min(1.08, 0.92 + hype / 1000);
  const revenue = Math.floor((stanRevenue + coreRevenue) * hypeBoost);

  return { revenue, subscribers };
}

/**
 * Sync licensing revenue (random windfall opportunities).
 * Chance of a song being placed in a commercial, show, or game.
 * Probability increases with clout and career stage.
 * Underground: 5% chance, $200-500. Indie Darling: 15%, $1K-5K.
 * Rising Star: 25%, $2K-10K. Mainstream: 40%, $5K-25K.
 */
export function calculateSyncLicensing(params: {
  clout?: number;
  careerStage?: string;
  activeReleases?: number;
  randomUnit?: number;
}): { revenue: number; placed: boolean; description: string } {
  const { clout = 0, careerStage = 'Underground', activeReleases = 0, randomUnit = 0.5 } = params;
  
  if (activeReleases <= 0) return { revenue: 0, placed: false, description: '' };

  const stageChance: Record<string, number> = {
    'Underground': 0.05, 'Local Act': 0.10, 'Indie Darling': 0.15,
    'Rising Star': 0.25, 'Mainstream': 0.40, 'Superstar': 0.55, 'Legend': 0.70
  };
  const stagePayouts: Record<string, [number, number]> = {
    'Underground': [200, 500], 'Local Act': [500, 2000], 'Indie Darling': [1000, 5000],
    'Rising Star': [2000, 10000], 'Mainstream': [5000, 25000], 'Superstar': [10000, 50000], 'Legend': [25000, 100000]
  };

  const chance = (stageChance[careerStage] || 0.05) + clout / 500; // Clout adds up to 20%
  if (randomUnit > chance) return { revenue: 0, placed: false, description: '' };

  const [minPay, maxPay] = stagePayouts[careerStage] || [200, 500];
  const revenue = Math.floor(minPay + randomUnit * (maxPay - minPay));

  const placements = ['indie film', 'TV show', 'video game', 'commercial', 'podcast intro', 'fashion show'];
  const description = placements[Math.floor(randomUnit * placements.length)];

  return { revenue, placed: true, description };
}

/**
 * Collaboration revenue sharing.
 * When player has active collaborations, they earn a share of the collab's streams.
 * Feature fee: one-time payment when collab is created.
 * Ongoing: 30-50% of collab release streaming revenue.
 */
export function calculateCollabRevenue(params: {
  collabReleases?: Array<{ lifetime_streams?: number }>;
  followers?: number;
  randomUnit?: number;
}): { revenue: number; collabCount: number } {
  const { collabReleases = [], followers = 0, randomUnit = 0.5 } = params;
  
  if (collabReleases.length === 0) return { revenue: 0, collabCount: 0 };

  let totalRevenue = 0;
  for (const collab of collabReleases) {
    const collabStreams = collab.lifetime_streams || 0;
    const revenueShare = 0.3 + randomUnit * 0.2; // 30-50% share
    const avgPayout = 0.019; // Weighted average payout rate
    totalRevenue += Math.floor(collabStreams * revenueShare * avgPayout * 0.1); // 10% of lifetime per turn
  }

  return { revenue: totalRevenue, collabCount: collabReleases.length };
}

export const SOCIAL_PLATFORM_KEYS = ['looptok', 'instavibe', 'vidwave'] as const;
export type SocialPlatformKey = typeof SOCIAL_PLATFORM_KEYS[number];

export const ERA_MULTIPLIER_DEFAULTS = {
  streaming: 1, virality: 1, retention: 1, hype_decay: 1
};

// Calculate how lifecycle state should progress based on turns since release
export function getNextLifecycleState(currentState: LifecycleState, turnsSinceStateChange: number): LifecycleState | null {
  const maxTurns = LIFECYCLE_DURATIONS[currentState];
  if (maxTurns < 0) return null; // Terminal states (Archived, Legacy, etc.) = permanent
  if (turnsSinceStateChange >= maxTurns) {
    return LIFECYCLE_PROGRESSION[currentState] || null;
  }
  return null;
}

/**
 * Physical media (CD/Vinyl/Cassette) sales revenue
 * Boosts streams and hype when fans buy physical formats
 */
export function calculatePhysicalMediaRevenue(params: {
  followers?: number;
  hype?: number;
  hasHotRelease?: boolean;
  careerStage?: string;
  randomUnit?: number;
}): { revenue: number; units: number } {
  const { followers = 0, hype = 30, hasHotRelease = false, careerStage = 'Underground', randomUnit = 0.5 } = params;
  
  if (followers < 100) return { revenue: 0, units: 0 };
  
  // Base sales rate: 0.5-2% of followers buy physical media
  const baseRate = 0.005 + randomUnit * 0.015;
  const hypeBoost = 1 + (hype / 100);
  const hotReleaseBoost = hasHotRelease ? 2.5 : 1;
  
  const units = Math.floor(followers * baseRate * hypeBoost * hotReleaseBoost);
  const avgPricePerUnit = 15; // $15 average for CD/Vinyl
  const revenue = units * avgPricePerUnit;
  
  return { revenue, units };
}

export function calculateSocialGrowth(params: {
  followers?: number;
  hype?: number;
  platform?: string;
  totalPosts?: number;
  randomUnit?: number;
}): number {
  const { followers = 0, hype = 30, platform = 'looptok', totalPosts = 0, randomUnit = 0.5 } = params;
  
  // Diminishing growth: smaller accounts grow faster percentage-wise
  const baseGrowthRate = 0.001 + randomUnit * 0.004; // 0.1% - 0.5%
  const hypeBoost = 0.8 + hype / 120;
  const postBoost = 1 + Math.min(0.3, totalPosts * 0.003);
  const platformMult = ({ looptok: 1.3, vidwave: 1.1, instavibe: 1.0 } as Record<string, number>)[platform] || 1.0;
  // Small discovery floor: even 0-follower accounts get a trickle
  const newFollowers = Math.floor((followers * baseGrowthRate + 2) * hypeBoost * postBoost * platformMult);
  return Math.max(0, newFollowers);
}

// ─── ALGORITHM MOOD STREAM BONUS ──────────────────────────────────────────────

export interface MoodBonusParams {
  /** Genre of the release (may differ from player genre for experimental bonus) */
  releaseGenre: string | null;
  /** Artist's primary genre */
  playerGenre: string | null;
  /** Whether the release is a diss track */
  isDissTrack: boolean;
  /** Approximate age in turns: globalTurnId - release.scheduled_turn */
  releaseAgeInTurns: number;
  /** Current lifecycle state of the release */
  lifecycleState: string;
  /** Whether the player has an active (non-resolved) controversy case */
  hasActiveControversy: boolean;
  /** Status of the release's linked trend ('rising' | 'peak' | null) */
  linkedTrendStatus: string | null;
  /** Current global algorithm_mood */
  algorithmMood: string;
  /** GAP-2: Release experimental factor (0-1), higher = more genre-bending */
  experimentalFactor: number;
}

/**
 * Returns a stream multiplier (clamped 0.5–1.5) based on how well the release
 * aligns with the current algorithm_mood and any linked trend status.
 * Applied once per active release per turn in turnProcessorCore §3.
 */
export function computeMoodStreamBonus(p: MoodBonusParams): number {
  let mult = 1.0;
  const mood = p.algorithmMood || 'mainstream';

  // Genre affinity with current mood
  mult *= getMoodGenreAffinity(p.releaseGenre, mood);

  // GAP-1 Task 1: algorithmBiasModifier — genre-level algorithm favor/resistance
  // Pop (+0.15) gets a slight boost; indie (-0.15) gets a slight penalty.
  // Scaled by 0.1 so effective range is ±0.015 on the multiplier.
  const trait = getGenreTrait(p.playerGenre);
  mult += trait.algorithmBiasModifier * 0.1;

  // GAP-2: culturalGravityFactor — high-gravity genres (Pop 0.9) get small edge,
  // low-gravity (Folk 0.4) get small penalty. Centered at 0.5, scaled ±0.024 max.
  mult += (trait.culturalGravityFactor - 0.5) * 0.06;

  // Mood-specific release attribute bonuses
  if (mood === 'beef_season' && p.isDissTrack) {
    mult *= 1.35; // Diss tracks are the main event during beef season
  }

  if (mood === 'nostalgic' && p.releaseAgeInTurns >= 14) {
    // Old releases get a nostalgia revival bump (scales with age, capped at +25%)
    const ageFactor = Math.min(1.25, 1.0 + (p.releaseAgeInTurns - 14) * 0.005);
    mult *= ageFactor;
  }

  if (mood === 'experimental') {
    // Genre experimentation: release genre differs from artist's primary genre
    const isExperiment =
      p.releaseGenre != null &&
      p.playerGenre != null &&
      p.releaseGenre.toLowerCase() !== p.playerGenre.toLowerCase();
    if (isExperiment) mult *= 1.25;
    // GAP-2: High experimental_factor releases get additional bonus during experimental mood
    if ((p.experimentalFactor ?? 0) > 0.7) mult *= 1.15;
    // GAP-2: experimentalToleranceFactor — genres with high tolerance (Indie 0.9)
    // get up to +0.108 during experimental moods; low tolerance (Drill 0.3) get +0.036
    mult += trait.experimentalToleranceFactor * 0.12;
  }

  if (mood === 'messy' && p.hasActiveControversy) {
    mult *= 1.2; // Drama = all eyes on you
  }

  if (
    mood === 'underground' &&
    ['declining', 'archived', 'stable', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
     'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder'].includes(p.lifecycleState.toLowerCase())
  ) {
    mult *= 1.1; // Underground mood resurfaces catalogue cuts
  }

  if (mood === 'collab_season') {
    // Cross-genre releases (proxy for features) get the full collab bonus.
    // All other releases get a smaller baseline lift — the rising tide lifts all boats.
    const isCollabRelease =
      p.releaseGenre != null &&
      p.playerGenre != null &&
      p.releaseGenre.toLowerCase() !== p.playerGenre.toLowerCase();
    if (isCollabRelease) {
      mult *= 1.26; // Full collab-season boost for cross-genre / feature releases
    } else {
      mult *= 1.05; // Baseline lift for same-genre releases during collab season
    }
  }

  if (mood === 'hype_cycle') {
    // Rollout focal point: hot and trending releases are what everyone's talking about
    if (['hot', 'trending'].includes(p.lifecycleState.toLowerCase())) mult *= 1.3;
    // Scheduled releases benefit from pre-drop anticipation
    if (p.lifecycleState.toLowerCase() === 'scheduled') mult *= 1.1;
    // Old catalogue is irrelevant during a hype cycle — no bonus
  }

  if (mood === 'viral_spiral') {
    // Short-form chaos rewards whatever's already moving
    if (['hot', 'trending', 'momentum'].includes(p.lifecycleState.toLowerCase())) mult *= 1.2;
    // Trend-linked releases get an extra amplification (on top of the trend bonus below)
    if (p.linkedTrendStatus === 'peak' || p.linkedTrendStatus === 'rising') mult *= 1.05;
    // Catalogue gets drowned out by the content flood (includes all terminal states)
    if (['declining', 'archived', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
         'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder'].includes(p.lifecycleState.toLowerCase())) mult *= 0.9;
  }

  if (mood === 'industry_exposed') {
    // Scandal = visibility — controversy-adjacent artists get more attention
    if (p.hasActiveControversy) mult *= 1.25;
    // Diss tracks circulate heavily during receipts season
    if (p.isDissTrack) mult *= 1.15;
    // Clean releases have reduced visibility — nobody's talking about regular music right now
    if (!p.hasActiveControversy && !p.isDissTrack) mult *= 0.95;
  }

  if (mood === 'tour_season') {
    // Stable/declining/terminal catalogue resurfaces as artists revisit setlist songs on tour
    if (['stable', 'declining', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut',
         'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder'].includes(p.lifecycleState.toLowerCase())) mult *= 1.15;
    // Hot releases benefit from the live-to-stream pipeline
    if (p.lifecycleState.toLowerCase() === 'hot') mult *= 1.1;
  }

  // Trend alignment bonus (stacks on top of mood)
  if (p.linkedTrendStatus === 'peak')   mult *= 1.2;
  else if (p.linkedTrendStatus === 'rising') mult *= 1.1;

  return Math.max(0.5, Math.min(1.5, mult));
}

// ─── SEGMENT SENTIMENT STREAM MULTIPLIER ──────────────────────────────────────

/**
 * Computes a stream multiplier based on weighted-average segment sentiment.
 * Sentiment 0 → 0.5x, sentiment 50 → 1.0x, sentiment 100 → 1.5x.
 *
 * This function is intentionally decoupled from segmentSentimentTriggers.ts
 * to avoid circular dependencies. It accepts plain Record types.
 *
 * Applied alongside computeMoodStreamBonus in turnProcessorCore §3.
 *
 * @param segmentSentiments - Map of segment type to sentiment (0-100)
 * @param segmentCounts - Map of segment type to fan count
 * @returns Stream multiplier in [0.5, 1.5]
 */
export function computeSegmentSentimentStreamMultiplier(
  segmentSentiments: Record<string, number>,
  segmentCounts: Record<string, number>,
): number {
  let totalFans = 0;
  let weightedSentiment = 0;

  for (const seg of Object.keys(segmentSentiments)) {
    const count = segmentCounts[seg] || 0;
    const sentiment = segmentSentiments[seg] ?? 50;
    totalFans += count;
    weightedSentiment += count * sentiment;
  }

  if (totalFans === 0) return 1.0;

  const avgSentiment = weightedSentiment / totalFans;
  // 0-100 sentiment → 0.5x-1.5x stream multiplier
  return 0.5 + (avgSentiment / 100);
}
