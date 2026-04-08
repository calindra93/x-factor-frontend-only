import React from "react";

export default function RepostCollectiveSpotlight({ collectives }) {
  return (
    <section className="space-y-4 rounded-3xl border border-[#2b1a1a] bg-[#120b0b] p-6 shadow-[0_0_20px_rgba(248,113,113,0.2)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#f87171]">Repost & Collectives</p>
          <h2 className="text-2xl font-semibold text-[#f8fafc]">Cross-promo spotlight</h2>
        </div>
        <span className="rounded-full border border-[#f87171]/40 px-3 py-1 text-xs text-[#f87171]">
          Signal boost
        </span>
      </div>
      <div className="grid gap-4">
        {collectives.map((collective) => (
          <div
            key={collective.name}
            className="rounded-2xl border border-[#3a1f1f] bg-[#0e0808] p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">{collective.name}</h3>
              <span className="text-xs text-[#fca5a5]">{collective.members}</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{collective.focus}</p>
            <button
              type="button"
              className="mt-4 rounded-full border border-[#f87171]/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#fca5a5] transition hover:border-[#f87171] hover:text-white"
            >
              Repost swap
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
