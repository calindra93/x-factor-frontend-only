import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from "lucide-react";
import {
  PACING_OPTIONS,
  TICKET_TIER_MULTIPLIERS,
  TRANSPORT_TIERS,
  computeTransportCost,
  getAvailableSellTypes,
} from "@/lib/tourWizardModel";

// ─── Section Helper ──────────────────────────────────────────────────────────

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

// ─── Selectable Card ─────────────────────────────────────────────────────────

function SelectableCard({ selected, onClick, disabled, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-3 text-left transition-all"
      style={{
        background: disabled
          ? "rgba(255,255,255,0.01)"
          : selected
            ? "rgba(139,92,246,0.12)"
            : "rgba(255,255,255,0.03)",
        border: selected
          ? "1px solid rgba(139,92,246,0.4)"
          : "1px solid rgba(255,255,255,0.06)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <div className="flex items-start gap-3">
        {selected && (
          <div className="mt-0.5 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </button>
  );
}

// ─── Stat Mod Pills ──────────────────────────────────────────────────────────

const STAT_MOD_LABELS = {
  stamina: "Stamina",
  streetCred: "Street Cred",
  crewMorale: "Crew Morale",
  speed: "Speed",
  budget: "Budget",
  vibe: "Vibe",
  songwriting: "Songwriting",
  divaScore: "Diva Score",
  production: "Production",
  profitMargin: "Profit Margin",
};

function StatModPills({ statMods }) {
  const entries = Object.entries(statMods || {});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {entries.map(([key, val]) => {
        const positive = val > 0;
        const pct = Math.round(val * 100);
        const label = STAT_MOD_LABELS[key] || key;
        return (
          <span
            key={key}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: positive
                ? "rgba(34,197,94,0.12)"
                : "rgba(248,113,113,0.12)",
              color: positive ? "#86efac" : "#fca5a5",
            }}
          >
            {positive ? "+" : ""}
            {pct}% {label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Tier Label Pills ────────────────────────────────────────────────────────

const TIER_LABELS = { ga: "GA", reserved: "Reserved", vip: "VIP", meet_greet: "M&G" };

function getCrewMemberKey(member) {
  return member?.id || `${member?.name || 'crew'}:${member?.specialty || 'general'}:${member?.salary_per_turn || 0}`;
}

export function toggleCrewSelection(currentCrew = [], member, crewMaxSlots = 0) {
  const memberKey = getCrewMemberKey(member);
  const ids = new Set(currentCrew.map((c) => getCrewMemberKey(c)));
  if (ids.has(memberKey)) {
    return currentCrew.filter((c) => getCrewMemberKey(c) !== memberKey);
  }
  if (currentCrew.length >= crewMaxSlots) {
    return currentCrew;
  }
  return [...currentCrew, member];
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WizardStepLogistics({
  wizardPlan,
  setWizardPlan,
  profile,
  routeBuilderDraft,
  merch,
  crewPool,
  crewMaxSlots,
  crewLoading,
  onLoadCrew,
}) {
  const [customizeTiers, setCustomizeTiers] = useState(false);
  const stopCount = routeBuilderDraft?.stopCount || 1;

  // ── Pacing ───────────────────────────────────────────────────────────────

  const renderPacing = () => (
    <Section title="Schedule Pacing">
      <div className="grid grid-cols-2 gap-2">
        {PACING_OPTIONS.map((opt) => {
          const selected = wizardPlan.strategy?.pacing === opt.id;
          return (
            <SelectableCard
              key={opt.id}
              selected={selected}
              onClick={() =>
                setWizardPlan((p) => ({
                  ...p,
                  strategy: { ...p.strategy, pacing: opt.id },
                }))
              }
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">{opt.label}</span>
                <span
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(139,92,246,0.15)",
                    color: "#c4b5fd",
                  }}
                >
                  {opt.fatigueMult}x fatigue
                </span>
                {opt.risky && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(248,113,113,0.12)",
                      color: "#fca5a5",
                    }}
                  >
                    ⚠️ RISKY
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>
                {opt.description}
              </p>
            </SelectableCard>
          );
        })}
      </div>
    </Section>
  );

  // ── Ticket Pricing ───────────────────────────────────────────────────────

  const basePrice = wizardPlan.strategy?.ticketPrice ?? 25;

  const handleBasePriceChange = (val) => {
    const base = Number(val);
    setWizardPlan((p) => ({
      ...p,
      strategy: { ...p.strategy, ticketPrice: base },
      ticketTiers: {
        ga: base,
        reserved: Math.round(base * TICKET_TIER_MULTIPLIERS.reserved),
        vip: Math.round(base * TICKET_TIER_MULTIPLIERS.vip),
        meet_greet: Math.round(base * TICKET_TIER_MULTIPLIERS.meet_greet),
      },
    }));
  };

  const handleTierOverride = (tier, val) => {
    setWizardPlan((p) => ({
      ...p,
      ticketTiers: { ...p.ticketTiers, [tier]: Number(val) },
    }));
  };

  const renderTicketPricing = () => (
    <Section title="Ticket Pricing">
      <div
        className="rounded-2xl px-4 py-4 space-y-4"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Base price */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Base Price</span>
            <span
              className="text-lg font-mono font-bold"
              style={{ color: "#c4b5fd" }}
            >
              ${basePrice}
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={basePrice}
            onChange={(e) => handleBasePriceChange(e.target.value)}
            className="w-full accent-purple-600"
          />
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>$10</span>
            <span>$200</span>
          </div>
        </div>

        {/* Tier pills */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(wizardPlan.ticketTiers || {}).map(([tier, price]) => (
            <span
              key={tier}
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(139,92,246,0.12)",
                color: "#c4b5fd",
              }}
            >
              {TIER_LABELS[tier] || tier} ${price}
            </span>
          ))}
        </div>

        {/* Fan warning */}
        {basePrice > 75 && (
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2"
            style={{
              background: "rgba(250,204,21,0.08)",
              border: "1px solid rgba(250,204,21,0.2)",
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
            <span className="text-[11px]" style={{ color: "#fde68a" }}>
              High prices may upset casual fans and increase backlash risk.
            </span>
          </div>
        )}

        {/* Customize toggle */}
        <button
          type="button"
          onClick={() => setCustomizeTiers((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold"
          style={{ color: "#a78bfa" }}
        >
          Customize tiers
          {customizeTiers ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {customizeTiers && (
          <div className="space-y-3 pt-1">
            {Object.entries(wizardPlan.ticketTiers || {}).map(([tier, price]) => (
              <div key={tier} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{TIER_LABELS[tier] || tier}</span>
                  <span className="text-xs font-mono font-bold text-white">${price}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={tier === "meet_greet" ? 1000 : tier === "vip" ? 500 : 300}
                  step={5}
                  value={price}
                  onChange={(e) => handleTierOverride(tier, e.target.value)}
                  className="w-full accent-purple-600"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );

  // ── Ticket Sell Types ────────────────────────────────────────────────────

  const sellTypes = getAvailableSellTypes(
    wizardPlan.category?.id,
    wizardPlan.venueSize
  );
  const activeSellTypes = wizardPlan.ticketSellTypes || [];

  const toggleSellType = (id) => {
    setWizardPlan((p) => {
      const current = p.ticketSellTypes || [];
      const next = current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id];
      return { ...p, ticketSellTypes: next };
    });
  };

  const renderSellTypes = () => (
    <Section title="Ticket Sell Types">
      <div className="flex flex-wrap gap-2">
        {sellTypes.map((st) => {
          const active = activeSellTypes.includes(st.id);
          const disabled = st.disabled;
          return (
            <button
              key={st.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && toggleSellType(st.id)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: disabled
                  ? "rgba(255,255,255,0.02)"
                  : active
                    ? "rgba(139,92,246,0.25)"
                    : "rgba(255,255,255,0.05)",
                border: active
                  ? "1px solid rgba(139,92,246,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: disabled ? "#4b5563" : active ? "#c4b5fd" : "#9ca3af",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              title={disabled ? "Not available for this tour type" : st.effect}
            >
              {st.label}
            </button>
          );
        })}
      </div>
      {/* Effect hint for selected types */}
      {activeSellTypes.length > 0 && (
        <div className="space-y-1 mt-1">
          {sellTypes
            .filter((st) => activeSellTypes.includes(st.id))
            .map((st) => (
              <p key={st.id} className="text-[10px]" style={{ color: "#6b7280" }}>
                {st.label}: {st.effect}
              </p>
            ))}
        </div>
      )}
    </Section>
  );

  // ── Transportation ───────────────────────────────────────────────────────

  const liquidFundsRaw = profile?.income ?? profile?.cash_balance ?? profile?.cash ?? profile?.money;
  const hasKnownLiquidFunds = liquidFundsRaw != null;
  const availableFunds = Number(liquidFundsRaw ?? 0) || 0;

  const renderTransport = () => (
    <Section title="Transportation">
      <div className="space-y-2">
        {TRANSPORT_TIERS.map((tier) => {
          const selected = wizardPlan.transportTier === tier.id;
          const totalCost = tier.costPerStop * stopCount;
          const tooExpensive = hasKnownLiquidFunds && totalCost > availableFunds;
          return (
            <SelectableCard
              key={tier.id}
              selected={selected}
              disabled={tooExpensive}
              onClick={() =>
                setWizardPlan((p) => ({ ...p, transportTier: tier.id }))
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">{tier.label}</span>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        color: "#9ca3af",
                      }}
                    >
                      Lv.{tier.level}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "#9ca3af" }}>
                    {tier.description}
                  </p>
                  <StatModPills statMods={tier.statMods} />
                </div>
                <div className="text-right flex-shrink-0">
                  <span
                    className="text-xs font-mono font-bold"
                    style={{ color: "#c4b5fd" }}
                  >
                    ${tier.costPerStop.toLocaleString()}
                  </span>
                  <p className="text-[10px]" style={{ color: "#6b7280" }}>
                    /stop
                  </p>
                </div>
              </div>
              {tooExpensive && (
                <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>
                  Requires ${totalCost.toLocaleString()} total transport budget. Available cash: ${availableFunds.toLocaleString()}
                </p>
              )}
            </SelectableCard>
          );
        })}
      </div>

      {/* Transport summary */}
      {wizardPlan.transportTier && (
        <div
          className="rounded-xl px-3 py-2 mt-2 flex items-center justify-between"
          style={{
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
          }}
        >
          <span className="text-xs text-gray-400">Transport Cost</span>
          <span className="text-sm font-mono font-bold" style={{ color: "#c4b5fd" }}>
            ${computeTransportCost(wizardPlan.transportTier, stopCount).toLocaleString()}{" "}
            <span className="text-[10px] font-normal text-gray-500">
              for {stopCount} stop{stopCount !== 1 ? "s" : ""}
            </span>
          </span>
        </div>
      )}
    </Section>
  );

  // ── Crew ─────────────────────────────────────────────────────────────────

  const selectedCrew = wizardPlan.crew || [];
  const selectedCrewIds = new Set(selectedCrew.map((c) => getCrewMemberKey(c)));

  const toggleCrew = (member) => {
    setWizardPlan((p) => {
      const current = p.crew || [];
      const nextCrew = toggleCrewSelection(current, member, crewMaxSlots);
      if (nextCrew === current) return p;
      return { ...p, crew: nextCrew };
    });
  };

  const renderCrew = () => (
    <Section title="Crew">
      {crewPool.length === 0 && !crewLoading && (
        <button
          type="button"
          onClick={onLoadCrew}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
          style={{
            background: "rgba(139,92,246,0.10)",
            border: "1px solid rgba(139,92,246,0.3)",
            color: "#c4b5fd",
          }}
        >
          Load Crew Options
        </button>
      )}

      {crewLoading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#a78bfa" }} />
          <span className="text-xs text-gray-400">Loading crew pool...</span>
        </div>
      )}

      {crewPool.length > 0 && (
        <>
          <p className="text-[11px] font-semibold" style={{ color: "#9ca3af" }}>
            {selectedCrew.length}/{crewMaxSlots} crew slots used
          </p>
          <div className="space-y-2">
            {crewPool.map((member) => {
              const memberKey = getCrewMemberKey(member);
              const sel = selectedCrewIds.has(memberKey);
              const full = selectedCrew.length >= crewMaxSlots && !sel;
              return (
                <SelectableCard
                  key={memberKey}
                  selected={sel}
                  disabled={full}
                  onClick={() => toggleCrew(member)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white">
                        {member.name}
                      </span>
                      {member.specialty && (
                        <span
                          className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: "rgba(139,92,246,0.12)",
                            color: "#c4b5fd",
                          }}
                        >
                          {member.specialty}
                        </span>
                      )}
                      {/* Quality bar */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div
                          className="h-1.5 rounded-full flex-1"
                          style={{ background: "rgba(255,255,255,0.06)", maxWidth: 100 }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, member.quality || 0)}%`,
                              background: "linear-gradient(90deg, #8b5cf6, #d946ef)",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500">
                          Q:{member.quality || 0}
                        </span>
                        {member.morale != null && (
                          <span className="text-[10px] text-gray-500">
                            M:{member.morale}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: "#c4b5fd" }}
                      >
                        ${member.salary_per_turn || 0}
                      </span>
                      <p className="text-[10px]" style={{ color: "#6b7280" }}>
                        /turn
                      </p>
                      <p className="text-[10px] mt-1 font-black" style={{ color: sel ? "#c4b5fd" : "#6b7280" }}>
                        {sel ? "Selected" : full ? "Slots full" : "Tap to add"}
                      </p>
                    </div>
                  </div>
                </SelectableCard>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );

  // ── Merch ────────────────────────────────────────────────────────────────

  const selectedMerchIds = new Set((wizardPlan.selectedMerch || []).map((m) => m.id));

  const toggleMerch = (item) => {
    setWizardPlan((p) => {
      const current = p.selectedMerch || [];
      const ids = new Set(current.map((m) => m.id));
      if (ids.has(item.id)) {
        return { ...p, selectedMerch: current.filter((m) => m.id !== item.id) };
      }
      return { ...p, selectedMerch: [...current, item] };
    });
  };

  const renderMerch = () => {
    const items = merch || [];
    if (items.length === 0) {
      return (
        <Section title="Tour Merch">
          <p className="text-xs" style={{ color: "#6b7280" }}>
            No active merch items available. Create merch in the Merch app first.
          </p>
        </Section>
      );
    }
    return (
      <Section title="Tour Merch">
        <div className="space-y-1.5">
          {items.map((item) => {
            const sel = selectedMerchIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleMerch(item)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  background: sel
                    ? "rgba(139,92,246,0.12)"
                    : "rgba(255,255,255,0.03)",
                  border: sel
                    ? "1px solid rgba(139,92,246,0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Checkbox */}
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: sel ? "#8b5cf6" : "rgba(255,255,255,0.06)",
                    border: sel ? "none" : "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {sel && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-white">{item.name}</span>
                  {item.type && (
                    <span className="ml-2 text-[10px] text-gray-500">
                      {item.type}
                    </span>
                  )}
                </div>
                <span
                  className="text-xs font-mono font-bold flex-shrink-0"
                  style={{ color: "#c4b5fd" }}
                >
                  ${item.price || 0}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>
          {(wizardPlan.selectedMerch || []).length} item
          {(wizardPlan.selectedMerch || []).length !== 1 ? "s" : ""} selected
        </p>
      </Section>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {renderPacing()}
      {renderTicketPricing()}
      {renderSellTypes()}
      {renderTransport()}
      {renderCrew()}
      {renderMerch()}
    </div>
  );
}
