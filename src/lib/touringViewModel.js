/**
 * touringViewModel.js
 *
 * Normalizes raw profile + tours + scene data into a single overview model
 * consumed by TouringAppV2's shell and child destinations.
 */

 function normalizeReadinessValue(value) {
   return Math.max(0, Math.min(100, Number(value) || 0));
 }

 export function deriveLaunchRisk(readiness = []) {
   const readinessById = new Map(
     (Array.isArray(readiness) ? readiness : []).map((entry) => [entry.id, normalizeReadinessValue(entry.value)])
   );
   const logistics = readinessById.get('logistics') ?? 0;
   const promo = readinessById.get('promo') ?? 0;
   const showReadiness = readinessById.get('show-readiness') ?? 0;
   const values = [logistics, promo, showReadiness];
   const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
   const underPreparedCount = values.filter((value) => value < 35).length;
   const notes = [];

   if (promo < 45) {
     notes.push('Turnout risk on opening stops');
   }
   if (logistics < 45) {
     notes.push('Route friction risk on departure');
   }
   if (showReadiness < 45) {
     notes.push('Opening-show quality risk');
   }

   let level = 'low';
   if (underPreparedCount >= 2) {
     level = 'high';
   } else if (underPreparedCount >= 1 || average < 55) {
     level = 'moderate';
   }

   return {
     level,
     notes,
   };
 }

 export function buildActiveTourPhaseModel({ activeTour = null } = {}) {
  if (!activeTour) {
    return {
      phase: 'none',
       countdownTurnsRemaining: 0,
       recommendedPrepSlots: 0,
       prepSlotsUsed: 0,
       slotsRemaining: 0,
       readiness: [],
       launchRisk: null,
    };
  }

  const state = activeTour.state || {};
  const phase = (state.phase || activeTour.phase) === 'prep' ? 'prep' : 'live';
  const prepReadiness = state.prep_readiness || activeTour.prep_readiness || {};
  const recommendedPrepSlots = Math.max(0, Number(state.recommended_prep_slots ?? activeTour.recommended_prep_slots) || 0);
  const prepSlotsUsed = Math.max(0, Number(state.prep_slots_used ?? activeTour.prep_slots_used) || 0);
  const readiness = [
    {
      id: 'logistics',
      label: 'Logistics',
      value: normalizeReadinessValue(prepReadiness.logistics),
     },
     {
       id: 'promo',
       label: 'Promo',
       value: normalizeReadinessValue(prepReadiness.promo),
     },
     {
       id: 'show-readiness',
       label: 'Show readiness',
       value: normalizeReadinessValue(prepReadiness.show_readiness),
     },
   ];

   return {
    phase,
    countdownTurnsRemaining: Math.max(0, Number(state.prep_countdown_turns_remaining ?? activeTour.prep_countdown_turns_remaining) || 0),
    recommendedPrepSlots,
    prepSlotsUsed,
    slotsRemaining: Math.max(recommendedPrepSlots - prepSlotsUsed, 0),
    readiness,
     launchRisk: deriveLaunchRisk(readiness),
   };
 }

/**
 * buildTouringOverviewModel
 *
 * @param {Object} opts
 * @param {Object|null} opts.profile           — ArtistProfile record
 * @param {Array}       opts.tours             — All Tour records for this artist
 * @param {Object}      opts.openingActInbox   — { incoming: [], outgoing: [], notifications: [] }
 * @param {Object}      opts.sceneData         — { scenes: [], playerReps: [], contacts: [], contactRelationships: [] }
 * @returns {Object}
 */
export function buildTouringOverviewModel({
  profile = null,
  tours = [],
  openingActInbox = { incoming: [], outgoing: [], notifications: [] },
  sceneData = { scenes: [], playerReps: [], contacts: [], contactRelationships: [] },
} = {}) {
  const safeTours = Array.isArray(tours) ? tours : [];

  const activeTours = safeTours.filter((t) => t && t.status === 'active');
  const completedTours = safeTours.filter(
    (t) => t && (t.status === 'completed' || t.status === 'finished')
  );

  const activeTourCount = activeTours.length;
  const completedTourCount = completedTours.length;

  const totalNetRevenue = completedTours.reduce(
    (acc, t) => acc + (t.total_net_revenue || 0),
    0
  );

  const currentRegion = profile?.region || null;
  const genre = profile?.genre || null;
  const artistId = profile?.id || null;

  const activeTour = activeTours[0] || null;

  const pendingOpeningActRequests = Array.isArray(openingActInbox?.incoming)
    ? openingActInbox.incoming.length
    : 0;

  const scenesVisited = Array.isArray(sceneData?.playerReps)
    ? new Set(sceneData.playerReps.map((r) => r.city_scene_id).filter(Boolean)).size
    : 0;

  return {
    artistId,
    activeTourCount,
    completedTourCount,
    totalNetRevenue,
    currentRegion,
    genre,
    activeTour,
    pendingOpeningActRequests,
    scenesVisited,
  };
}
