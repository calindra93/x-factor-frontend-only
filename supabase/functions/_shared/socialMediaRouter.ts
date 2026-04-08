/**
 * SOCIAL MEDIA ROUTER
 * Routes social media actions: YouTube, TikTok, fan interaction, live streaming, collaborations
 */

import { createYouTubeVideo } from './socialMedia/youtubeHandler.ts';
import { createLoopTokPost } from './socialMedia/looptokHandler.ts';
import { generateFanMessages } from './socialMedia/fanInteractionHandler.ts';
import { simulateLiveStream } from './socialMedia/liveStreamHandler.ts';
import { generateFanTheories } from './socialMedia/fanTheoryHandler.ts';
import { updateTrends } from './socialMedia/trendHandler.ts';
import { getForYouContent } from './socialMedia/forYouHandler.ts';
import { requestCollaboration, respondToCollaboration, getCollaborations } from './socialMedia/collaborationHandler.ts';
import { requestSampleHandler, respondToSampleHandler, getSampleRequestsHandler, getSampleableSongsHandler } from './socialMedia/sampleClearanceHandler.ts';
import { createInstaVibePost, getInstaVibeBrandDeals, acceptInstaVibeBrandDeal, declineInstaVibeBrandDeal, completeInstaVibeBrandDeal, getInstaVibeFeed, likeInstaVibePost, unlikeInstaVibePost, getInstaVibeComments, addInstaVibeComment, deleteInstaVibeComment, followInstaVibeUser, unfollowInstaVibeUser, getInstaVibeProfile, updateInstaVibeProfile, getInstaVibeChannel, postInstaVibeChannelMessage, reactInstaVibeChannel, getInstaVibeAnalytics } from './socialMedia/instaVibeHandler.ts';
import { createXpressPost, xpressLike, xpressRepost, xpressQuote, xpressComment, xpressFollow, xpressDeletePost, xpressEnsureAccount } from './socialMedia/xpressHandler.ts';
import { handleFanWarAction } from './socialMedia/fanWarHandler.ts';
import { boostTrend, sabotageTrend } from './socialMedia/trendPlayerActions.ts';
import { getMarketingPersonaSummary } from './socialMedia/marketingPersonaHandler.ts';
import { submitToRadioStation } from './socialMedia/appleCoreRadioHandler.ts';
import { acceptBrandDealForPlayer, getEligibleSponsorshipContracts, getVidWaveSponsorships } from './brandDealsModule.ts';
import { getAuthUser } from './lib/authFromRequest.ts';
import { insertNotificationIdempotent } from './notificationInsert.ts';
import { boostLoopTokPost, computeCompatibility } from './socialMedia/looptokTickModule.ts';
import { hydrateLoopTokChallengeWindow, isLoopTokChallengeActive, LOOPTOK_CHALLENGE_WINDOW, LOOPTOK_TREND_WINDOW } from './socialMedia/looptokChallengeWindow.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ACTION_ALIASES: Record<string, string> = {
  get_vidwave_sponsorships: 'getVidWaveSponsorships',
  looptok: 'createLoopTokPost',
  fanInteraction: 'generateFanMessages',
  instavibe: 'createInstaVibePost',
  xpress: 'createXpressPost',
};

const SUPPORTED_SOCIAL_MEDIA_ACTIONS = [
  'acceptBrandDeal',
  'acceptInstaVibeBrandDeal',
  'acceptVidWaveSponsorshipOffer',
  'addInstaVibeComment',
  'boostLoopTokPost',
  'boostTrend',
  'completeInstaVibeBrandDeal',
  'createInstaVibePost',
  'createLoopTokPost',
  'createXpressPost',
  'createYouTubeVideo',
  'declineInstaVibeBrandDeal',
  'deleteInstaVibeComment',
  'endorseNickname',
  'fanInteraction',
  'followInstaVibeUser',
  'generateFanMessages',
  'generateFanTheories',
  'getCollaborations',
  'getEligibleSponsorshipContracts',
  'getFanSentiment',
  'getForYouContent',
  'getInstaVibeAnalytics',
  'getInstaVibeBrandDeals',
  'getInstaVibeChannel',
  'getInstaVibeComments',
  'getInstaVibeFeed',
  'getInstaVibeProfile',
  'getLoopTokCreatorState',
  'getLoopTokDuetPartners',
  'getLoopTokSoundMetrics',
  'getLoopTokTrends',
  'getMarketingPersonaSummary',
  'getSampleRequests',
  'getSampleableSongs',
  'getVidWaveSponsorships',
  'get_vidwave_sponsorships',
  'handleFanWarAction',
  'instavibe',
  'interventFanWar',
  'joinLoopTokChallenge',
  'likeInstaVibePost',
  'looptok',
  'notifyLoopTokDuetPartner',
  'postInstaVibeChannelMessage',
  'reactInstaVibeChannel',
  'requestCollaboration',
  'requestSample',
  'respondToCollaboration',
  'respondToSampleRequest',
  'sabotageTrend',
  'simulateLiveStream',
  'submitToRadioStation',
  'triggerFanWar',
  'unfollowInstaVibeUser',
  'unlikeInstaVibePost',
  'updateInstaVibeProfile',
  'updateTrends',
  'xpress',
  'xpressComment',
  'xpressDeletePost',
  'xpressEnsureAccount',
  'xpressFollow',
  'xpressLike',
  'xpressQuote',
  'xpressRepost',
];

function jsonError(status: number, error: string, details: Record<string, unknown> | string, traceId: string) {
  return Response.json({ error, details, traceId }, { status, headers: corsHeaders });
}

async function normalizeErrorResponse(response: Response, traceId: string): Promise<Response> {
  if (response.status < 400) return response;

  try {
    const payload = await response.clone().json();
    const hasError = payload && typeof payload.error === 'string';
    const hasDetails = payload && Object.prototype.hasOwnProperty.call(payload, 'details');
    const hasTraceId = payload && typeof payload.traceId === 'string';

    if (hasError && hasDetails && hasTraceId) {
      return response;
    }

    return jsonError(
      response.status,
      hasError ? payload.error : 'Request failed',
      hasDetails ? payload.details : payload,
      hasTraceId ? payload.traceId : traceId,
    );
  } catch {
    return jsonError(response.status, 'Request failed', 'Non-JSON error response from handler', traceId);
  }
}

function normalizeAction(rawAction: unknown): string {
  const normalized = String(rawAction || '');
  return ACTION_ALIASES[normalized] || normalized;
}

async function resolvePlayerId(req: Request, body: Record<string, unknown>) {
  const { user } = await getAuthUser(req);
  if (user?.id) return user.id;
  return typeof body.artistId === 'string' ? body.artistId : '';
}

export async function handleRequest(req: Request) {
  // Generate trace ID for this request
  const traceId = crypto.randomUUID();
  
  // Log request start
  const startTime = Date.now();
  console.log(`[${traceId}] [SocialMediaRouter] Request received:`, req.method, req.url);
  
  // Check auth mode
  const authHeader = req.headers.get('authorization');
  const hasUserJwt = authHeader && !authHeader.startsWith('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.');
  console.log(`[${traceId}] Auth mode:`, hasUserJwt ? 'user JWT' : 'anon/service');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cloned = req.clone();
  let body;
  try {
    body = await cloned.json();
    console.log(`[${traceId}] [SocialMediaRouter] Parsed body:`, JSON.stringify(body, null, 2));
  } catch (parseErr: unknown) {
    console.error(`[${traceId}] [SocialMediaRouter] JSON parse error:`, parseErr);
    const errorMessage = parseErr instanceof Error ? parseErr.message : 'Unknown error';

    // #region agent log: SocialMediaRouter JSON parse error
    try {
      fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
        body: JSON.stringify({
          sessionId: 'f69218',
          runId: 'pre-debug',
          hypothesisId: 'H5',
          location: 'supabase/functions/_shared/socialMediaRouter.ts:jsonParseError',
          message: 'Router failed to parse JSON request body',
          data: {
            parseErrorMessage: errorMessage,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => { });
    } catch {
      // ignore logging failures
    }
    // #endregion

    return Response.json(
      { error: 'Invalid JSON in request body', details: errorMessage, traceId },
      { status: 400, headers: corsHeaders }
    );
  }
  
  const rawAction = body.action || new URL(req.url).searchParams.get('action');
  const action = normalizeAction(rawAction);
  const aliasUsed = typeof rawAction === 'string' && rawAction !== action;
  console.log(`[${traceId}] [SocialMediaRouter] Raw action:`, rawAction);
  console.log(`[${traceId}] [SocialMediaRouter] Normalized action:`, action);
  console.log(`[${traceId}] [SocialMediaRouter] Full body:`, JSON.stringify(body, null, 2));
  if (aliasUsed) {
    console.warn(`[${traceId}] [SocialMediaRouter] Legacy action alias used: ${rawAction} -> ${action}`);
  }

  // #region agent log: SocialMediaRouter parsed action + body shape
  try {
    fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
      body: JSON.stringify({
        sessionId: 'f69218',
        runId: 'pre-debug',
        hypothesisId: 'H2',
        location: 'supabase/functions/_shared/socialMediaRouter.ts:afterParse',
        message: 'Router parsed body action + keys subset',
        data: {
          rawAction: rawAction ?? null,
          action: action ?? null,
          bodyHasAction: Object.prototype.hasOwnProperty.call(body || {}, 'action'),
          bodyKeys: Object.keys(body || {}).slice(0, 25),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => { });
  } catch {
    // ignore logging failures
  }
  // #endregion

  let response: Response;
  try {
    switch (action) {
    case 'createYouTubeVideo':
      console.log(`[${traceId}] [SocialMediaRouter] DEBUG: createYouTubeVideo case matched`);
      console.log(`[${traceId}] [SocialMediaRouter] Calling createYouTubeVideo handler`);
      response = await createYouTubeVideo(req.clone());
      console.log(`[${traceId}] [SocialMediaRouter] createYouTubeVideo returned:`, response.status);
      break;
    case 'createLoopTokPost':
    case 'looptok':
      response = await createLoopTokPost(req.clone());
      break;
    case 'generateFanMessages':
    case 'fanInteraction':
      response = await generateFanMessages(req.clone());
      break;
    case 'simulateLiveStream':
      response = await simulateLiveStream(req.clone());
      break;
    case 'generateFanTheories':
      response = await generateFanTheories(req.clone());
      break;
    case 'updateTrends':
      response = await updateTrends(req.clone());
      break;
    case 'getForYouContent':
      response = await getForYouContent(req.clone());
      break;
    case 'requestCollaboration':
      response = await requestCollaboration(req.clone());
      break;
    case 'respondToCollaboration':
      response = await respondToCollaboration(req.clone());
      break;
    case 'getCollaborations':
      response = await getCollaborations(req.clone());
      break;
    case 'createInstaVibePost':
    case 'instavibe':
      response = await createInstaVibePost(req.clone());
      break;
    case 'getInstaVibeBrandDeals':
      response = await getInstaVibeBrandDeals(req.clone());
      break;
    case 'acceptInstaVibeBrandDeal':
      response = await acceptInstaVibeBrandDeal(req.clone());
      break;
    case 'declineInstaVibeBrandDeal':
      response = await declineInstaVibeBrandDeal(req.clone());
      break;
    case 'completeInstaVibeBrandDeal':
      response = await completeInstaVibeBrandDeal(req.clone());
      break;
    case 'createXpressPost':
    case 'xpress':
      response = await createXpressPost(req.clone());
      break;
    case 'xpressLike':
      response = await xpressLike(req.clone());
      break;
    case 'xpressRepost':
      response = await xpressRepost(req.clone());
      break;
    case 'xpressQuote':
      response = await xpressQuote(req.clone());
      break;
    case 'xpressComment':
      response = await xpressComment(req.clone());
      break;
    case 'xpressFollow':
      response = await xpressFollow(req.clone());
      break;
    case 'xpressDeletePost':
      response = await xpressDeletePost(req.clone());
      break;
    case 'xpressEnsureAccount':
      response = await xpressEnsureAccount(req.clone());
      break;
    case 'getInstaVibeFeed':
      response = await getInstaVibeFeed(req.clone());
      break;
    case 'likeInstaVibePost':
      response = await likeInstaVibePost(req.clone());
      break;
    case 'unlikeInstaVibePost':
      response = await unlikeInstaVibePost(req.clone());
      break;
    case 'getInstaVibeComments':
      response = await getInstaVibeComments(req.clone());
      break;
    case 'addInstaVibeComment':
      response = await addInstaVibeComment(req.clone());
      break;
    case 'deleteInstaVibeComment':
      response = await deleteInstaVibeComment(req.clone());
      break;
    case 'followInstaVibeUser':
      response = await followInstaVibeUser(req.clone());
      break;
    case 'unfollowInstaVibeUser':
      response = await unfollowInstaVibeUser(req.clone());
      break;
    case 'getInstaVibeProfile':
      response = await getInstaVibeProfile(req.clone());
      break;
    case 'updateInstaVibeProfile':
      response = await updateInstaVibeProfile(req.clone());
      break;
    case 'getInstaVibeChannel':
      response = await getInstaVibeChannel(req.clone());
      break;
    case 'postInstaVibeChannelMessage':
      response = await postInstaVibeChannelMessage(req.clone());
      break;
    case 'reactInstaVibeChannel':
      response = await reactInstaVibeChannel(req.clone());
      break;
    case 'getInstaVibeAnalytics':
      response = await getInstaVibeAnalytics(req.clone());
      break;
    case 'requestSample':
      response = await requestSampleHandler(req.clone());
      break;
    case 'respondToSampleRequest':
      response = await respondToSampleHandler(req.clone());
      break;
    case 'getSampleRequests':
      response = await getSampleRequestsHandler(req.clone());
      break;
    case 'getSampleableSongs':
      response = await getSampleableSongsHandler(req.clone());
      break;
    case 'getEligibleSponsorshipContracts': {
      try {
        const rows = await getEligibleSponsorshipContracts(body.artistId, body.platform || 'vidwave', body.currentTurn || 0);
        response = Response.json({ success: true, contracts: rows }, { headers: corsHeaders });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        response = jsonError(500, 'Failed to fetch eligible sponsorship contracts', { action, error: msg }, traceId);
      }
      break;
    }
    case 'getVidWaveSponsorships': {
      const { artistId, currentTurn = 0, platform = 'vidwave' } = body || {};
      if (!artistId) {
        response = Response.json({ success: false, error: 'artistId is required' }, { status: 400, headers: corsHeaders });
        break;
      }
      const rows = await getVidWaveSponsorships(artistId, currentTurn || 0, platform || 'vidwave');
      response = Response.json({ success: true, ...rows }, { headers: corsHeaders });
      break;
    }
    case 'acceptBrandDeal':
    case 'acceptVidWaveSponsorshipOffer': {
      const playerId = await resolvePlayerId(req, body || {});
      const { offerId, currentTurn = 0 } = body || {};
      const missing = [];
      if (!playerId) missing.push('authenticated user or artistId');
      if (!offerId) missing.push('offerId');
      if (missing.length > 0) {
        response = jsonError(400, 'Validation failed', {
          action,
          missing,
          reason: 'Offer acceptance requires player and offerId',
        }, traceId);
        break;
      }
      let acceptResult: Awaited<ReturnType<typeof acceptBrandDealForPlayer>>;
      try {
        acceptResult = await acceptBrandDealForPlayer(playerId, String(offerId), currentTurn || 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isBusinessError = msg.startsWith('Deal not found') ||
          msg.startsWith('This offer has expired') ||
          msg.startsWith('Exclusivity conflict') ||
          msg.startsWith('Maximum ');
        response = jsonError(isBusinessError ? 400 : 500, msg, { action, offerId }, traceId);
        break;
      }
      response = Response.json({
        success: true,
        contract: acceptResult?.contract || null,
        message: 'Contract signed. Signing bonus and payouts accrue through turn processing.',
      }, { headers: corsHeaders });
      break;
    }
    case 'getMarketingPersonaSummary':
      response = await getMarketingPersonaSummary(req.clone());
      break;
    case 'submitToRadioStation':
      response = await submitToRadioStation(req.clone());
      break;
    case 'boostLoopTokPost': {
      const playerId = await resolvePlayerId(req, body || {});
      const { postId } = body || {};
      if (!playerId || !postId) {
        response = jsonError(400, 'Missing artistId or postId', { action }, traceId);
        break;
      }
      const boostResult = await boostLoopTokPost(playerId, postId);
      response = Response.json(boostResult, { headers: corsHeaders });
      break;
    }
    case 'joinLoopTokChallenge': {
      const playerId = await resolvePlayerId(req, body || {});
      const { challengeId } = body || {};
      if (!playerId || !challengeId) {
        response = jsonError(400, 'Missing artistId or challengeId', { action }, traceId);
        break;
      }
      const currentTurn = Math.max(0, Number(body?.currentTurn || 0));
      const { data: challengeRow } = await supabaseAdmin
        .from('looptok_challenges')
        .select('*')
        .eq('id', challengeId)
        .maybeSingle();
      if (!challengeRow || !isLoopTokChallengeActive(challengeRow, currentTurn)) {
        response = jsonError(400, 'Challenge is no longer active', { action, challengeId, currentTurn }, traceId);
        break;
      }
      // Idempotent upsert
      const { data: joinRow, error: joinErr } = await supabaseAdmin
        .from('looptok_challenge_participation')
        .upsert({
          challenge_id: challengeId,
          artist_id: playerId,
          joined_turn: currentTurn,
        }, { onConflict: 'challenge_id,artist_id', ignoreDuplicates: true })
        .select()
        .maybeSingle();
      if (joinErr) {
        response = jsonError(500, 'Failed to join challenge', joinErr.message, traceId);
      } else {
        // If ignoreDuplicates returned null, the row already existed — fetch it
        const participation = joinRow ?? (await supabaseAdmin
          .from('looptok_challenge_participation')
          .select()
          .eq('challenge_id', challengeId)
          .eq('artist_id', playerId)
          .maybeSingle()
        ).data;
        response = Response.json({ success: true, participation }, { headers: corsHeaders });
      }
      break;
    }
    case 'getLoopTokCreatorState': {
      const playerId = await resolvePlayerId(req, body || {});
      if (!playerId) {
        response = jsonError(400, 'Missing artistId', { action }, traceId);
        break;
      }
      const { data: stateRow } = await supabaseAdmin
        .from('looptok_creator_state')
        .select('*')
        .eq('artist_id', playerId)
        .maybeSingle();
      const { data: challenges } = await supabaseAdmin
        .from('looptok_challenges')
        .select('*, looptok_challenge_participation!left(artist_id, progress_score, award_level, completed_turn)')
        .eq('is_active', true);
      response = Response.json({
        success: true,
        creatorState: stateRow || { algorithm_state: 'neutral', algorithm_multiplier: 1.0, content_pillars: [], pillar_streak: 0 },
        challenges: challenges || [],
      }, { headers: corsHeaders });
      break;
    }
    case 'getLoopTokSoundMetrics': {
      const { data: latestTurn } = await supabaseAdmin
        .from('looptok_sound_metrics')
        .select('global_turn_id')
        .order('global_turn_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      const turnId = latestTurn?.global_turn_id ?? 0;
      const { data: metrics } = await supabaseAdmin
        .from('looptok_sound_metrics')
        .select('*')
        .eq('global_turn_id', turnId)
        .order('uses_count', { ascending: false });
      response = Response.json({ success: true, turn: turnId, sounds: metrics || [] }, { headers: corsHeaders });
      break;
    }
    case 'getLoopTokTrends': {
      const { currentTurnId = 0 } = body || {};
      const safeTurn = Math.max(0, Number(currentTurnId) || 0);
      const trendBatch = Math.floor(safeTurn / LOOPTOK_TREND_WINDOW) % 5;
      const challengeBatch = Math.floor(safeTurn / LOOPTOK_CHALLENGE_WINDOW) % 5;

      const [trendsRes, challengesRes, beefRes, fanWarRes, releaseRes] = await Promise.all([
        supabaseAdmin
          .from('looptok_active_trends')
          .select('*')
          .eq('pool_batch', trendBatch)
          .eq('is_active', true),
        supabaseAdmin
          .from('looptok_challenges')
          .select('*')
          .eq('is_active', true)
          .limit(40),
        supabaseAdmin
          .from('beefs')
          .select('id, aggressor_id, target_id, status, aggressor_score, target_score, chain_length, controversy_level, turn_initiated')
          .eq('status', 'active')
          .order('controversy_level', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('fan_wars')
          .select('id, artist_id, rival_artist_id, status, intensity, follower_impact')
          .eq('status', 'active')
          .order('intensity', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('releases')
          .select('id, artist_id, title, release_name, genre, lifetime_streams, lifecycle_state, created_at')
          .in('lifecycle_state', ['Hot', 'Trending', 'Momentum', 'Stable'])
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      // Enrich beefs with artist names
      const allArtistIds = new Set<string>();
      (beefRes.data || []).forEach((b: any) => { allArtistIds.add(b.aggressor_id); allArtistIds.add(b.target_id); });
      (fanWarRes.data || []).forEach((w: any) => { allArtistIds.add(w.artist_id); if (w.rival_artist_id) allArtistIds.add(w.rival_artist_id); });
      (releaseRes.data || []).forEach((release: any) => { if (release.artist_id) allArtistIds.add(release.artist_id); });

      let nameMap: Record<string, string> = {};
      if (allArtistIds.size > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, artist_name')
          .in('id', Array.from(allArtistIds));
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.artist_name || 'Unknown'; });
      }

      const beefs = (beefRes.data || []).map((b: any) => ({
        ...b,
        aggressor_name: nameMap[b.aggressor_id] || 'Unknown',
        target_name: nameMap[b.target_id] || 'Unknown',
      }));
      const fanWars = (fanWarRes.data || []).map((w: any) => ({
        ...w,
        artist_name: nameMap[w.artist_id] || 'Unknown',
        rival_name: w.rival_artist_id ? (nameMap[w.rival_artist_id] || 'Unknown') : null,
      }));
      const lifecycleRank: Record<string, number> = { Hot: 4, Trending: 3, Momentum: 2, Stable: 1 };
      const trendingSounds = (releaseRes.data || [])
        .filter((release: any) => release?.artist_id)
        .map((release: any) => ({
          sound_id: `release:${release.id}`,
          release_id: release.id,
          release_name: release.release_name || release.title || 'Untitled',
          genre: release.genre || 'Music',
          uses_count: Math.max(1, Math.floor(Number(release.lifetime_streams || 0) * 0.03)),
          trend_state: release.lifecycle_state === 'Hot' || release.lifecycle_state === 'Trending'
            ? 'peak'
            : release.lifecycle_state === 'Momentum'
              ? 'rising'
              : 'stable',
          lifecycle_state: release.lifecycle_state,
          artist_name: nameMap[release.artist_id] || 'Unknown',
          artist_id: release.artist_id,
          is_player_sound: true,
          created_at: release.created_at,
        }))
        .sort((a: any, b: any) => {
          const lifecycleDelta = (lifecycleRank[b.lifecycle_state] || 0) - (lifecycleRank[a.lifecycle_state] || 0);
          if (lifecycleDelta !== 0) return lifecycleDelta;
          if (b.uses_count !== a.uses_count) return b.uses_count - a.uses_count;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        })
        .slice(0, 15);
      const activeChallenges = (challengesRes.data || [])
        .filter((challenge: any) => isLoopTokChallengeActive(challenge, safeTurn))
        .map((challenge: any) => {
          const hydrated = hydrateLoopTokChallengeWindow(challenge, safeTurn);
          return {
            ...hydrated,
            start_turn: hydrated.effective_start_turn,
            end_turn: hydrated.effective_end_turn,
          };
        })
        .filter((challenge: any) => Number(challenge.pool_batch) === challengeBatch || !challenge.is_pool_challenge)
        .slice(0, 5);

      response = Response.json({
        success: true,
        trendBatch,
        challengeBatch,
        trends: trendsRes.data || [],
        challenges: activeChallenges,
        beefs,
        fanWars,
        trendingSounds,
      }, { headers: corsHeaders });
      break;
    }
    case 'getLoopTokDuetPartners': {
      const playerId = await resolvePlayerId(req, body || {});
      if (!playerId) {
        response = jsonError(400, 'Missing artistId', { action }, traceId);
        break;
      }
      // Get real players + NPC duet partners
      const { data: artist } = await supabaseAdmin.from('profiles').select('genre, region').eq('id', playerId).single();
      const { data: otherPlayers } = await supabaseAdmin
        .from('profiles')
        .select('id, artist_name, genre, region, followers')
        .neq('id', playerId)
        .eq('is_npc', false)
        .limit(20);
      const partners = (otherPlayers || []).map((p: any) => {
        const compat = computeCompatibility(
          artist || {},
          p,
          null, null,
          body.currentTurn || 0,
        );
        return { id: p.id, name: p.artist_name, followers: p.followers, genre: p.genre, is_npc: false, ...compat };
      }).sort((a: any, b: any) => b.score - a.score).slice(0, 10);
      response = Response.json({ success: true, partners }, { headers: corsHeaders });
      break;
    }
    case 'notifyLoopTokDuetPartner': {
      const playerId = await resolvePlayerId(req, body || {});
      const duetPartnerId = typeof body.duetPartnerId === 'string' ? body.duetPartnerId : '';
      const postId = typeof body.postId === 'string' ? body.postId : '';
      const caption = typeof body.caption === 'string' ? body.caption : '';

      if (!playerId || !duetPartnerId || !postId) {
        response = jsonError(400, 'Missing required fields', {
          action,
          playerId: !!playerId,
          duetPartnerId: !!duetPartnerId,
          postId: !!postId,
        }, traceId);
        break;
      }

      if (duetPartnerId === playerId) {
        response = Response.json({ success: true, skipped: true, reason: 'self_duet' }, { headers: corsHeaders });
        break;
      }

      const { data: actor } = await supabaseAdmin
        .from('profiles')
        .select('artist_name')
        .eq('id', playerId)
        .maybeSingle();

      const actorName = actor?.artist_name || 'An artist';
      const idempotencyKey = `looptok_duet:${postId}:${playerId}:${duetPartnerId}`;

      const { error: notifErr } = await insertNotificationIdempotent(supabaseAdmin, {
          player_id: duetPartnerId,
          type: 'LOOPTOK_DUET',
          title: 'New Duet',
          subtitle: `${actorName} dueted your LoopTok`,
          body: caption ? caption.slice(0, 160) : 'Open LoopTok to see it.',
          metrics: { platform: 'looptok', post_id: postId, actor_id: playerId },
          deep_links: [{ label: 'Open LoopTok', route: 'Social' }],
          idempotency_key: idempotencyKey,
          priority: 'medium',
          is_read: false,
          context: {},
        }, 'socialMediaRouter.looptokDuet');

      if (notifErr) {
        response = jsonError(500, 'Failed to create duet notification', notifErr.message, traceId);
        break;
      }

      response = Response.json({ success: true }, { headers: corsHeaders });
      break;
    }
    case 'boostTrend':
      response = await boostTrend(req.clone());
      break;
    case 'sabotageTrend':
      response = await sabotageTrend(req.clone());
      break;
    case 'getFanSentiment':
    case 'endorseNickname':
    case 'triggerFanWar':
    case 'interventFanWar':
    case 'handleFanWarAction':
      response = await handleFanWarAction(req.clone(), action);
      break;
    default:
      console.error(`[${traceId}] [SocialMediaRouter] Unknown action:`, action);
      response = jsonError(400, `Unknown social media action: ${action}`, {
        action,
        reason: 'Action is missing or not registered in socialMediaRouter',
        available: SUPPORTED_SOCIAL_MEDIA_ACTIONS,
      }, traceId);
      break;
    }
    
    response = await normalizeErrorResponse(response, traceId);

    // Add CORS headers to all responses (handlers may not include them)
    Object.entries(corsHeaders).forEach(([key, value]) => {
      if (!response.headers.has(key)) {
        response.headers.set(key, value);
      }
    });

    // Add trace ID to response headers for debugging
    response.headers.set('x-trace-id', traceId);
    
    const duration = Date.now() - startTime;
    console.log(`[${traceId}] [SocialMediaRouter][ActionTelemetry] ${JSON.stringify({
      raw_action: rawAction ?? null,
      action,
      alias_used: aliasUsed,
      artist_id: typeof body?.artistId === 'string' ? body.artistId : null,
      status: response.status,
      success: response.status < 400,
      duration_ms: duration,
    })}`);
    console.log(`[${traceId}] [SocialMediaRouter] Response sent:`, response.status, `(${duration}ms)`);
    
    return response;
  } catch (err: unknown) {
    // Catch any unexpected errors and return proper JSON
    console.error(`[${traceId}] [SocialMediaRouter] Unhandled error:`, err);
    const errorMessage = err instanceof Error ? err.message : err?.toString() || 'Unknown error';
    const errorResponse = jsonError(500, 'Internal server error', errorMessage, traceId);
    
    errorResponse.headers.set('x-trace-id', traceId);
    return errorResponse;
  }
}

// @ts-ignore - Deno global is available in Supabase Edge Functions
Deno.serve((req: Request) => handleRequest(req));
