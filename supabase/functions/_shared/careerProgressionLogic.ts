/**
 * Career Progression Logic - Determines stage, auto milestones, and unlocks
 * Exports all functions needed for era and core processors
 */

import {
  STAGE_THRESHOLDS,
  ML_STAGE_THRESHOLDS,
  STAGE_ORDER,
  INDIE_CEILING,
  getStageIndex,
  type CareerStage
} from './constants/careerStages.ts';

// Stage progression timeline — all 10 DB career stages (career_stages table)
// 1 turn = 1 game day = 1 real hour. Active player does ~4-8 turns/day.
// Unknown → Local Artist:        ~60-90 turns   (~2-3 weeks real)
// Local Artist → Local Buzz:     ~200-400 turns  (~2-4 months real)
// Local Buzz → Underground Artist: ~400-800 turns (~4-8 months real)
// Underground Artist → Cult Favorite: ~800-1200 turns (~8-12 months real)
// Cult Favorite → Breakout Artist: ~1200-2000 turns (requires sustained hype)
// Breakout Artist → Mainstream Artist: label deal required
// Mainstream Artist → A-List Star: label + sustained dominance
// A-List Star → Global Superstar: label + cultural impact
// Global Superstar → Legacy Icon: label + multi-year dominance

export function detectCareerStage(followers: number, clout = 0, income = 0, hasLabel = false): string {
  let stage: string = 'Unknown';
  if (followers >= 50000000)  stage = 'Legacy Icon';
  else if (followers >= 10000000) stage = 'Global Superstar';
  else if (followers >= 3000000)  stage = 'A-List Star';
  else if (followers >= 1000000)  stage = 'Mainstream Artist';
  else if (followers >= 500000)   stage = 'Breakout Artist';
  else if (followers >= 200000)   stage = 'Cult Favorite';
  else if (followers >= 50000)    stage = 'Underground Artist';
  else if (followers >= 10000)    stage = 'Local Buzz';
  else if (followers >= 1000)     stage = 'Local Artist';

  // Indie ceiling: cap at Cult Favorite without a label deal
  const stageIndex = STAGE_ORDER.indexOf(stage as CareerStage);
  const ceilingIndex = STAGE_ORDER.indexOf(INDIE_CEILING);
  if (!hasLabel && stageIndex > ceilingIndex) {
    stage = INDIE_CEILING;
  }

  return stage;
}

/**
 * detectCareerStageByML — uses monthly_listeners as primary signal.
 * Matches the CAREER_STAGES thresholds in notificationsGenerator.ts exactly.
 * This is the canonical source of truth for career stage display.
 */
export function detectCareerStageByML(monthlyListeners: number, hasLabel = false): string {
  let stage: string = 'Unknown';
  for (const t of ML_STAGE_THRESHOLDS) {
    if (monthlyListeners >= t.minML) { stage = t.name; break; }
  }
  const stageIndex = STAGE_ORDER.indexOf(stage as CareerStage);
  const ceilingIndex = STAGE_ORDER.indexOf(INDIE_CEILING);
  if (!hasLabel && stageIndex > ceilingIndex) {
    stage = INDIE_CEILING;
  }
  return stage;
}

/**
 * Dynamic career demotion: artists can lose their stage if followers drop.
 * Requires sustained decline (consecutive_decline_turns > threshold) to prevent
 * random fluctuations from causing demotion.
 */
export function canDemoteCareerStage(currentStage: string, followers: number, consecutiveDeclineTurns: number) {
  const stageIndex = STAGE_ORDER.indexOf(currentStage as CareerStage);
  if (stageIndex <= 0) return { shouldDemote: false }; // Can't demote from Unknown

  const thresholds = STAGE_THRESHOLDS[currentStage as CareerStage];
  if (!thresholds) return { shouldDemote: false };

  if (followers < thresholds.demotion_floor && consecutiveDeclineTurns >= 14) {
    const newStage = STAGE_ORDER[stageIndex - 1];
    return { shouldDemote: true, newStage, reason: `Followers dropped below ${thresholds.demotion_floor} for ${consecutiveDeclineTurns} turns (fragile career)` };
  }

  return { shouldDemote: false, newStage: currentStage, reason: 'Performance stable' };
}

/**
 * Economy v4: Career setback mechanics for increased fragility
 */
export function calculateCareerSetback(player: any, consecutivePoorTurns: number, recentPerformance: any) {
  // Use fans ?? followers to match the dual-field naming convention used throughout the engine
  const followers = Number(player?.fans ?? player?.followers) || 0;
  const currentStage = detectCareerStage(followers, player?.clout || 0, player?.income || 0, !!player?.has_label);
  const stageIndex = STAGE_ORDER.indexOf(currentStage as CareerStage);

  const triggers = {
    poor_performance: consecutivePoorTurns >= 5,
    revenue_collapse: (recentPerformance?.revenueDecline || 0) > 0.9 && (recentPerformance?.previousIncome || 0) >= 100,
    fanbase_collapse: (recentPerformance?.followerDecline || 0) > 0.5,
    era_disaster: !!(recentPerformance?.eraFlop && (recentPerformance?.tension || 0) > 80)
  };

  const activeTriggers = Object.values(triggers).filter(Boolean).length;
  if (activeTriggers === 0) return { hasSetback: false, effects: [] };

  const setbackSeverity = Math.min(activeTriggers, 3);
  const effects: any[] = [];

  if (setbackSeverity >= 1) {
    const currentClout = Number(player?.clout) || 0;
    effects.push({ type: 'clout_damage', value: -Math.min(Math.floor(currentClout * 0.1), 20), description: 'Industry confidence shaken' });
    const currentHype = Number(player?.hype) || 10;
    const hypeDamage = currentHype <= 15 ? 0 : -Math.min(10, Math.floor((currentHype - 10) * 0.3));
    if (hypeDamage < 0) effects.push({ type: 'hype_damage', value: hypeDamage, description: 'Buzz cooling down' });
  }

  if (setbackSeverity >= 2) {
    effects.push({ type: 'follower_loss', value: -Math.floor(followers * 0.02), description: 'Fans losing interest' });
  }

  if (setbackSeverity >= 3) {
    if (stageIndex > 0) { // Can't demote below Unknown
      effects.push({ type: 'stage_demotion_risk', value: 0.3, description: 'Career in jeopardy' });
    }
  }

  return {
    hasSetback: true,
    severity: setbackSeverity,
    triggers: Object.entries(triggers).filter(([_, v]) => v).map(([k]) => k),
    effects,
    recovery: {
      turns_needed: setbackSeverity * 7,
      required_actions: setbackSeverity >= 2 ? ['hit_release', 'strategic_marketing'] : ['consistent_activity']
    }
  };
}

/**
 * Auto-triggered milestones at stage transitions
 */
export const AUTO_MILESTONES = {
  'Unknown': [
    {
      type: 'first_hundred',
      trigger: { followers: 100 },
      unlocks: ['social_posting', 'open_mic'],
      story: 'Your first 100 followers! The grind is real but the foundation is set.'
    }
  ],
  'Local Artist': [
    {
      type: 'local_buzz',
      trigger: { followers: 1000 },
      unlocks: ['underground_radio', 'indie_platform'],
      story: 'Your grassroots fanbase is growing. Underground platforms recognize your potential.'
    },
    {
      type: 'first_gig',
      trigger: { followers: 3000, hype: 20 },
      unlocks: ['local_venues', 'basic_merch'],
      story: 'Local venues are booking you. Time to sell some merch.'
    }
  ],
  'Local Buzz': [
    {
      type: 'indie_darling',
      trigger: { followers: 10000 },
      unlocks: ['indie_label_interest', 'regional_touring'],
      story: 'Indie labels are watching. Your sound is catching on beyond your city.'
    },
    {
      type: 'playlist_discovery',
      trigger: { followers: 25000 },
      unlocks: ['editorial_playlists', 'press_coverage'],
      story: 'Streaming editors are adding your tracks. The algorithm is on your side.'
    }
  ],
  'Underground Artist': [
    {
      type: 'rising_star',
      trigger: { followers: 50000 },
      unlocks: ['professional_studio', 'national_touring'],
      story: 'You\'re on the rise! Professional studios and national tours are now within reach.'
    },
    {
      type: 'brand_attention',
      trigger: { followers: 100000, hype: 40 },
      unlocks: ['brand_deals', 'festival_slots'],
      story: 'Brands want to work with you. Festival bookers are calling.'
    }
  ],
  'Cult Favorite': [
    {
      type: 'mainstream_crossover',
      trigger: { followers: 200000 },
      unlocks: ['mainstream_platform', 'world_tour'],
      story: "You've broken into the mainstream! The world is your stage."
    },
    {
      type: 'chart_entry',
      trigger: { followers: 400000, hype: 50 },
      unlocks: ['chart_domination', 'exclusive_merch'],
      story: 'Your tracks are charting. Radio stations can\'t ignore you anymore.'
    }
  ],
  'Breakout Artist': [
    {
      type: 'breakout_album',
      trigger: { followers: 500000 },
      unlocks: ['major_label_interest', 'arena_tours'],
      story: 'Your album breaks through. Major labels are calling.'
    },
    {
      type: 'viral_crossover',
      trigger: { followers: 750000, hype: 55 },
      unlocks: ['global_distribution', 'brand_ambassador'],
      story: 'A viral moment catapults you into mainstream consciousness.'
    }
  ],
  'Mainstream Artist': [
    {
      type: 'superstar_status',
      trigger: { followers: 1000000 },
      unlocks: ['legendary_studio', 'world_tour'],
      story: 'You\'re a superstar. Arenas sell out in minutes.'
    },
    {
      type: 'cultural_impact',
      trigger: { followers: 2000000, hype: 60 },
      unlocks: ['documentary_series', 'fashion_line'],
      story: 'Your influence extends beyond music. You\'re a cultural force.'
    }
  ],
  'A-List Star': [
    {
      type: 'global_domination',
      trigger: { followers: 3000000 },
      unlocks: ['stadium_tours', 'global_brand_deals'],
      story: 'Every continent knows your name. Stadiums are your playground.'
    },
    {
      type: 'icon_status',
      trigger: { followers: 6000000, hype: 65 },
      unlocks: ['signature_fragrance', 'biopic_deal'],
      story: 'You are no longer just an artist. You are an icon.'
    }
  ],
  'Global Superstar': [
    {
      type: 'generational_talent',
      trigger: { followers: 10000000 },
      unlocks: ['heritage_album_format', 'hall_of_fame'],
      story: 'Critics call you the voice of a generation. History is watching.'
    },
    {
      type: 'cultural_movement',
      trigger: { followers: 25000000, hype: 70 },
      unlocks: ['cultural_movement', 'sonic_influence'],
      story: 'New artists cite you as primary influence. Your legacy spreads.'
    }
  ],
  'Legacy Icon': [
    {
      type: 'legacy_icon',
      trigger: { followers: 50000000 },
      unlocks: ['museum_archive', 'enduring_legacy'],
      story: "You're now a cultural icon. Your legacy is cemented in history."
    },
    {
      type: 'comeback_album',
      trigger: { followers: 75000000, hype: 60 },
      unlocks: ['remaster_catalogue', 'hall_of_fame'],
      story: 'Your influence transcends generations. A comprehensive retrospective is in order.'
    }
  ]
};

// Player-triggered legendary moments (5 per stage)
export const PLAYER_TRIGGERED_MOMENTS = {
  'Unknown': [
    {
      type: 'viral_moment',
      cost: 300,
      requirements: { followers: 100 },
      unlocks: ['social_boost', 'snippet_distribution'],
      stat_boost: { hype: 10, followers_mult: 1.15 },
      story: 'A snippet goes viral on social. Perfect timing.'
    },
    {
      type: 'open_mic_night',
      cost: 100,
      requirements: { followers: 50 },
      unlocks: ['local_network', 'performance_xp'],
      stat_boost: { hype: 5, followers_mult: 1.1 },
      story: 'You crush an open mic night. People are talking.'
    }
  ],
  'Local Artist': [
    {
      type: 'breakthrough_hit',
      cost: 500,
      requirements: { followers: 500, hype: 25 },
      unlocks: ['viral_boost', 'collaboration_offer'],
      stat_boost: { hype: 15, followers_mult: 1.3 },
      story: "You pull all-nighters perfecting the perfect track. It's going to blow up."
    },
    {
      type: 'festival_gig',
      cost: 400,
      requirements: { followers: 2000, hype: 30 },
      unlocks: ['festival_circuit', 'merchandise_basics'],
      stat_boost: { fame: 5, followers_mult: 1.2 },
      story: 'You land a spot at a local festival. Your first real crowd.'
    },
    {
      type: 'streaming_surge',
      cost: 600,
      requirements: { followers: 1000 },
      unlocks: ['playlist_placement', 'algorithmic_boost'],
      stat_boost: { clout: 3, followers_mult: 1.18 },
      story: 'A streaming playlist pick amplifies your reach unexpectedly.'
    }
  ],
  'Local Buzz': [
    {
      type: 'collaboration_feat',
      cost: 800,
      requirements: { followers: 5000 },
      unlocks: ['collab_network', 'featured_exclusivity'],
      stat_boost: { followers_mult: 1.25, clout: 5 },
      story: "You reach out to established artists. They're interested in your sound."
    },
    {
      type: 'indie_label_deal',
      cost: 1000,
      requirements: { followers: 15000, hype: 35 },
      unlocks: ['label_distribution', 'pr_support'],
      stat_boost: { clout: 8, followers_mult: 1.2 },
      story: 'An indie label offers you a deal. Distribution and PR support incoming.'
    }
  ],
  'Underground Artist': [
    {
      type: 'media_appearance',
      cost: 1000,
      requirements: { followers: 80000, hype: 50 },
      unlocks: ['press_coverage', 'brand_deals'],
      stat_boost: { fame: 8, followers_mult: 1.25 },
      story: 'You land a major TV appearance. Mainstream validation.'
    },
    {
      type: 'award_nomination',
      cost: 1200,
      requirements: { followers: 150000 },
      unlocks: ['award_circuit', 'industry_respect'],
      stat_boost: { clout: 12, fame: 6 },
      story: 'Industry groups nominate you for prestigious awards.'
    }
  ],
  'Cult Favorite': [
    {
      type: 'festival_headliner',
      cost: 2000,
      requirements: { followers: 250000, hype: 55 },
      unlocks: ['festival_booking', 'mass_merch'],
      stat_boost: { fame: 10, followers_mult: 1.4 },
      story: 'You headline a major festival. Your name lights up the main stage.'
    },
    {
      type: 'album_success',
      cost: 1500,
      requirements: { followers: 350000 },
      unlocks: ['album_platinum', 'chart_domination'],
      stat_boost: { clout: 8, income_mult: 1.3 },
      story: 'Your album debuts at #1. Critics call it a masterpiece.'
    }
  ],
  'Breakout Artist': [
    {
      type: 'chart_apex',
      cost: 2000,
      requirements: { followers: 600000, hype: 65 },
      unlocks: ['radio_dominance', 'global_tour'],
      stat_boost: { fame: 12, followers_mult: 1.35 },
      story: '#1 on every chart. You are everywhere.'
    },
    {
      type: 'mentorship_arc',
      cost: 2500,
      requirements: { followers: 800000 },
      unlocks: ['mentorship_income', 'label_imprint'],
      stat_boost: { income_mult: 1.2, followers_mult: 1.15 },
      story: 'You launch an imprint. The next generation of stars owes you everything.'
    }
  ],
  'Mainstream Artist': [
    {
      type: 'experimental_success',
      cost: 3000,
      requirements: { followers: 1500000 },
      unlocks: ['avant_garde_studio', 'limited_releases'],
      stat_boost: { clout: 12, inspiration: 20 },
      story: 'You push sonic boundaries with a daring experimental project. The world listens.'
    },
    {
      type: 'superstar_crossover',
      cost: 2800,
      requirements: { followers: 2000000, hype: 60 },
      unlocks: ['arena_tours', 'global_brand_deals'],
      stat_boost: { fame: 15, followers_mult: 1.2 },
      story: 'You cross over into global superstardom. The world is yours.'
    }
  ],
  'A-List Star': [
    {
      type: 'stadium_era',
      cost: 4000,
      requirements: { followers: 4000000, hype: 65 },
      unlocks: ['stadium_tours', 'signature_fragrance'],
      stat_boost: { fame: 18, income_mult: 1.4 },
      story: 'Stadiums sell out in seconds. You are the biggest act on the planet.'
    },
    {
      type: 'biopic_deal',
      cost: 3500,
      requirements: { followers: 5000000 },
      unlocks: ['biopic_deal', 'fashion_line'],
      stat_boost: { clout: 15, fame: 12 },
      story: 'Hollywood wants your story. A biopic deal is signed.'
    }
  ],
  'Global Superstar': [
    {
      type: 'hall_of_fame',
      cost: 5000,
      requirements: { followers: 15000000 },
      unlocks: ['museum_archive', 'enduring_legacy'],
      stat_boost: { clout: 20, fame: 15 },
      story: 'You enter the Music Hall of Fame. You are history.'
    },
    {
      type: 'influence_multiplier',
      cost: 4000,
      requirements: { followers: 20000000, hype: 60 },
      unlocks: ['cultural_movement', 'sonic_influence'],
      stat_boost: { clout: 18, followers_mult: 1.1 },
      story: 'New artists cite you as primary influence. Your legacy spreads.'
    }
  ],
  'Legacy Icon': [
    {
      type: 'hall_of_fame_induction',
      cost: 6000,
      requirements: { followers: 60000000 },
      unlocks: ['hall_of_fame', 'remaster_catalogue'],
      stat_boost: { clout: 25, fame: 20 },
      story: 'You enter the Music Hall of Fame. You are history.'
    },
    {
      type: 'generational_legacy',
      cost: 5000,
      requirements: { followers: 80000000, hype: 55 },
      unlocks: ['documentary_series', 'museum_archive'],
      stat_boost: { clout: 22, income_mult: 1.15 },
      story: 'Decades of influence. Your music will outlive you.'
    }
  ]
};

/**
 * Check if player qualifies for auto milestone
 * Returns milestone data if triggered, null otherwise
 */
export function checkAutoMilestone(currentStage: string, profile: any, completedMilestones: string[]) {
  const milestones = (AUTO_MILESTONES as Record<string, any[]>)[currentStage] || [];

  for (const milestone of milestones) {
    // Skip if already completed
    if (completedMilestones.includes(milestone.type)) continue;

    // Check if requirements met
    const meetsRequirements = Object.entries(milestone.trigger).every(([key, value]: [string, any]) => {
      const profileValue = profile[key];
      return profileValue >= value;
    });

    if (meetsRequirements) {
      return milestone;
    }
  }

  return null;
}

/**
 * Get all available moments for a stage
 */
export function getAvailableMomentsForStage(stage: string) {
  return (PLAYER_TRIGGERED_MOMENTS as Record<string, any[]>)[stage] || [];
}

/**
 * Get unlock items for a milestone
 */
export function getMilestoneUnlocks(milestoneType: string) {
  for (const stageMap of Object.values(AUTO_MILESTONES)) {
    const milestone = (stageMap as any[]).find((m: any) => m.type === milestoneType);
    if (milestone) return milestone.unlocks;
  }
  return [];
}