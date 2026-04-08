/**
 * battleResolutionEngine.ts
 * 
 * Battle resolution system for underground events.
 * Determines winners fairly without skills system using composite metrics.
 */

// ────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────

const N = (v: any): number => Number(v) || 0;

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Battle Rating Calculation
// ────────────────────────────────────────────────────────────────────────────

export interface BattleParticipant {
  playerId: string;
  playerName: string;
  genre: string;
  recentReleases: Array<{ quality_score: number }>;
  currentHype: number;
  currentFans: number;
  followerCount: number;
  fandomHealth: number; // 0-100 stability/loyalty metric
  sceneTier: number;
  sceneReputation: number;
}

export interface BattleRating {
  playerId: string;
  baseScore: number;
  releaseQuality: number; // 30%
  hypeComponent: number; // 20%
  viralityComponent: number; // 15%
  fandomComponent: number; // 15%
  sceneComponent: number; // 10%
  randomFactor: number; // 10%
  finalScore: number;
}

export function computeReleaseQualityScore(releases: Array<{ quality_score: number }>): number {
  if (!releases || releases.length === 0) return 50; // baseline
  const last3 = releases.slice(-3);
  const avg = last3.reduce((sum, r) => sum + N(r.quality_score), 0) / last3.length;
  // Map 0-100 quality to 0-100 component score
  return Math.max(0, Math.min(100, avg));
}

export function computeHypeComponent(hype: number): number {
  // Map hype (0-1000+) to 0-100 component
  const normalized = Math.min(100, (N(hype) / 100));
  return Math.max(0, Math.min(100, normalized));
}

export function computeViralityComponent(fans: number): number {
  // Fans as proxy for virality reach (0-1M+)
  const normalized = Math.min(100, (N(fans) / 10000)); // 1M fans = 100
  return Math.max(0, Math.min(100, normalized));
}

export function computeFandomComponent(fandomHealth: number): number {
  // Fandom health already 0-100
  return Math.max(0, Math.min(100, N(fandomHealth)));
}

export function computeSceneComponent(sceneTier: number, sceneRep: number): number {
  // Scene tier (1-5) × reputation (0-100)
  const tierBoost = (N(sceneTier) / 5) * 40; // 0-40 from tier
  const repBoost = (N(sceneRep) / 100) * 60; // 0-60 from rep
  return Math.max(0, Math.min(100, tierBoost + repBoost));
}

export function computeBattleRating(
  participant: BattleParticipant,
  intensity: "Friendly" | "Serious" | "Full Beef",
): BattleRating {
  const releaseQuality = computeReleaseQualityScore(participant.recentReleases || []);
  const hype = computeHypeComponent(participant.currentHype);
  const virality = computeViralityComponent(participant.currentFans);
  const fandom = computeFandomComponent(participant.fandomHealth);
  const scene = computeSceneComponent(participant.sceneTier, participant.sceneReputation);

  // Weighted composition (30% + 20% + 15% + 15% + 10% = 90%)
  const baseScore =
    releaseQuality * 0.3 +
    hype * 0.2 +
    virality * 0.15 +
    fandom * 0.15 +
    scene * 0.1;

  // Random factor seeded by player ID
  const seed = hashStr(participant.playerId);
  const rng = mulberry32(seed);
  const randomVariance = intensity === "Friendly"
    ? (rng() * 20) - 10 // ±10%
    : intensity === "Serious"
    ? (rng() * 30) - 15 // ±15%
    : (rng() * 60) - 30; // ±30% for Full Beef

  const randomFactor = Math.max(-30, Math.min(30, randomVariance));
  const finalScore = Math.max(0, Math.min(100, baseScore + randomFactor));

  return {
    playerId: participant.playerId,
    baseScore: Math.max(0, Math.min(100, baseScore)),
    releaseQuality,
    hypeComponent: hype,
    viralityComponent: virality,
    fandomComponent: fandom,
    sceneComponent: scene,
    randomFactor,
    finalScore,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Battle Outcome Resolution
// ────────────────────────────────────────────────────────────────────────────

export interface BattleOutcome {
  format: "1v1" | "cypher" | "exhibition";
  intensity: "Friendly" | "Serious" | "Full Beef";
  participants: BattleParticipant[];
  ratings: BattleRating[];
  winners: string[]; // player IDs
  results: Array<{ playerId: string; rank: number; score: number; reward: number }>;
}

export function resolve1v1Battle(
  participants: BattleParticipant[],
  intensity: "Friendly" | "Serious" | "Full Beef",
): BattleOutcome {
  if (participants.length !== 2) {
    throw new Error("1v1 battle requires exactly 2 participants");
  }

  const ratings = participants.map((p) => computeBattleRating(p, intensity));
  const sorted = ratings.sort((a, b) => b.finalScore - a.finalScore);
  
  const winner = sorted[0].playerId;
  const loser = sorted[1].playerId;

  // Reward scaling by intensity
  const baseReward = intensity === "Friendly" ? 50 : intensity === "Serious" ? 150 : 300;
  const winnerReward = baseReward;
  const loserReward = Math.floor(baseReward * 0.3);

  return {
    format: "1v1",
    intensity,
    participants,
    ratings,
    winners: [winner],
    results: [
      { playerId: winner, rank: 1, score: sorted[0].finalScore, reward: winnerReward },
      { playerId: loser, rank: 2, score: sorted[1].finalScore, reward: loserReward },
    ],
  };
}

export function resolveCypherBattle(
  participants: BattleParticipant[],
  intensity: "Friendly" | "Serious" | "Full Beef",
): BattleOutcome {
  if (participants.length < 3 || participants.length > 6) {
    throw new Error("Cypher battle requires 3-6 participants");
  }

  const ratings = participants.map((p) => computeBattleRating(p, intensity));
  const ranked = ratings.sort((a, b) => b.finalScore - a.finalScore);

  // Top 3 get rewards, bottom don't
  const topThree = ranked.slice(0, 3).map((r) => r.playerId);
  const baseReward = intensity === "Friendly" ? 40 : intensity === "Serious" ? 100 : 200;

  const results = ranked.map((r, idx) => ({
    playerId: r.playerId,
    rank: idx + 1,
    score: r.finalScore,
    reward: idx < 3 ? Math.floor(baseReward * (1 - idx * 0.2)) : 0, // 100%, 80%, 60%
  }));

  return {
    format: "cypher",
    intensity,
    participants,
    ratings,
    winners: topThree,
    results,
  };
}

export function resolveExhibitionBattle(
  participants: BattleParticipant[],
  intensity: "Friendly" | "Serious" | "Full Beef",
): BattleOutcome {
  // Exhibition: no winners, attendance-based rewards
  const ratings = participants.map((p) => computeBattleRating(p, intensity));
  const baseReward = intensity === "Friendly" ? 30 : intensity === "Serious" ? 80 : 150;

  const results = ratings.map((r, idx) => ({
    playerId: r.playerId,
    rank: idx + 1,
    score: r.finalScore,
    reward: baseReward,
  }));

  return {
    format: "exhibition",
    intensity,
    participants,
    ratings,
    winners: [], // no winner in exhibition
    results,
  };
}

export function resolveBattle(
  format: "1v1" | "cypher" | "exhibition",
  participants: BattleParticipant[],
  intensity: "Friendly" | "Serious" | "Full Beef",
): BattleOutcome {
  switch (format) {
    case "1v1":
      return resolve1v1Battle(participants, intensity);
    case "cypher":
      return resolveCypherBattle(participants, intensity);
    case "exhibition":
      return resolveExhibitionBattle(participants, intensity);
    default:
      throw new Error(`Unknown battle format: ${format}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Outcome Deltas (for turn engine integration)
// ────────────────────────────────────────────────────────────────────────────

export function computeBeefDelta(intensity: "Friendly" | "Serious" | "Full Beef", isWinner: boolean): number {
  // Intensity determines beef accumulation
  const baseBeef = intensity === "Friendly"
    ? 0 // no beef
    : intensity === "Serious"
    ? isWinner ? 5 : 2
    : isWinner ? 15 : 8; // Full Beef

  return baseBeef;
}

export function computeCloutDelta(baseReward: number, intensity: string, isWinner: boolean): number {
  // Clout from battle performance
  const intensityMult = intensity === "Friendly" ? 0.5 : intensity === "Serious" ? 1.0 : 1.5;
  const result = Math.floor((baseReward / 100) * intensityMult);
  return result;
}

export function computeControversyRisk(intensity: "Friendly" | "Serious" | "Full Beef"): number {
  // Controversy roll chance by intensity
  return intensity === "Friendly"
    ? 0.05
    : intensity === "Serious"
    ? 0.15
    : 0.40; // Full Beef very likely to trigger controversy
}
