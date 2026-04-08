import React from "react";
import { TrendingUp, Mic, Users, Zap, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function ProjectCard({
  project,
  songs,
  onExpand,
  isExpanded,
  onReleaseSingle,
  onShowAnalytics,
  onEdit,
  recordingCount,
  onRecord,
  onRecordAll,
  onCollab,
  recordingSongId,
  isRecordingAll
}) {
  const trackCount = project.tracklist?.length || 0;
  const trackSongs = songs.filter((s) => project.tracklist?.includes(s.id));
  const avgQuality = trackSongs.length
    ? Math.round(trackSongs.reduce((sum, s) => sum + (s.quality || 0), 0) / trackSongs.length)
    : 0;
  const recordedCount = trackSongs.filter((s) => s.status === "recorded").length;
  const unrecordedCount = trackCount - recordedCount;
  const completionPercent = trackCount > 0 ? Math.round((recordedCount / trackCount) * 100) : 0;
  const allRecorded = trackCount > 0 && recordedCount === trackCount;
  const recordAllEnergy = unrecordedCount * 15;

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-black/60 to-black/40 border border-white/[0.08] group hover:border-white/[0.15] transition-all">
      <button
        onClick={() => onShowAnalytics(project.id)}
        className="relative h-40 overflow-hidden w-full text-left cursor-pointer hover:opacity-90 transition-opacity"
      >
        <img
          src={project.cover_artwork_url || "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop"}
          alt={project.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-sm truncate">{project.name}</h3>
            <p className="text-gray-300 text-xs">{project.type} • {trackCount} tracks</p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold text-lg">{avgQuality}</p>
            <p className="text-gray-400 text-[10px]">Quality</p>
          </div>
        </div>
      </button>

      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-white text-[11px] font-bold uppercase tracking-wide">Progress</span>
            <span className="text-gray-400 text-[10px]">{completionPercent}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-400">{recordedCount}/{trackCount} recorded</span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title="Edit project"
            >
              <Edit2 className="w-3 h-3 text-gray-400 hover:text-white" />
            </button>
            <div className="flex items-center gap-0.5 text-green-400">
              <TrendingUp className="w-3 h-3" />
              <span>{recordingCount || 0} queue</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onExpand(!isExpanded)}
            className="py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-medium hover:bg-white/10 transition-colors"
          >
            {isExpanded ? "Hide" : "View"} Tracklist
          </button>
          
          {allRecorded ? (
            <Button
              onClick={() => onReleaseSingle(project)}
              className="py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors h-auto"
            >
              Release
            </Button>
          ) : (
            <Button
              onClick={() => onRecordAll(project)}
              disabled={isRecordingAll || unrecordedCount === 0}
              className="py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium transition-colors h-auto"
            >
              <Mic className="w-3 h-3 mr-1" />
              {isRecordingAll ? "Recording..." : `Record All`}
              <span className="ml-1 text-[9px] opacity-70 flex items-center"><Zap className="w-2.5 h-2.5" />{recordAllEnergy}</span>
            </Button>
          )}
        </div>

        {/* Lead Single selection removed from unreleased projects.
            Singles can ONLY be released from already-released albums/EPs
            via the Released Library tracklist (Rocket button). */}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.08] px-4 py-3 bg-white/[0.02] max-h-60 overflow-y-auto"
          >
            {trackCount > 0 ? (
              <ul className="text-xs text-gray-300 space-y-2">
                {project.tracklist.map((trackId, idx) => {
                  const song = songs.find((s) => s.id === trackId);
                  const isRecorded = song?.status === "recorded";
                  return (
                    <li key={trackId} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isRecorded ? "bg-green-400" : "bg-gray-600"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">
                          {idx + 1}. {song?.title || "Untitled"}
                        </p>
                        <p className="text-[10px] text-gray-600">{song?.status || "unrecorded"} • Q: {song?.quality || 0}</p>
                      </div>
                      {!isRecorded && song && (
                        <div className="flex items-center gap-1">
                          {onCollab && (
                            <button
                              onClick={() => onCollab(song)}
                              className="p-1.5 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-colors"
                              title="Record with feature"
                            >
                              <Users className="w-3 h-3" />
                            </button>
                          )}
                          {onRecord && (
                            <Button
                              size="sm"
                              onClick={() => onRecord(song)}
                              disabled={recordingSongId === song.id}
                              className="bg-red-600 hover:bg-red-500 text-white rounded-lg h-7 px-2 text-[10px]"
                            >
                              <Mic className="w-3 h-3 mr-1" />
                              {recordingSongId === song.id ? "Recording..." : "Record"}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No tracks added yet.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}