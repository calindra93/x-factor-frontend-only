import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Radio, Flame, Sparkles, Waves, Disc3, CloudLightning } from "lucide-react";

const MOOD_THEME = {
  mainstream: {
    label: "Mainstream",
    forecast: "Mainstream Skies",
    summary: "Glossy conditions favor broad hooks, easy replay, and mass-appeal moments.",
    accent: "#818cf8",
    orb: "#c084fc",
    icon: Radio,
    background: "linear-gradient(135deg, rgba(99,102,241,0.20) 0%, rgba(168,85,247,0.14) 45%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(129,140,248,0.22)",
    auroraB: "rgba(244,114,182,0.16)",
    radar: "rgba(129,140,248,0.55)",
  },
  beef_season: {
    label: "Beef Season",
    forecast: "Stormfront Conditions",
    summary: "Conflict is magnetizing attention. Tension, call-outs, and rivalry heat cut through fastest.",
    accent: "#f87171",
    orb: "#fb7185",
    icon: CloudLightning,
    background: "linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(249,115,22,0.16) 42%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(248,113,113,0.22)",
    auroraB: "rgba(251,146,60,0.16)",
    radar: "rgba(248,113,113,0.60)",
  },
  nostalgic: {
    label: "Nostalgic",
    forecast: "Twilight Haze",
    summary: "Soft-focus memory is winning. Throwback textures and emotional callbacks are landing.",
    accent: "#c084fc",
    orb: "#f9a8d4",
    icon: Waves,
    background: "linear-gradient(135deg, rgba(168,85,247,0.20) 0%, rgba(251,191,36,0.12) 44%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(192,132,252,0.20)",
    auroraB: "rgba(251,191,36,0.14)",
    radar: "rgba(196,181,253,0.60)",
  },
  experimental: {
    label: "Experimental",
    forecast: "Prism Aurora",
    summary: "Genre-bending weather. Strange textures, boundary-pushing choices, and left turns are favored.",
    accent: "#fbbf24",
    orb: "#22d3ee",
    icon: Sparkles,
    background: "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(34,211,238,0.14) 35%, rgba(192,132,252,0.18) 70%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(34,211,238,0.22)",
    auroraB: "rgba(192,132,252,0.16)",
    radar: "rgba(34,211,238,0.58)",
  },
  underground: {
    label: "Underground",
    forecast: "Subsurface Pressure",
    summary: "Niche scenes are rising under the surface. Distinct identity and scene credibility are carrying farther.",
    accent: "#2dd4bf",
    orb: "#34d399",
    icon: Disc3,
    background: "linear-gradient(135deg, rgba(20,184,166,0.20) 0%, rgba(52,211,153,0.14) 42%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(45,212,191,0.20)",
    auroraB: "rgba(52,211,153,0.14)",
    radar: "rgba(45,212,191,0.58)",
  },
  messy: {
    label: "Messy Era",
    forecast: "Turbulence Warning",
    summary: "Chaotic visibility is in play. Unfiltered narratives, spectacle, and volatility are driving attention.",
    accent: "#fb923c",
    orb: "#f472b6",
    icon: Flame,
    background: "linear-gradient(135deg, rgba(249,115,22,0.20) 0%, rgba(244,114,182,0.16) 44%, rgba(10,10,15,0.98) 100%)",
    auroraA: "rgba(251,146,60,0.22)",
    auroraB: "rgba(244,114,182,0.16)",
    radar: "rgba(251,146,60,0.62)",
  },
};

const CATEGORY_META = {
  sound: { label: "Sound", color: "#60a5fa" },
  aesthetic: { label: "Aesthetic", color: "#f472b6" },
  challenge: { label: "Challenge", color: "#fbbf24" },
  meme: { label: "Meme", color: "#fb923c" },
  beef: { label: "Beef", color: "#f87171" },
  genre_wave: { label: "Genre Wave", color: "#34d399" },
};

const PLATFORM_META = {
  looptok: { label: "LoopTok", color: "#f472b6" },
  instavibe: { label: "InstaVibe", color: "#c084fc" },
  vidwave: { label: "VidWave", color: "#60a5fa" },
};

function N(v) {
  return Number(v) || 0;
}

function pressureLabel(heat) {
  if (heat >= 75) return "High pressure";
  if (heat >= 45) return "Building";
  return "Low pressure";
}

export default function AlgorithmForecastCard({ mood = "mainstream", platformSpotlight = null, trends = [] }) {
  const theme = MOOD_THEME[mood] || MOOD_THEME.mainstream;
  const Icon = theme.icon;

  const topTrends = useMemo(() => {
    return [...(trends || [])]
      .sort((a, b) => N(b.heat_score) - N(a.heat_score))
      .slice(0, 2);
  }, [trends]);

  const radarPoints = useMemo(() => {
    const points = topTrends.length ? topTrends : [{ heat_score: 50 }, { heat_score: 32 }];
    return points.map((trend, index) => {
      const angle = (-90 + index * 110) * (Math.PI / 180);
      const radius = 14 + Math.min(16, N(trend.heat_score) * 0.18);
      return {
        x: 34 + Math.cos(angle) * radius,
        y: 34 + Math.sin(angle) * radius,
      };
    });
  }, [topTrends]);

  const spotlight = platformSpotlight ? PLATFORM_META[platformSpotlight] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.06 }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        border: `1px solid ${theme.accent}2c`,
        background: theme.background,
        padding: 16,
        color: "#fff",
        minHeight: 214,
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <motion.div
          animate={{ x: [0, 14, -10, 0], y: [0, -10, 6, 0], opacity: [0.9, 1, 0.85, 0.9] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: -8,
            left: -24,
            width: 240,
            height: 90,
            filter: "blur(24px)",
            background: `radial-gradient(ellipse at 30% 50%, ${theme.auroraA} 0%, transparent 72%)`,
          }}
        />
        <motion.div
          animate={{ x: [0, -16, 10, 0], y: [0, 8, -6, 0], opacity: [0.72, 0.9, 0.78, 0.72] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            right: -24,
            top: 18,
            width: 220,
            height: 96,
            filter: "blur(22px)",
            background: `radial-gradient(ellipse at 70% 50%, ${theme.auroraB} 0%, transparent 72%)`,
          }}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: `${theme.accent}` }}>
                Algorithm Forecast
              </span>
              {spotlight && (
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: spotlight.color,
                  background: `${spotlight.color}14`,
                  border: `1px solid ${spotlight.color}24`,
                  borderRadius: 999,
                  padding: "2px 7px",
                }}>
                  {spotlight.label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.05 }}>
              {theme.forecast}
            </div>
            <div style={{ marginTop: 4, fontSize: 10.5, color: "rgba(255,255,255,.56)", maxWidth: 230, lineHeight: 1.45 }}>
              {theme.summary}
            </div>
          </div>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${theme.accent}12`,
            border: `1px solid ${theme.accent}24`,
            boxShadow: `0 0 22px ${theme.accent}18`,
            flexShrink: 0,
          }}>
            <Icon size={16} color={theme.accent} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ position: "relative", width: 118, height: 78, flexShrink: 0 }}>
            <motion.div
              animate={{ scale: [1, 1.06, 0.98, 1], opacity: [0.85, 1, 0.9, 0.85] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: "absolute",
                left: 4,
                top: 8,
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,.92) 0%, ${theme.orb} 24%, ${theme.accent} 60%, rgba(10,10,15,.2) 100%)`,
                boxShadow: `0 0 24px ${theme.orb}55, 0 0 48px ${theme.accent}24`,
              }}
            />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              style={{
                position: "absolute",
                left: -4,
                top: 0,
                width: 82,
                height: 82,
                borderRadius: "50%",
                border: `1px solid ${theme.accent}22`,
              }}
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
              style={{
                position: "absolute",
                left: 8,
                top: 12,
                width: 58,
                height: 58,
                borderRadius: "50%",
                border: `1px solid ${theme.orb}20`,
              }}
            />
            <div style={{ position: "absolute", right: 0, top: 3, width: 68, height: 68, borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(10px)" }}>
              <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
                <circle cx="34" cy="34" r="24" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                <circle cx="34" cy="34" r="16" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
                <path d={`M ${radarPoints.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`} fill={`${theme.radar}18`} stroke={theme.radar} strokeWidth="1.3" />
                {radarPoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r="2.4" fill={theme.radar} />
                ))}
              </svg>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.42)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
              Current Pressure
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ padding: "7px 9px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Mood
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, marginTop: 2 }}>
                  {theme.label}
                </div>
              </div>
              <div style={{ padding: "7px 9px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Signal
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", marginTop: 2 }}>
                  {topTrends[0] ? pressureLabel(topTrends[0].heat_score) : "Settled"}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,.72)" }}>
              Forecast says <span style={{ color: theme.accent, fontWeight: 700 }}>{theme.label.toLowerCase()}</span> conditions are shaping the feed right now.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.42)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>
            Top Currents
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.32)" }}>
            Canonical global trends
          </div>
        </div>

        <div style={{ display: "grid", gap: 7 }}>
          {topTrends.length > 0 ? topTrends.map((trend) => {
            const category = CATEGORY_META[trend.category] || { label: trend.category || "Trend", color: "#94a3b8" };
            return (
              <div key={trend.id} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 14,
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {trend.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: category.color,
                      background: `${category.color}14`,
                      border: `1px solid ${category.color}22`,
                      borderRadius: 999,
                      padding: "2px 7px",
                    }}>
                      {category.label}
                    </span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,.35)" }}>
                      {String(trend.status || "active").replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 1 }}>
                    Heat
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: theme.accent, marginTop: 2 }}>
                    {Math.round(N(trend.heat_score))}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "11px 12px", borderRadius: 14, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
              No active canonical trends surfaced yet.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
