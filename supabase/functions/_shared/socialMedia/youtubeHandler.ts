/**
 * YOUTUBE VIDEO HANDLER
 * Creates YouTube videos with pillar tracking, SEO, and production quality
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { applyRunawaySocialBoost } from '../runawaySongMechanic.ts';
import {
  calcVidWaveRevenue,
  calcVidWaveAdRevenue,
  calcWatchTimeSec,
  canMonetize,
  monetizationProgress
} from '../socialMediaMath.ts';
import { linkSponsoredContent } from '../brandDealsModule.ts';
import { assertNoCoreEconomyMutationInSocialCreate } from './invariantGuard.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

const RADIO_ALIGNMENT_TAGS = new Set(['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo']);

export async function createYouTubeVideo(req: Request) {
  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] [YouTube] Handler started - DEBUG TEST`);
  
  try {
    let body;
    try {
      body = await req.json();
      console.log(`[${traceId}] [YouTube] Request body parsed successfully - DEBUG TEST`);
      console.log(`[${traceId}] [YouTube] FULL BODY:`, JSON.stringify(body, null, 2));
    } catch (jsonErr: unknown) {
      console.error(`[${traceId}] [YouTube] Failed to parse JSON:`, jsonErr);
      const errorMessage = jsonErr instanceof Error ? jsonErr.message : 'Unknown error';
      return Response.json(
        { error: 'Invalid JSON in request body', details: errorMessage, traceId },
        { status: 400 }
      );
    }
    
    const {
      artistId,
      pillarType,
      videoType,
      title,
      description = '',
      tags = [],
      productionTier = 0,
      linkedReleaseId = null,
      energyCost = 8,
      thumbnailUrl = null,
      runawaySong = null,
      sponsoredContractId = null,
      alignmentTag = null,
      collaborationArtistId = null,
      reactingToPostId = null
    } = body || {};
    
    console.log(`[${traceId}] [YouTube] Action: createYouTubeVideo`);
    console.log(`[${traceId}] [YouTube] Artist ID:`, artistId);
    console.log(`[${traceId}] [YouTube] Video type:`, videoType);

    console.log(`[${traceId}] [YouTube] Extracted fields:`, { artistId, pillarType, videoType, title: title?.substring(0, 50), productionTier, energyCost });

    // #region agent log: YouTube extracted fields presence
    try {
      fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
        body: JSON.stringify({
          sessionId: 'f69218',
          runId: 'pre-debug',
          hypothesisId: 'H1',
          location: 'supabase/functions/_shared/socialMedia/youtubeHandler.ts:beforeValidation',
          message: 'YouTube createYouTubeVideo extracted fields subset',
          data: {
            artistIdPresent: !!artistId,
            artistIdType: typeof artistId,
            pillarType: pillarType ?? null,
            pillarTypePresent: !!pillarType,
            pillarTypeType: typeof pillarType,
            videoType: videoType ?? null,
            videoTypePresent: !!videoType,
            videoTypeType: typeof videoType,
            titlePresent: !!title,
            titleType: typeof title,
            titleLen: typeof title === 'string' ? title.length : null,
            productionTier,
            energyCost,
            thumbnailSet: !!thumbnailUrl,
            linkedReleaseIdPresent: !!linkedReleaseId,
            sponsoredContractIdPresent: !!sponsoredContractId,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => { });
    } catch {
      // ignore logging failures
    }
    // #endregion

    if (!artistId || !pillarType || !videoType || !title) {
      console.log(`[${traceId}] [YouTube] Validation failed - missing fields`);
      const errorDetails = {
        error: 'Missing required fields: artistId, pillarType, videoType, title',
        received: { artistId: !!artistId, pillarType: !!pillarType, videoType: !!videoType, title: !!title },
        fullBody: body,
        traceId
      };
      console.log(`[${traceId}] [YouTube] Error details:`, JSON.stringify(errorDetails, null, 2));

      // #region agent log: YouTube validation missing fields
      try {
        fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
          body: JSON.stringify({
            sessionId: 'f69218',
            runId: 'pre-debug',
            hypothesisId: 'H1',
            location: 'supabase/functions/_shared/socialMedia/youtubeHandler.ts:validationMissingFields',
            message: 'YouTube validation failed missing required fields',
            data: {
              received: errorDetails.received,
              productionTier,
              energyCost,
              artistId: typeof artistId === 'string' ? artistId : null,
              pillarType: typeof pillarType === 'string' ? pillarType : null,
              videoType: typeof videoType === 'string' ? videoType : null,
              titleLen: typeof title === 'string' ? title.length : null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => { });
      } catch {
        // ignore logging failures
      }
      // #endregion

      return Response.json(errorDetails, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get artist profile for calculations
    console.log('[YouTube] Fetching profile for artistId:', artistId);
    let profile;
    try {
      profile = await entities.ArtistProfile.get(artistId);
      console.log('[YouTube] Profile result:', profile ? 'found' : 'not found');
    } catch (profErr: any) {
      console.error('[YouTube] Profile fetch error:', profErr);
      return Response.json({ error: 'Failed to fetch artist profile', details: profErr.message || 'Unknown error', traceId }, { status: 500 });
    }

    if (!profile) {
      return Response.json({ error: 'Artist profile not found', details: { artistId }, traceId }, { status: 400 });
    }

    // #region agent log: YouTube energy/funds inputs before checks
    try {
      fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
        body: JSON.stringify({
          sessionId: 'f69218',
          runId: 'pre-debug',
          hypothesisId: 'H4',
          location: 'supabase/functions/_shared/socialMedia/youtubeHandler.ts:beforeEnergyAndFunds',
          message: 'YouTube energy/funds check inputs',
          data: {
            profileEnergy: N(profile.energy),
            profileIncome: N(profile.income),
            requiredEnergy: energyCost,
            productionTier,
            productionCost: [0, 100, 500, 1500, 5000][productionTier] || 0,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => { });
    } catch {
      // ignore logging failures
    }
    // #endregion

    // Check energy
    if (N(profile.energy) < energyCost) {
      return Response.json({
        error: 'Insufficient energy',
        details: { current: N(profile.energy), required: energyCost },
        traceId
      }, { status: 400 });
    }

    // Check production tier cost
    const PRODUCTION_COSTS = [0, 100, 500, 1500, 5000];
    const productionCost = PRODUCTION_COSTS[productionTier] || 0;
    if (productionCost > 0 && N(profile.income) < productionCost) {
      return Response.json({
        error: 'Insufficient funds for production tier',
        details: { required: productionCost, available: N(profile.income), tier: productionTier },
        traceId
      }, { status: 400 });
    }

    // Calculate video performance
    const productionTiers = [
      { id: 0, qualityMult: 0.7, retentionMult: 0.6 },
      { id: 1, qualityMult: 1.0, retentionMult: 0.8 },
      { id: 2, qualityMult: 1.5, retentionMult: 1.0 },
      { id: 3, qualityMult: 2.2, retentionMult: 1.2 },
      { id: 4, qualityMult: 3.5, retentionMult: 1.4 }
    ];

    const videoTypes: Record<string, { baseViews: number; adRate: number; subGain: number }> = {
      music_video: { baseViews: 5000, adRate: 0.003, subGain: 0.004 },
      lyric_video: { baseViews: 2000, adRate: 0.002, subGain: 0.002 },
      visualizer: { baseViews: 1500, adRate: 0.0018, subGain: 0.002 },
      studio_session: { baseViews: 1200, adRate: 0.0025, subGain: 0.003 },
      songwriting: { baseViews: 900, adRate: 0.002, subGain: 0.003 },
      vlog: { baseViews: 1000, adRate: 0.0022, subGain: 0.003 },
      tour_diary: { baseViews: 1400, adRate: 0.0024, subGain: 0.004 },
      reaction: { baseViews: 800, adRate: 0.0015, subGain: 0.002 },
      collab_video: { baseViews: 3000, adRate: 0.0028, subGain: 0.005 },
      interview: { baseViews: 700, adRate: 0.002, subGain: 0.002 },
      deep_dive: { baseViews: 600, adRate: 0.002, subGain: 0.003 },
      live_performance: { baseViews: 3000, adRate: 0.0028, subGain: 0.005 },
      short: { baseViews: 2500, adRate: 0.0005, subGain: 0.003 }
    };

    const prod = productionTiers[productionTier] || productionTiers[0];
    const type = videoTypes[videoType] || videoTypes.music_video;

    // Calculate performance metrics (FIXED: Use realistic multipliers)
    const subMult = 1 + Math.min(N(profile.followers) / 1000000, 5); // Cap at 5x for 1M+ followers
    const followerMult = 1 + Math.min(N(profile.followers) / 5000000, 3); // Cap at 3x for 5M+ followers  
    const hypeMult = 1 + N(profile.hype) / 100;
    const releaseBoost = linkedReleaseId ? 1.4 : 1;
    const seoMult = 1 + (tags?.length || 0) * 0.015;
    
    const rawViews = type.baseViews * subMult * followerMult * hypeMult * releaseBoost * prod.qualityMult * seoMult;
    
    // VIRAL MOMENT RNG - 1% chance for god-tier luck
    const isGodTierViral = Math.random() < 0.01; // 1% chance
    const viralMultiplier = isGodTierViral ? (10 + Math.random() * 20) : 1; // 10-30x boost
    
    let views = Math.floor(rawViews * (0.7 + Math.random() * 0.6) * viralMultiplier);
    const retentionPct = Math.min(95, Math.floor(40 + prod.retentionMult * 20 + Math.random() * 15));
    const likeRate = 0.04 + Math.random() * 0.04 + (prod.qualityMult - 1) * 0.01;
    let likes = Math.floor(views * likeRate * (isGodTierViral ? 2 : 1));
    const dislikes = Math.floor(likes * (0.02 + Math.random() * 0.05));
    let comments = Math.floor(likes * (0.08 + Math.random() * 0.06) * (isGodTierViral ? 3 : 1));
    const engagementRate = (likes + comments) / Math.max(views, 1);
    const followerGainFromViews = Math.floor(views * 0.005 * (engagementRate > 0.05 ? 2 : 1) * (1 + (likes / views) * 2));
    let shares = Math.floor(likes * 0.05);
    let saves = Math.floor(likes * 0.08);

    // --- APPLY RUNAWAY BOOST (Active Post) ---
    // Apply boost BEFORE calculating derived metrics (revenue, subs) so they scale correctly
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      const baseMetrics = { views, likes, comments, shares, saves };
      // Construct a mock social post object for the boost check (needs title/caption/metadata)
      const mockPost = {
        title, 
        caption: description,
        metadata: { linked_release_id: linkedReleaseId } 
      };
      
      const boosted = applyRunawaySocialBoost(baseMetrics, mockPost, runawaySong.runawayData, turnsSinceDetected);
      
      // Update local variables with boosted values
      // Note: We deliberately allow views to exceed normal caps here for runaway hits
      if (boosted.views > views) {
        // Recalculate engagement proportional to new views if boost applied
        // (applyRunawaySocialBoost boosts engagement directly, so we just use its outputs)
        views = boosted.views;
        likes = boosted.likes;
        comments = boosted.comments;
        shares = boosted.shares;
        // Saves aren't boosted by helper, scale them manually
        saves = Math.floor(boosted.views * (saves / Math.max(1, rawViews)) * 1.5); 
      }
    }

    const watchTimeMinutes = Math.floor(views * (retentionPct / 100) * (2 + Math.random() * 6));
    
    // Get existing social account for monetization check
    let existingAccounts;
    try {
      existingAccounts = await entities.SocialAccount.filter({ 
        artist_id: artistId, 
        platform: 'vidwave' 
      });
    } catch (saErr: any) {
      console.error('[YouTube] SocialAccount.filter error:', saErr);
      return Response.json({ error: 'Failed to fetch social account', details: saErr.message || 'Unknown error' }, { status: 500 });
    }
    const socialAccount = existingAccounts[0];
    
    // Calculate total watch time for YPP
    const totalWatchTime = socialAccount ? 
      N(socialAccount.total_views) * 4 * 0.6 + watchTimeMinutes * 60 :
      watchTimeMinutes * 60;
    
    // Calculate EXPECTED total revenue (will trickle over turns, NOT paid now)
    const revenueResult = calcVidWaveRevenue({
      views,
      videoType: videoType,
      productionTier: productionTier,
      careerStage: profile.career_stage || 'Local Act',
      hype: N(profile.hype),
      socialAccount: socialAccount || { followers: 0, total_views: 0 },
      totalWatchTimeSec: totalWatchTime
    });
    
    const expectedAdRevenue = revenueResult.revenue;
    const newSubs = Math.floor(views * type.subGain * (1 + prod.qualityMult * 0.2));
    const followerGainFromSubs = Math.floor(newSubs * 0.3);
    const totalExpectedFollowerGain = followerGainFromViews + followerGainFromSubs;
    const hypeGain = Math.floor(Math.random() * 3 + (prod.qualityMult > 1.5 ? 2 : 0));
    const cloutGain = Math.floor(Math.random() * 2 + (prod.qualityMult > 2 ? 2 : 0));

    // Expected impressions (~60% of views get ads)
    const expectedImpressions = Math.floor(views * (1.2 + Math.random() * 0.8));

    // Decay curve weights for 6-turn earning window
    const EARNING_WINDOW = 6;
    const curveWeights = [0.30, 0.22, 0.16, 0.12, 0.10, 0.10];
    const curveViewRate = 0.45 + Math.random() * 0.30; // 0.45-0.75
    const curveLikeRate = 0.04 + Math.random() * 0.04;
    const curveCommentRate = 0.008 + Math.random() * 0.006;
    const curveShareRate = 0.002 + Math.random() * 0.003;
    const curveFollowerConvRate = 0.0003 + Math.random() * 0.0017; // 0.03%-0.2%

    // Create social post — revenue=0 (will accrue over turns)
    let socialPost;
    try {
      socialPost = await entities.SocialPost.create({
        artist_id: artistId,
        platform: 'vidwave',
        post_type: videoType === 'short' ? 'short' : 'video',
        title,
        caption: description,
        thumbnail_url: thumbnailUrl || null,
        linked_release_id: linkedReleaseId,
        collaboration_artist_id: collaborationArtistId || null,
        reacting_to_post_id: reactingToPostId || null,
        views,
        likes,
        comments,
        shares,
        saves,
        engagement_rate: Math.floor((likes + comments + shares + saves) / views * 1000) / 10,
        revenue: 0, // NO instant payout — revenue trickles in via turn engine
        status: 'published',
        energy_cost: energyCost,
        posted_turn: null,
        alignment_tag: alignmentTag || null,
        metadata: {
          video_type: videoType,
          pillar_type: pillarType,
          production_tier: productionTier,
          seo_tags: tags,
          content_hook: description,
          watch_time_minutes: watchTimeMinutes,
          retention_pct: retentionPct,
          alignment_tag: alignmentTag,
          radio_alignment: alignmentTag && RADIO_ALIGNMENT_TAGS.has(alignmentTag) ? alignmentTag : null,
          is_short: videoType === 'short',
          expected_follower_gain: totalExpectedFollowerGain,
          earning_window: EARNING_WINDOW,
        },
      });
    } catch (spErr: any) {
      console.error('[YouTube] SocialPost.create error:', spErr);
      return Response.json({ error: 'Failed to create social post', details: spErr.message || 'Unknown error' }, { status: 500 });
    }

    // Create YouTube video record
    const { data: youtubeVideo, error: ytErr } = await supabase
      .from('youtube_videos')
      .insert({
        social_post_id: socialPost.id,
        pillar_type: pillarType,
        quality_score: Math.min(100, Math.floor(prod.qualityMult * 25 + Math.random() * 25)),
        seo_score: Math.min(100, Math.floor(seoMult * 25 + Math.random() * 25)),
        watch_time_avg: Math.min(watchTimeMinutes, 2147483647), // cap to int max
        production_cost: productionTier * 500,
        linked_release_id: linkedReleaseId,
        channel_memberships_enabled: false
      })
      .select()
      .single();
    if (ytErr) {
      console.error('[YouTube] youtube_videos insert error:', ytErr);
      return Response.json({ error: 'Failed to create video record', details: ytErr.message }, { status: 500 });
    }

    // Get current global turn for state tracking
    const { data: turnRow } = await supabase
      .from('turn_state')
      .select('global_turn_id')
      .limit(1)
      .single();
    const currentTurn = turnRow?.global_turn_id || 0;

    // Seed vidwave_video_state for per-video trickle accrual
    console.log(`[${traceId}] [YouTube] Inserting vidwave_video_state for post_id:`, socialPost.id);
    const { error: vvsErr } = await supabase.from('vidwave_video_state').insert({
      post_id: socialPost.id,
      artist_id: artistId,
      created_turn: currentTurn,
      last_accrued_turn: currentTurn,
      lifetime_views: views,
      lifetime_likes: likes,
      lifetime_comments: comments,
      lifetime_shares: shares,
      lifetime_impressions: 0,
      lifetime_ad_revenue: 0,
      lifetime_follower_gain: 0,
      expected_total_impressions: expectedImpressions,
      expected_total_ad_revenue: expectedAdRevenue,
      earning_window: EARNING_WINDOW,
      curve: {
        weights: curveWeights,
        view_rate: curveViewRate,
        like_rate: curveLikeRate,
        comment_rate: curveCommentRate,
        share_rate: curveShareRate,
        follower_conversion_rate: curveFollowerConvRate,
        hype_gain: hypeGain,
        clout_gain: cloutGain,
        expected_subs: newSubs
      },
      metadata: {
        video_type: videoType,
        production_tier: productionTier,
        is_viral: views > type.baseViews * 3,
        is_god_tier_viral: isGodTierViral
      }
    });
    if (vvsErr) {
      console.error(`[${traceId}] [YouTube] vidwave_video_state insert error:`, vvsErr);
      console.error(`[${traceId}] [YouTube] Error details:`, JSON.stringify(vvsErr, null, 2));
      return Response.json({ error: 'Failed to seed video state', details: vvsErr.message, code: vvsErr.code, hint: vvsErr.hint, traceId }, { status: 500 });
    }
    console.log(`[${traceId}] [YouTube] vidwave_video_state inserted successfully`);

    // ── Collab notification ─────────────────────────────────────────────────────────────────
    if (collaborationArtistId && socialPost?.id) {
      try {
        await supabase.from('notifications').insert({
          player_id: collaborationArtistId,
          type: 'VIDWAVE_COLLAB',
          title: `🎥 ${profile.artist_name} featured you!`,
          subtitle: `Collab: ${title}`,
          body: `You'll earn 30% of the ad revenue from this video each turn it accrues.`,
          metrics: { post_id: socialPost.id, video_type: videoType, main_artist_id: artistId },
          context: {}
        });
        console.log(`[${traceId}] [YouTube] Collab notification sent to ${collaborationArtistId}`);
      } catch (collabNotifErr: any) {
        console.warn('[YouTube] Collab notification failed (non-fatal):', collabNotifErr.message);
      }
    }

    // ── Reaction notification ───────────────────────────────────────────────────────
    if (reactingToPostId && socialPost?.id) {
      try {
        const { data: reactedPost } = await supabase
          .from('social_posts')
          .select('artist_id, title')
          .eq('id', reactingToPostId)
          .maybeSingle();
        if (reactedPost?.artist_id && reactedPost.artist_id !== artistId) {
          await supabase.from('notifications').insert({
            player_id: reactedPost.artist_id,
            type: 'VIDWAVE_REACTION',
            title: `👀 ${profile.artist_name} reacted to your video!`,
            subtitle: `"${title}"`,
            body: `Your video got a reaction video! You earned +5 clout for the exposure.`,
            metrics: { reaction_post_id: socialPost.id, original_post_id: reactingToPostId, reactor_id: artistId },
            context: {}
          });
          // Grant +5 clout to original artist
          await supabase.from('profiles')
            .update({ clout: supabase.rpc('greatest', [0, 0]) }) // placeholder — increment via raw SQL
            .eq('id', reactedPost.artist_id);
          await supabase.rpc('increment_clout', { p_player_id: reactedPost.artist_id, p_amount: 5 }).catch(async () => {
            // Fallback: direct update if RPC not available
            const { data: pRow } = await supabase.from('profiles').select('clout').eq('id', reactedPost!.artist_id).single();
            await supabase.from('profiles').update({ clout: Math.min(100, N((pRow as any)?.clout) + 5) }).eq('id', reactedPost!.artist_id);
          });
          console.log(`[${traceId}] [YouTube] Reaction notification sent to ${reactedPost.artist_id}`);
        }
      } catch (reactionErr: any) {
        console.warn('[YouTube] Reaction notification failed (non-fatal):', reactionErr.message);
      }
    }

    // ── Sponsored content linkage ─────────────────────────────────────────────────────────────────────
    let sponsoredLinkResult: { success: boolean; deliverable_count_completed: number } | null = null;
    let sponsorshipError: string | null = null;
    if (sponsoredContractId && socialPost?.id) {
      try {
        sponsoredLinkResult = await linkSponsoredContent(
          artistId,
          sponsoredContractId,
          socialPost.id,
          'vidwave',
          currentTurn
        );
        console.log(`[YouTube] Sponsored content linked: contract=${sponsoredContractId} video=${socialPost.id} deliverables=${sponsoredLinkResult.deliverable_count_completed}`);
      } catch (sponsorErr: any) {
        console.warn('[YouTube] Sponsored content link failed (non-fatal):', sponsorErr.message || sponsorErr);
        sponsorshipError = sponsorErr.message || 'Sponsorship linkage failed';
      }
    }

    // Update or create social account — only post count + initial views, NO followers or revenue
    if (socialAccount) {
      const { error: saUpdErr } = await supabase.from('social_accounts')
        .update({
          total_posts: N(socialAccount.total_posts) + 1,
          total_views: N(socialAccount.total_views) + views,
          total_likes: N(socialAccount.total_likes) + likes,
          total_engagement: N(socialAccount.total_engagement) + likes + comments + shares + saves
        })
        .eq('id', socialAccount.id);
      if (saUpdErr) {
        console.error('[YouTube] social_accounts update error:', saUpdErr);
        return Response.json({ error: 'Failed to update social account', details: saUpdErr.message }, { status: 500 });
      }
      
      // Check for Diamond Play Button milestone (100K subs) - enable merch shelf
      const currentFollowers = N(socialAccount.followers);
      const wasBelowThreshold = currentFollowers < 100000;
      const projectedFollowers = currentFollowers + newSubs;
      const crossedThreshold = wasBelowThreshold && projectedFollowers >= 100000;
      
      if (crossedThreshold && !socialAccount.merch_shelf_enabled) {
        await supabase.from('social_accounts')
          .update({ merch_shelf_enabled: true })
          .eq('id', socialAccount.id);
        
        // Send milestone notification
        await supabase.from('notifications').insert({
          player_id: artistId,
          type: 'VIDWAVE_MILESTONE',
          title: '💎 Diamond Play Button Unlocked!',
          subtitle: 'Merch shelf now available',
          body: 'Your merch will now appear on your VidWave channel, boosting sales by 20%.',
          metrics: { milestone: 'diamond_play_button', subscribers: projectedFollowers },
          context: {}
        });
        
        console.log(`[${traceId}] [YouTube] Merch shelf enabled for ${artistId} at ${projectedFollowers} subs`);
      }
    } else {
      const { error: saInsErr } = await supabase.from('social_accounts').insert({
        artist_id: artistId,
        platform: 'vidwave',
        followers: 0,
        total_posts: 1,
        total_views: views,
        total_likes: likes,
        total_engagement: likes + comments + shares + saves,
        total_revenue: 0,
        account_level: 1,
        verified: false
      });
      if (saInsErr) {
        console.error('[YouTube] social_accounts insert error:', saInsErr);
        return Response.json({ error: 'Failed to create social account', details: saInsErr.message }, { status: 500 });
      }
    }

    // Update artist profile — deduct energy and production cost
    console.log(`[${traceId}] [YouTube] Deducting energy: ${energyCost} from ${N(profile.energy)}`);
    try {
      const energyPatch = { energy: N(profile.energy) - energyCost };
      assertNoCoreEconomyMutationInSocialCreate({ currentProfile: profile, patch: energyPatch, traceId, handler: 'createYouTubeVideo' });
      await entities.ArtistProfile.update(artistId, energyPatch);
      console.log(`[${traceId}] [YouTube] Energy deducted successfully`);
    } catch (apUpdErr1: any) {
      console.error(`[${traceId}] [YouTube] ArtistProfile energy update error:`, apUpdErr1);
      console.error(`[${traceId}] [YouTube] Error stack:`, apUpdErr1.stack);
      return Response.json({ error: 'Failed to update energy', details: apUpdErr1.message || 'Unknown error', stack: apUpdErr1.stack, traceId }, { status: 500 });
    }

    // Deduct production cost from income (intentional economy mutation, bypasses invariant guard)
    if (productionCost > 0) {
      const { error: incomeErr } = await supabase
        .from('profiles')
        .update({ income: N(profile.income) - productionCost })
        .eq('id', artistId);
      if (incomeErr) {
        console.error(`[${traceId}] [YouTube] Production cost deduction error:`, incomeErr);
      } else {
        console.log(`[${traceId}] [YouTube] Production cost deducted: $${productionCost}`);
      }
    }

    // Update YouTube content pillars
    const currentPillars = profile.youtube_content_pillars || [];
    const pillarCount = currentPillars.filter((p: string) => p === pillarType).length;
    const updatedPillars = pillarCount === 0 ? [...currentPillars, pillarType] : currentPillars;

    console.log(`[${traceId}] [YouTube] Updating content pillars:`, updatedPillars);
    try {
      const pillarsPatch = { youtube_content_pillars: updatedPillars };
      assertNoCoreEconomyMutationInSocialCreate({ currentProfile: profile, patch: pillarsPatch, traceId, handler: 'createYouTubeVideo' });
      await entities.ArtistProfile.update(artistId, pillarsPatch);
      console.log(`[${traceId}] [YouTube] Content pillars updated successfully`);
    } catch (apUpdErr2: any) {
      console.error(`[${traceId}] [YouTube] ArtistProfile pillars update error:`, apUpdErr2);
      console.error(`[${traceId}] [YouTube] Error stack:`, apUpdErr2.stack);
      return Response.json({ error: 'Failed to update content pillars', details: apUpdErr2.message || 'Unknown error', stack: apUpdErr2.stack, traceId }, { status: 500 });
    }

    let finalPerformance = {
      views,
      likes,
      comments,
      shares,
      saves,
      watchTimeMinutes,
      adRevenue: expectedAdRevenue, // Show expected (will trickle)
      newSubs,
      totalFollowerGain: totalExpectedFollowerGain,
      hypeGain,
      cloutGain,
      isViral: views > type.baseViews * 3,
      isGodTierViral: isGodTierViral,
      viralMultiplier: viralMultiplier,
      earningWindow: EARNING_WINDOW,
      pendingRevenue: expectedAdRevenue // Signal to UI that this is pending
    };

    // Check if this post references a runaway song
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      finalPerformance = applyRunawaySocialBoost(finalPerformance, socialPost, runawaySong.runawayData, turnsSinceDetected);
    }

    // Telemetry (non-fatal)
    try {
      await supabase.from('turn_event_log').insert([
        {
          player_id: artistId,
          global_turn_id: currentTurn,
          module: 'vidwave',
          event_type: 'SOCIAL_VIDEO_CREATED',
          description: 'VidWave video created',
          metadata: { platform: 'vidwave', post_id: socialPost.id, video_type: videoType, production_tier: productionTier }
        },
        {
          player_id: artistId,
          global_turn_id: currentTurn,
          module: 'vidwave',
          event_type: 'SOCIAL_ENGAGEMENT_SEEDED',
          description: 'VidWave initial engagement seeded',
          metadata: { platform: 'vidwave', post_id: socialPost.id, views, likes, comments, shares, saves }
        }
      ]);

      if (views > type.baseViews * 3 || isGodTierViral) {
        const viralModule = `vidwave_viral:${socialPost.id}`;
        await supabase.from('turn_event_log').upsert({
          player_id: artistId,
          global_turn_id: currentTurn,
          module: viralModule,
          event_type: 'SOCIAL_VIRAL_EVENT',
          description: 'VidWave viral event seeded',
          metadata: {
            idempotency_key: `social_viral_event:${artistId}:${currentTurn}:vidwave:${socialPost.id}`,
            platform: 'vidwave',
            post_id: socialPost.id,
            is_viral: views > type.baseViews * 3,
            is_god_tier_viral: isGodTierViral,
            base_metric_name: 'views',
            base_metric_value: views,
            engagement_rate_used: engagementRate,
            multipliers_applied: { viral_multiplier: viralMultiplier },
            final_multiplier: viralMultiplier,
            cap_hit: false,
            cap_name: null,
            final_applied_deltas: { views, likes, comments, shares, saves },
          }
        }, { onConflict: 'player_id,global_turn_id,module,event_type', ignoreDuplicates: true });
      }
    } catch (_eventErr) { /* non-fatal */ }

    // Return performance data for frontend
    return Response.json({
      success: true,
      data: {
        socialPost,
        youtubeVideo,
        performance: finalPerformance,
        // Sponsored content linkage info (null if not a sponsored video)
        sponsored: sponsoredLinkResult ? {
          contractId: sponsoredContractId,
          deliverable_count_completed: sponsoredLinkResult.deliverable_count_completed,
        } : null,
        // Non-null when sponsorship linkage failed — frontend should warn user
        sponsorshipError,
      }
    });

  } catch (error: any) {
    console.error(`[${traceId}] [YouTube] UNHANDLED Video creation error:`, error);
    console.error(`[${traceId}] [YouTube] Error name:`, error.name);
    console.error(`[${traceId}] [YouTube] Error message:`, error.message);
    console.error(`[${traceId}] [YouTube] Error stack:`, error.stack);
    console.error(`[${traceId}] [YouTube] Error details:`, JSON.stringify(error, null, 2));
    return Response.json({
      error: 'Internal server error',
      details: error.message,
      errorName: error.name,
      stack: error.stack,
      traceId
    }, { status: 500 });
  }
}
