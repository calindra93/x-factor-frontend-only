export const ARTIST_PICK_DURATION_OPTIONS = ['7d', '14d', '30d', 'indefinite'];

const ARTIST_PICK_DURATION_TURNS = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  indefinite: null,
};

const ARTIST_PICK_BOOST_TIERS = {
  '7d': 'light',
  '14d': 'steady',
  '30d': 'moderate',
  indefinite: 'evergreen',
};

const ARTIST_PICK_FIELDS = [
  'featured_release_id',
  'artist_pick_message',
  'artist_pick_background_image',
  'artist_pick_duration_turns',
  'artist_pick_started_at',
  'artist_pick_expires_at',
  'artist_pick_boost_tier',
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const getReleaseTimestamp = (release) => {
  const value = release?.release_date || release?.created_date || release?.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeDuration = (duration) => {
  if (typeof duration !== 'string') return '7d';
  const normalized = duration.trim().toLowerCase();
  return ARTIST_PICK_DURATION_OPTIONS.includes(normalized) ? normalized : '7d';
};

const cleanOptionalText = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

const toIsoString = (value) => {
  const date = value ? new Date(value) : new Date();
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
};

export function getArtistPickDurationTurns(duration) {
  return ARTIST_PICK_DURATION_TURNS[normalizeDuration(duration)];
}

export function getArtistPickBoostTier(duration) {
  return ARTIST_PICK_BOOST_TIERS[normalizeDuration(duration)];
}

export function getArtistPickDurationLabel(durationTurns) {
  if (durationTurns == null) return 'Indefinite';
  return `${durationTurns} turns`;
}

export function sortArtistPickReleases(releases = []) {
  if (!Array.isArray(releases)) return [];

  return [...releases].sort((left, right) => {
    const rightTime = getReleaseTimestamp(right);
    const leftTime = getReleaseTimestamp(left);

    if (rightTime !== leftTime) return rightTime - leftTime;

    return String(left?.release_name || left?.title || '').localeCompare(String(right?.release_name || right?.title || ''));
  });
}

export function viewerOwnsArtistPickProfile(profile, viewerAccountId) {
  const profileAccountId = String(profile?.user_account_id || '').trim();
  const normalizedViewerId = String(viewerAccountId || '').trim();

  if (!profileAccountId || !normalizedViewerId) return false;
  return profileAccountId === normalizedViewerId;
}

export function buildArtistPickPayload({ releaseId, message = '', backgroundImage = '', duration = '7d', nowIso } = {}) {
  const normalizedDuration = normalizeDuration(duration);
  const startedAt = toIsoString(nowIso);
  const durationTurns = getArtistPickDurationTurns(normalizedDuration);
  const expiresAt = durationTurns == null
    ? null
    : new Date(new Date(startedAt).getTime() + (durationTurns * ONE_DAY_MS)).toISOString();

  return {
    featured_release_id: releaseId || null,
    artist_pick_message: cleanOptionalText(message),
    artist_pick_background_image: cleanOptionalText(backgroundImage),
    artist_pick_duration_turns: durationTurns,
    artist_pick_started_at: startedAt,
    artist_pick_expires_at: expiresAt,
    artist_pick_boost_tier: getArtistPickBoostTier(normalizedDuration),
  };
}

export function isArtistPickExpired(profile, nowIso) {
  const expiresAt = profile?.artist_pick_expires_at;
  if (!expiresAt) return false;

  return new Date(expiresAt).getTime() <= new Date(toIsoString(nowIso)).getTime();
}

export function clearExpiredArtistPick(profile, nowIso) {
  if (!profile || typeof profile !== 'object') return profile;
  if (!isArtistPickExpired(profile, nowIso)) return profile;

  return ARTIST_PICK_FIELDS.reduce((nextProfile, field) => {
    nextProfile[field] = null;
    return nextProfile;
  }, { ...profile });
}
