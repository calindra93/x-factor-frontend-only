import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Share2, Play, Zap, Loader } from "lucide-react";
import { base44 } from "@/api/base44Client";

const DISCOVERY_ARTISTS = [
  {
    id: 1,
    name: "Rae Tempo",
    track: "Midnight Transfer",
    region: "Oakland",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=500&fit=crop",
    listeners: 2400,
    growth: 340,
    tags: ["Breakbeat", "Lo-Fi", "Oakland"],
    vibes: "Late-night warehouse energy with lofi aesthetics"
  },
  {
    id: 2,
    name: "Kora Nox",
    track: "Concrete Bloom",
    region: "Berlin",
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=500&fit=crop",
    listeners: 1890,
    growth: 220,
    tags: ["Drone", "Experimental", "Berlin"],
    vibes: "Hypnotic noise textures & field recordings"
  },
  {
    id: 3,
    name: "June Vandal",
    track: "Streetlight Choir",
    region: "New York",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=500&fit=crop",
    listeners: 3200,
    growth: 520,
    tags: ["Indie Pop", "NYC", "Alternative"],
    vibes: "Urban storytelling with indie sensibility"
  }
];

export default function SoundburstDiscoveryCarousel({ profile }) {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState({});
  const [similarArtists, setSimilarArtists] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const current = DISCOVERY_ARTISTS[index];

  // Load similar artists when current artist changes
  useEffect(() => {
    const loadSimilar = async () => {
      try {
        setLoadingSimilar(true);
        const response = await base44.functions.invoke('getSimilarArtists', {
          artist_id: current.id,
          genre: current.tags[0],
          region: current.region,
          clout: 100 + Math.random() * 500
        });
        setSimilarArtists(response?.similar_artists || response?.data?.similar_artists || []);
      } catch (error) {
        console.error('Failed to load similar artists:', error);
        setSimilarArtists([]);
      } finally {
        setLoadingSimilar(false);
      }
    };

    loadSimilar();
  }, [index]);

  const handleNext = () => {
    setIndex((i) => (i + 1) % DISCOVERY_ARTISTS.length);
  };

  const handlePrev = () => {
    setIndex((i) => (i - 1 + DISCOVERY_ARTISTS.length) % DISCOVERY_ARTISTS.length);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-white text-sm font-bold px-1">Fresh Underground Drops</h2>

      <motion.div
        key={current.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative rounded-2xl overflow-hidden group"
      >
        {/* Background Image */}
        <div className="relative h-[500px]">
          <img
            src={current.image}
            alt={current.name}
            className="w-full h-full object-cover"
          />

          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />
          <div className="absolute inset-0 bg-black/30" />

          {/* Badge */}
          <div className="absolute top-3 right-3 bg-blue-500/80 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-blue-200" />
            <span className="text-xs font-semibold text-blue-100">Rising</span>
          </div>
        </div>

        {/* Content Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-4">
          <div className="space-y-3">
            {/* Artist Info */}
            <div>
              <p className="text-gray-300 text-xs uppercase tracking-wider mb-1">
                {current.region}
              </p>
              <h3 className="text-white text-2xl font-bold">{current.name}</h3>
              <p className="text-gray-300 text-sm">{current.track}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-400">👥</span>
                <span className="text-gray-300">{current.listeners}k listeners</span>
              </div>
              <div className="flex items-center gap-1 text-green-400">
                <span>↑</span>
                <span>+{current.growth}% mo.</span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-3">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-white/10 border border-white/20 rounded-full px-2 py-1 text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Similar Artists */}
            {loadingSimilar ? (
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-3">
                <Loader className="w-3 h-3 animate-spin" />
                <span>Loading similar artists...</span>
              </div>
            ) : similarArtists.length > 0 ? (
              <div className="bg-white/[0.05] rounded-lg p-2 mb-3 border border-white/[0.08]">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide mb-2">Similar Artists</p>
                <div className="flex flex-wrap gap-1">
                  {similarArtists.slice(0, 3).map((artist) => (
                    <span
                      key={artist.artist_name}
                      className="text-[9px] bg-blue-500/20 text-blue-300 rounded px-2 py-1 border border-blue-500/30"
                    >
                      {artist.artist_name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-2 flex items-center justify-center gap-2 text-white text-sm font-semibold transition-colors">
                <Play className="w-4 h-4 fill-white" />
                Listen Now
              </button>
              <button
                onClick={() => setLiked({ ...liked, [current.id]: !liked[current.id] })}
                className={`p-2 rounded-lg transition-colors ${
                  liked[current.id]
                    ? "bg-red-500/20 text-red-400"
                    : "bg-white/10 text-gray-400 hover:bg-white/20"
                }`}
              >
                <Heart className={`w-5 h-5 ${liked[current.id] ? "fill-current" : ""}`} />
              </button>
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-gray-400 transition-colors">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Carousel Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 text-sm transition-colors"
        >
          ← Prev
        </button>
        <div className="flex gap-1.5">
          {DISCOVERY_ARTISTS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === index ? "bg-blue-500 w-6" : "bg-white/20"
              }`}
            />
          ))}
        </div>
        <button
          onClick={handleNext}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 text-sm transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}