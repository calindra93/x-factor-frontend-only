import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { throwIfProductionInTest } from './productionGuard.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Production guard: prevent tests from hitting production
throwIfProductionInTest(supabaseUrl || '', 'Shared Supabase admin client');

// NOTE: throwIfHostedSupabase is intentionally NOT called here.
// Edge functions run on Supabase infrastructure where SUPABASE_URL always points
// to *.supabase.co — blocking hosted URLs would break all production edge functions.
// The test guard above is sufficient for safety.

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin functions.');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
