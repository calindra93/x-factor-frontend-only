import React from "react";

export default function DiscoveryCarousel({ items }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Discovery & Recommendations</h3>
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Curated</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <div
            key={item.title}
            className="min-w-[200px] rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-white/[0.01] p-3"
          >
            <div className="h-28 overflow-hidden rounded-xl bg-white/5">
              <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-white text-sm font-semibold">{item.title}</p>
              <p className="text-[11px] text-white/60">{item.subtitle}</p>
              <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>{item.tag}</span>
                <span>{item.score}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
