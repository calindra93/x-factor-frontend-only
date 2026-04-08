import React from "react";

const getDaysSinceUpdate = (updateDay) => {
  if (updateDay === 0) return "Updated today";
  
  const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSince = (today - updateDay + 7) % 7;
  
  if (daysSince === 0) return "Updated today";
  if (daysSince === 1) return "Updated yesterday";
  return `Updated ${daysSince} days ago`;
};

export default function PlaylistRails({ playlists, title, onPlaylistClick }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between px-4 pt-2">
        <h2 className="text-white text-lg font-bold">{title || "Playlists"}</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div 
        className="flex gap-3 overflow-x-auto pb-2 px-4"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {playlists.map((playlist) => (
          <button
            key={playlist.name}
            onClick={() => onPlaylistClick?.(playlist)}
            className="flex-shrink-0 w-[140px] text-left"
          >
            <div className="aspect-square w-full rounded-md overflow-hidden bg-black mb-2 group">
              <img 
                src={playlist.cover} 
                alt={playlist.name} 
                className="w-full h-full object-cover transition group-hover:scale-105"
              />
            </div>
            <p className="text-white text-xs font-semibold line-clamp-2 leading-tight">
              {playlist.name}
            </p>
            <p className="text-white/40 text-[10px] mt-0.5 line-clamp-2">
              {playlist.description || getDaysSinceUpdate(playlist.updateDay)}
            </p>
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