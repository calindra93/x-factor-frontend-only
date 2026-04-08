import React, { useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Radio, Music, Users } from "lucide-react";

const RADIO_STATIONS = [
  // Pop stations
  { id: 1, name: "A-List Pop", description: "The biggest pop hits, updated daily", genre: "Pop", color: "from-pink-600 to-red-600" },
  { id: 2, name: "Today's Top Hits", description: "The most popular songs of the day", genre: "Top 40", color: "from-red-600 to-orange-600" },
  { id: 3, name: "Breaking Pop", description: "New music that's breaking through", genre: "Pop", color: "from-orange-600 to-yellow-600" },
  
  // Hip-hop cluster
  { id: 4, name: "RapCaviar", description: "New hip-hop songs and rap tracks", genre: "Hip-Hop", color: "from-purple-600 to-pink-600" },
  { id: "pure-bars", name: "Pure Bars", description: "Raw lyricism and wordplay", genre: "Rap", color: "from-zinc-700 to-zinc-900" },
  { id: "melodic-state", name: "Melodic State", description: "Melodic flows and vibes", genre: "Melodic Rap", color: "from-indigo-500 to-purple-700" },
  { id: "trap-nation", name: "Trap Nation", description: "Hard-hitting trap beats", genre: "Trap", color: "from-red-700 to-black" },
  { id: "drill-pressure", name: "Street Pressure", description: "Raw drill and street music", genre: "Drill", color: "from-red-600 to-red-800" },
  { id: "london-drill", name: "London Drill", description: "UK drill from the streets of London", genre: "UK Drill", color: "from-slate-700 to-slate-900" },
  { id: "genre-labs", name: "Genre Labs", description: "Experimental and alternative rap", genre: "Alternative Rap", color: "from-purple-600 to-violet-600" },
  { id: "latin-bars", name: "Latin Bars", description: "Spanish-language rap and hip-hop", genre: "Latin Rap", color: "from-amber-600 to-red-700" },
  
  // R&B/Soul cluster
  { id: "velvet-vibes", name: "Velvet Vibes", description: "Smooth R&B for your mood", genre: "R&B", color: "from-rose-600 to-pink-800" },
  { id: "soul-kitchen", name: "Soul Kitchen", description: "Classic and modern soul", genre: "Soul", color: "from-amber-700 to-orange-900" },
  { id: "blues-highway", name: "Blues Highway", description: "Deep cuts from the delta to Chicago", genre: "Blues", color: "from-blue-800 to-indigo-900" },
  { id: "jazz-after-dark", name: "Jazz After Dark", description: "Late night jazz sessions", genre: "Jazz", color: "from-amber-600 to-amber-900" },
  { id: "gospel-praise", name: "Gospel Praise", description: "Uplifting gospel and worship", genre: "Gospel", color: "from-yellow-500 to-amber-700" },
  
  // Pop variants
  { id: "k-wave", name: "K-Wave", description: "The best of K-Pop from Seoul", genre: "K-Pop", color: "from-pink-500 to-violet-600" },
  { id: "j-wave", name: "J-Wave", description: "Japan's hottest pop music", genre: "J-Pop", color: "from-red-500 to-pink-500" },
  { id: "indie-spotlight", name: "Indie Spotlight", description: "Independent artists breaking through", genre: "Indie", color: "from-teal-600 to-emerald-700" },
  { id: "indie-rock-central", name: "Indie Rock Central", description: "Guitar-driven indie music", genre: "Indie Rock", color: "from-orange-600 to-amber-700" },
  
  // Rock cluster
  { id: 6, name: "Rock This", description: "The best new rock music", genre: "Rock", color: "from-amber-600 to-orange-600" },
  { id: "alt-edge", name: "Alt Edge", description: "Alternative music on the cutting edge", genre: "Alternative", color: "from-cyan-600 to-blue-700" },
  { id: "grunge-revival", name: "Grunge Revival", description: "90s grunge and modern revival", genre: "Grunge", color: "from-stone-600 to-stone-800" },
  { id: "punk-rock-plaza", name: "Punk Rock Plaza", description: "Fast, loud, and rebellious", genre: "Punk", color: "from-lime-500 to-green-700" },
  { id: "mosh-pit", name: "Mosh Pit", description: "Heavy metal and hard rock", genre: "Metal", color: "from-zinc-800 to-black" },
  { id: "folk-roots", name: "Folk Roots", description: "Acoustic folk and singer-songwriters", genre: "Folk", color: "from-emerald-700 to-green-900" },
  
  // Electronic cluster
  { id: "festival-anthems", name: "Festival Anthems", description: "Main stage EDM bangers", genre: "EDM", color: "from-fuchsia-500 to-violet-700" },
  { id: "techno-bunker", name: "Techno Bunker", description: "Underground techno from Berlin and beyond", genre: "Techno", color: "from-gray-700 to-gray-900" },
  { id: "trance-underground", name: "Trance Underground", description: "Euphoric trance journeys", genre: "Trance", color: "from-blue-500 to-purple-700" },
  
  // World/Latin cluster
  { id: "afro-pulse", name: "Afro Pulse", description: "Afrobeats hits from Lagos to London", genre: "Afrobeats", color: "from-green-600 to-yellow-600" },
  { id: "piano-kingdom", name: "Piano Kingdom", description: "South African amapiano grooves", genre: "Amapiano", color: "from-violet-600 to-fuchsia-700" },
  { id: "reggaeton-heat", name: "Reggaeton Heat", description: "Perreo and dembow rhythms", genre: "Reggaeton", color: "from-red-500 to-yellow-500" },
  { id: "latin-pop-mix", name: "Latin Pop Mix", description: "Spanish-language pop hits", genre: "Latin Pop", color: "from-orange-500 to-pink-600" },
  { id: "latin-fusion", name: "Latin Fusion", description: "Latin rhythms across genres", genre: "Latin", color: "from-yellow-600 to-red-600" },
  { id: "salsa-caliente", name: "Salsa Caliente", description: "Hot salsa from Havana to NYC", genre: "Salsa", color: "from-red-600 to-orange-500" },
  { id: "island-riddims", name: "Island Riddims", description: "Dancehall vibes from Jamaica", genre: "Dancehall", color: "from-yellow-500 to-green-600" },
  { id: "irie-vibes", name: "Irie Vibes", description: "Roots reggae and modern dub", genre: "Reggae", color: "from-green-600 to-yellow-500" },
  
  // Other
  { id: "new-country", name: "New Country", description: "Today's country hits", genre: "Country", color: "from-sky-600 to-blue-800" },
  { id: "go-go-bounce", name: "Go-Go Bounce", description: "DC go-go rhythms and energy", genre: "Go-Go", color: "from-red-600 to-purple-700" },
  
  // Chill/Other
  { id: 5, name: "Chill Hits", description: "Relaxing songs from your favorite artists", genre: "Chill", color: "from-blue-600 to-cyan-600" },
];

const SIRIUSXM_PARTNERSHIPS = [
  {
    name: "SiriusXM Hits 1",
    description: "Today's biggest pop hits and breaking artists",
    host: "Ryan Sampson"
  },
  {
    name: "Hits 1 Late Night",
    description: "Late-night conversations with top artists",
    host: "Various"
  },
  {
    name: "SiriusXM Emerging Artists",
    description: "Your first listen to tomorrow's superstars",
    host: "Featuring Independent Artists"
  }
];

export default function AppleMusicRadio({ profile }) {
  const [playing, setPlaying] = useState(null);

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-6 h-6 text-red-400" />
          <h1 className="text-3xl font-bold text-white">Apple Music Radio</h1>
        </div>
        <p className="text-white/50 text-sm">Curated stations & live radio partnerships</p>
      </div>

      {/* Apple Music Stations */}
      <section className="space-y-3">
        <h2 className="text-white font-semibold">Featured Stations</h2>
        <div className="grid gap-3">
          {RADIO_STATIONS.map((station, idx) => (
            <motion.div
              key={station.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`relative h-28 rounded-2xl overflow-hidden group cursor-pointer`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${station.color}`} />
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex items-end justify-between p-4">
                <div>
                  <p className="text-white/80 text-xs uppercase tracking-wider mb-1">
                    {station.genre}
                  </p>
                  <h3 className="text-white font-bold text-lg">{station.name}</h3>
                  <p className="text-white/70 text-xs mt-1">{station.description}</p>
                </div>
                <button className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors flex-shrink-0">
                  <Play className="w-5 h-5 fill-white text-white" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* SiriusXM Partnership */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-red-400" />
          <h2 className="text-white font-semibold">SiriusXM Exclusive</h2>
        </div>
        <p className="text-white/60 text-xs">
          Tune into SiriusXM partnerships for live radio and exclusive artist interviews.
        </p>
        <div className="grid gap-3">
          {SIRIUSXM_PARTNERSHIPS.map((station, idx) => (
            <motion.div
              key={station.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
              className="bg-gradient-to-br from-red-600/20 to-orange-600/10 border border-red-500/20 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-sm mb-1">{station.name}</h3>
                  <p className="text-white/70 text-xs mb-2">{station.description}</p>
                  <p className="text-white/50 text-[10px]">Host: {station.host}</p>
                </div>
                <button
                  onClick={() => setPlaying(playing === station.name ? null : station.name)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
                >
                  {playing === station.name ? (
                    <Pause className="w-4 h-4 text-red-400" />
                  ) : (
                    <Play className="w-4 h-4 fill-red-400 text-red-400" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Info Box */}
      <section className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-red-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-white font-semibold text-sm mb-1">Submit to Radio</h3>
            <p className="text-white/70 text-xs">
              {profile
                ? "Your music can be submitted to Apple Music Radio stations as your clout increases."
                : "Sign up to submit your music to Apple Music Radio stations."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}