const RELEASED_STATUS_VALUES = new Set(['released', 'live', 'published', 'active']);
const RELEASED_LIFECYCLE_VALUES = new Set([
  'hot', 'trending', 'momentum', 'stable', 'declining',
  'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
  'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder',
  'archived', 'live'
]);

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNorm = (value) => String(value || '').trim().toLowerCase();

export function isReleasePublished(release) {
  if (!release || typeof release !== 'object') return false;

  const projectStatus = toNorm(release.project_status);
  const releaseStatus = toNorm(release.release_status);
  const lifecycleState = toNorm(release.lifecycle_state);

  // Primary check: release must be explicitly released
  if (RELEASED_STATUS_VALUES.has(projectStatus)) return true;
  if (RELEASED_STATUS_VALUES.has(releaseStatus)) return true;

  // Secondary check: lifecycle states only apply if already released
  if (RELEASED_LIFECYCLE_VALUES.has(lifecycleState)) {
    // Only consider lifecycle states if the release is already marked as released
    const isActuallyReleased = RELEASED_STATUS_VALUES.has(projectStatus) || RELEASED_STATUS_VALUES.has(releaseStatus);
    return isActuallyReleased;
  }

  const hasReleaseDate = Boolean(release.release_date || release.created_date || release.created_at);
  const isScheduled = projectStatus === 'scheduled' || releaseStatus === 'scheduled' || lifecycleState === 'scheduled';

  if (hasReleaseDate && !isScheduled) {
    // Fallback: no recognized status or lifecycle state — inferring from date presence.
    // Disclosed degraded mode: caller cannot distinguish this from explicit-status published.
    console.warn(
      `[releaseVisibility] isReleasePublished: date-only fallback release=${release.id ?? '(no id)'} project_status=${projectStatus} release_status=${releaseStatus} lifecycle_state=${lifecycleState}`
    );
    return true;
  }

  return false;
}

export function isReleaseOnPlatform(release, platformSlug) {
  const slug = toNorm(platformSlug);
  if (!slug) return true;

  const rawPlatforms = Array.isArray(release?.platforms) ? release.platforms : [];
  if (rawPlatforms.length === 0) return true;

  const normalized = rawPlatforms.map((entry) => toNorm(entry)).filter(Boolean);
  if (normalized.length === 0) return true;

  if (normalized.includes(slug)) return true;
  if (normalized.some((entry) => entry.includes(slug))) return true;

  const onlyUuidLike = normalized.every((entry) => UUID_LIKE.test(entry));
  if (onlyUuidLike) {
    // Disclosed degraded mode: legacy releases stored platform UUIDs instead of slugs.
    // Cannot confirm platform membership — assuming distributed until data is backfilled.
    console.warn(
      '[releaseVisibility] isReleaseOnPlatform: UUID-only platform list for release',
      release?.id ?? '(no id)',
      '— assuming distributed for platform:', platformSlug
    );
    return true;
  }

  return false;
}

export function getVisibleReleasedReleases(releases = [], { platform = null } = {}) {
  if (!Array.isArray(releases)) {
    console.warn('[releaseVisibility] getVisibleReleasedReleases: non-array input, returning []. Got:', typeof releases);
    return [];
  }

  return releases.filter((release) => {
    if (!isReleasePublished(release)) return false;
    return platform ? isReleaseOnPlatform(release, platform) : true;
  });
}

// ── Playlist eligibility sets (shared across all DSP playlist builders) ──────
// All comparisons must use toNorm(release.lifecycle_state) before checking.

export const PLAYLIST_EDITORIAL_ELIGIBLE = new Set([
  'hot', 'trending', 'momentum', 'strongstart', 'stable', 'hit',
  'sleeperhit', 'solid', 'cultclassic',
]);

export const PLAYLIST_DISCOVERY_ELIGIBLE = new Set([
  'hot', 'trending', 'momentum', 'strongstart', 'stable',
  'sleeperhit', 'solid', 'cultclassic', 'deepcut',
]);

export const isEditorialEligible = (release) =>
  PLAYLIST_EDITORIAL_ELIGIBLE.has(toNorm(release.lifecycle_state)) ||
  ['editorial', 'organic'].includes(String(release.playlist_tier || '').toLowerCase());

export const isDiscoveryEligible = (release) =>
  PLAYLIST_DISCOVERY_ELIGIBLE.has(toNorm(release.lifecycle_state));
