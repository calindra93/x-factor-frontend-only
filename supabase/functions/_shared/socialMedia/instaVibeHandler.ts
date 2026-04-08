/**
 * INSTAVIBE HANDLER — Backend calculations for Instagram-analog posts
 * All performance calculations happen here, NOT in the frontend.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { getBrandDealsForPlayer, acceptBrandDealForPlayer, declineBrandDealForPlayer, linkSponsoredContent } from '../brandDealsModule.ts';
import { deductEnergy } from './energyDeduct.ts';

function N(v: unknown): number { return Number(v) || 0; }

function normalizeBrandKey(brandName: unknown): string {
  return String(brandName || '').trim().toLowerCase();
}

function getBrandLoyaltyTier(score: number): 'cold' | 'neutral' | 'warm' | 'favored' | 'elite' {
  if (score <= -4) return 'cold';
  if (score <= 2) return 'neutral';
  if (score <= 5) return 'warm';
  if (score <= 8) return 'favored';
  return 'elite';
}

const POST_TYPES: Record<string, { baseViews: number; engagement: number; energyCost: number }> = {
  photo:    { baseViews: 400,  engagement: 0.06, energyCost: 3 },
  carousel: { baseViews: 700,  engagement: 0.08, energyCost: 5 },
  story:    { baseViews: 300,  engagement: 0.10, energyCost: 2 },
  reel:     { baseViews: 1000, engagement: 0.07, energyCost: 6 },
  live:     { baseViews: 1500, engagement: 0.12, energyCost: 10 },
  exclusive_drop: { baseViews: 600, engagement: 0.12, energyCost: 5 },
  community_post: { baseViews: 650, engagement: 0.11, energyCost: 4 },
};

const RADIO_ALIGNMENT_TAGS = new Set(['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo']);

export async function createInstaVibePost(req: Request): Promise<Response> {
  const traceId = crypto.randomUUID();
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON', details: { code: 'BAD_REQUEST' }, traceId }, { status: 400 });
    }
    const {
      artistId,
      postType,
      title,
      caption,
      linkedReleaseId,
      energyCost: clientEnergyCost,
      imageUrl,
      alignmentTag,
      sponsoredBrand,
      sponsoredDealId,
    } = body;
    console.log('[InstaVibe:create] traceId=' + traceId + ' artistId=' + artistId + ' postType=' + postType + ' captionLen=' + (caption?.length ?? 0) + ' imageUrlPrefix=' + (imageUrl ? imageUrl.slice(0, 30) : 'none') + ' linkedReleaseId=' + (linkedReleaseId || 'none'));

    if (!artistId || !postType) {
      return Response.json({ error: 'Missing artistId or postType', details: { code: 'MISSING_PARAMS', artistId: !!artistId, postType: !!postType }, traceId }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return Response.json({ error: 'Artist profile not found', details: { code: 'NOT_FOUND', artistId }, traceId }, { status: 404 });
    }

    const type = POST_TYPES[postType] || POST_TYPES.photo;
    const energyCost = clientEnergyCost || type.energyCost;

    // Pre-flight energy check (fast-fail for user feedback; authoritative deduction happens atomically below)
    if (N(profile.energy) < energyCost) {
      return Response.json({ error: `Need ${energyCost} energy (have ${N(profile.energy)})`, details: { code: 'INSUFFICIENT_ENERGY', required: energyCost, available: N(profile.energy) }, traceId }, { status: 400 });
    }

    // Atomic energy deduction via RPC — prevents concurrent double-spend
    const energyResult = await deductEnergy(supabase, artistId, energyCost);
    if (!energyResult.success) {
      return Response.json({ error: `Insufficient energy for post (need ${energyCost})`, details: { code: 'INSUFFICIENT_ENERGY', required: energyCost }, traceId }, { status: 400 });
    }

    // Get existing social account
    const existingAccounts = await entities.SocialAccount.filter({
      artist_id: artistId,
      platform: 'instavibe'
    });
    const socialAccount = existingAccounts[0];

    // Calculate performance metrics server-side (FIXED: Use realistic multipliers)
    const followers = N(socialAccount?.followers || (profile.fans ?? profile.followers));
    const hype = N(profile.hype);
    const followerMult = 1 + Math.min(followers / 50000, 5); // Cap at 5x for 50K+ followers
    const hypeMult = 1 + hype / 120;

    const reach = Math.floor(type.baseViews * followerMult * hypeMult * (0.8 + Math.random() * 0.4));
    const likes = Math.floor(reach * type.engagement * (0.7 + Math.random() * 0.6));
    const comments = Math.floor(likes * 0.12 * (0.5 + Math.random() * 1));
    const saves = Math.floor(likes * 0.08);
    const shares = Math.floor(likes * 0.05);
    const followerGain = Math.floor(reach * 0.008 * (1 + hype / 200));
    const revenue = reach * 0.0005; // $0.50/1K reach per Dev Bible
    const engagementRate = Math.floor((likes + comments) / Math.max(reach, 1) * 1000) / 10;

    // Validate linked release belongs to this artist and is actually released
    let validatedReleaseId: string | null = null;
    if (linkedReleaseId) {
      const { data: releaseRow, error: releaseErr } = await supabase
        .from('releases')
        .select('id, artist_id, release_status, lifecycle_state, title, release_name')
        .eq('id', linkedReleaseId)
        .eq('artist_id', artistId)
        .single();
      if (releaseErr || !releaseRow) {
        return Response.json({
          error: 'Release not found or does not belong to this artist',
          details: { code: 'RELEASE_NOT_FOUND', linkedReleaseId, artistId, dbError: releaseErr?.message },
          traceId,
        }, { status: 400 });
      }
      // Covers all real lifecycle_state values observed in production
      const RELEASED_STATES = ['Hot','Trending','Momentum','Stable','Fading','Declining','Archived'];
      const isReleased = releaseRow.release_status === 'released' ||
        RELEASED_STATES.includes(releaseRow.lifecycle_state);
      if (!isReleased) {
        return Response.json({
          error: 'Release must be published before linking to a post',
          details: { code: 'RELEASE_NOT_PUBLISHED', release_id: releaseRow.id, release_status: releaseRow.release_status, lifecycle_state: releaseRow.lifecycle_state },
          traceId,
        }, { status: 400 });
      }
      validatedReleaseId = releaseRow.id;
    }

    // Create social post
    const postPayload: Record<string, unknown> = {
      artist_id: artistId,
      platform: 'instavibe',
      post_type: postType,
      title: title || postType,
      caption: caption || `New ${postType} post`,
      linked_release_id: validatedReleaseId,
      views: reach,
      likes,
      comments,
      saves,
      shares,
      engagement_rate: engagementRate,
      revenue: 0,
      energy_cost: energyCost,
      status: 'published',
      alignment_tag: alignmentTag || null,
      metadata: {
        energy_cost: energyCost,
        sponsored_brand: sponsoredBrand || null,
        sponsored_deal_id: sponsoredDealId || null,
        radio_alignment: alignmentTag && RADIO_ALIGNMENT_TAGS.has(alignmentTag) ? alignmentTag : null,
      },
    };
    // Only persist a real https URL — never a blob: or data: URL
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
      postPayload.content_url = imageUrl;
    }
    const socialPost = await entities.SocialPost.create(postPayload);

    // Post-insert verify: confirm the row exists with correct platform/status
    if (socialPost?.id) {
      const { data: verifyRow } = await supabase
        .from('social_posts')
        .select('id, platform, status, created_at, content_url')
        .eq('id', socialPost.id)
        .single();
      console.log('[InstaVibe:create] traceId=' + traceId + ' post_id=' + socialPost.id + ' verified=' + JSON.stringify(verifyRow));
    }

    // Insert into instavibe_post_songs junction table (idempotent: upsert ignores duplicate post_id)
    if (validatedReleaseId && socialPost?.id) {
      const { error: songInsertErr } = await supabase
        .from('instavibe_post_songs')
        .upsert(
          { post_id: socialPost.id, release_id: validatedReleaseId },
          { onConflict: 'post_id', ignoreDuplicates: true }
        );
      if (songInsertErr) {
        // Non-fatal: log but don't fail the whole post
        console.warn('[InstaVibe] instavibe_post_songs insert failed (non-fatal):', songInsertErr.message, songInsertErr.code);
      }
    }

    if (sponsoredDealId && socialPost?.id) {
      try {
        const { data: tsRow } = await supabase
          .from('turn_state')
          .select('global_turn_id')
          .eq('id', 1)
          .maybeSingle();
        const turnId = tsRow?.global_turn_id ?? 0;
        await linkSponsoredContent(artistId, String(sponsoredDealId), socialPost.id, 'instavibe', turnId);
      } catch (linkErr) {
        console.warn('[InstaVibe] Sponsored contract link failed (non-fatal):', linkErr instanceof Error ? linkErr.message : linkErr);
      }
    }

    // Update or create social account
    if (socialAccount) {
      await entities.SocialAccount.update(socialAccount.id, {
        followers: N(socialAccount.followers),
        total_posts: N(socialAccount.total_posts) + 1,
        total_views: N(socialAccount.total_views) + reach,
        total_likes: N(socialAccount.total_likes) + likes,
        total_engagement: N(socialAccount.total_engagement) + likes + comments + shares + saves,
        total_revenue: N(socialAccount.total_revenue)
      });
    } else {
      await entities.SocialAccount.create({
        artist_id: artistId,
        platform: 'instavibe',
        followers: 0,
        total_posts: 1,
        total_views: reach,
        total_likes: likes,
        total_engagement: likes + comments + shares + saves,
        total_revenue: 0
      });
    }

    // Update artist profile (energy already deducted atomically via RPC)
    await entities.ArtistProfile.update(artistId, {
      followers: N((profile.fans ?? profile.followers)),
      income: N(profile.income || 0)
    });

    // Log turn event (non-fatal)
    try {
      const { data: tsRow } = await supabase
        .from('turn_state')
        .select('global_turn_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      const turnId = tsRow?.global_turn_id ?? 0;
      await supabase.from('turn_event_log').insert([
        {
          player_id: artistId,
          global_turn_id: turnId,
          module: 'instavibe',
          event_type: 'SOCIAL_POST_CREATED',
          description: 'InstaVibe post published',
          metadata: {
            platform: 'instavibe',
            post_id: socialPost?.id,
            post_type: postType,
            has_song_attachment: !!validatedReleaseId,
          },
        },
        {
          player_id: artistId,
          global_turn_id: turnId,
          module: 'instavibe',
          event_type: 'SOCIAL_ENGAGEMENT_SEEDED',
          description: 'InstaVibe initial engagement seeded',
          metadata: {
            platform: 'instavibe',
            post_id: socialPost?.id,
            views: reach,
            likes,
            comments,
            shares,
            saves,
          },
        },
      ]);
    } catch (_) { /* non-fatal */ }

    console.log('[InstaVibe:create] traceId=' + traceId + ' SUCCESS post_id=' + socialPost?.id + ' sponsored=' + String(!!sponsoredDealId));
    return Response.json({
      success: true,
      traceId,
      data: {
        socialPost,
        performance: {
          reach,
          likes,
          comments,
          saves,
          shares,
          followerGain,
          revenue,
          energyCost,
          engagementRate
        }
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[InstaVibe] createInstaVibePost UNHANDLED ERROR traceId=' + traceId + ':', JSON.stringify({ message: msg, stack }));
    return Response.json({ error: msg, details: { code: 'INTERNAL_ERROR' }, traceId }, { status: 500 });
  }
}

export async function getInstaVibeBrandDeals(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, platform = 'instavibe', statuses } = body;
    if (!artistId) return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });

    const supabase = supabaseAdmin;

    // Fetch offers/contracts from brand_deal_contracts (new schema only)
    let contractsQuery = supabase
      .from('brand_deal_contracts')
      .select('*')
      .eq('player_id', artistId)
      .filter('platform_scope', 'cs', `{${platform}}`)
      .order('created_at', { ascending: false });

    if (statuses && Array.isArray(statuses) && statuses.length > 0) {
      contractsQuery = contractsQuery.in('status', statuses);
    }

    const { data: deals, error } = await contractsQuery;
    if (error) throw error;

    // Fetch all active contracts from brand_deal_contracts (without platform filter, for the contracts key)
    const { data: contracts } = await supabase
      .from('brand_deal_contracts')
      .select('*')
      .eq('player_id', artistId)
      .order('created_at', { ascending: false });

    // Fetch recent payout history
    const { data: payouts } = await supabase
      .from('brand_deal_payout_log')
      .select('*')
      .eq('player_id', artistId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch player brand stats
    const { data: statsRows } = await supabase
      .from('player_brand_stats')
      .select('*')
      .eq('artist_id', artistId)
      .eq('platform', platform)
      .limit(1);

    const { data: loyaltyRows } = await supabase
      .from('player_brand_affinity')
      .select('brand_key, affinity_score')
      .eq('player_id', artistId);

    const loyaltyByBrand = new Map((loyaltyRows || []).map((row: any) => [normalizeBrandKey(row.brand_key), getBrandLoyaltyTier(Math.max(-10, Math.min(10, Number(row.affinity_score) || 0)))]));

    return Response.json({
      success: true,
      deals: (deals || []).map((deal: any) => ({ ...deal, loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(deal.brand_name)) || 'neutral' })),
      contracts: (contracts || []).map((contract: any) => ({ ...contract, loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(contract.brand_name)) || 'neutral' })),
      payouts: payouts || [],
      stats: statsRows?.[0] || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function acceptInstaVibeBrandDeal(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, dealId, globalTurnId = 0 } = body;
    if (!artistId || !dealId) return Response.json({ success: false, error: 'Missing artistId or dealId' }, { status: 400 });
    const result = await acceptBrandDealForPlayer(artistId, dealId, globalTurnId);
    // Return contract data — no instant clout or payout. Money arrives via turn processing.
    return Response.json({ success: true, deal: result.deal, contract: result.contract, cloutGain: 0 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function declineInstaVibeBrandDeal(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, dealId } = body;
    if (!artistId || !dealId) return Response.json({ success: false, error: 'Missing artistId or dealId' }, { status: 400 });
    await declineBrandDealForPlayer(artistId, dealId);
    return Response.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function completeInstaVibeBrandDeal(req: Request): Promise<Response> {
  // Deals complete automatically via the turn engine when end_turn_id is reached.
  // Manual completion is no longer supported — this handler returns informational success.
  return Response.json({
    success: true,
    payout: 0,
    message: 'Brand deals complete automatically at end of contract term via turn processing.',
  });
}

// ─── FEED ────────────────────────────────────────────────────────────────────
// Returns global feed of instavibe posts with author profile data, like/comment counts,
// and whether the requesting player has liked each post.
export async function getInstaVibeFeed(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, limit = 20, offset = 0, feedType = 'global' } = body;

    const supabase = supabaseAdmin;

    // Build base query: all instavibe posts with author profile join + song attachment
    const feedRequestId = crypto.randomUUID();
    console.log('[InstaVibe:feed] requestId=' + feedRequestId + ' artistId=' + (artistId || 'none') + ' feedType=' + feedType + ' limit=' + limit + ' offset=' + offset);

    // Step 1: fetch posts (no embedded joins — avoids PostgREST FK resolution issues)
    let postsQuery = supabase
      .from('social_posts')
      .select('id, artist_id, post_type, title, caption, views, likes, comments, like_count, comment_count, engagement_rate, revenue, status, linked_release_id, content_url, created_at, updated_at')
      .eq('platform', 'instavibe')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Following feed: only posts from artists this player follows
    if (feedType === 'following' && artistId) {
      const { data: follows } = await supabase
        .from('instavibe_follows')
        .select('following_id')
        .eq('follower_id', artistId);
      const followingIds = (follows || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        return Response.json({ success: true, posts: [], hasMore: false });
      }
      postsQuery = postsQuery.in('artist_id', followingIds);
    }

    const { data: posts, error } = await postsQuery;
    if (error) {
      console.error('[InstaVibe:feed] requestId=' + feedRequestId + ' QUERY ERROR:', error.message, error.code);
      throw error;
    }
    console.log('[InstaVibe:feed] requestId=' + feedRequestId + ' returned=' + (posts?.length ?? 0) + ' firstCreatedAt=' + (posts?.[0]?.created_at || 'none'));

    if (!posts || posts.length === 0) {
      return Response.json({ success: true, posts: [], hasMore: false });
    }

    const postIds = posts.map((p: any) => p.id);
    const artistIds = [...new Set(posts.map((p: any) => p.artist_id).filter(Boolean))];

    // Step 2: batch-fetch profiles, song attachments, and likes in parallel
    const [profilesRes, songsRes, likesRes] = await Promise.all([
      artistIds.length > 0
        ? supabase.from('profiles').select('id, artist_name, instavibe_handle, instavibe_avatar, artist_image, followers, instavibe_follower_count, career_stage').in('id', artistIds)
        : { data: [] },
      supabase.from('instavibe_post_songs').select('post_id, release_id, releases:release_id(id, title, release_name, cover_artwork_url, project_type, lifecycle_state)').in('post_id', postIds),
      artistId
        ? supabase.from('instavibe_post_likes').select('post_id').eq('liker_id', artistId).in('post_id', postIds)
        : { data: [] },
    ]);

    // Build lookup maps
    const profileMap: Record<string, any> = {};
    for (const p of (profilesRes.data || [])) profileMap[p.id] = p;

    const songMap: Record<string, any> = {};
    for (const s of (songsRes.data || [])) {
      if (!songMap[s.post_id]) songMap[s.post_id] = s;
    }

    // Fetch which posts the current player has liked (batch)
    const likedPostIds = new Set<string>((likesRes.data || []).map((l: any) => l.post_id));

    const enriched = (posts || []).map((p: any) => {
      // Resolve author profile and attached release from lookup maps
      const author = profileMap[p.artist_id] || null;
      const songAttachment = songMap[p.id] || null;
      const attachedRelease = songAttachment?.releases || null;
      const releaseTitle = attachedRelease?.release_name || attachedRelease?.title || null;
      const artistName = author?.instavibe_handle || author?.artist_name || null;
      const musicTag = releaseTitle && artistName ? `${releaseTitle} - ${artistName}` : releaseTitle || null;

      return {
        ...p,
        liked_by_me: likedPostIds.has(p.id),
        author,
        profiles: undefined,
        instavibe_post_songs: undefined,
        attached_release: attachedRelease,
        musicTag,
        // Map DB column to frontend field name; only set when a real URL exists
        image: p.content_url || null,
        content_url: undefined,
      };
    });

    return Response.json({ success: true, posts: enriched, hasMore: enriched.length === limit });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── LIKES ───────────────────────────────────────────────────────────────────
export async function likeInstaVibePost(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, postId } = body;
    if (!artistId || !postId) return Response.json({ success: false, error: 'Missing artistId or postId' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('like_instavibe_post', {
      p_post_id: postId,
      p_liker_id: artistId,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function unlikeInstaVibePost(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, postId } = body;
    if (!artistId || !postId) return Response.json({ success: false, error: 'Missing artistId or postId' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('unlike_instavibe_post', {
      p_post_id: postId,
      p_liker_id: artistId,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── COMMENTS ────────────────────────────────────────────────────────────────
export async function getInstaVibeComments(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { postId, limit = 30, offset = 0 } = body;
    if (!postId) return Response.json({ success: false, error: 'Missing postId' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('instavibe_post_comments')
      .select(`
        id, post_id, body, created_at,
        profiles:author_id ( id, artist_name, instavibe_handle, instavibe_avatar, artist_image )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const comments = (data || []).map((c: any) => ({ ...c, author: c.profiles, profiles: undefined }));
    return Response.json({ success: true, comments });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function addInstaVibeComment(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, postId, commentBody } = body;
    if (!artistId || !postId || !commentBody) return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('add_instavibe_comment', {
      p_post_id: postId,
      p_author_id: artistId,
      p_body: commentBody,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function deleteInstaVibeComment(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, commentId } = body;
    if (!artistId || !commentId) return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('delete_instavibe_comment', {
      p_comment_id: commentId,
      p_author_id: artistId,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── FOLLOWS ─────────────────────────────────────────────────────────────────
export async function followInstaVibeUser(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, targetId } = body;
    if (!artistId || !targetId) return Response.json({ success: false, error: 'Missing artistId or targetId' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('follow_instavibe_user', {
      p_follower_id: artistId,
      p_following_id: targetId,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function unfollowInstaVibeUser(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, targetId } = body;
    if (!artistId || !targetId) return Response.json({ success: false, error: 'Missing artistId or targetId' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('unfollow_instavibe_user', {
      p_follower_id: artistId,
      p_following_id: targetId,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
export async function getInstaVibeProfile(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { targetId, viewerId } = body;
    if (!targetId) return Response.json({ success: false, error: 'Missing targetId' }, { status: 400 });

    const supabase = supabaseAdmin;

    const [profileRes, postsRes, followRes, accountRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, artist_name, instavibe_handle, instavibe_bio, instavibe_avatar, artist_image, followers, instavibe_follower_count, instavibe_following_count, career_stage, genre, bio')
        .eq('id', targetId)
        .single(),
      supabase
        .from('social_posts')
        .select('id, post_type, content_url, views, like_count, comment_count, created_at')
        .eq('artist_id', targetId)
        .eq('platform', 'instavibe')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(12),
      viewerId ? supabase
        .from('instavibe_follows')
        .select('follower_id')
        .eq('follower_id', viewerId)
        .eq('following_id', targetId)
        .maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('social_accounts')
        .select('followers, total_views, total_posts')
        .eq('artist_id', targetId)
        .eq('platform', 'instavibe')
        .maybeSingle(),
    ]);

    if (profileRes.error) throw profileRes.error;

    // Merge authoritative social_accounts follower count into the profile
    const profile = profileRes.data as Record<string, unknown>;
    const account = accountRes.data;
    if (account) {
      // social_accounts.followers is the authoritative per-platform count
      profile.instavibe_follower_count = account.followers || profile.instavibe_follower_count || (profile.fans ?? profile.followers) || 0;
    }

    return Response.json({
      success: true,
      profile,
      posts: postsRes.data || [],
      is_following: !!(followRes.data),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function updateInstaVibeProfile(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, displayName, bio, avatarUrl } = body;
    if (!artistId) return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });

    const patch: Record<string, string> = {};
    if (displayName !== undefined) patch.instavibe_handle = String(displayName).slice(0, 30);
    if (bio !== undefined) patch.instavibe_bio = String(bio).slice(0, 150);
    if (avatarUrl !== undefined) patch.instavibe_avatar = String(avatarUrl);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', artistId);
    if (error) throw error;

    return Response.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── CHANNEL (BROADCAST) ─────────────────────────────────────────────────────
export async function getInstaVibeChannel(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, viewerId, limit = 20 } = body;
    if (!artistId) return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });

    const supabase = supabaseAdmin;

    const { data: messages, error } = await supabase
      .from('instavibe_channel_messages')
      .select('id, body, created_at')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    if (!messages || messages.length === 0) {
      return Response.json({ success: true, messages: [] });
    }

    // Fetch reaction counts per message
    const msgIds = messages.map((m: any) => m.id);
    const { data: reactions } = await supabase
      .from('instavibe_channel_reactions')
      .select('message_id, emoji')
      .in('message_id', msgIds);

    // Fetch which ones the viewer has reacted to
    let myReactions: Record<string, Set<string>> = {};
    if (viewerId) {
      const { data: myRxns } = await supabase
        .from('instavibe_channel_reactions')
        .select('message_id, emoji')
        .eq('reactor_id', viewerId)
        .in('message_id', msgIds);
      for (const r of myRxns || []) {
        if (!myReactions[r.message_id]) myReactions[r.message_id] = new Set();
        myReactions[r.message_id].add(r.emoji);
      }
    }

    // Aggregate reaction counts per message
    const reactionMap: Record<string, Record<string, number>> = {};
    for (const r of reactions || []) {
      if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
      reactionMap[r.message_id][r.emoji] = (reactionMap[r.message_id][r.emoji] || 0) + 1;
    }

    const enriched = messages.map((m: any) => ({
      ...m,
      reactions: reactionMap[m.id] || {},
      my_reactions: myReactions[m.id] ? Array.from(myReactions[m.id]) : [],
    }));

    return Response.json({ success: true, messages: enriched });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function postInstaVibeChannelMessage(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, messageBody } = body;
    if (!artistId || !messageBody) return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('instavibe_channel_messages')
      .insert({ artist_id: artistId, body: String(messageBody).slice(0, 1000) })
      .select('id, body, created_at')
      .single();
    if (error) throw error;

    return Response.json({ success: true, message: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function reactInstaVibeChannel(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId, messageId, emoji } = body;
    if (!artistId || !messageId || !emoji) return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc('react_instavibe_channel', {
      p_message_id: messageId,
      p_reactor_id: artistId,
      p_emoji: emoji,
    });
    if (error) throw error;
    return Response.json({ success: true, ...(data as any) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
// Returns real per-day engagement data for the last 7 days from social_posts
export async function getInstaVibeAnalytics(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { artistId } = body;
    if (!artistId) return Response.json({ success: false, error: 'Missing artistId' }, { status: 400 });

    const supabase = supabaseAdmin;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [accountRes, postsRes] = await Promise.all([
      supabase
        .from('social_accounts')
        .select('followers, total_views, total_likes, total_engagement, total_revenue')
        .eq('artist_id', artistId)
        .eq('platform', 'instavibe')
        .maybeSingle(),
      supabase
        .from('social_posts')
        .select('views, likes, like_count, comment_count, engagement_rate, revenue, created_at')
        .eq('artist_id', artistId)
        .eq('platform', 'instavibe')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
    ]);

    const account = accountRes.data || {};
    const posts = postsRes.data || [];

    // Build 7-day engagement chart
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyMap: Record<string, number> = {};
    for (const p of posts) {
      const day = days[new Date(p.created_at).getDay()];
      weeklyMap[day] = (weeklyMap[day] || 0) + (N(p.views) + N(p.like_count) * 10 + N(p.comment_count) * 20);
    }
    const weekly = days.map(d => ({ day: d, value: weeklyMap[d] || 0 }));

    // Totals
    const totalReach = posts.reduce((s: number, p: any) => s + N(p.views), 0);
    const totalRevenue = posts.reduce((s: number, p: any) => s + N(p.revenue), 0);
    const avgEngagement = posts.length > 0
      ? posts.reduce((s: number, p: any) => s + N(p.engagement_rate), 0) / posts.length
      : 0;

    return Response.json({
      success: true,
      account,
      weekly,
      stats: {
        reach: totalReach,
        engagement: avgEngagement,
        revenue: totalRevenue,
        followers: N(account.followers),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
