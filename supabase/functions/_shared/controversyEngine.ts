/**
 * CONTROVERSY ENGINE — Pure Logic Layer
 * ──────────────────────────────────────
 * Deterministic, no DB access, no side effects.
 * Handles: 4-phase controversy arcs, spread rates, responses, backfire checks.
 *
 * Phases: spark → spread → peak → aftermath → resolved
 */

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const N = (v: unknown): number => Number(v) || 0;

// ─── SEEDED RNG ──────────────────────────────────────────────────────────────
// Same pattern as chartUpdateModule.ts, festivalGlobalModule.ts, fanWarTickModule.ts
function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ControversyType = 'messy_post' | 'plagiarism_rumor' | 'label_beef' | 'political_take' | 'shady_receipts' | 'ex_collab_drama';
export type ControversyPhase = 'spark' | 'spread' | 'peak' | 'aftermath' | 'resolved';
export type ResponseType = 'deny' | 'apologize' | 'lean_in' | 'distract' | 'lawyer_up';

export interface ControversyCase {
  id: string;
  player_id: string;
  originator_player_id: string | null;
  epicenter_city_id?: string | null;
  controversy_type: ControversyType;
  severity: number;         // 1-10
  credibility: number;      // 1-10
  memeability: number;      // 1-10
  phase: ControversyPhase;
  public_attention: number; // 0-200
  tick_started: number;
  tick_peaked: number | null;
  tick_resolved: number | null;
  phase_ticks_in_current: number;
  response_taken: ResponseType | null;
  response_tick: number | null;
  backfired: boolean;
  brand_trust_delta_total: number;
  fan_morale_delta_total: number;
  trigger_details: Record<string, unknown>;
  updated_at?: string;
}

export interface ControversyAdvanceResult {
  patch: Partial<ControversyCase>;
  brandTrustDelta: number;
  fanMoraleDelta: number;
  notifications: Array<{ title: string; subtitle: string; body: string; priority: string }>;
  events: string[];
}

// ─── TYPE DEFAULTS ───────────────────────────────────────────────────────────

export const CONTROVERSY_TYPE_DEFAULTS: Record<ControversyType, { severity: number; credibility: number; memeability: number }> = {
  messy_post:       { severity: 3, credibility: 6, memeability: 9 },
  plagiarism_rumor: { severity: 7, credibility: 5, memeability: 4 },
  label_beef:       { severity: 5, credibility: 7, memeability: 6 },
  political_take:   { severity: 6, credibility: 4, memeability: 7 },
  shady_receipts:   { severity: 8, credibility: 8, memeability: 5 },
  ex_collab_drama:  { severity: 4, credibility: 6, memeability: 10 },
};

// ─── PHASE DURATION ──────────────────────────────────────────────────────────

function spreadDuration(severity: number, credibility: number): number {
  // 1-3 ticks based on severity × credibility
  return clamp(Math.round((severity * credibility) / 25), 1, 3);
}

// ─── ADVANCE PHASE ───────────────────────────────────────────────────────────

/**
 * Advance a controversy case by one tick. Pure function.
 * Returns a patch to apply + deltas for brand_trust and fan_morale.
 */
export function advanceControversy(
  c: ControversyCase,
  globalTurnId: number,
  platformSpotlightBonus: number, // 0-1, from hype/algorithm
  controversyRecoveryMult: number, // from pillar effects (activist = 2.0)
  controversySeverityMult: number, // from pillar effects (diva = 1.15)
): ControversyAdvanceResult {
  const patch: Partial<ControversyCase> = {};
  let brandTrustDelta = 0;
  let fanMoraleDelta = 0;
  const notifications: ControversyAdvanceResult['notifications'] = [];
  const events: string[] = [];
  const ticksInPhase = c.phase_ticks_in_current + 1;

  switch (c.phase) {
    // ── SPARK (1 tick) ──────────────────────────────────────────────────────
    case 'spark': {
      // Spark always lasts exactly 1 tick, then transitions to spread
      const initialAttention = Math.round(c.memeability * 3 + c.severity * 2);
      patch.phase = 'spread';
      patch.phase_ticks_in_current = 0;
      patch.public_attention = clamp(c.public_attention + initialAttention, 0, 200);
      fanMoraleDelta = -3;
      events.push('controversy_sparked');
      notifications.push({
        title: 'Controversy Sparked',
        subtitle: `${formatType(c.controversy_type)} — Severity ${c.severity}`,
        body: `A ${formatType(c.controversy_type)} controversy has emerged. It's starting to spread. You can respond now or let it play out.`,
        priority: 'high',
      });
      break;
    }

    // ── SPREAD (1-3 ticks) ──────────────────────────────────────────────────
    case 'spread': {
      const maxSpreadTicks = spreadDuration(c.severity, c.credibility);
      // Attention grows each tick during spread
      const spreadRate = Math.round(c.memeability * (1 + platformSpotlightBonus) * 5);
      patch.public_attention = clamp(c.public_attention + spreadRate, 0, 200);
      brandTrustDelta = Math.round(-2 * controversySeverityMult);
      fanMoraleDelta = Math.round(-5 * controversySeverityMult);

      // Check if response was taken this phase
      if (c.response_taken && !c.backfired) {
        const responseResult = applyResponse(c, c.response_taken, controversyRecoveryMult);
        brandTrustDelta += responseResult.brandTrustDelta;
        fanMoraleDelta += responseResult.fanMoraleDelta;
        if (responseResult.backfired) {
          patch.backfired = true;
          patch.public_attention = clamp((patch.public_attention ?? c.public_attention) + 30, 0, 200);
          events.push('response_backfired');
        }
        if (responseResult.stopSpread) {
          // Response stopped spread — skip to aftermath
          patch.phase = 'aftermath';
          patch.phase_ticks_in_current = 0;
          events.push('spread_stopped_by_response');
          break;
        }
      }

      if (ticksInPhase >= maxSpreadTicks) {
        // Transition to peak
        patch.phase = 'peak';
        patch.phase_ticks_in_current = 0;
        patch.tick_peaked = globalTurnId;
        events.push('controversy_peaked');
        notifications.push({
          title: 'Controversy at Peak',
          subtitle: `Attention: ${patch.public_attention ?? c.public_attention}`,
          body: 'Maximum attention reached. Critics are growing. Choose your response carefully — silence will make it worse.',
          priority: 'critical',
        });
      } else {
        patch.phase_ticks_in_current = ticksInPhase;
      }
      break;
    }

    // ── PEAK (1 tick) ───────────────────────────────────────────────────────
    case 'peak': {
      // Peak: maximum damage tick
      brandTrustDelta = Math.round(-4 * controversySeverityMult);
      fanMoraleDelta = Math.round(-10 * controversySeverityMult);

      // If no response by peak, extra tick of spread-level attention
      if (!c.response_taken) {
        patch.public_attention = clamp(c.public_attention + Math.round(c.memeability * 2), 0, 200);
        fanMoraleDelta -= 3; // silence penalty
        events.push('no_response_at_peak');
      } else {
        const responseResult = applyResponse(c, c.response_taken, controversyRecoveryMult);
        brandTrustDelta += responseResult.brandTrustDelta;
        fanMoraleDelta += responseResult.fanMoraleDelta;
        if (responseResult.backfired) {
          patch.backfired = true;
          events.push('response_backfired_at_peak');
        }
      }

      // Always transition to aftermath
      patch.phase = 'aftermath';
      patch.phase_ticks_in_current = 0;
      events.push('entering_aftermath');
      break;
    }

    // ── AFTERMATH (until attention < 10) ────────────────────────────────────
    case 'aftermath': {
      // Attention decays at 15/tick
      const newAttention = clamp(c.public_attention - 15, 0, 200);
      patch.public_attention = newAttention;

      // Trust recovery: +2/tick if response was appropriate, -1/tick if backfired
      if (c.response_taken && !c.backfired) {
        brandTrustDelta = Math.round(2 * controversyRecoveryMult);
      } else if (c.backfired) {
        brandTrustDelta = -1;
      } else {
        brandTrustDelta = 1; // slow passive recovery
      }

      // Morale slowly recovers
      fanMoraleDelta = 2;

      if (newAttention <= 5) {
        // Resolve
        patch.phase = 'resolved';
        patch.tick_resolved = globalTurnId;
        patch.phase_ticks_in_current = 0;
        events.push('controversy_resolved');
        notifications.push({
          title: 'Controversy Resolved',
          subtitle: `Impact: ${c.brand_trust_delta_total + brandTrustDelta} trust`,
          body: 'The controversy has died down. Brand safety shadow will persist for 3 more ticks.',
          priority: 'medium',
        });
      } else {
        patch.phase_ticks_in_current = ticksInPhase;
      }
      break;
    }

    default:
      // resolved — no-op
      break;
  }

  // Accumulate totals
  patch.brand_trust_delta_total = c.brand_trust_delta_total + brandTrustDelta;
  patch.fan_morale_delta_total = c.fan_morale_delta_total + fanMoraleDelta;
  patch.updated_at = new Date().toISOString() as any;

  return { patch, brandTrustDelta, fanMoraleDelta, notifications, events };
}

// ─── RESPONSE LOGIC ──────────────────────────────────────────────────────────

interface ResponseResult {
  brandTrustDelta: number;
  fanMoraleDelta: number;
  backfired: boolean;
  stopSpread: boolean;
}

function applyResponse(c: ControversyCase, response: ResponseType, recoveryMult: number): ResponseResult {
  switch (response) {
    case 'deny':
      // Stops spread IF credibility < 5; otherwise backfires
      if (c.credibility < 5) {
        return { brandTrustDelta: 0, fanMoraleDelta: 2, backfired: false, stopSpread: true };
      }
      return { brandTrustDelta: -3, fanMoraleDelta: -5, backfired: true, stopSpread: false };

    case 'apologize':
      // +5 trust/tick for 3 ticks; backfires if credibility of claim is low (< 4)
      if (c.credibility < 4) {
        return { brandTrustDelta: -2, fanMoraleDelta: -3, backfired: true, stopSpread: false };
      }
      return { brandTrustDelta: Math.round(5 * recoveryMult), fanMoraleDelta: 3, backfired: false, stopSpread: false };

    case 'lean_in':
      // virality +20, brand_trust -8, stan loyalty +10 (chaotic energy)
      return { brandTrustDelta: -8, fanMoraleDelta: 5, backfired: false, stopSpread: false };

    case 'distract':
      // Shifts attention; controversy goes dormant. Requires content (assumed valid if chosen)
      return { brandTrustDelta: 0, fanMoraleDelta: 2, backfired: false, stopSpread: true };

    case 'lawyer_up':
      // Stops spread; public_attention frozen; no trust gain; costs $2500
      return { brandTrustDelta: 0, fanMoraleDelta: -2, backfired: false, stopSpread: true };

    default:
      return { brandTrustDelta: 0, fanMoraleDelta: 0, backfired: false, stopSpread: false };
  }
}

// ─── CONTROVERSY TRIGGERS ────────────────────────────────────────────────────

/**
 * Check if a social post should trigger a controversy based on alignment tags.
 * Returns null if no controversy, or a partial ControversyCase to create.
 * Uses seeded RNG for deterministic, replayable trigger decisions.
 */
export function checkPostControversyTrigger(
  post: { id?: string; alignment_tag?: string; subtweet_target_id?: string; platform?: string },
  playerHype: number,
  playerFollowers: number,
  rngSeed?: string,
): { type: ControversyType; severity: number; credibility: number; memeability: number } | null {
  // Subtweets with high visibility can trigger controversy
  if (post.subtweet_target_id && playerFollowers > 500) {
    // Chance scales with hype — more visible = more likely to spark
    const triggerChance = clamp(playerHype / 200, 0.05, 0.4);
    const seed = rngSeed || `controversy_trigger:${post.id || 'unknown'}`;
    const rng = mulberry32(hashStr(seed));
    if (rng() < triggerChance) {
      return {
        type: 'messy_post',
        ...CONTROVERSY_TYPE_DEFAULTS.messy_post,
      };
    }
  }
  return null;
}

/**
 * Create a new controversy case from a trigger event.
 */
export function createControversyFromTrigger(
  playerId: string,
  type: ControversyType,
  globalTurnId: number,
  overrides: Partial<{ severity: number; credibility: number; memeability: number; originator_player_id: string; trigger_details: Record<string, unknown> }> = {},
): Omit<ControversyCase, 'id'> {
  const defaults = CONTROVERSY_TYPE_DEFAULTS[type];
  return {
    player_id: playerId,
    originator_player_id: overrides.originator_player_id || null,
    controversy_type: type,
    severity: clamp(overrides.severity ?? defaults.severity, 1, 10),
    credibility: clamp(overrides.credibility ?? defaults.credibility, 1, 10),
    memeability: clamp(overrides.memeability ?? defaults.memeability, 1, 10),
    phase: 'spark',
    public_attention: 0,
    tick_started: globalTurnId,
    tick_peaked: null,
    tick_resolved: null,
    phase_ticks_in_current: 0,
    response_taken: null,
    response_tick: null,
    backfired: false,
    brand_trust_delta_total: 0,
    fan_morale_delta_total: 0,
    trigger_details: overrides.trigger_details || {},
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatType(t: ControversyType): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Count active (non-resolved) controversies and compute total controversyActiveTicks
 * for the fandom segments engine input signal.
 */
export function computeControversySignal(cases: ControversyCase[]): {
  activeCount: number;
  totalActiveTicks: number;
  hasPeakPhase: boolean;
} {
  let activeCount = 0;
  let totalActiveTicks = 0;
  let hasPeakPhase = false;
  for (const c of cases) {
    if (c.phase === 'resolved') continue;
    activeCount++;
    totalActiveTicks += c.phase_ticks_in_current + 1;
    if (c.phase === 'peak') hasPeakPhase = true;
  }
  return { activeCount, totalActiveTicks, hasPeakPhase };
}
