/**
 * GAME CONTENT ROUTER - Consolidated game content generation edge function
 * Routes by `action` field in request body:
 *   - eraFeedback → generateEraFeedback
 *   - newsArticle → generateNewsArticle
 *   - brandHeat → calculateBrandHeat
 */

import { handleRequest as handleEraFeedback } from './generateEraFeedback.ts';
import { handleRequest as handleNewsArticle } from './generateNewsArticle.ts';
import { handleRequest as handleBrandHeat } from './calculateBrandHeat.ts';

Deno.serve(async (req: Request) => {
  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));
  const action = body.action || new URL(req.url).searchParams.get('action');

  switch (action) {
    case 'eraFeedback':
      return handleEraFeedback(req.clone());
    case 'newsArticle':
      return handleNewsArticle(req.clone());
    case 'brandHeat':
      return handleBrandHeat(req.clone());
    default:
      return Response.json({
        error: `Unknown gameContent action: ${action}`,
        available: ['eraFeedback', 'newsArticle', 'brandHeat']
      }, { status: 400 });
  }
});
