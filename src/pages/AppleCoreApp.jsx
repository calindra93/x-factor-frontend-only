import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, RefreshCw } from "lucide-react";
import ApplecorePage from "../components/applecore/ApplecorePage";
import AppleCoreSearchPage from "../components/applecore/AppleCoreSearchPage";
import AppleCoreArtistProfile from "../components/applecore/AppleCoreArtistProfile";
import ApplecoreBottomNav from "../components/applecore/ApplecoreBottomNav";
import AppleCorePlaylistDetail from "../components/applecore/AppleCorePlaylistDetailClean";
import AppleCoreRadio from "../components/applecore/AppleCoreRadio";
import AppleCoreAwards from "../components/applecore/AppleCoreAwards";
import { getVisibleReleasedReleases, isEditorialEligible, isDiscoveryEligible } from "@/lib/releaseVisibility";

const formatStreams = (value) => `${(value || 0).toLocaleString()} streams`;

const buildPlaylists = (releases, profileById, type) => {
  const eligible = releases.filter((release) =>
    type === "editorial" ? isEditorialEligible(release) : isDiscoveryEligible(release)
  );

  if (eligible.length === 0) return [];

  const byGenre = new Map();
  const byRegion = new Map();

  eligible.forEach((release) => {
    const profile = profileById.get(release.artist_id);
    const genre = release.genre || profile?.genre;
    const region = release.primary_region || profile?.region;

    if (genre) {
      if (!byGenre.has(genre)) byGenre.set(genre, []);
      byGenre.get(genre).push(release);
    }
    if (type === "curated" && region) {
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push(release);
    }
  });

  const playlistFromGroup = (label, releasesGroup, suffix) => ({
    name: `${label} ${suffix}`,
    description: `${releasesGroup.length} curated releases`,
    saves: formatStreams(
      releasesGroup.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0)
    ),
    followers: formatStreams(
      releasesGroup.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0)
    ),
    cover: releasesGroup.find((release) => Boolean(release.cover_artwork_url))?.cover_artwork_url || null,
    covers: releasesGroup
      .map((release) => release.cover_artwork_url)
      .filter(Boolean)
      .slice(0, 4),
    releases: releasesGroup,
    tracks: releasesGroup.length,
    updated: new Date().toISOString(),
    updateDay: type === "editorial" ? 5 : type === "curated" ? 2 : 1,
  });

  const playlists = [];

  byGenre.forEach((group, label) => {
    playlists.push(playlistFromGroup(label, group.slice(0, 25), type === "editorial" ? "Essentials" : "Finds"));
  });

  if (type === "curated") {
    byRegion.forEach((group, label) => {
      playlists.push(playlistFromGroup(label, group.slice(0, 25), "Spotlight"));
    });
  }

  return playlists;
};

export default function AppleCoreApp() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState(() => (searchParams.get("tab") === "awards" ? "awards" : "home"));
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [artistCatalog, setArtistCatalog] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [discoveryPlaylists, setDiscoveryPlaylists] = useState([]);
  const [editorialPlaylists, setEditorialPlaylists] = useState([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState([]);
  const [freshReleases, setFreshReleases] = useState([]);
  const [playerProfile, setPlayerProfile] = useState(null);
  const [playerReleases, setPlayerReleases] = useState([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [latestAwardYear, setLatestAwardYear] = useState(null);
  const [latestAwards, setLatestAwards] = useState([]);
  const [playerAwards, setPlayerAwards] = useState([]);
  const [awardsLoadError, setAwardsLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const artists = useMemo(() => {
    if (artistCatalog.length > 0) return artistCatalog;
    return [];
  }, [artistCatalog]);

  const continueWithFallback = () => {
    setArtistCatalog([]);
    setLeaderboard([]);
    setDiscoveryPlaylists([]);
    setEditorialPlaylists([]);
    setCuratedPlaylists([]);
    setFreshReleases([]);
    setCurrentTurnIndex(0);
    setLatestAwardYear(null);
    setLatestAwards([]);
    setPlayerAwards([]);
    setAwardsLoadError(null);
    setLoadError(null);
    setLoading(false);
  };

  useEffect(() => {
    const requestedTab = searchParams.get("tab");

    if (requestedTab === "awards" && view !== "awards") {
      setView("awards");
      return;
    }

    if (!requestedTab && view === "awards") {
      setView("home");
    }
  }, [searchParams, view]);

  const syncTabParam = (nextView) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextView === "awards") next.set("tab", "awards");
      else next.delete("tab");
      return next;
    }, { replace: true });
  };

  const loadLeaderboard = async () => {
    try {
      setLoadError(null);
      const [profiles, releases, fanProfiles] = await Promise.all([
        base44.entities.ArtistProfile.list(),
        base44.entities.Release.list(),
        base44.entities.FanProfile.list(),
      ]);

      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      const fanProfileById = new Map(fanProfiles.map((fp) => [fp.artist_id, fp]));
      const released = getVisibleReleasedReleases(releases, { platform: "applecore" });
  const releaseById = new Map(released.map((release) => [release.id, release]));
      const totalsByArtist = new Map();

      released.forEach((release) => {
        if (!totalsByArtist.has(release.artist_id)) {
          totalsByArtist.set(release.artist_id, {
            totalStreams: 0,
          });
        }
        const totals = totalsByArtist.get(release.artist_id);
        totals.totalStreams += release.lifetime_streams || 0;
      });

      const catalog = profiles.map((profile) => {
        const totals = totalsByArtist.get(profile.id) || { totalStreams: 0 };
        const fanProfile = fanProfileById.get(profile.id);
        const monthlyListeners = fanProfile?.monthly_listeners || 0;
        return {
          id: profile.id,
          name: profile.artist_name || "Artist",
          image: profile.artist_image,
          totalStreams: totals.totalStreams,
          monthlyListeners,
          globalRank: profile.global_rank,
          genre: profile.genre,
          region: profile.region,
        };
      });

      const ranked = [...catalog]
        .sort((a, b) => b.monthlyListeners - a.monthlyListeners)
        .slice(0, 10)
        .map((artist, index) => ({
          ...artist,
          rank: index + 1,
        }));

      setArtistCatalog(catalog);
      setLeaderboard(ranked);
      setDiscoveryPlaylists(buildPlaylists(released, profileById, "discovery"));
      setEditorialPlaylists(buildPlaylists(released, profileById, "editorial"));
      setCuratedPlaylists(buildPlaylists(released, profileById, "curated"));

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

      // Load current player's profile and releases for radio pitch
      const userAccountId = localStorage.getItem('user_account_id');
      const myProfile = userAccountId ? profiles.find(p => p.user_account_id === userAccountId) : null;
      if (userAccountId) {
        if (myProfile) {
          setPlayerProfile(myProfile);
          const myReleases = released.filter(r => r.artist_id === myProfile.id);
          setPlayerReleases(myReleases);
        }
      }

      if (!myProfile) {
        setPlayerProfile(null);
        setPlayerReleases([]);
      }

      let nextCurrentTurnIndex = 0;
      let nextLatestAwardYear = null;
      let nextLatestAwards = [];
      let nextPlayerAwards = [];
      let nextAwardsLoadError = null;

      if (isSupabaseConfigured) {
        const enrichAwards = (rows) =>
          (rows || []).map((award) => {
            const artist = profileById.get(award.player_id);
            const release = award.release_id ? releaseById.get(award.release_id) : null;

            return {
              ...award,
              artist_name: artist?.artist_name || artist?.name || "Unknown Artist",
              release_title: release?.release_name || release?.title || null,
            };
          });

        try {
          const { data: turnState, error: turnStateError } = await supabaseClient
            .from('turn_state')
            .select('global_turn_id')
            .eq('id', 1)
            .maybeSingle();

          if (turnStateError) throw turnStateError;
          nextCurrentTurnIndex = turnState?.global_turn_id ?? 0;

          const { data: latestAwardRow, error: latestAwardError } = await supabaseClient
            .from('applecore_awards')
            .select('award_year')
            .order('award_year', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestAwardError) throw latestAwardError;

          nextLatestAwardYear = latestAwardRow?.award_year ?? null;

          if (nextLatestAwardYear != null) {
            const { data: latestAwardRows, error: latestAwardRowsError } = await supabaseClient
              .from('applecore_awards')
              .select('id, award_year, category, player_id, release_id, position, stream_boost_multiplier, boost_expires_turn, awarded_turn')
              .eq('award_year', nextLatestAwardYear)
              .order('category', { ascending: true })
              .order('position', { ascending: true });

            if (latestAwardRowsError) throw latestAwardRowsError;
            nextLatestAwards = enrichAwards(latestAwardRows);
          }

          if (myProfile?.id) {
            const { data: myAwardRows, error: myAwardRowsError } = await supabaseClient
              .from('applecore_awards')
              .select('id, award_year, category, player_id, release_id, position, stream_boost_multiplier, boost_expires_turn, awarded_turn')
              .eq('player_id', myProfile.id)
              .order('award_year', { ascending: false })
              .order('position', { ascending: true })
              .limit(20);

            if (myAwardRowsError) throw myAwardRowsError;
            nextPlayerAwards = enrichAwards(myAwardRows);
          }
        } catch (awardsError) {
          console.error('[AppleCoreApp] Awards load error:', awardsError);
          nextAwardsLoadError = 'Unable to load AppleCore awards right now.';
        }
      }

      setCurrentTurnIndex(nextCurrentTurnIndex);
      setLatestAwardYear(nextLatestAwardYear);
      setLatestAwards(nextLatestAwards);
      setPlayerAwards(nextPlayerAwards);
      setAwardsLoadError(nextAwardsLoadError);
    } catch (error) {
      console.error('[AppleCoreApp] Data load error:', error);
      if (localStorage.getItem("dev_demo_mode") === "1") {
        continueWithFallback();
        return;
      }
      setLoadError("Unable to sync AppleCore data right now.");
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
    syncTabParam("profile");
  };

  const handleChangeView = (nextView) => {
    setView(nextView);
    syncTabParam(nextView);
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
        <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{loadError}</p>
          <button onClick={() => { setLoading(true); setLoadError(null); loadLeaderboard(); }}
            className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2">
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
            {view === "home" && (
              <ApplecorePage
                playlists={[]}
                topArtists={leaderboard.length > 0 ? leaderboard : artists}
                discoveryPlaylists={discoveryPlaylists}
                editorialPlaylists={editorialPlaylists}
                curatedPlaylists={curatedPlaylists}
                freshReleases={freshReleases}
                playerProfile={playerProfile}
                playerReleases={playerReleases}
                onSelectArtist={handleSelectArtist}
                onPlaylistClick={handlePlaylistClick}
                onReleaseClick={(release) => handleSelectArtist({ id: release.artist_id })}
              />
            )}
            {view === "search" && <AppleCoreSearchPage artists={artists} onSelectArtist={handleSelectArtist} />}
            {view === "radio" && <AppleCoreRadio profile={playerProfile} releases={playerReleases} />}
            {view === "awards" && (
              <AppleCoreAwards
                latestAwardYear={latestAwardYear}
                latestAwards={latestAwards}
                playerAwards={playerAwards}
                currentTurnIndex={currentTurnIndex}
                loadError={awardsLoadError}
              />
            )}
            {view === "profile" && <AppleCoreArtistProfile artistId={selectedArtistId} onSelectArtist={handleSelectArtist} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedPlaylist && (
          <AppleCorePlaylistDetail
            playlist={selectedPlaylist}
            onClose={handleClosePlaylist}
          />
        )}
      </AnimatePresence>

      <ApplecoreBottomNav activeTab={view} onTabChange={handleChangeView} />
    </div>
  );
}
