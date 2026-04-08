import React from "react";

export default function StreamingNumbers({ releases, artists }) {
  const formatValue = (value) => (typeof value === "number" ? value.toLocaleString() : value || "0");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Streaming Pulse</h3>
        <span className="text-[10px] text-white/40">Monthly listeners + totals</span>
      </div>
      <div className="space-y-3">
        <div className="text-[11px] text-white/50 uppercase tracking-[0.2em]">Releases</div>
        <div className="space-y-2">
          {releases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-xs text-white/50">
              No released projects yet.
            </div>
          ) : (
            releases.map((release) => (
              <div
                key={release.name}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div>
                  <p className="text-white text-sm font-semibold">{release.name}</p>
                  <p className="text-[11px] text-white/50">{formatValue(release.monthlyListeners)} monthly listeners</p>
                </div>
                <div className="text-[11px] text-white/60">{formatValue(release.totalStreams)} streams</div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-[11px] text-white/50 uppercase tracking-[0.2em]">Artists</div>
        <div className="space-y-2">
          {artists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-xs text-white/50">
              No artist stats yet.
            </div>
          ) : (
            artists.map((artist) => (
              <div
                key={artist.name}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div>
                  <p className="text-white text-sm font-semibold">{artist.name}</p>
                  <p className="text-[11px] text-white/50">{formatValue(artist.monthlyListeners)} monthly listeners</p>
                </div>
                <div className="text-[11px] text-white/60">{formatValue(artist.totalStreams)} streams</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
