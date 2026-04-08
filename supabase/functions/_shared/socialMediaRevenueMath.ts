/**
 * SOCIAL MEDIA REVENUE MATH
 * Realistic revenue calculations balanced against core economy
 * Based on 2026 YouTube/TikTok actual rates
 */

import { CAREER_STAGE_RPM_MULTIPLIERS } from './constants/careerStages.ts';

// Supabase returns numeric/decimal columns as strings — coerce to number
function N(v: unknown): number { return Number(v) || 0; }

// YouTube Partner Program requirements
export const YPP_REQUIREMENTS = {
  MIN_SUBSCRIBERS: 1000,
  MIN_WATCH_HOURS: 240000, // 4,000 hours in seconds (4,000 * 60)
  MIN_SHORTS_VIEWS: 10000000,
  ALTERNATIVE_THRESHOLD: 'shorts' // Can use either watch hours OR shorts views
};

// Real-world YouTube RPM rates (Revenue Per Mille - what creators earn per 1K views)
// Based on 2026 data: music content typically earns $2-8 per 1K views
export const VIDWAVE_RPM_TIERS = {
  // Base rates per 1K views by content quality
  music_video: { base: 5.0, premium: 7.0 },      // Music videos perform well
  lyric_video: { base: 3.5, premium: 5.0 },      // Lower engagement
  visualizer: { base: 3.0, premium: 4.5 },       // Visual content
  studio_session: { base: 4.0, premium: 6.0 },   // Authentic content
  songwriting: { base: 3.5, premium: 5.5 },      // Niche but engaged
  vlog: { base: 4.5, premium: 6.5 },            // Personality-driven
  tour_diary: { base: 4.0, premium: 6.0 },      // Behind the scenes
  reaction: { base: 3.0, premium: 4.5 },         // Variable quality
  collab_video: { base: 5.5, premium: 8.0 },    // Cross-audience boost
  interview: { base: 3.5, premium: 5.5 },       // Conversation format
  deep_dive: { base: 4.0, premium: 6.0 },       // Dedicated fans
  live_performance: { base: 6.0, premium: 9.0 }, // High value
  short: { base: 2.0, premium: 3.0 }            // Shorts earn less
};

// LoopTok Creator Fund rates (TikTok pays much less than YouTube)
export const LOOPTOK_RATES = {
  CREATOR_FUND: 0.02,      // $0.02 per 1K views (current rate)
  BRAND_DEAL_BASE: 0.05,   // $0.05 per 1K views for eligible creators
  MARKETPLACE: 0.03        // $0.03 per 1K views for marketplace
};

// Career stage multipliers imported from constants/careerStages.ts

// Hype affects engagement and monetization quality
export const HYPE_RPM_MULTIPLIERS = {
  low: 0.8,      // < 30 hype - low engagement
  medium: 1.0,   // 30-60 hype - normal
  high: 1.2,     // 60-80 hype - good engagement
  viral: 1.4      // > 80 hype - viral boost
};

// Production quality affects viewer retention and ad fill rate
export const PRODUCTION_RPM_MULTIPLIERS = {
  0: 0.6,  // DIY/Phone - poor retention
  1: 0.8,  // Basic - okay retention
  2: 1.0,  // Professional - standard
  3: 1.2,  // High-end - good retention
  4: 1.4,  // Premium - excellent retention
  5: 1.6   // Blockbuster - maximum retention
};

/**
 * Check if VidWave channel can be monetized
 */
export function canMonetizeVidWave(socialAccount: any, totalWatchTime = 0) {
  const subscribers = N(socialAccount.followers);
  const totalViews = N(socialAccount.total_views);
  
  // Check YPP requirements
  const hasSubscribers = subscribers >= YPP_REQUIREMENTS.MIN_SUBSCRIBERS;
  const hasWatchTime = totalWatchTime >= YPP_REQUIREMENTS.MIN_WATCH_HOURS;
  const hasShortsViews = totalViews >= YPP_REQUIREMENTS.MIN_SHORTS_VIEWS;
  
  return hasSubscribers && (hasWatchTime || hasShortsViews);
}

/**
 * Check if LoopTok can be monetized
 */
export function canMonetizeLoopTok(socialAccount: any) {
  const followers = N(socialAccount.followers);
  const totalViews = N(socialAccount.total_views);
  
  // LoopTok monetization: 1K followers + 1M views
  return followers >= 1000 && totalViews >= 1000000;
}

/**
 * Calculate dynamic RPM for VidWave based on multiple factors
 */
export function calculateVidWaveRPM(videoType: string, productionTier: number, careerStage: string, hype: number) {
  const tierRates = (VIDWAVE_RPM_TIERS as any)[videoType] || VIDWAVE_RPM_TIERS.music_video;
  const isPremium = careerStage === 'Mainstream' || careerStage === 'Superstar';
  const baseRPM = isPremium ? tierRates.premium : tierRates.base;
  
  // Apply multipliers
  const careerMultiplier = (CAREER_STAGE_RPM_MULTIPLIERS as any)[careerStage] || 1.0;
  const hypeMultiplier = (HYPE_RPM_MULTIPLIERS as any)[
    hype < 30 ? 'low' : 
    hype < 60 ? 'medium' : 
    hype < 80 ? 'high' : 'viral'
  ] || 1.0;
  const productionMultiplier = (PRODUCTION_RPM_MULTIPLIERS as any)[productionTier] || 1.0;
  
  // Seasonality: Q4 boost (Oct-Dec), January dip
  const month = new Date().getMonth();
  const seasonalityMultiplier = (month >= 9 && month <= 11) ? 1.1 : // Q4 boost
                              (month === 0) ? 0.9 : 1.0; // January dip
  
  const finalRPM = baseRPM * careerMultiplier * hypeMultiplier * 
                   productionMultiplier * seasonalityMultiplier;
  
  return Math.max(0.5, finalRPM); // Minimum $0.50 per 1K views
}

/**
 * Calculate VidWave video revenue
 */
export function calculateVidWaveRevenue(params: any) {
  const {
    views,
    videoType = 'music_video',
    productionTier = 2,
    careerStage = 'Local Act',
    hype = 30,
    socialAccount,
    totalWatchTime = 0
  } = params;
  
  // Check if monetized
  if (!canMonetizeVidWave(socialAccount, totalWatchTime)) {
    return {
      revenue: 0,
      rpm: 0,
      monetized: false,
      reason: 'Channel not eligible for monetization'
    };
  }
  
  const rpm = calculateVidWaveRPM(videoType, productionTier, careerStage, hype);
  const revenue = (views / 1000) * rpm;
  
  return {
    revenue: Math.round(revenue * 100) / 100, // Round to 2 decimal places
    rpm: Math.round(rpm * 100) / 100,
    monetized: true,
    factors: {
      baseRPM: (VIDWAVE_RPM_TIERS as any)[videoType]?.base || 5.0,
      careerMultiplier: (CAREER_STAGE_RPM_MULTIPLIERS as any)[careerStage] || 1.0,
      hypeMultiplier: (HYPE_RPM_MULTIPLIERS as any)[
        hype < 30 ? 'low' : 
        hype < 60 ? 'medium' : 
        hype < 80 ? 'high' : 'viral'
      ] || 1.0,
      productionMultiplier: (PRODUCTION_RPM_MULTIPLIERS as any)[productionTier] || 1.0
    }
  };
}

/**
 * Calculate LoopTok revenue
 */
export function calculateLoopTokRevenue(params: any) {
  const {
    views,
    socialAccount,
    careerStage = 'Local Act',
    isViral = false
  } = params;
  
  // Check if monetized
  if (!canMonetizeLoopTok(socialAccount)) {
    return {
      revenue: 0,
      rate: 0,
      monetized: false,
      reason: 'Account not eligible for monetization'
    };
  }
  
  const followers = N(socialAccount.followers);
  
  // Base creator fund rate
  let rate = LOOPTOK_RATES.CREATOR_FUND;
  
  // Brand deals for larger accounts
  if (followers >= 10000) {
    rate = Math.max(rate, LOOPTOK_RATES.BRAND_DEAL_BASE);
  } else if (followers >= 5000) {
    rate = Math.max(rate, LOOPTOK_RATES.MARKETPLACE);
  }
  
  // Career stage affects brand deal quality
  const careerMultiplier = (CAREER_STAGE_RPM_MULTIPLIERS as any)[careerStage] || 1.0;
  rate *= careerMultiplier;
  
  // Viral boost
  if (isViral) {
    rate *= 1.5;
  }
  
  const revenue = (views / 1000) * rate;
  
  return {
    revenue: Math.round(revenue * 100) / 100,
    rate: Math.round(rate * 100) / 100,
    monetized: true,
    type: followers >= 10000 ? 'brand_deals' : 
          followers >= 5000 ? 'marketplace' : 'creator_fund'
  };
}

/**
 * Calculate passive social media growth (for turn engine)
 */
export function calculatePassiveSocialGrowth(player: any, socialAccount: any, globalTurnId: number) {
  const followers = N(socialAccount.followers);
  const playerFollowers = N(player.followers);
  const hype = N(player.hype);
  
  // Growth rate based on existing followers and hype
  const baseGrowthRate = 0.001; // 0.1% base growth per turn
  const hypeMultiplier = 1 + (hype / 200); // Up to 1.5x at 100 hype
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8x - 1.2x variation
  
  const followerGrowth = Math.floor(
    playerFollowers * baseGrowthRate * hypeMultiplier * randomFactor
  );
  
  // Passive views (much lower than active video views)
  const passiveViews = Math.floor(
    followers * 2 * (1 + hype / 100) * (0.7 + Math.random() * 0.6)
  );
  
  return {
    followerGrowth: Math.max(0, followerGrowth),
    passiveViews: Math.max(0, passiveViews),
    newFollowers: followers + followerGrowth
  };
}

/**
 * Calculate watch time from views and video length
 * Used for YPP eligibility tracking
 */
export function calculateWatchTime(views: number, averageVideoLengthMinutes = 4) {
  // Assume 60% average retention for music videos
  const retentionRate = 0.6;
  const totalMinutesWatched = views * averageVideoLengthMinutes * retentionRate;
  return totalMinutesWatched * 60; // Convert to seconds
}
