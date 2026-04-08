import React, { useMemo, useState, useEffect } from "react";
import { Crown, Sparkles, Zap, Music, TrendingUp, TrendingDown, Users, DollarSign, Clock, Archive, Pause, Star, Heart, ChevronLeft, ArrowRight, Activity, Gauge, Target, Shield, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import EraActionsPanel from "../EraActionsPanel";
import { getPersonaLabel, MARKETING_PERSONA_OPTIONS } from "@/lib/marketingPersonas";
import { showToast } from "@/components/ui/toast-provider";
import { fmt } from "@/utils/numberFormat";

// ─── AESTHETIC TAGS ─────────────────────────────────────────────────────────
// Each tag maps to an identity pillar + has a unique gradient for visual coherence
const AESTHETIC_TAGS = [
  // Street / Rebellion
  { id: 'raw',          label: 'Raw',          gradient: 'from-orange-500 to-red-600',     color: '#F7A54B', cluster: 'Street' },
  { id: 'aggressive',   label: 'Aggressive',   gradient: 'from-red-600 to-rose-800',       color: '#EF5350', cluster: 'Street' },
  { id: 'underground',  label: 'Underground',  gradient: 'from-zinc-500 to-neutral-700',   color: '#71717A', cluster: 'Street' },
  // Luxury / Glamour
  { id: 'luxury',       label: 'Luxury',       gradient: 'from-amber-400 to-yellow-600',   color: '#C9A84C', cluster: 'Luxury' },
  { id: 'polished',     label: 'Polished',     gradient: 'from-rose-400 to-pink-600',      color: '#E87DCC', cluster: 'Luxury' },
  { id: 'maximalist',   label: 'Maximalist',   gradient: 'from-fuchsia-500 to-purple-700', color: '#A855F7', cluster: 'Luxury' },
  // Ethereal / Dreamy
  { id: 'ethereal',     label: 'Ethereal',     gradient: 'from-cyan-400 to-blue-600',      color: '#4B9EF7', cluster: 'Ethereal' },
  { id: 'dreamy',       label: 'Dreamy',       gradient: 'from-violet-400 to-indigo-600',  color: '#7C6EF7', cluster: 'Ethereal' },
  { id: 'minimalist',   label: 'Minimalist',   gradient: 'from-slate-400 to-slate-600',    color: '#94A3B8', cluster: 'Ethereal' },
  // Party / Energy
  { id: 'neon',         label: 'Neon',         gradient: 'from-green-400 to-emerald-600',  color: '#4CAF82', cluster: 'Party' },
  { id: 'futuristic',   label: 'Futuristic',   gradient: 'from-cyan-500 to-teal-700',      color: '#06B6D4', cluster: 'Party' },
  { id: 'electric',     label: 'Electric',     gradient: 'from-yellow-400 to-orange-500',  color: '#FBBF24', cluster: 'Party' },
  // Conscious / Authentic
  { id: 'nostalgic',    label: 'Nostalgic',    gradient: 'from-amber-600 to-orange-800',   color: '#D97706', cluster: 'Conscious' },
  { id: 'soulful',      label: 'Soulful',      gradient: 'from-emerald-500 to-teal-700',   color: '#10B981', cluster: 'Conscious' },
  // Dark / Experimental
  { id: 'dark',         label: 'Dark',         gradient: 'from-gray-600 to-gray-900',      color: '#374151', cluster: 'Dark' },
  { id: 'experimental', label: 'Experimental', gradient: 'from-purple-600 to-pink-700',    color: '#9333EA', cluster: 'Dark' },
  { id: 'industrial',   label: 'Industrial',   gradient: 'from-stone-500 to-zinc-700',     color: '#78716C', cluster: 'Dark' },
  { id: 'retro',        label: 'Retro',        gradient: 'from-orange-400 to-rose-500',    color: '#FB923C', cluster: 'Party' },
];

const FOCUS_PATHS = [
  { value: "HIT_CHASE", label: "Hit Chase", desc: "Chart-topping singles" },
  { value: "ALBUM_AUTEUR", label: "Album Auteur", desc: "Cohesive bodies of work" },
  { value: "SCENE_DOMINANCE", label: "Scene Dominance", desc: "Own your local market" },
  { value: "TOUR_MONSTER", label: "Tour Monster", desc: "Live shows & touring" },
  { value: "DIGITAL_CULT", label: "Digital Cult", desc: "Viral social media" },
  { value: "BRAND_MOGUL", label: "Brand Mogul", desc: "Merch, deals & partnerships" },
  { value: "CROSSOVER_KING", label: "Crossover King", desc: "Genre-blending appeal" },
  { value: "UNDERGROUND_LEGEND", label: "Underground Legend", desc: "Cult following" },
  { value: "GLOBAL_EXPANSION", label: "Global Expansion", desc: "International markets" },
  { value: "MEDIA_DARLING", label: "Media Darling", desc: "TV, radio, press" }
];

const ERA_ACTIONS_BY_PHASE = {
  TEASE: [
    { id: "teaser_snippet", name: "Drop a Teaser Snippet", icon: "🎵", description: "Post a snippet on social media", route: "/Social", routeLabel: "Go to Social", costs: { energy: 8, inspiration: 5 }, effects: { momentum: 6, volatility: 2, extends_phase_turns: 0 } },
    { id: "cryptic_post", name: "Cryptic Social Post", icon: "🔮", description: "Post mysterious visuals and hints", costs: { energy: 4, inspiration: 3 }, effects: { momentum: 3, volatility: 4, extends_phase_turns: 0 } },
    { id: "announce_era", name: "Official Announcement", icon: "📢", description: "Formally announce your new era", costs: { energy: 10, inspiration: 8 }, effects: { momentum: 10, volatility: 3, extends_phase_turns: 2 } },
    { id: "collab_tease", name: "Tease a Collaboration", icon: "🤝", description: "Hint at an upcoming feature", route: "/Social", routeLabel: "Go to Social", costs: { energy: 6, inspiration: 5 }, effects: { momentum: 5, volatility: 5, extends_phase_turns: 0 } },
    { id: "listening_party", name: "Private Listening Party", icon: "🎧", description: "Invite core fans to preview music", costs: { energy: 12, inspiration: 8 }, effects: { momentum: 8, volatility: 1, extends_phase_turns: 1 } },
  ],
  DROP: [
    { id: "release_music", name: "Release Music", icon: "🎵", description: "Go to Studio to record & release", route: "/Studio", routeLabel: "Go to Studio", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 15, volatility: 3, extends_phase_turns: 0 } },
    { id: "music_video", name: "Music Video", icon: "🎬", description: "Create a video on VidWave", route: "/Social", routeLabel: "Go to VidWave", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 20, volatility: 2, extends_phase_turns: 0 } },
    { id: "press_run", name: "Press Run", icon: "📰", description: "Interviews and features with media", costs: { energy: 12, inspiration: 8 }, effects: { momentum: 12, volatility: 1, extends_phase_turns: 0 } },
    { id: "live_stream", name: "Live Stream", icon: "📱", description: "Go live on social media", route: "/Social", routeLabel: "Go to Social", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 8, volatility: 4, extends_phase_turns: 0 } },
  ],
  SUSTAIN: [
    { id: "tour_announce", name: "Start a Tour", icon: "🎪", description: "Plan and launch a tour", route: "/TouringAppV2", routeLabel: "Go to Touring", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 10, volatility: 1, extends_phase_turns: 0 } },
    { id: "behind_scenes", name: "Behind the Scenes", icon: "🎥", description: "Share studio footage on social", route: "/Social", routeLabel: "Go to Social", costs: { energy: 5, inspiration: 3 }, effects: { momentum: 5, volatility: 1, extends_phase_turns: 0 } },
    { id: "fan_appreciation", name: "Fan Appreciation", icon: "❤️", description: "Thank your fans", costs: { energy: 3, inspiration: 2 }, effects: { momentum: 3, volatility: -1, extends_phase_turns: 0 } },
    { id: "merch_drop", name: "Merch Drop", icon: "🛍️", description: "Launch new era merch", route: "/MerchApp", routeLabel: "Go to Merch", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 6, volatility: 0, extends_phase_turns: 0 } },
  ],
  FADE: [
    { id: "farewell_show", name: "Farewell Show", icon: "👋", description: "Host a final event", route: "/TouringAppV2", routeLabel: "Go to Touring", costs: { energy: 0, inspiration: 0 }, effects: { momentum: 5, volatility: -2, extends_phase_turns: 0 } },
    { id: "throwback_session", name: "Throwback Session", icon: "🎙", description: "Acoustic versions of era hits", costs: { energy: 8, inspiration: 5 }, effects: { momentum: 2, volatility: -3, extends_phase_turns: 0 } },
    { id: "plan_next_era", name: "Plan Next Era", icon: "✨", description: "Start thinking about what's next", costs: { energy: 5, inspiration: 10 }, effects: { momentum: 0, volatility: -5, extends_phase_turns: 0 } },
  ],
};

const BUDGET_PRESETS = {
  DIY: { budget_marketing: 500, budget_visuals: 300, budget_features: 200, budget_community: 100, budget_tourprep: 100 },
  Indie: { budget_marketing: 2000, budget_visuals: 1500, budget_features: 1000, budget_community: 800, budget_tourprep: 500 },
  Standard: { budget_marketing: 5000, budget_visuals: 3000, budget_features: 2000, budget_community: 1500, budget_tourprep: 1000 },
  Major: { budget_marketing: 15000, budget_visuals: 10000, budget_features: 8000, budget_community: 5000, budget_tourprep: 3000 },
};

const PHASE_COLORS = { TEASE: '#3b82f6', DROP: '#ef4444', SUSTAIN: '#10b981', FADE: '#f59e0b' };
const PHASE_DESC = {
  TEASE: "Build hype with teasers and social posts before your drop.",
  DROP: "Maximum exposure! Release music and push content hard.",
  SUSTAIN: "Keep momentum with consistent engagement and touring.",
  FADE: "Interest is fading. Plan your next era or reinvent."
};

const MISSION_CONFIGS = {
  streaming: { label: 'Chart Dominance', icon: '📈', desc: 'Own the streaming charts',         color: '#3b82f6', trade_off: '+2 tension/turn (critics notice)' },
  fanbase:   { label: 'Tribe Builder',   icon: '👥', desc: 'Grow a loyal, passionate fanbase', color: '#22c55e', trade_off: '+hype decay (industry buzz fades)' },
  revenue:   { label: 'Stack the Bag',   icon: '💰', desc: 'Maximize era income & deals',      color: '#f59e0b', trade_off: '-virality (commercial = less viral)' },
  clout:     { label: 'Spectacle Era',   icon: '👑', desc: 'Be the most talked-about artist',  color: '#a855f7', trade_off: '+3 tension/turn (controversy risk)' },
};
const CONQUEST_REGIONS = ['US', 'Canada', 'UK', 'Europe', 'Asia', 'Latin America', 'Africa', 'Oceania'];
const PROMISE_OPTIONS = {
  TEASE:   [
    { option: 'tease_actions',      label: 'Execute 2+ era actions',      target: 2,      metric: 'era_actions' },
    { option: 'tease_anticipation', label: 'Build anticipation to 50',    target: 50,     metric: 'anticipation_meter' },
    { option: 'tease_hype',         label: 'Reach 60+ hype before DROP',  target: 60,     metric: 'hype' },
  ],
  DROP:    [
    { option: 'drop_release',       label: 'Release at least 1 single',   target: 1,      metric: 'releases_count' },
    { option: 'drop_2releases',     label: 'Release 2+ tracks',           target: 2,      metric: 'releases_count' },
    { option: 'drop_momentum',      label: 'Hold 50+ momentum',           target: 50,     metric: 'momentum' },
  ],
  SUSTAIN: [
    { option: 'sustain_tour',       label: 'Complete a tour this era',    target: 1,      metric: 'tours_count' },
    { option: 'sustain_streams',    label: 'Hit 500K era streams',        target: 500000, metric: 'total_streams' },
    { option: 'sustain_clout',      label: 'Generate 200+ era clout',     target: 200,    metric: 'era_clout' },
  ],
};

const STATUS_CONFIG = {
  active:          { color: '#22c55e', label: 'Active',          icon: Zap,          gradient: 'from-green-500 to-emerald-600' },
  completed:       { color: '#6b7280', label: 'Completed',       icon: Archive,       gradient: 'from-gray-500 to-gray-600' },
  flop:            { color: '#ef4444', label: 'Flop',            icon: TrendingDown,  gradient: 'from-red-500 to-rose-700' },
  one_hit_wonder:  { color: '#f59e0b', label: 'One Hit Wonder',  icon: Star,          gradient: 'from-amber-500 to-yellow-600' },
  iconic:          { color: '#C9A84C', label: 'Iconic',          icon: Crown,         gradient: 'from-amber-400 to-yellow-500' },
};

function N(v) { return Number(v) || 0; }

// ─── SHARED UI ──────────────────────────────────────────────────────────────

function GlassCard({ children, className = "", style }) {
  return <div className={`bg-white/[0.03] border border-white/[0.06] rounded-2xl ${className}`} style={style}>{children}</div>;
}

function StepDots({ current, total, themeColor }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === current ? 'w-6' : 'w-2'}`}
          style={{ backgroundColor: i === current ? (themeColor || '#6366f1') : i < current ? `${themeColor || '#6366f1'}60` : 'rgba(255,255,255,0.1)' }} />
      ))}
    </div>
  );
}

function AestheticTagPill({ tag, selected, onToggle, size = 'md' }) {
  const cfg = AESTHETIC_TAGS.find(t => t.id === (tag?.id || tag));
  if (!cfg) return null;
  const isSm = size === 'sm';
  return (
    <button onClick={onToggle} type="button"
      className={`inline-flex items-center rounded-full transition-all duration-200 ${isSm ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1.5 text-[11px]'} font-semibold ${
        selected
          ? `bg-gradient-to-r ${cfg.gradient} text-white shadow-lg ring-2 ring-white/20`
          : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-gray-200 border border-white/[0.08]'
      }`}>
      {cfg.label}
    </button>
  );
}

function MemoryScoreBar({ score, size = 'md' }) {
  const color = score >= 70 ? '#C9A84C' : score >= 40 ? '#f59e0b' : score >= 20 ? '#6b7280' : '#ef4444';
  const h = size === 'sm' ? 'h-1' : 'h-1.5';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} rounded-full overflow-hidden bg-white/[0.06]`}>
        <div className={`${h} rounded-full transition-all duration-700`} style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

function SentimentIndicator({ sentiment }) {
  const cfg = {
    positive: { icon: Heart, color: '#22c55e', label: 'Positive' },
    neutral:  { icon: Pause, color: '#6b7280', label: 'Neutral' },
    negative: { icon: TrendingDown, color: '#ef4444', label: 'Negative' },
  }[sentiment] || { icon: Pause, color: '#6b7280', label: 'Neutral' };
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1">
      <Icon className="w-3 h-3" style={{ color: cfg.color }} />
      <span className="text-[9px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  );
}

// Maps persona ID to a display color
const PERSONA_COLORS = {
  street_authentic: '#f97316', luxury_hustler: '#a855f7', conscious_voice: '#22c55e',
  party_club_catalyst: '#ec4899', nostalgic_boom_bap: '#f59e0b', femme_power: '#e879f9',
  viral_trendsetter: '#06b6d4', aesthetic_curator: '#8b5cf6', relatable_storyteller: '#3b82f6',
  internet_troll: '#ef4444', producer_visionary: '#14b8a6', motivational_hustler: '#84cc16',
};

// Recommended actions per expression identity persona
const PERSONA_RECOMMENDED_ACTIONS = {
  femme_power:          [{ action: 'Book a Club Run tour', icon: '🎤' }, { action: 'Post fashion/lifestyle content', icon: '📸' }, { action: 'Sign a beauty brand deal', icon: '💄' }, { action: 'Collab with a Femme Power artist', icon: '🤝' }],
  party_club_catalyst:  [{ action: 'Book a Club Run or Festival tour', icon: '🎉' }, { action: 'Post dance content on LoopTok', icon: '💃' }, { action: 'Sign a beverage brand deal', icon: '🍾' }, { action: 'Collab with a Party Catalyst artist', icon: '🤝' }],
  street_authentic:     [{ action: 'Book an Underground Run tour', icon: '🔥' }, { action: 'Post flex content', icon: '💪' }, { action: 'Sign a streetwear brand deal', icon: '👟' }, { action: 'Collab with a Street Authentic artist', icon: '🤝' }],
  luxury_hustler:       [{ action: 'Book an Arena or Stadium tour', icon: '🏟️' }, { action: 'Post flex content on InstaVibe', icon: '💎' }, { action: 'Sign a luxury fashion or auto deal', icon: '🚗' }, { action: 'Collab with a Luxury Hustler artist', icon: '🤝' }],
  viral_trendsetter:    [{ action: 'Post shorts or dance on LoopTok', icon: '⚡' }, { action: 'Book a Pop-Up or Festival tour', icon: '🎪' }, { action: 'Sign a tech brand deal', icon: '📱' }, { action: 'Collab with a Viral Trendsetter artist', icon: '🤝' }],
  aesthetic_curator:    [{ action: 'Post photo/carousel on InstaVibe', icon: '🎨' }, { action: 'Book a Residency tour', icon: '🎭' }, { action: 'Sign a lifestyle brand deal', icon: '✨' }, { action: 'Collab with an Aesthetic Curator artist', icon: '🤝' }],
  conscious_voice:      [{ action: 'Post activism content on LoopTok', icon: '✊' }, { action: 'Book an Intimate Run tour', icon: '🎙️' }, { action: 'Sign an activism brand deal', icon: '🌱' }, { action: 'Collab with a Conscious Voice artist', icon: '🤝' }],
  relatable_storyteller:[{ action: 'Post story time or vlogs', icon: '💬' }, { action: 'Book an Intimate Run tour', icon: '🎸' }, { action: 'Sign a food brand deal', icon: '🍕' }, { action: 'Collab with a Relatable Storyteller', icon: '🤝' }],
  motivational_hustler: [{ action: 'Post motivation content', icon: '💪' }, { action: 'Book a Tour Monster path tour', icon: '🏆' }, { action: 'Sign a sports brand deal', icon: '⚽' }, { action: 'Collab with a Motivational Hustler', icon: '🤝' }],
  nostalgic_boom_bap:   [{ action: 'Book an Intimate or Residency tour', icon: '📻' }, { action: 'Post documentary content', icon: '🎬' }, { action: 'Sign a heritage brand deal', icon: '🏛️' }, { action: 'Collab with a Nostalgic Boom Bap artist', icon: '🤝' }],
  producer_visionary:   [{ action: 'Post behind-the-scenes vlogs', icon: '🎛️' }, { action: 'Book a Residency tour', icon: '🎵' }, { action: 'Sign a tech brand deal', icon: '🔬' }, { action: 'Collab with a Producer Visionary', icon: '🤝' }],
  internet_troll:       [{ action: 'Post comedy on LoopTok', icon: '🤡' }, { action: 'Post viral content on InstaVibe', icon: '😂' }, { action: 'Sign a gaming brand deal', icon: '🎮' }, { action: 'Collab with an Internet Troll artist', icon: '🤝' }],
};

function IdentitySignalPanel({ currentEra, onAdoptIdentity }) {
  const dominantPersona = currentEra?.identity_dominant_persona;
  const nudgeReady = currentEra?.identity_nudge_ready;
  const actionScores = currentEra?.identity_action_scores || {};
  const expressionPrimary = currentEra?.expression_identity_primary;

  // Find top 3 personas by score for the mini bar chart
  const topPersonas = Object.entries(actionScores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topPersonas.length === 0 && !expressionPrimary) return null;

  const targetPersona = expressionPrimary || dominantPersona;
  const targetScore = targetPersona ? (actionScores[targetPersona] || 0) : 0;
  const targetColor = targetPersona ? (PERSONA_COLORS[targetPersona] || '#6366f1') : '#6366f1';
  const targetLabel = targetPersona
    ? targetPersona.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'None';

  const recs = PERSONA_RECOMMENDED_ACTIONS[targetPersona] || [];

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: `linear-gradient(135deg, ${targetColor}10, transparent)`, borderColor: `${targetColor}25` }}>
      <div className="flex items-center justify-between">
        <h4 className="text-white text-sm font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4" style={{ color: targetColor }} />
          Identity Signal
        </h4>
        {nudgeReady && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold animate-pulse"
            style={{ background: `${targetColor}30`, color: targetColor, border: `1px solid ${targetColor}50` }}>
            ✦ Ready to Adopt
          </span>
        )}
      </div>

      {/* Current expression identity */}
      <div className="flex items-center justify-between bg-white/[0.03] rounded-xl p-3">
        <div>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Building Signal</p>
          <p className="text-white text-xs font-semibold">{targetLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-gray-500 mb-0.5">Era Score</p>
          <p className="text-sm font-bold tabular-nums" style={{ color: targetColor }}>{Math.round(targetScore)}</p>
        </div>
      </div>

      {/* Score bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-gray-500">Signal Strength</span>
          <span className="text-[9px]" style={{ color: targetScore >= 70 ? '#22c55e' : targetColor }}>
            {targetScore >= 70 ? '🔥 Strong' : targetScore >= 40 ? '📈 Building' : '🌱 Early'}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, targetScore)}%`, backgroundColor: targetColor }} />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] text-gray-700">0</span>
          <span className="text-[8px] text-gray-500">70 = Adopt</span>
          <span className="text-[8px] text-gray-700">100</span>
        </div>
      </div>

      {/* Top 3 persona bars if multiple are building */}
      {topPersonas.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">All Signals This Era</p>
          {topPersonas.map(([pid, score]) => {
            const pColor = PERSONA_COLORS[pid] || '#6366f1';
            const pLabel = pid.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return (
              <div key={pid} className="flex items-center gap-2">
                <span className="text-[9px] text-gray-400 w-28 truncate">{pLabel}</span>
                <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                  <div className="h-1 rounded-full" style={{ width: `${Math.min(100, score)}%`, backgroundColor: pColor }} />
                </div>
                <span className="text-[9px] tabular-nums w-6 text-right" style={{ color: pColor }}>{Math.round(score)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Adopt button */}
      {nudgeReady && dominantPersona && dominantPersona !== expressionPrimary && onAdoptIdentity && (
        <button onClick={() => onAdoptIdentity(dominantPersona)}
          className="w-full py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: `linear-gradient(135deg, ${targetColor}40, ${targetColor}20)`, color: targetColor, border: `1px solid ${targetColor}40` }}>
          Adopt {targetLabel} as Expression Identity →
        </button>
      )}

      {/* Recommended actions */}
      {recs.length > 0 && (
        <div>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Actions That Build This Signal</p>
          <div className="space-y-1">
            {recs.map((r, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-2.5 py-1.5">
                <span className="text-xs">{r.icon}</span>
                <span className="text-[10px] text-gray-300">{r.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EraStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
  const Icon = cfg.icon;
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${cfg.gradient} text-white text-[9px] font-bold uppercase tracking-wider`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </div>
  );
}

// Helper: build a composite gradient from selected aesthetic tags
function buildCompositeGradient(tags) {
  if (!tags?.length) return 'linear-gradient(135deg, rgba(99,102,241,0.08), transparent)';
  const colors = tags.slice(0, 3).map(t => {
    const cfg = AESTHETIC_TAGS.find(a => a.id === t);
    return cfg?.color || '#6366f1';
  });
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}15, ${colors[0]}05, transparent)`;
  if (colors.length === 2) return `linear-gradient(135deg, ${colors[0]}18, ${colors[1]}10, transparent)`;
  return `linear-gradient(135deg, ${colors[0]}18, ${colors[1]}12, ${colors[2]}08, transparent)`;
}

// Era declaration cost based on career stage
function getEraCost(profile) {
  const stage = (profile?.career_stage || '').toLowerCase();
  if (stage.includes('super') || stage.includes('legend') || stage.includes('global')) return { energy: 25, money: 2000 };
  if (stage.includes('mainstream') || stage.includes('a-list')) return { energy: 20, money: 1000 };
  if (stage.includes('rising') || stage.includes('established')) return { energy: 15, money: 500 };
  return { energy: 10, money: 250 };
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function EraManagementAppStandalone({ currentEra, profile, onClose: _onClose, onEraUpdated }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(currentEra?.is_active ? "overview" : "create");
  const [pastEras, setPastEras] = useState([]);
  const [eraReleases, setEraReleases] = useState([]);
  const [eraEndModal, setEraEndModal] = useState(false);

  // Wizard state for era creation
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({
    era_name: "", description: "", signature: "", motifs: ["", "", ""],
    aesthetic_tags: [], theme_color: "#6366f1",
    focus_path: "DIGITAL_CULT",
    expression_identity_primary: null, expression_identity_secondary: null,
    budget_marketing: 5000, budget_visuals: 3000, budget_features: 2000, budget_community: 1500, budget_tourprep: 1000,
    rollout_mission: null, rollout_target_markets: [], rollout_phase_promises: {},
  });
  const [selectedPreset, setSelectedPreset] = useState("Standard");

  const themeColor = currentEra?.theme_color || form.theme_color || '#6366f1';

  // Only set the initial tab on mount — don't reset on era updates (prevents tab bounce after iconic designation etc.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTab(currentEra?.is_active ? "overview" : "create"); }, []);

  useEffect(() => {
    if (!profile?.id) return;
    base44.entities.Era.filter({ artist_id: profile.id }).then(all => {
      setPastEras((Array.isArray(all) ? all : []).filter(e => !e.is_active).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }).catch(() => {});
  }, [profile?.id, currentEra]);

  // Load releases for the active era
  useEffect(() => {
    if (!currentEra?.id || !currentEra?.is_active) { setEraReleases([]); return; }
    base44.entities.Release.filter({ era_id: currentEra.id }).then(r => setEraReleases(Array.isArray(r) ? r : [])).catch(() => setEraReleases([]));
  }, [currentEra?.id, currentEra?.is_active]);

  const currentPhaseActions = useMemo(() => {
    if (!currentEra?.is_active || !currentEra?.phase) return [];
    return ERA_ACTIONS_BY_PHASE[currentEra.phase] || [];
  }, [currentEra?.phase, currentEra?.is_active]);

  const totalBudget = N(form.budget_marketing) + N(form.budget_visuals) + N(form.budget_features) + N(form.budget_community) + N(form.budget_tourprep);
  const isFormValid = form.era_name.trim().length > 0;
  const eraCost = getEraCost(profile);

  // ─── HANDLERS ──────────────────────────────────────────────────────────

  const handleEraAction = async (action) => {
    if (!currentEra?.id || !profile?.id) return;
    const completedIds = (currentEra.era_actions || []).map(a => a.id);
    if (completedIds.includes(action.id)) { showToast(`"${action.name}" has already been executed this era.`, 'warning'); return; }
    setLoading(true);
    try {
      await base44.functions.invoke('eraEvolutionDetector', { action: 'executeEraAction', eraId: currentEra.id, actionId: action.id, artistId: profile.id });
      const updated = await base44.entities.Era.get(currentEra.id);
      if (onEraUpdated && updated) onEraUpdated(updated);
      if (action.route) {
        showToast(`Action recorded! Heading to ${action.routeLabel || action.route}...`, 'success');
        setTab("overview"); // close actions panel before navigating away
        navigate(action.route);
      }
    } catch (e) { console.error("Era action failed:", e); throw e; }
    finally { setLoading(false); }
  };

  const handleStartEra = async () => {
    if (!profile?.id || !isFormValid) return;
    setLoading(true);
    try {
      const newEra = await base44.entities.Era.create({
        artist_id: profile.id, era_name: form.era_name, description: form.description,
        motifs: form.motifs.filter(Boolean), signature: form.signature,
        aesthetic_tags: form.aesthetic_tags, theme_color: form.theme_color,
        focus_path: form.focus_path, budget_marketing: form.budget_marketing, budget_visuals: form.budget_visuals,
        budget_features: form.budget_features, budget_community: form.budget_community, budget_tourprep: form.budget_tourprep,
        expression_identity_primary: form.expression_identity_primary || null,
        expression_identity_secondary: form.expression_identity_secondary || null,
        is_active: true, status: 'active', trigger_event: 'manual', is_player_declared: true, phase: 'TEASE', phase_turns_left: 60,
        momentum: 15, tension: 10, volatility_level: 20, career_stage: "EARLY",
        current_multiplier_streaming: 1, current_multiplier_virality: 1, current_multiplier_retention: 1, current_multiplier_hype_decay: 1,
        goals: [
          { id: 'goal_followers', type: 'followers', label: 'Grow Your Fanbase', target: Math.max(500, Math.floor(N(profile.followers) * 1.5)), current: N(profile.followers), completed: false },
          { id: 'goal_streams',   type: 'streams',   label: 'Era Streaming Goal', target: Math.max(100000, Math.floor(N(profile.followers) * 50)), current: 0, completed: false },
          { id: 'goal_hype',      type: 'hype',      label: 'Peak Hype',          target: 75, current: N(profile.hype), completed: false },
        ],
        ...(form.rollout_mission ? { rollout_plan: { mission: form.rollout_mission, target_markets: form.rollout_target_markets, phase_promises: form.rollout_phase_promises } } : {}),
      });
      await base44.entities.ArtistProfile.update(profile.id, { active_era_id: newEra.id });
      if (onEraUpdated) onEraUpdated(newEra);
      setWizardStep(0);
    } catch (e) { console.error("Start era failed:", e); showToast("Failed to start era", "error"); }
    finally { setLoading(false); }
  };

  const handleEndEra = async () => {
    if (!currentEra?.id || !profile?.id) return;
    setLoading(true);
    try {
      await base44.functions.invoke('eraEvolutionDetector', {
        action: 'handleEraEnd',
        eraId: currentEra.id,
        artistId: profile.id,
        earlyTerminate: currentEra.phase !== 'FADE',
      });
      setEraEndModal(false);
      if (onEraUpdated) onEraUpdated(null);
    } catch (e) {
      console.error("End era failed:", e);
      showToast(e?.message || "Failed to end era", "error");
    }
    finally { setLoading(false); }
  };

  const handleDesignateIconic = async (release) => {
    if (!currentEra?.id || !profile?.id) return;
    setLoading(true);
    try {
      const result = await base44.functions.invoke('eraEvolutionDetector', {
        action: 'designateIconicRelease', eraId: currentEra.id, releaseId: release.id, artistId: profile.id,
      });
      // The backend returns { success: true, iconic_releases: updated }
      // Use this directly instead of re-fetching to avoid race conditions
      if (result?.iconic_releases && onEraUpdated) {
        const updatedEra = { ...currentEra, iconic_releases: result.iconic_releases };
        onEraUpdated(updatedEra);
      } else {
        // Fallback: re-fetch if response doesn't contain iconic_releases
        const updated = await base44.entities.Era.get(currentEra.id);
        if (onEraUpdated && updated) onEraUpdated(updated);
      }
      showToast(`"${release.title}" crowned as iconic!`, 'success');
    } catch (e) {
      console.error("Designate iconic failed:", e);
      showToast(e?.message || "Failed to designate release", "error");
    } finally { setLoading(false); }
  };

  const handleAdoptIdentity = async (personaId) => {
    if (!currentEra?.id) return;
    setLoading(true);
    try {
      await base44.entities.Era.update(currentEra.id, {
        expression_identity_primary: personaId,
      });
      const updated = await base44.entities.Era.get(currentEra.id);
      if (onEraUpdated && updated) onEraUpdated(updated);
      const label = personaId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      showToast(`Expression identity updated to ${label}!`, 'success');
    } catch (e) {
      console.error("Adopt identity failed:", e);
      showToast(e?.message || "Failed to update identity", "error");
    } finally { setLoading(false); }
  };

  const toggleAestheticTag = (tagId) => {
    setForm(p => {
      const current = p.aesthetic_tags || [];
      if (current.includes(tagId)) return { ...p, aesthetic_tags: current.filter(t => t !== tagId) };
      if (current.length >= 5) { showToast("Maximum 5 aesthetic tags", "warning"); return p; }
      return { ...p, aesthetic_tags: [...current, tagId] };
    });
  };

  // ─── TABS ──────────────────────────────────────────────────────────────

  const TABS = currentEra?.is_active
    ? [{ id: "overview", label: "Overview" }, { id: "actions", label: "Actions" }, { id: "catalog", label: "Catalog" }, { id: "history", label: "Legacy" }]
    : [{ id: "create", label: "New Era" }, { id: "history", label: "Legacy" }];

  const iconicReleaseIds = (currentEra?.iconic_releases || []).map(r => r.release_id);

  // ─── WIZARD STEPS ──────────────────────────────────────────────────────

  const renderWizard = () => {
    const compositeGradient = buildCompositeGradient(form.aesthetic_tags);
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <GlassCard className="p-5 relative overflow-hidden" style={{ background: compositeGradient }}>
          {/* Animated border shimmer */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
            background: `linear-gradient(135deg, ${form.theme_color}20, transparent, ${form.theme_color}10)`,
            opacity: 0.5,
          }} />
          <div className="relative space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white text-lg font-bold tracking-tight">
                  {wizardStep === 0 ? "Name & Story" : wizardStep === 1 ? "Define Your Aesthetic" : wizardStep === 2 ? "Strategy" : "Launch Era"}
                </h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  {wizardStep === 0 ? "What's this era called?" : wizardStep === 1 ? "Choose 1-5 tags that define the vibe" : wizardStep === 2 ? "Set your focus and budget" : wizardStep === 3 ? "Define your era's grand mission" : "Review and declare"}
                </p>
              </div>
              <StepDots current={wizardStep} total={5} themeColor={form.theme_color} />
            </div>

            <AnimatePresence mode="wait">
              {/* Step 0: Name & Story */}
              {wizardStep === 0 && (
                <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1 block">Era Name *</label>
                    <input value={form.era_name} onChange={e => setForm(p => ({ ...p, era_name: e.target.value }))} placeholder="e.g. The Midnight Renaissance"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all" maxLength={50} />
                  </div>
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1 block">Description</label>
                    <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What's this era about? What story are you telling?"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all resize-none h-20" maxLength={200} />
                  </div>
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1 block">Tagline / Signature</label>
                    <input value={form.signature} onChange={e => setForm(p => ({ ...p, signature: e.target.value }))} placeholder={`"From the ashes, louder."`}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white italic placeholder-gray-600 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all" maxLength={80} />
                  </div>
                </motion.div>
              )}

              {/* Step 1: Aesthetic */}
              {wizardStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  {/* Tag clusters */}
                  {['Street', 'Luxury', 'Ethereal', 'Party', 'Conscious', 'Dark'].map(cluster => {
                    const tags = AESTHETIC_TAGS.filter(t => t.cluster === cluster);
                    return (
                      <div key={cluster}>
                        <label className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-1.5 block">{cluster}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map(tag => (
                            <AestheticTagPill key={tag.id} tag={tag} selected={form.aesthetic_tags.includes(tag.id)} onToggle={() => toggleAestheticTag(tag.id)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Theme color */}
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1.5 block">Theme Color</label>
                    <div className="flex items-center gap-2">
                      {['#ef4444','#f59e0b','#22c55e','#3b82f6','#6366f1','#a855f7','#ec4899','#C9A84C','#06b6d4','#71717a'].map(c => (
                        <button key={c} onClick={() => setForm(p => ({ ...p, theme_color: c }))} type="button"
                          className={`w-7 h-7 rounded-full transition-all ${form.theme_color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0f] scale-110' : 'hover:scale-105'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                      <input type="color" value={form.theme_color} onChange={e => setForm(p => ({ ...p, theme_color: e.target.value }))}
                        className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent" />
                    </div>
                  </div>
                  {/* Motifs */}
                  <div>
                    <label className="text-gray-500 text-[11px] font-medium mb-1 block">Motifs (optional)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {form.motifs.map((m, i) => (
                        <input key={i} value={m} onChange={e => { const n = [...form.motifs]; n[i] = e.target.value; setForm(p => ({ ...p, motifs: n })); }}
                          className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none" placeholder={`Motif ${i+1}`} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Strategy */}
              {wizardStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1.5 block">Focus Path</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FOCUS_PATHS.map(p => (
                        <button key={p.value} onClick={() => setForm(prev => ({ ...prev, focus_path: p.value }))} type="button"
                          className={`p-2 rounded-xl border text-left transition-all ${form.focus_path === p.value ? 'border-white/30 bg-white/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                          <div className="text-white text-[11px] font-medium">{p.label}</div>
                          <div className="text-gray-500 text-[9px]">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-1 block">Era Expression Identity</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-gray-500 text-[9px] mb-1 block">Primary</label>
                        <select value={form.expression_identity_primary || ''} onChange={e => setForm(p => ({ ...p, expression_identity_primary: e.target.value || null }))}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-white">
                          <option value="">Organic</option>
                          {MARKETING_PERSONA_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-gray-500 text-[9px] mb-1 block">Secondary</label>
                        <select value={form.expression_identity_secondary || ''} onChange={e => setForm(p => ({ ...p, expression_identity_secondary: e.target.value || null }))}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-white">
                          <option value="">None</option>
                          {MARKETING_PERSONA_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-gray-400 text-[11px] font-medium">Budget</label>
                      <select value={selectedPreset} onChange={e => { setSelectedPreset(e.target.value); setForm(p => ({ ...p, ...BUDGET_PRESETS[e.target.value] })); }}
                        className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] text-white">
                        {Object.keys(BUDGET_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    {['budget_marketing', 'budget_visuals', 'budget_features', 'budget_community', 'budget_tourprep'].map(key => (
                      <div key={key} className="flex items-center gap-2 mb-1.5">
                        <span className="text-gray-500 text-[10px] w-20 capitalize">{key.replace('budget_', '')}</span>
                        <input type="number" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white" min="0" step="100" />
                      </div>
                    ))}
                    <div className="flex justify-between text-[10px] text-gray-400 pt-2 border-t border-white/[0.06] mt-2">
                      <span>Total</span><span className="text-white font-medium">${totalBudget.toLocaleString()}</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Grand Mission */}
              {wizardStep === 3 && (
                <motion.div key="step3gm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-2 block">Era Grand Mission <span className="text-gray-600">(optional)</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(MISSION_CONFIGS).map(([key, cfg]) => (
                        <button key={key} type="button"
                          onClick={() => setForm(p => ({ ...p, rollout_mission: p.rollout_mission === key ? null : key }))}
                          className={`p-3 rounded-xl border text-left transition-all ${form.rollout_mission === key ? 'border-white/30 bg-white/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                          <div className="text-lg mb-1">{cfg.icon}</div>
                          <div className="text-white text-[11px] font-semibold">{cfg.label}</div>
                          <div className="text-gray-500 text-[9px] mt-0.5">{cfg.desc}</div>
                          <div className="text-[8px] mt-1.5 px-1.5 py-0.5 rounded-full bg-white/[0.04] inline-block" style={{ color: cfg.color }}>⚠ {cfg.trade_off}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-2 block">Conquest Zones <span className="text-gray-600">(target markets)</span></label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONQUEST_REGIONS.map(r => (
                        <button key={r} type="button"
                          onClick={() => setForm(p => ({
                            ...p, rollout_target_markets: p.rollout_target_markets.includes(r)
                              ? p.rollout_target_markets.filter(m => m !== r)
                              : [...p.rollout_target_markets, r]
                          }))}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${form.rollout_target_markets.includes(r) ? 'bg-indigo-500/30 border border-indigo-400/50 text-indigo-200' : 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:text-gray-200'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[11px] font-medium mb-2 block">Fandom Promises <span className="text-gray-600">(commit to your fans)</span></label>
                    {['TEASE', 'DROP', 'SUSTAIN'].map(phase => (
                      <div key={phase} className="mb-2">
                        <label className="text-gray-500 text-[9px] uppercase tracking-wider mb-1 block">{phase} Phase</label>
                        <select value={form.rollout_phase_promises[phase]?.option || ''}
                          onChange={e => {
                            const opt = (PROMISE_OPTIONS[phase] || []).find(o => o.option === e.target.value);
                            setForm(p => {
                              const newPromises = { ...p.rollout_phase_promises };
                              if (opt) { newPromises[phase] = { ...opt, current: 0, fulfilled: false }; }
                              else { delete newPromises[phase]; }
                              return { ...p, rollout_phase_promises: newPromises };
                            });
                          }}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-white">
                          <option value="">No promise</option>
                          {(PROMISE_OPTIONS[phase] || []).map(o => <option key={o.option} value={o.option}>{o.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 4: Launch */}
              {wizardStep === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  {/* Era preview card */}
                  <div className="rounded-2xl overflow-hidden border border-white/[0.1]" style={{ background: buildCompositeGradient(form.aesthetic_tags) }}>
                    <div className="p-5 backdrop-blur-sm bg-black/20">
                      <h4 className="text-white text-xl font-bold tracking-tight">{form.era_name || "Untitled Era"}</h4>
                      {form.signature && <p className="text-gray-300 text-sm italic mt-1">"{form.signature}"</p>}
                      {form.description && <p className="text-gray-400 text-xs mt-2 line-clamp-2">{form.description}</p>}
                      {form.aesthetic_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {form.aesthetic_tags.map(t => <AestheticTagPill key={t} tag={t} selected size="sm" />)}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-400">
                        {form.expression_identity_primary && <span>{getPersonaLabel(form.expression_identity_primary)}</span>}
                        {form.expression_identity_secondary && <><span>×</span><span>{getPersonaLabel(form.expression_identity_secondary)}</span></>}
                        <span>•</span>
                        <span>{form.focus_path?.replace(/_/g, ' ')}</span>
                        <span>•</span>
                        <span>${totalBudget.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  {/* Cost */}
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-[11px] font-medium">Declaration Cost</p>
                      <p className="text-gray-500 text-[9px]">Invested into your new chapter</p>
                    </div>
                    <div className="text-right">
                      <span className="text-white text-sm font-semibold">{eraCost.energy} energy</span>
                      <span className="text-gray-500 text-sm mx-1">+</span>
                      <span className="text-white text-sm font-semibold">${eraCost.money.toLocaleString()}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-2">
              {wizardStep > 0 ? (
                <button onClick={() => setWizardStep(s => s - 1)} className="flex items-center gap-1 text-gray-400 text-xs hover:text-white transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              ) : <div />}
              {wizardStep < 4 ? (
                <button onClick={() => { if (wizardStep === 0 && !form.era_name.trim()) { showToast("Era name is required", "warning"); return; } setWizardStep(s => s + 1); }}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110" style={{ background: `linear-gradient(135deg, ${form.theme_color}, ${form.theme_color}cc)` }}>
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleStartEra} disabled={loading || !isFormValid}
                  className="relative px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 overflow-hidden group"
                  style={{ background: `linear-gradient(135deg, ${form.theme_color}, ${form.theme_color}cc)` }}>
                  <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> {loading ? "Launching..." : "Launch Era"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </GlassCard>
      </motion.div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl" style={{ background: currentEra?.is_active ? buildCompositeGradient(currentEra.aesthetic_tags) : 'linear-gradient(135deg, rgba(99,102,241,0.08), transparent)' }}>
        <div className="relative p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              {currentEra?.is_active ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ background: `${PHASE_COLORS[currentEra.phase] || themeColor}25`, color: PHASE_COLORS[currentEra.phase] || themeColor }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PHASE_COLORS[currentEra.phase] || themeColor }} />
                  {currentEra.phase} Phase
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">
                  <Pause className="w-3 h-3" /> No Active Era
                </div>
              )}
              <h2 className="text-white text-2xl font-bold tracking-tight">{currentEra?.era_name || "Start Your Next Chapter"}</h2>
              {currentEra?.signature && <p className="text-gray-400 text-sm mt-1 italic">"{currentEra.signature}"</p>}
              {currentEra?.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{currentEra.description}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              {currentEra?.expression_identity_primary && <span className="px-2 py-1 rounded-full text-[10px] bg-white/[0.06] border border-white/[0.08] text-gray-300">{getPersonaLabel(currentEra.expression_identity_primary)}</span>}
              {currentEra?.is_experimental && <span className="px-2 py-1 rounded-full text-[10px] bg-amber-500/20 border border-amber-400/30 text-amber-300">Experimental</span>}
            </div>
          </div>
          {/* Aesthetic tag pills */}
          {currentEra?.is_active && currentEra?.aesthetic_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {currentEra.aesthetic_tags.map(t => <AestheticTagPill key={t} tag={t} selected size="sm" />)}
            </div>
          )}
          {currentEra?.is_active && (
            <div className="grid grid-cols-4 gap-2 bg-black/20 backdrop-blur-sm rounded-2xl p-3">
              {[
                { label: "Momentum", val: currentEra.momentum ?? 0, icon: <TrendingUp className="w-3 h-3 text-blue-400" />, color: "text-blue-400" },
                { label: "Tension", val: currentEra.tension ?? 0, icon: <Zap className="w-3 h-3 text-amber-400" />, color: "text-amber-400" },
                { label: "Turns Left", val: currentEra.phase_turns_left ?? 0, icon: <Clock className="w-3 h-3 text-green-400" />, color: "text-green-400" },
                { label: "Memory", val: currentEra.fandom_memory_score ?? 0, icon: <Star className="w-3 h-3 text-yellow-400" />, color: "text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="flex flex-col items-center gap-0.5">
                  {s.icon}
                  <span className={`text-sm font-semibold tabular-nums ${s.color}`}>{s.val}</span>
                  <span className="text-[8px] text-gray-500 uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-white/[0.1] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {tab === "overview" && currentEra?.is_active && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Phase Timeline */}
          <GlassCard className="p-5">
            <h4 className="text-white text-sm font-semibold mb-4">Phase Timeline</h4>
            <div className="flex items-center gap-2 mb-3">
              {["TEASE", "DROP", "SUSTAIN", "FADE"].map((phase, idx) => {
                const isActive = currentEra.phase === phase;
                const isPast = ["TEASE", "DROP", "SUSTAIN", "FADE"].indexOf(currentEra.phase) > idx;
                return (
                  <div key={phase} className="flex-1">
                    <div className={`h-2.5 rounded-full transition-all duration-500 ${isActive ? 'ring-2 ring-offset-2 ring-offset-[#0a0a0f]' : ''}`}
                      style={{ backgroundColor: isActive ? PHASE_COLORS[phase] : isPast ? `${PHASE_COLORS[phase]}50` : 'rgba(255,255,255,0.04)', ringColor: isActive ? PHASE_COLORS[phase] : undefined }} />
                    <p className={`text-[10px] text-center mt-1.5 font-medium ${isActive ? 'text-white' : isPast ? 'text-gray-500' : 'text-gray-700'}`}>{phase}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-gray-500 text-xs text-center">{PHASE_DESC[currentEra.phase] || ""}</p>
          </GlassCard>

          {/* Fandom Memory + Sentiment */}
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white text-sm font-semibold">Fandom Memory</h4>
              <SentimentIndicator sentiment={currentEra.fandom_sentiment} />
            </div>
            <MemoryScoreBar score={N(currentEra.fandom_memory_score)} />
            <p className="text-gray-500 text-[10px] mt-2">How strongly your fans will remember this era. Boosted by streams, iconic releases, and tours.</p>
          </GlassCard>

          {/* Identity Signal Panel */}
          <IdentitySignalPanel
            currentEra={currentEra}
            onAdoptIdentity={handleAdoptIdentity}
          />

          {/* Era Grand Mission */}
          {currentEra?.rollout_plan?.mission && MISSION_CONFIGS[currentEra.rollout_plan.mission] && (() => {
            const mCfg = MISSION_CONFIGS[currentEra.rollout_plan.mission];
            const promise = currentEra.rollout_plan.phase_promises?.[currentEra.phase];
            const iconicRelease = eraReleases.find(r => iconicReleaseIds.includes(r.id));
            const promiseEntries = Object.values(currentEra.rollout_plan.phase_promises || {});
            const fulfillmentCount = promiseEntries.filter(p => p.fulfilled).length;
            const totalPromises = promiseEntries.length;
            return (
              <GlassCard className="p-5 border" style={{ background: `linear-gradient(135deg, ${mCfg.color}10, transparent)`, borderColor: `${mCfg.color}30` }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white text-sm font-semibold flex items-center gap-2">
                    <span className="text-base">{mCfg.icon}</span> {mCfg.label}
                  </h4>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${mCfg.color}25`, color: mCfg.color }}>Grand Mission</span>
                </div>
                {currentEra.phase === 'DROP' && iconicRelease?.cover_art_url && (
                  <div className="relative w-full h-16 rounded-xl overflow-hidden mb-3">
                    <img src={iconicRelease.cover_art_url} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-3">
                      <span className="text-white text-xs font-bold">Iconic Release</span>
                    </div>
                  </div>
                )}
                {currentEra.rollout_plan.target_markets?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {currentEra.rollout_plan.target_markets.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">📍 {m}</span>
                    ))}
                  </div>
                )}
                {promise && (() => {
                  const pct = Math.min(100, Math.round((N(promise.current) / Math.max(1, N(promise.target))) * 100));
                  return (
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] mb-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-white text-[10px] font-medium">🤝 {promise.label}</span>
                        {promise.fulfilled ? <span className="text-emerald-400 text-[9px] font-bold">✓ Kept</span> : <span className="text-gray-400 text-[10px] tabular-nums">{pct}%</span>}
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06]">
                        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: promise.fulfilled ? '#22c55e' : mCfg.color }} />
                      </div>
                    </div>
                  );
                })()}
                {totalPromises > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-gray-500 text-[9px]">Era Promises Kept</span>
                    <span className="text-white text-[10px] font-semibold tabular-nums">{fulfillmentCount}/{totalPromises}</span>
                  </div>
                )}
                <p className="text-[9px] text-gray-600 mt-1.5">⚠ {mCfg.trade_off}</p>
              </GlassCard>
            );
          })()}

          {/* Era Goals */}
          {currentEra?.goals?.length > 0 && (
            <GlassCard className="p-5">
              <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" /> Era Goals</h4>
              <div className="space-y-2.5">
                {currentEra.goals.map(g => {
                  const pct = Math.min(100, Math.round((N(g.current) / Math.max(1, N(g.target))) * 100));
                  return (
                    <div key={g.id} className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.05]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-white text-xs font-medium">{g.label}</span>
                        {g.completed
                          ? <span className="text-emerald-400 text-[9px] font-bold">✓ Complete</span>
                          : <span className="text-gray-400 text-[10px] tabular-nums">{pct}%</span>}
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06]">
                        <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: g.completed ? '#22c55e' : '#6366f1' }} />
                      </div>
                      <p className="text-gray-600 text-[9px] mt-1 tabular-nums">{fmt(N(g.current))} / {fmt(N(g.target))}</p>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* Engine Vitals */}
          <GlassCard className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" /> Engine Vitals</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Volatility", val: N(currentEra.volatility_level), max: 100, color: N(currentEra.volatility_level) > 60 ? '#ef4444' : N(currentEra.volatility_level) > 30 ? '#f59e0b' : '#22c55e' },
                { label: "Fatigue", val: N(currentEra.era_fatigue_turns), max: 250, color: N(currentEra.era_fatigue_turns) > 25 ? '#ef4444' : N(currentEra.era_fatigue_turns) > 15 ? '#f59e0b' : '#22c55e' },
                { label: "Anticipation", val: N(currentEra.anticipation_meter), max: 100, color: '#8b5cf6' },
                { label: "Alignment", val: N(currentEra.identity_alignment_score), max: 100, color: N(currentEra.identity_alignment_score) >= 60 ? '#22c55e' : N(currentEra.identity_alignment_score) >= 30 ? '#f59e0b' : '#ef4444' },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.02] rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">{s.label}</span>
                    <span className="text-white text-xs font-semibold tabular-nums">{s.val}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (s.val / s.max) * 100)}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Multipliers */}
          <GlassCard className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Gauge className="w-4 h-4 text-indigo-400" /> Active Multipliers</h4>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Stream", val: N(currentEra.current_multiplier_streaming).toFixed(2), color: '#3b82f6' },
                { label: "Viral", val: N(currentEra.current_multiplier_virality).toFixed(2), color: '#8b5cf6' },
                { label: "Retain", val: N(currentEra.current_multiplier_retention).toFixed(2), color: '#22c55e' },
                { label: "Decay", val: N(currentEra.current_multiplier_hype_decay).toFixed(2), color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} className="flex flex-col items-center bg-white/[0.02] rounded-xl p-2.5">
                  <span className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.val}×</span>
                  <span className="text-gray-500 text-[9px] uppercase tracking-wider mt-0.5">{s.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Clout & Focus */}
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Era Clout</h4>
              {currentEra.focus_path && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-white/[0.06] text-gray-300">
                  <Target className="w-3 h-3 text-indigo-400" /> {FOCUS_PATHS.find(f => f.value === currentEra.focus_path)?.label || currentEra.focus_path}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-white text-lg font-bold tabular-nums">{fmt(N(currentEra.era_clout_generated))}</div>
                  <div className="text-gray-500 text-[10px]">Clout earned this era</div>
                </div>
              </div>
              {currentEra.is_experimental && (
                <div className="ml-auto px-2.5 py-1 rounded-full text-[9px] font-semibold bg-amber-500/15 border border-amber-400/20 text-amber-300">
                  🧪 Experimental
                </div>
              )}
            </div>
          </GlassCard>

          {/* Performance */}
          <GlassCard className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3">Era Performance</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Streams", val: fmt(N(currentEra.total_streams)), icon: <Music className="w-4 h-4 text-blue-400" /> },
                { label: "Revenue", val: `$${fmt(N(currentEra.total_revenue))}`, icon: <DollarSign className="w-4 h-4 text-green-400" /> },
                { label: "Fans Gained", val: `+${fmt(N(currentEra.total_followers_gained))}`, icon: <Users className="w-4 h-4 text-purple-400" /> },
                { label: "Peak Hype", val: N(currentEra.peak_hype), icon: <TrendingUp className="w-4 h-4 text-amber-400" /> },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 bg-white/[0.02] rounded-xl p-3">
                  {s.icon}
                  <div>
                    <div className="text-white text-sm font-semibold">{s.val}</div>
                    <div className="text-gray-500 text-[10px]">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Active Challenges */}
          {(currentEra?.active_challenges || []).filter(ch => !ch.completed).length > 0 && (
            <GlassCard className="p-5">
              <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-rose-400" /> Active Challenges</h4>
              <div className="space-y-2">
                {(currentEra.active_challenges || []).filter(ch => !ch.completed).map(ch => (
                  <div key={ch.id} className="flex items-start gap-3 bg-white/[0.02] rounded-xl p-3 border border-rose-500/10">
                    <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                    <p className="text-white text-xs">{ch.description}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => setTab("catalog")} className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl py-3 text-sm text-white font-medium hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-2">
              <Music className="w-4 h-4 text-gray-400" /> Catalog
            </button>
            <button onClick={() => setEraEndModal(true)} className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl py-3 text-sm text-red-400 font-medium hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2">
              <Archive className="w-4 h-4" /> End Era
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── ACTIONS TAB ─── */}
      {tab === "actions" && currentEra?.is_active && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-400" />
              <h4 className="text-white text-sm font-semibold">{currentEra.phase} Phase Actions</h4>
            </div>
            <EraActionsPanel actions={currentPhaseActions} era={currentEra} profile={profile} onAction={handleEraAction} onClose={() => setTab("overview")} />
          </GlassCard>
        </motion.div>
      )}

      {/* ─── CATALOG TAB (Iconic Releases) ─── */}
      {tab === "catalog" && currentEra?.is_active && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Iconic releases */}
          {iconicReleaseIds.length > 0 && (
            <GlassCard className="p-5 border-amber-500/20" style={{ borderColor: 'rgba(201,168,76,0.2)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-4 h-4 text-amber-400" />
                <h4 className="text-amber-400 text-sm font-semibold">Crowned Releases</h4>
              </div>
              <div className="space-y-2">
                {(currentEra.iconic_releases || []).map((ir, i) => (
                  <div key={i} className="flex items-center gap-3 bg-amber-500/[0.06] rounded-xl p-3 border border-amber-500/10">
                    <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{ir.title}</p>
                      <p className="text-amber-400/60 text-[9px]">Iconic since {new Date(ir.designated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* All era releases */}
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white text-sm font-semibold">Era Releases</h4>
              <span className="text-gray-500 text-[10px]">{iconicReleaseIds.length}/3 iconic slots</span>
            </div>
            {eraReleases.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-4">No releases yet in this era. Go to Studio to create one!</p>
            ) : (
              <div className="space-y-2">
                {[...eraReleases].sort((a, b) => N(b.lifetime_streams) - N(a.lifetime_streams)).map(release => {
                  const isIconic = iconicReleaseIds.includes(release.id);
                  const streams = N(release.lifetime_streams);
                  const qualifies = streams >= 5000;
                  return (
                    <div key={release.id} className={`flex items-center gap-3 rounded-xl p-3 border ${isIconic ? 'bg-amber-500/[0.06] border-amber-500/15' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-semibold truncate">{release.title || release.name || 'Untitled'}</p>
                        <p className="text-gray-500 text-[10px]">{fmt(streams)} streams • {release.lifecycle_state}</p>
                      </div>
                      {isIconic ? (
                        <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : qualifies && iconicReleaseIds.length < 3 ? (
                        <button onClick={() => handleDesignateIconic(release)} disabled={loading}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-600 text-[10px] font-bold text-white hover:brightness-110 transition-all disabled:opacity-40">
                          <Star className="w-3 h-3" /> Crown
                        </button>
                      ) : !qualifies ? (
                        <span className="text-gray-600 text-[9px]">5K+ to qualify</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* ─── CREATE TAB (Wizard) ─── */}
      {tab === "create" && !currentEra?.is_active && renderWizard()}

      {/* ─── HISTORY / LEGACY TAB ─── */}
      {tab === "history" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-0">
          {pastEras.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <Archive className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No past eras yet</p>
              <p className="text-gray-600 text-xs mt-1">Complete your first era to build your legacy</p>
            </GlassCard>
          ) : (
            <div className="relative pl-6">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-3 bottom-3 w-px bg-white/[0.08]" />

              {/* Current era node (if active) */}
              {currentEra?.is_active && (
                <div className="relative mb-6">
                  <div className="absolute left-[-17px] top-2 w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-500/30 ring-offset-2 ring-offset-[#0a0a0f] animate-pulse" />
                  <GlassCard className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="text-white text-sm font-semibold">{currentEra.era_name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <EraStatusBadge status="active" />
                          <span className="text-gray-500 text-[9px]">{currentEra.phase} Phase</span>
                        </div>
                      </div>
                    </div>
                    {currentEra.aesthetic_tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {currentEra.aesthetic_tags.slice(0, 3).map(t => <AestheticTagPill key={t} tag={t} selected size="sm" />)}
                      </div>
                    )}
                    <MemoryScoreBar score={N(currentEra.fandom_memory_score)} size="sm" />
                  </GlassCard>
                </div>
              )}

              {/* Past era nodes */}
              {pastEras.map((era, _idx) => {
                const status = era.status || (era.is_flop ? 'flop' : era.is_one_hit ? 'one_hit_wonder' : 'completed');
                const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
                const memScore = N(era.fandom_memory_score) || N(era.legacy_bonuses?.memory_score) || 0;
                return (
                  <div key={era.id} className="relative mb-4">
                    <div className="absolute left-[-17px] top-2 w-3 h-3 rounded-full" style={{ backgroundColor: statusCfg.color }} />
                    <GlassCard className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-white text-sm font-semibold">{era.era_name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <EraStatusBadge status={status} />
                            <span className="text-gray-600 text-[9px]">{era.focus_path?.replace(/_/g, ' ')}</span>
                          </div>
                        </div>
                        {era.legacy_bonuses?.score > 0 && (
                          <div className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold">
                            {era.legacy_bonuses.score}
                          </div>
                        )}
                      </div>
                      {/* Aesthetic tags */}
                      {era.aesthetic_tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {era.aesthetic_tags.slice(0, 3).map(t => <AestheticTagPill key={t} tag={t} selected size="sm" />)}
                        </div>
                      )}
                      {/* Memory score */}
                      {memScore > 0 && (
                        <div className="mb-2">
                          <MemoryScoreBar score={memScore} size="sm" />
                        </div>
                      )}
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white/[0.02] rounded-lg p-1.5">
                          <div className="text-white text-[11px] font-semibold">{fmt(N(era.total_streams))}</div>
                          <div className="text-gray-600 text-[8px]">Streams</div>
                        </div>
                        <div className="bg-white/[0.02] rounded-lg p-1.5">
                          <div className="text-white text-[11px] font-semibold">${fmt(N(era.total_revenue))}</div>
                          <div className="text-gray-600 text-[8px]">Revenue</div>
                        </div>
                        <div className="bg-white/[0.02] rounded-lg p-1.5">
                          <div className="text-white text-[11px] font-semibold">+{fmt(N(era.total_followers_gained))}</div>
                          <div className="text-gray-600 text-[8px]">Fans</div>
                        </div>
                      </div>
                      {/* Legacy unlocks */}
                      {era.legacy_bonuses?.unlocked?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {era.legacy_bonuses.unlocked.map((b, i) => (
                            <div key={i} className="text-[10px] text-amber-400/80 flex items-center gap-1">
                              <Crown className="w-3 h-3" /> {b.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassCard>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ─── END ERA MODAL ─── */}
      {eraEndModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-[#1a1a1f] border border-white/[0.08] rounded-3xl p-6 max-w-sm w-full">
            <h3 className="text-white text-lg font-bold mb-2">End Era?</h3>
            <p className="text-gray-400 text-sm mb-3">
              This will archive <strong className="text-white">"{currentEra?.era_name}"</strong> and calculate legacy bonuses.
            </p>
            {currentEra && (
              <div className="bg-white/[0.03] rounded-xl p-3 mb-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Memory Score</span>
                  <span className="text-white font-semibold">{N(currentEra.fandom_memory_score)}/100</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Predicted Status</span>
                  <EraStatusBadge status={currentEra.is_flop ? 'flop' : currentEra.is_one_hit ? 'one_hit_wonder' : N(currentEra.fandom_memory_score) >= 70 ? 'iconic' : 'completed'} />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setEraEndModal(false)} className="flex-1 bg-white/[0.06] rounded-xl py-2.5 text-sm text-white font-medium">Cancel</button>
              <button onClick={handleEndEra} disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500 rounded-xl py-2.5 text-sm text-white font-medium disabled:opacity-50 transition-colors">
                {loading ? "Ending..." : "End Era"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
