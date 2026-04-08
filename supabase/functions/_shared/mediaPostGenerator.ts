/**
 * MEDIA POST GENERATOR MODULE
 * Generates AI-driven social media posts from media platforms (Pop Crave, The Shade Room, etc.)
 * Uses Gemini API to create authentic-sounding posts based on in-game events
 */

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

// LLM invocation - uses Gemini API
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function invokeLLM(prompt: string): Promise<string> {
  // Check for forced rate limit in eventDetails (passed through context)
  if (prompt.includes('FORCE_RATE_LIMIT_TEST')) {
    console.warn('[MediaPostGenerator] Forced rate limit test - using fallback');
    return 'RATE_LIMITED_FALLBACK';
  }

  if (!GEMINI_API_KEY) {
    console.warn('[MediaPostGenerator] No GEMINI_API_KEY set — using fallback');
    return '';
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 300
      }
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    
    // Handle rate limiting (429) with graceful fallback - do NOT throw
    if (res.status === 429) {
      console.warn('[MediaPostGenerator] Gemini API rate limited, using fallback');
      return 'RATE_LIMITED_FALLBACK'; // Special string for fallback detection
    }
    
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Event types that trigger media posts
export type MediaEventType = 
  | 'new_release'
  | 'chart_entry'
  | 'certification'
  | 'tour_announcement'
  | 'tour_completion'
  | 'milestone_followers'
  | 'milestone_streams'
  | 'collaboration'
  | 'controversy'
  | 'comeback'
  | 'award'
  | 'viral_moment';

// Reporting style prompts for different platform personalities
const REPORTING_STYLE_PROMPTS: Record<string, string> = {
  viral_chaos: `You write in an extremely viral, attention-grabbing style. Use ALL CAPS for emphasis, dramatic language, and create urgency. Include trending hashtags. Your posts often go viral because of their dramatic presentation. Example: "🚨 BREAKING: [Artist] just BROKE THE INTERNET with..."`,
  
  fandoms: `You write for stan culture and fandoms. Use streaming numbers, chart positions, and statistics. Celebrate achievements with enthusiasm. Include fan-friendly hashtags and emojis. Example: "[Artist] has now surpassed 1 BILLION streams on Spotify! 🔥📈 #[ArtistName]Army"`,
  
  urban_gossip: `You write urban entertainment news with a conversational, real tone. Use slang appropriately, keep it authentic to hip-hop culture. Be direct and sometimes spicy with takes. Example: "Y'all... [Artist] really just dropped and it's giving everything we needed 🔥"`,
  
  music_centric: `You write professional music journalism. Focus on the artistic merit, production quality, and industry impact. Be informative but engaging. Example: "[Artist]'s new project showcases their evolution as an artist, blending [genres] in innovative ways."`,
  
  celebrity_news: `You write celebrity entertainment news. Focus on the star power, lifestyle, and cultural impact. Be glamorous but informative. Example: "[Artist] continues their reign with another chart-topping release..."`,
  
  industry_insider: `You write from an industry perspective. Focus on chart performance, sales figures, and business impact. Be authoritative and data-driven. Example: "[Artist]'s latest single debuts at #X on the Billboard Hot 100 with X streams..."`,
  
  stan_culture: `You write with intense fan energy. Use dramatic reactions, celebrate every achievement, and hype up the artist. Include lots of emojis and fan hashtags. Example: "THE WAY [ARTIST] JUST ATE THAT UP 😭🔥 WE ARE SO BLESSED"`
};

const PLATFORM_PERSONA_GUIDES: Record<string, string> = {
  '@theshaderoom': `Voice: sharp celebrity gossip, messy but polished, loves reaction bait, should sound like the account already sees the comments exploding.`,
  '@akademiks': `Voice: cocky, troll-adjacent hip-hop instigator, conversational and slightly antagonistic, like you're already narrating the discourse.`,
  '@popcrave': `Voice: polished pop-culture update account, quick, clean, stan-aware, less rude and more highly shareable.`,
  '@xxl': `Voice: music publication tone, concise hip-hop framing, more measured than gossip accounts, but still current.`,
  '@complexmusic': `Voice: industry-savvy culture desk tone, informed and slightly witty, balancing authority with internet fluency.`,
  '@hollywoodul': `Voice: celebrity-news tone with exclusives energy, glam and dramatic without sounding robotic.`,
  '@rapalert': `Voice: fast-moving rap update page, internet-native, energetic, semi-chaotic, built for reposts.`,
  '@dailyrapfacts': `Voice: meme-literate rap page, playful and highly online, can be funny without sounding unserious.`,
  '@nojumpernews': `Voice: blunt hip-hop and internet-drama tone, direct, a little messy, built for arguments in replies.`,
  '@onsite': `Voice: "the timeline is screaming" energy, reactive, loud, and chaos-forward.`
};

function getPlatformPersonaGuide(platform: any): string {
  const handle = String(platform?.handle || '').toLowerCase();
  return PLATFORM_PERSONA_GUIDES[handle] || 'Voice: distinct, platform-native, and recognizable — never generic corporate copy.';
}

// Generate engagement metrics based on platform reach and event importance
function generateEngagement(platformFollowers: number, eventImportance: number): { likes: number; comments: number; shares: number } {
  const baseEngagement = platformFollowers * 0.001; // 0.1% base engagement
  const importanceMultiplier = 0.5 + (eventImportance * 0.5); // 0.5x to 1.0x based on importance
  const variance = 0.7 + (Math.random() * 0.6); // 70% to 130% variance
  
  const totalEngagement = Math.floor(baseEngagement * importanceMultiplier * variance);
  
  return {
    likes: Math.floor(totalEngagement * (0.7 + Math.random() * 0.2)),
    comments: Math.floor(totalEngagement * (0.1 + Math.random() * 0.1)),
    shares: Math.floor(totalEngagement * (0.05 + Math.random() * 0.1))
  };
}

// Robust LLM call with fallback
async function generatePostWithLLM(
  prompt: string,
  eventType: MediaEventType,
  eventDetails: any,
  artistName: string
): Promise<{ text: string; usedLLM: boolean; llmError?: string }> {
  try {
    // Call Gemini via invokeLLM
    const response = await invokeLLM(prompt);
    
    // Check for rate limit fallback
    if (response === 'RATE_LIMITED_FALLBACK') {
      console.warn('[MediaPostGenerator] Using fallback due to rate limiting');
      const fallbackText = generateSimpleFallback(eventType, eventDetails, artistName);
      return { 
        text: fallbackText, 
        usedLLM: false, 
        llmError: 'API rate limited - using fallback'
      };
    }
    
    const postText = response?.trim();
    
    if (postText && postText.length > 0) {
      return { text: postText, usedLLM: true };
    } else {
      // LLM returned empty response
      return { 
        text: generateSimpleFallback(eventType, eventDetails, artistName), 
        usedLLM: false, 
        llmError: 'LLM returned empty response' 
      };
    }
  } catch (error: any) {
    console.error('[MediaPostGenerator] LLM error:', error.message);
    
    // Generate fallback based on error
    const fallbackText = generateSimpleFallback(eventType, eventDetails, artistName);
    return { 
      text: fallbackText, 
      usedLLM: false, 
      llmError: error.message 
    };
  }
}

// Simple fallback post generation
function generateSimpleFallback(
  eventType: MediaEventType,
  eventDetails: any,
  artistName: string
): string {
  const title = eventDetails.title || eventDetails.project_type || 'new music';
  const genre = eventDetails.genre || '';
  
  const fallbacks: Record<MediaEventType, string[]> = {
    new_release: [
      `🚨 ${artistName} just dropped "${title}" and it's 🔥 #NewMusic`,
      `NEW: ${artistName} releases "${title}" 💿 #MusicNews`,
      `${artistName}'s new ${title} is OUT NOW! 🎵`
    ],
    chart_entry: [
      `📈 ${artistName}'s "${title}" enters the charts! 🔥`,
      `${artistName} is charting with "${title}"! 📊`,
      `Chart debut: ${artistName} - "${title}" 🎯`
    ],
    certification: [
      `🏆 ${artistName}'s "${title}" is now certified! 💿`,
      `CERTIFIED: ${artistName} - "${title}" 🎉`,
      `${artistName} earns certification for "${title}"! 🏅`
    ],
    tour_announcement: [
      `🎤 ${artistName} announces tour! Tickets soon 🚌`,
      `TOUR ALERT: ${artistName} is hitting the road! 🎤`,
      `${artistName} going on tour! Get ready 🙌`
    ],
    tour_completion: [
      `That's a wrap! ${artistName}'s tour is complete 🎉`,
      `${artistName} wraps up successful tour! 🙌`,
      `Tour complete! ${artistName} thanks the fans 💕`
    ],
    milestone_followers: [
      `📊 ${artistName} hits follower milestone! 🎯`,
      `${artistName} reaches new follower record! 📈`,
      `Milestone: ${artistName}'s fanbase grows! 🙏`
    ],
    milestone_streams: [
      `🎧 ${artistName} surpasses streaming milestone! 📈`,
      `STREAMING MILESTONE: ${artistName} hits new record! 🔥`,
      `${artistName} breaks streaming records! 🎵`
    ],
    collaboration: [
      `👀 ${artistName} collaboration coming soon! 🔥`,
      `${artistName} x [Artist] cooking something up! 🎵`,
      `Collaboration alert: ${artistName} in the studio! 🎤`
    ],
    controversy: [
      `${artistName} is trending... 👀`,
      `Everyone's talking about ${artistName} right now...`,
      `${artistName} making headlines! 📰`
    ],
    comeback: [
      `${artistName} IS BACK! 🔥`,
      `The return of ${artistName}! We missed you 🙌`,
      `${artistName} makes comeback! 🎉`
    ],
    award: [
      `🏆 Congratulations to ${artistName}! 👏`,
      `${artistName} takes home the award! 🏅`,
      `Award winner: ${artistName}! Well deserved 🎯`
    ],
    viral_moment: [
      `${artistName} is going VIRAL right now 📱`,
      `Everyone's talking about ${artistName}! 🔥`,
      `${artistName} trending worldwide! 📈`
    ]
  };
  
  const options = fallbacks[eventType] || [`${artistName} is making moves! 🔥 #Music`];
  return options[Math.floor(Math.random() * options.length)];
}
function buildPrompt(
  platform: any,
  eventType: MediaEventType,
  eventDetails: any,
  artistName: string
): string {
  const styleGuide = REPORTING_STYLE_PROMPTS[platform.reporting_style] || REPORTING_STYLE_PROMPTS.celebrity_news;
  const personaGuide = getPlatformPersonaGuide(platform);
  
  let eventContext = '';
  
  switch (eventType) {
    case 'new_release':
      eventContext = `${artistName} just released "${eventDetails.title}" (${eventDetails.project_type || 'single'}). ${eventDetails.genre ? `Genre: ${eventDetails.genre}.` : ''} ${eventDetails.features ? `Features: ${eventDetails.features.join(', ')}.` : ''}`;
      break;
      
    case 'chart_entry':
      eventContext = `${artistName}'s "${eventDetails.title}" has entered the ${eventDetails.chart_name} at #${eventDetails.position}. ${eventDetails.streams ? `It has ${eventDetails.streams.toLocaleString()} streams.` : ''}`;
      break;
      
    case 'certification':
      eventContext = `${artistName}'s "${eventDetails.title}" has been certified ${eventDetails.certification} with ${eventDetails.streams?.toLocaleString() || 'millions of'} streams!`;
      break;
      
    case 'tour_announcement':
      eventContext = `${artistName} has announced the "${eventDetails.tour_name}" tour, covering ${eventDetails.region}. ${eventDetails.shows_count} shows planned.`;
      break;
      
    case 'tour_completion':
      eventContext = `${artistName} has completed the "${eventDetails.tour_name}" tour! Total revenue: $${eventDetails.revenue?.toLocaleString() || 'undisclosed'}. ${eventDetails.attendance?.toLocaleString() || 'Thousands of'} fans attended.`;
      break;
      
    case 'milestone_followers':
      eventContext = `${artistName} has reached ${eventDetails.followers?.toLocaleString()} followers! ${eventDetails.growth_rate ? `Growing ${eventDetails.growth_rate}% this month.` : ''}`;
      break;
      
    case 'milestone_streams':
      eventContext = `${artistName} has surpassed ${eventDetails.streams?.toLocaleString()} total streams across all platforms!`;
      break;
      
    case 'collaboration':
      eventContext = `${artistName} and ${eventDetails.collaborator} are working together on ${eventDetails.project_type || 'new music'}!`;
      break;
      
    case 'viral_moment':
      eventContext = `${artistName} is going viral! ${eventDetails.reason || 'Fans are buzzing about their latest move.'}`;
      break;
      
    default:
      eventContext = `${artistName} is making waves in the music industry.`;
  }

  return `You are ${platform.handle}, a ${platform.description}

${styleGuide}

${personaGuide}

Write a single social media post (like a tweet/X post) about this event:
${eventContext}

Requirements:
- Keep it under 280 characters
- Match the reporting style exactly
- Use hashtags only if they feel natural; zero hashtags is allowed
- Make it feel authentic to ${platform.name}
- Do NOT use placeholder brackets like [Artist] - use the actual name
- Be creative but factual about the event
- Avoid sounding repetitive, canned, or AI-generated

Respond with ONLY the post content, no quotes or explanation.`;
}

/**
 * Select relevant media platforms for an event based on genre and importance
 */
export async function selectRelevantPlatforms(
  entities: any,
  artistGenre: string,
  eventImportance: number, // 0-1 scale
  maxPlatforms: number = 2
): Promise<any[]> {
  const allPlatforms = await entities.MediaPlatform.list();
  
  // Score each platform based on genre match and relevance
  const scoredPlatforms = allPlatforms.map((platform: any) => {
    let score = platform.relevance_score || 1.0;
    
    // Genre match bonus
    const genreFocus = platform.genre_focus || [];
    if (genreFocus.includes(artistGenre) || genreFocus.includes('General')) {
      score *= 1.5;
    }
    
    // Activity level affects selection probability
    const activityMultiplierMap: Record<string, number> = {
      'high': 1.3,
      'medium': 1.0,
      'low': 0.7
    };
    const activityMultiplier = activityMultiplierMap[platform.activity_level as string] || 1.0;
    score *= activityMultiplier;
    
    // Event importance affects which platforms pick it up
    // Low importance events only get picked up by high-activity platforms
    if (eventImportance < 0.3 && platform.activity_level !== 'high') {
      score *= 0.3;
    }
    
    // Add randomness
    score *= (0.5 + Math.random());
    
    return { platform, score };
  });
  
  // Sort by score and take top N
  scoredPlatforms.sort((a: any, b: any) => b.score - a.score);
  
  // Determine how many platforms based on event importance
  const platformCount = eventImportance >= 0.85
    ? Math.min(maxPlatforms, 2)
    : 1;
  
  return scoredPlatforms.slice(0, platformCount).map((sp: any) => sp.platform);
}

/**
 * Generate a media post for a specific platform and event
 */
export async function generateMediaPost(
  _entities: any,
  platform: any,
  eventType: MediaEventType,
  eventDetails: any,
  artistName: string,
  artistId?: string
): Promise<any> {
  const prompt = buildPrompt(platform, eventType, eventDetails, artistName);
  
  // Use robust LLM call with fallback
  const llmResult = await generatePostWithLLM(prompt, eventType, eventDetails, artistName);
  const postContent = llmResult.text;
  
  // Generate engagement metrics
  const eventImportance = eventDetails.importance || 0.5;
  const engagement = generateEngagement(platform.follower_count || 100000, eventImportance);
  
  const postTitle = postContent.substring(0, 60);

  return {
    source_type: 'media_platform',
    media_platform_id: platform.id,
    artist_id: artistId || null,
    platform: 'xpress',
    post_type: 'text',
    title: postTitle,
    caption: postContent,
    event_type: eventType,
    event_reference_id: eventDetails.reference_id || null,
    status: 'published',
    is_ai_generated: llmResult.usedLLM,
    likes: engagement.likes,
    comments: engagement.comments,
    shares: engagement.shares,
    views: Math.floor(engagement.likes * (8 + Math.random() * 4)),
    metadata: {
      media_outlet_name: platform.name,
      media_outlet_handle: platform.handle,
      npc_username: platform.name,
      npc_handle: platform.handle,
      platform_name: platform.name,
      platform_handle: platform.handle,
      platform_pfp: platform.pfp_url,
      event_details: eventDetails,
      used_llm: llmResult.usedLLM,
      llm_error: llmResult.llmError
    }
  };
}

/**
 * Fallback post generation when LLM fails
 */
function generateFallbackPost(
  platform: any,
  eventType: MediaEventType,
  eventDetails: any,
  artistName: string
): string {
  const templates: Record<MediaEventType, string[]> = {
    new_release: [
      `🚨 ${artistName} just dropped "${eventDetails.title}" and it's 🔥 #NewMusic`,
      `${artistName}'s new ${eventDetails.project_type || 'track'} "${eventDetails.title}" is OUT NOW! 🎵`,
      `NEW: ${artistName} releases "${eventDetails.title}" 💿 #MusicNews`
    ],
    chart_entry: [
      `📈 ${artistName}'s "${eventDetails.title}" enters the charts at #${eventDetails.position}!`,
      `${artistName} is charting! "${eventDetails.title}" debuts at #${eventDetails.position} 🔥`,
    ],
    certification: [
      `🏆 ${artistName}'s "${eventDetails.title}" is now certified ${eventDetails.certification}!`,
      `CERTIFIED ${eventDetails.certification?.toUpperCase()}: ${artistName} - "${eventDetails.title}" 💿`,
    ],
    tour_announcement: [
      `🎤 ${artistName} announces the "${eventDetails.tour_name}" tour! Tickets soon.`,
      `TOUR ALERT: ${artistName} is hitting the road with "${eventDetails.tour_name}" 🚌`,
    ],
    tour_completion: [
      `${artistName} wraps up the "${eventDetails.tour_name}" tour! What a run 🙌`,
      `That's a wrap! ${artistName}'s "${eventDetails.tour_name}" tour is complete 🎉`,
    ],
    milestone_followers: [
      `📊 ${artistName} just hit ${eventDetails.followers?.toLocaleString()} followers!`,
      `${artistName} reaches ${eventDetails.followers?.toLocaleString()} followers milestone! 🎯`,
    ],
    milestone_streams: [
      `🎧 ${artistName} surpasses ${eventDetails.streams?.toLocaleString()} streams!`,
      `STREAMING MILESTONE: ${artistName} hits ${eventDetails.streams?.toLocaleString()} plays 📈`,
    ],
    collaboration: [
      `👀 ${artistName} x ${eventDetails.collaborator} coming soon?!`,
      `${artistName} and ${eventDetails.collaborator} are cooking something up 🔥`,
    ],
    controversy: [
      `${artistName} is trending... 👀`,
      `Everyone's talking about ${artistName} right now...`,
    ],
    comeback: [
      `${artistName} IS BACK! 🔥`,
      `The return of ${artistName}! We missed you 🙌`,
    ],
    award: [
      `🏆 Congratulations to ${artistName}!`,
      `${artistName} takes home the award! Well deserved 👏`,
    ],
    viral_moment: [
      `${artistName} is going VIRAL right now 📱`,
      `Everyone's talking about ${artistName}! 🔥`,
    ]
  };
  
  const options = templates[eventType] || [`${artistName} is making moves! 🔥`];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate NPC artist social posts (AI artists posting independently)
 */
export async function generateNPCArtistPost(
  _entities: any,
  npcArtist: any
): Promise<any | null> {
  // Only generate posts occasionally so ambient NPC chatter does not flood Xpress
  if (Math.random() > 0.12) return null;
  
  const postTypes = [
    'studio_update',
    'fan_interaction',
    'life_update',
    'music_tease',
    'throwback',
    'motivation'
  ];
  
  const postType = postTypes[Math.floor(Math.random() * postTypes.length)];
  
  const prompt = `You are ${npcArtist.artist_name}, a ${npcArtist.genre || 'music'} artist with ${npcArtist.followers?.toLocaleString() || 'many'} followers.

Write a casual social media post (like a tweet) as this artist. Post type: ${postType}

Requirements:
- Keep it under 200 characters
- Sound authentic to a real artist
- Match the ${npcArtist.genre || 'music'} genre vibe
- Include 0-1 emojis
- Be creative and personal

Respond with ONLY the post content.`;

  let content: string;
  let usedLLM = false;
  let llmError: string | undefined;
  
  try {
    const response = await invokeLLM(prompt);
    content = response?.trim();
    if (content && content.length > 0) {
      usedLLM = true;
    } else {
      // LLM returned empty response
      content = 'In the studio cooking something special 🔥';
      usedLLM = false;
      llmError = 'LLM returned empty response';
    }
  } catch (error: any) {
    // Fallback templates
    const fallbacks = [
      'In the studio late night... new music soon 🎵',
      'Love to all my fans, y\'all keep me going 🙏',
      'Working on something special for y\'all...',
      'Can\'t wait for y\'all to hear what\'s next 🔥',
      'Grateful for this journey 🙌',
      'Studio mode activated 🎤'
    ];
    content = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    usedLLM = false;
    llmError = error.message;
  }
  
  return {
    source_type: 'npc_artist',
    artist_id: npcArtist.id,
    platform: 'xpress',
    post_type: 'text',
    content: content,
    is_ai_generated: usedLLM,
    likes: Math.floor(npcArtist.followers * 0.001 * (0.5 + Math.random())),
    comments: Math.floor(npcArtist.followers * 0.0002 * (0.5 + Math.random())),
    shares: Math.floor(npcArtist.followers * 0.0001 * (0.5 + Math.random())),
    views: Math.floor(npcArtist.followers * 0.01 * (0.5 + Math.random())),
    metadata: {
      post_type: postType,
      is_npc: true,
      used_llm: usedLLM,
      llm_error: llmError
    }
  };
}

/**
 * Process media posts for turn events
 * Called from turn engine after significant events
 */
export async function processMediaPostsForTurn(
  ctx: any,
  events: Array<{ type: MediaEventType; details: any; artistId: string; artistName: string; artistGenre: string; importance: number }>
): Promise<any[]> {
  const { entities } = ctx;
  const createdPosts: any[] = [];
  
  for (const event of events) {
    try {
      // Select relevant platforms for this event
      const platforms = await selectRelevantPlatforms(
        entities,
        event.artistGenre,
        event.importance,
        Math.min(3, Math.ceil(event.importance * 4)) // 1-3 platforms based on importance
      );
      
      // Generate posts for each selected platform
      for (const platform of platforms) {
        const post = await generateMediaPost(
          entities,
          platform,
          event.type,
          { ...event.details, importance: event.importance },
          event.artistName,
          event.artistId
        );
        
        if (post) {
          createdPosts.push(post);
        }
      }
    } catch (error: any) {
      console.error(`[MediaPostGenerator] Error processing event ${event.type}:`, error.message);
    }
  }
  
  return createdPosts;
}
