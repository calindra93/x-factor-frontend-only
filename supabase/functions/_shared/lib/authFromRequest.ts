import { supabaseAdmin } from './supabaseAdmin.ts';

/**
 * Extract and verify the authenticated user from a Supabase Edge Function request.
 * Reads the JWT from the Authorization header and verifies it via supabaseAdmin.auth.getUser().
 * Returns { user, error } where user is null if auth fails.
 */
export async function getAuthUser(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return { user: null, error: 'No authorization header' };
  }

  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !user) {
      return { user: null, error: authErr?.message || 'Invalid token' };
    }
    return { user, error: null };
  } catch (err) {
    return { user: null, error: (err as Error).message };
  }
}

/**
 * Require admin role from the JWT user metadata.
 * Returns { user, error } where error is set if not admin.
 */
export async function requireAdmin(req: Request) {
  const { user, error } = await getAuthUser(req);
  if (!user) return { user: null, error: error || 'Unauthorized' };

  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (role !== 'admin') {
    return { user: null, error: 'Admin only' };
  }
  return { user, error: null };
}
