/**
 * Fan Sentiment Engine
 * ─────────────────────
 * Manages per-archetype sentiment, fan war lifecycle, fanbase nicknames,
 * and archetype-aware comment generation for live streams.
 *
 * Archetypes: critics_adjacent, nostalgia_seekers, trend_chasers, underground_purists
 * Sentiment: 0-100 per archetype (50 = neutral, <30 = hostile, >70 = enthusiastic)
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { invokeLLM } from './lib/invokeLLM.ts';

function N(v: unknown): number { return Number(v) || 0; }

export const DEFAULT_LEGACY_ARCHETYPE_SENTIMENT = {
  critics_adjacent: 50,
  nostalgia_seekers: 50,
  trend_chasers: 50,
  underground_purists: 50,
};

const LEGACY_ARCHETYPE_NAMES: Record<string, string> = {
  critics_adjacent: 'Critics Adjacent',
  nostalgia_seekers: 'Nostalgia Seekers',
  trend_chasers: 'Trend Chasers',
  underground_purists: 'Underground Purists',
};

export function deriveLegacyArchetypeDistribution(fanProfile: any): Record<string, number> {
  const weights = fanProfile?.archetypes || {};
  const casuals = Math.max(0, N(weights.casuals));
  const stans = Math.max(0, N(weights.stans));
  const locals = Math.max(0, N(weights.locals));
  const critics = Math.max(0, N(weights.critics));
  const playlistHeads = Math.max(0, N(weights.playlist_heads));

  const mapped = {
    critics_adjacent: locals + critics,
    nostalgia_seekers: casuals,
    trend_chasers: playlistHeads,
    underground_purists: stans,
  };
  const total = Object.values(mapped).reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return {
      critics_adjacent: 25,
      nostalgia_seekers: 25,
      trend_chasers: 25,
      underground_purists: 25,
    };
  }

  return mapped;
}

/**
 * @deprecated Segment sentiments are now the primary system
 */
export function deriveLegacyArchetypeSentiments(fanProfile: any): Record<string, number> {
  const overall = Math.max(0, Math.min(100, N(fanProfile?.overall_sentiment) || 50));
  return {
    critics_adjacent: overall,
    nostalgia_seekers: overall,
    trend_chasers: overall,
    underground_purists: overall,
  };
}

export const REDUCED_SENTIMENT_ARCHETYPE_DISTRIBUTION: Record<string, number> = {
  critics_adjacent: 25,
  nostalgia_seekers: 25,
  trend_chasers: 25,
  underground_purists: 25,
};

function computeWeightedOverallSentiment(
  sentiments: Record<string, number>,
  archetypeDistribution: Record<string, number>
): number {
  const totalFans = Object.values(archetypeDistribution).reduce((sum, value) => sum + N(value), 0);
  let weightedSum = 0;

  Object.entries(sentiments).forEach(([archetype, sentiment]) => {
    weightedSum += N(sentiment) * (N(archetypeDistribution[archetype]) / Math.max(1, totalFans));
  });

  return Math.round(weightedSum);
}

/**
 * @deprecated Use segment sentiments directly
 */
export function buildReducedSentimentContext(overallSentiment: unknown): {
  overall: number;
  sentiments: Record<string, number>;
  archetypes: Record<string, number>;
} {
  const overall = Math.max(0, Math.min(100, N(overallSentiment) || 50));
  const sentiments = Object.keys(REDUCED_SENTIMENT_ARCHETYPE_DISTRIBUTION).reduce<Record<string, number>>((acc, archetype) => {
    acc[archetype] = overall;
    return acc;
  }, {});

  return {
    overall,
    sentiments,
    archetypes: { ...REDUCED_SENTIMENT_ARCHETYPE_DISTRIBUTION },
  };
}

/**
 * @deprecated Segment sentiment events handled by fandomSegmentsSentimentModule
 */
export function applyReducedSentimentEvent(
  overallSentiment: unknown,
  eventType: string,
  eventData: any
): { sentiments: Record<string, number>; overall: number; archetypes: Record<string, number> } {
  const context = buildReducedSentimentContext(overallSentiment);
  const updated = updateArchetypeSentiments(
    context.sentiments,
    eventType,
    eventData,
    context.archetypes
  );

  return {
    sentiments: updated.sentiments,
    overall: updated.overall,
    archetypes: context.archetypes,
  };
}

/**
 * @deprecated Use generateSegmentComments in liveStreamHandler
 */
export function generateReducedSentimentComments(
  overallSentiment: unknown,
  streamChoice: string,
  peakViewers: number,
  artistName: string
) {
  const context = buildReducedSentimentContext(overallSentiment);
  return generateArchetypeComments(
    context.sentiments,
    context.archetypes,
    streamChoice,
    peakViewers,
    artistName
  );
}

export function applyReducedFanWarIntervention(
  intervention: any,
  fanWar: any,
  overallSentiment: unknown
): ReturnType<typeof applyFanWarIntervention> & {
  sentiments: Record<string, number>;
  overall: number;
  archetypes: Record<string, number>;
} {
  const context = buildReducedSentimentContext(overallSentiment);
  const result = applyFanWarIntervention(
    intervention,
    fanWar,
    context.sentiments,
    context.archetypes
  );
  const sentiments = { ...context.sentiments };

  Object.entries(result.sentimentDeltas).forEach(([archetype, delta]) => {
    sentiments[archetype] = Math.max(0, Math.min(100, N(sentiments[archetype]) + N(delta)));
  });

  return {
    ...result,
    sentiments,
    overall: computeWeightedOverallSentiment(sentiments, context.archetypes),
    archetypes: context.archetypes,
  };
}

// ─── ARCHETYPE BEHAVIOR CONFIG ───
// Each archetype has triggers that raise or lower their sentiment
/**
 * @deprecated Use SEGMENT_SENTIMENT_TRIGGERS from segmentSentimentTriggers.ts
 */
export const ARCHETYPE_TRIGGERS = {
  critics_adjacent: {
    positive: ['high_quality_release', 'critical_acclaim', 'deep_dive_content', 'acoustic_performance', 'collab_with_respected'],
    negative: ['low_quality_release', 'sellout_move', 'trashy_media_appearance', 'excessive_marketing', 'controversy_without_substance'],
    neutral_tolerance: 0.6, // How much they tolerate neutral events
    controversy_sensitivity: 0.7, // How much controversy affects them
    era_preferences: { // Sentiment modifier by era focus_path
      'artistic': 1.3, 'commercial': 0.6, 'experimental': 1.2, 'rebellious': 0.8
    },
    comment_templates: {
      positive: [
        "The production quality on this is genuinely impressive.",
        "Finally, an artist who respects the craft. 🎵",
        "This is what music should sound like. Masterclass.",
        "Sonically ambitious. The arrangement is chef's kiss.",
        "Been following since day one — this validates everything."
      ],
      negative: [
        "Used to be raw, now it's too polished for the wrong reasons.",
        "This feels like a boardroom decision, not an artistic one.",
        "The lyrical depth feels underdeveloped compared to earlier work.",
        "Disappointing. Expected more substance, got more style.",
        "Selling out isn't a strategy, it's a surrender."
      ],
      neutral: [
        "Interesting direction. Need to hear more before I judge.",
        "Solid but not groundbreaking. The potential is there.",
        "Decent effort. The B-sides might be stronger honestly.",
        "Not their best, not their worst. Consistent at least."
      ]
    }
  },
  nostalgia_seekers: {
    positive: ['callback_to_classics', 'legacy_content', 'anniversary_release', 'acoustic_performance', 'storytime_content'],
    negative: ['drastic_style_change', 'abandoning_roots', 'trend_chasing', 'disrespecting_legacy', 'era_fatigue'],
    neutral_tolerance: 0.8,
    controversy_sensitivity: 0.4,
    era_preferences: {
      'artistic': 1.1, 'commercial': 0.8, 'experimental': 0.5, 'rebellious': 0.7
    },
    comment_templates: {
      positive: [
        "This reminds me of the old days! 😭🔥",
        "THEY'RE BACK. This is the sound we fell in love with.",
        "Goosebumps. This is why we've been here since the start.",
        "The OG fans eating GOOD tonight 🍽️",
        "This is the evolution we wanted. Growth without losing the soul."
      ],
      negative: [
        "What happened to the old sound? This isn't what we signed up for.",
        "I miss the era when the music actually meant something.",
        "Day 1 fan here... this ain't it. Where's the authenticity?",
        "They changed too much. The magic is gone.",
        "Unfollowing. This isn't the artist I fell in love with."
      ],
      neutral: [
        "It's okay but I keep going back to the older stuff.",
        "Growing pains maybe? Hope the next one hits different.",
        "Not bad, just... different. Takes time to adjust.",
        "The chorus is catchy but the verses feel rushed."
      ]
    }
  },
  trend_chasers: {
    positive: ['viral_moment', 'trending_collab', 'hype_release', 'social_media_buzz', 'challenge_content'],
    negative: ['boring_content', 'no_social_presence', 'outdated_sound', 'low_engagement', 'failed_trend'],
    neutral_tolerance: 0.3, // Very impatient
    controversy_sensitivity: 0.2, // Actually enjoy drama
    era_preferences: {
      'artistic': 0.6, 'commercial': 1.4, 'experimental': 0.7, 'rebellious': 1.3
    },
    comment_templates: {
      positive: [
        "This is FIRE! 🔥🔥🔥 #ArtistXLive",
        "VIRAL INCOMING 📈 everyone needs to hear this",
        "The algorithm is about to EAT this up omg",
        "Literally obsessed rn. This is THE moment.",
        "POV: you're witnessing a cultural reset 💅"
      ],
      negative: [
        "Kinda mid ngl... expected more from the hype",
        "This isn't giving what it was supposed to give 💀",
        "Already moved on tbh. Next.",
        "The vibe is off. Giving 2022 energy in 2026.",
        "Ratio + fell off + mid + L take"
      ],
      neutral: [
        "It's a vibe but is it THE vibe? Jury's still out.",
        "Decent but won't make my playlist. Maybe the remix?",
        "6/10. Catchy but forgettable.",
        "It's okay I guess. TikTok will decide."
      ]
    }
  },
  underground_purists: {
    positive: ['authentic_content', 'independent_move', 'raw_performance', 'community_engagement', 'anti_mainstream'],
    negative: ['mainstream_sellout', 'corporate_collab', 'overproduced_content', 'clout_chasing', 'fake_controversy'],
    neutral_tolerance: 0.5,
    controversy_sensitivity: 0.8, // Very sensitive to inauthenticity
    era_preferences: {
      'artistic': 1.2, 'commercial': 0.3, 'experimental': 1.4, 'rebellious': 1.5
    },
    comment_templates: {
      positive: [
        "THIS is what real music sounds like. No cap.",
        "Underground forever 🖤 they kept it 100",
        "Respect for staying true. The industry needs more of this.",
        "Raw, unfiltered, authentic. Everything music should be.",
        "They didn't sell out. They leveled up. There's a difference."
      ],
      negative: [
        "Sold out. Another one bites the dust.",
        "Corporate puppet energy. Where's the real artist?",
        "This is what happens when labels get involved. RIP authenticity.",
        "Used to rep the underground. Now they're just another product.",
        "Mainstream garbage. The old fans see right through this."
      ],
      neutral: [
        "Hmm. Not sure about this direction but I'll give it a chance.",
        "The intent is there but the execution feels compromised.",
        "Better than most mainstream stuff at least.",
        "Interesting. Not underground enough for me but I respect the effort."
      ]
    }
  }
};

// ─── FANBASE NICKNAME GENERATION ───
const NICKNAME_TEMPLATES = {
  era_based: [
    '{era}ers', '{era} Nation', '{era} Gang', 'The {era} Collective',
    '{era} Army', '{era} Tribe', '{era} Crew', 'Team {era}'
  ],
  artist_based: [
    '{artist}ites', '{artist} Nation', '{artist} Army', '{artist} Gang',
    'The {artist} Fam', '{artist} Stans', '{artist} Hive'
  ],
  theme_based: [
    'Dreamers', 'Night Owls', 'Rebels', 'Visionaries', 'The Underground',
    'Neon Knights', 'Sound Seekers', 'Frequency Riders', 'Wave Runners',
    'The Collective', 'Midnight Society', 'Echo Chamber', 'The Movement'
  ]
};

/**
 * Generate nickname suggestions based on era, artist name, and trending content
 */
export function generateNicknameSuggestions(
  artistName: string,
  eraName: string | null,
  trendingHashtags: string[] = []
): string[] {
  const suggestions: string[] = [];
  const shortArtist = artistName.split(' ')[0]; // First word of artist name

  // Era-based suggestions
  if (eraName) {
    const shortEra = eraName.split(' ')[0];
    NICKNAME_TEMPLATES.era_based.forEach(t => {
      suggestions.push(t.replace('{era}', shortEra));
    });
  }

  // Artist-based suggestions
  NICKNAME_TEMPLATES.artist_based.forEach(t => {
    suggestions.push(t.replace('{artist}', shortArtist));
  });

  // Theme-based (random selection)
  const shuffled = [...NICKNAME_TEMPLATES.theme_based].sort(() => Math.random() - 0.5);
  suggestions.push(...shuffled.slice(0, 4));

  // Hashtag-based if available
  trendingHashtags.slice(0, 2).forEach(tag => {
    const clean = tag.replace('#', '').replace(/[^a-zA-Z]/g, '');
    if (clean.length > 2) {
      suggestions.push(`The ${clean}s`);
      suggestions.push(`${clean} Nation`);
    }
  });

  // Deduplicate and return max 8
  return [...new Set(suggestions)].slice(0, 8);
}

// ─── SENTIMENT CALCULATION ───

/**
 * Calculate sentiment delta for a specific archetype based on an event
 */
export function calculateSentimentDelta(
  archetype: string,
  eventType: string,
  eventData: {
    quality?: number;       // 0-100
    hype?: number;          // 0-100
    clout?: number;         // 0-5000
    isControversial?: boolean;
    isMainstream?: boolean;
    isAuthentic?: boolean;
    eraFocusPath?: string;
    intensity?: number;     // 0-100 for how strong the event is
  }
): number {
  const config = (ARCHETYPE_TRIGGERS as any)[archetype];
  if (!config) return 0;

  const intensity = (eventData.intensity || 50) / 100;
  let delta = 0;

  // Check if event matches positive/negative triggers
  if (config.positive.includes(eventType)) {
    delta = Math.floor(5 + intensity * 15); // +5 to +20
  } else if (config.negative.includes(eventType)) {
    delta = -Math.floor(5 + intensity * 15); // -5 to -20
  } else {
    // Neutral event — small drift toward 50
    delta = 0;
  }

  // Era preference modifier
  if (eventData.eraFocusPath && config.era_preferences[eventData.eraFocusPath]) {
    delta = Math.floor(delta * config.era_preferences[eventData.eraFocusPath]);
  }

  // Controversy modifier
  if (eventData.isControversial) {
    delta -= Math.floor(config.controversy_sensitivity * 10 * intensity);
    // But trend_chasers might enjoy it
    if (archetype === 'trend_chasers') {
      delta += Math.floor(8 * intensity); // Controversy = engagement for them
    }
  }

  // Mainstream modifier
  if (eventData.isMainstream) {
    if (archetype === 'underground_purists') delta -= Math.floor(8 * intensity);
    if (archetype === 'trend_chasers') delta += Math.floor(5 * intensity);
  }

  // Authenticity modifier
  if (eventData.isAuthentic) {
    if (archetype === 'underground_purists') delta += Math.floor(8 * intensity);
    if (archetype === 'critics_adjacent') delta += Math.floor(4 * intensity);
  }

  return delta;
}

/**
 * Update all archetype sentiments for a player based on an event
 * Returns the new sentiment map and overall sentiment
 * @deprecated Segment sentiments are updated by fandomSegmentsSentimentModule
 */
export function updateArchetypeSentiments(
  currentSentiment: Record<string, number>,
  eventType: string,
  eventData: any,
  archetypeDistribution: Record<string, number>
): { sentiments: Record<string, number>; overall: number } {
  const sentiments = { ...currentSentiment };
  const defaultSentiment = DEFAULT_LEGACY_ARCHETYPE_SENTIMENT;

  // Fill in defaults
  Object.keys(defaultSentiment).forEach(k => {
    if (sentiments[k] === undefined) sentiments[k] = (defaultSentiment as any)[k];
  });

  // Apply deltas
  Object.keys(sentiments).forEach(archetype => {
    const delta = calculateSentimentDelta(archetype, eventType, eventData);
    sentiments[archetype] = Math.max(0, Math.min(100, sentiments[archetype] + delta));
  });

  // Calculate weighted overall sentiment
  const dist = archetypeDistribution || defaultSentiment;
  const totalFans = Object.values(dist).reduce((s, v) => s + (v || 0), 0);
  let weightedSum = 0;
  Object.entries(sentiments).forEach(([arch, sent]) => {
    const weight = (dist[arch] || 0) / Math.max(1, totalFans);
    weightedSum += sent * weight;
  });

  return {
    sentiments,
    overall: Math.round(weightedSum)
  };
}

// ─── LIVE STREAM ARCHETYPE COMMENTS ───

/**
 * Generate archetype-aware comments for a live stream
 * Returns comments grouped by archetype with sentiment coloring
 */
export function generateArchetypeComments(
  sentiments: Record<string, number>,
  archetypeDistribution: Record<string, number>,
  streamChoice: string,
  peakViewers: number,
  artistName: string
): Array<{
  archetype: string;
  archetypeName: string;
  message: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  weight: number;
}> {
  const comments: Array<any> = [];
  const totalFans = Object.values(archetypeDistribution || {}).reduce((s, v) => s + (v || 0), 0);
  if (totalFans === 0) return comments;

  // Map stream choices to archetype reactions
  const choiceReactions: Record<string, Record<string, 'positive' | 'negative' | 'neutral'>> = {
    tease_music: {
      critics_adjacent: 'positive', nostalgia_seekers: 'positive',
      trend_chasers: 'positive', underground_purists: 'neutral'
    },
    chat: {
      critics_adjacent: 'neutral', nostalgia_seekers: 'positive',
      trend_chasers: 'neutral', underground_purists: 'positive'
    },
    updates: {
      critics_adjacent: 'neutral', nostalgia_seekers: 'neutral',
      trend_chasers: 'negative', underground_purists: 'neutral'
    },
    acoustic: {
      critics_adjacent: 'positive', nostalgia_seekers: 'positive',
      trend_chasers: 'neutral', underground_purists: 'positive'
    },
    collab: {
      critics_adjacent: 'neutral', nostalgia_seekers: 'neutral',
      trend_chasers: 'positive', underground_purists: 'negative'
    }
  };

  const reactions = choiceReactions[streamChoice] || {};

  Object.entries(archetypeDistribution).forEach(([archetype, count]) => {
    if (!count || count <= 0) return;
    const config = (ARCHETYPE_TRIGGERS as any)[archetype];
    if (!config) return;

    const sentiment = sentiments[archetype] || 50;
    const weight = count / totalFans;

    // Determine comment sentiment: combine archetype sentiment + stream choice reaction
    let commentSentiment: 'positive' | 'negative' | 'neutral' = reactions[archetype] || 'neutral';

    // Override based on extreme sentiment
    if (sentiment < 25) commentSentiment = 'negative';
    else if (sentiment > 75) commentSentiment = 'positive';

    // Number of comments proportional to archetype size (1-3 per archetype)
    const numComments = Math.max(1, Math.min(3, Math.ceil(weight * 5)));

    const pool = config.comment_templates[commentSentiment];
    for (let i = 0; i < numComments; i++) {
      const template = pool[Math.floor(Math.random() * pool.length)];
      comments.push({
        archetype,
        archetypeName: LEGACY_ARCHETYPE_NAMES[archetype] || archetype,
        message: template.replace(/ArtistX/g, artistName),
        sentiment: commentSentiment,
        weight
      });
    }
  });

  // Shuffle and limit
  return comments.sort(() => Math.random() - 0.5).slice(0, 12);
}

// ─── FAN WAR SYSTEM ───

/**
 * Check if conditions are met for an organic fan war to trigger
 * @deprecated Use shouldTriggerFanWarFromSegments from fanWarTickModule.ts
 */
export function shouldTriggerFanWar(
  sentiments: Record<string, number>,
  archetypeDistribution: Record<string, number>,
  hype: number,
  clout: number,
  recentControversy: boolean
): { shouldTrigger: boolean; primaryArchetypes: string[]; intensity: number; reason: string } {
  const totalFans = Object.values(archetypeDistribution || {}).reduce((s, v) => s + (v || 0), 0);
  if (totalFans < 50) return { shouldTrigger: false, primaryArchetypes: [], intensity: 0, reason: '' };

  // Find archetypes with extreme sentiment divergence
  const sentimentValues = Object.entries(sentiments || {}).map(([k, v]) => ({ archetype: k, sentiment: v }));
  const hostile = sentimentValues.filter(s => s.sentiment < 25);
  const enthusiastic = sentimentValues.filter(s => s.sentiment > 75);

  // Fan war triggers when there's a strong split: some love, some hate
  if (hostile.length >= 1 && enthusiastic.length >= 1) {
    const divergence = Math.max(...enthusiastic.map(e => e.sentiment)) - Math.min(...hostile.map(h => h.sentiment));
    if (divergence > 50) {
      const intensity = Math.min(80, Math.floor(divergence * 0.8 + (recentControversy ? 20 : 0)));
      return {
        shouldTrigger: true,
        primaryArchetypes: [...hostile.map(h => h.archetype), ...enthusiastic.map(e => e.archetype)],
        intensity,
        reason: `Sentiment divergence (${divergence}) between ${hostile[0].archetype} and ${enthusiastic[0].archetype}`
      };
    }
  }

  // High clout + recent controversy = target for fan war
  if (clout > 500 && recentControversy && hype > 50) {
    return {
      shouldTrigger: Math.random() < 0.3, // 30% chance
      primaryArchetypes: hostile.map(h => h.archetype),
      intensity: Math.min(60, Math.floor(clout / 20 + hype / 3)),
      reason: 'High-profile controversy target'
    };
  }

  return { shouldTrigger: false, primaryArchetypes: [], intensity: 0, reason: '' };
}

/**
 * Generate fan war social posts (NPC content across platforms)
 */
export function generateFanWarPosts(
  artistId: string,
  artistName: string,
  rivalName: string | null,
  intensity: number,
  primaryArchetypes: string[]
): Array<{
  platform: string;
  title: string;
  caption: string;
  post_type: string;
  metadata: any;
}> {
  const posts: Array<any> = [];
  const numPosts = Math.min(6, Math.max(2, Math.floor(intensity / 15)));

  const xpressPosts = [
    { title: '', caption: `${artistName} fans are FIGHTING in the comments rn 💀`, sentiment: 'heated' },
    { title: '', caption: `Not the ${artistName} stans starting a whole war on the TL 😭`, sentiment: 'amused' },
    { title: '', caption: `${artistName} needs to address this. The fanbase is SPLIT.`, sentiment: 'concerned' },
    { title: '', caption: `Unpopular opinion: ${artistName} fell off and the real fans know it`, sentiment: 'negative' },
    { title: '', caption: `Y'all are delusional if you think ${artistName} isn't the best rn 🔥`, sentiment: 'defensive' },
    { title: '', caption: `The ${artistName} discourse is exhausting. Can we just enjoy the music?`, sentiment: 'tired' },
    { title: '', caption: `${rivalName || 'Other artists'} fans trying to start beef with ${artistName} stans again 🙄`, sentiment: 'rivalry' },
    { title: '', caption: `${artistName} really has the most toxic AND the most loyal fanbase simultaneously`, sentiment: 'observation' },
  ];

  const vidwavePosts = [
    { title: `Why ${artistName}'s Fanbase is at WAR (Full Breakdown)`, caption: 'The drama explained', post_type: 'video' },
    { title: `${artistName} Fan War: Who's RIGHT? (Hot Take)`, caption: 'Both sides have a point...', post_type: 'video' },
    { title: `The ${artistName} Situation is WORSE Than You Think`, caption: 'Clickbait but make it real', post_type: 'video' },
  ];

  const looptokPosts = [
    { title: `POV: You're a ${artistName} fan checking the timeline`, caption: '💀💀💀', post_type: 'short' },
    { title: `${artistName} stans vs haters compilation`, caption: 'The comments are WILD', post_type: 'short' },
    { title: `When ${artistName} drops and the fanbase splits`, caption: 'Every. Single. Time.', post_type: 'short' },
  ];

  // Distribute across platforms based on intensity
  for (let i = 0; i < numPosts; i++) {
    const roll = Math.random();
    if (roll < 0.5) {
      // Xpress post
      const p = xpressPosts[Math.floor(Math.random() * xpressPosts.length)];
      posts.push({
        platform: 'xpress',
        title: p.title,
        caption: p.caption,
        post_type: 'text',
        metadata: {
          is_fan_war: true, is_npc: true,
          fan_war_sentiment: p.sentiment,
          artist_name: artistName,
          primary_archetypes: primaryArchetypes,
          intensity
        }
      });
    } else if (roll < 0.8) {
      // VidWave drama video
      const p = vidwavePosts[Math.floor(Math.random() * vidwavePosts.length)];
      posts.push({
        platform: 'vidwave',
        title: p.title,
        caption: p.caption,
        post_type: p.post_type,
        metadata: {
          is_fan_war: true, is_npc: true, is_trashy_media: true,
          video_type: 'fan_war_coverage',
          artist_name: artistName,
          primary_archetypes: primaryArchetypes,
          intensity
        }
      });
    } else {
      // LoopTok clip
      const p = looptokPosts[Math.floor(Math.random() * looptokPosts.length)];
      posts.push({
        platform: 'looptok',
        title: p.title,
        caption: p.caption,
        post_type: p.post_type,
        metadata: {
          is_fan_war: true, is_npc: true,
          video_type: 'fan_war_clip',
          artist_name: artistName,
          primary_archetypes: primaryArchetypes,
          intensity
        }
      });
    }
  }

  return posts;
}

/**
 * Generate fan war news items using AI
 */
export async function generateFanWarNews(
  artistName: string,
  rivalName: string | null,
  intensity: number,
  reason: string
): Promise<Array<{
  headline: string;
  body: string;
  category: string;
  sentiment: string;
  impact_score: number;
  source: string;
}>> {
  const news: Array<any> = [];

  const sources = ['TMZ Music', 'Complex', 'Pitchfork', 'HotNewHipHop', 'The Shade Room', 'XXL Mag'];

  // 1-2 news items based on intensity
  const numNews = intensity > 50 ? 2 : 1;
  
  for (let i = 0; i < numNews; i++) {
    const prompt = `You are a music industry journalist writing for a digital music publication. Write a realistic news article about a fan war:

Artist: ${artistName}
Rival: ${rivalName || 'Internal fan conflict'}
Intensity: ${intensity}/100 (${intensity > 60 ? 'High intensity' : 'Medium intensity'})
Cause: ${reason}

Write a news article covering this fan war. Include:
1. A catchy, realistic headline (max 80 chars)
2. A news body (150-250 words) that covers the fan war details
3. Industry context about what this means for the artist
4. Quotes from "fans" or "industry insiders" (you can make these up)
5. Discussion of social media impact

Make it sound like a real music news article from sources like Complex, Pitchfork, or TMZ. The tone should be journalistic but engaging.`;

    try {
      const response = await invokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Catchy news headline (max 80 chars)" },
            body: { type: "string", description: "News article body (150-250 words, journalistic tone)" },
            category: { 
              type: "string", 
              enum: ["trending", "industry", "regional", "controversy", "entertainment"],
              description: "Article category"
            },
            tone: {
              type: "string",
              enum: ["sensational", "analytical", "critical", "neutral"],
              description: "Article tone"
            }
          },
          required: ["headline", "body", "category", "tone"]
        }
      });

      news.push({
        headline: response.headline,
        body: response.body,
        category: intensity > 60 ? 'controversy' : response.category,
        sentiment: intensity > 50 ? 'negative' : 'mixed',
        impact_score: -Math.floor(intensity / 5),
        source: sources[Math.floor(Math.random() * sources.length)]
      });
    } catch (error) {
      console.warn('[FanWarNews] AI generation failed, using fallback:', error);
      // Fallback to template
      const headlines = [
        `${artistName}'s Fanbase Erupts: Internal War Threatens Community`,
        `Fan Divide: ${artistName} Supporters Split Over Recent Direction`,
        `"We Want the Old ${artistName}": Fans Voice Frustration Online`,
        `${artistName} Fan War Goes Viral — Here's What Happened`,
      ];
      
      news.push({
        headline: headlines[Math.floor(Math.random() * headlines.length)],
        body: `The ongoing situation involving ${artistName}'s fanbase continues to generate discussion across social media platforms.`,
        category: intensity > 60 ? 'controversy' : 'entertainment',
        sentiment: intensity > 50 ? 'negative' : 'mixed',
        impact_score: -Math.floor(intensity / 5),
        source: sources[Math.floor(Math.random() * sources.length)]
      });
    }
  }

  return news;
}

// ─── PLAYER INTERVENTION ACTIONS ───

export const FAN_WAR_INTERVENTIONS = {
  calming: [
    {
      id: 'public_apology',
      label: 'Issue Public Apology',
      desc: 'Acknowledge the situation and apologize to fans',
      energyCost: 20, incomeCost: 0, cloutCost: 5,
      intensityReduction: 25, sentimentBoost: 10,
      risk: 'low',
      archetypeEffects: {
        critics_adjacent: 8, nostalgia_seekers: 12,
        trend_chasers: 3, underground_purists: 15
      }
    },
    {
      id: 'fan_qa',
      label: 'Host Fan Q&A',
      desc: 'Open dialogue with the community',
      energyCost: 30, incomeCost: 0, cloutCost: 0,
      intensityReduction: 15, sentimentBoost: 8,
      risk: 'medium',
      archetypeEffects: {
        critics_adjacent: 5, nostalgia_seekers: 10,
        trend_chasers: 6, underground_purists: 12
      }
    },
    {
      id: 'charity_donation',
      label: 'Charity Donation',
      desc: 'Donate income to redirect the narrative',
      energyCost: 10, incomeCost: 5000, cloutCost: 0,
      intensityReduction: 20, sentimentBoost: 12,
      risk: 'low',
      archetypeEffects: {
        critics_adjacent: 10, nostalgia_seekers: 8,
        trend_chasers: 5, underground_purists: 6
      }
    },
    {
      id: 'collab_with_rival',
      label: 'Collaborate with Rival',
      desc: 'Extend an olive branch through music',
      energyCost: 40, incomeCost: 0, cloutCost: 0,
      intensityReduction: 35, sentimentBoost: 15,
      risk: 'high',
      archetypeEffects: {
        critics_adjacent: 12, nostalgia_seekers: 5,
        trend_chasers: 15, underground_purists: -5
      }
    }
  ],
  fueling: [
    {
      id: 'subliminal_diss',
      label: 'Subliminal Diss Track',
      desc: 'Drop a track with veiled shots at haters',
      energyCost: 35, incomeCost: 0, cloutCost: 0,
      intensityIncrease: 20, hypeBoost: 15,
      risk: 'high',
      archetypeEffects: {
        critics_adjacent: -8, nostalgia_seekers: -5,
        trend_chasers: 20, underground_purists: 10
      }
    },
    {
      id: 'block_haters',
      label: 'Block & Dismiss Haters',
      desc: 'Publicly dismiss critics and block detractors',
      energyCost: 10, incomeCost: 0, cloutCost: 3,
      intensityIncrease: 10, hypeBoost: 5,
      risk: 'medium',
      archetypeEffects: {
        critics_adjacent: -15, nostalgia_seekers: -8,
        trend_chasers: 8, underground_purists: -10
      }
    },
    {
      id: 'controversial_statement',
      label: 'Double Down (Controversial Statement)',
      desc: 'Make a bold public statement defending your position',
      energyCost: 15, incomeCost: 0, cloutCost: 0,
      intensityIncrease: 30, hypeBoost: 25,
      risk: 'very_high',
      archetypeEffects: {
        critics_adjacent: -12, nostalgia_seekers: -10,
        trend_chasers: 25, underground_purists: 5
      }
    },
    {
      id: 'public_feud',
      label: 'Start Public Feud',
      desc: 'Directly call out a rival artist',
      energyCost: 25, incomeCost: 0, cloutCost: 0,
      intensityIncrease: 40, hypeBoost: 30,
      risk: 'extreme',
      archetypeEffects: {
        critics_adjacent: -20, nostalgia_seekers: -15,
        trend_chasers: 30, underground_purists: -5
      }
    }
  ]
};

/**
 * Apply a player intervention to an active fan war
 * Returns the effects to apply
 */
export function applyFanWarIntervention(
  intervention: any,
  fanWar: any,
  sentiments: Record<string, number>,
  archetypeDistribution: Record<string, number>
): {
  newIntensity: number;
  sentimentDeltas: Record<string, number>;
  hypeChange: number;
  cloutChange: number;
  incomeChange: number;
  newStatus: string;
  narrativeEvent: string;
} {
  const isCalming = FAN_WAR_INTERVENTIONS.calming.some(c => c.id === intervention.id);
  const isFueling = FAN_WAR_INTERVENTIONS.fueling.some(f => f.id === intervention.id);

  let newIntensity = fanWar.intensity;
  let hypeChange = 0;
  let cloutChange = -(intervention.cloutCost || 0);
  let incomeChange = -(intervention.incomeCost || 0);
  const sentimentDeltas: Record<string, number> = {};

  if (isCalming) {
    newIntensity = Math.max(0, newIntensity - (intervention.intensityReduction || 0));
    // Random variance: calming might not work perfectly
    const variance = Math.random() < 0.2 ? -10 : 0; // 20% chance it backfires slightly
    newIntensity = Math.max(0, newIntensity + variance);
  }

  if (isFueling) {
    newIntensity = Math.min(100, newIntensity + (intervention.intensityIncrease || 0));
    hypeChange = intervention.hypeBoost || 0;
    // Risk of backfire: higher risk = higher chance of clout loss
    const riskMap: Record<string, number> = { low: 0.05, medium: 0.15, high: 0.3, very_high: 0.45, extreme: 0.6 };
    const backfireChance = riskMap[intervention.risk] || 0.1;
    if (Math.random() < backfireChance) {
      cloutChange -= Math.floor(5 + Math.random() * 15);
      incomeChange -= Math.floor(500 + Math.random() * 2000); // Brands pull out
    }
  }

  // Apply archetype sentiment effects
  Object.entries(intervention.archetypeEffects || {}).forEach(([arch, effect]) => {
    sentimentDeltas[arch] = effect as number;
  });

  // Determine new status
  let newStatus = fanWar.status;
  if (newIntensity <= 10) newStatus = 'resolved';
  else if (newIntensity <= 30 && isCalming) newStatus = 'cooling';
  else if (newIntensity >= 80) newStatus = 'escalated';

  // Generate narrative
  let narrativeEvent = '';
  if (isCalming && newIntensity < fanWar.intensity) {
    narrativeEvent = `Your ${intervention.label.toLowerCase()} helped ease tensions. Fan war intensity dropped to ${newIntensity}.`;
  } else if (isFueling) {
    narrativeEvent = `Your ${intervention.label.toLowerCase()} ${newIntensity > fanWar.intensity ? 'escalated the situation' : 'had mixed results'}. Intensity: ${newIntensity}. ${hypeChange > 0 ? `+${hypeChange} hype.` : ''}`;
  }

  return {
    newIntensity,
    sentimentDeltas,
    hypeChange,
    cloutChange,
    incomeChange,
    newStatus,
    narrativeEvent
  };
}
