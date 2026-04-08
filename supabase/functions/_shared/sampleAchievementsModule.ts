/**
 * sampleAchievementsModule.ts
 *
 * Runs once per player per turn (after sampleClearanceModule).
 * Checks total cleared samples → awards Bronze/Silver/Gold/Platinum.
 * Applies economic, access, and stat benefits on tier unlock.
 *
 * Thresholds: Bronze=5, Silver=25, Gold=100, Platinum=500
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';

function N(v: any): number { return Number(v) || 0; }

const ACHIEVEMENT_TIERS = [
  {
    tier: 'bronze',
    threshold: 5,
    label: 'Sample Master: Bronze',
    description: 'Cleared 5 samples. You know the basics.',
    fee_discount: 5,           // 5% off future sample fees
    quality_multiplier: 0.02,  // +2% sample quality boost
    legendary_unlock: false,
    clout_bonus: 5,
    hype_bonus: 2,
  },
  {
    tier: 'silver',
    threshold: 25,
    label: 'Sample Master: Silver',
    description: 'Cleared 25 samples. A seasoned crate-digger.',
    fee_discount: 8,
    quality_multiplier: 0.05,
    legendary_unlock: false,
    clout_bonus: 15,
    hype_bonus: 5,
  },
  {
    tier: 'gold',
    threshold: 100,
    label: 'Sample Master: Gold',
    description: 'Cleared 100 samples. Legendary producer status.',
    fee_discount: 12,
    quality_multiplier: 0.10,
    legendary_unlock: true,    // unlocks legendary sample sources
    clout_bonus: 30,
    hype_bonus: 10,
  },
  {
    tier: 'platinum',
    threshold: 500,
    label: 'Sample Master: Platinum',
    description: 'Cleared 500 samples. You ARE the sample library.',
    fee_discount: 15,
    quality_multiplier: 0.15,
    legendary_unlock: true,
    clout_bonus: 75,
    hype_bonus: 20,
  },
] as const;

export async function processSampleAchievementsForPlayer(
  player: any,
  globalTurnId: number,
  _entities: any,
  _ctx: any = {}
): Promise<{ success: boolean; deltas: any; error?: string }> {
  const supabase = supabaseAdmin;
  const notifications: any[] = [];
  const turnEvents: any[] = [];
  const artistProfileDelta: Record<string, any> = {};
  const achievementsToCreate: any[] = [];

  try {
    // 1. Count total cleared samples for this player
    // Count all samples the player has actively committed to clearing.
    // NPC samples start as 'clearing' (not 'completed') until clearance_turns_remaining → 0.
    // We intentionally exclude only 'pending' (not yet paid) and 'denied'/'unlicensed' (rejected).
    // This prevents the achievement threshold from being perpetually zero for players who have
    // many in-progress or already-cleared NPC samples.
    const { count: clearedCount, error: countErr } = await supabase
      .from('sample_requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', player.id)
      .not('status', 'in', '("pending","denied","unlicensed")');

    if (countErr) throw new Error(`sample_requests count: ${countErr.message}`);
    const totalCleared = clearedCount ?? 0;

    if (totalCleared === 0) return { success: true, deltas: {} };

    // 2. Fetch existing achievements for this player
    const { data: existing } = await supabase
      .from('sample_achievements')
      .select('tier')
      .eq('artist_id', player.id);

    const unlockedTiers = new Set((existing || []).map((a: any) => a.tier));

    // 3. Check each tier threshold
    let highestNewTier: (typeof ACHIEVEMENT_TIERS)[number] | null = null;

    for (const tierDef of ACHIEVEMENT_TIERS) {
      if (unlockedTiers.has(tierDef.tier)) continue;
      if (totalCleared < tierDef.threshold) continue;

      // This tier is newly earned
      achievementsToCreate.push({
        artist_id: player.id,
        tier: tierDef.tier,
        samples_cleared_count: totalCleared,
        unlocked_turn: globalTurnId,
      });

      highestNewTier = tierDef;

      notifications.push({
        player_id: player.id,
        type: 'ACHIEVEMENT',
        title: `🏆 ${tierDef.label}`,
        subtitle: tierDef.description,
        body: `Benefits unlocked: -${tierDef.fee_discount}% sample fees, +${Math.round(tierDef.quality_multiplier * 100)}% quality multiplier${tierDef.legendary_unlock ? ', legendary sample sources unlocked' : ''}.`,
        priority: 'high',
        is_read: false,
        metrics: {
          milestone_name: tierDef.label,
          milestone_type: `sample_master_${tierDef.tier}`,
          samples_cleared: totalCleared,
          fee_discount: tierDef.fee_discount,
          legendary_unlock: tierDef.legendary_unlock,
        },
        idempotency_key: `sample_achievement_${tierDef.tier}_${player.id}`,
        created_turn_index: globalTurnId,
        deep_links: { page: 'Studio', tab: 'Samples' },
      });

      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'SampleAchievements',
        event_type: 'achievement_unlocked',
        description: `${tierDef.label} unlocked (${totalCleared} samples cleared)`,
        metadata: { tier: tierDef.tier, threshold: tierDef.threshold, total_cleared: totalCleared },
      });
    }

    // 4. Apply benefits for ALL unlocked tiers (cumulative)
    // Re-derive highest unlocked tier including newly earned ones
    const allUnlockedTiers = new Set([...unlockedTiers, ...achievementsToCreate.map((a: any) => a.tier)]);

    let bestFeeDiscount = 0;
    let bestQualityMult = 1.0;
    let bestLegendaryUnlock = false;

    for (const tierDef of ACHIEVEMENT_TIERS) {
      if (!allUnlockedTiers.has(tierDef.tier)) continue;
      bestFeeDiscount = Math.max(bestFeeDiscount, tierDef.fee_discount);
      bestQualityMult = Math.max(bestQualityMult, 1.0 + tierDef.quality_multiplier);
      if (tierDef.legendary_unlock) bestLegendaryUnlock = true;
    }

    // Only update profile fields if they changed or new achievements were earned
    if (achievementsToCreate.length > 0) {
      artistProfileDelta.sample_fee_discount_pct = bestFeeDiscount;
      artistProfileDelta.sample_quality_multiplier = bestQualityMult;
      if (bestLegendaryUnlock) artistProfileDelta.legendary_samples_unlocked = true;

      // One-time clout/hype bonus for the newly unlocked tier
      if (highestNewTier) {
        const currentClout = N(player.clout);
        const currentHype  = N(player.hype);
        artistProfileDelta.clout = Math.min(2_000_000, currentClout + highestNewTier.clout_bonus);
        artistProfileDelta.hype  = Math.min(100, currentHype + highestNewTier.hype_bonus);
      }
    }

    return {
      success: true,
      deltas: {
        artistProfile: Object.keys(artistProfileDelta).length > 0 ? artistProfileDelta : undefined,
        notifications_to_create: notifications,
        sample_achievement_upserts: achievementsToCreate,
        turn_events: turnEvents,
        milestones_created: achievementsToCreate.map((a: any) => ({
          milestone_type: `sample_master_${a.tier}`,
          name: ACHIEVEMENT_TIERS.find(t => t.tier === a.tier)?.label,
          description: ACHIEVEMENT_TIERS.find(t => t.tier === a.tier)?.description,
        })),
      },
    };
  } catch (err: any) {
    console.error(`[SampleAchievements] Error for ${player.id}:`, err.message);
    return { success: false, error: err.message, deltas: {} };
  }
}
