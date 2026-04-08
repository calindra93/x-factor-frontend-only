import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { getCitiesForRegion } from "@/lib/regionTravel";
import { ChevronRight, MapPin, DollarSign, Info, Check, Play, AlertCircle, Lock, Users, UserPlus } from "lucide-react";
import TourPoster from "./TourPoster";

// Steps: 1. Tour Name, 2. Category, 3. Route/Type, 4. Setlist, 5. Merch, 6. Strategy, 7. Crew, 8. Sponsor, 9. Opening Acts, 10. Review
const STEPS = [
  { id: 'name', label: 'Tour Name' },
  { id: 'category', label: 'Category' },
  { id: 'route', label: 'Route & Type' },
  { id: 'setlist', label: 'Setlist' },
  { id: 'merch', label: 'Merch' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'crew', label: 'Crew' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'openers', label: 'Opening Acts' },
  { id: 'review', label: 'Review' }
];

export default function TouringWizard({ profile, onCancel, onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [songs, setSongs] = useState([]);
  const [merch, setMerch] = useState([]);
  
  // Form State
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedSongs, setSelectedSongs] = useState([]);
  const [selectedMerch, setSelectedMerch] = useState([]);
  const [customTourName, setCustomTourName] = useState('');
  const [strategy, setStrategy] = useState({
    pacing: 'normal',
    production: 'basic',
    ticketPrice: 25
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Expansion state
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [crewPool, setCrewPool] = useState([]);
  const [selectedCrew, setSelectedCrew] = useState([]);
  const [crewMaxSlots, setCrewMaxSlots] = useState(3);
  const [sponsors, setSponsors] = useState([]);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [loadingSponsors, setLoadingSponsors] = useState(false);
  const [openingActCandidates, setOpeningActCandidates] = useState([]);
  const [selectedOpeningActs, setSelectedOpeningActs] = useState([]);
  const [loadingOpeners, setLoadingOpeners] = useState(false);
  const [sceneDataByRegion, setSceneDataByRegion] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (step === 8 && selectedRoute) {
      loadOpeningActCandidates();
    }
  }, [step, selectedRoute?.region, profile?.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch available routes from backend logic
      const result = await invokeEdgeFunction('touring', { 
        action: 'generateRoutes', 
        artistId: profile.id 
      });
      
      if (!result.success) {
        console.error('Failed to load routes:', result.error);
        setError(result.error || 'Failed to load tour routes');
        return;
      }
      
      // result.data contains the routes array
      const validRoutes = Array.isArray(result.data) ? result.data : [];
      setRoutes(validRoutes);
      const uniqueRegions = [...new Set(validRoutes.map((route) => route?.region).filter(Boolean))];
      if (profile?.id && uniqueRegions.length > 0) {
        const sceneEntries = await Promise.all(
          uniqueRegions.map(async (region) => {
            try {
              const sceneResult = await invokeEdgeFunction('touring', {
                action: 'getCitySceneData',
                artistId: profile.id,
                region,
              });
              return [region, sceneResult.success ? (sceneResult.data || {}) : {}];
            } catch {
              return [region, {}];
            }
          })
        );
        setSceneDataByRegion(Object.fromEntries(sceneEntries));
      }
      
      // Fetch player's songs for setlist
      const songsData = await base44.entities.Song.filter({ artist_id: profile.id });
      
      // Safety check: songsData MUST be an array
      const validSongs = Array.isArray(songsData) ? songsData : [];
      
      // Fetch release data for songs to get stream counts
      let songsWithStreams = [];
      if (validSongs.length > 0) {
        songsWithStreams = await Promise.all(
          validSongs.map(async (song) => {
            let streams = 0;
            if (song && song.release_id) {
              try {
                const releaseData = await base44.entities.Release.filter({ id: song.release_id });
                if (releaseData && releaseData.length > 0) {
                  streams = releaseData[0].lifetime_streams || 0;
                }
              } catch {
                console.warn('Failed to fetch release data for song:', song.id);
              }
            }
            return { ...song, streams };
          })
        );
      }
      
      setSongs(songsWithStreams);
      
      // Pre-select some songs if any
      if (songsWithStreams.length > 0) {
        setSelectedSongs(songsWithStreams.slice(0, 10).map(s => s.id));
      }
      
      // Fetch artist's merch for tour selection
      const merchData = await base44.entities.Merch.filter({ 
        artist_id: profile.id, 
        status: 'Active' 
      });
      
      // Safety check: merchData MUST be an array
      const validMerch = Array.isArray(merchData) ? merchData : [];
      setMerch(validMerch);

      // Fetch tour categories
      try {
        const catResult = await invokeEdgeFunction('touring', {
          action: 'getCategories',
          artistId: profile.id,
        });
        if (catResult?.data?.categories) {
          setCategories(catResult.data.categories);
        }
      } catch { console.warn('Failed to load categories'); }
    } catch (err) {
      console.error("Failed to load wizard data", err);
      setError("Failed to load touring options. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!selectedRoute) return;
    
    try {
      setSubmitting(true);
      const result = await invokeEdgeFunction('touring', {
        action: 'createTour',
        artistId: profile.id,
        routeId: selectedRoute.id,
        setlist: selectedSongs,
        strategy: strategy,
        customTourName: customTourName.trim(),
        selectedMerch: selectedMerch,
        categoryId: selectedCategory?.id || null,
        selectedCrew: selectedCrew,
        selectedSponsor: selectedSponsor,
        openingActDrafts: selectedOpeningActs.map((opener) => ({
          opener_id: opener.id,
          revenue_split: opener.revenueSplit,
          candidate_snapshot: {
            artist_name: opener.artist_name,
            region: opener.region,
            career_stage: opener.career_stage,
            followers: opener.followers || opener.fans || 0,
            genre: opener.genre,
          },
        })),
      });
      
      if (!result.success) {
        console.error(`Failed to create tour (${result.traceId}):`, result.error);
        setError(result.error || "Failed to launch tour");
        setSubmitting(false);
        return;
      }
      
      onComplete();
    } catch (err) {
      console.error("Failed to create tour", err);
      setError(err.message || "Failed to launch tour");
    } finally {
      setSubmitting(false);
    }
  };

  // --- RENDERERS ---

  const renderTourNameStep = () => (
    <div className="space-y-4">
      <h3 className="text-white text-lg font-bold">Name Your Tour</h3>
      <p className="text-gray-400 text-sm">Give your tour a unique name that represents your journey and brand.</p>
      
      <div className="space-y-2">
        <label className="text-sm text-gray-300 font-medium">Tour Name *</label>
        <input 
          type="text"
          value={customTourName}
          onChange={(e) => setCustomTourName(e.target.value)}
          placeholder="Enter your tour name..."
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:bg-white/15 transition-colors"
          maxLength={100}
        />
        <div className="text-xs text-gray-500">
          {customTourName.length}/100 characters
        </div>
      </div>
      
      {/* Tour name examples */}
      <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl">
        <p className="text-xs text-gray-400 mb-2">Get inspired:</p>
        <div className="flex flex-wrap gap-2">
          {[
            "Summer Vibes Tour",
            "First Headliner",
            "World Domination",
            "Acoustic Sessions",
            "Electric Nights",
            "The Comeback"
          ].map(example => (
            <button
              key={example}
              onClick={() => setCustomTourName(example)}
              className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-lg text-xs text-purple-300 hover:bg-purple-600/30 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOpeningActsStep = () => {
    const selectedIds = new Set(selectedOpeningActs.map((opener) => opener.id));
    const canSelectMore = selectedOpeningActs.length < 2;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-white text-lg font-bold">Opening Acts</h3>
            <p className="text-gray-400 text-sm">Invite up to two openers from your touring region. Each opener gets their own split offer.</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Selected</div>
            <div className="text-xl font-bold text-purple-400">{selectedOpeningActs.length}/2</div>
          </div>
        </div>

        {selectedRoute?.region && (
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 flex items-center justify-between">
            <span>Shortlist filtered for <span className="text-white font-medium">{selectedRoute.region}</span> plus stage/follower fit.</span>
            <button onClick={loadOpeningActCandidates} className="text-purple-300 hover:text-white transition-colors">Refresh</button>
          </div>
        )}

        {loadingOpeners ? (
          <div className="text-center py-8 text-gray-500 text-sm">Finding compatible opening acts...</div>
        ) : openingActCandidates.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-white/10 rounded-xl bg-white/5">
            <Users className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm text-gray-400">No compatible opener candidates found yet.</p>
            <p className="text-xs mt-1">Try a different route/region or continue without openers.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openingActCandidates.map((candidate) => {
              const isSelected = selectedIds.has(candidate.id);
              const selectedEntry = selectedOpeningActs.find((opener) => opener.id === candidate.id);
              const followerCount = Number(candidate.followers ?? candidate.fans ?? 0);
              return (
                <div key={candidate.id} className={`rounded-xl border p-3 transition-colors ${isSelected ? 'bg-purple-600/15 border-purple-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{candidate.artist_name || 'Artist'}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {candidate.region || 'Unknown region'} • {candidate.career_stage || 'Unknown stage'} • {candidate.genre || 'Unknown genre'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{followerCount.toLocaleString()} followers</div>
                    </div>
                    <button
                      onClick={() => {
                        if (isSelected) {
                          setSelectedOpeningActs((prev) => prev.filter((opener) => opener.id !== candidate.id));
                          return;
                        }
                        if (!canSelectMore) return;
                        setSelectedOpeningActs((prev) => ([
                          ...prev,
                          { ...candidate, revenueSplit: 0.2 },
                        ]));
                      }}
                      disabled={!isSelected && !canSelectMore}
                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: isSelected ? 'rgba(239,68,68,0.16)' : 'rgba(147,51,234,0.18)', color: '#fff' }}
                    >
                      {isSelected ? 'Remove' : 'Select'}
                    </button>
                  </div>

                  {isSelected && selectedEntry && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="flex items-center gap-1"><UserPlus className="w-3 h-3" /> Revenue Split Offer</span>
                        <span className="text-white font-medium">{Math.round(selectedEntry.revenueSplit * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        step="1"
                        value={Math.round(selectedEntry.revenueSplit * 100)}
                        onChange={(e) => {
                          const pct = Number(e.target.value) / 100;
                          setSelectedOpeningActs((prev) => prev.map((opener) => opener.id === candidate.id ? { ...opener, revenueSplit: pct } : opener));
                        }}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderRouteStep = () => (
    <div className="space-y-4">
      <h3 className="text-white text-lg font-bold">Choose your Tour Route</h3>
      <p className="text-gray-400 text-sm">Select a region and tour type based on your current career standing.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {(Array.isArray(routes) ? routes : []).length === 0 && (
          <div className="col-span-2 text-center py-10 text-gray-500">
            <div className="text-3xl mb-3">🗺️</div>
            <div className="text-sm font-medium text-gray-400">No tour routes available</div>
            <div className="text-xs mt-1">Build your fanbase and income to unlock touring options</div>
          </div>
        )}
        {(Array.isArray(routes) ? routes : []).map(route => {
          const isSelected = selectedRoute?.id === route.id;
          const affordableFunds = Number(profile?.income ?? profile?.cash_balance ?? 0) || 0;
          const affordable = affordableFunds >= route.base_cost;
          const regionCities = getCitiesForRegion(route.region);
          const sceneData = sceneDataByRegion[route.region] || {};
          const reps = Array.isArray(sceneData.playerReps) ? sceneData.playerReps : [];
          const scenes = Array.isArray(sceneData.scenes) ? sceneData.scenes : [];
          const matchingCities = regionCities.filter((city) => city.genres.includes(profile?.genre));
          const trendingCities = scenes.filter((scene) => scene?.trending_genre && scene.trending_genre === profile?.genre);
          const averageRep = reps.length > 0 ? Math.round(reps.reduce((sum, rep) => sum + (Number(rep.reputation_score) || 0), 0) / reps.length) : 0;
          const unlockedVenueTier = averageRep >= 85 ? 'Stadiums' : averageRep >= 65 ? 'Arenas' : averageRep >= 40 ? 'Theaters' : averageRep >= 20 ? 'Clubs' : 'Dive Bars';
          const fitLabel = matchingCities.length >= 2 || trendingCities.length >= 2 ? 'Strong Fit' : matchingCities.length === 1 || trendingCities.length === 1 ? 'Mixed Fit' : 'Weak Fit';
          const fitTone = fitLabel === 'Strong Fit' ? 'text-green-300 border-green-500/20 bg-green-500/10' : fitLabel === 'Mixed Fit' ? 'text-yellow-300 border-yellow-500/20 bg-yellow-500/10' : 'text-red-300 border-red-500/20 bg-red-500/10';
          const strongestCity = matchingCities[0]?.name || trendingCities[0]?.city_name || regionCities[0]?.name || route.region;
          
          return (
            <div 
              key={route.id}
              onClick={() => affordable && setSelectedRoute(route)}
              className={`
                relative p-4 rounded-xl border transition-all cursor-pointer
                ${isSelected 
                  ? 'bg-purple-600/20 border-purple-500' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'}
                ${!affordable ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-white font-semibold">{route.name}</h4>
                {isSelected && <div className="bg-purple-500 rounded-full p-1"><Check className="w-3 h-3 text-white" /></div>}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-1 rounded-full text-[10px] border ${fitTone}`}>{fitLabel}</span>
                <span className="px-2 py-1 rounded-full text-[10px] border border-white/10 bg-white/5 text-gray-300">Rep {averageRep}</span>
                <span className="px-2 py-1 rounded-full text-[10px] border border-white/10 bg-white/5 text-gray-300">{unlockedVenueTier}</span>
              </div>
              
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> {route.region}
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3 h-3" /> Cost: <span className={affordable ? 'text-white' : 'text-red-400'}>${route.base_cost.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3 h-3" /> Est. Shows: {route.estimated_shows}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-[11px] text-gray-400">
                <div>Best current scene angle: <span className="text-white">{strongestCity}</span></div>
                <div>{matchingCities.length > 0 ? `${matchingCities.length} city match${matchingCities.length > 1 ? 'es' : ''} for ${profile?.genre}` : `No direct ${profile?.genre || 'genre'} strongholds in this route yet.`}</div>
                <div>{averageRep >= 40 ? 'You already have enough local rep to feel this route in venue access.' : 'Low local rep means this route is more about planting flags than maximizing rooms.'}</div>
              </div>
            </div>
          );
        })}
      </div>
      {selectedRoute && (() => {
        const selectedSceneData = sceneDataByRegion[selectedRoute.region] || {};
        const selectedReps = Array.isArray(selectedSceneData.playerReps) ? selectedSceneData.playerReps : [];
        const selectedScenes = Array.isArray(selectedSceneData.scenes) ? selectedSceneData.scenes : [];
        const topScene = selectedScenes.find((scene) => scene?.trending_genre === profile?.genre) || selectedScenes[0];
        const averageRep = selectedReps.length > 0 ? Math.round(selectedReps.reduce((sum, rep) => sum + (Number(rep.reputation_score) || 0), 0) / selectedReps.length) : 0;
        return (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="text-white text-sm font-semibold">Scene Outlook: {selectedRoute.region}</div>
            <div className="text-xs text-gray-400">Average regional rep: <span className="text-white">{averageRep}</span> • Current venue footing: <span className="text-white">{averageRep >= 40 ? 'Playable advantage' : 'Still building'}</span></div>
            <div className="text-xs text-gray-400">Best city angle: <span className="text-white">{topScene?.city_name || getCitiesForRegion(selectedRoute.region)[0]?.name || selectedRoute.region}</span>{topScene?.trending_genre ? ` • Trending ${topScene.trending_genre}` : ''}</div>
            <div className="text-xs text-gray-500">Use the Scenes tab for city-by-city rep, contacts, and venue unlock breakdowns before you lock the route.</div>
          </div>
        );
      })()}
      {routes.length > 0 && routes.every(r => (Number(profile?.income ?? profile?.cash_balance ?? 0) || 0) < r.base_cost) && (
        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex gap-2 items-start">
          <span className="text-yellow-400 text-sm">💡</span>
          <p className="text-xs text-yellow-300">You need more funds to go on tour. Keep releasing music and collecting streaming income!</p>
        </div>
      )}
    </div>
  );

  const renderSetlistStep = () => {
    // Calculate "Setlist Power" roughly
    const setlistPower = selectedSongs.length * 10; 
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-white text-lg font-bold">Build Setlist</h3>
            <p className="text-gray-400 text-sm">Select songs to perform. Hits boost hype!</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Setlist Power</div>
            <div className="text-xl font-bold text-purple-400">{setlistPower}</div>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl border border-white/10 max-h-[400px] overflow-y-auto p-2">
          {(Array.isArray(songs) ? songs : []).length === 0 ? (
            <div className="text-center py-8 text-gray-500">No songs recorded yet!</div>
          ) : (
            (Array.isArray(songs) ? songs : [])
              .map(song => {
                if (!song) return null;
                const isSelected = selectedSongs.includes(song.id);
                return (
                  <div 
                    key={song.id}
                    onClick={() => {
                      if (isSelected) setSelectedSongs(prev => prev.filter(id => id !== song.id));
                      else setSelectedSongs(prev => [...prev, song.id]);
                    }}
                    className={`
                      flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer transition-colors
                      ${isSelected ? 'bg-purple-600/20 border border-purple-500/30' : 'bg-black/20 hover:bg-white/5 border border-transparent'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-600'}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium">{song.title}</div>
                        <div className="text-xs text-gray-500">{song.genre} • {N(song.quality)} Quality</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {N(song.streams).toLocaleString()} streams
                    </div>
                  </div>
                );
              })
              .filter(Boolean)
          )}
        </div>
        <div className="text-xs text-gray-500 text-center">
          {selectedSongs.length} songs selected
        </div>
      </div>
    );
  };

  const renderMerchStep = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white text-lg font-bold">Select Tour Merch</h3>
          <p className="text-gray-400 text-sm">Choose merch to sell on tour. Fans love tour-exclusive items!</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Items Selected</div>
          <div className="text-xl font-bold text-purple-400">{selectedMerch.length}</div>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 max-h-[400px] overflow-y-auto p-2">
        {(Array.isArray(merch) ? merch : []).length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="mb-4">No merch available!</div>
            <div className="text-xs">Create merch in the Xtras app to sell on tour</div>
          </div>
        ) : (
          (Array.isArray(merch) ? merch : []).map(item => {
            const isSelected = selectedMerch.includes(item.id);
            const stock = Number(item.stock || 0);
            const sold = Number(item.units_sold || item.total_units_sold || 0);
            const price = Number(item.price_per_unit || 0);
            
            return (
              <div 
                key={item.id}
                onClick={() => {
                  if (isSelected) setSelectedMerch(prev => prev.filter(id => id !== item.id));
                  else setSelectedMerch(prev => [...prev, item.id]);
                }}
                className={`
                  flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer transition-colors
                  ${isSelected ? 'bg-purple-600/20 border border-purple-500/30' : 'bg-black/20 hover:bg-white/5 border border-transparent'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-600'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{item.name || item.project_name || "Untitled Drop"}</div>
                    <div className="text-xs text-gray-500">{item.merch_type || 'T-Shirt'} • ${price} • {stock} in stock</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {sold} sold
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="text-xs text-gray-500 text-center">
        {selectedMerch.length} merch items selected
      </div>
    </div>
  );

  // --- EXPANSION DATA LOADERS ---

  const loadCrewPool = async () => {
    if (crewPool.length > 0) return; // Already loaded
    setLoadingCrew(true);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'generateCrewPool',
        artistId: profile.id,
        tourCategoryId: selectedCategory?.id || 'standard_run',
      });
      if (result?.data?.pool) {
        setCrewPool(result.data.pool);
        setCrewMaxSlots(result.data.maxSlots || 3);
      }
    } catch (e) { console.warn('Failed to load crew pool:', e); }
    setLoadingCrew(false);
  };

  const loadSponsors = async () => {
    if (sponsors.length > 0) return;
    setLoadingSponsors(true);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'getSponsors',
        artistId: profile.id,
        tourCategoryId: selectedCategory?.id || 'standard_run',
      });
      if (result?.data?.sponsors) {
        setSponsors(result.data.sponsors);
      }
    } catch (e) { console.warn('Failed to load sponsors:', e); }
    setLoadingSponsors(false);
  };

  const loadOpeningActCandidates = async () => {
    if (!profile?.id || !selectedRoute?.region || loadingOpeners) return;
    setLoadingOpeners(true);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'getOpeningActCandidates',
        artistId: profile.id,
        region: selectedRoute.region,
      });
      setOpeningActCandidates(Array.isArray(result?.data?.candidates) ? result.data.candidates : []);
    } catch (e) {
      console.warn('Failed to load opening act candidates:', e);
      setOpeningActCandidates([]);
    }
    setLoadingOpeners(false);
  };

  // --- EXPANSION RENDERERS ---

  const renderCategoryStep = () => (
    <div className="space-y-4">
      <h3 className="text-white text-lg font-bold">Choose Tour Category</h3>
      <p className="text-gray-400 text-sm">Category determines crew slots, risk level, and fan segment bonuses.</p>
      
      <div className="grid grid-cols-1 gap-3 mt-4">
        {categories.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">Loading categories...</div>
        )}
        {categories.map(cat => {
          const isSelected = selectedCategory?.id === cat.id;
          const locked = !cat.accessible;
          return (
            <div 
              key={cat.id}
              onClick={() => !locked && setSelectedCategory(cat)}
              className={`
                relative p-4 rounded-xl border transition-all
                ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                ${isSelected 
                  ? 'bg-purple-600/20 border-purple-500' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'}
              `}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  {locked && <Lock className="w-3.5 h-3.5 text-gray-500" />}
                  <h4 className="text-white font-semibold text-sm">{cat.label || cat.id}</h4>
                </div>
                {isSelected && <div className="bg-purple-500 rounded-full p-1"><Check className="w-3 h-3 text-white" /></div>}
              </div>
              <p className="text-xs text-gray-400 mb-2">{cat.description || ''}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-0.5 bg-white/5 rounded text-gray-300">Risk: {cat.risk_level || 'medium'}</span>
                <span className="px-2 py-0.5 bg-white/5 rounded text-gray-300">Crew: {cat.max_crew_slots || 3}</span>
                {cat.revenue_mult && <span className="px-2 py-0.5 bg-green-500/10 rounded text-green-300">Revenue ×{cat.revenue_mult}</span>}
              </div>
              {locked && cat.locked_reason && (
                <p className="text-xs text-red-400 mt-1">{cat.locked_reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCrewStep = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white text-lg font-bold">Hire Crew</h3>
          <p className="text-gray-400 text-sm">Select crew members for your tour. Better crew = better shows.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Slots</div>
          <div className="text-xl font-bold text-purple-400">{selectedCrew.length}/{crewMaxSlots}</div>
        </div>
      </div>

      {loadingCrew ? (
        <div className="text-center py-8 text-gray-500 text-sm">Generating crew pool...</div>
      ) : crewPool.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <button onClick={loadCrewPool} className="px-4 py-2 bg-purple-600/30 border border-purple-500/50 rounded-lg text-sm text-purple-300 hover:bg-purple-600/40">
            Generate Crew Pool
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {crewPool.map((crew, idx) => {
            const isSelected = selectedCrew.some(c => c.name === crew.name && c.specialty === crew.specialty);
            const atMax = selectedCrew.length >= crewMaxSlots && !isSelected;
            return (
              <div 
                key={idx}
                onClick={() => {
                  if (atMax) return;
                  if (isSelected) {
                    setSelectedCrew(prev => prev.filter(c => !(c.name === crew.name && c.specialty === crew.specialty)));
                  } else {
                    setSelectedCrew(prev => [...prev, crew]);
                  }
                }}
                className={`
                  flex items-center justify-between p-3 rounded-lg border transition-colors
                  ${atMax ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isSelected ? 'bg-purple-600/20 border-purple-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-600'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{crew.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{(crew.specialty || '').replace(/_/g, ' ')} • Quality {crew.quality || 50}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-yellow-400">${(crew.salary_per_turn || 0).toLocaleString()}/turn</div>
                  <div className="text-xs text-gray-500">Morale {crew.morale || 70}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-gray-500 text-center">Crew salary is deducted each turn from tour revenue</p>
    </div>
  );

  const renderSponsorStep = () => (
    <div className="space-y-4">
      <h3 className="text-white text-lg font-bold">Tour Sponsorship</h3>
      <p className="text-gray-400 text-sm">Choose a sponsor for extra income — but beware of identity clashes!</p>

      {loadingSponsors ? (
        <div className="text-center py-8 text-gray-500 text-sm">Finding sponsors...</div>
      ) : sponsors.length === 0 ? (
        <div className="text-center py-8 text-gray-500 space-y-3">
          <button onClick={loadSponsors} className="px-4 py-2 bg-green-600/30 border border-green-500/50 rounded-lg text-sm text-green-300 hover:bg-green-600/40">
            Find Sponsors
          </button>
          <p className="text-xs text-gray-600">Or skip this step — sponsors are optional</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Option to skip */}
          <div 
            onClick={() => setSelectedSponsor(null)}
            className={`p-3 rounded-lg border transition-colors cursor-pointer ${!selectedSponsor ? 'bg-gray-600/20 border-gray-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
          >
            <div className="text-sm text-gray-300 font-medium">No Sponsor</div>
            <div className="text-xs text-gray-500">Keep full creative control, no clash risk</div>
          </div>
          {sponsors.map((sp, idx) => {
            const isSelected = selectedSponsor?.brand_name === sp.brand_name;
            return (
              <div 
                key={idx}
                onClick={() => setSelectedSponsor(sp)}
                className={`
                  p-3 rounded-lg border transition-colors cursor-pointer
                  ${isSelected ? 'bg-green-600/20 border-green-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                `}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="text-white text-sm font-medium">{sp.brand_name}</div>
                  <div className="text-green-400 text-sm font-bold">+${(sp.payout || 0).toLocaleString()}</div>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(sp.alignment_tags || []).map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-400">{tag}</span>
                  ))}
                  <span className={`px-2 py-0.5 rounded text-xs ${sp.clash_risk > 0.3 ? 'bg-red-500/10 text-red-300' : sp.clash_risk > 0.15 ? 'bg-yellow-500/10 text-yellow-300' : 'bg-green-500/10 text-green-300'}`}>
                    Clash risk: {Math.round((sp.clash_risk || 0) * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStrategyStep = () => (
    <div className="space-y-6">
      <h3 className="text-white text-lg font-bold">Tour Strategy</h3>

      {/* Ticket Price */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300 font-medium">Ticket Price</label>
        <div className="flex items-center gap-4">
          <input 
            type="range" 
            min="10" max="150" step="5"
            value={strategy.ticketPrice}
            onChange={(e) => setStrategy(s => ({ ...s, ticketPrice: Number(e.target.value) }))}
            className="flex-1 accent-purple-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
          />
          <div className="bg-white/10 px-3 py-1 rounded-lg text-white font-bold w-20 text-center">
            ${strategy.ticketPrice}
          </div>
        </div>
        <p className="text-xs text-gray-500">Higher prices yield more revenue but might reduce attendance.</p>
      </div>

      {/* Production Level */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300 font-medium">Production Level</label>
        <div className="grid grid-cols-3 gap-2">
          {['basic', 'standard', 'spectacular'].map(level => (
            <button
              key={level}
              onClick={() => setStrategy(s => ({ ...s, production: level }))}
              className={`
                py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all
                ${strategy.production === level 
                  ? 'bg-blue-600/20 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}
              `}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">Better production costs more per show but boosts Hype.</p>
      </div>

      {/* Pacing */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300 font-medium">Schedule Pacing</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'relaxed', label: 'Relaxed', desc: 'Low fatigue, lower income' },
            { id: 'normal', label: 'Normal', desc: 'Balanced approach' },
            { id: 'aggressive', label: 'Aggressive', desc: 'High income, high burnout risk' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setStrategy(s => ({ ...s, pacing: opt.id }))}
              className={`
                py-2 px-3 rounded-lg text-xs font-medium border transition-all flex flex-col items-center gap-1
                ${strategy.pacing === opt.id 
                  ? 'bg-amber-600/20 border-amber-500 text-white' 
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}
              `}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    if (!selectedRoute) return null;
    const estRevenue = selectedRoute.estimated_shows * (selectedRoute.capacity || 500) * strategy.ticketPrice * 0.8; // Rough calc

    // Generate mock stops for the poster preview
    const mockStops = Array.from({ length: Math.min(5, selectedRoute.estimated_shows) }).map((_, i) => ({
      city: `${selectedRoute.region} City ${i + 1}`,
      venue: "Tour Venue"
    }));

    // If we have access to real cities for regions, we could use them. 
    // For now, generic names or maybe check if we can map region to some cities.
    const regionCities = {
      'United States': ['New York', 'Los Angeles', 'Chicago', 'Atlanta', 'Nashville'],
      'Canada': ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
      'UK': ['London', 'Manchester', 'Birmingham', 'Glasgow', 'Leeds'],
      'Europe': ['Paris', 'Berlin', 'Amsterdam', 'Barcelona', 'Rome'],
      'Asia': ['Tokyo', 'Seoul', 'Bangkok', 'Singapore', 'Mumbai'],
      'Latin America': ['Mexico City', 'Sao Paulo', 'Buenos Aires', 'Bogota', 'Lima'],
      'Africa': ['Lagos', 'Cape Town', 'Nairobi', 'Accra', 'Cairo'],
      'Oceania': ['Sydney', 'Melbourne', 'Auckland', 'Brisbane', 'Perth']
    };
    
    const cities = regionCities[selectedRoute.region] || [];
    if (cities.length > 0) {
      mockStops.forEach((stop, i) => {
        if (cities[i]) stop.city = cities[i];
      });
    }

    return (
      <div className="space-y-6">
        <h3 className="text-white text-lg font-bold">Review & Launch</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex justify-center">
            <div className="w-full max-w-[280px]">
              <TourPoster 
                tourName={customTourName || selectedRoute.name}
                artistName={profile?.artist_name}
                route={selectedRoute}
                stops={mockStops} 
                theme="purple"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Route</span>
                <span className="text-white font-medium text-right">{selectedRoute.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Upfront Cost</span>
                <span className="text-red-400 font-medium">-${selectedRoute.base_cost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Setlist</span>
                <span className="text-white font-medium">{selectedSongs.length} songs</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Ticket Price</span>
                <span className="text-white font-medium">${strategy.ticketPrice}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-gray-400 text-sm">Est. Gross Revenue</span>
                <span className="text-green-400 font-medium">~${estRevenue.toLocaleString()}</span>
              </div>
              {selectedCategory && (
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400 text-sm">Category</span>
                  <span className="text-purple-300 font-medium">{selectedCategory.label || selectedCategory.id}</span>
                </div>
              )}
              {selectedCrew.length > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400 text-sm">Crew</span>
                  <span className="text-white font-medium">{selectedCrew.length} member{selectedCrew.length > 1 ? 's' : ''}</span>
                </div>
              )}
              {selectedSponsor && (
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400 text-sm">Sponsor</span>
                  <span className="text-green-300 font-medium">{selectedSponsor.brand_name} (+${(selectedSponsor.payout || 0).toLocaleString()})</span>
                </div>
              )}
              {selectedOpeningActs.length > 0 && (
                <div className="py-2 border-b border-white/5">
                  <div className="text-gray-400 text-sm mb-2">Opening Acts</div>
                  <div className="space-y-1.5">
                    {selectedOpeningActs.map((opener) => (
                      <div key={opener.id} className="flex justify-between items-center text-sm">
                        <span className="text-white font-medium">{opener.artist_name}</span>
                        <span className="text-purple-300">{Math.round(opener.revenueSplit * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex gap-3 items-start">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200">
                Launching this tour will deduct <strong>${selectedRoute.base_cost.toLocaleString()}</strong> immediately. 
                Ensure you have enough energy to complete the shows!
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- MAIN RENDER ---

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading tour options...</div>;
  }

  const currentStepMeta = STEPS[step] || STEPS[0];

  return (
    <div className="bg-[#121217] rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold">Plan New Tour</h2>
          <div className="text-xs text-gray-500 mt-1">Step {step + 1} of {STEPS.length}: <span className="text-gray-300">{currentStepMeta.label}</span></div>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm">Cancel</button>
      </div>

      {/* Progress Bar */}
      <div className="border-b border-white/5">
        <div className="flex border-b border-white/5">
          {STEPS.map((s, i) => (
            <div 
              key={s.id}
              className={`flex-1 h-1 ${i <= step ? 'bg-purple-500' : 'bg-white/5'}`}
            />
          ))}
        </div>
        <div className="px-4 py-3 flex gap-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div
              key={`${s.id}_label`}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border ${i === step ? 'bg-purple-600/20 border-purple-500/40 text-white' : i < step ? 'bg-white/10 border-white/10 text-gray-300' : 'bg-white/5 border-white/10 text-gray-500'}`}
            >
              {i + 1}. {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {step === 0 && renderTourNameStep()}
        {step === 1 && renderCategoryStep()}
        {step === 2 && renderRouteStep()}
        {step === 3 && renderSetlistStep()}
        {step === 4 && renderMerchStep()}
        {step === 5 && renderStrategyStep()}
        {step === 6 && renderCrewStep()}
        {step === 7 && renderSponsorStep()}
        {step === 8 && renderOpeningActsStep()}
        {step === 9 && renderReviewStep()}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5 flex justify-between">
        <button
          onClick={handleBack}
          disabled={step === 0 || submitting}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          Back
        </button>
        
        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={
              (step === 0 && !customTourName.trim()) ||
              (step === 1 && !selectedCategory) ||
              (step === 2 && !selectedRoute) ||
              (step === 3 && selectedSongs.length === 0)
            }
            className="px-6 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-500 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {submitting ? 'Launching...' : 'Launch Tour'} <Play className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function N(val) { return Number(val) || 0; }
