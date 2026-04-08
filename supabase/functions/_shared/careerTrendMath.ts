/**
 * CAREER TREND MATH — Pure, deterministic trend computation
 * 
 * All functions are pure: no DB access, no side effects.
 * Deterministic: same inputs always produce same outputs.
 * Hysteresis: trends are sticky once entered; exit thresholds are stricter.
 */

// ─── Canonical Trend Names ──────────────────────────────────────────────────
export const TREND_NAMES = [
  'STABLE',
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
] as const;

export type TrendName = typeof TREND_NAMES[number];

// ─── Lookback Windows (turns) ───────────────────────────────────────────────
/** Long window for most trend signals */
export const WINDOW_LONG = 12;
/** Short window for momentum / slump detection */
export const WINDOW_SHORT = 4;
/** Chart-specific window */
export const WINDOW_CHART = 8;

// ─── Input Types ────────────────────────────────────────────────────────────

export interface ChartRow {
  release_id: string;
  artist_id: string;
  chart_type: string;
  current_position: number;
  peak_position: number;
  weeks_on_chart: number;
  turn_entered: number;
  turn_last_updated: number;
  chart_score: number;
  chart_momentum?: string;
}

export interface ReleaseRow {
  id: string;
  artist_id: string;
  lifecycle_state?: string;
  lifetime_streams?: number;
  scheduled_turn?: number;
  created_at?: string;
}

export interface SocialSignals {
  total_views_recent?: number;
  total_followers_recent?: number;
  follower_growth_rate?: number;
  posts_count_recent?: number;
  has_viral_post?: boolean;
  runaway_active?: boolean;
}

export interface EraData {
  is_flop?: boolean;
  is_one_hit?: boolean;
  is_active?: boolean;
  phase?: string;
  momentum?: number;
}

export interface PlayerData {
  id: string;
  hype?: number;
  clout?: number;
  followers?: number;
  consecutive_decline_turns?: number;
  career_stage?: string;
  pending_stage_order?: number;
}

export interface FanProfileData {
  monthly_listeners?: number;
  last_monthly_listeners?: number;
  stans?: number;
  core?: number;
  casual?: number;
  trend?: number;
  archetypes?: Record<string, number>;
  career_trends?: Record<string, boolean>;
}

export interface TrendComputeInput {
  player: PlayerData;
  fanProfile: FanProfileData;
  chartsWindow: ChartRow[];
  releasesWindow: ReleaseRow[];
  socialSignals: SocialSignals;
  eraData: EraData;
  globalTurnId: number;
}

export interface TrendComputeResult {
  trends: Record<TrendName, boolean>;
  scores: Record<TrendName, number>;
  modifiers: Record<string, number>;
  reason: Record<string, any>;
}

// ─── Hysteresis Rule ────────────────────────────────────────────────────────

export interface HysteresisRule {
  enterThreshold: number;
  exitThreshold: number;
  minDurationTurns: number;
}

export const HYSTERESIS_RULES: Record<TrendName, HysteresisRule> = {
  STABLE:           { enterThreshold: 0.00, exitThreshold: 0.00, minDurationTurns: 0 },
  DORMANT:          { enterThreshold: 0.65, exitThreshold: 0.35, minDurationTurns: 50 },
  FORGOTTEN:        { enterThreshold: 0.65, exitThreshold: 0.35, minDurationTurns: 50 },
  LEGACY_ARTIST:    { enterThreshold: 0.60, exitThreshold: 0.30, minDurationTurns: 60 },
  PASSED_PRIME:     { enterThreshold: 0.60, exitThreshold: 0.30, minDurationTurns: 55 },
  ONE_HIT_WONDER:   { enterThreshold: 0.60, exitThreshold: 0.30, minDurationTurns: 60 },
  VIRAL_SENSATION:  { enterThreshold: 0.65, exitThreshold: 0.30, minDurationTurns: 50 },
  COMEBACK:         { enterThreshold: 0.60, exitThreshold: 0.30, minDurationTurns: 55 },
  CAREER_SLUMP:     { enterThreshold: 0.55, exitThreshold: 0.30, minDurationTurns: 50 },
  FLOP_ERA:         { enterThreshold: 0.55, exitThreshold: 0.25, minDurationTurns: 50 },
  GOAT:             { enterThreshold: 0.80, exitThreshold: 0.40, minDurationTurns: 75 },
};

// ─── Derived Metrics (all null-safe) ────────────────────────────────────────

export function chartPresenceRate(charts: ChartRow[], globalTurnId: number, window: number = WINDOW_CHART): number {
  if (window <= 0) return 0;
  const cutoff = globalTurnId - window;
  const turnsWithChart = new Set<number>();
  for (const c of charts) {
    if (c.turn_last_updated > cutoff) {
      turnsWithChart.add(c.turn_last_updated);
    }
  }
  return turnsWithChart.size / window;
}

export function bestPositionRecent(charts: ChartRow[], globalTurnId: number, window: number = WINDOW_CHART): number | null {
  const cutoff = globalTurnId - window;
  let best: number | null = null;
  for (const c of charts) {
    if (c.turn_last_updated > cutoff) {
      if (best === null || c.current_position < best) {
        best = c.current_position;
      }
    }
  }
  return best;
}

export function avgChartScoreRecent(charts: ChartRow[], globalTurnId: number, window: number = WINDOW_CHART): number {
  const cutoff = globalTurnId - window;
  const scores: number[] = [];
  for (const c of charts) {
    if (c.turn_last_updated > cutoff && c.chart_score > 0) {
      scores.push(c.chart_score);
    }
  }
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function maxWeeksOnChartRecent(charts: ChartRow[], globalTurnId: number, window: number = WINDOW_CHART): number {
  const cutoff = globalTurnId - window;
  let maxWeeks = 0;
  for (const c of charts) {
    if (c.turn_last_updated > cutoff && c.weeks_on_chart > maxWeeks) {
      maxWeeks = c.weeks_on_chart;
    }
  }
  return maxWeeks;
}

export function releaseCadence(releases: ReleaseRow[], globalTurnId: number, window: number = WINDOW_LONG): { count: number; turnsSinceLast: number } {
  const cutoff = globalTurnId - window;
  let count = 0;
  let latestTurn = 0;
  for (const r of releases) {
    const turn = r.scheduled_turn || 0;
    if (turn > cutoff) {
      count++;
      if (turn > latestTurn) latestTurn = turn;
    }
  }
  const turnsSinceLast = latestTurn > 0 ? globalTurnId - latestTurn : window + 1;
  return { count, turnsSinceLast };
}

export function listenerVelocity(fanProfile: FanProfileData): number | null {
  const current = fanProfile.monthly_listeners ?? 0;
  const previous = fanProfile.last_monthly_listeners ?? 0;
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

export function stageOrder(player: PlayerData): number {
  return player.pending_stage_order ?? 1;
}

// ─── Individual Trend Scorers (0..1) ────────────────────────────────────────

export function scoreDormant(input: TrendComputeInput): number {
  const { chartsWindow, releasesWindow, socialSignals, player, globalTurnId } = input;
  const cadence = releaseCadence(releasesWindow, globalTurnId, WINDOW_LONG);
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_CHART);
  const socialActive = (socialSignals.posts_count_recent ?? 0) > 0;

  let score = 0;
  // No releases in long window
  if (cadence.count === 0) score += 0.40;
  else if (cadence.count <= 1 && cadence.turnsSinceLast > 8) score += 0.15;

  // No chart presence
  if (chartRate === 0) score += 0.30;
  else if (chartRate < 0.1) score += 0.10;

  // No social activity
  if (!socialActive && (socialSignals.total_views_recent ?? 0) < 100) score += 0.20;

  // Low hype
  if ((player.hype ?? 0) < 10) score += 0.10;

  return clamp01(score);
}

export function scoreOneHitWonder(input: TrendComputeInput): number {
  const { chartsWindow, releasesWindow, globalTurnId } = input;
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_CHART);
  const bestPos = bestPositionRecent(chartsWindow, globalTurnId, WINDOW_LONG);
  const avgScore = avgChartScoreRecent(chartsWindow, globalTurnId, WINDOW_LONG);
  const cadence = releaseCadence(releasesWindow, globalTurnId, WINDOW_LONG);

  let score = 0;

  // Had a peak recently
  if (bestPos !== null && bestPos <= 20) score += 0.30;
  else if (bestPos !== null && bestPos <= 50) score += 0.15;
  else if (avgScore > 200) score += 0.10;

  // But chart presence dropped
  if (chartRate < 0.25) score += 0.25;
  else if (chartRate < 0.40) score += 0.10;

  // Low release cadence (didn't follow up)
  if (cadence.count <= 1) score += 0.25;
  else if (cadence.count <= 2) score += 0.10;

  // Era one-hit flag
  if (input.eraData.is_one_hit) score += 0.20;

  return clamp01(score);
}

export function scoreViralSensation(input: TrendComputeInput): number {
  const { socialSignals, chartsWindow, player, globalTurnId } = input;

  let score = 0;

  // Social spike
  if (socialSignals.has_viral_post) score += 0.35;
  if (socialSignals.runaway_active) score += 0.25;
  if ((socialSignals.follower_growth_rate ?? 0) > 0.20) score += 0.15;
  else if ((socialSignals.follower_growth_rate ?? 0) > 0.05) score += 0.05;

  // Chart reactivity (score jump)
  const avgScore = avgChartScoreRecent(chartsWindow, globalTurnId, WINDOW_SHORT);
  if (avgScore > 500) score += 0.15;
  else if (avgScore > 200) score += 0.05;

  // High views
  if ((socialSignals.total_views_recent ?? 0) > 50000) score += 0.10;

  return clamp01(score);
}

export function scoreComeback(input: TrendComputeInput): number {
  const { player, chartsWindow, fanProfile, globalTurnId } = input;
  const prevTrends = fanProfile.career_trends ?? {};
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_CHART);
  const avgScore = avgChartScoreRecent(chartsWindow, globalTurnId, WINDOW_SHORT);

  let score = 0;

  // Previously in slump or flop
  const wasSlumping = prevTrends['CAREER_SLUMP'] === true || prevTrends['FLOP_ERA'] === true;
  if (wasSlumping) score += 0.30;

  // Now showing improvement
  if (chartRate >= 0.5) score += 0.20;
  else if (chartRate >= 0.25) score += 0.10;

  // Decline turns resetting
  if ((player.consecutive_decline_turns ?? 0) === 0 && wasSlumping) score += 0.15;

  // Hype rising
  if ((player.hype ?? 0) >= 40) score += 0.10;

  // Chart score uptrend
  if (avgScore > 150) score += 0.10;

  // Listener velocity positive
  const velocity = listenerVelocity(fanProfile);
  if (velocity !== null && velocity > 0.05) score += 0.15;

  return clamp01(score);
}

export function scoreCareerSlump(input: TrendComputeInput): number {
  const { player, chartsWindow, fanProfile, eraData, globalTurnId } = input;
  const declineTurns = player.consecutive_decline_turns ?? 0;
  const avgScore = avgChartScoreRecent(chartsWindow, globalTurnId, WINDOW_SHORT);
  const prevAvgScore = avgChartScoreRecent(chartsWindow, globalTurnId - WINDOW_SHORT, WINDOW_SHORT);

  let score = 0;

  // Consecutive decline
  if (declineTurns >= 4) score += 0.35;
  else if (declineTurns >= 2) score += 0.20;

  // Chart score downtrend
  if (prevAvgScore > 0 && avgScore < prevAvgScore * 0.7) score += 0.20;
  else if (prevAvgScore > 0 && avgScore < prevAvgScore * 0.85) score += 0.10;

  // Low hype
  if ((player.hype ?? 0) < 25) score += 0.15;

  // Listener velocity negative
  const velocity = listenerVelocity(fanProfile);
  if (velocity !== null && velocity < -0.10) score += 0.15;
  else if (velocity !== null && velocity < -0.03) score += 0.05;

  // Era flop flags
  if (eraData.is_flop) score += 0.15;

  return clamp01(score);
}

export function scoreFlopEra(input: TrendComputeInput): number {
  const { eraData, chartsWindow, releasesWindow, player, globalTurnId } = input;
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_CHART);

  let score = 0;

  // Era flagged as flop
  if (eraData.is_flop) score += 0.40;

  // Multiple underperforming releases
  // Plan 016 §7.6 — prefer final_outcome_class when set; fall back to lifecycle_state
  const recentReleases = releasesWindow.filter(r => {
    const turn = r.scheduled_turn ?? 0;
    return turn > globalTurnId - WINDOW_LONG;
  });
  const decliningReleases = recentReleases.filter(r => {
    const outcome = (r as any).final_outcome_class ?? r.lifecycle_state;
    return outcome === 'Declining' || outcome === 'Archived' || outcome === 'Flop';
  });
  if (recentReleases.length >= 2 && decliningReleases.length >= 2) score += 0.25;
  else if (decliningReleases.length >= 1) score += 0.10;

  // Negative momentum
  if ((eraData.momentum ?? 0) < -10) score += 0.15;

  // Low chart presence
  if (chartRate < 0.15) score += 0.10;

  // Low hype
  if ((player.hype ?? 0) < 20) score += 0.10;

  return clamp01(score);
}

export function scoreGoat(input: TrendComputeInput): number {
  const { chartsWindow, player, globalTurnId } = input;
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_LONG);
  const bestPos = bestPositionRecent(chartsWindow, globalTurnId, WINDOW_LONG);
  const clout = player.clout ?? 0;
  const maxWeeks = maxWeeksOnChartRecent(chartsWindow, globalTurnId, WINDOW_LONG);

  let score = 0;

  // Sustained chart dominance
  if (chartRate >= 0.75) score += 0.30;
  else if (chartRate >= 0.50) score += 0.15;

  // Top positions
  if (bestPos !== null && bestPos <= 5) score += 0.25;
  else if (bestPos !== null && bestPos <= 15) score += 0.10;

  // High clout
  if (clout >= 2000) score += 0.20;
  else if (clout >= 1000) score += 0.10;

  // Long chart runs
  if (maxWeeks >= 8) score += 0.15;
  else if (maxWeeks >= 4) score += 0.05;

  // High hype sustained
  if ((player.hype ?? 0) >= 80) score += 0.10;

  return clamp01(score);
}

export function scoreLegacyArtist(input: TrendComputeInput): number {
  const { player, fanProfile } = input;
  const order = stageOrder(player);
  const stansWeight = clamp01(N(fanProfile.stans) / 100);
  const loyalBaseWeight = clamp01(N(fanProfile.core) / 100);

  let score = 0;

  // Late career stage
  if (order >= 7) score += 0.30;
  else if (order >= 5) score += 0.15;

  // Sustained audience (high stans + core = loyal base)
  if (stansWeight >= 0.25) score += 0.20;
  else if (stansWeight >= 0.15) score += 0.10;

  if (loyalBaseWeight >= 0.20) score += 0.15;

  // High clout
  if ((player.clout ?? 0) >= 1500) score += 0.15;
  else if ((player.clout ?? 0) >= 500) score += 0.05;

  // Not volatile (low hype variance is implicit — we check moderate hype)
  if ((player.hype ?? 0) >= 30 && (player.hype ?? 0) <= 70) score += 0.10;

  // Has followers
  if ((player.followers ?? 0) >= 5000) score += 0.10;

  return clamp01(score);
}

export function scorePassedPrime(input: TrendComputeInput): number {
  const { player, chartsWindow, fanProfile, globalTurnId } = input;
  const order = stageOrder(player);
  const declineTurns = player.consecutive_decline_turns ?? 0;
  const chartRate = chartPresenceRate(chartsWindow, globalTurnId, WINDOW_CHART);

  let score = 0;

  // Late stage
  if (order >= 6) score += 0.25;
  else if (order >= 4) score += 0.10;

  // Persistent declines
  if (declineTurns >= 4) score += 0.25;
  else if (declineTurns >= 2) score += 0.15;

  // Low chart presence
  if (chartRate < 0.15) score += 0.20;
  else if (chartRate < 0.30) score += 0.10;

  // Listener velocity negative
  const velocity = listenerVelocity(fanProfile);
  if (velocity !== null && velocity < -0.05) score += 0.15;

  // Low hype
  if ((player.hype ?? 0) < 30) score += 0.15;

  return clamp01(score);
}

// ─── Score All Trends ───────────────────────────────────────────────────────

const TREND_SCORERS: Record<TrendName, (input: TrendComputeInput) => number> = {
  STABLE: () => 0,
  DORMANT: scoreDormant,
  FORGOTTEN: scoreDormant, // reuses dormant scorer (legacy compat — real logic is in careerTrendsEngine)
  ONE_HIT_WONDER: scoreOneHitWonder,
  VIRAL_SENSATION: scoreViralSensation,
  COMEBACK: scoreComeback,
  CAREER_SLUMP: scoreCareerSlump,
  FLOP_ERA: scoreFlopEra,
  GOAT: scoreGoat,
  LEGACY_ARTIST: scoreLegacyArtist,
  PASSED_PRIME: scorePassedPrime,
};

export function computeAllScores(input: TrendComputeInput): Record<TrendName, number> {
  const scores = {} as Record<TrendName, number>;
  for (const name of TREND_NAMES) {
    scores[name] = TREND_SCORERS[name](input);
  }
  return scores;
}

// ─── Sanity / Conflict Resolution ───────────────────────────────────────────

/**
 * Enforce mutual exclusion rules.
 * Returns a cleaned trends map. Higher-priority trend wins conflicts.
 */
export function resolveConflicts(trends: Record<TrendName, boolean>): Record<TrendName, boolean> {
  const out = { ...trends };

  // GOAT conflicts with PASSED_PRIME and FLOP_ERA
  if (out.GOAT) {
    out.PASSED_PRIME = false;
    out.FLOP_ERA = false;
    out.CAREER_SLUMP = false;
    out.DORMANT = false;
    out.ONE_HIT_WONDER = false;
  }

  // VIRAL_SENSATION conflicts with DORMANT
  if (out.VIRAL_SENSATION) {
    out.DORMANT = false;
  }

  // DORMANT conflicts with active chart presence (handled by scorer, but enforce)
  // COMEBACK requires prior slump/flop — if neither was true, COMEBACK shouldn't be
  // (This is handled by the scorer using prevTrends, but we double-check)

  // LEGACY_ARTIST can coexist with GOAT (both late-stage prestige)
  // PASSED_PRIME conflicts with COMEBACK (can't be both declining and recovering)
  if (out.COMEBACK) {
    out.PASSED_PRIME = false;
  }

  // FLOP_ERA and CAREER_SLUMP can coexist (flop is era-level, slump is metric-level)
  // but ONE_HIT_WONDER and VIRAL_SENSATION shouldn't coexist
  if (out.VIRAL_SENSATION && out.ONE_HIT_WONDER) {
    // VIRAL takes priority (it's current; OHW is retrospective)
    out.ONE_HIT_WONDER = false;
  }

  return out;
}

// ─── Hysteresis Reducer ─────────────────────────────────────────────────────

/**
 * Apply hysteresis to prevent flip-flopping.
 * prevTrends: the trends from the previous turn (or {} if first run).
 * computedScores: raw 0..1 scores for each trend.
 * turnsSinceEntered: how many turns each trend has been active (0 if not active).
 * Returns the new boolean trend map.
 */
export function trendStateReducer(
  prevTrends: Record<string, boolean>,
  computedScores: Record<TrendName, number>,
  turnsSinceEntered: Record<string, number>
): Record<TrendName, boolean> {
  const next = {} as Record<TrendName, boolean>;

  for (const name of TREND_NAMES) {
    const rule = HYSTERESIS_RULES[name];
    const score = computedScores[name];
    const wasActive = prevTrends[name] === true;
    const activeTurns = turnsSinceEntered[name] ?? 0;

    if (wasActive) {
      // To exit, score must drop below exitThreshold AND min duration must be met
      if (score < rule.exitThreshold && activeTurns >= rule.minDurationTurns) {
        next[name] = false;
      } else {
        next[name] = true; // Stay active (hysteresis)
      }
    } else {
      // To enter, score must exceed enterThreshold
      next[name] = score >= rule.enterThreshold;
    }
  }

  return next;
}

/**
 * Compute turns-since-entered from previous trends and a history of when each trend was first set.
 * For simplicity, we track this via the career_trends field itself + a counter approach.
 * Since we don't store per-trend entry turn in the JSONB, we use a simple heuristic:
 * if the trend was active last turn, increment; otherwise 0.
 */
export function computeTurnsSinceEntered(
  prevTrends: Record<string, boolean>,
  prevModifiers: Record<string, any>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of TREND_NAMES) {
    if (prevTrends[name] === true) {
      counts[name] = ((prevModifiers[`${name}_active_turns`] as number) ?? 0) + 1;
    } else {
      counts[name] = 0;
    }
  }
  return counts;
}

/**
 * Build updated modifiers with active turn counters for hysteresis tracking.
 */
export function buildActiveTurnCounters(
  newTrends: Record<TrendName, boolean>,
  turnsSinceEntered: Record<string, number>
): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const name of TREND_NAMES) {
    if (newTrends[name]) {
      counters[`${name}_active_turns`] = turnsSinceEntered[name] ?? 0;
    }
    // Don't store counters for inactive trends (clean up)
  }
  return counters;
}

// ─── Modifiers ──────────────────────────────────────────────────────────────

export function computeModifiers(trends: Record<TrendName, boolean>, scores: Record<TrendName, number>): Record<string, number> {
  const mods: Record<string, number> = {};

  // Trend visibility: max confidence of any active trend
  const activeScores = TREND_NAMES.filter(n => trends[n]).map(n => scores[n]);
  mods.trend_visibility = activeScores.length > 0 ? Math.max(...activeScores) : 0;

  // Marketing efficiency bonus for VIRAL / COMEBACK
  mods.marketing_efficiency_bonus = 0;
  if (trends.VIRAL_SENSATION) mods.marketing_efficiency_bonus += 0.10;
  if (trends.COMEBACK) mods.marketing_efficiency_bonus += 0.08;

  // Retention bonus for LEGACY / GOAT
  mods.retention_bonus = 0;
  if (trends.LEGACY_ARTIST) mods.retention_bonus += 0.05;
  if (trends.GOAT) mods.retention_bonus += 0.10;

  // Negative modifiers
  mods.revenue_penalty = 0;
  if (trends.CAREER_SLUMP) mods.revenue_penalty -= 0.05;
  if (trends.FLOP_ERA) mods.revenue_penalty -= 0.08;
  if (trends.DORMANT) mods.revenue_penalty -= 0.03;
  if (trends.ONE_HIT_WONDER) mods.revenue_penalty -= 0.04;

  // Follower growth multiplier: suppresses organic discovery for inactive/fading artists
  // Applied in turnProcessorCore to organicGrowth. 1.0 = normal, lower = suppressed.
  mods.follower_growth_mult = 1.0;
  if (trends.ONE_HIT_WONDER) mods.follower_growth_mult -= 0.40;
  if (trends.DORMANT)        mods.follower_growth_mult -= 0.55;
  if (trends.PASSED_PRIME)   mods.follower_growth_mult -= 0.20;
  if (trends.CAREER_SLUMP)   mods.follower_growth_mult -= 0.15;
  mods.follower_growth_mult = Math.max(0.05, mods.follower_growth_mult);

  // Hype decay boost: extra multiplier on top of base hype decay rate
  // Applied in turnProcessorCore. 0 = no extra decay, >0 = faster decay.
  mods.hype_decay_boost = 0;
  if (trends.ONE_HIT_WONDER) mods.hype_decay_boost += 0.40;
  if (trends.DORMANT)        mods.hype_decay_boost += 0.60;
  if (trends.PASSED_PRIME)   mods.hype_decay_boost += 0.25;
  if (trends.CAREER_SLUMP)   mods.hype_decay_boost += 0.15;

  // Listener decay multiplier: used in fansUpdateModule to allow mid-month decline
  // 0 = no extra decay, >0 = monthly_listeners can fall even between month boundaries
  // Values reduced (Feb 27 2026): old rates compounded too aggressively over 30 turns.
  // Combined with computeEffectiveDecayRate cap of 0.02, these are gentle nudges.
  mods.listener_decay_mult = 0;
  if (trends.ONE_HIT_WONDER) mods.listener_decay_mult += 0.008; // -0.8%/turn (~21% over 30 turns)
  if (trends.DORMANT)        mods.listener_decay_mult += 0.012; // -1.2%/turn (~30% over 30 turns)
  if (trends.PASSED_PRIME)   mods.listener_decay_mult += 0.005; // -0.5%/turn (~14% over 30 turns)

  return mods;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function computeCareerTrends(input: TrendComputeInput): TrendComputeResult {
  const prevTrends = (input.fanProfile.career_trends ?? {}) as Record<string, boolean>;
  const prevModifiers = {} as Record<string, any>;

  // Extract active turn counters from previous modifiers stored in career_trend_modifiers
  // (We read from fanProfile but the counters are in a separate field)
  const turnsSinceEntered = computeTurnsSinceEntered(prevTrends, prevModifiers);

  // 1. Compute raw scores
  const scores = computeAllScores(input);

  // 2. Apply hysteresis
  const rawTrends = trendStateReducer(prevTrends, scores, turnsSinceEntered);

  // 3. Resolve conflicts
  const trends = resolveConflicts(rawTrends);

  // 4. Build active turn counters for next iteration
  const activeTurnCounters = buildActiveTurnCounters(trends, turnsSinceEntered);

  // 5. Compute modifiers
  const gameplayModifiers = computeModifiers(trends, scores);

  // 6. Merge modifiers with active turn counters
  const modifiers = { ...gameplayModifiers, ...activeTurnCounters };

  // 7. Build reason snapshot
  const reason: Record<string, any> = {
    chart_presence_rate: chartPresenceRate(input.chartsWindow, input.globalTurnId, WINDOW_CHART),
    best_position_recent: bestPositionRecent(input.chartsWindow, input.globalTurnId, WINDOW_CHART),
    avg_chart_score_recent: avgChartScoreRecent(input.chartsWindow, input.globalTurnId, WINDOW_CHART),
    weeks_on_chart_recent: maxWeeksOnChartRecent(input.chartsWindow, input.globalTurnId, WINDOW_CHART),
    streak_decline_turns: input.player.consecutive_decline_turns ?? 0,
    hype_level: input.player.hype ?? 0,
    clout_level: input.player.clout ?? 0,
    listener_velocity: listenerVelocity(input.fanProfile),
    release_cadence: releaseCadence(input.releasesWindow, input.globalTurnId, WINDOW_LONG),
    stage_order: stageOrder(input.player),
    era_is_flop: input.eraData.is_flop ?? false,
    era_is_one_hit: input.eraData.is_one_hit ?? false,
    social_viral: input.socialSignals.has_viral_post ?? false,
    social_runaway: input.socialSignals.runaway_active ?? false,
  };

  return { trends, scores, modifiers, reason };
}

// ─── Diff Helper ────────────────────────────────────────────────────────────

export function diffTrends(
  prev: Record<string, boolean>,
  next: Record<TrendName, boolean>
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];

  for (const name of TREND_NAMES) {
    const wasTrend = prev[name] === true;
    const isTrend = next[name] === true;
    if (!wasTrend && isTrend) added.push(name);
    if (wasTrend && !isTrend) removed.push(name);
  }

  return { added, removed };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
