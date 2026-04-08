import React, { useState, useMemo } from "react";
import { X, TrendingUp, LineChart, PieChart, Brain, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

export default function AdvancedProjectAnalytics({ project, songs, releases, fanProfile, profile, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarios, setScenarios] = useState({
    marketingSpend: 1,
    genreShift: 0,
    releaseFrequency: 1,
  });

  const trackSongs = songs.filter((s) => project.tracklist?.includes(s.id));
  const projectRelease = releases.find(r => r.project_id === project.id);
  
  // Base metrics
  const currentStreams = projectRelease?.lifetime_streams || 0;
  const currentRevenue = projectRelease?.lifetime_revenue || 0;
  const avgQuality = trackSongs.length ? Math.round(trackSongs.reduce((sum, s) => sum + (s.quality || 0), 0) / trackSongs.length) : 0;

  // Revenue projection
  const projectedRevenue = useMemo(() => {
    const baseMonthlyStreams = currentStreams / 12 || 5000;
    const adjusted = baseMonthlyStreams * (scenarios.marketingSpend || 1) * (scenarios.releaseFrequency || 1);
    const nextMonthStreams = Math.floor(adjusted);
    const yearRevenue = Math.floor(nextMonthStreams * 12 * 0.003);
    
    const data = [];
    for (let i = 0; i < 12; i++) {
      const decay = Math.pow(0.95, i);
      data.push({
        month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
        streams: Math.floor(nextMonthStreams * decay),
        revenue: Math.floor(nextMonthStreams * decay * 0.003)
      });
    }
    return { data, yearTotal: yearRevenue };
  }, [currentStreams, scenarios.marketingSpend, scenarios.releaseFrequency]);

  // Listener demographics
  const demographicsData = useMemo(() => {
    const archetypes = fanProfile?.archetypes || {};
    if (!archetypes.stans && !archetypes.casuals) return [];
    return [
      { name: "Hardcore Stans", value: Math.round((archetypes.stans || 0) * 100), color: "#ff3b30" },
      { name: "Locals", value: Math.round((archetypes.locals || 0) * 100), color: "#ff9500" },
      { name: "Casual Listeners", value: Math.round((archetypes.casuals || 0) * 100), color: "#34c759" },
      { name: "Critics", value: Math.round((archetypes.critics || 0) * 100), color: "#00b4d8" }
    ];
  }, [fanProfile]);

  // Impact calculator
  const calculateImpact = () => {
    const baseScore = Math.min(100, avgQuality + (profile?.clout || 0) / 100);
    const marketingBoost = (scenarios.marketingSpend - 1) * 15;
    const genreRisk = Math.abs(scenarios.genreShift) * 8;
    const frequencyBoost = (scenarios.releaseFrequency - 1) * 10;
    
    const projectedScore = Math.max(0, Math.min(100, baseScore + marketingBoost - genreRisk + frequencyBoost));
    const revenueMultiplier = scenarios.marketingSpend * scenarios.releaseFrequency;
    
    return {
      successScore: Math.round(projectedScore),
      revenueImpact: Math.round((revenueMultiplier - 1) * 100),
      recommendations: [
        marketingBoost > 0 && "Increased marketing spend shows promising ROI",
        scenarios.genreShift > 0 && "Genre experimentation adds risk—maintain core identity",
        scenarios.releaseFrequency > 1.3 && "High release frequency may dilute impact—balance quality & quantity",
        scenarios.releaseFrequency < 0.8 && "Consistent releases build momentum—avoid long gaps"
      ].filter(Boolean)
    };
  };

  const impact = calculateImpact();

  // Regional listener breakdown
  const regionalData = useMemo(() => {
    if (!fanProfile?.top_regions?.length) return [];
    return fanProfile.top_regions.map(region => ({
      name: region.region,
      listeners: region.listeners || 0,
      percentage: region.percentage || 0
    }));
  }, [fanProfile]);

  // Track progress over time (simulated progression)
  const trackProgressData = useMemo(() => {
    return trackSongs.map(song => ({
      title: song.title || "Untitled",
      quality: song.quality || 0,
      status: song.status,
      projectedStreams: Math.floor((song.quality || 0) * 500 + (profile?.followers || 0) * 0.1)
    }));
  }, [trackSongs, profile]);

  const TABS = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "tracks", label: "Tracks", icon: LineChart },
    { id: "revenue", label: "Revenue", icon: LineChart },
    { id: "demographics", label: "Demographics", icon: PieChart },
    { id: "whatif", label: "What-If", icon: Brain }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
    >
      <motion.div
        initial={{ y: 400, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 400, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#0a0a0f] border-t border-white/10 rounded-t-3xl p-6 max-h-[var(--app-usable-height)] overflow-y-auto nested-scroll"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-lg">{project.name}</h2>
            <p className="text-gray-500 text-xs">{project.type} • {trackSongs.length} tracks</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-red-600/30 text-red-400"
                    : "text-gray-500 hover:text-gray-400"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <span className="text-gray-500 text-[10px] uppercase">Quality</span>
                <p className="text-white font-bold text-2xl mt-1">{avgQuality}</p>
                <p className="text-gray-600 text-[10px]">Average score</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <span className="text-gray-500 text-[10px] uppercase">Total Streams</span>
                <p className="text-white font-bold text-2xl mt-1">{(currentStreams / 1000).toFixed(0)}k</p>
                <p className="text-gray-600 text-[10px]">Lifetime</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <span className="text-gray-500 text-[10px] uppercase">Revenue</span>
                <p className="text-white font-bold text-2xl mt-1">${Math.floor(currentRevenue)}</p>
                <p className="text-gray-600 text-[10px]">Total earned</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <span className="text-gray-500 text-[10px] uppercase">Monthly Avg</span>
                <p className="text-white font-bold text-2xl mt-1">${Math.floor(currentRevenue / 12)}</p>
                <p className="text-gray-600 text-[10px]">Per month</p>
              </div>
            </div>
          </div>
        )}

        {/* Track Progress Tab */}
        {activeTab === "tracks" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <h3 className="text-white font-semibold text-sm mb-4">Track Performance</h3>
              <div className="space-y-3">
                {trackProgressData.length > 0 ? (
                  trackProgressData.map((track, idx) => (
                    <div key={`track-${idx}`} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-300 text-xs font-medium">{track.title}</p>
                        <span className={`text-[10px] font-semibold ${track.status === "recorded" ? "text-green-400" : "text-gray-500"}`}>
                          {track.status === "recorded" ? "✓ Recorded" : "○ Unrecorded"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full"
                            style={{ width: `${track.quality}%` }}
                          />
                        </div>
                        <span className="text-white text-xs font-semibold w-6 text-right">{track.quality}</span>
                      </div>
                      <p className="text-gray-600 text-[10px]">Est. streams: {(track.projectedStreams / 1000).toFixed(0)}k</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-xs text-center py-4">No tracks in project</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Revenue Projection Tab */}
        {activeTab === "revenue" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <h3 className="text-white font-semibold text-sm mb-4">12-Month Projection</h3>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsLineChart data={projectedRevenue.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="streams" stroke="#ff3b30" strokeWidth={2} dot={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-gray-400 text-xs mb-2">Annual Projection</p>
                <p className="text-white font-bold text-xl">${projectedRevenue.yearTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Demographics Tab */}
        {activeTab === "demographics" && (
          <div className="space-y-4">
            {demographicsData.length > 0 ? (
              <>
                {/* Regional Breakdown */}
                {regionalData.length > 0 && (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="w-4 h-4 text-blue-400" />
                      <h3 className="text-white font-semibold text-sm">Regional Listeners</h3>
                    </div>
                    <div className="space-y-2.5">
                      {regionalData.map((region) => (
                        <div key={region.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-300 text-xs">{region.name}</span>
                            <span className="text-white text-xs font-semibold">{region.listeners.toLocaleString()} ({region.percentage}%)</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                              style={{ width: `${region.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <h3 className="text-white font-semibold text-sm mb-4">Listener Mix</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPieChart>
                      <Pie data={demographicsData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" label={false}>
                        {demographicsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)" }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {demographicsData.map((segment) => (
                    <div key={segment.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="text-gray-400">{segment.name}</span>
                      </div>
                      <span className="text-white font-semibold">{segment.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <p className="text-gray-500 text-xs">Release this project to see listener demographics</p>
              </div>
            )}
          </div>
        )}

        {/* What-If Scenario Tab */}
        {activeTab === "whatif" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <label className="text-gray-400 text-xs font-semibold">Marketing Spend (Multiplier)</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={scenarios.marketingSpend}
                    onChange={(e) => setScenarios({ ...scenarios, marketingSpend: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-white/10 rounded-full"
                  />
                  <span className="text-white font-semibold text-sm w-12 text-right">{scenarios.marketingSpend.toFixed(1)}x</span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <label className="text-gray-400 text-xs font-semibold">Release Frequency</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={scenarios.releaseFrequency}
                    onChange={(e) => setScenarios({ ...scenarios, releaseFrequency: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-white/10 rounded-full"
                  />
                  <span className="text-white font-semibold text-sm w-12 text-right">{scenarios.releaseFrequency.toFixed(1)}x</span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <label className="text-gray-400 text-xs font-semibold">Genre Experimentation</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={scenarios.genreShift}
                    onChange={(e) => setScenarios({ ...scenarios, genreShift: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-white/10 rounded-full"
                  />
                  <span className="text-white font-semibold text-sm w-12 text-right">{scenarios.genreShift > 0 ? "+" : ""}{scenarios.genreShift.toFixed(1)}</span>
                </div>
                <p className="text-gray-600 text-[10px] mt-2">← Stay true | Experiment →</p>
              </div>
            </div>

            {/* Impact Summary */}
            <div className="rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30 p-4">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-gray-400 text-xs font-semibold">Success Score</p>
                  <p className="text-white font-bold text-3xl mt-1">{impact.successScore}%</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-xs font-semibold">Revenue Impact</p>
                  <p className={`font-bold text-lg mt-1 ${impact.revenueImpact > 0 ? "text-green-400" : "text-red-400"}`}>
                    {impact.revenueImpact > 0 ? "+" : ""}{impact.revenueImpact}%
                  </p>
                </div>
              </div>

              {impact.recommendations.length > 0 && (
                <div className="pt-3 border-t border-white/10 space-y-1.5">
                  {impact.recommendations.map((rec, i) => (
                    <p key={i} className="text-gray-400 text-xs">✓ {rec}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}