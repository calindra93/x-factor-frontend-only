import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const PILLAR_CONFIG = {
  diva:     { label: "Diva",     color: "#f472b6", desc: "+20% stan formation · +15% controversy severity" },
  alt:      { label: "Alt",      color: "#a78bfa", desc: "+25% OG loyalty · -30% trend chaser acquisition" },
  street:   { label: "Street",   color: "#fb923c", desc: "Defense labor ×1.3" },
  artsy:    { label: "Artsy",    color: "#60a5fa", desc: "+15% quality multiplier · -20% casual acquisition" },
  activist: { label: "Activist", color: "#34d399", desc: "+25% brand trust baseline · 2× controversy recovery" },
  party:    { label: "Party",    color: "#fbbf24", desc: "+30% casual acquisition · -15% OG loyalty ceiling" },
};

const HEX_SIZE = 42;
const HEX_GAP = 6;

function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function Hexagon({ cx, cy, pillar, isActive, isEditing, onClick }) {
  const cfg = PILLAR_CONFIG[pillar];
  if (!cfg) return null;
  const color = isActive ? cfg.color : "rgba(255,255,255,0.08)";
  const textColor = isActive ? cfg.color : "rgba(255,255,255,0.25)";

  return (
    <g
      onClick={() => onClick?.(pillar)}
      style={{ cursor: isEditing ? "pointer" : "default" }}
    >
      <motion.polygon
        points={hexPoints(cx, cy, HEX_SIZE)}
        fill={isActive ? `${cfg.color}15` : "rgba(255,255,255,0.02)"}
        stroke={color}
        strokeWidth={isActive ? 2 : 1}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          filter: isActive ? `drop-shadow(0 0 8px ${cfg.color}50) drop-shadow(0 0 16px ${cfg.color}25)` : "none",
        }}
      />
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={textColor}
        fontSize={11}
        fontWeight={700}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {cfg.label}
      </text>
    </g>
  );
}

export default function HexagonIdentityMap({
  activePillars = [],
  alignmentHistory = [],
  editing = false,
  pillarDraft = [],
  onTogglePillar,
  onStartEdit,
  onCancelEdit,
  onSavePillars,
  saving = false,
}) {
  const [tooltip, setTooltip] = useState(null);

  const pillars = Object.keys(PILLAR_CONFIG);
  const topRow = pillars.slice(0, 3);
  const botRow = pillars.slice(3, 6);

  const effectivePillars = editing ? pillarDraft : activePillars;

  const W = (HEX_SIZE * 2 + HEX_GAP) * 3 + HEX_GAP;
  const H = HEX_SIZE * 2 * 2 + HEX_GAP * 2;

  const rowX = (idx) => HEX_SIZE + idx * (HEX_SIZE * 2 + HEX_GAP);
  const topY = HEX_SIZE + 4;
  const botY = HEX_SIZE * 2 + HEX_GAP + HEX_SIZE + 4;

  const sparkData = (alignmentHistory || []).slice(-20).map((v, i) => ({
    turn: i,
    value: Number(v) || 50,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Identity Pillars
        </span>
        {!editing && (
          <button
            onClick={onStartEdit}
            className="text-[10px] font-semibold text-white/30 hover:text-white/60 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      <div className="flex justify-center">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Connection lines between active hexagons */}
          {effectivePillars.length >= 2 && effectivePillars.map((p, i) => {
            if (i === 0) return null;
            const prevIdx = pillars.indexOf(effectivePillars[i - 1]);
            const currIdx = pillars.indexOf(p);
            const prevRow = prevIdx < 3 ? "top" : "bot";
            const currRow = currIdx < 3 ? "top" : "bot";
            const px = rowX(prevRow === "top" ? prevIdx : prevIdx - 3);
            const py = prevRow === "top" ? topY : botY;
            const cx2 = rowX(currRow === "top" ? currIdx : currIdx - 3);
            const cy2 = currRow === "top" ? topY : botY;
            const cfg = PILLAR_CONFIG[p];
            return (
              <line
                key={`${effectivePillars[i - 1]}-${p}`}
                x1={px} y1={py} x2={cx2} y2={cy2}
                stroke={cfg?.color || "#fff"}
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeDasharray="4 4"
              />
            );
          })}
          {topRow.map((p, i) => (
            <Hexagon
              key={p}
              cx={rowX(i)}
              cy={topY}
              pillar={p}
              isActive={effectivePillars.includes(p)}
              isEditing={editing}
              onClick={editing ? onTogglePillar : () => setTooltip(tooltip === p ? null : p)}
            />
          ))}
          {botRow.map((p, i) => (
            <Hexagon
              key={p}
              cx={rowX(i)}
              cy={botY}
              pillar={p}
              isActive={effectivePillars.includes(p)}
              isEditing={editing}
              onClick={editing ? onTogglePillar : () => setTooltip(tooltip === p ? null : p)}
            />
          ))}
        </svg>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && PILLAR_CONFIG[tooltip] && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 px-3 py-2 rounded-xl text-center"
            style={{
              background: `${PILLAR_CONFIG[tooltip].color}12`,
              border: `1px solid ${PILLAR_CONFIG[tooltip].color}30`,
            }}
          >
            <span className="text-[11px] font-semibold" style={{ color: PILLAR_CONFIG[tooltip].color }}>
              {PILLAR_CONFIG[tooltip].label}
            </span>
            <span className="text-[10px] text-white/40 ml-2">{PILLAR_CONFIG[tooltip].desc}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit controls */}
      {editing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mt-3"
        >
          <span className="text-[10px] text-white/30">
            {pillarDraft.length}/3 selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/40 border border-white/8 hover:border-white/15 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSavePillars}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
              style={{
                borderColor: "rgba(201,168,76,0.3)",
                background: "rgba(201,168,76,0.1)",
                color: "#E8C87C",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "…" : "Save"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Identity Drift Sparkline */}
      {sparkData.length > 2 && (
        <div className="mt-4">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 block mb-1">
            Identity Drift
          </span>
          <div style={{ width: "100%", height: 36 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#7C6EF7"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
