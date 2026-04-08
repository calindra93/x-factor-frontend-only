import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  Globe, ChevronRight, Loader2, Camera, Music2, Flame,
  Users, MapPin, Star, Sparkles, Plus,
} from "lucide-react";

const formatCompact = (value) => {
  const n = Number(value || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const CLOUT_TIERS = [
  { min: 90, label: "ICON",       color: "#f59e0b" },
  { min: 75, label: "SUPERSTAR",  color: "#c084fc" },
  { min: 60, label: "STAR",       color: "#60a5fa" },
  { min: 45, label: "RISING",     color: "#34d399" },
  { min: 25, label: "INDIE",      color: "#94a3b8" },
  { min: 0,  label: "ROOKIE",     color: "#64748b" },
];

function getCloutTier(clout = 0) {
  return CLOUT_TIERS.find(t => clout >= t.min) || CLOUT_TIERS[CLOUT_TIERS.length - 1];
}

const STAGE_SHORTHAND = {
  "Underground":  "UNDERGROUND",
  "Local Act":    "LOCAL ACT",
  "Indie Darling":"INDIE",
  "Rising Star":  "RISING",
  "Mainstream":   "MAINSTREAM",
  "Superstar":    "SUPERSTAR",
  "Legend":       "LEGEND",
};

const PHASE_TONE = {
  TEASE:   { color: "#67e8f9", border: "#67e8f940", bg: "rgba(103,232,249,0.12)", label: "TEASE" },
  DROP:    { color: "#f472b6", border: "#f472b640", bg: "rgba(244,114,182,0.14)", label: "DROP" },
  SUSTAIN: { color: "#c084fc", border: "#c084fc40", bg: "rgba(192,132,252,0.14)", label: "SUSTAIN" },
  FADE:    { color: "#f59e0b", border: "#f59e0b40", bg: "rgba(245,158,11,0.14)", label: "FADE" },
};

export default function ArtistCard({ currentEra, profile, onNavigate, onEraUpdated, streak = 0 }) {
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  if (!profile) return null;

  const hasActiveEra = Boolean(currentEra?.is_active);
  const themeColor = currentEra?.theme_color || "#a78bfa";

  // Identity data
  const artistName = profile?.artist_name || "Artist";
  const fanCount = formatCompact(profile?.fans ?? profile?.followers ?? 0);
  const clout = Number(profile?.clout || 0);
  const cloutTier = getCloutTier(clout);
  const region = profile?.region || profile?.home_region || null;
  const careerStage = STAGE_SHORTHAND[profile?.career_stage] || (profile?.career_stage?.toUpperCase() || "INDIE");

  // Era data
  const eraImage = currentEra?.era_image || profile?.artist_image;
  const phaseKey = currentEra?.phase || null;
  const phase = phaseKey ? (PHASE_TONE[phaseKey] || { color: themeColor, border: `${themeColor}40`, bg: `${themeColor}18`, label: phaseKey }) : null;

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !currentEra?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `era-images/${currentEra.id}-${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabaseClient.storage
        .from("uploads")
        .upload(fileName, file, { upsert: true, contentType: file.type });
      if (uploadErr) { console.error("[Era] Image upload error:", uploadErr); return; }
      const { data: urlData } = supabaseClient.storage.from("uploads").getPublicUrl(uploadData.path);
      await base44.entities.Era.update(currentEra.id, { era_image: urlData.publicUrl });
      onEraUpdated?.({ ...currentEra, era_image: urlData.publicUrl });
    } catch (error) {
      console.error("[Era] Image upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
      style={{
        padding: "1px",
        background: `linear-gradient(145deg, ${themeColor}60, #ec489940, ${themeColor}25, transparent 70%)`,
      }}
      onClick={() => onNavigate?.("/EraManagementApp")}
    >
      {/* Card body */}
      <div
        className="relative rounded-[15px] overflow-hidden"
        style={{ background: "linear-gradient(155deg, #110a20 0%, #0c0818 40%, #0a0a0f 100%)" }}
      >
        {/* Ambient glow orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-10 -right-6 w-44 h-44 rounded-full blur-3xl opacity-[0.15]" style={{ background: themeColor }} />
          <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full blur-3xl opacity-[0.07]" style={{ background: "#ec4899" }} />
        </div>

        <div className="relative flex flex-col">

          {/* ── ZONE 1: Artist Identity (always visible) ───────────── */}
          <div className="px-4 pt-4 pb-3">
            {/* Artist name row */}
            <div className="flex items-center justify-between gap-3 mb-3">
              {/* Avatar */}
              <div
                className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center text-3xl font-black"
                style={{
                  background: profile?.artist_image ? "transparent" : `linear-gradient(135deg, ${themeColor}50, ${themeColor}20)`,
                  border: `2px solid ${themeColor}40`,
                  boxShadow: `0 0 20px ${themeColor}35`,
                }}
              >
                {profile?.artist_image ? (
                  <img
                    src={profile.artist_image}
                    className="w-full h-full object-cover"
                    alt={artistName}
                    onError={e => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <span style={{ color: themeColor }}>{artistName.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Name + eyebrow */}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] mb-0.5" style={{ color: `${themeColor}90` }}>
                  Artist Profile
                </p>
                <h2
                  className="font-black text-white leading-none truncate"
                  style={{ fontSize: "20px", letterSpacing: "-0.025em", textShadow: `0 0 24px ${themeColor}45` }}
                >
                  {artistName}
                </h2>
              </div>

              {/* Stage badge */}
              <span
                className="shrink-0 text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: `${themeColor}20`, border: `1px solid ${themeColor}35`, color: themeColor }}
              >
                {careerStage}
              </span>
            </div>

            {/* Stats chips row */}
            <div className="flex items-center gap-2">
              {/* Fans */}
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 flex-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <Users size={10} className="text-white/40 shrink-0" />
                <div>
                  <p className="text-[7px] font-black uppercase tracking-wider text-white/30 leading-none mb-0.5">Fans</p>
                  <p className="text-[12px] font-black text-white leading-none">{fanCount}</p>
                </div>
              </div>

              {/* Clout tier */}
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 flex-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <Star size={10} style={{ color: cloutTier.color }} className="shrink-0" />
                <div>
                  <p className="text-[7px] font-black uppercase tracking-wider text-white/30 leading-none mb-0.5">Clout</p>
                  <p className="text-[12px] font-black leading-none" style={{ color: cloutTier.color }}>{cloutTier.label}</p>
                </div>
              </div>

              {/* Region */}
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 flex-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <MapPin size={10} className="text-cyan-400/70 shrink-0" />
                <div>
                  <p className="text-[7px] font-black uppercase tracking-wider text-white/30 leading-none mb-0.5">Region</p>
                  <p className="text-[11px] font-black text-white leading-none truncate max-w-[56px]">
                    {region ? region.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "—"}
                  </p>
                </div>
              </div>

              {/* Touring shortcut button */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onNavigate?.("/TouringAppV2"); }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border text-white transition-all hover:scale-105 shrink-0"
                style={{ borderColor: `${themeColor}30`, background: `${themeColor}12` }}
                title="Touring"
                aria-label="Open Touring"
              >
                <Globe className="h-4 w-4 text-cyan-300" />
              </button>
            </div>
          </div>

          {/* Divider with era label */}
          <div className="flex items-center gap-2 px-4 mb-0" style={{ borderTop: `1px solid rgba(255,255,255,0.05)` }}>
            <div className="flex items-center gap-1.5 py-2">
              <Sparkles size={9} style={{ color: `${themeColor}80` }} />
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">
                {hasActiveEra ? "Active Era" : "Era"}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>

          {/* ── ZONE 2: Era strip ───────────────────────────────── */}
          {hasActiveEra ? (
            <div className="relative group">
              {/* Era hero image */}
              <div className="relative w-full h-32 overflow-hidden bg-white/[0.02]">
                {eraImage ? (
                  <img
                    src={eraImage}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={e => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: `linear-gradient(145deg, ${themeColor}22, #ec489910, #0a0a0f)` }}
                  />
                )}

                {/* Gradient overlays */}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,15,0.35) 0%, rgba(10,10,15,0) 40%, rgba(10,10,15,0.92) 100%)" }} />
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${themeColor}14 0%, transparent 55%)` }} />

                {/* Phase badge + streak — top row */}
                <div className="absolute top-2.5 left-3 right-3 flex items-start justify-between">
                  {phase && (
                    <span
                      className="text-[8px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border font-black backdrop-blur-md"
                      style={{ color: phase.color, borderColor: phase.border, background: phase.bg }}
                    >
                      {phase.label}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {streak > 1 && (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-md"
                        style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(249,115,22,0.3)" }}
                      >
                        <Flame size={8} className="text-orange-400" />
                        <span className="text-[8px] font-black text-orange-300">{streak}</span>
                      </div>
                    )}
                    {/* Camera upload */}
                    <button
                      onClick={e => { e.stopPropagation(); imageInputRef.current?.click(); }}
                      className="w-6 h-6 rounded-full bg-black/60 border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                      title="Upload era image"
                      aria-label="Upload era image"
                    >
                      {uploading ? <Loader2 size={10} className="text-white animate-spin" /> : <Camera size={10} className="text-white" />}
                    </button>
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} onClick={e => e.stopPropagation()} />
                  </div>
                </div>

                {/* Era name + signature — bottom overlay */}
                <div className="absolute bottom-2.5 left-3 right-3">
                  <p
                    className="font-black text-white leading-none"
                    style={{ fontSize: "17px", letterSpacing: "-0.025em", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}
                  >
                    {currentEra.era_name?.toUpperCase() || "UNTITLED ERA"}
                  </p>
                  {currentEra.signature && (
                    <p className="text-[9px] mt-1 text-white/60 font-medium">✦ {currentEra.signature}</p>
                  )}
                </div>
              </div>

              {/* Aesthetic tags */}
              {currentEra.aesthetic_tags?.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto hide-scrollbar">
                  {currentEra.aesthetic_tags.slice(0, 5).map(tag => (
                    <span
                      key={tag}
                      className="shrink-0 text-[8px] font-bold px-2 py-0.5 rounded-full text-white/75"
                      style={{ background: `${themeColor}28`, border: `1px solid ${themeColor}20` }}
                    >
                      {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    </span>
                  ))}
                  {currentEra.aesthetic_tags.length > 5 && (
                    <span className="shrink-0 text-white/20 text-[8px]">+{currentEra.aesthetic_tags.length - 5}</span>
                  )}
                </div>
              )}

              {/* Footer */}
              <div
                className="flex items-center justify-between px-3 py-2 border-t"
                style={{ borderColor: "rgba(255,255,255,0.04)" }}
              >
                <span className="text-[8px] text-white/20 font-medium">Tap to manage era</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/15" />
              </div>
            </div>
          ) : (
            /* No active era state */
            <div
              className="mx-3 mb-3 rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
            >
              <div className="flex flex-col items-center gap-2.5 px-4 py-5">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: `${themeColor}18`, border: `1px solid ${themeColor}25` }}
                >
                  <Music2 size={18} style={{ color: `${themeColor}60` }} />
                </div>
                <div className="text-center">
                  <p className="font-bold text-white/40 text-sm leading-tight">No Active Era</p>
                  <p className="text-[10px] text-white/20 mt-0.5">Declare an era to unlock multipliers</p>
                </div>
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black"
                  style={{ background: `${themeColor}22`, border: `1px solid ${themeColor}35`, color: themeColor }}
                >
                  <Plus size={9} />
                  Declare Era
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
