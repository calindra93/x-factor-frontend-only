/**
 * @deprecated v1 Legacy Chart Module — DO NOT USE in new code
 *
 * This module has been superseded by chartsModule.ts (v2) for chart persistence.
 * Certification logic has been extracted to certificationModule.ts.
 *
 * Removed from turn engine in Plan 049. Kept for audit trail.
 * File will be deleted in a future cleanup pass.
 */
import { getChartEligibility } from './releaseCanonicalAttribution.ts';
import { getIdentityTrait } from './constants/identityTraits.ts';
import {
  selectCanonicalFandomSignals,
  type CanonicalFandomSignals,
} from './fandomCanonicalSelectors.ts';

/**
 * CHART UPDATE MODULE — Billboard-style chart system
 * Runs every turn after core processing.
 * Generates: Hot 100, Top Streaming, Regional, Genre charts + Certifications.
 * All processing is deterministic — no LLM calls.
 */

// Certification thresholds - Updated to match real RIAA standards
// Based on RIAA: 150 streams = 1 unit, Gold = 500K units, Platinum = 1M units, Diamond = 10M units
// Real RIAA standards applied directly for authentic industry experience
const CERTIFICATION_THRESHOLDS = [
  { level: 'Diamond', streams: 1_500_000_000, detail: 'Diamond' },        // 1.5B streams (10M units)
  { level: 'Multi-Platinum', streams: 900_000_000, detail: '6x Platinum' },  // 900M (6M units)
  { level: 'Multi-Platinum', streams: 600_000_000, detail: '4x Platinum' },  // 600M (4M units)
  { level: 'Multi-Platinum', streams: 300_000_000, detail: '2x Platinum' },  // 300M (2M units)
  { level: 'Platinum', streams: 150_000_000, detail: 'Platinum' },       // 150M streams (1M units)
  { level: 'Gold', streams: 75_000_000, detail: 'Gold' },                // 75M streams (500K units)
];

interface ChartEntry {
  release_id: string;
  artist_id: string;
  score: number;
  lifetime_streams: number;
  region?: string;
  genre?: string;
  lifecycle_state?: string;
}

interface ChartRecord {
  id: string;
  release_id: string;
  artist_id: string;
  chart_type: string;
  region?: string;
  genre?: string;
  current_position: number;
  previous_position?: number;
  peak_position: number;
  weeks_on_chart: number;
  turn_entered: number;
  turn_last_updated: number;
  chart_momentum: string;
  chart_score: number;
}

// ---------------------------------------------------------------------------
// CONTROLLED VARIANCE HELPERS
// ---------------------------------------------------------------------------

/**
 * Deterministic uint32 hash of a string (djb2 variant).
 * Used to seed the PRNG so variance is reproducible given same inputs.
 */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * Mulberry32 PRNG — fast, deterministic, no external deps.
 * Returns a float in [0, 1).
 */
export function mulberry32(seed: number): number {
  let t = (seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Seeded random float in [min, max].
 * Seed is derived from player_id + release_id + global_turn_id for determinism.
 */
export function seededRandom(playerId: string, releaseId: string, turnId: number, min: number, max: number): number {
  const seed = hashString(`${playerId}:${releaseId}:${turnId}`);
  const r = mulberry32(seed); // [0, 1)
  return min + r * (max - min);
}

/**
 * Compute canonical fandom influence modifier for the current legacy chart-scoring inputs.
 * Returns an additive multiplier delta (e.g. +0.05 means score × 1.05).
 * Also returns the adjusted variance magnitude multiplier.
 *
 * This replaces the old legacy fan-profile influence modifier with canonical selector output.
 *
 * All effects are bounded; total influence clamped to [-0.15, +0.15].
 */
export function computeCanonicalFandomInfluence(
  canonicalSignals: CanonicalFandomSignals,
  weeksOnChart: number,       // 0 if new entry
  isDebut: boolean,           // true if this is the release's first chart turn
  isRegionalOnly: boolean     // true when scoring for regional chart
): { influence: number; varianceMult: number } {
  const loyalBaseShare = Number(canonicalSignals.loyalBaseShare) || 0;
  const superfanPressure = Number(canonicalSignals.superfanPressure) || 0;
  const trendAmplification = Number(canonicalSignals.trendAmplification) || 0;
  const criticDrag = Number(canonicalSignals.criticDrag) || 0;
  const audienceDepth = Number(canonicalSignals.audienceDepth) || 0;
  const fanMorale = Math.max(0, Math.min(1, (Number(canonicalSignals.fanMorale) || 0) / 100));
  const toxicityPressure = Number(canonicalSignals.toxicityPressure) || 0;

  let influence = 0;
  let varianceMult = 1.0;

  if (loyalBaseShare >= 0.20) {
    influence    += 0.03;                          // floor stability
    varianceMult *= (1 - loyalBaseShare * 0.30);
  }

  if (superfanPressure >= 0.18) {
    influence    += 0.02;
    varianceMult *= (1 - superfanPressure * 0.20);
  }

  if (trendAmplification >= 0.15) {
    if (isDebut) {
      influence += Math.min(0.08, trendAmplification * 0.16);
    } else if (weeksOnChart >= 2 && weeksOnChart <= 4) {
      influence -= Math.min(0.03, trendAmplification * 0.08);
    }
    varianceMult *= (1 + trendAmplification * 0.25);
  }

  if (criticDrag >= 0.12) {
    const climbBonus = Math.min(0.06, weeksOnChart * 0.02);
    influence    += climbBonus;
    influence    -= Math.min(0.02, criticDrag * 0.06);
    varianceMult *= Math.max(0.80, 1 - criticDrag * 0.15);
  }

  if (isRegionalOnly && loyalBaseShare > 0) {
    influence += Math.min(0.05, loyalBaseShare * 0.08);
  }

  influence += (audienceDepth - 0.5) * 0.06;
  influence += (fanMorale - 0.5) * 0.04;
  influence -= toxicityPressure * 0.03;

  // Clamp total influence to [-0.15, +0.15]
  influence = Math.max(-0.15, Math.min(0.15, influence));
  // Clamp varianceMult to [0.50, 1.50] to prevent extremes
  varianceMult = Math.max(0.50, Math.min(1.50, varianceMult));

  return { influence, varianceMult };
}

/**
 * Compute momentum bonus from chart history and era/decline data.
 * Returns an additive multiplier delta.
 */
export function computeMomentumBonus(
  existingChartEntry: ChartRecord | null,
  globalTurnId: number,
  isFlop: boolean,
  consecutiveDeclineTurns: number
): number {
  let bonus = 0;

  // Positive momentum: charted for 2+ consecutive turns
  if (existingChartEntry) {
    const lastUpdated = existingChartEntry.turn_last_updated || 0;
    const wasRecentlyUpdated = (globalTurnId - lastUpdated) <= 2;
    if (wasRecentlyUpdated && existingChartEntry.weeks_on_chart >= 2) {
      const weeks = existingChartEntry.weeks_on_chart;
      bonus += 0.05 + Math.min(1, weeks / 20) * 0.05; // +0.05 to +0.10
    }
  }

  // Flop penalty
  if (isFlop) {
    bonus -= 0.07;
  }

  // Decline penalty (stacks with flop, total capped at -0.10)
  if (consecutiveDeclineTurns >= 2) {
    bonus -= 0.05;
  }

  // Cap combined penalty
  return Math.max(-0.10, Math.min(0.10, bonus));
}

/**
 * Apply chaos guardrails to the final score.
 * - Never negative
 * - Never jump >35% from previous turn's chart_score
 * - Never swing >±20% from previous turn's chart_score
 */
export function applyVarianceCaps(rawScore: number, prevChartScore: number | null): number {
  let score = Math.max(0, rawScore);

  if (prevChartScore != null && prevChartScore > 0) {
    // Cap upward jump at +35%
    const maxAllowed = prevChartScore * 1.35;
    score = Math.min(score, maxAllowed);

    // Cap per-turn swing at ±20%
    const maxSwing = prevChartScore * 0.20;
    if (score > prevChartScore + maxSwing) score = prevChartScore + maxSwing;
    if (score < prevChartScore - maxSwing) score = prevChartScore - maxSwing;

    // Still never negative after swing floor
    score = Math.max(0, score);
  }

  return score;
}


function getDominantCultureVector(fandomMemory: any): 'rebellion' | 'glamour' | 'authenticity' | 'community' | null {
  if (!fandomMemory || typeof fandomMemory !== 'object') return null;
  const vectors: Array<['rebellion' | 'glamour' | 'authenticity' | 'community', number]> = [
    ['rebellion', Number(fandomMemory.rebellion_avg) || 0],
    ['glamour', Number(fandomMemory.glamour_avg) || 0],
    ['authenticity', Number(fandomMemory.authenticity_avg) || 0],
    ['community', Number(fandomMemory.community_avg) || 0],
  ];
  vectors.sort((a, b) => b[1] - a[1]);
  return vectors[0][0];
}

/**
 * Score a release for chart ranking.
 * Factors: lifetime streams, lifecycle state, hype, clout, recency,
 *          canonical fandom influence, momentum, and bounded deterministic variance.
 */
export function scoreRelease(
  release: any,
  player: any,
  globalTurnId: number,
  canonicalSignals: CanonicalFandomSignals | null = null,
  existingChartEntry: ChartRecord | null = null,
  eraData: { is_flop?: boolean } | null = null,
  isRegionalOnly = false,
  chartPushMult = 1,
  cultureProfile: { dominantVector: string | null; rollingReadiness: number; retentionRate: number; identityPrimary?: string | null } | null = null,
  industryPerception: { narrativeHeat?: number; influenceCaps?: { chartInfluenceMult?: number } } | null = null,
  audienceQuality: { audienceDepth?: number } | null = null,
  careerTrendEffects: { chartStabilityAdj?: number } | null = null
): number {
  const streams = Number(release.lifetime_streams) || 0;
  if (streams <= 0) return 0;

  // Base score from streams (log scale so massive streams don't dominate too much)
  const streamScore = Math.log10(Math.max(1, streams)) * 100;

  // Lifecycle multiplier
  // Plan 048 §M4: Added Momentum (1.5x) to align eligibility with scoring
  const lifecycleMults: Record<string, number> = {
    Hot: 3.0,
    Trending: 2.0,
    Momentum: 1.5,
    Stable: 1.0,
    Declining: 0.5,
    Archived: 0.1,
  };
  const lifecycleMult = lifecycleMults[release.lifecycle_state] || 0.5;

  // Hype bonus (0-100 scale → 0-1.5x)
  const hype = Number(player.hype) || 0;
  const hypeMult = 1 + (hype / 100) * 0.5;

  // Clout bonus (diminishing returns)
  const clout = Number(player.clout) || 0;
  const cloutMult = 1 + Math.min(0.3, clout / 3000);

  // Recency bonus: releases from recent turns get a boost
  const releaseTurn = Number(release.scheduled_turn) || 0;
  const turnsAgo = Math.max(0, globalTurnId - releaseTurn);
  const recencyMult = turnsAgo <= 7 ? 1.5 : turnsAgo <= 30 ? 1.2 : turnsAgo <= 90 ? 1.0 : 0.8;

  // Velocity: streams per turn alive (approximation)
  const turnsAlive = Math.max(1, turnsAgo);
  const velocity = streams / turnsAlive;
  const velocityBonus = Math.log10(Math.max(1, velocity)) * 20;

  // --- BASE SCORE (unchanged formula) ---
  const baseScore = (streamScore + velocityBonus) * lifecycleMult * hypeMult * cloutMult * recencyMult;

  // --- Canonical fandom influence ---
  const weeksOnChart = existingChartEntry?.weeks_on_chart ?? 0;
  const isDebut = !existingChartEntry;
  const { influence: fandomInfluence, varianceMult } = computeCanonicalFandomInfluence(
    canonicalSignals || selectCanonicalFandomSignals(),
    weeksOnChart,
    isDebut,
    isRegionalOnly,
  );

  // --- NEW: Momentum bonus ---
  const isFlop = eraData?.is_flop ?? false;
  const declineTurns = Number(player.consecutive_decline_turns) || 0;
  const momentumBonus = computeMomentumBonus(existingChartEntry, globalTurnId, isFlop, declineTurns);

  // --- NEW: Deterministic variance ---
  const rawVariance = seededRandom(player.id, release.id, globalTurnId, -0.12, 0.12);
  let variance = rawVariance * varianceMult;

  const dominantVector = cultureProfile?.dominantVector || null;
  const rollingReadiness = Math.max(0, Math.min(100, Number(cultureProfile?.rollingReadiness) || 0));
  const retentionRate = Math.max(0, Math.min(100, Number(cultureProfile?.retentionRate) || 0));

  let cultureModifier = 1;
  if (dominantVector === 'glamour') {
    const sustainBoost = Math.min(0.1, (Math.max(0, turnsAgo - 7) / 100));
    cultureModifier *= (1 + sustainBoost);
  } else if (dominantVector === 'authenticity') {
    const earlyPenalty = turnsAgo <= 14 ? 0.05 : 0;
    const lateSustain = turnsAgo > 14 ? 0.08 : 0;
    cultureModifier *= (1 - earlyPenalty + lateSustain);
  } else if (dominantVector === 'rebellion') {
    variance = variance * 1.15;
  } else if (dominantVector === 'community') {
    const retentionBoost = Math.min(0.1, (retentionRate / 100) * 0.1);
    cultureModifier *= (1 + retentionBoost);
  }

  const identityTrait = getIdentityTrait(cultureProfile?.identityPrimary || null);
  const chartBiasMult = 1 + Math.min(0.12, identityTrait.chartBias * 0.1);
  const readinessBlendMult = 1 + Math.min(0.08, (rollingReadiness / 100) * 0.08);

  // --- Combine ---
  const narrativeChartMult = Math.max(0.85, Math.min(1.15, Number(industryPerception?.influenceCaps?.chartInfluenceMult) || 1));

  const chartDepthStabilityMult = Math.max(0.98, Math.min(1.02, 0.98 + (Math.max(0, Math.min(100, Number(audienceQuality?.audienceDepth) || 0)) / 100) * 0.04));

  const trendChartStabilityAdj = Math.max(0.98, Math.min(1.02, Number(careerTrendEffects?.chartStabilityAdj) || 1));

  const rawFinalScore = baseScore * (1 + fandomInfluence + momentumBonus + variance)
    * Math.max(1, Number(chartPushMult) || 1)
    * Math.max(0.85, Math.min(1.15, cultureModifier))
    * chartBiasMult
    * readinessBlendMult
    * narrativeChartMult
    * chartDepthStabilityMult
    * trendChartStabilityAdj;

  // --- NEW: Apply chaos guardrails ---
  const prevScore = existingChartEntry ? (existingChartEntry.chart_score ?? null) : null;
  return applyVarianceCaps(rawFinalScore, prevScore);
}

/**
 * Determine chart momentum based on position change.
 */
function determineMomentum(
  currentPos: number,
  previousPos: number | null | undefined,
  wasOnChart: boolean
): string {
  if (!wasOnChart) return 'New Entry';
  if (previousPos == null) return 'Re-Entry';
  const diff = previousPos - currentPos; // positive = rising
  if (diff >= 5) return 'Rising';
  if (diff <= -5) return 'Falling';
  return 'Steady';
}

/**
 * Build a ranked chart from scored entries.
 * Returns chart update/create payloads.
 */
function buildChart(
  entries: ChartEntry[],
  chartType: string,
  maxPositions: number,
  existingCharts: ChartRecord[],
  globalTurnId: number,
  filterRegion?: string,
  filterGenre?: string
): { updates: any[]; creates: any[]; removals: string[] } {
  // Sort by score descending
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, maxPositions);

  const updates: any[] = [];
  const creates: any[] = [];
  const removals: string[] = [];

  // Build lookup of existing chart entries for this chart type + region/genre
  const existingMap = new Map<string, ChartRecord>();
  for (const ec of existingCharts) {
    if (ec.chart_type !== chartType) continue;
    if (filterRegion && ec.region !== filterRegion) continue;
    if (filterGenre && ec.genre !== filterGenre) continue;
    if (!filterRegion && ec.region) continue;
    if (!filterGenre && ec.genre) continue;
    existingMap.set(ec.release_id, ec);
  }

  const seenReleaseIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const position = i + 1;
    seenReleaseIds.add(entry.release_id);

    const existing = existingMap.get(entry.release_id);

    if (existing) {
      const momentum = determineMomentum(position, existing.current_position, true);
      const newPeak = Math.min(existing.peak_position, position);
      const weeksOnChart = existing.weeks_on_chart + (globalTurnId - existing.turn_last_updated >= 7 ? 1 : 0);

      updates.push({
        id: existing.id,
        patch: {
          previous_position: existing.current_position,
          current_position: position,
          peak_position: newPeak,
          weeks_on_chart: Math.max(existing.weeks_on_chart, weeksOnChart),
          turn_last_updated: globalTurnId,
          chart_momentum: momentum,
          chart_score: Math.floor(entry.score),
        },
      });
    } else {
      creates.push({
        release_id: entry.release_id,
        artist_id: entry.artist_id,
        chart_type: chartType,
        region: filterRegion || null,
        genre: filterGenre || null,
        current_position: position,
        previous_position: null,
        peak_position: position,
        weeks_on_chart: 1,
        turn_entered: globalTurnId,
        turn_last_updated: globalTurnId,
        chart_momentum: 'New Entry',
        chart_score: Math.floor(entry.score),
      });
    }
  }

  // Mark entries that fell off the chart for removal
  for (const [releaseId, existing] of existingMap) {
    if (!seenReleaseIds.has(releaseId)) {
      removals.push(existing.id);
    }
  }

  return { updates, creates, removals };
}

/**
 * Check certifications for all releases.
 */
function checkCertifications(
  releases: any[],
  existingCerts: any[],
  globalTurnId: number
): any[] {
  const newCerts: any[] = [];

  // Build lookup: release_id → set of certification_level
  const certMap = new Map<string, Set<string>>();
  for (const cert of existingCerts) {
    if (!certMap.has(cert.release_id)) certMap.set(cert.release_id, new Set());
    // Use detail for multi-platinum differentiation
    certMap.get(cert.release_id)!.add(cert.certification_detail || cert.certification_level);
  }

  for (const release of releases) {
    const streams = Number(release.lifetime_streams) || 0;
    const existingSet = certMap.get(release.id) || new Set();

    for (const threshold of CERTIFICATION_THRESHOLDS) {
      if (streams >= threshold.streams && !existingSet.has(threshold.detail)) {
        newCerts.push({
          release_id: release.id,
          artist_id: release.artist_id,
          certification_level: threshold.level,
          certification_detail: threshold.detail,
          region: 'Global',
          streams_at_certification: streams,
          turn_achieved: globalTurnId,
          notified: false,
          // Include release title for notification display
          _release_title: release.title || release.name || 'Your release',
        });
        existingSet.add(threshold.detail);
      }
    }
  }

  return newCerts;
}

/**
 * Main entry point — called by turnScheduler.
 * This is a GLOBAL module, not per-player. It runs once per turn after all players.
 */
export async function processChartsForTurn(
  globalTurnId: number,
  entities: any,
  ctx: any = {}
): Promise<{ success: boolean; deltas: any }> {
  // 1. Fetch all active releases with their artist profiles
  // Plan 048 §M4: Chart eligibility now includes Momentum phase (was omitted pre-0.0.5)
  const allReleases = await entities.Release.filter({
    lifecycle_state: ['Hot', 'Trending', 'Momentum', 'Stable', 'Declining'],
  });

  if (!allReleases?.length) {
    return { success: true, deltas: { chart_updates: [], chart_creates: [], certification_creates: [] } };
  }

  // 2. Fetch all artist profiles for scoring
  const allPlayers = await entities.ArtistProfile.list();
  const playerMap = new Map<string, any>();
  for (const p of allPlayers) {
    playerMap.set(p.id, p);
  }

  const [allFanProfiles, allFandoms, allFandomSegments] = await Promise.all([
    entities.FanProfile.list(),
    entities.Fandom.list(),
    entities.FandomSegment.list(),
  ]);
  const fanProfileMap = new Map<string, { dominantVector: string | null; rollingReadiness: number; retentionRate: number }>();
  for (const fanProfile of allFanProfiles || []) {
    fanProfileMap.set(fanProfile.artist_id, {
      dominantVector: getDominantCultureVector(fanProfile.fandom_memory),
      rollingReadiness: Number(fanProfile.fandom_memory?.rolling_readiness_avg) || 0,
      retentionRate: Number(fanProfile.retention_rate) || 0,
    });
  }

  const fandomMap = new Map<string, any>();
  for (const fandomRow of allFandoms || []) {
    fandomMap.set(fandomRow.player_id, fandomRow);
  }

  const fandomSegmentsByPlayer = new Map<string, any[]>();
  for (const segmentRow of allFandomSegments || []) {
    const existingRows = fandomSegmentsByPlayer.get(segmentRow.player_id) || [];
    existingRows.push(segmentRow);
    fandomSegmentsByPlayer.set(segmentRow.player_id, existingRows);
  }

  // 2c. Fetch active eras for flop detection
  const allEras = await entities.Era.filter({ is_active: true });
  const eraMap = new Map<string, any>();

  for (const era of allEras || []) {
    eraMap.set(era.artist_id, era);
  }

  // 4. Fetch existing chart entries (needed before scoring for caps + momentum)
  const existingCharts: ChartRecord[] = await entities.Chart.list();

  // Build release → existing Hot 100 chart entry lookup for momentum/caps
  const existingHot100Map = new Map<string, ChartRecord>();
  for (const ec of existingCharts) {
    if (ec.chart_type === 'Hot 100') {
      existingHot100Map.set(ec.release_id, ec);
    }
  }

  // 3. Score all releases with chart eligibility checks
  const scoredEntries: ChartEntry[] = [];
  for (const release of allReleases) {
    const player = playerMap.get(release.artist_id);
    if (!player) continue;

    // CHART ELIGIBILITY: Check if release should chart (deluxe handling)
    const songCount = release.tracklist?.length || 0;
    const eligibility = getChartEligibility(release, allReleases, songCount);

    if (!eligibility.eligible) {
      console.log(`[ChartUpdate] Release ${release.id} ineligible: ${eligibility.reason}`);
      continue;
    }

    const fanCulture = fanProfileMap.get(release.artist_id) || { dominantVector: null, rollingReadiness: 0, retentionRate: 0 };
    const canonicalSignals = selectCanonicalFandomSignals({
      segments: fandomSegmentsByPlayer.get(release.artist_id) || [],
      fandom: fandomMap.get(release.artist_id) || null,
    });
    const eraData = eraMap.get(release.artist_id) || null;
    const existingEntry = existingHot100Map.get(release.id) || null;

    const score = scoreRelease(release, player, globalTurnId, canonicalSignals, existingEntry, eraData, false, 1, {
      dominantVector: fanCulture.dominantVector,
      rollingReadiness: fanCulture.rollingReadiness,
      retentionRate: fanCulture.retentionRate,
      identityPrimary: player?.core_brand_identity_primary || null,
    }, (ctx?.industryPerceptionByArtist?.[player.id] || player?.industry_perception_modifiers || null), (ctx?.audienceQualityByArtist?.[player.id] || null));
    if (score <= 0) continue;

    scoredEntries.push({
      release_id: release.id,
      artist_id: release.artist_id,
      score,
      lifetime_streams: Number(release.lifetime_streams) || 0,
      region: release.primary_region || player.region,
      genre: player.genre,
      lifecycle_state: release.lifecycle_state,
    });
  }

  // 5. Build charts
  const allUpdates: any[] = [];
  const allCreates: any[] = [];
  const allRemovals: string[] = [];

  // Hot 100 — global, top 100
  const hot100 = buildChart(scoredEntries, 'Hot 100', 100, existingCharts, globalTurnId);
  allUpdates.push(...hot100.updates);
  allCreates.push(...hot100.creates);
  allRemovals.push(...hot100.removals);

  // Top Streaming — pure stream count ranking, top 100
  const streamSorted = scoredEntries.map(e => ({
    ...e,
    score: e.lifetime_streams, // override score with raw streams
  }));
  const topStreaming = buildChart(streamSorted, 'Top Streaming', 100, existingCharts, globalTurnId);
  allUpdates.push(...topStreaming.updates);
  allCreates.push(...topStreaming.creates);
  allRemovals.push(...topStreaming.removals);

  // Regional Charts — top 50 per region
  const regions = new Set<string>();
  for (const e of scoredEntries) {
    if (e.region) regions.add(e.region);
  }
  for (const region of regions) {
    const regionEntries = scoredEntries.filter(e => e.region === region);
    const regional = buildChart(regionEntries, 'Regional', 50, existingCharts, globalTurnId, region);
    allUpdates.push(...regional.updates);
    allCreates.push(...regional.creates);
    allRemovals.push(...regional.removals);
  }

  // Genre Charts — top 50 per genre
  const genres = new Set<string>();
  for (const e of scoredEntries) {
    if (e.genre) genres.add(e.genre);
  }
  for (const genre of genres) {
    const genreEntries = scoredEntries.filter(e => e.genre === genre);
    const genreChart = buildChart(genreEntries, 'Genre', 50, existingCharts, globalTurnId, undefined, genre);
    allUpdates.push(...genreChart.updates);
    allCreates.push(...genreChart.creates);
    allRemovals.push(...genreChart.removals);
  }

  // 6. Certifications
  const existingCerts = await entities.Certification.list();
  const newCerts = checkCertifications(allReleases, existingCerts, globalTurnId);

  // 7. Generate notifications for chart events and certifications
  const notifications: any[] = [];

  // Chart debut notifications (new entries on Hot 100)
  for (const entry of hot100.creates) {
    notifications.push({
      player_id: entry.artist_id,
      type: 'CHART',
      title: 'Chart Debut!',
      subtitle: `You debuted at #${entry.current_position} on the Hot 100!`,
      body: `Your release just entered the Hot 100 at position #${entry.current_position}.`,
      priority: entry.current_position <= 10 ? 'high' : 'medium',
      is_read: false,
      metrics: {
        chart_type: 'Hot 100',
        position: entry.current_position,
        release_id: entry.release_id,
      },
      deep_links: { page: 'ChartsApp' },
      idempotency_key: `chart_debut_${entry.release_id}`,
    });
  }

  // Peak position notifications (check updates for new peaks)
  for (const update of hot100.updates) {
    const existing = existingCharts.find(c => c.id === update.id);
    if (existing && update.patch.peak_position < existing.peak_position) {
      notifications.push({
        player_id: existing.artist_id,
        type: 'CHART',
        title: 'New Peak Position!',
        subtitle: `You hit a new peak at #${update.patch.peak_position} on the Hot 100!`,
        body: `Your release climbed to #${update.patch.current_position}, a new personal best!`,
        priority: update.patch.peak_position <= 10 ? 'high' : 'medium',
        is_read: false,
        metrics: {
          chart_type: 'Hot 100',
          position: update.patch.current_position,
          peak: update.patch.peak_position,
          release_id: existing.release_id,
        },
        deep_links: { page: 'ChartsApp' },
        idempotency_key: `chart_peak_${existing.release_id}_${update.patch.peak_position}`,
      });
    }
  }

  // #1 notification
  for (const entry of [...hot100.creates, ...hot100.updates.map(u => ({ ...u.patch, artist_id: existingCharts.find(c => c.id === u.id)?.artist_id, release_id: existingCharts.find(c => c.id === u.id)?.release_id }))]) {
    const pos = entry.current_position;
    if (pos === 1) {
      notifications.push({
        player_id: entry.artist_id,
        type: 'ACHIEVEMENT',
        title: '#1 on the Hot 100!',
        subtitle: 'You reached the top of the charts!',
        body: 'Your release is now the #1 song in the game. This is a career-defining moment!',
        priority: 'high',
        is_read: false,
        metrics: { chart_type: 'Hot 100', release_id: entry.release_id },
        deep_links: { page: 'ChartsApp' },
        idempotency_key: `chart_number1_${entry.release_id}`,
      });
    }
  }

  // Certification notifications — built alongside certs so turnEngine can
  // conditionally emit only for certs that actually inserted successfully.
  const certNotifications: any[] = [];
  for (const cert of newCerts) {
    const emoji = cert.certification_level === 'Diamond' ? '💎' : cert.certification_level === 'Gold' ? '🥇' : '💿';
    const releaseTitle = cert._release_title || 'Your release';
    certNotifications.push({
      player_id: cert.artist_id,
      type: 'ACHIEVEMENT',
      title: `${emoji} ${cert.certification_detail} Certified!`,
      subtitle: `"${releaseTitle}" just went ${cert.certification_detail}!`,
      body: `With ${Number(cert.streams_at_certification).toLocaleString()} streams, "${releaseTitle}" has been certified ${cert.certification_detail}.`,
      priority: 'high',
      is_read: false,
      metrics: {
        certification_level: cert.certification_level,
        certification_detail: cert.certification_detail,
        streams: cert.streams_at_certification,
        release_id: cert.release_id,
        release_title: releaseTitle,
      },
      deep_links: { page: 'ChartsApp' },
      idempotency_key: `cert_${cert.release_id}_${cert.certification_detail}`,
      // Internal: index into newCerts for turnEngine to match cert success
      _cert_index: newCerts.indexOf(cert),
    });
  }

  return {
    success: true,
    deltas: {
      chart_updates: allUpdates,
      chart_creates: allCreates,
      chart_removals: allRemovals,
      certification_creates: newCerts,
      notifications_to_create: notifications,
      cert_notifications: certNotifications,
    },
  };
}
