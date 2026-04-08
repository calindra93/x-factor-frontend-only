import React from "react";

export default function EventsTourSchedule({ stops }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Upcoming Tour Dates</h3>
        <span className="text-[10px] text-white/40">Grouped by city & venue</span>
      </div>
      <div className="space-y-3">
        {stops.map((stop) => (
          <div
            key={`${stop.city}-${stop.venue}`}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-white text-base font-semibold">{stop.city}</h4>
                <p className="text-[11px] text-white/50">{stop.venue}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
                {stop.status}
              </span>
            </div>
            <div className="space-y-2">
              {stop.dates.map((date) => (
                <div
                  key={date.day}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div>
                    <p className="text-white text-sm font-semibold">{date.day}</p>
                    <p className="text-[11px] text-white/50">{date.note}</p>
                  </div>
                  <div className="text-[11px] text-white/60">{date.time}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
