import React, { useState } from "react";
import { DollarSign, Flame, Headphones, ChevronDown, ChevronUp } from "lucide-react";
import RegionalFansBreakdown from "./RegionalFansBreakdown";

const fmtBig = (n) => {
  n = Number(n || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

const fmtCash = (n) => {
  n = Number(n || 0);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

export default function StatsWidgets({ profile, fanProfile, lastTurnMetrics }) {
  const [showRegionalBreakdown, setShowRegionalBreakdown] = useState(false);
  const [showRevBreakdown, setShowRevBreakdown] = useState(false);

  const hype = profile?.hype || 0;
  const income = profile?.income || 0;
  const monthlyListeners = fanProfile?.monthly_listeners || 0;

  const m = lastTurnMetrics || {};
  const totalLastTurn = (m.streaming_revenue || 0) + (m.merch_revenue || 0) + (m.touring_revenue || 0) +
    (m.social_revenue || 0) + (m.brand_deal_revenue || 0) + (m.fan_sub_revenue || 0) +
    (m.sync_licensing_revenue || 0) + (m.collab_revenue || 0);
  const hasRevData = totalLastTurn > 0;

  const REV_ROWS = [
    { label: "Streaming", val: m.streaming_revenue, color: "#60a5fa" },
    { label: "Merch",     val: m.merch_revenue,     color: "#fb923c" },
    { label: "Touring",   val: m.touring_revenue,   color: "#c084fc" },
    { label: "Social",    val: m.social_revenue,    color: "#f472b6" },
    { label: "Brand Deals", val: m.brand_deal_revenue, color: "#34d399" },
    { label: "Fan Subs",  val: m.fan_sub_revenue,   color: "#22d3ee" },
    { label: "Sync",      val: m.sync_licensing_revenue, color: "#fbbf24" },
    { label: "Collabs",   val: m.collab_revenue,    color: "#f87171" },
  ].filter(r => (r.val || 0) > 0);

  const hypeColor = hype >= 70 ? "#f97316" : hype >= 40 ? "#C9A84C" : "#9ca3af";

  return (
    <>
      {/* 3-col compact stat strip */}
      <div className="grid grid-cols-3 gap-2">
        {/* Income */}
        <div
          className="rounded-2xl p-3 flex flex-col gap-1.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1">
            <DollarSign size={10} className="text-emerald-400" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Income</span>
          </div>
          <div className="text-[15px] font-black text-white tracking-tight leading-none">{fmtCash(income)}</div>
          {hasRevData ? (
            <button
              onClick={() => setShowRevBreakdown(!showRevBreakdown)}
              className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-400/60 hover:text-emerald-400 transition-colors mt-0.5"
            >
              +{fmtCash(totalLastTurn)} last turn
              {showRevBreakdown ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
          ) : (
            <span className="text-[8px] text-white/20">
              Rank #{profile?.global_rank > 999 ? "999+" : profile?.global_rank || "—"}
            </span>
          )}
        </div>

        {/* Hype */}
        <div
          className="rounded-2xl p-3 flex flex-col gap-1.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1">
            <Flame size={10} style={{ color: hypeColor }} />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Hype</span>
          </div>
          <div className="text-[15px] font-black leading-none" style={{ color: hypeColor }}>{hype}%</div>
          <div className="w-full bg-white/[0.06] rounded-full h-1 mt-0.5">
            <div
              className="h-1 rounded-full transition-all duration-700"
              style={{ width: `${hype}%`, background: `linear-gradient(90deg, ${hypeColor}90, ${hypeColor})` }}
            />
          </div>
        </div>

        {/* Monthly Listeners */}
        <button
          onClick={() => monthlyListeners > 0 && setShowRegionalBreakdown(true)}
          className="rounded-2xl p-3 flex flex-col gap-1.5 text-left transition-all active:scale-[0.97]"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1">
            <Headphones size={10} className="text-violet-400" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Monthly</span>
          </div>
          <div className="text-[15px] font-black text-white tracking-tight leading-none">{fmtBig(monthlyListeners)}</div>
          <span className="text-[8px] text-white/20">
            {fanProfile?.top_regions?.length ? `${fanProfile.top_regions.length} regions` : "listeners"}
          </span>
        </button>
      </div>

      {/* Revenue breakdown expandable */}
      {showRevBreakdown && hasRevData && (
        <div
          className="rounded-2xl p-3"
          style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)" }}
        >
          <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Last Turn Breakdown</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {REV_ROWS.map(r => (
              <div key={r.label} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <span className="text-[10px] text-white/50 flex-1">{r.label}</span>
                <span className="text-[10px] font-bold" style={{ color: r.color }}>+{fmtCash(r.val || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RegionalFansBreakdown
        fanProfile={fanProfile}
        onClose={() => setShowRegionalBreakdown(false)}
        isOpen={showRegionalBreakdown}
      />
    </>
  );
}
