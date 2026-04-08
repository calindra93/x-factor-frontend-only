/**
 * cityTravelModule.ts
 * 
 * City-level travel system extending region travel.
 * Supports both within-region (free/cheap) and cross-region travel with cost scaling.
 */

import { N } from "./utils";

// ────────────────────────────────────────────────────────────────────────────
// City Travel Costs
// ────────────────────────────────────────────────────────────────────────────

export const CITY_DATA = {
  "United States": {
    "New York": { tier: 5, defaultCity: true },
    "Los Angeles": { tier: 5, defaultCity: false },
    "Chicago": { tier: 4, defaultCity: false },
    "Atlanta": { tier: 4, defaultCity: false },
    "Miami": { tier: 4, defaultCity: false },
    "Houston": { tier: 3, defaultCity: false },
    "Nashville": { tier: 3, defaultCity: false },
    "New Orleans": { tier: 3, defaultCity: false },
    "Seattle": { tier: 3, defaultCity: false },
    "Washington D.C.": { tier: 3, defaultCity: false },
    "Philadelphia": { tier: 3, defaultCity: false },
    "Boston": { tier: 3, defaultCity: false },
    "Memphis": { tier: 2, defaultCity: false },
  },
  "Canada": {
    "Toronto": { tier: 4, defaultCity: true },
    "Montreal": { tier: 3, defaultCity: false },
    "Vancouver": { tier: 3, defaultCity: false },
    "Calgary": { tier: 2, defaultCity: false },
    "Edmonton": { tier: 2, defaultCity: false },
    "Ottawa": { tier: 2, defaultCity: false },
    "Halifax": { tier: 1, defaultCity: false },
    "Winnipeg": { tier: 1, defaultCity: false },
  },
  "UK": {
    "London": { tier: 5, defaultCity: true },
    "Manchester": { tier: 3, defaultCity: false },
    "Glasgow": { tier: 3, defaultCity: false },
    "Birmingham": { tier: 3, defaultCity: false },
    "Liverpool": { tier: 3, defaultCity: false },
    "Bristol": { tier: 2, defaultCity: false },
    "Leeds": { tier: 2, defaultCity: false },
    "Belfast": { tier: 2, defaultCity: false },
  },
  "Europe": {
    "Berlin": { tier: 4, defaultCity: true },
    "Paris": { tier: 4, defaultCity: false },
    "Amsterdam": { tier: 4, defaultCity: false },
    "Barcelona": { tier: 3, defaultCity: false },
    "Stockholm": { tier: 3, defaultCity: false },
    "Copenhagen": { tier: 3, defaultCity: false },
    "Madrid": { tier: 4, defaultCity: false },
    "Milan": { tier: 3, defaultCity: false },
    "Lisbon": { tier: 2, defaultCity: false },
    "Vienna": { tier: 3, defaultCity: false },
    "Brussels": { tier: 2, defaultCity: false },
    "Ibiza": { tier: 2, defaultCity: false },
  },
  "Asia": {
    "Tokyo": { tier: 5, defaultCity: true },
    "Seoul": { tier: 4, defaultCity: false },
    "Mumbai": { tier: 4, defaultCity: false },
    "Bangkok": { tier: 3, defaultCity: false },
    "Shanghai": { tier: 3, defaultCity: false },
    "Osaka": { tier: 3, defaultCity: false },
    "Busan": { tier: 2, defaultCity: false },
    "Manila": { tier: 3, defaultCity: false },
    "Jakarta": { tier: 3, defaultCity: false },
    "Chennai": { tier: 2, defaultCity: false },
    "Singapore": { tier: 3, defaultCity: false },
    "Hong Kong": { tier: 3, defaultCity: false },
    "Taipei": { tier: 3, defaultCity: false },
  },
  "Latin America": {
    "Sao Paulo": { tier: 4, defaultCity: true },
    "Mexico City": { tier: 4, defaultCity: false },
    "Buenos Aires": { tier: 3, defaultCity: false },
    "Bogota": { tier: 2, defaultCity: false },
    "Guadalajara": { tier: 3, defaultCity: false },
    "San Juan": { tier: 3, defaultCity: false },
    "Medellin": { tier: 2, defaultCity: false },
    "Rio de Janeiro": { tier: 4, defaultCity: false },
    "Havana": { tier: 2, defaultCity: false },
    "Santo Domingo": { tier: 2, defaultCity: false },
    "Santiago": { tier: 2, defaultCity: false },
    "Lima": { tier: 2, defaultCity: false },
  },
  "Africa": {
    "Lagos": { tier: 4, defaultCity: true },
    "Johannesburg": { tier: 3, defaultCity: false },
    "Nairobi": { tier: 3, defaultCity: false },
    "Accra": { tier: 2, defaultCity: false },
    "Abuja": { tier: 2, defaultCity: false },
    "Cape Town": { tier: 3, defaultCity: false },
    "Durban": { tier: 2, defaultCity: false },
    "Cairo": { tier: 3, defaultCity: false },
    "Casablanca": { tier: 2, defaultCity: false },
    "Kinshasa": { tier: 2, defaultCity: false },
  },
  "Oceania": {
    "Sydney": { tier: 4, defaultCity: true },
    "Melbourne": { tier: 3, defaultCity: false },
    "Auckland": { tier: 3, defaultCity: false },
    "Brisbane": { tier: 2, defaultCity: false },
    "Adelaide": { tier: 2, defaultCity: false },
    "Perth": { tier: 2, defaultCity: false },
    "Wellington": { tier: 1, defaultCity: false },
  },
};

export interface CityTravel {
  fromRegion: string;
  toRegion: string;
  fromCity: string;
  toCity: string;
  withinRegion: boolean;
  baseCost: number; // base travel cost
  cityPremium: number; // added cost for tiered cities
  totalCost: number;
  energyCost: number;
  sceneReputation: {
    oldCity: string;
    oldCityId?: string;
    newCity: string;
    newCityId?: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Travel Cost Calculations
// ────────────────────────────────────────────────────────────────────────────

export function getCityTravelCost(
  fromRegion: string,
  toRegion: string,
  toCity: string,
  baseRegionCost: number = 2000, // equivalent to region travel cost
): CityTravel {
  const withinRegion = fromRegion === toRegion;
  
  // Look up city tier
  const regionCities = CITY_DATA[toRegion];
  const cityInfo = regionCities?.[toCity];
  const cityTier = cityInfo?.tier || 3;

  // Within region: free or minimal cost ($100-300 based on tier)
  // Cross region: base cost + premium
  const baseCost = withinRegion ? 0 : baseRegionCost;
  const cityPremium = cityTier * 100; // Tier 3 = $300, Tier 5 = $500
  const totalCost = baseCost + (withinRegion ? cityPremium : cityPremium * 0.75);

  return {
    fromRegion,
    toRegion,
    fromCity: "", // filled in by caller
    toCity,
    withinRegion,
    baseCost,
    cityPremium,
    totalCost: Math.floor(totalCost),
    energyCost: withinRegion ? 2 : 5, // cross-region costs more energy
    sceneReputation: {
      oldCity: "",
      newCity: toCity,
      newCityId: `${toRegion}:${toCity}`.toLowerCase().replace(/ /g, "_"),
    },
  };
}

export async function executePhysicalTravel(
  entities: any,
  artistId: string,
  toRegion: string,
  toCity: string,
  travelCost: CityTravel,
): Promise<{
  success: boolean;
  oldRegion: string;
  oldCity: string;
  newRegion: string;
  newCity: string;
  costDeducted: number;
}> {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error("Artist not found");

  const fromRegion = artist.region || "United States"; // fallback
  const fromCity = artist.current_city || null;
  const totalCost = N(travelCost.totalCost);
  const energyCost = N(travelCost.energyCost);

  // Check sufficient resources
  if (N(artist.income) < totalCost) {
    throw new Error(`Insufficient funds: need $${totalCost}, have $${N(artist.income)}`);
  }
  if (N(artist.energy) < energyCost) {
    throw new Error(`Insufficient energy: need ${energyCost}, have ${N(artist.energy)}`);
  }

  // Deduct costs and update location
  await entities.ArtistProfile.update(artistId, {
    region: toRegion,
    current_city: toCity,
    income: N(artist.income) - totalCost,
    energy: N(artist.energy) - energyCost,
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    oldRegion: fromRegion,
    oldCity: fromCity || "region capital",
    newRegion: toRegion,
    newCity: toCity,
    costDeducted: totalCost,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-Travel for Events (used by event wizard)
// ────────────────────────────────────────────────────────────────────────────

export async function autoTravelForEvent(
  entities: any,
  artistId: string,
  eventCity: string,
  eventRegion: string,
): Promise<{
  travelOccurred: boolean;
  travelCost?: number;
  reason?: string;
}> {
  const artist = await entities.ArtistProfile.get(artistId);
  if (!artist) throw new Error("Artist not found");

  const currentRegion = artist.region || "United States";
  const currentCity = artist.current_city;

  // Already in target city? No travel needed
  if (currentRegion === eventRegion && currentCity === eventCity) {
    return { travelOccurred: false, reason: "Already in target city" };
  }

  // Calculate cost
  const travelInfo = getCityTravelCost(currentRegion, eventRegion, eventCity);

  // Check if affordable
  if (N(artist.income) < travelInfo.totalCost) {
    return {
      travelOccurred: false,
      reason: `Cannot afford travel: need $${travelInfo.totalCost}, have $${N(artist.income)}`,
    };
  }

  // Execute travel
  const result = await executePhysicalTravel(entities, artistId, eventRegion, eventCity, travelInfo);

  return {
    travelOccurred: true,
    travelCost: result.costDeducted,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scene Reputation Transfers (scene tick integration)
// ────────────────────────────────────────────────────────────────────────────

export function computeCityChangeRepDelta(
  fromCity: string,
  toCity: string,
): { fromCityLoss: number; toCityGain: number } {
  // Moving to new city: lose some rep in old city (they left the scene)
  // Gain "newcomer bonus" in new city
  return {
    fromCityLoss: 10, // -10 rep for leaving
    toCityGain: 15, // +15 rep for new player in scene
  };
}
