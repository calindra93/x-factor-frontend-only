export interface ControversyTriggerResult {
  type: string;
  severity: number;
  credibility: number;
  memeability: number;
}

export interface ControversyVerdictRecord {
  status: 'triggered' | 'no_trigger';
  evaluated_turn: number;
  seed: string;
  player_hype: number;
  player_followers: number;
  controversy_type?: string;
}

interface EvaluateControversySourcePostParams {
  post: Record<string, any>;
  playerId: string;
  globalTurnId: number;
  playerHype: number;
  playerFollowers: number;
  persistedSourceVerdict: ControversyVerdictRecord | null;
  stagedSourceVerdict: ControversyVerdictRecord | null;
  persistedCasesBySourcePostId: Set<string>;
  stagedCasesBySourcePostId: Set<string>;
  evaluateTrigger: (args: {
    post: Record<string, any>;
    playerHype: number;
    playerFollowers: number;
    seed: string;
  }) => ControversyTriggerResult | null;
  buildControversyCase?: (args: {
    trigger: ControversyTriggerResult;
    verdict: ControversyVerdictRecord;
    post: Record<string, any>;
  }) => Record<string, any>;
}

export function buildControversyTriggerSeed(postId: string, playerId: string) {
  return `controversy_trigger:${postId}:${playerId}`;
}

export function evaluateControversySourcePost(
  params: EvaluateControversySourcePostParams,
): {
  verdict: ControversyVerdictRecord;
  socialPostMetadataUpdate: { id: string; patch: { metadata: Record<string, unknown> } };
  controversyCase: Record<string, any> | null;
} | null {
  const {
    post,
    playerId,
    globalTurnId,
    playerHype,
    playerFollowers,
    persistedSourceVerdict,
    stagedSourceVerdict,
    persistedCasesBySourcePostId,
    stagedCasesBySourcePostId,
    evaluateTrigger,
    buildControversyCase,
  } = params;

  const sourcePostId = String(post?.id || '');
  if (!sourcePostId) return null;

  if (
    persistedSourceVerdict
    || stagedSourceVerdict
    || persistedCasesBySourcePostId.has(sourcePostId)
    || stagedCasesBySourcePostId.has(sourcePostId)
  ) {
    return null;
  }

  const seed = buildControversyTriggerSeed(sourcePostId, playerId);
  const trigger = evaluateTrigger({
    post,
    playerHype,
    playerFollowers,
    seed,
  });

  const verdict: ControversyVerdictRecord = {
    status: trigger ? 'triggered' : 'no_trigger',
    evaluated_turn: globalTurnId,
    seed,
    player_hype: playerHype,
    player_followers: playerFollowers,
    ...(trigger ? { controversy_type: trigger.type } : {}),
  };

  const socialPostMetadataUpdate = {
    id: sourcePostId,
    patch: {
      metadata: {
        ...(post?.metadata || {}),
        controversy_trigger: verdict,
      },
    },
  };

  if (!trigger) {
    return {
      verdict,
      socialPostMetadataUpdate,
      controversyCase: null,
    };
  }

  const controversyCase = buildControversyCase
    ? buildControversyCase({ trigger, verdict, post })
    : {
        controversy_type: trigger.type,
        severity: trigger.severity,
        credibility: trigger.credibility,
        memeability: trigger.memeability,
        trigger_details: {
          source_post_id: sourcePostId,
          platform: post?.platform || null,
        },
      };

  return {
    verdict,
    socialPostMetadataUpdate,
    controversyCase,
  };
}