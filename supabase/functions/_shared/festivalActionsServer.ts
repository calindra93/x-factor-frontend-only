/**
 * AMPLIFI FESTIVAL SYSTEM — Player Actions API (Phase 2 + Phase 3 + Phase 4)
 *
 * Routes:
 *   subAction: 'stageSnipe'           — Stage a rival snipe action
 *   subAction: 'respondOffer'         — Accept/decline a backstage offer
 *   subAction: 'myRivalActions'       — Get my staged/resolved rival actions for a festival
 *   subAction: 'myBackstageOffers'    — Get my pending/resolved backstage offers for a festival
 *   subAction: 'influence'            — Get my current influence points
 *   subAction: 'initiateBackstageDeal' — Player-initiated backstage deal offer (Phase 3)
 *   subAction: 'resolveHighlightClip' — Choose distribution for a highlight clip (Phase 3)
 *   subAction: 'getTruces'            — Get active/pending truces for a festival instance (Phase 3)
 *   subAction: 'respondToTruce'       — Respond to a truce (Phase 3)
 *   subAction: 'submitEntry'          — Submit/update festival entry (Phase 4)
 *   subAction: 'saveSetlist'          — Save/lock festival setlist (Phase 4)
 *   subAction: 'withdrawEntry'        — Withdraw festival entry (Phase 4)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { respondToTruce, stageRivalSnipe, type StageSnipeParams, type SnipeActionType } from './festivalRivalModule.ts';
import { respondToBackstageOffer } from './festivalBackstageModule.ts';
import { BRAND_BOOST_DURATION_TURNS } from './festivalGlobalModule.ts';

// ── A-5: UUID Validation Helper ───────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(val: unknown): val is string {
  return typeof val === 'string' && UUID_RE.test(val);
}

// ── SafeErrorResponse helper ──────────────────────────────────────────────────

export function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({
    error: message,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_LANES = ['HEADLINER', 'MAIN_PRIME', 'MAIN_EARLY', 'SECOND_PRIME', 'DISCOVERY', 'SPOTLIGHT'] as const;
const VALID_POSTURES = ['CLEAN', 'EDGY', 'CHAOTIC'] as const;
const DAILY_BACKSTAGE_OFFER_CAP = 3;
const DAILY_HIGHLIGHT_CLIP_CAP = 5;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function getSupabaseUser(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

const VALID_PLAYER_INITIATED_DEAL_TYPES = ['TOURING_INVITE', 'SYNC_PITCH'] as const;

export async function handleFestivalAction(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return errorResponse('Not authenticated', 401);
    }

    const supabaseUser = getSupabaseUser(authHeader);
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return errorResponse('Invalid token', 401);
    }

    const body = await req.json();
    const { subAction } = body;
    const supabaseAdmin = getSupabaseAdmin();

    // A-5: UUID validation for all ID fields
    const uuidFields: Array<{ field: string; required: boolean; actions?: string[] }> = [
      { field: 'festivalInstanceId', required: false, actions: ['stageSnipe', 'myRivalActions', 'myBackstageOffers', 'initiateBackstageDeal', 'getTruces', 'submitEntry', 'saveSetlist', 'withdrawEntry'] },
      { field: 'targetArtistId', required: false, actions: ['stageSnipe', 'initiateBackstageDeal'] },
      { field: 'offerId', required: false, actions: ['respondOffer'] },
      { field: 'truceId', required: false, actions: ['respondToTruce'] },
      { field: 'clipId', required: false, actions: ['resolveHighlightClip'] },
      { field: 'festivalDayId', required: false, actions: ['initiateBackstageDeal'] },
    ];
    for (const { field, actions } of uuidFields) {
      const val = body[field];
      if (val !== undefined && val !== null && val !== '') {
        if (actions && !actions.includes(subAction)) continue;
        if (!isValidUUID(val)) {
          return errorResponse(`Invalid UUID format for ${field}`, 400);
        }
      }
    }

    // Get current global turn
    const { data: turnState } = await supabaseAdmin
      .from('turn_state')
      .select('global_turn_id')
      .eq('id', 1)
      .maybeSingle();
    const globalTurnId = turnState?.global_turn_id ?? 0;

    switch (subAction) {
      case 'stageSnipe': {
        const params: StageSnipeParams = {
          festivalInstanceId: body.festivalInstanceId,
          attackerArtistId: user.id,
          targetArtistId: body.targetArtistId,
          actionType: body.actionType as SnipeActionType,
          appliesToDayIndex: body.dayIndex,
          payload: body.payload || {},
          globalTurnId,
        };
        const result = await stageRivalSnipe(supabaseAdmin, params);
        // BUG 1 FIX: Business-rule failures return 200 with success:false for polite frontend handling
        return new Response(JSON.stringify(result), { status: 200 });
      }

      case 'respondOffer': {
        const result = await respondToBackstageOffer(supabaseAdmin, {
          offerId: body.offerId,
          artistId: user.id,
          accept: !!body.accept,
          globalTurnId,
        });
        // BUG 1 FIX: Business-rule failures return 200 with success:false for polite frontend handling
        return new Response(JSON.stringify(result), { status: 200 });
      }

      case 'respondToTruce': {
        const result = await respondToTruce(supabaseAdmin, {
          truceId: body.truceId,
          artistId: user.id,
          accept: !!body.accept,
          globalTurnId,
        });
        // BUG 1 FIX: Business-rule failures return 200 with success:false for polite frontend handling
        return new Response(JSON.stringify(result), { status: 200 });
      }

      case 'myRivalActions': {
        const { data } = await supabaseAdmin
          .from('festival_rival_actions')
          .select('*, target:profiles!festival_rival_actions_target_artist_id_fkey(id, artist_name), attacker:profiles!festival_rival_actions_attacker_artist_id_fkey(id, artist_name)')
          .eq('festival_instance_id', body.festivalInstanceId)
          .or(`attacker_artist_id.eq.${user.id},target_artist_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        return new Response(JSON.stringify({ success: true, actions: data || [] }));
      }

      case 'myBackstageOffers': {
        const { data } = await supabaseAdmin
          .from('festival_backstage_offers')
          .select('*, from_artist:profiles!festival_backstage_offers_from_artist_id_fkey(id, artist_name)')
          .eq('festival_instance_id', body.festivalInstanceId)
          .or(`to_artist_id.eq.${user.id},from_artist_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        return new Response(JSON.stringify({ success: true, offers: data || [] }));
      }

      case 'influence': {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('influence_points')
          .eq('id', user.id)
          .single();

        return new Response(JSON.stringify({
          success: true,
          influence_points: Number(profile?.influence_points ?? 8),
        }));
      }

      // ── Phase 3: Player-initiated backstage deal offer ─────────────────
      case 'initiateBackstageDeal': {
        const { festivalInstanceId, festivalDayId, targetArtistId, offerType, payload } = body;
        if (!festivalInstanceId || !targetArtistId || !offerType) {
          return errorResponse('Missing required fields', 400);
        }

        // Validate caller is in the lineup for this instance
        const { data: slot } = await supabaseAdmin
          .from('festival_lineup_slots')
          .select('id, lane')
          .eq('festival_instance_id', festivalInstanceId)
          .eq('artist_id', user.id)
          .maybeSingle();

        if (!slot) {
          return errorResponse('Not in lineup for this festival', 403);
        }

        // A-3: Validate target artist is also in the lineup
        const { data: targetSlot } = await supabaseAdmin
          .from('festival_lineup_slots')
          .select('id')
          .eq('festival_instance_id', festivalInstanceId)
          .eq('artist_id', targetArtistId)
          .maybeSingle();

        if (!targetSlot) {
          return errorResponse('Target artist is not in this festival lineup', 400);
        }

        // A-4: Daily cap check for backstage offers
        const { count: dailyOfferCount } = await supabaseAdmin
          .from('festival_backstage_offers')
          .select('id', { count: 'exact', head: true })
          .eq('from_artist_id', user.id)
          .eq('festival_instance_id', festivalInstanceId)
          .eq('player_initiated', true);

        if ((dailyOfferCount ?? 0) >= DAILY_BACKSTAGE_OFFER_CAP) {
          return errorResponse(`Max ${DAILY_BACKSTAGE_OFFER_CAP} backstage offers per festival`, 429);
        }

        // Prevent duplicate pending offers
        const { data: existing } = await supabaseAdmin
          .from('festival_backstage_offers')
          .select('id')
          .eq('festival_instance_id', festivalInstanceId)
          .eq('from_artist_id', user.id)
          .eq('to_artist_id', targetArtistId)
          .eq('status', 'OFFERED')
          .maybeSingle();

        if (existing) {
          return errorResponse('A pending offer to this artist already exists', 409);
        }

        if (!VALID_PLAYER_INITIATED_DEAL_TYPES.includes(offerType)) {
          return errorResponse(`Invalid offer type: ${offerType}`, 400);
        }

        const { data: offer, error: insertErr } = await supabaseAdmin
          .from('festival_backstage_offers')
          .insert({
            festival_instance_id: festivalInstanceId,
            festival_instance_day_id: festivalDayId || null,
            from_artist_id: user.id,
            to_artist_id: targetArtistId,
            offer_type: offerType,
            status: 'OFFERED',
            expires_turn_id: globalTurnId + 48,
            payload: payload || {},
            player_initiated: true,
            created_turn_id: globalTurnId,
          })
          .select()
          .single();

        if (insertErr) {
          return errorResponse(insertErr.message, 500);
        }

        return new Response(JSON.stringify({ success: true, offer }));
      }

      // ── Phase 3: Player chooses highlight clip distribution ────────────
      case 'resolveHighlightClip': {
        const { clipId, distribution } = body;
        if (!clipId || !distribution) {
          return errorResponse('Missing clipId or distribution', 400);
        }

        const VALID_DISTRIBUTIONS = ['FAN_CLIP', 'PRESS_CLIP', 'BRAND_CLIP'];
        if (!VALID_DISTRIBUTIONS.includes(distribution)) {
          return errorResponse(`Invalid distribution: ${distribution}`, 400);
        }

        // Verify ownership
        const { data: clip } = await supabaseAdmin
          .from('festival_highlight_clips')
          .select('id, artist_id, effect_applied, moment_card_type, festival_instance_id')
          .eq('id', clipId)
          .maybeSingle();

        if (!clip || clip.artist_id !== user.id) {
          return errorResponse('Clip not found or unauthorized', 404);
        }

        if (clip.effect_applied) {
          return errorResponse('Clip effect already applied', 409);
        }

        // A-4: Daily cap check for highlight clip resolutions
        const { count: dailyClipCount } = await supabaseAdmin
          .from('festival_highlight_clips')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', user.id)
          .eq('festival_instance_id', clip.festival_instance_id)
          .eq('effect_applied', true);

        if ((dailyClipCount ?? 0) >= DAILY_HIGHLIGHT_CLIP_CAP) {
          return errorResponse(`Max ${DAILY_HIGHLIGHT_CLIP_CAP} clip distributions per festival`, 429);
        }

        // Compute effect summary based on distribution choice
        const effectSummary: Record<string, string> = {
          FAN_CLIP:   'Shared with fans — bonus LoopTok views + follower surge',
          PRESS_CLIP: 'Pitched to press — credibility boost + news coverage chance',
          BRAND_CLIP: 'Sent to brand scouts — festival_brand_boost extension',
        };

        const { error: updateErr } = await supabaseAdmin
          .from('festival_highlight_clips')
          .update({
            chosen_distribution: distribution,
            effect_applied: true,
            effect_summary: {
              summary: effectSummary[distribution],
              distribution,
              applied_turn_id: globalTurnId,
            },
          })
          .eq('id', clipId);

        if (updateErr) {
          return errorResponse(updateErr.message, 500);
        }

        // Apply immediate profile/brand effect
        if (distribution === 'BRAND_CLIP') {
          await supabaseAdmin.from('player_brand_stats').upsert({
            artist_id: user.id,
            platform: 'all',
            festival_brand_boost: 25,
            festival_boost_expires_turn: globalTurnId + BRAND_BOOST_DURATION_TURNS,
            last_brand_turn: globalTurnId,
          }, { onConflict: 'artist_id,platform' });
        }

        return new Response(JSON.stringify({ success: true, distribution, effect: effectSummary[distribution] }));
      }

      // ── Phase 3: Get truces for a festival instance ─────────────────────
      case 'getTruces': {
        const { festivalInstanceId } = body;
        if (!festivalInstanceId) {
          return errorResponse('Missing festivalInstanceId', 400);
        }

        const { data: truces } = await supabaseAdmin
          .from('festival_truces')
          .select(`
            *,
            offerer:profiles!festival_truces_offerer_id_fkey(id, artist_name),
            target:profiles!festival_truces_target_id_fkey(id, artist_name)
          `)
          .eq('festival_instance_id', festivalInstanceId)
          .or(`offerer_id.eq.${user.id},target_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        return new Response(JSON.stringify({ success: true, truces: truces || [] }));
      }

      // ── Phase 4: Server-authoritative entry submission ─────────────────
      case 'submitEntry': {
        const { festivalInstanceId, desired_lane, rehearsal_investment, visuals_budget, posture, wristband_opted_in, set_length } = body;

        if (!festivalInstanceId) {
          return errorResponse('Missing festivalInstanceId', 400);
        }

        // Validate lane
        if (desired_lane && !VALID_LANES.includes(desired_lane)) {
          return errorResponse(`Invalid lane: ${desired_lane}`, 400);
        }

        // Validate posture
        const safePosture = posture && VALID_POSTURES.includes(posture) ? posture : 'CLEAN';

        // Validate numeric fields within bounds
        const safeRehearsalInv = typeof rehearsal_investment === 'number'
          ? Math.max(0, Math.min(100, rehearsal_investment))
          : 50;
        const safeVisualsBudget = typeof visuals_budget === 'number'
          ? Math.max(0, Math.min(100, visuals_budget))
          : 50;
        const safeSetLength = typeof set_length === 'number'
          ? Math.max(15, Math.min(90, set_length))
          : 30;

        // Verify festival instance exists and is accepting submissions
        const { data: instance } = await supabaseAdmin
          .from('festival_instances')
          .select('id, status, festival_id')
          .eq('id', festivalInstanceId)
          .maybeSingle();

        if (!instance) {
          return errorResponse('Festival instance not found', 404);
        }

        // Canonical instance lifecycle uses OPEN/CLOSED (not legacy APPS_* states).
        if (instance.status !== 'OPEN') {
          return errorResponse('Festival is not accepting submissions', 400);
        }

        const { data: submission, error: upsertErr } = await supabaseAdmin
          .from('festival_submissions')
          .upsert({
            festival_instance_id: festivalInstanceId,
            artist_id: user.id,
            desired_lane: desired_lane || 'DISCOVERY',
            rehearsal_investment: safeRehearsalInv,
            visuals_budget: safeVisualsBudget,
            posture: safePosture,
            wristband_opted_in: wristband_opted_in !== false,
            set_length: safeSetLength,
            submitted_turn_id: globalTurnId,
            status: 'SUBMITTED',
          }, { onConflict: 'festival_instance_id,artist_id' })
          .select()
          .single();

        if (upsertErr) {
          return errorResponse(upsertErr.message, 500);
        }

        return new Response(JSON.stringify({ success: true, submission }));
      }

      // ── Phase 4: Server-authoritative setlist save ─────────────────────
      case 'saveSetlist': {
        const { festivalInstanceId, lane, songs, locked } = body;

        if (!festivalInstanceId) {
          return errorResponse('Missing festivalInstanceId', 400);
        }

        // Validate lane
        if (lane && !VALID_LANES.includes(lane)) {
          return errorResponse(`Invalid lane: ${lane}`, 400);
        }

        // Validate songs array (supports legacy object entries and UUID strings)
        const rawSongs: any[] = Array.isArray(songs) ? songs : [];
        const songIds: string[] = rawSongs
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object') return entry.songId || entry.id || null;
            return null;
          })
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (songIds.length !== rawSongs.length) {
          return errorResponse('Invalid songs payload: expected UUID strings or objects with songId/id', 400);
        }

        for (const songId of songIds) {
          if (!isValidUUID(songId)) {
            return errorResponse(`Invalid song UUID: ${songId}`, 400);
          }
        }

        // S-4: Validate songs belong to the artist
        if (songIds.length > 0) {
          const { data: ownedSongs } = await supabaseAdmin
            .from('songs')
            .select('id')
            .eq('artist_id', user.id)
            .in('id', songIds);

          const ownedIds = new Set((ownedSongs || []).map((s: { id: string }) => s.id));
          const invalidSongs = songIds.filter(id => !ownedIds.has(id));
          if (invalidSongs.length > 0) {
            return errorResponse(`Songs not owned by artist: ${invalidSongs.join(', ')}`, 400);
          }
        }

        // Verify festival instance exists
        const { data: instance } = await supabaseAdmin
          .from('festival_instances')
          .select('id, status')
          .eq('id', festivalInstanceId)
          .maybeSingle();

        if (!instance) {
          return errorResponse('Festival instance not found', 404);
        }

        // Get existing setlist to check if already locked
        const { data: existingSetlist } = await supabaseAdmin
          .from('festival_setlists')
          .select('id, locked')
          .eq('festival_instance_id', festivalInstanceId)
          .eq('artist_id', user.id)
          .maybeSingle();

        if (existingSetlist?.locked) {
          return errorResponse('Setlist is already locked', 409);
        }

        const { data: setlist, error: upsertErr } = await supabaseAdmin
          .from('festival_setlists')
          .upsert({
            festival_instance_id: festivalInstanceId,
            artist_id: user.id,
            lane: lane || 'DISCOVERY',
            songs: songIds,
            locked: locked === true,
          }, { onConflict: 'festival_instance_id,artist_id' })
          .select()
          .single();

        if (upsertErr) {
          return errorResponse(upsertErr.message, 500);
        }

        return new Response(JSON.stringify({ success: true, setlist }));
      }

      // ── Phase 4: Server-authoritative entry withdrawal ─────────────────
      case 'withdrawEntry': {
        const { festivalInstanceId } = body;

        if (!festivalInstanceId) {
          return errorResponse('Missing festivalInstanceId', 400);
        }

        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('festival_submissions')
          .update({ status: 'WITHDRAWN' })
          .eq('festival_instance_id', festivalInstanceId)
          .eq('artist_id', user.id)
          .eq('status', 'SUBMITTED')
          .select()
          .maybeSingle();

        if (updateErr) {
          return errorResponse(updateErr.message, 500);
        }

        if (!updated) {
          return errorResponse('No active submission found to withdraw', 404);
        }

        return new Response(JSON.stringify({ success: true, submission: updated }));
      }

      // ── Approach C: Get follow-through artifacts for a player ────────────
      case 'getFollowThroughArtifacts': {
        const { festivalInstanceId, includeExpired } = body;

        // Query collaboration_requests with source_backstage_deal_id (from backstage deals)
        let collabQuery = supabaseAdmin
          .from('collaboration_requests')
          .select(`
            id,
            requester_artist_id,
            target_artist_id,
            collaboration_type,
            status,
            proposed_concept,
            source_backstage_deal_id,
            created_at,
            requester:profiles!collaboration_requests_requester_artist_id_fkey(id, artist_name, artist_image),
            target:profiles!collaboration_requests_target_artist_id_fkey(id, artist_name, artist_image)
          `)
          .not('source_backstage_deal_id', 'is', null)
          .or(`requester_artist_id.eq.${user.id},target_artist_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(20);

        const { data: collabs } = await collabQuery;

        // Query tour_support_invites 
        let tourQuery = supabaseAdmin
          .from('tour_support_invites')
          .select(`
            id,
            source_backstage_deal_id,
            headliner_id,
            opener_id,
            status,
            created_turn_id,
            expires_turn_id,
            redeemed_tour_id,
            payload,
            created_at,
            headliner:profiles!tour_support_invites_headliner_id_fkey(id, artist_name, artist_image),
            opener:profiles!tour_support_invites_opener_id_fkey(id, artist_name, artist_image)
          `)
          .or(`headliner_id.eq.${user.id},opener_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!includeExpired) {
          tourQuery = tourQuery.neq('status', 'EXPIRED');
        }

        const { data: tourInvites } = await tourQuery;

        // Query sync_pitch_leads
        let syncQuery = supabaseAdmin
          .from('sync_pitch_leads')
          .select(`
            id,
            source_backstage_deal_id,
            player_id,
            from_artist_id,
            status,
            created_turn_id,
            expires_turn_id,
            pitch,
            created_at,
            from_artist:profiles!sync_pitch_leads_from_artist_id_fkey(id, artist_name, artist_image)
          `)
          .eq('player_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!includeExpired) {
          syncQuery = syncQuery.neq('status', 'EXPIRED');
        }

        const { data: syncLeads } = await syncQuery;

        // If festivalInstanceId is provided, filter to deals from that festival
        let filteredCollabs = collabs || [];
        let filteredTourInvites = tourInvites || [];
        let filteredSyncLeads = syncLeads || [];

        if (festivalInstanceId && isValidUUID(festivalInstanceId)) {
          // Get deal IDs for this festival
          const { data: festivalDeals } = await supabaseAdmin
            .from('festival_backstage_deals')
            .select('id')
            .eq('festival_instance_id', festivalInstanceId);
          
          const festivalDealIds = new Set((festivalDeals || []).map(d => d.id));

          filteredCollabs = filteredCollabs.filter(c => festivalDealIds.has(c.source_backstage_deal_id));
          filteredTourInvites = filteredTourInvites.filter(t => festivalDealIds.has(t.source_backstage_deal_id));
          filteredSyncLeads = filteredSyncLeads.filter(s => festivalDealIds.has(s.source_backstage_deal_id));
        }

        // Summary counts
        const summary = {
          pending_collabs: filteredCollabs.filter(c => c.status === 'pending' && c.target_artist_id === user.id).length,
          pending_tour_invites: filteredTourInvites.filter(t => t.status === 'PENDING' && t.opener_id === user.id).length,
          new_sync_leads: filteredSyncLeads.filter(s => s.status === 'NEW').length,
        };

        return new Response(JSON.stringify({
          success: true,
          artifacts: {
            collaboration_requests: filteredCollabs,
            tour_support_invites: filteredTourInvites,
            sync_pitch_leads: filteredSyncLeads,
          },
          summary,
        }));
      }

      // ── Approach C: Action a sync pitch lead ─────────────────────────────
      case 'actionSyncLead': {
        const { leadId, action: leadAction } = body;

        if (!leadId || !isValidUUID(leadId)) {
          return errorResponse('Invalid leadId', 400);
        }

        if (!['ACTIONED', 'DISMISSED'].includes(leadAction)) {
          return errorResponse('action must be ACTIONED or DISMISSED', 400);
        }

        // Verify ownership and status
        const { data: lead } = await supabaseAdmin
          .from('sync_pitch_leads')
          .select('id, player_id, status')
          .eq('id', leadId)
          .maybeSingle();

        if (!lead || lead.player_id !== user.id) {
          return errorResponse('Lead not found or unauthorized', 404);
        }

        if (lead.status !== 'NEW') {
          return errorResponse('Lead has already been actioned', 409);
        }

        const { error: updateErr } = await supabaseAdmin
          .from('sync_pitch_leads')
          .update({ 
            status: leadAction,
            actioned_turn_id: globalTurnId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);

        if (updateErr) {
          return errorResponse(updateErr.message, 500);
        }

        return new Response(JSON.stringify({ success: true, status: leadAction }));
      }

      // ── Approach C: Respond to tour support invite ───────────────────────
      case 'respondTourSupportInvite': {
        const { inviteId, accept } = body;

        if (!inviteId || !isValidUUID(inviteId)) {
          return errorResponse('Invalid inviteId', 400);
        }

        // Verify ownership (opener) and status
        const { data: invite } = await supabaseAdmin
          .from('tour_support_invites')
          .select('id, opener_id, headliner_id, status, expires_turn_id')
          .eq('id', inviteId)
          .maybeSingle();

        if (!invite || invite.opener_id !== user.id) {
          return errorResponse('Invite not found or unauthorized', 404);
        }

        if (invite.status !== 'PENDING') {
          return errorResponse('Invite is no longer pending', 409);
        }

        if (globalTurnId > invite.expires_turn_id) {
          // Auto-expire if past deadline
          await supabaseAdmin
            .from('tour_support_invites')
            .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
            .eq('id', inviteId);
          return errorResponse('Invite has expired', 410);
        }

        const newStatus = accept ? 'REDEEMED' : 'DECLINED';

        const { error: updateErr } = await supabaseAdmin
          .from('tour_support_invites')
          .update({ 
            status: newStatus,
            redeemed_turn_id: accept ? globalTurnId : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', inviteId);

        if (updateErr) {
          return errorResponse(updateErr.message, 500);
        }

        // Note: Actual tour creation/joining happens when the headliner creates a tour
        // and the opener uses their redeemed invite. This just marks intent.

        return new Response(JSON.stringify({ success: true, status: newStatus }));
      }

      default:
        return errorResponse(`Unknown subAction: ${subAction}`, 400);
    }
  } catch (err: any) {
    console.error('[festivalActions] Error:', err?.message || err);
    return errorResponse(err?.message || 'Internal error', 500);
  }
}
