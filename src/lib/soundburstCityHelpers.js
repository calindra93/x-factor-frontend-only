/**
 * soundburstCityHelpers.js
 *
 * Canonical synthetic-field derivation for Soundburst city/scene data.
 * All city objects in Soundburst must source their region from
 * BASE_TRAVEL_DESTINATIONS[n].name — never sub-region labels.
 *
 * Per plan A-002-01 and A-002-02.
 */
import { BASE_TRAVEL_DESTINATIONS, getCitiesForRegion } from './regionTravel.js';

// ---------------------------------------------------------------------------
// Genre → event-type mapping (A-002-02 derivation contract)
// ---------------------------------------------------------------------------
const GENRE_EVENT_TYPE_MAP = {
  'hip-hop': 'battle',
  'trap': 'battle',
  'drill': 'battle',
  'grime': 'battle',
  'electronic': 'listening_party',
  'techno': 'listening_party',
  'house': 'listening_party',
  'experimental': 'listening_party',
  'r&b': 'collab_night',
  'soul': 'collab_night',
  'jazz': 'collab_night',
  'funk': 'collab_night',
  'pop': 'showcase',
  'indie': 'showcase',
  'rock': 'showcase',
  'afrobeats': 'block_party',
  'amapiano': 'block_party',
  'kwaito': 'block_party',
  'highlife': 'block_party',
  'gengetone': 'block_party',
  'reggaeton': 'block_party',
  'cumbia': 'block_party',
  'sertanejo': 'block_party',
  'dancehall': 'block_party',
  'reggae': 'block_party',
  'k-pop': 'showcase',
  'j-pop': 'showcase',
  'bollywood': 'open_mic',
  'mpb': 'open_mic',
  'chanson': 'open_mic',
  'flamenco pop': 'open_mic',
  'tango': 'open_mic',
  'french pop': 'open_mic',
  'post-punk': 'showcase',
};

/**
 * Maps a genre string to the most contextually appropriate underground event type.
 * Falls back to "showcase" for any unknown genre.
 *
 * @param {string} genre
 * @returns {string} One of: open_mic | showcase | battle | collab_night | block_party | listening_party
 */
export function genreToEventType(genre) {
  if (!genre || typeof genre !== 'string') return 'showcase';
  const key = genre.toLowerCase().trim();
  return GENRE_EVENT_TYPE_MAP[key] ?? 'showcase';
}

// ---------------------------------------------------------------------------
// Vibe label per primary genre
// ---------------------------------------------------------------------------
const GENRE_VIBE_MAP = {
  'hip-hop': 'Bars & heat',
  'trap': 'Club energy',
  'drill': 'Raw & gritty',
  'grime': 'UK street vibes',
  'electronic': 'Headspace focus',
  'techno': 'All-night ritual',
  'house': 'Feel the groove',
  'experimental': 'Boundary-pushing',
  'r&b': 'Smooth & soulful',
  'soul': 'Deep feeling',
  'jazz': 'Late night cool',
  'funk': 'Groove is truth',
  'pop': 'Wide appeal',
  'indie': 'Tastemaker scene',
  'rock': 'Raw power',
  'afrobeats': 'Pan-African energy',
  'amapiano': 'Jo\'burg vibes',
  'kwaito': 'Township heat',
  'highlife': 'West African roots',
  'gengetone': 'Nairobi street',
  'reggaeton': 'Rhythmic fire',
  'cumbia': 'Festive & local',
  'dancehall': 'Caribbean hype',
  'reggae': 'Roots & culture',
  'k-pop': 'Highly produced',
  'j-pop': 'Precision craft',
  'bollywood': 'Bollywood drama',
  'mpb': 'Brazilian soul',
};

function genreToVibe(genre) {
  if (!genre || typeof genre !== 'string') return 'Underground';
  const key = genre.toLowerCase().trim();
  return GENRE_VIBE_MAP[key] ?? 'Underground';
}

// ---------------------------------------------------------------------------
// Core derivation: getCitiesForRegion → SceneReportCarousel-ready objects
// ---------------------------------------------------------------------------

/**
 * Derives a list of SceneReportCarousel-ready city objects for a single region.
 * Uses only canonical region names from BASE_TRAVEL_DESTINATIONS.
 *
 * Fields derived per A-002-02 contract:
 *   id             — slug from city name
 *   region         — caller-supplied canonical region name
 *   sceneTier      — "rising" (static for v0.0.1)
 *   trendingEvent  — mapped from first genre
 *   recentHeat     — 50 (static for v0.0.1)
 *   playerShowCount — 0 (static for v0.0.1)
 *   vibe           — mapped from first genre
 *
 * @param {string} region — Must be a canonical BASE_TRAVEL_DESTINATIONS name
 * @returns {Array<object>}
 */
export function deriveSoundburstCities(region) {
  const rawCities = getCitiesForRegion(region);
  if (!rawCities || rawCities.length === 0) return [];

  return rawCities.map((city) => {
    const primaryGenre = Array.isArray(city.genres) ? city.genres[0] : '';
    return {
      id: city.name.toLowerCase().replace(/\s+/g, '-'),
      name: city.name,
      region,                                       // canonical region name — no sub-regions
      sceneTier: 'rising',                          // static for v0.0.1
      trendingEvent: genreToEventType(primaryGenre),
      recentHeat: 50,                               // static for v0.0.1
      playerShowCount: 0,                           // static for v0.0.1
      vibe: genreToVibe(primaryGenre),
      genres: city.genres || [],
    };
  });
}

// ---------------------------------------------------------------------------
// Full scene report: all 8 canonical regions, with home-region marking
// ---------------------------------------------------------------------------

/**
 * Builds a flat list of all Soundburst cities across all 8 canonical regions,
 * marking each city with isHomeRegion based on the player's current region.
 *
 * Observability: logs city count if 0 cities returned (M2 failure threshold).
 *
 * @param {string|undefined} currentRegion — player's current region (profile.region)
 * @returns {Array<object>}
 */
export function buildSceneReportCities(currentRegion) {
  const cities = [];

  for (const dest of BASE_TRAVEL_DESTINATIONS) {
    const regionCities = deriveSoundburstCities(dest.name);
    for (const city of regionCities) {
      cities.push({
        ...city,
        isHomeRegion: currentRegion ? city.region === currentRegion : false,
      });
    }
  }

  if (cities.length === 0) {
    // M2 observability: failure threshold — 0 cities returned
    console.error('[soundburstCityHelpers] buildSceneReportCities: 0 cities returned — check regionTravel.js REGION_CITIES');
  }

  return cities;
}
