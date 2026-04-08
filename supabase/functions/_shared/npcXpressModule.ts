/**
 * NPC XPRESS MODULE — Automated media account posts for game events
 * Creates spicy, yassified posts from NPC media accounts when major events happen
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

type ToneFamily = 'snarky' | 'bitchy' | 'messy' | 'supportive' | 'troll' | 'analyst' | 'hype';
type AttentionTier = 'supporting' | 'mid' | 'marquee';

type NpcAccountDefinition = {
  handle: string;
  display_name: string;
  bio: string;
  verified: boolean;
  pfp_url: string;
  reporting_style: string;
  activity_level: 'high' | 'medium' | 'low';
  relevance_score: number;
  tone_families: ToneFamily[];
  attention_tier: AttentionTier;
  min_followers?: number;
  min_hype?: number;
  min_clout?: number;
};

type SelectedNpcAccount = {
  media_platform_id: string;
  handle: string;
  display_name: string;
  platform_pfp: string | null;
  tone_families: ToneFamily[];
  attention_tier: AttentionTier;
};

type XpressAttentionContext = {
  followers?: number;
  hype?: number;
  clout?: number;
  severity?: number;
  epicenterCityId?: string | null;
  epicenterCityName?: string | null;
};

type BeefTemplate = (primary: string, rival: string, track: string) => string;

const NPC_ACCOUNTS: NpcAccountDefinition[] = [
  {
    handle: '@TheShadeRoom',
    display_name: 'The Shade Room',
    bio: 'All tea. All shade. No filter. 👀☕',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/the-shade-room.png',
    reporting_style: 'celebrity_news',
    activity_level: 'high',
    relevance_score: 1.55,
    tone_families: ['messy', 'snarky', 'bitchy'],
    attention_tier: 'marquee',
    min_hype: 75,
    min_clout: 70,
  },
  {
    handle: '@Akademiks',
    display_name: 'DJ Akademiks',
    bio: 'Hip-hop commentary, news, and hot takes. No filter.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/dj-akademiks.png',
    reporting_style: 'urban_gossip',
    activity_level: 'high',
    relevance_score: 1.6,
    tone_families: ['troll', 'messy', 'snarky'],
    attention_tier: 'marquee',
    min_followers: 200000,
    min_clout: 68,
  },
  {
    handle: '@PopCrave',
    display_name: 'Pop Crave',
    bio: 'Pop culture news & updates',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/pop-crave.png',
    reporting_style: 'fandoms',
    activity_level: 'high',
    relevance_score: 1.45,
    tone_families: ['supportive', 'hype', 'snarky'],
    attention_tier: 'mid',
    min_hype: 55,
  },
  {
    handle: '@XXL',
    display_name: 'XXL Magazine',
    bio: 'Hip-Hop. Music. Culture.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/xxl-magazine.png',
    reporting_style: 'music_centric',
    activity_level: 'medium',
    relevance_score: 1.35,
    tone_families: ['analyst', 'hype'],
    attention_tier: 'mid',
    min_clout: 45,
  },
  {
    handle: '@ComplexMusic',
    display_name: 'Complex Music',
    bio: 'Music news from Complex',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/complex-music.png',
    reporting_style: 'industry_insider',
    activity_level: 'medium',
    relevance_score: 1.3,
    tone_families: ['analyst', 'snarky'],
    attention_tier: 'mid',
    min_followers: 75000,
  },
  {
    handle: '@HollywoodUL',
    display_name: 'Hollywood Unlocked',
    bio: 'Entertainment updates and celebrity exclusives.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/hollywood-unlocked.png',
    reporting_style: 'celebrity_news',
    activity_level: 'medium',
    relevance_score: 1.2,
    tone_families: ['messy', 'supportive'],
    attention_tier: 'mid',
    min_hype: 50,
  },
  {
    handle: '@RapAlert',
    display_name: 'Rap Alert',
    bio: 'Rap headlines, snippets, charts, and chaos.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/rap-alert.png',
    reporting_style: 'urban_gossip',
    activity_level: 'high',
    relevance_score: 1.15,
    tone_families: ['hype', 'troll', 'snarky'],
    attention_tier: 'supporting',
  },
  {
    handle: '@DailyRapFacts',
    display_name: 'Daily Rap Facts',
    bio: 'Rap facts, memes, news, and chart chatter.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/daily-rap-facts.png',
    reporting_style: 'fandoms',
    activity_level: 'medium',
    relevance_score: 1.1,
    tone_families: ['supportive', 'hype', 'messy'],
    attention_tier: 'supporting',
  },
  {
    handle: '@NoJumperNews',
    display_name: 'No Jumper News',
    bio: 'Internet rap drama and culture updates.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/no-jumper-news.png',
    reporting_style: 'urban_gossip',
    activity_level: 'medium',
    relevance_score: 1.12,
    tone_families: ['messy', 'troll', 'snarky'],
    attention_tier: 'supporting',
  },
  {
    handle: '@WorldStarHipHop',
    display_name: 'WorldStarHipHop',
    bio: 'Hip-hop culture, viral chaos, and internet moments.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/worldstarhiphop.png',
    reporting_style: 'viral_chaos',
    activity_level: 'high',
    relevance_score: 1.28,
    tone_families: ['hype', 'messy', 'troll'],
    attention_tier: 'mid',
    min_hype: 48,
  },
  {
    handle: '@BET',
    display_name: 'BET',
    bio: 'Black culture, music, awards, and major entertainment moments.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/bet.png',
    reporting_style: 'celebrity_news',
    activity_level: 'medium',
    relevance_score: 1.22,
    tone_families: ['supportive', 'hype', 'analyst'],
    attention_tier: 'mid',
    min_followers: 60000,
  },
  {
    handle: '@TMZ',
    display_name: 'TMZ',
    bio: 'Breaking celebrity headlines and messy exclusives.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/tmz.png',
    reporting_style: 'celebrity_news',
    activity_level: 'high',
    relevance_score: 1.4,
    tone_families: ['messy', 'snarky', 'bitchy'],
    attention_tier: 'marquee',
    min_hype: 70,
    min_clout: 65,
  },
  {
    handle: '@LipstickAlley',
    display_name: 'Lipstick Alley',
    bio: 'Forum-style celebrity chatter, rumors, and side-eye.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/lipstick-alley.png',
    reporting_style: 'viral_chaos',
    activity_level: 'medium',
    relevance_score: 1.14,
    tone_families: ['bitchy', 'messy', 'snarky', 'troll'],
    attention_tier: 'supporting',
  },
  {
    handle: '@Onsite',
    display_name: 'Onsite!',
    bio: 'What the internet is screaming about right now.',
    verified: true,
    pfp_url: 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/xpress/npc-avatars/onsite.png',
    reporting_style: 'viral_chaos',
    activity_level: 'high',
    relevance_score: 1.08,
    tone_families: ['messy', 'bitchy', 'hype'],
    attention_tier: 'supporting',
  },
];

const BEEF_STARTED_TEMPLATES: Record<ToneFamily, BeefTemplate[]> = {
  snarky: [
    (aggressor, target, track) => `${aggressor} really woke up and put ${target} on front street with "${track}". Oh brother.`,
    (aggressor, target, track) => `So we're acting like ${aggressor} didn't just air out ${target} on "${track}"? Timeline already in shambles.`,
    (aggressor, target, track) => `${aggressor} named ${target} on "${track}" like subtweets were no longer enough. Very loud choice.`,
  ],
  bitchy: [
    (aggressor, target, track) => `${aggressor} dropped "${track}" for ${target} and somehow made the timeline even uglier than usual.`,
    (aggressor, target, track) => `Not ${aggressor} using "${track}" to drag ${target} in public like we're all supposed to be normal about it.`,
    (aggressor, target, track) => `${aggressor} put ${target} in the middle of "${track}" and now everybody suddenly has expert opinions.`,
  ],
  messy: [
    (aggressor, target, track) => `🚨 Mess meter broken: ${aggressor} just dropped "${track}" at ${target} and the replies are already choosing sides.`,
    (aggressor, target, track) => `${aggressor} put ${target} in the group chat with "${track}". This is nasty work.`,
    (aggressor, target, track) => `${aggressor} turned "${track}" into a public scene for ${target}. Screenshots, thinkpieces, and chaos loading.`,
  ],
  supportive: [
    (aggressor, target, track) => `${aggressor} sounds locked in on "${track}". ${target} better come back with something serious.`,
    (aggressor, target, track) => `Whatever side you're on, ${aggressor} came with intent on "${track}" and the whole timeline felt it.`,
    (aggressor, target, track) => `${aggressor} clearly meant every bar on "${track}". If ${target} responds, it better match the energy.`,
  ],
  troll: [
    (aggressor, target, track) => `${target} might want airplane mode after ${aggressor} dropped "${track}". Just saying.`,
    (aggressor, target, track) => `${aggressor} hit upload on "${track}" and now ${target} gotta survive the memes first.`,
    (aggressor, target, track) => `${target} opened the app on the wrong day because ${aggressor}'s "${track}" just fed the joke economy.`,
  ],
  analyst: [
    (aggressor, target, track) => `${aggressor}'s "${track}" is less subliminal and more direct strike at ${target}. This one will move discourse fast.`,
    (aggressor, target, track) => `Initial read on "${track}": ${aggressor} made sure ${target} couldn't pretend this wasn't personal.`,
    (aggressor, target, track) => `From a rollout standpoint, ${aggressor} used "${track}" to force ${target} into the conversation immediately.`,
  ],
  hype: [
    (aggressor, target, track) => `SHOTS FIRED 🎯 ${aggressor} just launched "${track}" at ${target} and the whole app is screaming.`,
    (aggressor, target, track) => `IT'S UP 🔥 ${aggressor} dropped "${track}" for ${target} and beef season just got real.`,
    (aggressor, target, track) => `TL IN FLAMES 🔥 ${aggressor} sent "${track}" at ${target} and the engagement is already out of control.`,
  ],
};

const BEEF_RESPONSE_TEMPLATES: Record<ToneFamily, BeefTemplate[]> = {
  snarky: [
    (responder, aggressor, track) => `${responder} wasted zero time getting back at ${aggressor} with "${track}". So much for a quiet week.`,
    (responder, aggressor, track) => `${aggressor} started it, sure, but ${responder} made "${track}" sound like they were waiting for this.`,
    (responder, aggressor, track) => `${responder} answered ${aggressor} on "${track}" like the drafts were already sitting there.`,
  ],
  bitchy: [
    (responder, aggressor, track) => `${responder} answered ${aggressor} with "${track}" and now everybody's acting brand new like this wasn't inevitable.`,
    (responder, aggressor, track) => `${responder} came back with "${track}" and honestly ${aggressor} may have overestimated the situation.`,
    (responder, aggressor, track) => `${responder} used "${track}" to remind ${aggressor} that starting mess and winning it are not the same thing.`,
  ],
  messy: [
    (responder, aggressor, track) => `CLAPBACK WATCH: ${responder} just spun back on ${aggressor} with "${track}" and the app is feral.`,
    (responder, aggressor, track) => `${responder} dropped "${track}" for ${aggressor} and the screenshots are already everywhere.`,
    (responder, aggressor, track) => `${responder} flipped the whole narrative on ${aggressor} with "${track}". The discourse just got worse.`,
  ],
  supportive: [
    (responder, aggressor, track) => `${responder} heard the noise and answered ${aggressor} with "${track}". That's how you respond with purpose.`,
    (responder, aggressor, track) => `If ${aggressor} wanted a reply, ${responder} delivered on "${track}" in full.`,
    (responder, aggressor, track) => `${responder} stayed ready and used "${track}" to answer ${aggressor} directly. No confusion there.`,
  ],
  troll: [
    (responder, aggressor, track) => `${aggressor} might need a timeout because ${responder}'s "${track}" just gave the memes fresh ammo.`,
    (responder, aggressor, track) => `${responder} hit ${aggressor} back with "${track}" and now the jokes are writing themselves.`,
    (responder, aggressor, track) => `${responder}'s "${track}" just made ${aggressor} the main character of the quote tweets for all the wrong reasons.`,
  ],
  analyst: [
    (responder, aggressor, track) => `Early reaction: ${responder}'s "${track}" is a cleaner, more focused response to ${aggressor} than expected.`,
    (responder, aggressor, track) => `${responder} used "${track}" to answer ${aggressor} directly. Structurally, this moves the beef into a new round.`,
    (responder, aggressor, track) => `Response strategy check: ${responder} made "${track}" specific enough that ${aggressor} now has to counter with intent.`,
  ],
  hype: [
    (responder, aggressor, track) => `ROUND 2 💥 ${responder} just fired back at ${aggressor} with "${track}" and this is getting loud.`,
    (responder, aggressor, track) => `THE RESPONSE IS HERE 🔥 ${responder} came for ${aggressor} on "${track}" and the app is exploding again.`,
    (responder, aggressor, track) => `BOUNCE BACK MODE 🔥 ${responder} answered ${aggressor} with "${track}" and now everybody's refreshing for reactions.`,
  ],
};

function shuffleArray<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function getThresholdScore(context?: XpressAttentionContext) {
  return {
    followers: Number(context?.followers) || 0,
    hype: Number(context?.hype) || 0,
    clout: Number(context?.clout) || 0,
    severity: Number(context?.severity) || 0,
  };
}

function isEligibleAccount(account: NpcAccountDefinition, context?: XpressAttentionContext) {
  const thresholds = getThresholdScore(context);
  const meetsFollowers = !account.min_followers || thresholds.followers >= account.min_followers;
  const meetsHype = !account.min_hype || thresholds.hype >= account.min_hype;
  const meetsClout = !account.min_clout || thresholds.clout >= account.min_clout;

  if (account.attention_tier === 'marquee') {
    return thresholds.severity >= 0.85 || (meetsFollowers && (meetsHype || meetsClout));
  }

  if (account.attention_tier === 'mid') {
    return thresholds.severity >= 0.55 || meetsFollowers || meetsHype || meetsClout;
  }

  return true;
}

function determinePostCount(context?: XpressAttentionContext) {
  const thresholds = getThresholdScore(context);
  const deservesExtraCoverage = thresholds.severity >= 0.8 || thresholds.hype >= 78 || thresholds.clout >= 70 || thresholds.followers >= 250000;
  return deservesExtraCoverage ? 2 : 1;
}

function pickToneForAccount(account: SelectedNpcAccount, usedTones: Set<ToneFamily>): ToneFamily {
  const preferred = account.tone_families.filter((tone) => !usedTones.has(tone));
  const pool = preferred.length > 0 ? preferred : account.tone_families;
  return pool[Math.floor(Math.random() * pool.length)] || 'snarky';
}

function buildBeefPostContent(
  eventType: 'beef_started' | 'beef_response',
  tone: ToneFamily,
  primaryArtist: string,
  rivalArtist: string,
  trackTitle: string,
) {
  const templatePool = eventType === 'beef_started' ? BEEF_STARTED_TEMPLATES : BEEF_RESPONSE_TEMPLATES;
  const templates = templatePool[tone] || templatePool.snarky;
  const template = templates[Math.floor(Math.random() * templates.length)] || templatePool.snarky[0];
  return template(primaryArtist, rivalArtist, trackTitle);
}

async function getSelectedNpcAccountIds(count: number, context?: XpressAttentionContext): Promise<SelectedNpcAccount[]> {
  const supabase = supabaseAdmin;
  const eligible = NPC_ACCOUNTS.filter((account) => isEligibleAccount(account, context));
  const candidatePool = eligible.length > 0 ? eligible : NPC_ACCOUNTS.filter((account) => account.attention_tier !== 'marquee');
  const marquee = shuffleArray(candidatePool.filter((account) => account.attention_tier === 'marquee')).slice(0, 1);
  const supporting = shuffleArray(candidatePool.filter((account) => account.attention_tier !== 'marquee'));
  const selected = [...marquee, ...supporting].slice(0, count);
  const selectedIds: SelectedNpcAccount[] = [];

  for (const account of selected) {
    const { data: mediaPlatform } = await supabase
      .from('media_platforms')
      .select('id, handle, name, pfp_url')
      .eq('handle', account.handle)
      .single();

    if (mediaPlatform?.id) {
      selectedIds.push({
        media_platform_id: mediaPlatform.id,
        handle: mediaPlatform.handle,
        display_name: mediaPlatform.name,
        platform_pfp: mediaPlatform.pfp_url || account.pfp_url,
        tone_families: account.tone_families,
        attention_tier: account.attention_tier,
      });
    }
  }

  return selectedIds;
}

/**
 * Ensure NPC media accounts exist in the database
 */
async function ensureNpcAccounts() {
  const supabase = supabaseAdmin;
  
  for (const account of NPC_ACCOUNTS) {
    const { data: existing } = await supabase
      .from('media_platforms')
      .select('id')
      .eq('handle', account.handle)
      .maybeSingle();
    
    if (!existing) {
      await supabase.from('media_platforms').insert({
        name: account.display_name,
        handle: account.handle,
        description: account.bio,
        pfp_url: account.pfp_url,
        verified: account.verified,
        reporting_style: account.reporting_style,
        activity_level: account.activity_level,
        relevance_score: account.relevance_score,
        follower_count: Math.floor(100000 + Math.random() * 900000),
        metadata: {
          is_npc: true,
          generated_by: 'npc_xpress_module',
          tone_families: account.tone_families,
          attention_tier: account.attention_tier,
        },
      });
    } else {
      await supabase
        .from('media_platforms')
        .update({
          name: account.display_name,
          description: account.bio,
          pfp_url: account.pfp_url,
          verified: account.verified,
          reporting_style: account.reporting_style,
          activity_level: account.activity_level,
          relevance_score: account.relevance_score,
          metadata: {
            is_npc: true,
            generated_by: 'npc_xpress_module',
            tone_families: account.tone_families,
            attention_tier: account.attention_tier,
          },
        })
        .eq('handle', account.handle);
    }
  }
}

/**
 * Post beef-related content from NPC accounts
 */
export async function postBeefStartedToXpress(
  aggressorName: string,
  targetName: string,
  trackTitle: string,
  globalTurnId: number,
  context?: XpressAttentionContext,
) {
  // Ensure accounts exist
  await ensureNpcAccounts();

  const numPosts = determinePostCount(context);
  const selectedAccounts = await getSelectedNpcAccountIds(numPosts, context);
  const posts: any[] = [];
  const usedTones = new Set<ToneFamily>();

  for (const selectedAccount of selectedAccounts) {
    const toneFamily = pickToneForAccount(selectedAccount, usedTones);
    usedTones.add(toneFamily);
    const content = buildBeefPostContent('beef_started', toneFamily, aggressorName, targetName, trackTitle);

    posts.push({
      source_type: 'media_platform',
      media_platform_id: selectedAccount.media_platform_id,
      artist_id: null,
      platform: 'xpress',
      post_type: 'text',
      title: content.substring(0, 60),
      caption: content,
      likes: Math.floor(500 + Math.random() * 4500),
      shares: Math.floor(100 + Math.random() * 900),
      comments: Math.floor(50 + Math.random() * 450),
      views: Math.floor(5000 + Math.random() * 45000),
      status: 'published',
      is_ai_generated: true,
      event_type: 'beef_started',
      metadata: {
        event_type: 'beef_started',
        turn_id: globalTurnId,
        generated_by: 'npc_xpress_module',
        is_npc: true,
        media_outlet_name: selectedAccount.display_name,
        media_outlet_handle: selectedAccount.handle,
        npc_username: selectedAccount.display_name,
        npc_handle: selectedAccount.handle,
        platform_pfp: selectedAccount.platform_pfp,
        tone_family: toneFamily,
        attention_tier: selectedAccount.attention_tier,
        epicenter_city_id: context?.epicenterCityId || null,
        epicenter_city_name: context?.epicenterCityName || null,
      },
    });
  }

  return posts;
}

/**
 * Post beef response content from NPC accounts
 */
export async function postBeefResponseToXpress(
  responderName: string,
  aggressorName: string,
  trackTitle: string,
  globalTurnId: number,
  context?: XpressAttentionContext,
) {
  // Ensure accounts exist
  await ensureNpcAccounts();

  const numPosts = determinePostCount(context);
  const selectedAccounts = await getSelectedNpcAccountIds(numPosts, context);
  const posts: any[] = [];
  const usedTones = new Set<ToneFamily>();

  for (const selectedAccount of selectedAccounts) {
    const toneFamily = pickToneForAccount(selectedAccount, usedTones);
    usedTones.add(toneFamily);
    const content = buildBeefPostContent('beef_response', toneFamily, responderName, aggressorName, trackTitle);

    posts.push({
      source_type: 'media_platform',
      media_platform_id: selectedAccount.media_platform_id,
      artist_id: null,
      platform: 'xpress',
      post_type: 'text',
      title: content.substring(0, 60),
      caption: content,
      likes: Math.floor(800 + Math.random() * 7200),
      shares: Math.floor(200 + Math.random() * 1800),
      comments: Math.floor(100 + Math.random() * 900),
      views: Math.floor(10000 + Math.random() * 90000),
      status: 'published',
      is_ai_generated: true,
      event_type: 'beef_response',
      metadata: {
        event_type: 'beef_response',
        turn_id: globalTurnId,
        generated_by: 'npc_xpress_module',
        is_npc: true,
        media_outlet_name: selectedAccount.display_name,
        media_outlet_handle: selectedAccount.handle,
        npc_username: selectedAccount.display_name,
        npc_handle: selectedAccount.handle,
        platform_pfp: selectedAccount.platform_pfp,
        tone_family: toneFamily,
        attention_tier: selectedAccount.attention_tier,
        epicenter_city_id: context?.epicenterCityId || null,
        epicenter_city_name: context?.epicenterCityName || null,
      },
    });
  }

  return posts;
}
