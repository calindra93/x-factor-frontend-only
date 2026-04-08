import React, { useState, useEffect, useMemo } from "react";
import {
  X, Play, Heart, MessageCircle, Share2, Bookmark, Flame, Plus, Eye,
  Sparkles, Zap, Music,
  Volume2, Home, Bell, User, Compass, Disc, Grid3X3, BarChart3,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { showToast } from "@/components/ui/toast-provider";
import {
  TRENDING_SOUNDS, TRENDING_HASHTAGS, DUET_PARTNERS,
  ALGORITHM_STATES, MyPostsTab, CreatorToolsTab, DiscoverTab, ProfileTab,
} from "./LoopTokTabs";
import { normalizeHashtag } from "./looptokDiscoverUtils";

const VIDEO_CONCEPTS = [
  { id: "dance_challenge", label: "Dance Challenge", desc: "Create a viral dance to your music", energyCost: 8, baseViews: 2000, viralChance: 0.25, icon: "\uD83D\uDC83", category: "trend" },
  { id: "snippet", label: "Song Snippet", desc: "15-30s preview of music", energyCost: 5, baseViews: 800, viralChance: 0.12, icon: "\uD83C\uDFB5", category: "music" },
  { id: "lip_sync", label: "Lip Sync", desc: "Lip sync to trending or your own sounds", energyCost: 3, baseViews: 600, viralChance: 0.10, icon: "\uD83C\uDFA4", category: "trend" },
  { id: "skit", label: "Skit / Comedy", desc: "Short comedy skit, relatable content", energyCost: 5, baseViews: 1500, viralChance: 0.18, icon: "\uD83C\uDFAD", category: "creative" },
  { id: "behind_scenes", label: "Behind the Scenes", desc: "Raw studio footage, daily life", energyCost: 3, baseViews: 500, viralChance: 0.06, icon: "\uD83D\uDCF9", category: "authentic" },
  { id: "freestyle", label: "Freestyle / Cypher", desc: "Raw bars over trending beats", energyCost: 6, baseViews: 1200, viralChance: 0.15, icon: "\uD83D\uDD25", category: "music" },
  { id: "original_sound", label: "Original Sound", desc: "Create a sound others can use", energyCost: 7, baseViews: 400, viralChance: 0.08, icon: "\uD83C\uDFA7", category: "music", soundCreator: true },
  { id: "trend_reaction", label: "Trend Reaction", desc: "Put your spin on a trend", energyCost: 4, baseViews: 900, viralChance: 0.14, icon: "\uD83D\uDC40", category: "trend" },
  { id: "announcement", label: "Announcement", desc: "Tease drops, tours, or merch", energyCost: 3, baseViews: 400, viralChance: 0.04, icon: "\uD83D\uDCE2", category: "promo" },
  { id: "duet", label: "Duet / Stitch", desc: "React to another creator's video", energyCost: 4, baseViews: 1100, viralChance: 0.16, icon: "\uD83E\uDD1D", category: "collab" },
  { id: "storytime", label: "Storytime", desc: "Tell a compelling personal story", energyCost: 4, baseViews: 700, viralChance: 0.11, icon: "\uD83D\uDCD6", category: "authentic" },
  { id: "get_ready", label: "Get Ready With Me", desc: "Pre-show, outfit check", energyCost: 3, baseViews: 600, viralChance: 0.09, icon: "\u2728", category: "authentic" },
  { id: "meme_drop", label: "Meme Drop", desc: "Drop a viral meme using your track", energyCost: 5, baseViews: 2500, viralChance: 0.28, icon: "😂", category: "trend", alignmentTag: "meme_drop" },
  { id: "trend_surf", label: "Trend Surf", desc: "Ride a trend wave to attract new fans", energyCost: 4, baseViews: 1800, viralChance: 0.20, icon: "🏄", category: "trend", alignmentTag: "trend_surf" },
  { id: "radio_clip", label: "Radio Clip", desc: "Clip your on-air moment to boost show buzz", energyCost: 4, baseViews: 1400, viralChance: 0.16, icon: "📻", category: "promo", alignmentTag: "radio_clip" },
];

const VIDEO_LENGTHS = [
  { id: "15s", label: "15 seconds", mult: 0.8, viralBoost: 1.3, desc: "Quick hit - highest replay rate" },
  { id: "30s", label: "30 seconds", mult: 1.0, viralBoost: 1.1, desc: "Sweet spot for most content" },
  { id: "60s", label: "60 seconds", mult: 1.2, viralBoost: 0.9, desc: "More room for storytelling" },
  { id: "3m", label: "3 minutes", mult: 1.5, viralBoost: 0.6, desc: "Long-form - deeper engagement" },
];

const VISUAL_FILTERS = [
  { id: "raw", label: "Raw / No Filter", viralBoost: 1.15, desc: "Authentic, unedited - algorithm loves this" },
  { id: "lofi", label: "Lo-Fi", viralBoost: 1.05, desc: "Grainy, warm tones, vintage feel" },
  { id: "glitch", label: "Glitch", viralBoost: 1.0, desc: "Digital distortion, cyberpunk" },
  { id: "sparkle", label: "Sparkle", viralBoost: 0.95, desc: "Glitter effects, dreamy vibes" },
  { id: "cinematic", label: "Cinematic", viralBoost: 0.75, desc: "Color graded - too polished for LoopTok?" },
  { id: "neon", label: "Neon Glow", viralBoost: 1.0, desc: "Bright neon overlays, club aesthetic" },
];

// Performance calculations moved to backend: supabase/functions/_shared/socialMedia/looptokHandler.ts
// Frontend now calls edge function instead of calculating locally

function formatNum(n) { if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`; return String(n || 0); }

export default function LoopTokApp({ onClose, profile, releases: _initialReleases, currentEra: _currentEra }) {
  const [tab, setTab] = useState("home");
  const [posts, setPosts] = useState([]);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createStep, setCreateStep] = useState(0);
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [selectedSound, setSelectedSound] = useState(null);
  const [selectedLength, setSelectedLength] = useState("30s");
  const [selectedFilter, setSelectedFilter] = useState("raw");
  const [postCaption, setPostCaption] = useState("");
  const [selectedHashtags, setSelectedHashtags] = useState([]);
  const [linkedRelease, setLinkedRelease] = useState("");
  const [showOriginalSoundModal, setShowOriginalSoundModal] = useState(false);
  const [linkedSong, setLinkedSong] = useState("");
  const [songs, setSongs] = useState([]);
  const [releases, setReleases] = useState([]);
  const [duetPartner, setDuetPartner] = useState(null);
  const [posting, setPosting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [boostPost, setBoostPost] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [creatorState, setCreatorState] = useState(null);
  const [duetPartners, setDuetPartners] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [soundMetrics, setSoundMetrics] = useState([]);
  const [currentTurnId, setCurrentTurnId] = useState(0);
  const [brandDealOffers, setBrandDealOffers] = useState([]);
  const [brandDealContracts, setBrandDealContracts] = useState([]);
  const [brandDealsLoading, setBrandDealsLoading] = useState(false);
  const [acceptingDealId, setAcceptingDealId] = useState(null);
  const [decliningDealId, setDecliningDealId] = useState(null);
  const [sponsoredContractId, setSponsoredContractId] = useState('');
  const [selectedTrend, setSelectedTrend] = useState(null);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [algorithmMood, setAlgorithmMood] = useState('mainstream');
  const [likedPostIds, setLikedPostIds] = useState(new Set());
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewingProfileData, setViewingProfileData] = useState({ posts: [], releases: [] });
  const [profileOverride, setProfileOverride] = useState(null);
  const viewProfileSeqRef = React.useRef(0);

  const algorithmState = creatorState?.algorithm_state || 'neutral';
  const displayProfile = profileOverride || profile;

  const handleViewProfile = async (profileData) => {
    const seq = ++viewProfileSeqRef.current;
    setViewingProfile(profileData);
    setViewingProfileData({ posts: [], releases: [] });
    setTab('profile');
    try {
      const [postsRes, releasesRes] = await Promise.all([
        // This screen renders several optional post fields (for example title/is_viral),
        // so keep the profile-post read broad instead of pruning columns here.
        supabaseClient.from('social_posts').select('*').eq('artist_id', profileData.id).eq('platform', 'looptok').in('status', ['published', 'active']).order('created_at', { ascending: false }).limit(30),
        supabaseClient.from('releases').select('id, title, release_name, genre, lifetime_streams, lifecycle_state').eq('artist_id', profileData.id).order('created_at', { ascending: false }).limit(30),
      ]);
      if (seq !== viewProfileSeqRef.current) return;
      setViewingProfileData({ posts: postsRes.data || [], releases: releasesRes.data || [] });
    } catch (e) {
      console.error('[LoopTok] View profile error:', e);
    }
  };
  const algoInfo = ALGORITHM_STATES.find(a => a.id === algorithmState) || ALGORITHM_STATES[1];

  useEffect(() => { const h = e => { if (e.key === "Escape") onClose?.(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      if (!profile?.id) { setLoading(false); return; }

      setBrandDealsLoading(true);

      // All direct DB reads — no edge function calls
      const [postsRes, accountRes, songsRes, releasesRes, duetRes, turnStateRes, offersRes, contractsRes, soundMetricsRes, notificationsRes] = await Promise.all([
        supabaseClient
          .from('social_posts')
          .select('*')
          .eq('artist_id', profile.id)
          .eq('platform', 'looptok')
          .in('status', ['published', 'active'])
          .order('created_at', { ascending: false })
          .limit(30)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('social_accounts')
          .select('id, artist_id, platform, followers, engagement_rate, content_quality, account_level, created_at')
          .eq('artist_id', profile.id)
          .eq('platform', 'looptok')
          .limit(1)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('songs')
          .select('id, title, quality, genre, project_id, release_id')
          .eq('artist_id', profile.id)
          .eq('status', 'recorded')
          .order('created_at', { ascending: false })
          .limit(50)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('releases')
          .select('id, title, release_name, genre, lifetime_streams, lifecycle_state')
          .eq('artist_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('profiles')
          .select('id, artist_name, followers, genre, region, artist_image')
          .neq('id', profile.id)
          .order('followers', { ascending: false })
          .limit(25)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('turn_state')
          .select('global_turn_id, algorithm_mood')
          .order('global_turn_id', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(r => r.data || null)
          .catch(() => null),
        supabaseClient
          .from('brand_deals')
          .select('*')
          .eq('artist_id', profile.id)
          .eq('status', 'offered')
          .contains('platform_scope', ['looptok'])
          .order('created_at', { ascending: false })
          .limit(12)
          .then(r => r.data || [])
          .catch(() => []),
        supabaseClient
          .from('brand_deal_contracts')
          .select('*')
          .eq('player_id', profile.id)
          .in('status', ['active', 'completed', 'cancelled'])
          .order('created_at', { ascending: false })
          .limit(30)
          .then(r => r.data || [])
          .catch(() => []),
        supabaseClient
          .from('looptok_sound_metrics')
          .select('sound_id, trend_state, uses_count, is_player_sound, global_turn_id')
          .eq('is_player_sound', true)
          .in('trend_state', ['rising', 'peak'])
          .order('global_turn_id', { ascending: false })
          .limit(20)
          .then(r => r.data || [])
          .catch(() => []),
        supabaseClient
          .from('notifications')
          .select('id, type, title, subtitle, body, metrics, is_read, created_at')
          .eq('player_id', profile.id)
          .in('type', ['LOOPTOK_DUET', 'COLLABORATION_REQUEST', 'COLLABORATION_ACCEPTED', 'COLLABORATION_DECLINED'])
          .order('created_at', { ascending: false })
          .limit(20)
          .then(r => r.data || [])
          .catch(() => []),
      ]);

      setPosts(postsRes);
      setSongs(songsRes);
      setReleases(releasesRes);

      const turnId = Number(turnStateRes?.global_turn_id || 0);
      setCurrentTurnId(turnId);
      setAlgorithmMood(turnStateRes?.algorithm_mood || 'mainstream');
      setBrandDealOffers(offersRes);
      setBrandDealContracts(contractsRes);
      setSoundMetrics(soundMetricsRes);
      setInboxNotifications(notificationsRes);

      // Duet partners from real player profiles (fallback UI uses static DUET_PARTNERS)
      const mappedDuetPartners = (duetRes || []).map(p => {
        const pf = Number(p.followers || 0);
        const selfF = Number(profile.followers || 0);
        const followerRatio = selfF > 0 ? Math.min(2, pf / Math.max(1, selfF)) : 1;
        const genreMatch = (p.genre && profile.genre && String(p.genre).toLowerCase() === String(profile.genre).toLowerCase()) ? 0.15 : 0;
        const regionMatch = (p.region && profile.region && String(p.region).toLowerCase() === String(profile.region).toLowerCase()) ? 0.1 : 0;
        const compat = Math.max(0.35, Math.min(0.95, 0.55 + genreMatch + regionMatch + Math.min(0.15, (followerRatio - 1) * 0.1)));
        return {
          id: p.id,
          name: `@${p.artist_name || 'artist'}`,
          followers: `${formatNum(pf)}`,
          style: p.genre || 'Artist',
          compat,
          is_npc: false,
          artist_image: p.artist_image || null,
        };
      });
      setDuetPartners(mappedDuetPartners);

      // Set or create account
      if (accountRes.length > 0) {
        setAccount(accountRes[0]);
      } else {
        const { data: newAcc } = await supabaseClient
          .from('social_accounts')
          .insert({
            artist_id: profile.id,
            platform: 'looptok',
            followers: Math.floor(Number(profile.followers || 0) * 0.3),
          })
          .select()
          .single()
          .catch(() => ({ data: null }));
        setAccount(newAcc || null);
      }

      // Load LoopTok-specific data from DB (direct reads)
      try {
        // Creator state: load or initialize
        let { data: cs } = await supabaseClient
          .from('looptok_creator_state')
          .select('*')
          .eq('artist_id', profile.id)
          .maybeSingle();

        if (!cs) {
          // Initialize creator state for this player
          const { data: newCs } = await supabaseClient
            .from('looptok_creator_state')
            .upsert({
              artist_id: profile.id,
              algorithm_state: 'neutral',
              algorithm_multiplier: 1.0,
              algorithm_reason: 'New creator — default neutral',
              last_eval_turn: 0,
              next_eval_turn: 3,
              content_pillars: [],
              pillar_streak: 0,
              pillar_bonus: 1.0,
            }, { onConflict: 'artist_id' })
            .select()
            .single();
          cs = newCs;
        }
        if (cs) setCreatorState(cs);

        // Load joined challenge participation for the current player.
        const { data: challengeRows } = await supabaseClient
          .from('looptok_challenge_participation')
          .select(`
            challenge_id,
            artist_id,
            progress_score,
            award_level,
            completed_turn
          `)
          .eq('artist_id', profile.id);

        if (challengeRows) {
          setChallenges(challengeRows);
        }
      } catch (e) {
        console.warn('[LoopTok] Creator state load failed (non-fatal):', e);
      }

      setLoading(false);
    } catch (e) {
      console.error("[LoopTok] Load error:", e);
      setLoading(false);
    } finally {
      setBrandDealsLoading(false);
    }
  };

  const acceptLoopTokBrandDeal = async (dealId) => {
    if (!profile?.id || !dealId || acceptingDealId) return;
    try {
      setAcceptingDealId(dealId);
      const res = await base44.functions.invoke('socialMedia', {
        action: 'acceptBrandDeal',
        artistId: profile.id,
        offerId: dealId,
        currentTurn: currentTurnId || 0,
      });
      if (res?.error) throw new Error(res.error);
      showToast(`🤝 Deal accepted: ${res?.contract?.brand_name || 'Brand deal'}`, 'success');
      await loadData();
    } catch (e) {
      console.error('[LoopTok] Accept deal failed:', e);
      showToast(`Failed to accept deal: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setAcceptingDealId(null);
    }
  };

  const declineLoopTokBrandDeal = async (dealId) => {
    if (!profile?.id || !dealId || decliningDealId) return;
    try {
      setDecliningDealId(dealId);
      const res = await base44.functions.invoke('socialMedia', {
        action: 'declineInstaVibeBrandDeal',
        artistId: profile.id,
        dealId,
      });
      if (res?.error) throw new Error(res.error);
      showToast('Deal declined', 'success');
      await loadData();
    } catch (e) {
      console.error('[LoopTok] Decline deal failed:', e);
      showToast(`Failed to decline deal: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setDecliningDealId(null);
    }
  };

  const handleLikePost = async (postId) => {
    if (!profile?.id || !postId || likedPostIds.has(postId)) return;
    setLikedPostIds(prev => new Set([...prev, postId]));
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'likeInstaVibePost',
        artistId: profile.id,
        postId,
      });
    } catch (e) {
      console.warn('[LoopTok] Like failed (non-fatal):', e);
    }
  };

  const handlePost = async () => {
    if (!selectedConcept || !profile?.id || posting) return;
    setPosting(true);
    try {
      const concept = selectedConcept;
      const length = typeof selectedLength === 'object' ? selectedLength?.id : (selectedLength || '30s');
      const filter = typeof selectedFilter === 'object' ? selectedFilter?.id : (selectedFilter || 'raw');

      // Determine alignment tag: active trend > trending sound > concept default
      const soundIsTrending = selectedSound?.soundKey && soundMetrics.some(
        m => m.sound_id === selectedSound.soundKey && (m.trend_state === 'rising' || m.trend_state === 'peak')
      );
      const alignmentTag = selectedTrend?.alignment_tag
        || (soundIsTrending ? 'trend_sound_ride' : (concept.alignmentTag || null));

      // Build params for backend
      const params = {
        action: 'createLoopTokPost',
        artistId: profile.id,
        conceptId: concept.id,
        soundName: selectedSound?.id || selectedSound?.name || null,
        videoLength: length,
        filter,
        hashtags: selectedHashtags,
        duetPartner: duetPartner ? { id: duetPartner.id, name: duetPartner.name, is_npc: duetPartner.is_npc } : null,
        energyCost: concept.energyCost,
        title: postCaption || concept.label,
        caption: postCaption || '',
        boostPost,
        thumbnailUrl: thumbnailUrl || null,
        linkedRelease: linkedRelease || null,
        linkedSong: linkedSong || null,
        alignmentTag,
        linkedSoundId: selectedSound?.isPlayerSound ? (selectedSound?.soundKey || selectedSound?.id || null) : null,
        sponsoredContractId: sponsoredContractId || null,
      };

      const result = await base44.functions.invoke('socialMedia', params);
      if (result?.error) throw new Error(result.error);

      const perf = result?.data?.performance || {};
      const post = result?.data?.socialPost || null;

      // BUG-LT-001 FIX: sponsorship linkage now handled server-side in looptokHandler
      if (result?.data?.sponsorshipError) {
        console.warn('[LoopTok] Sponsorship linkage warning:', result.data.sponsorshipError);
      }

      // Notify duet partner
      if (duetPartner?.id && !duetPartner?.is_npc && post?.id) {
        void (async () => {
          try {
            await base44.functions.invoke('socialMedia', {
              action: 'notifyLoopTokDuetPartner',
              artistId: profile.id,
              duetPartnerId: duetPartner.id,
              postId: post.id,
              caption: postCaption || concept.label
            });
          } catch (notifErr) {
            console.warn('[LoopTok] Duet notification failed (non-fatal):', notifErr);
          }
        })();
      }

      setLastResult({
        views: perf.views || 0,
        likes: perf.likes || 0,
        comments: perf.comments || 0,
        viral: perf.isViral || false,
        revenue: perf.revenue || 0,
        followerGain: perf.followerGain || 0,
        shares: perf.shares || 0,
      });
      setSelectedTrend(null);
      loadData();
      showToast(perf.isViral ? '🔥 Loop went VIRAL!' : 'Loop posted!', 'success');
      setCreateStep(0);
      setSelectedConcept(null);
      setSelectedLength('30s');
      setSelectedFilter('raw');
      setSelectedSound(null);
      setPostCaption('');
      setSelectedHashtags([]);
      setLinkedRelease('');
      setLinkedSong('');
      setDuetPartner(null);
      setBoostPost(false);
      setThumbnailUrl('');
      setSponsoredContractId('');
      setTab('home');
    } catch (error) {
      console.error('[LoopTok] Post error:', error);
      showToast('Failed to create post: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleBoostPost = async (postId) => {
    try {
      if ((profile.hype || 0) < 10) {
        showToast('Need 10 hype to boost a post', 'error');
        return;
      }

      const { data: existingPost } = await supabaseClient
        .from('social_posts')
        .select('views, likes, comments, shares, saves, like_count, comment_count, metadata, is_promoted')
        .eq('id', postId)
        .single();

      if (!existingPost) { showToast('Post not found', 'error'); return; }
      if (existingPost.is_promoted || existingPost.metadata?.boosted) {
        showToast('Post already boosted', 'error'); return;
      }

      // Apply 1.5x boost to social_posts
      const { error } = await supabaseClient
        .from('social_posts')
        .update({
          views: Math.floor(existingPost.views * 1.5),
          likes: Math.floor(existingPost.likes * 1.5),
          comments: Math.floor(existingPost.comments * 1.5),
          shares: Math.floor(existingPost.shares * 1.5),
          saves: Math.floor((existingPost.saves || 0) * 1.5),
          like_count: Math.floor((existingPost.like_count || existingPost.likes) * 1.5),
          comment_count: Math.floor((existingPost.comment_count || existingPost.comments) * 1.5),
          is_promoted: true,
          is_trending: true,
          metadata: { ...existingPost.metadata, boosted: true },
        })
        .eq('id', postId);

      if (error) throw error;

      // Also update looptok_posts extension
      void (async () => {
        await supabaseClient
          .from('looptok_posts')
          .update({ is_boosted: true })
          .eq('social_post_id', postId);
      })();

      // Deduct hype
      await supabaseClient
        .from('profiles')
        .update({ hype: Math.max(0, (profile.hype || 0) - 10) })
        .eq('id', profile.id);

      showToast('Post boosted! +50% reach 🚀', 'success');
      loadData();
    } catch (e) {
      console.error('[LoopTok] Boost error:', e);
      showToast('Boost failed: ' + (e.message || 'Unknown error'), 'error');
    }
  };

  const handleJoinChallenge = async (challengeId) => {
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'joinLoopTokChallenge',
        artistId: profile.id,
        challengeId,
        currentTurn: currentTurnId || 0,
      });

      if (result?.error) throw new Error(result.error);

      showToast('Joined challenge! 🎯', 'success');
      loadData();
      return true;
    } catch (e) {
      console.error('[LoopTok] Join challenge error:', e);
      showToast('Failed to join: ' + (e.message || 'Unknown error'), 'error');
      return false;
    }
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket: 'uploads' });
      setThumbnailUrl(result.file_url);
      showToast("Thumbnail uploaded!", "success");
    } catch (err) {
      console.error("[LoopTok] Thumbnail upload error:", err);
      showToast("Failed to upload thumbnail", "error");
    } finally {
      setThumbnailUploading(false);
    }
  };

  // Store hashtags without # prefix to avoid double-## on render
  const toggleHashtag = tag => {
    const normalized = normalizeHashtag(tag).replace(/^#/, ''); // strip leading # for storage
    setSelectedHashtags(prev => prev.includes(normalized) ? prev.filter(t => t !== normalized) : prev.length < 6 ? [...prev, normalized] : prev);
  };
  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
  const viralPosts = posts.filter(p => p.is_viral).length;
  const followers = account?.followers || 0;

  const BOTTOM_NAV = [
    { id: "home", label: "Home", icon: Home },
    { id: "discover", label: "Discover", icon: Compass },
    { id: "create_btn", label: "", icon: Plus, isCreate: true },
    { id: "inbox", label: "Inbox", icon: Bell },
    { id: "profile_nav", label: "Profile", icon: User },
  ];

  const PROFILE_TABS = [
    { id: "my_posts", label: "Posts", icon: Grid3X3 },
    { id: "creator_tools", label: "Analytics", icon: BarChart3 },
  ];

  const isProfileView = tab === "my_posts" || tab === "creator_tools";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="fixed inset-0 z-[90] bg-black overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-black/90 backdrop-blur-xl border-b border-white/[0.06] px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white" /></div>
            <h2 className="text-white text-base font-bold tracking-tight">LoopTok</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Profile view: stats + algo status + sub-tabs */}
        {isProfileView && (
          <>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[{ v: formatNum(followers), l: "Followers", c: "text-white" }, { v: formatNum(totalViews), l: "Views", c: "text-pink-400" }, { v: String(posts.length), l: "Posts", c: "text-white" }, { v: String(viralPosts), l: "Viral", c: "text-amber-400" }].map(s => (
                <div key={s.l} className="bg-white/[0.04] rounded-lg px-2 py-1.5 text-center"><p className={`${s.c} text-[11px] font-bold`}>{s.v}</p><p className="text-gray-500 text-[7px] uppercase tracking-widest">{s.l}</p></div>
              ))}
            </div>
            <div className={`mt-2 ${algoInfo.bg} rounded-lg px-2.5 py-1.5 flex items-center gap-2`}>
              <Zap className={`w-3 h-3 ${algoInfo.color}`} />
              <div className="flex-1">
                <p className={`${algoInfo.color} text-[9px] font-semibold`}>{algoInfo.label}</p>
                <p className="text-gray-500 text-[7px]">{algoInfo.desc}</p>
                {creatorState?.content_pillars?.length > 0 && (
                  <div className="flex gap-1 mt-0.5">{creatorState.content_pillars.map(p => (
                    <span key={p} className="text-[6px] px-1 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/20">{p}</span>
                  ))}</div>
                )}
              </div>
              <div className="text-right">
                <span className={`text-[8px] font-bold ${algoInfo.color}`}>{creatorState?.algorithm_multiplier?.toFixed(2) || algoInfo.mult}x</span>
                {creatorState?.pillar_streak > 0 && <p className="text-[6px] text-amber-400">🔥 {creatorState.pillar_streak} streak</p>}
              </div>
            </div>
            <div className="flex gap-1 mt-2">
              {PROFILE_TABS.map(t => { const I = t.icon; return (
                <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${tab === t.id ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'text-gray-500 hover:text-gray-300'}`}><I className="w-3.5 h-3.5" />{t.label}</button>
              ); })}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
        {loading ? <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" /></div>
        : tab === "home" ? <HomeTab lastResult={lastResult} setLastResult={setLastResult} setTab={setTab} playerPosts={posts} profile={displayProfile} onViewProfile={handleViewProfile} releases={releases} likedPostIds={likedPostIds} onLikePost={handleLikePost} />
        : tab === "discover" ? <DiscoverTab releases={releases} currentTurnId={currentTurnId} onSelectTrend={setSelectedTrend} selectedTrend={selectedTrend} soundMetrics={soundMetrics} playerPosts={posts} handleJoinChallenge={handleJoinChallenge} setTab={setTab} challenges={challenges} currentArtistId={profile?.id} algorithmMood={algorithmMood} />
        : tab === "create" ? <CreateTab step={createStep} setStep={setCreateStep} concept={selectedConcept} setConcept={setSelectedConcept} sound={selectedSound} setSound={setSelectedSound} length={selectedLength} setLength={setSelectedLength} filter={selectedFilter} setFilter={setSelectedFilter} caption={postCaption} setCaption={setPostCaption} hashtags={selectedHashtags} toggleHashtag={toggleHashtag} linkedRelease={linkedRelease} setLinkedRelease={setLinkedRelease} linkedSong={linkedSong} setLinkedSong={setLinkedSong} duetPartner={duetPartner} setDuetPartner={setDuetPartner} boost={boostPost} setBoost={setBoostPost} releases={releases} songs={songs} profile={profile} posting={posting} handlePost={handlePost} thumbnailUrl={thumbnailUrl} setThumbnailUrl={setThumbnailUrl} thumbnailUploading={thumbnailUploading} handleThumbnailUpload={handleThumbnailUpload} duetPartners={duetPartners} soundMetrics={soundMetrics} brandDealContracts={brandDealContracts} sponsoredContractId={sponsoredContractId} setSponsoredContractId={setSponsoredContractId} currentTurnId={currentTurnId} showOriginalSoundModal={showOriginalSoundModal} setShowOriginalSoundModal={setShowOriginalSoundModal} />
        : tab === "inbox" ? <InboxTab
            posts={posts}
            followers={followers}
            totalViews={totalViews}
            viralPosts={viralPosts}
            algoState={algorithmState}
            creatorState={creatorState}
            account={account}
            currentTurnId={currentTurnId}
            brandDealOffers={brandDealOffers}
            brandDealContracts={brandDealContracts}
            brandDealsLoading={brandDealsLoading}
            acceptingDealId={acceptingDealId}
            decliningDealId={decliningDealId}
            onAcceptBrandDeal={acceptLoopTokBrandDeal}
            onDeclineBrandDeal={declineLoopTokBrandDeal}
            inboxNotifications={inboxNotifications}
            algorithmMood={algorithmMood}
          />
        : tab === "my_posts" ? <MyPostsTab posts={posts} handleBoostPost={handleBoostPost} />
        : tab === "profile" ? <ProfileTab
            profile={viewingProfile || displayProfile}
            posts={viewingProfile ? viewingProfileData.posts : posts}
            releases={viewingProfile ? viewingProfileData.releases : releases}
            soundMetrics={soundMetrics}
            isOwnProfile={!viewingProfile}
            onProfileUpdated={setProfileOverride}
          />
        : <CreatorToolsTab
            posts={posts}
            followers={followers}
            totalViews={totalViews}
            viralPosts={viralPosts}
            account={account}
            algoState={algorithmState}
            creatorState={creatorState}
            currentTurnId={currentTurnId}
            brandDealOffers={brandDealOffers}
            brandDealContracts={brandDealContracts}
            brandDealsLoading={brandDealsLoading}
            acceptingDealId={acceptingDealId}
            decliningDealId={decliningDealId}
            onAcceptBrandDeal={acceptLoopTokBrandDeal}
            onDeclineBrandDeal={declineLoopTokBrandDeal}
          />}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="flex-shrink-0 bg-black border-t border-white/[0.06] px-2 pb-[env(safe-area-inset-bottom)] pt-1">
        <div className="flex items-center justify-around">
          {BOTTOM_NAV.map(item => {
            const I = item.icon;
            if (item.isCreate) {
              return (
                <button key={item.id} onClick={() => { setTab("create"); setCreateStep(0); }} className="flex flex-col items-center -mt-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center shadow-lg shadow-pink-500/25">
                    <I className="w-5 h-5 text-white" />
                  </div>
                </button>
              );
            }
            const isActive = item.id === "profile_nav" ? tab === "profile"
              : item.id === "discover" ? tab === "discover"
              : item.id === "brand_deals" ? tab === "brand_deals"
              : item.id === "inbox" ? tab === "inbox"
              : tab === "home";
            return (
              <button key={item.id} onClick={() => {
                if (item.id === "profile_nav") { setTab("profile"); setViewingProfile(null); }
                else if (item.id === "discover") setTab("discover");
                else if (item.id === "brand_deals") setTab("brand_deals");
                else if (item.id === "inbox") setTab("inbox");
                else setTab("home");
              }} className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[56px] min-h-[44px]">
                <I className={`w-5 h-5 ${isActive ? 'text-pink-400' : 'text-gray-500'}`} />
                <span className={`text-[9px] font-medium ${isActive ? 'text-pink-400' : 'text-gray-500'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function HomeTab({ lastResult, setLastResult, setTab, playerPosts, profile, onViewProfile, releases = [], likedPostIds = new Set(), onLikePost }) {
  const releaseTitleById = useMemo(() => {
    const map = {};
    releases.forEach(r => { map[r.id] = r.release_name || r.title || null; });
    return map;
  }, [releases]);
  const [allPosts, setAllPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState("all"); // "all" | "fan_content"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabaseClient } = await import("@/lib/supabaseClient");
        // Step 1: fetch posts without join (two FKs on artist_id confuse Supabase)
        const { data: posts } = await supabaseClient
          .from('social_posts')
          .select('*')
          .eq('platform', 'looptok')
          .in('status', ['published', 'active'])
          .order('created_at', { ascending: false })
          .limit(40);
        const rawPosts = Array.isArray(posts) ? posts : [];

        // Step 2: batch-fetch profiles for unique artist_ids
        const artistIds = [...new Set(rawPosts.map(p => p.artist_id).filter(Boolean))];
        const profileMap = {};
        if (artistIds.length > 0) {
          const { data: profileRows } = await supabaseClient
            .from('profiles')
            .select('id, artist_name, artist_image')
            .in('id', artistIds);
          (profileRows || []).forEach(p => { profileMap[p.id] = p; });
        }

        // Step 3: attach profile data to each post
        const enriched = rawPosts.map(p => ({
          ...p,
          profiles: profileMap[p.artist_id] || null,
        }));
        if (!cancelled) setAllPosts(enriched);
      } catch (e) { console.error("[LoopTok FYP] Load error:", e); }
      finally { if (!cancelled) setFeedLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const merged = useMemo(() => {
    const ids = new Set(allPosts.map(v => v.id));
    const extras = (playerPosts || []).filter(v => v.id && !ids.has(v.id));
    let combined = [...extras, ...allPosts];
    if (feedFilter === "fan_content") {
      combined = combined.filter(v => v.metadata?.is_npc || v.metadata?.posted_by_outlet || !v.artist_id);
    } else {
      combined = combined.filter(v => !v.metadata?.is_npc && !v.metadata?.posted_by_outlet && v.artist_id);
    }
    combined.sort((a, b) => new Date(b.created_at || b.created_date).getTime() - new Date(a.created_at || a.created_date).getTime());
    return combined.slice(0, 30);
  }, [allPosts, playerPosts, feedFilter]);

  const fanContentCount = useMemo(() =>
    [...(playerPosts || []), ...allPosts].filter(v => v.metadata?.is_npc || v.metadata?.posted_by_outlet || !v.artist_id).length
  , [allPosts, playerPosts]);

  // Gradient colors for posts without thumbnails
  const gradients = [
    'from-pink-600/40 to-purple-900/60',
    'from-cyan-600/40 to-blue-900/60',
    'from-amber-600/40 to-red-900/60',
    'from-green-600/40 to-teal-900/60',
    'from-violet-600/40 to-indigo-900/60',
    'from-rose-600/40 to-pink-900/60',
  ];

  return (
    <div className="flex flex-col gap-3 px-2 pt-2 pb-4">
      {/* Create CTA */}
      <button onClick={() => setTab("create")} className="mx-2 bg-gradient-to-r from-pink-500/20 to-red-500/20 border border-pink-500/30 rounded-xl p-2.5 flex items-center gap-3 hover:from-pink-500/30 hover:to-red-500/30 transition-all active:scale-[0.98]">
        <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center"><Plus className="w-4 h-4 text-pink-400" /></div>
        <div className="text-left"><p className="text-white text-xs font-semibold">Create New Loop</p><p className="text-gray-500 text-[9px]">Ride a trend or go viral</p></div>
      </button>

      {/* Last result banner */}
      <AnimatePresence>
        {lastResult && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className={`mx-2 border rounded-xl p-3 ${lastResult.isViral ? 'bg-gradient-to-br from-amber-500/10 to-pink-500/10 border-amber-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <div className="flex items-center gap-2 mb-1.5">
              {lastResult.isViral && <Flame className="w-4 h-4 text-amber-400" />}
              <p className="text-white text-xs font-bold">{lastResult.isViral ? "VIRAL!" : "Posted!"}</p>
              <span className="text-gray-500 text-[9px] ml-auto">{formatNum(lastResult.views)} views</span>
            </div>
            <div className="flex items-center gap-4 text-[9px]">
              <span className="text-pink-400">{formatNum(lastResult.likes)} likes</span>
              <span className="text-green-400">+{formatNum(lastResult.followerGain)} fans</span>
              <span className="text-blue-400">{formatNum(lastResult.shares)} shares</span>
            </div>
            <button onClick={() => setLastResult(null)} className="text-gray-600 text-[7px] mt-1 hover:text-gray-400">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FYP Header + filter pills */}
      <div className="flex items-center justify-between mx-2">
        <div className="flex gap-1.5">
          <button onClick={() => setFeedFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${feedFilter === "all" ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-white/[0.04] text-gray-500 hover:text-gray-300 border border-transparent'}`}>
            Loops
          </button>
          <button onClick={() => setFeedFilter("fan_content")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${feedFilter === "fan_content" ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-white/[0.04] text-gray-500 hover:text-gray-300 border border-transparent'}`}>
            🎭 Fan Content
            {fanContentCount > 0 && (
              <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${feedFilter === "fan_content" ? 'bg-purple-500/30 text-purple-300' : 'bg-white/[0.08] text-gray-400'}`}>
                {fanContentCount}
              </span>
            )}
          </button>
        </div>
        <span className="text-gray-500 text-[9px]">{merged.length} loops</span>
      </div>

      {/* TikTok-style vertical feed */}
      {feedLoading ? (
        <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" /></div>
      ) : merged.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {feedFilter === "fan_content" ? (
            <>
              <span className="text-4xl mb-3">🎭</span>
              <p className="text-gray-400 text-sm font-semibold mb-1">No Fan Content Yet</p>
              <p className="text-gray-500 text-[10px]">Post loops — outlets and fans will cover you next turn.</p>
            </>
          ) : (
            <>
              <Play className="w-12 h-12 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm font-semibold mb-1">No Loops Yet</p>
              <p className="text-gray-500 text-[10px]">Create your first loop to see it here!</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {merged.map((v, idx) => {
            const isOwn = v.artist_id === profile?.id;
            const isNpcPost = v.metadata?.is_npc || v.metadata?.posted_by_outlet || !v.artist_id;
            const concept = VIDEO_CONCEPTS.find(c => c.id === (v.metadata?.video_type || v.post_type));
            const artistData = v.profiles || {};
            const outletIcon = v.metadata?.media_outlet_icon || '';
            const outletName = v.metadata?.media_outlet_name || v.metadata?.reaction_channel_name || '';
            const displayName = isNpcPost
              ? (outletIcon ? `${outletIcon} ${outletName || v.metadata?.artist_name || 'Fan Account'}` : (outletName || v.metadata?.artist_name || 'Fan Account'))
              : (artistData.artist_name || (isOwn ? (profile?.artist_name || 'You') : 'Artist'));
            const avatarUrl = isNpcPost ? null : (artistData.artist_image || (isOwn ? (profile?.artist_image || profile?.profile_image_url) : null));
            const grad = gradients[idx % gradients.length];

            return (
              <motion.div
                key={v.id || idx}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04 }}
                className="w-full bg-black rounded-2xl overflow-hidden"
              >
                {/* Video Preview — 9:16 aspect ratio like real TikTok */}
                <div className="relative aspect-[9/16] bg-black">
                  {/* Thumbnail or gradient fallback */}
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-b ${grad} flex items-center justify-center`}>
                      {concept ? (
                        <span className="text-5xl opacity-40">{concept.icon}</span>
                      ) : (
                        <Play className="w-14 h-14 text-white/30" />
                      )}
                    </div>
                  )}

                  {/* Top gradient */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

                  {/* Viral badge */}
                  {v.is_viral && (
                    <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500/90 backdrop-blur-sm">
                      <Flame className="w-3 h-3 text-white" />
                      <span className="text-white text-[10px] font-bold">VIRAL</span>
                    </div>
                  )}

                  {/* NPC / fan war / trashy media badges */}
                  {v.metadata?.is_fan_war && (
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-orange-500/80 backdrop-blur-sm">
                      <span className="text-white text-[9px] font-bold">🔥 Fan War</span>
                    </div>
                  )}
                  {v.metadata?.is_awkward_clip && (
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-yellow-500/80 backdrop-blur-sm">
                      <span className="text-white text-[9px] font-bold">😬 Viral Clip</span>
                    </div>
                  )}

                  {/* Right side action buttons (TikTok style) */}
                  <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3">
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => onLikePost?.(v.id)}
                        className={`w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-all ${likedPostIds.has(v.id) ? 'bg-pink-500/30 hover:bg-pink-500/40' : 'bg-white/10 hover:bg-white/20'}`}
                      >
                        <Heart className={`w-4.5 h-4.5 ${likedPostIds.has(v.id) ? 'text-pink-400 fill-pink-400' : 'text-white'}`} />
                      </button>
                      <span className="text-white text-[10px] mt-0.5">{formatNum((v.likes || 0) + (likedPostIds.has(v.id) ? 1 : 0))}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                        <MessageCircle className="w-4.5 h-4.5 text-white" />
                      </button>
                      <span className="text-white text-[10px] mt-0.5">{formatNum(v.comments || 0)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                        <Share2 className="w-4.5 h-4.5 text-white" />
                      </button>
                      <span className="text-white text-[10px] mt-0.5">{formatNum(v.shares || 0)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                        <Bookmark className="w-4.5 h-4.5 text-white" />
                      </button>
                      <span className="text-white text-[10px] mt-0.5">{formatNum(v.saves || 0)}</span>
                    </div>
                    {/* Sound disc */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center border-2 border-black animate-spin" style={{ animationDuration: '3s' }}>
                      <Music className="w-3 h-3 text-white" />
                    </div>
                  </div>

                  {/* Bottom overlay: creator info + caption */}
                  <div className="absolute bottom-0 left-0 right-12 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        className="flex items-center gap-2 min-w-0 flex-shrink-0"
                        onClick={() => !isNpcPost && !isOwn && v.profiles && onViewProfile?.(v.profiles)}
                        disabled={isNpcPost || isOwn || !v.profiles}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-white/30" />
                        ) : (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white/30 ${isNpcPost ? 'bg-purple-600' : 'bg-pink-500'}`}>
                            <User className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <span className="text-white text-xs font-bold">{displayName}</span>
                      </button>
                      {isOwn && <span className="text-[7px] bg-pink-500/40 text-pink-200 px-1.5 py-0.5 rounded-full font-semibold">You</span>}
                      {isNpcPost && <span className="text-[7px] bg-purple-500/40 text-purple-200 px-1.5 py-0.5 rounded-full font-semibold">Fan</span>}
                    </div>
                    <p className="text-white/90 text-[11px] line-clamp-2 leading-relaxed">{v.caption || v.title || 'New Loop'}</p>
                    {v.metadata?.hashtags && v.metadata.hashtags.length > 0 && (
                      <p className="text-white/60 text-[9px] mt-1 truncate">
                        {v.metadata.hashtags.slice(0, 3).map(h => normalizeHashtag(h)).join(' ')}
                      </p>
                    )}
                    {/* Sound bar */}
                    {(() => {
                      const rawSound = v.metadata?.sound || '';
                      const soundDisplay = rawSound.startsWith('release:')
                        ? (releaseTitleById[rawSound.replace('release:', '')] || concept?.label || 'Original Sound')
                        : rawSound.startsWith('song:')
                          ? (concept?.label || 'Original Sound')
                          : (rawSound || concept?.label || 'Original Sound');
                      return (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Music className="w-3 h-3 text-white/60" />
                          <div className="flex-1 overflow-hidden">
                            <p className="text-white/60 text-[9px] truncate whitespace-nowrap">
                              {soundDisplay} — {displayName}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* View count overlay */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                    <Eye className="w-3 h-3 text-white/80" />
                    <span className="text-white/80 text-[10px] font-medium">{formatNum(v.views || 0)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateTab({ step, setStep, concept, setConcept, sound, setSound, length, setLength, filter, setFilter, caption, setCaption, hashtags, toggleHashtag, linkedRelease, setLinkedRelease, duetPartner, setDuetPartner, boost, setBoost, releases, songs, profile, posting, handlePost, thumbnailUrl, setThumbnailUrl, thumbnailUploading, handleThumbnailUpload, brandDealContracts, sponsoredContractId, setSponsoredContractId, currentTurnId, duetPartners = [], showOriginalSoundModal, setShowOriginalSoundModal }) {
  const categories = [{ id: "trend", label: "Trend-Based" }, { id: "music", label: "Music" }, { id: "creative", label: "Creative" }, { id: "authentic", label: "Authentic" }, { id: "collab", label: "Collab" }, { id: "promo", label: "Promo" }];
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-1 mb-1">
        {["Concept", "Sound", "Style", "Details", "Cover", "Post"].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${step >= i ? 'bg-pink-500 text-white' : 'bg-white/[0.06] text-gray-600'}`}>{i + 1}</div>
            <span className={`text-[7px] ${step >= i ? 'text-gray-300' : 'text-gray-600'}`}>{s}</span>
            {i < 5 && <div className={`flex-1 h-px ${step > i ? 'bg-pink-500/50' : 'bg-white/[0.06]'}`} />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-2">
          <h3 className="text-white text-sm font-bold">Video Concept</h3>
          {(() => {
            const hasHotRelease = (releases || []).some(r => ['Hot', 'Trending', 'Momentum'].includes(r.lifecycle_state));
            return categories.map(cat => {
              const items = VIDEO_CONCEPTS.filter(c => c.category === cat.id);
              if (!items.length) return null;
              return (<div key={cat.id}>
                <p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mt-2 mb-1">{cat.label}</p>
                {items.map(c => {
                  const locked = c.id === 'meme_drop' && !hasHotRelease;
                  return (
                    <button key={c.id} onClick={() => { if (!locked) { setConcept(c); setStep(1); } }}
                      disabled={locked}
                      className={`w-full text-left border rounded-xl p-2.5 mb-1 transition-all ${locked ? 'bg-white/[0.01] border-white/[0.03] opacity-40 cursor-not-allowed' : 'bg-white/[0.03] border-white/[0.06] hover:border-pink-500/30 active:scale-[0.98]'}`}>
                      <div className="flex items-center gap-2"><span className="text-lg">{c.icon}</span><div className="flex-1">
                        <div className="flex items-center justify-between"><p className="text-white text-[11px] font-semibold">{c.label}</p><span className="text-gray-500 text-[8px]">{locked ? '🔒 Hot release req.' : `-${c.energyCost} energy`}</span></div>
                        <p className="text-gray-500 text-[9px]">{c.desc}</p>
                        <div className="flex gap-1.5 mt-1">
                          <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">~{formatNum(c.baseViews)} views</span>
                          <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{(c.viralChance*100).toFixed(0)}% viral</span>
                        </div></div></div>
                    </button>);
                })}
              </div>);
            });
          })()}
        </div>
      )}

      {step === 1 && (() => {
        const lifecycleToTrend = { Hot: 'rising', Trending: 'peak', Momentum: 'rising', Stable: 'stable', Fading: 'declining', Legacy: 'declining' };
        const trendToViralMult = { rising: 1.4, peak: 1.2, stable: 1.0, declining: 0.7 };
        const playerSounds = (releases || [])
          .filter(r => r.lifecycle_state && (r.lifetime_streams || 0) >= 500)
          .map(r => ({
            id: r.id,
            soundKey: `release:${r.id}`,
            name: r.release_name || r.title || 'Untitled',
            artist: `@${profile?.artist_name || 'you'}`,
            uses: Math.floor((r.lifetime_streams || 0) * 0.03),
            trend: lifecycleToTrend[r.lifecycle_state] || 'stable',
            genre: r.genre || profile?.genre || 'Music',
            viralMultiplier: trendToViralMult[lifecycleToTrend[r.lifecycle_state] || 'stable'] || 1.0,
            isPlayerSound: true,
            releaseId: r.id,
          }))
          .sort((a, b) => b.uses - a.uses)
          .slice(0, 5);

        const playerSongSounds = (songs || [])
          .slice(0, 8)
          .map(s => ({
            id: s.id,
            soundKey: `song:${s.id}`,
            name: s.title || 'Untitled',
            artist: `@${profile?.artist_name || 'you'}`,
            uses: 0,
            trend: 'stable',
            genre: s.genre || profile?.genre || 'Music',
            viralMultiplier: 1.0,
            isPlayerSound: true,
            songId: s.id,
          }));
        const trendBadge = (t) => t === 'rising' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : t === 'peak' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : t === 'declining' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/[0.06] text-gray-400';
        return (<div className="space-y-3">
        <h3 className="text-white text-sm font-bold">Select Sound</h3>
        <p className="text-gray-500 text-[10px]">Trending sounds boost visibility. Your own songs can become viral sounds others use!</p>
        <button onClick={() => setShowOriginalSoundModal(true)} className={`w-full text-left border rounded-xl p-2.5 transition-all ${!sound ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-pink-500/20'}`}>
          <div className="flex items-center gap-2"><Music className="w-4 h-4 text-pink-400" /><div><p className="text-white text-[11px] font-semibold">Original Sound</p><p className="text-gray-500 text-[9px]">Choose from your released songs</p></div></div>
        </button>

        {playerSongSounds.length > 0 && (<>
          <p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mt-1">Your Songs</p>
          {playerSongSounds.map(s => (
            <button key={s.id} onClick={() => { setSound(s); setStep(2); }}
              className={`w-full text-left border rounded-xl p-2.5 transition-all ${sound?.id === s.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-pink-500/20'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/30 to-red-500/30 flex items-center justify-center"><Disc className="w-3.5 h-3.5 text-pink-300" /></div>
                <div className="flex-1"><div className="flex items-center justify-between"><p className="text-white text-[11px] font-semibold">{s.name}</p>
                  <span className="text-[6px] px-1 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/20 font-bold">YOURS</span>
                </div><p className="text-gray-500 text-[9px]">{s.genre}</p></div>
              </div>
            </button>
          ))}
        </>)}

        {playerSounds.length > 0 && (<>
          <p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mt-1">Your Trending Sounds</p>
          {playerSounds.map(s => (
            <button key={s.id} onClick={() => { setSound(s); setStep(2); }}
              className={`w-full text-left border rounded-xl p-2.5 transition-all ${sound?.id === s.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-pink-500/20'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/30 to-red-500/30 flex items-center justify-center"><Disc className="w-3.5 h-3.5 text-pink-300" /></div>
                <div className="flex-1"><div className="flex items-center justify-between"><p className="text-white text-[11px] font-semibold">{s.name}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-[6px] px-1 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/20 font-bold">YOURS</span>
                    <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-semibold ${trendBadge(s.trend)}`}>{s.trend}</span>
                  </div>
                </div><p className="text-gray-500 text-[9px]">{s.genre} · {formatNum(s.uses)} uses · {s.viralMultiplier}x boost</p></div>
              </div>
            </button>
          ))}
        </>)}
        <p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mt-1">Trending Sounds</p>
        {TRENDING_SOUNDS.map(s => (
          <button key={s.id} onClick={() => { setSound(s); setStep(2); }}
            className={`w-full text-left border rounded-xl p-2.5 transition-all ${sound?.id === s.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-pink-500/20'}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center"><Volume2 className="w-3.5 h-3.5 text-pink-400" /></div>
              <div className="flex-1"><div className="flex items-center justify-between"><p className="text-white text-[11px] font-semibold">{s.name}</p>
                <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-semibold ${trendBadge(s.trend)}`}>{s.trend}</span>
              </div><p className="text-gray-500 text-[9px]">{s.artist} · {s.genre} · {formatNum(s.uses)} uses</p></div>
            </div>
          </button>
        ))}
        <button onClick={() => setStep(0)} className="w-full py-2 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
      </div>);
      })()}

      {step === 2 && (<div className="space-y-3">
        <h3 className="text-white text-sm font-bold">Style & Length</h3>
        <p className="text-gray-500 text-[10px]">On LoopTok, raw and authentic outperforms polished. Over-editing can hurt.</p>
        <div><p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mb-1">Video Length</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VIDEO_LENGTHS.map(l => (<button key={l.id} onClick={() => setLength(l.id)} className={`text-left border rounded-xl p-2 transition-all ${length === l.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
              <p className="text-white text-[10px] font-semibold">{l.label}</p><p className="text-gray-500 text-[8px]">{l.desc}</p>
              <span className={`text-[7px] ${l.viralBoost >= 1.1 ? 'text-green-400' : l.viralBoost >= 0.9 ? 'text-gray-400' : 'text-red-400'}`}>Viral: {l.viralBoost}x</span>
            </button>))}
          </div>
        </div>
        <div><p className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider mb-1">Visual Filter</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VISUAL_FILTERS.map(f => (<button key={f.id} onClick={() => setFilter(f.id)} className={`text-left border rounded-xl p-2 transition-all ${filter === f.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
              <p className="text-white text-[10px] font-semibold">{f.label}</p><p className="text-gray-500 text-[8px]">{f.desc}</p>
              <span className={`text-[7px] ${f.viralBoost >= 1.1 ? 'text-green-400' : f.viralBoost >= 0.95 ? 'text-gray-400' : 'text-red-400'}`}>Viral: {f.viralBoost}x</span>
            </button>))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
          <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-sm">Next</button>
        </div>
      </div>)}

      {step === 3 && (<div className="space-y-3">
        <h3 className="text-white text-sm font-bold">Details & Hashtags</h3>
        <div><label className="text-gray-400 text-[10px] font-semibold mb-1 block">Caption</label>
          <input type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption..." maxLength={150} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-pink-500/40" /></div>
        <div><p className="text-gray-400 text-[10px] font-semibold mb-1">Hashtags ({hashtags.length}/6)</p>
          <div className="flex flex-wrap gap-1.5">
            {TRENDING_HASHTAGS.map(h => (<button key={h.tag} onClick={() => toggleHashtag(h.tag)} className={`text-[9px] px-2 py-1 rounded-full border transition-all ${hashtags.includes(h.tag) ? 'bg-pink-500/20 border-pink-500/30 text-pink-400' : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:text-gray-300'}`}>{h.tag} {h.hot && <Flame className="w-2 h-2 inline text-amber-400" />}</button>))}
          </div></div>
        {concept?.id === "duet" && (() => {
          const duetList = (duetPartners && duetPartners.length > 0) ? duetPartners : DUET_PARTNERS;
          return (
            <div>
              <p className="text-gray-400 text-[10px] font-semibold mb-1">Duet / Stitch Partner</p>
              {duetList.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDuetPartner(duetPartner?.id === d.id ? null : d)}
                  className={`w-full text-left border rounded-xl p-2 mb-1 transition-all ${duetPartner?.id === d.id ? 'bg-pink-500/10 border-pink-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {d.artist_image ? (
                        <img src={d.artist_image} alt="" className="w-7 h-7 rounded-full object-cover border border-white/[0.12]" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08]" />
                      )}
                      <div>
                        <p className="text-white text-[10px] font-semibold">{d.name}</p>
                        <p className="text-gray-500 text-[8px]">{d.style} · {d.followers}</p>
                      </div>
                    </div>
                    <span className={`text-[8px] font-semibold ${d.compat >= 0.8 ? 'text-green-400' : d.compat >= 0.6 ? 'text-amber-400' : 'text-gray-500'}`}>{Math.floor(d.compat*100)}% match</span>
                  </div>
                </button>
              ))}
            </div>
          );
        })()}
        {releases?.length > 0 && (<div><label className="text-gray-400 text-[10px] font-semibold mb-1 block">Link Release (optional)</label>
          <select value={linkedRelease} onChange={e => setLinkedRelease(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none">
            <option value="">None</option>{releases.map(r => <option key={r.id} value={r.id}>{r.title || r.release_name || "Untitled"}</option>)}
          </select></div>)}
        <div className="flex gap-2">
          <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
          <button onClick={() => setStep(4)} className="flex-1 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-sm">Next</button>
        </div>
      </div>)}

      {step === 4 && (<div className="space-y-3">
        <h3 className="text-white text-sm font-bold">Cover Image</h3>
        <p className="text-gray-500 text-[10px]">Upload a thumbnail to make your Loop stand out in feeds. Optional but recommended.</p>
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
          {thumbnailUrl ? (
            <div className="space-y-2">
              <div className="w-full aspect-[9/16] max-h-48 rounded-xl overflow-hidden bg-black flex items-center justify-center">
                <img src={thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
              </div>
              <button onClick={() => setThumbnailUrl("")} className="w-full py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-colors">
                Remove Thumbnail
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-white/[0.02] rounded-xl transition-colors">
              {thumbnailUploading ? (
                <div className="w-6 h-6 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-2">
                    <Sparkles className="w-5 h-5 text-pink-400" />
                  </div>
                  <p className="text-white text-xs font-semibold">Upload Cover Image</p>
                  <p className="text-gray-500 text-[9px] mt-0.5">JPG, PNG, or WebP · Max 5MB</p>
                </>
              )}
              <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" disabled={thumbnailUploading} />
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
          <button onClick={() => setStep(5)} className="flex-1 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-sm">{thumbnailUrl ? 'Review' : 'Skip & Review'}</button>
        </div>
      </div>)}

      {step === 5 && concept && (<div className="space-y-3">
        <h3 className="text-white text-sm font-bold">Review & Post</h3>
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
          {[["Concept", `${concept.icon} ${concept.label}`], ["Sound", sound?.name || "Original"], ["Length", VIDEO_LENGTHS.find(l => l.id === length)?.label], ["Filter", VISUAL_FILTERS.find(f => f.id === filter)?.label], ["Hashtags", `${hashtags.length} tags`]].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]"><span className="text-gray-400">{k}</span><span className="text-white font-semibold">{v}</span></div>))}
          {duetPartner && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Duet</span><span className="text-pink-400 font-semibold">{duetPartner.name}</span></div>}
        </div>

        {(() => {
          const activeContracts = (brandDealContracts || []).filter(c => String(c.status) === 'active' && (
            String(c.primary_platform || '').toLowerCase() === 'looptok' ||
            (Array.isArray(c.platform_scope) && c.platform_scope.includes('looptok'))
          ));
          if (activeContracts.length === 0) return null;
          return (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white text-[11px] font-semibold">Sponsor this post (optional)</p>
                <span className="text-[10px] text-amber-200/80">Turn {Number(currentTurnId || 0)}</span>
              </div>
              <p className="text-gray-500 text-[9px]">Select an active contract to count this post as a deliverable.</p>
              <p className="text-[10px] text-purple-300 mb-1">These deals require LoopTok posts</p>
              <select
                value={sponsoredContractId || ''}
                onChange={(e) => setSponsoredContractId?.(e.target.value)}
                className="w-full bg-black/30 border border-white/[0.10] rounded-xl px-3 py-2 text-white text-[11px] outline-none"
              >
                <option value="">Not sponsored</option>
                {activeContracts.map(c => {
                  const remaining = Math.max(0, Number(c.deliverable_count_required || 1) - Number(c.deliverable_count_completed || 0));
                  const scopeLabel = (() => {
                    const scope = String(c.platform_scope || c.primary_platform || '').toLowerCase();
                    if (scope === 'cross_platform') return 'All Platforms';
                    return 'LoopTok';
                  })();
                  return (
                    <option key={c.id} value={c.id}>
                      {c.brand_name} · {remaining} deliverable{remaining === 1 ? '' : 's'} left · {scopeLabel}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })()}

        <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
          <div className="flex justify-between text-[11px]"><span className="text-gray-400">Energy Cost</span><span className="text-white font-semibold">-{concept.energyCost}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-gray-400">Base Views</span><span className="text-white font-semibold">~{formatNum(concept.baseViews)}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-gray-400">Viral Chance</span><span className="text-amber-400 font-semibold">{(concept.viralChance*100).toFixed(0)}%</span></div>
        </div>
        <button onClick={() => setBoost(!boost)} className={`w-full text-left border rounded-xl p-2.5 transition-all ${boost ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
          <div className="flex items-center gap-2"><Zap className={`w-4 h-4 ${boost ? 'text-amber-400' : 'text-gray-600'}`} />
            <div><p className="text-white text-[11px] font-semibold">Boost Post (-10 hype)</p><p className="text-gray-500 text-[9px]">Spend hype to push to more FYPs. +50% views & followers.</p></div></div>
        </button>
        <div className="flex gap-2">
          <button onClick={() => setStep(4)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
          <button onClick={handlePost} disabled={posting} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white font-semibold text-sm disabled:opacity-50">
            {posting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : "Post Loop"}</button>
        </div>
      </div>)}
    </div>
  );
}


function InboxTab({
  posts, followers, totalViews, viralPosts, algoState, creatorState,
  account, currentTurnId,
  brandDealOffers, brandDealContracts, brandDealsLoading,
  acceptingDealId, decliningDealId, onAcceptBrandDeal, onDeclineBrandDeal,
  inboxNotifications, algorithmMood,
}) {
  const [inboxSubTab, setInboxSubTab] = useState("activity");

  const activeContracts = (brandDealContracts || []).filter(c => String(c.status) === 'active');
  const looptokOffers = brandDealOffers || [];
  const collabNotifs = inboxNotifications || [];

  const notifIcon = (type) => {
    if (type === 'LOOPTOK_DUET') return '🤝';
    if (type === 'COLLABORATION_REQUEST') return '📨';
    if (type === 'COLLABORATION_ACCEPTED') return '✅';
    if (type === 'COLLABORATION_DECLINED') return '❌';
    return '🔔';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="flex gap-1 px-4 pt-3 pb-2 flex-shrink-0 border-b border-white/[0.06]">
        {[{ id: "activity", label: "Activity" }, { id: "creator_tools", label: "Creator Tools" }].map(t => (
          <button key={t.id} onClick={() => setInboxSubTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${inboxSubTab === t.id ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {inboxSubTab === "activity" ? (
          <div className="p-4 space-y-5">
            {/* Brand Deal Offers */}
            {looptokOffers.length > 0 && (
              <div>
                <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-amber-400" /> New Brand Deals
                </h4>
                <div className="space-y-3">
                  {looptokOffers.map(offer => {
                    const deliverableType = offer.metadata?.deliverable_type || 'post';
                    const DELIVERABLE_LABELS = {
                      video: 'a sponsored video',
                      post: 'a sponsored post',
                      cross_platform: 'cross-platform content',
                      get_ready: 'a Get Ready With Me (GRWM) video',
                    };
                    const deliverableLabel = DELIVERABLE_LABELS[deliverableType] || 'sponsored content';
                    const brandHashtag = `#${(offer.brand_name || '').replace(/\s+/g, '')}`;
                    return (
                      <div key={offer.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-[13px] font-bold">{offer.brand_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold capitalize">{offer.tier || 'local'} Level</span>
                              {offer.category && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-gray-400 capitalize">{offer.category}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-amber-300 text-[12px] font-bold">${Number(offer.signing_bonus || 0).toLocaleString()}</p>
                            <p className="text-gray-500 text-[9px]">signing + ${Number(offer.per_turn_fee || 0).toLocaleString()}/turn</p>
                          </div>
                        </div>
                        {/* Deliverables */}
                        <div>
                          <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider mb-1.5">Deliverables</p>
                          <ul className="space-y-1.5">
                            <li className="flex items-start gap-2 text-[10px] text-gray-300">
                              <span className="text-amber-400 flex-shrink-0">•</span>
                              <span>Make {deliverableLabel} on LoopTok featuring {offer.brand_name}</span>
                            </li>
                            <li className="flex items-start gap-2 text-[10px]">
                              <span className="text-amber-400 flex-shrink-0">•</span>
                              <span>Use the <span className="text-pink-400 font-semibold">{brandHashtag}</span> hashtag</span>
                            </li>
                          </ul>
                        </div>
                        {(offer?.metadata?.scene_fit_reason || Number(offer?.metadata?.scene_brand_bonus_pct || 0) > 0) && (
                          <p className="text-indigo-300 text-[9px]">
                            {offer?.metadata?.scene_fit_reason || `+${Number(offer?.metadata?.scene_brand_bonus_pct || 0)}% scene lift`}
                          </p>
                        )}
                        {/* Accept / Decline */}
                        <div className="flex gap-2">
                          <button onClick={() => onAcceptBrandDeal?.(offer.id)} disabled={acceptingDealId === offer.id}
                            className="flex-1 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-semibold disabled:opacity-40">
                            {acceptingDealId === offer.id ? 'Accepting…' : 'Accept Deal'}
                          </button>
                          <button onClick={() => onDeclineBrandDeal?.(offer.id)} disabled={decliningDealId === offer.id}
                            className="flex-1 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-gray-400 text-[10px] font-semibold disabled:opacity-40">
                            {decliningDealId === offer.id ? 'Declining…' : 'Decline'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Sponsorship Contracts */}
            {activeContracts.length > 0 && (
              <div>
                <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-green-400" /> Active Sponsorships
                </h4>
                <div className="space-y-2">
                  {activeContracts.slice(0, 3).map(contract => {
                    const completed = Number(contract.deliverable_count_completed || 0);
                    const required = Math.max(1, Number(contract.deliverable_count_required || 1));
                    const remaining = Math.max(0, required - completed);
                    const turnsLeft = Math.max(0, Number(contract.end_turn_id || 0) - Number(currentTurnId || 0));
                    return (
                      <div key={contract.id} className="bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-white text-[11px] font-bold">{contract.brand_name}</p>
                          <span className="text-green-400 text-[8px] font-semibold">ACTIVE</span>
                        </div>
                        <p className="text-gray-500 text-[9px] mb-1.5">{remaining} deliverable{remaining !== 1 ? 's' : ''} left · {turnsLeft} turns remaining</p>
                        <div className="bg-white/[0.06] rounded-full h-1.5">
                          <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (completed / required) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Collab & Duet Notifications */}
            {collabNotifs.length > 0 && (
              <div>
                <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Music className="w-3 h-3 text-purple-400" /> Collabs & Duets
                </h4>
                <div className="space-y-1">
                  {collabNotifs.map((n, i) => (
                    <div key={n.id || i} className={`flex items-center gap-2.5 py-2.5 px-2 rounded-lg ${!n.is_read ? 'bg-purple-500/5' : ''}`}>
                      <span className="text-lg flex-shrink-0">{notifIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[11px] font-semibold">{n.title}</p>
                        <p className="text-gray-500 text-[9px]">{n.subtitle || n.body}</p>
                      </div>
                      {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Viral Moments */}
            {posts.filter(p => p.is_viral).length > 0 && (
              <div>
                <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Flame className="w-3 h-3 text-amber-400" /> Viral Moments
                </h4>
                {posts.filter(p => p.is_viral).slice(0, 3).map((post, i) => (
                  <div key={post.id || i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                    <div className="w-8 h-11 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center flex-shrink-0">
                      {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Flame className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[11px] font-semibold truncate">{post.title || post.post_type}</p>
                      <p className="text-gray-500 text-[9px]">{formatNum(post.views || 0)} views · {formatNum(post.likes || 0)} likes</p>
                    </div>
                    <Flame className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {looptokOffers.length === 0 && activeContracts.length === 0 && collabNotifs.length === 0 && posts.filter(p => p.is_viral).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bell className="w-12 h-12 text-gray-700 mb-3" />
                <p className="text-gray-400 text-sm font-semibold">No Activity Yet</p>
                <p className="text-gray-600 text-[10px] mt-1 max-w-[200px]">Post content to attract brand deals, collaborations, and go viral.</p>
              </div>
            )}
          </div>
        ) : (
          <CreatorToolsTab
            posts={posts}
            followers={followers}
            totalViews={totalViews}
            viralPosts={viralPosts}
            account={account}
            algoState={algoState}
            creatorState={creatorState}
            currentTurnId={currentTurnId}
            brandDealOffers={brandDealOffers}
            brandDealContracts={brandDealContracts}
            brandDealsLoading={brandDealsLoading}
            acceptingDealId={acceptingDealId}
            decliningDealId={decliningDealId}
            onAcceptBrandDeal={onAcceptBrandDeal}
            onDeclineBrandDeal={onDeclineBrandDeal}
            algorithmMood={algorithmMood}
          />
        )}
      </div>
    </div>
  );
}
