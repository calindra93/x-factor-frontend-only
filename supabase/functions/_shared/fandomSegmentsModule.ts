/**
 * FANDOM SEGMENTS MODULE — Turn Engine Integration (Batch 3.1 - Staging Compatible)
 * Pure staging: loads state, calls fandomSegmentsEngine, returns deltas only.
 * Runs at order 2.5 every turn (after fansUpdateModule, before era processing).
 *
 * Writes deltas for:
 *   - fandoms row (fan_morale, brand_trust, state fields)
 *   - fandom_segments rows (count, loyalty, morale, drift_rate, labor_output)
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { getGenreTrait } from './genreTraits.ts';
import {
  ensureFandomState,
  ensureFandomSegments,
  computePillarEffects,
  computeNextFanMorale,
  computeNextBrandTrust,
  computeSegmentDrift,
  reconcileSegmentCounts,
  computeLaborOutput,
  netToxicity,
  getPassiveToxicityDecay,
  totalStreamingLabor,
  advanceSegmentFatigue,
  applyFatiguePenalties,
  computeLaborPool,
  computeToxicityEffects,
  computeAlignmentForTick,
  checkIdentityCrisis,
  defaultFatigueMap,
  computeReleaseCadencePenalty,
  type TurnInputs,
  type SegmentType,
  type LaborType,
  type FatigueMap,
} from './fandomSegmentsEngine.ts';

const N = (v: unknown): number => Number(v) || 0;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Run fandom segment processing for a single player turn.
 * Returns delta objects ready for commit phase.
 */
export async function processFandomSegmentsForPlayer(
  player: any,
  globalTurnId: number,
  entities: any,
  deltas: any,
  ctx: any = {},
): Promise<{
  success: boolean;
  fandomPatch?: Record<string, unknown>;
  segmentPatches?: Array<Record<string, unknown>>;
  notifications?: any[];
  metricsSnapshot?: Record<string, unknown>;
  laborPool?: Record<string, number>;
  events?: any[];
  error?: string;
}> {
  if (!player?.id) return { success: false, error: 'No player ID' };

  try {
    // ── Load fandoms row (prefetch-first, DB fallback) ──────────────────────
    const prefetchedFandom = ctx?.prefetchData?.fandomsByPlayer?.get(player.id);
    const fandomRow = prefetchedFandom || (await supabaseAdmin
      .from('fandoms')
      .select('*')
      .eq('player_id', player.id)
      .maybeSingle()).data;

    const fandom = ensureFandomState(fandomRow, player.id);

    // ── Load fandom_segments rows (prefetch-first, DB fallback) ─────────────
    const prefetchedSegments = ctx?.prefetchData?.fandomSegmentsByPlayer?.get(player.id);
    const segmentRows = prefetchedSegments || (await supabaseAdmin
      .from('fandom_segments')
      .select('*')
      .eq('player_id', player.id)).data;

    let segments = ensureFandomSegments(segmentRows || []);

    // ── Bootstrap segment counts if they are far below actual followers ──────
    // If total segment count < 85% of real followers (e.g. first run or after a reset),
    // bootstrap proportionally using fandoms.fan_segments fractions (derived from the
    // previous turn's segment counts) or DEFAULT_FRACTIONS for brand-new players.
    const totalFansCheck = N(player?.fans) || N(player?.followers) || 0;
    const segmentTotal = Object.values(segments).reduce((s: number, seg: any) => s + N(seg.count), 0);
    if (totalFansCheck > 0 && segmentTotal < totalFansCheck * 0.85) {
      const fanSegFractions: Record<string, number> = (fandomRow?.fan_segments as Record<string, number>) || {};
      const DEFAULT_FRACTIONS: Record<string, number> = {
        og: 0.01, core: 0.35, casual: 0.45, trend_chaser: 0.0, stan: 0.05, critic: 0.04,
      };
      const fractions: Record<string, number> = Object.keys(DEFAULT_FRACTIONS).reduce((acc, k) => {
        const rawValue = fanSegFractions[k];
        const numericValue = rawValue == null ? DEFAULT_FRACTIONS[k] : Number(rawValue);
        acc[k] = Number.isFinite(numericValue) ? numericValue : DEFAULT_FRACTIONS[k];
        return acc;
      }, {} as Record<string, number>);
      const fracTotal = Object.values(fractions).reduce((s, v) => s + v, 0);
      const SEGMENT_TYPES_BOOTSTRAP = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'] as const;
      for (const segType of SEGMENT_TYPES_BOOTSTRAP) {
        const frac = (fractions[segType] || 0) / Math.max(fracTotal, 1);
        const bootstrapCount = Math.floor(totalFansCheck * frac);
        if (bootstrapCount > segments[segType].count) {
          segments = {
            ...segments,
            [segType]: { ...segments[segType], count: bootstrapCount },
          };
        }
      }
    }

    // ── Load social_posts with alignment_tag for this tick ──────────────────
    // alignment_tag is set by platform pitch actions (stan_cta, community_ritual, etc.)
    // 25-hour window covers one full turn cycle safely
    const tickWindowStart = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: tickPosts } = await supabaseAdmin
      .from('social_posts')
      .select('alignment_tag, subtweet_target_id, metadata, platform')
      .eq('artist_id', player.id)
      .gte('created_at', tickWindowStart)
      .not('alignment_tag', 'is', null)
      .limit(100);
    const postActionTags: string[] = (tickPosts || [])
      .map((p: any) => p.alignment_tag)
      .filter(Boolean) as string[];

    // ── Also pull VidWave video alignment tags from metadata ─────────────────
    // VidWave videos store their alignment tag in metadata.alignment_tag
    // (not the top-level column) — inject them into the alignment pipeline
    const { data: vidwavePosts } = await supabaseAdmin
      .from('social_posts')
      .select('metadata')
      .eq('artist_id', player.id)
      .eq('platform', 'vidwave')
      .gte('created_at', tickWindowStart)
      .limit(100);
    for (const vp of vidwavePosts || []) {
      const tag = (vp as any)?.metadata?.alignment_tag as string | undefined;
      if (tag && !postActionTags.includes(tag)) {
        postActionTags.push(tag);
      }
    }

    // ── Count active controversies directly from DB ──────────────────────────
    // controversyTick runs at order 4.55 — AFTER this module (4.5) — so
    // ctx.controversyActiveTicks is always 0. Query DB directly instead.
    const { count: controversyCount } = await supabaseAdmin
      .from('controversy_cases')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .neq('phase', 'resolved');

    // ── Build TurnInputs from deltas + ctx ──────────────────────────────────
    const hasReleaseThisTick = N(deltas?.releases_activated) > 0 ||
      N(deltas?.streams_earned) > 0;
    const hasSocialPostThisTick = N(deltas?.social_posts_created) > 0;
    const hasContentThisTick = hasReleaseThisTick || hasSocialPostThisTick;

    // Platform spotlight: hype > 70 OR career trend includes VIRAL/SENSATION
    const trendName = String(ctx?.careerTrendEffects?.activeTrend || player?.career_trends?.current || '');
    const hype = N(player?.hype);
    const inPlatformSpotlight = hype > 70 || /viral|sensation/i.test(trendName);

    // Controversy: count from DB directly (controversyTick runs after this module)
    const controversyActiveTicks = (controversyCount || 0) > 0
      ? (controversyCount || 0)
      : N(ctx?.controversyActiveTicks);

    // Apology tour: from social post pitch action OR ctx fallback
    const apologyTourActive = postActionTags.includes('apology_tour') || !!(ctx?.apologyTourActive);

    // Quality streak from ctx or derive from recent releases
    const consecutiveQualityTicks = N(ctx?.consecutiveQualityTicks) || 0;

    // Release quality from most recent deltas
    const releaseQualityScore = N(deltas?.release_quality_score) || 0;

    // Community ritual: from social post pitch action OR ctx fallback OR hype proxy
    const hasCommunityRitual = postActionTags.includes('community_ritual')
      || !!(ctx?.hasCommunityRitual)
      || (hasSocialPostThisTick && hype > 50);

    const TREND_MOMENTUM_TAGS = new Set([
      'trend_surf',
      'trend_sound_ride',
      'meme_drop',
      'meme_trend_drop',
      'viral_content',
      'beef_engagement',
    ]);
    const hasTrendMomentum = postActionTags.some((tag) => TREND_MOMENTUM_TAGS.has(tag))
      || !!(ctx?.hasTrendMomentum);

    // Disrespect event: receipts_drop targeting another player = disrespected stan culture
    const disrespectedStanCulture = (tickPosts || []).some(
      (p: any) => p.alignment_tag === 'receipts_drop' && p.subtweet_target_id && p.subtweet_target_id !== player.id,
    ) || !!(ctx?.disrespectedStanCulture);

    const activeTourRegion = String(player?.region || '').trim() || null;
    const phase6RegionBias = (ctx?.phase6State && typeof ctx.phase6State === 'object')
      ? (ctx.phase6State.region_bias as Record<string, any> | undefined)
      : undefined;
    const persistedRegionBias = typeof fandomRow?.region_bias === 'object'
      ? (fandomRow.region_bias as Record<string, any>)
      : undefined;
    const activeRegionBias = activeTourRegion
      ? phase6RegionBias?.[activeTourRegion] || persistedRegionBias?.[activeTourRegion] || null
      : null;

    // Unified player activity signal from runtimeContext (computed in turnProcessorCore)
    const playerActivity = ctx?.playerActivity || { isActive: hasContentThisTick, inGracePeriod: true };

    const inputs: TurnInputs = {
      globalTurnId,
      hasContentThisTick,
      hasReleaseThisTick,
      isPlayerActive: playerActivity.isActive,
      inGracePeriod: playerActivity.inGracePeriod,
      inPlatformSpotlight,
      hasTrendMomentum,
      controversyActiveTicks,
      apologyTourActive,
      consecutiveQualityTicks,
      releaseQualityScore,
      hype,
      overallSentiment: N(ctx?.overallSentiment) || N(player?.fan_profiles?.overall_sentiment) || 0,
      trendName,
      hasCommunityRitual,
      disrespectedStanCulture,
      sceneLoyaltyBias: Number(activeRegionBias?.loyaltyBias) || 0,
      sceneVolatilityBias: Number(activeRegionBias?.volatilityBias) || 0,
      activeTourRegion,
      careerStage: player?.career_stage ?? undefined,
      releaseCadence: (fandomRow as any)?.release_cadence ?? null,
      looptokAlgoState: (ctx as any)?.looptokAlgoState ?? 'neutral',
      looptokSuppressedStreak: (ctx as any)?.looptokSuppressedStreak ?? 0,
    };

    // ── Compute pillar effects ──────────────────────────────────────────────
    const pillarFx = computePillarEffects(fandom.identity_pillars || []);

    // ── Compute new fan_morale + brand_trust ────────────────────────────────
    const { nextMorale } = computeNextFanMorale(fandom.fan_morale, inputs, fandom);
    const { nextTrust } = computeNextBrandTrust(fandom.brand_trust, inputs, fandom, pillarFx);

    // ── Compute segment drift ───────────────────────────────────────────────
    const totalFans = N(player?.fans) || N(player?.followers) || 0;
    const updatedFandom = { ...fandom, fan_morale: nextMorale, brand_trust: nextTrust };
    const { deltas: segDeltas, flipEvents, updatedFandom: fandomUpdates } = computeSegmentDrift(
      segments, updatedFandom, inputs, pillarFx, totalFans,
    );
    const reconciledCounts = reconcileSegmentCounts(segments, segDeltas, totalFans);

    // ── Alignment scoring ─────────────────────────────────────────────────
    // Merge platform post action tags with any ctx.actionTags (deduplicated)
    const actionTags: string[] = [
      ...postActionTags,
      ...((ctx?.actionTags || []) as string[]),
    ].filter((v, i, arr) => arr.indexOf(v) === i);
    const alignmentResult = computeAlignmentForTick(
      fandom.alignment_score, actionTags, fandom.identity_pillars || [],
    );

    // ── Identity crisis check ────────────────────────────────────────────
    const crisisResult = checkIdentityCrisis(
      N(fandomRow?.misaligned_consecutive_ticks) || 0,
      alignmentResult.isMisaligned,
      !!(fandomRow?.identity_crisis_active),
      alignmentResult.newScore,
    );

    // ── Release cadence penalty (applied per-segment to streaming fatigue) ─
    const cadencePenalty = computeReleaseCadencePenalty((fandomRow as any)?.release_cadence, globalTurnId);

    // GAP-1 Task 2: Genre loyalty factor scales fatigue accumulation rate
    // Loyal genres (underground fanLoyaltyFactor=0.8) → 0.84x fatigue accum
    // Volatile genres (pop fanLoyaltyFactor=0.4) → 0.92x fatigue accum
    const genreTrait = getGenreTrait(player?.genre);
    const genreFatigueMult = 1 - genreTrait.fanLoyaltyFactor * 0.2;

    // ── Dark mode detection ─────────────────────────────────────────────
    const isDarkMode = fandomRow?.dark_mode_until != null && globalTurnId < N(fandomRow.dark_mode_until);
    const darkModeJustEnded = fandomRow?.dark_mode_until != null && globalTurnId === N(fandomRow.dark_mode_until);
    const darkModeDuration = darkModeJustEnded ? N(fandomRow.dark_mode_until) - N(fandomRow.dark_mode_started) : 0;
    // Comeback burst: 1.5x for 1-3 day dark, 2.0x for 3+ day dark
    const comebackStreamingMult = darkModeJustEnded ? (darkModeDuration >= 72 ? 2.0 : 1.5) : 1.0;

    // ── Apply deltas to segment counts + fatigue ─────────────────────────
    const SEGMENT_TYPES: SegmentType[] = ['og', 'core', 'casual', 'trend_chaser', 'stan', 'critic'];
    const LABOR_TYPES: LaborType[] = ['streaming', 'defense', 'promo', 'meme', 'clipping', 'toxicity'];
    const segmentPatches: Array<Record<string, unknown>> = [];

    for (const segType of SEGMENT_TYPES) {
      const current = segments[segType];
      const delta = segDeltas[segType] || 0;
      const newCount = reconciledCounts[segType] ?? Math.max(0, current.count + delta);

      // Raw labor output for this segment
      const labor = computeLaborOutput(
        { ...segments, [segType]: { ...current, count: newCount } },
        updatedFandom,
        pillarFx,
      );

      // Load existing fatigue from DB row or default
      const segRow = (segmentRows || []).find((r: any) => r.segment_type === segType);
      const currentFatigue: FatigueMap = (segRow?.fatigue as FatigueMap) || defaultFatigueMap();
      const rawLabor = labor[segType] || {} as Record<LaborType, number>;

      // ── Directive + Dark Mode: modify raw labor before fatigue pipeline ──
      const directive: string = (segRow?.directive as string) || 'steady';
      let laborMult = 1.0;
      if (isDarkMode)               laborMult = 0.0;
      else if (directive === 'push') laborMult = 1.3;
      else if (directive === 'rest') laborMult = 0.0;
      // Comeback burst: only affects streaming, only on the turn dark mode ends
      const streamingComebackMult = (darkModeJustEnded && !isDarkMode) ? comebackStreamingMult : 1.0;

      for (const lt of LABOR_TYPES) {
        rawLabor[lt] = Math.round(rawLabor[lt] * laborMult);
        if (lt === 'streaming') rawLabor[lt] = Math.round(rawLabor[lt] * streamingComebackMult);
      }

      // BUG FIX: Apply fatigue penalties FIRST using current fatigue state,
      // then advance fatigue using PENALIZED labor. Previously raw labor was used
      // for fatigue advance, meaning struck segments (output=0 after penalties)
      // still accumulated fatigue and could never recover — permanent deadlock.
      let penalizedLabor = applyFatiguePenalties(rawLabor, currentFatigue);

      // Advance fatigue based on PENALIZED output (struck segments now recover)
      // BUG FIX: Skip cadence fatigue bonus during 'rest' directive — rest is supposed
      // to recover fatigue, but the unconditional bonus (+10-25) overpowered the -8/tick
      // recovery, causing fatigue to INCREASE during rest for saturated players.
      const effectiveCadenceFatigueBonus = (directive === 'rest') ? 0 : cadencePenalty.streamingFatigueBonus;
      const { fatigue: newFatigue, strikeLabors, halvedLabors } = advanceSegmentFatigue(
        currentFatigue, penalizedLabor, effectiveCadenceFatigueBonus, genreFatigueMult,
      );

      // ── Directive + Dark Mode: modify fatigue post-advance ───────────────
      if (isDarkMode) {
        // Double recovery during dark mode: apply an extra -8 per labor type
        for (const lt of LABOR_TYPES) {
          newFatigue[lt] = Math.max(0, newFatigue[lt] - 8);
        }
      }
      if (directive === 'push' && !isDarkMode) {
        // Push segments fatigue faster on active labor types
        for (const lt of LABOR_TYPES) {
          if (penalizedLabor[lt] > 0) {
            newFatigue[lt] = Math.min(100, newFatigue[lt] + 3);
          }
        }
      }
      if (directive === 'rest' && !isDarkMode) {
        // Rest segments recover fatigue faster (mirrors dark mode recovery)
        for (const lt of LABOR_TYPES) {
          newFatigue[lt] = Math.max(0, newFatigue[lt] - 8);
        }
      }

      // Identity crisis: halve all labor during crisis
      if (crisisResult.penalties.laborOutputMult < 1) {
        for (const lt of Object.keys(penalizedLabor) as LaborType[]) {
          penalizedLabor[lt] = Math.floor(penalizedLabor[lt] * crisisResult.penalties.laborOutputMult);
        }
      }

      // Strike event notifications
      segmentPatches.push({
        player_id:     player.id,
        segment_type:  segType,
        count:         newCount,
        loyalty:       current.loyalty,
        morale:        current.morale,
        drift_rate:    current.drift_rate,
        fatigue:       newFatigue,
        labor_output:  penalizedLabor,
        tick_snapshot: globalTurnId,
        updated_at:    new Date().toISOString(),
      });
    }

    const laborBySegment: Record<string, Record<string, number>> = {};
    for (const sp of segmentPatches) {
      laborBySegment[sp.segment_type as string] = (sp.labor_output as Record<string, number>) || {};
    }

    // ── Compute toxicity score + platform effects ─────────────────────────
    // 1. Labor-based toxicity delta (positive = accumulate, negative = stan recovery)
    const toxicityDelta = netToxicity(laborBySegment as any);
    // 2. Apply labor delta, then passive band-based decay, clamp to [0, 100]
    const postDeltaToxicity = clamp(fandom.toxicity_score + toxicityDelta, 0, 100);
    const passiveDecay = getPassiveToxicityDecay(postDeltaToxicity);
    const newToxicity = clamp(postDeltaToxicity - passiveDecay, 0, 100);
    const toxicityFx = computeToxicityEffects(newToxicity);

    const finalTrust = clamp(nextTrust + toxicityFx.brandTrustPenalty, 0, 100);
    const finalMorale = clamp(nextMorale + toxicityFx.moralePenalty, 0, 100);

    const newMisalignedTicks = alignmentResult.isMisaligned
      ? N(fandomRow?.misaligned_consecutive_ticks) + 1
      : 0;

    // ── Compute aggregate labor pool ─────────────────────────────────────
    const laborPool = computeLaborPool(laborBySegment as any);
    const totalLaborPoints = Object.values(laborPool).reduce((s, v) => s + v, 0);

    const fandomPatch: Record<string, unknown> = {
      fan_morale:                         finalMorale,
      brand_trust:                        finalTrust,
      toxicity_score:                     newToxicity,
      alignment_score:                    alignmentResult.newScore,
      total_labor_points:                 totalLaborPoints,
      identity_crisis_active:             crisisResult.crisisTriggered || (!crisisResult.crisisCleared && !!(fandomRow?.identity_crisis_active)),
      misaligned_consecutive_ticks:       newMisalignedTicks,
      no_content_ticks:                   fandomUpdates.no_content_ticks ?? fandom.no_content_ticks,
      low_morale_consecutive_ticks:       fandomUpdates.low_morale_consecutive_ticks ?? fandom.low_morale_consecutive_ticks,
      trend_surf_streak:                  fandomUpdates.trend_surf_streak ?? fandom.trend_surf_streak,
      controversy_shadow:                 fandomUpdates.controversy_shadow ?? fandom.controversy_shadow,
      controversy_shadow_ticks_remaining: fandomUpdates.controversy_shadow_ticks_remaining ?? fandom.controversy_shadow_ticks_remaining,
      updated_tick:                       globalTurnId,
      updated_at:                         new Date().toISOString(),
    };

    // ── Dark mode: clear columns when dark mode Just ended this turn ───────
    if (darkModeJustEnded) {
      fandomPatch.dark_mode_until = null;
      fandomPatch.dark_mode_started = null;
    }

    // ── Toxicity platform notifications ──────────────────────────────────
    if (toxicityFx.platformWarning && !toxicityFx.platformBan) {
      flipEvents.push('toxicity_warning' as any);
    }
    if (toxicityFx.platformBan) {
      flipEvents.push('toxicity_ban' as any);
    }
    if (crisisResult.crisisTriggered) {
      flipEvents.push('identity_crisis_triggered' as any);
    }
    if (crisisResult.crisisCleared) {
      flipEvents.push('identity_crisis_cleared' as any);
    }
    if (darkModeJustEnded) {
      flipEvents.push('dark_mode_comeback' as any);
    }

    // ── Metrics snapshot (returned for commit phase) ─────────────────────
    const metricsSnapshot = {
      player_id: player.id,
      tick_number: globalTurnId,
      total_fans: totalFans,
      segment_breakdown: Object.fromEntries(
        segmentPatches.map(sp => [sp.segment_type, { count: sp.count, loyalty: sp.loyalty, morale: sp.morale }]),
      ),
      brand_trust: finalTrust,
      fan_morale: finalMorale,
      labor_outputs: laborPool,
      toxicity_score: newToxicity,
      active_controversies: N(ctx?.activeControversies),
      active_wars: N(ctx?.activeWars),
      alignment_score: alignmentResult.newScore,
      fandom_active_region: activeTourRegion,
      fandom_active_region_loyalty_bias: Number(activeRegionBias?.loyaltyBias) || 0,
      fandom_active_region_volatility_bias: Number(activeRegionBias?.volatilityBias) || 0,
    };

    // ── Build flip event notifications ──────────────────────────────────────
    const notifications: any[] = [];
    for (const evt of flipEvents) {
      const msg = FLIP_MESSAGES[evt];
      if (msg) {
        notifications.push({
          player_id:         player.id,
          global_turn_id:    globalTurnId,
          created_turn_index: globalTurnId,
          type:              'fandom_event',
          title:             msg.title,
          subtitle:          msg.subtitle,
          body:              msg.body,
          priority:          msg.priority || 'medium',
          idempotency_key:   `fandom-flip-${player.id}-${globalTurnId}-${evt}`,
        });
      }
    }

    return {
      success: true,
      fandomPatch,
      segmentPatches,
      notifications,
      metricsSnapshot,
      laborPool,
      events: flipEvents.map(evt => ({ type: evt, turn: globalTurnId })),
    };

  } catch (err: any) {
    console.error(`[FandomSegmentsModule] Error for ${player.id}:`, err);
    return { success: false, error: err?.message || String(err) };
  }
}

// ─── FLIP NOTIFICATION MESSAGES ──────────────────────────────────────────────

const FLIP_MESSAGES: Record<string, { title: string; subtitle: string; body: string; priority?: string }> = {
  og_silent_departure: {
    title: 'OG Fans Left Quietly',
    subtitle: 'Your earliest supporters are drifting away.',
    body: 'Your OG fans — the ones who were there from the start — have begun to leave. No drama, just silence. This is often the worst outcome.',
    priority: 'high',
  },
  core_controversy_flip: {
    title: 'Core Fans Pulling Back',
    subtitle: 'Unresolved controversy is eroding your foundation.',
    body: 'Some of your core fans have downgraded to casuals. If morale stays low, more will follow.',
    priority: 'high',
  },
  stan_cancellation: {
    title: 'Stans Have Flipped',
    subtitle: 'Your most intense fans are now your loudest critics.',
    body: "You disrespected your stan culture. They haven't left — they've turned against you. The cancel campaign has started.",
    priority: 'critical',
  },
  trend_chaser_exodus: {
    title: 'Trend Chasers Moved On',
    subtitle: 'You\'re no longer in the spotlight.',
    body: 'Your trend-chasing fans immediately followed the next trending artist. They were never loyal — just borrowing your shine.',
    priority: 'low',
  },
  scene_stronghold_surge: {
    title: 'Regional Stronghold Growing',
    subtitle: 'Your best touring region is hardening into a fandom base.',
    body: 'Strong local scene traction is converting more casual listeners into core supporters where your regional reputation is highest.',
    priority: 'medium',
  },
  scene_disconnect: {
    title: 'Regional Disconnect Showing',
    subtitle: 'Your current scene fit is not landing cleanly.',
    body: 'Weak regional scene alignment is softening some of your core support into casual attention. Your touring footprint needs stronger local fit or deeper reputation.',
    priority: 'medium',
  },
  critic_recovery: {
    title: 'Critics Are Coming Around',
    subtitle: 'Your apology tour is working.',
    body: "Some of your harshest critics have softened back to casuals. Keep the consistency up — they're watching.",
    priority: 'medium',
  },
  toxicity_warning: {
    title: 'Platform Warning ⚠️',
    subtitle: 'Toxicity level at 60+',
    body: 'Platforms are flagging your fanbase for toxic behavior. Brand trust is taking a hit. If it hits 80, expect temporary bans.',
    priority: 'high',
  },
  toxicity_ban: {
    title: 'Platform Ban Active 🚫',
    subtitle: 'Toxicity hit 80+',
    body: 'Your fanbase has been temporarily restricted on major platforms. Social media reach is severely reduced. Brand trust and morale are tanking.',
    priority: 'critical',
  },
  identity_crisis_triggered: {
    title: 'Identity Crisis!',
    subtitle: 'Your fanbase is confused.',
    body: 'Too many misaligned actions have triggered an identity crisis. Labor output is halved and morale is dropping until your alignment recovers above 50.',
    priority: 'critical',
  },
  identity_crisis_cleared: {
    title: 'Identity Restored',
    subtitle: 'Your fans know who you are again.',
    body: 'Your alignment score has recovered. The identity crisis is over — labor output is back to normal.',
    priority: 'medium',
  },
  dark_mode_comeback: {
    title: 'The Comeback Is ON 🔥',
    subtitle: 'You\'re back. The timeline noticed.',
    body: 'Your dark period is over and your fans are fired up. Streaming labor is boosted this turn — make it count.',
    priority: 'high',
  },
};
