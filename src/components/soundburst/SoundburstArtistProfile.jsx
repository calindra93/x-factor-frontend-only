import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart3, Play, Shuffle, Plus, MoreHorizontal, X, Edit3 } from "lucide-react";
import FanEngagementPanel from "@/components/shared/FanEngagementPanel";
import ArtistEventsTab from "@/components/shared/ArtistEventsTab";
import { DiscographySection, FansAlsoLikeSection, FeaturedTrackSection } from "@/components/shared/ArtistProfileSections";

import { getVisibleReleasedReleases } from "@/lib/releaseVisibility";
import { computePlatformRank } from "@/lib/platformRanking";
import { clearExpiredArtistPick } from "@/lib/artistPickUtils";
import PlatformProfileEditor from "@/components/shared/PlatformProfileEditor";

export default function SoundburstArtistProfile({ artistId, onSelectArtist, onClose: _onClose }) {
  const [profile, setProfile] = useState(null);
  const [songs, setSongs] = useState([]);
  const [releases, setReleases] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("music");
  const [loading, setLoading] = useState(true);
  const [engagementRelease, setEngagementRelease] = useState(null);
  const [fanProfile, setFanProfile] = useState(null);
  const [undergroundRank, setUndergroundRank] = useState(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  useEffect(() => {
    if (artistId === "undefined" || artistId === "null") return;

    const loadData = async () => {
      try {
        setLoading(true);
        let activeProfile;

        if (artistId) {
          const profiles = await base44.entities.ArtistProfile.filter({ id: artistId });
          activeProfile = profiles?.[0];
        } else {
          const userAccountId = localStorage.getItem('user_account_id');
          if (!userAccountId) {
            setProfile(null); setSongs([]); setReleases([]); setEvents([]);
            setLoading(false);
            return;
          }
          const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
          activeProfile = profiles?.[0];
        }

        activeProfile = clearExpiredArtistPick(activeProfile);
        setProfile(activeProfile);

        if (!activeProfile?.id) {
          setSongs([]);
          setReleases([]);
          setEvents([]);
          setLoading(false);
          return;
        }

        const [allSongs, allReleases, allEvents, fanProfile, allArtists] = await Promise.all([
          base44.entities.Song.filter({ artist_id: activeProfile.id }, "-created_date"),
          base44.entities.Release.filter({ artist_id: activeProfile.id }, "-release_date"),
          base44.entities.TourEvent.filter({ artist_id: activeProfile.id }, "event_date", 6),
          base44.entities.FanProfile.filter({ artist_id: activeProfile.id }).then(fps => fps?.[0] || null),
          base44.entities.ArtistProfile.list(),
        ]);

        setSongs(allSongs);
        setReleases(allReleases);
        setEvents(allEvents);
        setFanProfile(fanProfile);

        const rank = computePlatformRank(allArtists, activeProfile.id, "soundburst");
        setUndergroundRank(rank);
        setLoading(false);
      } catch (error) {
        console.error("[SoundburstArtistProfile] Load error:", error);
        setLoading(false);
      }
    };

    loadData();
  }, [artistId]);

  const releasedReleases = useMemo(() => {
    const catalog = getVisibleReleasedReleases(releases, { platform: "soundburst" });
    return catalog.sort((a, b) => new Date(b.release_date || 0).getTime() - new Date(a.release_date || 0).getTime());
  }, [releases]);

  const popularSongs = useMemo(() => {
    const base = songs.filter((s) => s.release_status === "released");
    return [...base]
      .sort((a, b) => (b.popularity || b.streams || b.quality || 0) - (a.popularity || a.streams || a.quality || 0))
      .slice(0, 5);
  }, [songs]);

  const totalStreams = releasedReleases.reduce((sum, r) => sum + (r.platform_streams?.Soundburst || 0), 0);
  const monthlyListeners = fanProfile?.monthly_listeners || 0;

  const songStreamEstimates = useMemo(() => {
    if (popularSongs.length === 0 || totalStreams === 0) return {};
    const totalQuality = popularSongs.reduce((s, song) => s + (song.quality || 50), 0);
    const map = {};

    popularSongs.forEach((song) => {
      const weight = (song.quality || 50) / Math.max(1, totalQuality);
      map[song.id] = Math.floor(totalStreams * weight);
    });
    return map;
  }, [popularSongs, totalStreams]);

  const songPlatformStreams = useMemo(() => {
    const map = {};
    popularSongs.forEach((song) => {
      const rel = releasedReleases.find(r => r.tracklist?.includes(song.id)) ||
                  releasedReleases.find(r => r.id === song.release_id || r.id === song.single_release_id);
      if (rel?.platform_streams?.Soundburst) map[song.id] = rel.platform_streams.Soundburst;
    });
    return map;
  }, [popularSongs, releasedReleases]);

  const formatStreams = (n) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;

    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-emerald-500/10 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/50">
        No Soundburst profile data found yet.
      </div>
    );
  }

  return (
    <div className="relative pb-6 text-white">
      {/* ── Hero Image ── */}
      <div className="relative h-72 w-full overflow-hidden">
        {profile?.soundburst_header_image ? (
          <img src={profile.soundburst_header_image} alt={profile.artist_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-700/60 via-cyan-600/30 to-black text-4xl font-bold text-white/30">
            {profile?.artist_name?.[0] || "?"}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-[#0a0a0f]" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg">{profile?.artist_name || "Artist"}</h1>
          <p className="mt-1 text-sm text-white/70">{monthlyListeners.toLocaleString()} monthly listeners</p>
        </div>
      </div>

      {/* ── Action Row ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="flex h-8 items-center gap-1 rounded-full border border-white/20 px-4 text-xs font-semibold text-white hover:bg-white/10">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-8 items-center rounded-full border border-white/20 px-4 text-xs font-semibold text-white hover:bg-white/10">Follow</button>
        <button className="h-8 w-8 flex items-center justify-center rounded-full text-white/60 hover:text-white">
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        <button className="h-8 w-8 flex items-center justify-center text-white/60 hover:text-emerald-300">
          <Shuffle className="h-5 w-5" />
        </button>
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#2a4cff] to-[#4b7dff] shadow-lg shadow-blue-500/30 hover:from-[#3a5cff] hover:to-[#5b8dff] hover:scale-105 transition-all">
          <Play className="h-5 w-5 fill-white text-white ml-0.5" />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-4 border-b border-white/[0.08] px-4">
        <button onClick={() => setActiveTab("music")}
          className={`pb-2.5 text-sm font-semibold transition ${activeTab === "music" ? "text-blue-300 border-b-2 border-blue-400" : "text-white/50"}`}>
          Music
        </button>
        <button onClick={() => setActiveTab("events")}
          className={`pb-2.5 text-sm font-semibold transition ${activeTab === "events" ? "text-blue-300 border-b-2 border-blue-400" : "text-white/50"}`}>
          Events
        </button>
      </div>

      {activeTab === "music" ? (
        <div className="space-y-6 pb-6 pt-4">

          {/* ── Popular Tracks ── */}
          <section className="px-4">
            <h2 className="mb-3 text-base font-bold">Popular</h2>
            {popularSongs.length === 0 ? (
              <p className="text-xs text-white/50">No released songs yet.</p>
            ) : (
              <div className="space-y-1">
                {popularSongs.map((song, index) => {
                  const parentRelease = releasedReleases.find(r => r.tracklist?.includes(song.id));
                  return (
                    <div key={song.id} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-white/[0.04] transition-colors min-h-[48px]">
                      <span className="w-5 text-center text-sm text-white/40">{index + 1}</span>
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-white/5">
                        {(song.cover_artwork_url || parentRelease?.cover_artwork_url) ? (
                          <img src={song.cover_artwork_url || parentRelease?.cover_artwork_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-white/30">♪</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{song.title || song.name}</p>
                        <p className="text-xs text-white/40 truncate">{profile?.artist_name}</p>
                      </div>
                      <span className="text-xs text-white/40 tabular-nums">{formatStreams(songPlatformStreams[song.id] || song.streams || songStreamEstimates[song.id] || 0)}</span>
                      <button className="h-8 w-8 flex items-center justify-center text-white/30 hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Featured Release (Artist Pick) ── */}
          <FeaturedTrackSection 
            releases={releasedReleases} 
            profile={profile} 
            currentFeaturedId={profile?.featured_release_id}
            onFeatureChange={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
            accentColor="emerald"
          />

          {/* ── Popular Releases (horizontal scroll) ── */}
          <section>
            <div className="flex items-center justify-between px-4 mb-3">
              <h2 className="text-base font-bold">Popular Releases</h2>
            </div>
            {releasedReleases.length === 0 ? (
              <p className="px-4 text-xs text-white/50">No releases yet.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                {releasedReleases.slice(0, 8).map((release) => (
                  <button
                    key={release.id}
                    onClick={() => setEngagementRelease(engagementRelease?.id === release.id ? null : release)}
                    className="flex-shrink-0 w-[120px] text-left"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-md bg-white/5 mb-2">
                      {release.cover_artwork_url ? (
                        <img src={release.cover_artwork_url} alt={release.release_name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-white/30">No Art</div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{release.release_name}</p>
                    <p className="text-[10px] text-white/40">{release.project_type || "Release"} • {new Date(release.release_date || release.created_date).getFullYear()}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Engagement Panel (collapsible) ── */}
          {engagementRelease && (
            <section className="mx-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">{engagementRelease.release_name}</h3>
                </div>
                <button onClick={() => setEngagementRelease(null)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
              <FanEngagementPanel
                release={engagementRelease}
                hype={profile?.hype || 50}
                followers={profile?.followers || 1000}
                platformTheme="emerald"
              />
            </section>
          )}

          {/* ── Discography ── */}
          <DiscographySection releases={releasedReleases} accentColor="emerald" />

          {/* ── Fans Also Like ── */}
          <FansAlsoLikeSection
            artistId={profile?.id}
            genre={profile?.genre}
            region={profile?.region}
            onSelectArtist={onSelectArtist}
          />

          {/* ── About ── */}
          <section className="mx-4 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#1a1f3a]/95 to-[#0f1228]/95 p-4 shadow-lg shadow-blue-500/10 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">About</h2>
              <button onClick={() => setShowProfileEditor(true)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-blue-400" title="Edit profile">
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white/5">
                {profile?.soundburst_profile_image || profile?.artist_image ? (
                  <img src={profile?.soundburst_profile_image || profile?.artist_image} alt={profile.artist_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/30">IMG</div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs leading-relaxed text-white/60">
                  {profile?.soundburst_bio || profile?.about_text || profile?.bio ||
                    `${profile?.artist_name || "This artist"} brings raw ${profile?.genre || "underground"} ` +
                    `energy from ${profile?.region || "the scene"}. Known for grassroots builds, ` +
                    "vault cuts, and street-level authenticity."}
                </p>
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div className="rounded-xl border border-blue-500/20 bg-white/[0.05] p-3">
                    <p className="text-[10px] text-white/40">Underground rank</p>
                    <p className="mt-0.5 text-lg font-bold text-white">#{undergroundRank || profile?.global_rank || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-white/[0.05] p-3">
                    <p className="text-[10px] text-white/40">Monthly listeners</p>
                    <p className="mt-0.5 text-lg font-bold text-white">{monthlyListeners.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Profile Editor Modal ── */}
          <PlatformProfileEditor
            profile={profile}
            platform="Soundburst"
            onSave={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
            accentColor="emerald"
            isOpen={showProfileEditor}
            onClose={() => setShowProfileEditor(false)}
          />
        </div>
      ) : (
        <div className="px-4 pb-8 pt-5">
          <ArtistEventsTab artistId={profile?.id} events={events} platformAccent="emerald" />
        </div>
      )}
    </div>
  );
}