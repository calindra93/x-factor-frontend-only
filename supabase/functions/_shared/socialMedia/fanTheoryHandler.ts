/**
 * FAN THEORY HANDLER
 * Generates fan theories from successful/ambiguous content
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

export async function generateFanTheories(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId } = body;

    if (!artistId) {
      return Response.json({
        error: 'Missing required field: artistId'
      }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get artist profile
    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return Response.json({
        error: 'Artist profile not found'
      }, { status: 404 });
    }

    // Get recent successful/ambiguous content
    const recentPosts = await entities.SocialPost.filter({
      artist_id: artistId,
      is_viral: true,
      created_at: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() }
    }, 'created_at desc', 10);

    if (recentPosts.length === 0) {
      return Response.json({
        success: true,
        data: {
          theoriesGenerated: 0,
          message: 'No viral content to generate theories from'
        }
      });
    }

    // Theory templates based on content type
    const theoryTemplates = [
      "The hidden meaning behind {title} is actually about...",
      "I think {title} is a response to {trend}",
      "There's a secret message in {title} if you play it backwards",
      "{title} predicts what's coming next in their career",
      "The symbolism in {title} represents their journey",
      "Is {title} about their relationship with {collaborator}?",
      "{title} contains clues about their next era",
      "The aesthetic choices in {title} mean...",
      "I decoded the hidden track in {title}",
      "{title} is actually a metaphor for..."
    ];

    const theories = [];
    const theoriesToGenerate = Math.min(3, recentPosts.length);

    for (let i = 0; i < theoriesToGenerate; i++) {
      const post = recentPosts[i];
      const template = theoryTemplates[Math.floor(Math.random() * theoryTemplates.length)];
      
      // Replace placeholders
      let theoryText = template
        .replace('{title}', post.title || 'their latest work')
        .replace('{trend}', 'the current music scene')
        .replace('{collaborator}', 'someone special');

      // Add specific details based on platform
      if (post.platform === 'vidwave') {
        theoryText += " The production quality and visual storytelling suggest..."
      } else if (post.platform === 'looptok') {
        theoryText += " The viral nature and algorithmic boost indicate..."
      }

      // Calculate virality score based on post performance
      const baseVirality = post.is_viral ? 2.0 : 1.0;
      const engagementVirality = Math.min(3.0, post.viral_multiplier || 1.0);
      const followerVirality = 1 + (N(profile.followers) / 100000);
      const viralityScore = baseVirality * engagementVirality * followerVirality * (0.8 + Math.random() * 0.4);

      theories.push({
        artist_id: artistId,
        theory_text: theoryText,
        virality_score: Math.floor(viralityScore * 100) / 100,
        related_video_id: post.id,
        is_confirmed: false,
        is_debunked: false
      });
    }

    // Insert theories
    if (theories.length > 0) {
      const { data: insertedTheories } = await supabase
        .from('fan_theories')
        .insert(theories)
        .select();

      // Generate fan messages about theories
      const theoryMessages = theories.map(theory => ({
        artist_id: artistId,
        sender_type: 'Fan',
        message_content: `New theory: "${theory.theory_text.substring(0, 50)}..."`,
        sentiment_score: 40 + Math.floor(Math.random() * 40),
        like_count: Math.floor(Math.random() * 200),
        reply_count: Math.floor(Math.random() * 20)
      }));

      if (theoryMessages.length > 0) {
        await supabase
          .from('community_messages')
          .insert(theoryMessages);
      }

      return Response.json({
        success: true,
        data: {
          theoriesGenerated: theories.length,
          theories: insertedTheories,
          averageVirality: theories.reduce((sum, t) => sum + t.virality_score, 0) / theories.length,
          fanMessagesGenerated: theoryMessages.length
        }
      });
    }

    return Response.json({
      success: true,
      data: {
        theoriesGenerated: 0,
        message: 'No theories generated'
      }
    });

  } catch (error: any) {
    console.error('Fan theory generation error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
