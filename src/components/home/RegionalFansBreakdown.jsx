import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, TrendingUp, Users, X, Globe, Zap, Shield, Music, Target } from "lucide-react";

const REGION_MARKET_DATA = {
  "United States": { color: "#3b82f6", emoji: "🇺🇸", desc: "The world's largest music market. High streaming penetration, strong playlist culture, and massive touring infrastructure. Trend-driven audiences with high merch spend.", strengths: ["Streaming volume", "Merch revenue", "Festival circuit"] },
  "Europe": { color: "#8b5cf6", emoji: "🇪🇺", desc: "Diverse, culturally rich market spanning dozens of countries. Strong festival scene, editorial playlist influence, and loyal fanbases that value artistry.", strengths: ["Festival culture", "Editorial playlists", "Fan loyalty"] },
  "UK": { color: "#ec4899", emoji: "🇬🇧", desc: "Tastemaker market with outsized cultural influence. Early adopters, strong underground scenes, and a press ecosystem that can break artists globally.", strengths: ["Tastemaker influence", "Underground scenes", "Press power"] },
  "Asia": { color: "#f59e0b", emoji: "🌏", desc: "Rapidly growing digital-first market. High mobile engagement, K-pop influenced fan culture, and emerging streaming platforms with unique monetization.", strengths: ["Mobile engagement", "Fan dedication", "Growth potential"] },
  "Latin America": { color: "#10b981", emoji: "🌎", desc: "Passionate, community-driven audiences. Reggaeton and Latin pop crossover potential, strong social media virality, and growing streaming adoption.", strengths: ["Social virality", "Community passion", "Crossover potential"] },
  "Africa": { color: "#f97316", emoji: "🌍", desc: "The fastest-growing music market globally. Afrobeats driving global crossover, mobile-first consumption, and untapped touring potential.", strengths: ["Fastest growth", "Afrobeats crossover", "Mobile-first"] },
  "Oceania": { color: "#06b6d4", emoji: "🌊", desc: "Tight-knit but highly engaged market. Strong live music culture, early adopters of new sounds, and loyal fanbase once established.", strengths: ["Live music culture", "Early adopters", "High engagement"] },
  "Canada": { color: "#ef4444", emoji: "🇨🇦", desc: "Bilingual market with strong indie and hip-hop scenes. Close cultural ties to the US but distinct taste. Government grants support emerging artists.", strengths: ["Indie scene", "Grant funding", "Cultural bridge"] },
};

const ARCHETYPE_INFO = {
  stans: { label: "Stans", icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10" },
  locals: { label: "Locals", icon: Music, color: "text-amber-400", bg: "bg-amber-500/10" },
  casuals: { label: "Casuals", icon: Zap, color: "text-pink-400", bg: "bg-pink-500/10" },
  critics: { label: "Critics", icon: Target, color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

const fmtBig = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n || 0);
};

export default function RegionalFansBreakdown({ fanProfile, onClose, isOpen }) {
  const totalListeners = fanProfile?.monthly_listeners || 0;
  const regionShare = fanProfile?.region_share || {};
  const topRegions = fanProfile?.top_regions || [];
  const archetypes = fanProfile?.archetypes || {};
  const totalArchetypeFans = Object.values(archetypes).reduce((s, v) => s + (v || 0), 0);

  const regions = useMemo(() => {
    const allRegionKeys = Object.keys(REGION_MARKET_DATA);
    let result = [];
    if (topRegions.length > 0) {
      result = [...topRegions];
      const existing = new Set(result.map(r => r.region));
      allRegionKeys.forEach(rk => {
        if (!existing.has(rk)) result.push({ region: rk, percentage: 0, listeners: 0 });
      });
    } else {
      result = allRegionKeys.map(region => {
        const pct = regionShare[region] || 0;
        return { region, percentage: pct, listeners: Math.round(totalListeners * (pct / 100)) };
      });
    }
    return result.sort((a, b) => b.percentage - a.percentage);
  }, [topRegions, regionShare, totalListeners]);

  const maxPct = Math.max(...regions.map(r => r.percentage || 0), 1);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[#0d0d14] border border-white/[0.08] rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600/15 via-purple-600/10 to-pink-600/15 border-b border-white/[0.06] px-5 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Global Fanbase</h2>
                <p className="text-gray-500 text-[10px]">Market breakdown & insights</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
                <Users className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <p className="text-white font-bold text-sm">{fmtBig(totalListeners)}</p>
                <p className="text-gray-500 text-[9px] uppercase tracking-wider">Monthly</p>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
                <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" />
                <p className={`font-bold text-sm ${(fanProfile?.listener_growth_trend || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(fanProfile?.listener_growth_trend || 0) > 0 ? '+' : ''}{(fanProfile?.listener_growth_trend || 0).toFixed(1)}%
                </p>
                <p className="text-gray-500 text-[9px] uppercase tracking-wider">Growth</p>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3 text-center">
                <MapPin className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-white font-bold text-sm">{regions.length}</p>
                <p className="text-gray-500 text-[9px] uppercase tracking-wider">Regions</p>
              </div>
            </div>

            {/* Regional Distribution */}
            <div>
              <h3 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-3">Market Distribution</h3>
              <div className="space-y-2.5">
                {regions.map((region, idx) => {
                  const market = REGION_MARKET_DATA[region.region] || { color: "#6b7280", emoji: "🌐", desc: "Emerging market with growth potential.", strengths: ["Growing audience"] };
                  const barWidth = (region.percentage / maxPct) * 100;
                  return (
                    <motion.div
                      key={region.region}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{market.emoji}</span>
                          <div>
                            <p className="text-white text-sm font-semibold">{region.region}</p>
                            <p className="text-gray-500 text-[10px]">
                              {fmtBig(region.listeners)} listeners
                            </p>
                          </div>
                        </div>
                        <span className="text-white text-sm font-bold" style={{ color: market.color }}>
                          {region.percentage.toFixed(1)}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden mb-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.5, delay: idx * 0.04 + 0.15 }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(to right, ${market.color}cc, ${market.color}88)` }}
                        />
                      </div>

                      {/* Market description */}
                      <p className="text-gray-400 text-[10px] leading-relaxed mb-1.5">{market.desc}</p>

                      {/* Strengths tags */}
                      <div className="flex flex-wrap gap-1">
                        {market.strengths.map(s => (
                          <span key={s} className="text-[8px] px-1.5 py-0.5 rounded-full border border-white/[0.08] text-gray-400 bg-white/[0.02]">{s}</span>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Fan Archetype Breakdown */}
            {totalArchetypeFans > 0 && (
              <div>
                <h3 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-3">Fan Archetypes</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ARCHETYPE_INFO).map(([key, info]) => {
                    const count = archetypes[key] || 0;
                    const pct = totalArchetypeFans > 0 ? ((count / totalArchetypeFans) * 100).toFixed(0) : 0;

                    const Icon = info.icon;
                    return (
                      <div key={key} className={`${info.bg} border border-white/[0.05] rounded-xl p-2.5`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={`w-3 h-3 ${info.color}`} />
                          <span className="text-[10px] text-gray-300 font-medium">{info.label}</span>
                        </div>
                        <div className="flex items-end justify-between">
                          <span className="text-white text-sm font-bold">{pct}%</span>
                          <span className="text-gray-500 text-[9px]">{count.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Retention */}
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Fan Retention Rate</p>
                <p className="text-white text-sm font-bold">
                  {Math.min(100, ((fanProfile?.retention_rate || 0) * 100)).toFixed(0)}%
                </p>
              </div>
              <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (fanProfile?.retention_rate || 0) * 100)}%` }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                />
              </div>
              <p className="text-gray-500 text-[9px] mt-1.5">
                {(fanProfile?.retention_rate || 0) >= 0.7 ? "Excellent retention — your fans are loyal and keep coming back." :
                 (fanProfile?.retention_rate || 0) >= 0.4 ? "Moderate retention — focus on consistent releases to keep fans engaged." :
                 "Low retention — consider targeted content and community building in your strongest regions."}
              </p>
            </div>

            {/* Strategic insight */}
            <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/10 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-400 text-[10px] leading-relaxed">
                  {regions.length > 0 
                    ? `Your strongest market is ${regions[0]?.region} at ${regions[0]?.percentage?.toFixed(0)}%. ${regions.length > 1 ? `Consider touring in ${regions[1]?.region} to grow your second-largest audience.` : 'Expand to new regions through platform playlists and social media.'}`
                    : "Release music and engage on social platforms to start building your regional fanbase."}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}