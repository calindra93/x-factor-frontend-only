/**
 * ADMIN ROUTER - Consolidated admin/dev edge function
 * Routes by `action` field in request body:
 *   - debugSnapshot → adminTurnDebugSnapshot
 *   - devRun → devRunTurnEngine
 *   - backfill → backfillTurnDeltas
 *   - seed → seedTestWorld
 */

import { handleRequest as handleDebugSnapshot } from './adminTurnDebugSnapshot.ts';
import { handleRequest as handleDevRun } from './devRunTurnEngine.ts';
import { handleRequest as handleBackfill } from './backfillTurnDeltas.ts';
import { handleRequest as handleBackfillVidWave } from './backfillVidWaveSubscribers.ts';
import { handleRequest as handleDebugReaction } from './debugReactionGeneration.ts';
import { handleRequest as handleDiagnoseReaction } from './diagnoseReactionMissing.ts';
import { handleRequest as handleGenerateMissingReactions } from './generateMissingReactions.ts';
import { handleRequest as handleSeed } from './seedTestWorld.ts';

Deno.serve(async (req: Request) => {
  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));
  const action = body.action || new URL(req.url).searchParams.get('action');

  switch (action) {
    case 'debugSnapshot':
      return handleDebugSnapshot(req.clone());
    case 'devRun':
      return handleDevRun(req.clone());
    case 'backfill':
      return handleBackfill(req.clone());
    case 'backfillVidWave':
      return handleBackfillVidWave(req.clone());
    case 'debugReaction':
      return handleDebugReaction(req.clone());
    case 'diagnoseReaction':
      return handleDiagnoseReaction(req.clone());
    case 'generateMissingReactions':
      return handleGenerateMissingReactions(req.clone());
    case 'seed':
      return handleSeed(req.clone());
    default:
      return Response.json({
        error: `Unknown admin action: ${action}`,
        available: ['debugSnapshot', 'devRun', 'backfill', 'backfillVidWave', 'debugReaction', 'diagnoseReaction', 'generateMissingReactions', 'seed']
      }, { status: 400 });
  }
});
