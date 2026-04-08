/**
 * APPLECORE RADIO HANDLER
 * Handles radio station submissions with server-side calculations
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../lib/supabaseEntityAdapter.ts';

// Helper function to wrap numeric values
function N(v: any): number {
  return Number(v) || 0;
}

// Station configurations matching frontend
const RADIO_STATIONS: Record<string, {
  name: string;
  minClout: number;
  minFollowers: number;
  streamBoost: number;
  hypeBoost: number;
  listenerReach: number;
  energyCost: number;
}> = {
  'ac-1': { name: 'AppleCore 1', minClout: 0, minFollowers: 0, streamBoost: 1.5, hypeBoost: 3, listenerReach: 10000, energyCost: 5 },
  'ac-hits': { name: 'Hits Radio', minClout: 30, minFollowers: 500, streamBoost: 2.0, hypeBoost: 5, listenerReach: 25000, energyCost: 8 },
  'ac-hiphop': { name: 'Hip Hop Radio', minClout: 60, minFollowers: 1500, streamBoost: 2.5, hypeBoost: 6, listenerReach: 40000, energyCost: 10 },
  'ac-rnb': { name: 'R&B Soul Radio', minClout: 80, minFollowers: 2000, streamBoost: 2.8, hypeBoost: 7, listenerReach: 50000, energyCost: 12 },
  'ac-club': { name: 'Club Radio', minClout: 100, minFollowers: 3000, streamBoost: 3.0, hypeBoost: 8, listenerReach: 60000, energyCost: 14 },
  'ac-chill': { name: 'Chill Radio', minClout: 40, minFollowers: 800, streamBoost: 1.8, hypeBoost: 4, listenerReach: 20000, energyCost: 7 },
  'takeover-1': { name: 'Radio Takeover', minClout: 150, minFollowers: 5000, streamBoost: 4.0, hypeBoost: 12, listenerReach: 150000, energyCost: 20 },
  'takeover-2': { name: 'Guest Feature', minClout: 200, minFollowers: 8000, streamBoost: 5.0, hypeBoost: 15, listenerReach: 250000, energyCost: 25 },
};

export async function submitToRadioStation(req: Request) {
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId, stationId, releaseId, energyCost } = body;

    console.log(`[${traceId}] [AppleCoreRadio] Request body:`, { artistId, stationId, releaseId, energyCost });

    // Validate required fields
    if (!artistId || !stationId || !releaseId) {
      const errorDetails = { 
        artistId: !!artistId, 
        stationId: !!stationId, 
        releaseId: !!releaseId,
        fullBody: body
      };
      console.log(`[${traceId}] [AppleCoreRadio] Missing required fields:`, errorDetails);
      return Response.json({
        error: 'Missing required fields',
        details: errorDetails,
        traceId,
      }, { status: 400 });
    }

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

    // Get artist profile
    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      console.log(`[${traceId}] [AppleCoreRadio] Artist profile not found:`, { artistId });
      return Response.json({
        error: 'Artist profile not found',
        details: { artistId },
        traceId,
      }, { status: 404 });
    }

    // Get station config
    const station = RADIO_STATIONS[stationId];
    if (!station) {
      console.log(`[${traceId}] [AppleCoreRadio] Invalid station:`, { stationId, available: Object.keys(RADIO_STATIONS) });
      return Response.json({
        error: 'Invalid station',
        details: { stationId, available: Object.keys(RADIO_STATIONS) },
        traceId,
      }, { status: 400 });
    }

    // Check energy
    const currentEnergy = N(profile.energy);
    if (currentEnergy < station.energyCost) {
      console.log(`[${traceId}] [AppleCoreRadio] Insufficient energy:`, { 
        current: currentEnergy, 
        required: station.energyCost 
      });
      return Response.json({
        error: 'Insufficient energy',
        details: { 
          current: currentEnergy, 
          required: station.energyCost 
        },
        traceId,
      }, { status: 400 });
    }

    // Check eligibility gates
    const currentClout = N(profile.clout);
    const currentFollowers = N(profile.followers);
    if (currentClout < station.minClout || currentFollowers < station.minFollowers) {
      console.log(`[${traceId}] [AppleCoreRadio] Station locked:`, {
        requiredClout: station.minClout,
        currentClout: currentClout,
        requiredFollowers: station.minFollowers,
        currentFollowers: currentFollowers,
      });
      return Response.json({
        error: 'Station locked',
        details: {
          requiredClout: station.minClout,
          currentClout: currentClout,
          requiredFollowers: station.minFollowers,
          currentFollowers: currentFollowers,
        },
        traceId,
      }, { status: 403 });
    }

    // Get release for validation
    const release = await entities.Release.get(releaseId);
    if (!release || release.artist_id !== artistId) {
      console.log(`[${traceId}] [AppleCoreRadio] Release not found or not owned:`, { 
        releaseId, 
        artistId, 
        releaseExists: !!release,
        releaseArtistId: release?.artist_id 
      });
      return Response.json({
        error: 'Release not found or not owned by artist',
        details: { releaseId, artistId },
        traceId,
      }, { status: 404 });
    }

    // Calculate performance (server-side)
    const streamGain = Math.floor(
      station.listenerReach * 
      station.streamBoost * 
      (0.8 + Math.random() * 0.4)
    );
    const followerGain = Math.max(1, Math.floor(streamGain * 0.002));
    const revenueGain = Math.floor(streamGain * 0.004);

    // Deduct energy immediately (instant cost)
    await entities.ArtistProfile.update(artistId, {
      energy: Math.max(0, N(profile.energy) - station.energyCost),
    });

    // Update release stats immediately (radio play is instant)
    await entities.Release.update(releaseId, {
      lifetime_streams: N(release.lifetime_streams) + streamGain,
      lifetime_revenue: N(release.lifetime_revenue) + revenueGain,
    });

    // Return success with gains (for UI display)
    // Note: hype/followers/income will be applied by turn engine via news items
    return Response.json({
      success: true,
      station: station.name,
      gains: {
        streams: streamGain,
        followers: followerGain,
        revenue: revenueGain,
        hype: station.hypeBoost,
      },
      energyDeducted: station.energyCost,
      traceId,
    });

  } catch (err: unknown) {
    console.error(`[${traceId}] [AppleCoreRadio] Error:`, err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return Response.json({ 
      error: 'Internal error', 
      details: errorMessage, 
      traceId 
    }, { status: 500 });
  }
}
