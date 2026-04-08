export interface IdentityTrait {
  volatilityTolerance: number;
  chartBias: number;
  defenseBias: number;
  pivotElasticity: number;
  discoveryBias: number;
}

const DEFAULT_TRAIT: IdentityTrait = {
  volatilityTolerance: 0.55,
  chartBias: 0.55,
  defenseBias: 0.55,
  pivotElasticity: 0.55,
  discoveryBias: 0.55,
};

export const identityTraits: Record<string, IdentityTrait> = {
  street_authentic: { volatilityTolerance: 0.65, chartBias: 0.45, defenseBias: 0.7, pivotElasticity: 0.4, discoveryBias: 0.5 },
  luxury_hustler: { volatilityTolerance: 0.5, chartBias: 0.75, defenseBias: 0.55, pivotElasticity: 0.55, discoveryBias: 0.6 },
  conscious_voice: { volatilityTolerance: 0.45, chartBias: 0.4, defenseBias: 0.75, pivotElasticity: 0.35, discoveryBias: 0.5 },
  party_club_catalyst: { volatilityTolerance: 0.7, chartBias: 0.7, defenseBias: 0.45, pivotElasticity: 0.65, discoveryBias: 0.75 },
  nostalgic_boom_bap: { volatilityTolerance: 0.4, chartBias: 0.35, defenseBias: 0.8, pivotElasticity: 0.3, discoveryBias: 0.4 },
  femme_power: { volatilityTolerance: 0.7, chartBias: 0.6, defenseBias: 0.8, pivotElasticity: 0.5, discoveryBias: 0.7 },
  viral_trendsetter: { volatilityTolerance: 0.8, chartBias: 0.8, defenseBias: 0.45, pivotElasticity: 0.75, discoveryBias: 0.85 },
  aesthetic_curator: { volatilityTolerance: 0.55, chartBias: 0.65, defenseBias: 0.5, pivotElasticity: 0.65, discoveryBias: 0.7 },
  relatable_storyteller: { volatilityTolerance: 0.45, chartBias: 0.5, defenseBias: 0.65, pivotElasticity: 0.6, discoveryBias: 0.75 },
  internet_troll: { volatilityTolerance: 0.85, chartBias: 0.55, defenseBias: 0.35, pivotElasticity: 0.7, discoveryBias: 0.65 },
  producer_visionary: { volatilityTolerance: 0.6, chartBias: 0.55, defenseBias: 0.55, pivotElasticity: 0.7, discoveryBias: 0.65 },
  motivational_hustler: { volatilityTolerance: 0.6, chartBias: 0.6, defenseBias: 0.65, pivotElasticity: 0.6, discoveryBias: 0.7 },
};

export function getIdentityTrait(identity?: string | null): IdentityTrait {
  return identityTraits[(identity || '').toLowerCase()] || DEFAULT_TRAIT;
}

export function clampIdentityMultiplier(mult: number): number {
  return Math.max(0.85, Math.min(1.25, mult));
}
