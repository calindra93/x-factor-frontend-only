/**
 * TURN MODULES ROUTER - Consolidated turn processor debugging edge function
 * Routes by `action` field in request body:
 *   - core → turnProcessorCore
 *   - era → turnProcessorEra
 */

import { handleRequest as handleCore } from './turnProcessorCore.ts';
import { handleRequest as handleEra } from './turnProcessorEra.ts';

Deno.serve(async (req: Request) => {
  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));
  const action = body.action || new URL(req.url).searchParams.get('action');

  switch (action) {
    case 'core':
      return handleCore(req.clone());
    case 'era':
      return handleEra(req.clone());
    default:
      return Response.json({
        error: `Unknown turnModules action: ${action}`,
        available: ['core', 'era']
      }, { status: 400 });
  }
});
