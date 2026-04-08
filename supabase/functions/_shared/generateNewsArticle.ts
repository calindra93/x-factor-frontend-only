import { getAuthUser } from './lib/authFromRequest.ts';
import { invokeLLM } from './lib/invokeLLM.ts';

/**
 * AI-Powered News Article Generator
 * Generates immersive news articles for significant in-game events
 */

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }

    const { event_type, artist_name, genre, region, metrics, context } = await req.json();

    // Build detailed prompt for AI
    const prompt = buildNewsPrompt(event_type, artist_name, genre, region, metrics, context);

    // Generate article using AI
    const response = await invokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Catchy news headline (max 80 chars)" },
          body: { type: "string", description: "News article body (150-300 words, journalistic tone)" },
          category: { 
            type: "string", 
            enum: ["trending", "industry", "regional", "milestone"],
            description: "Article category"
          },
          tone: {
            type: "string",
            enum: ["celebratory", "analytical", "critical", "neutral"],
            description: "Article tone"
          }
        },
        required: ["headline", "body", "category", "tone"]
      }
    });

    return Response.json({
      headline: response.headline,
      body: response.body,
      category: response.category,
      tone: response.tone
    });

  } catch (error) {
    console.error('[generateNewsArticle] Error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function buildNewsPrompt(eventType, artistName, genre, region, metrics, context) {
  const basePrompt = `You are a music industry journalist writing for a digital music publication. Write a realistic, immersive news article about the following event:

Artist: ${artistName}
Genre: ${genre}
Region: ${region}
Event Type: ${eventType}
`;

  const eventPrompts = {
    release_dropped: `
${artistName} just dropped a new ${context?.project_type || 'release'} titled "${context?.release_name || 'Untitled'}".

Details:
- Platforms: ${context?.platforms || 'streaming services'}
- Target regions: ${context?.regions || region}
- Anticipated bonus: ${context?.scheduled_bonus || 0}%
${context?.scheduled ? '- This was a highly anticipated scheduled release' : '- Surprise drop'}

Write an engaging news article covering this release. Include speculation about potential chart performance, fan reception predictions, and industry context. Keep it journalistic but exciting.`,

    stream_milestone: `
${artistName}'s track "${context?.release_title || 'hit song'}" just crossed ${(context?.milestone || 0).toLocaleString()} streams.

Metrics:
- Total lifetime streams: ${(context?.total_streams || 0).toLocaleString()}
- Genre: ${genre}
- Career trajectory: ${context?.career_stage || 'rising'}

Write about this streaming milestone as a significant achievement. Discuss what it means for the artist's career, compare to genre standards, and add industry context.`,

    follower_surge: `
${artistName} experienced explosive follower growth, gaining ${(metrics?.follower_growth || 0).toLocaleString()} new followers.

Current stats:
- Total followers: ${(metrics?.new_followers || 0).toLocaleString()}
- Growth rate: ${metrics?.growth_rate || 0}%
- Hype level: ${context?.hype || 0}/100

Cover this surge in popularity. What's driving the growth? Social media buzz? A viral moment? Industry attention?`,

    one_hit_wonder: `
${artistName} is experiencing a massive breakout moment with a viral hit that's reshaping their entire era.

Context:
- Spike magnitude: ${context?.spike_magnitude || 0}
- Release: ${context?.release_title || 'breakthrough track'}
- Career stage: ${context?.career_stage || 'early'}

Write about this "one-hit wonder" moment. The pressure, the opportunity, the sudden spotlight. Will they capitalize or fade?`,

    era_triumph: `
${artistName} is riding high as their current era hits peak momentum.

Era details:
- Phase: ${context?.era_phase || 'peak'}
- Momentum: ${context?.momentum || 0}/100
- Fan reception: ${context?.fan_sentiment || 'positive'}

Write a feature piece on this triumphant era. What's working? Why is it connecting? What's next?`,

    era_flop: `
${artistName}'s latest era is struggling to connect with audiences.

Situation:
- Momentum: ${context?.momentum || 0}/100
- Tension: ${context?.tension || 0}/100
- Industry chatter: ${context?.critic_sentiment || 'mixed'}

Write a critical but fair piece about this challenging period. Explore what went wrong and potential paths forward.`,

    big_revenue: `
${artistName} had a breakthrough revenue day, earning $${Math.floor(metrics?.revenue || 0)} in a single turn.

Financial context:
- Total streams: ${(metrics?.streams || 0).toLocaleString()}
- Active releases: ${context?.active_releases || 0}

Report on this financial success. What's driving the numbers? Is this sustainable?`,

    audience_surge: `
${artistName} saw a massive surge in monthly listeners, gaining ${(metrics?.audience_lift || 0).toLocaleString()} new listeners.

Audience metrics:
- Monthly listeners: ${(metrics?.monthly_listeners || 0).toLocaleString()}
- Active listening rate: ${Math.floor((metrics?.monthly_active / metrics?.monthly_listeners * 100) || 0)}%

Write about this audience explosion. Is it organic growth? A viral moment? Regional expansion?`
  };

  const specificPrompt = eventPrompts[eventType] || `
${artistName} is making waves in the ${genre} scene.

Metrics: ${JSON.stringify(metrics || {})}
Context: ${JSON.stringify(context || {})}

Write a compelling news article about this development in ${artistName}'s career.`;

  return basePrompt + specificPrompt + `

IMPORTANT:
- Write in a journalistic, third-person style
- Include vivid details and industry context
- Keep it between 150-300 words
- Make it feel like real music journalism
- Don't be overly promotional - be analytical and realistic
- Include speculation, quotes, or industry reactions where appropriate`;
}