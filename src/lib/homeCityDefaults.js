export const HOME_CITY_DEFAULTS = {
  "United States": "New York",
  "Canada": "Toronto",
  "UK": "London",
  "Europe": "Berlin",
  "Asia": "Tokyo",
  "Latin America": "Sao Paulo",
  "Africa": "Lagos",
  "Oceania": "Sydney",
};

export function getDefaultHomeCityForRegion(region) {
  if (!region) return null;
  return HOME_CITY_DEFAULTS[region] ?? null;
}
