/**
 * FANDOM PHASE 6 TUNING CONSTANTS
 * Centralized configuration for all Phase 6 fandom system caps and parameters.
 * Adjust these values to tune gameplay without hunting through code.
 */

// ============================================================================
// PART 1: SUPERFANS GAMEPLAY EFFECTS
// ============================================================================

export const SUPERFANS_TUNING = {
  // First week stream boost
  // At superfans_share = 0.20, boost = +8%
  STREAM_BOOST_MAX: 0.08,
  STREAM_BOOST_SCALE: 0.40, // boost = superfans_share * scale
  
  // Retention boost (reduces decay)
  // At superfans_share = 0.20, decay reduction = -0.004
  RETENTION_BOOST_MAX: 0.004,
  RETENTION_BOOST_SCALE: 0.02, // reduction = superfans_share * scale
  
  // Merch conversion boost
  // At superfans_share = 0.20, boost = +10%
  MERCH_BOOST_MAX: 0.10,
  MERCH_BOOST_SCALE: 0.50, // boost = superfans_share * scale
  
  // Tour turnout boost
  // At superfans_share = 0.20, boost = +6%
  TOUR_BOOST_MAX: 0.06,
  TOUR_BOOST_SCALE: 0.30, // boost = superfans_share * scale
};

// ============================================================================
// PART 2: REGIONAL FANDOM IDENTITY
// ============================================================================

export const REGIONAL_TUNING = {
  // Bias ranges for region personality
  LOYALTY_BIAS_MIN: -0.05,
  LOYALTY_BIAS_MAX: 0.05,
  VOLATILITY_BIAS_MIN: -0.05,
  VOLATILITY_BIAS_MAX: 0.05,
  BRAND_SAFETY_BIAS_MIN: -0.05,
  BRAND_SAFETY_BIAS_MAX: 0.05,
  
  // How much sentiment nudges biases per turn
  SENTIMENT_NUDGE_STRENGTH: 0.002,
};

// ============================================================================
// PART 3: SEGMENT BEHAVIOR REACTIONS — REMOVED
// Segment drift is now handled exclusively by fandomSegmentsEngine.ts.
// Phase 6 pre-pass derives fractional shares from fandom_segments integer counts.
// ============================================================================

// ============================================================================
// PART 4: DEEPER FAN MEMORY
// ============================================================================

export const MEMORY_TUNING = {
  // Nostalgia boost during inactivity
  INACTIVITY_THRESHOLD_TURNS: 4,     // No releases for N turns
  NOSTALGIA_LEGACY_THRESHOLD: 0.5,   // Legacy imprint must be >= this
  NOSTALGIA_CHURN_REDUCTION_MAX: 0.05, // Max churn multiplier reduction
  NOSTALGIA_DISCOVERY_BOOST_MAX: 0.03, // Max discovery quality boost
  NOSTALGIA_GROWTH_RATE: 0.015,      // Per turn of inactivity
  
  // Forgiveness threshold for scandal recovery
  SCANDAL_HIGH_THRESHOLD: 0.6,       // Above this = slow recovery
  SCANDAL_RECOVERY_RATE_NORMAL: 0.02, // Per turn with stable sentiment
  SCANDAL_RECOVERY_RATE_SLOW: 0.008,  // Per turn when scandal high
  STABLE_SENTIMENT_MIN: 45,          // Sentiment must be >= this
  STABLE_SENTIMENT_MAX: 65,          // Sentiment must be <= this
};

// ============================================================================
// PART 5: CROSS-SYSTEM HOOKS
// ============================================================================

export const CROSS_SYSTEM_TUNING = {
  // Platform engagement modifiers
  HEAT_SPIKE_MODIFIER_MAX: 0.05,     // +5% spike chance at high heat
  HEAT_SPIKE_THRESHOLD: 0.7,         // Heat must be >= this
  FATIGUE_SUSTAIN_PENALTY_MAX: 0.05, // -5% sustain at high fatigue
  FATIGUE_SUSTAIN_THRESHOLD: 0.6,    // Fatigue must be >= this
  
  // Brand deal quality modifiers
  LOYALTY_BRAND_BOOST_MAX: 0.06,     // +6% quality at high loyalty
  SCANDAL_BRAND_PENALTY_MAX: 0.06,   // -6% quality at high scandal
  BRAND_SAFETY_BIAS_SCALE: 0.60,     // How much region bias affects quality
};

// ============================================================================
// RELEASE SATURATION (already implemented, included for completeness)
// ============================================================================

export const SATURATION_TUNING = {
  WINDOW_SIZE_TURNS: 14,
  ALLOWED_RELEASES: 2,
  EXCESS_PENALTY: 0.03,
  UNRELATED_PENALTY: 0.02,
  ROLLOUT_RELIEF: 0.03,
  ERA_SWITCH_PENALTY_2: 0.02,
  ERA_SWITCH_PENALTY_3PLUS: 0.03,
  MAX_FATIGUE_DELTA: 0.12,
};
