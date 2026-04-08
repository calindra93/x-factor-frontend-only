/**
 * SEGMENT SENTIMENT TRIGGERS — Per-Segment Event Reactions
 * ─────────────────────────────────────────────────────────
 * Pure logic layer. No DB access.
 *
 * Replaces the old ARCHETYPE_TRIGGERS from fanSentimentEngine.ts with
 * a full 6-segment variant: og | core | casual | trend_chaser | stan | critic
 *
 * Each segment has:
 * - Positive/negative event triggers
 * - Era focus path preferences (multipliers)
 * - Controversy sensitivity (negative = defend)
 * - Comment templates for UI/NPC generation
 */

import type { SegmentType } from './fandomSegmentsEngine.ts';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface SegmentSentimentConfig {
  /** Event types that boost sentiment (e.g., 'high_quality_release') */
  positive: string[];
  /** Event types that reduce sentiment (e.g., 'sellout_move') */
  negative: string[];
  /** 0-1: tolerance for neutral/uneventful turns before sentiment drifts */
  neutral_tolerance: number;
  /** -0.3 to 1.0: how controversy affects sentiment. Negative = they defend. */
  controversy_sensitivity: number;
  /** focus_path → multiplier (0.3-1.5). Applied to delta calculation. */
  era_preferences: Record<string, number>;
  /** persona_id → drift modifier (-2 to +2). Applied as passive per-turn sentiment drift. */
  persona_preferences: Record<string, number>;
  /** Templates for generating NPC/UI comments */
  comment_templates: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
}

export interface SentimentEventData {
  quality?: number;        // 0-100
  hype?: number;           // 0-100
  clout?: number;          // 0-5000
  isControversial?: boolean;
  isMainstream?: boolean;
  isAuthentic?: boolean;
  eraFocusPath?: string;   // e.g., 'ALBUM_AUTEUR', 'HIT_CHASE', 'DIGITAL_CULT', etc.
  intensity?: number;      // 0-100, defaults to 50
}

// ─── CANONICAL SEGMENT TYPES ─────────────────────────────────────────────────

/**
 * Canonical array of all 6 segment types for iteration.
 * Used by modules that need to process all segments uniformly.
 */
export const CANONICAL_FANDOM_SEGMENT_TYPES: SegmentType[] = [
  'og',
  'core',
  'casual',
  'trend_chaser',
  'stan',
  'critic',
];

// ─── SEGMENT SENTIMENT TRIGGERS ──────────────────────────────────────────────

export const SEGMENT_SENTIMENT_TRIGGERS: Record<SegmentType, SegmentSentimentConfig> = {
  og: {
    positive: ['callback_to_classics', 'consistent_direction', 'high_quality_release', 'authentic_content'],
    negative: ['drastic_style_change', 'abandoning_roots', 'sellout_move', 'trend_chasing'],
    neutral_tolerance: 0.8,
    controversy_sensitivity: 0.6,
    era_preferences: {
      // Artistic lanes: OGs love authenticity and roots
      ALBUM_AUTEUR: 1.3,        // Cohesive albums = peak OG satisfaction
      UNDERGROUND_LEGEND: 1.25, // Cult authenticity resonates deeply
      SCENE_DOMINANCE: 1.15,    // Local roots = respectable
      // Commercial lanes: OGs hate sellout moves
      HIT_CHASE: 0.6,           // Singles chasing = abandoning the craft
      BRAND_MOGUL: 0.55,        // Merch empire = sellout energy
      // Digital/community lanes: mixed feelings
      DIGITAL_CULT: 0.75,       // Social-first feels shallow to OGs
      TOUR_MONSTER: 1.1,        // Live shows = real artistry
      GLOBAL_EXPANSION: 0.9,    // International = diluting the sound
    },
    persona_preferences: {
      // OGs resonate with authenticity and roots, reject shallow virality
      street_authentic: 2,        // Peak OG alignment — real hip-hop energy
      nostalgic_boom_bap: 2,      // Golden era worship
      conscious_voice: 1,         // Substance matters
      producer_visionary: 1,      // Craft respect
      relatable_storyteller: 1,   // Genuine voice
      motivational_hustler: 0,    // Neutral
      luxury_hustler: -1,         // Flashy but not authentic
      femme_power: 0,             // Neutral
      aesthetic_curator: 0,       // Neutral
      party_club_catalyst: -1,    // Shallow party vibes
      viral_trendsetter: -2,      // Everything OGs hate
      internet_troll: -2,         // Disrespects the culture
    },
    comment_templates: {
      positive: [
        "Day 1 energy right here 🔥",
        "THIS is the artist we fell in love with",
        "OGs eating good tonight 🍽️",
      ],
      negative: [
        "What happened to the old sound? This isn't it.",
        "Day 1 fan here... this direction is not what we signed up for.",
        "They changed too much. The magic is gone.",
      ],
      neutral: [
        "I'll give it time but I miss the older vibe",
        "Growth is good but don't lose yourself",
      ],
    },
  },

  core: {
    positive: ['high_quality_release', 'consistent_content', 'community_engagement', 'legacy_content'],
    negative: ['abandoning_roots', 'no_content_streak', 'low_quality_release'],
    neutral_tolerance: 0.7,
    controversy_sensitivity: 0.5,
    era_preferences: {
      // Core fans value consistency and quality above all
      ALBUM_AUTEUR: 1.2,        // Albums = consistent vision
      UNDERGROUND_LEGEND: 1.1,  // Authentic direction
      SCENE_DOMINANCE: 1.05,    // Community roots
      HIT_CHASE: 0.85,          // Singles feel inconsistent
      BRAND_MOGUL: 0.8,         // Merch focus = distraction
      DIGITAL_CULT: 0.95,       // Online presence is fine
      TOUR_MONSTER: 1.15,       // Live shows = dedication
      GLOBAL_EXPANSION: 1.0,    // Neutral — growth is okay
    },
    persona_preferences: {
      // Core fans value consistency, quality, and sincerity
      relatable_storyteller: 2,   // Core fans love genuine connection
      conscious_voice: 1,         // Substance resonates
      producer_visionary: 1,      // Quality craft
      nostalgic_boom_bap: 1,      // Respects the legacy
      street_authentic: 1,        // Keeps it real
      motivational_hustler: 0,    // Neutral
      femme_power: 0,             // Neutral
      aesthetic_curator: 0,       // Style over substance — meh
      luxury_hustler: -1,         // Flashy distracts from music
      party_club_catalyst: -1,    // Not serious enough
      viral_trendsetter: -1,      // Chasing trends feels inconsistent
      internet_troll: -2,         // Disrespectful to the fanbase
    },
    comment_templates: {
      positive: [
        "Consistent as always, this is why we're here",
        "Quality never dips with this artist",
        "Core fans stay winning 💪",
      ],
      negative: [
        "Where's the consistency? This feels off-brand.",
        "Used to be reliable, now it's all over the place.",
      ],
      neutral: [
        "It's okay, not their best but not their worst",
        "Solid but expected more honestly",
      ],
    },
  },

  casual: {
    positive: ['viral_moment', 'hype_release', 'platform_spotlight', 'catchy_hook'],
    negative: ['boring_content', 'no_content_streak', 'outdated_sound'],
    neutral_tolerance: 0.4,
    controversy_sensitivity: 0.3,
    era_preferences: {
      // Casuals want hits and virality, not depth
      ALBUM_AUTEUR: 0.8,        // Albums are too deep for casuals
      UNDERGROUND_LEGEND: 0.7,  // Too niche, casuals bounce
      SCENE_DOMINANCE: 0.85,    // Local doesn't excite casuals
      HIT_CHASE: 1.3,           // Hit singles = casual paradise
      BRAND_MOGUL: 1.15,        // Brand collabs create buzz
      DIGITAL_CULT: 1.25,       // Viral content keeps casuals engaged
      TOUR_MONSTER: 0.9,        // Live shows are okay but not exciting
      GLOBAL_EXPANSION: 1.1,    // International hits = cool factor
    },
    persona_preferences: {
      // Casuals want fun, hype, and easy-to-consume content
      viral_trendsetter: 2,       // Casuals live for viral moments
      party_club_catalyst: 2,     // Good vibes = casual paradise
      luxury_hustler: 1,          // Aspirational content draws casuals
      internet_troll: 1,          // Drama is entertaining
      aesthetic_curator: 1,       // Pretty content = engagement
      motivational_hustler: 0,    // Neutral
      femme_power: 0,             // Neutral
      relatable_storyteller: 0,   // Nice but casuals don't go deep
      street_authentic: -1,       // Too niche for casuals
      nostalgic_boom_bap: -1,     // Old school bores casuals
      conscious_voice: -1,        // Too heavy for casual listening
      producer_visionary: -1,     // Too technical
    },
    comment_templates: {
      positive: [
        "This is actually fire 🔥",
        "Okay I might become a stan",
        "Vibes are immaculate",
      ],
      negative: [
        "Mid. Already moved on.",
        "This isn't hitting like I thought it would",
      ],
      neutral: [
        "It's a vibe but not playlist-worthy",
        "6/10, catchy but forgettable",
      ],
    },
  },

  trend_chaser: {
    positive: ['trending_collab', 'viral_moment', 'hype_release', 'challenge_content', 'social_media_buzz'],
    negative: ['boring_content', 'outdated_sound', 'low_engagement', 'failed_trend'],
    neutral_tolerance: 0.2,
    controversy_sensitivity: 0.1, // They LOVE drama
    era_preferences: {
      // Trend chasers want what's hot NOW
      ALBUM_AUTEUR: 0.6,        // Albums are slow and boring
      UNDERGROUND_LEGEND: 0.65,  // Underground = irrelevant to trends
      SCENE_DOMINANCE: 0.7,     // Local scenes aren't trending
      HIT_CHASE: 1.4,           // Chart hits = trend validation
      BRAND_MOGUL: 1.3,         // Brand collabs = clout
      DIGITAL_CULT: 1.35,       // Social virality = their world
      TOUR_MONSTER: 0.8,        // Live shows are offline, trend chasers are online
      GLOBAL_EXPANSION: 1.2,    // International buzz = trending content
    },
    persona_preferences: {
      // Trend chasers want whatever's hot, viral, and clout-worthy
      viral_trendsetter: 2,       // Perfect alignment — trend central
      internet_troll: 2,          // Chaos and drama = engagement
      party_club_catalyst: 1,     // Parties are always trending
      aesthetic_curator: 1,       // Aesthetic moments go viral
      luxury_hustler: 1,          // Flex culture = clout
      motivational_hustler: 0,    // Neutral
      femme_power: 0,             // Neutral
      relatable_storyteller: -1,  // Boring to trend chasers
      street_authentic: -1,       // Too underground
      conscious_voice: -2,        // Dead opposite of trend energy
      nostalgic_boom_bap: -2,     // Irrelevant to current trends
      producer_visionary: -1,     // Too niche
    },
    comment_templates: {
      positive: [
        "This is FIRE! 🔥🔥🔥 #Viral",
        "The algorithm is about to EAT this up",
        "POV: you're witnessing a cultural reset 💅",
      ],
      negative: [
        "Kinda mid ngl... expected more",
        "Ratio + fell off + mid",
        "This isn't giving what it was supposed to give 💀",
      ],
      neutral: [
        "Decent but won't make my playlist",
        "It's okay I guess. TikTok will decide.",
      ],
    },
  },

  stan: {
    positive: ['community_engagement', 'exclusive_content', 'personal_updates', 'deep_dive_content'],
    negative: ['disrespecting_fans', 'receipts_dropped', 'ignoring_community'],
    neutral_tolerance: 0.9, // Very forgiving
    controversy_sensitivity: -0.3, // Negative = they DEFEND during controversy
    era_preferences: {
      // Stans support almost everything — they're ride-or-die
      ALBUM_AUTEUR: 1.1,        // Albums give stans lore to obsess over
      UNDERGROUND_LEGEND: 1.2,  // Cult energy = stan paradise
      SCENE_DOMINANCE: 1.05,    // Community vibes
      HIT_CHASE: 1.1,           // Stans stream singles on repeat
      BRAND_MOGUL: 1.0,         // Neutral — merch is fine if artist is happy
      DIGITAL_CULT: 1.15,       // More content = more to defend
      TOUR_MONSTER: 1.1,        // Live shows = fan meetup opportunities
      GLOBAL_EXPANSION: 1.1,    // Stans want world domination for their fave
    },
    persona_preferences: {
      // Stans are ride-or-die — almost everything gets a pass
      relatable_storyteller: 2,   // Personal connection = stan fuel
      femme_power: 2,             // Empowerment rallies the standom
      aesthetic_curator: 1,       // Gives stans content to curate
      street_authentic: 1,        // Authenticity earns loyalty
      conscious_voice: 1,         // Depth gives stans lore to defend
      luxury_hustler: 1,          // Stans love their fave winning
      motivational_hustler: 1,    // Inspirational = stan rallying cry
      nostalgic_boom_bap: 0,      // Neutral
      producer_visionary: 0,      // Neutral
      viral_trendsetter: 0,       // Fine but shallow connection
      party_club_catalyst: 0,     // Neutral
      internet_troll: -1,         // Trolling can backfire on stans
    },
    comment_templates: {
      positive: [
        "WE RIDE AT DAWN 🗡️",
        "Y'all could never understand the vision",
        "Stan culture is alive and THRIVING",
      ],
      negative: [
        "How could you do this to US?",
        "We defended you and this is what we get?",
        "Receipts say otherwise. We're done.",
      ],
      neutral: [
        "Still supporting but...hm.",
        "It's fine, we've seen better from you",
      ],
    },
  },

  critic: {
    positive: ['high_quality_release', 'critical_acclaim', 'deep_dive_content', 'artistic_growth'],
    negative: ['low_quality_release', 'sellout_move', 'controversy_without_substance', 'excessive_marketing'],
    neutral_tolerance: 0.5,
    controversy_sensitivity: 0.8,
    era_preferences: {
      // Critics value artistry and experimentation, despise commercial pandering
      ALBUM_AUTEUR: 1.3,        // Critics' favorite — cohesive artistic vision
      UNDERGROUND_LEGEND: 1.25, // Raw authenticity impresses critics
      SCENE_DOMINANCE: 1.1,     // Scene credibility matters
      HIT_CHASE: 0.5,           // Empty hit-chasing = critical disdain
      BRAND_MOGUL: 0.45,        // Merch empire = the antithesis of art
      DIGITAL_CULT: 0.7,        // Social-first feels shallow to critics
      TOUR_MONSTER: 1.0,        // Live performance = neutral for critics
      GLOBAL_EXPANSION: 0.85,   // International expansion = dilution risk
    },
    persona_preferences: {
      // Critics value artistry, innovation, and substance over hype
      producer_visionary: 2,      // Technical mastery = critical respect
      conscious_voice: 2,         // Substance and depth = critic approved
      aesthetic_curator: 1,       // Artistic vision impresses
      nostalgic_boom_bap: 1,      // Respect for craft traditions
      street_authentic: 1,        // Raw authenticity has critical value
      relatable_storyteller: 0,   // Decent but not groundbreaking
      femme_power: 0,             // Neutral
      motivational_hustler: -1,   // Self-help vibes lack artistic depth
      luxury_hustler: -1,         // Materialistic, not artistic
      party_club_catalyst: -1,    // Vapid content
      viral_trendsetter: -2,      // Algorithm-chasing = antithesis of art
      internet_troll: -2,         // Zero artistic value
    },
    comment_templates: {
      positive: [
        "Genuinely impressed. The production is masterclass.",
        "This is what music should sound like.",
        "Sonically ambitious and it WORKS.",
      ],
      negative: [
        "This feels like a boardroom decision, not an artistic one.",
        "The lyrical depth is severely lacking.",
        "Selling out isn't a strategy, it's a surrender.",
      ],
      neutral: [
        "Interesting direction. Need more before I judge.",
        "Solid but not groundbreaking.",
      ],
    },
  },
};

// ─── SENTIMENT DELTA CALCULATION ─────────────────────────────────────────────

/**
 * Calculate the sentiment delta for a segment based on an event.
 *
 * @param segment - The segment type (og, core, casual, trend_chaser, stan, critic)
 * @param eventType - The event type string (e.g., 'high_quality_release', 'sellout_move')
 * @param eventData - Context for the event (quality, hype, era path, controversiality, etc.)
 * @returns Integer sentiment delta (positive or negative)
 */
export function calculateSegmentSentimentDelta(
  segment: SegmentType,
  eventType: string,
  eventData: SentimentEventData = {}
): number {
  const config = SEGMENT_SENTIMENT_TRIGGERS[segment];
  const intensity = (eventData.intensity ?? 50) / 100; // normalize to 0-1
  let delta = 0;

  // ─── BASE DELTA FROM TRIGGER MATCH ─────────────────────────────────────────
  if (config.positive.includes(eventType)) {
    delta = Math.floor(5 + intensity * 15); // +5 to +20
  } else if (config.negative.includes(eventType)) {
    delta = -Math.floor(5 + intensity * 15); // -5 to -20
  }

  // ─── ERA PREFERENCE MULTIPLIER ─────────────────────────────────────────────
  if (eventData.eraFocusPath && config.era_preferences[eventData.eraFocusPath] !== undefined) {
    delta = Math.floor(delta * config.era_preferences[eventData.eraFocusPath]);
  }

  // ─── CONTROVERSY MODIFIER ──────────────────────────────────────────────────
  // Positive sensitivity = sentiment tanks during controversy
  // Negative sensitivity (stans) = they defend, sentiment BOOSTS
  if (eventData.isControversial) {
    const controversyDelta = -Math.floor(config.controversy_sensitivity * 12 * intensity);
    // For stans (negative sensitivity), the double-negative flips to positive
    // controversyDelta = -Math.floor((-0.3) * 12 * intensity) = +floor(0.3 * 12 * intensity)
    delta += controversyDelta;
  }

  // ─── MAINSTREAM MODIFIER ───────────────────────────────────────────────────
  // og/critic hate mainstream content; trend_chaser/casual love it
  if (eventData.isMainstream) {
    if (segment === 'og' || segment === 'critic') {
      delta -= Math.floor(10 * intensity);
    }
    if (segment === 'trend_chaser' || segment === 'casual') {
      delta += Math.floor(8 * intensity);
    }
  }

  // ─── AUTHENTICITY MODIFIER ─────────────────────────────────────────────────
  // og/critic reward authenticity; stan also values it
  if (eventData.isAuthentic) {
    if (segment === 'og' || segment === 'critic') {
      delta += Math.floor(8 * intensity);
    }
    if (segment === 'stan') {
      delta += Math.floor(6 * intensity);
    }
  }

  return delta;
}

// ─── HELPER UTILITIES ────────────────────────────────────────────────────────

/**
 * Get a random comment template for a segment based on sentiment direction.
 * Useful for NPC post generation and live stream simulation.
 */
export function getRandomCommentTemplate(
  segment: SegmentType,
  direction: 'positive' | 'negative' | 'neutral'
): string {
  const templates = SEGMENT_SENTIMENT_TRIGGERS[segment].comment_templates[direction];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Check if an event type is a positive trigger for a segment.
 */
export function isPositiveTrigger(segment: SegmentType, eventType: string): boolean {
  return SEGMENT_SENTIMENT_TRIGGERS[segment].positive.includes(eventType);
}

/**
 * Check if an event type is a negative trigger for a segment.
 */
export function isNegativeTrigger(segment: SegmentType, eventType: string): boolean {
  return SEGMENT_SENTIMENT_TRIGGERS[segment].negative.includes(eventType);
}

/**
 * Get the era preference multiplier for a segment.
 * Returns 1.0 if the era isn't configured.
 */
export function getEraPreferenceMultiplier(segment: SegmentType, eraFocusPath: string): number {
  return SEGMENT_SENTIMENT_TRIGGERS[segment].era_preferences[eraFocusPath] ?? 1.0;
}

/**
 * Get the per-turn persona drift for a segment.
 * Returns an integer drift value (-2 to +2) representing how compatible a
 * marketing persona is with this fan segment.
 *
 * Positive = persona resonates with the segment (gradual sentiment boost).
 * Negative = persona clashes with the segment (gradual sentiment drain).
 * Zero = neutral (no persona-driven drift, only event-driven changes).
 *
 * @returns Integer in [-2, +2]. Returns 0 if persona is unknown.
 */
export function getPersonaDrift(segment: SegmentType, persona: string): number {
  return SEGMENT_SENTIMENT_TRIGGERS[segment].persona_preferences[persona] ?? 0;
}
