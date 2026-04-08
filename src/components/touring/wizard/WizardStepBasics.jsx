import React, { useEffect, useMemo, useState } from "react";
import {
  VENUE_SIZE_OPTIONS,
  computeMinLeadTime,
  getAllowedVenueSizes,
  getDisabledVenueReason,
  resolveSetlistPresetName,
  SETLIST_UNSAVED_PRESET_VALUE,
} from "@/lib/tourWizardModel";
import { loadSetlistPresets } from "@/lib/setlistPresets";
import SetlistPicker from "./SetlistPicker";

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: "#6b7280" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WizardStepBasics({
  wizardPlan,
  setWizardPlan,
  categories = [],
  songs = [],
  profile,
  routeBuilderDraft,
  dataLoading,
}) {
  const [setlistPresets, setSetlistPresets] = useState(() => loadSetlistPresets());
  const [showSetlistEditor, setShowSetlistEditor] = useState(false);

  const allowedVenues = useMemo(
    () => getAllowedVenueSizes(wizardPlan.category?.id),
    [wizardPlan.category?.id]
  );

  const selectedPresetLabel = useMemo(() => {
    if (wizardPlan.setlistPresetName === SETLIST_UNSAVED_PRESET_VALUE) {
      return "Custom Setlist";
    }
    return wizardPlan.setlistPresetName || "Choose a saved setlist";
  }, [wizardPlan.setlistPresetName]);

  // Start date min lead time
  const minLead = useMemo(
    () =>
      computeMinLeadTime(
        routeBuilderDraft?.stopCount || 0,
        wizardPlan.venueSize
      ),
    [routeBuilderDraft?.stopCount, wizardPlan.venueSize]
  );

  const startDateMarkers = useMemo(() => {
    const markers = [];
    for (let turn = minLead; turn <= Math.min(30, minLead + 6); turn += 1) {
      markers.push(turn);
    }
    if (!markers.includes(wizardPlan.startDateOffset)) {
      markers.push(wizardPlan.startDateOffset);
    }
    if (!markers.includes(30)) {
      markers.push(30);
    }
    return Array.from(new Set(markers)).sort((a, b) => a - b);
  }, [minLead, wizardPlan.startDateOffset]);

  useEffect(() => {
    if (wizardPlan.startDateOffset < minLead) {
      setWizardPlan((p) => ({ ...p, startDateOffset: minLead }));
    }
  }, [minLead, wizardPlan.startDateOffset, setWizardPlan]);

  useEffect(() => {
    if (!wizardPlan.category || !wizardPlan.venueSize) return;
    if (!allowedVenues.includes(wizardPlan.venueSize)) {
      setWizardPlan((p) => ({ ...p, venueSize: null }));
    }
  }, [allowedVenues, wizardPlan.category, wizardPlan.venueSize, setWizardPlan]);

  useEffect(() => {
    const resolvedName = resolveSetlistPresetName(
      wizardPlan.selectedSongs,
      setlistPresets
    );

    if (wizardPlan.selectedSongs.length === 0) {
      if (wizardPlan.setlistPresetName !== null) {
        setWizardPlan((p) => ({ ...p, setlistPresetName: null }));
      }
      return;
    }

    const nextPresetName = resolvedName || SETLIST_UNSAVED_PRESET_VALUE;
    if (wizardPlan.setlistPresetName !== nextPresetName) {
      setWizardPlan((p) => ({ ...p, setlistPresetName: nextPresetName }));
    }
  }, [setWizardPlan, setlistPresets, wizardPlan.selectedSongs, wizardPlan.setlistPresetName]);

  const handleCategoryChange = (cat) => {
    const nextAllowedVenues = getAllowedVenueSizes(cat.id);
    setWizardPlan((p) => ({
      ...p,
      category: cat,
      venueSize: nextAllowedVenues.includes(p.venueSize) ? p.venueSize : null,
    }));
  };

  const handleCategorySelect = (categoryId) => {
    const nextCategory = categories.find((cat) => cat.id === categoryId);
    if (!nextCategory) return;
    handleCategoryChange(nextCategory);
  };

  const handleVenueSelect = (venueId) => {
    if (!venueId) {
      setWizardPlan((p) => ({ ...p, venueSize: null }));
      return;
    }
    if (!allowedVenues.includes(venueId)) return;
    setWizardPlan((p) => ({ ...p, venueSize: venueId }));
  };

  const handleStartDateInput = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(minLead, Math.min(30, parsed));
    setWizardPlan((p) => ({
      ...p,
      startDateOffset: clamped,
    }));
  };

  const handleToggleSong = (songId) => {
    setWizardPlan((p) => ({
      ...p,
      selectedSongs: p.selectedSongs.includes(songId)
        ? p.selectedSongs.filter((id) => id !== songId)
        : [...p.selectedSongs, songId],
      setlistPresetName: SETLIST_UNSAVED_PRESET_VALUE,
    }));
  };

  const handlePresetSelect = (presetName) => {
    if (!presetName) return;
    const preset = setlistPresets.find((entry) => entry.name === presetName);
    if (!preset) return;

    setWizardPlan((p) => ({
      ...p,
      selectedSongs: [...(preset.songIds || [])],
      setlistPresetName: preset.name,
    }));
    setShowSetlistEditor(false);
  };

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── 1. Tour Name ── */}
      <Section title="Tour Name">
        <input
          type="text"
          value={wizardPlan.tourName}
          onChange={(e) =>
            setWizardPlan((p) => ({ ...p, tourName: e.target.value }))
          }
          placeholder="Name your tour..."
          maxLength={100}
          className="w-full px-4 py-3 rounded-2xl text-sm font-bold text-white placeholder-gray-600 outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: wizardPlan.tourName.trim()
              ? "1px solid rgba(139,92,246,0.4)"
              : "1px solid rgba(255,255,255,0.08)",
          }}
        />
      </Section>

      {/* ── 2. Tour Category ── */}
      <Section title="Tour Category">
        <div className="space-y-3 rounded-2xl px-4 py-4" style={{ background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)" }}>
          <div className="grid grid-cols-1 lg:grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#94a3b8" }}>
              Tour Category:
            </span>
            <select
              value={wizardPlan.category?.id || ""}
              onChange={(e) => handleCategorySelect(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm font-bold text-white outline-none"
              style={{
                background: "rgba(2,6,23,0.92)",
                border: "1px solid rgba(148,163,184,0.18)",
                color: "#f8fafc",
              }}
            >
              <option value="">Choose a tour category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {wizardPlan.category && (
            <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "#cbd5e1" }}>
              {(wizardPlan.category.risk_level === "high" || wizardPlan.category.risk_level === "extreme") && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full"
                  style={{
                    color: wizardPlan.category.risk_level === "extreme" ? "#ef4444" : "#fbbf24",
                    background: wizardPlan.category.risk_level === "extreme"
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(251,191,36,0.15)",
                  }}
                >
                  {wizardPlan.category.risk_level}
                </span>
              )}
              {wizardPlan.category.cost_multiplier && wizardPlan.category.cost_multiplier !== 1 && (
                <span style={{ color: "#94a3b8" }}>Cost: {wizardPlan.category.cost_multiplier}x</span>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── 3. Venue Size ── */}
      <Section title="Venue Size">
        <div className="space-y-3 rounded-2xl px-4 py-4" style={{ background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)" }}>
          <div className="grid grid-cols-1 lg:grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#94a3b8" }}>
              Venue Size:
            </span>
            <select
              value={wizardPlan.venueSize || ""}
              onChange={(e) => handleVenueSelect(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm font-bold text-white outline-none"
              style={{
                background: "rgba(2,6,23,0.92)",
                border: "1px solid rgba(148,163,184,0.18)",
                color: "#f8fafc",
              }}
            >
              <option value="">Choose a venue size</option>
              {VENUE_SIZE_OPTIONS.map((venue) => {
                const isAllowed = allowedVenues.includes(venue.id);
                const disabledReason = getDisabledVenueReason(
                  wizardPlan.category?.id,
                  venue.id
                );
                return (
                  <option key={venue.id} value={venue.id} disabled={!isAllowed}>
                    {venue.label}{!isAllowed && disabledReason ? ` — ${disabledReason}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </Section>

      {/* ── 4. Start Date ── */}
      {wizardPlan.venueSize && (
        <Section title="Start Date">
          <div
            className="rounded-2xl px-4 py-4 space-y-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  Launching in <span style={{ color: "#a78bfa" }}>{wizardPlan.startDateOffset} turns</span>
                </p>
                <p className="text-[11px] mt-1 text-gray-500">
                  Planning shell maps to turn offsets behind the scenes.
                </p>
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min={minLead}
                  max={30}
                  value={wizardPlan.startDateOffset}
                  onChange={(e) => handleStartDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm font-bold text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {startDateMarkers.map((turn) => {
                const isSelected = wizardPlan.startDateOffset === turn;
                const isMinimum = turn === minLead;
                return (
                  <button
                    key={turn}
                    type="button"
                    onClick={() => handleStartDateInput(turn)}
                    className="rounded-xl px-3 py-2 text-left transition-all"
                    style={{
                      background: isSelected
                        ? "rgba(139,92,246,0.14)"
                        : "rgba(255,255,255,0.03)",
                      border: isSelected
                        ? "1px solid rgba(139,92,246,0.4)"
                        : isMinimum
                          ? "1px solid rgba(96,165,250,0.28)"
                          : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: isSelected ? "#c4b5fd" : "#d1d5db" }}>
                      Turn {turn}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: isMinimum ? "#93c5fd" : "#6b7280" }}>
                      {isMinimum ? "Earliest viable" : turn === 30 ? "Longest runway" : "Planning window"}
                    </p>
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              min={minLead}
              max={30}
              step={1}
              value={wizardPlan.startDateOffset}
              onChange={(e) => handleStartDateInput(e.target.value)}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Earliest: {minLead}</span>
              <span>Latest: 30</span>
            </div>
          </div>
        </Section>
      )}

      {/* ── 5. Setlist ── */}
      <Section title="Setlist">
        <div className="space-y-3 rounded-2xl px-4 py-4" style={{ background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)" }}>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest" style={{ color: "#94a3b8" }}>
                Saved Setlist
              </label>
              <select
                value={wizardPlan.setlistPresetName && wizardPlan.setlistPresetName !== SETLIST_UNSAVED_PRESET_VALUE ? wizardPlan.setlistPresetName : ""}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm font-bold text-white outline-none"
                style={{
                  background: "rgba(2,6,23,0.92)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  color: "#f8fafc",
                }}
              >
                <option value="">Choose a saved setlist</option>
                {setlistPresets.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowSetlistEditor((prev) => !prev)}
              className="px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
              style={{
                background: showSetlistEditor ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.10)",
                border: "1px solid rgba(139,92,246,0.24)",
                color: "#c4b5fd",
              }}
            >
              {showSetlistEditor ? "Hide Setlist Editor" : "Create Setlist"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "#94a3b8" }}>
            <span>
              Setlist Mode: <span style={{ color: "#e2e8f0" }}>{selectedPresetLabel}</span>
            </span>
            <span>
              {wizardPlan.selectedSongs.length} song{wizardPlan.selectedSongs.length === 1 ? "" : "s"} selected
            </span>
          </div>

          {showSetlistEditor && (
            <div className="pt-2">
              <SetlistPicker
                songs={songs}
                selectedSongs={wizardPlan.selectedSongs}
                onToggleSong={handleToggleSong}
                profile={profile}
                mode="embedded"
                onPresetsChange={setSetlistPresets}
                onLoadPreset={(preset) =>
                  setWizardPlan((p) => ({
                    ...p,
                    setlistPresetName: preset.name,
                  }))
                }
                onSavePreset={(preset) =>
                  setWizardPlan((p) => ({
                    ...p,
                    setlistPresetName: preset.name,
                  }))
                }
              />
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
