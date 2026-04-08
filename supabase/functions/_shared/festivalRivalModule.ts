/**
 * AMPLIFI FESTIVAL SYSTEM — Rival Snipes Module (Phase 2)
 *
 * Handles:
 *  1. Staging snipe actions (validation, anti-grief, cooldowns)
 *  2. Deterministic resolution at day tick (capped modifiers)
 *  3. Notification generation for attacker + target
 *
 * All snipes are staged during the hour and resolved on tick.
 * No real-time combat. Deterministic, capped, idempotent.
 */

import { selectCanonicalFandomSignals } from './fandomCanonicalSelectors.ts';
import { insertNotificationIdempotent } from './notificationInsert.ts';

// ── Constants ────────────────────────────────────────────────────────────────

export const SNIPE_ACTION_TYPES = [
  'COUNTERPROGRAM_DROP',
  'TIMELINE_FLOOD',
  'RUMOR_SPARK',
  'CLIP_HIJACK',
  'PEACE_SIGNAL',
  'PATRON_SIGNAL',   // Phase 3: unlocks secret stage + self credibility boost
  'TRUCE_OFFER',     // Phase 3: offer a truce to a target artist
  'TRUCE_BETRAY',    // Phase 3: betray an active truce for a bigger hit
] as const;

export type SnipeActionType = (typeof SNIPE_ACTION_TYPES)[number];

const NON_HOSTILE_ACTION_TYPES: SnipeActionType[] = ['PEACE_SIGNAL', 'PATRON_SIGNAL', 'TRUCE_OFFER'];

/** Influence cost per action type */
const SNIPE_COSTS: Record<SnipeActionType, number> = {
  COUNTERPROGRAM_DROP: 3,
  TIMELINE_FLOOD: 2,
  RUMOR_SPARK: 4,
  CLIP_HIJACK: 5,
  PEACE_SIGNAL: 1,
  PATRON_SIGNAL: 6,
  TRUCE_OFFER: 2,
  TRUCE_BETRAY: 3,
};

/** Cost multiplier used in resolution priority calculation */
const COST_MULTIPLIER: Record<SnipeActionType, number> = {
  COUNTERPROGRAM_DROP: 1.2,
  TIMELINE_FLOOD: 1.0,
  RUMOR_SPARK: 1.5,
  CLIP_HIJACK: 1.8,
  PEACE_SIGNAL: 0.5,
  PATRON_SIGNAL: 0,   // targets self, not included in offensive priority
  TRUCE_OFFER: 0,
  TRUCE_BETRAY: 2.0,
};

/** Raw effect vectors per action type (before caps and diminishing returns) */
const SNIPE_EFFECTS: Record<SnipeActionType, { crowd_heat: number; conversion: number; credibility: number }> = {
  COUNTERPROGRAM_DROP: { crowd_heat: -0.06, conversion: 0, credibility: 0 },
  TIMELINE_FLOOD:     { crowd_heat: 0, conversion: -0.05, credibility: 0 },
  RUMOR_SPARK:        { crowd_heat: -0.02, conversion: -0.02, credibility: -0.03 },
  CLIP_HIJACK:        { crowd_heat: -0.04, conversion: -0.03, credibility: 0 },
  PEACE_SIGNAL:       { crowd_heat: 0, conversion: 0, credibility: 0 },  // defensive, no offensive effect
  PATRON_SIGNAL:      { crowd_heat: 0, conversion: 0, credibility: 0 },  // self-targeted, handled separately
  TRUCE_OFFER:        { crowd_heat: 0, conversion: 0, credibility: 0 },  // handled by truce system
  TRUCE_BETRAY:       { crowd_heat: -0.10, conversion: -0.04, credibility: -0.02 },  // hits target hard
};

/** Self-boost for attacker when COUNTERPROGRAM_DROP and they perform same day */
const COUNTERPROGRAM_SELF_BOOST = { crowd_heat: 0.03 };

/** Axis clamp ranges */
const AXIS_CLAMPS = {
  crowd_heat:  { min: -0.12, max: 0.06 },
  conversion:  { min: -0.10, max: 0.05 },
  credibility: { min: -0.05, max: 0.03 },
};

/** Anti-grief thresholds */
const LEVEL_GAP_RATIO = 6;            // attacker_clout > target_clout * 6 → blocked
const EXEMPT_LANES = ['HEADLINER', 'MAIN_PRIME'];  // exempt from level gap rule
const DAILY_SUBMIT_CAP = 2;           // max snipes per artist per day
const DAILY_TARGET_CAP = 4;           // max snipes received per artist per day
const DISCOVERY_SHIELD = 0.5;         // 50% reduction for Discovery lane artists
const INFLUENCE_PER_TURN = 2;         // influence regen per turn
const MAX_INFLUENCE = 15;             // influence cap
const DEFAULT_INFLUENCE = 8;          // starting influence

// ── Seeded RNG (same as festivalGlobalModule.ts) ──────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ── Partial RNG thresholds ────────────────────────────────────────────────────
// roll < 0.15  → backfire: attacker eats 40% of negative effect
// roll 0.15–0.55 → partial: 60% of base effect
// roll > 0.55  → full effect: 100%

const RNG_BACKFIRE_THRESHOLD  = 0.15;
const RNG_PARTIAL_THRESHOLD   = 0.55;
const RNG_PARTIAL_SCALE       = 0.6;
const RNG_BACKFIRE_SCALE      = 0.4;  // fraction of effect that hits attacker instead

// ── Stage a snipe action ─────────────────────────────────────────────────────

export interface StageSnipeParams {
  festivalInstanceId: string;
  attackerArtistId: string;
  targetArtistId: string;
  actionType: SnipeActionType;
  appliesToDayIndex: number;
  payload?: Record<string, any>;
  globalTurnId: number;
}

export interface StageSnipeResult {
  success: boolean;
  error?: string;
  actionId?: string;
  cost?: number;
}

export async function stageRivalSnipe(
  supabase: any,
  params: StageSnipeParams,
): Promise<StageSnipeResult> {
  const { festivalInstanceId, attackerArtistId, targetArtistId, actionType, appliesToDayIndex, payload, globalTurnId } = params;

  // 1. Validate action type
  if (!SNIPE_ACTION_TYPES.includes(actionType)) {
    return { success: false, error: 'Invalid action type' };
  }

  // 2. Self-target check
  if (attackerArtistId === targetArtistId && actionType !== 'PEACE_SIGNAL') {
    return { success: false, error: 'Cannot target yourself' };
  }
  // PEACE_SIGNAL: target = self
  const effectiveTarget = actionType === 'PEACE_SIGNAL' ? attackerArtistId : targetArtistId;

  // 3. Verify festival instance is LOCKED or LIVE
  const { data: instance } = await supabase
    .from('festival_instances')
    .select('id, status, lineup_lock_turn_id, festival_id')
    .eq('id', festivalInstanceId)
    .single();

  if (!instance || !['LOCKED', 'LIVE'].includes(instance.status)) {
    return { success: false, error: 'Festival not in active phase' };
  }

  // 4. Verify day hasn't resolved yet
  const { data: day } = await supabase
    .from('festival_instance_days')
    .select('id, resolve_turn_id, status')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('day_index', appliesToDayIndex)
    .single();

  if (!day) return { success: false, error: 'Invalid day index' };
  if (day.status === 'RESOLVED') return { success: false, error: 'Day already resolved' };
  if (globalTurnId >= day.resolve_turn_id) return { success: false, error: 'Too late — day is resolving' };

  // 5. Verify both artists are in lineup
  const { data: attackerSlot } = await supabase
    .from('festival_lineup_slots')
    .select('id, lane, secret_stage_unlocked')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('artist_id', attackerArtistId)
    .single();

  if (!attackerSlot) return { success: false, error: 'You are not in this lineup' };

  const { data: targetSlot } = await supabase
    .from('festival_lineup_slots')
    .select('lane')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('artist_id', effectiveTarget)
    .single();

  if (!targetSlot && actionType !== 'PEACE_SIGNAL') {
    return { success: false, error: 'Target not in lineup' };
  }

  if (actionType === 'PATRON_SIGNAL') {
    const { data: festivalConfig } = await supabase
      .from('festivals')
      .select('has_secret_stage')
      .eq('id', instance.festival_id)
      .maybeSingle();

    if (!festivalConfig?.has_secret_stage) {
      return { success: false, error: 'This festival has no secret stage to unlock' };
    }

    if (attackerSlot?.secret_stage_unlocked) {
      return { success: false, error: 'Your secret stage slot is already unlocked' };
    }
  }

  // 6. Anti-grief: level gap check
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, clout, fans')
    .in('id', [attackerArtistId, effectiveTarget]);

  const attackerProfile = profiles?.find((p: any) => p.id === attackerArtistId);
  const targetProfile = profiles?.find((p: any) => p.id === effectiveTarget);

  if (!attackerProfile) return { success: false, error: 'Profile not found' };

  if (actionType !== 'PEACE_SIGNAL' && targetProfile) {
    const attackerClout = Number(attackerProfile.clout ?? 0);
    const targetClout = Number(targetProfile.clout ?? 0);
    const bothExempt = EXEMPT_LANES.includes(attackerSlot.lane) && EXEMPT_LANES.includes(targetSlot?.lane || '');

    if (attackerClout > targetClout * LEVEL_GAP_RATIO && !bothExempt) {
      return { success: false, error: 'Cannot target much smaller artists from this lane' };
    }
  }

  // 6b. Truce guardrails
  if (actionType !== 'PEACE_SIGNAL') {
    const { data: activeTruce } = await supabase
      .from('festival_truces')
      .select('id, status, offerer_id, target_id')
      .eq('festival_instance_id', festivalInstanceId)
      .eq('status', 'ACTIVE')
      .or(`and(offerer_id.eq.${attackerArtistId},target_id.eq.${effectiveTarget}),and(offerer_id.eq.${effectiveTarget},target_id.eq.${attackerArtistId})`)
      .maybeSingle();

    if (activeTruce && !NON_HOSTILE_ACTION_TYPES.includes(actionType) && actionType !== 'TRUCE_BETRAY') {
      return { success: false, error: 'Active truce blocks hostile moves against this artist' };
    }

    if (actionType === 'TRUCE_BETRAY' && !activeTruce) {
      return { success: false, error: 'You need an active truce with this artist to betray it' };
    }
  }

  // 7. COUNTERPROGRAM_DROP requires recent release
  if (actionType === 'COUNTERPROGRAM_DROP') {
    const recentTurnThreshold = globalTurnId - 72; // ~3 in-game days
    const { count } = await supabase
      .from('releases')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', attackerArtistId)
      .gte('scheduled_turn', recentTurnThreshold);

    if ((count ?? 0) === 0) {
      return { success: false, error: 'Need a recent release to counterprogram' };
    }
  }

  // 8. CLIP_HIJACK requires medium stans or trend_chasers
  if (actionType === 'CLIP_HIJACK') {
    const { data: segmentRows } = await supabase
      .from('fandom_segments')
      .select('segment_type, count')
      .eq('player_id', attackerArtistId);

    const canonicalSignals = selectCanonicalFandomSignals({ segments: segmentRows || [] });
    const clipHijackReadiness = canonicalSignals.segmentShares.stan + canonicalSignals.segmentShares.trend_chaser;

    if (clipHijackReadiness < 0.05) {
      return { success: false, error: 'Need more stans or trend chasers for a clip hijack' };
    }
  }

  // 9. RUMOR_SPARK: check festival controversy_tolerance
  if (actionType === 'RUMOR_SPARK') {
    const { data: festival } = await supabase
      .from('festivals')
      .select('controversy_tolerance')
      .eq('id', instance.festival_id)
      .single();

    if ((festival?.controversy_tolerance ?? 0) < 30) {
      return { success: false, error: 'This festival doesn\'t tolerate rumors' };
    }
  }

  // 10. Daily submit cap check
  const { count: dailySubmitCount } = await supabase
    .from('festival_rival_actions')
    .select('id', { count: 'exact', head: true })
    .eq('festival_instance_id', festivalInstanceId)
    .eq('attacker_artist_id', attackerArtistId)
    .eq('applies_to_day_index', appliesToDayIndex)
    .in('status', ['STAGED', 'RESOLVED']);

  if ((dailySubmitCount ?? 0) >= DAILY_SUBMIT_CAP) {
    return { success: false, error: `Max ${DAILY_SUBMIT_CAP} snipes per day` };
  }

  // 11. Cooldown: same action type + same target in same festival → blocked (DB unique constraint)
  // The upsert will handle this, but let's check proactively for a better error message
  const { count: cooldownCount } = await supabase
    .from('festival_rival_actions')
    .select('id', { count: 'exact', head: true })
    .eq('festival_instance_id', festivalInstanceId)
    .eq('attacker_artist_id', attackerArtistId)
    .eq('target_artist_id', effectiveTarget)
    .eq('action_type', actionType);

  if ((cooldownCount ?? 0) > 0) {
    return { success: false, error: 'Already used this move on this target this festival' };
  }

  // 12. Influence cost — atomic deduction with balance check (R-2 race fix)
  const cost = SNIPE_COSTS[actionType];
  const { data: deductResult, error: deductError } = await supabase.rpc('deduct_influence_points', {
    p_artist_id: attackerArtistId,
    p_cost: cost,
  });
  if (deductError || deductResult === null) {
    const currentInfluence = Number(attackerProfile.influence_points ?? 0);
    return { success: false, error: `Need ${cost} influence (have ${Math.floor(currentInfluence)})` };
  }

  // 13. Insert the staged action
  const { data: inserted, error: insertErr } = await supabase
    .from('festival_rival_actions')
    .insert({
      festival_instance_id: festivalInstanceId,
      festival_instance_day_id: day.id,
      action_type: actionType,
      attacker_artist_id: attackerArtistId,
      target_artist_id: effectiveTarget,
      payload: payload || {},
      cost,
      submitted_turn_id: globalTurnId,
      applies_to_day_index: appliesToDayIndex,
      status: 'STAGED',
    })
    .select('id')
    .single();

  if (insertErr) {
    // Refund influence on insert failure (negative cost = add back)
    await supabase.rpc('deduct_influence_points', { p_artist_id: attackerArtistId, p_cost: -cost });
    return { success: false, error: insertErr.message || 'Insert failed' };
  }

  if (actionType === 'TRUCE_OFFER') {
    const { error: truceErr } = await supabase
      .from('festival_truces')
      .insert({
        festival_instance_id: festivalInstanceId,
        offerer_id: attackerArtistId,
        target_id: effectiveTarget,
        status: 'PENDING',
        offered_turn_id: globalTurnId,
      });

    if (truceErr) {
      await supabase
        .from('festival_rival_actions')
        .delete()
        .eq('id', inserted.id);
      await supabase.rpc('deduct_influence_points', { p_artist_id: attackerArtistId, p_cost: -cost });
      return { success: false, error: truceErr.message || 'Unable to create truce offer' };
    }
  }

  if (actionType === 'PATRON_SIGNAL') {
    const { error: unlockErr } = await supabase
      .from('festival_lineup_slots')
      .update({ secret_stage_unlocked: true })
      .eq('id', attackerSlot.id);

    if (unlockErr) {
      await supabase
        .from('festival_rival_actions')
        .delete()
        .eq('id', inserted.id);
      await supabase.rpc('deduct_influence_points', { p_artist_id: attackerArtistId, p_cost: -cost });
      return { success: false, error: unlockErr.message || 'Unable to unlock secret stage access' };
    }
  }

  return { success: true, actionId: inserted?.id, cost };
}

export interface RespondToTruceParams {
  truceId: string;
  artistId: string;
  accept: boolean;
  globalTurnId: number;
}

export async function respondToTruce(
  supabase: any,
  params: RespondToTruceParams,
): Promise<{ success: boolean; error?: string }> {
  const { truceId, artistId, accept, globalTurnId } = params;

  const { data: truce } = await supabase
    .from('festival_truces')
    .select('*')
    .eq('id', truceId)
    .maybeSingle();

  if (!truce) return { success: false, error: 'Truce not found' };
  if (truce.target_id !== artistId) return { success: false, error: 'Only the target can respond to this truce' };
  if (truce.status !== 'PENDING') return { success: false, error: `Truce already ${String(truce.status || '').toLowerCase()}` };

  const { error } = await supabase
    .from('festival_truces')
    .update({
      status: accept ? 'ACTIVE' : 'REJECTED',
      resolved_turn_id: globalTurnId,
    })
    .eq('id', truceId);

  if (error) return { success: false, error: error.message || 'Unable to update truce' };

  return { success: true };
}

// ── Resolve snipes for a day ─────────────────────────────────────────────────

export interface SnipeModifiers {
  crowd_heat_mod: number;
  conversion_mod: number;
  credibility_mod: number;
  moment_card_bias?: { boost: string[]; penalty: string[] };
  peace_shield: number;  // 0 or fraction that reduces incoming
  sources: Array<{ action_type: string; attacker_id: string; priority: number }>;
}

/**
 * Resolves all staged snipes for a given day. Returns per-artist modifier map.
 * Called from festivalGlobalModule BEFORE performance resolution.
 */
export async function resolveSnipesForDay(
  supabase: any,
  festivalInstanceId: string,
  dayIndex: number,
  globalTurnId: number,
): Promise<Map<string, SnipeModifiers>> {
  const modifiersMap = new Map<string, SnipeModifiers>();

  // Fetch all STAGED snipes for this day
  const { data: staged } = await supabase
    .from('festival_rival_actions')
    .select('*, attacker:profiles!festival_rival_actions_attacker_artist_id_fkey(id, clout, hype)')
    .eq('festival_instance_id', festivalInstanceId)
    .eq('applies_to_day_index', dayIndex)
    .eq('status', 'STAGED');

  if (!staged?.length) return modifiersMap;

  // Fetch lineup for Discovery lane shield check
  const { data: lineupSlots } = await supabase
    .from('festival_lineup_slots')
    .select('artist_id, lane')
    .eq('festival_instance_id', festivalInstanceId);

  const laneMap = new Map((lineupSlots || []).map((s: any) => [s.artist_id, s.lane]));
  const lineupArtistIds = Array.from(new Set((lineupSlots || []).map((s: any) => s.artist_id).filter(Boolean)));
  const { data: instance } = await supabase
    .from('festival_instances')
    .select('festival_id')
    .eq('id', festivalInstanceId)
    .maybeSingle();
  const { data: resistanceFactions } = instance?.festival_id
    ? await supabase
        .from('festival_factions')
        .select('id')
        .eq('festival_id', instance.festival_id)
        .eq('standing_effect', 'snipe_resistance')
    : { data: [] as any[] };
  const resistanceFactionIds = (resistanceFactions || []).map((f: any) => f.id);
  const { data: resistanceRows } = resistanceFactionIds.length && lineupArtistIds.length
    ? await supabase
        .from('player_faction_standing')
        .select('player_id, faction_id, standing')
        .in('player_id', lineupArtistIds)
        .in('faction_id', resistanceFactionIds)
    : { data: [] as any[] };
  const resistanceMap = new Map<string, number>();
  for (const row of (resistanceRows || [])) {
    resistanceMap.set(`${row.player_id}:${row.faction_id}`, Number(row.standing ?? 0));
  }

  // Group by target
  const byTarget = new Map<string, any[]>();
  for (const action of staged) {
    const key = action.target_artist_id;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(action);
  }

  // Track attacker self-boosts for COUNTERPROGRAM_DROP
  const attackerBoosts = new Map<string, { crowd_heat: number }>();

  for (const [targetId, actions] of byTarget.entries()) {
    // Initialize modifiers for this target
    const mods: SnipeModifiers = {
      crowd_heat_mod: 0,
      conversion_mod: 0,
      credibility_mod: 0,
      moment_card_bias: undefined,
      peace_shield: 0,
      sources: [],
    };

    // Check if target has a PEACE_SIGNAL (it targets self)
    const peaceActions = actions.filter((a: any) => a.action_type === 'PEACE_SIGNAL');
    if (peaceActions.length > 0) {
      mods.peace_shield = 0.5;  // 50% reduction
      // Peace signal also slightly lowers own crowd_heat
      mods.crowd_heat_mod -= 0.03;
    }

    // Filter offensive snipes (exclude PEACE_SIGNAL since it targets self)
    const offensiveActions = actions.filter((a: any) => a.action_type !== 'PEACE_SIGNAL');

    // Discovery lane passive shield
    const targetLane = laneMap.get(targetId);
    const discoveryShield = targetLane === 'DISCOVERY' ? DISCOVERY_SHIELD : 0;
    const totalResistanceStanding = resistanceFactionIds.reduce((sum: number, factionId: string) => {
      return sum + (resistanceMap.get(`${targetId}:${factionId}`) ?? 0);
    }, 0);
    const avgResistanceStanding = resistanceFactionIds.length ? totalResistanceStanding / resistanceFactionIds.length : 0;
    const factionResistanceShield = Math.max(-0.1, Math.min(0.2, avgResistanceStanding / 500));
    const totalShield = Math.max(0, Math.min(0.75, mods.peace_shield + discoveryShield + factionResistanceShield));

    // Target cap: max 4 offensive snipes apply
    // Sort by priority to keep the strongest ones
    const prioritizedActions = offensiveActions
      .map((a: any) => {
        const attackerClout = Number(a.attacker?.clout ?? 0);
        const attackerHype = Number(a.attacker?.hype ?? 50);
        const fatigueFactor = 1 - (100 - attackerHype) / 200;  // less fatigued = higher priority
        const priority = Math.log10(Math.max(1, attackerClout)) * fatigueFactor * (COST_MULTIPLIER[a.action_type as SnipeActionType] || 1);
        return { ...a, _priority: priority };
      })
      .sort((a: any, b: any) => b._priority - a._priority)
      .slice(0, DAILY_TARGET_CAP);

    // Apply diminishing returns: first 2 at full strength, 3rd at 50%, 4th at 25%
    const diminishingScale = [1.0, 1.0, 0.5, 0.25];

    // Track attacker backfire effects for this day
    const attackerBackfireThisBatch = new Map<string, { crowd_heat: number; conversion: number; credibility: number }>();

    for (let i = 0; i < prioritizedActions.length; i++) {
      const action = prioritizedActions[i];
      const scale = diminishingScale[i] ?? 0.25;
      const effects = SNIPE_EFFECTS[action.action_type as SnipeActionType];
      if (!effects) continue;

      // Skip non-offensive action types in the loop (handled elsewhere)
      if (['PATRON_SIGNAL', 'TRUCE_OFFER', 'PEACE_SIGNAL'].includes(action.action_type)) continue;

      const shieldMult = 1 - totalShield;

      // ── Partial RNG (Phase 3) ──────────────────────────────────────────────
      // Seeded per action ID + globalTurnId for full auditability
      const rngSeed = hashStr(`snipe_rng:${action.id}:${globalTurnId}`);
      const roll = mulberry32(rngSeed);

      let rngMult: number;
      let didBackfire = false;

      if (roll < RNG_BACKFIRE_THRESHOLD) {
        // Backfire: action fizzles and attacker eats part of the effect
        // R-3 FIX: Changed -= to += because SNIPE_EFFECTS values are already negative.
        // Using -= with negative values made backfires accidentally REWARD the attacker.
        // Now += with negative effects correctly penalizes the attacker.
        rngMult = 0;
        didBackfire = true;
        const bf = attackerBackfireThisBatch.get(action.attacker_artist_id) || { crowd_heat: 0, conversion: 0, credibility: 0 };
        bf.crowd_heat  += effects.crowd_heat  * scale * RNG_BACKFIRE_SCALE;
        bf.conversion  += effects.conversion  * scale * RNG_BACKFIRE_SCALE;
        bf.credibility += effects.credibility * scale * RNG_BACKFIRE_SCALE;
        attackerBackfireThisBatch.set(action.attacker_artist_id, bf);
      } else if (roll < RNG_PARTIAL_THRESHOLD) {
        rngMult = RNG_PARTIAL_SCALE;
      } else {
        rngMult = 1.0;
      }

      mods.crowd_heat_mod += effects.crowd_heat * scale * shieldMult * rngMult;
      mods.conversion_mod += effects.conversion * scale * shieldMult * rngMult;
      mods.credibility_mod += effects.credibility * scale * shieldMult * rngMult;

      mods.sources.push({
        action_type: action.action_type,
        attacker_id: action.attacker_artist_id,
        priority: action._priority,
        rng_roll: roll,
        backfired: didBackfire,
      } as any);

      // CLIP_HIJACK: bias moment cards
      if (action.action_type === 'CLIP_HIJACK') {
        if (!mods.moment_card_bias) mods.moment_card_bias = { boost: [], penalty: [] };
        mods.moment_card_bias.penalty.push('TechnicalFail', 'AwkwardSpeech');
        // Attacker gets positive bias (tracked separately in their own modifiers)
        const attackerMods = modifiersMap.get(action.attacker_artist_id) || {
          crowd_heat_mod: 0, conversion_mod: 0, credibility_mod: 0,
          moment_card_bias: undefined, peace_shield: 0, sources: [],
        };
        if (!attackerMods.moment_card_bias) attackerMods.moment_card_bias = { boost: [], penalty: [] };
        attackerMods.moment_card_bias.boost.push('ViralChorusClip');
        modifiersMap.set(action.attacker_artist_id, attackerMods);
      }

      // COUNTERPROGRAM_DROP: attacker gets crowd_heat boost if performing same day
      if (action.action_type === 'COUNTERPROGRAM_DROP') {
        const existing = attackerBoosts.get(action.attacker_artist_id) || { crowd_heat: 0 };
        existing.crowd_heat += COUNTERPROGRAM_SELF_BOOST.crowd_heat * scale;
        attackerBoosts.set(action.attacker_artist_id, existing);
      }
    }

    // Clamp axes
    mods.crowd_heat_mod = Math.max(AXIS_CLAMPS.crowd_heat.min, Math.min(AXIS_CLAMPS.crowd_heat.max, mods.crowd_heat_mod));
    mods.conversion_mod = Math.max(AXIS_CLAMPS.conversion.min, Math.min(AXIS_CLAMPS.conversion.max, mods.conversion_mod));
    mods.credibility_mod = Math.max(AXIS_CLAMPS.credibility.min, Math.min(AXIS_CLAMPS.credibility.max, mods.credibility_mod));

    modifiersMap.set(targetId, mods);

    // Mark all actions for this target as RESOLVED
    const actionIds = actions.map((a: any) => a.id);
    // Mark rejected if over target cap
    const rejectedIds = offensiveActions.slice(DAILY_TARGET_CAP).map((a: any) => a.id);

    if (rejectedIds.length) {
      await supabase
        .from('festival_rival_actions')
        .update({ status: 'REJECTED', reject_reason: 'Target snipe cap exceeded' })
        .in('id', rejectedIds);
    }

    const resolvedIds = actionIds.filter((id: string) => !rejectedIds.includes(id));
    if (resolvedIds.length) {
      await supabase
        .from('festival_rival_actions')
        .update({
          status: 'RESOLVED',
          resolved_effects: {
            crowd_heat_mod: mods.crowd_heat_mod,
            conversion_mod: mods.conversion_mod,
            credibility_mod: mods.credibility_mod,
            sources: mods.sources,
          },
        })
        .in('id', resolvedIds);
    }

    // Apply backfire effects to attackers as modifiers in their own map entry
    for (const [attackerId, bf] of attackerBackfireThisBatch.entries()) {
      const existing = modifiersMap.get(attackerId) || {
        crowd_heat_mod: 0, conversion_mod: 0, credibility_mod: 0,
        moment_card_bias: undefined, peace_shield: 0, sources: [],
      };
      existing.crowd_heat_mod  = Math.max(AXIS_CLAMPS.crowd_heat.min,  existing.crowd_heat_mod  + bf.crowd_heat);
      existing.conversion_mod  = Math.max(AXIS_CLAMPS.conversion.min,  existing.conversion_mod  + bf.conversion);
      existing.credibility_mod = Math.max(AXIS_CLAMPS.credibility.min, existing.credibility_mod + bf.credibility);
      modifiersMap.set(attackerId, existing);
    }
  }

  // Apply attacker self-boosts from COUNTERPROGRAM_DROP
  for (const [attackerId, boost] of attackerBoosts.entries()) {
    const existing = modifiersMap.get(attackerId) || {
      crowd_heat_mod: 0, conversion_mod: 0, credibility_mod: 0,
      moment_card_bias: undefined, peace_shield: 0, sources: [],
    };
    existing.crowd_heat_mod = Math.min(
      AXIS_CLAMPS.crowd_heat.max,
      existing.crowd_heat_mod + boost.crowd_heat,
    );
    modifiersMap.set(attackerId, existing);
  }

  return modifiersMap;
}

// ── Snipe notifications (called after resolution) ────────────────────────────

export async function emitSnipeNotifications(
  supabase: any,
  festivalInstanceId: string,
  dayIndex: number,
  globalTurnId: number,
  modifiersMap: Map<string, SnipeModifiers>,
): Promise<void> {
  // Fetch festival name
  const { data: instance } = await supabase
    .from('festival_instances')
    .select('festival_id')
    .eq('id', festivalInstanceId)
    .single();

  const { data: festival } = await supabase
    .from('festivals')
    .select('name')
    .eq('id', instance?.festival_id)
    .single();

  const festName = festival?.name || 'Festival';

  for (const [artistId, mods] of modifiersMap.entries()) {
    // Notify targets who got meaningfully sniped
    const totalImpact = Math.abs(mods.crowd_heat_mod) + Math.abs(mods.conversion_mod) + Math.abs(mods.credibility_mod);
    if (totalImpact > 0.02 && mods.sources.length > 0) {
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: artistId,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_SNIPE_TARGET',
          title: `${festName} — Noise detected around your set`,
          subtitle: `Day ${dayIndex} · ${mods.sources.length} action${mods.sources.length > 1 ? 's' : ''}`,
          body: `Some activity shifted the crowd energy around your Day ${dayIndex} performance. ${mods.peace_shield > 0 ? 'Your peace signal absorbed some of it.' : ''}`,
          metrics: { crowd_heat_mod: mods.crowd_heat_mod, conversion_mod: mods.conversion_mod, credibility_mod: mods.credibility_mod },
          priority: 'medium',
          is_read: false,
          idempotency_key: `festival_snipe_target:${artistId}:${festivalInstanceId}:${dayIndex}`,
          deep_links: { page: 'AmplifiApp' },
        }, 'festivalRivalModule.target');
      } catch (err: any) {
        console.warn(`[FESTIVAL_NOTIF_FAIL] target=${artistId} turn=${globalTurnId}:`, err?.message);
      }
    }

    // Notify attackers who landed meaningful snipes
    for (const src of mods.sources) {
      if (src.attacker_id === artistId) continue;  // don't double-notify
      try {
        await insertNotificationIdempotent(supabase, {
          player_id: src.attacker_id,
          global_turn_id: globalTurnId,
          created_turn_index: globalTurnId,
          type: 'FESTIVAL_SNIPE_ATTACKER',
          title: `${festName} — Your counterplay shifted the feed`,
          subtitle: `Day ${dayIndex} · ${src.action_type.replace(/_/g, ' ').toLowerCase()}`,
          body: `Your move had an effect on the crowd dynamics for Day ${dayIndex}.`,
          priority: 'low',
          is_read: false,
          idempotency_key: `festival_snipe_attacker:${src.attacker_id}:${festivalInstanceId}:${dayIndex}:${src.action_type}`,
          deep_links: { page: 'AmplifiApp' },
        }, 'festivalRivalModule.attacker');
      } catch (err: any) {
        console.warn(`[FESTIVAL_NOTIF_FAIL] attacker=${src.attacker_id} turn=${globalTurnId}:`, err?.message);
      }
    }
  }
}

// ── Truce resolution (Phase 3) ────────────────────────────────────────────────

/**
 * Resolves pending truces and checks for betrayals.
 * Called from festivalGlobalModule BEFORE snipe resolution (F0.5).
 *
 * - PENDING truces: NPC targets decide via seeded RNG. Player targets stay PENDING.
 * - ACTIVE truces: check for TRUCE_BETRAY actions; if found, mark BETRAYED + apply credibility penalty to betrayer.
 * - Active truces block offensive snipes (checked in stageRivalSnipe via DB query).
 */
export async function resolveTrucesForInstance(
  supabase: any,
  festivalInstanceId: string,
  globalTurnId: number,
): Promise<void> {
  // Fetch all non-terminal truces for this instance
  const { data: truces } = await supabase
    .from('festival_truces')
    .select('*')
    .eq('festival_instance_id', festivalInstanceId)
    .in('status', ['PENDING', 'ACTIVE']);

  if (!truces?.length) return;

  for (const truce of truces) {
    // ── PENDING: NPC targets decide ──────────────────────────────────────────
    if (truce.status === 'PENDING') {
      // Check if target is an NPC (no profile row = NPC, or no auth user)
      // Simple heuristic: if target has never submitted to any festival = NPC
      const { count: playerCount } = await supabase
        .from('festival_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', truce.target_id);

      const isNpc = (playerCount ?? 0) === 0;

      if (isNpc) {
        // Seeded roll: NPC accepts if roll > 0.4
        const seed = hashStr(`truce_npc:${truce.id}:${globalTurnId}`);
        const roll = mulberry32(seed);
        const accepted = roll > 0.4;

        await supabase
          .from('festival_truces')
          .update({
            status: accepted ? 'ACTIVE' : 'REJECTED',
            resolved_turn_id: globalTurnId,
            npc_accept_roll: roll,
          })
          .eq('id', truce.id);
      }
      // Player targets: leave as PENDING — they respond via UI (respondToTruce subAction)
      continue;
    }

    // ── ACTIVE: check for betrayals ───────────────────────────────────────────
    if (truce.status === 'ACTIVE') {
      // Check if either party staged a TRUCE_BETRAY
      const { data: betrayals } = await supabase
        .from('festival_rival_actions')
        .select('attacker_artist_id, status')
        .eq('festival_instance_id', festivalInstanceId)
        .eq('action_type', 'TRUCE_BETRAY')
        .in('attacker_artist_id', [truce.offerer_id, truce.target_id])
        .in('status', ['STAGED', 'RESOLVED']);

      if (!betrayals?.length) continue;

      const betrayerIds = betrayals.map((b: any) => b.attacker_artist_id);
      const offererBetrayed = betrayerIds.includes(truce.offerer_id);
      const targetBetrayed = betrayerIds.includes(truce.target_id);

      let newStatus: string = 'ACTIVE';
      if (offererBetrayed || targetBetrayed) {
        newStatus = offererBetrayed ? 'BETRAYED_BY_OFFERER' : 'BETRAYED_BY_TARGET';
      }

      if (newStatus !== 'ACTIVE') {
        await supabase
          .from('festival_truces')
          .update({
            status: newStatus,
            resolved_turn_id: globalTurnId,
            offerer_betrayed: offererBetrayed,
            target_betrayed: targetBetrayed,
          })
          .eq('id', truce.id);

        // Credibility penalty applied to the betrayer via their snipe resolution
        // (TRUCE_BETRAY effect includes credibility: -0.02 already in SNIPE_EFFECTS)
      }
    }
  }
}

// ── Influence regeneration (called each global turn) ─────────────────────────

export async function regenInfluencePoints(supabase: any): Promise<void> {
  try {
    await supabase.rpc('increment_influence_points', {
      regen_amount: INFLUENCE_PER_TURN,
      max_cap: MAX_INFLUENCE,
    });
  } catch (err: any) {
    console.warn(`[INFLUENCE_REGEN_FAIL] ${err?.message}`);
  }
}
