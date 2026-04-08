import { MARKETING_PERSONAS, type MarketingPersonaId } from './marketingPersona.ts';

function N(v: unknown): number { return Number(v) || 0; }
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const ARCHETYPE_PERSONA_HINTS: Record<string, MarketingPersonaId[]> = {
  trend_chasers: ['viral_trendsetter', 'party_club_catalyst', 'internet_troll'],
  critics_adjacent: ['conscious_voice', 'producer_visionary', 'relatable_storyteller'],
  nostalgia_seekers: ['nostalgic_boom_bap', 'street_authentic'],
  underground_purists: ['street_authentic', 'conscious_voice'],
};

export function buildPersonaBreakdown(personaScores: Record<string, number> = {}, primary?: string | null, secondary?: string | null): Record<string, number> {
  const base: Record<string, number> = {};
  for (const id of Object.keys(MARKETING_PERSONAS)) {
    base[id] = clamp(Math.round(N(personaScores[id]) * 100), 0, 100);
  }
  if (primary && !base[primary]) base[primary] = 60;
  if (secondary && !base[secondary]) base[secondary] = 40;
  return base;
}

export function calculateIdentityAlignment(input: {
  corePrimary?: string | null;
  expressionPrimary?: string | null;
  expressionSecondary?: string | null;
  personaBreakdown?: Record<string, number>;
  fanArchetypes?: Record<string, number>;
}) {
  const expressionPrimary = input.expressionPrimary || input.corePrimary || null;
  const expressionSecondary = input.expressionSecondary || expressionPrimary;
  const p = input.personaBreakdown || {};

  const primaryPct = clamp(N(expressionPrimary ? p[expressionPrimary] : 0), 0, 100);
  const secondaryPct = clamp(N(expressionSecondary ? p[expressionSecondary] : primaryPct), 0, 100);
  let alignment = 0.65 * primaryPct + 0.35 * secondaryPct;

  const archetypes = input.fanArchetypes || {};
  const total = Object.values(archetypes).reduce((s, v) => s + N(v), 0);
  if (total > 0 && expressionPrimary) {
    let hintWeight = 0;
    for (const [archetype, personas] of Object.entries(ARCHETYPE_PERSONA_HINTS)) {
      const share = N(archetypes[archetype]) / total;
      if (personas.includes(expressionPrimary as MarketingPersonaId)) hintWeight += share;
    }
    const archetypeAdjustment = clamp(Math.round((hintWeight - 0.5) * 20), -10, 10);
    alignment += archetypeAdjustment;
  }

  const finalScore = Math.round(clamp(alignment, 20, 85));
  const isExperimental = (expressionPrimary && input.corePrimary && expressionPrimary !== input.corePrimary) || finalScore < 45;

  return { alignmentScore: finalScore, isExperimental: !!isExperimental };
}

export function getAlignmentScale(alignmentScore: number): number {
  return clamp(0.90 + (N(alignmentScore) - 50) / 250, 0.85, 1.15);
}

export function getFocusPathBaseModifiers(focusPath?: string | null) {
  const base = { streaming_mult_delta: 0, virality_mult_delta: 0, retention_mult_delta: 0, hype_decay_mult_delta: 0, brand_deal_affinity_delta: 0, chart_push_delta: 0 };
  switch (focusPath) {
    case 'HIT_CHASE': return { ...base, streaming_mult_delta: 0.1, chart_push_delta: 0.12 };
    case 'ALBUM_AUTEUR': return { ...base, retention_mult_delta: 0.12, streaming_mult_delta: 0.04 };
    case 'DIGITAL_CULT': return { ...base, virality_mult_delta: 0.12, chart_push_delta: 0.05 };
    case 'BRAND_MOGUL': return { ...base, brand_deal_affinity_delta: 0.12, streaming_mult_delta: 0.04 };
    case 'TOUR_MONSTER': return { ...base, retention_mult_delta: 0.05, hype_decay_mult_delta: -0.08 };
    default: return base;
  }
}

export function getScaledFocusModifiers(focusPath: string | null | undefined, alignmentScore: number) {
  const base = getFocusPathBaseModifiers(focusPath);
  const scale = getAlignmentScale(alignmentScore);
  const scaled: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) scaled[k] = Math.round(v * scale * 1000) / 1000;
  return { scale, modifiers: scaled };
}

export function buildFandomEssence(payload: {
  fanArchetypes?: Record<string, number>;
  expressionPrimary?: string | null;
  expressionSecondary?: string | null;
  alignmentScore: number;
  isExperimental: boolean;
}) {
  const archetypes = payload.fanArchetypes || {};
  const sorted = Object.entries(archetypes).sort((a, b) => N(b[1]) - N(a[1]));
  return {
    primary_archetype: sorted[0]?.[0] || null,
    secondary_archetype: sorted[1]?.[0] || null,
    primary_identity: payload.expressionPrimary || null,
    secondary_identity: payload.expressionSecondary || null,
    alignment_score: payload.alignmentScore,
    is_experimental: payload.isExperimental,
  };
}

export function computeBrandDealOfferMultiplier(alignmentScore: number, brandDealAffinityDelta = 0) {
  const alignmentMult = clamp(0.95 + (N(alignmentScore) - 50) / 500, 0.9, 1.1);
  const focusMult = clamp(1 + N(brandDealAffinityDelta), 0.9, 1.15);
  return Math.round(alignmentMult * focusMult * 1000) / 1000;
}


export function computeEraActionDeltas(base: { anticipation: number; momentum: number; tension: number; volatility: number }, alignmentScore: number, isExperimental: boolean) {
  const scale = getAlignmentScale(alignmentScore);
  const misaligned = alignmentScore < 45;
  return {
    anticipationDelta: Math.round(base.anticipation * scale * (misaligned ? 0.9 : 1)),
    momentumDelta: Math.round(base.momentum * scale * (misaligned ? 0.9 : 1.05)),
    tensionDelta: Math.round(base.tension + (misaligned ? 1 : 0)),
    volatilityDelta: Math.round(base.volatility + (isExperimental ? 1 : 0)),
  };
}
