import React from "react";
import { DollarSign, Users, MapPin, Star, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/utils/numberFormat";

/**
 * Maps a raw completed Tour DB record to the display shape for a past-tour card.
 */
export function normalizePastTour(tour) {
  if (!tour) return null;
  const revenue = tour.total_net_revenue ?? tour.revenue ?? 0;
  const attendance = tour.total_attendance ?? tour.attendance ?? 0;
  const shows = tour.completed_stops ?? tour.total_stops ?? tour.shows ?? 0;
  const resolvedName = [tour.tour_name, tour.name, tour.title, tour.state?.tour_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);

  const endedAt = tour.ended_at ?? tour.completed_at ?? tour.updated_at ?? null;
  const endedLabel = endedAt
    ? new Date(endedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "—";

  return {
    id: tour.id,
    name: resolvedName || "Tour Archive",
    region: tour.region ?? "—",
    flag: tour.region_flag ?? "🗺",
    revenue,
    attendance,
    shows,
    endedLabel,
    highlight: tour.highlight ?? tour.state?.highlight ?? null,
    deltaLabel: tour.revenue_vs_avg_pct != null
      ? `${tour.revenue_vs_avg_pct >= 0 ? "+" : ""}${tour.revenue_vs_avg_pct}%`
      : null,
  };
}

export default function PastTourHeroCard({ tour, onOpenDetail }) {
  const data = normalizePastTour(tour);
  if (!data) return null;

  return (
    <div
      className="overflow-hidden rounded-[24px]"
      style={{
        background: "linear-gradient(145deg, rgba(8,11,21,0.94), rgba(18,24,38,0.82))",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: "#64748b" }}>
              Route Memory
            </p>
            <p className="mt-1.5 text-[15px] font-black leading-tight text-white truncate">{data.name}</p>
            <p className="mt-1 text-[10px]" style={{ color: "#94a3b8" }}>
              {data.flag} {data.region} · Closed {data.endedLabel}
            </p>
          </div>
          {data.deltaLabel && (
            <span className="rounded-full px-2 py-0.5 text-[9px] font-black shrink-0" style={{ color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.16)" }}>
              {data.deltaLabel}
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[20px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5" style={{ color: "#f472b6" }} />
              <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
                Net Revenue
              </p>
            </div>
            <p className="mt-1.5 font-mono text-[18px] font-black leading-none text-white">{formatCurrency(data.revenue)}</p>
            <p className="mt-1.5 text-[9px]" style={{ color: "#94a3b8" }}>
              {data.shows} shows routed through {data.region}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              {
                label: "Attendance",
                value: data.attendance >= 1000 ? `${(data.attendance / 1000).toFixed(1)}K` : String(data.attendance),
                icon: Users,
                tone: "#60a5fa",
              },
              {
                label: "Shows",
                value: String(data.shows),
                icon: MapPin,
                tone: "#c084fc",
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="rounded-[20px] px-2.5 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: s.tone }} />
                    <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#64748b" }}>
                      {s.label}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[14px] font-black leading-none text-white">{s.value}</p>
                  <p className="mt-1 text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#64748b" }}>
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {data.highlight && (
          <div className="mt-3 flex items-start gap-2 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <Star className="w-3 h-3 shrink-0" style={{ color: "#fbbf24" }} />
            <p className="text-[9px] flex-1 leading-relaxed line-clamp-2" style={{ color: "#94a3b8" }}>
              {data.highlight}
            </p>
          </div>
        )}

        {onOpenDetail && (
          <button
            onClick={() => onOpenDetail(tour)}
            className="mt-3 w-full flex items-center justify-between gap-2 rounded-[16px] px-3 py-1.5 text-[10px] font-bold transition-all"
            style={{
              background: "rgba(255,255,255,0.025)",
              color: "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span className="text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
              Open recap
            </span>
            <span className="text-[11px] font-black text-white">View Recap</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
