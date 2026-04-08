/**
 * BRAND DEALS MODULE v2 (Turn Engine — Order 4.8)
 * Complete contract-based system with per-turn payouts, payout log idempotency,
 * exclusivity enforcement, overexposure penalties, KPI tracking, and cancellation risk.
 *
 * Data flow:
 *  1. Expire old offers (brand_deals where expires_turn < turn_id)
 *  2. Process active contracts (brand_deal_contracts where status='active'):
 *     a. Pay per-turn fee (idempotent via brand_deal_payout_log unique constraint)
 *     b. Update KPI progress from social account metrics
 *     c. Check cancellation risk (trend-aware, overexposure-aware)
 *     d. Complete contracts that reached end_turn_id
 *     e. Pay performance bonus if KPIs met (idempotent)
 *  3. Generate new offers (stage-gated, region-aware, archetype-aware, trend-aware)
 *  4. Update player_brand_stats (overexposure, reputation, totals)
 *
 * Idempotency:
 *  - brand_deal_payout_log: UNIQUE(contract_id, turn_id, payout_type)
 *  - Signing bonus: payout_type='signing', paid only once per contract
 *  - Per-turn fee: payout_type='per_turn', one per contract per turn
 *  - Performance bonus: payout_type='bonus', one per contract lifetime
 *  - All payouts use upsert with onConflict to prevent double-pay on retry
 *
 * Separation:
 *  - brand_deal_revenue is its own bucket in turn_metrics
 *  - Never mixed with VidWave ad revenue, social revenue, or streaming revenue
 *  - Appears as distinct line item in turn recap notifications
 *
 * Architecture:
 *  - Returns deltas only; NO direct entity writes (commit phase owns writes)
 */

// ─── Imports ────────────────────────────────────────────────────────────────
import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import {
  generateOffer,
  shouldGenerateOffers,
  offerCount,
  calculateOverexposure,
  evaluateKPIs,
  shouldCancel,
  calculatePlatformPayout,
  TIER_MAPPING,
  REVERSE_TIER_MAPPING,
  CATEGORY_MAPPING,
  PLATFORM_PAYOUT_CONFIGS,
  reputationFromTrends,
  seededRandom,
  MAX_CONCURRENT_CONTRACTS,
  OFFER_TTL_TURNS,
  MAX_ACTIVE_OFFERS,
  clampLoyaltyScore,
  getBrandLoyaltyTier,
  checkAmbassadorGates,
  shouldGenerateAmbassadorOffer,
  generateAmbassadorOffer,
  type OfferParams,
  type GeneratedOffer,
  type PlatformScope,
  type BrandLoyaltyTier,
  computeLaneFitBonus,
  computeLanePayoutMultiplier,
  computeMoodCategoryBonus,
} from './brandDealsMath.ts';
import {
  computeMarketingPersona,
  computePersonaFitScore,
  type PersonaInput,
  type PersonaResult,
} from './marketingPersona.ts';
import { safeNum, safeSponsoredUpliftForRow } from './sponsorshipAnalytics.ts';
import { getScaledFocusModifiers, computeBrandDealOfferMultiplier } from './eraIdentity.ts';
import { buildBrandDealPayoutIdempotencyKey, type BrandDealPayoutType } from './constants/idempotency.ts';

function N(v: unknown): number { return Number(v) || 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

const CONTRACT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  BREACHED: 'breached',
  CANCELLED: 'cancelled',
} as const;

const DEBUG = (globalThis as any)?.Deno?.env?.get?.('BRAND_DEALS_DEBUG') === '1';
function debugLog(...args: any[]) { if (DEBUG) console.log('[BRAND_DEALS]', ...args); }

const LOYALTY_OUTCOME_DELTA: Record<string, number> = {
  completed: 1,
  breached: -2,
  cancelled: -1,
};

const AMBASSADOR_LOYALTY_OUTCOME_DELTA: Record<string, number> = {
  completed: 3,
  breached: -5,
  cancelled: -3,
};

const LOYALTY_APPEARANCE_MULTIPLIER: Record<BrandLoyaltyTier, number> = {
  cold: 0.5,
  neutral: 1.0,
  warm: 1.15,
  favored: 1.3,
  elite: 1.5,
};

const LOYALTY_PERSONA_BUMP: Partial<Record<BrandLoyaltyTier, number>> = {
  warm: 0.05,
  favored: 0.08,
  elite: 0.12,
};

function describeSceneStrength(label: string | null | undefined): string {
  if (label === 'strong') return 'Strong scene credibility';
  if (label === 'solid') return 'Solid scene traction';
  if (label === 'weak') return 'Early scene traction';
  return 'Scene presence';
}

function normalizeBrandKey(brandName: unknown): string {
  return String(brandName || '').trim().toLowerCase();
}

function getBreachPenaltyProfile(contract: any): { extraReputationPenalty: number; extraSafetyPenalty: number; shouldBroadcast: boolean } {
  const isAmb = contract?.deal_type === 'ambassador';
  const tier = String(contract?.tier || '').toLowerCase();
  if (isAmb) {
    // Ambassador breaches are always high-profile — 2x luxury penalties
    return { extraReputationPenalty: 0.10, extraSafetyPenalty: 8, shouldBroadcast: true };
  }
  if (tier === 'luxury') {
    return { extraReputationPenalty: 0.05, extraSafetyPenalty: 5, shouldBroadcast: true };
  }
  if (tier === 'global') {
    return { extraReputationPenalty: 0.03, extraSafetyPenalty: 3, shouldBroadcast: true };
  }
  return { extraReputationPenalty: 0, extraSafetyPenalty: 0, shouldBroadcast: false };
}

// ─── Main export: turn engine module ────────────────────────────────────────
export async function processBrandDealsForPlayer(
  player: any,
  fanProfile: any,
  globalTurnId: number,
  entities: any,
  ctx: any = {}
) {
  debugLog(`START player=${player.id} turn=${globalTurnId}`);
  const pid = player.id;
  const platform = 'all';
  const now = new Date().toISOString();

  // Delta accumulators (commit phase writes these)
  const brandDealUpdates: { id: string; patch: Record<string, any> }[] = [];
  const brandDealCreates: any[] = [];
  const contractUpdates: { id: string; patch: Record<string, any> }[] = [];
  const payoutLogInserts: any[] = [];
  const playerBrandStatsUpserts: any[] = [];
  const playerBrandAffinityUpserts: any[] = [];
  const turnEvents: any[] = [];
  const notifications: any[] = [];
  let brandDealRevenue = 0;
  let brandDealBonusRevenue = 0;
  let brandDealPenalties = 0;
  let signingBonusRevenue = 0;
  let royaltyRevenue = 0;
  let dealsCompletedThisTurn = 0;
  let dealsCancelledThisTurn = 0;
  let dealsBreachedThisTurn = 0;
  let extraBreachReputationPenalty = 0;
  let extraBreachSafetyPenalty = 0;

  try {
    const supabase = supabaseAdmin;

    // ── Load player brand stats ───────────────────────────────────────────
    const { data: statsRows } = await supabase
      .from('player_brand_stats')
      .select('*')
      .eq('artist_id', pid)
      .eq('platform', platform)
      .limit(1);
    const stats = statsRows?.[0] || null;

    let affinityRows: any[] | null = null;
    const prefetchedAffinity = ctx?.prefetchData?.playerBrandAffinityByPlayer?.get(pid);
    if (prefetchedAffinity) {
      affinityRows = prefetchedAffinity;
    } else {
      const { data } = await supabase
        .from('player_brand_affinity')
        .select('*')
        .eq('player_id', pid);
      affinityRows = data;
    }
    const affinityByBrand = new Map<string, any>((affinityRows || []).map((row: any) => [String(row.brand_key || '').toLowerCase(), row]));

    const applyLoyaltyOutcome = async (contract: any, eventType: 'completed' | 'breached' | 'cancelled') => {
      const brandKey = normalizeBrandKey(contract.brand_key || contract.brand_name);
      if (!brandKey) return false;

      const { data: eventRows, error: eventErr } = await supabase
        .from('brand_loyalty_event_log')
        .upsert({
          contract_id: contract.id,
          event_type: eventType,
          player_id: pid,
          brand_key: brandKey,
          turn_id: globalTurnId,
        }, { onConflict: 'contract_id,event_type', ignoreDuplicates: true })
        .select('id');

      if (eventErr) throw eventErr;
      if (!eventRows || eventRows.length === 0) return false;

      const previous: Record<string, any> = affinityByBrand.get(brandKey) || {};
      const prevScore = clampLoyaltyScore(safeNum(previous.affinity_score, 0));
      const isAmbassadorContract = contract.deal_type === 'ambassador';
      const loyaltyDelta = isAmbassadorContract
        ? safeNum(AMBASSADOR_LOYALTY_OUTCOME_DELTA[eventType], 0)
        : safeNum(LOYALTY_OUTCOME_DELTA[eventType], 0);
      const nextScore = clampLoyaltyScore(prevScore + loyaltyDelta);
      const nextRow = {
        player_id: pid,
        brand_key: brandKey,
        affinity_score: nextScore,
        completed_count: safeNum(previous.completed_count, 0) + (eventType === 'completed' ? 1 : 0),
        breached_count: safeNum(previous.breached_count, 0) + (eventType === 'breached' ? 1 : 0),
        cancelled_count: safeNum(previous.cancelled_count, 0) + (eventType === 'cancelled' ? 1 : 0),
        last_contract_turn_id: globalTurnId,
        updated_at: now,
      };

      playerBrandAffinityUpserts.push(nextRow);
      affinityByBrand.set(brandKey, nextRow);
      return true;
    };

    // ── Load active trends from fan_profiles ──────────────────────────────
    // ctx.careerTrend is a single string from the runtime; fanProfile.career_trends is a
    // JSONB object { TREND_NAME: boolean }. Extract the active keys when falling back.
    const activeTrends: string[] = ctx?.careerTrend
      ? [ctx.careerTrend]
      : Object.entries(fanProfile?.career_trends || {}).filter(([, v]) => !!v).map(([k]) => k);

    // ── Load region share from fan_profiles ───────────────────────────────
    const regionShare: Record<string, number> = fanProfile?.region_share || {};

    // ── Load canonical marketing audience mix from fandom selectors ───────
    const marketingAudienceMix = ctx?.fandomModifiers?.marketingAudienceMix || {
      stans: 0,
      core: 0,
      casual: 0,
      trend: 0,
    };
    const archetypeShare: Record<string, number> = { ...marketingAudienceMix };

    // ── Compute reputation modifier: persisted base + trend adjustments ──
    const trendReputationMult = reputationFromTrends(activeTrends);
    const persistedRepBase = N(stats?.reputation_modifier ?? 1.0);
    const reputationModifier = clamp(persistedRepBase * trendReputationMult, 0.5, 1.4);
    const industryPerception = ctx?.industryPerceptionModifiers || null;
    const trendBrandDealChanceAdj = Math.max(0.85, Math.min(1.20, Number(ctx?.careerTrendEffects?.brandDealChanceAdj) || 1));
    const brandDealInfluence = Math.max(0.85, Math.min(1.15, N(industryPerception?.influenceCaps?.brandDealsInfluenceMult) || 1));
    const affinityRowsForBonus = Array.from(affinityByBrand.values());
    const positiveAffinityAverage = affinityRowsForBonus.length > 0
      ? affinityRowsForBonus.reduce((sum: number, row: any) => sum + Math.max(0, safeNum(row?.affinity_score, 0)), 0) / affinityRowsForBonus.length
      : 0;
    let personaResult: PersonaResult | null = null;

    // ── Load active contracts ─────────────────────────────────────────────
    let contracts: any[] = [];
    const prefetchedContracts = ctx?.prefetchData?.brandDealContractsByPlayer?.get(pid);
    if (prefetchedContracts) {
      contracts = prefetchedContracts.filter((c: any) => c.status === CONTRACT_STATUS.ACTIVE);
    } else {
      const { data: activeContracts } = await supabase
        .from('brand_deal_contracts')
        .select('*')
        .eq('player_id', pid)
        .eq('status', CONTRACT_STATUS.ACTIVE);
      contracts = activeContracts || [];
    }
    debugLog(`Loaded ${contracts.length} active contracts`);

    // ── Compute overexposure ──────────────────────────────────────────────
    const overexposureScore = calculateOverexposure(contracts);

    // ── Load social account for KPI progress ──────────────────────────────
    const { data: socialAccounts } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('artist_id', pid)
      .eq('platform', 'instavibe')
      .limit(1);
    const socialAccount = socialAccounts?.[0] || null;

    const { data: activeEraRows } = await supabase
      .from('eras')
      .select('focus_path, identity_alignment_score, is_experimental')
      .eq('artist_id', pid)
      .eq('is_active', true)
      .limit(1);
    const activeEra = activeEraRows?.[0] || null;

    // ── 1. EXPIRE old offers (all platforms — not filtered by single platform) ─
    const { data: expirableOffers } = await supabase
      .from('brand_deals')
      .select('id, brand_name, deal_type, payout, expires_turn, platform')
      .eq('artist_id', pid)
      .eq('status', 'offered')
      .lt('expires_turn', globalTurnId);

    const expiredOffers = expirableOffers || [];
    for (const deal of expiredOffers) {
      brandDealUpdates.push({ id: deal.id, patch: { status: 'expired', updated_at: now } });
    }
    if (expiredOffers.length > 0) {
      turnEvents.push({
        global_turn_id: globalTurnId, player_id: pid, module: 'brand_deals',
        event_type: 'brand_deal_expired',
        description: `${expiredOffers.length} offer(s) expired`,
        metadata: { count: expiredOffers.length, deal_ids: expiredOffers.map((d: any) => d.id) },
      });
      notifications.push(buildExpiredNotif(pid, globalTurnId, expiredOffers));
    }

    // ── 2. PROCESS active contracts ───────────────────────────────────────
    const completedNames: string[] = [];
    const cancelledNames: string[] = [];
    const breachedNames: string[] = [];
    const broadcastBreachNames: string[] = [];

    // Load existing payout log for this turn to check idempotency
    const { data: existingPayouts } = await supabase
      .from('brand_deal_payout_log')
      .select('contract_id, payout_type, idempotency_key')
      .eq('player_id', pid)
      .or(`turn_id.eq.${globalTurnId},payout_type.in.(signing,bonus,deliverable)`);
    const paidThisTurn = new Set((existingPayouts || []).map((p: any) => `${p.contract_id}:${p.payout_type}`));
    const paidByIdempotencyKey = new Set((existingPayouts || []).map((p: any) => String(p.idempotency_key || '')).filter(Boolean));

    const appendPayout = (contract: any, payoutType: BrandDealPayoutType, amount: number, reason: string, metadata: Record<string, any> = {}, options: { deliverableId?: string; milestoneId?: string } = {}) => {
      const idempotencyKey = buildBrandDealPayoutIdempotencyKey({
        playerId: pid,
        contractId: contract.id,
        offerId: contract.offer_id,
        payoutType,
        globalTurnId,
        deliverableId: options.deliverableId,
        milestoneId: options.milestoneId,
      });
      if (paidByIdempotencyKey.has(idempotencyKey)) return false;
      paidByIdempotencyKey.add(idempotencyKey);

      payoutLogInserts.push({
        contract_id: contract.id,
        player_id: pid,
        turn_id: globalTurnId,
        payout_type: payoutType,
        amount,
        idempotency_key: idempotencyKey,
        reason,
        metadata: {
          ...metadata,
          reason,
          idempotency_key: idempotencyKey,
          payout_category: payoutType === 'per_turn' ? 'stipend' : payoutType,
        },
      });

      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: pid,
        module: `brand_deals:payout:${idempotencyKey}`,
        event_type: 'BRAND_DEAL_PAYOUT',
        description: `Brand deal payout: ${reason}`,
        metadata: {
          idempotency_key: idempotencyKey,
          source_module: 'brand_deals',
          deal_id: contract.offer_id || null,
          contract_id: contract.id,
          payout_type: payoutType,
          amount,
          reason,
          global_turn_id: globalTurnId,
        },
      });
      return true;
    };

    for (const contract of contracts) {
      const cid = contract.id;
      const isWithinTerm = globalTurnId >= contract.start_turn_id && globalTurnId <= contract.end_turn_id;
      const isPastEnd = globalTurnId > contract.end_turn_id;

      // 2a. Signing bonus (once, on first turn of contract)
      if (!contract.signing_bonus_paid && contract.signing_bonus > 0 && !paidThisTurn.has(`${cid}:signing`)) {
        const amount = N(contract.signing_bonus);
        const added = appendPayout(contract, 'signing', amount, 'contract_signing_bonus', { brand_name: contract.brand_name });
        if (added) {
          signingBonusRevenue += amount;
          brandDealRevenue += amount;
          contractUpdates.push({ id: cid, patch: { signing_bonus_paid: true, total_paid_to_date: N(contract.total_paid_to_date) + amount, updated_at: now } });
        }
      }

      // 2b. Per-turn fee (idempotent: one per contract per turn)
      if (isWithinTerm && contract.per_turn_fee > 0 && !paidThisTurn.has(`${cid}:per_turn`)) {
        const platformMult = N(contract.platform_multiplier) || 1.0;
        const amount = Math.round(N(contract.per_turn_fee) * platformMult);
        const added = appendPayout(contract, 'per_turn', amount, 'contract_turn_stipend', {
          brand_name: contract.brand_name,
          turn_of_contract: globalTurnId - contract.start_turn_id + 1,
        });
        if (added) {
          brandDealRevenue += amount;
          // Update total_paid_to_date (additive — will be resolved in commit)
          const existingUpdate = contractUpdates.find(u => u.id === cid);
          if (existingUpdate) {
            existingUpdate.patch.total_paid_to_date = N(existingUpdate.patch.total_paid_to_date || contract.total_paid_to_date) + amount;
          } else {
            contractUpdates.push({ id: cid, patch: { total_paid_to_date: N(contract.total_paid_to_date) + amount, updated_at: now } });
          }
        }
      }

      // 2b½. Ambassador royalty payout (% of previous turn's streaming + merch revenue)
      if (isWithinTerm && contract.deal_type === 'ambassador' && N(contract.metadata?.royalty_pct) > 0) {
        const royaltyPct = N(contract.metadata.royalty_pct) / 100;
        // Query previous turn's recap for revenue base (brand deals run before turnProcessorCore)
        let royaltyBase = 0;
        try {
          const { data: prevRecap } = await supabase
            .from('notifications')
            .select('metrics')
            .eq('player_id', pid)
            .eq('type', 'TURN_RECAP')
            .lt('global_turn_id', globalTurnId)
            .order('global_turn_id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prevRecap?.metrics) {
            royaltyBase = N(prevRecap.metrics.streaming_revenue) + N(prevRecap.metrics.merch_revenue);
          }
        } catch { /* non-critical — royalty skipped if no recap */ }

        if (royaltyBase > 0) {
          const royaltyAmount = Math.round(royaltyBase * royaltyPct);
          if (royaltyAmount > 0) {
            const added = appendPayout(contract, 'royalty', royaltyAmount, 'ambassador_royalty', {
              brand_name: contract.brand_name,
              royalty_pct: contract.metadata.royalty_pct,
              royalty_base: royaltyBase,
              turn_of_contract: globalTurnId - contract.start_turn_id + 1,
            });
            if (added) {
              brandDealRevenue += royaltyAmount;
              royaltyRevenue += royaltyAmount;
              const existingUpdate = contractUpdates.find(u => u.id === cid);
              if (existingUpdate) {
                existingUpdate.patch.total_paid_to_date = N(existingUpdate.patch.total_paid_to_date || contract.total_paid_to_date) + royaltyAmount;
              } else {
                contractUpdates.push({ id: cid, patch: { total_paid_to_date: N(contract.total_paid_to_date) + royaltyAmount, updated_at: now } });
              }
            }
          }
        }
      }

      // 2c. KPI progress update — platform-aware
      if (isWithinTerm) {
        const kpiProgress: Record<string, number> = { ...(contract.kpi_progress || {}) };
        const contractPlatforms: string[] = contract.platform_scope || ['instavibe'];
        const includesVidWave = contractPlatforms.includes('vidwave');
        const includesInstaVibe = contractPlatforms.includes('instavibe');

        let totalPostCount = 0;
        let totalEngagement = 0;
        let totalViews = 0;

        // Pull InstaVibe metrics when relevant
        if (includesInstaVibe && socialAccount) {
          const { count: ivPostCount } = await supabase
            .from('social_posts')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', pid)
            .eq('platform', 'instavibe')
            .gte('created_at', contract.created_at);
          totalPostCount += (ivPostCount || 0);
          totalEngagement += N(socialAccount.total_engagement);
          totalViews += N(socialAccount.total_views);
        }

        // Pull VidWave metrics from sponsored_content + vidwave_video_state when relevant
        if (includesVidWave) {
          // Count sponsored VidWave videos linked to this contract
          const { count: sponsoredVideoCount } = await supabase
            .from('sponsored_content')
            .select('id', { count: 'exact', head: true })
            .eq('contract_id', cid)
            .eq('platform', 'vidwave');
          totalPostCount += (sponsoredVideoCount || 0);

          // Get VidWave social account for aggregate metrics
          const { data: vwAccounts } = await supabase
            .from('social_accounts')
            .select('total_engagement, total_views')
            .eq('artist_id', pid)
            .eq('platform', 'vidwave')
            .limit(1);
          const vwAccount = vwAccounts?.[0];
          if (vwAccount) {
            // For VidWave contracts, also aggregate views/engagement from sponsored videos specifically
            const { data: sponsoredContentIds } = await supabase
              .from('sponsored_content')
              .select('content_id')
              .eq('contract_id', cid)
              .eq('platform', 'vidwave');
            if (sponsoredContentIds && sponsoredContentIds.length > 0) {
              const contentIds = sponsoredContentIds.map((sc: any) => sc.content_id);
              const { data: videoStates } = await supabase
                .from('vidwave_video_state')
                .select('lifetime_views, lifetime_likes, lifetime_comments, lifetime_shares')
                .in('post_id', contentIds);
              for (const vs of videoStates || []) {
                totalViews += N(vs.lifetime_views);
                totalEngagement += N(vs.lifetime_likes) + N(vs.lifetime_comments) + N(vs.lifetime_shares);
              }
            }
          }
        }

        kpiProgress.required_posts = totalPostCount;
        kpiProgress.required_engagement_rate = totalEngagement / Math.max(1, totalViews) * 100;
        kpiProgress.required_reach = totalViews;

        const existingUpdate = contractUpdates.find(u => u.id === cid);
        if (existingUpdate) {
          existingUpdate.patch.kpi_progress = kpiProgress;
        } else {
          contractUpdates.push({ id: cid, patch: { kpi_progress: kpiProgress, updated_at: now } });
        }
      }

      // 2d. Cancellation check (only for in-term contracts)
      if (isWithinTerm) {
        const cancelResult = shouldCancel(contract, overexposureScore, activeTrends, globalTurnId * 1000 + cid.charCodeAt(0), globalTurnId);
        if (cancelResult.cancel) {
          const existingUpdate = contractUpdates.find(u => u.id === cid);
          const cancelPatch: Record<string, any> = {
            status: CONTRACT_STATUS.CANCELLED, cancellation_reason: cancelResult.reason,
            cancelled_turn_id: globalTurnId, updated_at: now,
          };
          if (existingUpdate) Object.assign(existingUpdate.patch, cancelPatch);
          else contractUpdates.push({ id: cid, patch: cancelPatch });

          // Also update the original offer status
          if (contract.offer_id) {
            brandDealUpdates.push({ id: contract.offer_id, patch: { status: 'cancelled', updated_at: now } });
          }
          dealsCancelledThisTurn++;
          cancelledNames.push(contract.brand_name);

          await applyLoyaltyOutcome(contract, 'cancelled');
          continue; // Skip completion check for cancelled contracts
        }
      }

      // 2e. Completion check
      if (isPastEnd) {
        // Evaluate KPIs for bonus
        const kpiResult = evaluateKPIs(contract.kpis || {}, contract.kpi_progress || {});
        const existingUpdate = contractUpdates.find(u => u.id === cid);
        const completePatch: Record<string, any> = {
          status: kpiResult.met ? CONTRACT_STATUS.COMPLETED : CONTRACT_STATUS.BREACHED,
          met_kpis: kpiResult.met,
          updated_at: now,
        };
        if (existingUpdate) Object.assign(existingUpdate.patch, completePatch);
        else contractUpdates.push({ id: cid, patch: completePatch });

        // Performance bonus if KPIs met (idempotent)
        if (kpiResult.met && contract.performance_bonus > 0 && !paidThisTurn.has(`${cid}:bonus`)) {
          const amount = N(contract.performance_bonus);
          const added = appendPayout(contract, 'bonus', amount, 'kpi_performance_bonus', {
            brand_name: contract.brand_name,
            kpi_result: kpiResult,
          }, {
            milestoneId: 'contract_completion',
          });
          if (added) {
            brandDealBonusRevenue += amount;
            brandDealRevenue += amount;
          }
        }

        // Update original offer status
        if (contract.offer_id) {
          brandDealUpdates.push({ id: contract.offer_id, patch: { status: kpiResult.met ? CONTRACT_STATUS.COMPLETED : CONTRACT_STATUS.BREACHED, completed_turn: globalTurnId, updated_at: now } });
        }

        await applyLoyaltyOutcome(contract, kpiResult.met ? 'completed' : 'breached');

        if (kpiResult.met) {
          dealsCompletedThisTurn++;
          completedNames.push(contract.brand_name);
        } else {
          dealsBreachedThisTurn++;
          breachedNames.push(contract.brand_name);
          const breachPenalty = getBreachPenaltyProfile(contract);
          extraBreachReputationPenalty += breachPenalty.extraReputationPenalty;
          extraBreachSafetyPenalty += breachPenalty.extraSafetyPenalty;
          if (breachPenalty.shouldBroadcast) {
            broadcastBreachNames.push(contract.brand_name);
          }
        }
      }
    }

    // ── 3. GENERATE new offers (count across all platforms) ────────────────
    const { data: currentOffers } = await supabase
      .from('brand_deals')
      .select('id')
      .eq('artist_id', pid)
      .eq('status', 'offered');
    const currentOfferCount = currentOffers?.length || 0;

    if (shouldGenerateOffers(globalTurnId, currentOfferCount)) {
      const params: OfferParams = {
        followers: N(player.fans ?? player.followers),
        clout: N(player.clout),
        hype: N(player.hype),
        careerStage: player.career_stage || 'Unknown',
        genre: player.genre || '',
        regionShare,
        archetypeShare,
        activeTrends,
        activeContractCount: contracts.length,
        overexposureScore,
        reputationModifier: reputationModifier * brandDealInfluence * trendBrandDealChanceAdj * (1 + (N(ctx?.brandQualityModifier) || 0)),
        safetyRating: clamp((N(industryPerception?.brandSafety) || N(stats?.brand_safety_rating ?? 50)), 0, 100),
        festivalBrandBoost: (stats?.festival_boost_expires_turn != null && globalTurnId <= N(stats.festival_boost_expires_turn))
          ? N(stats.festival_brand_boost ?? 0)
          : 0,
        sceneReputationBoost: N(ctx?.sceneReputationBoost ?? 0),
        strongestSceneRegion: String(ctx?.strongestSceneRegion || '').trim() || null,
        strongestSceneReputation: N(ctx?.strongestSceneReputation ?? 0),
        strongestSceneLabel: ctx?.strongestSceneLabel || null,
        preferredSceneRegions: Array.isArray(ctx?.preferredSceneRegions) ? ctx.preferredSceneRegions : [],
        fanMorale: typeof ctx?.fanMorale === 'number' ? ctx.fanMorale : 50,
        brandTrust: typeof ctx?.brandTrust === 'number' ? ctx.brandTrust : 50,
      };

      // ── Compute marketing persona for offer alignment ──────────────
      try {
        // Load social post stats for persona computation
        const { data: postStats } = await supabase
          .from('social_posts')
          .select('engagement_rate, views, is_viral')
          .eq('artist_id', pid)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(50);
        const posts = postStats || [];
        const totalPosts = posts.length;
        const avgEngagement = totalPosts > 0 ? posts.reduce((s: number, p: any) => s + N(p.engagement_rate), 0) / totalPosts : 0;
        const avgViews = totalPosts > 0 ? posts.reduce((s: number, p: any) => s + N(p.views), 0) / totalPosts : 0;
        const viralCount = posts.filter((p: any) => p.is_viral).length;

        const personaInput: PersonaInput = {
          careerStage: player.career_stage || 'Unknown',
          followers: N(player.fans ?? player.followers),
          clout: N(player.clout),
          hype: N(player.hype),
          income: N(player.income),
          genre: player.genre || '',
          region: player.region || '',
          monthlyListeners: N(fanProfile?.monthly_listeners),
          retentionRate: N(fanProfile?.retention_rate),
          listenerGrowthTrend: N(fanProfile?.listener_growth_trend),
          careerTrends: fanProfile?.career_trends || {},
          stans: N(marketingAudienceMix.stans),
          core: N(marketingAudienceMix.core),
          casual: N(marketingAudienceMix.casual),
          trend: N(marketingAudienceMix.trend),
          overallSentiment: N(fanProfile?.overall_sentiment),
          regionShare,
          totalPosts,
          avgEngagementRate: avgEngagement,
          avgViews: avgViews,
          viralPostCount: viralCount,
        };
        personaResult = computeMarketingPersona(personaInput);
        debugLog(`Persona computed: primary=${personaResult.primary_persona} confidence=${personaResult.confidence_score}`);
      } catch (personaErr: unknown) {
        console.warn('[BrandDeals] Persona computation failed (non-fatal):', personaErr instanceof Error ? personaErr.message : String(personaErr));
      }

      const slotsAvailable = MAX_ACTIVE_OFFERS - currentOfferCount;
      const baseOfferCount = offerCount(params, globalTurnId * 100 + pid.charCodeAt(0));
      const alignmentScore = clamp(N(activeEra?.identity_alignment_score || 50), 0, 100);
      const { modifiers: eraFocusModifiers } = getScaledFocusModifiers(activeEra?.focus_path || null, alignmentScore);
      const offerChanceMult = computeBrandDealOfferMultiplier(alignmentScore, N(eraFocusModifiers.brand_deal_affinity_delta));
      const eraOfferCount = Math.round(baseOfferCount * offerChanceMult);
      const loyaltyRows = Array.from(affinityByBrand.values());
      const avgAppearanceMult = loyaltyRows.length > 0
        ? loyaltyRows.reduce((sum: number, row: any) => sum + (LOYALTY_APPEARANCE_MULTIPLIER[getBrandLoyaltyTier(clampLoyaltyScore(N(row.affinity_score)))] || 1), 0) / loyaltyRows.length
        : 1;
      const loyaltyCountBump = avgAppearanceMult > 1 ? 1 : 0;
      const count = Math.min(eraOfferCount + loyaltyCountBump, slotsAvailable);

      if (count > 0) {
        const brandAffinityWeights = new Map<string, number>();
        const brandLoyaltyTiers = new Map<string, BrandLoyaltyTier>();
        for (const row of affinityByBrand.values() as Iterable<any>) {
          const brandKey = normalizeBrandKey(row.brand_key);
          const affinityScore = clampLoyaltyScore(safeNum(row.affinity_score, 0));
          brandAffinityWeights.set(brandKey, affinityScore);
          brandLoyaltyTiers.set(brandKey, getBrandLoyaltyTier(affinityScore));
        }

        // Generate offers in batch to handle async database calls
        const offers: GeneratedOffer[] = [];
        for (let i = 0; i < count; i++) {
          const offer = await generateOffer(params, globalTurnId, i);
          offers.push(offer);
        }

        for (let i = 0; i < offers.length; i++) {
          const offer = offers[i];
          if (activeEra?.is_experimental) {
            const polarRoll = seededRandom(globalTurnId * 19000 + i * 31 + pid.charCodeAt(0));
            if (polarRoll < 0.2) continue;
            if (polarRoll > 0.86) {
              if (offer.tier === 'local') offer.tier = 'regional';
              else if (offer.tier === 'regional') offer.tier = 'national';
              else if (offer.tier === 'national') offer.tier = 'global';
            }
          }

          const brandKey = normalizeBrandKey(offer.brand_name);
          const affinityScore = clampLoyaltyScore(safeNum(brandAffinityWeights.get(brandKey), 0));
          const loyaltyTier = brandLoyaltyTiers.get(brandKey) || getBrandLoyaltyTier(affinityScore);

          const appearanceMult = LOYALTY_APPEARANCE_MULTIPLIER[loyaltyTier] || 1;
          const appearanceRoll = seededRandom(globalTurnId * 10000 + i * 17 + pid.charCodeAt(0));
          if (appearanceMult < 1 && appearanceRoll > appearanceMult) continue;

          const tierNudgeRoll = seededRandom(globalTurnId * 17000 + i * 29 + pid.charCodeAt(0));
          if ((loyaltyTier === 'favored' || loyaltyTier === 'elite') && tierNudgeRoll < 0.08) {
            if (offer.tier === 'local') offer.tier = 'regional';
            else if (offer.tier === 'regional') offer.tier = 'national';
            else if (offer.tier === 'national') offer.tier = 'global';
            else if (offer.tier === 'global') offer.tier = 'luxury';
          }

          // Compute persona fit for this offer's category
          const fit = personaResult
            ? computePersonaFitScore(personaResult, offer.category)
            : { score: 0.5, reasons: ['Persona unavailable'], affinity_tags: [] };

          // Audience tags boost: if brand's audience_tags match player's dominant archetypes
          let audienceTagBoost = 0;
          if (offer.audience_tags && Object.keys(offer.audience_tags).length > 0) {
            const archetypeShare = params.archetypeShare || {};
            for (const [archetype, weight] of Object.entries(offer.audience_tags)) {
              const playerPct = safeNum(archetypeShare[archetype] ?? archetypeShare[archetype.toLowerCase()], 0);
              if (playerPct > 10) { // Only boost if archetype is significant (>10%)
                audienceTagBoost += (Number(weight) - 1) * (playerPct / 100) * 0.15;
              }
            }
            audienceTagBoost = clamp(audienceTagBoost, -0.1, 0.15);
          }

          const affinityFitBump = LOYALTY_PERSONA_BUMP[loyaltyTier] ?? (affinityScore < 0 ? Math.max(-0.08, affinityScore * 0.01) : 0);

          // Career lane fit bonus: dominant + secondary lanes boost aligned categories
          const laneFitBonus = computeLaneFitBonus(ctx?.careerLaneData, offer.category);
          // Algorithm mood bonus: current mood favors certain categories
          const moodBonus = computeMoodCategoryBonus(ctx?.algorithmMood, offer.category);

          const adjustedFitScore = clamp(fit.score + affinityFitBump + audienceTagBoost + laneFitBonus + moodBonus, 0, 1);
          const sceneFitReason = offer.scene_target_region && offer.scene_strength_label
            ? `${describeSceneStrength(offer.scene_strength_label)} in ${offer.scene_target_region} improved this offer`
            : null;
          const sceneTargetRegions = offer.regions_targeted?.length > 0
            ? offer.regions_targeted
            : (offer.scene_target_region ? [offer.scene_target_region] : []);
          const personaFitReason = loyaltyTier !== 'neutral'
            ? [...fit.reasons, loyaltyTier === 'cold' ? 'Low brand loyalty reduced confidence' : 'Brand loyalty improved confidence']
            : [...fit.reasons];
          if (laneFitBonus > 0) personaFitReason.push(`Career lane alignment boosted fit (+${(laneFitBonus * 100).toFixed(0)}%)`);
          if (moodBonus > 0) personaFitReason.push(`Algorithm mood favors this category (+${(moodBonus * 100).toFixed(0)}%)`);
          if (sceneFitReason) personaFitReason.push(sceneFitReason);

          // If persona_fit_score < 0.25, slightly increase cancellation risk
          const adjustedRiskModel = { ...offer.risk_model };
          if (fit.score < 0.25) {
            adjustedRiskModel.cancellation_chance_base = Math.min(0.5,
              adjustedRiskModel.cancellation_chance_base + 0.02);
          }

          // Build platform-aware description
          const platformLabel = offer.primary_platform === 'vidwave' ? 'VidWave'
            : offer.platform_scope.length > 1 ? 'your social platforms'
            : 'InstaVibe';
          const deliverableLabel = offer.deliverable_type === 'video' ? 'videos'
            : offer.deliverable_type === 'cross_platform' ? 'content pieces'
            : 'posts';

          brandDealCreates.push({
            artist_id: pid,
            brand_id: offer.brand_id || null,
            brand_name: offer.brand_name,
            platform: offer.primary_platform,
            deal_type: offer.deliverable_type === 'video' ? 'sponsored_video' : 'sponsored_post',
            payout: Math.round(offer.per_turn_fee * computeLanePayoutMultiplier(ctx?.careerLaneData, offer.category)) * offer.duration_turns,
            status: 'offered',
            expires_turn: globalTurnId + OFFER_TTL_TURNS,
            category: offer.category,
            tier: offer.tier,
            exclusivity_category: offer.exclusivity_category,
            regions_targeted: offer.regions_targeted,
            duration_turns: offer.duration_turns,
            signing_bonus: offer.signing_bonus,
            per_turn_fee: Math.round(offer.per_turn_fee * computeLanePayoutMultiplier(ctx?.careerLaneData, offer.category)),
            performance_bonus: offer.performance_bonus,
            kpis: offer.kpis,
            risk_model: adjustedRiskModel,
            offer_seed: offer.offer_seed,
            generation_reason: offer.generation_reason,
            controversy_risk: offer.controversy_risk,
            brand_safety_score: offer.brand_safety_score,
            platform_scope: offer.platform_scope,
            requirements: { description: `Feature ${offer.brand_name} on ${platformLabel} — ${offer.deliverable_count_required} ${deliverableLabel} over ${offer.duration_turns} turns.` },
            deliverables: { [deliverableLabel]: Math.max(1, offer.deliverable_count_required) },
            fan_impact_multiplier: 1.0,
            metadata: {
              tier: offer.tier, offer_turn: globalTurnId, slot: i,
              platform_scope: offer.platform_scope,
              primary_platform: offer.primary_platform,
              deliverable_type: offer.deliverable_type,
              deliverable_count_required: offer.deliverable_count_required,
              marketing_persona_primary: personaResult?.primary_persona || null,
              marketing_persona_secondary: personaResult?.secondary_persona || null,
              marketing_persona_confidence: personaResult?.confidence_score || 0,
              persona_fit_score: adjustedFitScore,
              persona_fit_reason: personaFitReason,
              persona_affinity_tags: fit.affinity_tags,
              brand_affinity_score: affinityScore,
              loyalty_tier: loyaltyTier,
              scene_brand_bonus_pct: offer.scene_bonus_pct,
              scene_strength_label: offer.scene_strength_label,
              scene_target_regions: sceneTargetRegions,
              scene_target_region: offer.scene_target_region,
              scene_fit_reason: sceneFitReason,
              lane_fit_bonus: laneFitBonus,
              mood_category_bonus: moodBonus,
              lane_payout_mult: computeLanePayoutMultiplier(ctx?.careerLaneData, offer.category),
              dominant_lane: ctx?.careerLaneData?.dominant_lane || null,
              secondary_lane: ctx?.careerLaneData?.secondary_lane || null,
              archetype: ctx?.careerArchetypeData?.archetype || null,
              algorithm_mood: ctx?.algorithmMood || null,
            },
          });
        }
        notifications.push(buildOfferedNotif(pid, globalTurnId, count, params.careerStage));
      }

      // ── Sponsored Challenges (stage ≥ 2, every 10 turns, TTL 7 turns) ─────
      const CHALLENGE_STAGE_ORDER: Record<string, number> = {
        'Unknown': 0, 'Local Artist': 1, 'Local Buzz': 2, 'Underground Artist': 3,
        'Cult Favorite': 4, 'Breakout Artist': 5, 'Mainstream Artist': 6,
        'A-List Star': 7, 'Global Superstar': 8, 'Legacy Icon': 9,
      };
      const CHALLENGE_TEMPLATES = [
        { brand: 'VitaFlow Energy', category: 'beverage', platform: 'looptok' as PlatformScope, desc: 'Brand challenge video', reward_mult: 1.4 },
        { brand: 'Synthwave Apparel Co.', category: 'fashion', platform: 'instavibe' as PlatformScope, desc: 'Style showcase series', reward_mult: 1.2 },
        { brand: 'NexGen Tech Solutions', category: 'tech', platform: 'vidwave' as PlatformScope, desc: 'Product unboxing review', reward_mult: 1.8 },
        { brand: 'Pulse Sport', category: 'sports', platform: 'looptok' as PlatformScope, desc: 'Dance challenge collab', reward_mult: 1.5 },
        { brand: 'Auric Cosmetics', category: 'beauty', platform: 'instavibe' as PlatformScope, desc: 'Look reveal campaign', reward_mult: 1.3 },
      ];
      const challengeStageIdx = CHALLENGE_STAGE_ORDER[player.career_stage || 'Unknown'] || 0;
      if (challengeStageIdx >= 2 && globalTurnId % 10 === 0) {
        const tmplIdx = Math.floor(seededRandom(globalTurnId * 7331 + pid.charCodeAt(0)) * CHALLENGE_TEMPLATES.length);
        const tmpl = CHALLENGE_TEMPLATES[tmplIdx];
        const baseFans = N(player.fans ?? player.followers);
        const baseFee = Math.max(100, Math.round(baseFans * 0.1 * tmpl.reward_mult));
        const challengeDuration = 5;
        const challengeTier = challengeStageIdx >= 6 ? 'national' : challengeStageIdx >= 4 ? 'regional' : 'local';
        brandDealCreates.push({
          artist_id: pid,
          brand_id: null,
          brand_name: tmpl.brand,
          platform: tmpl.platform,
          deal_type: 'challenge',
          payout: baseFee * challengeDuration,
          status: 'offered',
          expires_turn: globalTurnId + 7,
          category: tmpl.category,
          tier: challengeTier,
          exclusivity_category: null,
          regions_targeted: ['global'],
          duration_turns: challengeDuration,
          signing_bonus: 0,
          per_turn_fee: baseFee,
          performance_bonus: Math.round(baseFee * challengeDuration * 0.25),
          kpis: { required_posts: 1, required_engagement_rate: 2, required_reach: 0 },
          risk_model: { cancellation_chance_base: 0.05, scandal_multiplier: 3.0 },
          offer_seed: Math.floor(seededRandom(globalTurnId * 99991 + pid.charCodeAt(0)) * 2147483647),
          generation_reason: 'sponsored_challenge',
          controversy_risk: 'low',
          brand_safety_score: 80,
          platform_scope: [tmpl.platform] as PlatformScope[],
          requirements: { description: `${tmpl.desc} — complete a ${tmpl.brand} sponsored challenge.` },
          deliverables: { posts: 1 },
          fan_impact_multiplier: 1.2,
          metadata: {
            tier: challengeTier,
            offer_turn: globalTurnId,
            slot: 99,
            is_challenge: true,
            challenge_template: tmpl.desc,
            platform_scope: [tmpl.platform],
            primary_platform: tmpl.platform,
            deliverable_type: tmpl.platform === 'vidwave' ? 'video' : 'post',
            deliverable_count_required: 1,
            marketing_persona_primary: personaResult?.primary_persona || null,
            marketing_persona_secondary: personaResult?.secondary_persona || null,
            marketing_persona_confidence: personaResult?.confidence_score || 0,
            persona_fit_score: 0.6,
            persona_fit_reason: ['Sponsored challenge opportunity'],
          },
        });
      }
    }

    // ── 3B. AMBASSADOR OFFER GENERATION ──────────────────────────────────
    try {
      const activeAmbassadorCount = contracts.filter((c: any) => c.deal_type === 'ambassador').length;
      const ambSeed = globalTurnId * 3001 + pid.charCodeAt(0) * 7;

      if (shouldGenerateAmbassadorOffer(globalTurnId, ambSeed, activeAmbassadorCount)) {
        // Query controversy state (peak phase blocks ambassador offers)
        const { count: peakControversyCount } = await supabase
          .from('controversy_cases')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', pid)
          .eq('phase', 'peak');
        const hasActivePeakControversy = (peakControversyCount || 0) > 0;

        // Estimate industry respect from available data:
        // career stage weight (0-45) + brand safety contribution (0-30) + completed deals (0-25)
        const AMB_STAGE_ORDER: Record<string, number> = {
          'Unknown': 0, 'Local Artist': 1, 'Local Buzz': 2, 'Underground Artist': 3,
          'Cult Favorite': 4, 'Breakout Artist': 5, 'Mainstream Artist': 6,
          'A-List Star': 7, 'Global Superstar': 8, 'Legacy Icon': 9,
        };
        const stageWeight = Math.min(45, (AMB_STAGE_ORDER[player.career_stage || 'Unknown'] || 0) * 5);
        const safetyWeight = Math.min(30, N(stats?.brand_safety_rating ?? 50) * 0.3);
        const completionWeight = Math.min(25, N(stats?.total_deals_completed ?? 0) * 2.5);
        const estimatedIndustryRespect = stageWeight + safetyWeight + completionWeight;

        const alignmentScore = clamp(N(activeEra?.identity_alignment_score || 50), 0, 100);
        const ambSafetyRating = clamp(N(stats?.brand_safety_rating ?? 50), 0, 100);

        // Build lightweight OfferParams for gate check and offer generation
        const ambParams: OfferParams = {
          followers: N(player.fans ?? player.followers),
          clout: N(player.clout),
          hype: N(player.hype),
          careerStage: player.career_stage || 'Unknown',
          genre: player.genre || '',
          regionShare,
          archetypeShare,
          activeTrends,
          activeContractCount: contracts.length,
          overexposureScore,
          reputationModifier,
          safetyRating: ambSafetyRating,
          fanMorale: typeof ctx?.fanMorale === 'number' ? ctx.fanMorale : 50,
          brandTrust: typeof ctx?.brandTrust === 'number' ? ctx.brandTrust : 50,
        };

        const gateCheck = checkAmbassadorGates({
          params: ambParams,
          eraAlignmentScore: alignmentScore,
          hasActivePeakControversy,
          brandAffinityByKey: affinityByBrand,
          industryRespectScore: estimatedIndustryRespect,
        });

        if (gateCheck.eligible) {
          // Find warmest brand affinity for preferred ambassador brand
          let warmestBrandKey: string | null = null;
          let warmestScore = -Infinity;
          for (const [key, row] of affinityByBrand.entries()) {
            const score = clampLoyaltyScore(safeNum(row?.affinity_score, 0));
            if (score >= 3 && score > warmestScore) { // "warm" tier = score >= 3
              warmestScore = score;
              warmestBrandKey = key;
            }
          }

          const ambOffer = await generateAmbassadorOffer(ambParams, globalTurnId, warmestBrandKey, affinityByBrand);

          const platformLabel = 'your social platforms';
          brandDealCreates.push({
            artist_id: pid,
            brand_id: ambOffer.brand_id || null,
            brand_name: ambOffer.brand_name,
            platform: ambOffer.primary_platform,
            deal_type: 'ambassador',
            payout: ambOffer.total_contract_value,
            status: 'offered',
            expires_turn: globalTurnId + 12, // Ambassador offers last longer (12 turns)
            category: ambOffer.category,
            tier: ambOffer.tier,
            exclusivity_category: ambOffer.exclusivity_category,
            regions_targeted: ambOffer.regions_targeted,
            duration_turns: ambOffer.duration_turns,
            signing_bonus: ambOffer.signing_bonus,
            per_turn_fee: ambOffer.per_turn_fee,
            performance_bonus: ambOffer.performance_bonus,
            kpis: ambOffer.kpis,
            risk_model: ambOffer.risk_model,
            offer_seed: ambOffer.offer_seed,
            generation_reason: ambOffer.generation_reason,
            controversy_risk: ambOffer.controversy_risk,
            brand_safety_score: ambOffer.brand_safety_score,
            platform_scope: ambOffer.platform_scope,
            requirements: { description: `Become the face of ${ambOffer.brand_name} across ${platformLabel} — ${ambOffer.duration_turns} turn ambassador partnership.` },
            deliverables: { lifestyle_integration: ambOffer.deliverable_count_required },
            fan_impact_multiplier: 1.5,
            metadata: {
              tier: ambOffer.tier,
              offer_turn: globalTurnId,
              slot: 'ambassador',
              deal_type: 'ambassador',
              royalty_pct: ambOffer.royalty_pct,
              total_contract_value: ambOffer.total_contract_value,
              platform_scope: ambOffer.platform_scope,
              primary_platform: ambOffer.primary_platform,
              deliverable_type: ambOffer.deliverable_type,
              deliverable_count_required: ambOffer.deliverable_count_required,
              marketing_persona_primary: personaResult?.primary_persona || null,
              marketing_persona_secondary: personaResult?.secondary_persona || null,
              marketing_persona_confidence: personaResult?.confidence_score || 0,
              persona_fit_score: 0.85,
              persona_fit_reason: ['Ambassador partnership — high brand affinity'],
              warmest_brand_key: warmestBrandKey,
              gate_check: 'passed',
            },
          });

          notifications.push({
            player_id: pid, global_turn_id: globalTurnId, created_turn_index: globalTurnId,
            type: 'BRAND_AMBASSADOR_OFFER',
            title: 'Ambassador Offer',
            subtitle: `${ambOffer.brand_name} wants you as their face`,
            body: `${ambOffer.brand_name} is offering a ${ambOffer.duration_turns}-turn ambassador deal worth ${(ambOffer.total_contract_value / 1000).toFixed(0)}K with ${ambOffer.royalty_pct}% royalties.`,
            metrics: { brand_name: ambOffer.brand_name, total_value: ambOffer.total_contract_value, royalty_pct: ambOffer.royalty_pct, tier: ambOffer.tier },
            idempotency_key: `brand_ambassador_offer:${pid}:${globalTurnId}`,
            group_key: `brand:${pid}:ambassador`,
            priority: 'high', is_read: false,
            deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
          });

          debugLog(`Ambassador offer generated: ${ambOffer.brand_name} (${ambOffer.tier}) $${ambOffer.total_contract_value} for ${ambOffer.duration_turns}t`);
        } else {
          debugLog(`Ambassador gates failed: ${gateCheck.failedGates.join(', ')}`);
        }
      }
    } catch (ambErr: unknown) {
      console.warn('[BrandDeals] Ambassador generation failed (non-fatal):', ambErr instanceof Error ? ambErr.message : String(ambErr));
    }

    // ── 4. NOTIFICATIONS for completions and cancellations ────────────────
    if (dealsCompletedThisTurn > 0) {
      // Per-turn fees for completed contracts are not paid on the completion turn (isPastEnd skips isWithinTerm),
      // so the only revenue attributed to the completed deal on this turn is the performance bonus.
      notifications.push(buildCompletedNotif(pid, globalTurnId, completedNames, brandDealBonusRevenue, brandDealBonusRevenue));
      turnEvents.push({
        global_turn_id: globalTurnId, player_id: pid, module: 'brand_deals',
        event_type: 'brand_deal_completed',
        description: `${dealsCompletedThisTurn} contract(s) completed`,
        metadata: { count: dealsCompletedThisTurn, brand_names: completedNames },
      });
    }
    if (dealsCancelledThisTurn > 0) {
      notifications.push(buildCancelledNotif(pid, globalTurnId, cancelledNames));
      turnEvents.push({
        global_turn_id: globalTurnId, player_id: pid, module: 'brand_deals',
        event_type: 'brand_deal_cancelled',
        description: `${dealsCancelledThisTurn} contract(s) cancelled`,
        metadata: { count: dealsCancelledThisTurn, brand_names: cancelledNames },
      });
    }
    if (dealsBreachedThisTurn > 0) {
      notifications.push(buildBreachedNotif(pid, globalTurnId, breachedNames));
      turnEvents.push({
        global_turn_id: globalTurnId, player_id: pid, module: 'brand_deals',
        event_type: 'brand_deal_breached',
        description: `${dealsBreachedThisTurn} contract(s) breached`,
        metadata: { count: dealsBreachedThisTurn, brand_names: breachedNames },
      });
    }
    if (broadcastBreachNames.length > 0) {
      const nameList = broadcastBreachNames.slice(0, 2).join(', ') + (broadcastBreachNames.length > 2 ? ` +${broadcastBreachNames.length - 2} more` : '');
      notifications.push({
        player_id: pid, global_turn_id: globalTurnId, created_turn_index: globalTurnId,
        type: 'BRAND_DEAL_BREACH_SCANDAL',
        title: 'Contract Breach Goes Public',
        subtitle: `${nameList} attracted media attention`,
        body: `Your breach of ${nameList} has attracted media attention. Expect reputation consequences.`,
        metrics: { count: broadcastBreachNames.length, brand_names: broadcastBreachNames, severity: 'broadcast_breach' },
        idempotency_key: `brand_broadcast_breach:${pid}:${globalTurnId}`,
        group_key: `brand:${pid}:broadcast_breach`,
        priority: 'high', is_read: false,
        deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
      });
      turnEvents.push({
        global_turn_id: globalTurnId, player_id: pid, module: 'brand_deals',
        event_type: 'brand_deal_breach_scandal',
        description: `Luxury/Global breach went public: ${nameList}`,
        metadata: { count: broadcastBreachNames.length, brand_names: broadcastBreachNames },
      });
    }

    // ── 5. UPSERT player_brand_stats ──────────────────────────────────────
    const safetyRating = N(stats?.brand_safety_rating ?? 50);
    const healthyActiveContracts = dealsCancelledThisTurn === 0 && dealsBreachedThisTurn === 0 ? contracts.length : 0;
    const targetSafetyFloor = 50 + (healthyActiveContracts >= 1 ? 4 : 0) + (healthyActiveContracts >= 2 ? 2 : 0);
    const passiveSafetyDrift = healthyActiveContracts > 0 && safetyRating < targetSafetyFloor ? 1 : 0;
    const completionSafetyGain = Math.min(4, dealsCompletedThisTurn * 2);
    const safetyPenalty = (dealsCancelledThisTurn * 3) + (dealsBreachedThisTurn * 4) + extraBreachSafetyPenalty;
    const newSafetyRating = clamp(safetyRating + passiveSafetyDrift + completionSafetyGain - safetyPenalty, 0, 100);
    const activeDealReputationBonus = healthyActiveContracts >= 1 ? Math.min(0.02, healthyActiveContracts * 0.01) : 0;
    const completionReputationBonus = Math.min(0.06, N(stats?.total_deals_completed) * 0.01 + dealsCompletedThisTurn * 0.01);
    const loyaltyReputationBonus = Math.min(0.04, positiveAffinityAverage * 0.01);
    const reputationPenalty = (dealsCancelledThisTurn * 0.02) + (dealsBreachedThisTurn * 0.03) + extraBreachReputationPenalty;
    const persistedReputationModifier = clamp(
      reputationModifier + activeDealReputationBonus + completionReputationBonus + loyaltyReputationBonus - reputationPenalty,
      0.5,
      1.4,
    );
    playerBrandStatsUpserts.push({
      artist_id: pid,
      platform,
      total_deals_completed: N(stats?.total_deals_completed) + dealsCompletedThisTurn,
      total_earnings: N(stats?.total_earnings) + brandDealRevenue,
      brand_safety_rating: newSafetyRating,
      controversy_count: N(stats?.controversy_count),
      last_brand_turn: globalTurnId,
      overexposure_score: overexposureScore,
      active_deal_count: Math.max(0, contracts.length - dealsCompletedThisTurn - dealsCancelledThisTurn - dealsBreachedThisTurn),
      reputation_modifier: persistedReputationModifier,
      ...(personaResult ? {
        marketing_persona_primary: personaResult.primary_persona || null,
        marketing_persona_secondary: personaResult.secondary_persona || null,
        marketing_persona_confidence: personaResult.confidence_score || 0,
      } : {}),
      updated_at: now,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandDeals] Error for player ${player.id}:`, msg);
    return { success: false, error: msg };
  }

  debugLog(`DONE player=${pid} revenue=$${brandDealRevenue} bonus=$${brandDealBonusRevenue}`);

  return {
    success: true,
    deltas: {
      // brand_deal_revenue is an ADDITIVE boost to income, resolved in turnEngine commit phase
      // via brand_deal_income_boost (same pattern as tour_income_boost)
      ...(brandDealRevenue > 0 ? { artistProfile: { brand_deal_income_boost: brandDealRevenue } } : {}),
      brand_deal_updates: brandDealUpdates,
      brand_deal_creates: brandDealCreates,
      brand_deal_contract_updates: contractUpdates,
      brand_deal_payout_log_inserts: payoutLogInserts,
      player_brand_stats_upserts: playerBrandStatsUpserts,
      player_brand_affinity_upserts: playerBrandAffinityUpserts,
      turn_events: turnEvents,
      notifications_to_create: notifications,
      turn_metrics: {
        brand_deal_revenue: brandDealRevenue,
        brand_deal_bonus_revenue: brandDealBonusRevenue,
        brand_deal_signing_bonus: signingBonusRevenue,
        brand_deal_royalty_revenue: royaltyRevenue,
        brand_deal_penalties: brandDealPenalties,
        brand_deals_completed: dealsCompletedThisTurn,
        brand_deals_expired: (brandDealUpdates.filter(u => u.patch.status === 'expired')).length,
        brand_deals_cancelled: dealsCancelledThisTurn,
        brand_deals_breached: dealsBreachedThisTurn,
      },
    },
  };
}

// ─── Exported action helpers (used by socialMedia router) ──────────────────

export async function getBrandDealsForPlayer(artistId: string, platform?: string) {
  const supabase = supabaseAdmin;

  // Fetch offers (all platforms if platform not specified)
  let offersQuery = supabase
    .from('brand_deals')
    .select('*')
    .eq('artist_id', artistId)
    .eq('status', 'offered')
    .order('created_at', { ascending: false });
  if (platform) offersQuery = offersQuery.eq('platform', platform);
  const { data: offers } = await offersQuery;

  // Fetch contracts
  const { data: contracts } = await supabase
    .from('brand_deal_contracts')
    .select('*')
    .eq('player_id', artistId)
    .order('created_at', { ascending: false });

  // Fetch payout history
  const { data: payouts } = await supabase
    .from('brand_deal_payout_log')
    .select('*')
    .eq('player_id', artistId)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    offers: offers || [],
    contracts: contracts || [],
    payouts: payouts || [],
  };
}

function tierWeight(tier: string): number {
  const order: Record<string, number> = {
    local: 1,
    regional: 2,
    national: 3,
    global: 4,
    luxury: 5,
  };
  return order[(tier || '').toLowerCase()] || 0;
}

function normalizeReason(reason: unknown): string[] {
  if (!reason) return [];
  if (Array.isArray(reason)) return reason.map(r => String(r));
  if (typeof reason === 'string') return [reason];
  return [];
}

export async function getEligibleSponsorshipContracts(artistId: string, platform = 'vidwave', currentTurn = 0) {
  const supabase = supabaseAdmin;
  const { data, error } = await supabase
    .from('brand_deal_contracts')
    .select('id, brand_name, tier, category, end_turn_id, deliverable_count_required, deliverable_count_completed, platform_scope, status')
    .eq('player_id', artistId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || [])
    .filter((c: any) => {
      const scope = c.platform_scope || [];
      return scope.includes(platform) || scope.includes('cross_platform');
    })
    .map((c: any) => ({
      contract_id: c.id,
      brand_name: c.brand_name,
      tier: c.tier,
      category: c.category,
      platform_scope: c.platform_scope || [],
      deliverables_remaining: Math.max(0, N(c.deliverable_count_required) - N(c.deliverable_count_completed)),
      contract_end_turn_id: N(c.end_turn_id),
      turns_remaining: Math.max(0, N(c.end_turn_id) - N(currentTurn)),
    }));
}

export async function getVidWaveSponsorships(artistId: string, currentTurn = 0, platform = 'vidwave') {
  const supabase = supabaseAdmin;

  const [contractsRes, offersRes, accountRes, adLogRes, loyaltyRes] = await Promise.all([
    supabase
      .from('brand_deal_contracts')
      .select('id, brand_name, tier, category, platform_scope, deliverable_count_required, deliverable_count_completed, end_turn_id, persona_fit_score, status')
      .eq('player_id', artistId)
      .in('status', [CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.COMPLETED, CONTRACT_STATUS.BREACHED, CONTRACT_STATUS.CANCELLED])
      .order('created_at', { ascending: false }),
    supabase
      .from('brand_deals')
      .select('id, brand_name, tier, category, platform_scope, per_turn_fee, signing_bonus, start_turn, expires_turn, duration_turns, created_at, status, metadata')
      .eq('artist_id', artistId)
      .eq('status', 'offered')
      .order('created_at', { ascending: false }),
    supabase
      .from('social_accounts')
      .select('total_revenue')
      .eq('artist_id', artistId)
      .eq('platform', 'vidwave')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vidwave_ad_revenue_log')
      .select('global_turn_id, metadata')
      .eq('player_id', artistId)
      .order('global_turn_id', { ascending: false })
      .limit(300),
    supabase
      .from('player_brand_affinity')
      .select('brand_key, affinity_score')
      .eq('player_id', artistId),
  ]);

  if (contractsRes.error) throw contractsRes.error;
  if (offersRes.error) throw offersRes.error;
  if (accountRes.error) throw accountRes.error;
  if (adLogRes.error) throw adLogRes.error;
  if (loyaltyRes.error) throw loyaltyRes.error;

  const loyaltyByBrand = new Map((loyaltyRes.data || []).map((row: any) => [normalizeBrandKey(row.brand_key), getBrandLoyaltyTier(clampLoyaltyScore(N(row.affinity_score)))]));

  const activeContracts = (contractsRes.data || [])
    .filter((c: any) => {
      if (c.status !== CONTRACT_STATUS.ACTIVE) return false;
      const scope = c.platform_scope || [];
      return scope.includes(platform) || scope.includes('cross_platform');
    })
    .map((c: any) => ({
      id: c.id,
      brand_name: c.brand_name,
      tier: c.tier,
      category: c.category,
      platform_scope: c.platform_scope || [],
      deliverables_remaining: Math.max(0, N(c.deliverable_count_required) - N(c.deliverable_count_completed)),
      turns_remaining: Math.max(0, N(c.end_turn_id) - N(currentTurn)),
      status: c.status || CONTRACT_STATUS.ACTIVE,
      ...(c.persona_fit_score != null ? { persona_fit_score: Number(c.persona_fit_score) } : {}),
      loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(c.brand_name)) || 'neutral',
    }));

  const offers = (offersRes.data || [])
    .filter((o: any) => {
      const scope = o.platform_scope || [];
      const inScope = scope.includes(platform) || scope.includes('cross_platform');
      const notExpired = !N(o.expires_turn) || N(o.expires_turn) >= N(currentTurn);
      return inScope && notExpired;
    })
    .sort((a: any, b: any) => {
      const fitDelta = Number(b.metadata?.persona_fit_score || 0) - Number(a.metadata?.persona_fit_score || 0);
      if (Math.abs(fitDelta) > 0.0001) return fitDelta;
      const tierDelta = tierWeight(b.tier) - tierWeight(a.tier);
      if (tierDelta !== 0) return tierDelta;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 6)
    .map((o: any) => {
      const startTurnId = N(o.start_turn) || N(currentTurn);
      const durationTurns = Math.max(1, N(o.duration_turns) || 1);
      return {
        id: o.id,
        brand_name: o.brand_name,
        tier: o.tier,
        category: o.category,
        platform_scope: o.platform_scope || [],
        deliverable_type: o.metadata?.deliverable_type || 'video',
        deliverable_count_required: N(o.metadata?.deliverable_count_required) || 1,
        per_turn_fee: N(o.per_turn_fee),
        signing_bonus: N(o.signing_bonus),
        start_turn_id: startTurnId,
        end_turn_id: startTurnId + durationTurns,
        status: o.status || 'offered',
        ...(o.metadata?.persona_fit_score != null ? { persona_fit_score: Number(o.metadata.persona_fit_score) } : {}),
        ...(o.metadata?.persona_fit_reason ? { persona_fit_reason: normalizeReason(o.metadata.persona_fit_reason) } : {}),
        loyalty_tier: loyaltyByBrand.get(normalizeBrandKey(o.brand_name)) || 'neutral',
      };
    });

  const adRevenueTotal = Math.max(0, safeNum(accountRes.data?.total_revenue, 0));
  const logRows = adLogRes.data || [];
  const sponsoredUpliftTotal = logRows.reduce((sum: number, row: any) => {
    const uplift = safeSponsoredUpliftForRow(row?.metadata, { artistId, type: 'total', row });
    return sum + uplift;
  }, 0);
  const sponsoredUpliftThisTurn = logRows.reduce((sum: number, row: any) => {
    if (N(row?.global_turn_id) !== N(currentTurn)) return sum;
    const uplift = safeSponsoredUpliftForRow(row?.metadata, { artistId, type: 'current_turn', row });
    return sum + uplift;
  }, 0);

  return {
    monetization: {
      ad_revenue_total: adRevenueTotal,
      sponsored_uplift_total: sponsoredUpliftTotal,
      sponsored_uplift_this_turn: sponsoredUpliftThisTurn,
    },
    active_contracts: activeContracts,
    offers,
  };
}

export async function acceptBrandDealForPlayer(artistId: string, dealId: string, globalTurnId: number) {
  const supabase = supabaseAdmin;

  // 1. Fetch and validate offer
  const { data: deal, error: fetchErr } = await supabase
    .from('brand_deals')
    .select('*')
    .eq('id', dealId)
    .eq('artist_id', artistId)
    .eq('status', 'offered')
    .single();
  if (fetchErr || !deal) throw new Error('Deal not found or already actioned');

  // 2. Check expiration
  if (N(deal.expires_turn) > 0 && N(deal.expires_turn) < globalTurnId) {
    throw new Error('This offer has expired');
  }

  // 3. Check max concurrent contracts
  const { count: activeCount } = await supabase
    .from('brand_deal_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', artistId)
    .eq('status', 'active');
  if ((activeCount || 0) >= MAX_CONCURRENT_CONTRACTS) {
    throw new Error(`Maximum ${MAX_CONCURRENT_CONTRACTS} active contracts allowed. Complete or wait for existing deals to finish.`);
  }

  // 4. Check exclusivity conflict
  if (deal.exclusivity_category) {
    const { data: conflicting } = await supabase
      .from('brand_deal_contracts')
      .select('id, brand_name')
      .eq('player_id', artistId)
      .eq('status', 'active')
      .eq('exclusivity_category', deal.exclusivity_category)
      .limit(1);
    if (conflicting && conflicting.length > 0) {
      throw new Error(`Exclusivity conflict: you already have an active ${deal.exclusivity_category} deal with ${conflicting[0].brand_name}. That deal must complete or be cancelled first.`);
    }
  }

  // 5. Create contract (signing bonus paid by turn engine, not here)
  const startTurn = globalTurnId;
  const duration = N(deal.duration_turns) || 1;
  const endTurn = startTurn + duration;

  // Derive platform scope from offer (backward compatible: defaults to ['instavibe'])
  const dealPlatformScope: string[] = deal.platform_scope || [deal.platform || 'instavibe'];
  const dealPrimaryPlatform: string = deal.metadata?.primary_platform || deal.platform || 'instavibe';
  const dealDeliverableType: string = deal.metadata?.deliverable_type || 'post';
  const dealDeliverableCount: number = N(deal.metadata?.deliverable_count_required) || 1;

  // Calculate platform-specific payout
  const platformPayout = calculatePlatformPayout(
    N(deal.per_turn_fee),
    dealPrimaryPlatform,
    dealDeliverableType,
    dealPlatformScope,
    false, // isViral - will be determined during performance evaluation
    0,    // engagementRate - will be determined during performance evaluation
    0     // views - will be determined during performance evaluation
  );

  const { data: contract, error: contractErr } = await supabase
    .from('brand_deal_contracts')
    .insert({
      player_id: artistId,
      offer_id: dealId,
      brand_id: deal.brand_id || null,
      brand_name: deal.brand_name,
      deal_type: deal.deal_type === 'ambassador' ? 'ambassador' : 'standard',
      category: deal.category,
      tier: deal.tier || 'local',
      exclusivity_category: deal.exclusivity_category,
      regions_targeted: deal.regions_targeted,
      start_turn_id: startTurn,
      end_turn_id: endTurn,
      duration_turns: duration,
      signing_bonus: N(deal.signing_bonus),
      per_turn_fee: N(deal.per_turn_fee),
      performance_bonus: N(deal.performance_bonus),
      kpis: deal.kpis || {},
      risk_model: deal.risk_model || {},
      platform_scope: dealPlatformScope,
      primary_platform: dealPrimaryPlatform,
      deliverable_type: dealDeliverableType,
      deliverable_count_required: dealDeliverableCount,
      deliverable_count_completed: 0,
      platform_multiplier: platformPayout.bonusConditions?.total_bonus_multiplier ?? 1.0,
      metadata: {
        platform_payout_model: 'flat',
        platform_bonus_conditions: platformPayout.bonusConditions,
        platform_applied_bonuses: platformPayout.appliedBonuses,
        ...(deal.deal_type === 'ambassador' ? {
          deal_type: 'ambassador',
          royalty_pct: N(deal.metadata?.royalty_pct),
          total_contract_value: N(deal.metadata?.total_contract_value),
        } : {}),
      },
    })
    .select()
    .single();
  if (contractErr) throw contractErr;

  // 6. Update offer status
  await supabase
    .from('brand_deals')
    .update({
      status: 'accepted',
      accepted_turn: globalTurnId,
      contract_id: contract.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId);

  return { deal, contract, cloutGain: 0 }; // No instant clout — earned through turn processing
}

export async function declineBrandDealForPlayer(artistId: string, dealId: string) {
  const supabase = supabaseAdmin;
  const { error } = await supabase
    .from('brand_deals')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('artist_id', artistId)
    .eq('status', 'offered');
  if (error) throw error;
  return { success: true };
}

/**
 * DEPRECATED: completeBrandDealForPlayer
 * Deals are now completed by the turn engine when end_turn_id is reached.
 * This function is kept for backward compatibility but does NOT pay out.
 */
export async function completeBrandDealForPlayer(artistId: string, dealId: string, globalTurnId = 0) {
  console.warn('[BrandDeals] completeBrandDealForPlayer is deprecated. Deals complete via turn engine.');
  return { success: true, payout: 0 };
}

/**
 * Link sponsored content to a brand deal contract.
 * Called when a VidWave video (or InstaVibe post) is created with a sponsored_contract_id.
 *
 * Validates:
 *  - Contract exists and is active
 *  - Contract belongs to the artist
 *  - Contract's platform_scope includes the content's platform
 *  - deliverable_count_completed < deliverable_count_required
 *  - Content is not already linked (idempotent via unique constraint)
 *
 * On success: inserts into sponsored_content and increments deliverable_count_completed.
 * Returns { success: true, deliverable_count_completed } or throws.
 */
export async function linkSponsoredContent(
  artistId: string,
  contractId: string,
  contentId: string,
  contentPlatform: string,
  turnId: number
): Promise<{ success: boolean; deliverable_count_completed: number }> {
  const supabase = supabaseAdmin;

  // 1. Fetch and validate contract
  const { data: contract, error: fetchErr } = await supabase
    .from('brand_deal_contracts')
    .select('id, player_id, status, platform_scope, deliverable_count_required, deliverable_count_completed')
    .eq('id', contractId)
    .single();
  if (fetchErr || !contract) throw new Error('Sponsored contract not found');
  if (contract.player_id !== artistId) throw new Error('Contract does not belong to this artist');
  if (contract.status !== 'active') throw new Error('Contract is not active');

  // 2. Validate platform scope
  const platformScope: string[] = contract.platform_scope || ['instavibe'];
  const platformAllowed = platformScope.includes(contentPlatform) || platformScope.includes('cross_platform');
  if (!platformAllowed) {
    throw new Error(`Contract platform scope ${JSON.stringify(platformScope)} does not include '${contentPlatform}'`);
  }

  // 3. Validate deliverable capacity
  const completed = N(contract.deliverable_count_completed);
  const required = N(contract.deliverable_count_required);
  if (completed >= required) {
    throw new Error(`All ${required} deliverables already completed for this contract`);
  }

  // 4. Insert sponsored_content row (unique constraint on content_id prevents double-link)
  const { error: insertErr } = await supabase
    .from('sponsored_content')
    .insert({
      contract_id: contractId,
      player_id: artistId,
      platform: contentPlatform,
      content_id: contentId,
      turn_id: turnId,
    });
  if (insertErr) {
    // If duplicate, return current count (idempotent)
    if (insertErr.code === '23505') {
      debugLog(`Content ${contentId} already linked to contract ${contractId} (idempotent)`);
      return { success: true, deliverable_count_completed: completed };
    }
    throw insertErr;
  }

  // 5. Increment deliverable_count_completed (safe: CHECK constraint prevents exceeding required)
  const newCompleted = completed + 1;
  const { error: updateErr } = await supabase
    .from('brand_deal_contracts')
    .update({
      deliverable_count_completed: newCompleted,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId);
  if (updateErr) throw updateErr;

  debugLog(`Linked content ${contentId} to contract ${contractId} — deliverables: ${newCompleted}/${required}`);
  return { success: true, deliverable_count_completed: newCompleted };
}

// ─── Notification builders ─────────────────────────────────────────────────

function buildOfferedNotif(pid: string, tid: number, count: number, stage: string) {
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_OFFERED',
    title: 'New Brand Deals Available',
    subtitle: `${count} new offer${count > 1 ? 's' : ''} for ${stage} artists`,
    body: `You have ${count} new brand deal offer${count > 1 ? 's' : ''} waiting. Review contract terms, payouts, and KPIs before accepting.`,
    metrics: { count, stage, platform: 'instavibe' },
    idempotency_key: `brand_offered:${pid}:${tid}`,
    group_key: `brand:${pid}:offered`,
    priority: 'medium', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}

function buildExpiredNotif(pid: string, tid: number, deals: any[]) {
  const count = deals.length;
  const names = deals.slice(0, 3).map((d: any) => d.brand_name).join(', ');
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_EXPIRED',
    title: count === 1 ? 'Brand Deal Expired' : `${count} Offers Expired`,
    subtitle: names,
    body: `${count} brand deal offer${count > 1 ? 's' : ''} expired. New offers will arrive soon.`,
    metrics: { count, platform: 'instavibe' },
    idempotency_key: `brand_expired:${pid}:${tid}`,
    group_key: `brand:${pid}:expired`,
    priority: 'low', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}

function buildCompletedNotif(pid: string, tid: number, names: string[], totalPayout: number, bonusAmount: number) {
  const count = names.length;
  const nameStr = names.slice(0, 2).join(', ') + (count > 2 ? ` +${count - 2} more` : '');
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_COMPLETED',
    title: count === 1 ? 'Brand Deal Complete!' : `${count} Deals Complete!`,
    subtitle: `${nameStr} — $${totalPayout.toLocaleString()} earned${bonusAmount > 0 ? ` (+$${bonusAmount.toLocaleString()} bonus!)` : ''}`,
    body: `Your brand partnership${count > 1 ? 's' : ''} with ${nameStr} wrapped up. Total earned: $${totalPayout.toLocaleString()}.`,
    metrics: { count, total_payout: totalPayout, bonus: bonusAmount, brand_names: names, platform: 'instavibe' },
    idempotency_key: `brand_completed:${pid}:${tid}`,
    group_key: `brand:${pid}:completed`,
    priority: 'medium', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}

function buildCancelledNotif(pid: string, tid: number, names: string[]) {
  const count = names.length;
  const nameStr = names.join(', ');
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_CANCELLED',
    title: count === 1 ? 'Brand Deal Cancelled' : `${count} Deals Cancelled`,
    subtitle: `${nameStr} pulled out`,
    body: `${nameStr} cancelled ${count > 1 ? 'their partnerships' : 'the partnership'}. This may affect your brand reputation. Future offers will adjust.`,
    metrics: { count, brand_names: names, platform: 'instavibe' },
    idempotency_key: `brand_cancelled:${pid}:${tid}`,
    group_key: `brand:${pid}:cancelled`,
    priority: 'high', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}

function buildBreachedNotif(pid: string, tid: number, names: string[]) {
  const count = names.length;
  const nameStr = names.slice(0, 2).join(', ') + (count > 2 ? ` +${count - 2} more` : '');
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_BREACHED',
    title: count === 1 ? 'High-Profile Deal Breached' : `${count} High-Profile Deals Breached`,
    subtitle: `${nameStr} took a public brand hit`,
    body: `Missing obligations on ${nameStr} damaged your brand reputation. Premium partners will be more cautious for a while.`,
    metrics: { count, brand_names: names, platform: 'instavibe', severity: 'high_profile_breach' },
    idempotency_key: `brand_breached:${pid}:${tid}`,
    group_key: `brand:${pid}:breached`,
    priority: 'high', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}
