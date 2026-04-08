import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { buildSceneReportCities } from "@/lib/soundburstCityHelpers";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const TIME_FILTERS = [
  { id: "today",     label: "TODAY" },
  { id: "this_week", label: "THIS WEEK" },
  { id: "this_month",label: "THIS MONTH" },
  { id: "upcoming",  label: "UPCOMING" },
];

// Atmospheric background images — concert / crowd energy, very dark
const BG_IMAGES = [
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=60",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=60",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=60",
  "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800&q=60",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A minimal pill-shaped dropdown trigger.
 * Opens an absolutely-positioned list; closes on outside click via useRef.
 */
function PillDropdown({ value, options, onChange, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/[0.16] border border-white/[0.12] transition-colors"
      >
        {Icon && <Icon className="w-3 h-3 text-white/60 flex-shrink-0" />}
        <span className="text-white text-[11px] font-semibold tracking-widest">
          {selected.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="absolute left-0 top-full mt-1.5 min-w-[140px] bg-[#1a1a24] border border-white/[0.1] rounded-xl shadow-2xl z-30 overflow-hidden py-1">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={[
                  "w-full text-left px-3 py-2 text-[11px] font-semibold tracking-widest transition-colors",
                  opt.id === value
                    ? "text-white bg-white/10"
                    : "text-white/50 hover:text-white hover:bg-white/[0.06]",
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * EventsNearYou
 *
 * A cinematic banner section mimicking SoundCloud's "Events Near You".
 * Displays a heavily-blurred atmospheric background image, bold location
 * headline, and two compact pill dropdowns for city and time filtering.
 *
 * @param {string|undefined} currentRegion  — player's current region
 * @param {Function} onCitySelect           — called with city object on click
 * @param {Function} onViewEvents           — called when the section is actioned (nav to events)
 */
export default function EventsNearYou({ currentRegion, onCitySelect, onViewEvents }) {
  // Derive city list from the same helper used by SceneReportCarousel
  const cities = useMemo(() => {
    const all = buildSceneReportCities(currentRegion);
    // Home-region cities first, then alphabetical
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

  const [selectedCityId, setSelectedCityId]   = useState(() => cities.find((c) => c.isHomeRegion)?.id || cities[0]?.id || "");
  const [selectedTime, setSelectedTime]       = useState("this_week");
  // Cycle through bg images deterministically per region so it's stable
  const bgImage = useMemo(() => {
    const idx = Math.abs((currentRegion || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % BG_IMAGES.length;
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
    <section className="px-4 space-y-3">
      {/* Section label row */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-white text-lg font-bold">Events Near You</h2>
        <button
          onClick={handleBannerClick}
          className="text-xs text-white/40 hover:text-white transition-colors"
        >
          See all
        </button>
      </div>

      {/* Banner card */}
      <div
        className="relative rounded-2xl overflow-hidden border border-white/[0.08] cursor-pointer group"
        style={{ minHeight: 180 }}
        onClick={handleBannerClick}
        role="button"
        aria-label={`View events near ${selectedCity?.name || "you"}`}
      >
        {/* Blurred atmospheric background */}
        <div
          className="absolute inset-0 scale-110"
          style={{
            backgroundImage: `url(${bgImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(22px) brightness(0.45) saturate(1.3)",
          }}
          aria-hidden="true"
        />

        {/* Vignette gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.65) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Subtle inner border glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)" }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 p-5 flex flex-col justify-between h-full" style={{ minHeight: 180 }}>
          {/* Top: location pin */}
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-white/50" />
            <span className="text-white/50 text-[11px] tracking-widest font-medium uppercase">
              {selectedCity?.region || currentRegion || "Your Area"}
            </span>
          </div>

          {/* Centre: main headline */}
          <div className="my-4">
            <p className="text-white/50 text-xs font-semibold tracking-[0.2em] uppercase mb-1">
              Events in
            </p>
            <h3
              className="text-white font-black leading-none tracking-tight"
              style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}
            >
              {selectedCity?.name || "Your City"}
            </h3>
          </div>

          {/* Bottom: dropdowns — stop propagation so clicks don't fire handleBannerClick */}
          <div
            className="flex items-center gap-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <PillDropdown
              value={selectedCityId}
              options={cityOptions}
              onChange={handleCityChange}
              icon={MapPin}
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
