const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
const N = (value: unknown): number => Number(value) || 0;

export interface CareerConversionInput {
  attention?: {
    commercialHeat?: number;
    chartPresenceRate?: number;
    monthlyListeners?: number;
    narrativeHeat?: number;
  };
  identity?: {
    culturalInfluence?: number;
    identityAlignment?: number;
    editorialReceptivity?: number;
  };
  fandom?: {
    coreFanDevotion?: number;
    loyalty?: number;
    laborStrength?: number;
    audienceDepth?: number;
  };
  outcomes?: {
    liveDraw?: number;
    attendanceRatio?: number;
    spendingPower?: number;
    resilience?: number;
  };
}

export interface CareerConversionResult {
  stages: {
    attention: number;
    identity_buy_in: number;
    fan_loyalty: number;
    turnout_spending_resilience: number;
  };
  proof_summary: string[];
}

function normalizeMonthlyListeners(monthlyListeners: number): number {
  if (monthlyListeners <= 0) return 0;
  if (monthlyListeners >= 1_000_000) return 100;
  return clamp((Math.log10(monthlyListeners + 1) / 6) * 100);
}

function normalizeRate(rate: number): number {
  return clamp(rate * 100);
}

export function resolveCareerConversion(input: CareerConversionInput): CareerConversionResult {
  const attentionBase = clamp(
    N(input.attention?.commercialHeat) * 0.45
    + normalizeRate(N(input.attention?.chartPresenceRate)) * 0.2
    + normalizeMonthlyListeners(N(input.attention?.monthlyListeners)) * 0.2
    + N(input.attention?.narrativeHeat) * 0.15,
  );

  const identityBuyIn = clamp(
    attentionBase * 0.35
    + N(input.identity?.culturalInfluence) * 0.3
    + N(input.identity?.identityAlignment) * 0.25
    + N(input.identity?.editorialReceptivity) * 0.1,
  );

  const fanLoyalty = clamp(
    identityBuyIn * 0.3
    + N(input.fandom?.coreFanDevotion) * 0.25
    + N(input.fandom?.loyalty) * 0.2
    + N(input.fandom?.laborStrength) * 0.1
    + N(input.fandom?.audienceDepth) * 0.15,
  );

  const turnout = clamp(
    fanLoyalty * 0.35
    + N(input.outcomes?.liveDraw) * 0.25
    + normalizeRate(N(input.outcomes?.attendanceRatio)) * 0.15
    + N(input.outcomes?.spendingPower) * 0.1
    + N(input.outcomes?.resilience) * 0.15,
  );

  const proof_summary: string[] = [];
  if (attentionBase >= 60) proof_summary.push('attention_converted');
  if (identityBuyIn >= 65) proof_summary.push('identity_sticks');
  if (fanLoyalty >= 65 || turnout >= 65) proof_summary.push('loyalty_pays_off');

  return {
    stages: {
      attention: attentionBase,
      identity_buy_in: identityBuyIn,
      fan_loyalty: fanLoyalty,
      turnout_spending_resilience: turnout,
    },
    proof_summary,
  };
}
