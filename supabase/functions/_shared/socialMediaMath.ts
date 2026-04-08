/**
 * SOCIAL MEDIA MATH — Single Source of Truth
 * All social media calculations: revenue, growth, views, monetization, conversions.
 * Every handler, module, and the turn engine imports from HERE.
 * 
 * Design philosophy:
 *   - Game-friendly thresholds (achievable in 30-60 turns)
 *   - Realistic scaling (mirrors real YouTube/TikTok growth patterns)
 *   - Old content generates passive views (evergreen/backlog effect)
 *   - Shorts convert viewers to long-form subscribers
 *   - Trending favors upcoming accounts over giants
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

// ─── Utility ────────────────────────────────────────────────────────
function N(v: unknown): number { return Number(v) || 0; }

type MediaOutletAccount = {
  id: string;
  name: string;
  handle: string;
  icon: string;
  platform_affinity: string[];
  sentiment: string;
  viewMult: number;
  description: string;
  avatarUrl: string | null;
};

// ─── MONETIZATION GATES (game-friendly) ─────────────────────────────
export const MONETIZATION_GATES = {
  vidwave: {
    minSubscribers: 1000,
    minTotalViews: 100_000,   // was 10M — now achievable in ~40-60 turns
    minWatchHoursSec: 240_000 // 4K hours in seconds (alternative path)
  },
  looptok: {
    minFollowers: 500,
    minTotalViews: 50_000     // was 1M — now achievable in ~30-50 turns
  },
  instavibe: {
    minFollowers: 500         // brand deals unlock at 500
  }
};

// ─── RPM TIERS (Revenue Per Mille — $ per 1K views) ─────────────────
export const VIDWAVE_RPM = {
  music_video:      { base: 5.0, premium: 7.0 },
  lyric_video:      { base: 3.5, premium: 5.0 },
  visualizer:       { base: 3.0, premium: 4.5 },
  studio_session:   { base: 4.0, premium: 6.0 },
  songwriting:      { base: 3.5, premium: 5.5 },
  vlog:             { base: 4.5, premium: 6.5 },
  tour_diary:       { base: 4.0, premium: 6.0 },
  reaction:         { base: 3.0, premium: 4.5 },
  collab_video:     { base: 5.5, premium: 8.0 },
  interview:        { base: 3.5, premium: 5.5 },
  deep_dive:        { base: 4.0, premium: 6.0 },
  live_performance: { base: 6.0, premium: 9.0 },
  short:            { base: 0.8, premium: 1.5 }  // Shorts earn less but drive subs
} as Record<string, { base: number; premium: number }>;

export const LOOPTOK_RATES = {
  CREATOR_FUND: 0.02,    // $0.02 per 1K views
  BRAND_DEAL:   0.05,    // $0.05 per 1K views (10K+ followers)
  MARKETPLACE:  0.03     // $0.03 per 1K views (5K+ followers)
};

export const INSTAVIBE_RATES = {
  BASE:       0.015,     // $0.015 per 1K reach
  BRAND_DEAL: 0.10,      // $0.10 per 1K reach (brand deals)
  SPONSORED:  0.05       // $0.05 per 1K reach (sponsored posts)
};

// ─── MULTIPLIERS ────────────────────────────────────────────────────
export const CAREER_MULTIPLIERS: Record<string, number> = {
  'Underground':      0.7,
  'Local Act':        1.0,
  'Indie Darling':    1.3,
  'Emerging Artist':  1.5,
  'Mainstream':       1.8,
  'Superstar':        2.5,
  'Legend':           3.0
};

export const HYPE_BRACKETS: Record<string, number> = {
  low:    0.8,   // < 30 hype
  medium: 1.0,   // 30-60
  high:   1.2,   // 60-80
  viral:  1.5    // 80+
};

export const PRODUCTION_MULTIPLIERS: Record<number, number> = {
  0: 0.6,  // DIY/Phone
  1: 0.8,  // Basic
  2: 1.0,  // Professional
  3: 1.2,  // Studio Grade
  4: 1.4,  // Blockbuster
  5: 1.6   // Legendary
};

// ─── PLATFORM GROWTH RATES ──────────────────────────────────────────
// How fast each platform grows followers organically per turn
export const PLATFORM_GROWTH_RATES: Record<string, number> = {
  looptok:   1.4,   // TikTok grows fastest (algorithm-driven discovery)
  vidwave:   1.0,   // YouTube is steady (search + suggested)
  instavibe: 0.8,   // Instagram is slowest (requires engagement)
  xpress:    1.1    // Xpress (Twitter) is viral but noisy
};

// ─── SHORTS → SUBSCRIBER CONVERSION ────────────────────────────────
// Real-world: ~1-3% of short viewers check out the channel, ~10% of those subscribe
export const SHORTS_CONVERSION = {
  viewToChannelVisit: 0.015,  // 1.5% of short viewers visit channel
  visitToSubscribe:   0.10,   // 10% of visitors subscribe
  // Net: ~0.15% of short views → new subscriber
  netRate: 0.0015
};

// ─── OLD CONTENT / BACKLOG VIEW DECAY ───────────────────────────────
// Each turn, old videos get passive views based on total library size and subs
// Models: suggested algorithm, search traffic, playlist plays
export const BACKLOG_VIEW_RATES = {
  vidwave: {
    viewsPerSubPerTurn: 0.3,     // Each sub watches ~0.3 old videos/turn
    avgViewsPerOldVideo: 0.05,   // Each old video gets 5% of sub count in views
    evergreenDecay: 0.95,        // Evergreen content retains 95% of view rate
    shortsBacklogMult: 1.5       // Shorts get 50% more backlog views (algorithm)
  },
  looptok: {
    viewsPerFollowerPerTurn: 0.5, // TikTok algorithm resurfaces old content more
    viralResurfaceChance: 0.02,   // 2% chance an old post goes mini-viral
    viralResurfaceMult: 5.0       // Mini-viral = 5x normal backlog views
  }
};

// ─── HELPER: Get hype bracket ───────────────────────────────────────
export function getHypeBracket(hype: number): string {
  if (hype < 30) return 'low';
  if (hype < 60) return 'medium';
  if (hype < 80) return 'high';
  return 'viral';
}

// ═══════════════════════════════════════════════════════════════════
// MONETIZATION CHECKS
// ═══════════════════════════════════════════════════════════════════

export function canMonetize(platform: string, account: any, totalWatchTimeSec = 0): boolean {
  const g = (MONETIZATION_GATES as any)[platform];
  if (!g) return false;
  const followers = N(account.followers);
  const views = N(account.total_views);

  if (platform === 'vidwave') {
    return followers >= g.minSubscribers &&
           (views >= g.minTotalViews || totalWatchTimeSec >= g.minWatchHoursSec);
  }
  if (platform === 'looptok') {
    return followers >= g.minFollowers && views >= g.minTotalViews;
  }
  if (platform === 'instavibe') {
    return followers >= g.minFollowers;
  }
  return false;
}

/** Returns 0-100 progress toward monetization */
export function monetizationProgress(platform: string, account: any): number {
  const g = (MONETIZATION_GATES as any)[platform];
  if (!g) return 0;
  const followers = N(account.followers);
  const views = N(account.total_views);

  if (platform === 'vidwave') {
    const subProg = Math.min(1, followers / g.minSubscribers);
    const viewProg = Math.min(1, views / g.minTotalViews);
    return Math.floor(((subProg + viewProg) / 2) * 100);
  }
  if (platform === 'looptok') {
    const fProg = Math.min(1, followers / g.minFollowers);
    const vProg = Math.min(1, views / g.minTotalViews);
    return Math.floor(((fProg + vProg) / 2) * 100);
  }
  if (platform === 'instavibe') {
    return Math.min(100, Math.floor((followers / g.minFollowers) * 100));
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// REVENUE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

/** Calculate VidWave RPM (dynamic, based on content type + career + hype + production) */
export function calcVidWaveRPM(videoType: string, productionTier: number, careerStage: string, hype: number): number {
  const tier = VIDWAVE_RPM[videoType] || VIDWAVE_RPM.music_video;
  const isPremium = careerStage === 'Mainstream' || careerStage === 'Superstar' || careerStage === 'Legend';
  const baseRPM = isPremium ? tier.premium : tier.base;

  const career = CAREER_MULTIPLIERS[careerStage] || 1.0;
  const hypeMult = HYPE_BRACKETS[getHypeBracket(hype)] || 1.0;
  const prod = PRODUCTION_MULTIPLIERS[productionTier] || 1.0;

  return Math.max(0.5, baseRPM * career * hypeMult * prod);
}

/** Full VidWave revenue for a video (active post or passive) */
export function calcVidWaveRevenue(params: {
  views: number;
  videoType?: string;
  productionTier?: number;
  careerStage?: string;
  hype?: number;
  socialAccount: any;
  totalWatchTimeSec?: number;
}) {
  const {
    views, videoType = 'music_video', productionTier = 2,
    careerStage = 'Local Act', hype = 30, socialAccount, totalWatchTimeSec = 0
  } = params;

  if (!canMonetize('vidwave', socialAccount, totalWatchTimeSec)) {
    return { revenue: 0, rpm: 0, monetized: false, progress: monetizationProgress('vidwave', socialAccount) };
  }

  const rpm = calcVidWaveRPM(videoType, productionTier, careerStage, hype);
  const revenue = Math.round((views / 1000) * rpm * 100) / 100;
  return { revenue, rpm: Math.round(rpm * 100) / 100, monetized: true, progress: 100 };
}

/** Full LoopTok revenue */
export function calcLoopTokRevenue(params: {
  views: number;
  socialAccount: any;
  careerStage?: string;
  isViral?: boolean;
}) {
  const { views, socialAccount, careerStage = 'Local Act', isViral = false } = params;

  if (!canMonetize('looptok', socialAccount)) {
    return { revenue: 0, rate: 0, monetized: false, progress: monetizationProgress('looptok', socialAccount) };
  }

  const followers = N(socialAccount.followers);
  let rate = LOOPTOK_RATES.CREATOR_FUND;
  if (followers >= 10000) rate = LOOPTOK_RATES.BRAND_DEAL;
  else if (followers >= 5000) rate = LOOPTOK_RATES.MARKETPLACE;

  rate *= (CAREER_MULTIPLIERS[careerStage] || 1.0);
  if (isViral) rate *= 1.5;

  const revenue = Math.round((views / 1000) * rate * 100) / 100;
  return { revenue, rate: Math.round(rate * 100) / 100, monetized: true, progress: 100 };
}

/** InstaVibe revenue */
export function calcInstaVibeRevenue(params: {
  reach: number;
  socialAccount: any;
  hasBrandDeal?: boolean;
  isSponsored?: boolean;
}) {
  const { reach, socialAccount, hasBrandDeal = false, isSponsored = false } = params;

  if (!canMonetize('instavibe', socialAccount)) {
    return { revenue: 0, monetized: false, progress: monetizationProgress('instavibe', socialAccount) };
  }

  let rate = INSTAVIBE_RATES.BASE;
  if (hasBrandDeal) rate = INSTAVIBE_RATES.BRAND_DEAL;
  else if (isSponsored) rate = INSTAVIBE_RATES.SPONSORED;

  const revenue = Math.round((reach / 1000) * rate * 100) / 100;
  return { revenue, monetized: true, progress: 100 };
}

// ═══════════════════════════════════════════════════════════════════
// PASSIVE TURN GROWTH (called by socialMediaModule each turn)
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate passive growth for a social account each turn.
 * Models: organic discovery, algorithm suggestions, search traffic.
 * Growth rate: ~0.3-1.5% per turn, scaling with hype and posts.
 * A 500-follower account gains ~3-8/turn. A 5K account gains ~15-40/turn.
 */
export function calcPassiveGrowth(params: {
  platform: string;
  followers: number;
  hype: number;
  totalPosts: number;
  careerStage?: string;
  rng?: number; // 0-1 random unit
}) {
  const { platform, followers, hype, totalPosts, careerStage = 'Local Act', rng = Math.random() } = params;

  const platformMult = PLATFORM_GROWTH_RATES[platform] || 1.0;
  const baseRate = 0.002 + rng * 0.006; // 0.2% - 0.8% per turn
  const hypeBoost = 0.8 + hype / 100;   // 0.8x at 0 hype, 1.8x at 100
  const postBoost = 1 + Math.min(0.4, totalPosts * 0.004); // Up to 1.4x with 100+ posts
  const careerBoost = (CAREER_MULTIPLIERS[careerStage] || 1.0) * 0.3 + 0.7; // Mild career effect

  // SOFT CAPS & DIMINISHING RETURNS
  // Allow growth to 25-40M but with progressively harsher diminishing returns
  let growthMultiplier = 1.0;
  if (followers > 10_000_000) {
    // 10M+ : Heavy diminishing returns (0.1x - 0.3x)
    const excess = followers - 10_000_000;
    const diminishingFactor = Math.max(0.1, 1 - (excess / 30_000_000)); // Approaches 0.1x at 40M
    growthMultiplier *= diminishingFactor;
  } else if (followers > 5_000_000) {
    // 5M-10M : Moderate diminishing returns (0.3x - 0.7x)
    const excess = followers - 5_000_000;
    const diminishingFactor = Math.max(0.3, 1 - (excess / 15_000_000)); // Approaches 0.3x at 10M
    growthMultiplier *= diminishingFactor;
  } else if (followers > 1_000_000) {
    // 1M-5M : Light diminishing returns (0.7x - 0.9x)
    const excess = followers - 1_000_000;
    const diminishingFactor = Math.max(0.7, 1 - (excess / 15_000_000)); // Approaches 0.7x at 5M
    growthMultiplier *= diminishingFactor;
  }

  // Discovery floor scales with account size (smaller accounts get proportionally more)
  const discoveryFloor = Math.max(2, Math.floor(followers * 0.0001 * rng * 3)); // 0.03% minimum

  const organicGrowth = Math.floor(followers * baseRate * hypeBoost * postBoost * platformMult * careerBoost * growthMultiplier);
  const totalGrowth = Math.max(discoveryFloor, organicGrowth);

  return totalGrowth;
}

/**
 * Calculate passive/backlog views each turn.
 * Models old content being discovered via algorithm, search, playlists.
 * Subscribers/followers watch old content; shorts get resurfaced more.
 */
export function calcBacklogViews(params: {
  platform: string;
  followers: number;
  totalPosts: number;
  shortsCount?: number;
  hype: number;
  rng?: number;
}) {
  const { platform, followers, totalPosts, shortsCount = 0, hype, rng = Math.random() } = params;
  const variation = 0.7 + rng * 0.6; // 0.7x - 1.3x

  if (platform === 'vidwave') {
    const cfg = BACKLOG_VIEW_RATES.vidwave;
    // Subs watch old long-form content
    const longFormViews = Math.floor(followers * cfg.viewsPerSubPerTurn * totalPosts * cfg.avgViewsPerOldVideo * variation);
    // Shorts get resurfaced by algorithm
    const shortsViews = Math.floor(shortsCount * followers * cfg.avgViewsPerOldVideo * cfg.shortsBacklogMult * variation);
    // Hype drives discovery of old content
    const discoveryViews = Math.floor(followers * 0.1 * (1 + hype / 100) * variation);
    return longFormViews + shortsViews + discoveryViews;
  }

  if (platform === 'looptok') {
    const cfg = BACKLOG_VIEW_RATES.looptok;
    const baseViews = Math.floor(followers * cfg.viewsPerFollowerPerTurn * variation);
    // Chance of old post going mini-viral
    const resurfaced = rng < cfg.viralResurfaceChance ? Math.floor(baseViews * cfg.viralResurfaceMult) : 0;
    return baseViews + resurfaced;
  }

  if (platform === 'instavibe') {
    // Instagram: lower organic reach, stories expire
    return Math.floor(followers * 0.15 * variation * (1 + hype / 200));
  }

  if (platform === 'xpress') {
    // Xpress: very fast decay, but retweets keep it alive
    return Math.floor(followers * 0.1 * variation * (1 + hype / 150));
  }

  return 0;
}

/**
 * Calculate VidWave-specific ad revenue (separate from passive revenue)
 * This tracks actual ad impressions and CPM rates for detailed analytics
 */
export function calcVidWaveAdRevenue(params: {
  backlogViews: number;
  socialAccount: any;
  careerStage?: string;
  hype?: number;
}) {
  const { backlogViews, socialAccount, careerStage = 'Local Act', hype = 30 } = params;
  
  const followers = N(socialAccount.followers);
  const totalViews = N(socialAccount.total_views);
  const subscribers = N(socialAccount.subscribers || 0);
  
  // Check if monetized
  const isMonetized = canMonetize('vidwave', { followers, total_views: totalViews });
  if (!isMonetized) {
    return {
      adRevenue: 0,
      impressions: 0,
      cpmRate: 0,
      monetized: false,
      revenueTier: 'bronze'
    };
  }
  
  // Calculate impressions (ad views) - only ~60% of views get ads
  const impressions = Math.floor(backlogViews * 0.6);
  
  // CPM rate based on career stage and subscriber count
  let cpmRate = 2.0; // Base $2.00 per 1000 impressions
  
  // Career stage multipliers
  const stageMultipliers: Record<string, number> = {
    'Local Act': 1.0,
    'Regional Star': 1.2,
    'National Act': 1.5,
    'International Star': 2.0,
    'Global Icon': 3.0
  };
  cpmRate *= stageMultipliers[careerStage] || 1.0;
  
  // Subscriber tier bonuses
  if (subscribers >= 100000) cpmRate *= 1.5; // Diamond tier
  else if (subscribers >= 10000) cpmRate *= 1.3; // Platinum tier
  else if (subscribers >= 1000) cpmRate *= 1.1; // Gold tier
  
  // Hype bonus (up to 25% increase)
  cpmRate *= (1 + Math.min(hype / 100, 0.25));
  
  // Calculate revenue
  const adRevenue = Math.floor((impressions / 1000) * cpmRate * 100) / 100;
  
  // Determine revenue tier
  let revenueTier = 'bronze';
  if (adRevenue >= 1000) revenueTier = 'diamond';
  else if (adRevenue >= 500) revenueTier = 'platinum';
  else if (adRevenue >= 250) revenueTier = 'gold';
  else if (adRevenue >= 100) revenueTier = 'silver';
  
  return {
    adRevenue,
    impressions,
    cpmRate: Math.floor(cpmRate * 100) / 100,
    monetized: true,
    revenueTier
  };
}

/**
 * Calculate passive revenue from backlog views (turn engine).
 * Only monetized accounts earn revenue from passive views.
 */
export function calcPassiveRevenue(params: {
  platform: string;
  backlogViews: number;
  socialAccount: any;
  careerStage?: string;
  hype?: number;
}) {
  const { platform, backlogViews, socialAccount, careerStage = 'Local Act', hype = 30 } = params;

  if (platform === 'vidwave') {
    // Estimate total watch time from total_views (avg ~4 sec/view * 60% retention)
    const estimatedWatchTimeSec = N(socialAccount.total_views) * 4 * 0.6;
    return calcVidWaveRevenue({
      views: backlogViews,
      videoType: 'music_video', // Average RPM across content types
      productionTier: 2,
      careerStage,
      hype,
      socialAccount,
      totalWatchTimeSec: estimatedWatchTimeSec
    });
  }

  if (platform === 'looptok') {
    return calcLoopTokRevenue({ views: backlogViews, socialAccount, careerStage });
  }

  if (platform === 'instavibe') {
    return calcInstaVibeRevenue({ reach: backlogViews, socialAccount });
  }

  if (platform === 'xpress') {
    // Xpress revenue: $0.008 per 1K views (lowest)
    // Matches logic in xpressHandler.ts
    const XPRESS_REVENUE_PER_VIEW = 0.000008;
    const revenue = Math.floor(backlogViews * XPRESS_REVENUE_PER_VIEW * 100) / 100;
    return { revenue, monetized: true, progress: 100 };
  }

  return { revenue: 0, monetized: false };
}

// ═══════════════════════════════════════════════════════════════════
// VIEW-TO-SUBSCRIBER/FOLLOWER CONVERSION
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert video views into new subscribers/followers.
 * Models: viewer watches video → visits profile → subscribes.
 * 
 * VidWave long-form: ~0.3-0.5% conversion (high intent)
 * VidWave shorts: ~0.15% conversion but higher volume
 * LoopTok: ~0.1-0.3% conversion (lower intent, higher volume)
 * InstaVibe: ~0.2% conversion
 */
export function calcViewToFollowerConversion(params: {
  platform: string;
  views: number;
  isShort?: boolean;
  isViral?: boolean;
  productionTier?: number;
  hype?: number;
}) {
  const { platform, views, isShort = false, isViral = false, productionTier = 2, hype = 30 } = params;
  const hypeMult = 1 + hype / 200; // Mild hype effect on conversion

  if (platform === 'vidwave') {
    if (isShort) {
      // Shorts: lower per-view conversion but drives channel visits
      const newSubs = Math.floor(views * SHORTS_CONVERSION.netRate * hypeMult);
      return Math.max(0, newSubs);
    }
    // Long-form: higher conversion, affected by production quality
    const qualityMult = (PRODUCTION_MULTIPLIERS[productionTier] || 1.0);
    const baseRate = 0.003 + (qualityMult - 1) * 0.001; // 0.3% - 0.5%
    return Math.max(0, Math.floor(views * baseRate * hypeMult));
  }

  if (platform === 'looptok') {
    const baseRate = isViral ? 0.003 : 0.001; // Viral content converts 3x better
    return Math.max(0, Math.floor(views * baseRate * hypeMult));
  }

  if (platform === 'instavibe') {
    return Math.max(0, Math.floor(views * 0.002 * hypeMult));
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// TRENDING SCORE (for ForYou page — favors upcoming accounts)
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate trending score for a post.
 * Favors upcoming/smaller accounts over streaming giants.
 * Score = engagement × recency × underdog_boost × trend_alignment
 */
export function calcTrendingScore(params: {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  postedTurnsAgo: number;
  creatorFollowers: number;
  isViral?: boolean;
  matchesTrend?: boolean;
}) {
  const { views, likes, comments, shares, saves, postedTurnsAgo, creatorFollowers, isViral = false, matchesTrend = false } = params;

  // Engagement rate matters more than raw numbers
  const totalEngagement = likes + comments * 2 + shares * 3 + saves * 2; // Weighted
  const engagementRate = views > 0 ? totalEngagement / views : 0;

  // Recency decay: newer posts score higher
  const recencyMult = Math.max(0.1, 1 - postedTurnsAgo * 0.05); // Drops 5% per turn

  // UNDERDOG BOOST: smaller accounts get a discovery advantage
  // A 200-follower account gets 3x boost vs a 50K account
  const underdogBoost = Math.max(0.5, 3.0 - Math.log10(Math.max(10, creatorFollowers)) * 0.5);

  // Viral and trend bonuses
  const viralBonus = isViral ? 2.0 : 1.0;
  const trendBonus = matchesTrend ? 1.5 : 1.0;

  // Base score from views (logarithmic so giants don't dominate)
  const viewScore = Math.log10(Math.max(1, views)) * 10;

  return Math.round(viewScore * engagementRate * 100 * recencyMult * underdogBoost * viralBonus * trendBonus);
}

// ═══════════════════════════════════════════════════════════════════
// WATCH TIME CALCULATION
// ═══════════════════════════════════════════════════════════════════

export function calcWatchTimeSec(views: number, avgVideoLengthMin = 4, retentionPct = 60): number {
  return Math.floor(views * avgVideoLengthMin * (retentionPct / 100) * 60);
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVE VIDEO PERFORMANCE (used by handlers for new posts)
// ═══════════════════════════════════════════════════════════════════

/** Base views for a new VidWave video */
export function calcVidWaveBaseViews(params: {
  videoType: string;
  subscribers: number;
  followers: number;
  hype: number;
  productionTier: number;
  linkedRelease: boolean;
  seoTagCount: number;
  eraPhase?: string;
}) {
  const { videoType, subscribers, followers, hype, productionTier, linkedRelease, seoTagCount, eraPhase } = params;

  const typeViews: Record<string, number> = {
    music_video: 5000, lyric_video: 2000, visualizer: 1500, studio_session: 1200,
    songwriting: 900, vlog: 1000, tour_diary: 1400, reaction: 800,
    collab_video: 3000, interview: 700, deep_dive: 600, live_performance: 3000, short: 2500
  };

  const base = typeViews[videoType] || 1000;
  const subMult = 1 + subscribers / 3000;
  const followerMult = 1 + followers / 10000;
  const hypeMult = 1 + hype / 100;
  const prodMult = PRODUCTION_MULTIPLIERS[productionTier] || 1.0;
  const releaseMult = linkedRelease ? 1.4 : 1;
  const seoMult = 1 + Math.min(seoTagCount, 10) * 0.015;
  const eraMult = eraPhase === 'DROP' ? 1.5 : eraPhase === 'TEASE' ? 1.3 : eraPhase === 'SUSTAIN' ? 1.1 : 0.9;

  return Math.floor(base * subMult * followerMult * hypeMult * prodMult * releaseMult * seoMult * eraMult);
}

/** Base views for a new LoopTok post */
export function calcLoopTokBaseViews(params: {
  conceptId: string;
  followers: number;
  hype: number;
  videoLength: string;
  filterViralBoost: number;
  isDuet: boolean;
  hashtagCount: number;
  soundTrend?: string;
  algoMult?: number;
}) {
  const { conceptId, followers, hype, videoLength, filterViralBoost, isDuet, hashtagCount, soundTrend, algoMult = 1.0 } = params;

  const conceptViews: Record<string, number> = {
    dance_challenge: 2000, snippet: 800, lip_sync: 600, skit: 1500,
    behind_scenes: 500, freestyle: 1200, original_sound: 400, trend_reaction: 900,
    announcement: 400, duet: 1100, storytime: 700, get_ready: 600
  };

  const lengthMults: Record<string, number> = { '15s': 0.8, '30s': 1.0, '60s': 1.2, '3m': 1.5 };

  const base = conceptViews[conceptId] || 800;
  const fMult = 1 + followers / 5000;
  const hMult = 1 + hype / 100;
  const lenMult = lengthMults[videoLength] || 1.0;
  const duetMult = isDuet ? 1.35 : 1;
  const hashMult = 1 + Math.min(5, hashtagCount) * 0.06;
  const soundMult = soundTrend === 'rising' ? 1.4 : soundTrend === 'peak' ? 1.2 : soundTrend === 'stable' ? 1.0 : 0.7;

  return Math.floor(base * fMult * hMult * lenMult * filterViralBoost * duetMult * hashMult * soundMult * algoMult);
}

// ─── Legacy compatibility re-exports ────────────────────────────────
// These map old function names to new ones so existing imports don't break
export const canMonetizeVidWave = (account: any, watchTime = 0) => canMonetize('vidwave', account, watchTime);
export const canMonetizeLoopTok = (account: any) => canMonetize('looptok', account);
export const calculateVidWaveRevenue = (p: any) => calcVidWaveRevenue({ ...p, totalWatchTimeSec: p.totalWatchTime });
export const calculateLoopTokRevenue = (p: any) => calcLoopTokRevenue(p);
export const calculateVidWaveRPM = (vt: string, pt: number, cs: string, h: number) => calcVidWaveRPM(vt, pt, cs, h);
export const calculatePassiveSocialGrowth = (player: any, account: any, _turnId: number) => {
  const growth = calcPassiveGrowth({
    platform: account.platform || 'vidwave',
    followers: N(account.followers),
    hype: N(player.hype),
    totalPosts: N(account.total_posts),
    careerStage: player.career_stage
  });
  const backlog = calcBacklogViews({
    platform: account.platform || 'vidwave',
    followers: N(account.followers),
    totalPosts: N(account.total_posts),
    hype: N(player.hype)
  });
  return { followerGrowth: growth, passiveViews: backlog, newFollowers: N(account.followers) + growth };
};
export const calculateWatchTime = (views: number, avgMin = 4) => calcWatchTimeSec(views, avgMin);

// ═══════════════════════════════════════════════════════════════════
// MEDIA OUTLET ACCOUNTS — Fake NPC media accounts for fan/gossip content
// Fan content, emergent videos, and trashy media go to THESE accounts,
// NOT the artist's account. Each has a platform affinity.
// ═══════════════════════════════════════════════════════════════════

export const MEDIA_OUTLET_ACCOUNTS: MediaOutletAccount[] = [
  { id: 'theshaderoom',   name: 'The Shade Room',       handle: '@TheShadeRoom',   icon: '☕', platform_affinity: ['xpress', 'looptok'], sentiment: 'gossip',  viewMult: 3.0, description: 'Celebrity gossip & tea', avatarUrl: 'https://i.imgur.com/kNKelUN.png' },
  { id: 'akademiks',      name: 'DJ Akademiks',         handle: '@Akademiks',      icon: '🎙️', platform_affinity: ['xpress', 'vidwave'], sentiment: 'gossip',  viewMult: 3.0, description: 'Hip-hop commentary & drama', avatarUrl: 'https://i.imgur.com/Lzwd1XK.png' },
  { id: 'popcrave',       name: 'Pop Crave',            handle: '@PopCrave',       icon: '💫', platform_affinity: ['xpress', 'looptok'], sentiment: 'hype',    viewMult: 2.4, description: 'Pop culture updates & stan chatter', avatarUrl: 'https://i.imgur.com/WAnw3lE.png' },
  { id: 'xxl',            name: 'XXL Magazine',         handle: '@XXL',            icon: '�', platform_affinity: ['xpress', 'vidwave'], sentiment: 'critic',  viewMult: 2.2, description: 'Hip-hop journalism & culture', avatarUrl: 'https://i.imgur.com/aBeyYVY.png' },
  { id: 'complexmusic',   name: 'Complex Music',        handle: '@ComplexMusic',   icon: '🎵', platform_affinity: ['xpress', 'vidwave'], sentiment: 'critic',  viewMult: 2.1, description: 'Music news and culture analysis', avatarUrl: 'https://i.imgur.com/Az1gzQI.png' },
  { id: 'dailyrapfacts',  name: 'Daily Rap Facts',      handle: '@DailyRapFacts',  icon: '📈', platform_affinity: ['xpress', 'looptok'], sentiment: 'hype',    viewMult: 2.0, description: 'Rap facts, memes, and chart chatter', avatarUrl: 'https://i.imgur.com/xrtcMGF.png' },
  { id: 'nojumpernews',   name: 'No Jumper News',       handle: '@NoJumperNews',   icon: '�', platform_affinity: ['xpress', 'vidwave'], sentiment: 'gossip',  viewMult: 2.1, description: 'Internet rap drama and updates', avatarUrl: 'https://i.imgur.com/tWhXMQB.png' },
  { id: 'worldstarhh',    name: 'WorldStarHipHop',      handle: '@WorldStarHipHop',icon: '�', platform_affinity: ['xpress', 'vidwave', 'looptok'], sentiment: 'hype', viewMult: 3.6, description: 'Hip-hop culture & viral chaos', avatarUrl: 'https://i.imgur.com/DriuOAU.png' },
  { id: 'bet',            name: 'BET',                  handle: '@BET',            icon: '�', platform_affinity: ['xpress', 'vidwave'], sentiment: 'support', viewMult: 2.3, description: 'Black culture, music, and major moments', avatarUrl: 'https://i.imgur.com/SVtZk0n.png' },
  { id: 'tmz',            name: 'TMZ',                  handle: '@TMZ',            icon: '🚨', platform_affinity: ['xpress', 'vidwave'], sentiment: 'gossip',  viewMult: 3.2, description: 'Breaking celebrity headlines and mess', avatarUrl: 'https://i.imgur.com/k2bKyrP.png' },
  { id: 'lipstickalley',  name: 'Lipstick Alley',       handle: '@LipstickAlley',  icon: '💄', platform_affinity: ['xpress'],            sentiment: 'gossip',  viewMult: 1.9, description: 'Forum-style celebrity chatter and side-eye', avatarUrl: 'https://i.imgur.com/mq0frc2.png' },
  { id: 'onsite',         name: 'Onsite!',              handle: '@Onsite',         icon: '📣', platform_affinity: ['xpress', 'looptok'], sentiment: 'hype',    viewMult: 2.0, description: 'What the timeline is screaming about', avatarUrl: 'https://i.imgur.com/cB7SZPP.png' },
];

/**
 * Pick a random media outlet account, optionally filtered by platform.
 * Uses seed for deterministic selection.
 */
function pickMediaOutletFromList(pool: MediaOutletAccount[], platform?: string, seed = 0): MediaOutletAccount {
  let selectionPool = pool;
  if (platform) {
    const filtered = selectionPool.filter((m) => m.platform_affinity.includes(platform));
    if (filtered.length > 0) selectionPool = filtered;
  }
  return selectionPool[(seed + 7) % selectionPool.length];
}

function pickMediaOutletsFromList(pool: MediaOutletAccount[], count: number, platform?: string, seed = 0): MediaOutletAccount[] {
  let selectionPool = [...pool];
  if (platform) {
    const filtered = selectionPool.filter((m) => m.platform_affinity.includes(platform));
    if (filtered.length > 0) selectionPool = filtered;
  }
  for (let i = selectionPool.length - 1; i > 0; i--) {
    const j = (seed + i * 13 + 5) % (i + 1);
    [selectionPool[i], selectionPool[j]] = [selectionPool[j], selectionPool[i]];
  }
  return selectionPool.slice(0, Math.min(count, selectionPool.length));
}

function normalizeMediaOutletRow(row: any): MediaOutletAccount {
  const metadata = row?.metadata || {};
  const platformAffinity = Array.isArray(metadata.platform_affinity)
    ? metadata.platform_affinity
    : Array.isArray(metadata.platformAffinity)
      ? metadata.platformAffinity
      : ['xpress'];
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    icon: metadata.icon || '📰',
    platform_affinity: platformAffinity,
    sentiment: metadata.sentiment || 'neutral',
    viewMult: Number(metadata.view_mult || metadata.viewMult) || 2,
    description: row.description || '',
    avatarUrl: row.pfp_url || null,
  };
}

export async function listCanonicalMediaOutlets(platform?: string): Promise<MediaOutletAccount[]> {
  const { data, error } = await supabaseAdmin
    .from('media_platforms')
    .select('id, name, handle, description, pfp_url, metadata')
    .contains('metadata', { is_npc: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return platform
      ? MEDIA_OUTLET_ACCOUNTS.filter((outlet) => outlet.platform_affinity.includes(platform))
      : MEDIA_OUTLET_ACCOUNTS;
  }

  const normalized = data.map(normalizeMediaOutletRow);
  const filtered = platform
    ? normalized.filter((outlet) => outlet.platform_affinity.includes(platform))
    : normalized;

  return filtered.length > 0 ? filtered : normalized;
}

export async function pickCanonicalMediaOutlet(platform?: string, seed = 0): Promise<MediaOutletAccount> {
  const outlets = await listCanonicalMediaOutlets(platform);
  return pickMediaOutletFromList(outlets.length > 0 ? outlets : MEDIA_OUTLET_ACCOUNTS, platform, seed);
}

export async function pickCanonicalMediaOutlets(count: number, platform?: string, seed = 0): Promise<MediaOutletAccount[]> {
  const outlets = await listCanonicalMediaOutlets(platform);
  const pool = outlets.length > 0 ? outlets : MEDIA_OUTLET_ACCOUNTS;
  return pickMediaOutletsFromList(pool, count, platform, seed);
}

export function pickMediaOutlet(platform?: string, seed = 0): typeof MEDIA_OUTLET_ACCOUNTS[0] {
  return pickMediaOutletFromList(MEDIA_OUTLET_ACCOUNTS, platform, seed);
}

/**
 * Pick multiple unique media outlets.
 */
export function pickMediaOutlets(count: number, platform?: string, seed = 0): typeof MEDIA_OUTLET_ACCOUNTS {
  return pickMediaOutletsFromList(MEDIA_OUTLET_ACCOUNTS, count, platform, seed);
}

// ═══════════════════════════════════════════════════════════════════
// REACTION CHANNELS — NPC channels that auto-react to player MVs
// ═══════════════════════════════════════════════════════════════════

export const REACTION_CHANNELS = [
  // Standard NPCs
  { id: 'musiccriticx',    name: 'MusicCriticX',      sentiment: 'critic',  icon: '🎯', tagline: 'Breaking down the art.',         viewMult: 1.2, overlay: '🤔' },
  { id: 'hypereactor',     name: 'HypeReactor',       sentiment: 'hype',    icon: '🔥', tagline: 'If it slaps, we REACT.',         viewMult: 1.5, overlay: '🔥' },
  { id: 'realtalkreview',  name: 'RealTalkReviews',   sentiment: 'mixed',   icon: '💬', tagline: 'Honest opinions only.',          viewMult: 1.0, overlay: '😐' },
  { id: 'vibecheckTV',     name: 'VibeCheckTV',       sentiment: 'casual',  icon: '✅', tagline: 'Does it pass the vibe check?',   viewMult: 0.9, overlay: '✨' },
  { id: 'thehatershow',    name: 'The Hater Show',    sentiment: 'hater',   icon: '👎', tagline: 'Someone had to say it.',         viewMult: 1.3, overlay: '🤮' },
  { id: 'firstlisten',     name: 'First Listen Gang',  sentiment: 'hype',    icon: '👀', tagline: 'Blind reactions, real emotions.', viewMult: 1.1, overlay: '🤯' },
  { id: 'barsonly',        name: 'Bars Only',          sentiment: 'critic',  icon: '📝', tagline: 'Lyrics under the microscope.',   viewMult: 0.8, overlay: '🧐' },
  { id: 'soundcheck360',   name: 'SoundCheck 360',     sentiment: 'mixed',   icon: '🎧', tagline: 'Full spectrum audio review.',    viewMult: 1.0, overlay: '📉' },
  { id: 'nofiltermusic',   name: 'No Filter Music',    sentiment: 'hater',   icon: '🚫', tagline: 'Zero sugar-coating.',            viewMult: 1.4, overlay: '🗑️' },
  { id: 'wavecatcher',     name: 'WaveCatcher',        sentiment: 'casual',  icon: '🌊', tagline: 'Catching the next wave.',        viewMult: 0.9, overlay: '🌊' },

  // Celebrity / High-Tier (Triggered by Viral/Runaway only)
  { id: 'akademiks',       name: 'DJ Akademiks',      sentiment: 'gossip',  icon: '🤡', tagline: 'Off the record.',                viewMult: 5.0, overlay: '🥃', isCelebrity: true, avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_kQJZVJLGWQQvVVVQJZVJLGWQQvVVVQJZVJLGWQQvVVVQ=s176-c-k-c0x00ffffff-no-rj' },
  { id: 'kaicenat',        name: 'Kai Cenat',         sentiment: 'hype',    icon: '⚡', tagline: 'W stream.',                      viewMult: 8.0, overlay: '😱', isCelebrity: true, avatarUrl: 'https://yt3.googleusercontent.com/5oUY3tashyxfqsjO5SGhjT4dus8FkN9CsAHwXWISFrdPYii1FudD4ICtLfuCw6-THJsJbgoY=s176-c-k-c0x00ffffff-no-rj' },
  { id: 'djvlad',          name: 'DJ Vlad',           sentiment: 'interview',icon: '👮', tagline: 'The feds are watching.',         viewMult: 3.0, overlay: '🚔', isCelebrity: true, avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_nQJZVJLGWQQvVVVQJZVJLGWQQvVVVQJZVJLGWQQvVVVQ=s176-c-k-c0x00ffffff-no-rj' },
  { id: 'charlamagne',     name: 'Charlamagne',       sentiment: 'critic',  icon: '🫏', tagline: 'Donkey of the Day?',             viewMult: 4.0, overlay: '🫏', isCelebrity: true, avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_pQJZVJLGWQQvVVVQJZVJLGWQQvVVVQJZVJLGWQQvVVVQ=s176-c-k-c0x00ffffff-no-rj' },
];

export const REACTION_TITLE_TEMPLATES: Record<string, string[]> = {
  hype:   ['{channel} REACTS to {artist} - {title} | THIS IS INSANE 🔥', '{channel}: {artist} SNAPPED on "{title}" 😱', '{channel} | {artist} - {title} REACTION *jaw dropped*'],
  critic: ['{channel} breaks down {artist} - {title} | Honest Review', '{channel}: Is {artist}\'s "{title}" actually good? Full Analysis', '{channel} | {artist} - {title} — The Good, The Bad, The Truth'],
  mixed:  ['{channel} reacts to {artist} - {title} | Mixed Feelings...', '{channel}: {artist} "{title}" — Hit or Miss? 🤔', '{channel} | Watching {artist} - {title} for the first time'],
  hater:  ['{channel}: {artist} - {title}... we need to talk 💀', '{channel} | Why {artist}\'s "{title}" Doesn\'t Work', '{channel} ROASTS {artist} - {title} | Unpopular Opinion'],
  casual: ['{channel} vibes to {artist} - {title} ✅', '{channel}: Does {artist} "{title}" pass the vibe check?', '{channel} | Chilling with {artist} - {title}'],
  gossip: ['{channel}: {artist} is FINISHED after this? 😲', '{channel} SPEAKS on {artist} - {title}', 'Is {artist} the new King/Queen? {channel} Reacts'],
  interview:['{channel}: The Truth About {artist} - {title}', '{channel} Flashback: {artist} on "{title}"', 'Did {artist} steal this flow? {channel} Investigates'],
};

export function pickReactionChannels(count = 2, seed = 0, isViral = false, isRunaway = false): typeof REACTION_CHANNELS {
  // Filter pool based on virality/celebrity status
  let pool = REACTION_CHANNELS.filter(c => !c.isCelebrity);
  
  // If viral or runaway, add a chance for celebrities
  if (isViral || isRunaway) {
    const celebrities = REACTION_CHANNELS.filter(c => c.isCelebrity);
    // 30% chance to include a celebrity if viral, 100% if runaway
    if (isRunaway || (seed % 100) < 30) {
      pool = [...pool, ...celebrities];
    }
  }

  // Shuffle using seed
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (seed + i * 7 + 3) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  
  return pool.slice(0, count);
}

export function generateReactionTitle(channel: typeof REACTION_CHANNELS[0], artistName: string, videoTitle: string, seed = 0): string {
  const templates = REACTION_TITLE_TEMPLATES[channel.sentiment] || REACTION_TITLE_TEMPLATES.mixed;
  const template = templates[seed % templates.length];
  return template
    .replace('{channel}', channel.name)
    .replace('{artist}', artistName)
    .replace(/\{title\}/g, videoTitle);
}

// ═══════════════════════════════════════════════════════════════════
// TREND RISK/REWARD — "Jump on Trend" vs "Start a New Trend"
// ═══════════════════════════════════════════════════════════════════

export type TrendState = 'rising' | 'peak' | 'stable' | 'declining';

export interface TrendOutcome {
  viewMultiplier: number;
  followerBonus: number;
  algorithmEffect: 'favorable' | 'neutral' | 'suppressed' | 'none';
  hypeChange: number;
  label: string;
}

/**
 * Jump on an existing trend — safe but reward scales with trend state.
 * Rising trends give the best reward; declining trends risk suppression.
 */
export function calcJumpOnTrendOutcome(trendState: TrendState, seed = Math.random()): TrendOutcome {
  switch (trendState) {
    case 'rising':
      return { viewMultiplier: 1.4, followerBonus: 5, algorithmEffect: 'favorable', hypeChange: 3, label: 'Rising trend — great timing!' };
    case 'peak':
      return { viewMultiplier: 1.2, followerBonus: 2, algorithmEffect: 'neutral', hypeChange: 1, label: 'Peak trend — solid but crowded' };
    case 'stable':
      return { viewMultiplier: 1.0, followerBonus: 0, algorithmEffect: 'none', hypeChange: 0, label: 'Stable trend — no bonus' };
    case 'declining':
      // 30% chance of algorithm suppression
      const suppressed = seed < 0.3;
      return {
        viewMultiplier: 0.7,
        followerBonus: 0,
        algorithmEffect: suppressed ? 'suppressed' : 'neutral',
        hypeChange: suppressed ? -2 : 0,
        label: suppressed ? 'Declining trend — algorithm suppressed!' : 'Declining trend — low engagement'
      };
    default:
      return { viewMultiplier: 1.0, followerBonus: 0, algorithmEffect: 'none', hypeChange: 0, label: 'Unknown trend state' };
  }
}

/**
 * Start a new trend — high risk, high reward.
 * 20% viral success, 50% moderate, 30% flop.
 */
export function calcStartNewTrendOutcome(hype: number, followers: number, seed = Math.random()): TrendOutcome {
  // Higher hype/followers slightly improve odds
  const hypeBonus = Math.min(0.1, hype / 1000);
  const adjustedSeed = seed - hypeBonus;

  if (adjustedSeed < 0.2) {
    // VIRAL SUCCESS (20% base chance)
    return {
      viewMultiplier: 3.0,
      followerBonus: 15,
      algorithmEffect: 'favorable',
      hypeChange: 8,
      label: 'Your trend went VIRAL! 🔥'
    };
  } else if (adjustedSeed < 0.7) {
    // MODERATE SUCCESS (50% base chance)
    return {
      viewMultiplier: 1.3,
      followerBonus: 3,
      algorithmEffect: 'neutral',
      hypeChange: 2,
      label: 'Trend got some traction'
    };
  } else {
    // FLOP (30% base chance)
    return {
      viewMultiplier: 0.5,
      followerBonus: 0,
      algorithmEffect: 'suppressed',
      hypeChange: -5,
      label: 'Trend flopped — algorithm suppressed 💀'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ERA AESTHETIC THEMES — Visual identity for player-defined eras
// ═══════════════════════════════════════════════════════════════════

export const ERA_AESTHETIC_THEMES = [
  { id: 'neon_futurism',  label: 'Neon Futurism',  colors: ['#00f0ff', '#ff00e5'], songGenreBoost: ['electronic', 'synthwave', 'pop'] },
  { id: 'vintage_rb',     label: 'Vintage R&B',    colors: ['#8b4513', '#daa520'], songGenreBoost: ['r&b', 'soul', 'jazz'] },
  { id: 'raw_punk',       label: 'Raw Punk',       colors: ['#ff0000', '#000000'], songGenreBoost: ['punk', 'rock', 'alternative'] },
  { id: 'dark_academia',  label: 'Dark Academia',  colors: ['#2d1b00', '#c4a35a'], songGenreBoost: ['indie', 'folk', 'classical'] },
  { id: 'pastel_pop',     label: 'Pastel Pop',     colors: ['#ffb6c1', '#87ceeb'], songGenreBoost: ['pop', 'dance', 'k-pop'] },
  { id: 'afrofuturism',   label: 'Afrofuturism',   colors: ['#ffd700', '#4b0082'], songGenreBoost: ['afrobeats', 'hip-hop', 'world'] },
  { id: 'minimalist',     label: 'Minimalist',     colors: ['#ffffff', '#000000'], songGenreBoost: ['ambient', 'lo-fi', 'acoustic'] },
  { id: 'trap_luxury',    label: 'Trap Luxury',    colors: ['#ffd700', '#8b0000'], songGenreBoost: ['trap', 'hip-hop', 'drill', 'uk_drill'] },
  { id: 'grunge_revival', label: 'Grunge Revival', colors: ['#556b2f', '#2f4f4f'], songGenreBoost: ['grunge', 'rock', 'metal'] },
  { id: 'tropical_wave',  label: 'Tropical Wave',  colors: ['#00bfff', '#ff6347'], songGenreBoost: ['reggaeton', 'dancehall', 'latin'] },
];
