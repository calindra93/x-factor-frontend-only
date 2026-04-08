/**
 * AMPLIFI FESTIVAL SYSTEM — Setlist Scoring Module (Phase 3)
 *
 * Scores a player's setlist based on:
 *   - Era alignment (25%)    — songs matching current era aesthetic
 *   - Quality/skill (30%)    — song quality field
 *   - Stream momentum (25%)  — log-normalised lifetime streams
 *   - Set length (20%)       — song count vs lane's required set minutes
 *
 * Unreleased track modifiers:
 *   1–2 unreleased songs → seeded RNG: +15% reward OR -10% crowd (risky)
 *   3+ unreleased songs  → always -10% crowd (crowd doesn't know the songs)
 *
 * PURE FUNCTION — no DB writes. Follows staging pattern.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SetlistSongEntry {
  songId: string;
  title: string;
  order: number;
  // Enriched from songs table before scoring
  quality?: number;           // 0–100
  lifetime_streams?: number;
  era_id?: string | null;
  lifecycle_state?: string;   // 'Scheduled' = unreleased
  final_outcome_class?: string | null; // Plan 016 — preferred terminal outcome label
  genre?: string;
}

export interface SetlistScoreResult {
  totalScore: number;           // 0–100, replaces flat setlistQuality
  // Individual component scores (0–100 each)
  eraAlignmentScore: number;
  qualityScore: number;
  streamScore: number;
  lengthScore: number;
  // Modifier applied to final crowd_heat calculation
  unreleasedRiskMod: number;    // -0.10 or +0.15 or 0
  unreleasedRollResult: 'none' | 'boom' | 'flop';
  // Bonus applied directly to crowd_heat formula
  topSongHeatBonus: number;     // flat crowd_heat bonus (0–20)
  songCount: number;
  unreleasedCount: number;
  breakdown: Record<string, number>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHT_ERA     = 0.25;
const WEIGHT_QUALITY = 0.30;
const WEIGHT_STREAMS = 0.25;
const WEIGHT_LENGTH  = 0.20;

const MAX_SONGS_FOR_LENGTH = 12;

// Contribution to crowd_heat bonus per high-stream song (streams ≥ 80 normalised score)
const TOP_SONG_HEAT_BONUS_PER_SONG = 5;
const MAX_TOP_SONG_HEAT_BONUS = 20;

// Unreleased thresholds
const UNRELEASED_LIFECYCLE_STATES = ['Scheduled', 'in_studio', 'mastered'];

// Log10 normalisation: a song with ~100M streams → log10(100_000_001) ≈ 8 → score ≈ 100
const STREAM_LOG_DIVISOR = 8;

// ── Seeded RNG (same pattern as festivalGlobalModule.ts) ──────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score a setlist for a given artist + festival instance.
 *
 * @param songs           Full song entries with quality, streams, era_id, lifecycle_state
 * @param laneSetMin      Set-length requirement for this lane (from LANE_SET_MIN)
 * @param currentEraId    Player's current era ID (null = no active era)
 * @param artistId        Used to seed the unreleased RNG (deterministic per artist+instance)
 * @param instanceId      Used alongside artistId for the unreleased roll seed
 */
export function scoreSetlist(
  songs: SetlistSongEntry[],
  laneSetMin: number,
  currentEraId: string | null,
  artistId: string,
  instanceId: string,
): SetlistScoreResult {
  const songCount = songs.length;

  // S-2 FIX: Empty setlist returns 0 score, not 40.
  // A player who submits no songs gets no points.
  if (songCount === 0) {
    return {
      totalScore: 0,
      eraAlignmentScore: 0,
      qualityScore: 0,
      streamScore: 0,
      lengthScore: 0,
      unreleasedRiskMod: 0,
      unreleasedRollResult: 'none',
      topSongHeatBonus: 0,
      songCount: 0,
      unreleasedCount: 0,
      breakdown: { era: 0, quality: 0, streams: 0, length: 0 },
    };
  }

  // ── Era alignment ──────────────────────────────────────────────────────────
  // Each song scores 100 if it matches current era, 40 if not (still worth playing)
  const eraScores = songs.map((s) =>
    currentEraId && s.era_id && s.era_id === currentEraId ? 100 : 40
  );
  const eraAlignmentScore = eraScores.reduce((sum, v) => sum + v, 0) / eraScores.length;

  // ── Quality ───────────────────────────────────────────────────────────────
  const qualityScore = songs.reduce((sum, s) => sum + (s.quality ?? 50), 0) / songCount;

  // ── Stream momentum (log-normalised) ─────────────────────────────────────
  // Outcome-aware: Legacy/CultClassic/DeepCut songs get setlist scoring bonuses
  const OUTCOME_SETLIST_BONUS: Record<string, number> = {
    // Original outcome labels
    Legacy: 15,       // Crowd-pleasers — fans love hearing classics
    CultClassic: 12,  // Diehards go wild for these
    DeepCut: 10,      // Authenticity bonus — shows range
    SleeperHit: 8,    // Slow burn recognition
    Flop: -5,         // Crowd might not know it
    Archived: 0,
    // Expanded outcome labels
    Legendary: 22,    // All-time greats — entire crowd knows every word
    SmashHit: 20,     // Massive chart hit — peak crowd energy
    Classic: 18,      // Timeless — always lands well
    Hit: 14,          // Solid performer — reliable set anchor
    Solid: 6,         // Reliable mid-tier — filler that works
    StrongStart: 8,   // Debuted strong — still remembered
    OneHitWonder: 12, // The one song everyone knows — undeniable moment
  };

  const streamScores = songs.map((s) => {
    const streams = Math.max(0, s.lifetime_streams ?? 0);
    const baseScore = Math.min(100, (Math.log10(streams + 1) / STREAM_LOG_DIVISOR) * 100);
    // Apply outcome bonus using the terminal outcome label (Plan 016 dual-read).
    // final_outcome_class is a string like 'Legacy', 'SmashHit' — matches OUTCOME_SETLIST_BONUS keys.
    // performance_class is numeric (0-1 scalar) and was previously being looked up against a string map,
    // causing every lookup to return 0. lifecycle_state is the legacy fallback.
    const outcomeState = s.final_outcome_class ?? s.lifecycle_state ?? '';
    const outcomeBonus = OUTCOME_SETLIST_BONUS[outcomeState] ?? 0;
    return Math.min(100, Math.max(0, baseScore + outcomeBonus));
  });
  const streamScore = streamScores.reduce((sum, v) => sum + v, 0) / streamScores.length;

  // ── Set length ────────────────────────────────────────────────────────────
  // Each song = ~4 minutes. length score = (songs / laneSetMin_in_songs) capped at 100
  const songsNeeded = Math.ceil(laneSetMin / 4);
  const lengthScore = Math.min(100, (songCount / songsNeeded) * 100);

  // ── Composite total ───────────────────────────────────────────────────────
  const totalScore = Math.round(
    eraAlignmentScore * WEIGHT_ERA
    + qualityScore    * WEIGHT_QUALITY
    + streamScore     * WEIGHT_STREAMS
    + lengthScore     * WEIGHT_LENGTH
  );

  // ── Top song bonus ────────────────────────────────────────────────────────
  const topSongs = streamScores.filter((s) => s >= 80).length;
  const topSongHeatBonus = Math.min(MAX_TOP_SONG_HEAT_BONUS, topSongs * TOP_SONG_HEAT_BONUS_PER_SONG);

  // ── Unreleased risk/reward ────────────────────────────────────────────────
  const unreleasedCount = songs.filter((s) =>
    UNRELEASED_LIFECYCLE_STATES.includes(s.lifecycle_state ?? '')
  ).length;

  let unreleasedRiskMod = 0;
  let unreleasedRollResult: 'none' | 'boom' | 'flop' = 'none';

  if (unreleasedCount >= 3) {
    unreleasedRiskMod = -0.10;
    unreleasedRollResult = 'flop';
  } else if (unreleasedCount >= 1) {
    // Seeded RNG — same result each time for same artist+instance combination
    const seed = hashStr(`unreleased:${artistId}:${instanceId}`);
    const roll = mulberry32(seed);
    if (roll < 0.5) {
      unreleasedRiskMod = +0.15;
      unreleasedRollResult = 'boom';
    } else {
      unreleasedRiskMod = -0.10;
      unreleasedRollResult = 'flop';
    }
  }

  return {
    totalScore: Math.max(0, Math.min(100, totalScore)),
    eraAlignmentScore: Math.round(eraAlignmentScore),
    qualityScore: Math.round(qualityScore),
    streamScore: Math.round(streamScore),
    lengthScore: Math.round(lengthScore),
    unreleasedRiskMod,
    unreleasedRollResult,
    topSongHeatBonus,
    songCount,
    unreleasedCount,
    breakdown: {
      era: Math.round(eraAlignmentScore),
      quality: Math.round(qualityScore),
      streams: Math.round(streamScore),
      length: Math.round(lengthScore),
    },
  };
}

/**
 * Enrich song entries with DB data.
 * Fetches quality, era_id, genre, lifetime_streams, and release outcome classification for song IDs in the setlist.
 * Songs and releases are queried separately (songs has two FKs to releases: release_id and
 * single_release_id — PostgREST embed is not safe per project invariant #11).
 *
 * S-1 FIX: Now fetches lifetime_streams from releases table (was hardcoded to 0).
 * S-4 FIX: Filters by artist_id to prevent players from scoring with other artists' songs.
 *
 * @param supabase Supabase client
 * @param songs Array of { songId, title, order } from setlist
 * @param artistId The artist's ID — only songs belonging to this artist will be included
 */
export async function enrichSetlistSongs(
  supabase: any,
  songs: Array<{ songId: string; title: string; order: number }>,
  artistId: string,
): Promise<SetlistSongEntry[]> {
  if (!songs?.length) return [];
  if (!artistId) return []; // S-4: No artist = no valid songs

  const songIds = songs.map((s) => s.songId).filter(Boolean);
  if (!songIds.length) return songs.map((s) => ({ ...s }));

  // S-4 FIX: Added .eq('artist_id', artistId) to prevent cross-artist cheating
  const { data: songData } = await supabase
    .from('songs')
    .select('id, quality, era_id, genre, release_id')
    .in('id', songIds)
    .eq('artist_id', artistId);

  const songMap = new Map((songData || []).map((s: any) => [s.id, s]));

  // Batch-fetch release outcome data (Plan 016 dual-read).
  // Separate query required — songs has both release_id and single_release_id FKs to releases.
  const releaseIds = [...new Set(
    (songData || []).map((s: any) => s.release_id).filter(Boolean),
  )];

  let releaseMap = new Map<string, { lifecycle_state: string; final_outcome_class: string | null; lifetime_streams: number }>();
  if (releaseIds.length > 0) {
    const { data: releaseData } = await supabase
      .from('releases')
      .select('id, lifecycle_state, final_outcome_class, lifetime_streams')
      .in('id', releaseIds);
    releaseMap = new Map((releaseData || []).map((r: any) => [r.id, r]));
  }

  // S-4: Filter out songs that weren't found (wrong artist or invalid IDs)
  // Only include songs that exist in songMap (i.e., belong to the artist)
  return songs
    .filter((s) => songMap.has(s.songId))
    .map((s) => {
      const db: any = songMap.get(s.songId) || null;
      const rel = db?.release_id ? releaseMap.get(db.release_id) : null;
      return {
        ...s,
        quality: db?.quality ?? 50,
        // S-1 FIX: Use actual lifetime_streams from release, not hardcoded 0
        lifetime_streams: rel?.lifetime_streams ?? 0,
        era_id: db?.era_id ?? null,
        lifecycle_state: rel?.lifecycle_state ?? 'Released',
        final_outcome_class: rel?.final_outcome_class ?? null,
        genre: db?.genre ?? '',
      };
    });
}
