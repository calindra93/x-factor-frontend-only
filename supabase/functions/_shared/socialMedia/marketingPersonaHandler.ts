/**
 * getMarketingPersonaSummary — Edge function handler.
 * Computes the player's marketing persona from live DB signals.
 * Player-scoped: only returns data for the requesting artist.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import {
  computeMarketingPersona,
  getTopAffinities,
  type PersonaInput,
} from '../marketingPersona.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function N(v: unknown): number { return Number(v) || 0; }
function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getMarketingPersonaSummary(req: Request): Promise<Response> {
  const body = await req.clone().json();
  const artistId = body.artistId;

  if (!artistId) {
    return Response.json({ error: 'artistId required' }, { status: 400, headers: corsHeaders });
  }
  if (!isUuid(artistId)) {
    return Response.json({ error: 'artistId must be a valid UUID' }, { status: 400, headers: corsHeaders });
  }

  try {
    const supabase = supabaseAdmin;

    // Load all signals in parallel
    const [profileRes, fanProfileRes, postStatsRes, turnRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('career_stage, followers, clout, hype, income, genre, region')
        .eq('id', artistId)
        .maybeSingle(),
      supabase
        .from('fan_profiles')
        .select('monthly_listeners, retention_rate, listener_growth_trend, career_trends, overall_sentiment, region_share')
        .eq('artist_id', artistId)
        .maybeSingle(),
      supabase
        .from('social_posts')
        .select('engagement_rate, views, is_viral')
        .eq('artist_id', artistId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('turn_state')
        .select('global_turn_id')
        .eq('id', 1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const fanProfile = fanProfileRes.data;
    const posts = postStatsRes.data || [];
    const currentTurn = turnRes.data?.global_turn_id || 0;

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders });
    }

    // Aggregate social post stats
    const totalPosts = posts.length;
    const avgEngagement = totalPosts > 0
      ? posts.reduce((s: number, p: any) => s + N(p.engagement_rate), 0) / totalPosts
      : 0;
    const avgViews = totalPosts > 0
      ? posts.reduce((s: number, p: any) => s + N(p.views), 0) / totalPosts
      : 0;
    const viralCount = posts.filter((p: any) => p.is_viral).length;

    // Build region share
    const regionShare: Record<string, number> = fanProfile?.region_share || {};

    const personaInput: PersonaInput = {
      careerStage: profile.career_stage || 'Unknown',
      followers: N(profile.followers),
      clout: N(profile.clout),
      hype: N(profile.hype),
      income: N(profile.income),
      genre: profile.genre || '',
      region: profile.region || '',
      monthlyListeners: N(fanProfile?.monthly_listeners),
      retentionRate: N(fanProfile?.retention_rate),
      listenerGrowthTrend: N(fanProfile?.listener_growth_trend),
      careerTrends: fanProfile?.career_trends || {},
      stans: 0,
      core: 0,
      casual: 0,
      trend: 0,
      overallSentiment: N(fanProfile?.overall_sentiment),
      regionShare,
      totalPosts,
      avgEngagementRate: avgEngagement,
      avgViews,
      viralPostCount: viralCount,
    };

    const result = computeMarketingPersona(personaInput);
    const topAffinities = getTopAffinities(result);

    // Write computed primary/secondary back to profiles so Social.jsx and other
    // callers can read core_brand_identity_primary/secondary without re-computing.
    // Only update when the column is currently null to avoid overwriting a user's
    // manually chosen Era expression identity.
    try {
      const { error: writeBackError } = await supabase
        .from('profiles')
        .update({
          core_brand_identity_primary: result.primary_persona,
          core_brand_identity_secondary: result.secondary_persona ?? null,
        })
        .eq('id', artistId)
        .is('core_brand_identity_primary', null);
      if (writeBackError) {
        console.warn('[getMarketingPersonaSummary] persona write-back failed:', {
          artistId,
          code: writeBackError.code,
          message: writeBackError.message,
          details: writeBackError.details,
        });
      }
    } catch (writeErr) {
      // Non-fatal — write-back failure should not block the response
      console.warn('[getMarketingPersonaSummary] persona write-back exception:', { artistId, error: writeErr });
    }

    return Response.json({
      success: true,
      data: {
        primary_persona: result.primary_persona,
        secondary_persona: result.secondary_persona,
        confidence_score: result.confidence_score,
        persona_scores: result.persona_scores,
        top_reasons: result.reason_trace.top_reasons,
        top_affinities: topAffinities,
        signals_used: result.reason_trace.signals_used,
        persona_reasons: result.reason_trace.persona_reasons,
        updated_turn_id: currentTurn,
      },
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getMarketingPersonaSummary] Error:', msg);
    return Response.json({ error: 'Failed to compute persona', details: msg }, { status: 500, headers: corsHeaders });
  }
}
