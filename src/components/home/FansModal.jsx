import React from "react";
import { X, MapPin, Heart, TrendingUp, TrendingDown, Users } from "lucide-react";
import { motion } from "framer-motion";
import ModalContainer from "@/components/layout/ModalContainer";

const ALL_REGIONS = [
  "United States", "UK", "Europe", "Canada", "Asia", "Latin America", "Africa", "Oceania"
];

const DEFAULT_REGIONS = {
  "United States": 30,
  "UK": 8,
  "Europe": 25,
  "Canada": 5,
  "Asia": 15,
  "Latin America": 8,
  "Africa": 5,
  "Oceania": 4,
};

const REGION_COLORS = {
  "United States": "bg-blue-500",
  "UK": "bg-pink-500",
  "Europe": "bg-purple-500",
  "Canada": "bg-red-500",
  "Asia": "bg-amber-500",
  "Latin America": "bg-green-500",
  "Africa": "bg-orange-500",
  "Oceania": "bg-cyan-500",
};

const SENTIMENT_LABELS = [
  { min: 80, label: "Adoring", emoji: "😍", color: "text-pink-400" },
  { min: 60, label: "Loyal", emoji: "❤️", color: "text-red-400" },
  { min: 40, label: "Curious", emoji: "🤔", color: "text-amber-400" },
  { min: 20, label: "Lukewarm", emoji: "😐", color: "text-gray-400" },
  { min: 0, label: "Indifferent", emoji: "💤", color: "text-gray-500" },
];

function getSentiment(hype, followers) {
  const score = Math.min(100, (hype || 30) + Math.min(30, (followers || 0) / 500));
  return SENTIMENT_LABELS.find(s => score >= s.min) || SENTIMENT_LABELS[SENTIMENT_LABELS.length - 1];
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

export default function FansModal({ onClose, profile, fanProfile }) {
  // Merge fan_profiles region_share with all known regions so none are missing
  const rawRegionData = fanProfile?.region_share || DEFAULT_REGIONS;
  const regionData = {};
  for (const r of ALL_REGIONS) {
    regionData[r] = rawRegionData[r] || 0;
  }
  // Also include any extra regions from the data that aren't in ALL_REGIONS
  for (const [r, v] of Object.entries(rawRegionData)) {
    if (!(r in regionData)) regionData[r] = v;
  }
  const regions = Object.entries(regionData).sort((a, b) => b[1] - a[1]);
  const totalFollowers = profile?.followers || 100;
  const sentiment = getSentiment(profile?.hype, totalFollowers);
  const monthlyListeners = fanProfile?.monthly_listeners || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <ModalContainer onClose={onClose} className="" contentClassName="p-5">
        <motion.div
          initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }}
          transition={{ type: "spring", damping: 28 }}
        >
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-white font-bold text-lg">Your Fanbase</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
            <Users className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <p className="text-white text-sm font-bold">{formatNum(totalFollowers)}</p>
            <p className="text-gray-500 text-[8px] uppercase tracking-wider">Fans</p>
          </div>
          <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
            <Heart className="w-4 h-4 text-pink-400 mx-auto mb-1" />
            <p className="text-white text-sm font-bold">{formatNum(monthlyListeners)}</p>
            <p className="text-gray-500 text-[8px] uppercase tracking-wider">Monthly</p>
          </div>
          <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
            {(() => {
              const rawG = profile?.fan_growth;
              const g = typeof rawG === 'number' ? rawG : parseFloat(rawG) || 0;
              const isNeg = g < 0;
              const color = isNeg ? "text-red-400" : g === 0 ? "text-gray-400" : "text-green-400";
              const Icon = isNeg ? TrendingDown : TrendingUp;
              return <>
                <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                <p className={`${color} text-sm font-bold`}>{isNeg ? "" : "+"}{g.toFixed(2)}%</p>
              </>;
            })()}
            <p className="text-gray-500 text-[8px] uppercase tracking-wider">Fan Growth</p>
          </div>
        </div>

        {/* Sentiment */}
        <div className="bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-white/[0.06] rounded-xl p-3 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-0.5">Fan Sentiment</p>
              <p className={`text-base font-bold ${sentiment.color}`}>
                {sentiment.emoji} {sentiment.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-0.5">Hype Level</p>
              <p className="text-white text-base font-bold">{profile?.hype || 30}%</p>
            </div>
          </div>
        </div>

        {/* Fan Archetypes */}
        {fanProfile?.archetypes && (fanProfile.archetypes.stans > 0 || fanProfile.archetypes.casuals > 0) && (
          <div className="mb-5">
            <p className="text-gray-400 text-[9px] uppercase tracking-wider mb-3 font-semibold">Fan Archetypes</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Stans", value: Math.round((fanProfile.archetypes.stans || 0) * 100), emoji: "🔥", color: "text-red-400", bg: "bg-red-500" },
                { label: "Locals", value: Math.round((fanProfile.archetypes.locals || 0) * 100), emoji: "💎", color: "text-blue-400", bg: "bg-blue-500" },
                { label: "Casual", value: Math.round((fanProfile.archetypes.casuals || 0) * 100), emoji: "🎧", color: "text-purple-400", bg: "bg-purple-500" },
                { label: "Critics", value: Math.round((fanProfile.archetypes.critics || 0) * 100), emoji: "⚡", color: "text-amber-400", bg: "bg-amber-500" },
              ].map((arch) => (
                <div key={arch.label} className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-2 text-center">
                  <span className="text-sm">{arch.emoji}</span>
                  <p className={`${arch.color} text-sm font-bold`}>{arch.value}%</p>
                  <p className="text-gray-500 text-[8px] uppercase tracking-wider">{arch.label}</p>
                </div>
              ))}
            </div>
            {/* Archetype bar */}
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex mt-2">
              {[
                { value: Math.round((fanProfile.archetypes.stans || 0) * 100), color: "bg-red-500" },
                { value: Math.round((fanProfile.archetypes.locals || 0) * 100), color: "bg-blue-500" },
                { value: Math.round((fanProfile.archetypes.casuals || 0) * 100), color: "bg-purple-500" },
                { value: Math.round((fanProfile.archetypes.critics || 0) * 100), color: "bg-amber-500" },
              ].map((seg, i) => (
                <div key={i} className={`h-full ${seg.color}`} style={{ width: `${seg.value}%` }} />
              ))}
            </div>
          </div>
        )}

        {/* Regional Distribution */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Regional Spread</p>
          </div>

          {/* Bar visualization */}
          <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden flex mb-3">
            {regions.map(([region, pct]) => (
              <div
                key={region}
                className={`h-full ${REGION_COLORS[region] || "bg-gray-500"} first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${pct}%` }}
              />
            ))}
          </div>

          <div className="space-y-2">
            {regions.map(([region, pct]) => {
              const fans = Math.floor(totalFollowers * (pct / 100));
              return (
                <div key={region} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${REGION_COLORS[region] || "bg-gray-500"}`} />
                    <span className="text-gray-300 text-xs">{region}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-[10px]">{formatNum(fans)} fans</span>
                    <span className="text-white text-xs font-semibold w-10 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tip */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mt-3">
          <p className="text-gray-500 text-[10px] leading-relaxed">
            {(profile?.hype || 0) > 60
              ? "Your fans are highly engaged! Consider touring in your top regions to capitalize on momentum."
              : "Post more social content and release music to grow your fanbase across new regions."}
          </p>
        </div>
        </motion.div>
      </ModalContainer>
    </motion.div>
  );
}
