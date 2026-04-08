/**
 * STREAMIFY ALGORITHM MODULE — Momentum-based boost evaluation
 *
 * Models Streamify's algorithmic playlist behavior: releases that show
 * consistent streaming momentum get amplified (discovery boost, playlist
 * push), while releases that plateau or decline get suppressed.
 *
 * Pure function — no DB writes. Returns a per-release multiplier consumed
 * by turnProcessorCore §3 alongside computeMoodStreamBonus.
 *
 * Key signals:
 *   1. Stream velocity   — turn-over-turn growth rate
 *   2. Consistency streak — how many consecutive turns streams grew
 *   3. Hot-phase ratio    — streams vs followers at release (virality proxy)
 *   4. Playlist placement — lifecycle-based editorial/algorithmic weighting
 */

import { PLATFORM_MODELS } from './platformAlgorithmModel.ts';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Minimum streams this turn to be eligible for any boost */
const MIN_STREAMS_THRESHOLD = 50;

/** Turns of history used for velocity calculation */
const VELOCITY_WINDOW = 7;

/** Maximum boost the algorithm can apply */
const MAX_BOOST = 1.45;

/** Minimum suppression the algorithm can apply */
const MIN_BOOST = 0.70;

/** Streak length where the algorithm fully "locks in" on a release */
const STREAK_CAP = 14;

/** Hot-phase virality ratio threshold — streams / followers_at_release */
const VIRALITY_RATIO_THRESHOLD = 0.05;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StreamifyMomentumInput {
  /** Streams attributed to this release THIS turn */
  streamsThisTurn: number;
  /** Streams attributed to this release LAST turn (0 if first turn) */
  streamsPrevTurn: number;
  /** Cumulative hot-phase streams */
  hotPhaseStreams: number;
  /** Follower count when the release dropped */
  followersAtRelease: number;
  /** Current lifecycle state */
  lifecycleState: string;
  /** Release genre */
  releaseGenre: string | null;
  /** Artist's primary genre */
  playerGenre: string | null;
  /** Number of consecutive turns where streams grew (caller tracks this) */
  growthStreak: number;
  /** Current global algorithm mood */
  algorithmMood: string;
  /** Whether the release is linked to a trending/peak trend */
  linkedTrendStatus: string | null;
}

export interface StreamifyMomentumResult {
  /** Final Streamify-specific multiplier [MIN_BOOST, MAX_BOOST] */
  multiplier: number;
  /** Breakdown for diagnostics / turn event logging */
  breakdown: {
    velocityScore: number;
    streakBonus: number;
    viralityBonus: number;
    playlistPlacement: number;
    genreAffinity: number;
    moodInteraction: number;
  };
  /** Human-readable label for UI / news module */
  signal: 'algorithmic_push' | 'playlist_boost' | 'neutral' | 'playlist_cooldown' | 'algorithm_suppressed';
}

// ─── CORE EVALUATION ─────────────────────────────────────────────────────────

/**
 * Evaluate Streamify's algorithmic momentum boost for a single release.
 * Returns a multiplier that should be applied to the Streamify share of
 * streams (NOT total streams — Streamify-specific only).
 */
export function evaluateStreamifyMomentum(input: StreamifyMomentumInput): StreamifyMomentumResult {
  const {
    streamsThisTurn,
    streamsPrevTurn,
    hotPhaseStreams,
    followersAtRelease,
    lifecycleState,
    releaseGenre,
    playerGenre,
    growthStreak,
    algorithmMood,
    linkedTrendStatus,
  } = input;

  // Below minimum threshold — algorithm doesn't notice you
  if (streamsThisTurn < MIN_STREAMS_THRESHOLD) {
    return {
      multiplier: 1.0,
      breakdown: {
        velocityScore: 0,
        streakBonus: 0,
        viralityBonus: 0,
        playlistPlacement: 0,
        genreAffinity: 0,
        moodInteraction: 0,
      },
      signal: 'neutral',
    };
  }

  // 1. STREAM VELOCITY — turn-over-turn growth rate
  //    Positive velocity = growing, negative = declining
  //    Capped at ±0.15 contribution to final multiplier
  let velocityScore = 0;
  if (streamsPrevTurn > 0) {
    const rawVelocity = (streamsThisTurn - streamsPrevTurn) / streamsPrevTurn;
    // Sigmoid-like compression: big jumps get diminishing returns
    velocityScore = Math.tanh(rawVelocity * 2) * 0.15;
  } else if (streamsThisTurn > 0) {
    // First turn with streams — treat as moderate positive signal
    velocityScore = 0.05;
  }

  // 2. CONSISTENCY STREAK — algorithm rewards sustained growth
  //    Linear ramp to STREAK_CAP turns, then flat
  const normalizedStreak = Math.min(growthStreak, STREAK_CAP) / STREAK_CAP;
  const streakBonus = normalizedStreak * 0.12;

  // 3. HOT-PHASE VIRALITY — did this release punch above its weight?
  //    High hot_phase_streams relative to followers signals organic virality
  let viralityBonus = 0;
  if (followersAtRelease > 0 && hotPhaseStreams > 0) {
    const viralityRatio = hotPhaseStreams / followersAtRelease;
    if (viralityRatio > VIRALITY_RATIO_THRESHOLD) {
      // Log-scaled bonus: massive virality gets diminishing returns
      viralityBonus = Math.min(0.10, Math.log2(viralityRatio / VIRALITY_RATIO_THRESHOLD) * 0.03);
    }
  }

  // 4. PLAYLIST PLACEMENT — lifecycle-based algorithmic weighting
  //    Streamify's algorithm pushes Hot/Trending releases harder
  const playlistMap: Record<string, number> = {
    'Hot':       0.10,   // Release Radar, New Music Friday
    'Trending':  0.08,   // Algorithmic discovery playlists
    'Momentum':  0.04,   // Personalized recommendations
    'Stable':    0.00,   // Catalogue — no active push
    'Declining': -0.05,  // Algorithm deprioritizes
  };
  const playlistPlacement = playlistMap[lifecycleState] ?? -0.02;

  // 5. GENRE AFFINITY — Streamify favors certain genres algorithmically
  const streamifyModel = PLATFORM_MODELS.Streamify;
  const genreKey = releaseGenre || playerGenre || '';
  const genreAffinity = ((streamifyModel.playlistBiasByGenre as Record<string, number>)[genreKey] ?? 1.0) - 1.0;
  // Scale down: raw bias is 1.0-1.2, we want ±0.04 max contribution
  const scaledGenreAffinity = genreAffinity * 0.2;

  // 6. MOOD INTERACTION — certain moods amplify/dampen Streamify's algorithm
  let moodInteraction = 0;
  if (algorithmMood === 'mainstream') {
    // Streamify thrives during mainstream moods — algorithm is king
    moodInteraction = 0.04;
  } else if (algorithmMood === 'viral_spiral') {
    // Viral chaos amplifies algorithmic momentum
    moodInteraction = velocityScore > 0 ? 0.06 : -0.03;
  } else if (algorithmMood === 'underground') {
    // Streamify's algorithm is less effective during underground moods
    moodInteraction = -0.04;
  } else if (algorithmMood === 'hype_cycle') {
    // Hot releases get extra algorithmic juice during hype cycles
    if (lifecycleState === 'Hot' || lifecycleState === 'Trending') {
      moodInteraction = 0.05;
    }
  }

  // Trend-linked releases get a small additional algorithmic nudge
  if (linkedTrendStatus === 'peak') moodInteraction += 0.03;
  else if (linkedTrendStatus === 'rising') moodInteraction += 0.015;

  // ── COMBINE ────────────────────────────────────────────────────────────────
  const rawMultiplier = 1.0
    + velocityScore
    + streakBonus
    + viralityBonus
    + playlistPlacement
    + scaledGenreAffinity
    + moodInteraction;

  const multiplier = Math.max(MIN_BOOST, Math.min(MAX_BOOST, rawMultiplier));

  // Determine signal label
  let signal: StreamifyMomentumResult['signal'] = 'neutral';
  if (multiplier >= 1.20) signal = 'algorithmic_push';
  else if (multiplier >= 1.08) signal = 'playlist_boost';
  else if (multiplier <= 0.85) signal = 'algorithm_suppressed';
  else if (multiplier < 0.95) signal = 'playlist_cooldown';

  return {
    multiplier,
    breakdown: {
      velocityScore: round3(velocityScore),
      streakBonus: round3(streakBonus),
      viralityBonus: round3(viralityBonus),
      playlistPlacement: round3(playlistPlacement),
      genreAffinity: round3(scaledGenreAffinity),
      moodInteraction: round3(moodInteraction),
    },
    signal,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Compute a growth streak from an array of recent per-turn stream counts.
 * Returns the number of consecutive turns (from most recent) where streams
 * were greater than the previous turn.
 *
 * @param recentStreams - Array of stream counts, oldest first, length ≤ VELOCITY_WINDOW
 */
export function computeGrowthStreak(recentStreams: number[]): number {
  if (recentStreams.length < 2) return 0;
  let streak = 0;
  for (let i = recentStreams.length - 1; i > 0; i--) {
    if (recentStreams[i] > recentStreams[i - 1]) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
