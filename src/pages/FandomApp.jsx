import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import "@/components/fandomapp/fandomApp.css";
import { createPageUrl } from "@/components/utils";
import {
  ChevronLeft, AlertTriangle,
  RefreshCw, Loader2, Users, Swords, Flame,
} from "lucide-react";
import FandomOverview from "@/components/fandomapp/FandomOverview";
import WarRoom from "@/components/fandomapp/WarRoom";
import DramaCenter from "@/components/fandomapp/DramaCenter";
import RebrandModal from "@/components/fandomapp/RebrandModal";

// ─── tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { key: "fandom", label: "Fandom", icon: Users },
  { key: "wars",   label: "Wars",   icon: Swords },
  { key: "drama",  label: "Drama",  icon: Flame },
];

function sortWarsForDisplay(wars = []) {
  return [...wars].sort((left, right) => {
    const leftResolved = left.status === "resolved";
    const rightResolved = right.status === "resolved";

    if (leftResolved !== rightResolved) {
      return leftResolved ? 1 : -1;
    }

    if (leftResolved && rightResolved) {
      return (Number(right.resolved_turn) || 0) - (Number(left.resolved_turn) || 0);
    }

    return (Number(right.intensity) || 0) - (Number(left.intensity) || 0);
  });
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function FandomApp() {
  const navigate = useNavigate();
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [respondingId, setRespondingId]     = useState(null);
  const [interveningWarId, setInterveningWarId] = useState(null);
  const [interveningActionId, setInterveningActionId] = useState(null);
  const [ritualLoadingKey, setRitualLoadingKey] = useState(null);
  const [profile, setProfile]               = useState(null);
  const [fandom, setFandom]                 = useState(null);
  const [fanProfile, setFanProfile]         = useState(null);
  const [canonicalSignals, setCanonicalSignals] = useState(null);
  const [segments, setSegments]             = useState([]);
  const [wars, setWars]                     = useState([]);
  const [controversies, setControversies]   = useState([]);
  const [rituals, setRituals]               = useState([]);
  const [availableInterventions, setAvailableInterventions] = useState([]);
  const [selectedRitualSegments, setSelectedRitualSegments] = useState({});
  const [showRebrand, setShowRebrand]       = useState(false);
  const [activeTab, setActiveTab]           = useState("fandom");
  const [error, setError]                   = useState(null);
  const [successMsg, setSuccessMsg]         = useState(null);

  const playerId = localStorage.getItem("user_account_id");

  const load = useCallback(async () => {
    if (!playerId) { navigate(createPageUrl("Auth")); return; }
    setLoading(true);
    setError(null);
    try {
      const profiles = await base44.entities.ArtistProfile.filter({ id: playerId });
      const prof = profiles[0] || null;
      setProfile(prof);
      if (!prof) { setLoading(false); return; }

      const statusResult = await invokeEdgeFunction("fandomActions", {
        subAction: "status",
        artistId: prof.id,
      });

      if (statusResult?.success && statusResult?.data) {
        const { fandom, fanProfile, canonicalSignals, segments, controversies, wars, rituals, availableInterventions } = statusResult.data;
        setFandom(fandom || null);
        setFanProfile(fanProfile || null);
        setCanonicalSignals(canonicalSignals || null);
        setSegments(segments || []);
        setControversies((controversies || []).sort(
          (a, b) => (b.public_attention || 0) - (a.public_attention || 0)
        ));
        setWars(sortWarsForDisplay(wars || []));
        setRituals(rituals || []);
        setAvailableInterventions(availableInterventions || []);
        setSelectedRitualSegments((prev) => {
          const next = { ...prev };
          (rituals || []).forEach((ritual) => {
            if (ritual.segmentSelector && !next[ritual.key]) next[ritual.key] = "stan";
          });
          return next;
        });
      } else {
        console.warn('[FandomApp] Edge function failed, using fallback queries. Error:', statusResult?.error);
        const [fandoms, segRows, warRows, contRows] = await Promise.all([
          base44.entities.Fandom.filter({ player_id: playerId }),
          base44.entities.FandomSegment.filter({ player_id: playerId }),
          base44.entities.FanWar.filter({ artist_id: playerId }),
          base44.entities.ControversyCase.filter({ player_id: playerId }),
        ]);
        setFandom(fandoms[0] || null);
        const fanProfiles = await base44.entities.FanProfile.filter({ artist_id: playerId });
        setFanProfile(fanProfiles[0] || null);
        setCanonicalSignals(null);
        setSegments(segRows || []);
        setWars(sortWarsForDisplay(warRows || []));
        setControversies((contRows || []).filter(c => c.phase !== "resolved").sort((a, b) => (b.public_attention || 0) - (a.public_attention || 0)));
        setRituals([]);
        setAvailableInterventions([]);
      }
    } catch {
      setError("Failed to load fandom data.");
    } finally {
      setLoading(false);
    }
  }, [playerId, navigate]);

  useEffect(() => { load(); }, [load]);

  // ── rebrand (costs $2,000, OGs lose loyalty, alignment resets) ─────────────
  const handleRebrand = async ({ nickname, identityPillars }) => {
    setSaving(true);
    try {
      // Save pillars first, then name if changed
      const pillarResult = await invokeEdgeFunction("fandomActions", {
        subAction: "setIdentityPillars",
        artistId: profile?.id,
        identityPillars,
      });
      if (!pillarResult?.success) {
        setError(pillarResult?.error || "Failed to save pillars.");
        setSaving(false);
        return;
      }

      if (nickname !== (fandom?.fanbase_name || "")) {
        const nameResult = await invokeEdgeFunction("fandomActions", {
          subAction: "setNickname",
          artistId: profile?.id,
          nickname,
        });
        if (!nameResult?.success) {
          setError(nameResult?.error || "Failed to save fanbase name.");
          setSaving(false);
          return;
        }
      }

      setFandom(prev => ({
        ...(prev || {}),
        fanbase_name: nickname,
        identity_pillars: identityPillars,
      }));
      setShowRebrand(false);
      setSuccessMsg("Rebrand complete — your fandom is evolving.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      setError("Rebrand failed.");
    } finally {
      setSaving(false);
    }
  };

  // ── respond to controversy ───────────────────────────────────────────────────
  const respondToControversy = async (controversyId, responseTaken) => {
    setRespondingId(controversyId);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "respond_controversy",
        artistId: profile?.id,
        controversyId,
        responseTaken,
      });
      if (result?.success) {
        setControversies(prev =>
          prev.map(c => c.id === controversyId ? { ...c, response_taken: responseTaken } : c)
        );
      } else {
        setError(result?.error || "Failed to respond.");
      }
    } catch {
      setError("Failed to respond to controversy.");
    } finally {
      setRespondingId(null);
    }
  };

  // ── derived data for tab badges ───────────────────────────────────────────
  const activeWarCount = wars.filter(w => ["active", "escalated", "cooling"].includes(w.status)).length;
  const activeControCount = controversies.filter(c => c.phase !== "resolved").length;
  const dramaRituals = rituals.filter(
    (ritual) => ['apology_tour', 'receipts_drop'].includes(ritual.key)
  );

  const handleRitualGo = async (ritual) => {
    const payload = { subAction: ritual.key, artistId: profile?.id };
    if (ritual.segmentSelector) {
      payload.segmentType = selectedRitualSegments[ritual.key] || "stan";
    }
    setRitualLoadingKey(ritual.key);
    try {
      const result = await invokeEdgeFunction("fandomActions", payload);
      if (result?.success) {
        await load();
        setError(null);
        setSuccessMsg(result?.flavorText || `${ritual.name} activated!`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(result?.error || `Failed to activate ${ritual.name}.`);
      }
    } catch {
      setError(`Failed to activate ${ritual.name}.`);
    } finally {
      setRitualLoadingKey(null);
    }
  };

  // ── go dark ──────────────────────────────────────────────────────────────────
  const handleGoDark = async (days) => {
    setSaving(true);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "go_dark",
        artistId: profile?.id,
        days,
      });
      if (result?.success) {
        setFandom(prev => ({
          ...(prev || {}),
          dark_mode_until: result.data?.dark_mode_until ?? prev?.dark_mode_until,
          dark_mode_started: result.data?.dark_mode_started ?? prev?.dark_mode_started,
        }));
        setSuccessMsg(result.data?.flavor || `Going dark for ${days} day${days > 1 ? "s" : ""}…`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(result?.error || "Failed to go dark.");
      }
    } catch {
      setError("Failed to go dark.");
    } finally {
      setSaving(false);
    }
  };

  const handleEndDarkMode = async () => {
    setSaving(true);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "end_dark_mode",
        artistId: profile?.id,
      });
      if (result?.success) {
        setFandom(prev => ({ ...(prev || {}), dark_mode_until: null, dark_mode_started: null }));
        setSuccessMsg("Emerging from the shadows — comeback incoming.");
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(result?.error || "Failed to end dark mode.");
      }
    } catch {
      setError("Failed to end dark mode.");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDirective = async (segmentType, directive) => {
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "set_segment_directive",
        artistId: profile?.id,
        segmentType,
        directive,
      });
      if (result?.success) {
        setSegments(prev =>
          prev.map(s => s.segment_type === segmentType ? { ...s, directive } : s)
        );
      } else {
        setError(result?.error || "Failed to set directive.");
      }
    } catch {
      setError("Failed to set directive.");
    }
  };

  const handleWarIntervention = async (fanWarId, intervention) => {
    setInterveningWarId(fanWarId);
    setInterveningActionId(intervention.id);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "intervene_fan_war",
        artistId: profile?.id,
        fanWarId,
        interventionId: intervention.id,
      });
      if (result?.success) {
        await load();
        setError(null);
        setSuccessMsg(result?.data?.narrative || `${intervention.label} changed the temperature in the room.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(result?.error || `Failed to execute ${intervention.label}.`);
      }
    } catch {
      setError(`Failed to execute ${intervention.label}.`);
    } finally {
      setInterveningWarId(null);
      setInterveningActionId(null);
    }
  };

  // ── loading state ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="fandom-app">
      <div className="fandom-loading">
        <Loader2 size={28} className="fandom-spin" />
        <span>Loading fandom data…</span>
      </div>
    </div>
  );

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fandom-app">
      {/* ── Header ── */}
      <div className="fandom-header">
        <button className="fandom-back-btn" onClick={() => navigate(createPageUrl("Social"))}>
          <ChevronLeft size={18} />
        </button>
        <div className="fandom-header-center">
          <div className="fandom-header-title">Fandom HQ</div>
          {profile?.artist_name && (
            <div className="fandom-header-sub">{profile.artist_name}</div>
          )}
        </div>
        <button className="fandom-refresh-btn" onClick={load}>
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="fandom-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="px-4 py-2 mx-4 mt-2 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-sm">
          {successMsg}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="fandom-tab-bar">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          const badge = tab.key === "wars" ? activeWarCount
                      : tab.key === "drama" ? activeControCount
                      : 0;
          return (
            <button
              key={tab.key}
              className={`fandom-tab-pill ${isActive ? "fandom-tab-pill--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {badge > 0 && (
                <span className="fandom-tab-badge">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="fandom-scroll">
        <AnimatePresence mode="wait">
          {activeTab === "fandom" && (
            <FandomOverview
              key="fandom"
              profile={profile}
              fandom={fandom}
              fanProfile={fanProfile}
              canonicalSignals={canonicalSignals}
              segments={segments}
              wars={wars}
              controversies={controversies}
              rituals={rituals}
              onOpenRebrand={() => setShowRebrand(true)}
              ritualLoadingKey={ritualLoadingKey}
              selectedRitualSegments={selectedRitualSegments}
              setSelectedRitualSegments={setSelectedRitualSegments}
              handleRitualGo={handleRitualGo}
              onGoDark={handleGoDark}
              onEndDarkMode={handleEndDarkMode}
              onSetDirective={handleSetDirective}
              saving={saving}
            />
          )}
          {activeTab === "wars" && (
            <WarRoom
              key="wars"
              wars={wars}
              availableInterventions={availableInterventions}
              onIntervene={handleWarIntervention}
              interveningWarId={interveningWarId}
              interveningActionId={interveningActionId}
            />
          )}
          {activeTab === "drama" && (
            <DramaCenter
              key="drama"
              controversies={controversies}
              wars={wars}
              dramaRituals={dramaRituals}
              toxicity={Number(fandom?.toxicity_score) || 0}
              shadowTicks={fandom?.controversy_shadow_ticks_remaining || 0}
              respondToControversy={respondToControversy}
              respondingId={respondingId}
              ritualLoadingKey={ritualLoadingKey}
              onUseDramaRitual={handleRitualGo}
              onOpenWarRoom={() => setActiveTab("wars")}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Rebrand Modal ── */}
      <AnimatePresence>
        {showRebrand && (
          <RebrandModal
            fandom={fandom}
            profile={profile}
            saving={saving}
            onClose={() => setShowRebrand(false)}
            onRebrand={handleRebrand}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
