/**
 * Canonical region name mapping.
 * Maps any known alias or abbreviation → canonical region string
 * used in the `profiles.region` and `studios.region` columns.
 *
 * All code that filters or compares region strings should normalize
 * through this map before doing equality checks.
 */
export const CANONICAL_REGION_MAPPING = {
  "United States": "United States",
  "US": "United States",
  "Canada": "Canada",
  "Latin America": "Latin America",
  "Africa": "Africa",
  "Europe": "Europe",
  "UK": "UK",
  "Oceania": "Oceania",
  "Asia": "Asia",
};

/**
 * Normalizes a raw region string to the canonical form.
 * Returns the input unchanged if no mapping is found
 * (safe fallback — unknown regions pass through rather than silently dropping).
 *
 * @param {string|null|undefined} region
 * @returns {string}
 */
export function normalizeRegion(region) {
  if (!region) return "";
  return CANONICAL_REGION_MAPPING[region] ?? region;
}

/** Ordered list of selectable regions used in onboarding/travel dropdowns. */
export const SELECTABLE_REGIONS = [
  "United States",
  "Canada",
  "UK",
  "Europe",
  "Latin America",
  "Africa",
  "Asia",
  "Oceania",
];
