import { getAuthUser } from '../_shared/lib/authFromRequest.ts';
import { supabaseAdmin } from '../_shared/lib/supabaseAdmin.ts';
import { getStageIndex } from '../_shared/constants/careerStages.ts';
import { insertNotificationIdempotent } from '../_shared/notificationInsert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACTIVE_RELEASE_STATES = ['Hot', 'Trending', 'Momentum', 'Stable'];

// ─── V2 Constants ───────────────────────────────────────────────
const SHOW_CREATION_ENERGY_COST = 20;
const SHOW_SEED_LISTENERS = 50;
const SHOW_SUBMISSION_COST = 3;
const MAX_CURATED_PLAYLIST_SIZE = 10;
const HOST_EPISODE_ENERGY_COST = 10;
const HOST_COOLDOWN_TURNS = 12;
const PROMOTE_SHOW_ENERGY_COST = 5;
const ACCEPTANCE_EARLY_CAREER_BONUS = 0.10;
const ACCEPTANCE_ESTABLISHED_PENALTY = 0.15;
const IMPRESSION_STAGE_PENALTY_PER_LEVEL = 0.12;
const IMPRESSION_STAGE_PENALTY_FLOOR = 0.40;

function randomTraceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function successResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function errorResponse(message: string, status = 400, traceId = randomTraceId()): Response {
  return successResponse({ error: message, traceId, timestamp: new Date().toISOString() }, status);
}

function seededChance(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = (hash >>> 0) % 100000;
  return n / 100000;
}

function seededRange(seed: string, min: number, max: number): number {
  return min + (max - min) * seededChance(seed);
}

async function getCurrentTurnId() {
  const { data, error } = await supabaseAdmin
    .from('turn_state')
    .select('global_turn_id')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Number(data?.global_turn_id || 0);
}

async function getShows(artistId?: string) {
  const { data: shows, error } = await supabaseAdmin
    .from('soundburst_radio_shows')
    .select('*')
    .eq('status', 'active')
    .order('listener_count', { ascending: false });

  if (error) throw new Error(error.message);

  let playerSubmissions: any[] = [];
  if (artistId) {
    const { data: rows, error: subErr } = await supabaseAdmin
      .from('soundburst_radio_submissions')
      .select('id, show_id, release_id, status, impressions_per_turn, submitted_turn, resolved_turn, expires_turn, total_turns_active, outcome_notes, created_at')
      .eq('player_id', artistId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (subErr) throw new Error(subErr.message);
    playerSubmissions = rows || [];
  }

  return { shows: shows || [], playerSubmissions };
}

async function getEligibleReleases(artistId: string) {
  const { data, error } = await supabaseAdmin
    .from('releases')
    .select('id, title, genre, release_status, lifecycle_state, created_at')
    .eq('artist_id', artistId)
    .eq('release_status', 'released')
    .in('lifecycle_state', ACTIVE_RELEASE_STATES)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return { releases: data || [] };
}

async function getSubmissions(artistId: string) {
  const { data, error } = await supabaseAdmin
    .from('soundburst_radio_submissions')
    .select('id, show_id, player_id, release_id, status, submitted_turn, resolved_turn, expires_turn, impressions_per_turn, total_turns_active, outcome_notes, created_at, updated_at, soundburst_radio_shows(name, host_name, region, show_tier), releases(title, genre)')
    .eq('player_id', artistId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return { submissions: data || [] };
}

async function submitRelease(artistId: string, showId: string, releaseId: string) {
  const [turnId, playerRes, showRes, releaseRes] = await Promise.all([
    getCurrentTurnId(),
    supabaseAdmin.from('profiles').select('id, energy, clout, followers, fans, career_stage').eq('id', artistId).maybeSingle(),
    supabaseAdmin.from('soundburst_radio_shows').select('*').eq('id', showId).maybeSingle(),
    supabaseAdmin.from('releases').select('id, artist_id, title, genre, release_status, lifecycle_state').eq('id', releaseId).maybeSingle(),
  ]);

  if (playerRes.error || !playerRes.data) throw new Error(playerRes.error?.message || 'Player not found');
  if (showRes.error || !showRes.data) throw new Error(showRes.error?.message || 'Show not found');
  if (releaseRes.error || !releaseRes.data) throw new Error(releaseRes.error?.message || 'Release not found');

  const player = playerRes.data;
  const show = showRes.data;
  const release = releaseRes.data;

  if (show.status !== 'active') throw new Error('Show is not active');
  if (release.artist_id !== artistId) throw new Error('Release does not belong to artist');
  if (release.release_status !== 'released') throw new Error('Only released tracks can be submitted');
  if (!ACTIVE_RELEASE_STATES.includes(String(release.lifecycle_state || ''))) {
    throw new Error('Release is not currently eligible for radio submissions');
  }

  const clout = Number(player.clout || 0);
  const followers = Number((player as any).fans ?? player.followers ?? 0);
  if (clout < Number(show.min_clout || 0)) throw new Error(`Requires ${show.min_clout} clout`);
  if (followers < Number(show.min_followers || 0)) throw new Error(`Requires ${show.min_followers} followers`);

  const cost = Number(show.submission_cost || 0);
  const energy = Number(player.energy || 0);
  if (energy < cost) throw new Error(`Insufficient energy. Need ${cost}, have ${energy}`);

  const { data: existingActive, error: existingErr } = await supabaseAdmin
    .from('soundburst_radio_submissions')
    .select('id, status')
    .eq('show_id', showId)
    .eq('player_id', artistId)
    .eq('release_id', releaseId)
    .in('status', ['pending', 'accepted'])
    .limit(1)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existingActive?.id) throw new Error('You already have an active submission for this show and release');

  let chance = show.show_tier === 'tastemaker' ? 0.30 : 0.50;

  const affinities = (show.genre_affinity || []).map((g: string) => String(g).toLowerCase());
  if (affinities.includes(String(release.genre || '').toLowerCase())) {
    chance += 0.15;
  }

  const { data: regionRepRow } = await supabaseAdmin
    .from('player_city_reputation')
    .select('reputation_score, city_scenes!inner(region)')
    .eq('player_id', artistId)
    .eq('city_scenes.region', show.region)
    .limit(25);

  if (regionRepRow?.length) {
    const avgRep = regionRepRow.reduce((sum: number, row: any) => sum + (Number(row.reputation_score) || 0), 0) / regionRepRow.length;
    chance += Math.min(0.2, Math.max(0, avgRep / 500));
  }

  chance += Math.min(0.1, Math.max(0, clout / 5000));

  // Career stage bias: early career gets +10%, established gets -15%
  const careerStage = player.career_stage || 'Unknown';
  const stageIdx = getStageIndex(careerStage);
  if (stageIdx <= 3) {
    chance += ACCEPTANCE_EARLY_CAREER_BONUS;
  } else if (stageIdx >= 5) {
    chance -= ACCEPTANCE_ESTABLISHED_PENALTY;
  }

  chance = Math.max(0.05, Math.min(0.95, chance));

  const rollSeed = `${artistId}:${showId}:${releaseId}:${turnId}`;
  const accepted = seededChance(rollSeed) <= chance;
  const rangeMult = seededRange(`${rollSeed}:impressions`, 0.8, 1.2);

  // Career stage impression scaling
  const stageImpressionMult = stageIdx <= 3
    ? 1.0
    : Math.max(IMPRESSION_STAGE_PENALTY_FLOOR, 1.0 - (stageIdx - 3) * IMPRESSION_STAGE_PENALTY_PER_LEVEL);
  const impressionsPerTurn = accepted ? Math.max(1, Math.round(Number(show.listener_count || 0) * 0.01 * rangeMult * stageImpressionMult)) : 0;

  const submittedTurn = turnId;
  const expiresTurn = submittedTurn + 14;
  const resolvedTurn = accepted ? null : submittedTurn;
  const status = accepted ? 'accepted' : 'rejected';
  const outcome = accepted
    ? 'Accepted — your release is now in Soundburst rotation'
    : 'Not selected this time';

  // Insert submission first (atomicity: insert before energy deduction)
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('soundburst_radio_submissions')
    .insert({
      show_id: showId,
      player_id: artistId,
      release_id: releaseId,
      status,
      submitted_turn: submittedTurn,
      resolved_turn: resolvedTurn,
      expires_turn: expiresTurn,
      impressions_per_turn: impressionsPerTurn,
      total_turns_active: 0,
      outcome_notes: outcome,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  // Deduct energy after successful insert
  const { error: energyErr } = await supabaseAdmin
    .from('profiles')
    .update({ energy: Math.max(0, energy - cost), updated_at: new Date().toISOString() })
    .eq('id', artistId);

  if (energyErr) {
    // Rollback: delete the submission if energy deduction fails
    await supabaseAdmin.from('soundburst_radio_submissions').delete().eq('id', inserted.id);
    throw new Error(energyErr.message);
  }

  return {
    accepted,
    impressionsPerTurn,
    submissionId: inserted.id,
    outcome,
  };
}

// ─── V2: Player-Hosted Show Management ──────────────────────────────────

async function createShow(artistId: string, body: any) {
  const { name, description, genre_focus, schedule_label, region } = body;
  if (!name || !region) throw new Error('name and region are required');
  if (String(name).length > 100) throw new Error('Show name too long (max 100 chars)');
  if (description && String(description).length > 200) throw new Error('Description too long (max 200 chars)');

  // Check player doesn't already have an active show
  const { data: existingShow } = await supabaseAdmin
    .from('soundburst_radio_shows')
    .select('id')
    .eq('host_player_id', artistId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingShow) throw new Error('You already have an active radio show');

  const [playerRes, turnId] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, energy, career_stage, clout, artist_name').eq('id', artistId).maybeSingle(),
    getCurrentTurnId(),
  ]);
  if (playerRes.error || !playerRes.data) throw new Error('Player not found');
  const player = playerRes.data;

  const energy = Number(player.energy || 0);
  if (energy < SHOW_CREATION_ENERGY_COST) throw new Error(`Insufficient energy. Need ${SHOW_CREATION_ENERGY_COST}, have ${energy}`);

  // Check unlock requirements
  const stageIdx = getStageIndex(player.career_stage || 'Unknown');
  let unlocked = false;
  let unlockReason = '';

  // Path 1: Career milestone (Underground Artist + at least 1 accepted submission)
  if (stageIdx >= 3) {
    const { data: acceptedSub } = await supabaseAdmin
      .from('soundburst_radio_submissions')
      .select('id')
      .eq('player_id', artistId)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();
    if (acceptedSub) {
      unlocked = true;
      unlockReason = 'career_milestone';
    }
  }

  // Path 2: Scene contact perk (radio_host_slot)
  if (!unlocked) {
    const { data: contactRels } = await supabaseAdmin
      .from('player_contact_relationships')
      .select('unlocked_perks')
      .eq('player_id', artistId);
    for (const rel of (contactRels || [])) {
      const perks = Array.isArray(rel.unlocked_perks) ? rel.unlocked_perks : [];
      if (perks.includes('radio_host_slot')) {
        unlocked = true;
        unlockReason = 'scene_contact_perk';
        break;
      }
    }
  }

  // Path 3: High scene influence (scene_influence_score >= 50 in any city + clout >= 100)
  if (!unlocked && Number(player.clout || 0) >= 100) {
    const { data: highInfluence } = await supabaseAdmin
      .from('player_city_reputation')
      .select('scene_influence_score')
      .eq('player_id', artistId)
      .gte('scene_influence_score', 50)
      .limit(1)
      .maybeSingle();
    if (highInfluence) {
      unlocked = true;
      unlockReason = 'influence_threshold';
    }
  }

  if (!unlocked) {
    throw new Error('You haven\'t unlocked radio hosting yet. Reach Underground Artist stage with an accepted submission, unlock a radio_host_slot perk from a scene contact, or build scene influence >= 50 with clout >= 100.');
  }

  // Check region validity
  const { data: regionRep } = await supabaseAdmin
    .from('player_city_reputation')
    .select('reputation_score, city_scenes!inner(region)')
    .eq('player_id', artistId)
    .eq('city_scenes.region', region)
    .gte('reputation_score', 20)
    .limit(1)
    .maybeSingle();
  if (!regionRep) throw new Error(`You need at least 20 reputation in a city in ${region} to host a show there`);

  const genres = Array.isArray(genre_focus) ? genre_focus.slice(0, 3) : [];

  const { data: show, error: showErr } = await supabaseAdmin
    .from('soundburst_radio_shows')
    .insert({
      name: String(name).trim(),
      host_name: player.artist_name || 'DJ Player',
      description: description ? String(description).trim() : null,
      schedule_label: schedule_label ? String(schedule_label).trim() : null,
      region,
      genre_affinity: genres,
      show_tier: 'underground',
      status: 'active',
      listener_count: SHOW_SEED_LISTENERS,
      base_listener_count: SHOW_SEED_LISTENERS,
      submission_cost: SHOW_SUBMISSION_COST,
      min_clout: 0,
      min_followers: 0,
      is_npc: false,
      host_player_id: artistId,
      reputation_score: 0,
    })
    .select('id, name')
    .single();

  if (showErr) throw new Error(showErr.message);

  // Deduct energy
  await supabaseAdmin
    .from('profiles')
    .update({ energy: Math.max(0, energy - SHOW_CREATION_ENERGY_COST), updated_at: new Date().toISOString() })
    .eq('id', artistId);

  return { success: true, show, unlockReason };
}

async function manageShow(artistId: string, body: any) {
  const subAction = String(body?.subAction || '').trim();
  if (!subAction) throw new Error('subAction is required');

  const { data: show, error: showErr } = await supabaseAdmin
    .from('soundburst_radio_shows')
    .select('*')
    .eq('host_player_id', artistId)
    .eq('status', 'active')
    .maybeSingle();

  if (showErr || !show) throw new Error('No active show found');

  const [playerRes, turnId] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, energy').eq('id', artistId).maybeSingle(),
    getCurrentTurnId(),
  ]);
  if (playerRes.error || !playerRes.data) throw new Error('Player not found');
  const player = playerRes.data;
  const energy = Number(player.energy || 0);

  if (subAction === 'updateShow') {
    const patch: any = { updated_at: new Date().toISOString() };
    if (body.name) patch.name = String(body.name).trim().slice(0, 100);
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim().slice(0, 200) : null;
    if (body.genre_focus) patch.genre_affinity = Array.isArray(body.genre_focus) ? body.genre_focus.slice(0, 3) : [];
    if (body.schedule_label !== undefined) patch.schedule_label = body.schedule_label ? String(body.schedule_label).trim() : null;

    const { error } = await supabaseAdmin.from('soundburst_radio_shows').update(patch).eq('id', show.id);
    if (error) throw new Error(error.message);
    return { success: true, updated: Object.keys(patch) };
  }

  if (subAction === 'curatePlaylist') {
    const releaseIds = Array.isArray(body.releaseIds) ? body.releaseIds.slice(0, MAX_CURATED_PLAYLIST_SIZE) : [];
    if (releaseIds.length === 0) throw new Error('At least one release ID is required');

    const CURATE_ENERGY_COST = 5;
    if (energy < CURATE_ENERGY_COST) throw new Error(`Insufficient energy. Need ${CURATE_ENERGY_COST}, have ${energy}`);

    // Validate releases exist and are in active lifecycle
    const { data: validReleases } = await supabaseAdmin
      .from('releases')
      .select('id')
      .in('id', releaseIds)
      .eq('release_status', 'released')
      .in('lifecycle_state', ACTIVE_RELEASE_STATES);

    const validIds = (validReleases || []).map((r: any) => r.id);
    if (validIds.length === 0) throw new Error('No valid releases in the provided list');

    await Promise.all([
      supabaseAdmin.from('soundburst_radio_shows').update({
        curated_playlist: validIds,
        updated_at: new Date().toISOString(),
      }).eq('id', show.id),
      supabaseAdmin.from('profiles').update({
        energy: Math.max(0, energy - CURATE_ENERGY_COST),
        updated_at: new Date().toISOString(),
      }).eq('id', artistId),
    ]);

    return { success: true, curated: validIds.length };
  }

  if (subAction === 'hostEpisode') {
    if (energy < HOST_EPISODE_ENERGY_COST) throw new Error(`Insufficient energy. Need ${HOST_EPISODE_ENERGY_COST}, have ${energy}`);

    // Cooldown check
    const lastHosted = Number(show.last_hosted_turn || 0);
    if (lastHosted > 0 && turnId - lastHosted < HOST_COOLDOWN_TURNS) {
      const turnsRemaining = HOST_COOLDOWN_TURNS - (turnId - lastHosted);
      throw new Error(`Cooldown active. ${turnsRemaining} turns remaining before you can host again.`);
    }

    await Promise.all([
      supabaseAdmin.from('soundburst_radio_shows').update({
        last_hosted_turn: turnId,
        hosting_frequency: (Number(show.hosting_frequency) || 0) + 1,
        total_episodes_hosted: (Number(show.total_episodes_hosted) || 0) + 1,
        listener_count: Math.round(Number(show.listener_count) * 1.15), // 15% boost on host
        updated_at: new Date().toISOString(),
      }).eq('id', show.id),
      supabaseAdmin.from('profiles').update({
        energy: Math.max(0, energy - HOST_EPISODE_ENERGY_COST),
        updated_at: new Date().toISOString(),
      }).eq('id', artistId),
    ]);

    await supabaseAdmin.from('notifications').insert({
      player_id: artistId,
      type: 'RADIO_HOST',
      title: `Episode Hosted: ${show.name}`,
      subtitle: `Your latest episode is now live on air`,
      body: `You hosted a new episode and boosted your show momentum. Keep the cadence up to grow reputation.`,
      metrics: {
        show_id: show.id,
        show_name: show.name,
        listener_count: Math.round(Number(show.listener_count) * 1.15),
      },
      deep_links: [{ label: 'View Radio', route: 'Career', params: { openApp: 'soundburst', tab: 'radio' } }],
      is_read: false,
      priority: 'medium',
      global_turn_id: turnId,
      created_turn_index: turnId,
      idempotency_key: `radio_host:${artistId}:${show.id}:${turnId}`,
    });

    await supabaseAdmin.from('turn_event_log').insert({
      player_id: artistId,
      global_turn_id: turnId,
      module: 'soundburstRadio',
      event_type: 'RADIO_HOST',
      description: 'Hosted a Soundburst radio episode',
      metadata: {
        show_id: show.id,
        show_name: show.name,
      },
    });

    return { success: true, episodeHosted: true, totalEpisodes: (Number(show.total_episodes_hosted) || 0) + 1 };
  }

  if (subAction === 'promoteShow') {
    if (energy < PROMOTE_SHOW_ENERGY_COST) {
      throw new Error(`Insufficient energy. Need ${PROMOTE_SHOW_ENERGY_COST}, have ${energy}`);
    }

    await Promise.all([
      supabaseAdmin.from('soundburst_radio_shows').update({
        social_mention_count: (Number(show.social_mention_count) || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', show.id),
      supabaseAdmin.from('profiles').update({
        energy: Math.max(0, energy - PROMOTE_SHOW_ENERGY_COST),
        updated_at: new Date().toISOString(),
      }).eq('id', artistId),
    ]);

    return {
      success: true,
      promoted: true,
      suggested_alignment_tags: ['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo'],
      social_mention_count: (Number(show.social_mention_count) || 0) + 1,
    };
  }

  if (subAction === 'retireShow') {
    const { error } = await supabaseAdmin.from('soundburst_radio_shows').update({
      status: 'retired',
      updated_at: new Date().toISOString(),
    }).eq('id', show.id);
    if (error) throw new Error(error.message);
    return { success: true, retired: true };
  }

  throw new Error(`Unknown subAction: ${subAction}`);
}

async function getMyShow(artistId: string) {
  const { data: show } = await supabaseAdmin
    .from('soundburst_radio_shows')
    .select('*')
    .eq('host_player_id', artistId)
    .in('status', ['active', 'retired'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check unlock status
  let unlockStatus = { unlocked: false, paths: [] as string[] };
  if (!show) {
    const [playerRes, contactRels, highInfluence, acceptedSub] = await Promise.all([
      supabaseAdmin.from('profiles').select('career_stage, clout').eq('id', artistId).maybeSingle(),
      supabaseAdmin.from('player_contact_relationships').select('unlocked_perks').eq('player_id', artistId),
      supabaseAdmin.from('player_city_reputation').select('scene_influence_score').eq('player_id', artistId).gte('scene_influence_score', 50).limit(1).maybeSingle(),
      supabaseAdmin.from('soundburst_radio_submissions').select('id').eq('player_id', artistId).eq('status', 'accepted').limit(1).maybeSingle(),
    ]);
    const player = playerRes.data;
    const stageIdx = getStageIndex(player?.career_stage || 'Unknown');
    const paths: string[] = [];
    if (stageIdx >= 3 && acceptedSub.data) paths.push('career_milestone');
    for (const rel of (contactRels.data || [])) {
      if ((Array.isArray(rel.unlocked_perks) ? rel.unlocked_perks : []).includes('radio_host_slot')) {
        paths.push('scene_contact_perk');
        break;
      }
    }
    if (Number(player?.clout || 0) >= 100 && highInfluence.data) paths.push('influence_threshold');
    unlockStatus = { unlocked: paths.length > 0, paths };
  }

  return { show: show || null, unlockStatus };
}

async function submitLiveRecording(artistId: string, body: any) {
  const showId = String(body?.showId || '');
  const gigId = String(body?.gigId || '');
  if (!showId || !gigId) throw new Error('showId and gigId are required');

  const [turnId, showRes, gigRes] = await Promise.all([
    getCurrentTurnId(),
    supabaseAdmin.from('soundburst_radio_shows').select('id, name, region, listener_count, status').eq('id', showId).maybeSingle(),
    supabaseAdmin.from('gigs').select('id, artist_id, status, capacity, tickets_sold, city, event_outcome').eq('id', gigId).maybeSingle(),
  ]);

  if (!showRes.data) throw new Error('Show not found');
  if (!gigRes.data) throw new Error('Gig not found');
  const show = showRes.data;
  const gig = gigRes.data;

  if (show.status !== 'active') throw new Error('Show is not active');
  if (gig.artist_id !== artistId) throw new Error('Gig does not belong to you');
  if (gig.status !== 'Completed') throw new Error('Gig must be completed');

  let gigRegion: string | null = null;
  if (gig.city) {
    const { data: cityScene } = await supabaseAdmin
      .from('city_scenes')
      .select('region')
      .eq('city_name', gig.city)
      .maybeSingle();
    gigRegion = cityScene?.region || null;
  }
  if (!gigRegion || gigRegion !== show.region) {
    throw new Error(`Show region must match gig region. Show is ${show.region}, gig region is ${gigRegion || 'unknown'}`);
  }

  const capacity = Number(gig.capacity) || 1;
  const sold = Number(gig.tickets_sold) || 0;
  const eventOutcome = typeof gig.event_outcome === 'string' ? JSON.parse(gig.event_outcome || '{}') : (gig.event_outcome || {});
  const attendanceRatio = Number(eventOutcome.attendance_ratio || eventOutcome.fill_rate || (sold / capacity)) || 0;
  if (attendanceRatio < 0.80) throw new Error(`Gig attendance ratio must be >= 80%. Yours was ${Math.round(attendanceRatio * 100)}%`);

  const [{ data: releaseCandidates }, { data: existingActiveRows }] = await Promise.all([
    supabaseAdmin
      .from('releases')
      .select('id, title, created_at')
      .eq('artist_id', artistId)
      .eq('release_status', 'released')
      .in('lifecycle_state', ACTIVE_RELEASE_STATES)
      .order('created_at', { ascending: false })
      .limit(25),
    supabaseAdmin
      .from('soundburst_radio_submissions')
      .select('release_id')
      .eq('show_id', showId)
      .eq('player_id', artistId)
      .in('status', ['pending', 'accepted'])
      .limit(100),
  ]);

  const usedReleaseIds = new Set((existingActiveRows || []).map((row: any) => row.release_id));
  const chosenRelease = (releaseCandidates || []).find((row: any) => !usedReleaseIds.has(row.id));
  if (!chosenRelease?.id) {
    throw new Error('No eligible released track available for live recording submission on this show');
  }
  const chosenReleaseId = chosenRelease.id;

  // Check no existing live recording for this gig
  const { data: existing } = await supabaseAdmin
    .from('soundburst_radio_submissions')
    .select('id')
    .eq('source_gig_id', gigId)
    .eq('submission_type', 'live_recording')
    .limit(1)
    .maybeSingle();
  if (existing) throw new Error('A live recording from this gig has already been submitted');

  const impressionsPerTurn = Math.max(1, Math.round(Number(show.listener_count || 0) * 0.02)); // 2x normal rate

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('soundburst_radio_submissions')
    .insert({
      show_id: showId,
      player_id: artistId,
      release_id: chosenReleaseId,
      status: 'accepted', // Auto-accepted
      submitted_turn: turnId,
      expires_turn: turnId + 7,
      impressions_per_turn: impressionsPerTurn,
      total_turns_active: 0,
      outcome_notes: 'Live recording from a successful gig — auto-accepted',
      submission_type: 'live_recording',
      source_gig_id: gigId,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  await supabaseAdmin.from('turn_event_log').insert({
    player_id: artistId,
    global_turn_id: turnId,
    module: 'soundburstRadio',
    event_type: 'RADIO_LIVE_BROADCAST',
    description: 'Submitted a live recording for radio broadcast',
    metadata: {
      show_id: show.id,
      show_name: show.name,
        release_id: chosenReleaseId,
      source_gig_id: gigId,
      impressions_per_turn: impressionsPerTurn,
      duration_turns: 7,
    },
  });

  return { success: true, accepted: true, submissionId: inserted.id, impressionsPerTurn, duration: 7 };
}

async function getDiscoveryEvents(artistId: string) {
  const { data, error } = await supabaseAdmin
    .from('soundburst_radio_discovery_events')
    .select('*')
    .eq('player_id', artistId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return { events: data || [] };
}

async function respondToDiscovery(artistId: string, body: any) {
  const eventId = String(body?.eventId || '');
  const submissionId = String(body?.submissionId || '');
  const eventType = String(body?.eventType || '');
  const response = String(body?.response || ''); // 'accept' or 'decline'
  if ((eventId.length === 0 && submissionId.length === 0) || !['accept', 'decline'].includes(response)) {
    throw new Error('eventId or submissionId is required, with response (accept/decline)');
  }

  const turnId = await getCurrentTurnId();

  let eventQuery = supabaseAdmin
    .from('soundburst_radio_discovery_events')
    .select('*')
    .eq('player_id', artistId)
    .eq('status', 'pending');

  if (eventId) {
    eventQuery = eventQuery.eq('id', eventId);
  } else {
    eventQuery = eventQuery.eq('submission_id', submissionId);
    if (eventType) eventQuery = eventQuery.eq('event_type', eventType);
    eventQuery = eventQuery.order('created_at', { ascending: false }).limit(1);
  }

  const { data: event, error } = await eventQuery.maybeSingle();

  if (error || !event) throw new Error('Discovery event not found or already resolved');
  if (event.expires_turn <= turnId) {
    await supabaseAdmin.from('soundburst_radio_discovery_events').update({ status: 'expired', resolved_turn: turnId }).eq('id', event.id);
    throw new Error('This offer has expired');
  }

  if (response === 'decline') {
    await supabaseAdmin.from('soundburst_radio_discovery_events').update({ status: 'declined', resolved_turn: turnId }).eq('id', event.id);
    return { success: true, status: 'declined' };
  }

  const details = event.details || {};
  const result: any = { success: true, status: 'accepted', event_type: event.event_type };

  if (event.event_type === 'playlist_feature') {
    // Boost impressions for 7 turns on the related submission
    if (event.submission_id) {
      const { data: targetSubmission } = await supabaseAdmin
        .from('soundburst_radio_submissions')
        .select('id, impressions_per_turn, expires_turn')
        .eq('id', event.submission_id)
        .maybeSingle();

      const currentImpressions = Number(targetSubmission?.impressions_per_turn || 0);
      const boostedImpressionsPerTurn = Math.max(1, Math.round(currentImpressions * 1.5));
      const currentExpires = Number(targetSubmission?.expires_turn || 0);
      const boostedExpiresTurn = Math.max(currentExpires, turnId + 7);

      await supabaseAdmin.from('soundburst_radio_submissions').update({
        impressions_per_turn: boostedImpressionsPerTurn,
        expires_turn: boostedExpiresTurn,
      }).eq('id', event.submission_id);

      result.metrics = {
        boostedImpressionsPerTurn,
        boostedExpiresTurn,
      };
    }
    result.detail = 'Your release has been featured on a premium Soundburst playlist!';
  }

  if (event.event_type === 'gig_offer') {
    const { data: createdGig, error: gigErr } = await supabaseAdmin
      .from('gigs')
      .insert({
        artist_id: artistId,
        status: 'Booked',
        scheduled_turn: turnId + 1,
        metadata: {
          source: 'radio_discovery',
          discovery_event_id: event.id,
          region: details.show_region || null,
          source_submission_id: event.submission_id,
        },
      })
      .select('id, scheduled_turn')
      .maybeSingle();

    if (gigErr) throw new Error(gigErr.message);
    result.gig = createdGig || null;
    result.detail = `A venue in ${details.show_region || 'your region'} is offering you a gig slot. Check your touring dashboard.`;
  }

  if (event.event_type === 'collab_offer') {
    const { data: candidateRequester } = await supabaseAdmin
      .from('players')
      .select('id')
      .neq('id', artistId)
      .limit(1)
      .maybeSingle();

    if (candidateRequester?.id) {
      const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('artist_name')
        .eq('id', candidateRequester.id)
        .maybeSingle();

      const { data: collabRequest, error: collabErr } = await supabaseAdmin
        .from('collaboration_requests')
        .insert({
          requester_artist_id: candidateRequester.id,
          target_artist_id: artistId,
          collaboration_type: 'Feature',
          status: 'pending',
          proposed_concept: `Radio discovery collab: ${details.release_title || 'your track'} caught attention through Soundburst.`,
          requester_energy_cost: 0,
          target_energy_cost: 0,
        })
        .select('id, collaboration_type, status, proposed_concept')
        .maybeSingle();

      if (collabErr) throw new Error(collabErr.message);
      result.collaboration_request = collabRequest || null;

      if (collabRequest?.id) {
        const requesterName = requesterProfile?.artist_name || 'A producer';
        const releaseTitle = details.release_title || 'your track';
        await insertNotificationIdempotent(supabaseAdmin, {
          player_id: artistId,
          type: 'COLLABORATION_REQUEST',
          title: 'Collaboration Request',
          subtitle: `${requesterName} wants to collaborate after hearing "${releaseTitle}".`,
          body: collabRequest.proposed_concept || `A producer wants to collaborate after hearing "${releaseTitle}" on the radio.`,
          priority: 'high',
          metrics: {
            collaboration_id: collabRequest.id,
            collaboration_type: collabRequest.collaboration_type,
            requester_id: candidateRequester.id,
            requester_name: requesterName,
            release_title: releaseTitle,
          },
          payload: {
            collaboration_id: collabRequest.id,
            collaboration_type: collabRequest.collaboration_type,
            requester_id: candidateRequester.id,
            requester_name: requesterName,
            proposed_concept: collabRequest.proposed_concept || null,
            release_title: releaseTitle,
          },
          deep_links: [
            { label: 'Open Collaboration Inbox', route: 'Social', params: { openInbox: 'collaborations' } },
          ],
          idempotency_key: `radio_collab_request:${collabRequest.id}`,
          is_read: false,
        }, 'soundburstRadio.collabOffer');
      }
    }

    result.detail = `A producer wants to collaborate after hearing "${details.release_title || 'your track'}" on the radio.`;
  }

  const { error: acceptErr } = await supabaseAdmin
    .from('soundburst_radio_discovery_events')
    .update({ status: 'accepted', resolved_turn: turnId })
    .eq('id', event.id);

  if (acceptErr) throw new Error(acceptErr.message);

  return result;
}

(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const traceId = randomTraceId();

  try {
    const { user, error: authError } = await getAuthUser(req);
    if (!user) return errorResponse(authError || 'Unauthorized', 401, traceId);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const artistId = body?.artistId ? String(body.artistId) : user.id;

    if (artistId !== user.id) {
      return errorResponse('Unauthorized artistId', 403, traceId);
    }

    if (action === 'getShows') {
      return successResponse(await getShows(artistId));
    }

    if (action === 'getEligibleReleases') {
      return successResponse(await getEligibleReleases(artistId));
    }

    if (action === 'getSubmissions') {
      return successResponse(await getSubmissions(artistId));
    }

    if (action === 'followShow') {
      return successResponse({ success: true, followed: true });
    }

    if (action === 'submit') {
      const showId = String(body?.showId || '');
      const releaseId = String(body?.releaseId || '');
      if (!showId || !releaseId) {
        return errorResponse('artistId, showId, and releaseId are required', 400, traceId);
      }
      return successResponse(await submitRelease(artistId, showId, releaseId));
    }

    // ── V2 Actions ─────────────────────────────────────────
    if (action === 'createShow') {
      return successResponse(await createShow(artistId, body));
    }

    if (action === 'manageShow') {
      return successResponse(await manageShow(artistId, body));
    }

    if (action === 'getMyShow') {
      return successResponse(await getMyShow(artistId));
    }

    if (action === 'submitLiveRecording') {
      return successResponse(await submitLiveRecording(artistId, body));
    }

    if (action === 'getDiscoveryEvents') {
      return successResponse(await getDiscoveryEvents(artistId));
    }

    if (action === 'respondToDiscovery') {
      return successResponse(await respondToDiscovery(artistId, body));
    }

    return errorResponse('Invalid action', 400, traceId);
  } catch (error: any) {
    return errorResponse(error?.message || String(error), 500, traceId);
  }
});
