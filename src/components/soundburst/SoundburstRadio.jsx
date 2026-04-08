import React from "react";
import { motion } from "framer-motion";
import { Radio, Play, Users, Headphones } from "lucide-react";

export default function SoundburstRadio({ profile, artists }) {
  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Underground Radio</h1>
        <p className="text-white/50 text-sm">Connect with emerging artists in {profile?.region || 'your region'}</p>
      </div>

      {/* Live Now */}
      <section className="space-y-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Live Now
        </h3>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-red-600/20 to-pink-600/10 border border-red-500/20 rounded-2xl p-5"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center flex-shrink-0">
              <Radio className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-base mb-1">
                Late Night Underground
              </h3>
              <p className="text-white/70 text-xs mb-3">
                Live streaming underground discoveries, collaborations & rare tracks
              </p>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1 text-white/60 text-xs">
                  <Users className="w-3.5 h-3.5" />
                  <span>324 listening</span>
                </div>
              </div>
              <button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-full py-2.5 flex items-center justify-center gap-2 font-semibold text-sm transition-colors">
                <Play className="w-4 h-4 fill-white" />
                Join Broadcast
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Scheduled Shows */}
      <section className="space-y-3">
        <h3 className="text-white font-semibold">Scheduled Shows</h3>
        <div className="space-y-2">
          {[
            { name: "Regional Spotlight", time: "Wed 11 PM UTC", host: "DJ Nova", listeners: 180 },
            { name: "Freestyle Sessions", time: "Sat 9 PM UTC", host: "MC Cipher", listeners: 210 },
            { name: "Underground Discoveries", time: "Sun 8 PM UTC", host: "The Curator", listeners: 156 }
          ].map((show, idx) => (
            <motion.div
              key={show.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0">
                  <Headphones className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">{show.name}</p>
                  <p className="text-white/50 text-xs">{show.time} • {show.host}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-white/60 text-xs">
                <Users className="w-3 h-3" />
                <span>{show.listeners}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Host Your Own */}
      <section className="bg-gradient-to-br from-blue-600/20 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-5">
        <Radio className="w-6 h-6 text-blue-400 mb-3" />
        <h3 className="text-white font-bold text-base mb-2">Host Your Own Show</h3>
        <p className="text-white/70 text-xs mb-4">
          As your clout grows, unlock the ability to host your own underground radio sessions. Discover talent, build community, and grow your influence.
        </p>
        <button className="w-full bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 text-sm font-medium transition-colors">
          Learn More
        </button>
      </section>
    </div>
  );
}