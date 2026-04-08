export interface GenreTrait {
  genre: string;
  culturalGravityFactor: number;
  virality: number;
  loyaltyMultiplier: number;
  feudSusceptibility: number;
  collaborationBonus: number;
}

const GENRE_TRAITS: Record<string, GenreTrait> = {
  "Rap":             { genre: "Rap",             culturalGravityFactor: 1.4, virality: 1.3, loyaltyMultiplier: 1.2, feudSusceptibility: 1.5, collaborationBonus: 1.2 },
  "Melodic Rap":     { genre: "Melodic Rap",     culturalGravityFactor: 1.2, virality: 1.4, loyaltyMultiplier: 1.1, feudSusceptibility: 1.0, collaborationBonus: 1.4 },
  "Alternative Rap": { genre: "Alternative Rap", culturalGravityFactor: 1.1, virality: 1.1, loyaltyMultiplier: 1.3, feudSusceptibility: 0.8, collaborationBonus: 1.1 },
  "Trap":            { genre: "Trap",             culturalGravityFactor: 1.3, virality: 1.5, loyaltyMultiplier: 1.0, feudSusceptibility: 1.3, collaborationBonus: 1.1 },
  "Pop":             { genre: "Pop",              culturalGravityFactor: 1.0, virality: 1.5, loyaltyMultiplier: 0.9, feudSusceptibility: 0.8, collaborationBonus: 1.3 },
  "Hip-Hop":         { genre: "Hip-Hop",          culturalGravityFactor: 1.5, virality: 1.2, loyaltyMultiplier: 1.3, feudSusceptibility: 1.4, collaborationBonus: 1.2 },
  "R&B":             { genre: "R&B",              culturalGravityFactor: 1.1, virality: 1.1, loyaltyMultiplier: 1.4, feudSusceptibility: 0.7, collaborationBonus: 1.5 },
  "Rock":            { genre: "Rock",             culturalGravityFactor: 1.0, virality: 0.9, loyaltyMultiplier: 1.5, feudSusceptibility: 0.9, collaborationBonus: 0.9 },
  "EDM":             { genre: "EDM",              culturalGravityFactor: 0.9, virality: 1.4, loyaltyMultiplier: 0.8, feudSusceptibility: 0.6, collaborationBonus: 1.4 },
  "Trance":          { genre: "Trance",           culturalGravityFactor: 0.8, virality: 1.0, loyaltyMultiplier: 1.4, feudSusceptibility: 0.5, collaborationBonus: 1.1 },
  "Techno":          { genre: "Techno",           culturalGravityFactor: 0.9, virality: 0.9, loyaltyMultiplier: 1.4, feudSusceptibility: 0.5, collaborationBonus: 1.0 },
  "Afrobeats":       { genre: "Afrobeats",        culturalGravityFactor: 1.3, virality: 1.4, loyaltyMultiplier: 1.2, feudSusceptibility: 0.8, collaborationBonus: 1.5 },
  "Amapiano":        { genre: "Amapiano",         culturalGravityFactor: 1.2, virality: 1.3, loyaltyMultiplier: 1.3, feudSusceptibility: 0.7, collaborationBonus: 1.4 },
  "Reggaeton":       { genre: "Reggaeton",        culturalGravityFactor: 1.2, virality: 1.4, loyaltyMultiplier: 1.1, feudSusceptibility: 0.9, collaborationBonus: 1.5 },
  "Latin Pop":       { genre: "Latin Pop",        culturalGravityFactor: 1.1, virality: 1.3, loyaltyMultiplier: 1.1, feudSusceptibility: 0.7, collaborationBonus: 1.4 },
  "Salsa":           { genre: "Salsa",            culturalGravityFactor: 1.0, virality: 0.8, loyaltyMultiplier: 1.5, feudSusceptibility: 0.5, collaborationBonus: 1.0 },
  "Dancehall":       { genre: "Dancehall",        culturalGravityFactor: 1.2, virality: 1.2, loyaltyMultiplier: 1.2, feudSusceptibility: 1.1, collaborationBonus: 1.3 },
  "Reggae":          { genre: "Reggae",           culturalGravityFactor: 1.0, virality: 0.8, loyaltyMultiplier: 1.5, feudSusceptibility: 0.4, collaborationBonus: 1.1 },
  "K-Pop":           { genre: "K-Pop",            culturalGravityFactor: 1.3, virality: 1.5, loyaltyMultiplier: 1.5, feudSusceptibility: 0.9, collaborationBonus: 1.2 },
  "J-Pop":           { genre: "J-Pop",            culturalGravityFactor: 1.0, virality: 1.0, loyaltyMultiplier: 1.4, feudSusceptibility: 0.6, collaborationBonus: 1.0 },
  "UK Drill":        { genre: "UK Drill",         culturalGravityFactor: 1.3, virality: 1.3, loyaltyMultiplier: 1.2, feudSusceptibility: 1.5, collaborationBonus: 1.0 },
  "Drill":           { genre: "Drill",            culturalGravityFactor: 1.3, virality: 1.3, loyaltyMultiplier: 1.2, feudSusceptibility: 1.5, collaborationBonus: 1.0 },
  "Indie":           { genre: "Indie",            culturalGravityFactor: 0.9, virality: 0.9, loyaltyMultiplier: 1.5, feudSusceptibility: 0.5, collaborationBonus: 1.0 },
  "Alternative":     { genre: "Alternative",      culturalGravityFactor: 0.9, virality: 1.0, loyaltyMultiplier: 1.4, feudSusceptibility: 0.6, collaborationBonus: 1.0 },
  "Folk":            { genre: "Folk",             culturalGravityFactor: 0.8, virality: 0.7, loyaltyMultiplier: 1.6, feudSusceptibility: 0.3, collaborationBonus: 1.1 },
  "Country":         { genre: "Country",          culturalGravityFactor: 0.9, virality: 0.8, loyaltyMultiplier: 1.6, feudSusceptibility: 0.4, collaborationBonus: 0.9 },
  "Go-Go":           { genre: "Go-Go",            culturalGravityFactor: 1.2, virality: 0.9, loyaltyMultiplier: 1.5, feudSusceptibility: 0.7, collaborationBonus: 1.1 },
  "Grunge":          { genre: "Grunge",           culturalGravityFactor: 0.9, virality: 0.8, loyaltyMultiplier: 1.4, feudSusceptibility: 0.7, collaborationBonus: 0.8 },
  "Blues":           { genre: "Blues",            culturalGravityFactor: 0.8, virality: 0.6, loyaltyMultiplier: 1.6, feudSusceptibility: 0.3, collaborationBonus: 1.0 },
  "Jazz":            { genre: "Jazz",             culturalGravityFactor: 0.9, virality: 0.7, loyaltyMultiplier: 1.5, feudSusceptibility: 0.3, collaborationBonus: 1.2 },
  "Soul":            { genre: "Soul",             culturalGravityFactor: 1.0, virality: 0.8, loyaltyMultiplier: 1.5, feudSusceptibility: 0.4, collaborationBonus: 1.2 },
  "Gospel":          { genre: "Gospel",           culturalGravityFactor: 1.0, virality: 0.8, loyaltyMultiplier: 1.6, feudSusceptibility: 0.3, collaborationBonus: 1.1 },
  "Punk":            { genre: "Punk",             culturalGravityFactor: 0.9, virality: 0.9, loyaltyMultiplier: 1.5, feudSusceptibility: 0.8, collaborationBonus: 0.7 },
  "Metal":           { genre: "Metal",            culturalGravityFactor: 0.8, virality: 0.7, loyaltyMultiplier: 1.7, feudSusceptibility: 0.6, collaborationBonus: 0.8 },
  "Indie Rock":      { genre: "Indie Rock",       culturalGravityFactor: 0.9, virality: 0.9, loyaltyMultiplier: 1.5, feudSusceptibility: 0.5, collaborationBonus: 0.9 },
  "Latin Rap":       { genre: "Latin Rap",        culturalGravityFactor: 1.2, virality: 1.3, loyaltyMultiplier: 1.2, feudSusceptibility: 1.1, collaborationBonus: 1.3 },
  "Latin":           { genre: "Latin",            culturalGravityFactor: 1.1, virality: 1.2, loyaltyMultiplier: 1.2, feudSusceptibility: 0.8, collaborationBonus: 1.3 },
};

const DEFAULT_TRAIT: GenreTrait = {
  genre: "Unknown",
  culturalGravityFactor: 1.0,
  virality: 1.0,
  loyaltyMultiplier: 1.0,
  feudSusceptibility: 1.0,
  collaborationBonus: 1.0,
};

export function getGenreTrait(genre: string): GenreTrait {
  return GENRE_TRAITS[genre] ?? DEFAULT_TRAIT;
}

export { GENRE_TRAITS };
