export type FestivalArchiveSubmission = {
  artist_id: string;
  desired_lane: string | null;
  status: string | null;
  posture: string | null;
  rehearsal_investment: number | null;
  visuals_budget: number | null;
  set_length: number | null;
  submitted_turn_id: number | null;
};

export type FestivalArchiveResult = {
  artist_id: string;
  lane: string | null;
  crowd_heat: number | null;
  credibility: number | null;
  conversion: number | null;
  clout_gain: number | null;
  follower_gain: number | null;
  brand_interest_gain: number | null;
  moment_card: any;
  resolved_turn_id: number | null;
};

export type BackstageDealSummary = {
  deal_type: string;
  artist_b_id: string | null;
  effects_applied: boolean;
};

export type FestivalApplicationArchiveRow = {
  festival_instance_id: string;
  artist_id: string;
  application_turn: number | null;
  status: 'completed';
  desired_lane: string | null;
  lane: string | null;
  submission_status: string | null;
  performance_turn: number;
  attendance_share: number;
  payout_earned: number;
  performance_score: number;
  energy_spent: number;
  hype_gained: number;
  clout_gained: number;
  crowd_heat: number;
  credibility: number;
  conversion: number;
  follower_gain: number;
  brand_interest_gain: number;
  moment_card: any;
  metadata: {
    submission_posture: string | null;
    rehearsal_investment: number | null;
    visuals_budget: number | null;
    set_length: number | null;
    backstage_follow_through?: BackstageDealSummary[];
  };
  archived_at: string;
};

function toNumber(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function averageRounded(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function pickMomentCard(results: FestivalArchiveResult[]): any {
  const candidates = results.filter((result) => result?.moment_card);
  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const heatDelta = toNumber(b.crowd_heat) - toNumber(a.crowd_heat);
    if (heatDelta !== 0) return heatDelta;
    return toNumber(b.resolved_turn_id) - toNumber(a.resolved_turn_id);
  })[0].moment_card;
}

function pickLane(results: FestivalArchiveResult[], fallbackLane: string | null): string | null {
  if (!results.length) return fallbackLane;

  return [...results].sort((a, b) => toNumber(b.resolved_turn_id) - toNumber(a.resolved_turn_id))[0].lane || fallbackLane;
}

export function resolveFestivalSubmissionTurn(
  submittedTurnId: number | null | undefined,
  applicationsCloseTurnId: number,
): number {
  return submittedTurnId ?? applicationsCloseTurnId;
}

export function buildFestivalApplicationArchiveRows({
  instanceId,
  submissions,
  results,
  globalTurnId,
  archivedAt,
  backstageDeals,
}: {
  instanceId: string;
  submissions: FestivalArchiveSubmission[];
  results: FestivalArchiveResult[];
  globalTurnId: number;
  archivedAt?: string;
  backstageDeals?: Array<{ artist_a_id: string; deal_type: string; artist_b_id: string | null; effects_applied: boolean }>;
}): FestivalApplicationArchiveRow[] {
  const archivedAtValue = archivedAt || new Date().toISOString();
  const resultsByArtist = new Map<string, FestivalArchiveResult[]>();

  for (const result of results || []) {
    if (!result?.artist_id) continue;
    const existing = resultsByArtist.get(result.artist_id) || [];
    existing.push(result);
    resultsByArtist.set(result.artist_id, existing);
  }

  const dealsByArtist = new Map<string, BackstageDealSummary[]>();
  for (const deal of backstageDeals || []) {
    if (!deal?.artist_a_id) continue;
    const existing = dealsByArtist.get(deal.artist_a_id) || [];
    existing.push({ deal_type: deal.deal_type, artist_b_id: deal.artist_b_id, effects_applied: deal.effects_applied });
    dealsByArtist.set(deal.artist_a_id, existing);
  }

  return (submissions || []).map((submission) => {
    const artistResults = resultsByArtist.get(submission.artist_id) || [];
    const crowdHeats = artistResults.map((result) => toNumber(result.crowd_heat));
    const credibilities = artistResults.map((result) => toNumber(result.credibility));
    const conversions = artistResults.map((result) => toNumber(result.conversion));
    const totalClout = artistResults.reduce((sum, result) => sum + toNumber(result.clout_gain), 0);
    const totalFollowers = artistResults.reduce((sum, result) => sum + toNumber(result.follower_gain), 0);
    const totalBrandInterest = artistResults.reduce((sum, result) => sum + toNumber(result.brand_interest_gain), 0);
    const performanceTurn = artistResults.reduce((maxTurn, result) => Math.max(maxTurn, toNumber(result.resolved_turn_id)), globalTurnId);
    const crowdHeat = averageRounded(crowdHeats);
    const credibility = averageRounded(credibilities);
    const conversion = averageRounded(conversions);
    const artistDeals = dealsByArtist.get(submission.artist_id) || [];

    return {
      festival_instance_id: instanceId,
      artist_id: submission.artist_id,
      application_turn: submission.submitted_turn_id ?? null,
      status: 'completed',
      desired_lane: submission.desired_lane,
      lane: pickLane(artistResults, submission.desired_lane),
      submission_status: submission.status,
      performance_turn: performanceTurn,
      attendance_share: totalFollowers,
      payout_earned: totalClout * 100,
      performance_score: crowdHeat,
      energy_spent: submission.rehearsal_investment ?? 50,
      hype_gained: Math.round(crowdHeat * 10),
      clout_gained: totalClout,
      crowd_heat: crowdHeat,
      credibility,
      conversion,
      follower_gain: totalFollowers,
      brand_interest_gain: totalBrandInterest,
      moment_card: pickMomentCard(artistResults),
      metadata: {
        submission_posture: submission.posture,
        rehearsal_investment: submission.rehearsal_investment,
        visuals_budget: submission.visuals_budget,
        set_length: submission.set_length,
        ...(artistDeals.length > 0 ? { backstage_follow_through: artistDeals } : {}),
      },
      archived_at: archivedAtValue,
    };
  });
}
