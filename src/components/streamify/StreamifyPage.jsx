import React from "react";
import PlaylistRails from "./PlaylistRails";
import TopArtists from "./TopArtists";
import FreshNewMusic from "./FreshNewMusic";
import { ArrowLeft } from "lucide-react";

const DISCOVERY_PLAYLISTS = [
  {
    name: "New Music Friday",
    saves: "8.2M",
    cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  },
  {
    name: "Fresh Finds",
    saves: "3.1M",
    cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80",
    updateDay: 3 // Wednesday
  },
  {
    name: "On The Rise",
    saves: "6.4M",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "Discover Weekly",
    saves: "5.8M",
    cover: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "Release Radar",
    saves: "4.2M",
    cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  },
  {
    name: "RADAR",
    saves: "2.9M",
    cover: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=300&q=80",
    updateDay: 2 // Tuesday
  },
  {
    name: "Most Necessary",
    saves: "1.8M",
    cover: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=300&q=80",
    updateDay: 4 // Thursday
  },
  {
    name: "Pop Rising",
    saves: "3.6M",
    cover: "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=300&q=80",
    updateDay: 3 // Wednesday
  },
  {
    name: "Alt Now",
    saves: "2.4M",
    cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=300&q=80",
    updateDay: 2 // Tuesday
  }
];

const EDITORIAL_PLAYLISTS = [
  {
    name: "Today's Top Hits",
    saves: "32.1M",
    cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=300&q=80",
    updateDay: 0 // Daily
  },
  {
    name: "RapCaviar",
    saves: "15.8M",
    cover: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  },
  {
    name: "Rock This",
    saves: "12.3M",
    cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=300&q=80",
    updateDay: 2 // Tuesday
  },
  {
    name: "Chill Hits",
    saves: "18.2M",
    cover: "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "Hot Country",
    saves: "9.7M",
    cover: "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  },
  {
    name: "Viva Latino",
    saves: "14.6M",
    cover: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80",
    updateDay: 4 // Thursday
  },
  {
    name: "R&B Now",
    saves: "11.2M",
    cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=300&q=80",
    updateDay: 3 // Wednesday
  },
  {
    name: "Are & Be",
    saves: "7.4M",
    cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "Pollen",
    saves: "10.1M",
    cover: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=300&q=80",
    updateDay: 2 // Tuesday
  },
  {
    name: "mint",
    saves: "6.8M",
    cover: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "All New Rock",
    saves: "8.9M",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  },
  {
    name: "Dance Rising",
    saves: "13.4M",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80",
    updateDay: 4 // Thursday
  },
  {
    name: "Beast Mode",
    saves: "5.6M",
    cover: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=300&q=80",
    updateDay: 1 // Monday
  },
  {
    name: "Peaceful Piano",
    saves: "9.2M",
    cover: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=300&q=80",
    updateDay: 0 // Daily
  },
  {
    name: "Jazz Vibes",
    saves: "4.7M",
    cover: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?auto=format&fit=crop&w=300&q=80",
    updateDay: 3 // Wednesday
  },
  {
    name: "Feelin' Myself",
    saves: "7.9M",
    cover: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80",
    updateDay: 5 // Friday
  }
];

export default function StreamifyPage({
  playlists,
  topArtists,
  discoveryPlaylists,
  editorialPlaylists,
  freshReleases,
  onSelectArtist,
  onPlaylistClick,
  onReleaseClick,
  onBack = undefined
}) {
  return (
    <div className="space-y-6 pb-4">
      {onBack && (
        <div className="sticky top-0 z-20 px-4 pt-4 pb-2 bg-[#0a0a0f]">
          <button onClick={onBack} className="text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="px-4 pt-2">
        <h1 className="text-white text-2xl font-bold">Streamify</h1>
        <p className="text-white/40 text-xs mt-0.5">Your curated feed of artists and playlists</p>
      </div>

      <TopArtists artists={topArtists} onSelectArtist={onSelectArtist} />
      <FreshNewMusic releases={freshReleases} onReleaseClick={onReleaseClick} />
      <PlaylistRails
        title="Discover Something New"
        playlists={discoveryPlaylists?.length > 0 ? discoveryPlaylists : DISCOVERY_PLAYLISTS}
        onPlaylistClick={onPlaylistClick}
      />
      <PlaylistRails
        title="Editorial Playlists"
        playlists={editorialPlaylists?.length > 0 ? editorialPlaylists : EDITORIAL_PLAYLISTS}
        onPlaylistClick={onPlaylistClick}
      />
    </div>
  );
}
