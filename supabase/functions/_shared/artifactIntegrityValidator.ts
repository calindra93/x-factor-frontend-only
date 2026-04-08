/**
 * artifactIntegrityValidator.ts
 * 
 * Plan 034 M3: Artifact Integrity Validator
 * 
 * Enforces:
 * 1. No city has empty artifacts
 * 2. No duplicate artifact ID exists across cities
 * 
 * Behavior:
 * - dev/local: hard-fail (throws)
 * - production: warn + event instrumentation
 */

import type { CityScene, CulturalArtifact } from './sceneMath.ts';

export interface ArtifactIntegrityReport {
  ok: boolean;
  citiesWithEmptyArtifacts: string[];
  duplicateArtifactIds: Array<{ id: string; cities: string[] }>;
  totalCities: number;
  totalArtifacts: number;
}

/**
 * Validates artifact integrity across all city scenes.
 * 
 * @param cities - Array of CityScene objects with cultural_artifacts
 * @returns ArtifactIntegrityReport with details of any violations
 */
export function validateArtifactIntegrity(cities: CityScene[]): ArtifactIntegrityReport {
  const citiesWithEmptyArtifacts: string[] = [];
  const artifactIdToCities = new Map<string, string[]>();
  let totalArtifacts = 0;

  for (const city of cities) {
    const artifacts: CulturalArtifact[] = city.cultural_artifacts || [];
    
    // Check 1: No empty artifacts
    if (artifacts.length === 0) {
      citiesWithEmptyArtifacts.push(city.city_name);
    }

    // Track artifact IDs for duplicate check
    for (const artifact of artifacts) {
      totalArtifacts++;
      const existing = artifactIdToCities.get(artifact.id);
      if (existing) {
        existing.push(city.city_name);
      } else {
        artifactIdToCities.set(artifact.id, [city.city_name]);
      }
    }
  }

  // Check 2: No duplicate artifact IDs across cities
  const duplicateArtifactIds: Array<{ id: string; cities: string[] }> = [];
  for (const [id, cityNames] of artifactIdToCities.entries()) {
    if (cityNames.length > 1) {
      duplicateArtifactIds.push({ id, cities: cityNames });
    }
  }

  const ok = citiesWithEmptyArtifacts.length === 0 && duplicateArtifactIds.length === 0;

  return {
    ok,
    citiesWithEmptyArtifacts,
    duplicateArtifactIds,
    totalCities: cities.length,
    totalArtifacts,
  };
}

/**
 * Enforces artifact integrity constraints.
 * 
 * @param cities - Array of CityScene objects with cultural_artifacts
 * @param isProduction - Whether running in production (warn only) or dev (throw)
 * @returns Report and any turn_events to emit
 */
export function enforceArtifactIntegrity(
  cities: CityScene[],
  isProduction: boolean
): {
  report: ArtifactIntegrityReport;
  turn_events: Array<{ module: string; event_type: string; description: string; metadata: Record<string, unknown> }>;
} {
  const report = validateArtifactIntegrity(cities);
  const turn_events: Array<{ module: string; event_type: string; description: string; metadata: Record<string, unknown> }> = [];

  if (!report.ok) {
    const errorDetails = {
      citiesWithEmptyArtifacts: report.citiesWithEmptyArtifacts,
      duplicateArtifactIds: report.duplicateArtifactIds,
      totalCities: report.totalCities,
      totalArtifacts: report.totalArtifacts,
    };

    if (isProduction) {
      // Production: warn + event instrumentation (no throw)
      console.warn('[ARTIFACT_INTEGRITY_VIOLATION]', errorDetails);
      turn_events.push({
        module: 'sceneSystem',
        event_type: 'artifact_integrity_violation',
        description: `Artifact integrity check failed: ${report.citiesWithEmptyArtifacts.length} empty, ${report.duplicateArtifactIds.length} duplicates`,
        metadata: errorDetails,
      });
    } else {
      // Dev/local: hard-fail
      throw new Error(
        `[ARTIFACT_INTEGRITY_VIOLATION] ` +
        `Empty artifact cities: [${report.citiesWithEmptyArtifacts.join(', ')}]. ` +
        `Duplicate artifact IDs: [${report.duplicateArtifactIds.map(d => d.id).join(', ')}].`
      );
    }
  }

  return { report, turn_events };
}
