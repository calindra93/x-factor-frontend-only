import React, { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

const REGION_CHART_KEYS = {
  "United States": "soundburst_underground_us",
  UK: "soundburst_underground_uk",
  Europe: "soundburst_underground_eu",
  Canada: "soundburst_underground_ca",
  "Latin America": "soundburst_underground_latam",
  Africa: "soundburst_underground_africa",
  Asia: "soundburst_underground_asia",
  Oceania: "soundburst_underground_oceania",
};

export default function RadioCharts({ shows = [] }) {
  const [selectedRegion, setSelectedRegion] = useState("United States");

  const rows = useMemo(() => {
    return (shows || [])
      .filter((show) => show.region === selectedRegion)
      .sort((a, b) => Number(b.listener_count || 0) - Number(a.listener_count || 0))
      .slice(0, 10);
  }, [shows, selectedRegion]);

  const chartKey = REGION_CHART_KEYS[selectedRegion] || "soundburst_underground_global";

  return (
    <div className="space-y-3">
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-violet-300" />
          <h3 className="text-white text-sm font-semibold">Soundburst Underground Charts</h3>
        </div>
        <p className="text-xs text-gray-400">Chart key: {chartKey}</p>
      </div>

      <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 space-y-2">
        <label className="text-xs text-gray-300">Region</label>
        <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          {Object.keys(REGION_CHART_KEYS).map((region) => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
      </div>

      <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4">
        <h4 className="text-white text-sm font-semibold mb-2">Top 10</h4>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-400">No chart rows for this region yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((show, index) => (
              <div key={show.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5">#{index + 1}</span>
                  <span className="text-sm text-white font-medium">{show.name}</span>
                </div>
                <span className="text-xs text-gray-300">{Number(show.listener_count || 0).toLocaleString()} listeners</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
