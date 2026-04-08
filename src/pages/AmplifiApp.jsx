// src/pages/AmplifiApp.jsx
// Amplifi — Festival hub for X-Factor
// Nested under Career page. Opened from the Career apps grid.
// NEW DESIGN: Festival discovery with horizontal carousels, mini cards, and modals

import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Calendar, ChevronRight, Music, Clock, CheckCircle, Loader2, X, Lock, Radio, ChevronLeft, Trophy, Star, Handshake } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { invokeFestivalAction } from "@/lib/invokeFestivalAction";
import { useNavigate } from "react-router-dom";
import { fmt } from "@/utils/numberFormat";
import { RivalryTab, BackstageTab } from "@/components/amplifi/FestivalPhase2Tabs";
import {
  buildFestivalPreviewInstance,
  formatFestivalTurnDate,
  getEffectiveFestivalStatus,
  getFestivalEndTurn,
  getFestivalStartTurnFromInstance,
} from "@/components/amplifi/festivalCalendar";
import FestivalSetlistEditor from "@/components/amplifi/FestivalSetlistEditor";
import FestivalGreenRoom from "@/components/amplifi/FestivalGreenRoom";
import { selectCurrentGreenRoomInstance } from "@/components/amplifi/greenRoomPresentation";
import { formatFestivalHistoryTiming, sortFestivalHistoryRecords } from "@/components/amplifi/festivalHistoryPresentation";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  SCHEDULED: 'Coming Soon',
  OPEN: 'Accepting Apps',
  CLOSED: 'Apps Closed',
  LOCKED: 'Lineup Set',
  LIVE: 'Live Now',
  COMPLETE: 'Ended',
};

const STATUS_COLOR = {
  SCHEDULED: '#6b7280',
  OPEN: '#10b981',
  CLOSED: '#f59e0b',
  LOCKED: '#6366f1',
  LIVE: '#ef4444',
  COMPLETE: '#4b5563',
};

const SUBMISSION_STATUS_LABEL = {
  SUBMITTED: 'Applied',
  ELIGIBLE: 'In Review',
  INELIGIBLE: 'Ineligible',
  SELECTED: 'Selected!',
  REJECTED: 'Not Selected',
  WITHDRAWN: 'Withdrawn',
};

const REGION_FLAG = {
  US: '🇺🇸', Canada: '🇨🇦', UK: '🇬🇧', Europe: '🇪🇺',
  Africa: '🌍', Oceania: '🌏',
};

const LANE_ORDER = ['HEADLINER', 'MAIN_PRIME', 'MAIN_EARLY', 'SECOND_PRIME', 'DISCOVERY', 'SPOTLIGHT'];
const LANE_LABEL = {
  HEADLINER: 'Headliner', MAIN_PRIME: 'Main Stage', MAIN_EARLY: 'Main Early',
  SECOND_PRIME: 'Second Stage', DISCOVERY: 'Discovery', SPOTLIGHT: 'Spotlight',
};
const LANE_SET_MIN = { HEADLINER: 90, MAIN_PRIME: 60, MAIN_EARLY: 45, SECOND_PRIME: 45, DISCOVERY: 30, SPOTLIGHT: 30 };

// Career stage map (mirrors careerStages.ts)
const STAGE_ORDER = [
  'Unknown', 'Local Artist', 'Local Buzz', 'Underground Artist',
  'Cult Favorite', 'Breakout Artist', 'Mainstream Artist',
  'A-List Star', 'Global Superstar', 'Legacy Icon',
];

function stageIdx(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 ? i : 0;
}

function oddsLabel(profile, laneKey, festivalLanes, festivalGenreWeights) {
  if (!laneKey || !festivalLanes) return { label: 'SELECT LANE', color: '#6b7280' };
  const cfg = festivalLanes[laneKey];
  if (!cfg) return { label: 'N/A', color: '#6b7280' };

  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
  const clout = Number(profile?.clout ?? 0);
  const stage = profile?.career_stage || 'Unknown';
  const genre = profile?.genre || '';

  const idx = stageIdx(stage);
  if (idx < (cfg.min_stage_idx || 0)) return { label: 'INELIGIBLE', color: '#ef4444' };
  if (fans < (cfg.min_fans || 0))     return { label: 'INELIGIBLE', color: '#ef4444' };
  if (clout < (cfg.min_clout || 0))   return { label: 'INELIGIBLE', color: '#ef4444' };
  if (cfg.genre_tags?.length && !cfg.genre_tags.includes(genre)) {
    return { label: 'INELIGIBLE', color: '#ef4444' };
  }

  const genreWRaw = (festivalGenreWeights?.[genre] ?? 0);
  // Normalise: backend stores genre_weights as 0–100 integers, the weight
  // formula needs 0–1.  normalizeGenreWeight handles both formats.
  const genreW = normalizeGenreWeight(genreWRaw);
  const stageExtra = idx - (cfg.min_stage_idx || 0);
  const cloutScore = Math.log10(Math.max(1, clout)) / 5; // 0–2.4, mirrors backend

  // Approximate backend weight bands: careerStageW * cloutW * genreW * prepW
  const approxWeight = (1 + stageExtra * 0.3) * cloutScore * genreW * 0.75;

  if (approxWeight >= 1.2)  return { label: 'HIGH', color: '#10b981' };
  if (approxWeight >= 0.4)  return { label: 'MEDIUM', color: '#6366f1' };
  if (approxWeight >= 0.08) return { label: 'LOW', color: '#f59e0b' };
  return { label: 'VERY LOW', color: '#ef4444' };
}

// ── Region gradient palette ───────────────────────────────────────────────────

const REGION_GRADIENT = {
  US:      'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)',
  Canada:  'linear-gradient(135deg, #450a0a 0%, #991b1b 45%, #b91c1c 100%)',
  UK:      'linear-gradient(135deg, #0c1a2e 0%, #1e3a5f 45%, #1d4ed8 100%)',
  Europe:  'linear-gradient(135deg, #1a0933 0%, #2d1b69 45%, #4c1d95 100%)',
  Africa:  'linear-gradient(135deg, #451a03 0%, #92400e 45%, #b45309 100%)',
  Oceania: 'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #047857 100%)',
};

// ── CSS injected inline (dark, luxury, festival energy) ──────────────────────

const G = () => (
  <style>{`
    .amp-app{background:#08080B;min-height:100vh;max-width:430px;margin:0 auto;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    .amp-topbar{display:flex;align-items:center;gap:12px;padding:16px 18px 12px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;z-index:10;background:#08080B;}
    .amp-title{font-size:20px;font-weight:800;letter-spacing:-.3px;background:linear-gradient(90deg,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .amp-section{padding:16px 18px 0;}
    .amp-section-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:10px;}
    .amp-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;margin-bottom:10px;overflow:hidden;cursor:pointer;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, opacity .18s ease;box-shadow:0 18px 34px rgba(0,0,0,.24);}
    .amp-card:hover{transform:translateY(-2px);border-color:rgba(236,72,153,.22);box-shadow:0 24px 48px rgba(0,0,0,.34),0 0 0 1px rgba(168,85,247,.08) inset;}
    .amp-card:active{transform:scale(0.98);opacity:.94;}
    .amp-card-inner{padding:14px 16px;}
    .amp-status-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;}
    .amp-tab-bar{display:flex;border-bottom:1px solid rgba(255,255,255,.07);padding:0 18px;}
    .amp-tab{padding:12px 16px;font-size:13px;font-weight:600;color:rgba(255,255,255,.35);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;}
    .amp-tab.active{color:#a855f7;border-bottom-color:#a855f7;}
    .amp-modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.75);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;}
    .amp-modal-sheet{width:100%;max-width:420px;background:#13121a;border:1px solid rgba(255,255,255,.09);border-bottom:none;border-radius:24px 24px 0 0;max-height:85vh;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;}
    .amp-modal-sheet::-webkit-scrollbar{display:none;}
    .amp-genre-scroll{display:flex;gap:10px;overflow-x:auto;padding:10px 0;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth;}
    .amp-genre-scroll::-webkit-scrollbar{display:none;}
    .amp-genre-card{flex-shrink:0;min-width:110px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center;}
    .amp-genres-container{padding:0 14px;max-height:140px;overflow:hidden;}
    .amp-lanes-scroll{display:flex;gap:10px;overflow-x:auto;padding:10px 0;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth;}
    .amp-lanes-scroll::-webkit-scrollbar{display:none;}
    .amp-lane-card{flex-shrink:0;min-width:120px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center;}
    .amp-lanes-container{padding:0 14px;max-height:160px;overflow:hidden;}
    .amp-modal-header{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 12px;border-bottom:1px solid rgba(255,255,255,.06);}
    .amp-modal-title{font-size:18px;font-weight:800;}
    .amp-input-group{margin-bottom:16px;}
    .amp-input-label{font-size:11px;font-weight:600;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;}
    .amp-lane-btn{padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.7);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;margin:0 4px 6px 0;display:inline-block;}
    .amp-lane-btn.selected{background:rgba(168,85,247,.2);border-color:#a855f7;color:#d8b4fe;}
    .amp-lane-btn.ineligible{opacity:.4;cursor:not-allowed;}
    .amp-posture-btn{padding:8px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.6);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;margin-right:6px;}
    .amp-posture-btn.selected{background:rgba(168,85,247,.2);border-color:#a855f7;color:#d8b4fe;}
    .amp-slider{width:100%;accent-color:#a855f7;}
    .amp-primary-btn{width:100%;padding:14px;border-radius:14px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;font-size:15px;font-weight:800;border:none;cursor:pointer;transition:opacity .15s;}
    .amp-primary-btn:disabled{opacity:.4;cursor:not-allowed;}
    .amp-song-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;}
    .amp-song-row:last-child{border-bottom:none;}
    .amp-song-check{width:22px;height:22px;border-radius:6px;border:1.5px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
    .amp-song-check.on{background:#a855f7;border-color:#a855f7;}
    .amp-axis-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:4px;}
    .amp-axis-fill{height:100%;border-radius:3px;transition:width .4s;}
    .amp-genre-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden;flex:1;}
    .amp-genre-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#a855f7,#ec4899);}
    /* GLASSMORPHISM CARDS */
    .amp-glass-card{background:rgba(255,255,255,.05);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);border-radius:16px;}
    /* AESTHETIC TAGS */
    .amp-tag{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);letter-spacing:.4px;margin:2px;}
    /* WEATHER BADGE */
    .amp-weather{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);}
    /* CROWD METER ANIMATION */
    @keyframes pulse-bar{0%,100%{opacity:1}50%{opacity:.6}}
    .amp-live-bar{animation:pulse-bar 1.5s ease-in-out infinite;}
    /* CAROUSEL STYLES */
    .amp-carousel-container{position:relative;margin-bottom:24px;}
    .amp-carousel-scroll{overflow-x:auto;display:flex;gap:12px;padding:0 18px 8px;scrollbar-width:none;scroll-behavior:smooth;}
    .amp-carousel-scroll::-webkit-scrollbar{display:none;}
    .amp-mini-card{flex-shrink:0;width:140px;border-radius:12px;overflow:hidden;cursor:pointer;transition:all .2s;border:1px solid rgba(255,255,255,.08);position:relative;}
    .amp-mini-card:hover{transform:translateY(-4px) scale(1.01);border-color:rgba(236,72,153,.24);box-shadow:0 20px 40px rgba(0,0,0,.30),0 0 0 1px rgba(168,85,247,.08) inset;}
    .amp-mini-card:active{transform:scale(0.95);}
    .amp-mini-card-image{width:100%;height:140px;object-fit:cover;background:linear-gradient(135deg,#a855f7,#ec4899);}
    .amp-mini-card-content{padding:10px;background:linear-gradient(180deg, rgba(18,18,26,.72), rgba(10,10,14,.92));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
    .amp-mini-card-name{font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .amp-mini-card-region{font-size:9px;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .amp-carousel-nav{position:absolute;top:60px;right:18px;display:flex;gap:6px;z-index:5;}
    .amp-carousel-btn{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;}
    .amp-carousel-btn:hover{background:rgba(168,85,247,.15);border-color:#a855f7;color:#d8b4fe;}
    .amp-carousel-btn:disabled{opacity:.3;cursor:not-allowed;}
    /* YEAR STRIP */
    .amp-year-strip{display:flex;align-items:center;gap:6px;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.04);}
    /* FEATURED CARD (Live Now horizontal scroll) */
    .amp-feat-scroll{overflow-x:auto;display:flex;gap:14px;padding:0 18px 8px;scrollbar-width:none;scroll-behavior:smooth;}
    .amp-feat-scroll::-webkit-scrollbar{display:none;}
    .amp-feat-card{flex-shrink:0;width:240px;border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease; border:1px solid rgba(255,255,255,.08);box-shadow:0 18px 34px rgba(0,0,0,.22);}
    .amp-feat-card:hover{transform:translateY(-3px);border-color:rgba(236,72,153,.22);box-shadow:0 28px 54px rgba(0,0,0,.34),0 0 0 1px rgba(236,72,153,.08) inset;}
    .amp-feat-card:active{transform:scale(0.97);}
    .amp-feat-bg{position:relative;height:180px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;}
    .amp-feat-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 60%);}
    .amp-feat-status{position:absolute;top:10px;left:10px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:6px;display:flex;align-items:center;gap:4px;z-index:1;}
    .amp-feat-footer{padding:10px 12px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:space-between;}
    .amp-vignette{position:absolute;inset:0;background:radial-gradient(circle at top right, rgba(236,72,153,.24), transparent 34%),radial-gradient(circle at 12% 18%, rgba(168,85,247,.18), transparent 28%),linear-gradient(180deg, rgba(10,10,14,.05) 0%, rgba(10,10,14,.22) 42%, rgba(10,10,14,.94) 100%);pointer-events:none;}
    .amp-glow-orb{position:absolute;border-radius:999px;filter:blur(28px);opacity:.55;pointer-events:none;mix-blend-mode:screen;animation:ampFloat 7s ease-in-out infinite;}
    .amp-lux-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:linear-gradient(180deg, rgba(18,18,28,.72), rgba(12,12,18,.52));border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-size:10px;font-weight:700;color:rgba(255,255,255,.84);box-shadow:0 10px 24px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06);}
    .amp-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
    .amp-stat-pill{position:relative;padding:10px 12px;border-radius:12px;background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 12px 24px rgba(0,0,0,.16);overflow:hidden;}
    .amp-stat-pill::after{content:'';position:absolute;inset:0;background:linear-gradient(120deg, transparent 0%, rgba(255,255,255,.08) 18%, transparent 36%);transform:translateX(-120%);animation:ampShimmer 8s ease-in-out infinite;pointer-events:none;}
    .amp-stat-label{font-size:9px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:rgba(255,255,255,.38);margin-bottom:5px;}
    .amp-stat-value{font-size:13px;font-weight:800;color:#fff;line-height:1.2;}
    .amp-stat-subtle{font-size:10px;color:rgba(255,255,255,.48);margin-top:3px;}
    .amp-detail-card{position:relative;background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.05);}
    .amp-section-card{position:relative;background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 14px 28px rgba(0,0,0,.14);overflow:hidden;}
    .amp-section-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.2) 20%, rgba(236,72,153,.24) 50%, rgba(255,255,255,.2) 80%, transparent 100%);pointer-events:none;}
    .amp-info-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);}
    .amp-info-row:last-child{border-bottom:none;padding-bottom:0;}
    .amp-info-key{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,.38);}
    .amp-info-value{font-size:12px;font-weight:700;color:rgba(255,255,255,.86);text-align:right;}
    .amp-fit-meter{height:8px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.35);}
    .amp-fit-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#a855f7 0%,#ec4899 55%,#f59e0b 100%);box-shadow:0 0 16px rgba(236,72,153,.32);}
    .amp-fit-fill.hot{animation:ampFitPulse 2.2s ease-in-out infinite;}
    .amp-outline-button{width:100%;padding:12px;border-radius:14px;background:rgba(255,255,255,.04);color:#fff;font-size:13px;font-weight:800;border:1px solid rgba(255,255,255,.12);cursor:pointer;transition:all .15s;}
    .amp-outline-button:disabled{opacity:.45;cursor:not-allowed;}
    .amp-poster-frame{position:relative;overflow:hidden;}
    .amp-poster-frame::after{content:'';position:absolute;inset:0;background:linear-gradient(112deg, transparent 0%, rgba(255,255,255,.12) 24%, transparent 42%);transform:translateX(-135%);animation:ampSweep 9s ease-in-out infinite;pointer-events:none;mix-blend-mode:screen;}
    .amp-spotlight{position:absolute;inset:-20% auto auto -10%;width:70%;height:110%;background:radial-gradient(circle, rgba(255,255,255,.18) 0%, rgba(255,255,255,.05) 20%, transparent 58%);transform:rotate(-18deg);pointer-events:none;opacity:.42;}
    .amp-title-glow{text-shadow:0 3px 18px rgba(236,72,153,.22), 0 0 32px rgba(168,85,247,.16);}
    .amp-kicker{font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.55);}
    .amp-live-chip{animation:ampLivePulse 1.6s ease-in-out infinite;box-shadow:0 0 0 0 rgba(239,68,68,.45), 0 10px 24px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06);}
    .amp-live-dot{animation:ampDotPulse 1.2s ease-in-out infinite;}
    @keyframes ampFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-8px,0) scale(1.05)}}
    @keyframes ampShimmer{0%,100%{transform:translateX(-120%)}55%{transform:translateX(120%)}}
    @keyframes ampSweep{0%,100%{transform:translateX(-135%)}55%{transform:translateX(135%)}}
    @keyframes ampLivePulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.0), 0 10px 24px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06)}50%{box-shadow:0 0 0 8px rgba(239,68,68,.0), 0 14px 30px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.06), 0 0 18px rgba(239,68,68,.28)}}
    @keyframes ampDotPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.45);opacity:.68}}
    @keyframes ampFitPulse{0%,100%{box-shadow:0 0 16px rgba(236,72,153,.32)}50%{box-shadow:0 0 24px rgba(236,72,153,.55), 0 0 36px rgba(168,85,247,.28)}}
    `}</style>
  );

// ── FestivalCard ──────────────────────────────────────────────────────────────

function FestivalCard({ instance, festival, profile, mySubmission, lineupSlot, onClick }) {
  const status = instance.status;
  const statusColor = STATUS_COLOR[status] || '#6b7280';
  const flag = REGION_FLAG[festival.region] || '🌐';
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=520&fit=crop');
  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const lanes = festival.lanes || {};
  const eligibleLaneCount = LANE_ORDER.filter((laneKey) => {
    const cfg = lanes[laneKey];
    if (!cfg) return false;
    const fans = Number(profile?.fans ?? profile?.followers ?? 0);
    const clout = Number(profile?.clout ?? 0);
    const stage = stageIdx(profile?.career_stage || 'Unknown');
    return stage >= (cfg.min_stage_idx || 0)
      && fans >= (cfg.min_fans || 0)
      && clout >= (cfg.min_clout || 0);
  }).length;
  const laneLabel = mySubmission
    ? LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane
    : null;
  const subStatus = mySubmission ? SUBMISSION_STATUS_LABEL[mySubmission.status] || mySubmission.status : null;
  const isRejected = mySubmission?.status === 'REJECTED';
  const isSelected = mySubmission?.status === 'SELECTED';
  const isLive = status === 'LIVE';
  const selectionOdds = lineupSlot?.selection_weight;
  const topGenre = Object.entries(festival.genre_weights || {}).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="amp-card" onClick={onClick}>
      <div className="amp-poster-frame" style={{ position: 'relative', minHeight: 230, overflow: 'hidden' }}>
        <img
          src={imageUrl}
          alt={festival.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="amp-vignette" />
        <div className="amp-spotlight" />
        <div className="amp-glow-orb" style={{ width: 140, height: 140, background: 'rgba(168,85,247,.32)', top: -36, right: -20 }} />
        <div className="amp-glow-orb" style={{ width: 110, height: 110, background: 'rgba(236,72,153,.24)', bottom: 18, left: -28 }} />
        <div className="amp-card-inner" style={{ position: 'relative', zIndex: 1, minHeight: 230, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className={`amp-lux-chip${isLive ? ' amp-live-chip' : ''}`} style={{ color: statusColor, borderColor: `${statusColor}55` }}>
                <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, marginRight: 0 }} />
                {STATUS_LABEL[status]}
              </span>
              <span className="amp-lux-chip">{flag} {festival.region}</span>
              {mySubmission && (
                <span className="amp-lux-chip" style={{
                  color: isSelected ? '#f0abfc' : isRejected ? '#f472b6' : '#d8b4fe',
                  borderColor: isSelected ? 'rgba(240,171,252,.38)' : isRejected ? 'rgba(244,114,182,.35)' : 'rgba(168,85,247,.35)',
                }}>
                  {subStatus}
                </span>
              )}
            </div>
            <ChevronRight size={16} color="rgba(255,255,255,.5)" />

          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{flag}</span>
              <div style={{ minWidth: 0 }}>
                <div className="amp-title-glow" style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{festival.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)', marginTop: 4 }}>
                  {festival.brand_posture || 'Open format'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Your fit</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color }}>{fitInfo.label}</span>
                </div>
                <div className="amp-fit-meter">
                  <div className={`amp-fit-fill${myFit >= 0.8 ? ' hot' : ''}`} style={{ width: `${Math.max(8, Math.min(100, myFit * 100))}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Favored sound</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', marginTop: 3 }}>{topGenre?.[0] || 'Mixed'}</div>
              </div>
            </div>

            <div className="amp-stat-grid">
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Eligible lanes</div>
                <div className="amp-stat-value">{eligibleLaneCount}</div>
                <div className="amp-stat-subtle">of {Object.keys(lanes).length || 0}</div>
              </div>
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Festival run</div>
                <div className="amp-stat-value">{festival.day_count || instance.day_count || 1} days</div>
                <div className="amp-stat-subtle">multi-day impact</div>
              </div>
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Specials</div>
                <div className="amp-stat-value">{(festival.has_secret_stage ? 1 : 0) + (festival.wristband_economy ? 1 : 0)}</div>
                <div className="amp-stat-subtle">bonus systems</div>
              </div>
            </div>

            {mySubmission && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {laneLabel && <span className="amp-lux-chip">Lane: {laneLabel}</span>}
                <span className="amp-lux-chip">Posture: {festival.brand_posture}</span>
                {isSelected && selectionOdds != null && (
                  <span className="amp-lux-chip" style={{ color: '#f0abfc', borderColor: 'rgba(240,171,252,.35)' }}>
                    Weight {Number(selectionOdds).toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {isRejected && mySubmission.ineligibility_reason && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.22)', fontSize: 10, color: 'rgba(255,220,220,.9)' }}>
                ✕ {mySubmission.ineligibility_reason}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FeaturedCard (horizontal scroll, gradient bg) ────────────────────────────

function FeaturedCard({ festival, instance, profile, mySubmission, onClick }) {
  const status = instance?.status;
  const flag = REGION_FLAG[festival.region] || '🌐';
  const grad = REGION_GRADIENT[festival.region] || REGION_GRADIENT.US;
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&h=450&fit=crop');
  const statusLabel = status ? STATUS_LABEL[status] : null;
  const statusColor = status ? STATUS_COLOR[status] : null;
  const subStatus = mySubmission ? SUBMISSION_STATUS_LABEL[mySubmission.status] : null;
  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const isLive = status === 'LIVE';

  return (
    <div className="amp-feat-card" onClick={onClick}>
      <div className="amp-feat-bg" style={{ background: grad }}>
        <img
          src={imageUrl}
          alt={festival.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="amp-feat-overlay" />
        <div className="amp-vignette" />
        <div className="amp-spotlight" style={{ inset: '-18% auto auto 8%' }} />
        <div className="amp-glow-orb" style={{ width: 160, height: 160, background: 'rgba(168,85,247,.28)', top: -34, right: -24 }} />
        {statusLabel && (
          <span className={`amp-feat-status${isLive ? ' amp-live-chip' : ''}`} style={{ background: statusColor + '28', color: statusColor, border: `1px solid ${statusColor}40` }}>
            <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, width: 5, height: 5 }} />
            {statusLabel}
          </span>
        )}
        {!instance && (
          <span className="amp-feat-status" style={{ background: 'rgba(168,85,247,.2)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,.3)' }}>
            ✦ Featured
          </span>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="amp-kicker" style={{ marginBottom: 3 }}>{flag} {festival.region}</div>
          <div className="amp-title-glow" style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{festival.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.5px' }}>{festival.region}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="amp-lux-chip" style={{ color: fitInfo.color, borderColor: `${fitInfo.color}40` }}>{fitInfo.label}</span>
            <span className="amp-lux-chip">{festival.day_count || instance?.day_count || 1} days</span>
          </div>
        </div>
      </div>
      <div className="amp-feat-footer">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.72)', fontWeight: 700 }}>{festival.brand_posture}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', marginTop: 2 }}>
            {(festival.culture_identity || 'Festival identity TBD').slice(0, 46)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {festival.has_secret_stage && <span className="amp-lux-chip" style={{ padding: '4px 8px' }}>Secret</span>}
          {subStatus && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: mySubmission.status === 'SELECTED' ? 'rgba(236,72,153,.2)' : 'rgba(168,85,247,.2)',
              color: mySubmission.status === 'SELECTED' ? '#f0abfc' : '#d8b4fe' }}>
              {subStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const FESTIVAL_IMAGE_OVERRIDES = {
  'Coachella Valley': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/coachella-valley.png',
  'Lollapalooza': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/lollapalooza.png',
  'Burning Man': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/burning-man.png',
  'TIFF AfterDark Live': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/tiff-afterdark-live.png',
  'Glastonbury': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/glastonbury.png',
  'Tomorrowland': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/tomorrowland.png',
  'Laneway': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/laneway.png',
  'Splendour in the Grass': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/splendour-in-the-grass.png',
  'Primavera Sound': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/primavera-sound.png',
  'Rolling Loud': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/rolling-loud.png',
  'Boomtown': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/boomtown.png',
  'Amapiano All Night': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/amapiano-all-night.png',
  'Afro Nation': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/afro-nation.png',
  'SXSW Sounds': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/sxsw-sounds.png',
  'Osheaga': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/osheaga.png',
  'Sziget': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/sziget.png',
};

function getFestivalImageUrl(festival, fallback = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop') {
  return FESTIVAL_IMAGE_OVERRIDES[festival?.name] || festival?.cover_image_url || fallback;
}

// ── MiniCard (compact card for carousel) ──────────────────────────────────────

function MiniCard({ festival, instance, onClick }) {
  const flag = REGION_FLAG[festival.region] || '🌐';
  const imageUrl = getFestivalImageUrl(festival);
  const statusColor = instance ? STATUS_COLOR[instance.status] : '#a855f7';
  const isLive = instance?.status === 'LIVE';

  return (
    <div className="amp-mini-card" onClick={onClick}>
      <img 
        src={imageUrl} 
        alt={festival.name}
        className="amp-mini-card-image"
        style={{ position: 'relative' }}
      />
      <div className="amp-vignette" />
      <div style={{
        position: 'absolute',
        top: 6,
        right: 6,
        fontSize: '8px',
        fontWeight: '700',
        padding: '2px 5px',
        borderRadius: '4px',
        background: statusColor + '40',
        color: statusColor,
        border: `1px solid ${statusColor}60`,
      }} className={isLive ? ' amp-live-chip' : ''}>
        {instance ? STATUS_LABEL[instance.status] : 'Featured'}
      </div>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 1 }}>
        <span className="amp-kicker" style={{ color: 'rgba(255,255,255,.78)' }}>{flag} {festival.region}</span>
        {festival.has_secret_stage && <span className="amp-lux-chip" style={{ padding: '3px 7px', fontSize: 8 }}>Secret</span>}
      </div>
      <div className="amp-mini-card-content">
        <div className="amp-mini-card-name">{flag} {festival.name}</div>
        <div className="amp-mini-card-region">{festival.region}</div>
      </div>
    </div>
  );
}

// ── Genre fit helpers ─────────────────────────────────────────────────────────

/**
 * PUBLIC_INTERFACE
 * Converts a genre-weight value (0–100 integer from festival.genre_weights)
 * into a normalised 0–1 fraction.  Handles both legacy 0–100 integers and
 * already-normalised 0–1 floats gracefully.
 */
function normalizeGenreWeight(raw) {
  const v = Number(raw ?? 0);
  // If the value is > 1 it's stored as 0–100 integer; normalise to 0–1
  return v > 1 ? v / 100 : v;
}

/**
 * PUBLIC_INTERFACE
 * Returns a human-readable fit label + color for a normalised 0–1 genre fit
 * value.  Accepts both raw 0–100 and normalised 0–1 inputs because it
 * normalises internally.
 */
function festivalGenreFitLabel(raw) {
  const v = normalizeGenreWeight(raw);
  if (v >= 0.8) return { label: 'Perfect Fit', color: '#f0abfc' };
  if (v >= 0.5) return { label: 'Good Fit', color: '#d8b4fe' };
  if (v >= 0.2) return { label: 'Fair Fit', color: '#f9a8d4' };
  return { label: 'Poor Fit', color: '#c084fc' };
}

function summarizeBookingPhilosophy(booking = {}) {
  const prestige = Number(booking?.prestige_weight || 0);
  const discovery = Number(booking?.discovery_bias || 0);
  const spectacle = Number(booking?.spectacle_weight || 0);
  if (prestige >= 0.65) return 'Rewards established names and prestige moments.';
  if (discovery >= 0.65) return 'Favors breakout energy and discovery-ready artists.';
  if (spectacle >= 0.65) return 'Big on visuals, theatricality, and crowd spectacle.';
  return 'Balanced booking with room for style, fit, and performance strategy.';
}

// ── Carousel Component ──────────────────────────────────────────────────────────

function FestivalCarousel({ title, festivals, onCardClick, showNavButtons = true }) {
  const scrollRef = React.useRef(null);
  const [showLeftBtn, setShowLeftBtn] = React.useState(false);
  const [showRightBtn, setShowRightBtn] = React.useState(true);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const amount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      setShowLeftBtn(scrollRef.current.scrollLeft > 0);
      setShowRightBtn(
        scrollRef.current.scrollLeft < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10
      );
    }
  };

  React.useEffect(() => {
    checkScroll();
    const element = scrollRef.current;
    if (element) element.addEventListener('scroll', checkScroll);
    return () => element?.removeEventListener('scroll', checkScroll);
  }, []);

  return (
    <div className="amp-carousel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 18, paddingRight: 18, marginBottom: 10 }}>
        <div className="amp-section-label">{title}</div>
        {showNavButtons && (
          <div className="amp-carousel-nav">
            <button
              className="amp-carousel-btn"
              onClick={() => scroll('left')}
              disabled={!showLeftBtn}
              style={{ opacity: showLeftBtn ? 1 : 0.3 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="amp-carousel-btn"
              onClick={() => scroll('right')}
              disabled={!showRightBtn}
              style={{ opacity: showRightBtn ? 1 : 0.3 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="amp-carousel-scroll" ref={scrollRef}>
        {festivals.map((festivalObj) => (
          <MiniCard
            key={festivalObj.instance?.id || `${festivalObj.festival.id}:${festivalObj.originalItem?.id || festivalObj.originalItem?.name || 'catalog'}`}
            festival={festivalObj.festival}
            instance={festivalObj.instance}
            onClick={() => onCardClick(festivalObj)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Phase Timeline Panel ──────────────────────────────────────────────────────

/**
 * PUBLIC_INTERFACE
 * Compact horizontal phase timeline showing the festival lifecycle stages
 * and the player's current submission status within it.
 */
function PhaseTimelinePanel({ instanceStatus, mySubmission }) {
  const PHASES = [
    { key: 'SCHEDULED', label: 'Scheduled', icon: '📅' },
    { key: 'OPEN',      label: 'Apps Open',  icon: '✏️' },
    { key: 'CLOSED',    label: 'Reviewing',  icon: '🔍' },
    { key: 'LOCKED',    label: 'Lineup Set', icon: '🔒' },
    { key: 'LIVE',      label: 'Live',       icon: '🔴' },
    { key: 'COMPLETE',  label: 'Complete',   icon: '🏁' },
  ];

  const currentIdx = PHASES.findIndex((p) => p.key === instanceStatus);
  const activeIdx = currentIdx >= 0 ? currentIdx : 0;

  const subStatus = mySubmission?.status;
  const nextHint = (() => {
    if (instanceStatus === 'COMPLETE') return 'Festival has ended — check your results.';
    if (instanceStatus === 'LIVE') {
      if (subStatus === 'SELECTED') return 'You’re performing! Rock the stage.';
      return 'Festival is live — watch the action.';
    }
    if (instanceStatus === 'LOCKED') {
      if (subStatus === 'SELECTED') return 'You made the lineup! Prep your setlist.';
      if (subStatus === 'REJECTED') return 'Not selected this time — next season!';
      return 'Lineup is locked — awaiting festival start.';
    }
    if (instanceStatus === 'CLOSED') {
      if (subStatus === 'SUBMITTED' || subStatus === 'ELIGIBLE') return 'Your app is under review.';
      return 'Applications closed — lineup announcement next.';
    }
    if (instanceStatus === 'OPEN') {
      if (subStatus === 'SUBMITTED') return 'Applied! Sit tight until review.';
      return 'Applications are open — apply now!';
    }
    return 'Festival not open yet — stay tuned.';
  })();

  const subBadgeColor = {
    SUBMITTED: '#6366f1', ELIGIBLE: '#8b5cf6', INELIGIBLE: '#ef4444',
    SELECTED: '#10b981', REJECTED: '#f59e0b', WITHDRAWN: '#6b7280',
  }[subStatus] || null;

  return (
    <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="amp-section-label" style={{ paddingLeft: 0, margin: 0 }}>Phase Timeline</div>
        {subStatus && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${subBadgeColor}22`, color: subBadgeColor, border: `1px solid ${subBadgeColor}44`, letterSpacing: '.4px' }}>
            {SUBMISSION_STATUS_LABEL[subStatus] || subStatus}
          </span>
        )}
      </div>

      {/* Horizontal phase dots + connector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
        {PHASES.map((phase, idx) => {
          const isPast = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          const dotColor = isCurrent ? (STATUS_COLOR[phase.key] || '#a855f7') : isPast ? 'rgba(168,85,247,.55)' : 'rgba(255,255,255,.12)';
          return (
            <React.Fragment key={phase.key}>
              {idx > 0 && (
                <div style={{ flex: 1, height: 2, background: isPast || isCurrent ? 'linear-gradient(90deg, rgba(168,85,247,.5), rgba(236,72,153,.4))' : 'rgba(255,255,255,.08)', borderRadius: 1 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36, flexShrink: 0 }}>
                <div style={{ width: isCurrent ? 22 : 14, height: isCurrent ? 22 : 14, borderRadius: '50%', background: dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isCurrent ? 10 : 7, transition: 'all .2s', boxShadow: isCurrent ? `0 0 12px ${dotColor}88` : 'none', border: isCurrent ? '2px solid rgba(255,255,255,.2)' : '1px solid transparent' }}>
                  {isCurrent ? phase.icon : isPast ? '✓' : ''}
                </div>
                <span style={{ fontSize: 8, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#fff' : isPast ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.2)', letterSpacing: '.3px', textAlign: 'center', lineHeight: 1.1, maxWidth: 48 }}>
                  {phase.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* What's next hint */}
      <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12 }}>💡</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.6)', lineHeight: 1.4 }}>
          {nextHint}
        </span>
      </div>
    </div>
  );
}

// ── FestivalDetail modal ──────────────────────────────────────────────────────

function FestivalDetail({ instance, festival, profile, mySubmission, mySetlist, myResults, onClose, onSubmit, onSetlist, onViewGreenRoom, onEditSubmission }) {
  const genres = Object.entries(festival.genre_weights || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 8);

  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const lanes = festival.lanes || {};
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=900&h=600&fit=crop');
  const statusColor = STATUS_COLOR[instance.status] || '#a855f7';
  const isLive = instance.status === 'LIVE';
  const eligibleLaneCount = LANE_ORDER.filter((laneKey) => {
    const cfg = lanes[laneKey];
    if (!cfg) return false;
    const fans = Number(profile?.fans ?? profile?.followers ?? 0);
    const clout = Number(profile?.clout ?? 0);
    const stage = stageIdx(profile?.career_stage || 'Unknown');
    return stage >= (cfg.min_stage_idx || 0)
      && fans >= (cfg.min_fans || 0)
      && clout >= (cfg.min_clout || 0);
  }).length;
  const topGenre = genres[0];
  const bookingSummary = summarizeBookingPhilosophy(festival.booking_philosophy);

  // Allow re-application if the player previously withdrew (GAP-05 fix)
  const canApply = instance.status === 'OPEN' && (!mySubmission || mySubmission?.status === 'WITHDRAWN');
  const isSelected = mySubmission?.status === 'SELECTED';
  const canSetlist = isSelected && !mySetlist?.locked && instance.status !== 'COMPLETE';
  const hasResults = (myResults?.length ?? 0) > 0;

  // Determine if we should show a condensed post-submission view
  const isPostSubmit = mySubmission && mySubmission.status !== 'WITHDRAWN';

  // ── SELECTED-phase: setlist creation / prep focused variant ──────────
  if (isSelected) {
    const startTurn = getFestivalStartTurnFromInstance(instance);
    const festStartStr = formatFestivalTurnDate(startTurn);
    const laneLabel = LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane;
    const setMin = LANE_SET_MIN[mySubmission.desired_lane] || 30;

    return (
      <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="amp-modal-sheet">
          <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={18} />
            </button>
            <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(16,185,129,.15)', color: '#10b981', border: '1px solid rgba(16,185,129,.3)' }}>
              SELECTED
            </span>
          </div>

          <div style={{ padding: '0 14px 16px' }}>
            {/* Compact identity banner */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px 14px', background: 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(168,85,247,.08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{REGION_FLAG[festival.region] || '🌐'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{festival.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{festival.region} · {festival.day_count || instance.day_count || 1} days</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>Your fit</div>
                </div>
              </div>

              {/* Your slot info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="amp-stat-pill" style={{ background: 'rgba(16,185,129,.08)' }}>
                  <div className="amp-stat-label">Your Lane</div>
                  <div className="amp-stat-value" style={{ fontSize: 12, color: '#10b981' }}>{laneLabel}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Set Length</div>
                  <div className="amp-stat-value" style={{ fontSize: 12 }}>{setMin}m</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Starts</div>
                  <div className="amp-stat-value" style={{ fontSize: 11 }}>{festStartStr || 'TBD'}</div>
                </div>
              </div>
            </div>

            {/* Phase Timeline */}
            <PhaseTimelinePanel instanceStatus={instance.status} mySubmission={mySubmission} />

            {/* Setlist Prep Section */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px' }}>
              <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>🎵 Setlist & Prep</div>

              {mySetlist?.locked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)' }}>
                  <CheckCircle size={14} color="#10b981" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>Setlist Locked</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>You're ready for the stage. Good luck!</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 10, lineHeight: 1.5 }}>
                    Build your setlist before the festival starts. Pick your best songs for a {setMin}-minute set in the <strong style={{ color: '#d8b4fe' }}>{laneLabel}</strong> lane.
                  </div>
                  {canSetlist && (
                    <button className="amp-primary-btn" onClick={onSetlist} style={{ fontSize: 13 }}>
                      🎤 Build Your Setlist
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Philosophy tags for context */}
            {(festival.aesthetic_tags?.length > 0 || festival.booking_philosophy) && (
              <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
                <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 6 }}>Festival Vibe</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginBottom: 8 }}>{bookingSummary}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(festival.aesthetic_tags || []).slice(0, 6).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.brand_posture && <span className="amp-tag" style={{ color: '#d8b4fe' }}>{festival.brand_posture}</span>}
                </div>
              </div>
            )}

            {/* Phase-specific CTA buttons for SELECTED state */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {/* View Green Room — available when festival is COMPLETE or LIVE with results */}
              {hasResults && (
                <button
                  className="amp-primary-btn"
                  onClick={() => { onClose(); onViewGreenRoom?.(); }}
                  style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  🎤 View Green Room
                </button>
              )}

              {/* Withdraw — allow player to withdraw even after selection, before festival goes LIVE */}
              {instance.status !== 'COMPLETE' && instance.status !== 'LIVE' && (
                <button
                  className="amp-outline-button"
                  onClick={async () => {
                    try {
                      await invokeFestivalAction('withdrawEntry', {
                        festivalInstanceId: instance.id,
                      });
                      onClose();
                    } catch (e) {
                      console.error('[Amplifi] withdraw error', e);
                    }
                  }}
                  style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,.2)', background: 'rgba(239,68,68,.06)' }}
                >
                  Withdraw from Festival
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Condensed post-submission view (SUBMITTED / ELIGIBLE / INELIGIBLE / REJECTED) ──
  if (isPostSubmit) {
    const subColor = {
      SUBMITTED: '#6366f1', ELIGIBLE: '#8b5cf6', INELIGIBLE: '#ef4444',
      REJECTED: '#f59e0b',
    }[mySubmission.status] || '#a855f7';
    const laneLabel = LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane;
    const startTurn = getFestivalStartTurnFromInstance(instance);
    const endTurn = getFestivalEndTurn(instance);
    const appsCloseStr = formatFestivalTurnDate(instance.applications_close_turn_id);
    const lineupLockStr = formatFestivalTurnDate(instance.lineup_lock_turn_id);
    const festStartStr = formatFestivalTurnDate(startTurn);
    const festEndStr = formatFestivalTurnDate(endTurn);

    return (
      <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="amp-modal-sheet">
          <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={18} />
            </button>
            <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${subColor}22`, color: subColor, border: `1px solid ${subColor}44` }}>
              {SUBMISSION_STATUS_LABEL[mySubmission.status] || mySubmission.status}
            </span>
          </div>

          <div style={{ padding: '0 14px 16px' }}>
            {/* Festival hero image at top of modal */}
            <div style={{
              width: '100%',
              height: 180,
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: 12,
              position: 'relative',
              background: 'linear-gradient(135deg,rgba(168,85,247,.3),rgba(236,72,153,.3))',
            }}>
              <img
                src={imageUrl}
                alt={festival.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="amp-vignette" />
            </div>

            {/* At-a-glance summary */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{REGION_FLAG[festival.region] || '🌐'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{festival.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{festival.region} · {festival.day_count || instance.day_count || 1} days</div>
                </div>
              </div>

              <div className="amp-stat-grid">
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Status</div>
                  <div className="amp-stat-value" style={{ fontSize: 11, color: STATUS_COLOR[instance.status] || '#a855f7' }}>
                    {STATUS_LABEL[instance.status]}
                  </div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Your Fit</div>
                  <div className="amp-stat-value" style={{ fontSize: 12, color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div className="amp-stat-subtle">{fitInfo.label}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Lane</div>
                  <div className="amp-stat-value" style={{ fontSize: 11 }}>{laneLabel}</div>
                </div>
              </div>

              {/* Description excerpt */}
              {festival.culture_identity && (
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', lineHeight: 1.5, margin: '10px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {festival.culture_identity}
                </p>
              )}

              {/* Tags row */}
              {(festival.aesthetic_tags?.length > 0 || festival.region_weather) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {festival.region_weather && (
                    <span className="amp-weather">
                      {festival.region_weather.condition === 'sunny' ? '☀️' :
                       festival.region_weather.condition === 'rainy' ? '🌧️' :
                       festival.region_weather.condition === 'windy' ? '💨' : '🌤️'}
                      {festival.region_weather.condition}
                    </span>
                  )}
                  {(festival.aesthetic_tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.brand_posture && <span className="amp-tag" style={{ color: '#d8b4fe' }}>{festival.brand_posture}</span>}
                </div>
              )}
            </div>

            {/* Key Dates compact */}
            {(() => {
              const hasAnyDate = appsCloseStr || lineupLockStr || festStartStr || festEndStr;
              if (!hasAnyDate) return null;
              return (
                <div className="amp-section-card" style={{ marginBottom: 12, padding: '10px 14px' }}>
                  <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 6 }}>Key Dates</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {appsCloseStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Apps Close</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f9a8d4' }}>{appsCloseStr}</div>
                      </div>
                    )}
                    {lineupLockStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Lineup Locks</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>{lineupLockStr}</div>
                      </div>
                    )}
                    {festStartStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Starts</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>{festStartStr}</div>
                      </div>
                    )}
                    {festEndStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Ends</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{festEndStr}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Phase Timeline */}
            <PhaseTimelinePanel instanceStatus={instance.status} mySubmission={mySubmission} />

            {/* Rejection reason if applicable */}
            {mySubmission.status === 'REJECTED' && mySubmission.ineligibility_reason && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', fontSize: 11, color: 'rgba(255,220,220,.85)' }}>
                ✕ {mySubmission.ineligibility_reason}
              </div>
            )}

            {/* Phase-specific CTA buttons for post-submission states */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Edit Submission — available when apps are still OPEN and player has SUBMITTED/ELIGIBLE status */}
              {(mySubmission.status === 'SUBMITTED' || mySubmission.status === 'ELIGIBLE') && instance.status === 'OPEN' && (
                <button
                  className="amp-primary-btn"
                  onClick={() => onEditSubmission ? onEditSubmission() : onSubmit?.()}
                  style={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  ✏️ Edit Submission
                </button>
              )}

              {/* View Green Room — available when festival is COMPLETE and results exist */}
              {hasResults && (
                <button
                  className="amp-primary-btn"
                  onClick={() => { onClose(); onViewGreenRoom?.(); }}
                  style={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  🎤 View Green Room
                </button>
              )}

              {/* Withdraw CTA — allows player to free up the slot */}
              {(mySubmission.status === 'SUBMITTED' || mySubmission.status === 'ELIGIBLE') && instance.status !== 'COMPLETE' && (
                <button
                  className="amp-outline-button"
                  onClick={async () => {
                    try {
                      await invokeFestivalAction('withdrawEntry', {
                        festivalInstanceId: instance.id,
                      });
                      onClose();
                    } catch (e) {
                      console.error('[Amplifi] withdraw error', e);
                    }
                  }}
                  style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,.2)', background: 'rgba(239,68,68,.06)' }}
                >
                  Withdraw Application
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="amp-modal-sheet">
        {/* Compact header with back button and festival name */}
        <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} />
          </button>
          <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          {/* Hero image + festival identity in one compact card */}
          <div className="amp-detail-card amp-poster-frame" style={{ marginBottom: 12 }}>
            {/* Large hero image */}
            <div style={{ 
              width: '100%', 
              height: 220, 
              background: 'linear-gradient(135deg,rgba(168,85,247,.3),rgba(236,72,153,.3))',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img 
                src={imageUrl} 
                alt={festival.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="amp-vignette" />
              <div className="amp-spotlight" style={{ inset: '-14% auto auto 4%', width: '78%' }} />
              <div className="amp-glow-orb" style={{ width: 180, height: 180, background: 'rgba(168,85,247,.26)', top: -46, right: -24 }} />
              <div className="amp-glow-orb" style={{ width: 130, height: 130, background: 'rgba(236,72,153,.22)', bottom: -30, left: -18 }} />
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span className={`amp-lux-chip${isLive ? ' amp-live-chip' : ''}`} style={{ color: statusColor, borderColor: `${statusColor}45` }}>
                  <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, marginRight: 0 }} />
                  {STATUS_LABEL[instance.status] || instance.status}
                </span>
                <span className="amp-lux-chip">{REGION_FLAG[festival.region] || '🌐'} {festival.region}</span>
                <span className="amp-lux-chip">{festival.day_count || instance.day_count || 1} days</span>
              </div>
              {/* Overlay with region & posture */}
              <div style={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 100%)',
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div className="amp-kicker" style={{ color: '#f5d0fe', marginBottom: 4 }}>
                    {festival.brand_posture || 'Festival brand'}
                  </div>
                  <div className="amp-title-glow" style={{ fontSize: 21, fontWeight: 900, color: '#fff', lineHeight: 1.05, maxWidth: 220 }}>{festival.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', marginTop: 6, maxWidth: 230 }}>{bookingSummary}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color, marginBottom: 4 }}>{fitInfo.label}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Your sound</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.84)', marginTop: 3 }}>{myGenre || 'No genre'}</div>
                </div>
              </div>
            </div>

            {/* Brief description */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.62)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {festival.culture_identity}
              </p>
              {/* Aesthetic tags + weather badge */}
              {(festival.aesthetic_tags?.length > 0 || festival.region_weather) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, alignItems: 'center' }}>
                  {festival.region_weather && (
                    <span className="amp-weather">
                      {festival.region_weather.condition === 'sunny' ? '☀️' :
                       festival.region_weather.condition === 'rainy' ? '🌧️' :
                       festival.region_weather.condition === 'windy' ? '💨' : '🌤️'}
                      {festival.region_weather.condition}
                    </span>
                  )}
                  {(festival.aesthetic_tags || []).slice(0, 5).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.has_secret_stage && (
                    <span className="amp-tag" style={{ background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.25)', color: '#d8b4fe' }}>✦ secret stage</span>
                  )}
                  {festival.wristband_economy && (
                    <span className="amp-tag" style={{ background: 'rgba(236,72,153,.10)', border: '1px solid rgba(236,72,153,.24)', color: '#f9a8d4' }}>💗 wristband</span>
                  )}
                </div>
              )}

              <div className="amp-stat-grid" style={{ marginTop: 12 }}>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Your fit</div>
                  <div className="amp-stat-value" style={{ color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div className="amp-stat-subtle">{fitInfo.label}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Eligible lanes</div>
                  <div className="amp-stat-value">{eligibleLaneCount}</div>
                  <div className="amp-stat-subtle">available now</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Top genre</div>
                  <div className="amp-stat-value">{topGenre?.[0] || 'Mixed'}</div>
                  <div className="amp-stat-subtle">{topGenre ? `${Math.round(normalizeGenreWeight(topGenre[1]) * 100)}% match` : 'open format'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="amp-section-card" style={{ marginBottom: 12 }}>
            <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>What players should know</div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Festival rewards</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>What this booking philosophy is likely to favor.</div>
              </div>
              <div className="amp-info-value" style={{ maxWidth: 180 }}>{bookingSummary}</div>
            </div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Best positioning</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>Strongest signal for applying with intent.</div>
              </div>
              <div className="amp-info-value">{topGenre?.[0] || 'Mixed'} + {festival.brand_posture || 'Flexible'}</div>
            </div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Special upside</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>Bonus systems visible on this festival.</div>
              </div>
              <div className="amp-info-value">
                {festival.has_secret_stage || festival.wristband_economy
                  ? [festival.has_secret_stage ? 'Secret stage' : null, festival.wristband_economy ? 'Wristband payouts' : null].filter(Boolean).join(' · ')
                  : 'No visible bonus systems'}
              </div>
            </div>
          </div>

          {/* Genre Fit section with horizontal scroll */}
          <div className="amp-section-card" style={{ marginBottom: 12, paddingBottom: 4 }}>
            <div className="amp-section-label" style={{ paddingLeft: 14, marginBottom: 6 }}>Genre Fit</div>
            <div className="amp-genres-container">
              <div className="amp-genre-scroll">
                {genres.map(([genre, weight]) => (
                  <div key={genre} className="amp-genre-card" style={{
                    background: genre === myGenre ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.04)',
                    border: genre === myGenre ? '1px solid rgba(168,85,247,.3)' : '1px solid rgba(255,255,255,.08)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: genre === myGenre ? 700 : 600, color: genre === myGenre ? '#d8b4fe' : 'rgba(255,255,255,.7)' }}>
                      {genre}
                    </div>
                    <div style={{ fontSize: 9, color: genre === myGenre ? '#a855f7' : 'rgba(255,255,255,.4)', marginTop: 4 }}>{Math.round(normalizeGenreWeight(weight) * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lanes section with horizontal scroll */}
          <div className="amp-section-card" style={{ marginBottom: 12, paddingBottom: 4 }}>
            <div className="amp-section-label" style={{ paddingLeft: 14, marginBottom: 6 }}>Lanes</div>
            <div className="amp-lanes-container">
              <div className="amp-lanes-scroll">
                {LANE_ORDER.filter(l => lanes[l]).map((laneKey) => {
                  const cfg = lanes[laneKey];
                  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
                  const meetsStage = stageIdx(profile?.career_stage || 'Unknown') >= (cfg.min_stage_idx || 0);
                  const meetsFans = fans >= (cfg.min_fans || 0);
                  const eligible = meetsStage && meetsFans;
                  return (
                    <div key={laneKey} className="amp-lane-card" style={{
                      background: eligible ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.04)',
                      border: eligible ? '1px solid rgba(236,72,153,.22)' : '1px solid rgba(255,255,255,.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                        {eligible ? <CheckCircle size={11} color="#f0abfc" /> : <Lock size={11} color="rgba(255,255,255,.25)" />}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: eligible ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                        {LANE_LABEL[laneKey]}
                      </div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>
                        {cfg.slots} slots
                      </div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>
                        {cfg.set_min}m set
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dates & Key Info Section — derived from turn IDs */}
          {(() => {
            const startTurn = getFestivalStartTurnFromInstance(instance);
            const endTurn = getFestivalEndTurn(instance);
            const appsOpenStr = formatFestivalTurnDate(instance.applications_open_turn_id);
            const appsCloseStr = formatFestivalTurnDate(instance.applications_close_turn_id);
            const lineupLockStr = formatFestivalTurnDate(instance.lineup_lock_turn_id);
            const festStartStr = formatFestivalTurnDate(startTurn);
            const festEndStr = formatFestivalTurnDate(endTurn);
            const hasAnyDate = appsOpenStr || appsCloseStr || lineupLockStr || festStartStr || festEndStr;
            return (
              <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
                <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>Key Dates</div>
                {!hasAnyDate && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>Dates will appear once scheduled.</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {appsOpenStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Apps Open</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{appsOpenStr}</div>
                    </div>
                  )}
                  {appsCloseStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Apps Close</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f9a8d4' }}>{appsCloseStr}</div>
                    </div>
                  )}
                  {lineupLockStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Lineup Locks</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>{lineupLockStr}</div>
                    </div>
                  )}
                  {festStartStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Festival Starts</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>{festStartStr}</div>
                    </div>
                  )}
                  {festEndStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Festival Ends</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{festEndStr}</div>
                    </div>
                  )}
                  {instance.status && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Status</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>
                        {STATUS_LABEL[instance.status] || instance.status}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Phase Timeline — compact status panel */}
          <PhaseTimelinePanel
            instanceStatus={instance.status}
            mySubmission={mySubmission}
          />

          {canApply && (
            <button className="amp-primary-btn" onClick={onSubmit} style={{ padding: 12, fontSize: 13 }}>
              Apply Now
            </button>
          )}
          {!canApply && !instance.id && !mySubmission && (
            <button className="amp-outline-button" disabled style={{ opacity: .35, padding: 12, fontSize: 13 }}>
              <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Not Open
            </button>
          )}
          {mySubmission && mySubmission.status !== 'SELECTED' && !hasResults && (
            <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
              Status: <strong style={{ color: '#d8b4fe' }}>{SUBMISSION_STATUS_LABEL[mySubmission.status]}</strong>
            </div>
          )}
          {canSetlist && (
            <button className="amp-primary-btn" onClick={onSetlist} style={{ marginTop: 10 }}>
              Build Setlist
            </button>
          )}
          {mySetlist?.locked && !hasResults && (
            <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
              <CheckCircle size={14} color="#10b981" style={{ display: 'inline', marginRight: 5 }} />
              Setlist locked — you're ready
            </div>
          )}
          {/* GAP-06 fix: Show a "View Festival Recap" CTA when results are available */}
          {hasResults && mySubmission?.status === 'SELECTED' && (
            <button
              className="amp-primary-btn"
              onClick={() => { onClose(); onViewGreenRoom?.(); }}
              style={{ marginTop: 10, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
            >
              🎤 View Festival Recap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FestivalSubmit modal ──────────────────────────────────────────────────────

function FestivalSubmit({ instance, festival, profile, currentTurn, onClose, onSuccess }) {
  const lanes = festival.lanes || {};
  const [selectedLane, setSelectedLane] = useState(null);
  const [posture, setPosture] = useState('CLEAN');
  const [rehearsal, setRehearsal] = useState(50);
  const [visuals, setVisuals] = useState(50);
  const [wristbandOptedIn, setWristbandOptedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const odds = oddsLabel(profile, selectedLane, lanes, festival.genre_weights);

  async function handleSubmit() {
    if (!selectedLane || odds.label === 'INELIGIBLE') return;
    setSubmitting(true);
    setError(null);
    try {
      const setLen = LANE_SET_MIN[selectedLane] || 30;
      await invokeFestivalAction('submitEntry', {
        festivalInstanceId: instance.id,
        desired_lane: selectedLane,
        rehearsal_investment: rehearsal,
        visuals_budget: visuals,
        posture,
        wristband_opted_in: wristbandOptedIn,
        set_length: setLen,
      });
      onSuccess();
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="amp-modal-sheet">
        <div className="amp-modal-header">
          <span className="amp-modal-title">Apply — {festival.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '16px 20px 32px' }}>

          {/* Lane selection */}
          <div className="amp-input-group">
            <div className="amp-input-label">Choose Lane</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {LANE_ORDER.filter(l => lanes[l]).map((laneKey) => {
                const o = oddsLabel(profile, laneKey, lanes, festival.genre_weights);
                const inelig = o.label === 'INELIGIBLE';
                return (
                  <button
                    key={laneKey}
                    className={`amp-lane-btn${selectedLane === laneKey ? ' selected' : ''}${inelig ? ' ineligible' : ''}`}
                    onClick={() => !inelig && setSelectedLane(laneKey)}
                    disabled={inelig}
                  >
                    {LANE_LABEL[laneKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedLane && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,.04)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Your odds</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: odds.color }}>{odds.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 3 }}>
                Set length: {LANE_SET_MIN[selectedLane]}min · {lanes[selectedLane]?.slots} slots
              </div>
            </div>
          )}

          {/* Posture */}
          <div className="amp-input-group">
            <div className="amp-input-label">Performance Posture</div>
            <div style={{ display: 'flex' }}>
              {['CLEAN', 'EDGY', 'CHAOTIC'].map((p) => (
                <button
                  key={p}
                  className={`amp-posture-btn${posture === p ? ' selected' : ''}`}
                  onClick={() => setPosture(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
              {posture === 'CLEAN' ? 'Safe, polished, brand-friendly.' :
               posture === 'EDGY' ? 'Takes risks, more memorable.' :
               'Unpredictable, high ceiling, higher variance.'}
            </div>
          </div>

          {/* Rehearsal slider */}
          <div className="amp-input-group">
            <div className="amp-input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rehearsal Investment</span>
              <span style={{ color: '#d8b4fe' }}>{rehearsal}%</span>
            </div>
            <input type="range" min="0" max="100" value={rehearsal}
              onChange={(e) => setRehearsal(Number(e.target.value))}
              className="amp-slider" style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>
              <span>Wing it</span><span>Full prep</span>
            </div>
          </div>

          {/* Visuals slider */}
          <div className="amp-input-group">
            <div className="amp-input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Visuals Budget</span>
              <span style={{ color: '#d8b4fe' }}>{visuals}%</span>
            </div>
            <input type="range" min="0" max="100" value={visuals}
              onChange={(e) => setVisuals(Number(e.target.value))}
              className="amp-slider" style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>
              <span>Bare stage</span><span>Full production</span>
            </div>
          </div>

          {festival.wristband_economy && (
            <div className="amp-input-group">
              <div className="amp-input-label">Wristband Payout Program</div>
              <button
                type="button"
                onClick={() => setWristbandOptedIn((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${wristbandOptedIn ? 'rgba(16,185,129,.35)' : 'rgba(255,255,255,.08)'}`,
                  background: wristbandOptedIn ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: wristbandOptedIn ? '#10b981' : '#fff' }}>
                    {wristbandOptedIn ? 'Opted into wristband payouts' : 'Opted out of wristband payouts'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 3 }}>
                    Join the festival wristband program to qualify for crowd-threshold bonus payouts.
                  </div>
                </div>
                <div style={{
                  width: 40,
                  height: 22,
                  borderRadius: 999,
                  background: wristbandOptedIn ? '#10b981' : 'rgba(255,255,255,.14)',
                  padding: 3,
                  display: 'flex',
                  justifyContent: wristbandOptedIn ? 'flex-end' : 'flex-start',
                  transition: 'all .15s ease',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff' }} />
                </div>
              </button>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#ef4444' }}>
              {error}
            </div>
          )}

          <button
            className="amp-primary-btn"
            onClick={handleSubmit}
            disabled={!selectedLane || odds.label === 'INELIGIBLE' || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FestivalHistoryTab ────────────────────────────────────────────────────────

function FestivalHistoryTab({ records }) {
  const [expanded, setExpanded] = React.useState(null);
  const sortedRecords = sortFestivalHistoryRecords(records);

  if (!sortedRecords.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
        <Trophy size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
        No festival history yet.<br />Complete a festival to see your performance record here.
      </div>
    );
  }

  // Career aggregate stats
  const totalShows = sortedRecords.length;
  const totalFollowers = sortedRecords.reduce((s, r) => s + (r.follower_gain || 0), 0);
  const totalClout = sortedRecords.reduce((s, r) => s + (r.clout_gained || 0), 0);
  const avgHeat = sortedRecords.length ? (sortedRecords.reduce((s, r) => s + Number(r.crowd_heat || 0), 0) / sortedRecords.length).toFixed(1) : '0';
  const bestMoment = sortedRecords.find((r) => r.moment_card?.type);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Career stats banner */}
      <div style={{ margin: '16px 18px 0', padding: '14px 16px', background: 'linear-gradient(135deg,rgba(168,85,247,.15),rgba(236,72,153,.1))', border: '1px solid rgba(168,85,247,.2)', borderRadius: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>Festival Career</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#d8b4fe' }}>{totalShows}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Shows</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{fmt(totalFollowers)}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>New Fans</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>+{totalClout}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Clout</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{avgHeat}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Avg Heat</div>
          </div>
        </div>
        {bestMoment && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
            <Star size={10} color="#f59e0b" style={{ display: 'inline', marginRight: 4 }} />
            Best moment: <span style={{ color: '#fcd34d', fontWeight: 700 }}>{bestMoment.moment_card.label || bestMoment.moment_card.type}</span>
          </div>
        )}
      </div>

      {/* Per-festival records */}
      <div className="amp-section" style={{ marginTop: 16 }}>
        <div className="amp-section-label">Past Performances</div>
        {sortedRecords.map((rec) => {
          const fest = rec.festival_instance?.festival;
          const festName = fest?.name || 'Festival';
          const region = fest?.region || '';
          const flag = REGION_FLAG[region] || '🌐';
          const isOpen = expanded === rec.id;
          // BUG 2 FIX: crowd_heat is already 0-100 scale, don't multiply by 10
          const heatPct = Math.min(100, Math.round(Number(rec.crowd_heat || 0)));
          const lane = rec.lane || rec.desired_lane || '—';

          return (
            <div key={rec.id} className="amp-card" onClick={() => setExpanded(isOpen ? null : rec.id)}>
              <div className="amp-card-inner">
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 15 }}>{flag}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{festName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                      {LANE_LABEL[lane] || lane} · {formatFestivalHistoryTiming(rec)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {rec.moment_card?.type && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(252,211,77,.15)', color: '#fcd34d', border: '1px solid rgba(252,211,77,.2)' }}>
                        ✦ {rec.moment_card.label || rec.moment_card.type}
                      </span>
                    )}
                    <ChevronRight size={14} color="rgba(255,255,255,.3)" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </div>
                </div>

                {/* Compact heat bar */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 3 }}>
                    <span>Crowd Heat</span>
                    <span style={{ color: heatPct >= 70 ? '#10b981' : heatPct >= 40 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{Number(rec.crowd_heat || 0).toFixed(1)}</span>
                  </div>
                  <div className="amp-axis-bar">
                    <div className="amp-axis-fill" style={{ width: `${heatPct}%`, background: heatPct >= 70 ? '#10b981' : heatPct >= 40 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>New Fans</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>+{fmt(rec.follower_gain || 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Clout Gained</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>+{rec.clout_gained || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Credibility</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>{Number(rec.credibility || 0).toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Conversion</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{Number(rec.conversion || 0).toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Brand Interest</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ec4899' }}>+{rec.brand_interest_gain || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Rehearsal</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>{rec.energy_spent || 0}%</div>
                    </div>
                    {rec.hype_gained > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Hype Earned</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>+{rec.hype_gained}</div>
                      </div>
                    )}
                    {rec.payout_earned > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Earnings</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>${fmt(rec.payout_earned)}</div>
                      </div>
                    )}
                    {rec.metadata?.submission_posture && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Performance Style</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{rec.metadata.submission_posture}</div>
                      </div>
                    )}
                    {/* Approach C: Backstage Follow-Through artifacts */}
                    {rec.metadata?.backstage_follow_through?.length > 0 && (
                      <div style={{ gridColumn: '1 / -1', marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Handshake size={10} style={{ opacity: 0.6 }} />
                          Backstage Outcomes
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {rec.metadata.backstage_follow_through.map((item, idx) => {
                            const DEAL_LABELS = {
                              FEATURE_SWAP: { icon: '🎤', label: 'Feature Swap' },
                              REMIX_PERMISSION: { icon: '🔄', label: 'Remix Permission' },
                              TOURING_INVITE: { icon: '🚌', label: 'Tour Invite' },
                              SYNC_PITCH: { icon: '🎬', label: 'Sync Pitch Lead' },
                              BRAND_SCOUT_MEETING: { icon: '💼', label: 'Brand Scout Meeting' },
                              STAGE_GUEST_SURPRISE: { icon: '⭐', label: 'Guest Appearance' },
                            };
                            const cfg = DEAL_LABELS[item.deal_type] || { icon: '🤝', label: item.deal_type };
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(168,85,247,.08)', borderRadius: 8, border: '1px solid rgba(168,85,247,.15)' }}>
                                <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#d8b4fe' }}>{cfg.label}</div>
                                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1 }}>
                                    {item.effects_applied ? 'Resolved' : 'Pending'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main AmplifiApp ───────────────────────────────────────────────────────────

export default function AmplifiApp({ onNavigate }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [instances, setInstances] = useState([]);
  const [festivalMap, setFestivalMap] = useState({});
  const [submissionMap, setSubmissionMap] = useState({});
  const [setlistMap, setSetlistMap] = useState({});
  const [resultsMap, setResultsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'festivals';
  }); // 'festivals' | 'myshows' | 'rivalry' | 'backstage' | 'greenroom'
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [modal, setModal] = useState(null); // 'detail' | 'submit' | 'setlist'
  const [lineupArtists, setLineupArtists] = useState([]);
  const [activeFestivalInstanceId, setActiveFestivalInstanceId] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [allFestivals, setAllFestivals] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [, setGreenRoomRecords] = useState([]);
  const [lineupSlotMap, setLineupSlotMap] = useState({});
  const [completedPerformedInstance, setCompletedPerformedInstance] = useState(null); // for green room tab
  const [loadError, setLoadError] = useState(null);

  const goBack = () => {
    if (onNavigate) onNavigate('/Career');
    else navigate('/Career');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Get profile
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) { setLoading(false); return; }
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const p = profiles?.[0];
      if (!p) { setLoading(false); return; }
      setProfile(p);

      // Fetch all festival instances in canonical chronological order (039-4 fix)
      const { data: allInstData } = await supabaseClient
        .from('festival_instances')
        .select('*, festival:festivals(*)')
        .order('in_game_year', { ascending: true })
        .order('window_week', { ascending: true })
        .limit(50);

      const allInstances = allInstData || [];
      setInstances(allInstances);

      // Build festival map
      const fMap = {};
      for (const inst of allInstances) {
        if (inst.festival) fMap[inst.festival_id] = inst.festival;
      }
      setFestivalMap(fMap);

      // Always load the full festival catalog for hub display + fallback
      const { data: catalogData } = await supabaseClient
        .from('festivals')
        .select('id, code, name, region, brand_posture, booking_philosophy, seasonal_windows, day_count, lanes, genre_weights, culture_identity')
        .eq('is_active', true)
        .order('created_at');
      setAllFestivals(catalogData || []);

      // Try to get current game turn for year/week strip
      let gs = null;
      try {
        const { data: gsData } = await supabaseClient
          .from('turn_state')
          .select('global_turn_id, last_completed_turn_id')
          .eq('id', 1)
          .maybeSingle();
        gs = gsData;
        const displayTurn = gs?.global_turn_id ?? gs?.last_completed_turn_id ?? 0;
        setCurrentTurn(displayTurn);
      } catch { /* non-fatal */ }

      const effectiveTurn = gs?.global_turn_id ?? gs?.last_completed_turn_id ?? 0;
      const displayInstances = allInstances.map((inst) => ({
        ...inst,
        status: getEffectiveFestivalStatus(inst, effectiveTurn),
      }));

      const instanceIds = allInstances.map((i) => i.id);
      if (!instanceIds.length) { setLoading(false); return; }

      setInstances(displayInstances);

      // Fetch my submissions
      const { data: subData } = await supabaseClient
        .from('festival_submissions')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds);

      const sMap = {};
      for (const sub of (subData || [])) sMap[sub.festival_instance_id] = sub;
      setSubmissionMap(sMap);

      // Fetch my setlists
      const { data: slData } = await supabaseClient
        .from('festival_setlists')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds);

      const slMap = {};
      for (const sl of (slData || [])) slMap[sl.festival_instance_id] = sl;
      setSetlistMap(slMap);

      // Fetch my results
      const { data: resultData } = await supabaseClient
        .from('festival_performance_results')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds)
        .order('resolved_turn_id', { ascending: true });

      const rMap = {};
      for (const r of (resultData || [])) {
        if (!rMap[r.festival_instance_id]) rMap[r.festival_instance_id] = [];
        rMap[r.festival_instance_id].push(r);
      }
      setResultsMap(rMap);

      // Fetch lineup slot data (selection_weight + selected_turn_id) for my submissions
      const mySubInstanceIds = (subData || []).map((s) => s.festival_instance_id);
      if (mySubInstanceIds.length) {
        const { data: slotData } = await supabaseClient
          .from('festival_lineup_slots')
          .select('festival_instance_id, lane, selection_weight, selected_turn_id, artist_id')
          .eq('artist_id', p.id)
          .in('festival_instance_id', mySubInstanceIds);
        const slMap = {};
        for (const sl of (slotData || [])) slMap[sl.festival_instance_id] = sl;
        setLineupSlotMap(slMap);
      }

      // Fetch festival history from archive table
      const { data: histData } = await supabaseClient
        .from('festival_applications')
        .select('*, festival_instance:festival_instances(id, festival_id, in_game_year, window_week, festival:festivals(name, region))')
        .eq('artist_id', p.id)
        .eq('status', 'completed')
        .order('archived_at', { ascending: false })
        .limit(15);
      setHistoryRecords(histData || []);

      const { data: greenRoomData } = await supabaseClient
        .from('festival_applications')
        .select('festival_instance_id, status, green_room_viewed_at')
        .eq('artist_id', p.id);
      setGreenRoomRecords(greenRoomData || []);

      // Phase 3: Find most recent COMPLETE festival the player performed at (Green Room)
      const recentComplete = selectCurrentGreenRoomInstance(displayInstances, rMap, greenRoomData || []);
      setCompletedPerformedInstance(recentComplete);

      // Phase 2: Find active festival where player is in lineup (LOCKED or LIVE)
      const activeInst = displayInstances.find((i) =>
        ['LOCKED', 'LIVE'].includes(i.status) && sMap[i.id]?.status === 'SELECTED'
      );
      if (activeInst) {
        setActiveFestivalInstanceId(activeInst.id);

        // Fetch lineup artists for this festival
        const { data: slots } = await supabaseClient
          .from('festival_lineup_slots')
          .select('artist_id, lane, secret_stage_unlocked')
          .eq('festival_instance_id', activeInst.id)
          .not('artist_id', 'is', null);

        if (slots?.length) {
          const artistIds = slots.map((s) => s.artist_id);
          const { data: lineupProfiles } = await supabaseClient
            .from('profiles')
            .select('id, artist_name, genre, career_stage, clout')
            .in('id', artistIds);
          const slotMap = new Map(slots.map((slot) => [slot.artist_id, slot]));
          setLineupArtists((lineupProfiles || []).map((artist) => ({
            ...artist,
            lane: slotMap.get(artist.id)?.lane || null,
            secret_stage_unlocked: !!slotMap.get(artist.id)?.secret_stage_unlocked,
          })));
        } else {
          setLineupArtists([]);
        }

        // Find next unresolved day index that hasn't passed its resolve turn
        const activeTurn = gs?.last_completed_turn_id ?? gs?.global_turn_id ?? 0;
        const { data: days } = await supabaseClient
          .from('festival_instance_days')
          .select('day_index, status, resolve_turn_id')
          .eq('festival_instance_id', activeInst.id)
          .eq('status', 'SCHEDULED')
          .gt('resolve_turn_id', activeTurn)
          .order('day_index', { ascending: true })
          .limit(1);

        setActiveDayIndex(days?.[0]?.day_index || null);
      } else {
        setActiveFestivalInstanceId(null);
        setLineupArtists([]);
        setActiveDayIndex(null);
      }

    } catch (e) {
      console.error('[AmplifiApp] load error', e);
      setLoadError(e?.message || 'Failed to load festival data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // BUG 3 FIX: Auto-route to Green Room when there's an unseen completed performance
  useEffect(() => {
    if (completedPerformedInstance && tab !== 'greenroom') {
      setTab('greenroom');
    }
  }, [completedPerformedInstance?.id]); // Only route when instance ID changes

  // Derive tab content
  const openFestivals = instances.filter((i) => i.status === 'OPEN');
  const upcomingFestivals = instances.filter((i) => i.status === 'SCHEDULED');
  const liveFestivals = instances.filter((i) => i.status === 'LIVE');
  const lockedFestivals = instances.filter((i) => i.status === 'LOCKED');
  const completedFestivals = instances.filter((i) => i.status === 'COMPLETE');
  const myInstances = instances.filter((i) => submissionMap[i.id] && i.status !== 'COMPLETE');
  const isInActiveLineup = !!activeFestivalInstanceId;

  // Hub display helpers
  const hasActiveInstances = liveFestivals.length > 0 || openFestivals.length > 0
    || lockedFestivals.length > 0 || upcomingFestivals.length > 0;
  const currentYear = Math.floor(currentTurn / 365);
  const currentWeek = Math.ceil(((currentTurn % 365) + 1) / 7) || 1;

  // Catalog fallbacks — shown when no instances exist yet
  const featuredFromCatalog = allFestivals
    .filter((f) => (f.booking_philosophy?.prestige_weight || 0) >= 0.6)
    .slice(0, 6);
  const upcomingFromCatalog = allFestivals
    .slice()
    .sort((a, b) => {
      const aw = Math.min(...(a.seasonal_windows || [{ week: 999 }]).map((w) => w.week));
      const bw = Math.min(...(b.seasonal_windows || [{ week: 999 }]).map((w) => w.week));
      return aw - bw;
    });

  const dismissGreenRoom = useCallback(async () => {
    if (!completedPerformedInstance?.id || !profile?.id) return;

    const viewedAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from('festival_applications')
      .update({ green_room_viewed_at: viewedAt })
      .eq('festival_instance_id', completedPerformedInstance.id)
      .eq('artist_id', profile.id);

    if (error) throw error;

    setGreenRoomRecords((prev) => {
      const next = [...prev];
      const idx = next.findIndex((record) => record.festival_instance_id === completedPerformedInstance.id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], green_room_viewed_at: viewedAt };
        return next;
      }
      next.push({
        festival_instance_id: completedPerformedInstance.id,
        status: 'completed',
        green_room_viewed_at: viewedAt,
      });
      return next;
    });
    setHistoryRecords((prev) => prev.map((record) => record.festival_instance_id === completedPerformedInstance.id
      ? { ...record, green_room_viewed_at: viewedAt }
      : record));
    setCompletedPerformedInstance(null);
    setTab('history');
  }, [completedPerformedInstance?.id, profile?.id]);

  function openDetail(inst) {
    setSelectedInstance(inst);
    setModal('detail');
  }

  function closeModal() {
    setModal(null);
    setSelectedInstance(null);
  }

  function afterSubmit() {
    setModal(null);
    setSelectedInstance(null);
    load();
  }

  function openCatalogDetail(festival) {
    setSelectedInstance(buildFestivalPreviewInstance(festival, currentTurn));
    setModal('detail');
  }

  const selFestival = selectedInstance ? (selectedInstance.festival || festivalMap[selectedInstance.festival_id]) : null;

  return (
    <div className="amp-app">
      <G />

      {/* Top bar */}
      <div className="amp-topbar">
        <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} color="#a855f7" />
          <span className="amp-title">Amplifi</span>
        </div>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="amp-tab-bar">
        <button className={`amp-tab${tab === 'festivals' ? ' active' : ''}`} onClick={() => setTab('festivals')}>Festivals</button>
        <button className={`amp-tab${tab === 'myshows' ? ' active' : ''}`} onClick={() => setTab('myshows')}>
          My Shows {myInstances.length > 0 && `(${myInstances.length})`}
        </button>
        <button className={`amp-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          🏆 History
        </button>
        {isInActiveLineup && (
          <button className={`amp-tab${tab === 'rivalry' ? ' active' : ''}`} onClick={() => setTab('rivalry')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            ⚔️ Rivalry
          </button>
        )}
        {isInActiveLineup && (
          <button className={`amp-tab${tab === 'backstage' ? ' active' : ''}`} onClick={() => setTab('backstage')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            🤝 Backstage
          </button>
        )}
        {completedPerformedInstance && (
          <button className={`amp-tab${tab === 'greenroom' ? ' active' : ''}`} onClick={() => setTab('greenroom')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            🎤 Green Room
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.3)' }}>
          <Loader2 size={24} style={{ margin: '0 auto 10px', display: 'block', animation: 'spin 1s linear infinite' }} />
          Loading festivals…
        </div>
      )}

      {loadError && !loading && (
        <div style={{ margin: '12px 18px', padding: '12px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{loadError}</span>
          <button onClick={load} style={{ background: 'rgba(239,68,68,.2)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 12px', color: '#fca5a5', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Retry</button>
        </div>
      )}

      {!loading && tab === 'festivals' && (
        <div style={{ paddingBottom: 40 }}>

          {/* Year / week strip */}
          {currentTurn > 0 && (
            <div className="amp-year-strip">
              <Calendar size={13} color="#a855f7" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)' }}>
                Year {currentYear + 1}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>·</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>Week {currentWeek}</span>
            </div>
          )}

          {/* My active submissions quick-strip */}
          {myInstances.length > 0 && (
            <div style={{ padding: '12px 18px 0' }}>
              <button
                onClick={() => setTab('myshows')}
                style={{ width: '100%', padding: '10px 16px', background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)', borderRadius: 12, color: '#d8b4fe', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>🎤 {myInstances.length} active application{myInstances.length > 1 ? 's' : ''}</span>
                <span style={{ fontSize: 11, opacity: .6 }}>My Shows →</span>
              </button>
            </div>
          )}

          {/* Live Now — big featured scroll */}
          {liveFestivals.length > 0 && (
            <div style={{ paddingTop: 18 }}>
              <div className="amp-section-label" style={{ paddingLeft: 18, color: '#ef4444', marginBottom: 10 }}>🔴 Live Now</div>
              <div className="amp-feat-scroll">
                {liveFestivals.map((inst) => (
                  <FeaturedCard
                    key={inst.id}
                    instance={inst}
                    festival={inst.festival || festivalMap[inst.festival_id] || {}}
                    profile={profile}
                    mySubmission={submissionMap[inst.id]}
                    onClick={() => openDetail(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Featured Festivals — always show, either from instances or catalog */}
          {(openFestivals.length > 0 || featuredFromCatalog.length > 0) && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title={openFestivals.length > 0 ? '⭐ Featured Festivals' : '⭐ Featured Festivals'}
                festivals={(openFestivals.length > 0 ? openFestivals : featuredFromCatalog).map((item) => ({
                  instance: !!item.status ? item : null,
                  festival: !!item.status ? (item.festival || festivalMap[item.festival_id] || {}) : item,
                  isInstance: !!item.status,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  if (festivalObj.isInstance) {
                    openDetail(festivalObj.originalItem);
                  } else {
                    openCatalogDetail(festivalObj.originalItem);
                  }
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {/* Upcoming — always show, either from instances or catalog */}
          {(upcomingFestivals.length > 0 || upcomingFromCatalog.length > 0) && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title="📅 Upcoming Festivals"
                festivals={(upcomingFestivals.length > 0 ? upcomingFestivals : upcomingFromCatalog).map((item) => ({
                  instance: !!item.status ? item : null,
                  festival: !!item.status ? (item.festival || festivalMap[item.festival_id] || {}) : item,
                  isInstance: !!item.status,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  if (festivalObj.isInstance) {
                    openDetail(festivalObj.originalItem);
                  } else {
                    openCatalogDetail(festivalObj.originalItem);
                  }
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {/* Festival Highlights — past/completed festivals */}
          {completedFestivals.length > 0 && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title="🎉 Festival Highlights"
                festivals={completedFestivals.map((item) => ({
                  instance: item,
                  festival: item.festival || festivalMap[item.festival_id] || {},
                  isInstance: true,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  openDetail(festivalObj.originalItem);
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {/* True empty state — no instances AND no catalog data */}
          {!hasActiveInstances && !allFestivals.length && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
              <Radio size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
              No festivals active right now.<br />Check back next season.
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'myshows' && (
        <div style={{ paddingBottom: 40 }}>
          {myInstances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
              <Music size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
              You haven't applied to any festivals yet.
            </div>
          ) : (
            <div className="amp-section">
              <div className="amp-section-label">Your Applications</div>
              {myInstances.map((inst) => (
                <FestivalCard
                  key={inst.id}
                  instance={inst}
                  festival={inst.festival || festivalMap[inst.festival_id] || {}}
                  profile={profile}
                  mySubmission={submissionMap[inst.id]}
                  lineupSlot={lineupSlotMap[inst.id]}
                  onClick={() => openDetail(inst)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 3: Green Room Tab */}
      {!loading && tab === 'greenroom' && completedPerformedInstance && (
        <FestivalGreenRoom
          instanceId={completedPerformedInstance.id}
          festivalName={completedPerformedInstance.festival?.name || festivalMap[completedPerformedInstance.festival_id]?.name}
          profile={profile}
          onDismiss={dismissGreenRoom}
        />
      )}

      {/* Phase 2: Rivalry Tab */}
      {!loading && tab === 'rivalry' && isInActiveLineup && (
        <RivalryTab
          profile={profile}
          festivalInstanceId={activeFestivalInstanceId}
          lineupArtists={lineupArtists}
          activeDayIndex={activeDayIndex}
        />
      )}

      {/* Phase 2: Backstage Tab */}
      {!loading && tab === 'backstage' && isInActiveLineup && (
        <BackstageTab
          profile={profile}
          festivalInstanceId={activeFestivalInstanceId}
          lineupArtists={lineupArtists}
        />
      )}

      {/* Modals */}
      {modal === 'detail' && selectedInstance && selFestival && (
        <FestivalDetail
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          mySubmission={submissionMap[selectedInstance.id]}
          mySetlist={setlistMap[selectedInstance.id]}
          myResults={resultsMap[selectedInstance.id]}
          onClose={closeModal}
          onSubmit={() => setModal('submit')}
          onSetlist={() => setModal('setlist')}
          onViewGreenRoom={() => { closeModal(); setTab('greenroom'); }}
          onEditSubmission={() => setModal('submit')}
        />
      )}

      {/* Festival History Tab */}
      {!loading && tab === 'history' && (
        <FestivalHistoryTab records={historyRecords} />
      )}

      {modal === 'submit' && selectedInstance && selFestival && (
        <FestivalSubmit
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          currentTurn={currentTurn}
          onClose={() => setModal('detail')}
          onSuccess={afterSubmit}
        />
      )}

      {modal === 'setlist' && selectedInstance && selFestival && (
        <FestivalSetlistEditor
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          mySetlist={setlistMap[selectedInstance.id]}
          mySubmission={submissionMap[selectedInstance.id]}
          onClose={() => setModal('detail')}
          onSaved={afterSubmit}
        />
      )}
    </div>
  );
}
