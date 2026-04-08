/**
 * XPRESS HANDLER — Backend calculations for Twitter/X-analog posts
 * All performance calculations and DB writes happen here, NOT in the frontend.
 * 
 * Actions:
 *   createXpressPost  — new text/photo post with optional promotion
 *   xpressLike        — like/unlike a post
 *   xpressRepost      — repost a post (creates repost record + social_post)
 *   xpressQuote       — quote a post (creates quote social_post)
 *   xpressDeletePost  — delete own post and related Xpress records
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { applyRunawaySocialBoost } from '../runawaySongMechanic.ts';

function N(v: unknown): number { return Number(v) || 0; }

// Xpress revenue: $0.008 per 1K views (lowest of all platforms per Dev Bible)
const XPRESS_REVENUE_PER_VIEW = 0.000008;
const RADIO_ALIGNMENT_TAGS = new Set(['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo']);

function calculateXpressPerf(
  followers: number,
  hype: number,
  isPromoted: boolean,
  promotionType: string | null
): { views: number; likes: number; comments: number; shares: number; followerGain: number; revenue: number } {
  const baseViews = 200 + Math.floor(followers * 0.08);
  const hypeMult = 1 + hype / 150;
  const promoMult = isPromoted ? (promotionType === 'targeted' ? 3.5 : 2.2) : 1;
  const variance = 0.7 + Math.random() * 0.6;

  const views = Math.floor(baseViews * hypeMult * promoMult * variance);
  const likes = Math.floor(views * 0.04 * (0.6 + Math.random() * 0.8));
  const comments = Math.floor(likes * 0.15 * (0.4 + Math.random() * 1.2));
  const shares = Math.floor(likes * 0.08 * (0.3 + Math.random() * 1));
  const followerGain = Math.floor(views * 0.0015 * (1 + hype / 250));
  const revenue = views * XPRESS_REVENUE_PER_VIEW;

  return { views, likes, comments, shares, followerGain, revenue };
}

// ─── CREATE POST ────────────────────────────────────────────────
export async function createXpressPost(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      artistId, caption, postType, thumbnailUrl,
      isPromoted, promotionType, linkedReleaseId,
      mentionHandles, hashtags, energyCostOverride,
      subtweetTargetId, alignmentTag
    } = body;

    if (!artistId) {
      return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return Response.json({ success: false, error: 'Artist profile not found' }, { status: 404 });
    }

    if (isPromoted && promotionType === 'targeted' && !linkedReleaseId) {
      return Response.json({ success: false, error: 'Targeted promo requires a linked release' }, { status: 400 });
    }

    if (linkedReleaseId) {
      const { data: linkedRelease, error: linkedReleaseError } = await supabase
        .from('releases')
        .select('id, artist_id, lifecycle_state')
        .eq('id', linkedReleaseId)
        .maybeSingle();

      if (linkedReleaseError) {
        return Response.json({ success: false, error: `Could not verify linked release: ${linkedReleaseError.message}` }, { status: 400 });
      }

      if (!linkedRelease || linkedRelease.artist_id !== artistId) {
        return Response.json({ success: false, error: 'Selected release is invalid for this artist' }, { status: 400 });
      }

      if (isPromoted && promotionType === 'targeted' && linkedRelease.lifecycle_state === 'Scheduled') {
        return Response.json({ success: false, error: 'Targeted promo requires a released single or project' }, { status: 400 });
      }
    }

    // Get social account
    const existingAccounts = await entities.SocialAccount.filter({
      artist_id: artistId,
      platform: 'xpress'
    });
    const account = existingAccounts[0];

    // Energy cost
    const energyCost = energyCostOverride || (isPromoted ? (promotionType === 'targeted' ? 25 : 15) : 3);
    if (N(profile.energy) < energyCost) {
      return Response.json({ success: false, error: `Need ${energyCost} energy (have ${N(profile.energy)})` }, { status: 400 });
    }

    // Money cost for promotions
    if (isPromoted) {
      const moneyCost = promotionType === 'targeted' ? 1500 : 500;
      if (N(profile.income) < moneyCost) {
        return Response.json({ success: false, error: `Need $${moneyCost} for promotion (have $${N(profile.income)})` }, { status: 400 });
      }
    }

    // Calculate performance server-side
    let perf = calculateXpressPerf(
      N(account?.followers || profile.followers),
      N(profile.hype),
      !!isPromoted,
      promotionType || null
    );

    // Check if this post references a runaway song (from turn processor context)
    const runawaySong = body.runawaySong; // Passed from turn processor
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      const socialPostForRunaway = {
        title: (caption || '').substring(0, 60),
        caption: caption || '',
        metadata: {
          linked_release_id: linkedReleaseId || null
        }
      };
      
      // Apply boost to views, likes, comments, shares
      perf = applyRunawaySocialBoost(perf, socialPostForRunaway, runawaySong.runawayData, turnsSinceDetected);
      
      // RECALCULATE derived metrics based on boosted views
      // Xpress revenue: $0.008 per 1K views (matches constant at top of file)
      perf.revenue = perf.views * XPRESS_REVENUE_PER_VIEW;
      
      // Recalculate follower gain
      // Formula matches calculateXpressPerf: Math.floor(views * 0.0015 * (1 + hype / 250));
      perf.followerGain = Math.floor(perf.views * 0.0015 * (1 + N(profile.hype) / 250));
    }

    // Create social post
    const postData: Record<string, unknown> = {
      artist_id: artistId,
      platform: 'xpress',
      post_type: postType || 'text',
      title: (caption || '').substring(0, 60),
      caption: caption || '',
      views: perf.views,
      likes: perf.likes,
      comments: perf.comments,
      shares: perf.shares,
      engagement_rate: perf.views > 0 ? ((perf.likes + perf.comments) / perf.views * 100) : 0,
      revenue: perf.revenue, // BUG-XP-002 FIX: persist calculated revenue
      energy_cost: energyCost,
      status: 'published',
      is_promoted: !!isPromoted,
      metadata: {
        mentions: mentionHandles || [],
        hashtags: hashtags || [],
        is_ad: !!isPromoted,
        promotion_type: promotionType || null,
        linked_release_id: linkedReleaseId || null,
      }
    };
    if (thumbnailUrl) postData.thumbnail_url = thumbnailUrl;
    if (subtweetTargetId) postData.subtweet_target_id = subtweetTargetId;
    if (alignmentTag) postData.alignment_tag = alignmentTag;
    if (alignmentTag && RADIO_ALIGNMENT_TAGS.has(alignmentTag)) {
      const metadata = (postData.metadata as Record<string, unknown>) || {};
      postData.metadata = {
        ...metadata,
        radio_alignment: alignmentTag,
      };
    }

    const socialPost = await entities.SocialPost.create(postData);

    // Create campaign record if promoted
    if (isPromoted && socialPost) {
      const moneyCost = promotionType === 'targeted' ? 1500 : 500;
      const hypeGained = promotionType === 'targeted' ? 12 : 5;
      await supabase.from('xpress_campaigns').insert({
        post_id: socialPost.id,
        artist_id: artistId,
        promotion_type: promotionType,
        linked_release_id: linkedReleaseId || null,
        energy_spent: energyCost,
        money_spent: moneyCost,
        impressions: perf.views,
        engagements: perf.likes + perf.comments + perf.shares,
        hype_gained: hypeGained,
        status: 'active',
      });

      // Deduct promotion money cost
      await entities.ArtistProfile.update(artistId, {
        income: N(profile.income) - moneyCost
      });

      // Targeted promo with a linked release → boost that release's streams
      // ~2% of promo views convert to streams (realistic social→stream funnel)
      if (promotionType === 'targeted' && linkedReleaseId) {
        try {
          const streamBoost = Math.floor(perf.views * 0.02);
          if (streamBoost > 0) {
            const { data: releaseRow } = await supabase
              .from('releases')
              .select('id, lifetime_streams')
              .eq('id', linkedReleaseId)
              .maybeSingle();
            if (releaseRow) {
              await supabase
                .from('releases')
                .update({ lifetime_streams: N(releaseRow.lifetime_streams) + streamBoost })
                .eq('id', linkedReleaseId);
            }
          }
        } catch (_e) { /* non-critical */ }
      }
    }

    // Update or create social account
    if (account) {
      await entities.SocialAccount.update(account.id, {
        followers: N(account.followers),
        total_posts: N(account.total_posts) + 1,
        total_views: N(account.total_views) + perf.views,
        total_likes: N(account.total_likes) + perf.likes,
        total_revenue: N(account.total_revenue) + perf.revenue // BUG-XP-002 FIX: accumulate revenue
      });
    } else {
      await entities.SocialAccount.create({
        artist_id: artistId,
        platform: 'xpress',
        followers: 0,
        total_posts: 1,
        total_views: perf.views,
        total_likes: perf.likes,
        total_revenue: 0
      });
    }

    // Update artist profile (energy + followers + hype from promotion)
    const hypeGainForProfile = isPromoted ? (promotionType === 'targeted' ? 12 : 5) : 0; // BUG-XP-001 FIX
    await entities.ArtistProfile.update(artistId, {
      energy: N(profile.energy) - energyCost,
      followers: N(profile.followers),
      hype: Math.min(100, N(profile.hype) + hypeGainForProfile)
    });

    // Handle mentions — create xpress_mentions + notifications
    if (mentionHandles?.length > 0 && socialPost) {
      const { data: mentionedPlayers } = await supabase
        .from('profiles')
        .select('id, xpress_handle, artist_name')
        .or(mentionHandles.map((h: string) => `xpress_handle.eq.${h},artist_name.ilike.${h}`).join(','));

      if (mentionedPlayers?.length > 0) {
        await supabase.from('xpress_mentions').insert(
          mentionedPlayers.map((p: { id: string }) => ({
            post_id: socialPost.id,
            mentioned_player_id: p.id,
            mentioner_id: artistId,
          }))
        );

        const notifInserts = mentionedPlayers
          .filter((p: { id: string }) => p.id !== artistId)
          .map((p: { id: string }) => ({
            recipient_id: p.id,
            actor_id: artistId,
            type: 'mention',
            post_id: socialPost.id,
            preview_text: (caption || '').substring(0, 40),
          }));
        if (notifInserts.length > 0) {
          await supabase.from('xpress_notifications').upsert(notifInserts, { onConflict: 'recipient_id,actor_id,type,post_id', ignoreDuplicates: true });
        }
      }
    }

    try {
      const { data: tsRow } = await supabase
        .from('turn_state')
        .select('global_turn_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      const currentTurn = Number(tsRow?.global_turn_id) || 0;
      await supabase.from('turn_event_log').insert([
        {
          player_id: artistId,
          global_turn_id: currentTurn,
          module: 'xpress',
          event_type: 'SOCIAL_POST_CREATED',
          description: 'Xpress post created',
          metadata: { platform: 'xpress', post_id: socialPost.id, post_type: postType || 'text' },
        },
        {
          player_id: artistId,
          global_turn_id: currentTurn,
          module: 'xpress',
          event_type: 'SOCIAL_ENGAGEMENT_SEEDED',
          description: 'Xpress initial engagement seeded',
          metadata: { platform: 'xpress', post_id: socialPost.id, views: perf.views, likes: perf.likes, comments: perf.comments, shares: perf.shares },
        },
      ]);
    } catch (_err) { /* non-fatal */ }

    return Response.json({
      success: true,
      data: {
        socialPost,
        performance: perf
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Xpress Handler] createXpressPost error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── LIKE / UNLIKE ──────────────────────────────────────────────
export async function xpressLike(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, playerId, unlike } = body;

    if (!postId || !playerId) {
      return Response.json({ success: false, error: 'Missing postId or playerId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    if (unlike) {
      await supabase.from('xpress_likes').delete().eq('post_id', postId).eq('liker_id', playerId);
      const { data: post } = await supabase.from('social_posts').select('likes').eq('id', postId).maybeSingle();
      if (post) await supabase.from('social_posts').update({ likes: Math.max(0, N(post.likes) - 1) }).eq('id', postId);
    } else {
      await supabase.from('xpress_likes').insert({ post_id: postId, liker_id: playerId });
      const { data: post } = await supabase.from('social_posts').select('likes, artist_id, title').eq('id', postId).maybeSingle();
      if (post) await supabase.from('social_posts').update({ likes: N(post.likes) + 1 }).eq('id', postId);

      // Notify post owner via xpress_notifications (not main inbox)
      if (post?.artist_id && post.artist_id !== playerId) {
        const { data: liker } = await supabase.from('profiles').select('artist_name').eq('id', playerId).single();
        try {
          await supabase.from('xpress_notifications').upsert({
            recipient_id: post.artist_id,
            actor_id: playerId,
            type: 'like',
            post_id: postId,
            preview_text: (post.title || '').substring(0, 40),
          }, { onConflict: 'recipient_id,actor_id,type,post_id', ignoreDuplicates: true });
        } catch (_) {}
      }
    }

    return Response.json({ success: true, liked: !unlike });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Duplicate like is not an error
    if (msg.includes('duplicate')) {
      return Response.json({ success: true, liked: true });
    }
    console.error('[Xpress Handler] xpressLike error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── REPOST ─────────────────────────────────────────────────────
export async function xpressRepost(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, playerId } = body;

    if (!postId || !playerId) {
      return Response.json({ success: false, error: 'Missing postId or playerId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    // Insert tracking record
    await supabase.from('xpress_reposts').insert({ original_post_id: postId, reposter_id: playerId });

    // Increment shares on original post
    const { data: post } = await supabase.from('social_posts').select('shares, artist_id, title').eq('id', postId).single();
    await supabase.from('social_posts').update({ shares: N(post?.shares) + 1 }).eq('id', postId);

    // Create repost social_post so it appears in the feed
    const entities = createSupabaseEntitiesAdapter(supabase);
    const repost = await entities.SocialPost.create({
      artist_id: playerId,
      platform: 'xpress',
      post_type: 'repost',
      title: '',
      caption: '',
      reacting_to_post_id: postId,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      status: 'published',
    });

    // Notify post owner via xpress_notifications (not main inbox)
    if (post?.artist_id && post.artist_id !== playerId) {
      try {
        await supabase.from('xpress_notifications').upsert({
          recipient_id: post.artist_id,
          actor_id: playerId,
          type: 'repost',
          post_id: postId,
          preview_text: (post.title || '').substring(0, 40),
        }, { onConflict: 'recipient_id,actor_id,type,post_id', ignoreDuplicates: true });
      } catch (_) {}
    }

    return Response.json({ success: true, data: { repost } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('duplicate')) {
      return Response.json({ success: true, alreadyReposted: true });
    }
    console.error('[Xpress Handler] xpressRepost error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── QUOTE POST ─────────────────────────────────────────────────
export async function xpressQuote(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, playerId, quoteText } = body;

    if (!postId || !playerId || !quoteText?.trim()) {
      return Response.json({ success: false, error: 'Missing postId, playerId, or quoteText' }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Create a quote post referencing the original
    const quotePost = await entities.SocialPost.create({
      artist_id: playerId,
      platform: 'xpress',
      post_type: 'quote',
      title: quoteText.substring(0, 60),
      caption: quoteText,
      reacting_to_post_id: postId,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      status: 'published',
    });

    // Track in xpress_reposts (quote is a type of repost)
    await supabase.from('xpress_reposts').insert({
      original_post_id: postId,
      reposter_id: playerId,
      quote_text: quoteText,
    });

    // Increment shares on original post
    const { data: post } = await supabase.from('social_posts').select('shares').eq('id', postId).single();
    await supabase.from('social_posts').update({ shares: N(post?.shares) + 1 }).eq('id', postId);

    return Response.json({ success: true, data: { quotePost } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('duplicate')) {
      return Response.json({ success: true, alreadyQuoted: true });
    }
    console.error('[Xpress Handler] xpressQuote error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── COMMENT ────────────────────────────────────────────────────
export async function xpressComment(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, playerId, content, postOwnerId } = body;

    if (!postId || !playerId || !content?.trim()) {
      return Response.json({ success: false, error: 'Missing postId, playerId, or content' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    // Create comment
    const { data: comment, error: commentErr } = await supabase
      .from('xpress_comments')
      .insert({
        post_id: postId,
        author_id: playerId,
        content: content.trim(),
      })
      .select('*')
      .single();

    if (commentErr) {
      return Response.json({ success: false, error: commentErr.message }, { status: 500 });
    }

    // Create notification for post owner (if different from commenter)
    if (postOwnerId && postOwnerId !== playerId) {
      await supabase.from('xpress_notifications').upsert({
        recipient_id: postOwnerId,
        actor_id: playerId,
        type: 'reply',
        post_id: postId,
        preview_text: content.trim().substring(0, 40),
      }, { onConflict: 'recipient_id,actor_id,type,post_id', ignoreDuplicates: true });

      // xpress_notifications insert already handles this above — no main inbox write
    }

    return Response.json({ success: true, data: { comment } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Xpress Handler] xpressComment error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── FOLLOW / UNFOLLOW ──────────────────────────────────────────
export async function xpressFollow(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { followerId, targetId, unfollow } = body;

    if (!followerId || !targetId || followerId === targetId) {
      return Response.json({ success: false, error: 'Invalid follow request' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    if (unfollow) {
      await supabase.from('xpress_follows').delete()
        .eq('follower_id', followerId)
        .eq('following_id', targetId);
        
      // Decrement follower count in social_accounts
      const { data: accounts } = await supabase.from('social_accounts')
        .select('id, followers')
        .eq('artist_id', targetId)
        .eq('platform', 'xpress');
        
      if (accounts && accounts.length > 0) {
        await supabase.from('social_accounts')
          .update({ followers: Math.max(0, N(accounts[0].followers) - 1) })
          .eq('id', accounts[0].id);
      }
    } else {
      await supabase.from('xpress_follows').insert({
        follower_id: followerId,
        following_id: targetId,
      });

      // Increment follower count in social_accounts
      const { data: accounts } = await supabase.from('social_accounts')
        .select('id, followers')
        .eq('artist_id', targetId)
        .eq('platform', 'xpress');
        
      if (accounts && accounts.length > 0) {
        await supabase.from('social_accounts')
          .update({ followers: N(accounts[0].followers) + 1 })
          .eq('id', accounts[0].id);
      }

      // Notify the target via xpress_notifications (not main inbox)
      try {
        await supabase.from('xpress_notifications').upsert({
          recipient_id: targetId,
          actor_id: followerId,
          type: 'follow',
        }, { onConflict: 'recipient_id,actor_id,type,post_id', ignoreDuplicates: true });
      } catch (_) {}
    }

    return Response.json({ success: true, following: !unfollow });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('duplicate')) {
      return Response.json({ success: true, following: true });
    }
    console.error('[Xpress Handler] xpressFollow error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── DELETE POST ────────────────────────────────────────────────
export async function xpressDeletePost(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, playerId } = body;

    if (!postId || !playerId) {
      return Response.json({ success: false, error: 'Missing postId or playerId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('id, artist_id, reacting_to_post_id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      return Response.json({ success: false, error: postError.message }, { status: 500 });
    }

    if (!post) {
      return Response.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    if (post.artist_id !== playerId) {
      return Response.json({ success: false, error: 'You can only delete your own posts' }, { status: 403 });
    }

    const { data: childPosts, error: childPostsError } = await supabase
      .from('social_posts')
      .select('id')
      .eq('reacting_to_post_id', postId);

    if (childPostsError) {
      return Response.json({ success: false, error: childPostsError.message }, { status: 500 });
    }

    const childPostIds = (childPosts || []).map((row: { id: string }) => row.id);
    const postIdsToDelete = [postId, ...childPostIds];

    await supabase.from('xpress_notifications').delete().in('post_id', postIdsToDelete);
    await supabase.from('xpress_mentions').delete().in('post_id', postIdsToDelete);
    await supabase.from('xpress_comments').delete().in('post_id', postIdsToDelete);
    await supabase.from('xpress_likes').delete().in('post_id', postIdsToDelete);
    await supabase.from('xpress_campaigns').delete().in('post_id', postIdsToDelete);
    await supabase.from('xpress_reposts').delete().in('original_post_id', postIdsToDelete);
    await supabase.from('social_posts').delete().in('id', postIdsToDelete);

    return Response.json({ success: true, deletedPostIds: postIdsToDelete });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Xpress Handler] xpressDeletePost error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── ENSURE ACCOUNT ─────────────────────────────────────────────
export async function xpressEnsureAccount(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, initialFollowers } = body;

    if (!artistId) {
      return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Check if account already exists
    const existing = await entities.SocialAccount.filter({
      artist_id: artistId,
      platform: 'xpress'
    });

    if (existing.length > 0) {
      return Response.json({ success: true, data: { account: existing[0], created: false } });
    }

    // Create new account
    const account = await entities.SocialAccount.create({
      artist_id: artistId,
      platform: 'xpress',
      followers: initialFollowers || 0,
    });

    return Response.json({ success: true, data: { account, created: true } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Xpress Handler] xpressEnsureAccount error:', msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
