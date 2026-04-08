import React, { useState, useEffect } from "react";
import { X, Trash2, AlertTriangle, AlertCircle, Info, ChevronDown, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getErrorReports, getEconomySnapshots, clearErrorReports, clearEconomySnapshots } from "@/lib/errorReporting";

const SEV_STYLES = {
  critical: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-300", icon: AlertCircle },
  error: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: AlertCircle },
  warn: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", icon: AlertTriangle },
  info: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: Info }
};

export default function ErrorLogViewer({ onClose }) {
  const [tab, setTab] = useState("errors");
  const [reports, setReports] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setReports(getErrorReports());
    setSnapshots(getEconomySnapshots());
  }, []);

  const filtered = filter === "all" ? reports : reports.filter(r => r.severity === filter || r.category === filter);

  const handleClearErrors = () => {
    clearErrorReports();
    setReports([]);
  };

  const handleClearEconomy = () => {
    clearEconomySnapshots();
    setSnapshots([]);
  };

  const formatTime = (ts) => {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ts; }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-md bg-[#111118] border-t border-white/10 rounded-t-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-white text-sm font-bold">Error Log</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={tab === "errors" ? handleClearErrors : handleClearEconomy}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
              title="Clear"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-white/[0.04]">
          {["errors", "economy"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                tab === t ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "errors" ? `Errors (${reports.length})` : `Economy (${snapshots.length})`}
            </button>
          ))}
        </div>

        {/* Filter bar (errors tab only) */}
        {tab === "errors" && (
          <div className="flex gap-1 px-4 py-1.5 overflow-x-auto">
            {["all", "error", "warn", "critical", "runtime", "release", "studio", "economy"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-colors ${
                  filter === f ? "bg-red-500/20 text-red-300" : "bg-white/[0.04] text-gray-500 hover:text-gray-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
          {tab === "errors" && (
            filtered.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">No errors logged</p>
            ) : (
              filtered.map((r) => {
                const sev = SEV_STYLES[r.severity] || SEV_STYLES.error;
                const Icon = sev.icon;
                const isOpen = expanded === r.id;
                return (
                  <div key={r.id} className={`rounded-lg border ${sev.border} ${sev.bg} overflow-hidden`}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="w-full text-left px-2.5 py-2 flex items-start gap-2"
                    >
                      <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${sev.text}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold uppercase ${sev.text}`}>{r.severity}</span>
                          <span className="text-gray-500 text-[9px]">{r.scope}</span>
                          <span className="text-gray-600 text-[8px] ml-auto">{formatTime(r.timestamp)}</span>
                        </div>
                        <p className="text-white text-[11px] truncate">{r.message}</p>
                      </div>
                      <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform mt-0.5 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-2.5 pb-2 space-y-1">
                            {r.category && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400 text-[8px]">
                                {r.category}
                              </span>
                            )}
                            {r.error?.message && (
                              <p className="text-red-300/80 text-[10px] font-mono break-all">{r.error.message}</p>
                            )}
                            {r.error?.stack && (
                              <pre className="text-gray-500 text-[8px] font-mono max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                                {r.error.stack.split("\n").slice(0, 5).join("\n")}
                              </pre>
                            )}
                            {r.extra && (
                              <pre className="text-gray-600 text-[8px] font-mono">
                                {JSON.stringify(r.extra, null, 1).slice(0, 300)}
                              </pre>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )
          )}

          {tab === "economy" && (
            snapshots.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">No economy snapshots yet</p>
            ) : (
              snapshots.map((s) => (
                <div key={s.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-3 h-3 text-yellow-400" />
                    <span className="text-white text-[11px] font-medium">${s.income?.toLocaleString()}</span>
                    <span className="text-gray-500 text-[9px]">E:{s.energy} I:{s.inspiration}</span>
                    <span className="text-gray-600 text-[8px] ml-auto">{formatTime(s.timestamp)}</span>
                  </div>
                  <p className="text-gray-500 text-[9px] mt-0.5">{s.context}</p>
                </div>
              ))
            )
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
