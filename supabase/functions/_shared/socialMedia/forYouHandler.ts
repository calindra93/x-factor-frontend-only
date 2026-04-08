/**
 * FOR YOU PAGE HANDLER
 * Aggregates trending and popular content from all players
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { calcTrendingScore } from '../socialMediaMath.ts';

function N(v: any): number { return Number(v) || 0; }

export async function getForYouContent(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      platform,
      contentType,
      timePeriod,
      limit = 50,
      viewerId,
      section = 'trending' // 'trending' | 'popular' | 'shorts' | 'new'
    } = body;

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Build base query — fetch all published posts from all players
    let query = supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(200); // Fetch more, then score and slice

    if (platform && platform !== 'all') {
      query = query.eq('platform', platform);
    }
    if (contentType && contentType !== 'all') {
      query = query.eq('post_type', contentType);
    }

    // Shorts filter: only short-form content
    if (section === 'shorts') {
      query = query.or('metadata->>video_type.eq.short,metadata->>video_length.in.(15s,30s)');
    }

    // Time period filter
    if (timePeriod) {
      const now = new Date();
      const cutoffs: Record<string, number> = { today: 1, week: 7, month: 30 };
      const days = cutoffs[timePeriod];
      if (days) {
        query = query.gte('created_at', new Date(now.getTime() - days * 86400000).toISOString());
      }
    }

    // Exclude viewer's own content
    if (viewerId) {
      query = query.neq('artist_id', viewerId);
    }

    const { data: posts, error } = await query;
    if (error) {
      return Response.json({ error: 'Failed to fetch content', details: error.message }, { status: 500 });
    }

    // Collect unique artist IDs and fetch their profiles
    const artistIds = [...new Set((posts || []).map((p: any) => p.artist_id))];
    const profileMap: Record<string, any> = {};
    for (const id of artistIds) {
      try {
        const p = await entities.ArtistProfile.get(id);
        if (p) profileMap[id] = p;
      } catch (_) { /* skip */ }
    }

    // Get current global turn for recency calculation
    const { data: turnState } = await supabase
      .from('turn_state')
      .select('global_turn_id')
      .single();
    const currentTurn = N(turnState?.global_turn_id);

    // Score posts using consolidated trending algorithm (favors upcoming accounts)
    const scoredPosts = (posts || []).map((post: any) => {
      const profile = profileMap[post.artist_id] || {};
      const postedTurn = N(post.posted_turn) || N(post.metadata?.posted_turn) || 0;
      const turnsAgo = currentTurn > 0 ? Math.max(0, currentTurn - postedTurn) : 0;
      // Fallback: use created_at age in hours / 1 (1 turn = 1 hour)
      const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
      const effectiveTurnsAgo = turnsAgo > 0 ? turnsAgo : Math.floor(ageHours);

      // Check if post matches any active trends
      const postTags = post.metadata?.hashtags || post.metadata?.seo_tags || [];
      const matchesTrend = postTags.length > 0; // Simplified — real impl would check trends table

      const score = calcTrendingScore({
        views: N(post.views),
        likes: N(post.likes),
        comments: N(post.comments),
        shares: N(post.shares),
        saves: N(post.saves),
        postedTurnsAgo: effectiveTurnsAgo,
        creatorFollowers: N(profile.followers),
        isViral: post.is_viral || false,
        matchesTrend
      });

      return {
        id: post.id,
        artist_id: post.artist_id,
        artist_name: profile.display_name || profile.artist_name || 'Unknown Artist',
        artist_followers: N(profile.followers),
        artist_career_stage: profile.career_stage || 'Underground',
        platform: post.platform,
        post_type: post.post_type,
        title: post.title,
        caption: post.caption,
        views: N(post.views),
        likes: N(post.likes),
        comments: N(post.comments),
        shares: N(post.shares),
        saves: N(post.saves),
        engagement_rate: N(post.engagement_rate),
        is_viral: post.is_viral || false,
        viral_multiplier: N(post.viral_multiplier) || 1,
        revenue: N(post.revenue),
        metadata: post.metadata,
        created_at: post.created_at,
        trending_score: score,
        age_turns: effectiveTurnsAgo
      };
    });

    // Sort by section type
    if (section === 'popular') {
      scoredPosts.sort((a: any, b: any) => N(b.views) - N(a.views));
    } else if (section === 'new') {
      scoredPosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      // 'trending' and 'shorts' — use trending score (favors upcoming accounts)
      scoredPosts.sort((a: any, b: any) => b.trending_score - a.trending_score);
    }

    // Collaboration suggestions (find compatible artists)
    const collabSuggestions: any[] = [];
    if (viewerId) {
      const viewerProfile = profileMap[viewerId] || await entities.ArtistProfile.get(viewerId).catch(() => null);
      if (viewerProfile) {
        // Suggest artists who appear in trending content
        const trendingArtists = scoredPosts
          .slice(0, 20)
          .map((p: any) => p.artist_id)
          .filter((id: string, i: number, arr: string[]) => id !== viewerId && arr.indexOf(id) === i);

        for (const aid of trendingArtists.slice(0, 5)) {
          const ap = profileMap[aid];
          if (ap) {
            const followerRatio = Math.min(N(ap.followers), N(viewerProfile.followers)) /
                                  Math.max(N(ap.followers), N(viewerProfile.followers), 1);
            collabSuggestions.push({
              artist_id: aid,
              display_name: ap.display_name || ap.artist_name,
              followers: N(ap.followers),
              career_stage: ap.career_stage,
              compatibility_score: Math.floor(followerRatio * 80 + 20),
              collab_type: N(ap.followers) > N(viewerProfile.followers) * 2 ? 'Feature' : 'Collaboration'
            });
          }
        }
      }
    }

    const result = scoredPosts.slice(0, limit);
    return Response.json({
      success: true,
      data: {
        content: result,
        section,
        collaboration_suggestions: collabSuggestions,
        filters: { platform, contentType, timePeriod, limit, section },
        stats: {
          total_posts: (posts || []).length,
          viral_posts: (posts || []).filter((p: any) => p.is_viral).length,
          avg_views: (posts || []).length > 0 ? Math.floor((posts || []).reduce((s: number, p: any) => s + N(p.views), 0) / (posts || []).length) : 0,
          platforms: [...new Set((posts || []).map((p: any) => p.platform))]
        }
      }
    });

  } catch (error: any) {
    console.error('For You content error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
