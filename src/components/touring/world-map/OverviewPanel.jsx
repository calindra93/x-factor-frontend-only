import React, { useMemo, useState, useEffect } from "react";
import {
  Route,
  Users,
  Activity,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/utils/numberFormat";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import PastToursPanel from "@/components/touring/tours/PastToursPanel";
import PastTourDetailSheet from "@/components/touring/tours/PastTourDetailSheet";
import CityTravelSection from "@/components/touring/travel/CityTravelSection";
import { buildTravelDestinationState } from "@/components/touring/travel/TravelHub";
import { getDestinations } from "@/lib/regionTravel";
import { SurfaceLabel } from "./WorldMapPrimitives";
import { fadeUp, dockTransition } from "./worldMapMotion";

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW PANEL — default state below the map
// Market thesis, route readout, detail sub-tabs (archive/scenes/field notes/transit)
// ═══════════════════════════════════════════════════════════════════════════════

const detailTabs = [
  { id: "past-tours", kicker: "01", label: "Archive" },
  { id: "local-scenes", kicker: "02", label: "Scenes" },
  { id: "travel", kicker: "03", label: "Transit" },
];

const sceneInspectTabs = [
  { id: "cities", label: "Cities" },
  { id: "contacts", label: "Contacts" },
  { id: "artifacts", label: "Artifacts" },
];

export default function OverviewPanel({
  // region data
  mapModel,
  selectedOverviewRegion,
  overviewAccent,
  hottestRegion,
  homeRegion,
  homeRegionEntry,
  scoutRegion,
  hotRegionCount: _hotRegionCount,
  heatMapRegionModels,
  selectedHeatRegion,
  footprint,
  spotlight,

  // route readout
  routeBuilderDraft: _routeBuilderDraft,

  // past tours
  pastTours,
  selectedPastTour,
  routeMemoryItems,
  selectedRegionSceneData,
  onOpenPastTourDetail,
  onClosePastTourDetail,
  onSelectOverviewRegion,

  // intel
  intelItems: _intelItems,
  defaultIntelIndex: _defaultIntelIndex,

  // controlled panel state
  defaultDetailView: controlledDetailView,
  onDefaultDetailViewChange,
  routeMemoryIndex: controlledRouteMemoryIndex,
  onRouteMemoryIndexChange,

  // travel
  profile,
  demand,
  onProfileUpdate,
  sceneDataByRegion = {},

  // actions
  commandActions: _commandActions,
  onEnterPlanningMode: _onEnterPlanningMode,
  onEnterScenesView: _onEnterScenesView,

  // action stack
  actionStackContent,
}) {
  const [uncontrolledDetailView, setUncontrolledDetailView] = useState("past-tours");
  const [uncontrolledRouteMemoryIndex, setUncontrolledRouteMemoryIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [sceneInspectTab, setSceneInspectTab] = useState("cities");
  const [embeddedTravelingTo, setEmbeddedTravelingTo] = useState(null);
  const [embeddedTravelMessage, setEmbeddedTravelMessage] = useState(null);
  const [embeddedTravelTone, setEmbeddedTravelTone] = useState("neutral");

  const defaultDetailView = controlledDetailView ?? uncontrolledDetailView;
  const routeMemoryIndex = controlledRouteMemoryIndex ?? uncontrolledRouteMemoryIndex;

  const setDefaultDetailView = (nextValue) => {
    onDefaultDetailViewChange?.(nextValue);
    if (controlledDetailView == null) {
      setUncontrolledDetailView(nextValue);
    }
  };

  const setRouteMemoryIndex = (nextValue) => {
    onRouteMemoryIndexChange?.(nextValue);
    if (controlledRouteMemoryIndex == null) {
      setUncontrolledRouteMemoryIndex(nextValue);
    }
  };

  const activeRouteMemory = routeMemoryItems[routeMemoryIndex] || null;

  useEffect(() => {
    if (routeMemoryIndex >= routeMemoryItems.length) setRouteMemoryIndex(0);
  }, [routeMemoryIndex, routeMemoryItems]);

  const currentRegion = profile?.region || null;
  const travelBalance = Number(profile?.income || 0);
  const travelFollowers = Number(profile?.fans ?? profile?.followers ?? 0);
  const embeddedTravelDestinations = useMemo(() => {
    try {
      return getDestinations(currentRegion).filter((d) => d.name !== currentRegion);
    } catch {
      return [];
    }
  }, [currentRegion]);

  const handleEmbeddedTravel = async (destination) => {
    if (!profile?.id || !destination || embeddedTravelingTo) return;

    const { isCurrent, affordable, unlocked } = buildTravelDestinationState(destination, {
      balance: travelBalance,
      followers: travelFollowers,
    });

    if (isCurrent) return;

    if (!unlocked) {
      setEmbeddedTravelTone("warning");
      setEmbeddedTravelMessage(`Need ${Number(destination.unlockFollowers || 0).toLocaleString()} followers to unlock ${destination.name}.`);
      return;
    }

    if (!affordable) {
      setEmbeddedTravelTone("warning");
      setEmbeddedTravelMessage(`Need ${formatCurrency(destination.travelCost || 0)} to travel to ${destination.name}.`);
      return;
    }

    setEmbeddedTravelingTo(destination.id);
    setEmbeddedTravelMessage(null);

    try {
      const result = await invokeEdgeFunction("touring", {
        action: "travel",
        artistId: profile.id,
        destinationId: destination.id,
      });

      if (!result?.success) {
        setEmbeddedTravelTone("warning");
        setEmbeddedTravelMessage(result?.error || "Travel failed. Please try again.");
        return;
      }

      setEmbeddedTravelTone("success");
      setEmbeddedTravelMessage(`Relocated to ${destination.name}. New venue pools are now active.`);

      onProfileUpdate?.({
        region: result.data?.region ?? destination.name,
        current_city: null,
        income: result.data?.income ?? Math.max(0, travelBalance - Number(destination.travelCost || 0)),
        hype: result.data?.hype ?? profile?.hype,
      });
    } catch (error) {
      setEmbeddedTravelTone("warning");
      setEmbeddedTravelMessage(error?.message || "Travel failed. Please try again.");
    } finally {
      setEmbeddedTravelingTo(null);
    }
  };

  const heatRegion = selectedHeatRegion || null;
  const regionScenes = Array.isArray(selectedRegionSceneData?.scenes) ? selectedRegionSceneData.scenes : [];
  const regionPlayerReps = Array.isArray(selectedRegionSceneData?.playerReps) ? selectedRegionSceneData.playerReps : [];
  const regionContacts = Array.isArray(selectedRegionSceneData?.contacts) ? selectedRegionSceneData.contacts : [];
  const regionContactRelationships = Array.isArray(selectedRegionSceneData?.contactRelationships)
    ? selectedRegionSceneData.contactRelationships
    : [];
  const discoveredArtifactIds = new Set(
    regionPlayerReps.flatMap((rep) => Array.isArray(rep?.discovered_artifacts) ? rep.discovered_artifacts : [])
  );
  const regionArtifacts = regionScenes.flatMap((scene) => {
    const artifacts = Array.isArray(scene?.cultural_artifacts) ? scene.cultural_artifacts : [];
    return artifacts.map((artifact, index) => ({
      id: artifact?.id || `${scene?.id || scene?.city_name || "scene"}-artifact-${index}`,
      name: artifact?.name || artifact?.title || `Artifact ${index + 1}`,
      description: artifact?.description || artifact?.hint || "No artifact notes yet.",
      cityName: scene?.city_name || scene?.name || "Unknown city",
      discovered: discoveredArtifactIds.has(artifact?.id),
    }));
  });
  const contactRelationshipMap = new Map(
    regionContactRelationships
      .filter((relationship) => relationship?.contact_id)
      .map((relationship) => [relationship.contact_id, relationship])
  );

  const overviewDecisionCopy =
    defaultDetailView === "past-tours"
      ? `Use archive memory here as proof-of-draw. Treat past conversion like evidence, not decoration.`
      : defaultDetailView === "travel"
        ? `If you move now, ${selectedOverviewRegion?.name || "this market"} is the strongest base-change candidate because it opens a cleaner next lane.`
        : `Treat ${selectedOverviewRegion?.name || "this region"} as the lead thesis for your next routing decision and let scene pressure confirm it.`;

  useEffect(() => {
    if (defaultDetailView !== "local-scenes") {
      return;
    }
    if (sceneInspectTab === "contacts" && regionContacts.length === 0) {
      setSceneInspectTab(regionArtifacts.length > 0 ? "artifacts" : "cities");
      return;
    }
    if (sceneInspectTab === "artifacts" && regionArtifacts.length === 0) {
      setSceneInspectTab(regionContacts.length > 0 ? "contacts" : "cities");
    }
  }, [defaultDetailView, sceneInspectTab, regionContacts.length, regionArtifacts.length]);

  return (
    <>
      {selectedOverviewRegion && defaultDetailView !== "local-scenes" && (
        <motion.div
          layout
          transition={dockTransition}
          className="relative overflow-hidden rounded-[30px]"
          style={{
            background: "linear-gradient(145deg, rgba(8,12,24,0.98), rgba(15,23,42,0.9))",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="px-4 py-4 md:px-5 md:py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: overviewAccent }}>
              Market thesis
            </p>

            {/* Top row: region name + demand score */}
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[28px] font-black leading-none text-white">{selectedOverviewRegion.name}</p>
                {heatRegion?.strongestCity && (
                  <p className="mt-1 text-[11px] font-black" style={{ color: overviewAccent }}>
                    Lead city: {heatRegion.strongestCity}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
                  Demand
                </p>
                <p className="mt-1 text-[34px] font-black leading-none" style={{ color: overviewAccent }}>
                  {selectedOverviewRegion.demandScore ?? "-"}
                </p>
              </div>
            </div>

            {/* Scene intel grid */}
            {heatRegion && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 @[640px]:grid-cols-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Footing</p>
                  <p className="mt-1 text-[11px] font-black text-white">{heatRegion.footingLabel}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Scene culture</p>
                  <p className="mt-1 text-[11px] font-black text-white">
                    {heatRegion.dominantTrend ? `${heatRegion.dominantTrend} dominant` : "Mixed scene"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Fan signal</p>
                  <p className="mt-1 text-[11px] font-black text-white">{heatRegion.fanSentiment}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Genre fit</p>
                  <p
                    className="mt-1 text-[11px] font-black"
                    style={{
                      color: heatRegion.genreFit === "strong" ? "#34d399" : heatRegion.genreFit === "mixed" ? "#60a5fa" : "#6b7280",
                    }}
                  >
                    {heatRegion.genreFit === "strong" ? "Strong fit" : heatRegion.genreFit === "mixed" ? "Mixed fit" : "Weak fit"}
                  </p>
                </div>
                {heatRegion.undiscoveredCount > 0 && (
                  <div className="col-span-2 @[640px]:col-span-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Artifacts</p>
                    <p className="mt-1 text-[11px] font-black" style={{ color: "#fbbf24" }}>
                      {heatRegion.undiscoveredCount} undiscovered
                    </p>
                  </div>
                )}
                {heatRegion.avgRep > 0 && (
                  <div className="col-span-2 @[640px]:col-span-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Avg scene rep</p>
                    <p className="mt-1 text-[11px] font-black text-white">{heatRegion.avgRep}</p>
                  </div>
                )}
              </div>
            )}

            {/* Fallback copy when no scene data yet */}
            {!heatRegion && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <p className="mt-2 max-w-[42rem] text-[11px] leading-relaxed" style={{ color: "#e2e8f0" }}>
                  {overviewDecisionCopy}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <motion.div
        layout
        transition={dockTransition}
        className="relative overflow-hidden rounded-[30px]"
        style={{
          background: "linear-gradient(145deg, rgba(8,12,24,0.98), rgba(15,23,42,0.9))",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="px-4 py-4 md:px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="flex w-full items-start justify-between gap-4 border-b pb-4 text-left"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: isCollapsed ? "#64748b" : overviewAccent }}>
                  Overview panel
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-black text-white">
                    {detailTabs.find((tab) => tab.id === defaultDetailView)?.label || "Archive"}
                  </p>
                  <p className="text-[10px]" style={{ color: "#94a3b8" }}>
                    {selectedOverviewRegion?.name || hottestRegion?.name || "Select a market"}
                  </p>
                  {selectedHeatRegion?.avgRep > 0 ? (
                    <span className="text-[10px] font-black" style={{ color: overviewAccent }}>
                      {selectedHeatRegion.avgRep} rep
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
                  {isCollapsed ? "Expand" : "Collapse"}
                </span>
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4" style={{ color: "#94a3b8" }} />
                ) : (
                  <ChevronUp className="h-4 w-4" style={{ color: "#94a3b8" }} />
                )}
              </div>
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDefaultDetailView(tab.id)}
                    className="text-left transition-all"
                    style={{ color: defaultDetailView === tab.id ? "#ffffff" : "#94a3b8" }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: defaultDetailView === tab.id ? overviewAccent : "#64748b" }}>
                      {tab.kicker}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm font-black">{tab.label}</p>
                      {defaultDetailView === tab.id ? (
                        <span className="h-[2px] w-8 rounded-full" style={{ background: overviewAccent }} />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Archive tab */}
            {!isCollapsed && defaultDetailView === "past-tours" && (
              <motion.div {...fadeUp} className="grid gap-4 @[640px]:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#a78bfa" }}>
                      Route replay
                    </p>
                    <p className="mt-1 text-base font-black text-white">Archived runs and geographic memory</p>
                  </div>

                  {routeMemoryItems.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-white">{activeRouteMemory?.name || "Route memory"}</p>
                          <span className="text-[10px] font-black" style={{ color: activeRouteMemory?.tone || "#94a3b8" }}>
                            {activeRouteMemory?.region || "-"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(routeMemoryItems.length - 1, 0)}
                          value={routeMemoryIndex}
                          onChange={(event) => {
                            const nextIndex = Number(event.target.value);
                            setRouteMemoryIndex(nextIndex);
                            const regionName = routeMemoryItems[nextIndex]?.region;
                            if (regionName) onSelectOverviewRegion?.(regionName);
                          }}
                          className="mt-4 w-full"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-y py-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <SurfaceLabel icon={Route} label="Shows" value={`${activeRouteMemory?.shows || 0}`} color="#f472b6" />
                        <SurfaceLabel
                          icon={Users}
                          label="Attendance"
                          value={activeRouteMemory?.attendance ? Number(activeRouteMemory.attendance).toLocaleString() : "Pending"}
                          color="#60a5fa"
                        />
                        <SurfaceLabel
                          icon={Activity}
                          label="Revenue"
                          value={formatCurrency(activeRouteMemory?.revenue || 0)}
                          color="#34d399"
                        />
                      </div>

                      <p className="text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>
                        Scrub archived runs here. The map uses the selected memory as a replay anchor so history reads like geography instead of dead records.
                      </p>
                    </div>
                  ) : (
                    <div
                      className="rounded-[18px] px-3 py-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <p className="text-sm font-black text-white">No archive memory yet</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                        Completed runs will replay here once tours start resolving.
                      </p>
                    </div>
                  )}
                </div>

                <div className="min-h-[280px]">
                  {selectedPastTour ? (
                    <div className="max-h-[420px] overflow-y-auto pr-1">
                      <PastTourDetailSheet
                        tour={selectedPastTour}
                        allPastTours={pastTours}
                        onBack={onClosePastTourDetail}
                      />
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-y-auto pr-1">
                      <PastToursPanel pastTours={pastTours} onOpenDetail={onOpenPastTourDetail} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Scenes tab */}
            {!isCollapsed && defaultDetailView === "local-scenes" && (
              <motion.div {...fadeUp} className="space-y-4">
                <div className="grid gap-4 @[720px]:grid-cols-[1.05fr_0.95fr]">
                  <div
                    className="rounded-[22px] px-4 py-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: overviewAccent }}>
                          Regional scenes
                        </p>
                        <p className="mt-2 text-[26px] font-black leading-none text-white">
                          {selectedOverviewRegion?.name || hottestRegion?.name || "Select a market"}
                        </p>
                        {heatRegion?.strongestCity ? (
                          <p className="mt-2 text-[11px] font-black" style={{ color: overviewAccent }}>
                            Lead city: {heatRegion.strongestCity}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
                          Demand
                        </p>
                        <p className="mt-1 text-[30px] font-black leading-none" style={{ color: overviewAccent }}>
                          {selectedOverviewRegion?.demandScore ?? hottestRegion?.demandScore ?? "-"}
                        </p>
                      </div>
                    </div>

                    {heatRegion ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 @[640px]:grid-cols-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Footing</p>
                          <p className="mt-1 text-[11px] font-black text-white">{heatRegion.footingLabel}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Scene culture</p>
                          <p className="mt-1 text-[11px] font-black text-white">
                            {heatRegion.dominantTrend ? `${heatRegion.dominantTrend} dominant` : "Mixed scene"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Fan signal</p>
                          <p className="mt-1 text-[11px] font-black text-white">{heatRegion.fanSentiment}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Genre fit</p>
                          <p
                            className="mt-1 text-[11px] font-black"
                            style={{
                              color: heatRegion.genreFit === "strong" ? "#34d399" : heatRegion.genreFit === "mixed" ? "#60a5fa" : "#6b7280",
                            }}
                          >
                            {heatRegion.genreFit === "strong" ? "Strong fit" : heatRegion.genreFit === "mixed" ? "Mixed fit" : "Weak fit"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#e2e8f0" }}>
                        {overviewDecisionCopy}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Lead lane</p>
                      <p className="mt-1 text-sm font-bold text-white">{spotlight?.tags?.[0] || "Touring Opportunity"}</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>{spotlight?.subtitle || `${selectedOverviewRegion?.name || "This market"} is the clearest next touring signal on the board.`}</p>
                    </div>
                    <div className="rounded-[20px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Fans reached</p>
                      <p className="mt-1 text-sm font-bold text-white">{Number(footprint?.fansReached || 0).toLocaleString()}</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>{homeRegionEntry?.demandScore != null ? `${homeRegionEntry.demandScore} home base heat` : "No home base benchmark yet."}</p>
                    </div>
                    <div className="rounded-[20px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Home base</p>
                      <p className="mt-1 text-sm font-bold text-white">{homeRegion || "-"}</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>Compare this lane against the market you already own.</p>
                    </div>
                    <div className="rounded-[20px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Scout next</p>
                      <p className="mt-1 text-sm font-bold text-white">{scoutRegion?.name || "-"}</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>Keeps route pressure moving after this region cools.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {sceneInspectTabs.map((tab) => {
                    const disabled =
                      (tab.id === "contacts" && regionContacts.length === 0) ||
                      (tab.id === "artifacts" && regionArtifacts.length === 0);

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => !disabled && setSceneInspectTab(tab.id)}
                        className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-all"
                        style={{
                          background: sceneInspectTab === tab.id ? `${overviewAccent}22` : "rgba(255,255,255,0.03)",
                          border: sceneInspectTab === tab.id ? `1px solid ${overviewAccent}55` : "1px solid rgba(255,255,255,0.06)",
                          color: disabled ? "#64748b" : sceneInspectTab === tab.id ? "#ffffff" : "#cbd5e1",
                          opacity: disabled ? 0.5 : 1,
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {sceneInspectTab === "cities" && (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {regionScenes.length > 0 ? regionScenes.map((scene, index) => {
                      const repEntry = regionPlayerReps.find((rep) => rep?.city_id === scene?.id) || null;
                      const cityArtifacts = Array.isArray(scene?.cultural_artifacts) ? scene.cultural_artifacts.length : 0;

                      return (
                        <div
                          key={scene?.id || `${scene?.city_name || "city"}-${index}`}
                          className="rounded-[18px] px-3 py-3"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">{scene?.city_name || scene?.name || `City ${index + 1}`}</p>
                              <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                                {scene?.trending_genre ? `${scene.trending_genre} trend` : "Mixed trend"}
                                {scene?.scene_tier ? ` · Tier ${scene.scene_tier}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#64748b" }}>Rep</p>
                              <p className="mt-1 text-sm font-black text-white">{Number(repEntry?.reputation_score || 0)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black">
                            <span style={{ color: "#60a5fa" }}>{scene?.vibe || scene?.city_vibe || "Scene active"}</span>
                            {cityArtifacts > 0 ? <span style={{ color: "#fbbf24" }}>{cityArtifacts} artifacts</span> : null}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-[18px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p className="text-sm font-black text-white">No city scene data loaded</p>
                        <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>This region has not returned city-level scene records yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {sceneInspectTab === "contacts" && (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {regionContacts.length > 0 ? regionContacts.map((contact, index) => {
                      const relationship = contactRelationshipMap.get(contact?.id) || null;

                      return (
                        <div
                          key={contact?.id || `contact-${index}`}
                          className="rounded-[18px] px-3 py-3"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">{contact?.name || contact?.contact_name || `Local contact ${index + 1}`}</p>
                              <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                                {contact?.role || contact?.type || "Scene contact"}
                                {contact?.city_name ? ` · ${contact.city_name}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#64748b" }}>Affinity</p>
                              <p className="mt-1 text-sm font-black text-white">{Number(relationship?.relationship_score || relationship?.score || 0)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-[18px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p className="text-sm font-black text-white">No local contacts surfaced yet</p>
                        <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>When the backend returns regional contacts, they will appear here as a dedicated scene subtab.</p>
                      </div>
                    )}
                  </div>
                )}

                {sceneInspectTab === "artifacts" && (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {regionArtifacts.length > 0 ? regionArtifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="rounded-[18px] px-3 py-3"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">{artifact.name}</p>
                            <p className="mt-1 text-[10px] font-black" style={{ color: "#fbbf24" }}>{artifact.cityName}</p>
                            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>{artifact.description}</p>
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]"
                            style={{
                              background: artifact.discovered ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
                              color: artifact.discovered ? "#34d399" : "#fbbf24",
                            }}
                          >
                            {artifact.discovered ? "Found" : "Discoverable"}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[18px] px-3 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p className="text-sm font-black text-white">No artifacts listed for this region</p>
                        <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>If artifacts are present in the backend scene records, they will populate here.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {(heatMapRegionModels || mapModel.regions).map((region) => (
                    <button
                      key={region.name}
                      type="button"
                      onClick={() => onSelectOverviewRegion?.(region.name)}
                      className="w-full text-left"
                    >
                      <div
                        className="flex items-center gap-3 rounded-[18px] px-3 py-3"
                        style={{
                          background:
                            selectedOverviewRegion?.name === region.name ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                          border:
                            selectedOverviewRegion?.name === region.name
                              ? "1px solid rgba(255,255,255,0.1)"
                              : "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <span className="text-lg">{region.flag}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold text-white">{region.name}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              {homeRegion === region.name && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                                  style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
                                >
                                  Home
                                </span>
                              )}
                              {region.genreFit === "strong" && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                                  style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}
                                >
                                  Genre fit
                                </span>
                              )}
                              {region.undiscoveredCount > 0 && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                                  style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
                                >
                                  {region.undiscoveredCount} artifacts
                                </span>
                              )}
                              <span className="text-[10px] font-black uppercase" style={{ color: region.cultureTint || region.color }}>
                                {region.demandScore}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                            {region.footingLabel
                              ? `${region.footingLabel}${region.dominantTrend ? ` · ${region.dominantTrend} scene` : ""}`
                              : `${region.status} market with active scene routing potential.`}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Transit tab */}
            {!isCollapsed && defaultDetailView === "travel" && (
              <motion.div {...fadeUp} className="space-y-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#f472b6" }}>
                    Transit options
                  </p>
                  <p className="mt-1 text-base font-black text-white">Move your home base</p>
                  {currentRegion && (
                    <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                      Currently based in {currentRegion}. Relocating unlocks new market pressure and scene access.
                    </p>
                  )}
                </div>

                {embeddedTravelMessage && (
                  <div
                    className="rounded-[16px] px-3 py-2"
                    style={{
                      background: embeddedTravelTone === "warning" ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.08)",
                      border: `1px solid ${embeddedTravelTone === "warning" ? "rgba(251,191,36,0.16)" : "rgba(52,211,153,0.16)"}`,
                    }}
                  >
                    <p className="text-[10px] font-bold" style={{ color: embeddedTravelTone === "warning" ? "#fcd34d" : "#86efac" }}>
                      {embeddedTravelMessage}
                    </p>
                  </div>
                )}

                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {embeddedTravelDestinations.map((destination) => {
                    const { isCurrent, affordable, unlocked } = buildTravelDestinationState(destination, {
                      balance: travelBalance,
                      followers: travelFollowers,
                    });
                    const blocked = !unlocked || !affordable;
                    const isActive = embeddedTravelingTo === destination.id;
                    const destinationDemand = Number(demand?.[destination.name]?.overall_score ?? demand?.[destination.name]?.demandScore ?? 0);

                    return (
                      <button
                        key={destination.id}
                        type="button"
                        onClick={() => handleEmbeddedTravel(destination)}
                        disabled={isCurrent || isActive}
                        className="w-full text-left"
                      >
                        <div
                          className="flex items-center gap-3 rounded-[18px] px-3 py-3"
                          style={{
                            background: isCurrent ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.02)",
                            border: isCurrent ? "1px solid rgba(96,165,250,0.18)" : "1px solid rgba(255,255,255,0.05)",
                            opacity: blocked ? 0.58 : 1,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-bold text-white">{destination.name}</p>
                              {isCurrent ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]"
                                  style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}
                                >
                                  Here
                                </span>
                              ) : null}
                              <span
                                className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]"
                                style={{
                                  background: "rgba(255,255,255,0.05)",
                                  color: destinationDemand >= 70 ? "#34d399" : destinationDemand >= 55 ? "#c4b5fd" : "#fbbf24",
                                }}
                              >
                                {destinationDemand} heat
                              </span>
                            </div>
                            <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                              {destination.description}
                            </p>
                            {!unlocked ? (
                              <p className="mt-1 text-[10px]" style={{ color: "#fcd34d" }}>
                                Requires {Number(destination.unlockFollowers || 0).toLocaleString()} followers
                              </p>
                            ) : null}
                            {unlocked && !affordable ? (
                              <p className="mt-1 text-[10px]" style={{ color: "#fca5a5" }}>
                                Need {formatCurrency(destination.travelCost || 0)} to move
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#6b7280" }}>
                              Cost
                            </p>
                            <p className="mt-1 text-sm font-black text-white">
                              {isCurrent ? "Here" : formatCurrency(destination.travelCost || 0)}
                            </p>
                          </div>

                          {isActive ? (
                            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin" />
                          ) : !isCurrent ? (
                            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#374151" }} />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <CityTravelSection
                  currentRegion={currentRegion}
                  currentCity={profile?.current_city ?? null}
                  homeCity={profile?.home_city ?? null}
                  sceneData={sceneDataByRegion?.[currentRegion] ?? null}
                  profile={profile}
                  onCityUpdate={(patch) => onProfileUpdate?.(patch)}
                />
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Action stack — separated into its own fixed-height section */}
      {actionStackContent}
    </>
  );
}
