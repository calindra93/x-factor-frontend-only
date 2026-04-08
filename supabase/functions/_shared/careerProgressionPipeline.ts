import { computeEffectiveDecayRate } from './fansUpdateModule.ts';

function formatCompactNumber(value: number): string {
  const numeric = Number(value) || 0;
  const abs = Math.abs(numeric);
  if (abs >= 1_000_000_000_000) return `${(numeric / 1_000_000_000_000).toFixed(abs >= 10_000_000_000_000 ? 0 : 1).replace(/\.0$/, '')}T`;
  if (abs >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (abs >= 1_000_000) return `${(numeric / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(numeric / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return Math.round(numeric).toLocaleString();
}

/**
 * Career Progression Pipeline Module
 * 
 * Implements automated career stage progression using canonical career_stages table
 * and existing profile fields: pending_stage_order, pending_stage_streak, max_stage_order
 * 
 * Features:
 * - Base stage calculation from monthly_listeners via progression_stage_thresholds
 * - Chart bonus: +1 if peaked_top_10 OR weeks_on_chart >= 2 (capped at 1)
 * - REQUIRED_STREAK=2 logic for stage promotions
 * - Idempotent per-turn processing (no double promotions)
 */

interface CareerProgressionContext {
  entities: any;
  globalTurnId: number;
  stageOnly: boolean;
  supabaseAdmin?: any;
  runtimeContext?: any;
}

interface ProfileData {
  id: string;
  career_stage: string;
  pending_stage_order: number | null;
  pending_stage_streak: number | null;
  max_stage_order: number | null;
}

interface FanProfileData {
  monthly_listeners: number;
  career_trend_modifiers?: any;
  fandom_memory?: any;
}

interface ChartData {
  peaked_top_10: boolean;
  weeks_2plus: boolean;
  has_chart_last_2_turns: boolean;
}

interface CareerStageData {
  stage_order: number;
  stage_name: string;
}

interface ProgressionThresholdData {
  stage_order: number;
  min_monthly_listeners: number;
  promotion_window_turns?: number;
  promotion_chart_requirement?: 'none' | 'recent_chart' | 'top10_or_2plus';
}

interface CareerProgressionResult {
  success: boolean;
  deltas?: {
    artistProfile: Record<string, any>;
    career_events_to_create?: any[];
    notifications_to_create?: any[];
    turn_events?: any[];
  };
  skipped?: boolean;
  reason?: string;
}

const REQUIRED_STREAK = 2;

function getStructuredProgressionMetadata(runtime: any, playerId: string) {
  const laneRuntime = runtime?.careerLaneByArtistId?.[playerId] || null;
  const weatherRuntime = runtime?.careerWeatherByArtistId?.[playerId] || null;

  return {
    dominant_lane: laneRuntime?.dominant_lane || laneRuntime?.dominantLane || null,
    secondary_lane: laneRuntime?.secondary_lane || laneRuntime?.secondaryLane || null,
    weather_fit: weatherRuntime?.weather_fit || weatherRuntime?.weatherFit || null,
    proof_summary: Array.isArray(laneRuntime?.proof_summary)
      ? laneRuntime.proof_summary
      : Array.isArray(laneRuntime?.proofSummary)
        ? laneRuntime.proofSummary
        : [],
    weather_keys: {
      global: weatherRuntime?.global?.weather_key || weatherRuntime?.global?.key || null,
      region: weatherRuntime?.region?.region || weatherRuntime?.region?.key || null,
      platform: weatherRuntime?.platform?.platform_key || weatherRuntime?.platform?.key || null,
    },
  };
}

function getBaseStageOrderFromThresholds(thresholds: ProgressionThresholdData[], monthlyListeners: number): number {
  let baseOrder = 1;
  for (const threshold of thresholds || []) {
    if (monthlyListeners >= threshold.min_monthly_listeners) {
      baseOrder = threshold.stage_order;
    } else {
      break;
    }
  }
  return baseOrder;
}

function getThresholdForStageOrder(thresholds: ProgressionThresholdData[], stageOrder: number): ProgressionThresholdData | null {
  return (thresholds || []).find((threshold) => Number(threshold.stage_order) === Number(stageOrder)) || null;
}

function satisfiesChartRequirement(
  chartData: ChartData,
  requirement: ProgressionThresholdData['promotion_chart_requirement'],
): boolean {
  if (!requirement || requirement === 'none') return true;
  if (requirement === 'recent_chart') return !!chartData?.has_chart_last_2_turns;
  if (requirement === 'top10_or_2plus') return !!chartData?.peaked_top_10 || !!chartData?.weeks_2plus;
  return false;
}

/**
 * Calculate base stage order from monthly listeners using progression_stage_thresholds
 */
async function getBaseStageOrder(
  thresholds: ProgressionThresholdData[],
  monthlyListeners: number
): Promise<number> {
  try {
    return getBaseStageOrderFromThresholds(thresholds, monthlyListeners);
  } catch (error) {
    console.error('[CareerProgression] Error getting base stage order:', error);
    return 1; // Fallback to first stage
  }
}

/**
 * Calculate chart bonus: +1 if peaked_top_10 OR weeks_on_chart >= 2 (capped at 1)
 */
function calculateChartBonus(chartData: ChartData): number {
  const hasTop10 = chartData?.peaked_top_10 || false;
  const hasWeeks2Plus = chartData?.weeks_2plus || false;
  
  return (hasTop10 || hasWeeks2Plus) ? 1 : 0;
}

/**
 * Get career stage data by stage order
 */
async function getCareerStageByOrder(ctx: CareerProgressionContext, stageOrder: number): Promise<CareerStageData | null> {
  try {
    const { data, error } = await ctx.supabaseAdmin
      .from('career_stages')
      .select('stage_order, stage_name')
      .eq('stage_order', stageOrder)
      .single();
    if (error || !data) return null;
    return data as CareerStageData;
  } catch (error) {
    console.error('[CareerProgression] Error getting career stage by order:', error);
    return null;
  }
}

async function getCareerStageByName(ctx: CareerProgressionContext, stageName: string): Promise<CareerStageData | null> {
  try {
    const { data, error } = await ctx.supabaseAdmin
      .from('career_stages')
      .select('stage_order, stage_name')
      .eq('stage_name', stageName)
      .single();
    if (error || !data) return null;
    return data as CareerStageData;
  } catch (error) {
    console.error('[CareerProgression] Error getting career stage by name:', error);
    return null;
  }
}

/**
 * Process career progression for a single player
 */
const CAREER_DEMOTION_GRACE_TURNS = 24 * 7;
const CAREER_DEMOTION_ICONIC_BONUS_TURNS = 24;
const CAREER_DEMOTION_MAX_THRESHOLD = 24 * 14;

export async function processCareerProgression(
  ctx: CareerProgressionContext, 
  player: any
): Promise<CareerProgressionResult> {
  const { entities, globalTurnId } = ctx;
  
  try {
    // Get current profile data
    const profile: ProfileData = {
      id: player.id,
      career_stage: player.career_stage || 'Underground',
      pending_stage_order: player.pending_stage_order || null,
      pending_stage_streak: player.pending_stage_streak || null,
      max_stage_order: player.max_stage_order || 5
    };

    // Get fan profile for monthly listeners
    const fanProfiles = await entities.FanProfile.filter({ artist_id: player.id });
    const fanProfile: FanProfileData = fanProfiles?.[0] || { monthly_listeners: 0 };

    // Get chart activity for last 2 turns — two separate queries to avoid PostgREST join ambiguity
    let chartData: ChartData = { peaked_top_10: false, weeks_2plus: false, has_chart_last_2_turns: false };
    try {
      const { data: chartRows } = await ctx.supabaseAdmin
        .from('chart_entries')
        .select('position, peak_position, weeks_on_chart, run_id')
        .eq('artist_id', player.id);
      if (chartRows && chartRows.length > 0) {
        const runIds = [...new Set(chartRows.map((c: any) => c.run_id).filter(Boolean))];
        let hasRecentRun = false;
        if (runIds.length > 0) {
          const { data: recentRuns } = await ctx.supabaseAdmin
            .from('chart_runs')
            .select('run_id')
            .in('run_id', runIds)
            .gte('global_turn_id', globalTurnId - 1)
            .limit(1);
          hasRecentRun = (recentRuns?.length ?? 0) > 0;
        }
        chartData = {
          peaked_top_10: chartRows.some((c: any) => Number(c.peak_position ?? c.position) > 0 && Number(c.peak_position ?? c.position) <= 10),
          weeks_2plus: chartRows.some((c: any) => c.weeks_on_chart >= 2),
          has_chart_last_2_turns: hasRecentRun,
        };
      }
    } catch (chartErr: any) {
      console.error('[CareerProgression] Chart query failed:', chartErr?.message);
    }

    const runtime = ctx?.runtimeContext || {};
    const trend = runtime?.careerTrendByArtistId?.[player.id]?.trend || fanProfile?.career_trend_modifiers?.current_trend || null;
    const effectiveSentiment100 = Number(runtime?.audience_modifiers?.effectiveSentiment100 ?? fanProfile?.fandom_memory?.sentiment?.effective100 ?? 50) || 50;
    const sentimentChurnDelta = Number(runtime?.audience_modifiers?.churnDelta) || 0;
    const trendDecayAddend = Number(runtime?.careerTrendByArtistId?.[player.id]?.effects?.decayRateAddend) || 0;
    const listenerDecayMult = Number(fanProfile?.career_trend_modifiers?.listener_decay_mult) || 0;
    const effectiveDecayRate = computeEffectiveDecayRate(listenerDecayMult, sentimentChurnDelta, runtime?.audience_quality_modifiers || null, trendDecayAddend);
    const structuredMetadata = getStructuredProgressionMetadata(runtime, player.id);
    const { data: thresholdsData, error: thresholdsError } = await ctx.supabaseAdmin
      .from('progression_stage_thresholds')
      .select('stage_order, min_monthly_listeners, promotion_window_turns, promotion_chart_requirement')
      .order('stage_order', { ascending: true });
    if (thresholdsError || !thresholdsData?.length) {
      throw new Error(`Failed to load progression thresholds: ${thresholdsError?.message}`);
    }
    const thresholds: ProgressionThresholdData[] = thresholdsData;

    // Calculate progression
    const baseStageOrder = await getBaseStageOrder(thresholds, fanProfile.monthly_listeners);
    const chartBonus = calculateChartBonus(chartData);
    const recommendedStageOrder = Math.min(
      baseStageOrder + chartBonus, 
      profile.max_stage_order || 5
    );

    // Get current stage order from player's stored career_stage
    const currentCareerStage = await getCareerStageByName(ctx, profile.career_stage);
    const currentStageOrder = currentCareerStage?.stage_order || 1;

    // Update pending fields with REQUIRED_STREAK=2 logic
    let newPendingOrder = profile.pending_stage_order;
    let newPendingStreak = profile.pending_stage_streak || 0;
    const nextStageOrder = currentStageOrder + 1;
    const nextStageThreshold = getThresholdForStageOrder(thresholds, nextStageOrder);
    const requiredWindowTurns = Number(nextStageThreshold?.promotion_window_turns) || REQUIRED_STREAK;
    const promotionChartRequirement = nextStageThreshold?.promotion_chart_requirement || 'none';
    const promotionQualified = recommendedStageOrder > currentStageOrder
      && satisfiesChartRequirement(chartData, promotionChartRequirement);

    const events: any[] = [];
    const notifications: any[] = [];
    const turnEvents: any[] = [];
    let stageChangeEvent: any = null;

    if (promotionQualified) {
      // Recommended promotion
      if (profile.pending_stage_order === nextStageOrder) {
        // Continuing streak for same recommended stage
        newPendingStreak = (profile.pending_stage_streak || 0) + 1;
      } else {
        // New recommended stage, reset streak
        newPendingOrder = nextStageOrder;
        newPendingStreak = 1;
      }
    } else {
      // No promotion recommended, this is a decline signal
      newPendingOrder = currentStageOrder;
      newPendingStreak = 0;
    }

    // Update consecutive_decline_turns based on decline signal
    // Active players (unified activity check) don't accumulate decline streaks —
    // this breaks the death spiral where churn→decline→more churn compounds forever.
    const isDecline = recommendedStageOrder <= currentStageOrder;
    const previousDeclineTurns = player.consecutive_decline_turns || 0;
    const playerActivity = ctx.runtimeContext?.playerActivity;
    let newConsecutiveDeclineTurns = 0;

    if (isDecline) {
      if (playerActivity?.isActive) {
        // Active player: hold steady, don't accumulate (breaks the spiral)
        newConsecutiveDeclineTurns = previousDeclineTurns;
      } else if (playerActivity?.inGracePeriod) {
        // In grace period: slow increment (1 per 7 turns instead of every turn)
        newConsecutiveDeclineTurns = previousDeclineTurns + (ctx.globalTurnId % 7 === 0 ? 1 : 0);
      } else {
        // Post-grace, truly inactive: normal increment
        newConsecutiveDeclineTurns = previousDeclineTurns + 1;
      }
    } else {
      // Reset decline streak (growth case)
      newConsecutiveDeclineTurns = 0;
    }

    const deltas: Record<string, any> = {
      pending_stage_order: newPendingOrder,
      pending_stage_streak: newPendingStreak,
      consecutive_decline_turns: newConsecutiveDeclineTurns,
    };

    turnEvents.push({
      global_turn_id: globalTurnId,
      player_id: player.id,
      module: 'careerProgressionPipeline',
      event_type: 'CAREER_DECLINE_STREAK_UPDATE',
      description: `Career decline streak updated: ${previousDeclineTurns} → ${newConsecutiveDeclineTurns}`,
      deltas: {
        consecutive_decline_turns: {
          from: previousDeclineTurns,
          to: newConsecutiveDeclineTurns,
        }
      },
      metadata: {
        decline_applied: isDecline,
        previous_consecutive_decline_turns: previousDeclineTurns,
        next_consecutive_decline_turns: newConsecutiveDeclineTurns,
        reason: isDecline ? 'progress_signal_decline' : 'progress_signal_neutral',
        recommended_stage_order: recommendedStageOrder,
        current_stage_order: currentStageOrder,
        monthly_listeners: fanProfile.monthly_listeners,
      },
      created_at: new Date().toISOString(),
    });

    // Check for promotion (only in commit phase, not stageOnly)
    
    if (newPendingStreak >= requiredWindowTurns && newPendingOrder === nextStageOrder) {
      // Promotion conditions met!
      const newStage = await getCareerStageByOrder(ctx, newPendingOrder);
      
      if (newStage) {
        // Update career_stage and reset pending fields
        deltas.career_stage = newStage.stage_name;
        deltas.pending_stage_order = newPendingOrder; // Set to new current
        deltas.pending_stage_streak = 0; // Reset streak
        deltas.consecutive_decline_turns = 0; // Promotion resets decline streak

        stageChangeEvent = {
          global_turn_id: globalTurnId,
          player_id: player.id,
          module: 'careerProgressionPipeline',
          event_type: 'STAGE_CHANGE',
          description: `Career stage changed from ${profile.career_stage} to ${newStage.stage_name}`,
          deltas: { previous_stage: profile.career_stage, next_stage: newStage.stage_name },
          metadata: {
            previous_stage: profile.career_stage,
            next_stage: newStage.stage_name,
            reason: 'promotion_window_met',
            summary_label: 'Promotion window met',
            progress_reason_family: 'promotion',
            promotion_window_turns_required: requiredWindowTurns,
            promotion_chart_requirement: promotionChartRequirement,
            chart_requirement_satisfied: satisfiesChartRequirement(chartData, promotionChartRequirement),
            trend,
            dominant_lane: structuredMetadata.dominant_lane,
            secondary_lane: structuredMetadata.secondary_lane,
            weather_fit: structuredMetadata.weather_fit,
            proof_summary: structuredMetadata.proof_summary,
            weather_keys: structuredMetadata.weather_keys,
            effective_sentiment100: Number(effectiveSentiment100.toFixed(3)),
            effective_decay_rate: Number(effectiveDecayRate.toFixed(5)),
            newConsecutiveDeclineTurns: 0,
            uniqueness_key: `${player.id}:${globalTurnId}:stage_change`,
          },
          created_at: new Date().toISOString(),
        };

        // Create career event
        events.push({
          artist_id: player.id,
          from_stage_order: currentStageOrder,
          to_stage_order: newPendingOrder,
          event_type: 'promotion',
          turn_id: globalTurnId,
          metadata: {
            previous_stage: profile.career_stage,
            new_stage: newStage.stage_name,
            monthly_listeners: fanProfile.monthly_listeners,
            chart_bonus_applied: chartBonus > 0
          },
          created_at: new Date().toISOString()
        });

        // Create notification
        notifications.push({
          player_id: player.id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'CAREER_PROGRESSION',
          title: 'Career Milestone!',
          subtitle: `Promoted to ${newStage.stage_name}`,
          body: `Your career has advanced to ${newStage.stage_name}! Your monthly listeners of ${formatCompactNumber(fanProfile.monthly_listeners)} and chart performance have earned you this promotion.`,
          metrics: {
            from_stage: profile.career_stage,
            to_stage: newStage.stage_name,
            monthly_listeners: fanProfile.monthly_listeners,
            chart_bonus: chartBonus
          },
          deep_links: { page: 'CareerInsights' },
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
    }

    // DEMOTION LOGIC: Evaluate only if no promotion occurred this turn
    const promotionOccurred = events.length > 0;
    
    if (!promotionOccurred) {
      // Check demotion rules: consecutive_decline_turns >= threshold, no chart activity, current_stage_order > 1
      // Give players a real-life break-safe runway before demotion can open.
      // One week baseline, with modest iconic-era extension up to two weeks max.
      const iconicEraCount = Number(runtime?.iconicEraCount) || 0;
      const demotionThreshold = Math.min(
        CAREER_DEMOTION_GRACE_TURNS + (iconicEraCount * CAREER_DEMOTION_ICONIC_BONUS_TURNS),
        CAREER_DEMOTION_MAX_THRESHOLD,
      );
      const consecutiveDeclineTurns = newConsecutiveDeclineTurns;
      const hasChartLast2Turns = chartData.has_chart_last_2_turns;
      
      if (previousDeclineTurns >= demotionThreshold && !hasChartLast2Turns && currentStageOrder > 1) {
        // Demotion eligible - get previous stage
        const demotionStageOrder = currentStageOrder - 1;
        const demotionStage = await getCareerStageByOrder(ctx, demotionStageOrder);
        
        if (demotionStage) {
          // Update profile stage
          deltas.career_stage = demotionStage.stage_name;
          deltas.pending_stage_order = demotionStageOrder; // Set to new current
          deltas.pending_stage_streak = 0; // Reset streak

          stageChangeEvent = {
            global_turn_id: globalTurnId,
            player_id: player.id,
            module: 'careerProgressionPipeline',
            event_type: 'STAGE_CHANGE',
            description: `Career stage changed from ${profile.career_stage} to ${demotionStage.stage_name}`,
            deltas: { previous_stage: profile.career_stage, next_stage: demotionStage.stage_name },
            metadata: {
              previous_stage: profile.career_stage,
              next_stage: demotionStage.stage_name,
              reason: 'consecutive_decline_and_no_chart_activity',
              summary_label: 'Career setback applied',
              progress_reason_family: 'demotion',
              trend,
              dominant_lane: structuredMetadata.dominant_lane,
              secondary_lane: structuredMetadata.secondary_lane,
              weather_fit: structuredMetadata.weather_fit,
              proof_summary: structuredMetadata.proof_summary,
              weather_keys: structuredMetadata.weather_keys,
              effective_sentiment100: Number(effectiveSentiment100.toFixed(3)),
              effective_decay_rate: Number(effectiveDecayRate.toFixed(5)),
              newConsecutiveDeclineTurns: consecutiveDeclineTurns,
              uniqueness_key: `${player.id}:${globalTurnId}:stage_change`,
            },
            created_at: new Date().toISOString(),
          };

          // Create demotion notification with idempotency key
          notifications.push({
            player_id: player.id,
            global_turn_id: globalTurnId,
            created_turn_index: globalTurnId,
            type: 'HIGHLIGHT',
            title: 'Career setback',
            subtitle: `You dropped to ${demotionStage.stage_name}`,
            body: `No chart activity for ${demotionThreshold} turns and momentum slipped. You fell from ${profile.career_stage} to ${demotionStage.stage_name}.`,
            metrics: {
              event_type: 'STAGE_DEMOTION',
              from_stage_order: currentStageOrder,
              to_stage_order: demotionStageOrder,
              from_stage_name: profile.career_stage,
              to_stage_name: demotionStage.stage_name,
              consecutive_decline_turns: consecutiveDeclineTurns,
              has_chart_last_2_turns: false
            },
            idempotency_key: `career_demotion:${globalTurnId}`,
            deep_links: { page: 'CareerInsights' },
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    if (stageChangeEvent) {
      turnEvents.push(stageChangeEvent);
    }

    return {
      success: true,
      deltas: {
        artistProfile: deltas,
        career_events_to_create: events,
        notifications_to_create: notifications,
        turn_events: turnEvents
      }
    };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CareerProgression] Error processing player ${player.id}:`, errMsg);
    return {
      success: false,
      reason: errMsg
    };
  }
}
