const formatStreams = (value) => `${(value || 0).toLocaleString()} streams`;
const formatCompactCount = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(Math.max(0, Math.round(value || 0)));

const PLAYLIST_UPDATE_DAY = 5;

const UNDERGROUND_RADAR_PLAYLISTS = [
  { name: "Underground Radar", genres: ["Rap", "Hip-Hop", "Trap", "Alternative", "Indie", "Drill", "Alternative Rap"] },
  { name: "Street Rotation", genres: ["Rap", "Hip-Hop", "Trap", "Melodic Rap", "Drill", "Latin Rap"] },
  { name: "Basement Tapes", genres: ["Indie", "Alternative", "Folk", "Rock", "Grunge", "Indie Rock"] },
  { name: "Raw & Uncut", genres: ["Rap", "Hip-Hop", "UK Drill", "Drill", "Go-Go"] },
  { name: "Night Market", genres: ["Afrobeats", "Amapiano", "Dancehall", "Reggaeton", "Reggae", "Salsa"], regions: ["Africa", "Latin America", "Europe", "UK"] },
  { name: "Lo-Fi Sessions", genres: ["Indie", "Folk", "Pop", "Jazz", "Blues"] },
  { name: "UK Drill Vault", genres: ["UK Drill", "Rap", "Hip-Hop"], regions: ["UK"] },
  { name: "Indie Pulse", genres: ["Indie", "Alternative", "Rock", "Pop", "Indie Rock"] },
  { name: "404 Dreams", genres: ["Pop", "Alternative", "EDM", "K-Pop"] },
  { name: "Late Night Upload", genres: ["Melodic Rap", "Trap", "Hip-Hop", "R&B"] },
  { name: "Chrome Hearts & 808s", genres: ["Melodic Rap", "Trap", "Rap"] },
  { name: "Heat From The Block", genres: ["Rap", "Hip-Hop", "UK Drill", "Drill", "Go-Go", "Latin Rap"] },
  { name: "Cloud Surfing", genres: ["Melodic Rap", "Trap", "Hip-Hop"] },
  { name: "Plugged In Underground", genres: ["Melodic Rap", "Trap", "Hip-Hop"] },
  { name: "No Label Energy", genres: ["Rap", "Hip-Hop", "UK Drill", "Alternative Rap"] },
  // New playlists for expanded genre coverage
  { name: "Global Wave", genres: ["K-Pop", "J-Pop", "Latin", "Salsa", "Reggae", "Latin Pop"] },
  { name: "Heavy Rotation", genres: ["Metal", "Punk", "Rock", "Grunge", "Indie Rock"] },
  { name: "Roots & Heritage", genres: ["Blues", "Jazz", "Soul", "Gospel", "Folk", "Country"] },
  { name: "City Streets", genres: ["Go-Go", "Drill", "UK Drill", "Latin Rap", "Rap"] },
];

const SCENE_REPORTS_PLAYLISTS = [
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
  // New playlists for expanded genre coverage
  { name: "Sunday Soul", genres: ["Soul", "Gospel", "R&B", "Jazz", "Blues"] },
  { name: "Tokyo Seoul Express", genres: ["K-Pop", "J-Pop", "Pop", "EDM"] },
  { name: "Americana Underground", genres: ["Country", "Folk", "Blues", "Rock", "Indie Rock"] },
  { name: "Mosh Pit Radio", genres: ["Punk", "Metal", "Rock", "Grunge"] },
  { name: "Latin Underground", genres: ["Latin", "Latin Pop", "Latin Rap", "Reggaeton", "Salsa"] },
];

const PLAYLIST_CONFIGS = {
  underground: UNDERGROUND_RADAR_PLAYLISTS,
  scene: SCENE_REPORTS_PLAYLISTS,
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

const getCareerStagePriority = (careerStage) => CAREER_STAGE_PRIORITY[careerStage] ?? 70;

const getReleaseTimestamp = (release) => {
  const candidate = release.release_date || release.created_date || release.created_at;
  const timestamp = candidate ? new Date(candidate).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getDiscoveryPriority = (release, profileById) => {
  const profile = profileById.get(release.artist_id);
  return {
    stagePriority: getCareerStagePriority(profile?.career_stage || "Unknown"),
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

const getPlaylistConfigs = (type) => PLAYLIST_CONFIGS[type] || [];

const getEmptyPlaylistMeta = (type) => ({
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

const matchesPlaylistConfig = (release, profileById, config) => {
  const profile = profileById.get(release.artist_id);
  const genre = release.genre || profile?.genre;
  const region = release.primary_region || profile?.region;
  const hasGenreMatch = Array.isArray(config.genres) && config.genres.includes(genre);
  const hasRegionMatch = Array.isArray(config.regions) && config.regions.includes(region);

  if (Array.isArray(config.genres) && Array.isArray(config.regions)) {
    return hasGenreMatch || hasRegionMatch;
  }

  if (Array.isArray(config.genres)) return hasGenreMatch;
  if (Array.isArray(config.regions)) return hasRegionMatch;
  return false;
};

export const buildPlaylists = (releases, profileById, type) => {
  const eligible = releases.filter((release) => {
    if (type === "underground") {
      return release.lifecycle_state === "Hot" || release.lifecycle_state === "Momentum";
    }
    return release.lifecycle_state === "Stable" || release.lifecycle_state === "Trending";
  });

  const playlistFromGroup = (label, releasesGroup, suffix) => {
    const sortedReleases = [...releasesGroup].sort((left, right) => sortDiscoveryReleases(left, right, profileById));
    const featured = sortedReleases[0];
    const featuredPriority = featured ? getDiscoveryPriority(featured, profileById) : { stagePriority: 0, recency: 0, streamFloor: 0 };
    const totalStreams = sortedReleases.reduce((sum, release) => sum + (release.lifetime_streams || 0), 0);
    const estimatedSaves = Math.max(sortedReleases.length * 140, Math.round(totalStreams / 18));

    return {
      name: label,
      description: getPlaylistDescription({ genres: suffix ? suffix.split(" â€¢ ") : [] }, type, sortedReleases.length),
      followers: formatStreams(totalStreams),
      saves: formatCompactCount(estimatedSaves),
      cover: featured?.cover_artwork_url || sortedReleases.find((release) => release.cover_artwork_url)?.cover_artwork_url || null,
      updateDay: PLAYLIST_UPDATE_DAY,
      covers: sortedReleases
        .map((release) => release.cover_artwork_url)
        .filter(Boolean)
        .slice(0, 4),
      releases: sortedReleases.slice(0, 25),
      stagePriority: featuredPriority.stagePriority,
      recency: featuredPriority.recency,
      streamFloor: featuredPriority.streamFloor,
      releaseCount: sortedReleases.length,
      genres: suffix,
    };
  };

  return getPlaylistConfigs(type)
    .map((config) => {
      const matchedReleases = eligible.filter((release) => matchesPlaylistConfig(release, profileById, config));

      return playlistFromGroup(config.name, matchedReleases, config.genres.join(" • "));
    })
    .sort(sortDiscoveryGroups);
};
