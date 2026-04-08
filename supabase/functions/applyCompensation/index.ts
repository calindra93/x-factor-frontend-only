/**
 * APPLY COMPENSATION EDGE FUNCTION
 * One-time function to compensate all players with 20K for data loss
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const compensationToken = Deno.env.get('COMPENSATION_RUN_TOKEN');
    const requestToken = req.headers.get('x-compensation-token');
    if (!compensationToken || requestToken !== compensationToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('[Compensation] Starting player compensation...');

    // Get current turn state
    const { data: turnState } = await supabase
      .from('turn_state')
      .select('global_turn_id')
      .eq('id', 1)
      .single();

    const turnId = turnState?.global_turn_id || 1;

    // Get all players
    const { data: players, error: fetchError } = await supabase
      .from('players')
      .select('id, income');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`[Compensation] Found ${players.length} players`);

    // Apply compensation to each player
    const compensationResults = [];
    for (const player of players) {
      const idempotencyKey = `compensation:2026-02-data-loss:${player.id}`;
      const { data: existingComp } = await supabase
        .from('player_turn_history')
        .select('id')
        .eq('player_id', player.id)
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if ((existingComp || []).length > 0) {
        continue;
      }

      const oldIncome = player.income || 0;
      const newIncome = oldIncome + 20000;

      // Update player income
      const { error: updateError } = await supabase
        .from('players')
        .update({ income: newIncome })
        .eq('id', player.id);

      if (updateError) {
        console.error(`[Compensation] Failed to update player ${player.id}:`, updateError);
        continue;
      }

      // Log in turn history
      await supabase
        .from('player_turn_history')
        .insert({
          player_id: player.id,
          global_turn_id: turnId,
          turn_id: turnId,
          module: 'applyCompensation',
          idempotency_key: idempotencyKey,
          status: 'compensation_applied',
          deltas_applied: {
            compensation_amount: 20000,
            reason: 'Data loss compensation',
            previous_income: oldIncome,
            new_income: newIncome
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      // Send notification
      await supabase
        .from('notifications')
        .insert({
          player_id: player.id,
          type: 'COMPENSATION_GRANTED',
          title: 'Compensation Granted',
          subtitle: '20K income added to your account',
          body: 'We apologize for the recent data loss issues. As compensation, we\'ve added 20K to your account. Thank you for your patience!',
          deep_links: [
            { label: 'View Career', route: 'Career' }
          ],
          priority: 'high',
          is_read: false,
          created_at: new Date().toISOString()
        });

      compensationResults.push({
        playerId: player.id,
        oldIncome,
        newIncome,
        compensation: 20000
      });
    }

    console.log(`[Compensation] Successfully compensated ${compensationResults.length} players`);

    return new Response(JSON.stringify({
      success: true,
      compensated: compensationResults.length,
      totalAmount: compensationResults.length * 20000,
      results: compensationResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Compensation] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
