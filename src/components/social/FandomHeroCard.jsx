import React from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Sparkles, Users, AlertTriangle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { createPageUrl } from "@/components/utils";

const N = (v) => Number(v) || 0;
const fmtK = (n) => {
  const v = N(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

const SEGMENT_CONFIG = {
  og:           { label: "OGs",           emoji: "\ud83d\udc51", color: "#C9A84C", glow: "rgba(201,168,76,.35)" },
  stan:         { label: "Stans",         emoji: "\ud83d\udc9c", color: "#E87DCC", glow: "rgba(232,125,204,.35)" },
  core:         { label: "Core",          emoji: "\ud83d\udd25", color: "#7C6EF7", glow: "rgba(124,110,247,.35)" },
  casual:       { label: "Casual",        emoji: "\ud83c\udfa7", color: "#4B9EF7", glow: "rgba(75,158,247,.35)" },
  trend_chaser: { label: "Trend Chasers", emoji: "\u26a1",       color: "#F7A54B", glow: "rgba(247,165,75,.35)" },
  critic:       { label: "Critics",       emoji: "\ud83d\udcc9", color: "#EF5350", glow: "rgba(239,83,80,.35)" },
};

function GaugeBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 900, color, letterSpacing: -0.3 }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 99, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${color}99, ${color})` }}
        />
      </div>
    </div>
  );
}

function SegmentBar({ segments }) {
  const total = segments.reduce((s, seg) => s + N(seg.count), 0);
  if (total <= 0) return null;

  const sorted = [...segments]
    .map(seg => ({ ...seg, cfg: SEGMENT_CONFIG[seg.segment_type] }))
    .filter(seg => seg.cfg && N(seg.count) > 0)
    .sort((a, b) => N(b.count) - N(a.count));

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 1.5, marginBottom: 8 }}>
        {sorted.map(seg => {
          const pct = (N(seg.count) / total) * 100;
          return (
            <motion.div
              key={seg.segment_type}
              initial={{ flex: 0 }}
              animate={{ flex: Math.max(pct, 0.5) }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ background: seg.cfg.color, borderRadius: 99, opacity: 0.85, minWidth: 3 }}
              title={`${seg.cfg.label}: ${fmtK(seg.count)} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sorted.slice(0, 4).map(seg => {
          const pct = Math.round((N(seg.count) / total) * 100);
          return (
            <div key={seg.segment_type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 99, background: seg.cfg.color, boxShadow: `0 0 6px ${seg.cfg.glow}` }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>
                {seg.cfg.emoji} {seg.cfg.label} <strong style={{ color: seg.cfg.color }}>{pct}%</strong>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FandomHeroCard({ fandomData, fandomSegments = [], profile, variant = "compact" }) {
  const navigate = useNavigate();
  const hasFandom = !!fandomData;
  const isExpanded = variant === "full";

  const goToFandom = () => navigate(createPageUrl("FandomApp"));

  // ── No fandom — Create CTA ──
  if (!hasFandom) {
    return (
      <motion.button
        onClick={goToFandom}
        whileTap={{ scale: 0.97 }}
        className="fandom-hero-create"
        style={{
          width: "100%",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #1a1030 0%, #0f0a1e 50%, #1a0f2e 100%)",
          border: "1px solid rgba(139,92,246,.25)",
          borderRadius: 22,
          padding: isExpanded ? "32px 24px" : "22px 18px",
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          color: "#fff",
        }}
      >
        {/* Animated glow orbs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: 22 }}>
          <motion.div
            animate={{ x: [0, 30, -20, 0], y: [0, -15, 10, 0], scale: [1, 1.2, 0.9, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: -30, right: -20, width: 120, height: 120, background: "radial-gradient(circle, rgba(139,92,246,.2) 0%, transparent 70%)" }}
          />
          <motion.div
            animate={{ x: [0, -20, 15, 0], y: [0, 10, -20, 0], scale: [1, 0.8, 1.1, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", bottom: -20, left: -10, width: 100, height: 100, background: "radial-gradient(circle, rgba(236,72,153,.15) 0%, transparent 70%)" }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{ fontSize: isExpanded ? 40 : 32, marginBottom: isExpanded ? 14 : 10 }}
          >
            <Crown size={isExpanded ? 40 : 32} color="#a78bfa" />
          </motion.div>

          <div style={{ fontSize: isExpanded ? 20 : 17, fontWeight: 900, letterSpacing: -0.5, marginBottom: 6 }}>
            Build Your Fandom
          </div>
          <div style={{ fontSize: isExpanded ? 12 : 11, color: "rgba(255,255,255,.4)", lineHeight: 1.5, maxWidth: 260, margin: "0 auto", marginBottom: isExpanded ? 18 : 14 }}>
            Name your fanbase, set your identity pillars, and watch your community evolve.
          </div>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "linear-gradient(135deg, rgba(139,92,246,.3), rgba(236,72,153,.2))",
            border: "1px solid rgba(139,92,246,.4)",
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 12,
            fontWeight: 700,
            color: "#c4b5fd",
            letterSpacing: 0.3,
          }}>
            <Sparkles size={14} /> Create Fandom <ChevronRight size={14} />
          </div>
        </div>
      </motion.button>
    );
  }

  // ── Has fandom — Snapshot card ──
  const morale = N(fandomData.fan_morale) || 50;
  const trust = N(fandomData.brand_trust) || 50;
  const tox = N(fandomData.toxicity_score);
  const name = fandomData.fanbase_name;
  const hasControversy = fandomData.controversy_shadow;
  const controversyTicks = N(fandomData.controversy_shadow_ticks_remaining);
  const segmentTotal = fandomSegments.reduce((s, seg) => s + N(seg.count), 0);
  const profileFans = N(profile?.fans) || N(profile?.followers);
  const totalFans = Math.max(segmentTotal, profileFans);

  const moraleColor = morale >= 70 ? "#4ade80" : morale >= 40 ? "#fbbf24" : "#f87171";
  const trustColor = trust >= 70 ? "#4ade80" : trust >= 40 ? "#fbbf24" : "#f87171";
  const toxColor = tox <= 20 ? "#4ade80" : tox <= 50 ? "#fbbf24" : "#f87171";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="fandom-hero-card"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #16102a 0%, #1a1030 40%, #130e22 100%)",
        border: "1px solid rgba(139,92,246,.18)",
        borderRadius: 22,
        padding: isExpanded ? "20px 20px 18px" : "16px 16px 14px",
        fontFamily: "Inter, sans-serif",
        color: "#fff",
      }}
    >
      {/* Ambient glow */}
      <div style={{ position: "absolute", top: -40, right: -30, width: 160, height: 160, background: "radial-gradient(circle, rgba(139,92,246,.12) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -30, left: 10, width: 120, height: 120, background: "radial-gradient(circle, rgba(201,168,76,.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ position: "relative" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isExpanded ? 16 : 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(167,139,250,.55)", letterSpacing: 1.5, textTransform: "uppercase" }}>Fandom</span>
              {hasControversy && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: "#FFA726", background: "rgba(255,167,38,.1)", border: "1px solid rgba(255,167,38,.2)", borderRadius: 6, padding: "1px 6px" }}>
                  <AlertTriangle size={9} /> Shadow
                </span>
              )}
            </div>
            <div style={{ fontSize: isExpanded ? 22 : 18, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
              {name || "Unnamed Fandom"}
            </div>
            {totalFans > 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 3 }}>
                <Users size={11} style={{ display: "inline", verticalAlign: -1, marginRight: 4 }} />
                {fmtK(totalFans)} fans across {fandomSegments.filter(s => N(s.count) > 0).length} segments
              </div>
            )}
          </div>

          <motion.button
            onClick={goToFandom}
            whileTap={{ scale: 0.93 }}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "linear-gradient(135deg, rgba(201,168,76,.15), rgba(201,168,76,.08))",
              border: "1px solid rgba(201,168,76,.25)",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 10,
              fontWeight: 700,
              color: "#C9A84C",
              letterSpacing: 0.3,
              flexShrink: 0,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Fandom HQ <ChevronRight size={12} />
          </motion.button>
        </div>

        {/* Gauges */}
        <div style={{ display: "flex", gap: isExpanded ? 12 : 8, marginBottom: isExpanded ? 16 : 12 }}>
          <GaugeBar label="Morale" value={morale} color={moraleColor} />
          <GaugeBar label="Trust" value={trust} color={trustColor} />
          <GaugeBar label="Toxicity" value={tox} color={toxColor} />
        </div>

        {/* Controversy warning */}
        {hasControversy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,167,38,.08)",
              border: "1px solid rgba(255,167,38,.15)",
              borderRadius: 12,
              padding: "8px 12px",
              marginBottom: isExpanded ? 16 : 12,
              fontSize: 10.5,
              color: "#FFA726",
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>
              Controversy shadow active{controversyTicks > 0 ? ` \u2014 ${controversyTicks} ticks remaining` : ""}
            </span>
          </motion.div>
        )}

        {/* Segment bar */}
        {fandomSegments.length > 0 && (
          <SegmentBar segments={fandomSegments} />
        )}
      </div>
    </motion.div>
  );
}
