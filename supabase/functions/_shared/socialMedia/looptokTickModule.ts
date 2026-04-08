/**
 * LOOPTOK TICK MODULE (runs inside socialMediaModule each turn)
 * Handles:
 *  A) Algorithm state evaluation (every 3 turns)
 *  B) Sound metrics NPC-driven growth
 *  C) Challenge progress + awards
 *  D) Content pillar consistency tracking
 *  E) LoopTok-specific revenue trickle
 *
 * All outputs are stageOnly deltas — no direct writes.
 * Deterministic per (artistId, globalTurnId) via seeded RNG.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { isLoopTokChallengeActive } from './looptokChallengeWindow.ts';

function N(v: unknown): number { return Number(v) || 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** Seeded deterministic RNG from brandDealsMath pattern */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── Algorithm state thresholds ────────────────────────────────────────────
const ALGO_EVAL_CADENCE = 3; // evaluate every 3 turns
const ALGO_STATES = {
  favorable:  { mult: 1.15, label: 'Favorable' },
  neutral:    { mult: 1.00, label: 'Neutral' },
  suppressed: { mult: 0.75, label: 'Suppressed' },
} as const;

// ─── Content pillar definitions ────────────────────────────────────────────
export const LOOPTOK_PILLARS = [
  'dance_viral',      // dance_challenge, lip_sync
  'music_showcase',   // snippet, original_sound, freestyle
  'creative_content', // skit, storytime, get_ready
  'trending_reactor', // trend_reaction, announcement
  'collab_king',      // duet
  'behind_the_scenes' // behind_scenes
] as const;

const CONCEPT_TO_PILLAR: Record<string, string> = {
  dance_challenge: 'dance_viral',
  lip_sync: 'dance_viral',
  snippet: 'music_showcase',
  original_sound: 'music_showcase',
  freestyle: 'music_showcase',
  skit: 'creative_content',
  storytime: 'creative_content',
  get_ready: 'creative_content',
  trend_reaction: 'trending_reactor',
  announcement: 'trending_reactor',
  duet: 'collab_king',
  behind_scenes: 'behind_the_scenes',
};

// ─── Compatibility score ───────────────────────────────────────────────────
export function computeCompatibility(
  artistA: { genre?: string; region?: string },
  artistB: { genre?: string; region?: string },
  fanProfileA: { overall_sentiment?: number } | null,
  fanProfileB: { overall_sentiment?: number } | null,
  globalTurnId: number,
  priorCollabCount: number = 0,
): { score: number; multiplier: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50; // base

  // Genre similarity (+0-20)
  if (artistA.genre && artistB.genre) {
    if (artistA.genre === artistB.genre) {
      score += 20;
      reasons.push('Same genre');
    } else {
      score += 5;
      reasons.push('Different genres (cross-pollination)');
    }
  }

  // Region overlap (+0-10)
  if (artistA.region && artistB.region && artistA.region === artistB.region) {
    score += 10;
    reasons.push('Same region');
  }

  // Sentiment alignment (+0-5)
  const sentA = N(fanProfileA?.overall_sentiment ?? 50);
  const sentB = N(fanProfileB?.overall_sentiment ?? 50);
  const sentDiff = Math.abs(sentA - sentB);
  if (sentDiff < 15) {
    score += 5;
    reasons.push('Aligned brand sentiment');
  }

  // Prior collabs bonus (+0-10, diminishing)
  if (priorCollabCount > 0) {
    const historyBonus = Math.min(10, priorCollabCount * 4);
    score += historyBonus;
    reasons.push(`${priorCollabCount} prior collab(s)`);
  }

  score = clamp(Math.round(score), 0, 100);
  const multiplier = clamp(1.00 + (score / 100) * 0.35, 1.00, 1.35);

  return { score, multiplier: Math.round(multiplier * 100) / 100, reasons };
}

// ─── NPC compatibility (simplified) ────────────────────────────────────────
export function computeNpcCompatibility(
  artist: { genre?: string },
  npcStyle: string,
  seed: number,
): { score: number; multiplier: number } {
  const base = 40 + Math.floor(seededRandom(seed) * 40); // 40-80
  const genreBonus = (artist.genre === 'Hip-Hop' && npcStyle === 'Rapper') ? 15
    : (artist.genre === 'R&B' && npcStyle === 'Singer-Songwriter') ? 12
    : (artist.genre === 'Electronic' && npcStyle === 'DJ/Remix') ? 12
    : 0;
  const score = clamp(base + genreBonus, 0, 100);
  const multiplier = clamp(1.00 + (score / 100) * 0.35, 1.00, 1.35);
  return { score, multiplier: Math.round(multiplier * 100) / 100 };
}

// ─── Algorithm state evaluator ─────────────────────────────────────────────
interface AlgoEvalInput {
  recentPosts: { engagement_rate: number; is_viral: boolean; views: number }[];
  fandomHeat: number;
  fandomFatigue: number;
  brandSafety: number;
  pillarStreak: number;
  currentState: string;
  seed: number;
}

export function evaluateAlgorithmState(input: AlgoEvalInput): {
  state: 'favorable' | 'neutral' | 'suppressed';
  multiplier: number;
  reason: string;
} {
  const { recentPosts, fandomHeat, fandomFatigue, brandSafety, pillarStreak, currentState, seed } = input;

  let score = 50; // neutral baseline
  const reasons: string[] = [];

  // Engagement quality (+/- 20)
  if (recentPosts.length > 0) {
    const avgEng = recentPosts.reduce((s, p) => s + N(p.engagement_rate), 0) / recentPosts.length;
    const viralCount = recentPosts.filter(p => p.is_viral).length;

    if (avgEng > 5) { score += 15; reasons.push('High engagement'); }
    else if (avgEng < 2) { score -= 15; reasons.push('Low engagement'); }

    if (viralCount >= 2) { score += 10; reasons.push(`${viralCount} viral posts`); }
  } else {
    score -= 10;
    reasons.push('No recent posts');
  }

  // Fandom heat (+/- 10)
  if (fandomHeat > 70) { score += 8; reasons.push('Hot fandom'); }
  else if (fandomHeat < 30) { score -= 8; reasons.push('Cold fandom'); }

  // Fatigue penalty (0 to -15)
  if (fandomFatigue > 50) {
    const penalty = Math.floor((fandomFatigue - 50) / 5);
    score -= clamp(penalty, 0, 15);
    if (penalty > 5) reasons.push('Audience fatigue');
  }

  // Brand safety (-0 to -10)
  if (brandSafety < 40) {
    score -= 10;
    reasons.push('Low brand safety');
  }

  // Pillar consistency (+0 to +8)
  if (pillarStreak >= 3) {
    score += Math.min(8, pillarStreak * 2);
    reasons.push(`Pillar streak ×${pillarStreak}`);
  }

  // Small random jitter for variety (±3)
  score += Math.floor(seededRandom(seed) * 7) - 3;

  score = clamp(score, 0, 100);

  let state: 'favorable' | 'neutral' | 'suppressed';
  if (score >= 65) state = 'favorable';
  else if (score >= 35) state = 'neutral';
  else state = 'suppressed';

  return {
    state,
    multiplier: ALGO_STATES[state].mult,
    reason: reasons.slice(0, 3).join('; ') || 'Standard evaluation',
  };
}

// ─── Sound metrics NPC growth ──────────────────────────────────────────────
const CANONICAL_SOUNDS = [
  { id: 's1_beat_drop_808',    baseGrowth: 15, viralityWeight: 1.2 },
  { id: 's2_sunset_vibes',     baseGrowth: 8,  viralityWeight: 0.9 },
  { id: 's3_glitch_step',      baseGrowth: 20, viralityWeight: 1.4 },
  { id: 's4_acoustic_morning', baseGrowth: 5,  viralityWeight: 0.7 },
  { id: 's5_trap_symphony',    baseGrowth: -5, viralityWeight: 0.5 },
  { id: 's6_afro_pulse',       baseGrowth: 18, viralityWeight: 1.3 },
  { id: 's7_lofi_dreams',      baseGrowth: 3,  viralityWeight: 0.8 },
  { id: 's8_reggaeton_fire',   baseGrowth: 10, viralityWeight: 1.0 },
];

export function computeSoundGrowth(
  prevUses: number,
  baseGrowth: number,
  viralityWeight: number,
  challengeLinkage: boolean,
  seed: number,
): { newUses: number; newTrend: string } {
  const variance = 0.7 + seededRandom(seed) * 0.6;
  const challengeBoost = challengeLinkage ? 1.5 : 1.0;
  const growth = Math.floor(baseGrowth * (1 + prevUses / 5000) * viralityWeight * challengeBoost * variance);
  const newUses = Math.max(0, prevUses + growth);

  // Derive trend state from growth rate
  const growthRate = prevUses > 0 ? growth / prevUses : (growth > 0 ? 1 : 0);
  let newTrend: string;
  if (growthRate > 0.15) newTrend = 'rising';
  else if (growthRate > 0.05) newTrend = 'peak';
  else if (growthRate > -0.02) newTrend = 'stable';
  else if (growthRate > -0.1) newTrend = 'declining';
  else newTrend = 'dead';

  return { newUses, newTrend };
}

// ─── Challenge progress evaluator ──────────────────────────────────────────
export function evaluateChallengeProgress(
  challenge: { concept_required?: string; sound_required?: string; difficulty: string },
  postsMade: number,
  engagementEarned: number,
): { progressScore: number; isComplete: boolean } {
  const thresholds: Record<string, { posts: number; engagement: number }> = {
    easy:   { posts: 1, engagement: 500 },
    medium: { posts: 2, engagement: 2000 },
    hard:   { posts: 3, engagement: 5000 },
  };
  const t = thresholds[challenge.difficulty] || thresholds.medium;
  const postProgress = Math.min(1, postsMade / t.posts);
  const engProgress = Math.min(1, engagementEarned / t.engagement);
  const progressScore = Math.round((postProgress * 60 + engProgress * 40) * 100) / 100;
  return { progressScore, isComplete: progressScore >= 100 };
}

export function determineChallengeAwards(
  participants: { artist_id: string; progress_score: number }[],
  maxWinners: number,
  seed: number,
): { artist_id: string; award_level: 'gold' | 'silver' | 'bronze' }[] {
  // Sort by progress_score descending, break ties with seeded random
  const sorted = [...participants]
    .filter(p => p.progress_score >= 50) // min threshold to qualify
    .sort((a, b) => {
      if (b.progress_score !== a.progress_score) return b.progress_score - a.progress_score;
      return seededRandom(seed + a.artist_id.charCodeAt(0)) - seededRandom(seed + b.artist_id.charCodeAt(0));
    })
    .slice(0, maxWinners);

  return sorted.map((p, i) => ({
    artist_id: p.artist_id,
    award_level: i === 0 ? 'gold' as const : i <= 2 ? 'silver' as const : 'bronze' as const,
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN TICK FUNCTION — called from socialMediaModule per player per turn
// ════════════════════════════════════════════════════════════════════════════
interface LoopTokTickContext {
  player: { id: string; genre?: string; region?: string; hype?: number; followers?: number };
  globalTurnId: number;
  fandomModifiers?: { heat?: number; fatigue?: number };
  brandSafety?: number;
  fanProfile?: any;
  algorithmMood?: string;
}

export interface LoopTokTickResult {
  creatorStateUpsert: Record<string, any> | null;
  soundMetricsInserts: Record<string, any>[];
  challengeParticipationUpdates: { id: string; patch: Record<string, any> }[];
  challengeAwards: { artist_id: string; challenge_id: string; award_level: string }[];
  turnEvents: Record<string, any>[];
  notifications: Record<string, any>[];
  reachMultiplier: number;   // combined algo × pillar × challenge for caller
  algoState: string;
  trendingPlayerSoundBoost: number;  // additive streaming income boost (0.0–0.15) when player sound is trending
}

export async function processLoopTokTick(ctx: LoopTokTickContext): Promise<LoopTokTickResult> {
  const { player, globalTurnId, fandomModifiers, brandSafety, fanProfile } = ctx;
  const pid = player.id;
  const supabase = supabaseAdmin;

  const result: LoopTokTickResult = {
    creatorStateUpsert: null,
    soundMetricsInserts: [],
    challengeParticipationUpdates: [],
    challengeAwards: [],
    turnEvents: [],
    notifications: [],
    reachMultiplier: 1.0,
    algoState: 'neutral',
    trendingPlayerSoundBoost: 0,
  };

  // ── Load creator state ──────────────────────────────────────────────────
  const { data: stateRows } = await supabase
    .from('looptok_creator_state')
    .select('*')
    .eq('artist_id', pid)
    .limit(1);
  let creatorState = stateRows?.[0] || null;

  // Bootstrap if missing
  if (!creatorState) {
    creatorState = {
      artist_id: pid,
      algorithm_state: 'neutral',
      algorithm_multiplier: 1.0,
      algorithm_reason: 'New creator',
      last_eval_turn: 0,
      next_eval_turn: globalTurnId + ALGO_EVAL_CADENCE,
      content_pillars: [],
      pillar_streak: 0,
      pillar_bonus: 1.0,
    };
  }

  // ── A) Algorithm state evaluation ───────────────────────────────────────
  if (globalTurnId >= N(creatorState.next_eval_turn)) {
    // Load recent LoopTok posts (last 10)
    const { data: recentPosts } = await supabase
      .from('social_posts')
      .select('engagement_rate, is_viral, views')
      .eq('artist_id', pid)
      .eq('platform', 'looptok')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10);

    const evalResult = evaluateAlgorithmState({
      recentPosts: recentPosts || [],
      fandomHeat: N(fandomModifiers?.heat ?? 50),
      fandomFatigue: N(fandomModifiers?.fatigue ?? 0),
      brandSafety: N(brandSafety ?? 60),
      pillarStreak: N(creatorState.pillar_streak),
      currentState: creatorState.algorithm_state,
      seed: globalTurnId * 1000 + pid.charCodeAt(0),
    });

    creatorState.algorithm_state = evalResult.state;
    creatorState.algorithm_multiplier = evalResult.multiplier;
    creatorState.algorithm_reason = evalResult.reason;
    creatorState.last_eval_turn = globalTurnId;
    creatorState.next_eval_turn = globalTurnId + ALGO_EVAL_CADENCE;

    result.turnEvents.push({
      global_turn_id: globalTurnId,
      player_id: pid,
      module: `looptok_algo:${pid}:${globalTurnId}`,
      event_type: 'LOOPTOK_ALGO_EVAL',
      description: `Algorithm → ${evalResult.state} (${evalResult.reason})`,
      metadata: {
        idempotency_key: `looptok_algo_eval:${pid}:${globalTurnId}`,
        state: evalResult.state,
        multiplier: evalResult.multiplier,
        reason: evalResult.reason,
      },
    });

    // Notify on state change
    if (creatorState.algorithm_state !== (stateRows?.[0]?.algorithm_state || 'neutral')) {
      result.notifications.push({
        player_id: pid,
        type: 'SOCIAL_MEDIA_MILESTONE',
        title: `LoopTok Algorithm: ${ALGO_STATES[evalResult.state].label}`,
        subtitle: evalResult.reason,
        body: `Your LoopTok algorithm state changed to ${ALGO_STATES[evalResult.state].label}. ${evalResult.state === 'favorable' ? 'Your content will reach more FYPs!' : evalResult.state === 'suppressed' ? 'Try switching up your content strategy.' : 'Standard distribution.'}`,
        deep_links: [{ label: 'View LoopTok', route: 'Career', params: { openApp: 'looptok' } }],
        idempotency_key: `looptok_algo_change:${pid}:${globalTurnId}`,
        priority: evalResult.state === 'suppressed' ? 'medium' : 'low',
        is_read: false,
      });
    }
  }

  result.algoState = creatorState.algorithm_state;
  result.reachMultiplier = N(creatorState.algorithm_multiplier) * N(creatorState.pillar_bonus || 1);

  // ── D) Content pillar tracking ──────────────────────────────────────────
  // Check recent posts to see if artist is maintaining pillar consistency
  const { data: pillarPosts } = await supabase
    .from('looptok_posts')
    .select('content_pillar')
    .eq('social_post_id', pid) // This join is tricky — we'll check via social_posts
    .limit(1); // placeholder

  // Simpler: check recent social_posts metadata for concept → pillar mapping
  const { data: recent5 } = await supabase
    .from('social_posts')
    .select('post_type, metadata')
    .eq('artist_id', pid)
    .eq('platform', 'looptok')
    .order('created_at', { ascending: false })
    .limit(5);

  if (recent5 && recent5.length >= 2) {
    const pillarsUsed = recent5
      .map((p: any) => CONCEPT_TO_PILLAR[p.post_type] || CONCEPT_TO_PILLAR[p.metadata?.concept] || null)
      .filter(Boolean);
    const pillarSet = new Set(pillarsUsed);

    // Streak: if 3+ of last 5 posts are in the same pillar set as declared pillars
    const declaredPillars = new Set(creatorState.content_pillars || []);
    const matchCount = pillarsUsed.filter((p: string | null) => declaredPillars.has(p!)).length;

    if (declaredPillars.size > 0 && matchCount >= 3) {
      creatorState.pillar_streak = Math.min(10, N(creatorState.pillar_streak) + 1);
      creatorState.pillar_bonus = clamp(1.0 + creatorState.pillar_streak * 0.02, 1.0, 1.15);
    } else if (declaredPillars.size === 0 && pillarSet.size <= 2) {
      // Auto-detect pillars if not set
      creatorState.content_pillars = Array.from(pillarSet).slice(0, 3);
      creatorState.pillar_streak = 1;
      creatorState.pillar_bonus = 1.02;
    } else {
      creatorState.pillar_streak = Math.max(0, N(creatorState.pillar_streak) - 1);
      creatorState.pillar_bonus = clamp(1.0 + creatorState.pillar_streak * 0.02, 1.0, 1.15);
    }
  }

  // Global algorithm mood modulates LoopTok reach:
  // Drama-heavy moods boost engagement; underground/nostalgic moods depress mainstream platforms
  const LOOPTOK_MOOD_MULT: Record<string, number> = {
    beef_season:  1.08,  // Drama = views on LoopTok
    messy:        1.06,  // Chaotic content performs well
    experimental: 1.04,  // New sounds spread on LoopTok
    mainstream:   1.02,  // Default boost — LoopTok is mainstream
    underground:  0.96,  // Underground culture moves off mainstream apps
    nostalgic:    0.95,  // Nostalgic content is less algorithmically favored
  };
  const moodMult = LOOPTOK_MOOD_MULT[ctx.algorithmMood || 'mainstream'] ?? 1.0;

  // Update combined reach multiplier
  result.reachMultiplier = clamp(
    N(creatorState.algorithm_multiplier) * N(creatorState.pillar_bonus) * moodMult,
    0.5, 1.5
  );

  // ── Upsert creator state ────────────────────────────────────────────────
  result.creatorStateUpsert = {
    artist_id: pid,
    algorithm_state: creatorState.algorithm_state,
    algorithm_multiplier: creatorState.algorithm_multiplier,
    algorithm_reason: creatorState.algorithm_reason,
    last_eval_turn: creatorState.last_eval_turn,
    next_eval_turn: creatorState.next_eval_turn,
    content_pillars: creatorState.content_pillars,
    pillar_streak: creatorState.pillar_streak,
    pillar_bonus: creatorState.pillar_bonus,
    updated_at: new Date().toISOString(),
  };

  // ── C) Challenge progress ──────────────────────────────────────────────
  const { data: activeChallenges } = await supabase
    .from('looptok_challenges')
    .select('*')
    .eq('is_active', true);

  const currentlyActiveChallenges = (activeChallenges || []).filter((challenge: any) =>
    isLoopTokChallengeActive(challenge, globalTurnId)
  );

  if (currentlyActiveChallenges.length > 0) {
    for (const challenge of currentlyActiveChallenges) {
      // Check if artist is participating
      const { data: partRows } = await supabase
        .from('looptok_challenge_participation')
        .select('*')
        .eq('challenge_id', challenge.id)
        .eq('artist_id', pid)
        .limit(1);

      const participation = partRows?.[0];
      if (!participation) continue; // Artist hasn't joined this challenge

      // Count matching posts since join
      let postQuery = supabase
        .from('social_posts')
        .select('id, views, likes, comments, shares', { count: 'exact' })
        .eq('artist_id', pid)
        .eq('platform', 'looptok')
        .eq('status', 'published');

      if (challenge.concept_required) {
        postQuery = postQuery.eq('post_type', challenge.concept_required);
      }

      const { data: matchingPosts, count: matchCount } = await postQuery;
      const totalEng = (matchingPosts || []).reduce(
        (s: number, p: any) => s + N(p.likes) + N(p.comments) + N(p.shares), 0
      );

      const progress = evaluateChallengeProgress(
        challenge,
        matchCount || 0,
        totalEng,
      );

      result.challengeParticipationUpdates.push({
        id: participation.id,
        patch: {
          posts_made: matchCount || 0,
          engagement_earned: totalEng,
          progress_score: progress.progressScore,
          completed_turn: progress.isComplete && !participation.completed_turn ? globalTurnId : participation.completed_turn,
          updated_at: new Date().toISOString(),
        },
      });

      // Check for award on completion
      if (progress.isComplete && !participation.award_level) {
        // Load all participants for ranking
        const { data: allParticipants } = await supabase
          .from('looptok_challenge_participation')
          .select('artist_id, progress_score')
          .eq('challenge_id', challenge.id)
          .order('progress_score', { ascending: false })
          .limit(challenge.max_winners);

        if (allParticipants) {
          const awards = determineChallengeAwards(
            allParticipants,
            challenge.max_winners,
            globalTurnId * 100 + challenge.id.charCodeAt(0),
          );

          const myAward = awards.find(a => a.artist_id === pid);
          if (myAward) {
            result.challengeAwards.push({
              artist_id: pid,
              challenge_id: challenge.id,
              award_level: myAward.award_level,
            });

            // Apply reward effects via notifications + turn events
            const rewardConfig = challenge.reward_config || {};
            result.turnEvents.push({
              global_turn_id: globalTurnId,
              player_id: pid,
              module: `looptok_challenge:${challenge.id}:${pid}:${globalTurnId}`,
              event_type: 'LOOPTOK_CHALLENGE_AWARD',
              description: `Challenge "${challenge.name}" — ${myAward.award_level} award`,
              metadata: {
                idempotency_key: `looptok_challenge_award:${pid}:${challenge.id}:${globalTurnId}`,
                challenge_id: challenge.id,
                award_level: myAward.award_level,
                reward_config: rewardConfig,
              },
            });

            result.notifications.push({
              player_id: pid,
              type: 'ACHIEVEMENT',
              title: `🏆 Challenge Complete: ${challenge.name}`,
              subtitle: `${myAward.award_level.charAt(0).toUpperCase() + myAward.award_level.slice(1)} Award!`,
              body: `You earned a ${myAward.award_level} award in the "${challenge.name}" challenge! ${rewardConfig.heat_bump ? `+${rewardConfig.heat_bump} fan heat. ` : ''}${rewardConfig.loyalty_bump ? `+${rewardConfig.loyalty_bump} loyalty. ` : ''}`,
              deep_links: [{ label: 'View LoopTok', route: 'Career', params: { openApp: 'looptok' } }],
              idempotency_key: `looptok_challenge_complete:${pid}:${challenge.id}:${globalTurnId}`,
              priority: 'medium',
              is_read: false,
            });
          }
        }
      }
    }
  }

  // ── E) Trending player sound — cross-platform streaming boost ──────────────
  // If any of the player's released sounds are trending on LoopTok this turn,
  // add a small streaming income multiplier applied by socialMediaModule.
  try {
    const { data: playerSoundRows } = await supabase
      .from('looptok_sound_metrics')
      .select('sound_id, trend_state, uses_count')
      .eq('global_turn_id', globalTurnId)
      .eq('is_player_sound', true)
      .in('trend_state', ['rising', 'peak']);

    if (playerSoundRows && playerSoundRows.length > 0) {
      // Each trending player sound contributes +5% streaming boost, capped at +15%
      const rawBoost = playerSoundRows.length * 0.05;
      result.trendingPlayerSoundBoost = Math.min(0.15, rawBoost);

      // Notify once per trend window (idempotency via turn window)
      const trendWindow = Math.floor(globalTurnId / 12);
      for (const soundRow of playerSoundRows.slice(0, 2)) {
        const isPeak = soundRow.trend_state === 'peak';
        result.notifications.push({
          player_id: pid,
          type: 'SOCIAL_MEDIA_MILESTONE',
          title: isPeak ? `🔥 Your Sound is PEAK Trending!` : `📈 Your Sound is Trending on LoopTok`,
          subtitle: `Sound ID: ${soundRow.sound_id}`,
          body: `Your released track is ${isPeak ? 'peak trending' : 'rising'} on LoopTok with ${N(soundRow.uses_count).toLocaleString()} uses. Streaming platforms are seeing a +${Math.round(result.trendingPlayerSoundBoost * 100)}% revenue boost this turn.`,
          deep_links: [{ label: 'Open LoopTok', route: 'Career', params: { openApp: 'looptok' } }],
          idempotency_key: `looptok_trending_sound:${pid}:${soundRow.sound_id}:${trendWindow}`,
          priority: isPeak ? 'high' : 'medium',
          is_read: false,
        });
      }
    }
  } catch (e) {
    // Non-fatal: trending sound detection failure does not block turn
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL SOUND METRICS UPDATE (runs once per turn, not per-player)
// ════════════════════════════════════════════════════════════════════════════
export async function updateSoundMetricsGlobal(globalTurnId: number): Promise<{
  soundMetricsInserts: Record<string, any>[];
  turnEvents: Record<string, any>[];
}> {
  const supabase = supabaseAdmin;
  const inserts: Record<string, any>[] = [];
  const turnEvents: Record<string, any>[] = [];

  // Check if already computed for this turn (idempotency)
  const { count } = await supabase
    .from('looptok_sound_metrics')
    .select('id', { count: 'exact', head: true })
    .eq('global_turn_id', globalTurnId);

  if ((count || 0) > 0) {
    return { soundMetricsInserts: [], turnEvents: [] };
  }

  // Get previous turn's metrics
  const { data: prevMetrics } = await supabase
    .from('looptok_sound_metrics')
    .select('sound_id, uses_count, trend_state')
    .eq('global_turn_id', globalTurnId - 1);

  const prevBySound = new Map((prevMetrics || []).map((m: any) => [m.sound_id, m]));

  // Check if any active challenge links to a sound
  const { data: activeChallenges } = await supabase
    .from('looptok_challenges')
    .select('sound_required')
    .eq('is_active', true)
    .lte('start_turn', globalTurnId)
    .gte('end_turn', globalTurnId);
  const challengeSounds = new Set((activeChallenges || []).map((c: any) => c.sound_required).filter(Boolean));

  for (const sound of CANONICAL_SOUNDS) {
    const prev: any = prevBySound.get(sound.id);
    const prevUses = prev ? N(prev.uses_count) : 50; // default baseline

    const { newUses, newTrend } = computeSoundGrowth(
      prevUses,
      sound.baseGrowth,
      sound.viralityWeight,
      challengeSounds.has(sound.id),
      globalTurnId * 100 + sound.id.charCodeAt(0),
    );

    inserts.push({
      sound_id: sound.id,
      global_turn_id: globalTurnId,
      uses_count: newUses,
      creator_count: Math.floor(newUses * 0.75),
      impressions: newUses * 10000,
      trend_state: newTrend,
    });
  }

  turnEvents.push({
    global_turn_id: globalTurnId,
    player_id: null,
    module: `looptok_sounds:global:${globalTurnId}`,
    event_type: 'LOOPTOK_SOUND_UPDATE',
    description: `Sound metrics updated for ${inserts.length} sounds`,
    metadata: {
      idempotency_key: `looptok_sounds_global:${globalTurnId}`,
      sound_count: inserts.length,
      trending: inserts.filter(i => i.trend_state === 'rising' || i.trend_state === 'peak').map(i => i.sound_id),
    },
  });

  return { soundMetricsInserts: inserts, turnEvents };
}

// ════════════════════════════════════════════════════════════════════════════
// BOOST POST (called from edge function action, not turn tick)
// ════════════════════════════════════════════════════════════════════════════
export async function boostLoopTokPost(
  artistId: string,
  postId: string,
): Promise<{ success: boolean; error?: string; newHype?: number }> {
  const supabase = supabaseAdmin;
  const BOOST_COST = 10;

  // 1. Load profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('hype')
    .eq('id', artistId)
    .single();

  if (!profile) return { success: false, error: 'Profile not found' };
  if (N(profile.hype) < BOOST_COST) {
    return { success: false, error: `Insufficient hype (have ${N(profile.hype)}, need ${BOOST_COST})` };
  }

  // 2. Check if already boosted (idempotent)
  const { data: existingPost } = await supabase
    .from('looptok_posts')
    .select('boost_applied, social_post_id')
    .eq('social_post_id', postId)
    .single();

  if (!existingPost) return { success: false, error: 'LoopTok post not found' };
  if (existingPost.boost_applied) return { success: false, error: 'Post already boosted' };

  // 3. Deduct hype
  const newHype = N(profile.hype) - BOOST_COST;
  await supabase
    .from('profiles')
    .update({ hype: newHype })
    .eq('id', artistId);

  // 4. Mark post as boosted and apply +50% views
  const { data: socialPost } = await supabase
    .from('social_posts')
    .select('views, likes, comments, shares')
    .eq('id', postId)
    .single();

  if (socialPost) {
    const boostViews = Math.floor(N(socialPost.views) * 0.5);
    const boostLikes = Math.floor(N(socialPost.likes) * 0.5);
    const boostComments = Math.floor(N(socialPost.comments) * 0.3);

    await supabase
      .from('social_posts')
      .update({
        views: N(socialPost.views) + boostViews,
        likes: N(socialPost.likes) + boostLikes,
        comments: N(socialPost.comments) + boostComments,
      })
      .eq('id', postId);
  }

  // 5. Mark looptok_posts as boosted
  await supabase
    .from('looptok_posts')
    .update({
      boost_applied: true,
      boost_hype_cost: BOOST_COST,
    })
    .eq('social_post_id', postId);

  // 6. Log event
  const { data: tsRow } = await supabase
    .from('turn_state')
    .select('global_turn_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  await supabase.from('turn_event_log').insert({
    player_id: artistId,
    global_turn_id: N(tsRow?.global_turn_id),
    module: `looptok_boost:${postId}`,
    event_type: 'LOOPTOK_POST_BOOSTED',
    description: 'LoopTok post boosted with hype',
    metadata: {
      idempotency_key: `looptok_boost:${artistId}:${postId}`,
      post_id: postId,
      hype_cost: BOOST_COST,
      new_hype: newHype,
    },
  });

  return { success: true, newHype };
}
