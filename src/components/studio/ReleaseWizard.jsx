import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Rocket, Package, CheckCircle, X, Lock, TrendingUp, Zap, AlertTriangle, Flame, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { showToast } from "@/components/ui/toast-provider";
import { reportError } from "@/lib/errorReporting";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { getArtworkUrl } from "./projectArtwork";

const MERCH_COSTS = {
  CD: 2,
  Vinyl: 8,
  Mixtape: 1
};

// ─── RELEASE COST & COOLDOWN CONFIG ──────────────────────────────────────
// Energy cost to release (prevents mass releasing without resource management)
const RELEASE_ENERGY_COST_SINGLE = 10;
const RELEASE_ENERGY_COST_PROJECT = 20;
// Max releases per turn (enforced client-side; turn engine is ultimate authority)
const MAX_RELEASES_PER_TURN = 3;

const REGION_FLAVOR = {
  home: { label: "Core fanbase", desc: "Strong early response" },
  familiar: { label: "Some awareness", desc: "Needs momentum to grow" },
  new: { label: "Low recognition", desc: "Breakout potential" }
};

const REGION_COLORS = {
  "United States": "#3b82f6",
  "UK": "#ec4899",
  "Europe": "#8b5cf6",
  "Canada": "#ef4444",
  "Asia": "#f59e0b",
  "Latin America": "#10b981",
  "Africa": "#f97316",
  "Oceania": "#06b6d4",
};

const ALL_RELEASE_REGIONS = ["Canada", "United States", "Latin America", "Africa", "Europe", "UK", "Oceania", "Asia"];

const MERCH_PROJECT_TYPES = ["EP", "Album", "Deluxe", "Mixtape"];

export default function ReleaseWizard({ project, song, profile, songs, onClose, onComplete, onArtworkUpdated }) {
  const projectType = project?.type || project?.project_type || "Project";
  const isSingle = !!song;
  const _releaseItemRaw = song || project;
  const releaseItem = _releaseItemRaw ? {
    ..._releaseItemRaw,
    cover_artwork_url: getArtworkUrl(_releaseItemRaw) || null,
  } : null;
  const [step, setStep] = useState(1);
  const [currentTurnId, setCurrentTurnId] = useState(0);
  const [releaseData, setReleaseData] = useState({
    timing: "now",
    scheduledTurns: 1,
    platforms: [],
    regions: [profile.region],
    merch: []
  });
  const [platforms, setPlatforms] = useState([]);
  const [fanProfile, setFanProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeEra, setActiveEra] = useState(null);
  const [eraDecision, setEraDecision] = useState("continue");
  const [newEraName, setNewEraName] = useState("");
  const [isDissTrack, setIsDissTrack] = useState(false);
  const [dissTarget, setDissTarget] = useState(null);
  const [rivalArtists, setRivalArtists] = useState([]);
  const submitLockRef = useRef(false);
  const coverInputRef = useRef(null);
  const [coverOverride, setCoverOverride] = useState(null);

  useEffect(() => {
    loadPlatforms();
  }, []);

  const [currentTurnStartTime, setCurrentTurnStartTime] = useState(null);

  useEffect(() => {
    const loadTurnState = async () => {
      try {
        const turnStates = await base44.entities.TurnState.list("-updated_date", 1);
        if (turnStates.length > 0) {
          const turnId = turnStates[0].global_turn_id ?? turnStates[0].current_turn_id ?? 0;
          setCurrentTurnId(turnId);
          
          // Get turn start time from player_turn_history
          if (turnId > 0 && profile?.id) {
            const turnHistory = await base44.entities.PlayerTurnHistory.filter({ 
              player_id: profile.id,
              id: turnId 
            });
            if (turnHistory.length > 0) {
              setCurrentTurnStartTime(new Date(turnHistory[0].created_at));
            }
          }
        } else {
          setCurrentTurnId(0);
        }
      } catch (error) {
        console.error("[ReleaseWizard] Failed to load turn state", error);
        setCurrentTurnId(0);
      }
    };

    loadTurnState();
  }, [profile?.id]);


  useEffect(() => {
    const loadRivals = async () => {
      try {
        const allArtists = await base44.entities.ArtistProfile.filter();
        const rivals = (allArtists || []).filter(a => a.id !== profile?.id && a.artist_name);
        setRivalArtists(rivals);
      } catch (e) { console.error('[ReleaseWizard] Failed to load rivals:', e); }
    };
    if (profile?.id) loadRivals();
  }, [profile?.id]);

  useEffect(() => {
    const loadActiveEra = async () => {
      try {
        const [era] = await base44.entities.Era.filter({ artist_id: profile.id, is_active: true }, "-created_date", 1);
        setActiveEra(era || null);
      } catch (error) {
        console.error("[ReleaseWizard] Failed to load active era", error);
        setActiveEra(null);
      }
    };

    if (profile?.id) loadActiveEra();
  }, [profile?.id]);

  useEffect(() => {
    const loadFanProfile = async () => {
      try {
        const fanProfiles = await base44.entities.FanProfile.filter({ artist_id: profile?.id });
        setFanProfile(fanProfiles?.[0] || null);
      } catch (error) {
        console.error("[ReleaseWizard] Failed to load fan profile", error);
        setFanProfile(null);
      }
    };

    if (profile?.id) loadFanProfile();
  }, [profile?.id]);

  const loadPlatforms = async () => {
    const allPlatforms = await base44.entities.Platform.list();
    setPlatforms(allPlatforms);
    // Auto-select default unlocked platform
    const defaultPlatform = allPlatforms.find(p => p.is_unlocked_default);
    if (defaultPlatform) {
      setReleaseData(prev => ({ ...prev, platforms: [defaultPlatform.id] }));
    }
  };

  const togglePlatform = (platformId) => {
    setReleaseData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platformId)
        ? prev.platforms.filter(id => id !== platformId)
        : [...prev.platforms, platformId]
    }));
  };

  const normalizePercent = (value) => {
    const n = Number(value || 0);
    if (n <= 1) return Math.round(n * 1000) / 10;
    return Math.round(n * 10) / 10;
  };

  const fanRegionEntries = React.useMemo(() => {
    const totalListeners = Number(fanProfile?.monthly_listeners || 0);
    const topRegions = Array.isArray(fanProfile?.top_regions) ? fanProfile.top_regions : [];
    if (topRegions.length > 0) {
      return topRegions.map((region) => ({
        region: region?.region || region?.name || region?.market || "Unknown",
        percentage: normalizePercent(region?.percentage || region?.pct || 0),
        listeners: Number(region?.listeners || 0),
      }));
    }

    const regionShare = fanProfile?.region_share;
    if (Array.isArray(regionShare)) {
      return regionShare.map((region) => ({
        region: region?.region || region?.name || "Unknown",
        percentage: normalizePercent(region?.percentage || region?.pct || 0),
        listeners: Number(region?.listeners || 0),
      }));
    }

    return Object.entries(regionShare || {}).map(([region, share]) => ({
      region,
      percentage: normalizePercent(share),
      listeners: totalListeners > 0 ? Math.round(totalListeners * (normalizePercent(share) / 100)) : 0,
    }));
  }, [fanProfile]);

  const fanRegionMap = React.useMemo(() => {
    return new Map(fanRegionEntries.map((entry) => [entry.region, entry]));
  }, [fanRegionEntries]);

  const showMerchStep = !isSingle && MERCH_PROJECT_TYPES.includes(projectType);
  const totalSteps = showMerchStep ? 5 : 4;

  const addMerch = () => {
    setReleaseData(prev => ({
      ...prev,
      merch: [...prev.merch, { type: "CD", quantity: 100, price: 15, cover_artwork_url: releaseItem?.cover_artwork_url || "" }]
    }));
  };

  const updateMerch = (index, field, value) => {
    setReleaseData(prev => ({
      ...prev,
      merch: prev.merch.map((m, i) => i === index ? { ...m, [field]: value } : m)
    }));
  };

  const removeMerch = (index) => {
    setReleaseData(prev => ({
      ...prev,
      merch: prev.merch.filter((_, i) => i !== index)
    }));
  };

  const calculateTotalMerchCost = () => {
    return releaseData.merch.reduce((sum, m) => {
      return sum + (m.quantity * MERCH_COSTS[m.type]);
    }, 0);
  };

  const calculateAnticipation = () => {
    if (releaseData.timing === "now" || releaseData.timing === "surprise") return 0;
    // Fixed 25% bonus for all scheduled releases
    return 25;
  };

  const calculateReleaseBoost = (includeAnticipation = false) => {
    const anticipationBonus = includeAnticipation ? calculateAnticipation() : 0;
    const baseFans = 10;
    const baseClout = 5;
    const baseHype = 10;
    
    return {
      fans: Math.floor(baseFans * (1 + anticipationBonus / 100)),
      clout: Math.floor(baseClout * (1 + anticipationBonus / 100)),
      hype: Math.floor(baseHype * (1 + anticipationBonus / 100))
    };
  };

  const handleSwitchEra = async () => {
    if (!activeEra || !newEraName.trim()) return activeEra;

    await base44.entities.Era.update(activeEra.id, {
      is_active: false,
      end_turn: currentTurnId
    });

    const createdEra = await base44.entities.Era.create({
      artist_id: profile.id,
      era_name: newEraName.trim(),
      trigger_event: "manual",
      phase: "TEASE",
      start_turn: currentTurnId,
      is_active: true,
      momentum: 15,
      tension: 10
    });

    setActiveEra(createdEra);
    return createdEra;
  };

  const handleCoverOverride = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "warning");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "warning");
      return;
    }
    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket: "uploads" });
      setCoverOverride(result.file_url);

      if (!isSingle && project?.id) {
        await base44.entities.Project.update(project.id, { cover_artwork_url: result.file_url });

        const projectTracklist = Array.isArray(project.tracklist) ? project.tracklist : [];
        if (projectTracklist.length > 0) {
          await Promise.all(
            projectTracklist.map((songId) =>
              base44.entities.Song.update(songId, { cover_artwork_url: result.file_url })
            )
          );
        }

        await onArtworkUpdated?.(project.id, result.file_url);
      }

      showToast("Cover art updated!", "success");
    } catch (err) {
      console.error("[ReleaseWizard] Cover upload failed:", err);
      showToast("Failed to upload cover art", "error");
    }
  };

  const handleConfirmRelease = async () => {
    if (submitLockRef.current || loading) return;
    submitLockRef.current = true;
    setLoading(true);

    try {
      // ── MASS RELEASE PREVENTION ──────────────────────────────────────
      // 1) Energy cost guard
      const releaseCost = isSingle ? RELEASE_ENERGY_COST_SINGLE : RELEASE_ENERGY_COST_PROJECT;
      if ((profile?.energy || 0) < releaseCost) {
        showToast(`Not enough energy to release. Need ${releaseCost}, have ${profile?.energy || 0}.`, "error");
        return;
      }

      // 2) Per-turn release limit (count releases created in current turn)
      try {
        const existingReleases = await base44.entities.Release.filter({ artist_id: profile.id });
        
        // Count releases created during this turn window (not all scheduled_turn=0 from history)
        const releasesThisTurn = (existingReleases || []).filter(r => {
          // If we have turn start time, use it to filter by creation time
          if (currentTurnStartTime) {
            const releaseCreatedAt = new Date(r.created_at);
            return releaseCreatedAt >= currentTurnStartTime;
          }
          // Fallback: only count releases with matching turn ID (not scheduled_turn=0)
          return r.scheduled_turn === currentTurnId;
        });
        
        if (releasesThisTurn.length >= MAX_RELEASES_PER_TURN) {
          showToast(`Release limit reached (${MAX_RELEASES_PER_TURN} per turn). Wait for the next turn.`, "warning");
          return;
        }
      } catch (limitErr) {
        console.warn("[ReleaseWizard] Could not check release limit:", limitErr);
        // Non-fatal: proceed if check fails
      }

      // GUARD: For singles, verify song exists before creating release
      if (isSingle && (!song || !song.id)) {
        showToast("Cannot create single: invalid song", "error");
        return;
      }

      // Validate tracklist
      const tracklist = isSingle ? [song.id] : project?.tracklist || [];
      if (!tracklist.length) {
        showToast("Add at least one song before releasing.", "warning");
        return;
      }

      const trackSongs = songs.filter((s) => tracklist.includes(s.id));
      const hasUnrecorded = trackSongs.some((s) => s.status !== "recorded");
      if (hasUnrecorded) {
        showToast("All songs must be recorded before releasing.", "warning");
        return;
      }

      if (releaseData.platforms.length === 0) {
        showToast("Select at least one platform.", "warning");
        return;
      }

      let selectedEra = activeEra;
      if (activeEra && eraDecision === "change") {
        if (!newEraName.trim()) {
          showToast("Name your new era before continuing.", "warning");
          return;
        }
        selectedEra = await handleSwitchEra();
      }

      const merchCost = calculateTotalMerchCost();
      const canAffordMerch = profile.income >= merchCost;
      const merchToCreate = canAffordMerch ? releaseData.merch : [];
      const _actualMerchCost = canAffordMerch ? merchCost : 0;

      // H1 FIX: Send only platform names, not mixed UUIDs+names
      const platformNames = releaseData.platforms
        .map((platformId) => {
          const platform = platforms.find((entry) => entry.id === platformId);
          return platform?.name || null;
        })
        .filter(Boolean);

      // ── ATOMIC RELEASE: Single server-side call ──────────────────────────
      const result = await invokeEdgeFunction('releaseManager', {
        action: 'createRelease',
        artistId: profile.id,
        songId: isSingle ? song.id : undefined,
        projectId: !isSingle ? project.id : undefined,
        timing: releaseData.timing,
        scheduledTurns: releaseData.scheduledTurns,
        platforms: platformNames,
        regions: releaseData.regions.length > 0 ? releaseData.regions : [profile.region],
        merch: merchToCreate.map(m => ({ type: m.type, quantity: m.quantity, price: m.price })),
        isDissTrack,
        dissTargetId: dissTarget || undefined,
        eraDecision,
        newEraName: newEraName.trim() || undefined,
        isSurpriseDrop: releaseData.timing === "surprise",
        coverArtworkUrl: coverOverride || undefined,
      });

      if (!result.success) {
        showToast(result.error || "Release failed", "error");
        return;
      }

      // Show warnings from edge function (partial merch failure, etc.)
      if (result.data?.warnings?.length > 0) {
        for (const w of result.data.warnings) {
          showToast(w, "warning");
        }
      }

      // Era phase toast if era was updated
      if (selectedEra?.id && result.data?.eraPhase) {
        showToast(`This release has shifted your ${selectedEra.era_name || "current"} era into the ${result.data.eraPhase} phase!`, "success");
      }

      showToast(`${isSingle ? 'Single' : 'Project'} released successfully!`, "success");
      window.dispatchEvent(new CustomEvent('releaseCreated', { detail: { releaseId: result.data?.releaseId, artistId: profile.id } }));
      onComplete();
    } catch (error) {
      reportError({
        scope: "ReleaseWizard",
        message: "Release failed",
        error,
        extra: { projectId: project?.id, songId: song?.id, profileId: profile?.id, releaseData }
      });

      let msg = "Release failed. ";
      if (error.message?.includes("permission") || error.message?.includes("denied")) {
        msg += "Permission denied.";
      } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
        msg += "Network error — check your connection.";
      } else if (error.message?.includes("duplicate") || error.message?.includes("already")) {
        msg += "This release already exists.";
      } else {
        msg += error.message || "Unknown error.";
      }

      showToast(msg, "error", 5000);
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        const anticipation = calculateAnticipation();
        return (
          <div className="space-y-3">
            <h3 className="text-white text-base font-semibold mb-2">Release Timing</h3>
            {activeEra && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
                <p className="text-xs text-white">Release this project as part of <span className="font-semibold">{activeEra.era_name || "Current Era"}</span> era?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEraDecision("continue")}
                    className={`text-xs rounded-md px-2 py-1.5 border ${eraDecision === "continue" ? "border-green-500 bg-green-500/10 text-green-300" : "border-white/15 text-gray-300"}`}
                  >
                    Yes, continue Era
                  </button>
                  <button
                    onClick={() => setEraDecision("change")}
                    className={`text-xs rounded-md px-2 py-1.5 border ${eraDecision === "change" ? "border-yellow-500 bg-yellow-500/10 text-yellow-300" : "border-white/15 text-gray-300"}`}
                  >
                    No, change Era
                  </button>
                </div>
                {eraDecision === "change" && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-400">Current era will end and a new one will start now.</p>
                    <Input
                      value={newEraName}
                      onChange={(event) => setNewEraName(event.target.value)}
                      placeholder="New Era Name"
                      className="bg-white/5 border-white/10 text-white h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setReleaseData(prev => ({ ...prev, timing: "now" }))}
                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                  releaseData.timing === "now"
                    ? "border-red-500 bg-red-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Rocket className={`w-4 h-4 ${releaseData.timing === "now" ? "text-red-500" : "text-gray-400"}`} />
                  <div className="flex-1">
                    <p className="text-white font-medium text-xs">🚀 Drop Now</p>
                    <p className="text-gray-500 text-[10px]">Next turn</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setReleaseData(prev => ({ ...prev, timing: "schedule" }))}
                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                  releaseData.timing === "schedule"
                    ? "border-red-500 bg-red-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 ${releaseData.timing === "schedule" ? "text-red-500" : "text-gray-400"}`} />
                  <div className="flex-1">
                    <p className="text-white font-medium text-xs">📅 Schedule Release</p>
                    <p className="text-gray-500 text-[10px]">Build anticipation</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setReleaseData(prev => ({ ...prev, timing: "surprise", scheduledTurns: 0 }))}
                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                  releaseData.timing === "surprise"
                    ? "border-red-500 bg-red-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${releaseData.timing === "surprise" ? "text-red-500" : "text-gray-400"}`} />
                  <div className="flex-1">
                    <p className="text-white font-medium text-xs">💥 Surprise Drop</p>
                    <p className="text-gray-500 text-[10px]">Instant hype, virality boost, energy cost</p>
                  </div>
                </div>
              </button>
            </div>

            {releaseData.timing === "schedule" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-white/[0.02] border border-white/10 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-xs">Turns ahead:</span>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={releaseData.scheduledTurns}
                    onChange={(e) => setReleaseData(prev => ({ ...prev, scheduledTurns: parseInt(e.target.value) }))}
                    className="w-32"
                  />
                  <span className="text-white text-xs font-medium">{releaseData.scheduledTurns}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <TrendingUp className="w-3 h-3 text-yellow-400" />
                  <span className="text-yellow-400">+{anticipation}% Anticipation Bonus</span>
                </div>
              </motion.div>
            )}

            {/* Diss Track Toggle */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <button
                onClick={() => { setIsDissTrack(!isDissTrack); if (isDissTrack) setDissTarget(null); }}
                className={`w-full flex items-center gap-2 text-left transition-all ${isDissTrack ? 'text-red-400' : 'text-gray-400'}`}
              >
                <Flame className={`w-4 h-4 ${isDissTrack ? 'text-red-500' : 'text-gray-600'}`} />
                <div className="flex-1">
                  <p className="text-xs font-medium">🎤 Diss Track</p>
                  <p className="text-[10px] text-gray-500">Target a rival artist — triggers a fan war and boosts hype</p>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center ${isDissTrack ? 'bg-red-500 justify-end' : 'bg-white/10 justify-start'}`}>
                  <div className="w-3.5 h-3.5 bg-white rounded-full mx-0.5 shadow" />
                </div>
              </button>

              <AnimatePresence>
                {isDissTrack && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Target className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Select Target</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                        {rivalArtists.length === 0 ? (
                          <p className="text-gray-600 text-[10px] text-center py-2">No rival artists found</p>
                        ) : (
                          rivalArtists.map(rival => (
                            <button
                              key={rival.id}
                              onClick={() => setDissTarget(dissTarget === rival.id ? null : rival.id)}
                              className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-all text-xs ${
                                dissTarget === rival.id
                                  ? 'bg-red-500/15 border border-red-500/30 text-red-300'
                                  : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04] text-gray-300'
                              }`}
                            >
                              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                {(rival.artist_name || '?')[0].toUpperCase()}
                              </div>
                              <span className="truncate">{rival.artist_name}</span>
                              {rival.career_stage && <span className="text-[9px] text-gray-500 ml-auto flex-shrink-0">{rival.career_stage}</span>}
                            </button>
                          ))
                        )}
                      </div>
                      {isDissTrack && !dissTarget && (
                        <p className="text-[10px] text-gray-500 italic">No target = general diss (still triggers hype boost)</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <h3 className="text-white text-base font-semibold mb-2">Platforms</h3>
            <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
              {platforms.map((platform) => {
                const isLocked = platform.requires_clout > profile.clout;
                const isSelected = releaseData.platforms.includes(platform.id);
                
                return (
                  <button
                    key={platform.id}
                    onClick={() => !isLocked && togglePlatform(platform.id)}
                    disabled={isLocked}
                    className={`w-full p-2 rounded-lg border text-left transition-all ${
                      isLocked
                        ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-red-500 bg-red-500/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isLocked ? (
                        <Lock className="w-3 h-3 text-gray-600" />
                      ) : (
                        <div className={`w-3 h-3 rounded border flex items-center justify-center ${
                          isSelected ? "border-red-500 bg-red-500" : "border-gray-600"
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-xs">🔊 {platform.name}</p>
                        <p className="text-gray-500 text-[10px]">
                          {platform.exposure_focus} · +{platform.virality_tendency}% Viral · $ {platform.revenue_focus}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 3:
        const toggleRegion = (region) => {
          setReleaseData(prev => ({
            ...prev,
            regions: prev.regions.includes(region)
              ? prev.regions.filter(r => r !== region)
              : [...prev.regions, region]
          }));
        };
        
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white text-base font-semibold">Target Regions</h3>
              <span className="text-gray-400 text-xs">{releaseData.regions.length} selected</span>
            </div>
            {fanProfile && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.02] border border-white/10 rounded-lg p-2.5 text-center">
                  <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">Sentiment</p>
                  <p className="text-white text-xs font-bold">{Number(fanProfile?.overall_sentiment || 0)}</p>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-lg p-2.5 text-center">
                  <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">Retention</p>
                  <p className="text-white text-xs font-bold">{Math.round(Number(fanProfile?.retention_rate || 0) * 100)}%</p>
                </div>
                <div className="bg-white/[0.02] border border-white/10 rounded-lg p-2.5 text-center">
                  <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">Growth</p>
                  <p className={`text-xs font-bold ${Number(fanProfile?.listener_growth_trend || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {Number(fanProfile?.listener_growth_trend || 0) > 0 ? "+" : ""}{Number(fanProfile?.listener_growth_trend || 0).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
              {ALL_RELEASE_REGIONS.map((region) => {
                const isHome = region === profile.region;
                const isSelected = releaseData.regions.includes(region);
                const homeRegion = profile.region || "";
                const marketSignal = fanRegionMap.get(region) || null;
                // Familiar = neighboring/similar market to home
                const FAMILIAR_MAP = {
                  "United States": ["Canada", "UK"],
                  "Canada": ["United States", "UK"],
                  "UK": ["Europe", "United States"],
                  "Europe": ["UK", "Canada"],
                  "Africa": ["Latin America"],
                  "Latin America": ["Africa", "United States"],
                  "Asia": ["Oceania"],
                  "Oceania": ["Asia", "UK"],
                };
                const isFamiliar = !isHome && (FAMILIAR_MAP[homeRegion] || []).includes(region);
                const flavor = isHome ? REGION_FLAVOR.home : isFamiliar ? REGION_FLAVOR.familiar : REGION_FLAVOR.new;
                const signalLabel = marketSignal
                  ? marketSignal.percentage >= 20
                    ? "Hot market"
                    : marketSignal.percentage >= 10
                      ? "Established pocket"
                      : marketSignal.percentage > 0
                        ? "Early footprint"
                        : flavor.label
                  : flavor.label;
                const signalDesc = marketSignal
                  ? `${marketSignal.percentage.toFixed(1)}% of listeners${marketSignal.listeners > 0 ? ` · ${marketSignal.listeners.toLocaleString()} monthly` : ""}`
                  : flavor.desc;
                
                return (
                  <button
                    key={region}
                    onClick={() => toggleRegion(region)}
                    className={`w-full p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-red-500 bg-red-500/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "border-red-500 bg-red-500" : "border-gray-600"
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-xs">🌍 {region}</p>
                          {isHome && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-[9px] text-green-400">
                              HOME
                            </span>
                          )}
                          {marketSignal && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: `${REGION_COLORS[region] || "#a78bfa"}22`, color: REGION_COLORS[region] || "#a78bfa" }}>
                              {signalLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 text-[10px]">
                          {signalLabel} · {signalDesc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 4:
        if (!showMerchStep) {
          // Singles skip merch — step 4 goes straight to confirm
          return renderConfirmStep();
        }
        const merchCost = calculateTotalMerchCost();
        const canAffordMerch = profile.income >= merchCost;
        
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-base font-semibold">Merch (Optional)</h3>
              <Button
                size="sm"
                onClick={addMerch}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg h-6 text-[10px] px-2"
              >
                + Add
              </Button>
            </div>
            
            {releaseData.merch.length === 0 ? (
              <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 text-center">
                <Package className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                <p className="text-gray-500 text-xs">No merch added</p>
                <p className="text-gray-600 text-[10px] mt-0.5">Optional - skip or add items</p>
              </div>
            ) : (
              <div className="space-y-2">
                {releaseData.merch.map((merch, index) => (
                  <div key={index} className="bg-white/[0.02] border border-white/10 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <select
                        value={merch.type}
                        onChange={(e) => updateMerch(index, "type", e.target.value)}
                        className="flex-1 bg-white/5 border-white/10 text-white rounded px-2 py-1 text-xs"
                      >
                        <option value="CD">CD</option>
                        <option value="Vinyl">Vinyl</option>
                        <option value="Mixtape">Mixtape</option>
                      </select>
                      <button
                        onClick={() => removeMerch(index)}
                        className="text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-gray-500 text-[9px] uppercase tracking-wide mb-0.5 block">Quantity</label>
                        <Input
                          type="number"
                          value={merch.quantity}
                          onChange={(e) => updateMerch(index, "quantity", parseInt(e.target.value) || 0)}
                          placeholder="100"
                          className="bg-white/5 border-white/10 text-white h-7 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-[9px] uppercase tracking-wide mb-0.5 block">Price ($)</label>
                        <Input
                          type="number"
                          value={merch.price}
                          onChange={(e) => updateMerch(index, "price", parseInt(e.target.value) || 0)}
                          placeholder="15"
                          className="bg-white/5 border-white/10 text-white h-7 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-gray-500 text-[10px] mt-1">
                      Mfg cost: ${merch.quantity * MERCH_COSTS[merch.type]} · Cover art inherited from release
                    </p>
                  </div>
                ))}
                <div className={`rounded-lg p-2 border ${canAffordMerch ? "bg-white/[0.02] border-white/10" : "bg-yellow-500/10 border-yellow-500/30"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Total Cost:</span>
                    <span className={`text-xs font-medium ${canAffordMerch ? "text-white" : "text-yellow-400"}`}>
                      ${merchCost}
                    </span>
                  </div>
                  {!canAffordMerch && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-400" />
                      <p className="text-yellow-400 text-[10px]">Insufficient funds - merch will be skipped</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 5:
        return renderConfirmStep();

      default:
        return null;
    }
  };

  const renderConfirmStep = () => {
        const confirmTracklist = isSingle ? [song.id] : project?.tracklist || [];
        const trackSongs = songs.filter(s => confirmTracklist.includes(s.id));
        const avgQuality = trackSongs.reduce((sum, s) => sum + (s.quality || 0), 0) / trackSongs.length || 0;
        const projectedTier = avgQuality >= 85 ? "Breakout" : avgQuality >= 70 ? "Strong" : avgQuality >= 50 ? "Mid" : "Low";
        const boost = calculateReleaseBoost(releaseData.timing === "now");
        
        return (
          <div className="space-y-3">
            <h3 className="text-white text-base font-semibold mb-2">Confirm Release</h3>
            
            <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-12 h-12 rounded bg-white/5 overflow-hidden flex-shrink-0 relative group cursor-pointer"
                  onClick={() => coverInputRef.current?.click()}
                  title="Click to change cover art"
                >
                  {(coverOverride || releaseItem.cover_artwork_url) ? (
                    <img src={coverOverride || releaseItem.cover_artwork_url} alt={releaseItem.name || releaseItem.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-gray-500 m-auto mt-4" />
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">Edit</span>
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverOverride}
                    className="hidden"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm">{releaseItem.name || releaseItem.title}</h4>
                  <p className="text-gray-500 text-[10px]">{isSingle ? "Single" : projectType} • {confirmTracklist.length} {confirmTracklist.length === 1 ? 'track' : 'tracks'}</p>
                </div>
              </div>

              <div className="space-y-1 text-xs border-t border-white/10 pt-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Release:</span>
                  <span className="text-white">{releaseData.timing === "now" ? "Next Turn" : `${releaseData.scheduledTurns} turns`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Platforms:</span>
                  <span className="text-white">{releaseData.platforms.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Regions:</span>
                  <span className="text-white text-[10px]">{releaseData.regions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Projected:</span>
                  <span className={`font-medium ${
                    projectedTier === "Breakout" ? "text-yellow-400" :
                    projectedTier === "Strong" ? "text-green-400" :
                    projectedTier === "Mid" ? "text-blue-400" : "text-gray-400"
                  }`}>{projectedTier}</span>
                </div>
                {isDissTrack && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Diss Track:</span>
                    <span className="text-red-400 font-medium flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      {dissTarget ? rivalArtists.find(r => r.id === dissTarget)?.artist_name || 'Targeted' : 'General'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400 font-medium">Energy Cost</span>
                </div>
                <span className={`font-bold ${(profile?.energy || 0) >= (isSingle ? RELEASE_ENERGY_COST_SINGLE : RELEASE_ENERGY_COST_PROJECT) ? 'text-white' : 'text-red-400'}`}>
                  {isSingle ? RELEASE_ENERGY_COST_SINGLE : RELEASE_ENERGY_COST_PROJECT}{releaseData.timing === "surprise" ? " +5" : ""} ⚡
                  <span className="text-gray-500 font-normal ml-1">(have {profile?.energy || 0})</span>
                </span>
              </div>
            </div>

            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <Zap className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-xs font-medium">
                  {releaseData.timing === "now" ? "Release Boost" : "Scheduled Bonus"}
                </span>
              </div>
              {releaseData.timing === "now" ? (
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div className="text-center">
                    <p className="text-gray-400">Hype</p>
                    <p className="text-white font-medium">+{boost.hype}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Fans</p>
                    <p className="text-white font-medium">+{boost.fans}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Clout</p>
                    <p className="text-white font-medium">+{boost.clout}</p>
                  </div>
                </div>
              ) : releaseData.timing === "surprise" ? (
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div className="text-center">
                    <p className="text-gray-400">Hype</p>
                    <p className="text-white font-medium">+15</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Energy</p>
                    <p className="text-white font-medium">-5</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400">Virality</p>
                    <p className="text-white font-medium">+20%</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Era momentum on drop</span>
                  <span className="text-white font-medium">+{Math.floor(calculateAnticipation() * 0.6)}</span>
                </div>
              )}
            </div>
          </div>
        );

  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-4 max-w-md w-full max-h-[var(--app-usable-height)] overflow-y-auto nested-scroll custom-scrollbar"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white text-lg font-bold">Release Project</h2>
            <div className="flex items-center gap-1 text-gray-500 text-[10px]">
              <span>Step {step}/{totalSteps}</span>
              {step > 1 && <CheckCircle className="w-3 h-3 text-green-400" />}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-0.5 flex-1 rounded-full transition-all ${
                  s <= step ? "bg-red-500" : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2 mt-4">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex-1 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-8 text-xs"
            >
              Back
            </Button>
          )}
          {step < totalSteps ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 2 && releaseData.platforms.length === 0) || (step === 3 && releaseData.regions.length === 0)}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg h-8 disabled:opacity-30 text-xs"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleConfirmRelease}
              disabled={loading || releaseData.platforms.length === 0 || releaseData.regions.length === 0}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg h-8 disabled:opacity-30 text-xs"
            >
              {loading ? "Releasing..." : "🚀 Confirm Release"}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
