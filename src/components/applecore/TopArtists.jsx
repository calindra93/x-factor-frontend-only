import React from "react";

export default function TopArtists({ artists, onSelectArtist }) {
  const parseNumber = (value) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return 0;
    const normalized = value.replace(/,/g, "").trim().toUpperCase();
    const match = normalized.match(/([\d.]+)\s*([MB])?/);
    if (!match) return 0;
    const amount = parseFloat(match[1]);
    const multiplier = match[2] === "B" ? 1e9 : match[2] === "M" ? 1e6 : 1;
    return amount * multiplier;
  };

  const sortedArtists = [...artists]
    .sort((a, b) => parseNumber(b.monthlyListeners) - parseNumber(a.monthlyListeners))
    .slice(0, 10)
    .map((artist, index) => ({
      ...artist,
      rank: index + 1
    }));

  if (sortedArtists.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="text-white text-lg font-bold">Featured Artists</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
        {sortedArtists.map((artist) => (
          <button key={artist.id || artist.name} type="button" onClick={() => onSelectArtist?.(artist)} className="flex-shrink-0 w-[100px] text-center">
            <div className="w-[100px] h-[100px] mx-auto rounded-full overflow-hidden bg-white/5 mb-2">
              {artist.image ? (
                <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/40">{artist.name?.[0]?.toUpperCase() || "?"}</div>
              )}
            </div>
            <p className="text-white text-xs font-semibold truncate">{artist.name}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
