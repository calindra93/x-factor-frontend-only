import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Music, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function SongSelector({
  songs,
  currentTracklist,
  onSelectSong,
  onClose,
  disabledSongs = new Map()
}) {
  const [selected, setSelected] = useState(new Set(currentTracklist));

  const toggleSong = (songId) => {
    const newSelected = new Set(selected);
    if (newSelected.has(songId)) {
      newSelected.delete(songId);
    } else {
      newSelected.add(songId);
    }
    setSelected(newSelected);
  };

  const handleSave = () => {
    onSelectSong(Array.from(selected));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-4"
    >
      <h4 className="text-white font-medium text-sm mb-3">Select Songs</h4>
      
      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar mb-4">
        {songs.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">No songs available</p>
        ) : (
          songs.map((song) => {
            const isWaitingCollab = song.status === "waiting_on_collab";
            const isDisabled = isWaitingCollab || (disabledSongs.has(song.id) && !selected.has(song.id));
            const disabledReason = isWaitingCollab ? "Waiting on feature response" : disabledSongs.get(song.id);
            return (
              <button
                key={song.id}
                onClick={() => toggleSong(song.id)}
                disabled={isDisabled}
                className={`w-full bg-white/[0.03] border rounded-lg p-3 flex items-center gap-3 transition-all ${
                  selected.has(song.id)
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-white/[0.06] hover:bg-white/[0.05]"
                } ${isDisabled ? "opacity-50 cursor-not-allowed hover:bg-white/[0.03]" : ""}`}
              >
              <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {song.cover_artwork_url ? (
                  <img src={song.cover_artwork_url} alt={song.title} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-4 h-4 text-gray-500" />
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-white text-sm font-medium truncate">{song.title}</p>
                <p className="text-gray-500 text-xs">
                  {song.status === "recorded" ? "Recorded" : song.status === "waiting_on_collab" ? "Pending Feature" : "Unrecorded"}
                  {song.quality > 0 && ` • Quality: ${song.quality}`}
                  {disabledReason && ` • ${disabledReason}`}
                </p>
              </div>
              {selected.has(song.id) && (
                <CheckCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
            </button>
          );
          })
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-9"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg h-9"
        >
          Done
        </Button>
      </div>
    </motion.div>
  );
}
