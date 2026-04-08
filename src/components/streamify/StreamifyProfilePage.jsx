import React from "react";

export default function StreamifyProfilePage({ artist }) {
  if (!artist) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/50">
        Select an artist to view their Streamify profile.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-4">
        <div className="h-16 w-16 overflow-hidden rounded-full bg-white/5">
          <img src={artist.image} alt={artist.name} className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Streamify Profile</p>
          <h3 className="text-lg font-semibold text-white">{artist.name}</h3>
          <p className="text-xs text-white/60">{artist.totalStreams}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Monthly</p>
          <p className="mt-2 text-sm font-semibold text-white">{artist.monthlyListeners}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Global Rank</p>
          <p className="mt-2 text-sm font-semibold text-white">#{artist.rank}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
        Momentum is rising across Streamify editorial and algorithmic playlists.
        Keep the spotlight with fresh releases and targeted promo.
      </div>
    </section>
  );
}
