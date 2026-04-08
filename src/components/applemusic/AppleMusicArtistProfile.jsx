import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Headphones, Heart, Share2 } from "lucide-react";
import { motion } from "framer-motion";

export default function AppleMusicArtistProfile({ artistId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!artistId || artistId === "undefined" || artistId === "null") return;
    loadData();
  }, [artistId]);

  const loadData = async () => {
    if (!artistId || artistId === "undefined" || artistId === "null") return;
    try {
      setLoading(true);
      const profiles = await base44.entities.ArtistProfile.filter({ id: artistId });
      setProfile(profiles[0] || null);

      if (profiles[0]) {
        const rels = await base44.entities.Release.filter(
          { artist_id: profiles[0].id },
          "-created_date"
        );
        setReleases(rels || []);
      }
    } catch (error) {
      console.error("Failed to load artist:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 text-sm">Artist not found</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#0a0a0f] overflow-y-auto"
    >
      <button
        onClick={onClose}
        className="sticky top-0 z-20 left-4 top-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>

      <div className="px-4 py-6 space-y-6">
        {/* Header Image */}
        <div className="relative h-48 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 to-orange-600/20" />
          {profile.artist_image && (
            <img
              src={profile.artist_image}
              alt={profile.artist_name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-white mb-2">{profile.artist_name}</h1>
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Headphones className="w-4 h-4" />
              <span>{(profile.followers || 0).toLocaleString()} followers</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="flex-1 bg-red-600 hover:bg-red-700 rounded-full py-3 text-white font-semibold transition-colors">
            Play All
          </button>
          <button
            onClick={() => setLiked(!liked)}
            className={`p-3 rounded-full transition-colors ${
              liked
                ? "bg-red-600/20 text-red-400"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            <Heart className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
          </button>
          <button className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* Info */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
              <p className="text-white/50 text-xs">Genre</p>
              <p className="text-white font-semibold text-sm mt-1">{profile.genre}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
              <p className="text-white/50 text-xs">Region</p>
              <p className="text-white font-semibold text-sm mt-1">{profile.region}</p>
            </div>
          </div>
        </div>

        {/* Latest Releases */}
        <section className="space-y-3">
          <h2 className="text-white font-semibold">Latest Releases</h2>
          {releases.length === 0 ? (
            <p className="text-white/50 text-sm">No releases yet.</p>
          ) : (
            <div className="space-y-2">
              {releases.slice(0, 5).map(release => (
                <div
                  key={release.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                >
                  <div className="h-12 w-12 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden">
                    {release.cover_artwork_url && (
                      <img
                        src={release.cover_artwork_url}
                        alt={release.release_name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {release.release_name}
                    </p>
                    <p className="text-white/50 text-xs">
                      {release.lifetime_streams?.toLocaleString() || 0} streams
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}