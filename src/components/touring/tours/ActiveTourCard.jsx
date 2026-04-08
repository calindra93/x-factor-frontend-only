import React from "react";
import { Calendar } from "lucide-react";

/**
 * Maps a raw Tour DB record to the display shape needed by this card.
 */
export function normalizeTourForCard(tour) {
  if (!tour) return null;
  const progress = tour.completed_stops ?? tour.progress ?? 0;
  const total = tour.turns_total ?? tour.total_stops ?? tour.total ?? 0;
  const health = tour.state?.health ?? tour.morale ?? 80;
  const momentum = tour.state?.momentum ?? tour.state?.route_momentum ?? 70;
  const relationshipPressure = tour.state?.fatigue ?? tour.state?.relationship_pressure ?? 0;
  const nextShow = tour.next_show_label ?? tour.state?.next_show ?? null;
  const coTour = tour.co_tour_artist_name ?? tour.co_headliner_name ?? null;

  return {
    id: tour.id,
    name: tour.name ?? "Active Tour",
    region: tour.region ?? "—",
    flag: tour.region_flag ?? "🗺",
    progress,
    total,
    health,
    momentum,
    relationshipPressure,
    nextShow,
    coTour,
    totalRevenue: tour.total_net_revenue ?? 0,
    totalAttendance: tour.total_attendance ?? 0,
  };
}

export default function ActiveTourCard({ tour }) {
  const data = normalizeTourForCard(tour);
  if (!data) return null;

  const pct = data.total > 0 ? Math.round((data.progress / data.total) * 100) : 0;

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(139,92,246,0.15), rgba(244,114,182,0.08))",
        border: "1px solid rgba(139,92,246,0.3)",
      }}
    >
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: "#34d399" }}
              >
                Live Tour
              </span>
              {data.coTour && (
                <span
                  className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase ml-1"
                  style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                >
                  Co-Tour
                </span>
              )}
            </div>
            <h2 className="text-lg font-black text-white">{data.name}</h2>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              {data.flag} {data.region}
              {data.coTour && (
                <span style={{ color: "#fbbf24" }}> · w/ {data.coTour}</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono font-black text-2xl text-white">
              {data.progress}
              <span className="text-sm font-normal text-slate-500">/{data.total}</span>
            </p>
            <p className="text-[10px]" style={{ color: "#9ca3af" }}>
              shows done
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full mt-3 mb-4"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-1.5 rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #7c3aed, #f472b6)",
            }}
          />
        </div>

        {/* Next show pill */}
        {data.nextShow && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-4"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Calendar className="w-3 h-3" style={{ color: "#a78bfa" }} />
            <span className="text-xs font-bold text-white">Next: {data.nextShow}</span>
          </div>
        )}
      </div>

      {/* Command stats */}
      <div
        className="grid grid-cols-3 border-t"
        style={{ borderColor: "rgba(255,255,255,0.05)" }}
      >
        {[
          {
            label: "Tour Health",
            value: data.health,
            color: data.health > 70 ? "#34d399" : "#fbbf24",
          },
          { label: "Route Momentum", value: data.momentum, color: "#a78bfa" },
          {
            label: "Rel. Pressure",
            value: data.relationshipPressure,
            color: data.relationshipPressure > 60 ? "#f87171" : "#60a5fa",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="px-3 py-3 text-center border-r last:border-r-0"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}
          >
            <p className="font-mono font-black text-xl" style={{ color: s.color }}>
              {s.value}
            </p>
            <p
              className="text-[9px] uppercase tracking-wide mt-0.5"
              style={{ color: "#9ca3af" }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
