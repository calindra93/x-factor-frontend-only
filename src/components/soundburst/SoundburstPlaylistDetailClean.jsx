import React, { useEffect, useState } from "react";
import { X, Play, Clock, Music, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { getVisibleReleasedReleases } from "@/lib/releaseVisibility";

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatPlaylistRuntime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
};

const diversifySongsByArtist = (songs, maxPerArtist = 4) => {
  const counts = new Map();

  return songs.filter((song) => {
    const artistId = song.artistId || "__unknown__";
    const currentCount = counts.get(artistId) || 0;

    if (currentCount >= maxPerArtist) {
      return false;
    }

    counts.set(artistId, currentCount + 1);
    return true;
  });
};

export default function SoundburstPlaylistDetailClean({ playlist, onClose }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSongs([]);
    loadPlaylistSongs();
  }, [playlist]);

  const loadPlaylistSongs = async () => {
    try {
      const [releases, allSongs] = await Promise.all([
        base44.entities.Release.list(),
        base44.entities.Song.list(),
      ]);

      const releasedReleases = getVisibleReleasedReleases(releases, { platform: "soundburst" });
      const playlistReleaseIds = new Set((playlist?.releases || []).map((release) => release.id).filter(Boolean));
      const matchedReleases = releasedReleases.filter((release) => playlistReleaseIds.has(release.id));
      const playlistReleases =
        matchedReleases.length > 0
          ? matchedReleases
          : getVisibleReleasedReleases(playlist?.releases || [], { platform: "soundburst" });

      const playlistReleaseIdSet = new Set(playlistReleases.map((r) => r.id));
      const playlistSongs = allSongs.filter((song) =>
        playlistReleaseIdSet.has(song.release_id) ||
        playlistReleaseIdSet.has(song.single_release_id)
      );

      const artistIds = [...new Set(playlistSongs.map((song) => song.artist_id).filter(Boolean))];
      const profiles =
        artistIds.length > 0
          ? await base44.entities.ArtistProfile.filter({ id: { $in: artistIds } })
          : [];
      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

      const formattedSongs = diversifySongsByArtist(
        playlistSongs
        .map((song) => {
          const profile = profileMap.get(song.artist_id);
          const release = playlistReleases.find(
            (r) => r.id === song.release_id || r.id === song.single_release_id
          );

          return {
            id: song.id,
            artistId: song.artist_id,
            title: song.title,
            artist: profile?.artist_name || "Unknown Artist",
            album: release?.release_name || release?.title || "Single",
            duration: ((song.length_minutes || 0) * 60) + (song.length_seconds || 0),
            cover: song.cover_artwork_url || release?.cover_artwork_url,
            releaseDate: release?.release_date || release?.created_date || release?.created_at || null,
          };
        })
        .sort((left, right) => new Date(right.releaseDate || 0).getTime() - new Date(left.releaseDate || 0).getTime())
        .filter((song) => Boolean(song.artistId)),
        4
      )
        .slice(0, 50);

      setSongs(formattedSongs);
    } catch (error) {
      console.error("Failed to load playlist songs:", error);
      setSongs([]);
    } finally {
      setLoading(false);
    }
  };

  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0);
  const isRadio = Boolean(playlist.isLive);

  const playlistStats = isRadio
    ? [
        playlist.listenerCount ? `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(playlist.listenerCount)} listeners` : null,
        songs.length > 0 ? `${songs.length} tracks in rotation` : "Tracklist updates weekly",
      ].filter(Boolean)
    : [`${playlist.saves || 0} saves`, `${songs.length} songs`];

  if (!isRadio && totalDuration > 0) {
    playlistStats.push(formatPlaylistRuntime(totalDuration));
  }

  const accentColor = isRadio ? "#ef4444" : "#10b981"; // red for radio, emerald for playlists

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-x-0 top-0 bottom-[88px] z-30 overflow-y-auto bg-black"
    >
      <style>{`
        @keyframes sb-detail-wave {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1); }
        }
        @keyframes sb-detail-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>

      <div className="mx-auto max-w-[420px]">
        {isRadio ? (
          /* ── Radio show header ── */
          <div className="relative min-h-[260px] bg-gradient-to-b from-red-950/70 to-black">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute bottom-4 left-4 right-4">
              {/* Animated waveform block */}
              <div className="mb-4 flex items-end gap-[3px]" style={{ height: "40px" }}>
                {[60, 100, 40, 80, 55, 90, 35].map((h, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-red-500"
                    style={{
                      height: `${h}%`,
                      opacity: 0.8,
                      animation: `sb-detail-wave ${0.55 + i * 0.12}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.07}s`,
                    }}
                  />
                ))}
                <div className="ml-3 flex items-center gap-1.5 pb-1">
                  <span
                    className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0"
                    style={{ animation: "sb-detail-pulse 1.4s ease-in-out infinite" }}
                  />
                  <span className="text-xs font-bold uppercase tracking-widest text-red-400">On Air</span>
                </div>
              </div>

              <div className="flex items-end gap-4">
                {/* Show icon block */}
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-red-950/80 shadow-2xl ring-1 ring-red-500/20 flex items-center justify-center">
                  <Radio className="h-10 w-10 text-red-400/70" />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="mb-1 text-xs font-semibold text-red-400/80">
                    {playlist.tier === "tastemaker" ? "Tastemaker Radio ✦" : "Underground Radio"}
                  </p>
                  <h1 className="mb-2 text-[2rem] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-3xl">
                    {playlist.name}
                  </h1>
                  {Array.isArray(playlist.genres) && playlist.genres.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {playlist.genres.slice(0, 3).map((g) => (
                        <span key={g} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/15 text-red-300">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                    <span className="font-semibold text-red-400">Soundburst Radio</span>
                    {playlistStats.map((stat) => (
                      <React.Fragment key={stat}>
                        <span className="text-white/30">•</span>
                        <span className="whitespace-nowrap">{stat}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Regular playlist header ── */
          <div className="relative min-h-[300px] bg-gradient-to-b from-emerald-900/80 to-black">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-end gap-4">
                <div className="h-28 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-white/10 shadow-2xl ring-1 ring-white/10 sm:h-36 sm:w-36">
                  {playlist.cover ? (
                    <img src={playlist.cover} alt={playlist.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 px-3 text-center text-xs font-medium text-white/55">
                      Underground mix
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="mb-1 text-xs font-semibold text-emerald-300/80">Underground Playlist</p>
                  <h1 className="mb-2 text-[2rem] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-3xl">
                    {playlist.name}
                  </h1>
                  <p className="mb-3 max-w-[22ch] text-sm leading-5 text-white/60 sm:max-w-[28ch]">
                    {playlist.description || "Fresh underground picks from across the scene."}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                    <span className="font-semibold text-emerald-300">Soundburst</span>
                    {playlistStats.map((stat) => (
                      <React.Fragment key={stat}>
                        <span className="text-white/30">•</span>
                        <span className="whitespace-nowrap">{stat}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-b from-black/40 to-black px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              className="flex h-14 w-14 items-center justify-center rounded-full transition hover:scale-105"
              style={{ background: accentColor }}
            >
              <Play className="ml-1 h-6 w-6 fill-black text-black" />
            </button>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div
            className="mb-4 flex items-center gap-4 pb-2 text-xs text-white/50"
            style={{ borderBottom: `1px solid ${accentColor}18` }}
          >
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Title</span>
            <span className="hidden w-28 text-right md:block">Album</span>
            <Clock className="h-4 w-4" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
            </div>
          ) : songs.length === 0 ? (
            <div className="py-12 text-center">
              {isRadio ? (
                <Radio className="mx-auto mb-3 h-12 w-12 text-red-500/30" />
              ) : (
                <Music className="mx-auto mb-3 h-12 w-12 text-white/20" />
              )}
              <p className="text-sm text-white/50">
                {isRadio ? "Tracklist refreshes each week" : "No songs available yet"}
              </p>
              <p className="mt-1 text-xs text-white/30">
                {isRadio ? "Songs rotate in as the turn engine runs" : "Released music will appear here"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2"
                  style={{ '--hover-bg': isRadio ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)' }}
                  onMouseEnter={e => e.currentTarget.style.background = isRadio ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span className="w-8 text-center text-sm text-white/50">{index + 1}</span>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {song.cover && (
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-white/5">
                        <img src={song.cover} alt={song.title} className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{song.title}</p>
                      <p className="truncate text-xs text-white/50">{song.artist}</p>
                    </div>
                  </div>
                  <span className="hidden w-28 truncate text-right text-xs text-white/50 md:block">
                    {song.album}
                  </span>
                  <span className="w-12 text-right text-xs text-white/50">{formatDuration(song.duration)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
