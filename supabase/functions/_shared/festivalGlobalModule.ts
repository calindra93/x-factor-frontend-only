/**
 * AMPLIFI FESTIVAL SYSTEM — Global Turn Engine Module
 *
 * Runs ONCE per global tick (after all player turns complete), handling:
 *  1. Instance creation on new in-game year
 *  2. Status transitions (SCHEDULED → OPEN → CLOSED → LOCKED → LIVE → COMPLETE)
 *  3. Lineup selection (deterministic weighted lottery at lineup_lock turn)
 *  4. Rival snipe resolution (Phase 2) — before performance calc
 *  5. Performance resolution (crowd_heat, credibility, conversion per day)
 *  6. Backstage deal generation + resolution (Phase 2)
 *  7. Reward application (clout, followers, brand boost via player_brand_stats)
 *  8. Notifications
 *
 * All writes are idempotent — safe to re-run for same globalTurnId.
 *
 * In-game calendar:
 *   Turn 0 = Jan 1 2021  |  year = Math.floor(turnId / 365)
 *   weekOfYear = Math.ceil(((turnId % 365) + 1) / 7)
 */

import {
  resolveSnipesForDay,
  emitSnipeNotifications,
  regenInfluencePoints,
  resolveTrucesForInstance,
  type SnipeModifiers,
} from './festivalRivalModule.ts';

import {
  generateBackstageOffers,
  resolveAcceptedDeals,
  expireStaleOffers,
  pruneExpiredArtifacts,
  getBackstageEffectsForArtist,
} from './festivalBackstageModule.ts';

import {
  scoreSetlist,
  enrichSetlistSongs,
} from './festivalSetlistModule.ts';

import {
  generateFestivalLoopTokPosts,
  buildFestivalNewsMetrics,
  type FestivalMediaContext,
} from './festivalMediaModule.ts';

import {
  buildFestivalApplicationArchiveRows,
  resolveFestivalSubmissionTurn,
} from './festivalHistoryArchive.ts';
import { insertNotificationIdempotent } from './notificationInsert.ts';

// ── In-game time helpers ─────────────────────────────────────────────────────

export const TURNS_PER_YEAR = 365;

export function inGameYear(turnId: number): number {
  return Math.floor(turnId / TURNS_PER_YEAR);
}

export function weekOfYear(turnId: number): number {
  return Math.ceil(((turnId % TURNS_PER_YEAR) + 1) / 7);
}

/** Turn ID for the start of a given week in a given in-game year */
export function turnForWeek(year: number, week: number): number {
  return year * TURNS_PER_YEAR + (week - 1) * 7;
}

// ── Seeded RNG (mulberry32 — same algo as chartUpdateModule) ─────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seededRng(festivalId: string, lane: string, lockTurn: number): () => number {
  const base = hashStr(`${festivalId}:${lane}:${lockTurn}`);
  let state = base;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return mulberry32(state);
  };
}

export function computeFestivalSceneRepWeight(avgSceneRep: number, regionalSceneRep: number): number {
  const safeAvgSceneRep = Number(avgSceneRep) || 0;
  const safeRegionalSceneRep = Number(regionalSceneRep) || 0;
  const avgSceneRepW = 1 + (safeAvgSceneRep / 100) * 0.2;
  const regionalSceneRepW = safeRegionalSceneRep > 0
    ? 1 + (safeRegionalSceneRep / 100) * 0.35
    : 1;
  return avgSceneRepW * regionalSceneRepW;
}

// ── Career stage index (mirrors careerStages.ts) ─────────────────────────────

const STAGE_ORDER = [
  'Unknown', 'Local Artist', 'Local Buzz', 'Underground Artist',
  'Cult Favorite', 'Breakout Artist', 'Mainstream Artist',
  'A-List Star', 'Global Superstar', 'Legacy Icon',
] as const;

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

function stageFromFans(fans: number): string {
  if (fans >= 50_000_000) return 'Legacy Icon';
  if (fans >= 10_000_000) return 'Global Superstar';
  if (fans >= 3_000_000)  return 'A-List Star';
  if (fans >= 1_000_000)  return 'Mainstream Artist';
  if (fans >= 500_000)    return 'Breakout Artist';
  if (fans >= 200_000)    return 'Cult Favorite';
  if (fans >= 50_000)     return 'Underground Artist';
  if (fans >= 10_000)     return 'Local Buzz';
  if (fans >= 1_000)      return 'Local Artist';
  return 'Unknown';
}

export function computeFestivalContactGain(params: {
  contactRole: string;
  performanceTier: string;
}): number {
  const tierGain: Record<string, number> = {
    Headliner: 4,
    'Co-Headliner': 3,
    Support: 2,
    Opener: 1,
  };
  return Math.min(5, tierGain[params.performanceTier] ?? 1);
}

function mapLaneToPerformanceTier(lane: string): string {
  switch (lane) {
    case 'HEADLINER':
      return 'Headliner';
    case 'MAIN_PRIME':
      return 'Co-Headliner';
    case 'SECOND_PRIME':
    case 'MAIN_EARLY':
      return 'Support';
    case 'DISCOVERY':
    case 'SPOTLIGHT':
      return 'Opener';
    default:
      return 'Support';
  }
}

async function applyFestivalContactGains(params: {
  festivalCityId: string | null;
  performers: Array<{ playerId: string; performanceTier: string }>;
  globalTurnId: number;
  supabase: any;
}): Promise<void> {
  const { festivalCityId, performers, globalTurnId, supabase } = params;
  if (!festivalCityId || !performers.length) return;

  const { data: contacts } = await supabase
    .from('scene_contacts')
    .select('id, role, relationship_threshold, perks')
    .eq('city_id', festivalCityId);
  if (!contacts?.length) return;

  const contactIds = contacts.map((c: any) => c.id);

  for (const performer of performers) {
    const { data: existingRels } = await supabase
      .from('player_contact_relationships')
      .select('contact_id, relationship_level, unlocked_perks')
      .eq('player_id', performer.playerId)
      .in('contact_id', contactIds);

    const relMap = new Map((existingRels || []).map((r: any) => [r.contact_id, r]));

    for (const contact of contacts) {
      const gain = computeFestivalContactGain({
        contactRole: contact.role,
        performanceTier: performer.performanceTier,
      });
      if (gain <= 0) continue;

      const existing = relMap.get(contact.id);
      const currentLevel = Number(existing?.relationship_level || 0);
      const nextLevel = currentLevel + gain;
      const threshold = Number(contact.relationship_threshold || 10);
      const perks = typeof contact.perks === 'string' ? JSON.parse(contact.perks) : (contact.perks || []);
      const unlockedPerks = nextLevel >= threshold
        ? perks.map((p: any) => p.type)
        : (existing?.unlocked_perks || []);

      await supabase
        .from('player_contact_relationships')
        .upsert({
          player_id: performer.playerId,
          contact_id: contact.id,
          relationship_level: nextLevel,
          unlocked_perks: unlockedPerks,
          last_interaction_turn: globalTurnId,
        }, {
          onConflict: 'player_id,contact_id',
        });
    }
  }
}

function isPlayerEligibleForFestival(festival: any, profile: any): boolean {
  const lanes: Record<string, any> = festival?.lanes || {};
  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
  const clout = Number(profile?.clout ?? 0);
  const stage = profile?.career_stage || stageFromFans(fans);
  const sIdx = stageIndex(stage);
  const genre = String(profile?.genre || '').trim();

  return Object.values(lanes).some((cfg: any) => {
    if (!cfg) return false;
    const minStageIdx = Number(cfg.min_stage_idx ?? 0);
    const minFans = Number(cfg.min_fans ?? 0);
    const minClout = Number(cfg.min_clout ?? 0);
    const genreTags: string[] | undefined = cfg.genre_tags;

    if (sIdx < minStageIdx) return false;
    if (fans < minFans) return false;
    if (clout < minClout) return false;
    if (genreTags?.length && !genreTags.includes(genre)) return false;
    return true;
  });
}

function qualifiesForFestivalPromoterOutreach(
  festival: any,
  profile: any,
  promoLabor = 0,
): boolean {
  if (isPlayerEligibleForFestival(festival, profile)) return true;

  const lanes: Record<string, any> = festival?.lanes || {};
  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
  const clout = Number(profile?.clout ?? 0);
  const stage = profile?.career_stage || stageFromFans(fans);
  const sIdx = stageIndex(stage);
  const genre = String(profile?.genre || '').trim();
  const playerFans = Math.max(1, fans);
  const promoBoost = promoLabor > 0
    ? Math.min(0.10, (promoLabor / playerFans) * 0.10)
    : 0;

  return Object.values(lanes).some((cfg: any) => {
    if (!cfg) return false;
    const minStageIdx = Number(cfg.min_stage_idx ?? 0);
    const minFans = Number(cfg.min_fans ?? 0);
    const minClout = Number(cfg.min_clout ?? 0);
    const genreTags: string[] | undefined = cfg.genre_tags;

    if (sIdx < minStageIdx) return false;
    if (genreTags?.length && !genreTags.includes(genre)) return false;

    const fansCloseEnough = minFans <= 0 || fans >= minFans * 0.9;
    const cloutCloseEnough = minClout <= 0 || clout >= minClout * 0.9;
    if (!fansCloseEnough || !cloutCloseEnough) return false;

    const effectiveFans = fans * (1 + promoBoost);
    const effectiveClout = clout * (1 + promoBoost);
    return effectiveFans >= minFans && effectiveClout >= minClout;
  });
}

// ── Moment cards ──────────────────────────────────────────────────────────────

const MOMENT_CARDS = [
  { type: 'ViralChorusClip',    label: 'Viral Chorus Clip',     heat_bonus: 0.20, cred_bonus: 0.05, weight: 15 },
  { type: 'CrowdChant',         label: 'Crowd Chant',           heat_bonus: 0.25, cred_bonus: 0.10, weight: 15 },
  { type: 'UnexpectedCover',    label: 'Unexpected Cover',      heat_bonus: 0.10, cred_bonus: 0.20, weight: 10 },
  { type: 'SurpriseGuestHit',   label: 'Surprise Guest Hit',    heat_bonus: 0.30, cred_bonus: 0.15, weight: 10 },
  { type: 'FashionMoment',      label: 'Fashion Moment',        heat_bonus: 0.15, cred_bonus: 0.05, weight: 10 },
  { type: 'AwkwardSpeech',      label: 'Awkward Speech',        heat_bonus: -0.05, cred_bonus: -0.15, weight: 8 },
  { type: 'TechnicalFail',      label: 'Technical Fail',        heat_bonus: -0.10, cred_bonus: -0.10, weight: 7 },
  { type: 'LegendaryOutro',     label: 'Legendary Outro',       heat_bonus: 0.15, cred_bonus: 0.25, weight: 8 },
  { type: 'PressureMoment',     label: 'Pressure Moment',       heat_bonus: 0.05, cred_bonus: 0.10, weight: 5 },
  { type: 'FestivalStopping',   label: 'Festival-Stopping',     heat_bonus: 0.40, cred_bonus: 0.20, weight: 5 },
  { type: 'EmotionalBreakdown', label: 'Emotional Breakdown',   heat_bonus: 0.05, cred_bonus: -0.05, weight: 4 },
  { type: 'StageInvasion',      label: 'Stage Invasion',        heat_bonus: 0.20, cred_bonus: -0.10, weight: 3 },
];
const MOMENT_TOTAL_WEIGHT = MOMENT_CARDS.reduce((s, c) => s + c.weight, 0);

function drawMomentCard(rng: () => number) {
  const roll = rng() * MOMENT_TOTAL_WEIGHT;
  let acc = 0;
  for (const card of MOMENT_CARDS) {
    acc += card.weight;
    if (roll < acc) return card;
  }
  return MOMENT_CARDS[0];
}

/** Phase 2: Draw with biased weights — boostTypes get 3x weight, penaltyTypes get 2x weight */
function drawBiasedMomentCard(rng: () => number, boostTypes: string[], penaltyTypes: string[]) {
  const boostSet = new Set(boostTypes);
  const penaltySet = new Set(penaltyTypes);
  const biasedCards = MOMENT_CARDS.map((c) => ({
    ...c,
    weight: c.weight * (boostSet.has(c.type) ? 3 : penaltySet.has(c.type) ? 2 : 1),
  }));
  const totalW = biasedCards.reduce((s, c) => s + c.weight, 0);
  const roll = rng() * totalW;
  let acc = 0;
  for (const card of biasedCards) {
    acc += card.weight;
    if (roll < acc) return card;
  }
  return biasedCards[0];
}

// ── Lane reward multipliers ───────────────────────────────────────────────────

const LANE_REWARD_MULT: Record<string, number> = {
  HEADLINER: 5, MAIN_PRIME: 3, MAIN_EARLY: 2, SECOND_PRIME: 2, DISCOVERY: 1, SPOTLIGHT: 1.5,
 };

const MAX_CLOUT_GAIN_PER_DAY = 5000;
const MAX_FOLLOWER_GAIN_PER_DAY = 50000;
const MAX_BRAND_BOOST = 100;
export const BRAND_BOOST_DURATION_TURNS = 30;

// ── Phase duration minimums (turns) ──────────────────────────────────────────
const MIN_APPS_OPEN_DURATION = 7;   // apps open → close: 7 turns minimum
const MIN_REVIEW_DURATION    = 3;   // close → lock: 3 turns minimum
const MIN_SETLIST_WINDOW     = 5;   // lock → start: 5 turns (setlist customization)
const MIN_TOTAL_LEAD_TIME    = MIN_APPS_OPEN_DURATION + MIN_REVIEW_DURATION + MIN_SETLIST_WINDOW; // 15
const IDEAL_APPS_LEAD_TIME   = 21;  // ideally open apps 21 turns (3 weeks) before start

export function computeFestivalPhaseTurns(globalTurnId: number, startTurn: number) {
  const lockTurn = startTurn - MIN_SETLIST_WINDOW;
  const appsCloseTurn = lockTurn - MIN_REVIEW_DURATION;
  const appsOpenTurn = Math.max(globalTurnId, startTurn - IDEAL_APPS_LEAD_TIME);
  return {
    appsOpenTurn,
    appsCloseTurn,
    lockTurn,
  };
}

// ── 1. INSTANCE CREATION ─────────────────────────────────────────────────────

async function createYearInstances(
  supabase: any,
  globalTurnId: number,
  forYear: number,
): Promise<void> {
  // Fetch all active festivals
  const { data: festivals, error } = await supabase
    .from('festivals')
    .select('id, code, seasonal_windows, day_count')
    .eq('is_active', true);

  if (error || !festivals?.length) return;

  const insertRows: any[] = [];

  for (const festival of festivals) {
    const windows: Array<{ week: number }> = festival.seasonal_windows || [];
    for (const win of windows) {
      const week = win.week;
      const startTurn = turnForWeek(forYear, week);

      // Skip if not enough runway for all phases
      if (startTurn <= globalTurnId + MIN_TOTAL_LEAD_TIME) continue;

      const {
        appsOpenTurn,
        appsCloseTurn,
        lockTurn,
      } = computeFestivalPhaseTurns(globalTurnId, startTurn);

      // Final validation: ensure all phases have room
      if (appsOpenTurn >= appsCloseTurn) continue;
      if (appsCloseTurn >= lockTurn) continue;
      if (lockTurn >= startTurn) continue;

      insertRows.push({
        festival_id: festival.id,
        in_game_year: forYear,
        window_week: week,
        applications_open_turn_id: appsOpenTurn,
        applications_close_turn_id: appsCloseTurn,
        lineup_lock_turn_id: lockTurn,
        day_count: festival.day_count,
        status: 'SCHEDULED',
      });
    }
  }

  if (!insertRows.length) return;

  // Upsert — idempotent on (festival_id, in_game_year, window_week)
  await supabase.from('festival_instances').upsert(insertRows, {
    onConflict: 'festival_id,in_game_year,window_week',
    ignoreDuplicates: true,
  });

  console.log(`[Amplifi] Created ${insertRows.length} instances for year ${forYear}`);
}

// ── 2. STATUS TRANSITIONS ─────────────────────────────────────────────────────

async function runStatusTransitions(
  supabase: any,
  globalTurnId: number,
): Promise<{ toSelect: any[]; toResolve: any[] }> {
  const { data: instances } = await supabase
    .from('festival_instances')
    .select('*')
    .not('status', 'in', '("COMPLETE")');

  if (!instances?.length) return { toSelect: [], toResolve: [] };

  const toSelect: any[] = [];   // instances that just became LOCKED → run selection
  const toResolve: any[] = []; // for live instances, look for days to resolve

  for (const inst of instances) {
    let nextStatus = inst.status;

    // Single-step transitions only — each tick advances at most one phase.
    // This prevents catchup cascades from skipping OPEN (application window)
    // when the turn engine misses multiple ticks.
    if (inst.status === 'SCHEDULED' && globalTurnId >= inst.applications_open_turn_id) {
      nextStatus = 'OPEN';
    } else if (inst.status === 'OPEN' && globalTurnId >= inst.applications_close_turn_id) {
      nextStatus = 'CLOSED';
    } else if (inst.status === 'CLOSED' && globalTurnId >= inst.lineup_lock_turn_id) {
      nextStatus = 'LOCKED';
      toSelect.push(inst);
    }

    if (nextStatus !== inst.status) {
      await supabase
        .from('festival_instances')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', inst.id);
    }
  }

  // For LOCKED and LIVE instances, check their days
  const activeInstances = instances.filter(
    (i: any) => i.status === 'LOCKED' || i.status === 'LIVE' || toSelect.some((s: any) => s.id === i.id)
  );

  for (const inst of activeInstances) {
    const { data: days } = await supabase
      .from('festival_instance_days')
      .select('*')
      .eq('festival_instance_id', inst.id)
      .eq('status', 'SCHEDULED');

    for (const day of (days || [])) {
      if (globalTurnId >= day.resolve_turn_id) {
        toResolve.push({ instance: inst, day });
      }
    }
  }

  return { toSelect, toResolve };
}

// ── 3. DAY ROW CREATION ───────────────────────────────────────────────────────

async function ensureDayRows(supabase: any, instance: any): Promise<void> {
  const startTurn = turnForWeek(instance.in_game_year, instance.window_week);
  const dayCount  = instance.day_count || 2;
  const rows = [];

  for (let d = 0; d < dayCount; d++) {
    rows.push({
      festival_instance_id: instance.id,
      day_index: d + 1,
      resolve_turn_id: startTurn + d,
      status: 'SCHEDULED',
    });
  }

  await supabase.from('festival_instance_days').upsert(rows, {
    onConflict: 'festival_instance_id,day_index',
    ignoreDuplicates: true,
  });
}

// ── 4. LINEUP SELECTION ───────────────────────────────────────────────────────

// ── 4-helper. DETERMINISTIC NPC FILL FOR EMPTY LINEUP SLOTS ──────────────────

/**
 * BUG 6 FIX: Fill empty lineup slots with NPC artists from the seeded pool.
 * Uses deterministic seeded RNG keyed to fest+lane+slot for idempotent reruns.
 * Query NPCs from `profiles WHERE is_npc = true ORDER BY id` for stable ordering.
 */
async function fillEmptySlotsWithNpcs(
  supabase: any,
  instance: any,
  globalTurnId: number,
): Promise<void> {
  // Fetch all empty slots for this instance
  const { data: emptySlots } = await supabase
    .from('festival_lineup_slots')
    .select('id, lane, slot_index')
    .eq('festival_instance_id', instance.id)
    .is('artist_id', null);

  if (!emptySlots?.length) return; // No empty slots to fill

  // Fetch the seeded NPC pool with stable ordering (ORDER BY id ensures determinism)
  const { data: npcPool } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_npc', true)
    .order('id', { ascending: true })
    .limit(200); // Reasonable cap for NPC roster

  if (!npcPool?.length) {
    console.warn(`[Amplifi] No NPCs available to fill empty slots for instance ${instance.id}`);
    return;
  }

  // Track which NPCs are already in the lineup to avoid duplicates
  const { data: existingSlots } = await supabase
    .from('festival_lineup_slots')
    .select('artist_id')
    .eq('festival_instance_id', instance.id)
    .not('artist_id', 'is', null);

  const usedNpcIds = new Set((existingSlots || []).map((s: any) => s.artist_id));
  const availableNpcs = npcPool.filter((npc: any) => !usedNpcIds.has(npc.id));

  if (!availableNpcs.length) {
    console.warn(`[Amplifi] All NPCs already assigned for instance ${instance.id}`);
    return;
  }

  // Fill each empty slot using seeded RNG for determinism
  const updates: Array<{ id: string; artist_id: string }> = [];

  for (const slot of emptySlots) {
    if (!availableNpcs.length) break; // No more NPCs available

    // Deterministic seed from instance + lane + slot_index for idempotent fills
    const rng = seededRng(instance.id, slot.lane, slot.slot_index);
    
    // Deterministic pick from available pool
    const pickIndex = Math.floor(rng() * availableNpcs.length);
    const chosenNpc = availableNpcs.splice(pickIndex, 1)[0];

    updates.push({
      id: slot.id,
      artist_id: chosenNpc.id,
    });
  }

  // Apply updates (idempotent: only fills null artist_id slots)
  for (const update of updates) {
    await supabase
      .from('festival_lineup_slots')
      .update({
        artist_id: update.artist_id,
        selection_weight: 0, // NPC fill has zero selection weight (indicates NPC)
        selected_turn_id: globalTurnId,
      })
      .eq('id', update.id)
      .is('artist_id', null); // Only update if still empty (idempotency)
  }

  if (updates.length > 0) {
    console.log(`[Amplifi] NPC fill: Added ${updates.length} NPCs to instance ${instance.id}`);
  }
}

async function runLineupSelection(
  supabase: any,
  globalTurnId: number,
  instance: any,
): Promise<void> {
  // Idempotency: if slots already filled for this instance, skip
  const { data: existingSlots } = await supabase
    .from('festival_lineup_slots')
    .select('id')
    .eq('festival_instance_id', instance.id)
    .not('artist_id', 'is', null)
    .limit(1);

  if (existingSlots?.length > 0) {
    console.log(`[Amplifi] Selection already ran for instance ${instance.id}`);
    return;
  }

  // Fetch festival config
  const { data: festival } = await supabase
    .from('festivals')
    .select('id, code, name, region, genre_weights, controversy_tolerance, brand_posture, lanes')
    .eq('id', instance.festival_id)
    .single();

  if (!festival) return;

  const lanes: Record<string, any> = festival.lanes || {};
  const genreWeights: Record<string, number> = festival.genre_weights || {};
  const festivalRegion = String(festival.region || '').trim();

  // Fetch eligible submissions
  const { data: submissions } = await supabase
    .from('festival_submissions')
    .select('id, artist_id, desired_lane, rehearsal_investment, posture, status, submitted_turn_id')
    .eq('festival_instance_id', instance.id)
    .in('status', ['SUBMITTED', 'ELIGIBLE']);

  if (!submissions?.length) {
    console.log(`[Amplifi] No submissions for instance ${instance.id}`);
    return;
  }

  // Fetch artist profiles for all submitting artists
  const artistIds = [...new Set(submissions.map((s: any) => s.artist_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fans, followers, clout, career_stage, genre, hype')
    .in('id', artistIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Fetch submissions + profiles in bulk
  const submissionIds = submissions.map((s: any) => s.artist_id);
  const { data: selectionFactions } = await supabase
    .from('festival_factions')
    .select('id')
    .eq('festival_id', festival.id)
    .eq('standing_effect', 'selection_weight');
  const selectionFactionIds = (selectionFactions || []).map((f: any) => f.id);
  const { data: selectionStandingRows } = selectionFactionIds.length
    ? await supabase
        .from('player_faction_standing')
        .select('player_id, faction_id, standing')
        .in('player_id', submissionIds)
        .in('faction_id', selectionFactionIds)
    : { data: [] as any[] };
  const selectionStandingMap = new Map<string, number>();
  for (const row of (selectionStandingRows || [])) {
    selectionStandingMap.set(
      `${row.player_id}:${row.faction_id}`,
      Number(row.standing ?? 0),
    );
  }

  // Fetch average + festival-region scene reputation per artist for lineup weight bonus
  let avgSceneRepMap = new Map<string, number>();
  let regionalSceneRepMap = new Map<string, number>();
  try {
    const { data: sceneReps } = await supabase
      .from('player_city_reputation')
      .select('player_id, reputation_score, city_scenes(region)')
      .in('player_id', artistIds);
    if (sceneReps?.length) {
      const avgSums = new Map<string, { total: number; count: number }>();
      const regionalSums = new Map<string, { total: number; count: number }>();
      for (const r of sceneReps as any[]) {
        const playerId = String(r.player_id || '');
        if (!playerId) continue;
        const score = Number(r.reputation_score) || 0;
        const avgCurrent = avgSums.get(playerId) || { total: 0, count: 0 };
        avgCurrent.total += score;
        avgCurrent.count++;
        avgSums.set(playerId, avgCurrent);

        const rowRegion = String(r.city_scenes?.region || '').trim();
        if (festivalRegion && rowRegion === festivalRegion) {
          const regionalCurrent = regionalSums.get(playerId) || { total: 0, count: 0 };
          regionalCurrent.total += score;
          regionalCurrent.count++;
          regionalSums.set(playerId, regionalCurrent);
        }
      }
      for (const [pid, v] of avgSums) avgSceneRepMap.set(pid, v.total / v.count);
      for (const [pid, v] of regionalSums) regionalSceneRepMap.set(pid, v.total / v.count);
    }
  } catch { /* non-critical */ }

  const slotInserts: any[] = [];
  const submissionUpdates: Array<{ id: string; status: string; reason?: string }> = [];
  const notificationsToCreate: any[] = [];

  for (const [laneName, laneConfig] of Object.entries(lanes)) {
    const laneSubmissions = submissions.filter((s: any) => s.desired_lane === laneName);
    if (!laneSubmissions.length) {
      // Create empty slots anyway so the lineup is visible
      for (let i = 0; i < (laneConfig as any).slots; i++) {
        slotInserts.push({
          festival_instance_id: instance.id,
          lane: laneName,
          slot_index: i + 1,
          artist_id: null,
          selection_weight: null,
          selected_turn_id: null,
        });
      }
      continue;
    }

    const cfg = laneConfig as any;
    const slots: number = cfg.slots || 4;
    const minStageIdx: number = cfg.min_stage_idx ?? 0;
    const minFans: number = cfg.min_fans ?? 0;
    const minClout: number = cfg.min_clout ?? 0;
    const genreTags: string[] | undefined = cfg.genre_tags;

    // Evaluate eligibility and compute weights
    type Candidate = { submission: any; profile: any; weight: number };
    const candidates: Candidate[] = [];

    for (const sub of laneSubmissions) {
      const profile: any = profileMap.get(sub.artist_id);
      if (!profile) {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: 'Profile not found' });
        continue;
      }

      const fans = Number(profile.fans ?? profile.followers ?? 0);
      const clout = Number(profile.clout ?? 0);
      const genre = profile.genre || '';
      const stage = profile.career_stage || stageFromFans(fans);
      const sIdx = stageIndex(stage);

      // Eligibility checks
      if (sIdx < minStageIdx) {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: `Career stage too low (need ${STAGE_ORDER[minStageIdx]})` });
        continue;
      }
      if (fans < minFans) {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: `Not enough fans (need ${minFans.toLocaleString()})` });
        continue;
      }
      if (clout < minClout) {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: `Clout too low (need ${minClout.toLocaleString()})` });
        continue;
      }
      if (genreTags?.length && !genreTags.includes(genre)) {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: `Genre ${genre} not in spotlight genre list` });
        continue;
      }

      // Compute selection weight
      const careerStageW = 1 + sIdx * 0.3;                                            // 1.0–3.7
      const cloutW       = Math.log10(Math.max(1, clout)) / 5;                        // 0–2.4
      const genreW       = (genreWeights[genre] ?? 0) / 100;                          // 0–1
      const prepW        = 0.5 + (sub.rehearsal_investment / 100) * 0.5;              // 0.5–1.0
      const totalSelectionStanding = selectionFactionIds.reduce((sum: number, factionId: string) => {
        return sum + (selectionStandingMap.get(`${sub.artist_id}:${factionId}`) ?? 0);
      }, 0);
      const avgSelectionStanding = selectionFactionIds.length ? totalSelectionStanding / selectionFactionIds.length : 0;
      const selectionStandingMultiplier = Math.max(0.5, Math.min(1.5, 1 + avgSelectionStanding / 200));

      // Headliner gate: effectively impossible below A-List Star (idx 7)
      const headlinerGate = laneName === 'HEADLINER'
        ? Math.max(0, sIdx - 6)   // 0 for idx≤6, 1 for idx=7, 2 for idx=8, 3 for idx=9
        : 1;

      // Hybrid scene reputation bonus: average rep baseline plus stronger same-region festival boost
      const avgSceneRep = avgSceneRepMap.get(sub.artist_id) ?? 0;
      const regionalSceneRep = regionalSceneRepMap.get(sub.artist_id) ?? 0;
      const sceneRepW = computeFestivalSceneRepWeight(avgSceneRep, regionalSceneRep);

      const rawWeight = careerStageW * cloutW * genreW * prepW * headlinerGate * selectionStandingMultiplier * sceneRepW;
      const weight = Math.max(0, rawWeight);

      if (weight <= 0 && laneName === 'HEADLINER') {
        submissionUpdates.push({ id: sub.id, status: 'INELIGIBLE', reason: 'Career stage insufficient for Headliner' });
        continue;
      }

      submissionUpdates.push({ id: sub.id, status: 'ELIGIBLE' });
      candidates.push({ submission: sub, profile, weight });
    }

    // Weighted lottery without replacement (deterministic)
    const rng = seededRng(festival.id, laneName, instance.lineup_lock_turn_id);
    const selected: Candidate[] = [];
    const pool = [...candidates];

    const picks = Math.min(slots, pool.length);
    for (let pick = 0; pick < picks; pick++) {
      const totalW = pool.reduce((s, c) => s + c.weight, 0);
      if (totalW <= 0) break;

      let roll = rng() * totalW;
      let chosenIdx = 0;
      for (let j = 0; j < pool.length; j++) {
        roll -= pool[j].weight;
        if (roll <= 0) { chosenIdx = j; break; }
      }
      selected.push(pool[chosenIdx]);
      pool.splice(chosenIdx, 1);
    }

    const selectedIds = new Set(selected.map((c) => c.submission.artist_id));

    // Build slot inserts
    for (let i = 0; i < slots; i++) {
      const winner = selected[i] || null;
      slotInserts.push({
        festival_instance_id: instance.id,
        lane: laneName,
        slot_index: i + 1,
        artist_id: winner?.submission.artist_id ?? null,
        selection_weight: winner?.weight ?? null,
        selected_turn_id: winner ? globalTurnId : null,
      });
    }

    // Mark selected/rejected
    for (const cand of candidates) {
      const wasEligible = submissionUpdates.find((u) => u.id === cand.submission.id);
      if (!wasEligible || wasEligible.status !== 'ELIGIBLE') continue;
      const isSelected = selectedIds.has(cand.submission.artist_id);
      // Override the ELIGIBLE status set earlier
      const existing = submissionUpdates.find((u) => u.id === cand.submission.id);
      if (existing) existing.status = isSelected ? 'SELECTED' : 'REJECTED';
    }

    // Notifications for selection result
    const festName = festival.name || 'Festival';
    for (const cand of candidates) {
      const sub = cand.submission;
      const isSelected = selectedIds.has(sub.artist_id);

      notificationsToCreate.push({
        player_id: sub.artist_id,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: isSelected ? 'FESTIVAL_SELECTED' : 'FESTIVAL_REJECTED',
        title: isSelected ? `${festName} — You made the lineup!` : `${festName} — Not this time`,
        subtitle: isSelected ? `${laneName.replace('_', ' ')} slot confirmed` : `Submission reviewed`,
        body: isSelected
          ? `You've been selected for the ${laneName.replace('_', ' ')} slot at ${festName}. Lock your setlist before the festival starts.`
          : `Your application to ${festName} wasn't selected this round. Keep building and apply again next year.`,
        priority: isSelected ? 'high' : 'medium',
        is_read: false,
        idempotency_key: `festival_selection:${sub.artist_id}:${instance.id}:${laneName}`,
        deep_links: { page: 'AmplifiApp' },
      });
    }
  }

  // Write all slot inserts (idempotent via unique constraint)
  if (slotInserts.length) {
    await supabase.from('festival_lineup_slots').upsert(slotInserts, {
      onConflict: 'festival_instance_id,lane,slot_index',
    });
  }

  // Write submission status updates
  for (const update of submissionUpdates) {
    const submission = submissions?.find((sub: any) => sub.id === update.id);
    await supabase
      .from('festival_submissions')
      .update({
        status: update.status,
        ineligibility_reason: update.reason ?? null,
        submitted_turn_id: resolveFestivalSubmissionTurn(
          submission?.submitted_turn_id,
          instance.applications_close_turn_id,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id);
  }

  // Write notifications
  for (const notif of notificationsToCreate) {
    try {
      await insertNotificationIdempotent(supabase, notif, 'festivalGlobalModule.selection');
    } catch (_) { /* non-fatal */ }
  }

  // BUG 6 FIX: Deterministically fill empty lineup slots with seeded NPC artists
  // After real player selection, query empty slots and fill with NPCs
  await fillEmptySlotsWithNpcs(supabase, instance, globalTurnId);

  console.log(`[Amplifi] Selection complete for ${instance.id}: ${slotInserts.filter((s: any) => s.artist_id).length} slots filled`);
}

// ── 4b. ARCHIVE COMPLETED FESTIVAL → festival_applications ───────────────────

async function archiveCompletedFestival(
  supabase: any,
  instanceId: string,
  globalTurnId: number,
): Promise<void> {
  const { data: submissions } = await supabase
    .from('festival_submissions')
    .select('artist_id, desired_lane, status, posture, rehearsal_investment, visuals_budget, set_length, submitted_turn_id')
    .eq('festival_instance_id', instanceId)
    .eq('status', 'SELECTED');

  if (!submissions?.length) return;

  const artistIds = submissions.map((s: any) => s.artist_id);
  const { data: results } = await supabase
    .from('festival_performance_results')
    .select('artist_id, lane, crowd_heat, credibility, conversion, clout_gain, follower_gain, brand_interest_gain, moment_card, resolved_turn_id')
    .eq('festival_instance_id', instanceId)
    .in('artist_id', artistIds);

  const { data: backstageDeals } = await supabase
    .from('festival_backstage_deals')
    .select('artist_a_id, deal_type, artist_b_id, effects_applied')
    .eq('festival_instance_id', instanceId)
    .in('artist_a_id', artistIds);

  const archiveRows = buildFestivalApplicationArchiveRows({
    instanceId,
    submissions: submissions || [],
    results: results || [],
    globalTurnId,
    backstageDeals: backstageDeals || [],
  });

  for (const row of archiveRows) {
    try {
      await supabase.from('festival_applications').upsert(row, {
        onConflict: 'festival_instance_id,artist_id',
      });
    } catch (err: any) {
      console.error(`[FESTIVAL_ARCHIVE_ROW_FAIL] instance=${row.festival_instance_id} artist=${row.artist_id}:`, err?.message);
    }
  }

  // Retention policy: keep only the last 15 completed records per artist
  const HISTORY_RETENTION_LIMIT = 15;
  const uniqueArtists = [...new Set(archiveRows.map((r: any) => r.artist_id))];
  for (const artistId of uniqueArtists) {
    try {
      const { data: allCompleted } = await supabase
        .from('festival_applications')
        .select('id, archived_at')
        .eq('artist_id', artistId)
        .eq('status', 'completed')
        .order('archived_at', { ascending: false });

      if (allCompleted && allCompleted.length > HISTORY_RETENTION_LIMIT) {
        const idsToDelete = allCompleted.slice(HISTORY_RETENTION_LIMIT).map((r: any) => r.id);
        await supabase
          .from('festival_applications')
          .delete()
          .in('id', idsToDelete);
        console.log(`[FESTIVAL_RETENTION] Pruned ${idsToDelete.length} old history records for artist ${artistId}`);
      }
    } catch (err: any) {
      console.error(`[FESTIVAL_RETENTION_FAIL] artist=${artistId}:`, err?.message);
    }
  }
}

// ── 5. PERFORMANCE RESOLUTION ─────────────────────────────────────────────────

async function runDayResolution(
  supabase: any,
  globalTurnId: number,
  instance: any,
  day: any,
  snipeModifiersMap?: Map<string, SnipeModifiers>,
): Promise<any[]> {
  // Idempotency: if results already exist for this day, skip
  const { data: existing } = await supabase
    .from('festival_performance_results')
    .select('id')
    .eq('festival_instance_day_id', day.id)
    .limit(1);

  if (existing?.length > 0) return [];

  // Fetch festival config
  const { data: festival } = await supabase
    .from('festivals')
    .select('id, code, name, region, city_scene_id, genre_weights, crowd_profile, controversy_tolerance, lanes, region_weather, wristband_economy, wristband_config, has_secret_stage, secret_stage_config, aesthetic_tags')
    .eq('id', instance.festival_id)
    .single();

  if (!festival) return [];

  const festName: string = festival.name;
  const genreWeights: Record<string, number> = festival.genre_weights || {};
  const crowdProfile: Record<string, number> = festival.crowd_profile || {};

  // Fetch all selected artists for this instance
  const { data: lineupSlots } = await supabase
    .from('festival_lineup_slots')
    .select('artist_id, lane, secret_stage_unlocked')
    .eq('festival_instance_id', instance.id)
    .not('artist_id', 'is', null);

  if (!lineupSlots?.length) {
    await supabase
      .from('festival_instance_days')
      .update({ status: 'RESOLVED' })
      .eq('id', day.id);
    return [];
  }

  const artistIds = lineupSlots.map((s: any) => s.artist_id);

  // Fetch artist profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, fans, followers, clout, career_stage, genre, hype, income')
    .in('id', artistIds);

  // Fetch setlists
  const { data: setlists } = await supabase
    .from('festival_setlists')
    .select('artist_id, songs, lane')
    .eq('festival_instance_id', instance.id)
    .in('artist_id', artistIds);

  // Fetch submissions (for rehearsal_investment, posture, wristband_opted_in)
  const { data: submissions } = await supabase
    .from('festival_submissions')
    .select('artist_id, rehearsal_investment, visuals_budget, posture, wristband_opted_in')
    .eq('festival_instance_id', instance.id)
    .in('artist_id', artistIds);

  // Phase 3: Fetch fandom data for dynamic crowd split + heat/fatigue modifiers
  const { data: fandomDataList } = await supabase
    .from('fandoms')
    .select('player_id, fan_segments, heat, fatigue')
    .in('player_id', artistIds);

  // Phase 3: Fetch current eras for setlist scoring
  const { data: eraDataList } = await supabase
    .from('eras')
    .select('artist_id, id')
    .in('artist_id', artistIds)
    .eq('is_active', true);

  const profileMap    = new Map((profiles || []).map((p: any) => [p.id, p]));
  const setlistMap    = new Map((setlists || []).map((s: any) => [s.artist_id, s]));
  const submissionMap = new Map((submissions || []).map((s: any) => [s.artist_id, s]));
  const fandomMap     = new Map((fandomDataList || []).map((f: any) => [f.player_id, f]));
  const eraMap        = new Map((eraDataList || []).map((e: any) => [e.artist_id, e.id]));

  const resultInserts: any[] = [];
  const profileUpdates: Array<{ id: string; clout: number; fans: number; income?: number; region?: string | null }> = [];
  const brandBoostUpserts: any[] = [];
  const notificationsToCreate: any[] = [];

  for (const slot of lineupSlots) {
    const { artist_id, lane } = slot;
    const profile: any = profileMap.get(artist_id);
    if (!profile) continue;

    const submission: any = submissionMap.get(artist_id) || {};
    const setlist: any = setlistMap.get(artist_id) || {};
    const songs: any[] = setlist.songs || [];

    const fans = Number(profile.fans ?? profile.followers ?? 0);
    const clout = Number(profile.clout ?? 0);
    const genre = profile.genre || '';
    const rehearsalInv = Number(submission.rehearsal_investment ?? 50);
    const visualsBudget = Number(submission.visuals_budget ?? 50);
    const posture = typeof submission.posture === 'string' ? submission.posture : 'CLEAN';
    const wristbandOptedIn = submission.wristband_opted_in ?? true;

    // ── Phase 3: Full setlist scoring ────────────────────────────────────
    const eraIdValue = eraMap.get(artist_id);
    const currentEraId: string | null = typeof eraIdValue === 'string'
      ? eraIdValue
      : null;
    const laneSetMin = (festival.lanes?.[lane]?.set_min) ?? 30;
    // Enrich song entries with DB data (quality, streams, era alignment)
    // S-4 FIX: Pass artist_id to filter songs by ownership
    const enrichedSongs = await enrichSetlistSongs(supabase, songs, artist_id);
    const setlistResult = scoreSetlist(enrichedSongs, laneSetMin, currentEraId, artist_id, instance.id);
    // Convert 0–100 score to 0.4–1.0 range to maintain formula compatibility
    const setlistQuality = 0.4 + (setlistResult.totalScore / 100) * 0.6;

    // Prep score: combination of rehearsal and visuals
    const prepScore = (rehearsalInv + visualsBudget) / 200;               // 0–1

    const genreFit = (genreWeights[genre] ?? 0) / 100;                    // 0–1

    // ── Phase 3: Dynamic crowd split (60% festival profile + 40% player fandom) ──
    const fandomData: any = fandomMap.get(artist_id);
    const fandomSegments = fandomData?.fan_segments || {};
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const blendRatio = 0.4;

    const stanWeight    = lerp((crowdProfile.stan ?? 0) / 100,         fandomSegments.stan ?? 0.15,   blendRatio);
    const coreWeight    = lerp((crowdProfile.core ?? 0) / 100,         fandomSegments.core ?? 0.25,   blendRatio);
    const trendWeight   = lerp((crowdProfile.trend_chaser ?? 0) / 100, fandomSegments.trend_chaser ?? 0.15, blendRatio);
    const criticWeight  = lerp((crowdProfile.critic ?? 0) / 100,       fandomSegments.critic ?? 0.10, blendRatio);
    const casualWeight  = lerp((crowdProfile.casual ?? 0) / 100,       fandomSegments.casual ?? 0.35, blendRatio);

    // ── Phase 3: Fandom heat/fatigue modifiers ─────────────────────────
    const fandomHeat    = Number(fandomData?.heat ?? 0);   // 0–1
    const fandomFatigue = Number(fandomData?.fatigue ?? 0); // 0–1
    const heatBonus       = fandomHeat > 0.7 ? 0.05 : 0;
    const fatiguePenalty  = fandomFatigue > 0.8 ? -0.08 : fandomFatigue > 0.6 ? -0.05 : 0;

    // ── Phase 3: Weather modifier ──────────────────────────────────────
    const weatherHeatMod = festival.region_weather?.heat_mod ?? 0;
    const weatherConvMod = festival.region_weather?.conversion_mod ?? 0;

    // Crowd match (higher stan/core = more crowd heat for the artist's existing fans)
    const crowdHeatBase = genreFit * setlistQuality * (0.4 + prepScore * 0.6);

    // Posture modifier
    const postureMultiplier =
      posture === 'CHAOTIC' ? 1.15 :
      posture === 'EDGY'    ? 1.05 : 1.0;

    // ── Phase 2: Snipe modifiers + Backstage effects ────────────────────
    const snipeMods = snipeModifiersMap?.get(artist_id);
    const backstageEffects = await getBackstageEffectsForArtist(supabase, instance.id, artist_id);

    // Draw moment card (seeded per artist + day + instance)
    // Phase 2: Clip Hijack and Stage Guest Surprise bias the draw
    const momentRng = seededRng(artist_id, lane, day.resolve_turn_id);
    let momentCard = drawMomentCard(momentRng);

    // Apply moment card biases from snipes and backstage deals
    const boostTypes = [
      ...(snipeMods?.moment_card_bias?.boost || []),
      ...(backstageEffects.moment_card_boost || []),
    ];
    const penaltyTypes = [
      ...(snipeMods?.moment_card_bias?.penalty || []),
      ...(backstageEffects.moment_card_penalty || []),
    ];
    // If there are biases, re-roll with boosted weights (deterministic via seeded RNG)
    if (boostTypes.length || penaltyTypes.length) {
      momentCard = drawBiasedMomentCard(momentRng, boostTypes, penaltyTypes);
    }

    // Final 3 axes (0–100) — apply snipe mods as additive multipliers
    const snipeCrowdMod = snipeMods?.crowd_heat_mod ?? 0;
    const snipeConvMod = snipeMods?.conversion_mod ?? 0;
    const snipeCredMod = snipeMods?.credibility_mod ?? 0;
    const backstageCredBoost = backstageEffects.credibility_boost || 0;
    const backstageConvBoost = backstageEffects.conversion_boost || 0;

    // Top-song bonus: bonus crowd heat from hit songs in the setlist
    const topSongBonusPct = setlistResult.topSongHeatBonus / 100;
    // Unreleased risk mod applied to base before multipliers
    const unreleasedMod = setlistResult.unreleasedRiskMod;

    const crowdHeat = Math.max(0, Math.min(100, Math.round(
      crowdHeatBase * 100
      * postureMultiplier
      * (1 + momentCard.heat_bonus)
      * (1 + snipeCrowdMod)
      * (1 + heatBonus + fatiguePenalty + weatherHeatMod + unreleasedMod)
      + setlistResult.topSongHeatBonus * (1 + snipeCrowdMod)
    )));
    const credibility = Math.max(0, Math.min(100, Math.round(
      genreFit * setlistQuality * 100
      * (0.6 + criticWeight * 0.4)
      * (1 + momentCard.cred_bonus)
      * (1 + snipeCredMod + backstageCredBoost)
    )));
    const conversion = Math.max(0, Math.min(100, Math.round(
      crowdHeat * (casualWeight * 0.2 + trendWeight * 0.15 + coreWeight * 0.1)
      * (1 + snipeConvMod + backstageConvBoost + weatherConvMod)
    )));

    // ── Rewards ───────────────────────────────────────────────────────────
    const laneMultiplier = LANE_REWARD_MULT[lane] ?? 1;
    const secretStageRewardMult = Number(festival.secret_stage_config?.reward_mult ?? 1);
    const secretStageMinCred = Number(festival.secret_stage_config?.min_credibility ?? 0);
    const secretStageEligible = !!festival.has_secret_stage && !!slot.secret_stage_unlocked && credibility >= secretStageMinCred;
    const effectiveRewardMultiplier = laneMultiplier * (secretStageEligible ? secretStageRewardMult : 1);

    const cloutGain = Math.min(MAX_CLOUT_GAIN_PER_DAY, Math.floor(
      crowdHeat * effectiveRewardMultiplier * 5
    ));
    const followerGain = Math.min(MAX_FOLLOWER_GAIN_PER_DAY, Math.floor(
      crowdHeat * effectiveRewardMultiplier * fans * 0.0005
    ));
    const brandInterestGain = Math.min(MAX_BRAND_BOOST, Math.floor(
      (crowdHeat + credibility) * effectiveRewardMultiplier * 0.25
    ));

    // ── Phase 3: Wristband payout ─────────────────────────────────────────
    let wristbandPayout = 0;
    if (festival.wristband_economy && wristbandOptedIn && festival.wristband_config) {
      const cfg = festival.wristband_config;
      if (crowdHeat >= (cfg.crowd_threshold ?? 60)) {
        wristbandPayout = Math.floor((cfg.base_payout ?? 400) * (cfg.payout_mult ?? 1.8));
      }
    }

    resultInserts.push({
      festival_instance_day_id: day.id,
      festival_instance_id: instance.id,
      artist_id,
      lane,
      crowd_heat: crowdHeat,
      credibility,
      conversion,
      clout_gain: cloutGain,
      follower_gain: followerGain,
      brand_interest_gain: brandInterestGain,
      moment_card: momentCard,
      resolved_turn_id: globalTurnId,
      snipe_modifiers: snipeMods ? { crowd_heat_mod: snipeMods.crowd_heat_mod, conversion_mod: snipeMods.conversion_mod, credibility_mod: snipeMods.credibility_mod, sources: snipeMods.sources } : null,
      backstage_effects: (backstageCredBoost || backstageConvBoost || boostTypes.length || penaltyTypes.length) ? { credibility_boost: backstageCredBoost, conversion_boost: backstageConvBoost, moment_card_boost: boostTypes, moment_card_penalty: penaltyTypes } : null,
      // Phase 3 extras stored in jsonb for frontend/news access
      setlist_score: setlistResult.totalScore,
      wristband_payout: wristbandPayout,
      unreleased_roll: setlistResult.unreleasedRollResult,
    });

    profileUpdates.push({
      id: artist_id,
      clout: clout + cloutGain,
      fans: fans + followerGain,
      // wristband payout added to income
      income: wristbandPayout > 0 ? (Number(profile.income ?? 0) + wristbandPayout) : undefined,
      region: festival?.region || null,
    });

    if (brandInterestGain > 0) {
      brandBoostUpserts.push({
        artist_id,
        platform: 'all',
        festival_brand_boost: brandInterestGain,
        festival_boost_expires_turn: globalTurnId + BRAND_BOOST_DURATION_TURNS,
        last_brand_turn: globalTurnId,
      });
    }

    // ── Phase 3: Highlight clip generation (positive moment cards) ────────
    if (momentCard.heat_bonus >= 0.10) {
      try {
        await supabase.from('festival_highlight_clips').upsert({
          festival_instance_id: instance.id,
          artist_id,
          day_index: day.day_index,
          moment_card_type: momentCard.type,
          moment_card_label: momentCard.label,
          expires_turn_id: globalTurnId + 5,
          created_turn_id: globalTurnId,
        }, { onConflict: 'festival_instance_id,artist_id,day_index', ignoreDuplicates: true });
      } catch (_) { /* non-fatal */ }
    }

    // ── Phase 3: Faction standing updates ─────────────────────────────────
    try {
      await updateFactionStandings(supabase, artist_id, festival.id, crowdHeat, credibility, conversion, globalTurnId);
    } catch (_) { /* non-fatal */ }

    // ── Phase 3: Festival media posts (LoopTok fallout) ───────────────────
    try {
      const mediaCtx: FestivalMediaContext = {
        festivalName: festName,
        festivalCode: festival.code ?? '',
        dayIndex: day.day_index,
        artistId: artist_id,
        artistName: profile.artist_name || profile.name || 'Artist',
        lane,
        crowdHeat,
        credibility,
        conversion,
        momentCardType: momentCard.type,
        momentCardLabel: momentCard.label,
        globalTurnId,
        instanceId: instance.id,
      };
      await generateFestivalLoopTokPosts(supabase, mediaCtx);
    } catch (_) { /* non-fatal */ }

    // Notification
    const momentLabel = momentCard.label;
    notificationsToCreate.push({
      player_id: artist_id,
      global_turn_id: globalTurnId,
      created_turn_index: globalTurnId,
      type: 'FESTIVAL_DAY_RESULT',
      title: `${festName} — Day ${day.day_index} Results`,
      subtitle: `${momentLabel} · +${cloutGain.toLocaleString()} clout`,
      body: `Crowd Heat ${crowdHeat}/100 · Credibility ${credibility}/100 · Conversion ${conversion}/100. ${followerGain > 0 ? `+${followerGain.toLocaleString()} new fans.` : ''} ${brandInterestGain > 0 ? `Brand scouts noticed (+${brandInterestGain} interest).` : ''} ${secretStageEligible ? 'Your secret stage access amplified the payout.' : ''}`,
      metrics: { crowd_heat: crowdHeat, credibility, conversion, clout_gain: cloutGain, follower_gain: followerGain, brand_interest_gain: brandInterestGain },
      priority: 'high',
      is_read: false,
      idempotency_key: `festival_day_result:${artist_id}:${instance.id}:${day.id}`,
      // BUG 4 FIX: Route to Green Room so scout interest is visible
      deep_links: { page: 'AmplifiApp', tab: 'greenroom' },
    });
  }

  // Write performance results (idempotent via unique constraint)
  // BUG 2 FIX: Check upsert success and abort day resolution if it fails
  if (resultInserts.length) {
    const { data: upsertedResults, error: upsertError } = await supabase
      .from('festival_performance_results')
      .upsert(resultInserts, {
        onConflict: 'festival_instance_day_id,artist_id',
        ignoreDuplicates: true,
      })
      .select('id');

    // Critical guardrail: if the upsert failed, abort this resolution cycle
    // Day stays SCHEDULED so it will retry on next tick (preserves retryability)
    if (upsertError) {
      console.error(`[FESTIVAL_DAY_RESOLUTION_FAIL] instance=${instance.id} day=${day.id} turn=${globalTurnId}: ${upsertError.message}`);
      return []; // Abort — do not mark day RESOLVED or instance COMPLETE
    }

    // Secondary check: verify at least some rows were persisted
    const persistedCount = upsertedResults?.length ?? 0;
    if (persistedCount === 0 && resultInserts.length > 0) {
      console.error(`[FESTIVAL_DAY_RESOLUTION_FAIL] instance=${instance.id} day=${day.id} turn=${globalTurnId}: Zero rows persisted out of ${resultInserts.length} expected`);
      return []; // Abort — failed to persist any results
    }

    await applyFestivalContactGains({
      festivalCityId: festival.city_scene_id ?? null,
      performers: resultInserts.map((row: any) => ({
        playerId: row.artist_id,
        performanceTier: mapLaneToPerformanceTier(row.lane),
      })),
      globalTurnId,
      supabase,
    });
  }

  // Apply clout + follower + wristband income rewards to profiles
  for (const update of profileUpdates) {
    try {
      const patch: any = {
        clout: Math.floor(update.clout),
        fans: Math.floor(update.fans),
        updated_at: new Date().toISOString(),
      };
      if (update.income !== undefined) {
        patch.income = Math.floor(update.income);
      }
      if (update.region) {
        patch.region = update.region;
      }
      await supabase
        .from('profiles')
        .update(patch)
        .eq('id', update.id);
    } catch (_) { /* non-fatal */ }
  }

  // Upsert brand boost (idempotent on artist_id+platform)
  for (const boost of brandBoostUpserts) {
    try {
      await supabase.from('player_brand_stats').upsert(boost, {
        onConflict: 'artist_id,platform',
      });
    } catch (_) { /* non-fatal */ }
  }

  // Write notifications
  for (const notif of notificationsToCreate) {
    try {
      await insertNotificationIdempotent(supabase, notif, 'festivalGlobalModule.dayResult');
    } catch (_) { /* non-fatal */ }
  }

  // Mark day as RESOLVED
  await supabase
    .from('festival_instance_days')
    .update({ status: 'RESOLVED' })
    .eq('id', day.id);

  // Check if all days resolved → mark instance COMPLETE
  const { count } = await supabase
    .from('festival_instance_days')
    .select('id', { count: 'exact', head: true })
    .eq('festival_instance_id', instance.id)
    .eq('status', 'SCHEDULED');

  if ((count ?? 0) === 0) {
    await supabase
      .from('festival_instances')
      .update({ status: 'COMPLETE', updated_at: new Date().toISOString() })
      .eq('id', instance.id);

    // Archive selected submissions into festival_applications for career history
    try {
      await archiveCompletedFestival(supabase, instance.id, globalTurnId);
    } catch (err: any) {
      console.error(`[FESTIVAL_ARCHIVE_FAIL] instance=${instance.id} turn=${globalTurnId}:`, err?.message);
    }
  } else {
    // Ensure status is LIVE
    await supabase
      .from('festival_instances')
      .update({ status: 'LIVE', updated_at: new Date().toISOString() })
      .eq('id', instance.id)
      .in('status', ['LOCKED', 'LIVE']);
  }

  console.log(`[Amplifi] Day ${day.day_index} resolved for instance ${instance.id}: ${resultInserts.length} performances`);

  return resultInserts;
}

// ── 5a-helper. FACTION STANDING UPDATE ───────────────────────────────────────

/**
 * Adjusts player_faction_standing for this festival based on performance metrics.
 * Standing delta is derived from how far each metric is above/below neutral (50).
 * Non-fatal: missing factions are silently skipped.
 */
async function updateFactionStandings(
  supabase: any,
  artistId: string,
  festivalId: string,
  crowdHeat: number,
  credibility: number,
  conversion: number,
  globalTurnId: number,
): Promise<void> {
  const { data: factions } = await supabase
    .from('festival_factions')
    .select('id, code')
    .eq('festival_id', festivalId);

  if (!factions?.length) return;

  // Preload existing standings in one query
  const factionIds = factions.map((f: any) => f.id);
  const { data: existingRows } = await supabase
    .from('player_faction_standing')
    .select('faction_id, standing')
    .eq('player_id', artistId)
    .in('faction_id', factionIds);
  const standingMap = new Map((existingRows || []).map((r: any) => [r.faction_id, Number(r.standing)]));

  const upserts: any[] = [];

  for (const faction of factions) {
    const code: string = faction.code;
    let delta = 0;

    if (code === 'crowd') {
      delta = Math.round((crowdHeat - 50) * 0.1);
    } else if (code === 'press') {
      delta = Math.round((credibility - 50) * 0.1);
    } else if (code === 'brands') {
      delta = Math.round((conversion - 50) * 0.1);
    } else if (code === 'bookers') {
      delta = Math.round(((credibility + crowdHeat) / 2 - 50) * 0.08);
    } else if (code === 'scene') {
      // Scene values credibility; penalises overly commercial performance
      delta = Math.round((Number(credibility) - 50) * 0.10) - (Number(conversion) > 75 ? 3 : 0);
    } else if (code === 'legacy') {
      delta = Math.round((credibility - 50) * 0.06);
    } else {
      delta = Math.round(((credibility + crowdHeat) / 2 - 50) * 0.08);
    }

    if (delta === 0) continue;

    const current = Number(standingMap.get(faction.id) ?? 0);
    const newStanding = Math.max(-100, Math.min(100, current + delta));

    upserts.push({
      player_id: artistId,
      faction_id: faction.id,
      standing: newStanding,
      last_changed_turn: globalTurnId,
    });
  }

  if (upserts.length) {
    await supabase.from('player_faction_standing').upsert(upserts, {
      onConflict: 'player_id,faction_id',
    });
  }
}

// ── 5b. AUTO-SEED SETLIST FROM TOP SONGS ────────────────────────────────────

/**
 * For every SELECTED artist who has no setlist yet, auto-build one from their
 * top-streamed songs. Fires a FESTIVAL_SETLIST_REMINDER notification.
 * Called after lineup selection (when instance transitions to LOCKED).
 */
async function autoSeedSetlistsForInstance(
  supabase: any,
  instance: any,
  globalTurnId: number,
  skipNotification = false,
): Promise<void> {
  if (instance._skipNotification) skipNotification = true;
  // Fetch selected artists for this instance
  const { data: slots } = await supabase
    .from('festival_lineup_slots')
    .select('artist_id, lane')
    .eq('festival_instance_id', instance.id)
    .not('artist_id', 'is', null);

  if (!slots?.length) return;

  const festName = instance._festName || 'Festival';
  const startTurn = turnForWeek(instance.in_game_year, instance.window_week);
  const turnsUntilStart = startTurn - globalTurnId;

  for (const slot of slots) {
    const { artist_id, lane } = slot;

    // Check if setlist already exists
    const { data: existing } = await supabase
      .from('festival_setlists')
      .select('id, locked')
      .eq('festival_instance_id', instance.id)
      .eq('artist_id', artist_id)
      .maybeSingle();

    if (!existing) {
      // Fetch top songs by streams
      const { data: topSongs } = await supabase
        .from('songs')
        .select('id, title')
        .eq('artist_id', artist_id)
        .eq('is_remix', false)
        .order('created_at', { ascending: false })
        .limit(8);

      const songsData = (topSongs || []).map((s: any, i: number) => ({
        songId: s.id, title: s.title, order: i + 1,
      }));

      // Insert auto-generated draft setlist
      await supabase.from('festival_setlists').insert({
        festival_instance_id: instance.id,
        artist_id,
        lane,
        songs: songsData,
        locked: false,
      }).select().maybeSingle();
    }

    // Only notify real players (not NPCs — checked by user_account_id existing)
    const { data: playerCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', artist_id)
      .not('user_account_id', 'is', null)
      .maybeSingle();

    if (!playerCheck) continue;

    // Send setlist reminder notification (only on lineup-lock pass, not daily seed pass)
    const isLocked = existing?.locked === true;
    if (!isLocked && !skipNotification) {
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: artist_id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_SETLIST_REMINDER',
          title: `${festName} — Review Your Setlist`,
          subtitle: turnsUntilStart > 0 ? `${turnsUntilStart} day${turnsUntilStart !== 1 ? 's' : ''} until showtime` : 'Showtime is here!',
          body: existing
            ? `You have a draft setlist for ${festName}. Review and lock it before the festival starts${turnsUntilStart > 0 ? ` (${turnsUntilStart} days away)` : '!'}.`
            : `We auto-filled a setlist for ${festName} from your top songs. Customize and lock it before the festival starts.`,
          priority: turnsUntilStart <= 3 ? 'high' : 'medium',
          is_read: false,
          idempotency_key: `festival_setlist_reminder:${artist_id}:${instance.id}:${globalTurnId}`,
          deep_links: { page: 'AmplifiApp' },
        }, 'festivalGlobalModule.setlistReminder');
      } catch (_) { /* non-fatal */ }
    }
  }
}

// ── 6a. LINEUP LOCKED NOTIFICATIONS ──────────────────────────────────────────

async function notifyLineupLocked(
  supabase: any,
  instance: any,
  globalTurnId: number,
): Promise<void> {
  // Fetch festival name
  const { data: festival } = await supabase
    .from('festivals')
    .select('name')
    .eq('id', instance.festival_id)
    .maybeSingle();
  const festName = festival?.name || 'Festival';

  // Get all SELECTED submissions for this instance
  const { data: selected } = await supabase
    .from('festival_submissions')
    .select('artist_id, desired_lane')
    .eq('festival_instance_id', instance.id)
    .eq('status', 'SELECTED');

  const startTurn = turnForWeek(instance.in_game_year, instance.window_week);
  const turnsUntilStart = startTurn - globalTurnId;

  for (const sub of (selected || [])) {
    try {
      await insertNotificationIdempotent(supabase, {
        player_id: sub.artist_id,
        global_turn_id: globalTurnId,
        created_turn_index: globalTurnId,
        type: 'FESTIVAL_LINEUP_LOCKED',
        title: `${festName} — Lineup Is Set!`,
        subtitle: `${LANE_LABEL_MAP[sub.desired_lane] || sub.desired_lane} · ${turnsUntilStart} day${turnsUntilStart !== 1 ? 's' : ''} to go`,
        body: `The ${festName} lineup is locked. You're in! The festival starts in ${turnsUntilStart} day${turnsUntilStart !== 1 ? 's' : ''}. Head to Amplifi to review your setlist and plan your strategy.`,
        priority: 'high',
        is_read: false,
        idempotency_key: `festival_lineup_locked:${sub.artist_id}:${instance.id}`,
        deep_links: { page: 'AmplifiApp' },
      }, 'festivalGlobalModule.lineupLocked');
    } catch (_) { /* non-fatal */ }
  }
}

const LANE_LABEL_MAP: Record<string, string> = {
  HEADLINER: 'Headliner', MAIN_PRIME: 'Main Stage', MAIN_EARLY: 'Main Early',
  SECOND_PRIME: 'Second Stage', DISCOVERY: 'Discovery', SPOTLIGHT: 'Spotlight',
};

// ── 6b. FESTIVAL STARTING SOON NOTIFICATION ───────────────────────────────────

/**
 * Sends a reminder to all selected players 1 turn before the festival starts.
 * Fires when globalTurnId === startTurn - 1.
 */
async function notifyFestivalStartingSoon(
  supabase: any,
  globalTurnId: number,
): Promise<void> {
  // Find LOCKED instances whose festival starts next turn
  const { data: instances } = await supabase
    .from('festival_instances')
    .select('id, festival_id, in_game_year, window_week')
    .eq('status', 'LOCKED');

  for (const inst of (instances || [])) {
    const startTurn = turnForWeek(inst.in_game_year, inst.window_week);
    if (startTurn - globalTurnId !== 1) continue;

    const { data: festival } = await supabase
      .from('festivals')
      .select('name')
      .eq('id', inst.festival_id)
      .maybeSingle();
    const festName = festival?.name || 'Festival';

    const { data: selected } = await supabase
      .from('festival_submissions')
      .select('artist_id')
      .eq('festival_instance_id', inst.id)
      .eq('status', 'SELECTED');

    for (const sub of (selected || [])) {
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: sub.artist_id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_STARTING_SOON',
          title: `${festName} — Tomorrow Is Showday!`,
          subtitle: 'Last chance to lock your setlist',
          body: `${festName} kicks off tomorrow. Make sure your setlist is locked in Amplifi — if you don't lock it, your auto-generated setlist will be used.`,
          priority: 'high',
          is_read: false,
          idempotency_key: `festival_starting_soon:${sub.artist_id}:${inst.id}`,
          deep_links: { page: 'AmplifiApp' },
        }, 'festivalGlobalModule.startingSoon');
      } catch (_) { /* non-fatal */ }
    }
  }
}

// ── 6c. OPEN APPLICATIONS NOTIFICATIONS ──────────────────────────────────────

async function notifyApplicationsOpen(supabase: any, globalTurnId: number): Promise<void> {
  // Find instances that are OPEN and whose open turn has passed (range check, not exact)
  // This ensures the notification fires even if the exact open-turn was missed.
  const { data: justOpened } = await supabase
    .from('festival_instances')
    .select('id, festival_id, applications_open_turn_id, applications_close_turn_id')
    .eq('status', 'OPEN')
    .lte('applications_open_turn_id', globalTurnId)
    .gt('applications_close_turn_id', globalTurnId);

  if (!justOpened?.length) return;

  // Fetch festival names
  const festivalIds = justOpened.map((i: any) => i.festival_id);
  const { data: festivals } = await supabase
    .from('festivals')
    .select('id, name, lanes')
    .in('id', festivalIds);

  const festMap = new Map((festivals || []).map((f: any) => [f.id, f]));

  // Get all active players (real players have a user_account_id)
  const { data: players } = await supabase
    .from('profiles')
    .select('id, artist_name, fans, followers, clout, career_stage, genre')
    .not('user_account_id', 'is', null)
    .limit(500);

  const playerIds = (players || []).map((player: any) => player.id).filter(Boolean);
  const promoLaborByPlayer = new Map<string, number>();
  if (playerIds.length > 0) {
    const { data: segmentRows } = await supabase
      .from('fandom_segments')
      .select('player_id, labor_output')
      .in('player_id', playerIds);
    for (const row of (segmentRows || [])) {
      const playerId = String((row as any).player_id || '');
      if (!playerId) continue;
      const laborOutput = ((row as any).labor_output || {}) as Record<string, number>;
      const current = promoLaborByPlayer.get(playerId) || 0;
      promoLaborByPlayer.set(playerId, current + (Number(laborOutput.promo) || 0));
    }
  }

  for (const instance of justOpened) {
    const fest: any = festMap.get(instance.festival_id);
    if (!fest) continue;
    const turnsLeft = instance.applications_close_turn_id - globalTurnId;

    for (const player of (players || [])) {
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: player.id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_APPLICATIONS_OPEN',
          title: `${fest.name} — Applications Open`,
          subtitle: `${turnsLeft} day${turnsLeft !== 1 ? 's' : ''} to submit`,
          body: `${fest.name} is now accepting applications. Submit your application and choose your lane before the deadline closes in ${turnsLeft} day${turnsLeft !== 1 ? 's' : ''}.`,
          priority: 'medium',
          is_read: false,
          idempotency_key: `festival_apps_open:${player.id}:${instance.id}`,
          deep_links: { page: 'AmplifiApp' },
        }, 'festivalGlobalModule.appsOpen');
      } catch (_) { /* non-fatal */ }

      const promoLabor = promoLaborByPlayer.get(String(player.id)) || 0;
      if (!qualifiesForFestivalPromoterOutreach(fest, player, promoLabor)) continue;

      try {
        await insertNotificationIdempotent(supabase, {
          player_id: player.id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_PROMOTER_OUTREACH',
          title: `${fest.name} — Promoter Outreach`,
          subtitle: 'Your profile fits an open festival lane',
          body: `${fest.name} promoters are scouting right now, and your artist profile qualifies for at least one open lane. Head to Amplifi and submit before applications close in ${turnsLeft} day${turnsLeft !== 1 ? 's' : ''}.`,
          priority: 'high',
          is_read: false,
          idempotency_key: `festival_promoter_outreach:${player.id}:${instance.id}`,
          deep_links: { page: 'AmplifiApp' },
          metrics: {
            festival_instance_id: instance.id,
            festival_id: fest.id,
            festival_name: fest.name,
            outreach_type: 'festival_promoter_outreach',
            promo_labor: promoLabor,
          },
        }, 'festivalGlobalModule.promoterOutreach');
      } catch (_) { /* non-fatal */ }
    }
  }
}

// ── 7. MAIN EXPORT ────────────────────────────────────────────────────────────

export async function processFestivalGlobalModule(
  globalTurnId: number,
  supabase: any,
  _engineCtx: any = {},
): Promise<void> {
  const currentYear = inGameYear(globalTurnId);

  // A) Create instances for new in-game year (runs on year tick AND on startup for remaining year)
  const isNewYear = globalTurnId % TURNS_PER_YEAR === 0;
  if (isNewYear) {
    await createYearInstances(supabase, globalTurnId, currentYear);

    // A2) Apply yearly faction standing decay (10% loss toward neutral)
    // Decay_rate 0.9 = standings retain 90% of their value each year
    try {
      const FACTION_DECAY_RATE = 0.9;
      await supabase.rpc('decay_faction_standings', { decay_rate: FACTION_DECAY_RATE });
      console.log(`[FACTION_DECAY] Applied decay_rate=${FACTION_DECAY_RATE} at turn=${globalTurnId} (year=${currentYear})`);
    } catch (decayErr: any) {
      // Non-fatal: missing RPC or no standings yet
      console.warn(`[FACTION_DECAY] Failed at turn=${globalTurnId}:`, decayErr?.message || decayErr);
    }
  }

  // B) Bootstrap: create instances for current year if none exist yet
  // (first time the module runs, or after a clean DB)
  const { count: instanceCount } = await supabase
    .from('festival_instances')
    .select('id', { count: 'exact', head: true })
    .eq('in_game_year', currentYear);

  if ((instanceCount ?? 0) === 0) {
    await createYearInstances(supabase, globalTurnId, currentYear);
  }

  // C) Status transitions
  const { toSelect, toResolve } = await runStatusTransitions(supabase, globalTurnId);

  // D) For instances transitioning to LOCKED: ensure day rows exist + run selection
  for (const instance of toSelect) {
    try {
      await ensureDayRows(supabase, instance);
      // Attach festival name for notification copy
      const { data: festData } = await supabase
        .from('festivals').select('name').eq('id', instance.festival_id).maybeSingle();
      instance._festName = festData?.name || 'Festival';
      await runLineupSelection(supabase, globalTurnId, instance);
      // After selection: notify selected players + auto-seed setlists
      await notifyLineupLocked(supabase, instance, globalTurnId);
      await autoSeedSetlistsForInstance(supabase, instance, globalTurnId);
    } catch (e: any) {
      console.error(`[Amplifi] Selection error for instance ${instance.id}:`, e?.message || e);
    }
  }

  // E) For any LOCKED/LIVE instances with pending day rows (in case we missed a tick)
  //    Ensure day rows are created, and catch-up COMPLETE status for fully-resolved instances
  const { data: lockedInstances } = await supabase
    .from('festival_instances')
    .select('*')
    .in('status', ['LOCKED', 'LIVE']);

  for (const inst of (lockedInstances || [])) {
    if (!toSelect.find((s: any) => s.id === inst.id)) {
      try { await ensureDayRows(supabase, inst); } catch (_) {}
    }

    // Catch-up: if all days are RESOLVED but instance is still LOCKED/LIVE, mark COMPLETE
    try {
      const { count: scheduledCount } = await supabase
        .from('festival_instance_days')
        .select('id', { count: 'exact', head: true })
        .eq('festival_instance_id', inst.id)
        .eq('status', 'SCHEDULED');

      if ((scheduledCount ?? 0) === 0) {
        const { count: resolvedCount } = await supabase
          .from('festival_instance_days')
          .select('id', { count: 'exact', head: true })
          .eq('festival_instance_id', inst.id)
          .eq('status', 'RESOLVED');

        if ((resolvedCount ?? 0) > 0) {
          await supabase
            .from('festival_instances')
            .update({ status: 'COMPLETE', updated_at: new Date().toISOString() })
            .eq('id', inst.id);
          await archiveCompletedFestival(supabase, inst.id, globalTurnId);
          console.log(`[Amplifi] Catch-up: marked instance ${inst.id} as COMPLETE (all days resolved)`);
        }
      }
    } catch (_) {}
  }

  // F) Performance resolution for days that are due
  //    Phase 2: resolve snipes BEFORE performance calc, generate backstage offers AFTER
  for (const { instance, day } of toResolve) {
    try {
      // F0.5) Resolve pending/active truces (before snipes so betrayals are counted)
      try {
        await resolveTrucesForInstance(supabase, instance.id, globalTurnId);
      } catch (truceErr: any) {
        console.error(`[Amplifi Phase 3] Truce resolution error (non-fatal):`, truceErr?.message || truceErr);
      }

      // F1) Resolve staged rival snipes for this day → modifier map
      let snipeModifiersMap: Map<string, SnipeModifiers> | undefined;
      try {
        snipeModifiersMap = await resolveSnipesForDay(supabase, instance.id, day.day_index, globalTurnId);
        if (snipeModifiersMap.size > 0) {
          console.log(`[Amplifi Phase 2] Resolved ${snipeModifiersMap.size} snipe targets for day ${day.day_index}`);
          await emitSnipeNotifications(supabase, instance.id, day.day_index, globalTurnId, snipeModifiersMap);
        }
      } catch (snipeErr: any) {
        console.error(`[Amplifi Phase 2] Snipe resolution error (non-fatal):`, snipeErr?.message || snipeErr);
      }

      // F2) Resolve accepted backstage deals
      try {
        await resolveAcceptedDeals(supabase, instance.id, globalTurnId);
      } catch (dealErr: any) {
        console.error(`[Amplifi Phase 2] Backstage deal resolution error (non-fatal):`, dealErr?.message || dealErr);
      }

      // F3) Run performance resolution with snipe modifiers
      const results = await runDayResolution(supabase, globalTurnId, instance, day, snipeModifiersMap);

      // F4) Generate backstage offers from performance results
      if (results?.length > 0) {
        try {
          await generateBackstageOffers(supabase, instance.id, day.id, day.day_index, globalTurnId, results);
        } catch (offerErr: any) {
          console.error(`[Amplifi Phase 2] Backstage offer generation error (non-fatal):`, offerErr?.message || offerErr);
        }
      }
    } catch (e: any) {
      console.error(`[Amplifi] Resolution error for day ${day.id}:`, e?.message || e);
    }
  }

  // G) Notifications for newly opened applications
  try {
    await notifyApplicationsOpen(supabase, globalTurnId);
  } catch (e: any) {
    console.error('[Amplifi] Notification error:', e?.message || e);
  }

  // G2) Festival starting soon (1 turn before) — last chance to lock setlist
  try {
    await notifyFestivalStartingSoon(supabase, globalTurnId);
  } catch (e: any) {
    console.error('[Amplifi] Starting-soon notification error:', e?.message || e);
  }

  // G3) For all currently LOCKED instances: ensure setlists are auto-seeded (idempotent, no repeat notifications)
  // Only seeds if missing — notification is suppressed here since it already fired at lineup lock (D block)
  // The "starting soon" notification (G2) handles the second touch 1 day before showday.
  try {
    for (const inst of (lockedInstances || [])) {
      const { data: fData } = await supabase
        .from('festivals').select('name').eq('id', inst.festival_id).maybeSingle();
      inst._festName = fData?.name || 'Festival';
      // Seed only — skip notification by passing a flag via _skipNotification
      inst._skipNotification = true;
      await autoSeedSetlistsForInstance(supabase, inst, globalTurnId);
    }
  } catch (e: any) {
    console.error('[Amplifi] Setlist seed error:', e?.message || e);
  }

  // H) Clean expired brand boosts
  try {
    await supabase
      .from('player_brand_stats')
      .update({ festival_brand_boost: 0, festival_boost_expires_turn: null })
      .lt('festival_boost_expires_turn', globalTurnId)
      .gt('festival_brand_boost', 0);
  } catch (_) {}

  // I) Phase 2: Expire stale backstage offers
  try {
    await expireStaleOffers(supabase, globalTurnId);
  } catch (_) {}

  // I2) Phase 3: Prune long-expired follow-through artifacts
  try {
    await pruneExpiredArtifacts(supabase, globalTurnId);
  } catch (_) {}

  // J) Phase 2: Regenerate influence points for all active players
  try {
    await regenInfluencePoints(supabase);
  } catch (_) {}
}
