import React, { useState, useEffect, useMemo } from "react";
import {
  Music, DollarSign, Globe, Users, Sparkles, Star,
  BarChart3, Shirt, Clock, ChevronRight,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { fmt } from "@/utils/numberFormat";
import { OUTCOME_DISPLAY_META, isTerminalState, TERMINAL_LIFECYCLE_STATES } from "@/data/lifecycleConstants";
import { normalizeRegion } from "@/lib/regionConstants";

const ALL_REGIONS = ["United States", "Europe", "UK", "Asia", "Latin America", "Africa", "Oceania", "Canada"];

const SOCIAL_PLATFORM_LABELS = {
  vidwave: "VidWave",
  looptok: "LoopTok",
  instavibe: "InstaVibe",
  xpress: "Xpress",
  twitter: "Twitter/X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};



const N = (v) => Number(v) || 0;

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "releases",  label: "Releases",  icon: Music },
  { id: "revenue",   label: "Revenue",   icon: DollarSign },
  { id: "markets",   label: "Markets",   icon: Globe },
  { id: "fans",      label: "Fans",      icon: Users },
  { id: "trends",    label: "Trends",    icon: Sparkles },
];

// ─── Releases Tab ─────────────────────────────────────────────────────────────
function ReleasesTab({ releases }) {
  const bestRelease = useMemo(
    () => [...releases].sort((a, b) => N(b.lifetime_streams) - N(a.lifetime_streams))[0],
    [releases]
  );

  // Compute outcome breakdown from terminal releases.
  // Plan 016 §7.4 — prefer final_outcome_class when present; fall back to legacy lifecycle_state/performance_class.
  const outcomeBreakdown = useMemo(() => {
    const counts = {};
    for (const label of TERMINAL_LIFECYCLE_STATES) counts[label] = 0;
    releases.forEach((r) => {
      // Dual-read: use final_outcome_class if populated (new field), else legacy fallback
      const state = r.final_outcome_class ?? r.lifecycle_state ?? r.performance_class ?? '';
      if (isTerminalState(state)) {
        counts[state] = (counts[state] || 0) + 1;
      }
    });
    // Only show entries with count > 0
    return Object.entries(counts).filter(([, c]) => c > 0);
  }, [releases]);

  if (releases.length === 0) {
    return <p className="text-gray-600 text-xs py-2">No releases yet. Drop your first track!</p>;
  }

  return (
    <div className="space-y-2.5">
      {bestRelease && (
        <div className="rounded-xl bg-yellow-500/[0.04] border border-yellow-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Star className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Top Release</span>
          </div>
          <p className="text-white text-sm font-semibold">{bestRelease.title || bestRelease.release_name || "Untitled"}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
            <span>{fmt(bestRelease.lifetime_streams || 0)} streams</span>
            <span>·</span>
            <span>${fmt(bestRelease.lifetime_revenue || 0)}</span>
            {bestRelease.lifecycle_state && (
              <>
                <span>·</span>
                <span className="capitalize">{bestRelease.lifecycle_state}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Discography Outcome Breakdown — shows distribution of terminal classifications */}
      {outcomeBreakdown.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Discography Breakdown</p>
          <div className="flex flex-wrap gap-1.5">
            {outcomeBreakdown.map(([outcome, count]) => {
              const meta = OUTCOME_DISPLAY_META[outcome] || { emoji: '📦', label: outcome, color: 'bg-gray-500/20 text-gray-400' };
              return (
                <span key={outcome} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${meta.color}`}>
                  <span>{meta.emoji}</span>
                  <span>{count} {meta.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {releases.slice(0, 8).map((r, i) => (
        <div key={r.id || i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
            <Music className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-white text-xs font-medium truncate">{r.title || r.release_name || "Untitled"}</p>
{/* Plan 016 §7.4 — prefer final_outcome_class for terminal badge; fall back to lifecycle_state */}
              {(() => {
                const terminalLabel = r.final_outcome_class ?? (isTerminalState(r.lifecycle_state) ? r.lifecycle_state : null);
                if (!terminalLabel || terminalLabel === 'Archived') return null;
                const meta = OUTCOME_DISPLAY_META[terminalLabel];
                return meta ? (
                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold ${meta.color}`}>
                    {meta.emoji} {meta.label}
                  </span>
                ) : null;
              })()}
            </div>
            <p className="text-gray-600 text-[10px]">
              {fmt(r.lifetime_streams || 0)} streams
              {r.lifecycle_state ? ` · ${r.lifecycle_state}` : ""}
            </p>
          </div>
          <span className="text-gray-500 text-[10px] tabular-nums flex-shrink-0">
            ${fmt(r.lifetime_revenue || 0)}
          </span>
        </div>
      ))}
      {releases.length > 8 && (
        <p className="text-gray-600 text-[10px] text-center pt-1">+{releases.length - 8} more</p>
      )}
    </div>
  );
}

// ─── Revenue Tab ──────────────────────────────────────────────────────────────
function RevenueTab({ releases, merch, profile, socialAccounts }) {
  const streamRevenue = releases.reduce((s, r) => s + N(r.lifetime_revenue), 0);
  const merchRevenue = merch.reduce((s, m) => s + N(m.total_revenue), 0);
  const socialRevenue = socialAccounts.reduce((s, a) => s + N(a.total_revenue), 0);
  const totalLifetimeIncome = N(profile?.income);

  // Revenue sources with colors — uses profile.income as total, breaks down known sources
  const knownSources = streamRevenue + merchRevenue + socialRevenue;
  const otherRevenue = Math.max(0, totalLifetimeIncome - knownSources);

  const sources = [
    { label: "Streaming",        value: streamRevenue,  color: "text-blue-400",   dot: "bg-blue-400",   bar: "from-blue-500 to-cyan-400" },
    { label: "Merch",            value: merchRevenue,    color: "text-orange-400", dot: "bg-orange-400", bar: "from-orange-500 to-amber-400" },
    { label: "Social Media",     value: socialRevenue,   color: "text-pink-400",   dot: "bg-pink-400",   bar: "from-pink-500 to-rose-400" },
    { label: "Other (Touring, Brand Deals, Sync, Subs, Collabs)", value: otherRevenue, color: "text-purple-400", dot: "bg-purple-400", bar: "from-purple-500 to-indigo-400" },
  ].filter((s) => s.value > 0);

  const maxSource = Math.max(...sources.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {/* Total */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
        <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Total Lifetime Income</p>
        <p className="text-white text-lg font-bold tabular-nums">${fmt(totalLifetimeIncome)}</p>
      </div>

      {/* Breakdown bars */}
      {sources.map(({ label, value, color, bar }) => (
        <div key={label}>
          <div className="flex items-center justify-between mb-1 text-xs">
            <span className="text-gray-400">{label}</span>
            <span className={`font-semibold tabular-nums ${color}`}>${fmt(value)}</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${bar} rounded-full transition-all duration-700`}
              style={{ width: `${Math.max(2, (value / maxSource) * 100)}%` }}
            />
          </div>
        </div>
      ))}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {[
          { label: "Total Streams", value: fmt(releases.reduce((s, r) => s + N(r.lifetime_streams), 0)), icon: BarChart3, color: "text-blue-400" },
          { label: "Merch Items", value: merch.length, icon: Shirt, color: "text-orange-400" },
        ].map(({ label, value, icon: Ic, color }) => (
          <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
            <Ic className={`w-3.5 h-3.5 ${color} mx-auto mb-1`} />
            <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-gray-600 text-[9px] uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Markets Tab ──────────────────────────────────────────────────────────────
function MarketsTab({ releases, profile }) {
  const regionalClout = useMemo(() => {
    if (!profile?.regional_clout) return {};
    if (typeof profile.regional_clout === "string") {
      try { return JSON.parse(profile.regional_clout); } catch { return {}; }
    }
    return profile.regional_clout || {};
  }, [profile?.regional_clout]);

  const regionData = useMemo(() => {
    const streamCounts = {};
    releases.forEach((r) => {
      // Use target_regions (array) if available, otherwise fall back to primary_region
      const targetRegions = Array.isArray(r.target_regions) ? r.target_regions : 
                           (r.primary_region ? [r.primary_region] : [normalizeRegion(profile?.region) || "United States"]);
      
      // Distribute streams evenly across all target regions
      const streamsPerRegion = Math.floor(N(r.lifetime_streams) / targetRegions.length);
      targetRegions.forEach(region => {
        streamCounts[region] = (streamCounts[region] || 0) + streamsPerRegion;
      });
    });

    return ALL_REGIONS.map((name) => ({
      name,
      streams: streamCounts[name] || 0,
      clout: N(regionalClout[name]),
      isHome: name === (normalizeRegion(profile?.home_region || profile?.region) || ""),
    })).sort((a, b) => {
      // Home region first, then by streams+clout combined
      if (a.isHome && !b.isHome) return -1;
      if (!a.isHome && b.isHome) return 1;
      return (b.streams + b.clout * 1000) - (a.streams + a.clout * 1000);
    });
  }, [releases, profile, regionalClout]);

  const maxStreams = Math.max(...regionData.map((r) => r.streams), 1);

  return (
    <div className="space-y-2.5">
      {regionData.map(({ name, streams, clout, isHome }) => (
        <div key={name} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-white text-xs flex items-center gap-1.5">
              {name}
              {isHome && <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">HOME</span>}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {streams > 0 && <span className="text-gray-500 text-[10px] tabular-nums">{fmt(streams)} streams</span>}
              {clout > 0 && <span className="text-purple-400 text-[10px] tabular-nums">{clout} clout</span>}
            </div>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full transition-all duration-700"
              style={{ width: streams > 0 ? `${Math.max(2, (streams / maxStreams) * 100)}%` : "0%" }}
            />
          </div>
        </div>
      ))}
      <p className="text-[10px] text-gray-600 pt-1">
        Home region: {profile?.home_region || profile?.region || "—"}
      </p>
    </div>
  );
}

// ─── Fans & Social Tab ────────────────────────────────────────────────────────
const SEGMENT_META = {
  og:            { label: "OGs",            emoji: "👑", color: "from-amber-500 to-yellow-400", text: "text-amber-400" },
  stan:          { label: "Stans",          emoji: "💜", color: "from-purple-500 to-fuchsia-400", text: "text-purple-400" },
  core:          { label: "Core Fans",      emoji: "🔥", color: "from-red-500 to-orange-400", text: "text-red-400" },
  casual:        { label: "Casual",         emoji: "🎧", color: "from-blue-500 to-cyan-400", text: "text-blue-400" },
  trend_chaser:  { label: "Trend Chasers",  emoji: "⚡", color: "from-pink-500 to-rose-400", text: "text-pink-400" },
  critic:        { label: "Critics",        emoji: "🧐", color: "from-gray-400 to-gray-500", text: "text-gray-400" },
};

function FansTab({ fanProfile, socialAccounts, profile, fandomSegments }) {
  const monthlyListeners = N(fanProfile?.monthly_listeners);
  const retentionRate = N(fanProfile?.retention_rate);
  const sentiment = N(fanProfile?.overall_sentiment);
  const followers = N(profile?.followers);

  const hasSegments = Array.isArray(fandomSegments) && fandomSegments.length > 0;
  const segmentTotal = hasSegments ? fandomSegments.reduce((s, seg) => s + N(seg.count), 0) : 0;

  return (
    <div className="space-y-3">
      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Fans", value: fmt(followers), color: "text-blue-400" },
          { label: "Monthly Listeners", value: fmt(monthlyListeners), color: "text-green-400" },
          { label: "Retention", value: `${Math.min(100, retentionRate)}%`, color: retentionRate >= 70 ? "text-green-400" : retentionRate >= 40 ? "text-yellow-400" : "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
            <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-gray-600 text-[9px] uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Fan composition — new fandom_segments or legacy fallback */}
      {hasSegments ? (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Fan Segments</p>
          {/* Divergence warning */}
          {(() => {
            const activeSegs = fandomSegments.filter(s => (Number(s.count) || 0) > 0);
            const hostile = activeSegs.filter(s => (s.sentiment ?? 50) < 25);
            const enthusiastic = activeSegs.filter(s => (s.sentiment ?? 50) > 75);
            if (hostile.length > 0 && enthusiastic.length > 0) {
              const div = Math.max(...enthusiastic.map(s => s.sentiment ?? 50)) - Math.min(...hostile.map(s => s.sentiment ?? 50));
              if (div > 40) {
                return (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                    ⚠️ Fan polarization ({div}pt)
                  </div>
                );
              }
            }
            return null;
          })()}
          {fandomSegments
            .sort((a, b) => N(b.count) - N(a.count))
            .map((seg) => {
              const meta = SEGMENT_META[seg.segment_type] || { label: seg.segment_type, emoji: "👤", color: "from-gray-400 to-gray-500", text: "text-gray-400" };
              const pct = segmentTotal > 0 ? Math.round((N(seg.count) / segmentTotal) * 100) : 0;
              const sentVal = seg.sentiment ?? 50;
              return (
                <div key={seg.segment_type}>
                  <div className="flex items-center justify-between mb-0.5 text-[11px]">
                    <span className="text-gray-400">{meta.emoji} {meta.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold tabular-nums ${meta.text}`}>{fmt(seg.count)} ({pct}%)</span>
                      <span className={`text-[10px] font-mono ${
                        sentVal < 25 ? 'text-red-400' :
                        sentVal > 75 ? 'text-emerald-400' :
                        'text-zinc-500'
                      }`}>
                        {sentVal}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${meta.color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}

      {/* Sentiment */}
      {fanProfile && (
        <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-gray-400 text-xs">Fan Sentiment</span>
          <span className={`text-xs font-semibold ${sentiment > 30 ? "text-green-400" : sentiment > -30 ? "text-yellow-400" : "text-red-400"}`}>
            {sentiment > 30 ? "Positive" : sentiment > -30 ? "Neutral" : "Negative"} ({sentiment})
          </span>
        </div>
      )}

      {/* Social platforms */}
      {socialAccounts.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Social Platforms</p>
          {socialAccounts.map((acc, i) => (
            <div key={acc.id || i} className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">{SOCIAL_PLATFORM_LABELS[acc.platform] || acc.platform}</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-white font-semibold tabular-nums">{fmt(acc.followers || 0)}</span>
                <span className="text-gray-600">followers</span>
                {N(acc.total_revenue) > 0 && (
                  <span className="text-green-400 text-[10px] tabular-nums">${fmt(acc.total_revenue)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!fanProfile && socialAccounts.length === 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 text-center">
          <Users className="w-5 h-5 text-gray-600 mx-auto mb-1" />
          <p className="text-gray-600 text-xs">No fan data yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Trend definitions (full rich config) ────────────────────────────────────
const TREND_DEFS = {
  STABLE:          { label: "Stable",           icon: "⚖️", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",    cardBorder: "border-blue-500/20",    shortSass: "Business as usual.", longDetail: "Nothing special happening. Your career is steady — no dramatic highs or lows. Keep releasing music and engaging fans to maintain or improve.", effects: [{ label: "All modifiers", dir: 0, value: "Normal" }], whySignals: ["Default state", "No special conditions met"], exitRule: "Exits when another trend's criteria are fully met." },
  GOAT:            { label: "GOAT",            icon: "🐐", badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30", cardBorder: "border-purple-500/20", shortSass: "You are the blueprint.", longDetail: "Greatest Of All Time energy. Cultural dominance. Critical acclaim. Commercial power. You are not competing. They are competing with your legacy.", effects: [{ label: "Fan retention", dir: 1, value: "+8%" }, { label: "Merch sales", dir: 1, value: "+15%" }, { label: "Tour demand", dir: 1, value: "+8%" }, { label: "Brand deals", dir: 1, value: "+15%" }], whySignals: ["Career stage: Global Superstar+", "Clout ≥ 2,000", "Charts in 75%+ of last 12 turns"], exitRule: "Active while all criteria remain met. Min 48 hours." },
  VIRAL_SENSATION: { label: "Viral Sensation", icon: "�", badgeColor: "bg-pink-500/20 text-pink-400 border-pink-500/30",   cardBorder: "border-pink-500/20",   shortSass: "The algorithm is in love with you.", longDetail: "Clips everywhere. Memes everywhere. The timeline cannot escape you. Ride the wave before it crashes.", effects: [{ label: "Discovery", dir: 1, value: "+6%" }, { label: "Follower conversion", dir: 1, value: "+6%" }, { label: "Virality tendency", dir: 1, value: "+10%" }, { label: "Fan retention", dir: -1, value: "−4% (shallow fans)" }], whySignals: ["Viral post (virality > 80)", "Follower growth rate > 20%"], exitRule: "Active while viral conditions persist. Min 24 hours." },
  COMEBACK:        { label: "Comeback",        icon: "�", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",  cardBorder: "border-green-500/20",  shortSass: "Oh you thought I was done?", longDetail: "The resurrection is real. Streams rebounding. Headlines shifting. Redemption arc activated.", effects: [{ label: "Discovery", dir: 1, value: "+6%" }, { label: "Merch sales", dir: 1, value: "+8%" }, { label: "Brand deals", dir: 1, value: "+10%" }, { label: "Virality", dir: 1, value: "+6%" }], whySignals: ["Was previously in Slump, Flop, or Passed Prime", "Now has a charting release"], exitRule: "Active while charting after recovery. Min 48 hours." },
  LEGACY_ARTIST:   { label: "Legacy Artist",   icon: "👑", badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30", cardBorder: "border-amber-500/20",  shortSass: "Respected. Untouchable. Slightly nostalgic.", longDetail: "You ARE the moment that inspired the moment. The youth study you. The critics adore you. The charts? Optional.", effects: [{ label: "Fan retention", dir: 1, value: "+6%" }, { label: "Merch sales", dir: 1, value: "+10%" }, { label: "Tour demand", dir: 1, value: "+5%" }, { label: "New fan discovery", dir: -1, value: "−3%" }], whySignals: ["Career stage: Mainstream Artist+", "Account age > 3 real months"], exitRule: "Active while career stage ≥ 6 and account age qualifies. Min 72 hours." },
  ONE_HIT_WONDER:  { label: "One Hit Wonder",  icon: "⭐", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", cardBorder: "border-yellow-500/20", shortSass: "You ate. Once.", longDetail: "One smash. One era. One lightning strike. The follow-up is sweating under pressure. Prove it was talent, not luck. Non-hit singles get −50% streams. Tours without the hit get −50% revenue.", effects: [{ label: "Non-hit streams", dir: -1, value: "−50%" }, { label: "Tour (no hit in setlist)", dir: -1, value: "−50%" }, { label: "Merch sales", dir: -1, value: "−8%" }, { label: "Fan retention", dir: -1, value: "−5%" }], whySignals: ["Scored a smash hit (peak pos ≤ 5)", "Fewer than 4 total singles"], exitRule: "Expires after ~500 hours (~3 weeks). Release more singles to avoid." },
  FLOP_ERA:        { label: "Flop Era",        icon: "�", badgeColor: "bg-red-600/20 text-red-500 border-red-600/30",      cardBorder: "border-red-600/20",    shortSass: "The era did not era.", longDetail: "The rollout was cute. The reception was not. Weak numbers, low engagement, and brand side-eyes. You need a reset.", effects: [{ label: "Discovery", dir: -1, value: "−10%" }, { label: "Fan retention", dir: -1, value: "−7%" }, { label: "Merch sales", dir: -1, value: "−12%" }, { label: "Brand deals", dir: -1, value: "−12%" }], whySignals: ["3+ consecutive project flops", "Current era flagged as flop"], exitRule: "Exits when you release a successful project. Min 72 hours." },
  CAREER_SLUMP:    { label: "Career Slump",    icon: "📊", badgeColor: "bg-red-500/20 text-red-400 border-red-500/30",      cardBorder: "border-red-500/20",    shortSass: "We need to talk.", longDetail: "Performance is under expectations. The energy feels off. This is the danger zone before Flop Era.", effects: [{ label: "Discovery", dir: -1, value: "−6%" }, { label: "Fan retention", dir: -1, value: "−4%" }, { label: "Merch sales", dir: -1, value: "−8%" }, { label: "Brand deals", dir: -1, value: "−10%" }], whySignals: ["3+ consecutive declining turns", "Hype below 25", "No charting release"], exitRule: "Exits when decline stops and you chart again. Min 48 hours." },
  PASSED_PRIME:    { label: "Passed Prime",    icon: "�", badgeColor: "bg-orange-500/20 text-orange-400 border-orange-500/30", cardBorder: "border-orange-500/20", shortSass: "You had it. Past tense.", longDetail: "The peak was stunning. The descent is visible. Reinvention or retirement, darling.", effects: [{ label: "Fan retention", dir: -1, value: "−6%" }, { label: "Discovery", dir: -1, value: "−8%" }, { label: "Merch sales", dir: -1, value: "−10%" }, { label: "Tour demand", dir: -1, value: "−8%" }], whySignals: ["Career stage below Cult Favorite", "Currently in Career Slump", "4+ consecutive project flops"], exitRule: "Exits when you climb back to Cult Favorite+ or break the flop streak. Min 72 hours." },
  DORMANT:         { label: "Dormant",         icon: "�", badgeColor: "bg-gray-500/20 text-gray-400 border-gray-500/30",    cardBorder: "border-gray-500/20",    shortSass: "You ghosted the charts.", longDetail: "No album or project released in over 200 hours. The industry forgot your number. Release something to wake up.", effects: [{ label: "Discovery", dir: -1, value: "−4%" }, { label: "Brand deals", dir: -1, value: "−8%" }, { label: "Virality", dir: -1, value: "−6%" }, { label: "Fan retention", dir: 1, value: "+2% (loyal fans stick)" }], whySignals: ["No release in 200+ hours"], exitRule: "Exits when you release new music." },
  FORGOTTEN:       { label: "Forgotten",       icon: "👻", badgeColor: "bg-gray-700/30 text-gray-500 border-gray-700/30",    cardBorder: "border-gray-700/20",    shortSass: "Who?", longDetail: "400+ hours without a release AND your career stage has fallen below Cult Favorite. The culture moved on. Heavy penalties across the board until you come back swinging.", effects: [{ label: "Discovery", dir: -1, value: "−12%" }, { label: "Fan retention", dir: -1, value: "−10%" }, { label: "Merch sales", dir: -1, value: "−15%" }, { label: "Tour demand", dir: -1, value: "−15%" }], whySignals: ["No release in 400+ hours", "Career stage below Cult Favorite"], exitRule: "Exits when you release new music AND rebuild career stage." },
};

function EffectRow({ label, dir, value }) {
  const icon = dir === 1
    ? <TrendingUp className="w-3 h-3 text-green-400 shrink-0" />
    : dir === -1
    ? <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
    : <Minus className="w-3 h-3 text-gray-500 shrink-0" />;
  const textColor = dir === 1 ? "text-green-400" : dir === -1 ? "text-red-400" : "text-gray-500";
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[11px] text-gray-400">{label}</span>
      {value && <span className={`text-[11px] font-semibold ml-auto ${textColor}`}>{value}</span>}
    </div>
  );
}

function TrendCard({ trendName }) {
  const [expanded, setExpanded] = useState(false);
  const def = TREND_DEFS[trendName];
  if (!def) return null;

  const effects = def.effects;
  return (
    <div className={`rounded-xl border ${def.cardBorder} bg-white/[0.02] overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left focus:outline-none"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-lg leading-none">{def.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${def.badgeColor}`}>{def.label}</span>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{def.shortSass}</p>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-gray-600 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-white/[0.04]">
              <p className="text-[11px] text-gray-400 leading-relaxed pt-2">{def.longDetail}</p>
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Gameplay Effects</p>
                <div className="space-y-1">{effects.map((e, i) => <EffectRow key={i} {...e} />)}</div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Why You Got This</p>
                <div className="flex flex-wrap gap-1">
                  {def.whySignals.map((s, i) => (
                    <span key={i} className="text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────
function TrendsTab({ fanProfile, playerId }) {
  const [lastEvent, setLastEvent] = useState(null);

  const careerTrends = fanProfile?.career_trends || {};
  const modifiers = fanProfile?.career_trend_modifiers || {};
  const activeTrends = Object.entries(careerTrends).filter(([, active]) => active).map(([name]) => name);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    async function loadLastEvent() {
      try {
        const events = await base44.entities.CareerTrendEvent.filter(
          { player_id: playerId }, "-global_turn_id", 1
        );
        if (!cancelled && events?.[0]) setLastEvent(events[0]);
      } catch {}
    }
    loadLastEvent();
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <div className="space-y-2">
      {activeTrends.length === 0 ? (
        <p className="text-gray-600 text-xs py-2">No active trends yet. Trends are computed each turn based on your career performance.</p>
      ) : (
        <>
          {activeTrends.map(name => {
            const def = TREND_DEFS[name];
            const holdTurns = Number(modifiers?.trend_hold_turns || 0);
            return (
              <div key={name} className="space-y-1">
                <TrendCard trendName={name} />
                {def?.exitRule && name !== 'STABLE' && (
                  <div className="text-[10px] text-gray-500 px-0.5">
                    {def.exitRule} Active for {holdTurns} hour{holdTurns === 1 ? "" : "s"}.
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      {(modifiers?.current_trend || lastEvent) && (
        <div className="space-y-1 pt-1 border-t border-white/[0.05]">
          {modifiers?.current_trend && (
            <div className="text-[10px] text-gray-500">
              Current trend: <span className="text-gray-300">{String(modifiers.current_trend).replace(/_/g, " ")}</span>
              {Number(modifiers?.trend_hold_turns) > 0 && <> · active for {Number(modifiers.trend_hold_turns)} turn{Number(modifiers.trend_hold_turns) === 1 ? "" : "s"}</>}
            </div>
          )}
          {Array.isArray(modifiers?.top_signals) && modifiers.top_signals.length > 0 && (
            <div className="text-[10px] text-gray-500">Signals: {modifiers.top_signals.slice(0, 3).join(', ')}</div>
          )}
          {lastEvent && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <Clock className="w-3 h-3 shrink-0" />
              <span>
                Last changed turn {lastEvent.global_turn_id}
                {lastEvent.added?.length > 0 && ` · +${lastEvent.added.map(t => t.replace(/_/g, " ")).join(", ")}`}
                {lastEvent.removed?.length > 0 && ` · −${lastEvent.removed.map(t => t.replace(/_/g, " ")).join(", ")}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main TabbedInsights Component ────────────────────────────────────────────
export default function TabbedInsights({ releases, profile, merch, fanProfile, socialAccounts = [], fandomSegments = [] }) {
  const [activeTab, setActiveTab] = useState("releases");

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06] overflow-x-auto hide-scrollbar">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-[11px] font-semibold whitespace-nowrap transition-colors border-b-2 flex-shrink-0
                ${isActive
                  ? "text-white border-red-500 bg-white/[0.03]"
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/[0.02]"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "releases" && <ReleasesTab releases={releases} />}
            {activeTab === "revenue" && <RevenueTab releases={releases} merch={merch} profile={profile} socialAccounts={socialAccounts} />}
            {activeTab === "markets" && <MarketsTab releases={releases} profile={profile} />}
            {activeTab === "fans" && <FansTab fanProfile={fanProfile} socialAccounts={socialAccounts} profile={profile} fandomSegments={fandomSegments} />}
            {activeTab === "trends" && <TrendsTab fanProfile={fanProfile} playerId={profile?.id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
