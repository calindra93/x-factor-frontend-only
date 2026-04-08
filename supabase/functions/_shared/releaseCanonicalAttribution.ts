/**
 * RELEASE CANONICAL ATTRIBUTION MODULE
 * Prevents double-counting of streams and revenue across remixes, deluxe versions, and singles-from-albums
 */

interface Song {
  id: string;
  title: string;
  release_id?: string;
  is_remix?: boolean;
  original_song_id?: string;
  remix_type?: string;
  remix_artist_ids?: string[];
  genre?: string;
  quality?: number;
  era_id?: string;
}

interface Release {
  id: string;
  title: string;
  project_type?: string;
  is_deluxe?: boolean;
  parent_release_id?: string;
  deluxe_type?: string;
  is_lead_single?: boolean;
  lead_single_release_id?: string;
  lifecycle_state?: string;
  tracklist?: string[];
  metadata?: Record<string, any>;
}

interface AttributionResult {
  canonicalReleaseId: string;
  attributionType: 'original' | 'deluxe' | 'single' | 'remix';
  streams: number;
  revenue: number;
  shouldChart: boolean;
  chartNotes?: string;
}

/**
 * Determines canonical attribution for a song's streams and revenue
 * Prevents double-counting when songs exist in multiple releases
 */
export function getCanonicalAttribution(
  song: Song,
  allReleases: Release[],
  streams: number,
  revenue: number
): AttributionResult {
  // REMIX HANDLING: Remixes chart separately but don't inherit original streams
  if (song.is_remix) {
    if (!song.original_song_id) {
      console.warn(`[CanonicalAttribution] Remix ${song.id} missing original_song_id`);
    }
    return {
      canonicalReleaseId: song.release_id || 'unknown',
      attributionType: 'remix',
      streams,
      revenue,
      shouldChart: true,
      chartNotes: song.original_song_id ? `Remix of original track` : 'Remix (origin unknown)'
    };
  }

  // DELUXE HANDLING: Songs in deluxe editions attribute to parent release
  if (song.release_id) {
    const songRelease = allReleases.find(r => r.id === song.release_id);
    if (songRelease?.is_deluxe && songRelease.parent_release_id) {
      const parentRelease = allReleases.find(r => r.id === songRelease.parent_release_id);
      if (parentRelease) {
        return {
          canonicalReleaseId: parentRelease.id,
          attributionType: 'deluxe',
          streams,
          revenue,
          shouldChart: false, // Deluxe tracks don't chart separately from parent
          chartNotes: `Attributed to parent album: ${parentRelease.title}`
        };
      }
    }
  }

  // SINGLE FROM ALBUM/EP HANDLING: Prevent double-counting
  if (song.release_id) {
    const songRelease = allReleases.find(r => r.id === song.release_id);
    
    // Check if this is a single that also exists in an album/EP
    if (songRelease?.project_type?.toLowerCase() === 'single') {
      // Attribute to the single itself (not parent album)
      // This allows singles to chart separately from parent albums
      return {
        canonicalReleaseId: song.release_id,
        attributionType: 'single',
        streams,
        revenue,
        shouldChart: true,
        chartNotes: 'Single release'
      };
    }
  }

  // DEFAULT: Original attribution
  return {
    canonicalReleaseId: song.release_id || 'unknown',
    attributionType: 'original',
    streams,
    revenue,
    shouldChart: true
  };
}

/**
 * Validates remix creation requirements
 */
export function validateRemixCreation(song: Song, originalSongId?: string): { valid: boolean; error?: string } {
  if (!song.is_remix) {
    return { valid: true };
  }

  if (!originalSongId && !song.original_song_id) {
    return { 
      valid: false, 
      error: 'Remixes must specify original_song_id' 
    };
  }

  if (originalSongId === song.id) {
    return { 
      valid: false, 
      error: 'Remix cannot reference itself as original' 
    };
  }

  return { valid: true };
}

/**
 * Validates deluxe creation requirements
 */
export function validateDeluxeCreation(
  parentReleaseId: string, 
  deluxeType: string, 
  allReleases: Release[]
): { valid: boolean; error?: string } {
  const parentRelease = allReleases.find(r => r.id === parentReleaseId);
  if (!parentRelease) {
    return { 
      valid: false, 
      error: 'Parent release not found' 
    };
  }

  // Check for existing deluxe of same type
  const existingDeluxe = allReleases.find(r => 
    r.parent_release_id === parentReleaseId && 
    r.deluxe_type === deluxeType
  );

  if (existingDeluxe) {
    return { 
      valid: false, 
      error: `Deluxe edition of type "${deluxeType}" already exists for this release` 
    };
  }

  return { valid: true };
}

/**
 * Determines chart eligibility for releases
 */
export function getChartEligibility(
  release: Release, 
  allReleases: Release[], 
  songCount: number
): { eligible: boolean; reason?: string } {
  // Deluxe releases do NOT chart separately by default
  // They aggregate to parent release unless explicitly overridden
  if (release.is_deluxe && release.parent_release_id) {
    // Check for explicit chart override flag in metadata
    if (release.metadata?.chart_separately === true) {
      return { eligible: true };
    }
    
    const parentRelease = allReleases.find(r => r.id === release.parent_release_id);
    if (parentRelease) {
      return { 
        eligible: false, 
        reason: `Deluxe edition aggregates to parent: ${parentRelease.title}` 
      };
    }
  }
  
  // All non-deluxe releases are eligible
  return { eligible: true };
}
