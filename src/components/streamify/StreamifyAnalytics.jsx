import React, { useState, useEffect, useMemo } from "react";
import { BarChart2, Music, CheckCircle, Clock, XCircle, AlertCircle, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { fmt } from "@/utils/numberFormat";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// ── Fan Q&A config ────────────────────────────────────────────────────────
const FAN_QA_SEGMENTS = [
  { id: "og",           label: "OG Fans",        emoji: "👑", morale: "+12", energy: 25, desc: "Deep loyalty boost + drift protection" },
  { id: "core",         label: "Core Fans",       emoji: "🔥", morale: "+8",  energy: 20, desc: "Recharge core sentiment + slow drift" },
  { id: "casual",       label: "Casual Listeners",emoji: "🎧", morale: "+5",  energy: 15, desc: "3% migrate to core fans" },
  { id: "trend_chaser", label: "Trend Chasers",   emoji: "📈", morale: "+3",  energy: 15, desc: "Extends their stay slightly" },
  { id: "stan",         label: "Stans",           emoji: "⚡", morale: "+10", energy: 20, desc: "+3 loyalty, amplified labor output" },
  { id: "critic",       label: "Critics",         emoji: "🎯", morale: "+4",  energy: 18, desc: "Reduces toxicity by 5" },
];

const ALGO_BOOSTS = [
  {
    id: "autoplay",
    label: "Autoplay",
    description: "End-of-session queue injection",
    duration: 7,
    bonusMult: 1.15,
    energyCost: 3,
  },
  {
    id: "radio",
    label: "Artist Radio",
    description: "Seeded into Streamify Radio stations",
    duration: 14,
    bonusMult: 1.2,
    energyCost: 5,
  },
  {
    id: "discovery",
    label: "Discovery Mix",
    description: "Pushed into Weekly & Personal Mixes",
    duration: 21,
    bonusMult: 1.3,
    energyCost: 8,
  },
  {
    id: "trending",
    label: "Trending Shelf",
    description: "Featured on editorial-adjacent trending",
    duration: 14,
    bonusMult: 1.25,
    energyCost: 12,
  },
];

const STATUS_ICON = {
  pending: <Clock className="w-3.5 h-3.5 text-amber-400" />,
  accepted: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
  rejected: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  expired: <AlertCircle className="w-3.5 h-3.5 text-white/30" />,
};

const STATUS_LABEL = {
  pending: "Under Review",
  accepted: "Active",
  rejected: "Declined",
  expired: "Ended",
};

// Streamify share threshold for highlighting
const STREAMIFY_PAYOUT_RATE = 0.018; // $/stream

export default function StreamifyAnalytics({ profile, releases, monthlyListeners }) {
  const [globalTurnId, setGlobalTurnId] = useState(null);
  const [algorithmMood, setAlgorithmMood] = useState(null);
  const [activeBoosts, setActiveBoosts] = useState([]);
  const [editorialHistory, setEditorialHistory] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedBoost, setSelectedBoost] = useState(null);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Fan Q&A state
  const [qaSessions, setQaSessions] = useState([]);
  const [selectedQaSegment, setSelectedQaSegment] = useState(null);
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const [qaError, setQaError] = useState(null);
  const [qaSuccess, setQaSuccess] = useState(null);

  const totalStreams = useMemo(
    () => (releases || []).reduce((sum, r) => sum + (r.lifetime_streams || 0), 0),
    [releases]
  );

  const topRelease = useMemo(() => {
    if (!releases?.length) return null;
    return [...releases].sort((a, b) => (b.lifetime_streams || 0) - (a.lifetime_streams || 0))[0];
  }, [releases]);

  const eligibleReleases = useMemo(
    () =>
      (releases || []).filter((r) =>
        ["Hot", "Trending", "Momentum", "Stable"].includes(r.lifecycle_state)
      ),
    [releases]
  );

  const releaseById = useMemo(() => {
    const map = new Map();
    (releases || []).forEach((r) => map.set(r.id, r));
    return map;
  }, [releases]);

  const activeBoostTypes = useMemo(
    () => new Set(activeBoosts.map((b) => b.boost_type)),
    [activeBoosts]
  );

  useEffect(() => {
    if (!profile?.id) return;
    loadData();
  }, [profile?.id]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [turnRes, boostRes, subRes] = await Promise.all([
        supabaseClient
          .from("turn_state")
          .select("global_turn_id, algorithm_mood")
          .eq("id", 1)
          .maybeSingle(),
        supabaseClient
          .from("algorithm_submissions")
          .select("id, boost_type, release_id, submitted_turn, active_until_turn, stream_bonus_multiplier, status")
          .eq("player_id", profile.id)
          .eq("platform", "Streamify")
          .eq("status", "active")
          .order("submitted_turn", { ascending: false }),
        supabaseClient
          .from("editorial_submissions")
          .select(
            "id, release_id, status, submitted_turn, resolved_turn, stream_bonus_multiplier, bonus_active_until_turn, rejection_reason, editorial_curators(name, tier, platform)"
          )
          .eq("player_id", profile.id)
          .order("submitted_turn", { ascending: false })
          .limit(15),
      ]);

      if (turnRes.data) {
        setGlobalTurnId(turnRes.data.global_turn_id);
        setAlgorithmMood(turnRes.data.algorithm_mood);
      }

      setActiveBoosts(boostRes.data || []);

      const streamifySubs = (subRes.data || []).filter(
        (s) => s.editorial_curators?.platform === "Streamify"
      );
      setEditorialHistory(streamifySubs);

      // Load Q&A session history (cooldown tracking)
      if (profile?.id) {
        const { data: qaData } = await supabaseClient
          .from("streamify_fanqa_sessions")
          .select("id, segment_type, submitted_turn, cooldown_expires_turn, morale_delta, energy_cost")
          .eq("player_id", profile.id)
          .order("submitted_turn", { ascending: false })
          .limit(20);
        setQaSessions(qaData || []);
      }
    } catch (e) {
      console.error("[StreamifyAnalytics] Load error:", e);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async () => {
    if (!profile?.id || !selectedBoost || !selectedRelease || submitting) return;
    if (!globalTurnId) {
      setSubmitError("Can't read current turn. Try again shortly.");
      return;
    }

    const boost = ALGO_BOOSTS.find((b) => b.id === selectedBoost);
    if (!boost) return;

    // Client-side energy check (UX gate only — real enforcement is server-side)
    if ((profile.energy || 0) < boost.energyCost) {
      setSubmitError(`Not enough energy. Need ${boost.energyCost}⚡`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "submit_algorithm_boost",
        boostType: boost.id,
        releaseId: selectedRelease.id,
      });

      if (!result.success) {
        // Handle duplicate key error
        if (result.error?.includes("already active")) {
          setSubmitError("This boost is already active for that release.");
        } else {
          setSubmitError(result.error || "Submit failed");
        }
        return;
      }

      setSubmitSuccess(
        result.data?.message || `${boost.label} boost active for "${selectedRelease.release_name || selectedRelease.title}"!`
      );
      setSelectedBoost(null);
      setSelectedRelease(null);
      await loadData();
    } catch (e) {
      setSubmitError(e.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Cooldown map: segment_type → cooldown_expires_turn
  const cooldownBySegment = useMemo(() => {
    const map = {};
    for (const s of qaSessions) {
      const prev = map[s.segment_type] || 0;
      map[s.segment_type] = Math.max(prev, s.cooldown_expires_turn || 0);
    }
    return map;
  }, [qaSessions]);

  const handleQaSubmit = async () => {
    if (!profile?.id || !selectedQaSegment || qaSubmitting) return;
    const seg = FAN_QA_SEGMENTS.find(s => s.id === selectedQaSegment);
    if (!seg) return;

    if ((profile.energy || 0) < seg.energy) {
      setQaError(`Not enough energy. Need ${seg.energy}⚡`);
      return;
    }

    setQaSubmitting(true);
    setQaError(null);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "host_streamify_fanqa",
        segmentType: selectedQaSegment,
      });
      if (!result.success) {
        setQaError(result.error || "Q&A session failed.");
        return;
      }
      setQaSuccess(`Q&A with ${seg.label} scheduled — effects land next turn.`);
      setSelectedQaSegment(null);
      await loadData();
    } catch (e) {
      setQaError(e.message || "Failed to submit Q&A session.");
    } finally {
      setQaSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-4 space-y-6">
      {/* Header */}
      <div className="px-4 pt-2">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        {algorithmMood && (
          <p className="text-white/40 text-xs mt-0.5">
            Algorithm mood:{" "}
            <span className="text-violet-400 capitalize">
              {algorithmMood.replace(/_/g, " ")}
            </span>
          </p>
        )}
      </div>

      {/* Stats */}
      {profile ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">
              Monthly Listeners
            </p>
            <p className="text-white text-xl font-bold mt-1">{fmt(monthlyListeners || 0)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">
              Total Streams
            </p>
            <p className="text-white text-xl font-bold mt-1">{fmt(totalStreams)}</p>
          </div>
          {topRelease && (
            <div className="col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex items-center gap-3">
              {topRelease.cover_artwork_url ? (
                <img
                  src={topRelease.cover_artwork_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Music className="w-5 h-5 text-white/30" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white/40 text-[9px] uppercase tracking-wider font-semibold">
                  Top Release
                </p>
                <p className="text-white text-sm font-semibold truncate mt-0.5">
                  {topRelease.release_name || topRelease.title}
                </p>
                <p className="text-white/40 text-[10px]">
                  {fmt(topRelease.lifetime_streams || 0)} streams
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
          <p className="text-white/40 text-xs">Sign in to see your stats</p>
        </div>
      )}

      {/* Streamify Performance */}
      {profile && releases?.length > 0 && (() => {
        const topByStreamify = [...releases]
          .filter(r => (r.platform_streams?.Streamify || 0) > 0)
          .sort((a, b) => (b.platform_streams?.Streamify || 0) - (a.platform_streams?.Streamify || 0))
          .slice(0, 5);
        if (topByStreamify.length === 0) return null;
        return (
          <section className="px-4 space-y-2">
            <h2 className="text-base font-bold text-white">Streamify Performance</h2>
            <p className="text-white/30 text-[10px]">Your top releases on Streamify vs other platforms</p>
            {topByStreamify.map(release => {
              const sfStreams = release.platform_streams?.Streamify || 0;
              const total = release.lifetime_streams || 1;
              const pct = Math.min(100, Math.round((sfStreams / total) * 100));
              const rev = sfStreams * STREAMIFY_PAYOUT_RATE;
              return (
                <div key={release.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {release.cover_artwork_url ? (
                      <img src={release.cover_artwork_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Music className="w-3 h-3 text-white/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[10px] font-semibold truncate">{release.release_name || release.title}</p>
                      <p className="text-white/30 text-[8px]">{release.lifecycle_state}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-violet-400 text-[10px] font-semibold">{fmt(sfStreams)}</p>
                      <p className="text-emerald-400 text-[8px]">${rev >= 1000 ? `${(rev/1000).toFixed(1)}K` : rev.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-white/40 text-[8px] flex-shrink-0">{pct}% of streams</span>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })()}

      {/* Algorithm Submit */}
      {profile && (
        <section className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Algorithm Submit</h2>
            <span className="text-[10px] text-white/30">{profile.energy || 0}⚡ available</span>
          </div>

          <AnimatePresence>
            {submitSuccess && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3"
              >
                <p className="text-emerald-400 text-xs font-medium">{submitSuccess}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {submitError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
              <p className="text-red-400 text-xs">{submitError}</p>
            </div>
          )}

          {/* Boost type grid */}
          <div className="grid grid-cols-2 gap-2">
            {ALGO_BOOSTS.map((boost) => {
              const isActive = activeBoostTypes.has(boost.id);
              const isSelected = selectedBoost === boost.id;
              const canAfford = (profile.energy || 0) >= boost.energyCost;

              return (
                <button
                  key={boost.id}
                  onClick={() => {
                    if (isActive) return;
                    setSelectedBoost(isSelected ? null : boost.id);
                    setSelectedRelease(null);
                    setSubmitError(null);
                    setSubmitSuccess(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    isActive
                      ? "border-emerald-500/30 bg-emerald-500/[0.04] opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-violet-500/50 bg-violet-500/[0.10]"
                      : !canAfford
                      ? "border-white/[0.04] bg-white/[0.02] opacity-50 cursor-not-allowed"
                      : "border-white/[0.08] bg-white/[0.03] hover:border-violet-500/30 active:scale-[0.98]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-semibold">{boost.label}</span>
                    {isActive ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <span className="text-white/40 text-[9px]">{boost.energyCost}⚡</span>
                    )}
                  </div>
                  <p className="text-white/40 text-[9px] leading-snug">{boost.description}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-violet-400 text-[9px] font-medium">
                      +{Math.round((boost.bonusMult - 1) * 100)}% streams
                    </span>
                    <span className="text-white/20 text-[8px]">· {boost.duration}t</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Release picker */}
          <AnimatePresence>
            {selectedBoost && (
              <motion.div
                key="release-picker"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-2">
                  Select a release
                </p>
                {eligibleReleases.length === 0 ? (
                  <p className="text-white/30 text-xs py-2">
                    No eligible releases — need Hot, Trending, Momentum, or Stable.
                  </p>
                ) : (
                  <div
                    className="flex gap-2 overflow-x-auto pb-1"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {eligibleReleases.map((release) => (
                      <button
                        key={release.id}
                        onClick={() =>
                          setSelectedRelease(
                            selectedRelease?.id === release.id ? null : release
                          )
                        }
                        className={`flex-shrink-0 rounded-xl border p-2 text-left transition-all ${
                          selectedRelease?.id === release.id
                            ? "border-violet-500/50 bg-violet-500/10"
                            : "border-white/[0.06] bg-white/[0.03] hover:border-violet-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {release.cover_artwork_url ? (
                            <img
                              src={release.cover_artwork_url}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                              <Music className="w-3.5 h-3.5 text-white/40" />
                            </div>
                          )}
                          <div>
                            <p className="text-white text-[10px] font-semibold truncate max-w-[100px]">
                              {release.release_name || release.title}
                            </p>
                            <p className="text-white/40 text-[8px]">{release.lifecycle_state}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Confirm button */}
          <AnimatePresence>
            {selectedBoost && selectedRelease && (
              <motion.div
                key="confirm-btn"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? "Submitting…"
                    : `Submit to ${ALGO_BOOSTS.find((b) => b.id === selectedBoost)?.label} — ${ALGO_BOOSTS.find((b) => b.id === selectedBoost)?.energyCost}⚡`}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Active Boosts */}
      {activeBoosts.length > 0 && (
        <section className="px-4 space-y-2">
          <h2 className="text-base font-bold text-white">Active Boosts</h2>
          {activeBoosts.map((boost) => {
            const release = releaseById.get(boost.release_id);
            const boostConfig = ALGO_BOOSTS.find((b) => b.id === boost.boost_type);
            const turnsLeft =
              globalTurnId != null ? boost.active_until_turn - globalTurnId : null;
            return (
              <div
                key={boost.id}
                className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 flex items-center gap-3"
              >
                {release?.cover_artwork_url ? (
                  <img
                    src={release.cover_artwork_url}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Music className="w-3.5 h-3.5 text-white/30" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-semibold truncate">
                    {release?.release_name || release?.title || "Unknown Release"}
                  </p>
                  <p className="text-violet-400 text-[9px]">
                    {boostConfig?.label || boost.boost_type} ·{" "}
                    +{Math.round((boost.stream_bonus_multiplier - 1) * 100)}% streams
                  </p>
                </div>
                {turnsLeft != null && (
                  <span className="text-white/30 text-[9px] flex-shrink-0">{turnsLeft}t left</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Editorial Pitch History */}
      {editorialHistory.length > 0 && (
        <section className="px-4 space-y-2">
          <h2 className="text-base font-bold text-white">Pitch History</h2>
          {editorialHistory.map((sub) => {
            const release = releaseById.get(sub.release_id);
            const curator = sub.editorial_curators;
            return (
              <div
                key={sub.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3"
              >
                {release?.cover_artwork_url ? (
                  <img
                    src={release.cover_artwork_url}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Music className="w-3.5 h-3.5 text-white/30" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-semibold truncate">
                    {release?.release_name || release?.title || "Release"}
                  </p>
                  <p className="text-white/40 text-[9px]">{curator?.name}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {STATUS_ICON[sub.status]}
                  <span
                    className={`text-[9px] font-medium ${
                      sub.status === "accepted"
                        ? "text-emerald-400"
                        : sub.status === "pending"
                        ? "text-amber-400"
                        : sub.status === "rejected"
                        ? "text-red-400"
                        : "text-white/30"
                    }`}
                  >
                    {STATUS_LABEL[sub.status]}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Fan Q&A Sessions */}
      {profile && (
        <section className="px-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-violet-400/70" />
            <h2 className="text-base font-bold text-white">Fan Connect</h2>
            <span className="text-[10px] text-white/30 ml-auto">{profile.energy || 0}⚡</span>
          </div>
          <p className="text-white/30 text-[10px]">
            Host a live Q&A session with a fandom segment. Effects land next turn. 14-turn cooldown per segment.
          </p>

          <AnimatePresence>
            {qaSuccess && (
              <motion.div
                key="qa-success"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3"
              >
                <p className="text-emerald-400 text-xs font-medium">{qaSuccess}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {qaError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
              <p className="text-red-400 text-xs">{qaError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {FAN_QA_SEGMENTS.map((seg) => {
              const onCooldown = globalTurnId != null && globalTurnId < (cooldownBySegment[seg.id] || 0);
              const cooldownLeft = onCooldown ? (cooldownBySegment[seg.id] || 0) - globalTurnId : 0;
              const canAfford = (profile.energy || 0) >= seg.energy;
              const isSelected = selectedQaSegment === seg.id;

              return (
                <button
                  key={seg.id}
                  onClick={() => {
                    if (onCooldown || !canAfford) return;
                    setSelectedQaSegment(isSelected ? null : seg.id);
                    setQaError(null);
                    setQaSuccess(null);
                  }}
                  disabled={onCooldown || !canAfford}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    onCooldown
                      ? "border-white/[0.04] bg-white/[0.02] opacity-40 cursor-not-allowed"
                      : isSelected
                      ? "border-violet-500/50 bg-violet-500/10"
                      : !canAfford
                      ? "border-white/[0.04] bg-white/[0.02] opacity-50 cursor-not-allowed"
                      : "border-white/[0.08] bg-white/[0.03] hover:border-violet-500/30 active:scale-[0.98]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">{seg.emoji}</span>
                    {onCooldown
                      ? <span className="text-white/30 text-[8px]">{cooldownLeft}t</span>
                      : <span className="text-white/40 text-[9px]">{seg.energy}⚡</span>
                    }
                  </div>
                  <p className="text-white text-[10px] font-semibold leading-tight">{seg.label}</p>
                  <p className="text-violet-400 text-[8px] font-medium mt-0.5">{seg.morale} morale</p>
                  <p className="text-white/30 text-[8px] leading-tight mt-0.5">{seg.desc}</p>
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {selectedQaSegment && (
              <motion.div
                key="qa-confirm"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <button
                  onClick={handleQaSubmit}
                  disabled={qaSubmitting}
                  className="w-full py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {qaSubmitting
                    ? "Scheduling…"
                    : `Host Q&A with ${FAN_QA_SEGMENTS.find(s => s.id === selectedQaSegment)?.label} — ${FAN_QA_SEGMENTS.find(s => s.id === selectedQaSegment)?.energy}⚡`}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Empty state */}
      {profile &&
        editorialHistory.length === 0 &&
        activeBoosts.length === 0 &&
        !selectedBoost && (
          <div className="mx-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
            <BarChart2 className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-xs">No submissions yet</p>
            <p className="text-white/25 text-[10px] mt-1">
              Use Algorithm Submit above to boost your releases
            </p>
          </div>
        )}
    </div>
  );
}
