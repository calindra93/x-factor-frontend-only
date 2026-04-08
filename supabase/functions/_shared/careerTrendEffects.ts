/**
 * CAREER TREND EFFECTS v2 — Simple, explicit modifiers per trend.
 *
 * Each trend has fixed multipliers. No intensity scaling.
 * STABLE = all 1.0 (no effect). ONE_HIT_WONDER has special -50% penalties.
 */

import type { CareerTrend } from './careerTrendsEngine.ts';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));

export type CareerTrendEffects = {
  discoveryConversionMultAdj: number;
  retentionMultAdj: number;
  decayRateAddend: number;
  followerConversionAdj: number;
  viralityTendencyAdj: number;
  chartStabilityAdj: number;
  merchConversionAdj: number;
  tourDemandAdj: number;
  brandDealChanceAdj: number;
  listenerConversionAdj: number;
  // ONE_HIT_WONDER specials
  nonHitStreamMult: number;       // multiplier on streams for non-hit singles (1.0 = normal, 0.5 = -50%)
  tourWithoutHitMult: number;     // multiplier on tour revenue when hit not in setlist (1.0 = normal, 0.5 = -50%)
};

const BASE: CareerTrendEffects = {
  discoveryConversionMultAdj: 1,
  retentionMultAdj: 1,
  decayRateAddend: 0,
  followerConversionAdj: 1,
  viralityTendencyAdj: 1,
  chartStabilityAdj: 1,
  merchConversionAdj: 1,
  tourDemandAdj: 1,
  brandDealChanceAdj: 1,
  listenerConversionAdj: 1,
  nonHitStreamMult: 1,
  tourWithoutHitMult: 1,
};

/** Fixed effect profiles per trend — no intensity scaling needed. */
const TREND_EFFECTS: Record<CareerTrend, Partial<CareerTrendEffects>> = {
  STABLE: {}, // all defaults — no modifiers

  GOAT: {
    retentionMultAdj: 1.08,
    decayRateAddend: -0.002,
    merchConversionAdj: 1.15,
    tourDemandAdj: 1.08,
    brandDealChanceAdj: 1.15,
    chartStabilityAdj: 1.02,
    listenerConversionAdj: 1.05,
  },

  VIRAL_SENSATION: {
    discoveryConversionMultAdj: 1.06,
    followerConversionAdj: 1.06,
    viralityTendencyAdj: 1.10,
    brandDealChanceAdj: 1.08,
    retentionMultAdj: 0.96, // viral fans are shallow
    decayRateAddend: 0.001, // hype fades faster
  },

  COMEBACK: {
    discoveryConversionMultAdj: 1.06,
    retentionMultAdj: 1.04,
    merchConversionAdj: 1.08,
    brandDealChanceAdj: 1.10,
    viralityTendencyAdj: 1.06,
    decayRateAddend: -0.001,
  },

  LEGACY_ARTIST: {
    retentionMultAdj: 1.06,
    decayRateAddend: -0.001,
    merchConversionAdj: 1.10,
    tourDemandAdj: 1.05,
    brandDealChanceAdj: 1.08,
    discoveryConversionMultAdj: 0.97, // harder to discover new fans
  },

  ONE_HIT_WONDER: {
    nonHitStreamMult: 0.50,       // -50% streams on non-hit singles
    tourWithoutHitMult: 0.50,     // -50% tour revenue without the hit in setlist
    viralityTendencyAdj: 0.95,
    retentionMultAdj: 0.95,
    merchConversionAdj: 0.92,
    decayRateAddend: 0.001,
  },

  FLOP_ERA: {
    discoveryConversionMultAdj: 0.90,
    retentionMultAdj: 0.93,
    merchConversionAdj: 0.88,
    tourDemandAdj: 0.92,
    brandDealChanceAdj: 0.88,
    chartStabilityAdj: 0.98,
    decayRateAddend: 0.002,
  },

  CAREER_SLUMP: {
    discoveryConversionMultAdj: 0.94,
    retentionMultAdj: 0.96,
    merchConversionAdj: 0.92,
    brandDealChanceAdj: 0.90,
    decayRateAddend: 0.001,
  },

  PASSED_PRIME: {
    retentionMultAdj: 0.94,
    decayRateAddend: 0.002,
    discoveryConversionMultAdj: 0.92,
    merchConversionAdj: 0.90,
    tourDemandAdj: 0.92,
  },

  DORMANT: {
    discoveryConversionMultAdj: 0.96,
    brandDealChanceAdj: 0.92,
    viralityTendencyAdj: 0.94,
    retentionMultAdj: 1.02, // loyal fans stick around
  },

  FORGOTTEN: {
    discoveryConversionMultAdj: 0.88,
    retentionMultAdj: 0.90,
    merchConversionAdj: 0.85,
    tourDemandAdj: 0.85,
    brandDealChanceAdj: 0.85,
    viralityTendencyAdj: 0.88,
    decayRateAddend: 0.002,
    listenerConversionAdj: 0.90,
  },
};

export function applyCareerTrendEffects({ trend }: { trend: CareerTrend; phase5?: any; signals?: any }): CareerTrendEffects {
  const overrides = TREND_EFFECTS[trend] || {};
  const e = { ...BASE, ...overrides };

  return {
    discoveryConversionMultAdj: clamp(e.discoveryConversionMultAdj, 0.85, 1.15),
    retentionMultAdj: clamp(e.retentionMultAdj, 0.90, 1.10),
    decayRateAddend: clamp(e.decayRateAddend, -0.003, 0.003),
    followerConversionAdj: clamp(e.followerConversionAdj, 0.90, 1.10),
    viralityTendencyAdj: clamp(e.viralityTendencyAdj, 0.85, 1.15),
    chartStabilityAdj: clamp(e.chartStabilityAdj, 0.98, 1.02),
    merchConversionAdj: clamp(e.merchConversionAdj, 0.85, 1.15),
    tourDemandAdj: clamp(e.tourDemandAdj, 0.85, 1.10),
    brandDealChanceAdj: clamp(e.brandDealChanceAdj, 0.85, 1.20),
    listenerConversionAdj: clamp(e.listenerConversionAdj, 0.85, 1.10),
    nonHitStreamMult: clamp(e.nonHitStreamMult, 0.1, 1.0),
    tourWithoutHitMult: clamp(e.tourWithoutHitMult, 0.1, 1.0),
  };
}
