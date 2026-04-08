// Starting resources configuration for new players
// Baseline: $20k income, with genre + region modifiers

const BASE_RESOURCES = {
  energy: 100,
  max_energy: 100,
  inspiration: 100,
  income: 20000,
  fans: 100,
  followers: 100,
  fan_growth: 12,
  follower_growth: 12,
  clout: 0,
  global_rank: 999,
  hype: 30,
  fame: 0,
};

// Genre modifiers — additive on top of base values
const GENRE_MODIFIERS = {
  "K-Pop":           { fans: 50,  hype: 0,  income: 0 },
  "J-Pop":           { fans: 30,  hype: 0,  income: 0 },
  "Rap":             { fans: 0,   hype: 10, income: 0 },
  "Melodic Rap":     { fans: 10,  hype: 5,  income: 500 },
  "Trap":            { fans: 0,   hype: 10, income: 0 },
  "Pop":             { fans: 20,  hype: 0,  income: 1000 },
  "Hip-Hop":         { fans: 0,   hype: 10, income: 0 },
  "R&B":             { fans: 10,  hype: 0,  income: 500 },
  "EDM":             { fans: 10,  hype: 0,  income: 500 },
  "Trance":          { fans: 0,   hype: 0,  income: 0 },
  "Techno":          { fans: 0,   hype: 5,  income: 0 },
  "Afrobeats":       { fans: 20,  hype: 5,  income: 0 },
  "Amapiano":        { fans: 10,  hype: 5,  income: 0 },
  "Reggaeton":       { fans: 20,  hype: 5,  income: 500 },
  "Latin Pop":       { fans: 20,  hype: 0,  income: 500 },
  "Salsa":           { fans: 0,   hype: 0,  income: 0 },
  "Dancehall":       { fans: 0,   hype: 5,  income: 0 },
  "Reggae":          { fans: 0,   hype: 0,  income: 0 },
  "UK Drill":        { fans: 0,   hype: 15, income: -500 },
  "Drill":           { fans: 0,   hype: 15, income: -500 },
  "Indie":           { fans: -20, hype: 0,  income: 0 },
  "Alternative":     { fans: -10, hype: 0,  income: 0 },
  "Alternative Rap": { fans: -10, hype: 5,  income: 0 },
  "Folk":            { fans: -20, hype: 0,  income: 0 },
  "Country":         { fans: 0,   hype: 0,  income: 500 },
  "Rock":            { fans: 0,   hype: 5,  income: 0 },
};

// Region modifiers — additive on top of base values
const REGION_MODIFIERS = {
  "United States":   { fans: 10,  hype: 0,  income: 1000 },
  "Canada":          { fans: 5,   hype: 0,  income: 500 },
  "UK":              { fans: 0,   hype: 5,  income: 500 },
  "Europe":          { fans: 5,   hype: 0,  income: 500 },
  "Asia":            { fans: 30,  hype: 0,  income: 0 },
  "Africa":          { fans: 10,  hype: 5,  income: 0 },
  "Latin America":   { fans: 10,  hype: 5,  income: 0 },
  "Oceania":         { fans: 5,   hype: 0,  income: 500 },
};

export function computeStartingResources(genre, region) {
  const base = { ...BASE_RESOURCES };
  const gm = GENRE_MODIFIERS[genre] || {};
  const rm = REGION_MODIFIERS[region] || {};

  return {
    energy: base.energy,
    max_energy: base.max_energy,
    inspiration: base.inspiration,
    income: Math.max(15000, base.income + (gm.income || 0) + (rm.income || 0)),
    fans: Math.max(50, base.fans + (gm.fans || 0) + (rm.fans || 0)),
    followers: Math.max(50, base.followers + (gm.fans || 0) + (rm.fans || 0)),
    fan_growth: base.fan_growth,
    follower_growth: base.follower_growth,
    clout: base.clout,
    global_rank: base.global_rank,
    hype: Math.max(10, base.hype + (gm.hype || 0) + (rm.hype || 0)),
    fame: base.fame,
  };
}

export default computeStartingResources;
