import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BadgeCheck, Heart, MessageCircle, Repeat2, Share, TrendingUp, Newspaper } from "lucide-react";

export default function MediaFeed({ profile }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'about_me', 'trending'

  useEffect(() => {
    loadMediaPosts();
  }, [filter, profile?.id]);

  const loadMediaPosts = async () => {
    setLoading(true);
    try {
      // Fetch media platform posts
      let query = { source_type: 'media_platform' };
      
      if (filter === 'about_me' && profile?.id) {
        query.artist_id = profile.id;
      }
      
      const mediaPosts = await base44.entities.SocialPost.filter(query, '-created_at', 50);
      
      // Also fetch NPC artist posts for variety
      const npcPosts = await base44.entities.SocialPost.filter(
        { source_type: 'npc_artist' }, 
        '-created_at', 
        20
      );
      
      // Combine and sort by date
      const allPosts = [...(mediaPosts || []), ...(npcPosts || [])];
      allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Enrich posts with platform/artist data
      const enrichedPosts = await Promise.all(
        allPosts.slice(0, 50).map(async (post) => {
          if (post.source_type === 'media_platform' && post.metadata?.platform_name) {
            return {
              ...post,
              displayName: post.metadata.platform_name,
              displayHandle: post.metadata.platform_handle,
              displayPfp: post.metadata.platform_pfp,
              isVerified: true,
              isMediaPlatform: true
            };
          } else if (post.source_type === 'npc_artist' && post.artist_id) {
            try {
              const artist = await base44.entities.ArtistProfile.get(post.artist_id);
              return {
                ...post,
                displayName: artist?.artist_name || 'Artist',
                displayHandle: `@${(artist?.artist_name || 'artist').toLowerCase().replace(/\s+/g, '')}`,
                displayPfp: artist?.profile_image_url,
                isVerified: (artist?.followers || 0) > 100000,
                isMediaPlatform: false,
                artistData: artist
              };
            } catch {
              return { ...post, displayName: 'Artist', displayHandle: '@artist', isMediaPlatform: false };
            }
          }
          return post;
        })
      );
      
      setPosts(enrichedPosts);
    } catch (error) {
      console.error('[MediaFeed] Error loading posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDefaultPfp = (name) => {
    const colors = ['from-purple-500 to-pink-500', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500', 'from-orange-500 to-red-500'];
    const colorIndex = (name?.charCodeAt(0) || 0) % colors.length;
    return colors[colorIndex];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2 px-4 py-2 border-b border-white/10">
        {[
          { id: 'all', label: 'For You', icon: TrendingUp },
          { id: 'about_me', label: 'About Me', icon: Newspaper }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
              ${filter === tab.id 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No media posts yet</p>
          <p className="text-sm mt-1">Check back after more in-game events happen!</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {posts.map((post, idx) => (
            <div key={post.id || idx} className="p-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex gap-3">
                {/* Profile Picture */}
                <div className="shrink-0">
                  {post.displayPfp ? (
                    <img 
                      src={post.displayPfp} 
                      alt={post.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getDefaultPfp(post.displayName)} flex items-center justify-center text-white font-bold text-sm`}>
                      {(post.displayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-bold text-white truncate">{post.displayName}</span>
                    {post.isVerified && (
                      <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    )}
                    <span className="text-gray-500 truncate">{post.displayHandle}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500 text-sm">{formatTimeAgo(post.created_at)}</span>
                    {post.isMediaPlatform && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                        Media
                      </span>
                    )}
                  </div>

                  {/* Post Content */}
                  <p className="text-white mt-1 whitespace-pre-wrap break-words">
                    {post.content}
                  </p>

                  {/* Engagement Stats */}
                  <div className="flex items-center gap-6 mt-3 text-gray-500">
                    <button className="flex items-center gap-1.5 hover:text-red-400 transition-colors group">
                      <Heart className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="text-sm">{formatNumber(post.likes)}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-blue-400 transition-colors group">
                      <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="text-sm">{formatNumber(post.comments)}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-green-400 transition-colors group">
                      <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="text-sm">{formatNumber(post.shares)}</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-purple-400 transition-colors group ml-auto">
                      <Share className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
