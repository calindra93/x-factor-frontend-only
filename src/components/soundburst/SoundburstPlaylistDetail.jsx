import React, { useState, useEffect } from "react";
import { X, Play, Clock, Music } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { getVisibleReleasedReleases } from "@/lib/releaseVisibility";

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatPlaylistRuntime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
};

export default function SoundburstPlaylistDetail({ playlist, onClose }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlaylistSongs();
  }, [playlist]);

  const loadPlaylistSongs = async () => {
    try {
      const [releases, allSongs] = await Promise.all([
        base44.entities.Release.list(),
        base44.entities.Song.list()
      ]);

      // Use proper release filtering to ensure only released songs are shown
      const releasedReleases = getVisibleReleasedReleases(releases, { platform: "soundburst" });

      const songIds = new Set();
      const projectIds = releasedReleases.map(r => r.project_id).filter(Boolean);
      let releaseProjects = [];
      if (projectIds.length > 0) {
        releaseProjects = await base44.entities.Project.filter({
          id: { $in: projectIds }
        });
        releaseProjects.forEach(project => {
          if (project.tracklist) {
            project.tracklist.forEach(songId => songIds.add(songId));
          }
        });
      }

      const playlistSongs = allSongs.filter(song =>
        songIds.has(song.id) ||
        song.release_status === "released" ||
        (song.status === "recorded" || song.status === "mastered")
      );

      const artistIds = [...new Set(playlistSongs.map(s => s.artist_id).filter(Boolean))];
      const profiles = artistIds.length > 0
        ? await base44.entities.ArtistProfile.filter({ id: { $in: artistIds } })
        : [];
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      const formattedSongs = playlistSongs.map(song => {
        const profile = profileMap.get(song.artist_id);
        const release = releasedReleases.find(r => {
          if (!r.project_id) return false;
          const project = releaseProjects.find(p => p.id === r.project_id);
          return project?.tracklist?.includes(song.id);
        });

        return {
          id: song.id,
          title: song.title,
          artist: profile?.artist_name || "Unknown Artist",
          album: release?.release_name || release?.title || "Single",
          duration: ((song.length_minutes || 0) * 60) + (song.length_seconds || 0),
          cover: song.cover_artwork_url || release?.cover_artwork_url
        };
      }).slice(0, 99);

      setSongs(formattedSongs);
    } catch (error) {
      console.error("Failed to load playlist songs:", error);
      setSongs([]);
    } finally {
      setLoading(false);
    }
  };

  const totalDuration = songs.reduce((sum, song) => sum + song.duration, 0);
  const playlistStats = [
    `${playlist.saves || 0} saves`,
    `${songs.length} songs`,
  ];

  if (totalDuration > 0) {
    playlistStats.push(formatPlaylistRuntime(totalDuration));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 overflow-y-auto"
    >
      <div className="max-w-[420px] mx-auto">
        <div className="relative min-h-[300px] bg-gradient-to-b from-emerald-900/80 to-black">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end gap-4">
              <div className="h-28 w-28 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 ring-1 ring-white/10 shadow-2xl sm:h-36 sm:w-36">
                <img
                  src={playlist.cover}
                  alt={playlist.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-emerald-300/80 text-xs font-semibold mb-1">Underground Playlist</p>
                <h1 className="mb-2 text-[2rem] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-3xl">
                  {playlist.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                  <span className="text-emerald-300 font-semibold">Soundburst</span>
                  <span>•</span>
                  <span>{playlist.saves} saves</span>
                  <span>•</span>
                  <span>{songs.length} songs</span>
                  {totalDuration > 0 && (
                    <>
                      <span>•</span>
                      <span>{formatPlaylistRuntime(totalDuration)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-b from-black/40 to-black px-6 py-4">
          <div className="flex items-center gap-4">
            <button className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center hover:scale-105 transition">
              <Play className="w-6 h-6 text-black fill-black ml-1" />
            </button>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="mb-4 pb-2 border-b border-emerald-500/10 flex items-center gap-4 text-white/50 text-xs">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Title</span>
            <span className="w-32 text-right hidden sm:block">Album</span>
            <Clock className="w-4 h-4" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-12">
              <Music className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm">No songs available yet</p>
              <p className="text-white/30 text-xs mt-1">Released music will appear here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {songs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center gap-4 py-2 px-2 rounded hover:bg-emerald-500/5 group"
                >
                  <span className="w-8 text-center text-white/50 text-sm">{index + 1}</span>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {song.cover && (
                      <div className="w-10 h-10 rounded overflow-hidden bg-white/5 flex-shrink-0">
                        <img src={song.cover} alt={song.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{song.title}</p>
                      <p className="text-white/50 text-xs truncate">{song.artist}</p>
                    </div>
                  </div>
                  <span className="w-32 text-right text-white/50 text-xs truncate hidden sm:block">
                    {song.album}
                  </span>
                  <span className="text-white/50 text-xs w-12 text-right">
                    {formatDuration(song.duration)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
