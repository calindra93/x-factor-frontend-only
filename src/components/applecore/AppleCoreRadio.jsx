import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Radio, Music, Lock, CheckCircle, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fmt } from "@/utils/numberFormat";

const ON_AIR_STATIONS = [
  { id: "ac-1", name: "1", tagline: "AppleCore\nMusic Radio", color: "bg-red-600", textColor: "text-white", minClout: 0, minFollowers: 0, streamBoost: 1.5, hypeBoost: 3, listenerReach: 10000, energyCost: 5 },
  { id: "ac-hits", name: "HITS\nHITS\nHITS", tagline: "AppleCore\nMusic Radio", color: "bg-sky-500", textColor: "text-white", minClout: 30, minFollowers: 500, streamBoost: 2.0, hypeBoost: 5, listenerReach: 25000, energyCost: 8 },
  { id: "ac-hiphop", name: "HIP\nHOP", tagline: "AppleCore\nMusic Radio", color: "bg-purple-600", textColor: "text-white", minClout: 60, minFollowers: 1500, streamBoost: 2.5, hypeBoost: 6, listenerReach: 40000, energyCost: 10 },
  { id: "ac-rnb", name: "R&B\nSOUL", tagline: "AppleCore\nMusic Radio", color: "bg-rose-500", textColor: "text-white", minClout: 80, minFollowers: 2000, streamBoost: 2.8, hypeBoost: 7, listenerReach: 50000, energyCost: 12 },
  { id: "ac-club", name: "Club", tagline: "AppleCore\nMusic Radio", color: "bg-neutral-800", textColor: "text-white", minClout: 100, minFollowers: 3000, streamBoost: 3.0, hypeBoost: 8, listenerReach: 60000, energyCost: 14 },
  { id: "ac-chill", name: "Chill", tagline: "AppleCore\nMusic Radio", color: "bg-teal-500", textColor: "text-white", minClout: 40, minFollowers: 800, streamBoost: 1.8, hypeBoost: 4, listenerReach: 20000, energyCost: 7 },
];

const TAKEOVER_SLOTS = [
  { id: "takeover-1", title: "Radio Takeover", description: "Host your own show on AppleCore Radio", minClout: 150, minFollowers: 5000, streamBoost: 4.0, hypeBoost: 12, listenerReach: 150000, energyCost: 20 },
  { id: "takeover-2", title: "Guest Feature", description: "Be featured on a top DJ's radio show", minClout: 200, minFollowers: 8000, streamBoost: 5.0, hypeBoost: 15, listenerReach: 250000, energyCost: 25 },
];


export default function AppleCoreRadio({ profile, releases }) {
  const [submitting, setSubmitting] = useState(null);
  const [submitted, setSubmitted] = useState({});
  const [selectedSong, setSelectedSong] = useState(null);
  const [topArtists, setTopArtists] = useState([]);

  useEffect(() => {
    const loadArtists = async () => {
      try {
        const all = await base44.entities.ArtistProfile.list();
        const sorted = [...all].sort((a, b) => (b.clout || 0) - (a.clout || 0)).slice(0, 8);
        setTopArtists(sorted);
      } catch (e) { console.error("[AppleCoreRadio] Load artists error:", e); }
    };
    loadArtists();
  }, []);

  const eligibleReleases = useMemo(() => {
    if (!releases || !Array.isArray(releases)) return [];
    return releases.filter((r) =>
      r.lifecycle_state === "Hot" || r.lifecycle_state === "Trending" ||
      r.lifecycle_state === "Momentum" || r.lifecycle_state === "Stable"
    );
  }, [releases]);

  const handleSubmit = async (station) => {
    if (!profile?.id || !selectedSong || submitting) return;
    if ((profile.energy || 0) < station.energyCost) return;
    setSubmitting(station.id);
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'submitToRadioStation',
        artistId: profile.id,
        stationId: station.id,
        releaseId: selectedSong.id,
        energyCost: station.energyCost,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      const gains = result.gains || {};
      setSubmitted((prev) => ({
        ...prev,
        [station.id]: {
          songName: selectedSong.release_name || selectedSong.title,
          streams: gains.streams || 0,
          followers: gains.followers || 0,
          revenue: gains.revenue || 0,
        }
      }));
      setSelectedSong(null);
    } catch (e) {
      console.error("[AppleCoreRadio] Submit error:", e);
    } finally {
      setSubmitting(null);
    }
  };

  const isLocked = (station) => (profile?.clout || 0) < station.minClout || (profile?.followers || 0) < station.minFollowers;
  const canAfford = (station) => (profile?.energy || 0) >= station.energyCost;

  return (
    <div className="pb-4 space-y-6">
      {/* Header */}
      <div className="px-4 pt-2">
        <h1 className="text-2xl font-bold text-white">Radio</h1>
      </div>

      {/* Select Release */}
      {eligibleReleases.length > 0 && (
        <div className="px-4">
          <p className="text-white/50 text-[10px] uppercase tracking-wider font-semibold mb-2">Select a release to submit</p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {eligibleReleases.map((release) => (
              <button key={release.id} onClick={() => setSelectedSong(selectedSong?.id === release.id ? null : release)}
                className={`flex-shrink-0 rounded-xl border p-2 text-left transition-all ${selectedSong?.id === release.id ? "border-rose-500/50 bg-rose-500/10" : "border-white/[0.06] bg-white/[0.03]"}`}>
                <div className="flex items-center gap-2">
                  {release.cover_artwork_url ? <img src={release.cover_artwork_url} alt="" className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center"><Music className="w-3.5 h-3.5 text-white/40" /></div>}
                  <div>
                    <p className="text-white text-[10px] font-semibold truncate max-w-[100px]">{release.release_name || release.title}</p>
                    <p className="text-white/40 text-[8px]">{release.lifecycle_state}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {eligibleReleases.length === 0 && (
        <div className="mx-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
          <Music className="w-6 h-6 text-white/30 mx-auto mb-2" />
          <p className="text-white/50 text-xs">No eligible releases</p>
          <p className="text-white/30 text-[10px] mt-1">Release music first to submit to radio stations</p>
        </div>
      )}

      {/* On Air Now — branded station cards matching Apple Music Radio */}
      <section>
        <div className="px-4 mb-3">
          <h2 className="text-lg font-bold text-white">On Air Now</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
          {ON_AIR_STATIONS.map((station) => {
            const locked = isLocked(station);
            const isSubmitted = !!submitted[station.id];
            const canSubmit = !locked && selectedSong && canAfford(station) && !isSubmitted;

            return (
              <motion.button
                key={station.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => canSubmit && handleSubmit(station)}
                disabled={!canSubmit && !locked}
                className={`flex-shrink-0 w-[140px] rounded-2xl overflow-hidden relative ${locked ? "opacity-50" : ""}`}
              >
                <div className={`${station.color} w-full aspect-square flex flex-col items-center justify-center p-3 relative`}>
                  {locked && <Lock className="absolute top-2 right-2 w-3.5 h-3.5 text-white/60" />}
                  {isSubmitted && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-emerald-300" />}
                  <p className={`text-xl font-black ${station.textColor} text-center leading-tight whitespace-pre-line`}>{station.name}</p>
                </div>
                <div className="bg-white/[0.04] px-2 py-2">
                  <div className="flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 text-rose-400" />
                    <span className="text-[8px] text-rose-400 font-semibold">AppleCore</span>
                    <span className="text-[8px] text-white/40">Radio</span>
                  </div>
                  {isSubmitted ? (
                    <p className="text-emerald-400 text-[9px] font-semibold mt-1 truncate">+{fmt(submitted[station.id].streams)} streams</p>
                  ) : (
                    <p className="text-white/30 text-[9px] mt-1">{fmt(station.listenerReach)} reach • {station.energyCost}⚡</p>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Artists Take Over — horizontal scroll of top artists */}
      <section>
        <div className="flex items-center gap-1 px-4 mb-3">
          <h2 className="text-lg font-bold text-white">Artists Take Over</h2>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
          {topArtists.map((artist) => (
            <div key={artist.id} className="flex-shrink-0 w-[160px]">
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-white/5 relative mb-2">
                {artist.artist_image ? (
                  <img src={artist.artist_image} alt={artist.artist_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-600/40 to-purple-600/40 text-3xl font-bold text-white/30">
                    {artist.artist_name?.[0] || "?"}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <p className="text-white text-xs font-bold leading-tight">{artist.artist_name}</p>
                  <p className="text-white/60 text-[9px]">Radio Takeover</p>
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/40 rounded px-1 py-0.5">
                  <Radio className="w-2 h-2 text-rose-400" />
                  <span className="text-[7px] text-white/70 font-medium">Music</span>
                </div>
              </div>
              <p className="text-[10px] text-white/40 leading-snug line-clamp-2">
                {artist.artist_name} takes over the airwaves with their latest hits
              </p>
            </div>
          ))}
          {topArtists.length === 0 && (
            <p className="text-white/30 text-xs">No artists available yet</p>
          )}
        </div>
      </section>

      {/* Takeover Slots — premium radio actions */}
      <section className="px-4 space-y-3">
        <h2 className="text-lg font-bold text-white">Your Radio</h2>
        {TAKEOVER_SLOTS.map((slot) => {
          const locked = isLocked(slot);
          const isSubmitted = !!submitted[slot.id];
          const canSubmit = !locked && selectedSong && canAfford(slot) && !isSubmitted;

          return (
            <div key={slot.id} className={`rounded-xl border p-3 transition-all ${locked ? "border-white/[0.04] opacity-50" : isSubmitted ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-white/[0.08] bg-white/[0.03]"}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-sm">{slot.title}</h3>
                  {locked && <Lock className="w-3 h-3 text-white/40" />}
                  {isSubmitted && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <span className="text-white/30 text-[9px]">{slot.energyCost}⚡ • {fmt(slot.listenerReach)} reach</span>
              </div>
              <p className="text-white/50 text-[10px] mb-2">{slot.description}</p>

              {isSubmitted ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                  <p className="text-emerald-400 text-[10px] font-semibold">"{submitted[slot.id].songName}" is on air!</p>
                  <p className="text-white/50 text-[9px] mt-0.5">+{fmt(submitted[slot.id].streams)} streams • +{submitted[slot.id].followers} fans • +${fmt(submitted[slot.id].revenue)}</p>
                </div>
              ) : locked ? (
                <p className="text-white/30 text-[9px]">Requires {slot.minClout} clout & {slot.minFollowers.toLocaleString()} followers</p>
              ) : (
                <button onClick={() => canSubmit && handleSubmit(slot)} disabled={!canSubmit}
                  className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${canSubmit ? "bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 active:scale-[0.98]" : "bg-white/[0.03] border border-white/[0.04] text-white/30 cursor-not-allowed"}`}>
                  {submitting === slot.id ? "Submitting..." : !selectedSong ? "Select a release first" : !canAfford(slot) ? `Need ${slot.energyCost} energy` : `Submit to ${slot.title}`}
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
