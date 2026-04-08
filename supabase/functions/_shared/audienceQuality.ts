const N = (value: unknown): number => Number(value) || 0;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export type DepthTier = 'Fragile' | 'Shallow' | 'Stable' | 'Deep' | 'Legendary';

export type AudienceQualityModifiers = {
  audienceDepth: number;
  depthTier: DepthTier;
  culturalGravity: number;
  viralHalfLifeMult: number;
  discoveryConversionMult: number;
  stabilityDampeningMult: number;
};

export type AudienceQualityInput = {
  fanProfile?: any;
  audienceModifiers?: { effectiveSentiment100?: number } | null;
  era?: { tension?: number; volatility_level?: number; current_multiplier_retention?: number } | null;
  industryPerception?: {
    controversyArc?: { active?: boolean };
    influenceCaps?: { retentionInfluenceMult?: number };
  } | null;
  fandomModifiers?: {
    canonicalSignals?: { audienceDepth?: number } | null;
  } | null;
};

function extractDepthBaseFromCanonicalSignals(canonicalSignals: { audienceDepth?: number } | null | undefined): number {
  return clamp(N(canonicalSignals?.audienceDepth) * 100, 0, 100);
}

export function getDepthTier(audienceDepth: number): DepthTier {
  const depth = clamp(N(audienceDepth), 0, 100);
  if (depth <= 24) return 'Fragile';
  if (depth <= 44) return 'Shallow';
  if (depth <= 64) return 'Stable';
  if (depth <= 84) return 'Deep';
  return 'Legendary';
}

export function buildAudienceQualityModifiers(input: AudienceQualityInput = {}): AudienceQualityModifiers {
  const fanProfile = input.fanProfile || {};
  const fandomMemory = fanProfile?.fandom_memory || {};
  const canonicalSignals = input.fandomModifiers?.canonicalSignals || null;

  const baseDepth = canonicalSignals
    ? extractDepthBaseFromCanonicalSignals(canonicalSignals)
    : 50;
  const community = clamp(N(fandomMemory.community_avg), 0, 100);
  const authenticity = clamp(N(fandomMemory.authenticity_avg), 0, 100);
  const cultureSupport = (0.25 * community) + (0.20 * authenticity);

  const effectiveSentiment100 = clamp(N(input.audienceModifiers?.effectiveSentiment100 ?? 50), 0, 100);
  const sentimentSupport = (effectiveSentiment100 - 50) * 0.25;

  const eraVolatility = clamp(N(input.era?.volatility_level), 0, 100);
  const eraTension = clamp(N(input.era?.tension), 0, 100);

  const controversyActive = !!input.industryPerception?.controversyArc?.active;
  const volatilityDrag = (0.20 * eraVolatility) + (0.15 * eraTension) + (controversyActive ? 8 : 0);

  const audienceDepth = clamp(baseDepth + cultureSupport + sentimentSupport - volatilityDrag, 0, 100);

  const culturalGravity = clamp(0.90 + (audienceDepth / 100) * 0.25, 0.85, 1.15);
  const viralHalfLifeMult = clamp(1.10 - (audienceDepth / 100) * 0.25, 0.85, 1.15);

  const discoveryConversionMult = clamp(
    1.0
      + ((effectiveSentiment100 - 50) / 50) * 0.05
      + ((audienceDepth - 50) / 50) * 0.05,
    0.90,
    1.10,
  );

  const stabilityDampeningMult = clamp(
    1.0
      + (eraVolatility / 100) * 0.10
      - (audienceDepth / 100) * 0.10,
    0.85,
    1.15,
  );

  return {
    audienceDepth: Number(audienceDepth.toFixed(3)),
    depthTier: getDepthTier(audienceDepth),
    culturalGravity: Number(culturalGravity.toFixed(4)),
    viralHalfLifeMult: Number(viralHalfLifeMult.toFixed(4)),
    discoveryConversionMult: Number(discoveryConversionMult.toFixed(4)),
    stabilityDampeningMult: Number(stabilityDampeningMult.toFixed(4)),
  };
}
