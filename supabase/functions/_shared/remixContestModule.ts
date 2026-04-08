/**
 * remixContestModule.ts
 *
 * Global module — runs once per turn (not per player).
 * Responsibilities:
 *   1. Create mood/trend-aware contests for Hot/Trending releases
 *   2. Auto-register new remix releases into active contests
 *   3. Score entries using composite formula (40% streams, 30% quality, 20% virality, 10% originality)
 *   4. Resolve finished contests: pick winners, distribute prizes, notify artists
 *   5. Expire open remix calls past their expiry turn
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

function N(v: any): number { return Number(v) || 0; }

const PLATFORM_CONTEST_DURATION_TURNS = 14; // 2 weeks
const PLATFORM_CONTEST_BASE_PRIZE     = 500; // $500 base prize
const PLATFORM_WEEKLY_CADENCE         = 7;   // create new contest every 7 turns

// Mood-themed contest descriptions and prize multipliers
const MOOD_CONTEST_THEMES: Record<string, { prefix: string; prizeMult: number; criteriaOverride?: Record<string, number> }> = {
  beef_season:  { prefix: '🔥 Diss Remix Battle', prizeMult: 1.5, criteriaOverride: { streams: 0.3, quality: 0.2, virality: 0.35, originality: 0.15 } },
  messy:        { prefix: '💀 Chaos Remix Battle', prizeMult: 1.3, criteriaOverride: { streams: 0.25, quality: 0.2, virality: 0.4, originality: 0.15 } },
  experimental: { prefix: '🧪 Experimental Remix Challenge', prizeMult: 1.2, criteriaOverride: { streams: 0.2, quality: 0.35, virality: 0.15, originality: 0.3 } },
  underground:  { prefix: '🎧 Underground Remix Challenge', prizeMult: 1.1, criteriaOverride: { streams: 0.2, quality: 0.4, virality: 0.1, originality: 0.3 } },
  nostalgic:    { prefix: '✨ Throwback Remix Challenge', prizeMult: 1.0 },
  mainstream:   { prefix: 'Remix Battle', prizeMult: 1.0 },
};

const TREND_CATEGORY_OVERLAYS: Record<string, { label: string; criteriaOverride?: Record<string, number> }> = {
  challenge:  { label: 'Challenge Flip', criteriaOverride: { streams: 0.25, quality: 0.2, virality: 0.4, originality: 0.15 } },
  meme:       { label: 'Meme Flip', criteriaOverride: { streams: 0.25, quality: 0.15, virality: 0.45, originality: 0.15 } },
  sound:      { label: 'Sound Flip', criteriaOverride: { streams: 0.2, quality: 0.35, virality: 0.15, originality: 0.3 } },
  genre_wave: { label: 'Wave Flip', criteriaOverride: { streams: 0.2, quality: 0.35, virality: 0.15, originality: 0.3 } },
  aesthetic:  { label: 'Aesthetic Flip', criteriaOverride: { streams: 0.2, quality: 0.3, virality: 0.2, originality: 0.3 } },
  beef:       { label: 'Response Flip', criteriaOverride: { streams: 0.3, quality: 0.2, virality: 0.35, originality: 0.15 } },
};

/**
 * Extract the lead song UUID from a release tracklist.
 * Tracklist can be:
 *   - flat UUID array: ["abc-123", "def-456"]
 *   - object array: [{song_id: "abc-123"}, ...]
 *   - object with id: [{id: "abc-123"}, ...]
 */
function extractLeadSongId(tracklist: any): string | null {
  if (!Array.isArray(tracklist) || tracklist.length === 0) return null;
  const first = tracklist[0];
  if (typeof first === 'string') return first; // flat UUID array
  if (first?.song_id) return first.song_id;    // object with song_id
  if (first?.id) return first.id;              // object with id
  return null;
}

function pickTrendOverlay(trends: any[], algorithmMood: string): { suffix: string; criteriaOverride?: Record<string, number>; trendName: string | null } {
  const moodPreferredCategories: Record<string, string[]> = {
    beef_season: ['beef', 'meme'],
    messy: ['meme', 'beef', 'challenge'],
    experimental: ['sound', 'genre_wave'],
    underground: ['genre_wave', 'aesthetic'],
    nostalgic: ['sound', 'aesthetic'],
    mainstream: ['challenge', 'meme'],
  };

  const preferred = moodPreferredCategories[algorithmMood] || [];
  const matchingTrend = trends.find((trend: any) => preferred.includes(String(trend.category || '')))
    || trends[0]
    || null;

  if (!matchingTrend) return { suffix: '', trendName: null };

  const overlay = TREND_CATEGORY_OVERLAYS[String(matchingTrend.category || '')] || null;
  const suffix = overlay ? ` · ${overlay.label}` : '';
  return {
    suffix,
    criteriaOverride: overlay?.criteriaOverride,
    trendName: matchingTrend.name || null,
  };
}

async function markSongAndReleaseOpenForRemix(supabase: any, songId: string | null, releaseId: string | null) {
  if (releaseId) {
    await supabase.from('releases').update({ open_for_remix: true }).eq('id', releaseId);
  }
  if (songId) {
    await supabase.from('songs').update({ open_for_remix: true }).eq('id', songId);
  }
}

export async function processRemixContestsForTurn(
  globalTurnId: number,
  supabaseClient: any,
  _ctx: any = {}
): Promise<{ success: boolean; contests_created: number; contests_judged: number; errors: string[] }> {
  const supabase = supabaseClient || supabaseAdmin;
  const errors: string[] = [];
  let contestsCreated = 0;
  let contestsJudged  = 0;

  try {
    // Read current algorithm mood for themed contests
    let algorithmMood = 'mainstream';
    try {
      const { data: ts } = await supabase.from('turn_state').select('algorithm_mood').eq('id', 1).maybeSingle();
      algorithmMood = ts?.algorithm_mood || 'mainstream';
    } catch { /* non-fatal */ }

    let activeTrendPool: any[] = [];
    try {
      const { data: activeTrends } = await supabase
        .from('trends')
        .select('id, name, category, status, heat_score')
        .eq('is_active', true)
        .in('status', ['emerging', 'rising', 'peak'])
        .order('heat_score', { ascending: false })
        .limit(5);
      activeTrendPool = activeTrends || [];
    } catch { /* non-fatal */ }

    // ─── 1. CREATE MOOD-AWARE PLATFORM WEEKLY CONTESTS ─────────────────────
    if (globalTurnId % PLATFORM_WEEKLY_CADENCE === 0) {
      // Pick top 3 Hot/Trending releases as featured songs
      const { data: hotReleases } = await supabase
        .from('releases')
        .select('id, artist_id, genre, project_type, tracklist, release_name, lifetime_streams')
        .in('lifecycle_state', ['Hot', 'Trending'])
        .eq('project_type', 'Single')
        .order('lifetime_streams', { ascending: false })
        .limit(6); // fetch more, filter below

      // Deduplicate: skip releases that already have active/judging contests
      const eligibleReleases: any[] = [];
      for (const release of hotReleases || []) {
        if (eligibleReleases.length >= 3) break;

        const { count: existing } = await supabase
          .from('remix_contests')
          .select('id', { count: 'exact', head: true })
          .eq('original_release_id', release.id)
          .in('status', ['active', 'judging']);

        if ((existing ?? 0) > 0) continue;
        eligibleReleases.push(release);
      }

      const moodTheme = MOOD_CONTEST_THEMES[algorithmMood] || MOOD_CONTEST_THEMES.mainstream;
      const trendOverlay = pickTrendOverlay(activeTrendPool, algorithmMood);

      for (const release of eligibleReleases) {
        // FIX: Tracklist is a flat UUID array, not objects
        const songId = extractLeadSongId(release.tracklist);

        const prizePool = Math.round((PLATFORM_CONTEST_BASE_PRIZE + Math.floor(Math.random() * 500)) * moodTheme.prizeMult);
        const criteria = trendOverlay.criteriaOverride || moodTheme.criteriaOverride || { streams: 0.4, quality: 0.3, virality: 0.2, originality: 0.1 };
        const trendLine = trendOverlay.trendName
          ? ` Inspired by the active ${trendOverlay.trendName} trend.`
          : '';

        const { error: insertErr } = await supabase
          .from('remix_contests')
          .insert({
            contest_type: 'platform_weekly',
            original_song_id: songId,
            original_release_id: release.id,
            host_artist_id: null,
            title: `${moodTheme.prefix}${trendOverlay.suffix}: ${release.release_name || 'Untitled'}`,
            description: `Platform-featured remix contest during ${algorithmMood} era.${trendLine} Best remix wins $${prizePool.toLocaleString()}.`,
            prize_pool: prizePool,
            start_turn: globalTurnId,
            end_turn: globalTurnId + PLATFORM_CONTEST_DURATION_TURNS,
            judging_criteria: criteria,
            allow_artist_choice: false,
            status: 'active',
          });

        if (insertErr) {
          errors.push(`create_contest: ${insertErr.message}`);
        } else {
          contestsCreated++;
          await markSongAndReleaseOpenForRemix(supabase, songId, release.id);
        }
      }
    }

    // ─── 2. AUTO-REGISTER NEW REMIX RELEASES INTO ACTIVE CONTESTS ────────────
    const { data: activeContests } = await supabase
      .from('remix_contests')
      .select('id, original_song_id, original_release_id')
      .eq('status', 'active')
      .lte('start_turn', globalTurnId)
      .gt('end_turn', globalTurnId);

    for (const contest of activeContests || []) {
      // Support matching by either original_song_id or original_release_id
      const songFilter = contest.original_song_id
        ? { original_song_id: contest.original_song_id }
        : null;

      if (!songFilter) {
        // Fallback: try to resolve song from the release tracklist
        if (contest.original_release_id) {
          const { data: rel } = await supabase
            .from('releases').select('tracklist').eq('id', contest.original_release_id).maybeSingle();
          const resolvedSongId = extractLeadSongId(rel?.tracklist);
          if (resolvedSongId) {
            // Backfill the missing original_song_id
            await supabase.from('remix_contests').update({ original_song_id: resolvedSongId }).eq('id', contest.id);
            contest.original_song_id = resolvedSongId;
            await markSongAndReleaseOpenForRemix(supabase, resolvedSongId, contest.original_release_id || null);
          } else {
            continue;
          }
        } else {
          continue;
        }
      }

      // Find remix releases of the original song
      const { data: newRemixes } = await supabase
        .from('songs')
        .select('id, artist_id, quality, release_id, release_status')
        .eq('original_song_id', contest.original_song_id)
        .eq('is_remix', true)
        .eq('release_status', 'released');

      for (const remix of newRemixes || []) {
        if (!remix.release_id) continue;

        // Check if already entered
        const { count: alreadyEntered } = await supabase
          .from('remix_contest_entries')
          .select('id', { count: 'exact', head: true })
          .eq('contest_id', contest.id)
          .eq('remix_song_id', remix.id);

        if ((alreadyEntered ?? 0) > 0) continue;

        // Get release for virality / streams data
        const { data: release } = await supabase
          .from('releases')
          .select('lifetime_streams, algorithmic_boost, virality_modifier_bonus_pct')
          .eq('id', remix.release_id)
          .maybeSingle();

        if (!release) continue;

        const qualityScore   = N(remix.quality);
        const viralityScore  = Math.min(100, N(release.virality_modifier_bonus_pct) + N(release.algorithmic_boost) * 20);
        const originalityScore = Math.floor(Math.random() * 40 + 40); // 40-80 baseline

        await supabase
          .from('remix_contest_entries')
          .upsert({
            contest_id: contest.id,
            remix_song_id: remix.id,
            remix_release_id: remix.release_id,
            artist_id: remix.artist_id,
            streams_earned: N(release.lifetime_streams),
            quality_score: qualityScore,
            virality_score: viralityScore,
            originality_score: originalityScore,
          }, { onConflict: 'contest_id,remix_song_id', ignoreDuplicates: true });

        // Mark release as contest entry
        await supabase
          .from('releases')
          .update({ is_contest_entry: true, contest_id: contest.id })
          .eq('id', remix.release_id);
      }
    }

    // ─── 3. UPDATE SCORES FOR ONGOING ENTRIES ────────────────────────────────
    const activeContestIds = (activeContests || []).map((c: any) => c.id);
    if (activeContestIds.length > 0) {
      const { data: ongoingEntries } = await supabase
        .from('remix_contest_entries')
        .select('id, remix_release_id, streams_earned')
        .in('contest_id', activeContestIds)
        .not('remix_release_id', 'is', null);

      for (const entry of ongoingEntries || []) {
        const { data: rtm } = await supabase
          .from('release_turn_metrics')
          .select('streams_this_turn, lifetime_streams')
          .eq('release_id', entry.remix_release_id)
          .eq('global_turn_id', globalTurnId)
          .maybeSingle();

        if (!rtm) continue;

        await supabase
          .from('remix_contest_entries')
          .update({ streams_earned: N(rtm.lifetime_streams) })
          .eq('id', entry.id);
      }
    }

    // ─── 4. RESOLVE FINISHED CONTESTS ────────────────────────────────────────
    const { data: endedContests } = await supabase
      .from('remix_contests')
      .select(`
        id, title, prize_pool, allow_artist_choice, host_artist_id,
        judging_criteria, original_song_id,
        entries:remix_contest_entries(
          id, artist_id, remix_song_id,
          streams_earned, quality_score, virality_score, originality_score
        )
      `)
      .eq('status', 'active')
      .lte('end_turn', globalTurnId);

    for (const contest of endedContests || []) {
      const entries: any[] = contest.entries || [];

      if (entries.length === 0) {
        await supabase
          .from('remix_contests')
          .update({ status: 'completed' })
          .eq('id', contest.id);
        contestsJudged++;
        continue;
      }

      const criteria = contest.judging_criteria || { streams: 0.4, quality: 0.3, virality: 0.2, originality: 0.1 };

      // Normalise each dimension to 0-100 scale
      const maxStreams = Math.max(1, ...entries.map((e: any) => N(e.streams_earned)));

      const scored = entries.map((entry: any) => {
        const streamNorm = Math.min(100, (N(entry.streams_earned) / maxStreams) * 100);
        const composite =
          streamNorm               * N(criteria.streams)   +
          N(entry.quality_score)   * N(criteria.quality)   +
          N(entry.virality_score)  * N(criteria.virality)  +
          N(entry.originality_score) * N(criteria.originality);

        return { ...entry, composite_score: Math.round(composite * 100) / 100 };
      });

      // Sort descending by composite score
      scored.sort((a: any, b: any) => b.composite_score - a.composite_score);
      const winner = scored[0];

      // Save composite scores
      for (const s of scored) {
        await supabase
          .from('remix_contest_entries')
          .update({ composite_score: s.composite_score })
          .eq('id', s.id);
      }

      // For allow_artist_choice, move to 'judging' and notify host
      if (contest.allow_artist_choice && contest.host_artist_id) {
        await supabase
          .from('remix_contests')
          .update({ status: 'judging' })
          .eq('id', contest.id);

        await supabase
          .from('notifications')
          .upsert({
            player_id: contest.host_artist_id,
            type: 'CONTEST_JUDGING',
            title: '🎧 Remix Contest Ready to Judge',
            subtitle: contest.title,
            body: `Your remix contest has ended. ${scored.length} entries received. Review and select your winner!`,
            priority: 'high',
            is_read: false,
            idempotency_key: `contest_judging_${contest.id}`,
            created_turn_index: globalTurnId,
            metrics: { contest_id: contest.id, entry_count: scored.length },
            deep_links: { page: 'Studio', tab: 'Contests', contest_id: contest.id },
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      } else {
        // Auto-resolve with composite winner
        await supabase
          .from('remix_contests')
          .update({
            status: 'completed',
            winner_song_id: winner.remix_song_id,
            winner_artist_id: winner.artist_id,
          })
          .eq('id', contest.id);

        const { data: winnerProfile } = await supabase
          .from('profiles')
          .select('income')
          .eq('id', winner.artist_id)
          .maybeSingle();
        await supabase
          .from('profiles')
          .update({ income: Math.round(((winnerProfile?.income || 0) + N(contest.prize_pool)) * 100) / 100 })
          .eq('id', winner.artist_id);

        await supabase
          .from('notifications')
          .upsert({
            player_id: winner.artist_id,
            type: 'CONTEST_WINNER',
            title: '🏆 Remix Contest Winner!',
            subtitle: `You won: ${contest.title}`,
            body: `Your remix won the contest with a score of ${winner.composite_score.toFixed(1)}! Prize: $${N(contest.prize_pool).toLocaleString()} added to your account.`,
            priority: 'high',
            is_read: false,
            idempotency_key: `contest_winner_${contest.id}_${winner.artist_id}`,
            created_turn_index: globalTurnId,
            metrics: {
              contest_id: contest.id,
              composite_score: winner.composite_score,
              prize_pool: contest.prize_pool,
            },
            deep_links: { page: 'Studio', tab: 'Contests' },
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

        contestsJudged++;
      }
    }

    // ─── 5. EXPIRE OPEN REMIX CALLS ───────────────────────────────────────────
    await supabase
      .from('remix_open_calls')
      .update({ status: 'expired' })
      .eq('status', 'open')
      .not('expires_turn', 'is', null)
      .lte('expires_turn', globalTurnId);

    return { success: true, contests_created: contestsCreated, contests_judged: contestsJudged, errors };
  } catch (err: any) {
    console.error('[RemixContest] Global error:', err.message);
    return { success: false, contests_created: contestsCreated, contests_judged: contestsJudged, errors: [...errors, err.message] };
  }
}
