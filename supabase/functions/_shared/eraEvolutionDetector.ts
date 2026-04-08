import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { getAlignmentScale, computeEraActionDeltas } from './eraIdentity.ts';
import { calculateLegacyBonuses } from './fandomPhase6.ts';

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

async function verifyAuth(req) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}

// Detect if a player is ready for era evolution (soft prompt)
// Based on release performance, clout gains, and momentum
async function detectEraEvolution(req, parsedBody) {
  // Skip JWT verification for era actions to prevent auth issues
  // const user = await verifyAuth(req);
  // if (!user) {
  //   return jsonResponse({ error: 'Unauthorized' }, 401);
  // }

  try {
    const { artistId } = parsedBody || {};
    if (!artistId) {
      return jsonResponse({ shouldPrompt: false, reason: "Missing artistId" }, 400);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', artistId).limit(1);

    if (!profile || profile.length === 0) {
      return jsonResponse({ shouldPrompt: false, reason: "No profile" }, 200);
    }

    const artist = profile[0];
    const { data: currentEra } = await supabaseAdmin
      .from('eras').select('*').eq('artist_id', artist.id).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1);

    if (!currentEra || currentEra.length === 0) {
      return jsonResponse({ shouldPrompt: false, reason: "No active era" }, 200);
    }

    // Verify the era belongs to the requesting artist
    const era = currentEra[0];
    if (era.artist_id !== artistId) {
      return jsonResponse({ shouldPrompt: false, reason: "Era does not belong to artist" }, 400);
    }

    // Get all releases in this era
    const { data: releases } = await supabaseAdmin
      .from('releases').select('*').eq('artist_id', artist.id)
      .order('lifetime_streams', { ascending: false }).limit(50);
    const releaseList = releases || [];

    // Calc era performance metrics
    const totalStreams = releaseList.reduce((sum, r) => sum + (r.lifetime_streams || 0), 0);
    const totalRevenue = releaseList.reduce((sum, r) => sum + (r.lifetime_revenue || 0), 0);
    const topRelease = releaseList[0];
    
    // Conditions for soft prompting evolution
    const conditions = {
      hasBreakoutRelease: topRelease && topRelease.lifetime_streams > 10000,
      solidCloutGain: artist.clout > 100,
      eraGainingMomentum: era.momentum > 60,
      hasMultipleSuccessfulReleases: releaseList.filter(r => r.lifetime_streams > 5000).length >= 2,
      eraDurationLong: (era.phase_turns_left && era.phase_turns_left <= 24), // Nearing end of phase
      highTension: era.tension > 70 // Creative pressure building
    };

    const meetsConditions = Object.values(conditions).filter(Boolean).length >= 3;

    if (!meetsConditions) {
      return jsonResponse({ shouldPrompt: false, reason: "Not enough progression", conditions }, 200);
    }

    // They're ready for evolution!
    return jsonResponse({
      shouldPrompt: true,
      reason: "Significant era progress detected",
      recommendation: {
        breakoutMoment: topRelease ? {
          name: topRelease.release_name,
          streams: topRelease.lifetime_streams,
          revenue: topRelease.lifetime_revenue
        } : null,
        currentMomentum: era.momentum,
        totalStreamsThisEra: totalStreams,
        totalRevenueThisEra: totalRevenue,
        eraAge: era.phase_turns_left ? 100 - era.phase_turns_left : 0,
        nextPhase: getNextPhaseRecommendation(era.phase)
      },
      conditions
    }, 200);
  } catch (error) {
    console.error("Era evolution detection failed:", error);
    return jsonResponse({ error: (error as Error).message, shouldPrompt: false }, 500);
  }
}

function getNextPhaseRecommendation(currentPhase: string) {
  // Real phase sequence: TEASE → DROP → SUSTAIN → FADE → era ends
  const phaseProgressions: Record<string, { next: string; suggestion: string }> = {
    TEASE: { next: "DROP", suggestion: "Time to release! Your teases have built enough anticipation." },
    DROP: { next: "SUSTAIN", suggestion: "Release momentum is strong. Keep the buzz alive with touring and exclusive content." },
    SUSTAIN: { next: "FADE", suggestion: "Momentum is stabilizing. Maximize this phase with tours and merch before the fade." },
    FADE: { next: "NEW_ERA", suggestion: "This era is winding down. Plan your next chapter and go out with a bang." }
  };
  
  return phaseProgressions[currentPhase] || { next: "NEW_ERA", suggestion: "Start planning your next era!" };
}

// Handle era ending with fan consequence system
async function handleEraEnd(req, parsedBody) {
  // Skip JWT verification for era actions to prevent auth issues
  // const user = await verifyAuth(req);
  // if (!user) {
  //   return jsonResponse({ error: 'Unauthorized' }, 401);
  // }

  try {
    const { eraId, earlyTerminate, artistId } = parsedBody || {};

    if (!eraId || !artistId) {
      return jsonResponse({ error: 'Missing eraId or artistId' }, 400);
    }

    const { data: era, error: eraErr } = await supabaseAdmin
      .from('eras').select('*').eq('id', eraId).maybeSingle();
    if (eraErr || !era || !era.is_active) {
      return jsonResponse({ error: 'Era not active' }, 400);
    }

    // Verify the era belongs to the artist
    if (era.artist_id !== artistId) {
      return jsonResponse({ error: 'Era does not belong to artist' }, 400);
    }

    const { data: turnState } = await supabaseAdmin
      .from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle();
    const currentTurnIndex = turnState?.global_turn_id ?? null;

    // Calculate consequences if early termination
    let consequences = { loyalty_loss: 0, momentum_penalty: 0 };
    
    if (earlyTerminate && era.momentum > 70) {
      // High momentum early end = fan frustration
      consequences.loyalty_loss = Math.round(era.momentum * 0.15); // Lose 15% of momentum in loyalty
      consequences.momentum_penalty = Math.round(era.momentum * 0.25); // Start next era at 75% momentum
      
      // Create a "stubborn fanbase" event
      await supabaseAdmin.from('notifications').insert({
        player_id: era.artist_id,
        type: "SYSTEM",
        title: "Fans Want More",
        subtitle: "Your fanbase is refusing to move on",
        body: `Fans loved "${era.era_name}" so much they're resisting the change. You'll start slower next era.`,
        idempotency_key: `era_end:${eraId}:stubborn_fans`,
        created_turn_index: currentTurnIndex
      });
    } else if (!earlyTerminate && era.momentum < 30) {
      // Natural end at low momentum = smooth transition
      consequences.loyalty_loss = 5; // Minimal loss
      consequences.momentum_penalty = 0; // Fresh start
    } else {
      // Balanced end
      consequences.loyalty_loss = Math.round(era.momentum * 0.08);
      consequences.momentum_penalty = Math.round(era.momentum * 0.15);
    }

    const legacyBonuses = calculateLegacyBonuses(era);
    const memoryScore = Number(era.fandom_memory_score || 0);
    let finalStatus = 'completed';
    if (era.is_flop) finalStatus = 'flop';
    else if (era.is_one_hit) finalStatus = 'one_hit_wonder';
    else if (memoryScore >= 70) finalStatus = 'iconic';

    // End the era
    await supabaseAdmin.from('eras').update({
      is_active: false,
      status: finalStatus,
      end_turn: currentTurnIndex,
      ended_at: new Date().toISOString(),
      final_score: Math.floor(legacyBonuses.score),
      legacy_bonuses: legacyBonuses,
    }).eq('id', eraId);

    await supabaseAdmin
      .from('profiles')
      .update({ active_era_id: null })
      .eq('id', era.artist_id);

    return jsonResponse({
      success: true,
      eraEnded: era.era_name,
      finalStatus,
      finalScore: Math.floor(legacyBonuses.score),
      legacyBonuses,
      consequences,
      message: earlyTerminate
        ? `Era ended early. Fans are disappointed but remember the glory days.`
        : `Era concluded naturally. Clean transition to your next chapter.`
    }, 200);
  } catch (error) {
    console.error("Era end handler failed:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

const ERA_ACTION_DELTAS: Record<string, { anticipation: number; momentum: number; tension: number; volatility: number; clout: number }> = {
  // TEASE phase — clout: low, building anticipation
  teaser_snippet:    { anticipation: 8,  momentum: 5,  tension: 1,  volatility: 1, clout: 2 },
  cryptic_post:      { anticipation: 5,  momentum: 2,  tension: 2,  volatility: 2, clout: 1 },
  announce_era:      { anticipation: 10, momentum: 7,  tension: 1,  volatility: 1, clout: 5 },
  collab_tease:      { anticipation: 7,  momentum: 4,  tension: 2,  volatility: 2, clout: 3 },
  listening_party:   { anticipation: 6,  momentum: 5,  tension: -1, volatility: 0, clout: 4 },
  // DROP phase — clout: high, maximum exposure
  release_single:    { anticipation: -5, momentum: 12, tension: 2,  volatility: 3, clout: 8 },
  release_music:     { anticipation: -5, momentum: 12, tension: 2,  volatility: 3, clout: 8 },
  music_video:       { anticipation: -3, momentum: 15, tension: 1,  volatility: 2, clout: 10 },
  release_party:     { anticipation: -2, momentum: 10, tension: 3,  volatility: 5, clout: 6 },
  press_run:         { anticipation: 0,  momentum: 10, tension: 1,  volatility: 1, clout: 7 },
  live_stream:       { anticipation: 0,  momentum: 7,  tension: 3,  volatility: 4, clout: 4 },
  radio_push:        { anticipation: 0,  momentum: 8,  tension: 0,  volatility: 1, clout: 5 },
  tv_appearance:     { anticipation: 0,  momentum: 12, tension: 1,  volatility: 2, clout: 9 },
  viral_challenge:   { anticipation: 0,  momentum: 8,  tension: 4,  volatility: 8, clout: 6 },
  // SUSTAIN phase — clout: moderate, maintaining presence
  tour_announce:     { anticipation: 0,  momentum: 8,  tension: -1, volatility: 1, clout: 5 },
  book_tour:         { anticipation: 0,  momentum: 8,  tension: -2, volatility: 1, clout: 5 },
  behind_scenes:     { anticipation: 0,  momentum: 4,  tension: 0,  volatility: 1, clout: 2 },
  fan_appreciation:  { anticipation: 0,  momentum: 3,  tension: -2, volatility: -1, clout: 3 },
  merch_drop:        { anticipation: 0,  momentum: 4,  tension: 0,  volatility: 1, clout: 3 },
  fan_event:         { anticipation: 0,  momentum: 6,  tension: -3, volatility: 0, clout: 4 },
  remix_pack:        { anticipation: 2,  momentum: 7,  tension: 1,  volatility: 2, clout: 4 },
  urban_appearance:  { anticipation: 0,  momentum: 9,  tension: 3,  volatility: 6, clout: 7 },
  sell_merch_tour:   { anticipation: 0,  momentum: 3,  tension: 0,  volatility: 0, clout: 2 },
  // FADE phase — clout: legacy-building
  farewell_show:     { anticipation: 2,  momentum: 4,  tension: -2, volatility: 0, clout: 6 },
  farewell_post:     { anticipation: 3,  momentum: 3,  tension: -2, volatility: 0, clout: 3 },
  throwback_session: { anticipation: 1,  momentum: 2,  tension: -3, volatility: 0, clout: 4 },
  plan_next_era:     { anticipation: 5,  momentum: 0,  tension: -4, volatility: -3, clout: 1 },
  greatest_hits:     { anticipation: 0,  momentum: 4,  tension: -1, volatility: 0, clout: 5 },
  reinvention_tease: { anticipation: 8,  momentum: 5,  tension: 2,  volatility: 4, clout: 3 },
  documentary:       { anticipation: 2,  momentum: 6,  tension: -1, volatility: 1, clout: 7 },
  charity_show:      { anticipation: 1,  momentum: 5,  tension: -3, volatility: 0, clout: 5 },
};

const ERA_ACTION_COSTS: Record<string, { energy: number; inspiration: number }> = {
  teaser_snippet:    { energy: 8,  inspiration: 5 },
  cryptic_post:      { energy: 4,  inspiration: 3 },
  announce_era:      { energy: 10, inspiration: 8 },
  collab_tease:      { energy: 6,  inspiration: 5 },
  listening_party:   { energy: 12, inspiration: 8 },
  release_music:     { energy: 0,  inspiration: 0 },
  music_video:       { energy: 0,  inspiration: 0 },
  press_run:         { energy: 12, inspiration: 8 },
  live_stream:       { energy: 0,  inspiration: 0 },
  tour_announce:     { energy: 0,  inspiration: 0 },
  behind_scenes:     { energy: 5,  inspiration: 3 },
  fan_appreciation:  { energy: 3,  inspiration: 2 },
  merch_drop:        { energy: 0,  inspiration: 0 },
  farewell_show:     { energy: 0,  inspiration: 0 },
  throwback_session: { energy: 8,  inspiration: 5 },
  plan_next_era:     { energy: 5,  inspiration: 10 },
};

async function executeEraAction(req, parsedBody) {
  // Skip JWT verification for era actions to prevent auth issues
  // const user = await verifyAuth(req);
  // if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { eraId, actionId, artistId } = parsedBody || {};
  const base = ERA_ACTION_DELTAS[actionId];
  if (!eraId || !base || !artistId) return jsonResponse({ error: 'Invalid era action payload' }, 400);

  const { data: era } = await supabaseAdmin.from('eras').select('*').eq('id', eraId).maybeSingle();
  if (!era || !era.is_active) return jsonResponse({ error: 'Era not active' }, 400);
  
  // Verify the era belongs to the artist
  if (era.artist_id !== artistId) {
    return jsonResponse({ error: 'Era does not belong to artist' }, 400);
  }

  const score = Number(era.identity_alignment_score ?? 50);
  const scale = getAlignmentScale(score);
  const costs = ERA_ACTION_COSTS[actionId] || { energy: 0, inspiration: 0 };
  const { anticipationDelta, momentumDelta, tensionDelta, volatilityDelta } = computeEraActionDeltas(base, score, !!era.is_experimental);

  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('energy, inspiration, clout')
    .eq('id', era.artist_id)
    .maybeSingle();
  if (!profileData) return jsonResponse({ error: 'Artist profile not found' }, 400);
  if (Number(profileData.energy || 0) < costs.energy || Number(profileData.inspiration || 0) < costs.inspiration) {
    return jsonResponse({ error: 'Insufficient resources for era action' }, 400);
  }

  // Get current turn state
  const { data: turnState } = await supabaseAdmin
    .from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle();
  const currentTurnIndex = turnState?.global_turn_id ?? 0;

  // Clout delta from era action — scales with alignment score
  const cloutDelta = Math.max(0, Math.floor((base.clout || 0) * (0.5 + (score / 100))));

  const patch: Record<string, any> = {
    anticipation_meter: Math.max(0, Math.min(100, Number(era.anticipation_meter || 0) + anticipationDelta)),
    momentum: Math.max(0, Math.min(100, Number(era.momentum || 0) + momentumDelta)),
    tension: Math.max(0, Math.min(100, Number(era.tension || 0) + tensionDelta)),
    volatility_level: Math.max(0, Math.min(100, Number(era.volatility_level || 0) + volatilityDelta)),
    era_clout_generated: Math.max(0, (Number(era.era_clout_generated) || 0) + cloutDelta),
    era_actions: [
      ...(Array.isArray(era.era_actions) ? era.era_actions : []),
      { id: actionId, executed_at: new Date().toISOString(), deltas: { anticipationDelta, momentumDelta, tensionDelta, volatilityDelta, cloutDelta }, alignment_score: score },
    ],
  };

  await supabaseAdmin.from('eras').update(patch).eq('id', eraId);

  await supabaseAdmin
    .from('profiles')
    .update({
      energy: Math.max(0, Number(profileData.energy || 0) - costs.energy),
      inspiration: Math.max(0, Number(profileData.inspiration || 0) - costs.inspiration),
      clout: Math.max(0, (Number(profileData.clout) || 0) + cloutDelta),
    })
    .eq('id', era.artist_id);

  await supabaseAdmin.from('turn_event_log').insert({
    global_turn_id: currentTurnIndex,
    player_id: era.artist_id,
    module: 'EraAction',
    event_type: 'era_action_executed',
    description: `Executed era action: ${actionId} (+${cloutDelta} clout)`,
    deltas: { anticipationDelta, momentumDelta, tensionDelta, volatilityDelta, cloutDelta },
    metadata: { action_id: actionId, alignment_score: score, scale, costs },
  });

  return jsonResponse({ success: true, patch, cloutDelta, costs }, 200);
}

// Update era metrics (releases_count, total_streams, etc.) when releases are made
async function updateEraMetrics(req, parsedBody) {
  // For updateEraMetrics, we allow unauthenticated calls since this is called
  // from release creation flow where we validate artistId directly
  const { artistId } = parsedBody || {};
  if (!artistId) return jsonResponse({ error: 'Missing artistId' }, 400);

  try {
    // Get active era for this artist
    const { data: era } = await supabaseAdmin
      .from('eras')
      .select('*')
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .maybeSingle();

    if (!era) {
      return jsonResponse({ success: true, message: 'No active era' }, 200);
    }

    // Get all releases since era started
    const { data: releases } = await supabaseAdmin
      .from('releases')
      .select('id, lifetime_streams, lifetime_revenue, created_at')
      .eq('artist_id', artistId)
      .gte('created_at', era.created_at);

    const releaseList = releases || [];
    
    // Calculate era metrics
    const releasesCount = releaseList.length;
    const totalStreams = releaseList.reduce((sum, r) => sum + (Number(r.lifetime_streams) || 0), 0);
    const totalRevenue = releaseList.reduce((sum, r) => sum + (Number(r.lifetime_revenue) || 0), 0);

    // Update era with new metrics
    await supabaseAdmin
      .from('eras')
      .update({
        releases_count: releasesCount,
        total_streams: totalStreams,
        total_revenue: totalRevenue.toString(),
      })
      .eq('id', era.id);

    return jsonResponse({
      success: true,
      updated: {
        releases_count: releasesCount,
        total_streams: totalStreams,
        total_revenue: totalRevenue,
      }
    }, 200);
  } catch (error) {
    console.error("Update era metrics failed:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

// Designate a qualifying release as "iconic" for the active era (max 3 per era)
async function designateIconicRelease(_req: any, parsedBody: any) {
  const { eraId, releaseId, artistId } = parsedBody || {};
  if (!eraId || !releaseId || !artistId) return jsonResponse({ error: 'Missing eraId, releaseId, or artistId' }, 400);

  try {
    const { data: era } = await supabaseAdmin.from('eras').select('*').eq('id', eraId).maybeSingle();
    if (!era || era.artist_id !== artistId) return jsonResponse({ error: 'Invalid era or not your era' }, 400);
    if (!era.is_active) return jsonResponse({ error: 'Era is not active' }, 400);

    const { data: release } = await supabaseAdmin.from('releases').select('id, title, lifetime_streams').eq('id', releaseId).eq('artist_id', artistId).maybeSingle();
    if (!release) return jsonResponse({ error: 'Release not found' }, 400);

    const MIN_STREAMS_FOR_ICONIC = 5000;
    if ((Number(release.lifetime_streams) || 0) < MIN_STREAMS_FOR_ICONIC) {
      return jsonResponse({ error: `Release needs at least ${MIN_STREAMS_FOR_ICONIC.toLocaleString()} streams to be designated iconic` }, 400);
    }

    const existing = Array.isArray(era.iconic_releases) ? era.iconic_releases : [];
    if (existing.length >= 3) return jsonResponse({ error: 'Maximum 3 iconic releases per era' }, 400);
    if (existing.some((r: any) => r.release_id === releaseId)) return jsonResponse({ error: 'Release is already iconic' }, 400);

    const updated = [...existing, { release_id: releaseId, title: release.title, designated_at: new Date().toISOString() }];
    await supabaseAdmin.from('eras').update({ iconic_releases: updated }).eq('id', eraId);

    return jsonResponse({ success: true, iconic_releases: updated }, 200);
  } catch (error) {
    console.error('designateIconicRelease failed:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

// Route handler for standalone edge function endpoint
export async function handleEraRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'detectEvolution') {
      return await detectEraEvolution(req, body);
    } else if (action === 'handleEraEnd') {
      return await handleEraEnd(req, body);
    } else if (action === 'executeEraAction') {
      return await executeEraAction(req, body);
    } else if (action === 'updateEraMetrics') {
      return await updateEraMetrics(req, body);
    } else if (action === 'designateIconicRelease') {
      return await designateIconicRelease(req, body);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error("Endpoint error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

export { executeEraAction };