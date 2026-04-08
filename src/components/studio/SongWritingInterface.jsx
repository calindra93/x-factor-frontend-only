import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Shuffle, Users, Music2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { showToast } from "@/components/ui/toast-provider";
import CollaboratorPicker from "./CollaboratorPicker";
import SamplePicker from "./SamplePicker";
import ImageUpload from "@/components/ui/ImageUpload";

const GENRES = [
  "Rap", "Melodic Rap", "Alternative Rap", "Trap", "Pop", "Hip-Hop", "R&B", "Rock", "EDM",
  "Trance", "Techno", "Afrobeats", "Amapiano", "Reggaeton", "Latin Pop",
  "Salsa", "Dancehall", "Reggae", "K-Pop", "J-Pop", "UK Drill", "Drill", "Indie",
  "Alternative", "Folk", "Country", "Go-Go", "Grunge", "Blues", "Jazz",
  "Soul", "Gospel", "Punk", "Metal", "Indie Rock", "Latin Rap", "Latin"
];

export default function SongWritingInterface({ onClose, onSave, unlockedGenre, profile, songs = [] }) {
  const [form, setForm] = useState({
    title: "",
    genre: unlockedGenre,
    length_minutes: 3,
    length_seconds: 27,
    song_type: "Standard",
    cover_artwork_url: ""
  });
  const [collaborators, setCollaborators] = useState([]);
  const [showCollaboratorPicker, setShowCollaboratorPicker] = useState(false);
  const [showSamplePicker, setShowSamplePicker] = useState(false);
  const [sampleSelection, setSampleSelection] = useState(null);
  const [uploading, setUploading] = useState(false);
  const canSave = Boolean(form.title && form.title.trim());

  const randomizeLength = () => {
    const minutes = Math.floor(Math.random() * 3) + 2; // 2-4 minutes
    const seconds = Math.floor(Math.random() * 60);
    setForm(prev => ({ ...prev, length_minutes: minutes, length_seconds: seconds }));
  };

  const handleSave = async () => {
    // Validate BEFORE setting loading state so early returns don't leave UI stuck
    if (!form.title || form.title.trim() === "") {
      showToast("Please enter a song title", "warning");
      return;
    }

    const isDuplicate = songs.some(s =>
      s.title?.toLowerCase().trim() === form.title.toLowerCase().trim()
    );
    if (isDuplicate) {
      showToast(`You already have a song called "${form.title.trim()}"`, "error");
      return;
    }

    if (!form.genre) {
      showToast("Please select a genre", "warning");
      return;
    }

    try {
      setUploading(true);
         // Generate unique filename for file uploads if needed
         const generateUniqueFilename = (originalName) => {
           const timestamp = Date.now();
           const random = Math.random().toString(36).substring(2, 9);
           return `${timestamp}-${random}-${originalName}`;
         };
    
    const avgMatch = collaborators.length
      ? collaborators.reduce((sum, c) => sum + (c.match_score || 50), 0) / collaborators.length
      : 0;
    const collaboratorBoost = collaborators.length
      ? Math.min(15, Math.max(5, Math.round(avgMatch / 10)))
      : 0;
    await onSave({
      ...form,
      collaborator_ids: collaborators.map((collab) => collab.id),
      collaborator_match_score: collaborators.map((collab) => collab.match_score || 50),
      collaborator_boost: collaboratorBoost,
      // Sample data (if any)
      sample_source_id: sampleSelection?.sampleSource?.id || null,
      sample_strategy: sampleSelection?.strategy || null,
      sample_quality_boost: sampleSelection?.qualityBoost || 0,
      sample_clout_boost: sampleSelection?.cloutBoost || 0,
      sample_controversy_chance: sampleSelection?.controversyChance || 0,
      sample_cost: sampleSelection?.cost || 0,
      sample_source_type: sampleSelection?.sourceType || null,
      sampled_player_song_id: sampleSelection?.sampledPlayerSongId || null,
      sample_royalty_rate: sampleSelection?.royaltyRate || 0,
      sample_tier: sampleSelection?.tier || null,
    });
      setUploading(false);
    } catch (error) {
      showToast("Failed to save song: " + (error?.message || "Unknown error"), "error");
      setUploading(false);
    }
  };

  const selectedCollaboratorNames = collaborators.length > 0
    ? collaborators.map((c) => c.artist_name).join(", ")
    : "No collaborators selected";

  return (
    <>
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
          <div>
            <h2 className="text-white font-bold text-lg">Write New Song</h2>
            <p className="text-gray-500 text-xs mt-1">Shape the concept, lock the collaborators, and set up the record.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Song Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Song title..."
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Genre</label>
            <select
              value={form.genre}
              onChange={(e) => setForm(prev => ({ ...prev, genre: e.target.value }))}
              className="w-full bg-[#14141b] border border-white/10 text-white h-11 rounded-xl px-3 text-sm outline-none"
            >
              {GENRES.map((g) => (
                <option key={g} value={g} className="bg-[#14141b] text-white">
                  {g}{g === unlockedGenre ? " ★" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">Song Length</label>
              <Button
                size="sm"
                variant="outline"
                onClick={randomizeLength}
                className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-7 text-xs"
              >
                <Shuffle className="w-3 h-3 mr-1" />
                Randomize
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  value={form.length_minutes}
                  onChange={(e) => setForm(prev => ({ ...prev, length_minutes: parseInt(e.target.value) || 0 }))}
                  min="0"
                  max="10"
                  className="bg-white/5 border-white/10 text-white h-11 rounded-xl text-center"
                />
                <p className="text-gray-600 text-[10px] mt-1 text-center">Minutes</p>
              </div>
              <div>
                <Input
                  type="number"
                  value={form.length_seconds}
                  onChange={(e) => setForm(prev => ({ ...prev, length_seconds: parseInt(e.target.value) || 0 }))}
                  min="0"
                  max="59"
                  className="bg-white/5 border-white/10 text-white h-11 rounded-xl text-center"
                />
                <p className="text-gray-600 text-[10px] mt-1 text-center">Seconds</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Song Type</label>
            <select
              value={form.song_type}
              onChange={(e) => setForm(prev => ({ ...prev, song_type: e.target.value }))}
              className="w-full bg-[#14141b] border border-white/10 text-white h-11 rounded-xl px-3 text-sm outline-none"
            >
              <option value="Standard" className="bg-[#14141b] text-white">Standard</option>
              <option value="Intro" className="bg-[#14141b] text-white">Intro</option>
              <option value="Interlude" className="bg-[#14141b] text-white">Interlude</option>
              <option value="Outro" className="bg-[#14141b] text-white">Outro</option>
              <option value="Voice Memo" className="bg-[#14141b] text-white">Voice Memo</option>
            </select>
            <p className="text-gray-600 text-[10px] mt-1">Optional framing for how the song fits into a project.</p>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Cover Art</label>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
              <ImageUpload
                value={form.cover_artwork_url}
                onChange={(url) => setForm(f => ({ ...f, cover_artwork_url: url }))}
                placeholder="Upload cover art or enter image URL"
                maxSizeMB={3}
                accept="image/*,image/gif"
                className="bg-transparent border-0"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">Collaborators ({collaborators.length}/2)</label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCollaboratorPicker(true)}
                className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-7 text-xs"
              >
                <Users className="w-3 h-3 mr-1" />
                Choose
              </Button>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white font-medium truncate">{selectedCollaboratorNames}</p>
                <p className="text-[10px] text-gray-500">Higher fit collaborators can improve your song outcome.</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">Sample Another Song (Optional)</label>
              <p className="text-amber-400/60 text-[10px] font-medium">+Quality, +Clout</p>
            </div>

            {sampleSelection ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Music2 className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-semibold truncate">{sampleSelection.sampleSource.name}</p>
                  <p className="text-[10px] text-amber-400/70 truncate">{sampleSelection.sampleSource.artist_name} · {sampleSelection.strategy === 'direct' ? 'Direct' : sampleSelection.strategy === 'underground' ? 'Underground' : 'Flip'}{sampleSelection.cost > 0 ? ` · $${sampleSelection.cost.toLocaleString()}` : ' · Free'}</p>
                </div>
                <button onClick={() => setSampleSelection(null)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                   className="w-full h-10 px-4 rounded-xl border-amber-500/30 bg-[#14131a] hover:bg-[#1a1820] hover:border-amber-500/40 text-amber-400/90 hover:text-white"
                  onClick={() => setShowSamplePicker(true)}
                >
                  <Music2 className="w-4 h-4 mr-2 text-amber-400" />
                  Browse Samples
                </Button>
                <p className="text-amber-400 text-[10px] leading-tight">Sample from other artists&apos; songs to boost quality & clout with direct, underground, or flip strategies.</p>
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
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl h-11 disabled:opacity-30"
            >
              Save Song
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    <AnimatePresence>
      {showCollaboratorPicker && (
        <CollaboratorPicker
          profile={profile}
          selected={collaborators}
          onSelect={(items) => {
            setCollaborators(items);
          }}
          onClose={() => setShowCollaboratorPicker(false)}
        />
      )}
      {showSamplePicker && (
        <SamplePicker
          profile={profile}
          onSelect={(sel) => {
            setSampleSelection(sel);
            setShowSamplePicker(false);
          }}
          onClose={() => setShowSamplePicker(false)}
        />
      )}
    </AnimatePresence>
    </>
  );
}
