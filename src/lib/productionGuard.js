/**
 * Production Guard - Prevents tests and local dev from touching production Supabase
 * 
 * This guard throws early if:
 * - NODE_ENV === 'test' OR VITEST is truthy (test environment)
 * - AND the Supabase URL points to hosted production (supabase.co or custom domains)
 * - AND ALLOW_HOSTED_SUPABASE=1 is not set (local dev protection)
 * 
 * This ensures tests and local dev never accidentally hit production databases.
 */

/**
 * Detects if a URL points to hosted Supabase (not local development)
 */
export function isHostedSupabaseUrl(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Local development hosts (allowed)
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname === '0.0.0.0' || 
        hostname === '::1') {
      return false;
    }
    
    // Hosted Supabase domains
    if (hostname.endsWith('.supabase.co')) {
      return true;
    }
    
    // HTTPS non-local URLs (likely hosted/custom domains)
    if (parsed.protocol === 'https:' && 
        hostname !== 'localhost' && 
        hostname !== '127.0.0.1' && 
        !hostname.startsWith('192.168.') && 
        !hostname.startsWith('10.')) {
      return true;
    }
    
    return false;
  } catch {
    // If URL parsing fails, assume hosted if it contains supabase.co
    return url.includes('supabase.co');
  }
}

/**
 * Determines if hosted Supabase should be blocked
 */
export function shouldBlockHosted(url) {
  const isHosted = isHostedSupabaseUrl(url);
  const isCI = (typeof process !== 'undefined' && (process.env?.CI === 'true' || process.env?.GITHUB_ACTIONS === 'true')) ||
               (typeof import.meta !== 'undefined' && (import.meta.env?.CI === 'true' || import.meta.env?.GITHUB_ACTIONS === 'true'));
  const allowHosted = (typeof process !== 'undefined' && process.env?.ALLOW_HOSTED_SUPABASE === '1') ||
                     (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ALLOW_HOSTED_SUPABASE === '1');
  
  return isHosted && !isCI && !allowHosted;
}

export function throwIfProductionInTest(supabaseUrl, context = 'Supabase client') {
  // Check if we're in a test environment
  const isTestEnvironment = 
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST === '1')) ||
    (typeof globalThis !== 'undefined' && globalThis?.Deno?.env?.get('VITEST') === '1') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITEST === '1') ||
    (typeof globalThis !== 'undefined' && globalThis?.importMeta?.env?.VITEST === '1');

  if (!isTestEnvironment) {
    return; // Not in test environment, check other conditions
  }

  // Get URL from multiple possible sources for test environment.
  // Prefer runtime-overridden globalThis.importMeta values so tests can safely isolate cases.
  let testUrl =
    (typeof globalThis !== 'undefined' && globalThis?.importMeta?.env?.VITE_SUPABASE_URL) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    supabaseUrl;

  // Handle undefined URL (string 'undefined' or actual undefined) - allow fallback
  if (!testUrl || testUrl === 'undefined' || testUrl === 'null') {
    return; // No URL provided, will use fallback
  }

  // Check if URL points to hosted Supabase production
  const isProductionSupabase = isHostedSupabaseUrl(testUrl);

  // Special case: allow local URLs and fallback cases in tests
  const isLocalOrFallback = !isProductionSupabase || testUrl.includes('127.0.0.1') || testUrl.includes('localhost');

  if (!isLocalOrFallback && isProductionSupabase) {
    throw new Error(
      `🚨 PRODUCTION GUARD: ${context} attempted to connect to hosted Supabase in test environment!\n` +
      `   URL: ${testUrl}\n` +
      `   Environment: NODE_ENV=${process?.env?.NODE_ENV}, VITEST=${process?.env?.VITEST || import.meta.env?.VITEST || globalThis?.importMeta?.env?.VITEST}\n` +
      `   Solution: Use local Supabase (http://127.0.0.1:54321) or unset SUPABASE_URL for tests.\n` +
      `   This guard prevents accidental production data access during testing.`
    );
  }
}

export function throwIfHostedSupabase(supabaseUrl, context = 'Supabase client') {
  if (!supabaseUrl) {
    return; // No URL provided, will use fallback
  }

  // Check if hosted Supabase should be blocked in local dev
  if (shouldBlockHosted(supabaseUrl)) {
    throw new Error(
      `🚨 PRODUCTION GUARD: ${context} attempted to connect to hosted Supabase from local development!\n` +
      `   URL: ${supabaseUrl}\n` +
      `   Environment: Local development (not CI)\n` +
      `   Solution: Set ALLOW_HOSTED_SUPABASE=1 to explicitly allow hosted connections,\n` +
      `   or use local Supabase (http://127.0.0.1:54321) for development.\n` +
      `   This guard prevents accidental production data access from your laptop.`
    );
  }
}

export function isTestEnvironment() {
  return (
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST === '1')) ||
    (typeof globalThis !== 'undefined' && globalThis?.Deno?.env?.get('VITEST') === '1') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITEST === '1')
  );
}
