import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Edit3, Loader2 } from "lucide-react";
import { FANBASE_PILLARS, MAX_PILLARS } from "@/data/fanbasePillars";

// Pillar effect descriptions (matched to backend computePillarEffects)
const PILLAR_EFFECTS = {
  loyalty:          "+30% OG retention · +10% stan formation",
  chaos:            "+35% casual acquisition · +20% controversy severity",
  empowerment:      "+25% stan formation · +15 brand trust floor",
  exclusivity:      "+20% OG loyalty · −35% trend chaser acquisition",
  romance:          "+30% stan formation · +10% controversy severity",
  rebellion:        "+35% defense labor · +40% controversy recovery",
  internet_fluency: "+30% trend chaser acquisition · +15% casual acquisition",
  spirituality:     "+20 brand trust floor · +80% controversy recovery",
  nostalgia:        "+35% OG loyalty · −25% trend chaser acquisition",
  hedonism:         "+40% casual acquisition · OG ceiling 75",
  intellectualism:  "+25% quality score · −25% casual acquisition",
  fashion_culture:  "+10 brand trust floor · +15% stan formation",
};

function PillarPill({ pillar, isActive, isEditing, onClick, onShowTooltip }) {
  const color = pillar.color;

  return (
    <motion.button
      layout
      onClick={() => isEditing ? onClick?.(pillar.value) : onShowTooltip?.(pillar.value)}
      className="relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-left transition-all"
      style={{
        background: isActive ? `${color}18` : "rgba(255,255,255,0.03)",
        border: `1px solid ${isActive ? `${color}50` : "rgba(255,255,255,0.06)"}`,
        cursor: isEditing ? "pointer" : "default",
        boxShadow: isActive ? `0 0 12px ${color}25, 0 0 24px ${color}12` : "none",
      }}
      whileTap={isEditing ? { scale: 0.96 } : {}}
    >
      <span className="text-sm flex-shrink-0">{pillar.icon}</span>
      <span
        className="text-[11px] font-bold tracking-tight"
        style={{ color: isActive ? color : "rgba(255,255,255,0.3)" }}
      >
        {pillar.label}
      </span>
      {isActive && (
        <motion.div
          layoutId={`pillar-glow-${pillar.value}`}
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            boxShadow: `inset 0 0 12px ${color}15, 0 0 16px ${color}20`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.button>
  );
}

export default function PillarGrid({
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
  const [tooltipPillar, setTooltipPillar] = useState(null);
  const tooltipRef = useRef(null);

  // Dismiss tooltip on outside click
  useEffect(() => {
    if (!tooltipPillar) return;
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setTooltipPillar(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [tooltipPillar]);

  const effectivePillars = editing ? pillarDraft : activePillars;

  const sparkData = (alignmentHistory || []).slice(-20).map((v, i) => ({
    turn: i,
    value: Number(v) || 50,
  }));

  const tooltipData = tooltipPillar
    ? FANBASE_PILLARS.find(p => p.value === tooltipPillar)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Identity Pillars
        </span>
        {!editing && (
          <button
            onClick={onStartEdit}
            className="flex items-center gap-1 text-[10px] font-semibold text-white/30 hover:text-white/60 transition-colors"
          >
            <Edit3 size={10} /> Edit
          </button>
        )}
      </div>

      {/* 12-pillar grid: 3 columns */}
      <div className="grid grid-cols-3 gap-2">
        {FANBASE_PILLARS.map((pillar) => (
          <PillarPill
            key={pillar.value}
            pillar={pillar}
            isActive={effectivePillars.includes(pillar.value)}
            isEditing={editing}
            onClick={onTogglePillar}
            onShowTooltip={(val) => setTooltipPillar(tooltipPillar === val ? null : val)}
          />
        ))}
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltipData && !editing && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 px-3 py-2.5 rounded-xl"
            style={{
              background: `${tooltipData.color}12`,
              border: `1px solid ${tooltipData.color}30`,
              boxShadow: `0 0 16px ${tooltipData.color}15`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{tooltipData.icon}</span>
              <span className="text-[11px] font-bold" style={{ color: tooltipData.color }}>
                {tooltipData.label}
              </span>
              <span className="text-[10px] text-white/30">— {tooltipData.desc}</span>
            </div>
            <div className="text-[10px] text-white/50 leading-relaxed">
              {PILLAR_EFFECTS[tooltipData.value] || ""}
            </div>
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
            {pillarDraft.length}/{MAX_PILLARS} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/40 border border-white/[0.08] hover:border-white/[0.15] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSavePillars}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
              style={{
                borderColor: "rgba(167,139,250,0.4)",
                background: "rgba(167,139,250,0.12)",
                color: "#c4b5fd",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? <Loader2 size={12} className="fandom-spin" /> : "Save"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Alignment sparkline */}
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
                  stroke="#7c3aed"
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
