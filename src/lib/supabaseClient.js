import { createClient } from '@supabase/supabase-js';
import { throwIfProductionInTest } from './productionGuard.js';

/**
 * Reads an environment variable from multiple sources, in priority order:
 *  1. globalThis.importMeta.env (test harness overrides)
 *  2. import.meta.env (Vite static replacement - works in dev & build)
 *  3. window.__ENV (runtime injection via Vite plugin - works in preview/production)
 *  4. process.env (Node/SSR fallback)
 */
const getEnvVar = (key) => {
  if (typeof globalThis !== 'undefined' && globalThis?.importMeta?.env && key in globalThis.importMeta.env) {
    return globalThis.importMeta.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    return import.meta.env[key];
  }
  // Runtime env injection: window.__ENV is set by the injectRuntimeEnv Vite plugin
  if (typeof window !== 'undefined' && window.__ENV && key in window.__ENV) {
    return window.__ENV[key];
  }
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return process.env[key];
  }
  return undefined;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_KEY') || getEnvVar('SUPABASE_ANON_KEY');
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackAnonKey = 'public-anon-key-placeholder';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

throwIfProductionInTest(supabaseUrl, 'Browser Supabase client');

if (!isSupabaseConfigured) {
  console.warn('[supabaseClient] Missing SUPABASE_URL/SUPABASE_ANON_KEY environment variables. Using inert fallback client.');
}

export const supabaseClient = createClient(
  supabaseUrl || fallbackUrl, 
  supabaseAnonKey || fallbackAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Reduce lock timeout to prevent long waits
      lockTimeout: 5000, // 5 seconds instead of default 10
    }
  }
);
