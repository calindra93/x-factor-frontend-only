/**
 * artifactEffects.ts
 * 
 * Plan 034 M5: Compute aggregate artifact effects for game mechanics.
 * 
 * Effect types (from city_scenes.cultural_artifacts):
 * - scene_rep_mult: multiplier on scene reputation gain (e.g., 1.15 = +15%)
 * - fan_reception: additive bonus to fan reception metrics (e.g., 0.07)
 * - brand_auth: additive bonus to brand authenticity (e.g., 0.04)
 */

import type { CulturalArtifact } from './sceneMath.ts';

export interface ArtifactEffects {
  sceneRepMult: number;       // multiplicative (default 1.0)
  fanReception: number;        // additive (default 0.0)
  brandAuth: number;           // additive (default 0.0)
  networkingBoost: number;     // additive (default 0.0)
  unknownEffects: string[];    // any effect types we don't handle
}

/**
 * Aggregates effects from a list of discovered artifacts.
 * Called per-city with only artifacts the player has discovered in that city.
 * 
 * @param discoveredArtifactIds - IDs of artifacts the player has discovered
 * @param allCityArtifacts - All artifacts available in this city
 * @returns Aggregated effect multipliers and bonuses
 */
export function computeArtifactEffects(
  discoveredArtifactIds: string[],
  allCityArtifacts: CulturalArtifact[]
): ArtifactEffects {
  const result: ArtifactEffects = {
    sceneRepMult: 1.0,
    fanReception: 0.0,
    brandAuth: 0.0,
    networkingBoost: 0.0,
    unknownEffects: [],
  };

  if (!discoveredArtifactIds?.length || !allCityArtifacts?.length) {
    return result;
  }

  const discoveredSet = new Set(discoveredArtifactIds);

  for (const artifact of allCityArtifacts) {
    if (!discoveredSet.has(artifact.id)) continue;

    const effect = artifact.effect;
    if (!effect?.type) continue;

    switch (effect.type) {
      case 'scene_rep_mult':
        // Multiplicative stacking
        result.sceneRepMult *= effect.value;
        break;
      case 'fan_reception':
        // Additive stacking
        result.fanReception += effect.value;
        break;
      case 'brand_auth':
        result.brandAuth += effect.value;
        break;
      case 'networking_boost':
        result.networkingBoost += effect.value;
        break;
      default:
        // Unknown effect type — track for instrumentation
        result.unknownEffects.push(effect.type);
    }
  }

  return result;
}

/**
 * Generates a turn event for artifact effect application (for instrumentation).
 */
export function createArtifactEffectEvent(
  playerId: string,
  cityId: string,
  cityName: string,
  effects: ArtifactEffects,
  discoveredCount: number
): {
  module: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
} {
  return {
    module: 'sceneSystem',
    event_type: 'artifact_effects_applied',
    description: `Applied ${discoveredCount} artifact effect(s) in ${cityName}`,
    metadata: {
      player_id: playerId,
      city_id: cityId,
      city_name: cityName,
      discovered_count: discoveredCount,
      scene_rep_mult: effects.sceneRepMult,
      fan_reception: effects.fanReception,
      brand_auth: effects.brandAuth,
      networking_boost: effects.networkingBoost,
      unknown_effects: effects.unknownEffects,
    },
  };
}
