/**
 * festivalActions — Amplifi Festival Phase 2/3/4 Player API
 *
 * Routes to festivalActionsServer.ts for auth-gated actions:
 *   stageSnipe, respondOffer, myRivalActions, myBackstageOffers, influence,
 *   initiateBackstageDeal, resolveHighlightClip, getTruces, respondToTruce,
 *   submitEntry, saveSetlist, withdrawEntry
 */

import { handleFestivalAction } from '../_shared/festivalActionsServer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PAYLOAD_BYTES = 16 * 1024; // 16KB

(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // A-6: Payload size validation (DoS prevention)
  const contentLength = req.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Payload too large' }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const res = await handleFestivalAction(req);

  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
