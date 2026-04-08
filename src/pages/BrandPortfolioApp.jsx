// src/pages/BrandPortfolioApp.jsx
// Brand Portfolio — luxury editorial deal hub for X-Factor
// Tabs: Overview · Offers · Active · History

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, DollarSign, Zap, X,
  Loader2, CheckCircle, XCircle, Star, Briefcase,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  PERSONA_DISPLAY_LABELS,
  computeMarketPositioning, computeBrandCompatibility,
  culturalGravityLabel, depthLabel, discoveryLabel, longevityLabel,
  trajectoryLabel, stabilityLabel, riskLabel, normalizePersonaId,
} from "@/data/brandIdentityHelpers";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

function reputationScoreFromModifier(modifier) {
  const normalized = 50 + ((Number(modifier ?? 1) - 1) * 100);
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

const PLAT_LABEL = { instavibe: "InstaVibe", looptok: "LoopTok", vidwave: "VidWave" };
const PLAT_COLOR = { instavibe: "#ec4899", looptok: "#818cf8", vidwave: "#f87171" };
const PLAT_BG    = { instavibe: "rgba(236,72,153,.12)", looptok: "rgba(129,140,248,.12)", vidwave: "rgba(248,113,113,.12)" };
const TIER_COLOR = { local: "#6b7280", regional: "#818cf8", national: "#f59e0b", global: "#34d399", luxury: "#C9A84C" };

function alignScore(offer) {
  return Math.round(Number(offer.metadata?.persona_fit_score || 0.5) * 100);
}

function alignLabel(score) {
  if (score >= 75) return { label: "GREAT FIT",    color: "#34d399", glow: "rgba(52,211,153,.25)" };
  if (score >= 50) return { label: "GOOD FIT",     color: "#C9A84C", glow: "rgba(201,168,76,.25)" };
  if (score >= 30) return { label: "SOME FIT",     color: "#f59e0b", glow: "rgba(245,158,11,.2)" };
  return             { label: "LOW FIT",           color: "#ef4444", glow: "rgba(239,68,68,.2)" };
}

function isChallenge(deal) {
  return deal.deal_type === "challenge" || deal.metadata?.is_challenge;
}

// ── Plain-English KPI mapping: {category → {platform → {id, one, many}}} ────
// `one` = singular task description; `many(n)` = pluralised version for n > 1
const CATEGORY_PLATFORM_CONTENT_MAP = {
  fashion:   { looptok:   { id: "get_ready",      one: "Post a Get Ready With Me on LoopTok showing the brand",           many: n => `Post ${n} Get Ready With Me videos on LoopTok showing the brand` },
               instavibe: { id: "carousel",       one: "Share a Carousel on InstaVibe with outfit shots",                 many: n => `Share ${n} Carousels on InstaVibe with outfit shots` },
               vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave featuring the brand",                      many: n => `Film ${n} Vlogs on VidWave featuring the brand` } },
  tech:      { vidwave:   { id: "deep_dive",       one: "Upload a Deep Dive review video on VidWave",                      many: n => `Upload ${n} Deep Dive review videos on VidWave` },
               looptok:   { id: "trend_reaction",  one: "Create a Trend Reaction on LoopTok featuring the product",        many: n => `Create ${n} Trend Reactions on LoopTok featuring the product` },
               instavibe: { id: "reel",            one: "Post a Reel on InstaVibe showcasing the tech",                    many: n => `Post ${n} Reels on InstaVibe showcasing the tech` } },
  beverage:  { looptok:   { id: "skit",            one: "Create a Skit on LoopTok featuring the product",                  many: n => `Create ${n} Skits on LoopTok featuring the product` },
               vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave with the drink",                           many: n => `Film ${n} Vlogs on VidWave with the drink` },
               instavibe: { id: "photo",           one: "Post a Photo on InstaVibe with the product",                      many: n => `Post ${n} Photos on InstaVibe with the product` } },
  food:      { looptok:   { id: "behind_scenes",   one: "Post a Behind the Scenes on LoopTok featuring the product",       many: n => `Post ${n} Behind the Scenes clips on LoopTok featuring the product` },
               vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave with the food brand",                      many: n => `Film ${n} Vlogs on VidWave with the food brand` },
               instavibe: { id: "carousel",        one: "Share a Carousel on InstaVibe featuring the food",                many: n => `Share ${n} Carousels on InstaVibe featuring the food` } },
  auto:      { vidwave:   { id: "tour_diary",      one: "Film a Tour Diary on VidWave featuring the vehicle",              many: n => `Film ${n} Tour Diary episodes on VidWave featuring the vehicle` },
               looptok:   { id: "snippet",         one: "Post a Snippet on LoopTok with the car",                          many: n => `Post ${n} Snippets on LoopTok with the car` },
               instavibe: { id: "photo",           one: "Post a Photo on InstaVibe with the vehicle",                      many: n => `Post ${n} Photos on InstaVibe with the vehicle` } },
  beauty:    { instavibe: { id: "reel",            one: "Post a Reel on InstaVibe showing the product in action",          many: n => `Post ${n} Reels on InstaVibe showing the product in action` },
               looptok:   { id: "get_ready",       one: "Post a Get Ready With Me on LoopTok using the products",          many: n => `Post ${n} Get Ready With Me videos on LoopTok using the products` },
               vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave with a beauty routine",                    many: n => `Film ${n} Vlogs on VidWave with a beauty routine` } },
  gaming:    { vidwave:   { id: "reaction",        one: "Upload a Reaction Video on VidWave while using the product",      many: n => `Upload ${n} Reaction Videos on VidWave while using the product` },
               looptok:   { id: "skit",            one: "Create a Skit on LoopTok featuring the game",                     many: n => `Create ${n} Skits on LoopTok featuring the game` },
               instavibe: { id: "reel",            one: "Post a Reel on InstaVibe with gameplay highlights",               many: n => `Post ${n} Reels on InstaVibe with gameplay highlights` } },
  sports:    { vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave incorporating the brand",                  many: n => `Film ${n} Vlogs on VidWave incorporating the brand` },
               looptok:   { id: "dance_challenge", one: "Start a Dance Challenge on LoopTok for the brand",                many: n => `Run ${n} Dance Challenges on LoopTok for the brand` },
               instavibe: { id: "photo",           one: "Post a Photo on InstaVibe wearing the gear",                      many: n => `Post ${n} Photos on InstaVibe wearing the gear` } },
  finance:   { vidwave:   { id: "interview",       one: "Record an Interview / Q&A on VidWave discussing the service",     many: n => `Record ${n} Interview / Q&A videos on VidWave discussing the service` },
               looptok:   { id: "storytime",       one: "Share a Storytime on LoopTok about financial wins",               many: n => `Share ${n} Storytime videos on LoopTok about financial wins` },
               instavibe: { id: "carousel",        one: "Share a Carousel on InstaVibe about the service",                 many: n => `Share ${n} Carousels on InstaVibe about the service` } },
  lifestyle: { looptok:   { id: "storytime",       one: "Share a Storytime on LoopTok about your experience",              many: n => `Share ${n} Storytime videos on LoopTok about your experience` },
               instavibe: { id: "carousel",        one: "Share a Carousel on InstaVibe featuring the brand",               many: n => `Share ${n} Carousels on InstaVibe featuring the brand` },
               vidwave:   { id: "vlog",            one: "Film a Vlog on VidWave featuring the lifestyle brand",            many: n => `Film ${n} Vlogs on VidWave featuring the lifestyle brand` } },
};

const ALGORITHM_MOOD_TIPS = {
  beef_season:  { looptok: "🔥 LoopTok reach is boosted — drama moods favor this platform",
                  instavibe: "InstaVibe is quieter during beef season — focus on quality",
                  vidwave: "VidWave holds steady during drama moods" },
  nostalgic:    { instavibe: "📸 InstaVibe is riding a nostalgia wave — throwback content performs well",
                  looptok: "LoopTok is slightly depressed during nostalgic moods",
                  vidwave: "VidWave audience loves nostalgic deep dives right now" },
  experimental: { looptok: "⚡ Experimental sounds are spreading on LoopTok",
                  vidwave: "VidWave loves experimental content right now",
                  instavibe: "Niche content lands less on InstaVibe in experimental moods" },
  underground:  { looptok: "Underground culture is moving off mainstream apps right now",
                  instavibe: "InstaVibe reach is lower during underground moods",
                  vidwave: "VidWave is steady during underground moods" },
  messy:        { looptok: "😈 Messy content performs well on LoopTok right now",
                  instavibe: "InstaVibe gets a mild boost from messy vibes",
                  vidwave: "VidWave audience appreciates messy authenticity" },
  mainstream:   { looptok: "LoopTok is in mainstream mode — broad content performs well",
                  instavibe: "✨ InstaVibe polished aesthetic content is performing well",
                  vidwave: "VidWave is in standard mode" },
};

// ── CSS ──────────────────────────────────────────────────────────────────────

const GlobalStyles = () => (
  <style>{`
    /* === BASE === */
    .bdp-root {
      background: #08080B;
      min-height: 100vh;
      max-width: 430px;
      margin: 0 auto;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      position: relative;
      overflow-x: hidden;
    }

    /* === GRAIN OVERLAY === */
    .bdp-root::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      opacity: .025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
      background-size: 200px 200px;
    }

    /* === TOPBAR === */
    .bdp-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px 14px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(8,8,11,.92);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    }

    .bdp-brand-title {
      font-size: 21px;
      font-weight: 900;
      letter-spacing: -.5px;
      background: linear-gradient(90deg, #C9A84C 0%, #E8C87C 45%, #FFD97D 70%, #C9A84C 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer-text 4s linear infinite;
    }

    @keyframes shimmer-text {
      0% { background-position: 0% center; }
      100% { background-position: 200% center; }
    }

    /* === TAB BAR === */
    .bdp-tabs {
      display: flex;
      padding: 0 18px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      overflow-x: auto;
      scrollbar-width: none;
      position: sticky;
      top: 57px;
      z-index: 19;
      background: rgba(8,8,11,.92);
      backdrop-filter: blur(24px);
    }
    .bdp-tabs::-webkit-scrollbar { display: none; }

    .bdp-tab {
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .4px;
      text-transform: uppercase;
      color: rgba(255,255,255,.28);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      flex-shrink: 0;
      transition: color .2s, border-color .2s;
    }
    .bdp-tab.on {
      color: #C9A84C;
      border-bottom-color: #C9A84C;
    }

    /* === SECTION SCAFFOLD === */
    .bdp-section { padding: 16px 18px 0; position: relative; z-index: 1; }
    .bdp-eyebrow {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255,255,255,.22);
      margin-bottom: 10px;
    }

    /* === STAT ROW === */
    .bdp-stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 20px;
    }

    .bdp-stat-cell {
      background: rgba(255,255,255,.025);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 14px;
      padding: 14px 12px 12px;
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: border-color .2s;
    }

    .bdp-stat-cell::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(201,168,76,.04) 0%, transparent 60%);
      pointer-events: none;
    }

    .bdp-stat-value {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -.5px;
      line-height: 1;
    }

    .bdp-stat-label {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255,255,255,.28);
      margin-top: 5px;
    }

    /* === DEAL CARD === */
    .bdp-deal-card {
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 18px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: transform .15s, border-color .2s, box-shadow .2s;
      position: relative;
      overflow: hidden;
    }

    .bdp-deal-card:active { transform: scale(0.98); }

    .bdp-deal-card:hover {
      border-color: rgba(201,168,76,.25);
      box-shadow: 0 0 20px rgba(201,168,76,.06);
    }

    /* shimmer top rim on hover */
    .bdp-deal-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(201,168,76,.4), transparent);
      opacity: 0;
      transition: opacity .2s;
    }
    .bdp-deal-card:hover::before { opacity: 1; }

    .bdp-deal-inner { padding: 15px 16px; }

    /* === CHALLENGE CARD special treatment === */
    .bdp-challenge-card {
      border-color: rgba(201,168,76,.2);
      background: linear-gradient(135deg, rgba(201,168,76,.04) 0%, rgba(8,8,11,.0) 60%);
    }

    .bdp-challenge-card::before {
      opacity: 1;
      background: linear-gradient(90deg, transparent, rgba(255,217,125,.5), transparent);
    }

    /* === HOLOGRAPHIC CHALLENGE BADGE === */
    .bdp-holo {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 6px;
      background: linear-gradient(90deg, #C9A84C, #FFD97D, #E8C87C, #C9A84C);
      background-size: 200% auto;
      color: #08080B;
      animation: holo-shift 3s linear infinite;
    }

    @keyframes holo-shift {
      0% { background-position: 0% center; }
      100% { background-position: 200% center; }
    }

    /* === PLATFORM PILL === */
    .bdp-plat-pill {
      display: inline-flex;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
    }

    /* === TIER DOT === */
    .bdp-tier-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
      flex-shrink: 0;
    }

    /* === PAYOUT AREA === */
    .bdp-pay-row {
      display: flex;
      align-items: flex-end;
      gap: 18px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,.04);
    }

    .bdp-pay-item { display: flex; flex-direction: column; gap: 2px; }
    .bdp-pay-micro { font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.3); }
    .bdp-pay-value { font-size: 16px; font-weight: 900; letter-spacing: -.3px; }

    /* === CONTRACT CARD STATUS === */
    .bdp-status-active  { color: #34d399; }
    .bdp-status-completed { color: #818cf8; }
    .bdp-status-breached  { color: #f87171; }
    .bdp-status-cancelled { color: #6b7280; }

    /* === HEALTH CARD === */
    .bdp-health-card {
      background: rgba(255,255,255,.025);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 20px;
    }

    /* === ALIGN BAR === */
    .bdp-bar-track {
      height: 5px;
      border-radius: 3px;
      background: rgba(255,255,255,.07);
      overflow: hidden;
      flex: 1;
    }

    .bdp-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }

    /* === MODAL === */
    .bdp-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0,0,0,.8);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .bdp-sheet {
      width: 100%;
      max-width: 430px;
      background: #0f0f15;
      border: 1px solid rgba(255,255,255,.08);
      border-bottom: none;
      border-radius: 26px 26px 0 0;
      max-height: 90vh;
      overflow-y: auto;
      scrollbar-width: none;
      animation: slide-up .28s cubic-bezier(.32,0,.67,0) forwards;
    }
    .bdp-sheet::-webkit-scrollbar { display: none; }

    @keyframes slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    .bdp-sheet-drag {
      width: 36px; height: 4px;
      background: rgba(255,255,255,.12);
      border-radius: 2px;
      margin: 12px auto 0;
    }

    .bdp-sheet-header {
      padding: 16px 20px 14px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .bdp-modal-brand {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -.4px;
      color: #fff;
    }

    /* === ALIGN DIAL === */
    .bdp-dial-wrap {
      position: relative;
      width: 90px;
      height: 90px;
      flex-shrink: 0;
    }

    .bdp-dial-svg { transform: rotate(-90deg); }

    .bdp-dial-text {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
    }

    /* === SIGN BUTTON === */
    .bdp-sign-btn {
      width: 100%;
      padding: 15px;
      border-radius: 16px;
      background: linear-gradient(135deg, #C9A84C 0%, #E8C87C 50%, #C9A84C 100%);
      background-size: 200% auto;
      color: #08080B;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: .3px;
      border: none;
      cursor: pointer;
      transition: background-position .4s, opacity .2s, transform .1s;
      animation: shimmer-btn 3s linear infinite;
    }
    .bdp-sign-btn:hover { background-position: right center; transform: translateY(-1px); }
    .bdp-sign-btn:active { transform: translateY(0); }
    .bdp-sign-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; animation: none; }

    @keyframes shimmer-btn {
      0%   { background-position: 0% center; }
      100% { background-position: 200% center; }
    }

    .bdp-pass-btn {
      width: 100%;
      padding: 12px;
      border-radius: 14px;
      background: transparent;
      border: 1px solid rgba(255,255,255,.1);
      color: rgba(255,255,255,.35);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: border-color .15s, color .15s;
      margin-top: 8px;
    }
    .bdp-pass-btn:hover { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.55); }

    /* === MISC === */
    .bdp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 52px 24px;
      color: rgba(255,255,255,.2);
      gap: 10px;
    }

    .bdp-empty-icon { opacity: .2; }
    .bdp-empty-title { font-size: 14px; font-weight: 700; color: rgba(255,255,255,.3); }
    .bdp-empty-sub   { font-size: 12px; color: rgba(255,255,255,.2); text-align: center; }

    .bdp-toast {
      position: sticky;
      top: 57px;
      z-index: 25;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bdp-toast-success { background: rgba(52,211,153,.1); border-bottom: 1px solid rgba(52,211,153,.15); color: #34d399; }
    .bdp-toast-error   { background: rgba(239,68,68,.08);  border-bottom: 1px solid rgba(239,68,68,.15);  color: #f87171; }

    .bdp-view-all-btn {
      width: 100%;
      padding: 11px;
      border-radius: 14px;
      background: rgba(201,168,76,.06);
      border: 1px solid rgba(201,168,76,.15);
      color: #C9A84C;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .3px;
      cursor: pointer;
      transition: background .15s;
    }
    .bdp-view-all-btn:hover { background: rgba(201,168,76,.1); }

    .bdp-divider { height: 1px; background: rgba(255,255,255,.04); margin: 4px 0 14px; }

    .bdp-persona-tag {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .4px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(129,140,248,.1);
      border: 1px solid rgba(129,140,248,.2);
      color: #818cf8;
      margin: 2px;
    }

    .bdp-reasons {
      font-size: 11px;
      color: rgba(255,255,255,.38);
      line-height: 1.55;
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .bdp-spin { animation: spin 1s linear infinite; }

    @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
    .bdp-pulse { animation: pulse-dot 2s ease-in-out infinite; }

    /* === PROGRESS BAR (active contracts) === */
    .bdp-progress-track {
      height: 3px;
      border-radius: 2px;
      background: rgba(255,255,255,.06);
      overflow: hidden;
      margin-top: 8px;
    }
    .bdp-progress-fill {
      height: 100%;
      border-radius: 2px;
      background: linear-gradient(90deg, #C9A84C, #E8C87C);
      transition: width .5s;
    }
  `}</style>
);

// ── AlignDial (SVG arc gauge) ─────────────────────────────────────────────────

function AlignDial({ score, color }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 80);
    return () => clearTimeout(t);
  }, [score]);

  const R = 34;
  const circ = 2 * Math.PI * R;
  const arc  = circ * 0.75; // 270° arc
  const fill = arc * (animated / 100);

  return (
    <div className="bdp-dial-wrap">
      <svg width="90" height="90" className="bdp-dial-svg" style={{ display: "block" }}>
        {/* track */}
        <circle cx="45" cy="45" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5"
          strokeDasharray={`${arc} ${circ - arc}`} strokeDashoffset={-circ * 0.125}
          strokeLinecap="round" />
        {/* fill */}
        <circle cx="45" cy="45" r={R} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ - fill}`} strokeDashoffset={-circ * 0.125}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray .6s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="bdp-dial-text">
        <span style={{ fontSize: 19, fontWeight: 900, color, lineHeight: 1 }}>{animated}</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: ".8px", textTransform: "uppercase" }}>FIT</span>
      </div>
    </div>
  );
}

// ── DealCard ─────────────────────────────────────────────────────────────────

function DealCard({ deal, onClick }) {
  const chall   = isChallenge(deal);
  const isAmb   = deal.deal_type === "ambassador";
  const pColor  = PLAT_COLOR[deal.platform] || "#6b7280";
  const pBg     = PLAT_BG[deal.platform]    || "rgba(107,114,128,.1)";
  const tColor  = TIER_COLOR[deal.tier]     || "#6b7280";
  const al      = alignLabel(alignScore(deal));

  return (
    <div className={`bdp-deal-card${chall ? " bdp-challenge-card" : ""}`} onClick={onClick}>
      <div className="bdp-deal-inner">
        {/* Row 1: brand name + badges */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-.2px", color: "#fff" }}>
                {deal.brand_name}
              </span>
              {chall && <span className="bdp-holo"><Zap size={7} /> Challenge</span>}
              {isAmb && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: ".4px", background: "rgba(251,191,36,.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,.25)" }}><Star size={8} /> AMBASSADOR</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="bdp-plat-pill" style={{ background: pBg, color: pColor }}>
                {PLAT_LABEL[deal.platform] || deal.platform}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: tColor }}>
                <span className="bdp-tier-dot" style={{ background: tColor }} />
                {(deal.tier || "local").toUpperCase()}
              </span>
              {deal.category && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)", fontWeight: 600 }}>
                  {deal.category}
                </span>
              )}
            </div>
          </div>

          {/* Alignment badge */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            background: `${al.glow}`, border: `1px solid ${al.color}33`,
            borderRadius: 10, padding: "6px 9px", flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: al.color, lineHeight: 1 }}>{alignScore(deal)}</span>
            <span style={{ fontSize: 7, fontWeight: 800, color: al.color, letterSpacing: "1px", marginTop: 2, opacity: .8 }}>FIT</span>
          </div>
        </div>

        {/* Row 2: payout breakdown */}
        <div className="bdp-pay-row">
          {isAmb ? (
            <>
              <div className="bdp-pay-item">
                <span className="bdp-pay-micro" style={{ color: "rgba(251,191,36,.55)" }}>Total Value</span>
                <span className="bdp-pay-value" style={{ color: "#fbbf24" }}>{fmtMoney(deal.metadata?.total_contract_value || deal.payout)}</span>
              </div>
              <div className="bdp-pay-item">
                <span className="bdp-pay-micro" style={{ color: "rgba(167,139,250,.55)" }}>Royalty</span>
                <span className="bdp-pay-value" style={{ color: "#a78bfa" }}>{Number(deal.metadata?.royalty_pct || 0)}%</span>
              </div>
              <div className="bdp-pay-item">
                <span className="bdp-pay-micro">Duration</span>
                <span className="bdp-pay-value" style={{ color: "#fff" }}>{deal.duration_turns}<span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>t</span></span>
              </div>
            </>
          ) : (
            <>
              <div className="bdp-pay-item">
                <span className="bdp-pay-micro">Per Turn</span>
                <span className="bdp-pay-value" style={{ color: "#C9A84C" }}>{fmtMoney(deal.per_turn_fee)}</span>
              </div>
              <div className="bdp-pay-item">
                <span className="bdp-pay-micro">Duration</span>
                <span className="bdp-pay-value" style={{ color: "#fff" }}>{deal.duration_turns}<span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>t</span></span>
              </div>
              {Number(deal.signing_bonus) > 0 && (
                <div className="bdp-pay-item">
                  <span className="bdp-pay-micro">Signing</span>
                  <span className="bdp-pay-value" style={{ color: "#E8C87C" }}>{fmtMoney(deal.signing_bonus)}</span>
                </div>
              )}
            </>
          )}
          {deal.expires_turn && (
            <div className="bdp-pay-item" style={{ marginLeft: "auto" }}>
              <span className="bdp-pay-micro">Expires</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)" }}>t{deal.expires_turn}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ContractCard ─────────────────────────────────────────────────────────────

function ContractCard({ contract, currentTurn: currentTurnProp }) {
  const navigate = useNavigate();
  const platKey  = (contract.primary_platform || contract.platform || "").toLowerCase();
  const pColor   = PLAT_COLOR[platKey] || PLAT_COLOR[contract.platform] || "#6b7280";
  const pBg      = PLAT_BG[platKey]    || PLAT_BG[contract.platform]    || "rgba(107,114,128,.1)";
  const tColor   = TIER_COLOR[contract.tier] || "#6b7280";
  const currentTurn = Number(currentTurnProp || contract.current_turn_id || 0);

  function handlePostNow() {
    const scope = String(contract.platform_scope || contract.platform || '').toLowerCase();
    if (scope === 'looptok') {
      navigate('/Social', { state: { openApp: 'looptok', preselectedContractId: contract.id } });
    } else if (scope === 'instavibe') {
      navigate('/Social', { state: { openApp: 'instavibe', initialTab: 'brand_deals', preselectedContractId: contract.id } });
    } else if (scope === 'vidwave') {
      navigate('/Social', { state: { openApp: 'vidwave', preselectedContractId: contract.id } });
    } else {
      navigate('/Social', { state: { preselectedContractId: contract.id } });
    }
  }

  const progress = (contract.start_turn_id && contract.end_turn_id)
    ? Math.min(100, Math.max(0, Math.round(
        ((currentTurn - Number(contract.start_turn_id || 0)) / (Number(contract.end_turn_id || 0) - Number(contract.start_turn_id || 0) || 1)) * 100
      )))
    : null;
  const turnsLeft = contract.end_turn_id ? Math.max(0, Number(contract.end_turn_id) - currentTurn) : null;

  const kpiSummary = Object.entries(contract.kpis || {})
    .map(([key, required]) => ({
      key,
      required: Number(required) || 0,
      current: Number(contract.kpi_progress?.[key]) || 0,
    }))
    .filter((entry) => entry.required > 0);
  const formatKpiValue = (key, value) => {
    const numericValue = Number(value) || 0;
    if (key === "required_engagement_rate") return `${numericValue.toFixed(1)}%`;
    if (numericValue >= 1000) return `${(numericValue / 1000).toFixed(numericValue >= 10000 ? 0 : 1)}K`;
    return numericValue.toLocaleString();
  };
  const delivType = (contract.deliverable_type || "post").toLowerCase();
  const postLabel = delivType === "video" ? "Videos" : delivType === "cross_platform" ? "Content Pieces" : "Posts Created";
  const kpiLabel = (key) => ({
    required_posts: postLabel,
    required_engagement_rate: "Avg Engagement",
    required_reach: "Total Reach",
  }[key] || key.replace(/_/g, " "));

  // Plain-English content hint
  const contractPlatformLabel = PLAT_LABEL[platKey] || contract.platform || "Cross-Platform";
  const contractCatKey = (contract.category || "").toLowerCase();
  const contractContentHint = CATEGORY_PLATFORM_CONTENT_MAP[contractCatKey]?.[platKey];
  const contractDelivCount = Number(contract.deliverable_count_required || contract.kpis?.required_posts || 0);
  const contractDelivCompleted = Number(contract.deliverable_count_completed || 0);
  const isAmbassador = contract.deal_type === "ambassador";
  const royaltyPct = Number(contract.metadata?.royalty_pct || 0);
  const totalContractValue = Number(contract.metadata?.total_contract_value || 0);

  return (
    <div className="bdp-deal-card">
      <div className="bdp-deal-inner">
        {/* Row 1: brand name + badges — mirrors DealCard */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-.2px", color: "#fff" }}>
                {contract.brand_name}
              </span>
              {isAmbassador && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: ".4px", background: "rgba(251,191,36,.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,.25)" }}><Star size={8} /> AMBASSADOR</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="bdp-plat-pill" style={{ background: pBg, color: pColor }}>
                {contractPlatformLabel}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: tColor }}>
                <span className="bdp-tier-dot" style={{ background: tColor }} />
                {(contract.tier || "local").toUpperCase()}
              </span>
              {contract.category && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)", fontWeight: 600 }}>
                  {contract.category}
                </span>
              )}
            </div>
          </div>

          {/* Progress badge (replaces alignment badge from DealCard) */}
          {progress !== null && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: progress >= 75 ? "rgba(52,211,153,.08)" : "rgba(255,255,255,.04)",
              border: `1px solid ${progress >= 75 ? "rgba(52,211,153,.25)" : "rgba(255,255,255,.08)"}`,
              borderRadius: 10, padding: "6px 9px", flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: progress >= 75 ? "#34d399" : "#fff", lineHeight: 1 }}>{progress}%</span>
              <span style={{ fontSize: 7, fontWeight: 800, color: progress >= 75 ? "#34d399" : "rgba(255,255,255,.4)", letterSpacing: "1px", marginTop: 2, opacity: .8 }}>DONE</span>
            </div>
          )}
        </div>

        {/* Row 2: payout breakdown — mirrors DealCard pay-row */}
        <div className="bdp-pay-row">
          <div className="bdp-pay-item">
            <span className="bdp-pay-micro">Per Turn</span>
            <span className="bdp-pay-value" style={{ color: "#C9A84C" }}>{fmtMoney(contract.per_turn_fee)}</span>
          </div>
          <div className="bdp-pay-item">
            <span className="bdp-pay-micro">Duration</span>
            <span className="bdp-pay-value" style={{ color: "#fff" }}>{contract.duration_turns || (contract.end_turn_id && contract.start_turn_id ? Number(contract.end_turn_id) - Number(contract.start_turn_id) : "—")}<span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>t</span></span>
          </div>
          {Number(contract.signing_bonus) > 0 && (
            <div className="bdp-pay-item">
              <span className="bdp-pay-micro">Signing</span>
              <span className="bdp-pay-value" style={{ color: "#E8C87C" }}>{fmtMoney(contract.signing_bonus)}</span>
            </div>
          )}
          {turnsLeft !== null && (
            <div className="bdp-pay-item" style={{ marginLeft: "auto" }}>
              <span className="bdp-pay-micro">Remaining</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: turnsLeft <= 3 ? "#f87171" : "rgba(255,255,255,.5)" }}>{turnsLeft}t</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {contract.status === "active" && progress !== null && (
          <div className="bdp-progress-track">
            <div className="bdp-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Ambassador value + royalty row */}
        {isAmbassador && totalContractValue > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 10 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>Total Value: {fmtMoney(totalContractValue)}</span>
            {royaltyPct > 0 && <span style={{ color: "#a78bfa", fontWeight: 700 }}>{royaltyPct.toFixed(1)}% royalty</span>}
          </div>
        )}

        {/* Content task hint — plain-English */}
        {contract.status === "active" && contractDelivCount > 0 && (
          <div style={{ marginTop: 8, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "8px 12px", border: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>What They Want</div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,.7)" }}>
              {contractContentHint ? (
                contractDelivCount > 1 && contractContentHint.many
                  ? contractContentHint.many(contractDelivCount)
                  : contractContentHint.one
              ) : (
                `Create ${contractDelivCount} ${contract.deliverable_type ? String(contract.deliverable_type).replace(/_/g, " ") : "post"}${contractDelivCount > 1 ? "s" : ""} on ${contractPlatformLabel}`
              )}
            </div>
            {contractDelivCompleted > 0 && (
              <div style={{ fontSize: 10, color: "#34d399", marginTop: 3, fontWeight: 600 }}>
                {contractDelivCompleted} of {contractDelivCount} completed
              </div>
            )}
          </div>
        )}

        {/* KPI tracker */}
        {kpiSummary.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", padding: "10px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 6 }}>Performance Targets</div>
            {kpiSummary.map((kpi) => (
              <div key={kpi.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 10.5 }}>
                <span style={{ color: "rgba(255,255,255,.55)" }}>{kpiLabel(kpi.key)}</span>
                <span style={{ color: kpi.current >= kpi.required ? "#86efac" : "rgba(255,255,255,.82)", fontWeight: 600 }}>
                  {formatKpiValue(kpi.key, kpi.current)} / {formatKpiValue(kpi.key, kpi.required)}
                </span>
              </div>
            ))}
            {Number(contract.performance_bonus) > 0 && (
              <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 10, color: "#E8C87C", fontWeight: 600 }}>
                + {fmtMoney(contract.performance_bonus)} KPI bonus on completion
              </div>
            )}
          </div>
        )}

        {/* Fulfillment guidance — tells players how this contract earns credit */}
        {contract.status === "active" && (
          <div style={{ marginTop: 8, padding: "7px 12px", background: "rgba(255,255,255,.025)", borderRadius: 9, border: "1px solid rgba(255,255,255,.06)", fontSize: 10.5, color: "rgba(255,255,255,.5)", lineHeight: 1.45 }}>
            {platKey === "vidwave"
              ? "⚠ VidWave contracts require manual linking — open VidWave, create a video, and link it to this contract to earn credit."
              : "✓ Your posts on this platform are tracked automatically. Keep posting to earn credit."
            }
          </div>
        )}

        {/* Post Now CTA */}
        {contract.status === "active" && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handlePostNow}
              style={{ fontSize: 11, fontWeight: 700, color: "#C9A84C", border: "1px solid rgba(201,168,76,0.35)", background: "rgba(201,168,76,0.08)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", letterSpacing: ".2px" }}
            >
              Post Now →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AlignmentModal({ deal, profile, fanProfile, onAccept, onClose, accepting, error, algorithmMood }) {
  const score = alignScore(deal);
  const alignment = alignLabel(score);
  const platformKey = (deal.primary_platform || deal.platform || "").toLowerCase();
  const platformLabel = PLAT_LABEL[platformKey] || PLAT_LABEL[deal.platform] || deal.platform || "Cross-Platform";
  const deliverables = Array.isArray(deal.deliverables)
    ? deal.deliverables
    : Array.isArray(deal.metadata?.deliverables)
      ? deal.metadata.deliverables
      : [];

  // Plain-English content suggestion
  const catKey = (deal.category || "").toLowerCase();
  const contentHint = CATEGORY_PLATFORM_CONTENT_MAP[catKey]?.[platformKey];
  const delivCount = Number(deal.deliverable_count_required || deal.kpis?.required_posts || 0);
  const delivType  = deal.deliverable_type || deal.metadata?.deliverable_type || null;

  // Human-readable performance targets
  const reqReach = Number(deal.kpis?.required_reach || 0);
  const reqEng   = Number(deal.kpis?.required_engagement_rate || 0);

  // Algorithm mood tip
  const moodTip = algorithmMood && ALGORITHM_MOOD_TIPS[algorithmMood]?.[platformKey];

  // ── Build plain-English Brand Insights ────────────────────────────────────
  const rawPid = normalizePersonaId(
    profile?.core_brand_identity_primary || profile?.marketing_persona
  );
  const primaryLabel = rawPid ? (PERSONA_DISPLAY_LABELS[rawPid] || rawPid) : null;
  const fanbaseName = fanProfile?.custom_fanbase_nickname || "your fanbase";
  const homeRegion = profile?.region || null;

  // Parse region_share for top regions
  const safeJson = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
  const regionShare = safeJson(fanProfile?.region_share);
  const topRegions = Object.entries(regionShare)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 2)
    .map(([r]) => r);

  const insightParts = [];
  if (primaryLabel) {
    const brandPossessive = deal.brand_name.endsWith("s") ? `${deal.brand_name}'` : `${deal.brand_name}'s`;
    insightParts.push(`As a ${primaryLabel}, you and ${fanbaseName} align well with ${brandPossessive} target audience.`);
  }
  if (homeRegion || topRegions.length > 0) {
    const regions = topRegions.length > 0 ? topRegions.join(" and ") : homeRegion;
    insightParts.push(`Your reputation in ${regions} makes you a stronger candidate for this partnership.`);
  }
  if (deal.category) {
    insightParts.push(`${deal.brand_name} operates in the ${deal.category} space — a natural fit for your brand direction.`);
  }
  const brandInsight = insightParts.length > 0
    ? insightParts.join(" ")
    : "This deal fits your current brand image and platform presence.";

  return (
    <div className="bdp-overlay" onClick={onClose}>
      <div className="bdp-sheet" onClick={(event) => event.stopPropagation()} >
        <div className="bdp-sheet-drag" />
        <div className="bdp-sheet-header">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div className="bdp-modal-brand">{deal.brand_name}</div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="bdp-plat-pill" style={{ background: PLAT_BG[platformKey] || PLAT_BG[deal.platform] || "rgba(107,114,128,.12)", color: PLAT_COLOR[platformKey] || PLAT_COLOR[deal.platform] || "#9ca3af" }}>
                  {platformLabel}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[deal.tier] || "#9ca3af", letterSpacing: ".4px", textTransform: "uppercase" }}>
                  {deal.tier || "local"}
                </span>
                {deal.category && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.4)" }}>{deal.category}</span>
                )}
              </div>
              {deal.deal_type === "ambassador" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: ".5px", background: "rgba(251,191,36,.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,.25)", marginTop: 6 }}>
                  <Star size={10} /> AMBASSADOR DEAL
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.45)", padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Ambassador total value banner */}
          {deal.deal_type === "ambassador" && (
            <div style={{ background: "linear-gradient(135deg, rgba(251,191,36,.08), rgba(167,139,250,.08))", border: "1px solid rgba(251,191,36,.2)", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(251,191,36,.7)", letterSpacing: ".5px", textTransform: "uppercase" }}>Total Contract Value</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", marginTop: 2 }}>{fmtMoney(deal.metadata?.total_contract_value || deal.payout)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,.7)", letterSpacing: ".5px", textTransform: "uppercase" }}>Royalty</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa", marginTop: 2 }}>{Number(deal.metadata?.royalty_pct || 0).toFixed(1)}%</div>
              </div>
            </div>
          )}

          {/* Alignment dial + Brand Insights */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <AlignDial score={score} color={alignment.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", color: alignment.color, textTransform: "uppercase" }}>
                {alignment.label}
              </div>
            </div>
          </div>

          <div>
            <div className="bdp-eyebrow">Brand Insights</div>
            <div style={{ fontSize: 12, lineHeight: 1.65, color: "rgba(255,255,255,.62)", padding: "0 2px" }}>
              {brandInsight}
            </div>
          </div>

          {/* Deal Terms */}
          {deal.deal_type === "ambassador" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Per Turn</div>
                <div className="bdp-stat-value" style={{ color: "#C9A84C", fontSize: 18, marginTop: 6 }}>{fmtMoney(deal.per_turn_fee)}</div>
              </div>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Signing Bonus</div>
                <div className="bdp-stat-value" style={{ color: "#E8C87C", fontSize: 18, marginTop: 6 }}>{fmtMoney(deal.signing_bonus)}</div>
              </div>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Performance Bonus</div>
                <div className="bdp-stat-value" style={{ color: "#34d399", fontSize: 18, marginTop: 6 }}>{fmtMoney(deal.performance_bonus)}</div>
              </div>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Duration</div>
                <div className="bdp-stat-value" style={{ color: "#fff", fontSize: 18, marginTop: 6 }}>{Number(deal.duration_turns) || 0}<span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}> turns</span></div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Per Turn</div>
                <div className="bdp-stat-value" style={{ color: "#C9A84C", fontSize: 18, marginTop: 6 }}>{fmtMoney(deal.per_turn_fee)}</div>
              </div>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Signing</div>
                <div className="bdp-stat-value" style={{ color: "#E8C87C", fontSize: 18, marginTop: 6 }}>{fmtMoney(deal.signing_bonus)}</div>
              </div>
              <div className="bdp-stat-cell" style={{ textAlign: "left" }}>
                <div className="bdp-stat-label">Duration</div>
                <div className="bdp-stat-value" style={{ color: "#fff", fontSize: 18, marginTop: 6 }}>{Number(deal.duration_turns) || 0}t</div>
              </div>
            </div>
          )}

          {/* What They Want — plain-English content tasks */}
          <div>
            <div className="bdp-eyebrow">What They Want</div>
            <div className="bdp-health-card" style={{ marginBottom: 0, padding: "14px 16px" }}>
              {contentHint ? (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,.82)" }}>
                  {delivCount > 1 && contentHint.many
                    ? contentHint.many(delivCount)
                    : contentHint.one}
                </div>
              ) : (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,.82)" }}>
                  {delivCount > 0
                    ? `Create ${delivCount} ${delivType ? String(delivType).replace(/_/g, " ") : "post"}${delivCount > 1 ? "s" : ""} on ${platformLabel}`
                    : `Post brand content on ${platformLabel}`}
                </div>
              )}
            </div>
          </div>

          {/* Performance Targets — human-readable */}
          {(reqReach > 0 || reqEng > 0) && (
            <div>
              <div className="bdp-eyebrow">Performance Targets</div>
              <div style={{ display: "grid", gap: 8 }}>
                {reqReach > 0 && (
                  <div className="bdp-health-card" style={{ marginBottom: 0, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,.5)" }}>Total Reach</span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>
                        {reqReach >= 1000 ? `${(reqReach / 1000).toFixed(reqReach >= 10000 ? 0 : 1)}K` : reqReach} views
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 4 }}>
                      Get at least {reqReach >= 1000 ? `${(reqReach / 1000).toFixed(reqReach >= 10000 ? 0 : 1)}K` : reqReach} total views across your brand posts
                    </div>
                  </div>
                )}
                {reqEng > 0 && (
                  <div className="bdp-health-card" style={{ marginBottom: 0, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,.5)" }}>Engagement Rate</span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>{reqEng.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 4 }}>
                      Maintain at least {reqEng.toFixed(1)}% engagement rate on brand content
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Algorithm Mood Tip */}
          {moodTip && (
            <div style={{ background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.18)", borderRadius: 14, padding: "11px 14px" }}>
              <div style={{ fontSize: 11, color: "rgba(167,139,250,.85)", lineHeight: 1.5 }}>{moodTip}</div>
            </div>
          )}

          {/* Deliverables tags */}
          {deliverables.length > 0 && (
            <div>
              <div className="bdp-eyebrow">Deliverables</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {deliverables.map((item, index) => (
                  <span key={`${item}-${index}`} className="bdp-persona-tag">{String(item).replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bdp-toast bdp-toast-error" style={{ position: "static", top: "auto", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(239,68,68,.15)" }}>
              <XCircle size={14} /> {error}
            </div>
          )}

          <div>
            <button className="bdp-sign-btn" onClick={onAccept} disabled={accepting}>
              {accepting ? "Signing..." : `Sign with ${deal.brand_name}`}
            </button>
            <button className="bdp-pass-btn" onClick={onClose} disabled={accepting}>Pass for now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Brand Identity Detail Modal (migrated from Social.jsx BrandModal) ────────

function BrandIdentityModal({ profile, brandStats, fanProfile, currentEra, careerSnapshot, onClose, onSaveTagline }) {
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

  const dirFn = (v, up = 1.02, down = 0.98) => v >= up ? "Up" : v <= down ? "Down" : "Neutral";
  const trendEffects = {
    conversionImpact: dirFn(Number(effects.discoveryConversionMultAdj) || 1, 1.015, 0.985),
    retentionImpact:  dirFn(1 - (Number(effects.decayRateAddend) || 0), 1.005, 0.995),
    merchImpact:      dirFn(Number(effects.merchRevenueMultAdj) || 1, 1.015, 0.985),
    brandDealsImpact: dirFn(1 + (Number(effects.brandDealChanceAdj) || 0), 1.015, 0.985),
  };

  const rawPrimaryId = normalizePersonaId(
    profile?.core_brand_identity_primary || currentEra?.expression_identity_primary
    || brandStats?.marketing_persona_primary || profile?.marketing_persona
  );
  const rawSecondaryId = normalizePersonaId(
    profile?.core_brand_identity_secondary || currentEra?.expression_identity_secondary
    || brandStats?.marketing_persona_secondary || profile?.sub_persona
  );

  const a = {
    primaryIdentity:   rawPrimaryId   ? (PERSONA_DISPLAY_LABELS[rawPrimaryId]   || rawPrimaryId)   : "Developing Persona",
    secondaryIdentity: rawSecondaryId ? (PERSONA_DISPLAY_LABELS[rawSecondaryId] || rawSecondaryId) : "Unfolding",
    confidencePct:     Math.round((Number(profile?.brand_identity_confidence || brandStats?.marketing_persona_confidence || 0.62)) * 100),
    tagline:           profile?.brand_tagline || profile?.bio || profile?.artist_bio || "Your audience identity is evolving each turn.",
    careerTrend:       Object.entries(trendState).find(([, active]) => Boolean(active))?.[0] || mods?.current_trend || "STEADY_GROWTH",
    trendHeldTurns:    Number(mods?.trend_hold_turns || 0),
    audienceQuality: {
      audienceDepth:           Number(mods?.audience_depth ?? 0),
      depthTier:               mods?.depth_tier || "Tier 1",
      culturalGravity:         Number(mods?.cultural_gravity ?? 1),
      viralHalfLifeMult:       Number(mods?.viral_half_life_mult ?? 1),
      discoveryConversionMult: Number(mods?.discovery_conversion_mult ?? 1),
      stabilityDampeningMult:  Number(mods?.stability_dampening_mult ?? 1),
    },
    trendEffects,
    marketPositioning: computeMarketPositioning(profile, rawPrimaryId, { careerSnapshot, fanProfile, currentEra }),
    brandCompatibility: computeBrandCompatibility(rawPrimaryId, rawSecondaryId, profile),
  };

  const aq = a.audienceQuality;

  const [editingTagline, setEditingTagline] = React.useState(false);
  const [taglineDraft, setTaglineDraft] = React.useState(a.tagline || "");
  const [taglineSaving, setTaglineSaving] = React.useState(false);

  const saveTagline = async () => {
    if (!onSaveTagline || !taglineDraft.trim()) return;
    setTaglineSaving(true);
    try { await onSaveTagline(taglineDraft.trim()); setEditingTagline(false); }
    catch (e) { console.error("Save tagline failed:", e); }
    finally { setTaglineSaving(false); }
  };

  const gravLabel = culturalGravityLabel(aq.culturalGravity);
  const dLabel    = depthLabel(aq.audienceDepth, aq.depthTier);
  const discLabel = discoveryLabel(aq.discoveryConversionMult);
  const longLabel = longevityLabel(aq.viralHalfLifeMult, aq.stabilityDampeningMult);

  const mktPos = a.marketPositioning || {};
  const industryLane = mktPos.industry_lane || null;
  const tourDemand   = mktPos.tour_demand   || null;
  const brandFit     = mktPos.brand_fit     || null;
  const collabPull   = mktPos.collab_pull   || null;

  const brandComp     = a.brandCompatibility || {};
  const strongBrands  = brandComp.strong  || [];
  const emergingBrands= brandComp.emerging|| [];
  const weakBrands    = brandComp.weak    || [];

  const momLabel  = trajectoryLabel(a.trendEffects);
  const stabLabel = stabilityLabel(aq.stabilityDampeningMult);
  const riskLvl   = riskLabel(a.trendEffects);
  const ups       = Object.values(a.trendEffects).filter((v) => v === "Up").length;
  const downs     = Object.values(a.trendEffects).filter((v) => v === "Down").length;
  const momColor  = ups >= 2 ? "#fb923c" : downs >= 2 ? "#f87171" : "#fbbf24";
  const momEmoji  = ups >= 2 ? "🔥" : downs >= 2 ? "📉" : "✨";

  const Bar = ({ value, gradient = "linear-gradient(90deg,#8b5cf6,#a78bfa)", h = 4 }) => (
    <div style={{ height: h, background: "rgba(255,255,255,.07)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: gradient, borderRadius: 99 }} />
    </div>
  );

  const SLabel = ({ children }) => <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.26)", letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 9 }}>{children}</div>;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.72)", backdropFilter: "blur(14px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 480, background: "#13121a", border: "1px solid rgba(255,255,255,.09)", borderBottom: "none", borderRadius: "24px 24px 0 0", maxHeight: "91vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 2px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,.14)" }} />
        </div>
        <div style={{ padding: "14px 20px 48px" }}>

          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,.6)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Brand Identity</div>

          {/* Hero card */}
          <div style={{ background: "linear-gradient(135deg,rgba(139,92,246,.13) 0%,rgba(236,72,153,.08) 100%)", border: "1px solid rgba(139,92,246,.2)", borderRadius: 18, padding: "16px", marginBottom: 20 }}>
            {editingTagline ? (
              <div style={{ marginBottom: 14, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="text" value={taglineDraft} onChange={(e) => setTaglineDraft(e.target.value)} maxLength={120} autoFocus
                  style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(167,139,250,.3)", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#fff", outline: "none", fontStyle: "italic" }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTagline(); if (e.key === "Escape") setEditingTagline(false); }} />
                <button onClick={saveTagline} disabled={taglineSaving} style={{ background: "rgba(139,92,246,.25)", border: "1px solid rgba(139,92,246,.4)", borderRadius: 6, padding: "4px 10px", fontSize: 10, color: "#a78bfa", fontWeight: 600, cursor: "pointer" }}>
                  {taglineSaving ? "..." : "Save"}
                </button>
                <button onClick={() => setEditingTagline(false)} style={{ background: "transparent", border: "none", fontSize: 10, color: "rgba(255,255,255,.4)", cursor: "pointer" }}>✕</button>
              </div>
            ) : (
              <div onClick={() => setEditingTagline(true)} style={{ fontSize: 11, color: "rgba(236,233,255,.86)", lineHeight: 1.65, fontStyle: "italic", marginBottom: 14, cursor: "pointer" }} title="Click to edit your brand slogan">
                {a.tagline}
                <span style={{ marginLeft: 6, fontSize: 9, color: "rgba(167,139,250,.5)" }}>✎</span>
              </div>
            )}
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5, marginBottom: 2 }}>{a.primaryIdentity}</div>
            <div style={{ fontSize: 12, color: "rgba(167,139,250,.72)", marginBottom: 14 }}>+ {a.secondaryIdentity}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: "rgba(236,233,255,.82)" }}>Confidence</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{a.confidencePct}%</span>
            </div>
            <Bar value={a.confidencePct} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: .25, background: "rgba(167,139,250,.13)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.24)" }}>{a.careerTrend}</span>
              <span style={{ fontSize: 11, color: "rgba(236,233,255,.78)" }}>Held {a.trendHeldTurns} turns</span>
            </div>
          </div>

          {/* Cultural DNA */}
          <SLabel>Cultural DNA</SLabel>
          <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: "12px 14px", marginBottom: 18 }}>
            {[["Cultural Gravity", gravLabel], ["Audience Depth", dLabel], ["Discovery", discLabel], ["Longevity", longLabel]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontSize: 12, color: "rgba(236,233,255,.78)" }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Market Positioning */}
          <SLabel>Market Positioning</SLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            {[["Industry Lane", industryLane, "#a78bfa"], ["Tour Demand", tourDemand, "#4ade80"], ["Brand Fit", brandFit, "#60a5fa"], ["Collab Pull", collabPull, "#fb923c"]]
              .filter(([, v]) => v)
              .map(([k, v, c]) => (
                <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: "11px 12px" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.30)", marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
          </div>

          {/* Brand Compatibility */}
          <SLabel>Brand Compatibility</SLabel>
          {strongBrands.length > 0 ? (
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: "12px 14px", marginBottom: 18 }}>
              {[["STRONG", strongBrands.join(", "), "#4ade80"], ["EMERGING", emergingBrands.join(", "), "#fbbf24"], ["WEAK", weakBrands.join(", "), "rgba(255,255,255,.28)"]]
                .filter(([, v]) => v)
                .map(([l, v, c]) => (
                  <div key={l} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: c, width: 56, letterSpacing: .5 }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: l === "WEAK" ? "rgba(255,255,255,.4)" : "#fff" }}>{v}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: "12px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontStyle: "italic" }}>Brand compatibility is shaped by your identity and audience profile.</div>
            </div>
          )}

          {/* Trajectory */}
          <SLabel>Trajectory</SLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              ["Momentum", momLabel, momColor],
              ["Stability", stabLabel, aq.stabilityDampeningMult >= 1.0 ? "#4ade80" : "#f87171"],
              ["Risk Level", riskLvl, riskLvl === "Low" ? "#4ade80" : riskLvl === "Moderate" ? "#fbbf24" : "#f87171"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 18, padding: "11px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.28)", marginBottom: 5, lineHeight: 1.3 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: c, lineHeight: 1.2 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Momentum callout */}
          <div style={{ background: `${momColor}14`, border: `1px solid ${momColor}33`, borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{momEmoji}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: momColor }}>{momLabel}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.28)", marginTop: 2 }}>Identity trajectory this cycle</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ offers, contracts, brandStats, profile, fanProfile, currentEra, careerSnapshot, algorithmMood: _algorithmMood, onOpenIdentity: _onOpenIdentity, onSeeOffers, onSeeActive, onSelect, currentTurn }) {
  const totalRevPerTurn = contracts.reduce((s, c) => s + Number(c.per_turn_fee || 0), 0);
  const lifetime        = Number(brandStats?.total_earnings || 0);
  const offerCount      = offers.length;
  const activeCount     = contracts.length;

  // ── Brand Identity view model ──────────────────────────────────────────────
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

  const dirFn = (v, up = 1.02, down = 0.98) => v >= up ? "Up" : v <= down ? "Down" : "Neutral";
  const trendEffects = {
    conversionImpact: dirFn(Number(effects.discoveryConversionMultAdj) || 1, 1.015, 0.985),
    retentionImpact:  dirFn(1 - (Number(effects.decayRateAddend) || 0), 1.005, 0.995),
    merchImpact:      dirFn(Number(effects.merchRevenueMultAdj) || 1, 1.015, 0.985),
    brandDealsImpact: dirFn(1 + (Number(effects.brandDealChanceAdj) || 0), 1.015, 0.985),
  };

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

  const primaryIdentity   = rawPrimaryId   ? (PERSONA_DISPLAY_LABELS[rawPrimaryId]   || rawPrimaryId)   : "Developing Persona";
  const secondaryIdentity = rawSecondaryId ? (PERSONA_DISPLAY_LABELS[rawSecondaryId] || rawSecondaryId) : "Unfolding";
  const confidencePct     = Math.round((Number(profile?.brand_identity_confidence || brandStats?.marketing_persona_confidence || 0.62)) * 100);
  const _tagline          = profile?.brand_tagline || "Your brand story is still being written...";
  const currentTrend      = Object.entries(trendState).find(([, active]) => Boolean(active))?.[0] || mods?.current_trend || "STEADY_GROWTH";

  const aq = {
    audienceDepth:           Number(mods?.audience_depth ?? 0),
    depthTier:               mods?.depth_tier || "Tier 1",
    culturalGravity:         Number(mods?.cultural_gravity ?? 1),
    viralHalfLifeMult:       Number(mods?.viral_half_life_mult ?? 1),
    discoveryConversionMult: Number(mods?.discovery_conversion_mult ?? 1),
    stabilityDampeningMult:  Number(mods?.stability_dampening_mult ?? 1),
  };

  const marketPos = computeMarketPositioning(profile, rawPrimaryId, { careerSnapshot, fanProfile, currentEra });
  const brandComp = computeBrandCompatibility(rawPrimaryId, rawSecondaryId, profile);
  const momLabel  = trajectoryLabel(trendEffects);
  const stabLabel = stabilityLabel(aq.stabilityDampeningMult);
  const riskLvl   = riskLabel(trendEffects);

  const ups   = Object.values(trendEffects).filter((v) => v === "Up").length;
  const downs = Object.values(trendEffects).filter((v) => v === "Down").length;
  const momColor = ups >= 2 ? "#fb923c" : downs >= 2 ? "#f87171" : "#fbbf24";

  return (
    <div className="bdp-section" style={{ paddingTop: 20 }}>

      {/* ── Brand Identity Summary Bar (hero card now lives on Career.jsx) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg,rgba(139,92,246,.1) 0%,rgba(236,72,153,.05) 100%)", border: "1px solid rgba(139,92,246,.18)", borderRadius: 16, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: "rgba(167,139,250,.5)", marginBottom: 4 }}>Your Brand</div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>{primaryIdentity}</div>
          <div style={{ fontSize: 10, color: "rgba(167,139,250,.6)", marginTop: 1 }}>+ {secondaryIdentity}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 99, padding: "3px 9px", fontSize: 9, fontWeight: 700, background: "rgba(167,139,250,.13)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.22)" }}>{currentTrend}</span>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", marginTop: 4 }}>{confidencePct}%</div>
        </div>
      </div>

      {/* Headline stats */}
      <div className="bdp-stats-row">
        <div className="bdp-stat-cell">
          <div className="bdp-stat-value" style={{ color: "#C9A84C" }}>{activeCount}</div>
          <div className="bdp-stat-label">Active</div>
        </div>
        <div className="bdp-stat-cell">
          <div className="bdp-stat-value" style={{ color: "#fff" }}>{fmtMoney(totalRevPerTurn)}</div>
          <div className="bdp-stat-label">/ Turn</div>
        </div>
        <div className="bdp-stat-cell">
          <div className="bdp-stat-value" style={{ color: "#E8C87C" }}>{fmtMoney(lifetime)}</div>
          <div className="bdp-stat-label">Lifetime</div>
        </div>
      </div>

      {/* Brand health card */}
      {brandStats && (
        <div className="bdp-health-card" style={{ marginBottom: 20 }}>
          <div className="bdp-eyebrow" style={{ marginBottom: 12 }}>Brand Health</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            {[
              { label: "Safety",      val: Math.round(Number(brandStats.brand_safety_rating    || 50)), color: Number(brandStats.brand_safety_rating || 50) >= 70 ? "#34d399" : "#f59e0b" },
              { label: "Reputation",  val: reputationScoreFromModifier(brandStats.reputation_modifier), color: "#818cf8" },
              { label: "Overexposed", val: Math.round(Number(brandStats.overexposure_score     || 0)),  color: Number(brandStats.overexposure_score || 0) > 60 ? "#f87171" : "#6b7280" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color }}>{val}</div>
                <div className="bdp-bar-track" style={{ margin: "4px 0" }}>
                  <div className="bdp-bar-fill" style={{ width: `${val}%`, background: color, opacity: .85 }} />
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,.25)" }}>{label}</div>
              </div>
            ))}
          </div>

          {brandStats.marketing_persona_primary && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,.25)" }}>Persona</span>
              <span className="bdp-persona-tag">{brandStats.marketing_persona_primary}</span>
              {brandStats.marketing_persona_secondary && (
                <span className="bdp-persona-tag">{brandStats.marketing_persona_secondary}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Audience View — Trajectory ────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div className="bdp-eyebrow" style={{ marginBottom: 10 }}>Audience View</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            ["Momentum",   momLabel,  momColor],
            ["Stability",  stabLabel, aq.stabilityDampeningMult >= 1.0 ? "#4ade80" : "#f87171"],
            ["Risk Level", riskLvl,   riskLvl === "Low" ? "#4ade80" : riskLvl === "Moderate" ? "#fbbf24" : "#f87171"],
          ].map(([k, v, c]) => (
            <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.28)", marginBottom: 5, lineHeight: 1.3 }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: c, lineHeight: 1.2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Brand Fit — Industry Lane + Compatibility ─────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div className="bdp-eyebrow" style={{ marginBottom: 10 }}>Brand Fit</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[
            ["Industry Lane", marketPos.industry_lane, marketPos.lane_info?.primary?.color || "#a78bfa"],
            ["Brand Fit",     marketPos.brand_fit,     "#60a5fa"],
          ].map(([k, v, c]) => (
            <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 12px" }}>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.28)", marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {brandComp.strong.length > 0 && (
          <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 14px" }}>
            {[
              ["STRONG",   brandComp.strong,   "#4ade80"],
              ["EMERGING", brandComp.emerging,  "#fbbf24"],
              ["WEAK",     brandComp.weak,      "rgba(255,255,255,.28)"],
            ].filter(([, v]) => v.length > 0).map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: c, width: 56, letterSpacing: .5 }}>{l}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: l === "WEAK" ? "rgba(255,255,255,.4)" : "#fff" }}>{v.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Ambassador Deals section ─────────────────────────────────── */}
      {(() => {
        const ambassadorContracts = contracts.filter(c => c.deal_type === "ambassador");
        if (ambassadorContracts.length === 0) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <div className="bdp-eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Star size={12} color="#fbbf24" /> Ambassador Deals
            </div>
            {ambassadorContracts.map(c => (
              <ContractCard key={c.id} contract={c} currentTurn={currentTurn} />
            ))}
          </div>
        );
      })()}

      {/* New offers preview */}
      {offerCount > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="bdp-eyebrow" style={{ margin: 0 }}>New Offers ({offerCount})</div>
            {offerCount > 2 && (
              <button onClick={onSeeOffers} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#C9A84C" }}>
                View All →
              </button>
            )}
          </div>
          {offers.slice(0, 2).map(o => (
            <DealCard key={o.id} deal={o} onClick={() => onSelect(o)} />
          ))}
        </div>
      )}

      {/* Active contracts preview */}
      {activeCount > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="bdp-eyebrow" style={{ margin: 0 }}>Active Contracts ({activeCount})</div>
            {activeCount > 2 && (
              <button onClick={onSeeActive} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#C9A84C" }}>
                View All →
              </button>
            )}
          </div>
          {contracts.slice(0, 2).map(c => <ContractCard key={c.id} contract={c} currentTurn={currentTurn} />)}
        </div>
      )}

      {offerCount === 0 && activeCount === 0 && (
        <div className="bdp-empty">
          <Briefcase size={40} className="bdp-empty-icon" />
          <div className="bdp-empty-title">No active deals</div>
          <div className="bdp-empty-sub">Build clout and brand trust to attract offer cycles every few turns.</div>
        </div>
      )}

      <div style={{ height: 36 }} />
    </div>
  );
}

// ── Offers Tab ────────────────────────────────────────────────────────────────

function OffersTab({ offers, onSelect }) {
  const ambassadors = offers.filter(o => o.deal_type === "ambassador");
  const challenges  = offers.filter(o => isChallenge(o) && o.deal_type !== "ambassador");
  const regular     = offers.filter(o => !isChallenge(o) && o.deal_type !== "ambassador");

  return (
    <div className="bdp-section" style={{ paddingTop: 20 }}>
      {ambassadors.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Star size={12} style={{ color: "#fbbf24" }} />
            <div className="bdp-eyebrow" style={{ marginBottom: 0, color: "#fbbf24" }}>Ambassador Offers</div>
          </div>
          {ambassadors.map(o => <DealCard key={o.id} deal={o} onClick={() => onSelect(o)} />)}
        </div>
      )}
      {challenges.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="bdp-eyebrow">Sponsored Challenges</div>
          {challenges.map(o => <DealCard key={o.id} deal={o} onClick={() => onSelect(o)} />)}
        </div>
      )}
      {regular.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="bdp-eyebrow">Brand Deals</div>
          {regular.map(o => <DealCard key={o.id} deal={o} onClick={() => onSelect(o)} />)}
        </div>
      )}
      {offers.length === 0 && (
        <div className="bdp-empty">
          <DollarSign size={40} className="bdp-empty-icon" />
          <div className="bdp-empty-title">No offers this cycle</div>
          <div className="bdp-empty-sub">New deals appear every few turns based on your career stage and clout.</div>
        </div>
      )}
      <div style={{ height: 36 }} />
    </div>
  );
}

// ── Active Tab ────────────────────────────────────────────────────────────────

function ActiveTab({ contracts, currentTurn }) {
  return (
    <div className="bdp-section" style={{ paddingTop: 20 }}>
      {contracts.length === 0 ? (
        <div className="bdp-empty">
          <CheckCircle size={40} className="bdp-empty-icon" />
          <div className="bdp-empty-title">No active contracts</div>
          <div className="bdp-empty-sub">Accept an offer to start earning passive deal income each turn.</div>
        </div>
      ) : (
        contracts.map(c => <ContractCard key={c.id} contract={c} currentTurn={currentTurn} />)
      )}
      <div style={{ height: 36 }} />
    </div>
  );
}

// ── Relationships Tab ─────────────────────────────────────────────────────────

function getLoyaltyTier(score) {
  const s = Number(score) || 0;
  if (s <= -4) return { label: "Cold",     color: "#60a5fa", bg: "rgba(96,165,250,.12)" };
  if (s <= 2)  return { label: "Neutral",  color: "#9ca3af", bg: "rgba(156,163,175,.10)" };
  if (s <= 5)  return { label: "Warm",     color: "#fbbf24", bg: "rgba(251,191,36,.12)" };
  if (s <= 8)  return { label: "Favored",  color: "#f97316", bg: "rgba(249,115,22,.12)" };
  return              { label: "Elite",    color: "#a78bfa", bg: "rgba(167,139,250,.15)" };
}

function RelationshipsTab({ brandAffinities, contracts, history: historyContracts = [], brandStats: _brandStats }) {
  if (brandAffinities.length === 0) {
    return (
      <div className="bdp-section" style={{ paddingTop: 20 }}>
        <div className="bdp-empty">
          <Briefcase size={40} className="bdp-empty-icon" />
          <div className="bdp-empty-title">No brand relationships yet</div>
          <div className="bdp-empty-sub">Complete deals to build loyalty with brands.</div>
        </div>
      </div>
    );
  }

  // Merge active contract info with affinity data
  const activeByBrand = {};
  for (const c of contracts) {
    const key = (c.brand_name || "").trim().toLowerCase();
    if (key) activeByBrand[key] = c;
  }

  // Build per-brand history (most recent completed/breached/cancelled)
  const historyByBrand = {};
  for (const c of historyContracts) {
    const key = (c.brand_name || "").trim().toLowerCase();
    if (!key) continue;
    if (!historyByBrand[key]) historyByBrand[key] = [];
    historyByBrand[key].push(c);
  }

  // Summary stats
  const totalCompleted = brandAffinities.reduce((s, a) => s + (Number(a.completed_count) || 0), 0);
  const totalBreached  = brandAffinities.reduce((s, a) => s + (Number(a.breached_count) || 0), 0);
  const positiveCount  = brandAffinities.filter(a => (Number(a.affinity_score) || 0) > 0).length;
  const negativeCount  = brandAffinities.filter(a => (Number(a.affinity_score) || 0) < 0).length;
  const avgAffinity    = brandAffinities.length > 0
    ? (brandAffinities.reduce((s, a) => s + (Number(a.affinity_score) || 0), 0) / brandAffinities.length)
    : 0;
  const avgTier = getLoyaltyTier(avgAffinity);

  return (
    <div className="bdp-section" style={{ paddingTop: 20 }}>

      {/* ── Summary Hero — matches Overview "Brand Health" card ── */}
      <div className="bdp-health-card" style={{ marginBottom: 20 }}>
        <div className="bdp-eyebrow" style={{ marginBottom: 12 }}>Brand Network</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {[
            { label: "Brands",    val: brandAffinities.length, color: "#a78bfa" },
            { label: "Completed", val: totalCompleted,          color: "#34d399" },
            { label: "Avg Score", val: avgAffinity.toFixed(1),  color: avgTier.color },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 900, color }}>{val}</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,.25)", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Mini sentiment breakdown */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", gap: 16, fontSize: 10 }}>
          {positiveCount > 0 && <span style={{ color: "rgba(52,211,153,.7)", fontWeight: 600 }}>{positiveCount} positive</span>}
          {negativeCount > 0 && <span style={{ color: "rgba(248,113,113,.7)", fontWeight: 600 }}>{negativeCount} negative</span>}
          {totalBreached > 0 && <span style={{ color: "rgba(251,191,36,.7)", fontWeight: 600 }}>{totalBreached} breached</span>}
          <span style={{ marginLeft: "auto", color: "rgba(255,255,255,.2)", fontWeight: 600 }}>
            Overall: <span style={{ color: avgTier.color, fontWeight: 700 }}>{avgTier.label}</span>
          </span>
        </div>
      </div>

      {/* ── Brand Cards — matches Overview grid style ── */}
      <div className="bdp-eyebrow" style={{ marginBottom: 10 }}>Your Brands</div>
      {brandAffinities.map((aff, idx) => {
        const key = (aff.brand_key || "").trim().toLowerCase();
        const displayName = (aff.brand_key || "Unknown").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const score = Number(aff.affinity_score) || 0;
        const tier = getLoyaltyTier(score);
        const completed = Number(aff.completed_count) || 0;
        const breached = Number(aff.breached_count) || 0;
        const cancelled = Number(aff.cancelled_count) || 0;
        const totalDeals = completed + breached + cancelled;
        const activeContract = activeByBrand[key];

        // Bar: score range is -10 to 10, map to 0-100%
        const barPct = Math.max(0, Math.min(100, ((score + 10) / 20) * 100));

        return (
          <div key={idx} style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 10,
            border: "1px solid rgba(255,255,255,.07)",
          }}>
            {/* Row 1: Name + tier badge + score badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-.2px", color: "#fff" }}>{displayName}</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 700,
                  letterSpacing: ".4px", background: tier.bg, color: tier.color,
                  border: `1px solid ${tier.color}33`,
                }}>{tier.label}</span>
                {activeContract && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 6px", borderRadius: 99, fontSize: 8, fontWeight: 700,
                    letterSpacing: ".3px", background: "rgba(52,211,153,.12)", color: "#34d399",
                    border: "1px solid rgba(52,211,153,.25)",
                  }}>ACTIVE</span>
                )}
                {activeContract?.deal_type === "ambassador" && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 6px", borderRadius: 99, fontSize: 8, fontWeight: 700,
                    letterSpacing: ".3px", background: "rgba(251,191,36,.12)", color: "#fbbf24",
                    border: "1px solid rgba(251,191,36,.25)",
                  }}><Star size={7} /> AMB</span>
                )}
              </div>
              {/* Score badge — mirrors alignment badge from DealCard */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                background: tier.bg, border: `1px solid ${tier.color}33`,
                borderRadius: 10, padding: "5px 8px", flexShrink: 0,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: tier.color, lineHeight: 1 }}>{score > 0 ? "+" : ""}{score.toFixed(0)}</span>
                <span style={{ fontSize: 7, fontWeight: 800, color: tier.color, letterSpacing: "1px", marginTop: 1, opacity: .7 }}>SCORE</span>
              </div>
            </div>

            {/* Affinity bar — uses bdp-bar-track style */}
            <div className="bdp-bar-track" style={{ margin: "0 0 8px" }}>
              <div className="bdp-bar-fill" style={{ width: `${barPct}%`, background: tier.color, opacity: .85 }} />
            </div>

            {/* Stats grid — matches overview stat cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Deals", val: totalDeals, color: "#fff" },
                { label: "Completed", val: completed, color: "#34d399" },
                { label: breached > 0 ? "Breached" : "Cancelled", val: breached > 0 ? breached : cancelled, color: breached > 0 ? "#f87171" : "#fbbf24" },
              ].filter(s => s.val > 0 || s.label === "Deals").map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color }}>{val}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "rgba(255,255,255,.2)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Ambassador contract details */}
            {activeContract?.deal_type === "ambassador" && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "linear-gradient(135deg, rgba(251,191,36,.06), rgba(167,139,250,.06))", border: "1px solid rgba(251,191,36,.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>Ambassador Deal</span>
                  <span style={{ color: "rgba(255,255,255,.3)", fontWeight: 600 }}>{fmtMoney(Number(activeContract.metadata?.total_contract_value || 0))} total</span>
                </div>
                {Number(activeContract.metadata?.royalty_pct) > 0 && (
                  <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 600, marginTop: 3 }}>
                    {Number(activeContract.metadata.royalty_pct)}% royalty on streaming + merch
                  </div>
                )}
              </div>
            )}

            {/* Last deal summary from history */}
            {!activeContract && (historyByBrand[key] || []).length > 0 && (() => {
              const last = historyByBrand[key][0];
              const statusColor = last.status === "completed" ? "#34d399" : last.status === "breached" ? "#f87171" : "#fbbf24";
              return (
                <div style={{ marginTop: 8, fontSize: 9, color: "rgba(255,255,255,.3)", display: "flex", gap: 8 }}>
                  <span>Last: <span style={{ color: statusColor, fontWeight: 600 }}>{last.status}</span></span>
                  {last.tier && <span>{last.tier}</span>}
                  {last.per_turn_fee > 0 && <span>{fmtMoney(last.per_turn_fee)}/t</span>}
                </div>
              );
            })()}
          </div>
        );
      })}
      <div style={{ height: 36 }} />
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

const HISTORY_RETENTION = 20;

function HistoryTab({ history, currentTurn }) {
  const visible = history.slice(0, HISTORY_RETENTION);
  const hiddenCount = Math.max(0, history.length - HISTORY_RETENTION);

  // Summary stats across ALL history (not just visible)
  const completedCount = history.filter(c => c.status === "completed").length;
  const breachedCount  = history.filter(c => c.status === "breached").length;
  const cancelledCount = history.filter(c => c.status === "cancelled").length;
  const total = history.length;

  const pctCompleted = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const pctBreached  = total > 0 ? Math.round((breachedCount / total) * 100) : 0;
  const pctCancelled = total > 0 ? Math.round((cancelledCount / total) * 100) : 0;

  // Reliability grade based on completion ratio
  const reliabilityGrade = pctCompleted >= 90 ? { label: "Excellent", color: "#34d399" }
    : pctCompleted >= 70 ? { label: "Good", color: "#86efac" }
    : pctCompleted >= 50 ? { label: "Fair", color: "#fbbf24" }
    : pctCompleted >= 30 ? { label: "Poor", color: "#f97316" }
    : { label: "At Risk", color: "#f87171" };

  return (
    <div className="bdp-section" style={{ paddingTop: 20 }}>
      {history.length === 0 ? (
        <div className="bdp-empty">
          <Star size={40} className="bdp-empty-icon" />
          <div className="bdp-empty-title">No history yet</div>
          <div className="bdp-empty-sub">Completed and past deals will appear here.</div>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, border: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="bdp-eyebrow" style={{ margin: 0 }}>Deal Track Record</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: reliabilityGrade.color, letterSpacing: ".3px" }}>
                {reliabilityGrade.label}
              </span>
            </div>

            {/* Stacked bar */}
            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,.06)", marginBottom: 10 }}>
              {pctCompleted > 0 && <div style={{ width: `${pctCompleted}%`, background: "#34d399" }} />}
              {pctBreached > 0 && <div style={{ width: `${pctBreached}%`, background: "#f87171" }} />}
              {pctCancelled > 0 && <div style={{ width: `${pctCancelled}%`, background: "#fbbf24" }} />}
            </div>

            <div style={{ display: "flex", gap: 16, fontSize: 10 }}>
              <span style={{ color: "rgba(52,211,153,.8)", fontWeight: 600 }}>{pctCompleted}% completed ({completedCount})</span>
              {breachedCount > 0 && <span style={{ color: "rgba(248,113,113,.8)", fontWeight: 600 }}>{pctBreached}% breached ({breachedCount})</span>}
              {cancelledCount > 0 && <span style={{ color: "rgba(251,191,36,.8)", fontWeight: 600 }}>{pctCancelled}% cancelled ({cancelledCount})</span>}
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,.3)", fontWeight: 600 }}>{total} total</span>
            </div>
          </div>

          {/* Recent deals (retention-limited) */}
          <div className="bdp-eyebrow" style={{ marginBottom: 8 }}>Recent Deals</div>
          {visible.map(c => <ContractCard key={c.id} contract={c} currentTurn={currentTurn} />)}

          {hiddenCount > 0 && (
            <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,.25)", padding: "10px 0" }}>
              +{hiddenCount} older deal{hiddenCount !== 1 ? "s" : ""} not shown
            </div>
          )}
        </>
      )}
      <div style={{ height: 36 }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",      label: "Overview"      },
  { key: "relationships", label: "Relationships" },
  { key: "offers",        label: "Offers"        },
  { key: "active",        label: "Active"        },
  { key: "history",       label: "History"       },
];

export default function BrandPortfolioApp({ onNavigate }) {
  const navigate = useNavigate();
  const [profile,    setProfile]    = useState(null);
  const [offers,     setOffers]     = useState([]);
  const [contracts,  setContracts]  = useState([]);
  const [history,    setHistory]    = useState([]);
  const [brandStats, setBrandStats] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("overview");
  const [modal,      setModal]      = useState(null); // selected offer
  const [accepting,  setAccepting]  = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(null);
  // Brand Identity data (migrated from Social page)
  const [fanProfile,    setFanProfile]    = useState(null);
  const [currentEra,    setCurrentEra]    = useState(null);
  const [algorithmMood, setAlgorithmMood] = useState(null);
  const [identityOpen,  setIdentityOpen]  = useState(false);
  const [brandAffinities, setBrandAffinities] = useState([]);
  const [careerSnapshot, setCareerSnapshot] = useState(null);

  const goBack = () => {
    if (onNavigate) onNavigate("/Career");
    else navigate("/Career");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const uid = localStorage.getItem("user_account_id");
      if (!uid) { setLoading(false); return; }
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: uid });
      const p = profiles?.[0];
      if (!p) { setLoading(false); return; }
      setProfile(p);

      let turn = 0;
      try {
        const { data: ts } = await supabaseClient
          .from("turn_state").select("global_turn_id").eq("id", 1).maybeSingle();
        turn = ts?.global_turn_id || 0;
        setCurrentTurn(turn);
      } catch { /* non-fatal */ }

      const [offR, actR, hisR, statR, fpR, eraR, moodR, affR, snapR] = await Promise.all([
        supabaseClient.from("brand_deals")
          .select("*").eq("artist_id", p.id).eq("status", "offered")
          .order("per_turn_fee", { ascending: false }).limit(20),
        supabaseClient.from("brand_deal_contracts")
          .select("*").eq("player_id", p.id).eq("status", "active")
          .order("start_turn_id", { ascending: false }),
        supabaseClient.from("brand_deal_contracts")
          .select("*").eq("player_id", p.id)
          .in("status", ["completed", "breached", "cancelled"])
          .order("updated_at", { ascending: false }).limit(25),
        supabaseClient.from("player_brand_stats")
          .select("*").eq("artist_id", p.id).eq("platform", "all").maybeSingle(),
        supabaseClient.from("fan_profiles")
          .select("career_trends, career_trend_modifiers, monthly_listeners, retention_rate, listener_growth_trend, overall_sentiment, region_share")
          .eq("artist_id", p.id).maybeSingle(),
        supabaseClient.from("eras")
          .select("*").eq("artist_id", p.id).eq("is_active", true).maybeSingle(),
        supabaseClient.from("algorithm_mood_state")
          .select("current_mood").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseClient.from("player_brand_affinity")
          .select("brand_key, affinity_score, completed_count, breached_count, cancelled_count, last_contract_turn_id")
          .eq("player_id", p.id)
          .order("affinity_score", { ascending: false }),
        supabaseClient.from("v_career_progression_snapshot")
          .select("dominant_lane, secondary_lane, current_archetype, current_weather_fit")
          .eq("artist_id", p.id).maybeSingle(),
      ]);

      setOffers((offR.data || []).filter(o => !o.expires_turn || o.expires_turn > turn));
      setContracts(actR.data || []);
      setHistory(hisR.data || []);
      setBrandStats(statR.data || null);
      setFanProfile(fpR.data || null);
      setCurrentEra(eraR.data || null);
      setAlgorithmMood(moodR.data?.current_mood || null);
      setBrandAffinities((affR.data || []).filter(a => Math.abs(Number(a.affinity_score || 0)) > 0 || (Number(a.completed_count || 0) + Number(a.breached_count || 0) + Number(a.cancelled_count || 0)) > 0));
      setCareerSnapshot(snapR.data || null);
    } catch (err) {
      console.error("[BrandPortfolioApp] load error:", err);
      setError("Failed to load brand data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async () => {
    if (!modal || !profile) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("socialMedia", {
        action:     "acceptBrandDeal",
        artistId:   profile.id,
        offerId:    modal.id,
        currentTurn,
      });
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(`Signed with ${modal.brand_name}!`);
        setModal(null);
        setTimeout(() => { setSuccess(null); load(); }, 1800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept deal.");
    } finally {
      setAccepting(false);
    }
  };

  const offerCount  = offers.length;
  const activeCount = contracts.length;

  const tabLabels = {
    overview:      "Overview",
    relationships: brandAffinities.length > 0 ? `Brands (${brandAffinities.length})` : "Brands",
    offers:        offerCount  > 0 ? `Offers (${offerCount})`  : "Offers",
    active:        activeCount > 0 ? `Active (${activeCount})` : "Active",
    history:       "History",
  };

  return (
    <div className="bdp-root">
      <GlobalStyles />

      {/* Top bar */}
      <div className="bdp-topbar">
        <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,.5)", display: "flex", alignItems: "center" }}>
          <ArrowLeft size={20} />
        </button>
        <span className="bdp-brand-title">Brand Portfolio</span>
        {loading ? (
          <Loader2 size={15} style={{ marginLeft: "auto", opacity: .35 }} className="bdp-spin" />
        ) : (
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.25)", padding: 4 }}>
            Refresh
          </button>
        )}
      </div>

      {/* Toast notifications */}
      {success && (
        <div className="bdp-toast bdp-toast-success">
          <CheckCircle size={14} /> {success}
        </div>
      )}
      {error && !modal && (
        <div className="bdp-toast bdp-toast-error">
          <XCircle size={14} /> {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="bdp-tabs">
        {TABS.map(({ key }) => (
          <div
            key={key}
            className={`bdp-tab${tab === key ? " on" : ""}`}
            onClick={() => setTab(key)}
          >
            {tabLabels[key]}
          </div>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
          <Loader2 size={26} style={{ opacity: .3 }} className="bdp-spin" />
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <OverviewTab
              offers={offers}
              contracts={contracts}
              brandStats={brandStats}
              profile={profile}
              fanProfile={fanProfile}
              currentEra={currentEra}
              algorithmMood={algorithmMood}
              onOpenIdentity={() => setIdentityOpen(true)}
              onSeeOffers={() => setTab("offers")}
              onSeeActive={() => setTab("active")}
              onSelect={o => { setModal(o); setTab("offers"); }}
              currentTurn={currentTurn}
              careerSnapshot={careerSnapshot}
            />
          )}
          {tab === "relationships" && <RelationshipsTab brandAffinities={brandAffinities} contracts={contracts} history={history} brandStats={brandStats} />}
          {tab === "offers"   && <OffersTab   offers={offers}        onSelect={o => setModal(o)} />}
          {tab === "active"   && <ActiveTab   contracts={contracts} currentTurn={currentTurn} />}
          {tab === "history"  && <HistoryTab  history={history} currentTurn={currentTurn} />}
        </>
      )}

      {/* Alignment + sign modal */}
      {modal && (
        <AlignmentModal
          deal={modal}
          profile={profile}
          fanProfile={fanProfile}
          onAccept={handleAccept}
          onClose={() => { setModal(null); setError(null); }}
          accepting={accepting}
          error={error}
          algorithmMood={algorithmMood}
        />
      )}

      {/* Brand Identity detail modal */}
      {identityOpen && (
        <BrandIdentityModal
          profile={profile}
          brandStats={brandStats}
          fanProfile={fanProfile}
          currentEra={currentEra}
          careerSnapshot={careerSnapshot}
          onClose={() => setIdentityOpen(false)}
          onSaveTagline={async (newTagline) => {
            if (!profile?.id) return;
            await base44.entities.ArtistProfile.update(profile.id, { brand_tagline: newTagline });
            setProfile(prev => ({ ...prev, brand_tagline: newTagline }));
          }}
        />
      )}
    </div>
  );
}
