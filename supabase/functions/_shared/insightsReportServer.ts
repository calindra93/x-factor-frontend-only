/**
 * INSIGHTS REPORT SERVER
 * Endpoint to serve insightsReport to frontend
 * Handles caching and consistency
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { getAuthUser } from './lib/authFromRequest.ts';
import { generateInsightsReport, getCacheKey } from './insightsReportGenerator.ts';

const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

// Simple in-memory cache (replace with Redis in production)
const reportCache = new Map();

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }

    // Get artist profile
    const profiles = await entities.ArtistProfile.filter({
      user_account_id: user.email
    });

    if (!profiles?.length) {
      return Response.json({ error: 'No artist profile' }, { status: 404 });
    }

    const profile = profiles[0];

    // Get current turn
    const turnStates = await entities.TurnState.filter({}, '-created_date', 1);
    const turnId = turnStates?.length > 0 ? turnStates[0].current_turn_id : 1;

    // Check cache
    const cacheKey = getCacheKey(profile.id, turnId);
    if (reportCache.has(cacheKey)) {
      return Response.json({ cached: true, ...reportCache.get(cacheKey) });
    }

    // Get fan profile
    const fanProfiles = await entities.FanProfile.filter({
      artist_id: profile.id
    });

    if (!fanProfiles?.length) {
      return Response.json({ error: 'No fan profile' }, { status: 404 });
    }

    const fanProfile = fanProfiles[0];

    // Get era
    const eras = await entities.Era.filter({
      artist_id: profile.id,
      is_active: true
    });
    const era = eras?.[0];

    // Get releases
    const releases = await entities.Release.filter({
      artist_id: profile.id
    }, '-lifetime_streams', 5);

    // Generate report
    const report = await generateInsightsReport(profile, fanProfile, turnId, entities, era, releases);

    if (!report) {
      return Response.json({ error: 'Failed to generate report' }, { status: 500 });
    }

    // Cache for this turn
    reportCache.set(cacheKey, report);

    // Clean old cache entries (keep last 5 turns per player)
    const playerCacheKeys = Array.from(reportCache.keys()).filter((k) => k.startsWith(`insights_report:${profile.id}:`));
    if (playerCacheKeys.length > 5) {
      playerCacheKeys.slice(0, -5).forEach((k) => reportCache.delete(k));
    }

    return Response.json({ cached: false, ...report });
  } catch (error) {
    console.error('[InsightsReport] Error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}