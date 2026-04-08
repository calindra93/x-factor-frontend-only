import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { getAuthUser } from './lib/authFromRequest.ts';

// Calculate Brand Heat (pre-social engagement)
// Considers: studio quality, release performance, budget allocation, actions, merchandise, merch sales
async function calculateBrandHeat(req) {
  const { user, error: authErr } = await getAuthUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: authErr || 'Unauthorized' }), { status: 401 });
  }

  const entities = createSupabaseEntitiesAdapter(supabaseAdmin);

  try {
    const body = await req.json();
    const { artistId } = body;

    const profile = await entities.ArtistProfile.get(artistId);
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Artist not found' }), { status: 404 });
    }

    // Get current era
    const eras = await entities.Era.filter(
      { artist_id: artistId, is_active: true },
      "-created_date",
      1
    );
    const era = eras?.[0];

    // Get recent releases
    const releases = await entities.Release.filter(
      { artist_id: artistId },
      "-release_date",
      10
    );

    // Get merchandise
    const merch = await entities.Merch.filter(
      { artist_id: artistId },
      "-created_date",
      20
    );

    // Get songs (for studio quality indicator)
    const songs = await entities.Song.filter(
      { artist_id: artistId },
      "-created_date",
      20
    );

    let brandHeat = 0;
    const breakdown = {};

    // 1. RELEASE QUALITY & PERFORMANCE (35%)
    if (releases.length > 0) {
      const avgQuality = releases.reduce((sum, r) => sum + (r.clout_impact || 0), 0) / releases.length;
      const recentStreams = releases[0]?.lifetime_streams || 0;
      const releaseMultiplier = Math.min(1, recentStreams / 100000); // Cap at 100k streams
      const releaseHeat = Math.round(35 * (avgQuality / 100) * (0.5 + releaseMultiplier * 0.5));
      brandHeat += releaseHeat;
      breakdown.releaseQuality = releaseHeat;
    } else {
      breakdown.releaseQuality = 0;
    }

    // 2. STUDIO/PRODUCTION QUALITY (20%)
    if (songs.length > 0) {
      const avgSongQuality = songs.reduce((sum, s) => sum + (s.quality || 0), 0) / songs.length;
      const studioHeat = Math.round(20 * (avgSongQuality / 100));
      brandHeat += studioHeat;
      breakdown.studioQuality = studioHeat;
    } else {
      breakdown.studioQuality = 0;
    }

    // 3. ERA BUDGET ALLOCATION STRATEGY (15%)
    if (era) {
      const totalBudget = era.budget_total || 0;
      // Well-balanced budgets = better brand heat
      const budgets = [
        era.budget_marketing || 0,
        era.budget_visuals || 0,
        era.budget_community || 0
      ];
      const avgBudget = budgets.reduce((a, b) => a + b, 0) / budgets.length;
      const budgetBalance = budgets.length > 0 
        ? 1 - (Math.max(...budgets, 0) - Math.min(...budgets, 999999)) / (avgBudget * 3 || 1)
        : 0;
      const budgetHeat = Math.round(15 * Math.max(0, budgetBalance) * (totalBudget > 0 ? 1 : 0.3));
      brandHeat += budgetHeat;
      breakdown.budgetStrategy = budgetHeat;
    } else {
      breakdown.budgetStrategy = 0;
    }

    // 4. MERCHANDISE PERFORMANCE (15%)
    if (merch.length > 0) {
      const activeMerch = merch.filter(m => m.status !== "Archived");
      const avgSellThrough = activeMerch.length > 0
        ? activeMerch.reduce((sum, m) => {
            const st = m.units_manufactured > 0 ? (m.units_sold / m.units_manufactured) : 0;
            return sum + st;
          }, 0) / activeMerch.length
        : 0;
      
      const totalMerchRevenue = merch.reduce((sum, m) => sum + (m.total_revenue || 0), 0);
      const merchHeat = Math.round(15 * avgSellThrough * (totalMerchRevenue > 5000 ? 1 : 0.5));
      brandHeat += merchHeat;
      breakdown.merchPerformance = merchHeat;
    } else {
      breakdown.merchPerformance = 0;
    }

    // 5. ERA PHASE & MOMENTUM (10%)
    if (era) {
      const phaseMult = {
        TEASE: 0.6,
        DROP: 1.0,
        SUSTAIN: 0.9,
        FADE: 0.5,
        LEGACY: 0.7
      };
      const multiplier = phaseMult[era.phase] || 0.5;
      const momentumFactor = (era.momentum || 0) / 100;
      const phaseHeat = Math.round(10 * multiplier * momentumFactor);
      brandHeat += phaseHeat;
      breakdown.eraPhase = phaseHeat;
    } else {
      breakdown.eraPhase = 0;
    }

    // 6. ERA ACTIONS EXECUTED (5%)
    // (This would track completed actions from session)
    breakdown.actionsExecuted = 0; // Will be added per-turn

    return new Response(JSON.stringify({
      success: true,
      totalBrandHeat: Math.round(brandHeat),
      breakdown,
      scoreFactors: {
        releasePerformance: releases.length > 0,
        studioQuality: songs.length > 0 ? "good" : "needs-work",
        budgetStrategy: era ? "allocated" : "none",
        merchAvailability: merch.length > 0,
        eraPhase: era?.phase || "none"
      },
      recommendation: getRecommendation(breakdown, profile)
    }), { status: 200 });
  } catch (error) {
    console.error("Brand heat calculation failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

function getRecommendation(breakdown, profile) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  
  if (total < 20) {
    return "🚀 Build more: Release quality music, record in better studios, and allocate budget to marketing.";
  } else if (total < 40) {
    return "📈 Getting traction: Keep releasing, engage through merch, and execute more era actions.";
  } else if (total < 60) {
    return "🔥 Hot brand! You're building real momentum. Consider pre-release hype campaigns.";
  } else {
    return "⭐ Breakout potential! Your brand heat is strong. Time to scale social platforms.";
  }
}

export async function handleRequest(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }
  
  return calculateBrandHeat(req);
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}