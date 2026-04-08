import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import CareerPulseModal from "../components/home/CareerPulseModal";
import IndustryWeatherTile from "../components/home/IndustryWeatherTile";
import WelcomeModal from "../components/WelcomeModal";
import { buildCareerPulseContext, extractRivals, getTopTrendMatch } from "../components/home/careerPulseContext";
import { FESTIVAL_BANNER_META } from "../components/home/festivalBannerConfig";
import { getCitiesForRegion, getDestinations } from "@/lib/regionTravel";
import { normalizeRegion } from "@/lib/regionConstants";
import { fmt } from "@/utils/numberFormat";
import {
  TrendingUp, TrendingDown, Star, Users, Music2,
  Globe, AlertTriangle, Activity, ArrowUpRight, ArrowDownRight,
  Radio, ChevronRight, Mic2, ChevronDown, ChevronUp, X, MapPin, Pin,
} from "lucide-react";

const fmtDollar = (n) => `$${fmt(n)}`;

const REVENUE_BREAKDOWN_CONFIG = [
  { key: "streaming_revenue", label: "Streaming", color: "#60a5fa" },
  { key: "merch_revenue", label: "Merch", color: "#fb923c" },
  { key: "touring_revenue", label: "Touring", color: "#c084fc" },
  { key: "social_revenue", label: "Social", color: "#f472b6" },
  { key: "brand_deal_revenue", label: "Brand Deals", color: "#34d399" },
  { key: "fan_sub_revenue", label: "Fan Subs", color: "#22d3ee" },
  { key: "sync_licensing_revenue", label: "Sync", color: "#fbbf24" },
  { key: "collab_revenue", label: "Collabs", color: "#f87171" },
];

const getRevenueRows = (metrics = {}) => REVENUE_BREAKDOWN_CONFIG
  .map((entry) => ({
    label: entry.label,
    color: entry.color,
    val: Number(metrics?.[entry.key] || 0),
  }))
  .filter((entry) => entry.val > 0);

const sumRevenueMetrics = (metrics = {}) => REVENUE_BREAKDOWN_CONFIG
  .reduce((sum, entry) => sum + Number(metrics?.[entry.key] || 0), 0);

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CLOUT_TIERS = [
  { min: 90, label: "ICON",      color: "#f59e0b" },
  { min: 75, label: "SUPERSTAR", color: "#c084fc" },
  { min: 60, label: "STAR",      color: "#60a5fa" },
  { min: 45, label: "RISING",    color: "#34d399" },
  { min: 25, label: "INDIE",     color: "#94a3b8" },
  { min: 0,  label: "ROOKIE",    color: "#64748b" },
];
const getCloutTier = (c = 0) =>
  CLOUT_TIERS.find((t) => c >= t.min) || CLOUT_TIERS[5];

const MOOD_CONFIG = {
  mainstream:       { emoji: '📻', label: 'Mainstream',       color: 'rgba(99,102,241,0.85)'  },
  beef_season:      { emoji: '🔥', label: 'Beef Season',      color: 'rgba(239,68,68,0.85)'   },
  nostalgic:        { emoji: '🌀', label: 'Nostalgic',        color: 'rgba(139,92,246,0.85)'  },
  experimental:     { emoji: '⚡', label: 'Experimental',     color: 'rgba(234,179,8,0.85)'   },
  underground:      { emoji: '🕳️', label: 'Underground',      color: 'rgba(20,184,166,0.85)'  },
  messy:            { emoji: '💥', label: 'Messy Era',        color: 'rgba(249,115,22,0.85)'  },
  collab_season:    { emoji: '🤝', label: 'Collab Season',    color: 'rgba(52,211,153,0.85)'  },
  hype_cycle:       { emoji: '📈', label: 'Hype Cycle',       color: 'rgba(251,191,36,0.85)'  },
  viral_spiral:     { emoji: '🌪️', label: 'Viral Spiral',     color: 'rgba(244,114,182,0.85)' },
  industry_exposed: { emoji: '🧾', label: 'Industry Exposed', color: 'rgba(148,163,184,0.85)' },
  tour_season:      { emoji: '🎪', label: 'Tour Season',      color: 'rgba(167,139,250,0.85)' },
};

const PHASE_META = {
  TEASE:   { label: "TEASE",   color: "#67e8f9", pulse: true  },
  DROP:    { label: "DROP",    color: "#f472b6", pulse: true  },
  SUSTAIN: { label: "SUSTAIN", color: "#c084fc", pulse: false },
  FADE:    { label: "FADE",    color: "#f59e0b", pulse: false },
};

const TEA_STATIC = [
  "☕ The Algorithm is running HOT — experimental sounds are eating right now.",
  "💬 Fan wars are erupting between two rising drill artists. Engagement up 300%.",
  "📡 Platform spotlight shifted to Reel-O. Short clips going viral faster than ever.",
  "🤝 A surprise collab announcement just sent ripples through the charts.",
  "📉 Brand deals being pulled from artists with active scandals. Watch your rep.",
  "🔥 Underground scene heating up — authenticity is clocking more plays than polish.",
  "👀 A new trend just emerged. First movers will clean up.",
];

// ─────────────────────────────────────────────────────────────────────────────
// ArcRing — animated SVG progress ring
// ─────────────────────────────────────────────────────────────────────────────
function ArcRing({ pct = 0, size = 64, stroke = 4, color = "#a78bfa", children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${color}90)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AmbientBloom — era-color environmental glow
// ─────────────────────────────────────────────────────────────────────────────
function AmbientBloom({ color }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-40 -left-20 w-96 h-96 rounded-full blur-[140px] opacity-[0.08]" style={{ background: color }} />
      <div className="absolute top-1/3 -right-32 w-72 h-72 rounded-full blur-[100px] opacity-[0.05]" style={{ background: color }} />
      <div className="absolute -bottom-20 left-1/4 w-60 h-60 rounded-full blur-[90px] opacity-[0.04]" style={{ background: "#ec4899" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TeaWire — animated single-line industry ticker (from v1 TeaTicker pattern)
// ─────────────────────────────────────────────────────────────────────────────
function TeaWire({ newsItems = [] }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const liveHeadlines = newsItems.slice(0, 5).map(
    (n) => `${Number(n.impact_score || 0) > 0 ? "📈" : "📉"} ${n.headline || n.title}`
  );
  const all = [...liveHeadlines, ...TEA_STATIC];

  useEffect(() => {
    setIdx(0);
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % all.length);
        setVisible(true);
      }, 350);
    }, 4200);
    return () => clearInterval(t);
  }, [all.length]);

  return (
    <div
      className="mx-4 flex items-center gap-3 px-4 py-2.5 rounded-2xl overflow-hidden"
      style={{ background: "rgba(244,114,182,0.06)", border: "1px solid rgba(244,114,182,0.14)" }}
    >
      <div className="shrink-0 flex items-center gap-1.5">
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="w-1.5 h-1.5 rounded-full bg-pink-400"
        />
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-pink-400">TEA</span>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <motion.p
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: 0.28 }}
          className="text-[12px] text-white/55 truncate font-medium"
        >
          {all[idx % all.length]}
        </motion.p>
      </div>
    </div>
  );
}

function FestivalPromoterBanner({ notification, onOpen, onDismiss }) {
  if (!notification) return null;

  const banner = FESTIVAL_BANNER_META[notification.type] || FESTIVAL_BANNER_META.FESTIVAL_PROMOTER_OUTREACH;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-2 flex items-center gap-3 rounded-2xl px-4 py-2.5"
      style={{ background: banner.bg, border: banner.border }}
    >
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${banner.chipBg} border ${banner.chipBorder}`}>
        <Music2 className={`w-4 h-4 ${banner.icon}`} />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${banner.eyebrowText}`}>{banner.eyebrow}</p>
        <p className="text-[12px] text-white truncate">{notification.title}</p>
        {notification.subtitle && (
          <p className="text-[10px] text-white/55 truncate">{notification.subtitle}</p>
        )}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-black"
        style={{ background: banner.button }}
      >
        Amplifi
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-lg hover:bg-white/5"
        aria-label="Dismiss festival notification"
      >
        <X className="w-4 h-4 text-white/40" />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IdentityHero — compact master tile
// ─────────────────────────────────────────────────────────────────────────────
function IdentityHero({ profile, currentEra, onOpenRegionTravel }) {
  const artistName = profile?.artist_name || "Artist";
  const hype = Number(profile?.hype || 0);
  const avatarImg = profile?.artist_image || null;
  const rawGrowth = profile?.fan_growth;
  const followerGrowth = typeof rawGrowth === "number" ? rawGrowth : parseFloat(rawGrowth) || 0;
  const isNegative = followerGrowth < 0;
  const isNeutral = followerGrowth === 0;
  const trendColor = isNegative ? "text-rose-400" : isNeutral ? "text-white/35" : "text-emerald-400";
  const TrendIcon = isNegative ? TrendingDown : TrendingUp;
  const prefix = isNegative ? "" : "+";
  const cityLabel = profile?.current_city;
  const regionLabel = profile?.region || "Region";
  const locationLabel = cityLabel ? `${cityLabel}, ${regionLabel}` : regionLabel;
  const ringColor = currentEra?.theme_color || "#f472b6";
  const surfaceBorder = `${ringColor}22`;
  const surfaceGlow = `${ringColor}18`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-4 mt-4 overflow-hidden rounded-[24px]"
      style={{
        padding: "1px",
        background: `linear-gradient(145deg, ${surfaceBorder}, rgba(236,72,153,0.12), rgba(255,255,255,0.02) 72%)`,
      }}
    >
      <div
        className="relative rounded-[23px] px-5 py-5"
        style={{
          background: "linear-gradient(155deg, rgba(17,10,32,0.96) 0%, rgba(12,8,24,0.94) 42%, rgba(10,10,15,0.98) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(22px)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: surfaceGlow }} />
          <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full blur-3xl" style={{ background: "rgba(236,72,153,0.10)" }} />
        </div>

        <div className="relative flex items-center gap-4">
          <div className="shrink-0">
            <ArcRing pct={hype} size={72} stroke={4} color={ringColor}>
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 flex-shrink-0 bg-white/5"
                style={{ borderColor: `${ringColor}40`, boxShadow: `0 0 18px ${ringColor}22` }}>
                {avatarImg ? (
                  <img src={avatarImg} alt={artistName} className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-bold" style={{ color: `${ringColor}CC` }}>
                    {artistName[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </div>
            </ArcRing>
          </div>

          <div className="flex-1 min-w-0">
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: `${ringColor}90` }}>Artist Profile</p>
            <h2 className="truncate text-lg font-black text-white" style={{ textShadow: `0 0 20px ${ringColor}30` }}>{artistName}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-sm text-white/45">{fmt(profile?.followers || 100)} Fans</span>
              <div className="flex items-center gap-0.5">
                <TrendIcon className={`w-3 h-3 ${trendColor}`} />
                <span className={`${trendColor} text-xs font-medium`}>{prefix}{followerGrowth.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-white/60"
              style={{ background: `${ringColor}12`, border: `1px solid ${ringColor}22` }}>
              <MapPin className="w-2.5 h-2.5" />
              <span>{locationLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={onOpenRegionTravel} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                <Globe className="w-3 h-3 text-blue-400" />
              </button>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                <Pin className="w-3 h-3 text-violet-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RegionTravelSheet({ open, profile, travelingTo, onClose, onTravel }) {
  const currentRegion = normalizeRegion(profile?.region) || "United States";
  const followers = Number(profile?.followers || 0);
  const income = Number(profile?.income || 0);
  const destinations = useMemo(() => getDestinations(currentRegion), [currentRegion]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const accent = "#67e8f9";

  const selectedDestination = useMemo(
    () => destinations.find((destination) => destination.id === selectedRegionId) || null,
    [destinations, selectedRegionId],
  );
  const regionCities = useMemo(
    () => (selectedDestination ? getCitiesForRegion(selectedDestination.name) : []),
    [selectedDestination],
  );

  useEffect(() => {
    if (!open) {
      setSelectedRegionId(null);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[330] flex items-end justify-center bg-black/60 px-3 pb-4 pt-10 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full max-w-[22rem] rounded-[24px] p-3.5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: `${accent}B3` }}>Region Travel</p>
                <h3 className="mt-1 text-[16px] font-black text-white">
                  {selectedDestination ? `Choose city in ${selectedDestination.name}` : `Travel from ${currentRegion}`}
                </h3>
              </div>
              <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                <X className="h-4 w-4 text-white/45" />
              </button>
            </div>

            {selectedDestination && (
              <button
                type="button"
                onClick={() => setSelectedRegionId(null)}
                className="mb-2.5 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70"
              >
                Back to regions
              </button>
            )}

            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Cash</p>
                <p className="mt-1 text-sm font-black text-white">${Math.round(income).toLocaleString()}</p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Followers</p>
                <p className="mt-1 text-sm font-black text-white">{Math.round(followers).toLocaleString()}</p>
              </div>
            </div>

            {!selectedDestination && (
              <div className="hide-scrollbar max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {destinations.map((destination) => {
                  const lockedByFollowers = followers < Number(destination.unlockFollowers || 0);
                  const lockedByCash = !destination.isCurrentRegion && income < Number(destination.travelCost || 0);
                  const disabled = travelingTo || lockedByFollowers || lockedByCash;

                  return (
                    <button
                      key={destination.id}
                      type="button"
                      onClick={() => setSelectedRegionId(destination.id)}
                      disabled={disabled}
                      className="w-full rounded-[18px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed"
                      style={{
                        background: destination.isCurrentRegion ? `${accent}12` : "rgba(255,255,255,0.04)",
                        borderColor: destination.isCurrentRegion ? `${accent}45` : "rgba(255,255,255,0.08)",
                        opacity: disabled && !destination.isCurrentRegion ? 0.58 : 1,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black text-white">{destination.name}</p>
                            {destination.isCurrentRegion && <span className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]" style={{ background: `${accent}18`, color: accent }}>Current</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-white/45">{destination.description}</p>
                          {!destination.isCurrentRegion && lockedByFollowers && (
                            <p className="mt-1 text-[10px] font-semibold text-amber-300">Requires {Math.round(destination.unlockFollowers).toLocaleString()} followers</p>
                          )}
                          {!destination.isCurrentRegion && !lockedByFollowers && lockedByCash && (
                            <p className="mt-1 text-[10px] font-semibold text-rose-300">Need ${Math.round(destination.travelCost).toLocaleString()} cash to travel</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Cost</p>
                          <p className="mt-1 text-sm font-black text-white">{destination.isCurrentRegion ? "Here" : `$${Math.round(destination.travelCost).toLocaleString()}`}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedDestination && (
              <div className="hide-scrollbar max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {regionCities.length === 0 && (
                  <div className="rounded-[16px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/45">
                    No cities available for this region yet.
                  </div>
                )}
                {regionCities.map((city) => {
                  const cityKey = `${selectedDestination.id}:${city.name}`;
                  const disabled = Boolean(travelingTo);
                  const isCurrentCity = selectedDestination.isCurrentRegion && profile?.current_city === city.name;

                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => onTravel(selectedDestination, city.name)}
                      disabled={disabled || isCurrentCity}
                      className="w-full rounded-[18px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed"
                      style={{
                        background: isCurrentCity ? `${accent}12` : "rgba(255,255,255,0.04)",
                        borderColor: isCurrentCity ? `${accent}45` : "rgba(255,255,255,0.08)",
                        opacity: disabled || isCurrentCity ? 0.65 : 1,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black text-white">{city.name}</p>
                            {isCurrentCity && <span className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]" style={{ background: `${accent}18`, color: accent }}>Current</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-white/45">{(city.genres || []).slice(0, 3).join(" · ")}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Move</p>
                          <p className="mt-1 text-xs font-black text-white">
                            {travelingTo === cityKey ? "Traveling" : "Select"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RevDrillDown — inline expandable last-turn revenue breakdown
// ─────────────────────────────────────────────────────────────────────────────
function RevDrillDown({ metrics, open, onClose }) {
  const m = metrics || {};
  const rows = getRevenueRows(m);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="mt-3 rounded-2xl p-4 relative"
          style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}
        >
          <button onClick={onClose} className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <X size={11} className="text-white/40" />
          </button>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Last Turn Breakdown</p>
          {rows.length === 0 ? (
            <p className="text-[11px] text-white/35">No income this turn yet.</p>
          ) : (
            <div className="space-y-2.5">
              {rows.map((r) => {
                const pct = rows.reduce((s, x) => s + Number(x.val || 0), 0);
                const barW = pct > 0 ? (Number(r.val || 0) / pct) * 100 : 0;
                return (
                  <div key={r.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                        <span className="text-[11px] text-white/55">{r.label}</span>
                      </div>
                      <span className="text-[11px] font-bold" style={{ color: r.color }}>+{fmtDollar(r.val)}</span>
                    </div>
                    <div className="h-0.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <motion.div className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${barW}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        style={{ background: r.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BentoGrid — the SIGNAL command center
// ─────────────────────────────────────────────────────────────────────────────
function BentoGrid({
  profile, fanProfile, currentEra, lastTurnMetrics,
  trends: _trends, industryTrends, controversyCases, releases, careerSnapshot, turnState, onNavigate, onOpenCareerPulse, onRefreshHome,
}) {
  const [revOpen, setRevOpen] = useState(false);
  const tc = currentEra?.theme_color || "#a78bfa";
  const hype = Number(profile?.hype || 0);
  const clout = Number(profile?.clout || 0);
  const tier = getCloutTier(clout);
  const listeners = Number(fanProfile?.monthly_listeners || 0);
  const prevListeners = Number(fanProfile?.last_monthly_listeners || 0);
  const delta = listeners - prevListeners;
  const isGrowing = delta >= 0;
  const retention = Number(fanProfile?.retention_rate || 0);
  const momentum = Number(currentEra?.momentum || 0);
  const tension = Number(currentEra?.tension || 0);
  const phase = currentEra?.is_active ? PHASE_META[currentEra.phase] || PHASE_META.TEASE : null;
  // Industry Signal cell uses the dynamic `trends` table (algorithm engine).
  // looptok_active_trends (in `trends` state) stays for CareerPulse modal only.
  const topIndustryTrend = industryTrends[0] || null;
  const mood = MOOD_CONFIG[turnState?.algorithm_mood] || null;
  const topCase = controversyCases[0] || null;
  const topRelease = releases[0] || null;

  // Career progression
  const currentStageOrder = Number(careerSnapshot?.current_stage_order || 1);
  const nextStageOrder = Number(careerSnapshot?.next_stage_order || currentStageOrder + 1);
  const nextStageName = careerSnapshot?.next_stage_name || `Stage ${nextStageOrder}`;
  const nextThreshold = Number(careerSnapshot?.next_stage_threshold || 0);
  const listenerPct = nextThreshold > 0 ? Math.min(100, (listeners / nextThreshold) * 100) : 0;
  const hasPending = careerSnapshot?.pending_stage_order === currentStageOrder + 1;
  const pendingStreak = Number(careerSnapshot?.pending_stage_streak || 0);
  const stageName = careerSnapshot?.current_stage_name || careerSnapshot?.career_stage || profile?.career_stage || "Indie";

  const totalRev = sumRevenueMetrics(lastTurnMetrics);
  const actualTurnRevenue = Number(
    lastTurnMetrics?.net_income_applied
      ?? lastTurnMetrics?.revenue
      ?? lastTurnMetrics?.income_gained
      ?? totalRev
      ?? 0
  );

  const glass = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" };
  const cell = "relative rounded-2xl overflow-hidden";

  return (
    <div className="px-4 space-y-3">

      {/* ── Row 1: Career Stage (full width) ─────────────────── */}
      <motion.button
        whileTap={{ scale: 0.98 }} onClick={onOpenCareerPulse}
        className={`${cell} w-full p-4 text-left`}
        style={{ background: `linear-gradient(135deg,${tier.color}09,rgba(10,10,15,0.97))`, border: `1px solid ${tier.color}18` }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: `${tier.color}65` }}>Career Stage</p>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="font-black text-white text-[18px] leading-none tracking-tight">{stageName}</p>
              {hasPending && (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-[9px] font-black text-emerald-400 uppercase tracking-wider"
                >
                  REVIEW
                </motion.span>
              )}
            </div>

            {hasPending ? (
              <div>
                <p className="text-[10px] text-white/40 mb-2">Promotion streak: <span className="text-emerald-400 font-bold">{pendingStreak}/2 turns</span></p>
                <div className="flex gap-1.5">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex-1 h-1.5 rounded-full transition-colors"
                      style={{ background: i < pendingStreak ? "#34d399" : "rgba(255,255,255,0.08)" }} />
                  ))}
                </div>
              </div>
            ) : nextThreshold > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-white/35">→ {nextStageName}</p>
                  <p className="text-[10px] font-bold" style={{ color: tier.color }}>{Math.round(listenerPct)}%</p>
                </div>
                <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${listenerPct}%` }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    style={{ background: `linear-gradient(90deg, ${tier.color}88, ${tier.color})`, boxShadow: `0 0 6px ${tier.color}55` }} />
                </div>
                <p className="text-[9px] text-white/60 mt-1.5">{fmt(listeners)} of {fmt(nextThreshold)} monthly listeners</p>
              </div>
            ) : (
              <p className="text-[10px] text-white/60">Stage cap reached · {tier.label}</p>
            )}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            <div className="px-2.5 py-1.5 rounded-xl text-center"
              style={{ background: `${tier.color}14`, border: `1px solid ${tier.color}22` }}>
              <p className="text-[8px] font-black uppercase tracking-wider" style={{ color: `${tier.color}70` }}>Clout</p>
              <p className="text-[18px] font-black leading-none" style={{ color: tier.color, textShadow: `0 0 12px ${tier.color}55` }}>{clout}</p>
            </div>
            <p className="text-[8px] text-white/30">pts</p>
          </div>
        </div>
        <div className="absolute bottom-3 right-3 text-[9px] text-white/30">tap for more details</div>
      </motion.button>

      {/* ── Row 2: Revenue (2/3) + Hype ring (1/3) ───────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Revenue cell — tappable, reveals drill-down */}
        <div className={`${cell} col-span-2`}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setRevOpen((v) => !v)}
            className="w-full p-4 text-left"
            style={{ background: "linear-gradient(135deg,rgba(52,211,153,0.10),rgba(10,10,15,0.97))", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 16 }}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
          >
            <div className="absolute top-0 right-0 w-28 h-28 blur-3xl opacity-18 rounded-full" style={{ background: "#34d399" }} />
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Turn Revenue</p>
              {revOpen ? <ChevronUp size={12} className="text-emerald-400/60" /> : <ChevronDown size={12} className="text-emerald-400/60" />}
            </div>
            <p className="font-black text-white leading-none"
              style={{ fontSize: "32px", letterSpacing: "-0.04em", textShadow: "0 0 22px rgba(52,211,153,0.45)" }}>
              {fmtDollar(actualTurnRevenue)}
            </p>
            <p className="text-[10px] text-emerald-400/50 mt-1.5">{actualTurnRevenue > 0 ? "tap to see breakdown ↓" : "No income yet this turn"}</p>
          </motion.button>
          <RevDrillDown metrics={lastTurnMetrics} open={revOpen} onClose={() => setRevOpen(false)} />
        </div>

        {/* Hype ring */}
        <motion.button
          whileTap={{ scale: 0.97 }} onClick={() => onNavigate("/Career")}
          className={`${cell} p-3 flex flex-col items-center justify-center gap-2`}
          style={glass}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        >
          <ArcRing pct={hype} size={56} stroke={4}
            color={hype >= 70 ? "#f472b6" : hype >= 40 ? "#f59e0b" : "#94a3b8"}>
            <p className="font-black text-white text-[13px]">{Math.round(hype)}</p>
          </ArcRing>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/60">HYPE</p>
        </motion.button>
      </div>

      {/* ── Row 3: Era (1/2) + Listeners (1/2) ───────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Era cell */}
        <motion.button
          whileTap={{ scale: 0.98 }} onClick={() => onNavigate("/EraManagementApp")}
          className={`${cell} p-4 text-left`}
          style={currentEra?.is_active
            ? { background: `linear-gradient(145deg,${tc}14,rgba(10,10,15,0.97))`, border: `1px solid ${tc}28` }
            : glass}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
        >
          {currentEra?.is_active ? (
            <>
              <div className="absolute top-0 right-0 w-24 h-24 blur-3xl opacity-20 rounded-full" style={{ background: tc }} />
              {phase && (
                <motion.div
                  animate={phase.pulse ? { opacity: [1, 0.35, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="inline-flex items-center gap-1.5 mb-2.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: phase.color, boxShadow: `0 0 5px ${phase.color}` }} />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: phase.color }}>{phase.label}</span>
                </motion.div>
              )}
              <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-1.5" style={{ color: `${tc}65` }}>Active Era</p>
              <p className="font-black text-white text-[15px] leading-tight">{currentEra.era_name?.toUpperCase() || "UNTITLED ERA"}</p>

              {/* Momentum bar */}
              <div className="mb-2">
                <div className="flex justify-between mb-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/32">MOMENTUM</span>
                  <span className="text-[10px] font-black" style={{ color: tc }}>{momentum}</span>
                </div>
                <div className="h-1 w-full rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, momentum)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ background: tc, boxShadow: `0 0 6px ${tc}80` }} />
                </div>
              </div>

              {/* Tension bar */}
              {tension > 0 && (
                <div className="mb-2.5">
                  <div className="flex justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/32">TENSION</span>
                    <span className="text-[10px] font-black text-rose-400">{tension}</span>
                  </div>
                  <div className="h-1 w-full rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, tension)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      style={{ background: "#fb7185", boxShadow: "0 0 5px rgba(251,113,133,0.7)" }} />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(currentEra.aesthetic_tags || []).slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: `${tc}16`, color: `${tc}90`, border: `1px solid ${tc}20` }}>
                    {tag}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="min-h-[130px] flex flex-col items-center justify-center gap-2.5">
              <Music2 size={20} className="text-white/60" />
              <p className="text-[11px] font-black text-white/60 text-center">No Era Active</p>
              <span className="text-[10px] text-white/30">Tap to declare →</span>
            </div>
          )}
          <div className="flex items-center gap-0.5 mt-3">
            <span className="text-[9px] font-medium text-white/45">Manage</span>
            <ChevronRight size={10} className="text-white/30" />
          </div>
        </motion.button>

        {/* Listeners cell */}
        <motion.button
          whileTap={{ scale: 0.98 }} onClick={() => onNavigate("/Social")}
          className={`${cell} p-4 text-left flex flex-col`}
          style={glass}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        >
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">Monthly Listeners</p>
          <p className="font-black text-white leading-none mb-0.5"
            style={{ fontSize: "26px", letterSpacing: "-0.04em" }}>{fmt(listeners)}</p>

          <div className="flex items-center gap-1 mb-3">
            {isGrowing
              ? <ArrowUpRight size={11} className="text-emerald-400 shrink-0" />
              : <ArrowDownRight size={11} className="text-rose-400 shrink-0" />}
            <span className="text-[10px] font-bold" style={{ color: isGrowing ? "#34d399" : "#fb7185" }}>
              {isGrowing ? "+" : "-"}{fmt(Math.abs(delta))} this turn
            </span>
          </div>

          <div className="mt-auto flex items-center gap-3">
            <ArcRing pct={retention} size={44} stroke={3} color="#60a5fa">
              <span className="text-[9px] font-black text-white">{Math.round(retention)}</span>
            </ArcRing>
            <div>
              <p className="text-[9px] font-black text-white/60 uppercase tracking-wider">Retention</p>
              <p className="text-[11px] text-white/40">%</p>
            </div>
          </div>
        </motion.button>
      </div>

      {/* ── Row 4: Fans + Streaming rev strip ────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate("/Social")}
          className={`${cell} p-3.5 flex flex-col items-center gap-1.5 text-center`}
          style={glass} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.19 }}>
          <Users size={14} className="text-white/35" />
          <p className="font-black text-white leading-none mb-0.5"
            style={{ fontSize: "26px", letterSpacing: "-0.04em" }}>{fmt(profile?.fans ?? profile?.followers)}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Fans</p>
        </motion.button>

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate("/StreamifyApp")}
          className={`${cell} p-3.5 flex flex-col items-center gap-1.5 text-center`}
          style={glass} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.21 }}>
          <Radio size={14} className="text-blue-400/50" />
          <p className="font-black text-white leading-none mb-0.5"
            style={{ fontSize: "26px", letterSpacing: "-0.04em" }}>{fmtDollar(lastTurnMetrics?.streaming_revenue)}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Streaming</p>
        </motion.button>

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate("/Career")}
          className={`${cell} p-3.5 flex flex-col items-center gap-1.5 text-center`}
          style={glass} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.23 }}>
          <Activity size={14} className="text-violet-400/50" />
          <p className="font-black text-white leading-none mb-0.5"
            style={{ fontSize: "26px", letterSpacing: "-0.04em" }}>{fmtDollar(profile?.income || 0)}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Income</p>
        </motion.button>
      </div>

      {/* ── Row 5: Industry Signal (dynamic trends table + mood) ─ */}
      {(topIndustryTrend || mood) && (
        <IndustryWeatherTile
          mood={turnState?.algorithm_mood || "mainstream"}
          platformSpotlight={turnState?.platform_spotlight || null}
          trend={topIndustryTrend}
          trends={industryTrends}
          profileId={profile?.id}
          onRefresh={onRefreshHome}
        />
      )}

      {/* ── Row 6: Risk Alert (conditional) ──────────────────── */}
      {topCase && (
        <motion.button
          whileTap={{ scale: 0.98 }} onClick={() => onNavigate("/Social")}
          className={`${cell} w-full flex items-center gap-4 px-4 py-3.5`}
          style={{ background: "linear-gradient(135deg,rgba(251,113,133,0.07),rgba(10,10,15,0.97))", border: "1px solid rgba(251,113,133,0.18)" }}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}
        >
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(251,113,133,0.11)", border: "1px solid rgba(251,113,133,0.24)" }}>
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: "rgba(251,113,133,0.55)" }}>Risk Alert</p>
            <p className="font-black text-white text-[14px] leading-tight truncate">{topCase.title || "Active Controversy"}</p>
            <p className="text-[10px] text-white/30 mt-0.5">Phase: {topCase.phase || topCase.status} · Fan impact: {Math.round(topCase.fan_morale_delta_total || 0)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[8px] text-white/30 mb-0.5">Attention</p>
            <p className="font-black text-rose-400 text-[22px] leading-none">{Math.round(topCase.public_attention || 0)}%</p>
          </div>
        </motion.button>
      )}

      {/* ── Row 7: Top Release (conditional) ─────────────────── */}
      {topRelease && (
        <motion.button
          whileTap={{ scale: 0.98 }} onClick={() => onNavigate("/Studio")}
          className={`${cell} w-full flex items-center gap-4 px-4 py-3.5`}
          style={glass}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.29 }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(167,139,250,0.11)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <Music2 size={20} className="text-violet-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/48 mb-0.5">Top Release</p>
            <p className="font-black text-white text-[15px] leading-tight truncate tracking-tight">
              {topRelease.title || topRelease.release_name || "Untitled"}
            </p>
            <p className="text-[10px] text-white/30 mt-0.5">{fmt(topRelease.lifetime_streams || 0)} streams</p>
          </div>
          <ChevronRight size={14} className="text-white/32 shrink-0" />
        </motion.button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickDock — 5-button shortcut bar with live badges
// ─────────────────────────────────────────────────────────────────────────────
function QuickDock({ onNavigate, gigs, tours, brandDeals }) {
  const actions = [
    { label: "Studio",  icon: Music2,    route: "/Studio",            color: "#a78bfa" },
    { label: "Tour",    icon: Globe,     route: "/TouringAppV2",      color: "#60a5fa", badge: tours.length + gigs.length },
    { label: "Deals",   icon: Star,      route: "/BrandPortfolioApp", color: "#f59e0b", badge: brandDeals.length },
    { label: "Social",  icon: Users,     route: "/Social",            color: "#34d399" },
    { label: "Career",  icon: Activity,  route: "/Career",            color: "#f472b6" },
  ];
  return (
    <div className="px-4">
      <div className="grid grid-cols-5 gap-2">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.button
              key={a.label}
              whileTap={{ scale: 0.91 }}
              onClick={() => onNavigate(a.route)}
              className="relative flex flex-col items-center gap-1.5 py-3 rounded-2xl"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.04 }}
            >
              {a.badge > 0 && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: a.color }}>
                  <span className="text-[7px] font-black text-white">{a.badge}</span>
                </div>
              )}
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${a.color}14` }}>
                <Icon size={16} style={{ color: a.color }} />
              </div>
              <p className="text-[9px] font-black uppercase tracking-wider text-white/30">{a.label}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NewsWire — rotating single-line TEA + impact-coded news list
// ─────────────────────────────────────────────────────────────────────────────
function NewsWire({ news = [] }) {
  const items = news.slice(0, 5);
  if (!items.length) return null;
  return (
    <div className="px-4 space-y-0">
      {items.map((n, i) => {
        const impact = Number(n?.impact_score || 0);
        const accent = impact > 0 ? "#34d399" : impact < 0 ? "#fb7185" : "#64748b";
        const Icon = impact > 0 ? TrendingUp : impact < 0 ? TrendingDown : Activity;
        return (
          <motion.div
            key={n.id || i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.33 + i * 0.04 }}
            className="flex items-start gap-3 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}
          >
            <Icon size={12} style={{ color: accent }} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white/60 leading-snug font-medium">
                {n.headline || n.title || "Industry update"}
              </p>
              {n.body && (
                <p className="text-[10px] text-white/36 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ text, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-4 mb-2">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/60">{text}</p>
      {action && (
        <button onClick={onAction}
          className="flex items-center gap-0.5 text-[10px] font-bold text-white/30 hover:text-white/55 transition-colors">
          {action}<ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HomeV2 — SIGNAL — main page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeV2() {
  const navigate = useNavigate();
  const onNavigate = useCallback((path) => navigate(path), [navigate]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [currentEra, setCurrentEra] = useState(null);
  const [fanProfile, setFanProfile] = useState(null);
  const [releases, setReleases] = useState([]);
  const [news, setNews] = useState([]);
  const [lastTurnMetrics, setLastTurnMetrics] = useState(null);
  const [streak, setStreak] = useState(0);
  const [trends, setTrends] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [brandDeals, setBrandDeals] = useState([]);
  const [tours, setTours] = useState([]);
  const [controversyCases, setControversyCases] = useState([]);
  const [careerSnapshot, setCareerSnapshot] = useState(null);
  const [festivalPromoterOutreach, setFestivalPromoterOutreach] = useState(null);
  const [isCareerPulseOpen, setIsCareerPulseOpen] = useState(false);
  const [isRegionTravelOpen, setIsRegionTravelOpen] = useState(false);
  const [travelingTo, setTravelingTo] = useState(null);
  const [turnState, setTurnState] = useState(null);
  const [industryTrends, setIndustryTrends] = useState([]);

  const careerPulseContext = useMemo(() => {
    const topTrendMatch = getTopTrendMatch(trends, profile, currentEra);
    const rivals = extractRivals(news, profile);
    const negativeNews = (news || []).filter((item) => Number(item?.impact_score || 0) < 0);
    const activeRisk = negativeNews[0] || rivals[0] || null;
    const supportNet = sumRevenueMetrics(lastTurnMetrics);

    return buildCareerPulseContext({
      careerSnapshot,
      topTrendMatch,
      activeRisk,
      negativeNews,
      supportNet,
      currentEra,
      streak,
      fanProfile,
      profile,
    });
  }, [careerSnapshot, currentEra, fanProfile, lastTurnMetrics, news, profile, streak, trends]);

  const loadData = useCallback(async () => {
    try {
      const uid = localStorage.getItem("user_account_id");
      if (!uid) { setLoading(false); return; }

      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: uid });
      const p = profiles?.[0] || null;
      if (!p?.id) { setLoading(false); return; }
      setProfile(p);

      const [
        fanProf, rels, newsItems, gigsData, dealsData, toursData,
        turnHistory, eras, activeTrends, controversyData, careerSnap, promoterOutreach, turnStateData,
        industryTrendsData,
      ] = await Promise.all([
        supabaseClient.from("fan_profiles").select("*").eq("artist_id", p.id).maybeSingle()
          .then((r) => r.data || null).catch(() => null),
        supabaseClient.from("releases").select("*").eq("artist_id", p.id)
          .order("lifetime_streams", { ascending: false }).limit(8)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("news_items").select("*")
          .order("created_at", { ascending: false }).limit(12)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("gigs").select("*").eq("artist_id", p.id).eq("status", "scheduled")
          .gte("scheduled_date", new Date().toISOString().split("T")[0])
          .order("scheduled_date", { ascending: true }).limit(5)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("brand_deals").select("*").eq("artist_id", p.id).eq("status", "active").limit(3)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("tours").select("*").eq("artist_id", p.id).eq("status", "active").limit(2)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("turn_event_log").select("metadata").eq("player_id", p.id)
          .eq("event_type", "turn_summary").order("created_at", { ascending: false }).limit(5)
          .then((r) => r.data || []).catch(() => []),
        base44.entities.Era.filter({ artist_id: p.id }, "-created_date").catch(() => []),
        supabaseClient.from("looptok_active_trends").select("*")
          .order("intensity", { ascending: false }).limit(5)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("controversy_cases")
          .select("id,title,phase,status,public_attention,brand_trust_delta_total,fan_morale_delta_total")
          .eq("player_id", p.id).in("status", ["active", "escalating"]).limit(2)
          .then((r) => r.data || []).catch(() => []),
        supabaseClient.from("v_career_progression_snapshot").select("*").eq("artist_id", p.id).maybeSingle()
          .then((r) => r.data || null).catch(() => null),
        supabaseClient.from("notifications")
          .select("id,type,title,subtitle,body,deep_links,created_at,is_read")
          .eq("player_id", p.id)
          .in("type", [
            "FESTIVAL_PROMOTER_OUTREACH",
            "FESTIVAL_SELECTED",
            "FESTIVAL_LINEUP_LOCKED",
            "FESTIVAL_SETLIST_REMINDER",
            "FESTIVAL_STARTING_SOON",
          ])
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data || null).catch(() => null),
        supabaseClient.from("turn_state")
          .select("algorithm_mood, platform_spotlight, global_turn_id")
          .eq("id", 1)
          .single()
          .then((r) => r.data || null).catch(() => null),
        supabaseClient.from("trends")
          .select("id, name, category, status, heat_score, platform_affinity")
          .eq("is_active", true)
          .neq("status", "dead")
          .order("heat_score", { ascending: false })
          .limit(5)
          .then((r) => r.data || []).catch(() => []),
      ]);

      setFanProfile(fanProf);
      setReleases(rels.filter((r) => ["released", "charting", "completed"].includes(r.status)).slice(0, 6));
      setNews(newsItems);
      setGigs(gigsData);
      setBrandDeals(dealsData);
      setTours(toursData);
      setLastTurnMetrics(turnHistory[0]?.metadata || null);
      setCareerSnapshot(careerSnap);
      setFestivalPromoterOutreach(promoterOutreach);
      setTurnState(turnStateData);
      setIndustryTrends(industryTrendsData);

      let s = 0;
      for (const row of turnHistory) {
        const m = row?.metadata || {};
        const net = sumRevenueMetrics(m);
        if (net >= 0) s++; else break;
      }
      setStreak(s);
      setCurrentEra((eras || []).find((e) => e?.is_active) || null);
      setTrends(activeTrends);
      setControversyCases(controversyData);
    } catch (err) {
      console.error("[HomeV2]", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTravel = useCallback(async (destination, cityName) => {
    if (!profile?.id || !destination || !cityName) return;
    if ((Number(profile?.income || 0)) < Number(destination.travelCost || 0)) return;
    if ((Number(profile?.followers || 0)) < Number(destination.unlockFollowers || 0)) return;

    const travelKey = `${destination.id}:${cityName}`;
    setTravelingTo(travelKey);
    try {
      let nextRegion = profile?.region || destination.name;
      let nextIncome = profile?.income;
      let nextHype = profile?.hype;

      if (!destination.isCurrentRegion) {
        const regionTravelResult = await base44.functions.invoke("touring", {
          action: "travel",
          artistId: profile.id,
          destinationId: destination.id,
        });

        if (regionTravelResult?.error) throw new Error(regionTravelResult.error);

        nextRegion = regionTravelResult?.region || destination.name;
        nextIncome = regionTravelResult?.income ?? nextIncome;
        nextHype = regionTravelResult?.hype ?? nextHype;
      }

      const cityTravelResult = await base44.functions.invoke("touring", {
        action: "travelToCity",
        artistId: profile.id,
        city: cityName,
      });

      if (cityTravelResult?.error) throw new Error(cityTravelResult.error);

      setProfile((previous) => ({
        ...previous,
        region: nextRegion,
        current_region: nextRegion,
        current_city: cityTravelResult?.current_city || cityName,
        income: nextIncome ?? previous?.income,
        hype: nextHype ?? previous?.hype,
        energy: cityTravelResult?.energy ?? previous?.energy,
      }));

      setIsRegionTravelOpen(false);
    } catch (error) {
      console.error("[HomeV2] Travel error:", error?.message || error);
      await loadData();
    } finally {
      setTravelingTo(null);
    }
  }, [loadData, profile]);

  useEffect(() => {
    let active = true;
    loadData();
    const refresh = () => { if (active) loadData(); };
    window.addEventListener("turnAdvanced", refresh);
    window.addEventListener("profileUpdated", refresh);
    return () => {
      active = false;
      window.removeEventListener("turnAdvanced", refresh);
      window.removeEventListener("profileUpdated", refresh);
    };
  }, [loadData]);

  const markPromoterOutreachRead = useCallback(async (notificationId) => {
    if (!notificationId) return;
    try {
      await supabaseClient.from("notifications").update({ is_read: true }).eq("id", notificationId);
    } catch (error) {
      console.error("[HomeV2] Outreach mark read error:", error?.message || error);
    } finally {
      setFestivalPromoterOutreach(null);
    }
  }, []);

  const openPromoterOutreach = useCallback(async () => {
    if (festivalPromoterOutreach?.id) {
      await markPromoterOutreachRead(festivalPromoterOutreach.id);
    }
    navigate("/AmplifiApp");
  }, [festivalPromoterOutreach?.id, markPromoterOutreachRead, navigate]);

  const dismissPromoterOutreach = useCallback(async () => {
    if (!festivalPromoterOutreach?.id) return;
    await markPromoterOutreachRead(festivalPromoterOutreach.id);
  }, [festivalPromoterOutreach?.id, markPromoterOutreachRead]);

  const tc = currentEra?.theme_color || "#a78bfa";

  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
          className="w-7 h-7 border-2 border-white/5 border-t-white/40 rounded-full"
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <Mic2 className="w-8 h-8 text-white/32 mx-auto" />
          <p className="text-white/35 text-[14px]">No profile found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-14 max-w-[430px] mx-auto">

      <WelcomeModal />

      {/* Fixed ambient bloom — era color bleeds through entire page */}
      <AmbientBloom color={tc} />

      {/* ── 1. IDENTITY HERO ──────────────────────────────────── */}
      <IdentityHero
        profile={profile}
        currentEra={currentEra}
        onOpenRegionTravel={() => setIsRegionTravelOpen(true)}
      />

      <FestivalPromoterBanner
        notification={festivalPromoterOutreach}
        onOpen={openPromoterOutreach}
        onDismiss={dismissPromoterOutreach}
      />

      {/* ── 2. SIGNAL BENTO GRID ──────────────────────────────── */}
      <div className="mt-1">
        <BentoGrid
          profile={profile}
          fanProfile={fanProfile}
          currentEra={currentEra}
          lastTurnMetrics={lastTurnMetrics}
          trends={trends}
          industryTrends={industryTrends}
          controversyCases={controversyCases}
          releases={releases}
          careerSnapshot={careerSnapshot}
          turnState={turnState}
          onNavigate={onNavigate}
          onOpenCareerPulse={() => setIsCareerPulseOpen(true)}
          onRefreshHome={loadData}
        />
      </div>

      {/* ── 3. QUICK DOCK ─────────────────────────────────────── */}
      <div className="mt-4">
        <SectionLabel text="Quick Access" />
        <QuickDock onNavigate={onNavigate} gigs={gigs} tours={tours} brandDeals={brandDeals} />
      </div>

      {/* ── 4. INDUSTRY FEED ──────────────────────────────────── */}
      <div className="mt-5">
        <SectionLabel text="Industry Wire" />
        <TeaWire newsItems={news} />
        {news.length > 0 && (
          <div className="mt-3">
          <NewsWire news={news} />
          </div>
        )}
      </div>
      <CareerPulseModal
        artistId={profile?.id}
        initialSnapshot={careerSnapshot}
        context={careerPulseContext}
        open={isCareerPulseOpen}
        onClose={() => setIsCareerPulseOpen(false)}
      />
      <RegionTravelSheet
        open={isRegionTravelOpen}
        profile={profile}
        travelingTo={travelingTo}
        onClose={() => setIsRegionTravelOpen(false)}
        onTravel={handleTravel}
      />
    </div>
  );
}
