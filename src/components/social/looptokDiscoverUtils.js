export const LOOPTOK_LIFECYCLE_TO_TREND = {
  Hot: 'peak',
  Trending: 'peak',
  Momentum: 'rising',
  Stable: 'stable',
  Fading: 'declining',
  Legacy: 'declining',
};

export function normalizeHashtag(tag) {
  const raw = String(tag || '').trim().replace(/^#+/, '');
  if (!raw) return '';
  return `#${raw}`;
}

export function formatLoopTokReleaseTitle(item) {
  return item?.release_name || item?.title || item?.sound_name || item?.name || item?.sound_id || 'Untitled';
}

export function buildLoopTokTrendingSounds(trendingSounds = [], currentArtistId = null) {
  const rankTrend = { rising: 4, peak: 3, stable: 2, declining: 1, dead: 0 };

  return [...(trendingSounds || [])]
    .filter((sound) => sound?.is_player_sound)
    .map((sound) => ({
      id: sound?.release_id || sound?.sound_id || sound?.id,
      name: formatLoopTokReleaseTitle(sound),
      genre: sound?.genre || 'Music',
      uses: Number(sound?.uses_count || 0),
      trend: sound?.trend_state || LOOPTOK_LIFECYCLE_TO_TREND[sound?.lifecycle_state] || 'stable',
      // Only show YOURS badge if it's the current player's own track
      isPlayerSound: currentArtistId ? sound?.artist_id === currentArtistId : false,
      isAnyPlayerSound: true,
      source: 'global-player',
      artist: sound?.artist_name || 'Unknown Artist',
    }))
    .sort((a, b) => {
      const trendRank = (rankTrend[b.trend] || 0) - (rankTrend[a.trend] || 0);
      return trendRank !== 0 ? trendRank : b.uses - a.uses;
    })
    .slice(0, 15);
}
