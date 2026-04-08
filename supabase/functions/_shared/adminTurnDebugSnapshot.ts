import { supabaseAdmin } from './lib/supabaseAdmin.ts';

function requireAdmin(req) {
  const expected = Deno.env.get('ADMIN_DEBUG_TOKEN');
  if (!expected) return true;
  const provided = req.headers.get('x-admin-debug-token') || '';
  return provided && provided === expected;
}

export async function handleRequest(req) {
  try {
    if (!requireAdmin(req)) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const playerId = url.searchParams.get('player_id');
    const turnId = Number(url.searchParams.get('turn_id') || '0');

    if (!playerId || !Number.isFinite(turnId) || turnId <= 0) {
      return Response.json({ error: 'player_id and turn_id are required' }, { status: 400 });
    }

    const [{ data: profile }, { data: fanProfile }, { data: releases }, { data: merch }] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', playerId).maybeSingle(),
      supabaseAdmin.from('fan_profiles').select('*').eq('artist_id', playerId).maybeSingle(),
      supabaseAdmin
        .from('releases')
        .select('id,title,lifecycle_state,lifetime_streams,lifetime_revenue,platform_streams')
        .eq('artist_id', playerId)
        .order('lifetime_streams', { ascending: false }),
      supabaseAdmin
        .from('merch')
        .select('id,name,status,price_per_unit,units_manufactured,units_sold,total_revenue')
        .eq('artist_id', playerId)
    ]);

    const [{ data: events }, { data: notifications }] = await Promise.all([
      supabaseAdmin
        .from('turn_event_log')
        .select('*')
        .eq('player_id', playerId)
        .lte('global_turn_id', turnId)
        .order('global_turn_id', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('player_id', playerId)
        .lte('created_turn_index', turnId)
        .order('created_turn_index', { ascending: false })
        .limit(20)
    ]);

    const releaseAgg = (releases || []).reduce(
      (acc, release) => {
        acc.count += 1;
        acc.lifetime_streams += Number(release.lifetime_streams || 0);
        acc.lifetime_revenue += Number(release.lifetime_revenue || 0);
        return acc;
      },
      { count: 0, lifetime_streams: 0, lifetime_revenue: 0 }
    );

    const merchAgg = (merch || []).reduce(
      (acc, item) => {
        acc.count += 1;
        acc.units_manufactured += Number(item.units_manufactured || 0);
        acc.units_sold += Number(item.units_sold || 0);
        acc.total_revenue += Number(item.total_revenue || 0);
        return acc;
      },
      { count: 0, units_manufactured: 0, units_sold: 0, total_revenue: 0 }
    );

    return Response.json({
      player_id: playerId,
      turn_id: turnId,
      profile,
      fan_profile: fanProfile,
      release_aggregates: releaseAgg,
      merch_aggregates: merchAgg,
      last_events: events || [],
      last_notifications: notifications || []
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message, stack: (error as Error).stack }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
