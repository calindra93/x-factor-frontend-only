import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic2, Music, Zap, Users, Radio, PartyPopper,
  Headphones, Crown, DollarSign, Star, TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EVENT_ICONS = {
  open_mic: Mic2, showcase: Music, battle: Zap, collab_night: Users,
  radio: Radio, block_party: PartyPopper, listening_party: Headphones,
  festival_slot: Crown,
};

const CROWD_COUNTS = [0.25, 0.65, 0.42, 0.88, 0.55, 0.78, 0.33, 0.91, 0.61, 0.47];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function estimateProjectedDeltas(event) {
  const proj = event?.metadata?.underground_projection || {};
  const vibe = Number(proj.vibe_score) || 50;
  const promo = Number(event?.metadata?.promotion_boost_pct) || 0;
  const expectedAttendanceRatio = Number(proj.expected_attendance_ratio)
    || (Number(event?.capacity) > 0
      ? clamp(Number(proj.expected_attendance || 0) / Math.max(1, Number(event.capacity)), 0.2, 1.15)
      : 0.6);
  const outcomeMult = clamp(0.8 + expectedAttendanceRatio * 0.7, 0.4, 2.4);
  const scenePoints = Math.max(2, Math.round(outcomeMult * 4 + (vibe - 40) / 20 + promo * 8));
  const newFans = Math.max(
    1,
    Math.floor(((Number(event?.fame_gained) || 0) + (Number(event?.hype_gained) || 0)) * 0.5 * outcomeMult),
  );

  return {
    scenePoints,
    newFans,
  };
}

function formatMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.floor(v)}`;
}

function buildNotifications(event) {
  const proj     = event.metadata?.underground_projection || {};
  const vibe     = Number(proj.vibe_score) || 50;
  const att      = Number(proj.expected_attendance) || 100;
  const promo    = Number(event.metadata?.promotion_boost_pct) || 0;
  const teaser   = Number(event.metadata?.teaser_heat) || 0;
  const shares   = Math.max(4, Math.floor(att * (vibe / 100) * 0.28));
  const plays    = Math.max(20, Math.floor(att * (vibe / 100) * 4.2));

  const notifs = [
    {
      handle: "@sb_underground",
      text: vibe >= 80 ? "it's GOING OFF right now" : vibe >= 60 ? "that was a solid set" : "recap is getting traction",
      metric: `${plays.toLocaleString()} plays`,
      hot: vibe >= 75,
    },
    {
      handle: "@scene_radar",
      text: "shared your post-show recap",
      metric: `${shares} reposts`,
      hot: false,
    },
  ];

  if (promo > 0.25) {
    notifs.push({
      handle: "@underground_daily",
      text: "featured you on discover",
      metric: "TRENDING",
      hot: true,
    });
  }
  if (teaser > 0.15) {
    notifs.push({
      handle: "@hypewatch",
      text: "teaser clip is making noise",
      metric: `${Math.floor(teaser * 4800).toLocaleString()} impressions`,
      hot: teaser > 0.4,
    });
  }

  return notifs;
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

/** Beat 1 — YOU HIT THE STAGE */
function BeatStage({ event, setlist }) {
  const Icon = EVENT_ICONS[event.event_type] || Mic2;
  const [heights, setHeights] = useState(CROWD_COUNTS);

  // Waveform animation
  useEffect(() => {
    const id = setInterval(() => {
      setHeights(Array.from({ length: 10 }, () => 0.15 + Math.random() * 0.85));
    }, 110);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center">
      {/* Crowd waveform */}
      <div className="flex items-end gap-1 mb-8" style={{ height: 56 }}>
        {heights.map((h, i) => (
          <motion.div
            key={i}
            className="w-2 rounded-sm bg-blue-400"
            animate={{ height: 56 * h, opacity: 0.4 + h * 0.6 }}
            transition={{ duration: 0.1, ease: "linear" }}
          />
        ))}
      </div>

      {/* Event icon */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 14, stiffness: 200, delay: 0.15 }}
        className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mb-5"
      >
        <Icon className="w-8 h-8 text-blue-400" />
      </motion.div>

      {/* LIVE badge */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="inline-flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1 mb-3"
      >
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-red-400"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.7, repeat: Infinity }}
        />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">Live</span>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-3xl font-black text-white tracking-tight leading-tight"
      >
        {event.event_name || "Taking the stage"}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-white/50 mt-2 capitalize"
      >
        {(event.city || event.region || "underground")}{" · "}
        {event.event_type?.replace(/_/g, " ")}
      </motion.p>

      {setlist?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}
        >
          {setlist.map((s, i) => (
            <span key={s.id || i} style={{
              background: "rgba(96,165,250,0.12)",
              border: "1px solid rgba(96,165,250,0.25)",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 11,
              color: "#93c5fd",
              fontWeight: 700,
            }}>
              {i + 1}. {s.title || s.release_name}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/** Beat 2 — SOUNDBURST REACTS */
function BeatSoundburst({ event }) {
  const notifs = buildNotifications(event);

  return (
    <div className="flex flex-col justify-center flex-1 px-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-400 mb-1">Soundburst is reacting</div>
        <div className="text-xl font-black text-white">The feed is moving.</div>
      </motion.div>

      <div className="space-y-2.5">
        {notifs.map((n, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24, x: -8 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            transition={{ delay: 0.1 + i * 0.18, type: "spring", damping: 18, stiffness: 220 }}
            className="flex items-center gap-3 rounded-xl border bg-white/[0.04] px-3.5 py-3"
            style={{
              borderColor: n.hot ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.07)",
              backgroundColor: n.hot ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.04)",
            }}
          >
            {/* Avatar circle */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold">
              SB
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-blue-300">{n.handle}</span>
              <span className="text-[11px] text-white/60 ml-1">{n.text}</span>
            </div>
            <span
              className={`text-[10px] font-black flex-shrink-0 ${n.hot ? "text-amber-300" : "text-white/40"}`}
            >
              {n.metric}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Beat 3 — THE STREETS KNOW */
function BeatStreets({ event }) {
  const proj     = event.metadata?.underground_projection || {};
  const vibe     = Number(proj.vibe_score) || 50;
  const revenue  = Number(proj.expected_revenue) || 0;
  const projected = estimateProjectedDeltas(event);

  const stats = [
    { label: "Revenue",      value: formatMoney(revenue),    color: "#34d399", Icon: DollarSign },
    { label: "Fans est.",    value: `+${projected.newFans.toLocaleString()}`, color: "#60a5fa", Icon: Users },
    { label: "Scene est.",   value: `+${projected.scenePoints}`, color: "#a78bfa", Icon: Star },
  ];

  const vibeHigh = vibe >= 75;

  return (
    <div className="flex flex-col justify-center flex-1 px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">The streets know</div>
        <div className="text-xl font-black text-white">
          {vibeHigh ? "Word is spreading fast." : "People felt that."}
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.15, type: "spring", damping: 16, stiffness: 240 }}
            className="rounded-xl border bg-white/[0.04] p-3 text-center"
            style={{ borderColor: `${s.color}30` }}
          >
            <s.Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: s.color }} />
            <div className="text-base font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] text-white/40 mt-0.5 uppercase tracking-wide">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {vibeHigh && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-xl border border-amber-500/25 bg-amber-500/08 px-4 py-3 text-center"
        >
          <TrendingUp className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <p className="text-[11px] text-amber-200 font-semibold">Someone was watching.</p>
          <p className="text-[10px] text-white/40 mt-0.5">Check your scene contacts.</p>
        </motion.div>
      )}

      {/* Tap to close hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 0.9 }}
        className="text-center text-[10px] text-white/30 mt-4"
      >
        Projected gains apply after next turn processing. Tap to continue →
      </motion.p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
/**
 * PerformanceSequence
 *
 * Full-screen cinematic overlay that plays when the player hits Perform.
 * 3 auto-advancing beats using underground_projection data.
 *
 * Props:
 *   event    – the TourEvent object (needs metadata.underground_projection)
 *   onClose  – callback when sequence finishes
 */
export default function PerformanceSequence({ event, onClose, setlist }) {
  const [phase, setPhase] = useState(0); // 0=entering, 1=stage, 2=soundburst, 3=streets
  const onCloseRef = useRef(onClose);
  const timersRef = useRef([]);
  useEffect(() => { onCloseRef.current = onClose; });

  const dismiss = useCallback(() => {
    if (phase < 1) return; // not started yet
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (phase < 3) {
      setPhase(p => p + 1);
    } else {
      onCloseRef.current();
    }
  }, [phase]);

  // Auto-start beat 1 after short delay; beats 2 and 3 require tap
  useEffect(() => {
    if (!event) return;
    const boot = setTimeout(() => setPhase(1), 300);
    timersRef.current.push(boot);
    return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  }, [event]); // onClose handled via ref — no restart on parent re-render

  // Beat 3 auto-dismiss after 3s if player doesn't tap
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
      transition={{ duration: 0.25 }}
      onClick={dismiss}
    >
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2 flex-shrink-0">
        {[1, 2, 3].map((dot) => (
          <motion.div
            key={dot}
            className="h-1 rounded-full bg-white"
            animate={{
              width: phase === dot ? 24 : 6,
              opacity: phase >= dot ? 1 : 0.2,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* Beat content */}
      <AnimatePresence mode="wait">
        {phase === 1 && (
          <motion.div
            key="stage"
            className="flex-1 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
          >
            <BeatStage event={event} setlist={setlist} />
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div
            key="soundburst"
            className="flex-1 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <BeatSoundburst event={event} />
          </motion.div>
        )}
        {phase === 3 && (
          <motion.div
            key="streets"
            className="flex-1 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BeatStreets event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
