/**
 * Era Actions System
 * 
  // Flavor modifications based on fan mix share.
  const stanPercentage = Number(fanProfile?.stans ?? 10);
 * Not every turn has actions - availability is limited to keep decisions meaningful.
 */

import { clamp } from './eraLogic.js';

export const ERA_ACTIONS = {
  // Active Promotion (push streaming, engagement)
  ACTIVE_PROMOTION: {
    id: 'active_promotion',
    name: 'Active Promotion',
    description: 'Push this era hard through marketing & social content',
    icon: '📢',
    phase_affinity: ['TEASE', 'DROP', 'SURGE'],
    costs: { energy: 25, inspiration: 10 },
    effects: {
      momentum: 12,
      tension: 5,
      volatility: 8,
      fan_mix_delta: { og: 0, core: 3, casual: 0, trend_chaser: -1, stan: 2, critic: 0 },
      extends_phase_turns: 24
    },
    requirements: {
      min_followers: 100,
      min_monthly_listeners: 50
    }
  },

  // Community Engagement (build fanbase loyalty)
  COMMUNITY_ENGAGEMENT: {
    id: 'community_engagement',
    name: 'Community Engagement',
    description: 'Connect directly with fans (COMING SOON: Discord, Twitter Spaces, etc)',
    icon: '🤝',
    phase_affinity: ['DROP', 'SUSTAIN', 'PLATEAU'],
    costs: { energy: 20, inspiration: 15 },
    effects: {
      momentum: 6,
      tension: -3,
      volatility: -5,
      fan_mix_delta: { og: 2, core: 2, casual: -2, trend_chaser: -1, stan: 5, critic: -1 },
      extends_phase_turns: 12
    },
    requirements: {
      min_followers: 200,
      min_fan_engagement: 0.2 // 20% of listeners actively engaged
    }
  },

  // Experimental Release (test new sound, risky)
  EXPERIMENTAL_RELEASE: {
    id: 'experimental_release',
    name: 'Experimental Release',
    description: 'Drop an unexpected sound variation - risky but polarizing',
    icon: '🎨',
    phase_affinity: ['PLATEAU', 'SUSTAIN'],
    costs: { energy: 30, inspiration: 25 },
    effects: {
      momentum: 0,
      tension: 8,
      volatility: 15,
      fan_mix_delta: { og: -1, core: -3, casual: 0, trend_chaser: 2, stan: 3, critic: 1 },
      extends_phase_turns: 18
    },
    requirements: {
      min_clout: 50
    }
  },

  // Strategic Silence (let hype build naturally)
  STRATEGIC_SILENCE: {
    id: 'strategic_silence',
    name: 'Strategic Silence',
    description: 'Go quiet - let curiosity build, reduce tension',
    icon: '🤐',
    phase_affinity: ['DECAY', 'CONSOLIDATION'],
    costs: { energy: 5, inspiration: 0 },
    effects: {
      momentum: -5,
      tension: -8,
      volatility: -10,
      fan_mix_delta: { og: 1, core: 0, casual: -1, trend_chaser: -2, stan: 2, critic: 0 },
      extends_phase_turns: 36
    },
    requirements: {
      min_monthly_listeners: 100
    }
  },

  // Reinvention Push (force phase change, high risk/reward)
  REINVENTION_PUSH: {
    id: 'reinvention_push',
    name: 'Reinvention Push',
    description: 'Force a sound/aesthetic shift - skip to next era',
    icon: '🔄',
    phase_affinity: ['DECAY', 'FADE'],
    costs: { energy: 40, inspiration: 30 },
    effects: {
      momentum: 8,
      tension: -15,
      volatility: 20,
      fan_mix_delta: { og: -2, core: 5, casual: 2, trend_chaser: 1, stan: -2, critic: -1 },
      forces_phase_transition: 'REINVENTION',
      extends_phase_turns: 48
    },
    requirements: {
      min_clout: 100,
      prevent_if_phase: ['REINVENTION', 'LEGACY', 'TEASE']
    }
  }
};

export const FANBASE_NICKNAME_TEMPLATES = {
  TEASE: [
    'The Waitlist',
    'The Curious Ones',
    'The Teasers',
    'Whisper Nation',
    'The Sneak Peek Crew'
  ],
  DROP: [
    'The Day Ones',
    'The Believers',
    'The Hype Squad',
    'First Wave',
    'The Moment'
  ],
  SURGE: [
    'The Wave Riders',
    'The Surge',
    'Momentum Gang',
    'The Uprising',
    'Peak Collective'
  ],
  PLATEAU: [
    'The Loyalists',
    'The Keepers',
    'Steady State',
    'The Anchors',
    'The Foundation'
  ],
  SUSTAIN: [
    'The Forever Fans',
    'The Sustain',
    'The Eternal Ones',
    'The Devoted',
    'The Staying Power'
  ],
  DECAY: [
    'The Nostalgic',
    'The Memories',
    'The Echoes',
    'The Reflection Squad',
    'The Timeless'
  ],
  CONSOLIDATION: [
    'The Consolidated',
    'The Unity',
    'The Gathered',
    'The Collective',
    'The Assembly'
  ],
  REINVENTION: [
    'The Reborn',
    'The Transformers',
    'The New Era',
    'Phoenix Rising',
    'The Evolved'
  ],
  LEGACY: [
    'The Legacy',
    'The Eternal',
    'The Timeless Ones',
    'The Immortals',
    'The Legends'
  ],
  FADE: [
    'The Memories',
    'The Echoes',
    'The Fading Light',
    'The Endings',
    'The Twilight'
  ]
};

/**
 * Generate or evolve fanbase nickname based on era phase, fan mix, and album content
 */
export function generateFanbaseNickname(era, fanProfile, rng, albumTheme = null) {
  // Prefer custom override if set
  if (era.fanbase_nickname_custom) {
    return era.fanbase_nickname_custom;
  }

  const phase = era.phase || 'TEASE';
  const templates = FANBASE_NICKNAME_TEMPLATES[phase] || FANBASE_NICKNAME_TEMPLATES.SUSTAIN;
  
  // Base selection
  let nickname = templates[rng.randomInt(0, templates.length)];

  // Flavor modifications based on fan mix share.
  const stanPercentage = Number(fanProfile?.stans ?? 10);
  if (stanPercentage > 40) {
    const stanModifiers = ['True', 'Die-Hard', 'Devoted', 'Cult of', 'The Inner Circle of'];
    nickname = `${stanModifiers[rng.randomInt(0, stanModifiers.length)]} ${nickname}`;
  }

  // Album theme wild modifiers (AI-driven crazy names)
  if (albumTheme) {
    const themeWords = albumTheme.toLowerCase().split(' ');
    const wildMods = ['The', 'Cult of', 'Church of', 'Dynasty of', 'Nation of'];
    if (rng.random() < 0.15) { // 15% chance of wild theme-based name
      nickname = `${wildMods[rng.randomInt(0, wildMods.length)]} ${themeWords[0]}`;
    }
  }

  return nickname;
}

/**
 * Determine available actions for a turn
 * Actions should be rare - not every turn, but impactful when they appear
 */
export function getAvailableActions(playerState, era, fanProfile, turnId) {
  const actions = [];

  // Action availability: roughly every 48 turns (2 game days), but randomized
  const turnsSinceLastAction = turnId - (era.last_action_turn || 0);
  const hasEnoughTurns = turnsSinceLastAction >= 36; // at least 36 turns since last action
  
  if (!hasEnoughTurns) {
    return []; // No actions available yet
  }

  // Iterate through all possible actions
  Object.values(ERA_ACTIONS).forEach(action => {
    // Check phase affinity
    const phaseMatch = action.phase_affinity.includes(era.phase);
    if (!phaseMatch) return;

    // Check resource availability
    const hasEnergy = playerState.energy >= action.costs.energy;
    const hasInspiration = playerState.inspiration >= action.costs.inspiration;
    if (!hasEnergy || !hasInspiration) return;

    // Check requirements
    const meetsRequirements = checkActionRequirements(action, playerState, era, fanProfile);
    if (!meetsRequirements) return;

    // Check prevention conditions
    if (action.requirements.prevent_if_phase && action.requirements.prevent_if_phase.includes(era.phase)) {
      return;
    }

    actions.push(action);
  });

  return actions;
}

function checkActionRequirements(action, playerState, era, fanProfile) {
  const reqs = action.requirements || {};

  if (reqs.min_followers && (playerState.followers || 0) < reqs.min_followers) {
    return false;
  }

  if (reqs.min_clout && (playerState.clout || 0) < reqs.min_clout) {
    return false;
  }

  if (reqs.min_monthly_listeners && (fanProfile?.monthly_listeners || 0) < reqs.min_monthly_listeners) {
    return false;
  }

  if (reqs.min_fan_engagement) {
    const engagement = Number(fanProfile?.stans ?? 0);
    if (engagement < reqs.min_fan_engagement * 100) {
      return false;
    }
  }

  return true;
}

/**
 * Apply era action effects to game state
 */
export function applyEraActionEffects(action, playerState, era, fanProfile, rng) {
  const effects = action.effects;

  return {
    // Era deltas
    momentum_delta: effects.momentum || 0,
    tension_delta: effects.tension || 0,
    volatility_delta: effects.volatility || 0,
    
    // Fan mix changes
    fan_mix_delta: effects.fan_mix_delta || {},
    
    // Phase extension
    phase_turns_extension: effects.extends_phase_turns || 0,
    
    // Forced phase transition
    forced_phase: effects.forces_phase_transition || null,
    
    // Resource costs
    energy_cost: action.costs.energy,
    inspiration_cost: action.costs.inspiration
  };
}