/**
 * FAN INTERACTION HANDLER
 * Generates fan messages and manages community sentiment
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';

function N(v: any): number {
  return Number(v) || 0;
}

function pickFanName(seed: string) {
  const pool = [
    'MusicLover42', 'SuperFan2000', 'BeatSeeker', 'LateNightListener', 'IndieScout',
    'VibeCollector', 'RhythmRunner', 'MelodyMuse', 'ChartWatcher', 'BasslineKid'
  ];
  const idx = Math.abs(seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % pool.length;
  return pool[idx];
}

function mapMessageForUi(row: any) {
  const sentimentLabel = row.sentiment_score > 30
    ? 'positive'
    : row.sentiment_score < -30
      ? 'negative'
      : 'neutral';

  return {
    id: row.id,
    fan_name: row.sender_type === 'Artist' ? 'You' : pickFanName(row.id),
    message: row.message_content,
    sentiment: sentimentLabel,
    message_type: row.sender_type === 'Artist' ? 'reply' : 'comment',
    created_at: row.created_at,
    likes: N(row.like_count),
    is_stan: row.sentiment_score >= 80,
    is_hater: row.sentiment_score <= -80,
    has_reply: N(row.reply_count) > 0
  };
}

async function getMessages(body: any) {
  const artistId = body.artistId || body.artist_id;
  const page = Math.max(1, N(body.page) || 1);
  const limit = Math.min(50, Math.max(1, N(body.limit) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error } = await supabaseAdmin
    .from('community_messages')
    .select('*')
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return Response.json({
    success: true,
    data: {
      messages: (data || []).map(mapMessageForUi),
      page,
      limit
    }
  });
}

async function getStats(body: any) {
  const artistId = body.artistId || body.artist_id;

  const { count: totalMessages } = await supabaseAdmin
    .from('community_messages')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan');

  const { count: weekMessages } = await supabaseAdmin
    .from('community_messages')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { count: stans } = await supabaseAdmin
    .from('community_messages')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan')
    .gte('sentiment_score', 80);

  const { count: haters } = await supabaseAdmin
    .from('community_messages')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan')
    .lte('sentiment_score', -80);

  const { data: sentiments } = await supabaseAdmin
    .from('community_messages')
    .select('sentiment_score')
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan')
    .order('created_at', { ascending: false })
    .limit(200);

  const avg = sentiments?.length
    ? sentiments.reduce((sum, row) => sum + N(row.sentiment_score), 0) / sentiments.length
    : 0;
  const normalized = Math.max(0, Math.min(1, (avg + 100) / 200));

  return Response.json({
    success: true,
    data: {
      stats: {
        total_messages: totalMessages || 0,
        overall_sentiment: Number(normalized.toFixed(2)),
        stans: stans || 0,
        haters: haters || 0,
        this_week_messages: weekMessages || 0
      }
    }
  });
}

async function replyToMessage(body: any) {
  const artistId = body.artistId || body.artist_id;
  const replyTo = body.reply_to;
  const replyText = String(body.reply_text || '').trim();

  if (!replyTo || !replyText) {
    return Response.json({ error: 'Missing required fields: reply_to, reply_text' }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('community_messages')
    .update({
      reply_count: 1,
      response_by_artist_id: artistId,
      updated_at: new Date().toISOString()
    })
    .eq('id', replyTo)
    .eq('artist_id', artistId)
    .eq('sender_type', 'Fan');

  if (updateError) throw updateError;

  const { error: insertError } = await supabaseAdmin
    .from('community_messages')
    .insert({
      artist_id: artistId,
      sender_type: 'Artist',
      message_content: replyText,
      sentiment_score: 10,
      response_by_artist_id: artistId,
      like_count: 0,
      reply_count: 0
    });

  if (insertError) throw insertError;

  return Response.json({
    success: true,
    data: {
      replied: true,
      inspiration_gained: Math.floor(Math.random() * 3) + 1
    }
  });
}

export async function generateFanMessages(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = body.artistId || body.artist_id;
    const mode = body.messageType || body.message_type;

    if (!artistId) {
      return Response.json({
        error: 'Missing required field: artistId or artist_id'
      }, { status: 400 });
    }

    if (mode === 'get_messages') return await getMessages(body);
    if (mode === 'get_stats') return await getStats(body);
    if (mode === 'reply') return await replyToMessage(body);

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return Response.json({
        error: 'Artist profile not found'
      }, { status: 404 });
    }

    const recentPosts = await entities.SocialPost.filter({
      artist_id: artistId,
      created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
    }, 'created_at desc', 10);

    const positiveTemplates = [
      'This is incredible!!',
      'Your best work yet',
      'Production quality is insane',
      'Subscribed instantly',
      'Watched this 10 times',
      'So underrated',
      'Visuals are stunning',
      'Deserves way more views',
      "Can't stop listening to this",
      "You're going to be huge!"
    ];

    const neutralTemplates = [
      'Not bad, keep going',
      'Interesting concept',
      'Beat is cool but mix needs work',
      "When's the next upload?",
      'First time here',
      'Has potential',
      'Decent effort'
    ];

    const negativeTemplates = [
      'Mid tbh',
      'Audio quality needs work',
      "This ain't it",
      'You fell off',
      'Trying too hard',
      'Skip',
      'Not feeling it'
    ];

    const messages = [];
    const messageCount = Math.min(20, Math.floor(N(profile.followers) / 100) + recentPosts.length);

    for (let i = 0; i < messageCount; i++) {
      const roll = Math.random();
      let template;
      let sentiment;

      if (roll < 0.7) {
        template = positiveTemplates[Math.floor(Math.random() * positiveTemplates.length)];
        sentiment = Math.floor(50 + Math.random() * 50);
      } else if (roll < 0.9) {
        template = neutralTemplates[Math.floor(Math.random() * neutralTemplates.length)];
        sentiment = Math.floor(-20 + Math.random() * 40);
      } else {
        template = negativeTemplates[Math.floor(Math.random() * negativeTemplates.length)];
        sentiment = Math.floor(-100 + Math.random() * 30);
      }

      let content = template;
      if (recentPosts.length > 0 && Math.random() < 0.5) {
        const post = recentPosts[Math.floor(Math.random() * recentPosts.length)];
        content = `Re: "${post.title}" - ${template}`;
      }

      messages.push({
        artist_id: artistId,
        sender_type: 'Fan',
        message_content: content,
        sentiment_score: sentiment,
        like_count: Math.floor(Math.random() * 100),
        reply_count: Math.floor(Math.random() * 2)
      });
    }

    if (messages.length > 0) {
      const { data: insertedMessages } = await supabaseAdmin
        .from('community_messages')
        .insert(messages)
        .select();

      return Response.json({
        success: true,
        data: {
          messagesGenerated: messages.length,
          messages: (insertedMessages || []).map(mapMessageForUi),
          sentimentBreakdown: {
            positive: messages.filter((m) => m.sentiment_score > 30).length,
            neutral: messages.filter((m) => m.sentiment_score >= -30 && m.sentiment_score <= 30).length,
            negative: messages.filter((m) => m.sentiment_score < -30).length
          }
        }
      });
    }

    return Response.json({
      success: true,
      data: {
        messagesGenerated: 0,
        message: 'No messages generated (insufficient activity)'
      }
    });
  } catch (error: any) {
    console.error('Fan message generation error:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
