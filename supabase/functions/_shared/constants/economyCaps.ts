export const SOCIAL_VIRAL_CAPS = {
  followerGainPerTurn: { vidwave: 12000, looptok: 16000, instavibe: 9000, xpress: 7000 },
  backlogViewsPerTurn: { vidwave: 2_000_000, looptok: 2_500_000, instavibe: 1_200_000, xpress: 900_000 },
  payoutRevenuePerTurnByPost: 12_000,
  payoutRevenuePerTurnByPlayer: 30_000,
  payoutImpressionsPerTurnByPost: 1_000_000,
  payoutViewsPerTurnByPost: 500_000,
} as const;

export const ECONOMY_DELTA_LARGE_THRESHOLDS = {
  followers: Number(Deno.env.get('ECONOMY_DELTA_FOLLOWERS_THRESHOLD') || 50000),
  clout: Number(Deno.env.get('ECONOMY_DELTA_CLOUT_THRESHOLD') || 1000),
  money: Number(Deno.env.get('ECONOMY_DELTA_MONEY_THRESHOLD') || 100000),
} as const;
