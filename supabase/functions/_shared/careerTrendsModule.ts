/**
 * CAREER TRENDS MODULE v2 — commit adapter
 * Trend/effects are computed once in scheduler runtime context.
 * Single trend at a time. STABLE is default.
 */

import { CAREER_TRENDS, ONE_HIT_WONDER_DURATION, type CareerTrend } from './careerTrendsEngine.ts';

export async function processCareerTrendsForPlayer(
  player: any,
  fanProfile: any,
  globalTurnId: number,
  _entities: any,
  ctx: any = {}
): Promise<{ success: boolean; deltas?: Record<string, any> }> {
  if (!player?.id || !fanProfile) return { success: false };

  const runtimeTrend = ctx?.runtimeContext?.careerTrendByArtistId?.[player.id];
  if (!runtimeTrend?.trend || !runtimeTrend?.effects) {
    return { success: true, deltas: {} };
  }

  const prevTrend = Object.entries((fanProfile?.career_trends || {})).find(([, v]) => !!v)?.[0] as CareerTrend | undefined;
  const nextTrend = runtimeTrend.trend as CareerTrend;
  const changed = prevTrend !== nextTrend;
  const prevHoldTurns = Number(fanProfile?.career_trend_modifiers?.trend_hold_turns) || 0;
  const holdTurns = changed ? 1 : prevHoldTurns + 1;

  // Detect ONE_HIT_WONDER tenure expiry: transitioning OUT of OHW after it ran its full duration.
  // Once expired, the flag sticks permanently to prevent re-entry.
  const ohwExpiredNow = changed && prevTrend === 'ONE_HIT_WONDER' && prevHoldTurns >= ONE_HIT_WONDER_DURATION;
  const ohwAlreadyExpired = fanProfile?.career_trend_modifiers?.one_hit_wonder_expired === true;

  // Build canonical trends map: all known trends false except the single active one.
  const trends: Record<string, boolean> = Object.fromEntries(CAREER_TRENDS.map(t => [t, t === nextTrend]));
  // CRITICAL: Zero out legacy v1 modifier keys before spreading new effects.
  // Without this, stale values from previous trends (e.g. ONE_HIT_WONDER's
  // listener_decay_mult=0.025) persist forever because the v2 effects object
  // from applyCareerTrendEffects() doesn't include these keys for STABLE.
  const V1_MODIFIER_DEFAULTS: Record<string, number> = {
    listener_decay_mult: 0,
    hype_decay_boost: 0,
    follower_growth_mult: 1.0,
    revenue_penalty: 0,
    marketing_efficiency_bonus: 0,
    retention_bonus: 0,
    trend_visibility: 0,
  };

  const modifiers = {
    ...(fanProfile?.career_trend_modifiers || {}),
    ...V1_MODIFIER_DEFAULTS,  // zero stale v1 keys first
    ...runtimeTrend.effects,  // then overlay v2 effects
    current_trend: nextTrend,
    // Store previous_trend so COMEBACK checker can detect recovery from slump/flop
    previous_trend: changed ? (prevTrend || null) : (fanProfile?.career_trend_modifiers?.previous_trend || null),
    trend_hold_turns: holdTurns,
    top_signals: runtimeTrend.rationaleKeys || [],
    trend_changed_turn: changed ? globalTurnId : (fanProfile?.career_trend_modifiers?.trend_changed_turn || globalTurnId),
    // Store smash hit release ID for ONE_HIT_WONDER stream penalty targeting
    smash_hit_release_id: runtimeTrend.smashHitReleaseId || (fanProfile?.career_trend_modifiers?.smash_hit_release_id || null),
    // Permanent flag: once OHW tenure completes, block re-entry forever
    one_hit_wonder_expired: ohwAlreadyExpired || ohwExpiredNow,
  };

  const deltas: Record<string, any> = {
    fanProfile: {
      career_trends: trends,
      career_trend_modifiers: modifiers,
    },
  };

  if (changed) {
    deltas.turn_events = [{
      global_turn_id: globalTurnId,
      player_id: player.id,
      module: 'career_trends',
      event_type: 'trend_changed',
      description: `Career trend: ${prevTrend || 'NONE'} → ${nextTrend}`,
      metadata: {
        fromTrend: prevTrend || null,
        toTrend: nextTrend,
        topSignals: (runtimeTrend.rationaleKeys || []).slice(0, 3),
      },
      created_at: new Date().toISOString(),
    }];

    deltas.career_trend_events = [{
      global_turn_id: globalTurnId,
      player_id: player.id,
      trends,
      added: [nextTrend],
      removed: prevTrend ? [prevTrend] : [],
      reason: { topSignals: (runtimeTrend.rationaleKeys || []).slice(0, 3) },
    }];
  }

  return { success: true, deltas };
}
