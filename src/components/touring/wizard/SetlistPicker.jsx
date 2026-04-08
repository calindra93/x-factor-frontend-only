import React, { useState, useMemo } from "react";
import { Check, Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import {
  loadSetlistPresets,
  saveSetlistPreset,
  deleteSetlistPreset,
  buildNamedSetlistPreset,
} from "@/lib/setlistPresets";

// ─── Song Status Badge ───────────────────────────────────────────────────────

function getSongStatusBadge(song) {
  if (song.lifecycle_state === "hot" || song.lifecycle_state === "viral")
    return { label: "VIRAL", color: "#f472b6" };
  if (song.lifecycle_state === "rising")
    return { label: "HOT", color: "#fbbf24" };
  if (song.lifecycle_state === "cold" || song.lifecycle_state === "catalog")
    return { label: "COLD", color: "#6b7280" };
  if (!song.release_status || song.release_status === "unreleased")
    return { label: "UNRELEASED", color: "#60a5fa" };
  return null;
}

// ─── Sort helper ─────────────────────────────────────────────────────────────

function sortSongs(songs) {
  const priority = { viral: 0, hot: 1, rising: 2 };
  return [...songs].sort((a, b) => {
    const aDate = new Date(
      a.release_date || a.released_at || a.published_at || a.created_at || 0
    ).getTime();
    const bDate = new Date(
      b.release_date || b.released_at || b.published_at || b.created_at || 0
    ).getTime();
    if (aDate !== bDate) return bDate - aDate;

    const pa = priority[a.lifecycle_state] ?? 10;
    const pb = priority[b.lifecycle_state] ?? 10;
    if (pa !== pb) return pa - pb;

    return (b.streams || 0) - (a.streams || 0);
  });
}

// ─── Setlist Power Score ─────────────────────────────────────────────────────

function computeSetlistPower(selectedSongs, songs) {
  if (selectedSongs.length === 0) return 0;
  return Math.round(
    selectedSongs.reduce((sum, id) => {
      const s = songs.find((x) => x.id === id);
      return sum + ((s?.quality || 50) + (s?.streams || 0) / 20000) / 2;
    }, 0) / Math.max(1, selectedSongs.length)
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SetlistPicker({
  songs = [],
  selectedSongs = [],
  onToggleSong,
  profile: _profile,
  mode = "full",
  onPresetsChange,
  onLoadPreset,
  onSavePreset,
  hidePresetLibrary = false,
}) {
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState(() => loadSetlistPresets());
  const compactMode = mode === "embedded";

  const sorted = useMemo(() => sortSongs(songs), [songs]);
  const power = useMemo(
    () => computeSetlistPower(selectedSongs, songs),
    [selectedSongs, songs]
  );

  // ── Preset actions ──

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name || selectedSongs.length === 0) return;
    const preset = buildNamedSetlistPreset(name, selectedSongs);
    saveSetlistPreset(preset);
    const nextPresets = loadSetlistPresets();
    setPresets(nextPresets);
    setPresetName("");
    onPresetsChange?.(nextPresets);
    onSavePreset?.(preset, nextPresets);
  }

  function handleDeletePreset(name) {
    deleteSetlistPreset(name);
    const nextPresets = loadSetlistPresets();
    setPresets(nextPresets);
    onPresetsChange?.(nextPresets);
  }

  function handleLoadPreset(preset) {
    if (!onToggleSong) return;
    // Clear current, then select preset songs
    const currentSet = new Set(selectedSongs);
    const presetSet = new Set(preset.songIds);

    // Remove songs not in preset
    for (const id of currentSet) {
      if (!presetSet.has(id)) onToggleSong(id);
    }
    // Add songs in preset not already selected
    for (const id of presetSet) {
      if (!currentSet.has(id)) onToggleSong(id);
    }
    setShowPresets(false);
    onLoadPreset?.(preset);
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden ${compactMode ? "border" : ""}`}
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(139,92,246,0.06)" }}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Setlist
        </span>
        <span
          className="text-xs font-black"
          style={{ color: "#a78bfa" }}
        >
          Power: {power}
        </span>
      </div>

      {/* Song list */}
      <div className={`${compactMode ? "max-h-72" : "max-h-64"} overflow-y-auto`}>
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-600">
            No songs available
          </p>
        )}
        {sorted.map((song) => {
          const isSelected = selectedSongs.includes(song.id);
          const badge = getSongStatusBadge(song);
          return (
            <button
              key={song.id}
              type="button"
              onClick={() => onToggleSong?.(song.id)}
              className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
              style={{
                background: isSelected
                  ? "rgba(139,92,246,0.10)"
                  : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Checkbox */}
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{
                  background: isSelected ? "#8b5cf6" : "rgba(255,255,255,0.08)",
                  border: isSelected
                    ? "none"
                    : "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {isSelected && <Check size={10} className="text-white" />}
              </div>

              {/* Song info */}
              <div className="flex-1 text-left min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: isSelected ? "#e9d5ff" : "#d1d5db" }}
                >
                  {song.title}
                </p>
              </div>

              {/* Badge */}
              {badge && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    color: badge.color,
                    background: `${badge.color}18`,
                  }}
                >
                  {badge.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Preset controls */}
      <div
        className="px-4 py-3 space-y-2"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Save preset row */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name..."
            maxLength={40}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-600 outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetName.trim() || selectedSongs.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-30"
            style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}
          >
            Save
          </button>
        </div>

        {/* Load preset toggle */}
        {!hidePresetLibrary && (
          <button
            type="button"
            onClick={() => setShowPresets((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
            style={{ color: showPresets ? "#a78bfa" : "#6b7280" }}
          >
            {showPresets ? (
              <BookmarkCheck size={12} />
            ) : (
              <Bookmark size={12} />
            )}
            {showPresets ? "Hide Presets" : "Load Preset"}
          </button>
        )}

        {/* Preset list */}
        {!hidePresetLibrary && showPresets && (
          <div className="space-y-1 pt-1">
            {presets.length === 0 && (
              <p className="text-[10px] text-gray-600">No saved presets</p>
            )}
            {presets.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <button
                  type="button"
                  onClick={() => handleLoadPreset(p)}
                  className="flex-1 text-left text-xs font-semibold text-gray-300 truncate hover:text-white transition-colors"
                >
                  {p.name}
                  <span className="ml-2 text-gray-600">
                    ({p.songIds.length} songs)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(p.name)}
                  className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
