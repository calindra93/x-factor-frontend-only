export const BASE_TRAVEL_DESTINATIONS = [
  { id: "us", name: "United States", baseCost: 2000, unlockFollowers: 3000, description: "The world's largest music market" },
  { id: "ca", name: "Canada", baseCost: 1000, unlockFollowers: 2000, description: "Strong indie and hip-hop scenes" },
  { id: "uk", name: "UK", baseCost: 2500, unlockFollowers: 4000, description: "Tastemaker market with outsized cultural influence" },
  { id: "eu", name: "Europe", baseCost: 3000, unlockFollowers: 5000, description: "Diverse, culturally rich market" },
  { id: "asia", name: "Asia", baseCost: 5000, unlockFollowers: 15000, description: "Massive audiences and untapped fanbases" },
  { id: "latam", name: "Latin America", baseCost: 2500, unlockFollowers: 8000, description: "Vibrant music scenes and passionate fans" },
  { id: "africa", name: "Africa", baseCost: 4000, unlockFollowers: 10000, description: "The fastest-growing music market in the world" },
  { id: "oceania", name: "Oceania", baseCost: 4500, unlockFollowers: 12000, description: "Festival culture and loyal fanbases" },
];

export function calculateDistanceCost(fromRegion, toRegion) {
  const distanceCosts = {
    "United States": {
      Canada: 1000,
      "Latin America": 2500,
      UK: 3500,
      Europe: 4000,
      Africa: 5000,
      Oceania: 6000,
      Asia: 5500,
    },
    Canada: {
      "United States": 1000,
      "Latin America": 3000,
      UK: 4000,
      Europe: 4500,
      Africa: 5500,
      Oceania: 6500,
      Asia: 6000,
    },
    UK: {
      Europe: 1500,
      "United States": 3500,
      Canada: 4000,
      "Latin America": 4500,
      Africa: 3000,
      Asia: 5000,
      Oceania: 7000,
    },
    Europe: {
      UK: 1500,
      Africa: 2500,
      Asia: 3500,
      "United States": 4000,
      Canada: 4500,
      "Latin America": 5000,
      Oceania: 7500,
    },
    Africa: {
      Europe: 2500,
      UK: 3000,
      Asia: 4000,
      "Latin America": 4500,
      "United States": 5000,
      Canada: 5500,
      Oceania: 7000,
    },
    Asia: {
      Europe: 3500,
      Africa: 4000,
      Oceania: 4500,
      "Latin America": 6000,
      "United States": 5500,
      Canada: 6000,
      UK: 5000,
    },
    "Latin America": {
      "United States": 2500,
      Canada: 3000,
      Africa: 4500,
      Europe: 5000,
      UK: 4500,
      Asia: 6000,
      Oceania: 6500,
    },
    Oceania: {
      Asia: 4500,
      "Latin America": 6500,
      Africa: 7000,
      Europe: 7500,
      UK: 7000,
      "United States": 6000,
      Canada: 6500,
    },
  };

  return distanceCosts[fromRegion]?.[toRegion] || BASE_TRAVEL_DESTINATIONS.find((dest) => dest.name === toRegion)?.baseCost || 5000;
}

export function getDestinations(currentRegion) {
  return BASE_TRAVEL_DESTINATIONS.map((dest) => {
    const isCurrentRegion = dest.name === currentRegion;
    return {
      ...dest,
      travelCost: isCurrentRegion ? 0 : calculateDistanceCost(currentRegion, dest.name),
      description: isCurrentRegion ? "Current location" : dest.description,
      isCurrentRegion,
    };
  });
}

// Cities within each region — mirrors the DB seed data in city_scenes
const REGION_CITIES = {
  "United States": [
    { name: "New York", genres: ["Hip-Hop", "R&B", "Pop", "Jazz"] },
    { name: "Los Angeles", genres: ["Hip-Hop", "Pop", "Electronic", "R&B"] },
    { name: "Atlanta", genres: ["Hip-Hop", "R&B", "Trap"] },
    { name: "Chicago", genres: ["Hip-Hop", "Drill", "House", "Jazz"] },
    { name: "Miami", genres: ["Reggaeton", "Electronic", "Latin Pop", "Hip-Hop"] },
    { name: "Houston", genres: ["Hip-Hop", "R&B", "Country", "Chopped & Screwed"] },
    { name: "Nashville", genres: ["Country", "Americana", "Rock", "Indie"] },
    { name: "New Orleans", genres: ["Jazz", "Blues", "Funk", "Electronic"] },
    { name: "Seattle", genres: ["Indie", "Rock", "Electronic", "Hip-Hop"] },
    { name: "Washington D.C.", genres: ["Go-Go", "Hip-Hop", "R&B", "Indie"] },
    { name: "Philadelphia", genres: ["Hip-Hop", "R&B", "Soul", "Jazz"] },
    { name: "Boston", genres: ["Indie", "Rock", "Hip-Hop", "Folk"] },
    { name: "Memphis", genres: ["Blues", "Soul", "Hip-Hop", "Rock"] },
  ],
  "Canada": [
    { name: "Toronto", genres: ["Hip-Hop", "R&B", "Pop", "Dancehall"] },
    { name: "Montreal", genres: ["Indie", "Electronic", "Pop", "French Pop"] },
    { name: "Vancouver", genres: ["Indie", "Electronic", "Pop"] },
    { name: "Calgary", genres: ["Country", "Rock", "Pop", "Electronic"] },
    { name: "Edmonton", genres: ["Rock", "Electronic", "Country", "Hip-Hop"] },
    { name: "Ottawa", genres: ["Indie", "Folk", "Pop", "Electronic"] },
    { name: "Halifax", genres: ["Rock", "Folk", "Indie", "Electronic"] },
    { name: "Winnipeg", genres: ["Hip-Hop", "Electronic", "Indie", "Rock"] },
  ],
  "UK": [
    { name: "London", genres: ["Grime", "Hip-Hop", "Pop", "Electronic", "R&B"] },
    { name: "Manchester", genres: ["Rock", "Indie", "Electronic"] },
    { name: "Glasgow", genres: ["Rock", "Post-Punk", "Indie"] },
    { name: "Birmingham", genres: ["Grime", "Jungle", "R&B", "Hip-Hop"] },
    { name: "Liverpool", genres: ["Rock", "Indie", "Electronic", "Pop"] },
    { name: "Bristol", genres: ["Trip-Hop", "Electronic", "Indie", "R&B"] },
    { name: "Leeds", genres: ["Indie", "Grime", "Electronic", "Rock"] },
    { name: "Belfast", genres: ["Rock", "Indie", "Folk", "Electronic"] },
  ],
  "Europe": [
    { name: "Berlin", genres: ["Electronic", "Techno", "Hip-Hop", "Experimental"] },
    { name: "Paris", genres: ["Hip-Hop", "Electronic", "Pop", "Chanson"] },
    { name: "Amsterdam", genres: ["Electronic", "Hip-Hop", "Pop"] },
    { name: "Barcelona", genres: ["Reggaeton", "Electronic", "Flamenco Pop", "Indie"] },
    { name: "Stockholm", genres: ["Pop", "Electronic", "Indie"] },
    { name: "Copenhagen", genres: ["Pop", "Electronic", "Indie", "Hip-Hop"] },
    { name: "Madrid", genres: ["Pop", "Electronic", "Hip-Hop", "Latin Pop"] },
    { name: "Milan", genres: ["Electronic", "Pop", "R&B", "Indie"] },
    { name: "Lisbon", genres: ["Fado", "Electronic", "Hip-Hop", "R&B"] },
    { name: "Vienna", genres: ["Electronic", "Indie", "Pop", "Hip-Hop"] },
    { name: "Brussels", genres: ["Electronic", "Hip-Hop", "Pop", "Indie"] },
    { name: "Ibiza", genres: ["Electronic", "House", "Pop", "Dance"] },
  ],
  "Asia": [
    { name: "Tokyo", genres: ["J-Pop", "Hip-Hop", "Electronic", "Rock"] },
    { name: "Seoul", genres: ["K-Pop", "Hip-Hop", "R&B", "Electronic"] },
    { name: "Mumbai", genres: ["Bollywood", "Hip-Hop", "Electronic", "Pop"] },
    { name: "Bangkok", genres: ["Pop", "Hip-Hop", "Electronic", "Indie"] },
    { name: "Shanghai", genres: ["Electronic", "Pop", "Hip-Hop", "C-Pop"] },
    { name: "Osaka", genres: ["J-Pop", "Electronic", "Hip-Hop", "Rock"] },
    { name: "Busan", genres: ["K-Pop", "Hip-Hop", "Electronic", "R&B"] },
    { name: "Manila", genres: ["Pop", "R&B", "Hip-Hop", "Electronic"] },
    { name: "Jakarta", genres: ["Pop", "Electronic", "R&B", "Hip-Hop"] },
    { name: "Chennai", genres: ["Pop", "Electronic", "R&B", "Hip-Hop"] },
    { name: "Singapore", genres: ["Electronic", "Hip-Hop", "Pop", "R&B"] },
    { name: "Hong Kong", genres: ["Cantopop", "Hip-Hop", "Electronic", "R&B"] },
    { name: "Taipei", genres: ["Pop", "Hip-Hop", "Electronic", "R&B"] },
  ],
  "Latin America": [
    { name: "Sao Paulo", genres: ["Funk", "Hip-Hop", "Sertanejo", "MPB"] },
    { name: "Mexico City", genres: ["Reggaeton", "Hip-Hop", "Rock", "Cumbia"] },
    { name: "Buenos Aires", genres: ["Rock", "Tango", "Cumbia", "Electronic"] },
    { name: "Bogota", genres: ["Reggaeton", "Latin Pop", "Hip-Hop", "Cumbia"] },
    { name: "Guadalajara", genres: ["Regional Mexican", "Hip-Hop", "Pop", "Cumbia"] },
    { name: "San Juan", genres: ["Reggaeton", "Latin Pop", "R&B", "Hip-Hop"] },
    { name: "Medellin", genres: ["Reggaeton", "Latin Pop", "Hip-Hop", "Cumbia"] },
    { name: "Rio de Janeiro", genres: ["Funk", "Latin Pop", "Samba", "Hip-Hop"] },
    { name: "Havana", genres: ["Salsa", "Latin Pop", "Hip-Hop", "Electronic"] },
    { name: "Santo Domingo", genres: ["Bachata", "Dembow", "Reggaeton", "R&B"] },
    { name: "Santiago", genres: ["Pop", "Hip-Hop", "Rock", "Electronic"] },
    { name: "Lima", genres: ["Cumbia", "Latin Pop", "Hip-Hop", "Electronic"] },
  ],
  "Africa": [
    { name: "Lagos", genres: ["Afrobeats", "Highlife", "Amapiano"] },
    { name: "Johannesburg", genres: ["Amapiano", "Kwaito", "Hip-Hop"] },
    { name: "Nairobi", genres: ["Afrobeats", "Hip-Hop", "Gengetone"] },
    { name: "Accra", genres: ["Highlife", "Afrobeats", "Hip-Hop", "Dancehall"] },
    { name: "Abuja", genres: ["Afrobeats", "Hip-Hop", "R&B", "Electronic"] },
    { name: "Cape Town", genres: ["Afro-House", "Electronic", "Hip-Hop", "R&B"] },
    { name: "Durban", genres: ["Gqom", "Afrobeats", "Electronic", "Hip-Hop"] },
    { name: "Cairo", genres: ["Arabic Pop", "Hip-Hop", "Electronic", "R&B"] },
    { name: "Casablanca", genres: ["Arabic Pop", "R&B", "Hip-Hop", "Electronic"] },
    { name: "Kinshasa", genres: ["Congolese Rumba", "Afrobeats", "Hip-Hop", "Electronic"] },
  ],
  "Oceania": [
    { name: "Sydney", genres: ["Pop", "Rock", "Electronic", "Hip-Hop"] },
    { name: "Melbourne", genres: ["Indie", "Rock", "Electronic", "Hip-Hop"] },
    { name: "Auckland", genres: ["Reggae", "Hip-Hop", "Pop", "R&B"] },
    { name: "Brisbane", genres: ["Pop", "Rock", "Electronic", "Hip-Hop"] },
    { name: "Adelaide", genres: ["Indie", "Electronic", "Pop", "Rock"] },
    { name: "Perth", genres: ["Indie", "Electronic", "Pop", "Rock"] },
    { name: "Wellington", genres: ["Indie", "Folk", "Electronic", "Pop"] },
  ],
};

export function getCitiesForRegion(region) {
  return REGION_CITIES[region] || [];
}
