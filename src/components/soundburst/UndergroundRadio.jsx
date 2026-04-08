import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Inbox, Radio, RefreshCw, Tv2, Users, X, Play } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { normalizeRegion } from "@/lib/regionConstants";
import RadioShowManagement from "./RadioShowManagement";

const SUBTABS = [
  { id: "discover", label: "Radio", icon: Radio },
  { id: "myShow",   label: "My Show", icon: Tv2 },
  { id: "submissions", label: "Submissions", icon: Inbox },
];

const STATUS_STYLES = {
  pending: "bg-yellow-500/15 text-yellow-300 border-yellow-400/30",
  accepted: "bg-[#C9A84C]/20 text-[#E8C87C] border-[#C9A84C]/40",
  rejected: "bg-red-500/15 text-red-300 border-red-400/30",
  expired: "bg-gray-500/20 text-gray-300 border-gray-400/30",
};

const GRADIENTS = {
  "United States": "from-purple-600/30 to-blue-600/30",
  UK: "from-blue-600/30 to-indigo-600/30",
  Europe: "from-cyan-600/30 to-blue-600/30",
  Canada: "from-emerald-600/30 to-cyan-600/30",
  "Latin America": "from-orange-600/30 to-red-600/30",
  Africa: "from-green-600/30 to-emerald-600/30",
  Asia: "from-fuchsia-600/30 to-purple-600/30",
  Oceania: "from-teal-600/30 to-blue-600/30",
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function getStatusLabel(status) {
  if (!status) return "none";
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function getReputationBadge(score) {
  const value = Number(score || 0);
  if (value >= 80) return "bg-purple-500/20 text-purple-200 border-purple-400/40";
  if (value >= 50) return "bg-[#C9A84C]/20 text-[#E8C87C] border-[#C9A84C]/40";
  if (value >= 20) return "bg-blue-500/20 text-blue-200 border-blue-400/40";
  return "bg-gray-500/20 text-gray-200 border-gray-400/40";
}

// Mock station data for the carousel display
const CURATED_STATIONS = [
  { id: "curated-1", label: "BARS", name: "Best UK Rap", subtitle: "SoundBurst Originals", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop", genre: "Hip-Hop" },
  { id: "curated-2", label: "TECHNO", name: "New Techno Now", subtitle: "Main Room", image: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=300&h=300&fit=crop", genre: "Electronic" },
  { id: "curated-3", label: "FRESCO", name: "Fresh Latin Hits", subtitle: "La Onda", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=300&h=300&fit=crop", genre: "Latin" },
  { id: "curated-4", label: "VIBES", name: "Lo-Fi Chill", subtitle: "Late Night Sessions", image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop", genre: "Lo-Fi" },
  { id: "curated-5", label: "INDIE", name: "Indie Discovery", subtitle: "Fresh Finds", image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop", genre: "Indie" },
  { id: "curated-6", label: "SOUL", name: "Neo Soul Radio", subtitle: "Smooth Grooves", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop", genre: "R&B" },
];

const TASTEMAKER_STATIONS = [
  { id: "taste-1", label: "CULT", name: "Cult Classics", subtitle: "Tastemaker Picks", image: "https://images.unsplash.com/photo-1598387993281-cecf8b71a8f8?w=300&h=300&fit=crop", genre: "Alternative" },
  { id: "taste-2", label: "DEEP", name: "Deep Cuts", subtitle: "Hidden Gems", image: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&h=300&fit=crop", genre: "Various" },
  { id: "taste-3", label: "RARE", name: "Rare Finds", subtitle: "Collector's Edition", image: "https://images.unsplash.com/photo-1485579149621-3123dd979885?w=300&h=300&fit=crop", genre: "Various" },
  { id: "taste-4", label: "WAVE", name: "New Wave Radio", subtitle: "Breaking Artists", image: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=300&h=300&fit=crop", genre: "Electronic" },
  { id: "taste-5", label: "RAW", name: "Raw & Uncut", subtitle: "Street Sounds", image: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=300&h=300&fit=crop", genre: "Hip-Hop" },
];

// Radio Station Card with overlay text (like SoundCloud style)
function RadioStationCard({ station, onClick }) {
  return (
    <button
      onClick={() => onClick?.(station)}
      className="flex-shrink-0 w-[140px] text-left group"
    >
      <div className="relative aspect-square w-full rounded-md overflow-hidden bg-black mb-2">
        <img
          src={station.image}
          alt={station.name}
          className="w-full h-full object-cover transition group-hover:scale-105"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {/* Label overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-lg font-black tracking-wider drop-shadow-lg">
            {station.label}
          </span>
        </div>
        {/* Play button on hover */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-4 h-4 text-black fill-black ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-white text-xs font-semibold line-clamp-1 leading-tight">
        {station.name}
      </p>
      <p className="text-white/40 text-[10px] mt-0.5 line-clamp-1">
        {station.subtitle}
      </p>
    </button>
  );
}

// Horizontal carousel rail for radio stations
function RadioStationRail({ title, stations, onStationClick }) {
  if (!stations || stations.length === 0) return null;
  
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="text-white text-lg font-bold">{title}</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2 px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {stations.map((station) => (
          <RadioStationCard
            key={station.id}
            station={station}
            onClick={onStationClick}
          />
        ))}
      </div>
    </section>
  );
}

export default function UndergroundRadio({ userProfile }) {
  const [tab, setTab] = useState("discover");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shows, setShows] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);
  const [eligibleReleases, setEligibleReleases] = useState([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [myShow, setMyShow] = useState(null);
  const [unlockStatus, setUnlockStatus] = useState({ unlocked: false, paths: [] });
  const [selectedStation, setSelectedStation] = useState(null);

  const artistId = userProfile?.id;
  const userRegion = normalizeRegion(userProfile?.region) || "United States";

  const refreshData = async () => {
    if (!artistId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    const [showsResult, submissionsResult, myShowResult] = await Promise.all([
      invokeEdgeFunction("soundburstRadio", { action: "getShows", artistId }),
      invokeEdgeFunction("soundburstRadio", { action: "getSubmissions", artistId }),
      invokeEdgeFunction("soundburstRadio", { action: "getMyShow", artistId }),
    ]);

    if (!showsResult.success) {
      setError(showsResult.error || "Failed to load radio shows");
      setLoading(false);
      return;
    }

    if (!submissionsResult.success) {
      setError(submissionsResult.error || "Failed to load submissions");
      setLoading(false);
      return;
    }

    setShows(showsResult.data?.shows || []);
    setSubmissions(submissionsResult.data?.submissions || showsResult.data?.playerSubmissions || []);
    if (myShowResult.success) {
      setMyShow(myShowResult.data?.show || null);
      setUnlockStatus(myShowResult.data?.unlockStatus || { unlocked: false, paths: [] });
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, [artistId]);

  // Categorize shows for the carousels
  const { curatedStations, tastemakerStations, undergroundStations } = useMemo(() => {
    // Player-created shows (Curated by SoundBurst) - prioritize user's region
    const playerShows = shows.filter(s => !s.is_npc);
    const regionalPlayerShows = playerShows.filter(s => s.region === userRegion);
    const otherPlayerShows = playerShows.filter(s => s.region !== userRegion);
    
    // Map player shows to station format
    const curatedFromPlayer = [...regionalPlayerShows, ...otherPlayerShows].slice(0, 6).map((show, idx) => ({
      id: show.id,
      label: (show.genre_affinity?.[0] || show.name || "MIX").slice(0, 6).toUpperCase(),
      name: show.name,
      subtitle: show.host_name || "Player Radio",
      image: CURATED_STATIONS[idx % CURATED_STATIONS.length].image,
      genre: show.genre_affinity?.[0] || "Various",
      showData: show,
    }));
    
    // If not enough player shows, pad with mock curated stations
    const curated = curatedFromPlayer.length >= 4 
      ? curatedFromPlayer 
      : [...curatedFromPlayer, ...CURATED_STATIONS.slice(curatedFromPlayer.length)];

    // Tastemaker shows
    const tastemakerShows = shows.filter(s => s.show_tier === "tastemaker");
    const tastemakerMapped = tastemakerShows.slice(0, 5).map((show, idx) => ({
      id: show.id,
      label: (show.genre_affinity?.[0] || "TASTE").slice(0, 5).toUpperCase(),
      name: show.name,
      subtitle: show.host_name || "Tastemaker",
      image: TASTEMAKER_STATIONS[idx % TASTEMAKER_STATIONS.length].image,
      genre: show.genre_affinity?.[0] || "Various",
      showData: show,
    }));
    
    // Pad with mock tastemaker stations if needed
    const tastemaker = tastemakerMapped.length >= 3
      ? tastemakerMapped
      : [...tastemakerMapped, ...TASTEMAKER_STATIONS.slice(tastemakerMapped.length)];

    // NPC Underground shows (The Underground Network)
    const npcShows = shows.filter(s => s.is_npc && s.show_tier === "underground");
    const undergroundMapped = npcShows.slice(0, 6).map((show, idx) => ({
      id: show.id,
      label: (show.genre_affinity?.[0] || show.region?.slice(0, 4) || "UG").toUpperCase(),
      name: show.name,
      subtitle: `${show.region || "Underground"} Radio`,
      image: CURATED_STATIONS[(idx + 2) % CURATED_STATIONS.length].image,
      genre: show.genre_affinity?.[0] || "Underground",
      showData: show,
    }));

    return {
      curatedStations: curated,
      tastemakerStations: tastemaker,
      undergroundStations: undergroundMapped.length > 0 ? undergroundMapped : CURATED_STATIONS.slice(0, 4).map(s => ({ ...s, subtitle: "NPC Radio" })),
    };
  }, [shows, userRegion]);

  const activeSubmissionByShow = useMemo(() => {
    const map = new Map();
    for (const submission of submissions) {
      if (!submission?.show_id) continue;
      if (submission.status === "pending" || submission.status === "accepted") {
        map.set(submission.show_id, submission);
      }
    }
    return map;
  }, [submissions]);

  const handleStationClick = (station) => {
    if (station.showData) {
      setSelectedStation(station);
    }
  };

  const openSubmitModal = async (show) => {
    if (!artistId) return;
    setSelectedShow(show);
    setSubmitModalOpen(true);
    setSubmitResult(null);
    setSelectedReleaseId("");

    const releasesResult = await invokeEdgeFunction("soundburstRadio", {
      action: "getEligibleReleases",
      artistId,
    });

    if (!releasesResult.success) {
      setEligibleReleases([]);
      setSubmitResult({ accepted: false, outcome: releasesResult.error || "Failed to load releases" });
      return;
    }

    setEligibleReleases(releasesResult.data?.releases || []);
  };

  const submitRelease = async () => {
    if (!artistId || !selectedShow?.id || !selectedReleaseId) return;
    setSubmitLoading(true);
    setSubmitResult(null);

    const result = await invokeEdgeFunction("soundburstRadio", {
      action: "submit",
      artistId,
      showId: selectedShow.id,
      releaseId: selectedReleaseId,
    });

    setSubmitLoading(false);

    if (!result.success) {
      setSubmitResult({ accepted: false, outcome: result.error || "Submission failed" });
      return;
    }

    setSubmitResult(result.data);
    await refreshData();
  };

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
          <p className="text-sm text-red-200">{error}</p>
          <button
            onClick={refreshData}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Header + compact tab bar */}
      <div className="px-4 pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Underground Radio</h1>
            <p className="text-white/40 text-xs mt-0.5">Discover radio stations &amp; shows</p>
          </div>
          <button
            onClick={refreshData}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-300"
            aria-label="Refresh radio"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Pill tab bar */}
        <div className="flex items-center gap-1.5">
          {SUBTABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                tab === id
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5",
              ].join(" ")}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Discover carousels */}
      {tab === "discover" && (
        <>
          <RadioStationRail
            title="Curated by SoundBurst"
            stations={curatedStations}
            onStationClick={handleStationClick}
          />
          <RadioStationRail
            title="The Best of Tastemakers"
            stations={tastemakerStations}
            onStationClick={handleStationClick}
          />
          <RadioStationRail
            title="The Underground Network"
            stations={undergroundStations}
            onStationClick={handleStationClick}
          />
        </>
      )}

      {/* My Show */}
      {tab === "myShow" && (
        <div className="px-4">
          <RadioShowManagement
            artistId={artistId}
            myShow={myShow}
            unlockStatus={unlockStatus}
            onRefresh={refreshData}
          />
        </div>
      )}

      {/* My Submissions */}
      {tab === "submissions" && (
        <div className="px-4 space-y-3">
          {submissions.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-5 text-center">
              <Inbox className="w-7 h-7 text-white/20 mx-auto mb-2" />
              <p className="text-white/40 text-sm">No submissions yet.</p>
              <p className="text-white/25 text-xs mt-1">Submit your releases to radio shows from the Radio tab.</p>
            </div>
          ) : (
            submissions.map((submission) => {
              const showName = submission.soundburst_radio_shows?.name || "Unknown show";
              const releaseTitle = submission.releases?.title || "Unknown release";
              const statusClass = STATUS_STYLES[submission.status] || STATUS_STYLES.pending;
              return (
                <div key={submission.id} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-white text-sm font-semibold">{showName}</p>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${statusClass}`}>
                      {getStatusLabel(submission.status)}
                    </span>
                  </div>
                  <p className="text-white/50 text-xs">{releaseTitle}</p>
                  {submission.status === "accepted" && (
                    <p className="text-[#E8C87C] text-xs mt-1.5">
                      {formatNumber(submission.impressions_per_turn)} impressions/turn &middot; {submission.total_turns_active || 0} turns active
                    </p>
                  )}
                  {!!submission.outcome_notes && (
                    <p className="text-white/30 text-[11px] mt-1">{submission.outcome_notes}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Station Detail Sheet */}
      {selectedStation && selectedStation.showData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="w-full sm:max-w-md bg-[#17171F] border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden"
          >
            {/* Station Header Image */}
            <div className="relative h-40">
              <img
                src={selectedStation.image}
                alt={selectedStation.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#17171F] via-[#17171F]/50 to-transparent" />
              <button
                onClick={() => setSelectedStation(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 hover:bg-black/60"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-3 left-4">
                <span className="text-white text-2xl font-black tracking-wider">
                  {selectedStation.label}
                </span>
              </div>
            </div>

            {/* Station Info */}
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-white text-lg font-bold">{selectedStation.showData.name}</h3>
                <p className="text-white/50 text-sm">
                  Host: {selectedStation.showData.host_name} {selectedStation.showData.is_npc ? "(NPC)" : "(Player)"}
                </p>
              </div>

              <p className="text-white/70 text-sm">
                {selectedStation.showData.description || "Discover underground tracks on this station."}
              </p>

              <div className="flex flex-wrap gap-2">
                {(selectedStation.showData.genre_affinity || []).map((genre) => (
                  <span key={genre} className="px-2 py-1 rounded bg-white/10 text-xs text-white/70">
                    {genre}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 text-xs text-white/50">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{selectedStation.showData.schedule_label || "Schedule TBD"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{formatNumber(selectedStation.showData.listener_count)} listeners</span>
                </div>
              </div>

              {/* Submission Status or Submit Button */}
              {activeSubmissionByShow.get(selectedStation.showData.id) ? (
                <div className={`inline-flex items-center px-3 py-2 rounded-lg border text-sm ${STATUS_STYLES[activeSubmissionByShow.get(selectedStation.showData.id).status] || STATUS_STYLES.pending}`}>
                  {getStatusLabel(activeSubmissionByShow.get(selectedStation.showData.id).status)}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSelectedStation(null);
                    openSubmitModal(selectedStation.showData);
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-white/15 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  Submit Release ({selectedStation.showData.submission_cost} energy)
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Submit Modal */}
      {submitModalOpen && selectedShow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-[#17171F] border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-sm font-bold">Submit to {selectedShow.name}</h3>
              <button
                onClick={() => setSubmitModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="text-xs text-gray-300 space-y-1">
              <p>Submission cost: <span className="text-white">{selectedShow.submission_cost} energy</span></p>
              <p>Requirements: <span className="text-white">{selectedShow.min_clout} clout / {formatNumber(selectedShow.min_followers)} followers</span></p>
            </div>

            <select
              value={selectedReleaseId}
              onChange={(e) => setSelectedReleaseId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select a released track</option>
              {eligibleReleases.map((release) => (
                <option key={release.id} value={release.id}>
                  {release.title} ({release.genre || "Unknown genre"})
                </option>
              ))}
            </select>

            {submitResult && (
              <div className={`rounded-lg p-3 text-xs border ${submitResult.accepted ? "bg-[#C9A84C]/10 text-[#E8C87C] border-[#C9A84C]/30" : "bg-red-500/10 text-red-200 border-red-500/30"}`}>
                {submitResult.outcome}
                {submitResult.accepted && submitResult.impressionsPerTurn ? (
                  <span className="block mt-1">Expected airplay: {formatNumber(submitResult.impressionsPerTurn)} impressions/turn (up to 14 turns)</span>
                ) : null}
              </div>
            )}

            <button
              onClick={submitRelease}
              disabled={!selectedReleaseId || submitLoading}
              className="w-full px-4 py-2 rounded-lg bg-white/15 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
            >
              {submitLoading ? "Submitting..." : "Confirm Submission"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
