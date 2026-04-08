/**
 * sceneCompletionContextBus.ts — Runtime context bridge for gig-like completions
 *
 * Plan 034 Milestone 1: Canonical completion context contract
 *
 * This module provides the runtime bridge between touringManager (producer)
 * and sceneSystemModule (consumer) to solve the stale-DB-read problem.
 *
 * Contract:
 * - Supports N ≥ 1 completed gig-like events per player-turn
 * - Uses DB-authoritative city_id (not city name strings)
 * - Each completion carries an idempotency token (gig_id + completed_turn)
 *
 * Usage:
 * - touringManager calls extractGigCompletionContext() after processing gigs
 * - Result is stored in runtimeContext.sceneSystemGigContextByArtistId[playerId]
 * - sceneSystemModule reads from this context for same-turn gig detection
 */

// ─── Types ───────────────────────────────────────────────────────

export interface GigCompletion {
  gigId: string;
  tourId: string;
  cityId: string;
  cityName: string | null;
  venueId: string | null;
  attendance: number;
  attendanceRatio: number;
  completedThisTurn: boolean;
  completedTurn: number;
  idempotencyKey: string;
}

export interface GigCompletionContext {
  completions: GigCompletion[];
}

// Consumer-facing runtimeContext shape stored at
// runtimeContext.sceneSystemGigContextByArtistId[playerId]
export interface SceneSystemGigContext {
  tourId: string;
  completedThisTurn: boolean;
  completions: GigCompletion[];
}

interface GigUpdateDelta {
  id: string;
  patch: {
    status?: string;
    event_outcome?: {
      type?: string;
      attendance?: number;
      fill_rate?: number;
      [key: string]: unknown;
    } | null;
    tickets_sold?: number;
    [key: string]: unknown;
  };
  _meta?: {
    tour_id?: string;
    city_id?: string;
    city_name?: string;
    venue_id?: string;
    scheduled_turn?: number;
  };
}

interface TouringDeltas {
  gig_updates?: GigUpdateDelta[];
  tour_updates?: unknown[];
  [key: string]: unknown;
}

// ─── Core Function ───────────────────────────────────────────────

/**
 * Extract gig completion context from touringManager deltas.
 *
 * Called after touringManager processes gigs to build the runtime context
 * that sceneSystemModule will consume for same-turn gig detection.
 *
 * @param deltas - Deltas returned by touringManager
 * @param playerId - The player ID (for logging/tracing)
 * @param globalTurnId - Current turn number
 * @returns GigCompletionContext if any gigs were completed, null otherwise
 */
export function extractGigCompletionContext(
  deltas: TouringDeltas,
  playerId: string,
  globalTurnId: number,
): GigCompletionContext | null {
  const gigUpdates = deltas?.gig_updates || [];

  const completions: GigCompletion[] = [];

  for (const gigUpdate of gigUpdates) {
    // Only process completed gigs with gig_performed event type
    const patch = gigUpdate.patch;
    if (patch?.status !== 'Completed') continue;

    const eventOutcome = patch?.event_outcome;
    if (!eventOutcome || eventOutcome.type !== 'gig_performed') continue;

    const meta = gigUpdate._meta || {};
    const gigId = gigUpdate.id;

    // Build completion record
    const completion: GigCompletion = {
      gigId,
      tourId: meta.tour_id || '',
      cityId: meta.city_id || '',
      cityName: meta.city_name || null,
      venueId: meta.venue_id || null,
      attendance: Number(eventOutcome.attendance ?? patch.tickets_sold ?? 500) || 500,
      attendanceRatio: Number(eventOutcome.fill_rate ?? 0.7) || 0.7,
      completedThisTurn: true,
      completedTurn: globalTurnId,
      idempotencyKey: `${gigId}:${globalTurnId}`,
    };

    completions.push(completion);
  }

  if (completions.length === 0) {
    return null;
  }

  return { completions };
}

/**
 * Build the sceneSystemGigContextByArtistId structure for runtimeContext.
 *
 * This is the consumer-facing format that sceneSystemModule expects.
 * Preserves backward compatibility with existing resolveRuntimeGigContext().
 */
export function buildSceneSystemGigContext(
  context: GigCompletionContext | null,
): SceneSystemGigContext | null {
  if (!context || context.completions.length === 0) {
    return null;
  }

  const firstWithTour = context.completions.find((c) => !!c?.tourId) || context.completions[0];

  return {
    tourId: firstWithTour?.tourId || '',
    completedThisTurn: true,
    completions: context.completions,
  };
}

// ─── Plan 035 M2: Underground Event Completion Extraction ─────────

interface TourEventUpdateDelta {
  id: string;
  patch: {
    status?: string;
    attendance?: number;
    [key: string]: unknown;
  };
  _meta?: {
    city_id?: string;
    city_name?: string;
    venue_id?: string | null;
    event_type?: string;
    scheduled_turn?: number;
    capacity?: number;
    is_underground?: boolean;
  };
}

interface UndergroundDeltas {
  tour_event_updates?: TourEventUpdateDelta[];
  [key: string]: unknown;
}

/**
 * Extract underground event completion context from touringManager deltas.
 *
 * Plan 035 M2: This function extracts completed underground events so they
 * can flow through sceneSystemModule for canonical scene processing
 * (artifacts, contacts, perks, rep) instead of bypassing via direct scene_deltas.
 *
 * @param deltas - Deltas returned by touringManager (including tour_event_updates)
 * @param playerId - The player ID (for logging/tracing)
 * @param globalTurnId - Current turn number
 * @returns GigCompletionContext if any underground events were completed, null otherwise
 */
export function extractUndergroundCompletionContext(
  deltas: UndergroundDeltas,
  playerId: string,
  globalTurnId: number,
): GigCompletionContext | null {
  const tourEventUpdates = deltas?.tour_event_updates || [];

  const completions: GigCompletion[] = [];

  for (const eventUpdate of tourEventUpdates) {
    const patch = eventUpdate.patch;
    const meta = eventUpdate._meta;

    // Only process completed underground events (lowercase "completed" for underground)
    if (patch?.status !== 'completed') continue;

    // Require _meta for Plan 035 pipeline — skip entries without metadata
    // (backward compatibility: don't crash, just skip)
    if (!meta) continue;

    // Only extract underground events (is_underground: true)
    if (meta.is_underground !== true) continue;

    const eventId = eventUpdate.id;
    const attendance = Number(patch?.attendance ?? 0) || 0;
    const capacity = Number(meta.capacity ?? 0) || 0;

    // Compute attendance ratio with safe fallback for zero/missing capacity.
    // Cap at 1.5 to prevent unrealistic 300%+ fill rates from distorting scene math
    // (e.g. fire-marshal-violation underground shows that sold 200% of capacity).
    const attendanceRatio = capacity > 0
      ? Math.min(attendance / capacity, 1.5)
      : (attendance > 0 ? 0.7 : 0); // fallback ratio if no capacity info

    // Build completion record
    const completion: GigCompletion = {
      gigId: eventId,
      tourId: '', // underground events aren't part of tours
      cityId: meta.city_id || '',
      cityName: meta.city_name || null,
      venueId: meta.venue_id || null,
      attendance,
      attendanceRatio,
      completedThisTurn: true,
      completedTurn: globalTurnId,
      // Prefix "ug:" prevents idempotency key collisions with touring gigs (which use "gigId:turn").
      // A player can have both a touring gig and an underground event in the same turn;
      // without this prefix both would collide on the same key in sceneSystemModule.
      idempotencyKey: `ug:${eventId}:${globalTurnId}`,
    };

    completions.push(completion);
  }

  if (completions.length === 0) {
    return null;
  }

  return { completions };
}
