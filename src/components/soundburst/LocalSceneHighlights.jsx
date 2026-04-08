import React, { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Zap, Music, Users } from "lucide-react";
import { LOCAL_SCENE_HIGHLIGHTS } from "./soundburstData";

export default function LocalSceneHighlights({ onSelectRegion }) {
  const [selectedRegion, setSelectedRegion] = useState(null);

  const handleSelectRegion = (region) => {
    setSelectedRegion(region);
    onSelectRegion?.(region);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <MapPin className="w-5 h-5 text-blue-400" />
        <h2 className="text-white text-sm font-bold">Local Scene Highlights</h2>
      </div>

      <div className="grid gap-3">
        {LOCAL_SCENE_HIGHLIGHTS.map((highlight) => (
          <motion.button
            key={highlight.region}
            onClick={() => handleSelectRegion(highlight.region)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-left rounded-lg p-4 border transition-all ${
              selectedRegion === highlight.region
                ? "bg-blue-600/20 border-blue-500/40"
                : "bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.04]"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📍</span>
                <h3 className="text-white font-bold text-sm">{highlight.region}</h3>
              </div>
              <Zap className="w-3 h-3 text-yellow-400" />
            </div>

            <p className="text-gray-300 text-xs mb-3 italic">"{highlight.vibe}"</p>

            <div className="space-y-2 text-[10px]">
              <div className="flex items-center gap-2">
                <Music className="w-3 h-3 text-gray-500" />
                <span className="text-gray-400">
                  <span className="text-gray-500">Scene lead:</span> {highlight.sceneLead}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-gray-500" />
                <span className="text-gray-400">
                  <span className="text-gray-500">Spotlight:</span> {highlight.spotlight}
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 mt-4">
        <p className="text-gray-400 text-[10px]">
          🎯 <strong>Tip:</strong> Connect with local scene leaders to get your music featured in community spotlights.
        </p>
      </div>
    </div>
  );
}