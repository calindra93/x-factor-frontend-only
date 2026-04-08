/**
 * TURN PROCESSOR - ERA LOGIC
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import { generateDynamicChallenges } from './gameDataGenerators.ts';
import { checkAutoMilestone, detectCareerStage } from './careerProgressionLogic.ts';
import { applyRunawayEraPressure } from './runawaySongMechanic.ts';
import { calculateIdentityAlignment, buildPersonaBreakdown, getScaledFocusModifiers, buildFandomEssence } from './eraIdentity.ts';
import { computeIdentityNudge, blendPersonaScoresForAlignment } from './identityAlignmentNudge.ts';
import { getIdentityTrait } from './constants/identityTraits.ts';
import { deriveFandomEssenceVectors, deriveEngagementReadiness } from './fandomModifiers.ts';
import { eraFatigueDecay, calculateLegacyBonuses, getLegacyBuffs } from './fandomPhase6.ts';

/** Compute culture shock when artist switches identity direction on era change. */
function computePivotShock(params: {
  previousDominantValue: number;
  newExpressionVectorWeight: number;
  rollingAlignmentAvg: number;
  pivotElasticity: number;
}) {
  const rawShock = Math.abs((N(params.previousDominantValue) / 100) - N(params.newExpressionVectorWeight));
  const loyaltyReduction = N(params.rollingAlignmentAvg) > 70 ? Math.min(0.5, ((N(params.rollingAlignmentAvg) - 70) / 30) * 0.5) : 0;
  const elasticityPenalty = 1 + Math.max(0, 0.8 - N(params.pivotElasticity));
  return clamp(rawShock * (1 - loyaltyReduction) * elasticityPenalty, 0, 1);
}

const ERA_BASELINE_MOMENTUM = 15;
const ERA_FATIGUE_ONSET = 80;   // turns before fatigue kicks in
const ERA_FATIGUE_FORCE_FADE = 250; // force FADE after this many turns
const ERA_FATIGUE_WARN = 150;    // notify player at this point

// Aesthetic tag → identity pillar mapping for fandom integration (12-pillar system)
import type { PillarType } from './fandomSegmentsEngine.ts';

const AESTHETIC_TAG_PILLAR: Record<string, PillarType> = {
  raw: 'rebellion', aggressive: 'chaos', underground: 'rebellion',
  luxury: 'fashion_culture', polished: 'fashion_culture', maximalist: 'exclusivity',
  ethereal: 'spirituality', dreamy: 'spirituality', minimalist: 'intellectualism',
  neon: 'hedonism', futuristic: 'intellectualism', electric: 'hedonism', retro: 'nostalgia',
  nostalgic: 'nostalgia', soulful: 'empowerment',
  dark: 'chaos', experimental: 'intellectualism', industrial: 'rebellion',
};

/**
 * Compute momentum delta from aesthetic tag ↔ fandom pillar alignment.
 * +3 to +5 momentum if tags match fandom identity pillars, +2 to +3 tension if mismatched.
 */
function computeAestheticAlignmentDelta(
  aestheticTags: string[],
  fandomIdentityPillars: Record<string, number> | null
): { momentumBonus: number; tensionBonus: number } {
  if (!aestheticTags?.length || !fandomIdentityPillars) return { momentumBonus: 0, tensionBonus: 0 };
  const pillarCounts: Record<string, number> = {};
  for (const tag of aestheticTags) {
    const pillar = AESTHETIC_TAG_PILLAR[tag];
    if (pillar) pillarCounts[pillar] = (pillarCounts[pillar] || 0) + 1;
  }
  // Find dominant pillar from tags
  let dominantPillar = '';
  let maxCount = 0;
  for (const [p, c] of Object.entries(pillarCounts)) {
    if (c > maxCount) { dominantPillar = p; maxCount = c; }
  }
  if (!dominantPillar) return { momentumBonus: 0, tensionBonus: 0 };

  // Check if fandom identity pillars align (pillar value > 50 = strong affinity)
  const pillarStrength = Number(fandomIdentityPillars[dominantPillar]) || 0;
  if (pillarStrength >= 60) return { momentumBonus: Math.min(5, 3 + Math.floor(pillarStrength / 30)), tensionBonus: 0 };
  if (pillarStrength <= 20) return { momentumBonus: 0, tensionBonus: Math.min(3, 2 + Math.floor((20 - pillarStrength) / 10)) };
  return { momentumBonus: 0, tensionBonus: 0 };
}

// Supabase returns numeric/decimal columns as strings — coerce to number
function N(v: any): number { return Number(v) || 0; }

// Phase durations in turns (game days). Total era cycle ~36 turns.
const PHASE_DURATIONS: Record<string, number> = { TEASE: 60, DROP: 40, SUSTAIN: 50, FADE: 30 };
const PHASE_SEQUENCE = ['TEASE', 'DROP', 'SUSTAIN', 'FADE'];


function vectorWeightFromIdentity(identityId: string | null | undefined, vector: 'rebellion' | 'glamour' | 'authenticity' | 'community'): number {
  const key = (identityId || '').toLowerCase();
  if (!key) return 0.5;
  if (vector === 'glamour') return ['luxury', 'viral', 'aesthetic', 'party', 'femme'].some((k) => key.includes(k)) ? 0.8 : 0.45;
  if (vector === 'authenticity') return ['street', 'conscious', 'nostalgic', 'storyteller'].some((k) => key.includes(k)) ? 0.8 : 0.45;
  if (vector === 'rebellion') return ['troll', 'underground', 'street'].some((k) => key.includes(k)) ? 0.8 : 0.45;
  return ['motivational', 'storyteller', 'community'].some((k) => key.includes(k)) ? 0.75 : 0.45;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute nostalgia bonus when current era's aesthetic_tags overlap with past iconic eras.
 * Overlapping tags with a memorable era signals a deliberate callback fans love.
 * Returns momentum bonus (0-8) and tension reduction (0 to -4).
 */
function computeNostalgiaBonus(
  currentTags: string[],
  pastEras: any[]
): { momentumBonus: number; tensionReduction: number; matchedEraName: string | null } {
  if (!currentTags?.length || !pastEras?.length) return { momentumBonus: 0, tensionReduction: 0, matchedEraName: null };

  let bestOverlap = 0;
  let bestEra: any = null;

  for (const era of pastEras) {
    if (era.is_active) continue;
    const status = era.status || (era.is_flop ? 'flop' : era.is_one_hit ? 'one_hit_wonder' : 'completed');
    const memScore = N(era.fandom_memory_score);
    // Only iconic or high-memory completed eras generate nostalgia
    if (status === 'flop' || memScore < 40) continue;
    const pastTags: string[] = Array.isArray(era.aesthetic_tags) ? era.aesthetic_tags : [];
    if (!pastTags.length) continue;

    const overlap = currentTags.filter(t => pastTags.includes(t)).length;
    // Weight by memory score — iconic eras (70+) get full bonus, 40-69 get partial
    const weightedOverlap = overlap * (memScore >= 70 ? 1.5 : memScore >= 50 ? 1.0 : 0.6);
    if (weightedOverlap > bestOverlap) {
      bestOverlap = weightedOverlap;
      bestEra = era;
    }
  }

  if (bestOverlap < 1) return { momentumBonus: 0, tensionReduction: 0, matchedEraName: null };

  // Scale: 1 overlap tag = +2 momentum, 2 = +4, 3+ = +6 to +8
  const momentumBonus = Math.min(8, Math.floor(bestOverlap * 2.5));
  // Nostalgia reduces tension — fans are comfortable with familiar aesthetics
  const tensionReduction = Math.min(4, Math.floor(bestOverlap * 1.5));

  return { momentumBonus, tensionReduction: -tensionReduction, matchedEraName: bestEra?.era_name || null };
}

/**
 * Calculate fandom memory score — how strongly fans remember this era (0-100).
 * Composite of streams, fans gained, revenue, peak hype, releases, tours, iconic releases.
 */
function calculateFandomMemoryScore(era: any): number {
  const streamPts  = Math.min(30, Math.floor(N(era.total_streams) / 10000));
  const fanPts     = Math.min(20, Math.floor(N(era.total_followers_gained) / 500));
  const revPts     = Math.min(15, Math.floor(N(era.total_revenue) / 5000));
  const hypePts    = Math.min(15, Math.floor(N(era.peak_hype) / 5));
  const releasePts = Math.min(10, N(era.releases_count) * 3);
  const tourPts    = Math.min(10, N(era.tours_count) * 5);
  const iconicPts  = Math.min(15, (Array.isArray(era.iconic_releases) ? era.iconic_releases.length : 0) * 5);
  return Math.min(100, streamPts + fanPts + revPts + hypePts + releasePts + tourPts + iconicPts);
}

/**
 * Derive fandom sentiment toward the era — positive/neutral/negative.
 * Based on momentum vs tension and overall memory score.
 */
function computeFandomSentiment(era: any): string {
  const mem = N(era.fandom_memory_score);
  const mom = N(era.momentum);
  const ten = N(era.tension);
  // Flop is always negative regardless of memory
  if (era.is_flop) return 'negative';
  // High memory (>=70) strongly signals fans remember this era fondly.
  // Tension at this stage = excitement/buzz, not negativity — only go negative
  // if memory is also low (fans not engaged) + tension is very high.
  if (mem >= 70) return mom >= ten * 0.6 ? 'positive' : 'neutral';
  if (mem >= 60 && mom > ten) return 'positive';
  if (ten > 70 && mem < 40) return 'negative';
  return 'neutral';
}

/**
 * Calculate era multipliers based on phase, momentum, and tension.
 * These affect streaming, virality, retention, and hype decay in turnProcessorCore.
 */
function calculateMultipliers(phase: string, momentum: number, tension: number) {
  const m = (momentum || 15) / 100; // 0..1
  const t = (tension || 10) / 100;  // 0..1

  const streaming = (() => {
    switch (phase) {
      case 'DROP':    return 1.0 + m * 0.8;           // 1.0 – 1.8x
      case 'SUSTAIN': return 0.9 + m * 0.5;           // 0.9 – 1.4x
      case 'TEASE':   return 0.7 + m * 0.3;           // 0.7 – 1.0x
      case 'FADE':    return 0.5 + m * 0.3;           // 0.5 – 0.8x
      default:        return 1.0;
    }
  })();

  const virality = (() => {
    switch (phase) {
      case 'DROP':    return 1.2 + t * 0.6;           // 1.2 – 1.8x (tension = hype)
      case 'TEASE':   return 1.0 + t * 0.4;           // 1.0 – 1.4x
      case 'SUSTAIN': return 0.8 + m * 0.4;           // 0.8 – 1.2x
      case 'FADE':    return 0.5 + t * 0.3;           // 0.5 – 0.8x
      default:        return 1.0;
    }
  })();

  const retention = (() => {
    switch (phase) {
      case 'SUSTAIN': return 1.1 + m * 0.4;           // 1.1 – 1.5x
      case 'DROP':    return 1.0 + m * 0.3;           // 1.0 – 1.3x
      case 'TEASE':   return 0.9 + m * 0.2;           // 0.9 – 1.1x
      case 'FADE':    return 0.6 + m * 0.2;           // 0.6 – 0.8x
      default:        return 1.0;
    }
  })();

  const hypeDecay = (() => {
    switch (phase) {
      case 'DROP':    return 0.6;                      // slow decay during drop
      case 'SUSTAIN': return 0.8;
      case 'TEASE':   return 0.9;
      case 'FADE':    return 1.3 + t * 0.4;           // 1.3 – 1.7x fast decay
      default:        return 1.0;
    }
  })();

  return {
    current_multiplier_streaming: Math.round(streaming * 100) / 100,
    current_multiplier_virality: Math.round(virality * 100) / 100,
    current_multiplier_retention: Math.round(retention * 100) / 100,
    current_multiplier_hype_decay: Math.round(hypeDecay * 100) / 100
  };
}

export async function processEraForPlayer(player: any, turnId: number, entities: any, ctx: any = {}) {
  if (!player?.id) return { skipped: true };

  try {
    // Declare tm early to avoid Temporal Dead Zone issues
    const tm = ctx?.turn_metrics || {};

    const cachedActiveEra = ctx?.activeEra || null;
    const cachedAllEras = Array.isArray(ctx?.allEras) ? ctx.allEras : [];
    const allEras = cachedAllEras.length > 0
      ? cachedAllEras
      : (cachedActiveEra ? [cachedActiveEra] : await entities.Era.filter({ artist_id: player.id }));
    let activeEra = allEras.find((era: any) => era.is_active) || cachedActiveEra;

    if (!activeEra && allEras.length === 0) {
      if (ctx?.stageOnly || ctx?.dry_run) {
        return { skipped: true, reason: 'no_active_era_stage_only' };
      }

      activeEra = await entities.Era.create({
        artist_id: player.id,
        era_name: 'Debut Era',
        start_turn: turnId,
        is_active: true,
        status: 'active',
        trigger_event: 'auto',
        is_player_declared: false,
        phase: 'TEASE',
        phase_turns_left: PHASE_DURATIONS.TEASE,
        phase_started_turn: turnId,
        momentum: ERA_BASELINE_MOMENTUM,
        tension: 10,
        volatility_level: 20,
        career_stage: 'EARLY'
      });
    }

    if (!activeEra) return { no_active_era: true };

    const fanProfile = ctx?.fanProfile || null;

    // Load identity_pillars from fandoms table (not fan_profiles — different table/schema)
    // fandoms.identity_pillars is text[] e.g. ['diva', 'party']; convert to Record<string,number>
    // for computeAestheticAlignmentDelta: present pillar → strength 100, absent → 0
    let fandomIdentityPillars: Record<string, number> | null = null;
    try {
      const { data: fandomRow } = await supabaseAdmin
        .from('fandoms')
        .select('identity_pillars')
        .eq('player_id', player.id)
        .maybeSingle();
      if (Array.isArray(fandomRow?.identity_pillars) && fandomRow.identity_pillars.length > 0) {
        fandomIdentityPillars = {};
        for (const pillar of fandomRow.identity_pillars as string[]) {
          fandomIdentityPillars[pillar] = 100;
        }
      }
    } catch (_e) { /* non-critical — alignment delta defaults to 0 */ }

    const brandStatsAll = await entities.PlayerBrandStats?.filter?.({ artist_id: player.id, platform: 'all' }) || [];
    const [brandStats] = brandStatsAll.length > 0 ? brandStatsAll : (await entities.PlayerBrandStats?.filter?.({ artist_id: player.id }) || [null]);
    // Compute identity keys first so they can serve as fallback in persona breakdown
    const corePrimary = player.core_brand_identity_primary || brandStats?.marketing_persona_primary || null;
    const coreSecondary = player.core_brand_identity_secondary || brandStats?.marketing_persona_secondary || null;
    const expressionPrimary = activeEra.expression_identity_primary || corePrimary || null;
    const expressionSecondary = activeEra.expression_identity_secondary || coreSecondary || null;

    // ─── Identity Alignment Nudge ────────────────────────────────────────────
    // Gather action signals from this turn's metrics and active deals/tours
    const nudgeTm = ctx?.turn_metrics || {};

    // Collect social post types from this turn
    const socialPostTypes: string[] = [];
    const socialVideoTypes: string[] = [];
    try {
      if (nudgeTm.social_posts_created > 0 || nudgeTm.posts_created > 0) {
        const { data: recentPosts } = await supabaseAdmin
          .from('social_posts')
          .select('post_type, metadata')
          .eq('artist_id', player.id)
          .gte('created_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()) // within ~8h (1 turn)
          .limit(10);
        for (const p of (recentPosts || [])) {
          if (p.post_type) socialPostTypes.push(p.post_type);
          if (p.metadata?.video_type) socialVideoTypes.push(p.metadata.video_type);
        }
      }
    } catch { /* non-critical */ }

    // Active brand deal categories
    const brandDealCategories: string[] = [];
    const sponsorAlignmentTags: string[] = [];
    try {
      const { data: activeDeals } = await supabaseAdmin
        .from('brand_deals')
        .select('category')
        .eq('artist_id', player.id)
        .eq('status', 'active')
        .limit(10);
      for (const d of (activeDeals || [])) {
        if (d.category) brandDealCategories.push(d.category);
      }
      // Active tour sponsorship alignment tags
      const { data: activeSponsorships } = await supabaseAdmin
        .from('tour_sponsorships')
        .select('alignment_tags')
        .eq('artist_id', player.id)
        .eq('status', 'active')
        .limit(5);
      for (const sp of (activeSponsorships || [])) {
        if (Array.isArray(sp.alignment_tags)) sponsorAlignmentTags.push(...sp.alignment_tags);
      }
    } catch { /* non-critical */ }

    // Collab partner's core brand identity (from this turn's completed collabs)
    let collabPartnerPersona: string | null = null;
    try {
      if (nudgeTm.collabs_completed > 0) {
        const { data: recentCollab } = await supabaseAdmin
          .from('collaboration_requests')
          .select('requester_artist_id, target_artist_id')
          .or(`requester_artist_id.eq.${player.id},target_artist_id.eq.${player.id}`)
          .eq('status', 'accepted')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentCollab) {
          const partnerId = recentCollab.requester_artist_id === player.id
            ? recentCollab.target_artist_id
            : recentCollab.requester_artist_id;
          const { data: partnerProfile } = await supabaseAdmin
            .from('profiles')
            .select('core_brand_identity_primary')
            .eq('id', partnerId)
            .maybeSingle();
          collabPartnerPersona = partnerProfile?.core_brand_identity_primary || null;
        }
      }
    } catch { /* non-critical */ }

    // Active tour category + aesthetic tags
    let activeTourCategory: string | null = null;
    try {
      const { data: activeTourRow } = await supabaseAdmin
        .from('tours')
        .select('tour_category, aesthetic_tags')
        .eq('artist_id', player.id)
        .eq('status', 'active')
        .maybeSingle();
      if (activeTourRow) {
        activeTourCategory = activeTourRow.tour_category || null;
        if (Array.isArray(activeTourRow.aesthetic_tags)) {
          sponsorAlignmentTags.push(...activeTourRow.aesthetic_tags);
        }
      }
    } catch { /* non-critical */ }

    // Compute identity nudge (pure function — no DB access)
    const nudgeResult = computeIdentityNudge({
      expressionPrimary,
      focusPath: activeEra.focus_path || null,
      tourCategory: activeTourCategory,
      tourAestheticTags: [],
      collabPartnerPersona,
      socialPostTypes,
      socialVideoTypes,
      brandDealCategories,
      sponsorAlignmentTags,
      eraAestheticTags: activeEra.aesthetic_tags || [],
      currentActionScores: activeEra.identity_action_scores || {},
      currentActionCounts: activeEra.identity_action_counts || {},
      careerPersonaScores: brandStats?.persona_scores || {},
    });

    // Blend era action scores + career persona scores for the alignment calculation
    const blendedPersonaScores = blendPersonaScoresForAlignment(
      nudgeResult.updatedActionScores,
      brandStats?.persona_scores || {},
      expressionPrimary,
      expressionSecondary,
    );

    // Use blended scores instead of raw brandStats.persona_scores
    const personaBreakdown = buildPersonaBreakdown(
      // Convert 0-100 blended scores back to 0-1 for buildPersonaBreakdown
      Object.fromEntries(Object.entries(blendedPersonaScores).map(([k, v]) => [k, v / 100])),
      brandStats?.marketing_persona_primary || expressionPrimary || corePrimary,
      brandStats?.marketing_persona_secondary || expressionSecondary || coreSecondary
    );
    const derivedEssenceArchetypes = ctx?.fandomModifiers?.derivedEssenceArchetypes || {
      critics_adjacent: 0,
      nostalgia_seekers: 0,
      trend_chasers: 0,
      underground_purists: 0,
    };
    const identity = calculateIdentityAlignment({
      corePrimary,
      expressionPrimary,
      expressionSecondary,
      personaBreakdown,
      fanArchetypes: derivedEssenceArchetypes,
    });

    const socialActivityScore = clamp(N(ctx?.turn_metrics?.social_follower_growth || 0) / 5, 0, 100);
    const fandomEssenceVectors = deriveFandomEssenceVectors({
      fanArchetypes: derivedEssenceArchetypes,
      focusPath: activeEra.focus_path,
      phase: activeEra.phase,
      alignmentScore: identity.alignmentScore,
      isExperimental: identity.isExperimental,
      hype: player.hype,
      clout: player.clout,
      tension: activeEra.tension,
      volatility: activeEra.volatility_level,
      socialActivityScore,
    });
    const engagementReadinessState = deriveEngagementReadiness({
      hype: player.hype,
      alignmentScore: identity.alignmentScore,
      momentum: activeEra.momentum,
      socialActivityScore,
      isExperimental: identity.isExperimental,
      tension: activeEra.tension,
      sentiment: fanProfile?.overall_sentiment,
    });

    // --- Current phase (must be declared first for use below) ---
    const currentPhase = activeEra.phase || 'TEASE';

    // --- Era fatigue tracking ---
    const fatigueTurns = N(activeEra.era_fatigue_turns) + 1;
    const fatigueMult = eraFatigueDecay(fatigueTurns);

    // --- Surprise drop bonus (first 3 turns of DROP) ---
    const isSurpriseDrop = !!activeEra.surprise_drop;
    const surpriseDropActive = isSurpriseDrop && currentPhase === 'DROP' && fatigueTurns <= 3;

    // --- Anticipation meter (builds in TEASE, converts at DROP transition) ---
    let anticipation = N(activeEra.anticipation_meter);
    if (currentPhase === 'TEASE') {
      anticipation = Math.floor(clamp(anticipation + 2 + (N(player.hype) > 50 ? 2 : 0), 0, 100));
    }

    // --- Momentum: slow natural decay toward baseline, boosted by hype ---
    const industryPerception = ctx?.industryPerceptionModifiers || null;
    const baseMomentum = N(activeEra.momentum) || ERA_BASELINE_MOMENTUM;
    const hypeBoost = N(player.hype) > 60 ? 1 : N(player.hype) > 30 ? 0 : -1;
    const naturalDecay = baseMomentum > ERA_BASELINE_MOMENTUM ? -0.5 : baseMomentum < ERA_BASELINE_MOMENTUM ? 0.5 : 0;
    const recoveryMult = Number(industryPerception?.influenceCaps?.alignmentRecoveryMult) || 1;
    const audienceDepth = clamp(Number(ctx?.audienceQualityModifiers?.audienceDepth) || 50, 0, 100);
    const depthRecoveryLift = 1 + ((audienceDepth - 50) / 50) * 0.03;
    // --- Aesthetic tag ↔ fandom pillar alignment (Phase 3A) ---
    const aestheticDelta = computeAestheticAlignmentDelta(
      activeEra.aesthetic_tags || [],
      fandomIdentityPillars
    );

    const nextMomentum = Math.floor(clamp((baseMomentum + naturalDecay + hypeBoost * 0.3 + aestheticDelta.momentumBonus) * recoveryMult * depthRecoveryLift, 0, 100));

    // --- Tension: rises during DROP, falls during TEASE/SUSTAIN ---
    // In SUSTAIN, high momentum provides extra tension relief (strong performance = less fan anxiety).
    const sustainMomentumRelief = currentPhase === 'SUSTAIN' && nextMomentum > 70 ? -((nextMomentum - 70) / 30) * 1.5 : 0;
    const tensionChange = currentPhase === 'DROP' ? 3 : currentPhase === 'FADE' ? 1 : currentPhase === 'SUSTAIN' ? (-0.5 + sustainMomentumRelief) : -1;
    let nextTension = Math.floor(clamp(N(activeEra.tension || 10) + tensionChange + aestheticDelta.tensionBonus, 0, 100));
    
    // Apply runaway song pressure if applicable (from turn processor core)
    if (ctx.runawaySong?.hasRunaway) {
      const turnsSinceDetected = turnId - (ctx.runawaySong.runawayData?.detectedTurn || turnId);
      nextTension = applyRunawayEraPressure(nextTension, ctx.runawaySong.runawayData, turnsSinceDetected);
    }

    // Identity misalignment creates manageable tension/volatility drift (no direct income penalties).
    const identityTensionDelta = Math.round(clamp((50 - identity.alignmentScore) / 10, -2, 3));
    const identityVolatilityDelta = clamp((50 - identity.alignmentScore) / 12, -2, 2);
    nextTension = Math.floor(clamp(nextTension + identityTensionDelta + (identity.isExperimental ? 1 : 0), 0, 100));

    const identityTrait = getIdentityTrait(expressionPrimary || corePrimary || null);
    const fandomMemory = fanProfile?.fandom_memory || {};
    const previousDominantValue = Math.max(
      N(fandomMemory.rebellion_avg),
      N(fandomMemory.glamour_avg),
      N(fandomMemory.authenticity_avg),
      N(fandomMemory.community_avg)
    );
    const dominantVector = previousDominantValue === N(fandomMemory.rebellion_avg) ? 'rebellion'
      : previousDominantValue === N(fandomMemory.glamour_avg) ? 'glamour'
      : previousDominantValue === N(fandomMemory.authenticity_avg) ? 'authenticity' : 'community';
    const newExpressionVectorWeight = vectorWeightFromIdentity(expressionPrimary || corePrimary || null, dominantVector as any);
    const isNewEra = N(activeEra.start_turn) === turnId;
    const pivotShockRaw = isNewEra ? computePivotShock({
      previousDominantValue,
      newExpressionVectorWeight,
      rollingAlignmentAvg: N(fandomMemory.rolling_alignment_avg),
      pivotElasticity: identityTrait.pivotElasticity,
    }) : 0;

    const leverage = clamp(Number(industryPerception?.industryLeverage) || 50, 0, 100);
    const depthLeverageDampen = clamp(1 - ((audienceDepth - 50) / 50) * 0.08 - ((leverage - 50) / 50) * 0.04, 0.9, 1.08);
    const pivotShock = clamp(pivotShockRaw * depthLeverageDampen, 0, 0.4);

    if (pivotShock > 0.15) {
      nextTension = Math.floor(clamp(nextTension + pivotShock * 12, 0, 100));
    }

    if (audienceDepth < 35) {
      nextTension = Math.floor(clamp(nextTension + 1, 0, 100));
    }

    if (industryPerception?.controversyArc?.active) {
      nextTension = Math.floor(clamp(nextTension + (Number(industryPerception.controversyArc.intensity) || 0) * 0.05, 0, 100));
    }

    // --- Volatility ---
    const volatilityBase = N(activeEra.volatility_level || 20) + (nextTension / 50) + identityVolatilityDelta + (identity.isExperimental ? 1 : 0) + (pivotShock * 10);
    const controversyVolBoost = Number(industryPerception?.controversyArc?.volatilityBoost) || 0;
    const leverageDampening = Number(industryPerception?.influenceCaps?.volatilityDampeningMult) || 1;
    const volatility = Math.floor(clamp((volatilityBase + controversyVolBoost) * leverageDampening, 10, 85));

    // --- Check for active tour tied to this era — pause phase countdown while on tour ---
    let isOnActiveTour = false;
    try {
      const { data: activeTourRow } = await supabaseAdmin
        .from('tours')
        .select('id')
        .eq('artist_id', player.id)
        .eq('era_id', activeEra.id)
        .eq('status', 'active')
        .maybeSingle();
      isOnActiveTour = !!activeTourRow;
    } catch (_e) { /* non-critical — phase countdown proceeds normally */ }

    // --- Phase transition: use phase_turns_left countdown ---
    // Countdown is paused when player is actively touring this era.
    const turnsLeft = isOnActiveTour
      ? (N(activeEra.phase_turns_left) || PHASE_DURATIONS[currentPhase] || 60)
      : (N(activeEra.phase_turns_left) || PHASE_DURATIONS[currentPhase] || 60) - 1;
    const currentIndex = PHASE_SEQUENCE.indexOf(currentPhase);
    let nextPhase = null;
    let nextPhaseTurnsLeft = turnsLeft;
    let anticipationBonus = 0; // momentum bonus when entering DROP from TEASE

    // --- Era auto-end flag ---
    let eraEnding = false;

    // --- Force FADE if era fatigue exceeds threshold ---
    if (fatigueTurns >= ERA_FATIGUE_FORCE_FADE && currentPhase !== 'FADE') {
      nextPhase = 'FADE';
      nextPhaseTurnsLeft = PHASE_DURATIONS.FADE;
    } else if (turnsLeft <= 0) {
      if (currentPhase === 'FADE') {
        // FADE phase complete → era ends naturally
        eraEnding = true;
        nextPhase = 'FADE'; // keep phase as FADE
        nextPhaseTurnsLeft = 0;
      } else {
        // Advance to next phase
        const nextIndex = currentIndex + 1;
        if (nextIndex >= PHASE_SEQUENCE.length) {
          // Safety: shouldn't happen, but end era if we somehow go past FADE
          eraEnding = true;
          nextPhase = 'FADE';
          nextPhaseTurnsLeft = 0;
        } else {
          nextPhase = PHASE_SEQUENCE[nextIndex];
          nextPhaseTurnsLeft = PHASE_DURATIONS[nextPhase] || 12;
        }

        // Convert anticipation to momentum when entering DROP
        if (nextPhase === 'DROP' && anticipation > 0) {
          anticipationBonus = Math.floor(anticipation * 0.6);
        }
      }
    }

    // --- Flop / One-Hit detection ---
    // Flop = sustained high tension WITH low momentum (crowd isn't showing up).
    // Tension alone hitting 80 during DROP is normal audience pressure, not a flop.
    // Recovery: if tension recovers below 50 and momentum is healthy, clear the flag.
    const flopConditionMet = nextTension >= 80 && nextMomentum < 50;
    const flopRecovered = activeEra.is_flop && nextTension < 50 && nextMomentum > 55;
    const isFlop = flopConditionMet && !activeEra.is_flop;
    const isOneHit = volatility > 60 && nextMomentum > 70 && !activeEra.is_one_hit;

    // --- Accumulate era performance stats from turn_metrics ---
    // (tm is now declared at the top of the function)

    // --- Challenge auto-completion based on this turn's metrics ---
    let activeChallenges = (activeEra.active_challenges || []).map((ch: any) => {
      if (ch.completed) return ch;
      const type = ch.type || '';
      let completed = false;
      if (type === 'tour' && (tm.events_completed > 0 || tm.gigs_completed > 0)) completed = true;
      if (type === 'collab' && tm.collabs_completed > 0) completed = true;
      if (type === 'merch' && N(activeEra.total_revenue) + (tm.merch_revenue || 0) > 0 && tm.merch_units_sold > 0) completed = true;
      if (type === 'release' && tm.releases_activated > 0) completed = true;
      if (type === 'streams' && N(activeEra.total_streams) + (tm.streams_earned || tm.streams || 0) > 500000) completed = true;
      if (type === 'followers' && tm.fan_growth > 500) completed = true;
      if (completed) return { ...ch, completed: true, completed_turn: turnId };
      return ch;
    });

    // --- Dynamic challenges on phase change ---
    if (nextPhase && nextPhase !== currentPhase) {
      const newChallenges = generateDynamicChallenges(activeEra, player, turnId);
      const existingChallenges = activeChallenges.filter((ch: any) => ch.expires_turn > turnId && !ch.completed);
      activeChallenges = [...existingChallenges, ...newChallenges];
    }

    // --- Mission micro-objectives: inject once at era start (fatigue < 2 = very new) ---
    const rolloutMission: string | null = (activeEra.rollout_plan as any)?.mission || null;
    if (rolloutMission && N(activeEra.era_fatigue_turns) < 2 && !activeChallenges.some((ch: any) => ch.id?.startsWith('mission_'))) {
      const MISSION_CHALLENGES: Record<string, Array<{ description: string; type: string }>> = {
        streaming: [
          { type: 'streaming', description: 'Hit top 50 on a chart with a release this era' },
          { type: 'streams',   description: 'Accumulate 500K+ era streams' },
        ],
        fanbase: [
          { type: 'followers', description: 'Grow your fanbase by 500 followers this era' },
          { type: 'loyalty',   description: 'Keep era momentum above 60 for 5 turns' },
        ],
        revenue: [
          { type: 'revenue',    description: 'Generate $50K+ in total era revenue' },
          { type: 'brand_deal', description: 'Secure a brand deal this era' },
        ],
        clout: [
          { type: 'era_clout', description: 'Generate 200+ era clout this era' },
          { type: 'viral',     description: 'Trigger a virality spike (momentum > 80)' },
        ],
      };
      const missionChallenges = (MISSION_CHALLENGES[rolloutMission] || []).map((c, i) => ({
        id: `mission_${turnId}_${i}`,
        type: c.type,
        description: c.description,
        expires_turn: turnId + 200,
        completed: false,
        is_mission_objective: true,
      }));
      activeChallenges = [...activeChallenges, ...missionChallenges];
    }

    // --- Career stage detection ---
    const currentStage = detectCareerStage(N(player.followers));
    const completedMilestones = (await entities.CareerMilestone.filter({ artist_id: player.id })).map((m: any) => m.milestone_type);
    const autoMilestone = checkAutoMilestone(currentStage, player, completedMilestones);

    // --- Calculate dynamic multipliers with fatigue decay ---
    const effectivePhase = nextPhase || currentPhase;
    const rawMultipliers = calculateMultipliers(effectivePhase, nextMomentum, nextTension);
    // Apply fatigue decay to beneficial multipliers (not hype_decay)
    const multipliers = {
      current_multiplier_streaming: Math.round(rawMultipliers.current_multiplier_streaming * fatigueMult * 100) / 100,
      current_multiplier_virality: Math.round(rawMultipliers.current_multiplier_virality * fatigueMult * 100) / 100,
      current_multiplier_retention: Math.round(rawMultipliers.current_multiplier_retention * fatigueMult * 100) / 100,
      current_multiplier_hype_decay: rawMultipliers.current_multiplier_hype_decay // fatigue doesn't slow decay
    };
    // Surprise drop: +30% virality during first 3 turns of DROP
    if (surpriseDropActive) {
      multipliers.current_multiplier_virality = Math.round(multipliers.current_multiplier_virality * 1.3 * 100) / 100;
      multipliers.current_multiplier_hype_decay = Math.round(multipliers.current_multiplier_hype_decay * 1.3 * 100) / 100; // faster decay
    }

    const softState = ctx?.fandomModifiers?.activeSoftState || 'NONE';
    if (softState === 'FANDOM_FATIGUE') {
      multipliers.current_multiplier_hype_decay = Math.round(multipliers.current_multiplier_hype_decay * 1.12 * 100) / 100;
      multipliers.current_multiplier_retention = Math.round(multipliers.current_multiplier_retention * 0.93 * 100) / 100;
    }
    if (softState === 'CULTURAL_RESURGENCE') {
      multipliers.current_multiplier_retention = Math.round(multipliers.current_multiplier_retention * 1.08 * 100) / 100;
    }

    const { scale: alignmentScale, modifiers: eraFocusModifiers } = getScaledFocusModifiers(activeEra.focus_path, identity.alignmentScore);
    multipliers.current_multiplier_streaming = Math.round((multipliers.current_multiplier_streaming + eraFocusModifiers.streaming_mult_delta) * 100) / 100;
    multipliers.current_multiplier_virality = Math.round((multipliers.current_multiplier_virality + eraFocusModifiers.virality_mult_delta) * 100) / 100;
    multipliers.current_multiplier_retention = Math.round((multipliers.current_multiplier_retention + eraFocusModifiers.retention_mult_delta) * 100) / 100;
    multipliers.current_multiplier_hype_decay = Math.round((multipliers.current_multiplier_hype_decay + eraFocusModifiers.hype_decay_mult_delta) * 100) / 100;

    // --- Budget-based multiplier boosts (set once at era creation, persist as a baseline) ---
    // $100K reference: Standard preset ($5K) ≈ +5%, Major preset ($15K) ≈ capped at +15%
    const BUDGET_REF = 100_000;
    const budgetStreamingBoost = Math.min(0.15, N(activeEra.budget_marketing) / BUDGET_REF);
    const budgetViralityBoost  = Math.min(0.15, N(activeEra.budget_visuals) / BUDGET_REF)
                               + Math.min(0.10, N(activeEra.budget_features) / BUDGET_REF);
    const budgetRetentionBoost = Math.min(0.15, N(activeEra.budget_community) / BUDGET_REF)
                               + Math.min(0.10, N(activeEra.budget_tourprep) / BUDGET_REF);
    multipliers.current_multiplier_streaming = Math.round((multipliers.current_multiplier_streaming + budgetStreamingBoost) * 100) / 100;
    multipliers.current_multiplier_virality  = Math.round((multipliers.current_multiplier_virality + budgetViralityBoost) * 100) / 100;
    multipliers.current_multiplier_retention = Math.round((multipliers.current_multiplier_retention + budgetRetentionBoost) * 100) / 100;

    // --- Mission Amplifier: double the relevant budget category for the grand mission + trade-off ---
    const rolloutPlan = (activeEra.rollout_plan && typeof activeEra.rollout_plan === 'object' && !Array.isArray(activeEra.rollout_plan))
      ? activeEra.rollout_plan as any : null;
    const mission: string | null = rolloutPlan?.mission || null;
    const targetMarkets: string[] = Array.isArray(rolloutPlan?.target_markets) ? rolloutPlan.target_markets : [];
    if (mission === 'streaming') {
      multipliers.current_multiplier_streaming = Math.round((multipliers.current_multiplier_streaming + budgetStreamingBoost) * 100) / 100;
      nextTension = Math.min(100, nextTension + 2); // trade-off: sell-out perception
    } else if (mission === 'fanbase') {
      multipliers.current_multiplier_retention = Math.round((multipliers.current_multiplier_retention + budgetRetentionBoost) * 100) / 100;
      multipliers.current_multiplier_hype_decay = Math.round((multipliers.current_multiplier_hype_decay + 0.05) * 100) / 100; // trade-off: mainstream buzz fades faster
    } else if (mission === 'revenue') {
      multipliers.current_multiplier_streaming = Math.round((multipliers.current_multiplier_streaming + budgetStreamingBoost * 0.5) * 100) / 100;
      multipliers.current_multiplier_retention = Math.round((multipliers.current_multiplier_retention + budgetRetentionBoost * 0.5) * 100) / 100;
      multipliers.current_multiplier_virality  = Math.round((multipliers.current_multiplier_virality  + budgetViralityBoost * 0.5 - 0.05) * 100) / 100; // trade-off: commercial = less organic virality
    } else if (mission === 'clout') {
      multipliers.current_multiplier_virality = Math.round((multipliers.current_multiplier_virality + budgetViralityBoost) * 100) / 100;
      nextTension = Math.min(100, nextTension + 3); // trade-off: ego/controversy risk
    }
    // --- Conquest Zone trend bonus: active career trend × target markets → +8% budget amplification ---
    const playerTrendActive = !!ctx?.runtimeContext?.careerTrendByArtistId?.[player.id]?.effects;
    if (targetMarkets.length > 0 && playerTrendActive) {
      multipliers.current_multiplier_streaming = Math.round((multipliers.current_multiplier_streaming + budgetStreamingBoost * 0.08) * 100) / 100;
      multipliers.current_multiplier_virality  = Math.round((multipliers.current_multiplier_virality  + budgetViralityBoost * 0.08) * 100) / 100;
      multipliers.current_multiplier_retention = Math.round((multipliers.current_multiplier_retention + budgetRetentionBoost * 0.08) * 100) / 100;
    }

    // --- Legacy buffs from completed eras ---
    const legacyBuffs = await getLegacyBuffs(entities, player.id, turnId);
    if (legacyBuffs.streamingMult > 1.0) {
      multipliers.current_multiplier_streaming = Math.round(multipliers.current_multiplier_streaming * legacyBuffs.streamingMult * 100) / 100;
    }
    // Hard cap all multipliers to fit numeric(4,2) column (max 99.99) — use 9.99 as sane gameplay max
    multipliers.current_multiplier_streaming = Math.min(Math.max(0.01, multipliers.current_multiplier_streaming), 9.99);
    multipliers.current_multiplier_virality = Math.min(Math.max(0.01, multipliers.current_multiplier_virality), 9.99);
    multipliers.current_multiplier_retention = Math.min(Math.max(0.01, multipliers.current_multiplier_retention), 9.99);
    multipliers.current_multiplier_hype_decay = Math.min(Math.max(0.01, multipliers.current_multiplier_hype_decay), 9.99);

    // --- Nostalgia comeback bonus from past iconic eras ---
    const pastEras = allEras.filter((e: any) => !e.is_active);
    const nostalgia = computeNostalgiaBonus(activeEra.aesthetic_tags || [], pastEras);

    const turnStreams = (tm.streams_earned || tm.streams || 0);
    const turnRevenue = (tm.income_gained || 0) + (tm.merch_revenue || 0) + (tm.social_revenue || 0) + (tm.brand_deal_revenue || 0) + (tm.touring_revenue || 0);
    // fan_growth is absolute count; follower_growth is a %-of-followers value (e.g. 0.014) — use absolute.
    const turnFollowers = (tm.fan_growth || tm.follower_change || 0);
    const turnClout = (tm.clout_change || tm.clout_gained || 0);

    // --- Apply nostalgia bonus to momentum and tension ---
    if (nostalgia.momentumBonus > 0) {
      nextPhaseTurnsLeft = nextPhaseTurnsLeft; // no change to phase length
    }

    // --- Build era update ---
    const eraUpdate: any = {
      momentum: Math.floor(clamp(nextMomentum + anticipationBonus + nostalgia.momentumBonus, 0, 100)),
      tension: Math.floor(clamp(nextTension + nostalgia.tensionReduction, 0, 100)),
      volatility_level: volatility,
      identity_alignment_score: identity.alignmentScore,
      is_experimental: identity.isExperimental,
      phase_turns_left: nextPhaseTurnsLeft,
      is_flop: flopRecovered ? false : (isFlop || activeEra.is_flop),
      is_one_hit: isOneHit || activeEra.is_one_hit,
      active_challenges: activeChallenges,
      career_stage: currentStage,
      // New era mechanics
      era_fatigue_turns: fatigueTurns,
      anticipation_meter: nextPhase === 'DROP' ? 0 : anticipation, // reset on DROP entry
      // Dynamic multipliers (with fatigue + legacy applied)
      ...multipliers,
      // Accumulate performance stats (cap at safe values to prevent integer overflow downstream)
      total_streams: Math.min(Math.floor(N(activeEra.total_streams) + turnStreams), 9_000_000_000_000),
      total_revenue: Math.min(Math.round((N(activeEra.total_revenue) + turnRevenue) * 100) / 100, 999_999_999_999.99),
      total_followers_gained: Math.min(Math.floor(N(activeEra.total_followers_gained) + Math.max(0, turnFollowers)), 9_000_000_000_000),
      peak_hype: Math.floor(Math.max(N(activeEra.peak_hype), N(player.hype))),
      expression_identity_primary: expressionPrimary,
      expression_identity_secondary: expressionSecondary,
      releases_count: Math.floor(N(activeEra.releases_count) + (tm.releases_activated || 0)),
      tours_count: Math.floor(N(activeEra.tours_count) + (tm.tours_completed || 0)),
      // Clout tracking per era
      era_clout_generated: Math.min(Math.floor(N(activeEra.era_clout_generated) + Math.max(0, turnClout)), 9_000_000_000_000),
      // Identity alignment nudge — accumulated action scores per persona this era
      identity_action_scores: nudgeResult.updatedActionScores,
      identity_action_counts: nudgeResult.updatedActionCounts,
      identity_dominant_persona: nudgeResult.dominantPersona,
      identity_nudge_ready: nudgeResult.nudgeReady,
    };

    // --- Fandom memory score & sentiment (computed every turn) ---
    eraUpdate.fandom_memory_score = calculateFandomMemoryScore({ ...activeEra, ...eraUpdate });
    eraUpdate.fandom_sentiment = computeFandomSentiment({ ...activeEra, ...eraUpdate });

    // --- Era ending: calculate legacy, determine final status, deactivate ---
    if (eraEnding) {
      const legacyBonuses = calculateLegacyBonuses({ ...activeEra, ...eraUpdate });
      const memoryScore = eraUpdate.fandom_memory_score;

      // Determine final status from performance
      let finalStatus = 'completed';
      if (isFlop || activeEra.is_flop) finalStatus = 'flop';
      else if (isOneHit || activeEra.is_one_hit) finalStatus = 'one_hit_wonder';
      else if (memoryScore >= 70) finalStatus = 'iconic';

      eraUpdate.is_active = false;
      eraUpdate.status = finalStatus;
      eraUpdate.end_turn = turnId;
      eraUpdate.ended_at = new Date().toISOString();
      eraUpdate.final_score = Math.floor(legacyBonuses.score);
      eraUpdate.legacy_bonuses = legacyBonuses;
    }

    if (nextPhase) {
      eraUpdate.phase = nextPhase;
      eraUpdate.phase_started_turn = turnId;
    }

    // --- Update goal progress ---
    if (Array.isArray(activeEra.goals) && activeEra.goals.length > 0) {
      eraUpdate.goals = activeEra.goals.map((goal: any) => {
        let current = goal.current || 0;
        switch (goal.type) {
          case 'followers': current = N(player.followers); break;
          case 'streams': current = eraUpdate.total_streams; break;
          case 'revenue': current = N(player.income); break;
          case 'clout': current = N(player.clout); break;
          case 'hype': current = N(player.hype); break;
          case 'listeners': current = tm.monthly_listeners || current; break;
        }
        return { ...goal, current, completed: current >= goal.target };
      });
      eraUpdate.completed_goals = eraUpdate.goals.filter((g: any) => g.completed).length;
    }

    // --- Fandom Promise evaluation: track + reward/penalize promise fulfillment each turn ---
    const fandom_segment_updates: any[] = [];
    if (rolloutPlan?.phase_promises) {
      const updatedPromises = { ...rolloutPlan.phase_promises };
      const currentPromise = updatedPromises[effectivePhase];
      if (currentPromise && !currentPromise.fulfilled) {
        const METRIC_MAP: Record<string, number> = {
          era_actions:       (activeEra.era_actions || []).length,
          anticipation_meter: N(eraUpdate.anticipation_meter),
          hype:              N(player.hype),
          releases_count:    N(eraUpdate.releases_count),
          momentum:          N(eraUpdate.momentum),
          tours_count:       N(eraUpdate.tours_count),
          total_streams:     N(eraUpdate.total_streams),
          era_clout:         N(eraUpdate.era_clout_generated),
        };
        const newCurrent = METRIC_MAP[currentPromise.metric] ?? currentPromise.current;
        const nowFulfilled = newCurrent >= currentPromise.target;
        if (nowFulfilled && !currentPromise.fulfilled) {
          eraUpdate.momentum = Math.min(100, N(eraUpdate.momentum) + 5);
          eraUpdate.tension  = Math.max(0,   N(eraUpdate.tension)  - 2);
        }
        updatedPromises[effectivePhase] = { ...currentPromise, current: newCurrent, fulfilled: nowFulfilled };
      }
      if ((eraEnding || (nextPhase && nextPhase !== currentPhase)) && updatedPromises[currentPhase] && !updatedPromises[currentPhase].fulfilled) {
        eraUpdate.tension = Math.min(100, N(eraUpdate.tension) + 3);
      }
      eraUpdate.rollout_plan = { ...rolloutPlan, phase_promises: updatedPromises };
    }

    const turnEvent = {
      global_turn_id: turnId,
      player_id: player.id,
      module: 'TurnProcessorEra',
      event_type: 'era_update',
      description: `Era ${activeEra.era_name}: ${effectivePhase} phase, momentum=${nextMomentum}, tension=${nextTension}`,
      deltas: {
        momentum: nextMomentum,
        tension: nextTension,
        volatility,
        phase: nextPhase,
        isFlop,
        isOneHit,
        multipliers,
        phase_turns_left: nextPhaseTurnsLeft,
        identity_alignment_score: identity.alignmentScore,
        is_experimental: identity.isExperimental,
        alignment_scale: alignmentScale,
        era_focus_modifiers: eraFocusModifiers,
        fandomEssenceVectors: fandomEssenceVectors.vectors,
        fandomNickname: fandomEssenceVectors.fandomNickname,
        dominantVectors: fandomEssenceVectors.dominantVectors,
        engagementReadiness: engagementReadinessState.readiness,
        nostalgia_bonus: nostalgia.momentumBonus > 0 ? { momentum: nostalgia.momentumBonus, tension: nostalgia.tensionReduction, matched_era: nostalgia.matchedEraName } : null,
        era_clout_generated: eraUpdate.era_clout_generated
      },
      metadata: {}
    };

    const milestones_to_create = autoMilestone
      ? [{
          artist_id: player.id,
          milestone_type: autoMilestone.type,
          triggered_turn: turnId,
          triggered_at: new Date().toISOString(),
          is_auto_triggered: true,
          unlocks: autoMilestone.unlocks,
          story_text: autoMilestone.story
        }]
      : [];
    const artistProfile: Record<string, any> = {};

    // --- Notifications for era ending ---
    const notifications_to_create: any[] = [];

    // Notify player when a persona signal crosses the 70 threshold for the first time
    if (nudgeResult.nudgeReady && nudgeResult.dominantPersona && !activeEra.identity_nudge_ready) {
      const personaLabel = nudgeResult.dominantPersona.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      notifications_to_create.push({
        player_id: player.id,
        global_turn_id: turnId,
        created_turn_index: turnId,
        type: 'HIGHLIGHT',
        title: `Identity Signal: ${personaLabel}`,
        body: `Your ${personaLabel} signal is strong this era! Head to Era Management to officially adopt it as your expression identity.`,
        is_read: false,
        metrics: { dominant_persona: nudgeResult.dominantPersona, score: nudgeResult.updatedActionScores[nudgeResult.dominantPersona] },
        idempotency_key: `identity_nudge_ready:${activeEra.id}:${nudgeResult.dominantPersona}`,
        deep_links: { page: 'Career', params: { openApp: 'era_management' } },
        priority: 'high',
      });
    }

    if (eraEnding) {
      artistProfile.active_era_id = null;
      notifications_to_create.push({
        player_id: player.id,
        global_turn_id: turnId,
        created_turn_index: turnId,
        type: 'HIGHLIGHT',
        title: `Era Complete: ${activeEra.era_name}`,
        body: `Your "${activeEra.era_name}" era has concluded after ${fatigueTurns} turns. Final score: ${eraUpdate.final_score}. You can now start a new era!`,
        is_read: false,
        metrics: { era_id: activeEra.id, final_score: eraUpdate.final_score, legacy_bonuses: eraUpdate.legacy_bonuses },
        idempotency_key: `era_complete:${activeEra.id}:${turnId}`,
      });
    }

    // Always return deltas for the scheduler to commit — never write directly here.
    // Era-ending cleanup now stages both active_era_id clearing and milestone creation
    // through the normal commit pipeline.

    // --- Career-level persona score accumulation into player_brand_stats ---
    // Blend era action scores with existing career scores (slow drift, 10% weight per turn)
    const careerPersonaScoresUpdate: Record<string, number> = {};
    const existingCareerScores = brandStats?.persona_scores || {};
    for (const pid of Object.keys(nudgeResult.updatedActionScores)) {
      const eraScore = nudgeResult.updatedActionScores[pid] / 100; // normalize to 0-1
      const careerScore = N(existingCareerScores[pid]);
      // Slow drift: career score moves 10% toward era score each turn
      careerPersonaScoresUpdate[pid] = Math.round((careerScore * 0.9 + eraScore * 0.1) * 1000) / 1000;
    }
    const player_brand_stats_upserts = Object.keys(careerPersonaScoresUpdate).length > 0 ? [{
      artist_id: player.id,
      platform: 'all', // career-level row, platform='all' aggregates across all platforms
      persona_scores: { ...(brandStats?.persona_scores || {}), ...careerPersonaScoresUpdate },
      persona_action_counts: nudgeResult.updatedActionCounts,
      marketing_persona_primary: nudgeResult.dominantPersona || brandStats?.marketing_persona_primary || null,
      updated_at: new Date().toISOString(),
    }] : [];

    // Include nudge summary in turn event metadata for diagnostics
    (turnEvent as any).metadata = {
      identity_nudge: {
        dominant_persona: nudgeResult.dominantPersona,
        nudge_ready: nudgeResult.nudgeReady,
        contributing_actions: nudgeResult.contributingActions,
        persona_delta: nudgeResult.personaDelta,
      },
    };

    return {
      success: true,
      deltas: {
        artistProfile: Object.keys(artistProfile).length > 0 ? artistProfile : undefined,
        era: eraUpdate,
        turn_events: [turnEvent],
        milestones_to_create,
        notifications_to_create,
        fandom_segment_updates,
        player_brand_stats_upserts,
      },
      era_id: activeEra.id,
      era_ended: eraEnding,
      fandomEssence: buildFandomEssence({
        fanArchetypes: derivedEssenceArchetypes,
        expressionPrimary,
        expressionSecondary,
        alignmentScore: identity.alignmentScore,
        isExperimental: identity.isExperimental,
      }),
      fandomEssenceVectors: fandomEssenceVectors.vectors,
      fandomNickname: fandomEssenceVectors.fandomNickname,
      dominantVectors: fandomEssenceVectors.dominantVectors,
      engagementReadiness: engagementReadinessState.readiness,
      momentum: nextMomentum,
      tension: nextTension,
      volatility,
      phase: nextPhase || currentPhase,
      phase_turns_left: nextPhaseTurnsLeft,
      is_flop: isFlop,
      is_one_hit: isOneHit,
      multipliers
    };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error(`[turnProcessorEra] processEraForPlayer FAILED for player ${player?.id} (${player?.artist_name}): ${errMsg}`);
    if (error?.stack) console.error(`[turnProcessorEra] Stack:`, error.stack);
    return {
      success: false,
      error: errMsg,
      deltas: {
        turn_events: [{
          global_turn_id: turnId,
          player_id: player?.id,
          module: 'TurnProcessorEra',
          event_type: 'ERA_PROCESSOR_ERROR',
          description: `Era processor crashed: ${errMsg}`,
          metadata: { stack: error?.stack?.substring?.(0, 500) },
          created_at: new Date().toISOString(),
        }]
      }
    };
  }
}

async function processTurn(serviceContext: any) {
  const entities = serviceContext.entities;
  const turnStates = await entities.TurnState.list('-created_at', 1);
  const turnId = turnStates?.[0]?.global_turn_id || turnStates?.[0]?.current_turn_id || 1;

  const allPlayers = await entities.ArtistProfile.list();
  if (!allPlayers?.length) return { status: 'success', players_processed: 0, turn_id: turnId };

  let processed = 0;
  for (const player of allPlayers) {
    const result = await processEraForPlayer(player, turnId, entities, { stageOnly: false });
    if (result?.success) processed++;
  }

  return { status: 'success', players_processed: processed, turn_id: turnId };
}

export async function handleRequest(req: any) {
  try {
    const result = await processTurn({ entities: createSupabaseEntitiesAdapter(supabaseAdmin) });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

if ((import.meta as any).main) {
  (globalThis as any).Deno.serve(handleRequest);
}
