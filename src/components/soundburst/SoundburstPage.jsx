import React from "react";
import SoundburstPlaylistRails from "./SoundburstPlaylistRails";
import SoundburstTopArtists from "./SoundburstTopArtists";
import SoundburstFreshMusic from "./SoundburstFreshMusic";
import EventsNearYouHero from "./EventsNearYouHero";
import SoundburstRadioRail from "./SoundburstRadioRail";

export const getSoundburstPlaylistSections = ({ undergroundPlaylists = [], scenePlaylists = [] } = {}) => [
  {
    title: "Underground Radar",
    playlists: undergroundPlaylists,
  },
  {
    title: "Scene Reports",
    playlists: scenePlaylists,
  },
].filter((section) => Array.isArray(section.playlists) && section.playlists.length > 0);

export default function SoundburstPage({
  topArtists,
  undergroundPlaylists,
  scenePlaylists,
  freshReleases,
  radioShows = [],
  currentRegion,
  onSelectArtist,
  onPlaylistClick,
  onReleaseClick,
  onCitySelect,
  onViewEvents,
}) {
  const playlistSections = getSoundburstPlaylistSections({ undergroundPlaylists, scenePlaylists });

  return (
    <div className="space-y-6 pb-4">
      <div className="px-4 pt-2">
        <h1 className="text-white text-2xl font-bold">Soundburst</h1>
        <p className="text-white/40 text-xs mt-0.5">Underground discovery. Zero filters.</p>
      </div>

      <EventsNearYouHero
        currentRegion={currentRegion}
        onCitySelect={onCitySelect}
        onViewEvents={onViewEvents}
      />
      <SoundburstTopArtists artists={topArtists} onSelectArtist={onSelectArtist} />
      <SoundburstFreshMusic releases={freshReleases} onReleaseClick={onReleaseClick} />
      <SoundburstRadioRail shows={radioShows} onShowClick={onPlaylistClick} />
      {playlistSections.map((section) => (
        <SoundburstPlaylistRails
          key={section.title}
          title={section.title}
          playlists={section.playlists}
          onPlaylistClick={onPlaylistClick}
        />
      ))}
    </div>
  );
}
