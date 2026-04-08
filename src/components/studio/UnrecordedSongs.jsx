import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Music, Mic, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";

export default function UnrecordedSongs({ songs, onRecord, isRecording, recordingSongId, onRefresh }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (song) => {
    if (deleting) return;
    setDeleting(song.id);
    try {
      await base44.entities.Song.delete(song.id);
      showToast(`"${song.title}" deleted`, "success");
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error("[UnrecordedSongs] Delete failed:", e);
      showToast("Failed to delete song", "error");
    } finally {
      setDeleting(null);
    }
  };
  if (!songs || songs.length === 0) {
    return (
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-6 text-center">
        <Music className="w-10 h-10 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No unrecorded songs yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {songs.map((song) => {
        const minutesValue = Number(song.length_minutes);
        const secondsValue = Number(song.length_seconds);
        const minutes = Number.isFinite(minutesValue) ? minutesValue : 0;
        const seconds = Number.isFinite(secondsValue) ? secondsValue : 0;
        const formattedSeconds = String(seconds).padStart(2, "0");

        return (
          <div
            key={song.id}
            className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-2 flex items-center gap-2"
          >
            <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {song.cover_artwork_url ? (
                <img src={song.cover_artwork_url} alt={song.title} className="w-full h-full object-cover" />
              ) : (
                <Music className="w-3 h-3 text-gray-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white text-[11px] font-medium truncate">{song.title}</h4>
              <p className="text-gray-600 text-[9px]">
                {song.genre} · {minutes}:{formattedSeconds}{song.quality > 0 && ` · Q:${song.quality}`}
              </p>
            </div>
            <button
              onClick={() => handleDelete(song)}
              disabled={!!deleting}
              className="w-6 h-6 rounded flex items-center justify-center bg-white/5 hover:bg-red-500/20 border border-white/[0.06] transition-colors disabled:opacity-30"
              title="Delete song"
            >
              <Trash2 className="w-2.5 h-2.5 text-gray-500 hover:text-red-400" />
            </button>
            <Button
              size="sm"
              onClick={() => onRecord(song)}
              disabled={isRecording}
              className="bg-red-600 hover:bg-red-500 text-white rounded h-6 px-2 text-[10px]"
            >
              <Mic className="w-2.5 h-2.5 mr-1" />
              {recordingSongId === song.id ? "..." : "Record"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
