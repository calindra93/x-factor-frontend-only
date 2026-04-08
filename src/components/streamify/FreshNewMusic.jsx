import React from "react";

export default function FreshNewMusic({ releases, onReleaseClick }) {
  if (!releases || releases.length === 0) {
    return (
      <section className="space-y-3">
        <div className="px-4"><h2 className="text-white text-lg font-bold">Fresh New Music</h2></div>
        <div className="text-white/40 text-xs text-center py-8 mx-4 rounded-lg border border-white/[0.06]">No new projects yet.</div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="text-white text-lg font-bold">Fresh New Music</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 px-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
        {releases.map((release) => (
          <button key={release.id} onClick={() => onReleaseClick?.(release)} className="flex-shrink-0 w-[140px] text-left">
            <div className="aspect-square w-full rounded-md overflow-hidden bg-white/5 mb-2 group">
              {release.cover_artwork_url ? (
                <img src={release.cover_artwork_url} alt={release.release_name} className="w-full h-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-blue-500/10 flex items-center justify-center text-white/30 text-xs">No Art</div>
              )}
            </div>
            <p className="text-white text-xs font-semibold truncate">{release.release_name}</p>
            <p className="text-white/40 text-[10px] truncate">{release.artist_name}</p>
          </button>
        ))}
      </div>
      <style>{`
        section div[class*="overflow-x-auto"]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}