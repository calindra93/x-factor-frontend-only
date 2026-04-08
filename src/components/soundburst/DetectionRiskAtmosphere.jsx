import React from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// NPC chatter — intercepted scanner feed, paranoid posts, street whispers
// ---------------------------------------------------------------------------
const CHATTER = [
  "heard the spot got flagged 👀  •  ",
  "who posted the location lmaooo  •  ",
  "scanner quiet but delete ur stories  •  ",
  "two shows shut down this block last week  •  ",
  "this is way too visible rn  •  ",
  "cops been running plates outside  •  ",
  "organizer's burner just got DM'd  •  ",
  "DELETE the location tag  •  ",
  "someone definitely snitched  •  ",
  "underground ≠ under-EXPOSED  •  ",
  "five-oh been circling since Thursday  •  ",
  "promo post trending on wrong feeds  •  ",
];

// Tier thresholds
const T_LOW    = 30;  // chatter begins
const T_MID    = 60;  // vignette bleeds in, heat bar
const T_HIGH   = 80;  // glitch borders, red tint
const T_CRIT   = 92;  // RAID IMMINENT

const G = () => (
  <style>{`
    @keyframes sb-border-flicker {
      0%,100%  { border-color: rgba(239,68,68,0.35); }
      25%      { border-color: rgba(239,68,68,0.08); }
      50%      { border-color: rgba(239,68,68,0.55); }
      75%      { border-color: rgba(239,68,68,0.12); }
    }
    @keyframes sb-glitch-x {
      0%,85%,100% { transform: translateX(0); }
      86%   { transform: translateX(-2px); }
      88%   { transform: translateX(2px); }
      90%   { transform: translateX(-1px); }
      92%   { transform: translateX(0); }
    }
    @keyframes sb-ticker {
      from { transform: translateX(100%); }
      to   { transform: translateX(-100%); }
    }
    @keyframes sb-scan-line {
      0%   { top: -4px; opacity: 0.06; }
      50%  { opacity: 0.1; }
      100% { top: 100%; opacity: 0; }
    }
    .sb-glitch  { animation: sb-glitch-x 5s ease-in-out infinite; }
    .sb-flicker { animation: sb-border-flicker 1.2s ease-in-out infinite; }
  `}</style>
);

// ---------------------------------------------------------------------------
// ChatterTicker — scrolling NPC messages
// ---------------------------------------------------------------------------
function ChatterTicker({ risk }) {
  const count  = risk >= T_HIGH ? 8 : risk >= T_MID ? 5 : 3;
  const speed  = risk >= T_HIGH ? 18 : risk >= T_MID ? 24 : 32;
  const color  = risk >= T_HIGH ? "#ef4444" : risk >= T_MID ? "#f97316" : "#d97706";
  const text   = CHATTER.slice(0, count).join("");

  return (
    <div
      className="overflow-hidden py-1.5 border-t"
      style={{ borderColor: `${color}25` }}
    >
      <div
        className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.12em] opacity-70"
        style={{
          color,
          animation: `sb-ticker ${speed}s linear infinite`,
          display: "inline-block",
        }}
      >
        {text}{text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeatIndicator — pulsing bar that surfaces at mid+ risk
// ---------------------------------------------------------------------------
function HeatIndicator({ risk }) {
  const pct   = Math.min(100, ((risk - T_MID) / (100 - T_MID)) * 100);
  const color = risk >= T_HIGH ? "#ef4444" : "#f97316";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 px-4 py-2 border-b"
      style={{ borderColor: `${color}20`, backgroundColor: `${color}08` }}
    >
      <motion.div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      />
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span
        className="text-[9px] font-black uppercase tracking-[0.15em] flex-shrink-0"
        style={{ color }}
      >
        {risk >= T_CRIT ? "RAID IMMINENT" : risk >= T_HIGH ? "CRITICAL HEAT" : "HEAT RISING"}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ScanLine — subtle horizontal sweep at high risk
// ---------------------------------------------------------------------------
function ScanLine() {
  return (
    <div
      className="absolute inset-x-0 h-px pointer-events-none z-20"
      style={{
        background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.15), transparent)",
        animation: "sb-scan-line 4s linear infinite",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * DetectionRiskAtmosphere
 *
 * Wraps any section and applies escalating visual corruption based on risk %.
 *
 * Layers:
 *   0–30%   clean
 *   31–60%  NPC chatter ticker + faint grain
 *   61–80%  heat indicator + red vignette edges + grain intensifies
 *   81%+    glitch borders + red tint overlay + scan line
 *   92%+    RAID IMMINENT warning + full corruption
 *
 * Props:
 *   risk      – 0-100 (integer or float)
 *   children  – wrapped content
 */
export default function DetectionRiskAtmosphere({ risk = 0, children }) {
  const r = Math.max(0, Math.min(100, Number(risk) || 0));

  const showChatter  = r >= T_LOW;
  const showHeat     = r >= T_MID;
  const showGlitch   = r >= T_HIGH;
  const isCritical   = r >= T_CRIT;

  // Grain opacity (ramps from 0 at 30% to 0.4 at 100%)
  const grainOpacity = r > T_LOW ? Math.min(0.4, ((r - T_LOW) / 70) * 0.4) : 0;
  // Vignette opacity (ramps from 0 at 60% to 0.5 at 100%)
  const vigOpacity   = r > T_MID ? Math.min(0.55, ((r - T_MID) / 40) * 0.55) : 0;
  // Red tint (only above T_HIGH)
  const tintOpacity  = r > T_HIGH ? Math.min(0.07, ((r - T_HIGH) / 20) * 0.07) : 0;

  return (
    <>
      <G />
      <div className={`relative${showGlitch ? " sb-glitch" : ""}`}>
        {/* ── Heat indicator (mid+) ── */}
        <AnimatePresence>
          {showHeat && <HeatIndicator key="heat" risk={r} />}
        </AnimatePresence>

        {/* ── Main content ── */}
        <div className={`relative overflow-hidden${showGlitch ? " sb-flicker rounded-xl border" : ""}`}
          style={showGlitch ? { borderColor: "rgba(239,68,68,0.25)" } : undefined}
        >
          {/* Scan line sweep */}
          {showGlitch && <ScanLine />}

          {/* Noise grain overlay */}
          {grainOpacity > 0 && (
            <div
              className="absolute inset-0 pointer-events-none z-10 mix-blend-overlay"
              style={{
                opacity: grainOpacity,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                backgroundSize: "150px 150px",
              }}
            />
          )}

          {/* Edge vignette */}
          {vigOpacity > 0 && (
            <motion.div
              className="absolute inset-0 pointer-events-none z-10"
              animate={{ opacity: vigOpacity }}
              transition={{ duration: 0.6 }}
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(180,10,10,0.8) 100%)",
              }}
            />
          )}

          {/* Red tint wash */}
          {tintOpacity > 0 && (
            <motion.div
              className="absolute inset-0 pointer-events-none z-10 bg-red-900"
              animate={{ opacity: tintOpacity }}
              transition={{ duration: 0.4 }}
            />
          )}

          {/* Children */}
          {children}
        </div>

        {/* ── NPC chatter ticker (low+) ── */}
        <AnimatePresence>
          {showChatter && <ChatterTicker key="chatter" risk={r} />}
        </AnimatePresence>
      </div>
    </>
  );
}
