import React from "react";
import { motion } from "framer-motion";
import TourPlanningWizard from "@/components/touring/wizard/TourPlanningWizard";
import { fadeUp, dockTransition } from "./worldMapMotion";

// ═══════════════════════════════════════════════════════════════════════════════
// PLANNING PANEL — embedded wizard only
// Stateless — all data comes from WorldMapHome props
// ═══════════════════════════════════════════════════════════════════════════════

export default function PlanningPanel({
  profile,
  routeBuilderDraft,
  routeBuilderSequence,
  sceneDataByRegion,
  onTapRouteRegion,
  onRemoveCityStop,
  onClearRouteBuilder,
  onWizardComplete,
  onWizardCancel,
  onExitPlanningMode,
  onVenueSizeChange,
}) {
  return (
    <motion.div
      layout
      transition={dockTransition}
      className="relative overflow-hidden rounded-[30px]"
      style={{
        background: "linear-gradient(145deg, rgba(8,12,24,0.98), rgba(15,23,42,0.9))",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="px-4 py-3 md:px-5 md:py-4">
        <motion.div {...fadeUp} className="space-y-3">
          {/* Compact header row */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#c4b5fd" }}>
              Tour planner
            </p>
            <button
              type="button"
              onClick={onExitPlanningMode}
              className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#94a3b8" }}
            >
              Close
            </button>
          </div>

          <TourPlanningWizard
            profile={profile}
            routeBuilderDraft={routeBuilderDraft}
            routeBuilderSequence={routeBuilderSequence}
            sceneDataByRegion={sceneDataByRegion}
            onTapRouteRegion={onTapRouteRegion}
            onRemoveCityStop={onRemoveCityStop}
            onClearRouteBuilder={onClearRouteBuilder}
            onWizardComplete={onWizardComplete}
            onWizardCancel={onWizardCancel}
            onVenueSizeChange={onVenueSizeChange}
            embedded
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
