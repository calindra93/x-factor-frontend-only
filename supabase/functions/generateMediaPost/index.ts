import { supabaseAdmin } from '../_shared/lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from '../_shared/lib/supabaseEntityAdapter.ts';
import { generateMediaPost, type MediaEventType } from '../_shared/mediaPostGenerator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const VALID_EVENT_TYPES: MediaEventType[] = [
  'new_release',
  'chart_entry',
  'certification',
  'tour_announcement',
  'tour_completion',
  'milestone_followers',
  'milestone_streams',
  'collaboration',
  'controversy',
  'comeback',
  'award',
  'viral_moment'
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      mediaPlatformId,
      platformHandle,
      eventType,
      eventDetails = {},
      artistName,
      artistId
    } = body || {};

    if (!eventType || !artistName || (!mediaPlatformId && !platformHandle)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: eventType, artistName, and mediaPlatformId or platformHandle'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!VALID_EVENT_TYPES.includes(eventType as MediaEventType)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);
    let platform = null;

    if (mediaPlatformId) {
      const matches = await entities.MediaPlatform.filter({ id: mediaPlatformId });
      platform = matches?.[0] || null;
    } else if (platformHandle) {
      const matches = await entities.MediaPlatform.filter({ handle: platformHandle });
      platform = matches?.[0] || null;
    }

    if (!platform) {
      return new Response(JSON.stringify({ success: false, error: 'Media platform not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const post = await generateMediaPost(
      entities,
      platform,
      eventType as MediaEventType,
      eventDetails,
      artistName,
      artistId
    );

    return new Response(JSON.stringify({ success: true, data: post }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    // Safe error serialization to prevent "[object Object]" responses
    let safeError: string;
    if (error instanceof Error) {
      // Include stack trace for debugging
      safeError = JSON.stringify({
        message: error.message,
        stack: error.stack,
        name: error.name
      }, null, 2);
    } else if (typeof error === 'object' && error !== null) {
      try {
        safeError = JSON.stringify(error, null, 2);
      } catch {
        safeError = 'Unknown error object';
      }
    } else {
      safeError = String(error);
    }
    
    console.error('[generateMediaPost] Full error:', error);
    console.error('[generateMediaPost] Serialized error:', safeError);

    return new Response(JSON.stringify({ success: false, error: safeError }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
