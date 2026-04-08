import React, { useState, useCallback } from "react";
import { Music, Plus, ChevronRight, Swords, TrendingUp, MapPin } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import ActiveTourCard from "./ActiveTourCard";
import PastToursPanel from "./PastToursPanel";

export default function ToursHub({
  activeTour = null,
  pastTours = [],
  profile = null,
  onStartPlanning,
  onGoToWorldMap,
  onOpenPastTourDetail,
  onOpenActiveTourSurface,
}) {
  const [subView, setSubView] = useState("active");
  const [rivals, setRivals] = useState(null);
  const [rivalsLoading, setRivalsLoading] = useState(false);

  const loadRivals = useCallback(async () => {
    if (!profile?.id || rivalsLoading) return;
    setRivalsLoading(true);
    try {
      const myRegions = [
        activeTour?.region,
        ...pastTours.slice(0, 3).map((t) => t.region),
      ].filter(Boolean);
      const result = await invokeEdgeFunction("touring", {
        action: "getRivalTours",
        artistId: profile.id,
        regions: [...new Set(myRegions)],
      });
      setRivals(Array.isArray(result?.data?.rivals) ? result.data.rivals : []);
    } catch { setRivals([]); }
    setRivalsLoading(false);
  }, [profile?.id, activeTour?.region, rivalsLoading]);

  const handleSubView = (id) => {
    setSubView(id);
    if (id === "rivals" && rivals === null) loadRivals();
  };

  return (
    <div className="space-y-5">
      {/* Sub-nav */}
      <div className="flex gap-2">
        {[
          { id: "active", label: "Active" },
          { id: "past", label: "Past" },
          { id: "rivals", label: "Rivals" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => handleSubView(v.id)}
            className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            style={{
              background: subView === v.id ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
              color: subView === v.id ? "#c4b5fd" : "#9ca3af",
              border: `1px solid ${subView === v.id ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)"}`,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {subView === "active" && (
        <>
          {activeTour ? (
            <div className="space-y-2">
              <ActiveTourCard tour={activeTour} />
              {onOpenActiveTourSurface && (
                <button
                  onClick={onOpenActiveTourSurface}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black transition-all"
                  style={{
                    background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(219,39,119,0.1))",
                    border: "1px solid rgba(139,92,246,0.3)",
                    color: "#c4b5fd",
                  }}
                >
                  Open Live Tour Surface
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div
              className="rounded-3xl p-6 text-center"
              style={{
                background: "linear-gradient(145deg, rgba(139,92,246,0.1), rgba(244,114,182,0.05))",
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              <div className="w-16 h-16 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Music className="w-8 h-8 text-violet-400" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">No Active Tour</h3>
              <p className="text-gray-400 text-sm mb-4">
                Launch a new tour to expand your fanbase and generate revenue.
              </p>
              {onStartPlanning && (
                <button
                  onClick={onStartPlanning}
                  className="px-6 py-3 rounded-xl font-black text-white text-sm"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #db2777)" }}
                >
                  Open Tour Planner
                </button>
              )}
            </div>
          )}

          {/* Launchpad */}
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-widest mb-3"
              style={{ color: "#6b7280" }}
            >
              Launchpad
            </p>
            <div className="space-y-2">
              <button
                onClick={onStartPlanning}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer text-left"
                style={{
                  background: "rgba(139,92,246,0.1)",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                <span className="text-lg">🗓</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">Open Tour Planner</p>
                  <p className="text-[10px]" style={{ color: "#9ca3af" }}>
                    Build your route from the world map planner
                  </p>
                </div>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(139,92,246,0.3)" }}
                >
                  <Plus className="w-4 h-4 text-purple-300" />
                </div>
              </button>

              <button
                onClick={onGoToWorldMap}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer text-left"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span className="text-lg">📊</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">Market Snapshot</p>
                  <p className="text-[10px]" style={{ color: "#9ca3af" }}>
                    See where demand is peaking
                  </p>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: "#6b7280" }} />
              </button>
            </div>
          </div>
        </>
      )}

      {subView === "past" && (
        <PastToursPanel
          pastTours={pastTours}
          onOpenDetail={onOpenPastTourDetail}
        />
      )}

      {subView === "rivals" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#6b7280" }}>Active Rival Tours</p>
            <button
              onClick={loadRivals}
              className="text-[10px] font-bold transition"
              style={{ color: "#a78bfa" }}
            >
              Refresh
            </button>
          </div>

          {rivalsLoading && (
            <div className="py-10 text-center text-xs" style={{ color: "#6b7280" }}>Scouting the field…</div>
          )}

          {!rivalsLoading && rivals !== null && rivals.length === 0 && (
            <div
              className="rounded-3xl p-6 text-center"
              style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}
            >
              <Swords className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: "#a78bfa" }} />
              <p className="text-sm font-bold text-white mb-1">No active rivals in your regions</p>
              <p className="text-xs" style={{ color: "#6b7280" }}>Other artists aren't touring your territories yet.</p>
            </div>
          )}

          {!rivalsLoading && rivals !== null && rivals.length > 0 && rivals.map((rival) => (
            <div
              key={rival.id}
              className="rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{rival.artist_name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>{rival.tour_name || "Untitled Tour"}</p>
                </div>
                <div
                  className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide"
                  style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
                >
                  ACTIVE
                </div>
              </div>
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "#6b7280" }}>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{rival.region || "—"}
                </span>
                {rival.fans_gained > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />+{rival.fans_gained.toLocaleString()} fans
                  </span>
                )}
              </div>
            </div>
          ))}

          {rivals === null && !rivalsLoading && (
            <div className="py-10 text-center">
              <button
                onClick={loadRivals}
                className="px-5 py-2.5 rounded-2xl text-sm font-black"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
              >
                Scout Rival Tours
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
