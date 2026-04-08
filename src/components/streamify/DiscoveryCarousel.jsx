import React, { useState, useEffect, useMemo, useRef } from "react";
import { Loader, Lightbulb } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function DiscoveryCarousel({ items, profile }) {
  const [similarByArtist, setSimilarByArtist] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const requestedArtistIdsRef = useRef(new Set());

  const artistIds = useMemo(
    () =>
      (Array.isArray(items) ? items : [])
        .map((item) => item?.artist_id)
        .filter(Boolean),
    [items]
  );

  // Load similar artists for each item in the carousel without refetching the same artist repeatedly.
  useEffect(() => {
    if (artistIds.length === 0) return;

    artistIds.forEach((artistId) => {
      if (requestedArtistIdsRef.current.has(artistId)) return;
      const item = items.find((entry) => entry.artist_id === artistId);
      if (!item) return;

      requestedArtistIdsRef.current.add(artistId);
      loadSimilarArtists(item);
    });
  }, [artistIds, items]);

  const loadSimilarArtists = async (item) => {
    if (!item?.artist_id) return;

    try {
      setLoadingStates((prev) => ({ ...prev, [item.artist_id]: true }));

      const response = await base44.functions.invoke('getSimilarArtists', {
        artist_id: item.artist_id,
        genre: item.genre || 'Pop',
        region: item.region || 'United States',
        clout: 100
      });

      setSimilarByArtist((prev) => ({
        ...prev,
        [item.artist_id]: response?.similar_artists || response?.data?.similar_artists || []
      }));
    } catch (error) {
      console.error('Failed to load similar artists:', error);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [item.artist_id]: false }));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-blue-400" />
          <h3 className="text-white text-sm font-semibold">Discovery & Recommendations</h3>
        </div>
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Personalized For You</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-white/50">
          No recommendations yet. Release projects to build discovery lanes.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {items.map((item) => {
            const similar = similarByArtist[item.artist_id] || [];
            const isLoading = loadingStates[item.artist_id];

            return (
              <div
                key={item.title}
                className="min-w-[220px] rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 transition-colors"
              >
                {/* Image */}
                <div className="h-28 overflow-hidden rounded-xl bg-white/5 mb-3">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                      No artwork
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-2">
                  <div>
                    <p className="text-white text-sm font-semibold">{item.title}</p>
                    <p className="text-[11px] text-white/60">{item.subtitle}</p>
                  </div>

                  {/* Similar Artists */}
                  {isLoading ? (
                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                      <Loader className="w-2.5 h-2.5 animate-spin" />
                      <span>Finding similar...</span>
                    </div>
                  ) : similar.length > 0 ? (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                      <p className="text-[9px] text-blue-300 uppercase tracking-wide mb-1.5 font-semibold">
                        Similar Artists
                      </p>
                      <div className="space-y-1">
                        {similar.slice(0, 2).map((artist) => (
                          <div key={artist.artist_name} className="text-[9px]">
                            <p className="text-blue-200 font-medium">{artist.artist_name}</p>
                            <p className="text-blue-300/70 text-[8px]">{artist.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Meta */}
                  <div className="flex items-center justify-between text-[10px] text-white/40 pt-1 border-t border-white/10">
                    <span>{item.tag}</span>
                    <span>{item.score}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
