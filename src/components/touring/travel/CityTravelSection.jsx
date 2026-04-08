import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getCitiesForRegion } from "@/lib/regionTravel";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export default function CityTravelSection({
  currentRegion,
  currentCity,
  homeCity,
  sceneData,
  profile,
  onCityUpdate,
}) {
  const [travelingToCity, setTravelingToCity] = useState(null);
  const [cityMessage, setCityMessage] = useState(null);
  const [cityMessageTone, setCityMessageTone] = useState("neutral");

  const cities = useMemo(() => {
    const staticCities = getCitiesForRegion(currentRegion) || [];
    const liveScenes = sceneData?.scenes ?? [];
    const liveReps = sceneData?.playerReps ?? [];

    return staticCities.map((cityEntry) => {
      const scene = liveScenes.find((s) => (s.city_name || s.name) === cityEntry.name);
      const rep = liveReps.find((r) => r.city_id === scene?.id);

      return {
        name: cityEntry.name,
        genres: cityEntry.genres || [],
        vibe: scene?.vibe || scene?.city_vibe || null,
        trending_genre: scene?.trending_genre || null,
        scene_tier: scene?.scene_tier || null,
        rep_score: Math.round(Number(rep?.reputation_score || 0)),
        isCurrent: cityEntry.name === currentCity,
        isHome: cityEntry.name === homeCity,
      };
    });
  }, [currentRegion, currentCity, homeCity, sceneData]);

  const handleCityTravel = async (cityName) => {
    if (!profile?.id || travelingToCity) return;

    setTravelingToCity(cityName);
    setCityMessage(null);

    try {
      const result = await invokeEdgeFunction("touring", {
        action: "travelToCity",
        artistId: profile.id,
        city: cityName,
      });

      if (!result?.success) {
        setCityMessageTone("warning");
        setCityMessage(result?.error || "City travel failed.");
        return;
      }

      setCityMessageTone("success");
      setCityMessage(`Now based in ${cityName}.`);

      onCityUpdate?.({
        current_city: result.data?.current_city ?? cityName,
        energy: result.data?.energy ?? profile.energy,
      });
    } catch (error) {
      setCityMessageTone("warning");
      setCityMessage(error?.message || "City travel failed.");
    } finally {
      setTravelingToCity(null);
    }
  };

  if (!currentRegion || cities.length === 0) return null;

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] mb-2" style={{ color: "#a78bfa" }}>
        04 · Base City
      </p>

      {cityMessage && (
        <div
          className="rounded-[14px] px-3 py-2 mb-3"
          style={{
            background: cityMessageTone === "success" ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
            border: `1px solid ${cityMessageTone === "success" ? "rgba(52,211,153,0.16)" : "rgba(251,191,36,0.16)"}`,
          }}
        >
          <p className="text-[10px] font-bold" style={{ color: cityMessageTone === "success" ? "#86efac" : "#fcd34d" }}>
            {cityMessage}
          </p>
        </div>
      )}

      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {cities.map((city) => {
          const isActive = travelingToCity === city.name;

          return (
            <button
              key={city.name}
              type="button"
              onClick={() => !city.isCurrent && !isActive && handleCityTravel(city.name)}
              disabled={city.isCurrent || isActive}
              className="w-full text-left"
            >
              <div
                className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
                style={{
                  background: city.isCurrent ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.02)",
                  border: city.isCurrent ? "1px solid rgba(96,165,250,0.18)" : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold text-white truncate">{city.name}</p>
                    {city.isCurrent && (
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]" style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}>
                        Here
                      </span>
                    )}
                    {city.isHome && (
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]" style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                        Home
                      </span>
                    )}
                    {city.scene_tier && (
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-black" style={{ background: "rgba(255,255,255,0.05)", color: "#6b7280" }}>
                        T{city.scene_tier}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {city.genres.slice(0, 2).map((genre) => (
                      <span key={genre} className="text-[9px]" style={{ color: "#6b7280" }}>{genre}</span>
                    ))}
                    {city.vibe && <span className="text-[9px]" style={{ color: "#4b5563" }}>· {city.vibe}</span>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {city.rep_score > 0 && (
                    <p className="text-[10px] font-black" style={{ color: city.rep_score >= 60 ? "#34d399" : city.rep_score >= 30 ? "#a78bfa" : "#6b7280" }}>
                      {city.rep_score} rep
                    </p>
                  )}
                </div>

                {isActive ? (
                  <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-purple-400/40 border-t-purple-400 animate-spin" />
                ) : !city.isCurrent ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "#374151" }} />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
