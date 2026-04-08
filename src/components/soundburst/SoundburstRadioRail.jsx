import React from "react";

const formatListeners = (n) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.max(0, Math.round(n || 0))
  );

const GENRE_ACCENT = {
  Rap: "#f59e0b", "Hip-Hop": "#f59e0b", Trap: "#f59e0b", Drill: "#f59e0b", "UK Drill": "#f59e0b",
  "R&B": "#a78bfa", Soul: "#a78bfa",
  Pop: "#f472b6", "K-Pop": "#f472b6", "J-Pop": "#f472b6",
  Indie: "#34d399", Alternative: "#34d399",
  Electronic: "#38bdf8", EDM: "#38bdf8", House: "#38bdf8", Techno: "#38bdf8",
  Afrobeats: "#fb923c", Amapiano: "#fb923c", Dancehall: "#fb923c", Reggaeton: "#fb923c", Latin: "#fb923c",
  Jazz: "#fbbf24", Blues: "#fbbf24",
  Folk: "#86efac", Country: "#86efac",
  Rock: "#f87171", Metal: "#f87171", Punk: "#f87171",
};

const GENRE_BG = {
  Rap: "linear-gradient(135deg, #292524 0%, #78350f 55%, #0a0a0f 100%)",
  "Hip-Hop": "linear-gradient(135deg, #1c1917 0%, #44403c 60%, #0a0a0f 100%)",
  Trap: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0a0a0f 100%)",
  Drill: "linear-gradient(135deg, #0c0a09 0%, #292524 60%, #0a0a0f 100%)",
  "UK Drill": "linear-gradient(135deg, #1c1917 0%, #44403c 60%, #0a0a0f 100%)",
  "R&B": "linear-gradient(135deg, #3b0764 0%, #6d28d9 55%, #0a0a0f 100%)",
  Soul: "linear-gradient(135deg, #431407 0%, #9a3412 55%, #0a0a0f 100%)",
  Pop: "linear-gradient(135deg, #831843 0%, #db2777 50%, #0a0010 100%)",
  "K-Pop": "linear-gradient(135deg, #500724 0%, #be185d 50%, #0a0a0f 100%)",
  "J-Pop": "linear-gradient(135deg, #500724 0%, #be185d 50%, #0a0a0f 100%)",
  Indie: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  Alternative: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  Electronic: "linear-gradient(135deg, #020617 0%, #1e3a5f 60%, #0a0a0f 100%)",
  EDM: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #0a0010 100%)",
  House: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #0a0a0f 100%)",
  Techno: "linear-gradient(135deg, #09090b 0%, #27272a 60%, #0a0a0f 100%)",
  Afrobeats: "linear-gradient(135deg, #431407 0%, #9a3412 55%, #0a0a0f 100%)",
  Amapiano: "linear-gradient(135deg, #14532d 0%, #15803d 55%, #0a0a0f 100%)",
  Dancehall: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  Reggaeton: "linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #0a0010 100%)",
  Latin: "linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #0a0a0f 100%)",
  Jazz: "linear-gradient(135deg, #1c1917 0%, #3f3f46 60%, #0a0a0f 100%)",
  Blues: "linear-gradient(135deg, #292524 0%, #78350f 55%, #0a0a0f 100%)",
  Folk: "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  Country: "linear-gradient(135deg, #1c0a00 0%, #713f12 55%, #0a0a0f 100%)",
  Rock: "linear-gradient(135deg, #0c0a09 0%, #292524 60%, #0a0a0f 100%)",
  Metal: "linear-gradient(135deg, #0c0a09 0%, #1c1917 65%, #0a0a0f 100%)",
  Punk: "linear-gradient(135deg, #0c0a09 0%, #1c1917 65%, #0a0a0f 100%)",
  Grime: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0a0a0f 100%)",
};

const FALLBACK_BG = [
  "linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #14532d 0%, #166534 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #0a0a0f 100%)",
  "linear-gradient(135deg, #0c4a6e 0%, #0284c7 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #500724 0%, #9d174d 55%, #0a0a0f 100%)",
  "linear-gradient(135deg, #1c1917 0%, #44403c 60%, #0a0a0f 100%)",
];

const hashStr = (str) =>
  [...str].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);

const getShowVisuals = (show) => {
  const primaryGenre = Array.isArray(show.genres) ? show.genres[0] : null;
  const accent = (primaryGenre && GENRE_ACCENT[primaryGenre]) || FALLBACK_BG[Math.abs(hashStr(show.name || "")) % 6].match(/#[0-9a-f]{6}/gi)?.[1] || "#a78bfa";
  const bg = (primaryGenre && GENRE_BG[primaryGenre]) || FALLBACK_BG[Math.abs(hashStr(show.name || "")) % FALLBACK_BG.length];
  return { accent, bg };
};

function WaveformBars({ accent }) {
  const heights = [55, 100, 35, 75, 50];
  return (
    <div className="flex items-end gap-[2px]" style={{ height: "28px" }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full"
          style={{
            height: `${h}%`,
            background: accent,
            animation: `sb-radio-wave ${0.55 + i * 0.13}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function SoundburstRadioRail({ shows, onShowClick }) {
  if (!shows?.length) return null;

  return (
    <>
      <style>{`
        @keyframes sb-radio-wave {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1); }
        }
        @keyframes sb-live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500"
              style={{ animation: "sb-live-pulse 1.4s ease-in-out infinite" }}
            />
            <h2 className="text-lg font-bold text-white">On The Air</h2>
          </div>
          <button className="text-xs text-white/40 hover:text-white">Show all</button>
        </div>

        <div
          className="flex gap-3 overflow-x-auto pb-2 px-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {shows.map((show) => {
            const { accent, bg } = getShowVisuals(show);
            const isTastemaker = show.tier === "tastemaker";
            const primaryGenre = Array.isArray(show.genres) ? show.genres[0] : null;

            return (
              <button
                key={show.id}
                onClick={() => onShowClick?.(show)}
                className="group flex-shrink-0 w-[140px] text-left"
              >
                {/* Square tile — matches playlist rail card dimensions */}
                <div className="relative aspect-square w-full overflow-hidden rounded-md mb-2">
                  {/* Gradient background */}
                  <div
                    className="absolute inset-0 transition duration-300 group-hover:scale-105"
                    style={{ background: bg }}
                  />

                  {/* Bottom scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                  {/* LIVE badge — top left */}
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0"
                      style={{ animation: "sb-live-pulse 1.4s ease-in-out infinite" }}
                    />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Live</span>
                  </div>

                  {/* Tastemaker badge — top right */}
                  {isTastemaker && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[9px] font-bold text-yellow-400">✦</span>
                    </div>
                  )}

                  {/* Waveform — centered in upper area */}
                  <div className="absolute inset-x-0 top-0 bottom-8 flex items-center justify-center">
                    <WaveformBars accent={accent} />
                  </div>

                  {/* Show name overlay — bottom */}
                  <div className="absolute bottom-2 left-2.5 right-2">
                    <p className="text-[13px] font-black leading-tight text-white line-clamp-2 drop-shadow-md">
                      {show.name}
                    </p>
                  </div>
                </div>

                {/* Sub-label row — mirrors "Updated X days ago" pattern */}
                <div className="flex items-center gap-1.5">
                  {primaryGenre && (
                    <span className="text-[10px] font-medium" style={{ color: accent }}>
                      {primaryGenre}
                    </span>
                  )}
                  <span className="text-[10px] text-white/30">·</span>
                  <span className="text-[10px] text-white/40">
                    {formatListeners(show.listenerCount)} listeners
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
