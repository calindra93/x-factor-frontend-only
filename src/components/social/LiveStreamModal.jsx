import React, { useState } from "react";
import { X, Users, DollarSign, Zap, Play, Eye, MessageCircle, TrendingUp, AlertTriangle, Music, Mic2, Radio, Sparkles, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";

const PLATFORMS = [
  { id: "vidwave", label: "VidWave", desc: "YouTube-style • Higher ad revenue", icon: Play, color: "from-red-600/20 to-red-500/10", accent: "text-red-400", border: "border-red-500/30" },
  { id: "looptok", label: "LoopTok", desc: "TikTok-style • Bigger audience reach", icon: Radio, color: "from-cyan-600/20 to-blue-500/10", accent: "text-cyan-400", border: "border-cyan-500/30" },
];

const STREAM_CHOICES = [
  { id: "tease_music", label: "Tease Unreleased Music", desc: "Play snippets of upcoming tracks", icon: Music, energyCost: 50, duration: 45, risk: "medium", reward: "high", color: "from-purple-600/15 to-pink-600/10", accent: "text-purple-400" },
  { id: "chat", label: "Chat with Fans", desc: "Q&A and casual conversation", icon: MessageCircle, energyCost: 40, duration: 60, risk: "low", reward: "medium", color: "from-blue-600/15 to-cyan-600/10", accent: "text-blue-400" },
  { id: "updates", label: "Personal Updates", desc: "Share life updates and stories", icon: Mic2, energyCost: 35, duration: 30, risk: "high", reward: "low", color: "from-orange-600/15 to-yellow-600/10", accent: "text-orange-400" },
  { id: "acoustic", label: "Acoustic Performance", desc: "Live stripped-down performance", icon: Sparkles, energyCost: 55, duration: 45, risk: "low", reward: "very high", color: "from-green-600/15 to-emerald-600/10", accent: "text-green-400" },
  { id: "collab", label: "Collab Stream", desc: "Joint stream with another artist", icon: Crown, energyCost: 50, duration: 75, risk: "medium", reward: "high", color: "from-pink-600/15 to-rose-600/10", accent: "text-pink-400" },
];

const OUTCOME_STYLES = {
  positive: { bg: "from-green-500/15 to-emerald-500/10", border: "border-green-500/30", icon: TrendingUp, iconColor: "text-green-400", label: "text-green-400" },
  negative: { bg: "from-red-500/15 to-orange-500/10", border: "border-red-500/30", icon: AlertTriangle, iconColor: "text-red-400", label: "text-red-400" },
  neutral:  { bg: "from-blue-500/15 to-cyan-500/10", border: "border-blue-500/30", icon: Play, iconColor: "text-blue-400", label: "text-blue-400" },
};

export default function LiveStreamModal({ profile, onClose }) {
  const [step, setStep] = useState(0); // 0=platform, 1=choice, 2=confirm, 3=results
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [streamTitle, setStreamTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const minEnergy = 35; // Lowest energy cost among choices
  const canStream = (profile?.energy || 0) >= minEnergy;

  const handleGoLive = async () => {
    if (!selectedPlatform || !selectedChoice || !profile?.id || loading) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('socialMedia', {
        action: 'simulateLiveStream',
        artistId: profile.id,
        platform: selectedPlatform.id,
        choice: selectedChoice.id,
        title: streamTitle || undefined,
        energyCost: selectedChoice.energyCost,
        durationMinutes: selectedChoice.duration,
        artistName: profile.artist_name || profile.display_name || 'Artist'
      });

      const payload = res.data?.data || res.data || {};
      setResult(payload);
      setStep(3);
    } catch (e) {
      console.error("[LiveStream] Error:", e);
      showToast(`Stream failed: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // ─── Not enough energy gate ───
  if (!canStream) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold">Not Enough Energy</h3>
              <p className="text-gray-400 text-sm">Live streaming requires at least {minEnergy} energy</p>
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Current Energy</span>
              <span className="text-red-400 font-bold">{profile?.energy || 0}/{minEnergy}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold">Close</button>
        </div>
      </motion.div>
    );
  }

  const estimatedViewers = Math.max(20, Math.floor((profile?.followers || 0) * 0.08 + (profile?.clout || 0) * 0.5));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111118] border border-white/10 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center">
                <Play className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-white text-base font-bold">Go Live</h3>
                <p className="text-gray-500 text-[10px]">
                  {step < 3 ? "Connect with fans • Anything can happen" : "Stream Complete"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          {/* Step indicator */}
          {step < 3 && (
            <div className="flex gap-1 mt-3">
              {["Platform", "What to Do", "Go Live"].map((s, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-red-500' : 'bg-white/10'}`} />
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          {/* ═══ STEP 0: Platform ═══ */}
          {step === 0 && (
            <div className="space-y-3">
              <h4 className="text-white text-sm font-semibold">Choose Platform</h4>
              <div className="space-y-2">
                {PLATFORMS.map(p => {
                  const Icon = p.icon;
                  const selected = selectedPlatform?.id === p.id;
                  return (
                    <button key={p.id} onClick={() => setSelectedPlatform(p)}
                      className={`w-full text-left border rounded-xl p-3 transition-all ${selected ? `bg-gradient-to-r ${p.color} ${p.border}` : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-white/10' : 'bg-white/[0.04]'}`}>
                          <Icon className={`w-4 h-4 ${selected ? p.accent : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">{p.label}</p>
                          <p className="text-gray-500 text-[10px]">{p.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Audience preview */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-1">Estimated Audience</p>
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-white text-sm font-bold">~{estimatedViewers.toLocaleString()} base viewers</span>
                </div>
                <p className="text-gray-500 text-[9px] mt-1">Based on {(profile?.followers || 0).toLocaleString()} fans + {(profile?.clout || 0)} clout</p>
              </div>
              <button onClick={() => setStep(1)} disabled={!selectedPlatform}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 transition-colors">
                Next: What to Do
              </button>
            </div>
          )}

          {/* ═══ STEP 1: Choice ═══ */}
          {step === 1 && (
            <div className="space-y-3">
              <h4 className="text-white text-sm font-semibold">What will you do on stream?</h4>
              <p className="text-gray-500 text-[10px]">Your choice affects outcomes. Higher reward = higher risk.</p>
              <div className="space-y-2">
                {STREAM_CHOICES.map(c => {
                  const Icon = c.icon;
                  const selected = selectedChoice?.id === c.id;
                  const affordable = (profile?.energy || 0) >= c.energyCost;
                  return (
                    <button key={c.id} onClick={() => affordable && setSelectedChoice(c)} disabled={!affordable}
                      className={`w-full text-left border rounded-xl p-3 transition-all ${!affordable ? 'opacity-40 cursor-not-allowed border-white/[0.04]' : selected ? `bg-gradient-to-r ${c.color} border-white/20` : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? 'bg-white/10' : 'bg-white/[0.04]'}`}>
                          <Icon className={`w-4 h-4 ${selected ? c.accent : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-white text-sm font-semibold">{c.label}</p>
                            <span className="text-gray-500 text-[9px]">{c.duration} min</span>
                          </div>
                          <p className="text-gray-500 text-[10px]">{c.desc}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-yellow-400 text-[9px] flex items-center gap-1"><Zap className="w-3 h-3" />{c.energyCost}</span>
                            <span className={`text-[9px] ${c.risk === 'low' ? 'text-green-400' : c.risk === 'high' ? 'text-red-400' : 'text-yellow-400'}`}>
                              Risk: {c.risk}
                            </span>
                            <span className={`text-[9px] ${c.reward === 'very high' ? 'text-purple-400' : c.reward === 'high' ? 'text-green-400' : 'text-gray-400'}`}>
                              Reward: {c.reward}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold">Back</button>
                <button onClick={() => setStep(2)} disabled={!selectedChoice}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">Confirm</button>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Confirm & Go Live ═══ */}
          {step === 2 && selectedChoice && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-white text-sm font-bold mb-3">Stream Summary</p>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-400">Platform</span><span className="text-white font-medium">{selectedPlatform?.label}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Activity</span><span className="text-white font-medium">{selectedChoice.label}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Duration</span><span className="text-white font-medium">{selectedChoice.duration} min</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Energy Cost</span><span className="text-yellow-400 font-bold">{selectedChoice.energyCost}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Est. Viewers</span><span className="text-blue-400 font-medium">~{estimatedViewers.toLocaleString()}</span></div>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-1.5">Stream Title (Optional)</p>
                <input type="text" value={streamTitle} onChange={(e) => setStreamTitle(e.target.value)}
                  placeholder={`${selectedChoice.label} — ${profile?.artist_name || "Artist"}`}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-red-500/30 focus:outline-none"
                  maxLength={100} />
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-orange-200/80 text-[10px]">
                    Live streams are unpredictable! You might get a clout surge or positive press — but fan wars, rumors, or trashy media coverage are also possible.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold">Back</button>
                <button onClick={handleGoLive} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold disabled:opacity-50 transition-all">
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : "GO LIVE"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Results ═══ */}
          {step === 3 && result && (() => {
            const perf = result.performance || {};
            const outcome = result.outcome || {};
            const stats = result.statChanges || {};
            const style = OUTCOME_STYLES[outcome.category] || OUTCOME_STYLES.neutral;
            const OutcomeIcon = style.icon;

            return (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* Outcome banner */}
                  <div className={`bg-gradient-to-r ${style.bg} border ${style.border} rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <OutcomeIcon className={`w-5 h-5 ${style.iconColor}`} />
                      <p className={`text-sm font-bold ${style.label}`}>{outcome.label || 'Stream Complete'}</p>
                    </div>
                    <p className="text-gray-300 text-[11px]">
                      {outcome.category === 'positive' && "Your stream was a hit! Great things happened."}
                      {outcome.category === 'negative' && "Things got messy... check your social feeds."}
                      {outcome.category === 'neutral' && "A solid stream with steady engagement."}
                    </p>
                  </div>

                  {/* Performance stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                      <Eye className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                      <p className="text-white text-[12px] font-bold">{(perf.peakViewers || 0).toLocaleString()}</p>
                      <p className="text-gray-500 text-[8px]">Peak Viewers</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                      <DollarSign className="w-4 h-4 text-green-400 mx-auto mb-1" />
                      <p className="text-white text-[12px] font-bold">${(perf.revenue?.totalRevenue || 0).toLocaleString()}</p>
                      <p className="text-gray-500 text-[8px]">Revenue</p>
                    </div>
                  </div>

                  {/* Stat changes */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-2">Stat Changes</p>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Hype', value: stats.hype, icon: TrendingUp },
                        { label: 'Clout', value: stats.clout, icon: Crown },
                        { label: 'Fans', value: stats.followers, icon: Users },
                        { label: 'Energy', value: stats.energy, icon: Zap },
                      ].map(s => (
                        <div key={s.label} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <s.icon className="w-3 h-3 text-gray-500" />
                            <span className="text-gray-400">{s.label}</span>
                          </div>
                          <span className={`font-bold ${(s.value || 0) > 0 ? 'text-green-400' : (s.value || 0) < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {(s.value || 0) > 0 ? '+' : ''}{s.value || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Outcome events */}
                  {outcome.events && outcome.events.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider">What Happened</p>
                      {outcome.events.map((evt, i) => (
                        <div key={i} className={`rounded-xl p-3 text-[11px] ${
                          evt.type === 'fan_war' ? 'bg-orange-500/10 border border-orange-500/20' :
                          evt.type === 'rumor' ? 'bg-red-500/10 border border-red-500/20' :
                          evt.type === 'trashy_media' ? 'bg-pink-500/10 border border-pink-500/20' :
                          evt.type === 'awkward_clip' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                          evt.type === 'technical_fail' ? 'bg-gray-500/10 border border-gray-500/20' :
                          evt.type === 'news' ? 'bg-green-500/10 border border-green-500/20' :
                          evt.type === 'revenue_boost' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                          'bg-blue-500/10 border border-blue-500/20'
                        }`}>
                          {evt.type === 'fan_war' && <p className="text-orange-300"><span className="font-bold">Fan War!</span> {evt.postCount} heated posts appeared on Xpress</p>}
                          {evt.type === 'rumor' && <p className="text-red-300"><span className="font-bold">Rumor:</span> "{evt.headline}"</p>}
                          {evt.type === 'trashy_media' && <p className="text-pink-300"><span className="font-bold">Trashy Media:</span> "{evt.title}" ({(evt.views || 0).toLocaleString()} views)</p>}
                          {evt.type === 'awkward_clip' && <p className="text-yellow-300"><span className="font-bold">Viral Clip:</span> "{evt.title}"</p>}
                          {evt.type === 'technical_fail' && <p className="text-gray-300"><span className="font-bold">Tech Fail!</span> Stream cut short, lost ${(evt.revenueLost || 0).toLocaleString()}</p>}
                          {evt.type === 'news' && <p className="text-green-300"><span className="font-bold">Press:</span> "{evt.headline}"</p>}
                          {evt.type === 'revenue_boost' && <p className="text-emerald-300"><span className="font-bold">Donation Frenzy!</span> +${(evt.bonus || 0).toLocaleString()} bonus</p>}
                          {evt.type === 'stat_boost' && <p className="text-blue-300"><span className="font-bold">{evt.stat} Surge!</span> +{evt.bonus}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Archetype Comments */}
                  {result.archetypeComments && result.archetypeComments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider">Fan Reactions</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {result.archetypeComments.map((c, i) => (
                          <div key={i} className={`rounded-lg p-2.5 text-[10px] border ${
                            c.sentiment === 'positive' ? 'bg-green-500/5 border-green-500/15' :
                            c.sentiment === 'negative' ? 'bg-red-500/5 border-red-500/15' :
                            'bg-white/[0.02] border-white/[0.06]'
                          }`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`font-bold ${
                                c.sentiment === 'positive' ? 'text-green-400' :
                                c.sentiment === 'negative' ? 'text-red-400' :
                                'text-gray-400'
                              }`}>{c.archetypeName}</span>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                                c.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                                c.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                                'bg-white/[0.06] text-gray-500'
                              }`}>{c.sentiment}</span>
                            </div>
                            <p className="text-gray-300 italic">"{c.message}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sentiment Update */}
                  {result.sentimentUpdate && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-2">Fanbase Sentiment Update</p>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-[10px]">Overall Sentiment</span>
                        <span className={`text-sm font-bold ${
                          result.sentimentUpdate.overall >= 70 ? 'text-green-400' :
                          result.sentimentUpdate.overall >= 40 ? 'text-amber-400' :
                          'text-red-400'
                        }`}>{result.sentimentUpdate.overall}/100</span>
                      </div>
                    </div>
                  )}

                  <button onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 font-semibold transition-colors">
                    Close
                  </button>
                </motion.div>
              </AnimatePresence>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
}
