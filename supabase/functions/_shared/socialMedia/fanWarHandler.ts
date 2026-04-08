/**
 * Fan War Handler — Backend actions for the fan war & sentiment system
 * Actions: getFanSentiment, endorseNickname, triggerFanWar, interventFanWar, getActiveFanWars
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import {
  applyReducedFanWarIntervention,
  applyReducedSentimentEvent,
  buildReducedSentimentContext,
  generateNicknameSuggestions,
  generateFanWarPosts,
  generateFanWarNews,
  FAN_WAR_INTERVENTIONS,
} from '../fanSentimentEngine.ts';
import { pickCanonicalMediaOutlet } from '../socialMediaMath.ts';

const N = (v: any) => Number(v) || 0;

// ─── GET FAN SENTIMENT ───
async function getFanSentiment(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { artistId } = body;
  if (!artistId) return Response.json({ error: 'Missing artistId' }, { status: 400 });

  const supabase = supabaseAdmin;

  // Load fan profile
  let { data: fanProfile } = await supabase
    .from('fan_profiles')
    .select('id, overall_sentiment, nickname_suggestions, fanbase_nickname, nickname_endorsed, stans_count, haters_count')
    .eq('artist_id', artistId)
    .maybeSingle();

  // Create default profile if missing
  if (!fanProfile) {
    const { data: newProfile } = await supabase
      .from('fan_profiles')
      .insert({
        artist_id: artistId,
        overall_sentiment: 50,
      })
      .select()
      .single();
    fanProfile = newProfile;
  }

  // Load active era
  const { data: era } = await supabase
    .from('eras')
    .select('era_name, focus_path, phase, aesthetic_tag, motifs')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .maybeSingle();

  // Load artist profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('artist_name, followers, clout, hype')
    .eq('id', artistId)
    .maybeSingle();

  // Load active fan wars
  const { data: activeWars } = await supabase
    .from('fan_wars')
    .select('*')
    .eq('artist_id', artistId)
    .in('status', ['active', 'escalated', 'cooling'])
    .order('created_at', { ascending: false })
    .limit(5);

  // Generate nickname suggestions if none exist
  let nicknameSuggestions = fanProfile.nickname_suggestions || [];
  if (nicknameSuggestions.length === 0 && profile?.artist_name) {
    nicknameSuggestions = generateNicknameSuggestions(
      profile.artist_name,
      era?.era_name || null,
      (era?.motifs || []).slice(0, 3)
    );
    // Save suggestions
    await supabase.from('fan_profiles').update({
      nickname_suggestions: nicknameSuggestions
    }).eq('id', fanProfile.id);
  }

  const reducedSentiment = buildReducedSentimentContext(fanProfile?.overall_sentiment);

  return Response.json({
    success: true,
    data: {
      sentiments: reducedSentiment.sentiments,
      overallSentiment: reducedSentiment.overall,
      archetypes: reducedSentiment.archetypes,
      fanbaseNickname: fanProfile.fanbase_nickname || null,
      nicknameEndorsed: fanProfile.nickname_endorsed || false,
      nicknameSuggestions,
      activeWars: activeWars || [],
      interventions: FAN_WAR_INTERVENTIONS,
      era: era ? { name: era.era_name, focusPath: era.focus_path, phase: era.phase, aesthetic: era.aesthetic_tag } : null,
      stansCount: N(fanProfile.stans_count),
      hatersCount: N(fanProfile.haters_count)
    }
  });
}

// ─── ENDORSE NICKNAME ───
async function endorseNickname(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { artistId, nickname } = body;
  if (!artistId || !nickname) return Response.json({ error: 'Missing artistId or nickname' }, { status: 400 });

  const supabase = supabaseAdmin;

  // Load profile for cost check
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, income, clout')
    .eq('id', artistId)
    .maybeSingle();

  if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

  // Cost: $500 income + 2 clout
  const incomeCost = 500;
  const cloutCost = 2;
  if (N(profile.income) < incomeCost) {
    return Response.json({ error: 'Insufficient income', required: incomeCost, current: N(profile.income) }, { status: 400 });
  }

  // Deduct cost and set nickname
  await supabase.from('profiles').update({
    income: N(profile.income) - incomeCost,
    clout: Math.max(0, N(profile.clout) - cloutCost)
  }).eq('id', artistId);

  await supabase.from('fan_profiles').update({
    fanbase_nickname: nickname,
    nickname_endorsed: true
  }).eq('artist_id', artistId);

  return Response.json({
    success: true,
    data: {
      nickname,
      incomeCost,
      cloutCost,
      message: `Fanbase nickname "${nickname}" endorsed! Fans will now be referred to as "${nickname}" in comments and news.`
    }
  });
}

// ─── TRIGGER FAN WAR (Player-initiated via PR Management) ───
async function triggerFanWar(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { artistId, triggerType, rivalArtistId } = body;
  if (!artistId || !triggerType) return Response.json({ error: 'Missing artistId or triggerType' }, { status: 400 });

  const supabase = supabaseAdmin;
  const entities = createSupabaseEntitiesAdapter(supabase);

  // Check for existing active war
  const { data: existingWar } = await supabase
    .from('fan_wars')
    .select('id')
    .eq('artist_id', artistId)
    .in('status', ['active', 'escalated'])
    .maybeSingle();

  if (existingWar) {
    return Response.json({ error: 'Already have an active fan war', warId: existingWar.id }, { status: 400 });
  }

  // Load profiles
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', artistId).maybeSingle();
  const { data: fanProfile } = await supabase
    .from('fan_profiles').select('overall_sentiment').eq('artist_id', artistId).maybeSingle();

  if (!profile || !fanProfile) return Response.json({ error: 'Profile not found' }, { status: 404 });

  let rivalName: string | null = null;
  if (rivalArtistId) {
    const { data: rival } = await supabase
      .from('profiles').select('artist_name').eq('id', rivalArtistId).maybeSingle();
    rivalName = rival?.artist_name || null;
  }

  // Get current turn
  const { data: turnState } = await supabase.from('turn_state').select('global_turn_id').single();
  const currentTurn = N(turnState?.global_turn_id);

  // Determine intensity based on trigger type
  const triggerIntensity: Record<string, number> = {
    public_feud: 60,
    controversial_statement: 45,
    subliminal_diss: 35,
    organic: 25
  };
  const intensity = triggerIntensity[triggerType] || 30;

  const reducedSentiment = buildReducedSentimentContext(fanProfile?.overall_sentiment);

  // Create fan war
  const { data: fanWar, error: fwError } = await supabase
    .from('fan_wars')
    .insert({
      artist_id: artistId,
      rival_artist_id: rivalArtistId || null,
      intensity,
      duration_turns: 0,
      max_duration_turns: 14,
      source_trigger: triggerType,
      trigger_details: { triggerType, rivalName, initialIntensity: intensity },
      primary_archetypes_involved: Object.keys(reducedSentiment.archetypes).filter(
        (archetype) => (reducedSentiment.archetypes[archetype] || 0) > 20
      ),
      status: intensity >= 50 ? 'escalated' : 'active',
      started_turn: currentTurn
    })
    .select()
    .single();

  if (fwError) {
    console.error('[FanWar] Insert error:', fwError);
    return Response.json({ error: 'Failed to create fan war' }, { status: 500 });
  }

  // Generate NPC social posts
  const warPosts = generateFanWarPosts(
    artistId, profile.artist_name || 'Artist', rivalName, intensity,
    fanWar.primary_archetypes_involved || []
  );

  let postsCreated = 0;
  for (const post of warPosts) {
    const views = Math.floor(N(profile.followers) * 0.001 * (intensity / 50) * (0.5 + Math.random()));
    const likes = Math.floor(views * (0.05 + Math.random() * 0.1));
    const outlet = await pickCanonicalMediaOutlet(post.platform, Date.now() + postsCreated);
    await entities.SocialPost.create({
      artist_id: null, // NPC posts should NOT be attributed to the player
      platform: post.platform,
      post_type: post.post_type,
      title: post.title,
      caption: post.caption,
      views,
      likes,
      comments: Math.floor(likes * 0.3),
      shares: Math.floor(likes * 0.15),
      engagement_rate: Math.min(99, Math.floor((likes / Math.max(1, views)) * 1000) / 10),
      status: 'published',
      source_type: 'npc_reaction', // Clearly mark as NPC content
      metadata: {
        ...post.metadata,
        fan_war_id: fanWar.id,
        is_npc_post: true,
        posted_by_outlet: true,
        media_outlet_id: outlet.id,
        media_outlet_name: outlet.name,
        media_outlet_handle: outlet.handle,
        media_outlet_icon: outlet.icon,
        npc_username: outlet.name,
        npc_handle: outlet.handle,
        platform_pfp: outlet.avatarUrl,
      }
    });
    postsCreated++;
  }

  // Generate news items
  const newsItems = await generateFanWarNews(
    profile.artist_name || 'Artist', rivalName, intensity, triggerType
  );

  let newsCreated = 0;
  for (const news of newsItems) {
    await entities.NewsItem.create({
      artist_id: artistId,
      headline: news.headline,
      body: news.body,
      category: news.category,
      impact_score: news.impact_score,
      source: news.source,
      metadata: { is_fan_war: true, fan_war_id: fanWar.id, intensity, sentiment: news.sentiment }
    });
    newsCreated++;
  }

  // Update fan war with counts
  await supabase.from('fan_wars').update({
    social_posts_generated: postsCreated,
    news_items_generated: newsCreated
  }).eq('id', fanWar.id);

  // Update sentiment — fan wars always hurt some archetypes
  const sentimentUpdate = applyReducedSentimentEvent(
    fanProfile?.overall_sentiment,
    triggerType === 'public_feud' ? 'fake_controversy' : 'controversy_without_substance',
    { intensity: intensity, isControversial: true, clout: N(profile.clout) }
  );

  await supabase.from('fan_profiles').update({
    overall_sentiment: sentimentUpdate.overall,
    last_sentiment_update_turn: currentTurn
  }).eq('artist_id', artistId);

  return Response.json({
    success: true,
    data: {
      fanWar,
      postsCreated,
      newsCreated,
      sentimentUpdate: {
        sentiments: sentimentUpdate.sentiments,
        overall: sentimentUpdate.overall,
      },
      message: `Fan war triggered! Intensity: ${intensity}. ${postsCreated} social posts and ${newsCreated} news items generated.`
    }
  });
}

// ─── INTERVENE IN FAN WAR ───
async function interventFanWar(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { artistId, fanWarId, interventionId } = body;
  if (!artistId || !fanWarId || !interventionId) {
    return Response.json({ error: 'Missing artistId, fanWarId, or interventionId' }, { status: 400 });
  }

  const supabase = supabaseAdmin;
  const entities = createSupabaseEntitiesAdapter(supabase);

  // Load fan war
  const { data: fanWar } = await supabase
    .from('fan_wars').select('*').eq('id', fanWarId).eq('artist_id', artistId).maybeSingle();
  if (!fanWar) return Response.json({ error: 'Fan war not found' }, { status: 404 });
  if (fanWar.status === 'resolved') return Response.json({ error: 'Fan war already resolved' }, { status: 400 });

  // Find intervention
  const allInterventions = [...FAN_WAR_INTERVENTIONS.calming, ...FAN_WAR_INTERVENTIONS.fueling];
  const intervention = allInterventions.find(i => i.id === interventionId);
  if (!intervention) return Response.json({ error: 'Invalid intervention' }, { status: 400 });

  // Load profiles
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', artistId).maybeSingle();
  const { data: fanProfile } = await supabase
    .from('fan_profiles').select('overall_sentiment').eq('artist_id', artistId).maybeSingle();

  if (!profile || !fanProfile) return Response.json({ error: 'Profile not found' }, { status: 404 });

  // Check costs
  if (N(profile.energy) < (intervention.energyCost || 0)) {
    return Response.json({ error: 'Insufficient energy', required: intervention.energyCost, current: N(profile.energy) }, { status: 400 });
  }
  if ((intervention as any).incomeCost && N(profile.income) < (intervention as any).incomeCost) {
    return Response.json({ error: 'Insufficient income', required: (intervention as any).incomeCost, current: N(profile.income) }, { status: 400 });
  }

  // Apply intervention
  const result = applyReducedFanWarIntervention(intervention, fanWar, fanProfile?.overall_sentiment);

  // Update fan war
  const playerActions = fanWar.player_actions || [];
  playerActions.push({
    interventionId,
    label: intervention.label,
    timestamp: new Date().toISOString(),
    effects: result
  });

  await supabase.from('fan_wars').update({
    intensity: result.newIntensity,
    status: result.newStatus,
    player_actions: playerActions,
    clout_impact: N(fanWar.clout_impact) + result.cloutChange,
    hype_impact: N(fanWar.hype_impact) + result.hypeChange,
    income_impact: N(fanWar.income_impact) + result.incomeChange,
    ...(result.newStatus === 'resolved' ? { resolved_turn: N((await supabase.from('turn_state').select('global_turn_id').single()).data?.global_turn_id) } : {})
  }).eq('id', fanWarId);

  // Update artist profile
  await supabase.from('profiles').update({
    energy: Math.max(0, N(profile.energy) - (intervention.energyCost || 0)),
    income: Math.max(0, N(profile.income) + result.incomeChange),
    clout: Math.max(0, N(profile.clout) + result.cloutChange),
    hype: Math.max(0, Math.min(100, N(profile.hype) + result.hypeChange))
  }).eq('id', artistId);

  await supabase.from('fan_profiles').update({
    overall_sentiment: result.overall
  }).eq('artist_id', artistId);

  // If fueling, generate more NPC content
  const isFueling = FAN_WAR_INTERVENTIONS.fueling.some(f => f.id === interventionId);
  if (isFueling && result.newIntensity > fanWar.intensity) {
    const newPosts = generateFanWarPosts(
      artistId, profile.artist_name || 'Artist', null, result.newIntensity,
      fanWar.primary_archetypes_involved || []
    );
    let interventionPostsCreated = 0;
    for (const post of newPosts.slice(0, 2)) {
      const outlet = await pickCanonicalMediaOutlet(post.platform, Date.now() + interventionPostsCreated);
      const views = Math.floor(N(profile.followers) * 0.0012 * (result.newIntensity / 50) * (0.5 + Math.random()));
      const likes = Math.floor(views * (0.07 + Math.random() * 0.08));
      await entities.SocialPost.create({
        artist_id: null, // NPC posts should NOT be attributed to the player
        platform: post.platform,
        post_type: post.post_type,
        title: post.title,
        caption: post.caption,
        views,
        likes,
        engagement_rate: Math.min(99, Math.floor((likes / Math.max(1, views)) * 1000) / 10),
        comments: Math.floor(views * 0.03),
        shares: Math.floor(views * 0.01),
        status: 'published',
        metadata: {
          ...post.metadata,
          fan_war_id: fanWarId,
          from_intervention: interventionId,
          posted_by_outlet: true,
          media_outlet_id: outlet.id,
          media_outlet_name: outlet.name,
          media_outlet_handle: outlet.handle,
          media_outlet_icon: outlet.icon,
          npc_username: outlet.name,
          npc_handle: outlet.handle,
          platform_pfp: outlet.avatarUrl,
        }
      });
      interventionPostsCreated++;
    }
  }

  return Response.json({
    success: true,
    data: {
      intervention: intervention.label,
      newIntensity: result.newIntensity,
      newStatus: result.newStatus,
      hypeChange: result.hypeChange,
      cloutChange: result.cloutChange,
      incomeChange: result.incomeChange,
      sentimentDeltas: result.sentimentDeltas,
      narrative: result.narrativeEvent,
      energyCost: intervention.energyCost
    }
  });
}

// ─── ROUTER ───
export async function handleFanWarAction(req: Request, action: string) {
  switch (action) {
    case 'getFanSentiment': return getFanSentiment(req);
    case 'endorseNickname': return endorseNickname(req);
    case 'triggerFanWar': return triggerFanWar(req);
    case 'interventFanWar': return interventFanWar(req);
    default:
      return Response.json({ error: `Unknown fan war action: ${action}` }, { status: 400 });
  }
}
