/**
 * AMPLIFI FESTIVAL SYSTEM — Festival Media Module (Phase 3)
 *
 * Generates post-performance social posts on LoopTok + other platforms.
 * Called from festivalGlobalModule after day resolution.
 *
 * Also emits structured turn_metrics flags used by newsGenerationModule
 * to generate festival news articles.
 *
 * Uses same seeded RNG + template pattern as fan war NPC post generator.
 * No real-time calls — all writes are idempotent via unique keys.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FestivalMediaContext {
  festivalName: string;
  festivalCode: string;
  dayIndex: number;
  artistId: string;
  artistName: string;
  lane: string;
  crowdHeat: number;       // 0–100
  credibility: number;     // 0–100
  conversion: number;      // 0–100
  momentCardType: string;
  momentCardLabel: string;
  globalTurnId: number;
  instanceId: string;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

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

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// ── Post templates ────────────────────────────────────────────────────────────

const HIGH_HEAT_TEMPLATES = [
  (n: string, f: string) => `${n} just [performed at ${f}] and the crowd has NOT recovered.`,
  (n: string, f: string) => `ok I was NOT ready for what ${n} just did on that ${f} stage`,
  (n: string, f: string) => `${f} different after what ${n} just did. not taking further questions.`,
  (n: string, f: string) => `somebody tell me why ${n} at ${f} just made me cry in the crowd`,
  (n: string, f: string) => `${n} ate that entire ${f} set and left no crumbs`,
  (n: string, f: string) => `the way ${n} ran that ${f} crowd like it was nothing`,
  (n: string, f: string) => `I flew across the country for ${f} specifically for ${n} and it was WORTH IT`,
];

const MID_HEAT_TEMPLATES = [
  (n: string, f: string) => `just caught ${n}'s set at ${f} — genuinely solid`,
  (n: string, f: string) => `${n} showed up and delivered at ${f}. can't deny it`,
  (n: string, f: string) => `${f} crowd vibing to ${n} rn. proper set`,
  (n: string, f: string) => `${n} ${f} set was better than expected ngl`,
];

const LOW_HEAT_TEMPLATES = [
  (n: string, f: string) => `${n}'s ${f} set was… not what we hoped for`,
  (n: string, f: string) => `the ${f} crowd was not buying what ${n} was selling today`,
  (n: string, f: string) => `${n} looked uncomfortable at ${f}. tough watch`,
  (n: string, f: string) => `${f} set from ${n} gets a C from me. not the place for that energy`,
];

const MOMENT_CARD_OVERLAYS: Record<string, (n: string, f: string) => string> = {
  ViralChorusClip:    (n, f) => `${n}'s chorus moment at ${f} is everywhere rn`,
  CrowdChant:         (n, f) => `the CROWD was chanting ${n}'s name at ${f}. unreal.`,
  SurpriseGuestHit:   (n, f) => `${n} brought out a surprise guest at ${f} and I will never be the same`,
  LegendaryOutro:     (n, f) => `the way ${n} closed that ${f} set. studying the outro.`,
  FestivalStopping:   (n, f) => `${n} at ${f} was genuinely a festival-stopping moment`,
  AwkwardSpeech:      (n, f) => `what was ${n} trying to say between songs at ${f}?? `,
  TechnicalFail:      (n, f) => `the sound cut out during ${n}'s ${f} set and it was painfully awkward`,
  EmotionalBreakdown: (n, f) => `${n} broke down on stage at ${f}. i feel like i witnessed something.`,
  StageInvasion:      (n, f) => `security had a time at ${n}'s ${f} show tonight`,
};

const PLATFORMS = ['looptok', 'xpress', 'instavibe'];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates 1–3 NPC social posts about a festival performance.
 * Only posts for crowd_heat >= 55 OR moment_card_type in notable list.
 */
export async function generateFestivalLoopTokPosts(
  supabase: any,
  ctx: FestivalMediaContext,
): Promise<void> {
  const { crowdHeat, momentCardType, artistName, festivalName, artistId, instanceId, dayIndex, globalTurnId } = ctx;

  // Only generate posts for meaningful performances
  const notableMoments = ['ViralChorusClip','CrowdChant','SurpriseGuestHit','FestivalStopping','LegendaryOutro'];
  const isNotable = notableMoments.includes(momentCardType);
  if (crowdHeat < 55 && !isNotable) return;

  const seed = hashStr(`festival_media:${artistId}:${instanceId}:${dayIndex}`);
  const rng = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return mulberry32(s); }; })();

  const postCount = crowdHeat >= 85 ? 3 : crowdHeat >= 70 ? 2 : 1;
  const postsToInsert: any[] = [];

  for (let i = 0; i < postCount; i++) {
    const seedI = Math.floor(rng() * 999999);

    // Choose template
    let textFn: (n: string, f: string) => string;
    if (i === 0 && MOMENT_CARD_OVERLAYS[momentCardType]) {
      textFn = MOMENT_CARD_OVERLAYS[momentCardType];
    } else if (crowdHeat >= 80) {
      textFn = pick(HIGH_HEAT_TEMPLATES, seedI);
    } else if (crowdHeat >= 55) {
      textFn = pick(MID_HEAT_TEMPLATES, seedI + 1);
    } else {
      textFn = pick(LOW_HEAT_TEMPLATES, seedI + 2);
    }

    const content = textFn(artistName, festivalName);
    const platform = pick(PLATFORMS, seedI + 3);

    // Idempotency key prevents duplicate posts on re-runs
    const idempotencyKey = `festival_post:${artistId}:${instanceId}:${dayIndex}:post${i}`;

    postsToInsert.push({
      platform,
      content,
      post_type: 'fan_clip',
      artist_id: artistId,
      views: Math.floor(crowdHeat * (1 + rng()) * 1000),
      engagement_rate: parseFloat((0.03 + rng() * 0.12).toFixed(4)),
      is_viral: crowdHeat >= 85 && i === 0,
      is_npc: true,
      turn_id: globalTurnId,
      idempotency_key: idempotencyKey,
      metadata: {
        source: 'festival_fallout',
        festival_instance_id: instanceId,
        day_index: dayIndex,
        moment_card_type: momentCardType,
        crowd_heat: crowdHeat,
      },
    });
  }

  if (!postsToInsert.length) return;

  try {
    await supabase.from('social_posts').upsert(postsToInsert, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
    });
  } catch (err: any) {
    console.warn(`[FESTIVAL_SOCIAL_POSTS_FAIL] count=${postsToInsert?.length}:`, err?.message);
  }
}

// ── News metrics flags ─────────────────────────────────────────────────────────

/**
 * Builds turn_metrics additions for the news generation module.
 * Returns a partial object to be merged into the player's turn_metrics.
 */
export function buildFestivalNewsMetrics(ctx: FestivalMediaContext): Record<string, any> {
  const metrics: Record<string, any> = {};

  // LEGENDARY set (crowd_heat >= 85)
  if (ctx.crowdHeat >= 85) {
    metrics.festival_legendary_set = true;
    metrics.festival_name = ctx.festivalName;
    metrics.festival_lane = ctx.lane;
  }

  // Decent set (crowd_heat 60–84)
  if (ctx.crowdHeat >= 60 && ctx.crowdHeat < 85) {
    metrics.festival_solid_set = true;
    metrics.festival_name = ctx.festivalName;
  }

  // Disappointing set (crowd_heat < 40)
  if (ctx.crowdHeat < 40) {
    metrics.festival_weak_set = true;
    metrics.festival_name = ctx.festivalName;
  }

  // Controversial set (CHAOTIC posture & low credibility < 30)
  if (ctx.credibility < 30) {
    metrics.festival_controversy = true;
    metrics.festival_name = ctx.festivalName;
  }

  return metrics;
}
