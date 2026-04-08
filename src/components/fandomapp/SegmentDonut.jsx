import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Heart, Users, Zap, Star, TrendingDown, Radio, Shield, Megaphone, Flame, Scissors, Skull, TrendingUp, AlertTriangle, Music } from "lucide-react";
import { fmt } from "@/utils/numberFormat";

// ─── Config ──────────────────────────────────────────────────────────────────

const SEGMENT_ORDER = ["og", "stan", "core", "casual", "trend_chaser", "critic"];

const SEGMENT_CONFIG = {
  og:           { icon: Crown,        color: "#fbbf24", tab: "OGs" },
  stan:         { icon: Star,         color: "#f472b6", tab: "Stans" },
  core:         { icon: Heart,        color: "#a78bfa", tab: "Core" },
  casual:       { icon: Users,        color: "#60a5fa", tab: "Casuals" },
  trend_chaser: { icon: Zap,          color: "#fb923c", tab: "Trends" },
  critic:       { icon: TrendingDown, color: "#f87171", tab: "Haters" },
};

const LABOR_CONFIG = {
  streaming: { label: "Streams",  Icon: Radio,     color: "#34d399" },
  defense:   { label: "Defense",  Icon: Shield,    color: "#60a5fa" },
  promo:     { label: "Promo",    Icon: Megaphone, color: "#a78bfa" },
  meme:      { label: "Memes",    Icon: Flame,     color: "#fb923c" },
  clipping:  { label: "Clips",    Icon: Scissors,  color: "#f472b6" },
  toxicity:  { label: "Toxicity", Icon: Skull,     color: "#f87171" },
};

const SEGMENT_LABOR_TYPES = {
  og:           ["streaming", "defense", "promo"],
  core:         ["streaming", "defense", "promo", "meme"],
  casual:       ["streaming", "meme"],
  trend_chaser: ["streaming", "promo", "meme"],
  stan:         ["streaming", "defense", "promo", "meme", "clipping"],
  critic:       ["meme", "toxicity"],
};

const SEGMENT_FLAVOR = {
  og:           "Your day ones. They ride the hardest, stream the loudest, and defend you when nobody else will. Take care of them — once they're gone, they're gone.",
  stan:         "Maximum chaos energy. They'll stream all night, clip everything, and go to war for you. Push too hard and they'll burn your whole house down.",
  core:         "Your backbone. Loyal, consistent, always showing up. Not as loud as the stans, but they'll be here long after the hype dies.",
  casual:       "They vibe with you, but they're not married to you. Big numbers, low commitment — they stream when it's easy and dip when it's not.",
  trend_chaser: "Here because you're hot right now. They'll promo you, meme you, stream you — until the next thing comes along.",
  critic:       "The haters. They drag your name, spread toxicity, and make everything harder. You can't direct them — you can only outlast them.",
};

const DIRECTIVE_OPTIONS = [
  { key: "push",   label: "Push",   color: "#fb923c", desc: "More output, faster burnout" },
  { key: "steady", label: "Steady", color: "#60a5fa", desc: "Normal pace" },
  { key: "rest",   label: "Rest",   color: "#34d399", desc: "No output, full recovery" },
];

const ARMY_SUBTABS = ["segments", "regions", "sentiment"];
const REGION_COLORS = {
  "United States": "#3b82f6",
  "UK": "#ec4899",
  "Europe": "#8b5cf6",
  "Canada": "#ef4444",
  "Asia": "#f59e0b",
  "Latin America": "#10b981",
  "Africa": "#f97316",
  "Oceania": "#06b6d4",
};

const SIGNAL_CONFIG = [
  { key: "loyalBaseShare", label: "Loyal Base", color: "#C9A84C", unit: "share" },
  { key: "superfanPressure", label: "Superfan Pressure", color: "#f472b6", unit: "share" },
  { key: "trendAmplification", label: "Trend Amplification", color: "#fb923c", unit: "share" },
  { key: "criticDrag", label: "Critic Drag", color: "#f87171", unit: "share" },
  { key: "audienceDepth", label: "Audience Depth", color: "#60a5fa", unit: "share" },
  { key: "brandTrust", label: "Brand Trust", color: "#34d399", unit: "score" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSegmentHealth(segment) {
  const laborTypes = SEGMENT_LABOR_TYPES[segment.segment_type] || [];
  const fatigueMap = segment.fatigue || {};
  const maxFatigue = Math.max(0, ...laborTypes.map(lt => fatigueMap[lt] || 0));
  const strikeCount = laborTypes.filter(lt => (fatigueMap[lt] || 0) >= 90).length;
  if (strikeCount > 0) return { label: "On Strike", color: "#EF5350", icon: "🚨" };
  if (maxFatigue >= 70) return { label: "Exhausted", color: "#F7A54B", icon: "⚠️" };
  if (maxFatigue >= 45) return { label: "Tired", color: "#fbbf24", icon: "😮‍💨" };
  if ((segment.directive || "steady") === "rest") return { label: "Resting", color: "#34d399", icon: "😴" };
  return { label: "Active", color: "#4CAF82", icon: "✓" };
}

function getFatigueLabel(fatigue) {
  if (fatigue >= 90) return { text: "On Strike", color: "#EF5350" };
  if (fatigue >= 70) return { text: "Burning Out", color: "#F7A54B" };
  if (fatigue >= 45) return { text: "Tiring", color: "#fbbf24" };
  if (fatigue >= 20) return { text: "Working", color: "#60a5fa" };
  return { text: "Fresh", color: "#4CAF82" };
}

function buildAlert(segment, isDarkMode) {
  const cfg = SEGMENT_CONFIG[segment.segment_type];
  const laborTypes = SEGMENT_LABOR_TYPES[segment.segment_type] || [];
  const fatigueMap = segment.fatigue || {};
  if (isDarkMode) return { text: "You went dark. Everyone's recovering. Sit tight.", color: "#a78bfa" };

  const strikeTypes = laborTypes.filter(lt => (fatigueMap[lt] || 0) >= 90);
  if (strikeTypes.length > 0) {
    if (segment.segment_type === "critic") {
      return { text: "Your haters are too tired to hate. Enjoy the peace while it lasts.", color: "#4CAF82" };
    }
    const names = strikeTypes.map(lt => LABOR_CONFIG[lt].label.toLowerCase()).join(" & ");
    return { text: `Your ${cfg.tab} are burnt out on ${names}. Set them to rest before you lose them.`, color: "#EF5350" };
  }

  const exhaustedTypes = laborTypes.filter(lt => { const f = fatigueMap[lt] || 0; return f >= 70 && f < 90; });
  if (exhaustedTypes.length > 0) {
    if (segment.segment_type === "critic") {
      return { text: "The haters are running out of steam. Good.", color: "#fbbf24" };
    }
    const names = exhaustedTypes.map(lt => LABOR_CONFIG[lt].label.toLowerCase()).join(" & ");
    return { text: `${cfg.tab} ${names} is running on fumes. Ease up before they walk.`, color: "#F7A54B" };
  }

  const morale = Number(segment.morale) || 0;
  if (morale < 30 && segment.segment_type !== "critic") {
    return { text: `${cfg.tab} morale is in the gutter. They're not feeling you right now.`, color: "#EF5350" };
  }
  return null;
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function SegmentDetail({ segment, onSetDirective, isDarkMode }) {
  const cfg = SEGMENT_CONFIG[segment.segment_type];
  const laborTypes = SEGMENT_LABOR_TYPES[segment.segment_type] || [];
  const fatigueMap = segment.fatigue || {};
  const currentDirective = segment.directive || "steady";
  const isCritic = segment.segment_type === "critic";
  const morale = Number(segment.morale) || 0;
  const moraleColor = morale >= 70 ? "#4CAF82" : morale >= 40 ? "#F7A54B" : "#EF5350";
  const alert = buildAlert(segment, isDarkMode);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: `${cfg.color}04`, border: `1px solid ${cfg.color}10` }}>
      {/* Top: flavor text + alert — scrollable */}
      <div className="px-3 pt-3 pb-2 max-h-[88px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        <p className="text-[11px] text-white/50 leading-relaxed mb-0">
          {SEGMENT_FLAVOR[segment.segment_type]}
        </p>
      </div>

      {alert && (
        <div className="mx-3 mb-2 flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-[10px] leading-snug"
          style={{ background: `${alert.color}08`, border: `1px solid ${alert.color}15` }}>
          <AlertTriangle size={10} color={alert.color} className="flex-shrink-0 mt-0.5" />
          <span style={{ color: alert.color }}>{alert.text}</span>
        </div>
      )}

      {/* Bottom: health bars + morale + directives */}
      <div className="px-3 pb-3 pt-1.5" style={{ borderTop: `1px solid ${cfg.color}08` }}>
        <div className="flex items-start gap-3">
          {/* Health bars */}
          <div className="flex-1 flex flex-col gap-1.5">
            {laborTypes.map(lt => {
              const lc = LABOR_CONFIG[lt];
              const LIcon = lc.Icon;
              const fatigue = fatigueMap[lt] || 0;
              const healthPct = Math.max(0, 100 - fatigue);
              const fl = getFatigueLabel(fatigue);
              return (
                <div key={lt} className="flex items-center gap-1.5">
                  <LIcon size={9} color={lc.color} className="flex-shrink-0" />
                  <span className="text-[9px] text-white/45 w-[40px]">{lc.label}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${healthPct}%`, background: fl.color }} />
                  </div>
                  <span className="text-[8px] w-[50px] text-right font-medium" style={{ color: fl.color }}>{fl.text}</span>
                </div>
              );
            })}
          </div>

          {/* Morale badge */}
          <div className="flex-shrink-0 flex flex-col items-center pt-0.5" style={{ minWidth: 44 }}>
            <span className="text-[7px] text-white/40 uppercase tracking-wider mb-0.5">Morale</span>
            <span className="text-lg font-bold leading-none" style={{ color: moraleColor }}>{morale}</span>
            <span className="text-[8px] mt-0.5" style={{ color: moraleColor }}>
              {morale >= 70 ? "Happy" : morale >= 40 ? "Okay" : "Low"}
            </span>
          </div>
        </div>

        {/* Sentiment */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] w-14 text-white/45">Sentiment</span>
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (segment.sentiment ?? 50) < 25 ? 'bg-red-500' :
                (segment.sentiment ?? 50) > 75 ? 'bg-emerald-400' :
                'bg-amber-400'
              }`}
              style={{ width: `${segment.sentiment ?? 50}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono w-6 text-right ${
            (segment.sentiment ?? 50) < 25 ? 'text-red-400' :
            (segment.sentiment ?? 50) > 75 ? 'text-emerald-400' :
            'text-zinc-400'
          }`}>{segment.sentiment ?? 50}</span>
        </div>

        {/* Directive buttons */}
        {!isCritic && onSetDirective && (
          <div className="mt-2.5">
            {isDarkMode && (
              <div className="text-[9px] text-white/40 mb-1 italic">Dark mode — directives paused</div>
            )}
            <div className="flex gap-1.5">
              {DIRECTIVE_OPTIONS.map(d => {
                const isActive = currentDirective === d.key;
                return (
                  <button key={d.key}
                    disabled={isDarkMode}
                    onClick={() => !isDarkMode && onSetDirective(segment.segment_type, d.key)}
                    className={`fandom-action-pill fandom-action-pill--block ${isActive ? "fandom-action-pill--active" : ""} flex flex-col items-center py-1.5 px-1`}
                    style={{
                      "--pill-accent": d.color,
                      "--pill-accent-soft": `${d.color}15`,
                      "--pill-accent-border": `${d.color}35`,
                    }}
                  >
                    <span className="text-[10px] font-semibold" style={{ color: isActive ? d.color : "rgba(255,255,255,0.45)" }}>
                      {d.label}
                    </span>
                    <span className="text-[7px] mt-0.5" style={{ color: isActive ? `${d.color}90` : "rgba(255,255,255,0.3)" }}>
                      {d.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isCritic && (
          <div className="text-[9px] text-white/40 italic text-center mt-2">
            You can't direct the haters. They do what they want.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pulse generation ────────────────────────────────────────────────────────

const CHATTER_ICONS = {
  boost: TrendingUp, defend: Shield, criticize: TrendingDown,
  hype: Flame, love: Heart, warning: AlertTriangle,
  promo: Megaphone, release: Music, energy: Zap, stan: Star,
};
const CHATTER_COLORS = { positive: "#34d399", neutral: "#a78bfa", negative: "#f87171", warning: "#fbbf24", hype: "#f472b6" };

function generatePulse(segments, wars, controversies, fandom) {
  const items = [];
  const segMap = Object.fromEntries((segments || []).map(s => [s.segment_type, s]));

  for (const seg of segments) {
    const health = getSegmentHealth(seg);
    if (health.label === "On Strike") {
      const c = SEGMENT_CONFIG[seg.segment_type];
      items.push({ icon: "warning", tone: "negative", text: `${c?.tab || seg.segment_type} on strike`, priority: 8 });
    }
  }
  for (const war of (wars || []).slice(0, 1)) {
    items.push({ icon: war.intensity >= 70 ? "hype" : "defend", tone: war.intensity >= 70 ? "negative" : "warning",
      text: war.intensity >= 70 ? `Fan war critical (${war.intensity})` : "Fan war — defense deployed", priority: 7 });
  }
  for (const c of (controversies || []).slice(0, 1)) {
    if (c.phase === "peak" || c.phase === "spread") {
      items.push({ icon: "warning", tone: "negative", text: `Controversy ${c.phase === "peak" ? "peaked" : "spreading"}`, priority: 7 });
    }
  }
  const toxicity = Number(fandom?.toxicity_score) || 0;
  if (toxicity >= 70) items.push({ icon: "criticize", tone: "negative", text: `Toxicity ${toxicity}`, priority: 6 });
  if (fandom?.identity_crisis_active) items.push({ icon: "warning", tone: "negative", text: "Identity crisis", priority: 9 });

  const stanSeg = segMap.stan;
  if (stanSeg && (Number(stanSeg.count) || 0) > 0) {
    const output = Object.values(stanSeg.labor_output || {}).reduce((s, v) => s + (v || 0), 0);
    if (output > 0) items.push({ icon: "stan", tone: "hype", text: "Stans going hard", priority: 2 });
  }
  const ogSeg = segMap.og;
  if (ogSeg && (Number(ogSeg.loyalty) || 0) >= 80) {
    items.push({ icon: "love", tone: "positive", text: "OG loyalty strong", priority: 1 });
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

function normalizePercent(value) {
  const n = Number(value || 0);
  if (n <= 1) return Math.round(n * 1000) / 10;
  return Math.round(n * 10) / 10;
}

function roundSignal(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

function clampSignal(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function buildFallbackCanonicalSignals(segments = [], fandom = null) {
  const segmentCounts = {
    og: 0,
    core: 0,
    casual: 0,
    trend_chaser: 0,
    stan: 0,
    critic: 0,
  };

  for (const segment of segments) {
    const segmentType = String(segment?.segment_type || "").trim();
    if (!(segmentType in segmentCounts)) continue;
    segmentCounts[segmentType] += Math.max(0, Number(segment?.count) || 0);
  }

  const totalAudience = Object.values(segmentCounts).reduce((sum, value) => sum + value, 0);
  const segmentShares = totalAudience > 0
    ? Object.fromEntries(Object.entries(segmentCounts).map(([segmentType, count]) => [segmentType, roundSignal(count / totalAudience, 4)]))
    : { og: 0, core: 0, casual: 0, trend_chaser: 0, stan: 0, critic: 0 };

  const weightedAverage = (field) => {
    if (totalAudience <= 0) return 50;
    let total = 0;
    for (const segment of segments) {
      const count = Math.max(0, Number(segment?.count) || 0);
      total += count * clampSignal(segment?.[field], 0, 100);
    }
    return roundSignal(total / totalAudience, 3);
  };

  const averageLoyalty = weightedAverage("loyalty");
  const averageMorale = weightedAverage("morale");
  const fanMorale = roundSignal(clampSignal(fandom?.fan_morale ?? averageMorale, 0, 100), 3);
  const brandTrust = roundSignal(clampSignal(fandom?.brand_trust ?? 50, 0, 100), 3);
  const toxicityPressure = roundSignal(clampSignal((Number(fandom?.toxicity_score) || 0) / 100, 0, 1), 3);
  const loyalBaseShare = roundSignal(clampSignal(segmentShares.og + segmentShares.core, 0, 1), 3);
  const superfanPressure = roundSignal(clampSignal(
    segmentShares.stan
      + (segmentShares.og * 0.25)
      + ((averageLoyalty / 100) * 0.10)
      + ((fanMorale / 100) * 0.05),
    0,
    1,
  ), 3);
  const trendAmplification = roundSignal(clampSignal(
    segmentShares.trend_chaser
      + (segmentShares.casual * 0.30)
      + ((brandTrust / 100) * 0.05),
    0,
    1,
  ), 3);
  const criticDrag = roundSignal(clampSignal(
    (segmentShares.critic * 0.70)
      + (toxicityPressure * 0.20)
      + (Math.max(0, 0.5 - (brandTrust / 100)) * 0.20),
    0,
    1,
  ), 3);
  const audienceDepth = roundSignal(clampSignal(
    (loyalBaseShare * 0.50)
      + (segmentShares.stan * 0.15)
      + ((averageLoyalty / 100) * 0.20)
      + ((fanMorale / 100) * 0.10)
      - (criticDrag * 0.15),
    0,
    1,
  ), 3);

  return {
    totalAudience,
    segmentCounts,
    segmentShares,
    loyalBaseShare,
    superfanPressure,
    trendAmplification,
    criticDrag,
    audienceDepth,
    averageLoyalty,
    averageMorale,
    fanMorale,
    brandTrust,
    toxicityPressure,
  };
}

function getSentimentTone(score) {
  const n = Number(score || 0);
  if (n >= 80) return { label: "Adoring", color: "#f472b6" };
  if (n >= 60) return { label: "Loyal", color: "#34d399" };
  if (n >= 40) return { label: "Curious", color: "#F7A54B" };
  if (n >= 20) return { label: "Lukewarm", color: "#a78bfa" };
  return { label: "Detached", color: "#f87171" };
}

function RegionsPanel({ fanProfile }) {
  const totalListeners = Number(fanProfile?.monthly_listeners || 0);
  const regionShare = fanProfile?.region_share;
  const topRegions = Array.isArray(fanProfile?.top_regions) ? fanProfile.top_regions : [];

  const regions = Array.isArray(regionShare)
    ? regionShare.map((region) => ({
        name: region?.region || region?.name || "Unknown",
        pct: normalizePercent(region?.percentage || region?.pct || 0),
        listeners: Number(region?.listeners || 0),
      }))
    : Object.entries(regionShare || {}).map(([name, share]) => ({
        name,
        pct: normalizePercent(share),
        listeners: totalListeners > 0 ? Math.round(totalListeners * (normalizePercent(share) / 100)) : 0,
      }));

  const fallbackTopRegions = regions
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const displayRegions = topRegions.length > 0
    ? topRegions.map((region) => ({
        name: region?.region || region?.name || region?.market || "Unknown",
        pct: normalizePercent(region?.percentage || region?.pct || 0),
        listeners: Number(region?.listeners || 0),
      }))
    : fallbackTopRegions;

  if (displayRegions.length === 0) {
    return <div className="text-[10px] text-white/35 py-4 text-center">Regional fan distribution is still forming.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Monthly</div>
          <div className="text-sm font-black text-white">{fmt(totalListeners)}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Top Region</div>
          <div className="text-sm font-black text-white truncate">{displayRegions[0]?.name || "—"}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Coverage</div>
          <div className="text-sm font-black text-white">{displayRegions.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        {displayRegions.map((region) => (
          <div key={region.name} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="text-[11px] font-bold text-white/85">{region.name}</div>
              <div className="text-[11px] font-extrabold" style={{ color: REGION_COLORS[region.name] || "#a78bfa" }}>{region.pct.toFixed(1)}%</div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, region.pct))}%`, background: REGION_COLORS[region.name] || "#a78bfa" }}
              />
            </div>
            <div className="text-[10px] text-white/35 mt-1.5">{fmt(region.listeners)} listeners</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSignalValue(entry, value) {
  if (entry.unit === "score") return `${Math.round(value)}`;
  return `${Math.round(clampSignal(value, 0, 1) * 100)}%`;
}

function SentimentPanel({ fanProfile, canonicalSignals }) {
  const overallSentiment = Number(fanProfile?.overall_sentiment || 0);
  const retentionRate = Number(fanProfile?.retention_rate || 0);
  const growthTrend = Number(fanProfile?.listener_growth_trend || 0);
  const sentimentTone = getSentimentTone(overallSentiment);
  const signalEntries = SIGNAL_CONFIG.map((entry) => ({
    ...entry,
    value: Number(canonicalSignals?.[entry.key] || 0),
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Sentiment</div>
          <div className="text-sm font-black" style={{ color: sentimentTone.color }}>{sentimentTone.label}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Retention</div>
          <div className="text-sm font-black text-white">{Math.round(retentionRate * 100)}%</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Growth</div>
          <div className="text-sm font-black" style={{ color: growthTrend >= 0 ? "#34d399" : "#f87171" }}>{growthTrend > 0 ? "+" : ""}{growthTrend.toFixed(1)}%</div>
        </div>
      </div>

      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="text-[8px] uppercase tracking-widest text-white/25 mb-2">Signal read</div>
        {signalEntries.length === 0 ? (
          <div className="text-[10px] text-white/35">No fandom signal read available yet.</div>
        ) : (
          <div className="space-y-2">
            {signalEntries.map((entry) => {
              const pct = entry.unit === "score"
                ? Math.max(0, Math.min(100, Math.round(entry.value)))
                : Math.max(0, Math.min(100, Math.round(entry.value * 100)));
              return (
                <div key={entry.key}>
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-white/65">{entry.label}</span>
                    <span className="text-white/45">{formatSignalValue(entry, entry.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: entry.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] text-white/35 leading-relaxed px-1">
        {fanProfile?.pr_implications || "Audience sentiment is stable enough to read, but not every signal is equally loud in every market."}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function SegmentDonut({ segments = [], fanProfile, canonicalSignals, onSetDirective, isDarkMode, wars, controversies, fandom }) {
  const [selected, setSelected] = useState(null);
  const [subtab, setSubtab] = useState("segments");

  const segMap = Object.fromEntries(segments.map(s => [s.segment_type, s]));
  const activeTypes = SEGMENT_ORDER.filter(t => (Number(segMap[t]?.count) || 0) > 0);
  const effectiveSelected = selected && activeTypes.includes(selected) ? selected : activeTypes[0] || null;

  const totalFans = segments.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const pulse = useMemo(() => generatePulse(segments, wars, controversies, fandom), [segments, wars, controversies, fandom]);
  const effectiveCanonicalSignals = useMemo(
    () => canonicalSignals || buildFallbackCanonicalSignals(segments, fandom),
    [canonicalSignals, segments, fandom],
  );
  const selectedSeg = effectiveSelected ? segMap[effectiveSelected] : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Fan Army</span>
        <span className="text-xs text-white/50 font-medium">{fmt(totalFans)}</span>
      </div>

      <div className="flex gap-1 mb-3">
        {ARMY_SUBTABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setSubtab(tab)}
            className={`fandom-action-pill ${subtab === tab ? "fandom-action-pill--active" : ""} px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest`}
            style={{
              "--pill-accent": "#a78bfa",
              "--pill-accent-soft": "rgba(167,139,250,0.12)",
              "--pill-accent-border": "rgba(167,139,250,0.28)",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {subtab === "segments" && (
        <>
          {/* Divergence warning */}
          {(() => {
            const activeSegs = segments.filter(s => (Number(s.count) || 0) > 0);
            const hostileSegs = activeSegs.filter(s => (s.sentiment ?? 50) < 25);
            const enthusiasticSegs = activeSegs.filter(s => (s.sentiment ?? 50) > 75);
            const hasDivergence = hostileSegs.length >= 1 && enthusiasticSegs.length >= 1;
            const divergence = hasDivergence
              ? Math.max(...enthusiasticSegs.map(s => s.sentiment)) - Math.min(...hostileSegs.map(s => s.sentiment))
              : 0;
            return divergence > 40 ? (
              <div className="flex items-center gap-2 px-3 py-2 mb-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span className="text-red-400 text-[10px]">⚠️ Fan polarization detected ({divergence}pt divergence)</span>
              </div>
            ) : null;
          })()}

          <div className="flex h-1.5 rounded-full overflow-hidden mb-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
            {activeTypes.map(type => {
              const count = Number(segMap[type]?.count) || 0;
              const pct = totalFans > 0 ? (count / totalFans) * 100 : 0;
              return (
                <div key={type}
                  className="h-full cursor-pointer transition-opacity duration-300"
                  style={{
                    width: `${pct}%`,
                    background: SEGMENT_CONFIG[type].color,
                    opacity: effectiveSelected === type ? 1 : 0.35,
                  }}
                  onClick={() => setSelected(type)}
                />
              );
            })}
          </div>

          <div className="flex gap-0.5 mb-3 -mx-0.5 px-0.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {activeTypes.map(type => {
              const cfg = SEGMENT_CONFIG[type];
              const isActive = effectiveSelected === type;
              const health = segMap[type] ? getSegmentHealth(segMap[type]) : null;
              return (
                <button key={type}
                  onClick={() => setSelected(type)}
                  className={`fandom-action-pill ${isActive ? "fandom-action-pill--active" : ""} flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap flex-shrink-0`}
                  style={{
                    "--pill-accent": cfg.color,
                    "--pill-accent-soft": `${cfg.color}10`,
                    "--pill-accent-border": `${cfg.color}28`,
                  }}
                >
                  {cfg.tab}
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    (segMap[type]?.sentiment ?? 50) < 25 ? 'bg-red-500' :
                    (segMap[type]?.sentiment ?? 50) > 75 ? 'bg-emerald-400' :
                    'bg-zinc-500'
                  }`} />
                  {health && health.label === "On Strike" && (
                    <span className="text-[7px]" style={{ color: health.color }}>🚨</span>
                  )}
                  {health && health.label === "Exhausted" && (
                    <span className="text-[7px]" style={{ color: health.color }}>⚠️</span>
                  )}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {selectedSeg && (
              <motion.div
                key={effectiveSelected}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <SegmentDetail
                  segment={selectedSeg}
                  onSetDirective={onSetDirective}
                  isDarkMode={isDarkMode}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {subtab === "regions" && <RegionsPanel fanProfile={fanProfile} />}
  {subtab === "sentiment" && <SentimentPanel fanProfile={fanProfile} canonicalSignals={effectiveCanonicalSignals} />}

      {/* Pulse — horizontal pills */}
      {pulse.length > 0 && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {pulse.map((item, i) => {
            const IconC = CHATTER_ICONS[item.icon] || Flame;
            const color = CHATTER_COLORS[item.tone] || CHATTER_COLORS.neutral;
            return (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-full flex-shrink-0"
                style={{ background: `${color}08`, border: `1px solid ${color}10` }}>
                <IconC size={9} color={color} />
                <span className="text-[9px] whitespace-nowrap" style={{ color }}>{item.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
