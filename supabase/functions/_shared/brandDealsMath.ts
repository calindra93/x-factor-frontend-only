/**
 * BRAND DEALS MATH — Functions for offer generation, probability curves,
 * payout calculations, overexposure, and KPI evaluation.
 *
 * DB access: Optional catalog lookup with in-memory fallback for testing.
 * Side effects: Console warnings for missing catalog (deduplicated in test env).
 *
 * Idempotency: offer generation uses seeded RNG (player_id + turn_id + slot).
 * Exclusivity: enforced by caller via DB partial unique index + transactional check.
 * Separation: brand_deal_revenue is its own bucket, never mixed with VidWave ad rev.
 */

import { getGenreTrait } from './genreTraits.ts';

const BRAND_DEALS_WARN_ONCE_KEY = '__xf_brandDealsWarnedMessages';

function isTestEnv(): boolean {
  try {
    return typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test';
  } catch {
    return false;
  }
}

function getWarnedMessages(): Set<string> {
  const globalState = globalThis as typeof globalThis & {
    [BRAND_DEALS_WARN_ONCE_KEY]?: Set<string>;
  };
  if (!globalState[BRAND_DEALS_WARN_ONCE_KEY]) {
    globalState[BRAND_DEALS_WARN_ONCE_KEY] = new Set<string>();
  }
  return globalState[BRAND_DEALS_WARN_ONCE_KEY]!;
}

function warnBrandDeals(message: string, detail?: string) {
  if (!isTestEnv()) {
    if (detail) {
      console.warn(message, detail);
    } else {
      console.warn(message);
    }
    return;
  }

  const warnedMessages = getWarnedMessages();
  const key = detail ? `${message}::${detail}` : message;
  if (warnedMessages.has(key)) return;
  warnedMessages.add(key);

  if (detail) {
    console.warn(message, detail);
  } else {
    console.warn(message);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────
export type DealTier = 'local' | 'regional' | 'national' | 'global' | 'luxury';
export type DealCategory = 'fashion' | 'tech' | 'beverage' | 'food' | 'auto' | 'beauty' | 'gaming' | 'sports' | 'finance' | 'lifestyle';
export type PayoutType = 'signing' | 'per_turn' | 'bonus' | 'penalty';
// NOTE: Xpress is intentionally excluded from PlatformScope — it has no brand deal KPI tracking.
// Valid scopes: 'instavibe' | 'vidwave' | 'looptok' | 'cross_platform'
export type PlatformScope = 'instavibe' | 'vidwave' | 'looptok' | 'cross_platform';
export type DeliverableType = 'post' | 'video' | 'story' | 'cross_platform';
export type BrandLoyaltyTier = 'cold' | 'neutral' | 'warm' | 'favored' | 'elite';

export interface BrandCatalogEntry {
  id: string;
  name: string;
  tier: string;           // bronze | silver | gold | platinum
  category_id: string;
  prestige_score: number; // 1-10
  risk_score: number;     // 1-10
  exclusivity_days: number;
  base_payout_min: number;
  base_payout_max: number;
  audience_tags: Record<string, number>;
  controversy_type: string | null;
  platform_preference: string[] | null;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface OfferParams {
  followers: number;
  clout: number;
  hype: number;
  careerStage: string;
  genre?: string;
  regionShare: Record<string, number>;   // e.g. { US: 0.4, Europe: 0.3 }
  archetypeShare: Record<string, number>; // e.g. { stans: 15, core: 40, casual: 35 }
  activeTrends: string[];                 // e.g. ['VIRAL_SENSATION', 'COMEBACK']
  activeContractCount: number;
  overexposureScore: number;
  reputationModifier: number;
  safetyRating: number;
  /** Optional: Amplifi festival brand boost (0–100). Temporarily elevates offer probability. */
  festivalBrandBoost?: number;
  /** Optional: Average scene reputation across player's cities (0–100). Local deals bonus. */
  sceneReputationBoost?: number;
  strongestSceneRegion?: string | null;
  strongestSceneReputation?: number;
  strongestSceneLabel?: 'weak' | 'solid' | 'strong' | null;
  preferredSceneRegions?: string[];
  /** Optional: Global fandom morale (0–100). High morale = +10% offer chance; low = −10%. */
  fanMorale?: number;
  /** Optional: Global brand trust (0–100). >75 = +1 tier quality; <30 = −20% chance, −1 tier. */
  brandTrust?: number;
}

export interface GeneratedOffer {
  brand_id: string | null;
  brand_name: string;
  category: DealCategory;
  tier: DealTier;
  exclusivity_category: string;
  regions_targeted: string[];
  duration_turns: number;
  signing_bonus: number;
  per_turn_fee: number;
  performance_bonus: number;
  kpis: Record<string, number>;
  risk_model: { cancellation_chance_base: number; scandal_sensitivity: number; overexposure_sensitivity: number };
  offer_seed: number;
  generation_reason: string;
  controversy_risk: string;
  brand_safety_score: number;
  platform_scope: PlatformScope[];
  primary_platform: PlatformScope;
  deliverable_type: DeliverableType;
  deliverable_count_required: number;
  audience_tags: Record<string, number>;
  brand_prestige_score: number;
  scene_target_region: string | null;
  scene_strength_label: string | null;
  scene_bonus_pct: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function N(v: unknown): number { return Number(v) || 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

export function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function normalizeBrandKey(brandName: unknown): string {
  return String(brandName || '').trim().toLowerCase();
}

export function clampLoyaltyScore(score: number): number {
  return clamp(Math.round(score * 100) / 100, -10, 10);
}

export function getBrandLoyaltyTier(score: number): BrandLoyaltyTier {
  const clamped = clampLoyaltyScore(score);
  if (clamped <= -4) return 'cold';
  if (clamped <= 2) return 'neutral';
  if (clamped <= 5) return 'warm';
  if (clamped <= 8) return 'favored';
  return 'elite';
}

function getSceneStrengthLabel(score?: number | null): 'weak' | 'solid' | 'strong' | null {
  const value = N(score);
  if (value >= 75) return 'strong';
  if (value >= 45) return 'solid';
  if (value > 0) return 'weak';
  return null;
}

// ─── Career Lane → Brand Category Affinity ──────────────────────────────────
// Maps each career lane to the brand deal categories it naturally aligns with.
// Values are additive fit bonuses (0.05–0.15) applied on top of persona fit.
type LaneKey = 'commercial_heat' | 'cultural_influence' | 'live_draw' | 'industry_respect' | 'core_fan_devotion';

const LANE_CATEGORY_AFFINITY: Record<LaneKey, Partial<Record<DealCategory, number>>> = {
  commercial_heat:    { fashion: 0.12, beverage: 0.10, tech: 0.10, beauty: 0.08, lifestyle: 0.10, food: 0.06 },
  cultural_influence: { fashion: 0.15, beauty: 0.12, lifestyle: 0.10, tech: 0.08 },
  live_draw:          { sports: 0.15, beverage: 0.12, gaming: 0.10, lifestyle: 0.08, auto: 0.06 },
  industry_respect:   { auto: 0.15, finance: 0.12, fashion: 0.10, tech: 0.10, lifestyle: 0.08 },
  core_fan_devotion:  { gaming: 0.12, lifestyle: 0.12, food: 0.10, beverage: 0.08, tech: 0.06 },
};

// Lane payout multiplier: brands pay more for artists whose career lane aligns
const LANE_PAYOUT_MULTIPLIER: Record<LaneKey, Partial<Record<DealCategory, number>>> = {
  commercial_heat:    { fashion: 1.10, beverage: 1.08, tech: 1.08, beauty: 1.06, lifestyle: 1.08 },
  cultural_influence: { fashion: 1.12, beauty: 1.10, lifestyle: 1.08 },
  live_draw:          { sports: 1.12, beverage: 1.10, gaming: 1.08 },
  industry_respect:   { auto: 1.12, finance: 1.10, fashion: 1.08, tech: 1.08 },
  core_fan_devotion:  { gaming: 1.10, lifestyle: 1.10, food: 1.08 },
};

// Algorithm mood → category weighting shifts (mood favors certain brand categories)
const MOOD_CATEGORY_BOOST: Record<string, Partial<Record<DealCategory, number>>> = {
  hype:       { gaming: 0.08, tech: 0.06, beverage: 0.06 },
  chill:      { lifestyle: 0.08, beauty: 0.06, food: 0.06 },
  aggressive: { sports: 0.08, auto: 0.06, gaming: 0.06 },
  nostalgic:  { fashion: 0.08, lifestyle: 0.06, food: 0.06 },
  experimental: { tech: 0.10, beauty: 0.06, gaming: 0.06 },
};

/**
 * Compute the lane-fit bonus for a given deal category.
 * Returns additive bonus (0–0.15) based on dominant + secondary lane alignment.
 */
export function computeLaneFitBonus(
  careerLaneData: { dominant_lane?: string | null; secondary_lane?: string | null; scores?: Record<string, number> } | null,
  category: DealCategory
): number {
  if (!careerLaneData) return 0;
  let bonus = 0;
  const dominant = careerLaneData.dominant_lane as LaneKey | null;
  const secondary = careerLaneData.secondary_lane as LaneKey | null;
  if (dominant && LANE_CATEGORY_AFFINITY[dominant]) {
    bonus += LANE_CATEGORY_AFFINITY[dominant][category] || 0;
  }
  // Secondary lane contributes at 40% weight
  if (secondary && LANE_CATEGORY_AFFINITY[secondary]) {
    bonus += (LANE_CATEGORY_AFFINITY[secondary][category] || 0) * 0.4;
  }
  return clamp(bonus, 0, 0.18);
}

/**
 * Compute the lane payout multiplier for a given deal category.
 * Returns multiplier (1.0–1.12) based on lane alignment.
 */
export function computeLanePayoutMultiplier(
  careerLaneData: { dominant_lane?: string | null; secondary_lane?: string | null } | null,
  category: DealCategory
): number {
  if (!careerLaneData) return 1;
  const dominant = careerLaneData.dominant_lane as LaneKey | null;
  if (dominant && LANE_PAYOUT_MULTIPLIER[dominant]) {
    return LANE_PAYOUT_MULTIPLIER[dominant][category] || 1;
  }
  return 1;
}

/**
 * Compute mood-based category fit bonus.
 */
export function computeMoodCategoryBonus(algorithmMood: string | null, category: DealCategory): number {
  if (!algorithmMood) return 0;
  const mood = algorithmMood.toLowerCase();
  return MOOD_CATEGORY_BOOST[mood]?.[category] || 0;
}

function getSceneTierShift(params: OfferParams): number {
  const strongest = N(params.strongestSceneReputation);
  const average = N(params.sceneReputationBoost);
  if (strongest >= 82 || average >= 72) return 1;
  return 0;
}

function getSceneTierWeightBoost(params: OfferParams): number {
  const strongest = N(params.strongestSceneReputation);
  if (strongest >= 75) return 18;
  if (strongest >= 55) return 8;
  return 0;
}

function getScenePayoutMultiplier(params: OfferParams, tier: DealTier): number {
  const strongest = N(params.strongestSceneReputation);
  const average = N(params.sceneReputationBoost);
  const sceneBase = Math.max(strongest, average * 0.9);
  if (sceneBase <= 0) return 1;
  const tierWeight = tier === 'local' ? 1 : tier === 'regional' ? 0.9 : tier === 'national' ? 0.65 : tier === 'global' ? 0.35 : 0.2;
  const bonusPct = clamp(((sceneBase - 40) / 45) * 0.12 * tierWeight, 0, 0.12 * tierWeight);
  return Math.round((1 + bonusPct) * 1000) / 1000;
}

// ─── Career stage canonical mapping ─────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  'Unknown': 0, 'Local Artist': 1, 'Local Buzz': 2, 'Underground Artist': 3,
  'Cult Favorite': 4, 'Breakout Artist': 5, 'Mainstream Artist': 6,
  'A-List Star': 7, 'Global Superstar': 8, 'Legacy Icon': 9,
  // Legacy names (backward compat)
  'Underground': 3, 'Local Act': 2, 'Indie Darling': 4,
  'Rising Star': 5, 'Mainstream': 6, 'Superstar': 8, 'Legend': 9,
};

function stageNum(stage: string): number { return STAGE_ORDER[stage] ?? 0; }

// ─── Probability curves ────────────────────────────────────────────────────
// Chance of receiving ANY offer this turn, by career stage order
// Raised early-stage probabilities (stages 0–4) to fix near-zero offer visibility for new players.
// Previously 10%/20% for Local/Buzz meant most 3-turn cadence cycles produced nothing.
// With 24-turn cadence, each cycle is more impactful so probability must be higher.
const OFFER_CHANCE_BY_STAGE: number[] = [
  0.20, // 0: Unknown — was 0.05, raised to give new players something to engage with
  0.35, // 1: Local Artist — was 0.10
  0.50, // 2: Local Buzz — was 0.20
  0.65, // 3: Underground Artist — was 0.30
  0.78, // 4: Cult Favorite — was 0.45
  0.60, // 5: Breakout Artist
  0.80, // 6: Mainstream Artist
  0.90, // 7: A-List Star
  0.95, // 8: Global Superstar
  0.98, // 9: Legacy Icon
];

// Tier distribution weights by career stage order (local, regional, national, global, luxury)
const TIER_WEIGHTS_BY_STAGE: number[][] = [
  [90, 10,  0,  0,  0], // Unknown
  [80, 18,  2,  0,  0], // Local Artist
  [60, 30,  8,  2,  0], // Local Buzz
  [40, 35, 20,  5,  0], // Underground Artist
  [20, 30, 35, 12,  3], // Cult Favorite
  [10, 20, 40, 25,  5], // Breakout Artist
  [ 5, 15, 35, 35, 10], // Mainstream Artist
  [ 2,  8, 25, 45, 20], // A-List Star
  [ 0,  5, 15, 50, 30], // Global Superstar
  [ 0,  2, 10, 45, 43], // Legacy Icon
];

const TIERS: DealTier[] = ['local', 'regional', 'national', 'global', 'luxury'];

// Duration ranges by tier [min, max] in turns
const DURATION_BY_TIER: Record<DealTier, [number, number]> = {
  local:    [1, 3],
  regional: [2, 5],
  national: [3, 8],
  global:   [5, 12],
  luxury:   [8, 20],
};

// Per-turn fee ranges by tier [min, max]
const PER_TURN_FEE_BY_TIER: Record<DealTier, [number, number]> = {
  local:    [100,    600],
  regional: [500,   2500],
  national: [2000,  10000],
  global:   [8000,  40000],
  luxury:   [25000, 120000],
};

// Signing bonus as fraction of total contract value [min, max]
const SIGNING_BONUS_FRAC: Record<DealTier, [number, number]> = {
  local:    [0.02, 0.10],
  regional: [0.05, 0.15],
  national: [0.10, 0.20],
  global:   [0.12, 0.25],
  luxury:   [0.15, 0.35],
};

// Performance bonus as fraction of total contract value [min, max]
const PERF_BONUS_FRAC: Record<DealTier, [number, number]> = {
  local:    [0.03, 0.10],
  regional: [0.05, 0.15],
  national: [0.10, 0.20],
  global:   [0.12, 0.25],
  luxury:   [0.15, 0.35],
};

// Platform-specific payout models and bonus conditions
export const PLATFORM_PAYOUT_CONFIGS: Record<string, {
  baseMultiplier: number;
  videoBonus: number;
  crossPlatformBonus: number;
  performanceThresholds: {
    engagement: { min: number; bonus: number };
    views: { min: number; bonus: number };
    viral: { bonus: number };
  };
}> = {
  vidwave: {
    baseMultiplier: 1.2,        // VidWave pays 20% more base rate
    videoBonus: 0.5,           // 50% bonus for video content
    crossPlatformBonus: 0.3,   // 30% bonus for cross-platform
    performanceThresholds: {
      engagement: { min: 0.08, bonus: 0.25 },  // 8%+ engagement = 25% bonus
      views: { min: 50000, bonus: 0.2 },       // 50K+ views = 20% bonus
      viral: { bonus: 1.0 }                    // Viral = 100% bonus
    }
  },
  looptok: {
    baseMultiplier: 1.1,        // LoopTok pays 10% more base rate
    videoBonus: 0.8,           // 80% bonus for video content (LoopTok loves video)
    crossPlatformBonus: 0.2,   // 20% bonus for cross-platform
    performanceThresholds: {
      engagement: { min: 0.12, bonus: 0.3 },   // 12%+ engagement = 30% bonus
      views: { min: 30000, bonus: 0.15 },       // 30K+ views = 15% bonus
      viral: { bonus: 0.8 }                    // Viral = 80% bonus
    }
  },
  instavibe: {
    baseMultiplier: 1.0,        // InstaVibe is baseline (1.0)
    videoBonus: 0.3,           // 30% bonus for video content
    crossPlatformBonus: 0.25,  // 25% bonus for cross-platform
    performanceThresholds: {
      engagement: { min: 0.06, bonus: 0.2 },   // 6%+ engagement = 20% bonus
      views: { min: 25000, bonus: 0.1 },       // 25K+ views = 10% bonus
      viral: { bonus: 0.6 }                    // Viral = 60% bonus
    }
  }
};

// Calculate platform-specific payout
export function calculatePlatformPayout(
  baseFee: number,
  platform: string,
  deliverableType: string,
  platformScope: string[],
  isViral: boolean = false,
  engagementRate: number = 0,
  views: number = 0
): {
  adjustedFee: number;
  bonusConditions: any;
  appliedBonuses: string[];
} {
  const config = PLATFORM_PAYOUT_CONFIGS[platform] || PLATFORM_PAYOUT_CONFIGS.instavibe;
  const appliedBonuses: string[] = [];
  let adjustedFee = baseFee * config.baseMultiplier;
  
  const bonusConditions = {
    video_bonus_applied: false,
    cross_platform_bonus_applied: false,
    engagement_bonus_applied: false,
    views_bonus_applied: false,
    viral_bonus_applied: false,
    total_bonus_multiplier: 1.0
  };
  
  // Video content bonus
  if (deliverableType === 'video') {
    adjustedFee *= (1 + config.videoBonus);
    bonusConditions.video_bonus_applied = true;
    appliedBonuses.push(`Video content +${Math.round(config.videoBonus * 100)}%`);
  }
  
  // Cross-platform bonus
  if (platformScope.length > 1) {
    adjustedFee *= (1 + config.crossPlatformBonus);
    bonusConditions.cross_platform_bonus_applied = true;
    appliedBonuses.push(`Cross-platform +${Math.round(config.crossPlatformBonus * 100)}%`);
  }
  
  // Performance bonuses
  if (engagementRate >= config.performanceThresholds.engagement.min) {
    adjustedFee *= (1 + config.performanceThresholds.engagement.bonus);
    bonusConditions.engagement_bonus_applied = true;
    appliedBonuses.push(`High engagement +${Math.round(config.performanceThresholds.engagement.bonus * 100)}%`);
  }
  
  if (views >= config.performanceThresholds.views.min) {
    adjustedFee *= (1 + config.performanceThresholds.views.bonus);
    bonusConditions.views_bonus_applied = true;
    appliedBonuses.push(`High views +${Math.round(config.performanceThresholds.views.bonus * 100)}%`);
  }
  
  if (isViral) {
    adjustedFee *= (1 + config.performanceThresholds.viral.bonus);
    bonusConditions.viral_bonus_applied = true;
    appliedBonuses.push(`Viral content +${Math.round(config.performanceThresholds.viral.bonus * 100)}%`);
  }
  
  bonusConditions.total_bonus_multiplier = adjustedFee / baseFee;
  
  return {
    adjustedFee: Math.round(adjustedFee),
    bonusConditions,
    appliedBonuses
  };
}

// Tier mapping from database tiers to deal tiers
export const TIER_MAPPING: Record<string, DealTier> = {
  'bronze': 'local',
  'silver': 'regional', 
  'national': 'national',
  'gold': 'global',
  'platinum': 'luxury'
};

// Reverse mapping for database queries
export const REVERSE_TIER_MAPPING: Record<DealTier, string> = {
  'local': 'bronze',
  'regional': 'silver',
  'national': 'national', 
  'global': 'gold',
  'luxury': 'platinum'
};

// Category mapping from deal categories to database categories
export const CATEGORY_MAPPING: Partial<Record<DealCategory, string>> = {
  'fashion': 'fashion',
  'tech': 'tech',
  'beverage': 'beverage',
  'food': 'food',
  'auto': 'auto',
  'beauty': 'beauty',
  'gaming': 'gaming',
  'sports': 'fitness',
  'finance': 'services',
  'lifestyle': 'fashion' // Map lifestyle to fashion for now
};

// Brand names by category and tier (legacy - kept as fallback)
const BRAND_CATALOG: Record<DealCategory, Record<DealTier, string[]>> = {
  fashion:   { local: ['Street Threads', 'Indie Stitch'], regional: ['Urban Edge', 'Metro Style'], national: ['Apex Wear', 'Nova Fashion'], global: ['Luxe Maison', 'Prestige Couture'], luxury: ['House of Élite', 'Sovereign Fashion'] },
  tech:      { local: ['Beat Lab Gear', 'SoundWire'], regional: ['Pulse Audio', 'Neon Tech'], national: ['Apex Audio', 'Crest Digital'], global: ['Titan Electronics', 'Vertex Tech'], luxury: ['Platinum Sound', 'Diamond Audio'] },
  beverage:  { local: ['Indie Coffee Co.', 'Local Brew'], regional: ['Pulse Energy', 'Metro Sips'], national: ['Crest Beverages', 'Apex Drinks'], global: ['Global Spirits', 'Titan Beverages'], luxury: ['Prestige Champagne', 'Royal Reserve'] },
  food:      { local: ['Corner Kitchen', 'Fresh Bites'], regional: ['Metro Eats', 'Urban Plate'], national: ['Apex Foods', 'Crest Kitchen'], global: ['Global Gourmet', 'Titan Foods'], luxury: ['Maison Culinaire', 'Royal Table'] },
  auto:      { local: ['Local Motors', 'City Rides'], regional: ['Metro Auto', 'Urban Drive'], national: ['Apex Motors', 'Crest Auto'], global: ['Titan Motors', 'Global Drive'], luxury: ['Prestige Motors', 'Royal Auto'] },
  beauty:    { local: ['Glow Up Co.', 'Indie Beauty'], regional: ['Nova Cosmetics', 'Metro Glow'], national: ['Apex Beauty', 'Crest Cosmetics'], global: ['Titan Beauty', 'Global Glow'], luxury: ['Maison Beauté', 'Royal Cosmetics'] },
  gaming:    { local: ['Pixel Play', 'Indie Games'], regional: ['Metro Gaming', 'Urban Play'], national: ['Apex Games', 'Crest Gaming'], global: ['Titan Gaming', 'Global Play'], luxury: ['Elite Gaming', 'Prestige Play'] },
  sports:    { local: ['Street Athletics', 'Indie Sport'], regional: ['Metro Fit', 'Urban Athletics'], national: ['Rhythm Athletics', 'Apex Sport'], global: ['Titan Sport', 'Global Athletics'], luxury: ['Prestige Sport', 'Royal Athletics'] },
  finance:   { local: ['Local Credit', 'Indie Finance'], regional: ['Metro Bank', 'Urban Finance'], national: ['Apex Finance', 'Crest Bank'], global: ['Titan Finance', 'Global Bank'], luxury: ['Prestige Capital', 'Royal Finance'] },
  lifestyle: { local: ['Vibe Co.', 'Indie Living'], regional: ['Metro Life', 'Urban Vibe'], national: ['Apex Living', 'Crest Lifestyle'], global: ['Titan Lifestyle', 'Global Living'], luxury: ['Maison Vie', 'Royal Living'] },
};

const ALL_CATEGORIES: DealCategory[] = ['fashion', 'tech', 'beverage', 'food', 'auto', 'beauty', 'gaming', 'sports', 'finance', 'lifestyle'];

// Category → platform scope mapping: which categories can target which platforms
// Categories not listed default to instavibe-only
const CATEGORY_PLATFORM_SCOPE: Partial<Record<DealCategory, { platforms: PlatformScope[]; videoWeight: number }>> = {
  tech:      { platforms: ['instavibe', 'vidwave'], videoWeight: 0.7 },       // Tech brands love video reviews
  gaming:    { platforms: ['instavibe', 'vidwave'], videoWeight: 0.85 },      // Gaming = heavy video
  sports:    { platforms: ['instavibe', 'vidwave'], videoWeight: 0.65 },      // Athlete content + video
  auto:      { platforms: ['instavibe', 'vidwave'], videoWeight: 0.70 },      // Car reviews + posts
  lifestyle: { platforms: ['instavibe', 'vidwave', 'looptok'], videoWeight: 0.55 }, // Lifestyle vlogging + reels
  food:      { platforms: ['instavibe', 'vidwave', 'looptok'], videoWeight: 0.60 }, // Cooking content + reels
  beverage:  { platforms: ['instavibe', 'vidwave', 'looptok'], videoWeight: 0.50 }, // Taste tests + short-form
  fashion:   { platforms: ['instavibe', 'looptok'], videoWeight: 0.75 },      // Fashion loves LoopTok content
  beauty:    { platforms: ['instavibe', 'looptok'], videoWeight: 0.80 },      // Beauty tutorials thrive on LoopTok
  finance:   { platforms: ['instavibe', 'vidwave'], videoWeight: 0.45 },      // Finance explainer videos
};

// Archetype → category affinity weights (higher = more likely)
const ARCHETYPE_CATEGORY_AFFINITY: Record<string, Partial<Record<DealCategory, number>>> = {
  stans:    { fashion: 2, beauty: 2, lifestyle: 1.5 },
  core:     { tech: 1.5, gaming: 1.5, sports: 1.3 },
  casual:   { beverage: 1.5, food: 1.5, lifestyle: 1.3 },
  critics:  { tech: 1.3, finance: 1.2 },
  haters:   {}, // no affinity
};

// Trend modifiers
const TREND_MODIFIERS: Record<string, { offerChanceMult: number; tierShift: number; durationMult: number; payoutMult: number; cancellationMult: number }> = {
  VIRAL_SENSATION: { offerChanceMult: 1.8, tierShift: 1, durationMult: 0.6, payoutMult: 1.5, cancellationMult: 0.5 },
  COMEBACK:        { offerChanceMult: 1.4, tierShift: 0, durationMult: 1.0, payoutMult: 1.2, cancellationMult: 0.8 },
  GOAT:            { offerChanceMult: 1.3, tierShift: 2, durationMult: 1.5, payoutMult: 2.0, cancellationMult: 0.3 },
  LEGACY_ARTIST:   { offerChanceMult: 1.1, tierShift: 1, durationMult: 1.3, payoutMult: 1.4, cancellationMult: 0.4 },
  FLOP_ERA:        { offerChanceMult: 0.4, tierShift: -2, durationMult: 0.5, payoutMult: 0.5, cancellationMult: 2.0 },
  CAREER_SLUMP:    { offerChanceMult: 0.5, tierShift: -1, durationMult: 0.7, payoutMult: 0.6, cancellationMult: 1.8 },
  DORMANT:         { offerChanceMult: 0.3, tierShift: -2, durationMult: 0.5, payoutMult: 0.4, cancellationMult: 2.5 },
  ONE_HIT_WONDER:  { offerChanceMult: 0.8, tierShift: 0, durationMult: 0.7, payoutMult: 0.8, cancellationMult: 1.5 },
  PASSED_PRIME:    { offerChanceMult: 0.6, tierShift: -1, durationMult: 0.8, payoutMult: 0.7, cancellationMult: 1.3 },
};

// ─── Constants ──────────────────────────────────────────────────────────────
export const MAX_CONCURRENT_CONTRACTS = 5;
// Refresh once per real day (1 turn/hr × 24 hrs). Previously 3 turns = 3hrs, causing
// near-instant churn that players never saw. 24-turn cadence + 72-turn TTL = offers
// stay visible for 3 real days, matching typical casual player check-in frequency.
export const OFFER_REFRESH_CADENCE = 24;
// 72 turns = 3 real days. Previously 8 turns = 8 hours — daily players missed ~95% of offers.
export const OFFER_TTL_TURNS = 72;
export const MAX_ACTIVE_OFFERS = 12;
export const OVEREXPOSURE_THRESHOLD = 3; // deals above this count start penalties
export const OVEREXPOSURE_PER_DEAL = 15; // score added per active deal above threshold
export const OVEREXPOSURE_TIER_WEIGHT: Record<DealTier, number> = { local: 0.5, regional: 0.8, national: 1.0, global: 1.5, luxury: 2.0 };
export const OVEREXPOSURE_SOFT_RAMP_MULT = 0.2; // slight image dilution begins before the hard threshold
export const OVEREXPOSURE_QUALITY_PENALTY = 0.15; // per 10 overexposure points, offer quality drops 15%
export const OVEREXPOSURE_CANCEL_BOOST = 0.02; // per 10 overexposure points, cancellation chance +2%

// ─── Offer generation ───────────────────────────────────────────────────────

/** Should we generate offers this turn? */
export function shouldGenerateOffers(globalTurnId: number, currentOfferCount: number): boolean {
  return globalTurnId % OFFER_REFRESH_CADENCE === 0 || currentOfferCount === 0;
}

/** How many offers to generate */
export function offerCount(params: OfferParams, seed: number): number {
  const sn = stageNum(params.careerStage);
  const baseChance = OFFER_CHANCE_BY_STAGE[clamp(sn, 0, 9)];

  // Apply trend modifiers
  let chanceMult = 1.0;
  for (const t of params.activeTrends) {
    chanceMult *= (TREND_MODIFIERS[t]?.offerChanceMult ?? 1.0);
  }

  // Overexposure reduces offer quality and quantity
  const overexposurePenalty = Math.max(0, params.overexposureScore / 100) * 0.3;
  const safetyInfluence = 1 + ((clamp(params.safetyRating, 0, 100) - 50) / 50) * 0.15;
  // Festival brand boost: up to +40% offer chance multiplier from Amplifi performance
  const festivalBoostMult = 1 + ((params.festivalBrandBoost ?? 0) / 100) * 0.4;
  // Scene reputation boost: up to +20% from strong local scene presence
  const sceneBoostMult = 1 + ((params.sceneReputationBoost ?? 0) / 100) * 0.2;
  // Fandom morale: energized fans create buzz brands want to attach to
  const morale = params.fanMorale ?? 50;
  const moraleMult = morale > 70 ? 1.10 : morale < 40 ? 0.90 : 1.0;
  // Brand trust: low trust is a red flag for brand partners
  const trust = params.brandTrust ?? 50;
  const trustChanceMult = trust < 30 ? 0.80 : 1.0;
  const finalChance = clamp(baseChance * chanceMult * params.reputationModifier * safetyInfluence * festivalBoostMult * sceneBoostMult * moraleMult * trustChanceMult - overexposurePenalty, 0, 1);

  const roll = seededRandom(seed);
  if (roll > finalChance) return 0;

  // 1-4 offers based on stage
  const maxOffers = sn <= 3 ? 2 : sn <= 6 ? 3 : 4;
  const slotsAvailable = MAX_ACTIVE_OFFERS - 0; // caller passes current count
  return clamp(Math.floor(1 + seededRandom(seed + 1) * maxOffers), 1, slotsAvailable);
}

/** Pick a tier for an offer */
export function pickTier(params: OfferParams, seed: number): DealTier {
  const sn = clamp(stageNum(params.careerStage), 0, 9);
  const weights = [...TIER_WEIGHTS_BY_STAGE[sn]];
  const genreTraits = getGenreTrait(params.genre);

  // Apply trend tier shifts
  let tierShift = 0;
  for (const t of params.activeTrends) {
    tierShift += (TREND_MODIFIERS[t]?.tierShift ?? 0);
  }

  // Shift weights: positive shift moves weight toward higher tiers
  if (tierShift > 0) {
    for (let i = 0; i < tierShift && weights.length > 1; i++) {
      const removed = weights.shift()!;
      weights[weights.length - 1] += removed;
    }
    while (weights.length < 5) weights.unshift(0);
  } else if (tierShift < 0) {
    for (let i = 0; i < Math.abs(tierShift) && weights.length > 1; i++) {
      const removed = weights.pop()!;
      weights[0] += removed;
    }
    while (weights.length < 5) weights.push(0);
  }

  const sceneTierShift = getSceneTierShift(params);
  if (sceneTierShift > 0) {
    for (let i = 0; i < sceneTierShift && weights.length > 1; i++) {
      const removed = weights.shift()!;
      weights[weights.length - 1] += removed;
    }
    while (weights.length < 5) weights.unshift(0);
  }

  const sceneWeightBoost = getSceneTierWeightBoost(params);
  if (sceneWeightBoost > 0) {
    weights[0] = Math.max(0, weights[0] - sceneWeightBoost);
    weights[1] += Math.round(sceneWeightBoost * 0.7);
    weights[2] += Math.round(sceneWeightBoost * 0.3);
  }

  const gravityDelta = clamp((genreTraits.culturalGravityFactor - 0.5) / 0.4, -1, 1);
  if (gravityDelta > 0) {
    const uplift = Math.round(gravityDelta * 10);
    weights[0] = Math.max(0, weights[0] - uplift);
    weights[1] += Math.round(uplift * 0.55);
    weights[2] += Math.round(uplift * 0.3);
    weights[3] += Math.round(uplift * 0.15);
  } else if (gravityDelta < 0) {
    const penalty = Math.round(Math.abs(gravityDelta) * 10);
    weights[0] += Math.round(penalty * 0.55);
    weights[1] += Math.round(penalty * 0.25);
    weights[2] = Math.max(0, weights[2] - Math.round(penalty * 0.45));
    weights[3] = Math.max(0, weights[3] - Math.round(penalty * 0.35));
    weights[4] = Math.max(0, weights[4] - Math.round(penalty * 0.2));
  }

  // Brand trust tier shift: high trust unlocks better offers, low trust drags them down
  const trustTierShift = (params.brandTrust ?? 50) > 75 ? 1 : (params.brandTrust ?? 50) < 30 ? -1 : 0;
  if (trustTierShift > 0) {
    for (let i = 0; i < trustTierShift && weights.length > 1; i++) {
      const removed = weights.shift()!;
      weights[weights.length - 1] += removed;
    }
    while (weights.length < 5) weights.unshift(0);
  } else if (trustTierShift < 0) {
    for (let i = 0; i < Math.abs(trustTierShift) && weights.length > 1; i++) {
      const removed = weights.pop()!;
      weights[0] += removed;
    }
    while (weights.length < 5) weights.push(0);
  }

  const total = weights.reduce((s, w) => s + w, 0);
  let cursor = seededRandom(seed) * total;
  for (let i = 0; i < TIERS.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return TIERS[i];
  }
  return 'local';
}

/** Pick a category weighted by archetype affinity */
export function pickCategory(params: OfferParams, seed: number): DealCategory {
  const weights: number[] = ALL_CATEGORIES.map(() => 1.0);

  // Apply archetype affinity
  for (const [archetype, pct] of Object.entries(params.archetypeShare)) {
    const affinity = ARCHETYPE_CATEGORY_AFFINITY[archetype.toLowerCase()];
    if (!affinity || N(pct) < 5) continue;
    const weight = N(pct) / 100;
    for (let i = 0; i < ALL_CATEGORIES.length; i++) {
      const catAffinity = affinity[ALL_CATEGORIES[i]];
      if (catAffinity) weights[i] += catAffinity * weight;
    }
  }

  const total = weights.reduce((s, w) => s + w, 0);
  let cursor = seededRandom(seed) * total;
  for (let i = 0; i < ALL_CATEGORIES.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return ALL_CATEGORIES[i];
  }
  return 'lifestyle';
}

/** Pick regions based on player's regional presence */
export function pickRegions(params: OfferParams, tier: DealTier, seed: number): string[] {
  const preferredSceneRegions = (params.preferredSceneRegions || []).filter(Boolean);
  const allRegions = Object.entries(params.regionShare)
    .filter(([, share]) => N(share) > 0.05)
    .sort((a, b) => N(b[1]) - N(a[1]))
    .map(([region]) => region);

  const orderedRegions = [...new Set([...preferredSceneRegions, ...allRegions])];

  if (orderedRegions.length === 0) {
    return params.strongestSceneRegion ? [params.strongestSceneRegion] : ['United States'];
  }

  const sceneLead = params.strongestSceneRegion && orderedRegions.includes(params.strongestSceneRegion)
    ? params.strongestSceneRegion
    : orderedRegions[0];

  const sceneLabel = params.strongestSceneLabel || getSceneStrengthLabel(params.strongestSceneReputation);
  const shouldForceLead = sceneLead && (sceneLabel === 'strong' || (sceneLabel === 'solid' && seededRandom(seed + 91) > 0.35));

  switch (tier) {
    case 'local': return [shouldForceLead ? sceneLead : orderedRegions[0]];
    case 'regional': return shouldForceLead ? [...new Set([sceneLead, ...orderedRegions])].slice(0, 2) : orderedRegions.slice(0, 2);
    case 'national': return shouldForceLead ? [...new Set([sceneLead, ...orderedRegions])].slice(0, 3) : orderedRegions.slice(0, 3);
    case 'global':
    case 'luxury': return orderedRegions.slice(0, Math.min(orderedRegions.length, 5));
    default: return [orderedRegions[0]];
  }
}

/** Get full brand catalog entries from database with fallback to legacy catalog */
async function getBrandsFromDatabase(category: DealCategory, tier: DealTier): Promise<BrandCatalogEntry[]> {
  try {
    const { supabaseAdmin } = await import('./lib/supabaseAdmin.ts');
    
    const dbCategory = CATEGORY_MAPPING[category];
    const dbTier = REVERSE_TIER_MAPPING[tier];
    
    if (!dbCategory || !dbTier) {
      warnBrandDeals(`[BrandDeals] No mapping for category:${category} or tier:${tier}`);
      return legacyFallback(category, tier);
    }
    
    const { data: catRows } = await supabaseAdmin
      .from('brand_categories')
      .select('id')
      .eq('name', dbCategory);
    const catIds = (catRows || []).map((c: any) => c.id);
    if (catIds.length === 0) {
      warnBrandDeals(`[BrandDeals] No category_id for ${dbCategory}`);
      return legacyFallback(category, tier);
    }

    const { data: brands, error } = await supabaseAdmin
      .from('brands')
      .select('id, name, tier, category_id, prestige_score, risk_score, exclusivity_days, base_payout_min, base_payout_max, audience_tags, controversy_type, platform_preference, is_active, metadata')
      .eq('is_active', true)
      .eq('tier', dbTier)
      .in('category_id', catIds)
      .order('prestige_score', { ascending: false });
    
    if (error || !brands || brands.length === 0) {
      warnBrandDeals(`[BrandDeals] Database query failed for ${category}/${tier}:`, error?.message);
      return legacyFallback(category, tier);
    }
    
    return brands.map((b: any) => ({
      id: b.id,
      name: b.name,
      tier: b.tier,
      category_id: b.category_id,
      prestige_score: N(b.prestige_score),
      risk_score: N(b.risk_score),
      exclusivity_days: N(b.exclusivity_days),
      base_payout_min: N(b.base_payout_min),
      base_payout_max: N(b.base_payout_max),
      audience_tags: b.audience_tags || {},
      controversy_type: b.controversy_type || null,
      platform_preference: b.platform_preference || null,
      is_active: b.is_active !== false,
      metadata: b.metadata || {},
    }));
  } catch (err: any) {
    warnBrandDeals('[BrandDeals] Database brand selection failed:', err.message);
    return legacyFallback(category, tier);
  }
}

/** Build synthetic BrandCatalogEntry from legacy hardcoded catalog for fallback */
function legacyFallback(category: DealCategory, tier: DealTier): BrandCatalogEntry[] {
  const names = BRAND_CATALOG[category]?.[tier] || ['Unknown Brand'];
  const [fMin, fMax] = PER_TURN_FEE_BY_TIER[tier];
  return names.map(name => ({
    id: '',
    name,
    tier: REVERSE_TIER_MAPPING[tier] || 'bronze',
    category_id: '',
    prestige_score: { local: 3, regional: 5, national: 7, global: 9, luxury: 10 }[tier] || 3,
    risk_score: { local: 2, regional: 3, national: 4, global: 6, luxury: 8 }[tier] || 3,
    exclusivity_days: { local: 0, regional: 0, national: 7, global: 14, luxury: 21 }[tier] || 0,
    base_payout_min: fMin,
    base_payout_max: fMax,
    audience_tags: {},
    controversy_type: null,
    platform_preference: null,
    is_active: true,
    metadata: { legacy: true },
  }));
}

/** Generate a single offer */
export async function generateOffer(params: OfferParams, globalTurnId: number, slot: number): Promise<GeneratedOffer> {
  const baseSeed = globalTurnId * 1000 + slot * 37;
  const genreTraits = getGenreTrait(params.genre);
  const tier = pickTier(params, baseSeed + 1);
  const category = pickCategory(params, baseSeed + 2);
  const regions = pickRegions(params, tier, baseSeed + 3);
  const sceneStrengthLabel = params.strongestSceneLabel || getSceneStrengthLabel(params.strongestSceneReputation);
  const sceneTargetRegion = params.strongestSceneRegion || regions[0] || null;

  // Duration
  const [dMin, dMax] = DURATION_BY_TIER[tier];
  let durationMult = 1.0;
  for (const t of params.activeTrends) durationMult *= (TREND_MODIFIERS[t]?.durationMult ?? 1.0);
  const duration = clamp(Math.round((dMin + seededRandom(baseSeed + 4) * (dMax - dMin)) * durationMult), 1, 30);

  // ── Brand selection (full catalog entry) ──────────────────────────────────
  let selectedBrand: BrandCatalogEntry;
  try {
    const brandPool = await getBrandsFromDatabase(category, tier);
    selectedBrand = brandPool[Math.floor(seededRandom(baseSeed + 8) * brandPool.length)];
  } catch (err: any) {
    warnBrandDeals('[BrandDeals] Database brand selection failed, using legacy:', err.message);
    const fallbackPool = legacyFallback(category, tier);
    selectedBrand = fallbackPool[Math.floor(seededRandom(baseSeed + 8) * fallbackPool.length)];
  }

  // ── Per-turn fee: prefer brand catalog payout ranges, fallback to tier defaults
  const hasBrandPayouts = selectedBrand.base_payout_min > 0 || selectedBrand.base_payout_max > 0;
  const fMin = hasBrandPayouts ? selectedBrand.base_payout_min : PER_TURN_FEE_BY_TIER[tier][0];
  const fMax = hasBrandPayouts ? selectedBrand.base_payout_max : PER_TURN_FEE_BY_TIER[tier][1];
  let payoutMult = 1.0;
  for (const t of params.activeTrends) payoutMult *= (TREND_MODIFIERS[t]?.payoutMult ?? 1.0);
  // Prestige score influences payout: 1-10 → 0.8x-1.2x
  const prestigePayoutMult = 0.8 + (clamp(selectedBrand.prestige_score, 1, 10) - 1) / 9 * 0.4;
  // Overexposure reduces payout quality
  const overexposureQualityMult = Math.max(0.3, 1 - (params.overexposureScore / 100) * OVEREXPOSURE_QUALITY_PENALTY);
  const safetyPayoutMult = 1 + ((clamp(params.safetyRating, 0, 100) - 50) / 50) * 0.15;
  const scenePayoutMult = getScenePayoutMultiplier(params, tier);
  const genrePayoutMult = clamp(0.92 + (genreTraits.culturalGravityFactor * 0.2), 0.92, 1.12);
  const perTurnFee = Math.floor((fMin + seededRandom(baseSeed + 5) * (fMax - fMin)) * payoutMult * overexposureQualityMult * params.reputationModifier * safetyPayoutMult * prestigePayoutMult * scenePayoutMult * genrePayoutMult);
  const sceneBonusPct = Math.max(0, Math.round((scenePayoutMult - 1) * 100));

  // Total contract value for bonus calculations
  const totalValue = perTurnFee * duration;

  // Signing bonus
  const [sbMin, sbMax] = SIGNING_BONUS_FRAC[tier];
  const signingBonus = Math.floor(totalValue * (sbMin + seededRandom(baseSeed + 6) * (sbMax - sbMin)));

  // Performance bonus
  const [pbMin, pbMax] = PERF_BONUS_FRAC[tier];
  const performanceBonus = Math.floor(totalValue * (pbMin + seededRandom(baseSeed + 7) * (pbMax - pbMin)));

  // KPIs (scaled by tier)
  const kpiBase = { local: 1, regional: 2, national: 5, global: 10, luxury: 20 }[tier] || 1;
  const kpis: Record<string, number> = {
    required_posts: tier === 'local'
      ? 1
      : clamp(1 + Math.floor(seededRandom(baseSeed + 9) * 2.5), 1, 3),
    required_engagement_rate: Math.floor((3 + seededRandom(baseSeed + 10) * 5) * 10) / 10,
    required_reach: Math.floor(kpiBase * 1000 * (1 + seededRandom(baseSeed + 11) * 3)),
  };

  // Risk model — brand risk_score (1-10) influences cancellation sensitivity
  let cancellationMult = 1.0;
  for (const t of params.activeTrends) cancellationMult *= (TREND_MODIFIERS[t]?.cancellationMult ?? 1.0);
  const brandRiskInfluence = 1 + (clamp(selectedBrand.risk_score, 1, 10) - 5) / 10 * 0.3; // risk 1→0.88x, 5→1.0x, 10→1.15x
  const cancellationChanceBase = clamp(0.02 * cancellationMult * brandRiskInfluence + params.overexposureScore * OVEREXPOSURE_CANCEL_BOOST / 100, 0, 0.5);
  const riskModel = {
    cancellation_chance_base: Math.round(cancellationChanceBase * 1000) / 1000,
    scandal_sensitivity: tier === 'luxury' ? 0.8 : tier === 'global' ? 0.6 : 0.3,
    overexposure_sensitivity: tier === 'luxury' ? 0.9 : tier === 'global' ? 0.7 : 0.4,
  };

  // Controversy risk — factor in brand's controversy_type
  const safetyRiskMult = 1 - ((clamp(params.safetyRating, 0, 100) - 50) / 50) * 0.15;
  const riskScore = riskModel.cancellation_chance_base * 10 * safetyRiskMult;
  const controversyRisk = selectedBrand.controversy_type
    ? (selectedBrand.controversy_type === 'scandal' ? 'high' : 'medium')
    : (riskScore >= 0.2 ? 'high' : riskScore >= 0.08 ? 'medium' : 'low');
  const brandSafetyScore = clamp(Math.floor(90 - riskScore * 50), 20, 95);

  // Exclusivity: luxury and global deals always have exclusivity in their category
  const exclusivityCategory = (tier === 'luxury' || tier === 'global') ? category : (seededRandom(baseSeed + 12) > 0.7 ? category : null);

  // Platform scope: deterministic based on category + tier + seed
  const catPlatformConfig = CATEGORY_PLATFORM_SCOPE[category];
  let platformScope: PlatformScope[] = ['instavibe'];
  let primaryPlatform: PlatformScope = 'instavibe';
  let deliverableType: DeliverableType = 'post';
  let deliverableCountRequired = kpis.required_posts || 1;

  if (catPlatformConfig && catPlatformConfig.platforms.length > 1) {
    const platformRoll = seededRandom(baseSeed + 13);
    const videoWeight = catPlatformConfig.videoWeight;

    if (catPlatformConfig.platforms.includes('looptok') && catPlatformConfig.platforms.includes('vidwave')) {
      // Triple-platform categories (lifestyle, food, beverage) — distribute across all three
      if (platformRoll < 0.40) {
        platformScope = ['looptok'];
        primaryPlatform = 'looptok';
        deliverableType = 'post';
        deliverableCountRequired = kpis.required_posts || 1;
      } else if (platformRoll < 0.75) {
        platformScope = ['vidwave'];
        primaryPlatform = 'vidwave';
        deliverableType = 'video';
        deliverableCountRequired = clamp(Math.floor(kpis.required_posts * 0.5), 1, 3);
      } else {
        platformScope = ['instavibe'];
        primaryPlatform = 'instavibe';
        deliverableType = 'post';
        deliverableCountRequired = kpis.required_posts || 1;
      }
    } else if (catPlatformConfig.platforms.includes('looptok')) {
      // LoopTok categories (fashion, beauty)
      if (platformRoll < 0.80) {
        platformScope = ['looptok'];
        primaryPlatform = 'looptok';
        deliverableType = 'post';
        deliverableCountRequired = kpis.required_posts || 1;
      } else {
        platformScope = ['instavibe', 'looptok'];
        primaryPlatform = 'instavibe';
        deliverableType = 'cross_platform';
        deliverableCountRequired = clamp(kpis.required_posts, 1, 3);
      }
    } else {
      // VidWave categories (tech, gaming, sports, auto, finance)
      if (platformRoll < videoWeight) {
        platformScope = ['vidwave'];
        primaryPlatform = 'vidwave';
        deliverableType = 'video';
        deliverableCountRequired = clamp(Math.floor(kpis.required_posts * 0.5), 1, 3);
      } else if (platformRoll < videoWeight + 0.15) {
        platformScope = ['instavibe', 'vidwave'];
        primaryPlatform = 'instavibe';
        deliverableType = 'cross_platform';
        deliverableCountRequired = clamp(kpis.required_posts, 1, 3);
      } else {
        platformScope = ['instavibe'];
        primaryPlatform = 'instavibe';
        deliverableType = 'post';
        deliverableCountRequired = kpis.required_posts || 1;
      }
    }
  } else {
    // For categories not in CATEGORY_PLATFORM_SCOPE, add some randomness to platform selection
    const platformRoll = seededRandom(baseSeed + 13);
    if (platformRoll < 0.35) {
      // 35% chance for VidWave-only
      platformScope = ['vidwave'];
      primaryPlatform = 'vidwave';
      deliverableType = 'video';
      deliverableCountRequired = clamp(Math.floor(kpis.required_posts * 0.5), 1, 3);
    } else if (platformRoll < 0.60) {
      // 25% chance for LoopTok-only
      platformScope = ['looptok'];
      primaryPlatform = 'looptok';
      deliverableType = 'post';
      deliverableCountRequired = kpis.required_posts || 1;
    } else if (platformRoll < 0.75) {
      // 15% chance for cross-platform
      platformScope = ['instavibe', 'vidwave'];
      primaryPlatform = 'instavibe';
      deliverableType = 'cross_platform';
      deliverableCountRequired = clamp(kpis.required_posts, 1, 3);
    } else {
      // 25% InstaVibe-only
      platformScope = ['instavibe'];
      primaryPlatform = 'instavibe';
      deliverableType = 'post';
      deliverableCountRequired = kpis.required_posts || 1;
    }
  }

  // ── Brand platform_preference override ──────────────────────────────────
  // If brand has a specific platform preference, nudge toward it
  if (selectedBrand.platform_preference && selectedBrand.platform_preference.length > 0) {
    const prefs = selectedBrand.platform_preference as PlatformScope[];
    const currentInPrefs = prefs.includes(primaryPlatform);
    if (!currentInPrefs && prefs.length > 0) {
      // Brand prefers a different platform — nudge with 25% probability (category logic takes priority)
      if (seededRandom(baseSeed + 14) < 0.25) {
        const newPrimary = prefs[Math.floor(seededRandom(baseSeed + 15) * prefs.length)];
        primaryPlatform = newPrimary;
        if (prefs.length === 1) {
          platformScope = [newPrimary];
          deliverableType = newPrimary === 'vidwave' ? 'video' : 'post';
          if (newPrimary === 'vidwave') {
            deliverableCountRequired = clamp(Math.floor(kpis.required_posts * 0.5), 1, 3);
          }
        } else {
          platformScope = prefs;
          deliverableType = prefs.length > 1 ? 'cross_platform' : (newPrimary === 'vidwave' ? 'video' : 'post');
        }
      }
    }
  }

  return {
    brand_id: selectedBrand.id || null,
    brand_name: selectedBrand.name,
    category,
    tier,
    exclusivity_category: exclusivityCategory as string,
    regions_targeted: regions,
    duration_turns: duration,
    signing_bonus: signingBonus,
    per_turn_fee: perTurnFee,
    performance_bonus: performanceBonus,
    kpis,
    risk_model: riskModel,
    offer_seed: baseSeed,
    generation_reason: `stage=${params.careerStage} tier=${tier} platform=${primaryPlatform} trends=[${params.activeTrends.join(',')}]`,
    controversy_risk: controversyRisk,
    brand_safety_score: brandSafetyScore,
    platform_scope: platformScope,
    primary_platform: primaryPlatform,
    deliverable_type: deliverableType,
    deliverable_count_required: deliverableCountRequired,
    audience_tags: selectedBrand.audience_tags || {},
    brand_prestige_score: selectedBrand.prestige_score,
    scene_target_region: sceneTargetRegion,
    scene_strength_label: sceneStrengthLabel,
    scene_bonus_pct: sceneBonusPct,
  };
}

// ─── Overexposure calculation ───────────────────────────────────────────────

export function calculateOverexposure(activeContracts: Array<{ tier: string }>): number {
  if (activeContracts.length <= 1) return 0;
  let score = 0;
  const softRampCount = Math.min(activeContracts.length, OVEREXPOSURE_THRESHOLD) - 1;
  for (let i = 0; i < softRampCount; i++) {
    const contract = activeContracts[1 + i];
    const tierWeight = OVEREXPOSURE_TIER_WEIGHT[(contract.tier as DealTier)] || 1.0;
    score += OVEREXPOSURE_PER_DEAL * OVEREXPOSURE_SOFT_RAMP_MULT * tierWeight;
  }
  if (activeContracts.length <= OVEREXPOSURE_THRESHOLD) return Math.round(score * 100) / 100;
  const excess = activeContracts.length - OVEREXPOSURE_THRESHOLD;
  for (let i = 0; i < excess; i++) {
    const contract = activeContracts[OVEREXPOSURE_THRESHOLD + i];
    const tierWeight = OVEREXPOSURE_TIER_WEIGHT[(contract.tier as DealTier)] || 1.0;
    score += OVEREXPOSURE_PER_DEAL * tierWeight;
  }
  return Math.round(score * 100) / 100;
}

// ─── KPI evaluation ─────────────────────────────────────────────────────────

export function evaluateKPIs(
  kpis: Record<string, number>,
  progress: Record<string, number>
): { met: boolean; progressPct: number; details: Record<string, { required: number; current: number; met: boolean }> } {
  const details: Record<string, { required: number; current: number; met: boolean }> = {};
  let totalRequired = 0;
  let totalMet = 0;

  for (const [key, required] of Object.entries(kpis)) {
    const current = N(progress[key]);
    const met = current >= required;
    details[key] = { required, current, met };
    totalRequired++;
    if (met) totalMet++;
  }

  return {
    met: totalRequired > 0 && totalMet === totalRequired,
    progressPct: totalRequired > 0 ? Math.floor((totalMet / totalRequired) * 100) : 100,
    details,
  };
}

// ─── Cancellation check ─────────────────────────────────────────────────────

export function shouldCancel(
  contract: {
    risk_model: any;
    tier: string;
    persona_fit_score?: number;
    deliverable_count_required?: number;
    deliverable_count_completed?: number;
    end_turn_id?: number;
  },
  overexposureScore: number,
  activeTrends: string[],
  seed: number,
  currentTurn?: number
): { cancel: boolean; reason: string } {
  const risk = contract.risk_model || {};
  let chance = N(risk.cancellation_chance_base);

  // Trend-based cancellation boost
  for (const t of activeTrends) {
    if (t === 'FLOP_ERA' || t === 'CAREER_SLUMP') chance += 0.05;
    if (t === 'DORMANT') chance += 0.08;
  }

  // Overexposure boost
  chance += (overexposureScore / 100) * N(risk.overexposure_sensitivity) * 0.1;

  // Off-brand sponsorships are slightly riskier, but still viable.
  if (N(contract.persona_fit_score) < 0.25) {
    chance += 0.03;
  }

  // Last-turn missed deliverables create extra cancellation pressure.
  const deliverablesRemaining = Math.max(0, N(contract.deliverable_count_required) - N(contract.deliverable_count_completed));
  const turnsRemaining = currentTurn == null ? 999 : Math.max(0, N(contract.end_turn_id) - N(currentTurn));
  if (turnsRemaining <= 1 && deliverablesRemaining > 0) {
    chance += 0.03;
  }

  chance = clamp(chance, 0, 0.5);
  const roll = seededRandom(seed);

  if (roll < chance) {
    if (overexposureScore > 30) return { cancel: true, reason: 'Brand pulled out due to overexposure — too many competing deals diluted your image.' };
    const trendReasons = activeTrends.filter(t => ['FLOP_ERA', 'CAREER_SLUMP', 'DORMANT'].includes(t));
    if (trendReasons.length > 0) return { cancel: true, reason: `Brand cancelled due to career downturn (${trendReasons.join(', ')}).` };
    return { cancel: true, reason: 'Brand decided to end the partnership early.' };
  }

  return { cancel: false, reason: '' };
}

// ─── Ambassador offer generation ─────────────────────────────────────────────

export interface AmbassadorGateCheck {
  eligible: boolean;
  failedGates: string[];
}

export interface AmbassadorOfferParams {
  params: OfferParams;
  eraAlignmentScore: number;
  hasActivePeakControversy: boolean;
  brandAffinityByKey: Map<string, { affinity_score: number; brand_key: string }>;
  industryRespectScore: number;
}

/** Check if player meets all ambassador unlock gates */
export function checkAmbassadorGates(opts: AmbassadorOfferParams): AmbassadorGateCheck {
  const failed: string[] = [];
  const sn = stageNum(opts.params.careerStage);
  if (sn < 5) failed.push(`career_stage (${opts.params.careerStage}, need Breakout Artist+)`);
  if (opts.params.safetyRating < 65) failed.push(`brand_safety (${Math.round(opts.params.safetyRating)}, need 65+)`);
  if (opts.eraAlignmentScore < 60) failed.push(`era_alignment (${Math.round(opts.eraAlignmentScore)}, need 60+)`);
  if (opts.hasActivePeakControversy) failed.push('active_peak_controversy');
  if (opts.industryRespectScore < 50) failed.push(`industry_respect (${Math.round(opts.industryRespectScore)}, need 50+)`);
  return { eligible: failed.length === 0, failedGates: failed };
}

/** Should an ambassador offer be generated this turn? Low probability even when eligible. */
export function shouldGenerateAmbassadorOffer(globalTurnId: number, seed: number, activeAmbassadorCount: number): boolean {
  // Max 1 ambassador deal active at a time
  if (activeAmbassadorCount >= 1) return false;
  // Only attempt every 6 turns (every ~6 hours RL)
  if (globalTurnId % 6 !== 0) return false;
  // ~15% chance when eligible
  return seededRandom(seed) < 0.15;
}

/** Generate an ambassador offer — higher payout, longer duration, mandatory exclusivity */
export async function generateAmbassadorOffer(
  params: OfferParams,
  globalTurnId: number,
  eligibleBrandKey: string | null,
  brandAffinityMap: Map<string, { affinity_score: number; brand_key: string }>,
): Promise<GeneratedOffer & { deal_type: 'ambassador'; royalty_pct: number; total_contract_value: number }> {
  const baseSeed = globalTurnId * 2000 + 777;

  // Ambassador deals are always global or luxury tier
  const tierRoll = seededRandom(baseSeed + 1);
  const tier: DealTier = tierRoll < 0.65 ? 'global' : 'luxury';
  const category = pickCategory(params, baseSeed + 2);
  const regions = pickRegions(params, tier, baseSeed + 3);

  // Duration: 120-168 turns (5-7 RL days × 24 turns/day)
  const duration = 120 + Math.floor(seededRandom(baseSeed + 4) * 49); // 120-168

  // Brand selection — prefer the brand they have affinity with
  let selectedBrand: BrandCatalogEntry;
  try {
    const brandPool = await getBrandsFromDatabase(category, tier);
    if (eligibleBrandKey && brandPool.length > 0) {
      const preferred = brandPool.find(b => normalizeBrandKey(b.name) === eligibleBrandKey);
      selectedBrand = preferred || brandPool[Math.floor(seededRandom(baseSeed + 8) * brandPool.length)];
    } else {
      selectedBrand = brandPool[Math.floor(seededRandom(baseSeed + 8) * brandPool.length)];
    }
  } catch {
    const fallbackPool = legacyFallback(category, tier);
    selectedBrand = fallbackPool[Math.floor(seededRandom(baseSeed + 8) * fallbackPool.length)];
  }

  // Total contract value: $500K - $1M
  const totalValue = 500000 + Math.floor(seededRandom(baseSeed + 5) * 500001);
  const perTurnFee = Math.floor(totalValue / duration);

  // Signing bonus: 10-20% of total
  const signingBonus = Math.floor(totalValue * (0.10 + seededRandom(baseSeed + 6) * 0.10));

  // Performance bonus: 15-25% of total
  const performanceBonus = Math.floor(totalValue * (0.15 + seededRandom(baseSeed + 7) * 0.10));

  // Royalty: 15-30%
  const royaltyPct = Math.round((15 + seededRandom(baseSeed + 9) * 15) * 10) / 10;

  // KPIs — lifestyle integration style (fewer hard post counts, focus on engagement/reach)
  const kpis: Record<string, number> = {
    required_engagement_rate: Math.floor((5 + seededRandom(baseSeed + 10) * 4) * 10) / 10, // 5-9%
    required_reach: Math.floor(50000 + seededRandom(baseSeed + 11) * 150000), // 50K-200K
    required_posts: clamp(Math.floor(duration / 48), 2, 3), // 1 post per ~2 RL days, max 3
  };

  // Risk model — ambassadors are more scandal-sensitive
  const riskModel = {
    cancellation_chance_base: 0.01,
    scandal_sensitivity: 0.9,
    overexposure_sensitivity: 0.7,
  };

  // Platform — ambassador deals are always cross-platform
  const platformScope: PlatformScope[] = ['instavibe', 'vidwave', 'looptok'];
  const primaryPlatform: PlatformScope = 'instavibe';

  return {
    brand_id: selectedBrand.id || null,
    brand_name: selectedBrand.name,
    category,
    tier,
    exclusivity_category: category, // mandatory category exclusive
    regions_targeted: regions,
    duration_turns: duration,
    signing_bonus: signingBonus,
    per_turn_fee: perTurnFee,
    performance_bonus: performanceBonus,
    kpis,
    risk_model: riskModel,
    offer_seed: baseSeed,
    generation_reason: `ambassador stage=${params.careerStage} tier=${tier} loyalty=${eligibleBrandKey || 'any'}`,
    controversy_risk: 'low',
    brand_safety_score: clamp(Math.floor(92 - selectedBrand.risk_score * 2), 60, 98),
    platform_scope: platformScope,
    primary_platform: primaryPlatform,
    deliverable_type: 'cross_platform' as DeliverableType,
    deliverable_count_required: kpis.required_posts,
    audience_tags: selectedBrand.audience_tags || {},
    brand_prestige_score: selectedBrand.prestige_score,
    scene_target_region: params.strongestSceneRegion || null,
    scene_strength_label: params.strongestSceneLabel || null,
    scene_bonus_pct: 0,
    deal_type: 'ambassador' as const,
    royalty_pct: royaltyPct,
    total_contract_value: totalValue,
  };
}

// ─── Reputation modifier from trends ────────────────────────────────────────

export function reputationFromTrends(trends: string[]): number {
  let mod = 1.0;
  for (const t of trends) {
    if (t === 'GOAT') mod *= 1.3;
    else if (t === 'LEGACY_ARTIST') mod *= 1.2;
    else if (t === 'VIRAL_SENSATION') mod *= 1.15;
    else if (t === 'COMEBACK') mod *= 1.1;
    else if (t === 'FLOP_ERA') mod *= 0.6;
    else if (t === 'CAREER_SLUMP') mod *= 0.7;
    else if (t === 'DORMANT') mod *= 0.5;
    else if (t === 'ONE_HIT_WONDER') mod *= 0.8;
    else if (t === 'PASSED_PRIME') mod *= 0.75;
  }
  return Math.round(mod * 100) / 100;
}
