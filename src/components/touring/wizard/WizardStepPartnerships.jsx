import React from "react";
import { Check, Users, Music, Loader2 } from "lucide-react";
import { formatNumber, formatCurrency } from "@/utils/numberFormat";

// ─── Constants ───────────────────────────────────────────────────────────────

const TOUR_MODES = [
  {
    id: "solo",
    label: "Solo Headliner",
    sub: "Your show, your rules. Full revenue.",
    emoji: "\u{1F451}",
    color: "#a78bfa",
  },
  {
    id: "equal_coheadliner",
    label: "Equal Co-Headliner",
    sub: "Split billing. +30% attendance boost.",
    emoji: "\u{1F91D}",
    color: "#34d399",
  },
  {
    id: "partner_led",
    label: "Partner-Led",
    sub: "Open for a bigger act. +50% reach boost.",
    emoji: "\u{1F3A4}",
    color: "#fbbf24",
  },
];

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: "#6b7280" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function getSponsorKey(sponsor) {
  return sponsor?.id || sponsor?.brand_name || sponsor?.name || null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WizardStepPartnerships({
  wizardPlan,
  setWizardPlan,
  profile: _profile,
  routeBuilderSequence = [],
  partnershipsError = null,
  coHeadliners = [],
  coHeadlinersLoading = false,
  onLoadCoHeadliners,
  sponsors = [],
  sponsorsLoading = false,
  onLoadSponsors,
  openers = [],
  openersLoading = false,
  onLoadOpeners,
}) {
  // ── Tour Mode ─────────────────────────────────────────────────────────────

  const selectedMode = wizardPlan.tourMode || "solo";

  const handleSelectMode = (modeId) => {
    setWizardPlan((p) => ({
      ...p,
      tourMode: modeId,
      coHeadliner: modeId === "equal_coheadliner" ? p.coHeadliner : null,
    }));
  };

  const selectedCoHeadlinerId = wizardPlan.coHeadliner?.id || null;

  const handleSelectCoHeadliner = (candidate) => {
    setWizardPlan((p) => ({
      ...p,
      coHeadliner: p.coHeadliner?.id === candidate.id ? null : candidate,
    }));
  };

  // ── Opening Acts ──────────────────────────────────────────────────────────

  const selectedOpenerIds = new Set(
    (wizardPlan.openingActs || []).map((o) => o.id)
  );

  const toggleOpener = (opener) => {
    setWizardPlan((p) => {
      const existing = (p.openingActs || []).find((o) => o.id === opener.id);
      if (existing) {
        return {
          ...p,
          openingActs: p.openingActs.filter((o) => o.id !== opener.id),
        };
      }
      return {
        ...p,
        openingActs: [
          ...(p.openingActs || []),
          { ...opener, revenueSplit: 0.15 },
        ],
      };
    });
  };

  const updateOpenerSplit = (openerId, split) => {
    setWizardPlan((p) => ({
      ...p,
      openingActs: (p.openingActs || []).map((o) =>
        o.id === openerId ? { ...o, revenueSplit: split / 100 } : o
      ),
    }));
  };

  // ── Sponsors ──────────────────────────────────────────────────────────────

  const selectedSponsorId = getSponsorKey(wizardPlan.sponsor);

  const handleSelectSponsor = (sponsor) => {
    const sponsorKey = getSponsorKey(sponsor);
    setWizardPlan((p) => ({
      ...p,
      sponsor: getSponsorKey(p.sponsor) === sponsorKey ? null : sponsor,
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {partnershipsError && (
        <div
          className="rounded-2xl px-4 py-3 text-xs"
          style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#fca5a5",
          }}
        >
          {partnershipsError}
        </div>
      )}

      {/* Tour Mode */}
      <Section title="Tour Mode">
        <div className="space-y-2">
          {TOUR_MODES.map((mode) => {
            const isActive = selectedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectMode(mode.id)}
                className="w-full text-left rounded-2xl px-4 py-3.5 transition-all"
                style={{
                  background: isActive
                    ? `linear-gradient(135deg, ${mode.color}18, ${mode.color}08)`
                    : "rgba(255,255,255,0.03)",
                  border: isActive
                    ? `1px solid ${mode.color}44`
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{mode.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-black"
                      style={{ color: isActive ? mode.color : "#ffffff" }}
                    >
                      {mode.label}
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "#9ca3af" }}
                    >
                      {mode.sub}
                    </p>
                  </div>
                  {isActive && (
                    <Check
                      className="w-4 h-4 shrink-0"
                      style={{ color: mode.color }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {selectedMode === "equal_coheadliner" && (
        <Section title="Co-Headliner">
          {coHeadliners.length === 0 && !coHeadlinersLoading ? (
            <button
              type="button"
              onClick={onLoadCoHeadliners}
              className="w-full rounded-2xl px-4 py-3 text-sm font-black transition-all"
              style={{
                background: "rgba(52,211,153,0.10)",
                color: "#86efac",
                border: "1px solid rgba(52,211,153,0.2)",
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                Find Co-Headliners
              </div>
              {routeBuilderSequence.length > 0 && (
                <p className="text-[10px] mt-1 font-normal" style={{ color: "#9ca3af" }}>
                  Route regions will be preferred, but not required
                </p>
              )}
            </button>
          ) : coHeadlinersLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              <span className="ml-2 text-xs text-white/40">Scouting co-headliners...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {coHeadliners.map((candidate) => {
                const isSelected = selectedCoHeadlinerId === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelectCoHeadliner(candidate)}
                    className="w-full text-left rounded-2xl px-4 py-3 transition-all"
                    style={{
                      background: isSelected ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                      border: isSelected ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-white truncate">{candidate.artist_name}</p>
                          {candidate.is_preferred_region && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ background: "rgba(52,211,153,0.12)", color: "#86efac", border: "1px solid rgba(52,211,153,0.25)" }}>
                              Route Fit
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: "#9ca3af" }}>
                          {candidate.genre} · {candidate.career_stage} · {formatNumber(candidate.followers || candidate.fans || 0)} followers
                        </p>
                        {candidate.region && (
                          <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>
                            Based in {candidate.region}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: "#34d399" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* Opening Acts */}
      <Section title="Opening Acts">
        {openers.length === 0 && !openersLoading ? (
          <button
            type="button"
            onClick={onLoadOpeners}
            className="w-full rounded-2xl px-4 py-3 text-sm font-black transition-all"
            style={{
              background: "rgba(124,58,237,0.10)",
              color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              Find Opening Acts
            </div>
            {routeBuilderSequence.length > 0 && (
              <p
                className="text-[10px] mt-1 font-normal"
                style={{ color: "#9ca3af" }}
              >
                Route regions will be preferred, but not required
              </p>
            )}
          </button>
        ) : openersLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            <span className="ml-2 text-xs text-white/40">
              Scouting opening acts...
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {openers.map((opener) => {
              const isSelected = selectedOpenerIds.has(opener.id);
              const planEntry = (wizardPlan.openingActs || []).find(
                (o) => o.id === opener.id
              );
              return (
                <div key={opener.id} className="space-y-0">
                  <button
                    type="button"
                    onClick={() => toggleOpener(opener)}
                    className="w-full text-left rounded-2xl px-4 py-3 transition-all"
                    style={{
                      background: isSelected
                        ? "rgba(124,58,237,0.12)"
                        : "rgba(255,255,255,0.03)",
                      border: isSelected
                        ? "1px solid rgba(139,92,246,0.35)"
                        : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0"
                        style={{
                          background: isSelected
                            ? "rgba(124,58,237,0.25)"
                            : "rgba(255,255,255,0.06)",
                        }}
                      >
                        <Music
                          className="w-4 h-4"
                          style={{
                            color: isSelected ? "#c4b5fd" : "#6b7280",
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white truncate">
                          {opener.artist_name}
                        </p>
                        <p
                          className="text-[10px] mt-0.5"
                          style={{ color: "#9ca3af" }}
                        >
                          {opener.genre} · {opener.career_stage} ·{" "}
                          {formatNumber(opener.followers || opener.fans || 0)}{" "}
                          followers
                        </p>
                        {opener.region && (
                          <p
                            className="text-[10px] mt-0.5"
                            style={{ color: "#6b7280" }}
                          >
                            Based in {opener.region}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 shrink-0 text-purple-400" />
                      )}
                    </div>
                  </button>

                  {/* Revenue split slider */}
                  {isSelected && planEntry && (
                    <div
                      className="mx-4 mt-1 mb-2 rounded-xl px-3 py-2"
                      style={{
                        background: "rgba(124,58,237,0.06)",
                        border: "1px solid rgba(139,92,246,0.12)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] font-black uppercase tracking-widest"
                          style={{ color: "#9ca3af" }}
                        >
                          Revenue Split
                        </span>
                        <span
                          className="text-xs font-black"
                          style={{ color: "#c4b5fd" }}
                        >
                          {Math.round((Number(planEntry.revenueSplit) || 0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={50}
                        step={5}
                        value={Math.round((Number(planEntry.revenueSplit) || 0) * 100)}
                        onChange={(e) =>
                          updateOpenerSplit(
                            opener.id,
                            Number(e.target.value)
                          )
                        }
                        className="w-full mt-1 accent-purple-500"
                        style={{ height: 4 }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Tour Sponsorships */}
      <Section title="Tour Sponsorship">
        {sponsors.length === 0 && !sponsorsLoading ? (
          <button
            type="button"
            onClick={onLoadSponsors}
            className="w-full rounded-2xl px-4 py-3 text-sm font-black transition-all"
            style={{
              background: "rgba(124,58,237,0.10)",
              color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              Find Sponsors
            </div>
          </button>
        ) : sponsorsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            <span className="ml-2 text-xs text-white/40">
              Finding sponsors...
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {sponsors.map((sponsor) => {
              const sponsorKey = getSponsorKey(sponsor);
              const isSelected = selectedSponsorId === sponsorKey;
              const alignmentTags = Array.isArray(sponsor.alignment_tags)
                ? sponsor.alignment_tags
                : [];
              const aestheticTags = Array.isArray(sponsor.aesthetic_tags)
                ? sponsor.aesthetic_tags
                : [];
              const matchCount = alignmentTags.filter((t) =>
                aestheticTags.includes(t)
              ).length;
              const fitLabel =
                matchCount > 0 ? "Good Fit" : "Potential Clash";
              const fitColor = matchCount > 0 ? "#34d399" : "#fbbf24";
              const clashRisk = Number(sponsor.clash_risk ?? 0);
              const clashRiskPercent = Math.max(
                0,
                Math.min(100, Math.round(clashRisk <= 1 ? clashRisk * 100 : clashRisk))
              );

              return (
                <button
                  key={sponsorKey}
                  type="button"
                  onClick={() => handleSelectSponsor(sponsor)}
                  className="w-full text-left rounded-2xl px-4 py-3.5 transition-all"
                  style={{
                    background: isSelected
                      ? "rgba(124,58,237,0.12)"
                      : "rgba(255,255,255,0.03)",
                    border: isSelected
                      ? "1px solid rgba(139,92,246,0.35)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {sponsor.brand_name || sponsor.name}
                        </p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            background:
                              matchCount > 0
                                ? "rgba(52,211,153,0.10)"
                                : "rgba(251,191,36,0.10)",
                            color: fitColor,
                            border: `1px solid ${fitColor}33`,
                          }}
                        >
                          {fitLabel}
                        </span>
                      </div>
                      <p
                        className="text-[11px] font-semibold mt-1"
                        style={{ color: "#86efac" }}
                      >
                        {formatCurrency(sponsor.payout || 0)} payout
                      </p>

                      {/* Alignment tags */}
                      {alignmentTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {alignmentTags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded-full text-[8px] font-medium"
                              style={{
                                background: "rgba(255,255,255,0.05)",
                                color: "#d1d5db",
                                border: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Clash risk bar */}
                      {clashRiskPercent > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className="text-[8px] font-semibold uppercase tracking-[0.16em]"
                              style={{ color: "#6b7280" }}
                            >
                              Clash Risk
                            </span>
                            <span
                              className="text-[10px] font-semibold"
                              style={{
                                color:
                                  clashRiskPercent > 50 ? "#f87171" : "#fbbf24",
                              }}
                            >
                              {clashRiskPercent}%
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${clashRiskPercent}%`,
                                background:
                                  clashRiskPercent > 50
                                    ? "linear-gradient(90deg, #f87171, #ef4444)"
                                    : "linear-gradient(90deg, #fbbf24, #f59e0b)",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 shrink-0 text-purple-400 mt-1" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
