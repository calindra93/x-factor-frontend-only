import React, { useState, useRef, useEffect } from "react";
import { MoreVertical, MessageSquare, Repeat2, Heart, BarChart2, Star, Eye, Pin, Sparkles, Flag, Ban, Trash2 } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";

// NOTE: supabaseClient is still used for read-only queries (loadMyLikesAndReposts, loadProfileMap)
// All write operations go through base44.functions.invoke('socialMedia', ...)

/* ═══════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════ */
export function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ═══════════════════════════════════════════════════════
   PROFILE AVATAR
   ═══════════════════════════════════════════════════════ */
const SIZES = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16", xl: "w-20 h-20" };

const NPC_AVATAR_OVERRIDES = {
  '@TheShadeRoom': '/npc-avatars/the-shade-room.png',
  '@Akademiks': '/npc-avatars/dj-akademiks.png',
  '@PopCrave': '/npc-avatars/pop-crave.png',
  '@XXL': '/npc-avatars/xxl-magazine.png',
  '@ComplexMusic': '/npc-avatars/complex-music.png',
  '@HollywoodUL': '/npc-avatars/hollywood-unlocked.png',
  '@RapAlert': '/npc-avatars/rap-alert.png',
  '@DailyRapFacts': '/npc-avatars/daily-rap-facts.png',
  '@NoJumperNews': '/npc-avatars/no-jumper-news.png',
  '@WorldStarHipHop': '/npc-avatars/worldstarhiphop.png',
  '@BET': '/npc-avatars/bet.png',
  '@TMZ': '/npc-avatars/tmz.png',
  '@LipstickAlley': '/npc-avatars/lipstick-alley.png',
  '@Onsite': '/npc-avatars/onsite.png',
};

function resolveNpcAvatarUrl(post) {
  const handle = post?.metadata?.media_outlet_handle || post?.metadata?.platform_handle || post?.metadata?.npc_handle || null;
  if (handle && NPC_AVATAR_OVERRIDES[handle]) return NPC_AVATAR_OVERRIDES[handle];
  return post?.metadata?.platform_pfp || post?.metadata?.media_outlet_icon || post?.metadata?.reaction_channel_icon || null;
}

export function ProfileAvatar({ src, alt = "", size = "md" }) {
  const dim = SIZES[size] || SIZES.md;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  return (
    <div className={`relative ${dim} flex-shrink-0`}>
      <div className={`${dim} rounded-full overflow-hidden bg-gray-800 border border-white/10`}>
        {src && !imgFailed ? (
          <img src={src} alt={alt} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
            {alt?.charAt(0)?.toUpperCase() || "?"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TOP NAVIGATION BAR
   ═══════════════════════════════════════════════════════ */
export function TopNavigationBar({ title = null, leftIcon = null, rightIcon = null, onLeftClick = null, onRightClick = null, centerContent = null, leftContent = null }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/90 backdrop-blur-xl flex-shrink-0">
      <div className="flex items-center gap-3 min-w-[40px]">
        {leftContent || (
          leftIcon && (
            <button onClick={onLeftClick} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
              {leftIcon}
            </button>
          )
        )}
      </div>
      <div className="flex-1 text-center">
        {centerContent || (title && <h1 className="text-white text-base font-bold">{title}</h1>)}
      </div>
      <div className="flex items-center gap-2 min-w-[40px] justify-end">
        {rightIcon && (
          <button onClick={onRightClick} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            {rightIcon}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SOCIAL POST CARD (MULTIPLAYER)
   Real like/repost via Supabase, cross-player interactions
   ═══════════════════════════════════════════════════════ */
export function SocialPostCard({
  post,
  authorProfile,
  currentPlayerId,
  isRepost = false,
  repostByName = "",
  onViewCampaign = null,
  onProfileClick = null,
  onLikeToggle = null,
  onRepost = null,
  onQuotePost = null,
  onViewComments = null,
  onDeletePost = null,
  myLikes = new Set(),
  myReposts = new Set(),
  referencedPost = null,
  referencedAuthor = null,
}) {
  const [localLiked, setLocalLiked] = useState(myLikes.has(post?.id));
  const [localReposted, setLocalReposted] = useState(myReposts.has(post?.id));
  const [localLikeCount, setLocalLikeCount] = useState(post?.likes || 0);
  const [localRepostCount, setLocalRepostCount] = useState(post?.shares || 0);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const repostMenuRef = useRef(null);
  const optionsMenuRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (repostMenuRef.current && !repostMenuRef.current.contains(e.target)) setShowRepostMenu(false);
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target)) setShowOptionsMenu(false);
    };
    if (showRepostMenu || showOptionsMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRepostMenu, showOptionsMenu]);

  const isQuotePost = post?.post_type === "quote" && referencedPost;
  const isRepostPost = post?.post_type === "repost" && referencedPost;
  const displayPost = isRepostPost ? referencedPost : post;
  const displayAuthor = isRepostPost ? referencedAuthor : authorProfile;

  const isAd = displayPost?.is_promoted || displayPost?.metadata?.is_ad;
  const hasCampaign = displayPost?.metadata?.campaign_id || displayPost?.is_promoted;
  
  // Handle NPC posts (artist_id is null)
  const isNpcPost = !displayPost?.artist_id || displayPost?.source_type === 'npc_reaction' || displayPost?.source_type === 'media_platform';
  const outletName = displayPost?.metadata?.media_outlet_name || displayPost?.metadata?.platform_name || displayPost?.metadata?.reaction_channel_name || displayPost?.metadata?.npc_username || 'Fan Account';
  const npcUsername = outletName;
  const npcHandle = displayPost?.metadata?.media_outlet_handle || displayPost?.metadata?.platform_handle || displayPost?.metadata?.npc_handle || `@${outletName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  
  const avatarUrl = isNpcPost
    ? resolveNpcAvatarUrl(displayPost)
    : displayAuthor?.artist_image;
  const username = isNpcPost ? npcUsername : (displayAuthor?.artist_name || "Unknown");
  const handle = isNpcPost 
    ? npcHandle 
    : (displayAuthor?.xpress_handle
        ? `@${displayAuthor.xpress_handle}`
        : `@${(displayAuthor?.artist_name || "").replace(/\s+/g, "")}`);

  const handleProfileNavigation = (e) => {
    e?.stopPropagation?.();
    if (!displayPost?.artist_id) return;
    onProfileClick?.(displayPost.artist_id);
  };

  const renderContent = (text) => {
    if (!text) return null;
    const parts = text.split(/(#\w+|@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("#") || part.startsWith("@")) {
        return (
          <span key={i} className="text-red-400 cursor-pointer hover:underline"
            onClick={(e) => { e.stopPropagation(); if (part.startsWith("@") && onProfileClick) onProfileClick(part.slice(1)); }}>
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!currentPlayerId || !displayPost?.id) return;
    const wasLiked = localLiked;
    setLocalLiked(!wasLiked);
    setLocalLikeCount(prev => wasLiked ? prev - 1 : prev + 1);
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'xpressLike',
        postId: displayPost.id,
        playerId: currentPlayerId,
        unlike: wasLiked,
      });
      onLikeToggle?.(displayPost.id, !wasLiked);
    } catch (err) {
      console.warn("[Xpress] Like error:", err?.message);
      setLocalLiked(wasLiked);
      setLocalLikeCount(prev => wasLiked ? prev + 1 : prev - 1);
    }
  };

  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    if (!currentPlayerId || !displayPost?.id || localReposted) return;
    setLocalReposted(true);
    setLocalRepostCount(prev => prev + 1);
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'xpressRepost',
        postId: displayPost.id,
        playerId: currentPlayerId,
      });
      onRepost?.(displayPost.id);
    } catch (err) {
      if (!err?.message?.includes("duplicate")) {
        console.warn("[Xpress] Repost error:", err?.message);
        setLocalReposted(false);
        setLocalRepostCount(prev => prev - 1);
      }
    }
  };

  const handleQuote = () => {
    setShowRepostMenu(false);
    onQuotePost?.(displayPost);
  };

  const isOwnPost = !!currentPlayerId && displayPost?.artist_id === currentPlayerId;

  const handleDeletePost = async () => {
    if (!isOwnPost || !displayPost?.id) return;
    const confirmed = window.confirm("Delete this post? This can’t be undone.");
    if (!confirmed) return;

    setShowOptionsMenu(false);

    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'xpressDeletePost',
        postId: displayPost.id,
        playerId: currentPlayerId,
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Delete failed');
      }

      await onDeletePost?.(displayPost.id, result?.deletedPostIds || []);
    } catch (err) {
      console.warn("[Xpress] Delete post error:", err?.message || err);
    }
  };

  const repostAuthorName = isRepostPost
    ? (authorProfile?.xpress_handle || (authorProfile?.artist_name || "").replace(/\s+/g, ""))
    : repostByName;

  return (
    <div className="border-b border-white/[0.06] px-4 py-3">
      {/* Repost banner */}
      {(isRepost || isRepostPost) && repostAuthorName && (
        <div className="flex items-center gap-2 mb-1.5 ml-10">
          <Repeat2 className="w-3 h-3 text-gray-500" />
          <span className="text-gray-500 text-[11px] font-medium">@{repostAuthorName} reposted</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-1">
        <div className="flex items-start gap-1 min-w-0 flex-1">
          <button onClick={handleProfileNavigation} className="flex-shrink-0">
            <ProfileAvatar src={avatarUrl} alt={username} size="md" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="min-w-0 leading-none">
              <div className="flex items-baseline gap-0.5 min-w-0 leading-none flex-wrap">
                <button onClick={handleProfileNavigation} className="inline p-0 m-0 border-0 bg-transparent align-baseline text-white text-[13px] leading-none font-bold truncate hover:underline">{username}</button>
                {(isRepost || isRepostPost) && <Repeat2 className="w-3 h-3 text-green-500 flex-shrink-0" />}
                <span className="text-gray-500 text-[11px] leading-none truncate">{handle}</span>
                <span className="text-gray-600 text-[11px] leading-none flex-shrink-0">·</span>
                <span className="text-gray-500 text-[11px] leading-none flex-shrink-0">{timeAgo(displayPost?.created_at)}</span>
              </div>
            </div>

            {/* Post content */}
            <div className="mt-1">
            <p className="text-white text-[13px] leading-[1.4] whitespace-pre-wrap">
              {renderContent(displayPost?.caption || displayPost?.title || "")}
            </p>
            </div>

            {/* Post image */}
            {displayPost?.thumbnail_url && (
              <div className="mt-2.5 rounded-xl overflow-hidden border border-white/[0.06]">
                <img src={displayPost.thumbnail_url} alt="" className="w-full object-cover max-h-72" />
              </div>
            )}

            {/* Quote embed — for quote posts */}
            {isQuotePost && referencedPost && (
              <div className="mt-2.5 rounded-xl border border-white/[0.08] p-3 bg-white/[0.02]">
                <div className="flex items-center gap-1.5 mb-1">
                  <ProfileAvatar src={referencedAuthor?.artist_image} alt={referencedAuthor?.artist_name} size="sm" />
                  <span className="text-white text-[12px] font-bold">{referencedAuthor?.artist_name || "Unknown"}</span>
                  <span className="text-gray-500 text-[11px]">
                    {referencedAuthor?.xpress_handle ? `@${referencedAuthor.xpress_handle}` : ""}
                  </span>
                  <span className="text-gray-600 text-[11px]">{timeAgo(referencedPost.created_at)}</span>
                </div>
                <p className="text-gray-300 text-[12px] leading-[1.3] whitespace-pre-wrap">
                  {renderContent(referencedPost.caption || referencedPost.title || "")}
                </p>
                {referencedPost.thumbnail_url && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.06]">
                    <img src={referencedPost.thumbnail_url} alt="" className="w-full object-cover max-h-40" />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-5 mt-2.5">
            {/* Comments */}
            <button onClick={(e) => { e.stopPropagation(); onViewComments?.(displayPost); }} className="flex items-center gap-1.5 text-gray-500 hover:text-blue-400 transition-colors">
              <MessageSquare className="w-[15px] h-[15px]" />
              <span className="text-[12px]">{fmtNum(displayPost?.comments || 0)}</span>
            </button>

            {/* Repost (with dropdown) */}
            <div className="relative" ref={repostMenuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowRepostMenu(!showRepostMenu); setShowOptionsMenu(false); }}
                className={`flex items-center gap-1.5 transition-colors ${localReposted ? "text-green-400" : "text-gray-500 hover:text-green-400"}`}
              >
                <Repeat2 className="w-[15px] h-[15px]" />
                <span className="text-[12px]">{fmtNum(localRepostCount)}</span>
              </button>
              {showRepostMenu && (
                <div className="absolute left-0 bottom-8 w-36 bg-[#1a1a24] border border-white/[0.1] rounded-xl shadow-2xl z-30 overflow-hidden">
                  <button onClick={handleDirectRepost} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                    <Repeat2 className="w-4 h-4 text-green-400" /><span className="text-white text-[13px]">Repost</span>
                  </button>
                  <button onClick={handleQuote} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                    <MessageSquare className="w-4 h-4 text-white" /><span className="text-white text-[13px]">Quote</span>
                  </button>
                </div>
              )}
            </div>

            {/* Like */}
            <button onClick={handleLike} className={`flex items-center gap-1.5 transition-colors ${localLiked ? "text-red-400" : "text-gray-500 hover:text-red-400"}`}>
              <Heart className={`w-[15px] h-[15px] ${localLiked ? "fill-red-400" : ""}`} />
              <span className="text-[12px]">{fmtNum(localLikeCount)}</span>
            </button>

            {/* Views */}
            <button className="flex items-center gap-1.5 text-gray-500 hover:text-blue-400 transition-colors">
              <BarChart2 className="w-[15px] h-[15px]" />
              <span className="text-[12px]">{fmtNum(displayPost?.views || 0)}</span>
            </button>
            </div>

            {hasCampaign && onViewCampaign && (
              <button
                onClick={() => onViewCampaign(displayPost)}
                className="mt-2.5 w-full flex items-center justify-center gap-2 py-2 rounded-full border border-red-400/40 text-red-400 text-[12px] font-semibold hover:bg-red-400/5 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                View Campaign Analytics
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 self-start">
          {isAd && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold">
              <Star className="w-2.5 h-2.5" /> Ad
            </span>
          )}
          <div className="relative" ref={optionsMenuRef}>
            <button onClick={() => { setShowOptionsMenu(!showOptionsMenu); setShowRepostMenu(false); }} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            {showOptionsMenu && (
              <div className="absolute right-0 top-8 w-44 bg-[#1a1a24] border border-white/[0.1] rounded-xl shadow-2xl z-30 overflow-hidden">
                <button onClick={() => setShowOptionsMenu(false)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                  <Pin className="w-4 h-4 text-white" /><span className="text-white text-[13px]">Pin to Profile</span>
                </button>
                <button onClick={() => setShowOptionsMenu(false)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                  <Sparkles className="w-4 h-4 text-yellow-400" /><span className="text-white text-[13px]">Highlight</span>
                </button>
                <div className="border-t border-white/[0.06]" />
                <button onClick={() => setShowOptionsMenu(false)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                  <Flag className="w-4 h-4 text-orange-400" /><span className="text-white text-[13px]">Report Post</span>
                </button>
                <button onClick={() => setShowOptionsMenu(false)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                  <Ban className="w-4 h-4 text-red-400" /><span className="text-red-400 text-[13px]">Block User</span>
                </button>
                {isOwnPost && (
                  <>
                    <div className="border-t border-white/[0.06]" />
                    <button onClick={handleDeletePost} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.04] text-left">
                      <Trash2 className="w-4 h-4 text-red-400" /><span className="text-red-400 text-[13px]">Delete Post</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB BAR (reusable horizontal tabs with underline)
   ═══════════════════════════════════════════════════════ */
export function XpressTabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="flex border-b border-white/[0.06]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-center text-[13px] font-semibold transition-colors relative ${
            activeTab === tab.id ? "text-red-400" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-red-400" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   POST PERFORMANCE CALCULATOR — REMOVED
   All Xpress performance calculations now happen server-side
   in xpressHandler.ts via the socialMedia edge function.
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SUPABASE HELPERS for multiplayer queries
   ═══════════════════════════════════════════════════════ */
export async function loadMyLikesAndReposts(playerId) {
  const likes = new Set();
  const reposts = new Set();
  if (!playerId) return { likes, reposts };
  try {
    const [{ data: likeRows }, { data: repostRows }] = await Promise.all([
      supabaseClient.from("xpress_likes").select("post_id").eq("liker_id", playerId),
      supabaseClient.from("xpress_reposts").select("original_post_id").eq("reposter_id", playerId),
    ]);
    (likeRows || []).forEach(r => likes.add(r.post_id));
    (repostRows || []).forEach(r => reposts.add(r.original_post_id));
  } catch (e) { console.warn("[Xpress] Load interactions error:", e?.message); }
  return { likes, reposts };
}

export async function loadProfileMap(artistIds) {
  const map = {};
  if (!artistIds?.length) return map;
  try {
    const { data } = await supabaseClient.from("profiles").select("*").in("id", artistIds);
    (data || []).forEach(p => { map[p.id] = p; });
  } catch (e) { console.warn("[Xpress] Load profiles error:", e?.message); }
  return map;
}

export function getOrCreateConversation(participantA, participantB) {
  const [a, b] = [participantA, participantB].sort();
  return supabaseClient
    .from("xpress_conversations")
    .upsert({ participant_a: a, participant_b: b }, { onConflict: "participant_a,participant_b" })
    .select("*")
    .single();
}
