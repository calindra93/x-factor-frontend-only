/**
 * TURN PROCESSOR - NOTIFICATIONS
 * Runs hourly after core turn processing
 * Creates turn recaps and highlights WITHOUT LLM calls
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

export async function handleRequest(_req: Request) {
  return Response.json(
    {
      error: 'turnProcessorNotifications is deprecated. Use the unified turnEngine / turnScheduler notification flow.',
    },
    { status: 410 }
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}