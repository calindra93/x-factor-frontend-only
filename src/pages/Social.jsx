import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Film, Play, RefreshCw, Users } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { supabaseClient } from "@/lib/supabaseClient";
import { getGenreTrait } from "../../supabase/functions/_shared/genreTraits.ts";
import LoopTokApp from "../components/social/LoopTokApp";
import InstaVibeApp from "../components/social/InstaVibeApp";
import XpressApp from "../components/xpress/XpressApp";
import VidWaveApp from "../components/social/VidWaveApp";
import PullToRefresh from "../components/PullToRefresh";
import { useLayoutChrome } from "@/components/layout/LayoutChromeContext";
import LiveStreamModal from "../components/social/LiveStreamModal";
import CollaborationInbox from "../components/social/CollaborationInbox";
import FandomHeroCard from "../components/social/FandomHeroCard";
import {
  PERSONA_DISPLAY_LABELS,
  computeMarketPositioning, computeBrandCompatibility,
  impactLabel, normalizePersonaId,
} from "@/data/brandIdentityHelpers";

const LOAD_TIMEOUT_MS = 15000;

const G = () => (
  <style>{`
    .social-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:18px;}
    .social-card-dark{background:#16151c;border:1px solid rgba(255,255,255,0.07);border-radius:18px;}
    .tab-pill{background:transparent;border:1px solid transparent;cursor:pointer;font-size:12px;font-weight:600;color:rgba(255,255,255,.36);padding:7px 13px;border-radius:10px;transition:all .18s;white-space:nowrap;display:flex;align-items:center;gap:5px;}
    .tab-pill.active{background:rgba(139,92,246,0.15);color:#a78bfa;border-color:rgba(139,92,246,0.27);}
    .press{cursor:pointer;transition:opacity .15s,transform .15s;}
    .press:active{transform:scale(0.98);opacity:.9;}
    .modal-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.72);backdrop-filter:blur(14px);display:flex;align-items:flex-end;justify-content:center;}
    .modal-sheet{width:100%;max-width:480px;background:#13121a;border:1px solid rgba(255,255,255,.09);border-bottom:none;border-radius:24px 24px 0 0;max-height:91vh;overflow-y:auto;}
    .pill{display:inline-flex;align-items:center;border-radius:99px;padding:3px 10px;font-size:10px;font-weight:700;letter-spacing:.25px;}
  `}</style>
);

const SOCIAL_APPS = [
  { id: "looptok", name: "LoopTok", icon: Play, bg: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#f87171" },
  { id: "xpress", name: "Xpress", icon: Users, bg: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#60a5fa" },
  { id: "instavibe", name: "InstaVibe", icon: Camera, bg: "linear-gradient(135deg,#9333ea,#ec4899)", color: "#c084fc" },
  { id: "vidwave", name: "VidWave", icon: Film, bg: "linear-gradient(135deg,#16a34a,#15803d)", color: "#4ade80" },
];

// PERSONA_DISPLAY_LABELS imported from @/data/brandIdentityHelpers

function brandSafetyLabel(rating) {
  const v = Number(rating);
  if (!Number.isFinite(v)) return "Viable";
  if (v >= 80) return "Excellent";
  if (v >= 60) return "Viable";
  if (v >= 40) return "Cautious";
  return "At Risk";
}

function heatLabel(intensity) {
  const v = Number(intensity) || 0;
  if (v >= 70) return "High";
  if (v >= 40) return "Med";
  return "Low";
}

function formatNum(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function normalizePercent(value) {
  const raw = Number(value) || 0;
  return raw <= 1 ? raw * 100 : raw;
}

// ─── Computed Brand Identity helpers — imported from @/data/brandIdentityHelpers ────

function safeJson(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  if (typeof v !== "string") return {};
  const trimmed = v.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return {};
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn("[Social] safeJson received invalid JSON payload");
      return {};
    }
    throw err;
  }
}

function moodForSentiment(v) {
  const value = Number(v) || 50;
  if (value >= 80) return { label: "Devoted", emoji: "😍" };
  if (value >= 65) return { label: "Positive", emoji: "😊" };
  if (value >= 45) return { label: "Mixed", emoji: "😐" };
  return { label: "Tense", emoji: "😬" };
}

function loyaltyLabel(retentionRate) {
  const v = Number(retentionRate) || 0;
  if (v >= 78) return "High";
  if (v >= 62) return "Steady";
  return "At Risk";
}

function direction(v, up = 1.02, down = 0.98) {
  if (v >= up) return "Up";
  if (v <= down) return "Down";
  return "Neutral";
}

// impactLabel, culturalGravityLabel, depthLabel, discoveryLabel, longevityLabel,
// trajectoryLabel, stabilityLabel, riskLabel — imported from @/data/brandIdentityHelpers

function segmentReactionState({ key, share, loyalty, heat, fatigue, inactivityTurns }) {
  if (inactivityTurns >= 3 && (key === "trend_chaser" || key === "casual")) {
    return { label: "Cooling off", color: "#f87171" };
  }
  if (loyalty >= 0.55) {
    return { label: "Holding strong", color: "#4ade80" };
  }
  if (fatigue >= 0.55 && share >= 0.18) {
    return { label: "Needs fresh drop", color: "#fbbf24" };
  }
  if (heat >= 0.7 && key === "trend_chaser") {
    return { label: "Amplifying hype", color: "#fb923c" };
  }
  return { label: "Steady", color: "#60a5fa" };
}

function buildTrendView(fanProfile, trendEvent) {
  const trendState = safeJson(fanProfile?.career_trends);
  const trendModifiers = safeJson(fanProfile?.career_trend_modifiers);
  const eventReason = safeJson(trendEvent?.reason);
  const effects = trendModifiers?.effects || eventReason?.effects || {};

  const currentTrend = Object.entries(trendState).find(([, active]) => Boolean(active))?.[0]
    || trendModifiers.current_trend
    || eventReason?.to
    || eventReason?.trend
    || "STEADY_GROWTH";

  return {
    currentTrend,
    trendHeldTurns: Number(trendModifiers?.trend_hold_turns || 0),
    topSignals: Array.isArray(trendModifiers?.top_signals)
      ? trendModifiers.top_signals.slice(0, 3)
      : Array.isArray(eventReason?.top_signals)
        ? eventReason.top_signals.slice(0, 3)
        : [],
    effects: {
      conversionImpact: direction(Number(effects.discoveryConversionMultAdj) || 1, 1.015, 0.985),
      retentionImpact: direction(1 - (Number(effects.decayRateAddend) || 0), 1.005, 0.995),
      merchImpact: direction(Number(effects.merchRevenueMultAdj) || 1, 1.015, 0.985),
      brandDealsImpact: direction(1 + (Number(effects.brandDealChanceAdj) || 0), 1.015, 0.985),
    },
  };
}

// normalizePersonaId — imported from @/data/brandIdentityHelpers

function buildSocialViewModel({ profile, fanProfile, accounts, trendEvent, fanWarsData, brandStats, currentEra, phase6State, fandomSegments }) {
  // NOTE: This view model must stay presentation-only.
  // Source-of-truth simulation math (growth/decay, churn, discovery, trend effects)
  // belongs in backend turn modules.
  const fp = fanProfile || {};

  // Phase 6 — now stored on the fandoms row (all presentation-only, no math here)
  const p6 = phase6State || {};
  const p6Segs = p6.fan_segments || {};
  const p6Loyalty = p6.loyalty || {};
  const p6Imprint = p6.imprint || {};
  const p6RegionBias = p6.region_bias || {};
  const superfansShare = Number(p6.superfans_share || 0);
  const sfRatio = Math.min(1, superfansShare / 0.20);
  const trend = buildTrendView(fp, trendEvent);
  const mods = safeJson(fp?.career_trend_modifiers);

  const genreTrait = getGenreTrait(profile?.genre || "");
  const combinedCulturalGravity = Number(mods?.cultural_gravity ?? 1) * Number(genreTrait?.culturalGravityFactor ?? 1);

  // monthly_active_listeners is the authoritative active-fan count (sum of weekly active buckets,
  // written every turn by fansUpdateModule). The old computation summed stans_count (a community-message
  // trigger count) with core/casual/trend (percentage integers 0-100), producing ~90 regardless of scale.
  const activeFans = Number(fp?.monthly_active_listeners || 0);
  // Per-turn delta: current week active vs previous week active (weekly buckets rotate each turn)
  const activeFansDelta = Number(fp?.weekly_active_w1 || 0) - Number(fp?.weekly_active_w2 || 0);
  const monthlyListeners = Number(fp?.monthly_listeners || 0);
  const monthlyDelta = monthlyListeners - Number(fp?.last_monthly_listeners || 0);
  const retention = Number(fp?.retention_rate || 0);
  const segmentTotal = (fandomSegments || []).reduce((s, r) => s + (Number(r.count) || 0), 0);
  const profileFans = Number(profile?.fans) || Number(profile?.followers) || 0;
  const totalFans = Math.max(segmentTotal, profileFans);

  // Resolve persona IDs from persisted core identity first, then active era expression, then legacy fallbacks.
  const rawPrimaryId = normalizePersonaId(
    profile?.core_brand_identity_primary
    || currentEra?.expression_identity_primary
    || brandStats?.marketing_persona_primary
    || profile?.marketing_persona
  );
  const rawSecondaryId = normalizePersonaId(
    profile?.core_brand_identity_secondary
    || currentEra?.expression_identity_secondary
    || brandStats?.marketing_persona_secondary
    || profile?.sub_persona
  );

  return {
    identity: {
      primaryIdentity: rawPrimaryId ? (PERSONA_DISPLAY_LABELS[rawPrimaryId] || rawPrimaryId) : "Developing Persona",
      secondaryIdentity: rawSecondaryId ? (PERSONA_DISPLAY_LABELS[rawSecondaryId] || rawSecondaryId) : "Unfolding",
      confidencePct: Math.round((Number(profile?.brand_identity_confidence || brandStats?.marketing_persona_confidence || 0.62)) * 100),
      tagline: profile?.brand_tagline || profile?.bio || profile?.artist_bio || "Your audience identity is evolving each turn.",
      careerTrend: trend.currentTrend,
      trendHeldTurns: trend.trendHeldTurns,
      topSignals: trend.topSignals,
      momentumLabel: impactLabel(trend.effects.conversionImpact),
      audienceQuality: {
        audienceDepth: Number(mods?.audience_depth ?? 0),
        depthTier: mods?.depth_tier || "Tier 1",
        culturalGravity: combinedCulturalGravity,
        viralHalfLifeMult: Number(mods?.viral_half_life_mult ?? 1),
        discoveryConversionMult: Number(mods?.discovery_conversion_mult ?? 1),
        stabilityDampeningMult: Number(mods?.stability_dampening_mult ?? 1),
      },
      trendEffects: trend.effects,
      marketPositioning: computeMarketPositioning(profile, rawPrimaryId),
      brandCompatibility: computeBrandCompatibility(rawPrimaryId, rawSecondaryId, profile),
    },
    community: {
      activeFans,
      totalFans,
      activeFansDelta,
      monthlyListeners,
      monthlyDelta,
      growthPct: Number(fp?.listener_growth_trend || 0),
      retention,
      retentionDelta: Number(fp?.retention_delta || 0),
      mood: moodForSentiment(fp?.overall_sentiment),
      hypePct: Math.round(Math.min(100, Math.max(0, Number(profile?.hype || 0)))),
      loyalty: loyaltyLabel(retention),
      trendPressure: direction(Number(mods?.viral_half_life_mult || 1), 1.02, 0.98) === "Down" ? "Rising" : "Managed",
      fanMakeup: {
        stans: Number(fp?.stans || 0),
        casual: Number(fp?.casual || 0),
        trend: Number(fp?.trend || 0),
        core: Number(fp?.core || 0),
      },
      viralPostRate: Math.round((1 / Math.max(0.7, Number(mods?.viral_half_life_mult || 1))) * 28),
      fanWars: Array.isArray(fanWarsData) ? fanWarsData.map((w) => ({
        id: w.id,
        rival: w.rival_name || w.rival_artist_name || w.rival_artist_id || "Unknown Artist",
        status: w.status || "active",
        heat: heatLabel(w.intensity),
        intensity: w.intensity,
        durationTurns: Number(w.duration_turns) || 0,
      })) : [],
      controversyLevel: "Limited",
      industryNarrative: profile?.career_stage || "Emerging",
      brandSafety: brandSafetyLabel(brandStats?.brand_safety_rating),
      implications: fp?.pr_implications || "Monitor audience sentiment before escalations.",
      regions: Array.isArray(fp?.region_share)
        ? fp.region_share.map((region) => ({
          name: region?.region || region?.name || "Unknown",
          pct: normalizePercent(region?.percentage || region?.pct || 0),
          listeners: Number(region?.listeners || 0),
        }))
        : Object.entries(safeJson(fp?.region_share)).map(([name, share]) => {
          return { name, pct: Math.round(normalizePercent(share)), listeners: 0 };
        }),
      topMarkets: Array.isArray(fp?.top_regions)
        ? fp.top_regions.map((market) => {
          if (typeof market === "string") return { label: market };
          return {
            label: market?.region || market?.name || market?.market || "Unknown",
            percentage: normalizePercent(market?.percentage || market?.pct || 0),
            listeners: Number(market?.listeners || 0),
          };
        })
        : [],
      culturalGravity: combinedCulturalGravity,
    },
    platformFollowers: Object.fromEntries((accounts || []).map((a) => [a.platform, Number(a.followers || 0)])),
    phase6: {
      enabled: Boolean(phase6State),
      superfans: {
        pct: Math.round(superfansShare * 1000) / 10,       // 0–20.0 (% of total fans)
        streamBoost: Math.round(sfRatio * 8 * 10) / 10,    // 0–8.0 %
        merchBoost: Math.round(sfRatio * 10 * 10) / 10,    // 0–10.0 %
        tourBoost: Math.round(sfRatio * 6 * 10) / 10,      // 0–6.0 %
      },
      heat: Number(p6.heat || 0),
      fatigue: Number(p6.fatigue || 0),
      segments: {
        og: Number(p6Segs.og || 0),
        core: Number(p6Segs.core || 0),
        casual: Number(p6Segs.casual || 0),
        trend_chaser: Number(p6Segs.trend_chaser || 0),
        stan: Number(p6Segs.stan || 0),
        critic: Number(p6Segs.critic || 0),
      },
      loyalty: {
        og: Number(p6Loyalty.og || 0),
        core: Number(p6Loyalty.core || 0),
        casual: Number(p6Loyalty.casual || 0),
        trend_chaser: Number(p6Loyalty.trend_chaser || 0),
        stan: Number(p6Loyalty.stan || 0),
        critic: Number(p6Loyalty.critic || 0),
      },
      imprint: {
        legacy: Number(p6Imprint.legacy || 0),
        scandal: Number(p6Imprint.scandal || 0),
        comeback: Number(p6Imprint.comeback || 0),
        nostalgia: Number(p6Imprint.nostalgia || 0),
      },
      regionBias: p6RegionBias,
      inactivityTurns: Number(p6.inactivity_turns || 0),
      // Estimated turns to clear scandal (0.02/turn normal, 0.008/turn when > 60%)
      scandalRecoveryTurns: p6Imprint.scandal > 0.02
        ? (p6Imprint.scandal > 0.6
          ? Math.ceil(Number(p6Imprint.scandal) / 0.008)
          : Math.ceil(Number(p6Imprint.scandal) / 0.02))
        : 0,
      segmentReactions: Object.entries(p6Segs)
        .map(([key, share]) => {
          const loyaltyValue = Number(p6Loyalty?.[key] || 0);
          const reactionState = segmentReactionState({
            key,
            share: Number(share || 0),
            loyalty: loyaltyValue,
            heat: Number(p6.heat || 0),
            fatigue: Number(p6.fatigue || 0),
            inactivityTurns: Number(p6.inactivity_turns || 0),
          });
          return {
            key,
            name: key.replace(/_/g, " "),
            label: reactionState.label,
            color: reactionState.color,
            share: Number(share || 0),
            loyalty: loyaltyValue,
          };
        })
        .sort((a, b) => b.share - a.share)
        .slice(0, 3),
      crossSystem: {
        algorithmPulse: Math.max(-1, Math.min(1,
          (Number(p6.heat || 0) - 0.45)
          + (superfansShare * 1.6)
          + (Number(p6Imprint.comeback || 0) * 0.7)
          - (Number(p6Imprint.scandal || 0) * 0.9)
        )),
        brandDealPull: Math.max(-1, Math.min(1,
          ((Number(brandStats?.brand_safety_rating || 50) - 50) / 50)
          + (Number(p6Loyalty.stans || 0) * 0.4)
          - (Number(p6Imprint.scandal || 0) * 0.8)
        )),
      },
    },
  };
}

// Bar, BrandModal removed — migrated to BrandPortfolioApp as BrandIdentityModal

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>{children}</div>;
}

export default function Social() {
  const location = useLocation();
  const [openApp, setOpenApp] = useState(null);
  const [profile, setProfile] = useState(null);
  const [releases, setReleases] = useState([]);
  const [currentEra, setCurrentEra] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [fanProfile, setFanProfile] = useState(null);
  const [trendEvent, setTrendEvent] = useState(null);
  const [fanWars, setFanWars] = useState([]);
  const [brandStats, setBrandStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const activeRef = useRef(true);
  const { setChrome } = useLayoutChrome();
  const [showLiveStream, setShowLiveStream] = useState(false);
  const [showCollaborationInbox, setShowCollaborationInbox] = useState(false);
  const [view, setView] = useState("overview");
  // identityOpen state removed — Brand Identity migrated to BrandPortfolioApp
  const [phase6State, setPhase6State] = useState(null);
  const [fandomData, setFandomData] = useState(null);
  const [fandomSegments, setFandomSegments] = useState([]);

  const setIfActive = (setter, value) => {
    if (!activeRef.current) return;
    setter(value);
  };

  useEffect(() => {
    activeRef.current = true;
    loadData();
    const timeout = setTimeout(() => {
      if (!activeRef.current) return;
      setLoading((prev) => {
        if (prev) setLoadError("Loading took too long. Tap retry.");
        return false;
      });
    }, LOAD_TIMEOUT_MS);
    return () => { activeRef.current = false; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    setChrome((prev) => ({ ...prev, hideBottomNav: Boolean(openApp), hideTopBar: Boolean(openApp) }));
    return () => setChrome((prev) => ({ ...prev, hideBottomNav: false, hideTopBar: false }));
  }, [openApp, setChrome]);

  useEffect(() => {
    const nextOpenApp = typeof location.state?.openApp === "string"
      ? location.state.openApp.toLowerCase()
      : null;
    if (!nextOpenApp) return;
    setOpenApp(nextOpenApp);
  }, [location.state]);

  useEffect(() => {
    // Stable listener is intentionally registered once for a global custom event.
    const handleOpenCollaborationInbox = () => setShowCollaborationInbox(true);
    window.addEventListener("openCollaborationInbox", handleOpenCollaborationInbox);
    return () => window.removeEventListener("openCollaborationInbox", handleOpenCollaborationInbox);
  }, []);

  const continueWithFallback = () => {
    setIfActive(setProfile, { id: "fallback-social", artist_name: "Demo Artist", followers: 110, career_stage: "Emerging" });
    setIfActive(setReleases, []);
    setIfActive(setCurrentEra, null);
    setIfActive(setAccounts, []);
    setIfActive(setFanProfile, null);
    setIfActive(setTrendEvent, null);
    setIfActive(setFanWars, []);
    setIfActive(setBrandStats, null);
    setIfActive(setPhase6State, null);
    setIfActive(setFandomData, null);
    setIfActive(setFandomSegments, []);
    setIfActive(setLoadError, null);
    setIfActive(setLoading, false);
  };

  const loadData = async () => {
    try {
      setIfActive(setLoadError, null);
      const userAccountId = localStorage.getItem("user_account_id");
      if (!userAccountId) { setIfActive(setLoading, false); return; }
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const p = profiles[0];
      if (!p?.id) {
        if (localStorage.getItem("dev_demo_mode") === "1") { if (activeRef.current) continueWithFallback(); return; }
        setIfActive(setLoading, false);
        return;
      }
      setIfActive(setProfile, p);

      const [rels, eras, accs, fanP, latestTrendEvent, playerBrandStats, fandomStatus] = await Promise.all([
        base44.entities.Release.filter({ artist_id: p.id }, "-created_date").catch(() => []),
        base44.entities.Era.filter({ artist_id: p.id }).catch(() => []),
        base44.entities.SocialAccount?.filter({ artist_id: p.id }).catch(() => []) || [],
        supabaseClient.from("fan_profiles").select("*").eq("artist_id", p.id).maybeSingle().then((r) => r.data || null).catch(() => null),
        supabaseClient.from("career_trend_events").select("id, global_turn_id, player_id, trends, added, removed, reason, created_at").eq("player_id", p.id).order("global_turn_id", { ascending: false }).limit(1).maybeSingle().then((r) => r.data || null).catch(() => null),
        supabaseClient.from("player_brand_stats").select("brand_safety_rating, marketing_persona_primary, marketing_persona_secondary, marketing_persona_confidence, updated_at, created_at").eq("artist_id", p.id).then((r) => {
          const rows = r.data || [];
          if (!rows.length) return null;
          const latestRow = [...rows].sort((a, b) => {
            const at = new Date(a.updated_at || a.created_at || 0).getTime();
            const bt = new Date(b.updated_at || b.created_at || 0).getTime();
            return bt - at;
          })[0] || rows[0];
          return {
            brand_safety_rating: Number(latestRow?.brand_safety_rating) || 50,
            marketing_persona_primary: latestRow?.marketing_persona_primary || null,
            marketing_persona_secondary: latestRow?.marketing_persona_secondary || null,
            marketing_persona_confidence: Number(latestRow?.marketing_persona_confidence || 0) || 0,
          };
        }).catch(() => null),
        invokeEdgeFunction("fandomActions", {
          subAction: "status",
          artistId: p.id,
        }).catch(() => null),
      ]);

      const fandomPayload = fandomStatus?.success && fandomStatus?.data
        ? fandomStatus.data
        : null;

      setIfActive(setReleases, rels);
      setIfActive(setCurrentEra, eras.find((e) => e.is_active) || null);
      setIfActive(setAccounts, Array.isArray(accs) ? accs : []);
      setIfActive(setFanProfile, fanP);
      setIfActive(setTrendEvent, latestTrendEvent);
      setIfActive(setFanWars, Array.isArray(fandomPayload?.wars) ? fandomPayload.wars : []);
      setIfActive(setBrandStats, playerBrandStats);
      setIfActive(setPhase6State, fandomPayload?.fandom || null);
      setIfActive(setFandomData, fandomPayload?.fandom || null);
      setIfActive(setFandomSegments, Array.isArray(fandomPayload?.segments) ? fandomPayload.segments : []);
    } catch (e) {
      console.error("[Social] Load error:", e);
      if (activeRef.current) {
        if (localStorage.getItem("dev_demo_mode") === "1") { continueWithFallback(); return; }
        setIfActive(setLoadError, "Some social data failed to load. Showing fallback content is available in demo mode.");
      }
    } finally {
      setIfActive(setLoading, false);
    }
  };

  const vm = useMemo(() => buildSocialViewModel({ profile, fanProfile, accounts, trendEvent, fanWarsData: fanWars, brandStats, currentEra, phase6State, fandomSegments }), [profile, fanProfile, accounts, trendEvent, fanWars, brandStats, currentEra, phase6State, fandomSegments]);

  if (loading) return <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center"><div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" /></div>;
  if (loadError) return <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6"><div className="text-center space-y-3"><p className="text-gray-400 text-sm">{loadError}</p><button onClick={() => { setLoading(true); setLoadError(null); loadData(); }} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Retry</button><button onClick={continueWithFallback} className="px-5 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium rounded-xl inline-flex items-center gap-2 ml-2">Continue demo</button></div></div>;

  return (
    <>
      <G />
      <PullToRefresh onRefresh={loadData}>
        <div className="min-h-full bg-[#0a0a0f] pb-4 max-w-md mx-auto" style={{ fontFamily: "Inter, sans-serif", color: "#fff" }}>
          <div style={{ padding: "18px 18px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 15, background: "rgba(139,92,246,.18)", border: "1px solid rgba(139,92,246,.28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👥</div>
              <div>
                <div style={{ fontSize: view === "community" ? 20 : 22, fontWeight: 900, letterSpacing: -0.5 }}>{view === "community" ? "Community" : "Social Hub"}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginTop: 2 }}>{view === "community" ? "Audience dynamics, mood & influence" : "Your lifestyle, presence & community"}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {view === "community" && (
                <button className="tab-pill" onClick={() => setView("overview")} style={{ padding: "7px 16px" }}>← Back</button>
              )}
              <button className={`tab-pill ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")} style={{ padding: "7px 16px" }}>Overview</button>
              <button className={`tab-pill ${view === "community" ? "active" : ""}`} onClick={() => setView("community")} style={{ padding: "7px 16px" }}>Community</button>
            </div>
          </div>

          {view === "overview" && (
            <div style={{ padding: "0 18px" }}>
              <div style={{ marginBottom: 12 }}>
                <FandomHeroCard fandomData={fandomData} fandomSegments={fandomSegments} profile={profile} variant="compact" />
              </div>

              <SectionLabel>Platforms</SectionLabel>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginBottom: 16 }}>
                {SOCIAL_APPS.map((app) => {
                  const Icon = app.icon;
                  return <button key={app.id} onClick={() => setOpenApp(app.id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ width: 62, height: 62, borderRadius: 18, background: app.bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 20px ${app.color}60` }}><Icon size={26} color="#fff" /></div><span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{app.name}</span><span style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{formatNum(vm.platformFollowers?.[app.id] || 0)} followers</span></button>;
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                <button onClick={() => setShowLiveStream(true)} className="social-card" style={{ padding: "11px", textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 800 }}>Go Live</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.45)" }}>Broadcast now</div></button>
                <button onClick={() => setShowCollaborationInbox(true)} className="social-card" style={{ padding: "11px", textAlign: "left" }}><div style={{ fontSize: 12, fontWeight: 800 }}>Collabs</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.45)" }}>Inbox & requests</div></button>
              </div>
            </div>
          )}

          {view === "community" && (
            <div style={{ padding: "4px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
              <FandomHeroCard fandomData={fandomData} fandomSegments={fandomSegments} profile={profile} variant="full" />
            </div>
          )}
        </div>
      </PullToRefresh>

      {createPortal(
        <AnimatePresence>
          {openApp === "looptok" && <LoopTokApp onClose={() => { setOpenApp(null); loadData(); }} profile={profile} releases={releases} currentEra={currentEra} />}
          {openApp === "xpress" && <XpressApp onClose={() => { setOpenApp(null); loadData(); }} profile={profile} releases={releases} currentEra={currentEra} />}
          {(openApp === "instavibe" || openApp === "instavibe_deals") && <InstaVibeApp onClose={() => { setOpenApp(null); loadData(); }} profile={profile} releases={releases} currentEra={currentEra} initialTab={openApp === "instavibe_deals" ? "brand_deals" : undefined} />}
          {openApp === "vidwave" && <VidWaveApp onClose={() => { setOpenApp(null); loadData(); }} profile={profile} releases={releases} currentEra={currentEra} />}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {showLiveStream && <LiveStreamModal profile={profile} onClose={() => setShowLiveStream(false)} />}
          {showCollaborationInbox && <CollaborationInbox profile={profile} onClose={() => setShowCollaborationInbox(false)} />}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
