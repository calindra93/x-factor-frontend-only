/**
 * Beef Tick Module — Runs every turn per player
 * ──────────────────────────────────────────────
 * 1. Check if player has active beefs (as aggressor or target)
 * 2. Detect response diss tracks → update beef scores & chain
 * 3. Check response window expiry → resolve stale beefs
 * 4. Force-resolve beefs that hit max chain length
 * 5. Apply resolution impacts (hype, clout, essence, lifecycle)
 *
 * Returns standard deltas: { notifications_to_create, turn_event }
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  calculateDissTrackScore,
  calculateControversyLevel,
  resolveBeef,
  computeBeefReleaseQuality,
  BEEF_RESPONSE_WINDOW,
  BEEF_MAX_CHAIN,
  type BeefOutcome,
} from './beefMath.ts';

const N = (v: any): number => Number(v) || 0;

function stageArtistProfileUpdate(deltas: Record<string, any>, id: string, patch: Record<string, any>) {
  if (!id || !patch || Object.keys(patch).length === 0) return;
  if (!Array.isArray(deltas.artist_profile_updates)) deltas.artist_profile_updates = [];
  const existing = deltas.artist_profile_updates.find((row: any) => row.id === id);
  if (existing) {
    existing.patch = { ...existing.patch, ...patch };
    return;
  }
  deltas.artist_profile_updates.push({ id, patch });
}

function stageFanProfileUpdate(deltas: Record<string, any>, artistId: string, patch: Record<string, any>) {
  if (!artistId || !patch || Object.keys(patch).length === 0) return;
  if (!Array.isArray(deltas.fan_profile_updates)) deltas.fan_profile_updates = [];
  const existing = deltas.fan_profile_updates.find((row: any) => row.artist_id === artistId);
  if (existing) {
    existing.patch = { ...existing.patch, ...patch };
    return;
  }
  deltas.fan_profile_updates.push({ artist_id: artistId, patch });
}

function stageBeefUpdate(deltas: Record<string, any>, id: string, patch: Record<string, any>) {
  if (!id || !patch || Object.keys(patch).length === 0) return;
  if (!Array.isArray(deltas.beef_updates)) deltas.beef_updates = [];
  const existing = deltas.beef_updates.find((row: any) => row.id === id);
  if (existing) {
    existing.patch = { ...existing.patch, ...patch };
    return;
  }
  deltas.beef_updates.push({ id, patch });
}

async function loadBeefEpicenterContext(supabase: typeof supabaseAdmin, cityId: string | null | undefined) {
  if (!cityId) return { cityId: null, cityName: null };
  try {
    const { data: scene } = await supabase
      .from('city_scenes')
      .select('id, city_name')
      .eq('id', cityId)
      .maybeSingle();
    return { cityId: scene?.id || cityId || null, cityName: scene?.city_name || null };
  } catch {
    return { cityId: cityId || null, cityName: null };
  }
}

export async function processBeefTick(player: any, globalTurnId: number, entities: any, ctx: any = {}) {
  const supabase = supabaseAdmin;
  const deltas: Record<string, any> = {
    notifications_to_create: [],
    news_items_to_create: [],
    beef_updates: [],
    artist_profile_updates: [],
    fan_profile_updates: [],
    fan_war_updates: [],
    releases_updates: [],
    xpress_event_requests: [],
    turn_event: null,
    artistProfile: null,
  };

  try {
    // Load all active beefs where this player is involved
    const { data: activeBeefs } = await supabase
      .from('beefs')
      .select('*')
      .eq('status', 'active')
      .or(`aggressor_id.eq.${player.id},target_id.eq.${player.id}`);

    if (!activeBeefs || activeBeefs.length === 0) {
      return { success: true, deltas };
    }

    for (const beef of activeBeefs) {
      const isAggressor = beef.aggressor_id === player.id;
      const isTarget = beef.target_id === player.id;
      const epicenterContext = await loadBeefEpicenterContext(supabase, beef.epicenter_city_id);

      // Only process beef once (from aggressor's perspective to avoid double-processing)
      // Exception: target-side response detection runs on target's turn
      if (!isAggressor && !isTarget) continue;

      // ─── RESPONSE DETECTION ───
      // Check if the OTHER side dropped a new diss track since last_response_turn
      const responderId = isAggressor ? beef.target_id : beef.aggressor_id;
      const responderIsTarget = isAggressor; // if we're processing aggressor, responder is target

      // Only check for responses on the aggressor's tick (to avoid double-processing)
      if (isAggressor) {
        const { data: responseTracks } = await supabase
          .from('releases')
          .select('id, title, diss_track_target_id, metadata')
          .eq('artist_id', beef.target_id)
          .eq('is_diss_track', true)
          .eq('diss_track_target_id', beef.aggressor_id)
          .is('beef_id', null) // not yet linked to a beef
          .limit(1);

        if (responseTracks && responseTracks.length > 0) {
          const responseTrack = responseTracks[0];

          // Load responder profile for scoring
          const { data: responderProfile } = await supabase
            .from('profiles')
            .select('hype, clout')
            .eq('id', beef.target_id)
            .maybeSingle();

          // Get average quality of songs in this release
          const { data: responseSongs } = await supabase
            .from('songs')
            .select('quality')
            .eq('release_id', responseTrack.id);

          const avgQuality = computeBeefReleaseQuality(responseSongs || []);
          const isTimely = globalTurnId <= N(beef.response_window_ends);

          const score = calculateDissTrackScore({
            songQuality: avgQuality,
            artistHype: N(responderProfile?.hype),
            artistClout: N(responderProfile?.clout),
            isTimely,
          });

          const newChain = N(beef.chain_length) + 1;
          const newTargetScore = N(beef.target_score) + score;
          const newControversy = calculateControversyLevel({
            aggressorClout: N(player.clout),
            targetClout: N(responderProfile?.clout),
            chainLength: newChain,
          });

          // Link release to beef
          deltas.releases_updates.push({ id: responseTrack.id, patch: { beef_id: beef.id } });

          stageBeefUpdate(deltas, beef.id, {
            chain_length: newChain,
            target_score: newTargetScore,
            last_response_turn: globalTurnId,
            response_window_ends: globalTurnId + BEEF_RESPONSE_WINDOW,
            controversy_level: newControversy,
          });

          // Notify aggressor that target responded
          deltas.notifications_to_create.push({
            player_id: beef.aggressor_id,
            type: 'HIGHLIGHT',
            title: 'Beef Response Dropped! 🔥',
            subtitle: epicenterContext.cityName ? `They clapped back with "${responseTrack.title}" • ${epicenterContext.cityName}` : `They clapped back with "${responseTrack.title}"`,
            body: `Your target just responded with a diss track.${epicenterContext.cityName ? ` The beef heat is centered in ${epicenterContext.cityName}.` : ''} Score: ${score.toFixed(0)}. Chain: ${newChain}. ${isTimely ? 'Quick response — they got a timeliness bonus!' : ''} Drop another track or let it ride.`,
            is_read: false,
            metrics: { beef_id: beef.id, response_score: score, chain_length: newChain, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName },
            idempotency_key: `beef_response:${beef.id}:${responseTrack.id}`,
          });

          // Trigger beef response news article for the TARGET (who just responded)
          const { data: aggressorProfile } = await supabase
            .from('players')
            .select('artist_name')
            .eq('id', beef.aggressor_id)
            .single();
          
          const { data: targetProfile } = await supabase
            .from('players')
            .select('artist_name')
            .eq('id', beef.target_id)
            .single();
          
          // Set deltas for the TARGET player (beef.target_id) - will be picked up on their turn
          if (!deltas.beef_response_for_players) deltas.beef_response_for_players = [];
          deltas.beef_response_for_players.push({
            player_id: beef.target_id,
            beef_aggressor_name: aggressorProfile?.artist_name || 'their rival',
            beef_track_title: responseTrack.title,
            beef_epicenter_city_name: epicenterContext.cityName || null,
          });

          deltas.news_items_to_create.push({
            artist_id: beef.target_id,
            headline: epicenterContext.cityName
              ? `${targetProfile?.artist_name || 'An artist'} fires back as the beef surges through ${epicenterContext.cityName}`
              : `${targetProfile?.artist_name || 'An artist'} fires back in an escalating beef`,
            body: epicenterContext.cityName
              ? `"${responseTrack.title}" has escalated the feud, with the loudest reaction now centered in ${epicenterContext.cityName}.`
              : `"${responseTrack.title}" has escalated the feud, pushing the rivalry into a new phase of public fallout.`,
            category: 'controversy',
            sentiment: 'negative',
            created_at: new Date().toISOString(),
            metadata: { beef_id: beef.id, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName, track_title: responseTrack.title, aggressor_id: beef.aggressor_id, responder_id: beef.target_id }
          });

          // Post to Xpress from NPC media accounts
          deltas.xpress_event_requests.push({
            type: 'beef_response',
            responderName: targetProfile?.artist_name || 'An artist',
            aggressorName: aggressorProfile?.artist_name || 'their rival',
            trackTitle: responseTrack.title,
            epicenterCityName: epicenterContext.cityName || null,
            epicenterCityId: epicenterContext.cityId || null,
            globalTurnId,
            followers: Number(responderProfile?.followers) || 0,
            hype: Number(responderProfile?.hype) || 0,
            clout: Number(responderProfile?.clout) || 0,
            severity: Math.min(1, Math.max(0.55, newControversy / 100)),
          });

          // Check if we need to force-resolve due to max chain
          if (newChain >= BEEF_MAX_CHAIN) {
            await resolveAndApply(beef.id, globalTurnId, supabase, deltas);
          }

          continue; // move to next beef
        }

        // Also check for aggressor's own new response tracks (to update aggressor_score)
        const { data: aggressorNewTracks } = await supabase
          .from('releases')
          .select('id, title, metadata')
          .eq('artist_id', beef.aggressor_id)
          .eq('is_diss_track', true)
          .eq('diss_track_target_id', beef.target_id)
          .is('beef_id', null)
          .neq('id', beef.initiating_release_id) // exclude the initial track
          .limit(1);

        if (aggressorNewTracks && aggressorNewTracks.length > 0) {
          const newTrack = aggressorNewTracks[0];

          const { data: aggressorSongs } = await supabase
            .from('songs')
            .select('quality')
            .eq('release_id', newTrack.id);

          const avgQuality = computeBeefReleaseQuality(aggressorSongs || []);
          const isTimely = globalTurnId <= N(beef.response_window_ends);

          const score = calculateDissTrackScore({
            songQuality: avgQuality,
            artistHype: N(player.hype),
            artistClout: N(player.clout),
            isTimely,
          });

          const newChain = N(beef.chain_length) + 1;
          const newAggressorScore = N(beef.aggressor_score) + score;

          deltas.releases_updates.push({ id: newTrack.id, patch: { beef_id: beef.id } });

          stageBeefUpdate(deltas, beef.id, {
            chain_length: newChain,
            aggressor_score: newAggressorScore,
            last_response_turn: globalTurnId,
            response_window_ends: globalTurnId + BEEF_RESPONSE_WINDOW,
            controversy_level: calculateControversyLevel({
              aggressorClout: N(player.clout),
              targetClout: 0, // will be recalculated at resolution
              chainLength: newChain,
            }),
          });

          // Notify target
          deltas.notifications_to_create.push({
            player_id: beef.target_id,
            type: 'HIGHLIGHT',
            title: 'They Dropped Another Track! 🎤',
            subtitle: epicenterContext.cityName ? `The beef continues with "${newTrack.title}" • ${epicenterContext.cityName}` : `The beef continues with "${newTrack.title}"`,
            body: `${player.artist_name || 'Your rival'} escalated the beef.${epicenterContext.cityName ? ` Regional fallout is now focused on ${epicenterContext.cityName}.` : ''} Chain: ${newChain}. You have ${BEEF_RESPONSE_WINDOW} turns to respond.`,
            is_read: false,
            metrics: { beef_id: beef.id, chain_length: newChain, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName },
            idempotency_key: `beef_escalation:${beef.id}:${newTrack.id}`,
          });

          deltas.news_items_to_create.push({
            artist_id: beef.aggressor_id,
            headline: epicenterContext.cityName
              ? `${player.artist_name || 'An artist'} doubles down as ${epicenterContext.cityName} becomes beef ground zero`
              : `${player.artist_name || 'An artist'} doubles down in the ongoing beef`,
            body: epicenterContext.cityName
              ? `"${newTrack.title}" has intensified the feud, with the most visible fan and media fallout now concentrated in ${epicenterContext.cityName}.`
              : `"${newTrack.title}" has intensified the feud, keeping the rivalry on a dangerous upward arc.`,
            category: 'controversy',
            sentiment: 'negative',
            created_at: new Date().toISOString(),
            metadata: { beef_id: beef.id, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName, track_title: newTrack.title, aggressor_id: beef.aggressor_id, target_id: beef.target_id }
          });

          if (newChain >= BEEF_MAX_CHAIN) {
            await resolveAndApply(beef.id, globalTurnId, supabase, deltas);
          }

          continue;
        }
      }

      // ─── RESPONSE WINDOW EXPIRY (aggressor's tick only) ───
      if (isAggressor && globalTurnId > N(beef.response_window_ends)) {
        await resolveAndApply(beef.id, globalTurnId, supabase, deltas);
      }
    }

    // Turn event
    deltas.turn_event = {
      event_type: 'beef_tick',
      player_id: player.id,
      global_turn_id: globalTurnId,
      deltas: {
        active_beefs: activeBeefs.length,
        notifications: deltas.notifications_to_create.length,
      },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[BeefTick] Error for ${player.id}:`, errMsg);
    return { success: false, error: errMsg, deltas };
  }

  return { success: true, deltas };
}

/**
 * Resolve a beef and apply impacts to both artists.
 */
async function resolveAndApply(
  beefId: string,
  globalTurnId: number,
  supabase: typeof supabaseAdmin,
  deltas: Record<string, any>,
) {
  const { data: beef } = await supabase
    .from('beefs')
    .select('*')
    .eq('id', beefId)
    .maybeSingle();

  if (!beef || beef.status !== 'active') return;

  // Load both profiles
  const { data: aggressorProfile } = await supabase
    .from('profiles')
    .select('id, artist_name, hype, clout')
    .eq('id', beef.aggressor_id)
    .maybeSingle();

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, artist_name, hype, clout')
    .eq('id', beef.target_id)
    .maybeSingle();

  if (!aggressorProfile || !targetProfile) return;

  const epicenterContext = await loadBeefEpicenterContext(supabase, beef.epicenter_city_id);

  const stale = N(beef.chain_length) <= 1; // only initial track, no response

  const outcome: BeefOutcome = resolveBeef({
    aggressorScore: N(beef.aggressor_score),
    targetScore: N(beef.target_score),
    aggressorClout: N(aggressorProfile.clout),
    targetClout: N(targetProfile.clout),
    chainLength: N(beef.chain_length),
    controversyLevel: N(beef.controversy_level),
    stale,
    aggressorId: beef.aggressor_id,
    targetId: beef.target_id,
  });

  stageBeefUpdate(deltas, beefId, {
    status: outcome.status,
    winner_id: outcome.winnerId,
    loser_id: outcome.loserId,
  });

  // Apply winner impacts
  if (outcome.winnerId) {
    const wi = outcome.winnerImpacts;
    const winnerProfile = outcome.winnerId === beef.aggressor_id ? aggressorProfile : targetProfile;
    stageArtistProfileUpdate(deltas, outcome.winnerId, {
      hype: Math.max(0, Math.min(100, N(outcome.winnerId === beef.aggressor_id ? aggressorProfile.hype : targetProfile.hype) + wi.hype_delta)),
      clout: Math.max(0, N(outcome.winnerId === beef.aggressor_id ? aggressorProfile.clout : targetProfile.clout) + wi.clout_delta),
    });

    // Boost winner's diss track lifecycle to Hot
    if (wi.lifecycle_boost) {
      const { data: winnerReleases } = await supabase.from('releases')
        .select('id')
        .eq('beef_id', beefId)
        .eq('artist_id', outcome.winnerId)
        .neq('lifecycle_state', 'Hot');
      for (const release of winnerReleases || []) {
        deltas.releases_updates.push({
          id: release.id,
          patch: { lifecycle_state: 'Hot', lifecycle_state_changed_turn: globalTurnId },
        });
      }
    }

    // Update winner's fan profile essence
    await applyEssenceDeltas(supabase, outcome.winnerId, wi.rebellion_essence_delta, wi.authenticity_essence_delta, deltas);

    deltas.notifications_to_create.push({
      player_id: outcome.winnerId,
      type: 'ACHIEVEMENT',
      title: 'Beef Won! 👑',
      subtitle: epicenterContext.cityName ? `You came out on top • ${epicenterContext.cityName}` : `You came out on top`,
      body: `You won the beef!${epicenterContext.cityName ? ` ${epicenterContext.cityName} is where the win is echoing loudest.` : ''} Hype +${wi.hype_delta}, Clout +${wi.clout_delta}. Your fans are celebrating.`,
      is_read: false,
      metrics: { beef_id: beefId, outcome: outcome.status, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName },
      idempotency_key: `beef_won:${beefId}:${outcome.winnerId}`,
    });

    deltas.news_items_to_create.push({
      artist_id: outcome.winnerId,
      headline: epicenterContext.cityName
        ? `${winnerProfile?.artist_name || 'An artist'} wins the beef in ${epicenterContext.cityName}`
        : `${winnerProfile?.artist_name || 'An artist'} wins the beef`,
      body: epicenterContext.cityName
        ? `The outcome is landing hardest in ${epicenterContext.cityName}, where fans and local tastemakers are treating the result as decisive.`
        : `The rivalry has reached a conclusion, and the public narrative is breaking clearly in favor of the winner.`,
      category: 'controversy',
      sentiment: 'negative',
      created_at: new Date().toISOString(),
      metadata: { beef_id: beefId, outcome: outcome.status, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName, winner_id: outcome.winnerId, loser_id: outcome.loserId }
    });
  }

  // Apply loser impacts
  if (outcome.loserId) {
    const li = outcome.loserImpacts;
    stageArtistProfileUpdate(deltas, outcome.loserId, {
      hype: Math.max(0, Math.min(100, N(outcome.loserId === beef.aggressor_id ? aggressorProfile.hype : targetProfile.hype) + li.hype_delta)),
      clout: Math.max(0, N(outcome.loserId === beef.aggressor_id ? aggressorProfile.clout : targetProfile.clout) + li.clout_delta),
    });

    await applyEssenceDeltas(supabase, outcome.loserId, li.rebellion_essence_delta, li.authenticity_essence_delta, deltas);

    deltas.notifications_to_create.push({
      player_id: outcome.loserId,
      type: 'HIGHLIGHT',
      title: outcome.status === 'backfired' ? 'Beef Backfired 💀' : 'Beef Lost 😤',
      subtitle: outcome.status === 'backfired' ? (epicenterContext.cityName ? `Punching down cost you • ${epicenterContext.cityName}` : 'Punching down cost you') : (epicenterContext.cityName ? `They got the best of you • ${epicenterContext.cityName}` : 'They got the best of you'),
      body: outcome.status === 'backfired'
        ? `Starting beef with someone below your level backfired.${epicenterContext.cityName ? ` ${epicenterContext.cityName} turned on the move fast.` : ''} Hype ${li.hype_delta}, Clout ${li.clout_delta}. Your Rebellion essence took a hit.`
        : `You lost the beef.${epicenterContext.cityName ? ` ${epicenterContext.cityName} is where the loss narrative is spreading fastest.` : ''} Hype ${li.hype_delta}, Clout ${li.clout_delta}. Time to bounce back.`,
      is_read: false,
      metrics: { beef_id: beefId, outcome: outcome.status, epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName },
      idempotency_key: `beef_lost:${beefId}:${outcome.loserId}`,
    });
  }

  // Draw: both get modest positive impacts
  if (outcome.status === 'resolved_draw') {
    for (const artistId of [beef.aggressor_id, beef.target_id]) {
      const profile = artistId === beef.aggressor_id ? aggressorProfile : targetProfile;
      const di = outcome.winnerImpacts; // draw uses same impacts for both
      stageArtistProfileUpdate(deltas, artistId, {
        hype: Math.max(0, Math.min(100, N(profile.hype) + di.hype_delta)),
        clout: Math.max(0, N(profile.clout) + di.clout_delta),
      });

      await applyEssenceDeltas(supabase, artistId, di.rebellion_essence_delta, di.authenticity_essence_delta, deltas);

      deltas.notifications_to_create.push({
        player_id: artistId,
        type: 'HIGHLIGHT',
        title: 'Beef Ended — Draw 🤝',
        subtitle: epicenterContext.cityName ? `Evenly matched • ${epicenterContext.cityName}` : 'Evenly matched',
        body: `The beef ended in a draw.${epicenterContext.cityName ? ` ${epicenterContext.cityName} saw the fiercest reaction, but neither side owned the narrative.` : ''} Both sides get a modest boost. Hype +${di.hype_delta}, Clout +${di.clout_delta}.`,
        is_read: false,
        metrics: { beef_id: beefId, outcome: 'resolved_draw', epicenter_city_id: epicenterContext.cityId, epicenter_city_name: epicenterContext.cityName },
        idempotency_key: `beef_draw:${beefId}:${artistId}`,
      });
    }
  }

  // Escalate linked fan war intensity based on resolution
  if (beef.fan_war_id) {
    const intensityBoost = outcome.status === 'backfired' ? -15 : N(beef.chain_length) * 8;
    const { data: fanWar } = await supabase
      .from('fan_wars')
      .select('intensity, status')
      .eq('id', beef.fan_war_id)
      .maybeSingle();

    if (fanWar && fanWar.status !== 'resolved') {
      const newIntensity = Math.max(0, Math.min(100, N(fanWar.intensity) + intensityBoost));
      deltas.fan_war_updates.push({
        id: beef.fan_war_id,
        patch: {
        intensity: newIntensity,
        status: newIntensity >= 70 ? 'escalated' : newIntensity <= 5 ? 'resolved' : fanWar.status,
        ...(newIntensity <= 5 ? { resolved_turn: globalTurnId } : {}),
        outcome_summary: {
          beef_id: beefId,
          beef_outcome: outcome.status,
          winner_id: outcome.winnerId,
          epicenter_city_id: epicenterContext.cityId,
          epicenter_city_name: epicenterContext.cityName,
        },
        },
      });
    }
  }
}

/**
 * Apply rebellion and authenticity essence deltas to a fan profile.
 */
async function applyEssenceDeltas(
  supabase: typeof supabaseAdmin,
  artistId: string,
  rebellionDelta: number,
  authenticityDelta: number,
  deltas: Record<string, any>,
) {
  if (rebellionDelta === 0 && authenticityDelta === 0) return;

  const { data: fanProfile } = await supabase
    .from('fan_profiles')
    .select('fandom_essence_vectors')
    .eq('artist_id', artistId)
    .maybeSingle();

  if (!fanProfile) return;

  const essence = fanProfile.fandom_essence_vectors || {};
  const updated = {
    ...essence,
    rebellion: Math.max(0, Math.min(100, N(essence.rebellion) + rebellionDelta)),
    authenticity: Math.max(0, Math.min(100, N(essence.authenticity) + authenticityDelta)),
  };

  stageFanProfileUpdate(deltas, artistId, {
    fandom_essence_vectors: updated,
  });
}
