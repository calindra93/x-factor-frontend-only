import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Music, TrendingUp, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function SoundburstHome({ profile, artists, onSelectArtist }) {
  const [similarArtists, setSimilarArtists] = useState([]);
  const topArtists = artists.slice(0, 6);

  useEffect(() => {
    if (topArtists.length > 0) {
      loadSimilarArtists(topArtists[0]);
    }
  }, [topArtists]);

  const loadSimilarArtists = async (artist) => {
    try {
      const response = await base44.functions.invoke('getSimilarArtists', {
        artist_id: artist.id,
        genre: artist.genre || 'Hip-Hop',
        region: artist.region,
        clout: artist.clout || 100
      });
      setSimilarArtists(response?.similar_artists || response?.data?.similar_artists || []);
    } catch (error) {
      console.error('Failed to load similar artists:', error);
    }
  };

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Soundburst</h1>
        <p className="text-white/50 text-sm">Underground artists in {profile?.region || 'your region'}</p>
      </div>

      {/* Spotlight - Featured Artist */}
      {topArtists.length > 0 && (
        <motion.button
          onClick={() => onSelectArtist(topArtists[0].id)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-56 rounded-2xl overflow-hidden group w-full text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-cyan-600" />
          {topArtists[0].artist_image && (
            <img
              src={topArtists[0].artist_image}
              alt={topArtists[0].artist_name}
              className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-300" />
              <span className="text-blue-300 text-xs uppercase tracking-wider">Rising</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">{topArtists[0].artist_name}</h2>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectArtist(topArtists[0].id);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-full py-2 flex items-center justify-center gap-2 text-white font-semibold text-sm transition-colors"
              >
                <Play className="w-4 h-4 fill-white" />
                Listen
              </button>
            </div>
          </div>
        </motion.button>
      )}

      {/* Underground Artists Grid */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Underground Talents</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {topArtists.slice(0, 4).map((artist, idx) => (
            <motion.button
              key={artist.id}
              onClick={() => onSelectArtist(artist.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative h-32 rounded-xl overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/40 to-cyan-600/20" />
              {artist.artist_image && (
                <img
                  src={artist.artist_image}
                  alt={artist.artist_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <p className="text-white font-semibold text-xs truncate">{artist.artist_name}</p>
                <p className="text-white/70 text-[10px]">{artist.genre}</p>
              </div>
              <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 rounded-full p-2">
                <Play className="w-3 h-3 fill-white text-white" />
              </button>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Similar Artists */}
      {similarArtists.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-white font-semibold text-sm">Similar to {topArtists[0].artist_name}</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {similarArtists.slice(0, 3).map((artist) => (
              <button
                key={artist.artist_name}
                onClick={() => {
                  const matched = artists.find(a => a.artist_name === artist.artist_name);
                  if (matched) onSelectArtist(matched.id);
                }}
                className="flex-shrink-0 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white text-xs font-medium transition-colors"
              >
                {artist.artist_name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}