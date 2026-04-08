import { getVisibleReleasedReleases } from "@/lib/releaseVisibility";
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft,
  CalendarDays,
  Headphones,
  Heart,
  Home,
  Library,
  Music2,
  Search,
  Sparkles,
} from "lucide-react";
import EventsUpcomingProjects from "../events/EventsUpcomingProjects";
import ArtistsPickCard from "../events/ArtistsPickCard";
import { ARTISTS_PICK, UPCOMING_PROJECTS } from "../events/eventsData";
import { getStoredUserAccountId } from "@/lib/custom-auth";

const RELEASE_FILTERS = ["Albums", "Singles & EPs", "Compilations", "Hot Releases"];

const filterReleases = (releases, filter) => {
  if (!filter) return releases;

  switch (filter) {
    case "Albums":
      return releases.filter((release) => release.project_type === "Album");
    case "Singles & EPs":
      return releases.filter((release) => ["Single", "EP"].includes(release.project_type));
    case "Compilations":
      return releases.filter((release) =>
        ["Compilation", "Mixtape", "Demo"].includes(release.project_type)
      );
    case "Hot Releases":
      return releases.filter((release) => release.lifecycle_state === "Hot");
    default:
      return releases;
  }
};

export default function ArtistProfile({ onBack }) {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [songs, setSongs] = useState([]);
  const [releases, setReleases] = useState([]);
  const [activeTab, setActiveTab] = useState("music");
  const [showAll, setShowAll] = useState(false);
  const [releaseFilter, setReleaseFilter] = useState("Albums");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const userAccountId = getStoredUserAccountId();
      if (!userAccountId) {
        setProfile(null);
        setProjects([]);
        setSongs([]);
        setReleases([]);
        setLoading(false);
        return;
      }

      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const activeProfile = profiles[0];
      setProfile(activeProfile);

      if (!activeProfile) {
        setProjects([]);
        setSongs([]);
        setReleases([]);
        setLoading(false);
        return;
      }

      const [allProjects, allSongs, allReleases] = await Promise.all([
        base44.entities.Project.filter({ artist_id: activeProfile.id }, "-created_date"),
        base44.entities.Song.filter({ artist_id: activeProfile.id }, "-created_date"),
        base44.entities.Release.filter({ artist_id: activeProfile.id }, "-release_date"),
      ]);

      setProjects(allProjects);
      setSongs(allSongs);
      setReleases(allReleases);
      setLoading(false);
    };

    loadData();
  }, []);

  const releasedProjects = useMemo(
    () => projects.filter((project) => project.project_status === "released"),
    [projects]
  );

  const releasedProjectIds = useMemo(
    () => new Set(releasedProjects.map((project) => project.id)),
    [releasedProjects]
  );

  const releasedReleases = useMemo(() => {
    const catalog = getVisibleReleasedReleases(releases);
    return catalog
      .filter((release) => releasedProjectIds.has(release.project_id))
      .sort((a, b) => new Date(b.release_date || 0) - new Date(a.release_date || 0));
  }, [releases, releasedProjectIds]);

  const latestReleases = releasedReleases.slice(0, 4);

  const releasedTrackIds = useMemo(() => {
    const trackIds = releasedProjects.flatMap((project) => project.tracklist || []);
    return new Set(trackIds);
  }, [releasedProjects]);

  const popularSongs = useMemo(() => {
    const baseSongs = songs.filter((song) => releasedTrackIds.has(song.id));
    const filteredSongs = baseSongs.filter((song) => {
      if (Object.prototype.hasOwnProperty.call(song, "release_status")) {
        return song.release_status === "released";
      }
      return true;
    });

    return [...filteredSongs]
      .sort((a, b) => (b.popularity || b.streams || b.quality || 0) - (a.popularity || a.streams || a.quality || 0))
      .slice(0, 5);
  }, [songs, releasedTrackIds]);

  const totalStreams = releasedReleases.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0);
  const monthlyListeners = profile?.monthly_listeners || 0;

  const filteredReleases = useMemo(
    () => filterReleases(releasedReleases, releaseFilter),
    [releasedReleases, releaseFilter]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
      </div>
    );
  }

  return (
    <div className="relative pb-28 text-white">
      <div className="relative">
        <div className="h-44 w-full overflow-hidden rounded-b-[32px] bg-gradient-to-br from-blue-600/40 via-cyan-500/20 to-transparent">
          {profile?.artist_image ? (
            <img
              src={profile.artist_image}
              alt={profile.artist_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl font-semibold text-white/60">
              {profile?.artist_name || "Artist"}
            </div>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-[#0a0a0f]" />
        <div className="absolute left-4 top-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-black/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Career
          </button>
        </div>
        <div className="absolute bottom-4 left-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Streamify</p>
          <h1 className="text-2xl font-semibold text-white">{profile?.artist_name || "Artist"}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
            <Headphones className="h-3.5 w-3.5 text-blue-300" />
            {monthlyListeners.toLocaleString()} monthly listeners
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="mt-5 flex gap-2 rounded-full bg-white/5 p-1 text-xs font-medium text-white/70">
          <button
            onClick={() => setActiveTab("music")}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${
              activeTab === "music" ? "bg-white/15 text-white" : "hover:bg-white/10"
            }`}
          >
            Music
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${
              activeTab === "events" ? "bg-white/15 text-white" : "hover:bg-white/10"
            }`}
          >
            Events
          </button>
        </div>
      </div>

      {activeTab === "music" ? (
        <div className="space-y-6 px-4 pb-6 pt-5">
          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Popular</h2>
              <button className="text-[11px] text-blue-200/80 hover:text-blue-100">See all</button>
            </div>
            {popularSongs.length === 0 ? (
              <p className="text-xs text-white/50">No released songs yet.</p>
            ) : (
              <div className="space-y-3">
                {popularSongs.map((song, index) => (
                  <div key={song.id} className="flex items-center gap-3">
                    <div className="text-xs text-white/50">{index + 1}</div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-white">{song.title || song.name}</p>
                      <p className="text-[11px] text-white/50">
                        {song.genre || profile?.genre || "Alt pop"}
                      </p>
                    </div>
                    <div className="text-[11px] text-white/40">
                      {(song.streams || song.quality || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Artist Pick</h2>
              <Sparkles className="h-4 w-4 text-blue-200/70" />
            </div>
            <ArtistsPickCard pick={ARTISTS_PICK} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Releases</h2>
            </div>
            {latestReleases.length === 0 ? (
              <p className="text-xs text-white/50">No releases yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {latestReleases.map((release) => (
                  <div
                    key={release.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="h-24 w-full overflow-hidden rounded-xl bg-white/5">
                      {release.cover_artwork_url ? (
                        <img
                          src={release.cover_artwork_url}
                          alt={release.release_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-white/40">
                          No artwork
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-semibold">{release.release_name}</p>
                    <p className="text-[10px] text-white/50">{release.project_type || "Release"}</p>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
                      <CalendarDays className="h-3 w-3" />
                      {release.release_date || "Out now"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-sm font-semibold">About</h2>
            <div className="flex items-start gap-3">
              <div className="h-16 w-16 overflow-hidden rounded-xl bg-white/5">
                {profile?.artist_image ? (
                  <img
                    src={profile.artist_image}
                    alt={profile.artist_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/40">
                    Image
                  </div>
                )}
              </div>
              <div className="flex-1 text-xs text-white/70">
                {profile?.artist_name || "This artist"} blends {profile?.genre || "alt pop"} with
                cinematic textures. Based in {profile?.region || "your region"}, their latest era
                focuses on late-night synths, crisp hooks, and high replay value.
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white/50">Spotify ranking</p>
                <p className="mt-1 text-sm font-semibold text-white">#{profile?.clout || 124}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white/50">Fans love</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-white">
                  <Heart className="h-3.5 w-3.5 text-pink-400" />
                  {profile?.followers?.toLocaleString() || "0"} saves
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6 px-4 pb-8 pt-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-blue-200/70" />
              Upcoming Events
            </div>
            <p className="mt-1 text-xs text-white/60">
              Tour drops, premiere dates, and Streamify sessions scheduled for the next quarter.
            </p>
          </div>
          <EventsUpcomingProjects projects={UPCOMING_PROJECTS} />
        </div>
      )}

      {showAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111118] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Show All</p>
                <h3 className="text-lg font-semibold">Releases</h3>
              </div>
              <button
                onClick={() => setShowAll(false)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/60">
              {RELEASE_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setReleaseFilter(filter)}
                  className={`rounded-full border px-3 py-1 transition ${
                    releaseFilter === filter
                      ? "border-blue-400/70 bg-blue-500/20 text-white"
                      : "border-white/10 hover:bg-white/10"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {filteredReleases.length === 0 ? (
                <p className="text-xs text-white/50">No releases match this filter.</p>
              ) : (
                filteredReleases.map((release) => (
                  <div
                    key={release.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-white/5">
                      {release.cover_artwork_url ? (
                        <img
                          src={release.cover_artwork_url}
                          alt={release.release_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-white/40">
                          Art
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-white">{release.release_name}</p>
                      <p className="text-[10px] text-white/50">
                        {release.project_type || "Release"} • {release.release_date || "Out now"}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/60">
                      {release.lifecycle_state || "Live"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0f0f16]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-around px-4 py-2 text-[10px] text-white/70">
          <button className="flex flex-col items-center gap-1 text-white">
            <Home className="h-4 w-4" />
            Home
          </button>
          <button className="flex flex-col items-center gap-1">
            <Search className="h-4 w-4" />
            Search
          </button>
          <button className="flex flex-col items-center gap-1">
            <Music2 className="h-4 w-4" />
            Music
          </button>
          <button className="flex flex-col items-center gap-1">
            <Library className="h-4 w-4" />
            Library
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
