/**
 * GENRE TRAITS
 * Static modifier table for each genre. Pure config — no DB.
 * Used by algorithmMoodModule, economyMath (computeMoodStreamBonus),
 * and trendEvolutionModule for downstream genre-aware mechanics.
 */

export interface GenreTrait {
  /** How easily the genre attracts/retains broad appeal (0–1) */
  culturalGravityFactor: number;
  /** Resilience of fans to negative events (0–1). Lower = more volatile */
  fanLoyaltyFactor: number;
  /** Additive bonus/penalty applied to initial algorithm favor */
  algorithmBiasModifier: number;
  /** Acceptance for songs outside artist's usual lane (0–1) */
  experimentalToleranceFactor: number;
  /** Proneness to rivalries; diss tracks hit harder in this genre (0–1) */
  beefSusceptibilityFactor: number;
  /** Collaborations land bigger and succeed more often (0–1) */
  collaborationAffinityFactor: number;
}

const DEFAULT: GenreTrait = {
  culturalGravityFactor: 0.5,
  fanLoyaltyFactor: 0.5,
  algorithmBiasModifier: 0,
  experimentalToleranceFactor: 0.5,
  beefSusceptibilityFactor: 0.5,
  collaborationAffinityFactor: 0.5,
};

export const GENRE_TRAITS: Record<string, GenreTrait> = {
  pop: {
    culturalGravityFactor: 0.9,
    fanLoyaltyFactor: 0.4,        // Casual fans, trend-chasing
    algorithmBiasModifier: 0.15,  // Algorithms love pop
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.4,
    collaborationAffinityFactor: 0.85,
  },
  hip_hop: {
    culturalGravityFactor: 0.8,
    fanLoyaltyFactor: 0.6,
    algorithmBiasModifier: 0.1,
    experimentalToleranceFactor: 0.55,
    beefSusceptibilityFactor: 0.85,  // Beef is structural in hip-hop
    collaborationAffinityFactor: 0.75,
  },
  rap: {
    culturalGravityFactor: 0.75,
    fanLoyaltyFactor: 0.6,
    algorithmBiasModifier: 0.1,
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.9,
    collaborationAffinityFactor: 0.7,
  },
  drill: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.75,
    algorithmBiasModifier: -0.05,
    experimentalToleranceFactor: 0.2,       // Very rigid sound
    beefSusceptibilityFactor: 0.95,         // Drill is beef incarnate
    collaborationAffinityFactor: 0.4,
  },
  alternative_rap: {
    culturalGravityFactor: 0.5,
    fanLoyaltyFactor: 0.7,
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.85,      // Alt-rap thrives on experimentation
    beefSusceptibilityFactor: 0.4,
    collaborationAffinityFactor: 0.65,
  },
  r_and_b: {
    culturalGravityFactor: 0.7,
    fanLoyaltyFactor: 0.65,
    algorithmBiasModifier: 0.05,
    experimentalToleranceFactor: 0.6,
    beefSusceptibilityFactor: 0.45,
    collaborationAffinityFactor: 0.8,
  },
  afrobeats: {
    culturalGravityFactor: 0.65,
    fanLoyaltyFactor: 0.8,        // Deep cultural connection
    algorithmBiasModifier: 0.0,
    experimentalToleranceFactor: 0.55,
    beefSusceptibilityFactor: 0.35,
    collaborationAffinityFactor: 0.9,  // Cross-genre collab culture
  },
  amapiano: {
    culturalGravityFactor: 0.6,
    fanLoyaltyFactor: 0.8,
    algorithmBiasModifier: -0.05,
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.3,
    collaborationAffinityFactor: 0.85,
  },
  edm: {
    culturalGravityFactor: 0.65,
    fanLoyaltyFactor: 0.45,       // Scene-hopping EDM fans
    algorithmBiasModifier: 0.05,
    experimentalToleranceFactor: 0.8,  // Genre thrives on novelty
    beefSusceptibilityFactor: 0.2,
    collaborationAffinityFactor: 0.7,
  },
  kpop: {
    culturalGravityFactor: 0.75,
    fanLoyaltyFactor: 0.95,       // Stans are THE most loyal
    algorithmBiasModifier: 0.1,
    experimentalToleranceFactor: 0.4,  // K-pop fans expect the format
    beefSusceptibilityFactor: 0.5,
    collaborationAffinityFactor: 0.65,
  },
  indie: {
    culturalGravityFactor: 0.45,
    fanLoyaltyFactor: 0.8,
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.9,
    beefSusceptibilityFactor: 0.15,
    collaborationAffinityFactor: 0.55,
  },
  country: {
    culturalGravityFactor: 0.6,
    fanLoyaltyFactor: 0.85,
    algorithmBiasModifier: -0.05,
    experimentalToleranceFactor: 0.25,
    beefSusceptibilityFactor: 0.5,
    collaborationAffinityFactor: 0.65,
  },
  // ── Core canonical genres (continued) ──
  uk_drill: {
    culturalGravityFactor: 0.5,
    fanLoyaltyFactor: 0.75,       // UK scene loyalty runs deep
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.25,  // Very rigid sound expectations
    beefSusceptibilityFactor: 0.95,     // Beef is the lifeblood of UK drill
    collaborationAffinityFactor: 0.45,
  },
  melodic_rap: {
    culturalGravityFactor: 0.8,
    fanLoyaltyFactor: 0.5,
    algorithmBiasModifier: 0.1,   // Algorithm-friendly melodic hooks
    experimentalToleranceFactor: 0.6,
    beefSusceptibilityFactor: 0.7,
    collaborationAffinityFactor: 0.8,
  },
  trap: {
    culturalGravityFactor: 0.75,
    fanLoyaltyFactor: 0.55,
    algorithmBiasModifier: 0.05,
    experimentalToleranceFactor: 0.45,
    beefSusceptibilityFactor: 0.8,      // Trap culture has heavy rivalry
    collaborationAffinityFactor: 0.75,
  },
  rock: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.8,        // Rock fans are lifers
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.6,
    beefSusceptibilityFactor: 0.3,
    collaborationAffinityFactor: 0.5,
  },
  alternative: {
    culturalGravityFactor: 0.45,
    fanLoyaltyFactor: 0.75,
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.85,   // Alt fans love experimentation
    beefSusceptibilityFactor: 0.2,
    collaborationAffinityFactor: 0.6,
  },
  folk: {
    culturalGravityFactor: 0.4,
    fanLoyaltyFactor: 0.9,        // Folk audiences are deeply devoted
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.3,
    beefSusceptibilityFactor: 0.1,       // Folk has almost zero beef culture
    collaborationAffinityFactor: 0.55,
  },
  trance: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.6,
    algorithmBiasModifier: -0.05,
    experimentalToleranceFactor: 0.75,
    beefSusceptibilityFactor: 0.15,
    collaborationAffinityFactor: 0.65,
  },
  techno: {
    culturalGravityFactor: 0.5,
    fanLoyaltyFactor: 0.65,
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.8,    // Techno thrives on innovation
    beefSusceptibilityFactor: 0.1,
    collaborationAffinityFactor: 0.6,
  },
  reggaeton: {
    culturalGravityFactor: 0.8,
    fanLoyaltyFactor: 0.7,
    algorithmBiasModifier: 0.1,   // Algorithm loves reggaeton hooks
    experimentalToleranceFactor: 0.45,
    beefSusceptibilityFactor: 0.55,
    collaborationAffinityFactor: 0.9,    // Massive collab culture
  },
  latin_pop: {
    culturalGravityFactor: 0.85,
    fanLoyaltyFactor: 0.6,
    algorithmBiasModifier: 0.1,
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.35,
    collaborationAffinityFactor: 0.85,
  },
  salsa: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.85,       // Deep cultural roots
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.3,
    beefSusceptibilityFactor: 0.2,
    collaborationAffinityFactor: 0.7,
  },
  dancehall: {
    culturalGravityFactor: 0.6,
    fanLoyaltyFactor: 0.75,
    algorithmBiasModifier: 0.0,
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.65,      // Clashes are part of dancehall culture
    collaborationAffinityFactor: 0.8,
  },
  reggae: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.9,        // Reggae fans are deeply loyal
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.35,
    beefSusceptibilityFactor: 0.2,
    collaborationAffinityFactor: 0.7,
  },
  j_pop: {
    culturalGravityFactor: 0.6,
    fanLoyaltyFactor: 0.85,       // Otaku-level devotion
    algorithmBiasModifier: 0.0,
    experimentalToleranceFactor: 0.45,
    beefSusceptibilityFactor: 0.3,
    collaborationAffinityFactor: 0.6,
  },

  // ── Regional/cultural canonical genres ──
  go_go: {
    culturalGravityFactor: 0.45,
    fanLoyaltyFactor: 0.85,       // DC go-go is deeply local
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.4,
    beefSusceptibilityFactor: 0.3,
    collaborationAffinityFactor: 0.7,
  },
  grunge: {
    culturalGravityFactor: 0.45,
    fanLoyaltyFactor: 0.85,       // Grunge fans are devoted
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.7,
    beefSusceptibilityFactor: 0.25,
    collaborationAffinityFactor: 0.4,
  },
  blues: {
    culturalGravityFactor: 0.45,
    fanLoyaltyFactor: 0.9,        // Blues lifers
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.3,
    beefSusceptibilityFactor: 0.1,
    collaborationAffinityFactor: 0.65,
  },
  jazz: {
    culturalGravityFactor: 0.5,
    fanLoyaltyFactor: 0.9,        // Jazz heads are devoted
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.85,  // Jazz thrives on experimentation
    beefSusceptibilityFactor: 0.1,
    collaborationAffinityFactor: 0.8,
  },
  soul: {
    culturalGravityFactor: 0.55,
    fanLoyaltyFactor: 0.85,
    algorithmBiasModifier: -0.05,
    experimentalToleranceFactor: 0.4,
    beefSusceptibilityFactor: 0.15,
    collaborationAffinityFactor: 0.75,
  },
  gospel: {
    culturalGravityFactor: 0.4,
    fanLoyaltyFactor: 0.95,       // Gospel fans are extremely loyal
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.2,
    beefSusceptibilityFactor: 0.05,
    collaborationAffinityFactor: 0.6,
  },

  // ── Additional canonical genres ──
  punk: {
    culturalGravityFactor: 0.4,
    fanLoyaltyFactor: 0.85,       // Punk fans are fiercely loyal
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.6,
    beefSusceptibilityFactor: 0.35,
    collaborationAffinityFactor: 0.45,
  },
  metal: {
    culturalGravityFactor: 0.4,
    fanLoyaltyFactor: 0.9,        // Metal heads are lifers
    algorithmBiasModifier: -0.15,
    experimentalToleranceFactor: 0.55,
    beefSusceptibilityFactor: 0.3,
    collaborationAffinityFactor: 0.5,
  },
  indie_rock: {
    culturalGravityFactor: 0.5,
    fanLoyaltyFactor: 0.8,
    algorithmBiasModifier: -0.1,
    experimentalToleranceFactor: 0.75,
    beefSusceptibilityFactor: 0.15,
    collaborationAffinityFactor: 0.55,
  },
  latin_rap: {
    culturalGravityFactor: 0.7,
    fanLoyaltyFactor: 0.65,
    algorithmBiasModifier: 0.1,
    experimentalToleranceFactor: 0.45,
    beefSusceptibilityFactor: 0.7,
    collaborationAffinityFactor: 0.8,
  },
  latin: {
    culturalGravityFactor: 0.65,
    fanLoyaltyFactor: 0.75,
    algorithmBiasModifier: 0.0,
    experimentalToleranceFactor: 0.5,
    beefSusceptibilityFactor: 0.25,
    collaborationAffinityFactor: 0.8,
  },
};

/** Aliases for normalized genre keys that don't match GENRE_TRAITS keys */
const GENRE_ALIASES: Record<string, string> = {
  k_pop: 'kpop',
  'r_b': 'r_and_b',
  'r_b_': 'r_and_b',
  hip_hop: 'hip_hop',
  'indie_rock': 'indie_rock',
  'latin_rap': 'latin_rap',
  'go_go': 'go_go',
  // common alternative normalizations
  'punk_rock': 'punk',
  'uk_drill': 'uk_drill',
};

/** Returns genre trait, falling back to DEFAULT for unknown genres */
export function getGenreTrait(genre: string | null | undefined): GenreTrait {
  if (!genre) return DEFAULT;
  const raw = genre.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+$/, '');
  const key = GENRE_ALIASES[raw] ?? raw;
  return GENRE_TRAITS[key] ?? DEFAULT;
}

/**
 * Returns a stream multiplier based on how well a genre fits the current mood.
 * 1.0 = neutral, > 1.0 = favored, < 1.0 = penalized.
 */
export function getMoodGenreAffinity(
  genre: string | null | undefined,
  mood: string,
): number {
  const raw = genre?.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+$/, '') ?? '';
  const g = GENRE_ALIASES[raw] ?? raw;

  switch (mood) {
    case 'beef_season':
      if (['uk_drill', 'drill', 'rap', 'hip_hop', 'trap'].includes(g)) return 1.3;
      if (['pop', 'indie', 'country', 'folk', 'reggae'].includes(g)) return 0.85;
      return 1.0;

    case 'nostalgic':
      if (['r_and_b', 'pop', 'country', 'hip_hop', 'rock', 'folk', 'reggae', 'salsa'].includes(g)) return 1.2;
      if (['uk_drill', 'drill', 'edm', 'amapiano', 'trap'].includes(g)) return 0.9;
      return 1.0;

    case 'experimental':
      if (['jazz', 'edm', 'indie', 'afrobeats', 'techno', 'trance', 'alternative', 'alternative_rap'].includes(g)) return 1.25;
      if (['uk_drill', 'drill', 'kpop', 'country', 'folk'].includes(g)) return 0.85;
      return 1.0;

    case 'underground':
      if (['uk_drill', 'drill', 'alternative_rap', 'grunge', 'punk', 'indie_rock', 'amapiano', 'indie', 'dancehall', 'reggae', 'techno'].includes(g)) return 1.2;
      if (['pop', 'kpop', 'latin_pop'].includes(g)) return 0.8;
      return 1.0;

    case 'mainstream':
      if (['pop', 'hip_hop', 'kpop', 'r_and_b', 'reggaeton', 'latin_pop', 'melodic_rap'].includes(g)) return 1.15;
      if (['amapiano', 'indie', 'techno', 'folk', 'alternative_rap'].includes(g)) return 0.9;
      return 1.0;

    case 'messy':
      return 1.05; // Flat small boost — chaos is universal

    case 'collab_season':
      // Genres with high collaboration culture thrive: reggaeton, afrobeats, r&b, pop
      // Folk are penalized — they're not collaboration-culture genres
      if (['reggaeton', 'afrobeats', 'amapiano', 'r_and_b', 'pop', 'latin_pop', 'dancehall'].includes(g)) return 1.25;
      if (['kpop', 'hip_hop', 'melodic_rap', 'edm'].includes(g)) return 1.1;
      if (['uk_drill', 'drill', 'folk', 'rock', 'country'].includes(g)) return 0.9;
      return 1.0;

    case 'hype_cycle':
      // Pop and kpop understand rollout culture; melodic rap thrives on anticipation
      // Bedroom/lo-fi genres don't do album rollouts the same way
      if (['pop', 'kpop', 'melodic_rap', 'hip_hop', 'latin_pop'].includes(g)) return 1.2;
      if (['trap', 'r_and_b', 'rap', 'reggaeton'].includes(g)) return 1.1;
      if (['folk', 'indie', 'alternative', 'techno', 'trance'].includes(g)) return 0.85;
      return 1.0;

    case 'viral_spiral':
      // Short-form chaos favors genres that translate to 15-second clips
      // Hip-hop, pop, trap thrive; slow or niche genres get drowned in the churn
      if (['hip_hop', 'pop', 'trap', 'melodic_rap', 'uk_drill', 'drill'].includes(g)) return 1.25;
      if (['kpop', 'r_and_b', 'reggaeton', 'latin_pop', 'amapiano'].includes(g)) return 1.1;
      if (['folk', 'country', 'reggae', 'trance', 'techno', 'salsa'].includes(g)) return 0.8;
      return 1.0;

    case 'industry_exposed':
      // Receipts season benefits beef-adjacent genres; diss tracks and drama circulate
      // Clean-image genres (kpop, country) get penalized when drama context dominates
      if (['rap', 'hip_hop', 'uk_drill', 'drill', 'trap'].includes(g)) return 1.2;
      if (['r_and_b', 'melodic_rap', 'dancehall', 'alternative_rap'].includes(g)) return 1.05;
      if (['kpop', 'country', 'folk', 'j_pop', 'salsa'].includes(g)) return 0.85;
      return 1.0;

    case 'tour_season':
      // Live performance culture genres surge when touring dominates the conversation
      // Bedroom producers and studio-only acts are less relevant in this moment
      if (['reggaeton', 'afrobeats', 'amapiano', 'edm', 'pop', 'dancehall'].includes(g)) return 1.3;
      if (['hip_hop', 'rap', 'r_and_b', 'kpop', 'latin_pop', 'rock'].includes(g)) return 1.15;
      if (['indie', 'folk', 'metal', 'alternative', 'techno', 'alternative_rap'].includes(g)) return 0.9;
      return 1.0;

    default:
      return 1.0;
  }
}
