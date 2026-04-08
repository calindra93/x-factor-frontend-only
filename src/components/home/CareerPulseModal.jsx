import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Award, Flame, Globe, Lock, RefreshCw, Sparkles, Star, TrendingUp, X, Zap } from "lucide-react";
import { isSupabaseConfigured, supabaseClient } from "@/lib/supabaseClient";

function fmtCompact(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-white/[0.06] ${className}`} />;
}

const LANE_META = {
  commercial_heat: {
    full: "Commercial Heat", short: "Hit Lane",
    icon: Flame, color: "#fb923c",
    bg: "rgba(251,146,60,0.14)", border: "rgba(251,146,60,0.28)",
    personality: "an absolute commercial success and hitmaker",
  },
  cultural_influence: {
    full: "Cultural Influence", short: "Taste Lane",
    icon: Sparkles, color: "#a78bfa",
    bg: "rgba(167,139,250,0.14)", border: "rgba(167,139,250,0.28)",
    personality: "a tastemaker who shapes culture and conversation",
  },
  live_draw: {
    full: "Live Draw", short: "Stage Lane",
    icon: Zap, color: "#34d399",
    bg: "rgba(52,211,153,0.14)", border: "rgba(52,211,153,0.28)",
    personality: "a magnetic live performer who owns the stage",
  },
  industry_respect: {
    full: "Industry Respect", short: "Prestige Lane",
    icon: Star, color: "#fbbf24",
    bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.28)",
    personality: "a respected artist the industry loves working with",
  },
  core_fan_devotion: {
    full: "Core Fan Devotion", short: "Loyalty Lane",
    icon: Award, color: "#f472b6",
    bg: "rgba(244,114,182,0.14)", border: "rgba(244,114,182,0.28)",
    personality: "an artist with a deeply loyal and devoted fanbase",
  },
};

const TONE_COLORS = {
  violet: { accent: "#c084fc", bg: "rgba(192,132,252,0.14)", border: "rgba(192,132,252,0.28)", bar: "#c084fc" },
  gold:   { accent: "#fbbf24", bg: "rgba(251,191,36,0.14)",  border: "rgba(251,191,36,0.28)",  bar: "#fbbf24" },
  emerald:{ accent: "#34d399", bg: "rgba(52,211,153,0.14)",  border: "rgba(52,211,153,0.28)",  bar: "#34d399" },
  amber:  { accent: "#f59e0b", bg: "rgba(245,158,11,0.14)",  border: "rgba(245,158,11,0.28)",  bar: "#f59e0b" },
  slate:  { accent: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.20)", bar: "#94a3b8" },
};

function LaneIdentityBlock({ primaryLane, secondaryLane, blurb }) {
  const pm = LANE_META[primaryLane];
  const sm = LANE_META[secondaryLane];
  if (!pm) return null;
  const PIcon = pm.icon;
  const SIcon = sm?.icon;

  const combinedLabel = sm
    ? `${pm.full} & ${sm.full}`
    : pm.full;

  return (
    <div
      className="rounded-[22px] px-4 py-3.5"
      style={{ background: pm.bg, border: `1px solid ${pm.border}` }}
    >
      {/* Icon row */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${pm.color}22`, border: `1px solid ${pm.border}` }}
        >
          <PIcon className="h-3.5 w-3.5" style={{ color: pm.color }} />
        </div>
        {SIcon && (
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
            style={{ background: sm ? `${sm.color}22` : undefined, border: sm ? `1px solid ${sm.border}` : undefined }}
          >
            <SIcon className="h-3.5 w-3.5" style={{ color: sm?.color }} />
          </div>
        )}
        <div className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: pm.color }}>Your Lane Identity</div>
      </div>
      <div className="text-[13px] font-black leading-tight text-white/95">{combinedLabel}</div>
      {blurb && <p className="mt-1.5 text-[10px] leading-relaxed text-white/80">{blurb}</p>}
    </div>
  );
}

function ProgressBar({ pct = 0, color = "#c084fc" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

function buildLanePersonality(primaryLane, secondaryLane) {
  const primary = LANE_META[primaryLane]?.personality || null;
  const secondaryLabel = LANE_META[secondaryLane]?.full || String(secondaryLane || "").replace(/_/g, " ");
  if (primary && secondaryLane) {
    return `You've earned a reputation for being ${primary}. ${secondaryLabel} is your secondary strength. Keep it up.`;
  }
  if (primary) {
    return `You've earned a reputation for being ${primary}. Keep building on this foundation.`;
  }
  return "Your career identity is still developing. Keep stacking proof.";
}

function buildSnapshotState(data, context = {}) {
  if (!data) {
    return {
      hero: context?.laneLabel || "Career Snapshot",
      value: context?.promotionValue || "—",
      support: context?.promotionSummary || "Unable to read snapshot.",
      tone: "slate",
      progressPct: 0,
    };
  }

  const currentStageOrder = Number(data.current_stage_order || 1);
  const maxStageOrder = Number(data.max_stage_order || currentStageOrder || 1);
  const pendingStageOrder = Number(data.pending_stage_order || 0);
  const pendingStageStreak = Number(data.pending_stage_streak || 0);
  const nextStageThreshold = Number(data.next_stage_threshold || 0);
  const monthlyListeners = Number(data.monthly_listeners || 0);
  const listenerGap = Math.max(0, nextStageThreshold - monthlyListeners);
  const isCapped = currentStageOrder >= maxStageOrder || !data.next_stage_order;
  const hasPendingPromotion = pendingStageOrder === currentStageOrder + 1;
  const listenerPct = nextStageThreshold > 0 ? Math.min(100, Math.round((monthlyListeners / nextStageThreshold) * 100)) : 0;

  if (hasPendingPromotion) {
    return {
      hero: "Promotion Review",
      value: `${pendingStageStreak}/2 turns`,
      support: context?.promotionSummary || `Targeting ${data.pending_stage_name || `Stage ${pendingStageOrder}`}`,
      tone: "violet",
      progressPct: (pendingStageStreak / 2) * 100,
    };
  }

  if (isCapped) {
    return {
      hero: "Stage Cap",
      value: data.cap_stage_name || `Stage ${maxStageOrder}`,
      support: context?.promotionSummary || "You've reached the current cap for this lane.",
      tone: "amber",
      progressPct: 100,
    };
  }

  return {
    hero: listenerGap > 0 ? "Building Toward Next" : "Threshold Reached",
    value: listenerGap > 0 ? `-${fmtCompact(listenerGap)}` : data.next_stage_name || `Stage ${data.next_stage_order}`,
    support: context?.promotionSummary || (listenerGap > 0
      ? `${fmtCompact(monthlyListeners)} of ${fmtCompact(nextStageThreshold)} listeners needed for ${data.next_stage_name || `Stage ${data.next_stage_order}`}`
      : `You're in range for ${data.next_stage_name || `Stage ${data.next_stage_order}`}`),
    tone: listenerGap > 0 ? "emerald" : "gold",
    progressPct: listenerPct,
  };
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
        <AlertCircle className="h-5 w-5 text-red-300" />
      </div>
      <p className="max-w-[240px] text-sm leading-relaxed text-white/60">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/[0.12]"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

export function getCareerPulseSnapshotCard(snapshot, fallback = {}, context = {}) {
  const state = buildSnapshotState(snapshot, context);
  const resolvedHero = snapshot ? state.hero : (fallback?.hero || state.hero);
  const resolvedValue = snapshot ? state.value : (fallback?.value || state.value);
  const resolvedTone = snapshot ? state.tone : (fallback?.tone || state.tone);
  const fallbackSupport = Array.isArray(fallback?.support) ? fallback.support : [
    fallback?.promotionSummary,
    fallback?.trendSummary,
    fallback?.negatives?.[0] || fallback?.positives?.[0],
  ].filter(Boolean);
  const resolvedSupport = snapshot ? [state.support, fallback?.trendSummary].filter(Boolean) : (fallbackSupport.length ? fallbackSupport : [state.support]);
  const resolvedFooter = snapshot
    ? "Open the snapshot for a plain-language read on this turn."
    : (fallback?.footer || "Open the snapshot for the cleanest read on your next move.");

  return {
    hero: resolvedHero,
    value: resolvedValue,
    tone: resolvedTone,
    support: resolvedSupport,
    footer: resolvedFooter,
    ctaLabel: "Open Snapshot",
    action: "open-career-pulse-modal",
  };
}

export default function CareerPulseModal({ artistId, initialSnapshot = null, context = null, open, onClose }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSnapshot = useCallback(async () => {
    if (!artistId || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabaseClient
        .from("v_career_progression_snapshot")
        .select("*")
        .eq("artist_id", artistId)
        .single();
      if (queryError) throw queryError;
      setSnapshot(data || null);
    } catch (fetchError) {
      setError(fetchError?.message || "Failed to load progression snapshot.");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => { setSnapshot(initialSnapshot || null); }, [initialSnapshot]);
  useEffect(() => { if (open) fetchSnapshot(); }, [open, fetchSnapshot]);

  const state = useMemo(() => buildSnapshotState(snapshot, context || {}), [snapshot, context]);
  const tone = TONE_COLORS[state.tone] || TONE_COLORS.slate;
  const primaryLaneMeta = LANE_META[snapshot?.dominant_lane] || null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[320] flex items-end justify-center bg-black/60 px-3 pb-4 pt-10 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 28, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="flex w-full max-w-[344px] flex-col overflow-hidden rounded-[30px] border"
            style={{
              background: "#0e0e18",
              borderColor: tone.border,
              boxShadow: `0 0 0 1px ${tone.border}, 0 32px 96px rgba(0,0,0,0.6)`,
              maxHeight: "calc(100dvh - 48px)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Career snapshot"
          >
            {/* Ambient glow behind header */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-40"
              style={{ background: `radial-gradient(ellipse at 50% 0%, ${tone.accent}44, transparent 70%)` }}
            />

            {/* Drag handle */}
            <div className="relative flex justify-center pt-3 pb-1">
              <div className="h-1 w-9 rounded-full" style={{ background: tone.accent, opacity: 0.4 }} />
            </div>

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 px-5 pb-4 pt-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5" style={{ color: tone.accent }}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Career Snapshot</span>
                </div>
                <h2 className="mt-1.5 text-[22px] font-black leading-tight tracking-[-0.03em] text-white/95">
                  {state.hero}
                </h2>
                {/* Lane chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {snapshot?.dominant_lane && primaryLaneMeta && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold"
                      style={{ background: primaryLaneMeta.bg, border: `1px solid ${primaryLaneMeta.border}`, color: primaryLaneMeta.color }}
                    >
                      <primaryLaneMeta.icon className="h-2.5 w-2.5" />
                      {primaryLaneMeta.full} · {primaryLaneMeta.short}
                    </span>
                  )}
                  {snapshot?.secondary_lane && LANE_META[snapshot.secondary_lane] && (() => {
                    const m = LANE_META[snapshot.secondary_lane];
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold"
                        style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.color }}
                      >
                        <m.icon className="h-2.5 w-2.5" />
                        {m.full} · {m.short}
                      </span>
                    );
                  })()}
                  {context?.archetypeLabel && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                      {context.archetypeLabel}
                    </span>
                  )}
                  {context?.weatherFitLabel && (
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold text-cyan-200">
                      {context.weatherFitLabel}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close career snapshot"
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/50 transition-colors hover:bg-white/[0.14] active:scale-95"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px" style={{ background: tone.border }} />

            {/* Body — scrollable, hidden scrollbar */}
            <div
              className="space-y-2.5 overflow-y-auto px-5 pb-6 pt-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {loading && (
                <div className="space-y-2.5" aria-busy="true">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}
              {!loading && error && <ErrorState message={error} onRetry={fetchSnapshot} />}
              {!loading && !error && (
                <>
                  {/* ── Promotion block ── */}
                  <div
                    className="overflow-hidden rounded-[22px] px-4 py-4"
                    style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
                  >
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.accent }}>Current Stage & Distance</p>
                        <div className="mt-1 text-[28px] font-black leading-none tracking-[-0.05em] text-white/95">{state.value}</div>
                      </div>
                      <div
                        className="rounded-full px-2.5 py-1 text-[9px] font-bold"
                        style={{ background: `${tone.accent}22`, border: `1px solid ${tone.border}`, color: tone.accent }}
                      >
                        {context?.nextStageLabel || snapshot?.next_stage_name || snapshot?.pending_stage_name || "Next Stage"}
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-white/80">{state.support}</p>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-white/50">Progress to next stage</span>
                        <span className="text-[9px] font-bold" style={{ color: tone.accent }}>{state.progressPct}%</span>
                      </div>
                      <ProgressBar pct={state.progressPct} color={tone.bar} />
                    </div>
                  </div>

                  {/* ── Lane identity ── */}
                  {snapshot?.dominant_lane && (
                    <LaneIdentityBlock
                      primaryLane={snapshot.dominant_lane}
                      secondaryLane={snapshot.secondary_lane}
                      blurb={buildLanePersonality(snapshot.dominant_lane, snapshot.secondary_lane)}
                    />
                  )}

                  {/* ── Trend climate ── */}
                  <div
                    className="flex items-start gap-3 rounded-[22px] px-4 py-3.5"
                    style={{ background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.22)" }}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(96,165,250,0.18)", border: "1px solid rgba(96,165,250,0.28)" }}>
                      <Globe className="h-3.5 w-3.5 text-blue-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-300">Trend Climate</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/85">{context?.trendSummary || "No major climate read yet."}</p>
                    </div>
                  </div>

                  {/* ── Helping you ── */}
                  <div
                    className="rounded-[22px] px-4 py-3.5"
                    style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.22)" }}
                  >
                    <div className="mb-2 flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-emerald-300" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">Helping you</span>
                    </div>
                    <div className="space-y-1.5">
                      {(context?.positives || []).length > 0
                        ? context.positives.slice(0, 2).map((line) => (
                            <div key={line} className="flex items-start gap-2">
                              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                              <p className="text-[10px] leading-snug text-white/85">{line}</p>
                            </div>
                          ))
                        : <p className="text-[10px] text-white/55">No strong positive modifier right now.</p>}
                    </div>
                  </div>

                  {/* ── Working against you ── */}
                  <div
                    className="rounded-[22px] px-4 py-3.5"
                    style={{ background: "rgba(251,113,133,0.10)", border: "1px solid rgba(251,113,133,0.22)" }}
                  >
                    <div className="mb-2 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-rose-300" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-rose-300">Working against you</span>
                    </div>
                    <div className="space-y-1.5">
                      {(context?.negatives || []).length > 0
                        ? context.negatives.slice(0, 2).map((line) => (
                            <div key={line} className="flex items-start gap-2">
                              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                              <p className="text-[10px] leading-snug text-white/85">{line}</p>
                            </div>
                          ))
                        : <p className="text-[10px] text-white/55">No major negative pressure right now.</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
