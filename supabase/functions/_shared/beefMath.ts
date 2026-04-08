/**
 * Beef Math — Pure scoring, resolution, and impact calculations
 * ─────────────────────────────────────────────────────────────
 * No DB calls. All functions are deterministic given inputs.
 */

const N = (v: any): number => Number(v) || 0;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ─── CONSTANTS ───

export const BEEF_RESPONSE_WINDOW = 5; // turns to respond before beef goes stale
export const BEEF_MAX_CHAIN = 6;       // max back-and-forth exchanges before forced resolution
export const BEEF_TIMELINESS_BONUS = 1.2; // score multiplier for responding within window

// Clout differential thresholds for controversy
const CLOUT_PUNCH_UP_THRESHOLD = 30;   // aggressor clout < target clout by this much
const CLOUT_PUNCH_DOWN_THRESHOLD = 30; // aggressor clout > target clout by this much

// ─── DISS TRACK SCORING ───

/**
 * Score a single diss track contribution to a beef.
 * Beef Score = (quality × 0.5) + (hype × 0.3) + (clout × 0.2)
 */
export function calculateDissTrackScore(params: {
  songQuality: number;
  artistHype: number;
  artistClout: number;
  isTimely?: boolean; // responded within window
}): number {
  const { songQuality, artistHype, artistClout, isTimely = false } = params;
  const raw = (N(songQuality) * 0.5) + (N(artistHype) * 0.3) + (N(artistClout) * 0.2);
  return Math.round(raw * (isTimely ? BEEF_TIMELINESS_BONUS : 1) * 100) / 100;
}

// ─── CONTROVERSY LEVEL ───

/**
 * How controversial is this beef? Based on clout differential and chain length.
 * Punching up = high drama, high reward. Punching down = bully risk.
 */
export function calculateControversyLevel(params: {
  aggressorClout: number;
  targetClout: number;
  chainLength: number;
}): number {
  const { aggressorClout, targetClout, chainLength } = params;
  const diff = N(targetClout) - N(aggressorClout);
  // Base controversy from clout gap (higher when punching up or down)
  const gapContribution = Math.min(50, Math.abs(diff) * 0.5);
  // Chain length escalation (longer beefs = more public drama)
  const chainContribution = Math.min(30, N(chainLength) * 5);
  // Punching up adds extra drama (David vs Goliath)
  const punchUpBonus = diff > CLOUT_PUNCH_UP_THRESHOLD ? 15 : 0;
  return clamp(Math.round(gapContribution + chainContribution + punchUpBonus), 0, 100);
}

/**
 * Is the aggressor punching down? Returns true if bully risk applies.
 */
export function isPunchingDown(aggressorClout: number, targetClout: number): boolean {
  return (N(aggressorClout) - N(targetClout)) > CLOUT_PUNCH_DOWN_THRESHOLD;
}

// ─── BEEF RESOLUTION ───

export type BeefOutcome = {
  status: 'resolved_aggressor_win' | 'resolved_target_win' | 'resolved_draw' | 'stale' | 'backfired';
  winnerId: string | null;
  loserId: string | null;
  winnerImpacts: BeefImpacts;
  loserImpacts: BeefImpacts;
};

export type BeefImpacts = {
  hype_delta: number;
  clout_delta: number;
  rebellion_essence_delta: number;
  authenticity_essence_delta: number;
  engagement_hotness_delta: number;
  lifecycle_boost: boolean; // bump winning diss track to Hot
};

const ZERO_IMPACTS: BeefImpacts = {
  hype_delta: 0, clout_delta: 0,
  rebellion_essence_delta: 0, authenticity_essence_delta: 0,
  engagement_hotness_delta: 0, lifecycle_boost: false,
};

/**
 * Resolve a beef: determine winner, loser, and impacts.
 */
export function resolveBeef(params: {
  aggressorScore: number;
  targetScore: number;
  aggressorClout: number;
  targetClout: number;
  chainLength: number;
  controversyLevel: number;
  stale: boolean; // true if target never responded
  aggressorId: string;
  targetId: string;
}): BeefOutcome {
  const {
    aggressorScore, targetScore, aggressorClout, targetClout,
    chainLength, controversyLevel, stale, aggressorId, targetId
  } = params;

  // ─── STALE: target never responded ───
  if (stale) {
    // If aggressor was punching down, they look like a bully → backfired
    if (isPunchingDown(aggressorClout, targetClout)) {
      return {
        status: 'backfired',
        winnerId: null,
        loserId: aggressorId,
        winnerImpacts: ZERO_IMPACTS,
        loserImpacts: {
          hype_delta: -5,
          clout_delta: -2,
          rebellion_essence_delta: -8,
          authenticity_essence_delta: -5,
          engagement_hotness_delta: -10,
          lifecycle_boost: false,
        },
      };
    }
    // Otherwise aggressor "wins" by default (unanswered) but smaller reward
    return {
      status: 'stale',
      winnerId: aggressorId,
      loserId: targetId,
      winnerImpacts: {
        hype_delta: 5,
        clout_delta: 2,
        rebellion_essence_delta: 3,
        authenticity_essence_delta: 0,
        engagement_hotness_delta: 5,
        lifecycle_boost: false,
      },
      loserImpacts: {
        hype_delta: -3,
        clout_delta: -1,
        rebellion_essence_delta: -3,
        authenticity_essence_delta: 0,
        engagement_hotness_delta: -5,
        lifecycle_boost: false,
      },
    };
  }

  // ─── CONTESTED: both sides dropped tracks ───
  const scoreDiff = N(aggressorScore) - N(targetScore);
  const totalScore = N(aggressorScore) + N(targetScore);
  // Draw if scores within 10% of total
  const drawThreshold = Math.max(5, totalScore * 0.1);
  const isDraw = Math.abs(scoreDiff) <= drawThreshold;

  // Scale impacts by chain length and controversy (longer/hotter = bigger stakes)
  const intensityMult = clamp(1 + (chainLength * 0.15) + (controversyLevel * 0.005), 1, 2.5);

  if (isDraw) {
    const sharedImpacts: BeefImpacts = {
      hype_delta: Math.round(3 * intensityMult),
      clout_delta: Math.round(1 * intensityMult),
      rebellion_essence_delta: Math.round(2 * intensityMult),
      authenticity_essence_delta: Math.round(2 * intensityMult),
      engagement_hotness_delta: Math.round(5 * intensityMult),
      lifecycle_boost: false,
    };
    return {
      status: 'resolved_draw',
      winnerId: null,
      loserId: null,
      winnerImpacts: sharedImpacts,
      loserImpacts: sharedImpacts,
    };
  }

  const winnerIsAggressor = scoreDiff > 0;
  const winnerId = winnerIsAggressor ? aggressorId : targetId;
  const loserId = winnerIsAggressor ? targetId : aggressorId;

  // Punching up bonus: if the winner had lower clout, bigger reward
  const winnerClout = winnerIsAggressor ? aggressorClout : targetClout;
  const loserClout = winnerIsAggressor ? targetClout : aggressorClout;
  const punchUpBonus = (N(loserClout) - N(winnerClout)) > CLOUT_PUNCH_UP_THRESHOLD ? 1.3 : 1.0;

  return {
    status: winnerIsAggressor ? 'resolved_aggressor_win' : 'resolved_target_win',
    winnerId,
    loserId,
    winnerImpacts: {
      hype_delta: Math.round(10 * intensityMult * punchUpBonus),
      clout_delta: Math.round(5 * intensityMult * punchUpBonus),
      rebellion_essence_delta: Math.round(5 * intensityMult),
      authenticity_essence_delta: Math.round(3 * intensityMult),
      engagement_hotness_delta: Math.round(15 * intensityMult),
      lifecycle_boost: true, // winner's diss track → Hot
    },
    loserImpacts: {
      hype_delta: -Math.round(8 * intensityMult),
      clout_delta: -Math.round(3 * intensityMult),
      rebellion_essence_delta: -Math.round(4 * intensityMult),
      authenticity_essence_delta: -Math.round(2 * intensityMult),
      engagement_hotness_delta: -Math.round(10 * intensityMult),
      lifecycle_boost: false,
    },
  };
}

/**
 * Calculate average song quality for an artist's releases in a beef.
 * Used when computing final scores for resolution.
 */
export function computeBeefReleaseQuality(songs: { quality: number }[]): number {
  if (!songs || songs.length === 0) return 0;
  const total = songs.reduce((s, song) => s + N(song.quality), 0);
  return Math.round(total / songs.length);
}
