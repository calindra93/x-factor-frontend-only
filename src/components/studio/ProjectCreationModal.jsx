import React, { useEffect, useState, useMemo } from "react";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Image as ImageIcon, ChevronDown, GripVertical } from "lucide-react";
import SongSelector from "./SongSelector";
import { showToast } from "@/components/ui/toast-provider";
import { supabaseClient } from "@/lib/supabaseClient";

const REUSE_RULES = {
  Mixtape: {
    canUseFrom: ["Single", "Mixtape", "EP", "Album"],
    minSongs: 4,
    maxSongs: 10
  },
  EP: {
    canUseFrom: ["Single", "Mixtape", "EP", "Album"],
    minSongs: 3,
    maxSongs: 7
  },
  Album: {
    canUseFrom: ["Single", "Mixtape", "EP", "Album"],
    minSongs: 7,
    maxSongs: 20
  },
  Single: {
    canUseFrom: ["Mixtape", "EP", "Album"],
    minSongs: 1,
    maxSongs: 1
  },
  Demo: {
    canUseFrom: ["Single", "Mixtape", "EP", "Album"],
    minSongs: 1,
    maxSongs: 5
  }
};

export default function ProjectCreationModal({ isOpen, onClose, songs, projects, profile, onCreateProject }) {
  const [form, setForm] = useState({
    name: "",
    type: "EP",
    description: "",
    tracklist: [],
    cover_artwork_url: ""
  });
  const [showSongSelector, setShowSongSelector] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscClose = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEscClose);
    return () => window.removeEventListener("keydown", handleEscClose);
  }, [isOpen, onClose]);

  const releasedUsageMap = useMemo(() => {
    const map = new Map();
    projects
      .filter((project) => project.project_status === "released")
      .forEach((project) => {
        (project.tracklist || []).forEach((songId) => {
          if (!map.has(songId)) {
            map.set(songId, new Set());
          }
          map.get(songId).add(project.type || "Project");
        });
      });
    return map;
  }, [projects]);

  const getReuseConstraints = () => {
    const disabled = new Map();
    const rules = REUSE_RULES[form.type];
    
    releasedUsageMap.forEach((types, songId) => {
      if (form.tracklist.includes(songId)) return;
      const canUseFrom = rules?.canUseFrom || [];
      const releaseTypes = Array.from(types);
      
      // Singles can be reused unless song is in non-Single released projects
      const nonSingleTypes = releaseTypes.filter(t => t !== "Single");
      const typesToCheck = nonSingleTypes.length > 0 ? nonSingleTypes : releaseTypes;
      const canUseThis = typesToCheck.some(t => canUseFrom.includes(t));
      
      if (!canUseThis) {
        disabled.set(songId, `Can't use ${typesToCheck.join(", ")} songs on a ${form.type}`);
      }
    });
    return disabled;
  };

  const handleSelectSongs = (selected) => {
    setForm(prev => ({ ...prev, tracklist: selected }));
    setShowSongSelector(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "warning");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image file must be less than 5MB", "warning");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
      const { error: uploadError } = await supabaseClient.storage
        .from('uploads')
        .upload(filename, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabaseClient.storage.from('uploads').getPublicUrl(filename);
      if (!publicUrl) throw new Error("No public URL returned from storage");
      setForm(prev => ({ ...prev, cover_artwork_url: publicUrl }));
    } catch (error) {
      console.error("[ProjectCreationModal] Upload failed:", error);
      showToast(`Failed to upload image: ${error.message}`, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name) {
      showToast("Please enter a project name", "warning");
      return;
    }
    
    const rules = REUSE_RULES[form.type];
    
    // Validate track count
    if (form.tracklist.length < rules.minSongs) {
      showToast(`${form.type} requires at least ${rules.minSongs} songs`, "warning");
      return;
    }
    if (form.tracklist.length > rules.maxSongs) {
      showToast(`${form.type} can have at most ${rules.maxSongs} songs`, "warning");
      return;
    }

    await onCreateProject({
      name: form.name,
      type: form.type,
      description: form.description,
      tracklist: form.tracklist,
      cover_artwork_url: form.cover_artwork_url
    });

    setForm({ name: "", type: "EP", description: "", tracklist: [], cover_artwork_url: "" });
    onClose();
  };

  const rules = REUSE_RULES[form.type];

  if (!isOpen) return null;

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
        className="w-full max-w-md mx-auto bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 max-h-[var(--app-usable-height)] overflow-y-auto nested-scroll"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">New Project</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Project Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Project name..."
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this release (concept, vibe, collaborators)..."
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 rounded-lg min-h-[90px]"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Project Type</label>
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value, tracklist: [] }))}
                className="w-full appearance-none bg-white/5 border border-white/10 text-white h-11 rounded-xl px-3 pr-10 text-sm outline-none cursor-pointer"
                style={{colorScheme:"dark"}}
              >
                <option value="EP" className="bg-[#1a1a24]">EP (3–7 tracks)</option>
                <option value="Album" className="bg-[#1a1a24]">Album (7–20 tracks)</option>
                <option value="Mixtape" className="bg-[#1a1a24]">Mixtape (4–10 tracks)</option>
                <option value="Demo" className="bg-[#1a1a24]">Demo (1–5 tracks)</option>
                <option value="Single" className="bg-[#1a1a24]">Single (1 track)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-gray-600 text-[10px] mt-1">
              {form.type}: {rules.minSongs === rules.maxSongs ? `exactly ${rules.minSongs}` : `${rules.minSongs}–${rules.maxSongs}`} track{rules.maxSongs !== 1 ? "s" : ""} required
            </p>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Project Cover Art</label>
            <div className="space-y-2">
              {form.cover_artwork_url ? (
                <div className="relative">
                  <img
                    src={form.cover_artwork_url}
                    alt="Project cover"
                    className="w-full h-32 object-cover rounded-lg border border-white/10"
                  />
                  <button
                    onClick={() => setForm(prev => ({ ...prev, cover_artwork_url: "" }))}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
                    title="Remove cover image"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center hover:border-white/30 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="hidden"
                    id="cover-upload"
                  />
                  <label
                    htmlFor="cover-upload"
                    className={`cursor-pointer flex flex-col items-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {uploading ? "Uploading..." : "Click to upload cover art"}
                    </span>
                    <span className="text-[10px] text-gray-500">JPG, PNG, GIF up to 5MB</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">
                Tracklist ({form.tracklist.length}/{rules.maxSongs})
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSongSelector(true)}
                className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Songs
              </Button>
            </div>

            {form.tracklist.length === 0 ? (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center text-xs text-gray-500">
                No songs selected yet
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={form.tracklist}
                onReorder={(newOrder) => setForm(prev => ({ ...prev, tracklist: newOrder }))}
                className="space-y-2 max-h-48 overflow-y-auto"
              >
                {form.tracklist.map((songId, index) => {
                  const song = songs.find(s => s.id === songId);
                  return (
                    <Reorder.Item
                      key={songId}
                      value={songId}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-white font-medium">{index + 1}. {song?.title || "Untitled"}</p>
                          <p className="text-[10px] text-gray-500">{song?.status} • Q: {song?.quality || 0}</p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setForm(prev => ({
                            ...prev,
                            tracklist: prev.tracklist.filter((id) => id !== songId)
                          }))
                        }
                        className="text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            )}

            {showSongSelector && (
              <div className="mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <SongSelector
                  songs={songs}
                  currentTracklist={form.tracklist}
                  disabledSongs={getReuseConstraints()}
                  onSelectSong={handleSelectSongs}
                  onClose={() => setShowSongSelector(false)}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 pb-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || form.tracklist.length < rules.minSongs}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl h-11 disabled:opacity-30"
            >
              Create Project
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}