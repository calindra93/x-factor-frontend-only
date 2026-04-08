// @ts-nocheck
/**
 * BROWSER-ONLY SDK - Frontend safe version
 * This file only contains browser-safe code and uses anon client only
 * NO admin/service-role client code should be imported or used here
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { hasInvalidFilterParams, logQueryIssue, runSafeFetch, runSupabaseQuery } from '@/lib/queryDiagnostics';

/**
 * Reads an environment variable from multiple sources, in priority order:
 *  1. import.meta.env (Vite static replacement - works in dev & build)
 *  2. window.__ENV (runtime injection via Vite plugin - works in preview/production)
 *  3. process.env (Node/SSR fallback)
 */
const getEnvVar = (key: string, fallback = ''): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (val) return val;
  }
  // Runtime env injection: window.__ENV is set by the injectRuntimeEnv Vite plugin
  if (typeof window !== 'undefined' && (window as any).__ENV && key in (window as any).__ENV) {
    const val = (window as any).__ENV[key];
    if (val) return val;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
};

// Browser SDK only uses anon key - NO service role key
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL', getEnvVar('SUPABASE_URL', ''));
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY', '') || getEnvVar('VITE_SUPABASE_KEY', '') || getEnvVar('SUPABASE_ANON_KEY', '');

// BROWSER-SAFE: Only anon client available
const supabaseAdminClient = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateEntityId(id, operation, tableName) {
  if (id === undefined || id === null) {
    throw new Error(`[SDK] ${operation} on "${tableName}" called with ${id} id`);
  }
  if (typeof id === 'string' && id.startsWith('temp-')) return; // Allow temp IDs for optimistic UI
  if (typeof id === 'number') return; // Allow numeric IDs (e.g., turn_state.id = 1)
  if (typeof id === 'string' && !UUID_REGEX.test(id) && id !== 'fallback-studio') {
    console.warn(`[SDK] ${operation} on "${tableName}" called with non-UUID id: "${id}"`);
  }
}

const BASE44_ENTITY_TABLE_MAP = {
  ArtistProfile: 'profiles',
  FanProfile: 'fan_profiles',
  Release: 'releases',
  Merch: 'merch',
  Notification: 'notifications',
  TurnState: 'turn_state',
  Era: 'eras',
  CareerMilestone: 'career_milestones',
  UserAccount: 'players',
  AccessCode: 'access_codes',
  Song: 'songs',
  Project: 'projects',
  Studio: 'studios',
  Platform: 'platforms',
  TourEvent: 'tour_events',
  NewsItem: 'news_items',
  TurnEventLog: 'turn_event_log',
  PlayerTurnHistory: 'player_turn_history',
  Venue: 'venues',
  Tour: 'tours',
  Gig: 'gigs',
  TravelLog: 'travel_logs',
  SocialAccount: 'social_accounts',
  SocialPost: 'social_posts',
  BrandDeal: 'brand_deals',
  XpressFollow: 'xpress_follows',
  XpressLike: 'xpress_likes',
  XpressRepost: 'xpress_reposts',
  MediaPlatform: 'media_platforms',
  XpressMention: 'xpress_mentions',
  XpressConversation: 'xpress_conversations',
  XpressMessage: 'xpress_messages',
  XpressNotification: 'xpress_notifications',
  XpressCampaign: 'xpress_campaigns',
  FanWar: 'fan_wars',
  Chart: 'charts',
  Certification: 'certifications',
  CareerTrendEvent: 'career_trend_events',
  ProgressionStageThresholds: 'progression_stage_thresholds',
  CareerStage: 'career_stages',
  CareerEvent: 'career_events',
  ArtistProgressionCap: 'artist_progression_caps',
  Fandom: 'fandoms',
  FandomSegment: 'fandom_segments',
  ControversyCase: 'controversy_cases',
  FanWarTurn: 'fan_war_turns',
  FandomMetricsSnapshot: 'fandom_metrics_snapshots',
  TourCategory: 'tour_categories',
  TourCrewMember: 'tour_crew_members',
  TourSponsorship: 'tour_sponsorships',
  TourChoiceEvent: 'tour_choice_events',
  TourOpeningAct: 'tour_opening_acts',
  SampleAchievement: 'sample_achievements',
  SampleRoyaltyPayment: 'sample_royalty_payments',
  RemixContest: 'remix_contests',
  RemixContestEntry: 'remix_contest_entries',
  RemixOpenCall: 'remix_open_calls',
};

const REVERSE_TABLE_FIELD_MAPPINGS = {
  projects: {
    project_status: 'status',        // Fixed: frontend -> backend
    project_type: 'type',           // Fixed: frontend -> backend
  },
  releases: {
    // No transformation needed - database already uses cover_artwork_url
  },
  // merch: no mapping needed — DB uses `name` directly, project_name column is unused
  '*': {
    created_date: 'created_at',
    updated_date: 'updated_at'
  }
};

const TABLE_FIELD_MAPPINGS = {
  projects: {
    status: 'project_status',        // Fixed: backend -> frontend
    type: 'project_type',           // Fixed: backend -> frontend
  },
  releases: {
    // No transformation needed - database already uses cover_artwork_url
  },
  // merch: no mapping needed — DB uses `name` directly, project_name column is unused
  '*': {
    created_at: 'created_date',
    updated_at: 'updated_date'
  }
};

function getMergedMappings(tableName, mappingSet) {
  return {
    ...(mappingSet['*'] || {}),
    ...(mappingSet[tableName] || {})
  };
}

export function isMissingTableError(error) {
  return error?.code === 'PGRST205';
}

// Helper function to convert field names for frontend
function convertFieldNames(data, tableName) {
  if (!data || typeof data !== 'object') return data;
  
  const mappings = getMergedMappings(tableName, TABLE_FIELD_MAPPINGS);
  const converted = {};
  
  for (const [key, value] of Object.entries(data)) {
    const mappedKey = mappings[key] || key;
    converted[mappedKey] = value;
  }
  
  return converted;
}

// Helper function to convert field names for backend
function convertFieldNamesForBackend(data, tableName) {
  if (!data || typeof data !== 'object') return data;
  
  const mappings = getMergedMappings(tableName, REVERSE_TABLE_FIELD_MAPPINGS);
  const converted = {};
  
  for (const [key, value] of Object.entries(data)) {
    const mappedKey = mappings[key] || key;
    converted[mappedKey] = value;
  }
  
  return converted;
}

// Entity adapter for browser - uses anon client only
function makeEntityClient(supabase, tableName) {
  return {
    client: supabase,
    async list(sort, limit) {
      let query = this.client.from(tableName).select('*');
      if (sort) {
        const desc = String(sort).startsWith('-');
        const rawField = desc ? String(sort).slice(1) : String(sort);
        const reverseMappings = getMergedMappings(tableName, REVERSE_TABLE_FIELD_MAPPINGS);
        const field = reverseMappings[rawField] || rawField;
        query = query.order(field, { ascending: !desc });
      }
      if (Number.isInteger(limit)) query = query.limit(limit);
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data || []).map(item => convertFieldNames(item, tableName));
    },

    async filter(filter = {}, sort, limit) {
      if (hasInvalidFilterParams(filter)) {
        logQueryIssue(`${tableName}.filter.invalid-params`, { filter });
        return [];
      }

      let query = this.client.from(tableName).select('*');
      
      for (const [key, value] of Object.entries(filter)) {
        if (value === undefined) continue;
        if (value === null) {
          console.warn(`[SDK] Null filter value for key "${key}" on table "${tableName}" — skipping to prevent full table scan`);
          continue;
        }
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (value && typeof value === 'object') {
          const operators = value;
          if (operators.$gt) query = query.gt(key, operators.$gt);
          if (operators.$gte) query = query.gte(key, operators.$gte);
          if (operators.$lt) query = query.lt(key, operators.$lt);
          if (operators.$lte) query = query.lte(key, operators.$lte);
          if (operators.$neq) query = query.neq(key, operators.$neq);
        } else {
          query = query.eq(key, value);
        }
      }
      
      if (sort) {
        const desc = String(sort).startsWith('-');
        const rawField = desc ? String(sort).slice(1) : String(sort);
        const reverseMappings = getMergedMappings(tableName, REVERSE_TABLE_FIELD_MAPPINGS);
        const field = reverseMappings[rawField] || rawField;
        query = query.order(field, { ascending: !desc });
      }
      if (Number.isInteger(limit)) query = query.limit(limit);
      
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data || []).map(item => convertFieldNames(item, tableName));
    },

    async create(payload) {
      const convertedPayload = convertFieldNamesForBackend(payload, tableName);
      const { data, error } = await this.client.from(tableName).insert(convertedPayload).select();
      if (error) throw error;
      return convertFieldNames(data[0], tableName);
    },

    async update(id, payload) {
      validateEntityId(id, 'update', tableName);
      const convertedPayload = convertFieldNamesForBackend(payload, tableName);
      const { data, error } = await this.client.from(tableName).update(convertedPayload).eq('id', id).select();
      if (error) throw error;
      return convertFieldNames(data[0], tableName);
    },

    async delete(id) {
      validateEntityId(id, 'delete', tableName);
      const { error } = await this.client.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async get(id) {
      validateEntityId(id, 'get', tableName);
      const { data, error } = await this.client.from(tableName).select('*').eq('id', id).single();
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return convertFieldNames(data, tableName);
    },

    async find(id) {
      validateEntityId(id, 'find', tableName);
      const { data, error } = await this.client.from(tableName).select('*').eq('id', id);
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return data.length > 0 ? convertFieldNames(data[0], tableName) : null;
    }
  };
}

function buildEntityAdapter(client) {
  const adapter = {
    profiles: makeEntityClient(client, 'profiles'),
    ArtistProfile: makeEntityClient(client, 'profiles'), // Backward compatibility
    fan_profiles: makeEntityClient(client, 'fan_profiles'),
    releases: makeEntityClient(client, 'releases'),
    merch: makeEntityClient(client, 'merch'),
    notifications: makeEntityClient(client, 'notifications'),
    turn_state: makeEntityClient(client, 'turn_state'),
    eras: makeEntityClient(client, 'eras'),
    career_milestones: makeEntityClient(client, 'career_milestones'),
    players: makeEntityClient(client, 'players'),
    access_codes: makeEntityClient(client, 'access_codes'),
    songs: makeEntityClient(client, 'songs'),
    projects: makeEntityClient(client, 'projects'),
    studios: makeEntityClient(client, 'studios'),
    platforms: makeEntityClient(client, 'platforms'),
    tour_events: makeEntityClient(client, 'tour_events'),
    news_items: makeEntityClient(client, 'news_items'),
    turn_event_log: makeEntityClient(client, 'turn_event_log'),
    player_turn_history: makeEntityClient(client, 'player_turn_history'),
    venues: makeEntityClient(client, 'venues'),
    tours: makeEntityClient(client, 'tours'),
    gigs: makeEntityClient(client, 'gigs'),
    travel_logs: makeEntityClient(client, 'travel_logs'),
    social_accounts: makeEntityClient(client, 'social_accounts'),
    social_posts: makeEntityClient(client, 'social_posts'),
    brand_deals: makeEntityClient(client, 'brand_deals'),
    xpress_follows: makeEntityClient(client, 'xpress_follows'),
    xpress_likes: makeEntityClient(client, 'xpress_likes'),
    xpress_reposts: makeEntityClient(client, 'xpress_reposts'),
    media_platforms: makeEntityClient(client, 'media_platforms'),
    xpress_mentions: makeEntityClient(client, 'xpress_mentions'),
    xpress_conversations: makeEntityClient(client, 'xpress_conversations'),
    xpress_messages: makeEntityClient(client, 'xpress_messages'),
    xpress_notifications: makeEntityClient(client, 'xpress_notifications'),
    xpress_campaigns: makeEntityClient(client, 'xpress_campaigns'),
    fan_wars: makeEntityClient(client, 'fan_wars'),
    charts: makeEntityClient(client, 'charts'),
    certifications: makeEntityClient(client, 'certifications')
  };

  Object.entries(BASE44_ENTITY_TABLE_MAP).forEach(([entityName, tableName]) => {
    if (!adapter[entityName]) {
      adapter[entityName] = makeEntityClient(client, tableName);
    }
  });

  return adapter;
}

// Browser-safe entity adapter
const entityAdapter = buildEntityAdapter(supabaseClient);

// Browser-safe custom client
const customClient = {
  _inFlightInvocations: new Map<string, Promise<unknown>>(),

  // Entity CRUD
  entity: entityAdapter,
  entities: entityAdapter, // Backward compatibility for base44.entities
  
  // Direct Supabase client (anon only)
  supabase: supabaseClient,
  
  // Entity table map
  entityTableMap: BASE44_ENTITY_TABLE_MAP,
  
  // Field mapping helpers
  convertFieldNames,
  convertFieldNamesForBackend,
  
  // Configuration
  isConfigured: isSupabaseConfigured,
  
  // Safe query helpers
  hasInvalidFilterParams,
  logQueryIssue,
  runSafeFetch,
  runSupabaseQuery,
  
  // Function invocation (browser-safe)
  async invoke(functionName, payload) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured');
    }
    
    const isReadAction = typeof payload === 'object' && payload !== null &&
      typeof (payload as { action?: unknown }).action === 'string' &&
      /^(get|list|fetch)/i.test((payload as { action: string }).action);

    const shouldDedupe = isReadAction;
    const invocationKey = shouldDedupe
      ? `${functionName}:${JSON.stringify(payload ?? {})}`
      : null;

    if (invocationKey && customClient._inFlightInvocations.has(invocationKey)) {
      return customClient._inFlightInvocations.get(invocationKey);
    }

    const execute = async () => {
    // Retry logic for network failures
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabaseClient.functions.invoke(functionName, {
          body: payload
        });

        if (error) {
          const status = error?.context?.status;

          // error.context IS the raw Response object (FunctionsHttpError passes the Response directly).
          // response.body is a ReadableStream — JSON.stringify(ReadableStream) = "{}" which is useless.
          // Read the response body properly via json()/text() before building the error message.
          let body: any = null;
          try {
            if (error?.context && typeof error.context.json === 'function') {
              body = await error.context.json();
            }
          } catch {
            try {
              if (error?.context && typeof error.context.text === 'function') {
                const txt = await error.context.text();
                body = txt ? { message: txt } : null;
              }
            } catch { /* ignore */ }
          }

          const bodyMsg =
            body?.error ||
            body?.message ||
            body?.details ||
            (typeof body === 'string' ? body : null);
          const msg = bodyMsg || error.message || 'Edge Function request failed';

          const safeBodyForMessage =
            body === null || body === undefined
              ? null
              : typeof body === 'string'
                ? body
                : JSON.stringify(body);
          
          // Add context for network failures
          if (error.message?.includes('Failed to send a request to the Edge Function')) {
            const ctxStatus = error?.context?.status;
            const ctxBody = error?.context?.body;
            const ctxBodyStr = typeof ctxBody === 'string' ? ctxBody : (ctxBody ? JSON.stringify(ctxBody) : null);
            console.error(
              `[Edge Function] Network error (attempt ${attempt}/${maxRetries}) ${functionName}: ${error?.message || 'Unknown network error'}${ctxStatus ? ` (status ${ctxStatus})` : ''}${ctxBodyStr ? ` body=${ctxBodyStr}` : ''}`,
              error
            );
            
            // If this is not the last attempt, wait and retry
            if (attempt < maxRetries) {
              const baseDelay = Math.pow(2, attempt) * 500;
              const delay = baseDelay + Math.floor(Math.random() * 250);
              console.log(`[Edge Function] Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              lastError = error;
              continue;
            }
          }
          
          const thrown = new Error(
            status
              ? `Edge Function ${functionName} failed (${status}): ${msg}${safeBodyForMessage ? ` | body=${safeBodyForMessage}` : ''}`
              : `Edge Function ${functionName} failed: ${msg}${safeBodyForMessage ? ` | body=${safeBodyForMessage}` : ''}`
          ) as any;
          thrown.context = error?.context;
          throw thrown;
        }
        
        return data;
      } catch (error) {
        // If it's not a network error, throw immediately
        if (!error.message?.includes('Failed to send a request to the Edge Function')) {
          throw error;
        }
        
        // Network error - retry logic
        if (attempt === maxRetries) {
          console.error(`[Edge Function] Max retries reached for ${functionName}: ${error?.message || error}`);
          throw error;
        }
        
        const baseDelay = Math.pow(2, attempt) * 500;
        const delay = baseDelay + Math.floor(Math.random() * 250);
        console.log(`[Edge Function] Network error, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = error;
      }
    }
    
    // Should never reach here
    throw lastError;
    };

    const invocationPromise = execute();

    if (!invocationKey) {
      return invocationPromise;
    }

    customClient._inFlightInvocations.set(invocationKey, invocationPromise);
    try {
      return await invocationPromise;
    } finally {
      customClient._inFlightInvocations.delete(invocationKey);
    }
  },

};

// Shim: base44.functions.invoke(...) → base44.invoke(...)
(customClient as any).functions = {
  invoke: (functionName: string, payload?: unknown) => customClient.invoke(functionName, payload)
};

// Shim: base44.integrations.Core.UploadFile({ file, bucket? }) → Supabase Storage upload
(customClient as any).integrations = {
  Core: {
    async UploadFile({ file, bucket = 'uploads' }: { file: File; bucket?: string }) {
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabaseClient.storage.from(bucket).upload(path, file, {
        cacheControl: '604800',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
      return { file_url: data.publicUrl };
    }
  }
};

export { customClient, supabaseAdminClient, BASE44_ENTITY_TABLE_MAP };

export function createCustomClient(client = supabaseClient) {
  const adapter = buildEntityAdapter(client);

  return {
    ...customClient,
    entity: adapter,
    entities: adapter
  };
}

export default customClient;
