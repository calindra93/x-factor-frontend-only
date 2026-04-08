/**
 * TOURING MANAGER (Turn Engine Module)
 * Handles tour progression, events, revenue, and fatigue.
 */

import { detectCareerStage } from './careerProgressionLogic.ts';
import {
  getTourCategories,
  canAccessCategory,
  generateCrewPool,
  generateSponsorOptions,
  selectChoiceEvent,
  checkSponsorClash,
  calculateSetlistVibe,
  setlistVibeSegmentDrift,
  computeGigFanReception,
  computeEraTourSynergy,
  computeRegionalDemand,
  computeTourReviewScore,
  tourEndConsequences,
  type TourCategory,
  type CrewNPC,
  type TourSponsorOption,
} from './touringExpansionConfig.ts';
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  computeGenreMatchScore,
  computeFocusPathSceneModifiers,
  computeReputationGain,
  computeNetworkingGain,
  computeSceneInfluenceDelta,
  computeShowVibeScore,
  computeUndergroundDetectionRisk,
  computeVenueUnlockTier,
  composeRaidNarrativeSeed,
} from './sceneMath.ts';
import { insertNotificationIdempotent } from './notificationInsert.ts';
import {
  mergeTourEventMetadataWithSoundburst,
  normalizeSoundburstWizardConfig,
  updateSoundburstComplianceModeInMetadata,
} from './soundburstWizardConfig.ts';
import { getEventThumbnail, getEventThumbnailBatch } from './eventThumbnails.ts';

const TOURING_DEBUG = (globalThis as any)?.Deno?.env?.get?.('TOURING_DEBUG') === '1';
function tourDebug(...args: any[]) { if (TOURING_DEBUG) console.log('[TOURING]', ...args); }

const SPECIALTY_LABELS: Record<string, string> = {
  sound_engineer: 'Sound Engineer',
  stylist: 'Stylist',
  tour_manager: 'Tour Manager',
  security: 'Security',
  stage_designer: 'Stage Designer',
  publicist: 'Publicist',
};

// --- CONFIGURATION ---

// Calculate travel cost based on distance between regions
function calculateDistanceCost(fromRegion: string, toRegion: string): number {
  // Distance matrix (costs based on geographic proximity)
  const distanceCosts: Record<string, Record<string, number>> = {
    'United States': {
      'Canada': 1000,      // Close neighbor
      'Latin America': 2500, // Same hemisphere
      'UK': 3500,           // Atlantic crossing
      'Europe': 4000,       // Atlantic crossing
      'Africa': 5000,       // Long distance
      'Oceania': 6000,      // Very far
      'Asia': 5500,         // Far
    },
    'Canada': {
      'United States': 1000, // Close neighbor
      'Latin America': 3000, // Via US
      'UK': 4000,           // Atlantic crossing
      'Europe': 4500,       // Atlantic crossing
      'Africa': 5500,       // Long distance
      'Oceania': 6500,      // Very far
      'Asia': 6000,         // Far
    },
    'UK': {
      'Europe': 1500,       // Very close (Channel)
      'United States': 3500, // Atlantic crossing
      'Canada': 4000,       // Atlantic crossing
      'Latin America': 4500, // Atlantic + distance
      'Africa': 3000,       // Mediterranean proximity
      'Asia': 5000,         // Long distance
      'Oceania': 7000,      // Very far
    },
    'Europe': {
      'UK': 1500,           // Very close
      'Africa': 2500,       // Mediterranean proximity
      'Asia': 3500,         // Eurasian connection
      'United States': 4000, // Atlantic crossing
      'Canada': 4500,       // Atlantic crossing
      'Latin America': 5000, // Atlantic + distance
      'Oceania': 7500,      // Very far
    },
    'Africa': {
      'Europe': 2500,       // Mediterranean proximity
      'UK': 3000,           // Via Europe
      'Asia': 4000,         // Relatively close
      'Latin America': 4500, // Atlantic crossing
      'United States': 5000, // Long distance
      'Canada': 5500,       // Long distance
      'Oceania': 7000,      // Very far
    },
    'Asia': {
      'Europe': 3500,       // Eurasian connection
      'Africa': 4000,       // Relatively close
      'Oceania': 4500,       // Pacific proximity
      'Latin America': 6000, // Pacific distance
      'United States': 5500, // Pacific distance
      'Canada': 6000,       // Pacific distance
      'UK': 5000,           // Long distance
    },
    'Latin America': {
      'United States': 2500, // Close neighbor
      'Canada': 3000,       // Via US
      'Africa': 4500,       // Atlantic proximity
      'Europe': 5000,       // Atlantic crossing
      'UK': 4500,           // Atlantic crossing
      'Asia': 6000,         // Pacific distance
      'Oceania': 6500,      // Pacific distance
    },
    'Oceania': {
      'Asia': 4500,         // Pacific proximity
      'Latin America': 6500, // Pacific distance
      'Africa': 7000,       // Very far
      'Europe': 7500,       // Very far
      'UK': 7000,           // Very far
      'United States': 6000, // Pacific distance
      'Canada': 6500,       // Pacific distance
    }
  };

  // Default to base cost if no specific distance cost defined
  return distanceCosts[fromRegion]?.[toRegion] || 5000;
}

const TOUR_TYPES = {
  'local_club': { name: 'Local Club Run', min_stage: 'Unknown', base_cost: 2000, hype_mult: 1.0, fatigue_per_turn: 2 },
  'regional_circuit': { name: 'Regional Circuit', min_stage: 'Local Artist', base_cost: 8000, hype_mult: 1.2, fatigue_per_turn: 3 },
  'national_headliner': { name: 'National Headliner', min_stage: 'Underground Artist', base_cost: 25000, hype_mult: 1.5, fatigue_per_turn: 4 },
  'arena_tour': { name: 'Arena Tour', min_stage: 'Mainstream Artist', base_cost: 75000, hype_mult: 2.0, fatigue_per_turn: 5 },
  'stadium_tour': { name: 'Stadium Tour', min_stage: 'Global Superstar', base_cost: 200000, hype_mult: 3.0, fatigue_per_turn: 6 }
};

const TOUR_RANDOM_EVENTS = [
  // Original 8 events
  { id: 'bus_breakdown', type: 'negative', text: 'Tour bus breakdown!', effect: { money: -500, fatigue: 10, morale: -5 } },
  { id: 'sick_crew', type: 'negative', text: 'Flu sweeping through the crew.', effect: { fatigue: 15, morale: -10 } },
  { id: 'bad_weather', type: 'negative', text: 'Stormy weather delayed travel.', effect: { fatigue: 5, morale: -2 } },
  { id: 'viral_clip', type: 'positive', text: 'A clip from last night went viral!', effect: { hype: 2, morale: 10 } },
  { id: 'local_radio', type: 'positive', text: 'Great local radio interview.', effect: { hype: 1, morale: 5 } },
  { id: 'vip_party', type: 'positive', text: 'Threw an epic afterparty.', effect: { money: -200, morale: 15, fatigue: 5 } },
  { id: 'sponsor_bonus', type: 'positive', text: 'Sponsor loved the show.', effect: { money: 1000, morale: 5 } },
  { id: 'band_drama', type: 'negative', text: 'In-fighting among the band.', effect: { morale: -15 } },
  
  // Equipment Issues (8 events)
  { id: 'equipment_failure', type: 'negative', text: 'Critical equipment failed mid-show!', effect: { money: -2000, morale: -10, fatigue: 5 } },
  { id: 'stolen_gear', type: 'negative', text: 'Gear stolen from van overnight!', effect: { money: -5000, morale: -20, fatigue: 10 } },
  { id: 'sound_system_blowout', type: 'negative', text: 'Venue sound system blew out!', effect: { money: -1500, morale: -8, fatigue: 3 } },
  { id: 'lighting_malfunction', type: 'negative', text: 'Lighting rig malfunction during show!', effect: { money: -800, morale: -5, fatigue: 2 } },
  { id: 'instrument_damage', type: 'negative', text: 'Main instrument damaged in transit!', effect: { money: -1200, morale: -7, fatigue: 3 } },
  { id: 'power_outage', type: 'negative', text: 'Power outage killed the show!', effect: { money: -3000, morale: -15, fatigue: 8 } },
  { id: 'transport_breakdown', type: 'negative', text: 'Tour van broke down on highway!', effect: { money: -2500, fatigue: 15, morale: -12 } },
  { id: 'gear_confiscated', type: 'negative', text: 'Customs seized equipment at border!', effect: { money: -4000, morale: -18, fatigue: 10 } },
  
  // Positive Equipment Events (4 events)
  { id: 'sponsor_gear', type: 'positive', text: 'Gear sponsor provided free equipment!', effect: { money: 2000, morale: 8, hype: 1 } },
  { id: 'tech_miracle', type: 'positive', text: 'Sound engineer saved the show!', effect: { morale: 12, fatigue: -5 } },
  { id: 'backup_rescued', type: 'positive', text: 'Backup gear saved the day!', effect: { morale: 10, hype: 1 } },
  { id: 'venue_upgrade', type: 'positive', text: 'Venue upgraded their system for you!', effect: { morale: 8, hype: 2 } },
  
  // Travel Issues (10 events)
  { id: 'flight_cancelled', type: 'negative', text: 'Flight cancelled - missed show!', effect: { money: -3000, morale: -15, fatigue: 8 } },
  { id: 'visa_denied', type: 'negative', text: 'Visa denied - country tour cancelled!', effect: { money: -8000, morale: -25, fatigue: 5 } },
  { id: 'hotel_overbooked', type: 'negative', text: 'Hotel overbooked - no rooms available!', effect: { money: -500, morale: -10, fatigue: 10 } },
  { id: 'border_delay', type: 'negative', text: 'Stuck at border for 12 hours!', effect: { money: -1500, morale: -12, fatigue: 15 } },
  { id: 'navigation_error', type: 'negative', text: 'Got lost - missed soundcheck!', effect: { money: -800, morale: -8, fatigue: 5 } },
  { id: 'fuel_shortage', type: 'negative', text: 'Ran out of fuel in middle of nowhere!', effect: { money: -1200, morale: -10, fatigue: 8 } },
  { id: 'parking_ticket', type: 'negative', text: 'Multiple parking tickets accumulated!', effect: { money: -600, morale: -5 } },
  { id: 'toll_booth_chaos', type: 'negative', text: 'Toll booth backup caused major delay!', effect: { money: -400, morale: -8, fatigue: 5 } },
  { id: 'road_closure', type: 'negative', text: 'Major road closure - huge detour!', effect: { money: -1000, morale: -10, fatigue: 12 } },
  { id: 'car_breakdown', type: 'negative', text: 'Personal car broke down on tour!', effect: { money: -2000, morale: -15, fatigue: 10 } },
  
  // Positive Travel Events (5 events)
  { id: 'flight_upgrade', type: 'positive', text: 'Airline upgraded to first class!', effect: { morale: 15, fatigue: -10 } },
  { id: 'vip_transport', type: 'positive', text: 'Got VIP transport service!', effect: { morale: 10, fatigue: -8 } },
  { id: 'shortcut_discovered', type: 'positive', text: 'Found shortcut - saved hours!', effect: { morale: 8, fatigue: -5 } },
  { id: 'friendly_border', type: 'positive', text: 'Border agent was huge fan!', effect: { morale: 12, hype: 1 } },
  { id: 'free_lodging', type: 'positive', text: 'Hotel comped rooms for band!', effect: { money: 800, morale: 10 } },
  
  // Venue Issues (12 events)
  { id: 'venue_double_booked', type: 'negative', text: 'Venue double-booked - show cancelled!', effect: { money: -4000, morale: -20, fatigue: 5 } },
  { id: 'capacity_limit', type: 'negative', text: 'Venue capacity limit - fans turned away!', effect: { money: -2000, morale: -15, hype: -2 } },
  { id: 'soundcheck_conflict', type: 'negative', text: 'Soundcheck time conflict!', effect: { morale: -8, fatigue: 3 } },
  { id: 'staff_strike', type: 'negative', text: 'Venue staff on strike!', effect: { money: -1500, morale: -10 } },
  { id: 'fire_marshal_shutdown', type: 'negative', text: 'Fire marshal shut down show!', effect: { money: -5000, morale: -25, fatigue: 8 } },
  { id: 'acoustic_nightmare', type: 'negative', text: 'Terrible venue acoustics!', effect: { morale: -12, hype: -1 } },
  { id: 'no_dressing_room', type: 'negative', text: 'No dressing room available!', effect: { morale: -8, fatigue: 5 } },
  { id: 'parking_disaster', type: 'negative', text: 'No parking for gear van!', effect: { money: -300, morale: -10, fatigue: 8 } },
  { id: 'toilet_flooded', type: 'negative', text: 'Venue toilets flooded - show delayed!', effect: { morale: -6, fatigue: 3 } },
  { id: 'neighbor_complaint', type: 'negative', text: 'Noise complaint - show cut short!', effect: { money: -1000, morale: -12, hype: -1 } },
  { id: 'power_surge', type: 'negative', text: 'Power surge damaged equipment!', effect: { money: -2500, morale: -15, fatigue: 5 } },
  { id: 'security_breach', type: 'negative', text: 'Security breach - show evacuated!', effect: { money: -6000, morale: -20, fatigue: 10 } },
  
  // Positive Venue Events (8 events)
  { id: 'sold_out_show', type: 'positive', text: 'Sold out show - standing room only!', effect: { money: 3000, morale: 20, hype: 3 } },
  { id: 'celebrity_guest', type: 'positive', text: 'Celebrity joined you on stage!', effect: { morale: 25, hype: 5 } },
  { id: 'perfect_acoustics', type: 'positive', text: 'Perfect venue acoustics!', effect: { morale: 15, hype: 2 } },
  { id: 'press_coverage', type: 'positive', text: 'Local press reviewed show positively!', effect: { morale: 12, hype: 3 } },
  { id: 'fan_encounter', type: 'positive', text: 'Met superfan who shared story online!', effect: { morale: 18, hype: 2 } },
  { id: 'venue_upgrade', type: 'positive', text: 'Venue upgraded to bigger space!', effect: { money: 2000, morale: 15 } },
  { id: 'radio_interview', type: 'positive', text: 'Local radio interviewed you!', effect: { morale: 10, hype: 2 } },
  { id: 'industry_scout', type: 'positive', text: 'Industry scout attended show!', effect: { morale: 20, hype: 4 } },
  { id: 'record_label_interest', type: 'positive', text: 'Record label representative attended!', effect: { morale: 22, hype: 6 } },
  
  // Health Issues (6 events)
  { id: 'vocal_strain', type: 'negative', text: 'Vocal strain - had to cancel show!', effect: { money: -2000, morale: -15, fatigue: 10 } },
  { id: 'food_poisoning', type: 'negative', text: 'Food poisoning - band sick!', effect: { money: -1000, morale: -20, fatigue: 15 } },
  { id: 'exhaustion', type: 'negative', text: 'Complete exhaustion - need rest day!', effect: { money: -500, morale: -12, fatigue: 20 } },
  { id: 'injury', type: 'negative', text: 'Band member injured on stage!', effect: { money: -3000, morale: -18, fatigue: 12 } },
  { id: 'allergic_reaction', type: 'negative', text: 'Severe allergic reaction!', effect: { money: -1500, morale: -10, fatigue: 8 } },
  { id: 'mental_health_day', type: 'negative', text: 'Mental health - need break!', effect: { money: -800, morale: -15, fatigue: 10 } },
  
  // Positive Health Events (2 events)
  { id: 'energy_boost', type: 'positive', text: 'Unexpected energy surge!', effect: { morale: 15, fatigue: -15 } },
  { id: 'fan_care_package', type: 'positive', text: 'Fans sent amazing care package!', effect: { morale: 20, fatigue: -10 } }
];

const REGIONS = [
  'United States', 'Canada', 'UK', 'Europe', 'Asia', 'Latin America', 'Africa', 'Oceania'
];

const REGION_DEFAULT_CITY: Record<string, string> = {
  'United States': 'New York',
  'Canada': 'Toronto',
  'UK': 'London',
  'Europe': 'Berlin',
  'Asia': 'Tokyo',
  'Latin America': 'Sao Paulo',
  'Africa': 'Lagos',
  'Oceania': 'Sydney',
};

export function normalizeCityName(city: string): string {
  const aliases: Record<string, string> = {
    'São Paulo': 'Sao Paulo',
    'Bogotá': 'Bogota',
  };
  return aliases[city] ?? city;
}

// --- HELPER FUNCTIONS ---

/**
 * Compute per-show fillRate bonus and revenue modifier for a given tourMode.
 * solo: full revenue, no bonus
 * equal_coheadliner: 50% revenue, +0.10 fillRate bonus
 * partner_led: 30% revenue, +0.20 fillRate bonus
 */
function computeCoTourOutcomeModifiers(tourMode: string): { revenueModifier: number; fillRateBonus: number } {
  switch (tourMode) {
    case 'equal_coheadliner':
      return { revenueModifier: 0.50, fillRateBonus: 0.10 };
    case 'partner_led':
      return { revenueModifier: 0.30, fillRateBonus: 0.20 };
    case 'solo':
    default:
      return { revenueModifier: 1.00, fillRateBonus: 0.00 };
  }
}

function N(val: any): number { return Number(val) || 0; }

function resolveEventCity(region: string, preferredCity?: string | null): string {
  if (typeof preferredCity === 'string' && preferredCity.trim().length > 0) {
    return preferredCity.trim();
  }
  return REGION_DEFAULT_CITY[region] || region;
}

function computeTravelDaysBetweenStops(
  previousStop: { region: string; city: string | null } | null,
  nextStop: { region: string; city: string | null },
): number {
  if (!previousStop) return 0;
  if (previousStop.region !== nextStop.region) return 2;
  if (previousStop.city && nextStop.city && previousStop.city !== nextStop.city) return 1;
  return 0;
}

async function upsertTravelTurnEvent(event: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('turn_event_log')
    .upsert(event, { onConflict: 'player_id,global_turn_id,module,event_type' });
  if (error) throw error;
}

function getDefaultShowsForTourType(typeId: string): number {
  if (typeId === 'local_club') return 6;
  if (typeId === 'regional_circuit') return 10;
  return 20;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeDraftedRouteLaunchCost(baseCost: number, draftedStops: any[], draftedRegions: string[], defaultShows: number): number {
  if (!Array.isArray(draftedStops) || draftedStops.length === 0) return Math.round(baseCost);

  const avgVenueTier = draftedStops.reduce((sum: number, stop: any) => sum + Math.max(1, N(stop?.venueTier) || 1), 0) / draftedStops.length;
  const avgCapacity = draftedStops.reduce((sum: number, stop: any) => sum + Math.max(0, N(stop?.venueCapacity)), 0) / draftedStops.length;

  const stopScale = clampNumber(draftedStops.length / Math.max(1, defaultShows), 0.55, 1.65);
  const regionScale = 1 + Math.min(0.3, Math.max(0, draftedRegions.length - 1) * 0.06);
  const tierScale = 1 + Math.min(0.3, Math.max(0, avgVenueTier - 1) * 0.08);
  const capacityScale = 1 + Math.min(0.2, avgCapacity / 10000 * 0.2);

  return Math.round(baseCost * stopScale * regionScale * tierScale * capacityScale);
}

function buildInitialPrepState(startLeadTurns: number) {
  const recommendedPrepSlots = Math.max(2, Math.min(4, startLeadTurns));
  return {
    phase: 'prep',
    current_stop: 0,
    fatigue: 0,
    morale: 100,
    prep_countdown_turns_remaining: startLeadTurns,
    recommended_prep_slots: recommendedPrepSlots,
    prep_slots_used: 0,
    prep_readiness: {
      logistics: 0,
      promo: 0,
      show_readiness: 0,
    },
    prep_actions_taken: [],
    early_launch_penalties: {
      turnout_penalty: 0,
      fatigue_penalty: 0,
      quality_penalty: 0,
    },
  };
}

function mergePrepReadiness(baseReadiness: any = {}, delta: any = {}) {
  return {
    logistics: clampNumber(N(baseReadiness?.logistics) + N(delta?.logistics), 0, 100),
    promo: clampNumber(N(baseReadiness?.promo) + N(delta?.promo), 0, 100),
    show_readiness: clampNumber(N(baseReadiness?.show_readiness) + N(delta?.show_readiness), 0, 100),
  };
}

function computePrepPenaltyState(prepReadiness: any = {}) {
  const logistics = clampNumber(N(prepReadiness?.logistics), 0, 100);
  const promo = clampNumber(N(prepReadiness?.promo), 0, 100);
  const showReadiness = clampNumber(N(prepReadiness?.show_readiness), 0, 100);
  return {
    turnout_penalty: Math.max(0, Math.round((45 - promo) * 0.35)),
    fatigue_penalty: Math.max(0, Math.round((45 - logistics) * 0.2)),
    quality_penalty: Math.max(0, Math.round((45 - showReadiness) * 0.3)),
  };
}

const PREP_ACTIONS: Record<string, { cost: number; energy: number; readinessDelta: { logistics?: number; promo?: number; show_readiness?: number }; moraleDelta?: number; fatigueDelta?: number }> = {
  route_check: {
    cost: 1200,
    energy: 8,
    readinessDelta: { logistics: 28 },
  },
  promo_push: {
    cost: 2500,
    energy: 12,
    readinessDelta: { promo: 30 },
  },
  rehearse_set: {
    cost: 900,
    energy: 14,
    readinessDelta: { show_readiness: 26 },
    moraleDelta: 4,
  },
  crew_sync: {
    cost: 1500,
    energy: 10,
    readinessDelta: { logistics: 12, show_readiness: 14 },
    moraleDelta: 6,
  },
  recovery_day: {
    cost: 0,
    energy: 0,
    readinessDelta: { logistics: 8, show_readiness: 8 },
    moraleDelta: 10,
    fatigueDelta: -10,
  },
};

export async function runPrepAction(entities: any, artistId: string, tourId: string, prepActionId: string) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');
  const tour = await entities.Tour.get(tourId);
  if (!tour || tour.artist_id !== artistId) throw new Error('Tour not found');

  const actionConfig = PREP_ACTIONS[prepActionId];
  if (!actionConfig) throw new Error('Invalid prep action');

  const tourState = tour.state || {};
  if ((tourState.phase || 'live') !== 'prep') throw new Error('Tour is already live');

  const recommendedPrepSlots = Math.max(0, N(tourState.recommended_prep_slots));
  const prepSlotsUsed = Math.max(0, N(tourState.prep_slots_used));
  if (recommendedPrepSlots > 0 && prepSlotsUsed >= recommendedPrepSlots) {
    throw new Error('No prep slots remaining');
  }
  if (N(artist.income) < actionConfig.cost) throw new Error('Insufficient funds');
  if (N(artist.energy) < actionConfig.energy) throw new Error(`Need ${actionConfig.energy} energy (have ${N(artist.energy)})`);

  await entities.ArtistProfile.update(artistId, {
    income: N(artist.income) - actionConfig.cost,
    energy: N(artist.energy) - actionConfig.energy,
  });

  const nextReadiness = mergePrepReadiness(tourState.prep_readiness || {}, actionConfig.readinessDelta);
  const nextState = {
    ...tourState,
    phase: 'prep',
    morale: clampNumber(N(tourState.morale ?? 100) + N(actionConfig.moraleDelta), 0, 100),
    fatigue: clampNumber(N(tourState.fatigue ?? 0) + N(actionConfig.fatigueDelta), 0, 100),
    prep_slots_used: prepSlotsUsed + 1,
    prep_readiness: nextReadiness,
    prep_actions_taken: [
      ...(Array.isArray(tourState.prep_actions_taken) ? tourState.prep_actions_taken : []),
      {
        id: prepActionId,
        cost: actionConfig.cost,
        energy: actionConfig.energy,
        at: new Date().toISOString(),
      },
    ].slice(-12),
    early_launch_penalties: computePrepPenaltyState(nextReadiness),
  };

  await entities.Tour.update(tourId, {
    state: nextState,
    morale: nextState.morale,
    fatigue: nextState.fatigue,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    prepActionId,
    state: nextState,
  };
}

export async function launchPreparedTour(entities: any, artistId: string, tourId: string) {
  const tour = await entities.Tour.get(tourId);
  if (!tour || tour.artist_id !== artistId) throw new Error('Tour not found');

  const tourState = tour.state || {};
  if ((tourState.phase || 'live') !== 'prep') {
    return {
      success: true,
      phase: 'live',
      start_turn: tour.start_turn,
      state: tourState,
    };
  }

  const nextState = {
    ...tourState,
    phase: 'live',
    prep_countdown_turns_remaining: 0,
    early_launch_penalties: computePrepPenaltyState(tourState.prep_readiness || {}),
  };

  await entities.Tour.update(tourId, {
    start_turn: 0,
    state: nextState,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    phase: 'live',
    start_turn: 0,
    state: nextState,
  };
}

/**
 * Generate available route options based on artist profile
 * All 8 regions get Local Club Run, Regional Circuit, and National Headliner
 * Higher tour types (Arena, Stadium) unlock at higher career stages
 */
export async function generateRoutes(entities: any, artistId: string) {
  const artist = await entities.ArtistProfile.get(artistId);
  const stage = detectCareerStage(N((artist.fans ?? artist.followers)), N(artist.clout), N(artist.income), !!artist.has_label);
  
  const options = [];
  
  // Logic to determine which tour types are unlocked
  const stages = ['Unknown', 'Local Artist', 'Local Buzz', 'Underground Artist', 'Cult Favorite', 'Breakout Artist', 'Mainstream Artist', 'A-List Star', 'Global Superstar', 'Legacy Icon'];
  const currentStageIdx = stages.indexOf(stage);

  // Define which tour types are available for all regions vs restricted
  // Local Club Run, Regional Circuit, National Headliner = available for ALL 8 regions
  // Arena Tour, Stadium Tour = unlock based on career stage
  const universalTourTypes = ['local_club', 'regional_circuit', 'national_headliner'];

  for (const [typeId, config] of Object.entries(TOUR_TYPES)) {
    // Check if artist has unlocked this tour type based on career stage
    if (currentStageIdx >= stages.indexOf(config.min_stage)) {
      
      // Determine which regions are available for this tour type
      let availableRegions: string[];
      
      if (universalTourTypes.includes(typeId)) {
        // Local Club, Regional Circuit, National Headliner = ALL 8 regions always
        availableRegions = [...REGIONS];
      } else {
        // Arena and Stadium tours unlock regions progressively
        // Underground Artist: Home region + 2 others
        // Mainstream Artist: 5 regions
        // Global Superstar+: All regions
        let unlockedCount = 3;
        if (currentStageIdx >= 6) unlockedCount = 5; // Mainstream Artist (index 6)
        if (currentStageIdx >= 8) unlockedCount = REGIONS.length; // Global Superstar (index 8)
        availableRegions = REGIONS.slice(0, unlockedCount);
      }
      
      for (const region of availableRegions) {
        options.push({
          id: `${typeId}_${region.toLowerCase().replace(/ /g, '_')}`,
          name: `${config.name} (${region})`,
          type: typeId,
          region: region,
          base_cost: config.base_cost,
          estimated_shows: typeId === 'local_club' ? 6 : (typeId === 'regional_circuit' ? 10 : 20),
          description: `Tour through ${region} via ${config.name}`
        });
      }
    }
  }
  
  return options;
}

/**
 * Create a new tour
 */
export async function createTour(entities: any, artistId: string, routeId: string, setlist: string[], strategy: any, customTourName?: string, selectedMerch?: string[], categoryId?: string, selectedCrew?: any[], selectedSponsor?: any, openingActDrafts: any[] = [], coHeadlinerDraft: any = null) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  // Get current turn for scheduling
  const turnStates = await entities.TurnState.list('-id', 1);
  const currentTurn = turnStates[0]?.global_turn_id || 0;
  const startLeadTurns = Math.max(1, N(strategy?.startDateOffset) || 1);
  const startTurn = currentTurn + startLeadTurns;
  const normalizedOpeningActDrafts = Array.isArray(openingActDrafts)
    ? openingActDrafts
        .filter((draft: any) => draft?.opener_id && draft.opener_id !== artistId)
        .map((draft: any) => ({
          opener_id: draft.opener_id,
          revenue_split: Math.max(0.05, Math.min(0.50, N(draft.revenue_split) || 0.20)),
          candidate_snapshot: draft.candidate_snapshot || null,
        }))
    : [];

  const routeParts = routeId.split('_');
  // Handle multi-word regions (e.g. united_states, latin_america)
  // typeId is everything before the last known region part... actually routeId construction was `${typeId}_${region}`
  // Let's rely on finding the matching region first.
  
  let region = 'United States';
  let typeId = 'local_club';
  
  // Try to match known regions at the end of the string
  for (const r of REGIONS) {
      const slug = r.toLowerCase().replace(' ', '_');
      if (routeId.endsWith(slug)) {
          region = r;
          typeId = routeId.substring(0, routeId.length - slug.length - 1); // -1 for the underscore
          break;
      }
  }

  // Find config
  let config = (TOUR_TYPES as any)[typeId];
  if (!config) config = TOUR_TYPES['local_club']; // Fallback
  const draftedStops = flattenRouteBuilderStops(strategy?.routeBuilderDraft);
  const hasDraftedRoute = draftedStops.length > 0;
  const draftedRegions = Array.from(new Set(draftedStops.map((stop: any) => stop?.regionName).filter(Boolean)));
  const primaryRegion = hasDraftedRoute ? draftedRegions[0] || region : region;
  const defaultShows = getDefaultShowsForTourType(typeId);
  const cost = hasDraftedRoute
    ? computeDraftedRouteLaunchCost(config.base_cost, draftedStops, draftedRegions, defaultShows)
    : config.base_cost;
  if (N(artist.income) < cost) throw new Error('Insufficient funds');

  // Deduct cost
  await entities.ArtistProfile.update(artistId, {
    income: N(artist.income) - cost
  });

  // Calculate shows count based on tour type
  const showsCount = hasDraftedRoute
    ? draftedStops.length
    : defaultShows;
  let scheduledSpanTurns = showsCount;
  
  // Link tour to active era if one exists
  let activeEraId: string | null = null;
  try {
    const eras = await entities.Era.filter({ artist_id: artistId, is_active: true });
    if (eras?.[0]?.id) activeEraId = eras[0].id;
  } catch (_e) { /* non-critical */ }

  // Create Tour - only include columns that exist in the schema
  const tour = await entities.Tour.create({
    artist_id: artistId,
    tour_name: customTourName || `${artist.artist_name || 'Artist'}'s ${config.name}`,
    tour_type: typeId,
    region: primaryRegion,
    status: 'active',
    start_turn: startTurn,
    era_id: activeEraId,
    turns_total: showsCount,
    turns_remaining: showsCount,
    total_stops: showsCount,
    total_shows: showsCount,
    shows_completed: 0,
    base_cost: cost,
    hype_boost: Math.floor(config.hype_mult * 10),
    fatigue_per_turn: config.fatigue_per_turn,
    follower_multiplier: 1.0,
    ticket_price: strategy?.ticketPrice || 25,
    estimated_revenue: 0,
    actual_revenue: 0,
    setlist: setlist || [],
    strategy: strategy || {},
    tour_category: categoryId || 'standard_run',
    // Store selected_merch in metadata since column doesn't exist
    metadata: {
      selected_merch: selectedMerch || [],
      opening_act_drafts: normalizedOpeningActDrafts,
      co_headliner_draft: coHeadlinerDraft || null,
      route_builder_draft: strategy?.routeBuilderDraft || null,
      drafted_regions: draftedRegions,
      route_builder_sequence: Array.isArray(strategy?.routeBuilderSequence) ? strategy.routeBuilderSequence : draftedRegions,
      prep_countdown_turns: startLeadTurns,
      launch_cost_breakdown: {
        pricing_model: hasDraftedRoute ? 'drafted_route_scaled' : 'legacy_flat',
        default_show_count: defaultShows,
        drafted_stop_count: draftedStops.length,
        drafted_region_count: draftedRegions.length,
      },
    },
    transport_tier: strategy?.transportTier || 'cargo_van',
    ticket_tiers: strategy?.ticketTiers || { ga: 25 },
    ticket_sell_types: strategy?.ticketSellTypes || ['presale'],
    state: buildInitialPrepState(startLeadTurns),
    stats: { revenue: 0, attendance: 0 },
    completed_stops: 0,
    total_gross_revenue: 0,
    total_net_revenue: 0,
    total_attendance: 0,
    total_merch_revenue: 0,
    fatigue: 0,
    morale: 100,
    regions_count: hasDraftedRoute ? draftedRegions.length : 1
  });

  // Generate Gigs for this tour
  // Calculate Setlist Power
  let setlistPower = 0;
  if (setlist && setlist.length > 0) {
    // Fetch songs to get quality/popularity
    // Note: This assumes setlist is array of UUIDs
    try {
      const songs = await entities.Song.filter({ id: setlist });
      setlistPower = songs.reduce((sum: number, s: any) => sum + (N(s.quality) + N(s.popularity)) / 2, 0);
      
      // Bonus for current era songs? We'd need to know the current era.
      // For now, raw quality/pop is a good proxy.
      setlistPower = Math.floor(setlistPower / Math.max(1, songs.length)) * (1 + (songs.length * 0.05)); // Avg * length bonus
    } catch (e) {
      console.error('Error calculating setlist power:', e);
      setlistPower = setlist.length * 50; // Fallback
    }
  }

  // Create gigs (schedule them)
  if (hasDraftedRoute) {
    scheduledSpanTurns = await generateDraftRouteGigs(
      entities,
      artistId,
      tour.id,
      draftedStops,
      strategy?.ticketPrice || 25,
      startTurn,
      startLeadTurns
    );
  } else {
    const venueType = typeId === 'local_club' ? 'club' : (typeId === 'arena_tour' ? 'arena' : 'theater');
    let venues = await entities.Venue.filter({ 
      region: region,
      venue_type: venueType
    });
    if (venues.length === 0) {
      const artistGenre = artist.genre || '';
      if (artistGenre) {
        venues = await entities.Venue.filter({ 
          venue_type: venueType
        }).then((allVenues: any[]) => {
          return allVenues.filter((venue: any) => {
            const genreBias = venue.genre_bias || [];
            return Array.isArray(genreBias) && genreBias.includes(artistGenre);
          });
        });
      }
    }
    if (venues.length === 0) {
      venues = await entities.Venue.filter({ region: region });
    }
    let scheduleCursor = startTurn;
    let previousStop: { region: string; city: string | null } | null = null;
    for (let i = 0; i < showsCount; i++) {
      const venue = venues[i % venues.length] || { 
        id: null, 
        name: 'Local Venue', 
        city: 'City ' + (i+1), 
        capacity: 200, 
        base_cost: 100 
      };

      const gigCity = venue.city || resolveEventCity(region, artist.current_city);
      const currentStop = { region, city: gigCity };
      const travelDays = computeTravelDaysBetweenStops(previousStop, currentStop);
      scheduleCursor += travelDays;

      const gigDate = new Date();
      gigDate.setDate(gigDate.getDate() + startLeadTurns + (scheduleCursor - startTurn));

      await entities.Gig.create({
        artist_id: artistId,
        tour_id: tour.id,
        venue_id: venue.id,
        venue_name: venue.name,
        city: gigCity,
        region: region,
        capacity: venue.capacity || 200,
        ticket_price: strategy?.ticketPrice || 25, 
        status: 'Booked',
        gig_type: 'concert',
        scheduled_turn: scheduleCursor,
        scheduled_date: gigDate.toISOString(),
        base_cost: venue.base_cost || 100,
        tickets_sold: 0,
        gross_revenue: 0,
        expenses: 0,
        net_revenue: 0,
        merch_revenue: 0,
        fan_gain: 0,
        hype_gain: 0,
        energy_cost: 0,
        fatigue_added: 0,
        clout_gain: 0,
        income_earned: 0,
        merch_sales_enabled: true,
        merch_revenue_earned: 0,
        metadata: {
          travel_days_from_previous: travelDays,
        }
      });

      scheduleCursor += 1;
      previousStop = currentStop;
    }
    scheduledSpanTurns = Math.max(1, scheduleCursor - startTurn);
  }
  
  // Persist selected crew members
  if (selectedCrew && selectedCrew.length > 0) {
    for (const crew of selectedCrew) {
      try {
        await supabaseAdmin
          .from('tour_crew_members')
          .insert({
            tour_id: tour.id,
            artist_id: artistId,
            name: crew.name,
            specialty: crew.specialty,
            quality: crew.quality || 50,
            morale: crew.morale || 70,
            salary_per_turn: crew.salary_per_turn || 100,
            contract_status: 'active',
            hired_turn: currentTurn,
            metadata: crew.metadata || {},
          });
      } catch (e) { tourDebug('Failed to insert crew member:', e); }
    }
  }

  // Persist selected sponsor
  if (selectedSponsor) {
    try {
      await supabaseAdmin
        .from('tour_sponsorships')
        .insert({
          tour_id: tour.id,
          artist_id: artistId,
          brand_name: selectedSponsor.brand_name || selectedSponsor.name,
          payout: selectedSponsor.payout || 0,
          alignment_tags: selectedSponsor.alignment_tags || [],
          essence_weights: selectedSponsor.essence_weights || {},
          clash_risk: selectedSponsor.clash_risk || 0.10,
          status: 'active',
          metadata: selectedSponsor.metadata || {},
        });
    } catch (e) { tourDebug('Failed to insert sponsorship:', e); }
  }

  if (normalizedOpeningActDrafts.length > 0) {
    for (const draft of normalizedOpeningActDrafts) {
      try {
        const { data: inviteRow, error: inviteError } = await supabaseAdmin
          .from('tour_opening_acts')
          .insert({
            tour_id: tour.id,
            headliner_id: artistId,
            opener_id: draft.opener_id,
            status: 'pending',
            revenue_split: draft.revenue_split,
            attendance_boost: 1.10,
            fan_crossover_rate: 0.05,
            metadata: { candidate_snapshot: draft.candidate_snapshot || null, source: 'tour_creation_wizard' },
          })
          .select('id')
          .single();
        if (inviteError) throw inviteError;
        await supabaseAdmin
          .from('notifications')
          .upsert({
            player_id: draft.opener_id,
            type: 'TOUR_INVITE',
            title: 'Opening Act Invitation!',
            subtitle: `You've been invited to open for ${tour.tour_name}.`,
            body: `Revenue split: ${Math.round(draft.revenue_split * 100)}%. Accept or decline from your touring page.`,
            priority: 'high',
            metrics: { tour_id: tour.id, invitation_id: inviteRow?.id || null, revenue_split: draft.revenue_split },
            deep_links: { page: 'Career', params: { openApp: 'touring' } },
            idempotency_key: `tour_invite:${tour.id}:${draft.opener_id}`,
          }, {
            onConflict: 'idempotency_key',
            ignoreDuplicates: true,
          });
        } catch (e) { tourDebug('Failed to create opening act invite:', e); }
    }
  }

  // Co-headliner invite
  if (coHeadlinerDraft?.co_headliner_id) {
    try {
      const coRole = strategy?.tourMode === 'partner_led' ? 'partner_led' : 'equal_coheadliner';
      const coRevSplit = coRole === 'partner_led' ? 0.30 : 0.50;
      const coAttBoost = coRole === 'partner_led' ? 1.20 : 1.10;
      const { data: coInviteRow, error: coInviteError } = await supabaseAdmin
        .from('tour_opening_acts')
        .insert({
          tour_id: tour.id,
          headliner_id: artistId,
          opener_id: coHeadlinerDraft.co_headliner_id,
          status: 'pending',
          revenue_split: coRevSplit,
          attendance_boost: coAttBoost,
          fan_crossover_rate: 0.10,
          metadata: {
            candidate_snapshot: coHeadlinerDraft.candidate_snapshot || null,
            role: coRole,
            source: 'co_headliner_draft',
          },
        })
        .select('id')
        .single();
      if (coInviteError) throw coInviteError;
      await supabaseAdmin
        .from('notifications')
        .upsert({
          player_id: coHeadlinerDraft.co_headliner_id,
          type: 'TOUR_INVITE',
          title: coRole === 'partner_led' ? 'Partner Tour Invitation!' : 'Co-Headliner Invitation!',
          subtitle: coRole === 'partner_led'
            ? `You've been invited as partner headliner on ${tour.tour_name}.`
            : `You've been invited to co-headline ${tour.tour_name}.`,
          body: `${coRole === 'equal_coheadliner' ? 'Equal split' : 'Partner arrangement'}: ${Math.round(coRevSplit * 100)}% revenue. Accept or decline from your touring page.`,
          priority: 'high',
          metrics: { tour_id: tour.id, invitation_id: coInviteRow?.id || null, revenue_split: coRevSplit, role: coRole },
          deep_links: { page: 'Career', params: { openApp: 'touring' } },
          idempotency_key: `co_headliner_invite:${tour.id}:${coHeadlinerDraft.co_headliner_id}`,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
    } catch (e) { tourDebug('Failed to create co-headliner invite:', e); }
  }

  // Save computed power to tour state/stats
  // We can use the 'stats' jsonb column for this metadata
  await entities.Tour.update(tour.id, {
    stats: { 
      ...tour.stats, 
      setlist_power: setlistPower,
      initial_ticket_price: strategy.ticketPrice || 25
    },
    turns_total: scheduledSpanTurns,
    turns_remaining: scheduledSpanTurns,
    total_stops: scheduledSpanTurns
  });

  return {
    ...tour,
    turns_total: scheduledSpanTurns,
    turns_remaining: scheduledSpanTurns,
  };
}

// ─── Helper: resolve routeId → { region, typeId, config } ────────────────────

function resolveRoute(routeId: string): { region: string; typeId: string; config: any } {
  let region = 'United States';
  let typeId = 'local_club';
  for (const r of REGIONS) {
    const slug = r.toLowerCase().replace(/ /g, '_');
    if (routeId.endsWith(slug)) {
      region = r;
      typeId = routeId.substring(0, routeId.length - slug.length - 1);
      break;
    }
  }
  let config = (TOUR_TYPES as any)[typeId];
  if (!config) config = TOUR_TYPES['local_club'];
  return { region, typeId, config };
}

// ─── Helper: generate gigs for one leg ───────────────────────────────────────

async function generateLegGigs(
  entities: any,
  artistId: string,
  tourId: string,
  region: string,
  typeId: string,
  config: any,
  showsCount: number,
  ticketPrice: number,
  startTurn: number,
  legOffset: number,
  artistGenre: string,
  startLeadTurns: number,
  scheduleCursor: number,
  previousStop: { region: string; city: string | null } | null,
): Promise<{ nextScheduleCursor: number; lastStop: { region: string; city: string | null } | null }> {
  const venueType = typeId === 'local_club' ? 'club' : (typeId === 'arena_tour' ? 'arena' : 'theater');
  let venues = await entities.Venue.filter({ region, venue_type: venueType });
  if (venues.length === 0 && artistGenre) {
    const all = await entities.Venue.filter({ venue_type: venueType });
    venues = all.filter((v: any) => Array.isArray(v.genre_bias) && v.genre_bias.includes(artistGenre));
  }
  if (venues.length === 0) venues = await entities.Venue.filter({ region });

  for (let i = 0; i < showsCount; i++) {
    const venue = venues[i % venues.length] || {
      id: null, name: 'Local Venue', city: `${region} City ${i + 1}`, capacity: 200, base_cost: 100,
    };

    const gigCity = venue.city || resolveEventCity(region);
    const currentStop = { region, city: gigCity };
    const travelDays = computeTravelDaysBetweenStops(previousStop, currentStop);
    scheduleCursor += travelDays;

    const gigDate = new Date();
    gigDate.setDate(gigDate.getDate() + startLeadTurns + (scheduleCursor - startTurn));
    await entities.Gig.create({
      artist_id: artistId,
      tour_id: tourId,
      venue_id: venue.id,
      venue_name: venue.name,
      city: gigCity,
      region,
      capacity: venue.capacity || 200,
      ticket_price: ticketPrice,
      status: 'Booked',
      gig_type: 'concert',
      scheduled_turn: scheduleCursor,
      scheduled_date: gigDate.toISOString(),
      base_cost: venue.base_cost || 100,
      tickets_sold: 0,
      gross_revenue: 0,
      expenses: 0,
      net_revenue: 0,
      merch_revenue: 0,
      fan_gain: 0,
      hype_gain: 0,
      energy_cost: 0,
      fatigue_added: 0,
      clout_gain: 0,
      income_earned: 0,
      merch_sales_enabled: true,
      merch_revenue_earned: 0,
      metadata: {
        leg_region: region,
        leg_offset: legOffset,
        travel_days_from_previous: travelDays,
      },
    });

    scheduleCursor += 1;
    previousStop = currentStop;
  }

  return {
    nextScheduleCursor: scheduleCursor,
    lastStop: previousStop,
  };
}

function flattenRouteBuilderStops(routeBuilderDraft: any): any[] {
  const routeRegions = Array.isArray(routeBuilderDraft?.routeRegions) ? routeBuilderDraft.routeRegions : [];
  return routeRegions.flatMap((routeRegion: any, regionIndex: number) => {
    const cityStops = Array.isArray(routeRegion?.cityStops) ? routeRegion.cityStops : [];
    return cityStops.map((stop: any, stopIndex: number) => ({
      ...stop,
      regionName: stop?.regionName || routeRegion?.regionName || 'United States',
      regionIndex,
      stopIndex,
    }));
  });
}

async function generateDraftRouteGigs(
  entities: any,
  artistId: string,
  tourId: string,
  draftedStops: any[],
  ticketPrice: number,
  startTurn: number,
  startLeadTurns: number,
): Promise<number> {
  const venueIds = Array.from(new Set(draftedStops.map((stop: any) => stop?.venueId).filter(Boolean)));
  const venueMap = new Map<string, any>();
  if (venueIds.length > 0) {
    const venueRows = await entities.Venue.filter({ id: venueIds });
    for (const venue of venueRows || []) {
      if (venue?.id) venueMap.set(venue.id, venue);
    }
  }

  let scheduleCursor = startTurn;
  let previousStop: { region: string; city: string | null } | null = null;

  for (let i = 0; i < draftedStops.length; i++) {
    const stop = draftedStops[i] || {};
    const venue = stop?.venueId ? venueMap.get(stop.venueId) : null;
    const stopRegion = stop?.regionName || venue?.region || 'United States';
    const stopCity = venue?.city || stop?.cityName || resolveEventCity(stopRegion);
    const currentStop = { region: stopRegion, city: stopCity };
    const travelDays = computeTravelDaysBetweenStops(previousStop, currentStop);
    scheduleCursor += travelDays;

    const gigDate = new Date();
    gigDate.setDate(gigDate.getDate() + startLeadTurns + (scheduleCursor - startTurn));
    await entities.Gig.create({
      artist_id: artistId,
      tour_id: tourId,
      venue_id: venue?.id || stop?.venueId || null,
      venue_name: venue?.name || stop?.venueName || 'Local Venue',
      city: stopCity,
      region: stopRegion,
      capacity: venue?.capacity || stop?.venueCapacity || 200,
      ticket_price: ticketPrice,
      status: 'Booked',
      gig_type: 'concert',
      scheduled_turn: scheduleCursor,
      scheduled_date: gigDate.toISOString(),
      base_cost: venue?.base_cost || 100,
      tickets_sold: 0,
      gross_revenue: 0,
      expenses: 0,
      net_revenue: 0,
      merch_revenue: 0,
      fan_gain: 0,
      hype_gain: 0,
      energy_cost: 0,
      fatigue_added: 0,
      clout_gain: 0,
      income_earned: 0,
      merch_sales_enabled: true,
      merch_revenue_earned: 0,
      metadata: {
        route_builder_stop_id: stop?.id || null,
        route_builder_region_index: stop?.regionIndex ?? null,
        route_builder_stop_index: stop?.stopIndex ?? null,
        venue_tier: stop?.venueTier || null,
        venue_type: stop?.venueType || null,
        travel_days_from_previous: travelDays,
      }
    });

    scheduleCursor += 1;
    previousStop = currentStop;
  }

  return Math.max(1, scheduleCursor - startTurn);
}

/**
 * Create a multi-leg (Global Takeover) tour.
 * Each routeId is one leg; all legs share one Tour record with sequential gig scheduling.
 */
export async function createMultiLegTour(
  entities: any,
  artistId: string,
  routeIds: string[],
  setlist: string[],
  strategy: any,
  customTourName?: string,
  selectedMerch?: string[],
  categoryId?: string,
  selectedCrew?: any[],
  selectedSponsor?: any,
  openingActDrafts: any[] = [],
  coHeadlinerDraft: any = null,
): Promise<any> {
  if (!routeIds || routeIds.length === 0) throw new Error('No route IDs provided for multi-leg tour');

  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const turnStates = await entities.TurnState.list('-id', 1);
  const currentTurn = turnStates[0]?.global_turn_id || 0;
  const startLeadTurns = Math.max(1, N(strategy?.startDateOffset) || 1);
  const startTurn = currentTurn + startLeadTurns;

  // Resolve all legs and compute aggregates
  const legs = routeIds.map(resolveRoute);
  const draftedStops = flattenRouteBuilderStops(strategy?.routeBuilderDraft);
  const totalCost = legs.reduce((sum, leg) => {
    const draftedLegStops = draftedStops.filter((stop: any) => stop?.regionName === leg.region);
    const defaultShows = getDefaultShowsForTourType(leg.typeId);
    const legCost = draftedLegStops.length > 0
      ? computeDraftedRouteLaunchCost(leg.config.base_cost, draftedLegStops, [leg.region], defaultShows)
      : leg.config.base_cost;
    return sum + legCost;
  }, 0);
  const totalShows = legs.reduce((s, l) => {
    const shows = getDefaultShowsForTourType(l.typeId);
    return s + shows;
  }, 0);
  const regions = Array.from(new Set(legs.map((l) => l.region)));
  const primaryLeg = legs[0];

  if (N(artist.income) < totalCost) throw new Error(`Insufficient funds — need $${totalCost.toLocaleString()} for all ${legs.length} legs`);

  // Deduct full cost upfront
  await entities.ArtistProfile.update(artistId, { income: N(artist.income) - totalCost });

  // Link to active era
  let activeEraId: string | null = null;
  try {
    const eras = await entities.Era.filter({ artist_id: artistId, is_active: true });
    if (eras?.[0]?.id) activeEraId = eras[0].id;
  } catch (_e) { /* non-critical */ }

  const normalizedOpeningActDrafts = Array.isArray(openingActDrafts)
    ? openingActDrafts
        .filter((d: any) => d?.opener_id && d.opener_id !== artistId)
        .map((d: any) => ({
          opener_id: d.opener_id,
          revenue_split: Math.max(0.05, Math.min(0.50, N(d.revenue_split) || 0.20)),
          candidate_snapshot: d.candidate_snapshot || null,
        }))
    : [];

  // Create single Tour record
  const tour = await entities.Tour.create({
    artist_id: artistId,
    tour_name: customTourName || `${artist.artist_name || 'Artist'}'s Global Takeover`,
    tour_type: primaryLeg.typeId,
    region: primaryLeg.region,
    status: 'active',
    start_turn: startTurn,
    era_id: activeEraId,
    turns_total: totalShows,
    turns_remaining: totalShows,
    total_stops: totalShows,
    total_shows: totalShows,
    shows_completed: 0,
    base_cost: totalCost,
    hype_boost: Math.floor(primaryLeg.config.hype_mult * 10 * legs.length),
    fatigue_per_turn: Math.max(...legs.map((l) => l.config.fatigue_per_turn)),
    follower_multiplier: 1.0,
    ticket_price: strategy?.ticketPrice || 25,
    estimated_revenue: 0,
    actual_revenue: 0,
    setlist: setlist || [],
    strategy: strategy || {},
    tour_category: categoryId || 'global_takeover',
    metadata: {
      selected_merch: selectedMerch || [],
      opening_act_drafts: normalizedOpeningActDrafts,
      co_headliner_draft: coHeadlinerDraft || null,
      multi_leg: true,
      leg_regions: regions,
      leg_route_ids: routeIds,
      route_builder_draft: strategy?.routeBuilderDraft || null,
      drafted_regions: draftedStops.length > 0 ? Array.from(new Set(draftedStops.map((stop: any) => stop?.regionName).filter(Boolean))) : regions,
      route_builder_sequence: Array.isArray(strategy?.routeBuilderSequence) ? strategy.routeBuilderSequence : regions,
      launch_cost_breakdown: {
        pricing_model: draftedStops.length > 0 ? 'drafted_route_scaled' : 'legacy_flat',
        drafted_stop_count: draftedStops.length,
        drafted_region_count: draftedStops.length > 0 ? Array.from(new Set(draftedStops.map((stop: any) => stop?.regionName).filter(Boolean))).length : regions.length,
        leg_count: legs.length,
      },
    },
    state: { current_stop: 0, fatigue: 0, morale: 100, current_leg: 0 },
    stats: { revenue: 0, attendance: 0, setlist_power: 0, initial_ticket_price: strategy?.ticketPrice || 25 },
    completed_stops: 0,
    total_gross_revenue: 0,
    total_net_revenue: 0,
    total_attendance: 0,
    total_merch_revenue: 0,
    fatigue: 0,
    morale: 100,
    regions_count: regions.length,
  });

  // Generate gigs for each leg sequentially
  let legOffset = 0;
  let scheduleCursor = startTurn;
  let previousStop: { region: string; city: string | null } | null = null;
  const artistGenre = artist.genre || '';
  for (const leg of legs) {
    const shows = getDefaultShowsForTourType(leg.typeId);
    const legSchedule = await generateLegGigs(
      entities,
      artistId,
      tour.id,
      leg.region,
      leg.typeId,
      leg.config,
      shows,
      strategy?.ticketPrice || 25,
      startTurn,
      legOffset,
      artistGenre,
      startLeadTurns,
      scheduleCursor,
      previousStop,
    );
    scheduleCursor = legSchedule.nextScheduleCursor;
    previousStop = legSchedule.lastStop;
    legOffset += shows;
  }
  const scheduledSpanTurns = Math.max(1, scheduleCursor - startTurn);

  // Persist crew
  if (selectedCrew && selectedCrew.length > 0) {
    for (const crew of selectedCrew) {
      try {
        await supabaseAdmin.from('tour_crew_members').insert({
          tour_id: tour.id,
          artist_id: artistId,
          name: crew.name,
          specialty: crew.specialty,
          quality: crew.quality || 50,
          morale: crew.morale || 70,
          salary_per_turn: crew.salary_per_turn || 100,
          contract_status: 'active',
          hired_turn: currentTurn,
          metadata: crew.metadata || {},
        });
      } catch (e) { tourDebug('Failed to insert crew member:', e); }
    }
  }

  // Persist sponsor
  if (selectedSponsor) {
    try {
      await supabaseAdmin.from('tour_sponsorships').insert({
        tour_id: tour.id,
        artist_id: artistId,
        brand_name: selectedSponsor.brand_name || selectedSponsor.name,
        payout: selectedSponsor.payout || 0,
        alignment_tags: selectedSponsor.alignment_tags || [],
        essence_weights: selectedSponsor.essence_weights || {},
        clash_risk: selectedSponsor.clash_risk || 0.10,
        status: 'active',
        metadata: selectedSponsor.metadata || {},
      });
    } catch (e) { tourDebug('Failed to insert sponsorship:', e); }
  }

  // Opening act invites
  for (const draft of normalizedOpeningActDrafts) {
    try {
      const { data: inviteRow, error: inviteError } = await supabaseAdmin
        .from('tour_opening_acts')
        .insert({
          tour_id: tour.id,
          headliner_id: artistId,
          opener_id: draft.opener_id,
          status: 'pending',
          revenue_split: draft.revenue_split,
          attendance_boost: 1.10,
          fan_crossover_rate: 0.05,
          metadata: { candidate_snapshot: draft.candidate_snapshot || null, source: 'global_tour_wizard' },
        })
        .select('id')
        .single();
      if (inviteError) throw inviteError;
      await insertNotificationIdempotent(supabaseAdmin, {
        player_id: draft.opener_id,
        type: 'TOUR_INVITE',
        title: 'Global Tour Opening Act Invitation!',
        subtitle: `You've been invited to open for ${tour.tour_name} (${regions.length} regions).`,
        body: `Revenue split: ${Math.round(draft.revenue_split * 100)}%. Accept or decline from your touring page.`,
        priority: 'high',
        metrics: { tour_id: tour.id, invitation_id: inviteRow?.id || null, revenue_split: draft.revenue_split },
        deep_links: { page: 'Career', params: { openApp: 'touring' } },
        idempotency_key: `tour_invite:${tour.id}:${draft.opener_id}`,
      }, 'touringManager.invite');
    } catch (e) { tourDebug('Failed to create opening act invite:', e); }
  }

  // Co-headliner invite
  if (coHeadlinerDraft?.co_headliner_id) {
    try {
      const coRole = strategy?.tourMode === 'partner_led' ? 'partner_led' : 'equal_coheadliner';
      const coRevSplit = coRole === 'partner_led' ? 0.30 : 0.50;
      const coAttBoost = coRole === 'partner_led' ? 1.20 : 1.10;
      const { data: coInviteRow, error: coInviteError } = await supabaseAdmin
        .from('tour_opening_acts')
        .insert({
          tour_id: tour.id,
          headliner_id: artistId,
          opener_id: coHeadlinerDraft.co_headliner_id,
          status: 'pending',
          revenue_split: coRevSplit,
          attendance_boost: coAttBoost,
          fan_crossover_rate: 0.10,
          metadata: {
            candidate_snapshot: coHeadlinerDraft.candidate_snapshot || null,
            role: coRole,
            source: 'co_headliner_draft',
          },
        })
        .select('id')
        .single();
      if (coInviteError) throw coInviteError;
      await insertNotificationIdempotent(supabaseAdmin, {
        player_id: coHeadlinerDraft.co_headliner_id,
        type: 'TOUR_INVITE',
        title: coRole === 'partner_led' ? 'Partner Tour Invitation!' : 'Co-Headliner Invitation!',
        subtitle: coRole === 'partner_led'
          ? `You've been invited as partner headliner on ${tour.tour_name} (${regions.length} regions).`
          : `You've been invited to co-headline ${tour.tour_name} (${regions.length} regions).`,
        body: `${coRole === 'equal_coheadliner' ? 'Equal split' : 'Partner arrangement'}: ${Math.round(coRevSplit * 100)}% revenue. Accept or decline from your touring page.`,
        priority: 'high',
        metrics: { tour_id: tour.id, invitation_id: coInviteRow?.id || null, revenue_split: coRevSplit, role: coRole },
        deep_links: { page: 'Career', params: { openApp: 'touring' } },
        idempotency_key: `co_headliner_invite:${tour.id}:${coHeadlinerDraft.co_headliner_id}`,
      }, 'touringManager.coHeadlinerInvite');
    } catch (e) { tourDebug('Failed to create co-headliner invite (multi-leg):', e); }
  }

  await entities.Tour.update(tour.id, {
    turns_total: scheduledSpanTurns,
    turns_remaining: scheduledSpanTurns,
    total_stops: scheduledSpanTurns,
  });

  return {
    ...tour,
    turns_total: scheduledSpanTurns,
    turns_remaining: scheduledSpanTurns,
  };
}

/**
 * Handle player travel between regions
 */
export async function travelToRegion(entities: any, artistId: string, destinationId: string) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');
  const globalTurnId = await getCurrentGlobalTurnId(entities);

  // Base costs for all regions — home region gets free travel dynamically
  const BASE_DESTINATIONS: any = {
    "us": { name: "United States", baseCost: 2000, unlockFollowers: 3000 },
    "ca": { name: "Canada", baseCost: 1000, unlockFollowers: 2000 },
    "uk": { name: "UK", baseCost: 2500, unlockFollowers: 4000 },
    "eu": { name: "Europe", baseCost: 3000, unlockFollowers: 5000 },
    "asia": { name: "Asia", baseCost: 5000, unlockFollowers: 15000 },
    "latam": { name: "Latin America", baseCost: 2500, unlockFollowers: 8000 },
    "africa": { name: "Africa", baseCost: 4000, unlockFollowers: 10000 },
    "oceania": { name: "Oceania", baseCost: 4500, unlockFollowers: 12000 },
  };

  const dest = BASE_DESTINATIONS[destinationId];
  if (!dest) throw new Error('Invalid destination');

  // Calculate travel cost based on distance between regions
  const travelCost = calculateDistanceCost(artist.region, dest.name);
  const requiredFollowers = dest.unlockFollowers; // Always require followers

  if (artist.region === dest.name) {
    throw new Error('Already in this region');
  }
  if (N((artist.fans ?? artist.followers)) < requiredFollowers) throw new Error('Region locked: insufficient followers');
  if (N(artist.income) < travelCost) throw new Error('Insufficient funds for travel');

  const updates = {
    region: dest.name,
    current_city: null,
    income: N(artist.income) - travelCost,
    hype: Math.min(100, N(artist.hype) + 3), // Travel boost
    updated_at: new Date().toISOString()
  };

  await entities.ArtistProfile.update(artistId, updates);

  // Create event log entry
  await upsertTravelTurnEvent({
    player_id: artistId,
    global_turn_id: globalTurnId,
    module: 'touring',
    event_type: 'travel',
    description: `Traveled from ${artist.region} to ${dest.name}`,
    metadata: {
      from_region: artist.region,
      to_region: dest.name,
      cost: travelCost,
      new_hype: updates.hype,
      turn_id: globalTurnId,
      occurred_at: new Date().toISOString(),
    }
  });

  return { ...updates };
}

/**
 * Set the player's current city within their current region.
 * No monetary cost. Deducts 2 energy. Validates city belongs to current region.
 */
export async function setCurrentCity(
  entities: any,
  artistId: string,
  destinationCity: string,
): Promise<{
  previous_city: string | null;
  current_city: string;
  current_region: string;
  energy: number;
  energy_cost: number;
}> {
  const ENERGY_COST = 2;
  const globalTurnId = await getCurrentGlobalTurnId(entities);
  // Normalize city name at lookup boundary
  destinationCity = normalizeCityName(destinationCity);

  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const currentRegion = artist.region;
  if (!currentRegion) throw new Error('No region set on profile');

  if (artist.current_city === destinationCity) {
    throw new Error('Already in this city');
  }

  const { data: cityRow } = await supabaseAdmin
    .from('city_scenes')
    .select('id, city_name, region')
    .eq('city_name', destinationCity)
    .eq('region', currentRegion)
    .maybeSingle();

  if (!cityRow) throw new Error('City not in current region');

  if (N(artist.energy) < ENERGY_COST) {
    throw new Error('Insufficient energy for city travel');
  }

  const previousCity = artist.current_city || null;
  const nextEnergy = Math.max(0, N(artist.energy) - ENERGY_COST);

  await entities.ArtistProfile.update(artistId, {
    region: currentRegion,
    current_city: destinationCity,
    energy: nextEnergy,
    updated_at: new Date().toISOString(),
  });

  await upsertTravelTurnEvent({
    player_id: artistId,
    global_turn_id: globalTurnId,
    module: 'touring',
    event_type: 'city_travel',
    description: `Moved base to ${destinationCity} (${currentRegion})`,
    metadata: {
      from_city: previousCity,
      to_city: destinationCity,
      region: currentRegion,
      energy_cost: ENERGY_COST,
      turn_id: globalTurnId,
      occurred_at: new Date().toISOString(),
    },
  });

  return {
    previous_city: previousCity,
    current_city: destinationCity,
    current_region: currentRegion,
    energy: nextEnergy,
    energy_cost: ENERGY_COST,
  };
}

/**
 * Process a single turn for a player's active tours
 */
export async function processTouringForPlayer(ctx: any, player: any) {
  const { entities, stageOnly, globalTurnId, rng } = ctx;
  // Fallback RNG if not provided (for backwards compatibility)
  const random = rng?.random ? () => rng.random() : Math.random;
  const runtimeContext = ctx?.runtimeContext || {};
  const fandomLaborPool: Record<string, number> = ctx?.fandomLaborPool || {};
  const fandomDefenseLabor = Number(fandomLaborPool?.defense) || 0;
  const fandomPromoLabor = Number(fandomLaborPool?.promo) || 0;
  const playerFansForTourLabor = Math.max(1, Number(player?.fans ?? player?.followers) || 0);
  const fandomPromoTurnoutBoost = fandomPromoLabor > 0
    ? Math.min(0.08, (fandomPromoLabor / playerFansForTourLabor) * 0.08)
    : 0;
  const fandomDefenseEventMitigation = fandomDefenseLabor > 0
    ? Math.min(0.20, (fandomDefenseLabor / playerFansForTourLabor) * 0.20)
    : 0;
  const deltas: any = {
    tour_updates: [],
    gig_updates: [],
    tour_event_updates: [],
    notifications_to_create: [],
    news_items_to_create: [],
    artistProfile: {},
    turn_metrics: {},
    turn_events: [],
    social_posts_to_create: [],
    // Touring expansion deltas
    tour_crew_updates: [],
    tour_sponsorship_updates: [],
    tour_choice_event_creates: [],
    tour_choice_event_updates: [],
    tour_opening_act_updates: [],
    opener_tour_credits: [] as Array<{
      opener_id: string;
      tour_id: string;
      gig_id: string;
      city_id: string | null;
      income: number;
      revenue_split: number;
      source_revenue: number;
    }>,
    // city_scene_rep_updates REMOVED (Plan 034 M2) — sceneSystemModule is canonical
    merch_updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
    scene_deltas: null as any,
  };

  // Process underground events (booked gigs/hosted events)
  try {
    const eventResult = await processUndergroundEvents(ctx, player);
    if (eventResult?.deltas) {
      if (eventResult.deltas.tour_event_updates) deltas.tour_event_updates.push(...eventResult.deltas.tour_event_updates);
      if (eventResult.deltas.notifications_to_create) deltas.notifications_to_create.push(...eventResult.deltas.notifications_to_create);
      if (eventResult.deltas.news_items_to_create) deltas.news_items_to_create.push(...eventResult.deltas.news_items_to_create);
      if (eventResult.deltas.social_posts_to_create?.length) {
        deltas.social_posts_to_create = [...(deltas.social_posts_to_create || []), ...eventResult.deltas.social_posts_to_create];
      }
      if (eventResult.deltas.turn_events?.length) {
        deltas.turn_events = [...(deltas.turn_events || []), ...eventResult.deltas.turn_events];
      }
      if (eventResult.deltas.artistProfile) Object.assign(deltas.artistProfile, eventResult.deltas.artistProfile);
      if (eventResult.deltas.turn_metrics) Object.assign(deltas.turn_metrics, eventResult.deltas.turn_metrics);
      // Plan 035 M2: scene_deltas merge REMOVED — underground events flow through context bus
      // (sceneSystemModule is now canonical for underground scene processing via _meta extraction)
    }
  } catch (e: any) {
    console.error(`[TouringManager] Underground events error for ${player.id}:`, e.message);
  }

  // 1. Find active tours
  const activeTours = await entities.Tour.filter({
    artist_id: player.id,
    status: 'active'
  });

  if (activeTours.length === 0 && deltas.tour_event_updates.length === 0) return { success: true, deltas };
  if (activeTours.length === 0) return { success: true, deltas };

  // Fetch active Era for bonuses
  const currentEra = runtimeContext?.activeEra
    || null;

  // Fetch Fan Profile for regional affinity
  const fanProfile = runtimeContext?.fanProfile
    || null;

  // Load city scene data for genre match + venue gating
  let cityScenesByName: Record<string, any> = {};
  let playerCityReps: Record<string, any> = {};
  try {
    const prefetchedAllCities = runtimeContext?.prefetchData?.allCityScenesMap;
    if (prefetchedAllCities && prefetchedAllCities.size > 0) {
      for (const s of prefetchedAllCities.values()) {
        if (s.city_name) cityScenesByName[s.city_name] = s;
      }
    } else {
      const { data: scenes } = await supabaseAdmin.from('city_scenes').select('id, city_name, genre_weights, trending_genre, controversy_tolerance, scene_vibe').limit(50);
      if (scenes) {
        for (const s of scenes) cityScenesByName[s.city_name] = s;
      }
    }
    const prefetchReps = runtimeContext?.prefetchData?.cityRepsByPlayer?.get(player.id) || null;
    if (prefetchReps) {
      for (const r of prefetchReps) playerCityReps[r.city_id] = r;
    } else {
      const { data: reps } = await supabaseAdmin.from('player_city_reputation').select('city_id, reputation_score, fatigue_mitigation, gigs_played, scene_influence_score, networking_points, unlocked_venue_tier').eq('player_id', player.id);
      if (reps) {
        for (const r of reps) playerCityReps[r.city_id] = r;
      }
    }
  } catch { /* non-critical — scene bonus just won't apply */ }

  // Load focus path scene modifiers
  const focusModifiers = computeFocusPathSceneModifiers(player.focus_path || '');

  // Load tour categories config
  let tourCategoriesMap: Record<string, any> = {};
  try {
    tourCategoriesMap = await getTourCategories();
  } catch (e) { tourDebug('Failed to load tour categories:', e); }

  // Auto-resolve stale choice events (pending for 1+ turns)
  try {
    const { data: staleChoices } = await supabaseAdmin
      .from('tour_choice_events')
      .select('*')
      .eq('artist_id', player.id)
      .eq('status', 'pending')
      .lt('created_turn', globalTurnId);
    
    for (const choice of (staleChoices || [])) {
      const autoChoice = choice.auto_default;
      const choiceDef = (choice.choices || []).find((c: any) => c.id === autoChoice);
      deltas.tour_choice_event_updates.push({
        id: choice.id,
        patch: {
          status: 'auto_resolved',
          chosen_option: autoChoice,
          resolved_turn: globalTurnId,
          effects_applied: choiceDef?.effects || {},
        },
      });
      // Apply auto-resolved effects to the tour
      if (choiceDef?.effects) {
        tourDebug(`Auto-resolving choice event ${choice.event_key} with ${autoChoice}`);
      }
    }
  } catch (e) { tourDebug('Error auto-resolving choice events:', e); }

  // Load fandom essence for sponsor clash checks
  let fandomEssence: Record<string, number> = {};
  let identityPillars: string[] = [];
  try {
    const { data: fandomRow } = await supabaseAdmin
      .from('fandoms')
      .select('essence_vectors, identity_pillars')
      .eq('player_id', player.id)
      .maybeSingle();
    if (fandomRow) {
      fandomEssence = fandomRow.essence_vectors || {};
      identityPillars = fandomRow.identity_pillars || [];
    }
  } catch { /* non-critical */ }

  for (const tour of activeTours) {
    const tourPhase = tour.state?.phase || 'live';
    if (tourPhase === 'prep') {
      if (tour.start_turn && globalTurnId < tour.start_turn) {
        continue;
      }

      const nextPrepState = {
        ...(tour.state || {}),
        phase: 'live',
        prep_countdown_turns_remaining: 0,
        early_launch_penalties: computePrepPenaltyState(tour.state?.prep_readiness || {}),
      };

      deltas.tour_updates.push({
        id: tour.id,
        patch: {
          start_turn: 0,
          state: nextPrepState,
        },
      });

      tour.state = nextPrepState;
      tour.start_turn = 0;
    }

    // Check if tour hasn't started yet
    if (tour.start_turn && globalTurnId < tour.start_turn) {
      continue;
    }

    // Load tour category config
    const categoryId = tour.tour_category || 'standard_run';
    const category = tourCategoriesMap[categoryId] || tourCategoriesMap['standard_run'] || {};
    const categoryBonuses = category.fan_segment_bonuses || {};

    // Check if tour is over — compute tour review and consequences
    if (tour.turns_remaining <= 0) {
      // Compute final tour review score
      const totalGigs = N(tour.shows_completed) || 1;
      const avgAttendanceRatio = N(tour.total_attendance) / Math.max(1, totalGigs * 500);
      const fanReception = tour.fan_reception || {};
      const receptionValues = Object.values(fanReception).map(Number).filter(v => !isNaN(v));
      const fanReceptionAvg = receptionValues.length > 0 ? receptionValues.reduce((a: number, b: number) => a + b, 0) / receptionValues.length : 50;
      
      const reviewResult = computeTourReviewScore({
        avgAttendanceRatio: Math.min(1, avgAttendanceRatio),
        crewMorale: N(tour.crew_morale) || 70,
        artistFatigue: N(tour.state?.fatigue ?? tour.fatigue ?? 0),
        fanReceptionAvg,
        setlistPower: N(tour.stats?.setlist_power) || 50,
      });

      const consequences = tourEndConsequences(reviewResult.score);
      tourDebug(`Tour ${tour.tour_name} completed. Review: ${reviewResult.score} (${reviewResult.grade}). Consequences:`, consequences);

      deltas.tour_updates.push({
        id: tour.id,
        patch: {
          status: 'completed',
          completed_at: new Date().toISOString(),
          tour_review_score: reviewResult.score,
          quality_score: reviewResult.score,
        }
      });
      
      // Track tour completion in turn metrics (for era grand mission etc.)
      deltas.turn_metrics.tours_completed = (deltas.turn_metrics.tours_completed || 0) + 1;

      // Apply tour end consequences as additive deltas
      if (consequences.clout_delta !== 0) {
        deltas.artistProfile.tour_clout_boost = (deltas.artistProfile.tour_clout_boost || 0) + consequences.clout_delta;
      }
      if (consequences.hype_delta !== 0) {
        deltas.artistProfile.tour_hype_boost = (deltas.artistProfile.tour_hype_boost || 0) + consequences.hype_delta;
      }

      // Complete tour sponsorships
      try {
        const { data: sponsorships } = await supabaseAdmin
          .from('tour_sponsorships')
          .select('id, payout')
          .eq('tour_id', tour.id)
          .eq('status', 'active');
        for (const sp of (sponsorships || [])) {
          deltas.tour_sponsorship_updates.push({ id: sp.id, patch: { status: 'completed' } });
        }
      } catch { /* non-critical */ }

      // Complete tour opening acts
      try {
        const { data: openingActs } = await supabaseAdmin
          .from('tour_opening_acts')
          .select('id, opener_id, revenue_split')
          .eq('tour_id', tour.id)
          .eq('status', 'active');
        for (const oa of (openingActs || [])) {
          deltas.tour_opening_act_updates.push({
            id: oa.id,
            patch: { status: 'completed', completed_turn: globalTurnId },
          });
        }
      } catch { /* non-critical */ }

      // Complete crew contracts
      try {
        const { data: crew } = await supabaseAdmin
          .from('tour_crew_members')
          .select('id')
          .eq('tour_id', tour.id)
          .eq('contract_status', 'active');
        for (const c of (crew || [])) {
          deltas.tour_crew_updates.push({ id: c.id, patch: { contract_status: 'completed' } });
        }
      } catch { /* non-critical */ }

      deltas.notifications_to_create.push({
        player_id: player.id,
        type: 'TOUR_COMPLETED',
        title: `Tour Completed! Grade: ${reviewResult.grade}`,
        subtitle: `${tour.tour_name} has finished!`,
        body: `Review score: ${reviewResult.score}/100. You earned $${N(tour.total_net_revenue).toLocaleString()} total.${consequences.clout_delta > 0 ? ` +${consequences.clout_delta} clout!` : ''}`,
        priority: 'high',
        metrics: { review_score: reviewResult.score, grade: reviewResult.grade, ...consequences },
        idempotency_key: `tour_complete:${tour.id}:${globalTurnId}`,
      });
      continue;
    }

    // --- EXECUTE TOUR TURN ---
    
    // 1. Check Strategy
    const strategy = tour.strategy || {};
    if (strategy.rest_next) {
      // Resting this turn
      deltas.tour_updates.push({
        id: tour.id,
        patch: {
          turns_remaining: tour.turns_remaining - 1, // Time still passes
          completed_stops: N(tour.completed_stops) + 1, // Advance pointer (consume the turn)
          strategy: { ...strategy, rest_next: false }, // Reset flag
          fatigue: Math.max(0, N(tour.fatigue) - 20) // Recover fatigue
        }
      });

      continue; // Skip gig processing
    }

    // Initialize turn variables
    let tourRevenue = 0;
    let tourHype = 0;
    let tourFans = 0;
    let eventOutcome: any = null;
    let eraMomentumDelta = 0;
    let eraTensionDelta = 0;

    // 2. Fatigue & Morale Management
    const fatigueGain = N(tour.fatigue_per_turn) || 1;
    let currentFatigue = N(tour.state?.fatigue ?? tour.fatigue ?? 0) + fatigueGain;
    let currentMorale = N(tour.state?.morale ?? 100);

    // ── Transport tier modifiers ──
    const transportTier = tour.transport_tier || tour.strategy?.transportTier || 'cargo_van';
    const TRANSPORT_FATIGUE_MODS: Record<string, number> = {
      hatchback: 0.20,      // +20% fatigue (stamina: -0.20)
      cargo_van: 0,
      splitter_van: 0,
      silver_eagle: -0.25,   // -25% fatigue (stamina: 0.25)
      star_coach: 0,
      charter_jet: 0,
      tour_fleet: 0,
    };
    const TRANSPORT_MORALE_MODS: Record<string, number> = {
      hatchback: 0,
      cargo_van: 0,
      splitter_van: 2,      // crewMorale → slight morale boost per turn
      silver_eagle: 0,
      star_coach: 3,         // vibe → morale boost per turn
      charter_jet: 0,
      tour_fleet: 0,
    };
    const fatigueMod = TRANSPORT_FATIGUE_MODS[transportTier] || 0;
    currentFatigue += Math.round(fatigueGain * fatigueMod);
    currentMorale = Math.min(100, currentMorale + (TRANSPORT_MORALE_MODS[transportTier] || 0));

    // Random Event Trigger
    let eventChance = 0.15;
    if (currentFatigue > 60) eventChance += 0.1;
    if (currentMorale < 40) eventChance += 0.1;

    let triggeredEvent = null;
    if (random() < eventChance) {
      const positiveChance = 0.2 + (currentMorale / 100) * 0.6;
      const isPositive = random() < positiveChance;

      const pool: Array<{ id: string; type: string; text: string; effect: any }> = TOUR_RANDOM_EVENTS.filter(e => isPositive ? e.type === 'positive' : e.type === 'negative');
      // Add transport-specific passive events to the pool
      const TRANSPORT_PASSIVE_EVENTS: Array<{ id: string, type: 'negative', text: string, effect: any, tiers: string[] }> = [
        { id: 'cramped_quarters', type: 'negative', text: 'Cramped quarters are killing the vibe.', effect: { morale: -5, fatigue: 3 }, tiers: ['hatchback', 'cargo_van'] },
        { id: 'bad_road_food', type: 'negative', text: 'Bad road food is hitting the crew hard.', effect: { morale: -2, fatigue: 2 }, tiers: ['hatchback', 'cargo_van', 'splitter_van'] },
        { id: 'maintenance_drain', type: 'negative', text: 'The Silver Eagle needs another repair.', effect: { money: -500, fatigue: 2 }, tiers: ['silver_eagle'] },
        { id: 'jet_lag_hit', type: 'negative', text: 'Jet lag is catching up with the whole team.', effect: { morale: -3, fatigue: 5 }, tiers: ['charter_jet'] },
        { id: 'logistics_overhead', type: 'negative', text: 'Coordinating the fleet is burning everyone out.', effect: { money: -800, morale: -3 }, tiers: ['tour_fleet'] },
      ];
      const transportEvents = TRANSPORT_PASSIVE_EVENTS.filter(e => e.tiers.includes(transportTier));
      if (transportEvents.length > 0) {
        pool.push(...transportEvents.map(e => ({ id: e.id, type: e.type, text: e.text, effect: e.effect })));
      }
      if (pool.length > 0) {
        triggeredEvent = pool[Math.floor(random() * pool.length)];
      }
    }

    if (triggeredEvent) {
        const eventEffect = { ...(triggeredEvent.effect || {}) };
        if (triggeredEvent.type === 'negative' && fandomDefenseEventMitigation > 0) {
          for (const key of Object.keys(eventEffect)) {
            const rawValue = Number(eventEffect[key]) || 0;
            if (rawValue < 0) {
              eventEffect[key] = Math.ceil(rawValue * (1 - fandomDefenseEventMitigation));
            } else if (key === 'fatigue' && rawValue > 0) {
              eventEffect[key] = Math.floor(rawValue * (1 - fandomDefenseEventMitigation));
            }
          }
        }
        if (eventEffect.money) tourRevenue += eventEffect.money;
        if (eventEffect.fatigue) currentFatigue += eventEffect.fatigue;
        if (eventEffect.morale) currentMorale += eventEffect.morale;
        if (eventEffect.hype) tourHype += eventEffect.hype;
        
        currentFatigue = Math.max(0, Math.min(100, currentFatigue));
        currentMorale = Math.max(0, Math.min(100, currentMorale));

        deltas.notifications_to_create.push({
            player_id: player.id,
            type: 'TOUR_EVENT',
            title: triggeredEvent.text,
            subtitle: tour.tour_name,
            body: `Impact: ${Object.entries(triggeredEvent.effect).map(([k, v]) => {
              const value = Number(eventEffect[k]) || 0;
              return `${k} ${value > 0 ? '+' : ''}${value}`;
            }).join(', ')}`,
            priority: triggeredEvent.type === 'positive' ? 'medium' : 'high'
        });

        if (!deltas.turn_events) deltas.turn_events = [];
        deltas.turn_events.push({
             global_turn_id: globalTurnId,
             player_id: player.id,
             module: 'touring',
             event_type: 'random_event',
             description: triggeredEvent.text,
             metadata: { event_id: triggeredEvent.id, effect: eventEffect, mitigated_by_defense_labor: triggeredEvent.type === 'negative' && fandomDefenseEventMitigation > 0 }
        });
    }
    
    // 3. Find Gig for this specific turn
    // Use absolute turn scheduling
    const gigs = await entities.Gig.filter({
      tour_id: tour.id,
      scheduled_turn: globalTurnId
    });
    
    // FAILSAFE: Catch up overdue gigs from skipped turns
    const overdueGigs = await entities.Gig.filter({
      tour_id: tour.id,
      status: 'Booked'
    });
    const missedGigs = overdueGigs.filter((g: any) => 
      g.scheduled_turn < globalTurnId && g.status === 'Booked'
    );
    
    if (missedGigs.length > 0) {
      tourDebug(`[FAILSAFE] Found ${missedGigs.length} overdue gigs for tour ${tour.id}. Auto-completing...`);
      for (const missedGig of missedGigs) {
        // Auto-complete with reduced stats (penalty for missed turn)
        const capacity = N(missedGig.capacity);
        const ticketPrice = N(missedGig.ticket_price);
        const attendance = Math.floor(capacity * 0.6); // 60% fill rate penalty
        const gross = attendance * ticketPrice;
        const expenses = N(missedGig.base_cost) || (gross * 0.2);
        const net = gross - expenses;
        const merchRevenue = attendance * 6; // Reduced merch
        const gigRevenue = net + merchRevenue;
        
        deltas.gig_updates.push({
          id: missedGig.id,
          patch: {
            status: 'Completed',
            tickets_sold: attendance,
            gross_revenue: gross,
            net_revenue: net,
            merch_revenue: merchRevenue,
            income_earned: gigRevenue,
            hype_gain: Math.floor(attendance / 150), // Reduced hype
            fan_gain: Math.floor(attendance / 75), // Reduced fans
            event_outcome: {
              type: 'auto_completed',
              note: 'Missed due to skipped turns',
              scheduled_turn: missedGig.scheduled_turn,
              completed_turn: globalTurnId
            }
          }
        });
        
        tourRevenue += gigRevenue;
        tourHype += Math.floor(attendance / 150);
        tourFans += Math.floor(attendance / 75);
        
        deltas.notifications_to_create.push({
          player_id: player.id,
          type: 'TOUR_GIG',
          title: `⚠️ Catch-up Show at ${missedGig.venue_name}`,
          subtitle: `Auto-completed (scheduled turn ${missedGig.scheduled_turn})`,
          body: `Earned $${gigRevenue.toLocaleString()} (reduced stats due to missed turn)`,
          priority: 'low',
          metrics: {
            venue: missedGig.venue_name,
            attendance,
            revenue: gigRevenue,
            auto_completed: true
          },
          idempotency_key: `gig_autocomplete:${missedGig.id}:${globalTurnId}`
        });
      }
    }
    
    if (gigs.length > 0) {
      const gig = gigs[0];
      
      if (gig.status !== 'Booked') {
        // Already processed? Skip.
      } else {
        // Calculate Outcome
        const capacity = N(gig.capacity);
        const ticketPrice = N(gig.ticket_price);
        const setlistPower = N(tour.stats?.setlist_power) || 50;
        
        // Dynamic Demand Calculation
        const hypeFactor = (N(player.hype) / 100);
        
        // Era Synergy Bonus — now uses phase + aesthetic tag alignment
        let eraBonus = 1.0;
        if (currentEra) {
           eraBonus = 1.1; // base bonus for having an era
           try {
             const eraAesthetics = currentEra.aesthetic_tags || [];
             const tourAesthetics = category.aesthetic_tags || [];
             const synergy = computeEraTourSynergy(currentEra.phase || 'SUSTAIN', eraAesthetics, tourAesthetics);
             // Phase + alignment amplifies era bonus
             eraBonus += synergy.alignment_score / 200; // up to +0.5 at 100% alignment
             eraMomentumDelta = synergy.momentum_delta;
             eraTensionDelta = synergy.tension_delta;
             tourDebug(`Era synergy: phase=${currentEra.phase} alignment=${synergy.alignment_score} mom=${eraMomentumDelta} ten=${eraTensionDelta}`);
           } catch { /* non-critical */ }
        }

        // Regional Affinity Bonus
        let regionBonus = 1.0;
        if (fanProfile && fanProfile.region_share && tour.region) {
           const share = N(fanProfile.region_share[tour.region]);
           // Boost based on fan concentration: 50% share -> 1.25x multiplier
           regionBonus = 1 + (share / 200);
        }

        // Fatigue Penalty
        const fatiguePenalty = currentFatigue > 50 ? (currentFatigue - 50) * 0.01 : 0; // Up to 50% penalty at 100 fatigue
        
        const trendTourDemandAdj = Math.max(0.9, Math.min(1.1, Number(ctx?.careerTrendEffects?.tourDemandAdj) || 1));

        // Scene Genre Match Bonus — better match to city's dominant genre = higher attendance
        let genreMatchBonus = 1.0;
        let sceneGenreMatch = 0;
        const gigCity = gig.city || '';
        const cityScene = cityScenesByName[gigCity];
        const cityRep = cityScene?.id ? playerCityReps[cityScene.id] : null;
        if (cityScene && player.genre) {
          sceneGenreMatch = computeGenreMatchScore(player.genre, cityScene.genre_weights || {}, cityScene.trending_genre || '');
          // Up to +50% at perfect match (100 score), neutral at 50, slight penalty below 30
          genreMatchBonus = 1 + ((sceneGenreMatch - 50) / 200);
          genreMatchBonus = Math.max(0.9, Math.min(1.5, genreMatchBonus));
          tourDebug(`Genre match: ${player.genre} in ${gigCity} = ${sceneGenreMatch}/100 → ${genreMatchBonus.toFixed(2)}x`);
        }

        // Scene fatigue mitigation from networking contacts
        let sceneFatigueMitigation = 0;
        if (cityRep) {
          sceneFatigueMitigation = Math.max(0, Number(cityRep.fatigue_mitigation) || 0);
        }

        const isTourMonster = player.focus_path === 'TOUR_MONSTER';
        const tourMonsterFillBonus = isTourMonster ? 0.04 : 0;
        const tourMonsterFatigueRelief = isTourMonster ? 0.12 : 0;
        const effectiveFatigueMitigation = Math.min(0.27, Math.min(0.15, sceneFatigueMitigation) + tourMonsterFatigueRelief);

        // Co-tour mode modifiers: fills & revenue splits
        const tourMode = (tour.strategy?.tourMode || tour.tour_mode || 'solo') as string;
        const coTourMods = computeCoTourOutcomeModifiers(tourMode);

        let fillRate = (0.4 + (hypeFactor * 0.5) + (setlistPower / 500)) * eraBonus * regionBonus * trendTourDemandAdj * genreMatchBonus;
        // Co-tour fill rate bonus (equal_coheadliner +0.10, partner_led +0.20)
        fillRate += coTourMods.fillRateBonus;
        if (fandomPromoTurnoutBoost > 0) {
          fillRate *= (1 + fandomPromoTurnoutBoost);
        }
        const adjustedFatiguePenalty = fatiguePenalty * (1 - effectiveFatigueMitigation);
        fillRate = Math.min(1.0, Math.max(0.1, (fillRate * (1 + tourMonsterFillBonus)) - adjustedFatiguePenalty));
        
        // Random variance
        fillRate *= (0.9 + random() * 0.2); 
        if (fillRate > 1) fillRate = 1;

        const attendance = Math.floor(capacity * fillRate);
        const gross = attendance * ticketPrice;
        const expenses = N(gig.base_cost) || (gross * 0.2); // Use stored base cost if available
        // Apply co-tour revenue split (solo=1.0, equal_coheadliner=0.5, partner_led=0.3)
        const net = (gross - expenses) * coTourMods.revenueModifier;
        
        // Merch Sales
        let merchRevenue = 0;
        const gigMerchStockPatches: Array<{ id: string; patch: { stock: number } }> = [];
        // selected_merch is stored in tour.metadata.selected_merch (no top-level column exists)
        const tourSelectedMerch = (tour as any).metadata?.selected_merch ?? (tour as any).selected_merch;
        if (tourSelectedMerch && tourSelectedMerch.length > 0) {
          // Safe fallback: cap selected merch revenue by available stock instead of attendance alone.
          const selectedMerchIds = Array.isArray(tourSelectedMerch)
            ? tourSelectedMerch.filter((id: any) => typeof id === 'string' && id.length > 0)
            : [];
          const merchTrendMult = Math.max(0.85, Math.min(1.15, Number(ctx?.careerTrendEffects?.merchConversionAdj) || 1));

          if (selectedMerchIds.length > 0 && entities?.Merch?.filter) {
            try {
              const selectedMerchRows = await entities.Merch.filter({ id: selectedMerchIds });
              const availableStock = (selectedMerchRows || []).reduce((sum: number, item: any) => sum + N(item.stock), 0);
              const avgPrice = (selectedMerchRows || []).length > 0
                ? (selectedMerchRows || []).reduce((sum: number, item: any) => sum + N(item.price_per_unit), 0) / (selectedMerchRows || []).length
                : 0;
              const requestedUnits = Math.max(0, Math.floor(attendance * (0.12 + random() * 0.08)));
              const actualUnits = Math.min(requestedUnits, availableStock);

              if (actualUnits > 0 && avgPrice > 0) {
                merchRevenue = Math.floor(actualUnits * avgPrice * merchTrendMult);
              }

              // Decrement stock proportionally across selected merch items
              if (actualUnits > 0 && (selectedMerchRows || []).length > 0) {
                let unitsLeft = actualUnits;
                for (const item of (selectedMerchRows || [])) {
                  if (unitsLeft <= 0) break;
                  const itemStock = N(item.stock);
                  if (itemStock <= 0) continue;
                  const taken = Math.min(itemStock, unitsLeft);
                  gigMerchStockPatches.push({ id: item.id, patch: { stock: Math.max(0, itemStock - taken) } });
                  unitsLeft -= taken;
                }
              }
            } catch (e: any) {
              console.warn('[TouringManager] Failed to cap selected merch revenue by stock:', e.message);
            }
          }
        } else {
          // Default merch revenue
          const merchSpendPerHead = 5 + (random() * 5); // $5-$10
          merchRevenue = attendance * merchSpendPerHead * Math.max(0.85, Math.min(1.15, Number(ctx?.careerTrendEffects?.merchConversionAdj) || 1));
        }
        
        // Phase 6 superfans tour boost: superfans increase fill rate and thus net revenue
        const superfansTourBoost = Number(ctx?.superfansTourBoost) || 0;
        if (superfansTourBoost > 0) {
          fillRate = Math.min(1.0, fillRate * (1 + superfansTourBoost));
        }

        // ONE_HIT_WONDER: penalise tour revenue when hit song not in setlist
        const tourWithoutHitMult = Number(ctx?.careerTrendEffects?.tourWithoutHitMult) || 1.0;
        let effectiveNet = net;
        if (tourWithoutHitMult < 1.0) {
          const setlist: any[] = tour.setlist || [];
          const hitReleaseId = ctx?.careerTrendEffects?._hitReleaseId || null;
          const hitInSetlist = hitReleaseId
            ? setlist.some((s: any) => s.release_id === hitReleaseId || s.id === hitReleaseId)
            : setlist.length > 0; // if no known hit, assume setlist covers it
          if (!hitInSetlist) {
            effectiveNet = Math.floor(net * tourWithoutHitMult);
          }
        }
        tourRevenue = effectiveNet + merchRevenue;
        tourHype = Math.floor(attendance / 100);
        tourFans = Math.floor(attendance / 50);
        
        // Flush merch stock decrements into the shared merch_updates delta array
        if (gigMerchStockPatches.length > 0) {
          deltas.merch_updates.push(...gigMerchStockPatches);
        }

        eventOutcome = {
          type: 'gig_performed',
          gig_name: gig.venue_name,
          attendance,
          fill_rate: fillRate,
          revenue: tourRevenue,
          fatigue_penalty: fatiguePenalty > 0,
          genre_match_score: sceneGenreMatch > 0 ? sceneGenreMatch : undefined,
          genre_match_bonus: genreMatchBonus !== 1.0 ? genreMatchBonus : undefined,
        };

        if (gig.region || tour.region) {
          deltas.artistProfile.region = gig.region || tour.region;
        }
        if (gig.city) {
          deltas.artistProfile.current_city = gig.city;
        }

        // ── Scene Tick: per-gig city reputation, networking, influence, venue tier ──
        if (cityScene?.id) {
          try {
            const currentRep = Number(cityRep?.reputation_score ?? 0);
            const currentGigs = Number(cityRep?.gigs_played ?? 0);
            const currentInfluence = Number(cityRep?.scene_influence_score ?? 0);
            const currentNetworking = Number(cityRep?.networking_points ?? 0);
            const currentVenueTier = Number(cityRep?.unlocked_venue_tier ?? 1);

            const repGain = computeReputationGain({
              gigSuccess: true,
              genreMatchScore: sceneGenreMatch || 50,
              attendanceRatio: fillRate,
              venuePrestige: Math.min(5, Math.max(1, currentVenueTier)),
              currentReputation: currentRep,
              focusModifiers,
            });

            const netGain = computeNetworkingGain({
              gigSuccess: true,
              genreMatchScore: sceneGenreMatch || 50,
              playerGenre: player.genre || null,
              reputation: currentRep,
              focusModifiers,
            });

            const influenceGain = computeSceneInfluenceDelta({
              reputation: currentRep + repGain,
              gigsInCity: currentGigs + 1,
              genreConsistency: sceneGenreMatch > 0 ? sceneGenreMatch / 100 : 0.5,
              focusModifiers,
            });

            const newVenueTier = computeVenueUnlockTier({
              reputation: Math.min(100, currentRep + repGain),
              followers: Number(player.followers ?? player.fans ?? 0),
              hype: Number(player.hype ?? 0),
              focusModifiers,
            });

            // Plan 034 M2: city_scene_rep_updates removed — sceneSystemModule is now canonical for all scene reputation updates.
            // touringManager provides gig completion context via _meta on gig_updates (processed by sceneCompletionContextBus).

            tourDebug(`Scene tick city=${gigCity} rep+${repGain} net+${netGain} inf+${influenceGain} tier=${newVenueTier}`);
          } catch (e) { tourDebug('Scene tick error:', e); }
        }

        // Queue Gig Update
        // Plan 034 M1: Include _meta for Scene Completion Context Bus
        deltas.gig_updates.push({
          id: gig.id,
          patch: {
            status: 'Completed',
            tickets_sold: attendance,
            gross_revenue: gross,
            net_revenue: net,
            merch_revenue: merchRevenue,
            income_earned: net + merchRevenue,
            hype_gain: tourHype,
            fan_gain: tourFans,
            event_outcome: eventOutcome
          },
          // _meta: enrichment for sceneCompletionContextBus (Plan 034 M1)
          _meta: {
            tour_id: tour.id,
            city_id: cityScene?.id || null,
            city_name: gigCity || null,
            venue_id: gig.venue_id || null,
            scheduled_turn: gig.scheduled_turn || globalTurnId,
          },
        });
        
        // Notification for ALL gig performances
        const fillPercent = Math.round(fillRate * 100);
        let gigTitle, gigPriority;
        if (fillRate > 0.9) {
          gigTitle = `🔥 Sold Out at ${gig.venue_name}!`;
          gigPriority = 'high';
        } else if (fillRate > 0.7) {
          gigTitle = `Great Show at ${gig.venue_name}!`;
          gigPriority = 'medium';
        } else if (fillRate > 0.5) {
          gigTitle = `Show at ${gig.venue_name}`;
          gigPriority = 'low';
        } else {
          gigTitle = `Tough Crowd at ${gig.venue_name}`;
          gigPriority = 'low';
        }
        
        const notableGigOutcome = fillRate > 0.9 || fillRate <= 0.5;
        if (notableGigOutcome) {
          deltas.notifications_to_create.push({
            player_id: player.id,
            type: 'TOUR_GIG',
            title: gigTitle,
            subtitle: `${attendance.toLocaleString()} fans (${fillPercent}% capacity)`,
            body: `You earned $${tourRevenue.toLocaleString()} and gained ${tourFans} new fans.`,
            priority: gigPriority,
            metrics: {
              venue: gig.venue_name,
              attendance,
              fill_rate: fillRate,
              revenue: tourRevenue,
              fans_gained: tourFans
            },
            idempotency_key: `tour_gig:${gig.id}:${globalTurnId}`,
          });
        }
      }
    } else {
      // No gig scheduled for this turn index -> Travel/Rest logic
      eventOutcome = { type: 'travel_day', cost: 500 };
      tourRevenue = -500; 
    }

    // ═══ EXPANSION: Crew salary, sponsor clash, fan reception, choice events, opening acts, era deltas ═══

    // Crew salary deduction + morale drift
    let crewSalaryCost = 0;
    let crewMoraleAvg = N(tour.crew_morale) || 70;
    try {
      const { data: activeCrew } = await supabaseAdmin
        .from('tour_crew_members')
        .select('id, name, specialty, quality, morale, salary_per_turn, contract_status')
        .eq('tour_id', tour.id)
        .eq('contract_status', 'active');
      
      if (activeCrew && activeCrew.length > 0) {
        let moraleSum = 0;
        for (const crew of activeCrew) {
          crewSalaryCost += N(crew.salary_per_turn);
          // Crew morale drifts: -1 to -3 per turn normally, worse if tour morale low
          let moraleDrift = -(1 + Math.floor(random() * 3));
          if (currentMorale < 40) moraleDrift -= 2;
          if (currentFatigue > 70) moraleDrift -= 2;
          // Triggered events can target crew
          if (triggeredEvent?.type === 'negative') moraleDrift -= 2;
          const newCrewMorale = Math.max(10, Math.min(100, N(crew.morale) + moraleDrift));
          moraleSum += newCrewMorale;

          deltas.tour_crew_updates.push({
            id: crew.id,
            patch: { morale: newCrewMorale, updated_at: new Date().toISOString() },
          });

          // Crew quit if morale drops below 15
          if (newCrewMorale <= 15) {
            deltas.tour_crew_updates[deltas.tour_crew_updates.length - 1].patch.contract_status = 'quit';
            deltas.notifications_to_create.push({
              player_id: player.id,
              type: 'TOUR_EVENT',
              title: `${crew.name} quit the tour!`,
              subtitle: `Your ${SPECIALTY_LABELS[crew.specialty] || crew.specialty} left due to low morale.`,
              body: `Consider hiring a replacement to maintain tour quality.`,
              priority: 'high',
              idempotency_key: `crew_quit:${crew.id}:${globalTurnId}`,
            });
          }
        }
        crewMoraleAvg = Math.round(moraleSum / activeCrew.length);
      }
    } catch (e) { tourDebug('Crew processing error:', e); }

    // Deduct crew salary from tour revenue
    tourRevenue -= crewSalaryCost;

    // Sponsor clash check
    let sponsorClashEffects: Record<string, number> = {};
    try {
      const { data: activeSponsorships } = await supabaseAdmin
        .from('tour_sponsorships')
        .select('*')
        .eq('tour_id', tour.id)
        .eq('status', 'active');
      
      for (const sp of (activeSponsorships || [])) {
        // Per-turn payout from sponsor
        const perTurnPayout = Math.floor(N(sp.payout) / Math.max(1, N(tour.turns_total)));
        tourRevenue += perTurnPayout;

        // Check for clash
        const clash = checkSponsorClash(
          { alignment_tags: sp.alignment_tags || [], essence_weights: sp.essence_weights || {}, clash_risk: N(sp.clash_risk) },
          fandomEssence,
          identityPillars,
        );

        if (clash) {
          deltas.tour_sponsorship_updates.push({
            id: sp.id,
            patch: {
              clash_triggered: true,
              status: 'clashed',
              clash_details: { severity: clash.severity, reason: clash.reason, turn: globalTurnId },
            },
          });
          // Clash effects on fan reception
          const clashSeverityMult = clash.severity / 100;
          sponsorClashEffects = {
            og: Math.round(-5 * clashSeverityMult),
            core: Math.round(-3 * clashSeverityMult),
            critic: Math.round(3 * clashSeverityMult),
          };
          deltas.notifications_to_create.push({
            player_id: player.id,
            type: 'TOUR_EVENT',
            title: `Sponsor Clash: ${sp.brand_name}`,
            subtitle: clash.reason,
            body: `Your ${sp.brand_name} sponsorship has clashed with your fandom identity.`,
            priority: 'high',
            idempotency_key: `sponsor_clash:${sp.id}:${globalTurnId}`,
          });
        }
      }
    } catch (e) { tourDebug('Sponsor processing error:', e); }

    // Opening act effects
    let openerAttendanceBoost = 1.0;
    try {
      const { data: activeOpeners } = await supabaseAdmin
        .from('tour_opening_acts')
        .select('id, opener_id, revenue_split, attendance_boost, fan_crossover_rate')
        .eq('tour_id', tour.id)
        .eq('status', 'active');
      
      for (const opener of (activeOpeners || [])) {
        openerAttendanceBoost *= N(opener.attendance_boost) || 1.0;
        // Revenue split: opener gets their cut
        if (tourRevenue > 0) {
          const openerCut = Math.floor(tourRevenue * N(opener.revenue_split));
          const sourceRevenue = tourRevenue; // capture pre-cut for debug
          tourRevenue -= openerCut;

          // Stage income credit for post-RPC commit (staging pattern — no direct DB write here)
          if (openerCut > 0 && eventOutcome?.type === 'gig_performed') {
            deltas.opener_tour_credits.push({
              opener_id: opener.opener_id,
              tour_id: tour.id,
              gig_id: gig?.id || '',
              city_id: cityScene?.id || null,
              income: openerCut,
              revenue_split: N(opener.revenue_split),
              source_revenue: sourceRevenue,
            });
            deltas.notifications_to_create.push({
              player_id: opener.opener_id,
              type: 'TOUR_EARNING',
              title: 'Tour Revenue Earned',
              subtitle: `$${openerCut.toLocaleString()} from gig in ${gigCity || tour.region || 'tour'}`,
              body: `${Math.round(N(opener.revenue_split) * 100)}% split on ${tour.tour_name || 'tour'}`,
              priority: 'medium',
              metrics: { tour_id: tour.id, gig_id: gig?.id || null, amount: openerCut, turn: globalTurnId },
              idempotency_key: `tour_earning:${gig?.id || tour.id}:${opener.opener_id}:${globalTurnId}`,
            });
            deltas.turn_events.push({
              global_turn_id: globalTurnId,
              player_id: player.id,
              module: 'touring:opener_benefits',
              event_type: 'opener_income_staged',
              description: `Opener income staged: ${opener.opener_id} +$${openerCut} (${Math.round(N(opener.revenue_split) * 100)}% of $${sourceRevenue})`,
              metadata: {
                opener_id: opener.opener_id,
                tour_id: tour.id,
                gig_id: gig?.id || null,
                city_id: cityScene?.id || null,
                income: openerCut,
                revenue_split: N(opener.revenue_split),
                source_revenue: sourceRevenue,
              },
            });
          }

          // Fan crossover: small chance opener's fans discover headliner (existing)
          const crossoverFans = Math.floor(N(opener.fan_crossover_rate) * (eventOutcome?.attendance || 0));
          if (crossoverFans > 0) {
            deltas.artistProfile.tour_follower_boost = (deltas.artistProfile.tour_follower_boost || 0) + crossoverFans;
          }
        }
      }
    } catch (e) { tourDebug('Opening act processing error:', e); }

    // Setlist vibe calculation for fan reception
    let setlistDrift: Record<string, number> = {};
    try {
      const vibe = tour.setlist_vibe || {};
      if (vibe.deep_cut_ratio !== undefined) {
        setlistDrift = setlistVibeSegmentDrift(vibe);
      }
    } catch { /* non-critical */ }

    // Fan reception update per gig
    const currentFanReception = tour.fan_reception || {};
    const attendanceRatio = eventOutcome?.type === 'gig_performed'
      ? (eventOutcome.attendance / Math.max(1, N(gigs[0]?.capacity) || 500))
      : 0.5;
    const updatedFanReception = computeGigFanReception(
      currentFanReception,
      categoryBonuses,
      setlistDrift,
      sponsorClashEffects,
      attendanceRatio,
    );

    // Era momentum/tension deltas (from tour synergy)
    if (currentEra && (eraMomentumDelta !== 0 || eraTensionDelta !== 0)) {
      deltas.turn_events.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'touring:era_synergy',
        event_type: 'era_tour_synergy',
        description: `Tour-era synergy: momentum ${eraMomentumDelta >= 0 ? '+' : ''}${eraMomentumDelta}, tension ${eraTensionDelta >= 0 ? '+' : ''}${eraTensionDelta}`,
        metadata: { era_id: currentEra.id, momentum_delta: eraMomentumDelta, tension_delta: eraTensionDelta },
      });
    }

    // Choice event generation (15% base chance per gig turn, modified by risk)
    const riskChanceMod = category.risk_level === 'extreme' ? 0.15 : category.risk_level === 'high' ? 0.10 : category.risk_level === 'low' ? -0.05 : 0;
    const choiceEventChance = 0.15 + riskChanceMod;
    if (random() < choiceEventChance && eventOutcome?.type === 'gig_performed') {
      const previousKeys = (tour.state?.choice_event_history || []).map((e: any) => e.key);
      const choiceEvent = selectChoiceEvent(
        { fatigue: currentFatigue, morale: currentMorale, completed_stops: N(tour.completed_stops) },
        category.risk_level || 'medium',
        previousKeys,
      );
      if (choiceEvent) {
        deltas.tour_choice_event_creates.push({
          tour_id: tour.id,
          artist_id: player.id,
          event_key: choiceEvent.key,
          title: choiceEvent.title,
          description: choiceEvent.description,
          choices: choiceEvent.choices,
          auto_default: choiceEvent.auto_default,
          created_turn: globalTurnId,
          status: 'pending',
        });
        deltas.notifications_to_create.push({
          player_id: player.id,
          type: 'TOUR_CHOICE',
          title: `Tour Decision: ${choiceEvent.title}`,
          subtitle: choiceEvent.description,
          body: `You have 1 turn to decide. Options: ${choiceEvent.choices.map((c: any) => c.label).join(', ')}`,
          priority: 'high',
          metrics: { event_key: choiceEvent.key, tour_id: tour.id },
          deep_links: { page: 'Career', params: { openApp: 'touring' } },
          idempotency_key: `tour_choice:${tour.id}:${choiceEvent.key}:${globalTurnId}`,
        });
      }
    }

    // 4. Update Tour State
    const newTotalRevenue = N(tour.total_net_revenue) + tourRevenue;
    const newTotalAttendance = N(tour.stats?.attendance || tour.total_attendance) + (eventOutcome?.attendance || 0);
    const completedStops = N(tour.completed_stops) + 1;

    deltas.tour_updates.push({
      id: tour.id,
      patch: {
        turns_remaining: tour.turns_remaining - 1,
        completed_stops: completedStops,
        shows_completed: eventOutcome?.type === 'gig_performed' ? N(tour.shows_completed) + 1 : N(tour.shows_completed),
        fatigue: currentFatigue,
        morale: currentMorale,
        crew_morale: crewMoraleAvg,
        fan_reception: updatedFanReception,
        total_net_revenue: newTotalRevenue,
        actual_revenue: newTotalRevenue,
        total_attendance: newTotalAttendance,
        state: {
          ...(tour.state || {}),
          fatigue: currentFatigue,
          morale: currentMorale,
          last_event: triggeredEvent ? triggeredEvent.id : (tour.state?.last_event || null),
          last_event_text: triggeredEvent ? triggeredEvent.text : (tour.state?.last_event_text || null),
          event_history: triggeredEvent 
            ? [
                { id: triggeredEvent.id, text: triggeredEvent.text, type: triggeredEvent.type, turn: globalTurnId },
                ...((tour.state?.event_history || []).slice(0, 9))
              ]
            : (tour.state?.event_history || []),
          // Track choice event history for dedup
          choice_event_history: deltas.tour_choice_event_creates
            .filter((c: any) => c.tour_id === tour.id)
            .map((c: any) => ({ key: c.event_key, turn: globalTurnId }))
            .concat((tour.state?.choice_event_history || []).slice(0, 19)),
        },
        stats: {
          ...tour.stats,
          attendance: newTotalAttendance,
          revenue: newTotalRevenue,
          crew_salary_total: N(tour.stats?.crew_salary_total) + crewSalaryCost,
        }
      }
    });

    // 5. Update Player Stats — use additive deltas, not absolute overwrites
    // These are resolved in turnEngine commit phase before DB write.
    if (tourRevenue !== 0) {
      deltas.artistProfile.tour_income_boost = (deltas.artistProfile.tour_income_boost || 0) + tourRevenue;
    }
    if (tourHype > 0) {
      // Add tour hype as an additive delta, not an absolute overwrite
      deltas.artistProfile.tour_hype_boost = (deltas.artistProfile.tour_hype_boost || 0) + tourHype;
    }
    if (tourFans > 0) {
      deltas.artistProfile.tour_follower_boost = (deltas.artistProfile.tour_follower_boost || 0) + tourFans;
    }

    // 5b. REGIONAL CLOUT — build localized influence from touring
    if (tour.region && eventOutcome?.type === 'gig_performed') {
      const currentRegionalClout = { ...(player.regional_clout || {}) };
      const regionKey = tour.region;
      const currentRegionVal = N(currentRegionalClout[regionKey]);
      // Gain 2-5 regional clout per gig, scaled by attendance fill rate
      const regionalGain = Math.floor(2 + (eventOutcome.fill_rate || 0.5) * 3);
      currentRegionalClout[regionKey] = currentRegionVal + regionalGain;
      deltas.artistProfile.regional_clout = currentRegionalClout;
    }
    
    // 6. Turn Metrics for Reports
    deltas.turn_metrics.touring_revenue = (deltas.turn_metrics.touring_revenue || 0) + tourRevenue;
    if (eventOutcome?.type === 'gig_performed') {
      deltas.turn_metrics.gigs_completed = (deltas.turn_metrics.gigs_completed || 0) + 1;
    }
  }

  return { success: true, deltas };
}

// ═══════════════════════════════════════════════════════════════════
// UNDERGROUND EVENTS SYSTEM
// ═══════════════════════════════════════════════════════════════════

const UNDERGROUND_EVENT_TYPES: Record<string, {
  name: string;
  minClout: number;
  energyCost: number;
  hostCost: number;
  baseFame: number;
  baseRevenue: number;
  baseHype: number;
  baseClout: number;
  capacity: number;
  description: string;
}> = {
  'open_mic': {
    name: 'Open Mic Night',
    minClout: 0,
    energyCost: 15,
    hostCost: 500,
    baseFame: 5,
    baseRevenue: 100,
    baseHype: 2,
    baseClout: 1,
    capacity: 50,
    description: 'Low-key performance spot for emerging artists'
  },
  'showcase': {
    name: 'Regional Showcase',
    minClout: 10,
    energyCost: 20,
    hostCost: 2000,
    baseFame: 15,
    baseRevenue: 500,
    baseHype: 5,
    baseClout: 3,
    capacity: 150,
    description: 'Spotlight for rising underground talent'
  },
  'battle': {
    name: 'Artist Battle',
    minClout: 25,
    energyCost: 25,
    hostCost: 5000,
    baseFame: 25,
    baseRevenue: 1000,
    baseHype: 8,
    baseClout: 5,
    capacity: 200,
    description: 'Head-to-head competition for underground MCs'
  },
  'collab_night': {
    name: 'Collaboration Night',
    minClout: 15,
    energyCost: 20,
    hostCost: 3000,
    baseFame: 12,
    baseRevenue: 400,
    baseHype: 6,
    baseClout: 4,
    capacity: 100,
    description: 'Connect with other artists, producers, and DJs'
  },
  'radio': {
    name: 'Underground Radio',
    minClout: 40,
    energyCost: 10,
    hostCost: 8000,
    baseFame: 30,
    baseRevenue: 800,
    baseHype: 10,
    baseClout: 6,
    capacity: -1,
    description: 'Live streaming underground discoveries and rare tracks'
  },
  'block_party': {
    name: 'Block Party',
    minClout: 50,
    energyCost: 30,
    hostCost: 10000,
    baseFame: 40,
    baseRevenue: 2000,
    baseHype: 12,
    baseClout: 8,
    capacity: 500,
    description: 'Massive outdoor event with multiple stages'
  },
  'listening_party': {
    name: 'Listening Party',
    minClout: 20,
    energyCost: 15,
    hostCost: 3000,
    baseFame: 10,
    baseRevenue: 300,
    baseHype: 7,
    baseClout: 3,
    capacity: 80,
    description: 'Exclusive preview of new music with fans'
  },
  'festival_slot': {
    name: 'Festival Slot',
    minClout: 75,
    energyCost: 35,
    hostCost: 20000,
    baseFame: 60,
    baseRevenue: 5000,
    baseHype: 15,
    baseClout: 12,
    capacity: 1000,
    description: 'Headline a regional underground festival'
  }
};

const EVENT_VENUE_NAMES: Record<string, string[]> = {
  'United States': ['The Basement', 'Warehouse 23', 'The Velvet Room', 'Neon Alley', 'The Cipher'],
  'Canada': ['The Hideout', 'Maple Room', 'Northern Lights Lounge', 'The Rink'],
  'UK': ['The Underground', 'Brixton Vault', 'Camden Cellar', 'The Crypt'],
  'Europe': ['Le Cave', 'Der Keller', 'Studio Noir', 'The Bunker'],
  'Asia': ['Neon District', 'The Zen Room', 'Shibuya Underground', 'K-Town Live'],
  'Latin America': ['La Cueva', 'El Sótano', 'Barrio Sessions', 'Favela Sound'],
  'Africa': ['The Compound', 'Lagos Nights', 'Jozi Underground', 'Nairobi Beats'],
  'Oceania': ['The Outback Room', 'Sydney Cellar', 'Kiwi Underground', 'The Reef'],
};

const GIG_OPPORTUNITY_TYPES = new Set(['open_mic', 'showcase', 'battle', 'collab_night', 'radio']);
const UNDERGROUND_COMPLIANCE_MODES = new Set(['stealth', 'balanced', 'permitted']);

function sanitizePermitTier(input: any): 'none' | 'basic' | 'standard' | 'premium' {
  if (input === 'basic' || input === 'standard' || input === 'premium') return input;
  if (input === 'none') return input;
  return 'none';
}

function getActiveUndergroundPermit(player: any, globalTurnId: number): { tier: 'basic' | 'standard' | 'premium'; expiresTurn: number } | null {
  const permit = player?.stats?.underground_permit;
  if (!permit || permit.status !== 'active') return null;
  const tier = sanitizePermitTier(permit.tier);
  if (tier === 'none') return null;
  const expiresTurn = N(permit.expires_turn);
  if (expiresTurn <= 0 || globalTurnId > expiresTurn) return null;
  return { tier, expiresTurn };
}

function sanitizeComplianceMode(input: any): 'stealth' | 'balanced' | 'permitted' {
  const candidate = String(input || '').toLowerCase();
  if (UNDERGROUND_COMPLIANCE_MODES.has(candidate)) return candidate as 'stealth' | 'balanced' | 'permitted';
  return 'balanced';
}

function getComplianceModeModifiers(mode: 'stealth' | 'balanced' | 'permitted') {
  if (mode === 'stealth') {
    return {
      riskMult: 0.72,
      vibeBonus: -5,
      promoIntensityMult: 0.75,
      label: 'Low profile',
    };
  }
  if (mode === 'permitted') {
    return {
      riskMult: 1.08,
      vibeBonus: 7,
      promoIntensityMult: 1.2,
      label: 'High visibility',
    };
  }

  return {
    riskMult: 1,
    vibeBonus: 0,
    promoIntensityMult: 1,
    label: 'Balanced',
  };
}

function computeUndergroundSceneTier(points: number): 'outsider' | 'name_buzzing' | 'scene_staple' | 'scene_influencer' {
  if (points >= 220) return 'scene_influencer';
  if (points >= 120) return 'scene_staple';
  if (points >= 45) return 'name_buzzing';
  return 'outsider';
}

async function getCurrentGlobalTurnId(entities: any): Promise<number> {
  const turnStates = await entities.TurnState.list('-id', 1).catch(() => []);
  const turnId = N(turnStates?.[0]?.global_turn_id);
  if (!turnId) {
    console.warn('[touringManager] turn_state empty — using turnId=0 fallback');
    return 0;
  }
  return turnId;
}

function inferTurnsAheadFromScheduledDate(scheduledDate: any, fallbackTurnsAhead = 1): number {
  const parsed = scheduledDate ? new Date(scheduledDate) : null;
  const scheduledMs = parsed?.getTime?.();
  if (!Number.isFinite(scheduledMs)) return fallbackTurnsAhead;

  const diffMs = scheduledMs - Date.now();
  if (diffMs <= 0) return 1;

  return Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
}

function shouldProcessUndergroundEventThisTurn(event: any, globalTurnId: number, now = new Date()): boolean {
  const scheduledTurn = N(event?.scheduled_turn);
  if (scheduledTurn > 0) {
    return scheduledTurn <= globalTurnId;
  }

  const scheduledDate = event?.scheduled_date ? new Date(event.scheduled_date) : null;
  if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
    return true;
  }

  return scheduledDate <= now;
}

async function resolveCityScene(cityName?: string | null, region?: string | null): Promise<any | null> {
  const normalizedCity = typeof cityName === 'string' ? normalizeCityName(cityName.trim()) : '';
  const normalizedRegion = typeof region === 'string' ? region.trim() : '';

  if (normalizedCity) {
    const { data: byCity } = await supabaseAdmin
      .from('city_scenes')
      .select('id, city_name, region, scene_vibe, controversy_tolerance, trending_genre, genre_weights')
      .eq('city_name', normalizedCity)
      .limit(1);
    if (byCity?.[0]) return byCity[0];
  }

  if (normalizedRegion) {
    const { data: byRegion } = await supabaseAdmin
      .from('city_scenes')
      .select('id, city_name, region, scene_vibe, controversy_tolerance, trending_genre, genre_weights, scene_tier')
      .eq('region', normalizedRegion)
      .order('scene_tier', { ascending: false })
      .limit(1);
    if (byRegion?.[0]) return byRegion[0];
  }

  return null;
}

function getUndergroundEventAccessConfig(event: any) {
  const soundburst = event?.metadata?.soundburst && typeof event.metadata.soundburst === 'object'
    ? event.metadata.soundburst
    : {};
  const rawCallType = typeof soundburst.callType === 'string'
    ? soundburst.callType
    : (typeof event?.call_type === 'string' ? event.call_type : 'open');
  const invitedPlayerIds = Array.isArray(soundburst.invitedPlayerIds)
    ? soundburst.invitedPlayerIds.filter((value: any) => typeof value === 'string' && value.trim().length > 0)
    : (Array.isArray(event?.invited_player_ids)
      ? event.invited_player_ids.filter((value: any) => typeof value === 'string' && value.trim().length > 0)
      : []);

  return {
    callType: String(rawCallType || 'open').toLowerCase() === 'invite_only' ? 'invite_only' : 'open',
    invitedPlayerIds,
  };
}

function canArtistAccessUndergroundEvent(event: any, artistId: string) {
  const access = getUndergroundEventAccessConfig(event);
  if (access.callType !== 'invite_only') return true;
  if (event?.hosted_by === artistId || event?.artist_id === artistId) return true;
  return access.invitedPlayerIds.includes(artistId);
}

/**
 * Alias for underground-gig specific browsing in the Soundburst flow.
 */
export async function getGigOpportunities(entities: any, artistId: string, rng?: any, filters?: { city?: string; eventType?: string; timeFilter?: string }) {
  const base = await getAvailableEvents(entities, artistId, rng);
  const artist = await entities.ArtistProfile.get(artistId);
  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const activePermit = getActiveUndergroundPermit(artist, globalTurnId);
  let opportunities = (base.events || []).filter((event: any) => {
    return event?.status === 'available' && GIG_OPPORTUNITY_TYPES.has(String(event?.event_type || ''));
  });

  // M6: Apply filters
  if (filters?.eventType) {
    opportunities = opportunities.filter((e: any) => e.event_type === filters.eventType);
  }
  if (filters?.city) {
    const filterCity = normalizeCityName(filters.city);
    opportunities = opportunities.filter((e: any) => normalizeCityName(e.city || '') === filterCity);
  }
  if (filters?.timeFilter && filters.timeFilter !== 'all') {
    const turnWindows: Record<string, [number, number]> = {
      tonight: [globalTurnId, globalTurnId + 1],
      this_week: [globalTurnId, globalTurnId + 7],
      next_week: [globalTurnId + 7, globalTurnId + 14],
    };
    const window = turnWindows[filters.timeFilter];
    if (window) {
      opportunities = opportunities.filter((e: any) => {
        const st = N(e.scheduled_turn);
        return st >= window[0] && st <= window[1];
      });
    }
  }

  const projectedOpportunities = await Promise.all(opportunities.map(async (event: any) => {
    const cityScene = await resolveCityScene(event.city, event.region);
    const undergroundVibe = N(cityScene?.scene_vibe?.underground) || 0.45;
    const eventMeta = { ...(event.metadata || {}) };
    const complianceMode = sanitizeComplianceMode(eventMeta.compliance_mode || 'balanced');
    const compliance = getComplianceModeModifiers(complianceMode);
    const permitTier = activePermit?.tier || sanitizePermitTier(eventMeta.permit_tier || 'none');
    const promo = clampNumber(N(eventMeta.promotion_boost_pct), 0, 0.5);
    const teaserHeat = clampNumber(N(eventMeta.teaser_heat), 0, 60);

    const rawVibe = computeShowVibeScore({
      artistClout: N(artist?.clout),
      artistHype: N(artist?.hype),
      undergroundVibe,
      promotionBoostPct: promo,
    });
    const vibeScore = clampNumber(rawVibe + compliance.vibeBonus, 10, 100);
    const detectionRisk = computeUndergroundDetectionRisk({
      baseRisk: clampNumber(N(eventMeta.detection_risk_base) || 0.15, 0.02, 0.8) * compliance.riskMult,
      cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
      permitTier,
      heatLevel: clampNumber(N(artist?.hype) / 100, 0, 1),
      promoIntensity: clampNumber((promo + teaserHeat / 100) * compliance.promoIntensityMult, 0, 1),
    });

    const expectedAttendanceRatio = clampNumber(0.48 + ((vibeScore - 50) / 180) - detectionRisk * 0.22, 0.2, 1.15);
    const expectedAttendance = event.capacity > 0 ? Math.floor(N(event.capacity) * expectedAttendanceRatio) : 0;
    const expectedRevenue = Math.floor(N(event.gross_revenue) * (0.8 + expectedAttendanceRatio * 0.7));

    return {
      ...event,
      metadata: {
        ...eventMeta,
        compliance_mode: complianceMode,
        permit_tier: permitTier,
        underground_projection: {
          vibe_score: vibeScore,
          detection_risk: detectionRisk,
          expected_attendance: expectedAttendance,
          expected_revenue: expectedRevenue,
          expected_attendance_ratio: expectedAttendanceRatio,
          compliance_label: compliance.label,
        },
      },
    };
  }));

  const sceneStats = artist?.stats?.underground_scene || {};
  const scenePoints = Math.max(0, Math.floor(N(sceneStats.points)));
  const sceneTier = computeUndergroundSceneTier(scenePoints);

  // M6: Resolve host names for events with hosted_by
  const hostIds = [...new Set(projectedOpportunities.map((e: any) => e.hosted_by).filter(Boolean))];
  const hostNameMap: Record<string, string> = {};
  if (hostIds.length > 0) {
    const { data: hosts } = await supabaseAdmin
      .from('profiles')
      .select('id, artist_name')
      .in('id', hostIds);
    if (hosts) {
      for (const h of hosts) hostNameMap[h.id] = h.artist_name;
    }
  }

  // M6: NPC overlay — genre affinity mapping per event type
  const EVENT_GENRE_AFFINITY: Record<string, string[]> = {
    battle: ['Hip-Hop', 'Rap'],
    collab_night: ['R&B', 'Soul', 'Electronic', 'Pop'],
    block_party: ['Hip-Hop', 'Afrobeats', 'Dancehall'],
  };

  // Load scene contacts for the player's region for NPC overlay
  const region = artist?.region || 'United States';
  const npcOverlayResult = await getSceneContacts(entities, artistId, { region });
  const regionContacts = npcOverlayResult.contacts || [];

  // Enrich events with host name + NPC overlay
  const enriched = projectedOpportunities.map((e: any) => {
    const hostedByName = e.hosted_by ? (hostNameMap[e.hosted_by] || null) : null;

    // NPC overlay: find a contact matching this event type's genre affinity
    let npcOverlay = null;
    const affinityGenres = EVENT_GENRE_AFFINITY[e.event_type];
    if (affinityGenres) {
      const match = regionContacts.find((c: any) =>
        affinityGenres.some((g: string) => (c.genre_preference || '').toLowerCase().includes(g.toLowerCase()))
      );
      if (match) {
        npcOverlay = { contact_name: match.name, contact_role: match.role, relationship_level: match.relationship_level };
      }
    } else {
      // Fallback: match first contact in same city
      const cityMatch = regionContacts.find((c: any) => c.city_name === e.city);
      if (cityMatch) {
        npcOverlay = { contact_name: cityMatch.name, contact_role: cityMatch.role, relationship_level: cityMatch.relationship_level };
      }
    }

    return { ...e, hosted_by_name: hostedByName, npc_overlay: npcOverlay };
  });

  // M6: Group into sections by event_type
  const sectionMap: Record<string, any[]> = {};
  for (const e of enriched) {
    const type = e.event_type || 'other';
    if (!sectionMap[type]) sectionMap[type] = [];
    sectionMap[type].push(e);
  }
  const sections = Object.entries(sectionMap).map(([type, events]) => ({ type, events }));

  return {
    ...base,
    opportunities: enriched,
    sections,
    undergroundSummary: {
      permit: activePermit,
      complianceModes: ['stealth', 'balanced', 'permitted'],
      scenePoints,
      sceneTier,
      undergroundHeat: clampNumber(N(artist?.stats?.underground_heat), 0, 100),
    },
  };
}

/**
 * Low-risk entry action to immediately join a nearby open mic.
 */
export async function joinOpenMic(entities: any, artistId: string, rng?: any) {
  const random = rng?.random ? () => rng.random() : Math.random;
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const energyCost = 12;
  if (N(artist.energy) < energyCost) {
    throw new Error(`Need ${energyCost} energy (have ${N(artist.energy)})`);
  }

  const region = artist.region || 'United States';
  const city = resolveEventCity(region, artist.current_city);
  const venues = EVENT_VENUE_NAMES[region] || EVENT_VENUE_NAMES['United States'];
  const venue = venues[Math.floor(random() * venues.length)];
  const scheduledDate = new Date();
  scheduledDate.setHours(scheduledDate.getHours() + 1);

  const event = await entities.TourEvent.create({
    event_name: `Open Mic at ${venue}`,
    event_type: 'open_mic',
    venue,
    city,
    region,
    artist_id: artistId,
    status: 'booked',
    capacity: 60,
    ticket_price: 0,
    energy_cost: energyCost,
    fame_gained: 6,
    hype_gained: 4,
    clout_gained: 2,
    gross_revenue: 150,
    scheduled_date: scheduledDate.toISOString(),
    thumbnail_url: getEventThumbnail('open_mic', region),
    metadata: {
      source: 'join_open_mic',
      min_clout: 0,
      description: 'Grassroots room with a discovery-first audience',
    },
    created_at: new Date().toISOString(),
  });

  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - energyCost,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    event,
    energySpent: energyCost,
  };
}

/**
 * Buy a temporary permit that lowers raid/detection risk for underground shows.
 */
export async function securePermit(entities: any, artistId: string, permitTier: 'basic' | 'standard' | 'premium' = 'standard') {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const tier = sanitizePermitTier(permitTier);
  if (tier === 'none') throw new Error('Invalid permit tier');

  const permitCostByTier: Record<'basic' | 'standard' | 'premium', number> = {
    basic: 1200,
    standard: 2500,
    premium: 5000,
  };

  const cost = permitCostByTier[tier];
  if (N(artist.income) < cost) {
    throw new Error(`Need $${cost.toLocaleString()} to secure permit (have $${N(artist.income).toLocaleString()})`);
  }

  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const expiresTurn = globalTurnId + 28;
  const stats = { ...(artist.stats || {}) };
  stats.underground_permit = {
    status: 'active',
    tier,
    issued_turn: globalTurnId,
    expires_turn: expiresTurn,
    risk_reduction: tier === 'premium' ? 0.24 : tier === 'standard' ? 0.15 : 0.08,
  };

  await entities.ArtistProfile.update(artistId, {
    income: N(artist.income) - cost,
    stats,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    permit: stats.underground_permit,
    moneySpent: cost,
  };
}

/**
 * Organize your own underground show using permit + local vibe context.
 */
export async function organizeUndergroundShow(
  entities: any,
  artistId: string,
  payload: Record<string, any> = {},
  rng?: any,
) {
  const random = rng?.random ? () => rng.random() : Math.random;
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const wizardConfig = normalizeSoundburstWizardConfig(payload);
  if (!UNDERGROUND_EVENT_TYPES[wizardConfig.eventType]) {
    throw new Error(`Invalid event type: ${wizardConfig.eventType}`);
  }
  if (wizardConfig.eventType === 'radio' || wizardConfig.eventType === 'festival_slot') {
    throw new Error(`Unsupported event type for underground wizard: ${wizardConfig.eventType}`);
  }

  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const permit = getActiveUndergroundPermit(artist, globalTurnId);
  if (!permit) {
    throw new Error('Active underground permit required. Use securePermit first.');
  }

  const eventTypeConfig = UNDERGROUND_EVENT_TYPES[wizardConfig.eventType];
  const energyCost = N(eventTypeConfig.energyCost);
  const hostingCost = N(eventTypeConfig.hostCost);
  if (N(artist.energy) < energyCost) throw new Error(`Need ${energyCost} energy (have ${N(artist.energy)})`);
  if (N(artist.income) < hostingCost) throw new Error(`Need $${hostingCost.toLocaleString()} (have $${N(artist.income).toLocaleString()})`);

  const region = wizardConfig.region || artist.region || 'United States';
  const city = wizardConfig.city || resolveEventCity(region, artist.current_city);
  const venues = EVENT_VENUE_NAMES[region] || EVENT_VENUE_NAMES['United States'];
  const venue = venues[Math.floor(random() * venues.length)];
  const scheduledTurnsAhead = wizardConfig.scheduledTurnsAhead;
  const scheduledDate = new Date();
  scheduledDate.setHours(scheduledDate.getHours() + scheduledTurnsAhead);

  const cityScene = await resolveCityScene(city, region);
  const undergroundVibe = N(cityScene?.scene_vibe?.underground) || 0.45;
  const compliance = getComplianceModeModifiers(wizardConfig.complianceMode);
  const rawVibeScore = computeShowVibeScore({
    artistClout: N(artist.clout),
    artistHype: N(artist.hype),
    undergroundVibe,
    promotionBoostPct: 0,
  });
  const vibeScore = clampNumber(rawVibeScore + compliance.vibeBonus, 10, 100);

  const detectionRisk = computeUndergroundDetectionRisk({
    baseRisk: 0.18 * compliance.riskMult,
    cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
    permitTier: permit.tier,
    heatLevel: clampNumber(N(artist.hype) / 100, 0, 1),
    promoIntensity: clampNumber(0.1 * compliance.promoIntensityMult, 0, 1),
  });

  const resolvedEventName = wizardConfig.eventName || `Underground ${UNDERGROUND_EVENT_TYPES[wizardConfig.eventType].name} at ${venue}`;
  const soundburstToPersist = {
    ...wizardConfig,
    eventName: resolvedEventName,
    city,
    region,
  };

  const metadataBase = {
    organizer_mode: true,
    compliance_mode: wizardConfig.complianceMode,
    compliance_label: compliance.label,
    compliance_updated_turn: globalTurnId,
    permit_tier: permit.tier,
    permit_expires_turn: permit.expiresTurn,
    detection_risk_base: detectionRisk,
    vibe_score: vibeScore,
    promotion_boost_pct: 0,
    teaser_heat: 0,
    scene_city_id: cityScene?.id || null,
  };
  const metadata = mergeTourEventMetadataWithSoundburst(metadataBase, soundburstToPersist);

  // Extract v2 fields (with safe defaults for v1 payloads)
  const isV2 = wizardConfig.v === 2;
  const callType = isV2 ? (wizardConfig as any).callType : 'open';
  const focusChoice = isV2 ? (wizardConfig as any).focusChoice : null;
  const securityMode = isV2 ? (wizardConfig as any).securityMode : 'none';
  const socialPlatforms = isV2 ? (wizardConfig as any).socialPlatforms : [];
  const slots = isV2 ? (wizardConfig as any).slots : 4;
  const invitedPlayerIds = isV2 ? (wizardConfig as any).invitedPlayerIds : [];
  const invitedNpcIds = isV2 ? (wizardConfig as any).invitedNpcIds : [];

  // M9: Compute initial promo boost from social platforms + mood (mood not available at booking time, pass null)
  const initialPromoBoost = computePromoBoost(socialPlatforms, null);
  if (initialPromoBoost > 0) {
    metadata.soundburst = metadata.soundburst || {};
    metadata.soundburst.initial_promo_boost = initialPromoBoost;
  }

  const event = await entities.TourEvent.create({
    event_name: resolvedEventName,
    event_type: wizardConfig.eventType,
    venue,
    city,
    region,
    artist_id: artistId,
    hosted_by: artistId,
    status: 'booked',
    capacity: Math.floor(120 + N(artist.clout) * 2.5),
    ticket_price: Math.max(12, Math.floor(10 + N(artist.clout) / 8)),
    energy_cost: energyCost,
    hosting_cost: hostingCost,
    fame_gained: 18,
    hype_gained: 10,
    clout_gained: 6,
    gross_revenue: Math.floor(2200 + vibeScore * 12),
    scheduled_turn: globalTurnId + scheduledTurnsAhead,
    scheduled_date: scheduledDate.toISOString(),
    thumbnail_url: getEventThumbnail(wizardConfig.eventType, city),
    call_type: callType,
    focus_choice: focusChoice,
    security_mode: securityMode,
    social_platforms: socialPlatforms,
    slots,
    invited_player_ids: invitedPlayerIds,
    invited_npc_ids: invitedNpcIds,
    metadata,
    created_at: new Date().toISOString(),
  });

  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - energyCost,
    income: N(artist.income) - hostingCost,
    updated_at: new Date().toISOString(),
  });

  // M4: Fire-and-forget invitation notifications for invite-only events
  if (callType === 'invite_only' && invitedPlayerIds.length > 0) {
    const eventName = event?.event_name || resolvedEventName || 'Underground Event';
    const artistName = artist.artist_name || 'An artist';
    const invitationFields = {
      event_id: event?.id,
      host_id: artistId,
      host_name: artistName,
      city,
      event_type: wizardConfig.eventType,
      event_name: eventName,
    };
    for (const inviteeId of invitedPlayerIds) {
      insertNotificationIdempotent(supabaseAdmin, {
        player_id: inviteeId,
        type: 'event_invitation',
        title: 'Event Invitation',
        subtitle: `${artistName} invited you to ${eventName}.`,
        body: `${artistName} invited you to "${eventName}" in ${city}.`,
        priority: 'high',
        metrics: invitationFields,
        payload: {
          ...invitationFields,
          call_type: callType,
        },
        deep_links: [
          { label: 'View Soundburst Events', route: 'SoundburstApp', params: { tab: 'events', eventId: event?.id } },
        ],
        idempotency_key: `event_invite_${event?.id}_${inviteeId}`,
        is_read: false,
        created_at: new Date().toISOString(),
      }, 'soundburst-invite').catch(() => {});
    }
  }

  return {
    success: true,
    event,
    detectionRisk,
    vibeScore,
    energySpent: energyCost,
    moneySpent: hostingCost,
  };
}

/**
 * Fast-path action for events that should be executed in the very next turn.
 */
export async function performAtEvent(entities: any, artistId: string, eventId: string, setlist?: string[]) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');
  const currentTurn = await getCurrentGlobalTurnId(entities);

  const event = await entities.TourEvent.get(eventId);
  if (!event) throw new Error('Event not found');

  if (event.status === 'completed') {
    throw new Error('Event already completed');
  }

  if (event.status === 'available') {
    await bookEvent(entities, artistId, eventId);
  } else if (event.status === 'booked' && event.artist_id !== artistId) {
    throw new Error('This event is booked by another artist');
  }

  await entities.TourEvent.update(eventId, {
    artist_id: artistId,
    status: 'booked',
    scheduled_turn: currentTurn + 1,
    scheduled_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      ...(event.metadata || {}),
      setlist: setlist || [],
      performance_status: 'performed_pending_turn',
      performance_marked_turn: currentTurn,
      performance_marked_at: new Date().toISOString(),
    },
  });

  return {
    success: true,
    eventId,
    message: 'Event marked for immediate processing on next turn tick.',
  };
}

/**
 * Paid Soundburst push that improves turnout but increases detection pressure.
 */
export async function promoteOnSoundburst(entities: any, artistId: string, eventId: string, budget = 750) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const event = await entities.TourEvent.get(eventId);
  if (!event) throw new Error('Event not found');
  if (event.artist_id !== artistId) throw new Error('Event does not belong to artist');
  if (event.status !== 'booked') throw new Error('Only booked events can be promoted');

  const spend = Math.max(100, Math.min(5000, Math.floor(N(budget) || 750)));
  const energyCost = 8;
  if (N(artist.energy) < energyCost) throw new Error(`Need ${energyCost} energy (have ${N(artist.energy)})`);
  if (N(artist.income) < spend) throw new Error(`Need $${spend.toLocaleString()} (have $${N(artist.income).toLocaleString()})`);

  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const currentMeta = { ...(event.metadata || {}) };
  const complianceMode = sanitizeComplianceMode(currentMeta.compliance_mode || 'balanced');
  const compliance = getComplianceModeModifiers(complianceMode);
  const priorBoost = clampNumber(N(currentMeta.promotion_boost_pct), 0, 0.5);
  const boostDelta = clampNumber(spend / 15000, 0.03, 0.30);
  const nextBoost = clampNumber(priorBoost + boostDelta, 0, 0.50);

  const cityScene = await resolveCityScene(event.city, event.region);
  const detectionRisk = computeUndergroundDetectionRisk({
    baseRisk: clampNumber(N(currentMeta.detection_risk_base) || 0.16, 0.02, 0.8),
    cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
    permitTier: sanitizePermitTier(currentMeta.permit_tier || 'none'),
    heatLevel: clampNumber(N(artist.hype) / 100, 0, 1),
    promoIntensity: clampNumber(nextBoost * compliance.promoIntensityMult, 0, 1),
  });

  await entities.TourEvent.update(eventId, {
    metadata: {
      ...currentMeta,
      promotion_boost_pct: nextBoost,
      detection_risk_base: detectionRisk,
      compliance_mode: complianceMode,
      promo_pushes: N(currentMeta.promo_pushes) + 1,
      last_promo_turn: globalTurnId,
    },
    updated_at: new Date().toISOString(),
  });

  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - energyCost,
    income: N(artist.income) - spend,
    updated_at: new Date().toISOString(),
  });

  const caption = `Pull up to ${event.event_name || 'my underground set'} this week. Limited capacity.`;
  const post = await entities.SocialPost.create({
    artist_id: artistId,
    platform: 'soundburst',
    post_type: 'announcement',
    status: 'published',
    caption,
    title: 'Underground Event Promo',
    event_reference_id: eventId,
    event_type: 'underground_promo',
    energy_cost: energyCost,
    posted_turn: globalTurnId,
    is_promoted: true,
    metadata: {
      source: 'promoteOnSoundburst',
      spend,
      boost_delta: boostDelta,
    },
  });

  return {
    success: true,
    postId: post.id,
    boostApplied: boostDelta,
    totalBoost: nextBoost,
    detectionRisk,
    energySpent: energyCost,
    moneySpent: spend,
  };
}

/**
 * Lower-cost teaser post that increases anticipation with moderate risk pressure.
 */
export async function dropTeaserPost(entities: any, artistId: string, eventId: string) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const event = await entities.TourEvent.get(eventId);
  if (!event) throw new Error('Event not found');
  if (event.artist_id !== artistId) throw new Error('Event does not belong to artist');
  if (event.status !== 'booked') throw new Error('Only booked events can receive teaser posts');

  const energyCost = 5;
  if (N(artist.energy) < energyCost) throw new Error(`Need ${energyCost} energy (have ${N(artist.energy)})`);

  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const currentMeta = { ...(event.metadata || {}) };
  const complianceMode = sanitizeComplianceMode(currentMeta.compliance_mode || 'balanced');
  const compliance = getComplianceModeModifiers(complianceMode);
  const teaserHeat = clampNumber(N(currentMeta.teaser_heat) + 8, 0, 60);
  const boostFromTeaser = clampNumber(teaserHeat / 240, 0, 0.25);
  const currentPromo = clampNumber(N(currentMeta.promotion_boost_pct), 0, 0.5);
  const nextPromo = clampNumber(currentPromo + boostFromTeaser * 0.2, 0, 0.5);

  const cityScene = await resolveCityScene(event.city, event.region);
  const detectionRisk = computeUndergroundDetectionRisk({
    baseRisk: clampNumber(N(currentMeta.detection_risk_base) || 0.14, 0.02, 0.8),
    cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
    permitTier: sanitizePermitTier(currentMeta.permit_tier || 'none'),
    heatLevel: clampNumber(N(artist.hype) / 100, 0, 1),
    promoIntensity: clampNumber(nextPromo * compliance.promoIntensityMult, 0, 1),
  });

  await entities.TourEvent.update(eventId, {
    metadata: {
      ...currentMeta,
      teaser_heat: teaserHeat,
      promotion_boost_pct: nextPromo,
      detection_risk_base: detectionRisk,
      compliance_mode: complianceMode,
      last_teaser_turn: globalTurnId,
    },
    updated_at: new Date().toISOString(),
  });

  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - energyCost,
    updated_at: new Date().toISOString(),
  });

  const post = await entities.SocialPost.create({
    artist_id: artistId,
    platform: 'soundburst',
    post_type: 'teaser',
    status: 'published',
    caption: `Something underground is loading... ${event.venue || 'secret location'}`,
    title: 'Teaser Drop',
    event_reference_id: eventId,
    event_type: 'underground_teaser',
    energy_cost: energyCost,
    posted_turn: globalTurnId,
    metadata: {
      source: 'dropTeaserPost',
      teaser_heat: teaserHeat,
    },
  });

  return {
    success: true,
    postId: post.id,
    teaserHeat,
    detectionRisk,
    energySpent: energyCost,
  };
}

/**
 * Get available underground events for a player's region
 */
export async function getAvailableEvents(entities: any, artistId: string, rng?: any) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');
  
  // Use provided RNG or fallback to Math.random for API calls
  const random = rng?.random ? () => rng.random() : Math.random;
  const currentTurn = await getCurrentGlobalTurnId(entities);

  const region = artist.region || 'United States';
  const city = resolveEventCity(region, artist.current_city);

  // Fetch existing available events in this region
  const existingEvents = await entities.TourEvent.filter({
    region: region,
    status: 'available'
  }).catch(() => []);
  const visibleExistingEvents = existingEvents.filter((event: any) => canArtistAccessUndergroundEvent(event, artistId));

  // Pool target: 15 events per region so 10–15 concurrent players always have gigs to grab
  const POOL_TARGET = 15;
  if (visibleExistingEvents.length >= POOL_TARGET) {
    return {
      events: visibleExistingEvents,
      eventTypes: UNDERGROUND_EVENT_TYPES,
      playerClout: N(artist.clout),
      playerRegion: region
    };
  }

  // Generate new events for this region
  const venues = EVENT_VENUE_NAMES[region] || EVENT_VENUE_NAMES['United States'];
  const eventTypeKeys = Object.keys(UNDERGROUND_EVENT_TYPES);
  const newEvents = [];

  // Generate enough to fill the pool (12–16 new events, all event types represented)
  const deficit = POOL_TARGET - visibleExistingEvents.length;
  const numToGenerate = Math.max(deficit, 12 + Math.floor(random() * 5));
  // Pre-generate batch thumbnails per event type to avoid collisions
  const batchThumbnails: Record<string, string[]> = {};
  const batchIndex: Record<string, number> = {};

  // Shuffle type list to ensure variety — cycle through all types before repeating
  const shuffledTypes = [...eventTypeKeys].sort(() => random() - 0.5);

  for (let i = 0; i < numToGenerate; i++) {
    // Round-robin through types so all 8 event types appear in every large batch
    const typeKey = shuffledTypes[i % shuffledTypes.length];
    const config = UNDERGROUND_EVENT_TYPES[typeKey];
    const venue = venues[Math.floor(random() * venues.length)];

    // Schedule 0-2 turns ahead so events are immediately playable (same-turn completable)
    // 60% same turn, 30% +1, 10% +2 — keeps urgency without locking players out
    const rng = random();
    const turnsAhead = rng < 0.6 ? 0 : rng < 0.9 ? 1 : 2;
    const scheduledDate = new Date();
    scheduledDate.setHours(scheduledDate.getHours() + turnsAhead);

    // Revenue/fame variance
    const variance = 0.8 + random() * 0.4;

    // Anti-collision thumbnail: use batch pool per type
    if (!batchThumbnails[typeKey]) {
      batchThumbnails[typeKey] = getEventThumbnailBatch(typeKey, region, numToGenerate);
      batchIndex[typeKey] = 0;
    }
    const thumbIdx = batchIndex[typeKey] % batchThumbnails[typeKey].length;
    const thumbnailUrl = batchThumbnails[typeKey][thumbIdx];
    batchIndex[typeKey] = thumbIdx + 1;

    const event = await entities.TourEvent.create({
      event_name: `${config.name} at ${venue}`,
      event_type: typeKey,
      venue: venue,
      city,
      region: region,
      status: 'available',
      capacity: config.capacity > 0 ? config.capacity : 0,
      ticket_price: config.capacity > 0 ? Math.floor(10 + random() * 20) : 0,
      energy_cost: config.energyCost,
      fame_gained: Math.floor(config.baseFame * variance),
      hype_gained: Math.floor(config.baseHype * variance),
      clout_gained: config.baseClout,
      scheduled_turn: currentTurn + turnsAhead,
      scheduled_date: scheduledDate.toISOString(),
      thumbnail_url: thumbnailUrl,
      gross_revenue: Math.floor(config.baseRevenue * variance),
      metadata: {
        // Public gig pool should remain accessible to brand-new accounts.
        min_clout: 0,
        description: config.description,
        compliance_mode: 'balanced',
        promotion_boost_pct: 0,
        teaser_heat: 0,
      },
      created_at: new Date().toISOString()
    });

    newEvents.push(event);
  }

  return {
    events: [...visibleExistingEvents, ...newEvents],
    eventTypes: UNDERGROUND_EVENT_TYPES,
    playerClout: N(artist.clout),
    playerRegion: region
  };
}

/**
 * Book an available underground event (Get Gig)
 */
export async function bookEvent(entities: any, artistId: string, eventId: string) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');
  const currentTurn = await getCurrentGlobalTurnId(entities);

  const event = await entities.TourEvent.get(eventId);
  if (!event) throw new Error('Event not found');
  if (event.status !== 'available') throw new Error('Event is no longer available');
  if (!canArtistAccessUndergroundEvent(event, artistId)) {
    throw new Error('This event is invite only for selected artists');
  }

  const energyCost = N(event.energy_cost) || 20;
  if (N(artist.energy) < energyCost) {
    throw new Error(`Need ${energyCost} energy (have ${N(artist.energy)})`);
  }

  // Intentionally no clout gate here: available underground gigs are beginner-accessible.

  // Book the event
  const turnsAhead = N(event.scheduled_turn) > 0
    ? Math.max(1, N(event.scheduled_turn) - currentTurn)
    : inferTurnsAheadFromScheduledDate(event.scheduled_date, 1);
  const normalizedScheduledDate = event.scheduled_date
    ? new Date(event.scheduled_date)
    : new Date(Date.now() + turnsAhead * 60 * 60 * 1000);

  await entities.TourEvent.update(eventId, {
    artist_id: artistId,
    status: 'booked',
    scheduled_turn: Math.max(currentTurn + 1, currentTurn + turnsAhead),
    scheduled_date: normalizedScheduledDate.toISOString(),
    updated_at: new Date().toISOString()
  });

  // Deduct energy
  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - energyCost,
    updated_at: new Date().toISOString()
  });

  return {
    success: true,
    event: { ...event, artist_id: artistId, status: 'booked' },
    energySpent: energyCost
  };
}

/**
 * Host an underground event (clout-gated)
 */
export async function hostEvent(
  entities: any,
  artistId: string,
  eventType: string,
  eventName: string,
  scheduledTurnsAhead: number,
  rng?: any
) {
  // Use provided RNG or fallback to Math.random for API calls
  const random = rng?.random ? () => rng.random() : Math.random;
  
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const config = UNDERGROUND_EVENT_TYPES[eventType];
  if (!config) throw new Error(`Invalid event type: ${eventType}`);

  // Check clout gate
  if (N(artist.clout) < config.minClout) {
    throw new Error(`Need ${config.minClout} clout to host ${config.name} (have ${N(artist.clout)})`);
  }

  // Check energy
  if (N(artist.energy) < config.energyCost) {
    throw new Error(`Need ${config.energyCost} energy (have ${N(artist.energy)})`);
  }

  // Check funds
  if (N(artist.income) < config.hostCost) {
    throw new Error(`Need $${config.hostCost} to host (have $${N(artist.income)})`);
  }

  const region = artist.region || 'United States';
  const city = resolveEventCity(region, artist.current_city);
  const venues = EVENT_VENUE_NAMES[region] || EVENT_VENUE_NAMES['United States'];
  const venue = venues[Math.floor(random() * venues.length)];

  const turnsAhead = Math.max(1, Math.min(5, scheduledTurnsAhead || 2));
  const scheduledDate = new Date();
  scheduledDate.setHours(scheduledDate.getHours() + turnsAhead);

  // Clout bonus: higher clout = better event outcomes
  const cloutBonus = 1 + (N(artist.clout) / 200); // Up to 1.5x at 100 clout

  const resolvedEventName = eventName || `${config.name} at ${venue}`;
  const soundburstToPersist = normalizeSoundburstWizardConfig({
    eventType,
    scheduledTurnsAhead: turnsAhead,
    eventName: resolvedEventName,
    city,
    region,
  });
  const metadata = mergeTourEventMetadataWithSoundburst({
    is_hosted: true,
    min_clout: config.minClout,
    description: config.description,
    clout_bonus: cloutBonus,
  }, soundburstToPersist);

  const event = await entities.TourEvent.create({
    event_name: resolvedEventName,
    event_type: eventType,
    venue: venue,
    city,
    region: region,
    artist_id: artistId,
    hosted_by: artistId,
    status: 'booked',
    capacity: config.capacity > 0 ? Math.floor(config.capacity * cloutBonus) : 0,
    ticket_price: config.capacity > 0 ? Math.floor((15 + random() * 15) * cloutBonus) : 0,
    energy_cost: config.energyCost,
    hosting_cost: config.hostCost,
    fame_gained: Math.floor(config.baseFame * cloutBonus),
    hype_gained: Math.floor(config.baseHype * cloutBonus),
    clout_gained: Math.floor(config.baseClout * cloutBonus),
    gross_revenue: Math.floor(config.baseRevenue * cloutBonus * 1.5), // Hosts get 50% more revenue
    scheduled_date: scheduledDate.toISOString(),
    thumbnail_url: getEventThumbnail(eventType, region),
    metadata,
    created_at: new Date().toISOString()
  });

  // Deduct costs
  await entities.ArtistProfile.update(artistId, {
    energy: N(artist.energy) - config.energyCost,
    income: N(artist.income) - config.hostCost,
    updated_at: new Date().toISOString()
  });

  return {
    success: true,
    event,
    energySpent: config.energyCost,
    moneySpent: config.hostCost
  };
}

/**
 * TourEventProcessingModule — Process booked underground events during turn processing
 * Turn scheduling is canonical. scheduled_date is display/legacy fallback only.
 */
export async function processUndergroundEvents(ctx: any, player: any) {
  const { entities, globalTurnId, rng } = ctx;
  // Use provided RNG or fallback
  const random = rng?.random ? () => rng.random() : Math.random;
  const runtimeContext = ctx?.runtimeContext || {};
  const deltas: any = {
    tour_event_updates: [],
    notifications_to_create: [],
    news_items_to_create: [],
    turn_events: [],
    social_posts_to_create: [],
    // Plan 035 M2: scene_deltas REMOVED — sceneSystemModule is now canonical for underground events
    // (underground completions flow through sceneCompletionContextBus → sceneSystemModule)
    artistProfile: {},
    turn_metrics: {}
  };

  // Find booked events for this player (gracefully no-op if TourEvent entity unavailable)
  if (!entities?.TourEvent || typeof entities.TourEvent.filter !== 'function') {
    return { success: true, deltas };
  }

  let bookedEvents: any[] = [];
  try {
    const rows = await entities.TourEvent.filter({
      artist_id: player.id,
      status: 'booked'
    });
    bookedEvents = Array.isArray(rows) ? rows : [];
  } catch {
    bookedEvents = [];
  }

  if (bookedEvents.length === 0) return { success: true, deltas };

  // Plan 035 M2: rep prefetch REMOVED — sceneSystemModule handles rep computation via context bus

  const citySceneCache = new Map<string, any | null>();
  const cityCacheKey = (city?: string, region?: string) => `${city || ''}::${region || ''}`;

  async function getCitySceneCached(city?: string | null, region?: string | null) {
    const key = cityCacheKey(city || '', region || '');
    if (citySceneCache.has(key)) return citySceneCache.get(key) || null;
    const cityScene = await resolveCityScene(city, region);
    citySceneCache.set(key, cityScene || null);
    return cityScene || null;
  }

  const now = new Date();
  const mergedStats = { ...(player?.stats || {}) };
  const sceneProgress = { ...(mergedStats.underground_scene || {}) };
  sceneProgress.points = Math.max(0, Math.floor(N(sceneProgress.points)));
  sceneProgress.success_count = Math.max(0, Math.floor(N(sceneProgress.success_count)));
  sceneProgress.raid_count = Math.max(0, Math.floor(N(sceneProgress.raid_count)));
  let undergroundHeat = clampNumber(N(mergedStats.underground_heat), 0, 100);

  for (const event of bookedEvents) {
    if (!shouldProcessUndergroundEventThisTurn(event, globalTurnId, now)) continue;

    const config = UNDERGROUND_EVENT_TYPES[event.event_type] || UNDERGROUND_EVENT_TYPES['showcase'];
    const eventMeta = { ...(event.metadata || {}) };
    const cityScene = await getCitySceneCached(event.city, event.region);
    const sceneVibe = cityScene?.scene_vibe || {};
    const undergroundVibe = N(sceneVibe?.underground) || 0.45;
    const baseClout = N(player.clout);
    const buzzClout = Math.min(200, Math.floor(N(player.hype) * 0.3)); // ephemeral buzz from hype
    const effectiveClout = baseClout + buzzClout;
    // Regional clout bonus: events in regions where you have influence perform better
    const eventRegion = event.region || player.region || '';
    const regionalCloutBonus = N((player.regional_clout || {})[eventRegion]) / 200; // up to +0.5x at 100 regional clout
    const cloutMult = 1 + (effectiveClout / 150) + regionalCloutBonus; // Higher clout = better outcomes
    const isHosted = !!event.hosted_by && event.hosted_by === player.id;

    const promoBoost = clampNumber(N(eventMeta.promotion_boost_pct), 0, 0.5);
    const teaserHeat = clampNumber(N(eventMeta.teaser_heat), 0, 60);
    const complianceMode = sanitizeComplianceMode(eventMeta.compliance_mode || 'balanced');
    const compliance = getComplianceModeModifiers(complianceMode);
    // Focus modifiers from v2 wizard choice
    const focusChoice = eventMeta?.soundburst?.focusChoice ?? event.focus_choice ?? null;
    const focusMods = computeFocusModifiers(event.event_type, focusChoice);
    const rawVibeScore = computeShowVibeScore({
      artistClout: N(player.clout),
      artistHype: N(player.hype),
      undergroundVibe,
      promotionBoostPct: promoBoost,
    });
    const vibeScore = clampNumber(rawVibeScore + compliance.vibeBonus + focusMods.vibe_bonus, 10, 100);
    const permitTier = sanitizePermitTier(eventMeta.permit_tier || 'none');
    const detectionRisk = computeUndergroundDetectionRisk({
      baseRisk: clampNumber(N(eventMeta.detection_risk_base) || 0.14, 0.02, 0.9) * compliance.riskMult * focusMods.detection_risk_mult,
      cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
      permitTier,
      heatLevel: clampNumber(N(player.hype) / 100, 0, 1),
      promoIntensity: clampNumber((promoBoost + teaserHeat / 100) * compliance.promoIntensityMult, 0, 1),
    });
    const raidTriggered = random() < (detectionRisk * focusMods.raid_risk_mult);
    const raidPenaltyMult = raidTriggered ? 0.58 : 1;
    const vibeMult = 1 + (vibeScore - 50) / 220 + promoBoost + teaserHeat / 220;
    const outcomeMult = clampNumber(vibeMult * raidPenaltyMult, 0.4, 2.4);

    // Calculate outcomes — apply focus multipliers
    const variance = 0.8 + random() * 0.4;
    const fameAsClout = Math.floor(N(event.fame_gained) * cloutMult * variance * outcomeMult * focusMods.fame_mult);
    const hype = Math.floor(N(event.hype_gained) * cloutMult * variance * outcomeMult);
    const cloutGain = Math.floor(N(event.clout_gained) * variance * (raidTriggered ? 0.6 : 1.2) * focusMods.clout_mult);
    const revenue = Math.floor(N(event.gross_revenue) * cloutMult * variance * outcomeMult * focusMods.cost_mult);
    const followers = Math.floor((fameAsClout + hype) * 0.5 * variance * (1 + focusMods.networking_boost));
    const attendanceRatioTarget = raidTriggered ? (0.35 + cloutMult * 0.18) : (0.55 + cloutMult * 0.26);
    const attendance = event.capacity > 0 ? Math.floor(event.capacity * attendanceRatioTarget * variance * focusMods.capacity_mult) : 0;

    const raidNarrativeSeed = raidTriggered
      ? composeRaidNarrativeSeed({
          eventName: event.event_name || config.name,
          cityName: event.city || event.region || 'Unknown City',
          vibeScore,
          detectionRisk,
        })
      : null;

    // Mark event completed
    deltas.tour_event_updates.push({
      id: event.id,
      patch: {
        status: 'completed',
        net_revenue: revenue,
        attendance,
        fame_gained: fameAsClout,
        hype_gained: hype,
        clout_gained: cloutGain,
        metadata: {
          ...eventMeta,
          processed_turn: globalTurnId,
          vibe_score: vibeScore,
          detection_risk: detectionRisk,
          raid_triggered: raidTriggered,
          raid_narrative_seed: raidNarrativeSeed,
          compliance_mode: complianceMode,
          promotion_boost_pct: promoBoost,
          teaser_heat: teaserHeat,
          focus_choice: focusChoice,
          focus_modifiers_applied: focusChoice ? focusMods : undefined,
        },
        updated_at: now.toISOString()
      },
      // Plan 035 M2: Add _meta for sceneCompletionContextBus extraction
      _meta: {
        city_id: cityScene?.id || null,
        city_name: event.city || event.region || null,
        venue_id: null, // underground events don't use venues
        event_type: event.event_type,
        scheduled_turn: event.scheduled_turn || globalTurnId,
        capacity: event.capacity || 0,
        is_underground: true,
      },
    });

    // Update player stats — use additive deltas, don't overwrite core-computed values
    // These are resolved in turnEngine commit phase before DB write.
    if (revenue !== 0) {
      deltas.artistProfile.tour_income_boost = (deltas.artistProfile.tour_income_boost || 0) + revenue;
    }
    if (fameAsClout > 0) {
      deltas.artistProfile.clout = (deltas.artistProfile.clout || N(player.clout)) + fameAsClout;
    }
    if (hype > 0) {
      deltas.artistProfile.tour_hype_boost = (deltas.artistProfile.tour_hype_boost || 0) + hype;
    }
    if (cloutGain > 0) {
      deltas.artistProfile.clout = (deltas.artistProfile.clout || N(player.clout)) + cloutGain;
    }
    if (followers > 0) {
      deltas.artistProfile.tour_follower_boost = (deltas.artistProfile.tour_follower_boost || 0) + followers;
    }
    if (event.region) {
      deltas.artistProfile.region = event.region;
    }
    if (event.city) {
      deltas.artistProfile.current_city = event.city;
    }

    const scenePointsGain = raidTriggered
      ? 1
      : Math.max(2, Math.round(outcomeMult * 4 + (vibeScore - 40) / 20 + (promoBoost * 8)));
    sceneProgress.points += scenePointsGain;
    if (raidTriggered) sceneProgress.raid_count += 1;
    else sceneProgress.success_count += 1;
    sceneProgress.tier = computeUndergroundSceneTier(sceneProgress.points);
    sceneProgress.last_event_turn = globalTurnId;
    sceneProgress.last_city = event.city || event.region || null;

    undergroundHeat = clampNumber(
      undergroundHeat + (raidTriggered ? -4 : Math.max(2, Math.round(vibeScore / 18))),
      0,
      100,
    );

    // Regional clout from underground events
    if (eventRegion) {
      const rc = { ...(deltas.artistProfile.regional_clout || player.regional_clout || {}) };
      rc[eventRegion] = N(rc[eventRegion]) + Math.floor(1 + cloutGain * 0.5);
      deltas.artistProfile.regional_clout = rc;
    }

    // Turn metrics
    deltas.turn_metrics.event_revenue = (deltas.turn_metrics.event_revenue || 0) + revenue;
    deltas.turn_metrics.events_completed = (deltas.turn_metrics.events_completed || 0) + 1;

    // Notification
    deltas.notifications_to_create.push({
      player_id: player.id,
      type: raidTriggered ? 'UNDERGROUND_RAID' : 'UNDERGROUND_EVENT',
      title: raidTriggered
        ? `Authorities shut down ${event.event_name || config.name}`
        : (isHosted ? `Your ${config.name} was a hit!` : `Performed at ${event.event_name}!`),
      subtitle: raidTriggered
        ? `Risk ${Math.round(detectionRisk * 100)}% caught up to the show`
        : `+$${revenue.toLocaleString()} | +${fameAsClout + cloutGain} clout`,
      body: raidTriggered
        ? `The set got interrupted before full payout. Keep promo intensity lower or secure stronger permits.`
        : `${isHosted ? 'You hosted' : 'You performed at'} "${event.event_name}" and earned $${revenue.toLocaleString()}. ${followers > 0 ? `Gained ${followers} new followers!` : ''}`,
      priority: raidTriggered || revenue > 1000 ? 'high' : 'medium',
      deep_links: [{ label: 'View Events', route: 'Career', params: { openApp: 'soundburst', tab: 'events' } }]
    });

    // News item
    deltas.news_items_to_create.push({
      artist_id: player.id,
      headline: raidTriggered
        ? `${player.artist_name || 'Artist'}'s underground set was raided`
        : (isHosted
          ? `${player.artist_name || 'Artist'} hosts successful ${config.name}!`
          : `${player.artist_name || 'Artist'} performs at ${event.event_name}!`),
      body: raidTriggered
        ? `Security pressure spiked in ${event.city || event.region || 'the city'}. Narrative seed: ${raidNarrativeSeed}.`
        : `The underground event drew ${attendance > 0 ? attendance : 'hundreds of'} fans. Revenue: $${revenue.toLocaleString()}.`,
      category: raidTriggered ? 'controversy' : 'event',
      sentiment: raidTriggered ? 'negative' : (revenue > config.baseRevenue ? 'positive' : 'neutral'),
      created_at: now.toISOString()
    });

    // M9: Queue social promo post for events with looptok in social_platforms (idempotent)
    const eventSocialPlatforms = Array.isArray(event.social_platforms) ? event.social_platforms : [];
    const alreadyQueued = !!(eventMeta?.soundburst?.looptok_post_queued);
    if (eventSocialPlatforms.includes('looptok') && !raidTriggered && !alreadyQueued) {
      deltas.social_posts_to_create.push({
        source_type: 'underground_promo',
        artist_id: player.id,
        platform: 'soundburst',
        post_type: 'underground_promo',
        title: `Underground ${config.name} in ${event.city || event.region || 'the city'}`,
        caption: `${player.artist_name || 'Artist'} just performed at "${event.event_name}". The underground scene is alive.`,
        event_type: event.event_type,
        event_reference_id: event.id,
        status: 'published',
        is_ai_generated: true,
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        metadata: {
          event_id: event.id,
          social_platforms: eventSocialPlatforms,
          promo_boost: computePromoBoost(eventSocialPlatforms, ctx.turnState?.algorithm_mood ?? null),
        },
      });
      // Set idempotency flag in the event metadata patch
      const existingPatch = deltas.tour_event_updates.find((u: any) => u.id === event.id);
      if (existingPatch?.patch?.metadata) {
        existingPatch.patch.metadata.soundburst = existingPatch.patch.metadata.soundburst || {};
        existingPatch.patch.metadata.soundburst.looptok_post_queued = true;
      }
    }

    deltas.turn_events.push({
      player_id: player.id,
      global_turn_id: globalTurnId,
      module: 'touringManager',
      event_type: raidTriggered ? 'underground_raid' : 'underground_event_resolved',
      description: raidTriggered
        ? `${event.event_name || config.name} was interrupted by a raid`
        : `${event.event_name || config.name} completed with strong turnout`,
      metadata: {
        event_id: event.id,
        event_type: event.event_type,
        city: event.city || event.region || null,
        compliance_mode: complianceMode,
        detection_risk: detectionRisk,
        vibe_score: vibeScore,
      },
      deltas: {
        revenue,
        followers,
        clout_gain: cloutGain + fameAsClout,
      },
    });

    // Plan 035 M2: Direct scene_deltas REMOVED — sceneSystemModule handles rep via context bus
    // The _meta attached to tour_event_updates provides city_id for extraction
  }

  if (deltas.turn_metrics.events_completed > 0) {
    mergedStats.underground_scene = sceneProgress;
    mergedStats.underground_heat = undergroundHeat;
    deltas.artistProfile.stats = mergedStats;
  }

  return { success: true, deltas };
}

export async function setUndergroundComplianceMode(
  entities: any,
  artistId: string,
  eventId: string,
  complianceMode: 'stealth' | 'balanced' | 'permitted',
) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  const event = await entities.TourEvent.get(eventId);
  if (!event) throw new Error('Event not found');
  if (event.artist_id !== artistId) throw new Error('Event does not belong to artist');
  if (event.status !== 'booked') throw new Error('Compliance mode can only be set on booked events');

  const globalTurnId = await getCurrentGlobalTurnId(entities);
  const mode = sanitizeComplianceMode(complianceMode);
  const activePermit = getActiveUndergroundPermit(artist, globalTurnId);
  if (mode === 'permitted' && !activePermit) {
    throw new Error('Permitted mode requires an active underground permit');
  }

  const metadata = { ...(event.metadata || {}) };
  const permitTier = activePermit?.tier || sanitizePermitTier(metadata.permit_tier || 'none');
  const cityScene = await resolveCityScene(event.city, event.region);
  const compliance = getComplianceModeModifiers(mode);
  const detectionRisk = computeUndergroundDetectionRisk({
    baseRisk: clampNumber(N(metadata.detection_risk_base) || 0.15, 0.02, 0.85) * compliance.riskMult,
    cityTolerance: N(cityScene?.controversy_tolerance) || 0.5,
    permitTier,
    heatLevel: clampNumber(N(artist.hype) / 100, 0, 1),
    promoIntensity: clampNumber((N(metadata.promotion_boost_pct) + N(metadata.teaser_heat) / 100) * compliance.promoIntensityMult, 0, 1),
  });

  const nextMetadata = updateSoundburstComplianceModeInMetadata({
    ...metadata,
    compliance_mode: mode,
    detection_risk_base: detectionRisk,
    permit_tier: permitTier,
    compliance_label: compliance.label,
    compliance_updated_turn: globalTurnId,
  }, mode);

  await entities.TourEvent.update(eventId, {
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    eventId,
    complianceMode: mode,
    detectionRisk,
    complianceLabel: compliance.label,
  };
}

// ═══ SOUNDBURST v2 APIs ═══════════════════════════════════════════

const VALID_REGIONS = new Set([
  'Africa', 'Asia', 'Canada', 'Europe', 'Latin America', 'Oceania', 'UK', 'United States',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── M8: Focus modifier matrix ──────────────────────────────────
export interface FocusModifiers {
  clout_mult: number;
  fame_mult: number;
  cost_mult: number;
  raid_risk_mult: number;
  controversy_risk_mult: number;
  networking_boost: number;
  npc_meet_chance_boost: number;
  vibe_bonus: number;
  capacity_mult: number;
  detection_risk_mult: number;
}

const NEUTRAL_MODIFIERS: FocusModifiers = {
  clout_mult: 1, fame_mult: 1, cost_mult: 1, raid_risk_mult: 1,
  controversy_risk_mult: 1, networking_boost: 0, npc_meet_chance_boost: 0,
  vibe_bonus: 0, capacity_mult: 1, detection_risk_mult: 1,
};

const FOCUS_MATRIX: Record<string, Record<string, Partial<FocusModifiers>>> = {
  battle: {
    cypher: { clout_mult: 0.9, networking_boost: 15, controversy_risk_mult: 0.7 },
    '1v1': { clout_mult: 1.4, networking_boost: -5, controversy_risk_mult: 1.5 },
    exhibition: { clout_mult: 1.0, fame_mult: 1.2, controversy_risk_mult: 0.9 },
  },
  showcase: {
    opener: { cost_mult: 0.7, fame_mult: 0.8, networking_boost: 10 },
    'co-headliner': { cost_mult: 1.0, fame_mult: 1.0 },
    headliner: { cost_mult: 1.4, fame_mult: 1.35, controversy_risk_mult: 1.2 },
  },
  open_mic: {
    networking: { npc_meet_chance_boost: 0.20, clout_mult: 0.85 },
    performance: { clout_mult: 1.15, fame_mult: 1.1 },
    vibe: { detection_risk_mult: 0.8, vibe_bonus: 8 },
  },
  collab_night: {
    networking: { npc_meet_chance_boost: 0.25 },
    performance: { clout_mult: 1.1, fame_mult: 1.1 },
    vibe: { vibe_bonus: 10, networking_boost: 8 },
  },
  block_party: {
    'low-key': { cost_mult: 0.7, capacity_mult: 0.7, raid_risk_mult: 0.6 },
    hype: { cost_mult: 1.0, capacity_mult: 1.0 },
    'all-out': { cost_mult: 1.6, capacity_mult: 1.4, raid_risk_mult: 1.8 },
  },
};

/**
 * M8: Compute focus modifiers for an event type + focus choice.
 * Returns a plain modifier object — no DB writes (staging compliant).
 */
export function computeFocusModifiers(eventType: string, focusChoice: string | null | undefined): FocusModifiers {
  if (!focusChoice || !eventType) return { ...NEUTRAL_MODIFIERS };
  const typeMap = FOCUS_MATRIX[eventType];
  if (!typeMap) return { ...NEUTRAL_MODIFIERS };
  const overrides = typeMap[focusChoice];
  if (!overrides) return { ...NEUTRAL_MODIFIERS };
  return { ...NEUTRAL_MODIFIERS, ...overrides };
}

/**
 * M9: Compute promotion boost from wizard social platform selections.
 * Platform-specific boost: looptok +0.12, instavirus +0.09, xpress +0.06.
 * LoopTok portion is scaled by algorithm mood multiplier.
 */
const PLATFORM_PROMO_BOOST: Record<string, number> = {
  looptok: 0.12,
  instavirus: 0.09,
  xpress: 0.06,
};
const LOOPTOK_MOOD_MULT: Record<string, number> = {
  messy: 1.30,
  underground: 0.90,
};
export function computePromoBoost(socialPlatforms: string[], algorithmMood: string | null | undefined): number {
  if (!Array.isArray(socialPlatforms) || socialPlatforms.length === 0) return 0;
  let total = 0;
  for (const p of socialPlatforms) {
    const base = PLATFORM_PROMO_BOOST[p] ?? 0;
    if (base === 0) continue;
    if (p === 'looptok' && algorithmMood) {
      total += base * (LOOPTOK_MOOD_MULT[algorithmMood] ?? 1.0);
    } else {
      total += base;
    }
  }
  return total;
}

/**
 * M3: NPC Contact Discovery API
 * Returns scene_contacts for a region, enriched with the requesting player's relationship level.
 */
export async function getSceneContacts(
  _entities: any,
  artistId: string,
  payload: { region?: string; city?: string },
) {
  const region = payload?.region;
  if (!region || !VALID_REGIONS.has(region)) {
    return { contacts: [] };
  }

  // Fetch city_scenes for the region
  let cityQuery = supabaseAdmin
    .from('city_scenes')
    .select('id, city_name')
    .eq('region', region);

  if (payload.city) {
    cityQuery = cityQuery.eq('city_name', payload.city);
  }

  const { data: cities, error: cityErr } = await cityQuery;
  if (cityErr || !cities?.length) {
    return { contacts: [] };
  }

  const cityIds = cities.map((c: any) => c.id);
  const cityNameMap: Record<string, string> = {};
  for (const c of cities) cityNameMap[c.id] = c.city_name;

  // Fetch scene_contacts in those cities
  const { data: contacts, error: contactErr } = await supabaseAdmin
    .from('scene_contacts')
    .select('id, city_id, name, role, genre_preference, relationship_threshold, perks, portrait_seed')
    .in('city_id', cityIds);

  if (contactErr || !contacts?.length) {
    return { contacts: [] };
  }

  // Fetch player's relationships with these contacts
  const contactIds = contacts.map((c: any) => c.id);
  const { data: relationships } = await supabaseAdmin
    .from('player_contact_relationships')
    .select('contact_id, relationship_level')
    .eq('player_id', artistId)
    .in('contact_id', contactIds);

  const relMap: Record<string, number> = {};
  if (relationships) {
    for (const r of relationships) relMap[r.contact_id] = r.relationship_level ?? 0;
  }

  const enriched = contacts.map((c: any) => {
    const relationshipLevel = relMap[c.id] ?? 0;
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      genre_preference: c.genre_preference,
      relationship_level: relationshipLevel,
      is_unlocked: relationshipLevel >= (c.relationship_threshold ?? Infinity),
      perks: c.perks,
      city_name: cityNameMap[c.city_id] ?? null,
      city_id: c.city_id,
      relationship_threshold: c.relationship_threshold,
      portrait_seed: c.portrait_seed,
    };
  });

  return { contacts: enriched };
}

/**
 * M4: Invitable Players Pool
 * Returns real player profiles from the same region, excluding the requesting player.
 */
export async function getInvitablePlayers(
  _entities: any,
  artistId: string,
  payload: { region?: string; limit?: number },
) {
  // Validate artistId is UUID
  if (!artistId || !UUID_RE.test(artistId)) {
    throw new Error('Invalid artistId: must be a valid UUID');
  }

  const region = payload?.region;
  if (!region || !VALID_REGIONS.has(region)) {
    throw new Error(`Invalid region: "${region ?? ''}" is not a recognized region`);
  }

  // Clamp limit to [1, 50]
  const rawLimit = Number(payload?.limit) || 20;
  const limit = Math.max(1, Math.min(50, rawLimit));

  const { data: players, error } = await supabaseAdmin
    .from('profiles')
    .select('id, artist_name, artist_image, career_stage, clout, region')
    .eq('region', region)
    .neq('id', artistId)
    .order('clout', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error('Failed to fetch invitable players');
  }

  return { players: players ?? [] };
}

/**
 * M7: Player Event Dashboard
 * Returns upcomingPerform, upcomingHosted, and pastEvents for the player.
 */
export async function getPlayerEventDashboard(
  entities: any,
  artistId: string,
  _payload: Record<string, any>,
) {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error('Artist not found');

  // Fetch all events for this artist
  const allEvents = await entities.TourEvent.filter({ artist_id: artistId }).catch(() => []);

  const DASHBOARD_FIELDS = [
    'id', 'event_name', 'event_type', 'city', 'venue', 'region', 'status',
    'scheduled_turn', 'scheduled_date', 'thumbnail_url',
    'gross_revenue', 'fame_gained', 'hype_gained', 'clout_gained',
    'hosted_by', 'metadata',
  ];

  function pickFields(event: any) {
    const result: any = {};
    for (const key of DASHBOARD_FIELDS) {
      if (event[key] !== undefined) result[key] = event[key];
    }
    return result;
  }

  function normalizedStatus(event: any): string {
    return String(event?.status || '').toLowerCase();
  }

  function isPerformedPendingOrDone(event: any): boolean {
    const perfStatus = String(event?.metadata?.performance_status || '').toLowerCase();
    if (perfStatus === 'performed_pending_turn' || perfStatus === 'performed' || perfStatus === 'completed') {
      return true;
    }
    return !!event?.metadata?.performance_marked_at;
  }

  // Fetch hosted events separately (hosted_by = artistId, may not have artist_id = artistId)
  const hostedEvents = await entities.TourEvent.filter({ hosted_by: artistId }).catch(() => []);

  // upcomingPerform: booked, not hosted by self
  const upcomingPerform = allEvents
    .filter((e: any) => normalizedStatus(e) === 'booked' && e.hosted_by !== artistId && !isPerformedPendingOrDone(e))
    .map(pickFields);

  // upcomingHosted: booked, hosted by self — enrich with promo summary
  const upcomingHosted = hostedEvents
    .filter((e: any) => normalizedStatus(e) === 'booked' && !isPerformedPendingOrDone(e))
    .map((e: any) => {
      const meta = e.metadata || {};
      return {
        ...pickFields(e),
        promo_summary: {
          promotion_boost_pct: N(meta.promotion_boost_pct),
          compliance_mode: meta.compliance_mode || null,
          detection_risk_base: N(meta.detection_risk_base),
          teaser_heat: N(meta.teaser_heat),
        },
      };
    });

  // pastEvents: completed or cancelled, newest first, capped at 20
  const completedOrCancelled = [...allEvents, ...hostedEvents]
    .filter((e: any) => {
      const status = normalizedStatus(e);
      return status === 'completed' || status === 'cancelled' || isPerformedPendingOrDone(e);
    });
  // Deduplicate by id
  const seen = new Set<string>();
  const dedupedPast = completedOrCancelled.filter((e: any) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  const pastEvents = dedupedPast
    .sort((a: any, b: any) => {
      const dateA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0;
      const dateB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 20)
    .map((e: any) => {
      const outcome = e.metadata?.outcome || {};
      return {
        ...pickFields(e),
        outcome_summary: {
          outcome_label: outcome.outcome_label || null,
          payout: N(outcome.payout),
          attendance: N(outcome.attendance),
          controversy_triggered: !!outcome.controversy_triggered,
        },
      };
    });

  return { upcomingPerform, upcomingHosted, pastEvents };
}
