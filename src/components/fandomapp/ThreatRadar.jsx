import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Swords } from "lucide-react";

const CONTROVERSY_PHASES = ["spark", "spread", "peak", "aftermath"];
const PHASE_RADIUS = { spark: 0.3, spread: 0.55, peak: 0.8, aftermath: 0.65 };

const RESPONSE_OPTIONS = [
  { id: "deny",       label: "Deny" },
  { id: "apologize",  label: "Apologize" },
  { id: "lean_in",    label: "Lean In" },
  { id: "distract",   label: "Distract" },
  { id: "lawyer_up",  label: "Lawyer Up" },
];

function polarToXY(cx, cy, radius, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function RadarSVG({ controversies = [], wars = [], toxicity = 0, shadowTicks = 0 }) {
  const SIZE = 220;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const MAX_R = 90;

  const rings = [0.33, 0.66, 1.0];
  const spokes = [0, 60, 120, 180, 240, 300];

  // Place controversies around the radar based on phase severity
  const contPoints = useMemo(() => {
    return controversies.map((c, i) => {
      const r = (PHASE_RADIUS[c.phase] || 0.5) * MAX_R;
      const angle = (i / Math.max(controversies.length, 1)) * 360;
      const pos = polarToXY(CX, CY, r, angle);
      const severity = Math.min(1, (c.public_attention || 0) / 100);
      return { ...c, x: pos.x, y: pos.y, severity, r: 4 + severity * 6 };
    });
  }, [controversies]);

  // Place wars on opposite side
  const warPoints = useMemo(() => {
    return wars.map((w, i) => {
      const r = (Math.min(1, (w.intensity || 50) / 100)) * MAX_R;
      const angle = 180 + (i / Math.max(wars.length, 1)) * 180;
      const pos = polarToXY(CX, CY, r, angle);
      return { ...w, x: pos.x, y: pos.y, r: 3 + Math.min(1, (w.intensity || 50) / 100) * 5 };
    });
  }, [wars]);

  // Toxicity determines background tint
  const toxPct = Math.min(100, toxicity);
  const bgOpacity = 0.02 + (toxPct / 100) * 0.08;

  return (
    <div className="relative flex justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Background tint based on toxicity */}
        <circle cx={CX} cy={CY} r={MAX_R} fill={`rgba(239,83,80,${bgOpacity})`} />

        {/* Concentric rings */}
        {rings.map((r, i) => (
          <circle
            key={i}
            cx={CX} cy={CY} r={MAX_R * r}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1}
          />
        ))}

        {/* Spokes */}
        {spokes.map((angle, i) => {
          const end = polarToXY(CX, CY, MAX_R, angle);
          return (
            <line
              key={i}
              x1={CX} y1={CY} x2={end.x} y2={end.y}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1}
            />
          );
        })}

        {/* Shadow zone (controversy shadow remaining) */}
        {shadowTicks > 0 && (
          <circle
            cx={CX} cy={CY}
            r={MAX_R * 0.25}
            fill="rgba(255,160,0,0.06)"
            stroke="rgba(255,160,0,0.15)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        {/* Controversy dots (pulsing) */}
        {contPoints.map((c, i) => (
          <g key={`c-${i}`}>
            <motion.circle
              cx={c.x} cy={c.y} r={c.r + 4}
              fill="none"
              stroke="#EF5350"
              strokeWidth={1}
              strokeOpacity={0.3}
              initial={{ r: c.r }}
              animate={{ r: c.r + 6 }}
              transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />
            <motion.circle
              cx={c.x} cy={c.y} r={c.r}
              fill="#EF5350"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 4px rgba(239,83,80,0.6))" }}
            />
          </g>
        ))}

        {/* War dots (orange pulsing) */}
        {warPoints.map((w, i) => (
          <g key={`w-${i}`}>
            <motion.circle
              cx={w.x} cy={w.y} r={w.r + 3}
              fill="none"
              stroke="#F7A54B"
              strokeWidth={1}
              strokeOpacity={0.3}
              initial={{ r: w.r }}
              animate={{ r: w.r + 5 }}
              transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.3 }}
            />
            <motion.circle
              cx={w.x} cy={w.y} r={w.r}
              fill="#F7A54B"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ filter: "drop-shadow(0 0 4px rgba(247,165,75,0.6))" }}
            />
          </g>
        ))}

        {/* Center dot */}
        <circle cx={CX} cy={CY} r={3} fill="rgba(255,255,255,0.15)" />

        {/* Labels */}
        <text x={CX} y={18} textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize={8} fontWeight={700}>
          THREATS
        </text>
        <text x={CX} y={SIZE - 8} textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize={8} fontWeight={700}>
          WARS
        </text>
      </svg>

      {/* Center overlay with toxicity score */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-2xl font-black" style={{
            color: toxicity >= 60 ? "#EF5350" : toxicity >= 40 ? "#F7A54B" : "rgba(255,255,255,0.2)"
          }}>
            {toxicity}
          </div>
          <div className="text-[8px] font-bold uppercase tracking-widest text-white/20">Toxicity</div>
        </div>
      </div>
    </div>
  );
}

export default function ThreatRadar({
  controversies = [],
  wars = [],
  toxicity = 0,
  shadowTicks = 0,
  onRespondControversy,
  respondingId,
}) {
  const hasThreats = controversies.length > 0 || wars.length > 0 || toxicity > 20;
  if (!hasThreats) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Threat Radar
        </span>
        <div className="flex items-center gap-3 text-[9px]">
          {controversies.length > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle size={10} /> {controversies.length}
            </span>
          )}
          {wars.length > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Swords size={10} /> {wars.length}
            </span>
          )}
        </div>
      </div>

      <RadarSVG
        controversies={controversies}
        wars={wars}
        toxicity={toxicity}
        shadowTicks={shadowTicks}
      />

      {shadowTicks > 0 && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-amber-400 font-medium">
            Controversy shadow — {shadowTicks} ticks remaining
          </span>
        </div>
      )}

      {/* Controversy response cards */}
      {controversies.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {controversies.map(c => {
            const canRespond = ["spread", "peak", "aftermath"].includes(c.phase) && !c.response_taken;
            const isResponding = respondingId === c.id;
            return (
              <div
                key={c.id}
                className="p-3 rounded-xl border"
                style={{ background: "rgba(239,83,80,0.04)", borderColor: "rgba(239,83,80,0.15)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-red-400">
                    {(c.controversy_type || "").replace(/_/g, " ")}
                  </span>
                  <span className="text-[9px] text-white/30">Attn: {c.public_attention}</span>
                </div>

                {/* Phase dots */}
                <div className="flex items-center gap-1 mb-2">
                  {CONTROVERSY_PHASES.map((phase, i) => {
                    const isActive = phase === c.phase;
                    const isDone = CONTROVERSY_PHASES.indexOf(c.phase) > i;
                    return (
                      <React.Fragment key={phase}>
                        <div className="flex flex-col items-center gap-0.5">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: isActive ? "#EF5350" : isDone ? "rgba(239,83,80,0.4)" : "rgba(255,255,255,0.08)",
                              boxShadow: isActive ? "0 0 6px rgba(239,83,80,0.5)" : "none",
                            }}
                          />
                          <span className="text-[7px]" style={{ color: isActive ? "#EF5350" : "rgba(255,255,255,0.2)" }}>
                            {phase}
                          </span>
                        </div>
                        {i < CONTROVERSY_PHASES.length - 1 && (
                          <div className="flex-1 h-px bg-red-500/20 -mt-2" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Impact */}
                {(c.brand_trust_delta_total != null || c.fan_morale_delta_total != null) && (
                  <div className="text-[10px] text-white/30 mb-2">
                    {c.brand_trust_delta_total != null && (
                      <span>
                        Trust: <span style={{ color: c.brand_trust_delta_total < 0 ? "#EF5350" : "#4CAF82" }}>
                          {c.brand_trust_delta_total > 0 ? "+" : ""}{c.brand_trust_delta_total}
                        </span>
                      </span>
                    )}
                    {c.brand_trust_delta_total != null && c.fan_morale_delta_total != null && " · "}
                    {c.fan_morale_delta_total != null && (
                      <span>
                        Morale: <span style={{ color: c.fan_morale_delta_total < 0 ? "#EF5350" : "#4CAF82" }}>
                          {c.fan_morale_delta_total > 0 ? "+" : ""}{c.fan_morale_delta_total}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Response */}
                {c.response_taken ? (
                  <div className="text-[10px] font-semibold text-green-400">
                    ✓ Response: {c.response_taken}
                  </div>
                ) : canRespond ? (
                  <div className="flex flex-wrap gap-1.5">
                    {RESPONSE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => !isResponding && onRespondControversy?.(c.id, opt.id)}
                        disabled={isResponding}
                        className={`fandom-action-pill ${isResponding ? "fandom-action-pill--disabled" : ""} px-2.5 py-1 text-[10px] font-semibold border`}
                        style={{
                          "--pill-accent": opt.id === 'apologize' ? '#4CAF82' : opt.id === 'lean_in' ? '#EF5350' : '#a78bfa',
                          "--pill-accent-soft": opt.id === 'apologize' ? 'rgba(76,175,130,0.12)' : opt.id === 'lean_in' ? 'rgba(239,83,80,0.12)' : 'rgba(167,139,250,0.12)',
                          "--pill-accent-border": opt.id === 'apologize' ? 'rgba(76,175,130,0.28)' : opt.id === 'lean_in' ? 'rgba(239,83,80,0.28)' : 'rgba(167,139,250,0.28)',
                        }}
                      >
                        {isResponding ? "…" : opt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* War cards */}
      {wars.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {wars.map(war => (
            <div
              key={war.id}
              className="p-3 rounded-xl border"
              style={{ background: "rgba(247,165,75,0.04)", borderColor: "rgba(247,165,75,0.15)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-amber-400">Fan War</span>
                <span className="text-[9px] text-white/30">{war.duration_turns || 0} turns</span>
              </div>
              <div className="flex gap-3 text-[10px] text-white/30 mb-2">
                <span>Intensity: {war.intensity}</span>
                {war.challenger_momentum != null && (
                  <span>Momentum: {war.challenger_momentum} vs {war.target_momentum || 0}</span>
                )}
              </div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: (war.intensity || 0) >= 70 ? "#EF5350" : "#F7A54B",
                    filter: (war.intensity || 0) >= 70 ? "drop-shadow(0 0 4px rgba(239,83,80,0.5))" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, war.intensity || 0)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
