/**
 * touringExpansionConfig.ts
 * 
 * Tour categories, crew NPC generation, choice events pool,
 * sponsor generation, setlist vibe calculation, fan reception,
 * era integration, and cultural weight computation.
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

const DEBUG = (globalThis as any)?.Deno?.env?.get?.('TOURING_DEBUG') === '1';
function debugLog(...args: any[]) { if (DEBUG) console.log('[TOURING_EXP]', ...args); }

// ─── HELPERS ────────────────────────────────────────────────────────────────
function N(v: any): number { return Number(v) || 0; }
function clamp(v: number, min: number, max: number): number { return Math.min(max, Math.max(min, v)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── TOUR CATEGORY TYPES ────────────────────────────────────────────────────
export interface TourCategory {
  id: string;
  name: string;
  description: string;
  aesthetic_tags: string[];
  alignment_tags: string[];
  essence_weights: Record<string, number>;
  min_career_stage: number;
  cost_multiplier: number;
  fatigue_multiplier: number;
  morale_multiplier: number;
  hype_multiplier: number;
  risk_level: string;
  fan_segment_bonuses: Record<string, number>;
  max_crew_slots: number;
  allows_global: boolean;
}

// Fallback config if DB fetch fails — matches seed data
export const TOUR_CATEGORIES_FALLBACK: Record<string, TourCategory> = {
  guerilla_promo: {
    id: 'guerilla_promo', name: 'Guerilla Promo Run',
    description: 'Raw, street-level pop-up shows. Low cost, high fatigue, deep fan connection.',
    aesthetic_tags: ['raw', 'underground'], alignment_tags: ['street', 'underground'],
    essence_weights: { rebellion: 0.8, authenticity: 0.7, glamour: -0.2 },
    min_career_stage: 0, cost_multiplier: 0.60, fatigue_multiplier: 1.30,
    morale_multiplier: 0.90, hype_multiplier: 0.80, risk_level: 'high',
    fan_segment_bonuses: { og: 0.08, core: 0.05, casual: -0.02, trend_chaser: -0.05, stan: 0.03, critic: 0.0 },
    max_crew_slots: 2, allows_global: false,
  },
  standard_run: {
    id: 'standard_run', name: 'Standard Tour',
    description: 'Solid, well-organized tour hitting mid-size venues. Balanced risk and reward.',
    aesthetic_tags: [], alignment_tags: [],
    essence_weights: {},
    min_career_stage: 0, cost_multiplier: 1.00, fatigue_multiplier: 1.00,
    morale_multiplier: 1.00, hype_multiplier: 1.00, risk_level: 'medium',
    fan_segment_bonuses: { og: 0.02, core: 0.03, casual: 0.02, trend_chaser: 0.02, stan: 0.02, critic: 0.0 },
    max_crew_slots: 3, allows_global: false,
  },
  arena_blitz: {
    id: 'arena_blitz', name: 'Arena Blitz',
    description: 'High-energy arena shows with big production. Expensive but massive hype.',
    aesthetic_tags: ['polished', 'electric'], alignment_tags: ['mainstream', 'spectacle'],
    essence_weights: { glamour: 0.7, community: 0.3, rebellion: -0.1 },
    min_career_stage: 3, cost_multiplier: 1.50, fatigue_multiplier: 1.20,
    morale_multiplier: 1.10, hype_multiplier: 1.40, risk_level: 'medium',
    fan_segment_bonuses: { og: -0.03, core: 0.04, casual: 0.06, trend_chaser: 0.10, stan: 0.05, critic: 0.0 },
    max_crew_slots: 4, allows_global: false,
  },
  acoustic_intimate: {
    id: 'acoustic_intimate', name: 'Acoustic Intimate',
    description: 'Stripped-down, emotional performances in small venues. Low fatigue, deep loyalty.',
    aesthetic_tags: ['soulful', 'nostalgic'], alignment_tags: ['authentic', 'personal'],
    essence_weights: { authenticity: 0.9, community: 0.6, glamour: -0.3 },
    min_career_stage: 1, cost_multiplier: 0.80, fatigue_multiplier: 0.70,
    morale_multiplier: 1.20, hype_multiplier: 0.60, risk_level: 'low',
    fan_segment_bonuses: { og: 0.12, core: 0.06, casual: -0.04, trend_chaser: -0.08, stan: 0.08, critic: -0.02 },
    max_crew_slots: 2, allows_global: false,
  },
  festival_circuit: {
    id: 'festival_circuit', name: 'Festival Circuit',
    description: 'Playing major festivals. Great exposure but exhausting schedule.',
    aesthetic_tags: ['neon', 'futuristic'], alignment_tags: ['trending', 'discovery'],
    essence_weights: { glamour: 0.5, rebellion: 0.4, community: 0.3 },
    min_career_stage: 2, cost_multiplier: 1.30, fatigue_multiplier: 1.40,
    morale_multiplier: 0.90, hype_multiplier: 1.60, risk_level: 'high',
    fan_segment_bonuses: { og: -0.02, core: 0.03, casual: 0.10, trend_chaser: 0.15, stan: 0.0, critic: 0.02 },
    max_crew_slots: 3, allows_global: false,
  },
  global_takeover: {
    id: 'global_takeover', name: 'Global Takeover Tour',
    description: 'Multi-region world tour. Maximum scale, maximum stakes.',
    aesthetic_tags: ['maximalist', 'luxury'], alignment_tags: ['global', 'premium'],
    essence_weights: { glamour: 0.8, community: 0.4, rebellion: -0.2, authenticity: -0.1 },
    min_career_stage: 5, cost_multiplier: 2.50, fatigue_multiplier: 1.50,
    morale_multiplier: 1.00, hype_multiplier: 2.00, risk_level: 'extreme',
    fan_segment_bonuses: { og: 0.05, core: 0.05, casual: 0.05, trend_chaser: 0.05, stan: 0.05, critic: 0.0 },
    max_crew_slots: 5, allows_global: true,
  },
  underground_crawl: {
    id: 'underground_crawl', name: 'Underground Crawl',
    description: 'Dark, experimental venue crawl. Cult following builders paradise.',
    aesthetic_tags: ['dark', 'experimental'], alignment_tags: ['underground', 'alternative'],
    essence_weights: { rebellion: 0.9, authenticity: 0.8, glamour: -0.5, community: 0.2 },
    min_career_stage: 0, cost_multiplier: 0.40, fatigue_multiplier: 1.10,
    morale_multiplier: 0.80, hype_multiplier: 0.50, risk_level: 'low',
    fan_segment_bonuses: { og: 0.15, core: 0.04, casual: -0.06, trend_chaser: -0.10, stan: 0.06, critic: -0.05 },
    max_crew_slots: 2, allows_global: false,
  },
  comeback_special: {
    id: 'comeback_special', name: 'Comeback Special',
    description: 'Nostalgic tour capitalizing on past glory. Perfect after a hiatus or era change.',
    aesthetic_tags: ['retro', 'nostalgic'], alignment_tags: ['nostalgic', 'heritage'],
    essence_weights: { authenticity: 0.7, community: 0.6, glamour: 0.3 },
    min_career_stage: 2, cost_multiplier: 1.80, fatigue_multiplier: 0.80,
    morale_multiplier: 1.30, hype_multiplier: 1.80, risk_level: 'medium',
    fan_segment_bonuses: { og: 0.10, core: 0.08, casual: 0.04, trend_chaser: 0.03, stan: 0.06, critic: -0.03 },
    max_crew_slots: 4, allows_global: false,
  },
};

/**
 * Fetch tour categories from DB, falling back to hardcoded config.
 */
export async function getTourCategories(): Promise<Record<string, TourCategory>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tour_categories')
      .select('*');
    if (error || !data || data.length === 0) {
      debugLog('Using fallback tour categories');
      return TOUR_CATEGORIES_FALLBACK;
    }
    const map: Record<string, TourCategory> = {};
    for (const row of data) {
      map[row.id] = row as TourCategory;
    }
    return map;
  } catch {
    return TOUR_CATEGORIES_FALLBACK;
  }
}

/**
 * Check if player can access a given tour category.
 * Soft gate: career_stage >= min_career_stage OR high demand in 2+ regions.
 */
export function canAccessCategory(
  category: TourCategory,
  careerStage: number,
  regionalDemand: Record<string, number>,
): { allowed: boolean; reason?: string } {
  if (careerStage >= category.min_career_stage) return { allowed: true };

  // Alt access: high demand (>60) in 2+ regions
  const highDemandRegions = Object.values(regionalDemand).filter(d => d > 60).length;
  if (highDemandRegions >= 2) return { allowed: true };

  return {
    allowed: false,
    reason: `Requires career stage ${category.min_career_stage} or high demand in 2+ regions`,
  };
}

// ─── CREW NPC GENERATION ────────────────────────────────────────────────────

export const CREW_SPECIALTIES = [
  'sound_engineer', 'stylist', 'tour_manager', 'security', 'stage_designer', 'publicist',
] as const;
export type CrewSpecialty = typeof CREW_SPECIALTIES[number];

const CREW_FIRST_NAMES = [
  'Marcus', 'Leah', 'Devon', 'Kai', 'Priya', 'Tomás', 'Nkechi', 'Yuki',
  'Zara', 'Reuben', 'Ximena', 'Dmitri', 'Aaliyah', 'Soren', 'Fatou', 'Jing',
  'Nico', 'Isla', 'Kwame', 'Lena', 'Ravi', 'Chloe', 'Emeka', 'Hana',
];
const CREW_LAST_NAMES = [
  'Chen', 'Rivera', 'Okafor', 'Kim', 'Patel', 'Moreau', 'Johansson', 'Adeyemi',
  'Santos', 'Nakamura', 'Dubois', 'Okonkwo', 'García', 'Lindqvist', 'Tanaka', 'Nguyen',
  'Müller', 'Costa', 'Singh', 'Petrov', 'Afolabi', 'Lee', 'Fernández', 'Yamamoto',
];

const SPECIALTY_INFO: Record<CrewSpecialty, { label: string; salaryBase: number; qualityDesc: Record<string, string> }> = {
  sound_engineer:  { label: 'Sound Engineer',  salaryBase: 120, qualityDesc: { high: 'Crystal-clear live mixes', mid: 'Reliable sound', low: 'Sometimes muddy' } },
  stylist:         { label: 'Stylist',          salaryBase: 100, qualityDesc: { high: 'Iconic stage looks', mid: 'Solid wardrobe', low: 'Basic outfits' } },
  tour_manager:    { label: 'Tour Manager',     salaryBase: 150, qualityDesc: { high: 'Runs like clockwork', mid: 'Keeps things moving', low: 'Occasional chaos' } },
  security:        { label: 'Security',         salaryBase: 130, qualityDesc: { high: 'Ironclad protection', mid: 'Handles most situations', low: 'A bit shaky' } },
  stage_designer:  { label: 'Stage Designer',   salaryBase: 140, qualityDesc: { high: 'Jaw-dropping sets', mid: 'Good visuals', low: 'Bare bones' } },
  publicist:       { label: 'Publicist',        salaryBase: 110, qualityDesc: { high: 'Media darling maker', mid: 'Decent press', low: 'Struggles with press' } },
};

export interface CrewNPC {
  id: string;
  name: string;
  specialty: CrewSpecialty;
  quality: number;
  morale: number;
  salary_per_turn: number;
  metadata: {
    label: string;
    quality_desc: string;
    personality: string;
  };
}

const PERSONALITIES = [
  'chill', 'intense', 'meticulous', 'creative', 'laid-back', 'ambitious',
  'perfectionist', 'easygoing', 'no-nonsense', 'energetic', 'reserved', 'charismatic',
];

/**
 * Generate a pool of NPC crew members for the player to hire from.
 * Pool size = max_crew_slots * 2 (so player has choices).
 */
export function generateCrewPool(maxSlots: number, careerStage: number): CrewNPC[] {
  const poolSize = Math.max(4, maxSlots * 2);
  const pool: CrewNPC[] = [];
  const usedNames = new Set<string>();

  // Ensure at least one of each critical specialty
  const mustHave: CrewSpecialty[] = ['sound_engineer', 'tour_manager'];

  for (let i = 0; i < poolSize; i++) {
    const specialty = i < mustHave.length
      ? mustHave[i]
      : CREW_SPECIALTIES[Math.floor(Math.random() * CREW_SPECIALTIES.length)];

    // Quality scales with career stage: base 30-50 + stage bonus
    const qualityBase = 30 + Math.floor(Math.random() * 21); // 30-50
    const stageBonus = Math.min(30, careerStage * 6);
    const quality = clamp(qualityBase + stageBonus + Math.floor(Math.random() * 15), 20, 95);

    // Generate unique name
    let name = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const first = pick(CREW_FIRST_NAMES);
      const last = pick(CREW_LAST_NAMES);
      name = `${first} ${last}`;
      if (!usedNames.has(name)) { usedNames.add(name); break; }
    }

    const info = SPECIALTY_INFO[specialty];
    const salaryMult = 0.7 + (quality / 100) * 0.8; // 0.7x - 1.5x
    const salary = Math.round(info.salaryBase * salaryMult);
    const morale = clamp(60 + Math.floor(Math.random() * 20), 50, 90);

    const qualityTier = quality >= 75 ? 'high' : quality >= 45 ? 'mid' : 'low';

    pool.push({
      id: `crew_${specialty}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i}`,
      name,
      specialty,
      quality,
      morale,
      salary_per_turn: salary,
      metadata: {
        label: info.label,
        quality_desc: info.qualityDesc[qualityTier],
        personality: pick(PERSONALITIES),
      },
    });
  }

  return pool;
}

// ─── TOUR CHOICE EVENTS ────────────────────────────────────────────────────

export interface TourChoiceEventDef {
  key: string;
  title: string;
  description: string;
  trigger_conditions: {
    min_fatigue?: number;
    max_morale?: number;
    min_morale?: number;
    min_completed_stops?: number;
    risk_levels?: string[];
  };
  weight: number; // probability weight
  choices: Array<{
    id: string;
    label: string;
    effects: {
      fatigue?: number;
      morale?: number;
      money?: number;
      hype?: number;
      crew_morale?: number;
      clout?: number;
      fan_reception_delta?: Record<string, number>;
    };
    description: string;
  }>;
  auto_default: string; // which choice id is auto-selected
}

export const TOUR_CHOICE_EVENTS: TourChoiceEventDef[] = [
  {
    key: 'vocal_strain',
    title: 'Vocal Strain',
    description: 'Your voice is giving out after back-to-back shows. The next venue is packed.',
    trigger_conditions: { min_fatigue: 40 },
    weight: 15,
    choices: [
      { id: 'push_through', label: 'Push Through', effects: { fatigue: 15, morale: -5, hype: 5, fan_reception_delta: { stan: 3, og: 2 } }, description: 'Risk your voice for the fans. They\'ll love you for it.' },
      { id: 'cancel_show', label: 'Cancel Show', effects: { fatigue: -10, morale: 5, hype: -8, money: -2000, fan_reception_delta: { casual: -5, trend_chaser: -8 } }, description: 'Rest up. Fans will be disappointed but you\'ll recover.' },
      { id: 'shorter_set', label: 'Shorter Set', effects: { fatigue: 5, morale: 0, hype: -2, fan_reception_delta: { casual: -2 } }, description: 'Play a shorter acoustic set. Professional compromise.' },
    ],
    auto_default: 'shorter_set',
  },
  {
    key: 'backstage_drama',
    title: 'Backstage Drama',
    description: 'Two crew members are in a heated argument. The vibe backstage is toxic.',
    trigger_conditions: { max_morale: 60 },
    weight: 12,
    choices: [
      { id: 'mediate', label: 'Mediate', effects: { morale: 8, crew_morale: 10, fatigue: 5 }, description: 'Step in and resolve it. Shows leadership.' },
      { id: 'ignore', label: 'Ignore It', effects: { morale: -3, crew_morale: -8 }, description: 'Not your problem. Focus on the music.' },
      { id: 'fire_one', label: 'Fire the Instigator', effects: { crew_morale: -5, morale: 3 }, description: 'Send a message. Zero tolerance for drama.' },
    ],
    auto_default: 'ignore',
  },
  {
    key: 'viral_moment',
    title: 'Viral Moment',
    description: 'A fan captures an incredible moment from last night\'s show. It\'s blowing up online.',
    trigger_conditions: { min_completed_stops: 2 },
    weight: 10,
    choices: [
      { id: 'lean_in', label: 'Lean Into It', effects: { hype: 12, fan_reception_delta: { trend_chaser: 8, casual: 5 } }, description: 'Post about it, retweet, make it your brand.' },
      { id: 'stay_humble', label: 'Stay Humble', effects: { hype: 4, fan_reception_delta: { og: 5, core: 3 } }, description: 'Acknowledge it subtly. Let authenticity speak.' },
    ],
    auto_default: 'lean_in',
  },
  {
    key: 'sponsor_conflict',
    title: 'Sponsor Demands',
    description: 'Your tour sponsor wants more prominent branding on stage. Your fans might not love it.',
    trigger_conditions: {},
    weight: 8,
    choices: [
      { id: 'comply', label: 'Give Them What They Want', effects: { money: 5000, fan_reception_delta: { og: -4, core: -2, critic: 3 } }, description: 'More money, but fans notice the sellout vibe.' },
      { id: 'negotiate', label: 'Negotiate a Compromise', effects: { money: 2000, fan_reception_delta: { og: -1 } }, description: 'Subtle branding. Everyone\'s mostly happy.' },
      { id: 'refuse', label: 'Refuse', effects: { money: -3000, fan_reception_delta: { og: 5, stan: 3 }, clout: 2 }, description: 'Stand your ground. Lose the bonus but gain respect.' },
    ],
    auto_default: 'negotiate',
  },
  {
    key: 'equipment_failure',
    title: 'Equipment Failure',
    description: 'The main speaker array just blew. Show starts in 2 hours.',
    trigger_conditions: {},
    weight: 10,
    choices: [
      { id: 'rent_emergency', label: 'Emergency Rental', effects: { money: -4000, fatigue: 5 }, description: 'Rush to get backup gear. Expensive but the show goes on.' },
      { id: 'acoustic_set', label: 'Go Acoustic', effects: { fatigue: -5, fan_reception_delta: { og: 8, stan: 5, casual: -4 }, hype: -3 }, description: 'Turn disaster into an intimate moment.' },
      { id: 'delay_show', label: 'Delay 2 Hours', effects: { morale: -5, fan_reception_delta: { casual: -6, trend_chaser: -8 }, fatigue: 3 }, description: 'Fix it properly. Some fans leave.' },
    ],
    auto_default: 'rent_emergency',
  },
  {
    key: 'fan_meetup_request',
    title: 'Fan Meetup Request',
    description: 'Superfans organized a meet & greet outside the venue. 200+ people waiting.',
    trigger_conditions: { min_completed_stops: 1 },
    weight: 12,
    choices: [
      { id: 'full_meetup', label: 'Do the Full Meet & Greet', effects: { fatigue: 15, fan_reception_delta: { stan: 10, core: 5, og: 3 }, morale: 5 }, description: 'Exhausting but unforgettable for the fans.' },
      { id: 'quick_wave', label: 'Quick Wave & Photos', effects: { fatigue: 5, fan_reception_delta: { stan: 3, core: 2 } }, description: 'Brief but appreciated.' },
      { id: 'skip', label: 'Skip (Too Tired)', effects: { fan_reception_delta: { stan: -8, core: -3 }, morale: 3 }, description: 'You need rest. Fans are hurt.' },
    ],
    auto_default: 'quick_wave',
  },
  {
    key: 'local_press_opportunity',
    title: 'Local Press Interview',
    description: 'A major local outlet wants an exclusive interview before tonight\'s show.',
    trigger_conditions: {},
    weight: 8,
    choices: [
      { id: 'accept', label: 'Do the Interview', effects: { fatigue: 5, hype: 6, clout: 2, fan_reception_delta: { casual: 4 } }, description: 'Great press. Builds the tour narrative.' },
      { id: 'decline', label: 'Decline Politely', effects: { fatigue: -3 }, description: 'Save energy for the performance.' },
    ],
    auto_default: 'decline',
  },
  {
    key: 'opening_act_drama',
    title: 'Opening Act Tension',
    description: 'Your opening act is getting more crowd love than expected. Fans are chanting their name.',
    trigger_conditions: { min_completed_stops: 3 },
    weight: 6,
    choices: [
      { id: 'embrace', label: 'Embrace It', effects: { morale: 5, fan_reception_delta: { core: 3, casual: 4 }, clout: 1 }, description: 'Bring them on for an encore collab. Shows grace.' },
      { id: 'compete', label: 'Outperform Them', effects: { fatigue: 10, hype: 8, fan_reception_delta: { trend_chaser: 5, stan: 3 } }, description: 'Turn up the energy. Make it a show.' },
      { id: 'reduce_settime', label: 'Cut Their Set Short', effects: { crew_morale: -5, fan_reception_delta: { critic: 5, casual: -3 } }, description: 'Petty move, but effective.' },
    ],
    auto_default: 'embrace',
  },
  {
    key: 'weather_disaster',
    title: 'Storm Warning',
    description: 'Severe weather predicted for tonight\'s outdoor venue. Lightning risk.',
    trigger_conditions: {},
    weight: 7,
    choices: [
      { id: 'proceed', label: 'Play in the Rain', effects: { fatigue: 12, hype: 10, fan_reception_delta: { og: 8, stan: 6, core: 4 } }, description: 'Legendary move. Fans will never forget it.' },
      { id: 'indoor_backup', label: 'Move to Backup Venue', effects: { money: -3000, fan_reception_delta: { casual: -2 } }, description: 'Safer. Smaller venue, some fans can\'t get in.' },
      { id: 'cancel', label: 'Cancel (Safety First)', effects: { hype: -5, fan_reception_delta: { casual: -4, trend_chaser: -6 }, morale: 3 }, description: 'Responsible but disappointing.' },
    ],
    auto_default: 'indoor_backup',
  },
  {
    key: 'merch_bootleggers',
    title: 'Merch Bootleggers',
    description: 'Bootleg merch sellers outside the venue are undercutting your official merch.',
    trigger_conditions: { min_completed_stops: 2 },
    weight: 8,
    choices: [
      { id: 'confront', label: 'Send Security', effects: { money: 500, crew_morale: -3 }, description: 'Shut them down. Protects your brand.' },
      { id: 'ignore', label: 'Let It Slide', effects: { fan_reception_delta: { casual: 2 }, money: -800 }, description: 'It\'s just hustle culture. Fans get cheap gear.' },
      { id: 'collab', label: 'Offer Official Collab', effects: { money: 300, hype: 3, fan_reception_delta: { og: 3, core: 2 } }, description: 'Turn enemies into partners. Creative move.' },
    ],
    auto_default: 'ignore',
  },
  {
    key: 'crew_injury',
    title: 'Crew Member Injured',
    description: 'Your sound engineer tripped on stage during setup. They can work but are in pain.',
    trigger_conditions: {},
    weight: 7,
    choices: [
      { id: 'rest_crew', label: 'Give Them the Night Off', effects: { crew_morale: 8, fan_reception_delta: { core: -1 } }, description: 'Show you care. Sound quality dips slightly.' },
      { id: 'push_crew', label: 'Ask Them to Work', effects: { crew_morale: -10, morale: -3 }, description: 'The show must go on. But at what cost?' },
    ],
    auto_default: 'rest_crew',
  },
  {
    key: 'surprise_guest',
    title: 'Surprise Guest Opportunity',
    description: 'A famous artist in town offers to come on stage for a surprise collab.',
    trigger_conditions: { min_completed_stops: 1 },
    weight: 5,
    choices: [
      { id: 'accept_guest', label: 'Bring Them On', effects: { hype: 15, fan_reception_delta: { trend_chaser: 10, casual: 8, core: 3 }, clout: 3 }, description: 'Massive moment. Social media goes crazy.' },
      { id: 'decline_guest', label: 'Keep It Solo', effects: { fan_reception_delta: { og: 3, stan: 2 }, morale: 2 }, description: 'This is YOUR tour. Keep it pure.' },
    ],
    auto_default: 'accept_guest',
  },
  {
    key: 'venue_upgrade',
    title: 'Venue Upgrade Offer',
    description: 'The next venue sold out early. A larger venue nearby has availability.',
    trigger_conditions: { min_completed_stops: 2 },
    weight: 6,
    choices: [
      { id: 'upgrade', label: 'Take the Upgrade', effects: { money: -2000, hype: 5, fan_reception_delta: { casual: 4, trend_chaser: 5 } }, description: 'Bigger stage, more production, more fans.' },
      { id: 'keep_intimate', label: 'Keep the Sold-Out Show', effects: { fan_reception_delta: { og: 5, stan: 4 }, morale: 3 }, description: 'Sold out means sold out. Exclusivity wins.' },
    ],
    auto_default: 'upgrade',
  },
  {
    key: 'food_poisoning',
    title: 'Food Poisoning Scare',
    description: 'Half the crew got sick from the catering. You feel queasy too.',
    trigger_conditions: {},
    weight: 7,
    choices: [
      { id: 'perform_sick', label: 'Perform Anyway', effects: { fatigue: 20, morale: -8, fan_reception_delta: { stan: 5, og: 3 }, hype: 3 }, description: 'Heroic but miserable.' },
      { id: 'delay_show', label: 'Delay 3 Hours', effects: { fan_reception_delta: { casual: -5, trend_chaser: -6 }, crew_morale: 5 }, description: 'Give everyone time to recover.' },
    ],
    auto_default: 'delay_show',
  },
  {
    key: 'political_controversy',
    title: 'Political Statement at Show',
    description: 'The local crowd is chanting a political slogan. Your response will be noticed.',
    trigger_conditions: {},
    weight: 5,
    choices: [
      { id: 'join_in', label: 'Join the Chant', effects: { hype: 8, clout: 3, fan_reception_delta: { og: 6, critic: -8, core: 2 } }, description: 'Bold. Authentic. Polarizing.' },
      { id: 'stay_neutral', label: 'Stay Neutral', effects: { fan_reception_delta: { og: -2, critic: -2 } }, description: 'Play it safe. No one\'s fully happy.' },
      { id: 'redirect', label: 'Redirect to Music', effects: { morale: 3, fan_reception_delta: { stan: 2 } }, description: '"Let the music speak." Professional pivot.' },
    ],
    auto_default: 'redirect',
  },
];

/**
 * Select a random choice event based on current tour state and weights.
 */
export function selectChoiceEvent(
  tourState: { fatigue: number; morale: number; completed_stops: number },
  riskLevel: string,
  previousEventKeys: string[],
): TourChoiceEventDef | null {
  // Filter eligible events
  const eligible = TOUR_CHOICE_EVENTS.filter(e => {
    if (previousEventKeys.includes(e.key)) return false; // no repeats
    const tc = e.trigger_conditions;
    if (tc.min_fatigue && tourState.fatigue < tc.min_fatigue) return false;
    if (tc.max_morale && tourState.morale > tc.max_morale) return false;
    if (tc.min_morale && tourState.morale < tc.min_morale) return false;
    if (tc.min_completed_stops && tourState.completed_stops < tc.min_completed_stops) return false;
    if (tc.risk_levels && !tc.risk_levels.includes(riskLevel)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const event of eligible) {
    roll -= event.weight;
    if (roll <= 0) return event;
  }
  return eligible[eligible.length - 1];
}

// ─── TOUR SPONSOR GENERATION ────────────────────────────────────────────────

export interface TourSponsorOption {
  brand_name: string;
  payout: number;
  alignment_tags: string[];
  essence_weights: Record<string, number>;
  clash_risk: number;
  category: string;
}

const SPONSOR_BRANDS: TourSponsorOption[] = [
  { brand_name: 'NovaBeat Headphones', payout: 5000, alignment_tags: ['tech', 'mainstream'], essence_weights: { glamour: 0.3, rebellion: -0.1 }, clash_risk: 0.05, category: 'tech' },
  { brand_name: 'Vex Energy Drink', payout: 8000, alignment_tags: ['extreme', 'youth'], essence_weights: { rebellion: 0.4, authenticity: -0.3 }, clash_risk: 0.15, category: 'beverage' },
  { brand_name: 'Lumière Fashion', payout: 12000, alignment_tags: ['luxury', 'premium'], essence_weights: { glamour: 0.9, authenticity: -0.5, rebellion: -0.3 }, clash_risk: 0.20, category: 'fashion' },
  { brand_name: 'StreetCred Apparel', payout: 4000, alignment_tags: ['street', 'underground'], essence_weights: { rebellion: 0.6, authenticity: 0.5, glamour: -0.2 }, clash_risk: 0.05, category: 'fashion' },
  { brand_name: 'CloudSync Music App', payout: 6000, alignment_tags: ['tech', 'discovery'], essence_weights: { community: 0.3 }, clash_risk: 0.08, category: 'tech' },
  { brand_name: 'Heritage Spirits', payout: 10000, alignment_tags: ['luxury', 'heritage'], essence_weights: { glamour: 0.5, authenticity: 0.3 }, clash_risk: 0.12, category: 'alcohol' },
  { brand_name: 'GreenLeaf Wellness', payout: 3000, alignment_tags: ['natural', 'authentic'], essence_weights: { authenticity: 0.7, community: 0.4, glamour: -0.2 }, clash_risk: 0.03, category: 'wellness' },
  { brand_name: 'Apex Sportswear', payout: 7000, alignment_tags: ['sport', 'mainstream'], essence_weights: { community: 0.4, glamour: 0.2 }, clash_risk: 0.08, category: 'sports' },
  { brand_name: 'Midnight Records', payout: 4500, alignment_tags: ['underground', 'alternative'], essence_weights: { rebellion: 0.5, authenticity: 0.6 }, clash_risk: 0.04, category: 'music' },
  { brand_name: 'PixelVerse Gaming', payout: 9000, alignment_tags: ['gaming', 'youth', 'tech'], essence_weights: { community: 0.5, rebellion: 0.2 }, clash_risk: 0.10, category: 'gaming' },
  { brand_name: 'Bella Cosmetics', payout: 6500, alignment_tags: ['beauty', 'mainstream'], essence_weights: { glamour: 0.8, community: 0.2, rebellion: -0.3 }, clash_risk: 0.10, category: 'beauty' },
  { brand_name: 'Riot Clothing', payout: 5500, alignment_tags: ['punk', 'underground', 'alternative'], essence_weights: { rebellion: 0.9, authenticity: 0.4, glamour: -0.4 }, clash_risk: 0.08, category: 'fashion' },
  { brand_name: 'SoulFood Catering', payout: 2000, alignment_tags: ['authentic', 'community'], essence_weights: { community: 0.7, authenticity: 0.5 }, clash_risk: 0.02, category: 'food' },
  { brand_name: 'TitanTech Phones', payout: 15000, alignment_tags: ['tech', 'premium', 'mainstream'], essence_weights: { glamour: 0.6, authenticity: -0.4 }, clash_risk: 0.25, category: 'tech' },
  { brand_name: 'ArtHouse Films', payout: 3500, alignment_tags: ['creative', 'alternative', 'authentic'], essence_weights: { authenticity: 0.8, rebellion: 0.3, community: 0.2 }, clash_risk: 0.03, category: 'entertainment' },
];

/**
 * Generate available sponsors for a tour based on career stage and category.
 */
export function generateSponsorOptions(
  careerStage: number,
  tourCategory: TourCategory,
  fandomEssence?: Record<string, number>,
): TourSponsorOption[] {
  // Higher career stage = access to bigger sponsors
  const maxPayout = 3000 + careerStage * 3000;
  const eligible = SPONSOR_BRANDS.filter(s => s.payout <= maxPayout);

  // Shuffle and take 3-5 options
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 3 + Math.floor(careerStage / 2));

  // Adjust clash risk based on essence alignment
  return shuffled.slice(0, count).map(sponsor => {
    let adjustedRisk = sponsor.clash_risk;
    if (fandomEssence) {
      let clashScore = 0;
      for (const [key, weight] of Object.entries(sponsor.essence_weights)) {
        const fandomVal = N(fandomEssence[key]);
        if (weight < 0 && fandomVal > 60) clashScore += Math.abs(weight) * 0.1;
        if (weight > 0 && fandomVal < 30) clashScore += weight * 0.05;
      }
      adjustedRisk = clamp(adjustedRisk + clashScore, 0.01, 0.50);
    }
    return { ...sponsor, clash_risk: adjustedRisk };
  });
}

/**
 * Check if a sponsor clashes with fandom this turn.
 * Returns clash details or null.
 */
export function checkSponsorClash(
  sponsor: { alignment_tags: string[]; essence_weights: Record<string, number>; clash_risk: number },
  fandomEssence: Record<string, number>,
  identityPillars: string[],
): { clashed: boolean; severity: number; reason: string } | null {
  const roll = Math.random();
  if (roll > sponsor.clash_risk) return null;

  // Determine severity based on alignment mismatch
  let mismatchScore = 0;
  for (const [key, weight] of Object.entries(sponsor.essence_weights)) {
    const fandomVal = N(fandomEssence[key]);
    if (weight < 0 && fandomVal > 50) mismatchScore += Math.abs(weight);
    if (weight > 0 && fandomVal < 30) mismatchScore += weight * 0.5;
  }

  // Check alignment tag mismatch with identity pillars
  const tagOverlap = sponsor.alignment_tags.filter(t => identityPillars.includes(t)).length;
  if (tagOverlap === 0 && sponsor.alignment_tags.length > 0) mismatchScore += 0.3;

  const severity = clamp(Math.round(mismatchScore * 50), 10, 100);
  const reason = mismatchScore > 0.5 ? 'Fans feel the brand contradicts your identity'
    : 'Minor backlash from brand association';

  return { clashed: true, severity, reason };
}

// ─── SETLIST VIBE CALCULATION ───────────────────────────────────────────────

export interface SetlistVibe {
  recent_ratio: number;    // % of songs from last 3 eras / recent releases
  deep_cut_ratio: number;  // % of songs with below-median streams
  hit_ratio: number;       // % of songs with above 2x median streams
  opener_quality: number;  // quality of first song
  closer_quality: number;  // quality of last song
  has_iconic: boolean;     // setlist includes iconic release songs
  power: number;           // aggregate setlist power
}

/**
 * Calculate setlist vibe from ordered song data.
 */
export function calculateSetlistVibe(
  orderedSongs: Array<{ id: string; quality: number; streams: number; release_turn?: number; is_iconic?: boolean }>,
  currentTurn: number,
): SetlistVibe {
  if (orderedSongs.length === 0) {
    return { recent_ratio: 0, deep_cut_ratio: 0, hit_ratio: 0, opener_quality: 0, closer_quality: 0, has_iconic: false, power: 0 };
  }

  const streams = orderedSongs.map(s => N(s.streams));
  const median = streams.sort((a, b) => a - b)[Math.floor(streams.length / 2)] || 0;

  const recentThreshold = currentTurn - 72; // ~3 eras worth of turns
  const recentCount = orderedSongs.filter(s => N(s.release_turn) > recentThreshold).length;
  const deepCutCount = orderedSongs.filter(s => N(s.streams) < median).length;
  const hitCount = orderedSongs.filter(s => N(s.streams) > median * 2).length;
  const hasIconic = orderedSongs.some(s => s.is_iconic);

  const totalQuality = orderedSongs.reduce((sum, s) => sum + N(s.quality), 0);
  const avgQuality = totalQuality / orderedSongs.length;
  const power = Math.round(avgQuality * 0.6 + orderedSongs.length * 3 + (hasIconic ? 15 : 0));

  return {
    recent_ratio: recentCount / orderedSongs.length,
    deep_cut_ratio: deepCutCount / orderedSongs.length,
    hit_ratio: hitCount / orderedSongs.length,
    opener_quality: N(orderedSongs[0]?.quality),
    closer_quality: N(orderedSongs[orderedSongs.length - 1]?.quality),
    has_iconic: hasIconic,
    power,
  };
}

/**
 * Calculate segment drift modifiers from setlist vibe.
 */
export function setlistVibeSegmentDrift(vibe: SetlistVibe): Record<string, number> {
  const drift: Record<string, number> = {
    og: 0, core: 0, casual: 0, trend_chaser: 0, stan: 0, critic: 0,
  };

  // OGs love deep cuts
  if (vibe.deep_cut_ratio > 0.3) drift.og += 2;
  if (vibe.deep_cut_ratio > 0.5) drift.og += 1;

  // Trend chasers want recent hits
  if (vibe.recent_ratio > 0.5) drift.trend_chaser += 3;
  if (vibe.hit_ratio > 0.4) drift.trend_chaser += 2;

  // Stans love iconic songs
  if (vibe.has_iconic) drift.stan += 2;

  // Opener/closer quality bonuses
  if (vibe.opener_quality >= 80) drift.casual += 2; // good first impression
  if (vibe.closer_quality >= 80) drift.core += 2;   // satisfying ending

  return drift;
}

// ─── FAN RECEPTION CALCULATION ──────────────────────────────────────────────

const SEGMENT_TYPES = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'] as const;

/**
 * Compute per-segment fan reception for a gig.
 */
export function computeGigFanReception(
  currentReception: Record<string, number>,
  categoryBonuses: Record<string, number>,
  setlistDrift: Record<string, number>,
  eventEffects: Record<string, number>,
  attendanceRatio: number, // tickets_sold / capacity
): Record<string, number> {
  const reception: Record<string, number> = {};

  for (const seg of SEGMENT_TYPES) {
    const current = N(currentReception[seg]) || 50; // default 50
    let delta = 0;

    // Category bonuses (scaled by 10 for readability)
    delta += N(categoryBonuses[seg]) * 10;

    // Setlist drift
    delta += N(setlistDrift[seg]);

    // Event effects
    delta += N(eventEffects[seg]);

    // Attendance ratio: full venues = good vibes
    if (attendanceRatio > 0.9) delta += 3;
    else if (attendanceRatio < 0.5) delta -= 5;

    reception[seg] = clamp(Math.round(current + delta), 0, 100);
  }

  return reception;
}

// ─── ERA-TOUR INTEGRATION ───────────────────────────────────────────────────

const ERA_PHASE_TOUR_MODIFIERS: Record<string, { momentum: number; tension: number }> = {
  TEASE:   { momentum: 3, tension: -2 },
  DROP:    { momentum: 5, tension: -3 },
  SUSTAIN: { momentum: 2, tension: 0 },
  FADE:    { momentum: -2, tension: 3 },
};

/**
 * Compute era-tour synergy: phase-based modifier + aesthetic tag alignment.
 */
export function computeEraTourSynergy(
  eraPhase: string,
  eraAestheticTags: string[],
  tourAestheticTags: string[],
): { momentum_delta: number; tension_delta: number; alignment_score: number } {
  // Phase-based modifier
  const phaseMod = ERA_PHASE_TOUR_MODIFIERS[eraPhase] || { momentum: 0, tension: 0 };

  // Aesthetic tag alignment
  const eraSet = new Set(eraAestheticTags.map(t => t.toLowerCase()));
  const tourSet = new Set(tourAestheticTags.map(t => t.toLowerCase()));
  let overlap = 0;
  for (const tag of tourSet) {
    if (eraSet.has(tag)) overlap++;
  }
  const maxTags = Math.max(1, Math.max(eraSet.size, tourSet.size));
  const alignmentScore = overlap / maxTags; // 0-1

  // Alignment bonus: matching aesthetics amplify phase effects
  const alignmentMult = 1 + alignmentScore * 0.5; // 1.0 - 1.5x
  const misalignmentPenalty = alignmentScore < 0.2 && tourSet.size > 0 ? 2 : 0;

  return {
    momentum_delta: Math.round(phaseMod.momentum * alignmentMult),
    tension_delta: Math.round(phaseMod.tension * alignmentMult) + misalignmentPenalty,
    alignment_score: Math.round(alignmentScore * 100),
  };
}

// ─── CULTURAL WEIGHT / REGIONAL DEMAND ──────────────────────────────────────

/**
 * Compute demand score per region for an artist.
 * Used for cultural weight indicators and global tour soft gate.
 */
export function computeRegionalDemand(
  regionShare: Record<string, number>,  // from fan_profiles
  regionalClout: Record<string, number>, // from fandoms or derived
  hype: number,
  eraMomentum: number,
): Record<string, number> {
  const demand: Record<string, number> = {};
  const allRegions = ['United States', 'Canada', 'UK', 'Europe', 'Asia', 'Latin America', 'Africa', 'Oceania'];
  const canonicalRegionKey = (region: string) => (region === 'United States' ? 'US' : region);

  for (const region of allRegions) {
    const legacyKey = canonicalRegionKey(region);
    const share = N(regionShare[region] ?? regionShare[legacyKey]);
    const clout = N(regionalClout[region] ?? regionalClout[legacyKey]);
    const score = (share * 0.4) + (clout * 0.3) + (hype * 0.2) + (eraMomentum * 0.1);
    demand[region] = clamp(Math.round(score), 0, 100);
  }

  return demand;
}

// ─── TOUR REVIEW SCORE ──────────────────────────────────────────────────────

/**
 * Compute tour review score from composite metrics.
 */
export function computeTourReviewScore(params: {
  avgAttendanceRatio: number;
  crewMorale: number;
  artistFatigue: number;
  fanReceptionAvg: number;
  setlistPower: number;
}): { score: number; grade: string } {
  const score = clamp(Math.round(
    (params.avgAttendanceRatio * 30) +
    (params.crewMorale * 0.15) +
    ((100 - params.artistFatigue) * 0.15) +
    (params.fanReceptionAvg * 0.25) +
    (params.setlistPower * 0.15)
  ), 0, 100);

  const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B'
    : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';

  return { score, grade };
}

/**
 * Compute tour end consequences based on review score.
 */
export function tourEndConsequences(reviewScore: number): {
  clout_delta: number;
  hype_delta: number;
  brand_trust_delta: number;
  controversy_risk: number;
} {
  if (reviewScore >= 80) {
    return { clout_delta: 5 + Math.floor((reviewScore - 80) / 5), hype_delta: 8, brand_trust_delta: 5, controversy_risk: 0 };
  } else if (reviewScore >= 50) {
    return { clout_delta: 0, hype_delta: 0, brand_trust_delta: 0, controversy_risk: 0 };
  } else if (reviewScore >= 30) {
    return { clout_delta: -3, hype_delta: -5, brand_trust_delta: -3, controversy_risk: 0.15 };
  } else {
    return { clout_delta: -8, hype_delta: -10, brand_trust_delta: -8, controversy_risk: 0.35 };
  }
}

debugLog('touringExpansionConfig loaded');
