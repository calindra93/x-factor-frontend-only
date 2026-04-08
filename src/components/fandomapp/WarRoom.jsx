import React, { useState } from "react";
import { motion } from "framer-motion";
import { Swords, TrendingUp, TrendingDown, Minus, Lock } from "lucide-react";

const STATUS_PALETTE = {
  escalated: { bg: "rgba(239,83,80,0.08)", border: "rgba(239,83,80,0.25)", text: "#EF5350", label: "Escalated" },
  active: { bg: "rgba(247,165,75,0.08)", border: "rgba(247,165,75,0.2)", text: "#F7A54B", label: "Active" },
  cooling: { bg: "rgba(124,110,247,0.08)", border: "rgba(124,110,247,0.2)", text: "#7C6EF7", label: "Cooling" },
  resolved: { bg: "rgba(76,175,130,0.08)", border: "rgba(76,175,130,0.2)", text: "#4CAF82", label: "Resolved" },
};

const MOMENTUM_ICONS = { rising: TrendingUp, falling: TrendingDown };

const fmt = (value) => Number(value || 0).toLocaleString();

function getWarTriggerLabel(war) {
  return war.source_trigger || war.trigger_event || "Organic tension";
}

function getWarTurns(war) {
  return Number(war.duration_turns ?? war.turns_active ?? war.duration ?? 0) || 0;
}

function getWarResolvedTurn(war) {
  return Number(war.resolved_turn ?? 0) || 0;
}

function getWarOpponent(war) {
  return war.rival_name || war.opponent_name || "Unknown Rival";
}

function getWarMomentumState(war, intensity) {
  if (war.challenger_momentum != null || war.target_momentum != null) {
    const diff = Number(war.challenger_momentum || 0) - Number(war.target_momentum || 0);
    if (diff >= 5) return "rising";
    if (diff <= -5) return "falling";
    return null;
  }
  if (war.momentum) return war.momentum;
  if (intensity >= 70) return "rising";
  if (intensity <= 20) return "falling";
  return null;
}

function getWarPressureCopy(war, intensity) {
  if (war.status === "cooling") return "Cooling off — pressure is easing, but not fully gone.";
  if (intensity >= 80) return "Critical heat — morale and toxicity pressure are likely peaking.";
  if (intensity >= 55) return "Volatile — this can still tip into full escalation.";
  return "Contained — fans are active, but the war is still manageable.";
}

function getResolvedArchiveCopy(war) {
  const resolvedTurn = getWarResolvedTurn(war);
  return resolvedTurn > 0 ? `Resolved on turn ${fmt(resolvedTurn)}` : "Resolved recently";
}

function getInterventionIcon(intervention) {
  if (intervention.category === "calming") return "🕊️";
  if (intervention.id === "public_feud" || intervention.id === "controversial_statement") return "☢️";
  if (intervention.id === "fan_qa") return "🎤";
  if (intervention.id === "charity_donation") return "💸";
  if (intervention.id === "collab_with_rival") return "🤝";
  return "📣";
}

function IntensityBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "#EF5350" : pct >= 40 ? "#F7A54B" : "#8B5CF6";
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden w-full">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}33` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

function MomentumSplitBar({ challengerMomentum = 0, targetMomentum = 0, opponentName }) {
  const total = Math.max(1, challengerMomentum + targetMomentum);
  const challengerPct = Math.max(8, Math.min(92, (challengerMomentum / total) * 100));
  const targetPct = 100 - challengerPct;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[9px] text-white/35 mb-1">
        <span>Your fans · {fmt(challengerMomentum)}</span>
        <span>{opponentName} · {fmt(targetMomentum)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-white/[0.05] flex">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${challengerPct}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ background: "linear-gradient(90deg, rgba(239,83,80,0.85), rgba(247,165,75,0.85))" }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${targetPct}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ background: "linear-gradient(90deg, rgba(124,110,247,0.8), rgba(76,175,130,0.8))" }}
        />
      </div>
    </div>
  );
}

function BridgeContextCard({ war }) {
  const linkedControversy = war.linked_controversy;
  if (!linkedControversy) return null;

  const sourceName = linkedControversy.source_profile?.artist_name || "Unknown Rival";
  const controversyTitle = linkedControversy.title || (linkedControversy.controversy_type || "controversy").replace(/_/g, " ");
  const escalationCopy = linkedControversy.escalation_reason || "Escalated from sustained controversy pressure.";

  return (
    <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Escalation Source</div>
      <div className="text-[11px] font-extrabold text-white/75">{controversyTitle}</div>
      <div className="text-[10px] text-white/40 mt-0.5">Source: {sourceName}</div>
      <div className="text-[10px] text-white/35 mt-1 leading-relaxed">{escalationCopy}</div>
      {linkedControversy.escalated_to_fan_war_at_turn != null && (
        <div className="text-[9px] text-white/25 mt-1">Bridge stamped on turn {fmt(linkedControversy.escalated_to_fan_war_at_turn)}</div>
      )}
    </div>
  );
}

function WarCard({ war, index }) {
  const status = STATUS_PALETTE[war.status] || STATUS_PALETTE.active;
  const intensity = Number(war.intensity) || 0;
  const momentum = getWarMomentumState(war, intensity);
  const MomentumIcon = MOMENTUM_ICONS[momentum] || Minus;
  const publicHeat = Number(war.public_attention) || 0;
  const turnsActive = getWarTurns(war);
  const challengerMomentum = Number(war.challenger_momentum || 0);
  const targetMomentum = Number(war.target_momentum || 0);
  const momentumGap = Math.abs(challengerMomentum - targetMomentum);
  const hasMomentumSplit = war.challenger_momentum != null || war.target_momentum != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="relative rounded-2xl overflow-hidden"
      style={{ background: status.bg, border: `1px solid ${status.border}` }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
        background: `linear-gradient(90deg, transparent, ${status.text}, transparent)`,
        opacity: 0.6,
      }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Swords size={13} style={{ color: status.text }} />
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: `${status.text}15`, color: status.text, border: `1px solid ${status.text}30` }}
              >
                {status.label}
              </span>
            </div>
            <div className="text-sm font-extrabold text-white truncate">{getWarOpponent(war)}</div>
            <div className="text-[10px] text-white/30 mt-0.5 truncate">{getWarTriggerLabel(war)}</div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <MomentumIcon size={14} style={{ color: momentum === "rising" ? "#EF5350" : momentum === "falling" ? "#4CAF82" : "rgba(255,255,255,0.2)" }} />
            <span className="text-lg font-black tabular-nums" style={{ color: status.text }}>{intensity}</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] font-bold uppercase tracking-widest text-white/25">Intensity</span>
            <span className="text-[9px] text-white/30 tabular-nums">{intensity}/100</span>
          </div>
          <IntensityBar value={intensity} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Public Heat", value: publicHeat > 0 ? fmt(publicHeat) : "—", color: "#ec4899" },
            { label: "Momentum Gap", value: momentumGap > 0 ? fmt(momentumGap) : "—", color: "#a78bfa" },
            { label: "Turns Active", value: turnsActive > 0 ? fmt(turnsActive) : "—", color: "#F7A54B" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest mb-0.5" style={{ color: `${stat.color}60` }}>{stat.label}</div>
              <div className="text-xs font-extrabold tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <BridgeContextCard war={war} />

        {hasMomentumSplit && (
          <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Versus Momentum</div>
            <MomentumSplitBar
              challengerMomentum={challengerMomentum}
              targetMomentum={targetMomentum}
              opponentName={getWarOpponent(war)}
            />
          </div>
        )}

        <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Pressure Read</div>
          <div className="text-[10px] text-white/45 leading-relaxed">{getWarPressureCopy(war, intensity)}</div>
        </div>
      </div>
    </motion.div>
  );
}

function ResolvedWarRow({ war, index }) {
  const status = STATUS_PALETTE.resolved;
  const linkedControversy = war.linked_controversy;
  const sourceName = linkedControversy?.source_profile?.artist_name || null;
  const archiveDetail = linkedControversy?.title || linkedControversy?.escalation_reason || "No controversy bridge was captured for this war.";
  const challengerMomentum = Number(war.challenger_momentum || 0);
  const targetMomentum = Number(war.target_momentum || 0);
  const hasMomentumSplit = war.challenger_momentum != null || war.target_momentum != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="rounded-2xl p-3"
      style={{ background: status.bg, border: `1px solid ${status.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `${status.text}BB` }}>{getResolvedArchiveCopy(war)}</div>
          <div className="text-[12px] font-extrabold text-white/85 mt-0.5">{getWarOpponent(war)}</div>
          <div className="text-[10px] text-white/35 mt-0.5">{archiveDetail}</div>
          {sourceName && <div className="text-[10px] text-white/28 mt-1">Source rivalry spark: {sourceName}</div>}
        </div>
        <div className="text-right text-[10px] text-white/35">
          <div>Final heat {fmt(war.public_attention || 0)}</div>
          <div>Peak intensity {fmt(war.intensity || 0)}</div>
        </div>
      </div>

      {hasMomentumSplit && (
        <div className="mt-3">
          <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Final Versus Momentum</div>
          <MomentumSplitBar
            challengerMomentum={challengerMomentum}
            targetMomentum={targetMomentum}
            opponentName={getWarOpponent(war)}
          />
        </div>
      )}
    </motion.div>
  );
}

function InterventionButton({ label, icon, locked = true }) {
  return (
    <div className="relative flex-1">
      <button
        disabled={locked}
        className={`fandom-action-pill fandom-action-pill--block fandom-action-pill--stack ${locked ? "fandom-action-pill--disabled" : "fandom-action-pill--active"} min-h-[88px] py-3 px-2 text-[10px] font-bold uppercase tracking-wider`}
        style={{
          "--pill-accent": "#a78bfa",
          "--pill-accent-soft": "rgba(167,139,250,0.12)",
          "--pill-accent-border": "rgba(167,139,250,0.28)",
        }}
      >
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <span className="text-sm">{icon}</span>
          <span className="whitespace-nowrap text-[9px]">{label}</span>
        </div>
      </button>
      {locked && (
        <div className="absolute top-1.5 right-1.5">
          <Lock size={9} className="text-white/10" />
        </div>
      )}
    </div>
  );
}

function LiveInterventionButton({ intervention, onClick, loading, locked }) {
  const riskColor = intervention.category === "fueling" ? "#EF5350" : "#a78bfa";
  return (
    <button
      onClick={onClick}
      disabled={locked || loading}
      className={`fandom-action-surface ${locked || loading ? "fandom-action-pill--disabled" : "fandom-action-surface--active"} w-full text-left p-3`}
      style={{
        "--pill-accent": riskColor,
        "--pill-accent-soft": intervention.category === "fueling" ? "rgba(239,83,80,0.12)" : "rgba(167,139,250,0.12)",
        "--pill-accent-border": intervention.category === "fueling" ? "rgba(239,83,80,0.3)" : "rgba(167,139,250,0.28)",
        color: locked ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.88)",
        opacity: loading ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-sm leading-none mt-0.5">{getInterventionIcon(intervention)}</span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: locked ? "rgba(255,255,255,0.28)" : riskColor }}>
              {intervention.category}
            </div>
            <div className="text-[11px] font-extrabold text-white truncate">{intervention.label}</div>
            <div className="text-[10px] text-white/40 leading-relaxed mt-0.5">{intervention.desc}</div>
          </div>
        </div>
        {(locked || loading) && <Lock size={10} className="text-white/20 flex-shrink-0 mt-1" />}
      </div>

      <div className="flex flex-wrap gap-2 mt-2 text-[9px]">
        <span className="px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}>
          {intervention.energyCost} energy
        </span>
        {intervention.incomeCost > 0 && (
          <span className="px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}>
            ${Number(intervention.incomeCost).toLocaleString()}
          </span>
        )}
        {intervention.cloutCost > 0 && (
          <span className="px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}>
            {intervention.cloutCost} clout
          </span>
        )}
        <span className="px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)", color: intervention.category === "fueling" ? "#EF5350" : "#a78bfa" }}>
          {intervention.risk} risk
        </span>
      </div>

      <div className="mt-2 text-[10px]" style={{ color: locked ? "#F7A54B" : "rgba(255,255,255,0.45)" }}>
        {loading ? "Executing intervention…" : locked ? (intervention.lockReason || "Unavailable right now") : "Ready to execute"}
      </div>
    </button>
  );
}

export default function WarRoom({ wars = [], availableInterventions = [], onIntervene, interveningWarId, interveningActionId }) {
  const [warView, setWarView] = useState("active");
  const activeWars = wars.filter((war) => ["active", "escalated", "cooling"].includes(war.status));
  const resolvedWars = wars
    .filter((war) => war.status === "resolved")
    .sort((left, right) => getWarResolvedTurn(right) - getWarResolvedTurn(left));
  const escalatedWars = activeWars.filter((war) => war.status === "escalated").length;
  const avgIntensity = activeWars.length > 0
    ? Math.round(activeWars.reduce((sum, war) => sum + (Number(war.intensity) || 0), 0) / activeWars.length)
    : 0;
  const totalHeat = activeWars.reduce((sum, war) => sum + (Number(war.public_attention) || 0), 0);
  const hottestWar = [...activeWars].sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0))[0] || null;
  const calmingInterventions = availableInterventions.filter((intervention) => intervention.category === "calming");
  const fuelingInterventions = availableInterventions.filter((intervention) => intervention.category === "fueling");

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fandom-section-card"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Active Wars</span>
          <span className="text-xs font-extrabold tabular-nums" style={{ color: activeWars.length > 0 ? "#EF5350" : "rgba(255,255,255,0.15)" }}>
            {activeWars.length}
          </span>
        </div>
        <p className="text-[10px] text-white/20 leading-relaxed">
          Fan wars pit your fanbase against a rival&apos;s. High intensity drains morale and boosts toxicity. Wars cool down naturally or escalate from provocations.
        </p>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Escalated", value: escalatedWars, color: "#EF5350" },
            { label: "Avg Intensity", value: activeWars.length > 0 ? avgIntensity : "—", color: "#F7A54B" },
            { label: "Public Heat", value: totalHeat > 0 ? fmt(totalHeat) : "—", color: "#a78bfa" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest mb-0.5" style={{ color: `${stat.color}60` }}>{stat.label}</div>
              <div className="text-sm font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {hottestWar && (
          <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Most volatile front</div>
            <div className="text-[11px] font-extrabold text-white/80">{getWarOpponent(hottestWar)}</div>
            <div className="text-[10px] text-white/35 mt-0.5">{getWarPressureCopy(hottestWar, Number(hottestWar.intensity) || 0)}</div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setWarView("active")}
            className={`fandom-action-pill ${warView === "active" ? "fandom-action-pill--active" : ""} px-3 py-2 text-[10px] font-bold uppercase tracking-widest`}
            style={{
              "--pill-accent": "#EF5350",
              "--pill-accent-soft": "rgba(239,83,80,0.12)",
              "--pill-accent-border": "rgba(239,83,80,0.28)",
            }}
          >
            Active Wars
          </button>
          <button
            onClick={() => setWarView("archive")}
            className={`fandom-action-pill ${warView === "archive" ? "fandom-action-pill--active" : ""} px-3 py-2 text-[10px] font-bold uppercase tracking-widest`}
            style={{
              "--pill-accent": "#4CAF82",
              "--pill-accent-soft": "rgba(76,175,130,0.12)",
              "--pill-accent-border": "rgba(76,175,130,0.24)",
            }}
          >
            Resolved Archive
          </button>
        </div>
      </motion.div>

      {warView === "active" ? (
        <>
          {activeWars.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.4 }}
              className="fandom-section-card"
            >
              <div className="text-center py-8">
                <div className="text-3xl mb-3 opacity-30">⚔️</div>
                <div className="text-sm font-bold text-white/25 mb-1">No Active Wars</div>
                <div className="text-[10px] text-white/15">Your fanbase is at peace… for now.</div>
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeWars.map((war, index) => (
                <WarCard key={war.id} war={war} index={index} />
              ))}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="fandom-section-card"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Interventions</span>
              <span className="text-[8px] font-semibold uppercase tracking-widest text-white/20">Live</span>
            </div>
            <div className="text-[10px] text-white/25 leading-relaxed mb-3">
              Interventions are backend-driven for costs and lock reasons. Use calming moves to cool the room or fueling moves to weaponize the heat.
            </div>

            {activeWars.length === 0 ? (
              <div className="flex items-stretch gap-2">
                <InterventionButton label="Rally Fans" icon="📣" />
                <InterventionButton label="De-escalate" icon="🕊️" />
                <InterventionButton label="Go Nuclear" icon="☢️" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {activeWars.map((war) => (
                  <div key={`actions-${war.id}`} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">For {getWarOpponent(war)}</div>
                        <div className="text-[11px] text-white/45">Intensity {Number(war.intensity) || 0} · {getWarTriggerLabel(war)}</div>
                      </div>
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: STATUS_PALETTE[war.status]?.text || "#F7A54B" }}>
                        {STATUS_PALETTE[war.status]?.label || war.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {[...calmingInterventions, ...fuelingInterventions].map((intervention) => {
                        const loading = interveningWarId === war.id && interveningActionId === intervention.id;
                        const locked = !intervention.available;
                        return (
                          <LiveInterventionButton
                            key={`${war.id}-${intervention.id}`}
                            intervention={intervention}
                            loading={loading}
                            locked={locked}
                            onClick={() => onIntervene?.(war.id, intervention)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className="fandom-section-card"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Resolved Archive</span>
            <span className="text-[8px] font-semibold uppercase tracking-widest text-white/20">History</span>
          </div>
          <div className="text-[10px] text-white/25 leading-relaxed mb-3">
            Closed fronts stay here with their bridge context and final momentum snapshot, so you can see what started the war and how it ended.
          </div>

          {resolvedWars.length === 0 ? (
            <div className="text-center py-6 text-[10px] text-white/20">No wars have resolved yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {resolvedWars.map((war, index) => (
                <ResolvedWarRow key={`resolved-${war.id}`} war={war} index={index} />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </>
  );
}
