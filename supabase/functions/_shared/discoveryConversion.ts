const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export type DiscoveryContext = {
  audienceQualityModifiers?: { discoveryConversionMult?: number; discoveryQualityMultiplier?: number } | null;
  careerTrendEffects?: { discoveryConversionMultAdj?: number } | null;
};

export function getDiscoveryConversionMultiplier(context: DiscoveryContext = {}): number {
  return clamp(
    (Number(context.audienceQualityModifiers?.discoveryConversionMult) || 1)
      * (Number(context.audienceQualityModifiers?.discoveryQualityMultiplier) || 1)
      * (Number(context.careerTrendEffects?.discoveryConversionMultAdj) || 1),
    0.9,
    1.1,
  );
}

export function computeDiscoveryConversion(base: number, context: DiscoveryContext = {}): number {
  return Math.floor((Number(base) || 0) * getDiscoveryConversionMultiplier(context));
}
