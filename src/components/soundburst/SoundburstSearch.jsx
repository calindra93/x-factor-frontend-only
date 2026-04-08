import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { motion } from "framer-motion";

export default function SoundburstSearch({ artists, onSelectArtist }) {
  const [query, setQuery] = useState("");

  const filteredArtists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return artists.slice(0, 20);
    return artists.filter(a =>
      a.artist_name?.toLowerCase().includes(normalized) ||
      a.genre?.toLowerCase().includes(normalized)
    );
  }, [artists, query]);

  return (
    <div className="px-4 py-6 space-y-4">
      {/* Search Bar */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-[#0a0a0f] to-transparent pb-4">
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-3">
          <Search className="w-5 h-5 text-white/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search regional artists..."
            className="flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none text-sm"
          />
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2">
        {filteredArtists.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/50 text-sm">No artists found in your region</p>
          </div>
        ) : (
          filteredArtists.map((artist, idx) => (
            <motion.button
              key={artist.id}
              onClick={() => onSelectArtist(artist.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-left"
            >
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {artist.artist_image ? (
                  <img
                    src={artist.artist_image}
                    alt={artist.artist_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-sm">
                    {artist.artist_name?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {artist.artist_name}
                </p>
                <p className="text-white/50 text-xs">
                  {artist.genre} • {artist.followers?.toLocaleString() || 0} followers
                </p>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}