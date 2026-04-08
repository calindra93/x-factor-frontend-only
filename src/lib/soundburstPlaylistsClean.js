const formatStreams = (value) => `${(value || 0).toLocaleString()} streams`;

const formatCompactCount = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(Math.max(0, Math.round(value || 0)));

const estimatePlaylistSaves = (releases, type) => {
  const totalStreams = releases.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0);
  const releaseCount = releases.length;
  const streamSignal = Math.sqrt(Math.max(0, totalStreams)) * (type === "underground" ? 3.2 : 4.4);
  const baseAudience = type === "underground" ? 900 : 1400;
  const perTrackLift = type === "underground" ? 180 : 240;
  const estimated = baseAudience + releaseCount * perTrackLift + streamSignal;

  return Math.min(type === "underground" ? 180_000 : 260_000, Math.round(estimated));
};

const UNDERGROUND_UPDATE_DAYS = [1, 5, 4, 2, 6, 0, 3];
const SCENE_UPDATE_DAYS = [0, 4, 1, 3, 6, 2, 5];

const UNDERGROUND_RADAR_PLAYLISTS = [
  { name: "Underground Radar", genres: ["Alternative Rap", "Indie", "Alternative", "R&B", "Soul"] },
  { name: "Cloud Surfing", genres: ["Melodic Rap", "Alternative Rap", "R&B", "Pop"] },
  { name: "Street Rotation", genres: ["Rap", "Hip-Hop", "Trap", "Drill"] },
  { name: "Plugged In Underground", genres: ["UK Drill", "Drill", "Rap", "Hip-Hop"], regions: ["UK", "Europe"] },
  { name: "Night Market", genres: ["Afrobeats", "Amapiano", "Dancehall", "Reggaeton"], regions: ["Africa", "Latin America", "Europe", "UK"] },
  { name: "Diaspora Nights", genres: ["Afrobeats", "Amapiano", "Dancehall", "R&B", "Soul"], regions: ["Africa", "UK", "Europe"] },
  { name: "Digital Perreo", genres: ["Latin Rap", "Reggaeton", "Latin Pop", "Dancehall"], regions: ["Latin America", "United States", "Europe"] },
  { name: "Basement Tapes", genres: ["Indie", "Alternative", "Indie Rock", "Rock", "Grunge"] },
  { name: "Indie Pulse", genres: ["Indie", "Alternative", "Pop", "Folk"] },
  { name: "Lo-Fi Sessions", genres: ["Indie", "Folk", "Jazz", "Soul", "Blues"] },
  { name: "Velvet Hours", genres: ["R&B", "Soul", "Jazz", "Alternative"] },
  { name: "Neon Afterglow", genres: ["Pop", "Alternative", "EDM", "Electronic"] },
  { name: "Warehouse Static", genres: ["Techno", "House", "EDM", "Electronic"], regions: ["Europe", "UK", "United States"] },
  { name: "404 Dreams", genres: ["Electronic", "EDM", "Trance", "Pop"] },
  { name: "Tokyo After Dark", genres: ["K-Pop", "J-Pop", "Electronic", "R&B", "Hip-Hop", "Pop"], regions: ["Asia"] },
  { name: "Heavy Rotation", genres: ["Metal", "Punk", "Rock", "Grunge"] },
  { name: "Roots & Heritage", genres: ["Blues", "Jazz", "Soul", "Gospel", "Country", "Folk"] },
  { name: "Heartland Static", genres: ["Country", "Americana", "Folk", "Rock"], regions: ["United States", "Canada"] },
  { name: "City Streets", genres: ["Go-Go", "Latin Rap", "Rap", "Hip-Hop"], regions: ["United States", "Latin America"] },
].map((playlist, index) => ({
  ...playlist,
  updateDay: UNDERGROUND_UPDATE_DAYS[index % UNDERGROUND_UPDATE_DAYS.length],
}));

const SCENE_REPORTS_PLAYLISTS = [
  { name: "Party Hits", genres: ["Pop", "Hip-Hop", "R&B", "Rap", "Soul"] },
  { name: "Dance Party", genres: ["EDM", "House", "Pop", "Electronic", "Afrobeats", "Dancehall"] },
  { name: "Pop Party", genres: ["Pop", "R&B", "Indie", "Alternative", "Soul"] },
  { name: "Get Turnt", genres: ["Trap", "Hip-Hop", "Rap", "Electronic", "Drill"] },
  { name: "Reggaeton", genres: ["Reggaeton", "Latin Pop", "Latin", "Dancehall", "Latin Rap"] },
  { name: "Regional Heat", genres: ["Afrobeats", "Amapiano", "Dancehall", "Latin Pop", "Reggaeton", "Salsa", "Reggae"], regions: ["Africa", "Latin America", "UK", "Europe"] },
  { name: "Collective Cuts", genres: ["Hip-Hop", "Rap", "R&B", "Indie", "Alternative", "Alternative Rap", "Soul"] },
  { name: "Open Mic Selects", genres: ["Folk", "Indie", "Alternative", "Rap", "Country", "Blues"] },
  { name: "Warehouse Sounds", genres: ["EDM", "Techno", "Trance", "Alternative"] },
  { name: "Tape Swap", genres: ["Indie", "Alternative", "Hip-Hop", "Rock", "Indie Rock", "Grunge"] },
  { name: "Electronic Underground", genres: ["EDM", "Techno", "Trance", "Pop"] },
  { name: "Cipher Sessions", genres: ["Hip-Hop", "Rap", "UK Drill", "Drill", "Latin Rap"] },
  { name: "Bedroom Frequencies", genres: ["Indie", "Pop", "Folk", "J-Pop", "K-Pop"] },
  { name: "Subway Serenades", genres: ["Rock", "Indie", "Alternative", "Punk", "Grunge"] },
  { name: "Velvet Algorithms", genres: ["R&B", "Alternative", "Soul", "Jazz"] },
  { name: "Neon Lovers Club", genres: ["Indie", "Pop", "Trance", "K-Pop", "J-Pop"] },
  { name: "Digital Perreo", genres: ["Reggaeton", "Latin Pop", "Dancehall", "Latin", "Salsa"], regions: ["Latin America"] },
  { name: "Diaspora Bounce", genres: ["Afrobeats", "Amapiano", "Dancehall", "Reggae"], regions: ["Africa", "UK", "Europe"] },
  { name: "Electric Daydreams", genres: ["EDM", "Pop", "Techno"] },
  { name: "Heartbreak Hotline", genres: ["R&B", "Pop", "Alternative", "Soul"] },
  { name: "Sunday Soul", genres: ["Soul", "Gospel", "R&B", "Jazz", "Blues"] },
  { name: "Tokyo Seoul Express", genres: ["K-Pop", "J-Pop", "Pop", "EDM"] },
  { name: "Americana Underground", genres: ["Country", "Folk", "Blues", "Rock", "Indie Rock"] },
  { name: "Mosh Pit Radio", genres: ["Punk", "Metal", "Rock", "Grunge"] },
  { name: "Latin Underground", genres: ["Latin", "Latin Pop", "Latin Rap", "Reggaeton", "Salsa"] },
].map((playlist, index) => ({
  ...playlist,
  updateDay: SCENE_UPDATE_DAYS[index % SCENE_UPDATE_DAYS.length],
}));

const PLAYLIST_CONFIGS = {
  underground: UNDERGROUND_RADAR_PLAYLISTS,
  scene: SCENE_REPORTS_PLAYLISTS,
};

const GENRE_ALIAS_MAP = {
  Rap: ["Rap"],
  "Melodic Rap": ["Melodic Rap", "Pop Rap"],
  "Alternative Rap": ["Alternative Rap", "Experimental Rap"],
  Trap: ["Trap"],
  "Hip-Hop": ["Hip-Hop", "Hip Hop"],
  Grime: ["Grime"],
  Jungle: ["Jungle"],
  Drill: ["Drill"],
  "UK Drill": ["UK Drill"],
  "R&B": ["R&B", "RNB", "Rhythm and Blues", "Neo-Soul"],
  Soul: ["Soul", "Neo-Soul"],
  Blues: ["Blues"],
  Jazz: ["Jazz"],
  Gospel: ["Gospel"],
  Pop: ["Pop", "Synthpop", "Top 40", "Cantopop", "Bollywood"],
  "K-Pop": ["K-Pop", "K Pop"],
  "J-Pop": ["J-Pop", "J Pop"],
  Indie: ["Indie", "Bedroom Pop", "Lo-Fi", "Lofi"],
  Alternative: ["Alternative", "Alt-Rock", "Alt Rock"],
  "Indie Rock": ["Indie Rock"],
  Rock: ["Rock", "Alt-Rock", "Alt Rock"],
  Grunge: ["Grunge"],
  Punk: ["Punk"],
  Metal: ["Metal", "Heavy Metal"],
  Folk: ["Folk", "Singer-Songwriter", "Acoustic"],
  Country: ["Country", "Americana", "Sertanejo"],
  EDM: ["EDM", "Electronic Dance"],
  Electronic: ["Electronic", "Electronica", "Experimental", "Ambient", "Lo-Fi", "Lofi", "UK Garage", "DnB"],
  House: ["House"],
  Techno: ["Techno"],
  Trance: ["Trance"],
  Afrobeats: ["Afrobeats", "Afropop", "Afro-Fusion", "Highlife"],
  Amapiano: ["Amapiano", "Gqom", "Kwaito", "Afro-House"],
  Dancehall: ["Dancehall"],
  Reggae: ["Reggae", "Dub"],
  Latin: ["Latin"],
  "Latin Rap": ["Latin Rap", "Latin Trap"],
  "Latin Pop": ["Latin Pop"],
  Reggaeton: ["Reggaeton", "Dembow", "Funk Carioca"],
  Salsa: ["Salsa", "Cumbia"],
  "Go-Go": ["Go-Go", "Go Go"],
};

const CAREER_STAGE_PRIORITY = {
  Unknown: 100,
  "Local Artist": 95,
  "Local Buzz": 90,
  "Underground Artist": 85,
  "Cult Favorite": 75,
  "Breakout Artist": 45,
  "Mainstream Artist": 20,
  "A-List Star": 10,
  "Global Superstar": 5,
  "Legacy Icon": 0,
};

const PLAYLIST_LIFECYCLE_PRIORITY = {
  hot: 100,
  trending: 92,
  momentum: 84,
  strongstart: 76,
  stable: 68,
  hit: 62,
  sleeperhit: 58,
  solid: 52,
  cultclassic: 44,
  deepcut: 38,
  declining: 24,
  archived: 8,
  // Also support capitalized versions for backward compatibility
  Hot: 100,
  Trending: 92,
  Momentum: 84,
  StrongStart: 76,
  Stable: 68,
  Hit: 62,
  SleeperHit: 58,
  Solid: 52,
  CultClassic: 44,
  DeepCut: 38,
  Declining: 24,
  Archived: 8,
};

const UNDERGROUND_ELIGIBLE_STATES = new Set([
  "hot", "trending", "momentum", "strongstart", "stable",
  "sleeperhit", "solid", "cultclassic", "deepcut",
]);

const SCENE_ELIGIBLE_STATES = new Set([
  "hot", "trending", "momentum", "strongstart", "stable",
  "hit", "sleeperhit", "solid", "cultclassic",
]);

const getCareerStagePriority = (careerStage) => CAREER_STAGE_PRIORITY[careerStage] ?? 70;
const getLifecyclePriority = (lifecycleState) => {
  const normalized = String(lifecycleState || '').toLowerCase();
  return PLAYLIST_LIFECYCLE_PRIORITY[normalized] ?? PLAYLIST_LIFECYCLE_PRIORITY[lifecycleState] ?? 0;
};

const getReleaseTimestamp = (release) => {
  const candidate = release.release_date || release.created_date || release.created_at;
  const timestamp = candidate ? new Date(candidate).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getDiscoveryPriority = (release, profileById) => {
  const profile = profileById.get(release.artist_id);
  return {
    stagePriority: getCareerStagePriority(profile?.career_stage || "Unknown"),
    lifecyclePriority: getLifecyclePriority(release.lifecycle_state),
    recency: getReleaseTimestamp(release),
    streamFloor: release.lifetime_streams || 0,
  };
};

const sortDiscoveryReleases = (left, right, profileById) => {
  const leftPriority = getDiscoveryPriority(left, profileById);
  const rightPriority = getDiscoveryPriority(right, profileById);

  if (leftPriority.stagePriority !== rightPriority.stagePriority) {
    return rightPriority.stagePriority - leftPriority.stagePriority;
  }

  if (leftPriority.lifecyclePriority !== rightPriority.lifecyclePriority) {
    return rightPriority.lifecyclePriority - leftPriority.lifecyclePriority;
  }

  if (leftPriority.recency !== rightPriority.recency) {
    return rightPriority.recency - leftPriority.recency;
  }

  if (leftPriority.streamFloor !== rightPriority.streamFloor) {
    return leftPriority.streamFloor - rightPriority.streamFloor;
  }

  return (left.title || left.release_name || "").localeCompare(right.title || right.release_name || "");
};

const sortDiscoveryGroups = (left, right) => {
  if (left.stagePriority !== right.stagePriority) {
    return right.stagePriority - left.stagePriority;
  }

  if (left.recency !== right.recency) {
    return right.recency - left.recency;
  }

  if (left.streamFloor !== right.streamFloor) {
    return left.streamFloor - right.streamFloor;
  }

  if (left.releaseCount !== right.releaseCount) {
    return right.releaseCount - left.releaseCount;
  }

  return left.name.localeCompare(right.name);
};

const diversifyReleasesByArtist = (releases, maxPerArtist = 2) => {
  const counts = new Map();
  return releases.filter((release) => {
    const artistId = release.artist_id || "__unknown__";
    const currentCount = counts.get(artistId) || 0;
    if (currentCount >= maxPerArtist) {
      return false;
    }
    counts.set(artistId, currentCount + 1);
    return true;
  });
};

const pickFeaturedRelease = (releases, usedArtistIds) =>
  releases.find((release) => !usedArtistIds.has(release.artist_id)) || releases[0] || null;

const getPlaylistConfigs = (type) => PLAYLIST_CONFIGS[type] || [];

const getEmptyPlaylistMeta = (type) =>
  ({
    underground: "Weekly underground discovery refresh",
    scene: "Weekly scene report refresh",
  }[type] || "Weekly playlist refresh");

const getPlaylistDescription = (config, type, releaseCount) => {
  if (releaseCount > 0) {
    const genrePreview = (config.genres || []).slice(0, 3).join(", ");
    if (type === "underground") {
      return `${genrePreview} cuts bubbling up through the underground.`;
    }
    return `${genrePreview} tracks shaping the local scene right now.`;
  }

  return getEmptyPlaylistMeta(type);
};

const normalizeGenreLabel = (genre) => {
  const normalized = String(genre || "").trim().toLowerCase();
  return normalized;
};

const expandGenreLabel = (genre) => {
  const aliases = GENRE_ALIAS_MAP[genre] || [genre];
  return aliases.map(normalizeGenreLabel);
};

const splitGenreLabels = (genreValue) =>
  String(genreValue || "")
    .split(/\s*\/\s*|\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildGenreMatcherSet = (genres = []) => {
  const values = new Set();
  genres.forEach((genre) => {
    expandGenreLabel(genre).forEach((label) => values.add(label));
  });
  return values;
};

const getExpandedGenreLabels = (genreValue) =>
  splitGenreLabels(genreValue).flatMap((label) => expandGenreLabel(label));

const matchesPlaylistConfig = (release, profileById, config) => {
  const profile = profileById.get(release.artist_id);
  const region = release.primary_region || profile?.region;
  const playlistGenreSet = buildGenreMatcherSet(config.genres);
  const releaseGenres = getExpandedGenreLabels(release.genre);
  const profileGenres = getExpandedGenreLabels(profile?.genre);
  const hasReleaseGenreMatch =
    Array.isArray(config.genres) &&
    releaseGenres.some((label) => playlistGenreSet.has(normalizeGenreLabel(label)));
  const hasStrictProfileGenreMatch =
    Array.isArray(config.genres) &&
    releaseGenres.length === 0 &&
    profileGenres.length > 0 &&
    profileGenres.every((label) => playlistGenreSet.has(normalizeGenreLabel(label)));
  const hasRegionMatch = Array.isArray(config.regions) && config.regions.includes(region);
  const hasAnyGenreMatch = hasReleaseGenreMatch || hasStrictProfileGenreMatch;

  if (Array.isArray(config.genres) && Array.isArray(config.regions)) {
    return hasAnyGenreMatch;
  }

  if (Array.isArray(config.genres)) return hasAnyGenreMatch;
  if (Array.isArray(config.regions)) return hasRegionMatch;
  return false;
};

export const buildPlaylists = (releases, profileById, type) => {
  const eligible = releases.filter((release) => {
    const normalizedState = String(release.lifecycle_state || '').toLowerCase();
    if (type === "underground") {
      return UNDERGROUND_ELIGIBLE_STATES.has(normalizedState);
    }
    return SCENE_ELIGIBLE_STATES.has(normalizedState);
  });
  const usedFeaturedArtistIds = new Set();
  const maxPerArtist = type === "underground" ? 2 : 3;

  const playlistFromGroup = (config, releasesGroup) => {
    const sortedReleases = [...releasesGroup].sort((left, right) => sortDiscoveryReleases(left, right, profileById));
    const diverseReleases = diversifyReleasesByArtist(sortedReleases, maxPerArtist);
    const finalReleases = diverseReleases.length > 0 ? diverseReleases : sortedReleases;
    const featured = pickFeaturedRelease(finalReleases, usedFeaturedArtistIds);
    const featuredPriority = featured ? getDiscoveryPriority(featured, profileById) : { stagePriority: 0, recency: 0, streamFloor: 0 };
    const totalStreams = finalReleases.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0);
    const estimatedSaves = estimatePlaylistSaves(finalReleases, type);

    if (featured?.artist_id) {
      usedFeaturedArtistIds.add(featured.artist_id);
    }

    return {
      name: config.name,
      description: getPlaylistDescription(config, type, finalReleases.length),
      followers: formatStreams(totalStreams),
      saves: formatCompactCount(estimatedSaves),
      cover: featured?.cover_artwork_url || finalReleases.find((release) => release.cover_artwork_url)?.cover_artwork_url || null,
      updateDay: config.updateDay ?? 5,
      covers: finalReleases.map((release) => release.cover_artwork_url).filter(Boolean).slice(0, 4),
      releases: finalReleases.slice(0, 25),
      stagePriority: featuredPriority.stagePriority,
      recency: featuredPriority.recency,
      streamFloor: featuredPriority.streamFloor,
      releaseCount: finalReleases.length,
      genres: config.genres.join(" / "),
    };
  };

  return getPlaylistConfigs(type)
    .map((config) => {
      const matchedReleases = eligible.filter((release) => matchesPlaylistConfig(release, profileById, config));
      return playlistFromGroup(config, matchedReleases);
    })
    .sort(sortDiscoveryGroups);
};
