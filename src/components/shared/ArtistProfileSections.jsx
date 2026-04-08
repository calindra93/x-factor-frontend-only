import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Star } from "lucide-react";
import ArtistPickWizardModal from "@/components/shared/ArtistPickWizardModal";
import {
  buildArtistPickPayload,
  getArtistPickDurationLabel,
  sortArtistPickReleases,
  viewerOwnsArtistPickProfile,
} from "@/lib/artistPickUtils";
import { fmt } from "@/utils/numberFormat";

const DISCOGRAPHY_FILTERS = ["Popular tracks", "Albums", "Singles and EPs", "Compilations"];

const filterByTab = (releases, tab) => {
  switch (tab) {
    case "Albums":
      return releases.filter((r) => r.project_type === "Album");
    case "Singles and EPs":
      return releases.filter((r) => ["Single", "EP"].includes(r.project_type));
    case "Compilations":
      return releases.filter((r) => ["Compilation", "Mixtape", "Demo"].includes(r.project_type));
    case "Popular tracks":
    default:
      // Only show individual tracks (Singles) in Popular tracks, not EPs
      return releases.filter((r) => r.project_type === "Single").sort((a, b) => (b.lifetime_streams || 0) - (a.lifetime_streams || 0));
  }
};


/**
 * Discography section with filter tabs — matches Spotify's layout (Image 2).
 * Shows horizontal scroll of releases filtered by type.
 */
export function DiscographySection({ releases, accentColor = "emerald" }) {
  const [activeFilter, setActiveFilter] = useState("Popular tracks");
  const filtered = useMemo(() => filterByTab(releases, activeFilter), [releases, activeFilter]);

  if (!releases || releases.length === 0) return null;

  const accentBorder = {
    emerald: "border-blue-500/30 bg-gradient-to-br from-[#1a1f3a]/95 to-[#0f1228]/95 text-blue-300 shadow-lg shadow-blue-500/10",
    violet: "border-violet-400/50 bg-violet-500/15 text-white",
    rose: "border-rose-400/50 bg-rose-500/15 text-white",
  }[accentColor] || "border-white/30 bg-white/10 text-white";

  const inactiveFilterClass = accentColor === "emerald"
    ? "border-blue-500/20 bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white"
    : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10";

  return (
    <section>
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-base font-bold text-white">Discography</h2>
        <span className="text-xs text-white/40">{releases.length} releases</span>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: "none" }}>
        {DISCOGRAPHY_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${
              activeFilter === filter
                ? accentBorder
                : inactiveFilterClass
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 text-xs text-white/40">No releases in this category.</p>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto px-4 pb-2"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {filtered.slice(0, 12).map((release) => (
            <div key={release.id} className="flex-shrink-0 w-[130px] text-left">
              <div className="aspect-square w-full overflow-hidden rounded-md bg-white/5 mb-2">
                {release.cover_artwork_url ? (
                  <img
                    src={release.cover_artwork_url}
                    alt={release.release_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/20">
                    No Art
                  </div>
                )}
              </div>
              <p className="text-xs font-semibold text-white truncate">{release.release_name}</p>
              <p className="text-[10px] text-white/40">
                {new Date(release.release_date || release.created_date).getFullYear()} •{" "}
                {release.project_type || "Release"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * "Fans Also Like" section — shows similar artists based on genre/region (Image 3).
 * Loads all artists and finds matches by genre, excluding the current artist.
 */
export function FansAlsoLikeSection({ artistId, genre, region, onSelectArtist = null }) {
  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    if (!artistId) return;
    const load = async () => {
      try {
        const all = await base44.entities.ArtistProfile.list();
        const matches = all
          .filter((a) => a.id !== artistId)
          .map((a) => {
            let score = 0;
            if (genre && a.genre === genre) score += 3;
            if (region && a.region === region) score += 2;
            if (a.followers > 0) score += 1;
            return { ...a, _score: score };
          })
          .filter((a) => a._score > 0)
          .sort((a, b) => b._score - a._score || (b.followers || 0) - (a.followers || 0))
          .slice(0, 10);
        setSimilar(matches);
      } catch (e) {
        console.error("[FansAlsoLike] Load error:", e);
      }
    };
    load();
  }, [artistId, genre, region]);

  if (similar.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-base font-bold text-white">Fans Also Like</h2>
        <span className="text-xs text-white/40">Show all</span>
      </div>
      <div
        className="flex gap-4 overflow-x-auto px-4 pb-2"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {similar.map((artist) => (
          <button
            key={artist.id}
            onClick={() => onSelectArtist?.({ id: artist.id })}
            className="flex-shrink-0 w-[100px] text-center"
          >
            <div className="w-[100px] h-[100px] mx-auto rounded-full overflow-hidden bg-white/5 mb-2">
              {artist.artist_image ? (
                <img
                  src={artist.artist_image}
                  alt={artist.artist_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/30">
                  {artist.artist_name?.[0] || "?"}
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-white truncate">{artist.artist_name}</p>
            <p className="text-[10px] text-white/40">Artist</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Featured Track/Project selection — lets the player choose a release to feature.
 */
export function FeaturedTrackSection({
  releases,
  profile,
  currentFeaturedId,
  onFeatureChange = null,
  accentColor = "emerald",
}) {
  const [showingWizard, setShowingWizard] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [justFeatured, setJustFeatured] = useState(null);
  const sortedReleases = useMemo(() => sortArtistPickReleases(releases), [releases]);
  const viewerAccountId = typeof window !== "undefined" ? window.localStorage?.getItem("user_account_id") : null;
  const isOwner = viewerOwnsArtistPickProfile(profile, viewerAccountId);
  const hasSavedPick = Boolean(currentFeaturedId);

  const featured = hasSavedPick
    ? sortedReleases.find((r) => r.id === currentFeaturedId) || null
    : null;
  const accentBg = {
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
  }[accentColor] || "bg-white/20";

  const handleFeatureSave = async ({ release, message, backgroundImage, duration }) => {
    if (updating || !profile?.id || !isOwner || !release?.id) return;
    setUpdating(true);
    try {
      const payload = buildArtistPickPayload({
        releaseId: release.id,
        message,
        backgroundImage,
        duration,
      });

      await base44.entities.ArtistProfile.update(profile.id, payload);

      setJustFeatured({
        name: release.release_name,
        durationLabel: getArtistPickDurationLabel(payload.artist_pick_duration_turns),
      });
      onFeatureChange?.(payload);
      setShowingWizard(false);

      setTimeout(() => setJustFeatured(null), 4000);
    } catch (e) {
      console.error("[FeaturedTrack] Error:", e);
    } finally {
      setUpdating(false);
    }
  };

  if (!sortedReleases || sortedReleases.length === 0) return null;

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white">Artist Pick</h2>
        </div>
        {isOwner ? (
          <button
            onClick={() => setShowingWizard(true)}
            className="text-xs text-white/60 hover:text-white transition-colors"
            title="Edit artist pick"
            disabled={updating}
          >
            {hasSavedPick ? "Edit pick" : "Save your pick"}
          </button>
        ) : null}
      </div>

      {justFeatured && (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-emerald-400 text-xs font-semibold">
            "{justFeatured.name}" is now featured!
          </p>
          <p className="text-white/50 text-[10px] mt-1">
            {justFeatured.durationLabel === "Indefinite"
              ? "Pinned to the top of the profile until the artist changes it."
              : `Pinned to the top of the profile for ${justFeatured.durationLabel.toLowerCase()}.`}
          </p>
        </div>
      )}

      {featured && (
        <div
          className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-3 mb-3 ${updating ? 'opacity-50' : ''}`}
          style={profile?.artist_pick_background_image ? {
            backgroundImage: `linear-gradient(180deg, rgba(8,8,11,0.32), rgba(8,8,11,0.92)), url(${profile.artist_pick_background_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-white/5">
              {featured.cover_artwork_url ? (
                <img src={featured.cover_artwork_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-white/30">Art</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/50">Artist Pick</p>
              <p className="text-sm font-semibold text-white truncate">{featured.release_name}</p>
              <p className="text-[10px] text-white/40">
                {fmt(featured.lifetime_streams || 0)} streams
              </p>
              {profile?.artist_pick_message ? (
                <p className="mt-1 text-xs text-white/75 line-clamp-2">{profile.artist_pick_message}</p>
              ) : null}
              <p className="mt-1 text-[10px] text-white/45">
                {profile?.artist_pick_duration_turns == null
                  ? "Active indefinitely"
                  : `${getArtistPickDurationLabel(profile.artist_pick_duration_turns)} active window`}
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${accentBg} ${updating ? '' : 'animate-pulse'}`} />
          </div>
        </div>
      )}

      <ArtistPickWizardModal
        open={showingWizard}
        releases={sortedReleases}
        initialReleaseId={currentFeaturedId || null}
        initialMessage={profile?.artist_pick_message || ""}
        initialBackgroundImage={profile?.artist_pick_background_image || ""}
        initialDuration={profile?.artist_pick_duration_turns == null ? "indefinite" : `${profile.artist_pick_duration_turns}d`}
        accentColor={accentColor}
        saving={updating}
        onClose={() => setShowingWizard(false)}
        onSave={handleFeatureSave}
      />
    </section>
  );
}
