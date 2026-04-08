/**
 * Career Stage Constants - Single Source of Truth
 * 
 * All career stage thresholds, names, and progression rules.
 * Import this file instead of hardcoding values.
 */

export const STAGE_ORDER = [
  'Unknown',
  'Local Artist',
  'Local Buzz',
  'Underground Artist',
  'Cult Favorite',
  'Breakout Artist',
  'Mainstream Artist',
  'A-List Star',
  'Global Superstar',
  'Legacy Icon'
] as const;

export type CareerStage = typeof STAGE_ORDER[number];

export const INDIE_CEILING: CareerStage = 'Cult Favorite';

/**
 * Follower-based thresholds for career stage detection
 * Used by detectCareerStage() in careerProgressionLogic.ts
 */
export const STAGE_THRESHOLDS: Record<CareerStage, {
  min_followers: number;
  max_followers: number;
  demotion_floor: number;
}> = {
  'Unknown':            { min_followers: 0,         max_followers: 999,       demotion_floor: 0 },
  'Local Artist':       { min_followers: 1000,      max_followers: 9999,      demotion_floor: 500 },
  'Local Buzz':         { min_followers: 10000,     max_followers: 49999,     demotion_floor: 5000 },
  'Underground Artist': { min_followers: 50000,     max_followers: 199999,    demotion_floor: 25000 },
  'Cult Favorite':      { min_followers: 200000,    max_followers: 499999,    demotion_floor: 100000 },
  'Breakout Artist':    { min_followers: 500000,    max_followers: 999999,    demotion_floor: 250000 },
  'Mainstream Artist':  { min_followers: 1000000,   max_followers: 2999999,   demotion_floor: 500000 },
  'A-List Star':        { min_followers: 3000000,   max_followers: 9999999,   demotion_floor: 1500000 },
  'Global Superstar':   { min_followers: 10000000,  max_followers: 49999999,  demotion_floor: 5000000 },
  'Legacy Icon':        { min_followers: 50000000,  max_followers: Infinity,  demotion_floor: 20000000 }
};

/**
 * Monthly Listeners-based thresholds for career stage detection
 * Used by detectCareerStageByML() in careerProgressionLogic.ts
 * Canonical source for career stage display in UI
 */
export const ML_STAGE_THRESHOLDS: Array<{ minML: number; name: CareerStage }> = [
  { minML: 120_000_000, name: 'Legacy Icon' },
  { minML: 90_000_000,  name: 'Global Superstar' },
  { minML: 60_000_000,  name: 'A-List Star' },
  { minML: 35_000_000,  name: 'Mainstream Artist' },
  { minML: 15_000_000,  name: 'Breakout Artist' },
  { minML: 5_000_000,   name: 'Cult Favorite' },
  { minML: 150_000,     name: 'Underground Artist' },
  { minML: 50_000,      name: 'Local Buzz' },
  { minML: 500,         name: 'Local Artist' },
  { minML: 0,           name: 'Unknown' },
];

/**
 * Career stage RPM multipliers for social media monetization
 * Used in socialMediaRevenueMath.ts
 */
export const CAREER_STAGE_RPM_MULTIPLIERS: Record<string, number> = {
  'Unknown':            0.5,
  'Local Artist':       0.7,
  'Local Buzz':         1.0,
  'Underground Artist': 1.2,
  'Cult Favorite':      1.5,
  'Breakout Artist':    1.8,
  'Mainstream Artist':  2.2,
  'A-List Star':        2.8,
  'Global Superstar':   3.5,
  'Legacy Icon':        4.0
};

/**
 * Career stage fandom drift multipliers — how fast casual fans convert to core.
 * Higher stages have stronger gravitational pull on fan loyalty.
 * Used in fandomSegmentsEngine.ts computeSegmentDrift()
 */
export const CAREER_STAGE_FANDOM_DRIFT_MULT: Record<string, number> = {
  'Unknown':            0.90,
  'Local Artist':       0.95,
  'Local Buzz':         1.00,
  'Underground Artist': 1.00,
  'Cult Favorite':      1.05,
  'Breakout Artist':    1.08,
  'Mainstream Artist':  1.12,
  'A-List Star':        1.15,
  'Global Superstar':   1.20,
  'Legacy Icon':        1.25,
};

/**
 * Minimum tour types by career stage
 * Used in touringManager.ts
 */
export const TOUR_TYPE_MIN_STAGES: Record<string, CareerStage> = {
  'local_club':         'Unknown',
  'regional_circuit':   'Local Artist',
  'national_headliner': 'Local Buzz',
  'arena_tour':         'Breakout Artist',
  'stadium_tour':       'Mainstream Artist'
};

/**
 * Helper function to get stage index
 */
export function getStageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as CareerStage);
}

/**
 * Helper function to check if a stage is valid
 */
export function isValidStage(stage: string): stage is CareerStage {
  return STAGE_ORDER.includes(stage as CareerStage);
}

/**
 * Helper function to get next stage
 */
export function getNextStage(currentStage: CareerStage): CareerStage | null {
  const index = getStageIndex(currentStage);
  if (index === -1 || index === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[index + 1];
}

/**
 * Helper function to get previous stage
 */
export function getPreviousStage(currentStage: CareerStage): CareerStage | null {
  const index = getStageIndex(currentStage);
  if (index <= 0) return null;
  return STAGE_ORDER[index - 1];
}
