export type ContractTier = 'local' | 'regional' | 'national' | 'global' | 'luxury' | string;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeSponsoredBoost(params: {
  contractTier?: ContractTier | null;
  contractCategory?: string | null;
  personaFitScore?: number | null;
  videoAgeTurns?: number;
  isCrossPlatform?: boolean;
  baseImpressions: number;
  baseCpm: number;
}) {
  const {
    contractTier,
    contractCategory,
    personaFitScore,
    videoAgeTurns = 0,
    isCrossPlatform = false,
    baseImpressions,
    baseCpm,
  } = params;

  // Tier table tuned for economic sanity:
  // - Typical impression mults stay near 1.05..1.25
  // - Typical CPM mults stay near 1.10..1.60
  // - Adjacent tiers step up smoothly (no sharp jumps)
  const TIER_BOOSTS: Record<string, { cpm: number; impressions: number }> = {
    local: { cpm: 1.10, impressions: 1.03 },
    regional: { cpm: 1.15, impressions: 1.06 },
    national: { cpm: 1.20, impressions: 1.09 },
    global: { cpm: 1.22, impressions: 1.11 },
    luxury: { cpm: 1.24, impressions: 1.12 },
  };

  const tier = (contractTier || 'local').toLowerCase();
  const tierBoost = TIER_BOOSTS[tier] || TIER_BOOSTS.local;
  // Default persona fit to 0.5 when missing to keep deterministic neutral behavior.
  const fitScore = clamp(Number(personaFitScore ?? 0.5), 0, 1);

  // Fit matters but does not dominate tier: 0.85..1.15
  const personaFactor = 0.85 + fitScore * 0.30;
  const personaRoot = Math.sqrt(personaFactor);

  // Very old videos get a gentle sponsored decay, but still receive boost.
  const ageDecay = videoAgeTurns <= 6 ? 1 : Math.max(0.93, 1 - (videoAgeTurns - 6) * 0.01);

  // Cross-platform contracts split attention/value across surfaces.
  const crossPlatformParity = isCrossPlatform ? 0.95 : 1;

  // Off-brand sponsorships are still viable, but impressions are slightly less efficient.
  const offBrandImpressionPenalty = fitScore < 0.25 ? 0.93 : 1;

  // Use sqrt(personaFactor) on each axis so total revenue effect gets personaFactor once.
  const rawCpmMultiplier = tierBoost.cpm * personaRoot * ageDecay * crossPlatformParity;
  const rawImpressionsMultiplier = tierBoost.impressions * personaRoot * ageDecay * crossPlatformParity * offBrandImpressionPenalty;

  const cpmMultiplier = clamp(rawCpmMultiplier, 1, 2.0);
  const impressionsMultiplier = clamp(rawImpressionsMultiplier, 1, 1.5);

  const boostedImpressions = Math.floor(baseImpressions * impressionsMultiplier);
  const boostedCpm = Math.round(baseCpm * cpmMultiplier * 100) / 100;

  const offBrandRiskBump = fitScore < 0.25 ? 0.03 : 0;

  return {
    contractCategory: contractCategory || null,
    personaFitScore: fitScore,
    cpmMultiplier,
    impressionsMultiplier,
    boostedImpressions,
    boostedCpm,
    offBrandRiskBump,
  };
}

export function computeVidWaveFollowerTrickle(params: {
  viewsThisTurn: number;
  videoAgeTurns: number;
  currentFollowers: number;
  contentQuality: number;
  personaFitScore?: number | null;
  isSponsored?: boolean;
}) {
  const viewsThisTurn = Math.max(0, Math.floor(Number(params.viewsThisTurn) || 0));
  const videoAgeTurns = Math.max(0, Math.floor(Number(params.videoAgeTurns) || 0));
  const currentFollowers = Math.max(0, Math.floor(Number(params.currentFollowers) || 0));

  if (viewsThisTurn <= 0 || currentFollowers <= 0) {
    return {
      followerDelta: 0,
      capped: false,
      breakdown: {
        base: 0,
        decayMultiplier: 0,
        qualityMultiplier: 0,
        personaMultiplier: 1,
        finalBeforeCap: 0,
      },
    };
  }

  const base = viewsThisTurn * 0.005;

  let decayMultiplier = 0.1;
  if (videoAgeTurns <= 2) decayMultiplier = 1.0;
  else if (videoAgeTurns <= 5) decayMultiplier = 0.6;
  else if (videoAgeTurns <= 10) decayMultiplier = 0.3;

  const quality = clamp(Number(params.contentQuality ?? 0.5), 0, 1);
  const qualityMultiplier = 0.75 + quality * 0.5;

  const isSponsored = Boolean(params.isSponsored);
  const fit = clamp(Number(params.personaFitScore ?? 0.5), 0, 1);
  const personaMultiplier = isSponsored ? (0.8 + fit * 0.4) : 1;

  const finalBeforeCap = base * decayMultiplier * qualityMultiplier * personaMultiplier;
  const perVideoCap = Math.max(0, Math.floor(currentFollowers * 0.02));
  const followerDelta = Math.max(0, Math.floor(Math.min(finalBeforeCap, perVideoCap)));

  return {
    followerDelta,
    capped: followerDelta < Math.floor(finalBeforeCap),
    breakdown: {
      base,
      decayMultiplier,
      qualityMultiplier,
      personaMultiplier,
      finalBeforeCap,
    },
  };
}
