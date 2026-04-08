import React, { useState, useMemo } from "react";
import { X, Music, Sparkles, RefreshCw, Star, Plus, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

const REMIX_TYPES = [
  { id: "remix", label: "Remix", desc: "New production with different beat/arrangement", icon: "🔄" },
  { id: "acoustic", label: "Acoustic Version", desc: "Stripped-down acoustic arrangement", icon: "🎸" },
  { id: "live", label: "Live Version", desc: "Live performance recording", icon: "🎤" },
  { id: "extended", label: "Extended Mix", desc: "Longer version with additional sections", icon: "⏱️" },
  { id: "radio_edit", label: "Radio Edit", desc: "Shortened version for radio play", icon: "📻" },
];

const DELUXE_TYPES = [
  { id: "deluxe", label: "Deluxe Edition", desc: "3-5 bonus tracks added", bonusTracks: 4, icon: "✨" },
  { id: "super_deluxe", label: "Super Deluxe", desc: "8-10 bonus tracks, remixes, live versions", bonusTracks: 9, icon: "💎" },
  { id: "anniversary", label: "Anniversary Edition", desc: "Remastered with demos and commentary", bonusTracks: 6, icon: "🎂" },
  { id: "expanded", label: "Expanded Edition", desc: "All B-sides and unreleased tracks", bonusTracks: 7, icon: "📦" },
];

export default function CatalogActionsModal({ 
  isOpen, 
  onClose, 
  song, 
  release, 
  trackForSingle,
  profile, 
  songs = [], 
  releases = [],
  onActionComplete 
}) {
  const [activeTab, setActiveTab] = useState("remix");
  const [loading, setLoading] = useState(false);
  const [selectedRemixType, setSelectedRemixType] = useState(null);
  const [selectedDeluxeType, setSelectedDeluxeType] = useState(null);
  const [remixArtist, setRemixArtist] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const isRemixMode = !!song;
  const isDeluxeMode = !!release && !song && !trackForSingle;
  const isSingleFromAlbumMode = !!trackForSingle;

  const availableSongsForDeluxe = useMemo(() => {
    if (!release) return [];
    const releaseTrackIds = new Set((release.tracklist || []).map(id => id));
    return songs.filter(s => 
      s.status === "recorded" && 
      s.release_status !== "released" &&
      !releaseTrackIds.has(s.id)
    );
  }, [songs, release]);

  const [selectedBonusTracks, setSelectedBonusTracks] = useState([]);

  const handleCreateRemix = async () => {
    if (!song || !selectedRemixType || !profile?.id) return;
    
    // VALIDATION: Require original song for remix
    if (!song.id) {
      showToast("Invalid original song", "error");
      return;
    }
    
    setLoading(true);

    try {
      const remixTitle = newTitle.trim() || `${song.title} (${REMIX_TYPES.find(t => t.id === selectedRemixType)?.label})`;
      
      const remixSong = await base44.entities.Song.create({
        artist_id: profile.id,
        title: remixTitle,
        genre: song.genre,
        duration: song.duration,
        status: "recorded",
        release_status: "unreleased",
        quality: Math.max(song.quality - 5, Math.floor(song.quality * 0.9)),
        era_id: song.era_id,
        is_remix: true,
        original_song_id: song.id, // REQUIRED: Link to original song
        remix_type: selectedRemixType,
        remix_artist_ids: remixArtist ? [remixArtist] : [],
        metadata: {
          original_title: song.title,
          remix_type: selectedRemixType,
          created_from_catalog: true
        }
      });

      showToast(`Created "${remixTitle}" - ready to release!`, "success");
      onActionComplete?.({ type: "remix", song: remixSong });
      onClose();
    } catch (error) {
      console.error("[CatalogActions] Remix creation failed:", error);
      showToast("Failed to create remix", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeluxe = async () => {
    if (!release || !selectedDeluxeType || !profile?.id) return;
    if (selectedBonusTracks.length === 0) {
      showToast("Select at least one bonus track", "warning");
      return;
    }
    
    // VALIDATION: Check for existing deluxe of same type
    const existingDeluxe = releases.find(r => 
      r.parent_release_id === release.id && 
      r.deluxe_type === selectedDeluxeType
    );
    
    if (existingDeluxe) {
      showToast(`Deluxe edition of type "${DELUXE_TYPES.find(t => t.id === selectedDeluxeType)?.label}" already exists`, "error");
      return;
    }
    
    setLoading(true);

    try {
      const result = await invokeEdgeFunction('releaseManager', {
        action: 'createDeluxe',
        artistId: profile.id,
        parentReleaseId: release.id,
        deluxeType: selectedDeluxeType,
        bonusTrackIds: selectedBonusTracks,
      });

      if (!result.success) {
        showToast(result.error || "Failed to create deluxe edition", "error");
        return;
      }

      const deluxeInfo = DELUXE_TYPES.find(t => t.id === selectedDeluxeType);
      const deluxeTitle = `${release.release_name || release.title} (${deluxeInfo?.label})`;

      showToast(`Released "${deluxeTitle}" with ${selectedBonusTracks.length} bonus tracks!`, "success");
      onActionComplete?.({ type: "deluxe", release: { id: result.data?.releaseId } });
      onClose();
    } catch (error) {
      console.error("[CatalogActions] Deluxe creation failed:", error);
      showToast("Failed to create deluxe edition", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleBonusTrack = (songId) => {
    setSelectedBonusTracks(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId)
        : [...prev, songId]
    );
  };

  const handleReleaseSingleFromAlbum = async () => {
    if (!trackForSingle || !trackForSingle.song || !profile?.id) return;
    
    setLoading(true);

    try {
      const { song: originalSong, release: originalRelease } = trackForSingle;

      // Client-side guard: parent must look released
      const parentStatus = (originalRelease?.release_status || originalRelease?.project_status || '').toLowerCase();
      const parentLifecycle = (originalRelease?.lifecycle_state || '').toLowerCase();
      const isParentReleased = parentStatus === 'released' || 
        ['hot', 'trending', 'momentum', 'stable', 'declining', 'archived'].includes(parentLifecycle);
      if (!isParentReleased) {
        showToast("Cannot release single: parent album is not yet released", "error");
        setLoading(false);
        return;
      }

      // Client-side duplicate check
      const existingSingle = releases.find(r => 
        r.project_type === "Single" && 
        r.tracklist?.includes(originalSong.id) &&
        r.parent_release_id === originalRelease.id
      );
      
      if (existingSingle) {
        showToast("This track is already released as a single", "warning");
        setLoading(false);
        return;
      }

      const result = await invokeEdgeFunction('releaseManager', {
        action: 'releaseSingleFromAlbum',
        artistId: profile.id,
        songId: originalSong.id,
        parentReleaseId: originalRelease.id,
      });

      if (!result.success) {
        showToast(result.error || "Failed to release single", "error");
        return;
      }

      showToast(`Released "${originalSong.title}" as a single!`, "success");
      onActionComplete?.({ type: "single_from_album", release: { id: result.data?.releaseId } });
      onClose();
    } catch (error) {
      console.error("[CatalogActions] Single from album release failed:", error);
      showToast("Failed to release single", "error");
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
            <h2 className="text-white font-bold text-lg">
              {isRemixMode ? "Create Remix" : isDeluxeMode ? "Create Deluxe Edition" : "Release as Single"}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
            {isRemixMode && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Music className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{song?.title}</p>
                    <p className="text-gray-400 text-xs">Original Song</p>
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                    Remix Type
                  </label>
                  <div className="space-y-2">
                    {REMIX_TYPES.map(type => (
                      <button
                        key={type.id}
                        onClick={() => setSelectedRemixType(type.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                          selectedRemixType === type.id
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{type.icon}</span>
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{type.label}</p>
                            <p className="text-gray-500 text-xs">{type.desc}</p>
                          </div>
                          {selectedRemixType === type.id && (
                            <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                              <Star className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                    Custom Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder={`${song?.title} (${REMIX_TYPES.find(t => t.id === selectedRemixType)?.label || "Remix"})`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-500"
                  />
                </div>
              </div>
            )}

            {isDeluxeMode && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden">
                    <img 
                      src={release?.cover_artwork_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100"} 
                      alt={release?.release_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{release?.release_name || release?.title}</p>
                    <p className="text-gray-400 text-xs">{release?.project_type} • Original Release</p>
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                    Deluxe Type
                  </label>
                  <div className="space-y-2">
                    {DELUXE_TYPES.map(type => (
                      <button
                        key={type.id}
                        onClick={() => setSelectedDeluxeType(type.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                          selectedDeluxeType === type.id
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{type.icon}</span>
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{type.label}</p>
                            <p className="text-gray-500 text-xs">{type.desc}</p>
                          </div>
                          {selectedDeluxeType === type.id && (
                            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                              <Star className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedDeluxeType && (
                  <div>
                    <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                      Select Bonus Tracks ({selectedBonusTracks.length} selected)
                    </label>
                    {availableSongsForDeluxe.length === 0 ? (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                        <p className="text-amber-300 text-xs">No unreleased songs available</p>
                        <p className="text-gray-500 text-[10px] mt-1">Record new songs to add as bonus tracks</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {availableSongsForDeluxe.map(s => (
                          <button
                            key={s.id}
                            onClick={() => toggleBonusTrack(s.id)}
                            className={`w-full p-2.5 rounded-lg border text-left transition-all flex items-center gap-2 ${
                              selectedBonusTracks.includes(s.id)
                                ? "border-green-500 bg-green-500/10"
                                : "border-white/10 bg-white/5 hover:bg-white/10"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                              selectedBonusTracks.includes(s.id)
                                ? "border-green-500 bg-green-500"
                                : "border-white/20"
                            }`}>
                              {selectedBonusTracks.includes(s.id) && (
                                <Star className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{s.title}</p>
                              <p className="text-gray-500 text-[10px]">Quality: {s.quality}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isSingleFromAlbumMode && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
                    <Rocket className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{trackForSingle?.song?.title}</p>
                    <p className="text-gray-400 text-xs">From "{trackForSingle?.release?.release_name || trackForSingle?.release?.title}"</p>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-blue-300 text-xs font-medium mb-1">Release Summary</p>
                  <p className="text-gray-300 text-xs">This will create a new single release for this track, separate from the original album. The single will have its own performance tracking and can be promoted independently.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-gray-300">Creates new single release</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-gray-300">Links to original album for context</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-gray-300">Independent streaming and performance tracking</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <button
              onClick={isRemixMode ? handleCreateRemix : isDeluxeMode ? handleCreateDeluxe : handleReleaseSingleFromAlbum}
              disabled={loading || (isRemixMode && !selectedRemixType) || (isDeluxeMode && (!selectedDeluxeType || selectedBonusTracks.length === 0))}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isRemixMode ? (
                <>
                  <Plus className="w-4 h-4" />
                  Create Remix
                </>
              ) : isDeluxeMode ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  Release Deluxe Edition
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Release as Single
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
