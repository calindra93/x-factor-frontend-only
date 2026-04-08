import { clamp as clampBase } from './fandomModifiers.ts';
import type { AudienceModifiers } from './sentimentModifiers.ts';

const N = (v: unknown): number => Number(v) || 0;
export const clamp = (v: number, min = 0, max = 100): number => Math.max(min, Math.min(max, v));

export const FAN_LENS_LABELS = [
  'Cult Leader',
  'Loyal Underdog',
  'Chart Army',
  'Internet Phenomenon',
  'Anti-Establishment Icon',
  'Meme-Fueled Star',
  'Comeback Hero',
  'Fandom in Crisis',
  'Cultural Movement',
] as const;

export const PRESS_LENS_LABELS = [
  'Critically Acclaimed',
  'Risk-Taker',
  'Reinvention Arc',
  'Sophomore Slump',
  'Overexposed',
  'Manufactured Pop',
  'Genre Trailblazer',
  'Commercial Sellout',
  'Cultural Commentator',
] as const;

export const INDUSTRY_LENS_LABELS = [
  'Bankable Star',
  'High Risk Asset',
  'Cultural Asset',
  'Market Disruptor',
  'Brand Liability',
  'Reliable Performer',
  'Industry Plant Allegations',
  'Corporate Favorite',
  'Unproven Prospect',
] as const;

type Label = typeof FAN_LENS_LABELS[number] | typeof PRESS_LENS_LABELS[number] | typeof INDUSTRY_LENS_LABELS[number];
type Lens = 'fan' | 'press' | 'industry';

export type IndustryPerceptionInputs = {
  community: number;
  rolling_readiness: number;
  fan_war_win_rate: number;
  clout: number;
  authenticity: number;
  glamour: number;
  rebellion: number;
  tension: number;
  volatility: number;
  massReceptivity?: number;
  chart_consistency: number;
  low_chart_dominance_factor: number;
  resurgence_flag: number;
  readiness_growth_rate: number;
  critics_adjacent_percentage: number;
  editorialReceptivity?: number;
  experimental_flag: number;
  pivot_shock: number;
  rolling_alignment_shift: number;
  pressHeat_delta: number;
  narrativeHeat?: number;
  declining_chart_trend: number;
  declining_readiness: number;
  career_stage_transition: number;
  brandSafety?: number;
  low_brandSafety?: number;
  industryLeverage?: number;
  rapid_clout_growth: number;
  low_authenticity: number;
  chart_stability: number;
  moderate_narrativeHeat: number;
  meme_velocity: number;
  crisis_signal: number;
  cultural_momentum: number;
  overexposure_signal: number;
  commercial_bias: number;
  commentary_signal: number;
  disruption_signal: number;
  corporate_support: number;
  unproven_signal: number;
  defense_mitigation: number;
  trend_chasers_percentage: number;
  prestige_platform_usage: number;
  brand_roster_strength: number;
  career_stage_factor: number;
  engagementReadiness: number;
};

export interface LensResult { lens: Lens; label: Label; score: number; }
export interface ControversyArcState {
  active: boolean;
  intensity: number;
  volatilityBoost: number;
  narrativeHeatSpike: number;
  brandSafetyPenalty: number;
  engagementReadinessBoost: number;
}

export interface IndustryPerceptionModifiers {
  fanLens: LensResult;
  pressLens: LensResult;
  industryLens: LensResult;
  fanScores: Record<string, number>;
  pressScores: Record<string, number>;
  industryScores: Record<string, number>;
  fanHeat: number;
  pressHeat: number;
  industryHeat: number;
  narrativeHeat: number;
  brandSafety: number;
  editorialReceptivity: number;
  massReceptivity: number;
  industryLeverage: number;
  controversyArc: ControversyArcState;
  influenceCaps: {
    maxInfluenceDeltaPct: number;
    chartInfluenceMult: number;
    socialInfluenceMult: number;
    brandDealsInfluenceMult: number;
    volatilityDampeningMult: number;
    alignmentRecoveryMult: number;
    flopRecoveryMult: number;
    negotiationMult: number;
  };
}

const POSITIVE_LABELS = new Set<Label>([
  'Cult Leader', 'Loyal Underdog', 'Chart Army', 'Internet Phenomenon', 'Comeback Hero', 'Cultural Movement',
  'Critically Acclaimed', 'Risk-Taker', 'Reinvention Arc', 'Genre Trailblazer', 'Cultural Commentator',
  'Bankable Star', 'Cultural Asset', 'Market Disruptor', 'Reliable Performer', 'Corporate Favorite'
]);

const MUTUAL_EXCLUSIONS: Array<[Label, Label]> = [
  ['Critically Acclaimed', 'Manufactured Pop'],
  ['Bankable Star', 'Brand Liability'],
  ['Cult Leader', 'Fandom in Crisis'],
  ['Risk-Taker', 'Reliable Performer'],
];

function pickWinner(lens: Lens, scores: Record<string, number>, volatility: number): LensResult {
  const ordered = Object.entries(scores)
    .map(([label, score]) => ({ label: label as Label, score: clamp(score) }))
    .sort((a, b) => b.score - a.score);

  let winner = ordered[0];
  const second = ordered[1];
  if (second && Math.abs(winner.score - second.score) <= 5) {
    const winnerPositive = POSITIVE_LABELS.has(winner.label);
    const secondPositive = POSITIVE_LABELS.has(second.label);
    if (volatility <= 60) {
      if (!winnerPositive && secondPositive) winner = second;
    } else {
      if (winnerPositive && !secondPositive) winner = second;
    }
  }

  for (const [a, b] of MUTUAL_EXCLUSIONS) {
    if (winner.label === a || winner.label === b) {
      const other = winner.label === a ? b : a;
      if (scores[other] != null && scores[other] > winner.score) {
        winner = { label: other, score: clamp(scores[other]) };
      }
    }
  }

  return { lens, label: winner.label, score: Math.round(winner.score) };
}

function fanScores(i: IndustryPerceptionInputs): Record<string, number> {
  return {
    'Cult Leader': 0.4 * i.community + 0.3 * i.rolling_readiness + 0.2 * i.fan_war_win_rate + 0.1 * i.clout,
    'Loyal Underdog': 0.4 * i.community + 0.3 * i.authenticity + 0.3 * i.low_chart_dominance_factor,
    'Chart Army': 0.4 * i.glamour + 0.3 * N(i.massReceptivity) + 0.3 * i.chart_consistency,
    'Internet Phenomenon': 0.5 * i.glamour + 0.3 * i.meme_velocity + 0.2 * i.massReceptivity!,
    'Anti-Establishment Icon': 0.5 * i.rebellion + 0.3 * i.tension + 0.2 * i.volatility,
    'Meme-Fueled Star': 0.5 * i.meme_velocity + 0.3 * i.glamour + 0.2 * i.narrativeHeat!,
    'Comeback Hero': 0.5 * i.resurgence_flag + 0.3 * i.readiness_growth_rate + 0.2 * i.clout,
    'Fandom in Crisis': 0.5 * i.crisis_signal + 0.3 * i.volatility + 0.2 * i.tension,
    'Cultural Movement': 0.4 * i.community + 0.3 * i.authenticity + 0.3 * i.cultural_momentum,
  };
}

function pressScores(i: IndustryPerceptionInputs): Record<string, number> {
  return {
    'Critically Acclaimed': 0.5 * i.authenticity + 0.3 * i.critics_adjacent_percentage + 0.2 * N(i.editorialReceptivity),
    'Risk-Taker': 0.4 * i.rebellion + 0.3 * i.experimental_flag + 0.3 * i.volatility,
    'Reinvention Arc': 0.5 * i.pivot_shock + 0.3 * i.rolling_alignment_shift + 0.2 * i.pressHeat_delta,
    'Sophomore Slump': 0.5 * i.declining_chart_trend + 0.3 * i.declining_readiness + 0.2 * i.career_stage_transition,
    'Overexposed': 0.5 * i.massReceptivity! + 0.3 * i.narrativeHeat! + 0.2 * i.overexposure_signal,
    'Manufactured Pop': 0.4 * i.glamour + 0.3 * i.commercial_bias + 0.3 * i.low_authenticity,
    'Genre Trailblazer': 0.5 * i.experimental_flag + 0.3 * i.authenticity + 0.2 * i.editorialReceptivity!,
    'Commercial Sellout': 0.4 * i.commercial_bias + 0.3 * i.overexposure_signal + 0.3 * i.low_authenticity,
    'Cultural Commentator': 0.4 * i.authenticity + 0.3 * i.commentary_signal + 0.3 * i.editorialReceptivity!,
  };
}

function industryScores(i: IndustryPerceptionInputs): Record<string, number> {
  return {
    'Bankable Star': 0.5 * i.clout + 0.3 * i.chart_consistency + 0.2 * i.brandSafety!,
    'High Risk Asset': 0.4 * i.volatility + 0.3 * i.rebellion + 0.3 * i.low_brandSafety!,
    'Cultural Asset': 0.4 * i.authenticity + 0.3 * i.editorialReceptivity! + 0.3 * i.industryLeverage!,
    'Market Disruptor': 0.5 * i.disruption_signal + 0.3 * i.rebellion + 0.2 * i.industryLeverage!,
    'Brand Liability': 0.5 * i.low_brandSafety! + 0.3 * i.volatility + 0.2 * i.tension,
    'Reliable Performer': 0.5 * i.chart_stability + 0.3 * i.moderate_narrativeHeat + 0.2 * i.brandSafety!,
    'Industry Plant Allegations': 0.4 * i.glamour + 0.3 * i.rapid_clout_growth + 0.3 * i.low_authenticity,
    'Corporate Favorite': 0.5 * i.corporate_support + 0.3 * i.brandSafety! + 0.2 * i.massReceptivity!,
    'Unproven Prospect': 0.5 * i.unproven_signal + 0.3 * i.rapid_clout_growth + 0.2 * i.chart_stability,
  };
}

export function computeIndustryPerceptionModifiers(inputRaw: Partial<IndustryPerceptionInputs>, audienceModifiers: AudienceModifiers | null = null): IndustryPerceptionModifiers {
  const input: IndustryPerceptionInputs = {
    community: clamp(N(inputRaw.community)),
    rolling_readiness: clamp(N(inputRaw.rolling_readiness)),
    fan_war_win_rate: clamp(N(inputRaw.fan_war_win_rate)),
    clout: clamp(N(inputRaw.clout)),
    authenticity: clamp(N(inputRaw.authenticity)),
    glamour: clamp(N(inputRaw.glamour)),
    rebellion: clamp(N(inputRaw.rebellion)),
    tension: clamp(N(inputRaw.tension)),
    volatility: clamp(N(inputRaw.volatility)),
    chart_consistency: clamp(N(inputRaw.chart_consistency)),
    low_chart_dominance_factor: clamp(N(inputRaw.low_chart_dominance_factor)),
    resurgence_flag: clamp(N(inputRaw.resurgence_flag)),
    readiness_growth_rate: clamp(N(inputRaw.readiness_growth_rate)),
    critics_adjacent_percentage: clamp(N(inputRaw.critics_adjacent_percentage)),
    experimental_flag: clamp(N(inputRaw.experimental_flag)),
    pivot_shock: clamp(N(inputRaw.pivot_shock)),
    rolling_alignment_shift: clamp(N(inputRaw.rolling_alignment_shift)),
    pressHeat_delta: clamp(N(inputRaw.pressHeat_delta)),
    declining_chart_trend: clamp(N(inputRaw.declining_chart_trend)),
    declining_readiness: clamp(N(inputRaw.declining_readiness)),
    career_stage_transition: clamp(N(inputRaw.career_stage_transition)),
    rapid_clout_growth: clamp(N(inputRaw.rapid_clout_growth)),
    low_authenticity: clamp(N(inputRaw.low_authenticity)),
    chart_stability: clamp(N(inputRaw.chart_stability)),
    moderate_narrativeHeat: clamp(N(inputRaw.moderate_narrativeHeat)),
    meme_velocity: clamp(N(inputRaw.meme_velocity)),
    crisis_signal: clamp(N(inputRaw.crisis_signal)),
    cultural_momentum: clamp(N(inputRaw.cultural_momentum)),
    overexposure_signal: clamp(N(inputRaw.overexposure_signal)),
    commercial_bias: clamp(N(inputRaw.commercial_bias)),
    commentary_signal: clamp(N(inputRaw.commentary_signal)),
    disruption_signal: clamp(N(inputRaw.disruption_signal)),
    corporate_support: clamp(N(inputRaw.corporate_support)),
    unproven_signal: clamp(N(inputRaw.unproven_signal)),
    defense_mitigation: clamp(N(inputRaw.defense_mitigation)),
    trend_chasers_percentage: clamp(N(inputRaw.trend_chasers_percentage)),
    prestige_platform_usage: clamp(N(inputRaw.prestige_platform_usage)),
    brand_roster_strength: clamp(N(inputRaw.brand_roster_strength)),
    career_stage_factor: clamp(N(inputRaw.career_stage_factor)),
    engagementReadiness: clamp(N(inputRaw.engagementReadiness)),
    massReceptivity: clamp(N(inputRaw.massReceptivity)),
    editorialReceptivity: clamp(N(inputRaw.editorialReceptivity)),
    narrativeHeat: clamp(N(inputRaw.narrativeHeat)),
    brandSafety: clamp(N(inputRaw.brandSafety)),
    low_brandSafety: clamp(N(inputRaw.low_brandSafety)),
    industryLeverage: clamp(N(inputRaw.industryLeverage)),
  };

  const brandSafety = clamp(
    100 - (input.rebellion * 0.3) - (input.tension * 0.4) - (input.volatility * 0.2) + (input.authenticity * 0.2) + (input.defense_mitigation * 0.2)
  );

  const editorialReceptivity = clamp(
    0.4 * input.authenticity + 0.3 * input.critics_adjacent_percentage + 0.2 * input.pressHeat_delta + 0.1 * input.prestige_platform_usage
  );

  const fanPreScores = fanScores({ ...input, brandSafety, editorialReceptivity, low_brandSafety: 100 - brandSafety });
  const fanLens = pickWinner('fan', fanPreScores, input.volatility);
  const fanHeat = clamp(fanLens.score + N(audienceModifiers?.fanHeatBias));

  const pressPreScores = pressScores({ ...input, brandSafety, editorialReceptivity, low_brandSafety: 100 - brandSafety, narrativeHeat: input.narrativeHeat });
  const pressLens = pickWinner('press', pressPreScores, input.volatility);
  const pressHeat = clamp(pressLens.score);

  const massReceptivity = clamp(
    0.4 * input.glamour + 0.3 * input.trend_chasers_percentage + 0.2 * input.chart_consistency + 0.1 * clamp(0.4 * fanHeat + 0.3 * pressHeat + 0.3 * N(input.industryLeverage))
  );

  const narrativeHeat = clamp(0.4 * fanHeat + 0.3 * pressHeat + 0.3 * clamp(N(input.industryLeverage)));

  const preIndustryLeverage = clamp(
    0.4 * input.clout + 0.2 * narrativeHeat + 0.2 * input.brand_roster_strength + 0.1 * editorialReceptivity + 0.1 * input.career_stage_factor
  );

  const industryPreScores = industryScores({
    ...input,
    brandSafety,
    low_brandSafety: 100 - brandSafety,
    editorialReceptivity,
    massReceptivity,
    narrativeHeat,
    industryLeverage: preIndustryLeverage,
  });
  const industryLens = pickWinner('industry', industryPreScores, input.volatility);
  const industryHeat = clamp(industryLens.score);

  const brandSafetyAdjusted = clamp(brandSafety + N(audienceModifiers?.brandSafetyBias));
  const narrativeHeatFinal = clamp(0.4 * fanHeat + 0.3 * pressHeat + 0.3 * industryHeat);
  const moderateNarrativeHeat = clamp(100 - Math.abs(50 - narrativeHeatFinal) * 2);
  const industryLeverage = clamp(
    0.4 * input.clout + 0.2 * narrativeHeatFinal + 0.2 * input.brand_roster_strength + 0.1 * editorialReceptivity + 0.1 * input.career_stage_factor
  );

  const controversyActive = input.rebellion > 65 && input.tension > 60 && narrativeHeatFinal > 55;
  const defenseOffset = clamp(input.defense_mitigation * 0.35, 0, 20);
  const controversyArc: ControversyArcState = {
    active: controversyActive,
    intensity: controversyActive ? Math.round(clamp((input.rebellion + input.tension + narrativeHeatFinal) / 3)) : 0,
    volatilityBoost: controversyActive ? clamp(4 + ((input.rebellion + input.tension) / 60), 0, 10) : 0,
    narrativeHeatSpike: controversyActive ? clamp(3 + (narrativeHeatFinal / 25), 0, 10) : 0,
    brandSafetyPenalty: controversyActive ? clamp(6 + ((input.tension + input.volatility) / 20) - defenseOffset, 0, 18) : 0,
    engagementReadinessBoost: controversyActive ? clamp(2 + (defenseOffset * 0.2), 0, 8) : 0,
  };

  const leverageNorm = industryLeverage / 100;
  const influenceCaps = {
    maxInfluenceDeltaPct: 0.15,
    chartInfluenceMult: clampBase(1 + ((narrativeHeatFinal - 50) / 50) * 0.15, 0.85, 1.15),
    socialInfluenceMult: clampBase(1 + ((narrativeHeatFinal - 50) / 50) * 0.15, 0.85, 1.15),
    brandDealsInfluenceMult: clampBase(1 + ((brandSafetyAdjusted - 50) / 50) * 0.15, 0.85, 1.15),
    volatilityDampeningMult: clampBase(1 - leverageNorm * 0.15, 0.85, 1),
    alignmentRecoveryMult: clampBase(1 + leverageNorm * 0.15, 1, 1.15),
    flopRecoveryMult: clampBase(1 + leverageNorm * 0.15, 1, 1.15),
    negotiationMult: clampBase(1 + leverageNorm * 0.15, 1, 1.15),
  };

  return {
    fanLens,
    pressLens,
    industryLens,
    fanScores: Object.fromEntries(Object.entries(fanPreScores).map(([k, v]) => [k, Math.round(clamp(v))])),
    pressScores: Object.fromEntries(Object.entries(pressPreScores).map(([k, v]) => [k, Math.round(clamp(v))])),
    industryScores: Object.fromEntries(Object.entries(industryPreScores).map(([k, v]) => [k, Math.round(clamp(v))])),
    fanHeat: Math.round(fanHeat),
    pressHeat: Math.round(pressHeat),
    industryHeat: Math.round(industryHeat),
    narrativeHeat: Math.round(clamp(narrativeHeatFinal + controversyArc.narrativeHeatSpike)),
    brandSafety: Math.round(clamp(brandSafetyAdjusted - controversyArc.brandSafetyPenalty)),
    editorialReceptivity: Math.round(editorialReceptivity),
    massReceptivity: Math.round(massReceptivity),
    industryLeverage: Math.round(industryLeverage),
    controversyArc,
    influenceCaps,
  };
}

export async function buildIndustryPerceptionModifiersForPlayer(player: any, globalTurnId: number, supabaseClient: any, fandomModifiers: any = null, audienceModifiers: AudienceModifiers | null = null): Promise<IndustryPerceptionModifiers> {
  const [{ data: era }, { data: fanProfile }, { data: brandStats }, { data: wars }] = await Promise.all([
    supabaseClient.from('eras').select('identity_alignment_score,is_experimental,tension,volatility_level,momentum,start_turn,phase').eq('artist_id', player.id).eq('is_active', true).maybeSingle(),
    supabaseClient.from('fan_profiles').select('overall_sentiment,fandom_memory,retention_rate').eq('artist_id', player.id).maybeSingle(),
    supabaseClient.from('player_brand_stats').select('brand_safety_rating,reputation_modifier,total_deals_completed,active_deal_count').eq('artist_id', player.id).maybeSingle(),
    supabaseClient.from('fan_wars').select('status').eq('artist_id', player.id).in('status', ['active', 'escalated', 'resolved']),
  ]);

  const trendChasers = clamp(N(fandomModifiers?.rollingEssenceVectors?.glamour ?? fandomModifiers?.essenceVectors?.glamour));
  const criticsAdj = clamp(N(fandomModifiers?.rollingEssenceVectors?.authenticity ?? fandomModifiers?.essenceVectors?.authenticity));
  const readinessHistory: number[] = Array.isArray(fanProfile?.fandom_memory?.recent_readiness) ? fanProfile.fandom_memory.recent_readiness : [];
  const readinessNow = clamp(N(fandomModifiers?.engagementReadiness));
  const readinessPrev = clamp(N(readinessHistory.at(-2)));
  const defenseMitigation = clamp(
    Math.max(0, readinessNow - 55) * 0.6
      + Math.max(0, N(fandomModifiers?.rollingEssenceVectors?.community ?? fandomModifiers?.essenceVectors?.community) - 50) * 0.4,
  );
  const chartConsistency = clamp(N(player.hype) * 0.4 + N(player.clout) * 0.02 + N(fanProfile?.retention_rate) * 0.3);
  const declineTurns = clamp(N(player.consecutive_decline_turns) * 10);
  const lifeStage = clamp((N(player.pending_stage_order) || 3) * 12);
  const cloutGrowth = clamp((N(player.clout) - N(player.last_turn_clout)) * 0.5 + 50);

  return computeIndustryPerceptionModifiers({
    community: clamp(N(fandomModifiers?.rollingEssenceVectors?.community ?? fandomModifiers?.essenceVectors?.community)),
    rolling_readiness: clamp(N(fandomModifiers?.rollingReadiness)),
    fan_war_win_rate: clamp(100 - (N(wars?.filter((w: any) => w.status === 'resolved')?.length) * 10)),
    clout: clamp(N(player.clout) / 20),
    authenticity: clamp(N(fandomModifiers?.rollingEssenceVectors?.authenticity ?? fandomModifiers?.essenceVectors?.authenticity)),
    glamour: clamp(N(fandomModifiers?.rollingEssenceVectors?.glamour ?? fandomModifiers?.essenceVectors?.glamour)),
    rebellion: clamp(N(fandomModifiers?.rollingEssenceVectors?.rebellion ?? fandomModifiers?.essenceVectors?.rebellion)),
    tension: clamp(N(era?.tension)),
    volatility: clamp(N(era?.volatility_level)),
    chart_consistency: chartConsistency,
    low_chart_dominance_factor: clamp(100 - chartConsistency),
    resurgence_flag: clamp(readinessNow > 65 && readinessPrev < 45 ? 100 : 0),
    readiness_growth_rate: clamp((readinessNow - readinessPrev) + 50),
    critics_adjacent_percentage: criticsAdj,
    experimental_flag: era?.is_experimental ? 100 : 0,
    pivot_shock: clamp(Math.abs(readinessNow - clamp(N(era?.identity_alignment_score))) * 0.8),
    rolling_alignment_shift: clamp(Math.abs((N(fanProfile?.fandom_memory?.rolling_alignment_avg) || 50) - N(era?.identity_alignment_score))),
    pressHeat_delta: clamp(Math.abs(N(era?.momentum) - N(era?.tension))),
    declining_chart_trend: declineTurns,
    declining_readiness: clamp(readinessNow < 45 ? 70 : 20),
    career_stage_transition: clamp(N(globalTurnId - N(era?.start_turn)) > 20 ? 60 : 20),
    rapid_clout_growth: cloutGrowth,
    low_authenticity: clamp(100 - N(fandomModifiers?.rollingEssenceVectors?.authenticity ?? fandomModifiers?.essenceVectors?.authenticity)),
    chart_stability: clamp(N(fanProfile?.retention_rate)),
    moderate_narrativeHeat: 50,
    meme_velocity: clamp(trendChasers * 0.7 + N(player.hype) * 0.3),
    crisis_signal: clamp((N(era?.tension) + N(era?.volatility_level)) / 2),
    cultural_momentum: clamp(N(era?.momentum)),
    overexposure_signal: clamp(N(brandStats?.active_deal_count) * 20),
    commercial_bias: clamp(100 - criticsAdj),
    commentary_signal: clamp(criticsAdj * 0.8 + N(fandomModifiers?.essenceVectors?.authenticity) * 0.2),
    disruption_signal: clamp(N(fandomModifiers?.essenceVectors?.rebellion) * 0.7 + N(era?.is_experimental ? 25 : 0)),
    corporate_support: clamp(N(brandStats?.total_deals_completed) * 5),
    unproven_signal: clamp(100 - lifeStage),
    defense_mitigation: defenseMitigation,
    trend_chasers_percentage: trendChasers,
    prestige_platform_usage: clamp(criticsAdj * 0.8),
    brand_roster_strength: clamp(N(brandStats?.total_deals_completed) * 6),
    career_stage_factor: lifeStage,
    engagementReadiness: readinessNow,
    brandSafety: clamp(N(brandStats?.brand_safety_rating)),
    massReceptivity: clamp(N(player.hype)),
    editorialReceptivity: clamp(criticsAdj),
  }, audienceModifiers);
}
