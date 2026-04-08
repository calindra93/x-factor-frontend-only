import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { buildSceneReportCities } from "@/lib/soundburstCityHelpers";

const TIME_FILTERS = [
  { id: "today", label: "TODAY" },
  { id: "this_week", label: "THIS WEEK" },
  { id: "this_month", label: "THIS MONTH" },
  { id: "upcoming", label: "UPCOMING" },
];

const BG_IMAGES = [
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=60",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=60",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=60",
  "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800&q=60",
];

function PillDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.id === value) || options[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-white transition-colors hover:text-white/80"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {selected.label}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="absolute left-0 top-full z-30 mt-2 max-h-[30vh] min-w-[140px] overflow-y-auto overflow-x-hidden rounded-xl border border-white/[0.1] bg-[#15151d] py-1 shadow-2xl">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={[
                  "w-full px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                  opt.id === value
                    ? "bg-white/10 text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EventsNearYouHero({ currentRegion, onCitySelect, onViewEvents }) {
  const cities = useMemo(() => {
    const all = buildSceneReportCities(currentRegion);
    return all.sort((a, b) => {
      if (a.isHomeRegion && !b.isHomeRegion) return -1;
      if (!a.isHomeRegion && b.isHomeRegion) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [currentRegion]);

  const cityOptions = useMemo(
    () => cities.map((c) => ({ id: c.id, label: c.name.toUpperCase(), city: c })),
    [cities]
  );

  const [selectedCityId, setSelectedCityId] = useState(
    () => cities.find((c) => c.isHomeRegion)?.id || cities[0]?.id || ""
  );
  const [selectedTime, setSelectedTime] = useState("this_week");

  const bgImage = useMemo(() => {
    const idx =
      Math.abs((currentRegion || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) %
      BG_IMAGES.length;
    return BG_IMAGES[idx];
  }, [currentRegion]);

  const selectedCity = cities.find((c) => c.id === selectedCityId);

  const handleCityChange = (id) => {
    setSelectedCityId(id);
    const city = cities.find((c) => c.id === id);
    if (city && onCitySelect) onCitySelect(city);
  };

  const handleBannerClick = () => {
    if (selectedCity && onCitySelect) onCitySelect(selectedCity);
    if (onViewEvents) onViewEvents();
  };

  if (cityOptions.length === 0) return null;

  return (
    <section className="px-4">
      <div
        className="group relative z-20 cursor-pointer overflow-visible rounded-[20px]"
        style={{ minHeight: 220 }}
        onClick={handleBannerClick}
        role="button"
        aria-label={`View events near ${selectedCity?.name || "you"}`}
      >
        <div className="absolute inset-0 overflow-hidden rounded-[20px] border border-white/[0.08]">
          <div
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `url(${bgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(20px) brightness(0.28) saturate(1.02)",
            }}
            aria-hidden="true"
          />

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.4) 38%, rgba(0,0,0,0.86) 100%)",
            }}
            aria-hidden="true"
          />

          <div
            className="pointer-events-none absolute inset-0 rounded-[20px]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}
            aria-hidden="true"
          />
        </div>

        <div className="relative z-10 flex h-full min-h-[220px] flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-white/35" />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
                {selectedCity?.region || currentRegion || "Your Area"}
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/75 transition-colors group-hover:border-white/20 group-hover:text-white">
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>

          <div className="my-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Events in
            </p>
            <h3
              className="max-w-[220px] text-white font-black tracking-tight leading-[0.92]"
              style={{ fontSize: "clamp(2rem, 8vw, 3.2rem)" }}
            >
              {selectedCity?.name || "Your City"}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-6" onClick={(e) => e.stopPropagation()}>
            <PillDropdown
              value={selectedCityId}
              options={cityOptions}
              onChange={handleCityChange}
            />
            <PillDropdown
              value={selectedTime}
              options={TIME_FILTERS}
              onChange={setSelectedTime}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
