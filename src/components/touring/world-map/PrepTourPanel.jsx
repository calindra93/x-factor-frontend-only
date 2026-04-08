import React from "react";
import {
  Calendar,
  ChevronRight,
  Flag,
  Megaphone,
  Route,
  ShieldCheck,
  Siren,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { fadeUp } from "./worldMapMotion";

const PREP_ACTION_META = {
  route_check: {
    label: "Route check",
    description: "Lock transport and routing before departure.",
    icon: Route,
    accent: "#60a5fa",
  },
  promo_push: {
    label: "Promo push",
    description: "Raise opening-stop awareness and turnout.",
    icon: Megaphone,
    accent: "#f472b6",
  },
  rehearse_set: {
    label: "Rehearse set",
    description: "Tighten the opening-show package.",
    icon: Sparkles,
    accent: "#c084fc",
  },
  crew_sync: {
    label: "Crew sync",
    description: "Steady execution and team coordination.",
    icon: ShieldCheck,
    accent: "#34d399",
  },
  recovery_day: {
    label: "Recovery day",
    description: "Reduce launch fatigue before the first leg.",
    icon: Calendar,
    accent: "#fbbf24",
  },
};

function ReadinessStrip({ label, value, color }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#94a3b8" }}>
          {label}
        </p>
        <p className="text-[11px] font-black" style={{ color }}>
          {value}
        </p>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export default function PrepTourPanel({
  activeTour,
  phaseModel,
  nextStop,
  runningPrepActionId = null,
  onRunPrepAction,
  onLaunchNow,
}) {
  const readiness = Array.isArray(phaseModel?.readiness) ? phaseModel.readiness : [];
  const launchRisk = phaseModel?.launchRisk || { level: "low", notes: [] };
  const prepActionsTaken = Array.isArray(activeTour?.state?.prep_actions_taken) ? activeTour.state.prep_actions_taken : [];
  const prepActionIds = Object.keys(PREP_ACTION_META);
  const launchRunning = runningPrepActionId === "launch";

  return (
    <motion.div
      {...fadeUp}
      className="relative overflow-hidden rounded-[30px]"
      style={{
        background: "linear-gradient(145deg, rgba(8,12,24,0.98), rgba(15,23,42,0.9))",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="space-y-5 px-4 py-4 md:px-5 md:py-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#c4b5fd" }}>
                Pre-tour staging
              </p>
              <h2 className="mt-2 truncate text-[20px] font-black leading-none text-white">
                {activeTour?.tour_name || activeTour?.name || "Staged route"}
              </h2>
            </div>
            <div
              className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em]"
              style={{
                background: "rgba(196,181,253,0.12)",
                border: "1px solid rgba(196,181,253,0.2)",
                color: "#ddd6fe",
              }}
            >
              Departs in {phaseModel?.countdownTurnsRemaining || 0}
            </div>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "#94a3b8" }}>
            {nextStop?.cityName
              ? `Staged route into ${nextStop.cityName}. Use prep slots to stabilize logistics, promo, and show readiness before launch.`
              : "Your route is staged and waiting for departure. Use prep slots to improve opening-leg execution."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[22px] px-3 py-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
              Prep slots
            </p>
            <p className="mt-1 text-lg font-black text-white">
              {phaseModel?.slotsRemaining || 0}
            </p>
          </div>
          <div className="rounded-[22px] px-3 py-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
              Used
            </p>
            <p className="mt-1 text-lg font-black text-white">
              {phaseModel?.prepSlotsUsed || 0}
            </p>
          </div>
          <div className="rounded-[22px] px-3 py-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
              Risk
            </p>
            <p className="mt-1 text-lg font-black capitalize" style={{ color: launchRisk.level === "high" ? "#fda4af" : launchRisk.level === "moderate" ? "#fcd34d" : "#86efac" }}>
              {launchRisk.level}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-[24px] px-4 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4" style={{ color: "#60a5fa" }} />
            <p className="text-[12px] font-black text-white">Readiness tracks</p>
          </div>
          <div className="space-y-3">
            {readiness.map((item) => (
              <ReadinessStrip
                key={item.id}
                label={item.label}
                value={item.value}
                color={item.id === "logistics" ? "#60a5fa" : item.id === "promo" ? "#f472b6" : "#c084fc"}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-black text-white">Prep actions</p>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
              {prepActionsTaken.length} logged
            </p>
          </div>
          <div className="space-y-2">
            {prepActionIds.map((actionId) => {
              const meta = PREP_ACTION_META[actionId];
              const Icon = meta.icon;
              const running = runningPrepActionId === actionId;
              return (
                <button
                  key={actionId}
                  type="button"
                  onClick={() => onRunPrepAction?.(actionId)}
                  disabled={running || !onRunPrepAction}
                  className="group flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition-all"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    opacity: running ? 0.7 : 1,
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${meta.accent}18`, border: `1px solid ${meta.accent}33` }}>
                    <Icon className="h-4 w-4" style={{ color: meta.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white">{meta.label}</p>
                    <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>
                      {meta.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: running ? "#9ca3af" : "#4b5563" }} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] px-4 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl p-2" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.18)" }}>
              <Siren className="h-4 w-4" style={{ color: "#f87171" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#fca5a5" }}>
                Launch risk preview
              </p>
              <div className="mt-2 space-y-1.5">
                {launchRisk.notes?.length ? launchRisk.notes.map((note) => (
                  <p key={note} className="text-[11px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                    {note}
                  </p>
                )) : (
                  <p className="text-[11px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                    Launch posture looks stable for the opening leg.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[24px] px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
              Manual launch
            </p>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#cbd5e1" }}>
              Launch early if you want, but any missing readiness carries into the opening leg.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLaunchNow?.()}
            disabled={!onLaunchNow || launchRunning || Boolean(runningPrepActionId)}
            className="rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #db2777)", boxShadow: "0 10px 30px rgba(124,58,237,0.3)", opacity: launchRunning ? 0.7 : 1 }}
          >
            Launch now
          </button>
        </div>
      </div>
    </motion.div>
  );
}
