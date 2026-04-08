import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { showNotification } from "../notifications/NotificationToast";
import { MERCH_TYPES, RARITY_MODIFIERS, SOURCING_TIERS, LIFECYCLE_DEFAULTS, calculateProductionCost, calculateProjectedRevenue, getEraDemandModifier, applyRarityPriceModifier } from "./merchConfig";

export default function MerchCreationModal({ profile, currentEra, onClose, onComplete }) {
  useEffect(() => {
    const handleEscClose = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEscClose);
    return () => window.removeEventListener("keydown", handleEscClose);
  }, [onClose]);

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState("TShirt");
  const [selectedEdition, setSelectedEdition] = useState("Standard");
  const [selectedSourcing, setSelectedSourcing] = useState("Standard");
  const [quantity, setQuantity] = useState(100);
  const [price, setPrice] = useState(MERCH_TYPES.TShirt.basePrice);
  const [quality, setQuality] = useState(75);
  const [releaseDate, setReleaseDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const typeConfig = MERCH_TYPES[selectedType];
  const rarity = RARITY_MODIFIERS[selectedEdition];
  const productionCost = calculateProductionCost(selectedType, quantity, currentEra, selectedSourcing);
  const demandMod = getEraDemandModifier(currentEra);
  const adjustedPrice = applyRarityPriceModifier(price, selectedEdition);
  const projectedRevenue = calculateProjectedRevenue(selectedType, quantity, adjustedPrice, currentEra, 30);
  const projectedProfit = projectedRevenue - productionCost;
  const projectedROI = productionCost > 0 ? Math.round((projectedProfit / productionCost) * 100) : 0;
  const canAfford = profile.income >= productionCost;

  const handleCreate = async () => {
    if (!canAfford) {
      setError("Insufficient funds for production");
      return;
    }

    setLoading(true);
    try {
      // Get current turn to calculate in-game dates
      const turnStates = await base44.entities.TurnState.list('-created_date', 1);
      const currentTurnId = turnStates?.[0]?.current_turn_id ?? 0;
      
      // Convert in-game turn offset to scheduled turn
      const scheduledTurnsAhead = releaseDate ? 7 : 0; // Default to 1 week out if date specified
      const scheduledTurn = currentTurnId + scheduledTurnsAhead;
      const isScheduled = scheduledTurnsAhead > 0;

      // Create merch record
       const merchData = {
         artist_id: profile.id,
         merch_type: selectedType,
         edition: selectedEdition,
         sourcing_tier: selectedSourcing,
         project_name: `${typeConfig.label} Drop`,
         cover_artwork_url: "",
         quality: quality,
         units_manufactured: quantity,
         stock: quantity,
         price_per_unit: adjustedPrice,
         manufacturing_cost_per_unit: typeConfig.baseCost,
         total_manufacturing_cost: productionCost,
         units_sold: 0,
         total_units_sold: 0,
         total_revenue: 0,
         status: isScheduled ? "Scheduled" : "Active",
         production_started_turn: 0,
         production_complete_turn: currentEra ? (currentEra.start_turn + typeConfig.productionTime) : typeConfig.productionTime,
         restock_count: 0,
         restock_mode: "none",
         active_turns_count: 0,
         max_active_turns: LIFECYCLE_DEFAULTS[selectedEdition] ?? null,
         sellout_achieved: false,
         controversy_triggered: false,
       };

       if (isScheduled) {
          merchData.scheduled_turn = scheduledTurn;
        }

        await base44.entities.Merch.create(merchData);

      // Deduct cost from profile
      await base44.entities.ArtistProfile.update(profile.id, {
        income: profile.income - productionCost
      });

      showNotification(`✅ ${selectedType} drop created! (${quantity} units, ${selectedEdition})`, "success");
      onComplete?.();
    } catch (err) {
      setError(err.message || "Failed to create merch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-4 max-w-md w-full max-h-[80vh] flex flex-col"
      >
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white text-lg font-bold">New Merch Drop</h2>
            <p className="text-gray-500 text-xs">Step {step}/2</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <label className="text-white text-xs font-semibold block mb-2">Merch Type</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(MERCH_TYPES).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedType(key);
                      setPrice(config.basePrice);
                    }}
                    className={`p-3 rounded-lg border transition-all text-center ${
                      selectedType === key
                        ? "border-red-500 bg-red-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-2xl mb-1">{config.icon}</div>
                    <p className="text-white text-[9px] font-semibold">{config.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedType && (
               <motion.div
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: "auto" }}
                 className="space-y-3 bg-white/5 rounded-lg p-3 border border-white/10"
               >
                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Edition</label>
                   <div className="grid grid-cols-3 gap-2">
                     {Object.entries(RARITY_MODIFIERS).map(([key, config]) => (
                       <button
                         key={key}
                         onClick={() => setSelectedEdition(key)}
                         className={`p-2 rounded-lg border text-center transition-all ${
                           selectedEdition === key
                             ? "border-red-500 bg-red-500/10"
                             : "border-white/10 bg-white/5 hover:bg-white/10"
                         }`}
                       >
                         <p className="text-white text-[9px] font-semibold">{config.label}</p>
                         <p className="text-gray-400 text-[8px] mt-0.5">{config.priceMod.toFixed(2)}x price</p>
                       </button>
                     ))}
                   </div>
                 </div>

                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Quantity</label>
                   <Input
                     type="number"
                     value={quantity}
                     onChange={(e) => setQuantity(Math.max(10, parseInt(e.target.value) || 10))}
                     className="bg-white/5 border-white/10 text-white"
                     min="10"
                     step="10"
                   />
                 </div>

                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Price per Unit</label>
                   <Input
                     type="number"
                     value={price}
                     onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value) || 1))}
                     className="bg-white/5 border-white/10 text-white"
                     min="1"
                     step="1"
                   />
                 </div>

                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Quality (1-100)</label>
                   <Input
                     type="range"
                     value={quality}
                     onChange={(e) => setQuality(parseInt(e.target.value))}
                     className="bg-white/5 border-white/10 text-white"
                     min="1"
                     max="100"
                   />
                   <div className="flex justify-between items-center mt-1">
                     <span className="text-gray-400 text-[9px]">{quality}</span>
                     <span className={`text-[9px] font-semibold ${quality >= 80 ? "text-green-400" : quality >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                       {quality >= 80 ? "Premium" : quality >= 60 ? "Standard" : "Budget"}
                     </span>
                   </div>
                 </div>

                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Sourcing</label>
                   <div className="grid grid-cols-3 gap-2">
                     {Object.entries(SOURCING_TIERS).map(([key, cfg]) => (
                       <button
                         key={key}
                         onClick={() => setSelectedSourcing(key)}
                         className={`p-2 rounded-lg border text-center transition-all ${
                           selectedSourcing === key
                             ? "border-red-500 bg-red-500/10"
                             : "border-white/10 bg-white/5 hover:bg-white/10"
                         }`}
                       >
                         <div className="text-base mb-0.5">{cfg.icon}</div>
                         <p className="text-white text-[9px] font-semibold">{cfg.label}</p>
                         <p className="text-[8px] mt-0.5" style={{ color: cfg.riskColor }}>{cfg.riskLabel}</p>
                       </button>
                     ))}
                   </div>
                 </div>

                 <div>
                   <label className="text-white text-xs font-semibold block mb-2">Release Date (Optional)</label>
                   <Input
                     type="date"
                     value={releaseDate}
                     onChange={(e) => setReleaseDate(e.target.value)}
                     className="bg-white/5 border-white/10 text-white"
                   />
                   {releaseDate && (
                     <p className="text-gray-400 text-[9px] mt-1">Pre-order opens now, available {releaseDate}</p>
                   )}
                 </div>

                <div className="text-xs space-y-1 text-gray-400 border-t border-white/10 pt-3">
                  <div className="flex justify-between">
                    <span>Production Cost:</span>
                    <span className="text-white font-semibold">${productionCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Price/Unit:</span>
                    <span className="text-white">${adjustedPrice}</span>
                  </div>
                  {selectedEdition !== "Standard" && (
                    <div className="flex justify-between">
                      <span>Edition Multiplier:</span>
                      <span className="text-red-400 font-semibold">{rarity.priceMod.toFixed(2)}x</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Production Time:</span>
                    <span className="text-white">{typeConfig.productionTime} turns</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Era Demand:</span>
                    <span className={`font-semibold ${demandMod > 1 ? "text-green-400" : demandMod < 1 ? "text-red-400" : "text-gray-400"}`}>
                      {demandMod.toFixed(2)}x
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-lg p-3">
              <h4 className="text-white font-semibold text-sm mb-3">30-Day Projection</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Revenue</span>
                  <span className="text-green-400 font-bold">${projectedRevenue.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Profit</span>
                  <span className={`font-bold ${projectedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${projectedProfit.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">ROI</span>
                  <span className={`font-bold ${projectedROI >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {projectedROI}%
                  </span>
                </div>
              </div>
            </div>

            {!canAfford && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-400 text-xs">
                  Insufficient funds. You need ${productionCost.toLocaleString()} but have ${profile.income.toLocaleString()}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <div className="bg-white/5 rounded-lg p-3 space-y-2 text-xs text-gray-400">
              <p>• Production takes {typeConfig.productionTime} turns</p>
              <p>• Demand modifier: {demandMod.toFixed(2)}x (era-based)</p>
              <p>• Sales vary based on era momentum & volatility</p>
            </div>
          </div>
        )}
        </div>

        {/* Fixed Button Section */}
        <div className="flex gap-2 mt-4 border-t border-white/10 pt-4">
          {step > 1 && (
            <Button
              onClick={() => setStep(1)}
              className="flex-1 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
            >
              Back
            </Button>
          )}
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white"
            >
              Review
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!canAfford || loading}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white disabled:opacity-30"
            >
              {loading ? "Creating..." : "Create Drop"}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}