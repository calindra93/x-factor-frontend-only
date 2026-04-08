/**
 * TREND HANDLER
 * Updates and manages dynamic trends based on era, career, and hype
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

export async function updateTrends(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { globalTurnId } = body;

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get all active artists
    const artists = await entities.ArtistProfile.list(null, 100);
    
    // Get current trends
    const currentTrends = await supabase
      .from('trends')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // Decay existing trends
    const trendUpdates = (currentTrends.data || []).map(trend => ({
      id: trend.id,
      peak_virality_score: Math.max(0.1, trend.peak_virality_score - trend.decay_rate),
      is_active: trend.peak_virality_score - trend.decay_rate > 0.1
    }));

    // Apply trend decay
    for (const update of trendUpdates) {
      await supabase
        .from('trends')
        .update({
          peak_virality_score: update.peak_virality_score,
          is_active: update.is_active
        })
        .eq('id', update.id);
    }

    // Generate new trends based on artist activity
    const newTrends = [];
    
    for (const artist of artists) {
      // Skip if artist has very low engagement
      if (N(artist.hype) < 20 && N(artist.followers) < 1000) continue;
      
      // Get artist's recent posts
      const recentPosts = await entities.SocialPost.filter({
        artist_id: artist.id,
        created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
      }, 'created_at desc', 5);

      if (recentPosts.length === 0) continue;

      // Calculate trend generation probability
      const trendChance = (N(artist.hype) / 100) * 0.3 + (recentPosts.length / 5) * 0.4;
      
      if (Math.random() < trendChance) {
        const trendTypes = ['Sound', 'Challenge', 'Meme'];
        const trendType = trendTypes[Math.floor(Math.random() * trendTypes.length)];
        
        // Generate trend name based on artist activity
        let trendName = '';
        if (trendType === 'Sound') {
          const soundPrefixes = ['Vibing', 'Chill', 'Hype', 'Dream', 'Dark', 'Neon'];
          const soundSuffixes = ['Beat', 'Wave', 'Vibe', 'Flow', 'Rhythm', 'Melody'];
          trendName = `${soundPrefixes[Math.floor(Math.random() * soundPrefixes.length)]}${soundSuffixes[Math.floor(Math.random() * soundSuffixes.length)]}`;
        } else if (trendType === 'Challenge') {
          const challengePrefixes = ['#', 'The', 'Ultimate', 'Epic', 'Viral'];
          const challengeSuffixes = ['Dance', 'Challenge', 'Move', 'Groove', 'Flow'];
          trendName = `${challengePrefixes[Math.floor(Math.random() * challengePrefixes.length)]} ${challengeSuffixes[Math.floor(Math.random() * challengeSuffixes.length)]}`;
        } else {
          const memePrefixes = ['When you', 'Me watching', 'POV:', 'That feeling when'];
          const memeSuffixes = ['the beat drops', 'you realize', 'it\'s Friday', 'the algorithm works'];
          trendName = `${memePrefixes[Math.floor(Math.random() * memePrefixes.length)]} ${memeSuffixes[Math.floor(Math.random() * memeSuffixes.length)]}`;
        }

        // Calculate trend virality based on artist metrics
        const baseVirality = 1.0 + (N(artist.hype) / 100);
        const followerBoost = 1 + (N(artist.followers) / 50000);
        const eraPhase = artist.current_era_phase || 'TEASE';
        const careerStage = artist.career_stage || 'Underground';
        
        let eraMultiplier = 1.0;
        if (eraPhase === 'DROP') eraMultiplier = 1.5;
        else if (eraPhase === 'TEASE') eraMultiplier = 1.3;
        else if (eraPhase === 'SUSTAIN') eraMultiplier = 1.1;
        
        let careerMultiplier = 1.0;
        if (careerStage === 'Rising Star') careerMultiplier = 1.3;
        else if (careerStage === 'Mainstream') careerMultiplier = 1.5;
        else if (careerStage === 'Superstar') careerMultiplier = 2.0;
        
        const peakVirality = Math.min(10.0, baseVirality * followerBoost * eraMultiplier * careerMultiplier);
        const decayRate = 0.05 + (Math.random() * 0.1);
        
        // Set expiration (7-21 turns)
        const expirationTurn = (globalTurnId || 0) + 7 + Math.floor(Math.random() * 14);

        newTrends.push({
          trend_type: trendType,
          name: trendName,
          peak_virality_score: Math.floor(peakVirality * 100) / 100,
          decay_rate: Math.floor(decayRate * 1000) / 1000,
          expiration_turn: expirationTurn,
          description: `Trending in the ${careerStage.toLowerCase()} scene`,
          era_phase: eraPhase,
          career_stage: careerStage,
          hype_threshold: Math.max(20, N(artist.hype) - 10),
          is_active: true
        });
      }
    }

    // Insert new trends
    if (newTrends.length > 0) {
      const { data: insertedTrends } = await supabase
        .from('trends')
        .insert(newTrends)
        .select();

      return Response.json({
        success: true,
        data: {
          trendsDecayed: trendUpdates.length,
          trendsGenerated: newTrends.length,
          activeTrends: insertedTrends,
          totalActiveTrends: (currentTrends.data || []).filter(t => t.is_active).length + newTrends.length
        }
      });
    }

    return Response.json({
      success: true,
      data: {
        trendsDecayed: trendUpdates.length,
        trendsGenerated: 0,
        totalActiveTrends: (currentTrends.data || []).filter(t => t.is_active).length
      }
    });

  } catch (error: any) {
    console.error('Trend update error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
