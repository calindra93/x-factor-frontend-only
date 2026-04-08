import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play, Heart, MessageCircle, Share2, Bookmark, Flame, Eye,
  Zap, Music, BarChart3, Camera, Grid3X3, User,
  Volume2, Disc, Swords, Palette, Smile, Trophy, Check, X,
} from "lucide-react";
import { motion } from "framer-motion";
import BrandDealContractCard from "@/components/social/BrandDealContractCard";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";
import { buildLoopTokTrendingSounds, normalizeHashtag } from "./looptokDiscoverUtils";

function formatNum(n) { if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`; return String(n || 0); }

// ─── Shared Data (re-exported for tabs) ───
export const TRENDING_SOUNDS = [
  { id: "s1", name: "Beat Drop 808", artist: "@beatsbykai", uses: 234000, trend: "rising", genre: "Hip-Hop" },
  { id: "s2", name: "Sunset Vibes", artist: "@chillwaveofficial", uses: 890000, trend: "peak", genre: "R&B" },
  { id: "s3", name: "Glitch Step", artist: "@djmiraflow", uses: 45000, trend: "rising", genre: "Electronic" },
  { id: "s4", name: "Acoustic Morning", artist: "@indiequeenlex", uses: 120000, trend: "stable", genre: "Indie" },
  { id: "s5", name: "Trap Symphony", artist: "@rapgodmike", uses: 1200000, trend: "declining", genre: "Trap" },
  { id: "s6", name: "Afro Pulse", artist: "@afrobeatking", uses: 67000, trend: "rising", genre: "Afrobeats" },
  { id: "s7", name: "Lo-Fi Dreams", artist: "@studybeats", uses: 560000, trend: "stable", genre: "Lo-Fi" },
  { id: "s8", name: "Reggaeton Fire", artist: "@latinflow", uses: 340000, trend: "peak", genre: "Latin" },
];

export const TRENDING_HASHTAGS = [
  { tag: "#FYP", posts: "12.4B", hot: true }, { tag: "#NewMusic", posts: "890M", hot: true },
  { tag: "#DanceChallenge", posts: "2.1B", hot: true }, { tag: "#StudioLife", posts: "340M", hot: false },
  { tag: "#Freestyle", posts: "560M", hot: false }, { tag: "#Viral", posts: "8.9B", hot: true },
  { tag: "#IndieArtist", posts: "120M", hot: false }, { tag: "#BehindTheScenes", posts: "450M", hot: false },
  { tag: "#SongSnippet", posts: "230M", hot: true }, { tag: "#GetReadyWithMe", posts: "1.8B", hot: false },
  { tag: "#Duet", posts: "640M", hot: true }, { tag: "#StitchThis", posts: "410M", hot: false },
  { tag: "#Storytime", posts: "980M", hot: true }, { tag: "#GlowUp", posts: "1.1B", hot: false },
  { tag: "#OnTour", posts: "220M", hot: false }, { tag: "#MicCheck", posts: "150M", hot: false },
  { tag: "#ProducerTok", posts: "190M", hot: false }, { tag: "#SongwriterTok", posts: "140M", hot: false },
  { tag: "#DanceTok", posts: "3.4B", hot: true }, { tag: "#OutNow", posts: "770M", hot: true },
  { tag: "#Hook", posts: "310M", hot: false }, { tag: "#Chorus", posts: "260M", hot: false },
];

export const ACTIVE_CHALLENGES = [
  { id: "c1", name: "30-Second Freestyle", desc: "Drop your hardest 30s freestyle", reward: "+15 hype, +500 views boost", difficulty: "Medium", participants: "12.4K", deadline: "3 days" },
  { id: "c2", name: "Dance Your Song", desc: "Choreograph a dance to your latest track", reward: "+25 hype, viral chance x2", difficulty: "Hard", participants: "8.2K", deadline: "5 days" },
  { id: "c3", name: "Duet Chain", desc: "Stitch with 3 different creators in one day", reward: "+10 hype, +2K followers", difficulty: "Easy", participants: "23.1K", deadline: "1 day" },
];

export const DUET_PARTNERS = [
  { id: "d1", name: "@beatsbykai", followers: "2.3M", style: "Producer", compat: 0.85 },
  { id: "d2", name: "@djmiraflow", followers: "890K", style: "DJ/Remix", compat: 0.72 },
  { id: "d3", name: "@indiequeenlex", followers: "1.1M", style: "Singer-Songwriter", compat: 0.68 },
  { id: "d4", name: "@rapgodmike", followers: "3.5M", style: "Rapper", compat: 0.90 },
  { id: "d5", name: "@vibesonly", followers: "670K", style: "Aesthetic", compat: 0.55 },
  { id: "d6", name: "@dancequeenria", followers: "4.2M", style: "Dancer", compat: 0.78 },
];

export const ALGORITHM_STATES = [
  { id: "favorable", label: "Algorithm Favorable", color: "text-green-400", bg: "bg-green-500/10", desc: "Content pushed to more FYPs", mult: 1.4 },
  { id: "neutral", label: "Algorithm Neutral", color: "text-gray-400", bg: "bg-white/[0.04]", desc: "Standard distribution", mult: 1.0 },
  { id: "suppressed", label: "Algorithm Suppressed", color: "text-red-400", bg: "bg-red-500/10", desc: "Low engagement — switch strategy", mult: 0.6 },
];

const trendColor = (t) => t === "rising" ? "bg-green-500/10 text-green-400 border-green-500/20" : t === "peak" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : t === "declining" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-white/[0.06] text-gray-400 border-white/[0.06]";

const TREND_TYPE_META = {
  aesthetic: { icon: Palette, label: 'Aesthetic', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  meme:      { icon: Smile,   label: 'Meme',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  genre_wave:{ icon: Music,   label: 'Genre Wave',color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20'   },
};

const PILLAR_COLORS = {
  party: 'text-pink-400', diva: 'text-purple-400', street: 'text-amber-400',
  artsy: 'text-violet-400', alt: 'text-cyan-400', activist: 'text-green-400',
};

// ═══════════════════════════════════════════════════════
// DISCOVER TAB — Consolidated sounds, hashtags, challenges, trends
// ═══════════════════════════════════════════════════════
export function DiscoverTab({
  releases: _releases, currentTurnId, onSelectTrend, selectedTrend,
  soundMetrics: _soundMetrics, playerPosts, handleJoinChallenge, setTab, challenges,
  currentArtistId, algorithmMood,
}) {
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [challengeModal, setChallengeModal] = useState(null);
  const [joiningId, setJoiningId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await base44.functions.invoke('socialMedia', {
          action: 'getLoopTokTrends',
          currentTurnId: currentTurnId || 0
        });
        if (!cancelled) setTrendData(result);
      } catch (e) {
        console.warn('[DiscoverTab] Failed to load trends:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTurnId]);

  const mergedSounds = useMemo(() => {
    return buildLoopTokTrendingSounds(trendData?.trendingSounds || [], currentArtistId);
  }, [trendData, currentArtistId]);

  const playerHashtags = useMemo(() => {
    const tags = {};
    (playerPosts || []).forEach(p => {
      (p.metadata?.hashtags || []).forEach(tag => {
        const normalized = normalizeHashtag(tag);
        if (!normalized) return;
        tags[normalized] = (tags[normalized] || 0) + 1;
      });
    });
    return Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [playerPosts]);

  const dynChallenges = (trendData?.challenges || []).slice(0, 5);
  const dynTrends = trendData?.trends || [];
  const allBeefs = [...(trendData?.beefs || []), ...(trendData?.fanWars || [])];
  const isSelected = t => selectedTrend?.id === t.id;

  const challengeParticipationById = useMemo(() => {
    const map = {};
    (challenges || []).forEach(c => { map[c.id] = c.playerParticipation || null; });
    return map;
  }, [challenges]);

  const diffBadge = d => {
    const map = { hard: 'bg-red-500/10 text-red-400 border-red-500/20', medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20', easy: 'bg-green-500/10 text-green-400 border-green-500/20' };
    return map[(d || '').toLowerCase()] || map.easy;
  };

  const handleConfirmJoin = async (challenge) => {
    setJoiningId(challenge.id);
    try {
      const success = await handleJoinChallenge?.(challenge.id);
      if (success) {
        setChallengeModal(null);
        setTab?.('create');
      }
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-[10px]">Loading Discover...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">

      {/* ── Trending Sounds (fixed-height scrollable) ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-3 h-3 text-amber-400" /> Trending Sounds
          </h4>
          <span className="text-gray-600 text-[8px]">{mergedSounds.length} sounds</span>
        </div>
        <div className="h-[280px] overflow-y-auto pr-0.5 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {mergedSounds.map((s, i) => (
            <div key={s.id || i} className={`flex items-center gap-3 rounded-xl p-3 border ${s.isAnyPlayerSound ? 'bg-gradient-to-r from-purple-500/5 to-pink-500/5 border-purple-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
              <span className="text-gray-600 text-[11px] w-5 text-right flex-shrink-0">#{i + 1}</span>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.isAnyPlayerSound ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20' : 'bg-gradient-to-br from-pink-500/20 to-red-500/20'}`}>
                {s.isAnyPlayerSound ? <Disc className="w-4 h-4 text-purple-400" /> : <Volume2 className="w-4 h-4 text-pink-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-xs font-semibold truncate">{s.name}</p>
                  {s.isPlayerSound && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20 flex-shrink-0">YOURS</span>}
                </div>
                <p className="text-gray-500 text-[10px]">{s.artist} · {formatNum(s.uses)} uses</p>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold border flex-shrink-0 ${trendColor(s.trend)}`}>{s.trend}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected Trend Banner ── */}
      {selectedTrend && (
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-pink-300 text-[10px] font-bold">🏄 Riding: {selectedTrend.name}</p>
            <p className="text-gray-400 text-[9px]">Your next post carries the <span className="text-purple-300">{selectedTrend.alignment_tag}</span> tag</p>
          </div>
          <button onClick={() => onSelectTrend?.(null)} className="text-gray-500 hover:text-white text-[9px] px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08]">Drop</button>
        </div>
      )}

      {/* ── Active Challenges (fixed-height scrollable) ── */}
      {dynChallenges.length > 0 && (
        <div>
          <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-amber-400" /> Active Challenges
          </h4>
          <div className="h-[220px] overflow-y-auto pr-0.5 space-y-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {dynChallenges.map(c => {
              const joined = !!(challengeParticipationById[c.id]) || !!(c.playerParticipation);
              const turnsLeft = Math.min(48, Math.max(0, Number(c.turns_remaining || 0)));
              // Parse reward into human-readable Boost format
              const hypeAmount = c.reward_amount || 15;
              const viewBoost = c.metadata?.view_boost || 500;
              return (
                <div key={c.id} className="bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-pink-500/15 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white text-xs font-bold">{c.name}</p>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold border ${diffBadge(c.difficulty)}`}>{c.difficulty}</span>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed mb-2">{c.description}</p>
                  {c.hashtag_required && <p className="text-pink-400 text-[10px] font-semibold mb-1.5">{c.hashtag_required}</p>}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-green-400 text-[10px] font-semibold">Boost: +{hypeAmount} Hype, +{formatNum(viewBoost)} Views</span>
                    <span className="text-gray-600 text-[9px]">{turnsLeft} turns left</span>
                  </div>
                  {joined ? (
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400 text-[10px] font-semibold">Joined</span>
                    </div>
                  ) : (
                    <button onClick={() => setChallengeModal(c)} className="w-full py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-[10px] font-semibold hover:bg-pink-500/30 transition-all border border-pink-500/20">
                      Join Challenge
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trending Hashtags (fixed-height scrollable) ── */}
      {(() => {
        const MOOD_HASHTAGS = {
          beef_season: [{ tag: '#BeefSeason', posts: '340M', hot: true }, { tag: '#NoCap', posts: '890M', hot: true }, { tag: '#CallOut', posts: '210M', hot: false }],
          nostalgic:   [{ tag: '#Throwback', posts: '2.3B', hot: true }, { tag: '#OldSchool', posts: '1.1B', hot: false }, { tag: '#Classics', posts: '780M', hot: false }],
          experimental:[{ tag: '#WeirderTok', posts: '45M', hot: true }, { tag: '#AltTok', posts: '120M', hot: false }, { tag: '#ExperimentalSound', posts: '67M', hot: true }],
          underground: [{ tag: '#UndergroundSound', posts: '67M', hot: false }, { tag: '#IndieNow', posts: '230M', hot: true }, { tag: '#HiddenGem', posts: '110M', hot: false }],
          mainstream:  [{ tag: '#FYP', posts: '12.4B', hot: true }, { tag: '#Trending', posts: '5.6B', hot: true }, { tag: '#ViralCheck', posts: '3.1B', hot: true }],
          messy:       [{ tag: '#Drama', posts: '1.8B', hot: true }, { tag: '#Messy', posts: '450M', hot: true }, { tag: '#Unfiltered', posts: '320M', hot: false }],
        };
        const moodTags = MOOD_HASHTAGS[algorithmMood] || MOOD_HASHTAGS.mainstream;
        const allNpcTags = [...moodTags, ...TRENDING_HASHTAGS.filter(h => !moodTags.some(m => m.tag === h.tag))];
        const npcFiltered = allNpcTags.filter(h => !playerHashtags.includes(normalizeHashtag(h.tag)));
        return (
          <div>
            <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2"># Trending Hashtags</h4>
            <div className="h-[120px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex flex-wrap gap-1.5">
                {playerHashtags.map(tag => (
                  <div key={tag} className="text-[10px] px-2.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center gap-1">
                    {tag} <span className="text-[7px] bg-purple-500/20 px-1 py-0.5 rounded-full text-purple-400 font-bold">YOURS</span>
                  </div>
                ))}
                {npcFiltered.map(h => (
                  <div key={h.tag} className={`text-[10px] px-2.5 py-1.5 rounded-full border flex items-center gap-1 ${h.hot ? 'bg-pink-500/10 border-pink-500/20 text-pink-400' : 'bg-white/[0.03] border-white/[0.06] text-gray-400'}`}>
                    {normalizeHashtag(h.tag)} <span className="text-gray-600 text-[8px]">{h.posts}</span>
                    {h.hot && <Flame className="w-2.5 h-2.5 text-amber-400" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── What's Trending (aesthetic / meme / genre wave) ── */}
      {dynTrends.length > 0 && (
        <div>
          <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">What's Trending</h4>
          {dynTrends.map(t => {
            const meta = TREND_TYPE_META[t.trend_type] || TREND_TYPE_META.aesthetic;
            const TIcon = meta.icon;
            const active = isSelected(t);
            return (
              <div key={t.id} className={`rounded-xl p-3.5 mb-2 border transition-all ${active ? 'bg-gradient-to-r from-pink-500/15 to-purple-500/10 border-pink-500/40' : `${meta.bg} ${meta.border}`}`}>
                <div className="flex items-start gap-2.5">
                  <div className={`w-9 h-9 rounded-lg ${meta.bg} ${meta.border} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <TIcon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-white text-xs font-semibold truncate">{t.name}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color} font-semibold`}>{meta.label}</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-gray-400">🔥 {t.intensity}</span>
                      </div>
                    </div>
                    <p className="text-gray-400 text-[11px] leading-relaxed mb-2">{t.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {(t.pillar_affinity || []).map(pl => (
                          <span key={pl} className={`text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] ${PILLAR_COLORS[pl] || 'text-gray-400'}`}>{pl}</span>
                        ))}
                      </div>
                      <button onClick={() => onSelectTrend?.(active ? null : t)} className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold transition-all flex-shrink-0 ${active ? 'bg-pink-500/20 border-pink-500/40 text-pink-300' : 'bg-white/[0.05] border-white/[0.10] text-gray-300 hover:bg-white/[0.10]'}`}>
                        {active ? '✓ Riding' : 'Ride It'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active Beefs ── */}
      {allBeefs.length > 0 && (
        <div>
          <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Active Beefs 🤩</h4>
          {allBeefs.slice(0, 4).map(b => {
            const isBeef = !!b.aggressor_name;
            const leftName = isBeef ? b.aggressor_name : b.artist_name;
            const rightName = isBeef ? b.target_name : (b.rival_name || 'Unknown Rival');
            const heat = isBeef ? b.controversy_level : b.intensity;
            const beefTrend = { id: `beef-${b.id}`, name: `${leftName} vs ${rightName}`, alignment_tag: 'beef_engagement', trend_type: 'beef', pillar_affinity: ['street', 'diva'], intensity: heat, description: isBeef ? `Chain: ${b.chain_length} · Score: ${b.aggressor_score} vs ${b.target_score}` : `Fan war intensity: ${heat}` };
            const active = isSelected(beefTrend);
            return (
              <div key={b.id} className={`rounded-xl p-2.5 mb-1.5 border flex items-center gap-2.5 transition-all ${active ? 'bg-red-500/15 border-red-500/40' : 'bg-red-500/5 border-red-500/15'}`}>
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Swords className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-semibold truncate">{leftName} <span className="text-red-400">vs</span> {rightName}</p>
                  <p className="text-gray-500 text-[9px]">{beefTrend.description} · heat {heat}</p>
                </div>
                <button onClick={() => onSelectTrend?.(active ? null : beefTrend)} className={`text-[9px] px-2 py-1 rounded-lg border font-semibold flex-shrink-0 transition-all ${active ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-white/[0.05] border-white/[0.08] text-gray-400 hover:text-white'}`}>
                  {active ? '✓ On It' : 'React'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Strategy tip */}
      <div className="bg-gradient-to-r from-pink-500/5 to-amber-500/5 border border-pink-500/10 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Zap className="w-3.5 h-3.5 text-pink-400 flex-shrink-0 mt-0.5" />
          <p className="text-gray-400 text-[9px] leading-relaxed">
            <strong className="text-gray-300">Strategy:</strong> Riding a trend sets an alignment tag on your next post, shifting fandom alignment and growing specific fan segments. Trends rotate every 12 turns.
          </p>
        </div>
      </div>

      {/* ── Challenge Confirmation Modal ── */}
      {challengeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-[100] pb-4 px-4" onClick={e => e.target === e.currentTarget && setChallengeModal(null)}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-gray-900 border border-white/[0.10] rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-bold text-sm">{challengeModal.name}</p>
                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-semibold border ${diffBadge(challengeModal.difficulty)}`}>{challengeModal.difficulty}</span>
              </div>
              <button onClick={() => setChallengeModal(null)} className="text-gray-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">{challengeModal.description}</p>
            {challengeModal.hashtag_required && <p className="text-pink-400 text-[10px] font-semibold">{challengeModal.hashtag_required}</p>}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <p className="text-green-400 text-[10px] font-semibold">Reward: {challengeModal.reward_type} — {challengeModal.reward_description || challengeModal.reward_amount}</p>
              <p className="text-gray-500 text-[9px] mt-0.5">Active turns {challengeModal.start_turn}–{challengeModal.end_turn} · {Math.max(0, Number(challengeModal.turns_remaining || 0))} turns left</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setChallengeModal(null)} className="flex-1 py-2 rounded-xl border border-white/[0.10] text-gray-400 text-[11px] font-semibold">Not Now</button>
              <button onClick={() => handleConfirmJoin(challengeModal)} disabled={!!joiningId} className="flex-1 py-2 rounded-xl bg-pink-500/20 border border-pink-500/30 text-pink-400 text-[11px] font-semibold hover:bg-pink-500/30 transition-all disabled:opacity-50">
                {joiningId ? 'Joining...' : 'Join & Create Post →'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export const TrendsTab = DiscoverTab;

// ═══════════════════════════════════════════════════════
// SOUNDS TAB — Sound library browser
// ═══════════════════════════════════════════════════════
export function SoundsTab() {
  return (
    <div className="p-4 space-y-3">
      <h3 className="text-white text-sm font-bold">Sound Library</h3>
      <p className="text-gray-500 text-[10px]">Browse trending sounds. The right sound can make or break your video.</p>

      {/* Sound Categories */}
      {["rising", "peak", "stable", "declining"].map(trend => {
        const sounds = TRENDING_SOUNDS.filter(s => s.trend === trend);
        if (sounds.length === 0) return null;
        return (
          <div key={trend}>
            <div className="flex items-center gap-1.5 mb-1.5 mt-2">
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border ${trendColor(trend)}`}>{trend.charAt(0).toUpperCase() + trend.slice(1)}</span>
              <span className="text-gray-600 text-[8px]">{sounds.length} sounds</span>
            </div>
            {sounds.map(s => (
              <div key={s.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Disc className="w-5 h-5 text-pink-400 animate-[spin_3s_linear_infinite]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[11px] font-semibold">{s.name}</p>
                    <p className="text-gray-500 text-[9px]">{s.artist}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-gray-400">{s.genre}</span>
                      <span className="text-gray-500 text-[8px]">{formatNum(s.uses)} uses</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-semibold border ${trendColor(s.trend)}`}>{s.trend}</span>
                    <span className="text-gray-600 text-[7px]">
                      {s.trend === "rising" ? "+1.4x views" : s.trend === "peak" ? "+1.2x views" : s.trend === "stable" ? "1.0x views" : "0.7x views"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/10 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Music className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
          <p className="text-gray-400 text-[9px] leading-relaxed">
            <strong className="text-gray-300">Sound strategy:</strong> Rising sounds give the biggest boost — you're early to the trend. Peak sounds are popular but saturated. Creating an Original Sound lets others use your music, generating passive reach.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MY POSTS TAB — Content library
// ═══════════════════════════════════════════════════════
export function MyPostsTab({ posts, handleBoostPost }) {
  return (
    <div className="p-4 space-y-2">
      <h3 className="text-white text-sm font-bold mb-2">My Content ({posts.length})</h3>
      {posts.length === 0 ? (
        <div className="min-h-[40dvh] flex flex-col items-center justify-center text-center py-8">
          <Play className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No posts yet</p>
          <p className="text-gray-600 text-xs mt-1">Create your first Loop to start building your audience</p>
        </div>
      ) : posts.map((post, idx) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
          className={`border rounded-xl p-3 ${post.is_viral ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-white text-xs font-semibold">{post.title || post.post_type}</span>
              {post.is_viral && <Flame className="w-3 h-3 text-amber-400" />}
            </div>
            <span className="text-gray-600 text-[9px]">{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-gray-400 text-[10px] mb-1">{post.caption}</p>
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            {post.metadata?.sound && (
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-0.5">
                <Music className="w-2 h-2" />{post.metadata.sound}
              </span>
            )}
            {post.metadata?.video_length && (
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{post.metadata.video_length}</span>
            )}
            {post.metadata?.filter && post.metadata.filter !== "raw" && (
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">{post.metadata.filter}</span>
            )}
            {post.metadata?.duet_partner && (
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Duet: {post.metadata.duet_partner}</span>
            )}
            {post.metadata?.boosted && (
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Boosted</span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            <div className="text-center"><Eye className="w-3 h-3 text-gray-500 mx-auto" /><p className="text-white text-[9px] font-semibold">{formatNum(post.views || 0)}</p></div>
            <div className="text-center"><Heart className="w-3 h-3 text-pink-400 mx-auto" /><p className="text-white text-[9px] font-semibold">{formatNum(post.likes || 0)}</p></div>
            <div className="text-center"><MessageCircle className="w-3 h-3 text-blue-400 mx-auto" /><p className="text-white text-[9px] font-semibold">{formatNum(post.comments || 0)}</p></div>
            <div className="text-center"><Share2 className="w-3 h-3 text-green-400 mx-auto" /><p className="text-white text-[9px] font-semibold">{formatNum(post.shares || 0)}</p></div>
            <div className="text-center"><Bookmark className="w-3 h-3 text-amber-400 mx-auto" /><p className="text-white text-[9px] font-semibold">{formatNum(post.saves || 0)}</p></div>
          </div>
          {post.metadata?.sound_usages > 0 && (
            <p className="text-purple-400 text-[8px] mt-1.5">{formatNum(post.metadata.sound_usages)} creators used your sound</p>
          )}
          {/* Boost button — only for non-boosted posts */}
          {handleBoostPost && !post.metadata?.boosted && (
            <button onClick={() => handleBoostPost(post.id)} className="mt-2 w-full py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20 hover:bg-amber-500/20 transition-all flex items-center justify-center gap-1">
              <Zap className="w-3 h-3" /> Boost Post (-10 hype)
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CREATOR TOOLS TAB — Analytics + algorithm insights
// ═══════════════════════════════════════════════════════
const PILLAR_INFO = {
  party:    { desc: 'Boosts dance & party content reach' },
  diva:     { desc: 'Amplifies GRWM & lifestyle content' },
  street:   { desc: 'Powers freestyle & cypher performance' },
  artsy:    { desc: 'Boosts original sounds & creative posts' },
  alt:      { desc: 'Trend reaction & meme content multiplier' },
  activist: { desc: 'Amplifies announcement & storytime reach' },
};

export function CreatorToolsTab({
  posts,
  followers,
  totalViews,
  viralPosts,
  account,
  algoState,
  creatorState,
  currentTurnId,
  brandDealOffers,
  brandDealContracts,
  brandDealsLoading,
  acceptingDealId,
  decliningDealId,
  onAcceptBrandDeal,
  onDeclineBrandDeal,
  algorithmMood = 'mainstream',
}) {
  const algoInfo = ALGORITHM_STATES.find(a => a.id === algoState) || ALGORITHM_STATES[1];
  const totalRevenue = account?.total_revenue || 0;
  const avgEngagement = posts.length > 0 ? (posts.reduce((s, p) => s + (p.engagement_rate || 0), 0) / posts.length).toFixed(1) : "0";
  const viralRate = posts.length > 0 ? ((viralPosts / posts.length) * 100).toFixed(0) : "0";

  const typeBreakdown = {};
  posts.forEach(p => { const t = p.post_type || "unknown"; typeBreakdown[t] = (typeBreakdown[t] || { count: 0, views: 0, viral: 0 }); typeBreakdown[t].count++; typeBreakdown[t].views += (p.views || 0); if (p.is_viral) typeBreakdown[t].viral++; });
  const bestType = Object.entries(typeBreakdown).sort((a, b) => b[1].views - a[1].views)[0];

  const MOOD_INSIGHTS = {
    beef_season: 'Algorithm is favoring drama & beef content. Reaction videos and duets with rivals get extra reach this cycle.',
    nostalgic:   'Nostalgic content is surging. Throwback sounds and retro aesthetics outperform this cycle.',
    experimental:'Experimental sounds are trending. Try unique filters and original sounds for outsized reach.',
    underground: 'Underground credibility is valued right now. Raw, unfiltered content beats polished production.',
    mainstream:  'Mainstream algorithm is active. Pop-friendly hooks and trending sounds perform best.',
    messy:       'Drama is driving engagement. Storytime and reaction content get boosted reach this cycle.',
  };

  const insights = [
    MOOD_INSIGHTS[algorithmMood] || MOOD_INSIGHTS.mainstream,
    algoState === 'suppressed' && 'Your algorithm score is low. Try switching content pillars or using a trending sound.',
    algoState === 'favorable' && 'You\'re in a favorable window — post now for maximum reach.',
    creatorState?.pillar_streak > 2 && `${creatorState.pillar_streak}-post pillar streak: ${(creatorState.pillar_bonus || 1).toFixed(2)}x bonus on next post.`,
    bestType && `Your best format: ${bestType[0].replace(/_/g, ' ')} (${formatNum(bestType[1].views)} views).`,
    'Rising sounds give 1.4x view boost. Raw / no-filter content gets +15% algorithm reach.',
  ].filter(Boolean);

  const algoCardBorder = algoInfo.color === 'text-green-400' ? 'border-green-500/20' : algoInfo.color === 'text-red-400' ? 'border-red-500/20' : 'border-white/[0.06]';
  const activePillar = creatorState?.content_pillars?.[0];

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-white text-sm font-bold">Creator Tools</h3>

      {/* Algorithm Status */}
      <div className={`${algoInfo.bg} border ${algoCardBorder} rounded-xl p-3.5`}>
        <div className="flex items-center gap-2 mb-1.5">
          <Zap className={`w-4 h-4 ${algoInfo.color}`} />
          <p className={`${algoInfo.color} text-base font-bold`}>{algoInfo.label}</p>
          <span className={`text-[11px] font-bold ${algoInfo.color} ml-auto`}>{creatorState?.algorithm_multiplier?.toFixed(2) || algoInfo.mult}x reach</span>
        </div>
        <p className="text-gray-400 text-xs">{algoInfo.desc}</p>
        {creatorState?.algorithm_reason && <p className="text-gray-500 text-[9px] mt-0.5">Reason: {creatorState.algorithm_reason}</p>}
        {creatorState?.content_pillars?.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-500 text-[9px]">Pillars:</span>
              {creatorState.content_pillars.map(p => (
                <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/20">{p}</span>
              ))}
              {creatorState.pillar_streak > 0 && <span className="text-[9px] text-amber-400 font-semibold">🔥 {creatorState.pillar_streak} streak ({creatorState.pillar_bonus?.toFixed(2) || '1.00'}x)</span>}
            </div>
            {activePillar && PILLAR_INFO[activePillar] && (
              <p className="text-gray-500 text-[9px] italic">{PILLAR_INFO[activePillar].desc}</p>
            )}
          </div>
        )}
        <p className="text-gray-500 text-[9px] mt-1.5 italic">
          {algoState === "favorable" ? "Keep posting — your momentum is strong." : algoState === "suppressed" ? "Try trending sounds, shorter videos, or raw filters to recover." : "Post consistently to build algorithm favor."}
        </p>
      </div>

      {/* Monetization (moved up) */}
      <div>
        <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Monetization</h4>
        <div className="space-y-1.5">
          {[
            { label: "Creator Fund", desc: "Payouts based on views ($0.02/1K views)", active: true, value: `$${formatNum(Math.round(totalRevenue))}` },
            { label: "Live Gifts", desc: "Receive gifts during live streams", active: followers >= 1000, value: followers >= 1000 ? "Available" : `${formatNum(1000 - followers)} more followers` },
            { label: "Brand Deals", desc: "Quick viral campaign sponsorships", active: followers >= 5000, value: followers >= 5000 ? "Eligible" : `${formatNum(5000 - followers)} more followers` },
          ].map(m => (
            <div key={m.label} className={`flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 ${m.active ? '' : 'opacity-40'}`}>
              <div><p className="text-gray-300 text-xs font-semibold">{m.label}</p><p className="text-gray-600 text-[9px]">{m.desc}</p></div>
              <span className={`text-[10px] font-semibold ${m.active ? 'text-green-400' : 'text-gray-600'}`}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Views", value: formatNum(totalViews), color: "text-pink-400" },
          { label: "Creator Fund", value: `$${formatNum(Math.round(totalRevenue))}`, color: "text-green-400" },
          { label: "Avg Engagement", value: `${avgEngagement}%`, color: "text-white" },
          { label: "Viral Rate", value: `${viralRate}%`, color: "text-amber-400" },
          { label: "Followers", value: formatNum(followers), color: "text-purple-400" },
          { label: "Total Posts", value: String(posts.length), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`${s.color} text-lg font-bold`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Content Performance Breakdown */}
      <div>
        <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Content Performance</h4>
        {Object.entries(typeBreakdown).sort((a, b) => b[1].views - a[1].views).map(([type, data]) => (
          <div key={type} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
            <span className="text-gray-300 text-xs capitalize">{type.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs">{data.count} posts</span>
              <span className="text-white text-xs font-semibold">{formatNum(data.views)} views</span>
              {data.viral > 0 && <span className="text-amber-400 text-xs">{data.viral} viral</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Algorithm Insights (dynamic) */}
      <div className="bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-pink-500/10 rounded-xl p-3.5">
        <div className="flex items-start gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-pink-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-gray-300 text-xs font-semibold mb-1.5">Algorithm Insights</p>
            <ul className="text-gray-400 text-[10px] leading-relaxed space-y-1.5">
              {insights.map((insight, i) => (
                <li key={i}>• {insight}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <LoopTokBrandDealsPanel
        currentTurnId={currentTurnId}
        brandDealOffers={brandDealOffers}
        brandDealContracts={brandDealContracts}
        brandDealsLoading={brandDealsLoading}
        acceptingDealId={acceptingDealId}
        decliningDealId={decliningDealId}
        onAcceptBrandDeal={onAcceptBrandDeal}
        onDeclineBrandDeal={onDeclineBrandDeal}
      />
    </div>
  );
}

export function LoopTokBrandDealsPanel({
  currentTurnId,
  brandDealOffers,
  brandDealContracts,
  brandDealsLoading,
  acceptingDealId,
  decliningDealId,
  onAcceptBrandDeal,
  onDeclineBrandDeal,
}) {
  const activeContracts = (brandDealContracts || []).filter(c => String(c.status) === 'active');
  const loopTokOffers = brandDealOffers || [];

  return (
    <div>
      <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Brand Deals</h4>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <p className="text-white text-xs font-semibold mb-2">Active Contracts</p>
        {brandDealsLoading && (
          <p className="text-gray-600 text-[10px]">Loading brand deals…</p>
        )}
        {!brandDealsLoading && activeContracts.length === 0 && (
          <p className="text-gray-600 text-[10px]">No active LoopTok brand deals yet.</p>
        )}

        {!brandDealsLoading && activeContracts.map(contract => (
          <BrandDealContractCard
            key={contract.id}
            brandName={contract.brand_name}
            tier={contract.tier}
            status={contract.status}
            deliverablesRemaining={Math.max(0, Number(contract.deliverable_count_required || 1) - Number(contract.deliverable_count_completed || 0))}
            turnsRemaining={Math.max(0, Number(contract.end_turn_id || 0) - Number(currentTurnId || 0))}
            personaFitText={contract?.metadata?.persona_fit_score != null ? `Fit: ${(Number(contract.metadata.persona_fit_score) * 100).toFixed(0)}%` : ''}
            loyaltyTier={contract?.metadata?.loyalty_tier}
            kpis={contract?.kpis}
            kpiProgress={contract?.kpi_progress}
            showAccrualHelper
          />
        ))}
      </div>

      <div className="mt-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white text-xs font-semibold">Available LoopTok Offers</p>
          <span className="text-[10px] text-amber-200/80">Turn {Number(currentTurnId || 0)}</span>
        </div>

        {!brandDealsLoading && loopTokOffers.length === 0 && (
          <p className="text-gray-500 text-[10px]">No LoopTok offers available right now.</p>
        )}

        {!brandDealsLoading && loopTokOffers.map(offer => (
          <BrandDealContractCard
            key={offer.id}
            brandName={offer.brand_name}
            tier={offer.tier}
            status={offer.status || 'offered'}
            deliverablesRemaining={Number(offer?.metadata?.deliverable_count_required || offer?.deliverables?.posts || offer?.deliverables?.videos || 1)}
            turnsRemaining={Math.max(0, Number(offer.expires_turn || 0) - Number(currentTurnId || 0))}
            personaFitText={offer?.metadata?.persona_fit_score != null
              ? `Persona fit: ${(Number(offer.metadata.persona_fit_score) * 100).toFixed(0)}%${offer?.metadata?.scene_fit_reason ? ` · ${offer.metadata.scene_fit_reason}` : ''}`
              : ''}
            loyaltyTier={offer?.metadata?.loyalty_tier}
            kpis={offer?.kpis}
            subtext={`$${Number(offer.per_turn_fee || 0).toFixed(0)}/turn · Signing $${Number(offer.signing_bonus || 0).toFixed(0)} · ${Number(offer.duration_turns || 1)} turns${Number(offer?.metadata?.scene_brand_bonus_pct || 0) > 0 ? ` · +${Number(offer.metadata.scene_brand_bonus_pct)}% scene` : ''}${Array.isArray(offer?.metadata?.scene_target_regions) && offer.metadata.scene_target_regions.length > 0 ? ` · ${offer.metadata.scene_target_regions.slice(0, 1).join('')}` : ''}`}
            action={(
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onAcceptBrandDeal?.(offer.id)}
                  disabled={acceptingDealId === offer.id}
                  className="px-2.5 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-200 text-[10px] font-semibold disabled:opacity-40"
                >
                  {acceptingDealId === offer.id ? 'Accepting…' : 'Accept'}
                </button>
                <button
                  onClick={() => onDeclineBrandDeal?.(offer.id)}
                  disabled={decliningDealId === offer.id}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-gray-300 text-[10px] font-semibold disabled:opacity-40"
                >
                  {decliningDealId === offer.id ? 'Declining…' : 'Decline'}
                </button>
              </div>
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PROFILE TAB — TikTok-style with Posts grid + Sounds list
// ═══════════════════════════════════════════════════════
export function ProfileTab({
  profile, posts, releases, soundMetrics,
  isOwnProfile, onProfileUpdated,
}) {
  const [subTab, setSubTab] = useState('posts');
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState(profile?.bio || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const lifecycleToTrend = { Hot: 'peak', Trending: 'peak', Momentum: 'rising', Stable: 'stable', Fading: 'declining', Legacy: 'declining' };

  const totalViews = useMemo(() => (posts || []).reduce((s, p) => s + (p.views || 0), 0), [posts]);
  const totalLikes = useMemo(() => (posts || []).reduce((s, p) => s + (p.likes || 0), 0), [posts]);
  const followers = profile?.followers || 0;

  const playerSounds = useMemo(() => (releases || []).map(r => {
    const metrics = (soundMetrics || []).find(m => m.sound_id === String(r.id) || m.sound_id === `original:${r.id}`);
    return {
      ...r,
      uses: metrics?.uses_count ?? Math.floor((r.lifetime_streams || 0) * 0.03),
      trend: metrics?.trend_state || lifecycleToTrend[r.lifecycle_state] || 'stable',
      isViral: metrics?.is_viral || false,
    };
  }).sort((a, b) => b.uses - a.uses), [releases, soundMetrics]);

  const gradients = [
    'from-pink-600/40 to-purple-900/60', 'from-cyan-600/40 to-blue-900/60',
    'from-amber-600/40 to-red-900/60', 'from-green-600/40 to-teal-900/60',
    'from-violet-600/40 to-indigo-900/60', 'from-rose-600/40 to-pink-900/60',
  ];

  const handlePhotoClick = () => { if (isOwnProfile) fileInputRef.current?.click(); };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setPhotoUploading(true);
    try {
      const { base44: b44 } = await import('@/api/base44Client');
      const { supabaseClient: sc } = await import('@/lib/supabaseClient');
      const result = await b44.integrations.Core.UploadFile({ file, bucket: 'uploads' });
      await sc.from('profiles').update({ artist_image: result.file_url }).eq('id', profile.id);
      onProfileUpdated?.({ ...profile, artist_image: result.file_url });
      showToast('Profile photo updated!', 'success');
    } catch {
      showToast('Upload failed', 'error');
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveBio = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const { supabaseClient: sc } = await import('@/lib/supabaseClient');
      await sc.from('profiles').update({ bio }).eq('id', profile.id);
      onProfileUpdated?.({ ...profile, bio });
      setIsEditing(false);
      showToast('Bio saved!', 'success');
    } catch {
      showToast('Failed to save bio', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* ── Profile Header ── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              onClick={handlePhotoClick}
              className={`w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 relative ${isOwnProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            >
              {profile?.artist_image ? (
                <img src={profile.artist_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
              )}
              {photoUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            {isOwnProfile && (
              <>
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-white rounded-full border-2 border-black flex items-center justify-center pointer-events-none">
                  <Camera className="w-3 h-3 text-gray-800" />
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </>
            )}
          </div>

          {/* Stats row */}
          <div className="flex-1 grid grid-cols-3 gap-1 pt-2">
            {[
              { label: 'Followers', value: formatNum(followers) },
              { label: 'Views', value: formatNum(totalViews) },
              { label: 'Likes', value: formatNum(totalLikes) },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-white font-bold text-base leading-none">{s.value}</p>
                <p className="text-gray-500 text-[9px] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Name + handle */}
        <p className="text-white font-bold text-sm mt-3 leading-snug">{profile?.artist_name}</p>
        <p className="text-gray-500 text-[10px]">@{(profile?.artist_name || '').toLowerCase().replace(/\s+/g, '_')}</p>
        {profile?.genre && <p className="text-gray-600 text-[9px] mt-0.5">{profile.genre}{profile?.region ? ` · ${profile.region}` : ''}</p>}

        {/* Bio */}
        {isEditing ? (
          <div className="mt-2.5">
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={3}
              maxLength={150}
              placeholder="Write your bio..."
              className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl p-2.5 text-white text-[11px] resize-none leading-relaxed focus:outline-none focus:border-pink-500/40"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-gray-600 text-[9px] flex-1">{bio.length}/150</span>
              <button onClick={() => { setIsEditing(false); setBio(profile?.bio || ''); }} className="px-3 py-1 bg-white/[0.06] rounded-lg text-gray-400 text-[10px]">Cancel</button>
              <button onClick={handleSaveBio} disabled={saving} className="px-3 py-1 bg-pink-500/20 border border-pink-500/30 text-pink-400 text-[10px] rounded-lg disabled:opacity-50 font-semibold">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div onClick={() => isOwnProfile && setIsEditing(true)} className={`mt-2 ${isOwnProfile ? 'cursor-pointer' : ''}`}>
            {(profile?.bio || bio) ? (
              <p className="text-gray-300 text-[11px] leading-relaxed">{profile?.bio || bio}</p>
            ) : isOwnProfile ? (
              <p className="text-gray-600 text-[11px] italic">Tap to add a bio...</p>
            ) : null}
          </div>
        )}

        {/* Edit Profile button */}
        {isOwnProfile && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="mt-3 w-full border border-white/[0.15] rounded-lg py-1.5 text-white text-[11px] font-semibold hover:bg-white/[0.05] transition-all">
            Edit Profile
          </button>
        )}
      </div>

      {/* ── Sub-tabs: Posts | Sounds ── */}
      <div className="flex border-b border-white/[0.08]">
        {[{ id: 'posts', icon: Grid3X3, label: 'Posts' }, { id: 'sounds', icon: Music, label: 'Sounds' }].map(t => {
          const I = t.icon;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border-b-2 transition-all text-[10px] font-medium ${subTab === t.id ? 'border-white text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
            >
              <I className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ── Posts Grid ── */}
      {subTab === 'posts' && (
        (posts || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Play className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm font-semibold">No Posts Yet</p>
            {isOwnProfile && <p className="text-gray-600 text-[10px] mt-1">Create your first Loop to get started!</p>}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[1px]">
            {(posts || []).map((post, idx) => (
              <div key={post.id || idx} className={`aspect-square relative overflow-hidden bg-gradient-to-br ${gradients[idx % gradients.length]}`}>
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="w-6 h-6 text-white/30" />
                  </div>
                )}
                {post.is_viral && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                    <Flame className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5 text-white/70" />
                  <span className="text-white/70 text-[8px] font-medium">{formatNum(post.views || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Sounds List ── */}
      {subTab === 'sounds' && (
        playerSounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Music className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm font-semibold">No Released Sounds</p>
            {isOwnProfile && <p className="text-gray-600 text-[10px] mt-1">Release music to see it here</p>}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {playerSounds.map((sound, idx) => (
              <div key={sound.id || idx} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Disc className="w-5 h-5 text-purple-400" />
                  </div>
                  {sound.isViral && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                      <Flame className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-white text-[11px] font-semibold truncate">{sound.release_name || sound.title || 'Untitled'}</p>
                    {sound.isViral && <span className="text-[7px] px-1 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold flex-shrink-0">VIRAL</span>}
                  </div>
                  <p className="text-gray-500 text-[9px]">{sound.genre || 'Music'}</p>
                  <div className="flex items-center gap-3 mt-1 text-[9px]">
                    <span className="text-gray-400"><Music className="w-2.5 h-2.5 inline mr-0.5" />{formatNum(sound.uses)} uses</span>
                    <span className="text-gray-500">{formatNum(sound.lifetime_streams || 0)} streams</span>
                  </div>
                </div>
                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-semibold border flex-shrink-0 ${trendColor(sound.trend)}`}>{sound.trend}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
