/**
 * sceneMath.ts — Pure math functions for the Regional Scene System.
 * No database access. Follows the economyMath.ts pattern.
 *
 * Handles: genre match scoring, reputation gains, venue unlock tiers,
 * scene influence, networking, artifact discovery, fame spillover,
 * controversy regional impact, opening act fan crossover, and
 * focus path / archetype scene modifiers.
 */

import { getStageIndex } from './constants/careerStages.ts';

// ─── Helpers ─────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Types ───────────────────────────────────────────────────────

export interface CityGenreWeights {
  [genre: string]: number; // 0-1, how dominant a genre is in the city
}

export interface SceneVibe {
  underground?: number;
  mainstream?: number;
  experimental?: number;
}

export interface CityScene {
  id: string;
  city_name: string;
  region: string;
  genre_weights: CityGenreWeights;
  scene_vibe: SceneVibe;
  trending_genre?: string | null;
  controversy_tolerance: number;
  scene_tier: number;
  cultural_artifacts: CulturalArtifact[];
}

export interface CulturalArtifact {
  id: string;
  name: string;
  type: 'local_sound' | 'fashion_style' | 'dance_move' | 'production_technique';
  rarity: 'common' | 'rare' | 'legendary';
  description: string;
  effect: { type: string; value: number };
}

export interface PlayerCityRep {
  reputation_score: number;
  gigs_played: number;
  scene_influence_score: number;
  unlocked_venue_tier: number;
  discovered_artifacts: string[]; // artifact IDs
  networking_points: number;
  fatigue_mitigation: number;
}

export interface FocusPathSceneModifiers {
  reputation_gain_mult: number;
  networking_gain_mult: number;
  artifact_discovery_mult: number;
  fame_spillover_mult: number;
  influence_gain_mult: number;
  venue_follower_threshold_mult: number; // <1 means easier unlock
  fan_crossover_mult: number;
  brand_contact_networking_mult: number;
}

// ─── 1. Genre Match ─────────────────────────────────────────────

/**
 * How well a player's genre matches a city's scene.
 * Returns 0-100.
 */
export function computeGenreMatchScore(
  playerGenre: string | null | undefined,
  cityGenreWeights: CityGenreWeights,
  trendingGenre?: string | null,
): number {
  if (!playerGenre) return 30; // No genre = generic baseline

  const normalizedPlayer = playerGenre.trim();
  const weight = cityGenreWeights[normalizedPlayer] ?? 0;

  // Direct match: weight maps to 10-100 range
  let score = weight > 0
    ? Math.round(10 + weight * 90) // 0.1 weight → 19, 0.9 weight → 91
    : 15; // No match at all — still some baseline interest

  // Trending genre bonus
  if (trendingGenre && normalizedPlayer === trendingGenre) {
    score = Math.min(100, score + 15);
  }

  return clamp(score, 10, 100);
}

// ─── 2. Reputation Gain ─────────────────────────────────────────

/**
 * Reputation gained from a single gig in a city.
 * Base: 2-5 per successful gig. Genre match and sold-out bonuses apply.
 * Diminishing returns approaching 100.
 */
export function computeReputationGain(params: {
  gigSuccess: boolean;
  genreMatchScore: number;     // 0-100 from computeGenreMatchScore
  attendanceRatio: number;     // actual/capacity, 0-1+
  venuePrestige: number;       // 1-5
  currentReputation: number;   // 0-100
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { gigSuccess, genreMatchScore, attendanceRatio, venuePrestige, currentReputation, focusModifiers } = params;

  if (!gigSuccess) return 0;

  // Base gain: 2-5, scaled by venue prestige
  const base = 2 + Math.min(3, venuePrestige * 0.6);

  // Genre match multiplier: 1.0-1.5x
  const genreMultiplier = 1.0 + (genreMatchScore / 200);

  // Sold-out bonus
  const soldOutBonus = attendanceRatio >= 0.95 ? 3 : (attendanceRatio >= 0.8 ? 1 : 0);

  // Focus path multiplier (TOUR_MONSTER gets +25%)
  const focusMult = focusModifiers.reputation_gain_mult;

  // Raw gain
  const rawGain = (base * genreMultiplier + soldOutBonus) * focusMult;

  // Diminishing returns: harder to gain as you approach 100
  const diminishingFactor = Math.max(0.1, 1.0 - (currentReputation / 120));

  return Math.round(clamp(rawGain * diminishingFactor, 0, 15));
}

// ─── 3. Venue Unlock Tier ───────────────────────────────────────

/**
 * Hybrid venue unlock: reputation-primary, fame-spillover secondary.
 * Tier 4-5 ALWAYS requires local reputation (no fame shortcut).
 */
export function computeVenueUnlockTier(params: {
  reputation: number;          // 0-100
  followers: number;
  hype: number;
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { reputation, followers, hype, focusModifiers } = params;

  // Reputation-based tier thresholds (primary path)
  let repTier = 1;
  if (reputation >= 85) repTier = 5;
  else if (reputation >= 65) repTier = 4;
  else if (reputation >= 40) repTier = 3;
  else if (reputation >= 20) repTier = 2;

  // Fame spillover tier (secondary, capped at tier 3)
  let spilloverTier = 1;
  const followerThreshold = focusModifiers.venue_follower_threshold_mult;
  if (followers > 1_000_000 * followerThreshold && hype > 50) {
    spilloverTier = 3;
  } else if (followers > 200_000 * followerThreshold) {
    spilloverTier = 2;
  }

  // Tier 4-5 ALWAYS requires reputation — no fame shortcut
  const spilloverCapped = Math.min(3, spilloverTier);

  return Math.max(repTier, spilloverCapped);
}

// ─── 4. Scene Influence ─────────────────────────────────────────

/**
 * Scene influence accumulation per gig.
 * Requires reputation > 40 to start building influence.
 * When influence > 60: city's genre_weights begin shifting (handled in module).
 */
export function computeSceneInfluenceDelta(params: {
  reputation: number;
  gigsInCity: number;
  genreConsistency: number;    // 0-1, how consistently you play the same genre
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { reputation, gigsInCity, genreConsistency, focusModifiers } = params;

  if (reputation < 40) return 0;
  if (gigsInCity < 3) return 0;

  // Base rate: 0.5-2 per qualifying gig
  const base = 0.5 + genreConsistency * 1.5;

  // Focus path multiplier (DIGITAL_CULT gets online presence counting toward influence)
  const focusMult = focusModifiers.influence_gain_mult;

  return Math.round(clamp(base * focusMult * 10, 0, 30)) / 10;
}

// ─── 5. Networking Gain ─────────────────────────────────────────

/**
 * Networking points gained per gig in a city.
 * Points accumulate toward unlocking NPC contacts.
 */
export function computeNetworkingGain(params: {
  gigSuccess: boolean;
  genreMatchScore: number;
  contactRole?: string;
  contactGenrePreference?: string;
  playerGenre?: string | null;
  reputation: number;
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { gigSuccess, genreMatchScore, contactRole, contactGenrePreference, playerGenre, reputation, focusModifiers } = params;

  if (!gigSuccess) return 0;

  // Base: 1-3 per gig
  let base = 1 + Math.min(2, reputation / 50);

  // Genre match with contact's preference
  if (contactGenrePreference && playerGenre && contactGenrePreference === playerGenre) {
    base += 2;
  } else if (genreMatchScore > 60) {
    base += 1;
  }

  let focusMult = focusModifiers.networking_gain_mult;
  if (contactRole === 'promoter' || contactRole === 'influencer') {
    focusMult *= focusModifiers.brand_contact_networking_mult;
  }

  return Math.round(clamp(base * focusMult, 1, 10));
}

/**
 * Relationship gain for producer contacts when recording at city-pinned studios.
 * This is intentionally conservative to avoid overpowering gig-based networking.
 */
export function computeStudioContactGain(params: {
  contactRole: string;
  studioTier: number;
  playerGenre?: string | null;
  contactGenrePreference?: string | null;
}): number {
  const { contactRole, studioTier, playerGenre, contactGenrePreference } = params;

  if (contactRole !== 'producer') return 0;

  if (studioTier <= 1) {
    return playerGenre && contactGenrePreference && playerGenre === contactGenrePreference ? 1 : 0;
  }

  const tierBase: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 5 };
  let gain = tierBase[studioTier] ?? 1;

  if (playerGenre && contactGenrePreference && playerGenre === contactGenrePreference) {
    gain += 1;
  }

  return Math.min(5, gain);
}

// ─── 6. Artifact Discovery ──────────────────────────────────────

/**
 * Chance (0-1) of discovering a cultural artifact in a city.
 * Plan 034 M3: Hard gate removed; discovery allowed from first gig.
 * Gigs 1-4: base chance only.  Gigs 5+: base + gig bonus.
 */
export function computeArtifactDiscoveryChance(params: {
  reputation: number;
  gigsInCity: number;
  undiscoveredCount: number;   // how many artifacts remain to find
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { reputation, gigsInCity, undiscoveredCount, focusModifiers } = params;

  // Plan 034 M3: removed `if (gigsInCity < 5) return 0;` gate — artifacts discoverable from first gig
  if (gigsInCity < 1) return 0;  // safety: at least 1 gig required
  if (undiscoveredCount <= 0) return 0;

  // Base chance: reputation * 0.003 per gig threshold
  const baseChance = reputation * 0.003;

  // Gig frequency bonus: gigs 5+ get +0.5% per gig (capped at +5%)
  const gigBonus = gigsInCity >= 5 ? Math.min(0.05, (gigsInCity - 5) * 0.005) : 0;

  // Focus path multiplier (ALBUM_AUTEUR gets +20%)
  const focusMult = focusModifiers.artifact_discovery_mult;

  return clamp((baseChance + gigBonus) * focusMult, 0, 0.35);
}

// ─── 7. Fame Spillover ──────────────────────────────────────────

/**
 * Passive reputation gain in ALL cities from global fame.
 * Only kicks in at followers > 100K. Caps at 35.
 */
export function computeFameSpillover(params: {
  followers: number;
  hype: number;
  careerStage: string;
  focusModifiers: FocusPathSceneModifiers;
}): number {
  const { followers, hype, careerStage, focusModifiers } = params;

  if (followers < 100_000) return 0;

  const stageIndex = getStageIndex(careerStage);
  const stageMultiplier = Math.max(0.5, stageIndex / 5); // 0.5 at early stages, up to 1.8 for Legacy Icon

  const rawSpillover = Math.floor(
    Math.log10(Math.max(1, followers)) * (hype / 100) * stageMultiplier
  );

  // Focus path multiplier (HIT_CHASE gets faster spillover)
  const spillover = rawSpillover * focusModifiers.fame_spillover_mult;

  return clamp(Math.floor(spillover), 0, 35);
}

// ─── 8. Controversy Regional Impact ────────────────────────────

/**
 * How a controversy affects reputation in a specific city.
 * Cities with high tolerance (Berlin, LA) dampen impact.
 * Cities with low tolerance (Tokyo, Glasgow) amplify it.
 */
export function computeControversyRegionalImpact(params: {
  controversySeverity: number; // 1-10
  cityTolerance: number;      // 0-1
  playerReputation: number;   // 0-100
  hasJournalistContact: boolean;
  journalistMitigation: number; // 0-0.20
}): number {
  const { controversySeverity, cityTolerance, playerReputation, hasJournalistContact, journalistMitigation } = params;

  // Base impact: severity scaled by how much reputation there is to lose
  const baseImpact = controversySeverity * (1 + playerReputation / 100);

  // Tolerance scaling: high tolerance = dampened, low tolerance = amplified
  // tolerance 0.8 → factor 0.6 (dampened), tolerance 0.3 → factor 1.4 (amplified)
  const toleranceFactor = 2.0 - (cityTolerance * 2.0);
  const toleranceClamped = clamp(toleranceFactor, 0.4, 1.8);

  let impact = baseImpact * toleranceClamped;

  // Journalist contact mitigation (up to 20% reduction)
  if (hasJournalistContact) {
    impact *= (1 - clamp(journalistMitigation, 0, 0.20));
  }

  // Return negative delta (reputation loss)
  return -Math.round(clamp(impact, 1, 30));
}

// ─── 9. Opening Act Fan Crossover ───────────────────────────────

/**
 * How many fans the opener gains from a headliner's gig.
 * Base: 2-5% of headliner's attending fans discover opener.
 */
export function computeOpeningActFanCrossover(params: {
  headlinerAttendingFans: number;
  openerFollowers: number;
  genreOverlap: number;       // 0-1
  gigAttendance: number;
  focusModifiers: FocusPathSceneModifiers;
}): {
  fansGained: number;
  reputationGain: number;
} {
  const { headlinerAttendingFans, openerFollowers, genreOverlap, gigAttendance, focusModifiers } = params;

  // Base crossover: 2-5% of headliner fans
  const baseRate = 0.02 + genreOverlap * 0.03;

  // Focus path multiplier (DIGITAL_CULT gets +20% crossover)
  const crossoverRate = baseRate * focusModifiers.fan_crossover_mult;

  const rawFans = Math.floor(headlinerAttendingFans * crossoverRate);

  // Don't let opener suddenly double their fanbase from one gig
  const cappedFans = Math.min(rawFans, Math.max(100, openerFollowers * 0.1));

  // Both opener and headliner gain scene reputation
  const reputationGain = clamp(Math.round(gigAttendance / 1000), 1, 5);

  return {
    fansGained: Math.max(0, cappedFans),
    reputationGain,
  };
}

// ─── 10. Focus Path Scene Modifiers ─────────────────────────────

/**
 * Returns multiplicative scene bonuses for each focus path.
 * Every path benefits from scenes; TOUR_MONSTER benefits most from live performance.
 */
export function computeFocusPathSceneModifiers(focusPath?: string | null): FocusPathSceneModifiers {
  const base: FocusPathSceneModifiers = {
    reputation_gain_mult: 1.0,
    networking_gain_mult: 1.0,
    artifact_discovery_mult: 1.0,
    fame_spillover_mult: 1.0,
    influence_gain_mult: 1.0,
    venue_follower_threshold_mult: 1.0,
    fan_crossover_mult: 1.0,
    brand_contact_networking_mult: 1.0,
  };

  switch (focusPath) {
    case 'TOUR_MONSTER':
      return {
        ...base,
        reputation_gain_mult: 1.25,       // +25% reputation from gigs
        networking_gain_mult: 1.15,        // +15% networking points
        artifact_discovery_mult: 1.0,
        influence_gain_mult: 1.0,
        venue_follower_threshold_mult: 0.9, // slightly easier venue spillover
        fan_crossover_mult: 1.0,
      };
    case 'HIT_CHASE':
      return {
        ...base,
        reputation_gain_mult: 1.0,
        fame_spillover_mult: 1.3,          // +30% faster fame spillover
        venue_follower_threshold_mult: 0.9, // -10% follower threshold for spillover
        influence_gain_mult: 0.8,          // Less influence from trends (too mainstream)
      };
    case 'ALBUM_AUTEUR':
      return {
        ...base,
        artifact_discovery_mult: 1.2,      // +20% artifact discovery
        influence_gain_mult: 1.3,          // Faster scene influence (creative impact)
        reputation_gain_mult: 1.0,
      };
    case 'BRAND_MOGUL':
      return {
        ...base,
        networking_gain_mult: 1.3,         // +30% networking with all contacts
        brand_contact_networking_mult: 1.25,
        reputation_gain_mult: 1.0,
        artifact_discovery_mult: 1.0,
      };
    case 'DIGITAL_CULT':
      return {
        ...base,
        influence_gain_mult: 1.2,          // Online virality counts toward influence
        fan_crossover_mult: 1.2,           // +20% fan crossover when opening
        fame_spillover_mult: 1.15,         // Slightly faster spillover from online presence
      };
    default:
      return base;
  }
}

// ─── 11. Archetype Scene Bonuses ────────────────────────────────

export interface ArchetypeSceneBonus {
  reputation_mult: number;
  influence_mult: number;
  networking_mult: number;
  crossover_mult: number;
  passive_rep_per_turn: number;      // per-turn passive rep in matching cities
  underground_rep_mult: number;      // multiplier in underground-vibe cities
  critic_contact_mult: number;
  live_show_rep_mult: number;
}

/**
 * Returns scene bonuses based on career archetype.
 * Stacks with focus path modifiers (multiplicative).
 */
export function computeArchetypeSceneBonus(archetype?: string | null): ArchetypeSceneBonus {
  const base: ArchetypeSceneBonus = {
    reputation_mult: 1.0,
    influence_mult: 1.0,
    networking_mult: 1.0,
    crossover_mult: 1.0,
    passive_rep_per_turn: 0,
    underground_rep_mult: 1.0,
    critic_contact_mult: 1.0,
    live_show_rep_mult: 1.0,
  };

  switch (archetype) {
    case 'Live_Show_Legend':
      return { ...base, reputation_mult: 1.1, live_show_rep_mult: 1.1, crossover_mult: 1.0 };
    case 'Hitmaker':
      return { ...base, passive_rep_per_turn: 2 }; // Chart presence = passive rep
    case 'Cult_Icon':
      return { ...base, underground_rep_mult: 2.0 }; // 2x rep in underground cities
    case 'Critically_Acclaimed':
      return { ...base, influence_mult: 1.5, critic_contact_mult: 2.0 };
    case 'Fan_Favorite':
      return { ...base, crossover_mult: 2.0, networking_mult: 1.5 }; // Doubled crossover, 1.5x networking
    case 'Industry_Royalty':
      return { ...base, networking_mult: 1.5 }; // Lower perk thresholds (handled in module)
    default:
      return base;
  }
}

// ─── 12b. Home Field Bonus ────────────────────────────────────────

/**
 * Bonus multiplier applied to scene rep gains when a player gigs in their home region.
 * - In home region, different city: +10%
 * - In home region, exact home city: +20%
 * - Anywhere else: no bonus (1.0)
 */
export function computeHomeFieldBonus(params: {
  playerHomeRegion: string | null | undefined;
  playerCurrentRegion: string | null | undefined;
  playerHomeCity: string | null | undefined;
  playerCurrentCity: string | null | undefined;
  gigCityName: string | null | undefined;
}): number {
  const { playerHomeRegion, playerCurrentRegion, playerHomeCity, playerCurrentCity, gigCityName } = params;

  const isHomeRegion =
    playerHomeRegion
    && playerCurrentRegion
    && playerHomeRegion === playerCurrentRegion;

  if (!isHomeRegion) return 1.0;

  const effectiveHomeCity = playerHomeCity || null;
  const effectiveCurrentCity = playerCurrentCity || gigCityName || null;

  if (effectiveHomeCity && effectiveCurrentCity && effectiveHomeCity === effectiveCurrentCity) {
    return 1.20;
  }

  return 1.10;
}

// ─── 12. Genre Overlap for Opening Acts ─────────────────────────

/**
 * Computes how much two artists' genres overlap.
 * Used for opening act crossover calculations.
 */
export function computeGenreOverlap(
  headlinerGenre: string | null | undefined,
  openerGenre: string | null | undefined,
  cityGenreWeights: CityGenreWeights,
): number {
  if (!headlinerGenre || !openerGenre) return 0.3; // Unknown = moderate overlap

  if (headlinerGenre === openerGenre) return 1.0;

  // Both in the city's scene = moderate overlap
  const headlinerWeight = cityGenreWeights[headlinerGenre] ?? 0;
  const openerWeight = cityGenreWeights[openerGenre] ?? 0;

  if (headlinerWeight > 0.3 && openerWeight > 0.3) return 0.6;
  if (headlinerWeight > 0 && openerWeight > 0) return 0.4;

  return 0.2;
}

// ─── 13. Trending Genre Rotation ────────────────────────────────

/**
 * Determines if a city's trending genre should rotate.
 * Called every turn; rotation happens roughly every 30 turns.
 */
export function shouldRotateTrendingGenre(
  turnsSinceLastRotation: number,
  rngValue: number, // 0-1, from seeded RNG
): boolean {
  if (turnsSinceLastRotation < 20) return false;
  // Increasing probability after turn 20, guaranteed by turn 40
  const chance = clamp((turnsSinceLastRotation - 20) / 20, 0, 1);
  return rngValue < chance;
}

/**
 * Picks the next trending genre from a city's genre weights.
 * Avoids repeating the current trending genre.
 */
export function pickNextTrendingGenre(
  genreWeights: CityGenreWeights,
  currentTrending: string | null | undefined,
  rngValue: number, // 0-1
): string {
  const genres = Object.entries(genreWeights)
    .filter(([genre]) => genre !== currentTrending)
    .sort((a, b) => b[1] - a[1]);

  if (genres.length === 0) return currentTrending || 'Pop';

  // Weighted random selection
  const totalWeight = genres.reduce((sum, [, w]) => sum + w, 0);
  let pick = rngValue * totalWeight;
  for (const [genre, weight] of genres) {
    pick -= weight;
    if (pick <= 0) return genre;
  }

  return genres[0][0];
}

// ─── 14. Underground Event Risk/Vibe Helpers ───────────────────

/**
 * Computes a normalized vibe score (0-100) for an underground show context.
 */
export function computeShowVibeScore(params: {
  artistClout: number;
  artistHype: number;
  undergroundVibe: number; // 0-1
  promotionBoostPct?: number; // 0-1
}): number {
  const { artistClout, artistHype, undergroundVibe, promotionBoostPct = 0 } = params;

  const cloutNorm = clamp(artistClout / 100, 0, 1);
  const hypeNorm = clamp(artistHype / 100, 0, 1);
  const promoNorm = clamp(promotionBoostPct, 0, 0.5) * 2;
  const undergroundNorm = clamp(undergroundVibe, 0, 1);

  const weighted =
    cloutNorm * 0.35 +
    hypeNorm * 0.25 +
    undergroundNorm * 0.30 +
    promoNorm * 0.10;

  return Math.round(clamp(weighted * 100, 10, 100));
}

/**
 * Computes detection risk for an underground show (0-1).
 * Higher city tolerance and stronger permits reduce risk.
 */
export function computeUndergroundDetectionRisk(params: {
  baseRisk: number; // 0-1
  cityTolerance: number; // 0-1
  permitTier?: 'none' | 'basic' | 'standard' | 'premium';
  heatLevel?: number; // 0-1 derived from hype/publicity
  promoIntensity?: number; // 0-1
}): number {
  const {
    baseRisk,
    cityTolerance,
    permitTier = 'none',
    heatLevel = 0,
    promoIntensity = 0,
  } = params;

  const permitMitigationMap: Record<string, number> = {
    none: 0,
    basic: 0.08,
    standard: 0.15,
    premium: 0.24,
  };

  const toleranceMitigation = clamp(cityTolerance, 0, 1) * 0.25;
  const permitMitigation = permitMitigationMap[permitTier] ?? 0;
  const heatPressure = clamp(heatLevel, 0, 1) * 0.20;
  const promoPressure = clamp(promoIntensity, 0, 1) * 0.18;

  const rawRisk = baseRisk + heatPressure + promoPressure - toleranceMitigation - permitMitigation;
  return clamp(rawRisk, 0.02, 0.95);
}

/**
 * Produces a deterministic text seed for raid aftermath/news copy generation.
 */
export function composeRaidNarrativeSeed(params: {
  eventName: string;
  cityName: string;
  vibeScore: number;
  detectionRisk: number;
}): string {
  const { eventName, cityName, vibeScore, detectionRisk } = params;
  const riskPct = Math.round(clamp(detectionRisk, 0, 1) * 100);
  return `${eventName}|${cityName}|vibe:${vibeScore}|risk:${riskPct}`;
}
