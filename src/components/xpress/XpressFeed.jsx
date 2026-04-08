import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, Pencil } from "lucide-react";
import { TopNavigationBar, SocialPostCard, XpressTabBar } from "./XpressShared";
import { buildXpressFeedPosts } from "./xpressFeedUtils";

const FEED_TABS = [
  { id: "latest", label: "Latest" },
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
];

export default function XpressFeed({
  profile: _profile, account: _account, allPosts, profileMap, myLikes, myReposts, myFollowing,
  currentPlayerId, onProfileClick, onViewCampaign, onClose, onCompose, refreshFeed: _refreshFeed,
  onQuotePost, onViewComments, onRepost, onDeletePost, referencedPosts = {},
}) {
  const [feedTab, setFeedTab] = useState("latest");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const feedPosts = useMemo(() => buildXpressFeedPosts({
    allPosts,
    feedTab,
    myFollowing,
    currentPlayerId,
    searchQuery,
    profileMap,
  }), [allPosts, feedTab, myFollowing, currentPlayerId, searchQuery, profileMap]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <TopNavigationBar
        leftIcon={<ArrowLeft className="w-5 h-5 text-gray-400" />}
        onLeftClick={onClose}
        centerContent={
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white text-xs font-black">X</span>
            </div>
            <span className="text-white text-sm font-bold">Xpress</span>
          </div>
        }
        rightIcon={<Search className="w-5 h-5 text-gray-400" />}
        onRightClick={() => setSearchOpen(!searchOpen)}
      />

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-white/[0.06] bg-black">
          <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-3 py-2">
            <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts, @users, #hashtags..."
              className="flex-1 bg-transparent text-white text-[13px] placeholder-gray-500 outline-none"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <XpressTabBar tabs={FEED_TABS} activeTab={feedTab} onTabChange={setFeedTab} />

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {feedPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
              <Pencil className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm font-semibold mb-1">
              {feedTab === "following" ? "No posts from people you follow" : "No posts yet"}
            </p>
            <p className="text-gray-600 text-[11px]">
              {feedTab === "following"
                ? "Follow other artists to see their posts here"
                : "Be the first to post on Xpress!"}
            </p>
          </div>
        ) : (
          feedPosts.filter(Boolean).map((post) => {
            const refPost = referencedPosts[post.reacting_to_post_id];
            return (
              <SocialPostCard
                key={post.id}
                post={post}
                authorProfile={profileMap[post.artist_id]}
                currentPlayerId={currentPlayerId}
                onProfileClick={onProfileClick}
                onViewCampaign={onViewCampaign}
                onQuotePost={onQuotePost}
                onViewComments={onViewComments}
                onRepost={onRepost}
                onDeletePost={onDeletePost}
                myLikes={myLikes}
                myReposts={myReposts}
                referencedPost={refPost || null}
                referencedAuthor={refPost ? profileMap[refPost.artist_id] : null}
              />
            );
          })
        )}
      </div>

      {/* Floating Action Button — Compose */}
      <button
        onClick={onCompose}
        className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-red-600 shadow-lg shadow-red-600/30 flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95 z-10"
      >
        <Pencil className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}
