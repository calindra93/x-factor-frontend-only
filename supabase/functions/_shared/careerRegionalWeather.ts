export interface CareerRegionalWeatherRecord {
  region?: string;
  modifier_payload?: Record<string, any> | null;
}

export function resolveRegionalWeather(
  regionKey: string | null | undefined,
  rows: CareerRegionalWeatherRecord[] = [],
): CareerRegionalWeatherRecord | null {
  if (!regionKey) return null;
  return rows.find((row) => row?.region === regionKey) || null;
}
