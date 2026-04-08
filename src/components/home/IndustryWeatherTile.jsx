import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CloudFog, CloudLightning, Eye, Loader2, Mic, Radio, RefreshCw, Sparkles, TrendingUp, Users2, Waves, Wind } from "lucide-react";
import { showToast } from "@/components/ui/toast-provider";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

const CATEGORY_COLORS = {
  sound: "#60a5fa",
  aesthetic: "#f472b6",
  challenge: "#fbbf24",
  meme: "#fb923c",
  beef: "#f87171",
  genre_wave: "#34d399",
};

const PLATFORM_CONFIG = {
  looptok: { label: "LoopTok", color: "rgba(244,114,182,0.78)" },
  instavibe: { label: "InstaVibe", color: "rgba(168,85,247,0.78)" },
  vidwave: { label: "VidWave", color: "rgba(59,130,246,0.78)" },
};

const WEATHER_THEME = {
  mainstream: {
    condition: "Clear Conditions",
    summary: "Broad-reach hooks are traveling cleanly through the timeline.",
    accent: "#818cf8",
    accentSoft: "rgba(129,140,248,0.24)",
    sky: "linear-gradient(180deg, rgba(96,165,250,0.30) 0%, rgba(129,140,248,0.18) 38%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(96,165,250,0.26)",
    glowB: "rgba(196,181,253,0.16)",
    Icon: Radio,
    weather: "clear",
  },
  beef_season: {
    condition: "Storm Warning",
    summary: "Conflict-heavy cycles are amplifying fast, volatile attention.",
    accent: "#f87171",
    accentSoft: "rgba(248,113,113,0.22)",
    sky: "linear-gradient(180deg, rgba(127,29,29,0.48) 0%, rgba(239,68,68,0.20) 34%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(248,113,113,0.22)",
    glowB: "rgba(251,146,60,0.14)",
    Icon: CloudLightning,
    weather: "storm",
  },
  nostalgic: {
    condition: "Evening Haze",
    summary: "Memory-rich moods and soft-focus callbacks are hanging in the air.",
    accent: "#c084fc",
    accentSoft: "rgba(192,132,252,0.20)",
    sky: "linear-gradient(180deg, rgba(126,34,206,0.34) 0%, rgba(251,191,36,0.14) 35%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(192,132,252,0.18)",
    glowB: "rgba(251,191,36,0.12)",
    Icon: Waves,
    weather: "haze",
  },
  experimental: {
    condition: "Prism Front",
    summary: "Boundary-pushing textures are bending the feed into new shapes.",
    accent: "#22d3ee",
    accentSoft: "rgba(34,211,238,0.22)",
    sky: "linear-gradient(180deg, rgba(34,211,238,0.22) 0%, rgba(168,85,247,0.16) 36%, rgba(251,191,36,0.14) 64%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(34,211,238,0.20)",
    glowB: "rgba(192,132,252,0.16)",
    Icon: Sparkles,
    weather: "aurora",
  },
  underground: {
    condition: "Low Visibility",
    summary: "Scene-led currents are building beneath the surface with quiet force.",
    accent: "#2dd4bf",
    accentSoft: "rgba(45,212,191,0.22)",
    sky: "linear-gradient(180deg, rgba(17,94,89,0.42) 0%, rgba(20,184,166,0.16) 38%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(45,212,191,0.18)",
    glowB: "rgba(52,211,153,0.12)",
    Icon: CloudFog,
    weather: "fog",
  },
  messy: {
    condition: "Turbulent Conditions",
    summary: "Chaotic visibility spikes are gusting through everything right now.",
    accent: "#fb923c",
    accentSoft: "rgba(251,146,60,0.22)",
    sky: "linear-gradient(180deg, rgba(194,65,12,0.38) 0%, rgba(244,114,182,0.15) 34%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(251,146,60,0.20)",
    glowB: "rgba(244,114,182,0.14)",
    Icon: Wind,
    weather: "wind",
  },
  collab_season: {
    condition: "Warm Convergence",
    summary: "Two systems are meeting — cross-genre energy is pulling the feed into shared territory.",
    accent: "#34d399",
    accentSoft: "rgba(52,211,153,0.22)",
    sky: "linear-gradient(180deg, rgba(6,78,59,0.42) 0%, rgba(52,211,153,0.18) 38%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(52,211,153,0.22)",
    glowB: "rgba(16,185,129,0.14)",
    Icon: Users2,
    weather: "convergence",
  },
  hype_cycle: {
    condition: "Pressure Building",
    summary: "A high-pressure rollout front is moving in — teasers and announcements are the leading edge.",
    accent: "#fbbf24",
    accentSoft: "rgba(251,191,36,0.22)",
    sky: "linear-gradient(180deg, rgba(120,53,15,0.42) 0%, rgba(251,191,36,0.20) 38%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(251,191,36,0.24)",
    glowB: "rgba(245,158,11,0.14)",
    Icon: TrendingUp,
    weather: "pulse",
  },
  viral_spiral: {
    condition: "Spiral System",
    summary: "A fast-rotating system has formed — content cycles are collapsing into hours, not days.",
    accent: "#f472b6",
    accentSoft: "rgba(244,114,182,0.22)",
    sky: "linear-gradient(180deg, rgba(131,24,67,0.42) 0%, rgba(244,114,182,0.18) 36%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(244,114,182,0.22)",
    glowB: "rgba(236,72,153,0.14)",
    Icon: RefreshCw,
    weather: "spiral",
  },
  industry_exposed: {
    condition: "Flat Light",
    summary: "Low contrast conditions are stripping the gloss off — receipts are visible from every angle.",
    accent: "#94a3b8",
    accentSoft: "rgba(148,163,184,0.22)",
    sky: "linear-gradient(180deg, rgba(30,41,59,0.56) 0%, rgba(100,116,139,0.18) 40%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(148,163,184,0.18)",
    glowB: "rgba(71,85,105,0.14)",
    Icon: Eye,
    weather: "overcast",
  },
  tour_season: {
    condition: "Open Sky",
    summary: "Clear festival conditions — live energy is peaking and the outdoor circuit is the main stage.",
    accent: "#a78bfa",
    accentSoft: "rgba(167,139,250,0.22)",
    sky: "linear-gradient(180deg, rgba(76,29,149,0.38) 0%, rgba(167,139,250,0.18) 38%, rgba(10,10,15,0.98) 100%)",
    glowA: "rgba(167,139,250,0.22)",
    glowB: "rgba(139,92,246,0.14)",
    Icon: Mic,
    weather: "festival",
  },
};

function N(v) {
  return Number(v) || 0;
}

function categoryLabel(category) {
  return String(category || "signal").replace(/_/g, " ");
}

function buildForecastCopy({ mood, trend, topTrends, pressure }) {
  const dominant = trend || topTrends[0] || null;
  const dominantCategory = dominant?.category || null;
  const extraSignals = topTrends.slice(1, 3).map((item) => categoryLabel(item?.category));
  const signalText = extraSignals.length ? ` Secondary signals: ${extraSignals.join(" and ")}.` : "";

  switch (mood) {
    case "mainstream":
      return `${pressure >= 60 ? "Pop, hip-hop, and broad challenge energy are carrying furthest." : "Mass-appeal material is winning, but only the cleanest hooks are sticking."}${dominantCategory ? ` Primary current: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "beef_season":
      return `${pressure >= 60 ? "Rap, drill, call-outs, and meme spillover are dominating visibility." : "Tension is present, but it still needs a flashpoint to fully storm."}${dominantCategory ? ` Current front: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "nostalgic":
      return `${pressure >= 60 ? "Throwback textures, catalog callbacks, and soft-focus sentiment are moving." : "Memory-heavy signals are present, but the feed is still calm enough for subtle plays."}${dominantCategory ? ` Leading lane: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "experimental":
      return `${pressure >= 60 ? "Genre-wave and sound-led experimentation are bending audience taste in real time." : "The feed is open to left turns, but only distinctive ideas are piercing through."}${dominantCategory ? ` Primary front: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "underground":
      return `${pressure >= 60 ? "Niche scenes, genre waves, and identity-first sounds are building underground pull." : "Low-visibility conditions favor scene credibility over polished volume."}${dominantCategory ? ` Surface read: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "messy":
      return `${pressure >= 60 ? "Spectacle, volatility, meme heat, and chaotic visibility are pushing everything around." : "Turbulence is in the air, but the timeline is still deciding what to reward."}${dominantCategory ? ` Active front: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "collab_season":
      return `${pressure >= 60 ? "Cross-genre features, joint drops, and duet content are dominating the feed." : "Collaborative energy is building — features and genre-crossing moves are landing cleanly."}${dominantCategory ? ` Primary convergence: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "hype_cycle":
      return `${pressure >= 60 ? "Rollout culture is at full pressure — snippets, teasers, and announcements are the only content that matters." : "The machine is warming up — pre-release positioning is where the action is."}${dominantCategory ? ` Leading edge: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "viral_spiral":
      return `${pressure >= 60 ? "The feed is in full spiral — trends are peaking and dying inside a single news cycle." : "Short-form content is taking over, but the spiral hasn't locked in its direction yet."}${dominantCategory ? ` Rotating current: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "industry_exposed":
      return `${pressure >= 60 ? "Receipts, label drama, and fan accountability threads are saturating the timeline." : "Tea is brewing — the industry is in its investigative phase, and things are about to surface."}${dominantCategory ? ` Active exposure front: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    case "tour_season":
      return `${pressure >= 60 ? "Live music is the dominant format — tours, festivals, and stage energy are pulling the biggest numbers." : "The circuit is open — artists hitting the road are getting the clearest signal right now."}${dominantCategory ? ` Stage current: ${categoryLabel(dominantCategory)}.` : ""}${signalText}`;
    default:
      return `${dominantCategory ? `Primary current: ${categoryLabel(dominantCategory)}.` : "Industry conditions are shifting."}${signalText}`;
  }
}

function WeatherScene({ weather, accent, accentSoft, glowA, glowB }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <motion.div
        animate={{ x: [0, 18, -12, 0], y: [0, -8, 10, 0], opacity: [0.75, 1, 0.82, 0.75] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", top: -22, left: -30, width: 210, height: 120, background: `radial-gradient(ellipse at 30% 50%, ${glowA} 0%, transparent 72%)`, filter: "blur(22px)" }}
      />
      <motion.div
        animate={{ x: [0, -16, 14, 0], y: [0, 10, -6, 0], opacity: [0.55, 0.86, 0.6, 0.55] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", right: -24, top: -10, width: 190, height: 110, background: `radial-gradient(ellipse at 70% 50%, ${glowB} 0%, transparent 74%)`, filter: "blur(24px)" }}
      />

      {weather === "storm" && (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={`rain-${i}`}
              animate={{ y: [-10, 130], opacity: [0, 0.55, 0] }}
              transition={{ duration: 1.2 + i * 0.18, repeat: Infinity, ease: "linear", delay: i * 0.17 }}
              style={{
                position: "absolute",
                left: `${8 + i * 16}%`,
                top: -10,
                width: 2,
                height: 36,
                borderRadius: 999,
                background: "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.6), rgba(255,255,255,0))",
                transform: "rotate(18deg)",
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0, 0, 0.65, 0, 0], scale: [1, 1, 1.02, 1, 1] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0))" }}
          />
        </>
      )}

      {weather === "wind" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`wind-${i}`}
              animate={{ x: [-40, 230], opacity: [0, 0.4, 0] }}
              transition={{ duration: 4 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
              style={{
                position: "absolute",
                top: `${26 + i * 16}%`,
                width: 60,
                height: 1.5,
                borderRadius: 999,
                background: `linear-gradient(90deg, rgba(255,255,255,0), ${accentSoft}, rgba(255,255,255,0))`,
                filter: "blur(0.3px)",
              }}
            />
          ))}
        </>
      )}

      {weather === "fog" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`fog-${i}`}
              animate={{ x: [0, 16, -12, 0], opacity: [0.14, 0.28, 0.18, 0.14] }}
              transition={{ duration: 8 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
              style={{
                position: "absolute",
                left: `${-10 + i * 16}%`,
                bottom: `${12 + i * 10}%`,
                width: 120,
                height: 26,
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
                filter: "blur(16px)",
              }}
            />
          ))}
        </>
      )}

      {weather === "haze" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={`dust-${i}`}
              animate={{ y: [0, -10, 0], opacity: [0.18, 0.44, 0.18] }}
              transition={{ duration: 4.6 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
              style={{
                position: "absolute",
                left: `${18 + i * 15}%`,
                top: `${18 + (i % 2) * 12}%`,
                width: 4,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.45)",
                filter: "blur(0.4px)",
              }}
            />
          ))}
        </>
      )}

      {weather === "aurora" && (
        <>
          <motion.div
            animate={{ x: [0, 10, -8, 0], opacity: [0.25, 0.55, 0.32, 0.25] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 10, left: 0, right: 0, margin: "0 auto", width: 220, height: 70, background: `linear-gradient(90deg, rgba(255,255,255,0), ${accentSoft}, rgba(196,181,253,0.18), rgba(255,255,255,0))`, filter: "blur(18px)", borderRadius: 999 }}
          />
          <motion.div
            animate={{ x: [0, -12, 10, 0], opacity: [0.12, 0.35, 0.18, 0.12] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 28, left: 0, right: 0, margin: "0 auto", width: 180, height: 56, background: `linear-gradient(90deg, rgba(255,255,255,0), ${accent}, rgba(255,255,255,0))`, filter: "blur(24px)", borderRadius: 999 }}
          />
        </>
      )}

      {weather === "clear" && (
        <>
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.84, 1, 0.84] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 10, right: 16, width: 74, height: 74, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,248,196,0.96) 0%, rgba(253,224,71,0.75) 28%, rgba(253,224,71,0.22) 60%, rgba(255,255,255,0) 100%)", filter: "blur(1px)" }}
          />
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`sunray-${i}`}
              animate={{ opacity: [0.14, 0.32, 0.14], rotate: [-2, 2, -2] }}
              transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
              style={{
                position: "absolute",
                top: 10 + i * 8,
                right: 24 + i * 8,
                width: 150,
                height: 22,
                transformOrigin: "100% 50%",
                transform: `rotate(${22 + i * 10}deg)`,
                background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,248,196,0.55), rgba(255,255,255,0))",
                filter: "blur(10px)",
                borderRadius: 999,
              }}
            />
          ))}
          <motion.div
            animate={{ x: [0, 12, -8, 0], opacity: [0.16, 0.36, 0.2, 0.16] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 20, right: 10, width: 130, height: 36, background: `linear-gradient(90deg, rgba(255,255,255,0), ${accentSoft}, rgba(255,255,255,0))`, borderRadius: 999, filter: "blur(10px)" }}
          />
        </>
      )}

      {/* COLLAB SEASON — Warm Convergence: two glow orbs drifting toward each other */}
      {weather === "convergence" && (
        <>
          <motion.div
            animate={{ x: [0, 40, 80, 40, 0], opacity: [0.3, 0.6, 0.85, 0.6, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 14, left: 10, width: 80, height: 80, borderRadius: "50%", background: `radial-gradient(circle, ${accent} 0%, ${accentSoft} 50%, rgba(255,255,255,0) 100%)`, filter: "blur(18px)" }}
          />
          <motion.div
            animate={{ x: [0, -40, -80, -40, 0], opacity: [0.3, 0.6, 0.85, 0.6, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 14, right: 10, width: 80, height: 80, borderRadius: "50%", background: `radial-gradient(circle, ${glowB.replace("0.14", "0.55")} 0%, ${glowB} 55%, rgba(255,255,255,0) 100%)`, filter: "blur(18px)" }}
          />
          <motion.div
            animate={{ scaleX: [0.4, 1.0, 0.4], opacity: [0, 0.45, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 38, left: "15%", right: "15%", height: 14, borderRadius: 999, background: `linear-gradient(90deg, rgba(255,255,255,0), ${accent}, rgba(255,255,255,0))`, filter: "blur(8px)" }}
          />
        </>
      )}

      {/* HYPE CYCLE — Pressure Building: expanding pulse rings */}
      {weather === "pulse" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`pulse-${i}`}
              animate={{ scale: [0.5, 1.6], opacity: [0.55, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: i * 0.8 }}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 60,
                height: 60,
                borderRadius: "50%",
                border: `1.5px solid ${accent}`,
                opacity: 0,
              }}
            />
          ))}
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 28, height: 28, borderRadius: "50%", background: `radial-gradient(circle, ${accent} 0%, ${accentSoft} 70%, rgba(255,255,255,0) 100%)`, filter: "blur(4px)" }}
          />
        </>
      )}

      {/* VIRAL SPIRAL — Spiral System: fast rotating arc particles */}
      {weather === "spiral" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={`spiral-${i}`}
              animate={{ rotate: [i * 90, i * 90 + 360] }}
              transition={{ duration: 3 - i * 0.4, repeat: Infinity, ease: "linear" }}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 44 + i * 22,
                height: 44 + i * 22,
                borderRadius: "50%",
                border: `1.5px solid transparent`,
                borderTopColor: accent,
                borderRightColor: i % 2 === 0 ? accentSoft : "transparent",
                transform: `translate(-50%, -50%)`,
                filter: "blur(0.5px)",
                opacity: 0.7 - i * 0.1,
              }}
            />
          ))}
        </>
      )}

      {/* INDUSTRY EXPOSED — Flat Light: slow dim grey shimmer wash */}
      {weather === "overcast" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`overcast-${i}`}
              animate={{ x: [0, 20, -10, 0], opacity: [0.08, 0.20, 0.12, 0.08] }}
              transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i * 1.2 }}
              style={{
                position: "absolute",
                top: `${20 + i * 14}%`,
                left: `${-5 + i * 8}%`,
                width: "60%",
                height: 18,
                borderRadius: 999,
                background: "rgba(255,255,255,0.18)",
                filter: "blur(14px)",
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0.06, 0.14, 0.06] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, background: "rgba(148,163,184,0.07)", borderRadius: 18 }}
          />
        </>
      )}

      {/* TOUR SEASON — Open Sky: drifting sparkle/confetti particles */}
      {weather === "festival" && (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={`sparkle-${i}`}
              animate={{ y: [0, -40, -80], x: [0, (i % 2 === 0 ? 12 : -12)], opacity: [0, 0.7, 0] }}
              transition={{ duration: 3.5 + i * 0.4, repeat: Infinity, ease: "easeOut", delay: i * 0.55 }}
              style={{
                position: "absolute",
                bottom: `${10 + (i % 3) * 8}%`,
                left: `${12 + i * 14}%`,
                width: 4 + (i % 2) * 2,
                height: 4 + (i % 2) * 2,
                borderRadius: "50%",
                background: i % 3 === 0 ? accent : i % 3 === 1 ? glowA : glowB,
                filter: "blur(0.5px)",
              }}
            />
          ))}
          <motion.div
            animate={{ x: [0, 10, -6, 0], opacity: [0.18, 0.38, 0.22, 0.18] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", top: 12, left: 0, right: 0, margin: "0 auto", width: 200, height: 50, background: `linear-gradient(90deg, rgba(255,255,255,0), ${accentSoft}, rgba(255,255,255,0))`, filter: "blur(20px)", borderRadius: 999 }}
          />
        </>
      )}
    </div>
  );
}

export default function IndustryWeatherTile({ mood, platformSpotlight, trend, trends = [], profileId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const theme = WEATHER_THEME[mood] || WEATHER_THEME.mainstream;
  const Icon = theme.Icon;
  const spotlight = platformSpotlight ? PLATFORM_CONFIG[platformSpotlight] : null;
  const topTrends = useMemo(() => (trends || []).slice(0, 3), [trends]);
  const pressure = N(trend?.heat_score || topTrends[0]?.heat_score);
  const pressureLabel = pressure >= 75 ? "Severe" : pressure >= 45 ? "Building" : "Steady";
  const forecastCopy = useMemo(() => buildForecastCopy({ mood, trend, topTrends, pressure }), [mood, trend, topTrends, pressure]);

  const handleTrendAction = async (action, trendId) => {
    if (!profileId || !trendId || pendingAction) return;
    setPendingAction(action);
    const result = await invokeEdgeFunction("socialMedia", {
      action,
      artistId: profileId,
      trendId,
    });
    if (!result.success) {
      showToast(result.error || "Trend action failed", "error");
      setPendingAction(null);
      return;
    }

    const payload = result.data?.data || result.data || {};
    if (action === "boostTrend") {
      showToast(`Boosted ${payload.trendName || "trend"} · -${payload.energyCost || 10} energy`, "success");
    } else {
      const label = payload.backfired ? `Sabotage backfired on ${payload.trendName || "trend"}` : `Sabotaged ${payload.trendName || "trend"}`;
      showToast(label, payload.backfired ? "warning" : "success");
    }
    await onRefresh?.();
    setPendingAction(null);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        border: `1px solid ${theme.accentSoft.replace("0.22", "0.28").replace("0.24", "0.30").replace("0.20", "0.28")}`,
        background: theme.sky,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 38px rgba(0,0,0,0.22)`,
      }}
    >
      <WeatherScene weather={theme.weather} accent={theme.accent} accentSoft={theme.accentSoft} glowA={theme.glowA} glowB={theme.glowB} />
      <div style={{ position: "relative", zIndex: 1, padding: 14 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, color: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.56)" }}>
                  Industry Weather
                </span>
                {spotlight && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: spotlight.color, background: "rgba(0,0,0,0.14)", border: `1px solid ${spotlight.color.replace("0.78", "0.24")}`, borderRadius: 999, padding: "2px 7px" }}>
                    {spotlight.label} Spotlight
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 42, height: 42, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: `0 0 24px ${theme.accentSoft}` }}>
                  <Icon size={18} color={theme.accent} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.03em" }}>
                    {theme.condition}
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.62)", marginTop: 2 }}>
                    {theme.summary}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.44)", textTransform: "uppercase", letterSpacing: "0.16em" }}>
                    Current Front
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {trend?.name || "Quiet Conditions"}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 3, textTransform: "capitalize" }}>
                    {trend ? `${String(trend.category || "signal").replace(/_/g, " ")} · ${trend.status || "active"}` : "No dominant trend"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                    Pressure
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 0.95, color: "#fff", textShadow: `0 0 20px ${theme.accentSoft}` }}>
                    {Math.round(pressure)}°
                  </div>
                  <div style={{ fontSize: 9, color: theme.accent, fontWeight: 800, marginTop: 4 }}>
                    {pressureLabel}
                  </div>
                </div>
              </div>
            </div>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.28 }} style={{ marginTop: 2, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
              <ChevronDown size={16} />
            </motion.div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 5 }}>
                      Forecast
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", lineHeight: 1.45 }}>
                      {forecastCopy}
                    </div>
                  </div>
                  <div style={{ padding: "8px 10px", borderRadius: 14, background: "rgba(0,0,0,0.14)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 76 }}>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Mood</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, marginTop: 3 }}>{theme.condition}</div>
                  </div>
                  <div style={{ padding: "8px 10px", borderRadius: 14, background: "rgba(0,0,0,0.14)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 68 }}>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Heat</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 1 }}>{Math.round(pressure)}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  {(topTrends.length ? topTrends : [trend].filter(Boolean)).slice(0, 3).map((item) => {
                    const color = CATEGORY_COLORS[item?.category] || "#94a3b8";
                    const isBoosting = pendingAction === "boostTrend";
                    const isSabotaging = pendingAction === "sabotageTrend";
                    return (
                      <div key={item?.id || item?.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 11px", borderRadius: 14, background: "rgba(0,0,0,0.14)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item?.name || "Industry Quiet"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 8, fontWeight: 800, color, background: `${color}18`, border: `1px solid ${color}28`, borderRadius: 999, padding: "2px 7px", textTransform: "capitalize" }}>
                              {String(item?.category || "signal").replace(/_/g, " ")}
                            </span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>{item?.status || "active"}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.14em" }}>Heat</div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: theme.accent, marginTop: 3 }}>{Math.round(N(item?.heat_score))}</div>
                          {item?.id && (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                disabled={Boolean(pendingAction)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleTrendAction("boostTrend", item.id);
                                }}
                                style={{
                                  display: "inline-flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  justifyContent: "center",
                                  gap: 1,
                                  minWidth: 84,
                                  padding: "8px 11px",
                                  borderRadius: 16,
                                  background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 100%)",
                                  border: "1px solid rgba(134,239,172,0.26)",
                                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(16,185,129,0.12)",
                                  backdropFilter: "blur(14px)",
                                  color: "#d1fae5",
                                  cursor: pendingAction ? "default" : "pointer",
                                  opacity: pendingAction ? 0.6 : 1,
                                  textAlign: "left",
                                }}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  {isBoosting ? <Loader2 size={10} className="animate-spin" /> : null}
                                  Boost
                                </span>
                                <span style={{ fontSize: 8, color: "rgba(209,250,229,0.72)", letterSpacing: "0.03em" }}>Ride the front</span>
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(pendingAction)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleTrendAction("sabotageTrend", item.id);
                                }}
                                style={{
                                  display: "inline-flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  justifyContent: "center",
                                  gap: 1,
                                  minWidth: 92,
                                  padding: "8px 11px",
                                  borderRadius: 16,
                                  background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 100%)",
                                  border: "1px solid rgba(251,113,133,0.24)",
                                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(244,114,182,0.10)",
                                  backdropFilter: "blur(14px)",
                                  color: "#ffe4e6",
                                  cursor: pendingAction ? "default" : "pointer",
                                  opacity: pendingAction ? 0.6 : 1,
                                  textAlign: "left",
                                }}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  {isSabotaging ? <Loader2 size={10} className="animate-spin" /> : null}
                                  Sabotage
                                </span>
                                <span style={{ fontSize: 8, color: "rgba(255,228,230,0.72)", letterSpacing: "0.03em" }}>Break the pattern</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>Tap again to collapse</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
