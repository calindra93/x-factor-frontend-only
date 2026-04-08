/**
 * touringMapModel.js
 *
 * Converts raw regional demand and tour state into map-friendly records
 * for the WorldMapHome Leaflet surface.
 */

export const REGION_META = [
  { name: "United States", flag: "🇺🇸", color: "#f472b6", latLng: [38, -97] },
  { name: "Canada", flag: "🇨🇦", color: "#fb7185", latLng: [56, -106] },
  { name: "UK", flag: "🇬🇧", color: "#c084fc", latLng: [54, -2] },
  { name: "Europe", flag: "��", color: "#a78bfa", latLng: [50, 10] },
  { name: "Africa", flag: "🌍", color: "#34d399", latLng: [8, 20] },
  { name: "Asia", flag: "🌏", color: "#60a5fa", latLng: [35, 105] },
  { name: "Latin America", flag: "🌎", color: "#fbbf24", latLng: [-15, -55] },
  { name: "Oceania", flag: "�🇺", color: "#38bdf8", latLng: [-25, 135] },
];

const CITY_COORDS = {
  // ---------------------- United States ----------------------
  'New York': [40.7128, -74.006],
  'Los Angeles': [34.0522, -118.2437],
  'Atlanta': [33.749, -84.388],
  'Chicago': [41.8781, -87.6298],
  'Miami': [25.7617, -80.1918],
  'Houston': [29.7604, -95.3698],
  'Nashville': [36.1627, -86.7816],
  'New Orleans': [29.9511, -90.0715],
  'Seattle': [47.6062, -122.3321],
  'Washington D.C.': [38.9072, -77.0369],
  'Philadelphia': [39.9526, -75.1652],
  'Boston': [42.3601, -71.0589],
  'Memphis': [35.1495, -90.049],
  'Austin': [30.2672, -97.7431],
  'Baltimore': [39.2904, -76.6122],
  'Denver': [39.7392, -104.9903],
  'Detroit': [42.3314, -83.0458],
  'Portland': [45.5152, -122.6784],

  // ---------------------- Canada ----------------------
  'Toronto': [43.6532, -79.3832],
  'Montreal': [45.5017, -73.5673],
  'Vancouver': [49.2827, -123.1207],
  'Calgary': [51.0447, -114.0719],
  'Edmonton': [53.5461, -113.4938],
  'Ottawa': [45.4215, -75.6972],
  'Halifax': [44.6488, -63.5752],
  'Winnipeg': [49.8951, -97.1384],

  // ---------------------- UK ----------------------
  'London': [51.5072, -0.1276],
  'Manchester': [53.4808, -2.2426],
  'Glasgow': [55.8642, -4.2518],
  'Birmingham': [52.4862, -1.8904],
  'Liverpool': [53.4084, -2.9916],
  'Bristol': [51.4545, -2.5879],
  'Leeds': [53.8008, -1.5491],
  'Belfast': [54.5973, -5.9301],

  // ---------------------- Europe ----------------------
  'Berlin': [52.52, 13.405],
  'Paris': [48.8566, 2.3522],
  'Amsterdam': [52.3676, 4.9041],
  'Barcelona': [41.3851, 2.1734],
  'Stockholm': [59.3293, 18.0686],
  'Copenhagen': [55.6761, 12.5683],
  'Madrid': [40.4168, -3.7038],
  'Milan': [45.4642, 9.19],
  'Lisbon': [38.7223, -9.1393],
  'Vienna': [48.2082, 16.3738],
  'Brussels': [50.8503, 4.3517],
  'Ibiza': [38.9067, 1.4206],
  'Helsinki': [60.1699, 24.9384],

  // ---------------------- Asia ----------------------
  'Tokyo': [35.6762, 139.6503],
  'Seoul': [37.5665, 126.978],
  'Mumbai': [19.076, 72.8777],
  'Bangkok': [13.7563, 100.5018],
  'Shanghai': [31.2304, 121.4737],
  'Osaka': [34.6937, 135.5023],
  'Busan': [35.1796, 129.0756],
  'Manila': [14.5995, 120.9842],
  'Jakarta': [-6.2088, 106.8456],
  'Chennai': [13.0827, 80.2707],
  'Singapore': [1.3521, 103.8198],
  'Hong Kong': [22.3193, 114.1694],
  'Taipei': [25.033, 121.5654],
  'Beijing': [39.9042, 116.4074],

  // ---------------------- Latin America ----------------------
  'Sao Paulo': [-23.5558, -46.6396],
  'Mexico City': [19.4326, -99.1332],
  'Buenos Aires': [-34.6037, -58.3816],
  'Bogota': [4.711, -74.0721],
  'Guadalajara': [20.6597, -103.3496],
  'San Juan': [18.4655, -66.1057],
  'Medellin': [6.2442, -75.5812],
  'Rio de Janeiro': [-22.9068, -43.1729],
  'Havana': [23.1136, -82.3666],
  'Santo Domingo': [18.4861, -69.9312],
  'Santiago': [-33.4489, -70.6693],
  'Lima': [-12.0464, -77.0428],
  'Kingston': [18.0179, -76.8099],

  // ---------------------- Africa ----------------------
  'Lagos': [6.5244, 3.3792],
  'Johannesburg': [-26.2041, 28.0473],
  'Nairobi': [-1.2921, 36.8219],
  'Accra': [5.6037, -0.187],
  'Abuja': [9.0765, 7.3986],
  'Cape Town': [-33.9249, 18.4241],
  'Durban': [-29.8587, 31.0218],
  'Cairo': [30.0444, 31.2357],
  'Casablanca': [33.5731, -7.5898],
  'Kinshasa': [-4.4419, 15.2663],

  // ---------------------- Oceania ----------------------
  'Sydney': [-33.8688, 151.2093],
  'Melbourne': [-37.8136, 144.9631],
  'Auckland': [-36.8509, 174.7645],
  'Brisbane': [-27.4698, 153.0251],
  'Adelaide': [-34.9285, 138.6007],
  'Perth': [-31.9505, 115.8605],
  'Wellington': [-41.2866, 174.7756],
};

/**
 * City name aliases for normalization.
 * Maps variant spellings to the canonical key in CITY_COORDS.
 * NOTE: Accent/diacritic variants are handled by normalizeCityName() and don't need aliases.
 * NOTE: Punctuation variants (e.g., 'washington, dc' vs 'washington dc') collapse via normalization.
 */
const CITY_ALIASES = {
  // D.C. short form (normalization resolves punctuation variants like 'Washington DC')
  'dc': 'Washington D.C.',
  // UK city qualifier (for inputs like 'Birmingham UK')
  'birmingham uk': 'Birmingham',
  // Common short forms
  'nyc': 'New York',
  'new york city': 'New York',
  'la': 'Los Angeles',
  'philly': 'Philadelphia',
  'nola': 'New Orleans',
  'rio': 'Rio de Janeiro',
  'hk': 'Hong Kong',
  'bkk': 'Bangkok',
  // No-space variants (normalization preserves word boundaries)
  'newyork': 'New York',
  'losangeles': 'Los Angeles',
  'saopaulo': 'Sao Paulo',
  'mexicocity': 'Mexico City',
  'buenosaires': 'Buenos Aires',
  'santodomingo': 'Santo Domingo',
  'capetown': 'Cape Town',
  'hongkong': 'Hong Kong',
  'sanjuan': 'San Juan',
};

/**
 * Normalize a city name: lowercase, strip accents, punctuation, and extra spaces.
 * @param {string} name
 * @returns {string}
 */
function normalizeCityName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[.,'\-()]/g, '')       // strip punctuation
    .replace(/\s+/g, ' ')            // collapse spaces
    .trim();
}

/**
 * Resolve a city name to its canonical CITY_COORDS key.
 * Handles exact match, case-insensitive match, normalized match, and aliases.
 * @param {string} cityName
 * @returns {string|null} canonical key or null if not found
 */
function resolveCanonicalCityKey(cityName) {
  if (!cityName) return null;
  // 1. Exact match
  if (CITY_COORDS[cityName]) return cityName;
  // 2. Case-insensitive exact match
  const lowerInput = cityName.toLowerCase();
  for (const key of Object.keys(CITY_COORDS)) {
    if (key.toLowerCase() === lowerInput) return key;
  }
  // 3. Normalized match
  const normalizedInput = normalizeCityName(cityName);
  for (const key of Object.keys(CITY_COORDS)) {
    if (normalizeCityName(key) === normalizedInput) return key;
  }
  // 4. Alias lookup
  if (CITY_ALIASES[normalizedInput]) return CITY_ALIASES[normalizedInput];
  if (CITY_ALIASES[lowerInput]) return CITY_ALIASES[lowerInput];
  return null;
}

/**
 * Deterministic fallback for unknown cities: offset from region center using city name hash.
 * Produces a distinct point rather than exact center or [0,0].
 * @param {string} cityName
 * @param {number[]} regionLatLng - [lat, lng] of region center
 * @returns {number[]} [lat, lng]
 */
function deterministicRegionFallback(cityName, regionLatLng) {
  if (!regionLatLng || !Array.isArray(regionLatLng) || regionLatLng.length < 2) {
    // Ultimate fallback: use a deterministic offset from [0,0] so it's still visible
    const hash = stringHash(cityName || 'unknown');
    return [(hash % 40) - 20, ((hash >> 8) % 60) - 30];
  }
  const [baseLat, baseLng] = regionLatLng;
  const hash = stringHash(cityName || 'unknown');
  // Offset by up to ±4 degrees lat/lng for visible separation
  const latOffset = ((hash % 80) - 40) / 10;        // -4.0 to +3.9
  const lngOffset = (((hash >> 8) % 80) - 40) / 10; // -4.0 to +3.9
  return [baseLat + latOffset, baseLng + lngOffset];
}

/**
 * Simple string hash for deterministic offsets.
 * @param {string} str
 * @returns {number}
 */
function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < (str?.length || 0); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRegionMeta(regionName) {
  return REGION_META.find((region) => region.name === regionName) || null;
}

/**
 * Get lat/lng for a city, with robust name normalization and deterministic fallback.
 * Never returns [0,0] or exact region center — unknown cities get a distinct offset point.
 * @param {string} cityName
 * @param {string} regionName
 * @returns {number[]} [lat, lng]
 */
export function getCityLatLng(cityName, regionName) {
  // 1. Try canonical lookup with normalization
  const canonicalKey = resolveCanonicalCityKey(cityName);
  if (canonicalKey && CITY_COORDS[canonicalKey]) {
    return CITY_COORDS[canonicalKey];
  }
  // 2. Deterministic fallback — distinct point, not region center or [0,0]
  const regionMeta = getRegionMeta(regionName);
  return deterministicRegionFallback(cityName, regionMeta?.latLng);
}

export function haversineMiles(start, end) {
  if (!Array.isArray(start) || !Array.isArray(end)) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(3958.8 * c);
}

function getCityScore(scene, repScore, profile) {
  const trendingGenre = scene?.trending_genre || '';
  const genreWeights = scene?.genre_weights;
  const profileGenre = profile?.genre || '';
  const trendBoost = trendingGenre === profileGenre ? 18 : 0;
  const genreText = typeof genreWeights === 'string' ? genreWeights : JSON.stringify(genreWeights || {});
  const genreBoost = genreText.includes(profileGenre) ? 10 : 0;
  const tierBoost = Number(scene?.scene_tier || scene?.tier || 1) * 4;
  return repScore + trendBoost + genreBoost + tierBoost;
}

function getDesiredVenueTier(repScore) {
  if (repScore >= 80) return 4;
  if (repScore >= 55) return 3;
  if (repScore >= 25) return 2;
  return 1;
}

function pickWeightedVenue(cityVenues, repScore) {
  if (!Array.isArray(cityVenues) || cityVenues.length === 0) return null;
  const desiredTier = getDesiredVenueTier(repScore);
  const weighted = cityVenues.map((venue) => {
    const tier = Number(venue?.tier || 1);
    const distancePenalty = Math.abs(desiredTier - tier) * 10;
    const capacityWeight = clamp(Math.round((Number(venue?.capacity) || 0) / 400), 1, 50);
    const baseWeight = clamp(60 - distancePenalty + capacityWeight, 5, 100);
    return { venue, weight: baseWeight };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.venue;
  }
  return weighted[0]?.venue || null;
}

function buildConnectorPoints(start, end, bendDirection = 1) {
  if (!Array.isArray(start) || !Array.isArray(end)) return [];
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;
  const midLat = (lat1 + lat2) / 2 + (Math.abs(lon2 - lon1) / 10) * bendDirection;
  const midLon = (lon1 + lon2) / 2;
  return [start, [midLat, midLon], end];
}

function getSceneEntryForCity(cityName, sceneDataByRegion = {}) {
  const regions = Object.entries(sceneDataByRegion || {});
  for (const [regionName, regionData] of regions) {
    const scenes = Array.isArray(regionData?.scenes) ? regionData.scenes : [];
    const scene = scenes.find((entry) => String(entry?.city_name || '').toLowerCase() === String(cityName || '').toLowerCase());
    if (scene) {
      return { regionName, scene, regionData };
    }
  }
  return null;
}

function getDemandLabel(demandScore) {
  if (demandScore >= 80) return 'High Demand';
  if (demandScore >= 55) return 'Steady Demand';
  return 'Low Demand';
}

function getReputationLabel(repScore) {
  if (repScore >= 70) return 'High Reputation';
  if (repScore >= 35) return 'Medium Reputation';
  return 'Low Reputation';
}

function getFanSentimentLabel({ isCompleted, sellThrough, momentum, fatigue }) {
  if (isCompleted && sellThrough >= 0.85) return 'Fans are electric';
  if (momentum >= 80) return 'Fans are leaning in';
  if (fatigue >= 65) return 'Fans are curious, execution matters';
  if (sellThrough >= 0.55) return 'Fans are warming up';
  return 'Fans are still sizing you up';
}

function getCityVibeLabel({ trendingGenre, demandScore, cityName }) {
  if (trendingGenre) return `${trendingGenre} dominant`; 
  if (demandScore >= 80) return `${cityName} is buzzing`; 
  if (demandScore >= 55) return `${cityName} is receptive`; 
  return `${cityName} feels early-stage`;
}

export function buildActiveTourLiveMapModel({
  activeTour = null,
  gigs = [],
  sceneDataByRegion = {},
  demand = {},
} = {}) {
  const sortedGigs = (Array.isArray(gigs) ? gigs : [])
    .slice()
    .sort((a, b) => Number(a?.scheduled_turn || 0) - Number(b?.scheduled_turn || 0));

  const completedStops = Number(activeTour?.completed_stops) || 0;
  const state = activeTour?.state || {};
  const momentum = Number(state?.momentum ?? state?.route_momentum ?? 70) || 70;
  const fatigue = Number(state?.fatigue ?? 0) || 0;
  const health = Number(state?.health ?? state?.morale ?? 80) || 80;
  const currentTurn = completedStops + 1;

  const stops = sortedGigs.map((gig, index) => {
    const cityName = gig?.city || `Stop ${index + 1}`;
    const matchedScene = getSceneEntryForCity(cityName, sceneDataByRegion);
    const regionName = matchedScene?.regionName || activeTour?.region || 'Unknown Region';
    const scene = matchedScene?.scene || null;
    const reps = Array.isArray(matchedScene?.regionData?.playerReps) ? matchedScene.regionData.playerReps : [];
    const repMap = new Map(reps.map((rep) => [rep?.city_id || rep?.city_scene_id, Number(rep?.reputation_score) || 0]));
    const repScore = scene ? (repMap.get(scene?.id) || 0) : 0;
    const regionMeta = getRegionMeta(regionName);
    const latLng = getCityLatLng(cityName, regionName);
    const demandScore = Number(demand?.[regionName] ?? 50) || 50;
    const capacity = Number(gig?.capacity || 0) || 0;
    const ticketsSold = Number(gig?.tickets_sold || 0) || 0;
    const sellThrough = capacity > 0 ? ticketsSold / capacity : 0;
    const isCompleted = String(gig?.status || '').toLowerCase() === 'completed' || index < completedStops;
    const isCurrent = Number(gig?.scheduled_turn || 0) === currentTurn || (!isCompleted && index === completedStops);

    return {
      id: gig?.id || `${regionName}:${cityName}:${index}`,
      index,
      regionName,
      regionFlag: regionMeta?.flag || '🌍',
      regionColor: regionMeta?.color || '#a78bfa',
      latLng,
      cityName,
      venueName: gig?.venue_name || 'Venue TBD',
      scheduledTurn: Number(gig?.scheduled_turn || 0) || 0,
      status: gig?.status || 'scheduled',
      capacity,
      ticketsSold,
      grossRevenue: Number(gig?.gross_revenue || 0) || 0,
      demandScore,
      demandLabel: getDemandLabel(demandScore),
      repScore,
      reputationLabel: getReputationLabel(repScore),
      trendingGenre: scene?.trending_genre || null,
      dominantGenreLabel: scene?.trending_genre ? `${scene.trending_genre} Dominant` : 'Local Scene in Motion',
      fanSentiment: getFanSentimentLabel({ isCompleted, sellThrough, momentum, fatigue }),
      cityVibe: getCityVibeLabel({ trendingGenre: scene?.trending_genre, demandScore, cityName }),
      maxCapacityLabel: capacity > 0 ? `${capacity.toLocaleString()} Max Capacity` : 'Capacity TBD',
      isCompleted,
      isCurrent,
      isUpcoming: !isCompleted && !isCurrent,
      health,
      momentum,
      fatigue,
    };
  });

  const segments = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const start = stops[i];
    const end = stops[i + 1];
    let progressState = 'upcoming';
    if (i < Math.max(completedStops - 1, 0)) {
      progressState = 'completed';
    } else if (i === Math.max(completedStops - 1, 0) && completedStops < stops.length) {
      progressState = 'current';
    }
    segments.push({
      id: `${start.id}->${end.id}`,
      fromStopId: start.id,
      toStopId: end.id,
      points: buildConnectorPoints(start.latLng, end.latLng, i % 2 === 0 ? 1 : -1),
      progressState,
      color: start.regionColor,
      miles: haversineMiles(start.latLng, end.latLng),
    });
  }

  const currentStop = stops.find((stop) => stop.isCurrent) || stops.find((stop) => !stop.isCompleted) || stops[stops.length - 1] || null;

  return {
    stops,
    segments,
    currentStop,
    completedStops,
    totalStops: stops.length,
  };
}

export function buildRouteBuilderDraft({
  tappedRegions = [],
  sceneDataByRegion = {},
  venuesByRegion = {},
  removedStopIds = [],
  profile = null,
  venueSize = null,
} = {}) {
  const removedSet = new Set(Array.isArray(removedStopIds) ? removedStopIds : []);
  const routeRegions = tappedRegions.map((regionName, regionIndex) => {
    const regionMeta = getRegionMeta(regionName);
    const sceneData = sceneDataByRegion[regionName] || {};
    const scenes = Array.isArray(sceneData?.scenes) ? sceneData.scenes : [];
    const reps = Array.isArray(sceneData?.playerReps) ? sceneData.playerReps : [];
    const repMap = new Map(reps.map((rep) => [rep?.city_id || rep?.city_scene_id, Number(rep?.reputation_score) || 0]));
    const sortedScenes = scenes
      .map((scene) => ({
        scene,
        repScore: repMap.get(scene?.id) || 0,
        cityName: scene?.city_name || regionName,
        latLng: getCityLatLng(scene?.city_name, regionName),
      }))
      .sort((a, b) => a.latLng[1] - b.latLng[1]);
    const selectedScenes = sortedScenes.map((entry) => ({
      ...entry,
      cityScore: getCityScore(entry.scene, entry.repScore, profile),
    }));
    const regionVenues = Array.isArray(venuesByRegion[regionName]) ? venuesByRegion[regionName] : [];
    const cityStops = selectedScenes.map((entry, cityIndex) => {
      let cityVenues = regionVenues.filter((venue) => venue?.city === entry.cityName);
      // Filter venues by selected venue size capacity range
      if (venueSize && cityVenues.length > 0) {
        const sizeRanges = {
          bars_clubs: [0, 400],
          mid_sized: [200, 1500],
          large: [3000, 20000],
          arenas_stadiums: [10000, 100000],
        };
        const range = sizeRanges[venueSize];
        if (range) {
          const filtered = cityVenues.filter((v) => {
            const cap = Number(v?.capacity) || 0;
            return cap >= range[0] && cap <= range[1];
          });
          if (filtered.length > 0) cityVenues = filtered;
        }
      }
      const venue = pickWeightedVenue(cityVenues, entry.repScore) || cityVenues[0] || null;
      return {
        id: `${regionName}:${entry.cityName}:${cityIndex}`,
        regionName,
        cityName: entry.cityName,
        latLng: entry.latLng,
        repScore: entry.repScore,
        cityScore: entry.cityScore,
        trendingGenre: entry.scene?.trending_genre || null,
        venueId: venue?.id || null,
        venueName: venue?.name || 'Local Venue',
        venueTier: Number(venue?.tier || getDesiredVenueTier(entry.repScore) || 1),
        venueType: venue?.venue_type || 'club',
        venueCapacity: Number(venue?.capacity || 0),
      };
    }).filter((stop) => !removedSet.has(stop.id));

    return {
      regionName,
      regionIndex,
      regionColor: regionMeta?.color || '#a78bfa',
      flag: regionMeta?.flag || '🌍',
      latLng: regionMeta?.latLng || [0, 0],
      cityStops,
    };
  }).filter((region) => region.cityStops.length > 0);

  const connectors = [];
  let totalMiles = 0;
  for (let i = 0; i < routeRegions.length - 1; i += 1) {
    const current = routeRegions[i];
    const next = routeRegions[i + 1];
    const miles = haversineMiles(current.latLng, next.latLng);
    totalMiles += miles;
    connectors.push({
      id: `${current.regionName}->${next.regionName}`,
      points: buildConnectorPoints(current.latLng, next.latLng, i % 2 === 0 ? 1 : -1),
      miles,
      color: current.regionColor,
    });
  }

  const stopCount = routeRegions.reduce((sum, region) => sum + region.cityStops.length, 0);

  return {
    routeRegions,
    connectors,
    totalMiles,
    stopCount,
  };
}

export function buildRoutePlanObject({ draft, artistId }) {
  return {
    id: `world-map-route:${artistId || 'unknown'}:${Date.now()}`,
    source: 'world_map_builder',
    artistId: artistId || null,
    createdAt: new Date().toISOString(),
    totalMiles: draft?.totalMiles || 0,
    stopCount: draft?.stopCount || 0,
    regions: Array.isArray(draft?.routeRegions)
      ? draft.routeRegions.map((region) => ({
          regionName: region.regionName,
          cityStops: region.cityStops.map((stop) => ({
            id: stop.id,
            cityName: stop.cityName,
            venueId: stop.venueId,
            venueName: stop.venueName,
            venueTier: stop.venueTier,
            venueType: stop.venueType,
            venueCapacity: stop.venueCapacity,
          })),
        }))
      : [],
  };
}

/**
 * Derives a demand status label from a score (0–100).
 */
function deriveStatus(score) {
  if (score >= 88) return "peak";
  if (score >= 75) return "hot";
  if (score >= 62) return "rising";
  if (score >= 45) return "emerging";
  return "cold";
}

/**
 * buildTouringMapModel
 *
 * @param {Object} opts
 * @param {Object} opts.demand   — map of { regionName: demandScore (0–100) }
 * @param {Array}  opts.tours    — array of tour records from backend
 * @returns {{ regions: Array, activeRoutes: Array }}
 */
export function buildTouringMapModel({ demand = {}, tours = [] }) {
  const activeRoutes = (Array.isArray(tours) ? tours : []).filter(
    (t) => t && t.status === "active"
  );

  const activeRegions = new Set(activeRoutes.map((t) => t.region).filter(Boolean));

  const regions = REGION_META.map((meta) => {
    const demandScore = demand[meta.name] ?? 50;
    return {
      name: meta.name,
      flag: meta.flag,
      color: meta.color,
      latLng: meta.latLng,
      demandScore: Math.round(demandScore),
      status: deriveStatus(demandScore),
      hasActiveTour: activeRegions.has(meta.name),
    };
  });

  return { regions, activeRoutes };
}

/**
 * buildTouringFootprint
 *
 * Derives footprint stats from completed tour records.
 *
 * @param {Array} tours — all tour records (active + completed)
 * @returns {{ regionsPlayed: number, totalShows: number, fansReached: number }}
 */
export function buildTouringFootprint(tours = []) {
  const completed = (Array.isArray(tours) ? tours : []).filter(
    (t) => t && (t.status === "completed" || t.status === "finished")
  );

  const regionsPlayed = new Set(completed.map((t) => t.region).filter(Boolean)).size;

  const totalShows = completed.reduce((acc, t) => {
    return acc + (t.completed_stops || t.total_stops || 0);
  }, 0);

  const fansReached = completed.reduce((acc, t) => {
    return acc + (t.total_attendance || 0);
  }, 0);

  return { regionsPlayed, totalShows, fansReached };
}
