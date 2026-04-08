import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

const STATUS_STYLE = {
  active:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Active' },
  judging:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Judging' },
  completed: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'Ended' },
};

const TYPE_LABEL = {
  platform_weekly: '🎯 Platform',
  artist_created:  '🎤 Artist',
  npc_hosted:      '🏢 Label',
};

function ContestCard({ contest, onEnter, currentArtistId, userSongs }) {
  const [showEnter, setShowEnter] = useState(false);
  const [selectedSong, setSelectedSong] = useState('');
  const [entering, setEntering] = useState(false);
  const style = STATUS_STYLE[contest.status] || STATUS_STYLE.active;
  const turnsLeft = contest.end_turn - (contest.current_turn || 0);
  const myEntry = (contest.entries || []).find(e => e.artist_id === currentArtistId);

  async function handleEnter() {
    if (!selectedSong) return;
    setEntering(true);
    await onEnter(contest.id, selectedSong, contest.original_song_id);
    setEntering(false);
    setShowEnter(false);
  }

  const eligibleSongs = (userSongs || []).filter(s =>
    s.original_song_id === contest.original_song_id &&
    s.is_remix === true &&
    s.release_status === 'released'
  );

  return (
    <div
      className="rounded-xl overflow-hidden transition-all hover:scale-[1.01]"
      style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-white/40">{TYPE_LABEL[contest.contest_type] || '🎵'}</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: style.bg, color: style.color }}
              >
                {style.label}
              </span>
            </div>
            <div className="text-sm font-bold text-white truncate">{contest.title}</div>
            {contest.description && (
              <div className="text-xs text-white/40 mt-0.5 line-clamp-2">{contest.description}</div>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-lg font-bold" style={{ color: '#C9A84C' }}>
              ${(contest.prize_pool || 0).toLocaleString()}
            </div>
            <div className="text-xs text-white/30">prize</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-3">
          <div className="text-xs text-white/40">
            <span className="text-white/60 font-semibold">{(contest.entries || []).length}</span> entries
          </div>
          {contest.status === 'active' && (
            <div className="text-xs text-white/40">
              <span className="text-white/60 font-semibold">{Math.max(0, turnsLeft)}</span> turns left
            </div>
          )}
          {contest.original_song && (
            <div className="text-xs text-white/40 truncate">
              for <span className="text-white/60">{contest.original_song.title}</span>
            </div>
          )}
        </div>

        {/* Score criteria */}
        <div className="flex gap-2 mb-3">
          {Object.entries(contest.judging_criteria || {}).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 text-xs text-white/40">
              <div className="w-1 h-1 rounded-full bg-white/20" />
              <span className="capitalize">{k}</span>
              <span className="text-white/60 font-semibold">{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>

        {/* My entry status or enter button */}
        {myEntry ? (
          <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <span className="text-green-400 text-xs font-semibold">✓ You've entered</span>
            {myEntry.composite_score > 0 && (
              <span className="text-xs text-white/40 ml-auto">Score: {myEntry.composite_score.toFixed(1)}</span>
            )}
          </div>
        ) : contest.status === 'active' ? (
          <div>
            {!showEnter ? (
              <button
                onClick={() => setShowEnter(true)}
                className="w-full py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(201,168,76,0.2)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}
              >
                + Enter Contest
              </button>
            ) : (
              <div className="space-y-2">
                {eligibleSongs.length === 0 ? (
                  <div className="text-xs text-white/40 text-center py-2">
                    No eligible remixes. Remix this song first!
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedSong}
                      onChange={e => setSelectedSong(e.target.value)}
                      className="w-full p-2 rounded-lg text-sm text-white"
                      style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <option value="">Select your remix…</option>
                      {eligibleSongs.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleEnter}
                        disabled={!selectedSong || entering}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                        style={{ background: '#C9A84C', color: '#000' }}
                      >
                        {entering ? 'Entering…' : 'Confirm Entry'}
                      </button>
                      <button
                        onClick={() => setShowEnter(false)}
                        className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white transition-colors"
                        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Winner display */}
        {contest.status === 'completed' && contest.winner_artist && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <span className="text-base">🏆</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold" style={{ color: '#C9A84C' }}>Winner</div>
              <div className="text-xs text-white/60 truncate">{contest.winner_artist?.artist_name || 'Unknown'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RemixContestBrowser({ artistId }) {
  const [contests, setContests] = useState([]);
  const [userSongs, setUserSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ songId: '', prizePool: 500, durationTurns: 14 });
  const [releasedSongs, setReleasedSongs] = useState([]);


  useEffect(() => {
    if (!artistId) return;
    fetchData();
  }, [artistId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [turnRes, contestsRes, songsRes, releasedRes] = await Promise.all([
        supabaseClient.from('turn_state').select('global_turn_id, last_completed_turn_id').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabaseClient
          .from('remix_contests')
          .select('id, title, description, contest_type, prize_pool, start_turn, end_turn, status, judging_criteria, allow_artist_choice, original_song_id, winner_artist_id')
          .not('status', 'eq', 'cancelled')
          .order('start_turn', { ascending: false })
          .limit(30),
        supabaseClient
          .from('songs')
          .select('id, title, original_song_id, is_remix, release_status')
          .eq('artist_id', artistId),
        supabaseClient
          .from('songs')
          .select('id, title')
          .eq('artist_id', artistId)
          .eq('release_status', 'released')
          .eq('open_for_remix', true)
          .order('created_at', { ascending: false }),
      ]);

      const contests = contestsRes.data || [];
      const originalSongIds = [...new Set(contests.map(c => c.original_song_id).filter(Boolean))];
      const winnerArtistIds = [...new Set(contests.map(c => c.winner_artist_id).filter(Boolean))];
      const contestIds = contests.map(c => c.id);

      const [{ data: originalSongs }, { data: winnerArtists }, { data: entries }] = await Promise.all([
        originalSongIds.length
          ? supabaseClient
              .from('songs')
              .select('id, title')
              .in('id', originalSongIds)
          : Promise.resolve({ data: [] }),
        winnerArtistIds.length
          ? supabaseClient
              .from('profiles')
              .select('id, artist_name')
              .in('id', winnerArtistIds)
          : Promise.resolve({ data: [] }),
        contestIds.length
          ? supabaseClient
              .from('remix_contest_entries')
              .select('id, contest_id, artist_id, composite_score')
              .in('contest_id', contestIds)
          : Promise.resolve({ data: [] }),
      ]);

      const turn = turnRes.data?.last_completed_turn_id ?? turnRes.data?.global_turn_id ?? 0;
      const songMap = new Map((originalSongs || []).map(song => [song.id, song]));
      const artistMap = new Map((winnerArtists || []).map(artist => [artist.id, artist]));
      const entriesByContestId = new Map();

      for (const entry of entries || []) {
        if (!entriesByContestId.has(entry.contest_id)) {
          entriesByContestId.set(entry.contest_id, []);
        }
        entriesByContestId.get(entry.contest_id).push(entry);
      }

      setContests(contests.map(c => ({
        ...c,
        current_turn: turn,
        original_song: c.original_song_id ? songMap.get(c.original_song_id) || null : null,
        winner_artist: c.winner_artist_id ? artistMap.get(c.winner_artist_id) || null : null,
        entries: entriesByContestId.get(c.id) || [],
      })));
      setUserSongs(songsRes.data || []);
      setReleasedSongs(releasedRes.data || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateContest() {
    if (!createForm.songId || creating) return;
    setCreating(true);
    try {
      const { data: turnData } = await supabaseClient
        .from('turn_state').select('global_turn_id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const currentTurn = turnData?.global_turn_id || 0;
      const song = releasedSongs.find(s => s.id === createForm.songId);

      await supabaseClient.from('remix_contests').insert({
        contest_type: 'artist_created',
        original_song_id: createForm.songId,
        host_artist_id: artistId,
        title: `Remix Battle: ${song?.title || 'My Song'}`,
        description: `Create the best remix of "${song?.title || 'this track'}" to win!`,
        prize_pool: createForm.prizePool,
        start_turn: currentTurn,
        end_turn: currentTurn + createForm.durationTurns,
        judging_criteria: { quality: 0.4, virality: 0.35, originality: 0.25 },
        allow_artist_choice: false,
        status: 'active',
      });

      setShowCreate(false);
      setCreateForm({ songId: '', prizePool: 500, durationTurns: 14 });
      await fetchData();
    } catch (err) {
      console.error('[RemixContestBrowser] create contest error', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleEnter(contestId, remixSongId, _originalSongId) {
    const { data: song } = await supabaseClient
      .from('songs')
      .select('quality, release_id')
      .eq('id', remixSongId)
      .maybeSingle();

    const { data: release } = song?.release_id
      ? await supabaseClient.from('releases').select('lifetime_streams, virality_modifier_bonus_pct, algorithmic_boost').eq('id', song.release_id).maybeSingle()
      : { data: null };

    const qualityScore    = song?.quality || 0;
    const viralityScore   = Math.min(100, (release?.virality_modifier_bonus_pct || 0) + (release?.algorithmic_boost || 1) * 20);
    const originalityScore = Math.floor(Math.random() * 40 + 40);

    await supabaseClient
      .from('remix_contest_entries')
      .insert({
        contest_id: contestId,
        remix_song_id: remixSongId,
        remix_release_id: song?.release_id || null,
        artist_id: artistId,
        streams_earned: release?.lifetime_streams || 0,
        quality_score: qualityScore,
        virality_score: viralityScore,
        originality_score: originalityScore,
      })
      .onConflict('contest_id,remix_song_id')
      .ignore();

    if (song?.release_id) {
      const { data: contest } = await supabaseClient
        .from('remix_contests')
        .select('id')
        .eq('id', contestId)
        .maybeSingle();
      if (contest) {
        await supabaseClient
          .from('releases')
          .update({ is_contest_entry: true, contest_id: contestId })
          .eq('id', song.release_id);
      }
    }

    await fetchData();
  }

  const filtered = contests.filter(c => {
    if (filter === 'active') return c.status === 'active';
    if (filter === 'mine') return (c.entries || []).some(e => e.artist_id === artistId);
    if (filter === 'ended') return c.status === 'completed';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header row with Create Contest button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">Remix Contests</span>
        <button
          onClick={() => setShowCreate(true)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
          style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.25)' }}
        >
          + Create Contest
        </button>
      </div>

      {/* Create Contest Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">Create Remix Contest</h3>
              <button onClick={() => setShowCreate(false)} className="text-white/40 hover:text-white text-lg leading-none">×</button>
            </div>

            {releasedSongs.length === 0 ? (
              <p className="text-white/40 text-xs text-center py-4">
                No songs open for remix yet. Open a released song for remixing first.
              </p>
            ) : (
              <>
                <div>
                  <label className="text-white/40 text-[10px] uppercase tracking-wide block mb-1">Song to remix</label>
                  <select
                    value={createForm.songId}
                    onChange={e => setCreateForm(f => ({ ...f, songId: e.target.value }))}
                    className="w-full p-2 rounded-lg text-sm text-white"
                    style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="">Select a song…</option>
                    {releasedSongs.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/40 text-[10px] uppercase tracking-wide block mb-1">Prize Pool ($)</label>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={createForm.prizePool}
                      onChange={e => setCreateForm(f => ({ ...f, prizePool: parseInt(e.target.value) || 100 }))}
                      className="w-full p-2 rounded-lg text-sm text-white"
                      style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-[10px] uppercase tracking-wide block mb-1">Duration (turns)</label>
                    <input
                      type="number"
                      min={7}
                      max={28}
                      value={createForm.durationTurns}
                      onChange={e => setCreateForm(f => ({ ...f, durationTurns: parseInt(e.target.value) || 14 }))}
                      className="w-full p-2 rounded-lg text-sm text-white"
                      style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateContest}
                  disabled={!createForm.songId || creating}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: '#C9A84C', color: '#000' }}
                >
                  {creating ? 'Creating…' : `Create Contest ($${createForm.prizePool} prize)`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#17171F' }}>
        {[
          { id: 'active', label: '🔥 Active' },
          { id: 'mine', label: '🎤 My Entries' },
          { id: 'ended', label: '✓ Ended' },
          { id: 'all', label: 'All' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: filter === f.id ? 'rgba(201,168,76,0.15)' : 'transparent',
              color: filter === f.id ? '#C9A84C' : 'rgba(255,255,255,0.4)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-white/30 text-sm">
          {filter === 'active' ? 'No active contests right now. Check back next turn!' :
           filter === 'mine' ? "You haven't entered any contests yet." :
           'No contests found.'}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(contest => (
          <ContestCard
            key={contest.id}
            contest={contest}
            onEnter={handleEnter}
            currentArtistId={artistId}
            userSongs={userSongs}
          />
        ))}
      </div>
    </div>
  );
}
