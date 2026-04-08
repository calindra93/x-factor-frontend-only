import React from "react";
import { motion } from "framer-motion";
import { DollarSign, Users, Siren } from "lucide-react";

const PROMO_STRATEGIES = [
  {
    id: "word_of_mouth",
    name: "Word of Mouth",
    description: "Organic buzz. No promotion cost.",
    cost: 0,
    attendanceBoost: "+5%",
    detectionRisk: "+0%",
    color: "#34d399",
    icon: Users,
    vibe: "authentic, grassroots",
  },
  {
    id: "street_team",
    name: "Street Team",
    description: "Local flyering, direct outreach.",
    cost: 200,
    attendanceBoost: "+15%",
    detectionRisk: "+8%",
    color: "#60a5fa",
    icon: Users,
    vibe: "organized, persistent",
  },
  {
    id: "social_blast",
    name: "Social Blast",
    description: "Full social media blitz. Auto-posts teaser.",
    cost: 500,
    attendanceBoost: "+30%",
    detectionRisk: "+20%",
    color: "#f97316",
    icon: Siren,
    vibe: "bold, high-visibility",
  },
  {
    id: "exclusive_invite",
    name: "Exclusive Invite",
    description: "Restricted guest list. Curated crowd.",
    cost: 800,
    attendanceBoost: "+10%",
    detectionRisk: "-5%",
    detectionLabel: "Lower risk",
    color: "#fbbf24",
    icon: DollarSign,
    vibe: "intimate, selective",
  },
];

export default function PromoStrategySelector({ selected, onSelect }) {
  return (
    <div className="space-y-3">
      <div className="text-center mb-5">
        <h2 className="text-xl font-black text-white">Get the word out.</h2>
        <p className="text-xs text-white/40 mt-1">Choose your promo strategy. Affects attendance and heat.</p>
      </div>

      <div className="space-y-2">
        {PROMO_STRATEGIES.map((strategy, i) => {
          const Icon = strategy.icon;
          const isSelected = selected === strategy.id;

          return (
            <motion.button
              key={strategy.id}
              onClick={() => onSelect(strategy.id)}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                isSelected
                  ? "border-blue-500/40 bg-blue-600/12"
                  : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]"
              }`}
            >
              {/* Icon */}
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${strategy.color}18` }}
              >
                <Icon className="w-4 h-4" style={{ color: strategy.color }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-black ${isSelected ? "text-blue-300" : "text-white"}`}>
                  {strategy.name}
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">{strategy.description}</div>
                <div className="text-[9px] text-white/30 mt-1 italic">{strategy.vibe}</div>
              </div>

              {/* Stats */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-[9px] text-emerald-400">
                  <DollarSign className="w-3 h-3" />
                  <span className="font-black">{strategy.cost === 0 ? "Free" : `$${strategy.cost}`}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-blue-400">
                  <Users className="w-3 h-3" />
                  <span className="font-black">{strategy.attendanceBoost}</span>
                </div>
                <div
                  className="flex items-center gap-1.5 text-[9px] font-black"
                  style={{ color: strategy.detectionRisk?.includes("-") ? "#34d399" : "#f97316" }}
                >
                  <Siren className="w-3 h-3" />
                  <span>{strategy.detectionLabel || strategy.detectionRisk}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
