import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { supabaseClient } from "@/lib/supabaseClient";
import WorldMapHome from "@/components/touring/world-map/WorldMapHome";
import ToursHub from "@/components/touring/tours/ToursHub";
import PastTourDetailSheet from "@/components/touring/tours/PastTourDetailSheet";
import {
  buildRouteBuilderDraft,
  buildRoutePlanObject,
  buildTouringFootprint,
  REGION_META,
} from "@/lib/touringMapModel";
import {
  ChevronLeft,
  Globe,
  Music,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const DESTINATIONS = [
  { id: "world-map", label: "World Map", icon: Globe },
  { id: "tours", label: "Tours / Co-Tours", icon: Music },
];

const ROUTE_BUILDER_STORAGE_PREFIX = 'touring:world-map-route-draft:';

export function buildTouringDestinations() {
  return DESTINATIONS;
}

export function buildTouringShellState({ loading, profile, error }) {
  if (loading) {
    return {
      mode: 'loading',
      title: 'Loading touring network',
      message: 'Pulling your routes, demand, and active tour data.',
      tone: 'neutral',
    };
  }

  if (error) {
    return {
      mode: 'error',
      title: 'Touring signal lost',
      message: error,
      tone: 'danger',
    };
  }

  if (!profile?.id) {
    return {
      mode: 'empty',
      title: 'No touring profile loaded',
      message: 'Load your artist profile before opening Touring.',
      tone: 'muted',
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TouringAppV2() {
  const navigate = useNavigate();
  const [activeDestination, setActiveDestination] = useState("world-map");
  const [selectedPastTour, setSelectedPastTour] = useState(null);
  const [profile, setProfile] = useState(null);
  const [careerSnapshot, setCareerSnapshot] = useState(null);
  const [tours, setTours] = useState([]);
  const [regionalDemand, setRegionalDemand] = useState({});
  const [sceneDataByRegion, setSceneDataByRegion] = useState({});
  const [venuesByRegion, setVenuesByRegion] = useState({});
  const [routeBuilderSequence, setRouteBuilderSequence] = useState([]);
  const [removedStopIds, setRemovedStopIds] = useState([]);
  const [routePlanObject, setRoutePlanObject] = useState(null);
  const [planningSessionSnapshot, setPlanningSessionSnapshot] = useState(null);
  const [selectedVenueSize, setSelectedVenueSize] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeOpenerSlots, setActiveOpenerSlots] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(`${ROUTE_BUILDER_STORAGE_PREFIX}${profile.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setRouteBuilderSequence(Array.isArray(parsed?.routeBuilderSequence) ? parsed.routeBuilderSequence : []);
      setRemovedStopIds(Array.isArray(parsed?.removedStopIds) ? parsed.removedStopIds : []);
      setRoutePlanObject(parsed?.routePlanObject || null);
    } catch {
      setRouteBuilderSequence([]);
      setRemovedStopIds([]);
      setRoutePlanObject(null);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    localStorage.setItem(
      `${ROUTE_BUILDER_STORAGE_PREFIX}${profile.id}`,
      JSON.stringify({ routeBuilderSequence, removedStopIds, routePlanObject })
    );
  }, [profile?.id, routeBuilderSequence, removedStopIds, routePlanObject]);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) return;
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const p = profiles?.[0] || null;
      setProfile(p);
      if (p?.id) {
        const snapshotPromise = supabaseClient
          .from("v_career_progression_snapshot")
          .select("artist_id, dominant_lane, secondary_lane, current_archetype, current_weather_fit")
          .eq("artist_id", p.id)
          .maybeSingle()
          .then((result) => result.data || null)
          .catch(() => null);
        const demandResult = await invokeEdgeFunction("touring", {
          action: "getRegionalDemand",
          artistId: p.id,
        }).catch(() => ({ success: false }));
        const toursData = await base44.entities.Tour.filter({ artist_id: p.id }).catch(() => []);
        const regionNames = REGION_META.map((region) => region.name);
        const sceneEntries = await Promise.all(
          regionNames.map(async (region) => {
            try {
              const result = await invokeEdgeFunction("touring", {
                action: "getCitySceneData",
                artistId: p.id,
                region,
              });
              return [region, result?.success ? (result.data || {}) : {}];
            } catch {
              return [region, {}];
            }
          })
        );
        const venueEntries = await Promise.all(
          regionNames.map(async (region) => {
            try {
              const venues = await base44.entities.Venue.filter({ region });
              return [region, Array.isArray(venues) ? venues : []];
            } catch {
              return [region, []];
            }
          })
        );
        const snapshotData = await snapshotPromise;
        const valid = Array.isArray(toursData) ? toursData : [];
        valid.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTours(valid);
        setCareerSnapshot(snapshotData);
        setRegionalDemand(demandResult?.success ? (demandResult.data?.demand || {}) : {});
        setSceneDataByRegion(Object.fromEntries(sceneEntries));
        setVenuesByRegion(Object.fromEntries(venueEntries));
        // Opener slots: is this player an active opener on another artist's tour?
        const { data: openerSlots } = await supabaseClient
          .from('tour_opening_acts')
          .select('id, tour_id, tour:tours(tour_name, artist_id, region), revenue_split, metadata')
          .eq('opener_id', p.id)
          .eq('status', 'active')
          .limit(3);
        setActiveOpenerSlots(Array.isArray(openerSlots) ? openerSlots : []);
      } else {
        setCareerSnapshot(null);
        setRegionalDemand({});
        setSceneDataByRegion({});
        setVenuesByRegion({});
        setActiveOpenerSlots([]);
      }
    } catch (err) {
      console.error('[TouringAppV2] loadData error:', err);
      setLoadError('Failed to load touring data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const activeTour = useMemo(() => tours.find((t) => t.status === 'active') || null, [tours]);
  const pastTours = useMemo(() => tours.filter((t) => t.status === 'completed' || t.status === 'finished'), [tours]);
  const footprint = useMemo(() => buildTouringFootprint(tours), [tours]);
  const routeBuilderDraft = useMemo(
    () => buildRouteBuilderDraft({
      tappedRegions: routeBuilderSequence,
      sceneDataByRegion,
      venuesByRegion,
      removedStopIds,
      profile,
      venueSize: selectedVenueSize,
    }),
    [routeBuilderSequence, sceneDataByRegion, venuesByRegion, removedStopIds, profile, selectedVenueSize]
  );
  const shellState = useMemo(() => buildTouringShellState({ loading, profile, error: loadError }), [loading, profile, loadError]);

  const handleTapRouteRegion = (regionName) => {
    setRouteBuilderSequence((prev) => {
      const withoutRegion = prev.filter((region) => region !== regionName);
      return [...withoutRegion, regionName];
    });
    setRemovedStopIds((prev) => prev.filter((stopId) => !String(stopId).startsWith(`${regionName}:`)));
  };

  const handleRemoveCityStop = (regionName, stopId) => {
    const nextRemovedStopIds = [...removedStopIds, stopId];
    const nextDraft = buildRouteBuilderDraft({
      tappedRegions: routeBuilderSequence,
      sceneDataByRegion,
      venuesByRegion,
      removedStopIds: nextRemovedStopIds,
      venueSize: selectedVenueSize,
      profile,
    });
    setRemovedStopIds(nextRemovedStopIds);
    setRouteBuilderSequence(nextDraft.routeRegions.map((region) => region.regionName));
    setRoutePlanObject((prev) => (prev ? buildRoutePlanObject({ draft: nextDraft, artistId: profile?.id }) : prev));
  };

  const handleCreateRoutePlanObject = () => {
    setRoutePlanObject(buildRoutePlanObject({ draft: routeBuilderDraft, artistId: profile?.id }));
  };

  const handleClearRouteBuilder = () => {
    setRouteBuilderSequence([]);
    setRemovedStopIds([]);
    setRoutePlanObject(null);
  };

  const handleStartPlanningSession = () => {
    setPlanningSessionSnapshot((prev) => prev || {
      routeBuilderSequence: [...routeBuilderSequence],
      removedStopIds: [...removedStopIds],
      routePlanObject: routePlanObject || null,
    });
  };

  const handleCancelPlanningSession = () => {
    if (planningSessionSnapshot) {
      setRouteBuilderSequence(Array.isArray(planningSessionSnapshot.routeBuilderSequence)
        ? [...planningSessionSnapshot.routeBuilderSequence]
        : []);
      setRemovedStopIds(Array.isArray(planningSessionSnapshot.removedStopIds)
        ? [...planningSessionSnapshot.removedStopIds]
        : []);
      setRoutePlanObject(planningSessionSnapshot.routePlanObject || null);
    }
    setPlanningSessionSnapshot(null);
    setSelectedVenueSize(null);
  };

  const handlePlanningSessionComplete = () => {
    setPlanningSessionSnapshot(null);
    setSelectedVenueSize(null);
    loadData();
    setActiveDestination("tours");
  };

  const handleRefreshActiveTourSurface = () => {
    loadData();
    setSelectedPastTour(null);
    setActiveDestination("world-map");
  };

  const handleOpenActiveTourSurface = () => {
    setSelectedPastTour(null);
    setActiveDestination("world-map");
  };

  const handleBack = () => {
    navigate('/Career');
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-white/[0.06] z-20">
        <div className="max-w-lg mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs font-medium text-white/50 transition hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Career
            </button>
            <h1 className="text-lg font-bold text-white">Touring</h1>
            <div className="w-16" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6">
          {shellState ? (
            <div
              className="rounded-3xl p-5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${shellState.tone === 'danger' ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: shellState.tone === 'danger' ? '#f87171' : '#6b7280' }}>
                  {shellState.mode}
                </p>
                <h2 className="text-lg font-bold text-white">{shellState.title}</h2>
                <p className="text-sm" style={{ color: '#9ca3af' }}>{shellState.message}</p>
                {shellState.mode === 'error' && (
                  <button
                    type="button"
                    onClick={loadData}
                    className="mt-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* OPENER / CO-HEADLINER BADGE */}
              {activeOpenerSlots.length > 0 && (
                <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(196,181,253,0.08)', border: '1px solid rgba(196,181,253,0.25)' }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#c4b5fd' }}>
                    Active Tour Roles
                  </p>
                  {activeOpenerSlots.map((slot) => {
                    const role = slot.metadata?.role;
                    const roleLabel = role === 'equal_coheadliner' ? 'Co-Headliner'
                      : role === 'partner_led' ? 'Partner Headliner'
                      : 'Opening Act';
                    return (
                      <div key={slot.id} className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-black" style={{ background: 'rgba(196,181,253,0.2)', color: '#c4b5fd' }}>
                          {roleLabel}
                        </span>
                        <span className="text-xs text-white font-semibold">{slot.tour?.tour_name || 'Tour'}</span>
                        <span className="text-xs" style={{ color: '#9ca3af' }}>{Math.round((slot.revenue_split || 0) * 100)}% split</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* WORLD MAP */}
              {activeDestination === "world-map" && (
                <WorldMapHome
                  profile={profile}
                  careerSnapshot={careerSnapshot}
                  tours={tours}
                  demand={regionalDemand}
                  sceneDataByRegion={sceneDataByRegion}
                  footprint={footprint}
                  activeTour={activeTour}
                  pastTours={pastTours}
                  selectedPastTour={selectedPastTour}
                  routeBuilderDraft={routeBuilderDraft}
                  routeBuilderSequence={routeBuilderSequence}
                  routePlanObject={routePlanObject}
                  onTapRouteRegion={handleTapRouteRegion}
                  onRemoveCityStop={handleRemoveCityStop}
                  onClearRouteBuilder={handleClearRouteBuilder}
                  onCreateRoutePlanObject={handleCreateRoutePlanObject}
                  onStartPlanningSession={handleStartPlanningSession}
                  onCancelPlanningSession={handleCancelPlanningSession}
                  onOpenPastTourDetail={(tour) => setSelectedPastTour(tour)}
                  onClosePastTourDetail={() => setSelectedPastTour(null)}
                  onProfileUpdate={(patch) => setProfile((p) => ({ ...p, ...patch }))}
                  onWizardComplete={handlePlanningSessionComplete}
                  onRefreshActiveTourSurface={handleRefreshActiveTourSurface}
                  onVenueSizeChange={setSelectedVenueSize}
                />
              )}

              {/* TOURS */}
              {activeDestination === "tours" && !selectedPastTour && (
                <ToursHub
                  activeTour={activeTour}
                  pastTours={pastTours}
                  profile={profile}
                  onStartPlanning={() => setActiveDestination("world-map")}
                  onGoToWorldMap={() => setActiveDestination("world-map")}
                  onOpenActiveTourSurface={handleOpenActiveTourSurface}
                  onOpenPastTourDetail={(tour) => setSelectedPastTour(tour)}
                />
              )}

              {/* PAST TOUR DETAIL */}
              {activeDestination === "tours" && selectedPastTour && (
                <PastTourDetailSheet
                  tour={selectedPastTour}
                  allPastTours={pastTours}
                  onBack={() => setSelectedPastTour(null)}
                />
              )}

            </>
          )}
        </div>
      </div>
    </div>
  );
}
