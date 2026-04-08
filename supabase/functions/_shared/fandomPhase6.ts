import {
  SUPERFANS_TUNING,
  REGIONAL_TUNING,
  MEMORY_TUNING,
  CROSS_SYSTEM_TUNING,
  SATURATION_TUNING,
} from './fandomPhase6Tuning.ts';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function normalizeReleaseCadence(cadence: FandomPhase6State['release_cadence'] | null | undefined): NonNullable<FandomPhase6State['release_cadence']> {
  const rawWindow = Number(cadence?.window_size_turns);
  const window_size_turns = Number.isFinite(rawWindow) && rawWindow > 0
    ? rawWindow
    : SATURATION_TUNING.WINDOW_SIZE_TURNS;
  const recent = Array.isArray(cadence?.recent) ? cadence.recent : [];
  return { window_size_turns, recent };
}

// Segment keys updated Feb 2026: replaced 5-type model (casual/core/defenders/stans/trend_riders)
// with 6-type model aligned to fandomSegmentsEngine.ts.
// Mapping: defenders→stan, stans→og, trend_riders→trend_chaser, added critic.
export type FandomSegmentKey = 'casual' | 'core' | 'og' | 'stan' | 'trend_chaser' | 'critic';
export type ImprintKey = 'legacy' | 'scandal' | 'comeback' | 'nostalgia';

export type RegionKey = 'United States' | 'Canada' | 'UK' | 'Europe' | 'Asia' | 'Africa' | 'Oceania' | 'Latin America';

export type FandomPhase6State = {
  artist_id: string;
  fan_segments: Record<FandomSegmentKey, number>;
  loyalty: Record<FandomSegmentKey, number>;
  heat: number;
  fatigue: number;
  imprint: Record<ImprintKey, number>;
  superfans_share: number;
  consecutive_high_fatigue_turns?: number;
  release_cadence?: {
    window_size_turns: number;
    recent: Array<{
      turnId: number;
      kind: "single" | "ep" | "album" | "other";
      projectId?: string | null;
      releaseId?: string | null;
      eraKey?: string | null;
      isRolloutSingle?: boolean;
    }>;
  };
  region_bias?: Record<string, {
    loyaltyBias: number;
    volatilityBias: number;
    brandSafetyBias: number;
  }>;
  inactivity_turns?: number;
  updated_at?: string;
};

const DEFAULT_SEGMENTS: Record<FandomSegmentKey, number> = {
  casual:       0.55,
  core:         0.20,
  og:           0.02,
  stan:         0.05,
  trend_chaser: 0.15,
  critic:       0.03,
};

const DEFAULT_LOYALTY: Record<FandomSegmentKey, number> = {
  casual:       0.10,
  core:         0.25,
  og:           0.90,
  stan:         0.70,
  trend_chaser: 0.05,
  critic:       0.00,
};

const DEFAULT_IMPRINT: Record<ImprintKey, number> = {
  legacy: 0.0,
  scandal: 0.0,
  comeback: 0.0,
  nostalgia: 0.0,
};

function safeRecord<T extends string>(value: unknown, defaults: Record<T, number>): Record<T, number> {
  const output = { ...defaults };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const key of Object.keys(defaults) as T[]) {
    const rawValue = (value as Record<string, unknown>)[key];
    const numericValue = rawValue == null ? defaults[key] : Number(rawValue);
    output[key] = clamp(Number.isFinite(numericValue) ? numericValue : defaults[key], 0, 1);
  }
  return output;
}

function computeSuperfansShare(segments: Record<FandomSegmentKey, number>, loyalty: Record<FandomSegmentKey, number>): number {
  const avgLoyalty = (loyalty.casual + loyalty.core + loyalty.og + loyalty.stan + loyalty.trend_chaser) / 5;
  // OGs + stans are superfans; OGs count fully, stans at 0.5
  const base = segments.og + (segments.stan * 0.5);
  const bonus = avgLoyalty > 0.45 ? 0.02 : 0;
  return clamp(base + bonus, 0, 0.20);
}

export function ensureFandomPhase6State(artistId: string, existingState: Partial<FandomPhase6State> | null): FandomPhase6State {
  const fanSegments = safeRecord(existingState?.fan_segments, DEFAULT_SEGMENTS);
  const loyalty = safeRecord(existingState?.loyalty, DEFAULT_LOYALTY);
  const imprint = safeRecord(existingState?.imprint, DEFAULT_IMPRINT);

  return {
    artist_id: artistId,
    fan_segments: fanSegments,
    loyalty,
    heat: clamp(Number(existingState?.heat) || 0.3, 0, 1),
    fatigue: clamp(Number(existingState?.fatigue) || 0, 0, 1),
    imprint,
    superfans_share: computeSuperfansShare(fanSegments, loyalty),
    updated_at: existingState?.updated_at,
    // Pass through optional Phase 6 fields — these were previously dropped,
    // causing region_bias, release_cadence, inactivity_turns, and
    // consecutive_high_fatigue_turns to never be persisted back to DB.
    region_bias: existingState?.region_bias,
    release_cadence: normalizeReleaseCadence(existingState?.release_cadence),
    inactivity_turns: existingState?.inactivity_turns,
    consecutive_high_fatigue_turns: existingState?.consecutive_high_fatigue_turns,
  };
}

export function computeSegmentChurnMultiplier(
  state: FandomPhase6State,
  trendName: string | null | undefined,
  sentimentEffective100: number,
): number {
  const effectiveSentiment = sentimentEffective100 <= 0 ? 50 : sentimentEffective100;
  const sentimentDelta = (50 - clamp(effectiveSentiment, 0, 100)) / 50;
  const defendersAndStans = state.fan_segments.stan + state.fan_segments.og;
  const trendRiders = state.fan_segments.trend_chaser;
  const trendBias = /viral|sensation/i.test(String(trendName || '')) ? 0.06 : 0;
  const baseSentimentImpact = sentimentDelta * (0.28 + state.heat * 0.16);
  const softening = defendersAndStans * 0.22;
  const volatilityAmplifier = trendRiders * 0.55;
  const fatiguePenalty = state.fatigue * 0.25;
  const memoryProtection = ((state.imprint.legacy + state.imprint.nostalgia) * 0.10);
  const scandalPenalty = state.imprint.scandal * 0.18;

  const multiplier = 1
    + baseSentimentImpact
    - softening
    + volatilityAmplifier
    + fatiguePenalty
    - memoryProtection
    + scandalPenalty
    + trendBias;

  return clamp(multiplier, 0.5, 1.8);
}

export function computeDiscoveryQualityMultiplier(state: FandomPhase6State): number {
  const avgLoyalty = (state.loyalty.casual + state.loyalty.core + state.loyalty.og + state.loyalty.stan + state.loyalty.trend_chaser) / 5;
  const loyaltyLift = (avgLoyalty - 0.2) * 0.08;
  const fatiguePenalty = state.fatigue * 0.10;
  const heatVolatility = (state.heat - 0.3) * 0.04;
  return clamp(1 + loyaltyLift - fatiguePenalty + heatVolatility, 0.85, 1.15);
}

export function computeVolatilityDelta(state: FandomPhase6State, sentimentRaw100: number): { deltaHeat: number; deltaFatigue: number } {
  const effectiveSentiment = sentimentRaw100 <= 0 ? 50 : sentimentRaw100;
  const swing = Math.abs(clamp(effectiveSentiment, 0, 100) - 50) / 50;

  // Heat delta with soft cap at 0.85
  let deltaHeat = clamp((swing - 0.2) * 0.18, -0.06, 0.10); // Reduced cap from 0.12 to 0.10
  // Apply dampening when heat is very high
  if (state.heat > 0.85) {
    deltaHeat -= (state.heat - 0.85) * 0.25;
  }

  // Fatigue delta with rebalanced rates
  let deltaFatigue = 0;
  if (state.heat > 0.7 || swing > 0.65) deltaFatigue += 0.04; // Reduced from 0.05
  if (state.heat > 0.85) deltaFatigue += 0.02; // Reduced from 0.03
  if (state.heat < 0.3 && swing < 0.2) deltaFatigue -= 0.04;
  deltaFatigue -= 0.02; // Base decay

  // Fatigue-level decay: extra recovery when fatigue is high
  if (state.fatigue > 0.7) {
    deltaFatigue -= (state.fatigue - 0.7) * 0.15;
  }
  // Force strong recovery when fatigue is critical (>0.9)
  if (state.fatigue > 0.9) {
    deltaFatigue = Math.min(deltaFatigue, -0.06);
  }

  return {
    deltaHeat: clamp(deltaHeat, -0.08, 0.10),
    deltaFatigue: clamp(deltaFatigue, -0.10, 0.06), // Expanded decay range, reduced gain cap
  };
}

export function applyImprintFromEvents(
  state: FandomPhase6State,
  trendName: string | null | undefined,
  didScandal: boolean,
): Record<ImprintKey, number> {
  const trend = String(trendName || '').toUpperCase();
  const next = { ...state.imprint };

  if (trend.includes('GOAT') || trend.includes('LEGACY')) next.legacy = clamp(next.legacy + 0.02, 0, 1);
  if (trend.includes('COMEBACK')) next.comeback = clamp(next.comeback + 0.03, 0, 1);
  if (didScandal) next.scandal = clamp(next.scandal + 0.04, 0, 1);
  if (next.legacy > 0.4 || trend.includes('NOSTALGIA')) next.nostalgia = clamp(next.nostalgia + 0.015, 0, 1);

  return next;
}

export function seedRng(artistId: string, globalTurnId: number): () => number {
  let hash = 2166136261;
  const seedText = `${artistId}:${globalTurnId}`;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getEraKey(ctx: any, artistProfile: any, releaseOrProject: any): string | null {
  try {
    const activeEra = ctx?.activeEra;
    if (activeEra?.era_name) return `${activeEra.era_name}:${activeEra.start_turn}`;
    if (activeEra?.id) return activeEra.id;

    const metadata = releaseOrProject?.metadata || {};
    if (metadata.era_name) return metadata.era_name;
    if (metadata.era_id) return metadata.era_id;

    if (artistProfile?.active_era_id) return artistProfile.active_era_id;
  } catch (_) {
  }
  return null;
}

export async function getReleasesThisTurn(ctx: any, artistId: string, entities: any, globalTurnId: number): Promise<Array<{
  kind: "single" | "ep" | "album" | "other";
  turnId?: number;
  releaseId: string;
  projectId?: string | null;
  isRolloutSingle: boolean;
  eraKey: string | null;
}>> {
  const releases: Array<{
    kind: "single" | "ep" | "album" | "other";
    turnId?: number;
    releaseId: string;
    projectId?: string | null;
    isRolloutSingle: boolean;
    eraKey: string | null;
  }> = [];

  try {
    const cadenceWindowStart = Math.max(0, globalTurnId - SATURATION_TUNING.WINDOW_SIZE_TURNS);
    const allArtistReleases = await entities.Release.filter({
      artist_id: artistId,
    });
    const releasesThisTurn = (allArtistReleases || []).filter((release: any) => {
      const scheduledTurn = Number(release?.scheduled_turn) || 0;
      return scheduledTurn >= cadenceWindowStart && scheduledTurn <= globalTurnId;
    });

    // Also check for immediate releases created as Hot
    const immediateReleases = await entities.Release.filter({
      artist_id: artistId,
      created_at: (new Date()).toISOString().split('T')[0], // Today
      lifecycle_state: 'Hot'
    });

    const dedupedReleases = new Map<string, any>();
    for (const release of [...releasesThisTurn, ...immediateReleases]) {
      if (release?.id) dedupedReleases.set(String(release.id), release);
    }
    const allReleases = Array.from(dedupedReleases.values());
    const artistProfile = await entities.ArtistProfile.findOne({ id: artistId });

    for (const release of allReleases) {
      // Determine kind
      let kind: "single" | "ep" | "album" | "other" = "other";
      const releaseType = (release.kind || release.project_type || '').toLowerCase();
      if (releaseType.includes('single')) kind = "single";
      else if (releaseType.includes('ep')) kind = "ep";
      else if (releaseType.includes('album')) kind = "album";

      // Determine if rollout single (linked to EP/album project)
      let isRolloutSingle = false;
      if (kind === "single" && release.project_id) {
        const project = await entities.Project.findOne({ id: release.project_id });
        if (project && (project.type === 'EP' || project.type === 'Album')) {
          isRolloutSingle = true;
        }
      }

      // Get era key
      const eraKey = getEraKey(ctx, artistProfile, release);

      releases.push({
        kind,
        turnId: Number(release.scheduled_turn) || globalTurnId,
        releaseId: release.id,
        projectId: release.project_id || null,
        isRolloutSingle,
        eraKey
      });
    }
  } catch (e) {
    console.error(`[ReleaseSaturation] Failed to get releases for ${artistId}:`, e);
  }

  return releases;
}

export function computeReleaseSaturationDelta(
  state: FandomPhase6State,
  releasesThisTurn: Array<{
    kind: "single" | "ep" | "album" | "other";
    turnId?: number;
    releaseId: string;
    projectId?: string | null;
    isRolloutSingle: boolean;
    eraKey: string | null;
  }>,
  globalTurnId: number
): { deltaFatigueFromSaturation: number; debug: any } {
  const debug: any = {};

  try {
    const cadence = normalizeReleaseCadence(state.release_cadence);
    const windowSize = cadence.window_size_turns;

    // Build window list (existing recent + current releases)
    const windowList = [...cadence.recent];

    // Add current releases (de-duplicate by releaseId)
    const existingReleaseIds = new Set(windowList.map(r => r.releaseId).filter(Boolean));
    for (const release of releasesThisTurn) {
      if (!existingReleaseIds.has(release.releaseId)) {
        windowList.push({
          turnId: release.turnId || globalTurnId,
          kind: release.kind,
          projectId: release.projectId,
          releaseId: release.releaseId,
          eraKey: release.eraKey,
          isRolloutSingle: release.isRolloutSingle
        });
        existingReleaseIds.add(release.releaseId);
      }
    }

    // Trim to window
    const cutoffTurn = globalTurnId - cadence.window_size_turns;
    const filteredWindow = windowList.filter(r => r.turnId >= cutoffTurn);

    debug.windowSize = windowSize;
    debug.windowListLength = filteredWindow.length;
    debug.cutoffTurn = cutoffTurn;

    // Calculate signals
    const totalReleasesInWindow = filteredWindow.length;
    const singlesInWindow = filteredWindow.filter(r => r.kind === "single").length;
    const bigProjectsInWindow = filteredWindow.filter(r => r.kind === "ep" || r.kind === "album").length;
    const unrelatedReleaseCount = filteredWindow.filter(r => !r.isRolloutSingle && (r.kind === "single" || r.kind === "ep" || r.kind === "album")).length;

    const distinctEraKeys = new Set(filteredWindow.map(r => r.eraKey).filter(Boolean));
    const distinctEraKeysInWindow = distinctEraKeys.size;

    debug.totalReleases = totalReleasesInWindow;
    debug.singles = singlesInWindow;
    debug.bigProjects = bigProjectsInWindow;
    debug.unrelated = unrelatedReleaseCount;
    debug.distinctEras = distinctEraKeysInWindow;

    // Coherence score
    let coherenceScore = 1.0;
    if (distinctEraKeysInWindow <= 1) coherenceScore = 1.0;
    else if (distinctEraKeysInWindow === 2) coherenceScore = 0.7;
    else coherenceScore = 0.4;

    debug.coherenceScore = coherenceScore;

    // Baseline allowance and penalty calculation
    let base = 0;
    const excess = Math.max(0, totalReleasesInWindow - 2);
    let penalty = excess * 0.03;

    debug.excess = excess;
    debug.basePenalty = penalty;

    // Rollout relief
    if (bigProjectsInWindow >= 1 && singlesInWindow >= 2) {
      const rolloutSingles = filteredWindow.filter(r => r.isRolloutSingle).length;
      if (rolloutSingles >= 2) {
        penalty -= 0.03;
        debug.rolloutRelief = -0.03;
      }
    }

    // Unrelated penalty
    const unrelatedPenalty = unrelatedReleaseCount * 0.02;
    penalty += unrelatedPenalty;
    debug.unrelatedPenalty = unrelatedPenalty;

    // Era switching penalty
    if (distinctEraKeysInWindow >= 2) {
      penalty += 0.02;
      debug.eraPenalty1 = 0.02;
    }
    if (distinctEraKeysInWindow >= 3) {
      penalty += 0.03;
      debug.eraPenalty2 = 0.03;
    }

    // Coherence scaling
    penalty *= (1.0 + (1.0 - coherenceScore));
    debug.coherenceScaling = (1.0 + (1.0 - coherenceScore));

    // Clamp
    const deltaFatigueFromSaturation = clamp(penalty, 0.0, 0.12);
    debug.finalPenalty = deltaFatigueFromSaturation;

    return { deltaFatigueFromSaturation, debug };
  } catch (e: any) {
    console.error(`[ReleaseSaturation] Computation failed:`, e);
    return { deltaFatigueFromSaturation: 0, debug: { error: e?.message || String(e) } };
  }
}

export function updateReleaseCadenceState(
  state: FandomPhase6State,
  releasesThisTurn: Array<{
    kind: "single" | "ep" | "album" | "other";
    turnId?: number;
    releaseId: string;
    projectId?: string | null;
    isRolloutSingle: boolean;
    eraKey: string | null;
  }>,
  globalTurnId: number
): FandomPhase6State {
  const cadence = normalizeReleaseCadence(state.release_cadence);

  // De-duplicate and add new releases
  const existingReleaseIds = new Set(cadence.recent.map(r => r.releaseId).filter(Boolean));
  const newEntries = releasesThisTurn.filter(r => !existingReleaseIds.has(r.releaseId));

  const updatedRecent = [
    ...cadence.recent,
    ...newEntries.map(r => ({
      turnId: r.turnId || globalTurnId,
      kind: r.kind,
      projectId: r.projectId,
      releaseId: r.releaseId,
      eraKey: r.eraKey,
      isRolloutSingle: r.isRolloutSingle
    }))
  ];

  // Trim to window size
  const cutoffTurn = globalTurnId - cadence.window_size_turns;
  const trimmedRecent = updatedRecent.filter(r => r.turnId >= cutoffTurn);

  return {
    ...state,
    release_cadence: {
      window_size_turns: cadence.window_size_turns,
      recent: trimmedRecent.slice(-(cadence.window_size_turns + 4))
    }
  };
}

// ============================================================================
// PART 1: SUPERFANS GAMEPLAY EFFECTS
// ============================================================================

/**
 * Compute first-week stream boost from superfans
 * Cap: +8% at superfans_share = 0.20
 */
export function computeSuperfansStreamBoost(superfansShare: number): number {
  const boost = superfansShare * SUPERFANS_TUNING.STREAM_BOOST_SCALE;
  return clamp(boost, 0, SUPERFANS_TUNING.STREAM_BOOST_MAX);
}

/**
 * Compute retention boost (decay reduction) from superfans
 * Cap: -0.004 decay reduction at superfans_share = 0.20
 */
export function computeSuperfansRetentionBoost(superfansShare: number): number {
  const boost = superfansShare * SUPERFANS_TUNING.RETENTION_BOOST_SCALE;
  return clamp(boost, 0, SUPERFANS_TUNING.RETENTION_BOOST_MAX);
}

/**
 * Compute merch conversion boost from superfans
 * Cap: +10% at superfans_share = 0.20
 */
export function computeSuperfansMerchBoost(superfansShare: number): number {
  const boost = superfansShare * SUPERFANS_TUNING.MERCH_BOOST_SCALE;
  return clamp(boost, 0, SUPERFANS_TUNING.MERCH_BOOST_MAX);
}

/**
 * Compute tour turnout boost from superfans
 * Cap: +6% at superfans_share = 0.20
 */
export function computeSuperfansTourBoost(superfansShare: number): number {
  const boost = superfansShare * SUPERFANS_TUNING.TOUR_BOOST_SCALE;
  return clamp(boost, 0, SUPERFANS_TUNING.TOUR_BOOST_MAX);
}

// ============================================================================
// PART 1b: GLAMOUR & COMMUNITY GAMEPLAY EFFECTS
// ============================================================================

/**
 * Glamour vector affects social media virality and brand deal attractiveness.
 * High glamour = more viral posts, better brand deal offers.
 * Cap: +7% social virality at glamour=100, +5% brand deal value at glamour=100
 */
export function computeGlamourSocialViralityBoost(glamour: number): number {
  const normalized = clamp(glamour, 0, 100) / 100;
  return clamp(normalized * 0.07, 0, 0.07);
}

export function computeGlamourBrandDealBoost(glamour: number): number {
  const normalized = clamp(glamour, 0, 100) / 100;
  return clamp(normalized * 0.05, 0, 0.05);
}

/**
 * Community vector affects fan retention and discovery/organic growth.
 * High community = lower churn, better organic follower growth.
 * Cap: -4% churn at community=100, +6% organic growth at community=100
 */
export function computeCommunityChurnReduction(community: number): number {
  const normalized = clamp(community, 0, 100) / 100;
  return clamp(normalized * 0.04, 0, 0.04);
}

export function computeCommunityOrganicGrowthBoost(community: number): number {
  const normalized = clamp(community, 0, 100) / 100;
  return clamp(normalized * 0.06, 0, 0.06);
}

// ============================================================================
// PART 1c: FANDOM FATIGUE SOFT STATE (DISCRETE TRIGGER)
// ============================================================================

/**
 * Track consecutive turns where fatigue >= 0.75.
 * When streak hits 2+, flag FANDOM_FATIGUE_EVENT with gameplay penalty:
 *   - Fan action strength reduced by 15%
 *   - Social media engagement reduced by 10%
 *   - Brand deal quality reduced by 5%
 * Streak resets when fatigue drops below 0.75.
 */
export function computeFatigueSoftState(
  currentFatigue: number,
  previousConsecutiveHighFatigueTurns: number,
): {
  consecutiveHighFatigueTurns: number;
  isFatigueEvent: boolean;
  fatiguePenalty: {
    actionStrengthMult: number;
    socialEngagementMult: number;
    brandDealQualityMult: number;
  };
} {
  const isHighFatigue = currentFatigue >= 0.75;
  const consecutiveHighFatigueTurns = isHighFatigue
    ? previousConsecutiveHighFatigueTurns + 1
    : 0;

  const isFatigueEvent = consecutiveHighFatigueTurns >= 2;

  const fatiguePenalty = isFatigueEvent
    ? {
        actionStrengthMult: 0.85,
        socialEngagementMult: 0.90,
        brandDealQualityMult: 0.95,
      }
    : {
        actionStrengthMult: 1.0,
        socialEngagementMult: 1.0,
        brandDealQualityMult: 1.0,
      };

  return { consecutiveHighFatigueTurns, isFatigueEvent, fatiguePenalty };
}

// ============================================================================
// PART 2: REGIONAL FANDOM IDENTITY
// ============================================================================

const REGION_KEYS: RegionKey[] = ['United States', 'Canada', 'UK', 'Europe', 'Asia', 'Africa', 'Oceania', 'Latin America'];

/**
 * Initialize or update region bias map deterministically
 */
export function updateRegionBias(
  state: FandomPhase6State,
  artistId: string,
  globalTurnId: number,
  sentimentEffective100: number,
  /** Optional: average scene reputation per region (0-100). Boosts loyalty bias in regions with strong rep. */
  sceneRepByRegion?: Record<string, number>,
  genreMatchByRegion?: Record<string, number>,
): Record<string, { loyaltyBias: number; volatilityBias: number; brandSafetyBias: number }> {
  const existingBias = state.region_bias || {};
  const random = seedRng(artistId, globalTurnId);
  const sentimentBand = sentimentEffective100 < 35 ? -1 : sentimentEffective100 > 65 ? 1 : 0;

  const updated: Record<string, { loyaltyBias: number; volatilityBias: number; brandSafetyBias: number }> = {};

  for (const region of REGION_KEYS) {
    const existing = existingBias[region] || {
      loyaltyBias: (random() - 0.5) * 0.04,
      volatilityBias: (random() - 0.5) * 0.04,
      brandSafetyBias: (random() - 0.5) * 0.04,
    };

    // Nudge biases based on sentiment
    const loyaltyNudge = sentimentBand * REGIONAL_TUNING.SENTIMENT_NUDGE_STRENGTH;
    const volatilityNudge = (sentimentEffective100 > 70 || sentimentEffective100 < 30) ? REGIONAL_TUNING.SENTIMENT_NUDGE_STRENGTH : -REGIONAL_TUNING.SENTIMENT_NUDGE_STRENGTH;
    const brandSafetyNudge = sentimentBand * REGIONAL_TUNING.SENTIMENT_NUDGE_STRENGTH * 0.5;

    // Scene reputation nudge: high rep in a region boosts loyalty, reduces volatility
    const sceneRep = sceneRepByRegion?.[region] ?? 0;
    const sceneNudge = sceneRep > 20 ? (sceneRep / 100) * REGIONAL_TUNING.SENTIMENT_NUDGE_STRENGTH * 0.5 : 0;
    const genreMatch = genreMatchByRegion?.[region] ?? 0;
    const genreNudge = genreMatch > 0
      ? clamp((genreMatch / 100) * 0.05, 0, 0.05)
      : 0;

    updated[region] = {
      loyaltyBias: clamp(existing.loyaltyBias + loyaltyNudge + sceneNudge + genreNudge, REGIONAL_TUNING.LOYALTY_BIAS_MIN, REGIONAL_TUNING.LOYALTY_BIAS_MAX),
      volatilityBias: clamp(existing.volatilityBias + volatilityNudge - (sceneNudge * 0.3), REGIONAL_TUNING.VOLATILITY_BIAS_MIN, REGIONAL_TUNING.VOLATILITY_BIAS_MAX),
      brandSafetyBias: clamp(existing.brandSafetyBias + brandSafetyNudge, REGIONAL_TUNING.BRAND_SAFETY_BIAS_MIN, REGIONAL_TUNING.BRAND_SAFETY_BIAS_MAX),
    };
  }

  return updated;
}

// ============================================================================
// PART 3: SEGMENT FRACTION DERIVATION (Unified Source of Truth)
// fandomSegmentsEngine.ts owns integer drift; this derives fractional shares.
// ============================================================================

/**
 * Derive fractional segment shares and loyalty from fandom_segments integer counts.
 * This is the UNIFIED source of truth: the fandomSegmentsEngine (order 4.5) owns
 * integer drift, and this function projects those counts into the fractional [0-1]
 * shares used by all Phase 6 multipliers (churn, discovery, superfans, etc.).
 *
 * When all counts are 0 (fresh player, no turns processed yet), falls back to
 * DEFAULT_SEGMENTS / DEFAULT_LOYALTY so multipliers still have sane defaults.
 *
 * @param segmentRows - rows from fandom_segments table for one player
 */
export function deriveSegmentFractionsFromCounts(
  segmentRows: Array<{ segment_type: string; count: number; loyalty: number }> | null
): { fan_segments: Record<FandomSegmentKey, number>; loyalty: Record<FandomSegmentKey, number> } {
  const KEYS: FandomSegmentKey[] = ['casual', 'core', 'og', 'stan', 'trend_chaser', 'critic'];

  // Build map from rows
  const countMap: Record<string, number> = {};
  const loyaltyMap: Record<string, number> = {};
  for (const row of segmentRows || []) {
    countMap[row.segment_type] = Number(row.count) || 0;
    loyaltyMap[row.segment_type] = Number(row.loyalty) || 0;
  }

  const totalCount = KEYS.reduce((sum, k) => sum + (countMap[k] || 0), 0);

  if (totalCount <= 0) {
    // No segment counts yet — use defaults
    return { fan_segments: { ...DEFAULT_SEGMENTS }, loyalty: { ...DEFAULT_LOYALTY } };
  }

  // Derive fractional shares from integer counts
  const fan_segments: Record<FandomSegmentKey, number> = {} as any;
  const loyalty: Record<FandomSegmentKey, number> = {} as any;
  for (const k of KEYS) {
    fan_segments[k] = clamp((countMap[k] || 0) / totalCount, 0, 1);
    // Scale loyalty from 0-100 integer to 0-1 fractional
    loyalty[k] = clamp((loyaltyMap[k] || 0) / 100, 0, 1);
  }

  return { fan_segments, loyalty };
}

// ============================================================================
// PART 4: DEEPER FAN MEMORY
// ============================================================================

/**
 * Compute nostalgia effects during inactivity
 */
export function computeNostalgiaEffects(
  state: FandomPhase6State,
  inactivityTurns: number
): {
  churnReduction: number;
  discoveryBoost: number;
  nostalgiaDelta: number;
} {
  const isInactive = inactivityTurns >= MEMORY_TUNING.INACTIVITY_THRESHOLD_TURNS;
  const hasLegacy = state.imprint.legacy >= MEMORY_TUNING.NOSTALGIA_LEGACY_THRESHOLD;
  
  if (!isInactive || !hasLegacy) {
    return { churnReduction: 0, discoveryBoost: 0, nostalgiaDelta: 0 };
  }
  
  const nostalgiaDelta = MEMORY_TUNING.NOSTALGIA_GROWTH_RATE;
  const nostalgiaLevel = state.imprint.nostalgia;
  
  const churnReduction = clamp(
    nostalgiaLevel * MEMORY_TUNING.NOSTALGIA_CHURN_REDUCTION_MAX,
    0,
    MEMORY_TUNING.NOSTALGIA_CHURN_REDUCTION_MAX
  );
  
  const discoveryBoost = clamp(
    nostalgiaLevel * MEMORY_TUNING.NOSTALGIA_DISCOVERY_BOOST_MAX,
    0,
    MEMORY_TUNING.NOSTALGIA_DISCOVERY_BOOST_MAX
  );
  
  return { churnReduction, discoveryBoost, nostalgiaDelta };
}

/**
 * Compute scandal recovery rate based on scandal level and sentiment stability
 */
export function computeScandalRecovery(
  state: FandomPhase6State,
  sentimentEffective100: number
): number {
  const scandalLevel = state.imprint.scandal;
  if (scandalLevel <= 0) return 0;
  
  const isStable = sentimentEffective100 >= MEMORY_TUNING.STABLE_SENTIMENT_MIN 
    && sentimentEffective100 <= MEMORY_TUNING.STABLE_SENTIMENT_MAX;
  
  if (!isStable) return 0;
  
  const isHighScandal = scandalLevel >= MEMORY_TUNING.SCANDAL_HIGH_THRESHOLD;
  const recoveryRate = isHighScandal 
    ? MEMORY_TUNING.SCANDAL_RECOVERY_RATE_SLOW 
    : MEMORY_TUNING.SCANDAL_RECOVERY_RATE_NORMAL;
  
  return -recoveryRate; // Negative to reduce scandal
}

// ============================================================================
// PART 5: CROSS-SYSTEM HOOKS
// ============================================================================

// --- Era fatigue & legacy system (cross-system with turnProcessorEra) ---

const N = (v: any): number => Number(v) || 0;

/**
 * Calculate era fatigue decay factor.
 * After fatigueOnset turns, multipliers decay by 2% per turn, flooring at 0.5.
 * @param fatigueTurns — total turns the era has been active
 * @param fatigueOnset — turns before decay kicks in (default 15)
 */
export function eraFatigueDecay(fatigueTurns: number, fatigueOnset: number = 15): number {
  if (fatigueTurns <= fatigueOnset) return 1.0;
  return Math.max(0.5, 1.0 - (fatigueTurns - fatigueOnset) * 0.02);
}

/**
 * Calculate legacy bonuses when an era completes.
 * Now driven by fandom_memory_score (0-100) — a composite of streams, fans, revenue,
 * peak hype, releases, tours, and iconic releases.
 * Unlockable tiers: nostalgic (30+), iconic (60+), legendary (80+).
 */
export function calculateLegacyBonuses(era: any): any {
  const memoryScore = N(era.fandom_memory_score);
  // Keep a raw score for backward compat (used in UI + notification)
  const score = memoryScore * 10; // 0-1000 range from 0-100 memory score
  const bonuses: any = { score, memory_score: memoryScore, unlocked: [] };
  if (memoryScore >= 30) bonuses.unlocked.push({ type: 'nostalgic_era', effect: 'engagement_boost', value: 0.10, label: '+10% engagement on throwback content' });
  if (memoryScore >= 60) bonuses.unlocked.push({ type: 'iconic_era', effect: 'follower_growth', value: 0.05, label: '+5% permanent follower growth' });
  if (memoryScore >= 80) bonuses.unlocked.push({ type: 'legendary_era', effect: 'streaming_mult', value: 0.10, duration_turns: 30, label: '+10% streaming for 30 turns' });
  return bonuses;
}

/**
 * Get active legacy buffs from all completed eras for a player.
 * Scans completed eras' legacy_bonuses.unlocked and aggregates multiplier boosts.
 * Time-limited bonuses (e.g. streaming_mult) expire after duration_turns from end_turn.
 */
export async function getLegacyBuffs(
  entities: any,
  playerId: string,
  currentTurnId: number
): Promise<{ followerGrowthMult: number; streamingMult: number; engagementMult: number }> {
  let followerGrowthMult = 1.0;
  let streamingMult = 1.0;
  let engagementMult = 1.0;
  try {
    const completedEras = await entities.Era.filter({ artist_id: playerId, is_active: false });
    for (const era of completedEras) {
      if (!era.legacy_bonuses?.unlocked) continue;
      for (const bonus of era.legacy_bonuses.unlocked) {
        if (bonus.effect === 'follower_growth') followerGrowthMult += bonus.value;
        if (bonus.effect === 'streaming_mult') {
          const endTurn = N(era.end_turn) + (bonus.duration_turns || 30);
          if (currentTurnId <= endTurn) streamingMult += bonus.value;
        }
        if (bonus.effect === 'engagement_boost') engagementMult += bonus.value;
      }
    }
  } catch (e: any) {
    console.error(`[fandomPhase6:getLegacyBuffs] Error loading legacy buffs for ${playerId}:`, e?.message || e);
  }
  return { followerGrowthMult, streamingMult, engagementMult };
}

// --- Platform modifiers ---

/**
 * Compute platform spike modifier from heat
 */
export function computePlatformSpikeModifier(heat: number): number {
  if (heat < CROSS_SYSTEM_TUNING.HEAT_SPIKE_THRESHOLD) return 0;
  const excess = heat - CROSS_SYSTEM_TUNING.HEAT_SPIKE_THRESHOLD;
  return clamp(excess * 0.15, 0, CROSS_SYSTEM_TUNING.HEAT_SPIKE_MODIFIER_MAX);
}

/**
 * Compute platform sustain penalty from fatigue
 */
export function computePlatformSustainPenalty(fatigue: number): number {
  if (fatigue < CROSS_SYSTEM_TUNING.FATIGUE_SUSTAIN_THRESHOLD) return 0;
  const excess = fatigue - CROSS_SYSTEM_TUNING.FATIGUE_SUSTAIN_THRESHOLD;
  return clamp(excess * 0.12, 0, CROSS_SYSTEM_TUNING.FATIGUE_SUSTAIN_PENALTY_MAX);
}

/**
 * Compute brand deal quality modifier from loyalty, scandal, and region bias
 */
export function computeBrandQualityModifier(
  state: FandomPhase6State,
  regionKey?: string
): number {
  // critic excluded from quality multiplier (negative segment)
  const avgLoyalty = (state.loyalty.casual + state.loyalty.core + state.loyalty.og + state.loyalty.stan + state.loyalty.trend_chaser) / 5;
  const loyaltyBoost = clamp(
    (avgLoyalty - 0.25) * 0.24,
    0,
    CROSS_SYSTEM_TUNING.LOYALTY_BRAND_BOOST_MAX
  );
  
  const scandalPenalty = clamp(
    state.imprint.scandal * CROSS_SYSTEM_TUNING.SCANDAL_BRAND_PENALTY_MAX,
    0,
    CROSS_SYSTEM_TUNING.SCANDAL_BRAND_PENALTY_MAX
  );
  
  let regionBiasEffect = 0;
  if (regionKey && state.region_bias?.[regionKey]) {
    regionBiasEffect = state.region_bias[regionKey].brandSafetyBias * CROSS_SYSTEM_TUNING.BRAND_SAFETY_BIAS_SCALE;
  }
  
  return loyaltyBoost - scandalPenalty + regionBiasEffect;
}
