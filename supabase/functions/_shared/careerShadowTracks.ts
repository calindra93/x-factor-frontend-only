const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
const N = (value: unknown): number => Number(value) || 0;

export type LaneKey =
  | 'commercial_heat'
  | 'cultural_influence'
  | 'live_draw'
  | 'industry_respect'
  | 'core_fan_devotion';

export type LaneScoreMap = Record<LaneKey, number>;

export interface CareerLaneInput {
  player?: {
    clout?: number;
    hype?: number;
  };
  fanProfile?: {
    monthly_listeners?: number;
    loyalty?: number;
  };
  chartStats?: {
    chartPresenceRate?: number;
    hasTop10?: boolean;
    weeks2Plus?: boolean;
  };
  touring?: {
    regionalDemand?: number;
    reviewScore?: number;
    attendanceRatio?: number;
  };
  era?: {
    momentum?: number;
    identityAlignmentScore?: number;
    isExperimental?: boolean;
  };
  fandom?: {
    loyalty?: number;
    laborStrength?: number;
    controversyResilience?: number;
    retentionStrength?: number;
  };
  industry?: {
    editorialReceptivity?: number;
    industryLeverage?: number;
    brandSafety?: number;
    narrativeHeat?: number;
  };
}

export interface CareerLaneResult {
  scores: LaneScoreMap;
  dominant_lane: LaneKey | null;
  secondary_lane: LaneKey | null;
  proof_summary: string[];
}

function normalizeMonthlyListeners(monthlyListeners: number): number {
  if (monthlyListeners <= 0) return 0;
  if (monthlyListeners >= 1_000_000) return 100;
  return clamp((Math.log10(monthlyListeners + 1) / 6) * 100);
}

function normalizeRatio(ratio: number): number {
  return clamp(ratio * 100);
}

function normalizeRate(rate: number): number {
  return clamp(rate * 100);
}

export function computeDominantLane(scores: LaneScoreMap): { dominant: LaneKey | null; secondary: LaneKey | null } {
  const ordered = Object.entries(scores)
    .map(([lane, score]) => ({ lane: lane as LaneKey, score: N(score) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.lane.localeCompare(b.lane);
    });

  return {
    dominant: ordered[0]?.lane || null,
    secondary: ordered[1]?.lane || null,
  };
}

function buildProofSummary(scores: LaneScoreMap): string[] {
  const proofs: string[] = [];

  if (scores.commercial_heat >= 70) proofs.push('chart_breakout');
  if (scores.cultural_influence >= 70) proofs.push('identity_signal');
  if (scores.live_draw >= 70) proofs.push('crowd_turnout');
  if (scores.industry_respect >= 70) proofs.push('industry_validation');
  if (scores.core_fan_devotion >= 70) proofs.push('loyal_core_audience');

  return proofs;
}

export function resolveCareerLanes(input: CareerLaneInput): CareerLaneResult {
  const monthlyListeners = normalizeMonthlyListeners(N(input.fanProfile?.monthly_listeners));
  const chartPresence = normalizeRate(N(input.chartStats?.chartPresenceRate));
  const attendanceRatio = normalizeRatio(N(input.touring?.attendanceRatio));
  const hasTop10 = input.chartStats?.hasTop10 ? 100 : 0;
  const weeks2Plus = input.chartStats?.weeks2Plus ? 100 : 0;
  const reviewScore = clamp(N(input.touring?.reviewScore));
  const regionalDemand = clamp(N(input.touring?.regionalDemand));
  const loyalty = clamp(N(input.fandom?.loyalty || input.fanProfile?.loyalty));
  const laborStrength = clamp(N(input.fandom?.laborStrength));
  const controversyResilience = clamp(N(input.fandom?.controversyResilience));
  const retentionStrength = clamp(N(input.fandom?.retentionStrength));
  const editorialReceptivity = clamp(N(input.industry?.editorialReceptivity));
  const industryLeverage = clamp(N(input.industry?.industryLeverage));
  const brandSafety = clamp(N(input.industry?.brandSafety));
  const narrativeHeat = clamp(N(input.industry?.narrativeHeat));
  const momentum = clamp(N(input.era?.momentum));
  const identityAlignment = clamp(N(input.era?.identityAlignmentScore));
  const hype = clamp(N(input.player?.hype));
  const clout = clamp((Math.log10(N(input.player?.clout) + 1) / 4) * 100);
  const experimentalPenalty = input.era?.isExperimental ? 8 : 0;

  const scores: LaneScoreMap = {
    commercial_heat: clamp(
      monthlyListeners * 0.35
      + chartPresence * 0.2
      + hasTop10 * 0.15
      + weeks2Plus * 0.1
      + hype * 0.1
      + clout * 0.1,
    ),
    cultural_influence: clamp(
      identityAlignment * 0.35
      + editorialReceptivity * 0.2
      + momentum * 0.2
      + narrativeHeat * 0.15
      + loyalty * 0.1
      - experimentalPenalty,
    ),
    live_draw: clamp(
      attendanceRatio * 0.4
      + reviewScore * 0.3
      + regionalDemand * 0.2
      + loyalty * 0.1,
    ),
    industry_respect: clamp(
      industryLeverage * 0.35
      + editorialReceptivity * 0.25
      + brandSafety * 0.2
      + clout * 0.1
      + momentum * 0.1,
    ),
    core_fan_devotion: clamp(
      loyalty * 0.35
      + laborStrength * 0.2
      + controversyResilience * 0.2
      + retentionStrength * 0.2
      + attendanceRatio * 0.05,
    ),
  };

  const dominant = computeDominantLane(scores);

  return {
    scores,
    dominant_lane: dominant.dominant,
    secondary_lane: dominant.secondary,
    proof_summary: buildProofSummary(scores),
  };
}
