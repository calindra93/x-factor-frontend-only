import React, { useMemo, useState } from "react";
import { AlertCircle, Trash2, Map, ListChecks } from "lucide-react";
import { REGION_META } from "@/lib/touringMapModel";

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: "#6b7280" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

// ─── Available regions the player can quick-pick ─────────────────────────────
// Kept in lockstep with the authoritative touring map / route-builder region names.
const WORLD_REGION_CHIPS = REGION_META.map(({ name, flag }) => ({ name, flag }));

const CITY_LOCATION_SUFFIX = {
  "New York": "NY",
  "Los Angeles": "CA",
  Atlanta: "GA",
  Chicago: "IL",
  Miami: "FL",
  Seattle: "WA",
  Houston: "TX",
  Austin: "TX",
  Baltimore: "MD",
  Denver: "CO",
  Detroit: "MI",
  Portland: "OR",
  Toronto: "Canada",
  Montreal: "Canada",
  Vancouver: "Canada",
  London: "UK",
  Manchester: "UK",
  Glasgow: "UK",
  Birmingham: "UK",
  Berlin: "Germany",
  Paris: "France",
  Amsterdam: "Netherlands",
  Barcelona: "Spain",
  Stockholm: "Sweden",
  Helsinki: "Finland",
  Tokyo: "Japan",
  Seoul: "South Korea",
  Mumbai: "India",
  Bangkok: "Thailand",
  Manila: "Philippines",
  Beijing: "China",
  "Sao Paulo": "Brazil",
  "Mexico City": "Mexico",
  "Buenos Aires": "Argentina",
  Bogota: "Colombia",
  Kingston: "Jamaica",
  Lagos: "Nigeria",
  Johannesburg: "South Africa",
  Nairobi: "Kenya",
  Accra: "Ghana",
  Sydney: "Australia",
  Melbourne: "Australia",
  Auckland: "New Zealand",
};

const REGION_LOCATION_SUFFIX = {
  "United States": "USA",
  Canada: "Canada",
  UK: "UK",
  Europe: "Europe",
  Africa: "Africa",
  Asia: "Asia",
  "Latin America": "Latin America",
  Oceania: "Oceania",
};

function getCityLocationLabel(stop) {
  const city = stop?.cityName || "";
  const suffix = CITY_LOCATION_SUFFIX[city] || REGION_LOCATION_SUFFIX[stop?.regionName] || "";
  return suffix ? `${city}, ${suffix}` : city;
}

export default function WizardStepItinerary({
  wizardPlan: _wizardPlan,
  setWizardPlan: _setWizardPlan,
  routeBuilderDraft = { routeRegions: [], connectors: [], totalMiles: 0, stopCount: 0 },
  routeBuilderSequence: _routeBuilderSequence = [],
  sceneDataByRegion = {},
  profile,
  onRemoveCityStop,
  onTapRouteRegion,
}) {
  const [viewMode, setViewMode] = useState("map"); // "map" | "quickpick"
  // Flatten stops from route regions
  const itineraryStops = useMemo(
    () =>
      routeBuilderDraft.routeRegions.flatMap((region) =>
        region.cityStops.map((stop) => ({
          ...stop,
          regionName: region.regionName,
          regionColor: region.regionColor,
          flag: region.flag,
        }))
      ),
    [routeBuilderDraft]
  );

  // Scene warnings
  const warningSummary = useMemo(() => {
    const w = [];
    let lowRepRegions = 0;
    let noTrendRegions = 0;
    routeBuilderDraft.routeRegions.forEach((region) => {
      const sceneData = sceneDataByRegion[region.regionName] || {};
      const reps = Array.isArray(sceneData.playerReps) ? sceneData.playerReps : [];
      const avgRep =
        reps.length > 0
          ? Math.round(
              reps.reduce((s, r) => s + (Number(r.reputation_score) || 0), 0) / reps.length
            )
          : 0;
      if (avgRep < 20) {
        lowRepRegions += 1;
        w.push(`${region.regionName} has low scene rep`);
      }
      const scenes = Array.isArray(sceneData.scenes) ? sceneData.scenes : [];
      const genreMatch = scenes.filter((s) => s?.trending_genre === profile?.genre).length;
      if (genreMatch === 0) {
        noTrendRegions += 1;
        w.push(`${region.regionName} is not trending your genre`);
      }
    });
    return {
      messages: w,
      lowRepRegions,
      noTrendRegions,
    };
  }, [routeBuilderDraft, sceneDataByRegion, profile?.genre]);

  const hasStops = itineraryStops.length > 0;
  const routeRegionNames = new Set(
    routeBuilderDraft.routeRegions.map((r) => r.regionName)
  );
  const itineraryGroups = useMemo(() => {
    const groups = [];
    itineraryStops.forEach((stop, index) => {
      const previousGroup = groups[groups.length - 1];
      if (!previousGroup || previousGroup.regionName !== stop.regionName) {
        groups.push({
          regionName: stop.regionName,
          regionColor: stop.regionColor,
          flag: stop.flag,
          stops: [{ ...stop, itineraryIndex: index + 1 }],
        });
        return;
      }
      previousGroup.stops.push({ ...stop, itineraryIndex: index + 1 });
    });
    return groups;
  }, [itineraryStops]);

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div
        className="flex items-center gap-1 rounded-2xl p-1"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          type="button"
          onClick={() => setViewMode("map")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-all"
          style={{
            background: viewMode === "map" ? "rgba(139,92,246,0.18)" : "transparent",
            color: viewMode === "map" ? "#e9d5ff" : "#6b7280",
            border: viewMode === "map" ? "1px solid rgba(139,92,246,0.28)" : "1px solid transparent",
          }}
        >
          <Map className="w-3 h-3" />
          Map guided
        </button>
        <button
          type="button"
          onClick={() => setViewMode("quickpick")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-all"
          style={{
            background: viewMode === "quickpick" ? "rgba(139,92,246,0.18)" : "transparent",
            color: viewMode === "quickpick" ? "#e9d5ff" : "#6b7280",
            border: viewMode === "quickpick" ? "1px solid rgba(139,92,246,0.28)" : "1px solid transparent",
          }}
        >
          <ListChecks className="w-3 h-3" />
          Quick pick
        </button>
      </div>

      {/* Quick pick mode — simplified multi-choice chips */}
      {viewMode === "quickpick" && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#6b7280" }}>
            Select regions to include
          </p>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
            {WORLD_REGION_CHIPS.map((chip) => {
              const active = routeRegionNames.has(chip.name);
              return (
                <button
                  key={chip.name}
                  type="button"
                  onClick={() => onTapRouteRegion?.(chip.name)}
                  className="min-w-0 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-[10px] font-black transition-all"
                  style={{
                    background: active ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.07)",
                    color: active ? "#e9d5ff" : "#9ca3af",
                  }}
                >
                  <span className="min-w-0 flex items-center gap-1.5 truncate">
                    <span>{chip.flag}</span>
                    <span className="truncate">{chip.name}</span>
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase shrink-0"
                    style={{
                      background: active ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)",
                      color: active ? "#ddd6fe" : "#94a3b8",
                    }}
                  >
                    {routeBuilderDraft.routeRegions.find((r) => r.regionName === chip.name)?.cityStops?.length ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Map-guided mode content */}
      {viewMode === "map" && (
        <>
        <div
          className="rounded-3xl p-3"
          style={{
            background: "rgba(124,58,237,0.06)",
            border: "1px solid rgba(139,92,246,0.18)",
          }}
        >
          <p className="text-[11px] font-black text-white">
            Planning session live on the map
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>
            Add regions above, then trim stops here before launch.
          </p>
        </div>

      {/* Itinerary Stops List */}
      {hasStops ? (
        <Section title="Itinerary">
          <div className="space-y-3">
            {itineraryGroups.map((group) => (
              <div
                key={group.regionName}
                className="rounded-[22px] px-4 py-3"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center gap-2 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-sm">{group.flag}</span>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: group.regionColor || "#c4b5fd" }}>
                    {group.regionName}
                  </p>
                </div>

                <div className="pt-2 space-y-0.5">
                  {group.stops.map((stop, stopIndex) => {
                    const cityLocationLabel = getCityLocationLabel(stop);
                    return (
                      <div
                        key={stop.id}
                        className="relative grid grid-cols-[26px_minmax(0,1fr)_26px] gap-2 py-2"
                        style={{
                          borderBottom: stopIndex < group.stops.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        }}
                      >
                        <div className="relative flex justify-center">
                          <div
                            className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-black"
                            style={{
                              background: group.regionColor || "rgba(124,58,237,0.22)",
                              color: "#ffffff",
                            }}
                          >
                            {stop.itineraryIndex}
                          </div>
                          {stopIndex < group.stops.length - 1 && (
                            <div
                              className="absolute top-6 bottom-[-6px] w-px"
                              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02))" }}
                            />
                          )}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[11px] font-semibold leading-tight" style={{ color: "#f8fafc" }}>
                            {cityLocationLabel}
                          </p>

                          <p className="text-[10.5px] font-medium leading-tight" style={{ color: "#ffffff" }}>
                            {stop.venueName}
                          </p>

                          <p className="text-[9px] leading-tight" style={{ color: "#94a3b8" }}>
                            {stop.venueCapacity > 0 ? `${Math.round(stop.venueCapacity).toLocaleString()} capacity` : "Capacity TBD"}
                            {" · "}
                            {stop.venueType} room
                            {" · "}
                            Tier {stop.venueTier}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveCityStop?.(stop.regionName, stop.id)}
                          className="mt-0.5 mr-[20%] rounded-full h-6 w-6 transition-all self-start flex items-center justify-center"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            color: "#94a3b8",
                            border: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        /* Empty state */
        <div
          className="rounded-3xl p-5 text-center"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <p className="text-sm font-black text-white">No route built yet</p>
          <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>
            Tap any region on the map above to start.
          </p>
        </div>
      )}

      {/* Scene Warnings */}
      {warningSummary.messages.length > 0 && (
        <Section title="Route Risk Summary">
          <div
            className="flex items-start gap-3 rounded-2xl pl-5 pr-4 py-3"
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
            }}
          >
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: "#fbbf24" }}
            />
            <div className="space-y-1">
              <p className="text-[11px] font-semibold" style={{ color: "#fde68a" }}>
                {warningSummary.lowRepRegions > 0 && `Your reputation is low in ${warningSummary.lowRepRegions} region${warningSummary.lowRepRegions === 1 ? "" : "s"} you've selected.`}
                {warningSummary.lowRepRegions > 0 && warningSummary.noTrendRegions > 0 ? " " : ""}
                {warningSummary.noTrendRegions > 0 && `Your genre is trending low in ${warningSummary.noTrendRegions} region${warningSummary.noTrendRegions === 1 ? "" : "s"} you've selected.`}
              </p>
              <p className="text-[10px]" style={{ color: "#fcd34d" }}>
                Low reputation can mean tickets may not sell as well in regions where you're scarcely known, especially when your genre is not popular there right now.
              </p>
            </div>
          </div>
        </Section>
      )}
        </>
      )}
    </div>
  );
}
