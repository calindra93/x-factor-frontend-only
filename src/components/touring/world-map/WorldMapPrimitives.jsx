import React from "react";
import { ChevronRight } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD MAP — Shared presentational primitives
// ═══════════════════════════════════════════════════════════════════════════════

export function SurfaceLabel({ icon: Icon, label, value, color = "#cbd5e1" }) {
  return (
    <div className="flex items-center gap-2">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} /> : null}
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: "#64748b" }}>
          {label}
        </p>
        <p className="text-[11px] font-black leading-tight text-white">{value}</p>
      </div>
    </div>
  );
}

export function CommandMetric({ label, value, sub, tone = "#94a3b8" }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
        {label}
      </p>
      <div className="mt-1 flex items-end gap-2">
        <p className="text-[20px] font-black leading-none" style={{ color: tone }}>
          {value}
        </p>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
        {sub}
      </p>
    </div>
  );
}

export function CommandAction({ icon: Icon, title, subtitle, accent, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left"
    >
      <div
        className="flex items-center gap-3 rounded-[18px] px-3 py-3 transition-all"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}
        >
          {Icon ? <Icon className="h-4 w-4" style={{ color: accent }} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black text-white">{title}</p>
            {badge ? (
              <span
                className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                style={{ background: `${accent}18`, color: accent }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "#9ca3af" }}>
            {subtitle}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "#4b5563" }} />
      </div>
    </button>
  );
}
