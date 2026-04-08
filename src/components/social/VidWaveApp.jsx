// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Play, ThumbsUp, Eye, Film, DollarSign, Zap, Plus,
  MessageCircle, Users, TrendingUp, BarChart3, Search, Star, Tv, Video, Mic, Sparkles, Heart, Share2, Monitor, Smartphone,
  Home, Pencil, MoreVertical
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import ImageUpload from "@/components/ui/ImageUpload";
import { showToast } from "@/components/ui/toast-provider";
import BrandDealContractCard from "@/components/social/BrandDealContractCard";
import { computeSponsoredUpliftFromLogRow, safeNum } from "@/components/social/sponsorshipAnalytics";

const CONTENT_PILLARS = [
  { id: "music_videos", label: "Music Videos", icon: Film, desc: "Official MVs, lyric videos, visualizers", audienceAppeal: 0.9, monetization: 0.7, evergreenScore: 0.95 },
  { id: "behind_music", label: "Behind the Music", icon: Mic, desc: "Studio sessions, songwriting, production breakdowns", audienceAppeal: 0.7, monetization: 0.5, evergreenScore: 0.8 },
  { id: "weekly_vlogs", label: "Weekly Vlogs", icon: Video, desc: "Day-in-the-life, tour diaries, personal updates", audienceAppeal: 0.8, monetization: 0.6, evergreenScore: 0.4 },
  { id: "reactions", label: "Song Reactions", icon: MessageCircle, desc: "React to fan covers, other artists, industry news", audienceAppeal: 0.65, monetization: 0.55, evergreenScore: 0.3 },
  { id: "collabs", label: "Collaborations", icon: Users, desc: "Joint sessions, interviews, features", audienceAppeal: 0.85, monetization: 0.65, evergreenScore: 0.6 },
  { id: "deep_dives", label: "Deep Dives", icon: Search, desc: "Album breakdowns, music theory, genre history", audienceAppeal: 0.5, monetization: 0.45, evergreenScore: 0.9 },
];

const VIDEO_TYPES = [
  { id: "music_video", pillar: "music_videos", label: "Music Video", desc: "Official MV — highest production", energyCost: 15, baseViews: 5000, adRate: 0.003, subGain: 0.004, duration: "3:30", minQuality: 2, alignmentTag: "music_focus" },
  { id: "lyric_video", pillar: "music_videos", label: "Lyric Video", desc: "Animated lyrics — cost-effective promo", energyCost: 8, baseViews: 2000, adRate: 0.002, subGain: 0.002, duration: "3:30", minQuality: 1, alignmentTag: "music_focus" },
  { id: "visualizer", pillar: "music_videos", label: "Visualizer", desc: "Abstract visuals synced to track", energyCost: 6, baseViews: 1500, adRate: 0.0018, subGain: 0.002, duration: "3:30", minQuality: 1, alignmentTag: "music_focus" },
  { id: "studio_session", pillar: "behind_music", label: "Studio Session", desc: "Raw recording, beat-making, vocal takes", energyCost: 5, baseViews: 1200, adRate: 0.0025, subGain: 0.003, duration: "15:00", minQuality: 0, alignmentTag: "authentic" },
  { id: "songwriting", pillar: "behind_music", label: "Songwriting Process", desc: "Lyrics, melody, arrangement walkthrough", energyCost: 6, baseViews: 900, adRate: 0.002, subGain: 0.003, duration: "20:00", minQuality: 0, alignmentTag: "authentic" },
  { id: "vlog", pillar: "weekly_vlogs", label: "Weekly Vlog", desc: "Personal updates, daily routine", energyCost: 4, baseViews: 1000, adRate: 0.0022, subGain: 0.003, duration: "10:00", minQuality: 0, alignmentTag: "authentic" },
  { id: "tour_diary", pillar: "weekly_vlogs", label: "Tour Diary", desc: "On-the-road footage, show prep", energyCost: 5, baseViews: 1400, adRate: 0.0024, subGain: 0.004, duration: "12:00", minQuality: 0, alignmentTag: "lifestyle" },
  { id: "reaction", pillar: "reactions", label: "Reaction Video", desc: "React to fan covers, trending songs", energyCost: 3, baseViews: 800, adRate: 0.0015, subGain: 0.002, duration: "10:00", minQuality: 0, alignmentTag: "community_engagement" },
  { id: "collab_video", pillar: "collabs", label: "Collab Video", desc: "Joint session with another creator", energyCost: 8, baseViews: 3000, adRate: 0.0028, subGain: 0.005, duration: "15:00", minQuality: 1, alignmentTag: "collab_culture" },
  { id: "interview", pillar: "collabs", label: "Interview / Q&A", desc: "Sit-down interview, fan AMA", energyCost: 4, baseViews: 700, adRate: 0.002, subGain: 0.002, duration: "20:00", minQuality: 0, alignmentTag: "community_engagement" },
  { id: "deep_dive", pillar: "deep_dives", label: "Deep Dive", desc: "Album breakdown, genre analysis", energyCost: 7, baseViews: 600, adRate: 0.002, subGain: 0.003, duration: "25:00", minQuality: 1, alignmentTag: "music_focus" },
  { id: "live_performance", pillar: "music_videos", label: "Live Performance", desc: "Acoustic, live recordings, concert footage", energyCost: 10, baseViews: 3000, adRate: 0.0028, subGain: 0.005, duration: "8:00", minQuality: 1, alignmentTag: "music_focus" },
  { id: "short", pillar: "music_videos", label: "VidWave Short", desc: "60s vertical clip — algorithm-boosted", energyCost: 3, baseViews: 2500, adRate: 0.0005, subGain: 0.003, duration: "0:60", minQuality: 0, alignmentTag: "viral_content" },
  { id: "radio_interview", pillar: "collabs", label: "Radio Interview", desc: "Share your on-air interview and shout out the show", energyCost: 5, baseViews: 1400, adRate: 0.0022, subGain: 0.003, duration: "10:00", minQuality: 0, alignmentTag: "radio_interview" },
  { id: "apology_tour", pillar: "weekly_vlogs", label: "Apology Tour", desc: "Public address — rebuilds brand trust after controversy", energyCost: 10, baseViews: 8000, adRate: 0.002, subGain: 0.003, duration: "12:00", minQuality: 0, alignmentTag: "apology_tour", requiresControversy: true },
];

const PRODUCTION_TIERS = [
  { id: 0, label: "DIY / Phone", cost: 0, qualityMult: 0.7, retentionMult: 0.6, desc: "Shot on phone, minimal editing", icon: Smartphone },
  { id: 1, label: "Basic Setup", cost: 100, qualityMult: 1.0, retentionMult: 0.8, desc: "Decent camera, basic lighting", icon: Monitor },
  { id: 2, label: "Professional", cost: 500, qualityMult: 1.5, retentionMult: 1.0, desc: "Pro camera, lighting, color grading", icon: Video },
  { id: 3, label: "Studio Grade", cost: 1500, qualityMult: 2.2, retentionMult: 1.2, desc: "Full crew, multi-cam, cinematic", icon: Film },
  { id: 4, label: "Blockbuster", cost: 5000, qualityMult: 3.5, retentionMult: 1.4, desc: "Director, VFX, sets, A-list production", icon: Star },
];

const SEO_TAG_POOL = [
  "NewMusic", "OfficialMV", "BehindTheScenes", "StudioSession", "Vlog",
  "Acoustic", "LivePerformance", "Reaction", "MusicVideo", "Collab",
  "HipHop", "RnB", "Pop", "Indie", "Rap", "Soul", "Electronic", "Rock",
  "Trending", "Viral", "FirstListen", "AlbumReview", "SongBreakdown",
  "TourLife", "DayInTheLife", "FanQA", "Freestyle", "Cover", "Remix",
];

const COMMENT_TEMPLATES = {
  positive: ["This is incredible!!", "Your best work yet", "Production quality is insane", "Subscribed instantly", "Watched this 10 times", "So underrated", "Visuals are stunning", "Deserves way more views"],
  neutral: ["Not bad, keep going", "Interesting concept", "Beat is cool but mix needs work", "When's the next upload?", "First time here"],
  negative: ["Mid tbh", "Audio quality needs work", "This ain't it", "You fell off", "Trying too hard"],
};

const MILESTONE_THRESHOLDS = [
  { subs: 100, label: "Rising Creator", reward: 0, badge: "🌱", perk: "Custom channel URL" },
  { subs: 1000, label: "Silver Play Button", reward: 100, badge: "🥈", perk: "Full monetization" },
  { subs: 10000, label: "Gold Play Button", reward: 500, badge: "🥇", perk: "Channel memberships" },
  { subs: 100000, label: "Diamond Play Button", reward: 5000, badge: "💎", perk: "Merch shelf" },
  { subs: 1000000, label: "Ruby Play Button", reward: 50000, badge: "❤️", perk: "Partner Manager" },
];

// Performance calculations moved to backend: supabase/functions/_shared/socialMedia/youtubeHandler.ts
// Frontend now calls edge function instead of calculating locally

function formatNum(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function formatTime(m) { return m >= 1440 ? `${(m/1440).toFixed(1)}d` : m >= 60 ? `${(m/60).toFixed(1)}h` : `${m}m`; }

function timeAgo(dateStr) {
  if (!dateStr) return 'Recently';
  // Calculate days since video was created (simplified approach)
  const videoDate = new Date(dateStr);
  const daysSinceCreation = Math.floor((Date.now() - videoDate.getTime()) / (24 * 60 * 60 * 1000));
  
  if (daysSinceCreation === 0) return 'Today';
  if (daysSinceCreation === 1) return '1 Day Ago';
  return `${daysSinceCreation} Days Ago`;
}

function genComments(sentiment, count) {
  const pool = sentiment === "positive" ? [...COMMENT_TEMPLATES.positive, ...COMMENT_TEMPLATES.neutral]
    : sentiment === "mixed" ? [...COMMENT_TEMPLATES.positive, ...COMMENT_TEMPLATES.neutral, ...COMMENT_TEMPLATES.negative]
    : [...COMMENT_TEMPLATES.neutral, ...COMMENT_TEMPLATES.negative];
  return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
}

function buildVidWaveVideoViewModel(video, youtubeVideo, artistProfile, sponsoredLink) {
  const metadata = video?.metadata || {};
  const resolvedProductionTier = youtubeVideo?.production_tier ?? metadata?.production_tier ?? 0;
  const resolvedPillarType = youtubeVideo?.pillar_type || metadata?.pillar_type || null;
  const resolvedRetentionPct = youtubeVideo?.retention_pct ?? metadata?.retention_pct ?? 50;
  const resolvedSeoTags = Array.isArray(metadata?.seo_tags) ? metadata.seo_tags : [];
  const resolvedWatchTimeMinutes = youtubeVideo?.watch_time_avg ?? metadata?.watch_time_minutes ?? 0;
  const resolvedLinkedReleaseId = youtubeVideo?.linked_release_id || video?.linked_release_id || null;
  const resolvedQualityScore = youtubeVideo?.quality_score ?? null;
  const resolvedQualityLabel = PRODUCTION_TIERS.find((tier) => tier.id === Number(resolvedProductionTier))?.label || null;
  const resolvedMonetized = youtubeVideo?.monetized ?? video?.monetized ?? false;
  const resolvedRpm = youtubeVideo?.revenue_per_mille ?? video?.revenue_per_mille ?? 0;
  const resolvedProductionCost = youtubeVideo?.production_cost ?? null;
  const resolvedChannelMembershipsEnabled = youtubeVideo?.channel_memberships_enabled ?? false;
  const resolvedVideoType = metadata?.video_type || video?.post_type || null;

  return {
    ...video,
    artistProfile: artistProfile || null,
    sponsoredLink: sponsoredLink || null,
    youtubeVideo: youtubeVideo || null,
    resolvedVideoType,
    resolvedPillarType,
    resolvedProductionTier,
    resolvedRetentionPct,
    resolvedSeoTags,
    resolvedWatchTimeMinutes,
    resolvedLinkedReleaseId,
    resolvedQualityScore,
    resolvedQualityLabel,
    resolvedMonetized,
    resolvedRpm,
    resolvedProductionCost,
    resolvedChannelMembershipsEnabled,
  };
}

export default function VidWaveApp({ onClose, profile, releases, currentEra: _currentEra }) {
  const [tab, setTab] = useState("foryou");
  const [channelName, setChannelName] = useState("");
  const [editingChannel, setEditingChannel] = useState(false);
  const [channelNameDraft, setChannelNameDraft] = useState("");
  const [videos, setVideos] = useState([]);
  const [allVideos, setAllVideos] = useState([]); // For Shorts tab - includes all users' videos
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [createStep, setCreateStep] = useState(0);
  const [selectedType, setSelectedType] = useState(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [linkedRelease, setLinkedRelease] = useState("");
  const [linkedSong, setLinkedSong] = useState("");
  const [songs, setSongs] = useState([]);
  const [productionTier, setProductionTier] = useState(0);
  const [seoTags, setSeoTags] = useState([]);
  const [contentHook, setContentHook] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [targetArtist, setTargetArtist] = useState(null); // For reaction/collab videos
  const [npcArtists, setNpcArtists] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [eligibleContracts, setEligibleContracts] = useState([]);
  const [selectedSponsoredContractId, setSelectedSponsoredContractId] = useState('');
  const [controversyCount, setControversyCount] = useState(0);
  const [sponsorshipAnalytics, setSponsorshipAnalytics] = useState([]);
  const [vidwaveSponsorships, setVidwaveSponsorships] = useState({
    active_contracts: [],
    offers: [],
    monetization: { ad_revenue_total: 0, sponsored_uplift_total: 0, sponsored_uplift_this_turn: 0 },
  });
  const [acceptingOfferId, setAcceptingOfferId] = useState(null);
  const [sponsorshipsLoading, setSponsorshipsLoading] = useState(false);
  const [sponsorshipsError, setSponsorshipsError] = useState('');
  const [focusSponsorSelectorKey, setFocusSponsorSelectorKey] = useState(0);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!profile?.id) return;
    loadData();
  }, [currentTurnIndex, profile?.id]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const loadData = async () => {
    try {
      if (!profile?.id) { setLoading(false); return; }

      // All direct DB reads — no base44.entities, no edge functions
      const [myVideosRes, allVideosRes, allShortsRes, accountRes, npcRes, songsRes, sponsoredRowsRes, adLogRowsRes] = await Promise.all([
        supabaseClient
          .from('social_posts')
          .select('*')
          .eq('platform', 'vidwave')
          .eq('artist_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('social_posts')
          .select('*')
          .eq('platform', 'vidwave')
          .order('created_at', { ascending: false })
          .limit(100)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('social_posts')
          .select('*')
          .eq('platform', 'vidwave')
          .eq('post_type', 'short')
          .order('created_at', { ascending: false })
          .limit(100)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('social_accounts')
          .select('*')
          .eq('artist_id', profile.id)
          .eq('platform', 'vidwave')
          .limit(1)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('profiles')
          .select('id, artist_name, followers, clout')
          .neq('id', profile.id)
          .not('artist_name', 'is', null)
          .order('followers', { ascending: false })
          .limit(10)
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
          .from('sponsored_content')
          .select('content_id, contract_id, metadata')
          .eq('player_id', profile.id)
          .eq('platform', 'vidwave')
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('vidwave_ad_revenue_log')
          .select('post_id, global_turn_id, ad_revenue, metadata')
          .eq('player_id', profile.id)
          .order('global_turn_id', { ascending: false })
          .limit(200)
          .then(r => r.data || []).catch(() => []),
      ]);

      // Load controversy count for apology_tour lock
      const { count: contCount } = await supabaseClient
        .from('controversy_cases')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', profile.id)
        .neq('phase', 'resolved');
      setControversyCount(contCount || 0);

      // Batch-load artist profiles for all videos
      const allArtistIds = [...new Set([...myVideosRes, ...allVideosRes].map(v => v.artist_id).filter(Boolean))];
      const { data: artistProfiles } = allArtistIds.length > 0
        ? await supabaseClient.from('profiles').select('id, artist_name, artist_image, followers, career_stage').in('id', allArtistIds)
        : { data: [] };
      const profileMap = new Map((artistProfiles || []).map(p => [p.id, p]));

      const allSocialPostIds = [...new Set([...myVideosRes, ...allVideosRes, ...allShortsRes].map(v => v.id).filter(Boolean))];
      const { data: youtubeVideoRows } = allSocialPostIds.length > 0
        ? await supabaseClient
          .from('youtube_videos')
          .select('social_post_id, pillar_type, quality_score, seo_score, watch_time_avg, production_cost, linked_release_id, channel_memberships_enabled, revenue_per_mille, monetized, production_tier, retention_pct')
          .in('social_post_id', allSocialPostIds)
        : { data: [] };
      const youtubeVideoMap = new Map((youtubeVideoRows || []).map(row => [row.social_post_id, row]));

      const sponsoredMap = new Map((sponsoredRowsRes || []).map(r => [r.content_id, r]));
      const videosWithProfiles = myVideosRes.map(video => buildVidWaveVideoViewModel(
        video,
        youtubeVideoMap.get(video.id) || null,
        profileMap.get(video.artist_id) || null,
        sponsoredMap.get(video.id) || null,
      ));
      const allVideosWithProfiles = [...allVideosRes, ...allShortsRes].map(video => buildVidWaveVideoViewModel(
        video,
        youtubeVideoMap.get(video.id) || null,
        profileMap.get(video.artist_id) || null,
        sponsoredMap.get(video.id) || null,
      ));

      setVideos(videosWithProfiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setAllVideos(allVideosWithProfiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

      if (accountRes.length > 0) {
        setAccount(accountRes[0]);
      } else {
        const { data: newAcc } = await supabaseClient
          .from('social_accounts')
          .insert({
            artist_id: profile.id, platform: 'vidwave',
            subscribers: Math.floor((profile.followers || 0) * 0.15),
            followers: Math.floor((profile.followers || 0) * 0.15),
          })
          .select()
          .single()
          .catch(() => ({ data: null }));
        setAccount(newAcc);
      }

      setNpcArtists(npcRes);
      setSongs(songsRes);
      setSponsorshipAnalytics(adLogRowsRes || []);

      await loadSponsorships();
    } catch (e) { console.error("[VidWave] Load error:", e); }
    finally { setLoading(false); }
  };

  const loadSponsorships = async () => {
    if (!profile?.id) return;
    try {
      setSponsorshipsLoading(true);
      setSponsorshipsError('');
      const sponsorshipResp = await base44.functions.invoke('socialMedia', {
        action: 'getVidWaveSponsorships',
        artistId: profile.id,
        platform: 'vidwave',
        currentTurn: currentTurnIndex || 0,
      });
      const sponsorshipData = sponsorshipResp?.data || sponsorshipResp || {};
      const activeContracts = sponsorshipData?.active_contracts || [];

      setVidwaveSponsorships({
        active_contracts: activeContracts,
        offers: sponsorshipData?.offers || [],
        monetization: sponsorshipData?.monetization || { ad_revenue_total: 0, sponsored_uplift_total: 0, sponsored_uplift_this_turn: 0 },
      });
      setEligibleContracts(activeContracts.map(c => ({
        contract_id: c.id,
        brand_name: c.brand_name,
        tier: c.tier,
        category: c.category,
        deliverables_remaining: c.deliverables_remaining,
        contract_end_turn_id: (currentTurnIndex || 0) + (c.turns_remaining || 0),
        turns_remaining: c.turns_remaining,
        persona_fit_score: c.persona_fit_score,
      })));
    } catch (e) {
      setSponsorshipsError(e?.message || 'Failed to load sponsorships');
    } finally {
      setSponsorshipsLoading(false);
    }
  };

  // Load current turn for in-game time calculations
  useEffect(() => {
    const loadCurrentTurn = async () => {
      try {
        const { data } = await supabaseClient
          .from('turn_state')
          .select('global_turn_id')
          .eq('id', 1)
          .maybeSingle();
        setCurrentTurnIndex(data?.global_turn_id ?? 0);
      } catch (e) {
        console.error("[VidWave] Failed to load current turn:", e);
        setCurrentTurnIndex(0);
      }
    };
    loadCurrentTurn();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    if (tab === 'monetize' || tab === 'create') {
      loadSponsorships();
    }
  }, [tab, profile?.id, currentTurnIndex]);

  const _pillarConsistency = useMemo(() => {
    if (videos.length < 3) return 0;
    const counts = {};
    videos.forEach(v => {
      if (v.metadata?.is_npc_reaction) return; // Skip reactions
      if (v.resolvedPillarType) counts[v.resolvedPillarType] = (counts[v.resolvedPillarType] || 0) + 1;
    });
    return Math.min(3, Object.values(counts).filter(c => c >= 2).length);
  }, [videos]);

  const seoScore = useMemo(() => Math.min(5, seoTags.length), [seoTags]);
  
  const subs = account?.followers || 0;
  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalWatchTime = videos.reduce((s, v) => s + (v.resolvedWatchTimeMinutes || 0), 0);
  const totalRevenue = account?.total_revenue || 0;
  const currentMilestone = MILESTONE_THRESHOLDS.slice().reverse().find(m => subs >= m.subs);
  const nextMilestone = MILESTONE_THRESHOLDS.find(m => subs < m.subs);
  const sponsorshipMonetization = vidwaveSponsorships?.monetization || { ad_revenue_total: 0, sponsored_uplift_total: 0, sponsored_uplift_this_turn: 0 };

  const handleUpload = async () => {
    if (!selectedType || !profile?.id || uploading) return;

    if (!thumbnailUrl) {
      showToast("Thumbnail is required for video upload", "warning");
      return;
    }

    if ((profile.energy || 0) < selectedType.energyCost) {
      showToast(`Not enough energy! Need ${selectedType.energyCost}, have ${profile.energy || 0}.`, "error");
      return;
    }

    const productionCost = PRODUCTION_TIERS[productionTier]?.cost || 0;
    if (productionCost > 0 && (profile.income || 0) < productionCost) {
      showToast(`Not enough funds! Production costs $${productionCost.toLocaleString()}, you have $${(profile.income || 0).toLocaleString()}.`, "error");
      return;
    }

    const selectedContract = eligibleContracts.find(c => c.contract_id === selectedSponsoredContractId);
    if (selectedContract && selectedContract.deliverables_remaining <= 0) {
      showToast('This sponsorship contract has no deliverables remaining.', 'warning');
      return;
    }

    setUploading(true);
    try {
      const finalTitle = videoTitle || `${selectedType.label} - ${profile.artist_name || "Artist"}`;
      const collaborationArtistId = ["reaction", "collab_video"].includes(selectedType.id)
        ? targetArtist?.id || null
        : null;

      // #region agent log: VidWave createYouTubeVideo payload
      try {
        fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
          body: JSON.stringify({
            sessionId: 'f69218',
            runId: 'pre-debug',
            hypothesisId: 'H1',
            location: 'src/components/social/VidWaveApp.jsx:handleUpload:beforeInvoke',
            message: 'VidWave invoke socialMedia:createYouTubeVideo payload subset',
            data: {
              action: 'createYouTubeVideo',
              artistId: profile.id,
              pillarType: selectedType?.pillar ?? null,
              videoType: selectedType?.id ?? null,
              title: finalTitle ?? null,
              hasTitle: !!finalTitle,
              energyCost: selectedType?.energyCost ?? null,
              productionTier,
              productionCost: PRODUCTION_TIERS?.[productionTier]?.cost ?? null,
              thumbnailSet: !!thumbnailUrl,
              sponsoredContractId: selectedSponsoredContractId || null,
              linkedReleaseId: linkedRelease || null,
              collaborationArtistId: collaborationArtistId || null,
              alignmentTag: selectedType?.alignmentTag ?? null,
              valueTypes: {
                pillarType: typeof (selectedType?.pillar ?? null),
                videoType: typeof (selectedType?.id ?? null),
                title: typeof finalTitle,
              },
            },
            timestamp: Date.now(),
          }),
        }).catch(() => { });
      } catch {
        // ignore logging failures
      }
      // #endregion

      const response = await base44.functions.invoke('socialMedia', {
        action: 'createYouTubeVideo',
        artistId: profile.id,
        pillarType: selectedType.pillar,
        videoType: selectedType.id,
        title: finalTitle,
        description: contentHook || `${selectedType.label} upload`,
        tags: seoTags,
        productionTier,
        linkedReleaseId: linkedRelease || null,
        energyCost: selectedType.energyCost,
        thumbnailUrl: thumbnailUrl || null,
        sponsoredContractId: selectedSponsoredContractId || null,
        collaborationArtistId,
        alignmentTag: selectedType.alignmentTag || null,
      });

      const performance = response?.data?.performance || response?.performance || {};
      setLastResult({
        views: performance.views || 0,
        newSubs: performance.newSubs || 0,
        adRevenue: performance.adRevenue || 0,
        retentionPct: Math.floor(((performance.watchTimeMinutes || 0) / Math.max(1, performance.views || 1)) * 100),
        qualityLabel: PRODUCTION_TIERS.find(t => t.id === productionTier)?.label || 'DIY / Phone',
        sampleComments: genComments('positive', 3),
      });

      showToast(`Video uploaded! ${formatNum(performance.views || 0)} views`, "success");
      showToast('Revenue and follower gains will accrue during turn processing.', 'success');
      const sponsorshipError = response?.data?.sponsorshipError;
      if (sponsorshipError) {
        showToast(`Sponsorship linkage failed: ${sponsorshipError}. The video was uploaded but the deliverable was not counted — please try re-linking.`, 'warning');
      }
      resetCreateForm();
      loadData();
    } catch (e) {
      console.error("[VidWave] Upload error:", e);
      console.error("[VidWave] Full error details:", {
        message: e.message,
        context: e.context,
        status: e.context?.status,
        body: e.context?.body
      });

      // #region agent log: VidWave upload catch error shape
      try {
        fetch('http://127.0.0.1:7593/ingest/9932021c-ec69-4293-a6e5-b09375d6135e', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f69218' },
          body: JSON.stringify({
            sessionId: 'f69218',
            runId: 'pre-debug',
            hypothesisId: 'H2',
            location: 'src/components/social/VidWaveApp.jsx:handleUpload:catch',
            message: 'VidWave invoke socialMedia failed (client error shape)',
            data: {
              errorMessage: e?.message ?? null,
              status: e?.context?.status ?? null,
              body: e?.context?.body ?? null,
              hasErrorContext: !!e?.context,
              action: 'createYouTubeVideo',
              artistId: profile?.id ?? null,
              pillarType: selectedType?.pillar ?? null,
              videoType: selectedType?.id ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => { });
      } catch {
        // ignore logging failures
      }
      // #endregion

      showToast(`Failed to upload: ${e.message || 'Unknown error'}`, "error");
    } finally { setUploading(false); }
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file: file, bucket: 'uploads' });
      setThumbnailUrl(result.file_url);
      showToast("Thumbnail uploaded!", "success");
    } catch (err) {
      console.error("[VidWave] Thumbnail upload error:", err);
      showToast("Failed to upload thumbnail", "error");
    } finally {
      setThumbnailUploading(false);
    }
  };

  const handleThumbnailUrlChange = (url) => {
    try {
      if (url && typeof url === 'string') {
        setThumbnailUrl(url);
      }
    } catch (error) {
      console.error("[VidWave] Thumbnail URL change error:", error);
    }
  };

  const resetCreateForm = () => { setTab("channel"); setCreateStep(0); setSelectedType(null); setVideoTitle(""); setLinkedRelease(""); setLinkedSong(""); setProductionTier(0); setSeoTags([]); setContentHook(""); setThumbnailUrl(""); setTargetArtist(null); setSelectedSponsoredContractId(""); };
  const toggleSeoTag = (tag) => setSeoTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 8 ? [...prev, tag] : prev);

  const acceptVidWaveOffer = async (offerId) => {
    if (!offerId || acceptingOfferId) return;
    try {
      setAcceptingOfferId(offerId);
      const resp = await base44.functions.invoke('socialMedia', {
        action: 'acceptVidWaveSponsorshipOffer',
        offerId,
        currentTurn: currentTurnIndex || 0,
      });
      const result = resp?.data || resp || {};
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to accept offer');
      }
      const previous = vidwaveSponsorships || { offers: [], active_contracts: [] };
      const offer = (previous.offers || []).find(o => o.id === offerId);
      const nextOffers = (previous.offers || []).filter(o => o.id !== offerId);
      const nextActive = offer
        ? [{
            id: result?.contract?.id || `accepted-${offerId}`,
            brand_name: offer.brand_name,
            tier: offer.tier,
            category: offer.category,
            platform_scope: offer.platform_scope,
            deliverables_remaining: offer.deliverable_count_required || 1,
            turns_remaining: Math.max(0, (offer.end_turn_id || 0) - (currentTurnIndex || 0)),
            persona_fit_score: offer.persona_fit_score,
          }, ...(previous.active_contracts || [])]
        : (previous.active_contracts || []);

      setVidwaveSponsorships(prev => ({ ...(prev || {}), offers: nextOffers, active_contracts: nextActive }));
      setEligibleContracts(nextActive.map(c => ({
        contract_id: c.id,
        brand_name: c.brand_name,
        tier: c.tier,
        category: c.category,
        deliverables_remaining: c.deliverables_remaining,
        contract_end_turn_id: (currentTurnIndex || 0) + (c.turns_remaining || 0),
        turns_remaining: c.turns_remaining,
        persona_fit_score: c.persona_fit_score,
      })));
      showToast('Deal accepted. Payouts accrue next turn.', 'success');
    } catch (e) {
      console.error("[VidWave] Sponsor error:", e);
      showToast(`Failed to accept deal: ${e.message || 'Unknown error'}`, 'error');
    }
    finally { setAcceptingOfferId(null); }
  };

  const jumpToCreateWithContract = (contractId = '') => {
    setTab('create');
    if (!selectedType) setSelectedType(VIDEO_TYPES[0]);
    setCreateStep(1);
    if (contractId) setSelectedSponsoredContractId(contractId);
    setFocusSponsorSelectorKey(k => k + 1);
  };

  const CHANNEL_TABS = [
    { id: "channel", label: "Channel", icon: Tv },
    { id: "create", label: "Create", icon: Plus },
    { id: "community", label: "Community", icon: MessageCircle },
    { id: "monetize", label: "Monetize", icon: DollarSign },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  const BOTTOM_NAV = [
    { id: "foryou", label: "ForYou", icon: Home },
    { id: "shorts", label: "Shorts", icon: Smartphone },
    { id: "create_nav", label: "Create", icon: Plus },
    { id: "search_nav", label: "Search", icon: Search },
    { id: "profile", label: "Channel", icon: Tv },
  ];

  const isChannelView = tab === "channel" || tab === "create" || tab === "community" || tab === "monetize" || tab === "analytics";

  const handleSaveChannelName = async () => {
    if (!channelNameDraft.trim() || !account?.id) return;
    try {
      await base44.entities.SocialAccount?.update(account.id, { channel_name: channelNameDraft.trim() });
      setChannelName(channelNameDraft.trim());
      setEditingChannel(false);
      showToast("Channel name updated!", "success");
    } catch (e) { console.error("[VidWave] Channel name update error:", e); }
  };

  const displayChannelName = channelName || account?.channel_name || profile?.artist_name || "My Channel";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="fixed inset-0 z-[90] bg-[#0f0f0f] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-[#0f0f0f] border-b border-white/[0.06] px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white" /></div>
            <h2 className="text-white text-base font-bold tracking-tight">VidWave</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Channel sub-tabs only shown in profile/channel view */}
        {isChannelView && (
          <>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[
                { v: formatNum(subs), l: "Subs", c: "text-white" },
                { v: formatNum(totalViews), l: "Views", c: "text-red-400" },
                { v: formatTime(totalWatchTime), l: "Watch", c: "text-blue-400" },
                { v: `$${totalRevenue.toFixed(0)}`, l: "Revenue", c: "text-green-400" },
              ].map(s => (
                <div key={s.l} className="bg-white/[0.04] rounded-lg px-2 py-1.5 text-center">
                  <p className={`${s.c} text-[11px] font-bold`}>{s.v}</p>
                  <p className="text-gray-500 text-[7px] uppercase tracking-widest">{s.l}</p>
                </div>
              ))}
            </div>
            {/* Channel name with edit button */}
            <div className="flex items-center gap-2 mt-2">
              {editingChannel ? (
                <div className="flex items-center gap-2 flex-1">
                  <input value={channelNameDraft} onChange={e => setChannelNameDraft(e.target.value)} placeholder="Channel name"
                    className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-white text-xs" autoFocus />
                  <button onClick={handleSaveChannelName} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-semibold">Save</button>
                  <button onClick={() => setEditingChannel(false)} className="px-2 py-1 rounded-lg bg-white/[0.06] text-gray-400 text-[10px]">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-300 text-xs font-medium">{displayChannelName}</span>
                  <button onClick={() => { setChannelNameDraft(displayChannelName); setEditingChannel(true); }} className="p-1 hover:bg-white/5 rounded">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              )}
            </div>
            {nextMilestone && (
              <div className="mt-1.5 bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-gray-400 text-[8px]">Next: {nextMilestone.badge} {nextMilestone.label}</span>
                  <span className="text-white text-[8px] font-semibold">{formatNum(subs)} / {formatNum(nextMilestone.subs)}</span>
                </div>
                <div className="w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${Math.min(100, (subs / nextMilestone.subs) * 100)}%` }} />
                </div>
              </div>
            )}
            <div className="flex gap-0.5 mt-2 overflow-x-auto hide-scrollbar">
              {CHANNEL_TABS.map(t => { const I = t.icon; return (
                <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "create") setCreateStep(0); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300'}`}>
                  <I className="w-3 h-3" />{t.label}
                </button>
              ); })}
            </div>
          </>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" /></div>
        ) : tab === "foryou" ? (
          <ForYouHomeTab feedVideos={allVideos} subs={subs} profile={profile} channelName={displayChannelName} currentTurnIndex={currentTurnIndex} />
        ) : tab === "search" ? (
          <SearchTab videos={allVideos} />
        ) : tab === "channel" ? (
          <ChannelTab videos={videos} subs={subs} currentMilestone={currentMilestone} lastResult={lastResult} setLastResult={setLastResult} />
        ) : tab === "shorts" ? (
          <ShortsTab videos={allVideos.filter(v => v.post_type === 'short' || v.resolvedVideoType === 'short' || v.resolvedPillarType === 'shorts').slice(0, 20)} subs={subs} profile={profile} onCreateShort={() => { setTab("create"); setSelectedType(VIDEO_TYPES.find(t => t.id === "short")); setCreateStep(0); }} />
        ) : tab === "create" ? (
          <CreateTab step={createStep} setStep={setCreateStep} selectedType={selectedType} setSelectedType={setSelectedType}
            videoTitle={videoTitle} setVideoTitle={setVideoTitle} contentHook={contentHook} setContentHook={setContentHook}
            linkedRelease={linkedRelease} setLinkedRelease={setLinkedRelease} releases={releases}
            linkedSong={linkedSong} setLinkedSong={setLinkedSong} songs={songs}
            productionTier={productionTier} setProductionTier={setProductionTier}
            seoTags={seoTags} toggleSeoTag={toggleSeoTag} seoScore={seoScore}
            profile={profile} uploading={uploading} handleUpload={handleUpload}
            thumbnailUrl={thumbnailUrl} setThumbnailUrl={setThumbnailUrl} handleThumbnailUrlChange={handleThumbnailUrlChange} thumbnailUploading={thumbnailUploading} handleThumbnailUpload={handleThumbnailUpload}
            targetArtist={targetArtist} setTargetArtist={setTargetArtist} npcArtists={npcArtists}
            eligibleContracts={eligibleContracts} selectedSponsoredContractId={selectedSponsoredContractId} setSelectedSponsoredContractId={setSelectedSponsoredContractId}
            currentTurnIndex={currentTurnIndex} focusSponsorSelectorKey={focusSponsorSelectorKey}
            controversyCount={controversyCount} />
        ) : tab === "community" ? (
          <CommunityTab videos={videos} subs={subs} />
        ) : tab === "monetize" ? (
          <MonetizeTab
            subs={subs}
            totalRevenue={totalRevenue}
            videos={videos}
            sponsorships={vidwaveSponsorships}
            onAcceptOffer={acceptVidWaveOffer}
            acceptingOfferId={acceptingOfferId}
            onSponsorVideo={jumpToCreateWithContract}
            currentTurnIndex={currentTurnIndex}
            monetization={sponsorshipMonetization}
            sponsorshipsLoading={sponsorshipsLoading}
            sponsorshipsError={sponsorshipsError}
            onRetrySponsorships={loadSponsorships}
          />
        ) : (
          <AnalyticsTab videos={videos} subs={subs} totalViews={totalViews} totalRevenue={totalRevenue} totalWatchTime={totalWatchTime} sponsorshipAnalytics={sponsorshipAnalytics} />
        )}
      </div>

      {/* Bottom Navigation Bar — supersedes global nav */}
      <div className="flex-shrink-0 bg-[#0f0f0f] border-t border-white/[0.06] px-2 pb-[env(safe-area-inset-bottom)] pt-1">
        <div className="flex items-center justify-around">
          {BOTTOM_NAV.map(item => {
            const I = item.icon;
            const isActive = item.id === "profile" ? isChannelView : item.id === "search_nav" ? tab === "search" : tab === item.id;
            return (
              <button key={item.id} onClick={() => {
                if (item.id === "profile") setTab("channel");
                else if (item.id === "search_nav") setTab("search");
                else if (item.id === "create_nav") { setTab("create"); setCreateStep(0); }
                else setTab(item.id);
              }} className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[56px] min-h-[44px]">
                <I className={`w-5 h-5 ${isActive ? 'text-red-400' : 'text-gray-500'}`} />
                <span className={`text-[9px] font-medium ${isActive ? 'text-red-400' : 'text-gray-500'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════ */

function ForYouHomeTab({ feedVideos, subs: _subs, profile, channelName, currentTurnIndex: _currentTurnIndex }) {
  const [allVideos, setAllVideos] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [sortMode, setSortMode] = useState("new");
  const [feedFilter, setFeedFilter] = useState("all"); // "all" | "reactions"

  useEffect(() => {
    setAllVideos(Array.isArray(feedVideos) ? feedVideos : []);
    setFeedLoading(false);
  }, [feedVideos]);

  const merged = useMemo(() => {
    let combined = [...allVideos];

    // Filter: "reactions" shows only NPC reaction/outlet videos; "all" hides them
    if (feedFilter === "reactions") {
      combined = combined.filter(v => v.metadata?.is_npc_reaction || v.metadata?.posted_by_outlet || v.metadata?.is_npc);
    } else {
      combined = combined.filter(v => !v.metadata?.is_npc_reaction && !v.metadata?.posted_by_outlet && !v.metadata?.is_npc);
    }

    if (sortMode === "trending") {
      combined.sort((a, b) => {
        const aScore = (a.views || 0) * (a.is_viral ? 3 : 1) + (a.likes || 0) * 5;
        const bScore = (b.views || 0) * (b.is_viral ? 3 : 1) + (b.likes || 0) * 5;
        const aAge = (Date.now() - new Date(a.created_at || a.created_date).getTime()) / 86400000;
        const bAge = (Date.now() - new Date(b.created_at || b.created_date).getTime()) / 86400000;
        return (bScore / Math.max(1, bAge)) - (aScore / Math.max(1, aAge));
      });
    } else if (sortMode === "popular") {
      combined.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else {
      combined.sort((a, b) => new Date(b.created_at || b.created_date).getTime() - new Date(a.created_at || a.created_date).getTime());
    }
    return combined.slice(0, 20);
  }, [allVideos, sortMode, feedFilter]);

  const reactionCount = useMemo(() => {
    const all = [...(feedVideos || [])];
    return all.filter(v => v.metadata?.is_npc_reaction || v.metadata?.posted_by_outlet || v.metadata?.is_npc).length;
  }, [feedVideos]);

  const fmtViews = (n) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n || 0);
  };
  
  if (feedLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-3 space-y-3">
      {/* Feed Filter + Sort Row */}
      <div className="flex items-center justify-between gap-2">
        {/* Feed filter pills */}
        <div className="flex gap-1.5">
          <button onClick={() => setFeedFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${feedFilter === "all" ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/[0.04] text-gray-500 hover:text-gray-300 border border-transparent'}`}>
            Videos
          </button>
          <button onClick={() => setFeedFilter("reactions")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${feedFilter === "reactions" ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-white/[0.04] text-gray-500 hover:text-gray-300 border border-transparent'}`}>
            🎬 Reactions
            {reactionCount > 0 && (
              <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${feedFilter === "reactions" ? 'bg-purple-500/30 text-purple-300' : 'bg-white/[0.08] text-gray-400'}`}>
                {reactionCount}
              </span>
            )}
          </button>
        </div>
        {/* Sort pills */}
        <div className="flex gap-1">
          {[{ id: "new", label: "New" }, { id: "trending", label: "🔥" }, { id: "popular", label: "👑" }].map(s => (
            <button key={s.id} onClick={() => setSortMode(s.id)}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${sortMode === s.id ? 'bg-white/[0.1] text-white border border-white/[0.12]' : 'text-gray-600 hover:text-gray-400'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {merged.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {feedFilter === "reactions" ? (
            <>
              <span className="text-4xl mb-3">🎬</span>
              <p className="text-gray-400 text-sm font-semibold mb-1">No Reactions Yet</p>
              <p className="text-gray-500 text-[10px]">Upload a music video — NPC channels will react to it next turn.</p>
            </>
          ) : (
            <>
              <Play className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm font-semibold mb-1">No Videos Yet</p>
              <p className="text-gray-500 text-[10px]">Upload your first video to see it here!</p>
            </>
          )}
        </div>
      ) : (
        merged.map((v, i) => {
          const isOwn = v.artist_id === profile?.id;
          const isReaction = v.metadata?.is_npc_reaction;
          const isOutlet = v.metadata?.posted_by_outlet;
          // Fix: Use artistProfile from join, fallback to metadata name, only fallback to 'You' if strictly own video
          const authorName = v.artistProfile?.artist_name || v.metadata?.artist_name || v.artist_name || 'Artist';
          const displayName = isReaction
            ? `${v.metadata?.reaction_channel_icon || '🎬'} ${v.metadata?.reaction_channel_name || 'Reactor'}`
            : isOutlet
            ? `${v.metadata?.media_outlet_icon || '📰'} ${v.metadata?.media_outlet_name || 'Media'}`
            : isOwn ? (channelName || profile?.artist_name || 'You') : authorName;
            
          const displayThumbnail = v.thumbnail_url || v.metadata?.thumbnail_url;
          
          return (
            <motion.div key={v.id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-white/[0.02] rounded-xl overflow-hidden">
              {/* Thumbnail */}
              <div className="w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
                {displayThumbnail ? (
                  <img src={displayThumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="w-10 h-10 text-white/20" />
                  </div>
                )}
                {Number(v.resolvedProductionTier || 0) >= 2 && (
                  <span className="absolute top-2 left-2 text-[7px] px-1.5 py-0.5 rounded bg-amber-500/90 text-black font-bold">HD</span>
                )}
                {v.is_viral && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/80">
                    <TrendingUp className="w-2.5 h-2.5 text-white" />
                    <span className="text-white text-[7px] font-bold">VIRAL</span>
                  </div>
                )}
                {isReaction && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 text-center z-10">
                      <span className="text-[8px] text-white font-bold">{v.metadata?.reaction_channel_icon} {v.metadata?.reaction_channel_name} — Reaction</span>
                    </div>
                    {v.metadata?.thumbnail_overlay && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="absolute bottom-6 right-2 text-4xl filter drop-shadow-lg animate-pulse-slow">
                          {v.metadata.thumbnail_overlay}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {!isReaction && isOutlet && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 text-center z-10">
                    <span className="text-[8px] text-white font-bold">{v.metadata?.media_outlet_icon || '📰'} {v.metadata?.media_outlet_name || 'Media'} — Fan Content</span>
                  </div>
                )}
              </div>
              {/* Info — improved layout */}
              <div className="flex gap-2.5 p-2.5">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  {isOwn && (profile?.vidwave_avatar_url || profile?.artist_image) ? (
                    <img src={profile.vidwave_avatar_url || profile.artist_image} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold line-clamp-2">{v.title || 'Untitled'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-400 font-medium truncate">{displayName}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-shrink-0 ml-2">
                      <span>{fmtViews(v.views || 0)} views</span>
                      <span>·</span>
                      <span>{timeAgo(v.created_at || v.created_date)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}

function SearchTab({ videos }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const lower = q.toLowerCase();
      const matched = (Array.isArray(videos) ? videos : []).filter(v =>
        (v.title || '').toLowerCase().includes(lower) ||
        (v.caption || '').toLowerCase().includes(lower) ||
        (v.resolvedSeoTags || v.metadata?.seo_tags || []).some(t => t.toLowerCase().includes(lower))
      );
      setResults(matched);
    } catch (e) { console.error("[Search] error:", e); }
    finally { setSearching(false); }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text" value={query} onChange={e => handleSearch(e.target.value)}
          placeholder="Search videos, tags, creators..."
          className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-gray-600 outline-none focus:border-red-500/40"
          autoFocus
        />
      </div>
      {searching && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" /></div>}
      {!searching && query && results.length === 0 && (
        <div className="text-center py-10">
          <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No results for "{query}"</p>
        </div>
      )}
      {!searching && results.map((v, i) => {
        const displayThumbnail = v.thumbnail_url || v.metadata?.thumbnail_url;
        const isReaction = v.metadata?.is_npc_reaction;
        
        return (
          <div key={v.id || i} className="flex gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <div className="w-24 h-14 rounded-lg bg-gradient-to-br from-red-500/10 to-gray-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
              {displayThumbnail ? (
                <img src={displayThumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="w-5 h-5 text-white/30" />
                </div>
              )}
              {isReaction && (
                <>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center z-10">
                    <span className="text-[6px] text-white font-bold block leading-none">{v.metadata?.reaction_channel_icon} {v.metadata?.reaction_channel_name}</span>
                  </div>
                  {v.metadata?.thumbnail_overlay && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="absolute bottom-1 right-1 text-lg filter drop-shadow-md">
                        {v.metadata.thumbnail_overlay}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[11px] font-semibold line-clamp-2">{v.title}</p>
              <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
                <span>{formatNum(v.views || 0)} views</span>
                <span>{formatNum(v.likes || 0)} likes</span>
              </div>
            </div>
          </div>
        );
      })}
      {!query && (
        <div className="text-center py-10">
          <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-400 text-sm font-semibold">Search VidWave</p>
          <p className="text-gray-500 text-[10px]">Find videos by title, tags, or description</p>
        </div>
      )}
    </div>
  );
}

function ChannelTab({ videos, subs: _subs, currentMilestone, lastResult, setLastResult }) {
  const myVideos = useMemo(() => videos.filter(v => !v.metadata?.is_npc_reaction && !v.metadata?.posted_by_outlet), [videos]);

  return (
    <div className="p-4 space-y-3">
      {currentMilestone && (
        <div className="bg-gradient-to-r from-amber-500/10 to-red-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
          <span className="text-2xl">{currentMilestone.badge}</span>
          <div><p className="text-white text-sm font-semibold">{currentMilestone.label}</p><p className="text-gray-400 text-[10px]">{currentMilestone.perk}</p></div>
        </div>
      )}

      {/* Content Pillars */}
      <div>
        <h3 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Channel Identity — Content Pillars</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {CONTENT_PILLARS.map(p => {
            const I = p.icon;
            const count = myVideos.filter(v => {
              return v.resolvedPillarType === p.id;
            }).length;
            const active = count >= 2;
            return (
              <div key={p.id} className={`rounded-xl p-2.5 border ${active ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.02] border-white/[0.05]'}`}>
                <div className="flex items-center gap-1.5 mb-1"><I className={`w-3.5 h-3.5 ${active ? 'text-red-400' : 'text-gray-600'}`} /><span className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{p.label}</span></div>
                <p className="text-gray-600 text-[8px] mb-1">{p.desc}</p>
                <div className="flex items-center gap-2 text-[7px]"><span className="text-gray-500">{count} vids</span>{active && <span className="text-red-400 font-semibold">Active</span>}</div>
              </div>
            );
          })}
        </div>
        <p className="text-gray-600 text-[8px] mt-1 italic">2+ videos in a pillar activates it, boosting all content.</p>
      </div>

      {/* Last Upload Result */}
      <AnimatePresence>
        {lastResult && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="bg-gradient-to-br from-red-500/10 to-amber-500/5 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-red-400" />
              <p className="text-white text-sm font-bold">Video Published!</p>
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-gray-400">{lastResult.qualityLabel}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div><p className="text-gray-500 text-[7px]">VIEWS</p><p className="text-white text-[11px] font-bold">{formatNum(lastResult.views)}</p></div>
              <div><p className="text-gray-500 text-[7px]">EST. SUBS</p><p className="text-red-400 text-[11px] font-bold">~{formatNum(lastResult.newSubs)}</p></div>
              <div><p className="text-gray-500 text-[7px]">EST. REV</p><p className="text-amber-400 text-[11px] font-bold">~${lastResult.adRevenue?.toFixed(0) || 0}</p></div>
              <div><p className="text-gray-500 text-[7px]">RETENTION</p><p className="text-blue-400 text-[11px] font-bold">{lastResult.retentionPct}%</p></div>
            </div>
            {lastResult.sampleComments?.length > 0 && (
              <div className="border-t border-white/[0.06] pt-2 mt-1">
                <p className="text-gray-500 text-[8px] font-semibold mb-1">TOP COMMENTS</p>
                {lastResult.sampleComments.slice(0, 3).map((c, i) => <p key={i} className="text-gray-400 text-[9px] py-0.5">"{c}"</p>)}
              </div>
            )}
            <button onClick={() => setLastResult(null)} className="text-gray-600 text-[8px] mt-2 hover:text-gray-400">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Library */}
      <h3 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Uploads ({myVideos.length})</h3>
      {myVideos.length === 0 ? (
        <div className="min-h-[30dvh] flex flex-col items-center justify-center text-center py-8">
          <Film className="w-8 h-8 text-gray-700 mx-auto mb-2" /><p className="text-gray-500 text-sm">No videos yet</p>
        </div>
      ) : myVideos.map((v, i) => {
        const displayThumbnail = v.thumbnail_url || v.metadata?.thumbnail_url;
        return (
          <motion.div key={v.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden mb-2">
            <div className="flex gap-3 p-2.5">
              <div className="w-28 h-16 rounded-lg bg-gradient-to-br from-red-500/10 to-gray-500/10 flex items-center justify-center relative flex-shrink-0 overflow-hidden">
                {displayThumbnail ? (
                  <img src={displayThumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Play className="w-5 h-5 text-white/30" />
                )}
                {Number(v.resolvedProductionTier || 0) >= 2 && <span className="absolute top-1 left-1 text-[6px] px-1 py-0.5 rounded bg-amber-500/80 text-black font-bold">HD</span>}
                {v.metadata?.is_npc_reaction && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center">
                    <span className="text-[6px] text-white font-bold">{v.metadata.reaction_channel_icon} {v.metadata.reaction_channel_name}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-[11px] font-semibold mb-0.5 line-clamp-2">{v.title}</p>
                  {(v.sponsored_contract_id || v.metadata?.sponsored_contract_id || v.sponsoredLink?.contract_id) && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Sponsored</span>}
                </div>
                <div className="flex items-center gap-2 text-[8px] text-gray-500">
                  <span>{formatNum(v.views || 0)} views</span><span>{timeAgo(v.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="flex items-center gap-0.5 text-[8px] text-gray-500"><ThumbsUp className="w-2.5 h-2.5" />{formatNum(v.likes || 0)}</span>
                  <span className="flex items-center gap-0.5 text-[8px] text-green-500"><DollarSign className="w-2.5 h-2.5" />${(v.revenue || 0).toFixed(2)}</span>
                  {v.metadata?.expected_ad_revenue > 0 && (v.revenue || 0) < v.metadata.expected_ad_revenue && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium animate-pulse">💰 Earning</span>
                  )}
                  {v.resolvedQualityLabel && <span className="text-[7px] px-1 py-0.5 rounded bg-white/[0.05] text-gray-500">{v.resolvedQualityLabel}</span>}
                  {(v.metadata?.sponsored_brand_name || v.sponsoredLink?.metadata?.brand_name) && <span className="text-[7px] text-amber-300">{v.metadata?.sponsored_brand_name || v.sponsoredLink?.metadata?.brand_name} · {(v.metadata?.sponsored_tier || v.sponsoredLink?.metadata?.tier || "").toUpperCase()}</span>}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function CreateTab({ step, setStep, selectedType, setSelectedType, videoTitle, setVideoTitle, contentHook, setContentHook, linkedRelease, setLinkedRelease, releases, linkedSong, setLinkedSong, songs, productionTier, setProductionTier, seoTags, toggleSeoTag, seoScore, profile, uploading: isUploading = false, handleUpload, thumbnailUrl, setThumbnailUrl: _setThumbnailUrl, handleThumbnailUrlChange, thumbnailUploading: _thumbnailUploading, handleThumbnailUpload: _handleThumbnailUpload, targetArtist, setTargetArtist, npcArtists, eligibleContracts, selectedSponsoredContractId, setSelectedSponsoredContractId, currentTurnIndex, focusSponsorSelectorKey, controversyCount = 0 }) {
  const sponsorSelectRef = useRef(null);

  useEffect(() => {
    if (step === 1 && sponsorSelectRef.current) {
      sponsorSelectRef.current.focus();
    }
  }, [step, focusSponsorSelectorKey]);

  return (
    <div className="p-4 space-y-3">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-1">
        {["Type", "Details", "Production", "SEO", "Review"].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${step >= i ? 'bg-red-500 text-white' : 'bg-white/[0.06] text-gray-600'}`}>{i + 1}</div>
            <span className={`text-[7px] ${step >= i ? 'text-gray-300' : 'text-gray-600'}`}>{s}</span>
            {i < 4 && <div className={`flex-1 h-px ${step > i ? 'bg-red-500/50' : 'bg-white/[0.06]'}`} />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-2">
          <h3 className="text-white text-sm font-bold">What are you creating?</h3>
          {CONTENT_PILLARS.map(p => {
            const types = VIDEO_TYPES.filter(t => t.pillar === p.id);
            const I = p.icon;
            return (
              <div key={p.id}>
                <div className="flex items-center gap-1.5 mt-2 mb-1"><I className="w-3 h-3 text-gray-500" /><span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider">{p.label}</span></div>
                {types.map(type => {
                  const locked = type.requiresControversy && controversyCount === 0;
                  return (
                  <button key={type.id} onClick={() => { if (!locked) { setSelectedType(type); setStep(1); } }}
                    disabled={locked}
                    className={`w-full text-left border rounded-xl p-2.5 mb-1 transition-all ${locked ? 'bg-white/[0.01] border-white/[0.03] opacity-40 cursor-not-allowed' : 'bg-white/[0.03] border-white/[0.06] hover:border-red-500/30 active:scale-[0.98]'}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-white text-[11px] font-semibold">{type.label}</p>
                      <span className="text-gray-500 text-[8px]">{locked ? '🔒 Active controversy req.' : `-${type.energyCost} energy`}</span>
                    </div>
                    <p className="text-gray-500 text-[9px] mb-1">{type.desc}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">~{formatNum(type.baseViews)} views</span>
                      <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">${type.adRate}/view</span>
                      <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{type.duration}</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {step === 1 && selectedType && (
        <div className="space-y-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 flex items-center justify-between">
            <div><p className="text-white text-sm font-semibold">{selectedType.label}</p><p className="text-gray-500 text-[9px]">{selectedType.duration}</p></div>
            <button onClick={() => { setSelectedType(null); setStep(0); }} className="text-gray-500 text-[9px]">Change</button>
          </div>
          <div>
            <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Video Title</label>
            <input type="text" value={videoTitle} onChange={e => setVideoTitle(e.target.value)} placeholder={`${selectedType.label} - ${profile?.artist_name || "Artist"}`} maxLength={100}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-red-500/40" />
          </div>
          <div>
            <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Content Hook / Description</label>
            <textarea value={contentHook} onChange={e => setContentHook(e.target.value)} placeholder="Describe your video's core idea..." maxLength={200} rows={2}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-red-500/40 resize-none" />
          </div>
          {["music_video","lyric_video","visualizer","live_performance"].includes(selectedType.id) && (
            <>
              {/* Individual Song Selector */}
              {songs?.length > 0 && (
                <div>
                  <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Feature Song (Individual Track)</label>
                  <select value={linkedSong} onChange={e => { setLinkedSong(e.target.value); if (e.target.value) setLinkedRelease(""); }} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none">
                    <option value="">Select a song...</option>
                    {songs.map(s => <option key={s.id} value={s.id}>{s.title || "Untitled"} {s.quality ? `(Q${s.quality})` : ""}</option>)}
                  </select>
                  <p className="text-gray-600 text-[8px] mt-1">Choose a specific track from your catalog</p>
                </div>
              )}
              {/* Release Selector (alternative) */}
              {releases?.length > 0 && (
                <div>
                  <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Or Link to Release (Album/EP)</label>
                  <select value={linkedRelease} onChange={e => { setLinkedRelease(e.target.value); if (e.target.value) setLinkedSong(""); }} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none">
                    <option value="">None</option>
                    {releases.map(r => <option key={r.id} value={r.id}>{r.title || r.release_name || "Untitled"}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          {/* Artist picker for Reaction and Collab videos */}
          {["reaction", "collab_video"].includes(selectedType.id) && npcArtists?.length > 0 && (
            <div>
              <label className="text-gray-400 text-[10px] font-semibold mb-1 block">
                {selectedType.id === "reaction" ? "React to which artist?" : "Collab with which artist?"}
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {npcArtists.map(a => {
                  const selected = targetArtist?.id === a.id;
                  const fmtFollowers = a.followers >= 1e6 ? `${(a.followers/1e6).toFixed(1)}M` : a.followers >= 1e3 ? `${(a.followers/1e3).toFixed(0)}K` : String(a.followers || 0);
                  return (
                    <button key={a.id} onClick={() => setTargetArtist(selected ? null : a)}
                      className={`w-full text-left border rounded-xl p-2.5 transition-all ${selected ? 'bg-red-500/10 border-red-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white text-[11px] font-semibold">{a.artist_name}</p>
                          <p className="text-gray-500 text-[9px]">{fmtFollowers} followers · {a.clout || 0} clout</p>
                        </div>
                        {selected && <span className="text-red-400 text-[9px] font-bold">Selected</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!targetArtist && <p className="text-gray-600 text-[8px] italic mt-1">Optional — pick an artist or skip</p>}
            </div>
          )}
          <div>
            <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Sponsor this video (optional)</label>
            <p className="text-[10px] text-red-300 mb-1">Selecting a deal will count this video as a sponsored deliverable</p>
            <select ref={sponsorSelectRef} value={selectedSponsoredContractId} onChange={e => setSelectedSponsoredContractId(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none">
              <option value="">None</option>
              {eligibleContracts?.map(contract => {
                const scope = String(contract.platform_scope || '').toLowerCase();
                const scopeLabel = scope === 'cross_platform' ? 'All Platforms' : 'VidWave';
                return (
                <option key={contract.contract_id} value={contract.contract_id} disabled={(contract.deliverables_remaining || 0) <= 0}>
                  {`${contract.brand_name} · ${contract.tier} · remaining ${contract.deliverables_remaining} · ends ${Math.max(0, (contract.contract_end_turn_id || 0) - (currentTurnIndex || 0))} turns · ${scopeLabel}${(contract.deliverables_remaining || 0) <= 0 ? ' (unavailable)' : ''}`}
                </option>
                );
              })}
            </select>
            {selectedSponsoredContractId && (eligibleContracts.find(c => c.contract_id === selectedSponsoredContractId)?.deliverables_remaining || 0) <= 0 && (
              <p className="text-red-400 text-[8px] mt-1">This contract has no deliverables remaining.</p>
            )}
          </div>
          <button onClick={() => setStep(2)} className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">Next: Production Quality</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-white text-sm font-bold">Production Quality</h3>
          <p className="text-gray-500 text-[10px]">Higher production = better retention & revenue, but costs more</p>
          {PRODUCTION_TIERS.map(tier => {
            const I = tier.icon; const canAfford = (profile?.income || 0) >= tier.cost;
            return (
              <button key={tier.id} onClick={() => canAfford && setProductionTier(tier.id)} disabled={!canAfford}
                className={`w-full text-left border rounded-xl p-3 transition-all ${productionTier === tier.id ? 'bg-red-500/10 border-red-500/30' : canAfford ? 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]' : 'opacity-30 border-white/[0.04]'}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${productionTier === tier.id ? 'bg-red-500/20' : 'bg-white/[0.04]'}`}>
                    <I className={`w-4 h-4 ${productionTier === tier.id ? 'text-red-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between"><p className="text-white text-[11px] font-semibold">{tier.label}</p><span className={`text-[9px] font-semibold ${tier.cost > 0 ? 'text-amber-400' : 'text-green-400'}`}>{tier.cost > 0 ? `$${tier.cost}` : 'Free'}</span></div>
                    <p className="text-gray-500 text-[9px]">{tier.desc}</p>
                    <div className="flex gap-2 mt-1"><span className="text-[7px] px-1 py-0.5 rounded bg-white/[0.05] text-gray-400">Quality {tier.qualityMult}x</span><span className="text-[7px] px-1 py-0.5 rounded bg-white/[0.05] text-gray-400">Retention {tier.retentionMult}x</span></div>
                  </div>
                </div>
              </button>
            );
          })}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">Next: SEO</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-white text-sm font-bold">SEO & Discoverability</h3>
          <p className="text-gray-500 text-[10px]">Tags boost search visibility. More relevant tags = more organic reach.</p>
          <div className="flex items-center justify-between mb-1">
            <label className="text-gray-400 text-[10px] font-semibold">Tags ({seoTags.length}/8)</label>
            <span className={`text-[9px] font-semibold ${seoScore >= 4 ? 'text-green-400' : seoScore >= 2 ? 'text-amber-400' : 'text-gray-500'}`}>SEO: {seoScore >= 4 ? 'Excellent' : seoScore >= 2 ? 'Good' : 'Low'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEO_TAG_POOL.map(tag => (
              <button key={tag} onClick={() => toggleSeoTag(tag)}
                className={`text-[9px] px-2 py-1 rounded-full border transition-all ${seoTags.includes(tag) ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:text-gray-300'}`}>#{tag}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
            <button onClick={() => setStep(4)} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">Review</button>
          </div>
        </div>
      )}

      {step === 4 && selectedType && (
        <div className="space-y-3">
          <h3 className="text-white text-sm font-bold">Review & Upload</h3>
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
            {[
              ["Video Type", selectedType.label],
              ["Title", videoTitle || `${selectedType.label} - ${profile?.artist_name}`],
              ["Production", PRODUCTION_TIERS[productionTier].label],
              ["SEO Tags", `${seoTags.length} tags`],
            ].map(([k, v]) => <div key={k} className="flex justify-between text-[11px]"><span className="text-gray-400">{k}</span><span className="text-white font-semibold">{v}</span></div>)}
          </div>
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
            <p className="text-gray-500 text-[8px] font-semibold uppercase tracking-wider mb-1">Cost Breakdown</p>
            <div className="flex justify-between text-[11px]"><span className="text-gray-400">Energy</span><span className="text-white font-semibold">-{selectedType.energyCost}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-gray-400">Production</span><span className="text-amber-400 font-semibold">{PRODUCTION_TIERS[productionTier].cost > 0 ? `-$${PRODUCTION_TIERS[productionTier].cost}` : 'Free'}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-gray-400">Est. Views</span><span className="text-white font-semibold">~{formatNum(selectedType.baseViews)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-gray-400">Ad Rate</span><span className="text-green-400 font-semibold">${selectedType.adRate}/view</span></div>
          </div>
          {/* Thumbnail Upload */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
            <p className="text-gray-500 text-[8px] font-semibold uppercase tracking-wider mb-2">Thumbnail (Required)</p>
            <ImageUpload
              value={thumbnailUrl}
              onChange={handleThumbnailUrlChange}
              placeholder="Upload video thumbnail or enter image URL"
              maxSizeMB={5}
              showPreview={true}
              className="bg-white/[0.02] border-0"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold text-sm">Back</button>
            <button onClick={handleUpload} disabled={isUploading} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50">
              {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : "Upload Video"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityTab({ videos, subs: _subs }) {
  const [likedComments, setLikedComments] = useState(new Set());
  const [pinnedComment, setPinnedComment] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState({});

  const superfanPct = Math.min(30, 5 + Math.floor(videos.length * 1.5));
  const regularPct = Math.min(50, 20 + Math.floor(videos.length * 2));
  const casualPct = Math.max(20, 100 - superfanPct - regularPct);

  const handleLike = (commentKey) => {
    setLikedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentKey)) next.delete(commentKey); else next.add(commentKey);
      return next;
    });
  };
  const handlePin = (commentKey) => {
    setPinnedComment(prev => prev === commentKey ? null : commentKey);
  };
  const handleReply = (commentKey) => {
    if (!replyText.trim()) return;
    setReplies(prev => ({ ...prev, [commentKey]: [...(prev[commentKey] || []), replyText.trim()] }));
    setReplyText("");
    setReplyingTo(null);
  };

  // Build stable comment list with deterministic fan names
  const commentList = useMemo(() => {
    const list = [];
    videos.slice(0, 3).forEach(v => {
      (v.metadata?.sample_comments || []).slice(0, 2).forEach((c, i) => {
        const key = `${v.id}-${i}`;
        const fanNum = ((v.id || '').charCodeAt(0) || 65) * 100 + i * 37;
        list.push({ key, text: c, videoTitle: v.title, fanName: `@fan_${fanNum % 9999}` });
      });
    });
    return list;
  }, [videos]);

  // Sort pinned to top
  const sorted = useMemo(() => {
    if (!pinnedComment) return commentList;
    return [...commentList].sort((a, b) => (b.key === pinnedComment ? 1 : 0) - (a.key === pinnedComment ? 1 : 0));
  }, [commentList, pinnedComment]);

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-white text-sm font-bold">Community</h3>
      <p className="text-gray-500 text-[10px]">Manage your audience. Engage with comments, grow superfans.</p>
      <div className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3">
        <p className="text-gray-500 text-[8px] font-semibold uppercase tracking-wider mb-2">Audience Breakdown</p>
        {[
          { label: "Superfans", pct: superfanPct, color: "bg-red-500", desc: "Watch every upload, comment, share" },
          { label: "Regular Viewers", pct: regularPct, color: "bg-blue-500", desc: "Watch most uploads" },
          { label: "Casual Browsers", pct: casualPct, color: "bg-gray-500", desc: "Discovered via algorithm" },
        ].map(seg => (
          <div key={seg.label} className="mb-2">
            <div className="flex items-center justify-between mb-0.5"><span className="text-gray-300 text-[10px]">{seg.label}</span><span className="text-white text-[10px] font-semibold">{seg.pct}%</span></div>
            <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden"><div className={`h-full ${seg.color} rounded-full`} style={{ width: `${seg.pct}%` }} /></div>
            <p className="text-gray-600 text-[8px] mt-0.5">{seg.desc}</p>
          </div>
        ))}
      </div>
      <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Recent Comments</h4>
      {videos.length === 0 ? <p className="text-gray-600 text-[10px]">Upload videos to see engagement</p> : (
        <div className="space-y-1.5">
          {sorted.map(comment => {
            const isPinned = pinnedComment === comment.key;
            const isLiked = likedComments.has(comment.key);
            const commentReplies = replies[comment.key] || [];
            return (
              <div key={comment.key} className={`rounded-lg p-2.5 ${isPinned ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-white/[0.03] border border-white/[0.05]'}`}>
                {isPinned && <p className="text-amber-400 text-[7px] font-bold mb-1">📌 PINNED</p>}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30" />
                  <span className="text-gray-400 text-[9px] font-semibold">{comment.fanName}</span>
                  <span className="text-gray-600 text-[8px] ml-auto">on "{comment.videoTitle?.slice(0, 20)}..."</span>
                </div>
                <p className="text-gray-300 text-[10px]">{comment.text}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <button onClick={() => handleLike(comment.key)} className={`text-[8px] flex items-center gap-0.5 transition-colors ${isLiked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}>
                    <Heart className={`w-2.5 h-2.5 ${isLiked ? 'fill-red-400' : ''}`} /> {isLiked ? 'Liked' : 'Like'}
                  </button>
                  <button onClick={() => setReplyingTo(replyingTo === comment.key ? null : comment.key)} className={`text-[8px] flex items-center gap-0.5 transition-colors ${replyingTo === comment.key ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}>
                    <MessageCircle className="w-2.5 h-2.5" /> Reply
                  </button>
                  <button onClick={() => handlePin(comment.key)} className={`text-[8px] flex items-center gap-0.5 transition-colors ${isPinned ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'}`}>
                    <Star className={`w-2.5 h-2.5 ${isPinned ? 'fill-amber-400' : ''}`} /> {isPinned ? 'Unpin' : 'Pin'}
                  </button>
                </div>
                {/* Reply input */}
                {replyingTo === comment.key && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply..."
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-white text-[10px] placeholder-gray-600 outline-none focus:border-blue-500/40" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleReply(comment.key); }} />
                    <button onClick={() => handleReply(comment.key)} className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[9px] font-semibold">Send</button>
                  </div>
                )}
                {/* Existing replies */}
                {commentReplies.map((r, ri) => (
                  <div key={ri} className="ml-6 mt-1.5 bg-white/[0.02] border border-white/[0.04] rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-4 h-4 rounded-full bg-red-500/20" />
                      <span className="text-red-400 text-[8px] font-semibold">You</span>
                    </div>
                    <p className="text-gray-300 text-[9px]">{r}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/10 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-gray-500 text-[9px] leading-relaxed">Respond to comments to boost engagement. Pin superfan comments to build loyalty. Consistent uploads convert casual browsers into regulars.</p>
        </div>
      </div>
    </div>
  );
}

function MonetizeTab({ subs, totalRevenue, videos, sponsorships, monetization, onAcceptOffer, acceptingOfferId, onSponsorVideo, currentTurnIndex, sponsorshipsLoading, sponsorshipsError, onRetrySponsorships }) {
  const isMonetized = subs >= 1000;
  const activeContracts = sponsorships?.active_contracts || [];
  const offers = sponsorships?.offers || [];
  const adRevenueTotal = Math.max(0, safeNum(monetization?.ad_revenue_total, safeNum(totalRevenue, 0)));
  const sponsoredUpliftTotal = Math.max(0, safeNum(monetization?.sponsored_uplift_total, 0));
  const sponsoredUpliftThisTurn = Math.max(0, safeNum(monetization?.sponsored_uplift_this_turn, 0));
  const adRevenueBase = Math.max(0, adRevenueTotal - sponsoredUpliftTotal);

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-white text-sm font-bold">Monetization</h3>
      <div className={`border rounded-xl p-3 ${isMonetized ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className={`w-4 h-4 ${isMonetized ? 'text-green-400' : 'text-gray-600'}`} />
          <p className="text-white text-sm font-semibold">{isMonetized ? 'Channel Monetized' : 'Not Yet Monetized'}</p>
        </div>
        <p className="text-gray-500 text-[10px]">{isMonetized ? `Earning ad revenue on all ${videos.length} videos. Total: $${totalRevenue.toFixed(2)}` : `Need ${formatNum(1000 - subs)} more subscribers to unlock monetization.`}</p>
      </div>

      {/* Revenue Streams */}
      <div>
        <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Revenue Streams</h4>
        {[
          { label: "Ad Revenue (Base)", desc: "Pre-roll & mid-roll ads before sponsorship uplift", active: isMonetized, value: `$${adRevenueBase.toFixed(2)}` },
          { label: "Sponsored Uplift (This Turn)", desc: "Incremental ad revenue attributable to sponsorships this turn", active: sponsoredUpliftThisTurn > 0, value: `+$${sponsoredUpliftThisTurn.toFixed(2)}` },
          { label: "Sponsored Uplift (Total)", desc: "Incremental ad revenue attributable to sponsorships across logged turns", active: sponsoredUpliftTotal > 0, value: `+$${sponsoredUpliftTotal.toFixed(2)}` },
          { label: "Channel Memberships", desc: "Monthly subscriber perks", active: subs >= 10000, value: subs >= 10000 ? `$${Math.floor(subs * 0.002)}/mo` : "10K subs needed" },
          { label: "Merch Shelf", desc: "Sell merch directly under videos", active: subs >= 100000, value: subs >= 100000 ? "Active" : "100K subs needed" },
          { label: "Sponsorships", desc: "Turn-based contracts for sponsored uploads", active: activeContracts.length > 0, value: `${activeContracts.length} active` },
        ].map(stream => (
          <div key={stream.label} className={`flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 ${stream.active ? '' : 'opacity-40'}`}>
            <div><p className="text-gray-300 text-[11px] font-semibold">{stream.label}</p><p className="text-gray-600 text-[8px]">{stream.desc}</p></div>
            <span className={`text-[10px] font-semibold ${stream.active ? 'text-green-400' : 'text-gray-600'}`}>{stream.value}</span>
          </div>
        ))}
        <p className="text-gray-600 text-[9px] mt-1">Ad revenue and sponsorship effects accrue over turns. No instant payouts.</p>
      </div>

      {sponsorshipsLoading && (
        <div className="space-y-2">
          <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
      )}

      {sponsorshipsError && !sponsorshipsLoading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-2">
          <p className="text-red-300 text-[10px]">Failed to load sponsorships: {sponsorshipsError}</p>
          <button onClick={onRetrySponsorships} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-200 text-[10px] font-semibold">Retry</button>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Sponsorships</h4>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <p className="text-white text-xs font-semibold mb-2">Active Sponsorships</p>
          {activeContracts.length === 0 && <p className="text-gray-600 text-[9px]">No active contracts yet. Accept a sponsor deal below to start.</p>}
          {activeContracts.map(contract => (
            <BrandDealContractCard
              key={contract.id}
              brandName={contract.brand_name}
              tier={contract.tier}
              status={contract.status || 'active'}
              deliverablesRemaining={contract.deliverables_remaining}
              turnsRemaining={contract.turns_remaining}
              personaFitText={contract.persona_fit_score != null ? `Fit: ${(Number(contract.persona_fit_score) * 100).toFixed(0)}%` : ''}
              loyaltyTier={contract.loyalty_tier}
              kpis={contract.kpis}
              kpiProgress={contract.kpi_progress}
              showAccrualHelper
              action={(
                <button
                  onClick={() => onSponsorVideo?.(contract.id)}
                  disabled={Number(contract.deliverables_remaining || 0) <= 0}
                  className="px-2.5 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-semibold disabled:opacity-40"
                >
                  Sponsor a Video
                </button>
              )}
            />
          ))}
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
          <p className="text-white text-xs font-semibold mb-2">Available Sponsor Deals</p>
          {offers.length === 0 && <p className="text-gray-500 text-[10px]">No sponsor deals available right now. New offers appear over turns.</p>}
          {offers.map(offer => (
            <BrandDealContractCard
              key={offer.id}
              brandName={offer.brand_name}
              tier={offer.tier}
              status={offer.status || 'offered'}
              deliverablesRemaining={Number(offer.deliverable_count_required || 1)}
              turnsRemaining={Math.max(1, Number(offer.end_turn_id || 0) - Number(offer.start_turn_id || currentTurnIndex || 0))}
              showAccrualHelper
              subtext={`$${Number(offer.per_turn_fee || 0).toFixed(0)}/turn · Signing bonus $${Number(offer.signing_bonus || 0).toFixed(0)} · ${Math.max(1, Number(offer.end_turn_id || 0) - Number(offer.start_turn_id || currentTurnIndex || 0))} turns${Number(offer?.scene_brand_bonus_pct || offer?.metadata?.scene_brand_bonus_pct || 0) > 0 ? ` · +${Number(offer?.scene_brand_bonus_pct || offer?.metadata?.scene_brand_bonus_pct || 0)}% scene` : ''}`}
              personaFitText={`Persona fit: ${(Number(offer.persona_fit_score || 0.5) * 100).toFixed(0)}% · ${Array.isArray(offer.persona_fit_reason) ? (offer.persona_fit_reason[0] || 'Neutral fit') : (offer.persona_fit_reason || 'Neutral fit')}${offer?.scene_fit_reason ? ` · ${offer.scene_fit_reason}` : ''}`}
              loyaltyTier={offer.loyalty_tier}
              kpis={offer.kpis}
              kpiProgress={offer.kpi_progress}
              action={(
                <button
                  onClick={() => onAcceptOffer?.(offer.id)}
                  disabled={acceptingOfferId === offer.id}
                  className="px-2.5 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-[10px] font-semibold disabled:opacity-40"
                >
                  {acceptingOfferId === offer.id ? 'Accepting…' : 'Accept Deal'}
                </button>
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab({ videos, subs, totalViews, totalRevenue, totalWatchTime, sponsorshipAnalytics }) {
  return (
    <div className="p-4 space-y-3">
      <h3 className="text-white text-sm font-bold">Analytics Dashboard</h3>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Views", value: formatNum(totalViews), color: "text-red-400" },
          { label: "Ad Revenue", value: `$${totalRevenue.toFixed(2)}`, color: "text-green-400" },
          { label: "Subscribers", value: formatNum(subs), color: "text-white" },
          { label: "Watch Time", value: formatTime(totalWatchTime), color: "text-blue-400" },
          { label: "Avg Views/Video", value: videos.length > 0 ? formatNum(Math.floor(totalViews / videos.length)) : "0", color: "text-purple-400" },
          { label: "Avg Retention", value: videos.length > 0 ? `${Math.floor(videos.reduce((s, v) => s + (Number(v.resolvedRetentionPct || 50)), 0) / videos.length)}%` : "0%", color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/[0.05] rounded-xl p-3">
            <p className="text-gray-500 text-[9px] uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`${s.color} text-lg font-bold`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue by Pillar */}
      <div>
        <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Revenue by Content Pillar</h4>
        {CONTENT_PILLARS.map(p => {
          const pillarVids = videos.filter(v => v.resolvedPillarType === p.id);
          const rev = pillarVids.reduce((s, v) => s + (v.revenue || 0), 0);
          return (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <span className="text-gray-300 text-xs">{p.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-[10px]">{pillarVids.length} vids</span>
                <span className="text-green-400 text-[10px] font-semibold">${rev.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Sponsored Uplift (Recent Turns)</h4>
        {(sponsorshipAnalytics || []).slice(0, 8).map((row, idx) => {
          const uplift = Math.max(0, computeSponsoredUpliftFromLogRow(row?.metadata));
          const boostedRevenue = Math.max(0, safeNum(row?.ad_revenue, safeNum(row?.metadata?.boosted_revenue, 0)));
          const baseRevenue = Math.max(0, safeNum(row?.metadata?.base_revenue, boostedRevenue - uplift));
          if (!row?.metadata?.sponsored) return null;
          return (
            <div key={`${row.post_id}-${idx}`} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
              <div>
                <p className="text-gray-300 text-[10px]">Turn {row.global_turn_id} · Contract {String(row?.metadata?.contract_id || '').slice(0, 8)}</p>
                <p className="text-gray-600 text-[8px]">Base ${baseRevenue.toFixed(2)} → Boosted ${boostedRevenue.toFixed(2)}</p>
              </div>
              <span className="text-amber-300 text-[10px] font-semibold">+${uplift.toFixed(2)}</span>
            </div>
          );
        })}
        {(sponsorshipAnalytics || []).filter(r => r?.metadata?.sponsored).length === 0 && (
          <p className="text-gray-600 text-[9px]">No sponsored uplift recorded yet.</p>
        )}
      </div>

      {/* Milestones */}
      <div>
        <h4 className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Channel Milestones</h4>
        {MILESTONE_THRESHOLDS.map(m => {
          const achieved = subs >= m.subs;
          return (
            <div key={m.subs} className={`flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 ${achieved ? '' : 'opacity-40'}`}>
              <div className="flex items-center gap-2"><span>{m.badge}</span><span className="text-gray-300 text-xs">{m.label}</span></div>
              <div className="flex items-center gap-2"><span className="text-gray-500 text-[9px]">{formatNum(m.subs)} subs</span>{achieved && <span className="text-green-400 text-[8px]">✓</span>}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-red-500/10 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Zap className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-gray-400 text-[10px] leading-relaxed">
            {subs >= 1000 ? "Channel monetized! Higher production quality = better retention = more ad revenue. Build content pillars for consistent growth." : "Reach 1K subs to unlock monetization. VidWave Shorts get algorithm-boosted distribution."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ShortsTab({ videos, subs: _subs, profile: _profile, onCreateShort }) {
  const formatNum = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n || 0);
  };

  const totalShortsViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalShortsRevenue = videos.reduce((s, v) => s + (v.revenue || 0), 0);

  return (
    <div className="p-4 space-y-4">
      {/* Shorts Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center">
            <Smartphone className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-white text-sm font-bold">VidWave Shorts</h3>
            <p className="text-gray-500 text-[9px]">{videos.length} shorts · {formatNum(totalShortsViews)} views</p>
          </div>
        </div>
        <button
          onClick={onCreateShort}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold transition-colors"
        >
          <Plus className="w-3 h-3" />
          Create Short
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/[0.04] rounded-lg p-2 text-center">
          <p className="text-white text-sm font-bold">{videos.length}</p>
          <p className="text-gray-500 text-[8px]">Shorts</p>
        </div>
        <div className="bg-white/[0.04] rounded-lg p-2 text-center">
          <p className="text-red-400 text-sm font-bold">{formatNum(totalShortsViews)}</p>
          <p className="text-gray-500 text-[8px]">Total Views</p>
        </div>
        <div className="bg-white/[0.04] rounded-lg p-2 text-center">
          <p className="text-green-400 text-sm font-bold">${totalShortsRevenue.toFixed(2)}</p>
          <p className="text-gray-500 text-[8px]">Revenue</p>
        </div>
      </div>

      {/* Shorts Feed — vertical scroll like real YouTube Shorts */}
      {videos.length === 0 ? (
        <div className="text-center py-12">
          <Smartphone className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-semibold mb-1">No Shorts Yet</p>
          <p className="text-gray-500 text-[10px] mb-4">Create your first Short to reach new audiences.<br/>Shorts get algorithm-boosted distribution!</p>
          <button onClick={onCreateShort} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">
            <Plus className="w-3 h-3 inline mr-1" />Create Your First Short
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* YouTube Shorts Feed - Full Width Vertical Mobile Layout */}
          <div className="flex flex-col gap-4">
            {videos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((short, idx) => (
              <motion.div
                key={short.id || idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="w-full bg-black rounded-2xl overflow-hidden"
              >
                {/* Video Preview - Full Height with Thumbnail */}
                <div className="relative aspect-[9/16] bg-black">
                  {/* Actual Thumbnail */}
                  {(short.thumbnail_url || short.metadata?.thumbnail_url) ? (
                    <img 
                      src={short.thumbnail_url || short.metadata?.thumbnail_url} 
                      alt={short.title || 'Short thumbnail'}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
                      <Play className="w-12 h-12 text-white/40" />
                    </div>
                  )}
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/80 flex items-end justify-center p-4">
                    <div className="text-center">
                      <h3 className="text-white text-sm font-bold mb-1 line-clamp-2 px-2">
                        {short.title || 'Untitled Short'}
                      </h3>
                      {short.caption && (
                        <p className="text-white/80 text-xs line-clamp-2 px-2">
                          {short.caption}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Reaction Overlay */}
                  {short.metadata?.is_npc_reaction && (
                    <>
                      <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full backdrop-blur-md z-10 border border-white/10">
                        <span className="text-[10px] text-white font-bold whitespace-nowrap">
                          {short.metadata?.reaction_channel_icon} {short.metadata?.reaction_channel_name} Reacts
                        </span>
                      </div>
                      {short.metadata?.thumbnail_overlay && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-6xl filter drop-shadow-2xl animate-pulse-slow">
                            {short.metadata.thumbnail_overlay}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* YouTube Shorts Overlay Actions */}
                  <div className="absolute right-2 bottom-2 flex flex-col items-center gap-3">
                    {/* Like Button */}
                    <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Heart className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white text-xs">{formatNum(short.likes || 0)}</span>
                    
                    {/* Comment Button */}
                    <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white text-xs">{formatNum(short.comments || 0)}</span>
                    
                    {/* Share Button */}
                    <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Share2 className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white text-xs">{formatNum(short.shares || 0)}</span>
                    
                    {/* Menu Button */}
                    <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                      <MoreVertical className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* View Count */}
                  <div className="absolute left-2 bottom-2 flex items-center gap-1">
                    <Eye className="w-3 h-3 text-white/80" />
                    <span className="text-white text-xs font-medium">{formatNum(short.views || 0)}</span>
                  </div>

                  {/* Viral Badge */}
                  {short.is_viral && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/90 backdrop-blur-sm">
                      <TrendingUp className="w-3 h-3 text-white" />
                      <span className="text-white text-xs font-bold">VIRAL</span>
                    </div>
                  )}
                </div>

                {/* Bottom Creator Bar */}
                <div className="bg-black/90 backdrop-blur-sm px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Creator Avatar - Profile Picture */}
                      {short.artistProfile?.profile_image_url ? (
                        <img 
                          src={short.artistProfile.profile_image_url} 
                          alt={short.artistProfile.artist_name || 'Artist'}
                          className="w-6 h-6 rounded-full object-cover border border-white/20"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <Smartphone className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="text-white text-xs font-semibold">{short.artistProfile?.artist_name || 'Artist'}</p>
                        <p className="text-gray-400 text-[9px]">
                          {short.created_at ? new Date(short.created_at).toLocaleDateString() : 'Recent'}
                        </p>
                      </div>
                    </div>
                    {short.revenue > 0 && (
                      <div className="text-green-400 text-xs font-semibold">
                        +${(short.revenue || 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Shorts Tips */}
      <div className="bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-red-500/10 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white text-[10px] font-semibold mb-0.5">Shorts Tips</p>
            <p className="text-gray-400 text-[9px] leading-relaxed">
              Shorts get 50% more algorithm distribution than long-form. They convert ~0.15% of viewers to subscribers. Post consistently for maximum growth!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
