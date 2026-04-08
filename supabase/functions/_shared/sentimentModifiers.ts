const N = (value: unknown): number => Number(value) || 0;

export type SentimentBand =
  | 'Hostile'
  | 'Negative'
  | 'Unhappy'
  | 'Mixed'
  | 'Positive'
  | 'Loyal'
  | 'Devoted';

export type AudienceModifiers = {
  sentimentBand: SentimentBand;
  sentiment100: number;
  effectiveSentiment100: number;
  churnDelta: number;
  warIntensityMult: number;
  defenseMult: number;
  fanHeatBias: number;
  brandSafetyBias: number;
  churnMultiplier?: number;
  phase6Heat?: number;
  phase6Fatigue?: number;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const BAND_EFFECTS: Record<SentimentBand, Pick<AudienceModifiers, 'churnDelta' | 'warIntensityMult' | 'defenseMult'>> = {
  Hostile: { churnDelta: 0.012, warIntensityMult: 1.10, defenseMult: 0.90 },
  Negative: { churnDelta: 0.008, warIntensityMult: 1.08, defenseMult: 0.93 },
  Unhappy: { churnDelta: 0.004, warIntensityMult: 1.04, defenseMult: 0.97 },
  Mixed: { churnDelta: 0, warIntensityMult: 1.00, defenseMult: 1.00 },
  Positive: { churnDelta: -0.002, warIntensityMult: 0.99, defenseMult: 1.03 },
  Loyal: { churnDelta: -0.005, warIntensityMult: 0.97, defenseMult: 1.07 },
  Devoted: { churnDelta: -0.008, warIntensityMult: 0.95, defenseMult: 1.10 },
};

export function normalizeSentiment100(overallSentimentNeg100To100: number): number {
  return clamp(Math.round((clamp(N(overallSentimentNeg100To100), -100, 100) + 100) / 2), 0, 100);
}

export function classifySentimentBand(sentiment100: number): SentimentBand {
  const value = clamp(N(sentiment100), 0, 100);
  if (value <= 14) return 'Hostile';
  if (value <= 29) return 'Negative';
  if (value <= 44) return 'Unhappy';
  if (value <= 54) return 'Mixed';
  if (value <= 69) return 'Positive';
  if (value <= 84) return 'Loyal';
  return 'Devoted';
}

export function smoothEffectiveSentiment100(priorEffective: number | null | undefined, currentSentiment100: number): number {
  if (priorEffective == null || Number.isNaN(Number(priorEffective))) {
    return clamp(N(currentSentiment100), 0, 100);
  }
  return clamp((N(priorEffective) * 0.85) + (clamp(N(currentSentiment100), 0, 100) * 0.15), 0, 100);
}

export function clampWarIntensityMultiplier(mult: number): number {
  return clamp(N(mult), 0.90, 1.10);
}

export function clampDefenseMultiplier(mult: number): number {
  return clamp(N(mult), 0.90, 1.10);
}

export function computeAudienceModifiersFromSentiment(effectiveSentiment100: number, rawSentiment100: number): AudienceModifiers {
  const effective = clamp(N(effectiveSentiment100), 0, 100);
  const sentimentBand = classifySentimentBand(effective);
  const effects = BAND_EFFECTS[sentimentBand];

  return {
    sentimentBand,
    sentiment100: clamp(N(rawSentiment100), 0, 100),
    effectiveSentiment100: effective,
    churnDelta: clamp(effects.churnDelta, -0.015, 0.015),
    warIntensityMult: clampWarIntensityMultiplier(effects.warIntensityMult),
    defenseMult: clampDefenseMultiplier(effects.defenseMult),
    fanHeatBias: clamp((effective - 50) * 0.15, -7.5, 7.5),
    brandSafetyBias: clamp((effective - 50) * 0.10, -5, 5),
  };
}

export function buildAudienceModifiersFromFanProfile(fanProfile: any): { audienceModifiers: AudienceModifiers; sentimentMemoryPatch: Record<string, unknown> } {
  const sentiment100 = normalizeSentiment100(fanProfile?.overall_sentiment);
  const priorEffective = fanProfile?.fandom_memory?.sentiment?.effective100;
  const effectiveSentiment100 = smoothEffectiveSentiment100(priorEffective, sentiment100);
  const audienceModifiers = computeAudienceModifiersFromSentiment(effectiveSentiment100, sentiment100);

  return {
    audienceModifiers,
    sentimentMemoryPatch: {
      sentiment: {
        effective100: Number(effectiveSentiment100.toFixed(3)),
        last_raw100: sentiment100,
      },
    },
  };
}
