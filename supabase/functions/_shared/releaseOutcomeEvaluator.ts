/**
 * RELEASE OUTCOME EVALUATOR
 *
 * Pure function that evaluates a release's performance classification.
 * Supports two modes:
 *   - 'projection': During active phases (Hot → Declining), returns a dynamic
 *     performance_class with a confidence score based on partial/cumulative data.
 *   - 'final': At terminal transition (exiting Declining), returns the locked
 *     outcome with confidence ≥ 0.9.
 *
 * The expanded label set includes both original labels and new classifications:
 *   Original: Legacy | CultClassic | SleeperHit | DeepCut | Flop | Archived
 *   New:      Legendary | Classic | SmashHit | Hit | Solid | StrongStart | OneHitWonder
 *
 * Charting is treated as a *weak signal* (small test population makes charting easy).
 * Engagement signals, streaming behavior, and algorithm_mood/trends are primary drivers.
 *
 * PURE FUNCTION — no DB writes, no side effects.
 */

import { LIFECYCLE_DURATIONS } from './economyMath.ts';

// PUBLIC_INTERFACE
/**
 * Valid outcome labels for performance_class.
 * Includes both original labels and expanded classifications.
 */
export type LifecycleOutcome =
  | 'Archived'
  | 'Legacy'
  | 'CultClassic'
  | 'SleeperHit'
  | 'DeepCut'
  | 'Flop'
  | 'Legendary'
  | 'Classic'
  | 'SmashHit'
  | 'Hit'
  | 'Solid'
  | 'StrongStart'
  | 'OneHitWonder';

// PUBLIC_INTERFACE
/**
 * Evaluation mode: 'projection' for per-turn updates, 'final' for terminal lock.
 */
export type EvaluationMode = 'projection' | 'final';

// PUBLIC_INTERFACE
/**
 * Result of the outcome evaluation, including the projected/final class and confidence.
 */
export interface ReleaseOutcomeResult {
  /** The performance classification label */
  performanceClass: LifecycleOutcome;
  /** Stability indicator 0.0–1.0; higher in later lifecycle phases, 1.0 when locked */
  confidence: number;
}

/**
 * Input parameters for the evaluator.
 * Includes engagement signals, algorithm mood, and trend data for richer classification.
 */
export interface EvaluateReleaseOutcomeParams {
  release: {
    id: string;
    lifecycle_state?: string;
    lifetime_streams?: number;
    lifetime_revenue?: number;
    hype?: number;
    quality_score?: number;
    scheduled_turn?: number;
    lifecycle_state_changed_turn?: number;
    performance_class?: string | null;
    /** Chart peak position (lower = better); null/undefined if never charted */
    chart_peak_position?: number | null;
    /** Number of turns the release appeared on charts */
    chart_weeks?: number | null;
  };
  songs: Array<{ quality?: number; setlist_count?: number }>;
  fanSentiment: number | null;          // 0.0–1.0 from fan_profiles.sentiment
  certifications: Array<{ certification_type?: string }>;
  eraOutcome: 'triumph' | 'flop' | null;
  runawayData: { isRunaway?: boolean; strength?: number } | null;
  followerCountAtRelease: number;
  averageStreamsPerTurnDuringStable: number;
  hotPhaseStreams: number;
  currentLifecyclePhase: string;        // The current active phase (Hot, Trending, etc.)
  mode: EvaluationMode;
  // --- Engagement & Algorithm signals (new) ---
  /** Overall engagement rate 0.0–1.0 (likes, shares, saves per stream) */
  engagementRate?: number;
  /** Social follower growth rate during this release's lifecycle (percentage) */
  socialGrowthRate?: number;
  /** Current algorithm mood (e.g. 'mainstream', 'underground', 'experimental') */
  algorithmMood?: string;
  /** Whether this release is linked to an active trend ('rising'|'peak'|null) */
  linkedTrendStatus?: string | null;
  /** Total number of singles the artist has released (for OneHitWonder detection) */
  totalArtistSingles?: number;
  /** Whether the artist has other releases that were hits */
  hasOtherHits?: boolean;
}

// Certification tiers for scoring
const CERT_SCORES: Record<string, number> = {
  'Diamond':       5,
  'Multi-Platinum': 4,
  'Platinum':      3,
  'Gold':          2,
  'Silver':        1,
};

// Phase-based confidence ranges — later phases = more data = higher confidence
const PHASE_CONFIDENCE: Record<string, [number, number]> = {
  'Hot':       [0.10, 0.30],
  'Trending':  [0.25, 0.45],
  'Momentum':  [0.35, 0.60],
  'Stable':    [0.55, 0.80],
  'Declining': [0.75, 0.95],
};

// PUBLIC_INTERFACE
/**
 * All valid terminal outcome values as a Set, for use in guards and filters.
 * Includes both original and expanded labels.
 */
export const TERMINAL_OUTCOMES: ReadonlySet<string> = new Set([
  'Archived', 'Legacy', 'CultClassic', 'SleeperHit', 'DeepCut', 'Flop',
  'Legendary', 'Classic', 'SmashHit', 'Hit', 'Solid', 'StrongStart', 'OneHitWonder',
]);

// PUBLIC_INTERFACE
/**
 * Set of terminal outcomes considered "positive" (i.e., not a failure/neutral).
 * Used to determine hasOtherHits across an artist's discography.
 */
export const POSITIVE_OUTCOMES: ReadonlySet<string> = new Set([
  'Legacy', 'CultClassic', 'SleeperHit',
  'Legendary', 'Classic', 'SmashHit', 'Hit', 'Solid', 'StrongStart', 'OneHitWonder',
]);

// PUBLIC_INTERFACE
/**
 * Check whether a lifecycle_state value represents a terminal outcome.
 * @param state - The lifecycle_state value
 */
export function isTerminalOutcome(state: string | null | undefined): boolean {
  return !!state && TERMINAL_OUTCOMES.has(state);
}

/**
 * Returns the expected lifetime streams for a release at the given follower count.
 * Used to normalize streams to game-calibrated scale.
 * Underground artists produce ~50k lifetime streams (ratio would be 50 vs 1k followers = 50x without normalization).
 * This baseline lets us use 1.0 = "performing at baseline", 2.0 = "double baseline", etc.
 */
function getExpectedLifetimeStreams(followers: number): number {
  if (followers <= 0) return 50_000;
  if (followers < 2_000)    return 50_000;
  if (followers < 10_000)   return 150_000;
  if (followers < 30_000)   return 500_000;
  if (followers < 100_000)  return 1_500_000;
  if (followers < 500_000)  return 6_000_000;
  return 20_000_000;
}

// PUBLIC_INTERFACE
/**
 * Evaluate a release's performance classification.
 *
 * In **projection mode** (active phases), returns a dynamic class with lower confidence.
 * In **final mode** (terminal transition), returns the locked class with confidence ≥ 0.9.
 *
 * Scoring rubric (priority order):
 *   Legendary > SmashHit > Classic > Hit > Legacy > SleeperHit > CultClassic >
 *   StrongStart > Solid > OneHitWonder > DeepCut > Flop > Archived
 *
 * Chart rank is treated as a *weak signal* (small playerbase makes charting easy).
 * Engagement, streaming behavior, and algorithm_mood/trends are primary drivers.
 *
 * @param params - Evaluation parameters including release data, songs, certs, era outcome, etc.
 * @returns ReleaseOutcomeResult with performanceClass and confidence
 */
export function evaluateReleaseOutcome(params: EvaluateReleaseOutcomeParams): ReleaseOutcomeResult {
  const {
    release,
    songs,
    fanSentiment,
    certifications,
    eraOutcome,
    runawayData,
    followerCountAtRelease,
    averageStreamsPerTurnDuringStable,
    hotPhaseStreams,
    currentLifecyclePhase,
    mode,
    // New engagement & algorithm signals
    engagementRate = 0,
    socialGrowthRate = 0,
    algorithmMood = 'mainstream',
    linkedTrendStatus = null,
    totalArtistSingles = 10, // default: assume enough singles to avoid OHW
    hasOtherHits = true,     // default: assume artist has other hits
  } = params;

  const lifetimeStreams = Number(release.lifetime_streams) || 0;
  const safeFollowers = Math.max(1, followerCountAtRelease);

  // Setlist appearances (deep cut / classic signals)
  const totalSetlistAppearances = songs.reduce(
    (sum, s) => sum + (Number(s.setlist_count) || 0),
    0,
  );
  const hasSetlistPresence = totalSetlistAppearances >= 3;

  // --- Scoring signals ---

  // 1. Certification score (0–5)
  let certScore = 0;
  for (const cert of certifications) {
    const type = cert.certification_type || '';
    const score = CERT_SCORES[type] || 0;
    certScore = Math.max(certScore, score);
  }

  // 2. Stream performance normalized to career-stage baseline
  // normalizedRatio 1.0 = performing at baseline for this follower tier
  // normalizedRatio 2.0 = double the expected baseline = solid hit territory
  const expectedBaseline = getExpectedLifetimeStreams(safeFollowers);
  const normalizedRatio = lifetimeStreams / expectedBaseline;

  // 3. Era alignment
  const eraBonus = eraOutcome === 'triumph' ? 1.5 : eraOutcome === 'flop' ? -0.5 : 0;

  // 4. Runaway hit signal
  const runawayBonus = runawayData?.isRunaway ? (runawayData.strength || 1) * 2 : 0;

  // 5. Sleeper hit detection: weak Hot but strong growth in Stable
  const safeHotStreams = Math.max(1, hotPhaseStreams);

  // Per-turn rates for lifecycle phase comparison
  const hotPerTurn = hotPhaseStreams / (LIFECYCLE_DURATIONS.Hot || 48);   // uses canonical duration constant
  const stablePerTurn = averageStreamsPerTurnDuringStable; // already per-turn (stable_phase_streams / LIFECYCLE_DURATIONS.Stable)

  // True sleeper: weak debut but stable phase outperformed the hot phase on a per-turn basis
  // Hot has 6× stream multiplier vs Stable 1× — if stable per-turn > 2× hot per-turn,
  // the song aged unusually well relative to its launch peak
  // Guardrail: if this is clearly a setlist-heavy deep cut and streams are far below baseline,
  // classify via DeepCut instead of SleeperHit.
  const canBeSleeper = !(hasSetlistPresence && normalizedRatio < 0.05);
  // Additional guardrail: require meaningful stable-phase volume; otherwise many low-stream
  // releases look like "sleepers" simply due to phase-duration math.
  const sleeperStableMinPerTurn = Math.max(50, safeFollowers * 0.05);
  const isSleeper =
    canBeSleeper &&
    hotPhaseStreams > 0 &&
    stablePerTurn > 0 &&
    stablePerTurn >= sleeperStableMinPerTurn &&
    stablePerTurn > hotPerTurn * 2.0 &&
    hotPhaseStreams < safeFollowers * 0.8; // hot wasn't already massive (would be SmashHit instead)

  // Debut-dominant: song peaked hard in Hot but stable per-turn streams are relatively low
  // Indicates "big launch, didn't sustain" — the StrongStart pattern
  const debutDominant =
    hotPhaseStreams > 0 &&
    stablePerTurn >= 0 &&
    hotPerTurn > stablePerTurn * 3.0 &&
    hotPhaseStreams > safeFollowers * 0.5;

  // 6. Fan sentiment (cult classic signal)
  const sentiment = fanSentiment ?? 0.5;
  const highSentiment = sentiment > 0.7;

  // 8. Average song quality
  const avgQuality =
    songs.length > 0
      ? songs.reduce((sum, s) => sum + (Number(s.quality) || 50), 0) / songs.length
      : 50;

  // 9. Chart signals (WEAK — down-weighted because small playerbase makes charting easy)
  const chartPeak = release.chart_peak_position ?? null;
  const chartWeeks = Number(release.chart_weeks) || 0;
  // Chart score: max 2.0 (compared to other signals that go up to 3-5)
  const chartScore =
    chartPeak !== null
      ? Math.min(2.0, (chartPeak <= 3 ? 1.5 : chartPeak <= 10 ? 1.0 : 0.5) + (chartWeeks > 5 ? 0.5 : 0))
      : 0;

  // 10. Engagement signals (PRIMARY — these matter more than charts)
  const engRate = Math.max(0, Math.min(1, engagementRate));
  const highEngagement = engRate > 0.15;
  const exceptionalEngagement = engRate > 0.3;
  // Engagement score: up to 4.0 (strong signal)
  const engagementScore =
    exceptionalEngagement ? 4.0 :
    highEngagement ? 2.5 :
    engRate > 0.08 ? 1.5 :
    engRate > 0.03 ? 0.5 : 0;

  // 11. Social growth during release lifecycle
  const socialGrowth = Math.max(0, socialGrowthRate);
  const strongSocialGrowth = socialGrowth > 10; // >10% growth
  const viralSocialGrowth = socialGrowth > 25;  // >25% growth

  // 12. Algorithm mood alignment bonus
  let moodBonus = 0;
  if (linkedTrendStatus === 'peak') moodBonus = 1.5;
  else if (linkedTrendStatus === 'rising') moodBonus = 1.0;
  // Extra boost for algorithm mood alignment with high engagement
  if (algorithmMood === 'underground' && highSentiment && normalizedRatio < 1.0) {
    moodBonus += 0.5; // Underground mood + fan devotion = cult classic potential
  }
  if (algorithmMood === 'experimental' && avgQuality >= 75) {
    moodBonus += 0.3; // Experimental mood rewards high quality
  }

  // --- Composite scoring for each classification ---
  // Priority order determines which classification wins at equal thresholds

  let legendaryScore = 0;
  let smashHitScore = 0;
  let classicScore = 0;
  let hitScore = 0;
  let legacyScore = 0;
  let sleeperScore = 0;
  let cultClassicScore = 0;
  let strongStartScore = 0;
  let solidScore = 0;
  let oneHitWonderScore = 0;
  let deepCutScore = 0;
  let flopScore = 0;

  // === LEGENDARY: All-time great. Exceptional across every dimension ===
  if (certScore >= 4) legendaryScore += 3;          // Multi-Platinum+
  if (normalizedRatio > 4.0) legendaryScore += 2;
  if (exceptionalEngagement) legendaryScore += 2;
  if (runawayBonus > 2) legendaryScore += 1.5;
  legendaryScore += eraBonus;
  if (avgQuality >= 85) legendaryScore += 1;
  if (viralSocialGrowth) legendaryScore += 1;
  legendaryScore += moodBonus * 0.3; // Mood is a minor signal for legendary

  // === SMASH HIT: Massive commercial success, dominated charts and streams ===
  if (certScore >= 3) smashHitScore += 2;            // Platinum+
  if (normalizedRatio > 3.0) smashHitScore += 2;
  else if (normalizedRatio > 2.0) smashHitScore += 1;
  smashHitScore += chartScore * 0.5; // Charts are a WEAK signal
  if (engagementScore >= 2.5) smashHitScore += 1.5;
  if (runawayBonus > 0) smashHitScore += 1;
  smashHitScore += eraBonus * 0.5;
  if (viralSocialGrowth) smashHitScore += 1;

  // === CLASSIC: Timeless. High quality + sustained engagement over time ===
  if (avgQuality >= 80) classicScore += 2;
  if (highSentiment) classicScore += 2;
  if (hasSetlistPresence) classicScore += 1.5;
  if (normalizedRatio > 1.5) classicScore += 1;
  if (engagementScore >= 1.5) classicScore += 1;
  classicScore += eraBonus * 0.5;
  if (certScore >= 2) classicScore += 1;
  classicScore += moodBonus * 0.3;

  // === HIT: Solid chart performer with strong streaming numbers ===
  if (normalizedRatio > 1.5) hitScore += 2;
  else if (normalizedRatio > 1.0) hitScore += 1;
  hitScore += chartScore * 0.5; // Charts are weak
  if (engagementScore >= 1.5) hitScore += 1.5;
  if (certScore >= 2) hitScore += 1;
  if (strongSocialGrowth) hitScore += 1;
  hitScore += eraBonus * 0.3;

  // === LEGACY (original): Timeless hit — strong catalogue + era triumph ===
  if (certScore >= 3) legacyScore += 3;
  else if (certScore >= 2) legacyScore += 1.5;
  if (normalizedRatio > 2.0) legacyScore += 2;
  else if (normalizedRatio > 1.0) legacyScore += 1;
  legacyScore += eraBonus;
  legacyScore += runawayBonus;
  if (avgQuality >= 75) legacyScore += 1;
  if (engagementScore >= 1.5) legacyScore += 0.5;
  legacyScore += moodBonus * 0.2;

  // === SLEEPER HIT (original): Weak start, strong late growth ===
  if (canBeSleeper) {
    if (isSleeper) sleeperScore += 3;
    if (runawayBonus > 0 && hotPhaseStreams < safeFollowers * 0.3) sleeperScore += 2;
    if (normalizedRatio > 0.8 && hotPhaseStreams < safeFollowers * 0.5) sleeperScore += 1;
    // Engagement growth over time is a strong sleeper signal
    if (engagementScore >= 1.5 && hotPhaseStreams < safeFollowers * 0.5) sleeperScore += 1.5;
    if (strongSocialGrowth && hotPhaseStreams < safeFollowers * 0.3) sleeperScore += 1;
    sleeperScore += moodBonus * 0.3;
  }

  // === CULT CLASSIC (original): Beloved by devoted fanbase, NOT mainstream ===
  // certScore === 0 = no mainstream certification = cult-not-commercial signal
  if (highSentiment && hasSetlistPresence && certScore === 0) cultClassicScore += 3;
  if (highSentiment && hasSetlistPresence && certScore <= 1) cultClassicScore += 2;
  if (sentiment > 0.8 && hasSetlistPresence) cultClassicScore += 1;
  if (exceptionalEngagement && certScore === 0) cultClassicScore += 2;
  else if (highEngagement && certScore === 0) cultClassicScore += 1;
  if (algorithmMood === 'underground' && highSentiment && certScore === 0) cultClassicScore += 1;
  cultClassicScore += moodBonus * 0.4;

  // === STRONG START: Big debut that didn't sustain — peaked early ===
  if (debutDominant) strongStartScore += 3;
  else if (hotPhaseStreams > safeFollowers * 1.0 && stablePerTurn < hotPerTurn * 0.5) strongStartScore += 2;
  else if (hotPhaseStreams > safeFollowers * 0.7) strongStartScore += 1;
  // Engagement during hot phase but not sustained
  if (engagementScore >= 1.5 && debutDominant) strongStartScore += 0.5;
  // Penalize Hit/SmashHit when debut-dominant (let StrongStart win over Hit for fade-out releases)
  if (debutDominant && normalizedRatio < 1.5) {
    hitScore *= 0.4;
    smashHitScore *= 0.3;
  }

  // === SOLID: Reliable performer, good but not exceptional ===
  if (normalizedRatio > 0.5 && normalizedRatio <= 2.0) solidScore += 2;
  if (avgQuality >= 60 && avgQuality < 80) solidScore += 1;
  if (engagementScore >= 0.5 && engagementScore < 2.5) solidScore += 1;
  if (certScore >= 1 && certScore < 3) solidScore += 1;
  // Solid = middle-of-the-road: not great, not bad
  if (sentiment >= 0.4 && sentiment <= 0.7) solidScore += 0.5;

  // === ONE HIT WONDER: One big moment, couldn't replicate ===
  // Requires: this is the big hit AND artist has few other singles AND no other hits
  if (!hasOtherHits && normalizedRatio > 1.5) oneHitWonderScore += 3;
  if (totalArtistSingles < 4 && normalizedRatio > 1.0) oneHitWonderScore += 2;
  if (!hasOtherHits && totalArtistSingles < 4 && hotPhaseStreams >= safeFollowers * 0.8) oneHitWonderScore += 3;
  if (!hasOtherHits && totalArtistSingles < 4 && debutDominant) oneHitWonderScore += 1;
  if (chartPeak !== null && chartPeak <= 5 && totalArtistSingles < 4) oneHitWonderScore += 1;
  // Engagement can help: if engagement is high but only for this one song
  if (engagementScore >= 2.0 && totalArtistSingles < 4) oneHitWonderScore += 0.5;

  // === DEEP CUT (original): Low mainstream, loved by core fans ===
  if (hasSetlistPresence && normalizedRatio < 0.5) deepCutScore += 3;
  if (avgQuality >= 70 && normalizedRatio < 0.3) deepCutScore += 2;
  if (totalSetlistAppearances >= 5) deepCutScore += 1;
  // High engagement on low-stream tracks = dedicated listeners
  if (highEngagement && normalizedRatio < 0.5) deepCutScore += 1;

  // === FLOP (original): Underperformed expectations ===
  if (normalizedRatio < 0.2 && (sentiment < 0.35 || eraOutcome === 'flop' || engRate < 0.02)) flopScore += 2;
  if (normalizedRatio < 0.1 && (sentiment < 0.4 || eraOutcome === 'flop')) flopScore += 1;
  if (sentiment < 0.3) flopScore += 2;
  if (eraOutcome === 'flop') flopScore += 1;
  if (lifetimeStreams <= safeFollowers * 0.05) flopScore += 1;
  // Low engagement = nobody cares
  if (engRate < 0.02 && sentiment < 0.4) flopScore += 1;
  // Negative social response
  if (socialGrowth < -5) flopScore += 0.5;

  // --- Determine outcome (priority order) ---
  let performanceClass: LifecycleOutcome = 'Archived';

  // Thresholds: higher-tier classifications require higher scores
  if (legendaryScore >= 6) {
    performanceClass = 'Legendary';
  } else if (smashHitScore >= 5) {
    performanceClass = 'SmashHit';
  } else if (classicScore >= 5) {
    performanceClass = 'Classic';
  } else if (strongStartScore >= 3 && debutDominant) {
    performanceClass = 'StrongStart';
  } else if (hitScore >= 4) {
    performanceClass = 'Hit';
  } else if (legacyScore >= 4) {
    performanceClass = 'Legacy';
  } else if (sleeperScore >= 3) {
    performanceClass = 'SleeperHit';
  } else if (cultClassicScore >= 3) {
    performanceClass = 'CultClassic';
  } else if (strongStartScore >= 3) {
    performanceClass = 'StrongStart';
  } else if (solidScore >= 3) {
    performanceClass = 'Solid';
  } else if (oneHitWonderScore >= 3) {
    performanceClass = 'OneHitWonder';
  } else if (deepCutScore >= 3) {
    performanceClass = 'DeepCut';
  } else if (flopScore >= 3) {
    performanceClass = 'Flop';
  }
  // else: stays 'Archived' (default)

  // --- Calculate confidence ---
  let confidence: number;
  if (mode === 'final') {
    // Terminal transition: high confidence
    confidence = Math.max(0.9, 1.0);
  } else {
    // Projection mode: based on current lifecycle phase
    const range = PHASE_CONFIDENCE[currentLifecyclePhase] || [0.1, 0.3];
    // Within the range, higher scores = higher confidence
    const maxScore = Math.max(
      legendaryScore, smashHitScore, classicScore, hitScore,
      legacyScore, sleeperScore, cultClassicScore,
      strongStartScore, solidScore, oneHitWonderScore,
      deepCutScore, flopScore, 1
    );
    const scoreNorm = Math.min(1, maxScore / 8);
    confidence = Number((range[0] + (range[1] - range[0]) * scoreNorm).toFixed(2));
  }

  return { performanceClass, confidence };
}
