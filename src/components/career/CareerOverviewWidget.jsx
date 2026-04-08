import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

export default function CareerOverviewWidget({ profile }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReport = async () => {
      try {
        const response = await base44.functions.invoke('insightsReportServer');
        setReport(response.data);
      } catch (error) {
        console.error('Failed to load insights report:', error);
      } finally {
        setLoading(false);
      }
    };

    if (profile?.id) {
      loadReport();
    }
  }, [profile?.id]);

  if (loading || !report) return <div className="text-gray-500 text-center p-4">Loading career data...</div>;

  const { era, career, growth, platforms, regions, explainer } = report;

  return (
    <div className="space-y-4">
      {/* Era Card */}
      {era && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg p-5 border border-red-500/20"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-lg font-bold text-white">{era.name}</h3>
              <p className="text-xs text-gray-400">Phase: {era.phase}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-red-400">{era.momentum}</div>
              <div className="text-xs text-gray-500">Momentum</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-400">Creative Tension</div>
              <div className="text-white font-semibold">{era.creativeTension}</div>
            </div>
            <div>
              <div className="text-gray-400">Turns in Phase</div>
              <div className="text-white font-semibold">{era.turnsInPhase}</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Career Tier + Legendary Moments */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#111118] rounded-lg p-4 border border-white/10"
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-300">Career Stage</h4>
            <p className="text-xl font-bold text-white mt-1">{career.stage}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Tier</p>
            <p className="text-lg font-bold text-yellow-400">{career.tier}</p>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          <p>🏆 Legendary Moments Unlocked: {career.legendaryUnlockedCount}</p>
          <p>⭐ Moments Available: {career.availableMomentsCount}</p>
        </div>
      </motion.div>

      {/* Platform Summary (3 rows) */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Platforms</h4>
        {Object.entries(platforms).map(([name, stats], idx) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + idx * 0.05 }}
            className="bg-[#1a1a2e] rounded p-3 border border-white/5"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-white">{name}</span>
              <span className="text-xs text-gray-400">{stats.share}% share</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-500">Daily Streams</div>
                <div className="text-green-400 font-semibold">{stats.dailyStreams.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">Monthly</div>
                <div className="text-green-400 font-semibold">{stats.monthlyListeners.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">Revenue</div>
                <div className="text-yellow-400 font-semibold">${Math.round(stats.revenue)}</div>
              </div>
            </div>
            <div className="text-[10px] text-gray-600 mt-2">
              Top: {stats.topRegions?.join(', ') || 'N/A'} | Archetype: {stats.dominantArchetype.replace(/_/g, ' ')}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Region Summary (top 3) */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Top Markets</h4>
        {regions.topNow.map((region, idx) => (
          <motion.div
            key={region.region}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + idx * 0.05 }}
            className="bg-[#1a1a2e] rounded p-3 border border-white/5 text-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-white">{region.region}</div>
                <div className="text-xs text-gray-400 mt-1">{region.descriptor}</div>
              </div>
              <div className="text-right">
                <div className="text-white font-bold">{region.percentage.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">{region.weeklyDelta > 0 ? '📈' : '📉'} {region.weeklyDelta.toFixed(1)}%</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Explainers */}
      {explainer.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-3 border border-blue-500/20 space-y-2"
        >
          <h4 className="text-xs font-semibold text-gray-300 uppercase">Insights</h4>
          {explainer.map((exp, idx) => (
            <div key={idx} className="text-xs text-gray-300">
              <span className={exp.severity === 'positive' ? 'text-green-400' : exp.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}>
                • {exp.text}
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}