/**
 * LIVE STREAM HANDLER — Enhanced with Interactive Outcomes
 * 
 * Player choices (tease_music, chat, updates, acoustic, collab) influence
 * a weighted outcome roll that produces positive or negative events:
 * 
 * POSITIVE: clout surge, follower explosion, positive news, hype boost
 * NEGATIVE: fan wars (social posts), rumors (news items), trashy media (VidWave videos)
 * 
 * Outcome probability is influenced by clout, hype, choice, and randomness.
 * Higher clout = more viewers but also more scrutiny (higher negative chance).
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';
import { getRandomCommentTemplate } from '../segmentSentimentTriggers.ts';
import { pickCanonicalMediaOutlet } from '../socialMediaMath.ts';
import { generateTrashyThumbnail } from '../thumbnailGenerator.ts';
import { executeEraAction } from '../eraEvolutionDetector.ts';

function N(v: any): number { return Number(v) || 0; }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

/**
 * Generate comments from segment-based sentiment data (new 6-segment system).
 * Falls back gracefully if no segments exist.
 */
function generateSegmentComments(
  segmentSentiments: Record<string, number>,
  segmentCounts: Record<string, number>,
  streamChoice: string,
  peakViewers: number,
  artistName: string,
): string[] {
  const comments: string[] = [];
  const totalFans = Object.values(segmentCounts).reduce((a, b) => a + b, 0);
  if (totalFans === 0) return comments;

  // Pick 3-5 comments from weighted segments
  const numComments = Math.min(5, Math.max(3, Math.floor(peakViewers / 100)));
  
  // Build weighted pool based on segment counts
  const pool: Array<{ segment: string; weight: number }> = [];
  for (const seg of Object.keys(segmentSentiments)) {
    const count = segmentCounts[seg] || 0;
    if (count > 0) {
      pool.push({ segment: seg, weight: count / totalFans });
    }
  }

  for (let i = 0; i < numComments; i++) {
    // Weighted random segment selection
    const roll = Math.random();
    let cumulative = 0;
    let selectedSegment = pool[0]?.segment || 'casual';
    for (const entry of pool) {
      cumulative += entry.weight;
      if (roll <= cumulative) {
        selectedSegment = entry.segment;
        break;
      }
    }

    const sentiment = segmentSentiments[selectedSegment] ?? 50;
    const category = sentiment > 65 ? 'positive' : sentiment < 35 ? 'negative' : 'neutral';
    
    const template = getRandomCommentTemplate(selectedSegment, category);
    if (template) {
      comments.push(template);
    }
  }

  return comments;
}

// Generate random NPC usernames for clips and reactions
const NPC_USERNAME_PREFIXES = ['viral', 'daily', 'clips', 'best', 'hot', 'trending', 'tea', 'drama', 'fan', 'stan'];
const NPC_USERNAME_SUFFIXES = ['clips', 'moments', 'tea', 'updates', 'news', 'daily', 'hub', 'zone', 'central', 'world'];
function generateRandomUsername(): string {
  const prefix = NPC_USERNAME_PREFIXES[Math.floor(Math.random() * NPC_USERNAME_PREFIXES.length)];
  const suffix = NPC_USERNAME_SUFFIXES[Math.floor(Math.random() * NPC_USERNAME_SUFFIXES.length)];
  const num = Math.floor(Math.random() * 999);
  return `${prefix}${suffix}${num}`;
}

// ─── Choice definitions ───
const CHOICES: Record<string, { label: string; engagementMult: number; positiveWeight: number; negativeWeight: number; energyCost: number; duration: number }> = {
  tease_music:  { label: 'Tease Unreleased Music', engagementMult: 1.5, positiveWeight: 0.55, negativeWeight: 0.20, energyCost: 50, duration: 45 },
  chat:         { label: 'Chat with Fans',         engagementMult: 1.2, positiveWeight: 0.50, negativeWeight: 0.15, energyCost: 40, duration: 60 },
  updates:      { label: 'Personal Updates',       engagementMult: 1.0, positiveWeight: 0.40, negativeWeight: 0.25, energyCost: 35, duration: 30 },
  acoustic:     { label: 'Acoustic Performance',   engagementMult: 1.6, positiveWeight: 0.60, negativeWeight: 0.10, energyCost: 55, duration: 45 },
  collab:       { label: 'Collab Stream',           engagementMult: 1.4, positiveWeight: 0.50, negativeWeight: 0.18, energyCost: 50, duration: 75 },
};

// ─── Outcome templates ───
const POSITIVE_OUTCOMES = [
  { type: 'clout_surge',       weight: 3, label: 'Clout Surge' },
  { type: 'follower_explosion', weight: 3, label: 'Follower Explosion' },
  { type: 'hype_boost',        weight: 4, label: 'Hype Boost' },
  { type: 'positive_news',     weight: 2, label: 'Positive Press Coverage' },
  { type: 'donation_frenzy',   weight: 2, label: 'Donation Frenzy' },
];

const NEGATIVE_OUTCOMES = [
  { type: 'fan_war',           weight: 3, label: 'Fan War Erupts' },
  { type: 'rumor_spread',      weight: 3, label: 'Rumor Spreads' },
  { type: 'trashy_media',      weight: 2, label: 'Trashy Media Coverage' },
  { type: 'awkward_moment',    weight: 3, label: 'Awkward Moment Goes Viral' },
  { type: 'technical_fail',    weight: 2, label: 'Technical Failure' },
];

const NEUTRAL_OUTCOMES = [
  { type: 'standard',          weight: 1, label: 'Solid Stream' },
];

// ─── Trashy media headline templates ───
const TRASHY_HEADLINES = [
  (name: string) => `${name}'s AWKWARD Live Stream Moment Has Fans Worried`,
  (name: string) => `Is ${name} LOSING Their Touch? Live Stream Disaster`,
  (name: string) => `${name} Goes OFF on Fan During Live — Full Breakdown`,
  (name: string) => `WATCH: ${name}'s Live Stream Gets HIJACKED`,
  (name: string) => `${name}'s Embarrassing Live Moment Goes VIRAL`,
  (name: string) => `Fans TURN on ${name} After Controversial Live Stream`,
  (name: string) => `${name} Caught Slipping on Live — Internet Reacts`,
  (name: string) => `The ${name} Live Stream That BROKE the Internet`,
];

// ─── Fan war post templates ───
const FAN_WAR_POSTS = [
  (name: string) => `${name} stans are DELUSIONAL if they think that stream was good 💀`,
  (name: string) => `Y'all really defending ${name} after THAT? Couldn't be me`,
  (name: string) => `${name} haters are so loud rn... the stream was fire and you know it 🔥`,
  (name: string) => `The ${name} fanbase is at WAR with itself rn and I'm here for it`,
  (name: string) => `Not ${name} causing a civil war on the timeline AGAIN 😭`,
  (name: string) => `${name} really said something wild on stream and now everyone's fighting`,
];

// ─── Rumor templates ───
const RUMOR_HEADLINES = [
  (name: string) => `Sources: ${name} appeared "unfocused" during live stream`,
  (name: string) => `Industry insiders question ${name}'s commitment after stream`,
  (name: string) => `${name} drops cryptic hints during live — fans speculate wildly`,
  (name: string) => `Unnamed source claims ${name} was "not in a good place" during stream`,
  (name: string) => `${name}'s live stream comments raise eyebrows in the industry`,
];

// ─── Positive news templates ───
const POSITIVE_HEADLINES = [
  (name: string) => `${name} WOWS fans with incredible live performance`,
  (name: string) => `${name}'s live stream breaks personal viewer record`,
  (name: string) => `Fans can't stop talking about ${name}'s amazing live session`,
  (name: string) => `${name} proves why they're the real deal with stunning live Q&A`,
  (name: string) => `${name}'s live stream goes viral for all the RIGHT reasons`,
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function simulateLiveStream(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId, platform, choice, title } = body;
    // Backward compat: accept old params
    const streamChoice = choice || body.theme || body.topic || 'chat';

    if (!artistId || !platform) {
      return Response.json({ error: 'Missing required fields: artistId, platform' }, { status: 400 });
    }

    const choiceDef = CHOICES[streamChoice] || CHOICES.chat;
    const energyCost = body.energyCost || choiceDef.energyCost;
    const streamDuration = body.durationMinutes || body.duration || choiceDef.duration;
    const artistName = body.artistName || 'Artist';

    const supabase = supabaseAdmin;
    const entities = createSupabaseEntitiesAdapter(supabase);

    // ─── Load profile ───
    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) return Response.json({ error: 'Artist profile not found' }, { status: 404 });

    const displayName = profile.display_name || profile.artist_name || artistName;

    // ─── Get current turn (no cooldown — energy-gated only) ───
    const { data: turnState } = await supabase.from('turn_state').select('global_turn_id').single();
    const currentTurn = N(turnState?.global_turn_id);

    // ─── Energy check ───
    if (N(profile.energy) < energyCost) {
      return Response.json({ error: 'Insufficient energy', current: N(profile.energy), required: energyCost }, { status: 400 });
    }

    // ─── Audience simulation ───
    const followers = N((profile.fans ?? profile.followers));
    const hype = N(profile.hype);
    const clout = N(profile.clout);

    const baseViewers = Math.max(20, Math.floor(followers * 0.08 + clout * 0.5));
    const hypeMult = 1 + hype / 120;
    const platformMult = platform.toLowerCase() === 'vidwave' ? 1.2 : 1.0;
    const choiceMult = choiceDef.engagementMult;
    const durationMult = Math.min(1.8, streamDuration / 60);
    const randomVar = 0.8 + Math.random() * 0.4;

    const rawPeakViewers = Math.floor(baseViewers * hypeMult * platformMult * choiceMult * durationMult * randomVar);
    const peakViewers = Math.min(rawPeakViewers, 500000); // Cap at 500K to keep numbers realistic
    const avgViewers = Math.floor(peakViewers * (0.55 + Math.random() * 0.3));
    const engagementScore = clamp(Math.floor(40 + hype / 3 + clout / 20 + Math.random() * 25), 0, 100);

    // ─── Revenue ───
    const revenuePerViewer = platform.toLowerCase() === 'vidwave' ? 0.0008 : 0.0004;
    const donationRate = 0.005 + Math.random() * 0.01;
    const avgDonation = 3 + Math.random() * 12;
    const donationCount = Math.floor(peakViewers * donationRate);
    const donationRevenue = Math.floor(donationCount * avgDonation);
    const adRevenue = Math.floor(avgViewers * (streamDuration / 60) * revenuePerViewer); // Per hour, not per minute
    let totalRevenue = Math.min(50000, adRevenue + donationRevenue); // Hard cap: $50K per stream

    // ─── OUTCOME ROLL ───
    // Higher clout = more scrutiny = slightly higher negative chance
    const scrutinyPenalty = Math.min(0.15, clout / 2000); // 0-15% extra negative chance at high clout
    const positiveChance = choiceDef.positiveWeight - scrutinyPenalty * 0.5;
    const negativeChance = choiceDef.negativeWeight + scrutinyPenalty;
    const neutralChance = 1 - positiveChance - negativeChance;

    const roll = Math.random();
    let outcomeCategory: 'positive' | 'negative' | 'neutral';
    if (roll < positiveChance) outcomeCategory = 'positive';
    else if (roll < positiveChance + negativeChance) outcomeCategory = 'negative';
    else outcomeCategory = 'neutral';

    const outcome = outcomeCategory === 'positive' ? pickWeighted(POSITIVE_OUTCOMES)
                   : outcomeCategory === 'negative' ? pickWeighted(NEGATIVE_OUTCOMES)
                   : pickWeighted(NEUTRAL_OUTCOMES);

    // ─── Calculate stat changes based on outcome ───
    let cloutChange = Math.floor(peakViewers / 1000);
    let hypeChange = Math.floor(engagementScore / 20);
    let followerChange = Math.floor(peakViewers * 0.005 * (0.8 + Math.random() * 0.4));
    let fameChange = 0; // deprecated: folded into clout
    const outcomeEvents: any[] = []; // Track generated side-effects for response

    switch (outcome.type) {
      // ─── POSITIVE OUTCOMES ───
      case 'clout_surge':
        cloutChange = Math.floor(cloutChange * 2.5 + 3);
        outcomeEvents.push({ type: 'stat_boost', stat: 'clout', bonus: cloutChange });
        break;
      case 'follower_explosion':
        followerChange = Math.floor(followerChange * 3 + 10);
        outcomeEvents.push({ type: 'stat_boost', stat: 'followers', bonus: followerChange });
        break;
      case 'hype_boost':
        hypeChange = Math.floor(hypeChange * 2.5 + 5);
        outcomeEvents.push({ type: 'stat_boost', stat: 'hype', bonus: hypeChange });
        break;
      case 'positive_news': {
        const headline = pickRandom(POSITIVE_HEADLINES)(displayName);
        await supabase.from('news_items').insert({
          headline,
          category: 'entertainment',
          artist_id: artistId,
          body: `${displayName}'s live ${choiceDef.label.toLowerCase()} session captivated ${peakViewers.toLocaleString()} viewers.`,
          impact_score: clamp(Math.floor(engagementScore / 10), 1, 10),
          source: 'Music Daily',
          metadata: { is_live_stream: true, outcome: 'positive_news', stream_choice: streamChoice }
        });
        hypeChange += 3;
        cloutChange += 2;
        outcomeEvents.push({ type: 'news', headline, sentiment: 'positive' });
        break;
      }
      case 'donation_frenzy': {
        const bonusDonations = Math.floor(donationRevenue * (1.5 + Math.random()));
        totalRevenue += bonusDonations;
        outcomeEvents.push({ type: 'revenue_boost', bonus: bonusDonations });
        break;
      }

      // ─── NEGATIVE OUTCOMES ───
      case 'fan_war': {
        // Generate 2-4 fan war posts on Xpress (Twitter analog)
        const warPostCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < warPostCount; i++) {
          const content = pickRandom(FAN_WAR_POSTS)(displayName);
          await entities.SocialPost.create({
            artist_id: artistId,
            platform: 'xpress',
            post_type: 'text',
            title: '',
            caption: content,
            views: Math.floor(peakViewers * (0.3 + Math.random() * 0.5)),
            likes: Math.floor(Math.random() * 200 + 50),
            comments: Math.floor(Math.random() * 100 + 20),
            shares: Math.floor(Math.random() * 80 + 10),
            saves: 0,
            engagement_rate: Math.min(999, 8 + Math.random() * 12),
            revenue: 0,
            is_viral: Math.random() > 0.5,
            status: 'published',
            metadata: {
              is_fan_war: true,
              is_npc_post: true,
              npc_username: `fan_${Math.floor(Math.random() * 9999)}`,
              stream_source: true,
              artist_name: displayName
            }
          });
        }
        hypeChange = Math.max(0, hypeChange - 2); // Controversy costs some hype
        cloutChange += 1; // But controversy = attention
        outcomeEvents.push({ type: 'fan_war', postCount: warPostCount });
        break;
      }
      case 'rumor_spread': {
        const headline = pickRandom(RUMOR_HEADLINES)(displayName);
        await supabase.from('news_items').insert({
          headline,
          category: 'gossip',
          artist_id: artistId,
          body: `Following ${displayName}'s recent live stream, industry sources have raised questions about the artist's direction.`,
          impact_score: -1 * clamp(Math.floor(3 + Math.random() * 4), 1, 7),
          source: 'TMZ Music',
          metadata: { is_live_stream: true, outcome: 'rumor_spread', stream_choice: streamChoice }
        });
        hypeChange = Math.max(0, hypeChange - 3);
        outcomeEvents.push({ type: 'rumor', headline });
        break;
      }
      case 'trashy_media': {
        // Generate 1-2 trashy clickbait videos on VidWave via media outlet accounts
        const trashCount = 1 + (Math.random() > 0.6 ? 1 : 0);
        for (let i = 0; i < trashCount; i++) {
          const trashTitle = pickRandom(TRASHY_HEADLINES)(displayName);
          const trashViews = Math.floor(peakViewers * (0.5 + Math.random() * 2));
          const trashOutlet = await pickCanonicalMediaOutlet('vidwave', Date.now() + i);
          const trashThumb = generateTrashyThumbnail(trashTitle, displayName, trashOutlet.name, trashOutlet.icon);
          await entities.SocialPost.create({
            artist_id: null, // NPC post - not attributed to player
            source_type: 'npc_reaction',
            is_ai_generated: true,
            platform: 'vidwave',
            post_type: 'video',
            title: trashTitle,
            caption: `${trashOutlet.icon} ${trashOutlet.name} coverage of ${displayName}'s live stream`,
            thumbnail_url: trashThumb,
            views: trashViews,
            likes: Math.floor(trashViews * 0.08),
            comments: Math.floor(trashViews * 0.04),
            shares: Math.floor(trashViews * 0.03),
            saves: Math.floor(trashViews * 0.01),
            engagement_rate: Math.min(999, 12 + Math.random() * 8),
            revenue: 0,
            is_viral: trashViews > 1000,
            status: 'published',
            metadata: {
              video_type: 'commentary',
              is_trashy_media: true,
              is_npc_reaction: true,
              is_npc: true,
              posted_by_outlet: true,
              about_artist_id: artistId,
              reaction_sentiment: 'hater',
              media_outlet_id: trashOutlet.id,
              media_outlet_name: trashOutlet.name,
              media_outlet_handle: trashOutlet.handle,
              media_outlet_icon: trashOutlet.icon,
              reaction_channel_name: trashOutlet.name,
              reaction_channel_icon: trashOutlet.icon,
              npc_username: trashOutlet.name,
              npc_handle: trashOutlet.handle,
              platform_pfp: trashOutlet.avatarUrl,
              stream_source: true,
              artist_name: displayName,
              thumbnail_style: 'trashy_clickbait'
            }
          });
          outcomeEvents.push({ type: 'trashy_media', title: trashTitle, views: trashViews });
        }
        hypeChange = Math.max(0, hypeChange - 1);
        cloutChange += 1; // All press is press
        break;
      }
      case 'awkward_moment': {
        // Mild negative: viral clip + small hype loss
        const clipTitle = `${displayName}'s awkward moment on live 😬`;
        const clipperUsername = generateRandomUsername();
        await entities.SocialPost.create({
          artist_id: null, // NPC post - not attributed to player
          source_type: 'npc_reaction',
          is_ai_generated: true,
          platform: 'looptok',
          post_type: 'video',
          title: clipTitle,
          caption: 'This clip is going VIRAL 💀',
          views: Math.floor(peakViewers * (1 + Math.random() * 3)),
          likes: Math.floor(peakViewers * 0.15),
          comments: Math.floor(peakViewers * 0.08),
          shares: Math.floor(peakViewers * 0.1),
          saves: Math.floor(peakViewers * 0.02),
          engagement_rate: Math.min(999, 15 + Math.random() * 10),
          revenue: 0,
          is_viral: true,
          status: 'published',
          metadata: {
            video_type: 'short',
            is_npc_post: true,
            is_awkward_clip: true,
            stream_source: true,
            about_artist_id: artistId,
            artist_name: displayName,
            npc_username: clipperUsername,
            npc_handle: `@${clipperUsername.toLowerCase().replace(/\s+/g, '_')}`
          }
        });
        hypeChange = Math.max(0, hypeChange - 4);
        followerChange = Math.max(0, followerChange - 5);
        outcomeEvents.push({ type: 'awkward_clip', title: clipTitle });
        break;
      }
      case 'technical_fail': {
        // Stream cut short — reduced revenue and engagement
        totalRevenue = Math.floor(totalRevenue * 0.3);
        hypeChange = 0;
        followerChange = Math.floor(followerChange * 0.3);
        outcomeEvents.push({ type: 'technical_fail', revenueLost: Math.floor(totalRevenue * 0.7) });
        break;
      }
      // ─── NEUTRAL ───
      default:
        // Standard outcome — no bonus, no penalty
        break;
    }

    // ─── Clamp final stat changes ───
    hypeChange = clamp(hypeChange, -10, 20);
    cloutChange = clamp(cloutChange, 0, 30);
    followerChange = clamp(followerChange, -20, 500);

    // ─── Map platform names ───
    const platformDbMap: Record<string, string> = { vidwave: 'YouTube', looptok: 'TikTok', youtube: 'YouTube', tiktok: 'TikTok' };
    const dbPlatform = platformDbMap[platform.toLowerCase()] || platform;
    const socialPlatform = platform.toLowerCase() === 'vidwave' ? 'vidwave' : 'looptok';
    const streamTitle = title || `${choiceDef.label} — ${displayName} Live`;

    // ─── Create live_stream_events record ───
    const { data: liveStream, error: lsError } = await supabase
      .from('live_stream_events')
      .insert({
        artist_id: artistId,
        platform: dbPlatform,
        topic: streamChoice,
        duration_minutes: streamDuration,
        viewer_peak: peakViewers,
        engagement_score: engagementScore,
        income_generated: totalRevenue,
        energy_cost: energyCost,
        status: 'completed',
        conducted_turn: currentTurn || null,
        choice: streamChoice,
        outcome_type: outcome.type,
        outcome_details: { category: outcomeCategory, events: outcomeEvents },
        clout_change: cloutChange,
        hype_change: hypeChange,
        follower_change: followerChange,
        fame_change: fameChange
      })
      .select()
      .single();

    if (lsError) console.warn('[LiveStream] insert warning:', lsError.message);

    // ─── Create main stream social post ───
    const likes = Math.floor(peakViewers * (0.1 + Math.random() * 0.1));
    const comments = Math.floor(peakViewers * (0.03 + Math.random() * 0.03));
    const shares = Math.floor(likes * 0.06);
    const saves = Math.floor(likes * 0.04);
    await entities.SocialPost.create({
      artist_id: artistId,
      platform: socialPlatform,
      post_type: 'video',
      title: streamTitle,
      caption: `Live ${choiceDef.label.toLowerCase()} session — ${streamDuration} min`,
      views: peakViewers,
      likes, comments, shares, saves,
      engagement_rate: Math.min(999, peakViewers > 0 ? Math.floor((likes + comments + shares) / peakViewers * 1000) / 10 : 0),
      revenue: totalRevenue,
      is_viral: peakViewers > 500,
      viral_multiplier: Math.min(99, peakViewers > 500 ? Math.round(peakViewers / 200 * 10) / 10 : 1.0),
      status: 'published',
      energy_cost: energyCost,
      metadata: {
        video_type: 'live_performance',
        is_live_stream: true,
        stream_choice: streamChoice,
        duration_minutes: streamDuration,
        peak_viewers: peakViewers,
        artist_name: displayName,
        outcome_type: outcome.type,
        outcome_category: outcomeCategory
      }
    });

    // ─── Update artist profile ───
    await entities.ArtistProfile.update(artistId, {
      energy: Math.max(0, N(profile.energy) - energyCost),
      income: N(profile.income || 0) + totalRevenue,
      hype: clamp(N(profile.hype) + hypeChange, 0, 100),
      clout: Math.max(0, N(profile.clout) + cloutChange + fameChange),
      followers: Math.max(0, N((profile.fans ?? profile.followers)) + followerChange),
      last_streamed_turn: currentTurn || 1
    });

    // ─── Community messages ───
    const msgTemplates = outcomeCategory === 'negative'
      ? [`That stream was... something 😬`, `${displayName} really went there huh`, `Praying for ${displayName} rn 🙏`, `The timeline is ON FIRE`]
      : [`Amazing stream! 🔥`, `${choiceDef.label} was incredible!`, `Peak viewers: ${peakViewers.toLocaleString()} 🎉`, `Can't wait for the next one!`, `Donated during the stream!`];

    const fanMessages = msgTemplates.slice(0, Math.min(5, Math.floor(peakViewers / 80) + 1)).map(msg => ({
      artist_id: artistId,
      sender_type: 'Fan',
      message_content: msg,
      sentiment_score: outcomeCategory === 'negative' ? 20 + Math.floor(Math.random() * 30) : 60 + Math.floor(Math.random() * 40),
      like_count: Math.floor(Math.random() * 50),
      reply_count: Math.floor(Math.random() * 5)
    }));
    if (fanMessages.length > 0) {
      await supabase.from('community_messages').insert(fanMessages);
    }

    // ─── Create notification ───
    await supabase.from('notifications').insert({
      player_id: artistId,
      type: 'HIGHLIGHT',
      title: outcomeCategory === 'positive' ? `🔥 ${outcome.label}!`
           : outcomeCategory === 'negative' ? `⚠️ ${outcome.label}`
           : `📺 Stream Complete`,
      body: outcomeCategory === 'positive'
        ? `Your live ${choiceDef.label.toLowerCase()} was a hit! ${peakViewers.toLocaleString()} peak viewers. ${outcome.label}: ${outcomeEvents.map(e => e.type).join(', ')}`
        : outcomeCategory === 'negative'
        ? `Your live stream had ${peakViewers.toLocaleString()} viewers but things got messy. ${outcome.label} — check your feed.`
        : `Solid stream with ${peakViewers.toLocaleString()} peak viewers. Earned $${totalRevenue.toLocaleString()}.`,
      is_read: false,
      metrics: {
        peak_viewers: peakViewers,
        revenue: totalRevenue,
        clout_change: cloutChange,
        hype_change: hypeChange,
        follower_change: followerChange
      },
      payload: {
        stream_choice: streamChoice,
        outcome_type: outcome.type,
        outcome_category: outcomeCategory
      }
    });

    // ─── Archetype Comments & Sentiment Update ───
    let archetypeComments: any[] = [];
    let sentimentUpdate: any = null;
    try {
      const { data: fanProfile } = await supabase
        .from('fan_profiles')
        .select('overall_sentiment')
        .eq('artist_id', artistId)
        .maybeSingle();

      // Fetch segment data for new 6-segment comment system
      const { data: segments } = await supabase
        .from('fandom_segments')
        .select('segment_type, sentiment, count')
        .eq('player_id', artistId);

      // Build segment sentiment maps from fandom_segments
      const segSentiments: Record<string, number> = {};
      const segCounts: Record<string, number> = {};
      if (segments && segments.length > 0) {
        for (const seg of segments) {
          segSentiments[seg.segment_type] = seg.sentiment ?? 50;
          segCounts[seg.segment_type] = seg.count ?? 0;
        }
      }
      // Generate comments from segment sentiments (empty records produce no comments gracefully)
      if (Object.keys(segSentiments).length > 0) {
        archetypeComments = generateSegmentComments(segSentiments, segCounts, streamChoice, peakViewers, displayName);
        console.log(`[LiveStream][SegSentiment] artist=${artistId} segments=${Object.keys(segSentiments).length} comments=${archetypeComments.length} sentiments=${JSON.stringify(segSentiments)}`);
      } else {
        console.log(`[LiveStream][SegSentiment] artist=${artistId} no segment data — no comments generated`);
      }

        // Map outcome to sentiment event type
        const sentimentEventMap: Record<string, string> = {
          clout_surge: 'viral_moment', follower_explosion: 'social_media_buzz',
          hype_boost: 'hype_release', positive_news: 'critical_acclaim',
          donation_frenzy: 'community_engagement',
          fan_war: 'fake_controversy', rumor_spread: 'controversy_without_substance',
          trashy_media: 'trashy_media_appearance', awkward_moment: 'low_quality_release',
          technical_failure: 'boring_content'
        };
        const sentimentEvent = sentimentEventMap[outcome.type] || (outcomeCategory === 'positive' ? 'community_engagement' : 'boring_content');

        // Load era for focus_path and check for era action completion
        const { data: era } = await supabase
          .from('eras').select('focus_path, phase, era_actions').eq('artist_id', artistId).eq('is_active', true).maybeSingle();

        // Check if we should complete the LIVE_PERFORMANCE era action
        if (era && era.phase === 'DROP') {
          const existingActions = Array.isArray(era.era_actions) ? era.era_actions : [];
          const hasLivePerformance = existingActions.some((action: any) => action.id === 'live_performance');
          
          if (!hasLivePerformance) {
            try {
              console.log('[LiveStream] Completing LIVE_PERFORMANCE era action for artist:', artistId);
              const eraActionResult = await executeEraAction(
                { json: () => ({ artistId, eraId: era.id, actionId: 'live_performance' }) } as any,
                { artistId, eraId: era.id, actionId: 'live_performance' }
              );
              
              const result = await eraActionResult.json();
              if (result.success) {
                console.log('[LiveStream] Successfully completed LIVE_PERFORMANCE era action');
                outcomeEvents.push({ 
                  type: 'era_action_completed', 
                  action: 'live_performance',
                  cloutBonus: result.cloutDelta || 0
                });
              }
            } catch (eraErr: any) {
              console.warn('[LiveStream] Failed to complete LIVE_PERFORMANCE era action:', eraErr.message);
            }
          }
        }

        // Segment-based path — sentiments handled by turn engine module
        // Report current segment sentiments in the response
        if (segments && segments.length > 0) {
          const segSentiments: Record<string, number> = {};
          for (const seg of segments) {
            segSentiments[seg.segment_type] = seg.sentiment ?? 50;
          }
          sentimentUpdate = {
            segmentSentiments: segSentiments,
            note: 'Segment sentiments shown; updates applied by turn engine'
          };
          console.log(`[LiveStream][SegSentiment] artist=${artistId} sentiment report: ${JSON.stringify(segSentiments)}`);
        }
    } catch (sentErr: any) {
      console.warn('[LiveStream] Sentiment update warning:', sentErr.message);
    }

    // ─── Response ───
    return Response.json({
      success: true,
      data: {
        liveStream: liveStream || null,
        outcome: {
          category: outcomeCategory,
          type: outcome.type,
          label: outcome.label,
          events: outcomeEvents
        },
        performance: {
          peakViewers,
          avgViewers,
          engagementScore,
          durationMinutes: streamDuration,
          revenue: { adRevenue, donationRevenue, totalRevenue, donationCount },
          fanMessages: fanMessages.length
        },
        statChanges: {
          clout: cloutChange,
          hype: hypeChange,
          followers: followerChange,
          income: totalRevenue,
          energy: -energyCost
        },
        archetypeComments,
        sentimentUpdate
      }
    });

  } catch (error: any) {
    console.error('Live stream simulation error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
