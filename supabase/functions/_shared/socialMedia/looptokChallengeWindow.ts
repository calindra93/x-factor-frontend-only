export const LOOPTOK_TREND_WINDOW = 12;
export const LOOPTOK_CHALLENGE_WINDOW = 36;

export function getLoopTokChallengeBatch(currentTurnId: number): number {
  const safeTurn = Math.max(0, Number(currentTurnId) || 0);
  return Math.floor(safeTurn / LOOPTOK_CHALLENGE_WINDOW) % 5;
}

export function getCurrentLoopTokChallengeWindow(currentTurnId: number): {
  batch: number;
  startTurn: number;
  endTurn: number;
} {
  const safeTurn = Math.max(0, Number(currentTurnId) || 0);
  const startTurn = Math.floor(safeTurn / LOOPTOK_CHALLENGE_WINDOW) * LOOPTOK_CHALLENGE_WINDOW;
  return {
    batch: getLoopTokChallengeBatch(safeTurn),
    startTurn,
    endTurn: startTurn + LOOPTOK_CHALLENGE_WINDOW - 1,
  };
}

export function isLoopTokChallengeActive(challenge: Record<string, any>, currentTurnId: number): boolean {
  const safeTurn = Math.max(0, Number(currentTurnId) || 0);
  if (challenge?.is_active === false) return false;

  if (challenge?.is_pool_challenge) {
    return Number(challenge?.pool_batch) === getLoopTokChallengeBatch(safeTurn);
  }

  const startTurn = Number(challenge?.start_turn) || 0;
  const endTurn = Number(challenge?.end_turn) || 0;
  return safeTurn >= startTurn && safeTurn <= endTurn;
}

export function hydrateLoopTokChallengeWindow<T extends Record<string, any>>(challenge: T, currentTurnId: number): T & {
  effective_start_turn: number;
  effective_end_turn: number;
  turns_remaining: number;
  is_currently_active: boolean;
} {
  const safeTurn = Math.max(0, Number(currentTurnId) || 0);
  const isPoolChallenge = Boolean(challenge?.is_pool_challenge);
  const window = isPoolChallenge
    ? getCurrentLoopTokChallengeWindow(safeTurn)
    : {
        batch: Number(challenge?.pool_batch) || 0,
        startTurn: Number(challenge?.start_turn) || 0,
        endTurn: Number(challenge?.end_turn) || 0,
      };

  const isCurrentlyActive = isPoolChallenge
    ? Number(challenge?.pool_batch) === window.batch && challenge?.is_active !== false
    : isLoopTokChallengeActive(challenge, safeTurn);

  return {
    ...challenge,
    effective_start_turn: window.startTurn,
    effective_end_turn: window.endTurn,
    turns_remaining: Math.max(0, window.endTurn - safeTurn),
    is_currently_active: isCurrentlyActive,
  };
}
