import React from "react";

export default function ArtistsPickCard({ pick }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Artist’s Pick</h3>
        <span className="text-[10px] text-white/40">Featured focus release</span>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative w-full overflow-hidden rounded-2xl bg-white/5 md:w-40">
            <img src={pick.image} alt={pick.title} className="h-full w-full object-cover" />
            <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70">
              {pick.type}
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <h4 className="text-white text-base font-semibold">{pick.title}</h4>
              <p className="text-[11px] text-white/50">{pick.releaseDate}</p>
            </div>
            <p className="text-[12px] text-white/70 leading-relaxed">{pick.description}</p>
            <div className="flex flex-wrap gap-2">
              {pick.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {pick.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{stat.label}</p>
              <p className="text-sm font-semibold text-white">{stat.value}</p>
              <p className="text-[11px] text-white/50">{stat.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
