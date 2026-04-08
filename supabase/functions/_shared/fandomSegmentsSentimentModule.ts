/**
 * FANDOM SEGMENTS SENTIMENT MODULE — Per-Segment Sentiment Tick
 * ───────────────────────────────────────────────────────────────
 * Turn Engine Module (order 4.45)
 * Runs BEFORE fandomSegmentsModule (4.5), AFTER socialMediaModule (4)
 *
 * Pure staging: loads segment sentiment state, gathers turn events,
 * applies per-segment sentiment deltas, returns patches only.
 *
 * Writes deltas for:
 *   - fandom_segments rows (sentiment column)
 *
 * Emits events for:
 *   - sentiment_divergence_detected (when hostile/enthusiastic segments diverge >50)
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  calculateSegmentSentimentDelta,
  CANONICAL_FANDOM_SEGMENT_TYPES,
  getPersonaDrift,
  type SentimentEventData,
} from './segmentSentimentTriggers.ts';
import type { SegmentType } from './fandomSegmentsEngine.ts';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const N = (v: unknown): number => Number(v) || 0;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface SentimentEvent {
  type: string;
  data: SentimentEventData;
}

interface SegmentSentimentPatch {
  player_id: string;
  segment_type: string;
  sentiment: number;
  updated_at: string;
}

interface ProcessResult {
  success: boolean;
  segmentSentimentPatches?: SegmentSentimentPatch[];
  events?: any[];
  error?: string;
}

// ─── EVENT GATHERING ─────────────────────────────────────────────────────────

/**
 * Gather all sentiment-relevant events for this player's turn.
 * Sources include era state, releases, social posts, controversies, spotlights.
 */
function gatherSentimentEventsForTurn(
  player: any,
  globalTurnId: number,
  ctx: any = {}
): SentimentEvent[] {
  const events: SentimentEvent[] = [];
  const rc = ctx.runtimeContext || {};
  const turnMetrics = rc.turn_metrics || ctx.turnMetrics || {};
  const playerActivity = rc.playerActivity || ctx.playerActivity || {};

  // ─── ERA FOCUS PATH ────────────────────────────────────────────────────────
  // Active era defines long-term artistic direction → segment preferences apply
  const eraFocusPath = rc.focus_path || player?.focus_path || player?.era_focus_path;
  if (eraFocusPath) {
    events.push({
      type: 'era_active',
      data: { eraFocusPath, intensity: 30 }, // Low intensity for passive era effect
    });
  }

  // ─── RELEASE LAUNCHES ──────────────────────────────────────────────────────
  const releasesActivated = N(turnMetrics.releases_activated) || (ctx.releaseThisTurn ? 1 : 0);
  if (releasesActivated > 0) {
    // Determine quality tier from ctx or deltas
    const releaseQuality = N(ctx.releaseQuality) || N(ctx.release_quality_score) || 50;
    const releaseGenre = ctx.releaseGenre || ctx.release_genre;
    const playerGenre = player?.genre;

    // Quality-based event
    if (releaseQuality >= 70) {
      events.push({
        type: 'high_quality_release',
        data: { quality: releaseQuality, intensity: Math.min(100, releaseQuality) },
      });
    } else if (releaseQuality < 40) {
      events.push({
        type: 'low_quality_release',
        data: { quality: releaseQuality, intensity: Math.max(20, 100 - releaseQuality) },
      });
    }

    // Drastic style change: release genre differs from artist's main genre
    if (releaseGenre && playerGenre && releaseGenre !== playerGenre) {
      events.push({
        type: 'drastic_style_change',
        data: { intensity: 60 },
      });
    }
  }

  // ─── ACTIVE CONTROVERSIES ──────────────────────────────────────────────────
  const activeControversies =
    N(ctx.activeControversies)
    || N(ctx.activeControversy?.count)
    || N(rc.activeControversyCount)
    || 0;
  if (activeControversies > 0) {
    events.push({
      type: 'controversy_without_substance',
      data: { isControversial: true, intensity: 50 + activeControversies * 10 },
    });
  }

  // ─── VIRAL SOCIAL POSTS ────────────────────────────────────────────────────
  const socialPostsCreated = N(turnMetrics.social_posts_created);
  const socialPostsThisTurn = rc.socialPostsThisTurn || ctx.socialPostsThisTurn || [];
  const hasViralPost = Array.isArray(socialPostsThisTurn) &&
    socialPostsThisTurn.some((p: any) => p?.viral || p?.is_viral || N(p?.engagement) > 1000);

  if (socialPostsCreated > 0 && hasViralPost) {
    events.push({
      type: 'viral_moment',
      data: { intensity: 70 },
    });
  }

  // ─── CONTENT STREAK / INACTIVITY ───────────────────────────────────────────
  const isActive = playerActivity.isActive !== false; // Default to active if not specified
  const inGracePeriod = playerActivity.inGracePeriod === true;
  const noContentTicks = N(playerActivity.no_content_ticks) || N(player?.no_content_ticks) || 0;

  if (!isActive && !inGracePeriod && noContentTicks >= 3) {
    events.push({
      type: 'boring_content',
      data: { intensity: Math.min(100, 30 + noContentTicks * 10) },
    });
  }

  // ─── COMMUNITY ENGAGEMENT ──────────────────────────────────────────────────
  const actionTags: string[] = ctx.actionTags || rc.actionTags || [];
  if (actionTags.includes('community_ritual') || actionTags.includes('community_engagement')) {
    events.push({
      type: 'community_engagement',
      data: { intensity: 60 },
    });
  }

  // ─── PLATFORM SPOTLIGHT ────────────────────────────────────────────────────
  const spotlightPlayerId = rc.platform_spotlight_player_id || ctx.platform_spotlight_player_id;
  if (spotlightPlayerId && spotlightPlayerId === player?.id) {
    events.push({
      type: 'platform_spotlight',
      data: { intensity: 80 },
    });
  }

  // ─── CONSISTENT CONTENT (for core segment) ─────────────────────────────────
  // If player has been active with releases or posts consistently
  const consecutiveActiveTurns = N(playerActivity.consecutive_active_turns) || 0;
  if (consecutiveActiveTurns >= 3) {
    events.push({
      type: 'consistent_content',
      data: { intensity: 40 + Math.min(30, consecutiveActiveTurns * 5) },
    });
  }

  // ─── HYPE RELEASE (for casual/trend_chaser) ────────────────────────────────
  const playerHype = N(player?.hype) || N(rc.player_hype) || 0;
  if (releasesActivated > 0 && playerHype >= 60) {
    events.push({
      type: 'hype_release',
      data: { hype: playerHype, intensity: playerHype },
    });
  }

  return events;
}

// ─── DIVERGENCE DETECTION ────────────────────────────────────────────────────

/**
 * Check if segment sentiments have diverged enough to warrant an event.
 * Divergence = spread between hostile (<25) and enthusiastic (>75) segments.
 */
function checkSentimentDivergence(
  segments: Array<{ segment_type: string; sentiment: number; count: number }>
): { divergence: number; hostileSegments: string[]; enthusiasticSegments: string[] } | null {
  const hostile = segments.filter((s) => s.sentiment < 25 && s.count > 0);
  const enthusiastic = segments.filter((s) => s.sentiment > 75 && s.count > 0);

  if (hostile.length === 0 || enthusiastic.length === 0) {
    return null;
  }

  const minHostile = Math.min(...hostile.map((s) => s.sentiment));
  const maxEnthusiastic = Math.max(...enthusiastic.map((s) => s.sentiment));
  const divergence = maxEnthusiastic - minHostile;

  return {
    divergence,
    hostileSegments: hostile.map((s) => s.segment_type),
    enthusiasticSegments: enthusiastic.map((s) => s.segment_type),
  };
}

// ─── MAIN PROCESSOR ──────────────────────────────────────────────────────────

/**
 * Process per-segment sentiment updates for a single player turn.
 * Returns delta patches ready for commit phase — no direct DB writes.
 */
export async function processFandomSegmentsSentiment(
  player: any,
  globalTurnId: number,
  entities: any,
  deltas: any,
  ctx: any = {}
): Promise<ProcessResult> {
  if (!player?.id) {
    return { success: false, error: 'No player ID' };
  }

  try {
    // ── Fetch all 6 fandom_segments rows for player ──────────────────────────
    // Try prefetch first, fall back to direct query
    const prefetchedSegments = ctx?.prefetchData?.fandomSegmentsByPlayer?.get(player.id);
    const { data: segmentRows, error: fetchError } = prefetchedSegments
      ? { data: prefetchedSegments, error: null }
      : await supabaseAdmin
          .from('fandom_segments')
          .select('segment_type, sentiment, count')
          .eq('player_id', player.id);

    if (fetchError) {
      return { success: false, error: `Failed to fetch segments: ${fetchError.message}` };
    }

    // No segments yet = no-op (segment creation happens in fandomSegmentsModule)
    if (!segmentRows || segmentRows.length === 0) {
      console.log(`[SegSentiment] player=${player.id} no segments yet — skipping`);
      return { success: true };
    }

    // ── Resolve marketing persona (from previous turn's brand stats) ─────────
    // Persona drives passive per-turn sentiment drift per segment.
    // We use the stored value from player_brand_stats (1 turn stale) since
    // brandDealsModule computes it at order 4.8, after this module (4.45).
    let primaryPersona: string | null = ctx.primaryPersona || null;
    if (!primaryPersona) {
      const { data: brandStats } = await supabaseAdmin
        .from('player_brand_stats')
        .select('marketing_persona_primary')
        .eq('player_id', player.id)
        .maybeSingle();
      primaryPersona = brandStats?.marketing_persona_primary || null;
    }

    // ── Gather this turn's sentiment events ──────────────────────────────────
    const sentimentEvents = gatherSentimentEventsForTurn(player, globalTurnId, ctx);

    // ── Process each segment ─────────────────────────────────────────────────
    const patches: SegmentSentimentPatch[] = [];
    const updatedSegments: Array<{ segment_type: string; sentiment: number; count: number }> = [];

    for (const segment of segmentRows) {
      const segmentType = segment.segment_type as SegmentType;
      const currentSentiment = N(segment.sentiment) || 50;

      // Skip invalid segment types
      if (!CANONICAL_FANDOM_SEGMENT_TYPES.includes(segmentType)) {
        continue;
      }

      // ── Apply all event deltas ─────────────────────────────────────────────
      let sentimentDelta = 0;
      for (const event of sentimentEvents) {
        const eventDelta = calculateSegmentSentimentDelta(segmentType, event.type, event.data);
        sentimentDelta += eventDelta;
      }

      // ── Apply natural drift toward 50 ──────────────────────────────────────
      // Sentiment regresses toward neutral over time
      const driftDelta = currentSentiment > 50 ? -1 : currentSentiment < 50 ? 1 : 0;
      sentimentDelta += driftDelta;

      // ── Apply persona drift ────────────────────────────────────────────────
      // Passive per-turn modifier based on artist persona ↔ segment affinity.
      // Range: -2 to +2. Accumulates over turns, creating organic sentiment
      // divergence between segments that like vs dislike the artist's persona.
      if (primaryPersona) {
        sentimentDelta += getPersonaDrift(segmentType, primaryPersona);
      }

      // ── Calculate new sentiment ────────────────────────────────────────────
      const newSentiment = clamp(currentSentiment + sentimentDelta, 0, 100);

      // ── Debug: per-segment detail ──────────────────────────────────────────
      if (sentimentDelta !== 0) {
        console.log(`[SegSentiment] player=${player.id} seg=${segmentType} ${currentSentiment}→${newSentiment} (Δ${sentimentDelta > 0 ? '+' : ''}${sentimentDelta}) persona=${primaryPersona || 'none'}`);
      }

      // ── Only patch if changed ──────────────────────────────────────────────
      if (newSentiment !== currentSentiment) {
        patches.push({
          player_id: player.id,
          segment_type: segmentType,
          sentiment: newSentiment,
          updated_at: new Date().toISOString(),
        });
      }

      // Track for divergence check
      updatedSegments.push({
        segment_type: segmentType,
        sentiment: newSentiment,
        count: N(segment.count),
      });
    }

    // ── Check for divergence → emit event for news/fan war system ────────────
    const events: any[] = [];

    // ── Debug: summary ───────────────────────────────────────────────────────
    console.log(`[SegSentiment] player=${player.id} turn=${globalTurnId} events=${sentimentEvents.length} patches=${patches.length} persona=${primaryPersona || 'none'} segments=${JSON.stringify(Object.fromEntries(updatedSegments.map(s => [s.segment_type, s.sentiment])))}`);

    const divergenceInfo = checkSentimentDivergence(updatedSegments);
    if (divergenceInfo && divergenceInfo.divergence > 50) {
      console.log(`[SegSentiment] DIVERGENCE player=${player.id} divergence=${divergenceInfo.divergence} hostile=[${divergenceInfo.hostileSegments.join(',')}] enthusiastic=[${divergenceInfo.enthusiasticSegments.join(',')}]`);
      events.push({
        type: 'sentiment_divergence_detected',
        player_id: player.id,
        turn: globalTurnId,
        divergence: divergenceInfo.divergence,
        hostile_segments: divergenceInfo.hostileSegments,
        enthusiastic_segments: divergenceInfo.enthusiasticSegments,
        reason: `${divergenceInfo.hostileSegments.join(', ')} vs ${divergenceInfo.enthusiasticSegments.join(', ')} polarization`,
      });
    }

    return {
      success: true,
      segmentSentimentPatches: patches.length > 0 ? patches : undefined,
      events: events.length > 0 ? events : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SegSentiment] FAILED player=${player.id} turn=${globalTurnId}: ${message}`);
    return { success: false, error: `Sentiment processing failed: ${message}` };
  }
}

// ─── MODULE REGISTRATION HELPER ──────────────────────────────────────────────

/**
 * Module metadata for turnScheduler registration.
 * Order 4.45: After socialMediaModule (4), before fandomSegmentsModule (4.5)
 */
export const MODULE_ORDER = 4.45;
export const MODULE_NAME = 'fandomSegmentsSentiment';
