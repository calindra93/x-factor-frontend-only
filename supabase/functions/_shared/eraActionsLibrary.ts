// Era Actions Library - All available actions per phase with costs and effects

type EraAction = {
  id: string;
  name: string;
  icon: string;
  phase: string;
  description: string;
  costs: { energy: number; inspiration: number };
  effects: Record<string, number>;
  tags: string[];
  requires_budget?: Record<string, number>;
};

export const ERA_ACTIONS: Record<string, EraAction> = {
  // TEASE PHASE - Build anticipation, test concepts
  DEMO_DROP: {
    id: "demo_drop",
    name: "Release Demo",
    icon: "🎙️",
    phase: "TEASE",
    description: "Drop an unreleased demo to gauge fan reaction. Low risk, builds early buzz.",
    costs: { energy: 15, inspiration: 20 },
    effects: { 
      momentum: 8,
      tension: 5,
      volatility: 3,
      brand_heat: 12
    },
    tags: ["pre-release", "engagement"]
  },
  
  TEASER_CAMPAIGN: {
    id: "teaser_campaign",
    name: "Teaser Campaign",
    icon: "📺",
    phase: "TEASE",
    description: "Launch cryptic visuals and hints across platforms. High momentum potential.",
    costs: { energy: 25, inspiration: 15 },
    effects: { 
      momentum: 15,
      tension: 12,
      volatility: 8,
      brand_heat: 20
    },
    requires_budget: { budget_marketing: 1000 },
    tags: ["marketing", "hype"]
  },

  BEHIND_SCENES: {
    id: "behind_scenes",
    name: "Behind-the-Scenes Content",
    icon: "🎬",
    phase: "TEASE",
    description: "Share studio sessions and creative process. Builds authentic fan connection.",
    costs: { energy: 12, inspiration: 10 },
    effects: { 
      momentum: 6,
      tension: 3,
      volatility: 2,
      brand_heat: 15
    },
    tags: ["engagement", "authenticity"]
  },

  FEATURE_ANNOUNCEMENT: {
    id: "feature_announcement",
    name: "Feature Announcement",
    icon: "🤝",
    phase: "TEASE",
    description: "Announce major collaborations early. Creates anticipation waves.",
    costs: { energy: 20, inspiration: 18 },
    effects: { 
      momentum: 12,
      tension: 8,
      volatility: 5,
      brand_heat: 25
    },
    requires_budget: { budget_features: 500 },
    tags: ["collab", "hype"]
  },

  // DROP PHASE - Release is live, maximize impact
  RELEASE_BLITZ: {
    id: "release_blitz",
    name: "Release Day Blitz",
    icon: "💥",
    phase: "DROP",
    description: "Coordinated push across all platforms same day. Maximum immediate impact.",
    costs: { energy: 40, inspiration: 25 },
    effects: { 
      momentum: 25,
      tension: 15,
      volatility: 10,
      brand_heat: 35
    },
    requires_budget: { budget_marketing: 2000 },
    tags: ["release", "marketing"]
  },

  LIVE_PERFORMANCE: {
    id: "live_performance",
    name: "Live Performance",
    icon: "🎤",
    phase: "DROP",
    description: "Perform new material live (local gig/stream). Builds authentic momentum.",
    costs: { energy: 30, inspiration: 20 },
    effects: { 
      momentum: 18,
      tension: 8,
      volatility: 4,
      brand_heat: 22
    },
    tags: ["performance", "engagement"]
  },

  MERCH_ACTIVATION: {
    id: "merch_activation",
    name: "Merch Launch Activation",
    icon: "👕",
    phase: "DROP",
    description: "Launch era-themed merchandise to drive engagement and revenue.",
    costs: { energy: 20, inspiration: 15 },
    effects: { 
      momentum: 10,
      tension: 5,
      volatility: 3,
      brand_heat: 18
    },
    tags: ["merch", "revenue"]
  },

  // SUSTAIN PHASE - Keep momentum alive
  EXCLUSIVE_CONTENT: {
    id: "exclusive_content",
    name: "Exclusive Content Drop",
    icon: "🎁",
    phase: "SUSTAIN",
    description: "Release exclusive version/remix/bonus track. Rewards loyal fans.",
    costs: { energy: 15, inspiration: 12 },
    effects: { 
      momentum: 12,
      tension: 6,
      volatility: 4,
      brand_heat: 14
    },
    tags: ["engagement", "retention"]
  },

  COMMUNITY_EVENT: {
    id: "community_event",
    name: "Community Event",
    icon: "👥",
    phase: "SUSTAIN",
    description: "Fan meetup, listening party, or interactive event. Deep engagement.",
    costs: { energy: 25, inspiration: 18 },
    effects: { 
      momentum: 14,
      tension: 7,
      volatility: 3,
      brand_heat: 20
    },
    requires_budget: { budget_community: 1500 },
    tags: ["community", "loyalty"]
  },

  REMIX_CAMPAIGN: {
    id: "remix_campaign",
    name: "Remix Campaign",
    icon: "🎵",
    phase: "SUSTAIN",
    description: "Release remixes by other producers. Expands reach to new audiences.",
    costs: { energy: 20, inspiration: 15 },
    effects: { 
      momentum: 11,
      tension: 5,
      volatility: 6,
      brand_heat: 16
    },
    requires_budget: { budget_features: 1000 },
    tags: ["collab", "remix"]
  },

  // FADE PHASE - Plan next chapter
  ACOUSTIC_SESSIONS: {
    id: "acoustic_sessions",
    name: "Acoustic Sessions",
    icon: "🎸",
    phase: "FADE",
    description: "Intimate acoustic versions. Nostalgic, reflective energy.",
    costs: { energy: 15, inspiration: 10 },
    effects: { 
      momentum: 6,
      tension: 4,
      volatility: 2,
      brand_heat: 12,
      nostalgia_boost: 5
    },
    tags: ["acoustic", "reflection"]
  },

  RETROSPECTIVE: {
    id: "retrospective",
    name: "Era Retrospective",
    icon: "📸",
    phase: "FADE",
    description: "Documentary-style video looking back at era highlights.",
    costs: { energy: 18, inspiration: 12 },
    effects: { 
      momentum: 8,
      tension: 3,
      volatility: 2,
      brand_heat: 15,
      nostalgia_boost: 8
    },
    tags: ["reflection", "legacy"]
  },

  // UNIVERSAL ACTIONS - Available in any active phase
  BUDGET_REALLOCATION: {
    id: "budget_reallocation",
    name: "Reallocate Budget",
    icon: "💰",
    phase: "ANY",
    description: "Shift budget between categories. Adapt to current priorities.",
    costs: { energy: 5, inspiration: 0 },
    effects: { 
      momentum: 0,
      tension: 0,
      volatility: 2
    },
    tags: ["budget", "strategy"]
  },

  AESTHETIC_SHIFT: {
    id: "aesthetic_shift",
    name: "Era Aesthetic Shift",
    icon: "🎨",
    phase: "ANY",
    description: "Change era theme color and motifs. Refresh visual identity.",
    costs: { energy: 10, inspiration: 15 },
    effects: { 
      momentum: 3,
      tension: 8,
      volatility: 5,
      brand_heat: 8
    },
    tags: ["creativity", "aesthetics"]
  },

  COMMUNITY_CHALLENGE: {
    id: "community_challenge",
    name: "Community Challenge",
    icon: "🏆",
    phase: "ANY",
    description: "Launch fan challenge (cover, remix, dance). Crowdsourced content.",
    costs: { energy: 12, inspiration: 8 },
    effects: { 
      momentum: 10,
      tension: 5,
      volatility: 6,
      brand_heat: 18
    },
    tags: ["engagement", "ugc"]
  },

  BRAND_HEAT_BOOST: {
    id: "brand_heat_boost",
    name: "Local Buzz Campaign",
    icon: "📢",
    phase: "ANY",
    description: "Targeted local promotion before social scaling (SoundCloud push, local radio).",
    costs: { energy: 18, inspiration: 10 },
    effects: { 
      momentum: 8,
      tension: 4,
      volatility: 3,
      brand_heat: 25
    },
    requires_budget: { budget_marketing: 800 },
    tags: ["pre-social", "local"]
  }
};

// Get actions available for a phase and player state
export const getAvailableActions = (phase, profile, era) => {
  if (!phase || !profile) return [];
  
  return Object.values(ERA_ACTIONS).filter(action => {
    // Check phase compatibility
    if (action.phase !== "ANY" && action.phase !== phase) return false;
    
    // Check if player can afford it
    if (action.costs.energy > profile.energy) return false;
    if (action.costs.inspiration > profile.inspiration) return false;
    
    // Check budget requirements
    if (action.requires_budget) {
      for (const [budgetField, required] of Object.entries(action.requires_budget)) {
        if (!era || (era[budgetField] || 0) < required) return false;
      }
    }
    
    return true;
  });
};

// Calculate brand heat contribution from era actions
export const calculateActionBrandHeat = (actionsExecuted) => {
  if (!actionsExecuted || actionsExecuted.length === 0) return 0;
  
  return actionsExecuted.reduce((sum, actionId) => {
    const action = ERA_ACTIONS[actionId];
    if (action) {
      return sum + (action.effects.brand_heat || 0);
    }
    return sum;
  }, 0);
};
