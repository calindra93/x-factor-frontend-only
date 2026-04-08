const MUTATION_LOCKED_KEYS = ['income', 'followers', 'clout', 'monthly_listeners'] as const;

export function assertNoCoreEconomyMutationInSocialCreate(params: {
  currentProfile: Record<string, any>;
  patch: Record<string, any>;
  traceId: string;
  handler: string;
}) {
  const { currentProfile, patch, traceId, handler } = params;
  for (const key of MUTATION_LOCKED_KEYS) {
    if (!(key in patch)) continue;
    const before = Number(currentProfile?.[key]);
    const after = Number(patch[key]);
    if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
      throw new Error(`[SOCIAL_CREATE_INVARIANT_VIOLATION] traceId=${traceId} handler=${handler} field=${key} before=${before} after=${after}`);
    }
  }
}
