// Static imports to ensure bundler includes all dynamically-loaded modules
// The turnScheduler uses dynamic import() which Supabase bundler doesn't follow
// These must match the modules loaded by loadModuleFunction() in turnScheduler.ts
import '../_shared/turnProcessorCore.ts';
import '../_shared/economyMath.ts';
import '../_shared/careerProgressionLogic.ts';
import '../_shared/careerProgressionPipeline.ts';
import '../_shared/runawaySongMechanic.ts';
import '../_shared/fansUpdateModule.ts';
import '../_shared/turnProcessorEra.ts';
import '../_shared/notificationsGenerator.ts';
import '../_shared/monthlyListenersModule.ts';
import '../_shared/fanWarTickModule.ts';
import '../_shared/brandDealsModule.ts';
import '../_shared/fanSentimentEngine.ts';
import '../_shared/socialMediaModule.ts';
import '../_shared/touringManager.ts';
import '../_shared/touringExpansionConfig.ts';
import '../_shared/careerTrendsModule.ts';
import '../_shared/newsGenerationModule.ts';
import '../_shared/socialMediaMath.ts';
import '../_shared/thumbnailGenerator.ts';
import '../_shared/socialMediaRevenueMath.ts';
import '../_shared/insightsReportGenerator.ts';
import '../_shared/platformAlgorithmModel.ts';
import '../_shared/gameDataGenerators.ts';
import '../_shared/sentimentModifiers.ts';
import '../_shared/festivalGlobalModule.ts';
import '../_shared/sampleAchievementsModule.ts';
import '../_shared/sampleRoyaltyModule.ts';
import '../_shared/remixContestModule.ts';
import '../_shared/genreTraits.ts';
import '../_shared/playerActivity.ts';
import '../_shared/algorithmMoodModule.ts';
import '../_shared/trendEvolutionModule.ts';
import '../_shared/soundburstRadioModule.ts';
import '../_shared/segmentSentimentTriggers.ts';
import '../_shared/fandomSegmentsSentimentModule.ts';
import '../_shared/eventThumbnails.ts';
import '../_shared/certificationModule.ts';
import '../_shared/applecoreEditorialModule.ts';
// Direct dependencies of turnEngine.ts
import '../_shared/turnScheduler.ts';
import '../_shared/turnEngineState.js';
// Main entry point — business logic (no Deno.serve; handler is below)
import { runTurnEngine, runSinglePlayerCatchup } from '../_shared/turnEngine.ts';
import { processFestivalGlobalModule } from '../_shared/festivalGlobalModule.ts';
import { supabaseAdmin } from '../_shared/lib/supabaseAdmin.ts';

(globalThis as any).Deno.serve(async (req: any) => {
  try {
    const url = new URL(req.url);
    let payload: any = {};

    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}));
    } else {
      payload = {
        debug_turn_economy: url.searchParams.get('debug_turn_economy') === 'true',
        debug_player_id: url.searchParams.get('debug_player_id') || null
      };
    }

    // Single-player catchup mode: process one player for specific turns
    // Usage: { catchup: true, playerId: "uuid", startTurn: 502, endTurn: 526 }
    if (payload.catchup === true && payload.playerId && payload.startTurn && payload.endTurn) {
      const MAX_CATCHUP_TURNS = 60;
      const cappedEnd = Math.min(payload.endTurn, payload.startTurn + MAX_CATCHUP_TURNS - 1);
      const results = [];
      for (let turn = payload.startTurn; turn <= cappedEnd; turn++) {
        try {
          await processFestivalGlobalModule(turn, supabaseAdmin);
        } catch (festErr: unknown) {
          const msg = festErr instanceof Error ? festErr.message : String(festErr);
          console.error(`[Catchup] Festival module error for turn ${turn} (non-fatal): ${msg}`);
        }

        const r = await runSinglePlayerCatchup(payload.playerId, turn);
        results.push(r);
        if (r.status === 'failed' && !r.skipped) break;
      }
      const successful = results.filter((r: any) => r.status === 'success').length;
      const skipped = results.filter((r: any) => r.skipped).length;
      const failed = results.filter((r: any) => r.status === 'failed').length;
      return Response.json({
        status: failed > 0 ? 'partial' : 'success',
        mode: 'catchup',
        player_id: payload.playerId,
        turns_processed: successful,
        turns_skipped: skipped,
        turns_failed: failed,
        total_turns: results.length,
        capped: cappedEnd < payload.endTurn,
        results,
      });
    }

    const result = await runTurnEngine(supabaseAdmin, payload);
    return Response.json(result);
  } catch (error) {
    const httpErrMsg = error instanceof Error ? error.message : String(error);
    return Response.json({
      error: 'TURN_ENGINE_UNHANDLED_ERROR',
      details: httpErrMsg,
      traceId: `turnEngine:${Date.now().toString(36)}`,
    }, { status: 500 });
  }
});
