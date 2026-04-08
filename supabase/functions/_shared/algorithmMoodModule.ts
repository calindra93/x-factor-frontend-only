/**
 * ALGORITHM MOOD MODULE
 * Computes the global industry vibe once per global turn.
 * Reads fan_wars, controversy_cases, and active trends → returns new mood.
 * Called BEFORE the per-player loop so all modules see a stable mood this turn.
 *
 * Moods:
 *  mainstream       — Normal industry activity. Pop/hip-hop algorithms dominant.
 *  beef_season      — Beefs, diss tracks, fan wars dominate the timeline.
 *  nostalgic        — Old releases, throwback culture, quiet drama cycle.
 *  experimental     — Artists going out of their lane, genre-bending songs pop off.
 *  underground      — Niche genres and scenes rise above the mainstream.
 *  messy            — High controversy, chaotic attention, anything goes viral.
 *  collab_season    — Features, duets, joint projects dominate; cross-genre energy surges.
 *  hype_cycle       — Rollout culture peaks; snippets, teasers, announcements go viral.
 *  viral_spiral     — Short-form chaos; meme_drops and dance_challenges everywhere; trends churn fast.
 *  industry_exposed — Receipts season; label beefs, exposés, fan accountability dominate.
 *  tour_season      — Live music dominant; touring and festival activity surges.
 */

import { getGenreTrait } from './genreTraits.ts';

export type AlgorithmMood =
  | 'mainstream'
  | 'beef_season'
  | 'nostalgic'
  | 'experimental'
  | 'underground'
  | 'messy'
  | 'collab_season'
  | 'hype_cycle'
  | 'viral_spiral'
  | 'industry_exposed'
  | 'tour_season';

export const ALGORITHM_MOODS: AlgorithmMood[] = [
  'mainstream', 'beef_season', 'nostalgic', 'experimental', 'underground', 'messy',
  'collab_season', 'hype_cycle', 'viral_spiral', 'industry_exposed', 'tour_season',
];

export type PlatformSpotlight = 'looptok' | 'instavibe' | 'vidwave';
const SPOTLIGHT_ROTATION: PlatformSpotlight[] = ['looptok', 'instavibe', 'vidwave'];

export interface MoodSignals {
  /** Number of active fan_wars rows */
  activeBeefCount: number;
  /** Sum of public_attention from active fan_wars */
  activeBeefPublicAttention: number;
  /** controversy_cases WHERE phase = 'peak' */
  peakControversyCount: number;
  /** Sum of public_attention across non-resolved controversies */
  totalControversyAttention: number;
  /** Highest heat_score category among rising/peak trends */
  dominantTrendCategory: string | null;
  dominantTrendHeat: number;
  /** Sum of heat_score for genre_wave category trends */
  undergroundTrendHeat: number;
  /** Turns since last beef or peak controversy */
  quietTurns: number;
  /** Current mood (used for inertia calculation) */
  currentMood: AlgorithmMood;
  /** Gap 2: Aggregate player action counts from previous turn */
  actionCounts: {
    dissActions: number;
    experimentalActions: number;
    socialPostActions: number;
    challengeActions: number;
    releaseActions: number;
    /** Drives collab_season: collab requests, duets, opening act invitations */
    collabActions: number;
    /** Drives tour_season: createTour, gig events, festival submissions */
    touringActions: number;
    /** Drives hype_cycle: snippet/teaser/announcement posts */
    snippetActions: number;
  };
  /** GAP-1 Task 3: Active player genres for beef susceptibility weighting */
  playerGenres: string[];
}

/**
 * Pure function — determines the new algorithm_mood from observable signals.
 * No side effects; fully testable.
 */
export function computeAlgorithmMood(signals: MoodSignals): AlgorithmMood {
  const scores: Record<AlgorithmMood, number> = {
    mainstream: 0,
    beef_season: 0,
    nostalgic: 0,
    experimental: 0,
    underground: 0,
    messy: 0,
    collab_season: 0,
    hype_cycle: 0,
    viral_spiral: 0,
    industry_exposed: 0,
    tour_season: 0,
  };

  // --- BEEF SEASON: fan wars + active beefs (weight ~40%) ---
  scores.beef_season += Math.min(10, signals.activeBeefCount * 2);
  scores.beef_season += Math.min(10, signals.activeBeefPublicAttention / 20);

  // --- MESSY: controversies (weight ~40%) ---
  scores.messy += Math.min(10, signals.peakControversyCount * 3);
  scores.messy += Math.min(10, signals.totalControversyAttention / 30);

  // --- NOSTALGIC: absence of drama (weight ~20%) ---
  if (signals.quietTurns > 20) scores.nostalgic += 6;
  else if (signals.quietTurns > 10) scores.nostalgic += 3;

  // --- UNDERGROUND: genre_wave trend heat (weight ~30%) ---
  if (signals.undergroundTrendHeat > 60) scores.underground += 5;
  else if (signals.undergroundTrendHeat > 30) scores.underground += 2.5;

  // --- EXPERIMENTAL: sound/genre_wave trends dominant ---
  if (signals.dominantTrendCategory === 'sound') scores.experimental += 6;
  if (signals.dominantTrendCategory === 'genre_wave') scores.experimental += 3;

  // --- Trend dominance cross-signals (weight ~30%) ---
  if (signals.dominantTrendCategory === 'beef') scores.beef_season += 4;
  if (signals.dominantTrendCategory === 'meme' || signals.dominantTrendCategory === 'challenge') {
    scores.messy += 2;
  }
  if (signals.dominantTrendCategory === 'aesthetic') scores.experimental += 2;
  if (signals.dominantTrendCategory === 'genre_wave') scores.underground += 3;

  // --- GAP-1 Task 3: Beef susceptibility amplifies beef_season from genre composition ---
  // Average beefSusceptibilityFactor across active players; high-susceptibility genres
  // (drill=0.95, rap=0.9, hip_hop=0.85) push beef_season harder.
  if (signals.playerGenres.length > 0) {
    const avgBeefSusc = signals.playerGenres.reduce(
      (sum, g) => sum + getGenreTrait(g).beefSusceptibilityFactor, 0,
    ) / signals.playerGenres.length;
    if (avgBeefSusc > 0.5) {
      scores.beef_season += (avgBeefSusc - 0.5) * 6; // up to +2.7 for all-drill lobbies
    }
  }

  // --- PLAYER ACTIONS: aggregate actions push mood (weight ~35%) ---
  const ac = signals.actionCounts;
  if (ac.dissActions > 0) scores.beef_season += Math.min(8, ac.dissActions * 3);
  if (ac.experimentalActions > 0) scores.experimental += Math.min(6, ac.experimentalActions * 2);
  if (ac.challengeActions > 0) {
    scores.mainstream += Math.min(4, ac.challengeActions);
    scores.messy += Math.min(3, ac.challengeActions * 0.5);
  }
  if (ac.socialPostActions > 5) scores.mainstream += 2;
  if (ac.releaseActions > 3) scores.mainstream += 1;

  // --- COLLAB SEASON: features, duets, joint projects dominate (weight ~35%) ---
  if (ac.collabActions > 0) {
    scores.collab_season += Math.min(8, ac.collabActions * 2.5);
  }
  // High-collab-affinity genre compositions push it harder
  if (signals.playerGenres.length > 0) {
    const avgCollabAffinity = signals.playerGenres.reduce(
      (sum, g) => sum + getGenreTrait(g).collaborationAffinityFactor, 0,
    ) / signals.playerGenres.length;
    if (avgCollabAffinity > 0.7) {
      scores.collab_season += (avgCollabAffinity - 0.7) * 5; // up to +1.5 for all-reggaeton lobbies
    }
  }
  // Aesthetic + sound trends signal cross-genre collab culture
  if (signals.dominantTrendCategory === 'aesthetic') scores.collab_season += 2;
  if (signals.dominantTrendCategory === 'sound') scores.collab_season += 2;

  // --- HYPE CYCLE: rollout energy, snippets, teasers, announcements viral (weight ~35%) ---
  if (ac.snippetActions > 0) {
    scores.hype_cycle += Math.min(7, ac.snippetActions * 2);
  }
  if (ac.releaseActions > 2) {
    scores.hype_cycle += Math.min(5, (ac.releaseActions - 2) * 1.5);
  }
  // Mainstream baseline conditions amplify rollout hype
  if (scores.mainstream > 2) scores.hype_cycle += 2;

  // --- VIRAL SPIRAL: meme_drops and dance_challenges everywhere, trends churn fast ---
  if (ac.challengeActions > 0) {
    scores.viral_spiral += Math.min(6, ac.challengeActions * 2);
  }
  if (signals.dominantTrendCategory === 'meme' || signals.dominantTrendCategory === 'challenge') {
    scores.viral_spiral += 5;
  }
  // Content saturation (very high post volume) is the key signal
  if (ac.socialPostActions > 8) scores.viral_spiral += Math.min(6, (ac.socialPostActions - 8) * 0.5);
  // Messy conditions bleed into viral spiral energy
  if (signals.peakControversyCount > 0) scores.viral_spiral += 2;

  // --- INDUSTRY EXPOSED: receipts, label beefs, fan accountability — PRE-peak drama phase ---
  // Distinct from messy (peak chaos) and beef_season (all-out war) — this is the investigation phase
  const hasNonPeakControversy = signals.totalControversyAttention > 0 && signals.peakControversyCount === 0;
  if (hasNonPeakControversy) {
    scores.industry_exposed += Math.min(8, signals.totalControversyAttention / 20);
  }
  // Active fan wars that haven't fully exploded yet (moderate attention) — only in non-peak state
  if (signals.peakControversyCount === 0 && signals.activeBeefCount > 0 && signals.activeBeefPublicAttention < 100) {
    scores.industry_exposed += Math.min(6, signals.activeBeefCount * 1.5);
  }
  // Beef trend dominant but heat isn't scorching = receipts phase not full war — only in non-peak state
  if (signals.peakControversyCount === 0 && signals.dominantTrendCategory === 'beef' && signals.dominantTrendHeat < 60) {
    scores.industry_exposed += 4;
  }

  // --- TOUR SEASON: live music dominant, touring and festival activity surges ---
  if (ac.touringActions > 0) {
    scores.tour_season += Math.min(8, ac.touringActions * 2);
  }
  // Live-performance-culture genres push it further
  const LIVE_GENRES = ['reggaeton', 'afrobeats', 'amapiano', 'dancehall', 'salsa', 'edm', 'pop'];
  if (signals.playerGenres.length > 0) {
    const liveCount = signals.playerGenres.filter(g => LIVE_GENRES.includes(g)).length;
    if (liveCount > signals.playerGenres.length * 0.4) scores.tour_season += 3;
  }
  // Quiet turns (no drama) = people turning to live music for entertainment
  if (signals.quietTurns > 5) scores.tour_season += Math.min(4, signals.quietTurns * 0.2);

  // --- Inertia: bias current mood to persist (prevents flickering on weak signals) ---
  // No separate mainstream base — all moods compete on signals alone.
  // Current mood gets +4 to represent inertia / switching cost.
  scores[signals.currentMood] += 4;

  // Pick the highest-scoring mood
  let winner: AlgorithmMood = 'mainstream';
  let winnerScore = 0;
  for (const mood of ALGORITHM_MOODS) {
    if (scores[mood] > winnerScore) {
      winnerScore = scores[mood];
      winner = mood;
    }
  }

  // Require winner to score strictly more than currentScore + 1 to shift (prevents flicker)
  const currentScore = scores[signals.currentMood];
  if (winner !== signals.currentMood && winnerScore <= currentScore + 1) {
    return signals.currentMood;
  }
  return winner;
}

/** Deterministic platform spotlight rotation — one platform per 7 turns */
export function computePlatformSpotlight(globalTurnId: number): PlatformSpotlight {
  return SPOTLIGHT_ROTATION[Math.floor(globalTurnId / 7) % SPOTLIGHT_ROTATION.length];
}

/**
 * Reads DB signals, computes new mood, and updates turn_state.
 * Non-fatal: errors are logged but don't crash the turn engine.
 */
export async function processAlgorithmMoodForTurn(
  supabase: any,
  globalTurnId: number,
  currentMood: AlgorithmMood,
): Promise<{ mood: AlgorithmMood; spotlight: PlatformSpotlight }> {
  try {
    // Read quiet_turns_count from turn_state (Gap 1)
    const { data: tsRow } = await supabase
      .from('turn_state')
      .select('quiet_turns_count')
      .eq('id', 1)
      .maybeSingle();
    const prevQuietTurns = Number(tsRow?.quiet_turns_count) || 0;

    const [fanWarsResult, controversiesResult, topTrendResult, ugTrendsResult, actionCountsResult, playerGenresResult] =
      await Promise.all([
        supabase.from('fan_wars').select('public_attention').eq('status', 'active'),
        supabase.from('controversy_cases').select('phase, public_attention').neq('phase', 'resolved'),
        supabase
          .from('trends')
          .select('category, heat_score')
          .eq('is_active', true)
          .in('status', ['rising', 'peak'])
          .order('heat_score', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('trends')
          .select('heat_score')
          .eq('category', 'genre_wave')
          .eq('is_active', true),
        // Gap 2: Aggregate player actions from previous turn's event log
        supabase
          .from('turn_event_log')
          .select('event_type, module')
          .eq('global_turn_id', globalTurnId - 1),
        // GAP-1 Task 3: Fetch active player genres for beef susceptibility weighting
        supabase
          .from('profiles')
          .select('genre')
          .not('genre', 'is', null),
      ]);

    const fanWars = fanWarsResult.data || [];
    const controversies = controversiesResult.data || [];
    const topTrend = topTrendResult.data;
    const ugTrends = ugTrendsResult.data || [];
    const prevTurnEvents = actionCountsResult.data || [];
    const playerGenres: string[] = (playerGenresResult.data || [])
      .map((p: any) => String(p.genre || '')).filter(Boolean);

    // Gap 2: Classify previous turn's events into mood-relevant action buckets
    const actionCounts = {
      dissActions: 0, experimentalActions: 0, socialPostActions: 0,
      challengeActions: 0, releaseActions: 0,
      collabActions: 0, touringActions: 0, snippetActions: 0,
    };
    for (const evt of prevTurnEvents as any[]) {
      const mod = String(evt.module || '').toLowerCase();
      const evtType = String(evt.event_type || '').toLowerCase();
      if (evtType.includes('diss') || mod.includes('fan_war')) actionCounts.dissActions++;
      if (evtType.includes('release') || mod.includes('release')) actionCounts.releaseActions++;
      if (mod.includes('social') || mod.includes('looptok') || mod.includes('instavibe') || mod.includes('vidwave')) actionCounts.socialPostActions++;
      if (evtType.includes('challenge') || mod.includes('challenge')) actionCounts.challengeActions++;
      if (evtType.includes('experimental') || evtType.includes('genre_cross')) actionCounts.experimentalActions++;
      // New buckets for new moods
      if (evtType.includes('collab') || evtType.includes('duet') || evtType.includes('feature') || evtType.includes('opening_act')) actionCounts.collabActions++;
      if (evtType.includes('tour') || evtType.includes('gig') || evtType.includes('festival') || mod.includes('touring')) actionCounts.touringActions++;
      if (evtType.includes('snippet') || evtType.includes('teaser') || evtType.includes('announcement')) actionCounts.snippetActions++;
    }

    // Gap 1: Compute quiet turns — reset to 0 if active beefs/peak controversies exist
    const hasDrama = fanWars.length > 0 || controversies.some((c: any) => c.phase === 'peak');
    const quietTurns = hasDrama ? 0 : prevQuietTurns + 1;

    const signals: MoodSignals = {
      activeBeefCount: fanWars.length,
      activeBeefPublicAttention: fanWars.reduce(
        (s: number, w: any) => s + (Number(w.public_attention) || 0), 0
      ),
      peakControversyCount: controversies.filter((c: any) => c.phase === 'peak').length,
      totalControversyAttention: controversies.reduce(
        (s: number, c: any) => s + (Number(c.public_attention) || 0), 0
      ),
      dominantTrendCategory: topTrend?.category ?? null,
      dominantTrendHeat: Number(topTrend?.heat_score) || 0,
      undergroundTrendHeat: ugTrends.reduce(
        (s: number, t: any) => s + (Number(t.heat_score) || 0), 0
      ),
      quietTurns,
      currentMood,
      actionCounts,
      playerGenres,
    };

    const newMood = computeAlgorithmMood(signals);
    const spotlight = computePlatformSpotlight(globalTurnId);

    // Persist mood + spotlight + quiet_turns_count
    await supabase
      .from('turn_state')
      .update({ algorithm_mood: newMood, platform_spotlight: spotlight, quiet_turns_count: quietTurns })
      .eq('id', 1);

    if (newMood !== currentMood) {
      console.log(`[AlgorithmMood] Shift: ${currentMood} → ${newMood} (turn ${globalTurnId})`);
    } else {
      console.log(`[AlgorithmMood] Stable: ${currentMood} (turn ${globalTurnId})`);
    }

    return { mood: newMood, spotlight };
  } catch (err: any) {
    console.error(`[AlgorithmMood] Error (non-fatal): ${err?.message || err}`);
    return { mood: currentMood, spotlight: computePlatformSpotlight(globalTurnId) };
  }
}
