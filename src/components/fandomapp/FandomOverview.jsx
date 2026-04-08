import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp, Shield, Sparkles, Moon, Sun } from "lucide-react";
import { fmt } from "@/utils/numberFormat";
import PulseRing from "@/components/fandomapp/PulseRing";
import SegmentDonut from "@/components/fandomapp/SegmentDonut";
import { FANBASE_PILLARS } from "@/data/fanbasePillars";

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

const SEGMENT_CONFIG = {
  og:           { label: "OGs" },
  core:         { label: "Core" },
  casual:       { label: "Casuals" },
  trend_chaser: { label: "Trend Chasers" },
  stan:         { label: "Stans" },
  critic:       { label: "Critics" },
};

function RitualCard({ ritual, onGo }) {
  const locked = !ritual.available;
  const platformId = String(ritual.platformId || ritual.platform || "").toLowerCase();
  const platformClass = `fandom-platform-badge--${platformId.replace(/\s/g, "")}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fandom-ritual-card ${locked ? "fandom-ritual-card--locked" : ""}`}
      onClick={!locked ? onGo : undefined}
    >
      <div className="fandom-ritual-icon">
        {platformId === "xpress" ? "✕" :
         platformId === "looptok" ? "⟳" :
         platformId === "vidwave" ? "▶" : "◈"}
      </div>
      <div className="fandom-ritual-body">
        <div className="fandom-ritual-name">{ritual.name}</div>
        <div className="fandom-ritual-effect">{ritual.effect}</div>
        {ritual.segmentSelector && ritual.segmentOptions?.length > 0 && (
          <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <select
              value={ritual.selectedSegment || ritual.segmentOptions[0]?.value || "stan"}
              onChange={(e) => ritual.onSegmentChange?.(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs"
            >
              {ritual.segmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {locked && ritual.lockReason && (
          <div className="fandom-ritual-lock">🔒 {ritual.lockReason}</div>
        )}
      </div>
      <div className="fandom-ritual-right">
        <span className={`fandom-platform-badge ${platformClass}`}>{ritual.platform || ritual.platformId}</span>
        {!locked && <span className="fandom-ritual-go">{ritual.loading ? "..." : "Go →"}</span>}
      </div>
    </motion.div>
  );
}

function Section({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="fandom-section-card"
    >
      {children}
    </motion.div>
  );
}

export default function FandomOverview({
  profile,
  fandom,
  fanProfile,
  canonicalSignals,
  segments,
  wars,
  controversies,
  rituals,
  // rebrand
  onOpenRebrand,
  // ritual state
  ritualLoadingKey,
  selectedRitualSegments, setSelectedRitualSegments,
  handleRitualGo,
  // dark mode + directives
  onGoDark,
  onEndDarkMode,
  onSetDirective,
  saving,
}) {
  const [driftOpen, setDriftOpen] = useState(false);
  const [tooltipPillar, setTooltipPillar] = useState(null);
  const [darkDaysSlider, setDarkDaysSlider] = useState(3);
  const tooltipRef = useRef(null);

  // Dismiss pillar tooltip on outside click
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

  const ACTIVE_FAN_WAR_STATUSES = new Set(["active", "escalated", "cooling"]);

  // Derived data
  const segmentTotal = segments.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const profileFans = Number(profile?.fans) || Number(profile?.followers) || 0;
  const totalFans = Math.max(segmentTotal, profileFans);

  const activePillars = fandom?.identity_pillars || [];
  const fanMorale     = Number(fandom?.fan_morale) || 50;
  const toxicity      = Number(fandom?.toxicity_score) || 0;
  const alignScore    = Number(fandom?.alignment_score) || 50;
  const fanbaseName   = fandom?.fanbase_name;

  const normalizedWars = wars.filter(war => ACTIVE_FAN_WAR_STATUSES.has(war.status || "active"));
  const isDarkMode = fandom?.dark_mode_until != null;
  const hasActiveWar = normalizedWars.length > 0;

  // Fan saturation
  const releaseCadence = fandom?.release_cadence;
  const recentReleases = releaseCadence?.recent || [];
  const currentTurnApprox = Number(fandom?.updated_tick) || 0;
  const majorCount = recentReleases.filter(
    r => ["album", "ep", "deluxe"].includes(r.kind) && currentTurnApprox - (r.turnId || r.turn_id || 0) <= 14
  ).length;
  const nonRolloutSingles = recentReleases.filter(
    r => r.kind === "single" && !r.isRolloutSingle && !r.is_rollout_single && currentTurnApprox - (r.turnId || r.turn_id || 0) <= 7
  ).length;
  const isSaturated = majorCount >= 2 || nonRolloutSingles >= 3;

  return (
    <>
      {/* ═══ §1 — NERVE CENTER HEADER ═══ */}
      <Section delay={0}>
        <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full pointer-events-none" style={{
          background: "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)",
          filter: "blur(30px)",
        }} />

        {/* Fanbase Name + Rebrand */}
        <div className="mb-4 relative flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight" style={{
            background: fanbaseName ? "linear-gradient(135deg, #e0c3fc 0%, #a78bfa 60%, #ec4899 100%)" : undefined,
            WebkitBackgroundClip: fanbaseName ? "text" : undefined,
            WebkitTextFillColor: fanbaseName ? "transparent" : undefined,
            backgroundClip: fanbaseName ? "text" : undefined,
            color: fanbaseName ? undefined : "rgba(255,255,255,0.35)",
          }}>
            {fanbaseName || "Unnamed Fanbase"}
          </span>
          <button
            onClick={onOpenRebrand}
            className="fandom-action-pill fandom-action-pill--active flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold"
            style={{
              "--pill-accent": "#a78bfa",
              "--pill-accent-soft": "rgba(167,139,250,0.12)",
              "--pill-accent-border": "rgba(167,139,250,0.3)",
            }}
          >
            <Sparkles size={10} /> Rebrand
          </button>
        </div>

        {/* Pulse Ring + Quick Stats */}
        <div className="flex items-start gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{
              background: "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)",
              filter: "blur(16px)",
              transform: "scale(1.5)",
            }} />
            <PulseRing alignment={alignScore} morale={fanMorale} toxicity={toxicity} />
          </div>
          <div className="flex-1 pt-1">
            <div className="mb-3">
              <div className="text-2xl font-black tracking-tight text-white leading-none">{fmt(totalFans)}</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-0.5">Total Fans</div>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Morale", value: fanMorale, color: "#C9A84C", glow: "rgba(201,168,76,0.15)" },
                { label: "Alignment", value: alignScore, color: "#a78bfa", glow: "rgba(167,139,250,0.15)" },
                { label: "Toxicity", value: toxicity, color: toxicity >= 60 ? "#EF5350" : toxicity >= 40 ? "#F7A54B" : "#7C6EF7", glow: toxicity >= 60 ? "rgba(239,83,80,0.15)" : "rgba(124,110,247,0.1)" },
              ].map(g => (
                <div key={g.label} className="flex items-center gap-2">
                  <span className="text-[8px] font-bold uppercase tracking-widest min-w-[44px]" style={{ color: `${g.color}80` }}>{g.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: g.color, boxShadow: `0 0 8px ${g.glow}` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${g.value}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="text-[11px] font-extrabold min-w-[24px] text-right tabular-nums" style={{ color: g.color }}>
                    {g.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Active Identity Pillars — inline pills */}
        {activePillars.length > 0 && (
          <div className="mt-4">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/45 block mb-2">Identity</span>
            <div className="flex flex-wrap gap-1.5">
              {activePillars.map(pv => {
                const pillar = FANBASE_PILLARS.find(p => p.value === pv);
                if (!pillar) return null;
                const isTooltipOpen = tooltipPillar === pv;
                return (
                  <button
                    key={pv}
                    onClick={() => setTooltipPillar(isTooltipOpen ? null : pv)}
                    className={`fandom-action-pill flex items-center gap-1 px-2 py-1 ${isTooltipOpen ? "fandom-action-pill--active" : ""}`}
                    style={{
                      "--pill-accent": pillar.color,
                      "--pill-accent-soft": `${pillar.color}12`,
                      "--pill-accent-border": `${pillar.color}30`,
                    }}
                  >
                    <span className="text-[11px]">{pillar.icon}</span>
                    <span className="text-[10px] font-bold" style={{ color: pillar.color }}>{pillar.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Pillar tooltip */}
            <AnimatePresence>
              {tooltipPillar && (() => {
                const p = FANBASE_PILLARS.find(p => p.value === tooltipPillar);
                if (!p) return null;
                return (
                  <motion.div
                    ref={tooltipRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-2 px-3 py-2 rounded-xl"
                    style={{
                      background: `${p.color}08`,
                      border: `1px solid ${p.color}20`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs">{p.icon}</span>
                      <span className="text-[11px] font-bold" style={{ color: p.color }}>{p.label}</span>
                      <span className="text-[9px] text-white/25">— {p.desc}</span>
                    </div>
                    <div className="text-[10px] text-white/40">{PILLAR_EFFECTS[p.value]}</div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </div>
        )}

        {/* No pillars — prompt to set up */}
        {activePillars.length === 0 && (
          <div className="mt-4 text-center text-[10px] text-white/40">
            No identity pillars set — tap <span className="text-purple-400/70">Rebrand</span> to choose
          </div>
        )}

        {/* Warnings */}
        {fandom?.identity_crisis_active && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(239,83,80,0.06)", border: "1px solid rgba(239,83,80,0.18)" }}
          >
            <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-red-400">Identity Crisis — labor halved until alignment ≥ 50</span>
          </motion.div>
        )}
        {isSaturated && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-2 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(247,165,75,0.05)", border: "1px solid rgba(247,165,75,0.15)" }}
          >
            <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-amber-400">Fan Saturation — ease up on releases</span>
          </motion.div>
        )}

        {/* Go Dark — dark mode toggle */}
        {onGoDark && (
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {isDarkMode ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Moon size={13} className="text-indigo-400" />
                    <span className="text-[11px] font-bold text-indigo-400">Dark Mode Active</span>
                  </div>
                  <button
                    onClick={onEndDarkMode}
                    disabled={saving}
                    className={`fandom-action-pill ${saving ? "fandom-action-pill--disabled" : "fandom-action-pill--active"} flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold`}
                    style={{
                      "--pill-accent": "#fbbf24",
                      "--pill-accent-soft": "rgba(251,191,36,0.12)",
                      "--pill-accent-border": "rgba(251,191,36,0.28)",
                    }}
                  >
                    <Sun size={10} /> Emerge
                  </button>
                </div>
                <div className="text-[10px] text-white/50">
                  All labor paused. Fatigue recovering at 2× speed. Stan morale rising.
                </div>
              </motion.div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Moon size={13} className="text-white/50" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Go Dark</span>
                  </div>
                  <span className="text-[9px] text-white/40">Disappear for {darkDaysSlider} day{darkDaysSlider > 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="range"
                    min={1}
                    max={7}
                    value={darkDaysSlider}
                    onChange={e => setDarkDaysSlider(Number(e.target.value))}
                    className="flex-1 h-1 accent-indigo-500"
                    style={{ accentColor: "#6366f1" }}
                  />
                  <span className="text-xs font-bold text-indigo-400 min-w-[28px] text-right">{darkDaysSlider}d</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onGoDark(darkDaysSlider)}
                    disabled={saving || hasActiveWar}
                    className={`fandom-action-pill fandom-action-pill--block ${saving || hasActiveWar ? "fandom-action-pill--disabled" : "fandom-action-pill--active"} py-2 text-[11px] font-bold`}
                    style={{
                      "--pill-accent": "#818cf8",
                      "--pill-accent-soft": "rgba(99,102,241,0.12)",
                      "--pill-accent-border": "rgba(99,102,241,0.28)",
                    }}
                  >
                    {saving ? "…" : hasActiveWar ? "Can't go dark during a war" : `Go Dark — ${darkDaysSlider} day${darkDaysSlider > 1 ? "s" : ""}`}
                  </button>
                </div>
                <div className="text-[9px] text-white/40 mt-1.5 leading-relaxed">
                  Labor drops to zero. Fatigue recovers at 2× speed. Stan morale slowly rises. Comeback streaming boost when you emerge.
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ═══ §2 — SEGMENT DONUT + LABOR FORCE ═══ */}
      <Section delay={0.08}>
        <SegmentDonut
          segments={segments}
          fanProfile={fanProfile}
          canonicalSignals={canonicalSignals}
          onSetDirective={onSetDirective}
          isDarkMode={isDarkMode}
          wars={normalizedWars}
          controversies={controversies}
          fandom={fandom}
        />
      </Section>

      {/* ═══ §3 — FANDOM RITUALS ═══ */}
      <Section delay={0.16}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            Fandom Rituals
          </span>
          <span className="text-[9px] text-white/40">via your platforms</span>
        </div>
        {rituals.length === 0 ? (
          <div className="text-center text-white/40 text-xs py-2">Loading rituals…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rituals.map((ritual) => (
              <RitualCard
                key={ritual.key}
                ritual={{
                  ...ritual,
                  loading: ritualLoadingKey === ritual.key,
                  selectedSegment: selectedRitualSegments[ritual.key] || "stan",
                  segmentOptions: ritual.segmentSelector
                    ? segments
                        .map((segment) => ({
                          value: segment.segment_type,
                          label: SEGMENT_CONFIG[segment.segment_type]?.label || segment.segment_type,
                        }))
                        .filter((segment, index, list) => segment.value && list.findIndex((entry) => entry.value === segment.value) === index)
                    : [],
                  onSegmentChange: ritual.segmentSelector
                    ? (segmentType) => setSelectedRitualSegments((prev) => ({ ...prev, [ritual.key]: segmentType }))
                    : undefined,
                }}
                onGo={() => handleRitualGo(ritual)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ═══ §5 — DRIFT REFERENCE (accordion) ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32 }}
        className="fandom-section-card fandom-section-card--muted"
      >
        <button
          onClick={() => setDriftOpen(o => !o)}
          className={`fandom-action-pill fandom-action-pill--block ${driftOpen ? "fandom-action-pill--active" : ""} flex items-center justify-between px-3 py-2`}
          style={{
            "--pill-accent": "#C9A84C",
            "--pill-accent-soft": "rgba(201,168,76,0.12)",
            "--pill-accent-border": "rgba(201,168,76,0.24)",
          }}
        >
          <div className="fandom-section-title" style={{ marginBottom: 0 }}>
            <Shield size={14} /> Drift Reference
          </div>
          {driftOpen ? <ChevronUp size={14} color="var(--text-3)" /> : <ChevronDown size={14} color="var(--text-3)" />}
        </button>
        <AnimatePresence>
          {driftOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="fandom-drift-grid" style={{ marginTop: 14 }}>
                {[
                  ["Casual → Core", "Morale > 70 + Alignment > 60"],
                  ["Core → Stan", "Trust > 75 + Loyalty streak > 3"],
                  ["Core → Casual", "Morale < 30"],
                  ["Casual Churn", "No content for 2+ ticks"],
                  ["Stan → Critic", "Disrespected stan culture"],
                  ["OG Retention", "Protected for a long idle stretch; named fandoms hold better; sell-out still hurts"],
                ].map(([route, cond]) => (
                  <div key={route} className="fandom-drift-item">
                    <span className="fandom-drift-route">{route}</span>
                    <span className="fandom-drift-cond">{cond}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
