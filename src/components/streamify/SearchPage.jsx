import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

export default function SearchPage({ artists, onSelectArtist }) {
  const [query, setQuery] = useState("");

  const filteredArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return artists;
    }
    return artists.filter((artist) => artist.name.toLowerCase().includes(normalized));
  }, [artists, query]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2 text-white/60">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search artists"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      </div>
      <div className="space-y-2">
        {filteredArtists.map((artist) => (
          <button
            key={artist.id || artist.name}
            type="button"
            onClick={() => onSelectArtist(artist)}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <div className="h-10 w-10 overflow-hidden rounded-full bg-white/5 flex items-center justify-center text-xs text-white/60">
              {artist.image ? (
                <img src={artist.image} alt={artist.name} className="h-full w-full object-cover" />
              ) : (
                <span>{artist.name?.[0]?.toUpperCase() || "?"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{artist.name}</p>
              <p className="text-[11px] text-white/50">
                {typeof artist.totalStreams === "number"
                  ? `${artist.totalStreams.toLocaleString()} streams`
                  : artist.totalStreams || "No streams yet"}
              </p>
            </div>
            <span className="text-[11px] text-white/60">
              {typeof artist.monthlyListeners === "number"
                ? `${artist.monthlyListeners.toLocaleString()} monthly`
                : artist.monthlyListeners || "—"}
            </span>
          </button>
        ))}
        {filteredArtists.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-xs text-white/50">
            No artists matched your search.
          </div>
        )}
      </div>
    </section>
  );
}
