import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Globe,
  AlertCircle,
  MapPinned,
  Route,
  Radar,
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMap } from "react-leaflet";
import { AnimatePresence, motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import { supabaseClient } from "@/lib/supabaseClient";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { buildActiveTourDashboardModel } from "@/components/touring/ActiveTourDashboard";
import { buildActiveTourLiveMapModel, buildTouringMapModel, getCityLatLng } from "@/lib/touringMapModel";
import { buildTouringOpportunityModel } from "@/lib/touringOpportunityModel";
import { buildActiveTourPhaseModel } from "@/lib/touringViewModel";
import OverviewPanel from "./OverviewPanel";
import PlanningPanel from "./PlanningPanel";
import LiveTourPanel from "./LiveTourPanel";
import PrepTourPanel from "./PrepTourPanel";
import { panelSlideVariants } from "./worldMapMotion";

function resolveActionHandler(cta, onActivateBuilder, onOpenTransitTab) {
  if (cta === "planning") return onActivateBuilder;
  if (cta === "travel") return onOpenTransitTab;
  return undefined;
}

const dockTransition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
  mass: 0.9,
};

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: dockTransition,
};

const fadeSide = {
  initial: { opacity: 0, x: 22 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 14 },
  transition: dockTransition,
};

const pulseTransition = {
  repeat: Infinity,
  repeatType: "mirror",
  duration: 1.8,
};

const OVERVIEW_CENTER = [20, 10];
const OVERVIEW_ZOOM = 1;

function MapViewportController({ mode, focusRegion, focusCities }) {
  const map = useMap();

  useEffect(() => {
    if (mode !== "overview") {
      return;
    }

    map.flyTo(OVERVIEW_CENTER, OVERVIEW_ZOOM, {
      animate: true,
      duration: 0.9,
    });
  }, [map, mode]);

  useEffect(() => {
    if (mode !== "overview" || !focusRegion || !Array.isArray(focusRegion.latLng)) {
      return;
    }

    const points = [focusRegion.latLng, ...focusCities.map((city) => city.latLng).filter((latLng) => Array.isArray(latLng) && latLng.length === 2)];

    if (points.length > 1) {
      map.flyToBounds(points, {
        animate: true,
        duration: 0.9,
        padding: [48, 48],
        maxZoom: 5,
      });
      return;
    }

    map.flyTo(focusRegion.latLng, 3, {
      animate: true,
      duration: 0.9,
    });
  }, [map, mode, focusRegion, focusCities]);

  return null;
}

function _SurfaceLabel({ icon: Icon, label, value, color = "#cbd5e1" }) {
  return (
    <div className="flex items-center gap-2">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} /> : null}
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: "#64748b" }}>
          {label}
        </p>
        <p className="text-[11px] font-black leading-tight text-white">{value}</p>
      </div>
    </div>
  );
}

function CommandAction({ icon: Icon, title, subtitle, accent, onClick, badge }) {
  const disabled = typeof onClick !== "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group w-full text-left"
    >
      <div
        className="flex items-center gap-3 rounded-[18px] px-3 py-3 transition-all"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}
        >
          {Icon ? <Icon className="h-4 w-4" style={{ color: accent }} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black text-white">{title}</p>
            {badge ? (
              <span
                className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                style={{ background: `${accent}18`, color: accent }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>
            {subtitle}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: disabled ? "#1f2937" : "#4b5563" }} />
      </div>
    </button>
  );
}

export default function WorldMapHome({
  profile,
  careerSnapshot = null,
  tours = [],
  demand = {},
  sceneDataByRegion = {},
  footprint = {},
  activeTour = null,
  pastTours = [],
  selectedPastTour = null,
  routeBuilderDraft = { routeRegions: [], connectors: [], totalMiles: 0, stopCount: 0 },
  routeBuilderSequence = [],
  routePlanObject: _routePlanObject = null,
  onTapRouteRegion,
  onRemoveCityStop,
  onClearRouteBuilder,
  onCreateRoutePlanObject: _onCreateRoutePlanObject,
  onStartPlanningSession,
  onOpenPastTourDetail,
  onClosePastTourDetail,
  onCancelPlanningSession,
  onProfileUpdate,
  onWizardComplete,
  onRefreshActiveTourSurface,
  onVenueSizeChange,
}) {
  const [builderModeActive, setBuilderModeActive] = useState(false);
  const [liveTourModeActive, setLiveTourModeActive] = useState(false);
  const [activeTourGigs, setActiveTourGigs] = useState([]);
  const [activeTourGigsLoading, setActiveTourGigsLoading] = useState(false);
  const [inspectedLiveStopId, setInspectedLiveStopId] = useState(null);
  const [liveTourPanelView, setLiveTourPanelView] = useState("dashboard");
  const [runningPrepActionId, setRunningPrepActionId] = useState(null);
  const [defaultIntelIndex, setDefaultIntelIndex] = useState(0);
  const [defaultDetailView, setDefaultDetailView] = useState("past-tours");
  const [selectedPlannerStopId, setSelectedPlannerStopId] = useState(null);
  const [plannerExpandedRegionName, setPlannerExpandedRegionName] = useState(null);
  const [routeMemoryIndex, setRouteMemoryIndex] = useState(0);
  const [selectedOverviewRegionName, setSelectedOverviewRegionName] = useState(null);

  const mapModel = useMemo(() => buildTouringMapModel({ demand, tours }), [demand, tours]);

  const opportunityModel = useMemo(
    () =>
      buildTouringOpportunityModel({
        profile,
        demand,
        footprint,
        activeTour,
        careerSnapshot,
      }),
    [profile, demand, footprint, activeTour, careerSnapshot]
  );

  const spotlight = opportunityModel?.spotlight || null;
  const nextActions = Array.isArray(opportunityModel?.actions) ? opportunityModel.actions : [];
  const homeRegion = profile?.home_region || profile?.region || null;
  const activeTourDashboardModel = useMemo(() => buildActiveTourDashboardModel(activeTour || {}), [activeTour]);
  const activeTourPhaseModel = useMemo(() => buildActiveTourPhaseModel({ activeTour }), [activeTour]);
  const activeTourLiveMapModel = useMemo(
    () =>
      buildActiveTourLiveMapModel({
        activeTour,
        gigs: activeTourGigs,
        sceneDataByRegion,
        demand,
      }),
    [activeTour, activeTourGigs, sceneDataByRegion, demand]
  );

  const itineraryStops = useMemo(
    () =>
      routeBuilderDraft.routeRegions.flatMap((region, regionIndex) =>
        region.cityStops.map((stop, stopIndex) => ({
          ...stop,
          regionIndex,
          stopIndex,
          regionColor: region.regionColor,
          regionFlag: region.flag,
        }))
      ),
    [routeBuilderDraft]
  );

  const selectedRegionSet = useMemo(() => new Set(routeBuilderSequence), [routeBuilderSequence]);
  const activeTourRegionSet = useMemo(
    () => new Set(activeTourLiveMapModel.stops.map((stop) => stop.regionName)),
    [activeTourLiveMapModel]
  );

  const nextLiveStop = useMemo(
    () => activeTourLiveMapModel.stops.find((stop) => !stop.isCompleted) || activeTourLiveMapModel.stops[0] || null,
    [activeTourLiveMapModel]
  );

  const previousLiveStops = useMemo(
    () => activeTourLiveMapModel.stops.filter((stop) => stop.isCompleted).slice().reverse(),
    [activeTourLiveMapModel]
  );
  const prepPhaseActive = liveTourModeActive && activeTourPhaseModel.phase === "prep";
  const liveExecutionActive = liveTourModeActive && activeTourPhaseModel.phase !== "prep";

  const recentLiveEvents = useMemo(
    () =>
      [
        activeTourDashboardModel.fatigue > 55
          ? {
              id: "fatigue",
              label: "Fatigue watch",
              detail: `Fatigue at ${activeTourDashboardModel.fatigue}`,
            }
          : null,
        activeTourDashboardModel.momentum >= 75
          ? {
              id: "momentum",
              label: "Momentum building",
              detail: `Momentum at ${activeTourDashboardModel.momentum}`,
            }
          : null,
      ].filter(Boolean),
    [activeTourDashboardModel]
  );

  const currentLiveRegionLabel =
    nextLiveStop?.regionName ||
    activeTourLiveMapModel.currentStop?.regionName ||
    activeTourDashboardModel.displayRegion ||
    "-";

  const hottestRegion = mapModel.regions[0] || null;
  const homeRegionEntry = mapModel.regions.find((region) => region.name === homeRegion) || null;
  const exploreRegion = mapModel.regions.find((region) => region.name !== hottestRegion?.name) || hottestRegion || null;
  const scoutRegion =
    mapModel.regions.find((region) => region.name !== homeRegion && region.name !== hottestRegion?.name) ||
    exploreRegion ||
    hottestRegion ||
    null;
  const hotRegionCount = mapModel.regions.filter((region) => Number(region?.demandScore || 0) >= 70).length;

  const intelItems = useMemo(
    () =>
      [
        hottestRegion
          ? {
              id: `heat-${hottestRegion.name}`,
              tag: "HOT",
              text: `${hottestRegion.name} is your strongest touring heat zone right now at ${hottestRegion.demandScore} demand.`,
            }
          : null,
        spotlight
          ? {
              id: `spotlight-${spotlight.title}`,
              tag: "BREAKOUT",
              text: spotlight.subtitle,
            }
          : null,
        homeRegionEntry
          ? {
              id: `home-${homeRegionEntry.name}`,
              tag: "HOME",
              text: `${homeRegionEntry.name} is sitting at ${homeRegionEntry.demandScore} demand compared with your hottest market.`,
            }
          : null,
        scoutRegion
          ? {
              id: `scout-${scoutRegion.name}`,
              tag: "SCOUT",
              text: `Scout the route into ${scoutRegion.name} before the current lane cools off.`,
            }
          : null,
      ].filter(Boolean),
    [hottestRegion, spotlight, homeRegionEntry, scoutRegion]
  );

  const defaultLaunchpadActions = useMemo(
    () =>
      [
        !activeTour
          ? {
              label: "Start Planning A New Tour",
              subtitle: "Build a fresh route from the hottest markets on the map.",
              cta: "planning",
              accent: "#c084fc",
              icon: Route,
            }
          : null,
        exploreRegion
          ? {
              label: `Explore Beyond ${homeRegion || "Home Base"}`,
              subtitle: `${exploreRegion.name} is giving you a wider lane than your base market right now.`,
              cta: "travel",
              accent: "#60a5fa",
              icon: MapPinned,
            }
          : null,
        scoutRegion
          ? {
              label: `Scout The Route into ${scoutRegion.name}`,
              subtitle: `${scoutRegion.demandScore} demand makes this a strong candidate for your next expansion pass.`,
              cta: "planning",
              accent: "#34d399",
              icon: Radar,
            }
          : null,
      ].filter(Boolean),
    [activeTour, exploreRegion, homeRegion, scoutRegion]
  );

  const inspectedLiveStop = useMemo(
    () => activeTourLiveMapModel.stops.find((stop) => stop.id === inspectedLiveStopId) || activeTourLiveMapModel.currentStop || null,
    [activeTourLiveMapModel, inspectedLiveStopId]
  );

  const selectedOverviewRegion = useMemo(() => {
    if (selectedOverviewRegionName) {
      const explicit = mapModel.regions.find((region) => region.name === selectedOverviewRegionName);
      if (explicit) return explicit;
    }
    return null;
  }, [selectedOverviewRegionName, mapModel.regions]);

  const overviewAccent = selectedOverviewRegion?.color || "#a78bfa";

  const plannerRouteSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < itineraryStops.length - 1; i += 1) {
      const start = itineraryStops[i];
      const end = itineraryStops[i + 1];
      segments.push({
        id: `${start.id}->${end.id}`,
        points: [start.latLng, end.latLng],
        color: start.regionColor || "#a78bfa",
      });
    }
    return segments;
  }, [itineraryStops]);

  const selectedPlannerStop = useMemo(
    () => itineraryStops.find((stop) => stop.id === selectedPlannerStopId) || itineraryStops[0] || null,
    [itineraryStops, selectedPlannerStopId]
  );

  const effectiveExpandedPlannerRegionName =
    plannerExpandedRegionName || selectedPlannerStop?.regionName || routeBuilderDraft.routeRegions.at(-1)?.regionName || null;

  const plannerRegionClusters = useMemo(
    () =>
      routeBuilderDraft.routeRegions.map((region, regionIndex) => {
        const isExpanded = region.regionName === effectiveExpandedPlannerRegionName;
        const selectedStopInRegion = region.cityStops.find((stop) => stop.id === selectedPlannerStop?.id) || null;
        return {
          id: `cluster-${region.regionName}`,
          regionName: region.regionName,
          regionIndex,
          flag: region.flag,
          color: region.regionColor || "#a78bfa",
          center: region.latLng,
          stopCount: region.cityStops.length,
          isExpanded,
          selectedStopInRegion,
          cityStops: isExpanded ? region.cityStops : [],
        };
      }),
    [routeBuilderDraft.routeRegions, effectiveExpandedPlannerRegionName, selectedPlannerStop]
  );

  const routeMemoryItems = useMemo(
    () =>
      pastTours.map((tour, index) => ({
        id: tour?.id || `memory-${index}`,
        index,
        name: tour?.tour_name || tour?.name || `Run ${index + 1}`,
        region: tour?.region || "Unknown Region",
        endedLabel: tour?.ended_at || tour?.completed_at || tour?.updated_at || null,
        revenue: Number(tour?.total_net_revenue || tour?.revenue || 0) || 0,
        attendance: Number(tour?.total_attendance || tour?.attendance || 0) || 0,
        shows: Number(tour?.completed_stops || tour?.total_stops || tour?.shows || 0) || 0,
        tone: mapModel.regions.find((region) => region.name === (tour?.region || ""))?.color || "#94a3b8",
        demandScore: mapModel.regions.find((region) => region.name === (tour?.region || ""))?.demandScore || null,
        latLng: mapModel.regions.find((region) => region.name === (tour?.region || ""))?.latLng || null,
      })),
    [pastTours, mapModel.regions]
  );

  const activeRouteMemory = routeMemoryItems[routeMemoryIndex] || null;

  const heatMapRegionModels = useMemo(() => {
    return mapModel.regions.map((r) => {
      const sceneData = sceneDataByRegion?.[r.name] || {};
      const scenes = Array.isArray(sceneData.scenes) ? sceneData.scenes : [];
      const reps = Array.isArray(sceneData.playerReps) ? sceneData.playerReps : [];

      // Average rep across all cities in region
      const avgRep = reps.length > 0
        ? Math.round(reps.reduce((sum, rep) => sum + (Number(rep?.reputation_score) || 0), 0) / reps.length)
        : 0;

      // Footing label
      const footingLabel =
        avgRep >= 85 ? "Headliner footing" :
        avgRep >= 65 ? "Big-room footing" :
        avgRep >= 40 ? "Playable advantage" :
        avgRep >= 20 ? "Clubs opening" : "Building from scratch";

      // Trending genre
      const trendingGenres = scenes
        .map((s) => s?.trending_genre)
        .filter(Boolean);
      const dominantTrend = trendingGenres[0] || null;

      // Genre fit
      const genreMatches = scenes.filter((s) => {
        const weights = s?.genre_weights;
        if (!weights) return false;
        if (typeof weights === "object") return profile?.genre && weights[profile.genre] != null;
        return false;
      });
      const genreFit = genreMatches.length >= 2 ? "strong" : genreMatches.length === 1 ? "mixed" : "weak";

      // Artifact hints — total discoverable artifacts in region
      const totalArtifacts = scenes.reduce((count, s) => {
        const artifacts = Array.isArray(s?.cultural_artifacts) ? s.cultural_artifacts : [];
        return count + artifacts.length;
      }, 0);
      const discoveredArtifactIds = new Set(
        reps.flatMap((rep) => Array.isArray(rep?.discovered_artifacts) ? rep.discovered_artifacts : [])
      );
      const undiscoveredCount = scenes.reduce((count, s) => {
        const artifacts = Array.isArray(s?.cultural_artifacts) ? s.cultural_artifacts : [];
        return count + artifacts.filter((a) => !discoveredArtifactIds.has(a?.id)).length;
      }, 0);

      // Strongest city
      const sortedCities = [...scenes].sort((a, b) => {
        const repA = reps.find((rep) => rep?.city_id === a?.id)?.reputation_score || 0;
        const repB = reps.find((rep) => rep?.city_id === b?.id)?.reputation_score || 0;
        return repB - repA;
      });
      const strongestCity = sortedCities[0]?.city_name || null;

      // Culture tint — shift color toward genre fit signal
      let cultureTint = r.color;
      if (genreFit === "strong") cultureTint = "#34d399";
      else if (genreFit === "mixed") cultureTint = "#60a5fa";

      // Demand glow radius
      const demandRadius = Math.max(8, r.demandScore / 9);

      // Fan sentiment from scene data
      const fanSentiment =
        avgRep >= 65 && r.demandScore >= 70 ? "Fans are electric" :
        r.demandScore >= 70 ? "Fans are leaning in" :
        avgRep >= 40 ? "Fans are warming up" : "Fans are still sizing you up";

      return {
        ...r,
        avgRep,
        footingLabel,
        dominantTrend,
        genreFit,
        totalArtifacts,
        undiscoveredCount,
        strongestCity,
        cultureTint,
        demandRadius,
        fanSentiment,
        scenes,
      };
    });
  }, [mapModel.regions, sceneDataByRegion, profile?.genre]);

  const selectedHeatRegion = useMemo(
    () => heatMapRegionModels.find((r) => r.name === selectedOverviewRegionName) || null,
    [heatMapRegionModels, selectedOverviewRegionName]
  );

  const selectedRegionSceneData = useMemo(
    () => (selectedOverviewRegionName ? sceneDataByRegion?.[selectedOverviewRegionName] || null : null),
    [sceneDataByRegion, selectedOverviewRegionName]
  );

  const inspectCities = useMemo(() => {
    if (!selectedHeatRegion?.scenes?.length) {
      return [];
    }

    return selectedHeatRegion.scenes.map((scene, index) => {
      const cityName = scene?.city_name || scene?.name || `City ${index + 1}`;
      const repEntry = selectedRegionSceneData?.playerReps?.find((rep) => rep?.city_id === scene?.id) || null;
      const artifactCount = Array.isArray(scene?.cultural_artifacts) ? scene.cultural_artifacts.length : 0;

      return {
        id: scene?.id || `${selectedHeatRegion.name}-${cityName}-${index}`,
        cityName,
        latLng: getCityLatLng(cityName, selectedHeatRegion.name),
        reputation: Number(repEntry?.reputation_score || 0),
        artifactCount,
        dominantTrend: scene?.trending_genre || null,
      };
    });
  }, [selectedHeatRegion, selectedRegionSceneData]);

  const activeRouteMemoryTrail = useMemo(() => {
    if (!routeMemoryItems.length) return [];
    return routeMemoryItems
      .slice(0, routeMemoryIndex + 1)
      .filter((item) => Array.isArray(item.latLng) && item.latLng.length === 2);
  }, [routeMemoryItems, routeMemoryIndex]);

  useEffect(() => {
    if (!activeTour?.id) {
      setActiveTourGigs([]);
      setInspectedLiveStopId(null);
      setLiveTourModeActive(false);
      return;
    }
    const loadActiveTourGigs = async () => {
      setActiveTourGigsLoading(true);
      try {
        const { data, error } = await supabaseClient
          .from("gigs")
          .select("id, venue_name, city, scheduled_turn, status, tickets_sold, gross_revenue, capacity")
          .eq("tour_id", activeTour.id)
          .order("scheduled_turn", { ascending: true });
        if (error) throw error;
        setActiveTourGigs(Array.isArray(data) ? data : []);
      } catch {
        setActiveTourGigs([]);
      } finally {
        setActiveTourGigsLoading(false);
      }
    };
    loadActiveTourGigs();
  }, [activeTour?.id]);

  useEffect(() => {
    if (!liveExecutionActive) return;
    if (!activeTourLiveMapModel.currentStop?.id) return;
    setInspectedLiveStopId((prev) => prev || activeTourLiveMapModel.currentStop.id);
  }, [liveExecutionActive, activeTourLiveMapModel]);

  useEffect(() => {
    if (!liveTourModeActive) {
      setLiveTourPanelView("dashboard");
      setRunningPrepActionId(null);
    }
  }, [liveTourModeActive]);

  useEffect(() => {
    if (!builderModeActive) {
      setPlannerExpandedRegionName(null);
      return;
    }
    const stillExists = routeBuilderDraft.routeRegions.some((region) => region.regionName === plannerExpandedRegionName);
    if (stillExists) return;
    setPlannerExpandedRegionName(selectedPlannerStop?.regionName || routeBuilderDraft.routeRegions.at(-1)?.regionName || null);
  }, [builderModeActive, plannerExpandedRegionName, routeBuilderDraft.routeRegions, selectedPlannerStop]);

  useEffect(() => {
    if (!builderModeActive) return;
    setLiveTourModeActive(false);
  }, [builderModeActive]);

  useEffect(() => {
    if (builderModeActive || liveTourModeActive) return;
    if (intelItems.length <= 1) return;
    const intervalId = window.setInterval(() => {
      setDefaultIntelIndex((prev) => (prev + 1) % intelItems.length);
    }, 4200);
    return () => window.clearInterval(intervalId);
  }, [builderModeActive, liveTourModeActive, intelItems]);

  useEffect(() => {
    if (defaultIntelIndex >= intelItems.length) setDefaultIntelIndex(0);
  }, [defaultIntelIndex, intelItems]);

  useEffect(() => {
    if (!itineraryStops.length) {
      setSelectedPlannerStopId(null);
      return;
    }
    setSelectedPlannerStopId((prev) => (prev && itineraryStops.some((stop) => stop.id === prev) ? prev : itineraryStops[0].id));
  }, [itineraryStops]);

  useEffect(() => {
    if (routeMemoryIndex >= routeMemoryItems.length) setRouteMemoryIndex(0);
  }, [routeMemoryIndex, routeMemoryItems]);

  const handleMapRegionTap = (regionName) => {
    if (builderModeActive) {
      if (selectedRegionSet.has(regionName)) {
        setPlannerExpandedRegionName(regionName);
        const firstStopInRegion = itineraryStops.find((stop) => stop.regionName === regionName);
        if (firstStopInRegion?.id) {
          setSelectedPlannerStopId((prev) => (prev && String(prev).startsWith(`${regionName}:`) ? prev : firstStopInRegion.id));
        }
      }
      onTapRouteRegion?.(regionName);
      return;
    }

    if (liveTourModeActive) {
      return;
    }

    setSelectedOverviewRegionName(regionName);
    setDefaultDetailView("local-scenes");
  };

  const handleEnterPlanningMode = () => {
    onStartPlanningSession?.();
    setBuilderModeActive(true);
    setLiveTourModeActive(false);
  };

  const handleExitPlanningMode = () => {
    onCancelPlanningSession?.();
    setBuilderModeActive(false);
  };

  const handleEnterOverviewMode = (nextDetailView = defaultDetailView) => {
    setBuilderModeActive(false);
    setLiveTourModeActive(false);
    if (nextDetailView !== "local-scenes") {
      setSelectedOverviewRegionName(null);
    }
    setDefaultDetailView(nextDetailView);
  };

  const handleToggleLiveTourMode = () => {
    if (!activeTour) return;
    setBuilderModeActive(false);
    setLiveTourModeActive((prev) => {
      const nextValue = !prev;
      if (nextValue) {
        setLiveTourPanelView("dashboard");
      }
      return nextValue;
    });
  };

  const handleSetLiveTourPanelView = (viewId) => {
    if (!activeTour) return;
    setBuilderModeActive(false);
    setLiveTourModeActive(true);
    setLiveTourPanelView(viewId);
    if (viewId !== "local-scene") {
      return;
    }
    const fallbackStop =
      inspectedLiveStop ||
      activeTourLiveMapModel.currentStop ||
      activeTourLiveMapModel.stops[0] ||
      null;
    if (fallbackStop?.id) {
      setInspectedLiveStopId(fallbackStop.id);
    }
  };

  const handleRunPrepAction = async (prepActionId) => {
    if (!profile?.id || !activeTour?.id || runningPrepActionId) return;
    try {
      setRunningPrepActionId(prepActionId);
      await invokeEdgeFunction("touring", {
        action: "runPrepAction",
        artistId: profile.id,
        tourId: activeTour.id,
        prepActionId,
      });
      onRefreshActiveTourSurface?.();
    } finally {
      setRunningPrepActionId(null);
    }
  };

  const handleLaunchPreparedTour = async () => {
    if (!profile?.id || !activeTour?.id) return;
    try {
      setRunningPrepActionId("launch");
      await invokeEdgeFunction("touring", {
        action: "launchPreparedTour",
        artistId: profile.id,
        tourId: activeTour.id,
      });
      onRefreshActiveTourSurface?.();
    } finally {
      setRunningPrepActionId(null);
    }
  };

  const selectedPinDrawerRegion = liveTourModeActive
    ? mapModel.regions.find((region) => region.name === currentLiveRegionLabel) || selectedOverviewRegion
    : builderModeActive
      ? selectedPlannerStop
        ? {
            name: selectedPlannerStop.cityName,
            demandScore: selectedPlannerStop.stopIndex + 1,
            color: selectedPlannerStop.regionColor || "#a78bfa",
            status: "route stop",
            flag: selectedPlannerStop.regionFlag || "•",
          }
        : selectedOverviewRegion
      : selectedOverviewRegion;

  const commandActions = [
    ...defaultLaunchpadActions,
    ...nextActions.map((a) => ({
      ...a,
      icon: AlertCircle,
    })),
  ].slice(0, 4);

  const activeLowerPanel = builderModeActive ? "planning" : liveTourModeActive ? "live" : "overview";
  const lowerPanelDirection = activeLowerPanel === "overview" ? -1 : 1;

  return (
    <div className="@container space-y-4">
      <motion.div
        layout
        transition={dockTransition}
        className="relative overflow-hidden rounded-[30px]"
        style={{
          height: builderModeActive ? 600 : liveTourModeActive ? 430 : 380,
          border: "1px solid rgba(148,163,184,0.12)",
          background: "linear-gradient(180deg, rgba(2,6,23,0.98), rgba(9,9,16,0.98))",
          boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
        }}
      >
        <MapContainer
          center={OVERVIEW_CENTER}
          zoom={OVERVIEW_ZOOM}
          zoomControl={false}
          scrollWheelZoom
          dragging
          doubleClickZoom
          touchZoom
          attributionControl={false}
          style={{ height: "100%", width: "100%", background: "#0a0820" }}
        >
          <MapViewportController
            mode={builderModeActive || liveTourModeActive ? "non-overview" : "overview"}
            focusRegion={selectedHeatRegion}
            focusCities={inspectCities}
          />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {!builderModeActive && !liveTourModeActive && activeRouteMemoryTrail.length > 1 && (
            <Polyline
              positions={activeRouteMemoryTrail.map((item) => item.latLng)}
              pathOptions={{
                color: activeRouteMemory?.tone || "#a78bfa",
                weight: 3,
                opacity: 0.52,
                dashArray: "8 10",
                lineCap: "round",
              }}
            />
          )}

          {!builderModeActive && !liveTourModeActive &&
            activeRouteMemoryTrail.map((item, index) => {
              const isActiveMemoryNode = item.id === activeRouteMemory?.id;

              return (
                <CircleMarker
                  key={`memory-${item.id}`}
                  center={item.latLng}
                  radius={isActiveMemoryNode ? 8 : 5}
                  pathOptions={{
                    color: isActiveMemoryNode ? "#ffffff" : item.tone,
                    fillColor: item.tone,
                    fillOpacity: isActiveMemoryNode ? 0.96 : 0.72,
                    weight: isActiveMemoryNode ? 3 : 2,
                    opacity: 0.96,
                  }}
                  eventHandlers={{
                    click: () => {
                      setRouteMemoryIndex(index);
                      if (item.region) {
                        setSelectedOverviewRegionName(item.region);
                      }
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      Replay {index + 1} · {item.name} · {item.region}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {liveTourModeActive &&
            activeTourLiveMapModel.segments.map((segment) => (
              <Polyline
                key={segment.id}
                positions={segment.points}
                pathOptions={{
                  color: segment.color,
                  opacity: prepPhaseActive ? 0.4 : segment.isComplete ? 0.28 : 0.75,
                  weight: segment.isComplete ? 2 : 3,
                  dashArray: segment.isComplete ? "4 8" : undefined,
                }}
              />
            ))}

          {liveTourModeActive &&
            activeTourLiveMapModel.stops.map((stop, index) => {
              const isCurrentStop = prepPhaseActive ? index === 0 : stop.isCurrent;
              const isNextStop = prepPhaseActive ? index === 1 : nextLiveStop?.id === stop.id && !isCurrentStop;
              const isCompletedStop = stop.isCompleted;
              const markerColor = isCurrentStop
                ? "#c084fc"
                : isNextStop
                  ? "#60a5fa"
                  : isCompletedStop
                    ? "#34d399"
                    : "#94a3b8";

              return (
                <CircleMarker
                  key={`live-stop-${stop.id}`}
                  center={stop.latLng}
                  radius={isCurrentStop ? 7 : isNextStop ? 5.6 : 4.2}
                  pathOptions={{
                    color: isCurrentStop ? "#ffffff" : markerColor,
                    fillColor: markerColor,
                    fillOpacity: isCurrentStop ? 0.98 : isNextStop ? 0.9 : 0.8,
                    weight: isCurrentStop ? 2.5 : isNextStop ? 2 : 1.5,
                    opacity: 0.95,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {`Stop ${index + 1} · ${stop.cityName}${isCurrentStop ? " · current" : isNextStop ? " · next" : isCompletedStop ? " · completed" : ""}`}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {builderModeActive &&
            routeBuilderDraft.connectors.map((connector) => (
              <Polyline
                key={connector.id}
                positions={connector.points}
                pathOptions={{
                  color: connector.color || "#a78bfa",
                  weight: 3,
                  opacity: 0.7,
                  dashArray: "6 8",
                }}
              />
            ))}

          {builderModeActive &&
            plannerRouteSegments.map((segment, index) => (
              <Polyline
                key={segment.id}
                positions={segment.points}
                pathOptions={{
                  color: index % 2 === 0 ? "#f472b6" : "#60a5fa",
                  weight: selectedPlannerStop ? 4 : 3,
                  opacity: 0.9,
                  lineCap: "round",
                }}
              />
            ))}

          {heatMapRegionModels.map((r) => {
            const isLiveRegion = liveTourModeActive && activeTourRegionSet.has(r.name);
            const isSelectedBuilderRegion = builderModeActive && selectedRegionSet.has(r.name);
            const isSelectedOverview = !builderModeActive && !liveTourModeActive && selectedHeatRegion?.name === r.name;
            const isOverviewMode = !builderModeActive && !liveTourModeActive;

            // Demand-driven radius
            const baseRadius = isLiveRegion || isSelectedBuilderRegion || isSelectedOverview
              ? Math.max(12, r.demandRadius)
              : r.demandRadius;

            // Color: live/builder use fixed scheme; overview uses culture tint
            const markerColor = isLiveRegion ? "#34d399"
              : isSelectedBuilderRegion ? r.color
              : isSelectedOverview ? r.cultureTint
              : isOverviewMode ? r.cultureTint
              : r.color;

            // Glow opacity tied to demand
            const glowOpacity = isOverviewMode
              ? Math.min(0.92, 0.45 + (r.demandScore / 100) * 0.47)
              : 0.82;

            // Footing ring weight (thicker = better footing)
            const footingWeight = isOverviewMode
              ? (r.avgRep >= 65 ? 3.5 : r.avgRep >= 40 ? 2.5 : 1.5)
              : isLiveRegion || isSelectedBuilderRegion || isSelectedOverview ? 3 : 2;

            const tooltipText = liveTourModeActive && activeTourRegionSet.has(r.name)
              ? `${r.name} · tour stop`
              : builderModeActive && selectedRegionSet.has(r.name)
                ? `${r.name} · on route`
                : `${r.name} · ${r.demandScore} demand${r.dominantTrend ? ` · ${r.dominantTrend}` : ""}${r.undiscoveredCount > 0 ? ` · ${r.undiscoveredCount} artifacts` : ""}`;

            return (
              <React.Fragment key={r.name}>
                {/* Outer glow ring — demand heat */}
                {isOverviewMode && (
                  <CircleMarker
                    center={r.latLng}
                    radius={baseRadius + 5}
                    pathOptions={{
                      color: markerColor,
                      fillColor: markerColor,
                      fillOpacity: 0.08,
                      weight: 0,
                      opacity: 0,
                    }}
                    interactive={false}
                  />
                )}

                {/* Main region marker */}
                <CircleMarker
                  center={r.latLng}
                  radius={baseRadius}
                  pathOptions={{
                    color: isLiveRegion || isSelectedBuilderRegion || isSelectedOverview ? "#ffffff" : markerColor,
                    fillColor: markerColor,
                    fillOpacity: glowOpacity,
                    weight: footingWeight,
                    opacity: isSelectedOverview ? 1 : 0.82,
                  }}
                  eventHandlers={{
                    click: () => handleMapRegionTap(r.name),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{tooltipText}</span>
                  </Tooltip>
                </CircleMarker>

                {/* Artifact pulse dot */}
                {isOverviewMode && r.undiscoveredCount > 0 && (
                  <CircleMarker
                    center={[r.latLng[0] + baseRadius * 0.0095, r.latLng[1] + baseRadius * 0.013]}
                    radius={3}
                    pathOptions={{
                      color: "#fbbf24",
                      fillColor: "#fbbf24",
                      fillOpacity: 0.96,
                      weight: 0,
                      opacity: 1,
                    }}
                    interactive={false}
                  />
                )}
              </React.Fragment>
            );
          })}

          {!builderModeActive && !liveTourModeActive && selectedHeatRegion &&
            inspectCities.map((city) => {
              const isLeadCity = selectedHeatRegion.strongestCity === city.cityName;

              return (
                <CircleMarker
                  key={city.id}
                  center={city.latLng}
                  radius={isLeadCity ? 7 : 5}
                  pathOptions={{
                    color: isLeadCity ? "#ffffff" : selectedHeatRegion.cultureTint || selectedHeatRegion.color,
                    fillColor: selectedHeatRegion.cultureTint || selectedHeatRegion.color,
                    fillOpacity: isLeadCity ? 0.96 : 0.82,
                    weight: isLeadCity ? 2.5 : 1.5,
                    opacity: 0.98,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {city.cityName} · {city.reputation || 0} rep{city.dominantTrend ? ` · ${city.dominantTrend}` : ""}{city.artifactCount > 0 ? ` · ${city.artifactCount} artifacts` : ""}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {builderModeActive &&
            plannerRegionClusters.map((cluster) => {
              const clusterRadius = cluster.isExpanded ? 12 : 10;

              return (
                <React.Fragment key={cluster.id}>
                  <CircleMarker
                    center={cluster.center}
                    radius={clusterRadius}
                    pathOptions={{
                      color: cluster.isExpanded ? "#ffffff" : cluster.color,
                      fillColor: cluster.color,
                      fillOpacity: cluster.isExpanded ? 0.96 : 0.78,
                      weight: cluster.isExpanded ? 3 : 2,
                      opacity: 0.95,
                    }}
                    eventHandlers={{
                      click: () => {
                        setPlannerExpandedRegionName(cluster.regionName);
                        if (cluster.cityStops[0]?.id) {
                          setSelectedPlannerStopId(cluster.selectedStopInRegion?.id || cluster.cityStops[0].id);
                        }
                      },
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                        Leg {cluster.regionIndex + 1} · {cluster.regionName} · {cluster.stopCount} stops
                      </span>
                    </Tooltip>
                  </CircleMarker>

                  {cluster.cityStops.map((stop, stopIndex) => {
                    const routeStopIndex = itineraryStops.findIndex((itineraryStop) => itineraryStop.id === stop.id);
                    const isSelectedStop = selectedPlannerStop?.id === stop.id;

                    return (
                      <CircleMarker
                        key={stop.id}
                        center={stop.latLng}
                        radius={isSelectedStop ? 8 : 5}
                        pathOptions={{
                          color: isSelectedStop ? "#ffffff" : cluster.color,
                          fillColor: cluster.color,
                          fillOpacity: isSelectedStop ? 1 : 0.88,
                          weight: isSelectedStop ? 3 : 1.5,
                          opacity: 0.98,
                        }}
                        eventHandlers={{
                          click: () => {
                            setPlannerExpandedRegionName(cluster.regionName);
                            setSelectedPlannerStopId(stop.id);
                          },
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>
                            Stop {routeStopIndex + 1 || stopIndex + 1} · {stop.cityName} · {stop.venueName}
                          </span>
                        </Tooltip>
                      </CircleMarker>
                    );
                  })}
                </React.Fragment>
              );
            })}
        </MapContainer>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: builderModeActive
              ? "linear-gradient(180deg, rgba(2,6,23,0.05) 0%, rgba(2,6,23,0) 18%, rgba(2,6,23,0.12) 58%, rgba(2,6,23,0.58) 100%)"
              : "linear-gradient(180deg, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0) 24%, rgba(2,6,23,0.08) 60%, rgba(2,6,23,0.62) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "radial-gradient(circle at top center, rgba(96,165,250,0.14), transparent 60%)" }}
        />
        <div
          className="pointer-events-none absolute -right-16 top-10 h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.14), transparent 68%)" }}
        />
        <div
          className="pointer-events-none absolute -left-12 bottom-10 h-28 w-28 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(244,114,182,0.1), transparent 72%)" }}
        />

        {(builderModeActive || liveTourModeActive) && (
          <motion.div
            {...fadeUp}
            className="absolute left-3 top-3 z-[1000] max-w-[52%] rounded-[16px] px-2.5 py-2"
            style={{
              background: "linear-gradient(135deg, rgba(6,10,22,0.82), rgba(15,23,42,0.5))",
              border: "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: liveExecutionActive ? "#34d399" : liveTourModeActive ? "#c084fc" : "#c084fc",
                  boxShadow: `0 0 10px ${liveExecutionActive ? "rgba(52,211,153,0.55)" : "rgba(192,132,252,0.5)"}`,
                }}
                animate={{ scale: [1, 1.22, 1] }}
                transition={pulseTransition}
              />
              <p className="text-[8px] font-black uppercase tracking-[0.26em]" style={{ color: liveExecutionActive ? "#bbf7d0" : liveTourModeActive ? "#e9d5ff" : "#e9d5ff" }}>
                {liveExecutionActive ? "Live Atlas" : liveTourModeActive ? "Staged Route" : "Route Build"}
              </p>
            </div>

            <p className="mt-1 text-[11px] font-black leading-tight text-white">
              {liveTourModeActive ? activeTourDashboardModel.displayName : `${routeBuilderDraft.stopCount || 0}-stop run`}
            </p>

            <p className="mt-0.5 text-[9px] leading-snug" style={{ color: "#94a3b8" }}>
              {liveTourModeActive
                ? prepPhaseActive
                  ? `Staged route · departs in ${activeTourPhaseModel.countdownTurnsRemaining || 0} turns`
                  : `${currentLiveRegionLabel || "Live route"} · ${activeTourLiveMapModel.totalStops || activeTour?.turns_total || 0} stops`
                : `${routeBuilderDraft.totalMiles.toLocaleString()} mi · tap regions`}
            </p>
          </motion.div>
        )}

        <motion.div
          {...fadeUp}
          className="absolute bottom-4 left-4 z-[1000] rounded-full px-3 py-1.5"
          style={{
            background: "rgba(2,6,23,0.74)",
            border: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3" style={{ color: overviewAccent }} />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#cbd5e1" }}>
              {liveTourModeActive
                ? prepPhaseActive
                  ? `Departs in ${activeTourPhaseModel.countdownTurnsRemaining || 0} turns`
                  : `${currentLiveRegionLabel || "Live route"} • ${activeTourDashboardModel.progress}%`
                : builderModeActive
                  ? `${routeBuilderDraft.stopCount || 0} route stops`
                  : selectedOverviewRegion
                    ? `${selectedOverviewRegion.demandScore ?? "-"} world demand`
                    : "tap a market pin"}
            </span>
          </div>
        </motion.div>

        <AnimatePresence>
          {selectedPinDrawerRegion && (
            <motion.div
              key={`${builderModeActive}-${liveTourModeActive}-${selectedPinDrawerRegion?.name}`}
              {...fadeSide}
              className="absolute right-4 top-4 z-[1000] w-[280px] max-w-[45%] rounded-[24px] px-4 py-3"
              style={{
                background: "linear-gradient(180deg, rgba(5,8,18,0.84), rgba(10,14,28,0.62))",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: selectedPinDrawerRegion.color || "#c4b5fd" }}>
                    {liveTourModeActive ? (prepPhaseActive ? "Departure lane" : "Current lane") : builderModeActive ? "Route object" : "Pinned market"}
                  </p>
                  <p className="mt-2 truncate text-[18px] font-black leading-none text-white">
                    {selectedPinDrawerRegion.name || "-"}
                  </p>
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                    {liveTourModeActive
                      ? prepPhaseActive
                        ? `This lane is staged for departure. Use the prep rail to improve launch readiness before the route goes live.`
                        : `This lane is feeding the current run. Use local scene view or command controls to inspect it.`
                      : builderModeActive
                        ? selectedPlannerStop
                          ? `${selectedPlannerStop.cityName} is currently selected as Stop ${selectedPlannerStop.stopIndex + 1} on the route.`
                          : `Tap markets and stops to build a route object directly against the map.`
                        : selectedHeatRegion?.strongestCity
                          ? `${selectedHeatRegion.strongestCity} is the lead city. ${selectedHeatRegion.fanSentiment}. ${selectedHeatRegion.dominantTrend ? `Scene is ${selectedHeatRegion.dominantTrend}-dominant.` : ""} ${selectedHeatRegion.footingLabel} here.`
                          : `${selectedPinDrawerRegion.name} is the current lead touring thesis based on demand, lane quality, and map pressure.`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
                    {builderModeActive ? "Node" : "Demand"}
                  </p>
                  <p className="mt-1 text-[24px] font-black leading-none" style={{ color: selectedPinDrawerRegion.color || "#a78bfa" }}>
                    {builderModeActive ? selectedPlannerStop?.stopIndex + 1 || "-" : selectedPinDrawerRegion.demandScore ?? "-"}
                  </p>
                  {!builderModeActive && !liveTourModeActive && selectedHeatRegion && (
                    <div className="mt-2 space-y-1 text-right">
                      {selectedHeatRegion.genreFit !== "weak" && (
                        <p className="text-[9px] font-black" style={{ color: selectedHeatRegion.genreFit === "strong" ? "#34d399" : "#60a5fa" }}>
                          {selectedHeatRegion.genreFit === "strong" ? "Genre fit" : "Mixed fit"}
                        </p>
                      )}
                      {selectedHeatRegion.undiscoveredCount > 0 && (
                        <p className="text-[9px] font-black" style={{ color: "#fbbf24" }}>
                          {selectedHeatRegion.undiscoveredCount} artifacts
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-4 right-4 z-[1000] flex flex-wrap items-center justify-end gap-2">
          {!builderModeActive && !liveTourModeActive && selectedHeatRegion && (
            <button
              type="button"
              onClick={() => handleEnterOverviewMode("past-tours")}
              className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide"
              style={{
                background: "rgba(96,165,250,0.16)",
                border: "1px solid rgba(147,197,253,0.24)",
                color: "#dbeafe",
              }}
            >
              Back to Overview
            </button>
          )}
          <button
            type="button"
            onClick={() => handleEnterOverviewMode()}
            className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide"
            style={{
              background: !builderModeActive && !liveTourModeActive ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.84)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: !builderModeActive && !liveTourModeActive ? "#ffffff" : "#cbd5e1",
            }}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={builderModeActive ? handleExitPlanningMode : handleEnterPlanningMode}
            className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide"
            style={{
              background: builderModeActive ? "rgba(192,132,252,0.18)" : "rgba(15,23,42,0.84)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: builderModeActive ? "#f3e8ff" : "#e9d5ff",
            }}
          >
            {builderModeActive ? "Exit Planning" : "Planning"}
          </button>
          {activeTour && (
            <button
              type="button"
              onClick={handleToggleLiveTourMode}
              className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide"
              style={{
                background: liveTourModeActive ? "rgba(52,211,153,0.16)" : "rgba(15,23,42,0.84)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: liveTourModeActive ? "#dcfce7" : "#bbf7d0",
              }}
            >
              {liveTourModeActive ? "Exit Live Tour" : "Live Tour"}
            </button>
          )}
        </div>

        <AnimatePresence>
          {builderModeActive && (
            <motion.div
              key="planning-rail"
              {...fadeSide}
              className="absolute bottom-16 right-3 z-[1000] w-[220px] max-w-[42%] rounded-[20px] px-3 py-2.5"
              style={{
                background: "linear-gradient(180deg, rgba(7,10,18,0.94), rgba(10,14,28,0.8))",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Fixed header — always same height */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.22em]" style={{ color: "#c4b5fd" }}>
                    Route rail
                  </p>
                  <span className="text-[10px] font-black text-white">
                    {routeBuilderDraft.stopCount || 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {routeBuilderDraft.stopCount > 0 && (
                    <>
                      <span className="text-[9px] font-black" style={{ color: "#60a5fa" }}>
                        {routeBuilderDraft.totalMiles.toLocaleString()} mi
                      </span>
                      <button
                        type="button"
                        onClick={() => onClearRouteBuilder?.()}
                        className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] transition-colors"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Scrollable city list — grows only when there are stops */}
              {itineraryStops.length === 0 ? (
                <p className="mt-2 text-[9px]" style={{ color: "#4b5563" }}>
                  Tap regions to build route
                </p>
              ) : (
                <div className="mt-2 max-h-[160px] overflow-y-auto space-y-px pr-0.5">
                  {itineraryStops.map((stop, index) => (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => {
                        setPlannerExpandedRegionName(stop.regionName);
                        setSelectedPlannerStopId(stop.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-[12px] px-2 py-1.5 text-left transition-colors"
                      style={{
                        background: selectedPlannerStop?.id === stop.id ? "rgba(255,255,255,0.07)" : "transparent",
                      }}
                    >
                      <span
                        className="flex-shrink-0 text-[8px] font-black w-4 text-center"
                        style={{ color: stop.regionColor || "#c4b5fd" }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-black text-white leading-tight">{stop.cityName}</p>
                        <p className="truncate text-[8px] leading-tight" style={{ color: "#6b7280" }}>{stop.regionName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait" custom={lowerPanelDirection}>
        {activeLowerPanel === "overview" && (
          <motion.div
            key="overview-panel"
            custom={lowerPanelDirection}
            variants={panelSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <OverviewPanel
              mapModel={mapModel}
              selectedOverviewRegion={selectedOverviewRegion}
              overviewAccent={overviewAccent}
              hottestRegion={hottestRegion}
              homeRegion={homeRegion}
              homeRegionEntry={homeRegionEntry}
              scoutRegion={scoutRegion}
              hotRegionCount={hotRegionCount}
              heatMapRegionModels={heatMapRegionModels}
              selectedHeatRegion={selectedHeatRegion}
              footprint={footprint}
              spotlight={spotlight}
              routeBuilderDraft={routeBuilderDraft}
              pastTours={pastTours}
              selectedPastTour={selectedPastTour}
              routeMemoryItems={routeMemoryItems}
              selectedRegionSceneData={selectedRegionSceneData}
              onOpenPastTourDetail={onOpenPastTourDetail}
              onClosePastTourDetail={onClosePastTourDetail}
              onSelectOverviewRegion={setSelectedOverviewRegionName}
              intelItems={intelItems}
              defaultIntelIndex={defaultIntelIndex}
              defaultDetailView={defaultDetailView}
              onDefaultDetailViewChange={setDefaultDetailView}
              routeMemoryIndex={routeMemoryIndex}
              onRouteMemoryIndexChange={setRouteMemoryIndex}
              profile={profile}
              demand={demand}
              sceneDataByRegion={sceneDataByRegion}
              onProfileUpdate={onProfileUpdate}
              commandActions={commandActions}
              onEnterPlanningMode={handleEnterPlanningMode}
              onEnterTransitView={() => handleEnterOverviewMode("travel")}
              onEnterScenesView={() => handleEnterOverviewMode("local-scenes")}
              actionStackContent={
                <div className="pt-3">
                  <motion.div
                    {...fadeUp}
                    className="overflow-hidden rounded-[30px]"
                    style={{
                      background: "linear-gradient(145deg, rgba(8,12,24,0.98), rgba(15,23,42,0.9))",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div className="border-b px-4 py-3 md:px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#94a3b8" }}>
                        Action stack
                      </p>
                    </div>
                    <div className="max-h-[260px] space-y-2 overflow-y-auto px-4 py-4 md:px-5">
                      {commandActions.map((a) => (
                        <CommandAction
                          key={a.label}
                          icon={a.icon || Route}
                          title={a.label}
                          subtitle={a.subtitle}
                          accent={a.accent || (a.urgency === "high" ? "#f472b6" : "#60a5fa")}
                          badge={a.urgency === "high" ? "Urgent" : undefined}
                          onClick={resolveActionHandler(a.cta, handleEnterPlanningMode, () => handleEnterOverviewMode("travel"))}
                        />
                      ))}
                    </div>
                  </motion.div>
                </div>
              }
            />
          </motion.div>
        )}

        {activeLowerPanel === "planning" && (
          <motion.div
            key="planning-panel"
            custom={lowerPanelDirection}
            variants={panelSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <PlanningPanel
              profile={profile}
              routeBuilderDraft={routeBuilderDraft}
              routeBuilderSequence={routeBuilderSequence}
              sceneDataByRegion={sceneDataByRegion}
              onTapRouteRegion={onTapRouteRegion}
              onRemoveCityStop={onRemoveCityStop}
              onClearRouteBuilder={() => {
                onClearRouteBuilder?.();
                setBuilderModeActive(false);
              }}
              onWizardComplete={() => {
                onWizardComplete?.();
                setBuilderModeActive(false);
              }}
              onWizardCancel={() => {
                onCancelPlanningSession?.();
                setBuilderModeActive(false);
              }}
              onExitPlanningMode={handleExitPlanningMode}
              onVenueSizeChange={onVenueSizeChange}
            />
          </motion.div>
        )}

        {activeLowerPanel === "live" && (
          <motion.div
            key="live-panel"
            custom={lowerPanelDirection}
            variants={panelSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {prepPhaseActive ? (
              <PrepTourPanel
                activeTour={activeTour}
                phaseModel={activeTourPhaseModel}
                nextStop={nextLiveStop}
                runningPrepActionId={runningPrepActionId}
                onRunPrepAction={handleRunPrepAction}
                onLaunchNow={handleLaunchPreparedTour}
              />
            ) : (
              <LiveTourPanel
                activeTour={activeTour}
                profile={profile}
                activeTourDashboardModel={activeTourDashboardModel}
                activeTourLiveMapModel={activeTourLiveMapModel}
                activeTourGigs={activeTourGigs}
                activeTourGigsLoading={activeTourGigsLoading}
                nextLiveStop={nextLiveStop}
                previousLiveStops={previousLiveStops}
                recentLiveEvents={recentLiveEvents}
                currentLiveRegionLabel={currentLiveRegionLabel}
                inspectedLiveStop={inspectedLiveStop}
                onSelectInspectedStop={setInspectedLiveStopId}
                liveTourPanelView={liveTourPanelView}
                onLiveTourPanelViewChange={handleSetLiveTourPanelView}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}