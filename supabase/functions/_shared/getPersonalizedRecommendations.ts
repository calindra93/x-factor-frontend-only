import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { getAuthUser } from './lib/authFromRequest.ts';
import { invokeLLM } from './lib/invokeLLM.ts';

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

    const { artist_id, genre, region, careerStage, clout, platform = 'soundburst' } = await req.json();

    // Get all artists from the database to build recommendation context
    const allProfiles = await entities.ArtistProfile.list('-clout', 100);

    if (!allProfiles || allProfiles.length === 0) {
      return Response.json({ recommendations: [], error: 'No artists found' });
    }

    // Build context about the user's taste
    const userProfile = `
Genre: ${genre}
Region: ${region}
Career Stage: ${careerStage}
Clout: ${clout}
Platform Interest: ${platform === 'soundburst' ? 'Underground/Emerging' : 'Mainstream/Discovery'}
    `.trim();

    // Use LLM to generate personalized recommendations
    const prompt = `You are a music discovery algorithm. Based on the user's profile and preferences, recommend 4-5 artists from the list below that they would enjoy, considering genre synergy and similar career trajectory.

USER PROFILE:
${userProfile}

AVAILABLE ARTISTS:
${allProfiles.slice(0, 50).map(a => `- ${a.artist_name} (Genre: ${a.genre}, Region: ${a.region}, Clout: ${a.clout}, Followers: ${a.followers})`).join('\n')}

For each recommended artist, provide:
1. Artist name
2. Why they match (genre synergy, career stage similarity, regional connection)
3. 2-3 similar artists to that artist

Format as JSON with this structure:
{
  "recommendations": [
    {
      "artist_name": "string",
      "reason": "string",
      "synergy_score": 0.0-1.0,
      "similar_artists": ["artist1", "artist2", "artist3"]
    }
  ]
}`;

    const result = await invokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                artist_name: { type: 'string' },
                reason: { type: 'string' },
                synergy_score: { type: 'number' },
                similar_artists: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    });

    // Match recommendations with actual artist data
    const enrichedRecommendations = result.recommendations.map(rec => {
      const matchedArtist = allProfiles.find(
        a => a.artist_name.toLowerCase() === rec.artist_name.toLowerCase()
      );

      return {
        ...rec,
        artist_id: matchedArtist?.id || null,
        artist_image: matchedArtist?.artist_image || null,
        followers: matchedArtist?.followers || 0,
        clout: matchedArtist?.clout || 0
      };
    }).filter(r => r.artist_id); // Only include matched artists

    return Response.json({
      recommendations: enrichedRecommendations,
      user_profile: userProfile
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return Response.json(
      { error: (error as Error).message, recommendations: [] },
      { status: 500 }
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}