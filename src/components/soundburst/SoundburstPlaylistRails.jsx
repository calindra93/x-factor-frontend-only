import React from "react";

const getDaysSinceUpdate = (updateDay) => {
  if (updateDay === 0) return "Updated today";
  const today = new Date().getDay();
  const daysSince = (today - updateDay + 7) % 7;
  if (daysSince === 0) return "Updated today";
  if (daysSince === 1) return "Updated yesterday";
  return `Updated ${daysSince} days ago`;
};

// Per-playlist visual identity: gradient background + font personality
// bg: CSS linear-gradient string (shown when no cover art)
// font: Tailwind class string for the name overlay
// scrim: intensity of the bottom gradient scrim
const PLAYLIST_IDENTITY = {
  // ── Party / Hype ────────────────────────────────────────────────────────────
  "Party Hits": {
    bg: "linear-gradient(135deg, #92400e 0%, #c2410c 45%, #0a0a0f 100%)",
    font: "text-[17px] font-black tracking-tighter leading-[1.1]",
  },
  "Dance Party": {
    bg: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #0a0010 100%)",
    font: "text-[17px] font-black tracking-tight leading-[1.1]",
  },
  "Pop Party": {
    bg: "linear-gradient(135deg, #831843 0%, #db2777 50%, #0a0010 100%)",
    font: "text-[16px] font-black tracking-tight leading-[1.1]",
  },
  "Get Turnt": {
    bg: "linear-gradient(135deg, #134e4a 0%, #0f766e 50%, #0a0a0f 100%)",
    font: "text-[13px] font-black uppercase tracking-[0.12em] leading-tight",
  },
  "Reggaeton": {
    bg: "linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #0a0010 100%)",
    font: "text-[16px] font-black italic tracking-tight leading-[1.1]",
  },

  // ── Underground ──────────────────────────────────────────────────────────────
  "Underground Radar": {
    bg: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #0a0a0f 100%)",
    font: "text-sm font-black leading-tight",
  },
  "Street Rotation": {
    bg: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0a0a0f 100%)",
    font: "text-sm font-bold tracking-tight leading-tight",
  },
  "Cloud Surfing": {
    bg: "linear-gradient(135deg, #164e63 0%, #0e7490 55%, #0a0a0f 100%)",
    font: "text-sm font-bold italic leading-tight",
  },
  "Plugged In Underground": {
    bg: "linear-gradient(135deg, #1c1917 0%, #44403c 60%, #0a0a0f 100%)",
    font: "text-[11px] font-black uppercase tracking-[0.1em] leading-tight",
  },
  "Night Market": {
    bg: "linear-gradient(135deg, #431407 0%, #9a3412 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Diaspora Nights": {
    bg: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Digital Perreo": {
    bg: "linear-gradient(135deg, #500724 0%, #9d174d 55%, #0a0a0f 100%)",
    font: "text-sm font-black italic leading-tight",
  },
  "Basement Tapes": {
    bg: "linear-gradient(135deg, #292524 0%, #57534e 60%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Indie Pulse": {
    bg: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Lo-Fi Sessions": {
    bg: "linear-gradient(135deg, #1c1917 0%, #3f3f46 60%, #0a0a0f 100%)",
    font: "text-sm font-light italic leading-tight",
  },
  "Velvet Hours": {
    bg: "linear-gradient(135deg, #3b0764 0%, #6d28d9 55%, #0a0a0f 100%)",
    font: "text-sm font-bold italic leading-tight",
  },
  "Neon Afterglow": {
    bg: "linear-gradient(135deg, #0c4a6e 0%, #0284c7 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Warehouse Static": {
    bg: "linear-gradient(135deg, #09090b 0%, #27272a 60%, #0a0a0f 100%)",
    font: "text-[11px] font-black uppercase tracking-[0.14em] leading-tight",
  },
  "404 Dreams": {
    bg: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Tokyo After Dark": {
    bg: "linear-gradient(135deg, #500724 0%, #be185d 50%, #0a0a0f 100%)",
    font: "text-sm font-black leading-tight",
  },
  "Heavy Rotation": {
    bg: "linear-gradient(135deg, #0c0a09 0%, #292524 60%, #0a0a0f 100%)",
    font: "text-sm font-black uppercase tracking-tight leading-tight",
  },
  "Roots & Heritage": {
    bg: "linear-gradient(135deg, #292524 0%, #78350f 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Heartland Static": {
    bg: "linear-gradient(135deg, #1c0a00 0%, #713f12 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "City Streets": {
    bg: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 55%, #0a0a0f 100%)",
    font: "text-sm font-black tracking-tight leading-tight",
  },

  // ── Scene Reports ────────────────────────────────────────────────────────────
  "Regional Heat": {
    bg: "linear-gradient(135deg, #365314 0%, #4d7c0f 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Collective Cuts": {
    bg: "linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Open Mic Selects": {
    bg: "linear-gradient(135deg, #292524 0%, #44403c 60%, #0a0a0f 100%)",
    font: "text-sm font-light italic leading-tight",
  },
  "Warehouse Sounds": {
    bg: "linear-gradient(135deg, #09090b 0%, #3f3f46 60%, #0a0a0f 100%)",
    font: "text-[11px] font-black uppercase tracking-[0.13em] leading-tight",
  },
  "Tape Swap": {
    bg: "linear-gradient(135deg, #292524 0%, #78350f 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Electronic Underground": {
    bg: "linear-gradient(135deg, #020617 0%, #1e3a5f 60%, #0a0a0f 100%)",
    font: "text-[11px] font-black uppercase tracking-[0.13em] leading-tight",
  },
  "Cipher Sessions": {
    bg: "linear-gradient(135deg, #0c0a09 0%, #1c1917 65%, #0a0a0f 100%)",
    font: "text-sm font-black tracking-tight leading-tight",
  },
  "Bedroom Frequencies": {
    bg: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #0a0a0f 100%)",
    font: "text-sm font-light italic leading-tight",
  },
  "Subway Serenades": {
    bg: "linear-gradient(135deg, #1c1917 0%, #292524 65%, #0a0a0f 100%)",
    font: "text-sm font-bold italic leading-tight",
  },
  "Velvet Algorithms": {
    bg: "linear-gradient(135deg, #500724 0%, #831843 55%, #0a0a0f 100%)",
    font: "text-sm font-bold italic leading-tight",
  },
  "Neon Lovers Club": {
    bg: "linear-gradient(135deg, #500724 0%, #db2777 50%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Diaspora Bounce": {
    bg: "linear-gradient(135deg, #14532d 0%, #15803d 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Electric Daydreams": {
    bg: "linear-gradient(135deg, #0c4a6e 0%, #7c3aed 50%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Heartbreak Hotline": {
    bg: "linear-gradient(135deg, #831843 0%, #9f1239 55%, #0a0a0f 100%)",
    font: "text-sm font-bold italic leading-tight",
  },
  "Sunday Soul": {
    bg: "linear-gradient(135deg, #431407 0%, #9a3412 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Tokyo Seoul Express": {
    bg: "linear-gradient(135deg, #500724 0%, #be185d 50%, #0a0a0f 100%)",
    font: "text-sm font-black leading-tight",
  },
  "Americana Underground": {
    bg: "linear-gradient(135deg, #292524 0%, #78350f 55%, #0a0a0f 100%)",
    font: "text-sm font-bold leading-tight",
  },
  "Mosh Pit Radio": {
    bg: "linear-gradient(135deg, #0c0a09 0%, #1c1917 65%, #0a0a0f 100%)",
    font: "text-sm font-black uppercase tracking-tight leading-tight",
  },
  "Latin Underground": {
    bg: "linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #0a0a0f 100%)",
    font: "text-sm font-black italic leading-tight",
  },
};

// Fallback palette for any playlist not in the identity map
const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #0a0a0f 100%)",
  "linear-gradient(135deg, #0c4a6e 0%, #0284c7 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #500724 0%, #9d174d 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #1c1917 0%, #44403c 60%, #0a0a0f 100%)",
];

const hashName = (str) =>
  [...str].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);

const getPlaylistIdentity = (name) => {
  if (PLAYLIST_IDENTITY[name]) return PLAYLIST_IDENTITY[name];
  const idx = Math.abs(hashName(name)) % FALLBACK_GRADIENTS.length;
  return { bg: FALLBACK_GRADIENTS[idx], font: "text-sm font-bold leading-tight" };
};

export default function SoundburstPlaylistRails({ playlists, title, onPlaylistClick }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between px-4 pt-2">
        <h2 className="text-white text-lg font-bold">{title || "Playlists"}</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-2 px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {playlists.map((playlist) => {
          const identity = getPlaylistIdentity(playlist.name);
          return (
            <button
              key={playlist.name}
              onClick={() => onPlaylistClick?.(playlist)}
              className="group flex-shrink-0 w-[140px] text-left"
            >
              <div className="relative aspect-square w-full rounded-md overflow-hidden mb-2">
                {/* Background: cover art if available, else branded gradient */}
                {playlist.cover ? (
                  <img
                    src={playlist.cover}
                    alt={playlist.name}
                    className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="absolute inset-0 transition duration-300 group-hover:scale-105"
                    style={{ background: identity.bg }}
                  />
                )}

                {/* Gradient scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

                {/* Playlist name — font personality applied per playlist */}
                <p className={`absolute bottom-2 left-2.5 right-2 text-white drop-shadow-md line-clamp-2 ${identity.font}`}>
                  {playlist.name}
                </p>
              </div>

              <p className="text-white/40 text-[10px] leading-tight">
                {getDaysSinceUpdate(playlist.updateDay)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
