import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, RefreshCw } from "lucide-react";
import StreamifyPage from "../components/streamify/StreamifyPage";
import SearchPage from "../components/streamify/SearchPage";
import StreamifyArtistProfile from "../components/streamify/StreamifyArtistProfile";
import StreamifyBottomNav from "../components/streamify/StreamifyBottomNav";
import PlaylistDetail from "../components/streamify/PlaylistDetailClean";
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
    if (type === "discovery" && region) {
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push(release);
    }
  });

  const playlistFromGroup = (label, releasesGroup, suffix) => {
    const totalStreams = releasesGroup.reduce((sum, r) => sum + (r.lifetime_streams || 0), 0);
    return {
      name: `${label} ${suffix}`,
      description: `${releasesGroup.length} releases shaping the ${label.toLowerCase()} sound right now.`,
      saves: formatStreams(totalStreams),
      followers: formatStreams(totalStreams),
      cover: releasesGroup.find((r) => Boolean(r.cover_artwork_url))?.cover_artwork_url || null,
      covers: releasesGroup.map((r) => r.cover_artwork_url).filter(Boolean).slice(0, 4),
      releases: releasesGroup,
      updateDay: type === "editorial" ? 5 : 1,
    };
  };

  const playlists = [];

  byGenre.forEach((group, label) => {
    playlists.push(playlistFromGroup(label, group.slice(0, 25), type === "editorial" ? "Essentials" : "Finds"));
  });

  if (type === "discovery") {
    byRegion.forEach((group, label) => {
      playlists.push(playlistFromGroup(label, group.slice(0, 25), "Radar"));
    });
  }

  return playlists;
};

export default function StreamifyApp() {
  const navigate = useNavigate();
  const [view, setView] = useState("home");
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [artistCatalog, setArtistCatalog] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [discoveryPlaylists, setDiscoveryPlaylists] = useState([]);
  const [editorialPlaylists, setEditorialPlaylists] = useState([]);
  const [freshReleases, setFreshReleases] = useState([]);
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
    setFreshReleases([]);
    setLoadError(null);
    setLoading(false);
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
      const released = getVisibleReleasedReleases(releases, { platform: "streamify" });
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
    } catch (error) {
      console.error('[StreamifyApp] Data load error:', error);
      if (localStorage.getItem("dev_demo_mode") === "1") {
        continueWithFallback();
        return;
      }
      setLoadError("Unable to sync Streamify data right now.");
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
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{loadError}</p>
          <button onClick={() => { setLoading(true); setLoadError(null); loadLeaderboard(); }}
            className="px-5 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2">
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
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-xs font-medium text-white/50 transition hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Career
        </button>

        {!selectedPlaylist && (
          <>
            {view === "home" && (
              <StreamifyPage
                playlists={[]}
                topArtists={leaderboard.length > 0 ? leaderboard : artists}
                discoveryPlaylists={discoveryPlaylists}
                editorialPlaylists={editorialPlaylists}
                freshReleases={freshReleases}
                onSelectArtist={handleSelectArtist}
                onPlaylistClick={handlePlaylistClick}
                onReleaseClick={(release) => handleSelectArtist({ id: release.artist_id })}
              />
            )}
            {view === "search" && <SearchPage artists={artists} onSelectArtist={handleSelectArtist} />}
            {view === "profile" && <StreamifyArtistProfile artistId={selectedArtistId} onSelectArtist={handleSelectArtist} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedPlaylist && (
          <PlaylistDetail 
            playlist={selectedPlaylist} 
            onClose={handleClosePlaylist}
          />
        )}
      </AnimatePresence>

      <StreamifyBottomNav currentView={view} onChange={handleChangeView} />
    </div>
  );
}
