import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, TrendingUp, AlertCircle, RefreshCw, BarChart3, Award, Lock,
} from "lucide-react";
import { supabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_STREAK = 2;

// Stage names and thresholds will come from the database
// No hardcoded mappings - use career_stages and progression_stage_thresholds tables

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading progression data">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 text-red-400" />
      </div>
      <p className="text-gray-400 text-sm max-w-[240px] leading-relaxed">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, label }) {
  return (
    <div
      className="h-2 bg-white/[0.06] rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function ProgressionContent({ data }) {
  const {
    current_stage_order,
    pending_stage_order,
    pending_stage_streak,
    max_stage_order,
    monthly_listeners,
    peaked_top_10,
    weeks_2plus,
  } = data;

  // Dev safety guard
  if (import.meta.env.DEV) {
    if (current_stage_order > 10 || pending_stage_order > 10) {
      console.error('[CareerProgressionModal] Invalid stage order detected', data);
    }
  }

  // Next stage logic
  const nextStageOrder = current_stage_order + 1;
  const shouldShowProgress = nextStageOrder <= max_stage_order;

  // Cap logic
  const isCapped = current_stage_order >= max_stage_order;

  // Pending promotion rule
  const hasPendingPromotion =
    pending_stage_order != null && pending_stage_order === current_stage_order + 1;

  const hasChartBonus = peaked_top_10 || weeks_2plus;

  return (
    <div className="space-y-4">

      {/* ── Stage cap badge ── */}
      {max_stage_order < 10 && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-gray-500">Stage Cap:</span>
          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold px-2.5 py-0.5 rounded-full">
            Stage {max_stage_order}
          </span>
        </div>
      )}

      {/* ── Cap callout ── */}
      {isCapped && (
        <div className="rounded-xl bg-amber-500/[0.07] border border-amber-500/25 p-4 flex gap-3 items-start">
          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-amber-300 text-sm leading-relaxed">
            Stage Cap Reached (Stage {max_stage_order})
          </p>
        </div>
      )}

      {/* ── Progress to next stage ── */}
      {shouldShowProgress && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
            Progress to Next Stage
          </p>

          <div className="flex items-center justify-between">
            <p className="text-white font-bold text-base">Stage {nextStageOrder}</p>
            <span className="text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
              Stage {nextStageOrder}/10
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Monthly Listeners</span>
              <span className="text-white font-semibold tabular-nums">
                {fmtNum(monthly_listeners)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending promotion ── */}
      {hasPendingPromotion && (
        <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"
              aria-hidden="true"
            />
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
              Promotion in review
            </p>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Target</span>
              <span className="text-white font-semibold">
                Stage {pending_stage_order}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Streak</span>
              <span className="text-white font-semibold tabular-nums">
                {pending_stage_streak ?? 0}/{REQUIRED_STREAK}
              </span>
            </div>
          </div>

          {/* Streak pip bar */}
          <div className="flex gap-1.5 pt-0.5" aria-label={`Streak: ${pending_stage_streak} of ${REQUIRED_STREAK}`}>
            {Array.from({ length: REQUIRED_STREAK }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i < (pending_stage_streak ?? 0)
                    ? "bg-emerald-400"
                    : "bg-white/[0.08]"
                }`}
              />
            ))}
          </div>

          <p className="text-gray-500 text-[11px] leading-relaxed">
            Hold performance for another turn to lock it in.
          </p>
        </div>
      )}

      {/* ── Chart milestone bonuses ── */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
          Chart Milestone Bonus
        </p>

        {!hasChartBonus ? (
          <p className="text-gray-600 text-xs">No chart milestone bonus currently.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {peaked_top_10 && (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
                <Award className="w-3 h-3 text-amber-400" aria-hidden="true" />
                <span className="text-amber-300 text-xs font-semibold">Peaked Top 10</span>
                <span className="text-amber-400 text-[10px] font-bold">+1</span>
              </div>
            )}
            {weeks_2plus && (
              <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1">
                <BarChart3 className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                <span className="text-cyan-300 text-xs font-semibold">2+ Weeks on Chart</span>
                <span className="text-cyan-400 text-[10px] font-bold">+1</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function CareerProgressionModal({ open, onClose, artistId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSnapshot = useCallback(async () => {
    if (!artistId || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data: row, error: err } = await supabaseClient
        .from("v_career_progression_snapshot")
        .select("*")
        .eq("artist_id", artistId)
        .single();
      if (err) throw err;
      setData(row);
    } catch (e) {
      setError(e?.message || "Failed to load progression data.");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    if (open) fetchSnapshot();
  }, [open, fetchSnapshot]);

  const subtitle =
    data && !loading
      ? `Current Stage: ${data.career_stage} (Stage ${data.current_stage_order}/10)`
      : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-[430px] bg-[#0d0d14] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Career Progression"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-5 h-5 text-purple-400 flex-shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-white font-bold text-base leading-tight">
                    Career Progression
                  </h2>
                  {subtitle && (
                    <p className="text-gray-500 text-[11px] leading-tight mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close career progression"
                className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center transition-colors hover:bg-white/[0.12] active:scale-90"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 pb-8 pt-4">
              {loading && <LoadingSkeleton />}
              {!loading && error && (
                <ErrorState message={error} onRetry={fetchSnapshot} />
              )}
              {!loading && !error && data && (
                <ProgressionContent data={data} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
