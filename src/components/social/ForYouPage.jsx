import React, { useState, useEffect } from "react";
import { X, Play, Heart, Share2, TrendingUp, Clock, Users, Music, Video, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";

export default function ForYouPage({ profile, onClose }) {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('trending'); // trending | popular | shorts | new
  const [filters, setFilters] = useState({
    platform: 'all',
    type: 'all',
    timeRange: 'week'
  });
  const [collaborationSuggestions, setCollaborationSuggestions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const SECTION_TABS = [
    { id: 'trending', label: 'Trending', icon: TrendingUp },
    { id: 'popular', label: 'Popular', icon: Heart },
    { id: 'shorts', label: 'Shorts', icon: Sparkles },
    { id: 'new', label: 'New', icon: Clock },
  ];

  const PLATFORM_OPTIONS = [
    { id: 'all', label: 'All Platforms', icon: Play },
    { id: 'vidwave', label: 'VidWave', icon: Video },
    { id: 'looptok', label: 'LoopTok', icon: Music },
  ];

  const TYPE_OPTIONS = [
    { id: 'all', label: 'All Content' },
    { id: 'music_video', label: 'Music Videos' },
    { id: 'performance', label: 'Performances' },
    { id: 'behind_scenes', label: 'Behind Scenes' },
    { id: 'collaboration', label: 'Collaborations' },
    { id: 'vlog', label: 'Vlogs' },
  ];

  const TIME_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];

  useEffect(() => {
    loadContent();
  }, [filters, section]);

  const loadContent = async () => {
    setLoading(true);
    try {
      // Direct DB read — no edge function
      let query = supabaseClient
        .from('social_posts')
        .select('id, artist_id, post_type, title, caption, views, likes, like_count, comment_count, engagement_rate, revenue, status, platform, content_url, thumbnail_url, metadata, created_at')
        .eq('status', 'published');

      // Platform filter
      if (filters.platform !== 'all') query = query.eq('platform', filters.platform);
      // Content type filter
      if (filters.type !== 'all') query = query.eq('post_type', filters.type);
      // Time range filter
      const now = new Date();
      if (filters.timeRange === 'today') query = query.gte('created_at', new Date(now - 24*60*60*1000).toISOString());
      else if (filters.timeRange === 'week') query = query.gte('created_at', new Date(now - 7*24*60*60*1000).toISOString());
      else if (filters.timeRange === 'month') query = query.gte('created_at', new Date(now - 30*24*60*60*1000).toISOString());

      // Sort by section
      if (section === 'trending' || section === 'popular') query = query.order('views', { ascending: false });
      else query = query.order('created_at', { ascending: false });

      const { data: posts } = await query.limit(50);
      const rows = posts || [];

      // Batch-load author profiles
      const artistIds = [...new Set(rows.map(p => p.artist_id).filter(Boolean))];
      const { data: profiles } = artistIds.length > 0
        ? await supabaseClient.from('profiles').select('id, artist_name, artist_image, followers, genre, career_stage').in('id', artistIds)
        : { data: [] };
      const pMap = new Map((profiles || []).map(p => [p.id, p]));

      setContent(rows.map(p => ({
        ...p,
        artist_name: pMap.get(p.artist_id)?.artist_name || 'Artist',
        artist_image: pMap.get(p.artist_id)?.artist_image || null,
        followers: pMap.get(p.artist_id)?.followers || 0,
        genre: pMap.get(p.artist_id)?.genre || '',
      })));

      // Load collab suggestions from profiles directly
      if (profile?.id) {
        const { data: collabProfiles } = await supabaseClient
          .from('profiles')
          .select('id, artist_name, artist_image, followers, genre, career_stage')
          .neq('id', profile.id)
          .not('artist_name', 'is', null)
          .order('followers', { ascending: false })
          .limit(10);
        setCollaborationSuggestions((collabProfiles || []).map(p => ({
          artist_id: p.id,
          display_name: p.artist_name,
          followers: p.followers,
          genre: p.genre,
          career_stage: p.career_stage,
          compatibility_score: 50,
        })));
      }
    } catch (e) {
      console.error("[ForYou] Load error:", e);
      setContent([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContent();
    setRefreshing(false);
  };

  const formatNum = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n || 0);
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'vidwave': return Video;
      case 'looptok': return Music;
      default: return Play;
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'vidwave': return 'text-red-400';
      case 'looptok': return 'text-pink-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-black/90 backdrop-blur-xl border-b border-white/06 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Play className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-white text-base font-bold">For You</h2>
              <p className="text-gray-500 text-[10px]">Discover trending content</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-white/5 rounded-xl disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 mb-2">
          {SECTION_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSection(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  section === tab.id
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-white/[0.04] text-gray-400 border border-transparent hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <select
            value={filters.platform}
            onChange={(e) => setFilters(prev => ({ ...prev, platform: e.target.value }))}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-white text-[10px] focus:outline-none focus:border-purple-500/30"
          >
            {PLATFORM_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-white text-[10px] focus:outline-none focus:border-purple-500/30"
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          
          <select
            value={filters.timeRange}
            onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
            className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-white text-[10px] focus:outline-none focus:border-purple-500/30"
          >
            {TIME_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Collaboration Suggestions */}
            {collaborationSuggestions.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <h4 className="text-white text-sm font-semibold">Collaboration Suggestions</h4>
                </div>
                <div className="space-y-2">
                  {collaborationSuggestions.map(artist => (
                    <div key={artist.id} className="bg-white/[0.03] rounded-lg p-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
                        <div>
                          <p className="text-white text-[10px] font-semibold">{artist.artist_name}</p>
                          <p className="text-gray-500 text-[8px]">{artist.genre} · {artist.followers?.toLocaleString()} fans</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 text-[9px] font-semibold">{artist.compatibility}% match</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content Grid */}
            <div className="space-y-3">
              {content.map((item, idx) => {
                const PlatformIcon = getPlatformIcon(item.platform);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.1] transition-all"
                  >
                    <div className="flex gap-3 p-3">
                      {/* Thumbnail */}
                      <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <PlatformIcon className="w-6 h-6 text-white/60" />
                        )}
                        {item.is_viral && (
                          <div className="absolute top-1 right-1 bg-amber-500 rounded-full p-1">
                            <TrendingUp className="w-2 h-2 text-white" />
                          </div>
                        )}
                        {item.metadata?.is_npc_reaction && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center">
                            <span className="text-[7px] text-white font-bold">{item.metadata.reaction_channel_icon} {item.metadata.reaction_channel_name}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Content Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{item.title}</p>
                            <p className="text-gray-500 text-[10px]">{item.artist_name}</p>
                          </div>
                          <div className={`text-[9px] ${getPlatformColor(item.platform)}`}>
                            <PlatformIcon className="w-3 h-3" />
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 text-[9px] text-gray-400 mb-2">
                          <span className="flex items-center gap-1">
                            <Play className="w-3 h-3" />
                            {formatNum(item.views)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {formatNum(item.likes)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeAgo(item.created_at)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button className="flex-1 py-1 bg-white/[0.06] rounded-lg text-gray-300 text-[9px] hover:bg-white/[0.1] transition-all">
                            View
                          </button>
                          <button className="p-1 bg-white/[0.06] rounded-lg text-gray-400 hover:text-white transition-all">
                            <Share2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {content.length === 0 && (
              <div className="text-center py-10">
                <Play className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No content found</p>
                <p className="text-gray-500 text-[10px]">Try adjusting your filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
