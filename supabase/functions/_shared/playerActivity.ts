/**
 * PLAYER ACTIVITY — Unified single source of truth for "is this player active?"
 *
 * Consumed by: fandomSegmentsModule, fandomSegmentsEngine, turnScheduler,
 *              followerChurn, careerProgressionPipeline, fansUpdateModule
 *
 * Any game activity resets the inactivity clock. 336-turn grace period before
 * any punitive decay begins. After grace: gentle linear decay, no compounding.
 */

const N = (v: unknown): number => Number(v) || 0;

const GRACE_PERIOD_TURNS = 336; // ~48 in-game weeks

export interface PlayerActivityResult {
  isActive: boolean;           // ANY game activity this turn
  activityScore: number;       // 0-1 weighted score (for logging/future use)
  turnsSinceActivity: number;  // globalTurnId - last_active_turn
  inGracePeriod: boolean;      // turnsSinceActivity < GRACE_PERIOD_TURNS
  postGraceDecayRate: number;  // 0 during grace, gentle ramp after
}

export interface PlayerActivityInputs {
  // From releases query
  hasActiveRelease: boolean;       // any release in Hot/Stable/Trending/Momentum
  // From summary/deltas (accumulated during turn processing)
  streamsEarned: number;
  socialPostsCreated: number;
  gigsCompleted: number;
  brandDealActive: boolean;        // any active brand deal contract
  festivalActive: boolean;         // submission, lineup slot, or performance
  merchActivelySelling: boolean;   // merch with status=Active and stock > 0
  eraActionExecuted: boolean;
  releasesActivated: number;       // new releases going live this turn
  looptokPostsCreated: number;
  // From profile
  lastActiveTurn: number;          // profiles.last_active_turn
  globalTurnId: number;
}

export function computePlayerActivity(inputs: PlayerActivityInputs): PlayerActivityResult {
  const {
    hasActiveRelease,
    streamsEarned,
    socialPostsCreated,
    gigsCompleted,
    brandDealActive,
    festivalActive,
    merchActivelySelling,
    eraActionExecuted,
    releasesActivated,
    looptokPostsCreated,
    lastActiveTurn,
    globalTurnId,
  } = inputs;

  // Any single signal = player is active
  const isActive =
    hasActiveRelease ||
    N(streamsEarned) > 0 ||
    N(socialPostsCreated) > 0 ||
    N(gigsCompleted) > 0 ||
    brandDealActive ||
    festivalActive ||
    merchActivelySelling ||
    eraActionExecuted ||
    N(releasesActivated) > 0 ||
    N(looptokPostsCreated) > 0;

  // Activity score: 0-1 weighted sum (primarily for logging/diagnostics)
  let score = 0;
  if (hasActiveRelease) score += 0.3;
  if (N(streamsEarned) > 0) score += 0.2;
  if (N(socialPostsCreated) > 0) score += 0.1;
  if (N(gigsCompleted) > 0) score += 0.15;
  if (brandDealActive) score += 0.1;
  if (festivalActive) score += 0.1;
  if (merchActivelySelling) score += 0.05;
  if (eraActionExecuted) score += 0.05;
  if (N(releasesActivated) > 0) score += 0.2;
  if (N(looptokPostsCreated) > 0) score += 0.1;
  const activityScore = Math.min(1, score);

  // Turns since last activity
  const effectiveLastActive = isActive ? globalTurnId : (lastActiveTurn || 0);
  const turnsSinceActivity = Math.max(0, globalTurnId - effectiveLastActive);

  const inGracePeriod = turnsSinceActivity < GRACE_PERIOD_TURNS;

  // Post-grace decay rate: gentle linear ramp, hard-capped at 0.15%/turn
  let postGraceDecayRate = 0;
  if (!inGracePeriod) {
    const turnsOverGrace = turnsSinceActivity - GRACE_PERIOD_TURNS;
    if (turnsOverGrace <= 64) {
      postGraceDecayRate = 0.0005; // 0.05%/turn for first 64 turns post-grace
    } else if (turnsOverGrace <= 164) {
      postGraceDecayRate = 0.001;  // 0.1%/turn for next 100 turns
    } else {
      postGraceDecayRate = 0.0015; // 0.15%/turn hard cap
    }
  }

  return {
    isActive,
    activityScore,
    turnsSinceActivity,
    inGracePeriod,
    postGraceDecayRate,
  };
}

export { GRACE_PERIOD_TURNS };
