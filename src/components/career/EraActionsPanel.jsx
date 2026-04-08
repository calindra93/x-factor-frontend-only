import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Lightbulb, AlertCircle, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast-provider";

export default function EraActionsPanel({ actions, era, profile, onAction, onClose }) {
  const [selectedAction, setSelectedAction] = useState(null);
  const [executing, setExecuting] = useState(false);

  if (!actions || actions.length === 0) {
    return null;
  }

  const handleExecuteAction = async (action) => {
    setExecuting(true);
    try {
      await onAction(action);
      setSelectedAction(null);
    } catch (error) {
      console.error("Failed to execute action:", error);
      showToast(`Action failed: ${error.message}`, "error");
    } finally {
      setExecuting(false);
    }
  };

  const canAfford = (action) => {
    return (profile.energy >= action.costs.energy && 
            profile.inspiration >= action.costs.inspiration);
  };

  const isRoutable = (action) => !!action.route;
  const completedActionIds = (era?.era_actions || []).map(a => a.id);

  if (selectedAction) {
    const routable = isRoutable(selectedAction);
    const alreadyDone = completedActionIds.includes(selectedAction.id);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end"
      >
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          className="w-full bg-[#111118] border-t border-white/[0.08] rounded-t-2xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{selectedAction.icon}</span>
              <h2 className="text-white font-bold text-lg">{selectedAction.name}</h2>
            </div>
            <button
              onClick={() => setSelectedAction(null)}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <p className="text-gray-300 text-sm">{selectedAction.description}</p>

          {/* Costs & Effects */}
          <div className="grid grid-cols-2 gap-3">
            {!routable ? (
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                <h3 className="text-gray-400 text-xs font-semibold mb-2">Costs</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-gray-300">
                      {selectedAction.costs.energy} energy
                    </span>
                    <span className={`text-xs ml-auto ${profile.energy >= selectedAction.costs.energy ? 'text-green-400' : 'text-red-400'}`}>
                      {profile.energy}/{selectedAction.costs.energy}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs text-gray-300">
                      {selectedAction.costs.inspiration} inspiration
                    </span>
                    <span className={`text-xs ml-auto ${profile.inspiration >= selectedAction.costs.inspiration ? 'text-yellow-400' : 'text-red-400'}`}>
                      {profile.inspiration}/{selectedAction.costs.inspiration}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <h3 className="text-blue-400 text-xs font-semibold mb-2">Game Mechanic</h3>
                <p className="text-blue-300 text-[10px]">This action takes you to the actual feature. Costs are handled there.</p>
              </div>
            )}

            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
              <h3 className="text-gray-400 text-xs font-semibold mb-2">Effects</h3>
              <div className="space-y-1 text-[10px]">
                {selectedAction.effects.momentum > 0 && (
                  <div className="text-green-400">
                    +{selectedAction.effects.momentum} momentum
                  </div>
                )}
                {selectedAction.effects.volatility > 0 && (
                  <div className="text-orange-400">
                    +{selectedAction.effects.volatility} volatility
                  </div>
                )}
                {selectedAction.effects.extends_phase_turns > 0 && (
                  <div className="text-blue-400">
                    +{selectedAction.effects.extends_phase_turns} phase turns
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Warning for unaffordable (narrative actions only) */}
          {!routable && !canAfford(selectedAction) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-300 text-xs">Insufficient resources to execute this action</p>
            </div>
          )}

          <Button
            onClick={() => handleExecuteAction(selectedAction)}
            disabled={executing || (!routable && !canAfford(selectedAction))}
            className={`w-full ${routable ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {executing ? "Executing..." : routable ? (
              <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />{selectedAction.routeLabel || 'Go'}</span>
            ) : "Execute Action"}
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-white text-xs font-bold px-1">Available Era Actions</h3>
      <div className="space-y-1.5">
        <AnimatePresence>
          {actions.map((action) => {
            const routable = isRoutable(action);
            const alreadyDone = completedActionIds.includes(action.id);
            return (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => setSelectedAction(action)}
                className={`w-full rounded-lg p-2.5 flex items-center gap-2.5 transition-colors text-left border ${
                  routable
                    ? "bg-blue-500/[0.06] border-blue-500/[0.15] hover:bg-blue-500/[0.1]"
                    : canAfford(action)
                      ? "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08]"
                      : "bg-white/[0.02] border-white/[0.04] opacity-60"
                }`}
              >
                <span className="text-lg flex-shrink-0">{action.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold truncate">{action.name}</p>
                  <p className="text-gray-400 text-[10px] line-clamp-1">{action.description}</p>
                </div>
                {routable ? (
                  <div className="flex items-center gap-1">
                    {alreadyDone && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  </div>
                ) : !canAfford(action) ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                ) : alreadyDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                ) : null}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}