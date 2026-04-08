// src/pages/Career.jsx
// ─────────────────────────────────────────────────────────
//  Drop-in replacement for the Career page (Vite + React + Tailwind)
//  All sub-components are inlined here. Remove the old component files
//  (EraWidget, CareerStageWidget, CareerInsights, AppsGrid,
//   CareerScenarioPlanner) once you swap this file in.
//
//  External deps used:
//    lucide-react, recharts, framer-motion
//
//  Navigation: pass an `onNavigate(route)` prop to <Career /> and wire
//  it to whatever router your project uses, or leave it undefined to
//  no-op (safe default).
// ─────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, Users, Flame, BarChart3, RefreshCw,
  Crown, Zap, ChevronDown, TrendingUp,
  Shirt, Ticket, BarChart2, AlertCircle,
  Loader2, Mic2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Real project imports ─────────────────────────────────────────────────────
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, supabaseClient } from "@/lib/supabaseClient";
import CareerProgressionModal from "@/components/career/CareerProgressionModal";
import TabbedInsights from "@/components/career/TabbedInsights";
import SampleRoyaltyDashboard from "@/components/career/SampleRoyaltyDashboard";
import {
  PERSONA_DISPLAY_LABELS,
  computeMarketPositioning, computeBrandCompatibility,
  trajectoryLabel, stabilityLabel, riskLabel, normalizePersonaId,
} from "@/data/brandIdentityHelpers";
import { fmt } from "@/utils/numberFormat";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Fallback data ────────────────────────────────────────────────────────────
const buildFallbackProfile = () => ({
  id: "fallback-career",
  artist_name: "Demo Artist",
  followers: 110,
  clout: 5,
  income: 700,
  hype: 40,
  region: "United States",
  career_stage: "Unknown",
});

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG = {
  "Unknown":            { icon: "👤", color: "text-gray-400",    accent: "#9ca3af", bg: "from-gray-500/20 to-gray-600/5",     desc: "Just getting started." },
  "Local Artist":       { icon: "🌱", color: "text-gray-300",    accent: "#d1d5db", bg: "from-gray-400/20 to-gray-500/5",     desc: "Every fan counts." },
  "Local Buzz":         { icon: "🎤", color: "text-emerald-400", accent: "#34d399", bg: "from-emerald-500/20 to-emerald-700/5", desc: "The grind is paying off." },
  "Underground Artist": { icon: "🎸", color: "text-blue-400",    accent: "#60a5fa", bg: "from-blue-500/20 to-blue-700/5",     desc: "Building a loyal cult." },
  "Cult Favorite":      { icon: "🔥", color: "text-orange-400",  accent: "#fb923c", bg: "from-orange-500/20 to-orange-700/5", desc: "The underground knows your name." },
  "Breakout Artist":    { icon: "🚀", color: "text-cyan-400",    accent: "#22d3ee", bg: "from-cyan-500/20 to-cyan-700/5",     desc: "Industry eyes are on you." },
  "Mainstream Artist":  { icon: "⭐", color: "text-yellow-400",  accent: "#facc15", bg: "from-yellow-500/20 to-yellow-700/5", desc: "The world knows your name." },
  "A-List Star":        { icon: "💎", color: "text-pink-400",    accent: "#f472b6", bg: "from-pink-500/20 to-pink-700/5",     desc: "Arenas sell out in minutes." },
  "Global Superstar":   { icon: "🌍", color: "text-amber-400",   accent: "#fbbf24", bg: "from-amber-500/20 to-amber-700/5",   desc: "Stadiums. Private jets. Everywhere." },
  "Legacy Icon":        { icon: "👑", color: "text-purple-400",  accent: "#c084fc", bg: "from-purple-500/20 to-purple-700/5", desc: "Your influence spans generations." },
};

// ─── Clout tiers ─────────────────────────────────────────────────────────────
const CLOUT_TIERS = [
  { min: 0,    max: 19,         name: "Unknown",          icon: "👤" },
  { min: 20,   max: 79,         name: "Local Buzz",       icon: "🔥" },
  { min: 80,   max: 199,        name: "Scene Regular",    icon: "🎵" },
  { min: 200,  max: 499,        name: "Industry Noticed", icon: "👁️" },
  { min: 500,  max: 999,        name: "Established",      icon: "⚡" },
  { min: 1000, max: 2499,       name: "A-List",           icon: "💫" },
  { min: 2500, max: Infinity,   name: "Icon",             icon: "👑" },
];

const getCloutTier = (clout = 0) =>
  CLOUT_TIERS.find((t) => clout >= t.min && clout <= t.max) || CLOUT_TIERS[0];

// ─── Legendary moments stub ───────────────────────────────────────────────────
const PLAYER_TRIGGERED_MOMENTS = {
  "Unknown": [],
  "Local Artist": [
    { type: "viral_moment",      name: "Viral Breakthrough",  story: "Your track unexpectedly blows up on social media.",   cost: 500,   requirements: { hype: 30, followers: 50 },  unlocks: ["SOCIAL_BOOST"] },
    { type: "first_collab",      name: "First Collab",        story: "Team up with a fellow underground act.",              cost: 300,   requirements: { followers: 30 },             unlocks: ["COLLAB_NETWORK"] },
    { type: "blog_feature",      name: "Blog Feature",        story: "An indie blog gives you your first write-up.",       cost: 200,   requirements: { hype: 20 },                  unlocks: ["PRESS_KIT"] },
  ],
  "Local Buzz": [
    { type: "local_headline",    name: "Local Headliner",     story: "Sell out your first 200-cap venue.",                  cost: 800,   requirements: { followers: 150, hype: 40 },  unlocks: ["TOURING_UNLOCK"] },
    { type: "radio_spin",        name: "Radio Spin",          story: "College radio puts you in rotation.",                cost: 600,   requirements: { hype: 35 },                  unlocks: ["RADIO_NETWORK"] },
  ],
  "Underground Artist": [
    { type: "sync_deal",         name: "Sync Deal",           story: "Your song lands in a popular TV show.",              cost: 2000,  requirements: { followers: 500, hype: 55 },  unlocks: ["SYNC_REVENUE"] },
    { type: "label_interest",    name: "Label Interest",      story: "A mid-tier label reaches out.",                      cost: 0,     requirements: { followers: 800 },            unlocks: ["LABEL_DEAL"] },
    { type: "festival_slot",     name: "Festival Slot",       story: "You land a daytime slot at a regional festival.",    cost: 1500,  requirements: { clout: 50 },                 unlocks: ["FESTIVAL_CIRCUIT"] },
  ],
  "Cult Favorite": [
    { type: "major_feature",     name: "Major Feature",       story: "Collab with a top-charting act.",                    cost: 5000,  requirements: { followers: 5000, hype: 70 }, unlocks: ["CHART_BOOST"] },
    { type: "brand_deal",        name: "Brand Deal",          story: "A lifestyle brand sponsors your next drop.",         cost: 0,     requirements: { clout: 300 },                unlocks: ["BRAND_REVENUE"] },
  ],
  "Breakout Artist": [
    { type: "world_tour",        name: "World Tour",          story: "Announce a sold-out global arena tour.",             cost: 25000, requirements: { followers: 50000, clout: 700 }, unlocks: ["TOUR_REVENUE_MAX"] },
    { type: "grammy_campaign",   name: "Awards Campaign",     story: "Push hard for awards recognition.",                  cost: 10000, requirements: { hype: 85 },                  unlocks: ["PRESTIGE_BOOST"] },
  ],
  "Mainstream Artist": [
    { type: "legacy_album",      name: "Legacy Album",        story: "Drop a defining album for the generation.",          cost: 50000, requirements: { followers: 500000 },         unlocks: ["LEGACY_STATUS"] },
  ],
  "A-List Star": [],
  "Global Superstar": [],
  "Legacy Icon": [],
};

const canTriggerMoment = (type, profile, stage) => {
  const moments = PLAYER_TRIGGERED_MOMENTS[stage] || [];
  const moment = moments.find((m) => m.type === type);
  if (!moment) return { can: false, reason: "Not available at this stage" };
  for (const [key, val] of Object.entries(moment.requirements || {})) {
    if ((profile[key] || 0) < val)
      return { can: false, reason: `Need ${key}: ${fmt(val)}` };
  }
  return { can: true };
};

// ─── PullToRefresh ────────────────────────────────────────────────────────────
function PullToRefresh({ onRefresh, children }) {
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [canPull, setCanPull] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef(null);
  const THRESHOLD = 80, MAX = 120;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onStart = (e) => {
      if (el.scrollTop === 0 && !refreshing) {
        setCanPull(true);
        startY.current = e.touches[0].clientY;
      }
    };
    const onMove = (e) => {
      if (!canPull || refreshing) return;
      const d = Math.max(0, e.touches[0].clientY - startY.current);
      setPullDist(Math.min(d * 0.5, MAX));
      if (d > 10) e.preventDefault();
    };
    const onEnd = async () => {
      if (!canPull || refreshing) return;
      if (pullDist >= THRESHOLD) {
        setRefreshing(true);
        try { await onRefresh(); } catch {}
        setRefreshing(false);
      }
      setCanPull(false);
      setPullDist(0);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [canPull, refreshing, pullDist, onRefresh]);

  const shouldSpin = refreshing || pullDist >= THRESHOLD;
  return (
    <div ref={containerRef} className="overflow-y-auto h-full relative">
      <div className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-10"
        style={{ height: `${pullDist}px`, opacity: Math.min(pullDist / THRESHOLD, 1) }}>
        <Loader2 className={`w-5 h-5 text-red-400 ${shouldSpin ? "animate-spin" : ""}`} />
      </div>
      <div style={{ transform: refreshing ? `translateY(${THRESHOLD}px)` : `translateY(${pullDist}px)`, transition: refreshing || !canPull ? "transform .2s ease-out" : "none" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, glow }) {
  return (
    <div className={`relative ${bg} rounded-2xl p-3 border border-white/[0.05] overflow-hidden flex flex-col gap-1`}
      style={{ boxShadow: `0 0 20px ${glow}18` }}>
      <div className={`absolute inset-0 rounded-2xl pointer-events-none`}
        style={{ background: `radial-gradient(circle at top left, ${glow}12, transparent 60%)` }} />
      <Icon className={`w-4 h-4 ${color} relative z-10`} />
      <p className="text-white text-base font-bold leading-none relative z-10 tabular-nums">{value}</p>
      <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest relative z-10">{label}</p>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">{children}</p>
  );
}

// ─── Career Stage Widget ──────────────────────────────────────────────────────
function CareerStageWidget({ profile, onMilestoneTriggered }) {
  const [triggering, setTriggering] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showProgression, setShowProgression] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const ms = await base44.entities.CareerMilestone?.filter({ artist_id: profile.id });
        if (ms) setMilestones(ms);
      } catch {}
    })();
  }, [profile?.id]);

  const stage = profile?.career_stage || "Indie Darling";
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG["Unknown"];
  const moments = PLAYER_TRIGGERED_MOMENTS[stage] || [];
  const completedTypes = milestones.map((m) => m.milestone_type);
  const visible = showAll ? moments : moments.slice(0, 2);

  const handleTrigger = async (moment) => {
    if (!profile) return;
    const check = canTriggerMoment(moment.type, profile, stage);
    if (!check.can) return;
    setTriggering(moment.type);
    try {
      const nm = await base44.entities.CareerMilestone?.create({
        artist_id: profile.id,
        milestone_type: moment.type,
        triggered_turn: 0,
        triggered_at: new Date().toISOString(),
        is_auto_triggered: false,
        unlocks: moment.unlocks || [],
        story_text: moment.story || "",
      });
      if (nm) {
        setMilestones((p) => [...p, nm]);
        onMilestoneTriggered?.(nm);
      }
    } catch {}
    setTriggering(null);
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      {/* Header – tap to expand */}
      <button className="w-full flex items-center gap-3 px-4 py-3.5 focus:outline-none"
        onClick={() => setExpanded((v) => !v)}>
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.bg} flex items-center justify-center text-xl`}>
          {cfg.icon}
        </div>
        <div className="flex-1 text-left">
          <h3 className={`text-sm font-bold ${cfg.color}`}>{stage}</h3>
          <p className="text-gray-500 text-[10px]">{cfg.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowProgression(true); }}
            aria-label="View career progression"
            className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-full px-2 py-0.5 text-purple-400 text-[10px] font-semibold hover:bg-purple-500/20 transition-colors"
          >
            <TrendingUp className="w-3 h-3" />
            Progress
          </button>
          <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2 py-0.5">
            <Crown className="w-3 h-3 text-yellow-400" />
            <span className="text-yellow-400 text-[10px] font-bold tabular-nums">{milestones.length}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 space-y-2 border-t border-white/[0.05]">
              <SectionLabel>Legendary Moments</SectionLabel>

              {moments.length === 0 ? (
                <p className="text-gray-600 text-xs py-2">No moments available yet</p>
              ) : (
                visible.map((moment) => {
                  const isCompleted = completedTypes.includes(moment.type);
                  const check = canTriggerMoment(moment.type, profile, stage);
                  return (
                    <div key={moment.type}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-white text-xs font-semibold capitalize leading-snug">
                              {moment.name || moment.type.replace(/_/g, " ")}
                            </h4>
                            {isCompleted && (
                              <span className="text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Done</span>
                            )}
                          </div>
                          <p className="text-gray-500 text-[10px] mt-0.5 leading-relaxed">{moment.story}</p>
                        </div>
                        <span className="text-yellow-400 text-[11px] font-bold whitespace-nowrap flex-shrink-0">
                          ${(moment.cost || 0).toLocaleString()}
                        </span>
                      </div>
                      {!isCompleted && (
                        <button
                          onClick={() => handleTrigger(moment)}
                          disabled={!check.can || triggering === moment.type}
                          className={`w-full h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
                            ${check.can
                              ? "bg-gradient-to-r from-red-500 to-pink-500 text-white active:scale-[0.97]"
                              : "bg-white/[0.04] text-gray-600 border border-white/[0.06] cursor-not-allowed"
                            }`}
                        >
                          {triggering === moment.type ? (
                            <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                          ) : check.can ? (
                            <><Zap className="w-3 h-3" /> Trigger</>
                          ) : (
                            <span className="text-[10px]">{check.reason}</span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}

              {moments.length > 2 && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 py-1.5 transition-colors">
                  {showAll ? "Show less" : `Show all ${moments.length}`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CareerProgressionModal
        open={showProgression}
        onClose={() => setShowProgression(false)}
        artistId={profile?.id}
      />
    </div>
  );
}

// ─── Career Insights (moved to TabbedInsights component) ─────────────────────



// ─── App Icons ────────────────────────────────────────────────────────────────
function SoundburstIcon({ active, className = "w-5 h-5" }) {
  const c = active ? ["#60a5fa", "#818cf8", "#a78bfa", "#c084fc"] : ["currentColor", "currentColor", "currentColor", "currentColor"];
  const op = active ? [1, 1, 1, 1] : [0.5, 0.6, 0.7, 0.5];
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="8" width="2.5" height="8" rx="1.25" fill={c[0]} opacity={op[0]} />
      <rect x="8.5" y="5" width="2.5" height="14" rx="1.25" fill={c[1]} opacity={op[1]} />
      <rect x="13" y="3" width="2.5" height="18" rx="1.25" fill={c[2]} opacity={op[2]} />
      <rect x="17.5" y="7" width="2.5" height="10" rx="1.25" fill={c[3]} opacity={op[3]} />
      {active && <circle cx="19" cy="5" r="1.5" fill="#f472b6" />}
    </svg>
  );
}

function StreamifyIcon({ active, className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 12c2-3 4-5 6-5s4 4 6 4 4-4 6-4" stroke={active ? "#8b5cf6" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" opacity={active ? 1 : 0.5} />
      <path d="M3 16c2-3 4-5 6-5s4 4 6 4 4-4 6-4" stroke={active ? "#a78bfa" : "currentColor"} strokeWidth="2" strokeLinecap="round" opacity={active ? 0.6 : 0.3} />
      {active && <circle cx="12" cy="6" r="2" fill="#c084fc" opacity="0.8" />}
    </svg>
  );
}

function AppleCoreIcon({ active, className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3c-1.5 0-3 .5-3 2s1 2 3 2c1.5 0 2-.5 2-1.5" stroke={active ? "#fb7185" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" opacity={active ? 0.8 : 0.4} />
      <path d="M12 7c-4 0-7 3-7 7 0 3.5 2.5 7 7 7s7-3.5 7-7c0-4-3-7-7-7z" fill={active ? "#fb7185" : "currentColor"} opacity={active ? 0.15 : 0.08} />
      <path d="M12 7c-4 0-7 3-7 7 0 3.5 2.5 7 7 7s7-3.5 7-7c0-4-3-7-7-7z" stroke={active ? "#fb7185" : "currentColor"} strokeWidth="1.5" opacity={active ? 1 : 0.5} />
      <ellipse cx="12" cy="14" rx="2" ry="3" fill={active ? "#fb7185" : "currentColor"} opacity={active ? 0.6 : 0.3} />
    </svg>
  );
}

// ─── Apps Grid ────────────────────────────────────────────────────────────────
function AppsGrid({ onOpenApp: _onOpenApp, onNavigatePlatform, onNavigateApp }) {
  // Streaming platforms — horizontal pill row
  const PLATFORMS = [
    { id: "soundburst", name: "Soundburst", Icon: (p) => <SoundburstIcon {...p} />, bg: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#93c5fd" },
    { id: "streamify",  name: "Streamify",  Icon: (p) => <StreamifyIcon {...p} />,  bg: "linear-gradient(135deg,#8b5cf6,#a855f7)", color: "#c4b5fd" },
    { id: "applecore",  name: "AppleCore",  Icon: (p) => <AppleCoreIcon {...p} />,  bg: "linear-gradient(135deg,#f43f5e,#ec4899)", color: "#fda4af" },
  ];

  // Career apps — iPhone-style icon grid (4 across)
  const APPS = [
    { id: "xtras",        name: "Xtras",    sub: "Merch",     Icon: Shirt,    bg: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fb923c" },
    { id: "ticketmaster", name: "Touring",  sub: "Tickets",   Icon: Ticket,   bg: "linear-gradient(135deg,#10b981,#059669)", color: "#34d399" },
    { id: "charts",       name: "Charts",   sub: "Rankings",  Icon: BarChart2, bg: "linear-gradient(135deg,#06b6d4,#0284c7)", color: "#22d3ee" },
    { id: "amplifi",      name: "Amplifi",  sub: "Festivals", Icon: Zap,      bg: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#d946ef" },
    { id: "brandportfolio", name: "Deals",  sub: "Brands",    Icon: DollarSign, bg: "linear-gradient(135deg,#C9A84C,#E8C87C)", color: "#C9A84C" },
  ];

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      {/* Streaming Platforms */}
      <div>
        <SectionLabel>Streaming Platforms</SectionLabel>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
          {PLATFORMS.map((app) => {
            const Icon = app.Icon;
            return (
              <button
                key={app.id}
                onClick={() => onNavigatePlatform(app)}
                style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}
              >
                <div style={{ width: 56, height: 56, borderRadius: 16, background: app.bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 16px ${app.color}55` }}>
                  <Icon style={{ color: "#fff", width: 24, height: 24 }} active />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{app.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Career Essentials — iPhone-style icon grid */}
      <div>
        <SectionLabel>Career Essentials</SectionLabel>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          {APPS.map((app) => {
            const Icon = app.Icon;
            return (
              <button
                key={app.id}
                onClick={() => onNavigateApp(app)}
                style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0 }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: app.bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 14px ${app.color}55` }}>
                  <Icon size={22} color="#fff" />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,.65)", textAlign: "center", lineHeight: 1.2 }}>{app.name}</span>
                <span style={{ fontSize: 8.5, color: "rgba(255,255,255,.3)", textAlign: "center" }}>{app.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Revenue Bar ──────────────────────────────────────────────────────────────
function RevenueBar({ streamRevenue, merchRevenue }) {
  const total = streamRevenue + merchRevenue;
  if (total <= 0) return null;
  const sPct = (streamRevenue / total) * 100;
  const mPct = (merchRevenue / total) * 100;

  return (
    <div className="px-4 pt-1 pb-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-gray-500 text-[9px] font-bold uppercase tracking-widest">Revenue Split</span>
        <span className="text-white text-[10px] font-bold tabular-nums">${fmt(total)}</span>
      </div>
      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden flex gap-[1px]">
        {sPct > 0 && <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${sPct}%` }} />}
        {mPct > 0 && <div className="h-full bg-gradient-to-r from-red-500 to-pink-400" style={{ width: `${mPct}%` }} />}
      </div>
      <div className="flex items-center gap-3 mt-1.5">
        <span className="text-[9px] text-blue-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" /> Streams ${fmt(streamRevenue)}
        </span>
        <span className="text-[9px] text-red-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Merch ${fmt(merchRevenue)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Career Page ─────────────────────────────────────────────────────────
const LOAD_TIMEOUT_MS = 30000;

export default function Career() {
  const navigate = useNavigate();
  const onNavigate = (route) => navigate(route);
  const [profile, setProfile] = useState(null);
  const [fanProfile, setFanProfile] = useState(null);
  const [releases, setReleases] = useState([]);
  const [merch, setMerch] = useState([]);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [fandomSegments, setFandomSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showRoyalties, setShowRoyalties] = useState(false);
  const [brandStats, setBrandStats] = useState(null);
  const [currentEra, setCurrentEra] = useState(null);
  const [identityQuickOpen, setIdentityQuickOpen] = useState(false);
  const activeRef = useRef(true);

  const continueWithFallback = useCallback(() => {
    setProfile(buildFallbackProfile());
    setFanProfile(null);
    setReleases([]);
    setMerch([]);
    setLoadError(null);
    setLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    const isActive = () => activeRef.current;
    try {
      setLoadError(null);
      const userAccountId = localStorage.getItem("user_account_id");
      if (!userAccountId) {
        if (isActive()) { setProfile(null); setLoading(false); }
        return;
      }
      if (!isSupabaseConfigured) {
        if (isActive()) continueWithFallback();
        return;
      }

      const withTimeout = (p, ms = 10000) =>
        Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

      const profiles = await withTimeout(
        base44.entities.ArtistProfile.filter({ user_account_id: userAccountId })
      );
      const p = profiles?.[0] || null;
      if (isActive()) setProfile(p);
      if (p?.id) localStorage.setItem("artist_id", p.id);

      if (!p?.id) {
        if (localStorage.getItem("dev_demo_mode") === "1") {
          if (isActive()) continueWithFallback();
          return;
        }
        if (isActive()) setLoading(false);
        return;
      }

      const safe = async (fn, fallback, ms = 15000) => {
        try { return await withTimeout(fn(), ms); } catch { return fallback; }
      };

      const [allReleases, allMerch, eras, fanProf, socAccounts, segRows] = await Promise.all([
        safe(() => base44.entities.Release.filter({ artist_id: p.id }, "-created_date", 50), []),
        safe(() => base44.entities.Merch.filter({ artist_id: p.id }, "-created_date", 20), []),
        safe(() => base44.entities.Era.filter({ artist_id: p.id }, "-created_date"), []),
        safe(() => base44.entities.FanProfile.filter({ artist_id: p.id }).then((f) => f[0] || null), null),
        safe(async () => { try { return await base44.entities.SocialAccount.filter({ artist_id: p.id }) || []; } catch { return []; } }, []),
        safe(() => base44.entities.FandomSegment.filter({ player_id: p.id }), []),
      ]);

      if (!isActive()) return;

      setReleases(allReleases);
      setMerch(allMerch);
      setFanProfile(fanProf);
      setSocialAccounts(Array.isArray(socAccounts) ? socAccounts : []);
      setFandomSegments(Array.isArray(segRows) ? segRows : []);

      // Brand identity data for the hero card
      try {
        const [bsR, eraR] = await Promise.all([
          supabaseClient.from("player_brand_stats")
            .select("*").eq("artist_id", p.id).eq("platform", "all").maybeSingle(),
          supabaseClient.from("eras")
            .select("*").eq("artist_id", p.id).eq("is_active", true).maybeSingle(),
        ]);
        if (isActive()) {
          setBrandStats(bsR.data || null);
          setCurrentEra(eraR.data || null);
        }
      } catch { /* non-fatal — hero card degrades gracefully */ }

      const activeEra = eras.find((e) => e.is_active);
      if (!activeEra && eras.length === 0) {
        try {
          const newEra = await withTimeout(
            base44.entities.Era.create({
              artist_id: p.id, era_name: "Debut Era", start_turn: 0, is_active: true,
              trigger_event: "auto", is_player_declared: false, theme_color: "#ff3b30",
              motifs: ["Hustle", "Identity", "Late Nights"], signature: "First Flame",
              focus_path: "DIGITAL_CULT", phase: "TEASE", phase_turns_left: 60,
              momentum: 15, tension: 10, volatility_level: 20, career_stage: "EARLY",
              budget_marketing: 0, budget_visuals: 0, budget_features: 0,
              budget_community: 0, budget_tourprep: 0, budget_total: 0,
              current_multiplier_streaming: 1, current_multiplier_virality: 1,
              current_multiplier_retention: 1, current_multiplier_hype_decay: 1,
            }),
            20000
          );
          if (isActive()) {
            await withTimeout(base44.entities.ArtistProfile.update(p.id, { active_era_id: newEra.id }), 15000);
          }
        } catch (e) {
          console.error("[Career] Era creation failed:", e.message);
        }
      }

      if (isActive()) setLoading(false);
    } catch (error) {
      console.error("[Career] Load error:", error.message);
      if (isActive()) {
        if (localStorage.getItem("dev_demo_mode") === "1") { continueWithFallback(); return; }
        setLoadError("Unable to sync career data right now.");
        setLoading(false);
      }
    }
  }, [continueWithFallback]);

  useEffect(() => {
    const onTurnAdvanced = () => { if (activeRef.current) loadData(); };
    const onProfileUpdate = (e) => { if (activeRef.current && e?.detail) setProfile(e.detail); };
    // Reload data when page regains visibility (covers back-navigation)
    const onVisibility = () => { if (document.visibilityState === 'visible' && activeRef.current) loadData(); };
    window.addEventListener("turnAdvanced", onTurnAdvanced);
    window.addEventListener("profileUpdated", onProfileUpdate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("turnAdvanced", onTurnAdvanced);
      window.removeEventListener("profileUpdated", onProfileUpdate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadData]);

  const loadCompleteRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    loadCompleteRef.current = false;
    loadData().finally(() => { loadCompleteRef.current = true; });
    const t = setTimeout(() => {
      if (activeRef.current && !loadCompleteRef.current) { setLoadError("Unable to sync career data right now."); setLoading(false); }
    }, LOAD_TIMEOUT_MS);
    return () => { activeRef.current = false; clearTimeout(t); };
  }, [loadData]);

  const totalStreams = useMemo(() => releases.reduce((s, r) => s + (r.lifetime_streams || 0), 0), [releases]);
  const streamRevenue = useMemo(() => releases.reduce((s, r) => s + (r.lifetime_revenue || 0), 0), [releases]);
  const merchRevenue = useMemo(() => merch.reduce((s, m) => s + (m.total_revenue || 0), 0), [merch]);

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin" />
          <div className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse" />
        </div>
        <p className="text-gray-600 text-xs">Loading career…</p>
      </div>
    );
  }

  // ── Error screen ──
  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-gray-400 text-sm leading-relaxed max-w-[240px]">{loadError}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => { setLoading(true); setLoadError(null); loadData(); }}
              className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button
              onClick={continueWithFallback}
              className="px-5 py-2.5 bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
              Demo Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No profile ──
  if (!profile) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
            <Mic2 className="w-6 h-6 text-gray-500" />
          </div>
          <h2 className="text-white text-lg font-bold">No Profile Found</h2>
          <p className="text-gray-500 text-sm">Complete onboarding to start your career.</p>
        </div>
      </div>
    );
  }

  // ── Main render ──
  const stage = profile.career_stage || "Indie Darling";
  const stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG["Unknown"];
  const cloutTier = getCloutTier(profile.clout);

  return (
    <PullToRefresh onRefresh={loadData}>
      {/* Outer wrapper centers on desktop at max-w ~430px */}
      <div className="min-h-full bg-[#0a0a0f] pb-8 max-w-[430px] mx-auto">

        {/* ── Artist Header ── */}
        <div className="relative px-4 pt-5 pb-3 overflow-hidden">
          {/* Subtle top ambient glow */}
          <div className="absolute inset-x-0 top-0 h-32 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 50% -20%, ${stageCfg.accent}18, transparent 70%)` }} />

          <div className="relative flex items-center gap-3.5">
            {/* Avatar placeholder */}
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
              style={{ background: `linear-gradient(135deg, ${stageCfg.accent}30, ${stageCfg.accent}10)`, border: `1px solid ${stageCfg.accent}28` }}>
              {stageCfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-white text-lg font-bold leading-tight truncate">
                {profile.artist_name || "Artist"}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-xs font-semibold ${stageCfg.color}`}>{stage}</span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-gray-500 text-xs">{cloutTier.icon} {cloutTier.name}</span>
                {(profile.region || profile.current_city) && (
                  <>
                    <span className="text-gray-600 text-xs">·</span>
                    <button
                      type="button"
                      onClick={() => navigate("/TouringAppV2")}
                      className="text-[10px] font-semibold transition-colors hover:opacity-80"
                      style={{ color: "#C9A84C", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      {profile.current_city
                        ? `${profile.current_city}, ${profile.region}`
                        : profile.region}
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={loadData}
              className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ── Quick Stats ── */}
        <div className="px-4 pb-2">
          <div className="grid grid-cols-4 gap-2">
            <StatCard icon={DollarSign} label="Income"  value={`$${fmt(Math.round(profile.income || 0))}`} color="text-green-400"  bg="bg-green-500/[0.07]"  glow="#22c55e" />
            <StatCard icon={BarChart3}  label="Streams" value={fmt(totalStreams)}                           color="text-blue-400"   bg="bg-blue-500/[0.07]"   glow="#3b82f6" />
            <StatCard icon={Users}      label="Fans"    value={fmt(profile.followers || 0)}                color="text-purple-400" bg="bg-purple-500/[0.07]" glow="#a855f7" />
            <StatCard icon={Flame}      label="Hype"    value={`${profile.hype || 0}%`}                   color="text-orange-400" bg="bg-orange-500/[0.07]" glow="#f97316" />
          </div>
        </div>

        {/* ── Revenue Bar ── */}
        <RevenueBar streamRevenue={streamRevenue} merchRevenue={merchRevenue} />

        {/* ── Brand Identity Hero Card ── */}
        {(() => {
          const safeJson = (v) => {
            if (!v) return {};
            if (typeof v === "object") return v;
            if (typeof v !== "string") return {};
            try { return JSON.parse(v); } catch { return {}; }
          };
          const fp = fanProfile || {};
          const mods = safeJson(fp.career_trend_modifiers);
          const trendState = safeJson(fp.career_trends);
          const effects = mods?.effects || {};

          // Direction helpers — same as BrandPortfolioApp OverviewTab
          const dirFn = (v, up = 1.02, down = 0.98) => v >= up ? "Up" : v <= down ? "Down" : "Neutral";
          const trendEffects = {
            conversionImpact: dirFn(Number(effects.discoveryConversionMultAdj) || 1, 1.015, 0.985),
            retentionImpact:  dirFn(1 - (Number(effects.decayRateAddend) || 0), 1.005, 0.995),
            merchImpact:      dirFn(Number(effects.merchRevenueMultAdj) || 1, 1.015, 0.985),
            brandDealsImpact: dirFn(1 + (Number(effects.brandDealChanceAdj) || 0), 1.015, 0.985),
          };

          // Identity resolution — chains through same fallback order as BrandPortfolioApp
          const rawPid = normalizePersonaId(
            profile?.core_brand_identity_primary
            || currentEra?.expression_identity_primary
            || brandStats?.marketing_persona_primary
            || profile?.marketing_persona
          );
          const rawSid = normalizePersonaId(
            profile?.core_brand_identity_secondary
            || currentEra?.expression_identity_secondary
            || brandStats?.marketing_persona_secondary
            || profile?.sub_persona
          );
          const primaryIdentity = rawPid ? (PERSONA_DISPLAY_LABELS[rawPid] || rawPid) : "Developing Persona";
          const secondaryIdentity = rawSid ? (PERSONA_DISPLAY_LABELS[rawSid] || rawSid) : "Unfolding";
          const confidencePct = Math.round((Number(brandStats?.marketing_persona_confidence || profile?.brand_identity_confidence || 0.62)) * 100);
          const currentTrend = Object.entries(trendState).find(([, active]) => Boolean(active))?.[0] || mods?.current_trend || "STEADY_GROWTH";
          const trendHeldTurns = Number(trendState?.trend_held_turns || 0);
          const tagline = profile?.brand_tagline || "Your brand story is still being written...";

          const momLabel = trajectoryLabel(trendEffects);
          const momUps = Object.values(trendEffects).filter((v) => v === "Up").length;
          const momDowns = Object.values(trendEffects).filter((v) => v === "Down").length;
          const momColor = momUps >= 2 ? "#E8C87C" : momDowns >= 2 ? "#f87171" : "#C9A84C";

          // Quick stats for the modal — correct function signatures
          const mktPos = computeMarketPositioning(profile, rawPid);
          const brandComp = computeBrandCompatibility(rawPid, rawSid, profile);
          const stabVal = Number(mods?.stability_dampening_mult ?? 1);
          const stabLbl = stabilityLabel(stabVal);
          const riskLvl = riskLabel(trendEffects);

          return (
            <div className="px-4 pb-1 pt-1">
              <button
                onClick={() => setIdentityQuickOpen(true)}
                className="w-full text-left"
                style={{ background: "linear-gradient(135deg,#161318 0%,#1a1620 60%,#13111a 100%)", border: "1px solid rgba(201,168,76,.18)", borderRadius: 20, padding: "16px 16px 13px", position: "relative", overflow: "hidden" }}
              >
                <div style={{ position: "absolute", top: -35, right: -25, width: 150, height: 150, background: "radial-gradient(circle,rgba(201,168,76,.08) 0%,transparent 70%)", pointerEvents: "none" }} />
                <div style={{ position: "relative" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(201,168,76,.55)", letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 8 }}>Brand Identity</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1, color: "#fff" }}>{primaryIdentity}</div>
                      <div style={{ fontSize: 11, color: "rgba(232,200,124,.55)", marginTop: 3 }}>+ {secondaryIdentity}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, background: "rgba(201,168,76,.1)", color: "#C9A84C", border: "1px solid rgba(201,168,76,.22)" }}>{currentTrend.replace(/_/g, " ")}</span>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,.22)", marginTop: 3 }}>{trendHeldTurns > 0 ? `Held ${trendHeldTurns} turns` : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)" }}>Confidence</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#C9A84C" }}>{confidencePct}%</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,.07)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, confidencePct))}%`, height: "100%", background: "linear-gradient(90deg,#C9A84C,#E8C87C)", borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Flame size={12} color={momColor} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: momColor }}>{momLabel}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "rgba(201,168,76,.4)" }}>Tap for details →</span>
                  </div>
                </div>
              </button>

              {/* ── Quick Stats Modal (top-anchored) ── */}
              <AnimatePresence>
                {identityQuickOpen && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 24, overflowY: "auto" }}
                    onClick={() => setIdentityQuickOpen(false)}
                  >
                    <motion.div
                      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
                      transition={{ type: "spring", damping: 26, stiffness: 320 }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", maxWidth: 430, background: "#14131b", borderRadius: 24, border: "1px solid rgba(201,168,76,.15)", padding: "16px 20px 24px", margin: "0 12px" }}
                    >
                      {/* Close button */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(201,168,76,.5)", letterSpacing: 1.3, textTransform: "uppercase" }}>Brand Identity</div>
                        <button onClick={() => setIdentityQuickOpen(false)} style={{ background: "rgba(255,255,255,.06)", border: "none", borderRadius: 99, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,.4)", fontSize: 14 }}>✕</button>
                      </div>

                      {/* Identity headline */}
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 2, color: "#fff" }}>{primaryIdentity}</div>
                      <div style={{ fontSize: 12, color: "rgba(232,200,124,.55)", marginBottom: 10 }}>+ {secondaryIdentity}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontStyle: "italic", marginBottom: 14, lineHeight: 1.5 }}>{tagline}</div>

                      {/* Quick stat chips */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {[
                          ["Momentum", momLabel, momColor],
                          ["Stability", stabLbl, stabVal >= 1 ? "#4ade80" : "#f87171"],
                          ["Risk", riskLvl, riskLvl === "Low" ? "#4ade80" : riskLvl === "Moderate" ? "#fbbf24" : "#f87171"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,.28)", marginBottom: 4 }}>{k}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Brand Fit + Lane */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {mktPos.brand_fit && (
                          <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,.28)", marginBottom: 3 }}>Brand Fit</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#E8C87C" }}>{mktPos.brand_fit}</div>
                          </div>
                        )}
                        {mktPos.industry_lane && (
                          <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,.28)", marginBottom: 3 }}>Industry Lane</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#C9A84C" }}>{mktPos.industry_lane}</div>
                          </div>
                        )}
                      </div>

                      {/* Top compatible brands */}
                      {brandComp.strong?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Top Brand Matches</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {brandComp.strong.slice(0, 4).map(b => (
                              <span key={b} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(74,222,128,.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,.2)" }}>{b}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Era expression if any */}
                      {currentEra?.expression_identity_primary && (
                        <div style={{ background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.14)", borderRadius: 12, padding: "8px 10px", marginBottom: 14 }}>
                          <div style={{ fontSize: 9, color: "rgba(201,168,76,.5)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>Era Expression Goal</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#E8C87C" }}>
                            {PERSONA_DISPLAY_LABELS[currentEra.expression_identity_primary] || currentEra.expression_identity_primary}
                            {currentEra.expression_identity_secondary && <span style={{ color: "rgba(232,200,124,.5)", marginLeft: 6 }}>+ {PERSONA_DISPLAY_LABELS[currentEra.expression_identity_secondary] || currentEra.expression_identity_secondary}</span>}
                          </div>
                        </div>
                      )}

                      {/* CTA — go to Brand Portfolio */}
                      <button
                        onClick={() => { setIdentityQuickOpen(false); navigate("/BrandPortfolioApp"); }}
                        style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, letterSpacing: ".3px", background: "linear-gradient(135deg,#C9A84C,#E8C87C)", color: "#1a1a2e" }}
                      >
                        View Full Brand Portfolio →
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Main Content ── */}
        <div className="px-4 space-y-3">
          {/* Career Stage */}
          <CareerStageWidget profile={profile} onMilestoneTriggered={() => {}} />

          {/* Tabbed Insights (Releases, Revenue, Markets, Fans, Trends) */}
          <TabbedInsights
            releases={releases}
            profile={profile}
            merch={merch}
            fanProfile={fanProfile}
            socialAccounts={socialAccounts}
            fandomSegments={fandomSegments}
          />

          {/* Sample Royalties */}
          {profile?.id && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setShowRoyalties(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ background: '#13131a' }}
              >
                <span className="text-sm font-semibold text-white/70">💰 Sample Royalties</span>
                <span className="text-white/30 text-xs">{showRoyalties ? '▴' : '▾'}</span>
              </button>
              {showRoyalties && (
                <div className="p-4" style={{ background: '#0a0a0f' }}>
                  <SampleRoyaltyDashboard artistId={profile.id} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Apps Grid ── */}
        <AppsGrid
          onOpenApp={(app) => { if (!app.locked) {} }}
          onNavigatePlatform={(app) => {
            const routes = { soundburst: "/SoundburstApp", streamify: "/StreamifyApp", applecore: "/AppleCoreApp" };
            if (routes[app.id]) onNavigate(routes[app.id]);
          }}
          onNavigateApp={(app) => {
            const routes = { xtras: "/MerchApp", ticketmaster: "/TouringAppV2", charts: "/ChartsApp", amplifi: "/AmplifiApp", brandportfolio: "/BrandPortfolioApp" };
            if (routes[app.id]) onNavigate(routes[app.id]);
          }}
        />
      </div>
    </PullToRefresh>
  );
}
