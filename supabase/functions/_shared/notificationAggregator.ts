/**
 * NOTIFICATION AGGREGATOR — Upsert-based grouping for main inbox notifications.
 * 
 * Instead of creating N individual notifications for repeated events (e.g. region
 * shifts every turn), this module merges them into a single card per group_key
 * within a configurable window.
 *
 * Usage:
 *   const notif = await upsertAggregatedNotification(supabaseClient, playerId, {
 *     group_key: 'market:player123:US',
 *     window_turns: 14,
 *     current_turn: globalTurnId,
 *     type: 'MARKET_SHIFT',
 *     title: 'US market shifting',
 *     subtitle: 'Opportunity detected',
 *     body: '...',
 *     metrics: { region: 'US', status: 'heating_up', delta: 5 },
 *     deep_links: { page: 'Career', tab: 'Markets', region: 'US' },
 *     priority: 'low',
 *     idempotency_key: 'market:player123:US:week:70',
 *     context: {},
 *     mergeFn: (existing, incoming) => mergedMetrics,
 *   });
 */

interface AggregationPayload {
  group_key: string;
  window_turns: number;
  current_turn: number;
  type: string;
  title: string;
  subtitle: string;
  body?: string;
  metrics: Record<string, any>;
  deep_links: Record<string, any> | any[];
  priority: string;
  idempotency_key: string;
  context?: Record<string, any>;
  mergeFn?: (existingMetrics: Record<string, any>, incomingMetrics: Record<string, any>) => Record<string, any>;
}

/**
 * Upsert an aggregated notification.
 * - Looks for an existing unread notification with the same group_key within the window.
 * - If found: updates it (bumps group_count, merges metrics, refreshes created_at).
 * - If not found: inserts a new one.
 * Returns the notification row (created or updated).
 */
export async function upsertAggregatedNotification(
  supabaseClient: any,
  playerId: string,
  payload: AggregationPayload
): Promise<any> {
  const {
    group_key,
    window_turns,
    current_turn,
    type,
    title,
    subtitle,
    body,
    metrics,
    deep_links,
    priority,
    idempotency_key,
    context = {},
    mergeFn,
  } = payload;

  const windowStart = current_turn - window_turns;

  // Look for existing notification in window with same group_key
  const { data: existing } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('player_id', playerId)
    .eq('group_key', group_key)
    .gte('global_turn_id', windowStart)
    .order('created_at', { ascending: false })
    .limit(1);

  const prev = existing?.[0];

  if (prev) {
    // Merge metrics
    const mergedMetrics = mergeFn
      ? mergeFn(prev.metrics || {}, metrics)
      : { ...prev.metrics, ...metrics };

    // Cap history arrays at 6 entries
    for (const key of Object.keys(mergedMetrics)) {
      if (Array.isArray(mergedMetrics[key]) && mergedMetrics[key].length > 6) {
        mergedMetrics[key] = mergedMetrics[key].slice(-6);
      }
    }

    const { data: updated, error } = await supabaseClient
      .from('notifications')
      .update({
        subtitle,
        body: body ?? prev.body,
        metrics: mergedMetrics,
        deep_links: deep_links ?? prev.deep_links,
        priority,
        group_count: (prev.group_count || 1) + 1,
        is_aggregated: true,
        context: { ...prev.context, ...context },
        global_turn_id: current_turn,
        created_turn_index: current_turn,
        created_at: new Date().toISOString(),
        is_read: false, // Bubble back to unread
      })
      .eq('id', prev.id)
      .select('*')
      .single();

    if (error) {
      console.error('[NotifAggregator] Update failed:', error.message);
      return null;
    }
    return updated;
  }

  // No existing — insert new
  const { data: created, error } = await supabaseClient
    .from('notifications')
    .insert({
      player_id: playerId,
      global_turn_id: current_turn,
      created_turn_index: current_turn,
      type,
      title,
      subtitle,
      body,
      metrics,
      deep_links,
      priority,
      idempotency_key,
      is_read: false,
      group_key,
      group_count: 1,
      is_aggregated: false,
      context,
    })
    .select('*')
    .single();

  if (error) {
    // Idempotency — already exists
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return null;
    }
    console.error('[NotifAggregator] Insert failed:', error.message);
    return null;
  }
  return created;
}

/**
 * Helper: merge market shift metrics with history tracking
 */
export function mergeMarketShiftMetrics(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  const history = [...(existing.history || [])];
  history.push({
    turn: incoming._turn,
    status: incoming.status,
    delta: incoming.delta,
  });
  // Cap at 6
  while (history.length > 6) history.shift();

  return {
    region: incoming.region,
    status: incoming.status,
    delta: incoming.delta,
    history,
  };
}

/**
 * Helper: merge follower spike metrics
 */
export function mergeFollowerSpikeMetrics(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  return {
    total_followers_gained: (existing.total_followers_gained || 0) + (incoming.follower_growth || 0),
    spikes: (existing.spikes || 0) + 1,
    latest_gain: incoming.follower_growth,
  };
}

/**
 * Helper: merge streaming spike metrics
 */
export function mergeStreamingSpikeMetrics(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  return {
    total_streams: (existing.total_streams || 0) + (incoming.streams_earned || 0),
    total_revenue: (existing.total_revenue || 0) + (incoming.streaming_revenue || 0),
    peak_streams: Math.max(existing.peak_streams || 0, incoming.streams_earned || 0),
    spikes: (existing.spikes || 0) + 1,
  };
}

/**
 * Helper: merge merch surge metrics
 */
export function mergeMerchSurgeMetrics(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  return {
    total_revenue: (existing.total_revenue || 0) + (incoming.merch_revenue || 0),
    total_units: (existing.total_units || 0) + (incoming.merch_units_sold || 0),
  };
}

/**
 * Helper: merge playlist metrics
 */
export function mergePlaylistMetrics(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  return {
    total_placements: incoming.total_placements || existing.total_placements || 0,
    best_release: incoming.best_release || existing.best_release,
    best_release_id: incoming.best_release_id || existing.best_release_id,
  };
}
