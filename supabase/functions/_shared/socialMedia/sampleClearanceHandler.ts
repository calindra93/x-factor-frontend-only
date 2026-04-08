/**
 * SAMPLE CLEARANCE HANDLER
 * HTTP wrappers around sampleClearanceModule functions.
 * Registered in socialMediaRouter.ts.
 */

import {
  requestSample,
  respondToSampleRequest,
  getSampleRequestsForArtist,
  getSampleableSongs,
  completeSampleRequest,
} from '../sampleClearanceModule.ts';
import { supabaseAdmin } from '../lib/supabaseAdmin.ts';

function N(v: unknown): number { return Number(v) || 0; }

async function resolveGlobalTurnId(
  inputTurnId: unknown,
  meta: { handler: string }
): Promise<number> {
  const parsedTurnId = N(inputTurnId);
  if (parsedTurnId > 0) return parsedTurnId;

  const { data: turnState, error } = await supabaseAdmin
    .from('turn_state')
    .select('last_completed_turn_id, global_turn_id, current_turn_id')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.warn('[resolveGlobalTurnId] turn_state lookup failed; falling back to 0', {
      handler: meta.handler,
      inputTurnId: parsedTurnId,
      error: (error as any)?.message ?? String(error),
    });
    return 0;
  }

  const resolved = N(
    turnState?.last_completed_turn_id ?? turnState?.global_turn_id ?? turnState?.current_turn_id
  );

  if (resolved <= 0) {
    console.warn('[resolveGlobalTurnId] turn_state missing/empty; falling back to 0', {
      handler: meta.handler,
      inputTurnId: parsedTurnId,
      last_completed_turn_id: N(turnState?.last_completed_turn_id),
      global_turn_id: N(turnState?.global_turn_id),
      current_turn_id: N(turnState?.current_turn_id),
    });
  }

  return resolved;
}

export async function requestSampleHandler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    console.log('[requestSampleHandler] Received body:', JSON.stringify(body));
    const { artistId, sourceSongId, feeOffered, message, globalTurnId = 0, clearanceStrategy = 'direct', songId } = body;
    
    if (!artistId || !sourceSongId) {
      console.error('[requestSampleHandler] Missing fields - artistId:', artistId, 'sourceSongId:', sourceSongId);
      return Response.json({ success: false, error: 'Missing artistId or sourceSongId' }, { status: 400 });
    }
    
    const feeNum = N(feeOffered);
    console.log('[requestSampleHandler] feeOffered:', feeOffered, 'converted to:', feeNum);
    
    if (clearanceStrategy !== 'anonymous_flip' && feeNum <= 0) {
      console.error('[requestSampleHandler] Invalid fee:', feeNum);
      return Response.json({ success: false, error: `feeOffered must be greater than 0 (received: ${feeOffered})` }, { status: 400 });
    }

    const resolvedGlobalTurnId = await resolveGlobalTurnId(globalTurnId, { handler: 'requestSampleHandler' });
    
    const result = await requestSample({
      requesterId: artistId,
      sourceSongId,
      feeOffered: feeNum,
      message,
      globalTurnId: resolvedGlobalTurnId,
      clearanceStrategy,
      songId,
    });
    console.log('[requestSampleHandler] Result:', JSON.stringify(result));
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[requestSampleHandler] Error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function respondToSampleHandler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, requestId, decision, responseMessage, globalTurnId = 0 } = body;
    if (!artistId || !requestId || !decision) {
      return Response.json({ success: false, error: 'Missing artistId, requestId, or decision' }, { status: 400 });
    }
    if (!['approved', 'rejected'].includes(decision)) {
      return Response.json({ success: false, error: 'decision must be approved or rejected' }, { status: 400 });
    }
    const resolvedGlobalTurnId = await resolveGlobalTurnId(globalTurnId, { handler: 'respondToSampleHandler' });
    const result = await respondToSampleRequest({
      requestId,
      sourceArtistId: artistId,
      decision,
      responseMessage,
      globalTurnId: resolvedGlobalTurnId,
    });
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function completeSampleHandler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, requestId, newSongId, globalTurnId = 0 } = body;
    if (!artistId || !requestId || !newSongId) {
      return Response.json({ success: false, error: 'Missing artistId, requestId, or newSongId' }, { status: 400 });
    }
    const resolvedGlobalTurnId = await resolveGlobalTurnId(globalTurnId, { handler: 'completeSampleHandler' });
    const result = await completeSampleRequest({ requestId, requesterId: artistId, newSongId, globalTurnId: resolvedGlobalTurnId });
    return Response.json(result, { status: result.success ? 200 : 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function getSampleRequestsHandler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId } = body;
    if (!artistId) {
      return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });
    }
    const data = await getSampleRequestsForArtist(artistId);
    return Response.json({ success: true, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function getSampleableSongsHandler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, limit = 50 } = body;
    if (!artistId) {
      return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });
    }
    const songs = await getSampleableSongs(artistId, N(limit));
    return Response.json({ success: true, songs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
