import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { getAuthUser } from './lib/authFromRequest.ts';
import { getInterviewSlotConfig } from './applecoreEditorialModule.ts';
import {
  CANONICAL_FANDOM_SEGMENT_LABELS,
  CANONICAL_FANDOM_SEGMENT_TYPES,
  DIRECTABLE_FANDOM_SEGMENT_TYPES,
  selectCanonicalFandomSignals,
} from './fandomCanonicalSelectors.ts';
import { buildFandomModifiersForPlayer } from './fandomModifiers.ts';
import { FAN_WAR_INTERVENTIONS } from './fanSentimentEngine.ts';
import { handleFanWarAction } from './socialMedia/fanWarHandler.ts';

const pickError = (result: { error: any }) => result.error;

/**
 * Fandom Actions Server
 *
 * subActions:
 *   status              — returns fandom row, segment counts, active controversies/wars,
 *                         and available ritual actions with affordability
 *   respond_controversy — sets response_taken on a controversy_cases row
 *   setNickname         — updates fanbase_name on the fandoms row
 *   setIdentityPillars  — updates identity_pillars on the fandoms row
 *   fan_appreciation    — reduce fatigue for a segment (-20 all fatigue, costs 1 energy)
 *   apology_tour        — address controversy (+brand_trust, -public_attention, costs 40 energy)
 *   receipts_drop       — risky controversy response (60% success, 40% backfire, costs 30 energy)
 *   feed_ogs            — boost OG loyalty (+5, costs 15 energy)
 *   community_ritual    — boost core morale (+10, costs 10 energy)
 *   stan_cta            — set stan labor multiplier 1.5x next tick (costs 20 energy)
 *   trend_surf          — +15% casual acquisition next tick (costs 10 energy)
 *   meme_drop           — viral spread boost (requires hot release, costs 15 energy)
 *   chill_pill          — reduce toxicity by 25 (requires toxicity >= 40, costs 20 energy)
 *   book_applecore_interview — atomically reserve a paid AppleCore interview slot
 *   go_dark             — activate dark mode for 1-7 days (no output, 2x fatigue recovery, comeback burst)
 *   end_dark_mode       — end dark mode early (minimum 12 turns)
 *   set_segment_directive — set segment to push/steady/rest (affects labor output + fatigue rate)
 */

const APPLECORE_INTERVIEW_SLOT_LABELS: Record<string, string> = {
  feature: 'Press Feature',
  cover_story: 'Cover Story',
  zane_session: 'Zane Session',
};

const APPLECORE_INTERVIEW_SLOT_TYPES = Object.keys(APPLECORE_INTERVIEW_SLOT_LABELS);

export async function handleRequest(req: Request) {
  try {
    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);
    const { user, error: authError } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    const body = await req.clone().json().catch(() => ({}));
    const subAction = body.subAction || 'status';

    const authRole = user.app_metadata?.role || user.user_metadata?.role;
    const isAdmin = authRole === 'admin';
    const requestedArtistId = body?.artistId ? String(body.artistId).trim() : '';

    if (requestedArtistId && !isAdmin && requestedArtistId !== user.id) {
      return Response.json({ error: 'Forbidden: artistId does not match authenticated user' }, { status: 403 });
    }

    const artistId = isAdmin ? (requestedArtistId || user.id) : user.id;

    const profiles = await entities.ArtistProfile.filter({ id: artistId });
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'No artist profile' }, { status: 404 });

    const turnStates = await entities.TurnState.list('-updated_at', 1);
    const globalTurnId = Number(turnStates?.[0]?.global_turn_id || turnStates?.[0]?.current_turn_id || 1);

    const ACTIVE_FAN_WAR_STATUSES = ['active', 'escalated', 'cooling'];
    const RESOLVED_FAN_WAR_ARCHIVE_LIMIT = 8;

    // ── status ──────────────────────────────────────────────────────────────
    if (subAction === 'status') {
      const [fandomResult, fanProfileResult, segmentsResult, controversiesResult, activeWarsResult, resolvedWarsResult] = await Promise.all([
        supabaseAdmin.from('fandoms').select('*').eq('player_id', profile.id).maybeSingle(),
        supabaseAdmin.from('fan_profiles')
          .select('monthly_listeners, retention_rate, listener_growth_trend, overall_sentiment, region_share, top_regions, custom_fanbase_nickname, pr_implications')
          .eq('artist_id', profile.id)
          .maybeSingle(),
        supabaseAdmin.from('fandom_segments').select('*').eq('player_id', profile.id),
        supabaseAdmin.from('controversy_cases')
          .select('id, controversy_type, phase, credibility, memeability, public_attention, brand_trust_delta_total, fan_morale_delta_total, response_taken, response_tick, backfired, title, status, originator_player_id, escalated_fan_war_id, escalated_to_fan_war_at_turn, escalation_reason, created_at')
          .eq('player_id', profile.id)
          .neq('phase', 'resolved'),
        supabaseAdmin.from('fan_wars')
          .select('id, artist_id, rival_artist_id, status, intensity, duration_turns, source_trigger, challenger_momentum, target_momentum, public_attention, resolved_turn, started_turn, trigger_details')
          .or(`artist_id.eq.${profile.id},rival_artist_id.eq.${profile.id}`)
          .in('status', ACTIVE_FAN_WAR_STATUSES),
        supabaseAdmin.from('fan_wars')
          .select('id, artist_id, rival_artist_id, status, intensity, duration_turns, source_trigger, challenger_momentum, target_momentum, public_attention, resolved_turn, started_turn, trigger_details')
          .or(`artist_id.eq.${profile.id},rival_artist_id.eq.${profile.id}`)
          .eq('status', 'resolved')
          .order('resolved_turn', { ascending: false })
          .limit(RESOLVED_FAN_WAR_ARCHIVE_LIMIT),
      ]);

      const fandom = fandomResult.data;
      const fanProfile = fanProfileResult.data;
      const segments = segmentsResult.data || [];
      const controversies = controversiesResult.data || [];
      const activeWars = activeWarsResult.data || [];
      const resolvedWars = resolvedWarsResult.data || [];
      const wars = [...activeWars, ...resolvedWars];
      const canonicalSignals = selectCanonicalFandomSignals({
        segments,
        fandom: fandom || null,
      });

      const warIds = [...new Set(
        wars
          .map((war: any) => String(war.id || '').trim())
          .filter(Boolean),
      )];

      let linkedControversies: any[] = [];
      if (warIds.length > 0) {
        const { data: linkedControversyRows } = await supabaseAdmin
          .from('controversy_cases')
          .select('id, title, controversy_type, phase, originator_player_id, escalated_fan_war_id, escalated_to_fan_war_at_turn, escalation_reason, created_at')
          .eq('player_id', profile.id)
          .in('escalated_fan_war_id', warIds);

        linkedControversies = linkedControversyRows || [];
      }

      const originatorIds = [...new Set(
        controversies
          .map((controversy: any) => String(controversy.originator_player_id || '').trim())
          .filter(Boolean),
      )];

      const linkedControversyOriginatorIds = [...new Set(
        linkedControversies
          .map((controversy: any) => String(controversy.originator_player_id || '').trim())
          .filter(Boolean),
      )];

      const escalatedWarIds = [...new Set(
        controversies
          .map((controversy: any) => String(controversy.escalated_fan_war_id || '').trim())
          .filter(Boolean),
      )];

      const rivalIds = [...new Set(
        wars
          .map((war: any) => String(war.rival_artist_id || '').trim())
          .filter(Boolean),
      )];

      const relatedProfileIds = [...new Set([...rivalIds, ...originatorIds, ...linkedControversyOriginatorIds])];

      let profileById = new Map<string, any>();
      if (relatedProfileIds.length > 0) {
        const { data: relatedProfiles } = await supabaseAdmin
          .from('profiles')
          .select('id, artist_name, artist_image')
          .in('id', relatedProfileIds);

        profileById = new Map(
          (relatedProfiles || []).map((relatedProfile: any) => [String(relatedProfile.id), relatedProfile]),
        );
      }

      let escalatedWarById = new Map<string, any>();
      if (escalatedWarIds.length > 0) {
        const { data: escalatedWars } = await supabaseAdmin
          .from('fan_wars')
          .select('id, artist_id, rival_artist_id, status, intensity, duration_turns, source_trigger, challenger_momentum, target_momentum, public_attention, resolved_turn, started_turn, trigger_details')
          .in('id', escalatedWarIds);

        escalatedWarById = new Map(
          (escalatedWars || []).map((war: any) => [String(war.id), war]),
        );
      }

      const linkedControversyByWarId = new Map(
        linkedControversies.map((controversy: any) => [String(controversy.escalated_fan_war_id), controversy]),
      );

      const serializeProfile = (relatedProfile: any, fallbackName = 'Unknown Rival') => relatedProfile ? {
        id: relatedProfile.id,
        artist_name: relatedProfile.artist_name || fallbackName,
        artist_image: relatedProfile.artist_image || null,
      } : null;

      const enrichWar = (war: any) => {
        const rivalArtistId = String(war.rival_artist_id || '').trim();
        const rivalProfile = rivalArtistId ? profileById.get(rivalArtistId) || null : null;
        const rivalName = rivalProfile ? String(rivalProfile.artist_name || '').trim() : null;
        const linkedControversy = linkedControversyByWarId.get(String(war.id)) || null;
        const linkedControversySourceId = String(linkedControversy?.originator_player_id || '').trim();
        const linkedControversySourceProfile = linkedControversySourceId
          ? profileById.get(linkedControversySourceId) || null
          : null;

        return {
          ...war,
          rival_name: war.rival_name || rivalName,
          opponent_name: war.opponent_name || rivalName || 'Unknown Rival',
          linked_controversy: linkedControversy ? {
            id: linkedControversy.id,
            title: linkedControversy.title || null,
            controversy_type: linkedControversy.controversy_type || null,
            phase: linkedControversy.phase || null,
            escalation_reason: linkedControversy.escalation_reason || null,
            escalated_to_fan_war_at_turn: linkedControversy.escalated_to_fan_war_at_turn ?? null,
            source_profile: serializeProfile(linkedControversySourceProfile),
          } : null,
        };
      };

      const enrichedWars = wars.map(enrichWar);

      const enrichedControversies = controversies.map((controversy: any) => {
        const originatorArtistId = String(controversy.originator_player_id || '').trim();
        const sourceProfile = originatorArtistId ? profileById.get(originatorArtistId) || null : null;
        const linkedWarId = String(controversy.escalated_fan_war_id || '').trim();
        const linkedWar = linkedWarId ? escalatedWarById.get(linkedWarId) || null : null;

        return {
          ...controversy,
          source_profile: serializeProfile(sourceProfile),
          linked_war: linkedWar ? enrichWar(linkedWar) : null,
        };
      });

      // Build available rituals with affordability
      const energy = Number(profile.energy) || 0;
      const income = Number(profile.income) || 0;
      const clout = Number(profile.clout) || 0;
      const toxicity = Number(fandom?.toxicity_score) || 0;
      const hasActiveControversy = controversies.length > 0;

      // Check for active hot/performing release
      const { data: hotReleases } = await supabaseAdmin
        .from('releases')
        .select('id, title')
        .eq('artist_id', profile.id)
        .in('lifecycle_state', ['Hot', 'Trending', 'Momentum'])
        .limit(1);
      const hasHotRelease = (hotReleases?.length || 0) > 0;

      const rituals = [
        {
          key: 'feed_ogs',
          name: 'Feed the OGs',
          effect: '+OG loyalty, slows OG churn',
          platformId: 'instavibe',
          platform: 'InstaVybe',
          postType: 'Exclusive Drop',
          energyCost: 15,
          available: energy >= 15,
          lockReason: energy < 15 ? `Need 15 energy (have ${energy})` : null,
        },
        {
          key: 'community_ritual',
          name: 'Community Ritual',
          effect: '+Community morale, boosts core fan retention',
          platformId: 'instavibe',
          platform: 'InstaVybe',
          postType: 'Community Post',
          energyCost: 10,
          available: energy >= 10,
          lockReason: energy < 10 ? `Need 10 energy (have ${energy})` : null,
        },
        {
          key: 'stan_cta',
          name: 'Stan Rally',
          effect: '+Stan labor × 1.5 next tick',
          platformId: 'xpress',
          platform: 'Xpress',
          postType: 'Stan Rally',
          energyCost: 20,
          available: energy >= 20,
          lockReason: energy < 20 ? `Need 20 energy (have ${energy})` : null,
        },
        {
          key: 'trend_surf',
          name: 'Trend Surf',
          effect: '+15% casual fan acquisition',
          platformId: 'looptok',
          platform: 'LoopTok',
          postType: 'Trend Surf',
          energyCost: 10,
          available: energy >= 10,
          lockReason: energy < 10 ? `Need 10 energy (have ${energy})` : null,
        },
        {
          key: 'meme_drop',
          name: 'Meme Drop',
          effect: '+Viral spread, boosts casual discovery',
          platformId: 'looptok',
          platform: 'LoopTok',
          postType: 'Meme Drop',
          energyCost: 15,
          available: hasHotRelease && energy >= 15,
          lockReason: !hasHotRelease ? 'Requires an active hot release' : energy < 15 ? `Need 15 energy (have ${energy})` : null,
        },
        {
          key: 'chill_pill',
          name: 'Deescalate',
          effect: '-25 toxicity, cools down stan aggression',
          platformId: 'xpress',
          platform: 'Xpress',
          postType: 'Deescalate',
          energyCost: 20,
          available: toxicity >= 40 && energy >= 20,
          lockReason: toxicity < 40 ? `Requires toxicity ≥ 40 (currently ${toxicity})` : energy < 20 ? `Need 20 energy (have ${energy})` : null,
        },
        {
          key: 'fan_appreciation',
          name: 'Fan Appreciation',
          effect: '-20 fatigue across all labor types for a chosen segment',
          platformId: 'instavibe',
          platform: 'InstaVybe',
          postType: 'Appreciation Post',
          energyCost: 1,
          available: energy >= 1,
          lockReason: energy < 1 ? 'Need 1 energy' : null,
          segmentSelector: true,  // UI should show segment picker
        },
        ...(hasActiveControversy ? [
          {
            key: 'apology_tour',
            name: 'Apology Tour',
            effect: '+Brand trust recovery, reduces controversy shadow',
            platformId: 'vidwave',
            platform: 'VidWave',
            postType: 'Apology Tour',
            energyCost: 40,
            available: energy >= 40,
            lockReason: energy < 40 ? `Need 40 energy (have ${energy})` : null,
          },
          {
            key: 'receipts_drop',
            name: 'Drop Receipts',
            effect: 'Flip controversy narrative (60% success, 40% backfire)',
            platformId: 'xpress',
            platform: 'Xpress',
            postType: 'Receipts Drop',
            energyCost: 30,
            available: energy >= 30,
            lockReason: energy < 30 ? `Need 30 energy (have ${energy})` : null,
          },
        ] : []),
      ];

      const interventionCatalog = [
        ...FAN_WAR_INTERVENTIONS.calming.map((intervention) => ({ ...intervention, category: 'calming' })),
        ...FAN_WAR_INTERVENTIONS.fueling.map((intervention) => ({ ...intervention, category: 'fueling' })),
      ];

      const availableInterventions = interventionCatalog.map((intervention) => {
        const incomeCost = Number((intervention as { incomeCost?: number }).incomeCost || 0);
        const cloutCost = Number((intervention as { cloutCost?: number }).cloutCost || 0);
        let lockReason: string | null = null;

        if (energy < Number(intervention.energyCost || 0)) {
          lockReason = `Need ${intervention.energyCost} energy (have ${energy})`;
        } else if (incomeCost > 0 && income < incomeCost) {
          lockReason = `Need $${incomeCost.toLocaleString()} income (have $${income.toLocaleString()})`;
        } else if (cloutCost > 0 && clout < cloutCost) {
          lockReason = `Need ${cloutCost} clout (have ${clout})`;
        }

        return {
          id: intervention.id,
          label: intervention.label,
          desc: intervention.desc,
          category: intervention.category,
          risk: intervention.risk,
          energyCost: intervention.energyCost || 0,
          incomeCost,
          cloutCost,
          available: !lockReason,
          lockReason,
        };
      });

      return Response.json({
        success: true,
        fandom,
        fanProfile,
        canonicalSignals,
        segments,
        controversies: enrichedControversies,
        wars: enrichedWars,
        rituals,
        availableInterventions,
        globalTurnId,
      });
    }

    // ── intervene_fan_war ───────────────────────────────────────────────────
    if (subAction === 'intervene_fan_war') {
      const fanWarId = String(body.fanWarId || '').trim();
      const interventionId = String(body.interventionId || '').trim();

      if (!fanWarId) return Response.json({ error: 'fanWarId required' }, { status: 400 });
      if (!interventionId) return Response.json({ error: 'interventionId required' }, { status: 400 });

      const forwardedReq = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify({
          artistId: profile.id,
          fanWarId,
          interventionId,
        }),
      });

      const response = await handleFanWarAction(forwardedReq, 'interventFanWar');
      const payload = await response.json().catch(() => ({}));

      return Response.json(payload, { status: response.status });
    }

    // ── respond_controversy ──────────────────────────────────────────────────
    if (subAction === 'respond_controversy') {
      const controversyId = body.controversyId;
      const responseTaken = String(body.responseTaken || '').trim();

      if (!controversyId) return Response.json({ error: 'controversyId required' }, { status: 400 });
      if (!responseTaken) return Response.json({ error: 'responseTaken required' }, { status: 400 });

      const VALID_RESPONSES = ['deny', 'apologize', 'lean_in', 'distract', 'lawyer_up'];
      if (!VALID_RESPONSES.includes(responseTaken)) {
        return Response.json({ error: `Invalid response. Must be one of: ${VALID_RESPONSES.join(', ')}` }, { status: 400 });
      }

      // Validate controversy belongs to this player and is in a respondable phase
      const { data: controversy } = await supabaseAdmin
        .from('controversy_cases')
        .select('id, player_id, phase, response_taken')
        .eq('id', controversyId)
        .eq('player_id', profile.id)
        .maybeSingle();

      if (!controversy) return Response.json({ error: 'Controversy not found' }, { status: 404 });

      const RESPONDABLE_PHASES = ['spread', 'peak', 'aftermath'];
      if (!RESPONDABLE_PHASES.includes(controversy.phase)) {
        return Response.json({ error: `Cannot respond in phase: ${controversy.phase}` }, { status: 400 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from('controversy_cases')
        .update({
          response_taken: responseTaken,
          response_tick: globalTurnId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', controversyId);

      if (updateErr) return Response.json({ error: updateErr.message }, { status: 400 });
      return Response.json({ success: true, controversyId, responseTaken });
    }

    // ── setNickname ──────────────────────────────────────────────────────────
    if (subAction === 'setNickname') {
      const nickname = String(body.nickname || '').trim().slice(0, 40);
      if (!nickname) return Response.json({ error: 'Nickname cannot be empty' }, { status: 400 });

      const { error: nickErr } = await supabaseAdmin
        .from('fandoms')
        .upsert({ player_id: profile.id, fanbase_name: nickname }, { onConflict: 'player_id' });

      if (nickErr) return Response.json({ error: nickErr.message }, { status: 400 });
      return Response.json({ success: true, nickname });
    }

    // ── setIdentityPillars ───────────────────────────────────────────────────
    if (subAction === 'setIdentityPillars') {
      const rawPillars = Array.isArray(body.identityPillars) ? body.identityPillars : [];
      const normalizedPillars = rawPillars
        .map((pillar: unknown) => String(pillar || '').trim())
        .filter(Boolean)
        .slice(0, 3);

      const VALID_PILLARS = ['loyalty', 'chaos', 'empowerment', 'exclusivity', 'romance', 'rebellion', 'internet_fluency', 'spirituality', 'nostalgia', 'hedonism', 'intellectualism', 'fashion_culture'];
      const LEGACY_PILLARS = ['diva', 'alt', 'edgy', 'wholesome', 'authentic', 'mainstream', 'street', 'artsy', 'party', 'activist'];
      const invalidPillars = normalizedPillars.filter((pillar: string) => !VALID_PILLARS.includes(pillar));
      if (invalidPillars.length > 0) {
        const hasLegacyPillars = invalidPillars.some((p: string) => LEGACY_PILLARS.includes(p));
        const errorMsg = hasLegacyPillars
          ? `Old pillar values detected: ${invalidPillars.join(', ')}. Please re-select your identity pillars using the new system. Valid pillars: ${VALID_PILLARS.join(', ')}`
          : `Invalid pillars: ${invalidPillars.join(', ')}. Valid pillars: ${VALID_PILLARS.join(', ')}`;
        return Response.json({ error: errorMsg }, { status: 400 });
      }

      const { error: pillarErr } = await supabaseAdmin
        .from('fandoms')
        .upsert({ player_id: profile.id, identity_pillars: normalizedPillars }, { onConflict: 'player_id' });

      if (pillarErr) return Response.json({ error: pillarErr.message }, { status: 400 });
      return Response.json({ success: true, identity_pillars: normalizedPillars });
    }

    // ── book_applecore_interview ────────────────────────────────────────────
    // Atomically deduct cash_balance and create a pending interview slot.
    if (subAction === 'book_applecore_interview') {
      const slotType = String(body.slotType || '').trim();
      if (!slotType) {
        return Response.json({ error: 'slotType required' }, { status: 400 });
      }
      if (!APPLECORE_INTERVIEW_SLOT_TYPES.includes(slotType)) {
        return Response.json({
          error: `Invalid slotType. Must be one of: ${APPLECORE_INTERVIEW_SLOT_TYPES.join(', ')}`,
        }, { status: 400 });
      }

      const slotConfig = getInterviewSlotConfig(slotType);
      const publishTurn = globalTurnId + Number(slotConfig.reviewDelay || 0);
      const slotLabel = APPLECORE_INTERVIEW_SLOT_LABELS[slotType] || 'Interview';

      const { data: bookingResult, error: bookingError } = await supabaseAdmin.rpc('book_applecore_interview_slot', {
        p_artist_id: profile.id,
        p_slot_type: slotType,
        p_submitted_turn: globalTurnId,
        p_publish_turn: publishTurn,
        p_cost_paid: Number(slotConfig.cost || 0),
        p_morale_boost_core: Number(slotConfig.moraleCore || 0),
        p_morale_boost_stan: Number(slotConfig.moraleStan || 0),
        p_morale_boost_casual: Number(slotConfig.moraleCasual || 0),
        p_news_priority: Number(slotConfig.newsPriority || 0),
      });

      if (bookingError) {
        console.error('[FandomActions] book_applecore_interview_slot RPC error:', bookingError);
        return Response.json({ error: bookingError.message || 'Interview booking failed' }, { status: 500 });
      }

      if (!bookingResult?.success) {
        return Response.json({ error: bookingResult?.error || 'Interview booking failed' }, { status: 400 });
      }

      return Response.json({
        success: true,
        slotType,
        slotId: bookingResult.slot_id || null,
        publishTurn: Number(bookingResult.publish_turn ?? publishTurn),
        remainingBalance: bookingResult.remaining_balance ?? null,
        message: `${slotLabel} booked — goes live on turn ${Number(bookingResult.publish_turn ?? publishTurn)}.`,
      });
    }

    // ── fan_appreciation ─────────────────────────────────────────────────────
    // Reduce all fatigue values for a target segment by 20 points.
    // Cost: 1 energy. Cooldown: tracked via segment tick_snapshot (3-turn per segment).
    if (subAction === 'fan_appreciation') {
      const segmentType = String(body.segmentType || '').trim() as typeof CANONICAL_FANDOM_SEGMENT_TYPES[number];
      const VALID_SEGMENTS = CANONICAL_FANDOM_SEGMENT_TYPES;
      if (!VALID_SEGMENTS.includes(segmentType)) {
        return Response.json({ error: `Invalid segment type. Must be one of: ${VALID_SEGMENTS.join(', ')}` }, { status: 400 });
      }

      // Check energy (costs 1 energy)
      const energy = Number(profile.energy) || 0;
      if (energy < 1) {
        return Response.json({ error: 'Not enough energy (need 1)' }, { status: 400 });
      }

      // Load the segment row
      const { data: segRow } = await supabaseAdmin
        .from('fandom_segments')
        .select('id, fatigue, tick_snapshot, player_id')
        .eq('player_id', profile.id)
        .eq('segment_type', segmentType)
        .maybeSingle();

      if (!segRow) return Response.json({ error: `Segment "${segmentType}" not found` }, { status: 404 });

      // Check 3-turn cooldown (tick_snapshot is an integer column storing last appreciation turn)
      const lastAppreciationTurn = Number(segRow.tick_snapshot) || 0;
      const cooldownTurnsLeft = Math.max(0, lastAppreciationTurn + 3 - globalTurnId);
      if (cooldownTurnsLeft > 0) {
        return Response.json({
          error: `Fan Appreciation is on cooldown for ${segmentType}. ${cooldownTurnsLeft} turn${cooldownTurnsLeft > 1 ? 's' : ''} remaining.`
        }, { status: 400 });
      }

      // Reduce all fatigue by 20 points (floor at 0)
      const currentFatigue = (segRow.fatigue as Record<string, number>) || {};
      const updatedFatigue: Record<string, number> = {};
      for (const [laborType, val] of Object.entries(currentFatigue)) {
        updatedFatigue[laborType] = Math.max(0, (Number(val) || 0) - 20);
      }

      // Persist fatigue update + cooldown turn
      const [fatigueUpdateErr, energyUpdateErr] = await Promise.all([
        supabaseAdmin
          .from('fandom_segments')
          .update({
            fatigue: updatedFatigue,
            tick_snapshot: globalTurnId,
          })
          .eq('id', segRow.id)
          .then(pickError),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 1) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (fatigueUpdateErr) return Response.json({ error: fatigueUpdateErr.message }, { status: 400 });

      return Response.json({
        success: true,
        segmentType,
        updatedFatigue,
        energyCost: 1,
        flavorText: `You dedicated a heartfelt post to your ${CANONICAL_FANDOM_SEGMENT_LABELS[segmentType as keyof typeof CANONICAL_FANDOM_SEGMENT_LABELS] || segmentType}. They feel seen.`,
      });
    }

    // ── apology_tour ─────────────────────────────────────────────────────────
    // Cost: 40 energy. Requires active controversy.
    // Effects: Set apology_tour_active, reduce public_attention by 15, 
    // increase brand_trust by 10 (cap 100), reduce controversy_shadow_ticks_remaining by 5.
    if (subAction === 'apology_tour') {
      const energy = Number(profile.energy) || 0;
      if (energy < 40) {
        return Response.json({ error: 'Not enough energy (need 40)' }, { status: 400 });
      }

      // Find active controversy
      const { data: controversies } = await supabaseAdmin
        .from('controversy_cases')
        .select('id, phase, public_attention')
        .eq('player_id', profile.id)
        .in('phase', ['spread', 'peak', 'aftermath'])
        .limit(1);

      if (!controversies || controversies.length === 0) {
        return Response.json({ error: 'No active controversy to address' }, { status: 400 });
      }

      const controversy = controversies[0];

      // Get fandom for brand_trust update
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, brand_trust, controversy_shadow_ticks_remaining')
        .eq('player_id', profile.id)
        .maybeSingle();

      const currentBrandTrust = Number(fandom?.brand_trust) || 50;
      const currentShadowTicks = Number(fandom?.controversy_shadow_ticks_remaining) || 0;

      // Apply effects
      const newPublicAttention = Math.max(0, (Number(controversy.public_attention) || 0) - 15);
      const newBrandTrust = Math.min(100, currentBrandTrust + 10);
      const newShadowTicks = Math.max(0, currentShadowTicks - 5);

      const [controversyErr, fandomErr, energyErr] = await Promise.all([
        supabaseAdmin
          .from('controversy_cases')
          .update({
            apology_tour_active: true,
            public_attention: newPublicAttention,
            updated_at: new Date().toISOString(),
          })
          .eq('id', controversy.id)
          .then(pickError),
        fandom?.id ? supabaseAdmin
          .from('fandoms')
          .update({
            brand_trust: newBrandTrust,
            controversy_shadow_ticks_remaining: newShadowTicks,
          })
          .eq('id', fandom.id)
          .then(pickError) : Promise.resolve(null),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 40) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (controversyErr) return Response.json({ error: controversyErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'apology_tour',
        energyCost: 40,
        effects: {
          public_attention_reduced: 15,
          brand_trust_gained: Math.min(10, 100 - currentBrandTrust),
          shadow_ticks_reduced: Math.min(5, currentShadowTicks),
        },
        flavorText: 'You launched an apology tour. Fans appreciate your accountability.',
      });
    }

    // ── receipts_drop ────────────────────────────────────────────────────────
    // Cost: 30 energy. Requires active controversy.
    // 60% success: reduce public_attention by 25, gain +5 clout
    // 40% backfire: increase public_attention by 10, increase toxicity by 10
    if (subAction === 'receipts_drop') {
      const energy = Number(profile.energy) || 0;
      if (energy < 30) {
        return Response.json({ error: 'Not enough energy (need 30)' }, { status: 400 });
      }

      // Find active controversy
      const { data: controversies } = await supabaseAdmin
        .from('controversy_cases')
        .select('id, phase, public_attention')
        .eq('player_id', profile.id)
        .in('phase', ['spread', 'peak', 'aftermath'])
        .limit(1);

      if (!controversies || controversies.length === 0) {
        return Response.json({ error: 'No active controversy to respond to' }, { status: 400 });
      }

      const controversy = controversies[0];

      // Seeded RNG based on controversy.id + globalTurnId for determinism
      const seed = controversy.id + '-' + globalTurnId;
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const roll = Math.abs(hash % 100);
      const isSuccess = roll < 60; // 60% success rate

      // Get fandom for toxicity update (on backfire)
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, toxicity_score')
        .eq('player_id', profile.id)
        .maybeSingle();

      const currentClout = Number(profile.clout) || 0;
      const currentToxicity = Number(fandom?.toxicity_score) || 0;
      const currentPublicAttention = Number(controversy.public_attention) || 0;

      if (isSuccess) {
        // Success: reduce public_attention by 25, gain +5 clout
        const newPublicAttention = Math.max(0, currentPublicAttention - 25);
        const newClout = currentClout + 5;

        const [controversyErr, profileErr, energyErr] = await Promise.all([
          supabaseAdmin
            .from('controversy_cases')
            .update({
              response_taken: 'receipts',
              public_attention: newPublicAttention,
              updated_at: new Date().toISOString(),
            })
            .eq('id', controversy.id)
            .then(pickError),
          supabaseAdmin
            .from('artist_profiles')
            .update({ clout: newClout, energy: Math.max(0, energy - 30) })
            .eq('id', profile.id)
            .then(pickError),
          Promise.resolve(null),
        ]);

        if (controversyErr) return Response.json({ error: controversyErr.message }, { status: 400 });

        return Response.json({
          success: true,
          ritual: 'receipts_drop',
          outcome: 'success',
          energyCost: 30,
          effects: {
            public_attention_reduced: 25,
            clout_gained: 5,
          },
          flavorText: 'The receipts hit hard! Public opinion swings in your favor.',
        });
      } else {
        // Backfire: increase public_attention by 10, increase toxicity by 10
        const newPublicAttention = currentPublicAttention + 10;
        const newToxicity = Math.min(100, currentToxicity + 10);

        const [controversyErr, fandomErr, energyErr] = await Promise.all([
          supabaseAdmin
            .from('controversy_cases')
            .update({
              response_taken: 'receipts_backfired',
              public_attention: newPublicAttention,
              updated_at: new Date().toISOString(),
            })
            .eq('id', controversy.id)
            .then(pickError),
          fandom?.id ? supabaseAdmin
            .from('fandoms')
            .update({ toxicity_score: newToxicity })
            .eq('id', fandom.id)
            .then(pickError) : Promise.resolve(null),
          supabaseAdmin
            .from('artist_profiles')
            .update({ energy: Math.max(0, energy - 30) })
            .eq('id', profile.id)
            .then(pickError),
        ]);

        if (controversyErr) return Response.json({ error: controversyErr.message }, { status: 400 });

        return Response.json({
          success: true,
          ritual: 'receipts_drop',
          outcome: 'backfire',
          energyCost: 30,
          effects: {
            public_attention_increased: 10,
            toxicity_increased: 10,
          },
          flavorText: 'The receipts backfired! People are questioning your narrative.',
        });
      }
    }

    // ── feed_ogs ─────────────────────────────────────────────────────────────
    // Cost: 15 energy. Boost OG loyalty by 5.
    if (subAction === 'feed_ogs') {
      const energy = Number(profile.energy) || 0;
      if (energy < 15) {
        return Response.json({ error: 'Not enough energy (need 15)' }, { status: 400 });
      }

      // Get OG segment
      const { data: ogSegment } = await supabaseAdmin
        .from('fandom_segments')
        .select('id, loyalty, tick_snapshot')
        .eq('player_id', profile.id)
        .eq('segment_type', 'og')
        .maybeSingle();

      if (!ogSegment) {
        return Response.json({ error: 'OG segment not found' }, { status: 404 });
      }

      const currentLoyalty = Number(ogSegment.loyalty) || 50;
      const newLoyalty = Math.min(100, currentLoyalty + 5);
      const tickSnapshot = (ogSegment.tick_snapshot as Record<string, any>) || {};

      const [segmentErr, energyErr] = await Promise.all([
        supabaseAdmin
          .from('fandom_segments')
          .update({
            loyalty: newLoyalty,
            tick_snapshot: { ...tickSnapshot, last_feed_ogs_turn: globalTurnId },
          })
          .eq('id', ogSegment.id)
          .then(pickError),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 15) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (segmentErr) return Response.json({ error: segmentErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'feed_ogs',
        energyCost: 15,
        effects: {
          og_loyalty_gained: Math.min(5, 100 - currentLoyalty),
        },
        flavorText: 'You dropped exclusive content for the OGs. Day ones stay winning.',
      });
    }

    // ── community_ritual ─────────────────────────────────────────────────────
    // Cost: 10 energy. Boost core fan morale by 10.
    if (subAction === 'community_ritual') {
      const energy = Number(profile.energy) || 0;
      if (energy < 10) {
        return Response.json({ error: 'Not enough energy (need 10)' }, { status: 400 });
      }

      // Get core segment
      const { data: coreSegment } = await supabaseAdmin
        .from('fandom_segments')
        .select('id, morale, tick_snapshot')
        .eq('player_id', profile.id)
        .eq('segment_type', 'core')
        .maybeSingle();

      if (!coreSegment) {
        return Response.json({ error: 'Core segment not found' }, { status: 404 });
      }

      const currentMorale = Number(coreSegment.morale) || 50;
      const newMorale = Math.min(100, currentMorale + 10);
      const tickSnapshot = (coreSegment.tick_snapshot as Record<string, any>) || {};

      const [segmentErr, energyErr] = await Promise.all([
        supabaseAdmin
          .from('fandom_segments')
          .update({
            morale: newMorale,
            tick_snapshot: { ...tickSnapshot, last_community_ritual_turn: globalTurnId },
          })
          .eq('id', coreSegment.id)
          .then(pickError),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 10) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (segmentErr) return Response.json({ error: segmentErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'community_ritual',
        energyCost: 10,
        effects: {
          core_morale_gained: Math.min(10, 100 - currentMorale),
        },
        flavorText: 'Community vibes are strong. Core fans feel connected.',
      });
    }

    // ── stan_cta ─────────────────────────────────────────────────────────────
    // Cost: 20 energy. Set stan labor multiplier to 1.5 for next tick.
    if (subAction === 'stan_cta') {
      const energy = Number(profile.energy) || 0;
      if (energy < 20) {
        return Response.json({ error: 'Not enough energy (need 20)' }, { status: 400 });
      }

      // Get stan segment
      const { data: stanSegment } = await supabaseAdmin
        .from('fandom_segments')
        .select('id, tick_snapshot')
        .eq('player_id', profile.id)
        .eq('segment_type', 'stan')
        .maybeSingle();

      if (!stanSegment) {
        return Response.json({ error: 'Stan segment not found' }, { status: 404 });
      }

      const tickSnapshot = (stanSegment.tick_snapshot as Record<string, any>) || {};

      const [segmentErr, energyErr] = await Promise.all([
        supabaseAdmin
          .from('fandom_segments')
          .update({
            tick_snapshot: {
              ...tickSnapshot,
              stan_labor_multiplier: 1.5,
              stan_labor_multiplier_expires: globalTurnId + 1,
            },
          })
          .eq('id', stanSegment.id)
          .then(pickError),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 20) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (segmentErr) return Response.json({ error: segmentErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'stan_cta',
        energyCost: 20,
        effects: {
          stan_labor_multiplier: 1.5,
          duration_turns: 1,
        },
        flavorText: 'You rallied the stans. They are MOBILIZED for the next turn.',
      });
    }

    // ── trend_surf ───────────────────────────────────────────────────────────
    // Cost: 10 energy. Boost casual acquisition by 15% next tick.
    if (subAction === 'trend_surf') {
      const energy = Number(profile.energy) || 0;
      if (energy < 10) {
        return Response.json({ error: 'Not enough energy (need 10)' }, { status: 400 });
      }

      // Get casual segment
      const { data: casualSegment } = await supabaseAdmin
        .from('fandom_segments')
        .select('id, tick_snapshot')
        .eq('player_id', profile.id)
        .eq('segment_type', 'casual')
        .maybeSingle();

      if (!casualSegment) {
        return Response.json({ error: 'Casual segment not found' }, { status: 404 });
      }

      const tickSnapshot = (casualSegment.tick_snapshot as Record<string, any>) || {};

      const [segmentErr, energyErr] = await Promise.all([
        supabaseAdmin
          .from('fandom_segments')
          .update({
            tick_snapshot: {
              ...tickSnapshot,
              casual_acquisition_boost: 0.15,
              casual_acquisition_boost_expires: globalTurnId + 1,
            },
          })
          .eq('id', casualSegment.id)
          .then(pickError),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 10) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (segmentErr) return Response.json({ error: segmentErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'trend_surf',
        energyCost: 10,
        effects: {
          casual_acquisition_boost: '15%',
          duration_turns: 1,
        },
        flavorText: 'You jumped on a trending wave. Casuals are noticing you.',
      });
    }

    // ── meme_drop ────────────────────────────────────────────────────────────
    // Cost: 15 energy. Requires hot release. Boosts viral spread for next turn.
    if (subAction === 'meme_drop') {
      const energy = Number(profile.energy) || 0;
      if (energy < 15) {
        return Response.json({ error: 'Not enough energy (need 15)' }, { status: 400 });
      }

      // Check for hot release
      const { data: hotReleases } = await supabaseAdmin
        .from('releases')
        .select('id, title')
        .eq('artist_id', profile.id)
        .in('lifecycle_state', ['Hot', 'Trending', 'Momentum'])
        .limit(1);

      if (!hotReleases || hotReleases.length === 0) {
        return Response.json({ error: 'Requires an active hot release' }, { status: 400 });
      }

      // Get fandom to set viral flag
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, tick_snapshot')
        .eq('player_id', profile.id)
        .maybeSingle();

      const tickSnapshot = (fandom?.tick_snapshot as Record<string, any>) || {};

      const [fandomErr, energyErr] = await Promise.all([
        fandom?.id ? supabaseAdmin
          .from('fandoms')
          .update({
            tick_snapshot: {
              ...tickSnapshot,
              meme_drop_active: true,
              meme_drop_expires: globalTurnId + 1,
            },
          })
          .eq('id', fandom.id)
          .then(pickError) : Promise.resolve(null),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 15) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (fandomErr) return Response.json({ error: fandomErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'meme_drop',
        energyCost: 15,
        effects: {
          viral_spread_boost: true,
          duration_turns: 1,
        },
        flavorText: 'You dropped a viral meme. The internet is in shambles.',
      });
    }

    // ── chill_pill ───────────────────────────────────────────────────────────
    // Cost: 20 energy. Requires toxicity >= 40. Reduce toxicity by 25.
    if (subAction === 'chill_pill') {
      const energy = Number(profile.energy) || 0;
      if (energy < 20) {
        return Response.json({ error: 'Not enough energy (need 20)' }, { status: 400 });
      }

      // Get fandom for toxicity check
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, toxicity_score')
        .eq('player_id', profile.id)
        .maybeSingle();

      const currentToxicity = Number(fandom?.toxicity_score) || 0;
      if (currentToxicity < 40) {
        return Response.json({ error: `Requires toxicity >= 40 (currently ${currentToxicity})` }, { status: 400 });
      }

      const newToxicity = Math.max(0, currentToxicity - 25);

      const [fandomErr, energyErr] = await Promise.all([
        fandom?.id ? supabaseAdmin
          .from('fandoms')
          .update({ toxicity_score: newToxicity })
          .eq('id', fandom.id)
          .then(pickError) : Promise.resolve(null),
        supabaseAdmin
          .from('artist_profiles')
          .update({ energy: Math.max(0, energy - 20) })
          .eq('id', profile.id)
          .then(pickError),
      ]);

      if (fandomErr) return Response.json({ error: fandomErr.message }, { status: 400 });

      return Response.json({
        success: true,
        ritual: 'chill_pill',
        energyCost: 20,
        effects: {
          toxicity_reduced: Math.min(25, currentToxicity),
        },
        flavorText: 'You called for calm. The stans are de-escalating.',
      });
    }

    // ── go_dark ──────────────────────────────────────────────────────────────
    if (subAction === 'go_dark') {
      const days = Math.min(7, Math.max(1, Math.round(Number(body.days) || 1)));
      const turnsToGoDark = days * 24; // 24 turns per real day

      // Check no active fan war
      const { data: activeWars } = await supabaseAdmin
        .from('fan_wars')
        .select('id')
        .or(`artist_id.eq.${profile.id},rival_artist_id.eq.${profile.id}`)
        .in('status', ACTIVE_FAN_WAR_STATUSES)
        .limit(1);
      if (activeWars && activeWars.length > 0) {
        return Response.json({ error: 'Cannot go dark during an active fan war' }, { status: 400 });
      }

      // Check not already dark
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, dark_mode_until, dark_mode_started')
        .eq('player_id', profile.id)
        .maybeSingle();
      if (fandom?.dark_mode_until != null && globalTurnId < Number(fandom.dark_mode_until)) {
        return Response.json({ error: 'Already in dark mode' }, { status: 400 });
      }

      const darkUntil = globalTurnId + turnsToGoDark;
      const { error: updateErr } = await supabaseAdmin
        .from('fandoms')
        .update({ dark_mode_until: darkUntil, dark_mode_started: globalTurnId })
        .eq('player_id', profile.id);

      if (updateErr) return Response.json({ error: updateErr.message }, { status: 400 });

      const flavorTexts: Record<number, string> = {
        1: 'Going quiet for a day. Your stans will hold it down.',
        2: 'Two days off the grid. Let the mystery build.',
        3: 'Three days dark. Your casuals might wander, but the core stays.',
        7: 'A full week dark. This is a statement. When you come back, it better be worth it.',
      };

      return Response.json({
        success: true,
        dark_mode_until: darkUntil,
        dark_mode_started: globalTurnId,
        days,
        turnsRemaining: turnsToGoDark,
        flavorText: flavorTexts[days] || `Going dark for ${days} days. The comeback will hit different.`,
      });
    }

    // ── end_dark_mode ────────────────────────────────────────────────────────
    if (subAction === 'end_dark_mode') {
      const { data: fandom } = await supabaseAdmin
        .from('fandoms')
        .select('id, dark_mode_until, dark_mode_started')
        .eq('player_id', profile.id)
        .maybeSingle();

      if (!fandom?.dark_mode_until || globalTurnId >= Number(fandom.dark_mode_until)) {
        return Response.json({ error: 'Not currently in dark mode' }, { status: 400 });
      }

      // Minimum 12 turns (half a day) before early exit
      const turnsDark = globalTurnId - Number(fandom.dark_mode_started);
      if (turnsDark < 12) {
        return Response.json({
          error: `Must be dark for at least 12 hours (${12 - turnsDark} turns remaining)`,
        }, { status: 400 });
      }

      // End dark mode by setting until = current turn (triggers comeback on next tick)
      const { error: updateErr } = await supabaseAdmin
        .from('fandoms')
        .update({ dark_mode_until: globalTurnId })
        .eq('player_id', profile.id);

      if (updateErr) return Response.json({ error: updateErr.message }, { status: 400 });

      return Response.json({
        success: true,
        turnsDark,
        flavorText: turnsDark >= 72
          ? 'You\'re back. The timeline is about to go crazy.'
          : 'Short break over. Your fans barely noticed — but you feel refreshed.',
      });
    }

    // ── set_segment_directive ────────────────────────────────────────────────
    if (subAction === 'set_segment_directive') {
      const segmentType = body.segmentType;
      const directive = body.directive;

      const VALID_SEGMENTS = DIRECTABLE_FANDOM_SEGMENT_TYPES;
      const VALID_DIRECTIVES = ['push', 'steady', 'rest'];

      if (!VALID_SEGMENTS.includes(segmentType)) {
        return Response.json({ error: `Invalid segment. Cannot direct critics. Valid: ${VALID_SEGMENTS.join(', ')}` }, { status: 400 });
      }
      if (!VALID_DIRECTIVES.includes(directive)) {
        return Response.json({ error: `Invalid directive. Valid: ${VALID_DIRECTIVES.join(', ')}` }, { status: 400 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from('fandom_segments')
        .update({ directive })
        .eq('player_id', profile.id)
        .eq('segment_type', segmentType);

      if (updateErr) return Response.json({ error: updateErr.message }, { status: 400 });

      const directiveLabels: Record<string, string> = {
        push: 'PUSH — 1.3× output, fatigue builds faster',
        steady: 'STEADY — balanced output and recovery',
        rest: 'REST — zero output, full fatigue recovery',
      };

      return Response.json({
        success: true,
        segmentType,
        directive,
        flavorText: `${CANONICAL_FANDOM_SEGMENT_LABELS[segmentType as keyof typeof CANONICAL_FANDOM_SEGMENT_LABELS]} set to ${directiveLabels[directive]}.`,
      });
    }

    return Response.json({ error: 'Unknown subAction' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
