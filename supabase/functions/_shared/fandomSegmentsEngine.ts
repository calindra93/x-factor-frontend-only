/**
 * FANDOM SEGMENTS ENGINE — Pure Logic Layer
 * ──────────────────────────────────────────
 * Deterministic, no DB access, no side effects.
 * Handles: segment drift, flip triggers, fan_morale, brand_trust, pillar effects, labor output.
 *
 * Segment types: og | core | casual | trend_chaser | stan | critic
 */

import { CAREER_STAGE_FANDOM_DRIFT_MULT } from './constants/careerStages.ts';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const N = (v: unknown): number => Number(v) || 0;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type SegmentType = 'og' | 'core' | 'casual' | 'trend_chaser' | 'stan' | 'critic';
export type PillarType = 'loyalty' | 'chaos' | 'empowerment' | 'exclusivity' | 'romance' | 'rebellion' | 'internet_fluency' | 'spirituality' | 'nostalgia' | 'hedonism' | 'intellectualism' | 'fashion_culture';
export type LaborType = 'streaming' | 'defense' | 'promo' | 'meme' | 'clipping' | 'toxicity';

export interface SegmentState {
  count: number;
  loyalty: number;    // 0-100
  morale: number;     // 0-100
  drift_rate: number; // fractional per tick
}

export interface FandomState {
  player_id: string;
  fanbase_name: string | null;
  identity_pillars: PillarType[];
  alignment_score: number;       // 0-100
  fan_morale: number;            // 0-100, volatile ±20/tick
  brand_trust: number;           // 0-100, slow ±5/tick
  toxicity_score: number;        // 0-100
  controversy_shadow: boolean;
  controversy_shadow_ticks_remaining: number;
  dark_mode_until: number | null;
  dark_mode_started: number | null;
  trend_surf_streak: number;
  low_morale_consecutive_ticks: number;
  no_content_ticks: number;
  updated_tick: number;
}

export interface FandomSegments {
  og: SegmentState;
  core: SegmentState;
  casual: SegmentState;
  trend_chaser: SegmentState;
  stan: SegmentState;
  critic: SegmentState;
}

export interface PillarEffects {
  stanFormationMult: number;       // multiplier on Core→Stan drift
  controversySeverityMult: number; // multiplier on controversy damage
  ogLoyaltyMult: number;           // multiplier on OG loyalty retention
  trendChaserAcquisitionMult: number; // multiplier on trend_chaser inflow
  defenseLabor: number;            // multiplier on defense labor output
  qualityScoreMult: number;        // multiplier on release quality effects
  casualAcquisitionMult: number;   // multiplier on casual inflow
  ogLoyaltyCeiling: number;        // max OG loyalty (0-100)
  brandTrustBaseline: number;      // added to brand_trust floor
  controversyRecoveryMult: number; // multiplier on brand_trust recovery speed
}

export interface TurnInputs {
  globalTurnId: number;
  hasContentThisTick: boolean;        // any release or social post this tick
  hasReleaseThisTick: boolean;
  isPlayerActive: boolean;            // unified activity signal (ANY game activity)
  inGracePeriod: boolean;             // within 336-turn grace window — no punitive decay
  inPlatformSpotlight: boolean;       // algorithm_favor high this tick
  hasTrendMomentum: boolean;          // player actively rode a trend this tick
  controversyActiveTicks: number;     // how many consecutive ticks with controversy
  apologyTourActive: boolean;         // player activated apology tour
  consecutiveQualityTicks: number;    // ticks in a row with quality content
  releaseQualityScore: number;        // 0-100 quality of latest release, 0 if none
  hype: number;                       // 0-100 player hype
  overallSentiment: number;           // -100 to 100 legacy sentiment
  trendName: string | null;           // active career trend name
  hasCommunityRitual: boolean;        // player did community engagement this tick
  disrespectedStanCulture: boolean;   // receipts dropped / direct disrespect event
  sceneLoyaltyBias?: number;
  sceneVolatilityBias?: number;
  activeTourRegion?: string | null;
  careerStage?: string;
  releaseCadence?: { recent?: Array<{ kind: string; turnId: number; isRolloutSingle?: boolean }> } | null;
  looptokAlgoState?: string;
  looptokSuppressedStreak?: number;
}

// ─── PILLAR EFFECTS TABLE ─────────────────────────────────────────────────────

const PILLAR_EFFECT_DEFAULTS: PillarEffects = {
  stanFormationMult: 1.0,
  controversySeverityMult: 1.0,
  ogLoyaltyMult: 1.0,
  trendChaserAcquisitionMult: 1.0,
  defenseLabor: 1.0,
  qualityScoreMult: 1.0,
  casualAcquisitionMult: 1.0,
  ogLoyaltyCeiling: 100,
  brandTrustBaseline: 0,
  controversyRecoveryMult: 1.0,
};

// ─── LEGACY PILLAR BACKWARD COMPATIBILITY ────────────────────────────────────
// Maps old 6-pillar values (diva/alt/edgy/wholesome/authentic/mainstream + street/artsy/party/activist)
// to their closest new 12-pillar equivalents. Runtime compatibility layer, NOT a migration.
const LEGACY_PILLAR_MAP: Record<string, PillarType> = {
  diva: 'fashion_culture',
  alt: 'rebellion',
  edgy: 'chaos',
  wholesome: 'empowerment',
  authentic: 'loyalty',
  mainstream: 'hedonism',
  // Even older 6-value set
  street: 'rebellion',
  artsy: 'intellectualism',
  party: 'hedonism',
  activist: 'empowerment',
};

const PILLAR_BASE_EFFECTS: Record<PillarType, Partial<PillarEffects>> = {
  loyalty: {
    ogLoyaltyMult: 1.30,
    stanFormationMult: 1.10,
  },
  chaos: {
    casualAcquisitionMult: 1.35,
    controversySeverityMult: 1.20,
    ogLoyaltyCeiling: 80,
  },
  empowerment: {
    stanFormationMult: 1.25,
    brandTrustBaseline: 15,
  },
  exclusivity: {
    ogLoyaltyMult: 1.20,
    trendChaserAcquisitionMult: 0.65,
    qualityScoreMult: 1.15,
  },
  romance: {
    stanFormationMult: 1.30,
    controversySeverityMult: 1.10,
  },
  rebellion: {
    defenseLabor: 1.35,
    controversyRecoveryMult: 1.40,
    brandTrustBaseline: -10,
  },
  internet_fluency: {
    trendChaserAcquisitionMult: 1.30,
    casualAcquisitionMult: 1.15,
  },
  spirituality: {
    brandTrustBaseline: 20,
    controversyRecoveryMult: 1.80,
    casualAcquisitionMult: 0.85,
  },
  nostalgia: {
    ogLoyaltyMult: 1.35,
    trendChaserAcquisitionMult: 0.75,
  },
  hedonism: {
    casualAcquisitionMult: 1.40,
    ogLoyaltyCeiling: 75,
    controversySeverityMult: 1.15,
  },
  intellectualism: {
    qualityScoreMult: 1.25,
    casualAcquisitionMult: 0.75,
  },
  fashion_culture: {
    brandTrustBaseline: 10,
    stanFormationMult: 1.15,
    qualityScoreMult: 1.10,
  },
};

/**
 * Aggregate all active pillar effects into a single modifier object.
 * Multiple pillars stack multiplicatively on mults, additively on additive fields.
 */
export function computePillarEffects(pillars: PillarType[]): PillarEffects {
  const fx: PillarEffects = { ...PILLAR_EFFECT_DEFAULTS };
  for (const rawPillar of pillars) {
    // Translate legacy pillars to new equivalents for backward compatibility
    const pillar = (LEGACY_PILLAR_MAP[rawPillar as string] || rawPillar) as PillarType;
    const base = PILLAR_BASE_EFFECTS[pillar];
    if (!base) continue;
    if (base.stanFormationMult !== undefined) fx.stanFormationMult *= base.stanFormationMult;
    if (base.controversySeverityMult !== undefined) fx.controversySeverityMult *= base.controversySeverityMult;
    if (base.ogLoyaltyMult !== undefined) fx.ogLoyaltyMult *= base.ogLoyaltyMult;
    if (base.trendChaserAcquisitionMult !== undefined) fx.trendChaserAcquisitionMult *= base.trendChaserAcquisitionMult;
    if (base.defenseLabor !== undefined) fx.defenseLabor *= base.defenseLabor;
    if (base.qualityScoreMult !== undefined) fx.qualityScoreMult *= base.qualityScoreMult;
    if (base.casualAcquisitionMult !== undefined) fx.casualAcquisitionMult *= base.casualAcquisitionMult;
    if (base.ogLoyaltyCeiling !== undefined) fx.ogLoyaltyCeiling = Math.min(fx.ogLoyaltyCeiling, base.ogLoyaltyCeiling);
    if (base.brandTrustBaseline !== undefined) fx.brandTrustBaseline += base.brandTrustBaseline;
    if (base.controversyRecoveryMult !== undefined) fx.controversyRecoveryMult *= base.controversyRecoveryMult;
  }
  return fx;
}

// ─── SEGMENT DRIFT TUNING ────────────────────────────────────────────────────

/**
 * Drift fires once per DRIFT_INTERVAL_TURNS (≈5 RL days at 1 turn/hr).
 * All drift rates are calibrated for this cadence — do not halve them.
 */
export const DRIFT_INTERVAL_TURNS = 120;

/** Unconditional critic→casual attrition rate applied every drift tick. */
export const CRITIC_NATURAL_ATTRITION_RATE = 0.02; // 2% of critics drift to casual each drift tick

export const DRIFT = {
  CASUAL_TO_CORE_BASE: 0.08,    // 8% base if conditions met
  CORE_TO_STAN_BASE: 0.02,      // 2% base if conditions met
  STAN_TO_CORE_BASE: 0.05,      // 5% if morale < 40 for 2 ticks
  CORE_TO_CASUAL_BASE: 0.10,    // 10% if morale < 30
  CASUAL_CHURN_BASE: 0.15,      // 15% if no content this tick
  OG_DEPARTURE_PER_TICK: 0.01,  // silent departure rate when triggered
  CRITIC_TO_CASUAL_BASE: 0.05,  // apology tour recovery per tick
  TREND_CHASER_CHURN: 0.50,     // 50% leave if not in spotlight and not riding trends
  NAMED_FANDOM_OG_RETENTION: 0.4, // +40% OG retention per tick for named fandoms
};

// ─── RELEASE CADENCE PENALTY ─────────────────────────────────────────────────

const MAJOR_RELEASE_TYPES = ['album', 'ep', 'deluxe'];
const MAJOR_SATURATION_WINDOW = 14; // turns
const SINGLE_SATURATION_WINDOW = 7;
const SINGLE_SATURATION_COUNT = 3;

export interface CadencePenalty {
  moraleDelta: number;
  streamingFatigueBonus: number;
  isSaturated: boolean;
}

/**
 * Compute fan morale + streaming fatigue penalties for mass-releasing.
 * Releasing EP → Album → Deluxe back-to-back punishes fan morale and
 * accelerates streaming segment fatigue. Rollout singles (isRolloutSingle=true)
 * are expected behavior and don't trigger the single-spam penalty.
 */
export function computeReleaseCadencePenalty(
  releaseCadence: { recent?: Array<{ kind: string; turnId: number; isRolloutSingle?: boolean }> } | null | undefined,
  currentTurn: number
): CadencePenalty {
  const recent = releaseCadence?.recent ?? [];

  const majorCount = recent.filter(
    r => MAJOR_RELEASE_TYPES.includes(r.kind) && currentTurn - r.turnId <= MAJOR_SATURATION_WINDOW
  ).length;

  const nonRolloutSingles = recent.filter(
    r => r.kind === 'single' && !r.isRolloutSingle && currentTurn - r.turnId <= SINGLE_SATURATION_WINDOW
  ).length;

  if (majorCount >= 3) {
    return { moraleDelta: -18, streamingFatigueBonus: 25, isSaturated: true };
  }
  if (majorCount >= 2) {
    return { moraleDelta: -8, streamingFatigueBonus: 15, isSaturated: true };
  }
  if (nonRolloutSingles >= SINGLE_SATURATION_COUNT) {
    return { moraleDelta: -5, streamingFatigueBonus: 10, isSaturated: true };
  }
  return { moraleDelta: 0, streamingFatigueBonus: 0, isSaturated: false };
}

// ─── FAN MORALE ───────────────────────────────────────────────────────────────

/**
 * Compute next fan_morale value.
 * ±20/tick max, decays toward 50 after 2 ticks of no stimulation.
 */
export function computeNextFanMorale(
  current: number,
  inputs: TurnInputs,
  fandom: FandomState,
): { nextMorale: number; delta: number } {
  let delta = 0;
  const isDarkModeActive = fandom.dark_mode_until != null && inputs.globalTurnId < fandom.dark_mode_until;

  if (isDarkModeActive) {
    delta += 2;
  }

  // Quality release boost
  if (inputs.hasReleaseThisTick && inputs.releaseQualityScore > 0) {
    const qualityNorm = (inputs.releaseQualityScore - 50) / 50; // -1 to +1
    delta += qualityNorm * 12;
  }

  // Social post / community content keeps morale up
  if (inputs.hasContentThisTick && !inputs.hasReleaseThisTick) delta += 4;

  // Platform spotlight: trend chasers + casuals surge
  if (inputs.inPlatformSpotlight) delta += 6;

  // Controversy hits morale hard, scaled by pillar
  if (inputs.controversyActiveTicks > 0) {
    const controversyHit = -8 * Math.min(inputs.controversyActiveTicks, 3);
    delta += controversyHit;
  }

  // Community ritual boosts morale
  if (inputs.hasCommunityRitual) delta += 5;

  // Apology tour recovery
  if (inputs.apologyTourActive) delta += 8;

  // Decay toward 50 if no stimulation — only outside grace period, after extended absence.
  // Design intent: extremely generous — morale only drifts after 144 ticks (≈6 RL days)
  // of genuine inactivity post-grace. Dark mode is separately guarded above.
  if (!isDarkModeActive && !inputs.inGracePeriod && !inputs.isPlayerActive && fandom.no_content_ticks >= 144) {
    const decayDir = current > 50 ? -1 : current < 50 ? 1 : 0;
    delta += decayDir * 8;
  }

  // Mass-release saturation penalty (back-to-back major projects exhaust fans)
  if (inputs.releaseCadence !== undefined) {
    const cadencePenalty = computeReleaseCadencePenalty(inputs.releaseCadence, inputs.globalTurnId);
    delta += cadencePenalty.moraleDelta;
  }

  // LoopTok algorithm state feedback: fans notice reduced reach
  if (inputs.looptokAlgoState === 'suppressed' && (inputs.looptokSuppressedStreak ?? 0) >= 2) {
    delta -= 3; // Fans feel disconnected when reach is suppressed 2+ turns
  }
  if (inputs.looptokAlgoState === 'favorable') {
    delta += 2; // Algorithm love boosts fan energy
  }

  // Clamp delta to ±20
  delta = clamp(Math.round(delta), -20, 20);
  const nextMorale = clamp(current + delta, 0, 100);
  return { nextMorale, delta };
}

// ─── BRAND TRUST ─────────────────────────────────────────────────────────────

/**
 * Compute next brand_trust value.
 * ±5/tick max (3-tick memory: can't recover faster than 5/tick).
 */
export function computeNextBrandTrust(
  current: number,
  inputs: TurnInputs,
  fandom: FandomState,
  pillarFx: PillarEffects,
): { nextTrust: number; delta: number } {
  let delta = 0;

  // Consistency: consecutive quality ticks builds trust
  if (inputs.consecutiveQualityTicks >= 2) delta += 3;
  if (inputs.consecutiveQualityTicks >= 5) delta += 2; // stacks for sustained run

  // Completed apology arc
  if (inputs.apologyTourActive && inputs.consecutiveQualityTicks >= 3) delta += 5;

  // Controversy erodes trust (slower than morale but lasting)
  if (inputs.controversyActiveTicks > 0) delta -= 3;
  if (inputs.controversyActiveTicks >= 4) delta -= 2; // extra hit for sustained controversy

  // Brand trust floor from activist pillar
  const trustFloor = clamp(pillarFx.brandTrustBaseline, 0, 50);

  // Pillar: activist doubles recovery speed
  if (delta > 0) delta = Math.round(delta * pillarFx.controversyRecoveryMult);

  // 3-tick memory: cap recovery at +5/tick regardless
  delta = clamp(delta, -5, 5);

  const nextTrust = clamp(Math.max(trustFloor, current + delta), 0, 100);
  return { nextTrust, delta };
}

// ─── OG COUNT ────────────────────────────────────────────────────────────────

/**
 * Seed OG count for an existing player from current fan base.
 * OGs = 1-3% of total fans, scaled by career stage maturity.
 */
export function seedOGCount(totalFans: number, careerStage: string | null): number {
  const stage = (careerStage || '').toLowerCase();
  // Higher career stages = more chance of real OGs
  const pct = stage.includes('legend') || stage.includes('iconic') ? 0.03
    : stage.includes('superstar') || stage.includes('mainstream') ? 0.025
    : stage.includes('rising') || stage.includes('indie') ? 0.015
    : 0.01;
  return Math.max(0, Math.round(totalFans * pct));
}

/**
 * Compute OG growth during ticks 1-5 of a new artist's career.
 * OGs are capped — growth only happens in this early window.
 */
export function computeOGGrowth(
  currentOGs: number,
  createdTick: number,
  globalTurnId: number,
  fanGrowthThisTick: number,
  hasNamedFandom: boolean,
): number {
  const ticksAlive = globalTurnId - createdTick;
  if (ticksAlive > 5) return 0; // OG window closed
  // 20% of fan growth in first 5 ticks converts to OGs
  const newOGs = Math.round(fanGrowthThisTick * 0.20);
  return Math.max(0, newOGs);
}

// ─── SEGMENT DRIFT ───────────────────────────────────────────────────────────

export interface SegmentDriftResult {
  deltas: Record<SegmentType, number>; // fan count changes
  flipEvents: string[];                // narrative flip event names
  updatedFandom: Partial<FandomState>; // state fields to update
}

function distributeCountsByRatio(
  counts: Record<SegmentType, number>,
  keys: SegmentType[],
  targetTotal: number,
): Record<SegmentType, number> {
  const next = { ...counts };
  const currentTotal = keys.reduce((sum, key) => sum + Math.max(0, next[key] || 0), 0);
  if (targetTotal <= 0 || currentTotal <= 0) {
    for (const key of keys) next[key] = 0;
    return next;
  }

  const allocations = keys.map((key) => {
    const raw = (Math.max(0, next[key] || 0) / currentTotal) * targetTotal;
    const base = Math.floor(raw);
    return { key, base, remainder: raw - base };
  });

  let assigned = allocations.reduce((sum, item) => sum + item.base, 0);
  allocations
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (assigned >= targetTotal) return;
      item.base += 1;
      assigned += 1;
    });

  for (const item of allocations) next[item.key] = item.base;
  return next;
}

export function reconcileSegmentCounts(
  segments: FandomSegments,
  deltas: Record<SegmentType, number>,
  targetTotal: number,
): Record<SegmentType, number> {
  const keys: SegmentType[] = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'];
  const provisional = keys.reduce((acc, key) => {
    acc[key] = Math.max(0, N(segments[key]?.count) + N(deltas[key]));
    return acc;
  }, {} as Record<SegmentType, number>);

  const total = keys.reduce((sum, key) => sum + provisional[key], 0);
  if (targetTotal <= 0) {
    for (const key of keys) provisional[key] = 0;
    return provisional;
  }
  if (total <= targetTotal) return provisional;

  const lockedKeys: SegmentType[] = ['og', 'stan', 'critic'];
  const elasticKeys: SegmentType[] = ['core', 'casual', 'trend_chaser'];
  const lockedTotal = lockedKeys.reduce((sum, key) => sum + provisional[key], 0);

  if (lockedTotal >= targetTotal) {
    return distributeCountsByRatio(provisional, keys, targetTotal);
  }

  const elasticBudget = Math.max(0, targetTotal - lockedTotal);
  const elasticTotal = elasticKeys.reduce((sum, key) => sum + provisional[key], 0);
  if (elasticTotal <= elasticBudget) return provisional;

  const reconciled = { ...provisional };
  const scaled = distributeCountsByRatio(provisional, elasticKeys, elasticBudget);
  for (const key of elasticKeys) reconciled[key] = scaled[key];
  return reconciled;
}

/**
 * Compute deterministic segment drift for one tick.
 * All rates are multiplied by morale/trust modifiers — no RNG.
 */
export function computeSegmentDrift(
  segments: FandomSegments,
  fandom: FandomState,
  inputs: TurnInputs,
  pillarFx: PillarEffects,
  totalFans: number,
): SegmentDriftResult {
  const deltas: Record<SegmentType, number> = {
    og: 0, core: 0, casual: 0, trend_chaser: 0, stan: 0, critic: 0,
  };
  const flipEvents: string[] = [];
  const updatedFandom: Partial<FandomState> = {};

  const morale = fandom.fan_morale;
  const trust = fandom.brand_trust;
  const hasNamedFandom = !!fandom.fanbase_name;
  const sceneLoyaltyBias = N(inputs.sceneLoyaltyBias);
  const sceneVolatilityBias = N(inputs.sceneVolatilityBias);
  const touringInRegion = !!inputs.activeTourRegion;
  const isDarkModeActive = fandom.dark_mode_until != null && inputs.globalTurnId < fandom.dark_mode_until;
  const positiveSceneTailwind = touringInRegion
    ? Math.max(0, sceneLoyaltyBias) + Math.max(0, -sceneVolatilityBias * 0.5)
    : 0;
  const negativeSceneDrag = touringInRegion
    ? Math.max(0, -sceneLoyaltyBias) + Math.max(0, sceneVolatilityBias * 0.5)
    : 0;

  // ── DRIFT INTERVAL GATE ────────────────────────────────────────────────────
  // Segment drift only fires every DRIFT_INTERVAL_TURNS (~5 RL days at 1 turn/hr).
  // State field updates (no_content_ticks, controversy_shadow, etc.) still run every turn.
  const isDriftTurn = inputs.globalTurnId % DRIFT_INTERVAL_TURNS === 0;

  if (isDriftTurn && !isDarkModeActive) {

  // ── CASUAL → CORE ──────────────────────────────────────────────────────────
  // 8% base if fan_morale > 70 AND alignment_score > 60
  if (morale > 70 && fandom.alignment_score > 60) {
    const stageDriftMult = CAREER_STAGE_FANDOM_DRIFT_MULT[inputs.careerStage ?? ''] ?? 1.0;
    const rate = DRIFT.CASUAL_TO_CORE_BASE * clamp(1 + positiveSceneTailwind * 2 - negativeSceneDrag * 1.5, 0.5, 1.5) * stageDriftMult;
    const convertCount = Math.floor(segments.casual.count * rate);
    deltas.casual -= convertCount;
    deltas.core += convertCount;
  }

  // ── CORE → STAN ────────────────────────────────────────────────────────────
  // 2% base if brand_trust > 75 AND loyalty streak > 3
  if (trust > 75 && inputs.consecutiveQualityTicks > 3) {
    const rate = DRIFT.CORE_TO_STAN_BASE * pillarFx.stanFormationMult * clamp(1 + positiveSceneTailwind * 1.8 - negativeSceneDrag, 0.6, 1.6);
    const convertCount = Math.floor(segments.core.count * rate);
    deltas.core -= convertCount;
    deltas.stan += convertCount;
  }

  // ── STAN → CORE ────────────────────────────────────────────────────────────
  // 5% if fan_morale < 40 for 2+ consecutive ticks
  if (morale < 40 && fandom.low_morale_consecutive_ticks >= 2) {
    const convertCount = Math.floor(segments.stan.count * DRIFT.STAN_TO_CORE_BASE);
    deltas.stan -= convertCount;
    deltas.core += convertCount;
  }

  // ── CORE → CASUAL ──────────────────────────────────────────────────────────
  // 10% if fan_morale < 30
  if (morale < 30) {
    const convertCount = Math.floor(segments.core.count * DRIFT.CORE_TO_CASUAL_BASE);
    deltas.core -= convertCount;
    deltas.casual += convertCount;
  }

  // ── CASUAL CHURN ───────────────────────────────────────────────────────────
  // During grace period: no casual churn at all (player is considered active or protected).
  // Post-grace: gentle churn only after 144 turns (≈6 RL days) of no content.
  // Design intent: extremely generous — players who take extended breaks should not
  // be punished. Only the gentlest decay fires, and only after a long absence.
  let casualChurnRate = 0;
  if (!inputs.inGracePeriod && !inputs.isPlayerActive && fandom.no_content_ticks >= 144) {
    casualChurnRate = 0.05;  // 5%/drift-tick — gentle (drift fires every 120 turns)
  }

  if (casualChurnRate > 0) {
    const churnCount = Math.floor(segments.casual.count * casualChurnRate);
    deltas.casual -= churnCount;
  }

  // ── TREND CHASER ACQUISITION ───────────────────────────────────────────────
  // Trend riders can arrive from platform spotlight or recent trend participation.
  // Spotlight is stronger, while active trend riding sustains smaller inflow.
  if ((inputs.inPlatformSpotlight || inputs.hasTrendMomentum) && totalFans > 0) {
    const baseRate = inputs.inPlatformSpotlight ? 0.02 : 0.01;
    const acquisitionRate = baseRate * pillarFx.trendChaserAcquisitionMult * clamp(1 + positiveSceneTailwind * 0.6 - negativeSceneDrag * 1.2, 0.5, 1.4);
    const incoming = Math.floor(totalFans * acquisitionRate);
    deltas.trend_chaser += incoming;
  }

  // ── TREND CHASER CHURN ─────────────────────────────────────────────────────
  // Churn only when the artist loses both spotlight and active trend participation.
  if (!inputs.inPlatformSpotlight && !inputs.hasTrendMomentum && segments.trend_chaser.count > 0) {
    const churnCount = Math.floor(segments.trend_chaser.count * clamp(DRIFT.TREND_CHASER_CHURN + negativeSceneDrag * 0.25 - positiveSceneTailwind * 0.15, 0.2, 0.75));
    deltas.trend_chaser -= churnCount;
    flipEvents.push('trend_chaser_exodus');
  }

  if (touringInRegion && positiveSceneTailwind >= 0.08 && inputs.hasContentThisTick) {
    const extraCore = Math.floor(segments.casual.count * clamp(positiveSceneTailwind * 0.08, 0, 0.03));
    if (extraCore > 0) {
      deltas.casual -= extraCore;
      deltas.core += extraCore;
      flipEvents.push('scene_stronghold_surge');
    }
  }

  if (touringInRegion && negativeSceneDrag >= 0.08 && inputs.hasContentThisTick) {
    const fallbackCount = Math.floor(segments.core.count * clamp(negativeSceneDrag * 0.08, 0, 0.03));
    if (fallbackCount > 0) {
      deltas.core -= fallbackCount;
      deltas.casual += fallbackCount;
      flipEvents.push('scene_disconnect');
    }
  }

  // ── OG FLIP: SILENT DEPARTURE ─────────────────────────────────────────────
  // Trigger: 3+ ticks no community ritual OR sell-out (trend_surf_streak >= 3)
  // Grace period protects against inactivity-driven departures (sell-out still triggers)
  const noRitualTrigger = !inputs.inGracePeriod && !inputs.hasCommunityRitual && fandom.no_content_ticks >= 24;
  const sellOutTrigger = fandom.trend_surf_streak >= 3;

  if ((noRitualTrigger || sellOutTrigger) && segments.og.count > 0) {
    // Named fandoms retain materially more OGs per drift tick
    const retentionBonus = hasNamedFandom ? DRIFT.NAMED_FANDOM_OG_RETENTION : 0;
    const departureRate = clamp(DRIFT.OG_DEPARTURE_PER_TICK * (1 - retentionBonus), 0, 0.3);
    const departCount = Math.floor(segments.og.count * departureRate);
    deltas.og -= departCount;
    if (departCount > 0) flipEvents.push('og_silent_departure');
  }

  // ── CORE FLIP: DOWNGRADE ON CONTROVERSY ───────────────────────────────────
  // Unresolved controversy 4+ ticks + morale < 35 → some core → casual, some → critic
  if (inputs.controversyActiveTicks >= 4 && morale < 35) {
    const flipCount = Math.floor(segments.core.count * 0.12);
    const casualCount = Math.floor(flipCount * 0.65);
    const criticCount = flipCount - casualCount;
    deltas.core -= flipCount;
    deltas.casual += casualCount;
    deltas.critic += criticCount;
    if (flipCount > 0) flipEvents.push('core_controversy_flip');
  }

  // ── STAN FLIP: CANCELLATION ────────────────────────────────────────────────
  // Trigger: artist disrespects stan culture OR receipts drop
  if (inputs.disrespectedStanCulture && segments.stan.count > 0) {
    const cancelCount = Math.floor(segments.stan.count * 0.60);
    deltas.stan -= cancelCount;
    deltas.critic += cancelCount;
    flipEvents.push('stan_cancellation');
  }

  // ── CRITIC → CASUAL RECOVERY ──────────────────────────────────────────────
  // Natural attrition: critics passively lose interest regardless of player action
  if (segments.critic.count > 0) {
    const attritionCount = Math.floor(segments.critic.count * CRITIC_NATURAL_ATTRITION_RATE);
    deltas.critic -= attritionCount;
    deltas.casual += attritionCount;
    if (attritionCount > 0) flipEvents.push('critic_natural_attrition');
  }
  // Apology tour + 3 ticks consistent quality (stacks with natural attrition)
  if (inputs.apologyTourActive && inputs.consecutiveQualityTicks >= 3 && segments.critic.count > 0) {
    const recoverRate = DRIFT.CRITIC_TO_CASUAL_BASE * pillarFx.controversyRecoveryMult;
    const recoverCount = Math.floor(segments.critic.count * recoverRate);
    deltas.critic -= recoverCount;
    deltas.casual += recoverCount;
    if (recoverCount > 0) flipEvents.push('critic_recovery');
  }

  } // end isDriftTurn gate

  // ── UPDATE FANDOM STATE FIELDS ─────────────────────────────────────────────
  // Use unified activity signal: any game activity resets the counter
  updatedFandom.no_content_ticks = isDarkModeActive
    ? fandom.no_content_ticks
    : inputs.isPlayerActive ? 0 : fandom.no_content_ticks + 1;
  updatedFandom.low_morale_consecutive_ticks = morale < 40
    ? fandom.low_morale_consecutive_ticks + 1
    : 0;
  updatedFandom.trend_surf_streak = isDarkModeActive
    ? fandom.trend_surf_streak
    : inputs.inPlatformSpotlight && !inputs.hasReleaseThisTick
    ? fandom.trend_surf_streak + 1
    : 0;
  // Controversy shadow: set/refresh from external signal; count down when clear.
  // Avoid self-feedback: always use inputs.controversyActiveTicks (external), never
  // re-derive from fandom.controversy_shadow_ticks_remaining to prevent perpetual loops.
  if (inputs.controversyActiveTicks >= 2) {
    updatedFandom.controversy_shadow = true;
    // Refresh shadow to 5 ticks (cap prevents unbounded growth)
    updatedFandom.controversy_shadow_ticks_remaining = Math.min(5, Math.max(fandom.controversy_shadow_ticks_remaining, 5));
  } else {
    const newRemaining = Math.max(0, fandom.controversy_shadow_ticks_remaining - 1);
    updatedFandom.controversy_shadow_ticks_remaining = newRemaining;
    updatedFandom.controversy_shadow = newRemaining > 0;
  }

  return { deltas, flipEvents, updatedFandom };
}

// ─── LABOR OUTPUT ─────────────────────────────────────────────────────────────

/**
 * Compute labor output for each segment this tick.
 * Labor types: streaming, defense, promo, meme, clipping, toxicity
 */
export function computeLaborOutput(
  segments: FandomSegments,
  fandom: FandomState,
  pillarFx: PillarEffects,
): Record<SegmentType, Record<LaborType, number>> {
  const moraleMult = clamp(fandom.fan_morale / 50, 0.5, 2.0);
  const trustMult = clamp(fandom.brand_trust / 50, 0.7, 1.5);

  return {
    og: {
      streaming: Math.round(segments.og.count * 4.0 * moraleMult),   // highest quality streams
      defense: Math.round(segments.og.count * 1.5),
      promo: Math.round(segments.og.count * 2.0 * trustMult),         // grassroots promo
      meme: 0,
      clipping: 0,
      toxicity: 0,
    },
    core: {
      streaming: Math.round(segments.core.count * 2.5 * moraleMult),
      defense: Math.round(segments.core.count * 1.0),
      promo: Math.round(segments.core.count * 0.5),
      meme: Math.round(segments.core.count * 0.3),
      clipping: 0,
      toxicity: 0,
    },
    casual: {
      streaming: Math.round(segments.casual.count * 0.8),             // low quality, high vol
      defense: 0,
      promo: 0,
      meme: Math.round(segments.casual.count * 0.6),
      clipping: 0,
      toxicity: 0,
    },
    trend_chaser: {
      streaming: Math.round(segments.trend_chaser.count * 1.2),       // burst streaming
      defense: 0,
      promo: Math.round(segments.trend_chaser.count * 1.0),           // high shares
      meme: Math.round(segments.trend_chaser.count * 0.8),
      clipping: 0,
      toxicity: 0,
    },
    stan: {
      streaming: Math.round(segments.stan.count * 3.0 * moraleMult),
      defense: Math.round(segments.stan.count * 3.0 * pillarFx.defenseLabor), // max defense
      promo: Math.round(segments.stan.count * 1.0),
      meme: Math.round(segments.stan.count * 2.0),
      clipping: Math.round(segments.stan.count * 2.0),
      toxicity: 0,
    },
    critic: {
      streaming: 0,
      defense: 0,
      promo: 0,
      meme: Math.round(segments.critic.count * 0.5),                  // negative memes
      clipping: 0,
      toxicity: Math.round(segments.critic.count * 2.0),              // negative amplification
    },
  };
}

/**
 * Sum total streaming labor across all positive segments (excludes critic).
 */
export function totalStreamingLabor(labor: Record<SegmentType, Record<LaborType, number>>): number {
  return (['og', 'core', 'casual', 'trend_chaser', 'stan'] as SegmentType[])
    .reduce((sum, seg) => sum + (labor[seg]?.streaming || 0), 0);
}

/**
 * Sum total defense labor across all segments.
 */
export function totalDefenseLabor(labor: Record<SegmentType, Record<LaborType, number>>): number {
  return (['og', 'core', 'stan'] as SegmentType[])
    .reduce((sum, seg) => sum + (labor[seg]?.defense || 0), 0);
}

/**
 * Net toxicity (critic toxicity − stan defense) — used for brand damage calc.
 * Returns an integer delta to apply to toxicity_score (positive = accumulate, negative = decay).
 * Accumulation: Math.round(netRaw / 100) when critic > defense
 * Decay: Math.floor(netRaw / 200) when defense > critic (half rate)
 */
const STAN_DEFENSE_MULT = 0.67; // Tuning knob: at 0.67, equal critic/stan counts produce ~0 net toxicity

export function netToxicity(labor: Record<SegmentType, Record<LaborType, number>>): number {
  const criticToxicity = labor.critic?.toxicity || 0;
  const stanDefense = (labor.stan?.defense || 0) * STAN_DEFENSE_MULT;
  const netRaw = criticToxicity - stanDefense;

  if (netRaw > 0) {
    // Accumulation: positive net means critic overwhelms defense
    return Math.round(netRaw / 100);
  } else if (netRaw < 0) {
    // Decay: defense overwhelms critic — slower recovery (half rate)
    return Math.floor(netRaw / 200);
  }
  return 0;
}

/**
 * Passive toxicity decay — banded linear table.
 * Applied every turn after labor-based toxicity contributions.
 * Higher toxicity decays faster; low toxicity is stable.
 */
const TOXICITY_DECAY_BANDS: ReadonlyArray<[number, number]> = [
  [80, 10],
  [60, 6],
  [40, 3],
  [20, 1],
];

export function getPassiveToxicityDecay(toxicityScore: number): number {
  for (const [threshold, decay] of TOXICITY_DECAY_BANDS) {
    if (toxicityScore >= threshold) return decay;
  }
  return 0;
}

// ─── DEFAULT SEGMENT STATE ───────────────────────────────────────────────────

export function defaultSegmentState(type: SegmentType): SegmentState {
  const defaults: Record<SegmentType, SegmentState> = {
    og:           { count: 0, loyalty: 90, morale: 75, drift_rate: 0 },
    core:         { count: 0, loyalty: 65, morale: 60, drift_rate: 0 },
    casual:       { count: 0, loyalty: 35, morale: 50, drift_rate: 0 },
    trend_chaser: { count: 0, loyalty: 15, morale: 55, drift_rate: 0 },
    stan:         { count: 0, loyalty: 80, morale: 70, drift_rate: 0 },
    critic:       { count: 0, loyalty:  0, morale: 20, drift_rate: 0 },
  };
  return { ...defaults[type] };
}

export function ensureFandomSegments(rows: any[]): FandomSegments {
  const seg: FandomSegments = {
    og:           defaultSegmentState('og'),
    core:         defaultSegmentState('core'),
    casual:       defaultSegmentState('casual'),
    trend_chaser: defaultSegmentState('trend_chaser'),
    stan:         defaultSegmentState('stan'),
    critic:       defaultSegmentState('critic'),
  };
  for (const row of rows) {
    const type = row.segment_type as SegmentType;
    if (!seg[type]) continue;
    seg[type] = {
      count:     N(row.count),
      loyalty:   clamp(N(row.loyalty), 0, 100),
      morale:    clamp(N(row.morale), 0, 100),
      drift_rate: N(row.drift_rate),
    };
  }
  return seg;
}

export function ensureFandomState(row: any, playerId: string): FandomState {
  return {
    player_id:                          row?.player_id || playerId,
    fanbase_name:                       row?.fanbase_name || null,
    identity_pillars:                   (row?.identity_pillars as PillarType[]) || [],
    alignment_score:                    clamp(N(row?.alignment_score) || 50, 0, 100),
    fan_morale:                         clamp(N(row?.fan_morale) || 50, 0, 100),
    brand_trust:                        clamp(N(row?.brand_trust) || 50, 0, 100),
    toxicity_score:                     clamp(N(row?.toxicity_score) || 0, 0, 100),
    controversy_shadow:                 !!row?.controversy_shadow,
    controversy_shadow_ticks_remaining: N(row?.controversy_shadow_ticks_remaining),
    dark_mode_until:                    row?.dark_mode_until != null ? N(row?.dark_mode_until) : null,
    dark_mode_started:                  row?.dark_mode_started != null ? N(row?.dark_mode_started) : null,
    trend_surf_streak:                  N(row?.trend_surf_streak),
    low_morale_consecutive_ticks:       N(row?.low_morale_consecutive_ticks),
    no_content_ticks:                   N(row?.no_content_ticks),
    updated_tick:                       N(row?.updated_tick),
  };
}

// ─── FATIGUE MODEL ───────────────────────────────────────────────────────────
// Each segment tracks fatigue per labor type (0-100).
// Fatigue accumulates when labor is produced, recovers when idle.
// Above 70: labor output halved. At 90+: segment strikes (0 output, morale -10).

export type FatigueMap = Record<LaborType, number>;
export type SegmentFatigueMap = Record<SegmentType, FatigueMap>;

const FATIGUE_ACCUMULATION_RATE = 6;  // +6 per tick of active labor (was 8 — too aggressive)
const FATIGUE_RECOVERY_RATE = 8;      // -8 per tick when idle (was 5 — recovery must outpace accumulation for healthy cycling)
const FATIGUE_HALVED_THRESHOLD = 70;
const FATIGUE_STRIKE_THRESHOLD = 90;

export function defaultFatigueMap(): FatigueMap {
  return { streaming: 0, defense: 0, promo: 0, meme: 0, clipping: 0, toxicity: 0 };
}

/**
 * Advance fatigue for one segment. Each labor type where output > 0 accumulates fatigue;
 * labor types with 0 output recover. Returns updated fatigue map + events.
 * @param genreFatigueMult - Genre loyalty scaling for fatigue accumulation (default 1.0).
 *   Loyal genres (underground=0.84) accumulate fatigue slower; volatile genres (pop=0.92) near normal.
 *   Computed as: 1 - fanLoyaltyFactor * 0.2
 */
export function advanceSegmentFatigue(
  currentFatigue: FatigueMap,
  laborOutput: Record<LaborType, number> | null | undefined,
  streamingFatigueBonus = 0,
  genreFatigueMult = 1.0,
): { fatigue: FatigueMap; strikeLabors: LaborType[]; halvedLabors: LaborType[] } {
  // Guard: if no laborOutput, return unchanged fatigue with no strikes/halves
  if (!laborOutput) {
    return { fatigue: { ...currentFatigue }, strikeLabors: [], halvedLabors: [] };
  }

  const fatigue = { ...currentFatigue };
  const strikeLabors: LaborType[] = [];
  const halvedLabors: LaborType[] = [];
  const effectiveAccumRate = Math.round(FATIGUE_ACCUMULATION_RATE * Math.max(0.5, Math.min(1.2, genreFatigueMult)));

  for (const lt of ['streaming', 'defense', 'promo', 'meme', 'clipping', 'toxicity'] as LaborType[]) {
    if ((laborOutput[lt] || 0) > 0) {
      fatigue[lt] = clamp((fatigue[lt] || 0) + effectiveAccumRate, 0, 100);
    } else {
      fatigue[lt] = clamp((fatigue[lt] || 0) - FATIGUE_RECOVERY_RATE, 0, 100);
    }
    // Mass-release saturation accelerates streaming fatigue across all segments
    if (lt === 'streaming' && streamingFatigueBonus > 0) {
      fatigue[lt] = clamp((fatigue[lt] || 0) + streamingFatigueBonus, 0, 100);
    }
    if (fatigue[lt] >= FATIGUE_STRIKE_THRESHOLD) strikeLabors.push(lt);
    else if (fatigue[lt] >= FATIGUE_HALVED_THRESHOLD) halvedLabors.push(lt);
  }

  return { fatigue, strikeLabors, halvedLabors };
}

/**
 * Apply fatigue penalties to raw labor output.
 * Halved at ≥70, zero at ≥90 (strike).
 */
export function applyFatiguePenalties(
  rawLabor: Record<LaborType, number>,
  fatigue: FatigueMap,
): Record<LaborType, number> {
  const result: Record<LaborType, number> = { ...rawLabor };
  for (const lt of Object.keys(result) as LaborType[]) {
    const f = fatigue[lt] || 0;
    if (f >= FATIGUE_STRIKE_THRESHOLD) {
      result[lt] = 0;
    } else if (f >= FATIGUE_HALVED_THRESHOLD) {
      result[lt] = Math.floor(result[lt] * 0.5);
    }
  }
  return result;
}

// ─── LABOR POOL (AGGREGATED) ─────────────────────────────────────────────────

/**
 * Compute aggregate labor pool: sum of all positive-segment outputs per labor type.
 * Excludes critic (whose only "labor" is toxicity).
 */
export function computeLaborPool(
  laborBySegment: Record<SegmentType, Record<LaborType, number>>,
): Record<LaborType, number> {
  const pool: Record<LaborType, number> = { streaming: 0, defense: 0, promo: 0, meme: 0, clipping: 0, toxicity: 0 };
  for (const seg of ['og', 'core', 'casual', 'trend_chaser', 'stan'] as SegmentType[]) {
    for (const lt of Object.keys(pool) as LaborType[]) {
      pool[lt] += (laborBySegment[seg]?.[lt] || 0);
    }
  }
  // Toxicity only comes from critics
  pool.toxicity = laborBySegment.critic?.toxicity || 0;
  return pool;
}

// ─── TOXICITY PLATFORM EFFECTS ───────────────────────────────────────────────

export interface ToxicityEffects {
  platformWarning: boolean;   // toxicity ≥ 60
  platformBan: boolean;       // toxicity ≥ 80
  brandTrustPenalty: number;  // additional brand_trust delta
  moralePenalty: number;      // additional morale delta
}

export function computeToxicityEffects(toxicityScore: number): ToxicityEffects {
  const platformWarning = toxicityScore >= 60;
  const platformBan = toxicityScore >= 80;
  return {
    platformWarning,
    platformBan,
    brandTrustPenalty: platformBan ? -5 : platformWarning ? -2 : 0,
    moralePenalty: platformBan ? -8 : platformWarning ? -3 : 0,
  };
}

// ─── REBRAND PENALTIES ───────────────────────────────────────────────────────

export interface RebrandResult {
  allowed: boolean;
  reason?: string;
  penalties: {
    ogLoyaltyHit: number;       // -15 loyalty to OGs
    casualToCoreDowngrade: number; // 10% of casuals revert to casual (no-op, but core lose 10%)
    alignmentReset: boolean;     // alignment_score resets to 50
    moneyCost: number;           // escalating cost
  };
}

/**
 * Calculate rebrand cost and penalties.
 * rebrandCount starts at 0 (first rebrand = rebrandCount 0 before increment).
 */
export function computeRebrandPenalties(rebrandCount: number): RebrandResult {
  // Cost: $1000 × (rebrand_count + 1)²
  const moneyCost = 1000 * Math.pow(rebrandCount + 1, 2);
  return {
    allowed: true,
    penalties: {
      ogLoyaltyHit: -15,
      casualToCoreDowngrade: 10, // 10% of core → casual
      alignmentReset: true,
      moneyCost,
    },
  };
}

// ─── ALIGNMENT SCORING ───────────────────────────────────────────────────────

// Maps action alignment_tags to which pillars they align with (12-pillar system)
const ACTION_PILLAR_ALIGNMENT: Record<string, PillarType[]> = {
  feed_ogs:         ['rebellion', 'intellectualism'],
  community_ritual: ['rebellion', 'empowerment'],
  stan_cta:         ['fashion_culture', 'hedonism'],
  meme_drop:        ['hedonism', 'rebellion'],
  trend_surf:       ['hedonism', 'fashion_culture'],
  receipts_drop:    ['rebellion', 'fashion_culture'],
  clapback:         ['rebellion', 'fashion_culture'],
  go_dark:          ['rebellion', 'intellectualism'],
  collab_defense:   ['empowerment', 'intellectualism'],
  apology_tour:     ['empowerment'],
  chill_pill:       ['rebellion', 'empowerment'],
  // Social post alignment tags
  subtweet:         ['fashion_culture', 'rebellion'],
  hype_post:        ['hedonism', 'fashion_culture'],
  vulnerable_post:  ['intellectualism', 'empowerment'],
  flex_post:        ['hedonism', 'rebellion'],
  // LoopTok trend engagement tags
  trend_sound_ride:   ['hedonism', 'fashion_culture'],   // using a currently trending sound
  aesthetic_wave:     ['intellectualism', 'rebellion'],   // engaging with an aesthetic trend
  meme_trend_drop:    ['hedonism', 'rebellion'],          // engaging with a trending meme (distinct from posting a meme)
  beef_engagement:    ['rebellion', 'fashion_culture'],   // reacting to or engaging with an active beef
  genre_wave_ride:    ['rebellion', 'intellectualism'],   // riding a genre wave trend
  challenge_complete: ['hedonism', 'fashion_culture'],    // completing an active LoopTok challenge
  // VidWave video type alignment tags (from metadata.alignment_tag)
  music_focus:          ['intellectualism', 'fashion_culture'],  // music videos, lyric videos, visualizers, deep dives, live performances
  authentic:            ['rebellion', 'empowerment'],            // studio sessions, songwriting vlogs
  lifestyle:            ['hedonism', 'rebellion'],               // tour diaries
  community_engagement: ['hedonism', 'empowerment'],             // reactions, Q&A interviews
  collab_culture:       ['hedonism', 'fashion_culture'],         // collab videos
  viral_content:        ['hedonism', 'rebellion', 'fashion_culture'], // VidWave Shorts — broad appeal
  radio_shoutout:       ['hedonism', 'empowerment'],
  radio_clip:           ['hedonism', 'fashion_culture'],
  radio_interview:      ['intellectualism', 'empowerment'],
  radio_promo:          ['hedonism', 'rebellion'],
};

/**
 * Compute alignment delta for an action.
 * +3 if action aligns with any player pillar, -3 if it misaligns (no overlap).
 * Normalizes legacy pillars (diva/alt/edgy/etc.) to new 12-pillar system before comparison.
 */
export function computeAlignmentDelta(
  actionTag: string,
  playerPillars: PillarType[],
): number {
  if (!actionTag || playerPillars.length === 0) return 0;
  const alignedPillars = ACTION_PILLAR_ALIGNMENT[actionTag] || [];
  if (alignedPillars.length === 0) return 0;
  const normalizedPillars = playerPillars.map(p => (LEGACY_PILLAR_MAP[p as string] || p) as PillarType);
  const hasOverlap = alignedPillars.some(p => normalizedPillars.includes(p));
  return hasOverlap ? 3 : -3;
}

/**
 * Batch-compute alignment for all actions this tick.
 * Returns new alignment_score and whether it's a misaligned tick.
 */
export function computeAlignmentForTick(
  currentScore: number,
  actionTags: string[],
  playerPillars: PillarType[],
): { newScore: number; isMisaligned: boolean; totalDelta: number } {
  if (playerPillars.length === 0) return { newScore: currentScore, isMisaligned: false, totalDelta: 0 };
  const normalizedPillars = playerPillars.map(p => (LEGACY_PILLAR_MAP[p as string] || p) as PillarType);
  let totalDelta = 0;
  for (const tag of actionTags) {
    totalDelta += computeAlignmentDelta(tag, normalizedPillars);
  }
  // Passive drift toward 50 if no actions
  if (actionTags.length === 0) {
    totalDelta = currentScore > 50 ? -1 : currentScore < 50 ? 1 : 0;
  }
  const newScore = clamp(currentScore + totalDelta, 0, 100);
  // Misaligned if score dropped below 35
  const isMisaligned = newScore < 35;
  return { newScore, isMisaligned, totalDelta };
}

// ─── IDENTITY CRISIS ─────────────────────────────────────────────────────────

export interface IdentityCrisisResult {
  crisisTriggered: boolean;
  crisisCleared: boolean;
  penalties: {
    moralePenalty: number;
    laborOutputMult: number;   // multiplier on all labor (0.5 during crisis)
  };
}

/**
 * Check and apply identity crisis effects.
 * Crisis triggers after 3 consecutive misaligned ticks.
 * Crisis clears when alignment_score ≥ 50.
 */
export function checkIdentityCrisis(
  misalignedConsecutiveTicks: number,
  isMisalignedThisTick: boolean,
  currentlyInCrisis: boolean,
  alignmentScore: number,
): IdentityCrisisResult {
  const newConsecutive = isMisalignedThisTick ? misalignedConsecutiveTicks + 1 : 0;

  // Trigger: 3+ consecutive misaligned ticks
  if (!currentlyInCrisis && newConsecutive >= 3) {
    return {
      crisisTriggered: true,
      crisisCleared: false,
      penalties: { moralePenalty: -15, laborOutputMult: 0.5 },
    };
  }

  // During crisis: check for clearing
  if (currentlyInCrisis) {
    if (alignmentScore >= 50) {
      return {
        crisisTriggered: false,
        crisisCleared: true,
        penalties: { moralePenalty: 0, laborOutputMult: 1.0 },
      };
    }
    // Still in crisis
    return {
      crisisTriggered: false,
      crisisCleared: false,
      penalties: { moralePenalty: -5, laborOutputMult: 0.5 },
    };
  }

  // No crisis
  return {
    crisisTriggered: false,
    crisisCleared: false,
    penalties: { moralePenalty: 0, laborOutputMult: 1.0 },
  };
}

// ─── FAN WAR HELPERS (two-sided momentum) ────────────────────────────────────

export interface WarMomentumResult {
  challengerMomentum: number;
  targetMomentum: number;
  netMomentum: number;         // positive = challenger winning
  outcomeReady: boolean;       // true if war should resolve
  outcome: 'decisive_win' | 'narrow_win' | 'draw' | 'mutual_destruction' | null;
  winnerId: string | null;
}

/**
 * Compute two-sided war momentum for one tick.
 * Labor = defense + promo labor from each fandom.
 */
export function computeWarMomentum(
  currentChallenger: number,
  currentTarget: number,
  challengerLaborThisTick: number,
  targetLaborThisTick: number,
  durationTurns: number,
  maxDuration: number,
  challengerId: string,
  targetId: string | null,
  sympathyMultiplier: number,
): WarMomentumResult {
  // Each side gains momentum from labor, decays by 5/tick
  const decay = 5;
  const newChallenger = clamp(currentChallenger + challengerLaborThisTick - decay, 0, 200);
  let newTarget = clamp(currentTarget + Math.round(targetLaborThisTick * sympathyMultiplier) - decay, 0, 200);

  // If no target (organic war), target momentum is based on critics
  if (!targetId) newTarget = clamp(currentTarget - decay, 0, 200);

  const netMomentum = newChallenger - newTarget;
  const totalTicks = durationTurns + 1;
  const outcomeReady = totalTicks >= maxDuration;

  let outcome: WarMomentumResult['outcome'] = null;
  let winnerId: string | null = null;

  if (outcomeReady) {
    const diff = Math.abs(netMomentum);
    if (diff >= 40) {
      outcome = 'decisive_win';
      winnerId = netMomentum > 0 ? challengerId : (targetId || challengerId);
    } else if (diff >= 10) {
      outcome = 'narrow_win';
      winnerId = netMomentum > 0 ? challengerId : (targetId || challengerId);
    } else if (newChallenger < 20 && newTarget < 20) {
      outcome = 'mutual_destruction';
    } else {
      outcome = 'draw';
    }
  }

  return {
    challengerMomentum: newChallenger,
    targetMomentum: newTarget,
    netMomentum,
    outcomeReady,
    outcome,
    winnerId,
  };
}

// ─── ANTI-GRIEF RULES ────────────────────────────────────────────────────────

/**
 * David vs Goliath: if attacker fans > 5× target fans, target gets a sympathy multiplier.
 * Also checks cooldown between same pair.
 */
export function computeSympathyMultiplier(
  challengerTotalFans: number,
  targetTotalFans: number,
): number {
  if (targetTotalFans <= 0) return 1.0;
  const ratio = challengerTotalFans / Math.max(1, targetTotalFans);
  if (ratio > 5) {
    // Sympathy: target gets 1.5× labor effectiveness
    return 1.5;
  }
  return 1.0;
}

export function isWarCooldownActive(
  cooldownUntilTick: number | null,
  currentTick: number,
): boolean {
  if (!cooldownUntilTick) return false;
  return currentTick < cooldownUntilTick;
}
