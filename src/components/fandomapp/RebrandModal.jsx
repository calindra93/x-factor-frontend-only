import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { FANBASE_PILLARS, MAX_PILLARS } from "@/data/fanbasePillars";

const PILLAR_EFFECTS = {
  loyalty:          "+OG retention, slower churn",
  chaos:            "+Viral spread, riskier moments",
  empowerment:      "+Stan recruitment, brand safety",
  exclusivity:      "+Merch margin, inner-circle loyalty",
  romance:          "+Emotional engagement, streaming depth",
  rebellion:        "+Controversy shield, underground cred",
  internet_fluency: "+LoopTok boost, meme trend surfing",
  spirituality:     "+Fandom calm, lower toxicity baseline",
  nostalgia:        "+Catalogue streams, nostalgia mood bonus",
  hedonism:         "+Festival buzz, casual fan growth",
  intellectualism:  "+Critical favor, lyric-driven press",
  fashion_culture:  "+Brand deal affinity, aesthetic trends",
};

const REBRAND_COST = 2000;

export default function RebrandModal({ fandom, profile, onClose, onRebrand, saving }) {
  const validPillarValues = new Set(FANBASE_PILLARS.map(p => p.value));
  const [pillarDraft, setPillarDraft] = useState(
    () => (fandom?.identity_pillars || []).filter(v => validPillarValues.has(v))
  );
  const [nameInput, setNameInput] = useState(fandom?.fanbase_name || "");
  const [tooltipPillar, setTooltipPillar] = useState(null);

  const togglePillar = (value) => {
    setPillarDraft(prev =>
      prev.includes(value)
        ? prev.filter(p => p !== value)
        : prev.length < MAX_PILLARS ? [...prev, value] : prev
    );
  };

  const currentValidPillars = (fandom?.identity_pillars || []).filter(v => validPillarValues.has(v));
  const hasChanges =
    nameInput.trim() !== (fandom?.fanbase_name || "") ||
    JSON.stringify([...pillarDraft].sort()) !== JSON.stringify([...currentValidPillars].sort());

  const income = Number(profile?.income) || 0;
  const canAfford = income >= REBRAND_COST;

  const handleSubmit = () => {
    if (!hasChanges || !canAfford || saving) return;
    onRebrand({ nickname: nameInput.trim(), identityPillars: pillarDraft });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, #17171F 0%, #0D0D11 100%)",
          border: "1px solid rgba(167,139,250,0.12)",
          boxShadow: "0 0 60px rgba(167,139,250,0.08)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-sm font-extrabold tracking-tight text-white">Rebrand</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} className="text-white/40" />
          </button>
        </div>

        {/* Warning Banner */}
        <div
          className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl mb-5"
          style={{
            background: "rgba(239,83,80,0.06)",
            border: "1px solid rgba(239,83,80,0.18)",
          }}
        >
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-red-300/80">
            <span className="font-bold text-red-400">Rebrand costs ${REBRAND_COST.toLocaleString()}</span>
            <span className="text-white/20 mx-1.5">·</span>
            OGs lose 15 loyalty
            <span className="text-white/20 mx-1.5">·</span>
            Alignment resets for 3 ticks
          </div>
        </div>

        {/* Fanbase Name */}
        <div className="mb-5">
          <label className="text-[9px] font-bold uppercase tracking-widest text-white/30 block mb-2">
            Fanbase Name
          </label>
          <input
            className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white placeholder-white/15"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              outline: "none",
            }}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Name your fanbase…"
            maxLength={40}
          />
        </div>

        {/* Pillar Picker */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[9px] font-bold uppercase tracking-widest text-white/30">
              Identity Pillars
            </label>
            <span className="text-[10px] font-semibold text-white/25">
              {pillarDraft.length}/{MAX_PILLARS}
              {pillarDraft.length >= MAX_PILLARS && (
                <span className="text-white/15 ml-1">— tap active to swap</span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {FANBASE_PILLARS.map(pillar => {
              const isActive = pillarDraft.includes(pillar.value);
              const atMax = pillarDraft.length >= MAX_PILLARS && !isActive;
              return (
                <button
                  key={pillar.value}
                  onClick={() => togglePillar(pillar.value)}
                  onMouseEnter={() => setTooltipPillar(pillar.value)}
                  onMouseLeave={() => setTooltipPillar(null)}
                  className="relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-left transition-all duration-200"
                  style={{
                    background: isActive ? `${pillar.color}15` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isActive ? `${pillar.color}40` : "rgba(255,255,255,0.06)"}`,
                    boxShadow: isActive ? `0 0 12px ${pillar.color}18` : "none",
                    opacity: atMax ? 0.5 : 1,
                    cursor: atMax ? "default" : "pointer",
                  }}
                >
                  <span className="text-sm">{pillar.icon}</span>
                  <span
                    className="text-[10px] font-bold truncate"
                    style={{ color: isActive ? pillar.color : "rgba(255,255,255,0.35)" }}
                  >
                    {pillar.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId={`rebrand-glow-${pillar.value}`}
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at center, ${pillar.color}08 0%, transparent 70%)`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {tooltipPillar && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="px-3 py-2 rounded-xl mb-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {(() => {
                const p = FANBASE_PILLARS.find(p => p.value === tooltipPillar);
                if (!p) return null;
                return (
                  <>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs">{p.icon}</span>
                      <span className="text-[11px] font-bold" style={{ color: p.color }}>{p.label}</span>
                      <span className="text-[9px] text-white/25">— {p.desc}</span>
                    </div>
                    <div className="text-[10px] text-white/40">{PILLAR_EFFECTS[p.value]}</div>
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!hasChanges || !canAfford || saving}
          className="w-full py-3 rounded-xl text-[12px] font-extrabold uppercase tracking-wider transition-all duration-200"
          style={{
            background: hasChanges && canAfford
              ? "linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(236,72,153,0.18) 100%)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${hasChanges && canAfford ? "rgba(167,139,250,0.35)" : "rgba(255,255,255,0.06)"}`,
            color: hasChanges && canAfford ? "#c4b5fd" : "rgba(255,255,255,0.15)",
            boxShadow: hasChanges && canAfford ? "0 0 20px rgba(167,139,250,0.1)" : "none",
            cursor: !hasChanges || !canAfford || saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <Loader2 size={14} className="fandom-spin mx-auto" />
          ) : !canAfford ? (
            `Not enough funds (need $${REBRAND_COST.toLocaleString()})`
          ) : (
            `Rebrand ($${REBRAND_COST.toLocaleString()})`
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}
