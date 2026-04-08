import React from "react";
import PlaylistRails from "./PlaylistRails";
import TopArtists from "./TopArtists";
import AppleCoreFreshMusic from "./AppleCoreFreshMusic";
import AppleCoreCurators from "./AppleCoreCurators";

const EDITORIAL_PLAYLISTS = [
  { name: "New Music Daily", saves: "28.4M", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=300&q=80", updateDay: 0 },
  { name: "A-List Pop", saves: "14.2M", cover: "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=300&q=80", updateDay: 5 },
  { name: "The New Nashville", saves: "8.7M", cover: "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?auto=format&fit=crop&w=300&q=80", updateDay: 5 },
  { name: "ALT CTRL", saves: "6.1M", cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=300&q=80", updateDay: 2 },
  { name: "Rap Life", saves: "12.8M", cover: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=300&q=80", updateDay: 5 },
  { name: "R&B Now", saves: "10.3M", cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80", updateDay: 3 },
  { name: "Today's Chill", saves: "18.9M", cover: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=300&q=80", updateDay: 0 },
  { name: "Africa Rising", saves: "4.5M", cover: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80", updateDay: 4 },
  { name: "Indie Spotlight", saves: "7.2M", cover: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=300&q=80", updateDay: 1 },
];

const CURATED_SESSIONS = [
  { name: "Spatial Audio Sessions", saves: "9.8M", cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=300&q=80", updateDay: 1 },
  { name: "Acoustic Evenings", saves: "5.6M", cover: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=300&q=80", updateDay: 3 },
  { name: "Songwriter's Circle", saves: "4.3M", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80", updateDay: 2 },
  { name: "Hi-Res Essentials", saves: "11.1M", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80", updateDay: 0 },
  { name: "Behind the Boards", saves: "3.9M", cover: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=300&q=80", updateDay: 4 },
  { name: "Lossless Deep Cuts", saves: "6.7M", cover: "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=300&q=80", updateDay: 1 },
  { name: "Studio Quality", saves: "8.4M", cover: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=300&q=80", updateDay: 5 },
  { name: "Liner Notes Live", saves: "2.8M", cover: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80", updateDay: 2 },
];

export default function ApplecorePage({
  playlists,
  topArtists,
  editorialPlaylists,
  curatedPlaylists,
  freshReleases,
  playerProfile,
  playerReleases,
  onSelectArtist,
  onPlaylistClick,
  onReleaseClick,
}) {
  return (
    <div className="space-y-6 pb-4">
      <div className="px-4 pt-2">
        <h1 className="text-white text-2xl font-bold">AppleCore</h1>
        <p className="text-white/40 text-xs mt-0.5">Editorial-first. Premium listening.</p>
      </div>

      <TopArtists artists={topArtists} onSelectArtist={onSelectArtist} />
      <AppleCoreFreshMusic releases={freshReleases} onReleaseClick={onReleaseClick} />
      <PlaylistRails
        title="Editor's Picks"
        playlists={editorialPlaylists?.length > 0 ? editorialPlaylists : EDITORIAL_PLAYLISTS}
        onPlaylistClick={onPlaylistClick}
      />
      <PlaylistRails
        title="Curated Sessions"
        playlists={curatedPlaylists?.length > 0 ? curatedPlaylists : CURATED_SESSIONS}
        onPlaylistClick={onPlaylistClick}
      />
      {playerProfile && <AppleCoreCurators playerProfile={playerProfile} playerReleases={playerReleases} />}
    </div>
  );
}
