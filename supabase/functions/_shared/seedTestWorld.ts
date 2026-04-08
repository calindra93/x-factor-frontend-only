/**
 * SEED TEST WORLD - Creates minimal test players
 * 
 * Creates 3 test artists with all required entities:
 * - ArtistProfile
 * - FanProfile
 * - At least 1 Release
 * - Era (active)
 * - TurnState (if missing)
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { requireAdmin } from './lib/authFromRequest.ts';

async function seedTestWorld(serviceContext) {
  const entities = serviceContext.entities;
  const now = new Date();

  console.log('[SeedTestWorld] Starting seed...');

  const testArtists = [
    { name: 'Test Artist 1', genre: 'Hip-Hop', region: 'United States' },
    { name: 'Test Artist 2', genre: 'Pop', region: 'Canada' },
    { name: 'Test Artist 3', genre: 'EDM', region: 'Europe' }
  ];

  const results = {
    created_artists: [],
    created_fan_profiles: [],
    created_releases: [],
    created_eras: [],
    errors: []
  };

  try {
    // Ensure TurnState exists
    const turnStates = await entities.TurnState.list('-created_date', 1);
    if (turnStates.length === 0) {
      await entities.TurnState.create({
        global_turn_id: 1,
        turn_timestamp: now.toISOString(),
        status: 'testing'
      });
      console.log('[SeedTestWorld] Created TurnState');
    }

    // Create test artists
    for (const artistData of testArtists) {
      try {
        const artist = await entities.ArtistProfile.create({
          artist_name: artistData.name,
          genre: artistData.genre,
          region: artistData.region,
          energy: 100,
          inspiration: 100,
          income: 5000,
          followers: 500,
          follower_growth: 10,
          clout: 50,
          global_rank: 500,
          hype: 40,
          fame: 100,
          label: 'Independent',
          onboarding_complete: true,
          career_stage: 'Indie Darling'
        });

        console.log(`[SeedTestWorld] Created artist: ${artist.id}`);
        results.created_artists.push({
          id: artist.id,
          name: artistData.name
        });

        // Create FanProfile
        const fanProfile = await entities.FanProfile.create({
          artist_id: artist.id,
          monthly_listeners: 5000,
          monthly_active_listeners: 2000,
          weekly_unique_w1: 1500,
          weekly_unique_w2: 1400,
          weekly_unique_w3: 1300,
          weekly_unique_w4: 1200,
          weekly_active_w1: 800,
          weekly_active_w2: 750,
          weekly_active_w3: 700,
          weekly_active_w4: 650,
          stans: 10,
          core: 35,
          casual: 35,
          trend: 20,
          fanbase_nickname: `${artistData.name} Fans`,
          last_bucket_shift_turn: 1,
          last_monthly_listeners: 4800,
          listener_growth_trend: 4.2,
          retention_rate: 0.85,
          platformStreamShare: {
            Streamify: 50,
            AppleCore: 30,
            SoundBurst: 20
          },
          platformMonthlyListeners: {
            Streamify: 2500,
            AppleCore: 1500,
            SoundBurst: 1000
          }
        });

        console.log(`[SeedTestWorld] Created FanProfile: ${fanProfile.id}`);
        results.created_fan_profiles.push({
          id: fanProfile.id,
          artist_id: artist.id
        });

        // Create Release (test project)
        const release = await entities.Release.create({
          project_id: `project_${artist.id}_1`,
          artist_id: artist.id,
          release_name: `${artistData.name} - Test Track`,
          project_type: 'Single',
          cover_artwork_url: 'https://via.placeholder.com/200',
          release_date: now.toISOString().split('T')[0],
          scheduled_turn: 1,
          platforms: ['Streamify', 'AppleCore', 'SoundBurst'],
          primary_region: artistData.region,
          lifetime_streams: 25000,
          lifetime_revenue: 250,
          clout_impact: 10,
          lifecycle_state: 'Stable',
          current_chart_position: 150,
          peak_chart_position: 100
        });

        console.log(`[SeedTestWorld] Created Release: ${release.id}`);
        results.created_releases.push({
          id: release.id,
          artist_id: artist.id
        });

        // Create active Era
        const era = await entities.Era.create({
          artist_id: artist.id,
          era_name: `${artistData.name} Era 1`,
          start_turn: 1,
          end_turn: 30,
          is_active: true,
          trigger_event: 'manual',
          theme_color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          focus_path: 'MAINSTREAM_PUSH',
          phase: 'DROP',
          phase_turns_left: 7,
          momentum: 45,
          tension: 25,
          budget_total: 1000,
          current_multiplier_streaming: 1.1,
          current_multiplier_virality: 1.0,
          current_multiplier_retention: 0.95,
          current_multiplier_hype_decay: 0.9,
          volatility_level: 20,
          career_stage: 'EARLY'
        });

        console.log(`[SeedTestWorld] Created Era: ${era.id}`);
        results.created_eras.push({
          id: era.id,
          artist_id: artist.id
        });
      } catch (artistError) {
        console.error(`[SeedTestWorld] Error creating artist data:`, artistError.message);
        results.errors.push({
          artist: artistData.name,
          error: artistError.message
        });
      }
    }

    console.log('[SeedTestWorld] Seed complete');
    return {
      status: 'success',
      ...results
    };
  } catch (error) {
    console.error('[SeedTestWorld] Fatal error:', error.message);
    return {
      status: 'failed',
      error: error.message,
      stack: error.stack,
      ...results
    };
  }
}

export async function handleRequest(req) {
  try {
    const { user, error: authErr } = await requireAdmin(req);
    if (!user) {
      return Response.json({ error: authErr || 'Admin only' }, { status: 403 });
    }

    const result = await seedTestWorld({ entities: createSupabaseEntitiesAdapter(supabaseAdmin) });
    return Response.json(result);
  } catch (error) {
    console.error('[SeedTestWorld] Fatal error:', error);
    return Response.json({ error: (error as Error).message, stack: (error as Error).stack }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}