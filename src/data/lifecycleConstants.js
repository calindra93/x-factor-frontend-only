/**
 * LIFECYCLE CONSTANTS — Shared frontend constants for the unified song lifecycle
 * and dynamic performance_class system.
 *
 * The performance_class label set includes both original labels
 * (Legacy, CultClassic, SleeperHit, DeepCut, Flop) and expanded classifications
 * (Legendary, Classic, SmashHit, Hit, Solid, StrongStart, OneHitWonder).
 */

// Active lifecycle phases (release is still progressing through the pipeline)
// PUBLIC_INTERFACE
export const ACTIVE_LIFECYCLE_STATES = [
  'Scheduled',
  'Hot',
  'Trending',
  'Momentum',
  'Stable',
  'Declining',
];

// Terminal lifecycle states — release has exited the pipeline and settled on an outcome.
// These double as the performance_class label set.
// Includes both original labels and expanded classifications.
// PUBLIC_INTERFACE
export const TERMINAL_LIFECYCLE_STATES = [
  'Legendary',
  'SmashHit',
  'Classic',
  'Hit',
  'Legacy',
  'SleeperHit',
  'CultClassic',
  'StrongStart',
  'Solid',
  'OneHitWonder',
  'DeepCut',
  'Archived',
  'Flop',
];

// Complete lifecycle state list (active + terminal)
// PUBLIC_INTERFACE
export const ALL_LIFECYCLE_STATES = [
  ...ACTIVE_LIFECYCLE_STATES,
  ...TERMINAL_LIFECYCLE_STATES,
];

/**
 * Returns true if the given lifecycle_state is a terminal (post-pipeline) state.
 * PUBLIC_INTERFACE
 * @param {string} state - lifecycle_state value
 * @returns {boolean}
 */
export function isTerminalState(state) {
  if (!state) return false;
  return TERMINAL_LIFECYCLE_STATES.includes(state);
}

/**
 * Returns true if the given lifecycle_state is an active (in-pipeline) state.
 * PUBLIC_INTERFACE
 * @param {string} state - lifecycle_state value
 * @returns {boolean}
 */
export function isActiveState(state) {
  if (!state) return false;
  return ACTIVE_LIFECYCLE_STATES.includes(state);
}

/**
 * Display metadata for each outcome classification / performance_class.
 * Used by ReleasedLibrary, TabbedInsights, StatusRibbon, and other UI components.
 * Includes both original labels and expanded classifications.
 * PUBLIC_INTERFACE
 */
export const OUTCOME_DISPLAY_META = {
  Legendary: {
    label: 'Legendary',
    emoji: '\u{1F451}',
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    gradient: 'from-amber-500 to-yellow-400',
    description: 'An all-time great. This release defined your career.',
  },
  SmashHit: {
    label: 'Smash Hit',
    emoji: '\u{1F4A5}',
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    gradient: 'from-red-500 to-orange-400',
    description: 'Massive commercial success. Dominated the charts.',
  },
  Classic: {
    label: 'Classic',
    emoji: '\u{1F48E}',
    color: 'text-purple-400',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30',
    gradient: 'from-purple-500 to-violet-400',
    description: 'A timeless release that fans keep coming back to.',
  },
  Hit: {
    label: 'Hit',
    emoji: '\u{1F525}',
    color: 'text-orange-400',
    bg: 'bg-orange-500/15',
    border: 'border-orange-500/30',
    gradient: 'from-orange-500 to-amber-400',
    description: 'A solid chart performer with strong streaming numbers.',
  },
  Legacy: {
    label: 'Legacy',
    emoji: '\u{1F3C6}',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    gradient: 'from-yellow-500 to-amber-400',
    description: 'Cemented itself as a timeless hit. Strong catalogue streams forever.',
  },
  SleeperHit: {
    label: 'Sleeper Hit',
    emoji: '\u{1F319}',
    color: 'text-blue-400',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    gradient: 'from-blue-500 to-indigo-400',
    description: 'Started slow, became something special. Grew beyond expectations.',
  },
  CultClassic: {
    label: 'Cult Classic',
    emoji: '\u{1F3AD}',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/30',
    gradient: 'from-indigo-500 to-blue-400',
    description: 'Beloved by a devoted fanbase. Underground royalty.',
  },
  StrongStart: {
    label: 'Strong Start',
    emoji: '\u{1F680}',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    gradient: 'from-cyan-500 to-teal-400',
    description: 'Debuted strong. The momentum was real.',
  },
  Solid: {
    label: 'Solid',
    emoji: '\u2705',
    color: 'text-green-400',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
    gradient: 'from-green-500 to-emerald-400',
    description: 'Performed well. A reliable catalog entry.',
  },
  OneHitWonder: {
    label: 'One Hit Wonder',
    emoji: '\u2B50',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    gradient: 'from-yellow-500 to-amber-300',
    description: 'Had one big moment. Could not replicate it.',
  },
  DeepCut: {
    label: 'Deep Cut',
    emoji: '\u{1F3B5}',
    color: 'text-teal-400',
    bg: 'bg-teal-500/15',
    border: 'border-teal-500/30',
    gradient: 'from-teal-500 to-emerald-400',
    description: 'Low mainstream streams, but core fans treasure this one.',
  },
  Archived: {
    label: 'Archived',
    emoji: '\u{1F4E6}',
    color: 'text-gray-400',
    bg: 'bg-gray-500/15',
    border: 'border-gray-500/30',
    gradient: 'from-gray-500 to-gray-600',
    description: 'Standard catalog release. No standout performance.',
  },
  Flop: {
    label: 'Flop',
    emoji: '\u{1F4C9}',
    color: 'text-red-500',
    bg: 'bg-red-600/15',
    border: 'border-red-600/30',
    gradient: 'from-red-600 to-red-500',
    description: 'Underperformed expectations. A tough miss.',
  },
};

/**
 * Display metadata for revival trigger reasons.
 * Used by ReleasedLibrary TrajectoryStrip when release.revival_count > 0.
 * PUBLIC_INTERFACE
 */
export const REVIVAL_DISPLAY_META = {
  trend_peak: { label: 'Riding a trend wave', emoji: '\u{1F30A}' },
  trend_rising: { label: 'Catching a trend', emoji: '\u{1F4C8}' },
  mood_nostalgia: { label: 'Nostalgia wave', emoji: '\u2728' },
  mood_underground: { label: 'Underground resurgence', emoji: '\u{1F50A}' },
  mood_tour_season: { label: 'Tour season bump', emoji: '\u{1F3A4}' },
  stream_spike: { label: 'Second wind', emoji: '\u{1F504}' },
};

/**
 * Performance trend indicators shown on active releases.
 * Maps performance_class projection to a trend arrow/label for the UI.
 * PUBLIC_INTERFACE
 */
export const PERFORMANCE_TREND_INDICATORS = {
  Legendary:    { arrow: '\u2B06\u2B06', label: 'Legendary trajectory', color: 'text-amber-400' },
  SmashHit:     { arrow: '\u2B06\u2B06', label: 'Smash Hit trajectory', color: 'text-red-400' },
  Classic:      { arrow: '\u2B06\u2B06', label: 'Classic trajectory',   color: 'text-purple-400' },
  Hit:          { arrow: '\u2B06',  label: 'Tracking as Hit',      color: 'text-orange-400' },
  Legacy:       { arrow: '\u2B06\u2B06', label: 'Legacy trajectory',    color: 'text-yellow-400' },
  SleeperHit:   { arrow: '\u2B06',  label: 'Sleeper Hit energy',   color: 'text-blue-400' },
  CultClassic:  { arrow: '\u2B06',  label: 'Cult Classic energy',  color: 'text-indigo-400' },
  StrongStart:  { arrow: '\u2B06',  label: 'Strong Start',          color: 'text-cyan-400' },
  Solid:        { arrow: '\u2192',  label: 'Tracking Solid',        color: 'text-green-400' },
  OneHitWonder: { arrow: '\u2192',  label: 'One Hit Wonder risk',   color: 'text-yellow-400' },
  DeepCut:      { arrow: '\u2192',  label: 'Deep Cut trajectory',   color: 'text-teal-400' },
  Archived:     { arrow: '\u2192',  label: 'Unremarkable',          color: 'text-gray-400' },
  Flop:         { arrow: '\u2B07',  label: 'At risk of Flop',      color: 'text-red-500' },
};

/**
 * Active lifecycle phase display metadata.
 * Maps each active phase to contextual label, colors, and pulse config for the trajectory strip.
 * Used by ReleasedLibrary's TrajectoryStrip component.
 * PUBLIC_INTERFACE
 */
export const ACTIVE_PHASE_DISPLAY = {
  Hot: {
    label: 'Dropping Now',
    subLabel: 'Peak week',
    emoji: '🔥',
    bg: 'bg-gradient-to-r from-orange-500/20 to-red-500/10',
    border: 'border-orange-500/30',
    textColor: 'text-orange-300',
    dotColor: 'bg-orange-400',
    pulse: true,
  },
  Trending: {
    label: 'On the Rise',
    subLabel: 'Climbing charts',
    emoji: '📈',
    bg: 'bg-gradient-to-r from-green-500/20 to-emerald-500/10',
    border: 'border-green-500/30',
    textColor: 'text-green-300',
    dotColor: 'bg-green-400',
    pulse: false,
  },
  Momentum: {
    label: 'Building Steam',
    subLabel: 'Solid momentum',
    emoji: '⚡',
    bg: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10',
    border: 'border-yellow-500/30',
    textColor: 'text-yellow-300',
    dotColor: 'bg-yellow-400',
    pulse: false,
  },
  Stable: {
    label: 'Catalog Solid',
    subLabel: 'Steady streams',
    emoji: '✅',
    bg: 'bg-gradient-to-r from-blue-500/15 to-indigo-500/10',
    border: 'border-blue-500/25',
    textColor: 'text-blue-300',
    dotColor: 'bg-blue-400',
    pulse: false,
  },
  Declining: {
    label: 'Fading Out',
    subLabel: 'Winding down',
    emoji: '↘',
    bg: 'bg-gradient-to-r from-gray-500/15 to-gray-600/10',
    border: 'border-gray-500/20',
    textColor: 'text-gray-400',
    dotColor: 'bg-gray-500',
    pulse: false,
  },
};
