import React, { useState, useMemo } from "react";
import { Brain, TrendingUp, AlertCircle, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function CareerScenarioPlanner({ profile, fanProfile, releases }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState({
    marketingBudget: 0,
    tourFrequency: 0,
    genreExperimentation: 0,
  });

  const currentMetrics = {
    monthlyListeners: fanProfile?.monthly_listeners || 10000,
    clout: profile?.clout || 0,
    hype: profile?.hype || 30,
    income: profile?.income || 1000,
  };

  // Scenario projections
  const projections = useMemo(() => {
    const months = ["Current", "Month 1", "Month 3", "Month 6", "Month 12"];
    const data = [];

    for (let i = 0; i < months.length; i++) {
      const timeMultiplier = 1 + (i * 0.15);
      const marketingBoost = scenarios.marketingBudget * (i > 0 ? 0.8 : 0);
      const tourBoost = scenarios.tourFrequency * (i > 0 ? 0.6 : 0);
      const genreRisk = Math.abs(scenarios.genreExperimentation) * (i > 2 ? 0.5 : 0);

      data.push({
        month: months[i],
        listeners: Math.floor(currentMetrics.monthlyListeners * timeMultiplier * (1 + marketingBoost) * (1 + tourBoost) * Math.max(0.7, 1 - genreRisk)),
        hype: Math.min(100, currentMetrics.hype + (scenarios.marketingBudget * 15) + (scenarios.tourFrequency * 10) - (scenarios.genreExperimentation * 5)),
        clout: Math.floor(currentMetrics.clout * timeMultiplier * (1 + marketingBoost * 0.5 + tourBoost * 0.3)),
      });
    }
    return data;
  }, [scenarios, currentMetrics]);

  const riskAssessment = useMemo(() => {
    const risks = [];
    const opportunities = [];

    if (scenarios.marketingBudget > 1.5) {
      opportunities.push("Aggressive marketing can trigger rapid growth");
    } else if (scenarios.marketingBudget > 0.5) {
      opportunities.push("Steady marketing investment builds momentum");
    } else {
      risks.push("Low marketing spend may limit exposure");
    }

    if (scenarios.tourFrequency > 1) {
      opportunities.push("Regular touring strengthens fanbase loyalty");
    }

    if (Math.abs(scenarios.genreExperimentation) > 0.7) {
      risks.push("Major genre shift risks alienating core fans");
    } else if (scenarios.genreExperimentation > 0) {
      opportunities.push("Moderate experimentation can attract new audiences");
    }

    if (fanProfile?.archetypes?.stans && fanProfile.archetypes.stans > 0.30) {
      opportunities.push("Strong hardcore fanbase provides stability");
    }

    return { risks, opportunities };
  }, [scenarios, fanProfile]);

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-3 bg-gradient-to-r from-purple-500/20 to-blue-500/10 hover:from-purple-500/30 hover:to-blue-500/20 border border-purple-500/30 rounded-2xl p-4 transition-all"
      >
        <Brain className="w-5 h-5 text-purple-400" />
        <div className="text-left flex-1">
          <h3 className="text-white font-semibold text-sm">What-If Scenario Planner</h3>
          <p className="text-gray-500 text-xs">Simulate career moves and their impact</p>
        </div>
        <TrendingUp className="w-4 h-4 text-purple-400" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4 max-w-md mx-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <h2 className="text-white font-bold text-lg">Career Simulator</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Controls */}
              <div className="space-y-4 mb-6">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs font-semibold">Marketing Budget Impact</label>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={scenarios.marketingBudget}
                      onChange={(e) => setScenarios({ ...scenarios, marketingBudget: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-white/10 rounded-full"
                    />
                    <span className="text-white font-semibold w-16 text-right">
                      {scenarios.marketingBudget > 0 ? "+" : ""}{(scenarios.marketingBudget * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs font-semibold">Tour/Live Event Frequency</label>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={scenarios.tourFrequency}
                      onChange={(e) => setScenarios({ ...scenarios, tourFrequency: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-white/10 rounded-full"
                    />
                    <span className="text-white font-semibold w-16 text-right">{scenarios.tourFrequency.toFixed(1)}x</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs font-semibold">Genre Shift (-left / +right)</label>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={scenarios.genreExperimentation}
                      onChange={(e) => setScenarios({ ...scenarios, genreExperimentation: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-white/10 rounded-full"
                    />
                    <span className="text-white font-semibold w-16 text-right">
                      {scenarios.genreExperimentation > 0 ? "+" : ""}{scenarios.genreExperimentation.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Projection Chart */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-6">
                <h3 className="text-white font-semibold text-sm mb-4">12-Month Listener Projection</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsLineChart data={projections}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)" }} />
                    <Line type="monotone" dataKey="listeners" stroke="#ff3b30" strokeWidth={2} dot={false} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>

              {/* Risk & Opportunity Assessment */}
              <div className="space-y-3 mb-6">
                {riskAssessment.opportunities.length > 0 && (
                  <div className="rounded-2xl bg-green-500/10 border border-green-500/30 p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <Zap className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <h4 className="text-green-400 font-semibold text-sm">Opportunities</h4>
                    </div>
                    <div className="space-y-1">
                      {riskAssessment.opportunities.map((opp, i) => (
                        <p key={i} className="text-green-300 text-xs">✓ {opp}</p>
                      ))}
                    </div>
                  </div>
                )}

                {riskAssessment.risks.length > 0 && (
                  <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <h4 className="text-red-400 font-semibold text-sm">Risks</h4>
                    </div>
                    <div className="space-y-1">
                      {riskAssessment.risks.map((risk, i) => (
                        <p key={i} className="text-red-300 text-xs">⚠ {risk}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scenario Summary */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <h3 className="text-white font-semibold text-sm mb-3">Projected Metrics (12 Months)</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Monthly Listeners</span>
                    <span className="text-white font-semibold">
                      {(projections[projections.length - 1].listeners / 1000).toFixed(0)}k
                      <span className="text-gray-500 text-[10px] ml-1">
                        (+{(((projections[projections.length - 1].listeners - currentMetrics.monthlyListeners) / currentMetrics.monthlyListeners) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Hype Level</span>
                    <span className="text-white font-semibold">{Math.min(100, projections[projections.length - 1].hype)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Clout</span>
                    <span className="text-white font-semibold">+{projections[projections.length - 1].clout - currentMetrics.clout}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}