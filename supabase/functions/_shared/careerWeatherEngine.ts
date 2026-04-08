import { computeDominantLane } from './careerShadowTracks.ts';

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

type LaneScores = {
  commercial_heat: number;
  cultural_influence: number;
  live_draw: number;
  industry_respect: number;
  core_fan_devotion: number;
};

type LaneResult = {
  scores: LaneScores;
  dominant_lane: string | null;
  secondary_lane: string | null;
  proof_summary: string[];
};

type WeatherRecord = {
  id?: string;
  weather_key?: string;
  region?: string;
  platform_key?: string;
  intensity?: number;
  modifier_payload?: Record<string, any> | null;
};

type WeatherRuntime = {
  global?: WeatherRecord | null;
  region?: WeatherRecord | null;
  platform?: WeatherRecord | null;
};

export async function loadCareerWeatherState(supabaseClient: any): Promise<WeatherRecord | null> {
  const response = await supabaseClient
    .from('career_weather_states')
    .select('id,weather_key,label,intensity,modifier_payload,started_turn,ends_turn')
    .eq('is_active', true)
    .eq('is_global', true)
    .order('started_turn', { ascending: false, nullsFirst: false })
    .limit(1);

  return response?.data?.[0] || null;
}

function sumLaneBias(weatherRuntime: WeatherRuntime): Partial<LaneScores> {
  const combined: Partial<LaneScores> = {};
  const sources = [weatherRuntime?.global, weatherRuntime?.region, weatherRuntime?.platform];

  for (const source of sources) {
    const laneBias = source?.modifier_payload?.lane_bias || {};
    for (const [lane, rawValue] of Object.entries(laneBias)) {
      combined[lane as keyof LaneScores] = Number(combined[lane as keyof LaneScores] || 0) + Number(rawValue || 0);
    }
  }

  return combined;
}

function resolveWeatherFit(weatherRuntime: WeatherRuntime): string | null {
  return weatherRuntime?.global?.modifier_payload?.weather_fit
    || weatherRuntime?.region?.modifier_payload?.weather_fit
    || weatherRuntime?.platform?.modifier_payload?.weather_fit
    || null;
}

export function applyWeatherBias(baseLaneResult: LaneResult, weatherRuntime: WeatherRuntime) {
  const laneBias = sumLaneBias(weatherRuntime);
  const nextScores: LaneScores = {
    commercial_heat: clamp(baseLaneResult?.scores?.commercial_heat + Number(laneBias.commercial_heat || 0)),
    cultural_influence: clamp(baseLaneResult?.scores?.cultural_influence + Number(laneBias.cultural_influence || 0)),
    live_draw: clamp(baseLaneResult?.scores?.live_draw + Number(laneBias.live_draw || 0)),
    industry_respect: clamp(baseLaneResult?.scores?.industry_respect + Number(laneBias.industry_respect || 0)),
    core_fan_devotion: clamp(baseLaneResult?.scores?.core_fan_devotion + Number(laneBias.core_fan_devotion || 0)),
  };

  const dominant = computeDominantLane(nextScores);

  return {
    ...baseLaneResult,
    scores: nextScores,
    dominant_lane: dominant.dominant,
    secondary_lane: dominant.secondary,
    weather_fit: resolveWeatherFit(weatherRuntime),
    weather_keys: {
      global: weatherRuntime?.global?.weather_key || null,
      region: weatherRuntime?.region?.region || null,
      platform: weatherRuntime?.platform?.platform_key || null,
    },
  };
}
