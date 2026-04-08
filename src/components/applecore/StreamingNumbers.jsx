import React from "react";

export default function StreamingNumbers({ releases, artists }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Listening Totals</h3>
        <span className="text-[10px] text-white/40">Monthly listeners + totals</span>
      </div>
      <div className="space-y-3">
        <div className="text-[11px] text-white/50 uppercase tracking-[0.2em]">Releases</div>
        <div className="space-y-2">
          {releases.map((release) => (
            <div
              key={release.name}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-white/[0.01] px-3 py-2"
            >
              <div>
                <p className="text-white text-sm font-semibold">{release.name}</p>
                <p className="text-[11px] text-white/50">{release.monthlyListeners} monthly listeners</p>
              </div>
              <div className="text-[11px] text-white/60">{release.totalStreams} streams</div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-[11px] text-white/50 uppercase tracking-[0.2em]">Artists</div>
        <div className="space-y-2">
          {artists.map((artist) => (
            <div
              key={artist.name}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-white/[0.01] px-3 py-2"
            >
              <div>
                <p className="text-white text-sm font-semibold">{artist.name}</p>
                <p className="text-[11px] text-white/50">{artist.monthlyListeners} monthly listeners</p>
              </div>
              <div className="text-[11px] text-white/60">{artist.totalStreams} streams</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
