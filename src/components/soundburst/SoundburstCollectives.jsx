import React from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, Music, MapPin } from "lucide-react";

export default function SoundburstCollectives({ profile, artists }) {
  const collectives = [
    // Existing collectives (normalized format)
    { id: 'underground_toronto', name: 'Underground Toronto', genre: 'Hip-Hop', description: "Toronto's underground hip-hop scene", memberCount: 47, icon: '🍁', trending: true },
    { id: 'nyc_basement', name: 'NYC Basement Collective', genre: 'Rap', description: 'Representing NYC underground rap', memberCount: 92, icon: '🗽' },
    { id: 'uk_drill_underground', name: 'UK Drill Underground', genre: 'UK Drill', description: "UK drill's rising stars", memberCount: 156, icon: '🇬🇧', trending: true },
    { id: 'drill_movement', name: 'Drill Movement', genre: 'Drill', description: 'Raw drill energy from the streets', memberCount: 134, icon: '🔥' },
    { id: 'alt_rap_lab', name: 'Alt Rap Lab', genre: 'Alternative Rap', description: 'Boundary-pushing experimental rap', memberCount: 78, icon: '🧪' },
    { id: 'west_coast_voices', name: 'West Coast Voices', genre: 'Hip-Hop', description: 'California underground movement', memberCount: 68, icon: '🌴' },
    
    // Pop
    { id: 'pop_underground', name: 'Pop Underground', genre: 'Pop', description: 'Hidden gems of mainstream sound', memberCount: 183, icon: '✨' },
    
    // R&B
    { id: 'velvet_sessions', name: 'Velvet Sessions', genre: 'R&B', description: 'Smooth R&B from the underground', memberCount: 124, icon: '💜' },
    
    // Afrobeats
    { id: 'afro_wave', name: 'Afro Wave Collective', genre: 'Afrobeats', description: 'The pulse of African music worldwide', memberCount: 167, icon: '🌍' },
    
    // Amapiano
    { id: 'piano_republic', name: 'Piano Republic', genre: 'Amapiano', description: 'South African piano house movement', memberCount: 143, icon: '🎹' },
    
    // EDM
    { id: 'neon_rave', name: 'Neon Rave Collective', genre: 'EDM', description: 'Electronic dance music pioneers', memberCount: 198, icon: '💿' },
    
    // K-Pop
    { id: 'seoul_sound', name: 'Seoul Sound Society', genre: 'K-Pop', description: 'Korean pop underground creators', memberCount: 156, icon: '🇰🇷' },
    
    // Indie
    { id: 'indie_basement', name: 'Indie Basement', genre: 'Indie', description: 'Independent artists breaking boundaries', memberCount: 112, icon: '🎸' },
    
    // Country
    { id: 'outlaw_country', name: 'Outlaw Country Crew', genre: 'Country', description: 'Modern country storytellers', memberCount: 87, icon: '🤠' },
    
    // Melodic Rap
    { id: 'melodic_minds', name: 'Melodic Minds', genre: 'Melodic Rap', description: 'Where melody meets bars', memberCount: 145, icon: '🎵' },
    
    // Trap
    { id: 'trap_house', name: 'Trap House Elite', genre: 'Trap', description: 'Hard-hitting trap producers and artists', memberCount: 176, icon: '🔊' },
    
    // Rock
    { id: 'garage_rock', name: 'Garage Rock Revival', genre: 'Rock', description: 'Raw rock energy from the garage', memberCount: 92, icon: '🤘' },
    
    // Alternative
    { id: 'alt_nation', name: 'Alt Nation Underground', genre: 'Alternative', description: 'Alternative sound explorers', memberCount: 108, icon: '🌀' },
    
    // Folk
    { id: 'folk_roots', name: 'Folk Roots Collective', genre: 'Folk', description: 'Acoustic storytellers and troubadours', memberCount: 76, icon: '🪕' },
    
    // Trance
    { id: 'trance_state', name: 'Trance State', genre: 'Trance', description: 'Euphoric trance community', memberCount: 134, icon: '🌈' },
    
    // Techno
    { id: 'warehouse_techno', name: 'Warehouse Techno', genre: 'Techno', description: 'Dark techno from the underground', memberCount: 121, icon: '🏭' },
    
    // Reggaeton
    { id: 'perreo_kings', name: 'Perreo Kings', genre: 'Reggaeton', description: 'Latin urban rhythm makers', memberCount: 189, icon: '🔥' },
    
    // Latin Pop
    { id: 'latin_pop_stars', name: 'Latin Pop Stars', genre: 'Latin Pop', description: 'Pop with Latin flavor', memberCount: 142, icon: '🌟' },
    
    // Salsa
    { id: 'salsa_nueva', name: 'Salsa Nueva', genre: 'Salsa', description: 'Modern salsa movement', memberCount: 67, icon: '💃' },
    
    // Dancehall
    { id: 'dancehall_vibes', name: 'Dancehall Vibes', genre: 'Dancehall', description: 'Caribbean dancehall energy', memberCount: 98, icon: '🇯🇲' },
    
    // Reggae
    { id: 'roots_reggae', name: 'Roots Reggae Collective', genre: 'Reggae', description: 'One love, one heart movement', memberCount: 84, icon: '🟢' },
    
    // J-Pop
    { id: 'tokyo_pop', name: 'Tokyo Pop Underground', genre: 'J-Pop', description: 'Japanese pop innovators', memberCount: 119, icon: '🇯🇵' },
    
    // Go-Go
    { id: 'dc_gogo', name: 'DC Go-Go Crew', genre: 'Go-Go', description: "Washington DC's signature sound", memberCount: 54, icon: '🥁' },
    
    // Grunge
    { id: 'grunge_revival', name: 'Grunge Revival', genre: 'Grunge', description: 'Raw Seattle-inspired sound', memberCount: 62, icon: '🎤' },
    
    // Blues
    { id: 'delta_blues', name: 'Delta Blues Society', genre: 'Blues', description: 'Blues tradition keepers', memberCount: 45, icon: '🎷' },
    
    // Jazz
    { id: 'jazz_underground', name: 'Jazz Underground', genre: 'Jazz', description: 'Modern jazz experimentalists', memberCount: 73, icon: '🎺' },
    
    // Soul
    { id: 'soul_kitchen', name: 'Soul Kitchen', genre: 'Soul', description: 'Soulful voices rising', memberCount: 89, icon: '❤️' },
    
    // Gospel
    { id: 'gospel_voices', name: 'Gospel Voices', genre: 'Gospel', description: 'Spiritual music community', memberCount: 67, icon: '🙏' },
    
    // Punk
    { id: 'punk_house', name: 'Punk House', genre: 'Punk', description: 'DIY punk spirit lives', memberCount: 78, icon: '⚡' },
    
    // Metal
    { id: 'metal_forge', name: 'Metal Forge', genre: 'Metal', description: 'Heavy metal brotherhood', memberCount: 96, icon: '🤟' },
    
    // Indie Rock
    { id: 'indie_rock_club', name: 'Indie Rock Club', genre: 'Indie Rock', description: 'Guitar-driven independent rock', memberCount: 104, icon: '🎶' },
    
    // Latin Rap
    { id: 'latin_rap_kings', name: 'Latin Rap Kings', genre: 'Latin Rap', description: 'Spanish language rap movement', memberCount: 132, icon: '👑' },
    
    // Latin
    { id: 'latin_fusion', name: 'Latin Fusion', genre: 'Latin', description: 'Pan-Latin musical fusion', memberCount: 115, icon: '🌎' },
  ];

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Collectives</h1>
        <p className="text-white/50 text-sm">Underground crews and communities</p>
      </div>

      {/* Regional Collective Highlight */}
      {profile?.region && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-400" />
            <span className="text-blue-300 text-xs uppercase tracking-wider">Your Region</span>
          </div>
          <h3 className="text-white font-bold text-lg mb-2">
            Underground {profile.region}
          </h3>
          <p className="text-white/70 text-sm mb-4">
            Join your local collective to connect with artists, collaborate, and build your regional presence.
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-white/60">
              <span>{artists.length} members</span>
              <span>{profile.genre}</span>
            </div>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Join Collective
            </button>
          </div>
        </motion.div>
      )}

      {/* Trending Collectives */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Trending Collectives</h3>
        </div>
        <div className="space-y-2">
          {collectives.map((collective, idx) => (
            <motion.div
              key={collective.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white font-bold text-sm">{collective.name}</h4>
                    {collective.trending && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 rounded text-blue-400 text-[9px] uppercase tracking-wider">
                        <TrendingUp className="w-2.5 h-2.5" />
                        Trending
                      </div>
                    )}
                  </div>
                  <p className="text-white/60 text-xs mb-2">{collective.description}</p>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    {collective.region && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span>{collective.region}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Music className="w-3 h-3" />
                      <span>{collective.genre}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>{collective.memberCount ?? collective.members} members</span>
                    </div>
                  </div>
                </div>
              </div>
              <button className="w-full mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors">
                View Collective
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Create Collective */}
      <section className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-4">
        <h3 className="text-white font-semibold text-sm mb-1">Create Your Own Collective</h3>
        <p className="text-white/70 text-xs mb-3">
          Build your crew, set your vibe, and grow together. Requires 100+ clout.
        </p>
        <button className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-medium transition-colors">
          Create Collective
        </button>
      </section>
    </div>
  );
}