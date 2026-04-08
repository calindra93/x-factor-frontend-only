import React from "react";
import { ChevronLeft, DollarSign, Users, MapPin, TrendingUp, TrendingDown, Star, Award, Minus } from "lucide-react";
import { buildPastTourComparison } from "@/lib/tourHistoryModel";
import { formatCurrency } from "@/utils/numberFormat";

// ─── Region flag map ──────────────────────────────────────────────────────────

const REGION_FLAGS = {
  'United States': '🇺🇸',
  'Canada': '🇨🇦',
  'UK': '🇬🇧',
  'Europe': '🇪🇺',
  'Asia': '🌏',
  'Latin America': '🌎',
  'Africa': '🌍',
  'Oceania': '🌏',
};

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ value, pct, label }) {
  if (value === 0 && pct === 0) {
    return (
      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#6b7280" }}>
        <Minus className="w-3 h-3" />
        First tour — no baseline
      </span>
    );
  }
  const positive = value >= 0;
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-bold"
      style={{ color: positive ? "#34d399" : "#f87171" }}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}{pct}% vs avg {label}
    </span>
  );
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function StatCell({ icon: Icon, label, value, sub }) {
  return (
    <div
      className="flex-1 rounded-2xl px-3 py-3 text-center space-y-0.5"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: "#6b7280" }} />
      <p className="font-mono font-black text-sm text-white">{value}</p>
      <p className="text-[9px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>{label}</p>
      {sub && <p className="text-[9px]" style={{ color: "#6b7280" }}>{sub}</p>}
    </div>
  );
}

// ─── Grade badge ─────────────────────────────────────────────────────────────

function GradeBadge({ grade }) {
  return (
    <div
      className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0"
      style={{ background: `${grade.color}18`, border: `1px solid ${grade.color}40` }}
    >
      <span className="text-2xl font-black" style={{ color: grade.color }}>{grade.grade}</span>
      <span className="text-[8px] uppercase tracking-wide" style={{ color: grade.color }}>{grade.label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PastTourDetailSheet({ tour, allPastTours = [], onBack }) {
  if (!tour) return null;

  const comparison = buildPastTourComparison({
    selectedTour: tour,
    completedTours: allPastTours,
  });

  const flag = REGION_FLAGS[tour.region] || "🗺";
  const endedAt = tour.ended_at ?? tour.completed_at ?? tour.updated_at ?? null;
  const endedLabel = endedAt
    ? new Date(endedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const tourName = tour.tour_name ?? tour.name ?? "Unnamed Tour";

  return (
    <div className="space-y-5">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium transition"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        <ChevronLeft className="w-4 h-4" />
        Past Tours
      </button>

      {/* Header */}
      <div
        className="rounded-3xl px-5 py-5"
        style={{
          background: "linear-gradient(145deg, rgba(124,58,237,0.12), rgba(244,114,182,0.06))",
          border: "1px solid rgba(139,92,246,0.2)",
        }}
      >
        <div className="flex items-start gap-4">
          <GradeBadge grade={comparison.grade} />
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white truncate">{tourName}</p>
            <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
              {flag} {tour.region} · {endedLabel}
            </p>
            <div className="mt-2">
              <DeltaBadge
                value={comparison.revenueDeltaVsAverage}
                pct={comparison.revenueDeltaPct}
                label="revenue"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Core stats */}
      <div className="flex gap-2">
        <StatCell
          icon={DollarSign}
          label="Net Revenue"
          value={formatCurrency(comparison.totalRevenue)}
          sub={comparison.avgRevenueEfficiency > 0
            ? `$${comparison.revenueEfficiency.toLocaleString()}/show`
            : `$${comparison.revenueEfficiency.toLocaleString()}/show`}
        />
        <StatCell
          icon={Users}
          label="Attendance"
          value={comparison.totalAttendance >= 1000
            ? `${(comparison.totalAttendance / 1000).toFixed(1)}K`
            : String(comparison.totalAttendance)}
          sub={comparison.attendanceDeltaPct !== 0
            ? `${comparison.attendanceDeltaPct >= 0 ? "+" : ""}${comparison.attendanceDeltaPct}% vs avg`
            : undefined}
        />
        <StatCell
          icon={MapPin}
          label="Shows"
          value={String(comparison.shows)}
        />
      </div>

      {/* Comparison vs average */}
      {allPastTours.length > 1 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="px-4 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#6b7280" }}>
              vs Your Tour Average
            </p>
          </div>
          <div className="px-4 pb-3 pt-1 space-y-2">
            {[
              {
                label: "Net Revenue",
                delta: comparison.revenueDeltaVsAverage,
                pct: comparison.revenueDeltaPct,
                formatted: `${comparison.revenueDeltaVsAverage >= 0 ? "+" : ""}${formatCurrency(comparison.revenueDeltaVsAverage)}`,
              },
              {
                label: "Attendance",
                delta: comparison.attendanceDeltaVsAverage,
                pct: comparison.attendanceDeltaPct,
                formatted: `${comparison.attendanceDeltaVsAverage >= 0 ? "+" : ""}${Math.abs(comparison.attendanceDeltaVsAverage).toLocaleString()} fans`,
              },
              {
                label: "Revenue / Show",
                delta: comparison.revenueEfficiency - comparison.avgRevenueEfficiency,
                pct: comparison.avgRevenueEfficiency > 0
                  ? Math.round(((comparison.revenueEfficiency - comparison.avgRevenueEfficiency) / comparison.avgRevenueEfficiency) * 100)
                  : 0,
                formatted: `$${comparison.revenueEfficiency.toLocaleString()} vs avg $${comparison.avgRevenueEfficiency.toLocaleString()}`,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-1.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <span className="text-xs" style={{ color: "#9ca3af" }}>{row.label}</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold"
                    style={{ color: row.delta >= 0 ? "#34d399" : "#f87171" }}
                  >
                    {row.formatted}
                  </span>
                  {row.pct !== 0 && (
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                      style={{
                        background: row.delta >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                        color: row.delta >= 0 ? "#34d399" : "#f87171",
                      }}
                    >
                      {row.pct >= 0 ? "+" : ""}{row.pct}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tour mode / partner outcome */}
      {comparison.partnerOutcome && (
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}
        >
          <Award className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#34d399" }} />
          <div>
            <p className="text-xs font-bold" style={{ color: "#34d399" }}>Co-Tour Deal</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>{comparison.partnerOutcome}</p>
          </div>
        </div>
      )}

      {/* Crew note */}
      {comparison.crewNote && (
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.18)" }}
        >
          <Star className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
          <p className="text-[10px]" style={{ color: "#9ca3af" }}>{comparison.crewNote}</p>
        </div>
      )}

      {/* Tour category */}
      {tour.tour_category && (
        <div
          className="rounded-2xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#6b7280" }}>Category</p>
          <p className="text-xs font-bold text-white capitalize">{tour.tour_category.replace(/_/g, ' ')}</p>
        </div>
      )}
    </div>
  );
}
