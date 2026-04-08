const N = (value: unknown): number => Number(value) || 0;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clampUnit = (value: number): number => clamp(value, 0, 1);
const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

export const CANONICAL_FANDOM_SEGMENT_TYPES = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'] as const;
export type CanonicalFandomSegmentType = typeof CANONICAL_FANDOM_SEGMENT_TYPES[number];

export const DIRECTABLE_FANDOM_SEGMENT_TYPES: CanonicalFandomSegmentType[] = ['og', 'core', 'casual', 'trend_chaser', 'stan'];

export const CANONICAL_FANDOM_SEGMENT_LABELS: Record<CanonicalFandomSegmentType, string> = {
  og: 'OGs',
  core: 'Core fans',
  casual: 'Casuals',
  trend_chaser: 'Trend Chasers',
  stan: 'Stans',
  critic: 'Critics',
};

export type CanonicalFandomSegmentRow = {
  segment_type?: string | null;
  count?: number | string | null;
  loyalty?: number | string | null;
  morale?: number | string | null;
};

export type CanonicalFandomStateRow = {
  fan_morale?: number | string | null;
  brand_trust?: number | string | null;
  toxicity_score?: number | string | null;
};

export type CanonicalFandomSignals = {
  totalAudience: number;
  segmentCounts: Record<CanonicalFandomSegmentType, number>;
  segmentShares: Record<CanonicalFandomSegmentType, number>;
  loyalBaseShare: number;
  superfanPressure: number;
  trendAmplification: number;
  criticDrag: number;
  audienceDepth: number;
  averageLoyalty: number;
  averageMorale: number;
  fanMorale: number;
  brandTrust: number;
  toxicityPressure: number;
};

export type MarketingAudienceMix = {
  stans: number;
  core: number;
  casual: number;
  trend: number;
};

export type LegacyEssenceArchetypeDistribution = {
  critics_adjacent: number;
  nostalgia_seekers: number;
  trend_chasers: number;
  underground_purists: number;
};

function createEmptySegmentMetricMap(): Record<CanonicalFandomSegmentType, number> {
  return {
    og: 0,
    core: 0,
    casual: 0,
    trend_chaser: 0,
    stan: 0,
    critic: 0,
  };
}

function isCanonicalSegmentType(value: string): value is CanonicalFandomSegmentType {
  return (CANONICAL_FANDOM_SEGMENT_TYPES as readonly string[]).includes(value);
}

function getWeightedSegmentMetric(
  segments: CanonicalFandomSegmentRow[],
  field: 'loyalty' | 'morale',
  totalAudience: number,
): number {
  if (totalAudience <= 0) return 50;

  let total = 0;
  for (const segment of segments) {
    const segmentType = String(segment?.segment_type || '').trim();
    if (!isCanonicalSegmentType(segmentType)) continue;

    const count = Math.max(0, N(segment?.count));
    total += count * clamp(N(segment?.[field]), 0, 100);
  }

  return round(total / totalAudience, 3);
}

export function buildCanonicalSegmentCounts(
  segments: CanonicalFandomSegmentRow[] = [],
): Record<CanonicalFandomSegmentType, number> {
  const counts = createEmptySegmentMetricMap();

  for (const segment of segments) {
    const segmentType = String(segment?.segment_type || '').trim();
    if (!isCanonicalSegmentType(segmentType)) continue;
    counts[segmentType] += Math.max(0, N(segment?.count));
  }

  return counts;
}

export function buildCanonicalSegmentShares(
  segmentCounts: Record<CanonicalFandomSegmentType, number>,
  totalAudience: number,
): Record<CanonicalFandomSegmentType, number> {
  const shares = createEmptySegmentMetricMap();
  if (totalAudience <= 0) return shares;

  for (const segmentType of CANONICAL_FANDOM_SEGMENT_TYPES) {
    shares[segmentType] = round(segmentCounts[segmentType] / totalAudience);
  }

  return shares;
}

export function selectCanonicalFandomSignals(
  input: {
    segments?: CanonicalFandomSegmentRow[] | null;
    fandom?: CanonicalFandomStateRow | null;
  } = {},
): CanonicalFandomSignals {
  const segments = input.segments || [];
  const fandom = input.fandom || null;

  const segmentCounts = buildCanonicalSegmentCounts(segments);
  const totalAudience = Object.values(segmentCounts).reduce((sum, value) => sum + value, 0);
  const segmentShares = buildCanonicalSegmentShares(segmentCounts, totalAudience);

  const averageLoyalty = getWeightedSegmentMetric(segments, 'loyalty', totalAudience);
  const averageMorale = getWeightedSegmentMetric(segments, 'morale', totalAudience);
  const fanMorale = round(clamp(N(fandom?.fan_morale ?? averageMorale), 0, 100), 3);
  const brandTrust = round(clamp(N(fandom?.brand_trust ?? 50), 0, 100), 3);
  const toxicityPressure = round(clampUnit(N(fandom?.toxicity_score) / 100));

  const loyalBaseShare = round(clampUnit(segmentShares.og + segmentShares.core));
  const superfanPressure = round(clampUnit(
    segmentShares.stan
      + (segmentShares.og * 0.25)
      + ((averageLoyalty / 100) * 0.10)
      + ((fanMorale / 100) * 0.05),
  ));
  const trendAmplification = round(clampUnit(
    segmentShares.trend_chaser
      + (segmentShares.casual * 0.30)
      + ((brandTrust / 100) * 0.05),
  ));
  const criticDrag = round(clampUnit(
    (segmentShares.critic * 0.70)
      + (toxicityPressure * 0.20)
      + (Math.max(0, 0.5 - (brandTrust / 100)) * 0.20),
  ));
  const audienceDepth = round(clampUnit(
    (loyalBaseShare * 0.50)
      + (segmentShares.stan * 0.15)
      + ((averageLoyalty / 100) * 0.20)
      + ((fanMorale / 100) * 0.10)
      - (criticDrag * 0.15),
  ));

  return {
    totalAudience,
    segmentCounts,
    segmentShares,
    loyalBaseShare,
    superfanPressure,
    trendAmplification,
    criticDrag,
    audienceDepth,
    averageLoyalty,
    averageMorale,
    fanMorale,
    brandTrust,
    toxicityPressure,
  };
}

export function buildMarketingAudienceMix(signals: CanonicalFandomSignals): MarketingAudienceMix {
  return {
    stans: round(signals.segmentShares.stan * 100, 3),
    core: round(signals.loyalBaseShare * 100, 3),
    casual: round(signals.segmentShares.casual * 100, 3),
    trend: round(signals.segmentShares.trend_chaser * 100, 3),
  };
}

export function buildLegacyEssenceArchetypeDistribution(
  signals: CanonicalFandomSignals,
): LegacyEssenceArchetypeDistribution {
  return {
    critics_adjacent: round((signals.segmentShares.og + signals.segmentShares.core + signals.segmentShares.critic) * 100, 3),
    nostalgia_seekers: round(signals.segmentShares.casual * 100, 3),
    trend_chasers: round(signals.segmentShares.trend_chaser * 100, 3),
    underground_purists: round(signals.segmentShares.stan * 100, 3),
  };
}