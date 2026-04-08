// Frontend-friendly genre trait labels for onboarding display
// Sourced from GENRE_TRAITS in genreTraits.ts — 1-2 highlights per genre

const GENRE_TRAIT_LABELS = {
  "Rap":             [{ label: "Feud Fuel",       color: "#ef4444" }, { label: "Culture Architect", color: "#a78bfa" }],
  "Melodic Rap":     [{ label: "Algorithm Darling", color: "#60a5fa" }, { label: "Feature-Ready", color: "#34d399" }],
  "Alternative Rap": [{ label: "Boundary Pusher",  color: "#7C3AED" }, { label: "Genre Bender",   color: "#a78bfa" }],
  "Trap":            [{ label: "Smoke & Mirrors", color: "#ef4444" }, { label: "TikTok Bait",     color: "#f59e0b" }],
  "Pop":             [{ label: "Playlist Royalty",color: "#60a5fa" }, { label: "Radio Canon",     color: "#f59e0b" }],
  "Hip-Hop":         [{ label: "Scorched Earth",  color: "#ef4444" }, { label: "Blueprint Setters",color: "#a78bfa" }],
  "R&B":             [{ label: "Silk Devotion",   color: "#f472b6" }, { label: "Duet Magnets",    color: "#34d399" }],
  "Rock":            [{ label: "Til Death",       color: "#f472b6" }, { label: "Peace Treaty",    color: "#94a3b8" }],
  "EDM":             [{ label: "Drop Chasers",    color: "#fbbf24" }, { label: "Lab Rat Energy",  color: "#a78bfa" }],
  "Trance":          [{ label: "Sonic Architects",color: "#a78bfa" }, { label: "Sacred Underground",color: "#94a3b8" }],
  "Techno":          [{ label: "Future Prophets", color: "#a78bfa" }, { label: "Warehouse Clergy",color: "#94a3b8" }],
  "Afrobeats":       [{ label: "Border Crossers", color: "#34d399" }, { label: "Ancestral Pulse", color: "#f472b6" }],
  "Amapiano":        [{ label: "Township Sworn",  color: "#f472b6" }, { label: "Guest-List Gods", color: "#34d399" }],
  "Reggaeton":       [{ label: "Stream Machine",  color: "#60a5fa" }, { label: "Collab Royalty",  color: "#34d399" }],
  "Latin Pop":       [{ label: "Global Pipeline", color: "#f59e0b" }, { label: "Feature Circuit", color: "#34d399" }],
  "Salsa":           [{ label: "Roots Run Deep",  color: "#f472b6" }, { label: "Generational",    color: "#f472b6" }],
  "Dancehall":       [{ label: "Sound Clash",     color: "#ef4444" }, { label: "Crossover Ready", color: "#34d399" }],
  "Reggae":          [{ label: "One Love",        color: "#f472b6" }, { label: "Zero Smoke",      color: "#94a3b8" }],
  "K-Pop":           [{ label: "Stan Battalion",  color: "#f472b6" }, { label: "Algo Favorites",  color: "#60a5fa" }],
  "J-Pop":           [{ label: "Cult Canon",      color: "#f472b6" }, { label: "Island Niche",    color: "#94a3b8" }],
  "UK Drill":        [{ label: "Postcode Pride",  color: "#f472b6" }, { label: "War Zone",        color: "#ef4444" }],
  "Drill":           [{ label: "Raw Heat",        color: "#DC2626" }, { label: "Street Certified",color: "#ef4444" }],
  "Indie":           [{ label: "Die-Hards",       color: "#f472b6" }, { label: "Avant-Garde OK",  color: "#a78bfa" }],
  "Alternative":     [{ label: "Art House",       color: "#a78bfa" }, { label: "Anti-Radio",      color: "#94a3b8" }],
  "Folk":            [{ label: "Devoted Pilgrims",color: "#f472b6" }, { label: "Drama-Free",      color: "#94a3b8" }],
  "Country":         [{ label: "True Believers",  color: "#f472b6" }, { label: "Roots & Boots",   color: "#f59e0b" }],
  "Go-Go":           [{ label: "DC Certified",    color: "#C71585" }, { label: "Local Legend",    color: "#f472b6" }],
  "Grunge":          [{ label: "Angst Archive",   color: "#556B2F" }, { label: "Raw & Real",      color: "#94a3b8" }],
  "Blues":           [{ label: "Soul Deep",       color: "#4169E1" }, { label: "Road Worn",       color: "#f472b6" }],
  "Jazz":            [{ label: "Virtuoso Lane",   color: "#DAA520" }, { label: "Late Night Vibes",color: "#a78bfa" }],
  "Soul":            [{ label: "Heart & Heritage",color: "#8B4513" }, { label: "Timeless Feel",   color: "#f472b6" }],
  "Gospel":          [{ label: "Divine Purpose",  color: "#FFD700" }, { label: "Community Core",  color: "#f472b6" }],
  "Punk":            [{ label: "No Rules",        color: "#FF1493" }, { label: "DIY Forever",     color: "#ef4444" }],
  "Metal":           [{ label: "Loyal Legion",    color: "#2F4F4F" }, { label: "Heavy Hitters",   color: "#94a3b8" }],
  "Indie Rock":      [{ label: "Cult Classic",    color: "#CD853F" }, { label: "Tastemaker Bait", color: "#a78bfa" }],
  "Latin Rap":       [{ label: "Barrio Certified",color: "#FF4500" }, { label: "Bridge Builder",  color: "#34d399" }],
  "Latin":           [{ label: "Global Reach",    color: "#FF6347" }, { label: "Cultural Fusion", color: "#34d399" }],
};

export function getGenreLabels(genre) {
  return GENRE_TRAIT_LABELS[genre] || [];
}

export default GENRE_TRAIT_LABELS;
