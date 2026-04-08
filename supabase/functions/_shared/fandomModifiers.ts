import { clampIdentityMultiplier, getIdentityTrait } from './constants/identityTraits.ts';
import {
  buildLegacyEssenceArchetypeDistribution,
  buildMarketingAudienceMix,
  selectCanonicalFandomSignals,
  type CanonicalFandomSignals,
  type LegacyEssenceArchetypeDistribution,
  type MarketingAudienceMix,
} from './fandomCanonicalSelectors.ts';

const N = (v: unknown): number => Number(v) || 0;
export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export type EssenceVectorKey = 'rebellion' | 'glamour' | 'authenticity' | 'community';

export interface FandomModifiers {
  essenceVectors: Record<EssenceVectorKey, number>;
  rollingEssenceVectors: Record<EssenceVectorKey, number>;
  canonicalSignals: CanonicalFandomSignals;
  marketingAudienceMix: MarketingAudienceMix;
  derivedEssenceArchetypes: LegacyEssenceArchetypeDistribution;
  engagementReadiness: number;
  rollingReadiness: number;
  culturalDriftDirection: EssenceVectorKey;
  culturalMomentum: 'Rising' | 'Stable' | 'Shifting' | 'Fatigued';
  activeSoftState: 'NONE' | 'FANDOM_FATIGUE' | 'CULTURAL_RESURGENCE';
  nickname: string;
  dominantVectors: EssenceVectorKey[];
  volatilitySensitivity: number;
  fanWarIntensityMult: number;
  fandomMemoryPatch: Record<string, unknown>;
  events: Array<{ event_type: string; title: string; description: string; metadata: Record<string, unknown> }>;
}

type FandomMemory = {
  rolling_readiness_avg: number;
  rolling_alignment_avg: number;
  rebellion_avg: number;
  glamour_avg: number;
  authenticity_avg: number;
  community_avg: number;
  last_updated_turn: number;
  recent_readiness?: number[];
  recent_vectors?: Array<Record<EssenceVectorKey, number>>;
};

export function applyExponentialSmoothing(previous: number | null | undefined, current: number): number {
  if (previous == null || Number.isNaN(Number(previous))) return clamp(current, 0, 100);
  return clamp((Number(previous) * 0.85) + (clamp(current, 0, 100) * 0.15), 0, 100);
}

export function buildUpdatedFandomMemory(previous: any, current: {
  readiness: number;
  alignment: number;
  vectors: Record<EssenceVectorKey, number>;
  turnId: number;
}): FandomMemory {
  const prev = (previous && typeof previous === 'object') ? previous as Partial<FandomMemory> : {};
  const next: FandomMemory = {
    rolling_readiness_avg: applyExponentialSmoothing(prev.rolling_readiness_avg, current.readiness),
    rolling_alignment_avg: applyExponentialSmoothing(prev.rolling_alignment_avg, current.alignment),
    rebellion_avg: applyExponentialSmoothing(prev.rebellion_avg, current.vectors.rebellion),
    glamour_avg: applyExponentialSmoothing(prev.glamour_avg, current.vectors.glamour),
    authenticity_avg: applyExponentialSmoothing(prev.authenticity_avg, current.vectors.authenticity),
    community_avg: applyExponentialSmoothing(prev.community_avg, current.vectors.community),
    last_updated_turn: current.turnId,
    recent_readiness: [...((prev.recent_readiness || []).slice(-11)), clamp(current.readiness, 0, 100)],
    recent_vectors: [...((prev.recent_vectors || []).slice(-11)), {
      rebellion: clamp(current.vectors.rebellion, 0, 100),
      glamour: clamp(current.vectors.glamour, 0, 100),
      authenticity: clamp(current.vectors.authenticity, 0, 100),
      community: clamp(current.vectors.community, 0, 100),
    }]
  };
  return next;
}

export function computeCulturalDriftDirection(memory: FandomMemory): EssenceVectorKey {
  const vectors = (memory.recent_vectors || []).slice(-5);
  if (vectors.length < 2) return 'community';
  const first = vectors[0];
  const last = vectors[vectors.length - 1];
  const deltas: Array<[EssenceVectorKey, number]> = (['rebellion', 'glamour', 'authenticity', 'community'] as EssenceVectorKey[])
    .map((k) => [k, N(last[k]) - N(first[k])]);
  deltas.sort((a, b) => b[1] - a[1]);
  return deltas[0][0];
}

export function detectCulturalEvents(memory: FandomMemory): { softState: FandomModifiers['activeSoftState']; momentum: FandomModifiers['culturalMomentum']; } {
  const readinessHistory = memory.recent_readiness || [];
  const rolling = clamp(N(memory.rolling_readiness_avg), 0, 100);
  const hasFatigue = rolling < 35 && readinessHistory.length >= 8 && readinessHistory.slice(-8).every((v) => N(v) < 35);

  const latestWindow = readinessHistory.slice(-5);
  const windowMin = latestWindow.length ? Math.min(...latestWindow.map(N)) : 100;
  const windowMax = latestWindow.length ? Math.max(...latestWindow.map(N)) : 0;
  const hasComeback = latestWindow.length >= 2 && windowMin < 40 && windowMax > 65;

  if (hasFatigue) return { softState: 'FANDOM_FATIGUE', momentum: 'Fatigued' };
  if (hasComeback) return { softState: 'CULTURAL_RESURGENCE', momentum: 'Rising' };
  if (Math.abs(N(latestWindow.at(-1)) - N(latestWindow[0])) <= 4) return { softState: 'NONE', momentum: 'Stable' };
  return { softState: 'NONE', momentum: 'Shifting' };
}

const NICKNAME_MAP: Record<string, string> = {
  // 2-vector combinations
  'rebellion+glamour': 'Velvet Riot Collective',
  'rebellion+authenticity': 'Truth Rebels',
  'rebellion+community': 'Block Party Uprising',
  'glamour+authenticity': 'Real Gold Society',
  'glamour+community': 'Main Character Mob',
  'authenticity+community': 'Day-One Circle',
  // 3-vector combinations (dominant + strong secondary + third)
  'rebellion+glamour+authenticity': 'Chaos Luxe Order',
  'rebellion+glamour+community': 'Street Glam Army',
  'rebellion+authenticity+community': 'Raw Ground Collective',
  'glamour+authenticity+community': 'Golden Circle Society',
  'rebellion+community+glamour': 'Block Glam Movement',
  'authenticity+rebellion+community': 'Underground Faithful',
  'glamour+rebellion+community': 'Silk & Smoke Crew',
  'community+authenticity+glamour': 'Roots & Radiance Union',
};

function normArchetypes(archetypes: Record<string, number> = {}): Record<string, number> {
  const total = Object.values(archetypes).reduce((s, v) => s + N(v), 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(archetypes)) out[k] = N(v) / total;
  return out;
}

function focusPathFlags(focusPath?: string | null) {
  const key = (focusPath || '').toUpperCase();
  return {
    commercial: ['HIT_CHASE', 'MEDIA_DARLING', 'BRAND_MOGUL', 'CROSSOVER_KING'].includes(key),
    artistic: ['ALBUM_AUTEUR', 'UNDERGROUND_LEGEND', 'SCENE_DOMINANCE'].includes(key),
    community: ['TOUR_MONSTER', 'GLOBAL_EXPANSION', 'SCENE_DOMINANCE'].includes(key),
    digital: ['DIGITAL_CULT'].includes(key),
  };
}

export function deriveFandomEssenceVectors(input: {
  fanArchetypes?: Record<string, number>;
  focusPath?: string | null;
  phase?: string | null;
  alignmentScore?: number;
  isExperimental?: boolean;
  hype?: number;
  clout?: number;
  tension?: number;
  volatility?: number;
  activeWarCount?: number;
  socialActivityScore?: number;
}) {
  const archetypes = normArchetypes(input.fanArchetypes || {});
  const focus = focusPathFlags(input.focusPath);
  const phase = (input.phase || '').toUpperCase();
  const alignment = clamp(N(input.alignmentScore), 0, 100);
  const hype = clamp(N(input.hype), 0, 100);
  const clout = clamp(N(input.clout), 0, 2000);
  const tension = clamp(N(input.tension), 0, 100);
  const volatility = clamp(N(input.volatility), 0, 100);
  const warCount = clamp(N(input.activeWarCount), 0, 3);
  const socialActivity = clamp(N(input.socialActivityScore), 0, 100);

  const rebellion = clamp(
    30
    + 45 * N(archetypes.underground_purists)
    + (input.isExperimental ? 10 : 0)
    + (volatility * 0.12)
    + (tension * 0.08)
    + (phase === 'DROP' ? 3 : 0)
    , 0, 100);

  const glamour = clamp(
    25
    + 45 * N(archetypes.trend_chasers)
    + (focus.commercial ? 10 : 0)
    + (focus.digital ? 4 : 0)
    + (hype * 0.15)
    + (clout * 0.006)
    , 0, 100);

  const authenticity = clamp(
    25
    + 45 * N(archetypes.critics_adjacent)
    + (focus.artistic ? 10 : 0)
    + (alignment * 0.22)
    + (input.isExperimental ? -4 : 0)
    + (phase === 'FADE' ? 2 : 0)
    , 0, 100);

  const community = clamp(
    25
    + 45 * N(archetypes.nostalgia_seekers)
    + (focus.community ? 10 : 0)
    + Math.max(0, (70 - volatility) * 0.08)
    + (warCount * 4)
    + (socialActivity * 0.08)
    , 0, 100);

  const vectors = {
    rebellion: Math.round(rebellion),
    glamour: Math.round(glamour),
    authenticity: Math.round(authenticity),
    community: Math.round(community),
  };

  const sortedVectors = (Object.entries(vectors) as [EssenceVectorKey, number][])
    .sort((a, b) => b[1] - a[1]);
  const dominantVectors = sortedVectors.slice(0, 2).map(([k]) => k);
  const thirdVector = sortedVectors[2]?.[0];

  const key3 = thirdVector ? `${dominantVectors[0]}+${dominantVectors[1]}+${thirdVector}` : '';
  const key2 = `${dominantVectors[0]}+${dominantVectors[1]}`;
  const reverseKey2 = `${dominantVectors[1]}+${dominantVectors[0]}`;
  const fandomNickname = (key3 && NICKNAME_MAP[key3]) || NICKNAME_MAP[key2] || NICKNAME_MAP[reverseKey2] || 'The Core Fandom';

  return { vectors, dominantVectors, fandomNickname };
}

export function deriveEngagementReadiness(input: {
  hype?: number;
  alignmentScore?: number;
  momentum?: number;
  socialActivityScore?: number;
  isExperimental?: boolean;
  tension?: number;
  sentiment?: number | null;
}) {
  const hype = clamp(N(input.hype), 0, 100);
  const alignment = clamp(N(input.alignmentScore), 0, 100);
  const momentum = clamp(N(input.momentum), 0, 100);
  const social = clamp(N(input.socialActivityScore), 0, 100);

  let readiness = 0.5 * hype + 0.2 * alignment + 0.2 * momentum + 0.1 * social;
  let volatilitySensitivity = 1;

  if (input.isExperimental) {
    readiness += 5;
    volatilitySensitivity += 0.05;
  }

  const sentiment = input.sentiment == null ? null : clamp(N(input.sentiment), 0, 100);
  const tension = clamp(N(input.tension), 0, 100);
  if (sentiment != null && tension >= 75 && sentiment < 45) {
    readiness -= 6;
  }

  return {
    readiness: Math.round(clamp(readiness, 0, 100)),
    volatilitySensitivity,
  };
}

export async function buildFandomModifiersForPlayer(player: any, globalTurnId: number, supabaseClient: any): Promise<FandomModifiers> {
  const [{ data: fanProfile }, { data: era }, { data: activeWars }, { data: socialPosts }, { data: fandomRow }, { data: segmentRows }] = await Promise.all([
    supabaseClient.from('fan_profiles').select('overall_sentiment, fandom_memory, custom_fanbase_nickname').eq('artist_id', player.id).maybeSingle(),
    supabaseClient.from('eras').select('focus_path, phase, identity_alignment_score, is_experimental, momentum, tension, volatility_level, expression_identity_primary').eq('artist_id', player.id).eq('is_active', true).maybeSingle(),
    supabaseClient.from('fan_wars').select('id').eq('artist_id', player.id).in('status', ['active', 'escalated']),
    supabaseClient.from('social_posts').select('id').eq('artist_id', player.id).gte('created_at', new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()),
    supabaseClient.from('fandoms').select('fanbase_name, fan_morale, brand_trust, toxicity_score').eq('player_id', player.id).maybeSingle(),
    supabaseClient.from('fandom_segments').select('segment_type, count').eq('player_id', player.id),
  ]);

  const canonicalSignals = selectCanonicalFandomSignals({
    segments: segmentRows || [],
    fandom: fandomRow || null,
  });
  const derivedArchetypes = buildLegacyEssenceArchetypeDistribution(canonicalSignals);
  const marketingAudienceMix = buildMarketingAudienceMix(canonicalSignals);

  const socialActivityScore = clamp((socialPosts?.length || 0) * 20, 0, 100);
  const essence = deriveFandomEssenceVectors({
    fanArchetypes: derivedArchetypes,
    focusPath: era?.focus_path,
    phase: era?.phase,
    alignmentScore: era?.identity_alignment_score,
    isExperimental: !!era?.is_experimental,
    hype: player?.hype,
    clout: player?.clout,
    tension: era?.tension,
    volatility: era?.volatility_level,
    activeWarCount: activeWars?.length || 0,
    socialActivityScore,
  });

  const identityId = era?.expression_identity_primary || player?.core_brand_identity_primary || null;
  const trait = getIdentityTrait(identityId);

  const readinessState = deriveEngagementReadiness({
    hype: player?.hype,
    alignmentScore: era?.identity_alignment_score,
    momentum: era?.momentum,
    socialActivityScore,
    isExperimental: !!era?.is_experimental,
    tension: era?.tension,
    sentiment: fanProfile?.overall_sentiment,
  });

  const memory = buildUpdatedFandomMemory(fanProfile?.fandom_memory, {
    readiness: readinessState.readiness,
    alignment: clamp(N(era?.identity_alignment_score), 0, 100),
    vectors: essence.vectors,
    turnId: globalTurnId,
  });
  const driftDirection = computeCulturalDriftDirection(memory);
  const cultural = detectCulturalEvents(memory);

  const blendedReadiness = clamp((readinessState.readiness * 0.8) + (N(memory.rolling_readiness_avg) * 0.2), 0, 100);
  const volatilitySensitivity = clamp(
    readinessState.volatilitySensitivity
      + ((N(memory.rebellion_avg) - N(memory.community_avg)) / 250)
      + ((trait.volatilityTolerance - 0.5) * 0.2),
    0.8,
    1.25
  );

  const rollingEssenceVectors = {
    rebellion: Math.round(clamp(N(memory.rebellion_avg), 0, 100)),
    glamour: Math.round(clamp(N(memory.glamour_avg), 0, 100)),
    authenticity: Math.round(clamp(N(memory.authenticity_avg), 0, 100)),
    community: Math.round(clamp(N(memory.community_avg), 0, 100)),
  };

  const fanWarIntensityMult = clampIdentityMultiplier(1 + (trait.volatilityTolerance * 0.08) - (trait.defenseBias * 0.04));
  const events: FandomModifiers['events'] = [];
  if (cultural.softState === 'FANDOM_FATIGUE') {
    events.push({
      event_type: 'fandom_fatigue',
      title: 'Fandom Fatigue',
      description: 'Your fandom momentum is tired. Action strength is temporarily reduced.',
      metadata: { rolling_readiness_avg: Math.round(N(memory.rolling_readiness_avg)), turns_below_threshold: 8 }
    });
  }
  if (cultural.softState === 'CULTURAL_RESURGENCE') {
    events.push({
      event_type: 'cultural_resurgence',
      title: 'Cultural Resurgence',
      description: 'Your fandom snapped back with renewed momentum.',
      metadata: { rolling_readiness_avg: Math.round(N(memory.rolling_readiness_avg)), recovery_window_turns: 5 }
    });
  }

  return {
    essenceVectors: essence.vectors,
    rollingEssenceVectors,
    canonicalSignals,
    marketingAudienceMix,
    derivedEssenceArchetypes: derivedArchetypes,
    engagementReadiness: Math.round(blendedReadiness),
    rollingReadiness: Math.round(clamp(N(memory.rolling_readiness_avg), 0, 100)),
    culturalDriftDirection: driftDirection,
    culturalMomentum: cultural.momentum,
    activeSoftState: cultural.softState,
    nickname: fandomRow?.fanbase_name || fanProfile?.custom_fanbase_nickname || essence.fandomNickname,
    dominantVectors: essence.dominantVectors,
    volatilitySensitivity,
    fanWarIntensityMult,
    fandomMemoryPatch: memory,
    events,
  };
}
