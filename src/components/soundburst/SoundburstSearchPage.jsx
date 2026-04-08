import { useMemo, useState } from "react";
import { Search } from "lucide-react";

const GENRE_CATALOG = [
  { key: "rap", label: "Rap", tint: "#ff5f8f", searchTerms: ["rap"] },
  { key: "melodic-rap", label: "Melodic Rap", tint: "#7a8dff", searchTerms: ["melodic rap"] },
  { key: "alternative-rap", label: "Alternative Rap", tint: "#9b74ff", searchTerms: ["alternative rap"] },
  { key: "trap", label: "Trap", tint: "#ff6b63", searchTerms: ["trap"] },
  { key: "hip-hop", label: "Hip-Hop", tint: "#f164ac", searchTerms: ["hip-hop", "hip hop"] },
  { key: "drill", label: "Drill", tint: "#ff5d63", searchTerms: ["drill"] },
  { key: "uk-drill", label: "UK Drill", tint: "#8f94a7", searchTerms: ["uk drill"] },
  { key: "rnb", label: "R&B", tint: "#ff8a63", searchTerms: ["r&b", "rnb", "rhythm and blues"] },
  { key: "soul", label: "Soul", tint: "#df63a5", searchTerms: ["soul"] },
  { key: "neo-soul", label: "Neo-Soul", tint: "#c86a8f", searchTerms: ["neo-soul", "neo soul"] },
  { key: "blues", label: "Blues", tint: "#5f88ff", searchTerms: ["blues"] },
  { key: "jazz", label: "Jazz", tint: "#d6a24d", searchTerms: ["jazz"] },
  { key: "gospel", label: "Gospel", tint: "#e6c45f", searchTerms: ["gospel"] },
  { key: "pop", label: "Pop", tint: "#6f8dff", searchTerms: ["pop"] },
  { key: "k-pop", label: "K-Pop", tint: "#f173c5", searchTerms: ["k-pop", "k pop"] },
  { key: "j-pop", label: "J-Pop", tint: "#ff7d92", searchTerms: ["j-pop", "j pop"] },
  { key: "indie", label: "Indie", tint: "#51b7bf", searchTerms: ["indie"] },
  { key: "alternative", label: "Alternative", tint: "#7b8dff", searchTerms: ["alternative"] },
  { key: "indie-rock", label: "Indie Rock", tint: "#d78f62", searchTerms: ["indie rock"] },
  { key: "rock", label: "Rock", tint: "#f06f7e", searchTerms: ["rock"] },
  { key: "grunge", label: "Grunge", tint: "#7da05d", searchTerms: ["grunge"] },
  { key: "punk", label: "Punk", tint: "#ff5ca8", searchTerms: ["punk"] },
  { key: "metal", label: "Metal", tint: "#6f7a86", searchTerms: ["metal"] },
  { key: "folk", label: "Folk", tint: "#4fc0a9", searchTerms: ["folk"] },
  { key: "country", label: "Country", tint: "#81a6ff", searchTerms: ["country"] },
  { key: "americana", label: "Americana", tint: "#9fb57a", searchTerms: ["americana"] },
  { key: "electronic", label: "Electronic", tint: "#d56ce2", searchTerms: ["electronic"] },
  { key: "edm", label: "EDM", tint: "#cb72ff", searchTerms: ["edm"] },
  { key: "house", label: "House", tint: "#70d39b", searchTerms: ["house"] },
  { key: "techno", label: "Techno", tint: "#e5c85f", searchTerms: ["techno"] },
  { key: "trance", label: "Trance", tint: "#7c86ff", searchTerms: ["trance"] },
  { key: "afrobeats", label: "Afrobeats", tint: "#7cd96b", searchTerms: ["afrobeats", "afropop"] },
  { key: "amapiano", label: "Amapiano", tint: "#b96eff", searchTerms: ["amapiano"] },
  { key: "dancehall", label: "Dancehall", tint: "#e7c15d", searchTerms: ["dancehall"] },
  { key: "reggae", label: "Reggae", tint: "#68b96e", searchTerms: ["reggae"] },
  { key: "latin", label: "Latin", tint: "#f39b62", searchTerms: ["latin"] },
  { key: "latin-rap", label: "Latin Rap", tint: "#ff7448", searchTerms: ["latin rap"] },
  { key: "latin-pop", label: "Latin Pop", tint: "#ff9d65", searchTerms: ["latin pop"] },
  { key: "reggaeton", label: "Reggaeton", tint: "#ff7b52", searchTerms: ["reggaeton"] },
  { key: "salsa", label: "Salsa", tint: "#ff6f6a", searchTerms: ["salsa"] },
  { key: "go-go", label: "Go-Go", tint: "#d45cb4", searchTerms: ["go-go", "go go"] },
  { key: "chill", label: "Chill", tint: "#6eb6d8", searchTerms: ["chill", "lo-fi", "lofi"] },
];

const BENTO_PATTERN = [
  { rowSpan: "row-span-3", colSpan: "col-span-1" },
  { rowSpan: "row-span-2", colSpan: "col-span-1" },
  { rowSpan: "row-span-2", colSpan: "col-span-1" },
  { rowSpan: "row-span-3", colSpan: "col-span-1" },
  { rowSpan: "row-span-2", colSpan: "col-span-1" },
  { rowSpan: "row-span-2", colSpan: "col-span-1" },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hexToRgba(hex, alpha) {
  const sanitized = hex.replace("#", "");
  const normalized = sanitized.length === 3
    ? sanitized.split("").map((char) => `${char}${char}`).join("")
    : sanitized;
  const parsed = Number.parseInt(normalized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function genreMatches(artistGenre, searchTerms) {
  const normalizedGenre = normalizeText(artistGenre);
  return searchTerms.some((term) => normalizedGenre.includes(normalizeText(term)));
}

function buildGenreTiles(artists) {
  return GENRE_CATALOG.map((genre, index) => {
    const matchingArtists = artists.filter((artist) => genreMatches(artist.genre, genre.searchTerms));
    const score = matchingArtists.reduce((total, artist) => {
      const monthlyListeners = typeof artist.monthlyListeners === "number" ? artist.monthlyListeners : 0;
      const totalStreams = typeof artist.totalStreams === "number" ? artist.totalStreams : 0;
      return total + monthlyListeners * 2 + totalStreams;
    }, 0);

    const imageArtist =
      matchingArtists.find((artist) => artist.image) ||
      artists.find((artist) => artist.image && genreMatches(artist.genre, genre.searchTerms)) ||
      null;

    return {
      ...genre,
      artists: matchingArtists,
      score,
      imageArtist,
      ...BENTO_PATTERN[index % BENTO_PATTERN.length],
    };
  });
}

function GenreTile({ tile, onPickGenre }) {
  const artist = tile.imageArtist;
  const tintStrong = hexToRgba(tile.tint, artist ? 0.72 : 0.9);
  const tintSoft = hexToRgba(tile.tint, artist ? 0.2 : 0.4);
  const border = hexToRgba(tile.tint, 0.78);

  return (
    <button
      type="button"
      onClick={() => onPickGenre(tile.label)}
      className={`group relative overflow-hidden rounded-[24px] border bg-[#2a2a2c] text-left transition duration-200 hover:-translate-y-0.5 ${tile.rowSpan} ${tile.colSpan}`}
      style={{ borderColor: border }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_34%)]" />
      {artist?.image ? (
        <>
          <img
            src={artist.image}
            alt={artist.name || tile.label}
            className="absolute inset-0 h-full w-full object-cover object-center saturate-[0.88] contrast-125"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${hexToRgba("#111214", 0.12)} 0%, ${hexToRgba("#111214", 0.22)} 22%, ${tintSoft} 58%, ${tintStrong} 100%)`,
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(160deg, ${tintSoft} 0%, ${tintStrong} 100%)` }}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,16,19,0.06),rgba(16,16,19,0.18)_28%,rgba(16,16,19,0.52)_100%)]" />
      <div
        className="absolute -bottom-8 -right-5 h-[68%] w-[72%] rounded-[30px] border"
        style={{ borderColor: hexToRgba(tile.tint, 0.4) }}
      />
      <div
        className="absolute -bottom-2 left-5 h-[46%] w-[48%] rounded-[24px] border"
        style={{ borderColor: hexToRgba(tile.tint, 0.28) }}
      />
      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <p className="max-w-[82%] text-[1.75rem] font-black leading-[0.95] tracking-[-0.05em] text-white [text-wrap:balance]">
          {tile.label}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/65">
          {tile.artists.length > 0 ? `${tile.artists.length} artists` : "No artists yet"}
        </p>
      </div>
    </button>
  );
}

export default function SoundburstSearchPage({ artists, onSelectArtist }) {
  const [query, setQuery] = useState("");

  const filteredArtists = useMemo(() => {
    const normalized = normalizeText(query);
    if (!normalized) {
      return artists;
    }
    return artists.filter((artist) => {
      const haystack = [artist.name, artist.genre, artist.region, artist.career_stage]
        .map(normalizeText)
        .join(" ");
      return haystack.includes(normalized);
    });
  }, [artists, query]);

  const genreTiles = useMemo(() => buildGenreTiles(artists), [artists]);
  const showBrowse = normalizeText(query).length === 0;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2 text-white/60">
          <Search className="h-4 w-4 text-emerald-300/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search underground artists"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
      </div>
      {showBrowse ? (
        <div className="grid grid-cols-2 auto-rows-[72px] gap-3">
          {genreTiles.map((tile) => (
            <GenreTile
              key={tile.key}
              tile={tile}
              onPickGenre={(genre) => setQuery(genre)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredArtists.map((artist) => (
            <button
              key={artist.id || artist.name}
              type="button"
              onClick={() => onSelectArtist(artist)}
              className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-emerald-500/20 hover:bg-white/[0.06]"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/5 text-xs text-white/60 ring-1 ring-emerald-400/20">
                {artist.image ? (
                  <img src={artist.image} alt={artist.name} className="h-full w-full object-cover" />
                ) : (
                  <span>{artist.name?.[0]?.toUpperCase() || "?"}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{artist.name}</p>
                <p className="text-[11px] text-white/50">
                  {typeof artist.totalStreams === "number"
                    ? `${artist.totalStreams.toLocaleString()} streams`
                    : artist.totalStreams || "No streams yet"}
                </p>
              </div>
              <span className="text-[11px] text-emerald-300/60">
                {typeof artist.monthlyListeners === "number"
                  ? `${artist.monthlyListeners.toLocaleString()} monthly`
                  : artist.monthlyListeners || "\u2014"}
              </span>
            </button>
          ))}
          {filteredArtists.length === 0 && (
            <div className="rounded-2xl border border-emerald-500/10 bg-white/[0.02] px-4 py-6 text-center text-xs text-white/50">
              No artists matched your search.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
