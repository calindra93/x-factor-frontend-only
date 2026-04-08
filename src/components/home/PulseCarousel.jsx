import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Flame, MapPin, Music2, Siren, Sparkles, Star, TrendingDown, TrendingUp, Users, Zap } from "lucide-react"; // Thermometer removed (MarketHeatCard replaced)

const AUTOPLAY_MS = 5200;
const RESUME_DELAY_MS = 7200;
const CARD_PEEK = "14%";

const TONE_META = {
  ember: {
    accent: "#fb923c",
    orb: "rgba(251,146,60,0.34)",
    border: "rgba(251,146,60,0.28)",
    chip: "rgba(251,146,60,0.16)",
    gradient: "radial-gradient(circle at 18% 18%, rgba(251,146,60,0.36), transparent 38%), radial-gradient(circle at 82% 22%, rgba(244,63,94,0.26), transparent 40%), linear-gradient(145deg, rgba(20,12,15,0.96), rgba(8,8,11,0.98))",
  },
  rose: {
    accent: "#fb7185",
    orb: "rgba(251,113,133,0.34)",
    border: "rgba(251,113,133,0.24)",
    chip: "rgba(251,113,133,0.16)",
    gradient: "radial-gradient(circle at 20% 20%, rgba(251,113,133,0.34), transparent 36%), radial-gradient(circle at 80% 18%, rgba(244,114,182,0.18), transparent 40%), linear-gradient(145deg, rgba(18,10,16,0.96), rgba(8,8,11,0.98))",
  },
  gold: {
    accent: "#fbbf24",
    orb: "rgba(251,191,36,0.32)",
    border: "rgba(251,191,36,0.24)",
    chip: "rgba(251,191,36,0.14)",
    gradient: "radial-gradient(circle at 18% 16%, rgba(251,191,36,0.32), transparent 38%), radial-gradient(circle at 78% 20%, rgba(245,158,11,0.16), transparent 42%), linear-gradient(145deg, rgba(18,14,10,0.96), rgba(8,8,11,0.98))",
  },
  blue: {
    accent: "#60a5fa",
    orb: "rgba(96,165,250,0.32)",
    border: "rgba(96,165,250,0.24)",
    chip: "rgba(96,165,250,0.14)",
    gradient: "radial-gradient(circle at 18% 20%, rgba(96,165,250,0.34), transparent 38%), radial-gradient(circle at 82% 18%, rgba(56,189,248,0.18), transparent 40%), linear-gradient(145deg, rgba(10,14,20,0.96), rgba(8,8,11,0.98))",
  },
  violet: {
    accent: "#c084fc",
    orb: "rgba(192,132,252,0.34)",
    border: "rgba(192,132,252,0.24)",
    chip: "rgba(192,132,252,0.16)",
    gradient: "radial-gradient(circle at 18% 18%, rgba(192,132,252,0.34), transparent 36%), radial-gradient(circle at 82% 18%, rgba(129,140,248,0.18), transparent 42%), linear-gradient(145deg, rgba(16,11,22,0.96), rgba(8,8,11,0.98))",
  },
  emerald: {
    accent: "#34d399",
    orb: "rgba(52,211,153,0.34)",
    border: "rgba(52,211,153,0.24)",
    chip: "rgba(52,211,153,0.16)",
    gradient: "radial-gradient(circle at 18% 20%, rgba(52,211,153,0.34), transparent 36%), radial-gradient(circle at 82% 18%, rgba(45,212,191,0.16), transparent 40%), linear-gradient(145deg, rgba(10,18,16,0.96), rgba(8,8,11,0.98))",
  },
  amber: {
    accent: "#f59e0b",
    orb: "rgba(245,158,11,0.34)",
    border: "rgba(245,158,11,0.24)",
    chip: "rgba(245,158,11,0.16)",
    gradient: "radial-gradient(circle at 18% 20%, rgba(245,158,11,0.34), transparent 36%), radial-gradient(circle at 82% 18%, rgba(251,191,36,0.18), transparent 40%), linear-gradient(145deg, rgba(20,14,10,0.96), rgba(8,8,11,0.98))",
  },
  slate: {
    accent: "#94a3b8",
    orb: "rgba(148,163,184,0.22)",
    border: "rgba(148,163,184,0.18)",
    chip: "rgba(148,163,184,0.12)",
    gradient: "radial-gradient(circle at 18% 20%, rgba(71,85,105,0.34), transparent 38%), radial-gradient(circle at 82% 18%, rgba(100,116,139,0.16), transparent 40%), linear-gradient(145deg, rgba(11,14,18,0.96), rgba(8,8,11,0.98))",
  },
};

const TYPE_META = {
  career_window: {
    label: "Career Window",
    icon: TrendingUp,
    kicker: "Your progression snapshot",
  },
  fan_health: {
    label: "Fan Health",
    icon: Users,
    kicker: "Audience pulse",
  },
  festival_spotlight: {
    label: "Festival Spotlight",
    icon: Music2,
    kicker: "Open windows",
  },
  controversy_monitor: {
    label: "Risk Monitor",
    icon: AlertTriangle,
    kicker: "Active cases",
  },
  opportunity_board: {
    label: "Opportunity Board",
    icon: Sparkles,
    kicker: "Moves on deck",
  },
  pressure_report: {
    label: "Pressure Report",
    icon: Siren,
    kicker: "Risk monitor",
  },
};

const LANE_CHIP_META = {
  commercial_heat: { label: "Commercial Heat · Hit Lane", icon: Flame, color: "#fb923c", bg: "rgba(251,146,60,0.14)", border: "rgba(251,146,60,0.28)" },
  cultural_influence: { label: "Cultural Influence · Taste Lane", icon: Sparkles, color: "#a78bfa", bg: "rgba(167,139,250,0.14)", border: "rgba(167,139,250,0.28)" },
  live_draw: { label: "Live Draw · Stage Lane", icon: Zap, color: "#34d399", bg: "rgba(52,211,153,0.14)", border: "rgba(52,211,153,0.28)" },
  industry_respect: { label: "Industry Respect · Prestige Lane", icon: Star, color: "#fbbf24", bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.28)" },
  core_fan_devotion: { label: "Core Fan Devotion · Loyalty Lane", icon: Flame, color: "#f472b6", bg: "rgba(244,114,182,0.14)", border: "rgba(244,114,182,0.28)" },
};

const formatValue = (value) => {
  if (typeof value === "number") return String(Math.round(value));
  return String(value || "—");
};

// Compute scene temperature 0-100 from active looptok trends

// Match trends to player genre/era aesthetic tags

// Extract rival artists from news items (not the player)

// --- Card Components ---

function CardShell({ isActive, tone, children }) {
  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[20px] border px-3 pb-3 pt-2.5 transition-all duration-500 ease-out ${isActive ? "scale-[1.01]" : "scale-[0.985] opacity-90"}`}
      style={{
        background: tone.gradient,
        borderColor: isActive ? tone.border : "rgba(255,255,255,0.08)",
        boxShadow: isActive
          ? `0 10px 22px rgba(0,0,0,0.30), 0 0 0 1px ${tone.border}, 0 0 26px ${tone.orb}`
          : "0 8px 16px rgba(0,0,0,0.20)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(115deg, transparent 22%, rgba(255,255,255,${isActive ? "0.10" : "0.04"}) 32%, transparent 45%)`,
          transform: isActive ? "translateX(0%)" : "translateX(-8%)",
          transition: "transform 900ms ease",
        }}
      />
      <div
        className="pointer-events-none absolute -left-6 top-1 h-14 w-14 rounded-full blur-2xl"
        style={{ background: tone.orb, opacity: isActive ? 0.9 : 0.55 }}
      />
      <div className="pointer-events-none absolute inset-[1px] rounded-[19px] border border-white/[0.08]" />
      {children}
    </article>
  );
}

function CareerWindowCard({ item, isActive, tone, onNavigate }) {
  const ctx = item?.modalContext || {};
  const primaryChip = ctx._primaryLane ? LANE_CHIP_META[ctx._primaryLane] : null;
  const secondaryChip = ctx._secondaryLane ? LANE_CHIP_META[ctx._secondaryLane] : null;
  const progressPct = item?._progressPct ?? null;
  const stageLabel = ctx.stageLabel || null;
  const nextStageLabel = ctx.nextStageLabel || null;
  const trendName = item?._trendName || null;
  const trendIsMatch = item?._trendIsMatch || false;
  // Controversy / risk: first negative from context
  const controversy = (ctx.negatives || [])[0] || null;

  return (
    <CardShell item={item} isActive={isActive} tone={tone}>
      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={11} style={{ color: tone.accent }} />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-white/90">{item?.eyebrow || "Career Window"}</span>
        </div>
        <div
          className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
          style={{ color: tone.accent, background: tone.chip, border: `1px solid ${tone.border}` }}
        >
          Your progression snapshot
        </div>
      </div>

      {/* Stage + progress */}
      <div className="relative mt-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">Current Stage</div>
            <div className="mt-0.5 text-[17px] font-black leading-tight tracking-[-0.02em] text-white">
              {stageLabel || item?.hero || "—"}
            </div>
          </div>
          {nextStageLabel && (
            <div className="shrink-0 text-right">
              <div className="text-[8px] font-semibold text-white/40">Next</div>
              <div className="text-[10px] font-bold" style={{ color: tone.accent }}>{nextStageLabel}</div>
            </div>
          )}
        </div>
        {progressPct !== null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-[1200ms] ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%`, background: tone.accent }}
              />
            </div>
            <div className="mt-0.5 text-right text-[8px] font-semibold" style={{ color: tone.accent }}>{progressPct}%</div>
          </div>
        )}
      </div>

      {/* Lane chips */}
      {(primaryChip || secondaryChip) && (
        <div className="relative mt-2 flex flex-wrap gap-1">
          {primaryChip && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold"
              style={{ background: primaryChip.bg, border: `1px solid ${primaryChip.border}`, color: primaryChip.color }}
            >
              <primaryChip.icon size={7} />
              {primaryChip.label}
            </span>
          )}
          {secondaryChip && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold"
              style={{ background: secondaryChip.bg, border: `1px solid ${secondaryChip.border}`, color: secondaryChip.color }}
            >
              <secondaryChip.icon size={7} />
              {secondaryChip.label}
            </span>
          )}
        </div>
      )}

      {/* Career trend inline signal */}
      {trendName && (
        <div className="relative mt-1.5 flex items-center gap-1.5">
          <TrendingUp size={8} style={{ color: trendIsMatch ? "#34d399" : "#94a3b8" }} />
          <span
            className="truncate text-[8px] font-semibold"
            style={{ color: trendIsMatch ? "#34d399" : "#94a3b8" }}
          >
            {trendIsMatch ? "✓" : "✗"} {trendName}
          </span>
          <span
            className="shrink-0 rounded-full px-1 py-0.5 text-[7px] font-bold"
            style={trendIsMatch
              ? { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.22)" }
              : { background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.15)" }
            }
          >
            {trendIsMatch ? "in lane" : "off lane"}
          </span>
        </div>
      )}

      {/* Controversy / risk alert */}
      {controversy && (
        <div
          className="relative mt-2 rounded-lg px-2 py-1 text-[9px] font-medium leading-snug text-white/90"
          style={{ background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.22)" }}
        >
          ⚠ {controversy}
        </div>
      )}

      {/* CTA */}
      <div className="relative mt-auto flex items-end justify-end pt-2.5">
        <button
          onClick={() => onNavigate(item)}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[9px] font-bold tracking-[0.04em] transition-transform duration-200 active:scale-95"
          style={{
            background: tone.chip,
            border: `1px solid ${tone.border}`,
            boxShadow: `0 0 10px ${tone.orb}`,
          }}
        >
          <span style={{ color: tone.accent }}>{item?.ctaLabel || "Open Snapshot"}</span>
          <ArrowRight size={10} style={{ color: tone.accent }} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
    </CardShell>
  );
}

function FanHealthCard({ item, isActive, tone, onNavigate }) {
  const listeners = Number(item?._monthlyListeners || 0);
  const delta = Number(item?._listenerDelta || 0);
  const retentionRate = Number(item?._retentionRate || 0);
  const archetypes = Array.isArray(item?._archetypes) ? item._archetypes.filter(a => a.pct > 0) : [];
  const isGrowing = delta >= 0;
  const deltaColor = isGrowing ? "#34d399" : "#fb7185";
  const DeltaIcon = isGrowing ? TrendingUp : TrendingDown;
  const hasListeners = listeners > 0;

  const displayListeners = listeners >= 1000000
    ? `${(listeners / 1000000).toFixed(1)}M`
    : listeners >= 1000
      ? `${(listeners / 1000).toFixed(1)}K`
      : hasListeners ? String(listeners) : "—";

  const displayDelta = Math.abs(delta) >= 1000
    ? `${isGrowing ? "+" : "-"}${(Math.abs(delta) / 1000).toFixed(1)}K`
    : delta !== 0
      ? `${isGrowing ? "+" : "-"}${Math.abs(delta)}`
      : null;

  return (
    <CardShell isActive={isActive} tone={tone}>
      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Users size={11} style={{ color: tone.accent }} />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-white/90">Fan Health</span>
        </div>
        <div className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ color: tone.accent, background: tone.chip, border: `1px solid ${tone.border}` }}>
          Audience pulse
        </div>
      </div>

      {/* Listener count + delta */}
      <div className="relative mt-2 flex items-end gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">Monthly listeners</div>
          <div className="mt-0.5 text-[26px] font-black leading-none tracking-[-0.04em] text-white/95">{displayListeners}</div>
          {displayDelta && (
            <div className="mt-0.5 flex items-center gap-0.5">
              <DeltaIcon size={9} style={{ color: deltaColor }} />
              <span className="text-[9px] font-bold" style={{ color: deltaColor }}>{displayDelta} this turn</span>
            </div>
          )}
          {!hasListeners && (
            <div className="mt-1 text-[9px] text-white/40">Fan profile loading&hellip;</div>
          )}
        </div>
        {retentionRate > 0 && (
          <div className="ml-auto shrink-0 text-right">
            <div className="text-[8px] font-semibold text-white/40">Retention</div>
            <div className="text-[14px] font-black leading-none" style={{ color: retentionRate >= 70 ? "#34d399" : retentionRate >= 45 ? "#fbbf24" : "#fb7185" }}>
              {retentionRate}%
            </div>
          </div>
        )}
      </div>

      {/* Archetype bars */}
      {archetypes.length > 0 && (
        <div className="relative mt-2 space-y-0.5">
          {archetypes.slice(0, 3).map((a) => (
            <div key={a.key} className="flex items-center gap-1.5">
              <div className="w-[52px] shrink-0 text-[7.5px] font-semibold text-white/45">{a.label}</div>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-[1000ms] ease-out" style={{ width: `${Math.min(100, a.pct)}%`, background: a.color }} />
              </div>
              <div className="w-6 shrink-0 text-right text-[7.5px] font-semibold text-white/50">{a.pct > 0 ? `${a.pct}%` : ""}</div>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-auto flex items-end justify-end pt-2">
        <CtaButton tone={tone} label={item?.ctaLabel} onClick={() => onNavigate(item)} />
      </div>
    </CardShell>
  );
}

function FestivalSpotlightCard({ item, isActive, tone, onNavigate }) {
  const noData = item?._noData || false;
  const festival = item?._festival || null;
  const openCount = Number(item?._openCount || 0);
  const name = festival?.name || null;
  const genre = festival?.genre || null;
  const region = festival?.region || null;
  const prize = Number(festival?.prize_pool || 0);
  const eligibleLanes = Array.isArray(festival?.eligible_lanes) ? festival.eligible_lanes : [];
  const statusLabel = festival?.status === "accepting_submissions" ? "Submissions Open"
    : festival?.status === "upcoming" ? "Coming Soon"
    : "Open Window";

  return (
    <CardShell isActive={isActive} tone={tone}>
      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Music2 size={11} style={{ color: tone.accent }} />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-white/90">Festival Spotlight</span>
        </div>
        <div className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ color: tone.accent, background: tone.chip, border: `1px solid ${tone.border}` }}>
          {noData ? "No open windows" : openCount > 1 ? `${openCount} open` : statusLabel}
        </div>
      </div>

      {noData ? (
        <div className="relative mt-3 flex flex-1 flex-col items-start justify-center gap-1">
          <div className="text-[13px] font-black text-white/80">All Quiet on Stage</div>
          <div className="text-[9px] leading-snug text-white/45">No festivals are accepting submissions right now. Check Amplifi for upcoming windows.</div>
        </div>
      ) : (
        <>
          {/* Festival name */}
          <div className="relative mt-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">Featured event</div>
            <div className="mt-0.5 text-[16px] font-black leading-tight tracking-[-0.02em] text-white/95">{name}</div>
          </div>

          {/* Meta chips */}
          <div className="relative mt-1.5 flex flex-wrap gap-1">
            {genre && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.07] px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                {genre}
              </span>
            )}
            {region && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.07] px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                <MapPin size={7} />{region}
              </span>
            )}
            {prize > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: tone.chip, border: `1px solid ${tone.border}`, color: tone.accent }}>
                ${prize.toLocaleString()} prize
              </span>
            )}
          </div>

          {/* Eligible lanes */}
          {eligibleLanes.length > 0 && (
            <div className="relative mt-1.5 flex flex-wrap gap-0.5">
              {eligibleLanes.slice(0, 3).map((lane) => (
                <span key={lane} className="rounded-full border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[7.5px] font-semibold text-violet-300">
                  {String(lane).replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="relative mt-auto flex items-end justify-end pt-2">
        <CtaButton tone={tone} label={item?.ctaLabel} onClick={() => onNavigate(item)} />
      </div>
    </CardShell>
  );
}

function ControversyMonitorCard({ item, isActive, tone, onNavigate }) {
  const noData = item?._noData || false;
  const activeCase = item?._case || null;
  const activeCaseCount = Number(item?._activeCaseCount || 0);
  const title = activeCase?.title || "Active Controversy";
  const phase = activeCase?.phase || activeCase?.status || "active";
  const publicAttention = Number(activeCase?.public_attention || 0);
  const brandTrustImpact = Number(activeCase?.brand_trust_delta_total || 0);
  const fanMoraleImpact = Number(activeCase?.fan_morale_delta_total || 0);

  const phaseColor = phase === "peak" ? "#fb923c" : phase === "spread" || phase === "escalating" ? "#fb7185" : "#fbbf24";
  const phaseLabel = phase === "peak" ? "At Peak" : phase === "spread" ? "Spreading" : phase === "escalating" ? "Escalating" : phase === "aftermath" ? "Aftermath" : "Active";

  return (
    <CardShell isActive={isActive} tone={tone}>
      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={11} style={{ color: tone.accent }} />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-white/90">Risk Monitor</span>
        </div>
        <div
          className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
          style={noData
            ? { color: tone.accent, background: tone.chip, border: `1px solid ${tone.border}` }
            : { color: phaseColor, background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.22)" }
          }
        >
          {noData ? "All Clear" : activeCaseCount > 1 ? `${activeCaseCount} active cases` : phaseLabel}
        </div>
      </div>

      {noData ? (
        <div className="relative mt-3 flex flex-1 flex-col items-start justify-center gap-1">
          <div className="text-[13px] font-black text-white/80">No Active Cases</div>
          <div className="text-[9px] leading-snug text-white/45">Your reputation is clean this turn. Manage your narrative proactively in the Fandom app.</div>
        </div>
      ) : (
        <>
          {/* Case title */}
          <div className="relative mt-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">Active case</div>
            <div className="mt-0.5 line-clamp-2 text-[14px] font-black leading-tight tracking-[-0.02em] text-white/95">{title}</div>
          </div>

          {/* Impact bars */}
          <div className="relative mt-2 space-y-1">
            {publicAttention > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-[62px] shrink-0 text-[7.5px] font-semibold text-white/45">Attention</div>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, publicAttention)}%`, background: phaseColor, transition: "width 1s ease-out" }} />
                </div>
                <div className="w-5 shrink-0 text-right text-[7.5px] font-semibold" style={{ color: phaseColor }}>{publicAttention}</div>
              </div>
            )}
            {brandTrustImpact !== 0 && (
              <div className="flex items-center gap-2">
                <div className="w-[62px] shrink-0 text-[7.5px] font-semibold text-white/45">Brand Trust</div>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(brandTrustImpact))}%`, background: brandTrustImpact < 0 ? "#fb7185" : "#34d399", transition: "width 1s ease-out" }} />
                </div>
                <div className="w-5 shrink-0 text-right text-[7.5px] font-semibold" style={{ color: brandTrustImpact < 0 ? "#fb7185" : "#34d399" }}>{brandTrustImpact > 0 ? `+${brandTrustImpact}` : brandTrustImpact}</div>
              </div>
            )}
            {fanMoraleImpact !== 0 && (
              <div className="flex items-center gap-2">
                <div className="w-[62px] shrink-0 text-[7.5px] font-semibold text-white/45">Fan Morale</div>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(fanMoraleImpact))}%`, background: fanMoraleImpact < 0 ? "#fb7185" : "#34d399", transition: "width 1s ease-out" }} />
                </div>
                <div className="w-5 shrink-0 text-right text-[7.5px] font-semibold" style={{ color: fanMoraleImpact < 0 ? "#fb7185" : "#34d399" }}>{fanMoraleImpact > 0 ? `+${fanMoraleImpact}` : fanMoraleImpact}</div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="relative mt-auto flex items-end justify-end pt-2">
        <CtaButton tone={tone} label={item?.ctaLabel} onClick={() => onNavigate(item)} />
      </div>
    </CardShell>
  );
}

function CtaButton({ tone, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[9px] font-bold tracking-[0.04em] transition-transform duration-200 active:scale-95"
      style={{ background: tone.chip, border: `1px solid ${tone.border}`, boxShadow: `0 0 10px ${tone.orb}` }}
    >
      <span style={{ color: tone.accent }}>{label || "Open"}</span>
      <ArrowRight size={10} style={{ color: tone.accent }} className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

function PulseCard({ item, isActive, onNavigate }) {
  const tone = TONE_META[item?.tone] || TONE_META.slate;
  const typeMeta = TYPE_META[item?.type] || TYPE_META.pressure_report;
  const Icon = typeMeta.icon;
  const support = Array.isArray(item?.support) ? item.support.slice(0, 1) : [];

  if (item?.type === "career_window") {
    return <CareerWindowCard item={item} isActive={isActive} tone={tone} onNavigate={onNavigate} />;
  }
  if (item?.type === "fan_health") {
    return <FanHealthCard item={item} isActive={isActive} tone={tone} onNavigate={onNavigate} />;
  }
  if (item?.type === "festival_spotlight") {
    return <FestivalSpotlightCard item={item} isActive={isActive} tone={tone} onNavigate={onNavigate} />;
  }
  if (item?.type === "controversy_monitor") {
    return <ControversyMonitorCard item={item} isActive={isActive} tone={tone} onNavigate={onNavigate} />;
  }

  return (
    <CardShell isActive={isActive} tone={tone}>
      {/* Header row */}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon size={11} style={{ color: tone.accent }} />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-white/90">{item?.eyebrow || typeMeta.label}</span>
        </div>
        <div
          className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
          style={{ color: tone.accent, background: tone.chip, border: `1px solid ${tone.border}` }}
        >
          {typeMeta.kicker}
        </div>
      </div>

      {/* Hero + value */}
      <div className="relative mt-2">
        <div className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-white/95">
          {item?.hero || "Untitled Signal"}
        </div>
        <div className="mt-1 text-[24px] font-black leading-none tracking-[-0.04em] text-white">
          {formatValue(item?.value)}
        </div>
      </div>

      {/* Support line */}
      {support.length > 0 && (
        <div className="relative mt-2">
          <div
            className="rounded-lg px-2 py-1 text-[10px] font-medium leading-snug text-white/90"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            {support[0]}
          </div>
        </div>
      )}

      {/* Footer + CTA */}
      <div className="relative mt-auto flex items-end justify-between gap-2 pt-2.5">
        <p className="max-w-[62%] text-[10px] font-medium leading-snug text-white/70">{item?.footer}</p>
        <button
          onClick={() => onNavigate(item)}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[9px] font-bold tracking-[0.04em] transition-transform duration-200 active:scale-95"
          style={{
            background: tone.chip,
            border: `1px solid ${tone.border}`,
            boxShadow: `0 0 10px ${tone.orb}`,
          }}
        >
          <span style={{ color: tone.accent }}>{item?.ctaLabel || "Open"}</span>
          <ArrowRight size={10} style={{ color: tone.accent }} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
    </CardShell>
  );
}

// --- Main Carousel ---

export default function PulseCarousel({ items = [], onItemAction = null }) {
  const scrollRef = useRef(null);
  const resumeTimeoutRef = useRef(null);
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const cards = useMemo(() => (items || []).slice(0, 5), [items]);

  useEffect(() => {
    if (!cards.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, cards.length - 1));
  }, [cards]);

  useEffect(() => () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!cards.length || isPaused) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [cards, isPaused]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !cards.length) return;
    const target = container.children[activeIndex];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex, cards]);

  const pauseAutoplay = () => {
    setIsPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = window.setTimeout(() => {
      setIsPaused(false);
    }, RESUME_DELAY_MS);
  };

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    const nextIndex = cards.reduce((bestIndex, _, index) => {
      const child = container.children[index];
      if (!child) return bestIndex;
      const childCenter = child.offsetLeft + child.clientWidth / 2;
      const bestChild = container.children[bestIndex];
      const bestCenter = bestChild ? bestChild.offsetLeft + bestChild.clientWidth / 2 : Number.POSITIVE_INFINITY;
      return Math.abs(childCenter - containerCenter) < Math.abs(bestCenter - containerCenter) ? index : bestIndex;
    }, 0);
    setActiveIndex(nextIndex);
  };

  const handleNavigate = (item) => {
    if (!item) return;
    if (typeof onItemAction === "function") {
      onItemAction(item);
      return;
    }
    if (item?.navigateTo) {
      navigate(item.navigateTo);
    }
  };

  if (!cards.length) return null;

  return (
    <div className="relative overflow-hidden">
      <div className="mb-1.5 flex items-center justify-between px-4">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.03em] text-white/88">Industry Pulse</span>
          <div className="mt-0.5 text-[10px] font-medium text-white/70">The signals that matter right now</div>
        </div>
        <div className="flex min-w-[24px] items-center gap-1">
          {cards.map((card, index) => (
            <button
              key={card?.id || index}
              onClick={() => {
                pauseAutoplay();
                setActiveIndex(index);
              }}
              className="flex h-1.5 w-1.5 items-center justify-center rounded-full transition-transform duration-300"
              aria-label={`Show ${card?.eyebrow || card?.type || `card ${index + 1}`}`}
            >
              <span
                className="block h-1.5 w-1.5 rounded-full transition-all duration-300"
                style={{
                  background: index === activeIndex ? (TONE_META[card?.tone] || TONE_META.slate).accent : "rgba(255,255,255,0.22)",
                  opacity: index === activeIndex ? 1 : 0.85,
                  boxShadow: index === activeIndex ? `0 0 8px ${(TONE_META[card?.tone] || TONE_META.slate).orb}` : "none",
                  transform: index === activeIndex ? "scale(1)" : "scale(0.78)",
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[#0a0a0f] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[#0a0a0f] to-transparent" />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={pauseAutoplay}
          onTouchStart={pauseAutoplay}
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-0.5 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollPaddingInline: CARD_PEEK }}
        >
          {cards.map((card, index) => (
            <div
              key={card?.id || index}
              className="h-[172px] w-[80%] shrink-0 snap-center"
              style={{ flexBasis: `calc(100% - ${CARD_PEEK})` }}
            >
              <PulseCard
                item={card}
                isActive={index === activeIndex}
                onNavigate={handleNavigate}
              />
            </div>
          ))}
          <div className="w-1 shrink-0" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-1 px-4">
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-medium text-white/70">
          {isPaused ? "Pulse paused while you browse" : "Autoplaying the current issue"}
        </div>
      </div>
    </div>
  );
}
