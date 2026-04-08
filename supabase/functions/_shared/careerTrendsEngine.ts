/**
 * CAREER TRENDS ENGINE v2 — Binary Criteria, Single Active Trend
 *
 * Design principles:
 * 1. STABLE is the default — nothing special is happening.
 * 2. Only ONE trend active at a time (priority order breaks ties).
 * 3. Each trend has explicit, binary criteria — ALL must be met.
 * 4. No fuzzy scoring. Either you qualify or you don't.
 * 5. 1 turn = 1 real-life hour.
 */

import { getStageIndex, STAGE_ORDER } from './constants/careerStages.ts';

export type CareerTrend =
  | 'STABLE'
  | 'GOAT'
  | 'VIRAL_SENSATION'
  | 'COMEBACK'
  | 'LEGACY_ARTIST'
  | 'ONE_HIT_WONDER'
  | 'FLOP_ERA'
  | 'CAREER_SLUMP'
  | 'PASSED_PRIME'
  | 'DORMANT'
  | 'FORGOTTEN';

/** Priority order: first match wins. STABLE is the fallback (always last). */
export const CAREER_TRENDS: CareerTrend[] = [
  'GOAT',
  'VIRAL_SENSATION',
  'COMEBACK',
  'LEGACY_ARTIST',
  'ONE_HIT_WONDER',
  'FLOP_ERA',
  'CAREER_SLUMP',
  'PASSED_PRIME',
  'DORMANT',
  'FORGOTTEN',
  'STABLE',
];

// ─── Time Constants (1 turn = 1 real-life hour) ────────────────────────────
const HOURS_PER_DAY = 24;
const HOURS_PER_MONTH = 30 * HOURS_PER_DAY; // 720 turns
const HOURS_3_MONTHS = 3 * HOURS_PER_MONTH; // 2160 turns

/** Dormant threshold: no album/project for 200 hours */
const DORMANT_HOURS = 200;
/** Forgotten: dormant for 400+ hours */
const FORGOTTEN_HOURS = 400;
/** One Hit Wonder: active for this many turns once triggered */
export const ONE_HIT_WONDER_DURATION = 500;

// ─── Input from turnScheduler ──────────────────────────────────────────────

export interface TrendEvalInput {
  // Current trend state
  currentTrend: CareerTrend | string | null;
  holdTurns: number;

  // Player profile data
  careerStage: string;
  careerStageIndex: number;   // 0-9 from STAGE_ORDER
  clout: number;
  hype: number;
  followers: number;

  // Account / career age
  accountAgeTurns: number;    // total turns since account creation

  // Release activity
  turnsSinceLastRelease: number;  // hours since last album/project release
  totalSinglesCount: number;      // total singles ever released
  totalReleasesCount: number;     // total releases of ANY type (singles + albums + EPs)
  hasSmashHit: boolean;           // has a release with peak chart position <= 5
  smashHitReleaseId: string | null; // ID of the smash hit release (for OHW effects)

  // Flop tracking
  consecutiveFlops: number;       // consecutive project flops
  eraIsFlop: boolean;             // current era flagged as flop

  // Decline tracking
  consecutiveDeclineTurns: number; // consecutive turns with declining metrics

  // Chart presence
  chartPresenceRate: number;      // 0-1, fraction of last 12 turns with chart entry
  hasChartingRelease: boolean;    // has any currently charting release

  // Social/viral
  hasViralPost: boolean;          // any post with virality_score > 80
  followerGrowthRate: number;     // recent follower growth rate (decimal, e.g. 0.20 = 20%)

  // Previous trend state (for COMEBACK detection)
  previousTrend: string | null;

  // ONE_HIT_WONDER expiry flag: once OHW completes its full 500-turn tenure, block re-entry
  oneHitWonderExpired: boolean;

  // Phase 5 audience quality modifiers (passthrough for effects)
  phase5: any;
}

// ─── Signals (for rationale display, not for scoring) ──────────────────────

export type TrendSignals = {
  careerStageIndex: number;
  accountAgeTurns: number;
  turnsSinceLastRelease: number;
  consecutiveFlops: number;
  consecutiveDeclineTurns: number;
  chartPresenceRate: number;
  clout: number;
  hype: number;
  hasSmashHit: boolean;
  totalSinglesCount: number;
  totalReleasesCount: number;
  hasViralPost: boolean;
  followerGrowthRate: number;
  hasChartingRelease: boolean;
  eraIsFlop: boolean;
};

function buildSignals(input: TrendEvalInput): TrendSignals {
  return {
    careerStageIndex: input.careerStageIndex,
    accountAgeTurns: input.accountAgeTurns,
    turnsSinceLastRelease: input.turnsSinceLastRelease,
    consecutiveFlops: input.consecutiveFlops,
    consecutiveDeclineTurns: input.consecutiveDeclineTurns,
    chartPresenceRate: input.chartPresenceRate,
    clout: input.clout,
    hype: input.hype,
    hasSmashHit: input.hasSmashHit,
    totalSinglesCount: input.totalSinglesCount,
    totalReleasesCount: input.totalReleasesCount,
    hasViralPost: input.hasViralPost,
    followerGrowthRate: input.followerGrowthRate,
    hasChartingRelease: input.hasChartingRelease,
    eraIsFlop: input.eraIsFlop,
  };
}

// ─── Binary Trend Checkers (ALL criteria must be met) ──────────────────────

function checkGOAT(i: TrendEvalInput): boolean {
  // Career stage >= 8 (Global Superstar or Legacy Icon)
  // AND clout >= 2000
  // AND chart presence in 75%+ of last 12 turns
  return i.careerStageIndex >= 8
    && i.clout >= 2000
    && i.chartPresenceRate >= 0.75;
}

function checkVIRAL_SENSATION(i: TrendEvalInput): boolean {
  // Has a viral post (virality > 80)
  // AND follower growth > 20% recently
  return i.hasViralPost === true
    && i.followerGrowthRate > 0.20;
}

function checkCOMEBACK(i: TrendEvalInput): boolean {
  // Artist is currently in (or just exited) a slump/flop AND now has a charting release.
  // Requires minimum account age of 72 turns (3 real days) so new accounts that
  // started dormant/slumping don't immediately flip to COMEBACK on first release.
  //
  // BUG-FIX: previousTrend stores the trend BEFORE the slump, not the slump itself.
  // e.g. STABLE → CAREER_SLUMP: previousTrend = STABLE, not CAREER_SLUMP.
  // So we must check currentTrend (still in slump but now charting) OR
  // previousTrend (caught one turn after exiting the slump).
  if (i.accountAgeTurns < 72) return false; // must have at least 3 real days of history
  const inOrWasBad =
    i.currentTrend === 'CAREER_SLUMP' || i.currentTrend === 'FLOP_ERA' || i.currentTrend === 'PASSED_PRIME'
    || i.previousTrend === 'CAREER_SLUMP' || i.previousTrend === 'FLOP_ERA' || i.previousTrend === 'PASSED_PRIME';
  return inOrWasBad && i.hasChartingRelease === true;
}

function checkLEGACY_ARTIST(i: TrendEvalInput): boolean {
  // Career stage >= 6 (Mainstream Artist or higher)
  // AND account age > 3 real-life months (2160 turns)
  return i.careerStageIndex >= 6
    && i.accountAgeTurns >= HOURS_3_MONTHS;
}

function checkONE_HIT_WONDER(i: TrendEvalInput): boolean {
  // Scored a smash hit (peak chart pos <= 5)
  // AND has fewer than 4 total singles released as Singles (not albums/EPs)
  // AND fewer than 2 total releases of ANY type — artists with 2+ projects have
  //   a real discography (e.g. Album + EP) and are not one-hit wonders
  // AND career stage < 4 (below Cult Favorite) — established artists are never OHW
  // Block re-entry once OHW has already run its full 500-turn tenure
  if (i.oneHitWonderExpired) return false;
  if (i.careerStageIndex >= 4) return false; // Cult Favorite+ cannot be a one-hit wonder
  if (i.totalReleasesCount >= 2) return false; // 2+ projects = real discography, not OHW
  return i.hasSmashHit === true
    && i.totalSinglesCount < 4;
}

function checkFLOP_ERA(i: TrendEvalInput): boolean {
  // 3+ consecutive project flops
  // AND current era flagged as flop
  return i.consecutiveFlops >= 3
    && i.eraIsFlop === true;
}

function checkCAREER_SLUMP(i: TrendEvalInput): boolean {
  // 3+ consecutive declining turns
  // AND hype < 25
  // AND no currently charting release
  // AND account must be at least 48 turns old (2 real days) — brand-new inactive
  // accounts have declining metrics by default before any activity begins
  if (i.accountAgeTurns < 48) return false;
  return i.consecutiveDeclineTurns >= 3
    && i.hype < 25
    && i.hasChartingRelease === false;
}

function checkPASSED_PRIME(i: TrendEvalInput): boolean {
  // Career stage < 4 (below Cult Favorite)
  // AND currently in CAREER_SLUMP trend
  // AND 4+ consecutive project flops
  return i.careerStageIndex < 4
    && i.currentTrend === 'CAREER_SLUMP'
    && i.consecutiveFlops >= 4;
}

function checkDORMANT(i: TrendEvalInput): boolean {
  // No album or project released for 200+ hours (turns)
  // Guard: an artist with a currently Hot/Trending release is NOT dormant — they're between drops
  if (i.hasChartingRelease) return false;
  // Guard: a viral social presence also disqualifies dormant
  if (i.hasViralPost) return false;
  return i.turnsSinceLastRelease >= DORMANT_HOURS;
}

function checkFORGOTTEN(i: TrendEvalInput): boolean {
  // Dormant for 400+ hours AND career stage < 4
  // Same guards as DORMANT: active chart presence or viral post disqualifies
  if (i.hasChartingRelease) return false;
  if (i.hasViralPost) return false;
  return i.turnsSinceLastRelease >= FORGOTTEN_HOURS
    && i.careerStageIndex < 4;
}

// ─── Checker Map (in priority order) ───────────────────────────────────────

const TREND_CHECKERS: Record<CareerTrend, (i: TrendEvalInput) => boolean> = {
  GOAT: checkGOAT,
  VIRAL_SENSATION: checkVIRAL_SENSATION,
  COMEBACK: checkCOMEBACK,
  LEGACY_ARTIST: checkLEGACY_ARTIST,
  ONE_HIT_WONDER: checkONE_HIT_WONDER,
  FLOP_ERA: checkFLOP_ERA,
  CAREER_SLUMP: checkCAREER_SLUMP,
  PASSED_PRIME: checkPASSED_PRIME,
  DORMANT: checkDORMANT,
  FORGOTTEN: checkFORGOTTEN,
  STABLE: () => true, // always qualifies — it's the fallback
};

/** Minimum turns a trend must stay active before it can change. */
const MIN_HOLD: Record<CareerTrend, number> = {
  GOAT: 48,               // 2 days
  VIRAL_SENSATION: 24,    // 1 day
  COMEBACK: 48,           // 2 days
  LEGACY_ARTIST: 72,      // 3 days
  ONE_HIT_WONDER: ONE_HIT_WONDER_DURATION,  // ~3 weeks, then exits
  FLOP_ERA: 72,           // 3 days
  CAREER_SLUMP: 48,       // 2 days
  PASSED_PRIME: 72,       // 3 days
  DORMANT: 24,            // 1 day
  FORGOTTEN: 24,          // 1 day
  STABLE: 0,              // no hold — can always transition out
};

// ─── Main Evaluation Function ──────────────────────────────────────────────

export function evaluateCareerTrend(input: any): {
  trend: CareerTrend;
  scores: Record<CareerTrend, number>;
  signals: TrendSignals;
  rationaleKeys: string[];
} {
  const i = normalizeInput(input);
  const signals = buildSignals(i);

  // Build a "scores" map: 1.0 if criteria met, 0.0 if not (for compatibility)
  const scores = {} as Record<CareerTrend, number>;
  const qualifiedTrends: CareerTrend[] = [];

  for (const trend of CAREER_TRENDS) {
    const passes = TREND_CHECKERS[trend](i);
    scores[trend] = passes ? 1.0 : 0.0;
    if (passes && trend !== 'STABLE') {
      qualifiedTrends.push(trend);
    }
  }

  // Determine the winning trend (first qualifying in priority order)
  let selected: CareerTrend = 'STABLE';
  if (qualifiedTrends.length > 0) {
    selected = qualifiedTrends[0]; // highest priority that qualifies
  }

  // ONE_HIT_WONDER special: if it's been active for its full duration, expire it
  if (selected === 'ONE_HIT_WONDER' && i.holdTurns >= ONE_HIT_WONDER_DURATION && i.currentTrend === 'ONE_HIT_WONDER') {
    selected = 'STABLE';
  }

  // Minimum hold: if current trend hasn't been held long enough, keep it
  const currentTrend = (i.currentTrend || 'STABLE') as CareerTrend;
  if (currentTrend !== 'STABLE' && currentTrend !== selected) {
    const minHold = MIN_HOLD[currentTrend] ?? 0;
    if (i.holdTurns < minHold) {
      // Special case: if artist has a fresh release AND DORMANT no longer qualifies (e.g. hasChartingRelease),
      // skip the hold lock so they can exit DORMANT immediately.
      if (currentTrend === 'DORMANT' && i.turnsSinceLastRelease < 10) {
        // Fall through — DORMANT checkers already guard against hasChartingRelease/hasViralPost
      } else {
        // Check if current trend still qualifies (don't force a clearly invalid trend)
        const stillQualifies = TREND_CHECKERS[currentTrend]?.(i) ?? false;
        if (stillQualifies) {
          selected = currentTrend;
        }
      }
    }
  }

  // Build rationale keys: list the most decisive signals
  const rationaleKeys: string[] = [];
  if (selected === 'GOAT') rationaleKeys.push('high_career_stage', 'high_clout', 'chart_dominance');
  else if (selected === 'VIRAL_SENSATION') rationaleKeys.push('viral_post', 'follower_growth');
  else if (selected === 'COMEBACK') rationaleKeys.push('was_slumping', 'charting_release');
  else if (selected === 'LEGACY_ARTIST') rationaleKeys.push('high_career_stage', 'long_career');
  else if (selected === 'ONE_HIT_WONDER') rationaleKeys.push('smash_hit', 'few_singles');
  else if (selected === 'FLOP_ERA') rationaleKeys.push('consecutive_flops', 'era_flop');
  else if (selected === 'CAREER_SLUMP') rationaleKeys.push('declining_turns', 'low_hype', 'no_charts');
  else if (selected === 'PASSED_PRIME') rationaleKeys.push('low_stage', 'slumping', 'many_flops');
  else if (selected === 'FORGOTTEN') rationaleKeys.push('long_dormant', 'low_stage');
  else if (selected === 'DORMANT') rationaleKeys.push('no_recent_release');
  else rationaleKeys.push('stable');

  return { trend: selected, scores, signals, rationaleKeys };
}

// ─── Input Normalization ───────────────────────────────────────────────────

function normalizeInput(raw: any): TrendEvalInput {
  const stageStr = String(raw?.careerStage || raw?.career_stage || 'Unknown');
  const stageIdx = getStageIndex(stageStr);

  return {
    currentTrend: raw?.currentTrend || null,
    holdTurns: Number(raw?.holdTurns) || 0,
    careerStage: stageStr,
    careerStageIndex: stageIdx >= 0 ? stageIdx : 0,
    clout: Number(raw?.clout) || 0,
    hype: Number(raw?.hype) || 0,
    followers: Number(raw?.followers) || 0,
    accountAgeTurns: Number(raw?.accountAgeTurns) || 0,
    turnsSinceLastRelease: Number(raw?.turnsSinceLastRelease) || 0,
    totalSinglesCount: Number(raw?.totalSinglesCount) || 0,
    totalReleasesCount: Number(raw?.totalReleasesCount) || 0,
    hasSmashHit: !!raw?.hasSmashHit,
    smashHitReleaseId: raw?.smashHitReleaseId || null,
    consecutiveFlops: Number(raw?.consecutiveFlops) || 0,
    eraIsFlop: !!raw?.eraIsFlop,
    consecutiveDeclineTurns: Number(raw?.consecutiveDeclineTurns) || 0,
    chartPresenceRate: Number(raw?.chartPresenceRate) || 0,
    hasChartingRelease: !!raw?.hasChartingRelease,
    hasViralPost: !!raw?.hasViralPost,
    followerGrowthRate: Number(raw?.followerGrowthRate) || 0,
    previousTrend: raw?.previousTrend || null,
    oneHitWonderExpired: !!raw?.oneHitWonderExpired,
    phase5: raw?.phase5 || null,
  };
}

// ─── Legacy Compat Exports ─────────────────────────────────────────────────

/** Legacy threshold map — kept for backward compatibility but no longer used for scoring */
export const TREND_THRESHOLDS: Record<string, { enter: number; exit: number; minHold: number }> = Object.fromEntries(
  CAREER_TRENDS.map(t => [t, { enter: 0.5, exit: 0.5, minHold: MIN_HOLD[t] }])
);

export function buildTrendSignals(input: any): TrendSignals {
  return buildSignals(normalizeInput(input));
}
