const N = (v: unknown): number => Number(v) || 0;
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export function computeFollowerChurnLoss(currentFollowers: number, inputs: {
  sentimentChurnDelta?: number;
  retentionMultAdj?: number;
  trendFollowerGrowthMult?: number;
  consecutiveDeclineTurns?: number;
  listenerGrowthTrendPct?: number;
  inGracePeriod?: boolean;
  postGraceDecayRate?: number;
} = {}): { churnRate: number; loss: number } {
  const followers = Math.max(0, Math.floor(N(currentFollowers)));
  if (followers <= 0) return { churnRate: 0, loss: 0 };

  // During grace period: no churn from decline/inactivity pressure at all.
  // Only sentiment-based churn (controversies, scandals) still applies — that's event-driven, not inactivity.
  if (inputs.inGracePeriod) {
    const sentimentOnly = Math.max(0, N(inputs.sentimentChurnDelta));
    const churnRate = clamp(sentimentOnly, 0, 0.01);
    return { churnRate, loss: Math.floor(followers * churnRate) };
  }

  // Post-grace: use the gentle unified decay rate instead of compounding pressures
  const sentimentPressure = Math.max(0, N(inputs.sentimentChurnDelta));
  const postGraceDecay = N(inputs.postGraceDecayRate);

  const churnRate = clamp(
    sentimentPressure + postGraceDecay,
    0,
    0.003, // Hard cap 0.3%/turn post-grace (was 3% — 10x gentler)
  );

  return {
    churnRate,
    loss: Math.floor(followers * churnRate),
  };
}

export function computeSocialFollowerChurn(currentFollowers: number, input: {
  sentimentChurnDelta?: number;
  retentionMultAdj?: number;
  stabilityDampeningMult?: number;
  hype?: number;
} = {}): { churnRate: number; churnLoss: number } {
  const followers = Math.max(0, Math.floor(N(currentFollowers)));
  if (followers <= 0) return { churnRate: 0, churnLoss: 0 };

  const sentimentPressure = Math.max(0, Number(input.sentimentChurnDelta) || 0);
  const retentionPressure = Math.max(0, 1 - (Number(input.retentionMultAdj) || 1));
  const stabilityPressure = Math.max(0, 1 - (Number(input.stabilityDampeningMult) || 1));
  const hype = Number(input.hype) || 0;
  const hypePressure = hype < 35 ? ((35 - hype) / 35) * 0.004 : 0;

  const churnRate = Math.max(0, Math.min(0.02,
    sentimentPressure * 0.35
    + retentionPressure * 0.08
    + stabilityPressure * 0.04
    + hypePressure,
  ));

  return {
    churnRate,
    churnLoss: Math.floor(followers * churnRate),
  };
}
