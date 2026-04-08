import React, { useState, useMemo } from "react";
import { X, Star, Rocket, Calendar, TrendingUp, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { showToast } from "@/components/ui/toast-provider";
import { getArtworkUrl } from "./projectArtwork";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export default function LeadSingleSelector({ 
  isOpen, 
  onClose, 
  project, 
  songs = [], 
  profile,
  onLeadSingleSelected 
}) {
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [releaseNow, setReleaseNow] = useState(false);

  const projectSongs = useMemo(() => {
    if (!project?.tracklist) return [];
    return songs.filter(s => project.tracklist.includes(s.id) && s.status === "recorded");
  }, [project, songs]);

  const handleSetLeadSingle = async () => {
    if (!selectedSongId || !project?.id) return;
    setLoading(true);

    try {
      if (releaseNow) {
        const selectedSong = projectSongs.find(s => s.id === selectedSongId);

        if (!selectedSong || !selectedSong.id) {
          showToast("Cannot create single: invalid song", "error");
          return;
        }

        const result = await invokeEdgeFunction('releaseManager', {
          action: 'releaseLeadSingle',
          artistId: profile.id,
          songId: selectedSongId,
          projectId: project.id,
        });

        if (!result.success) {
          showToast(result.error || "Failed to release lead single", "error");
          return;
        }

        showToast(`"${selectedSong?.title}" released as lead single!`, "success");
      } else {
        showToast("Lead single selected - release it when ready!", "success");
      }

      onLeadSingleSelected?.({ songId: selectedSongId, released: releaseNow });
      onClose();
    } catch (error) {
      console.error("[LeadSingle] Failed to set lead single:", error);
      showToast("Failed to set lead single", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h2 className="text-white font-bold text-lg">Select Lead Single</h2>
              <p className="text-gray-400 text-xs mt-0.5">Choose the song to release before your album</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(85vh-180px)]">
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400 mt-0.5" />
                <div>
                  <p className="text-white text-xs font-semibold">Lead Single Strategy</p>
                  <p className="text-gray-400 text-[10px] mt-1">
                    Release your lead single 2-4 weeks before the album to build anticipation. 
                    Choose your strongest track to maximize streams and hype.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden">
                <img 
                  src={getArtworkUrl(project) || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100"} 
                  alt={project?.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{project?.name}</p>
                <p className="text-gray-400 text-xs">{project?.type || project?.project_type} • {projectSongs.length} tracks</p>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                Select Lead Single
              </label>
              <div className="space-y-2">
                {projectSongs.map((song, idx) => (
                  <button
                    key={song.id}
                    onClick={() => setSelectedSongId(song.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      selectedSongId === song.id
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        selectedSongId === song.id 
                          ? "bg-amber-500" 
                          : "bg-white/10"
                      }`}>
                        {selectedSongId === song.id ? (
                          <Star className="w-4 h-4 text-white" />
                        ) : (
                          <span className="text-gray-400 text-sm font-medium">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{song.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-gray-500 text-[10px]">Quality: {song.quality}</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-500 text-[10px]">{song.genre}</span>
                        </div>
                      </div>
                      {song.quality >= 80 && (
                        <div className="px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30">
                          <span className="text-green-400 text-[9px] font-semibold">HIT POTENTIAL</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedSongId && (
              <div className="space-y-2">
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block">
                  Release Options
                </label>
                <button
                  onClick={() => setReleaseNow(false)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    !releaseNow
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-white font-medium text-sm">Save for Later</p>
                      <p className="text-gray-500 text-[10px]">Mark as lead single, release when ready</p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setReleaseNow(true)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    releaseNow
                      ? "border-green-500 bg-green-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Rocket className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="text-white font-medium text-sm">Release Now</p>
                      <p className="text-gray-500 text-[10px]">Drop the lead single immediately</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <button
              onClick={handleSetLeadSingle}
              disabled={loading || !selectedSongId}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <Zap className="w-4 h-4 animate-pulse" />
              ) : releaseNow ? (
                <>
                  <Rocket className="w-4 h-4" />
                  Release Lead Single
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" />
                  Set as Lead Single
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
