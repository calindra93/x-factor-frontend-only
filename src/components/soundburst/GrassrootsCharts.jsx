import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Award } from "lucide-react";
import { GRASSROOTS_CHARTS } from "./soundburstData";

export default function GrassrootsCharts() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Award className="w-5 h-5 text-amber-400" />
        <h2 className="text-white text-sm font-bold">Grassroots Charts</h2>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 space-y-2">
        {GRASSROOTS_CHARTS.map((track, idx) => {
          const changeDir = track.change.includes("+") ? "positive" : "negative";
          const changeNum = parseInt(track.change);

          return (
            <motion.div
              key={`${track.artist}-${track.title}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.06] rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="text-right min-w-[24px]">
                  <span className="text-white font-bold text-sm">#{track.rank}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{track.title}</p>
                  <p className="text-gray-400 text-xs">{track.artist}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[10px] bg-white/5 px-2 py-1 rounded text-gray-400">
                  {track.tag}
                </span>

                <div
                  className={`flex items-center gap-1 text-xs font-semibold min-w-fit ${
                    changeDir === "positive" ? "text-green-400" : "text-red-400"
                  }`}
                >
                  <TrendingUp
                    className={`w-3 h-3 ${
                      changeDir === "negative" ? "rotate-180" : ""
                    }`}
                  />
                  {track.change}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
        <p className="text-gray-400 text-[10px]">
          📊 <strong>Underground Momentum:</strong> These tracks are gaining traction in grassroots communities. Submit your music to be featured.
        </p>
      </div>
    </div>
  );
}