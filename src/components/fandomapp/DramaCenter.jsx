import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import ThreatRadar from "@/components/fandomapp/ThreatRadar";

function Section({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="fandom-section-card"
    >
      {children}
    </motion.div>
  );
}

export default function DramaCenter({
  controversies,
  wars,
  dramaRituals = [],
  toxicity,
  shadowTicks,
  respondToControversy,
  respondingId,
  ritualLoadingKey,
  onUseDramaRitual,
  onOpenWarRoom,
}) {
  const activeContros = controversies.filter(c => c.phase !== "resolved");
  const peakCount = controversies.filter(c => c.phase === "peak").length;
  const spreadCount = controversies.filter(c => c.phase === "spread").length;
  const warPressure = wars.filter(w => ["active", "escalated", "cooling"].includes(w.status)).length;
  const highestAttention = activeContros.reduce(
    (max, controversy) => Math.max(max, Number(controversy.public_attention) || 0),
    0,
  );

  let pressureCopy = "Low chatter — the room is watchful, but nothing is dominating the cycle.";
  if (peakCount > 0 || toxicity >= 70) {
    pressureCopy = "Critical narrative pressure — brand trust and morale are both vulnerable right now.";
  } else if (spreadCount > 0 || toxicity >= 45 || warPressure > 0) {
    pressureCopy = "Narrative pressure is building — this is the window to respond before things harden.";
  }

  return (
    <>
      <Section delay={0}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Drama Overview</span>
          {peakCount > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: "rgba(239,83,80,0.1)", color: "#EF5350", border: "1px solid rgba(239,83,80,0.2)" }}>
              {peakCount} at peak
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Active", value: activeContros.length, color: "#F7A54B" },
            { label: "Toxicity", value: toxicity, color: toxicity >= 60 ? "#EF5350" : toxicity >= 40 ? "#F7A54B" : "#7C6EF7" },
            { label: "Shadow", value: shadowTicks || 0, color: "#a78bfa", suffix: "t" },
          ].map(s => (
            <div key={s.label} className="text-center p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest mb-0.5" style={{ color: `${s.color}60` }}>{s.label}</div>
              <div className="text-base font-black tabular-nums" style={{ color: s.color }}>
                {s.value}{s.suffix || ""}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { label: "Spreading", value: spreadCount, color: "#F7A54B" },
            { label: "Highest Attention", value: highestAttention > 0 ? highestAttention : "—", color: "#ec4899" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="text-[8px] font-bold uppercase tracking-widest mb-0.5" style={{ color: `${stat.color}60` }}>{stat.label}</div>
              <div className="text-sm font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-[8px] font-bold uppercase tracking-widest text-white/25 mb-1">Pressure Read</div>
          <div className="text-[10px] text-white/45 leading-relaxed">{pressureCopy}</div>
        </div>

        {toxicity >= 60 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl"
            style={{ background: "rgba(239,83,80,0.06)", border: "1px solid rgba(239,83,80,0.18)" }}
          >
            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-red-400">
              High toxicity — brand trust is eroding
            </span>
          </motion.div>
        )}
      </Section>

      <Section delay={0.08}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Active Crises</span>
          <span className="text-[9px] text-white/20">Source, escalation, and handoff state</span>
        </div>

        {activeContros.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-white/25">
            No live crisis arc right now. If chatter spikes again, this panel will show who lit the fuse and whether it crossed into war.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeContros.slice(0, 3).map((controversy) => {
              const sourceName = controversy.source_profile?.artist_name || null;
              const linkedWar = controversy.linked_war || null;
              const responseState = controversy.response_taken || 'No response logged yet';
              const bridgeCopy = linkedWar
                ? `Escalated into ${linkedWar.opponent_name || 'an active war'} · ${linkedWar.status || 'active'}`
                : controversy.escalation_reason
                  ? `War pressure building · ${controversy.escalation_reason}`
                  : 'No linked war yet';

              return (
                <div
                  key={controversy.id}
                  className="p-3 rounded-xl border"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: linkedWar ? "rgba(247,165,75,0.18)" : "rgba(239,83,80,0.12)" }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-[11px] font-bold text-white/80">
                      {controversy.title || (controversy.controversy_type || 'controversy').replace(/_/g, ' ')}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-white/30">
                      {controversy.phase}
                    </div>
                  </div>

                  {sourceName && (
                    <div className="text-[10px] text-white/35 mb-1">
                      Source: <span className="text-white/65">{sourceName}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-white/45 mb-1">{bridgeCopy}</div>
                  <div className="text-[10px] text-white/30">Response state: {responseState}</div>

                  {linkedWar && onOpenWarRoom && (
                    <button
                      onClick={onOpenWarRoom}
                      className="fandom-action-pill fandom-action-pill--active mt-3 px-3 py-1.5 text-[10px] font-semibold border"
                      style={{
                        '--pill-accent': '#F7A54B',
                        '--pill-accent-soft': 'rgba(247,165,75,0.12)',
                        '--pill-accent-border': 'rgba(247,165,75,0.28)',
                      }}
                    >
                      Open War Room
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section delay={0.16}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Crisis Actions</span>
          <span className="text-[9px] text-white/20">Backend-driven ritual locks and outcomes</span>
        </div>

        {dramaRituals.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-white/25">
            No controversy-native ritual is available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {dramaRituals.map((ritual) => {
              const loading = ritualLoadingKey === ritual.key;
              return (
                <button
                  key={ritual.key}
                  onClick={() => !loading && ritual.available && onUseDramaRitual?.(ritual)}
                  disabled={loading || !ritual.available}
                  className={`fandom-action-surface w-full text-left p-3 ${ritual.available ? 'fandom-action-surface--active' : 'fandom-action-pill--disabled'}`}
                  style={{
                    '--pill-accent': ritual.key === 'apology_tour' ? '#4CAF82' : '#EF5350',
                    '--pill-accent-soft': ritual.key === 'apology_tour' ? 'rgba(76,175,130,0.12)' : 'rgba(239,83,80,0.12)',
                    '--pill-accent-border': ritual.key === 'apology_tour' ? 'rgba(76,175,130,0.28)' : 'rgba(239,83,80,0.28)',
                    color: ritual.available ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.38)',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-extrabold text-white">{ritual.name}</div>
                      <div className="text-[10px] text-white/45 mt-0.5">{ritual.effect}</div>
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-white/25">{ritual.platform}</div>
                  </div>
                  <div className="mt-2 text-[10px]" style={{ color: ritual.available ? 'rgba(255,255,255,0.45)' : '#F7A54B' }}>
                    {loading ? 'Executing crisis action…' : ritual.available ? `Ready · ${ritual.energyCost} energy` : (ritual.lockReason || 'Unavailable right now')}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section delay={0.24}>
        <ThreatRadar
          controversies={controversies}
          wars={wars}
          toxicity={toxicity}
          shadowTicks={shadowTicks}
          onRespondControversy={respondToControversy}
          respondingId={respondingId}
        />
      </Section>

      <Section delay={0.32}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Phase Read</span>
          <span className="text-[9px] text-white/20">How close each story is to hardening</span>
        </div>

        {activeContros.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-white/25">
            No active controversy cycle — the room is tense only if wars or toxicity keep it hot.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeContros.slice(0, 3).map((controversy) => {
              const phase = controversy.phase || "spark";
              const attention = Number(controversy.public_attention) || 0;
              const phaseColor = phase === "peak"
                ? "#EF5350"
                : phase === "spread"
                  ? "#F7A54B"
                  : phase === "aftermath"
                    ? "#a78bfa"
                    : "#7C6EF7";
              const phaseCopy = phase === "peak"
                ? "Narrative is already dominant. Response quality matters more than speed now."
                : phase === "spread"
                  ? "Momentum is building. This is the most efficient window to shape perception."
                  : phase === "aftermath"
                    ? "The loudest wave passed, but the reputation shadow still matters."
                    : "Early signal detected. If it grows, it can move quickly into the spread phase.";

              return (
                <div
                  key={controversy.id}
                  className="p-3 rounded-xl border"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: `${phaseColor}25` }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-[11px] font-bold" style={{ color: phaseColor }}>
                      {(controversy.controversy_type || "controversy").replace(/_/g, " ")}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest" style={{ color: `${phaseColor}B3` }}>
                      {phase}
                    </div>
                  </div>
                  <div className="text-[10px] text-white/35 mb-1">Attention: {attention}</div>
                  <div className="text-[10px] text-white/45 leading-relaxed">{phaseCopy}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
