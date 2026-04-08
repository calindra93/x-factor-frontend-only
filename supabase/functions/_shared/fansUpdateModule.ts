/**
 * FANS UPDATE MODULE - Per-turn listener and fan archetype updates (Batch 3.1 - Staging Compatible)
 * Pure staging function: returns deltas only, NO entity writes
 * Runs every turn (idempotency managed by turnEngine)
 * Calculates:
 * - Weekly bucket shifts (every turn)
 * - Fan mix composition (based on era events, hype, releases)
 * - Listener growth from streams and followers
 * - Regional distribution tracking
 */

import { PLATFORM_MODELS } from './platformAlgorithmModel.ts';
import { computeDiscoveryConversion, getDiscoveryConversionMultiplier } from './discoveryConversion.ts';

const clampN = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function computeEffectiveDecayRate(
  baseTrendDecay: number,
  sentimentChurnDelta: number,
  audienceQualityModifiers: { viralHalfLifeMult?: number; stabilityDampeningMult?: number } | null = null,
  churnMultiplier: number = 1,
  trendDecayAddend: number = 0,
): number {
  const viralHalfLifeMult = Number(audienceQualityModifiers?.viralHalfLifeMult) || 1;
  const stabilityDampeningMult = Number(audienceQualityModifiers?.stabilityDampeningMult) || 1;
  const composedDecay = ((Number(baseTrendDecay) || 0) + (Number(sentimentChurnDelta) || 0)) * (Number(churnMultiplier) || 1);
  return clampN(
    composedDecay
    + ((viralHalfLifeMult - 1) * 0.01)
    + ((stabilityDampeningMult - 1) * 0.005)
    + (Number(trendDecayAddend) || 0),
    0,
    0.02, // Cap at 2%/turn (was 5%). At 5%/turn, artists lost ~65% in 20 turns — too aggressive.
  );
}

export async function updateFansForPlayer(player: any, fanProfile: any, globalTurnId: any, entities: any, deltas: any, eraData: any, ctx: any = {}) {
  if (!player?.id || !fanProfile) return { success: false };

  // No idempotency check here - turnEngine manages history

  // Weekly bucket rotation: only shift buckets once every 7 turns (= 1 in-game week).
  // Rotating every turn means w4 = 4 hours of data, not 4 weeks — causing catastrophic
  // monthly_listeners drops as a viral spike falls off w4 within hours.
  const BUCKET_SHIFT_INTERVAL = 7;
  const lastShiftTurn = Number(fanProfile.last_bucket_shift_turn) || 0;
  const shouldShiftBuckets = (globalTurnId - lastShiftTurn) >= BUCKET_SHIFT_INTERVAL;

  const updates: any = shouldShiftBuckets ? {
    // Weekly bucket rotation (every 7 turns = 1 in-game week)
    weekly_unique_w4: fanProfile.weekly_unique_w3 || 0,
    weekly_unique_w3: fanProfile.weekly_unique_w2 || 0,
    weekly_unique_w2: fanProfile.weekly_unique_w1 || 0,
    weekly_active_w4: fanProfile.weekly_active_w3 || 0,
    weekly_active_w3: fanProfile.weekly_active_w2 || 0,
    weekly_active_w2: fanProfile.weekly_active_w1 || 0
  } : {
    // No bucket shift this turn — preserve existing week history
    weekly_unique_w4: fanProfile.weekly_unique_w4 || 0,
    weekly_unique_w3: fanProfile.weekly_unique_w3 || 0,
    weekly_unique_w2: fanProfile.weekly_unique_w2 || 0,
    weekly_active_w4: fanProfile.weekly_active_w4 || 0,
    weekly_active_w3: fanProfile.weekly_active_w3 || 0,
    weekly_active_w2: fanProfile.weekly_active_w2 || 0
  };

  // Calculate new W1 (current week) from streaming + follower growth
  const streamsThisTurn = deltas.streams_earned || 0;
  const followersThisTurn = deltas.follower_growth || 0;
  const discoveryGrowthMult = Math.max(1, 1 + (Number(ctx?.communityOrganicGrowthBoost) || 0));
  const trendEffects = ctx?.careerTrendEffects || {};
  const discoveryConversionMult = getDiscoveryConversionMultiplier({
    audienceQualityModifiers: ctx?.audienceQualityModifiers || null,
    careerTrendEffects: trendEffects || null,
  });

  // Conversion rate: streams → unique listeners (listener-to-follower funnel)
  // Preserve early-game pacing (~2.5 streams per unique), but make new-unique growth harder at high scale.
  // Reference: Spotify describes active listeners streaming 1-2 (light), 3-14 (moderate), 15+ (super) times in 28 days.
  // At mega-scale, a larger share of streams come from repeat listeners, so each additional unique listener costs more streams.
  const logStreams = Math.log10(Math.max(1, streamsThisTurn));
  const streamsPerUnique = 2.5 + Math.max(0, Math.min(6, (logStreams - 4))) * 1.2;
  const estimatedUniqueListenersBase = Math.floor(streamsThisTurn / streamsPerUnique);
  const listenerConversionAdj = clampN(Number(trendEffects?.listenerConversionAdj) || 1, 0.9, 1.1);
  const estimatedUniqueListeners = computeDiscoveryConversion(estimatedUniqueListenersBase * listenerConversionAdj, {
    audienceQualityModifiers: ctx?.audienceQualityModifiers || null,
    careerTrendEffects: trendEffects || null,
  });

  // Follower growth is downstream of discovery; keep it as a small additive signal to avoid double-counting at scale.
  const followerConvMult = streamsThisTurn >= 1_000_000 ? 0.2 : 0.9;
  const estimatedFollowerConversionsBase = Math.floor(followersThisTurn * followerConvMult);
  const followerConversionAdj = clampN(Number(trendEffects?.followerConversionAdj) || 1, 0.9, 1.1);
  const estimatedFollowerConversions = Math.floor(estimatedFollowerConversionsBase * followerConversionAdj);
  const newW1UniqueRaw = Math.floor((estimatedUniqueListeners + estimatedFollowerConversions) * discoveryGrowthMult);

  // W1 follower floor: w1 should never drop below ~5% of followers.
  // Without this, a single low-stream turn cascades through all 4 weekly buckets
  // and destroys monthly_listeners over the next 3 bucket shifts.
  // Raised from 2% → 5% to better protect inactive players' monthly listeners.
  const w1FollowerFloor = Math.floor(Number(player.followers) * 0.05);
  const newW1Unique = Math.max(newW1UniqueRaw, w1FollowerFloor);

  // Active listeners are ~60% of unique (those who engage 2+ times/week)
  const newW1Active = Math.floor(newW1Unique * 0.6);

  updates.weekly_unique_w1 = newW1Unique;
  updates.weekly_active_w1 = newW1Active;

  // Total active listeners this month (sum of all weeks)
  const monthlyActiveRaw =
    (updates.weekly_active_w1 || 0) +
    (updates.weekly_active_w2 || 0) +
    (updates.weekly_active_w3 || 0) +
    (updates.weekly_active_w4 || 0);

  // Apply same EMA (alpha=0.10) as monthly_listeners to keep the ratio stable per-turn.
  // Without smoothing, MAL jumps to the raw bucket sum each turn while ML is smoothed,
  // causing the MAL/ML ratio to swing wildly intra-week.
  const prevMAL = fanProfile.monthly_active_listeners || 0;
  const monthlyActive = prevMAL > 0
    ? Math.floor(prevMAL * 0.9 + monthlyActiveRaw * 0.1)
    : monthlyActiveRaw;

  updates.monthly_active_listeners = monthlyActive;

  // FAN MIX SHIFTS based on era events and hype (6-segment model)
  const fanMixDelta = {
    og: 0, core: 0, casual: 0, trend_chaser: 0, stan: 0, critic: 0,
  };

  // Release activation → Core + Casual boost
  if (deltas.releases_activated > 0) {
    fanMixDelta.core = 2;
    fanMixDelta.casual = 3;
  }

  // High hype → Trend chaser + Stan conversion
  if (player.hype >= 70) {
    fanMixDelta.stan = 1;
    fanMixDelta.trend_chaser = 2;
  } else if (player.hype >= 50) {
    fanMixDelta.trend_chaser = 1;
  }

  // High follower growth → Core retention boost
  if (deltas.follower_growth > 1000) {
    fanMixDelta.core = 2;
  }

  // Merch sales → Stan + Core loyalty
  if (deltas.merch_revenue > 500) {
    fanMixDelta.stan = 2;
    fanMixDelta.core = 1;
  }

  // Era flop → Trend chaser exodus, critics gain
  if (eraData?.is_flop) {
    fanMixDelta.trend_chaser = -3;
    fanMixDelta.casual = -1;
    fanMixDelta.stan = 1;
    fanMixDelta.critic = 2;
  }

  // One-hit spike → Trend/Casual surge, Stan loss (casual takeover)
  if (eraData?.is_one_hit) {
    fanMixDelta.trend_chaser = 8;
    fanMixDelta.casual = 5;
    fanMixDelta.stan = -4;
    fanMixDelta.core = -3;
    fanMixDelta.og = -1;
  }

  // Fan mix computation (informational only — superseded by fandom_segments table).
  // Computed here for turn event logging but NOT written to fan_profiles.
  const nextMix = {
    og: clamp((2) + fanMixDelta.og, 0, 30),
    core: clamp((20) + fanMixDelta.core, 3, 60),
    casual: clamp((55) + fanMixDelta.casual, 5, 80),
    trend_chaser: clamp((15) + fanMixDelta.trend_chaser, 0, 50),
    stan: clamp((5) + fanMixDelta.stan, 0, 40),
    critic: clamp((3) + fanMixDelta.critic, 0, 30),
  };

  const mixKeys = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'] as const;
  const total = mixKeys.reduce((s, k) => s + nextMix[k], 0);
  const scale = 100 / total;
  const fanMixForLog: Record<string, number> = {};
  let remaining = 100;
  for (let i = 0; i < mixKeys.length - 1; i++) {
    fanMixForLog[mixKeys[i]] = Math.round(nextMix[mixKeys[i]] * scale);
    remaining -= fanMixForLog[mixKeys[i]];
  }
  fanMixForLog[mixKeys[mixKeys.length - 1]] = remaining;

  // REGIONAL DISTRIBUTION (simple: maintain or shift)
  // If touring or region-specific event, bump that region; else slow decay
  const nextRegionShare: any = { ...(fanProfile.region_share || {}) };
  for (const [region, pct] of (Object.entries(nextRegionShare) as any[])) {
    // Slow homogenization: regions drift toward global average
    const globalAvg = 30;
    nextRegionShare[region] = Math.round((Number(pct) || 0) * 0.98 + globalAvg * 0.02);
  }

  // Rebalance to 100%
  const regionTotal = (Object.values(nextRegionShare) as any[]).reduce((sum: number, p: any) => sum + (Number(p) || 0), 0);
  for (const region of Object.keys(nextRegionShare)) {
    nextRegionShare[region] = regionTotal > 0
      ? Math.round(((Number(nextRegionShare[region]) || 0) / regionTotal) * 100)
      : 0;
  }

  updates.region_share = nextRegionShare;

  // Use this turn's projected monthly listener baseline from updated weekly buckets
  // so regional listener counts stay in sync with post-update bucket state.
  const projectedMonthlyListeners =
    (Number(updates.weekly_unique_w1) || 0) +
    (Number(updates.weekly_unique_w2) || 0) +
    (Number(updates.weekly_unique_w3) || 0) +
    (Number(updates.weekly_unique_w4) || 0);

  // Top regions (by listener count)
  const topRegions = (Object.entries(nextRegionShare) as any[]).map(([region, pct]) => ({
    region,
    percentage: Number(pct) || 0,
    listeners: Math.floor(projectedMonthlyListeners * ((Number(pct) || 0) / 100))
  })).sort((a: any, b: any) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0)).slice(0, 5);

  updates.top_regions = topRegions;

  // Only stamp last_bucket_shift_turn when we actually shifted — otherwise the
  // interval check next turn would always see 1 turn elapsed and never shift.
  if (shouldShiftBuckets) {
    updates.last_bucket_shift_turn = globalTurnId;
  }

  // Retention rate: % of last week's unique listeners who returned this week
  // weekly_active_w1 is capped at weekly_unique_w1 for this computation to prevent >100%.
  const lastWeekUnique = fanProfile.weekly_unique_w1 || 0;
  const activeForRetention = Math.min(newW1Active, newW1Unique); // active can never exceed unique
  const retentionMultAdj = clampN(Number(trendEffects?.retentionMultAdj) || 1, 0.92, 1.08);
  const retentionRate = lastWeekUnique > 0
    ? Math.min(100, Math.max(0, Math.round((activeForRetention / lastWeekUnique) * 100 * retentionMultAdj)))
    : 0;

  updates.retention_rate = retentionRate;
  // Per-turn retention delta: positive = improving, negative = declining
  updates.retention_delta = retentionRate - (Number(fanProfile.retention_rate) || 0);

  // Logging: top 3 by total_fans (non-fatal, best-effort)
  console.log(
    `[FansUpdate] turn=${globalTurnId} player=${player.artist_name || player.id} ` +
    `monthly_active_listeners=${updates.monthly_active_listeners} ` +
    `fan_mix=${JSON.stringify(fanMixForLog)}`
  );

  return {
    success: true,
    deltas: {
      fanProfile: updates,
      turn_event: {
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'FansUpdateModule',
        event_type: 'fans_updated',
        description: `Fans updated for turn ${globalTurnId}`,
        metrics: {
          monthly_active_listeners: updates.monthly_active_listeners,
          fan_mix: fanMixForLog,
          retention_rate: retentionRate,
        },
      }
    }
  };
}

function clamp(value: any, min: any, max: any) {
  return Math.max(min, Math.min(max, value));
}
