/**
 * MARKETING PERSONA — Deterministic derivation engine.
 * Pure functions, no DB access, no side effects, fully testable.
 *
 * Derives a player's marketing persona from existing game signals:
 *   profiles: career_stage, followers, clout, hype, income, genre, region
 *   fan_profiles: monthly_listeners, retention_rate, listener_growth_trend,
 *                 career_trends, stans/core/casual/trend,
 *                 overall_sentiment, region_share
 *   social_posts: engagement_rate, views, is_viral, post_count (aggregated)
 *
 * IMPORTANT: This system is separate from fan archetypes. Fan archetypes
 * describe audience composition. Marketing personas describe the artist's
 * brand identity for deal alignment.
 */

// ─── Canonical Marketing Persona Values ─────────────────────────────────────
export const MARKETING_PERSONAS = {
  // Core Hip-Hop
  street_authentic:     { label: 'Street Authentic',     category: 'Core Hip-Hop',       emoji: '🔥', color: '#f97316' },
  luxury_hustler:       { label: 'Luxury Hustler',       category: 'Core Hip-Hop',       emoji: '💎', color: '#a855f7' },
  conscious_voice:      { label: 'Conscious Voice',      category: 'Core Hip-Hop',       emoji: '✊', color: '#22c55e' },
  party_club_catalyst:  { label: 'Party / Club Catalyst',category: 'Core Hip-Hop',       emoji: '🎉', color: '#ec4899' },
  nostalgic_boom_bap:   { label: 'Nostalgic Boom Bap',   category: 'Core Hip-Hop',       emoji: '📻', color: '#f59e0b' },
  femme_power:          { label: 'Femme Power',          category: 'Core Hip-Hop',       emoji: '👑', color: '#e879f9' },
  // TikTok / Internet-Native
  viral_trendsetter:    { label: 'Viral Trendsetter',    category: 'Internet-Native',    emoji: '⚡', color: '#06b6d4' },
  aesthetic_curator:    { label: 'Aesthetic Curator',     category: 'Internet-Native',    emoji: '🎨', color: '#8b5cf6' },
  relatable_storyteller:{ label: 'Relatable Storyteller', category: 'Internet-Native',    emoji: '💬', color: '#3b82f6' },
  internet_troll:       { label: 'Internet Troll',       category: 'Internet-Native',    emoji: '🤡', color: '#ef4444' },
  producer_visionary:   { label: 'Producer Visionary',   category: 'Internet-Native',    emoji: '🎛️', color: '#14b8a6' },
  motivational_hustler: { label: 'Motivational Hustler', category: 'Internet-Native',    emoji: '💪', color: '#84cc16' },
} as const;

export type MarketingPersonaId = keyof typeof MARKETING_PERSONAS;

// ─── Persona ↔ Brand Category Affinity Map ──────────────────────────────────
// Maps brand deal categories to which personas they align with (weight 0-1)
export const PERSONA_AFFINITY_MAP: Record<string, Partial<Record<MarketingPersonaId, number>>> = {
  fashion:   { street_authentic: 0.9, luxury_hustler: 0.7, aesthetic_curator: 0.6, femme_power: 0.5, viral_trendsetter: 0.4 },
  tech:      { producer_visionary: 0.9, aesthetic_curator: 0.6, viral_trendsetter: 0.5, motivational_hustler: 0.4 },
  beverage:  { party_club_catalyst: 0.9, viral_trendsetter: 0.7, street_authentic: 0.5, internet_troll: 0.3 },
  food:      { relatable_storyteller: 0.8, party_club_catalyst: 0.5, motivational_hustler: 0.4, conscious_voice: 0.3 },
  auto:      { luxury_hustler: 0.9, street_authentic: 0.6, motivational_hustler: 0.5, nostalgic_boom_bap: 0.3 },
  beauty:    { femme_power: 0.9, aesthetic_curator: 0.8, relatable_storyteller: 0.6, luxury_hustler: 0.4 },
  gaming:    { internet_troll: 0.7, viral_trendsetter: 0.7, producer_visionary: 0.5, relatable_storyteller: 0.4 },
  sports:    { motivational_hustler: 0.9, street_authentic: 0.6, party_club_catalyst: 0.4, conscious_voice: 0.3 },
  finance:   { luxury_hustler: 0.8, motivational_hustler: 0.7, conscious_voice: 0.5, nostalgic_boom_bap: 0.3 },
  lifestyle: { aesthetic_curator: 0.8, relatable_storyteller: 0.7, femme_power: 0.6, conscious_voice: 0.5, luxury_hustler: 0.4 },
  // Extended categories for deep link display
  streetwear:  { street_authentic: 0.95, party_club_catalyst: 0.6, viral_trendsetter: 0.5 },
  sneakers:    { street_authentic: 0.9, party_club_catalyst: 0.5, viral_trendsetter: 0.4 },
  luxury_fashion: { luxury_hustler: 0.95, nostalgic_boom_bap: 0.4, aesthetic_curator: 0.7 },
  activism:    { conscious_voice: 0.95, relatable_storyteller: 0.6 },
  nightlife:   { party_club_catalyst: 0.95, viral_trendsetter: 0.6 },
  heritage:    { nostalgic_boom_bap: 0.9, street_authentic: 0.5 },
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersonaInput {
  // From profiles
  careerStage: string;
  followers: number;
  clout: number;
  hype: number;
  income: number;
  genre: string;
  region: string;
  // From fan_profiles
  monthlyListeners: number;
  retentionRate: number;
  listenerGrowthTrend: number;
  careerTrends: Record<string, boolean>;
  stans: number;
  core: number;
  casual: number;
  trend: number;
  overallSentiment: number;
  regionShare: Record<string, number>;
  // From social_posts (aggregated)
  totalPosts: number;
  avgEngagementRate: number;
  avgViews: number;
  viralPostCount: number;
}

export interface PersonaResult {
  primary_persona: MarketingPersonaId;
  secondary_persona: MarketingPersonaId | null;
  persona_scores: Record<MarketingPersonaId, number>;
  confidence_score: number;
  reason_trace: {
    signals_used: string[];
    persona_reasons: Record<string, string[]>;
    top_reasons: string[];
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function N(v: unknown): number { return Number(v) || 0; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

const STAGE_ORDER: Record<string, number> = {
  'Unknown': 0, 'Local Artist': 1, 'Local Buzz': 2, 'Underground Artist': 3,
  'Cult Favorite': 4, 'Breakout Artist': 5, 'Mainstream Artist': 6,
  'A-List Star': 7, 'Global Superstar': 8, 'Legacy Icon': 9,
  'Underground': 3, 'Local Act': 2, 'Indie Darling': 4,
  'Rising Star': 5, 'Mainstream': 6, 'Superstar': 8, 'Legend': 9,
};

function stageNum(stage: string): number { return STAGE_ORDER[stage] ?? 0; }

// Actual in-game genres (from Onboarding.jsx / SongWritingInterface.jsx)
const HIP_HOP_GENRES = ['hip-hop', 'rap', 'melodic rap', 'trap', 'uk drill'];
const ELECTRONIC_GENRES = ['edm', 'trance', 'techno'];
const AFRO_LATIN_GENRES = ['afrobeats', 'amapiano', 'reggaeton', 'latin pop', 'salsa', 'dancehall', 'reggae'];
const POP_INDIE_GENRES = ['pop', 'k-pop', 'j-pop', 'indie', 'alternative', 'folk', 'country'];
const RNB_GENRES = ['r&b'];

function isHipHopGenre(genre: string): boolean {
  const g = (genre || '').toLowerCase();
  return HIP_HOP_GENRES.some(h => g.includes(h));
}

function isElectronicOrExperimental(genre: string): boolean {
  const g = (genre || '').toLowerCase();
  return ELECTRONIC_GENRES.some(h => g.includes(h));
}

function isAfroLatinGenre(genre: string): boolean {
  const g = (genre || '').toLowerCase();
  return AFRO_LATIN_GENRES.some(h => g.includes(h));
}

function isRnBGenre(genre: string): boolean {
  const g = (genre || '').toLowerCase();
  return RNB_GENRES.some(h => g.includes(h));
}

function isPopIndieGenre(genre: string): boolean {
  const g = (genre || '').toLowerCase();
  return POP_INDIE_GENRES.some(h => g.includes(h));
}

// ─── Core Derivation ────────────────────────────────────────────────────────

export function computeMarketingPersona(input: PersonaInput): PersonaResult {
  const scores: Record<MarketingPersonaId, number> = {
    street_authentic: 0,
    luxury_hustler: 0,
    conscious_voice: 0,
    party_club_catalyst: 0,
    nostalgic_boom_bap: 0,
    femme_power: 0,
    viral_trendsetter: 0,
    aesthetic_curator: 0,
    relatable_storyteller: 0,
    internet_troll: 0,
    producer_visionary: 0,
    motivational_hustler: 0,
  };

  const reasons: Record<string, string[]> = {};
  for (const k of Object.keys(scores)) reasons[k] = [];
  const signalsUsed: string[] = [];

  const sn = stageNum(input.careerStage);
  const totalFanBuckets = N(input.stans) + N(input.core) + N(input.casual) + N(input.trend);

  // Normalize fan buckets to 0-1
  const stansShare = totalFanBuckets > 0 ? N(input.stans) / totalFanBuckets : 0;
  const coreShare = totalFanBuckets > 0 ? N(input.core) / totalFanBuckets : 0;
  const trendShare = totalFanBuckets > 0 ? N(input.trend) / totalFanBuckets : 0;

  // Active trends
  const activeTrends = Object.entries(input.careerTrends || {}).filter(([, v]) => v).map(([k]) => k);
  const hasViral = activeTrends.includes('VIRAL_SENSATION');
  const hasComeback = activeTrends.includes('COMEBACK');
  const hasGoat = activeTrends.includes('GOAT');
  const hasLegacy = activeTrends.includes('LEGACY_ARTIST');
  const hasFlop = activeTrends.includes('FLOP_ERA');
  const hasSlump = activeTrends.includes('CAREER_SLUMP');
  const hasDormant = activeTrends.includes('DORMANT');
  const hasPassedPrime = activeTrends.includes('PASSED_PRIME');
  const hasOneHit = activeTrends.includes('ONE_HIT_WONDER');

  // Derived metrics
  const incomePerFollower = N(input.followers) > 0 ? N(input.income) / N(input.followers) : 0;
  const viralRate = N(input.totalPosts) > 0 ? N(input.viralPostCount) / N(input.totalPosts) : 0;
  const engagementRate = N(input.avgEngagementRate);
  const growthTrend = N(input.listenerGrowthTrend); // 0-100 scale
  const retention = N(input.retentionRate); // 0-100 scale
  const postCount = N(input.totalPosts);

  // ── STREET_AUTHENTIC ──────────────────────────────────────────────────
  if (isHipHopGenre(input.genre)) {
    scores.street_authentic += 0.25;
    reasons.street_authentic.push(`${input.genre} genre`);
    signalsUsed.push('genre');
  }
  if (isAfroLatinGenre(input.genre)) {
    scores.street_authentic += 0.1;
    reasons.street_authentic.push(`${input.genre} — street credibility`);
    signalsUsed.push('genre');
  }
  if (sn >= 3 && sn <= 5) {
    scores.street_authentic += 0.15;
    reasons.street_authentic.push(`Mid-career stage (${input.careerStage})`);
    signalsUsed.push('career_stage');
  }
  if (coreShare > 0.3) {
    scores.street_authentic += 0.1;
    reasons.street_authentic.push('Strong core fan base');
    signalsUsed.push('fan_buckets');
  }

  // ── LUXURY_HUSTLER ────────────────────────────────────────────────────
  if (sn >= 6) {
    scores.luxury_hustler += 0.25;
    reasons.luxury_hustler.push(`High career stage (${input.careerStage})`);
    signalsUsed.push('career_stage');
  }
  if (N(input.monthlyListeners) > 1_000_000) {
    scores.luxury_hustler += clamp(Math.log10(N(input.monthlyListeners)) / 10, 0, 0.25);
    reasons.luxury_hustler.push(`${(N(input.monthlyListeners) / 1e6).toFixed(1)}M monthly listeners`);
    signalsUsed.push('monthly_listeners');
  }
  if (incomePerFollower > 0.5) {
    scores.luxury_hustler += clamp(incomePerFollower / 5, 0, 0.2);
    reasons.luxury_hustler.push('High income-per-follower ratio');
    signalsUsed.push('income');
  }
  if (N(input.clout) > 100) {
    scores.luxury_hustler += 0.1;
    reasons.luxury_hustler.push(`High clout (${N(input.clout)})`);
    signalsUsed.push('clout');
  }

  // ── CONSCIOUS_VOICE ───────────────────────────────────────────────────
  if (retention > 60) {
    scores.conscious_voice += clamp((retention - 50) / 100, 0, 0.25);
    reasons.conscious_voice.push(`High retention rate (${retention}%)`);
    signalsUsed.push('retention_rate');
  }
  if (growthTrend > 40 && growthTrend < 80) {
    scores.conscious_voice += 0.15;
    reasons.conscious_voice.push('Stable, moderate growth');
    signalsUsed.push('listener_growth_trend');
  }
  if (coreShare > 0.35) {
    scores.conscious_voice += 0.1;
    reasons.conscious_voice.push('Deep core fan loyalty');
    signalsUsed.push('fan_buckets');
  }

  // ── PARTY_CLUB_CATALYST ───────────────────────────────────────────────
  if (viralRate > 0.15) {
    scores.party_club_catalyst += clamp(viralRate * 1.5, 0, 0.3);
    reasons.party_club_catalyst.push(`${Math.round(viralRate * 100)}% viral post rate`);
    signalsUsed.push('viral_posts');
  }
  if (engagementRate > 5) {
    scores.party_club_catalyst += clamp((engagementRate - 3) / 15, 0, 0.2);
    reasons.party_club_catalyst.push(`High engagement rate (${engagementRate.toFixed(1)}%)`);
    signalsUsed.push('engagement_rate');
  }
  if (trendShare > 0.2) {
    scores.party_club_catalyst += clamp(trendShare * 0.3, 0, 0.15);
    reasons.party_club_catalyst.push(`${Math.round(trendShare * 100)}% trend fans`);
    signalsUsed.push('fan_buckets');
  }
  if (N(input.hype) > 60) {
    scores.party_club_catalyst += 0.15;
    reasons.party_club_catalyst.push(`High hype (${N(input.hype)})`);
    signalsUsed.push('hype');
  }
  if (isAfroLatinGenre(input.genre)) {
    scores.party_club_catalyst += 0.2;
    reasons.party_club_catalyst.push(`${input.genre} — party/club genre`);
    signalsUsed.push('genre');
  }

  // ── NOSTALGIC_BOOM_BAP ────────────────────────────────────────────────
  if (hasPassedPrime || hasLegacy) {
    scores.nostalgic_boom_bap += 0.3;
    reasons.nostalgic_boom_bap.push(`Career trend: ${hasLegacy ? 'LEGACY_ARTIST' : 'PASSED_PRIME'}`);
    signalsUsed.push('career_trends');
  }
  if (sn >= 8) {
    scores.nostalgic_boom_bap += 0.15;
    reasons.nostalgic_boom_bap.push('Legacy-tier career stage');
    signalsUsed.push('career_stage');
  }
  if (hasGoat) {
    scores.nostalgic_boom_bap += 0.1;
    reasons.nostalgic_boom_bap.push('GOAT trend active');
    signalsUsed.push('career_trends');
  }

  // ── FEMME_POWER ───────────────────────────────────────────────────────
  // No gender signal exists in the repo. Score stays low, confidence reduced.
  if (stansShare > 0.3) {
    scores.femme_power += clamp(stansShare * 0.2, 0, 0.15);
    reasons.femme_power.push('High stan ratio (proxy: dedicated fanbase)');
    signalsUsed.push('fan_buckets');
  }
  if (isRnBGenre(input.genre) || isPopIndieGenre(input.genre)) {
    scores.femme_power += 0.1;
    reasons.femme_power.push(`${input.genre} — broader audience appeal`);
    signalsUsed.push('genre');
  }
  // Femme power remains low-confidence without gender data

  // ── VIRAL_TRENDSETTER ─────────────────────────────────────────────────
  if (hasViral) {
    scores.viral_trendsetter += 0.35;
    reasons.viral_trendsetter.push('VIRAL_SENSATION trend active');
    signalsUsed.push('career_trends');
  }
  if (trendShare > 0.25) {
    scores.viral_trendsetter += clamp(trendShare * 0.3, 0, 0.2);
    reasons.viral_trendsetter.push(`${Math.round(trendShare * 100)}% trend followers`);
    signalsUsed.push('fan_buckets');
  }
  if (growthTrend > 80) {
    scores.viral_trendsetter += clamp((growthTrend - 70) / 100, 0, 0.2);
    reasons.viral_trendsetter.push(`Rapid growth trend (${growthTrend})`);
    signalsUsed.push('listener_growth_trend');
  }

  // ── AESTHETIC_CURATOR ──────────────────────────────────────────────────
  if (retention > 65 && growthTrend > 40 && growthTrend < 75) {
    scores.aesthetic_curator += 0.2;
    reasons.aesthetic_curator.push('Stable growth with high retention (proxy for curated brand)');
    signalsUsed.push('retention_rate');
    signalsUsed.push('listener_growth_trend');
  }
  if (stansShare > 0.2 && coreShare > 0.25) {
    scores.aesthetic_curator += 0.15;
    reasons.aesthetic_curator.push('Balanced stan/core ratio (dedicated aesthetic following)');
    signalsUsed.push('fan_buckets');
  }
  if (['k-pop', 'j-pop', 'indie', 'alternative'].some(g => (input.genre || '').toLowerCase().includes(g))) {
    scores.aesthetic_curator += 0.2;
    reasons.aesthetic_curator.push(`${input.genre} — aesthetic-forward genre`);
    signalsUsed.push('genre');
  }

  // ── RELATABLE_STORYTELLER ─────────────────────────────────────────────
  if (engagementRate > 4 && N(input.followers) < 5_000_000) {
    scores.relatable_storyteller += 0.25;
    reasons.relatable_storyteller.push('High engagement at moderate follower count');
    signalsUsed.push('engagement_rate');
    signalsUsed.push('followers');
  }
  if (isRnBGenre(input.genre)) {
    scores.relatable_storyteller += 0.15;
    reasons.relatable_storyteller.push(`${input.genre} — storytelling genre`);
    signalsUsed.push('genre');
  }
  if (coreShare > 0.3 && stansShare > 0.15) {
    scores.relatable_storyteller += 0.15;
    reasons.relatable_storyteller.push('Strong core + stan loyalty');
    signalsUsed.push('fan_buckets');
  }
  if (retention > 55) {
    scores.relatable_storyteller += clamp((retention - 50) / 150, 0, 0.15);
    reasons.relatable_storyteller.push(`Good retention (${retention}%)`);
    signalsUsed.push('retention_rate');
  }

  // ── INTERNET_TROLL ────────────────────────────────────────────────────
  if (hasFlop || hasSlump) {
    scores.internet_troll += 0.2;
    reasons.internet_troll.push(`Volatile career trend: ${hasFlop ? 'FLOP_ERA' : 'CAREER_SLUMP'}`);
    signalsUsed.push('career_trends');
  }
  if (N(input.overallSentiment) < 40) {
    scores.internet_troll += clamp((50 - N(input.overallSentiment)) / 100, 0, 0.2);
    reasons.internet_troll.push(`Low fan sentiment (${N(input.overallSentiment)})`);
    signalsUsed.push('overall_sentiment');
  }
  if (hasOneHit && viralRate > 0.1) {
    scores.internet_troll += 0.15;
    reasons.internet_troll.push('One-hit wonder with viral content');
    signalsUsed.push('career_trends');
  }

  // ── PRODUCER_VISIONARY ────────────────────────────────────────────────
  if (isElectronicOrExperimental(input.genre)) {
    scores.producer_visionary += 0.3;
    reasons.producer_visionary.push(`${input.genre} — electronic genre`);
    signalsUsed.push('genre');
  }
  if (retention > 60 && coreShare > 0.3) {
    scores.producer_visionary += 0.1;
    reasons.producer_visionary.push('Deep core following with high retention');
    signalsUsed.push('retention_rate');
  }

  // ── MOTIVATIONAL_HUSTLER ──────────────────────────────────────────────
  if (growthTrend > 55) {
    scores.motivational_hustler += clamp((growthTrend - 40) / 100, 0, 0.25);
    reasons.motivational_hustler.push(`Positive growth trend (${growthTrend})`);
    signalsUsed.push('listener_growth_trend');
  }
  if (postCount > 15) {
    scores.motivational_hustler += clamp(postCount / 100, 0, 0.2);
    reasons.motivational_hustler.push(`High work rate (${postCount} posts)`);
    signalsUsed.push('total_posts');
  }
  if (hasComeback) {
    scores.motivational_hustler += 0.2;
    reasons.motivational_hustler.push('COMEBACK trend active');
    signalsUsed.push('career_trends');
  }
  if (sn >= 3 && sn <= 6 && growthTrend > 50) {
    scores.motivational_hustler += 0.1;
    reasons.motivational_hustler.push('Rising through mid-career stages');
    signalsUsed.push('career_stage');
  }

  // ── Normalize scores to 0-1 ───────────────────────────────────────────
  for (const k of Object.keys(scores) as MarketingPersonaId[]) {
    scores[k] = clamp(Math.round(scores[k] * 1000) / 1000, 0, 1);
  }

  // ── Pick primary and secondary ────────────────────────────────────────
  const sorted = (Object.entries(scores) as [MarketingPersonaId, number][])
    .sort((a, b) => b[1] - a[1]);

  const primary = sorted[0][0];
  const secondary = sorted[1][1] > 0.1 ? sorted[1][0] : null;

  // ── Confidence score ──────────────────────────────────────────────────
  // Based on: signal coverage, score separation, and whether femme_power is primary (low confidence)
  const uniqueSignals = [...new Set(signalsUsed)];
  const signalCoverage = clamp(uniqueSignals.length / 10, 0, 1); // 10 possible signal types
  const scoreSeparation = sorted[0][1] > 0 ? clamp((sorted[0][1] - sorted[1][1]) / sorted[0][1], 0, 1) : 0;
  const primaryStrength = clamp(sorted[0][1] / 0.8, 0, 1); // 0.8 is a strong score

  let confidence = (signalCoverage * 0.3 + scoreSeparation * 0.3 + primaryStrength * 0.4);
  // Reduce confidence if femme_power is primary (no gender signal)
  if (primary === 'femme_power') confidence *= 0.5;
  // Reduce confidence if primary score is very low
  if (sorted[0][1] < 0.2) confidence *= 0.5;
  confidence = clamp(Math.round(confidence * 100) / 100, 0, 1);

  // ── Build reason trace ────────────────────────────────────────────────
  const topReasons: string[] = [];
  if (reasons[primary]?.length > 0) {
    topReasons.push(...reasons[primary].slice(0, 2));
  }
  if (secondary && reasons[secondary]?.length > 0) {
    topReasons.push(reasons[secondary][0]);
  }

  return {
    primary_persona: primary,
    secondary_persona: secondary,
    persona_scores: scores,
    confidence_score: confidence,
    reason_trace: {
      signals_used: uniqueSignals,
      persona_reasons: reasons,
      top_reasons: topReasons.slice(0, 3),
    },
  };
}

// ─── Persona Fit Score for Brand Deals ──────────────────────────────────────

export function computePersonaFitScore(
  personaResult: PersonaResult,
  dealCategory: string
): { score: number; reasons: string[]; affinity_tags: string[] } {
  const affinityMap = PERSONA_AFFINITY_MAP[dealCategory] || {};
  const fitReasons: string[] = [];
  const affinityTags: string[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  for (const [persona, affinity] of Object.entries(affinityMap) as [MarketingPersonaId, number][]) {
    const personaScore = personaResult.persona_scores[persona] || 0;
    if (personaScore > 0.1 && affinity > 0.3) {
      const contribution = personaScore * affinity;
      weightedScore += contribution;
      totalWeight += affinity;
      affinityTags.push(MARKETING_PERSONAS[persona]?.label || persona);
      if (persona === personaResult.primary_persona) {
        fitReasons.push(`Primary persona aligns with ${dealCategory}`);
      } else if (persona === personaResult.secondary_persona) {
        fitReasons.push(`Secondary persona fits ${dealCategory}`);
      }
    }
  }

  // Primary persona direct match bonus
  if (affinityMap[personaResult.primary_persona]) {
    weightedScore += 0.2;
    totalWeight += 0.2;
  }

  const score = totalWeight > 0 ? clamp(Math.round((weightedScore / totalWeight) * 100) / 100, 0, 1) : 0.1;

  if (fitReasons.length === 0) {
    fitReasons.push(score >= 0.5 ? 'Good brand alignment' : 'Moderate brand alignment');
  }

  return {
    score,
    reasons: fitReasons.slice(0, 3),
    affinity_tags: affinityTags.slice(0, 5),
  };
}

// ─── Top Affinities (for UI summary) ────────────────────────────────────────

export function getTopAffinities(personaResult: PersonaResult): string[] {
  const affinities: { category: string; score: number }[] = [];

  for (const [category, affinityMap] of Object.entries(PERSONA_AFFINITY_MAP)) {
    // Skip extended categories
    if (['streetwear', 'sneakers', 'luxury_fashion', 'activism', 'nightlife', 'heritage'].includes(category)) continue;

    let fitScore = 0;
    for (const [persona, weight] of Object.entries(affinityMap) as [MarketingPersonaId, number][]) {
      fitScore += (personaResult.persona_scores[persona] || 0) * weight;
    }
    affinities.push({ category, score: fitScore });
  }

  return affinities
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(a => a.category.charAt(0).toUpperCase() + a.category.slice(1));
}
