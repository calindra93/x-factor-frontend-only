/**
 * NOTIFICATIONS GENERATOR v2 — Aggregation-aware, correct career stages
 * Reads recent deltas and insightsReport to generate notification payloads only.
 * NO entity writes — all writes happen in turnEngine commit phase.
 *
 * Notification types emitted:
 *   TURN_RECAP, MERCH_SURGE, STREAMING_SPIKE, SOCIAL_FOLLOWER_SPIKE,
 *   MARKET_SHIFT, PLAYLIST_UPDATE, ERA_UPDATE, CAREER_UPDATE,
 *   ACHIEVEMENT, HIGHLIGHT (platform breakout, era flop)
 *   RADIO_AIRPLAY, RADIO_DISCOVERY, RADIO_HOST (emitted by radio modules)
 */

import { generateInsightsReport } from './insightsReportGenerator.ts';
import { NOTIFICATION_THRESHOLDS } from './notificationThresholds.ts';

const T = NOTIFICATION_THRESHOLDS;
const N = (v: any): number => Number(v) || 0;
const EXCEPTIONAL_STREAMING_SPIKE = Math.max(T.streaming_spike * 5, 25_000);
const EXCEPTIONAL_MERCH_REVENUE = Math.max(T.merch_surge_revenue * 5, 500);
const EXCEPTIONAL_MERCH_UNITS = Math.max(T.merch_surge_units * 5, 25);

export const RADIO_NOTIFICATION_TYPES = new Set([
  'RADIO_AIRPLAY',
  'RADIO_DISCOVERY',
  'RADIO_HOST',
]);

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(N(value));
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(abs >= 10_000_000_000_000 ? 0 : 1).replace(/\.0$/, '')}T`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return Math.round(value).toLocaleString();
}

// ─── Career stages source of truth (must match career_stages table) ─────
const CAREER_STAGES: { order: number; name: string; minML: number }[] = [
  { order: 1,  name: 'Unknown',            minML: 0 },
  { order: 2,  name: 'Local Artist',       minML: 500 },
  { order: 3,  name: 'Local Buzz',         minML: 50_000 },
  { order: 4,  name: 'Underground Artist', minML: 150_000 },
  { order: 5,  name: 'Cult Favorite',      minML: 5_000_000 },
  { order: 6,  name: 'Breakout Artist',    minML: 15_000_000 },
  { order: 7,  name: 'Mainstream Artist',  minML: 35_000_000 },
  { order: 8,  name: 'A-List Star',        minML: 60_000_000 },
  { order: 9,  name: 'Global Superstar',   minML: 90_000_000 },
  { order: 10, name: 'Legacy Icon',        minML: 120_000_000 },
];

function resolveCareerStage(monthlyListeners: number): { name: string; order: number } {
  let matched = CAREER_STAGES[0];
  for (const s of CAREER_STAGES) {
    if (monthlyListeners >= s.minML) matched = s;
    else break;
  }
  return matched;
}

function getNextStage(currentOrder: number): { name: string; minML: number } | null {
  const next = CAREER_STAGES.find(s => s.order === currentOrder + 1);
  return next ? { name: next.name, minML: next.minML } : null;
}

function computeProgress(monthlyListeners: number, currentOrder: number): number {
  const current = CAREER_STAGES.find(s => s.order === currentOrder);
  const next = CAREER_STAGES.find(s => s.order === currentOrder + 1);
  if (!current || !next) return 100;
  const range = next.minML - current.minML;
  if (range <= 0) return 100;
  return Math.min(100, Math.floor(((monthlyListeners - current.minML) / range) * 100));
}

// ─── Idempotency key helpers ────────────────────────────────────
function weekBucket(turnId: number): number { return Math.floor(turnId / 7); }

function makeKey(parts: string[]): string { return parts.join(':'); }

function buildMarketSummary(report: any) {
  const heatingUp = Array.isArray(report?.regions?.heatingUp) ? report.regions.heatingUp.filter(Boolean) : [];
  const coolingDown = Array.isArray(report?.regions?.coolingDown) ? report.regions.coolingDown.filter(Boolean) : [];
  if (heatingUp.length === 0 && coolingDown.length === 0) return null;
  return {
    heating_up: heatingUp,
    cooling_down: coolingDown,
  };
}

function marketSummaryText(marketSummary: any): string {
  if (!marketSummary) return '';
  const parts: string[] = [];
  if (Array.isArray(marketSummary.heating_up) && marketSummary.heating_up.length > 0) {
    parts.push(`Markets heating up: ${marketSummary.heating_up.join(', ')}`);
  }
  if (Array.isArray(marketSummary.cooling_down) && marketSummary.cooling_down.length > 0) {
    parts.push(`Cooling: ${marketSummary.cooling_down.join(', ')}`);
  }
  return parts.join(' · ');
}

/**
 * MAIN: Generate all notification payloads for a turn (no writes).
 */
export async function generateNotificationsForTurn(player: any, fanProfile: any, globalTurnId: number, entities: any, ctx: any = {}) {
  if (!player?.id || !fanProfile?.id) return [];

  const notifs: any[] = [];

  try {
    const eras = await entities.Era.filter({ artist_id: player.id, is_active: true });
    const era = eras?.[0];
    const releases = await entities.Release.filter({ artist_id: player.id }, '-lifetime_streams', 5);
    const turnMetrics = ctx?.turn_metrics || {};

    const report = await generateInsightsReport(player, fanProfile, globalTurnId, entities, era, releases, turnMetrics);
    if (!report) {
      console.error(`[NotifGen] Failed to generate report for ${player.id}`);
      return [];
    }

    const pid = player.id;
    const tid = globalTurnId;
    const wb = weekBucket(tid);

    // 1. TURN RECAP (always, one per turn)
    notifs.push(buildTurnRecap(pid, tid, report, turnMetrics));

    // 2. MERCH SURGE (aggregatable)
    const merch = buildMerchSurge(pid, tid, turnMetrics);
    if (merch) notifs.push(merch);

    // 2b. MERCH SCANDAL (immediate alert)
    const scandal = buildMerchScandal(pid, tid, turnMetrics);
    if (scandal) notifs.push(scandal);

    // 3. STREAMING SPIKE (aggregatable)
    const stream = buildStreamingSpike(pid, tid, turnMetrics);
    if (stream) notifs.push(stream);

    // 6. PLAYLIST UPDATE (aggregatable, weekly)
    const playlist = buildPlaylistUpdate(pid, tid, wb, releases);
    if (playlist) notifs.push(playlist);

    // 7. ERA UPDATE (weekly or on phase change)
    const eraUpdate = buildEraUpdate(pid, tid, wb, era, turnMetrics);
    if (eraUpdate) notifs.push(eraUpdate);

    // 8. CAREER UPDATE (weekly, correct stage names)
    const career = buildCareerUpdate(pid, tid, wb, player, fanProfile, report);
    if (career) notifs.push(career);

    // 9. ACHIEVEMENT (per milestone, grouped by turn)
    const achievements = buildAchievements(pid, tid, turnMetrics);
    notifs.push(...achievements);

    // 10. HIGHLIGHT — platform breakout (weekly)
    const platformBreakout = buildPlatformBreakout(pid, tid, wb, report);
    if (platformBreakout) notifs.push(platformBreakout);

    // 11. HIGHLIGHT — era flop (weekly)
    const eraFlop = buildEraFlop(pid, tid, wb, era);
    if (eraFlop) notifs.push(eraFlop);

    // 12. ACHIEVEMENT — ad revenue unlock (one-time)
    const adRev = buildAdRevenueUnlock(pid, tid, turnMetrics);
    if (adRev) notifs.push(adRev);

    // 13. BRAND_DEAL_COMPLETED (from turn_metrics set by brandDealsModule)
    const brandCompleted = buildBrandDealCompleted(pid, tid, turnMetrics);
    if (brandCompleted) notifs.push(brandCompleted);

    // 14. BRAND_DEAL_EXPIRED (from turn_metrics set by brandDealsModule)
    const brandExpired = buildBrandDealExpired(pid, tid, turnMetrics);
    if (brandExpired) notifs.push(brandExpired);

    // 15b. RELEASE OUTCOME CLASSIFICATION — fires when a release locks its terminal outcome
    const outcomeNotifs = buildReleaseOutcomeNotifications(pid, tid, turnMetrics);
    notifs.push(...outcomeNotifs);

    // 16. CAREER_TREND_CHANGE — fires when trends added or removed this turn
    const trendChange = buildCareerTrendChange(pid, tid, ctx?.career_trend_change);
    if (trendChange) notifs.push(trendChange);

    // 17–19. FANDOM events (fatigue, resurgence, high readiness hotness)
    const fandomEvents = buildFandomEvents(pid, tid, ctx?.fandom_modifiers);
    notifs.push(...fandomEvents);

    return notifs;
  } catch (error) {
    console.error(`[NotifGen] Error for player ${player.id}:`, (error as any).message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// BUILDERS — each returns a notification payload or null
// ═══════════════════════════════════════════════════════════════════

export function buildTurnRecap(pid: string, tid: number, report: any, tm: any) {
  const rawPlatformStreams = tm?.platform_streams || {};
  const platformEntries = Object.entries(rawPlatformStreams) as [string, any][];
  const sorted = platformEntries.sort(([, a], [, b]) => N(b) - N(a));
  const topPlat = sorted[0]?.[0] || 'None';

  const platStreams: Record<string, number> = {};
  for (const [name, streams] of sorted) {
    if (N(streams) > 0) platStreams[name] = N(streams);
  }
  const totalStreams = N(tm?.streams_earned) || Object.values(platStreams).reduce((s, v) => s + v, 0);
  const netIncome = N(tm?.income_gained ?? report?.income?.net);
  const chartSummary = report?.chart_summary || tm?.chart_summary || null;
  const marketSummary = buildMarketSummary(report);

  const metrics: Record<string, any> = {
    net_income: netIncome,
    streaming_revenue: N(tm?.streaming_revenue ?? report?.income?.streaming),
    merch_revenue: N(tm?.merch_revenue ?? report?.income?.merch),
    social_revenue: N(tm?.social_revenue),
    brand_deal_revenue: N(tm?.brand_deal_revenue),
    brand_deal_bonus_revenue: N(tm?.brand_deal_bonus_revenue),
    brand_deal_signing_bonus: N(tm?.brand_deal_signing_bonus),
    touring_revenue: N(tm?.touring_revenue),
    fan_sub_revenue: N(tm?.fan_sub_revenue),
    sync_licensing_revenue: N(tm?.sync_licensing_revenue),
    collab_revenue: N(tm?.collab_revenue),
    expenses: N(tm?.expenses),
    total_streams: totalStreams,
    top_platform: topPlat,
    platform_streams: platStreams,
    follower_change: N(tm?.fan_growth),
    fan_growth: N(tm?.fan_growth),
    clout_change: N(tm?.clout_gain),
    monthly_listeners: N(report?.growth?.monthlyListenersGlobal),
    social_follower_growth: N(tm?.social_follower_growth),
    social_fan_growth: N(tm?.social_follower_growth),
    energy_restored: N(tm?.energy_restored),
    inspiration_gained: N(tm?.inspiration_gained),
    merch_units_sold: N(tm?.merch_units_sold),
  };
  if (chartSummary) {
    metrics.chart_summary = chartSummary;
  }
  if (marketSummary) {
    metrics.market_summary = marketSummary;
  }
  if (report?.era?.phase) {
    metrics.era_phase = report.era.phase;
    metrics.era_momentum_change = N(tm?.era_momentum_change);
    metrics.era_tension_change = N(tm?.era_tension_change);
  }

  const marketText = marketSummaryText(marketSummary);
  const summaryParts = [
    `Fans: ${metrics.follower_change >= 0 ? '+' : ''}${metrics.follower_change.toLocaleString()}`,
    `Clout: ${metrics.clout_change >= 0 ? '+' : ''}${metrics.clout_change}`,
  ];

  if (metrics.social_follower_growth > 0) {
    summaryParts.push(`Social: +${metrics.social_follower_growth.toLocaleString()}`);
  }

  summaryParts.push(`Top platform: ${topPlat}`);

  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'TURN_RECAP',
    title: 'Daily Recap',
    subtitle: `Earned $${netIncome.toLocaleString()} today`,
    body: `${summaryParts.join('. ')}${marketText ? `. ${marketText}` : ''}`,
    metrics,
    idempotency_key: makeKey(['recap', pid, String(tid)]),
    priority: 'medium', is_read: false,
    deep_links: { page: 'Career', tab: 'Insights' },
  };
}

function buildMerchSurge(pid: string, tid: number, tm: any) {
  const rev = N(tm?.merch_revenue);
  const units = N(tm?.merch_units_sold);
  if (rev < EXCEPTIONAL_MERCH_REVENUE || units < EXCEPTIONAL_MERCH_UNITS) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'MERCH_SURGE',
    title: 'Exceptional merch surge',
    subtitle: `${units} units · $${rev.toLocaleString()}`,
    body: `${units} merch units moved this turn for $${rev.toLocaleString()}.`,
    metrics: { merch_revenue: rev, merch_units_sold: units },
    idempotency_key: makeKey(['merch', pid, String(tid)]),
    group_key: `merch:${pid}`,
    priority: 'medium', is_read: false,
    deep_links: { page: 'Career', tab: 'Merch' },
  };
}

function buildMerchScandal(pid: string, tid: number, tm: any) {
  const triggered = tm?.merch_scandal_triggered;
  if (!triggered) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'HIGHLIGHT',
    title: '⚠️ Sourcing Scandal Exposed',
    subtitle: 'Questionable merch practices under scrutiny',
    body: 'Media outlets are reporting on questionable sourcing practices in your merch production. This could damage your reputation and fan loyalty.',
    metrics: { scandal_type: 'merch_sourcing' },
    idempotency_key: makeKey(['merch_scandal', pid, String(tid)]),
    priority: 'high', is_read: false,
    deep_links: { page: 'Career', tab: 'Merch' },
  };
}

function buildStreamingSpike(pid: string, tid: number, tm: any) {
  const streams = N(tm?.streams_earned);
  const rev = N(tm?.streaming_revenue);
  if (streams < EXCEPTIONAL_STREAMING_SPIKE) return null;
  
  const k = (streams / 1000).toFixed(1);
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'STREAMING_SPIKE',
    title: 'Exceptional streaming surge',
    subtitle: `${k}K streams · $${rev.toLocaleString()}`,
    body: `${k}K streams across all platforms this turn.`,
    metrics: { streams_earned: streams, streaming_revenue: rev },
    idempotency_key: makeKey(['streaming_spike', pid, String(tid)]),
    group_key: `stream:${pid}`,
    priority: streams >= EXCEPTIONAL_STREAMING_SPIKE * 2 ? 'high' : 'medium',
    is_read: false,
    deep_links: { page: 'Career', tab: 'Releases' },
  };
}

function buildPlaylistUpdate(pid: string, tid: number, wb: number, releases: any[]) {
  if (!releases?.length) return null;
  const withPlacements = releases.filter((r: any) => r.playlist_placements?.length > 0);
  if (withPlacements.length === 0) return null;
  const total = withPlacements.reduce((s: number, r: any) => s + (r.playlist_placements?.length || 0), 0);
  const best = withPlacements[0];
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'PLAYLIST_UPDATE',
    title: 'Playlist power',
    subtitle: `${total} placements active`,
    body: `"${best.release_name || best.title || 'Your release'}" leads with ${best.playlist_placements?.length} placements.`,
    metrics: { total_placements: total, best_release: best.release_name || best.title, best_release_id: best.id },
    idempotency_key: makeKey(['playlist', pid, `week:${wb}`]),
    group_key: `playlist:${pid}`,
    priority: 'medium', is_read: false,
    deep_links: { page: 'Career', tab: 'Releases' },
  };
}

function buildEraUpdate(pid: string, tid: number, wb: number, era: any, tm: any) {
  if (!era?.phase) return null;
  const phaseDesc: Record<string, string> = {
    TEASE: 'Building anticipation. Tease your audience with snippets.',
    DROP: 'Release season! Promote hard and ride the wave.',
    SUSTAIN: 'Maintain momentum with tours, merch, and social.',
    FADE: 'The era is winding down. Plan your next move.',
  };
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'ERA_UPDATE',
    title: `${era.era_name} — ${era.phase}`,
    subtitle: phaseDesc[era.phase] || `Currently in ${era.phase} phase.`,
    body: null,
    metrics: { era_name: era.era_name, phase: era.phase, momentum: era.momentum, tension: era.tension, phase_turns_left: era.phase_turns_left },
    idempotency_key: makeKey(['era_update', pid, `week:${wb}`]),
    group_key: `era:${pid}`,
    priority: 'low', is_read: false,
    deep_links: { page: 'Career', tab: 'Era' },
  };
}

function buildCareerUpdate(pid: string, tid: number, wb: number, player: any, fanProfile: any, report: any) {
  const ml = N(fanProfile?.monthly_listeners);
  const stage = resolveCareerStage(ml);
  // Also accept the profile's career_stage if it's set (pipeline may have promoted)
  const profileStage = player.career_stage || stage.name;
  const profileOrder = CAREER_STAGES.find(s => s.name === profileStage)?.order || stage.order;
  const effectiveOrder = Math.max(stage.order, profileOrder);
  const effectiveStage = CAREER_STAGES.find(s => s.order === effectiveOrder) || stage;
  const marketSummary = buildMarketSummary(report);

  const next = getNextStage(effectiveStage.order);
  const progress = computeProgress(ml, effectiveStage.order);

  const subtitle = next
    ? `${effectiveStage.name} — ${progress}% to ${next.name}`
    : `${effectiveStage.name} — pinnacle reached`;
  const baseBody = next
    ? `${formatCompactNumber(next.minML - ml)} more monthly listeners to reach ${next.name}. Current: ${formatCompactNumber(ml)}.`
    : `You've reached the pinnacle: ${effectiveStage.name}!`;
  const marketText = marketSummaryText(marketSummary);
  const body = marketText ? `${baseBody} ${marketText}.` : baseBody;

  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'CAREER_UPDATE',
    title: 'Career Report',
    subtitle,
    body,
    metrics: {
      career_stage: effectiveStage.name,
      career_stage_order: effectiveStage.order,
      monthly_listeners: ml,
      followers: N(player.followers),
      clout: N(player.clout),
      progress,
      next_stage: next?.name || null,
      next_stage_min_ml: next?.minML || null,
      market_summary: marketSummary,
    },
    idempotency_key: makeKey(['career_update', pid, `week:${wb}`]),
    group_key: `career:${pid}`,
    priority: 'low', is_read: false,
    deep_links: { page: 'Career', tab: 'Insights' },
  };
}

function buildAchievements(pid: string, tid: number, tm: any): any[] {
  const milestones = tm?.milestones_created || [];
  if (milestones.length === 0) return [];
  // Group all milestones in same turn into one card
  const names = milestones.map((m: any) => m.name || m.milestone_type || 'Milestone');
  return [{
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'ACHIEVEMENT',
    title: milestones.length === 1 ? 'Achievement Unlocked!' : `${milestones.length} Achievements Unlocked!`,
    subtitle: names.join(', '),
    body: milestones.length === 1
      ? (milestones[0].description || `You unlocked: ${names[0]}!`)
      : `You unlocked ${milestones.length} milestones this turn: ${names.join(', ')}.`,
    metrics: { milestones: milestones.map((m: any) => ({ type: m.milestone_type, name: m.name })) },
    idempotency_key: makeKey(['achieve', pid, String(tid)]),
    group_key: `achieve:${pid}:${tid}`,
    priority: 'high', is_read: false,
    deep_links: { page: 'Career', tab: 'Insights' },
  }];
}

function buildPlatformBreakout(pid: string, tid: number, wb: number, report: any) {
  const top = Object.entries(report?.platforms || {})
    .sort(([, a]: any, [, b]: any) => N(b?.dailyStreams) - N(a?.dailyStreams))?.[0];
  if (!top) return null;
  const [platName, stats] = top as [string, any];
  if (N(stats?.dailyStreams) < T.platform_breakout_streams) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'HIGHLIGHT',
    title: `${platName} surge`,
    subtitle: `${N(stats.dailyStreams).toLocaleString()} daily streams`,
    body: `${platName} is on fire! Lean into ${(stats.dominantArchetype || 'your sound').replace(/_/g, ' ')}.`,
    metrics: { platform: platName, dailyStreams: N(stats.dailyStreams), dominantArchetype: stats.dominantArchetype },
    idempotency_key: makeKey(['platform_breakout', pid, platName, `week:${wb}`]),
    priority: 'medium', is_read: false,
    deep_links: { page: 'Career', tab: 'Insights' },
  };
}

function buildEraFlop(pid: string, tid: number, wb: number, era: any) {
  if (!era?.is_flop) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'HIGHLIGHT',
    title: 'Era struggling',
    subtitle: `"${era.era_name}" is flopping`,
    body: `Your current era is underperforming. Consider reinventing your sound or starting a new era.`,
    metrics: { era_name: era.era_name, momentum: era.momentum, tension: era.tension },
    idempotency_key: makeKey(['era_flop', pid, `week:${wb}`]),
    deep_links: { page: 'Career', tab: 'Era' },
  };
}

function buildAdRevenueUnlock(pid: string, tid: number, tm: any) {
  const rev = N(tm?.social_revenue);
  if (rev <= 0 || !tm?.social_revenue_first_time) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'ACHIEVEMENT',
    title: 'Ad Revenue Unlocked!',
    subtitle: `$${rev.toLocaleString()} from social platforms`,
    body: 'Your social media accounts are now generating ad revenue. Keep posting!',
    metrics: { social_revenue: rev },
    idempotency_key: makeKey(['lifetime', 'AD_REVENUE_UNLOCK', pid]),
    priority: 'high', is_read: false,
    deep_links: { page: 'Social' },
  };
}

function buildBrandDealCompleted(pid: string, tid: number, tm: any) {
  const count = N(tm?.brand_deals_completed);
  const payout = N(tm?.brand_deal_revenue);
  if (count <= 0) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_COMPLETED',
    title: count === 1 ? 'Brand Deal Complete!' : `${count} Brand Deals Complete!`,
    subtitle: `$${payout.toLocaleString()} earned from InstaVibe`,
    body: count === 1
      ? `Your brand partnership wrapped up this turn. You earned $${payout.toLocaleString()}.`
      : `${count} brand partnerships completed this turn. Total earned: $${payout.toLocaleString()}.`,
    metrics: {
      count,
      total_payout: payout,
      brand_deal_revenue: payout,
      platform: 'instavibe',
      completed_turn: tid,
    },
    idempotency_key: makeKey(['brand_deal_completed', pid, String(tid)]),
    group_key: `brand:${pid}:completed`,
    priority: 'medium', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'history' },
  };
}

// ─── Trend sass copy ────────────────────────────────────────────────────────
const TREND_SASS: Record<string, { title: string; body: string }> = {
  STABLE:          { title: 'Career Status: Stable', body: 'Business as usual. No dramatic highs or lows. Keep releasing music and engaging fans to maintain or improve.' },
  DORMANT:         { title: 'Career Status: Dormant', body: 'You ghosted the charts. No release in over 200 hours. The industry forgot your number. Release something to wake up.' },
  FORGOTTEN:       { title: 'Career Status: Forgotten', body: 'Who? 400+ hours without a release and your career stage has fallen. The culture moved on. Heavy penalties until you come back swinging.' },
  LEGACY_ARTIST:   { title: 'Career Status: Legacy Artist', body: 'Respected. Untouchable. Slightly nostalgic. You are no longer chasing the moment — you ARE the moment that inspired the moment.' },
  PASSED_PRIME:    { title: 'Career Status: Passed Prime', body: 'You had it. Past tense. Career stage dropped, in a slump, and 4+ consecutive flops. Reinvention or retirement, darling.' },
  ONE_HIT_WONDER:  { title: 'Career Status: One Hit Wonder', body: 'You ate. Once. One smash hit but fewer than 4 singles. Non-hit streams −50%. Tour revenue without the hit −50%. Release more music to prove it wasn\'t luck.' },
  VIRAL_SENSATION: { title: 'Career Status: Viral Sensation', body: 'The algorithm is in love with you. Viral post detected and fans growing 20%+. Ride the wave before it crashes.' },
  COMEBACK:        { title: 'Career Status: Comeback', body: 'Oh you thought I was done? Coming back from a slump with a charting release. Redemption arc activated.' },
  CAREER_SLUMP:    { title: 'Career Status: Career Slump', body: 'We need to talk. 3+ declining turns, low hype, no charting release. This is the danger zone before Flop Era.' },
  FLOP_ERA:        { title: 'Career Status: Flop Era', body: 'The era did not era. 3+ consecutive flops and the era is flagged. You need a reset.' },
  GOAT:            { title: 'Career Status: GOAT', body: 'You are the blueprint. Global Superstar+, 2000+ clout, dominating 75% of charts. They are competing with your legacy.' },
};

function buildCareerTrendChange(pid: string, tid: number, trendChange: any) {
  if (!trendChange) return null;
  const added: string[] = trendChange.added || [];
  const removed: string[] = trendChange.removed || [];
  if (added.length === 0 && removed.length === 0) return null;

  // Pick sass copy from the most impactful added trend, fallback to first removed
  const primaryTrend = added[0] || removed[0];
  const sass = TREND_SASS[primaryTrend] || { title: 'Career Temperature Check', body: 'Your career narrative just shifted. Check your Trends panel for the full story.' };

  const addedLabels = added.map(t => t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
  const removedLabels = removed.map(t => t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));

  const subtitleParts: string[] = [];
  if (addedLabels.length > 0) subtitleParts.push(`+${addedLabels.join(', ')}`);
  if (removedLabels.length > 0) subtitleParts.push(`-${removedLabels.join(', ')}`);

  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'CAREER_TREND_CHANGE',
    title: sass.title,
    subtitle: subtitleParts.join(' · '),
    body: sass.body,
    metrics: { added, removed, turn: tid },
    idempotency_key: makeKey(['career_trend_change', pid, String(tid)]),
    group_key: `career_trend:${pid}`,
    priority: 'high', is_read: false,
    deep_links: { page: 'Career', tab: 'Trends' },
  };
}

function buildBrandDealExpired(pid: string, tid: number, tm: any) {
  const count = N(tm?.brand_deals_expired);
  if (count <= 0) return null;
  return {
    player_id: pid, global_turn_id: tid, created_turn_index: tid,
    type: 'BRAND_DEAL_EXPIRED',
    title: count === 1 ? 'Brand Deal Expired' : `${count} Brand Deals Expired`,
    subtitle: `${count} offer${count > 1 ? 's' : ''} lapsed on InstaVibe`,
    body: count === 1
      ? 'A brand deal offer expired before you accepted it. Check your Sponsors tab for new offers.'
      : `${count} brand deal offers expired this turn. New offers will be generated soon.`,
    metrics: {
      count,
      platform: 'instavibe',
    },
    idempotency_key: makeKey(['brand_deal_expired', pid, String(tid)]),
    group_key: `brand:${pid}:expired`,
    priority: 'low', is_read: false,
    deep_links: { page: 'BrandPortfolioApp', tab: 'offers' },
  };
}

// ─── Outcome Classification copy ──────────────────────────────────────────────
const OUTCOME_COPY: Record<string, { title: string; emoji: string; body: string; priority: string }> = {
  // Original labels (preserved)
  Legacy:      { title: 'Legacy Status Achieved!',        emoji: '🏆', body: 'This release has cemented itself as a timeless hit. It will continue earning strong catalogue streams and boost your discography score.',              priority: 'high' },
  CultClassic: { title: 'Cult Classic!',                  emoji: '🎭', body: 'Your fans have spoken — this release has a devoted following. Expect fandom loyalty bonuses and merch tie-in eligibility.',                              priority: 'high' },
  SleeperHit:  { title: 'Sleeper Hit Confirmed!',         emoji: '🌙', body: 'What started slow became something special. This release grew beyond expectations and unlocks discovery algorithm bonuses.',                            priority: 'high' },
  DeepCut:     { title: 'Deep Cut Status',                emoji: '🎵', body: 'Low mainstream streams, but your core fans treasure this one. Expect touring authenticity bonuses when you add it to setlists.',                         priority: 'medium' },
  Flop:        { title: 'Release Underperformed',         emoji: '📉', body: 'This release didn\'t connect with listeners the way you hoped. Focus on your next project — comebacks are always possible.',                            priority: 'medium' },
  Archived:    { title: 'Release Archived',               emoji: '📦', body: 'This release has completed its lifecycle and moved to your catalogue. It will continue earning minimal passive streams.',                                priority: 'low' },
  // Expanded classifications (new)
  Legendary:   { title: 'LEGENDARY Status!',              emoji: '👑', body: 'An all-time great. This release defined your career and will be remembered forever. Exceptional catalogue streams and prestige bonuses unlocked.',       priority: 'high' },
  Classic:     { title: 'Classic Release!',               emoji: '💎', body: 'A timeless release. Fans keep coming back to this one. Strong catalogue performance and playlist placement for years to come.',                          priority: 'high' },
  SmashHit:    { title: 'SMASH HIT!',                     emoji: '💥', body: 'Massive commercial success! This release dominated the charts and streaming platforms. Expect ongoing revenue and prestige.',                            priority: 'high' },
  Hit:         { title: 'It\'s a Hit!',                   emoji: '🔥', body: 'A solid hit with strong streaming numbers. This release performed above expectations and boosts your discography reputation.',                           priority: 'high' },
  Solid:       { title: 'Solid Performance',              emoji: '✅', body: 'This release performed well — a reliable catalog entry. Not flashy, but consistently good. Steady catalogue streams ahead.',                             priority: 'medium' },
  StrongStart: { title: 'Strong Start!',                  emoji: '🚀', body: 'This release debuted strong with impressive opening numbers. The momentum was real, even if it didn\'t sustain at peak levels.',                        priority: 'medium' },
  OneHitWonder:{ title: 'One Hit Wonder',                 emoji: '⭐', body: 'This release was your breakout moment. The spotlight is bright — now prove it wasn\'t just luck. Release more music to shed the label.',                 priority: 'medium' },
};

/**
 * Build notification(s) for releases that received their terminal outcome classification this turn.
 * Only fires for notable outcomes (Legacy, CultClassic, SleeperHit, DeepCut, Flop).
 * Archived is batched into the turn recap to avoid notification spam.
 */
function buildReleaseOutcomeNotifications(pid: string, tid: number, tm: any): any[] {
  const outcomeEvents: any[] = tm?.release_outcome_events || [];
  if (!outcomeEvents.length) return [];
  const notifs: any[] = [];
  for (const evt of outcomeEvents) {
    const outcome = evt.outcome || 'Archived';
    // Skip plain Archived — not noteworthy enough for a dedicated notification
    if (outcome === 'Archived') continue;
    const copy = OUTCOME_COPY[outcome] || OUTCOME_COPY['Archived'];
    const releaseName = evt.release_name || 'Your release';
    notifs.push({
      player_id: pid,
      global_turn_id: tid,
      created_turn_index: tid,
      type: 'RELEASE_OUTCOME',
      title: `${copy.emoji} ${copy.title}`,
      subtitle: `"${releaseName}" — ${outcome}`,
      body: copy.body,
      metrics: {
        release_id: evt.release_id,
        release_name: releaseName,
        outcome,
        lifetime_streams: N(evt.lifetime_streams),
      },
      idempotency_key: makeKey(['release_outcome', pid, evt.release_id || '', String(tid)]),
      group_key: `release_outcome:${pid}`,
      priority: copy.priority,
      is_read: false,
      deep_links: { page: 'Career', tab: 'Releases' },
    });
  }
  return notifs;
}

function buildFandomEvents(pid: string, tid: number, fandomModifiers: any): any[] {
  if (!fandomModifiers) return [];
  const notifs: any[] = [];
  const softState = fandomModifiers.activeSoftState;
  const readiness = N(fandomModifiers.engagementReadiness);
  const nickname = fandomModifiers.nickname || 'your fanbase';

  if (softState === 'FANDOM_FATIGUE') {
    notifs.push({
      player_id: pid, global_turn_id: tid, created_turn_index: tid,
      type: 'HIGHLIGHT',
      title: 'Fandom Fatigue Setting In',
      subtitle: `${nickname} energy is low`,
      body: 'Your fanbase has been consistently disengaged. Fan action strength is reduced until you rebuild momentum.',
      metrics: { soft_state: 'FANDOM_FATIGUE', readiness, rolling_readiness_avg: N(fandomModifiers.rollingReadiness) },
      idempotency_key: makeKey(['fandom_fatigue', pid, String(Math.floor(tid / 3))]),
      group_key: `fandom:${pid}`,
      priority: 'medium', is_read: false,
      deep_links: { page: 'Social', tab: 'Fandom' },
    });
  }

  if (softState === 'CULTURAL_RESURGENCE') {
    notifs.push({
      player_id: pid, global_turn_id: tid, created_turn_index: tid,
      type: 'HIGHLIGHT',
      title: 'Cultural Resurgence!',
      subtitle: `${nickname} snapped back`,
      body: "Your fanbase just bounced back from a low point. Momentum is climbing — now's the time to activate fan actions.",
      metrics: { soft_state: 'CULTURAL_RESURGENCE', readiness, rolling_readiness_avg: N(fandomModifiers.rollingReadiness) },
      idempotency_key: makeKey(['fandom_resurgence', pid, String(tid)]),
      group_key: `fandom:${pid}`,
      priority: 'high', is_read: false,
      deep_links: { page: 'Social', tab: 'Fandom' },
    });
  }

  if (softState === 'NONE' && readiness >= 80) {
    notifs.push({
      player_id: pid, global_turn_id: tid, created_turn_index: tid,
      type: 'HIGHLIGHT',
      title: 'Fandom Running Hot',
      subtitle: `${readiness}% engagement readiness`,
      body: `${nickname} is primed. Activate a fan action this turn to maximize your reach.`,
      metrics: { readiness, nickname },
      idempotency_key: makeKey(['fandom_hot', pid, String(Math.floor(tid / 2))]),
      group_key: `fandom_hot:${pid}`,
      priority: 'medium', is_read: false,
      deep_links: { page: 'Social', tab: 'Fandom' },
    });
  }

  return notifs;
}