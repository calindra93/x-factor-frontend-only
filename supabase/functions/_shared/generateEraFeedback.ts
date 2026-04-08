import { getAuthUser } from './lib/authFromRequest.ts';
import { invokeLLM } from './lib/invokeLLM.ts';

/**
 * AI-Powered Era Goal Feedback Generator
 * Generates strategic feedback on player's progress towards era goals
 */

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }

    const { era, goals, artist_stats, recent_performance } = await req.json();

    if (!goals || goals.length === 0) {
      return Response.json({ 
        feedback: null,
        challenges: []
      });
    }

    // Build AI prompt for goal feedback
    const prompt = buildFeedbackPrompt(era, goals, artist_stats, recent_performance);

    const response = await invokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          strategic_overview: { 
            type: "string", 
            description: "2-3 sentence strategic overview of goal progress"
          },
          goal_insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                goal_id: { type: "string" },
                status: { type: "string", enum: ["on_track", "ahead", "behind", "stalled"] },
                insight: { type: "string", description: "1-2 sentences on this goal" },
                recommendation: { type: "string", description: "Actionable advice" }
              }
            }
          },
          suggested_challenges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                goal_id: { type: "string" },
                urgency: { type: "string", enum: ["low", "medium", "high"] }
              }
            },
            description: "0-2 dynamic challenges to accelerate goal progress"
          }
        },
        required: ["strategic_overview", "goal_insights", "suggested_challenges"]
      }
    });

    return Response.json(response);

  } catch (error) {
    console.error('[generateEraFeedback] Error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function buildFeedbackPrompt(era, goals, artistStats, recentPerformance) {
  const goalsSummary = goals.map(g => {
    const progress = ((g.current / g.target) * 100).toFixed(1);
    return `- ${g.type.toUpperCase()}: ${g.current.toLocaleString()} / ${g.target.toLocaleString()} (${progress}% complete)`;
  }).join('\n');

  return `You are a strategic music industry advisor analyzing an artist's progress towards their era goals.

ARTIST CONTEXT:
- Name: ${artistStats.artist_name}
- Genre: ${artistStats.genre}
- Region: ${artistStats.region}
- Current followers: ${artistStats.followers.toLocaleString()}
- Current hype: ${artistStats.hype}/100
- Current clout: ${artistStats.clout}

ERA CONTEXT:
- Era: "${era.era_name}"
- Phase: ${era.phase}
- Momentum: ${era.momentum}/100
- Tension: ${era.tension}/100
- Volatility: ${era.volatility_level}/100

CURRENT GOALS:
${goalsSummary}

RECENT PERFORMANCE (last turn):
- Streams: ${recentPerformance.streams?.toLocaleString() || 0}
- Follower growth: +${recentPerformance.follower_growth || 0}
- Revenue: $${recentPerformance.revenue || 0}
- Releases dropped: ${recentPerformance.releases_dropped || 0}

Analyze this data and provide:
1. Strategic overview: High-level assessment of goal progress (2-3 sentences, be direct and strategic)
2. Goal-by-goal insights: For each goal, assess status and provide specific recommendations
3. Suggested challenges: 0-2 dynamic challenges that could accelerate progress (only if meaningful)

Be realistic, data-driven, and strategic. Don't sugarcoat - give honest assessments. Use music industry terminology.`;
}