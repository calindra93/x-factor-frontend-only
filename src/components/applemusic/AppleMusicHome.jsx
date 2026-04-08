import React from "react";
import { motion } from "framer-motion";
import { Heart, Play, Radio } from "lucide-react";

export default function AppleMusicHome({ profile, fanProfile, artists, onSelectArtist }) {
  const topArtists = artists.slice(0, 8);

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Apple Music</h1>
        <p className="text-white/50 text-sm">Discover music your way</p>
      </div>

      {/* Featured Artist */}
      {topArtists.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-56 rounded-2xl overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-600 to-orange-600" />
          {topArtists[0].artist_image && (
            <img
              src={topArtists[0].artist_image}
              alt={topArtists[0].artist_name}
              className="w-full h-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Featured</p>
            <h2 className="text-2xl font-bold text-white mb-3">{topArtists[0].artist_name}</h2>
            <div className="flex gap-2">
              <button className="flex-1 bg-red-600 hover:bg-red-700 rounded-full py-2 flex items-center justify-center gap-2 text-white font-semibold text-sm transition-colors">
                <Play className="w-4 h-4 fill-white" />
                Play
              </button>
              <button className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
                <Heart className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Top Artists Grid */}
      <section className="space-y-3">
        <h3 className="text-white font-semibold text-sm">Popular Artists</h3>
        <div className="grid grid-cols-2 gap-3">
          {topArtists.slice(0, 6).map((artist, idx) => (
            <motion.button
              key={artist.id}
              onClick={() => onSelectArtist(artist.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative h-32 rounded-xl overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 to-orange-600/20" />
              {artist.artist_image && (
                <img
                  src={artist.artist_image}
                  alt={artist.artist_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <p className="text-white font-semibold text-xs truncate">
                  {artist.artist_name}
                </p>
                <p className="text-white/70 text-[10px]">
                  {artist.genre}
                </p>
              </div>
              <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 rounded-full p-2">
                <Play className="w-3 h-3 fill-white text-white" />
              </button>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Radio Info */}
      <section className="bg-gradient-to-br from-red-600/20 to-orange-600/10 border border-red-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Radio className="w-5 h-5 text-red-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-white font-semibold text-sm mb-1">Apple Music Radio</h3>
            <p className="text-white/70 text-xs">
              Get access to curated radio stations and SiriusXM partnerships.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
