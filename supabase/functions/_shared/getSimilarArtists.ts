import { supabaseAdmin } from './lib/supabaseAdmin.ts';

function scoreSimilarity(target, candidate) {
  let score = 0;
  if (target.genre && candidate.genre && target.genre.toLowerCase() === candidate.genre.toLowerCase()) score += 0.4;
  if (target.region && candidate.region && target.region.toLowerCase() === candidate.region.toLowerCase()) score += 0.25;
  const cloutDiff = Math.abs((target.clout || 0) - (candidate.clout || 0));
  score += Math.max(0, 0.2 - cloutDiff / 5000);
  const followerDiff = Math.abs((target.followers || 0) - (candidate.followers || 0));
  score += Math.max(0, 0.15 - followerDiff / 100000);
  return Math.min(1, Math.max(0, score));
}

function buildReason(target, candidate) {
  const parts = [];
  if (target.genre?.toLowerCase() === candidate.genre?.toLowerCase()) parts.push(`Same genre (${candidate.genre})`);
  if (target.region?.toLowerCase() === candidate.region?.toLowerCase()) parts.push(`Same region`);
  if (Math.abs((target.clout || 0) - (candidate.clout || 0)) < 100) parts.push(`Similar career stage`);
  return parts.length > 0 ? parts.join(', ') : 'Related artist';
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { artist_id } = await req.json();

    if (!artist_id) {
      return Response.json({ error: 'artist_id required' }, { status: 400, headers: corsHeaders });
    }

    const { data: targetArtist, error: targetErr } = await supabaseAdmin
      .from('profiles').select('*').eq('id', artist_id).maybeSingle();

    if (targetErr || !targetArtist) {
      return Response.json({ error: 'Artist not found' }, { status: 404, headers: corsHeaders });
    }

    const { data: allArtists } = await supabaseAdmin
      .from('profiles').select('*').eq('is_npc', false).order('clout', { ascending: false }).limit(150);

    const candidates = (allArtists || [])
      .filter(a => a.id !== artist_id)
      .map(a => ({
        artist_name: a.artist_name,
        artist_id: a.id,
        genre: a.genre,
        region: a.region,
        followers: a.followers || 0,
        clout: a.clout || 0,
        match_score: scoreSimilarity(targetArtist, a),
        reason: buildReason(targetArtist, a)
      }))
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 4);

    return Response.json({
      target_artist: targetArtist.artist_name,
      similar_artists: candidates
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error finding similar artists:', error);
    return Response.json(
      { error: error.message, similar_artists: [] },
      { status: 500, headers: corsHeaders }
    );
  }
});