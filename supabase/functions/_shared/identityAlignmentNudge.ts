/**
 * IDENTITY ALIGNMENT NUDGE
 * Pure functions — no DB access, no side effects, fully testable.
 *
 * Maps player turn actions to persona signal nudges that accumulate on the era's
 * identity_action_scores. Uses a diminishing-returns model so the first few turns
 * give fast gains that slow down as the score approaches saturation.
 *
 * Action sources mapped:
 *   - Touring          → tour category / aesthetic tag alignment
 *   - Collabs          → matched core_brand_identity of collab partner
 *   - Social posts     → post_type / video_type / concept per platform
 *   - Brand deals      → deal category via PERSONA_AFFINITY_MAP
 *   - Tour sponsorships→ alignment_tags on sponsorship record
 *   - Era focus path   → passive nudge toward focus-aligned persona
 */

import { MARKETING_PERSONAS, PERSONA_AFFINITY_MAP, type MarketingPersonaId } from './marketingPersona.ts';

function N(v: unknown): number { return Number(v) || 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// ─── Action → Persona weight maps ────────────────────────────────────────────

/** Tour category tags → persona affinity weights
 * NOTE: Wizard uses categoryIds like arena_blitz, acoustic_intimate etc.
 * Backend tour_types use local_club, arena_tour etc. Both are mapped here. */
const TOUR_CATEGORY_PERSONA_MAP: Partial<Record<string, Partial<Record<MarketingPersonaId, number>>>> = {
  // Backend tour type keys
  club_run:          { party_club_catalyst: 0.9, viral_trendsetter: 0.5 },
  local_club:        { party_club_catalyst: 0.9, viral_trendsetter: 0.5 },
  festival_run:      { party_club_catalyst: 0.7, viral_trendsetter: 0.6, aesthetic_curator: 0.4 },
  arena_tour:        { luxury_hustler: 0.7, motivational_hustler: 0.5, party_club_catalyst: 0.4 },
  stadium_tour:      { luxury_hustler: 0.9, motivational_hustler: 0.6 },
  intimate_run:      { relatable_storyteller: 0.8, conscious_voice: 0.5, nostalgic_boom_bap: 0.4 },
  underground_run:   { street_authentic: 0.9, conscious_voice: 0.6 },
  headline_festival: { viral_trendsetter: 0.7, luxury_hustler: 0.5, party_club_catalyst: 0.5 },
  standard_run:      { relatable_storyteller: 0.5, motivational_hustler: 0.4 },
  pop_up:            { aesthetic_curator: 0.8, viral_trendsetter: 0.6 },
  residency:         { aesthetic_curator: 0.7, nostalgic_boom_bap: 0.5, producer_visionary: 0.4 },
  // Wizard category IDs (stored in tours.tour_category)
  guerilla_promo:    { street_authentic: 0.8, internet_troll: 0.5, viral_trendsetter: 0.4 },
  acoustic_intimate: { relatable_storyteller: 0.8, conscious_voice: 0.5, nostalgic_boom_bap: 0.4 },
  underground_crawl: { street_authentic: 0.9, conscious_voice: 0.6 },
  arena_blitz:       { luxury_hustler: 0.7, motivational_hustler: 0.5, party_club_catalyst: 0.4 },
  comeback_special:  { nostalgic_boom_bap: 0.7, relatable_storyteller: 0.6, motivational_hustler: 0.4 },
  global_takeover:   { luxury_hustler: 0.8, viral_trendsetter: 0.6, motivational_hustler: 0.5 },
  festival_circuit:  { party_club_catalyst: 0.7, viral_trendsetter: 0.6, aesthetic_curator: 0.4 },
  regional_circuit:  { relatable_storyteller: 0.6, street_authentic: 0.5 },
  national_headliner:{ motivational_hustler: 0.6, luxury_hustler: 0.5, relatable_storyteller: 0.4 },
};

/** Aesthetic tag → persona map for tour/era cross-signal */
const AESTHETIC_TAG_PERSONA_MAP: Partial<Record<string, MarketingPersonaId[]>> = {
  'femme':         ['femme_power'],
  'glamour':       ['femme_power', 'luxury_hustler'],
  'luxury':        ['luxury_hustler'],
  'street':        ['street_authentic'],
  'conscious':     ['conscious_voice'],
  'party':         ['party_club_catalyst'],
  'club':          ['party_club_catalyst'],
  'viral':         ['viral_trendsetter'],
  'aesthetic':     ['aesthetic_curator'],
  'nostalgic':     ['nostalgic_boom_bap'],
  'storyteller':   ['relatable_storyteller'],
  'motivational':  ['motivational_hustler'],
  'producer':      ['producer_visionary'],
  'troll':         ['internet_troll'],
  'bold':          ['femme_power', 'street_authentic'],
  'dark':          ['street_authentic', 'internet_troll'],
  'afro':          ['street_authentic', 'party_club_catalyst'],
  'dancehall':     ['party_club_catalyst', 'street_authentic'],
  'r&b':           ['femme_power', 'relatable_storyteller'],
  'trap':          ['street_authentic', 'luxury_hustler'],
  'pop':           ['viral_trendsetter', 'relatable_storyteller'],
};

/** Social post type → persona map per platform */
const POST_TYPE_PERSONA_MAP: Partial<Record<string, Partial<Record<MarketingPersonaId, number>>>> = {
  // LoopTok concepts
  dance:           { party_club_catalyst: 0.8, viral_trendsetter: 0.7 },
  comedy:          { internet_troll: 0.8, relatable_storyteller: 0.6 },
  lifestyle:       { aesthetic_curator: 0.8, relatable_storyteller: 0.5, femme_power: 0.4 },
  fashion:         { femme_power: 0.8, aesthetic_curator: 0.7, luxury_hustler: 0.4 },
  motivation:      { motivational_hustler: 0.9, conscious_voice: 0.4 },
  activism:        { conscious_voice: 0.9, relatable_storyteller: 0.5 },
  flex:            { luxury_hustler: 0.9, street_authentic: 0.5 },
  story_time:      { relatable_storyteller: 0.9, conscious_voice: 0.4 },
  // VidWave video types
  music_video:     { aesthetic_curator: 0.6, femme_power: 0.4, viral_trendsetter: 0.5 },
  live_performance:{ relatable_storyteller: 0.6, nostalgic_boom_bap: 0.5 },
  vlog:            { relatable_storyteller: 0.8, motivational_hustler: 0.4 },
  documentary:     { conscious_voice: 0.7, nostalgic_boom_bap: 0.6 },
  short:           { viral_trendsetter: 0.8, internet_troll: 0.4 },
  // InstaVibe post types
  photo:           { aesthetic_curator: 0.6, femme_power: 0.4 },
  carousel:        { aesthetic_curator: 0.7, relatable_storyteller: 0.4 },
  story:           { relatable_storyteller: 0.6, viral_trendsetter: 0.4 },
  // Xpress
  text:            { relatable_storyteller: 0.5, conscious_voice: 0.4 },
  quote:           { conscious_voice: 0.6, motivational_hustler: 0.5 },
};

/** Focus path → passive persona nudge (small, applied each turn) */
const FOCUS_PATH_PERSONA_MAP: Partial<Record<string, Partial<Record<MarketingPersonaId, number>>>> = {
  HIT_CHASE:      { viral_trendsetter: 0.3, party_club_catalyst: 0.2 },
  ALBUM_AUTEUR:   { producer_visionary: 0.3, conscious_voice: 0.2, aesthetic_curator: 0.2 },
  DIGITAL_CULT:   { viral_trendsetter: 0.3, internet_troll: 0.2, aesthetic_curator: 0.2 },
  BRAND_MOGUL:    { luxury_hustler: 0.3, motivational_hustler: 0.2 },
  TOUR_MONSTER:   { relatable_storyteller: 0.3, motivational_hustler: 0.2 },
  MAINSTREAM_PUSH:{ viral_trendsetter: 0.2, party_club_catalyst: 0.2, relatable_storyteller: 0.2 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IdentityNudgeInput {
  expressionPrimary: string | null;
  focusPath: string | null;
  tourCategory: string | null;
  tourAestheticTags: string[];
  collabPartnerPersona: string | null;
  socialPostTypes: string[];       // post_type values from this turn's posts
  socialVideoTypes: string[];      // video_type from metadata
  brandDealCategories: string[];   // active brand deal categories
  sponsorAlignmentTags: string[];  // tour sponsorship alignment_tags
  eraAestheticTags: string[];
  // Current accumulated scores (for diminishing returns)
  currentActionScores: Record<string, number>;
  currentActionCounts: Record<string, number>;
  // Career-level (for weighted blend)
  careerPersonaScores: Record<string, number>;
}

export interface IdentityNudgeResult {
  updatedActionScores: Record<string, number>;
  updatedActionCounts: Record<string, number>;
  dominantPersona: MarketingPersonaId | null;
  nudgeReady: boolean;    // dominant persona score >= 70
  contributingActions: string[];   // human-readable list of what contributed
  personaDelta: Record<string, number>;  // how much each persona moved this turn
}

// ─── Diminishing returns curve ────────────────────────────────────────────────
/**
 * Returns the effective gain multiplier given how many times this persona
 * has already been nudged this era. Fast at first, slows down significantly.
 * count=0 → 1.0x, count=5 → 0.6x, count=10 → 0.35x, count=20 → 0.15x
 */
function diminishingMult(count: number): number {
  return clamp(1 / (1 + count * 0.12), 0.05, 1.0);
}

/** Base point gain per action type */
const ACTION_BASE_POINTS: Record<string, number> = {
  tour_gig:      8,
  tour_category: 4,
  collab:        10,
  social_post:   5,
  brand_deal:    7,
  sponsorship:   6,
  aesthetic_tag: 3,
  focus_path:    2,
};

// ─── Main nudge computation ──────────────────────────────────────────────────

export function computeIdentityNudge(input: IdentityNudgeInput): IdentityNudgeResult {
  const rawDeltas: Record<string, number> = {};
  const contributing: string[] = [];

  function addDelta(personaId: string, weight: number, baseKey: string) {
    if (!MARKETING_PERSONAS[personaId as MarketingPersonaId]) return;
    const base = ACTION_BASE_POINTS[baseKey] || 4;
    const current = N(input.currentActionScores[personaId]);
    const count = N(input.currentActionCounts[personaId]);
    const dm = diminishingMult(count);
    const gain = Math.round(base * weight * dm * 10) / 10;
    rawDeltas[personaId] = (rawDeltas[personaId] || 0) + gain;
    // Cap single-turn gain per persona at 15 pts
    if (rawDeltas[personaId] > 15) rawDeltas[personaId] = 15;
    _ = current; // suppress unused
  }
  let _ = 0;

  // 1. Tour category signal
  if (input.tourCategory) {
    const catMap = TOUR_CATEGORY_PERSONA_MAP[input.tourCategory] || {};
    for (const [pid, w] of Object.entries(catMap)) {
      addDelta(pid, w, 'tour_category');
    }
    if (Object.keys(catMap).length > 0) contributing.push(`touring (${input.tourCategory})`);
  }

  // 2. Tour + era aesthetic tag overlap → reinforces matching personas
  const allAestheticTags = [...input.tourAestheticTags, ...input.eraAestheticTags];
  const seenAesthetic = new Set<string>();
  for (const tag of allAestheticTags) {
    const lower = tag.toLowerCase();
    const personas = AESTHETIC_TAG_PERSONA_MAP[lower];
    if (personas && !seenAesthetic.has(lower)) {
      seenAesthetic.add(lower);
      for (const pid of personas) addDelta(pid, 0.5, 'aesthetic_tag');
    }
  }
  if (seenAesthetic.size > 0) contributing.push(`aesthetic tags (${[...seenAesthetic].slice(0, 3).join(', ')})`);

  // 3. Collab partner brand alignment — strongest single action
  if (input.collabPartnerPersona && MARKETING_PERSONAS[input.collabPartnerPersona as MarketingPersonaId]) {
    addDelta(input.collabPartnerPersona, 1.0, 'collab');
    // Expression primary of collab partner also nudges our expression identity persona
    if (input.expressionPrimary && input.collabPartnerPersona === input.expressionPrimary) {
      addDelta(input.expressionPrimary, 0.4, 'collab'); // Bonus for collabing with same-brand artist
    }
    contributing.push(`collab with ${input.collabPartnerPersona} artist`);
  }

  // 4. Social post types
  for (const pt of input.socialPostTypes) {
    const ptMap = POST_TYPE_PERSONA_MAP[pt.toLowerCase()] || {};
    for (const [pid, w] of Object.entries(ptMap)) addDelta(pid, w, 'social_post');
    if (Object.keys(ptMap).length > 0) contributing.push(`${pt} post`);
  }

  // 5. Video types (VidWave)
  for (const vt of input.socialVideoTypes) {
    const vtMap = POST_TYPE_PERSONA_MAP[vt.toLowerCase()] || {};
    for (const [pid, w] of Object.entries(vtMap)) addDelta(pid, w, 'social_post');
    if (Object.keys(vtMap).length > 0) contributing.push(`${vt} video`);
  }

  // 6. Brand deal categories
  for (const cat of input.brandDealCategories) {
    const catAffinities = PERSONA_AFFINITY_MAP[cat.toLowerCase()] || {};
    for (const [pid, w] of Object.entries(catAffinities)) {
      if (w >= 0.5) addDelta(pid, w, 'brand_deal'); // Only high-affinity deals nudge identity
    }
    if (Object.keys(catAffinities).length > 0) contributing.push(`${cat} brand deal`);
  }

  // 7. Tour sponsorship alignment tags
  for (const tag of input.sponsorAlignmentTags) {
    const personas = AESTHETIC_TAG_PERSONA_MAP[tag.toLowerCase()];
    if (personas) {
      for (const pid of personas) addDelta(pid, 0.6, 'sponsorship');
    }
  }
  if (input.sponsorAlignmentTags.length > 0) contributing.push('tour sponsorship');

  // 8. Focus path passive nudge (small, every turn)
  if (input.focusPath) {
    const fpMap = FOCUS_PATH_PERSONA_MAP[input.focusPath] || {};
    for (const [pid, w] of Object.entries(fpMap)) addDelta(pid, w, 'focus_path');
  }

  // ─── Apply deltas with diminishing returns ───────────────────────────────

  const updatedActionScores = { ...input.currentActionScores };
  const updatedActionCounts = { ...input.currentActionCounts };
  const personaDelta: Record<string, number> = {};

  for (const [pid, delta] of Object.entries(rawDeltas)) {
    if (delta <= 0) continue;
    const prev = N(updatedActionScores[pid]);
    const newScore = clamp(prev + delta, 0, 100);
    personaDelta[pid] = Math.round((newScore - prev) * 10) / 10;
    updatedActionScores[pid] = newScore;
    updatedActionCounts[pid] = N(updatedActionCounts[pid]) + 1;
  }

  // ─── Determine dominant persona ──────────────────────────────────────────

  const allPersonaIds = Object.keys(MARKETING_PERSONAS) as MarketingPersonaId[];
  let dominantPersona: MarketingPersonaId | null = null;
  let dominantScore = 0;

  for (const pid of allPersonaIds) {
    const s = N(updatedActionScores[pid]);
    if (s > dominantScore) {
      dominantScore = s;
      dominantPersona = pid;
    }
  }

  const nudgeReady = dominantScore >= 70;

  return {
    updatedActionScores,
    updatedActionCounts,
    dominantPersona,
    nudgeReady,
    contributingActions: [...new Set(contributing)].slice(0, 5),
    personaDelta,
  };
}

// ─── Blend era + career scores for calculateIdentityAlignment ────────────────
/**
 * Merges era-scoped action scores with career-level persona scores to produce
 * the personaBreakdown fed into calculateIdentityAlignment.
 * Era scores have higher weight (recent activity matters more).
 */
export function blendPersonaScoresForAlignment(
  eraActionScores: Record<string, number>,   // 0-100 scale, accumulated this era
  careerPersonaScores: Record<string, number>, // 0-1 scale from marketingPersona computation
  expressionPrimary: string | null,
  expressionSecondary: string | null,
): Record<string, number> {
  const blended: Record<string, number> = {};
  for (const pid of Object.keys(MARKETING_PERSONAS)) {
    const eraScore = N(eraActionScores[pid]);               // 0-100
    const careerScore = N(careerPersonaScores[pid]) * 100;  // convert 0-1 → 0-100
    // 65% era (recent actions), 35% career (baseline reputation)
    blended[pid] = Math.round(eraScore * 0.65 + careerScore * 0.35);
  }
  // Ensure expression identities have a baseline if neither era nor career has them
  if (expressionPrimary && !blended[expressionPrimary]) blended[expressionPrimary] = 40;
  if (expressionSecondary && !blended[expressionSecondary]) blended[expressionSecondary] = 25;
  return blended;
}

// ─── Recommended actions for UI ──────────────────────────────────────────────
/**
 * Given the player's current expression identity and era action scores,
 * returns a list of concrete action suggestions to raise alignment.
 */
export function getAlignmentRecommendations(
  expressionPrimary: string | null,
  eraActionScores: Record<string, number>,
): Array<{ action: string; description: string; impact: 'high' | 'medium' | 'low' }> {
  if (!expressionPrimary || !MARKETING_PERSONAS[expressionPrimary as MarketingPersonaId]) return [];

  const score = N(eraActionScores[expressionPrimary]);
  const recs: Array<{ action: string; description: string; impact: 'high' | 'medium' | 'low' }> = [];

  // Find which tour categories best reinforce this persona
  for (const [cat, weights] of Object.entries(TOUR_CATEGORY_PERSONA_MAP)) {
    if (weights && (weights[expressionPrimary as MarketingPersonaId] || 0) >= 0.7) {
      recs.push({ action: 'Tour', description: `Book a ${cat.replace(/_/g, ' ')} tour`, impact: 'high' });
    }
  }

  // Brand deals
  for (const [cat, affinities] of Object.entries(PERSONA_AFFINITY_MAP)) {
    if ((affinities[expressionPrimary as MarketingPersonaId] || 0) >= 0.8) {
      recs.push({ action: 'Brand Deal', description: `Sign a ${cat} brand deal`, impact: 'high' });
    }
  }

  // Post types
  for (const [pt, weights] of Object.entries(POST_TYPE_PERSONA_MAP)) {
    if (weights && (weights[expressionPrimary as MarketingPersonaId] || 0) >= 0.7) {
      recs.push({ action: 'Social Post', description: `Post ${pt.replace(/_/g, ' ')} content`, impact: 'medium' });
    }
  }

  // Collab
  recs.push({
    action: 'Collab',
    description: `Collab with another ${MARKETING_PERSONAS[expressionPrimary as MarketingPersonaId]?.label} artist`,
    impact: 'high',
  });

  // If score is already >= 70 and nudge ready, add the adopt prompt
  if (score >= 70) {
    recs.unshift({
      action: 'Adopt Identity',
      description: `Your ${MARKETING_PERSONAS[expressionPrimary as MarketingPersonaId]?.label} signal is strong — you can now officially adopt it as your expression identity`,
      impact: 'high',
    });
  }

  return recs.slice(0, 5);
}
