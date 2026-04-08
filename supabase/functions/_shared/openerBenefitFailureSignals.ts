type OpenerFailureSignalParams = {
  failureCount: number;
  headlinerPlayerId: string;
  globalTurnId: number;
  cityName?: string | null;
  tourId?: string | null;
  gigId?: string | null;
};

type OpenerFailureSignals = {
  event: Record<string, unknown>;
  notification: Record<string, unknown>;
};

export function buildOpenerBenefitFailureSignals(params: OpenerFailureSignalParams): OpenerFailureSignals | null {
  const {
    failureCount,
    headlinerPlayerId,
    globalTurnId,
    cityName,
    tourId,
    gigId,
  } = params;

  if (!headlinerPlayerId || !Number.isFinite(failureCount) || failureCount <= 0) {
    return null;
  }

  const cityLabel = cityName || 'this city';
  const keyParts = [String(globalTurnId), tourId || 'tour', gigId || 'gig', headlinerPlayerId];
  const idempotencyKey = `opener_benefits_partial_failure:${keyParts.join(':')}`;

  return {
    event: {
      module: 'sceneSystem:opener',
      event_type: 'opener_benefits_partial_failure',
      description: `Opener benefits had ${failureCount} partial failure(s) in ${cityLabel}.`,
      metadata: {
        failure_count: failureCount,
        tour_id: tourId || null,
        gig_id: gigId || null,
        city_name: cityName || null,
      },
    },
    notification: {
      player_id: headlinerPlayerId,
      type: 'TOUR_EVENT',
      title: 'Opener benefits partially processed',
      subtitle: `${failureCount} opener benefit task(s) failed in ${cityLabel}`,
      body: 'Some opener benefits could not be fully processed this turn. They were logged for follow-up.',
      priority: 'high',
      metrics: {
        failure_count: failureCount,
        turn: globalTurnId,
        tour_id: tourId || null,
        gig_id: gigId || null,
      },
      idempotency_key: idempotencyKey,
    },
  };
}
