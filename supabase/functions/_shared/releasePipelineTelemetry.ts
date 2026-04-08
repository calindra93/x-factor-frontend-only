type BuildReleasePipelineTelemetryEventInput = {
  eventType: string;
  module: string;
  globalTurnId: number;
  playerId: string;
  reasonCode: string;
  traceId: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export function buildReleasePipelineTelemetryEvent(input: BuildReleasePipelineTelemetryEventInput) {
  const {
    eventType,
    module,
    globalTurnId,
    playerId,
    reasonCode,
    traceId,
    description,
    metadata = {},
  } = input;

  // Explicit params (reason_code, trace_id) must not be overridable by metadata spread.
  // Place them AFTER spread to enforce this contract.
  return {
    event_type: eventType,
    module,
    global_turn_id: globalTurnId,
    player_id: playerId,
    description,
    metadata: {
      ...metadata,
      reason_code: reasonCode,
      trace_id: traceId,
    },
  };
}
