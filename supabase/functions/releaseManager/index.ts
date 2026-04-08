/**
 * releaseManager — Atomic Release Creation Pipeline
 *
 * Handles the entire release creation flow server-side in a single call,
 * replacing the multi-step client-side ReleaseWizard writes.
 *
 * Actions:
 *   createRelease          — Validate, create release, link songs, create merch,
 *                            update project, deduct energy, update era phase
 *   createDeluxe           — Create deluxe edition from existing release (Plan 050)
 *   releaseSingleFromAlbum — Release a single track from an existing album (Plan 050)
 *   releaseLeadSingle      — Release lead single from a project pre-album (Plan 050)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createSafeErrorResponse } from '../_shared/lib/errorHandler.ts';
import { getAuthUser } from '../_shared/lib/authFromRequest.ts';
import { applyPostReleaseEffects } from '../_shared/releaseManagerPostRelease.ts';
import { creditEnergyAtomic, deductEnergyAtomic, deductIncomeAtomic } from '../_shared/profileEnergy.ts';
import {
  validateCreateDeluxe,
  buildDeluxePayload,
  validateReleaseSingleFromAlbum,
  buildSingleFromAlbumPayload,
  validateReleaseLeadSingle,
  buildLeadSinglePayload,
  RELEASE_ENERGY_COST_SINGLE as _E_SINGLE,
  RELEASE_ENERGY_COST_PROJECT as _E_PROJECT,
} from '../_shared/releaseManagerActions.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const RELEASE_ENERGY_COST_SINGLE = 10;
const RELEASE_ENERGY_COST_PROJECT = 20;
const MAX_RELEASES_PER_TURN = 3;
const SURPRISE_DROP_EXTRA_ENERGY = 5;
const SONG_LINK_MAX_RETRIES = 2;

const MERCH_COSTS: Record<string, number> = {
  CD: 2,
  Vinyl: 8,
  Mixtape: 1,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  const traceId = crypto.randomUUID();
  return jsonResponse({ error: message, traceId, timestamp: new Date().toISOString() }, status);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'createRelease') {
      return await handleCreateRelease(req, body);
    }

    if (action === 'createDeluxe') {
      return await handleCreateDeluxe(req, body);
    }

    if (action === 'releaseSingleFromAlbum') {
      return await handleReleaseSingleFromAlbum(req, body);
    }

    if (action === 'releaseLeadSingle') {
      return await handleReleaseLeadSingle(req, body);
    }

    return errorResponse(`Unknown action: ${action}`);
  } catch (err) {
    console.error('[releaseManager] Top-level error:', err);
    const safe = createSafeErrorResponse(err, 'releaseManager');
    return jsonResponse(safe, 500);
  }
});

// ─── createRelease ────────────────────────────────────────────────────────────

interface CreateReleaseParams {
  artistId: string;
  songId?: string;
  projectId?: string;
  timing: 'now' | 'schedule' | 'surprise';
  scheduledTurns?: number;
  platforms: string[];
  regions: string[];
  merch?: MerchItem[];
  isDissTrack?: boolean;
  dissTargetId?: string;
  eraDecision?: 'continue' | 'change';
  newEraName?: string;
  isSurpriseDrop?: boolean;
  coverArtworkUrl?: string;
}

interface MerchItem {
  type: string;
  quantity: number;
  price: number;
}

async function handleCreateRelease(
  req: Request,
  body: CreateReleaseParams & { action: string },
): Promise<Response> {
  const db = getSupabaseAdmin();
  const warnings: string[] = [];

  const {
    artistId,
    songId,
    projectId,
    timing = 'now',
    scheduledTurns = 1,
    platforms = [],
    regions = [],
    merch = [],
    isDissTrack = false,
    dissTargetId,
    eraDecision = 'continue',
    newEraName,
  } = body;

  // ── 0. Basic param validation ───────────────────────────────────────────

  if (!artistId) return errorResponse('artistId is required');
  if (!songId && !projectId) return errorResponse('Either songId or projectId is required');
  if (platforms.length === 0) return errorResponse('At least one platform is required');
  if (timing === 'schedule' && scheduledTurns < 1) {
    return errorResponse('scheduledTurns must be >= 1 when timing is schedule');
  }

  const { user, error: authError } = await getAuthUser(req);
  if (!user) {
    return errorResponse(authError || 'Unauthorized', 401);
  }

  const authRole = user.app_metadata?.role || user.user_metadata?.role;
  const isAdmin = authRole === 'admin';
  if (!isAdmin && user.id !== artistId) {
    return errorResponse('Forbidden: artistId does not match authenticated user', 403);
  }

  const isSingle = !!songId && !projectId;
  const isSurpriseDrop = timing === 'surprise';

  // ── 1. Fetch profile + turn state ───────────────────────────────────────

  const [profileResult, turnStateResult] = await Promise.all([
    db.from('profiles').select('*').eq('id', artistId).maybeSingle(),
    db.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle(),
  ]);

  if (profileResult.error || !profileResult.data) {
    return errorResponse('Artist profile not found', 404);
  }
  const profile = profileResult.data;

  // Block suspended/deactivated profiles only
  if (profile.is_active === false) {
    return errorResponse('Artist profile is inactive or suspended', 403);
  }

  const globalTurnId = Number(turnStateResult.data?.global_turn_id ?? 1);

  // ── 2. Energy validation ────────────────────────────────────────────────

  const baseCost = isSingle ? RELEASE_ENERGY_COST_SINGLE : RELEASE_ENERGY_COST_PROJECT;
  const energyCost = baseCost + (isSurpriseDrop ? SURPRISE_DROP_EXTRA_ENERGY : 0);
  const currentEnergy = Number(profile.energy ?? 0);

  if (currentEnergy < energyCost) {
    return errorResponse(
      `Insufficient energy: need ${energyCost}, have ${currentEnergy}`,
    );
  }

  // ── 3. Per-turn release limit ───────────────────────────────────────────

  const { count: releasesThisTurn } = await db
    .from('releases')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('scheduled_turn', globalTurnId);

  if ((releasesThisTurn ?? 0) >= MAX_RELEASES_PER_TURN) {
    return errorResponse(
      `Release limit reached: max ${MAX_RELEASES_PER_TURN} releases per turn`,
    );
  }

  // ── 4. Resolve tracklist ────────────────────────────────────────────────

  let tracklist: string[] = [];
  let projectData: Record<string, unknown> | null = null;
  let projectType = 'Single';

  if (isSingle) {
    tracklist = [songId!];
  } else {
    // Fetch project
    const { data: proj, error: projErr } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId!)
      .eq('artist_id', artistId)
      .maybeSingle();

    if (projErr || !proj) {
      return errorResponse('Project not found', 404);
    }
    projectData = proj;
    projectType = proj.type || proj.project_type || 'Album';
    tracklist = Array.isArray(proj.tracklist) ? proj.tracklist : [];

    if (tracklist.length === 0) {
      return errorResponse('Project has no songs in its tracklist');
    }
  }

  // Verify all songs exist and are recorded
  const { data: trackSongs, error: songErr } = await db
    .from('songs')
    .select('id, artist_id, title, status, release_id, cover_artwork_url')
    .in('id', tracklist);

  if (songErr || !trackSongs) {
    return errorResponse('Failed to verify tracklist songs');
  }

  const foundIds = new Set(trackSongs.map((s: { id: string }) => s.id));
  const missingIds = tracklist.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return errorResponse(`Songs not found: ${missingIds.join(', ')}`);
  }

  const crossArtistSongs = trackSongs.filter(
    (s: { artist_id?: string | null }) => (s.artist_id || null) !== artistId,
  );
  if (crossArtistSongs.length > 0) {
    return errorResponse('One or more songs do not belong to this artist', 403);
  }

  // C2 FIX: Block songs in invalid states regardless of release_id
  // Valid states: recorded, mastered, or already released (for re-inclusion on albums/compilations)
  const blockedSongs = trackSongs.filter(
    (s: { status: string }) =>
      !['recorded', 'mastered', 'released'].includes(s.status),
  );
  if (blockedSongs.length > 0) {
    return errorResponse(
      `Songs not ready for release (status must be recorded, mastered, or released): ${blockedSongs.map((s: { id: string }) => s.id).join(', ')}`,
    );
  }

  // ── 5. Calculate merch cost ─────────────────────────────────────────────

  let totalMerchCost = 0;
  const validMerch: MerchItem[] = [];

  for (const m of merch) {
    const unitCost = MERCH_COSTS[m.type];
    if (unitCost === undefined) {
      warnings.push(`Unknown merch type "${m.type}" skipped`);
      continue;
    }
    const cost = m.quantity * unitCost;
    totalMerchCost += cost;
    validMerch.push(m);
  }

  const playerIncome = Number(profile.income ?? 0);
  let merchToCreate = validMerch;
  let actualMerchCost = totalMerchCost;

  if (totalMerchCost > playerIncome) {
    warnings.push(`Cannot afford merch ($${totalMerchCost} > $${playerIncome}). Merch skipped.`);
    merchToCreate = [];
    actualMerchCost = 0;
  }

  // ── 6. Build release payload ────────────────────────────────────────────

  const releaseName = (() => {
    const raw = isSingle
      ? ((trackSongs[0] as Record<string, unknown>)?.title as string) ||
        ((profile.artist_name || 'Untitled') + ' - Single')
      : ((projectData as Record<string, unknown>)?.name as string) ||
        ((projectData as Record<string, unknown>)?.title as string) ||
        'Untitled Release';
    // Sanitize: trim whitespace, collapse multiple spaces
    return raw.trim().replace(/\s+/g, ' ');
  })();

  const releaseDate = (() => {
    if (timing === 'schedule') {
      const scheduled = new Date();
      scheduled.setDate(scheduled.getDate() + scheduledTurns * 7);
      return scheduled.toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  })();

  const scheduledBonus = timing === 'schedule' ? Math.min(scheduledTurns * 5, 25) : 0;
  // H2 FIX: Include songId/projectId in idempotency key to prevent collisions
  const idempotencyKey = `${artistId}:${songId || projectId}:${releaseName}:${releaseDate}`;

  // Get cover art: prefer explicit override, then song/project, then empty
  const coverUrl = body.coverArtworkUrl
    || (isSingle
      ? ((trackSongs[0] as Record<string, unknown>)?.cover_artwork_url as string) || ''
      : ((projectData as Record<string, unknown>)?.cover_artwork_url as string) || '');

  // Derive launch_context at creation time — immutable once set (Plan 016 §4 Layer A).
  // Only 3 auto-derivable values in v0.0.4; do not attempt to infer other categories.
  const launchContext: string = isSurpriseDrop ? 'surprise_drop' : 'planned_rollout';

  const releasePayload: Record<string, unknown> = {
    artist_id: artistId,
    title: releaseName,
    release_name: releaseName,
    project_type: isSingle ? 'Single' : projectType,
    cover_artwork_url: coverUrl,
    release_date: releaseDate,
    scheduled_turn: timing === 'schedule' ? globalTurnId + scheduledTurns : globalTurnId,
    scheduled_hype_bonus_pct: scheduledBonus,
    virality_modifier_bonus_pct: isSurpriseDrop ? 20 : 0,
    surprise_drop: isSurpriseDrop,
    platforms,
    primary_region: regions[0] || profile.region || 'United States',
    target_regions: regions,
    lifecycle_state: timing === 'schedule' ? 'Scheduled' : 'Hot',
    project_status: timing === 'schedule' ? 'scheduled' : 'released',
    release_status: timing === 'schedule' ? 'scheduled' : 'released',
    idempotency_key: idempotencyKey,
    platform_streams: { AppleCore: 0, Streamify: 0, Soundburst: 0 },
    tracklist,
    followers_at_release: Number(profile.fans ?? profile.followers ?? 0),
    hot_phase_streams: 0,
    // Plan 016 §4 — launch_context is immutable; set once at creation, never updated.
    launch_context: launchContext,
  };

  if (!isSingle && projectId) {
    releasePayload.project_id = projectId;
  }
  if (isDissTrack) {
    releasePayload.is_diss_track = true;
    if (dissTargetId) releasePayload.diss_track_target_id = dissTargetId;
  }

  // ── 7. Deduct energy BEFORE release creation ───────────────────────────
  // Advisory read above is for friendly errors only. The RPC is write authority.

  const deductResult = await deductEnergyAtomic(db, artistId, energyCost);
  if (!deductResult.success) {
    return errorResponse(
      `Insufficient energy: need ${energyCost}, have ${currentEnergy}`,
    );
  }

  // ── 8. Create Release record ────────────────────────────────────────────

  const { data: release, error: releaseErr } = await db
    .from('releases')
    .insert(releasePayload)
    .select('id')
    .single();

  if (releaseErr || !release) {
    const creditResult = await creditEnergyAtomic(db, artistId, energyCost);
    if (!creditResult.success) {
      console.error('[releaseManager] Energy compensation failed after release insert error');
    }

    console.error('[releaseManager] Release insert failed:', releaseErr);
    return errorResponse(
      `Failed to create release: ${releaseErr?.message || 'unknown error'}`,
      500,
    );
  }

  const releaseId = release.id;

  // ── 9. Link songs to release ────────────────────────────────────────────

  let linkedSongCount = 0;
  let songLinkFailed = false;

  for (let attempt = 0; attempt <= SONG_LINK_MAX_RETRIES; attempt++) {
    // Fetch current release_id for each song to preserve original single releases
    const { data: existingSongs } = await db
      .from('songs')
      .select('id, release_id')
      .in('id', tracklist);

    const existingReleaseMap = new Map<string, string | null>(
      (existingSongs || []).map((s) => [s.id, s.release_id])
    );

    // Update each song, preserving original release_id if it points to a different release
    const updatePromises = tracklist.map((sid) => {
      const existingReleaseId = existingReleaseMap.get(sid);
      const songUpdate: Record<string, unknown> = {
        release_status: 'released',
      };
      if (coverUrl) songUpdate.cover_artwork_url = coverUrl;

      // If song already has a release_id pointing to a DIFFERENT release,
      // use single_release_id to preserve the original single
      if (existingReleaseId && existingReleaseId !== releaseId) {
        songUpdate.single_release_id = releaseId;
      } else {
        songUpdate.release_id = releaseId;
      }

      return db.from('songs').update(songUpdate).eq('id', sid);
    });
    await Promise.all(updatePromises);

    // Verify link - check BOTH release_id and single_release_id
    const { data: verifiedSongs } = await db
      .from('songs')
      .select('id, release_id, single_release_id')
      .in('id', tracklist);

    // Count songs linked via either release_id or single_release_id
    linkedSongCount = (verifiedSongs || []).filter(
      (s) => s.release_id === releaseId || s.single_release_id === releaseId
    ).length;

    if (linkedSongCount === tracklist.length) {
      break; // All linked successfully
    }

    if (attempt === SONG_LINK_MAX_RETRIES) {
      songLinkFailed = true;
      warnings.push(
        `Song linking partially failed (${linkedSongCount}/${tracklist.length} linked). Use repair tool to fix.`,
      );
    }
  }

  // ── 10. Create merch items ──────────────────────────────────────────────

  let merchCostDeducted = 0;
  if (merchToCreate.length > 0) {
    const merchInserts = merchToCreate.map((m) => ({
      release_id: releaseId,
      artist_id: artistId,
      name: releaseName,
      merch_type: m.type,
      project_name: releaseName,
      cover_artwork_url: coverUrl || null,
      units_manufactured: m.quantity,
      stock: m.quantity,
      units_sold: 0,
      price_per_unit: m.price,
      manufacturing_cost_per_unit: MERCH_COSTS[m.type],
      total_manufacturing_cost: m.quantity * MERCH_COSTS[m.type],
      status: 'Active',
      production_started_turn: globalTurnId,
      production_complete_turn: globalTurnId,
      scheduled_turn: globalTurnId,
      quality_score: 70,
      sourcing_tier: 'Standard',
      restock_mode: 'none',
    }));

    const { error: merchErr } = await db.from('merch').insert(merchInserts);
    if (merchErr) {
      console.error('[releaseManager] Merch insert failed:', merchErr);
      warnings.push(`Merch creation failed: ${merchErr.message}`);
      // Not fatal — release exists, merch can be added later
      actualMerchCost = 0;
    } else if (actualMerchCost > 0) {
      const incomeResult = await deductIncomeAtomic(db, artistId, actualMerchCost);

      if (!incomeResult.success) {
        console.warn('[releaseManager] Merch cost deduction failed: atomic deduction failed');
        warnings.push('Merch cost deduction failed: atomic deduction failed');
      } else {
        merchCostDeducted = actualMerchCost;
      }
    }
  }

  const projectStatus = timing === 'schedule' ? 'scheduled' : 'released';
  const postRelease = await applyPostReleaseEffects(db, {
    artistId,
    globalTurnId,
    warnings,
    projectUpdate: !isSingle && projectId
      ? { projectId, status: projectStatus, releaseDate }
      : undefined,
    eraMode: eraDecision === 'change' || eraDecision === 'continue' ? 'advance' : 'preserve',
    triggerEvent: 'release',
    surpriseDrop: isSurpriseDrop,
  });

  return jsonResponse({
    success: true,
    releaseId,
    linkedSongCount,
    songLinkFailed,
    tracklist,
    energyDeducted: energyCost,
    merchCostDeducted,
    merchCreated: merchToCreate.length,
    eraPhase: postRelease.eraPhase,
    warnings: postRelease.warnings,
  });
}

// ─── createDeluxe (Plan 050) ──────────────────────────────────────────────────

async function handleCreateDeluxe(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const db = getSupabaseAdmin();
  const warnings: string[] = [];

  const artistId = body.artistId as string;
  const parentReleaseId = body.parentReleaseId as string;
  const deluxeType = body.deluxeType as string;
  const bonusTrackIds = body.bonusTrackIds as string[];

  // ── 0. Param validation ─────────────────────────────────────────────────
  const validationErr = validateCreateDeluxe({ artistId, parentReleaseId, deluxeType, bonusTrackIds });
  if (validationErr) return errorResponse(validationErr);

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const { user, error: authError } = await getAuthUser(req);
  if (!user) return errorResponse(authError || 'Unauthorized', 401);
  const isAdmin = (user.app_metadata?.role || user.user_metadata?.role) === 'admin';
  if (!isAdmin && user.id !== artistId) return errorResponse('Forbidden', 403);

  // ── 2. Fetch profile + turn state + parent release ──────────────────────
  const [profileResult, turnStateResult, parentResult] = await Promise.all([
    db.from('profiles').select('*').eq('id', artistId).maybeSingle(),
    db.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle(),
    db.from('releases').select('*').eq('id', parentReleaseId).maybeSingle(),
  ]);

  if (!profileResult.data) return errorResponse('Artist profile not found', 404);
  const profile = profileResult.data;
  if (profile.is_active === false) return errorResponse('Artist profile is inactive', 403);

  const globalTurnId = Number(turnStateResult.data?.global_turn_id ?? 1);
  const parentRelease = parentResult.data;
  if (!parentRelease) return errorResponse('Parent release not found', 404);
  if (parentRelease.artist_id !== artistId) return errorResponse('Parent release does not belong to artist', 403);

  // Parent must have a progressed lifecycle
  const releasedStates = ['Hot', 'Trending', 'Momentum', 'Stable', 'Declining', 'Archived'];
  if (!releasedStates.includes(parentRelease.lifecycle_state || '')) {
    return errorResponse('Parent release must be in a released lifecycle state');
  }

  // ── 3. Duplicate deluxe check ───────────────────────────────────────────
  const { data: existingDeluxe } = await db
    .from('releases')
    .select('id')
    .eq('parent_release_id', parentReleaseId)
    .eq('deluxe_type', deluxeType)
    .maybeSingle();
  if (existingDeluxe) {
    return errorResponse(`A ${deluxeType} edition already exists for this release`);
  }

  // ── 4. Verify bonus songs ──────────────────────────────────────────────
  const { data: bonusSongs, error: songErr } = await db
    .from('songs')
    .select('id, artist_id, status, release_status')
    .in('id', bonusTrackIds);
  if (songErr || !bonusSongs) return errorResponse('Failed to verify bonus tracks');

  const foundIds = new Set(bonusSongs.map((s: { id: string }) => s.id));
  const missing = bonusTrackIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) return errorResponse(`Bonus songs not found: ${missing.join(', ')}`);

  const notOwned = bonusSongs.filter((s: { artist_id?: string }) => s.artist_id !== artistId);
  if (notOwned.length > 0) return errorResponse('Some bonus songs do not belong to artist', 403);

  const notReady = bonusSongs.filter(
    (s: { status: string }) => !['recorded', 'mastered'].includes(s.status),
  );
  if (notReady.length > 0) {
    return errorResponse(`Bonus songs must be recorded or mastered: ${notReady.map((s: { id: string }) => s.id).join(', ')}`);
  }

  const alreadyReleased = bonusSongs.filter(
    (s: { release_status?: string }) => s.release_status === 'released',
  );
  if (alreadyReleased.length > 0) {
    return errorResponse(`Some bonus songs are already released: ${alreadyReleased.map((s: { id: string }) => s.id).join(', ')}`);
  }

  // ── 5. Energy check ────────────────────────────────────────────────────
  const currentEnergy = Number(profile.energy ?? 0);
  if (currentEnergy < RELEASE_ENERGY_COST_PROJECT) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_PROJECT}, have ${currentEnergy}`);
  }

  // ── 6. Per-turn release limit ──────────────────────────────────────────
  const { count: releasesThisTurn } = await db
    .from('releases')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('scheduled_turn', globalTurnId);
  if ((releasesThisTurn ?? 0) >= MAX_RELEASES_PER_TURN) {
    return errorResponse(`Release limit reached: max ${MAX_RELEASES_PER_TURN} per turn`);
  }

  // ── 7. Deduct energy ──────────────────────────────────────────────────
  const deductResult = await deductEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_PROJECT);
  if (!deductResult.success) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_PROJECT}, have ${currentEnergy}`);
  }

  // ── 8. Build & insert release ─────────────────────────────────────────
  const releasePayload = buildDeluxePayload({
    parentRelease,
    deluxeType,
    bonusTrackIds,
    profile,
    globalTurnId,
  });

  const { data: release, error: releaseErr } = await db
    .from('releases')
    .insert(releasePayload)
    .select('id')
    .single();

  if (releaseErr || !release) {
    const creditResultDeluxe = await creditEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_PROJECT);
    if (!creditResultDeluxe.success) {
      console.error('[releaseManager:createDeluxe] Energy compensation failed after insert error');
    }
    console.error('[releaseManager:createDeluxe] Insert failed:', releaseErr);
    return errorResponse(`Failed to create deluxe release: ${releaseErr?.message || 'unknown'}`, 500);
  }

  const releaseId = release.id;

  // ── 9. Link bonus songs ───────────────────────────────────────────────
  let linkedCount = 0;
  for (let attempt = 0; attempt <= SONG_LINK_MAX_RETRIES; attempt++) {
    const updates = bonusTrackIds.map((sid) =>
      db.from('songs').update({ release_id: releaseId, release_status: 'released' }).eq('id', sid),
    );
    await Promise.all(updates);

    const { data: verified } = await db
      .from('songs')
      .select('id, release_id')
      .in('id', bonusTrackIds);
    linkedCount = (verified || []).filter(
      (s: { release_id: string }) => s.release_id === releaseId,
    ).length;

    if (linkedCount === bonusTrackIds.length) break;
    if (attempt === SONG_LINK_MAX_RETRIES) {
      warnings.push(`Song link partial: ${linkedCount}/${bonusTrackIds.length}`);
    }
  }

  const postRelease = await applyPostReleaseEffects(db, {
    artistId,
    globalTurnId,
    warnings,
    eraMode: 'preserve',
    triggerEvent: 'release',
  });

  return jsonResponse({
    success: true,
    releaseId,
    linkedSongCount: linkedCount,
    tracklist: releasePayload.tracklist,
    energyDeducted: RELEASE_ENERGY_COST_PROJECT,
    eraPhase: postRelease.eraPhase,
    warnings: postRelease.warnings,
  });
}

// ─── releaseSingleFromAlbum (Plan 050) ────────────────────────────────────────

async function handleReleaseSingleFromAlbum(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const db = getSupabaseAdmin();
  const warnings: string[] = [];

  const artistId = body.artistId as string;
  const songId = body.songId as string;
  const parentReleaseId = body.parentReleaseId as string;

  // ── 0. Param validation ─────────────────────────────────────────────────
  const validationErr = validateReleaseSingleFromAlbum({ artistId, songId, parentReleaseId });
  if (validationErr) return errorResponse(validationErr);

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const { user, error: authError } = await getAuthUser(req);
  if (!user) return errorResponse(authError || 'Unauthorized', 401);
  const isAdmin = (user.app_metadata?.role || user.user_metadata?.role) === 'admin';
  if (!isAdmin && user.id !== artistId) return errorResponse('Forbidden', 403);

  // ── 2. Fetch profile + turn state + parent release + song ───────────────
  const [profileResult, turnStateResult, parentResult, songResult] = await Promise.all([
    db.from('profiles').select('*').eq('id', artistId).maybeSingle(),
    db.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle(),
    db.from('releases').select('*').eq('id', parentReleaseId).maybeSingle(),
    db.from('songs').select('*').eq('id', songId).maybeSingle(),
  ]);

  if (!profileResult.data) return errorResponse('Artist profile not found', 404);
  const profile = profileResult.data;
  if (profile.is_active === false) return errorResponse('Artist profile is inactive', 403);

  const globalTurnId = Number(turnStateResult.data?.global_turn_id ?? 1);

  const parentRelease = parentResult.data;
  if (!parentRelease) return errorResponse('Parent release not found', 404);
  if (parentRelease.artist_id !== artistId) return errorResponse('Parent release does not belong to artist', 403);

  // Parent must be released
  const releasedStatuses = ['released'];
  const releasedLifecycles = ['Hot', 'Trending', 'Momentum', 'Stable', 'Declining', 'Archived'];
  const parentIsReleased = releasedStatuses.includes(parentRelease.release_status || '') ||
    releasedLifecycles.includes(parentRelease.lifecycle_state || '');
  if (!parentIsReleased) {
    return errorResponse('Parent release must be in a released state');
  }

  const song = songResult.data;
  if (!song) return errorResponse('Song not found', 404);
  if (song.artist_id !== artistId) return errorResponse('Song does not belong to artist', 403);

  // Song must be in parent tracklist
  const parentTracklist = Array.isArray(parentRelease.tracklist) ? parentRelease.tracklist : [];
  if (!parentTracklist.includes(songId)) {
    return errorResponse('Song is not in the parent release tracklist');
  }

  // Check duplicate single
  const { data: existingSingle } = await db
    .from('releases')
    .select('id')
    .eq('parent_release_id', parentReleaseId)
    .eq('project_type', 'Single')
    .contains('tracklist', [songId])
    .maybeSingle();
  if (existingSingle) {
    return errorResponse('This track is already released as a single from this album');
  }

  // ── 3. Energy check ────────────────────────────────────────────────────
  const currentEnergy = Number(profile.energy ?? 0);
  if (currentEnergy < RELEASE_ENERGY_COST_SINGLE) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_SINGLE}, have ${currentEnergy}`);
  }

  // ── 4. Per-turn release limit ──────────────────────────────────────────
  const { count: releasesThisTurn } = await db
    .from('releases')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('scheduled_turn', globalTurnId);
  if ((releasesThisTurn ?? 0) >= MAX_RELEASES_PER_TURN) {
    return errorResponse(`Release limit reached: max ${MAX_RELEASES_PER_TURN} per turn`);
  }

  // ── 5. Deduct energy ──────────────────────────────────────────────────
  const deductResult = await deductEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_SINGLE);
  if (!deductResult.success) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_SINGLE}, have ${currentEnergy}`);
  }

  // ── 6. Build & insert release ─────────────────────────────────────────
  const releasePayload = buildSingleFromAlbumPayload({
    parentRelease,
    song,
    profile,
    globalTurnId,
  });

  const { data: release, error: releaseErr } = await db
    .from('releases')
    .insert(releasePayload)
    .select('id')
    .single();

  if (releaseErr || !release) {
    const creditResultSingle = await creditEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_SINGLE);
    if (!creditResultSingle.success) {
      console.error('[releaseManager:releaseSingleFromAlbum] Energy compensation failed after insert error');
    }
    console.error('[releaseManager:releaseSingleFromAlbum] Insert failed:', releaseErr);
    return errorResponse(`Failed to create single release: ${releaseErr?.message || 'unknown'}`, 500);
  }

  const releaseId = release.id;

  // ── 7. Link song (single_release_id, preserve release_id) ────────────
  for (let attempt = 0; attempt <= SONG_LINK_MAX_RETRIES; attempt++) {
    await db.from('songs').update({ single_release_id: releaseId }).eq('id', songId);

    const { data: verified } = await db
      .from('songs')
      .select('id, single_release_id')
      .eq('id', songId)
      .maybeSingle();

    if (verified?.single_release_id === releaseId) break;
    if (attempt === SONG_LINK_MAX_RETRIES) {
      warnings.push('Song single_release_id link may have failed');
    }
  }

  const postRelease = await applyPostReleaseEffects(db, {
    artistId,
    globalTurnId,
    warnings,
    eraMode: 'preserve',
    triggerEvent: 'release',
  });

  return jsonResponse({
    success: true,
    releaseId,
    tracklist: [songId],
    energyDeducted: RELEASE_ENERGY_COST_SINGLE,
    eraPhase: postRelease.eraPhase,
    warnings: postRelease.warnings,
  });
}

// ─── releaseLeadSingle (Plan 050) ─────────────────────────────────────────────

async function handleReleaseLeadSingle(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const db = getSupabaseAdmin();
  const warnings: string[] = [];

  const artistId = body.artistId as string;
  const songId = body.songId as string;
  const projectId = body.projectId as string;

  // ── 0. Param validation ─────────────────────────────────────────────────
  const validationErr = validateReleaseLeadSingle({ artistId, songId, projectId });
  if (validationErr) return errorResponse(validationErr);

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const { user, error: authError } = await getAuthUser(req);
  if (!user) return errorResponse(authError || 'Unauthorized', 401);
  const isAdmin = (user.app_metadata?.role || user.user_metadata?.role) === 'admin';
  if (!isAdmin && user.id !== artistId) return errorResponse('Forbidden', 403);

  // ── 2. Fetch profile + turn state + project + song ──────────────────────
  const [profileResult, turnStateResult, projectResult, songResult] = await Promise.all([
    db.from('profiles').select('*').eq('id', artistId).maybeSingle(),
    db.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle(),
    db.from('projects').select('*').eq('id', projectId).eq('artist_id', artistId).maybeSingle(),
    db.from('songs').select('*').eq('id', songId).maybeSingle(),
  ]);

  if (!profileResult.data) return errorResponse('Artist profile not found', 404);
  const profile = profileResult.data;
  if (profile.is_active === false) return errorResponse('Artist profile is inactive', 403);

  const globalTurnId = Number(turnStateResult.data?.global_turn_id ?? 1);

  const project = projectResult.data;
  if (!project) return errorResponse('Project not found', 404);

  const song = songResult.data;
  if (!song) return errorResponse('Song not found', 404);
  if (song.artist_id !== artistId) return errorResponse('Song does not belong to artist', 403);

  // Song must be in project tracklist and recorded
  const projectTracklist = Array.isArray(project.tracklist) ? project.tracklist : [];
  if (!projectTracklist.includes(songId)) {
    return errorResponse('Song is not in the project tracklist');
  }
  if (song.status !== 'recorded' && song.status !== 'mastered') {
    return errorResponse('Song must be recorded or mastered to release');
  }

  // ── 3. Energy check ────────────────────────────────────────────────────
  const currentEnergy = Number(profile.energy ?? 0);
  if (currentEnergy < RELEASE_ENERGY_COST_SINGLE) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_SINGLE}, have ${currentEnergy}`);
  }

  // ── 4. Per-turn release limit ──────────────────────────────────────────
  const { count: releasesThisTurn } = await db
    .from('releases')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('scheduled_turn', globalTurnId);
  if ((releasesThisTurn ?? 0) >= MAX_RELEASES_PER_TURN) {
    return errorResponse(`Release limit reached: max ${MAX_RELEASES_PER_TURN} per turn`);
  }

  // ── 5. Deduct energy ──────────────────────────────────────────────────
  const deductResult = await deductEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_SINGLE);
  if (!deductResult.success) {
    return errorResponse(`Insufficient energy: need ${RELEASE_ENERGY_COST_SINGLE}, have ${currentEnergy}`);
  }

  // ── 6. Build & insert release ─────────────────────────────────────────
  const releasePayload = buildLeadSinglePayload({
    project,
    song,
    profile,
    globalTurnId,
  });

  const { data: release, error: releaseErr } = await db
    .from('releases')
    .insert(releasePayload)
    .select('id')
    .single();

  if (releaseErr || !release) {
    const creditResultLeadSingle = await creditEnergyAtomic(db, artistId, RELEASE_ENERGY_COST_SINGLE);
    if (!creditResultLeadSingle.success) {
      console.error('[releaseManager:releaseLeadSingle] Energy compensation failed after insert error');
    }
    console.error('[releaseManager:releaseLeadSingle] Insert failed:', releaseErr);
    return errorResponse(`Failed to create lead single release: ${releaseErr?.message || 'unknown'}`, 500);
  }

  const releaseId = release.id;

  // ── 7. Link song ──────────────────────────────────────────────────────
  for (let attempt = 0; attempt <= SONG_LINK_MAX_RETRIES; attempt++) {
    await db.from('songs').update({
      release_id: releaseId,
      release_status: 'released',
    }).eq('id', songId);

    const { data: verified } = await db
      .from('songs')
      .select('id, release_id')
      .eq('id', songId)
      .maybeSingle();

    if (verified?.release_id === releaseId) break;
    if (attempt === SONG_LINK_MAX_RETRIES) {
      warnings.push('Song release_id link may have failed');
    }
  }

  const postRelease = await applyPostReleaseEffects(db, {
    artistId,
    globalTurnId,
    warnings,
    projectUpdate: { projectId, status: 'released' },
    eraMode: 'advance',
    triggerEvent: 'release',
  });

  return jsonResponse({
    success: true,
    releaseId,
    tracklist: [songId],
    energyDeducted: RELEASE_ENERGY_COST_SINGLE,
    eraPhase: postRelease.eraPhase,
    warnings: postRelease.warnings,
  });
}
