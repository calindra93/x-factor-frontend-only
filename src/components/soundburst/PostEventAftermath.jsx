import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Users, Star, AlertTriangle, TrendingUp,
  Sparkles, Siren, MapPin,
} from "lucide-react";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function estimateProjectedDeltas(event) {
  const proj = event?.metadata?.underground_projection || {};
  const vibe = Number(proj.vibe_score) || Number(event?.metadata?.vibe_score) || 50;
  const promo = Number(event?.metadata?.promotion_boost_pct) || 0;
  const expectedAttendanceRatio = Number(proj.expected_attendance_ratio)
    || (Number(event?.capacity) > 0
      ? clamp(Number(proj.expected_attendance || 0) / Math.max(1, Number(event.capacity)), 0.2, 1.15)
      : 0.6);
  const outcomeMult = clamp(0.8 + expectedAttendanceRatio * 0.7, 0.4, 2.4);
  const scenePoints = Math.max(2, Math.round(outcomeMult * 4 + (vibe - 40) / 20 + promo * 8));
  const heatGain = Math.max(2, Math.round(vibe / 18));
  const fanGain = Math.max(
    1,
    Math.floor(((Number(event?.fame_gained) || 0) + (Number(event?.hype_gained) || 0)) * 0.5 * outcomeMult),
  );

  return { scenePoints, heatGain, fanGain };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.floor(v)}`;
}

function getVibeLabel(vibe) {
  if (vibe >= 85) return "LEGENDARY";
  if (vibe >= 70) return "FIRE";
  if (vibe >= 55) return "SOLID";
  if (vibe >= 40) return "DECENT";
  return "ROUGH";
}

// ---------------------------------------------------------------------------
// Beat 1 — Viral Cascade
// ---------------------------------------------------------------------------
function BeatViral({ event }) {
  const proj  = event.metadata?.underground_projection || {};
  const vibe  = Number(proj.vibe_score) || Number(event.metadata?.vibe_score) || 50;
  const att   = Number(event.attendance) || Number(proj.expected_attendance) || 0;
  const rev   = Number(event.gross_revenue) || Number(proj.expected_revenue) || 0;
  const isRaid = event.status === "raided";

  if (isRaid) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-4">
        <motion.div
          initial={{ scale: 0.5 }} animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 12 }}
          className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center"
        >
          <Siren className="w-9 h-9 text-red-400" />
        </motion.div>
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-[10px] font-black uppercase tracking-[0.25em] text-red-400 mb-2"
          >
            Got Raided
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-2xl font-black text-white"
          >
            The show got shut down.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.5 }}
            className="text-sm text-white/50 mt-2"
          >
            Detection risk was too high. Lay low for a while.
          </motion.p>
        </div>
      </div>
    );
  }

  const label = getVibeLabel(vibe);
  const labelColor = vibe >= 70 ? "#fbbf24" : vibe >= 55 ? "#34d399" : vibe >= 40 ? "#60a5fa" : "#f87171";
  const plays = Math.max(20, Math.floor(att * (vibe / 100) * 4));
  const shares = Math.max(3, Math.floor(att * 0.22));

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-5">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 14 }}
        className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center"
      >
        <Flame className="w-9 h-9 text-amber-400" />
      </motion.div>

      <div>
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="text-[10px] font-black uppercase tracking-[0.25em] mb-2"
          style={{ color: labelColor }}
        >
          {label} — {event.event_name || "the show"}
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="text-2xl font-black text-white leading-tight"
        >
          {vibe >= 75 ? "Soundburst is going crazy." : "People are talking."}
        </motion.h2>
      </div>

      <div className="flex gap-3 w-full">
        {[
          { label: "Plays", value: plays.toLocaleString(), color: "#60a5fa" },
          { label: "Shares", value: shares, color: "#a78bfa" },
          { label: "Rev", value: formatMoney(rev), color: "#34d399" },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-center"
          >
            <div className="text-base font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beat 2 — Reputation Report
// ---------------------------------------------------------------------------
function BeatReputation({ event }) {
  const projected   = estimateProjectedDeltas(event);
  const compMode    = event.metadata?.compliance_mode || "balanced";
  const isRaid      = event.status === "raided";

  const lines = isRaid
    ? [
        { icon: AlertTriangle, text: "Scene rep took a hit", color: "#f87171" },
        { icon: Siren, text: "Compliance risk flagged", color: "#f97316" },
        { icon: MapPin, text: "City tolerance lowered", color: "#fbbf24" },
      ]
    : [
      { icon: Star, text: `~+${projected.scenePoints} scene points projected`, color: "#a78bfa" },
      { icon: Flame, text: `Underground heat ~+${projected.heatGain} projected`, color: "#f97316" },
      { icon: Users, text: `~${projected.fanGain} new followers projected`, color: "#34d399" },
        compMode === "stealth" && {
          icon: Sparkles,
          text: "Stealth mode kept the heat down",
          color: "#60a5fa",
        },
        compMode === "permitted" && {
          icon: Sparkles,
          text: "Permit boosted crowd energy",
          color: "#34d399",
        },
      ].filter(Boolean);

  return (
    <div className="flex flex-col justify-center flex-1 px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400 mb-1">
          Reputation Report
        </div>
        <div className="text-xl font-black text-white">
          {isRaid ? "The streets noticed the bust." : "The streets noticed."}
        </div>
      </motion.div>

      <div className="space-y-2.5">
        {lines.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.14, type: "spring", damping: 20 }}
            className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
          >
            <l.icon className="w-4 h-4 flex-shrink-0" style={{ color: l.color }} />
            <span className="text-sm font-semibold text-white/80">{l.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beat 3 — Scene Trigger Reveal
// ---------------------------------------------------------------------------
function BeatScene({ event }) {
  const proj     = event.metadata?.underground_projection || {};
  const vibe     = Number(proj.vibe_score) || 50;
  const isRaid   = event.status === "raided";
  const hasTrend = vibe >= 82 && !isRaid;
  const hasScout = vibe >= 70 && !isRaid;

  return (
    <div className="flex flex-col justify-center flex-1 px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">
          Scene Update
        </div>
        <div className="text-xl font-black text-white">
          {isRaid ? "Damage report." : "Who noticed."}
        </div>
      </motion.div>

      <div className="space-y-3">
        {isRaid ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-red-500/20 bg-red-500/08 px-5 py-4 text-center"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-white">Lay low for a few turns.</p>
            <p className="text-[11px] text-white/40 mt-1">Secure a new permit before hosting again.</p>
          </motion.div>
        ) : (
          <>
            {hasScout && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: "spring", damping: 18 }}
                className="rounded-xl border border-amber-500/25 bg-amber-500/08 px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">Scene contact made a move.</p>
                    <p className="text-[11px] text-white/50 mt-0.5">Check your Scenes tab for new opportunities.</p>
                  </div>
                </div>
              </motion.div>
            )}
            {hasTrend && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: hasScout ? 0.25 : 0.1, type: "spring", damping: 18 }}
                className="rounded-xl border border-blue-500/25 bg-blue-500/08 px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">Trend alignment triggered.</p>
                    <p className="text-[11px] text-white/50 mt-0.5">Your vibe is pushing the local scene.</p>
                  </div>
                </div>
              </motion.div>
            )}
            {!hasScout && !hasTrend && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 text-center"
              >
                <p className="text-sm text-white/60">Solid show. Keep building.</p>
                <p className="text-[11px] text-white/30 mt-1">Scene is watching. Keep your heat up.</p>
              </motion.div>
            )}
          </>
        )}
      </div>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} transition={{ delay: 0.9 }}
        className="text-center text-[10px] text-white/30 mt-6"
      >
        Projections finalize on next turn. Tap to continue
      </motion.p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
/**
 * PostEventAftermath
 *
 * 3-beat story reel for a resolved / raided event.
 *
 * Props:
 *   event    – resolved TourEvent with status "resolved" | "raided"
 *   onClose  – dismiss callback
 */
export default function PostEventAftermath({ event, onClose }) {
  const [phase, setPhase] = useState(0);
  const onCloseRef = useRef(onClose);
  const timersRef = useRef([]);
  useEffect(() => { onCloseRef.current = onClose; });

  const dismiss = useCallback(() => {
    if (phase < 1) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (phase < 3) {
      setPhase((p) => p + 1);
    } else {
      onCloseRef.current();
    }
  }, [phase]);

  // Match PerformanceSequence pacing: start on beat 1, then tap-advance.
  useEffect(() => {
    if (!event) return;
    const boot = setTimeout(() => setPhase(1), 300);
    timersRef.current.push(boot);
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [event]); // onClose handled via ref — no restart on parent re-render

  // Beat 3 auto-dismiss after 3s if player doesn't tap.
  useEffect(() => {
    if (phase !== 3) return;
    const t = setTimeout(() => onCloseRef.current(), 3000);
    timersRef.current.push(t);
    return () => clearTimeout(t);
  }, [phase]);

  if (!event) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex flex-col bg-[#050508]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={dismiss}
    >
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2 flex-shrink-0">
        {[1, 2, 3].map((dot) => (
          <motion.div
            key={dot}
            className="h-1 rounded-full bg-white"
            animate={{ width: phase === dot ? 24 : 6, opacity: phase >= dot ? 1 : 0.2 }}
            transition={{ duration: 0.28 }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {phase === 1 && (
          <motion.div key="viral" className="flex-1 flex flex-col"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22 }}
          >
            <BeatViral event={event} />
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div key="rep" className="flex-1 flex flex-col"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28 }}
          >
            <BeatReputation event={event} />
          </motion.div>
        )}
        {phase === 3 && (
          <motion.div key="scene" className="flex-1 flex flex-col"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          >
            <BeatScene event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
