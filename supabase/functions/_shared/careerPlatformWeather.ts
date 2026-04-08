export interface CareerPlatformWeatherRecord {
  platform_key?: string;
  modifier_payload?: Record<string, any> | null;
}

export function resolvePlatformWeather(
  platformKey: string | null | undefined,
  rows: CareerPlatformWeatherRecord[] = [],
): CareerPlatformWeatherRecord | null {
  if (!platformKey) return null;
  return rows.find((row) => row?.platform_key === platformKey) || null;
}
