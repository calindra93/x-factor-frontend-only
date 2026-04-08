import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import React from "react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import BrandDealContractCard from "@/components/social/BrandDealContractCard";
import { isActiveContractStatus, isCompletedContractStatus, isHistoricalContractStatus, normalizeBrandDealStatus } from "@/components/social/brandDealStatus";

// ─────────────────────────────────────────────
// CONSTANTS & STATIC DATA
// ─────────────────────────────────────────────

const TIER_COLORS = { Platinum: "#e2e8f0", Gold: "#fbbf24", Silver: "#94a3b8", Bronze: "#cd7f32", platinum: "#e2e8f0", gold: "#fbbf24", silver: "#94a3b8", bronze: "#cd7f32" };
const TIER_GLOW   = { Platinum: "rgba(226,232,240,0.12)", Gold: "rgba(251,191,36,0.12)", Silver: "rgba(148,163,184,0.1)", Bronze: "rgba(205,127,50,0.1)", platinum: "rgba(226,232,240,0.12)", gold: "rgba(251,191,36,0.12)", silver: "rgba(148,163,184,0.1)", bronze: "rgba(205,127,50,0.1)" };

function getCloutTier(clout) {
  if (clout >= 10000) return { label: "Icon",         color: "#fbbf24" };
  if (clout >= 5000) return { label: "Chart Threat", color: "#c084fc" };
  if (clout >= 3000)  return { label: "Hot Artist",   color: "#f97316" };
  if (clout >= 1000)  return { label: "Rising Star",  color: "#22c55e" };
  if (clout >= 500)  return { label: "Local Buzz",   color: "#60a5fa" };
  if (clout >= 100)   return { label: "Emerging",     color: "#6b7280" };
  return                     { label: "Unknown",      color: "#4b5563" };
}

function formatLikes(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString();
}

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// Shared avatar / grid images reused across PROFILE and OTHER_PLAYERS
const GRID_NOVA = [
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=200&q=60",
  "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=60",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=60",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=200&q=60",
  "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=200&q=60",
  "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=200&q=60",
];

const PROFILE = {
  username: "nova.beats",
  verified: true,
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80",
  posts: 142, followers: "84.2K", following: 312,
  bio: "Producer / Artist / Dreamer\nSigned to Vibe Records\nNew album 'Midnight Echoes' out now",
  gridImages: [
    ...GRID_NOVA,
    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=200&q=60",
    "https://images.unsplash.com/photo-1446057032654-9d8885db76c6?auto=format&fit=crop&w=200&q=60",
    "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=200&q=60",
  ],
};

const _OTHER_PLAYERS = {
  "nova.beats": {
    username: "nova.beats", verified: true,
    avatar: PROFILE.avatar,
    posts: 142, followers: "84.2K", following: 312,
    bio: PROFILE.bio,
    genre: "Electronic / R&B", clout: 8200,
    gridImages: GRID_NOVA,
  },
  "luna.wav": {
    username: "luna.wav", verified: true,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    posts: 98, followers: "61.4K", following: 204,
    bio: "Singer / Songwriter / Dreamer\nNew album almost done 🌙\nLA → NYC",
    genre: "Pop / Soul", clout: 6100,
    gridImages: [
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=200&q=60",
    ],
  },
  "dj.phantom": {
    username: "dj.phantom", verified: false,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    posts: 217, followers: "112.8K", following: 89,
    bio: "DJ / Producer\nResidency @ Club Neon\nBookings: phantom@vibemail.com",
    genre: "House / Techno", clout: 11200,
    gridImages: [
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=200&q=60",
      "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=200&q=60",
    ],
  },
};

const FEED_POSTS = [
  {
    id: 1, username: "nova.beats", verified: true,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80",
    image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=600&q=80",
    musicTag: "Midnight Echoes - Nova Beats", likes: 12847, comments: 284, timestamp: "2h",
    caption: "New single dropping this Friday. The studio sessions were insane for this one.",
  },
  {
    id: 2, username: "luna.wav", verified: true,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=600&q=80",
    musicTag: "Dreamstate - Luna", likes: 8432, comments: 156, timestamp: "4h",
    caption: "Late nights in the studio always hit different. New album almost done.",
  },
  {
    id: 3, username: "dj.phantom", verified: false,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80",
    musicTag: "Neon Pulse - DJ Phantom", likes: 23190, comments: 892, timestamp: "8h",
    caption: "Last night was absolutely electric. 20k people singing every word back. This is why we do it.",
  },
];

const COLLAB_POST = {
  id: 99, username: "nova.beats", collabUsername: "luna.wav",
  verified: true, collabVerified: true,
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80",
  collabAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80",
  musicTag: "Neon Dreams (feat. Luna) - Nova Beats", likes: 31480, comments: 1203, timestamp: "1h",
  caption: "When two worlds collide ✨ So proud of what we made together. Out now on all platforms.",
};

const _BROADCASTS = [
  { id: 1, message: "🎵 New single 'Midnight Echoes' drops this Friday at midnight. Pre-save link in bio!", timestamp: "10m", reactions: { "🔥": 412, "❤️": 289, "🎵": 176, "👑": 94 } },
  { id: 2, message: "Just wrapped the most insane studio session with @luna.wav. You are NOT ready for what we cooked 🤫", timestamp: "2h", reactions: { "🔥": 881, "❤️": 534, "🎵": 210, "👑": 143 } },
  { id: 3, message: "Tour dates are HERE. 12 cities. Grab your tickets before they sell out 🎤", timestamp: "1d", reactions: { "🔥": 1204, "❤️": 876, "🎵": 445, "👑": 312 }, tourCard: true },
  { id: 4, message: "Thank you for 84K followers 🙏 Started this from nothing. Every single one of you made this possible.", timestamp: "3d", reactions: { "🔥": 2341, "❤️": 3102, "🎵": 892, "👑": 671 } },
];

const _TOUR_DATES = [
  { id: 1, city: "Los Angeles", venue: "Crypto.com Arena",     month: "MAR", day: "14", soldOut: false },
  { id: 2, city: "New York",    venue: "Madison Square Garden", month: "MAR", day: "19", soldOut: false },
  { id: 3, city: "Chicago",     venue: "United Center",         month: "MAR", day: "25", soldOut: true  },
  { id: 4, city: "Miami",       venue: "Kaseya Center",         month: "APR", day: "02", soldOut: false },
  { id: 5, city: "Atlanta",     venue: "State Farm Arena",      month: "APR", day: "08", soldOut: false },
  { id: 6, city: "London",      venue: "The O2 Arena",          month: "APR", day: "22", soldOut: false },
];

const _DEAL_DATA = [
  { id: 1, brand: "Beats by Dre",      basePayout: 2500, emoji: "🎧", exclusive: false, daysLeft: 5, tier: "Gold",     description: "Feature our Pro headphones in a studio session post.",       requirements: ["Post studio photo with headphones visible", "Tag @beatsbydre", "Use #StudioLife hashtag", "Min. 500 words in caption"] },
  { id: 2, brand: "Spotify",           basePayout: 1800, emoji: "🎵", exclusive: true,  daysLeft: 2, tier: "Silver",   description: "Share your top playlist picks and tag our brand.",           requirements: ["Share playlist screenshot", "Tag @spotify", "Post to stories as well"] },
  { id: 3, brand: "Roland Instruments",basePayout: 3200, emoji: "🎹", exclusive: false, daysLeft: 8, tier: "Platinum", description: "Feature our new synthesizer in a production video.",          requirements: ["Show synth in action", "Mention model name in caption", "Tag @rolandglobal", "Min. 60-second video"] },
  { id: 4, brand: "SoundCloud",        basePayout: 1200, emoji: "☁️", exclusive: true,  daysLeft: 1, tier: "Silver",   description: "Post about your creative journey and SoundCloud.",           requirements: ["Share your origin story", "Tag @soundcloud", "Link your SoundCloud profile"] },
];

const _ANALYTICS_STATS = [
  { label: "Reach",      value: "124.8K", change: "+12.4%", icon: "👁️" },
  { label: "Engagement", value: "8.7%",   change: "+2.1%",  icon: "📈" },
  { label: "Revenue",    value: "$4,280", change: "+18.6%", icon: "💰" },
  { label: "Followers",  value: "+2,847", change: "+5.3%",  icon: "👥" },
];

const _WEEKLY = [
  { day: "Mon", value: 4200 }, { day: "Tue", value: 5800 }, { day: "Wed", value: 3900 },
  { day: "Thu", value: 7200 }, { day: "Fri", value: 8100 }, { day: "Sat", value: 9400 },
  { day: "Sun", value: 6800 },
];

const AVATAR_OPTIONS = [
  // Stock images removed — upload your own photo
  // placeholder entry kept so code referencing AVATAR_OPTIONS[0] returns undefined gracefully
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
];

const NAV = [
  { id: "home",         emoji: "🏠", label: "Home"      },
  { id: "broadcast",    emoji: "📣", label: "Channel"   },
  { id: "brand_deals",  emoji: "🤝", label: "Deals"     },
  { id: "analytics",    emoji: "📊", label: "Analytics" },
  { id: "profile",      emoji: "👤", label: "Profile"   },
];

const _ALL_FEED_POSTS = [FEED_POSTS[0], COLLAB_POST, FEED_POSTS[1], FEED_POSTS[2]];

// ─── Map a DB brand_deal row → shape expected by Sponsorships UI ──────────
const TIER_EMOJI_MAP = { platinum: "💎", gold: "🏆", silver: "⭐", bronze: "🥉" };

function buildRequirements(d) {
  const brandName = d.brand_name || "Brand";
  const handle = "@" + brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hashtag = "#" + brandName.replace(/[^a-zA-Z0-9]/g, "") + "Partner";
  const deliverables = d.deliverables || {};
  const posts = Number(deliverables.posts) || 1;
  const stories = Number(deliverables.stories) || 0;
  const reqs = [];
  reqs.push(posts === 1 ? `Post a photo or reel featuring ${brandName}` : `Post ${posts} photos or reels featuring ${brandName}`);
  if (stories > 0) reqs.push(`Share ${stories} InstaVibe stor${stories > 1 ? "ies" : "y"}`);
  reqs.push(`Tag ${handle} in your post`);
  reqs.push(`Include ${hashtag} in your caption`);
  if ((d.controversy_risk === "high") || Number(d.risk_score) >= 7) reqs.push("Add #Ad disclosure to caption");
  return reqs;
}

const TIER_EMOJI_NEW = { local: "🏪", regional: "🏙️", national: "🏛️", global: "🌍", luxury: "💎" };
const _TIER_COLORS_NEW = { local: "#6b7280", regional: "#3b82f6", national: "#a855f7", global: "#f59e0b", luxury: "#ec4899" };
const _RISK_LABELS = { low: { label: "Low Risk", color: "#22c55e" }, medium: { label: "Med Risk", color: "#f59e0b" }, high: { label: "High Risk", color: "#ef4444" } };

function normalizeBrandKey(brandName) {
  return String(brandName || '').trim().toLowerCase();
}

function getBrandLoyaltyTier(score) {
  if (score <= -4) return 'cold';
  if (score <= 2) return 'neutral';
  if (score <= 5) return 'warm';
  if (score <= 8) return 'favored';
  return 'elite';
}

function getNormalizedPlatformScope(record) {
  const metadataScope = Array.isArray(record?.metadata?.platform_scope) ? record.metadata.platform_scope : [];
  const recordScope = Array.isArray(record?.platform_scope) ? record.platform_scope : [];
  const combinedScope = recordScope.length > 0 ? recordScope : metadataScope;
  return combinedScope.map(scope => String(scope || '').toLowerCase());
}

function recordSupportsPlatform(record, platform) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const primaryPlatform = String(record?.primary_platform || record?.metadata?.primary_platform || record?.platform || '').toLowerCase();
  const platformScope = getNormalizedPlatformScope(record);
  return primaryPlatform === normalizedPlatform || platformScope.includes(normalizedPlatform) || platformScope.includes('cross_platform');
}

function mapDbDealToUi(d) {
  const meta = d.metadata || {};
  // Support both old tier names (bronze/silver/gold/platinum) and new (local/regional/national/global/luxury)
  const rawTier = (d.tier || d.brand_tier || meta.tier || "local").toLowerCase();
  const tierLabel = rawTier.charAt(0).toUpperCase() + rawTier.slice(1);
  const perTurnFee = Number(d.per_turn_fee) || 0;
  const signingBonus = Number(d.signing_bonus) || 0;
  const performanceBonus = Number(d.performance_bonus) || 0;
  const durationTurns = Number(d.duration_turns) || 1;
  // basePayout = per_turn_fee × duration + signing_bonus (total contract value shown in negotiate UI)
  const basePayout = perTurnFee > 0
    ? perTurnFee * durationTurns + signingBonus
    : (Number(d.payout) || 0);
  const riskModel = d.risk_model || {};
  const controversyRisk = d.controversy_risk || "low";
  const exclusivityCat = d.exclusivity_category || null;
  const regions = d.regions_targeted || [];
  const kpis = d.kpis || {};
  return {
    _dbId: d.id,
    id: d.id,
    _raw: d,
    metadata: meta,
    brand: d.brand_name,
    basePayout,
    payout: basePayout,
    perTurnFee,
    signingBonus,
    performanceBonus,
    durationTurns,
    emoji: TIER_EMOJI_NEW[rawTier] || TIER_EMOJI_MAP[rawTier] || "✨",
    exclusive: !!exclusivityCat,
    exclusivityCategory: exclusivityCat,
    daysLeft: d.expires_turn ? Math.max(0, d.expires_turn - (meta.offer_turn || d.created_turn || 0)) : 5,
    tier: tierLabel,
    tierRaw: rawTier,
    category: d.category || (d.category_name ? String(d.category_name).replace(/_/g, " ") : null),
    description: d.requirements?.description || `Feature ${d.brand_name} in your content for ${durationTurns} turns.`,
    requirements: buildRequirements({ ...d, risk_score: Number(d.brand_risk_score ?? d.risk_score ?? 0) }),
    type: d.deal_type || "sponsored_post",
    status: d.status,
    controversyRisk,
    riskModel,
    regions,
    kpis,
    loyaltyTier: d.loyalty_tier || 'neutral',
    sceneFitReason: meta.scene_fit_reason || null,
    sceneBonusPct: Number(meta.scene_brand_bonus_pct || 0),
    sceneTargetRegions: Array.isArray(meta.scene_target_regions) ? meta.scene_target_regions : [],
  };
}

function mapDbContractToUi(c) {
  const rawTier = (c.tier || 'local').toLowerCase();
  const perTurnFee = Number(c.per_turn_fee) || 0;
  const signingBonus = Number(c.signing_bonus) || 0;
  const durationTurns = Number(c.duration_turns) || 1;
  const basePayout = perTurnFee > 0
    ? perTurnFee * durationTurns + signingBonus
    : (Number(c.total_paid_to_date) || 0);
  return {
    _dbId: c.id,
    id: c.id,
    _raw: c,
    brand: c.brand_name,
    payout: basePayout,
    basePayout,
    perTurnFee,
    signingBonus,
    performanceBonus: Number(c.performance_bonus) || 0,
    durationTurns,
    tier: rawTier.charAt(0).toUpperCase() + rawTier.slice(1),
    tierRaw: rawTier,
    emoji: TIER_EMOJI_NEW[rawTier] || TIER_EMOJI_MAP[rawTier] || '✨',
    description: `Active ${(c.deal_type || 'sponsored_post').replace(/_/g, ' ')} · ${durationTurns} turns`,
    loyaltyTier: c.loyalty_tier || 'neutral',
    status: c.status,
    postsNeeded: Math.max(0, Number(c.deliverable_count_required || 0) - Number(c.deliverable_count_completed || 0)),
    deliverablesRemaining: Math.max(0, Number(c.deliverable_count_required || 0) - Number(c.deliverable_count_completed || 0)),
  };
}

// ─────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#c084fc" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCol({ value, label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: color ? 12 : 16, fontWeight: 700, color: color || "#f0f0f5" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FEED
// ─────────────────────────────────────────────

function CommentDrawer({ post, artistId, onClose }) {
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [body, setBody]           = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load comments directly from DB (no edge function)
  const loadComments = useCallback(async () => {
    if (!post?.id) return;
    try {
      const { data: rows } = await supabaseClient
        .from('instavibe_post_comments')
        .select('id, post_id, author_id, body, created_at')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })
        .limit(100);
      const comments = rows || [];
      // Batch-load author profiles
      const authorIds = [...new Set(comments.map(c => c.author_id).filter(Boolean))];
      const { data: profiles } = authorIds.length > 0
        ? await supabaseClient.from('profiles').select('id, artist_name, instavibe_handle, instavibe_avatar, artist_image').in('id', authorIds)
        : { data: [] };
      const pMap = new Map((profiles || []).map(p => [p.id, p]));
      setComments(comments.map(c => ({
        ...c,
        author_name: pMap.get(c.author_id)?.instavibe_handle || pMap.get(c.author_id)?.artist_name || 'Artist',
        author_avatar: pMap.get(c.author_id)?.instavibe_avatar || pMap.get(c.author_id)?.artist_image || null,
      })));
    } catch {}
    finally { setLoading(false); }
  }, [post?.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const submit = async () => {
    if (!body.trim() || !artistId || submitting) return;
    setSubmitting(true);
    try {
      const r = await base44.functions.invoke("socialMedia", { action: "addInstaVibeComment", artistId, postId: post.id, commentBody: body.trim() });
      if (r?.success) {
        setBody("");
        await loadComments();
      }
    } catch {}
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div style={{ marginTop: "auto", background: "#111118", borderRadius: "24px 24px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}><div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>Comments</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div className="modal-scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
          {loading ? <div style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>Loading…</div>
            : comments.length === 0 ? <div style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>No comments yet. Be the first!</div>
            : comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <img src={c.author_avatar || AVATAR_OPTIONS[0]} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f0f0f5" }}>{c.author_name || "Artist"} </span>
                  <span style={{ fontSize: 12, color: "#d1d5db" }}>{c.body}</span>
                  <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                </div>
              </div>
            ))}
        </div>
        <div style={{ padding: "10px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
          <input value={body} onChange={e => setBody(e.target.value.slice(0, 500))} onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Add a comment…" style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "9px 14px", color: "#f0f0f5", fontSize: 13, outline: "none" }} />
          <button onClick={submit} disabled={!body.trim() || submitting}
            style={{ background: body.trim() ? "linear-gradient(to right,#a855f7,#ec4899)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 20, padding: "9px 16px", color: "white", fontWeight: 700, fontSize: 12, cursor: body.trim() ? "pointer" : "default" }}>
            {submitting ? "…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders caption text with highlighted #hashtags and @mentions
function renderCaption(text) {
  if (!text) return null;
  const parts = text.split(/([@#][\w.]+)/g);
  return parts.map((part, i) =>
    /^[@#]/.test(part)
      ? <span key={i} style={{ color: "#a78bfa", fontWeight: 500 }}>{part}</span>
      : part
  );
}

function PostCard({ post, onViewProfile, artistId, onLikeChange }) {
  const [liked,    setLiked]    = useState(!!post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count || post.likes || 0);
  const [commentCount, setCommentCount] = useState(post.comment_count || post.comments || 0);
  const [showComments, setShowComments] = useState(false);
  const [liking, setLiking]     = useState(false);
  const isCollab = !!post.collabUsername;

  // Sync from realtime updates
  useEffect(() => {
    setLiked(!!post.liked_by_me);
    setLikeCount(post.like_count || post.likes || 0);
    setCommentCount(post.comment_count || post.comments || 0);
  }, [post.like_count, post.liked_by_me, post.comment_count]);

  const handleLike = async () => {
    if (liking || !artistId) return;
    setLiking(true);
    const wasLiked = liked;
    const newLiked = !wasLiked;
    const newCount = wasLiked ? Math.max(0, likeCount - 1) : likeCount + 1;
    setLiked(newLiked);
    setLikeCount(newCount);
    try {
      const action = newLiked ? "likeInstaVibePost" : "unlikeInstaVibePost";
      const r = await base44.functions.invoke("socialMedia", { action, artistId, postId: post.id });
      if (r?.like_count !== undefined) setLikeCount(r.like_count);
      onLikeChange?.(post.id, r?.like_count ?? newCount, newLiked);
    } catch {
      setLiked(wasLiked);
      setLikeCount(wasLiked ? likeCount : Math.max(0, likeCount - 1));
    } finally { setLiking(false); }
  };

  const authorName = post.author?.instavibe_handle || post.author?.artist_name || post.username || "Artist";
  const authorAvatar = post.author?.instavibe_avatar || post.author?.artist_image || post.avatar || AVATAR_OPTIONS[0];
  const authorId = post.author?.id || post.artist_id;

  return (
    <article style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <button onClick={() => onViewProfile(authorId || post.username)} style={{ position: "relative", width: isCollab ? 62 : 44, height: 44, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", overflow: "visible" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f59e0b 100%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <img src={authorAvatar} alt={authorName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid #0a0a0f" }} />
          </div>
          {isCollab && <img src={post.collabAvatar} alt={post.collabUsername} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2.5px solid #0a0a0f", position: "absolute", left: 30, top: 12, zIndex: 3 }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => onViewProfile(authorId || post.username)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#f0f0f5" }}>{authorName}</button>
            {post.verified && <CheckIcon />}
            {isCollab && <>
              <span style={{ fontSize: 11, color: "#6b7280" }}>feat.</span>
              <button onClick={() => onViewProfile(post.collabUsername)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#c084fc" }}>{post.collabUsername}</button>
              {post.collabVerified && <CheckIcon />}
            </>}
            {(post.created_at || post.timestamp) && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>· {post.created_at ? formatRelativeTime(post.created_at) : post.timestamp}</span>
            )}
          </div>
          {isCollab && <div style={{ fontSize: 10, color: "#a855f7", marginTop: 1, fontWeight: 500 }}>✦ Collab Post</div>}
        </div>
        <span style={{ color: "#9ca3af", fontSize: 22, cursor: "pointer", flexShrink: 0, padding: "0 2px" }}>⋯</span>
      </div>

      {post.image ? (
        <div style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden", background: "#111118" }}>
          <img src={post.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {(post.musicTag || post.attached_release) && (
            <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 13 }}>🎵</span>
              </div>
              <span style={{ fontSize: 11, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.9 }}>
                {post.musicTag || (post.attached_release?.release_name || post.attached_release?.title)}
              </span>
            </div>
          )}
        </div>
      ) : (post.musicTag || post.attached_release) ? (
        <div style={{ margin: "0 14px 8px", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "6px 12px" }}>
          {post.attached_release?.cover_artwork_url
            ? <img src={post.attached_release.cover_artwork_url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
            : <span style={{ fontSize: 12 }}>🎵</span>
          }
          <span style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {post.musicTag || (post.attached_release?.release_name || post.attached_release?.title)}
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button onClick={handleLike} disabled={liking} style={{ background: "none", border: "none", cursor: artistId ? "pointer" : "default", padding: 0, opacity: liking ? 0.6 : 1, display: "flex", alignItems: "center" }}>
            {liked
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1.75"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f0f0f5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            }
          </button>
          <button onClick={() => setShowComments(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f0f0f5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f0f0f5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f0f0f5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      <div style={{ padding: "2px 14px 4px" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f5" }}>{formatLikes(likeCount)} likes</span>
      </div>
      <div style={{ padding: "4px 14px 4px" }}>
        <span style={{ fontSize: 13, color: "#f0f0f5", fontWeight: 600 }}>{authorName} </span>
        <span style={{ fontSize: 13, color: "#d1d5db" }}>{renderCaption(post.caption)}</span>
      </div>
      <div style={{ padding: "4px 14px 14px" }}>
        {commentCount > 0 && <button onClick={() => setShowComments(true)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#6b7280", cursor: "pointer", display: "block" }}>View all {commentCount} comment{commentCount !== 1 ? "s" : ""}</button>}
      </div>
      {showComments && <CommentDrawer post={post} artistId={artistId} onClose={() => setShowComments(false)} />}
    </article>
  );
}

function FanWarsCard() {
  const [expanded, setExpanded] = useState(false);
  const [votes, setVotes] = useState({ nova: 6241, luna: 4887 });
  const [voted, setVoted] = useState(null);
  const total = votes.nova + votes.luna;
  const novaP = Math.round((votes.nova / total) * 100);

  const vote = useCallback((side) => {
    if (voted) return;
    setVoted(side);
    setVotes(prev => ({ ...prev, [side]: prev[side] + 1 }));
  }, [voted]);

  return (
    <div style={{ margin: "10px 16px", display: "flex", flexDirection: "column" }}>
      <button onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: expanded ? "12px 12px 0 0" : 12, padding: "6px 14px", cursor: "pointer", width: "100%", justifyContent: "center" }}>
        <span style={{ fontSize: 12 }}>⚔️</span>
        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>Fan War trending</span>
        <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4 }}>· {(total / 1000).toFixed(1)}K votes</span>
        <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div style={{ width: "100%", borderRadius: "0 0 12px 12px", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", background: "rgba(255,255,255,0.03)", padding: "12px 14px 14px" }}>
          <div style={{ fontSize: 12, color: "#d1d5db", fontWeight: 500, textAlign: "center", marginBottom: 10 }}>
            nova.beats vs luna.wav
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 400, marginTop: 2 }}>Whose fanbase is more loyal?</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: voted ? 10 : 0 }}>
            {[["nova", "🎤 nova", "rgba(168,85,247,0.4)", "rgba(168,85,247,0.12)", "#c084fc"],
              ["luna", "🌙 luna", "rgba(236,72,153,0.4)", "rgba(236,72,153,0.12)", "#f472b6"]].map(([side, label, activeBorder, activeBg, activeColor]) => (
              <button key={side} onClick={() => vote(side)}
                style={{ flex: 1, borderRadius: 10, padding: "9px 0", border: `1px solid ${voted === side ? activeBorder : "rgba(255,255,255,0.07)"}`, background: voted === side ? activeBg : "rgba(255,255,255,0.03)", color: voted === side ? activeColor : "#9ca3af", fontWeight: 600, fontSize: 12, cursor: voted ? "default" : "pointer" }}>
                {label}
              </button>
            ))}
          </div>
          {voted && (
            <div>
              <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${novaP}%`, background: "#a855f7", transition: "width 0.5s" }} />
                <div style={{ width: `${100 - novaP}%`, background: "#ec4899", transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: "#a855f7" }}>{novaP}%</span>
                <span style={{ fontSize: 10, color: "#ec4899" }}>{100 - novaP}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Feed({ onViewProfile, posts, artistId, onPostsChange }) {
  const handleLikeChange = useCallback((postId, newCount, newLiked) => {
    onPostsChange?.(prev => prev.map(p =>
      p.id === postId ? { ...p, like_count: newCount, liked_by_me: newLiked } : p
    ));
  }, [onPostsChange]);

  return (
    <div>
      <FanWarsCard />
      {(!posts || posts.length === 0) ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📸</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No posts yet</div>
          <div style={{ fontSize: 12 }}>Be the first to post — tap ➕ above!</div>
        </div>
      ) : (
        posts.map(p => (
          <PostCard key={p.id} post={p} onViewProfile={onViewProfile} artistId={artistId} onLikeChange={handleLikeChange} />
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BROADCAST / CHANNEL
// ─────────────────────────────────────────────

const CHANNEL_EMOJIS = ["🔥", "❤️", "🎵", "👑", "✨", "💜", "🎤", "🌙"];

function Broadcast({ profile: profileData, artistId }) {
  const displayProfile = profileData || PROFILE;
  const [messages,    setMessages]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [newMsg,      setNewMsg]      = useState("");
  const [posting,     setPosting]     = useState(false);
  const [reacting,    setReacting]    = useState({});

  const channelArtistId = profileData?.id || artistId;

  const loadChannel = useCallback(async () => {
    if (!channelArtistId) { setLoading(false); return; }
    try {
      const r = await base44.functions.invoke("socialMedia", {
        action: "getInstaVibeChannel",
        artistId: channelArtistId,
        viewerId: artistId,
        limit: 20,
      });
      setMessages(r?.messages || []);
    } catch {}
    finally { setLoading(false); }
  }, [channelArtistId, artistId]);

  useEffect(() => { loadChannel(); }, [loadChannel]);

  const handleReact = useCallback(async (messageId, emoji) => {
    if (!artistId || reacting[messageId + emoji]) return;
    setReacting(prev => ({ ...prev, [messageId + emoji]: true }));
    try {
      const r = await base44.functions.invoke("socialMedia", {
        action: "reactInstaVibeChannel",
        artistId,
        messageId,
        emoji,
      });
      if (r?.success) {
        setMessages(prev => prev.map(m => {
          if (m.id !== messageId) return m;
          const newReactions = { ...m.reactions };
          const myRxns = [...(m.my_reactions || [])];
          if (r.reacted) {
            newReactions[emoji] = (newReactions[emoji] || 0) + 1;
            if (!myRxns.includes(emoji)) myRxns.push(emoji);
          } else {
            newReactions[emoji] = Math.max(0, (newReactions[emoji] || 1) - 1);
            const idx = myRxns.indexOf(emoji);
            if (idx >= 0) myRxns.splice(idx, 1);
          }
          return { ...m, reactions: newReactions, my_reactions: myRxns };
        }));
      }
    } catch {}
    finally { setReacting(prev => { const n = { ...prev }; delete n[messageId + emoji]; return n; }); }
  }, [artistId]);

  const handlePost = async () => {
    if (!newMsg.trim() || !artistId || posting) return;
    setPosting(true);
    try {
      const r = await base44.functions.invoke("socialMedia", {
        action: "postInstaVibeChannelMessage",
        artistId: channelArtistId,
        messageBody: newMsg.trim(),
      });
      if (r?.success) {
        setNewMsg("");
        await loadChannel();
      }
    } catch {}
    finally { setPosting(false); }
  };

  const isOwner = artistId && channelArtistId && artistId === channelArtistId;
  const avatarSrc = displayProfile?.instavibe_avatar || displayProfile?.avatar || AVATAR_OPTIONS[0];
  const displayName = displayProfile?.instavibe_handle || displayProfile?.username || "Artist";
  const followerCount = displayProfile?.instavibe_follower_count || displayProfile?.followers || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <img src={avatarSrc} alt={displayName} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(192,132,252,0.4)" }} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: "50%", background: "#22c55e", border: "2px solid #0a0a0f" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f5" }}>{displayName}</span>
              <CheckIcon />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
              {followerCount >= 1000 ? `${(followerCount / 1000).toFixed(1)}K` : followerCount} subscribers · Broadcast Channel
            </div>
          </div>
          <button style={{ fontSize: 11, fontWeight: 600, color: "#c084fc", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>Subscribed ✓</button>
        </div>
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 10, lineHeight: 1.5 }}>Official channel for updates, drops, and exclusive news. Only the artist can post here.</p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading channel…</div>
      ) : messages.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#6b7280" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📢</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No messages yet</div>
          <div style={{ fontSize: 12 }}>{isOwner ? "Post your first channel message below." : "The artist hasn't posted to this channel yet."}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {messages.map(b => {
            const rxns = b.reactions || {};
            const myRxns = new Set(b.my_reactions || []);
            const totalRxns = Object.values(rxns).reduce((s, v) => s + v, 0);
            const ts = b.created_at ? new Date(b.created_at) : null;
            const tsStr = ts ? `${Math.max(1, Math.floor((Date.now() - ts.getTime()) / 60000))}m` : "";
            return (
              <div key={b.id} style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <img src={avatarSrc} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px" }}>
                      <p style={{ fontSize: 13, color: "#e5e5ea", lineHeight: 1.55, margin: 0 }}>{b.body}</p>
                    </div>
                    <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, marginLeft: 2 }}>{tsStr} ago</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {CHANNEL_EMOJIS.map(emoji => {
                        const count = rxns[emoji] || 0;
                        const reacted = myRxns.has(emoji);
                        if (count === 0 && !reacted) return null;
                        return (
                          <button key={emoji} onClick={() => handleReact(b.id, emoji)}
                            style={{ display: "flex", alignItems: "center", gap: 4, background: reacted ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${reacted ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                            <span style={{ fontSize: 13 }}>{emoji}</span>
                            <span style={{ fontSize: 11, color: reacted ? "#c084fc" : "#9ca3af", fontWeight: 500 }}>{count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}</span>
                          </button>
                        );
                      })}
                      {totalRxns === 0 && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {CHANNEL_EMOJIS.slice(0, 4).map(emoji => (
                            <button key={emoji} onClick={() => handleReact(b.id, emoji)}
                              style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "3px 10px", cursor: "pointer", opacity: 0.6 }}>
                              <span style={{ fontSize: 13 }}>{emoji}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOwner && (
        <div style={{ margin: "12px 16px 24px", display: "flex", gap: 8 }}>
          <input value={newMsg} onChange={e => setNewMsg(e.target.value.slice(0, 1000))} onKeyDown={e => e.key === "Enter" && handlePost()}
            placeholder="Post to your channel…"
            style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "10px 14px", color: "#f0f0f5", fontSize: 13, outline: "none" }} />
          <button onClick={handlePost} disabled={!newMsg.trim() || posting}
            style={{ background: newMsg.trim() ? "linear-gradient(to right,#a855f7,#ec4899)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 20, padding: "10px 16px", color: "white", fontWeight: 700, fontSize: 12, cursor: newMsg.trim() ? "pointer" : "default" }}>
            {posting ? "…" : "Send"}
          </button>
        </div>
      )}

      {!isOwner && (
        <div style={{ margin: "12px 16px 24px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Only the artist can send messages here. React with emojis to show your support!</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SPONSORSHIPS
// ─────────────────────────────────────────────

function DealModal({ deal, onClose, onAccept, onDecline }) {
  const [counterOffer, setCounterOffer] = useState(deal.basePayout);
  const [negotiated, setNegotiated] = useState(false);
  const brandResponse = Math.round(counterOffer * (counterOffer > deal.basePayout ? 0.88 : 1.05));
  const likelyAccepted = counterOffer <= deal.basePayout * 1.15;
  const finalPayout = negotiated ? brandResponse : deal.basePayout;

  return (
    <div className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div className="absolute bottom-0 left-0 right-0 bg-[#111118] rounded-t-[24px] max-h-[88%] flex flex-col">
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer" }}>✕</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f5" }}>{deal.emoji} {deal.brand}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLORS[deal.tier], background: TIER_GLOW[deal.tier], borderRadius: 20, padding: "3px 10px" }}>{deal.tier}</span>
        </div>
        <div className="modal-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "14px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ borderRadius: 12, background: deal.daysLeft <= 2 ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.08)", border: `1px solid ${deal.daysLeft <= 2 ? "rgba(239,68,68,0.25)" : "rgba(251,191,36,0.2)"}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <span>{deal.daysLeft <= 2 ? "🚨" : "⏰"}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: deal.daysLeft <= 2 ? "#f87171" : "#fbbf24" }}>{deal.daysLeft <= 2 ? `Expires in ${deal.daysLeft} day${deal.daysLeft === 1 ? "" : "s"}!` : `${deal.daysLeft} days remaining`}</div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>Missing deadline costs -50 Clout</div>
            </div>
          </div>
          {deal.exclusive && (
            <div style={{ borderRadius: 12, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
              <span>🔒</span>
              <span style={{ fontSize: 11, color: "#c084fc" }}>Exclusive — blocks competitor deals for 7 days</span>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deliverables</div>
            {deal.requirements.map((req, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(168,85,247,0.15)", border: "1.5px solid rgba(168,85,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 9, color: "#c084fc", fontWeight: 700 }}>{i + 1}</span>
                </div>
                <span style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{req}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Contract Details</div>
            {deal.perTurnFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Per turn</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>${deal.perTurnFee.toLocaleString()}/turn × {deal.durationTurns} turns</span>
              </div>
            )}
            {deal.signingBonus > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Signing bonus</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>+${deal.signingBonus.toLocaleString()}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Total contract value</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>${deal.basePayout.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Negotiate Total</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>Your counter</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#c084fc" }}>${counterOffer.toLocaleString()}</span>
            </div>
            <input type="range" min={Math.round(deal.basePayout * 0.7)} max={Math.round(deal.basePayout * 1.5)} step={50}
              value={counterOffer} onChange={e => { setCounterOffer(Number(e.target.value)); setNegotiated(true); }}
              style={{ width: "100%", accentColor: "#a855f7", cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: "#4b5563" }}>-30%</span>
              <span style={{ fontSize: 9, color: "#4b5563" }}>+50%</span>
            </div>
            {negotiated && (
              <div style={{ marginTop: 10, borderRadius: 10, padding: "8px 12px", background: likelyAccepted ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${likelyAccepted ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: likelyAccepted ? "#4ade80" : "#f87171" }}>
                  {likelyAccepted ? `✓ Brand likely to accept · final: $${brandResponse.toLocaleString()}` : "✗ Counter too high — brand may walk away"}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onDecline ? onDecline(deal) : onClose()} style={{ flex: 1, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "none", color: "#9ca3af", fontWeight: 600, fontSize: 13, padding: "12px 0", cursor: "pointer" }}>Decline</button>
            <button onClick={() => onAccept(deal, finalPayout)}
              style={{ flex: 2, borderRadius: 12, background: "linear-gradient(to right, #a855f7, #ec4899)", border: "none", color: "white", fontWeight: 700, fontSize: 13, padding: "12px 0", cursor: "pointer" }}>
              Accept Deal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEAL_SUBVIEWS = [{id:"offers",label:"Offers"},{id:"active",label:"Active"},{id:"completed",label:"Completed / Breached"},{id:"history",label:"History"}];
const DEAL_DURATION_TURNS = {story_mention:1,sponsored_post:1,sponsored_reel:2,campaign:3,partnership:6,exclusive:10};

function Sponsorships({ onCloutGain: _onCloutGain, onAcceptDeal, onDeclineDeal, onCompleteDeal: _onCompleteDeal, existingDeals: _existingDeals, offeredDeals, allDeals, contracts, payoutLogs, currentTurn, focusDealId }) {
  const [subview,        setSubview]        = useState("offers");
  const [activeDeals,    setActiveDeals]    = useState(() => (contracts || []).filter(c => isActiveContractStatus(c.status)).map(c => mapDbContractToUi(c)));
  const [completedDeals] = useState([]);
  const [selectedDeal,   setSelectedDeal]   = useState(null);
  const [toast,          setToast]          = useState(null);
  const prevExistingKey = useRef("");
  const focusRefs = useRef({});

  useEffect(() => {
    const key = (contracts || []).map(c => `${c.id}:${c.status}`).join(",");
    if (key !== prevExistingKey.current) {
      prevExistingKey.current = key;
      const completedIds = new Set(completedDeals.map(d => d._dbId || d.id));
      setActiveDeals((contracts || []).filter(c => isActiveContractStatus(c.status) && !completedIds.has(c.id)).map(c => mapDbContractToUi(c)));
    }
  }, [contracts, completedDeals]);

  // Deep-link: switch subview + scroll to focused deal from notification
  useEffect(() => {
    if (!focusDealId || !allDeals?.length) return;
    const deal = allDeals.find(d => d.id === focusDealId);
    if (!deal) return;
    const normalizedStatus = normalizeBrandDealStatus(deal.status);
    const sv = normalizedStatus === "offered" ? "offers" : isActiveContractStatus(normalizedStatus) || normalizedStatus === "accepted" ? "active" : isCompletedContractStatus(normalizedStatus) ? "completed" : "history";
    setSubview(sv);
    setTimeout(() => { focusRefs.current[focusDealId]?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150);
  }, [focusDealId, allDeals]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAccept = useCallback(async (deal, payout) => {
    setSelectedDeal(null);
    // No instant clout — rewards arrive via turn processing
    const perTurn = deal.perTurnFee || 0;
    const signing = deal.signingBonus || 0;
    const dur = deal.durationTurns || 1;
    showToast(`🤝 ${deal.brand} contract signed! $${perTurn}/turn for ${dur} turns${signing > 0 ? ` + $${signing.toLocaleString()} signing bonus` : ""}`);
    if (onAcceptDeal) await onAcceptDeal(deal, payout);
    setSubview("active");
  }, [showToast, onAcceptDeal]);

  const handleDecline = useCallback(async (deal) => {
    setSelectedDeal(null);
    showToast(`Passed on ${deal.brand} deal.`);
    if (onDeclineDeal) await onDeclineDeal(deal);
  }, [onDeclineDeal, showToast]);

  const activeBrandIds    = new Set(activeDeals.map(d => d._dbId || d.id));
  const completedBrandIds = new Set(completedDeals.map(d => d._dbId || d.id));
  const availableDeals    = (offeredDeals || []).filter(d => !activeBrandIds.has(d._dbId || d.id) && !completedBrandIds.has(d._dbId || d.id) && recordSupportsPlatform(d._raw || d, 'instavibe'));

  // Sort offers: highest payout first, then soonest expiry
  const sortedOffers = [...availableDeals].sort((a, b) => {
    const pd = (b.basePayout || 0) - (a.basePayout || 0);
    return pd !== 0 ? pd : (a.daysLeft || 99) - (b.daysLeft || 99);
  });
  // Sort active: soonest expiry first
  const sortedActive = [...activeDeals].sort((a, b) => (a._raw?.expires_turn || 9999) - (b._raw?.expires_turn || 9999));

  // DB-sourced completed + history
  const payoutByContract = useMemo(() => {
    const acc = new Map();
    for (const row of (payoutLogs || [])) {
      const id = row?.contract_id;
      if (!id) continue;
      acc.set(id, (acc.get(id) || 0) + (Number(row.amount) || 0));
    }
    return acc;
  }, [payoutLogs]);

  const dbCompleted = (contracts || []).filter(c => isCompletedContractStatus(c.status)).sort((a, b) => (b.completed_turn_id || 0) - (a.completed_turn_id || 0));
  const dbHistory   = (contracts || []).filter(c => isHistoricalContractStatus(c.status));
  const mergedCompleted = [...completedDeals.map(d => ({ ...d, _local: true })), ...dbCompleted.filter(d => !completedDeals.some(ld => (ld._dbId || ld.id) === d.id))];

  const counts = { offers: sortedOffers.length, active: sortedActive.length, completed: mergedCompleted.length, history: dbHistory.length };

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "absolute", top: 80, left: 16, right: 16, zIndex: 90, background: "#1c1c2e", border: "1px solid rgba(168,85,247,0.35)", borderRadius: 14, padding: "12px 16px", fontSize: 13, color: "#f0f0f5", fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}

      {/* ── Header + pill nav ── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f5" }}>Brand Deals</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{sortedOffers.length} offer{sortedOffers.length !== 1 ? "s" : ""} · {sortedActive.length} active{currentTurn ? ` · Turn ${currentTurn}` : ""}</div>
          </div>
        </div>
        {/* Pill nav */}
        <div style={{ display: "flex", gap: 6, padding: "10px 16px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
          {DEAL_SUBVIEWS.map(sv => {
            const active = subview === sv.id; const count = counts[sv.id] ?? 0;
            return (
              <button key={sv.id} onClick={() => setSubview(sv.id)}
                style={{ flexShrink: 0, borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600, border: active ? "none" : "1px solid rgba(255,255,255,0.1)", background: active ? "linear-gradient(to right,#a855f7,#ec4899)" : "rgba(255,255,255,0.04)", color: active ? "white" : "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                {sv.label}
                {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: active ? "rgba(255,255,255,0.25)" : "rgba(168,85,247,0.25)", color: active ? "white" : "#c084fc", borderRadius: 10, padding: "1px 6px" }}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── OFFERS subview ── */}
      {subview === "offers" && (
        <div className="modal-scroll" style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column" }}>
          {sortedOffers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No offers right now</div>
              <div style={{ fontSize: 13 }}>New brand deals arrive each turn. Keep growing your audience!</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Available Offers</div>
              {sortedOffers.map(deal => {
                const expired = deal.daysLeft <= 0;
                return (
                  <button key={deal.id} ref={el => { focusRefs.current[deal._dbId || deal.id] = el; }}
                    onClick={() => !expired && setSelectedDeal(deal)}
                    style={{ width: "100%", borderRadius: 16, border: `1px solid ${expired ? "rgba(255,255,255,0.05)" : deal.daysLeft <= 2 ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)"}`, background: expired ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)", padding: 14, cursor: expired ? "default" : "pointer", textAlign: "left", marginBottom: 10, display: "block", opacity: expired ? 0.5 : 1 }}>
                    <BrandDealContractCard
                      brandName={deal.brand}
                      tier={deal.tier}
                      status={deal.status || 'offered'}
                      deliverablesRemaining={Number(deal._raw?.metadata?.deliverable_count_required || 1)}
                      turnsRemaining={Math.max(1, Number(deal.durationTurns || 1))}
                      showAccrualHelper
                      subtext={`$${(deal.perTurnFee || 0).toLocaleString()}/turn · ${deal.durationTurns || 1} turns · Signing bonus $${(deal.signingBonus || 0).toLocaleString()}`}
                      personaFitText={deal.personaFitScore != null ? `Persona fit ${(Number(deal.personaFitScore) * 100).toFixed(0)}%` : ''}
                      loyaltyTier={deal.loyaltyTier}
                      kpis={deal.kpis}
                      action={!expired ? <span style={{ color: "#4b5563", fontSize: 18, flexShrink: 0 }}>›</span> : null}
                    />
                    <div style={{ fontSize: 12, color: expired || deal.daysLeft <= 2 ? "#f87171" : "#6b7280", marginTop: 4 }}>{expired ? "🚫 Expired" : deal.daysLeft <= 2 ? `🚨 ${deal.daysLeft} turns left` : `⏰ ${deal.daysLeft} turns left`}</div>
                  </button>
                );              })}
            </>
          )}
        </div>
      )}

      {/* ── ACTIVE subview ── */}
      {subview === "active" && (
        <div className="modal-scroll" style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column" }}>
          {sortedActive.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No active deals</div>
              <div style={{ fontSize: 13 }}>Accept an offer to start turn-based brand deal payouts.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>⚡ Active Deals</div>
              {sortedActive.map(d => {
                const raw = d._raw || {};
                const acceptedAt  = raw.accepted_turn || 0;
                const dur         = DEAL_DURATION_TURNS[raw.deal_type] || 1;
                const expiresAt   = raw.expires_turn || (acceptedAt + dur);
                const totalTurns  = Math.max(1, expiresAt - acceptedAt);
                const elapsed     = Math.max(0, (currentTurn || 0) - acceptedAt);
                const turnPct     = Math.min(100, Math.round((elapsed / totalTurns) * 100));
                const turnsLeft   = expiresAt - (currentTurn || 0);
                return (
                  <div key={d._dbId || d.id} ref={el => { focusRefs.current[d._dbId || d.id] = el; }}>
                    <BrandDealContractCard
                      brandName={d.brand}
                      tier={d.tier}
                      status={d.status || "active"}
                      deliverablesRemaining={Math.max(0, Number(d.postsNeeded || d.deliverablesRemaining || 0))}
                      turnsRemaining={Math.max(0, (raw.expires_turn || 0) - (currentTurn || 0))}
                      showAccrualHelper
                      subtext={`$${Number(d.perTurnFee || 0).toLocaleString()}/turn · Signing bonus $${Number(d.signingBonus || 0).toLocaleString()}`}
                      loyaltyTier={d.loyaltyTier}
                      kpis={raw.kpis}
                      kpiProgress={raw.kpi_progress}
                      action={null}
                    />
                    {acceptedAt > 0 && (
                      <div style={{ marginTop: -8, marginBottom: 10, padding: "8px 14px 10px", borderRadius: "0 0 14px 14px", background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.15)", borderTop: "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>Turn {acceptedAt} → {expiresAt}</span>
                          <span style={{ fontSize: 11, color: turnsLeft <= 1 ? "#f87171" : "#c084fc", fontWeight: 600 }}>
                            {turnsLeft <= 0 ? "Completing next turn…" : `${turnsLeft} turn${turnsLeft === 1 ? "" : "s"} remaining`}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
                          <div style={{ width: `${turnPct}%`, height: "100%", borderRadius: 2, background: turnPct >= 100 ? "#22c55e" : "linear-gradient(to right,#a855f7,#ec4899)", transition: "width 0.4s" }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── COMPLETED subview ── */}
      {subview === "completed" && (
        <div className="modal-scroll" style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column" }}>
          {mergedCompleted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No completed deals yet</div>
              <div style={{ fontSize: 12 }}>Completed deals and payouts will appear here.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>✅ Completed</div>
              {mergedCompleted.map(d => {
                const key    = d._dbId || d.id;
                const payout = payoutByContract.get(d._dbId || d.id) || d.payout || d.basePayout || 0;
                const tier   = (d.tier || "silver").toLowerCase();
                const brand  = d.brand || d.brand_name;
                const completedTurn = d._raw?.completed_turn_id || d.completed_turn_id;
                const category = d._raw?.category_name || d.category || null;
                const status = normalizeBrandDealStatus(d.status || d._raw?.status || "completed");
                return (
                  <div key={key} ref={el => { focusRefs.current[key] = el; }} style={{ marginBottom: 8 }}>
                    <BrandDealContractCard
                      brandName={brand}
                      tier={tier}
                      status={status}
                      deliverablesRemaining={0}
                      turnsRemaining={0}
                      subtext={`Turn-based payout settled: $${Number(payout).toLocaleString()}${completedTurn ? ` · Turn ${completedTurn}` : ""}${category ? ` · ${String(category).replace(/_/g, " ")}` : ""}`}
                      loyaltyTier={d.loyaltyTier || d._raw?.loyalty_tier}
                      action={<span style={{ fontSize: 18 }}>{status === "breached" ? "⚠️" : "✅"}</span>}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── HISTORY subview (Expired / Declined) ── */}
      {subview === "history" && (
        <div className="modal-scroll" style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column" }}>
          {dbHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#6b7280" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>No expired or declined deals</div>
              <div style={{ fontSize: 12 }}>Deals you pass on or that expire will show here.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>📂 History</div>
              {dbHistory.map(d => {
                const tier       = (d.brand_tier || d.tier || d.metadata?.tier || "silver").toLowerCase();
                const emoji      = TIER_EMOJI_MAP[tier] || "✨";
                const isDeclined = d.status === "declined";
                const tierColor  = TIER_COLORS[tier] || "#94a3b8";
                const tierGlow   = TIER_GLOW[tier]   || "rgba(148,163,184,0.1)";
                return (
                  <div key={d.id} style={{ borderRadius: 12, background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 8, opacity: 0.65 }}>
                    <span style={{ fontSize: 18, filter: "grayscale(1)" }}>{emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>{d.brand_name || d.brand}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: tierColor, background: tierGlow, borderRadius: 20, padding: "2px 7px", textTransform: "capitalize" }}>{tier}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>
                        {d.deal_type ? d.deal_type.replace(/_/g, " ") : "Deal"}
                        {d.category_name ? ` · ${d.category_name.replace(/_/g, " ")}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>${Number(d.payout || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: isDeclined ? "#6b7280" : "#f87171", marginTop: 1 }}>{isDeclined ? "Declined" : "Expired"}</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {selectedDeal && <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} onAccept={handleAccept} onDecline={handleDecline} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────

function Analytics({ stats, posts: _realPosts, weekly: realWeekly }) {
  const displayStats = stats || [
    { label: "Reach",      value: "0",   change: "+0%", icon: "👁️" },
    { label: "Engagement", value: "0%",  change: "+0%", icon: "📈" },
    { label: "Revenue",    value: "$0",  change: "+0%", icon: "💰" },
    { label: "Followers",  value: "+0",  change: "+0%", icon: "👥" },
  ];
  const weeklyData = (realWeekly && realWeekly.some(d => d.value > 0)) ? realWeekly : [
    { day: "Sun", value: 0 }, { day: "Mon", value: 0 }, { day: "Tue", value: 0 },
    { day: "Wed", value: 0 }, { day: "Thu", value: 0 }, { day: "Fri", value: 0 }, { day: "Sat", value: 0 },
  ];
  const maxVal = Math.max(...weeklyData.map(d => d.value), 1);
  return (
    <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f5" }}>Analytics</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>Your performance this month</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {displayStats.map(s => (
          <div key={s.label} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", background: "rgba(34,197,94,0.1)", borderRadius: 6, padding: "2px 6px" }}>{s.change}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f0f5" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f5", marginBottom: 16 }}>Weekly Reach</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
          {weeklyData.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: `${(d.value / maxVal) * 100}%`, background: "linear-gradient(to top, #a855f7, #ec4899)", borderRadius: "4px 4px 0 0", minHeight: 4 }} />
              </div>
              <span style={{ fontSize: 9, color: "#6b7280" }}>{d.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AVATAR UPLOAD PICKER
// ─────────────────────────────────────────────

function AvatarUploadPicker({ draftAvatar, setDraftAvatar }) {
  const inputRef = React.useRef(null);
  const [uploading, setUploading] = React.useState(false);
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket: 'uploads' });
      if (result?.file_url) setDraftAvatar(result.file_url);
    } catch {
      const url = URL.createObjectURL(file);
      setDraftAvatar(url);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", cursor: uploading ? "wait" : "pointer" }} onClick={() => !uploading && inputRef.current?.click()}>
          <img src={draftAvatar} alt="preview" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(192,132,252,0.5)", opacity: uploading ? 0.5 : 1 }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 20 }}>{uploading ? "⏳" : "📷"}</span>
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginBottom: 12 }}>Tap the photo above to upload your own image</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

function Profile({ clout, profileData, baseProfile: baseProfileProp }) {
  const baseProfile = baseProfileProp || profileData || {};
  const [editOpen, setEditOpen]       = useState(false);
  const [avatar, setAvatar]           = useState(baseProfile.instavibe_avatar || baseProfile.artist_image || AVATAR_OPTIONS[0]);
  const [displayName, setDisplayName] = useState(baseProfile.instavibe_handle || baseProfile.artist_name || "");
  const [bio, setBio]                 = useState(baseProfile.instavibe_bio || baseProfile.bio || "");
  const [draftAvatar, setDraftAvatar] = useState(avatar);
  const [draftName, setDraftName]     = useState(displayName);
  const [draftBio, setDraftBio]       = useState(bio);
  const cloutTier = getCloutTier(clout);
  const dbPosts = profileData?.dbPosts || [];

  const openEdit = () => {
    setDraftAvatar(avatar);
    setDraftName(displayName);
    setDraftBio(bio);
    setEditOpen(true);
  };

  const handleSave = async () => {
    setAvatar(draftAvatar);
    setDisplayName(draftName);
    setBio(draftBio);
    setEditOpen(false);
    if (baseProfileProp?.id) {
      base44.functions.invoke("socialMedia", {
        action: "updateInstaVibeProfile",
        artistId: baseProfileProp.id,
        displayName: draftName,
        bio: draftBio,
        avatarUrl: draftAvatar,
      }).catch(() => {});
    }
  };

  return (
    <div>
      <div style={{ padding: "16px 16px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src={avatar} alt="profile" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(192,132,252,0.5)" }} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#22c55e", border: "2px solid #0a0a0f" }} />
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
            <StatCol value={profileData?.posts ?? dbPosts.length} label="Posts" />
            <StatCol value={(() => { const raw = profileData?.followers || baseProfile.instavibe_follower_count || baseProfile.followers || 0; const f = typeof raw === 'string' ? parseFloat(raw.replace(/[KkMmBb]/g, '') ) * (raw.match(/[Kk]/i) ? 1000 : raw.match(/[Mm]/i) ? 1000000 : 1) : Number(raw) || 0; return f >= 1000000 ? `${(f/1000000).toFixed(1)}M` : f >= 1000 ? `${(f/1000).toFixed(1)}K` : f; })()} label="Followers" />
            <StatCol value={profileData?.following ?? baseProfile.instavibe_following_count ?? 0} label="Following" />
            <StatCol value={`🔥 ${(clout / 1000).toFixed(1)}K`} label={cloutTier.label} color={cloutTier.color} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f5" }}>{displayName}</span>
            <CheckIcon />
          </div>
          <p style={{ marginTop: 4, fontSize: 12, color: "#9ca3af", lineHeight: 1.6, whiteSpace: "pre-line" }}>{bio}</p>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={openEdit} style={{ flex: 1, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", color: "#f0f0f5", fontWeight: 600, fontSize: 13, padding: "8px 0", cursor: "pointer" }}>Edit Profile</button>
          <button onClick={() => { const ev = new CustomEvent('instavibe:openNewPost'); window.dispatchEvent(ev); }} style={{ flex: 1, borderRadius: 12, background: "linear-gradient(to right, #a855f7, #ec4899)", border: "none", color: "white", fontWeight: 600, fontSize: 13, padding: "8px 0", cursor: "pointer" }}>New Post</button>
        </div>
      </div>

      <div style={{ marginTop: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0", borderBottom: "2px solid #c084fc" }}>
          <span style={{ fontSize: 14 }}>⊞</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#c084fc" }}>Posts</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, padding: 2 }}>
        {dbPosts.length === 0 ? (
          <div style={{ gridColumn: "1/-1", padding: "40px 16px", textAlign: "center", color: "#4b5563" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>No posts yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Create your first post to fill your grid</div>
          </div>
        ) : (
          dbPosts.slice(0, 9).map((post, i) => (
            <div key={post.id || i} style={{ aspectRatio: "1/1", overflow: "hidden", background: "#111118", position: "relative" }}>
              {post.content_url || post.thumbnail_url ? (
                <img src={post.content_url || post.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `hsl(${(i * 47) % 360}, 20%, 12%)`, gap: 4 }}>
                  <span style={{ fontSize: 20 }}>{post.post_type === "reel" ? "🎬" : post.post_type === "story" ? "⭕" : post.post_type === "carousel" ? "🖼️" : "📷"}</span>
                  <span style={{ fontSize: 9, color: "#4b5563", textTransform: "capitalize" }}>{post.post_type}</span>
                </div>
              )}
              <div style={{ position: "absolute", bottom: 4, left: 4, display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "1px 4px" }}>❤️ {(post.like_count || post.likes || 0).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
          <div onClick={() => setEditOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute bottom-0 left-0 right-0 bg-[#111118] rounded-t-[24px] max-h-[86%] flex flex-col">
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <button onClick={() => setEditOpen(false)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f5" }}>Edit Profile</span>
              <button onClick={handleSave} style={{ background: "none", border: "none", color: "#c084fc", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save</button>
            </div>
            <div className="modal-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "20px 16px 36px", display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <AvatarUploadPicker draftAvatar={draftAvatar} setDraftAvatar={setDraftAvatar} />
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>Display Name</label>
                <input value={draftName} onChange={e => setDraftName(e.target.value.slice(0, 30))} placeholder="Your artist name..."
                  style={{ width: "100%", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5", fontSize: 14, fontWeight: 500, padding: "11px 14px", boxSizing: "border-box", outline: "none" }} />
                <div style={{ fontSize: 10, color: "#4b5563", textAlign: "right", marginTop: 4 }}>{draftName.length}/30</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>Bio</label>
                <textarea value={draftBio} onChange={e => setDraftBio(e.target.value.slice(0, 150))} placeholder="Tell your story..." rows={4}
                  style={{ width: "100%", resize: "none", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5", fontSize: 13, lineHeight: 1.6, padding: "11px 14px", boxSizing: "border-box", outline: "none" }} />
                <div style={{ fontSize: 10, color: "#4b5563", textAlign: "right", marginTop: 4 }}>{draftBio.length}/150</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OtherProfile({ profileId, username, onBack, viewerArtistId }) {
  const [profileData, setProfileData] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [following,   setFollowing]   = useState(false);
  const [toggling,    setToggling]    = useState(false);

  const [profilePosts, setProfilePosts] = React.useState([]);

  // Load profile + posts directly from DB (no edge function)
  useEffect(() => {
    const targetId = profileId;
    if (!targetId) { setLoading(false); return; }

    (async () => {
      try {
        const [profileRes, postsRes] = await Promise.all([
          supabaseClient
            .from('profiles')
            .select('id, artist_name, instavibe_handle, instavibe_avatar, instavibe_bio, artist_image, followers, instavibe_follower_count, instavibe_following_count, career_stage, genre, clout, bio, region, verified')
            .eq('id', targetId)
            .maybeSingle(),
          supabaseClient
            .from('social_posts')
            .select('id, artist_id, post_type, title, caption, views, likes, like_count, comment_count, content_url, created_at')
            .eq('artist_id', targetId)
            .eq('platform', 'instavibe')
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(9),
        ]);

        if (profileRes.data) {
          setProfileData(profileRes.data);
          setProfilePosts(postsRes.data || []);
        }

        // Check follow status
        if (viewerArtistId && targetId !== viewerArtistId) {
          const { data: followRow } = await supabaseClient
            .from('instavibe_follows')
            .select('id')
            .eq('follower_id', viewerArtistId)
            .eq('following_id', targetId)
            .maybeSingle();
          setFollowing(!!followRow);
        }
      } catch (e) {
        console.error('[InstaVibe:OtherProfile] Load error:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, username, viewerArtistId]);

  const handleFollow = async () => {
    if (!viewerArtistId || !profileData?.id || toggling) return;
    setToggling(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      const action = wasFollowing ? "unfollowInstaVibeUser" : "followInstaVibeUser";
      await base44.functions.invoke("socialMedia", { action, artistId: viewerArtistId, targetId: profileData.id });
    } catch { setFollowing(wasFollowing); }
    finally { setToggling(false); }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[90] bg-black flex items-center justify-center">
      <div style={{ width: 24, height: 24, border: "2px solid rgba(168,85,247,0.3)", borderTop: "2px solid #a855f7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  const p = profileData;
  if (!p) return null;

  const displayName = p.instavibe_handle || p.artist_name || "Artist";
  const avatarSrc = p.instavibe_avatar || p.artist_image || AVATAR_OPTIONS[0];
  const followerCount = p.instavibe_follower_count || p.followers || 0;
  const followingCount = p.instavibe_following_count || p.following || 0;
  const clout = p.clout || 0;
  const cloutTier = getCloutTier(clout);

  return (
    <div className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,10,15,0.98)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#c084fc", fontSize: 20, lineHeight: 1, padding: "0 4px 0 0" }}>‹</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f5" }}>{displayName}</span>
          {(p.verified || followerCount >= 1000) && <CheckIcon />}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: cloutTier.color, background: `${cloutTier.color}18`, borderRadius: 20, padding: "3px 10px" }}>{cloutTier.label}</span>
      </div>
      <div className="modal-scroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "16px 16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={avatarSrc} alt={displayName} style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(192,132,252,0.4)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
              <StatCol value={profilePosts.length} label="Posts" />
              <StatCol value={followerCount >= 1_000_000 ? `${(followerCount/1_000_000).toFixed(1)}M` : followerCount >= 1000 ? `${(followerCount/1000).toFixed(1)}K` : followerCount} label="Followers" />
              <StatCol value={followingCount} label="Following" />
              {clout > 0 && <StatCol value={`🔥 ${(clout/1000).toFixed(1)}K`} label={cloutTier.label} color={cloutTier.color} />}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {p.genre && <div style={{ fontSize: 11, color: "#a855f7", fontWeight: 500, marginBottom: 2 }}>🎵 {p.genre}</div>}
            <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, whiteSpace: "pre-line", margin: 0 }}>{p.instavibe_bio || p.bio || ""}</p>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            {viewerArtistId && p.id !== viewerArtistId && (
              <button onClick={handleFollow} disabled={toggling}
                style={{ flex: 2, borderRadius: 12, background: following ? "rgba(255,255,255,0.08)" : "linear-gradient(to right, #a855f7, #ec4899)", border: following ? "1px solid rgba(255,255,255,0.1)" : "none", color: following ? "#9ca3af" : "white", fontWeight: 700, fontSize: 13, padding: "9px 0", cursor: "pointer", transition: "all 0.2s", opacity: toggling ? 0.6 : 1 }}>
                {following ? "Following ✓" : "Follow"}
              </button>
            )}
            <button style={{ flex: 1, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5", fontWeight: 600, fontSize: 13, padding: "9px 0", cursor: "pointer" }}>Message</button>
            <button style={{ width: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5", fontSize: 16, cursor: "pointer" }}>⋯</button>
          </div>
        </div>
        <div style={{ marginTop: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderBottom: "2px solid #c084fc" }}>
            <span style={{ fontSize: 13 }}>⊞</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#c084fc" }}>Posts</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, padding: 2 }}>
          {profilePosts.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 0", color: "#4b5563", fontSize: 13 }}>No posts yet</div>
          ) : profilePosts.slice(0, 9).map((post, i) => {
            const imgSrc = post.content_url || null;
            return (
              <div key={post.id || i} style={{ aspectRatio: "1/1", overflow: "hidden", background: "#111118", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {imgSrc
                  ? <img src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1a2e,#16213e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📝</div>
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GO LIVE
// ─────────────────────────────────────────────

function GoLiveOverlay({ onEnd, profile }) {
  const [viewers,   setViewers]   = useState(0);
  const [reactions, setReactions] = useState([]);
  const [duration,  setDuration]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [ending,    setEnding]    = useState(false);

  useEffect(() => {
    // Simulate live stream on mount
    if (profile?.id) {
      base44.functions.invoke("socialMedia", {
        action: "simulateLiveStream",
        artistId: profile.id,
        platform: "instavibe",
      }).then(r => {
        if (r?.viewers) setViewers(r.viewers);
        setResult(r);
      }).catch(() => {});
    }
    const vInterval = setInterval(() => setViewers(v => Math.max(0, v + Math.floor(Math.random() * 40 - 8))), 3000);
    const dInterval = setInterval(() => setDuration(d => d + 1), 1000);
    const rInterval = setInterval(() => {
      const emojis = ["❤️", "🔥", "🎵", "👑", "💜", "✨"];
      setReactions(prev => [...prev.slice(-6), { id: Date.now(), emoji: emojis[Math.floor(Math.random() * emojis.length)], x: 20 + Math.random() * 60 }]);
    }, 800);
    return () => { clearInterval(vInterval); clearInterval(dInterval); clearInterval(rInterval); };
  }, [profile?.id]);

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    onEnd?.();
  };

  const mins = String(Math.floor(duration / 60)).padStart(2, "0");
  const secs = String(duration % 60).padStart(2, "0");
  const displayName = profile?.instavibe_handle || profile?.artist_name || "Artist";
  const avatarSrc = profile?.instavibe_avatar || profile?.artist_image || AVATAR_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden flex flex-col">
      <div className="relative flex-1 bg-gradient-to-br from-[#1a0a2e] via-[#0a1a2e] to-[#1a0a1e] flex items-center justify-center overflow-hidden">
        <img src={avatarSrc} alt="" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(168,85,247,0.5)", boxShadow: "0 0 40px rgba(168,85,247,0.3)" }} />
        {reactions.map(r => (
          <div key={r.id} style={{ position: "absolute", bottom: 80, left: `${r.x}%`, fontSize: 24, opacity: 0.9, pointerEvents: "none" }}>{r.emoji}</div>
        ))}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: "#ef4444", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "white" }}>● LIVE</div>
            <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "white" }}>{mins}:{secs}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", borderRadius: 20, padding: "4px 12px" }}>
            <span style={{ fontSize: 12 }}>👁️</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "white" }}>{viewers.toLocaleString()}</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 20, left: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>🎵 Live on InstaVibe</div>
        </div>
        {result?.revenue > 0 && (
          <div style={{ position: "absolute", top: 60, right: 16, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "6px 12px", fontSize: 11, color: "#86efac", fontWeight: 600 }}>
            +${result.revenue?.toFixed(0)} earned
          </div>
        )}
      </div>
      <div style={{ background: "#111118", padding: "14px 16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, borderRadius: 24, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 16px", fontSize: 13, color: "#4b5563" }}>Say something...</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["❤️", "🔥", "🎵"].map(e => (
            <button key={e} onClick={() => setReactions(prev => [...prev.slice(-6), { id: Date.now(), emoji: e, x: 20 + Math.random() * 60 }])}
              style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "none", fontSize: 16, cursor: "pointer" }}>{e}</button>
          ))}
        </div>
        <button onClick={handleEnd} disabled={ending} style={{ background: "#ef4444", border: "none", borderRadius: 20, padding: "8px 16px", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: ending ? 0.6 : 1 }}>End</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CREATE POST MODAL
// ─────────────────────────────────────────────

function StyledCaption({ text }) {
  if (!text) return null;
  const parts = text.split(/([@#]\w+)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('#')) return <span key={i} style={{ color: "#a855f7", fontWeight: 600 }}>{part}</span>;
        if (part.startsWith('@')) return <span key={i} style={{ color: "#22d3ee", fontWeight: 600 }}>{part}</span>;
        return part;
      })}
    </span>
  );
}

const POST_TYPES_LIST = [
  { id: "photo",            label: "Photo Post",     desc: "Album art, promo shots, lifestyle",                energyCost: 3  },
  { id: "carousel",         label: "Carousel",       desc: "Multi-image behind the scenes or rollout",          energyCost: 5  },
  { id: "story",            label: "Story",          desc: "24-hour ephemeral content, Q&A, polls",             energyCost: 2  },
  { id: "reel",             label: "Reel",           desc: "Short video, similar to LoopTok but curated",       energyCost: 6  },
  { id: "live",             label: "Go Live",        desc: "Real-time fan interaction, performances",           energyCost: 10 },
  { id: "exclusive_drop",   label: "Exclusive Drop", desc: "Drop something exclusive for your OGs — boosts OG loyalty", energyCost: 5, alignmentTag: "feed_ogs" },
  { id: "community_post",   label: "Community Post", desc: "Unite your community — boosts core fan retention",  energyCost: 4, alignmentTag: "community_ritual" },
  { id: "radio_promo",      label: "Radio Promo",    desc: "Promote your latest Soundburst radio play", energyCost: 4, alignmentTag: "radio_promo" },
];

function PhotoUploadArea({ onPhotoSelected, photoUrl }) {
  const inputRef = React.useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onPhotoSelected(url, file);
  };
  return (
    <div onClick={() => inputRef.current?.click()}
      style={{ height: photoUrl ? 220 : 80, background: "rgba(255,255,255,0.04)", margin: "0 16px", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "height 0.3s", border: `1px dashed ${photoUrl ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.1)"}`, overflow: "hidden", position: "relative" }}>
      {photoUrl ? (
        <>
          <img src={photoUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "white" }}>Change</div>
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24 }}>📷</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Tap to add photo or video</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

function CreateModal({ open, onClose, onPost, posting, acceptedDeals, releases }) {
  const [caption, setCaption]               = useState("");
  const [selectedType, setSelectedType]     = useState(null);
  const [sponsored, setSponsored]           = useState(false);
  const [selectedBrand, setSelectedBrand]   = useState(null);
  const [photoUrl, setPhotoUrl]             = useState(null);
  const [photoFile, setPhotoFile]           = useState(null);
  const [showMusic, setShowMusic]           = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [showTagging, setShowTagging]       = useState(false);
  const [tagQuery, setTagQuery]             = useState("");
  const [tagResults, setTagResults]         = useState([]);
  const [taggedPeople, setTaggedPeople]     = useState([]);
  const captionRef = React.useRef(null);

  const handlePhotoSelected = (url, file) => { setPhotoUrl(url); setPhotoFile(file); };
  const handleToggleSponsored = () => { setSponsored(s => { if (s) setSelectedBrand(null); return !s; }); };

  const handleTagSearch = useCallback(async (q) => {
    setTagQuery(q);
    if (q.length < 2) { setTagResults([]); return; }
    try {
      const results = await base44.entities.ArtistProfile?.filter({ artist_name: { $ilike: `%${q}%` } }, "artist_name", 8).catch(() => []);
      setTagResults(Array.isArray(results) ? results : []);
    } catch {}
  }, []);

  const insertTag = (person) => {
    const handle = `@${(person.instavibe_handle || person.artist_name || "").replace(/\s+/g, "")}`;
    setTaggedPeople(prev => prev.some(p => p.id === person.id) ? prev : [...prev, { ...person, handle }]);
    setCaption(prev => { const t = prev.trimEnd(); return t ? `${t} ${handle} ` : `${handle} `; });
    setTagQuery(""); setTagResults([]); setShowTagging(false);
    setTimeout(() => captionRef.current?.focus(), 50);
  };

  const [uploading, setUploading] = useState(false);

  const handleShare = async () => {
    if (!selectedType || !onPost) return;
    let persistedImageUrl = null;
    if (photoFile) {
      setUploading(true);
      try {
        const result = await base44.integrations.Core.UploadFile({ file: photoFile, bucket: 'uploads' });
        persistedImageUrl = result?.file_url || null;
        if (!persistedImageUrl) console.error('[InstaVibe] Upload returned no URL');
      } catch (e) {
        console.error('[InstaVibe] Image upload error:', e?.message || e);
      } finally {
        setUploading(false);
      }
    }
    onPost(selectedType, caption, sponsored ? selectedBrand : null, persistedImageUrl, selectedRelease?.id || null);
    onClose();
    setSelectedType(null); setCaption(""); setSponsored(false); setSelectedBrand(null);
    setPhotoUrl(null); setPhotoFile(null); setSelectedRelease(null); setTaggedPeople([]);
  };

  if (!open) return null;
  const releasesWithMusic = (releases || []).filter(r => {
    const ls = (r.lifecycle_state || "").toLowerCase();
    const rs = (r.release_status || "").toLowerCase();
    return rs === "released" || ["hot","trending","momentum","stable","fading","declining","archived"].includes(ls);
  });

  return (
    <div className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
      <style>{`.modal-scroll::-webkit-scrollbar{display:none}.modal-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute bottom-0 left-0 right-0 bg-[#111118] rounded-t-[24px] max-h-[82%] flex flex-col">
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f0f5" }}>New Post</span>
          <button onClick={handleShare} disabled={!selectedType || posting || uploading} style={{ background: selectedType ? "linear-gradient(to right, #a855f7, #ec4899)" : "rgba(255,255,255,0.1)", border: "none", borderRadius: 20, color: selectedType ? "white" : "#6b7280", fontSize: 13, fontWeight: 700, padding: "5px 16px", cursor: selectedType ? "pointer" : "default", opacity: (posting || uploading) ? 0.6 : 1 }}>{uploading ? "Uploading…" : posting ? "Posting..." : "Share"}</button>
        </div>
        <div className="modal-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {!selectedType ? (
            <div style={{ padding: "12px 16px 0" }}>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>Choose post type</p>
              {POST_TYPES_LIST.map(type => (
                <button key={type.id} onClick={() => setSelectedType(type)}
                  style={{ width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", cursor: "pointer", marginBottom: 8, display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f5" }}>{type.label}</span>
                    <span style={{ fontSize: 10, color: "#6b7280" }}>-{type.energyCost} energy</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{type.desc}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: "12px 16px 0" }}>
              <button onClick={() => setSelectedType(null)} style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10, padding: "6px 12px", color: "#c084fc", fontSize: 12, cursor: "pointer", marginBottom: 10 }}>← {selectedType.label}</button>
            </div>
          )}
          <PhotoUploadArea onPhotoSelected={handlePhotoSelected} photoUrl={photoUrl} />
          <div style={{ padding: "12px 16px 0" }}>
            <textarea ref={captionRef} value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Write a caption… use #hashtags and @tag people" rows={3}
              style={{ width: "100%", resize: "none", background: "transparent", border: "none", color: "#f0f0f5", fontSize: 14, lineHeight: 1.6, outline: "none", boxSizing: "border-box" }} />
            {caption && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.5, wordBreak: "break-word" }}><StyledCaption text={caption} /></div>}
          </div>
          {taggedPeople.length > 0 && (
            <div style={{ padding: "4px 16px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {taggedPeople.map(p => (
                <span key={p.id} style={{ fontSize: 11, color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 20, padding: "2px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {p.handle}
                  <button onClick={() => setTaggedPeople(prev => prev.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {showTagging && (
            <div style={{ margin: "8px 16px 0", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <input value={tagQuery} onChange={e => handleTagSearch(e.target.value)} placeholder="Search artists to tag…" autoFocus
                style={{ width: "100%", background: "transparent", border: "none", color: "#f0f0f5", fontSize: 13, padding: "10px 14px", outline: "none", boxSizing: "border-box" }} />
              {tagResults.map(p => (
                <button key={p.id} onClick={() => insertTag(p)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left" }}>
                  <img src={p.instavibe_avatar || p.artist_image || AVATAR_OPTIONS[0]} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f0f5" }}>{p.artist_name}</div>
                    {p.instavibe_handle && <div style={{ fontSize: 10, color: "#6b7280" }}>@{p.instavibe_handle}</div>}
                  </div>
                </button>
              ))}
              {tagQuery.length >= 2 && tagResults.length === 0 && <div style={{ padding: "10px 14px", fontSize: 12, color: "#4b5563" }}>No artists found</div>}
            </div>
          )}
          {showMusic && (
            <div style={{ margin: "8px 16px 0", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Link a release</div>
              {releasesWithMusic.length === 0
                ? <div style={{ padding: "12px 14px", fontSize: 12, color: "#4b5563" }}>No released music yet.</div>
                : releasesWithMusic.map(r => {
                    const isSel = selectedRelease?.id === r.id;
                    return (
                      <button key={r.id} onClick={() => { setSelectedRelease(isSel ? null : r); setShowMusic(false); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isSel ? "rgba(168,85,247,0.08)" : "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 18 }}>🎵</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isSel ? "#e9d5ff" : "#f0f0f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.title}</div>
                          <div style={{ fontSize: 10, color: "#6b7280" }}>{r.status}</div>
                        </div>
                        {isSel && <span style={{ fontSize: 10, color: "#a855f7" }}>✓</span>}
                      </button>
                    );
                  })
              }
            </div>
          )}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8 }}>
            <button onClick={() => { setShowMusic(s => !s); setShowTagging(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span>🎵</span><span style={{ fontSize: 13, color: "#d1d5db" }}>Add Music</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {selectedRelease && <span style={{ fontSize: 10, color: "#a855f7", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedRelease.name || selectedRelease.title}</span>}
                <span style={{ color: "#4b5563" }}>›</span>
              </div>
            </button>
            <button onClick={() => { setShowTagging(s => !s); setShowMusic(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span>👥</span><span style={{ fontSize: 13, color: "#d1d5db" }}>Tag People</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {taggedPeople.length > 0 && <span style={{ fontSize: 10, color: "#22d3ee" }}>{taggedPeople.length} tagged</span>}
                <span style={{ color: "#4b5563" }}>›</span>
              </div>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: sponsored ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div>
                <span style={{ fontSize: 13, color: "#d1d5db" }}>Mark as Sponsored</span>
                {sponsored && selectedBrand && <div style={{ fontSize: 10, color: "#a855f7", marginTop: 2 }}>{selectedBrand.emoji} {selectedBrand.brand}</div>}
              </div>
              <button onClick={handleToggleSponsored} style={{ width: 48, height: 28, borderRadius: 14, background: sponsored ? "#a855f7" : "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: sponsored ? 22 : 2, width: 24, height: 24, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </button>
            </div>
            {sponsored && (
              <div style={{ padding: "8px 16px 10px" }}>
                {acceptedDeals && acceptedDeals.length > 0 ? (
                  <>
                    <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>Select an active brand deal for this post</p>
                    <div className="modal-scroll" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                      {acceptedDeals.map(s => {
                        const rawScope = String(s._raw?.platform_scope || s._raw?.primary_platform || '').toLowerCase();
                        const scopeLabel = rawScope === 'cross_platform' ? 'All Platforms' : rawScope === 'instavibe' ? 'InstaVibe' : rawScope === 'looptok' ? 'LoopTok (wrong platform)' : rawScope === 'vidwave' ? 'VidWave (wrong platform)' : 'InstaVibe';
                        const isWrongPlatform = rawScope === 'looptok' || rawScope === 'vidwave';
                        return (
                        <button key={s._dbId} onClick={() => setSelectedBrand(s)}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: selectedBrand?._dbId === s._dbId ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)", border: selectedBrand?._dbId === s._dbId ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(255,255,255,0.06)", textAlign: "left", width: "100%", opacity: isWrongPlatform ? 0.5 : 1 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: selectedBrand?._dbId === s._dbId ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: selectedBrand?._dbId === s._dbId ? "#e9d5ff" : "#d1d5db" }}>{s.brand}</div>
                            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.description}</div>
                            <div style={{ fontSize: 9, color: isWrongPlatform ? "#f87171" : "#a78bfa", marginTop: 2 }}>({scopeLabel})</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: selectedBrand?._dbId === s._dbId ? "#c084fc" : "#9ca3af" }}>${s.basePayout.toLocaleString()}</span>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", border: selectedBrand?._dbId === s._dbId ? "none" : "1.5px solid rgba(255,255,255,0.15)", background: selectedBrand?._dbId === s._dbId ? "#a855f7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white" }}>{selectedBrand?._dbId === s._dbId ? "✓" : ""}</div>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 11, color: "#6b7280" }}>No active brand deals. Accept a deal from the Sponsors tab first.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────

export default function InstaVibeApp({ onClose, profile, releases, currentEra: _currentEra, initialTab, focusDealId: initialFocusDealId }) {
  const [tab,            setTab]            = useState(initialTab || "home");
  const [modalOpen,      setModalOpen]      = useState(false);
  const [isLive,         setIsLive]         = useState(false);
  const [clout,          setClout]          = useState(profile?.clout || 0);
  const [viewingProfile, setViewingProfile] = useState(null); // {id?, username?}
  const [feedPosts,      setFeedPosts]      = useState([]);
  const [feedError,      setFeedError]      = useState(false);
  const [posts,          setPosts]          = useState([]); // own posts
  const [account,        setAccount]        = useState(null);
  const [analyticsData,  setAnalyticsData]  = useState(null);
  const realtimeRef = useRef(null);
  const [brandDeals,     setBrandDeals]     = useState([]);
  const [offeredDeals,   setOfferedDeals]   = useState([]);
  const [allDeals,       setAllDeals]       = useState([]);
  const [contracts,      setContracts]      = useState([]);
  const [payoutLogs,     setPayoutLogs]     = useState([]);
  const [currentTurn,    setCurrentTurn]    = useState(null);
  const [loadingData,    setLoadingData]    = useState(true);
  const [posting,        setPosting]        = useState(false);
  const [postError,      setPostError]      = useState(null);
  const [focusDealId]    = useState(initialFocusDealId || null);

  // ── Direct DB feed loader (VidWave pattern — no edge function) ──
  const loadFeedDirect = useCallback(async (limit = 20) => {
    try {
      const { data: rawPosts, error } = await supabaseClient
        .from('social_posts')
        .select('id, artist_id, post_type, title, caption, views, likes, comments, like_count, comment_count, engagement_rate, revenue, status, linked_release_id, content_url, created_at, updated_at')
        .eq('platform', 'instavibe')
        .in('status', ['published', 'active'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const posts = Array.isArray(rawPosts) ? rawPosts : [];
      if (posts.length === 0) return [];

      // Batch-load author profiles (same pattern as VidWave)
      const artistIds = [...new Set(posts.map(p => p.artist_id).filter(Boolean))];
      const { data: authorProfiles } = artistIds.length > 0
        ? await supabaseClient
            .from('profiles')
            .select('id, artist_name, instavibe_handle, instavibe_avatar, artist_image, followers, instavibe_follower_count, career_stage')
            .in('id', artistIds)
        : { data: [] };

      // Check which posts the current user has liked
      let likedPostIds = new Set();
      if (profile?.id && posts.length > 0) {
        try {
          const { data: likes } = await supabaseClient
            .from('instavibe_post_likes')
            .select('post_id')
            .eq('liker_id', profile.id)
            .in('post_id', posts.map(p => p.id));
          likedPostIds = new Set((likes || []).map(l => l.post_id));
        } catch { /* non-fatal */ }
      }

      const profileMap = new Map((authorProfiles || []).map(p => [p.id, p]));

      // Batch-load linked releases so music tags show real song titles
      const releaseIds = [...new Set(posts.filter(p => p.linked_release_id).map(p => p.linked_release_id))];
      const { data: linkedReleases } = releaseIds.length > 0
        ? await supabaseClient.from('releases').select('id, title, release_name, cover_artwork_url').in('id', releaseIds)
        : { data: [] };
      const releaseMap = new Map((linkedReleases || []).map(r => [r.id, r]));

      return posts.map((p) => {
        const release = p.linked_release_id ? releaseMap.get(p.linked_release_id) || null : null;
        const author = profileMap.get(p.artist_id) || null;
        return {
          ...p,
          author,
          liked_by_me: likedPostIds.has(p.id),
          image: p.content_url || null,
          attached_release: release ? {
            id: release.id,
            title: release.title,
            release_name: release.release_name || release.title,
            cover_artwork_url: release.cover_artwork_url || release.artwork_url,
          } : null,
          musicTag: release
            ? `${release.release_name || release.title} · ${author?.instavibe_handle || author?.artist_name || ''}`
            : null,
        };
      });
    } catch (err) {
      console.error('[InstaVibe:loadFeedDirect] Failed:', err?.message || err);
      return [];
    }
  }, [profile?.id]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    const handler = () => { setTab("profile"); setModalOpen(true); };
    window.addEventListener("instavibe:openNewPost", handler);
    return () => window.removeEventListener("instavibe:openNewPost", handler);
  }, []);

  // ── Refresh feed from direct DB (no edge function) ──
  const loadFeed = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const rows = await loadFeedDirect(20);
      if (rows.length > 0) {
        setFeedPosts(rows);
        setFeedError(false);
      }
    } catch (e) {
      console.error('[InstaVibe:loadFeed] error (feed preserved):', e?.message || e);
    }
  }, [profile?.id, loadFeedDirect]);

  // ── Direct DB analytics (no edge function) ──
  const loadAnalytics = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // Aggregate from social_posts directly
      const { data: recentPosts } = await supabaseClient
        .from('social_posts')
        .select('views, likes, like_count, comment_count, engagement_rate, revenue, created_at')
        .eq('artist_id', profile.id)
        .eq('platform', 'instavibe')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);

      const rows = recentPosts || [];
      const totalReach = rows.reduce((s, p) => s + (p.views || 0), 0);
      const avgEngagement = rows.length > 0
        ? rows.reduce((s, p) => s + (p.engagement_rate || 0), 0) / rows.length
        : 0;
      const totalRevenue = rows.reduce((s, p) => s + (p.revenue || 0), 0);

      // Build weekly engagement from post dates
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklyMap = Object.fromEntries(dayNames.map(d => [d, 0]));
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const p of rows) {
        const d = new Date(p.created_at);
        if (d.getTime() >= oneWeekAgo) {
          weeklyMap[dayNames[d.getDay()]] += (p.like_count || p.likes || 0) + (p.comment_count || 0);
        }
      }

      setAnalyticsData({
        success: true,
        stats: {
          reach: totalReach,
          engagement: avgEngagement,
          revenue: totalRevenue,
          followers: account?.followers || 0,
        },
        weekly: dayNames.map(day => ({ day, value: weeklyMap[day] })),
      });
    } catch { /* non-fatal */ }
  }, [profile?.id, account?.followers]);

  // ── Main data loader: ALL direct DB reads, ZERO edge function calls ──
  const loadData = useCallback(async () => {
    if (!profile?.id) { setLoadingData(false); return; }
    try {
      // Parallel direct DB reads (VidWave pattern)
      const [feedRows, myPostsRes, accountRes, turnRes] = await Promise.all([
        loadFeedDirect(20),
        supabaseClient
          .from('social_posts')
          .select('id, artist_id, post_type, title, caption, views, likes, comments, like_count, comment_count, engagement_rate, revenue, status, linked_release_id, content_url, created_at, updated_at')
          .eq('artist_id', profile.id)
          .eq('platform', 'instavibe')
          .in('status', ['published', 'active'])
          .order('created_at', { ascending: false })
          .limit(50)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('social_accounts')
          .select('*')
          .eq('artist_id', profile.id)
          .eq('platform', 'instavibe')
          .limit(1)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('turn_state')
          .select('global_turn_id')
          .eq('id', 1)
          .maybeSingle()
          .then(r => r.data).catch(() => null),
      ]);

      // Set feed
      if (feedRows.length > 0) setFeedPosts(feedRows);

      // Set own posts
      setPosts(Array.isArray(myPostsRes) ? myPostsRes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []);

      // Set turn
      if (turnRes?.global_turn_id) setCurrentTurn(turnRes.global_turn_id);

      // Set or create account
      if (Array.isArray(accountRes) && accountRes.length > 0) {
        setAccount(accountRes[0]);
      } else {
        const { data: newAcc } = await supabaseClient
          .from('social_accounts')
          .insert({
            artist_id: profile.id,
            platform: 'instavibe',
            followers: Math.floor((profile.followers || 0) * 0.4),
          })
          .select()
          .single()
          .catch(() => ({ data: null }));
        if (newAcc) setAccount(newAcc);
      }

      // Load brand deals directly from DB (no edge function)
      try {
        const [dealsRes, contractsRes, payoutRes, loyaltyRes] = await Promise.all([
          supabaseClient
            .from('brand_deals')
            .select('*')
            .eq('artist_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(50)
            .then(r => r.data || []).catch(() => []),
          supabaseClient
            .from('brand_deal_contracts')
            .select('*')
            .eq('player_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(r => r.data || []).catch(() => []),
          supabaseClient
            .from('brand_deal_payout_log')
            .select('contract_id, amount, payout_type, created_at')
            .eq('player_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(100)
            .then(r => r.data || []).catch(() => []),
          supabaseClient
            .from('player_brand_affinity')
            .select('brand_key, affinity_score')
            .eq('player_id', profile.id)
            .then(r => r.data || []).catch(() => []),
        ]);

        const loyaltyByBrand = new Map((Array.isArray(loyaltyRes) ? loyaltyRes : []).map(row => [normalizeBrandKey(row.brand_key), getBrandLoyaltyTier(Math.max(-10, Math.min(10, Number(row.affinity_score) || 0)))]));
        const rawDeals = (Array.isArray(dealsRes) ? dealsRes : []).map(d => ({ ...d, loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(d.brand_name)) || 'neutral' }));
        const rawContracts = (Array.isArray(contractsRes) ? contractsRes : []).map(c => ({ ...c, loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(c.brand_name)) || 'neutral' }));
        const offered = rawDeals.filter(d => d.status === 'offered' && recordSupportsPlatform(d, 'instavibe')).slice(0, 10);
        const accepted = rawDeals.filter(d => isActiveContractStatus(d.status) || normalizeBrandDealStatus(d.status) === 'accepted');
        setOfferedDeals(offered.map(d => mapDbDealToUi(d)));
        setBrandDeals(accepted);
        setAllDeals(rawDeals);
        setContracts(rawContracts);
        setPayoutLogs(Array.isArray(payoutRes) ? payoutRes : []);
      } catch (bdErr) {
        console.warn('[InstaVibe] Brand deals load (non-fatal):', bdErr?.message);
        setOfferedDeals([]);
        setBrandDeals([]);
        setAllDeals([]);
        setPayoutLogs([]);
      }
    } catch (e) { console.error("[InstaVibe] Load error:", e); }
    finally { setLoadingData(false); }
  }, [profile?.id, loadFeedDirect]);

  useEffect(() => {
    loadData().then(() => loadAnalytics());
  }, [loadData, loadAnalytics]);

  // Realtime subscriptions
  useEffect(() => {
    if (!profile?.id || !supabaseClient) return;
    const client = supabaseClient;
    const ch = client
      .channel(`instavibe_rt_${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts', filter: `platform=eq.instavibe` }, () => {
        // Debounce: only refresh feed from direct DB, never edge function
        loadFeedDirect(20).then(rows => { if (rows.length > 0) setFeedPosts(rows); }).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instavibe_post_likes' }, (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
        const isMe = (payload.new?.liker_id || payload.old?.liker_id) === profile.id;
        setFeedPosts(prev => prev.map(p => p.id !== postId ? p : {
          ...p,
          like_count: Math.max(0, (p.like_count || 0) + delta),
          liked_by_me: payload.eventType === 'INSERT' && isMe ? true : payload.eventType === 'DELETE' && isMe ? false : p.liked_by_me,
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instavibe_post_comments' }, (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
        setFeedPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, comment_count: Math.max(0, (p.comment_count || 0) + delta) }));
      })
      .subscribe();
    realtimeRef.current = ch;
    return () => { client.removeChannel(ch); };
  }, [profile?.id, loadFeedDirect]);

  const handlePost = useCallback(async (postType, caption, sponsoredBrand = null, imageUrl = null, linkedReleaseId = null) => {
    if (!postType || !profile?.id || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'createInstaVibePost',
        artistId: profile.id,
        postType: postType.id,
        title: postType.label,
        caption: caption || `New ${postType.label.toLowerCase()}`,
        linkedReleaseId: linkedReleaseId || null,
        energyCost: postType.energyCost,
        imageUrl: (imageUrl && imageUrl.startsWith('https://')) ? imageUrl : null,
        alignmentTag: postType.alignmentTag || null,
        sponsoredBrand: sponsoredBrand?.brand || null,
        sponsoredDealId: sponsoredBrand?._dbId || null,
      });
      if (!result?.success) throw new Error(result?.error || 'Post failed');

      const post = result?.data?.socialPost;
      const perf = result?.data?.performance || {};
      if (!post) throw new Error('Post failed');

      const linkedRelease = linkedReleaseId
        ? (releases || []).find(r => r.id === linkedReleaseId) || null
        : null;
      const optimisticPost = {
        ...post,
        image: (imageUrl && imageUrl.startsWith('https://')) ? imageUrl : null,
        author: {
          id: profile.id,
          artist_name: profile.artist_name,
          instavibe_handle: profile.instavibe_handle,
          instavibe_avatar: profile.instavibe_avatar || profile.artist_image,
          artist_image: profile.artist_image,
        },
        liked_by_me: false,
        like_count: perf.likes ?? post.likes ?? 0,
        comment_count: perf.comments ?? post.comments ?? 0,
        attached_release: linkedRelease ? {
          id: linkedRelease.id,
          title: linkedRelease.title,
          release_name: linkedRelease.release_name,
          cover_artwork_url: linkedRelease.cover_artwork_url,
          project_type: linkedRelease.project_type,
        } : null,
        musicTag: linkedRelease
          ? `${linkedRelease.release_name || linkedRelease.title} - ${profile.instavibe_handle || profile.artist_name}`
          : null,
      };
      setFeedPosts(prev => [optimisticPost, ...prev]);

      loadFeed();
      loadAnalytics();
      supabaseClient
        .from('social_posts')
        .select('id, artist_id, post_type, title, caption, views, likes, comments, like_count, comment_count, engagement_rate, revenue, status, linked_release_id, content_url, created_at, updated_at')
        .eq('artist_id', profile.id)
        .eq('platform', 'instavibe')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => setPosts(Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []))
        .catch(() => {});
    } catch (e) {
      console.error("[InstaVibe] Post error:", e?.message || e);
      setPostError(e?.message || "Post failed");
    } finally { setPosting(false); }
  }, [profile?.id, posting, releases, loadFeed, loadAnalytics]);

  const handleCompleteDeal = useCallback(async (deal) => {
    if (!deal._dbId) return;
    await base44.functions.invoke("socialMedia", {
      action: "completeInstaVibeBrandDeal",
      artistId: profile.id,
      dealId: deal._dbId,
    }).catch(e => console.warn("[InstaVibe] Complete deal (non-fatal):", e.message));
    await loadData();
  }, [profile?.id, loadData]);

  const handleAcceptDeal = useCallback(async (deal, payout) => {
    if (!deal._dbId) return;
    try {
      const { data: tsRow } = await supabaseClient
        .from('turn_state')
        .select('global_turn_id')
        .eq('id', 1)
        .maybeSingle()
        .catch(() => ({ data: null }));
      const globalTurnId = tsRow?.global_turn_id || currentTurn || 0;
      const result = await base44.functions.invoke("socialMedia", {
        action: "acceptInstaVibeBrandDeal",
        artistId: profile.id,
        dealId: deal._dbId,
        globalTurnId,
      });
      if (result?.success) {
        setOfferedDeals(prev => prev.filter(d => d._dbId !== deal._dbId));
        const gain = result.cloutGain ?? Math.round(payout / 100);
        setClout(c => c + gain);
      }
      // Reload contracts + deals from DB to reflect accepted state
      await loadData();
    } catch (e) { console.error("[InstaVibe] Deal accept error:", e); }
  }, [profile?.id, currentTurn, loadData]);

  const handleDeclineDeal = useCallback(async (deal) => {
    if (!deal._dbId) return;
    try {
      await base44.functions.invoke("socialMedia", {
        action: "declineInstaVibeBrandDeal",
        artistId: profile.id,
        dealId: deal._dbId,
      });
      setOfferedDeals(prev => prev.filter(d => d._dbId !== deal._dbId));
    } catch (e) { console.error("[InstaVibe] Deal decline error:", e); }
  }, [profile?.id]);

  const handleCloutGain = useCallback((amount) => setClout(c => c + amount), []);

  const handleViewProfile = useCallback((profileIdOrUsername) => {
    if (!profileIdOrUsername) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(profileIdOrUsername));
    setViewingProfile(isUuid ? { id: profileIdOrUsername } : { username: String(profileIdOrUsername) });
  }, []);

  const titles = { home: "InstaVibe", broadcast: "Broadcast", brand_deals: "Brand Deals", analytics: "Analytics", profile: "Profile" };
  const cloutTier = getCloutTier(clout);

  const realProfile = {
    id: profile?.id,
    username: profile?.instavibe_handle || profile?.artist_name?.toLowerCase().replace(/\s+/g, ".") || "artist",
    verified: (profile?.followers || 0) >= 1000,
    avatar: profile?.instavibe_avatar || profile?.artist_image || AVATAR_OPTIONS[0],
    posts: posts.length,
    followers: profile?.instavibe_follower_count || account?.followers || profile?.followers || 0,
    following: profile?.instavibe_following_count || 0,
    bio: profile?.instavibe_bio || profile?.bio || `${profile?.genre || "Music"} Artist\n${profile?.region || ""}`,
    dbPosts: posts,
  };

  const analyticsStats = analyticsData ? [
    { label: "Reach",      value: analyticsData.stats?.reach >= 1000 ? `${(analyticsData.stats.reach / 1000).toFixed(1)}K` : String(analyticsData.stats?.reach || 0), change: "+0%", icon: "👁️" },
    { label: "Engagement", value: `${(analyticsData.stats?.engagement || 0).toFixed(1)}%`, change: "+0%", icon: "📈" },
    { label: "Revenue",    value: `$${(analyticsData.stats?.revenue || 0).toFixed(0)}`, change: "+0%", icon: "💰" },
    { label: "Followers",  value: `+${analyticsData.stats?.followers || 0}`, change: "+0%", icon: "👥" },
  ] : [
    { label: "Reach",      value: account?.total_views ? `${(account.total_views / 1000).toFixed(1)}K` : "0", change: "+0%", icon: "👁️" },
    { label: "Engagement", value: posts.length > 0 ? `${(posts.reduce((s, p) => s + (p.engagement_rate || 0), 0) / posts.length).toFixed(1)}%` : "0%", change: "+0%", icon: "📈" },
    { label: "Revenue",    value: `$${(account?.total_revenue || 0).toFixed(0)}`, change: "+0%", icon: "💰" },
    { label: "Followers",  value: `+${account?.followers || 0}`, change: "+0%", icon: "👥" },
  ];

  const weeklyData = analyticsData?.weekly || null;

  // Auto-dismiss postError after 5s
  useEffect(() => {
    if (!postError) return;
    const t = setTimeout(() => setPostError(null), 5000);
    return () => clearTimeout(t);
  }, [postError]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0f", zIndex: 50, display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`.modal-scroll::-webkit-scrollbar{display:none}.modal-scroll{-ms-overflow-style:none;scrollbar-width:none}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Error toast */}
      {postError && (
        <div style={{ position: "absolute", top: 60, left: 16, right: 16, zIndex: 200, background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: "#fca5a5", flex: 1 }}>{postError}</span>
          <button onClick={() => setPostError(null)} style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,10,15,0.98)", flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#f0f0f5" }}>{titles[tab]}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tab === "home" && <>
            <button onClick={() => setIsLive(true)} style={{ fontSize: 10, fontWeight: 700, color: "white", background: "#ef4444", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>● Go Live</button>
            <button onClick={() => setModalOpen(true)} style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>➕</button>
          </>}
          {tab === "broadcast" && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, background: "rgba(34,197,94,0.1)", borderRadius: 20, padding: "3px 10px" }}>● Live</span>}
          {(tab === "brand_deals" || tab === "sponsorships") && clout > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: cloutTier.color, background: `${cloutTier.color}18`, borderRadius: 20, padding: "3px 10px" }}>🔥 {clout.toLocaleString()} Clout</div>}
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      </div>

      {/* Content */}
      {loadingData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 24, height: 24, border: "2px solid rgba(168,85,247,0.3)", borderTop: "2px solid #a855f7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div className="modal-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
          {tab === "home" && (
            <>
              {feedError && (
                <div style={{ margin: "10px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12 }}>⚠️</span>
                  <span style={{ fontSize: 12, color: "#fbbf24" }}>Connection issue - showing cached feed</span>
                </div>
              )}
              <Feed onViewProfile={handleViewProfile} posts={feedPosts} artistId={profile?.id} onPostsChange={setFeedPosts} />
            </>
          )}
          {tab === "broadcast"    && <Broadcast profile={realProfile} artistId={profile?.id} />}
          {tab === "brand_deals"  && <Sponsorships
            onCloutGain={handleCloutGain}
            onAcceptDeal={handleAcceptDeal}
            onDeclineDeal={handleDeclineDeal}
            onCompleteDeal={handleCompleteDeal}
            existingDeals={brandDeals}
            offeredDeals={offeredDeals}
            allDeals={allDeals}
            contracts={contracts}
            payoutLogs={payoutLogs}
            currentTurn={currentTurn}
            focusDealId={focusDealId}
          />}
          {tab === "analytics"    && <Analytics stats={analyticsStats} posts={posts} weekly={weeklyData} />}
          {tab === "profile"      && <Profile clout={clout} profileData={realProfile} baseProfile={profile} />}
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,10,15,0.98)", display: "flex", minHeight: 64, alignItems: "center", justifyContent: "space-around", padding: "0 4px", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0 }}>
        {NAV.map(item => {
          const active = tab === item.id;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: "4px 0", minHeight: 48 }}>
              <span style={{ fontSize: 18, filter: active ? "none" : "grayscale(1) opacity(0.5)" }}>{item.emoji}</span>
              <span style={{ fontSize: 9, fontWeight: 500, color: active ? "#c084fc" : "#6b7280" }}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Modals - rendered outside the content area */}
      {modalOpen && !isLive && <CreateModal open={modalOpen} onClose={() => setModalOpen(false)} onPost={handlePost} posting={posting} acceptedDeals={contracts.filter(c => isActiveContractStatus(c.status) && recordSupportsPlatform(c, 'instavibe')).map(c => mapDbContractToUi(c))} releases={releases} />
      }
      {isLive && <GoLiveOverlay onEnd={() => setIsLive(false)} profile={profile} />}
      {viewingProfile && (
        <OtherProfile
          profileId={viewingProfile.id}
          username={viewingProfile.username}
          onBack={() => setViewingProfile(null)}
          viewerArtistId={profile?.id}
        />
      )}
    </div>
  );
}
