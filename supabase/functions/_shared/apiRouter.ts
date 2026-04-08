/**
 * API ROUTER - Consolidated frontend API edge function
 * Routes by `action` field in request body:
 *   - careerWidget → careerWidgetServer
 *   - recommendations → getPersonalizedRecommendations
 */

import { handleRequest as handleCareerWidget } from './careerWidgetServer.ts';
import { handleRequest as handleRecommendations } from './getPersonalizedRecommendations.ts';
import { handleRequest as handleFandomActions } from './fandomActionsServer.ts';

Deno.serve(async (req: Request) => {
  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));
  const action = body.action || new URL(req.url).searchParams.get('action');

  switch (action) {
    case 'careerWidget':
      return handleCareerWidget(req.clone());
    case 'recommendations':
      return handleRecommendations(req.clone());
    case 'fandomActions':
      return handleFandomActions(req.clone());
    default:
      return Response.json({
        error: `Unknown api action: ${action}`,
        available: ['careerWidget', 'recommendations', 'fandomActions']
      }, { status: 400 });
  }
});
