import React, { useMemo } from "react";
import { motion } from "framer-motion";

const SIZE = 140;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score) {
  if (score >= 70) return "#34d399";
  if (score >= 45) return "#fbbf24";
  return "#f87171";
}

function glowFilter(color) {
  return `drop-shadow(0 0 6px ${color}90) drop-shadow(0 0 16px ${color}50) drop-shadow(0 0 32px ${color}25)`;
}

export default function PulseRing({ alignment = 50, morale = 50, toxicity = 0 }) {
  const pulse = useMemo(() => {
    const raw = (alignment * 0.4) + (morale * 0.35) + ((100 - toxicity) * 0.25);
    return Math.round(Math.max(0, Math.min(100, raw)));
  }, [alignment, morale, toxicity]);

  const color = scoreColor(pulse);
  const offset = CIRCUMFERENCE - (pulse / 100) * CIRCUMFERENCE;

  const label = pulse >= 75 ? "Thriving" : pulse >= 55 ? "Stable" : pulse >= 35 ? "Stressed" : "Critical";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Outer glow pulse */}
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS + 6}
            fill="none" stroke={color} strokeWidth={1}
            initial={{ opacity: 0.1 }}
            animate={{ opacity: [0.05, 0.2, 0.05] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Background track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={STROKE}
          />
          {/* Animated fill arc */}
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              filter: glowFilter(color),
            }}
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-3xl font-black tracking-tighter"
            style={{ color, textShadow: `0 0 20px ${color}40` }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {pulse}
          </motion.span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
            Pulse
          </span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}
