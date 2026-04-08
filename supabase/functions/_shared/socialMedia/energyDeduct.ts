/**
 * Atomic energy deduction helper for social media handlers.
 * 
 * Calls the `deduct_profile_energy` RPC function which atomically
 * decrements energy with a floor check, preventing concurrent-request
 * double-spend.
 * 
 * Plan 051 Phase 2.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin.ts';
import { deductEnergyAtomic } from '../profileEnergy.ts';

export async function deductEnergy(
  supabase: typeof supabaseAdmin,
  artistId: string,
  cost: number,
): Promise<{ success: boolean; remainingEnergy: number }> {
  return deductEnergyAtomic(supabase, artistId, cost);
}
