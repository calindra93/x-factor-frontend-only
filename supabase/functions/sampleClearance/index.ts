import { requestNPCSample, requestSample, respondToSampleRequest, completeSampleRequest, getSampleRequestsForArtist, getSampleableSongs } from '../_shared/sampleClearanceModule.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'requestNPCSample') {
      const { requesterId, sampleSourceId, clearanceStrategy, songId, globalTurnId } = body;
      if (!requesterId || !sampleSourceId || !clearanceStrategy) {
        return jsonResponse({ error: 'Missing required fields: requesterId, sampleSourceId, clearanceStrategy' }, 400);
      }
      // Fetch current turn if not provided
      let turnId = globalTurnId;
      if (!turnId) {
        const { supabaseAdmin } = await import('../_shared/lib/supabaseAdmin.ts');
        const { data: ts } = await supabaseAdmin.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle();
        turnId = ts?.global_turn_id || 0;
      }
      const result = await requestNPCSample({ requesterId, sampleSourceId, clearanceStrategy, songId, globalTurnId: turnId });
      return jsonResponse(result, result.success ? 200 : 400);
    }

    if (action === 'requestSample') {
      const { requesterId, sourceSongId, feeOffered, message, globalTurnId } = body;
      if (!requesterId || !sourceSongId) {
        return jsonResponse({ error: 'Missing required fields' }, 400);
      }
      const result = await requestSample({ requesterId, sourceSongId, feeOffered: feeOffered || 200, message, globalTurnId: globalTurnId || 0 });
      return jsonResponse(result, result.success ? 200 : 400);
    }

    if (action === 'respondToSample') {
      const { requestId, sourceArtistId, decision, responseMessage, globalTurnId } = body;
      if (!requestId || !sourceArtistId || !decision) {
        return jsonResponse({ error: 'Missing required fields' }, 400);
      }
      const result = await respondToSampleRequest({ requestId, sourceArtistId, decision, responseMessage, globalTurnId: globalTurnId || 0 });
      return jsonResponse(result, result.success ? 200 : 400);
    }

    if (action === 'completeSample') {
      const { requestId, requesterId, newSongId, globalTurnId } = body;
      if (!requestId || !requesterId || !newSongId) {
        return jsonResponse({ error: 'Missing required fields' }, 400);
      }
      const result = await completeSampleRequest({ requestId, requesterId, newSongId, globalTurnId: globalTurnId || 0 });
      return jsonResponse(result, result.success ? 200 : 400);
    }

    if (action === 'getRequests') {
      const { artistId } = body;
      if (!artistId) return jsonResponse({ error: 'Missing artistId' }, 400);
      const result = await getSampleRequestsForArtist(artistId);
      return jsonResponse(result, 200);
    }

    if (action === 'getSampleableSongs') {
      const { requesterId, limit } = body;
      if (!requesterId) return jsonResponse({ error: 'Missing requesterId' }, 400);
      const songs = await getSampleableSongs(requesterId, limit || 50);
      return jsonResponse({ songs }, 200);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[sampleClearance] Endpoint error:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
