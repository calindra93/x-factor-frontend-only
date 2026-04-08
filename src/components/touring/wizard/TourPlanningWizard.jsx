import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  WIZARD_DEFAULT_PLAN,
  validateWizardStep,
  mapCategoryVenueSizeToTourType,
} from "@/lib/tourWizardModel";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import WizardStepBasics from "./WizardStepBasics";
import WizardStepLogistics from "./WizardStepLogistics";
import WizardStepItinerary from "./WizardStepItinerary";
import WizardStepPartnerships from "./WizardStepPartnerships";
import WizardStepReview from "./WizardStepReview";

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: "Tour Basics" },
  { num: 2, label: "Logistics" },
  { num: 3, label: "Itinerary" },
  { num: 4, label: "Partnerships" },
  { num: 5, label: "Review" },
];

// ─── Wizard Shell ────────────────────────────────────────────────────────────

export default function TourPlanningWizard({
  profile,
  routeBuilderDraft,
  routeBuilderSequence,
  sceneDataByRegion,
  onTapRouteRegion,
  onRemoveCityStop,
  onClearRouteBuilder: _onClearRouteBuilder,
  onWizardComplete,
  onWizardCancel,
  onVenueSizeChange,
  embedded = false,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardPlan, setWizardPlan] = useState(WIZARD_DEFAULT_PLAN);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Notify parent when venue size changes so route builder can filter venues
  useEffect(() => {
    onVenueSizeChange?.(wizardPlan.venueSize || null);
  }, [wizardPlan.venueSize, onVenueSizeChange]);

  // ── Shared data loaded on mount ───────────────────────────────────────────
  const [dataLoading, setDataLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [merch, setMerch] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // ── Lazy-loaded data ──────────────────────────────────────────────────────
  const [crewPool, setCrewPool] = useState([]);
  const [crewMaxSlots, setCrewMaxSlots] = useState(3);
  const [crewLoading, setCrewLoading] = useState(false);
  const [sponsors, setSponsors] = useState([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(false);
  const [openers, setOpeners] = useState([]);
  const [openersLoading, setOpenersLoading] = useState(false);
  const [coHeadliners, setCoHeadliners] = useState([]);
  const [coHeadlinersLoading, setCoHeadlinersLoading] = useState(false);
  const [partnershipsError, setPartnershipsError] = useState(null);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setDataLoading(true);
    setLoadError(null);
    try {
      // Songs + release enrichment
      const songsData = await base44.entities.Song.filter({ artist_id: profile.id });
      const validSongs = Array.isArray(songsData) ? songsData : [];
      const songsWithStreams = await Promise.all(
        validSongs.map(async (song) => {
          let streams = 0;
          let lifecycle_state = song?.lifecycle_state || null;
          let release_status = song?.release_status || null;
          let release_date = song?.release_date || null;
          if (song?.release_id) {
            try {
              const releaseData = await base44.entities.Release.filter({ id: song.release_id });
              if (releaseData?.length > 0) {
                streams = releaseData[0].lifetime_streams || 0;
                lifecycle_state = releaseData[0].lifecycle_state || lifecycle_state;
                release_status = releaseData[0].release_status || release_status;
                release_date = releaseData[0].release_date || release_date;
              }
            } catch { /* non-fatal */ }
          }
          return { ...song, streams, lifetime_streams: streams, lifecycle_state, release_status, release_date };
        })
      );
      setSongs(songsWithStreams);
      if (songsWithStreams.length > 0) {
        setWizardPlan((p) => ({ ...p, selectedSongs: songsWithStreams.slice(0, 10).map((s) => s.id) }));
      }

      // Merch
      const merchData = await base44.entities.Merch.filter({ artist_id: profile.id, status: "Active" });
      setMerch(Array.isArray(merchData) ? merchData : []);

      // Categories
      try {
        const catResult = await invokeEdgeFunction("touring", {
          action: "getCategories",
          artistId: profile.id,
        });
        if (catResult?.data?.categories) setCategories(catResult.data.categories);
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error("[TourPlanningWizard] loadInitialData error:", err);
      setLoadError("Failed to load touring data. Please try again.");
    } finally {
      setDataLoading(false);
    }
  };

  // ── Lazy loaders ──────────────────────────────────────────────────────────

  const loadCrewPool = async () => {
    if (crewPool.length > 0 || crewLoading) return;
    setCrewLoading(true);
    try {
      const result = await invokeEdgeFunction("touring", {
        action: "generateCrewPool",
        artistId: profile.id,
        tourCategoryId: wizardPlan.category?.id || "standard_run",
      });
      if (result?.data?.pool) {
        setCrewPool(result.data.pool);
        setCrewMaxSlots(result.data.maxSlots || 3);
      }
    } catch (e) { console.warn("Failed to load crew pool:", e); }
    setCrewLoading(false);
  };

  const loadSponsors = async () => {
    if (sponsors.length > 0 || sponsorsLoading) return;
    setSponsorsLoading(true);
    setPartnershipsError(null);
    try {
      const result = await invokeEdgeFunction("touring", {
        action: "getSponsors",
        artistId: profile.id,
        tourCategoryId: wizardPlan.category?.id || "standard_run",
      });
      if (!result?.success) {
        setPartnershipsError(result?.error || "Failed to load sponsors.");
        setSponsors([]);
        return;
      }
      if (result?.data?.sponsors) {
        setSponsors(result.data.sponsors);
        setPartnershipsError(null);
      }
    } catch (e) { console.warn("Failed to load sponsors:", e); }
    setSponsorsLoading(false);
  };

  const loadOpeners = async () => {
    if (openersLoading) return;
    setOpenersLoading(true);
    setPartnershipsError(null);
    try {
      const result = await invokeEdgeFunction("touring", {
        action: "getOpeningActCandidates",
        artistId: profile.id,
        preferredRegions: Array.isArray(routeBuilderSequence) ? routeBuilderSequence : [],
      });
      if (!result?.success) {
        setPartnershipsError(result?.error || "Failed to load opening acts.");
        setOpeners([]);
        return;
      }
      setOpeners(Array.isArray(result?.data?.candidates) ? result.data.candidates : []);
      setPartnershipsError(null);
    } catch (e) { console.warn("Failed to load openers:", e); }
    setOpenersLoading(false);
  };

  const loadCoHeadliners = async () => {
    if (coHeadlinersLoading) return;
    setCoHeadlinersLoading(true);
    setPartnershipsError(null);
    try {
      const result = await invokeEdgeFunction("touring", {
        action: "getCoHeadlinerCandidates",
        artistId: profile.id,
        preferredRegions: Array.isArray(routeBuilderSequence) ? routeBuilderSequence : [],
      });
      if (!result?.success) {
        setPartnershipsError(result?.error || "Failed to load co-headliners.");
        setCoHeadliners([]);
        return;
      }
      setCoHeadliners(Array.isArray(result?.data?.candidates) ? result.data.candidates : []);
      setPartnershipsError(null);
    } catch (e) { console.warn("Failed to load co-headliners:", e); }
    setCoHeadlinersLoading(false);
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const validation = validateWizardStep(currentStep, wizardPlan, profile, routeBuilderDraft);

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const goToStep = (step) => {
    if (step >= 1 && step <= 5) setCurrentStep(step);
  };

  // ── Submit / Launch ───────────────────────────────────────────────────────

  const handleLaunch = async () => {
    const finalValidation = validateWizardStep(5, wizardPlan, profile, routeBuilderDraft);
    if (!finalValidation.valid) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const tourTypeKey = mapCategoryVenueSizeToTourType(wizardPlan.category?.id, wizardPlan.venueSize);
      const payload = {
        action: "createTour",
        artistId: profile.id,
        routeId: tourTypeKey,
        setlist: wizardPlan.selectedSongs,
        strategy: wizardPlan.strategy,
        customTourName: wizardPlan.tourName.trim(),
        selectedMerch: wizardPlan.selectedMerch,
        categoryId: wizardPlan.category?.id || null,
        tourMode: wizardPlan.tourMode,
        venueSize: wizardPlan.venueSize,
        transportTier: wizardPlan.transportTier,
        ticketTiers: wizardPlan.ticketTiers,
        ticketSellTypes: wizardPlan.ticketSellTypes,
        startDateOffset: wizardPlan.startDateOffset,
        routeBuilderDraft,
        routeBuilderSequence,
        selectedCrew: wizardPlan.crew,
        selectedSponsor: wizardPlan.sponsor,
        coHeadlinerDraft: wizardPlan.coHeadliner
          ? {
              co_headliner_id: wizardPlan.coHeadliner.id,
              candidate_snapshot: {
                artist_name: wizardPlan.coHeadliner.artist_name,
                region: wizardPlan.coHeadliner.region,
                career_stage: wizardPlan.coHeadliner.career_stage,
                followers: wizardPlan.coHeadliner.followers || wizardPlan.coHeadliner.fans || 0,
                genre: wizardPlan.coHeadliner.genre,
              },
            }
          : null,
        openingActDrafts: wizardPlan.openingActs.map((opener) => ({
          opener_id: opener.id,
          revenue_split: opener.revenueSplit,
          candidate_snapshot: {
            artist_name: opener.artist_name,
            region: opener.region,
            career_stage: opener.career_stage,
            followers: opener.followers || opener.fans || 0,
            genre: opener.genre,
          },
        })),
      };

      const result = await invokeEdgeFunction("touring", payload);
      if (!result.success) {
        setSubmitError(result.error || "Failed to launch tour");
        setSubmitting(false);
        return;
      }
      onWizardComplete?.();
    } catch (err) {
      console.error("[TourPlanningWizard] handleLaunch error:", err);
      setSubmitError(err.message || "Failed to launch tour");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Header — hidden when embedded (PlanningPanel already has its own header) */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <button
            onClick={onWizardCancel}
            className="flex items-center gap-1.5 text-xs font-medium transition"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <ChevronLeft className="w-4 h-4" />
            Cancel
          </button>
          <h2 className="text-sm font-black text-white uppercase tracking-widest">
            Tour Wizard
          </h2>
          <div className="w-14" />
        </div>
      )}

      {/* Step indicator */}
      <div
        className="flex gap-0.5 border-b pb-1.5"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {STEPS.map((step) => {
          const isActive = currentStep === step.num;
          return (
            <button
              key={step.num}
              onClick={() => goToStep(step.num)}
              className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all"
              style={{
                borderBottom: isActive ? "2px solid #c084fc" : "2px solid transparent",
                color: isActive ? "#ffffff" : "#6b7280",
              }}
            >
              {embedded ? step.num : step.label}
            </button>
          );
        })}
      </div>

      {/* Load error */}
      {loadError && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-[11px]" style={{ color: "#fca5a5" }}>{loadError}</p>
          <button onClick={loadInitialData} className="ml-auto text-[11px] font-black" style={{ color: "#f87171" }}>Retry</button>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-[11px]" style={{ color: "#fca5a5" }}>{submitError}</p>
        </div>
      )}

      {/* Loading spinner */}
      {dataLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          <span className="ml-2 text-xs text-white/40">Loading...</span>
        </div>
      )}

      {/* Step content — scrollable constrained area */}
      <div className="max-h-[400px] overflow-y-auto overscroll-contain">
      {!dataLoading && currentStep === 1 && (
        <WizardStepBasics
          wizardPlan={wizardPlan}
          setWizardPlan={setWizardPlan}
          profile={profile}
          songs={songs}
          categories={categories}
          routeBuilderDraft={routeBuilderDraft}
        />
      )}
      {!dataLoading && currentStep === 2 && (
        <WizardStepLogistics
          wizardPlan={wizardPlan}
          setWizardPlan={setWizardPlan}
          profile={profile}
          songs={songs}
          merch={merch}
          routeBuilderDraft={routeBuilderDraft}
          crewPool={crewPool}
          crewMaxSlots={crewMaxSlots}
          crewLoading={crewLoading}
          onLoadCrew={loadCrewPool}
        />
      )}
      {!dataLoading && currentStep === 3 && (
        <WizardStepItinerary
          wizardPlan={wizardPlan}
          setWizardPlan={setWizardPlan}
          routeBuilderDraft={routeBuilderDraft}
          routeBuilderSequence={routeBuilderSequence}
          sceneDataByRegion={sceneDataByRegion}
          onRemoveCityStop={onRemoveCityStop}
          onTapRouteRegion={onTapRouteRegion}
        />
      )}
      {!dataLoading && currentStep === 4 && (
        <WizardStepPartnerships
          wizardPlan={wizardPlan}
          setWizardPlan={setWizardPlan}
          profile={profile}
          routeBuilderSequence={routeBuilderSequence}
          partnershipsError={partnershipsError}
          coHeadliners={coHeadliners}
          coHeadlinersLoading={coHeadlinersLoading}
          onLoadCoHeadliners={loadCoHeadliners}
          sponsors={sponsors}
          sponsorsLoading={sponsorsLoading}
          onLoadSponsors={loadSponsors}
          openers={openers}
          openersLoading={openersLoading}
          onLoadOpeners={loadOpeners}
        />
      )}
      {!dataLoading && currentStep === 5 && (
        <WizardStepReview
          wizardPlan={wizardPlan}
          setWizardPlan={setWizardPlan}
          profile={profile}
          routeBuilderDraft={routeBuilderDraft}
          routeBuilderSequence={routeBuilderSequence}
          categories={categories}
          onLaunch={handleLaunch}
          submitting={submitting}
          canLaunch={validation.valid}
          onGoToStep={goToStep}
        />
      )}
      </div>

      {/* Validation blockers */}
      {!dataLoading && !validation.valid && validation.blockers.length > 0 && (
        <div className="space-y-1">
          {validation.blockers.map((b, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px]"
              style={{ background: "rgba(251,191,36,0.06)", color: "#fbbf24" }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{b.message}</span>
              {b.tab !== currentStep && (
                <button
                  onClick={() => goToStep(b.tab)}
                  className="ml-auto text-[10px] font-black uppercase tracking-widest underline"
                >
                  Go to step {b.tab}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Navigation buttons */}
      {!dataLoading && (
        <div className="flex items-center gap-2 pt-1">
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <ChevronLeft className="w-3 h-3" />
              Back
            </button>
          )}

          <div className="flex-1" />

          {currentStep < 5 ? (
            <button
              onClick={handleNext}
              disabled={!validation.valid}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
              style={{
                background: validation.valid
                  ? "rgba(192,132,252,0.18)"
                  : "rgba(255,255,255,0.05)",
                color: "#ffffff",
                border: validation.valid ? "1px solid rgba(192,132,252,0.28)" : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={submitting || !validation.valid}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
              style={{
                background: validation.valid ? "rgba(192,132,252,0.18)" : "rgba(255,255,255,0.05)",
                color: "#ffffff",
                border: validation.valid ? "1px solid rgba(192,132,252,0.28)" : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Launching...
                </>
              ) : (
                "Launch Tour"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
