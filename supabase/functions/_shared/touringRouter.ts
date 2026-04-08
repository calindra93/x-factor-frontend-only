/**
 * TOURING ROUTER
 * Routes touring actions: generateRoutes, createTour
 */

import {
  generateRoutes,
  createTour,
  createMultiLegTour,
  travelToRegion,
  setCurrentCity,
  getAvailableEvents,
  getGigOpportunities,
  bookEvent,
  hostEvent,
  joinOpenMic,
  organizeUndergroundShow,
  securePermit,
  performAtEvent,
  promoteOnSoundburst,
  dropTeaserPost,
  setUndergroundComplianceMode,
  runPrepAction,
  launchPreparedTour,
  getSceneContacts,
  getInvitablePlayers,
  getPlayerEventDashboard,
} from './touringManager.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { insertNotificationIdempotent } from './notificationInsert.ts';
import {
  getTourCategories,
  canAccessCategory,
  generateCrewPool,
  generateSponsorOptions,
  calculateSetlistVibe,
  computeRegionalDemand,
} from './touringExpansionConfig.ts';
import { detectCareerStage } from './careerProgressionLogic.ts';

function N(v: any): number { return Number(v) || 0; }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const CAREER_STAGES = ['Unknown','Local Artist','Local Buzz','Underground Artist','Cult Favorite','Breakout Artist','Mainstream Artist','A-List Star','Global Superstar','Legacy Icon'];

function getCareerStageIndex(artist: any): number {
  const stage = artist?.career_stage || detectCareerStage(N(artist?.fans ?? artist?.followers), N(artist?.clout), N(artist?.income), !!artist?.has_label);
  const idx = CAREER_STAGES.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

function normalizeFollowerCount(artist: any): number {
  return N(artist?.fans ?? artist?.followers);
}

export async function handleRequest(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cloned = req.clone();
  const body = await cloned.json().catch(() => ({}));
  const action = body.action || new URL(req.url).searchParams.get('action');

  const entities = createSupabaseEntitiesAdapter(supabaseAdmin);
  
  try {
    let responseData;
    
    switch (action) {
      case 'generateRoutes': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await generateRoutes(entities, artistId);
        break;
      }
      case 'createTour': {
        const { artistId, routeId, routeIds, setlist, strategy, tourMode, customTourName, selectedMerch, categoryId, selectedCrew, selectedSponsor, openingActDrafts, coHeadlinerDraft, transportTier, ticketTiers, ticketSellTypes, startDateOffset, venueSize, routeBuilderDraft, routeBuilderSequence } = body;
        if (!artistId) throw new Error('Missing artistId');
        // Merge tourMode + new wizard fields into strategy so they persist on the Tour record and are readable at runtime
        const mergedStrategy = {
          ...(strategy || {}),
          tourMode: tourMode || strategy?.tourMode || 'solo',
          transportTier: transportTier || strategy?.transportTier || 'cargo_van',
          ticketTiers: ticketTiers || strategy?.ticketTiers || { ga: 25 },
          ticketSellTypes: ticketSellTypes || strategy?.ticketSellTypes || ['presale'],
          startDateOffset: startDateOffset || 1,
          venueSize: venueSize || null,
        };
        if (routeBuilderDraft) mergedStrategy.routeBuilderDraft = routeBuilderDraft;
        if (Array.isArray(routeBuilderSequence) && routeBuilderSequence.length > 0) mergedStrategy.routeBuilderSequence = routeBuilderSequence;
        // Multi-leg path: routeIds[] takes precedence (Global Takeover)
        if (Array.isArray(routeIds) && routeIds.length > 1) {
          responseData = await createMultiLegTour(entities, artistId, routeIds, setlist || [], mergedStrategy, customTourName, selectedMerch, categoryId, selectedCrew, selectedSponsor, openingActDrafts || [], coHeadlinerDraft || null);
        } else {
          const resolvedRouteId = routeId || (Array.isArray(routeIds) ? routeIds[0] : null);
          if (!resolvedRouteId) throw new Error('Missing routeId');
          responseData = await createTour(entities, artistId, resolvedRouteId, setlist || [], mergedStrategy, customTourName, selectedMerch, categoryId, selectedCrew, selectedSponsor, openingActDrafts || [], coHeadlinerDraft || null);
        }
        break;
      }
      case 'travel': {
        const { artistId, destinationId } = body;
        if (!artistId || !destinationId) throw new Error('Missing parameters');
        try {
          responseData = await travelToRegion(entities, artistId, destinationId);
        } catch (error: any) {
          const message = error?.message || 'Travel failed';
          const expectedTravelErrors = [
            'Invalid destination',
            'Already in this region',
            'Region locked: insufficient followers',
            'Insufficient funds for travel',
            'Artist not found',
          ];
          if (expectedTravelErrors.includes(message)) {
            responseData = {
              error: message,
              traceId: `touring-travel-${Date.now()}`,
              timestamp: new Date().toISOString(),
            };
            break;
          }
          throw error;
        }
        break;
      }
      case 'travelToCity': {
        const { artistId, city } = body;
        if (!artistId || !city) throw new Error('Missing parameters');
        try {
          responseData = await setCurrentCity(entities, artistId, city);
        } catch (error: any) {
          const message = error?.message || 'City travel failed';
          const expectedErrors = [
            'Already in this city',
            'City not in current region',
            'Insufficient energy for city travel',
            'No region set on profile',
            'Artist not found',
          ];
          if (expectedErrors.includes(message)) {
            responseData = {
              error: message,
              traceId: `touring-travelToCity-${Date.now()}`,
              timestamp: new Date().toISOString(),
            };
            break;
          }
          throw error;
        }
        break;
      }
      case 'getAvailableEvents': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await getAvailableEvents(entities, artistId);
        break;
      }
      case 'getGigOpportunities': {
        const { artistId, city, eventType, timeFilter } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await getGigOpportunities(entities, artistId, undefined, { city, eventType, timeFilter });
        break;
      }
      case 'bookEvent': {
        const { artistId, eventId } = body;
        if (!artistId || !eventId) throw new Error('Missing artistId or eventId');
        responseData = await bookEvent(entities, artistId, eventId);
        break;
      }
      case 'hostEvent': {
        const { artistId, eventType, eventName, scheduledTurnsAhead } = body;
        if (!artistId || !eventType) throw new Error('Missing artistId or eventType');
        responseData = await hostEvent(entities, artistId, eventType, eventName || '', scheduledTurnsAhead || 2);
        break;
      }
      case 'joinOpenMic': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await joinOpenMic(entities, artistId);
        break;
      }
      case 'securePermit': {
        const { artistId, permitTier } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await securePermit(entities, artistId, permitTier || 'standard');
        break;
      }
      case 'organizeUndergroundShow': {
        const { artistId, ...rest } = body;
        if (!artistId) throw new Error('Missing artistId');

        // Remove router-level keys; everything else is treated as wizard config and validated downstream.
        const { action: _action, artistId: _artistId, ...config } = rest || {};

        try {
          responseData = await organizeUndergroundShow(
            entities,
            artistId,
            config,
          );
        } catch (error: any) {
          responseData = {
            error: error?.message || 'Failed to organize underground show',
            traceId: `touring-organizeUndergroundShow-${Date.now()}`,
            timestamp: new Date().toISOString(),
          };
        }
        break;
      }
      case 'performAtEvent': {
        const { artistId, eventId, setlist } = body;
        if (!artistId || !eventId) throw new Error('Missing artistId or eventId');
        responseData = await performAtEvent(entities, artistId, eventId, Array.isArray(setlist) ? setlist : []);
        break;
      }
      case 'promoteOnSoundburst': {
        const { artistId, eventId, budget } = body;
        if (!artistId || !eventId) throw new Error('Missing artistId or eventId');
        responseData = await promoteOnSoundburst(entities, artistId, eventId, budget);
        break;
      }
      case 'dropTeaserPost': {
        const { artistId, eventId } = body;
        if (!artistId || !eventId) throw new Error('Missing artistId or eventId');
        responseData = await dropTeaserPost(entities, artistId, eventId);
        break;
      }
      case 'setUndergroundComplianceMode': {
        const { artistId, eventId, complianceMode } = body;
        if (!artistId || !eventId) throw new Error('Missing artistId or eventId');
        responseData = await setUndergroundComplianceMode(entities, artistId, eventId, complianceMode || 'balanced');
        break;
      }

      case 'runPrepAction': {
        const { artistId, tourId, prepActionId } = body;
        if (!artistId || !tourId || !prepActionId) throw new Error('Missing parameters');
        responseData = await runPrepAction(entities, artistId, tourId, prepActionId);
        break;
      }

      case 'launchPreparedTour': {
        const { artistId, tourId } = body;
        if (!artistId || !tourId) throw new Error('Missing parameters');
        responseData = await launchPreparedTour(entities, artistId, tourId);
        break;
      }

      // ═══ SOUNDBURST v2 ACTIONS ═══

      case 'getSceneContacts': {
        const { artistId, region, city } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await getSceneContacts(entities, artistId, { region, city });
        break;
      }

      case 'getInvitablePlayers': {
        const { artistId, region, limit } = body;
        if (!artistId) throw new Error('Missing artistId');
        try {
          responseData = await getInvitablePlayers(entities, artistId, { region, limit });
        } catch (error: any) {
          responseData = {
            error: error?.message || 'Failed to get invitable players',
            traceId: `touring-getInvitablePlayers-${Date.now()}`,
            timestamp: new Date().toISOString(),
          };
        }
        break;
      }

      case 'getPlayerEventDashboard': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        responseData = await getPlayerEventDashboard(entities, artistId, {});
        break;
      }

      // ═══ TOURING EXPANSION ACTIONS ═══

      case 'getCategories': {
        const { artistId } = body;
        const categories = await getTourCategories();
        let careerStage = 0;
        let regionalDemand: Record<string, number> = {};
        if (artistId) {
          const artist = await entities.ArtistProfile.get(artistId);
          const stage = detectCareerStage(N(artist?.fans ?? artist?.followers), N(artist?.clout), N(artist?.income), !!artist?.has_label);
          const stages = ['Unknown','Local Artist','Local Buzz','Underground Artist','Cult Favorite','Breakout Artist','Mainstream Artist','A-List Star','Global Superstar','Legacy Icon'];
          careerStage = stages.indexOf(stage);
          // Compute regional demand for gating
          const fanProfiles = await entities.FanProfile.filter({ artist_id: artistId }).catch(() => []);
          const fp = fanProfiles[0];
          if (fp) {
            regionalDemand = computeRegionalDemand(fp.region_share || {}, artist?.regional_clout || {}, N(artist?.hype), 0);
          }
        }
        // Mark which categories are accessible
        const categoriesWithAccess = Object.values(categories).map((cat: any) => ({
          ...cat,
          accessible: canAccessCategory(cat, careerStage, regionalDemand).allowed,
          locked_reason: canAccessCategory(cat, careerStage, regionalDemand).reason || null,
        }));
        responseData = { categories: categoriesWithAccess, careerStage };
        break;
      }

      case 'generateCrewPool': {
        const { artistId, tourCategoryId } = body;
        if (!artistId) throw new Error('Missing artistId');
        const artist = await entities.ArtistProfile.get(artistId);
        const stage = detectCareerStage(N(artist?.fans ?? artist?.followers), N(artist?.clout), N(artist?.income), !!artist?.has_label);
        const stages = ['Unknown','Local Artist','Local Buzz','Underground Artist','Cult Favorite','Breakout Artist','Mainstream Artist','A-List Star','Global Superstar','Legacy Icon'];
        const stageIdx = stages.indexOf(stage);
        const categories = await getTourCategories();
        const cat = categories[tourCategoryId || 'standard_run'] || categories['standard_run'];
        const maxSlots = cat?.max_crew_slots || 3;
        const pool = generateCrewPool(maxSlots, stageIdx);
        responseData = { pool, maxSlots };
        break;
      }

      case 'hireCrew': {
        const { tourId, artistId, crewMembers } = body;
        if (!tourId || !artistId || !crewMembers?.length) throw new Error('Missing parameters');
        const hired = [];
        const turnStates = await entities.TurnState.list('-id', 1);
        const currentTurn = turnStates[0]?.global_turn_id || 0;
        for (const member of crewMembers) {
          const { data, error } = await supabaseAdmin
            .from('tour_crew_members')
            .insert({
              tour_id: tourId,
              artist_id: artistId,
              name: member.name,
              specialty: member.specialty,
              quality: member.quality,
              morale: member.morale,
              salary_per_turn: member.salary_per_turn,
              contract_status: 'active',
              hired_turn: currentTurn,
              metadata: member.metadata || {},
            })
            .select()
            .single();
          if (data) hired.push(data);
          if (error) console.error('Error hiring crew:', error);
        }
        responseData = { hired, count: hired.length };
        break;
      }

      case 'fireCrew': {
        const { crewMemberId, artistId } = body;
        if (!crewMemberId || !artistId) throw new Error('Missing parameters');
        const { data, error } = await supabaseAdmin
          .from('tour_crew_members')
          .update({ contract_status: 'fired', updated_at: new Date().toISOString() })
          .eq('id', crewMemberId)
          .eq('artist_id', artistId)
          .select()
          .single();
        if (error) throw new Error(error.message);
        responseData = { success: true, crew: data };
        break;
      }

      case 'boostCrewMorale': {
        const { tourId, artistId, action: boostAction } = body;
        if (!tourId || !artistId) throw new Error('Missing parameters');
        const artist = await entities.ArtistProfile.get(artistId);
        let cost = 0;
        let moraleBoost = 0;
        if (boostAction === 'bonus') { cost = 2000; moraleBoost = 15; }
        else if (boostAction === 'day_off') { cost = 0; moraleBoost = 10; }
        else throw new Error('Invalid boost action: use bonus or day_off');
        if (cost > 0 && N(artist.income) < cost) throw new Error('Insufficient funds');
        if (cost > 0) {
          await entities.ArtistProfile.update(artistId, { income: N(artist.income) - cost });
        }
        const { data: crew } = await supabaseAdmin
          .from('tour_crew_members')
          .select('id, morale')
          .eq('tour_id', tourId)
          .eq('contract_status', 'active');
        for (const c of (crew || [])) {
          await supabaseAdmin.from('tour_crew_members').update({
            morale: Math.min(100, N(c.morale) + moraleBoost),
            updated_at: new Date().toISOString(),
          }).eq('id', c.id);
        }
        responseData = { success: true, moraleBoost, cost, crewCount: crew?.length || 0 };
        break;
      }

      case 'getSponsors': {
        const { artistId, tourCategoryId } = body;
        if (!artistId) throw new Error('Missing artistId');
        const artist = await entities.ArtistProfile.get(artistId);
        const stage = detectCareerStage(N(artist?.fans ?? artist?.followers), N(artist?.clout), N(artist?.income), !!artist?.has_label);
        const stages = ['Unknown','Local Artist','Local Buzz','Underground Artist','Cult Favorite','Breakout Artist','Mainstream Artist','A-List Star','Global Superstar','Legacy Icon'];
        const stageIdx = stages.indexOf(stage);
        const categories = await getTourCategories();
        const cat = categories[tourCategoryId || 'standard_run'] || categories['standard_run'];
        // Get fandom essence for clash risk adjustment
        let fandomEssence: Record<string, number> = {};
        try {
          const { data: fandomRow } = await supabaseAdmin
            .from('fandoms')
            .select('essence_vectors')
            .eq('player_id', artistId)
            .maybeSingle();
          if (fandomRow) fandomEssence = fandomRow.essence_vectors || {};
        } catch { /* non-critical */ }
        const sponsors = generateSponsorOptions(stageIdx, cat, fandomEssence);
        responseData = { sponsors };
        break;
      }

      case 'selectSponsor': {
        const { tourId, artistId, sponsor } = body;
        if (!tourId || !artistId || !sponsor) throw new Error('Missing parameters');
        const { data, error } = await supabaseAdmin
          .from('tour_sponsorships')
          .insert({
            tour_id: tourId,
            artist_id: artistId,
            brand_name: sponsor.brand_name,
            payout: sponsor.payout,
            alignment_tags: sponsor.alignment_tags || [],
            essence_weights: sponsor.essence_weights || {},
            clash_risk: sponsor.clash_risk || 0.1,
            status: 'active',
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        responseData = { success: true, sponsorship: data };
        break;
      }

      case 'resolveChoiceEvent': {
        const { choiceEventId, artistId, chosenOptionId } = body;
        if (!choiceEventId || !artistId || !chosenOptionId) throw new Error('Missing parameters');
        const { data: choiceEvent, error: fetchErr } = await supabaseAdmin
          .from('tour_choice_events')
          .select('*')
          .eq('id', choiceEventId)
          .eq('artist_id', artistId)
          .eq('status', 'pending')
          .single();
        if (fetchErr || !choiceEvent) throw new Error('Choice event not found or already resolved');
        const chosen = (choiceEvent.choices || []).find((c: any) => c.id === chosenOptionId);
        if (!chosen) throw new Error('Invalid choice option');
        const turnStates2 = await entities.TurnState.list('-id', 1);
        const currentTurn2 = turnStates2[0]?.global_turn_id || 0;
        const { error: updateErr } = await supabaseAdmin
          .from('tour_choice_events')
          .update({
            status: 'resolved',
            chosen_option: chosenOptionId,
            resolved_turn: currentTurn2,
            effects_applied: chosen.effects || {},
          })
          .eq('id', choiceEventId);
        if (updateErr) throw new Error(updateErr.message);
        // Apply immediate effects to tour
        if (chosen.effects) {
          const tourId2 = choiceEvent.tour_id;
          const { data: tourData } = await supabaseAdmin.from('tours').select('fatigue, morale, total_net_revenue, fan_reception, crew_morale').eq('id', tourId2).single();
          if (tourData) {
            const patch: any = {};
            if (chosen.effects.fatigue) patch.fatigue = Math.max(0, Math.min(100, N(tourData.fatigue) + chosen.effects.fatigue));
            if (chosen.effects.morale) patch.morale = Math.max(0, Math.min(100, N(tourData.morale) + chosen.effects.morale));
            if (chosen.effects.money) patch.total_net_revenue = N(tourData.total_net_revenue) + chosen.effects.money;
            if (chosen.effects.crew_morale) patch.crew_morale = Math.max(0, Math.min(100, N(tourData.crew_morale) + chosen.effects.crew_morale));
            if (chosen.effects.fan_reception_delta) {
              const reception = { ...(tourData.fan_reception || {}) };
              for (const [seg, delta] of Object.entries(chosen.effects.fan_reception_delta)) {
                reception[seg] = Math.max(0, Math.min(100, N(reception[seg] || 50) + N(delta)));
              }
              patch.fan_reception = reception;
            }
            if (Object.keys(patch).length > 0) {
              await supabaseAdmin.from('tours').update(patch).eq('id', tourId2);
            }
          }
          // Apply hype/clout to player
          if (chosen.effects.hype || chosen.effects.clout) {
            const artist2 = await entities.ArtistProfile.get(artistId);
            const playerPatch: any = {};
            if (chosen.effects.hype) playerPatch.hype = Math.max(0, Math.min(100, N(artist2.hype) + chosen.effects.hype));
            if (chosen.effects.clout) playerPatch.clout = Math.max(0, Math.min(200, N(artist2.clout) + chosen.effects.clout));
            if (Object.keys(playerPatch).length > 0) {
              await entities.ArtistProfile.update(artistId, playerPatch);
            }
          }
        }
        responseData = { success: true, chosen: chosen, effects: chosen.effects };
        break;
      }

      case 'inviteOpeningAct': {
        const { tourId, headlinerId, openerId, revenueSplit } = body;
        if (!tourId || !headlinerId || !openerId) throw new Error('Missing parameters');
        if (headlinerId === openerId) throw new Error('Cannot invite yourself');
        const split = Math.max(0.05, Math.min(0.50, N(revenueSplit) || 0.20));
        const { data, error } = await supabaseAdmin
          .from('tour_opening_acts')
          .insert({
            tour_id: tourId,
            headliner_id: headlinerId,
            opener_id: openerId,
            status: 'pending',
            revenue_split: split,
            attendance_boost: 1.10,
            fan_crossover_rate: 0.05,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        // Create notification for opener
        await entities.Notification.create({
          player_id: openerId,
          type: 'TOUR_INVITE',
          title: 'Opening Act Invitation!',
          subtitle: `You've been invited to open for a tour.`,
          body: `Revenue split: ${Math.round(split * 100)}%. Accept or decline from your touring page.`,
          priority: 'high',
          metrics: { tour_id: tourId, invitation_id: data.id, revenue_split: split },
          deep_links: { page: 'Career', params: { openApp: 'touring' } },
          idempotency_key: `tour_invite:${tourId}:${openerId}`,
        });
        responseData = { success: true, invitation: data };
        break;
      }

      case 'getOpeningActCandidates': {
        const { artistId, region, preferredRegions } = body;
        if (!artistId) throw new Error('Missing artistId');
        const headliner = await entities.ArtistProfile.get(artistId);
        if (!headliner) throw new Error('Artist not found');
        const headlinerStageIdx = getCareerStageIndex(headliner);
        const headlinerFollowers = Math.max(1, normalizeFollowerCount(headliner));
        const preferredRegionList = Array.isArray(preferredRegions)
          ? preferredRegions.filter((value: any) => typeof value === 'string' && value.trim())
          : (region ? [region] : []);
        const preferredRegionSet = new Set(preferredRegionList);
        let query = supabaseAdmin
          .from('profiles')
          .select('id, artist_name, career_stage, followers, fans, region, genre, artist_image, clout, income')
          .neq('id', artistId);
        const { data: candidates, error } = await query.limit(100);
        if (error) throw new Error(error.message);
        const filtered = (candidates || []).sort((a: any, b: any) => {
          const aPreferred = preferredRegionSet.has(a?.region) ? 1 : 0;
          const bPreferred = preferredRegionSet.has(b?.region) ? 1 : 0;
          if (aPreferred !== bPreferred) return bPreferred - aPreferred;
          return normalizeFollowerCount(b) - normalizeFollowerCount(a);
        }).slice(0, 10).map((candidate: any) => ({
          ...candidate,
          is_preferred_region: preferredRegionSet.has(candidate?.region),
        }));
        responseData = {
          candidates: filtered,
          filters: {
            region: region || null,
            preferredRegions: preferredRegionList,
            headlinerStageIndex: headlinerStageIdx,
            followerBand: null,
            relaxedFallbackUsed: false,
            unrestrictedTestMode: true,
          },
        };
        break;
      }

      case 'getCoHeadlinerCandidates': {
        const { artistId, region, preferredRegions } = body;
        if (!artistId) throw new Error('Missing artistId');
        const headliner = await entities.ArtistProfile.get(artistId);
        if (!headliner) throw new Error('Artist not found');
        const headlinerStageIdx = getCareerStageIndex(headliner);
        const headlinerFollowers = Math.max(1, normalizeFollowerCount(headliner));
        const preferredRegionList = Array.isArray(preferredRegions)
          ? preferredRegions.filter((value: any) => typeof value === 'string' && value.trim())
          : (region ? [region] : []);
        const preferredRegionSet = new Set(preferredRegionList);
        const { data: candidates, error } = await supabaseAdmin
          .from('profiles')
          .select('id, artist_name, career_stage, followers, fans, region, genre, artist_image, clout, income')
          .neq('id', artistId)
          .limit(100);
        if (error) throw new Error(error.message);
        const filtered = (candidates || []).filter((candidate: any) => {
          const candidateStageIdx = getCareerStageIndex(candidate);
          const candidateFollowers = normalizeFollowerCount(candidate);
          const withinStageWindow = candidateStageIdx >= Math.max(0, headlinerStageIdx - 1) && candidateStageIdx <= headlinerStageIdx + 2;
          const followerRatio = candidateFollowers / headlinerFollowers;
          const withinFollowerBand = followerRatio >= 0.5 && followerRatio <= 1.75;
          return withinStageWindow && withinFollowerBand;
        }).sort((a: any, b: any) => {
          const aPreferred = preferredRegionSet.has(a?.region) ? 1 : 0;
          const bPreferred = preferredRegionSet.has(b?.region) ? 1 : 0;
          if (aPreferred !== bPreferred) return bPreferred - aPreferred;
          return normalizeFollowerCount(b) - normalizeFollowerCount(a);
        }).map((candidate: any) => ({
          ...candidate,
          is_preferred_region: preferredRegionSet.has(candidate?.region),
        }));
        responseData = {
          candidates: filtered,
          filters: {
            region: region || null,
            preferredRegions: preferredRegionList,
            headlinerStageIndex: headlinerStageIdx,
            followerBand: [0.5, 1.75],
          },
        };
        break;
      }

      case 'getOpeningActInbox': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        const [incomingRes, outgoingRes, notificationsRes] = await Promise.all([
          supabaseAdmin
            .from('tour_opening_acts')
            .select('id, tour_id, opener_id, headliner_id, status, revenue_split, attendance_boost, fan_crossover_rate, created_at, accepted_turn, metadata, tours(tour_name, region, artist_id)')
            .eq('opener_id', artistId)
            .order('created_at', { ascending: false })
            .limit(25),
          supabaseAdmin
            .from('tour_opening_acts')
            .select('id, tour_id, opener_id, headliner_id, status, revenue_split, attendance_boost, fan_crossover_rate, created_at, accepted_turn, metadata, tours(tour_name, region, artist_id)')
            .eq('headliner_id', artistId)
            .order('created_at', { ascending: false })
            .limit(25),
          supabaseAdmin
            .from('notifications')
            .select('id, type, title, subtitle, body, metrics, is_read, created_at')
            .eq('player_id', artistId)
            .in('type', ['TOUR_INVITE', 'TOUR_INVITE_RESPONSE', 'TOURING_INVITE'])
            .order('created_at', { ascending: false })
            .limit(20),
        ]);
        if (incomingRes.error) throw new Error(incomingRes.error.message);
        if (outgoingRes.error) throw new Error(outgoingRes.error.message);
        if (notificationsRes.error) throw new Error(notificationsRes.error.message);
        const profileIds = Array.from(new Set([
          ...((incomingRes.data || []).map((row: any) => row.headliner_id)),
          ...((outgoingRes.data || []).map((row: any) => row.opener_id)),
        ].filter(Boolean)));
        let profileMap: Record<string, any> = {};
        if (profileIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, artist_name, artist_image, region, career_stage, followers, fans, genre')
            .in('id', profileIds);
          if (profilesError) throw new Error(profilesError.message);
          profileMap = Object.fromEntries((profiles || []).map((profile: any) => [profile.id, profile]));
        }
        const decorateIncoming = (incomingRes.data || []).map((row: any) => ({
          ...row,
          invite_source: 'tour_opening_acts',
          counterparty: profileMap[row.headliner_id] || null,
        }));
        const decorateOutgoing = (outgoingRes.data || []).map((row: any) => ({
          ...row,
          invite_source: 'tour_opening_acts',
          counterparty: profileMap[row.opener_id] || null,
        }));

        responseData = {
          incoming: decorateIncoming,
          outgoing: decorateOutgoing,
          notifications: notificationsRes.data || [],
        };
        break;
      }

      case 'respondOpeningAct': {
        const { artistId, invitationId, response } = body;
        if (!artistId) throw new Error('Missing artistId');
        if (!invitationId) throw new Error('Missing invitationId');
        if (!['accepted', 'declined'].includes(response)) throw new Error('response must be "accepted" or "declined"');

        const { data: invite, error: fetchErr } = await supabaseAdmin
          .from('tour_opening_acts')
          .select('id, tour_id, headliner_id, opener_id, status, revenue_split, metadata, tours(tour_name)')
          .eq('id', invitationId)
          .eq('opener_id', artistId)
          .single();
        if (fetchErr || !invite) throw new Error('Invitation not found or not yours');
        if (invite.status !== 'pending') throw new Error(`Invitation already ${invite.status}`);

        const turnStates = await entities.TurnState.list('-id', 1);
        const currentTurn = turnStates[0]?.global_turn_id || 0;

        const { error: updateErr } = await supabaseAdmin
          .from('tour_opening_acts')
          .update({
            status: response === 'accepted' ? 'active' : 'declined',
            accepted_turn: response === 'accepted' ? currentTurn : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invitationId);
        if (updateErr) throw new Error(updateErr.message);

        const openerProfile = await entities.ArtistProfile.get(artistId);
        const openerName = openerProfile?.artist_name || 'Opening Act';
        const tourName = (invite as any).tours?.tour_name || 'your tour';
        const inviteRole: string = (invite as any).metadata?.role || 'opener';
        const isCoHead = inviteRole === 'equal_coheadliner' || inviteRole === 'partner_led';
        const roleLabel = inviteRole === 'partner_led' ? 'Partner headliner' : isCoHead ? 'Co-headliner' : 'Opening act';
        await insertNotificationIdempotent(supabaseAdmin, {
          player_id: invite.headliner_id,
          type: 'TOUR_INVITE_RESPONSE',
          title: response === 'accepted'
            ? `${roleLabel} Confirmed!`
            : `${roleLabel} Invite Declined`,
          subtitle: response === 'accepted'
            ? `${openerName} accepted your ${isCoHead ? inviteRole === 'partner_led' ? 'partner tour' : 'co-headliner' : 'opening act'} invitation for ${tourName}.`
            : `${openerName} declined your ${isCoHead ? inviteRole === 'partner_led' ? 'partner tour' : 'co-headliner' : 'opening act'} invitation for ${tourName}.`,
          body: response === 'accepted'
            ? `${Math.round((Number(invite.revenue_split) || 0) * 100)}% revenue split confirmed.`
            : 'Consider inviting another artist.',
          priority: response === 'accepted' ? 'high' : 'normal',
          metrics: { tour_id: invite.tour_id, invitation_id: invitationId, responder_id: artistId, role: inviteRole },
          idempotency_key: `tour_invite_response:${invitationId}:${response}`,
        }, 'touringRouter.inviteResponse');

        responseData = { success: true, status: response === 'accepted' ? 'active' : 'declined' };
        break;
      }

      case 'calculateSetlistVibe': {
        const { artistId, songIds } = body;
        if (!artistId || !songIds?.length) throw new Error('Missing parameters');
        const turnStates4 = await entities.TurnState.list('-id', 1);
        const currentTurn4 = turnStates4[0]?.global_turn_id || 0;
        // Batch-fetch songs + their releases in 2 queries instead of N+1
        const { data: songRows } = await entities.supabaseClient
          .from('songs')
          .select('id, quality, release_id')
          .in('id', songIds);
        const releaseIds = [...new Set((songRows || []).map((s: any) => s.release_id).filter(Boolean))];
        const releaseMap = new Map<string, any>();
        if (releaseIds.length) {
          const { data: rels } = await entities.supabaseClient
            .from('releases')
            .select('id, lifetime_streams, scheduled_turn')
            .in('id', releaseIds);
          for (const r of rels || []) releaseMap.set(r.id, r);
        }
        const songs = (songRows || []).map((s: any) => {
          const rel = s.release_id ? releaseMap.get(s.release_id) : null;
          return {
            id: s.id,
            quality: N(s.quality),
            streams: N(rel?.lifetime_streams),
            release_turn: N(rel?.scheduled_turn),
            is_iconic: false,
          };
        });
        const vibe = calculateSetlistVibe(songs, currentTurn4);
        responseData = { vibe, songCount: songs.length };
        break;
      }

      case 'getRegionalDemand': {
        const { artistId } = body;
        if (!artistId) throw new Error('Missing artistId');
        const artist = await entities.ArtistProfile.get(artistId);
        const fanProfiles = await entities.FanProfile.filter({ artist_id: artistId }).catch(() => []);
        const fp = fanProfiles[0];
        const demand = computeRegionalDemand(
          fp?.region_share || {},
          artist?.regional_clout || {},
          N(artist?.hype),
          0,
        );
        responseData = { demand };
        break;
      }

      case 'getRivalTours': {
        const { artistId, regions } = body;
        if (!artistId) throw new Error('Missing artistId');
        const regionList: string[] = Array.isArray(regions) ? regions : [];

        // Load active tours NOT belonging to this player
        let tourQuery = supabaseAdmin
          .from('tours')
          .select('id, artist_id, tour_name, status, region, stats, created_at')
          .eq('status', 'active')
          .neq('artist_id', artistId)
          .order('created_at', { ascending: false })
          .limit(20);
        if (regionList.length > 0) {
          tourQuery = tourQuery.in('region', regionList);
        }
        const { data: rivalTours } = await tourQuery;

        // Load artist names for these tours
        const artistIds = [...new Set((rivalTours || []).map((t: any) => t.artist_id))];
        let artistNames: Record<string, string> = {};
        if (artistIds.length > 0) {
          const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, artist_name')
            .in('id', artistIds);
          for (const p of profiles || []) artistNames[p.id] = p.artist_name || 'Unknown Artist';
        }

        const enriched = (rivalTours || []).map((t: any) => ({
          id: t.id,
          tour_name: t.tour_name,
          region: t.region,
          artist_name: artistNames[t.artist_id] || 'Unknown Artist',
          hype: Number(t.stats?.hype_gained) || 0,
          fans_gained: Number(t.stats?.fans_gained) || 0,
          created_at: t.created_at,
        }));

        responseData = { rivals: enriched };
        break;
      }

      case 'getCitySceneData': {
        const { artistId, region } = body;
        if (!artistId) throw new Error('Missing artistId');
        // Load city scenes, optionally filtered by region
        let sceneQuery = supabaseAdmin
          .from('city_scenes')
          .select('*');
        if (region) sceneQuery = sceneQuery.eq('region', region);
        const { data: scenes } = await sceneQuery;

        // Load player reputation for these cities
        const cityIds = (scenes || []).map((s: any) => s.id);
        let reps: any[] = [];
        if (cityIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('player_city_reputation')
            .select('*')
            .eq('player_id', artistId)
            .in('city_id', cityIds);
          reps = data || [];
        }

        // Load contacts for these cities
        let contacts: any[] = [];
        if (cityIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('scene_contacts')
            .select('id, city_id, name, role, genre_preference, relationship_threshold, perks, portrait_seed')
            .in('city_id', cityIds);
          contacts = data || [];
        }

        // Load player contact relationships
        const contactIds = contacts.map((c: any) => c.id);
        let contactRels: any[] = [];
        if (contactIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('player_contact_relationships')
            .select('*')
            .eq('player_id', artistId)
            .in('contact_id', contactIds);
          contactRels = data || [];
        }

        responseData = { scenes: scenes || [], playerReps: reps, contacts, contactRelationships: contactRels };
        break;
      }

      default:
        return Response.json({
          error: `Unknown touring action: ${action}`,
          available: [
            'generateRoutes',
            'createTour',
            'travel',
            'travelToCity',
            'getAvailableEvents',
            'getGigOpportunities',
            'bookEvent',
            'hostEvent',
            'joinOpenMic',
            'securePermit',
            'organizeUndergroundShow',
            'performAtEvent',
            'promoteOnSoundburst',
            'dropTeaserPost',
            'setUndergroundComplianceMode',
            'getCategories',
            'generateCrewPool',
            'hireCrew',
            'fireCrew',
            'boostCrewMorale',
            'getSponsors',
            'selectSponsor',
            'resolveChoiceEvent',
            'inviteOpeningAct',
            'respondOpeningAct',
            'getOpeningActCandidates',
            'getOpeningActInbox',
            'calculateSetlistVibe',
            'getRegionalDemand',
            'getCitySceneData'
          ]
        }, { status: 400, headers: corsHeaders });
    }

    return Response.json(responseData, { headers: corsHeaders });

  } catch (error: any) {
    return Response.json({
      error: error?.message || 'Unexpected touring error',
      traceId: `touring-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }, { status: 500, headers: corsHeaders });
  }
}
