/**
 * sampleRoyaltyModule.ts
 *
 * Runs once per player per turn (after sampleClearanceModule).
 * Two directions:
 *   A) Pay royalties OUT — for songs this player made that sample others
 *   B) Receive royalties IN — for songs this player owns that are being sampled
 *
 * Royalty rates (tier-based, cached on songs.sample_royalty_rate):
 *   common:    5%  of sampling song's streaming revenue
 *   viral:     10% of sampling song's streaming revenue
 *   rare:      10% of sampling song's streaming revenue
 *   legendary: 15% of sampling song's streaming revenue
 *
 * Decay schedule (turns since sampling song released):
 *   0-50 turns:   100% of rate
 *   51-100 turns: 50% of rate
 *   101-150 turns: 25% of rate
 *   151+ turns:    0% (royalties end)
 */

import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { isTerminalState } from './economyMath.ts';

function N(v: any): number { return Number(v) || 0; }

function buildRoyaltyReceivedNotification(playerId: string, globalTurnId: number, royaltyAmount: number, sourceCount: number) {
  return {
    player_id: playerId,
    global_turn_id: globalTurnId,
    created_turn_index: globalTurnId,
    type: 'ROYALTY_PAYMENT',
    title: '💰 Sample Royalty Received',
    subtitle: `$${royaltyAmount.toFixed(2)} from ${sourceCount} sampled song${sourceCount === 1 ? '' : 's'}`,
    body: `Your catalog generated $${royaltyAmount.toFixed(2)} in sample royalties this turn.`,
    priority: 'low',
    is_read: false,
    metrics: { royalty_amount: royaltyAmount, source_count: sourceCount },
    idempotency_key: `royalty_summary:${playerId}:${globalTurnId}`,
  };
}

function computeDecayMultiplier(turnsElapsed: number): number {
  if (turnsElapsed <= 50)  return 1.00;
  if (turnsElapsed <= 100) return 0.50;
  if (turnsElapsed <= 150) return 0.25;
  return 0;
}

export async function processSampleRoyaltiesForPlayer(
  player: any,
  globalTurnId: number,
  _entities: any,
  ctx: any = {}
): Promise<{ success: boolean; deltas: any; error?: string }> {
  const supabase = supabaseAdmin;
  const notifications: any[] = [];
  const turnEvents: any[] = [];
  const paymentsToCreate: any[] = [];

  let royaltiesReceived = 0; // income this player earns as original artist
  let royaltiesPaid     = 0; // income deducted for samples this player used
  let royaltySourcesPaid = 0;

  try {
    // ─── A. ROYALTIES PAID OUT ────────────────────────────────────────────────
    // Find this player's songs that use samples with an active royalty rate
    const { data: samplingSongs } = await supabase
      .from('songs')
      .select('id, title, sample_source_id, sampled_player_song_id, sample_royalty_rate, release_id, release_status')
      .eq('artist_id', player.id)
      .not('sample_royalty_rate', 'is', null)
      .gt('sample_royalty_rate', 0)
      .eq('release_status', 'released');

    for (const song of samplingSongs || []) {
      const royaltyRate = N(song.sample_royalty_rate);
      if (royaltyRate === 0) continue;

      // Get release to determine streams and turns elapsed
      if (!song.release_id) continue;
      const { data: release } = await supabase
        .from('releases')
        .select('id, lifecycle_state, lifetime_streams, scheduled_turn')
        .eq('id', song.release_id)
        .maybeSingle();

      if (!release) continue;
      if (isTerminalState(release.lifecycle_state)) continue;

      // Compute turns elapsed for decay
      const releaseTurn = N(release.scheduled_turn);
      const turnsElapsed = releaseTurn > 0 ? globalTurnId - releaseTurn : 0;
      const decay = computeDecayMultiplier(turnsElapsed);
      if (decay === 0) continue; // royalties expired

      // Get this turn's streaming revenue for the song from ctx (turn_metrics)
      // Fallback: estimate from lifetime streams delta if not available
      const turnMetrics = ctx?.turn_metrics || {};
      let turnStreamingRevenue = 0;

      // Try to read per-release streaming revenue from release_turn_metrics
      const { data: rtm } = await supabase
        .from('release_turn_metrics')
        .select('streams_this_turn')
        .eq('release_id', song.release_id)
        .eq('global_turn_id', globalTurnId)
        .maybeSingle();

      if (rtm) {
        // Approximate streaming revenue: ~$0.003 per stream (blended rate)
        turnStreamingRevenue = Math.round(N(rtm.streams_this_turn) * 0.003 * 100) / 100;
      } else if (turnMetrics.streaming_revenue) {
        // Pro-rata estimate: this song's royalty as a fraction of total streaming rev
        turnStreamingRevenue = N(turnMetrics.streaming_revenue) * 0.3; // conservative estimate
      }

      if (turnStreamingRevenue <= 0) continue;

      const royaltyAmount = Math.round(turnStreamingRevenue * royaltyRate * decay * 100) / 100;
      if (royaltyAmount < 0.01) continue;

      royaltiesPaid += royaltyAmount;

      // Determine who to pay (original player song or NPC source)
      const originalArtistId = song.sampled_player_song_id ? null : null; // resolved below

      // Find the original artist from the NPC source if applicable
      // For NPC samples: original_artist_id → system account (no actual payment to a player)
      // For player samples: sampled_player_song_id → that song's artist_id
      let recipientArtistId: string | null = null;
      if (song.sampled_player_song_id) {
        const { data: origSong } = await supabase
          .from('songs')
          .select('artist_id')
          .eq('id', song.sampled_player_song_id)
          .maybeSingle();
        recipientArtistId = origSong?.artist_id || null;
      }

      paymentsToCreate.push({
        sampling_song_id: song.id,
        original_song_id: song.sampled_player_song_id || null,
        sample_source_id: song.sample_source_id || null,
        original_artist_id: recipientArtistId || player.id, // fallback to self if NPC
        sampling_artist_id: player.id,
        global_turn_id: globalTurnId,
        royalty_rate: royaltyRate,
        decay_multiplier: decay,
        streaming_revenue: turnStreamingRevenue,
        royalty_amount: royaltyAmount,
      });

      turnEvents.push({
        global_turn_id: globalTurnId,
        player_id: player.id,
        module: 'SampleRoyalty',
        event_type: 'royalty_paid',
        description: `Royalty paid: $${royaltyAmount.toFixed(2)} for "${song.title}" (rate=${royaltyRate}, decay=${decay})`,
        metadata: { song_id: song.id, royalty_amount: royaltyAmount, decay, turns_elapsed: turnsElapsed },
      });
    }

    // ─── B. ROYALTIES RECEIVED ────────────────────────────────────────────────
    // Find songs owned by this player that other artists are sampling
    const { data: sampledSongs } = await supabase
      .from('songs')
      .select(`
        id, title,
        sampling_songs:songs!sampled_player_song_id(id, title, artist_id, release_id, release_status, sample_royalty_rate)
      `)
      .eq('artist_id', player.id)
      .eq('release_status', 'released');

    for (const origSong of sampledSongs || []) {
      const samplers: any[] = (origSong as any).sampling_songs || [];
      for (const sampler of samplers) {
        if (!sampler.release_id || sampler.release_status !== 'released') continue;
        const royaltyRate = N(sampler.sample_royalty_rate);
        if (royaltyRate === 0) continue;

        // Get release for decay calculation
        const { data: release } = await supabase
          .from('releases')
          .select('lifecycle_state, scheduled_turn')
          .eq('id', sampler.release_id)
          .maybeSingle();

        if (!release || isTerminalState(release.lifecycle_state)) continue;

        const turnsElapsed = globalTurnId - N(release.scheduled_turn);
        const decay = computeDecayMultiplier(Math.max(0, turnsElapsed));
        if (decay === 0) continue;

        const { data: rtm } = await supabase
          .from('release_turn_metrics')
          .select('streams_this_turn')
          .eq('release_id', sampler.release_id)
          .eq('global_turn_id', globalTurnId)
          .maybeSingle();

        if (!rtm) continue;
        const turnStreamingRevenue = Math.round(N(rtm.streams_this_turn) * 0.003 * 100) / 100;
        if (turnStreamingRevenue <= 0) continue;

        const royaltyAmount = Math.round(turnStreamingRevenue * royaltyRate * decay * 100) / 100;
        if (royaltyAmount < 0.01) continue;

        royaltiesReceived += royaltyAmount;
        royaltySourcesPaid += 1;
      }
    }

    // ─── C. APPLY INCOME DELTA ────────────────────────────────────────────────
    const netRoyaltyDelta = Math.round((royaltiesReceived - royaltiesPaid) * 100) / 100;
    const artistProfileDelta: Record<string, any> = {};

    if (Math.abs(netRoyaltyDelta) >= 0.01) {
      const currentIncome = N(player.income);
      artistProfileDelta.income = Math.max(0, currentIncome + netRoyaltyDelta);
    }

    // ─── D. STAGE ROYALTY RECEIPTS ────────────────────────────────────────────
    // Royalty payment rows are staged from the sampler's turn.
    // Income for the original artist is calculated on their own turn in section B,
    // which keeps the result order-independent and avoids cross-player double-counting.
    if (royaltiesReceived >= 1) {
      notifications.push(
        buildRoyaltyReceivedNotification(player.id, globalTurnId, royaltiesReceived, royaltySourcesPaid)
      );
    }

    return {
      success: true,
      deltas: {
        artistProfile: Object.keys(artistProfileDelta).length > 0 ? artistProfileDelta : undefined,
        notifications_to_create: notifications,
        turn_events: turnEvents,
        sample_royalty_payment_upserts: paymentsToCreate,
        royalties_paid: royaltiesPaid,
        royalties_received: royaltiesReceived,
      },
    };
  } catch (err: any) {
    console.error(`[SampleRoyalty] Error for ${player.id}:`, err.message);
    return { success: false, error: err.message, deltas: {} };
  }
}
