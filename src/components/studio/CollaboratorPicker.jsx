import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Users, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const computeMatchScore = (artist, profile) => {
  if (!profile) return 50;
  const genreMatch = artist.genre && artist.genre === profile.genre ? 0.3 : 0.1;
  const cloutDiff = Math.abs((artist.clout || 0) - (profile.clout || 0));
  const followerDiff = Math.abs((artist.followers || 0) - (profile.followers || 0));
  const cloutScore = Math.max(0, 1 - cloutDiff / Math.max(1, profile.clout || 1)) * 0.35;
  const followerScore = Math.max(0, 1 - followerDiff / Math.max(1, profile.followers || 1)) * 0.25;
  return Math.min(100, Math.round((genreMatch + cloutScore + followerScore) * 100));
};

export default function CollaboratorPicker({ profile, selected = [], onSelect, onClose }) {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const list = await base44.entities.ArtistProfile.list("-created_date", 50);
        const currentClout = Math.max(1, profile?.clout || 1);
        const minClout = Math.floor(currentClout * 0.8);
        const maxClout = Math.ceil(currentClout * 1.2);
        const currentFollowers = Math.max(1, profile?.followers || 1);
        const minFollowers = Math.floor(currentFollowers * 0.5);
        const maxFollowers = Math.ceil(currentFollowers * 1.5);

        const candidates = (list || []).filter((artist) => artist.id !== profile?.id && artist.is_active !== false);
        const genreMatches = candidates.filter((artist) => profile?.genre && artist.genre === profile.genre);
        const scopedPool = (genreMatches.length > 0 ? genreMatches : candidates).filter((artist) => {
          const clout = artist.clout || 0;
          const followers = artist.followers || 0;
          const cloutMatch = clout >= minClout && clout <= maxClout;
          const followerMatch = followers >= minFollowers && followers <= maxFollowers;
          return cloutMatch || followerMatch;
        });
        
        // Always show all artists, but sort by compatibility score
        const filtered = candidates
          .map((artist) => ({
            ...artist,
            match_score: computeMatchScore(artist, profile)
          }))
          .sort((a, b) => b.match_score - a.match_score);
        if (mounted) setArtists(filtered);
      } catch (error) {
        console.error("[CollaboratorPicker] failed to load artists", error);
        if (mounted) setArtists([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [profile]);

  const isSelected = (artist) => selected.some((item) => item.id === artist.id);

  const toggleSelect = (artist) => {
    if (isSelected(artist)) {
      onSelect(selected.filter((item) => item.id !== artist.id));
      return;
    }
    if (selected.length >= 2) return;
    onSelect([...selected, artist]);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        exit={{ y: 20 }}
        className="bg-[#090910] rounded-2xl border border-white/10 shadow-xl w-full max-w-xl max-h-[80vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-white" />
            <div>
              <p className="text-white font-semibold text-sm">Choose Collaborators</p>
              <p className="text-gray-500 text-[11px]">Up to 2 collaborators per song • All artists available</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <p className="text-gray-400 text-[12px]">Selected: {selected.length}/2</p>
          <div className="flex items-center gap-2 text-white text-[12px]">
            <Star className="w-3 h-3 text-yellow-400" />
            Matching by genre, clout, fans
          </div>
        </div>

        <div className="overflow-y-auto max-h-[60vh] space-y-2 p-4">
          {loading ? (
            <div className="w-full flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : artists.length === 0 ? (
            <p className="text-gray-500 text-center text-sm">No collaborators available right now.</p>
          ) : (
            artists.map((artist) => (
              <button
                key={artist.id}
                onClick={() => toggleSelect(artist)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-3 transition-all ${
                  isSelected(artist)
                    ? "border-purple-500/70 bg-purple-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                  {artist.artist_image ? (
                    <img src={artist.artist_image} alt={artist.artist_name} className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{artist.artist_name}</p>
                  <p className="text-gray-500 text-[11px] truncate">
                    {artist.genre || "Unknown"} • clout {artist.clout || 0} • {artist.followers?.toLocaleString() || 0} fans
                  </p>
                </div>
                <div className="text-right text-[11px] font-semibold" style={{ color: artist.match_score >= 80 ? '#4ade80' : artist.match_score >= 60 ? '#fbbf24' : '#94a3b8' }}>
                  {artist.match_score}%
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-4 border-t border-white/10 flex justify-between gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => { onSelect(selected); onClose(); }}
            disabled={selected.length === 0}
            className="flex-1"
          >
            Apply {selected.length} Collaborator{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
