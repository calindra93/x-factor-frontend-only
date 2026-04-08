/**
 * fandomActions — Fandom Engine API
 *
 * Routes all actions through fandomActionsServer.ts.
 * The shared server handler is responsible for authenticated ownership checks.
 */

import { handleRequest } from '../_shared/fandomActionsServer.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://x-factor-rho.vercel.app',
];

function getAllowedOrigins() {
  const allowedOrigins = new Set(DEFAULT_ALLOWED_ORIGINS);

  for (const key of ['ALLOWED_WEB_ORIGINS', 'APP_ORIGIN', 'SITE_URL']) {
    const rawValue = (Deno.env.get(key) || '').trim();
    if (!rawValue) continue;

    for (const origin of rawValue.split(',').map((value) => value.trim()).filter(Boolean)) {
      allowedOrigins.add(origin);
    }
  }

  return allowedOrigins;
}

const ALLOWED_WEB_ORIGINS = getAllowedOrigins();

function buildCorsHeaders(req: Request) {
  const origin = (req.headers.get('origin') || '').trim();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (origin && ALLOWED_WEB_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function isDisallowedBrowserOrigin(req: Request, corsHeaders: Record<string, string>) {
  return !!req.headers.get('origin') && !corsHeaders['Access-Control-Allow-Origin'];
}

(globalThis as any).Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    if (isDisallowedBrowserOrigin(req, corsHeaders)) {
      return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (isDisallowedBrowserOrigin(req, corsHeaders)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const res = await handleRequest(req);
  const body = await res.text();

  const responseHeaders = new Headers(res.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', 'application/json');
  }

  return new Response(body, {
    status: res.status,
    headers: responseHeaders,
  });
});
