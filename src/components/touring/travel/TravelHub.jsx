import React, { useState, useMemo } from "react";
import { Plane, ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { getDestinations } from "@/lib/regionTravel";
import { normalizeRegion } from "@/lib/regionConstants";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// ─── Region flag map ──────────────────────────────────────────────────────────

const REGION_FLAGS = {
  "United States":  "🇺🇸",
  "Canada":         "🇨🇦",
  "UK":             "🇬🇧",
  "Europe":         "🇪🇺",
  "Asia":           "🎌",
  "Latin America":  "🌎",
  "Africa":         "🌍",
  "Oceania":        "🦘",
};

// ─── Demand colors ────────────────────────────────────────────────────────────

function demandColor(demand) {
  if (demand >= 80) return "#34d399";
  if (demand >= 55) return "#a78bfa";
  if (demand >= 35) return "#fbbf24";
  return "#6b7280";
}

// ─── Route context rows (from profile stats) ─────────────────────────────────

export function buildRouteContext(profile) {
  return [
    { icon: "💰", label: "Balance",       value: `$${(Number(profile?.income) || 0).toLocaleString()}` },
    { icon: "👥", label: "Followers",     value: (Number(profile?.followers ?? profile?.fans) || 0).toLocaleString() },
    { icon: "⚡", label: "Hype",          value: Number(profile?.hype || 0).toFixed(0) },
    { icon: "📍", label: "Current Base",  value: normalizeRegion(profile?.region) || "Unknown" },
  ];
}

export function buildTravelDestinationState(dest, { balance = 0, followers = 0 } = {}) {
  const isCurrent = Boolean(dest?.isCurrentRegion);
  const affordable = balance >= (Number(dest?.travelCost) || 0);
  const unlocked = followers >= (Number(dest?.unlockFollowers) || 0);
  const blocked = !isCurrent && (!affordable || !unlocked);

  return {
    isCurrent,
    affordable,
    unlocked,
    blocked,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TravelHub({ profile, onProfileUpdate }) {
  const [travelingTo, setTravelingTo] = useState(null);
  const [travelError, setTravelError] = useState(null);
  const [travelSuccess, setTravelSuccess] = useState(null);

  const homeRegion = normalizeRegion(profile?.home_region || profile?.region) || "United States";
  const currentRegion = normalizeRegion(profile?.region) || "United States";
  const balance = Number(profile?.income) || 0;
  const followers = Number(profile?.followers ?? profile?.fans) || 0;

  const destinations = useMemo(() => getDestinations(currentRegion), [currentRegion]);
  const routeContext = useMemo(() => buildRouteContext(profile), [profile]);

  const handleTravel = async (dest) => {
    if (!profile?.id) return;
    if (dest.isCurrentRegion) return;

    // Client-side guard (backend will double-check)
    if (balance < dest.travelCost) {
      setTravelError(`Insufficient funds — need $${dest.travelCost.toLocaleString()} to travel to ${dest.name}.`);
      return;
    }
    if (followers < (dest.unlockFollowers || 0)) {
      setTravelError(`Need ${dest.unlockFollowers?.toLocaleString()} followers to unlock ${dest.name}.`);
      return;
    }

    setTravelingTo(dest.id);
    setTravelError(null);
    setTravelSuccess(null);

    try {
      const result = await invokeEdgeFunction("touring", {
        action: "travel",
        artistId: profile.id,
        destinationId: dest.id,
      });

      if (!result.success) {
        setTravelError(result.error || "Travel failed. Please try again.");
        return;
      }

      setTravelSuccess(`Relocated to ${dest.name}! New regional demand and venue pools are now active.`);

      // Propagate updated profile fields up so parent can re-render
      if (onProfileUpdate) {
        onProfileUpdate({
          region: result.data?.region ?? dest.name,
          income: result.data?.income ?? balance - dest.travelCost,
          hype: result.data?.hype ?? profile.hype,
        });
      }
    } catch (err) {
      console.error("[TravelHub] handleTravel error:", err);
      setTravelError(err.message || "Travel failed. Please try again.");
    } finally {
      setTravelingTo(null);
    }
  };

  return (
    <div className="space-y-5">

      {/* ── Feedback banners ─────────────────────────────────────── */}
      {travelError && (
        <div
          className="flex items-start gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f87171" }} />
          <p className="text-xs" style={{ color: "#fca5a5" }}>{travelError}</p>
          <button onClick={() => setTravelError(null)} className="ml-auto text-[10px] font-black" style={{ color: "#f87171" }}>✕</button>
        </div>
      )}
      {travelSuccess && (
        <div
          className="flex items-start gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}
        >
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#34d399" }} />
          <p className="text-xs" style={{ color: "#6ee7b7" }}>{travelSuccess}</p>
          <button onClick={() => setTravelSuccess(null)} className="ml-auto text-[10px] font-black" style={{ color: "#34d399" }}>✕</button>
        </div>
      )}

      {/* ── Current base card ────────────────────────────────────── */}
      <div
        className="rounded-3xl p-5"
        style={{
          background: "linear-gradient(145deg, rgba(96,165,250,0.1), rgba(139,92,246,0.05))",
          border: "1px solid rgba(96,165,250,0.2)",
        }}
      >
        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#60a5fa" }}>
          Current Base
        </p>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{REGION_FLAGS[currentRegion] || "🌐"}</span>
          <div>
            <p className="text-xl font-black text-white">{currentRegion}</p>
            <p className="text-xs" style={{ color: "#9ca3af" }}>Active command region</p>
          </div>
        </div>

        {/* Route context stats */}
        <div className="mt-4 space-y-2">
          {routeContext.map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">{r.icon}</span>
                <p className="text-xs" style={{ color: "#9ca3af" }}>{r.label}</p>
              </div>
              <p className="text-xs font-bold text-white">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Travel destinations ──────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "#6b7280" }}>
          Travel Destinations
        </p>
        <div className="space-y-2">
          {destinations.map((dest) => {
            const isActive = travelingTo === dest.id;
            const { isCurrent, affordable, unlocked, blocked } = buildTravelDestinationState(dest, { balance, followers });
            const demandScore = dest.demand || 50;
            const color = isCurrent ? "#60a5fa" : demandColor(demandScore);

            return (
              <button
                key={dest.id}
                onClick={() => !isActive && !isCurrent && handleTravel(dest)}
                disabled={isActive || isCurrent}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left cursor-pointer active:scale-[0.98] transition-all"
                style={{
                  background: isCurrent
                    ? "rgba(96,165,250,0.08)"
                    : blocked
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(255,255,255,0.03)",
                  border: isCurrent
                    ? "1px solid rgba(96,165,250,0.25)"
                    : "1px solid rgba(255,255,255,0.05)",
                  opacity: blocked && !isCurrent ? 0.5 : 1,
                  cursor: isCurrent || isActive ? "default" : blocked ? "not-allowed" : "pointer",
                }}
              >
                <span className="text-2xl shrink-0">{REGION_FLAGS[dest.name] || "🌐"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{dest.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px]" style={{ color: "#9ca3af" }}>{dest.description}</p>
                    {dest.name === homeRegion && (
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
                      >
                        HOME
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                        HERE
                      </span>
                    )}
                    {!unlocked && !isCurrent && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                        🔒 {dest.unlockFollowers?.toLocaleString()} fans
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {isCurrent ? (
                    <p className="font-mono text-xs font-black" style={{ color: "#60a5fa" }}>Base</p>
                  ) : (
                    <>
                      <p
                        className="font-mono text-xs font-black"
                        style={{ color: affordable ? "#d1d5db" : "#f87171" }}
                      >
                        ${dest.travelCost.toLocaleString()}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <div className="h-1 rounded-full" style={{ width: 30, background: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-1 rounded-full"
                            style={{ width: `${Math.round(demandScore * 0.3)}px`, background: color }}
                          />
                        </div>
                        <span className="text-[9px] font-bold" style={{ color }}>{demandScore}</span>
                      </div>
                    </>
                  )}
                </div>
                {isActive ? (
                  <div className="w-4 h-4 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin shrink-0 ml-1" />
                ) : !isCurrent ? (
                  <ChevronRight className="w-4 h-4 shrink-0 ml-1" style={{ color: "#6b7280" }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Info note ────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-4 py-3 flex items-start gap-2"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Plane className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#9ca3af" }} />
        <p className="text-[10px]" style={{ color: "#9ca3af" }}>
          Relocating your base opens new regional venue pools and adjusts incoming booking demand for your active tours. Travel costs are calculated by distance.
        </p>
      </div>
    </div>
  );
}
