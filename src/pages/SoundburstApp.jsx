import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, RefreshCw } from "lucide-react";
import SoundburstPage from "../components/soundburst/SoundburstPage";
import SoundburstSearchPage from "../components/soundburst/SoundburstSearchPage";
import SoundburstArtistProfile from "../components/soundburst/SoundburstArtistProfile";
import SoundburstBottomNav from "../components/soundburst/SoundburstBottomNav";
import UndergroundRadio from "../components/soundburst/UndergroundRadio";
import { getVisibleReleasedReleases } from "@/lib/releaseVisibility";
import { buildPlaylists } from "@/lib/soundburstPlaylistsClean";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import SoundburstPlaylistDetail from "../components/soundburst/SoundburstPlaylistDetailClean";
import SoundburstEvents from "../components/soundburst/SoundburstEvents";

const formatStreams = (value) => `${(value || 0).toLocaleString()} streams`;

const CAREER_STAGE_PRIORITY = {
  Unknown: 100,
  "Local Artist": 95,
  "Local Buzz": 90,
  "Underground Artist": 85,
  "Cult Favorite": 75,
  "Breakout Artist": 45,
  "Mainstream Artist": 20,
  "A-List Star": 10,
  "Global Superstar": 5,
  "Legacy Icon": 0,
};

const getCareerStagePriority = (careerStage) => CAREER_STAGE_PRIORITY[careerStage] ?? 70;
const RISING_UNDERGROUND_ALLOWED_STAGES = new Set([
  "Unknown",
  "Local Artist",
  "Local Buzz",
  "Underground Artist",
  "Cult Favorite",
]);

const isRisingUndergroundEligible = (artist) =>
  RISING_UNDERGROUND_ALLOWED_STAGES.has(artist?.career_stage || "Unknown");

const getReleaseTimestamp = (release) => {
  const candidate = release.release_date || release.created_date || release.created_at;
  const timestamp = candidate ? new Date(candidate).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getDiscoveryPriority = (release, profileById) => {
  const profile = profileById.get(release.artist_id);
  return {
    stagePriority: getCareerStagePriority(profile?.career_stage || "Unknown"),
    recency: getReleaseTimestamp(release),
    streamFloor: release.lifetime_streams || 0,
  };
};

const sortDiscoveryReleases = (left, right, profileById) => {
  const leftPriority = getDiscoveryPriority(left, profileById);
  const rightPriority = getDiscoveryPriority(right, profileById);

  if (leftPriority.stagePriority !== rightPriority.stagePriority) {
    return rightPriority.stagePriority - leftPriority.stagePriority;
  }

  if (leftPriority.recency !== rightPriority.recency) {
    return rightPriority.recency - leftPriority.recency;
  }

  if (leftPriority.streamFloor !== rightPriority.streamFloor) {
    return leftPriority.streamFloor - rightPriority.streamFloor;
  }

  return (left.title || left.release_name || "").localeCompare(right.title || right.release_name || "");
};

const sortDiscoveryGroups = (left, right) => {
  if (left.stagePriority !== right.stagePriority) {
    return right.stagePriority - left.stagePriority;
  }

  if (left.recency !== right.recency) {
    return right.recency - left.recency;
  }

  if (left.streamFloor !== right.streamFloor) {
    return left.streamFloor - right.streamFloor;
  }

  if (left.releaseCount !== right.releaseCount) {
    return right.releaseCount - left.releaseCount;
  }

  return left.name.localeCompare(right.name);
};

export default function SoundburstApp() {
  const navigate = useNavigate();
  const [view, setView] = useState("discover");
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [artistCatalog, setArtistCatalog] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [undergroundPlaylists, setUndergroundPlaylists] = useState([]);
  const [scenePlaylists, setScenePlaylists] = useState([]);
  const [freshReleases, setFreshReleases] = useState([]);
  const [allArtists, setAllArtists] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [radioShows, setRadioShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const artists = useMemo(() => {
    if (artistCatalog.length > 0) return artistCatalog;
    // For fallback, use artistCatalog if available, otherwise use allArtists with estimated monthly listeners
    return allArtists.map((artist, index) => ({
      ...artist,
      id: artist.id || `${artist.name}-${index}`,
      monthlyListeners: artist.followers ? Math.floor(artist.followers * 0.1) : 0, // Estimate 10% of followers as monthly listeners
      career_stage: artist.career_stage || 'Unknown', // Add career stage for fallback (actual database stage)
    }));
  }, [artistCatalog, allArtists]);

  const continueWithFallback = () => {
    setArtistCatalog([]);
    setLeaderboard([]);
    setUndergroundPlaylists([]);
    setScenePlaylists([]);
    setFreshReleases([]);
    setAllArtists([]);
    setLoadError(null);
    setLoading(false);
  };

  const loadLeaderboard = async () => {
    try {
      setLoadError(null);
      
      // Get current user account ID
      const userAccountId = localStorage.getItem('user_account_id');
      
      if (!userAccountId) {
        continueWithFallback();
        return;
      }
      
      const [profiles, releases, fanProfiles, userProfResults] = await Promise.all([
        base44.entities['ArtistProfile'].list(),
        base44.entities['Release'].list(),
        base44.entities['FanProfile'].list(),
        base44.entities['ArtistProfile'].filter({ user_account_id: userAccountId }).catch((err) => {
          console.error('[SoundburstApp] Failed to get user profile:', err);
          return [];
        }),
      ]);

      // Get the first (and only) user profile from the filter results
      const userProf = Array.isArray(userProfResults) && userProfResults.length > 0 ? userProfResults[0] : null;

      setAllArtists(profiles);
      setUserProfile(userProf);

      const profileById = new Map(profiles.map((p) => [p.id, p]));
      const fanProfileById = new Map(fanProfiles.map((fp) => [fp.artist_id, fp]));
      const released = getVisibleReleasedReleases(releases, { platform: "soundburst" });
      const totalsByArtist = new Map();

      released.forEach((release) => {
        if (!totalsByArtist.has(release.artist_id)) {
          totalsByArtist.set(release.artist_id, { totalStreams: 0 });
        }
        const totals = totalsByArtist.get(release.artist_id);
        totals.totalStreams += release.lifetime_streams || 0;
      });

      const catalog = profiles.map((p) => {
        const totals = totalsByArtist.get(p.id) || { totalStreams: 0 };
        const fanProfile = fanProfileById.get(p.id);
        const monthlyListeners = fanProfile?.monthly_listeners || 0;
        
        return {
          id: p.id,
          name: p.artist_name || "Artist",
          image: p.artist_image,
          totalStreams: totals.totalStreams,
          monthlyListeners,
          globalRank: p.global_rank,
          genre: p.genre,
          region: p.region,
          career_stage: p.career_stage || 'Unknown', // Add career stage for underground prioritization (actual database stage)
        };
      });

      const ranked = [...catalog]
        .filter(isRisingUndergroundEligible)
        .sort((a, b) => {
          const stageDelta = getCareerStagePriority(b.career_stage) - getCareerStagePriority(a.career_stage);
          if (stageDelta !== 0) return stageDelta;

          if (b.monthlyListeners !== a.monthlyListeners) {
            return b.monthlyListeners - a.monthlyListeners;
          }

          return (b.totalStreams || 0) - (a.totalStreams || 0);
        })
        .slice(0, 10)
        .map((artist, index) => ({
          ...artist,
          rank: index + 1,
        }));

      setArtistCatalog(catalog);
      setLeaderboard(ranked);
      setUndergroundPlaylists(buildPlaylists(released, profileById, "underground"));
      setScenePlaylists(buildPlaylists(released, profileById, "scene"));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const fresh = released
        .filter(r => new Date(r.created_date) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
        .slice(0, 10)
        .map(r => ({
          ...r,
          artist_name: profileById.get(r.artist_id)?.artist_name || "Unknown Artist"
        }));
      setFreshReleases(fresh);

      // Fetch active radio shows for the "On The Air" rail
      try {
        const showsResult = await invokeEdgeFunction("soundburstRadio", { action: "getShows" });
        if (showsResult.success && Array.isArray(showsResult.data?.shows)) {
          const releasesById = new Map(releases.map((r) => [r.id, r]));
          const formattedShows = showsResult.data.shows
            .filter((s) => s.status !== 'retired')
            .map((s) => ({
              id: s.id,
              name: s.name,
              genres: Array.isArray(s.genre_affinity) ? s.genre_affinity : [],
              tier: s.show_tier || "underground",
              listenerCount: s.listener_count || 0,
              releases: (s.curated_playlist || []).map((id) => releasesById.get(id)).filter(Boolean),
              isLive: true,
            }))
            .slice(0, 12);
          setRadioShows(formattedShows);
        }
      } catch (_e) {
        // Non-fatal — rail just won't render
      }

    } catch (error) {
      console.error('[SoundburstApp] Data load error:', error);
      if (localStorage.getItem("dev_demo_mode") === "1") {
        continueWithFallback();
        return;
      }
      setLoadError("Unable to sync Soundburst data right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const handleSelectArtist = (artist) => {
    setSelectedArtistId(artist.id || artist);
    setView("profile");
  };

  const handleChangeView = (nextView) => {
    setView(nextView);
    if (nextView === "profile") {
      setSelectedArtistId(null);
    }
  };

  const handlePlaylistClick = (playlist) => {
    setSelectedPlaylist(playlist);
  };

  const handleClosePlaylist = () => {
    setSelectedPlaylist(null);
  };

  const handleBack = () => {
    navigate('/career');
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{loadError}</p>
          <button onClick={() => { setLoading(true); setLoadError(null); loadLeaderboard(); }}
            className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <button onClick={continueWithFallback}
            className="px-5 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2 ml-2">
            Continue demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mx-auto w-full max-w-[420px] space-y-6 pb-24">
        {!selectedPlaylist && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 px-4 pt-3 text-xs font-medium text-white/50 transition hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Career
          </button>
        )}

        {!selectedPlaylist && (
          <>
            {view === "discover" && (
              <SoundburstPage
                topArtists={leaderboard.length > 0 ? leaderboard : artists}
                undergroundPlaylists={undergroundPlaylists}
                scenePlaylists={scenePlaylists}
                freshReleases={freshReleases}
                radioShows={radioShows}
                currentRegion={userProfile?.region}
                onSelectArtist={handleSelectArtist}
                onPlaylistClick={handlePlaylistClick}
                onReleaseClick={(release) => handleSelectArtist({ id: release.artist_id })}
                onCitySelect={(city) => {
                  setSelectedCity(city);
                  setView("events");
                }}
                onViewEvents={() => setView("events")}
              />
            )}
            {view === "search" && <SoundburstSearchPage artists={artists} onSelectArtist={handleSelectArtist} />}
            {view === "radio" && <UndergroundRadio userProfile={userProfile} />}
            {view === "events" && <SoundburstEvents profile={userProfile} artists={allArtists} selectedCity={selectedCity} />}
            {view === "profile" && <SoundburstArtistProfile artistId={selectedArtistId} onClose={() => setSelectedArtistId(null)} onSelectArtist={handleSelectArtist} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedPlaylist && (
          <SoundburstPlaylistDetail
            playlist={selectedPlaylist}
            onClose={handleClosePlaylist}
          />
        )}
      </AnimatePresence>

      <SoundburstBottomNav activeTab={view} onTabChange={handleChangeView} />
    </div>
  );
}
