import React, { useState, useEffect, useMemo } from "react";
import { X, Search, Music, Disc3, Shield, AlertTriangle, Zap, Crown, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

const TIER_CONFIG = {
  common:    { label: "Common",    color: "#9ca3af", icon: Disc3,         costLabel: "Low",    riskLabel: "Low" },
  rare:      { label: "Rare",      color: "#60a5fa", icon: Sparkles,      costLabel: "Medium", riskLabel: "Medium" },
  legendary: { label: "Legendary", color: "#f59e0b", icon: Crown,         costLabel: "High",   riskLabel: "High" },
  viral:     { label: "Viral",     color: "#34d399", icon: Zap,           costLabel: "Free",   riskLabel: "Very Low" },
};

const STRATEGY_INFO = {
  direct:         { label: "Direct Clearance",  icon: Shield,         color: "#34d399", desc: "Full cost, legal & safe. 1-3 turns.", costMult: 1.0 },
  underground:    { label: "Underground",       icon: AlertTriangle,  color: "#f59e0b", desc: "Half cost, may fail → flips to unlicensed.", costMult: 0.5 },
  anonymous_flip: { label: "Anonymous Flip",    icon: Lock,           color: "#ef4444", desc: "Free, but high controversy risk if caught.", costMult: 0 },
};

const SAMPLE_ROYALTY_BY_TIER = {
  common: 0.05,
  viral: 0.1,
  rare: 0.1,
  legendary: 0.15,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const computeArtistSizeScore = (clout, followers, lifetimeStreams) => clamp(
  Math.round(
    Math.min(45, (Number(clout) || 0) / 40)
    + Math.min(30, (Number(followers) || 0) / 50000)
    + Math.min(25, (Number(lifetimeStreams) || 0) / 200000)
  ),
  0,
  100,
);

const derivePlayerSampleTier = ({ quality, valuation, artistSizeScore, lifetimeStreams }) => {
  const qualityScore = Number(quality) || 0;
  const valuationScore = Number(valuation) || 0;
  const artistScale = Number(artistSizeScore) || 0;
  const streamScore = Number(lifetimeStreams) || 0;
  const compressedQualityScore = Math.min(34, Math.max(0, (qualityScore - 58) * 0.8));
  const valuationWeight = Math.min(16, valuationScore / 250);
  const artistScaleWeight = Math.min(8, artistScale / 4.5);
  const streamWeight = Math.min(10, streamScore / 450000);
  const score = compressedQualityScore + valuationWeight + artistScaleWeight + streamWeight;

  const isLegendary = qualityScore >= 97
    && valuationScore >= 22000
    && streamScore >= 5000000
    && artistScale >= 28
    && score >= 58;

  if (isLegendary) return "legendary";
  if (score >= 43 || (qualityScore >= 90 && (valuationScore >= 5000 || streamScore >= 700000))) return "rare";
  if (score >= 29 || (qualityScore >= 78 && (valuationScore >= 1400 || streamScore >= 140000))) return "viral";
  return "common";
};

const buildPlayerSongSamplingProfile = ({ artistName, genre, quality, valuation, lifetimeStreams, artistSizeScore }) => {
  const tier = derivePlayerSampleTier({ quality, valuation, artistSizeScore, lifetimeStreams });
  const tierRiskBase = { common: 10, viral: 16, rare: 24, legendary: 34 }[tier];
  const tierQualityBoost = { common: 4, viral: 6, rare: 8, legendary: 12 }[tier];
  const tierCloutBoost = { common: 2, viral: 4, rare: 7, legendary: 11 }[tier];
  return {
    tier,
    base_cost: Math.max(50, Math.round(Number(valuation) || 0)),
    controversy_risk: clamp(Math.round(tierRiskBase + (artistSizeScore * 0.45)), 8, 92),
    quality_boost: tierQualityBoost,
    clout_boost: tierCloutBoost,
    description: `Released track by ${artistName} · ${genre} · Q${quality}`,
    royalty_rate: SAMPLE_ROYALTY_BY_TIER[tier],
  };
};

export default function SamplePicker({ onSelect, onClose, profile }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [tierFilter, setTierFilter] = useState("all");

  useEffect(() => {
    loadSources();
  }, [profile?.id]);

  const loadSources = async () => {
    try {
      const [{ data }, { data: songsData, error: songsError }] = await Promise.all([
        supabaseClient
          .from("sample_sources")
          .select("*")
          .eq("is_active", true)
          .order("tier", { ascending: true }),
        profile?.id
          ? supabaseClient
              .from("songs")
              .select("id, title, artist_id, genre, quality, release_status, status, release_id, is_sampleable, is_remix")
              .neq("artist_id", profile.id)
              .eq("release_status", "released")
              .eq("is_remix", false)
              .order("created_at", { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (songsError) throw songsError;

      const npcSources = (data || []).map((source) => ({
        ...source,
        source_type: source.source_type || "npc",
      }));

      const releasedSongs = (songsData || []).filter((song) => !song.is_remix && (song.release_status === "released" || song.status === "released" || !!song.release_id));
      const sampleableSongs = releasedSongs.filter((song) => song.is_sampleable);
      const songsToUse = sampleableSongs.length > 0 ? sampleableSongs : releasedSongs;

      const artistIds = [...new Set(songsToUse.map((song) => song.artist_id).filter(Boolean))];
      const releaseIds = [...new Set(songsToUse.map((song) => song.release_id).filter(Boolean))];

      const [{ data: artistProfiles }, { data: releases }] = await Promise.all([
        artistIds.length
          ? supabaseClient.from("profiles").select("id, artist_name, clout, followers").in("id", artistIds)
          : Promise.resolve({ data: [] }),
        releaseIds.length
          ? supabaseClient.from("releases").select("id, lifetime_streams").in("id", releaseIds)
          : Promise.resolve({ data: [] }),
      ]);

      const artistProfileMap = {};
      (artistProfiles || []).forEach((item) => {
        artistProfileMap[item.id] = item;
      });

      const releaseMap = {};
      (releases || []).forEach((item) => {
        releaseMap[item.id] = item;
      });

      const playerSongSources = songsToUse.map((song) => {
        const artistProfile = artistProfileMap[song.artist_id] || {};
        const lifetimeStreams = Number(releaseMap[song.release_id]?.lifetime_streams) || 0;
        const quality = Number(song.quality) || 0;
        const valuation = Math.max(100, Math.floor(quality * Math.max(lifetimeStreams, 200) * 0.0005));
        const artistSizeScore = computeArtistSizeScore(artistProfile.clout, artistProfile.followers, lifetimeStreams);
        const samplingProfile = buildPlayerSongSamplingProfile({
          artistName: artistProfile.artist_name || "Unknown Artist",
          genre: song.genre || "Music",
          quality,
          valuation,
          lifetimeStreams,
          artistSizeScore,
        });

        return {
          id: song.id,
          source_song_id: song.id,
          source_type: "player_song",
          name: song.title || "Untitled",
          artist_name: artistProfile.artist_name || "Unknown Artist",
          genre: song.genre || "Music",
          quality,
          artist_size_score: artistSizeScore,
          valuation,
          is_active: true,
          ...samplingProfile,
        };
      });

      setSources([...playerSongSources, ...npcSources]);
    } catch (e) {
      console.error("[SamplePicker] Failed to load sources:", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = sources;
    if (tierFilter !== "all") list = list.filter(s => s.tier === tierFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.artist_name.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sources, tierFilter, searchQuery]);

  const handleConfirm = () => {
    if (!selectedSource || !selectedStrategy) return;
    const strat = STRATEGY_INFO[selectedStrategy];
    const cost = Math.floor(selectedSource.base_cost * strat.costMult);
    const controversyChance = selectedStrategy === "anonymous_flip"
      ? selectedSource.controversy_risk
      : selectedStrategy === "underground"
        ? Math.floor(selectedSource.controversy_risk * 0.65)
        : 0;

    onSelect({
      sampleSource: selectedSource,
      strategy: selectedStrategy,
      cost,
      qualityBoost: selectedSource.quality_boost,
      cloutBoost: selectedSource.clout_boost,
      controversyChance,
      sourceType: selectedSource.source_type || "npc",
      sampledPlayerSongId: selectedSource.source_song_id || null,
      royaltyRate: selectedSource.royalty_rate || 0,
      tier: selectedSource.tier || "common",
    });
  };

  const cash = profile?.cash_balance || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-3 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden max-h-[min(700px,88vh)] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white text-sm font-bold">Add Sample</h2>
              <p className="text-white/85 text-[10px]">Choose a sample source for your song</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center">
            <X size={14} className="text-white/40" />
          </button>
        </div>

        {/* Search + Tier Filter */}
        <div className="px-4 py-2 border-b border-white/[0.06] flex-shrink-0 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, artist, or genre..."
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-white text-sm outline-none placeholder:text-white/20"
            />
          </div>
          <div className="flex gap-1.5">
            {["all", "viral", "common", "rare", "legendary"].map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                  tierFilter === t
                    ? "bg-white/10 border-white/20 text-white"
                    : "border-white/[0.06] text-white/80 hover:text-white"
                }`}
              >
                {t === "all" ? "All" : TIER_CONFIG[t]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5" style={{ scrollbarWidth: "none" }}>
          {loading ? (
            <div className="py-8 text-center text-white/85 text-sm">Loading samples...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-white/85 text-sm">No samples found</div>
          ) : (
            filtered.map(source => {
              const tier = TIER_CONFIG[source.tier] || TIER_CONFIG.common;
              const TierIcon = tier.icon;
              const isSelected = selectedSource?.id === source.id;
              return (
                <button
                  key={source.id}
                  onClick={() => { setSelectedSource(source); setSelectedStrategy(null); }}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tier.color + "15" }}>
                      <TierIcon size={14} style={{ color: tier.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-xs font-semibold truncate">{source.name}</p>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full border font-bold" style={{ color: tier.color, borderColor: tier.color + "40", background: tier.color + "10" }}>
                          {tier.label}
                        </span>
                      </div>
                      <p className="text-white/85 text-[10px]">{source.artist_name} · {source.genre}{source.source_type === "player_song" ? " · Released Track" : ""}</p>
                      <p className="text-white/80 text-[9px] mt-0.5">{source.description}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[9px] text-white/85">💰 ${source.base_cost.toLocaleString()}</span>
                        <span className="text-[9px] text-white/85">🎵 +{source.quality_boost} quality</span>
                        <span className="text-[9px] text-white/85">⚡ +{source.clout_boost} clout</span>
                        {source.hype_boost > 0 && <span className="text-[9px] text-amber-300">🔥 +{source.hype_boost} hype</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Strategy Selection (shows after picking a source) */}
        <AnimatePresence>
          {selectedSource && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/[0.06] px-4 py-3 flex-shrink-0 overflow-hidden"
            >
              <p className="text-white/90 text-[10px] uppercase tracking-widest mb-2">Clearance Strategy</p>
              <div className="space-y-1.5">
                {Object.entries(STRATEGY_INFO).map(([key, strat]) => {
                  const StratIcon = strat.icon;
                  const cost = Math.floor(selectedSource.base_cost * strat.costMult);
                  const canAfford = cash >= cost;
                  const isActive = selectedStrategy === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedStrategy(key)}
                      disabled={!canAfford && cost > 0}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-3 ${
                        isActive
                          ? "border-amber-500/30 bg-amber-500/5"
                          : canAfford || cost === 0
                            ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                            : "border-white/[0.04] bg-white/[0.01] opacity-40"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: strat.color + "15" }}>
                        <StratIcon size={12} style={{ color: strat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[11px] font-semibold">{strat.label}</p>
                        <p className="text-white/80 text-[9px]">{strat.desc}</p>
                        {selectedSource.source_type === "player_song" && (
                          <p className="text-white/70 text-[8px] mt-0.5">
                            Risk scales with artist size and {selectedSource.tier || "sample"} tier.
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-white text-[10px] font-bold">
                          {cost > 0 ? `$${cost.toLocaleString()}` : "Free"}
                        </p>
                        {!canAfford && cost > 0 && (
                          <p className="text-red-400 text-[8px]">Can't afford</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button
                onClick={handleConfirm}
                disabled={!selectedStrategy}
                className="w-full mt-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl h-10 text-sm font-semibold disabled:opacity-30"
              >
                Confirm Sample
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
