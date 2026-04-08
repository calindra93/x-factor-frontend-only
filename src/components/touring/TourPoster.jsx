import React from "react";
import { MapPin } from "lucide-react";

export default function TourPoster({ tourName, artistName, route, stops = [], theme = "purple" }) {
  const currentDate = new Date();
  
  // Theme configs
  const themes = {
    purple: { bg: "bg-purple-900", text: "text-purple-100", accent: "text-purple-400", border: "border-purple-500" },
    blue: { bg: "bg-blue-900", text: "text-blue-100", accent: "text-blue-400", border: "border-blue-500" },
    red: { bg: "bg-red-900", text: "text-red-100", accent: "text-red-400", border: "border-red-500" },
    emerald: { bg: "bg-emerald-900", text: "text-emerald-100", accent: "text-emerald-400", border: "border-emerald-500" },
  };
  
  const t = themes[theme] || themes.purple;

  return (
    <div className={`relative w-full aspect-[2/3] max-w-sm mx-auto overflow-hidden rounded-sm shadow-2xl border-4 ${t.border} bg-[#0a0a0f] flex flex-col`}>
      {/* Texture Overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay"></div>
      
      {/* Header */}
      <div className={`${t.bg} p-6 text-center relative z-10`}>
        <h2 className={`text-3xl font-black uppercase tracking-tighter ${t.text} drop-shadow-md leading-none`}>
          {artistName || "ARTIST NAME"}
        </h2>
        <div className="h-1 w-20 bg-white/30 mx-auto my-2"></div>
        <h1 className="text-xl font-bold uppercase tracking-widest text-white/90">
          {tourName || "THE WORLD TOUR"}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col relative z-10">
        <div className="text-center mb-6">
          <p className={`text-sm uppercase tracking-[0.3em] ${t.accent} font-bold`}>
            {route?.region || "GLOBAL"} • {new Date().getFullYear()}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden">
          {/* Simulated Stops Display */}
          {(Array.isArray(stops) ? stops : []).length > 0 ? (
            <div className="grid grid-cols-1 gap-2 text-center">
              {(Array.isArray(stops) ? stops : []).map((stop, i) => {
                const date = new Date(currentDate);
                date.setDate(date.getDate() + (i + 1) * 2);
                return (
                  <div key={i} className="flex items-center justify-center gap-2 text-sm text-gray-300">
                    <span className={`${t.accent} font-mono text-xs opacity-70`}>
                      {date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                    </span>
                    <span className="font-bold uppercase tracking-wider">{stop.city}</span>
                    <span className="text-xs text-gray-500 hidden sm:inline">• {stop.venue}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
              <MapPin className="w-8 h-8 opacity-20" />
              <span className="text-xs uppercase tracking-widest">Dates Announcing Soon</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center border-t border-white/10 relative z-10 bg-black/40">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Tickets On Sale Now</p>
        <div className="flex justify-center gap-4 text-[10px] text-gray-600">
          <span>STREAMIFY</span> • <span>APPLECORE</span> • <span>SOUNDBURST</span>
        </div>
      </div>
    </div>
  );
}
