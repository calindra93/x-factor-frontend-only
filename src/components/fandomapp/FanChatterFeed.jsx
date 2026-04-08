import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Music, Megaphone, Shield, Flame, TrendingUp, TrendingDown, Heart, AlertTriangle, Zap, Star } from "lucide-react";

const CHATTER_ICONS = {
  boost: TrendingUp,
  defend: Shield,
  criticize: TrendingDown,
  hype: Flame,
  love: Heart,
  warning: AlertTriangle,
  promo: Megaphone,
  release: Music,
  energy: Zap,
  stan: Star,
};

const CHATTER_COLORS = {
  positive: "#34d399",
  neutral: "#a78bfa",
  negative: "#f87171",
  warning: "#fbbf24",
  hype: "#f472b6",
};

function generateChatter({ segments, wars, controversies, fandom, profile: _profile }) {
  const items = [];
  const segMap = Object.fromEntries((segments || []).map(s => [s.segment_type, s]));
  // Segment-based chatter
  const stanSeg = segMap.stan;
  const ogSeg = segMap.og;
  const coreSeg = segMap.core;
  const casualSeg = segMap.casual;
  const criticSeg = segMap.critic;
  const trendSeg = segMap.trend_chaser;

  if (stanSeg && (Number(stanSeg.count) || 0) > 0) {
    const output = stanSeg.labor_output || {};
    const totalOutput = Object.values(output).reduce((s, v) => s + (v || 0), 0);
    if (totalOutput > 0) {
      items.push({
        icon: "stan", tone: "hype",
        text: `Stans are going hard — ${Math.floor(totalOutput)} total labor output this turn`,
        priority: 3,
      });
    }
    if ((stanSeg.fatigue?.streaming || 0) >= 70) {
      items.push({
        icon: "warning", tone: "warning",
        text: "Stan streaming fatigue is high — they need a breather",
        priority: 5,
      });
    }
  }

  if (ogSeg && (Number(ogSeg.count) || 0) > 0) {
    const loyalty = Number(ogSeg.loyalty) || 0;
    if (loyalty >= 80) {
      items.push({ icon: "love", tone: "positive", text: `OGs are deeply loyal (${loyalty}%) — your foundation holds`, priority: 2 });
    } else if (loyalty < 40) {
      items.push({ icon: "warning", tone: "warning", text: `OG loyalty is slipping (${loyalty}%) — reconnect with your roots`, priority: 5 });
    }
  }

  if (coreSeg && (Number(coreSeg.count) || 0) > 100) {
    const morale = Number(coreSeg.morale) || 0;
    if (morale >= 70) {
      items.push({ icon: "boost", tone: "positive", text: "Core fans morale is high — they're boosting your streams", priority: 2 });
    }
  }

  if (casualSeg && (Number(casualSeg.count) || 0) > 0) {
    const count = Number(casualSeg.count) || 0;
    if (count > 500) {
      items.push({ icon: "hype", tone: "neutral", text: `${(count / 1000).toFixed(1)}K casuals in the mix — viral potential active`, priority: 1 });
    }
  }

  if (criticSeg && (Number(criticSeg.count) || 0) > 0) {
    const toxFatigue = criticSeg.fatigue?.toxicity || 0;
    if (toxFatigue >= 80) {
      items.push({ icon: "warning", tone: "negative", text: "Critics are resting — expect a toxicity spike when they recover", priority: 6 });
    } else if (toxFatigue < 30) {
      items.push({ icon: "criticize", tone: "negative", text: "Critics are active and generating toxicity against you", priority: 5 });
    }
  }

  if (trendSeg && (Number(trendSeg.count) || 0) > 0) {
    const count = Number(trendSeg.count) || 0;
    items.push({ icon: "energy", tone: "neutral", text: `${count} trend chasers riding the wave — keep the momentum`, priority: 1 });
  }

  // War-based chatter
  for (const war of (wars || []).slice(0, 2)) {
    if (war.intensity >= 70) {
      items.push({ icon: "hype", tone: "negative", text: `Fan war at critical intensity (${war.intensity}) — your fans are mobilizing`, priority: 7 });
    } else {
      items.push({ icon: "defend", tone: "warning", text: `Active fan war — defense labor deployed`, priority: 4 });
    }
  }

  // Controversy-based chatter
  for (const c of (controversies || []).slice(0, 2)) {
    if (c.phase === "peak") {
      items.push({ icon: "warning", tone: "negative", text: `"${(c.controversy_type || "").replace(/_/g, " ")}" at peak — maximum attention`, priority: 8 });
    } else if (c.phase === "spread") {
      items.push({ icon: "criticize", tone: "warning", text: `Controversy spreading — public attention at ${c.public_attention}`, priority: 6 });
    }
  }

  // Fandom health chatter
  const morale = Number(fandom?.fan_morale) || 50;
  const trust = Number(fandom?.brand_trust) || 50;
  const toxicity = Number(fandom?.toxicity_score) || 0;

  if (morale >= 80) {
    items.push({ icon: "love", tone: "positive", text: "Fan morale is excellent — your community is thriving", priority: 1 });
  } else if (morale < 30) {
    items.push({ icon: "warning", tone: "negative", text: "Fan morale is critically low — consider engagement rituals", priority: 7 });
  }

  if (trust >= 80) {
    items.push({ icon: "boost", tone: "positive", text: "Brand trust is rock solid — premium partnerships unlocked", priority: 1 });
  } else if (trust < 30) {
    items.push({ icon: "warning", tone: "negative", text: "Brand trust is damaged — sponsors are pulling back", priority: 7 });
  }

  if (toxicity >= 70) {
    items.push({ icon: "criticize", tone: "negative", text: `Toxicity at ${toxicity} — your community is getting hostile`, priority: 8 });
  }

  if (fandom?.identity_crisis_active) {
    items.push({ icon: "warning", tone: "negative", text: "IDENTITY CRISIS — all labor halved until alignment ≥ 50", priority: 9 });
  }

  // Sort by priority (higher = more urgent = shown first), take top 8
  return items.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

export default function FanChatterFeed({ segments, wars, controversies, fandom, profile }) {
  const chatter = useMemo(
    () => generateChatter({ segments, wars, controversies, fandom, profile }),
    [segments, wars, controversies, fandom, profile]
  );

  if (chatter.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Fan Chatter
        </span>
        <span className="text-[9px] text-white/20">{chatter.length} signals</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {chatter.map((item, i) => {
          const IconComponent = CHATTER_ICONS[item.icon] || Flame;
          const color = CHATTER_COLORS[item.tone] || CHATTER_COLORS.neutral;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="flex items-start gap-2.5 px-3 py-2 rounded-xl transition-colors"
              style={{
                background: `${color}06`,
                border: `1px solid ${color}12`,
              }}
            >
              <IconComponent size={12} color={color} className="flex-shrink-0 mt-0.5" />
              <span className="text-[11px] leading-relaxed text-white/50">{item.text}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
