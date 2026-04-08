import React from "react";
import { motion } from "framer-motion";

const SEGS = 8;

// Bottom-to-top color ramp (cold → hot)
const SEG_COLORS = [
  "#3b82f6", // 1 cold blue
  "#60a5fa", // 2
  "#818cf8", // 3 indigo
  "#fbbf24", // 4 amber – tension starts
  "#f59e0b", // 5
  "#f97316", // 6 orange
  "#ef4444", // 7 red
  "#dc2626", // 8 critical
];

const STATES = [
  { threshold: 0,  label: "COLD ROOM",  color: "#60a5fa" },
  { threshold: 28, label: "WARMING UP", color: "#818cf8" },
  { threshold: 48, label: "VIBING",     color: "#fbbf24" },
  { threshold: 66, label: "LIT",        color: "#f97316" },
  { threshold: 83, label: "GOING OFF",  color: "#ef4444" },
];

function getState(score) {
  let out = STATES[0];
  for (const s of STATES) if (score >= s.threshold) out = s;
  return out;
}

/**
 * Pressure gauge for the Vibe Score.
 *
 * Props:
 *   score      – 0-100
 *   showLabel  – show the state label below (default true)
 *   size       – "sm" | "md" | "lg"
 */
export default function VibeMeterBar({ score = 0, showLabel = true, size = "md" }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const litCount = Math.round((v / 100) * SEGS);
  const state = getState(v);
  const isHot = v >= 66;
  const isCritical = v >= 83;
  const isUnstable = v >= 45 && v < 66; // tension zone — could go either way

  const segH = size === "sm" ? 3 : size === "lg" ? 10 : 5;
  const segW = size === "sm" ? 16 : size === "lg" ? 36 : 22;
  const gap  = size === "sm" ? 1  : size === "lg" ? 3  : 2;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Segments — stacked vertical bars, rendered bottom-to-top via flex-col-reverse */}
      <div
        className="flex flex-col-reverse"
        style={{
          gap,
          width: segW,
          filter: isHot ? `drop-shadow(0 0 8px ${state.color}55)` : undefined,
        }}
      >
        {Array.from({ length: SEGS }).map((_, i) => {
          const on = i < litCount;
          const c  = SEG_COLORS[i];

          // Top two lit segments pulse when hot
          const shouldPulse = on && isHot && i >= litCount - 2;
          // Top lit segment flickers when unstable
          const shouldFlicker = on && isUnstable && i === litCount - 1;

          return (
            <motion.div
              key={i}
              style={{
                height: segH,
                width: segW,
                borderRadius: 2,
                backgroundColor: on ? c : "rgba(255,255,255,0.05)",
                boxShadow: on && i >= 5 ? `0 0 5px ${c}80` : undefined,
              }}
              initial={{ opacity: 0, scaleX: 0.4 }}
              animate={
                shouldPulse
                  ? {
                      opacity: [1, isCritical ? 0.2 : 0.5, 1],
                      scaleX: 1,
                    }
                  : shouldFlicker
                  ? {
                      opacity: [1, 0.6, 0.9, 0.5, 1],
                      scaleX: 1,
                    }
                  : {
                      opacity: on ? 1 : 0.07,
                      scaleX: 1,
                    }
              }
              transition={
                shouldPulse
                  ? {
                      opacity: {
                        duration: isCritical ? 0.45 : 0.85,
                        repeat: Infinity,
                        delay: i * 0.07,
                        ease: "easeInOut",
                      },
                      scaleX: { duration: 0.25, delay: i * 0.035 },
                    }
                  : shouldFlicker
                  ? {
                      opacity: {
                        duration: 1.6,
                        repeat: Infinity,
                        delay: i * 0.05,
                        ease: "easeInOut",
                      },
                      scaleX: { duration: 0.25, delay: i * 0.035 },
                    }
                  : {
                      duration: 0.25,
                      delay: i * 0.035,
                    }
              }
            />
          );
        })}
      </div>

      {showLabel && (
        <motion.span
          key={state.label}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 0.9, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-[8px] font-black uppercase tracking-[0.14em] leading-none"
          style={{ color: state.color }}
        >
          {state.label}
        </motion.span>
      )}
    </div>
  );
}
