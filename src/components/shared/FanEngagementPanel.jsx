import React, { useState, useMemo } from "react";
import { Heart, MessageCircle, Bookmark, ListMusic, Share2, ThumbsUp, TrendingUp, Star } from "lucide-react";

const COMMENT_TEMPLATES = [
  { text: "This track is on repeat 🔥", sentiment: "positive", archetype: "casual" },
  { text: "Production is insane on this one", sentiment: "positive", archetype: "audiophile" },
  { text: "Added to my workout playlist", sentiment: "positive", archetype: "casual" },
  { text: "Giving me main character energy", sentiment: "positive", archetype: "stan" },
  { text: "Album of the year contender", sentiment: "positive", archetype: "critic" },
  { text: "This grew on me so much", sentiment: "positive", archetype: "casual" },
  { text: "The bridge on this is everything", sentiment: "positive", archetype: "audiophile" },
  { text: "I can't stop sharing this with friends", sentiment: "positive", archetype: "evangelist" },
  { text: "Not my usual genre but I love it", sentiment: "positive", archetype: "explorer" },
  { text: "Been waiting for this sound 🎧", sentiment: "positive", archetype: "stan" },
  { text: "Solid but the mixing could be better", sentiment: "mixed", archetype: "audiophile" },
  { text: "Good vibes, not groundbreaking though", sentiment: "mixed", archetype: "critic" },
  { text: "Expected more from this era tbh", sentiment: "mixed", archetype: "stan" },
  { text: "The singles were better honestly", sentiment: "negative", archetype: "critic" },
  { text: "Skip. Not feeling this one.", sentiment: "negative", archetype: "casual" },
];

const FAN_USERNAMES = [
  "melodylover99", "basshead_", "nightowlbeats", "vibecheck2026",
  "synthwave_kid", "indieheadz", "beatcollector", "lofilounge",
  "treblequeen", "rhythmrider", "audiophile_sam", "musicnerdjay",
  "soundscapefan", "eclecticears", "playlistking"
];

function generateEngagementMetrics(release, hype = 50, followers = 1000) {
  const seed = (release?.id || "x").charCodeAt(0) + (release?.lifetime_streams || 0);
  const pseudoRandom = (offset) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const streams = release?.lifetime_streams || 0;
  const baseEngagement = Math.max(1, Math.floor(streams * 0.03));

  return {
    saves: Math.floor(baseEngagement * (0.4 + pseudoRandom(1) * 0.3)),
    playlistAdds: Math.floor(baseEngagement * (0.15 + pseudoRandom(2) * 0.15)),
    shares: Math.floor(baseEngagement * (0.08 + pseudoRandom(3) * 0.1)),
    likes: Math.floor(baseEngagement * (0.6 + pseudoRandom(4) * 0.4)),
    comments: Math.floor(baseEngagement * (0.04 + pseudoRandom(5) * 0.06)),
    saveRate: Math.min(35, Math.max(2, Math.floor(5 + hype * 0.2 + pseudoRandom(6) * 10))),
    skipRate: Math.max(5, Math.min(60, Math.floor(40 - hype * 0.25 + pseudoRandom(7) * 15))),
    completionRate: Math.min(95, Math.max(30, Math.floor(50 + hype * 0.3 + pseudoRandom(8) * 15))),
    repeatRate: Math.min(40, Math.max(3, Math.floor(8 + hype * 0.15 + pseudoRandom(9) * 10)))
  };
}

function generateComments(release, count = 5) {
  const seed = (release?.id || "x").charCodeAt(0);
  const shuffled = [...COMMENT_TEMPLATES].sort((a, b) => {
    const sa = Math.sin(seed + a.text.length) * 10000;
    const sb = Math.sin(seed + b.text.length) * 10000;
    return (sa - Math.floor(sa)) - (sb - Math.floor(sb));
  });

  return shuffled.slice(0, count).map((comment, i) => ({
    ...comment,
    username: FAN_USERNAMES[(seed + i) % FAN_USERNAMES.length],
    likes: Math.floor(Math.abs(Math.sin(seed + i * 7) * 150)),
    timeAgo: `${Math.floor(1 + Math.abs(Math.sin(seed + i * 3)) * 12)}h ago`
  }));
}

const SENTIMENT_COLORS = {
  positive: "text-green-400",
  mixed: "text-amber-400",
  negative: "text-red-400"
};

const ARCHETYPE_BADGES = {
  casual: { label: "Casual", color: "bg-blue-500/20 text-blue-300" },
  audiophile: { label: "Audiophile", color: "bg-purple-500/20 text-purple-300" },
  stan: { label: "Stan", color: "bg-pink-500/20 text-pink-300" },
  critic: { label: "Critic", color: "bg-amber-500/20 text-amber-300" },
  evangelist: { label: "Evangelist", color: "bg-green-500/20 text-green-300" },
  explorer: { label: "Explorer", color: "bg-cyan-500/20 text-cyan-300" }
};

export default function FanEngagementPanel({ release, hype = 50, followers = 1000, platformTheme = "blue" }) {
  const [activeView, setActiveView] = useState("metrics");

  const metrics = useMemo(
    () => generateEngagementMetrics(release, hype, followers),
    [release?.id, release?.lifetime_streams, hype, followers]
  );

  const comments = useMemo(
    () => generateComments(release, 6),
    [release?.id]
  );

  const themeColors = {
    blue: { accent: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", btn: "bg-blue-600" },
    rose: { accent: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", btn: "bg-rose-600" },
    emerald: { accent: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", btn: "bg-emerald-600" }
  };
  const theme = themeColors[platformTheme] || themeColors.blue;

  if (!release) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
        {[
          { key: "metrics", label: "Engagement" },
          { key: "comments", label: "Comments" },
          { key: "behavior", label: "Listener Stats" },
          { key: "boost", label: "Platform Boost" }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`flex-1 text-[10px] py-1.5 rounded-md transition-colors ${
              activeView === tab.key ? `${theme.bg} text-white font-semibold` : "text-gray-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === "metrics" && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Heart, label: "Likes", value: metrics.likes, color: "text-pink-400" },
              { icon: Bookmark, label: "Saves", value: metrics.saves, color: "text-amber-400" },
              { icon: ListMusic, label: "Playlist+", value: metrics.playlistAdds, color: "text-green-400" },
              { icon: Share2, label: "Shares", value: metrics.shares, color: "text-blue-400" }
            ].map(stat => (
              <div key={stat.label} className="bg-white/[0.03] rounded-xl p-2 text-center border border-white/[0.06]">
                <stat.icon className={`w-3.5 h-3.5 ${stat.color} mx-auto mb-0.5`} />
                <p className="text-white text-xs font-bold">{stat.value >= 1000 ? `${(stat.value/1000).toFixed(1)}K` : stat.value}</p>
                <p className="text-gray-500 text-[8px]">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className={`${theme.bg} rounded-xl p-3 border ${theme.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className={`w-3.5 h-3.5 ${theme.accent}`} />
              <span className="text-white text-xs font-semibold">Engagement Summary</span>
            </div>
            <p className="text-gray-400 text-[10px]">
              {metrics.saveRate > 15
                ? `Strong save rate (${metrics.saveRate}%) — fans are keeping this in rotation.`
                : metrics.saveRate > 8
                  ? `Decent save rate (${metrics.saveRate}%) — building a solid listener base.`
                  : `Low save rate (${metrics.saveRate}%) — track may need more promotion.`}
              {" "}
              {metrics.playlistAdds > 50
                ? `Getting added to ${metrics.playlistAdds} playlists is great exposure.`
                : `${metrics.playlistAdds} playlist adds so far.`}
            </p>
          </div>
        </div>
      )}

      {activeView === "comments" && (
        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-4">No comments yet</p>
          ) : (
            comments.map((comment, i) => (
              <div key={i} className="bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[8px] text-white/60 font-bold">
                    {comment.username[0].toUpperCase()}
                  </div>
                  <span className="text-white text-[10px] font-medium">{comment.username}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${ARCHETYPE_BADGES[comment.archetype]?.color || "bg-white/10 text-gray-400"}`}>
                    {ARCHETYPE_BADGES[comment.archetype]?.label || comment.archetype}
                  </span>
                  <span className="text-gray-600 text-[8px] ml-auto">{comment.timeAgo}</span>
                </div>
                <p className={`text-xs ${SENTIMENT_COLORS[comment.sentiment] || "text-gray-300"}`}>{comment.text}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button className="flex items-center gap-0.5 text-gray-500 text-[9px] hover:text-white transition-colors">
                    <ThumbsUp className="w-2.5 h-2.5" /> {comment.likes}
                  </button>
                  <button className="text-gray-500 text-[9px] hover:text-white transition-colors">Reply</button>
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 mt-1">
            <MessageCircle className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-gray-500 text-[10px]">{metrics.comments} total comments</span>
          </div>
        </div>
      )}

      {activeView === "behavior" && (
        <div className="space-y-2">
          {[
            { label: "Save Rate", value: metrics.saveRate, max: 35, color: "bg-amber-500", desc: "% of listeners who saved this track" },
            { label: "Completion Rate", value: metrics.completionRate, max: 100, color: "bg-green-500", desc: "% of listeners who finish the track" },
            { label: "Skip Rate", value: metrics.skipRate, max: 60, color: "bg-red-500", desc: "% of listeners who skip within 30s" },
            { label: "Repeat Rate", value: metrics.repeatRate, max: 40, color: "bg-blue-500", desc: "% of listeners who replay immediately" }
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-[10px] font-medium">{stat.label}</span>
                <span className="text-white text-xs font-bold">{stat.value}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className={`h-full ${stat.color} rounded-full transition-all`} style={{ width: `${(stat.value / stat.max) * 100}%` }} />
              </div>
              <p className="text-gray-600 text-[8px] mt-0.5">{stat.desc}</p>
            </div>
          ))}

          <div className={`${theme.bg} rounded-xl p-3 border ${theme.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <Star className={`w-3.5 h-3.5 ${theme.accent}`} />
              <span className="text-white text-xs font-semibold">Listener Insights</span>
            </div>
            <p className="text-gray-400 text-[10px]">
              {metrics.completionRate > 75
                ? "Most listeners are finishing this track — strong hook retention."
                : metrics.completionRate > 55
                  ? "Decent completion. Consider stronger intros to reduce early skips."
                  : "Many listeners are dropping off. The first 30 seconds need work."}
              {" "}
              {metrics.repeatRate > 15
                ? `${metrics.repeatRate}% repeat rate shows strong replay value.`
                : "Replay rate is low — this may be a one-listen track for most."}
            </p>
          </div>
        </div>
      )}

      {activeView === "boost" && (() => {
        const genre = release?.genre || "";
        const platforms = [
          { name: "Streamify", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20",
            discovery: 12, algoWeight: 75, editWeight: 25, genreBias: { "Hip-Hop": 1.2, "Rap": 1.15, "Pop": 1.1, "Trap": 1.05 }, payout: 0.018 },
          { name: "AppleCore", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20",
            discovery: 8, algoWeight: 45, editWeight: 55, genreBias: { "Pop": 1.25, "R&B": 1.15, "Indie": 1.1, "Alternative": 1.05 }, payout: 0.022 },
          { name: "SoundBurst", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
            discovery: 15, algoWeight: 65, editWeight: 35, genreBias: { "Indie": 1.3, "UK Drill": 1.25, "Electronic": 1.2, "Alternative": 1.15 }, payout: 0.016 },
        ];
        return (
          <div className="space-y-2">
            {platforms.map(p => {
              const bias = p.genreBias[genre] || 1.0;
              const hasBoost = bias > 1.0;
              return (
                <div key={p.name} className={`${p.bg} rounded-xl p-3 border ${p.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${p.color}`}>{p.name}</span>
                    {hasBoost && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-semibold">GENRE BOOST +{Math.round((bias - 1) * 100)}%</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[9px]">
                    <div>
                      <p className="text-gray-500">Discovery</p>
                      <p className="text-white font-semibold">{p.discovery}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Algo Playlist</p>
                      <p className="text-white font-semibold">{p.algoWeight}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Editorial</p>
                      <p className="text-white font-semibold">{p.editWeight}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[9px]">
                    <span className="text-gray-500">Payout/stream</span>
                    <span className="text-green-400 font-semibold">${p.payout.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
            <p className="text-gray-600 text-[8px] text-center">Algorithm weights affect playlist placement and discovery reach</p>
          </div>
        );
      })()}
    </div>
  );
}
