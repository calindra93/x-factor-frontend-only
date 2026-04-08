/**
 * sceneSystemModule.ts — Per-turn scene system processing.
 *
 * Registered at order 4.95 in turnScheduler (after brand deals, before touring).
 * Follows the staging pattern: reads data, computes deltas, returns patches.
 *
 * Per-turn responsibilities:
 * 1. If player has an active tour with a gig this turn → compute scene gains
 * 2. Compute passive fame spillover across all cities
 * 3. Apply archetype bonuses (e.g., Hitmaker passive rep)
 * 4. Check trending genre rotation (global, every ~30 turns)
 * 5. Return deltas for commit phase
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  computeGenreMatchScore,
  computeReputationGain,
  computeVenueUnlockTier,
  computeSceneInfluenceDelta,
  computeNetworkingGain,
  computeStudioContactGain,
  computeArtifactDiscoveryChance,
  computeFameSpillover,
  computeOpeningActFanCrossover,
  computeGenreOverlap,
  computeFocusPathSceneModifiers,
  computeArchetypeSceneBonus,
  computeHomeFieldBonus,
  shouldRotateTrendingGenre,
  pickNextTrendingGenre,
  type CityScene,
  type PlayerCityRep,
} from './sceneMath.ts';
import { seedRng } from './fandomPhase6.ts';
import { computeArtifactEffects, createArtifactEffectEvent } from './artifactEffects.ts';
import { buildOpenerBenefitFailureSignals } from './openerBenefitFailureSignals.ts';

// ─── Plan 035 M3: Invariant Strategy ─────────────────────────────
// Dev/local: hard-fail on invariant violations
// Production: warn + write turn_event_log with traceId
const SCENE_HARD_FAIL_INVARIANTS = typeof Deno !== 'undefined'
  ? Deno.env.get('SCENE_HARD_FAIL') === 'true'
  : (typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : false);

// ─── Types ───────────────────────────────────────────────────────

interface SceneDeltas {
  city_reputation_upserts: Array<{
    player_id: string;
    city_id: string;
    patch: Partial<PlayerCityRep> & { reputation_score?: number; gigs_played?: number; networking_points?: number; scene_influence_score?: number; unlocked_venue_tier?: number; discovered_artifacts?: string[]; last_gig_turn?: number; influence_genre?: string };
  }>;
  contact_relationship_upserts: Array<{
    player_id: string;
    contact_id: string;
    relationship_level: number;
    unlocked_perks: string[];
    last_interaction_turn: number;
  }>;
  trending_genre_updates: Array<{
    city_id: string;
    trending_genre: string;
  }>;
  opening_act_crossover: Array<{
    opener_id: string;
    fans_gained: number;
    reputation_city_id: string;
    reputation_gain: number;
  }>;
  turn_events: Array<Record<string, unknown>>;
  notifications_to_create: Array<Record<string, unknown>>;
}

interface ResolvedGigContext {
  city: CityScene | null;
  venue: any;
  attendanceRatio: number;
  attendance: number;
  completedThisTurn: boolean;
}

function isArtifactDiscoveryRollDebugEnabled(ctx: any): boolean {
  const runtimeDebug = ctx?.runtimeContext?.debug;
  if (runtimeDebug?.artifactDiscoveryRoll === true) return true;
  if (runtimeDebug?.artifact_discovery_roll === true) return true;

  // Opt-in via env var in deployed edge runtime; safe in Node tests.
  return (globalThis as any)?.Deno?.env?.get?.('SCENE_DEBUG_TELEMETRY') === '1';
}

async function resolveRuntimeGigCompletion(
  activeTour: any,
  cityById: Map<string, CityScene>,
  runtimeCompletion: any,
): Promise<ResolvedGigContext | null> {
  if (!activeTour?.id || !runtimeCompletion || runtimeCompletion.tourId !== activeTour.id || !runtimeCompletion.completedThisTurn) {
    return null;
  }

  let venue = null;
  if (runtimeCompletion.venueId) {
    const { data: venueRow } = await supabaseAdmin
      .from('venues')
      .select('*')
      .eq('id', runtimeCompletion.venueId)
      .maybeSingle();
    venue = venueRow || null;
  }

  // Plan 034 M1: Prioritize city_id over city name string matching
  // Using DB-authoritative city_id prevents name-drift defects (DEFECT-008)
  let gigCity: CityScene | null = null;
  
  // 1. First try city_id (DB-authoritative, preferred)
  if (runtimeCompletion.cityId) {
    gigCity = cityById.get(runtimeCompletion.cityId) || null;
  }
  
  // 2. Fallback to city name matching (legacy compatibility)
  if (!gigCity) {
    const cityName = runtimeCompletion.cityName || venue?.city || null;
    if (cityName) {
      for (const [, city] of cityById) {
        if (city.city_name === cityName) {
          gigCity = city;
          break;
        }
      }
    }
  }

  // 3. Final fallback via venue's city_scene_id
  if (!gigCity && venue?.city_scene_id) {
    gigCity = cityById.get(venue.city_scene_id) || null;
  }

  return {
    city: gigCity,
    venue,
    attendanceRatio: Number.isFinite(Number(runtimeCompletion.attendanceRatio)) ? Number(runtimeCompletion.attendanceRatio) : 0.7,
    attendance: Number(runtimeCompletion.attendance) || 500,
    completedThisTurn: true,
  };
}

/**
 * Plan 035 M2: Resolve context for underground event completions.
 * Underground events don't have an active tour, so we resolve city directly from _meta.
 */
async function resolveUndergroundCompletion(
  cityById: Map<string, CityScene>,
  runtimeCompletion: any,
): Promise<ResolvedGigContext | null> {
  if (!runtimeCompletion || runtimeCompletion.completedThisTurn !== true) {
    return null;
  }

  // Plan 035 M2: City resolution for underground events
  // Primary: city_id from _meta (DB-authoritative)
  let gigCity: CityScene | null = null;
  
  if (runtimeCompletion.cityId) {
    gigCity = cityById.get(runtimeCompletion.cityId) || null;
  }
  
  // Fallback: city name matching (fragile, log warning if used)
  if (!gigCity && runtimeCompletion.cityName) {
    for (const [, city] of cityById) {
      if (city.city_name === runtimeCompletion.cityName) {
        gigCity = city;
        console.warn(`[sceneSystem] Underground event resolved city via name match (fragile): ${runtimeCompletion.cityName}`);
        break;
      }
    }
  }

  return {
    city: gigCity,
    venue: null, // underground events don't use venues
    attendanceRatio: Number.isFinite(Number(runtimeCompletion.attendanceRatio)) ? Number(runtimeCompletion.attendanceRatio) : 0.7,
    attendance: Number(runtimeCompletion.attendance) || 0,
    completedThisTurn: true,
  };
}

function normalizeJsonObject(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  return {};
}

function upsertContactRelationshipDelta(
  deltas: SceneDeltas,
  nextRow: {
    player_id: string;
    contact_id: string;
    relationship_level: number;
    unlocked_perks: string[];
    last_interaction_turn: number;
  },
): void {
  const existingIdx = deltas.contact_relationship_upserts.findIndex(
    (row) => row.player_id === nextRow.player_id && row.contact_id === nextRow.contact_id,
  );

  if (existingIdx === -1) {
    deltas.contact_relationship_upserts.push(nextRow);
    return;
  }

  const existing = deltas.contact_relationship_upserts[existingIdx];
  const mergedPerks = Array.from(new Set([...(existing.unlocked_perks || []), ...(nextRow.unlocked_perks || [])]));
  deltas.contact_relationship_upserts[existingIdx] = {
    ...existing,
    relationship_level: Math.max(existing.relationship_level || 0, nextRow.relationship_level || 0),
    unlocked_perks: mergedPerks,
    last_interaction_turn: Math.max(existing.last_interaction_turn || 0, nextRow.last_interaction_turn || 0),
  };
}

const STUDIO_CONTACT_COOLDOWN_TURNS = 7;

async function processStudioContactGains(params: {
  playerId: string;
  playerGenre: string | null;
  globalTurnId: number;
  deltas: SceneDeltas;
  prefetchSongs?: any[] | null;
}): Promise<void> {
  const { playerId, playerGenre, globalTurnId, deltas, prefetchSongs } = params;

  let recentSongs: any[] | null = null;
  if (prefetchSongs) {
    // Filter in-memory from prefetch: recent songs with studio_id set
    recentSongs = prefetchSongs
      .filter((s: any) => s.studio_id && s.created_turn >= globalTurnId - STUDIO_CONTACT_COOLDOWN_TURNS)
      .slice(0, 10);
  } else {
    const { data: dbSongs } = await supabaseAdmin
      .from('songs')
      .select('id, studio_id, created_turn')
      .eq('artist_id', playerId)
      .gte('created_turn', globalTurnId - STUDIO_CONTACT_COOLDOWN_TURNS)
      .not('studio_id', 'is', null)
      .limit(10);
    recentSongs = dbSongs;
  }

  if (!recentSongs?.length) return;

  const studioIds = Array.from(new Set(recentSongs.map((s: any) => s.studio_id).filter(Boolean)));
  if (!studioIds.length) return;

  const { data: studios } = await supabaseAdmin
    .from('studios')
    .select('id, tier, city_scene_id')
    .in('id', studioIds)
    .not('city_scene_id', 'is', null);

  if (!studios?.length) return;

  const cityTierMap = new Map<string, number>();
  for (const studio of studios) {
    if (!studio?.city_scene_id) continue;
    const currentTier = cityTierMap.get(studio.city_scene_id) ?? 0;
    cityTierMap.set(studio.city_scene_id, Math.max(currentTier, Number(studio.tier || 0)));
  }
  const cityIds = Array.from(cityTierMap.keys());
  if (!cityIds.length) return;

  const { data: cityContacts } = await supabaseAdmin
    .from('scene_contacts')
    .select('id, city_id, role, genre_preference, relationship_threshold, perks')
    .in('city_id', cityIds)
    .eq('role', 'producer');

  if (!cityContacts?.length) return;

  const contactIds = cityContacts.map((c: any) => c.id);
  const { data: existingRels } = await supabaseAdmin
    .from('player_contact_relationships')
    .select('contact_id, relationship_level, unlocked_perks, last_interaction_turn')
    .eq('player_id', playerId)
    .in('contact_id', contactIds);

  const existingRelMap = new Map<string, any>((existingRels || []).map((row: any) => [row.contact_id, row]));

  for (const contact of cityContacts) {
    const cityTier = cityTierMap.get(contact.city_id) ?? 0;
    const existingRel = existingRelMap.get(contact.id);

    if (
      existingRel?.last_interaction_turn
      && globalTurnId - Number(existingRel.last_interaction_turn) < STUDIO_CONTACT_COOLDOWN_TURNS
    ) {
      continue;
    }

    const gain = computeStudioContactGain({
      contactRole: contact.role,
      studioTier: cityTier,
      playerGenre,
      contactGenrePreference: contact.genre_preference,
    });
    if (gain <= 0) continue;

    const currentLevel = Number(existingRel?.relationship_level || 0);
    const nextLevel = currentLevel + gain;
    const threshold = Number(contact.relationship_threshold || 10);
    const contactPerks = typeof contact.perks === 'string' ? JSON.parse(contact.perks) : (contact.perks || []);
    const unlockedPerks = nextLevel >= threshold
      ? contactPerks.map((p: any) => p.type)
      : (existingRel?.unlocked_perks || []);

    upsertContactRelationshipDelta(deltas, {
      player_id: playerId,
      contact_id: contact.id,
      relationship_level: nextLevel,
      unlocked_perks: unlockedPerks,
      last_interaction_turn: globalTurnId,
    });
  }
}

async function resolveGigContextForTurn(
  activeTour: any,
  globalTurnId: number,
  cityById: Map<string, CityScene>,
): Promise<ResolvedGigContext> {
  const emptyContext: ResolvedGigContext = {
    city: null,
    venue: null,
    attendanceRatio: 0.7,
    attendance: 500,
    completedThisTurn: false,
  };

  if (!activeTour?.id) {
    return emptyContext;
  }

  const [{ data: scheduledGigs }, { data: overdueBookedGigs }] = await Promise.all([
    supabaseAdmin
      .from('gigs')
      .select('*')
      .eq('tour_id', activeTour.id)
      .eq('scheduled_turn', globalTurnId)
      .limit(1),
    supabaseAdmin
      .from('gigs')
      .select('*')
      .eq('tour_id', activeTour.id)
      .eq('status', 'Booked')
      .lt('scheduled_turn', globalTurnId)
      .order('scheduled_turn', { ascending: true })
      .limit(1),
  ]);

  const gig = scheduledGigs?.[0] || overdueBookedGigs?.[0] || null;
  if (!gig) {
    return emptyContext;
  }

  let venue = null;
  if (gig.venue_id) {
    const { data: venueRow } = await supabaseAdmin
      .from('venues')
      .select('*')
      .eq('id', gig.venue_id)
      .maybeSingle();
    venue = venueRow || null;
  }

  let gigCity: CityScene | null = null;
  const cityName = gig.city || venue?.city || null;
  if (cityName) {
    for (const [, city] of cityById) {
      if (city.city_name === cityName) {
        gigCity = city;
        break;
      }
    }
  }

  if (!gigCity && venue?.city_scene_id) {
    gigCity = cityById.get(venue.city_scene_id) || null;
  }

  const eventOutcome = normalizeJsonObject(gig.event_outcome);
  const attendance = Number(
    gig.tickets_sold
    ?? eventOutcome.attendance
    ?? eventOutcome.last_attendance
    ?? 500
  ) || 500;
  const capacity = Number(gig.capacity) || 0;
  const attendanceRatio = Number(
    eventOutcome.fill_rate
    ?? eventOutcome.attendance_ratio
    ?? eventOutcome.last_attendance_ratio
    ?? (capacity > 0 ? attendance / capacity : 0.7)
  );
  const completedThisTurn =
    gig.status === 'Completed'
    || Number(eventOutcome.completed_turn) === globalTurnId
    || (gig.status === 'Booked' && Number(gig.scheduled_turn) < globalTurnId);

  return {
    city: gigCity,
    venue,
    attendanceRatio: Number.isFinite(attendanceRatio) ? attendanceRatio : 0.7,
    attendance,
    completedThisTurn,
  };
}

// ─── Main Entry Point ────────────────────────────────────────────

export async function processSceneSystem(
  player: any,
  _unused: any,
  globalTurnId: number,
  _entities: any,
  ctx: any = {},
): Promise<{ success: boolean; error?: string; deltas: { scene_deltas: SceneDeltas; turn_events: any[]; notifications_to_create: any[] } }> {
  const deltas: SceneDeltas = {
    city_reputation_upserts: [],
    contact_relationship_upserts: [],
    trending_genre_updates: [],
    opening_act_crossover: [],
    turn_events: [],
    notifications_to_create: [],
  };

  try {
    const playerId = player.id;
    const playerGenre = player.genre || null;
    const playerFollowers = player.fans ?? player.followers ?? 0;
    const playerHype = player.hype ?? 0;
    const careerStage = player.career_stage || 'Unknown';
    const focusPath = ctx.focusPath || player.focus_path || null;
    const archetype = ctx.archetype || player.archetype || null;
    const activeRadioSubsByRegion = ctx?.runtimeContext?.active_radio_submissions_by_region || {};

    const focusModifiers = computeFocusPathSceneModifiers(focusPath);
    const archetypeBonus = computeArchetypeSceneBonus(archetype);

    // ─── Load all city scenes (prefetch-first) ────────────────────────────────
    const prefetchedCityScenes = ctx?.runtimeContext?.prefetchData?.allCityScenesMap;
    let allCities: any[] | null = null;
    if (prefetchedCityScenes && prefetchedCityScenes.size > 0) {
      allCities = Array.from(prefetchedCityScenes.values());
    } else {
      const { data: dbCities, error: citiesErr } = await supabaseAdmin
        .from('city_scenes')
        .select('*');
      if (citiesErr || !dbCities?.length) {
        return { success: true, deltas: { scene_deltas: deltas, turn_events: [], notifications_to_create: [] } };
      }
      allCities = dbCities;
    }

    if (!allCities?.length) {
      return { success: true, deltas: { scene_deltas: deltas, turn_events: [], notifications_to_create: [] } };
    }

    const cityById = new Map<string, CityScene>();
    for (const c of allCities) {
      cityById.set(c.id, {
        ...c,
        genre_weights: typeof c.genre_weights === 'string' ? JSON.parse(c.genre_weights) : (c.genre_weights || {}),
        scene_vibe: typeof c.scene_vibe === 'string' ? JSON.parse(c.scene_vibe) : (c.scene_vibe || {}),
        cultural_artifacts: typeof c.cultural_artifacts === 'string' ? JSON.parse(c.cultural_artifacts) : (c.cultural_artifacts || []),
      });
    }

    // ─── Load player's existing city reputations (prefetch-first) ─────────────
    let existingReps = ctx?.runtimeContext?.prefetchData?.cityRepsByPlayer?.get(playerId) || null;
    if (!existingReps) {
      const { data: dbReps } = await supabaseAdmin
        .from('player_city_reputation')
        .select('*')
        .eq('player_id', playerId);
      existingReps = dbReps || [];
    }

    const repByCity = new Map<string, any>();
    for (const rep of (existingReps || [])) {
      repByCity.set(rep.city_id, rep);
    }

    // ─── Check active tour / current gig ─────────────────────
    const { data: activeTours } = await supabaseAdmin
      .from('tours')
      .select('*')
      .eq('artist_id', playerId)
      .eq('status', 'active');

    const activeTour = activeTours?.[0];
    const runtimeGigContext = ctx?.runtimeContext?.sceneSystemGigContextByArtistId?.[playerId] || null;

    const emitSceneGigSkipped = (params: {
      reason: string;
      completionIndex: number;
      idempotencyKey: string | null;
      completionCityId?: string | null;
      completionTourId?: string | null;
      details?: Record<string, unknown>;
    }) => {
      deltas.turn_events.push({
        module: 'sceneSystem',
        event_type: 'scene_gig_skipped',
        description: `Scene gig skipped: ${params.reason}`,
        metadata: {
          player_id: playerId,
          tour_id: params.completionTourId || (activeTour?.id || null),
          completion_index: params.completionIndex,
          idempotency_key: params.idempotencyKey,
          city_id: params.completionCityId || null,
          reason: params.reason,
          ...(params.details || {}),
        },
      });
    };

    const processGigSceneCompletion = async (gigContext: ResolvedGigContext, options: {
      viaRuntimeContext: boolean;
      idempotencyKey: string;
      completionIndex: number;
    }): Promise<void> => {
      const gigCity = gigContext.city;
      const gigVenue = gigContext.venue;

      // ─── Process gig scene gains ──────────────────────────
      if (gigCity && gigContext.completedThisTurn) {
        const cityRep = repByCity.get(gigCity.id) || {
          reputation_score: 0,
          gigs_played: 0,
          scene_influence_score: 0,
          unlocked_venue_tier: 1,
          discovered_artifacts: [],
          networking_points: 0,
          fatigue_mitigation: 0,
        };

        const genreMatch = computeGenreMatchScore(playerGenre, gigCity.genre_weights, gigCity.trending_genre);

        const venuePrestige = gigVenue?.prestige || 1;
        const liveShowAttendanceRatio = Math.min(1.05, gigContext.attendanceRatio * archetypeBonus.live_show_rep_mult);

        // Underground vibe bonus from Cult_Icon archetype
        const undergroundVibe = gigCity.scene_vibe?.underground ?? 0;
        const undergroundBonus = undergroundVibe > 0.6 ? archetypeBonus.underground_rep_mult : 1.0;

        // Reputation gain
        let repGain = computeReputationGain({
          gigSuccess: true,
          genreMatchScore: genreMatch,
          attendanceRatio: liveShowAttendanceRatio,
          venuePrestige,
          currentReputation: cityRep.reputation_score,
          focusModifiers,
        });
        const homeFieldMult = computeHomeFieldBonus({
          playerHomeRegion: player.home_region,
          playerCurrentRegion: player.region,
          playerHomeCity: player.home_city,
          playerCurrentCity: player.current_city,
          gigCityName: gigCity.city_name,
        });

        // Plan 034 M5: Apply discovered artifact effects
        const discoveredArtifactIds = Array.isArray(cityRep.discovered_artifacts) ? cityRep.discovered_artifacts : [];
        const allCityArtifacts = gigCity.cultural_artifacts || [];
        const artifactEffects = computeArtifactEffects(discoveredArtifactIds, allCityArtifacts);

        // Apply artifact scene_rep_mult to reputation gain
        repGain = Math.round(repGain * archetypeBonus.reputation_mult * undergroundBonus * homeFieldMult * artifactEffects.sceneRepMult);

        // Log artifact effect application if any artifacts discovered
        if (discoveredArtifactIds.length > 0) {
          deltas.turn_events.push(createArtifactEffectEvent(
            playerId,
            gigCity.id,
            gigCity.city_name,
            artifactEffects,
            discoveredArtifactIds.length
          ));
        }

        // Warn on unknown effect types
        if (artifactEffects.unknownEffects.length > 0) {
          deltas.turn_events.push({
            module: 'sceneSystem',
            event_type: 'artifact_unknown_effect',
            description: `Unknown artifact effect types in ${gigCity.city_name}: ${artifactEffects.unknownEffects.join(', ')}`,
            metadata: {
              player_id: playerId,
              city_id: gigCity.id,
              unknown_effects: artifactEffects.unknownEffects,
            },
          });
        }

        const newReputation = Math.min(100, cityRep.reputation_score + repGain);
        const newGigs = cityRep.gigs_played + 1;

        // Venue tier unlock
        const newVenueTier = computeVenueUnlockTier({
          reputation: newReputation,
          followers: playerFollowers,
          hype: playerHype,
          focusModifiers,
        });

        // Networking gain
        let totalNetworkingGain = 0;
        const { data: cityContacts } = await supabaseAdmin
          .from('scene_contacts')
          .select('*')
          .eq('city_id', gigCity.id);

        const { data: existingContactRels } = await supabaseAdmin
          .from('player_contact_relationships')
          .select('*')
          .eq('player_id', playerId);

        const contactRelMap = new Map<string, any>();
        for (const rel of (existingContactRels || [])) {
          contactRelMap.set(rel.contact_id, rel);
        }

        for (const contact of (cityContacts || [])) {
          const networkGain = computeNetworkingGain({
            gigSuccess: true,
            genreMatchScore: genreMatch,
            contactRole: contact.role,
            contactGenrePreference: contact.genre_preference,
            playerGenre,
            reputation: newReputation,
            focusModifiers,
          });

          // Apply archetype networking bonus
          const criticContactMult = contact.role === 'journalist' ? archetypeBonus.critic_contact_mult : 1.0;
          const adjustedGain = Math.round(networkGain * archetypeBonus.networking_mult * criticContactMult);
          totalNetworkingGain += adjustedGain;

          const existingRel = contactRelMap.get(contact.id);
          const currentLevel = existingRel?.relationship_level || 0;
          const newLevel = currentLevel + adjustedGain;
          const contactPerks = typeof contact.perks === 'string' ? JSON.parse(contact.perks) : (contact.perks || []);
          const threshold = contact.relationship_threshold || 10;

          // Industry_Royalty gets lower thresholds
          const effectiveThreshold = archetype === 'Industry_Royalty'
            ? Math.floor(threshold * 0.75)
            : threshold;

          const unlockedPerks = newLevel >= effectiveThreshold
            ? contactPerks.map((p: any) => p.type)
            : (existingRel?.unlocked_perks || []);

          // Check for newly unlocked perks
          const prevUnlocked = existingRel?.unlocked_perks || [];
          const newlyUnlocked = unlockedPerks.filter((p: string) => !prevUnlocked.includes(p));

          if (newlyUnlocked.length > 0) {
            deltas.turn_events.push({
              module: 'sceneSystem',
              event_type: 'scene_contact_unlocked',
              description: `Unlocked contact ${contact.name} (${contact.role}) in ${gigCity.city_name}`,
              metadata: { city_name: gigCity.city_name, contact_name: contact.name, contact_role: contact.role, perks: newlyUnlocked },
            });
          }

          deltas.contact_relationship_upserts.push({
            player_id: playerId,
            contact_id: contact.id,
            relationship_level: newLevel,
            unlocked_perks: unlockedPerks,
            last_interaction_turn: globalTurnId,
          });
        }

        const radioSubmissionCount = Number(activeRadioSubsByRegion[gigCity.region] || 0);
        const radioNetworkingBonus = Math.min(5, radioSubmissionCount * 2);
        totalNetworkingGain += radioNetworkingBonus;

        // Plan 034 M5: Apply artifact networking boost
        if (artifactEffects.networkingBoost > 0) {
          totalNetworkingGain += Math.round(artifactEffects.networkingBoost);
        }

        // Scene influence
        const influenceDelta = computeSceneInfluenceDelta({
          reputation: newReputation,
          gigsInCity: newGigs,
          genreConsistency: genreMatch / 100, // approximate consistency from genre match
          focusModifiers,
        });
        const adjustedInfluence = Math.round(influenceDelta * archetypeBonus.influence_mult * 10) / 10;
        const newInfluence = Math.min(100, (cityRep.scene_influence_score || 0) + adjustedInfluence);

        // Artifact discovery
        const allArtifacts = gigCity.cultural_artifacts || [];
        const discoveredIds = Array.isArray(cityRep.discovered_artifacts) ? cityRep.discovered_artifacts : [];
        const undiscovered = allArtifacts.filter((a: any) => !discoveredIds.includes(a.id));

        const discoveryChance = computeArtifactDiscoveryChance({
          reputation: newReputation,
          gigsInCity: newGigs,
          undiscoveredCount: undiscovered.length,
          focusModifiers,
        });

        const rng = seedRng(playerId, globalTurnId);
        const discoveryRoll = rng();
        let newDiscoveredArtifacts = [...discoveredIds];

        const artifactRollSuccess = discoveryRoll < discoveryChance && undiscovered.length > 0;

        // Observability contract: always-on low-cardinality signal + debug-only roll details.
        deltas.turn_events.push({
          module: 'sceneSystem',
          event_type: 'artifact_roll_attempted',
          description: artifactRollSuccess
            ? `Artifact roll succeeded in ${gigCity.city_name}`
            : `Artifact roll failed in ${gigCity.city_name}`,
          metadata: {
            player_id: playerId,
            city_id: gigCity.id,
            city_name: gigCity.city_name,
            undiscovered_count: undiscovered.length,
            success: artifactRollSuccess,
          },
        });

        if (isArtifactDiscoveryRollDebugEnabled(ctx)) {
          deltas.turn_events.push({
            module: 'sceneSystem',
            event_type: 'artifact_discovery_roll',
            description: artifactRollSuccess 
              ? `Artifact roll succeeded in ${gigCity.city_name} (${(discoveryRoll * 100).toFixed(1)}% < ${(discoveryChance * 100).toFixed(1)}%)`
              : `Artifact roll failed in ${gigCity.city_name} (${(discoveryRoll * 100).toFixed(1)}% >= ${(discoveryChance * 100).toFixed(1)}%)`,
            metadata: {
              player_id: playerId,
              city_id: gigCity.id,
              city_name: gigCity.city_name,
              chance: discoveryChance,
              roll: discoveryRoll,
              undiscovered_count: undiscovered.length,
              gigs_in_city: newGigs,
              reputation: newReputation,
              success: artifactRollSuccess,
            },
          });
        }

        if (artifactRollSuccess) {
          // Pick an artifact weighted by rarity (common first)
          const rarityOrder = { common: 0, rare: 1, legendary: 2 };
          const sorted = undiscovered.sort((a: any, b: any) =>
            (rarityOrder[a.rarity as keyof typeof rarityOrder] ?? 1) - (rarityOrder[b.rarity as keyof typeof rarityOrder] ?? 1)
          );
          const discoveredArtifact = sorted[0];
          newDiscoveredArtifacts.push(discoveredArtifact.id);

          deltas.turn_events.push({
            module: 'sceneSystem',
            event_type: 'artifact_discovered',
            description: `Discovered artifact "${discoveredArtifact.name}" in ${gigCity.city_name}`,
            metadata: { city_name: gigCity.city_name, artifact: discoveredArtifact },
          });
          deltas.notifications_to_create.push({
            player_id: playerId,
            type: 'scene_artifact',
            title: `Discovered: ${discoveredArtifact.name}`,
            body: `You discovered "${discoveredArtifact.name}" in ${gigCity.city_name}! ${discoveredArtifact.description || ''}`,
          });
        }

        // Compute fatigue mitigation from contacts
        let fatigueMitigation = 0;
        for (const contact of (cityContacts || [])) {
          const rel = contactRelMap.get(contact.id);
          if (!rel) continue;
          const perks = typeof contact.perks === 'string' ? JSON.parse(contact.perks) : (contact.perks || []);
          const threshold = archetype === 'Industry_Royalty'
            ? Math.floor((contact.relationship_threshold || 10) * 0.75)
            : (contact.relationship_threshold || 10);

          if (rel.relationship_level >= threshold) {
            for (const perk of perks) {
              if (perk.type === 'fatigue_reduction') {
                fatigueMitigation += perk.value || 0;
              }
            }
          }
        }
        fatigueMitigation = Math.min(0.15, fatigueMitigation);

        // Push reputation upsert for gig city
        deltas.city_reputation_upserts.push({
          player_id: playerId,
          city_id: gigCity.id,
          patch: {
            reputation_score: newReputation,
            gigs_played: newGigs,
            last_gig_turn: globalTurnId,
            scene_influence_score: Math.round(newInfluence),
            influence_genre: playerGenre || undefined,
            unlocked_venue_tier: Math.max(cityRep.unlocked_venue_tier || 1, newVenueTier),
            discovered_artifacts: newDiscoveredArtifacts,
            networking_points: (cityRep.networking_points || 0) + totalNetworkingGain,
            fatigue_mitigation: fatigueMitigation,
          },
        });

        // Plan 034 M1: Instrumentation — scene_gig_counted per completion
        deltas.turn_events.push({
          module: 'sceneSystem',
          event_type: 'scene_gig_counted',
          description: `Gig counted in ${gigCity.city_name}: ${cityRep.gigs_played} → ${newGigs}`,
          metadata: {
            player_id: playerId,
            city_id: gigCity.id,
            city_name: gigCity.city_name,
            old_gigs: cityRep.gigs_played,
            new_gigs: newGigs,
            rep_gain: repGain,
            networking_gain: totalNetworkingGain,
            via_runtime_context: options.viaRuntimeContext,
            idempotency_key: options.idempotencyKey,
            completion_index: options.completionIndex,
            ok: true,
          },
        });

        // Reputation milestone events
        const milestones = [25, 50, 75, 100];
        for (const m of milestones) {
          if (newReputation >= m && cityRep.reputation_score < m) {
            deltas.turn_events.push({
              module: 'sceneSystem',
              event_type: 'scene_milestone',
              description: `Scene milestone ${m} reached in ${gigCity.city_name}`,
              metadata: { city_name: gigCity.city_name, milestone: m },
            });
            deltas.notifications_to_create.push({
              player_id: playerId,
              type: 'scene_milestone',
              title: `Scene Milestone: ${gigCity.city_name}`,
              body: `Your reputation in ${gigCity.city_name} reached ${m}! ${m >= 75 ? 'You\'re becoming a legend here.' : m >= 50 ? 'The scene respects you.' : 'You\'re building a name.'}`,
            });
          }
        }

        // ─── Opening Act Processing ──────────────────────────
        if (activeTour) {
          const { data: openingActs } = await supabaseAdmin
            .from('tour_opening_acts')
            .select('*')
            .eq('tour_id', activeTour.id)
            .eq('status', 'active');

          let openerBenefitFailureCount = 0;

          for (const act of (openingActs || [])) {
            const openerGenre = ctx.openerGenres?.[act.opener_id] || null;
            const genreOvlp = computeGenreOverlap(playerGenre, openerGenre, gigCity.genre_weights);
            const headlinerFans = Math.round(gigContext.attendance * 0.6);

            const crossover = computeOpeningActFanCrossover({
              headlinerAttendingFans: headlinerFans,
              openerFollowers: act.metadata?.opener_followers || 1000,
              genreOverlap: genreOvlp,
              gigAttendance: gigContext.attendance,
              focusModifiers: computeFocusPathSceneModifiers(act.metadata?.opener_focus_path),
            });
            const adjustedCrossoverFans = Math.max(0, Math.round(crossover.fansGained * archetypeBonus.crossover_mult));

            deltas.opening_act_crossover.push({
              opener_id: act.opener_id,
              fans_gained: adjustedCrossoverFans,
              reputation_city_id: gigCity.id,
              reputation_gain: crossover.reputationGain,
            });

            // ── Opener: Scene contacts (40% of headliner networking gain) ──────
            try {
              const { data: openerContactRels } = await supabaseAdmin
                .from('player_contact_relationships')
                .select('contact_id, relationship_level, unlocked_perks')
                .eq('player_id', act.opener_id);
              const openerRelMap = new Map<string, any>();
              for (const rel of (openerContactRels || [])) {
                openerRelMap.set(rel.contact_id, rel);
              }

              for (const contact of (cityContacts || [])) {
                const openerNetGain = Math.round(computeNetworkingGain({
                  gigSuccess: true,
                  genreMatchScore: genreOvlp * 100,
                  contactRole: contact.role,
                  contactGenrePreference: contact.genre_preference,
                  playerGenre: openerGenre,
                  reputation: crossover.reputationGain,
                  focusModifiers: computeFocusPathSceneModifiers(act.metadata?.opener_focus_path),
                }) * 0.4);

                if (openerNetGain > 0) {
                  const existingRel = openerRelMap.get(contact.id);
                  const currentLevel = existingRel?.relationship_level || 0;
                  const newLevel = currentLevel + openerNetGain;
                  const contactPerks = typeof contact.perks === 'string' ? JSON.parse(contact.perks) : (contact.perks || []);
                  const threshold = contact.relationship_threshold || 10;
                  const unlockedPerks = newLevel >= threshold
                    ? contactPerks.map((p: any) => p.type)
                    : (existingRel?.unlocked_perks || []);

                  upsertContactRelationshipDelta(deltas, {
                    player_id: act.opener_id,
                    contact_id: contact.id,
                    relationship_level: newLevel,
                    unlocked_perks: unlockedPerks,
                    last_interaction_turn: globalTurnId,
                  });

                  deltas.turn_events.push({
                    module: 'sceneSystem:opener',
                    event_type: 'opener_contact_gain',
                    description: `Opener ${act.opener_id} gained ${openerNetGain} networking with ${contact.name} (${contact.role}) in ${gigCity.city_name}`,
                    metadata: {
                      opener_id: act.opener_id,
                      contact_id: contact.id,
                      contact_name: contact.name,
                      contact_role: contact.role,
                      gain: openerNetGain,
                      new_level: newLevel,
                      city_id: gigCity.id,
                      city_name: gigCity.city_name,
                    },
                  });
                }
              }
            } catch (e: any) {
              openerBenefitFailureCount += 1;
              deltas.turn_events.push({
                module: 'sceneSystem:opener',
                event_type: 'opener_contact_error',
                description: `Opener contact processing failed for ${act.opener_id}: ${e?.message}`,
                metadata: { opener_id: act.opener_id, city_id: gigCity.id, error: String(e) },
              });
            }

            // ── Opener: Artifact discovery (50% of headliner chance) ─────────
            try {
              const openerDiscoveryChance = discoveryChance * 0.5;
              const openerRng = seedRng(act.opener_id, globalTurnId);
              const openerRoll = openerRng();

              const { data: openerCityRep } = await supabaseAdmin
                .from('player_city_reputation')
                .select('discovered_artifacts')
                .eq('player_id', act.opener_id)
                .eq('city_id', gigCity.id)
                .maybeSingle();

              const openerDiscoveredIds: string[] = Array.isArray(openerCityRep?.discovered_artifacts)
                ? openerCityRep.discovered_artifacts
                : [];
              const openerUndiscovered = allArtifacts.filter((a: any) => !openerDiscoveredIds.includes(a.id));

              deltas.turn_events.push({
                module: 'sceneSystem:opener',
                event_type: 'opener_artifact_roll',
                description: openerRoll < openerDiscoveryChance && openerUndiscovered.length > 0
                  ? `Artifact roll SUCCESS for opener ${act.opener_id} in ${gigCity.city_name} (${(openerRoll * 100).toFixed(1)}% < ${(openerDiscoveryChance * 100).toFixed(1)}%)`
                  : `Artifact roll failed for opener ${act.opener_id} in ${gigCity.city_name} (${(openerRoll * 100).toFixed(1)}% >= ${(openerDiscoveryChance * 100).toFixed(1)}%)`,
                metadata: {
                  opener_id: act.opener_id,
                  city_id: gigCity.id,
                  city_name: gigCity.city_name,
                  roll: openerRoll,
                  chance: openerDiscoveryChance,
                  headliner_chance: discoveryChance,
                  undiscovered_count: openerUndiscovered.length,
                  success: openerRoll < openerDiscoveryChance && openerUndiscovered.length > 0,
                },
              });

              if (openerRoll < openerDiscoveryChance && openerUndiscovered.length > 0) {
                const rarityOrder: Record<string, number> = { common: 0, rare: 1, legendary: 2 };
                const sorted = [...openerUndiscovered].sort(
                  (a: any, b: any) => (rarityOrder[a.rarity] ?? 1) - (rarityOrder[b.rarity] ?? 1)
                );
                const discoveredArtifact = sorted[0];
                const newOpenerDiscoveredIds = [...openerDiscoveredIds, discoveredArtifact.id];

                deltas.city_reputation_upserts.push({
                  player_id: act.opener_id,
                  city_id: gigCity.id,
                  patch: {
                    discovered_artifacts: newOpenerDiscoveredIds,
                  },
                });

                deltas.turn_events.push({
                  module: 'sceneSystem:opener',
                  event_type: 'opener_artifact_discovered',
                  description: `Opener ${act.opener_id} discovered "${discoveredArtifact.name}" in ${gigCity.city_name}`,
                  metadata: {
                    opener_id: act.opener_id,
                    city_id: gigCity.id,
                    city_name: gigCity.city_name,
                    artifact_id: discoveredArtifact.id,
                    artifact_name: discoveredArtifact.name,
                    artifact_rarity: discoveredArtifact.rarity,
                  },
                });
                deltas.notifications_to_create.push({
                  player_id: act.opener_id,
                  type: 'scene_artifact',
                  title: `Discovered: ${discoveredArtifact.name}`,
                  body: `While on tour in ${gigCity.city_name}, you discovered "${discoveredArtifact.name}"! ${discoveredArtifact.description || ''}`,
                });
              }
            } catch (e: any) {
              openerBenefitFailureCount += 1;
              deltas.turn_events.push({
                module: 'sceneSystem:opener',
                event_type: 'opener_artifact_error',
                description: `Opener artifact processing failed for ${act.opener_id}: ${e?.message}`,
                metadata: { opener_id: act.opener_id, city_id: gigCity.id, error: String(e) },
              });
            }
          }

          const openerFailureSignals = buildOpenerBenefitFailureSignals({
            failureCount: openerBenefitFailureCount,
            headlinerPlayerId: playerId,
            globalTurnId,
            cityName: gigCity.city_name,
            tourId: activeTour.id,
            gigId: gigContext.gigId,
          });

          if (openerFailureSignals) {
            deltas.turn_events.push(openerFailureSignals.event);
            deltas.notifications_to_create.push(openerFailureSignals.notification);
          }
        }
      }
    };

    // Plan 035 M2: Process all completions (touring gigs + underground events)
    // Underground events flow through here regardless of activeTour status
    const processedIdempotencyKeys = new Set<string>();
    const processedCityIds = new Set<string>();
    const invariantFailures: Array<{ completionIndex: number; idempotencyKey: string; reason: string; cityId: string | null }> = [];

    const runtimeCompletions: any[] = Array.isArray(runtimeGigContext?.completions)
      ? runtimeGigContext.completions
      : [];

    if (runtimeCompletions.length > 0) {
      for (let i = 0; i < runtimeCompletions.length; i++) {
        const completion = runtimeCompletions[i];
        const idempotencyKey = String(completion?.idempotencyKey || completion?.idempotency_key || `${completion?.gigId || completion?.gig_id || 'gig'}:${globalTurnId}`);
        const completionCityId = completion?.cityId || completion?.city_id || null;
        const completionTourId = completion?.tourId || completion?.tour_id || null;
        
        // Plan 035 M2: Detect underground events by idempotency key prefix
        const isUnderground = idempotencyKey.startsWith('ug:');

        if (!completion || completion?.completedThisTurn !== true) {
          emitSceneGigSkipped({
            reason: 'not_completed_this_turn',
            completionIndex: i,
            idempotencyKey: idempotencyKey || null,
            completionCityId,
            completionTourId,
          });
          continue;
        }

        // Tour mismatch check only applies to touring gigs (not underground events)
        if (!isUnderground) {
          if (!activeTour) {
            emitSceneGigSkipped({
              reason: 'no_active_tour',
              completionIndex: i,
              idempotencyKey: idempotencyKey || null,
              completionCityId,
              completionTourId,
            });
            continue;
          }
          if (!completionTourId || completionTourId !== activeTour.id) {
            emitSceneGigSkipped({
              reason: 'tour_mismatch',
              completionIndex: i,
              idempotencyKey: idempotencyKey || null,
              completionCityId,
              completionTourId,
              details: { active_tour_id: activeTour.id },
            });
            continue;
          }
        }

        if (!idempotencyKey || idempotencyKey === 'gig:undefined' || idempotencyKey === 'ug:undefined:undefined') {
          emitSceneGigSkipped({
            reason: 'missing_idempotency_key',
            completionIndex: i,
            idempotencyKey: null,
            completionCityId,
            completionTourId,
          });
          continue;
        }

        if (processedIdempotencyKeys.has(idempotencyKey)) {
          emitSceneGigSkipped({
            reason: 'duplicate_idempotency_key',
            completionIndex: i,
            idempotencyKey,
            completionCityId,
            completionTourId,
          });
          continue;
        }

        // Avoid double-counting across completions in the same city in a single turn.
        if (completionCityId && processedCityIds.has(completionCityId)) {
          processedIdempotencyKeys.add(idempotencyKey);
          emitSceneGigSkipped({
            reason: 'duplicate_city_same_turn',
            completionIndex: i,
            idempotencyKey,
            completionCityId,
            completionTourId,
          });
          continue;
        }

        // Plan 035 M2: Resolve using appropriate function for underground vs touring
        let resolved: ResolvedGigContext | null;
        if (isUnderground) {
          resolved = await resolveUndergroundCompletion(cityById, completion);
        } else {
          resolved = await resolveRuntimeGigCompletion(activeTour, cityById, completion);
        }

        if (!resolved?.city) {
          processedIdempotencyKeys.add(idempotencyKey);
          // Plan 035 M3: Track invariant failure for missing city
          invariantFailures.push({
            completionIndex: i,
            idempotencyKey,
            reason: 'city_not_resolved',
            cityId: completionCityId,
          });
          emitSceneGigSkipped({
            reason: 'city_not_resolved',
            completionIndex: i,
            idempotencyKey,
            completionCityId,
            completionTourId,
          });
          continue;
        }

        processedIdempotencyKeys.add(idempotencyKey);
        if (completionCityId) processedCityIds.add(completionCityId);

        await processGigSceneCompletion(resolved, {
          viaRuntimeContext: true,
          idempotencyKey,
          completionIndex: i,
        });

        // Plan 035 M3: Additional turn event for underground events
        if (isUnderground) {
          deltas.turn_events.push({
            module: 'sceneSystem',
            event_type: 'underground_event_completed',
            description: `Underground event scene processing completed in ${resolved.city?.city_name || 'unknown city'}`,
            metadata: {
              player_id: playerId,
              city_id: resolved.city?.id,
              city_name: resolved.city?.city_name,
              idempotency_key: idempotencyKey,
              completion_index: i,
              attendance: resolved.attendance,
              ok: true,
            },
          });
        }
      }
    } else if (activeTour) {
      // Fallback: DB-based resolution (legacy). Not guaranteed to be multi-completion.
      const fallback = await resolveGigContextForTurn(activeTour, globalTurnId, cityById);
      const fallbackKey = `db:${activeTour.id}:${globalTurnId}`;
      await processGigSceneCompletion(fallback, {
        viaRuntimeContext: false,
        idempotencyKey: fallbackKey,
        completionIndex: 0,
      });
    }

    // Plan 035 M3: Invariant check — emit failures for city resolution issues
    if (invariantFailures.length > 0) {
      if (SCENE_HARD_FAIL_INVARIANTS) {
        // Dev/local: hard fail to surface issues during development
        const failureDetails = invariantFailures.map(f => `${f.idempotencyKey}: ${f.reason}`).join(', ');
        throw new Error(`[sceneSystem] INVARIANT FAILURE: ${invariantFailures.length} completions without city resolution: ${failureDetails}`);
      } else {
        // Production: warn + emit turn event
        deltas.turn_events.push({
          module: 'sceneSystem',
          event_type: 'scene_pipeline_invariant_failed',
          description: `${invariantFailures.length} completion(s) could not resolve city`,
          metadata: {
            player_id: playerId,
            failure_count: invariantFailures.length,
            failures: invariantFailures.map(f => ({
              completion_index: f.completionIndex,
              idempotency_key: f.idempotencyKey,
              reason: f.reason,
              city_id: f.cityId,
            })),
          },
        });
        const failedCities = invariantFailures.map(f => f.cityId || 'unknown').join(', ');
        console.warn(`[sceneSystem] INVARIANT WARNING: ${invariantFailures.length} completions without city resolution for player ${playerId} (cities: ${failedCities})`);
      }
    }

    // ─── Tour Completion Bonus ───────────────────────────────
    // When a tour completes this turn, grant a small rep + networking bonus
    // to all cities where the player has existing reputation (i.e., gigged there)
    if (activeTour && (Number(activeTour.turns_remaining) || 0) <= 0) {
      const TOUR_COMPLETION_REP_BONUS = 3;
      const TOUR_COMPLETION_NETWORK_BONUS = 2;
      for (const [cityId, _city] of cityById) {
        const existingRep = repByCity.get(cityId);
        if (!existingRep || existingRep.gigs_played <= 0) continue; // only cities where player gigged
        // Check if we already have an upsert for this city (from gig processing)
        const existingUpsert = deltas.city_reputation_upserts.find(
          (u) => u.city_id === cityId && u.player_id === playerId
        );
        if (existingUpsert) {
          // Add bonus to existing upsert
          existingUpsert.patch.reputation_score = Math.min(100,
            (existingUpsert.patch.reputation_score || existingRep.reputation_score) + TOUR_COMPLETION_REP_BONUS);
          existingUpsert.patch.networking_points =
            (existingUpsert.patch.networking_points || existingRep.networking_points || 0) + TOUR_COMPLETION_NETWORK_BONUS;
        } else {
          deltas.city_reputation_upserts.push({
            player_id: playerId,
            city_id: cityId,
            patch: {
              reputation_score: Math.min(100, existingRep.reputation_score + TOUR_COMPLETION_REP_BONUS),
              networking_points: (existingRep.networking_points || 0) + TOUR_COMPLETION_NETWORK_BONUS,
            },
          });
        }
      }
      deltas.turn_events.push({
        module: 'sceneSystem',
        event_type: 'tour_completion_scene_bonus',
        description: `Tour completion scene bonus for ${activeTour.tour_name || activeTour.name}`,
        metadata: { tour_name: activeTour.tour_name || activeTour.name },
      });
    }

    await processStudioContactGains({
      playerId,
      playerGenre,
      globalTurnId,
      deltas,
      prefetchSongs: ctx?.runtimeContext?.prefetchData?.songsByPlayer?.get(playerId) || null,
    });

    // ─── Fame Spillover (passive, all cities) ────────────────
    const spilloverRep = computeFameSpillover({
      followers: playerFollowers,
      hype: playerHype,
      careerStage,
      focusModifiers,
    });

    if (spilloverRep > 0) {
      for (const [cityId, city] of cityById) {
        const existingRep = repByCity.get(cityId);
        const currentRep = existingRep?.reputation_score || 0;

        // Don't spillover past cap, and don't reduce existing rep
        if (currentRep >= 35) continue; // Spillover caps at 35

        const newRep = Math.min(35, Math.max(currentRep, spilloverRep));
        if (newRep > currentRep) {
          // Check if we already have an upsert for this city (from gig processing)
          const existingUpsert = deltas.city_reputation_upserts.find(
            (u) => u.city_id === cityId && u.player_id === playerId
          );
          if (!existingUpsert) {
            deltas.city_reputation_upserts.push({
              player_id: playerId,
              city_id: cityId,
              patch: {
                reputation_score: newRep,
                unlocked_venue_tier: computeVenueUnlockTier({
                  reputation: newRep,
                  followers: playerFollowers,
                  hype: playerHype,
                  focusModifiers,
                }),
              },
            });
          }
        }
      }
    }

    // ─── Archetype: Hitmaker Passive Rep ──────────────────────
    if (archetypeBonus.passive_rep_per_turn > 0 && player.region) {
      // Hitmaker gets +2 passive rep per turn in their region's cities
      for (const [cityId, city] of cityById) {
        if (city.region !== player.region) continue;
        const existingRep = repByCity.get(cityId);
        const currentRep = existingRep?.reputation_score || 0;
        const existingUpsert = deltas.city_reputation_upserts.find(
          (u) => u.city_id === cityId && u.player_id === playerId
        );
        if (!existingUpsert) {
          const newRep = Math.min(100, currentRep + archetypeBonus.passive_rep_per_turn);
          if (newRep > currentRep) {
            deltas.city_reputation_upserts.push({
              player_id: playerId,
              city_id: cityId,
              patch: { reputation_score: newRep },
            });
          }
        }
      }
    }

    // ─── Trending Genre Rotation (global, not per-player) ────
    // Only run for the first player processed each turn (avoid redundant rotations)
    if (ctx.isFirstPlayer) {
      const rng = seedRng('trending_rotation', globalTurnId);
      for (const [cityId, city] of cityById) {
        const rotationRng = rng();
        // Approximate turns since last rotation (use global turn mod)
        const turnsSinceRotation = globalTurnId % 40; // rough approximation

        if (shouldRotateTrendingGenre(turnsSinceRotation, rotationRng)) {
          const newTrending = pickNextTrendingGenre(city.genre_weights, city.trending_genre, rng());
          if (newTrending !== city.trending_genre) {
            deltas.trending_genre_updates.push({
              city_id: cityId,
              trending_genre: newTrending,
            });
          }
        }
      }
    }

    return {
      success: true,
      deltas: {
        scene_deltas: deltas,
        turn_events: deltas.turn_events,
        notifications_to_create: deltas.notifications_to_create,
      },
    };
  } catch (error) {
    console.error('[SceneSystem] Error:', error);
    return {
      success: true, // Non-fatal — don't block the turn
      deltas: {
        scene_deltas: deltas,
        turn_events: [{
          type: 'scene_system_error',
          player_id: player.id,
          error: String(error),
          turn: globalTurnId,
        }],
        notifications_to_create: [],
      },
    };
  }
}

// ─── Commit Function (called by turnEngine after staging) ────────

export async function commitSceneDeltas(deltas: SceneDeltas): Promise<void> {
  // 1. Upsert city reputations
  for (const upsert of deltas.city_reputation_upserts) {
    const { player_id, city_id, patch } = upsert;
    const now = new Date().toISOString();

    await supabaseAdmin
      .from('player_city_reputation')
      .upsert(
        {
          player_id,
          city_id,
          ...patch,
          updated_at: now,
        },
        { onConflict: 'player_id,city_id' }
      );
  }

  // 2. Upsert contact relationships
  for (const upsert of deltas.contact_relationship_upserts) {
    await supabaseAdmin
      .from('player_contact_relationships')
      .upsert(
        {
          player_id: upsert.player_id,
          contact_id: upsert.contact_id,
          relationship_level: upsert.relationship_level,
          unlocked_perks: upsert.unlocked_perks,
          last_interaction_turn: upsert.last_interaction_turn,
        },
        { onConflict: 'player_id,contact_id' }
      );
  }

  // 3. Update trending genres
  for (const update of deltas.trending_genre_updates) {
    await supabaseAdmin
      .from('city_scenes')
      .update({ trending_genre: update.trending_genre })
      .eq('id', update.city_id);
  }

  // 4. Apply opening act fan crossover
  for (const crossover of deltas.opening_act_crossover) {
    // Add fans to opener's profile
    if (crossover.fans_gained > 0) {
      const { data: openerProfile } = await supabaseAdmin
        .from('profiles')
        .select('followers')
        .eq('id', crossover.opener_id)
        .single();

      if (openerProfile) {
        await supabaseAdmin
          .from('profiles')
          .update({
            followers: (openerProfile.followers || 0) + crossover.fans_gained,
            updated_at: new Date().toISOString(),
          })
          .eq('id', crossover.opener_id);
      }
    }

    // Add scene reputation for opener in the gig city
    if (crossover.reputation_gain > 0) {
      const now = new Date().toISOString();
      // Read existing rep first
      const { data: existingRep } = await supabaseAdmin
        .from('player_city_reputation')
        .select('reputation_score')
        .eq('player_id', crossover.opener_id)
        .eq('city_id', crossover.reputation_city_id)
        .single();

      const currentRep = existingRep?.reputation_score || 0;

      await supabaseAdmin
        .from('player_city_reputation')
        .upsert(
          {
            player_id: crossover.opener_id,
            city_id: crossover.reputation_city_id,
            reputation_score: Math.min(100, currentRep + crossover.reputation_gain),
            updated_at: now,
          },
          { onConflict: 'player_id,city_id' }
        );
    }
  }
}
