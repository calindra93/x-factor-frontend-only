import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

const LIFECYCLE_STYLE = {
  Hot:      { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  dot: '#ef4444' },
  Trending: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', dot: '#f97316' },
  Momentum: { color: '#eab308', bg: 'rgba(234,179,8,0.12)',  dot: '#eab308' },
  Stable:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  dot: '#22c55e' },
};

function SongCard({ song, onRemix, onOpenCall, isOwn }) {
  const style = LIFECYCLE_STYLE[song.lifecycle_state] || { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', dot: '#6b7280' };
  const openCall = song.open_calls?.[0];

  return (
    <div
      className="rounded-xl p-4 transition-all hover:scale-[1.01]"
      style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-start gap-3">
        {/* Cover art placeholder */}
        <div
          className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-xl"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          🎵
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-sm font-bold text-white truncate">{song.title}</div>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: style.bg, color: style.color }}
            >
              {song.lifecycle_state}
            </span>
          </div>
          <div className="text-xs text-white/40 mb-2 truncate">{song.artist_name}</div>

          <div className="flex items-center gap-3 mb-3">
            <div className="text-xs text-white/40">
              <span className="text-white/60 font-semibold">{(song.lifetime_streams || 0).toLocaleString()}</span> streams
            </div>
            {song.genre && (
              <div className="text-xs text-white/30 capitalize">{song.genre}</div>
            )}
          </div>

          {/* Open call details */}
          {openCall && (
            <div
              className="flex items-center justify-between p-2 rounded-lg mb-3"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}
            >
              <div className="text-xs text-white/50">
                Open call · <span className="font-semibold" style={{ color: '#C9A84C' }}>{Math.round((openCall.revenue_split_offer || 0.7) * 100)}%</span> to remixer
              </div>
              <div className="text-xs text-white/30">
                {openCall.current_remixes}/{openCall.max_remixes} slots
              </div>
            </div>
          )}

          {/* Actions */}
          {!isOwn && (
            <div className="flex gap-2">
              <button
                onClick={() => onRemix(song)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(201,168,76,0.2)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}
              >
                🎛️ Remix
              </button>
              {song.open_for_remix && openCall && (
                <button
                  onClick={() => onOpenCall(song, openCall)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  📋 Claim Slot
                </button>
              )}
            </div>
          )}

          {isOwn && (
            <button
              onClick={() => onOpenCall(song, null)}
              className="w-full py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: song.open_for_remix ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                color: song.open_for_remix ? '#ef4444' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${song.open_for_remix ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {song.open_for_remix ? '🔒 Close to Remixes' : '🔓 Open for Remixes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RemixOpportunitiesFilter({ artistId, onRemix, onOpenCallAction }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchSongs();
  }, [filter]);

  async function fetchSongs() {
    setLoading(true);
    try {
      let flattened = [];
      const pendingBlockedSongIds = new Set();

      if (filter === 'mine' && artistId) {
        const { data: mySongs } = await supabaseClient
          .from('songs')
          .select('id, title, artist_id, release_id, open_for_remix, is_remix, status, release_status')
          .eq('artist_id', artistId)
          .eq('is_remix', false)
          .order('created_at', { ascending: false });

        const releaseIds = [...new Set((mySongs || []).map(song => song.release_id).filter(Boolean))];
        const songIds = (mySongs || []).map(song => song.id);

        const [{ data: releases }, { data: openCalls }, { data: artists }, { data: pendingCollabs }] = await Promise.all([
          releaseIds.length
            ? supabaseClient
                .from('releases')
                .select('id, lifecycle_state, lifetime_streams, genre, release_status')
                .in('id', releaseIds)
            : Promise.resolve({ data: [] }),
          songIds.length
            ? supabaseClient
                .from('remix_open_calls')
                .select('id, original_song_id, revenue_split_offer, max_remixes, current_remixes, status')
                .in('original_song_id', songIds)
            : Promise.resolve({ data: [] }),
          supabaseClient
            .from('profiles')
            .select('id, artist_name')
            .eq('id', artistId),
          songIds.length
            ? supabaseClient
                .from('collaboration_requests')
                .select('song_id, status')
                .in('song_id', songIds)
                .eq('status', 'pending')
            : Promise.resolve({ data: [] }),
        ]);

        const releaseMap = new Map((releases || []).map(release => [release.id, release]));
        const openCallMap = new Map();
        for (const call of openCalls || []) {
          if (call.status === 'open' && !openCallMap.has(call.original_song_id)) {
            openCallMap.set(call.original_song_id, call);
          }
        }
        for (const collab of pendingCollabs || []) {
          if (collab.song_id) pendingBlockedSongIds.add(collab.song_id);
        }
        const artistName = artists?.[0]?.artist_name || 'Unknown';

        for (const song of mySongs || []) {
          const rel = releaseMap.get(song.release_id);
          if (!rel || rel.release_status !== 'released') continue;
          if (song.release_status !== 'released') continue;
          if (song.status === 'waiting_on_collab') continue;
          if (pendingBlockedSongIds.has(song.id)) continue;
          const activeOpenCall = openCallMap.get(song.id) || null;
          flattened.push({
            ...song,
            artist_name: artistName,
            lifecycle_state: rel.lifecycle_state || 'Stable',
            lifetime_streams: rel.lifetime_streams || 0,
            genre: rel.genre,
            release: rel,
            open_calls: activeOpenCall ? [activeOpenCall] : [],
          });
        }
      } else {
        const { data: releases } = await supabaseClient
          .from('releases')
          .select('id, lifecycle_state, lifetime_streams, genre, release_status')
          .in('lifecycle_state', ['Hot', 'Trending', 'Momentum', 'Stable'])
          .eq('release_status', 'released')
          .order('lifetime_streams', { ascending: false })
          .limit(40);

        const releaseIds = (releases || []).map(release => release.id);
        const { data: catalogSongs } = releaseIds.length
          ? await supabaseClient
              .from('songs')
              .select('id, title, artist_id, release_id, open_for_remix, is_remix, status, release_status')
              .in('release_id', releaseIds)
              .eq('is_remix', false)
              .eq('release_status', 'released')
          : { data: [] };

        const songIds = (catalogSongs || []).map(song => song.id);
        const artistIds = [...new Set((catalogSongs || []).map(song => song.artist_id).filter(Boolean))];

        const [{ data: openCalls }, { data: artists }, { data: pendingCollabs }] = await Promise.all([
          songIds.length
            ? supabaseClient
                .from('remix_open_calls')
                .select('id, original_song_id, revenue_split_offer, max_remixes, current_remixes, status')
                .in('original_song_id', songIds)
            : Promise.resolve({ data: [] }),
          artistIds.length
            ? supabaseClient
                .from('profiles')
                .select('id, artist_name')
                .in('id', artistIds)
            : Promise.resolve({ data: [] }),
          songIds.length
            ? supabaseClient
                .from('collaboration_requests')
                .select('song_id, status')
                .in('song_id', songIds)
                .eq('status', 'pending')
            : Promise.resolve({ data: [] }),
        ]);

        const releaseMap = new Map((releases || []).map(release => [release.id, release]));
        const artistMap = new Map((artists || []).map(artist => [artist.id, artist.artist_name]));
        const openCallMap = new Map();
        for (const call of openCalls || []) {
          if (call.status === 'open' && !openCallMap.has(call.original_song_id)) {
            openCallMap.set(call.original_song_id, call);
          }
        }
        for (const collab of pendingCollabs || []) {
          if (collab.song_id) pendingBlockedSongIds.add(collab.song_id);
        }

        for (const song of catalogSongs || []) {
          const release = releaseMap.get(song.release_id);
          if (!release) continue;
          if (song.status === 'waiting_on_collab') continue;
          if (pendingBlockedSongIds.has(song.id)) continue;
          if (filter === 'open' && !song.open_for_remix) continue;
          const activeOpenCall = openCallMap.get(song.id) || null;
          flattened.push({
            ...song,
            artist_name: artistMap.get(song.artist_id) || 'Unknown',
            lifecycle_state: release.lifecycle_state,
            lifetime_streams: release.lifetime_streams,
            genre: release.genre,
            release,
            open_calls: activeOpenCall ? [activeOpenCall] : [],
          });
        }
      }

      setSongs(flattened);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleOpenForRemix(song) {
    const newValue = !song.open_for_remix;
    await supabaseClient
      .from('songs')
      .update({ open_for_remix: newValue })
      .eq('id', song.id);

    // Keep releases.open_for_remix in sync so release-level queries reflect status
    if (song.release?.id) {
      await supabaseClient
        .from('releases')
        .update({ open_for_remix: newValue })
        .eq('id', song.release.id);
    }

    if (newValue) {
      // Create open call
      await supabaseClient
        .from('remix_open_calls')
        .insert({
          original_song_id: song.id,
          artist_id: artistId,
          revenue_split_offer: 0.70,
          revenue_split_merch: 0.90,
          max_remixes: 10,
          status: 'open',
        });
    } else {
      // Close existing open calls
      await supabaseClient
        .from('remix_open_calls')
        .update({ status: 'closed' })
        .eq('original_song_id', song.id)
        .eq('artist_id', artistId)
        .eq('status', 'open');
    }

    onOpenCallAction?.({ song, action: newValue ? 'opened' : 'closed' });
    await fetchSongs();
  }

  const filtered = songs.filter(s => {
    if (filter === 'open' && !s.open_for_remix) return false;
    if (filter === 'hot' && !['Hot', 'Trending'].includes(s.lifecycle_state)) return false;
    if (filter === 'mine' && s.artist_id !== artistId) return false;
    if (search && !s.title?.toLowerCase().includes(search.toLowerCase()) && !s.artist_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search songs or artists…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/30 outline-none"
          style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { id: 'all',  label: 'All Released' },
          { id: 'open', label: '🔓 Open Calls' },
          { id: 'hot',  label: '🔥 Hot/Trending' },
          { id: 'mine', label: '🎤 My Songs' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: filter === f.id ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.05)',
              color: filter === f.id ? '#C9A84C' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${filter === f.id ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-white/30 text-sm">
          {filter === 'open' ? 'No open remix calls right now.' :
           filter === 'mine' ? 'You have no released songs yet.' :
           'No songs found matching your search.'}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(song => (
          <SongCard
            key={song.id}
            song={song}
            onRemix={onRemix}
            onOpenCall={song.artist_id === artistId ? () => handleToggleOpenForRemix(song) : s => onOpenCallAction?.({ song: s })}
            isOwn={song.artist_id === artistId}
          />
        ))}
      </div>
    </div>
  );
}
