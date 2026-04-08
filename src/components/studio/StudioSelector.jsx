import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Building2, Star, Sparkles, TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { normalizeRegion } from "@/lib/regionConstants";

const getTierColor = (tier) => {
  const colors = {
    0: "text-gray-500 bg-gray-500/10 border-gray-500/20", // Gutter
    1: "text-blue-400 bg-blue-400/10 border-blue-400/20", // Indie
    2: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20", // Sub-Standard
    3: "text-green-400 bg-green-400/10 border-green-400/20", // Standard
    4: "text-purple-400 bg-purple-400/10 border-purple-400/20", // Professional
    5: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", // Legendary
  };
  return colors[tier] || colors[3];
};

export default function StudioSelector({ onSelect, onClose, playerRegion, playerGenre }) {
  const [studios, setStudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studioRegion, setStudioRegion] = useState("");

  useEffect(() => {
    loadStudios();
  }, []);

  const loadStudios = async () => {
    try {
      const allStudios = await base44.entities.Studio.list();
      const normalizedStudios = Array.isArray(allStudios) ? allStudios : [];
      
      // Map player's region to canonical studio region and filter
      const mappedRegion = normalizeRegion(playerRegion) || playerRegion;
      setStudioRegion(mappedRegion);
      const regionStudios = normalizedStudios.filter(s => s.region === mappedRegion);
      
      setStudios(regionStudios);
    } catch (error) {
      console.error("[StudioSelector] Failed to load studios:", error);
      setStudios([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
      >
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 max-w-md w-full max-h-[var(--app-usable-height)] overflow-y-auto nested-scroll custom-scrollbar"
      >
        <div className="mb-4">
          <h3 className="text-white font-semibold text-lg">Select Studio</h3>
          <p className="text-gray-500 text-xs mt-1">Studios in {studioRegion}</p>
        </div>
        
        <div className="space-y-3">
          {studios.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No studios available in your region</p>
              <p className="text-gray-600 text-xs mt-1">Travel to unlock more studios</p>
            </div>
          ) : (
            studios.map((studio) => {
              const hasGenreBonus = studio.genre_bonuses?.includes(playerGenre);
              const tierColor = getTierColor(studio.tier);
              
              return (
                <button
                  key={studio.id}
                  onClick={() => onSelect(studio.id)}
                  className={`w-full bg-white/[0.04] border rounded-xl p-4 text-left transition-all ${
                    hasGenreBonus ? "border-red-500/30 bg-red-500/5" : "border-white/[0.06] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 border ${tierColor}`}>
                      {studio.tier === 5 ? (
                        <Sparkles className="w-5 h-5" />
                      ) : studio.tier >= 4 ? (
                        <Zap className="w-5 h-5" />
                      ) : (
                        <Building2 className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium text-sm">{studio.name}</h4>
                        {hasGenreBonus && (
                          <div className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] text-red-400">
                            GENRE BONUS
                          </div>
                        )}
                      </div>
                      
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium mb-2 border ${tierColor}`}>
                        {studio.tier >= 4 && <Star className="w-3 h-3" />}
                        {studio.tier_name}
                      </div>
                      
                      <p className="text-gray-500 text-[10px] mb-2 line-clamp-1">{studio.cultural_flavor}</p>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="text-gray-400">
                          Quality: <span className="text-white">{studio.quality_floor}-{studio.quality_ceiling}</span>
                        </div>
                        <div className="text-gray-400">
                          Virality: <span className="text-green-400">+{studio.virality_modifier}%</span>
                        </div>
                        <div className="text-gray-400">
                          Streaming: <span className="text-blue-400">x{studio.streaming_multiplier}</span>
                        </div>
                        <div className="text-gray-400">
                          Cost: <span className="text-yellow-400">${studio.cost_per_song}</span>
                        </div>
                      </div>
                      
                      {studio.special_flag && (
                        <div className="mt-2 flex items-center gap-1 text-yellow-400 text-[10px]">
                          <TrendingUp className="w-3 h-3" />
                          {studio.special_flag}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <Button
          variant="outline"
          onClick={onClose}
          className="w-full mt-4 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-lg h-10"
        >
          Cancel
        </Button>
      </motion.div>
    </motion.div>
  );
}
