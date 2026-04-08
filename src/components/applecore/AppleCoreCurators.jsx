import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock, CheckCircle, XCircle, Music, Send, X, Sparkles, Mic2
} from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// ── Tier config ────────────────────────────────────────────────────────────
const TIER = {
  emerging: { label: "Emerging", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  mid:      { label: "Mid-Tier", cls: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  major:    { label: "Major",    cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
};

const STATUS = {
  pending:  { label: "Under Review", Icon: Clock,         cls: "text-amber-400",  bg: "bg-amber-400/10 border-amber-400/20" },
  accepted: { label: "Placed",       Icon: CheckCircle,   cls: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  rejected: { label: "Declined",     Icon: XCircle,       cls: "text-red-400",    bg: "bg-red-400/10 border-red-400/20" },
  expired:  { label: "Expired",      Icon: XCircle,       cls: "text-white/30",   bg: "bg-white/5 border-white/10" },
};

const ELIGIBLE_STATES = new Set(["hot", "trending", "momentum", "strongstart", "stable",
  "Hot", "Trending", "Momentum", "StrongStart", "Stable"]);

function pct(v) { return `${Math.round((v || 0) * 100)}%`; }
function mult(v) { return `+${Math.round(((v || 1) - 1) * 100)}%`; }

// ── Submission card (status display) ─────────────────────────────────────
function SubmissionCard({ sub, curatorsById, releasesById }) {
  const curator = curatorsById[sub.curator_id];
  const release = releasesById[sub.release_id];
  const s = STATUS[sub.status] || STATUS.expired;
  if (!curator) return null;

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${s.bg}`}>
      <div className="flex-shrink-0">
        {release?.cover_artwork_url
          ? <img src={release.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
          : <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center"><Music className="w-4 h-4 text-white/30" /></div>
        }
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-semibold truncate">
          {release?.title || release?.release_name || "Unknown Release"}
        </p>
        <p className="text-white/50 text-[10px] truncate">{curator.name}</p>
        {sub.status === "accepted" && sub.stream_bonus_multiplier && (
          <p className="text-emerald-400 text-[9px] font-semibold mt-0.5">
            {mult(sub.stream_bonus_multiplier)} streams • active until turn {sub.bonus_active_until_turn}
          </p>
        )}
      </div>
      <div className={`flex-shrink-0 flex items-center gap-1 ${s.cls}`}>
        <s.Icon className="w-3.5 h-3.5" />
        <span className="text-[9px] font-semibold">{s.label}</span>
      </div>
    </div>
  );
}

// ── Curator card ──────────────────────────────────────────────────────────
function CuratorCard({ curator, submissions, globalTurnId, onPitch }) {
  // Find latest submission for this curator (any release)
  const curatorSubs = submissions.filter(s => s.curator_id === curator.id);
  const pending  = curatorSubs.find(s => s.status === "pending");
  const accepted = curatorSubs.find(s => s.status === "accepted" && (s.bonus_active_until_turn || 0) >= globalTurnId);

  // Cooldown: most recently resolved submission
  const resolved = curatorSubs
    .filter(s => s.status === "rejected" || s.status === "expired" || (s.status === "accepted" && (s.bonus_active_until_turn || 0) < globalTurnId))
    .sort((a, b) => (b.resolved_turn || 0) - (a.resolved_turn || 0))[0];

  const onCooldown = resolved && globalTurnId > 0
    ? (globalTurnId - (resolved.resolved_turn || 0)) < curator.cooldown_turns
    : false;

  const cooldownLeft = onCooldown
    ? curator.cooldown_turns - (globalTurnId - (resolved.resolved_turn || 0))
    : 0;

  const t = TIER[curator.tier] || TIER.mid;
  const genres = Array.isArray(curator.genre_focus) && curator.genre_focus.length > 0
    ? curator.genre_focus
    : null;

  const canPitch = !pending && !accepted && !onCooldown;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${t.cls}`}>
                {t.label}
              </span>
              {accepted && (
                <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                  Active Placement
                </span>
              )}
              {pending && (
                <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                  Under Review
                </span>
              )}
            </div>
            <h3 className="text-white font-bold text-sm leading-tight">{curator.name}</h3>
          </div>
        </div>

        {genres && (
          <div className="flex gap-1 flex-wrap mt-2">
            {genres.slice(0, 4).map(g => (
              <span key={g} className="text-[8px] text-white/50 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 border-t border-white/[0.05] divide-x divide-white/[0.05]">
        <div className="px-3 py-2 text-center">
          <p className="text-white/40 text-[8px] uppercase tracking-wider">Accept Rate</p>
          <p className="text-white text-xs font-bold mt-0.5">{pct(curator.acceptance_rate)}</p>
        </div>
        <div className="px-3 py-2 text-center">
          <p className="text-white/40 text-[8px] uppercase tracking-wider">Stream Boost</p>
          <p className="text-rose-400 text-xs font-bold mt-0.5">{mult(curator.stream_bonus_mult)}</p>
        </div>
        <div className="px-3 py-2 text-center">
          <p className="text-white/40 text-[8px] uppercase tracking-wider">Duration</p>
          <p className="text-white text-xs font-bold mt-0.5">{curator.bonus_duration_turns}t</p>
        </div>
      </div>

      {/* Requirements + CTA */}
      <div className="px-4 pb-4 pt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[9px] text-white/30">
          {curator.min_clout > 0 && (
            <span>{curator.min_clout} clout</span>
          )}
          {curator.min_quality > 0 && (
            <>
              {curator.min_clout > 0 && <span>·</span>}
              <span>{curator.min_quality}+ quality</span>
            </>
          )}
          {curator.review_delay_turns > 0 && (
            <span>· {curator.review_delay_turns}t review</span>
          )}
        </div>

        {onCooldown ? (
          <span className="text-[9px] text-white/30 font-medium">
            Cooldown: {cooldownLeft}t left
          </span>
        ) : canPitch ? (
          <button
            onClick={() => onPitch(curator)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-300 text-[10px] font-semibold hover:bg-rose-500/25 transition-all active:scale-95"
          >
            <Send className="w-3 h-3" />
            Pitch
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Pitch modal ───────────────────────────────────────────────────────────
function PitchModal({ curator, releases, playerProfile, onSubmit, onClose, submitting }) {
  const [selectedRelease, setSelectedRelease] = useState(null);

  const eligibleReleases = useMemo(() => {
    if (!releases?.length) return [];
    return releases.filter(r => ELIGIBLE_STATES.has(r.lifecycle_state));
  }, [releases]);

  const genreSet = useMemo(() => {
    const genres = Array.isArray(curator.genre_focus) ? curator.genre_focus : [];
    return new Set(genres.map(g => g.toLowerCase()));
  }, [curator]);

  const cloutOk = (playerProfile?.clout || 0) >= curator.min_clout;

  function releaseChecks(release) {
    const qualityOk = (release.quality_score || 0) >= curator.min_quality;
    const genreOk = genreSet.size === 0 || genreSet.has((release.genre || "").toLowerCase());
    return { qualityOk, genreOk };
  }

  const canSubmit = selectedRelease && cloutOk && !submitting;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative z-10 rounded-t-3xl border-t border-white/10 bg-[#111118] pb-[env(safe-area-inset-bottom)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 300 }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className="px-5 pt-2 pb-5 space-y-5">
          {/* Curator info */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-1">Pitching to</p>
                <h2 className="text-white text-lg font-bold leading-tight">{curator.name}</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 text-white/40 hover:text-white transition-colors mt-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-white/40">
              <span className="text-rose-400 font-semibold">{mult(curator.stream_bonus_mult)} streams</span>
              <span>·</span>
              <span>{curator.bonus_duration_turns} turns</span>
              <span>·</span>
              <span>{pct(curator.acceptance_rate)} accept rate</span>
            </div>
          </div>

          {/* Requirements check */}
          {(curator.min_clout > 0 || curator.min_quality > 0) && (
            <div className="space-y-1.5">
              <p className="text-white/30 text-[9px] uppercase tracking-wider font-semibold">Requirements</p>
              {curator.min_clout > 0 && (
                <div className="flex items-center gap-2">
                  {cloutOk
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  <span className={`text-[10px] ${cloutOk ? "text-white/60" : "text-red-400"}`}>
                    {curator.min_clout} clout (you have {playerProfile?.clout || 0})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Release picker */}
          <div>
            <p className="text-white/30 text-[9px] uppercase tracking-wider font-semibold mb-2">Select Release</p>
            {eligibleReleases.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <Music className="w-5 h-5 text-white/20 mx-auto mb-1.5" />
                <p className="text-white/40 text-xs">No eligible releases</p>
                <p className="text-white/25 text-[9px] mt-0.5">Release music in Hot, Trending, or Stable state to pitch</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {eligibleReleases.map(release => {
                  const { qualityOk, genreOk } = releaseChecks(release);
                  const isSelected = selectedRelease?.id === release.id;
                  const hasWarning = !qualityOk || (!genreOk && genreSet.size > 0);

                  return (
                    <button
                      key={release.id}
                      onClick={() => setSelectedRelease(isSelected ? null : release)}
                      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-rose-500/40 bg-rose-500/10"
                          : "border-white/[0.06] bg-white/[0.025] hover:border-white/15"
                      }`}
                    >
                      {release.cover_artwork_url
                        ? <img src={release.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4 text-white/30" /></div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-xs font-semibold truncate">{release.title || release.release_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-white/40 text-[9px]">{release.lifecycle_state}</span>
                          {release.quality_score && <span className="text-white/30 text-[9px]">· Q{release.quality_score}</span>}
                          {release.genre && <span className="text-white/30 text-[9px]">· {release.genre}</span>}
                        </div>
                        {hasWarning && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {!qualityOk && <span className="text-amber-400/80 text-[8px]">Quality below threshold</span>}
                            {qualityOk && !genreOk && genreSet.size > 0 && <span className="text-amber-400/80 text-[8px]">Genre mismatch</span>}
                          </div>
                        )}
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Review note */}
          {curator.review_delay_turns > 0 && (
            <p className="text-white/25 text-[9px] text-center">
              Decisions take {curator.review_delay_turns} turns · Cooldown {curator.cooldown_turns} turns after decision
            </p>
          )}

          {/* Submit */}
          <button
            onClick={() => canSubmit && onSubmit(curator, selectedRelease)}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
              canSubmit
                ? "bg-rose-500 hover:bg-rose-400 text-white active:scale-[0.98]"
                : "bg-white/5 text-white/25 cursor-not-allowed"
            }`}
          >
            {submitting ? "Submitting…" : !selectedRelease ? "Select a release" : !cloutOk ? "Not enough clout" : "Submit Pitch"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Interview slot config ─────────────────────────────────────────────────
const INTERVIEW_SLOTS = {
  feature: {
    label: "Press Feature",
    description: "A written profile with editorial photos. Boosts core & stan sentiment.",
    cost: 2500,
    reviewDelay: 3,
    moraleCore: 6,
    moraleStan: 10,
    cooldown: 28,
    icon: "✍️",
  },
  cover_story: {
    label: "Cover Story",
    description: "Full cover feature. Reaches casual fans too. High news priority.",
    cost: 4000,
    reviewDelay: 5,
    moraleCore: 9,
    moraleStan: 14,
    cooldown: 28,
    icon: "📰",
  },
  zane_session: {
    label: "Zane Session",
    description: "Intimate radio session. Deepest fan impact, highest visibility.",
    cost: 6500,
    reviewDelay: 7,
    moraleCore: 12,
    moraleStan: 18,
    cooldown: 28,
    icon: "🎙️",
  },
};

const SLOT_STATUS = {
  pending:   { label: "Scheduled",  cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  published: { label: "Live",       cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  cancelled: { label: "Cancelled",  cls: "text-white/30 bg-white/5 border-white/10" },
};

function fmt$(n) { return `$${Number(n || 0).toLocaleString()}`; }

// ── Interview slot card ───────────────────────────────────────────────────
function InterviewSlotCard({ slotType, config, activeSlot, cooldownExpiresAt, globalTurnId, playerBalance, onBook }) {
  const hasPending   = activeSlot?.status === "pending";
  const hasPublished = activeSlot?.status === "published" && (globalTurnId - (activeSlot.resolved_turn || 0)) < 14;
  const onCooldown   = cooldownExpiresAt > 0 && globalTurnId < cooldownExpiresAt;
  const cooldownLeft = onCooldown ? cooldownExpiresAt - globalTurnId : 0;
  const canAfford    = (playerBalance || 0) >= config.cost;
  const canBook      = !hasPending && !hasPublished && !onCooldown && canAfford;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="text-2xl flex-shrink-0 mt-0.5">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-white font-bold text-sm">{config.label}</h3>
            {hasPending && (
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${SLOT_STATUS.pending.cls}`}>
                {SLOT_STATUS.pending.label} · publishes turn {activeSlot.publish_turn}
              </span>
            )}
            {hasPublished && (
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${SLOT_STATUS.published.cls}`}>
                {SLOT_STATUS.published.label}
              </span>
            )}
          </div>
          <p className="text-white/40 text-[10px] leading-relaxed">{config.description}</p>

          <div className="flex items-center gap-3 mt-2 text-[9px] text-white/30">
            <span className="text-amber-400 font-semibold">{fmt$(config.cost)}</span>
            <span>·</span>
            <span>+{config.moraleCore} core morale</span>
            <span>·</span>
            <span>+{config.moraleStan} stan morale</span>
            <span>·</span>
            <span>{config.reviewDelay}t publish</span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 flex justify-end">
        {onCooldown ? (
          <span className="text-[9px] text-white/30 font-medium">Cooldown: {cooldownLeft}t left</span>
        ) : hasPending ? (
          <span className="text-[9px] text-amber-400/70 font-medium">Interview scheduled</span>
        ) : hasPublished ? (
          <span className="text-[9px] text-emerald-400/70 font-medium">Recently published</span>
        ) : !canAfford ? (
          <span className="text-[9px] text-white/25 font-medium">Need {fmt$(config.cost)}</span>
        ) : (
          <button
            onClick={() => onBook(slotType, config)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-semibold hover:bg-amber-500/25 transition-all active:scale-95"
          >
            <Mic2 className="w-3 h-3" />
            Book — {fmt$(config.cost)}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function AppleCoreCurators({ playerProfile, playerReleases }) {
  const [curators, setCurators] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [interviewSlots, setInterviewSlots] = useState([]);
  const [globalTurnId, setGlobalTurnId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pitchTarget, setPitchTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingSlot, setBookingSlot] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData();
  }, [playerProfile?.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [curatorsRes, turnRes] = await Promise.all([
        supabaseClient
          .from("editorial_curators")
          .select("id, name, playlist_slug, genre_focus, tier, min_clout, min_quality, min_release_turns, acceptance_rate, stream_bonus_mult, bonus_duration_turns, cooldown_turns, review_delay_turns")
          .eq("platform", "AppleCore")
          .eq("active", true)
          .order("tier", { ascending: false }),
        supabaseClient
          .from("turn_state")
          .select("global_turn_id")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      setCurators(curatorsRes.data || []);
      setGlobalTurnId(turnRes.data?.global_turn_id || 0);

      // Load player submissions + interview slots
      if (playerProfile?.id) {
        const [subsRes, slotsRes] = await Promise.all([
          supabaseClient
            .from("editorial_submissions")
            .select("id, curator_id, release_id, submitted_turn, status, stream_bonus_multiplier, bonus_active_until_turn, resolved_turn, rejection_reason")
            .eq("player_id", playerProfile.id)
            .order("submitted_turn", { ascending: false }),
          supabaseClient
            .from("applecore_interview_slots")
            .select("id, slot_type, status, submitted_turn, publish_turn, resolved_turn, cost_paid, cooldown_expires_turn")
            .eq("player_id", playerProfile.id)
            .order("submitted_turn", { ascending: false })
            .limit(20),
        ]);
        setSubmissions(subsRes.data || []);
        setInterviewSlots(slotsRes.data || []);
      }
    } catch (e) {
      console.error("[AppleCoreCurators] load error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(curator, release) {
    if (!playerProfile?.id || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabaseClient
        .from("editorial_submissions")
        .insert({
          player_id: playerProfile.id,
          release_id: release.id,
          curator_id: curator.id,
          submitted_turn: globalTurnId,
          status: "pending",
        });

      if (error) {
        if (error.code === "23505") {
          showToast("Already pitched this release to this curator.", "error");
        } else {
          showToast(error.message || "Submission failed.", "error");
        }
        return;
      }

      showToast(`Pitched to ${curator.name} — decision in ${curator.review_delay_turns} turns.`, "success");
      setPitchTarget(null);
      // Refresh submissions
      const { data: subs } = await supabaseClient
        .from("editorial_submissions")
        .select("id, curator_id, release_id, submitted_turn, status, stream_bonus_multiplier, bonus_active_until_turn, resolved_turn, rejection_reason")
        .eq("player_id", playerProfile.id)
        .order("submitted_turn", { ascending: false });
      setSubmissions(subs || []);
    } catch (e) {
      showToast("Submission failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBookInterview(slotType, config) {
    if (!playerProfile?.id || bookingSlot) return;

    // Client-side affordability check (UX gate only — real enforcement is server-side)
    const playerBalance = playerProfile?.balance || playerProfile?.cash_balance || 0;
    if (playerBalance < config.cost) {
      showToast(`Not enough money. Need ${fmt$(config.cost)}.`, "error");
      return;
    }

    setBookingSlot(true);
    try {
      const result = await invokeEdgeFunction("fandomActions", {
        subAction: "book_applecore_interview",
        slotType,
      });

      if (!result.success) {
        showToast(result.error || "Booking failed.", "error");
        return;
      }

      showToast(result.data?.message || `${config.label} booked — goes live turn ${globalTurnId + config.reviewDelay}.`, "success");

      // Refresh slots
      const { data: slots } = await supabaseClient
        .from("applecore_interview_slots")
        .select("id, slot_type, status, submitted_turn, publish_turn, resolved_turn, cost_paid, cooldown_expires_turn")
        .eq("player_id", playerProfile.id)
        .order("submitted_turn", { ascending: false })
        .limit(20);
      setInterviewSlots(slots || []);
    } catch (e) {
      showToast("Booking failed.", "error");
    } finally {
      setBookingSlot(false);
    }
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Derived maps
  const curatorsById = useMemo(() => Object.fromEntries(curators.map(c => [c.id, c])), [curators]);
  const releasesById = useMemo(() => {
    const map = {};
    for (const r of (playerReleases || [])) map[r.id] = r;
    return map;
  }, [playerReleases]);

  // Split submissions into active/pending vs history
  const activeSubs = useMemo(() =>
    submissions.filter(s => s.status === "pending" || (s.status === "accepted" && (s.bonus_active_until_turn || 0) >= globalTurnId)),
    [submissions, globalTurnId]
  );

  // Sort curators: major → mid → emerging
  const TIER_ORDER = { major: 0, mid: 1, emerging: 2 };
  const sortedCurators = useMemo(() =>
    [...curators].sort((a, b) => (TIER_ORDER[a.tier] ?? 2) - (TIER_ORDER[b.tier] ?? 2)),
    [curators]
  );

  // Interview slot lookup: most recent slot per slot_type
  const slotByType = useMemo(() => {
    const map = {};
    for (const slot of interviewSlots) {
      if (!map[slot.slot_type]) map[slot.slot_type] = slot;
    }
    return map;
  }, [interviewSlots]);

  // Cooldown per slot_type: max cooldown_expires_turn across any slot of that type
  const cooldownByType = useMemo(() => {
    const map = {};
    for (const slot of interviewSlots) {
      const prev = map[slot.slot_type] || 0;
      map[slot.slot_type] = Math.max(prev, slot.cooldown_expires_turn || 0);
    }
    return map;
  }, [interviewSlots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 space-y-6">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-white">Curators</h1>
        <p className="text-white/40 text-xs mt-1">Pitch your releases to get on editorial playlists</p>
      </div>

      {/* Active placements / pending pitches */}
      {activeSubs.length > 0 && (
        <section>
          <p className="text-white/30 text-[9px] uppercase tracking-widest font-semibold mb-2.5">Your Pitches</p>
          <div className="space-y-2">
            {activeSubs.map(sub => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                curatorsById={curatorsById}
                releasesById={releasesById}
              />
            ))}
          </div>
        </section>
      )}

      {/* Curator list */}
      <section>
        <p className="text-white/30 text-[9px] uppercase tracking-widest font-semibold mb-2.5">
          AppleCore Playlists
        </p>
        {sortedCurators.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
            <Sparkles className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-xs">No curators available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCurators.map(curator => (
              <CuratorCard
                key={curator.id}
                curator={curator}
                submissions={submissions}
                globalTurnId={globalTurnId}
                onPitch={setPitchTarget}
              />
            ))}
          </div>
        )}
      </section>

      {/* Interview Slots */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <Mic2 className="w-3.5 h-3.5 text-amber-400/70" />
          <p className="text-white/30 text-[9px] uppercase tracking-widest font-semibold">Exclusive Interviews</p>
        </div>
        <p className="text-white/25 text-[10px] mb-3">
          Book press features and radio sessions. Effects land when published — boosts fan sentiment and generates news coverage.
        </p>
        <div className="space-y-3">
          {Object.entries(INTERVIEW_SLOTS).map(([slotType, config]) => (
            <InterviewSlotCard
              key={slotType}
              slotType={slotType}
              config={config}
              activeSlot={slotByType[slotType] || null}
              cooldownExpiresAt={cooldownByType[slotType] || 0}
              globalTurnId={globalTurnId}
              playerBalance={playerProfile?.balance || playerProfile?.cash_balance || 0}
              onBook={handleBookInterview}
            />
          ))}
        </div>
      </section>

      {/* Pitch modal */}
      <AnimatePresence>
        {pitchTarget && (
          <PitchModal
            curator={pitchTarget}
            releases={playerReleases}
            playerProfile={playerProfile}
            onSubmit={handleSubmit}
            onClose={() => setPitchTarget(null)}
            submitting={submitting}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/20 border-red-500/30 text-red-300"
            }`}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
