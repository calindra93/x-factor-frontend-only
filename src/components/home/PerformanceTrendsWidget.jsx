import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { TrendingUp, Music, DollarSign } from 'lucide-react';

export default function PerformanceTrendsWidget({ profile }) {
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

  if (loading || !report) return <div className="text-gray-500 text-center p-4">Loading performance data...</div>;

  const { releases, income, growth, charts, explainer } = report;

  return (
    <div className="space-y-4">
      {/* Releases Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111118] rounded-lg p-4 border border-white/10"
      >
        <div className="flex items-center gap-2 mb-3">
          <Music className="w-4 h-4 text-purple-400" />
          <h4 className="text-sm font-semibold text-white">Releases</h4>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Projects</span>
            <span className="text-white font-semibold">{releases.projectsCount}</span>
          </div>
          {releases.bestProjectStreams > 0 && (
            <div>
              <div className="text-gray-400 text-xs mb-1">🔥 Best: {releases.bestProjectName}</div>
              <div className="text-green-400 font-semibold">{releases.bestProjectStreams.toLocaleString()} streams</div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Income Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#111118] rounded-lg p-4 border border-white/10"
      >
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-yellow-400" />
          <h4 className="text-sm font-semibold text-white">Income</h4>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Streaming</span>
            <span className="text-yellow-400 font-semibold">${income.streaming.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Album Sales</span>
            <span className="text-yellow-400 font-semibold">${income.albumSales.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Merch</span>
            <span className="text-yellow-400 font-semibold">${income.merch.toLocaleString()}</span>
          </div>

          <div className="border-t border-white/10 pt-2 mt-2 flex justify-between">
            <span className="text-white font-semibold">Total</span>
            <span className="text-green-400 text-lg font-bold">${income.net.toLocaleString()}</span>
          </div>
        </div>
      </motion.div>

      {/* Growth Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#111118] rounded-lg p-4 border border-white/10"
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">Growth This Turn</h4>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-gray-400 text-xs">Fans</div>
            <div className="text-white font-semibold">+{growth.followersDeltaDay.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Monthly Listeners</div>
            <div className="text-white font-semibold">+{growth.monthlyListenersDeltaMonth.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Clout</div>
            <div className="text-white font-semibold">+{growth.cloutDeltaDay}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Chart Position</div>
            <div className="text-white font-semibold">{charts.status}</div>
          </div>
        </div>

        {charts.reasonLockedIfAny && (
          <div className="text-xs text-yellow-400 mt-3 bg-yellow-400/10 p-2 rounded">
            ⚠️ {charts.reasonLockedIfAny}
          </div>
        )}
      </motion.div>

      {/* Quick Explainers */}
      {explainer.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-3 border border-blue-500/20 space-y-2"
        >
          <h4 className="text-xs font-semibold text-gray-300 uppercase">💡 What's Working</h4>
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