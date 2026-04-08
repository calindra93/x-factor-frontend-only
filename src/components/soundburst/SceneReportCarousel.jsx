import React, { useMemo } from "react";
import { buildSceneReportCities } from "@/lib/soundburstCityHelpers";

function getStatusBadge(tier) {
  if (tier === "hot") return { label: "🔥 Hot", color: "#ef4444" };
  if (tier === "rising") return { label: "📈 Rising", color: "#f97316" };
  return { label: "💤 Quiet", color: "#9ca3af" };
}

function getTrendingEventLabel(eventType) {
  const labels = {
    open_mic: "Open Mics trending",
    showcase: "Showcases trending",
    battle: "Battles hot",
    collab_night: "Collabs popping",
    block_party: "Block parties hype",
    listening_party: "Listening parties",
  };
  return labels[eventType] || "Events active";
}

/**
 * SceneReportCarousel
 *
 * Displays a horizontally scrollable list of cities derived from canonical
 * regionTravel data (A-002-01, A-002-02). Home-region cities are visually
 * highlighted (A-002-05).
 *
 * @param {string|undefined} currentRegion — player's current region (profile.region)
 * @param {Function} onCitySelect — called with the city object when a card is tapped
 */
export default function SceneReportCarousel({ currentRegion, onCitySelect = () => {} }) {
  // M2 observability: log populated region for debug; 0 cities = failure threshold (in helper)
  const cities = useMemo(() => {
    const all = buildSceneReportCities(currentRegion);
    if (import.meta.env.DEV) {
      console.debug(`[SceneReportCarousel] Loaded ${all.length} cities for region="${currentRegion || "unknown"}"`);
    }
    return all;
  }, [currentRegion]);

  const statusMap = useMemo(
    () => cities.reduce((acc, city) => { acc[city.id] = getStatusBadge(city.sceneTier); return acc; }, {}),
    [cities]
  );

  if (cities.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="text-white text-lg font-bold">Scene Report</h2>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-1 px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {cities.map((city) => {
          const status = statusMap[city.id];
          const isHome = city.isHomeRegion;
          return (
            <button
              key={city.id}
              onClick={() => onCitySelect(city)}
              className="flex-shrink-0 w-[160px] text-left"
            >
              {/* Card container — home-region cities get a subtle blue border highlight */}
              <div
                className={`rounded-xl border p-3 h-full flex flex-col gap-2 hover:border-white/[0.15] transition-all bg-gradient-to-br from-white/[0.05] to-white/[0.02] ${
                  isHome ? "border-blue-500/30" : "border-white/[0.08]"
                }`}
              >
                {/* Header: City name + Region */}
                <div>
                  <h3 className="font-black text-white text-sm leading-tight">{city.name}</h3>
                  <p className="text-[9px] text-white/40">{city.region}</p>
                </div>

                {/* Home region badge */}
                {isHome && (
                  <div className="text-[8px] bg-blue-600/15 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 self-start">
                    Your region
                  </div>
                )}

                {/* Scene tier gradient bar */}
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      background:
                        city.sceneTier === "hot"
                          ? "linear-gradient(90deg, #ef4444, #f97316)"
                          : city.sceneTier === "rising"
                          ? "linear-gradient(90deg, #f97316, #fbbf24)"
                          : "linear-gradient(90deg, #6b7280, #9ca3af)",
                      width: `${city.recentHeat}%`,
                    }}
                  />
                </div>

                {/* Status pill */}
                <div style={{ color: status.color }} className="text-[9px] font-bold">
                  {status.label}
                </div>

                {/* Trending event type */}
                <p className="text-[9px] text-white/50">{getTrendingEventLabel(city.trendingEvent)}</p>

                {/* Player shows badge (if any) */}
                {city.playerShowCount > 0 && (
                  <div className="text-[8px] bg-blue-600/20 text-blue-300 px-2 py-1 rounded border border-blue-500/20">
                    {city.playerShowCount} show{city.playerShowCount > 1 ? "s" : ""} booked
                  </div>
                )}

                {/* Footer: View Events CTA */}
                <div className="mt-auto pt-2 border-t border-white/[0.1]">
                  <span className="w-full text-[9px] text-blue-400 font-bold">
                    View Events →
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
