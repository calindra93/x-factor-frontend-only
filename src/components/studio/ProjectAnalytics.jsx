import React from "react";
import { X, TrendingUp, Zap, Music, Target } from "lucide-react";
import { motion } from "framer-motion";

export default function ProjectAnalytics({ project, songs, onClose }) {
  const trackCount = project.tracklist?.length || 0;
  const trackSongs = songs.filter((s) => project.tracklist?.includes(s.id));
  const avgQuality = trackSongs.length
    ? Math.round(trackSongs.reduce((sum, s) => sum + (s.quality || 0), 0) / trackSongs.length)
    : 0;
  const recordedCount = trackSongs.filter((s) => s.status === "recorded").length;
  const unrecordedCount = trackSongs.filter((s) => s.status === "unrecorded").length;
  const completionPercent = trackCount > 0 ? Math.round((recordedCount / trackCount) * 100) : 0;
  const genreBreakdown = {};
  trackSongs.forEach((s) => {
    genreBreakdown[s.genre] = (genreBreakdown[s.genre] || 0) + 1;
  });

  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
    >
      <motion.div
        initial={{ y: 400, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 400, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#0a0a0f] border-t border-white/10 rounded-t-3xl p-6 max-h-[var(--app-usable-height)] overflow-y-auto nested-scroll"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-lg">{project.name}</h2>
            <p className="text-gray-500 text-xs">{project.type} • {trackCount} tracks</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-purple-400" />
              <span className="text-gray-500 text-[10px] uppercase">Quality</span>
            </div>
            <p className="text-white font-bold text-2xl">{avgQuality}</p>
            <p className="text-gray-600 text-[10px] mt-1">Average score</p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-gray-500 text-[10px] uppercase">Progress</span>
            </div>
            <p className="text-white font-bold text-2xl">{completionPercent}%</p>
            <p className="text-gray-600 text-[10px] mt-1">Recorded</p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-500 text-[10px] uppercase">Status</span>
            </div>
            <p className="text-white font-bold text-2xl">{recordedCount}</p>
            <p className="text-gray-600 text-[10px] mt-1">Tracks recorded</p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-red-400" />
              <span className="text-gray-500 text-[10px] uppercase">Remaining</span>
            </div>
            <p className="text-white font-bold text-2xl">{unrecordedCount}</p>
            <p className="text-gray-600 text-[10px] mt-1">Need recording</p>
          </div>
        </div>

        {Object.keys(genreBreakdown).length > 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <h3 className="text-white font-semibold text-sm mb-3">Genre Mix</h3>
            <div className="space-y-2">
              {Object.entries(genreBreakdown).map(([genre, count]) => (
                <div key={genre} className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">{genre}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 bg-white/10 rounded-full" style={{ width: "60px" }}>
                      <div
                        className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full"
                        style={{ width: `${(count / trackCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-white font-medium text-xs w-6 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}