import React from "react";

export default function SoundburstTopArtists({ artists, onSelectArtist }) {
  const allowedStages = new Set([
    "Unknown",
    "Local Artist",
    "Local Buzz",
    "Underground Artist",
    "Cult Favorite",
  ]);

  const parseNumber = (value) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return 0;
    const normalized = value.replace(/,/g, "").trim().toUpperCase();
    const match = normalized.match(/([\d.]+)\s*([MB])?/);
    if (!match) return 0;
    const amount = parseFloat(match[1]);
    const multiplier = match[2] === "B" ? 1e9 : match[2] === "M" ? 1e6 : 1;
    return amount * multiplier;
  };

  // Career stage priority for underground discovery
  // Using actual database career_stages table values
  const getCareerStagePriority = (careerStage) => {
    // Prioritize underground artists (stages 1-4)
    switch (careerStage) {
      case 'Underground Artist': return 1000;  // Highest priority - true underground
      case 'Local Artist': return 900;       // Still underground discovery
      case 'Local Buzz': return 800;          // Building buzz, still underground
      case 'Cult Favorite': return 700;        // Underground cult following
      case 'Breakout Artist': return 600;       // Breaking through, still underground focus
      case 'Mainstream Artist': return 100;    // Much lower priority - mainstream success
      case 'A-List Star': return 50;           // Very low priority - major success
      case 'Global Superstar': return 30;       // Very low priority - global icon
      case 'Legacy Icon': return 10;            // Lowest priority - established legend
      case 'Unknown': return 500;               // Unknown gets middle priority
      default: return 500;                    // Default middle priority
    }
  };

  const sortedArtists = [...artists]
    .filter((artist) => allowedStages.has(artist.career_stage || "Unknown"))
    .sort((a, b) => {
      // First prioritize by career stage (underground favored)
      const aPriority = getCareerStagePriority(a.career_stage);
      const bPriority = getCareerStagePriority(b.career_stage);
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Within same career stage, sort by monthly listeners
      return parseNumber(b.monthlyListeners) - parseNumber(a.monthlyListeners);
    })
    .slice(0, 10)
    .map((artist, index) => ({
      ...artist,
      rank: index + 1
    }));

  if (sortedArtists.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="text-white text-lg font-bold">Rising Underground</h2>
        <button className="text-xs text-white/40 hover:text-white">Show all</button>
      </div>
      <div
        className="flex gap-4 overflow-x-auto pb-1 px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {sortedArtists.map((artist) => (
          <button
            key={artist.id || artist.name}
            type="button"
            onClick={() => onSelectArtist?.(artist)}
            className="flex-shrink-0 w-[100px] text-center"
          >
            <div className="w-[100px] h-[100px] mx-auto rounded-full overflow-hidden bg-white/5 mb-2">
              {artist.image ? (
                <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/40">
                  {artist.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>
            <p className="text-white text-xs font-semibold truncate">{artist.name}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
