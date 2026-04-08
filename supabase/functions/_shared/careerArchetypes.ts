export type CareerArchetypeLabel =
  | 'Hitmaker'
  | 'Cult_Icon'
  | 'Live_Show_Legend'
  | 'Critically_Acclaimed'
  | 'Fan_Favorite'
  | 'Industry_Royalty';

export interface CareerArchetypeInput {
  dominant_lane: string | null;
  secondary_lane: string | null;
  weather_fit?: string | null;
  proof_summary?: string[];
  posture?: string | null;
}

export interface CareerArchetypeResult {
  label: CareerArchetypeLabel;
  dominant_lane: string | null;
  secondary_lane: string | null;
  weather_fit: string | null;
  proof_summary: string[];
  posture_used: string | null;
  matched_signals: string[];
}

function normalizeProofSummary(proofSummary?: string[]): string[] {
  return Array.isArray(proofSummary) ? proofSummary.filter(Boolean) : [];
}

function classifyLanePair(dominantLane: string | null, secondaryLane: string | null): CareerArchetypeLabel {
  const pair = [dominantLane || '', secondaryLane || ''].join('|');

  switch (pair) {
    case 'commercial_heat|cultural_influence':
      return 'Industry_Royalty';
    case 'commercial_heat|industry_respect':
      return 'Hitmaker';
    case 'core_fan_devotion|cultural_influence':
      return 'Cult_Icon';
    case 'core_fan_devotion|live_draw':
      return 'Fan_Favorite';
    case 'industry_respect|cultural_influence':
      return 'Critically_Acclaimed';
    case 'live_draw|core_fan_devotion':
    case 'live_draw|commercial_heat':
    case 'live_draw|cultural_influence':
    case 'live_draw|industry_respect':
      return 'Live_Show_Legend';
    default:
      break;
  }

  if (dominantLane === 'live_draw') return 'Live_Show_Legend';
  if (dominantLane === 'industry_respect') return 'Critically_Acclaimed';
  if (dominantLane === 'core_fan_devotion') return 'Fan_Favorite';
  if (dominantLane === 'commercial_heat') return 'Hitmaker';
  return 'Cult_Icon';
}

export function inferCareerArchetype(input: CareerArchetypeInput): CareerArchetypeResult {
  const dominantLane = input?.dominant_lane || null;
  const secondaryLane = input?.secondary_lane || null;
  const weatherFit = input?.weather_fit || null;
  const proofSummary = normalizeProofSummary(input?.proof_summary);
  const postureUsed = input?.posture || null;
  const matchedSignals = ['lane_pair'];

  const proofSet = new Set(proofSummary);
  if (proofSet.has('chart_breakout')) matchedSignals.push('proof_chart_breakout');
  if (proofSet.has('identity_signal')) matchedSignals.push('proof_identity_signal');
  if (proofSet.has('crowd_turnout')) matchedSignals.push('proof_crowd_turnout');
  if (proofSet.has('industry_validation')) matchedSignals.push('proof_industry_validation');
  if (proofSet.has('loyal_core_audience')) matchedSignals.push('proof_loyal_core_audience');
  if (postureUsed) matchedSignals.push('optional_posture');
  if (weatherFit) matchedSignals.push(`weather_${weatherFit}`);

  const label = classifyLanePair(dominantLane, secondaryLane);

  return {
    label,
    dominant_lane: dominantLane,
    secondary_lane: secondaryLane,
    weather_fit: weatherFit,
    proof_summary: proofSummary,
    posture_used: postureUsed,
    matched_signals: matchedSignals,
  };
}
