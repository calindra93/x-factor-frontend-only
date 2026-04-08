/**
 * TREND PLAYER ACTIONS
 * GAP-1 Tasks 5 & 6: Player actions to boost or sabotage active trends.
 *
 * boost_trend:    Costs energy. Increases heat_score + adoption_count of a target trend.
 *                 More effective when player genre aligns with trend category.
 * sabotage_trend: Costs energy + hype penalty. Reduces heat_score of a rival's linked trend.
 *                 Risk: backfire if trend is too popular (peak status).
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { getGenreTrait } from '../genreTraits.ts';

function N(v: unknown): number { return Number(v) || 0; }

const BOOST_ENERGY_COST = 10;
const SABOTAGE_ENERGY_COST = 15;
const SABOTAGE_HYPE_PENALTY = 3;

// Category → which genres get an affinity bonus when boosting
const CATEGORY_GENRE_AFFINITY: Record<string, string[]> = {
  sound:      ['alternative', 'alternative_rap', 'edm', 'indie', 'afrobeats'],
  challenge:  ['pop', 'hip_hop', 'kpop'],
  meme:       ['pop', 'hip_hop', 'uk_drill', 'drill', 'rap'],
  beef:       ['uk_drill', 'drill', 'rap', 'hip_hop'],
  genre_wave: ['amapiano', 'afrobeats', 'alternative', 'alternative_rap', 'indie'],
  aesthetic:  ['kpop', 'indie', 'r_and_b'],
};

export async function boostTrend(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId, trendId } = body;

    if (!artistId || !trendId) {
      return Response.json({ error: 'Missing required fields: artistId, trendId' }, { status: 400 });
    }

    // Load player + trend in parallel
    const [profileRes, trendRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, energy, genre, hype, followers').eq('id', artistId).single(),
      supabaseAdmin.from('trends').select('*').eq('id', trendId).eq('is_active', true).single(),
    ]);

    if (profileRes.error || !profileRes.data) {
      return Response.json({ error: 'Player not found' }, { status: 404 });
    }
    if (trendRes.error || !trendRes.data) {
      return Response.json({ error: 'Trend not found or inactive' }, { status: 404 });
    }

    const player = profileRes.data;
    const trend = trendRes.data;

    // Energy check
    if (N(player.energy) < BOOST_ENERGY_COST) {
      return Response.json({
        error: 'Insufficient energy',
        required: BOOST_ENERGY_COST,
        available: N(player.energy),
      }, { status: 400 });
    }

    // Calculate boost magnitude
    const genreTrait = getGenreTrait(player.genre);
    const affinityGenres = CATEGORY_GENRE_AFFINITY[trend.category] || [];
    const genreKey = (player.genre || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const hasAffinity = affinityGenres.includes(genreKey);

    // Base heat boost: 3-8 depending on hype + affinity
    const baseBoost = 3 + N(player.hype) * 0.05;
    const affinityMult = hasAffinity ? 1.4 : 1.0;
    // collaborationAffinityFactor further scales social impact
    const collabMult = 1 + genreTrait.collaborationAffinityFactor * 0.2;
    const heatBoost = Math.round(baseBoost * affinityMult * collabMult * 100) / 100;
    const adoptionBoost = hasAffinity ? 3 : 2;

    // Apply boost
    const newHeat = Math.min(100, N(trend.heat_score) + heatBoost);
    const newAdoption = N(trend.adoption_count) + adoptionBoost;

    await Promise.all([
      // Update trend
      supabaseAdmin.from('trends').update({
        heat_score: Math.round(newHeat * 100) / 100,
        adoption_count: newAdoption,
      }).eq('id', trendId),
      // Deduct energy
      supabaseAdmin.from('profiles').update({
        energy: Math.max(0, N(player.energy) - BOOST_ENERGY_COST),
      }).eq('id', artistId),
    ]);

    return Response.json({
      success: true,
      data: {
        trendId,
        trendName: trend.name,
        heatBefore: N(trend.heat_score),
        heatAfter: newHeat,
        adoptionBefore: N(trend.adoption_count),
        adoptionAfter: newAdoption,
        energyCost: BOOST_ENERGY_COST,
        hadGenreAffinity: hasAffinity,
      },
    });
  } catch (error: any) {
    console.error('[boostTrend] Error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

export async function sabotageTrend(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const { artistId, trendId } = body;

    if (!artistId || !trendId) {
      return Response.json({ error: 'Missing required fields: artistId, trendId' }, { status: 400 });
    }

    // Load player + trend in parallel
    const [profileRes, trendRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, energy, genre, hype, followers').eq('id', artistId).single(),
      supabaseAdmin.from('trends').select('*').eq('id', trendId).eq('is_active', true).single(),
    ]);

    if (profileRes.error || !profileRes.data) {
      return Response.json({ error: 'Player not found' }, { status: 404 });
    }
    if (trendRes.error || !trendRes.data) {
      return Response.json({ error: 'Trend not found or inactive' }, { status: 404 });
    }

    const player = profileRes.data;
    const trend = trendRes.data;

    // Energy check
    if (N(player.energy) < SABOTAGE_ENERGY_COST) {
      return Response.json({
        error: 'Insufficient energy',
        required: SABOTAGE_ENERGY_COST,
        available: N(player.energy),
      }, { status: 400 });
    }

    // Backfire risk: sabotaging a peak trend can hurt you instead
    const isPeak = trend.status === 'peak';
    const backfireChance = isPeak ? 0.35 : 0.10;
    const backfired = Math.random() < backfireChance;

    let heatDelta = 0;
    let hypePenalty = SABOTAGE_HYPE_PENALTY;
    let result: string;

    if (backfired) {
      // Backfire: trend GAINS heat, player loses extra hype
      heatDelta = +(2 + Math.random() * 3);
      hypePenalty = SABOTAGE_HYPE_PENALTY * 2;
      result = 'backfired';
    } else {
      // Success: reduce heat
      const genreTrait = getGenreTrait(player.genre);
      const baseDrain = 4 + N(player.hype) * 0.04;
      // beefSusceptibilityFactor: higher = better at undermining rivals
      const beefMult = 1 + genreTrait.beefSusceptibilityFactor * 0.3;
      heatDelta = -(baseDrain * beefMult);
      result = 'success';
    }

    const newHeat = Math.max(0, Math.min(100, N(trend.heat_score) + heatDelta));
    const newHype = Math.max(0, N(player.hype) - hypePenalty);
    const newEnergy = Math.max(0, N(player.energy) - SABOTAGE_ENERGY_COST);

    await Promise.all([
      supabaseAdmin.from('trends').update({
        heat_score: Math.round(newHeat * 100) / 100,
      }).eq('id', trendId),
      supabaseAdmin.from('profiles').update({
        energy: newEnergy,
        hype: newHype,
      }).eq('id', artistId),
    ]);

    return Response.json({
      success: true,
      data: {
        result,
        trendId,
        trendName: trend.name,
        heatBefore: N(trend.heat_score),
        heatAfter: newHeat,
        heatDelta: Math.round(heatDelta * 100) / 100,
        energyCost: SABOTAGE_ENERGY_COST,
        hypePenalty,
        backfired,
        backfireChance: Math.round(backfireChance * 100) + '%',
      },
    });
  } catch (error: any) {
    console.error('[sabotageTrend] Error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
