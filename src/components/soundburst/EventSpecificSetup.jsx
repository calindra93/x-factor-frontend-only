import React from "react";
import { motion } from "framer-motion";
import {
  Zap, Music, Users, Mic2, PartyPopper,
} from "lucide-react";

// Event-specific configuration
const EVENT_SPECIFIC_CONFIG = {
  battle: {
    title: "Battle Format",
    description: "Choose your battle style and intensity.",
    choices: [
      {
        name: "Cypher",
        icon: Users,
        description: "3-6 participants, collaborative energy.",
        impacts:
          ["Networking boost", "Lower controversy risk", "Shared spotlight"],
      },
      {
        name: "1v1",
        icon: Zap,
        description: "Direct head-to-head competition.",
        impacts: ["Higher clout gain", "Direct beef potential", "Winner takes all"],
      },
      {
        name: "Exhibition",
        icon: Music,
        description: "Just come flex. No winner.",
        impacts: ["Pure performance", "Showcase vibe", "Low risk"],
      },
    ],
    intensity: {
      title: "Intensity Level",
      levels: [
        {
          name: "Friendly",
          impacts: "Low beef risk, collaborative vibe, +5% clout",
        },
        {
          name: "Serious",
          impacts: "Normal beef risk, competitive energy, +15% clout",
        },
        {
          name: "Full Beef",
          impacts: "High controversy potential, +30% clout, risky",
        },
      ],
    },
  },
  showcase: {
    title: "Bill Position",
    description: "Where do you sit on the lineup?",
    choices: [
      {
        name: "Opener",
        icon: Mic2,
        description: "Set the tone. Build the energy.",
        impacts: ["Lower cost", "Warm up crowd", "Build buzz"],
      },
      {
        name: "Co-headliner",
        icon: Music,
        description: "Share the spotlight.",
        impacts: ["Balanced cost", "Peak energy window", "Good exposure"],
      },
      {
        name: "Headliner",
        icon: Zap,
        description: "Close the show. Be the main event.",
        impacts: ["Higher cost", "Maximum attention", "Pressure to deliver"],
      },
    ],
  },
  listening_party: {
    title: "Release to Debut",
    description: "Pick which release to premiere.",
    isReleasePicker: true,
  },
  block_party: {
    title: "Energy Level",
    description: "Set the vibe intensity.",
    choices: [
      {
        name: "Low-key",
        icon: Users,
        description: "Intimate, community-focused.",
        impacts: ["Lower cost", "Chill crowd", "Less detection risk"],
      },
      {
        name: "Hype",
        icon: Music,
        description: "High energy, good crowd.",
        impacts: ["Balanced cost", "Bigger attendance", "Normal risk"],
      },
      {
        name: "All-out",
        icon: PartyPopper,
        description: "Maximum chaos and celebration.",
        impacts: ["Highest cost", "Max attendance", "High raid risk"],
      },
    ],
  },
  open_mic: {
    title: "Focus",
    description: "What do you emphasize?",
    choices: [
      {
        name: "Networking",
        icon: Users,
        description: "Meet other artists, collaborators.",
        impacts: ["Higher NPC meeting chance", "Build relationships", "Subtle vibe"],
      },
      {
        name: "Performance",
        icon: Zap,
        description: "Showcase your skill.",
        impacts: ["+Clout gain", "Higher streams", "More visibility"],
      },
      {
        name: "Vibe",
        icon: Music,
        description: "Feel-good, low-pressure set.",
        impacts: ["Lower detection", "Chill crowd", "Community love"],
      },
    ],
  },
  collab_night: {
    title: "Focus",
    description: "What do you emphasize?",
    choices: [
      {
        name: "Networking",
        icon: Users,
        description: "Meet other artists, collaborators.",
        impacts: ["Higher NPC meeting chance", "Build relationships", "Subtle vibe"],
      },
      {
        name: "Performance",
        icon: Zap,
        description: "Showcase your skill.",
        impacts: ["+Clout gain", "Higher streams", "More visibility"],
      },
      {
        name: "Vibe",
        icon: Music,
        description: "Feel-good collaboration.",
        impacts: ["Lower detection", "Team energy", "Collab boost"],
      },
    ],
  },
};

export default function EventSpecificSetup({ eventType, selectedChoice, selectedIntensity, onChoiceSelect, onIntensitySelect, releases = [] }) {
  const config = EVENT_SPECIFIC_CONFIG[eventType];

  if (!config) {
    return (
      <div className="text-white/40 text-center py-6">
        Event type not configured for specific setup.
      </div>
    );
  }

  // Release picker for listening party
  if (config.isReleasePicker) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-5">
          <h2 className="text-xl font-black text-white">{config.title}</h2>
          <p className="text-xs text-white/40 mt-1">{config.description}</p>
        </div>

        {releases && releases.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {releases.map((release) => {
              const isSelected = selectedChoice === release.id;
              return (
                <motion.button
                  key={release.id}
                  onClick={() => onChoiceSelect(release.id)}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? "border-blue-500/40 bg-blue-600/12"
                      : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]"
                  }`}
                >
                  {release.cover_artwork_url && (
                    <img
                      src={release.cover_artwork_url}
                      alt={release.release_name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-black truncate ${isSelected ? "text-blue-300" : "text-white"}`}>
                      {release.release_name}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {release.release_date ? new Date(release.release_date).getFullYear() : "Unreleased"}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-white/30 text-sm">
            No releases yet. Record something first!
          </div>
        )}
      </div>
    );
  }

  // Standard choice picker
  return (
    <div className="space-y-4">
      <div className="text-center mb-5">
        <h2 className="text-xl font-black text-white">{config.title}</h2>
        <p className="text-xs text-white/40 mt-1">{config.description}</p>
      </div>

      {/* Main choices */}
      {config.choices && (
        <div className="space-y-2">
          {config.choices.map((choice, i) => {
            const Icon = choice.icon;
            const isSelected = selectedChoice === choice.name;

            return (
              <motion.button
                key={choice.name}
                onClick={() => onChoiceSelect(choice.name)}
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
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "rgba(96, 165, 250, 0.1)" }}>
                  <Icon className="w-4 h-4" style={{ color: "#60a5fa" }} />
                </div>

                <div className="flex-1">
                  <div className={`text-sm font-black ${isSelected ? "text-blue-300" : "text-white"}`}>
                    {choice.name}
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">{choice.description}</div>
                  {choice.impacts && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {choice.impacts.map((impact) => (
                        <span key={impact} className="text-[8px] bg-white/[0.08] px-2 py-0.5 rounded text-white/50">
                          {impact}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Intensity selector (battle only) */}
      {config.intensity && (
        <div className="pt-4 border-t border-white/[0.08]">
          <div className="text-center mb-4">
            <h3 className="text-sm font-bold text-white">{config.intensity.title}</h3>
          </div>
          <div className="space-y-2">
            {config.intensity.levels.map((level, i) => {
              const isSelected = selectedIntensity === level.name;

              return (
                <motion.button
                  key={level.name}
                  onClick={() => onIntensitySelect(level.name)}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (config.choices.length + i) * 0.06 }}
                  className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? "border-amber-500/40 bg-amber-600/12"
                      : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]"
                  }`}
                >
                  <div className={`text-sm font-bold ${isSelected ? "text-amber-300" : "text-white"}`}>
                    {level.name}
                  </div>
                  <div className="text-[9px] text-white/40 ml-auto">{level.impacts}</div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
