import React, { useState, useEffect, useCallback, useRef } from "react";
import { Home, User, Bell, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import { loadMyLikesAndReposts, loadProfileMap
} from "./XpressShared";
import XpressFeed from "./XpressFeed";
import XpressProfile from "./XpressProfile";
import XpressNotifications from "./XpressNotifications";
import XpressMessages from "./XpressMessages";
import NewXpressPost from "./NewXpressPost";
import { QuotePostModal, CommentsThread } from "./XpressInteractions";
// MediaFeed removed - NPC posts now appear directly in feed

/* ═══════════════════════════════════════════════════════
   BOTTOM NAV — internal to Xpress app
   ═══════════════════════════════════════════════════════ */
const BOTTOM_NAV = [
  { id: "feed", icon: Home, label: "Home" },
  { id: "profile", icon: User, label: "Profile" },
  { id: "notifications", icon: Bell, label: "Alerts" },
  { id: "messages", icon: Mail, label: "Messages" },
];

const XPRESS_FEED_LIMIT = 30;
const XPRESS_FEED_FETCH_LIMIT = 150;

function isRealPlayerXpressPost(post) {
  return !!post?.artist_id
    && post?.source_type !== 'npc_reaction'
    && post?.source_type !== 'media_platform'
    && !post?.metadata?.is_npc;
}

function getLatestGlobalRealXpressPosts(posts) {
  return [...(posts || [])]
    .filter(isRealPlayerXpressPost)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, XPRESS_FEED_LIMIT);
}

function XpressBottomNav({ activeView, onNavigate, unreadNotifs, unreadMessages }) {
  return (
    <div className="flex items-center justify-around border-t border-white/[0.06] bg-black/95 backdrop-blur-xl px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex-shrink-0">
      {BOTTOM_NAV.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        const badge = item.id === "notifications" ? unreadNotifs : item.id === "messages" ? unreadMessages : 0;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="relative flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] py-1"
          >
            <Icon className={`w-5 h-5 ${isActive ? "text-red-400" : "text-gray-500"}`} />
            <span className={`text-[9px] font-medium ${isActive ? "text-red-400" : "text-gray-600"}`}>{item.label}</span>
            {badge > 0 && (
              <div className="absolute -top-0.5 right-1 min-w-[14px] h-3.5 bg-red-500 rounded-full flex items-center justify-center px-0.5">
                <span className="text-white text-[8px] font-bold">{badge > 9 ? "9+" : badge}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN XPRESS APP
   ═══════════════════════════════════════════════════════ */
export default function XpressApp({ onClose, profile, releases, currentEra }) {
  // Navigation state
  const [view, setView] = useState("feed");
  const [viewStack, setViewStack] = useState([]);  // for back navigation
  const [showCompose, setShowCompose] = useState(false);

  // Interaction modals
  const [quotingPost, setQuotingPost] = useState(null);     // post being quoted
  const [commentingPost, setCommentingPost] = useState(null); // post viewing comments

  // Data state
  const [account, setAccount] = useState(null);
  const [allPosts, setAllPosts] = useState([]);     // all players' xpress posts
  const [profileMap, setProfileMap] = useState({});  // artist_id → profile
  const [referencedPosts, setReferencedPosts] = useState({}); // post_id → post (for reposts/quotes)
  const [myLikes, setMyLikes] = useState(new Set());
  const [myReposts, setMyReposts] = useState(new Set());
  const [myFollowing, setMyFollowing] = useState(new Set());
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Profile viewing (for viewing other players)
  const [viewingProfileId, setViewingProfileId] = useState(null);

  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    loadData();
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const refreshAccount = async () => {
    if (!profile?.id) return;
    try {
      const existing = await base44.entities.SocialAccount?.filter({ artist_id: profile.id, platform: 'xpress' }) || [];
      if (existing.length > 0) {
        if (activeRef.current) setAccount(existing[0]);
        return;
      }

      const created = await base44.entities.SocialAccount?.create({
        artist_id: profile.id,
        platform: 'xpress',
        followers: Math.floor((profile.followers || 0) * 0.25),
      });
      if (activeRef.current && created) setAccount(created);
    } catch (e) {
      console.warn("[Xpress] Refresh account error:", e?.message || e);
    }
  };

  const loadData = async () => {
    try {
      if (!profile?.id) { setLoading(false); return; }

      // 1. Load or create xpress social account via entities (VidWave-style bootstrap)
      await refreshAccount();

      // 2. Load ALL xpress posts from ALL players (global feed) — limit 50 recent
      const { data: posts } = await supabaseClient
        .from("social_posts")
        .select("*")
        .in("platform", ["xpress", "X"])
        .eq("status", "published")
        .not("artist_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(XPRESS_FEED_FETCH_LIMIT);

      const latestRealPosts = getLatestGlobalRealXpressPosts(posts || []);
      if (activeRef.current) setAllPosts(latestRealPosts);

      // 2b. Load referenced posts (for reposts/quotes)
      const refArtistIds = [];
      const refIds = [...new Set(latestRealPosts.map(p => p.reacting_to_post_id).filter(Boolean))];
      if (refIds.length > 0) {
        const { data: refPosts } = await supabaseClient.from("social_posts").select("*").in("id", refIds);
        const refMap = {};
        (refPosts || []).forEach(p => { refMap[p.id] = p; if (p.artist_id) refArtistIds.push(p.artist_id); });
        if (activeRef.current) setReferencedPosts(refMap);
      }

      // 3. Collect unique artist IDs and bulk-load profiles
      const artistIds = [...new Set([...latestRealPosts.map(p => p.artist_id).filter(Boolean), ...refArtistIds])];
      if (!artistIds.includes(profile.id)) artistIds.push(profile.id);
      const pMap = await loadProfileMap(artistIds);
      if (activeRef.current) setProfileMap(pMap);

      // 4. Load my likes & reposts
      const { likes, reposts } = await loadMyLikesAndReposts(profile.id);
      if (activeRef.current) { setMyLikes(likes); setMyReposts(reposts); }

      // 5. Load my following list
      const { data: followRows } = await supabaseClient
        .from("xpress_follows")
        .select("following_id")
        .eq("follower_id", profile.id);
      if (activeRef.current) {
        setMyFollowing(new Set((followRows || []).map(r => r.following_id)));
      }

      // 6. Count unread notifications
      const { count: nCount } = await supabaseClient
        .from("xpress_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("is_read", false);
      if (activeRef.current) setUnreadNotifs(nCount || 0);

      // 7. Count unread messages
      const { data: convos } = await supabaseClient
        .from("xpress_conversations")
        .select("id")
        .or(`participant_a.eq.${profile.id},participant_b.eq.${profile.id}`);
      if (convos?.length > 0) {
        const convoIds = convos.map(c => c.id);
        const { count: mCount } = await supabaseClient
          .from("xpress_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convoIds)
          .neq("sender_id", profile.id)
          .eq("is_read", false);
        if (activeRef.current) setUnreadMessages(mCount || 0);
      }

    } catch (e) {
      console.error("[Xpress] Load error:", e);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data } = await supabaseClient.from("profiles").select("*").eq("id", profile.id).single();
      if (data) setProfileMap(prev => ({ ...prev, [profile.id]: data }));
    } catch (e) { console.warn("[Xpress] Refresh profile error:", e?.message); }
  }, [profile?.id]);

  const refreshFeed = useCallback(async () => {
    try {
      const { data: posts } = await supabaseClient
        .from("social_posts")
        .select("*")
        .in("platform", ["xpress", "X"])
        .eq("status", "published")
        .not("artist_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(XPRESS_FEED_FETCH_LIMIT);
      const latestRealPosts = getLatestGlobalRealXpressPosts(posts || []);
      setAllPosts(latestRealPosts);
      // Load referenced posts
      const rIds = [...new Set(latestRealPosts.map(p => p.reacting_to_post_id).filter(Boolean))];
      const extraArtistIds = [];
      if (rIds.length > 0) {
        const { data: rp } = await supabaseClient.from("social_posts").select("*").in("id", rIds);
        const rm = {};
        (rp || []).forEach(p => { rm[p.id] = p; if (p.artist_id) extraArtistIds.push(p.artist_id); });
        setReferencedPosts(rm);
      }
      // Refresh profile map for any new artists
      const artistIds = [...new Set([...latestRealPosts.map(p => p.artist_id).filter(Boolean), ...extraArtistIds])];
      if (!artistIds.includes(profile?.id)) artistIds.push(profile.id);
      const pMap = await loadProfileMap(artistIds);
      setProfileMap(pMap);
    } catch (e) { console.warn("[Xpress] Refresh error:", e?.message); }
  }, [profile?.id]);

  const navigateTo = (newView, opts = {}) => {
    setViewStack(prev => [...prev, { view, viewingProfileId }]);
    setView(newView);
    if (opts.profileId) setViewingProfileId(opts.profileId);
  };

  const goBack = () => {
    const prev = viewStack[viewStack.length - 1];
    if (prev) {
      setViewStack(s => s.slice(0, -1));
      setView(prev.view);
      setViewingProfileId(prev.viewingProfileId);
    }
  };

  const handleProfileClick = (profileIdOrHandle) => {
    // If it's a UUID, use directly. Otherwise, search by handle/name.
    if (profileIdOrHandle === profile?.id) {
      navigateTo("profile");
    } else {
      setViewingProfileId(profileIdOrHandle);
      navigateTo("viewProfile", { profileId: profileIdOrHandle });
    }
  };

  const handleBottomNav = (navId) => {
    setViewStack([]);
    setViewingProfileId(null);
    setView(navId);
  };

  const handlePostCreated = async (newPost) => {
    setShowCompose(false);
    setAllPosts(prev => [newPost, ...prev]);
    setProfileMap(prev => ({ ...prev, [profile.id]: profile }));
    await refreshAccount();
  };

  const handleQuotePost = (post) => setQuotingPost(post);
  const handleViewComments = (post) => setCommentingPost(post);
  const handleQuoteCreated = async (newPost) => {
    setAllPosts(prev => [newPost, ...prev]);
    await refreshFeed();
  };
  const handleRepost = async () => {
    await refreshFeed();
  };
  const handleDeletePost = async (_postId, deletedPostIds = []) => {
    const deletedIds = new Set(Array.isArray(deletedPostIds) ? deletedPostIds : []);
    setAllPosts(prev => prev.filter((post) => !deletedIds.has(post.id)));
    setReferencedPosts(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !deletedIds.has(id))));
    await refreshFeed();
  };

  // Shared props for all sub-views
  const sharedProps = {
    profile,
    account,
    allPosts,
    profileMap,
    myLikes,
    myReposts,
    myFollowing,
    setMyFollowing,
    currentPlayerId: profile?.id,
    onProfileClick: handleProfileClick,
    onViewCampaign: null, // TODO: wire CampaignAnalyticsModal
    onQuotePost: handleQuotePost,
    onViewComments: handleViewComments,
    onRepost: handleRepost,
    onDeletePost: handleDeletePost,
    referencedPosts,
    refreshFeed,
    refreshProfile,
    releases,
    currentEra,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-0 bg-black z-50 overflow-hidden flex flex-col"
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Main content area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {view === "feed" && (
              <XpressFeed
                {...sharedProps}
                onClose={onClose}
                onCompose={() => setShowCompose(true)}
              />
            )}
            {view === "profile" && (
              <XpressProfile
                {...sharedProps}
                targetProfileId={profile?.id}
                isOwnProfile={true}
                onBack={goBack}
                onCompose={() => setShowCompose(true)}
              />
            )}
            {view === "viewProfile" && viewingProfileId && (
              <XpressProfile
                {...sharedProps}
                targetProfileId={viewingProfileId}
                isOwnProfile={viewingProfileId === profile?.id}
                onBack={goBack}
                onCompose={() => setShowCompose(true)}
              />
            )}
            {view === "notifications" && (
              <XpressNotifications
                {...sharedProps}
                onBack={goBack}
              />
            )}
            {view === "messages" && (
              <XpressMessages
                {...sharedProps}
                onBack={goBack}
              />
            )}
          </div>

          {/* Bottom Nav */}
          <XpressBottomNav
            activeView={view === "viewProfile" ? "profile" : view}
            onNavigate={handleBottomNav}
            unreadNotifs={unreadNotifs}
            unreadMessages={unreadMessages}
          />
        </>
      )}

      {/* Compose Post Modal */}
      <AnimatePresence>
        {showCompose && (
          <NewXpressPost
            profile={profile}
            account={account}
            releases={releases}
            onClose={() => setShowCompose(false)}
            onPostCreated={handlePostCreated}
          />
        )}
      </AnimatePresence>

      {/* Quote Post Modal */}
      <AnimatePresence>
        {quotingPost && (
          <QuotePostModal
            post={quotingPost}
            postAuthor={profileMap[quotingPost.artist_id]}
            profile={profile}
            onClose={() => setQuotingPost(null)}
            onQuoteCreated={handleQuoteCreated}
          />
        )}
      </AnimatePresence>

      {/* Comments Thread */}
      <AnimatePresence>
        {commentingPost && (
          <CommentsThread
            post={commentingPost}
            postAuthor={profileMap[commentingPost.artist_id]}
            profile={profile}
            profileMap={profileMap}
            onClose={() => setCommentingPost(null)}
            onProfileClick={handleProfileClick}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
