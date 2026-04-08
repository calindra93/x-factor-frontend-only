import React from "react";

const STATUS_STYLES = {
  "In Final Mix": "bg-amber-500/20 border-amber-500/30 text-amber-200",
  "Mastering": "bg-sky-500/20 border-sky-500/30 text-sky-200",
  "In Production": "bg-purple-500/20 border-purple-500/30 text-purple-200",
  "Out Now": "bg-emerald-500/20 border-emerald-500/30 text-emerald-200",
};

export default function EventsUpcomingProjects({ projects }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Upcoming Projects</h3>
        <span className="text-[10px] text-white/40">EPs · Albums · Singles</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <div
            key={project.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{project.type}</p>
                <h4 className="text-white text-base font-semibold">{project.title}</h4>
                <p className="text-[11px] text-white/50">{project.releaseDate}</p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] ${
                  STATUS_STYLES[project.status] || "border-white/10 bg-white/5 text-white/60"
                }`}
              >
                {project.status}
              </span>
            </div>
            <p className="text-[12px] text-white/70 leading-relaxed">{project.description}</p>
            <div className="flex flex-wrap gap-2">
              {project.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
