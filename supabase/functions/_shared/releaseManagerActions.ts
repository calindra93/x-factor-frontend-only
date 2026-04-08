/**
 * releaseManagerActions.ts — Pure validation + payload-building logic
 * for the three new releaseManager actions (Plan 050 v2).
 *
 * Separated from index.ts for testability. No DB calls here.
 */

// ─── Constants (re-exported for tests) ────────────────────────────────────────

export const RELEASE_ENERGY_COST_SINGLE = 10;
export const RELEASE_ENERGY_COST_PROJECT = 20;

const ACTIVE_ALBUM_PHASES = ['Hot', 'Trending', 'Momentum', 'Stable'];

// ─── Idempotency key builder ──────────────────────────────────────────────────

export function buildIdempotencyKey(
  actionType: 'deluxe' | 'sfa' | 'lead',
  artistId: string,
  ids: Record<string, string>,
): string {
  switch (actionType) {
    case 'deluxe':
      return `${artistId}:deluxe:${ids.parentReleaseId}:${ids.deluxeType}`;
    case 'sfa':
      return `${artistId}:sfa:${ids.songId}:${ids.parentReleaseId}`;
    case 'lead':
      return `${artistId}:lead:${ids.songId}:${ids.projectId}`;
  }
}

// ─── createDeluxe ─────────────────────────────────────────────────────────────

interface CreateDeluxeInput {
  artistId: string;
  parentReleaseId: string;
  deluxeType: string;
  bonusTrackIds: string[];
}

export function validateCreateDeluxe(input: CreateDeluxeInput): string | null {
  if (!input.artistId) return 'artistId is required';
  if (!input.parentReleaseId) return 'parentReleaseId is required';
  if (!input.deluxeType) return 'deluxeType is required';
  if (!input.bonusTrackIds || input.bonusTrackIds.length === 0) {
    return 'At least one bonus track is required';
  }
  return null;
}

interface BuildDeluxePayloadInput {
  parentRelease: Record<string, unknown>;
  deluxeType: string;
  bonusTrackIds: string[];
  profile: Record<string, unknown>;
  globalTurnId: number;
}

export function buildDeluxePayload(input: BuildDeluxePayloadInput): Record<string, unknown> {
  const { parentRelease, deluxeType, bonusTrackIds, profile, globalTurnId } = input;

  const parentTracklist = Array.isArray(parentRelease.tracklist)
    ? parentRelease.tracklist as string[]
    : [];

  const deluxeLabel = deluxeType === 'super_deluxe' ? 'Super Deluxe'
    : deluxeType === 'anniversary' ? 'Anniversary Edition'
    : deluxeType === 'expanded' ? 'Expanded Edition'
    : 'Deluxe Edition';

  const title = `${parentRelease.release_name || parentRelease.title} (${deluxeLabel})`;

  return {
    artist_id: profile.id,
    title,
    release_name: title,
    project_type: parentRelease.project_type || 'Album',
    cover_artwork_url: parentRelease.cover_artwork_url || '',
    release_date: new Date().toISOString().split('T')[0],
    lifecycle_state: 'Hot',
    release_status: 'released',
    project_status: 'released',
    is_deluxe: true,
    deluxe_type: deluxeType,
    parent_release_id: parentRelease.id,
    tracklist: [...parentTracklist, ...bonusTrackIds],
    lifecycle_state_changed_turn: globalTurnId,
    scheduled_turn: globalTurnId,
    platform_streams: { AppleCore: 0, Streamify: 0, Soundburst: 0 },
    followers_at_release: Number((profile.fans as number | null) ?? (profile.followers as number | null) ?? 0),
    hot_phase_streams: 0,
    idempotency_key: buildIdempotencyKey('deluxe', profile.id as string, {
      parentReleaseId: parentRelease.id as string,
      deluxeType,
    }),
    platforms: parentRelease.platforms || [],
    primary_region: parentRelease.primary_region || profile.region || 'United States',
    target_regions: parentRelease.target_regions || [],
    metadata: {
      original_release_id: parentRelease.id,
      original_title: parentRelease.release_name || parentRelease.title,
      bonus_track_count: bonusTrackIds.length,
      deluxe_type: deluxeType,
    },
  };
}

// ─── releaseSingleFromAlbum ───────────────────────────────────────────────────

interface ReleaseSingleFromAlbumInput {
  artistId: string;
  songId: string;
  parentReleaseId: string;
}

export function validateReleaseSingleFromAlbum(input: ReleaseSingleFromAlbumInput): string | null {
  if (!input.artistId) return 'artistId is required';
  if (!input.songId) return 'songId is required';
  if (!input.parentReleaseId) return 'parentReleaseId is required';
  return null;
}

/**
 * Derive lifecycle state for a single-from-album based on parent album state.
 * Port of CatalogActionsModal.jsx lines 244–285.
 */
export function deriveLifecycleStateFromAlbum(
  albumLifecycleState: string | null,
  songLifetimeStreams: number,
): string {
  const albumIsActive = ACTIVE_ALBUM_PHASES.includes(albumLifecycleState || '');
  if (albumIsActive && songLifetimeStreams > 10000) return 'Trending';
  if (albumIsActive) return 'Hot';
  return 'Stable';
}

interface BuildSFAPayloadInput {
  parentRelease: Record<string, unknown>;
  song: Record<string, unknown>;
  profile: Record<string, unknown>;
  globalTurnId: number;
}

export function buildSingleFromAlbumPayload(input: BuildSFAPayloadInput): Record<string, unknown> {
  const { parentRelease, song, profile, globalTurnId } = input;

  // Stream metric inheritance — prefer per-track if available, else prorate
  const songStreams = (song.lifetime_streams as number) ?? 0;
  const songPlatformStreams = (song.platform_streams as Record<string, number>) || {};
  let singlePlatformStreams: Record<string, number>;
  let singleLifetimeStreams: number;

  const hasSongStreams = songStreams > 0 ||
    Object.values(songPlatformStreams).some((v) => v > 0);

  if (hasSongStreams) {
    singlePlatformStreams = {
      Streamify: songPlatformStreams.Streamify ?? 0,
      Soundburst: songPlatformStreams.Soundburst ?? 0,
      AppleCore: songPlatformStreams.AppleCore ?? 0,
    };
    singleLifetimeStreams = songStreams;
  } else {
    const parentTracklist = Array.isArray(parentRelease.tracklist)
      ? parentRelease.tracklist as string[]
      : [];
    const trackCount = Math.max(1, parentTracklist.length);
    const albumStreams = (parentRelease.platform_streams as Record<string, number>) || {};
    singlePlatformStreams = {
      Streamify: Math.floor((albumStreams.Streamify ?? 0) / trackCount),
      Soundburst: Math.floor((albumStreams.Soundburst ?? 0) / trackCount),
      AppleCore: Math.floor((albumStreams.AppleCore ?? 0) / trackCount),
    };
    singleLifetimeStreams = Math.floor(((parentRelease.lifetime_streams as number) ?? 0) / trackCount);
  }

  const derivedLifecycle = deriveLifecycleStateFromAlbum(
    parentRelease.lifecycle_state as string | null,
    singleLifetimeStreams,
  );

  return {
    artist_id: profile.id,
    title: song.title,
    release_name: song.title,
    project_type: 'Single',
    cover_artwork_url: song.cover_artwork_url || parentRelease.cover_artwork_url || '',
    release_date: new Date().toISOString().split('T')[0],
    lifecycle_state: derivedLifecycle,
    release_status: 'released',
    project_status: 'released',
    parent_release_id: parentRelease.id,
    tracklist: [song.id],
    lifecycle_state_changed_turn: globalTurnId,
    scheduled_turn: globalTurnId,
    platform_streams: singlePlatformStreams,
    lifetime_streams: singleLifetimeStreams,
    followers_at_release: Number((profile.fans as number | null) ?? (profile.followers as number | null) ?? 0),
    hot_phase_streams: 0,
    idempotency_key: buildIdempotencyKey('sfa', profile.id as string, {
      songId: song.id as string,
      parentReleaseId: parentRelease.id as string,
    }),
    platforms: parentRelease.platforms || [],
    primary_region: parentRelease.primary_region || profile.region || 'United States',
    target_regions: parentRelease.target_regions || [],
    metadata: {
      from_album: parentRelease.release_name || parentRelease.title,
      original_album_id: parentRelease.id,
      re_release_type: 'single_from_album',
      streams_inherited_from_album: !hasSongStreams,
    },
  };
}

// ─── releaseLeadSingle ────────────────────────────────────────────────────────

interface ReleaseLeadSingleInput {
  artistId: string;
  songId: string;
  projectId: string;
}

export function validateReleaseLeadSingle(input: ReleaseLeadSingleInput): string | null {
  if (!input.artistId) return 'artistId is required';
  if (!input.songId) return 'songId is required';
  if (!input.projectId) return 'projectId is required';
  return null;
}

interface BuildLeadSinglePayloadInput {
  project: Record<string, unknown>;
  song: Record<string, unknown>;
  profile: Record<string, unknown>;
  globalTurnId: number;
}

export function buildLeadSinglePayload(input: BuildLeadSinglePayloadInput): Record<string, unknown> {
  const { project, song, profile, globalTurnId } = input;

  return {
    artist_id: profile.id,
    title: song.title || 'Lead Single',
    release_name: song.title || 'Lead Single',
    project_type: 'Single',
    cover_artwork_url: project.cover_artwork_url || '',
    release_date: new Date().toISOString().split('T')[0],
    lifecycle_state: 'Hot',
    release_status: 'released',
    project_status: 'released',
    tracklist: [song.id],
    lifecycle_state_changed_turn: globalTurnId,
    scheduled_turn: globalTurnId,
    platform_streams: { AppleCore: 0, Streamify: 0, Soundburst: 0 },
    followers_at_release: Number((profile.fans as number | null) ?? (profile.followers as number | null) ?? 0),
    hot_phase_streams: 0,
    idempotency_key: buildIdempotencyKey('lead', profile.id as string, {
      songId: song.id as string,
      projectId: project.id as string,
    }),
    platforms: ['streamify', 'soundburst', 'applecore'],
    primary_region: profile.region || 'United States',
    metadata: {
      parent_project_id: project.id,
      is_lead_single: true,
      album_name: project.name || project.title,
    },
  };
}
