/**
 * LOOPTOK POST HANDLER
 * Creates TikTok posts with viral mechanics, trends, and duets
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { applyRunawaySocialBoost } from '../runawaySongMechanic.ts';
import { 
  calcLoopTokRevenue,
  canMonetize,
  monetizationProgress
} from '../socialMediaMath.ts';
import { assertNoCoreEconomyMutationInSocialCreate } from './invariantGuard.ts';
import { linkSponsoredContent } from '../brandDealsModule.ts';
import { applyCareerTrendEffects } from '../careerTrendEffects.ts';
import { deductEnergy } from './energyDeduct.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

const RADIO_ALIGNMENT_TAGS = new Set(['radio_shoutout', 'radio_clip', 'radio_interview', 'radio_promo']);

export async function createLoopTokPost(req: Request) {
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      artistId, 
      conceptId, 
      soundName, 
      videoLength, 
      filter, 
      hashtags, 
      duetPartner,
      energyCost,
      title,
      caption,
      boostPost,
      runawaySong,
      alignmentTag,
      linkedRelease,
      linkedSong,
      thumbnailUrl,
      linkedSoundId,
      sponsoredContractId,
    } = body;

    if (!artistId || !conceptId || !videoLength) {
      return Response.json({
        error: 'Missing required fields: artistId, conceptId, videoLength',
        details: { artistId: !!artistId, conceptId: !!conceptId, videoLength: !!videoLength },
        traceId,
      }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // Get artist profile for calculations
    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return Response.json({
        error: 'Artist profile not found',
        details: { artistId },
        traceId,
      }, { status: 404 });
    }

    // Gap 4: Mood-based energy cost modifier — certain actions cheaper/pricier depending on mood
    // Read mood once (may already be read for Gap 3 later, but this runs first for the energy check)
    let moodEnergyCostMult = 1.0;
    try {
      const { data: tsMood } = await supabase
        .from('turn_state').select('algorithm_mood').eq('id', 1).maybeSingle();
      const mood = tsMood?.algorithm_mood || 'mainstream';
      // Social posting is cheaper during mainstream/messy (everyone's posting), pricier during underground
      const MOOD_ENERGY_MULT: Record<string, number> = {
        mainstream:       0.90,
        messy:            0.85,
        beef_season:      0.90,
        experimental:     1.00,
        underground:      1.10,
        nostalgic:        1.05,
        // New moods
        collab_season:    0.90, // Duets and features flow freely — social is buzzing, cheaper to post
        hype_cycle:       0.85, // Everyone's dropping snippets — platform is hot, energy is cheap
        viral_spiral:     0.80, // Maximum posting frenzy — cheapest moment in the cycle
        industry_exposed: 0.95, // Some hesitation but content is still flowing
        tour_season:      1.05, // Live-focused moment — social posting slightly deprioritized
      };
      moodEnergyCostMult = MOOD_ENERGY_MULT[mood] || 1.0;
    } catch { /* non-fatal */ }
    const effectiveEnergyCost = Math.max(1, Math.round(energyCost * moodEnergyCostMult));

    // Pre-flight energy check (fast-fail for user feedback; authoritative deduction happens atomically below)
    if (N(profile.energy) < effectiveEnergyCost) {
      return Response.json({
        error: 'Insufficient energy',
        current: N(profile.energy),
        required: effectiveEnergyCost,
        details: { current: N(profile.energy), required: effectiveEnergyCost, moodAdjusted: effectiveEnergyCost !== energyCost },
        traceId,
      }, { status: 400 });
    }

    // Atomic energy deduction via RPC — prevents concurrent double-spend
    const energyResult = await deductEnergy(supabase, artistId, effectiveEnergyCost);
    if (!energyResult.success) {
      return Response.json({
        error: 'Insufficient energy',
        current: N(profile.energy),
        required: effectiveEnergyCost,
        details: { current: N(profile.energy), required: effectiveEnergyCost, moodAdjusted: effectiveEnergyCost !== energyCost },
        traceId,
      }, { status: 400 });
    }

    // Video concepts
    const concepts: Record<string, { baseViews: number; viralChance: number; energy: number; soundCreator?: boolean }> = {
      dance_challenge: { baseViews: 2000, viralChance: 0.25, energy: 8 },
      snippet: { baseViews: 800, viralChance: 0.12, energy: 5 },
      lip_sync: { baseViews: 600, viralChance: 0.10, energy: 3 },
      skit: { baseViews: 1500, viralChance: 0.18, energy: 5 },
      behind_scenes: { baseViews: 500, viralChance: 0.06, energy: 3 },
      freestyle: { baseViews: 1200, viralChance: 0.15, energy: 6 },
      original_sound: { baseViews: 400, viralChance: 0.08, energy: 7, soundCreator: true },
      trend_reaction: { baseViews: 900, viralChance: 0.14, energy: 4 },
      announcement: { baseViews: 400, viralChance: 0.04, energy: 3 },
      duet: { baseViews: 1100, viralChance: 0.16, energy: 4 },
      storytime: { baseViews: 700, viralChance: 0.11, energy: 4 },
      get_ready: { baseViews: 600, viralChance: 0.09, energy: 3 },
      meme_drop: { baseViews: 2500, viralChance: 0.28, energy: 5 },
      trend_surf: { baseViews: 1800, viralChance: 0.20, energy: 4 },
    };

    // Video lengths
    const lengths: Record<string, { mult: number; viralBoost: number }> = {
      '15s': { mult: 0.8, viralBoost: 1.3 },
      '30s': { mult: 1.0, viralBoost: 1.1 },
      '60s': { mult: 1.2, viralBoost: 0.9 },
      '3m': { mult: 1.5, viralBoost: 0.6 }
    };

    // Visual filters
    const filters: Record<string, { viralBoost: number }> = {
      'raw': { viralBoost: 1.15 },
      'lofi': { viralBoost: 1.05 },
      'glitch': { viralBoost: 1.0 },
      'sparkle': { viralBoost: 0.95 },
      'cinematic': { viralBoost: 0.75 },
      'neon': { viralBoost: 1.0 }
    };

    // Algorithm states
    const algoStates: Record<string, { mult: number }> = {
      'favorable': { mult: 1.4 },
      'neutral': { mult: 1.0 },
      'suppressed': { mult: 0.6 }
    };

    const concept = concepts[conceptId] || concepts.snippet;
    const len = lengths[videoLength] || lengths['30s'];
    const vis = filters[filter] || filters.raw;
    // BUG-LT-002 FIX: read actual algorithm state from looptok_creator_state
    let actualAlgoState = 'neutral';
    try {
      const { data: creatorStateRow } = await supabase
        .from('looptok_creator_state')
        .select('algorithm_state')
        .eq('artist_id', artistId)
        .maybeSingle();
      if (creatorStateRow?.algorithm_state) {
        actualAlgoState = creatorStateRow.algorithm_state;
      }
    } catch (_e) { /* fallback to neutral */ }
    const algo = algoStates[actualAlgoState] || algoStates['neutral'];

    // Era phase viral modifier: DROP phase boosts viral chance, FADE suppresses it
    const ERA_PHASE_VIRAL_MULT: Record<string, number> = {
      TEASE: 1.2,
      DROP: 1.6,
      SUSTAIN: 0.9,
      FADE: 0.7
    };
    let eraViralMult = 1.0;
    try {
      const eras = await entities.Era.filter({ artist_id: artistId, is_active: true });
      const activeEra = eras?.[0];
      if (activeEra?.phase) {
        eraViralMult = ERA_PHASE_VIRAL_MULT[activeEra.phase] || 1.0;
      }
    } catch (_e) { /* era lookup optional — default to 1.0 */ }

    // Gap 3: Read algorithm_mood for virality modifier
    const MOOD_VIRAL_MULT: Record<string, number> = {
      messy:            1.30, // Chaos = anything can go viral
      beef_season:      1.20, // Drama-fueled attention
      experimental:     1.15,
      mainstream:       1.00,
      underground:      0.90, // Niche = harder to go mainstream viral
      nostalgic:        0.85, // Calm period = less virality
      // New moods
      viral_spiral:     1.45, // Max viral amplification — trends churn in hours
      hype_cycle:       1.25, // Rollout energy: snippets and teasers spread fast
      collab_season:    1.20, // Duet content and feature announcements go wide
      industry_exposed: 1.15, // Tea content spreads rapidly
      tour_season:      0.95, // Live-focused — social virality slightly subdued
    };
    let moodViralMult = 1.0;
    try {
      const { data: tsViral } = await supabase
        .from('turn_state').select('algorithm_mood').eq('id', 1).maybeSingle();
      moodViralMult = MOOD_VIRAL_MULT[tsViral?.algorithm_mood || 'mainstream'] || 1.0;
    } catch { /* non-fatal */ }

    // Career trend virality modifier (e.g. VIRAL_SENSATION = +10%)
    let trendViralMult = 1.0;
    try {
      const trend = profile.career_trend;
      if (trend) {
        const fx = applyCareerTrendEffects({ trend });
        trendViralMult = fx.viralityTendencyAdj;
      }
    } catch { /* non-fatal */ }

    // Calculate performance (FIXED: Use realistic multipliers)
    const fM = 1 + Math.min(N(profile.followers) / 100000, 10); // Cap at 10x for 100K+ followers
    const hM = 1 + N(profile.hype) / 100;
    const lenMult = len.mult;
    const visBoost = vis.viralBoost;
    const duetBoost = duetPartner ? 1.35 : 1;
    const hB = 1 + Math.min(5, (hashtags || []).length) * 0.06;

    const boostMult = boostPost ? 1.5 : 1;
    const rawViews = concept.baseViews * fM * hM * lenMult * visBoost * duetBoost * hB * algo.mult * boostMult;
    
    // VIRAL MOMENT RNG - 1.5% chance for god-tier luck (higher than YouTube)
    const isGodTierViral = Math.random() < (0.015 * moodViralMult); // mood modulates god-tier chance
    const viralMultiplier = isGodTierViral ? (15 + Math.random() * 25) : 1; // 15-40x boost
    
    let fV = Math.floor(rawViews * (0.7 + Math.random() * 0.6) * viralMultiplier);
    const engRate = 0.03 + Math.random() * 0.08;
    let likes = Math.floor(fV * engRate);
    let comments = Math.floor(likes * 0.15);
    let shares = Math.floor(likes * 0.08);
    let saves = Math.floor(likes * 0.12);
    const adjViral = concept.viralChance * hM * len.viralBoost * visBoost * (soundName?.includes('rising') ? 1.5 : 1) * eraViralMult * moodViralMult * trendViralMult;
    const isViral = Math.random() < Math.min(0.6, adjViral);
    const vM = isViral ? 3 + Math.random() * 7 : 1;
    // BUG-LT-003 FIX: apply normal viral multiplier to view count and recalc engagement
    if (isViral && !isGodTierViral) {
      fV = Math.floor(fV * vM);
      likes = Math.floor(fV * engRate);
      comments = Math.floor(likes * 0.15);
      shares = Math.floor(likes * 0.08);
      saves = Math.floor(likes * 0.12);
    }

    // --- APPLY RUNAWAY BOOST (Active Post) ---
    // Apply boost BEFORE calculating derived metrics so revenue/followers scale correctly
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      const baseMetrics = { views: fV, likes, comments, shares, saves };
      const mockPost = {
        title: title || `${conceptId} post`,
        caption: caption || hashtags?.join(' ') || '',
        metadata: {
          concept: conceptId,
          sound: soundName
        }
      };
      
      const boosted = applyRunawaySocialBoost(baseMetrics, mockPost, runawaySong.runawayData, turnsSinceDetected);
      
      if (boosted.views > fV) {
        fV = boosted.views;
        likes = boosted.likes;
        comments = boosted.comments;
        shares = boosted.shares;
        // Saves aren't boosted by helper, scale manually
        saves = Math.floor(boosted.views * (saves / Math.max(1, rawViews)) * 1.5);
      }
    }
    
    // Get existing social account for monetization check
    const existingAccounts = await entities.SocialAccount.filter({ 
      artist_id: artistId, 
      platform: 'looptok' 
    });
    const socialAccount = existingAccounts[0];
    
    // Use new revenue calculation
    const revenueResult = calcLoopTokRevenue({
      views: fV,
      socialAccount: socialAccount || { followers: 0, total_views: 0 },
      careerStage: profile.career_stage || 'Local Act',
      isViral: isViral
    });
    
    const revenue = revenueResult.revenue;
    // Follower gain based on virality and algorithm favorability (Economy v4 - higher rates)
    const followerGain = Math.floor(fV * 0.01 * (isViral || isGodTierViral ? 3 : 1) * (1 + N(profile.tiktok_algorithm_favorability || 50) / 100));
    const hypeGain = (isViral || isGodTierViral) ? Math.floor(Math.random() * 8 + 3) : Math.floor(Math.random() * 3);
    const soundUsages = concept.soundCreator ? Math.floor(fV * 0.002 * ((isViral || isGodTierViral) ? 5 : 1)) : 0;

    // Create social post
    const socialPost = await entities.SocialPost.create({
      artist_id: artistId,
      platform: 'looptok',
      post_type: conceptId,
      title: title || `${conceptId} post`,
      caption: caption || hashtags?.join(' ') || '',
      views: fV,
      likes: likes,
      comments: comments,
      shares: shares,
      saves: saves,
      engagement_rate: Math.floor((likes + comments + shares + saves) / fV * 1000) / 10,
      revenue: 0,
      is_viral: isViral,
      is_god_tier_viral: isGodTierViral,
      viral_multiplier: viralMultiplier,
      status: 'published',
      energy_cost: energyCost,
      posted_turn: null,
      alignment_tag: alignmentTag || null,
      linked_release_id: linkedRelease || null,
      linked_song_id: linkedSong || null,
      thumbnail_url: thumbnailUrl || null,
      metadata: {
        concept: conceptId,
        sound: soundName || 'Original',
        video_length: videoLength,
        filter,
        hashtags: hashtags || [],
        duet_partner: duetPartner,
        sound_usages: soundUsages,
        algorithm_state: 'neutral',
        linked_sound_id: linkedSoundId || null,
        radio_alignment: alignmentTag && RADIO_ALIGNMENT_TAGS.has(alignmentTag) ? alignmentTag : null,
      }
    });

    // Create LoopTok post record
    const { data: loopTokPost } = await supabase
      .from('looptok_posts')
      .insert({
        social_post_id: socialPost.id,
        video_concept: conceptId,
        video_length: videoLength,
        visual_filter: filter,
        duet_of_post_id: null, // duet relationship tracked in metadata
        algorithm_favorability_score: 50 + Math.floor(Math.random() * 30)
      })
      .select()
      .single();

    // Update social account (adapter has no upsert — use filter then update or create)
    const existingAccount = existingAccounts[0];
    if (existingAccount) {
      await entities.SocialAccount.update(existingAccount.id, {
        followers: N(existingAccount.followers),
        total_posts: N(existingAccount.total_posts) + 1,
        total_views: N(existingAccount.total_views) + fV,
        total_likes: N(existingAccount.total_likes) + likes,
        total_engagement: N(existingAccount.total_engagement) + likes + comments + shares + saves,
        total_revenue: N(existingAccount.total_revenue),
        account_level: Math.floor(N(existingAccount.followers) / 1000) + 1,
        verified: N(existingAccount.followers) > 10000
      });
    } else {
      await entities.SocialAccount.create({
        artist_id: artistId,
        platform: 'looptok',
        followers: 0,
        total_posts: 1,
        total_views: fV,
        total_likes: likes,
        total_engagement: likes + comments + shares + saves,
        total_revenue: 0,
        account_level: 1,
        verified: false
      });
    }

    // Update looptok_sound_metrics for a player-owned sound (trending sound tracking)
    if (linkedSoundId) {
      const { data: tsRowSound } = await supabase
        .from('turn_state')
        .select('global_turn_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const soundTurn = Number(tsRowSound?.global_turn_id) || 0;
      const extraImpressions = Math.floor(fV * 0.1);
      const newTrendState = isViral || isGodTierViral ? 'rising' : 'stable';

      // SELECT then UPDATE/INSERT to correctly increment (upsert would reset uses_count to 1)
      const { data: existingSound } = await supabase
        .from('looptok_sound_metrics')
        .select('id, uses_count, impressions')
        .eq('sound_id', linkedSoundId)
        .eq('global_turn_id', soundTurn)
        .maybeSingle();

      if (existingSound) {
        await supabase.from('looptok_sound_metrics').update({
          uses_count: (existingSound.uses_count || 0) + 1,
          impressions: (existingSound.impressions || 0) + extraImpressions,
          trend_state: newTrendState,
          updated_at: new Date().toISOString(),
        }).eq('id', existingSound.id);
      } else {
        await supabase.from('looptok_sound_metrics').insert({
          sound_id: linkedSoundId,
          global_turn_id: soundTurn,
          uses_count: 1,
          impressions: extraImpressions,
          trend_state: newTrendState,
          is_player_sound: true,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Update artist profile (energy already deducted atomically via RPC)
    const newFavorability = Math.min(100, Math.max(0, N(profile.tiktok_algorithm_favorability || 50) + (isViral ? 10 : -5) + (fV > 10000 ? 5 : 0)));
    const profilePatch = {
      followers: N(profile.followers),
      hype: N(profile.hype),
      clout: N(profile.clout),
      income: N(profile.income || 0),
      tiktok_algorithm_favorability: newFavorability
    };
    assertNoCoreEconomyMutationInSocialCreate({ currentProfile: profile, patch: profilePatch, traceId, handler: 'createLoopTokPost' });
    await entities.ArtistProfile.update(artistId, profilePatch);

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
        module: 'looptok',
        event_type: 'SOCIAL_POST_CREATED',
        description: 'LoopTok post created',
        metadata: { platform: 'looptok', post_id: socialPost.id, concept: conceptId },
      },
      {
        player_id: artistId,
        global_turn_id: currentTurn,
        module: 'looptok',
        event_type: 'SOCIAL_ENGAGEMENT_SEEDED',
        description: 'LoopTok initial engagement seeded',
        metadata: { platform: 'looptok', post_id: socialPost.id, views: fV, likes, comments, shares, saves },
      },
    ]);

    if (isViral || isGodTierViral) {
      const viralModule = `looptok_viral:${socialPost.id}`;
      await supabase.from('turn_event_log').upsert({
        player_id: artistId,
        global_turn_id: currentTurn,
        module: viralModule,
        event_type: 'SOCIAL_VIRAL_EVENT',
        description: 'LoopTok viral event seeded',
        metadata: {
          idempotency_key: `social_viral_event:${artistId}:${currentTurn}:looptok:${socialPost.id}`,
          platform: 'looptok',
          post_id: socialPost.id,
          is_viral: isViral,
          is_god_tier_viral: isGodTierViral,
          base_metric_name: 'views',
          base_metric_value: fV,
          engagement_rate_used: engRate,
          multipliers_applied: {
            follower_mult: fM,
            hype_mult: hM,
            length_mult: lenMult,
            visual_boost: visBoost,
            duet_boost: duetBoost,
            hashtag_boost: hB,
            algo_mult: algo.mult,
            boost_mult: boostMult,
            viral_multiplier: viralMultiplier,
            seeded_viral_multiplier: vM,
          },
          final_multiplier: Math.round((hM * lenMult * visBoost * duetBoost * hB * algo.mult * boostMult * viralMultiplier * vM) * 1000) / 1000,
          cap_hit: false,
          cap_name: null,
          final_applied_deltas: { views: fV, likes, comments, shares, saves },
        },
      }, { onConflict: 'player_id,global_turn_id,module,event_type', ignoreDuplicates: true });
    }

    // Gap 5: Player actions → trend heat/adoption boost
    // Concept types map to trend categories; posting aligned content boosts matching active trends
    const CONCEPT_TREND_CATEGORY: Record<string, string> = {
      dance_challenge: 'challenge',
      trend_surf:      'challenge',
      trend_reaction:  'meme',
      meme_drop:       'meme',
      skit:            'meme',
      freestyle:       'sound',
      original_sound:  'sound',
      // New entries for new moods
      duet:            'sound',      // Duets surface new sounds (collab_season)
      snippet:         'challenge',   // Teasers spark challenge activity (hype_cycle primary category)
      announcement:    'challenge',  // Drop announcements drive challenge/event energy
      behind_scenes:   'aesthetic',  // Studio/tour content feeds aesthetic trends
      storytime:       'beef',       // Storytime = receipts = beef category
    };
    const matchedTrendCategory = CONCEPT_TREND_CATEGORY[conceptId] || null;
    if (matchedTrendCategory) {
      try {
        const { data: matchingTrends } = await supabase
          .from('trends')
          .select('id, heat_score, adoption_count')
          .eq('is_active', true)
          .eq('category', matchedTrendCategory)
          .in('status', ['emerging', 'rising', 'peak'])
          .limit(3);
        if (matchingTrends?.length) {
          const heatBoost = (isViral || isGodTierViral) ? 3 : 1;
          const adoptionBoost = (isViral || isGodTierViral) ? 2 : 1;
          await Promise.allSettled(
            matchingTrends.map((t: any) =>
              supabase.from('trends').update({
                heat_score: Math.round((Number(t.heat_score) + heatBoost) * 100) / 100,
                adoption_count: Number(t.adoption_count) + adoptionBoost,
              }).eq('id', t.id)
            )
          );
        }
      } catch { /* non-fatal — trend boost is best-effort */ }
    }

    // Apply runaway song social boost if applicable
    let finalPerformance = {
      views: fV,
      likes: likes,
      comments: comments,
      shares: shares,
      saves: saves,
      engagementRate: Math.floor((likes + comments + shares + saves) / fV * 1000) / 10,
      isViral,
      viralMultiplier: viralMultiplier,
      revenue,
      followerGain,
      hypeGain,
      soundUsages,
      algorithmFavorability: newFavorability
    };
    
    // Check if this post references a runaway song
    if (runawaySong?.hasRunaway) {
      const turnsSinceDetected = runawaySong.runawayData?.turnsSinceDetected || 0;
      finalPerformance = applyRunawaySocialBoost(finalPerformance, socialPost, runawaySong.runawayData, turnsSinceDetected);
    }
    
    // BUG-LT-001 FIX: link sponsored content server-side via linkSponsoredContent
    let sponsorshipResult: { success: boolean; deliverable_count_completed: number } | null = null;
    let sponsorshipError: string | null = null;
    if (sponsoredContractId && socialPost?.id) {
      try {
        const { data: tsRowSp } = await supabase
          .from('turn_state')
          .select('global_turn_id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const spTurnId = Number(tsRowSp?.global_turn_id) || 0;
        sponsorshipResult = await linkSponsoredContent(artistId, sponsoredContractId, socialPost.id, 'looptok', spTurnId);
      } catch (spErr: any) {
        sponsorshipError = spErr?.message || 'Sponsorship linkage failed';
        console.warn('[LoopTok] linkSponsoredContent failed (non-fatal):', sponsorshipError);
      }
    }

    return Response.json({
      success: true,
      data: {
        socialPost,
        loopTokPost,
        performance: finalPerformance,
        sponsorshipResult,
        sponsorshipError,
      }
    });

  } catch (error: any) {
    console.error('LoopTok post creation error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message,
      traceId,
    }, { status: 500 });
  }
}
