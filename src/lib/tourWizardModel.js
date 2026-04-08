// ─── Tour Planning Wizard — Pure Model Layer ────────────────────────────────
// No side effects, no API calls. Constants + helper functions only.

// ─── Venue Size Options ──────────────────────────────────────────────────────

export const VENUE_SIZE_OPTIONS = [
  { id: 'bars_clubs', label: 'Bars & Clubs', sublabel: 'Underplay rooms & club dates', capacityRange: [100, 300], capacityText: '<100-300 capacity', tourTypes: ['local_club'] },
  { id: 'mid_sized', label: 'Mid-Sized Venues', sublabel: 'Theaters & concert halls', capacityRange: [300, 1000], capacityText: '300-1,000 capacity', tourTypes: ['regional_circuit'] },
  { id: 'large', label: 'Large Venues', sublabel: 'Amphitheaters & major halls', capacityRange: [5000, 15000], capacityText: '5k-15k capacity', tourTypes: ['national_headliner'] },
  { id: 'arenas_stadiums', label: 'Arenas & Stadiums', sublabel: 'Full spectacle rooms', capacityRange: [15000, 30000], capacityText: '15k-30k+ capacity', tourTypes: ['arena_tour', 'stadium_tour'] },
];

// ─── Category → Allowed Venue Sizes ─────────────────────────────────────────

export const ALL_VENUE_SIZE_IDS = VENUE_SIZE_OPTIONS.map((venue) => venue.id);

export const CATEGORY_VENUE_CONSTRAINTS = {
  guerilla_promo: ['bars_clubs'],
  acoustic_intimate: ['bars_clubs', 'mid_sized'],
  underground_crawl: ['bars_clubs', 'mid_sized'],
  standard_run: ALL_VENUE_SIZE_IDS,
  comeback_special: ['mid_sized', 'large', 'arenas_stadiums'],
  arena_blitz: ['large', 'arenas_stadiums'],
  global_takeover: ['mid_sized', 'large', 'arenas_stadiums'],
  festival_circuit: ['large', 'arenas_stadiums'],
};

// ─── Transport Tiers ─────────────────────────────────────────────────────────

export const TRANSPORT_TIERS = [
  {
    id: 'hatchback', label: 'The "Borrowed" Hatchback', level: 1, costPerStop: 50,
    description: 'Cramped but it gets the job done. Band + 2 amps max.',
    statMods: { stamina: -0.20 },
    majorEvents: ['gear_left_behind'], minorEvents: ['cramped_travel'],
  },
  {
    id: 'cargo_van', label: 'Rented Cargo Van', level: 2, costPerStop: 120,
    description: 'Full backline fits. High breakdown risk.',
    statMods: {},
    majorEvents: ['van_breakdown'], minorEvents: ['bad_snacks'],
  },
  {
    id: 'splitter_van', label: 'The Splitter Van', level: 3, costPerStop: 250,
    description: 'Dedicated seats + small trailer. Crew morale boost.',
    statMods: { stamina: 0.05, crewMorale: 0.10 },
    majorEvents: ['trailer_accident'], minorEvents: ['route_detour'],
  },
  {
    id: 'silver_eagle', label: 'Vintage Silver Eagle Bus', level: 4, costPerStop: 500,
    description: 'Iconic but old. 12 bunks + lounge. Needs maintenance.',
    statMods: { stamina: 0.25 },
    majorEvents: ['mechanical_breakdown'], minorEvents: ['maintenance_drain'],
  },
  {
    id: 'star_coach', label: 'Modern Star Coach', level: 5, costPerStop: 1000,
    description: 'Luxury suite + mobile studio. The rolling sanctuary.',
    statMods: { crewMorale: 0.15 },
    majorEvents: ['equipment_theft'], minorEvents: ['luxury_complacency'],
  },
  {
    id: 'charter_jet', label: 'The Leapfrog Charter Jet', level: 6, costPerStop: 3000,
    description: 'Artist + key management. Gear follows in a semi.',
    statMods: { stamina: 0.12 },
    majorEvents: ['carbon_backlash', 'border_control'], minorEvents: ['jet_lag'],
  },
  {
    id: 'tour_fleet', label: 'Custom Tour Fleet', level: 7, costPerStop: 8000,
    description: "Multiple buses + 53' semi-trucks. Max production.",
    statMods: { stamina: 0.10, crewMorale: 0.10 },
    majorEvents: ['convoy_desync'], minorEvents: ['logistics_overhead'],
  },
];

// ─── Ticket Pricing ──────────────────────────────────────────────────────────

export const TICKET_TIER_MULTIPLIERS = { ga: 1.0, reserved: 1.8, vip: 3.5, meet_greet: 8.0 };
export const TICKET_TIER_ALLOCATIONS = { ga: 0.60, reserved: 0.20, vip: 0.12, meet_greet: 0.08 };

export const TICKET_SELL_TYPES = [
  { id: 'presale', label: 'Presale Tickets', effect: '+15% early fill rate' },
  {
    id: 'dynamic_platinum', label: 'Dynamic / Platinum', effect: 'Float price with demand, backlash risk',
    disabledForCategories: ['guerilla_promo', 'underground_crawl'], disabledForVenues: ['bars_clubs'],
  },
  { id: 'season_pass', label: 'Season / Multi-City Pass', effect: '+Fan Loyalty, consistent attendance' },
  { id: 'day_of_show', label: 'Last-Minute / Day-of-Show', effect: 'Fill remaining gaps, variable pricing' },
];

// ─── Pacing Options ──────────────────────────────────────────────────────────

export const PACING_OPTIONS = [
  { id: 'relaxed', label: 'Relaxed', fatigueMult: 0.70, description: 'Plenty of rest days between shows' },
  { id: 'normal', label: 'Normal', fatigueMult: 1.00, description: 'Standard touring pace' },
  { id: 'aggressive', label: 'Aggressive', fatigueMult: 1.50, description: 'Back-to-back shows, high energy drain' },
  { id: 'ambitious', label: 'Ambitious', fatigueMult: 2.00, description: 'Maximum shows, extreme fatigue risk', risky: true },
];

// ─── Default Plan Shape ──────────────────────────────────────────────────────

export const WIZARD_DEFAULT_PLAN = {
  tourName: '',
  tourMode: 'solo',
  coHeadliner: null,
  category: null,
  venueSize: null,
  startDateOffset: 1,
  selectedSongs: [],
  setlistPresetName: null,
  selectedMerch: [],
  strategy: { pacing: 'normal', production: 'basic', ticketPrice: 25 },
  transportTier: null,
  ticketTiers: { ga: 25, reserved: 45, vip: 88, meet_greet: 200 },
  ticketSellTypes: ['presale'],
  crew: [],
  sponsor: null,
  openingActs: [],
  posterMode: null,
  posterUrl: null,
};

export const SETLIST_UNSAVED_PRESET_VALUE = '__custom_setlist__';

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Maps category + venue size to a backend TOUR_TYPES key.
 */
export function mapCategoryVenueSizeToTourType(categoryId, venueSizeId) {
  const option = VENUE_SIZE_OPTIONS.find((v) => v.id === venueSizeId);
  if (!option) return 'local_club';
  return option.tourTypes[0];
}

export function getAllowedVenueSizes(categoryId) {
  return CATEGORY_VENUE_CONSTRAINTS[categoryId] || [];
}

export function getDisabledVenueReason(categoryId, venueId) {
  if (!categoryId) return 'Choose a tour category first';
  const allowedVenues = getAllowedVenueSizes(categoryId);
  if (allowedVenues.includes(venueId)) return null;
  if (['guerilla_promo', 'acoustic_intimate', 'underground_crawl'].includes(categoryId)) {
    return 'This tour category is designed for smaller rooms';
  }
  if (categoryId === 'arena_blitz' && venueId === 'bars_clubs') {
    return 'Arena Blitz is built for major-room scale';
  }
  return 'Not available for this tour category';
}

export function resolveSetlistPresetName(selectedSongs, presets = []) {
  const normalizedSelection = [...selectedSongs].sort().join('|');
  if (!normalizedSelection) return null;
  const matchingPreset = presets.find((preset) => [...(preset.songIds || [])].sort().join('|') === normalizedSelection);
  return matchingPreset?.name || null;
}

/**
 * Dynamic minimum lead time based on stop count and venue size.
 */
export function computeMinLeadTime(stopCount, venueSizeId) {
  const base = venueSizeId === 'arenas_stadiums' ? 3 : venueSizeId === 'large' ? 2 : 1;
  return Math.max(1, base + Math.floor(stopCount / 5));
}

/**
 * Total transport cost for the tour.
 */
export function computeTransportCost(transportTierId, stopCount) {
  const tier = TRANSPORT_TIERS.find((t) => t.id === transportTierId);
  if (!tier) return 0;
  return tier.costPerStop * stopCount;
}

/**
 * Weighted multi-tier ticket revenue estimate.
 */
export function computeTicketTierRevenue(ticketTiers, capacity, fillRate) {
  let total = 0;
  for (const [tier, price] of Object.entries(ticketTiers)) {
    const allocation = TICKET_TIER_ALLOCATIONS[tier] || 0;
    total += price * allocation * capacity * fillRate;
  }
  return Math.round(total);
}

/**
 * Full expense breakdown for the review step.
 */
export function computeExpenseBreakdown(wizardPlan, routeDraft, categoryConfig) {
  const stopCount = routeDraft?.stopCount || 0;
  const costMult = categoryConfig?.cost_multiplier || 1.0;
  const tourTypeKey = mapCategoryVenueSizeToTourType(wizardPlan.category?.id, wizardPlan.venueSize);

  const baseCosts = {
    local_club: 2000,
    regional_circuit: 8000,
    national_headliner: 25000,
    arena_tour: 75000,
    stadium_tour: 200000,
  };

  const venueCost = Math.round((baseCosts[tourTypeKey] || 2000) * costMult);
  const crewCost = wizardPlan.crew.reduce((sum, c) => sum + (c.salary_per_turn || 100), 0) * stopCount;
  const transportCost = computeTransportCost(wizardPlan.transportTier, stopCount);

  const prodMults = { basic: 1.0, standard: 1.25, spectacular: 1.6 };
  const productionCost = Math.round(venueCost * 0.2 * (prodMults[wizardPlan.strategy?.production] || 1.0));

  const total = venueCost + crewCost + transportCost + productionCost;
  return { venue: venueCost, crew: crewCost, transport: transportCost, production: productionCost, total };
}

/**
 * Returns filtered sell types available for given category + venue size.
 */
export function getAvailableSellTypes(categoryId, venueSizeId) {
  return TICKET_SELL_TYPES.map((st) => ({
    ...st,
    disabled:
      (st.disabledForCategories?.includes(categoryId)) ||
      (st.disabledForVenues?.includes(venueSizeId)) ||
      false,
  }));
}

/**
 * Per-step validation. Returns { valid, blockers }.
 */
export function validateWizardStep(step, wizardPlan, profile, routeDraft) {
  const blockers = [];

  if (step === 1) {
    if (!wizardPlan.category) blockers.push({ message: 'Select a tour category', tab: 1 });
    if (!wizardPlan.venueSize) blockers.push({ message: 'Select a venue size', tab: 1 });
    if (wizardPlan.selectedSongs.length === 0) blockers.push({ message: 'Select at least one song for your setlist', tab: 1 });
  }

  if (step === 2) {
    if (!wizardPlan.transportTier) blockers.push({ message: 'Select a transportation option', tab: 2 });
  }

  if (step === 3) {
    if (!routeDraft || routeDraft.stopCount === 0) blockers.push({ message: 'Add at least one region to your route', tab: 3 });
  }

  if (step === 5) {
    if (!wizardPlan.tourName.trim()) blockers.push({ message: 'Enter a tour name', tab: 5 });
    if (!wizardPlan.category) blockers.push({ message: 'Select a tour category', tab: 1 });
    if (!wizardPlan.venueSize) blockers.push({ message: 'Select a venue size', tab: 1 });
    if (wizardPlan.selectedSongs.length === 0) blockers.push({ message: 'Add songs to your setlist', tab: 1 });
    if (!wizardPlan.transportTier) blockers.push({ message: 'Select a transportation option', tab: 2 });
    if (!routeDraft || routeDraft.stopCount === 0) blockers.push({ message: 'Build a route with at least one stop', tab: 3 });
  }

  return { valid: blockers.length === 0, blockers };
}
