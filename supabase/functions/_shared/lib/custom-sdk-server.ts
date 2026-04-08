/**
 * SERVER-ONLY SDK - Backend safe version
 * This file contains admin/service-role client code and should only be used in server environments
 * NEVER import this file in frontend code
 */

// BROWSER PROTECTION: Prevent accidental browser imports
if (typeof window !== "undefined") {
  throw new Error("Server-only module imported in browser: custom-sdk-server.ts");
}

import { createClient } from '@supabase/supabase-js';
import { throwIfProductionInTest, throwIfHostedSupabase } from './productionGuard.js';
import { supabaseAdmin } from './supabaseAdmin.js';

const getEnvVar = (key: string, fallback = ''): string => {
  // Check for Deno environment (Supabase Edge Functions)
  if (typeof globalThis !== 'undefined' && (globalThis as any).Deno?.env) {
    return (globalThis as any).Deno.env.get(key) || fallback;
  }
  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
};

const supabaseUrl = getEnvVar('SUPABASE_URL', '');
const supabaseServiceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY', '');

// Production guard: prevent tests from hitting production
throwIfProductionInTest(supabaseUrl, 'Custom SDK admin client');

// Local dev guard: prevent accidental production access
throwIfHostedSupabase(supabaseUrl, 'Custom SDK admin client');

// SERVER-ONLY: Admin client with service role key
const supabaseAdminClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

const BASE44_ENTITY_TABLE_MAP: Record<string, string> = {
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
  TourCategory: 'tour_categories',
  TourCrewMember: 'tour_crew_members',
  TourSponsorship: 'tour_sponsorships',
  TourChoiceEvent: 'tour_choice_events',
  TourOpeningAct: 'tour_opening_acts',
};

interface FilterOperators {
  $gt?: any;
  $gte?: any;
  $lt?: any;
  $lte?: any;
  $neq?: any;
}

type FilterValue = any | FilterOperators;

interface Filter {
  [key: string]: FilterValue;
}

function applySort(query: any, sort?: string) {
  if (!sort) return query;
  const desc = String(sort).startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort);
  return query.order(field, { ascending: !desc });
}

function applyFilter(query: any, filter: Filter = {}) {
  let next = query;
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      next = next.in(key, value);
      continue;
    }

    if (value && typeof value === 'object') {
      const operators = value as FilterOperators;
      if (operators.$gt) next = next.gt(key, operators.$gt);
      if (operators.$gte) next = next.gte(key, operators.$gte);
      if (operators.$lt) next = next.lt(key, operators.$lt);
      if (operators.$lte) next = next.lte(key, operators.$lte);
      if (operators.$neq) next = next.neq(key, operators.$neq);
      continue;
    }

    next = next.eq(key, value);
  }
  return next;
}

function makeEntityClient(supabase: any, tableName: string) {
  return {
    async list(sort?: string, limit?: number) {
      let query = supabase.from(tableName).select('*');
      query = applySort(query, sort);
      if (Number.isInteger(limit)) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async filter(filter: Filter = {}, sort?: string, limit?: number) {
      let query = supabase.from(tableName).select('*');
      query = applyFilter(query, filter);
      query = applySort(query, sort);
      if (Number.isInteger(limit)) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(payload: any) {
      const { data, error } = await supabase.from(tableName).insert(payload).select();
      if (error) throw error;
      return data[0];
    },

    async update(id: string, payload: any) {
      const { data, error } = await supabase.from(tableName).update(payload).eq('id', id).select();
      if (error) throw error;
      return data[0];
    },

    async delete(id: string) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async get(id: string) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async find(id: string) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id);
      if (error) throw error;
      return data.length > 0 ? data[0] : null;
    }
  };
}

// Server-only entity adapter with admin client
const entityAdapter = {
  profiles: makeEntityClient(supabaseAdminClient, 'profiles'),
  fan_profiles: makeEntityClient(supabaseAdminClient, 'fan_profiles'),
  releases: makeEntityClient(supabaseAdminClient, 'releases'),
  merch: makeEntityClient(supabaseAdminClient, 'merch'),
  notifications: makeEntityClient(supabaseAdminClient, 'notifications'),
  turn_state: makeEntityClient(supabaseAdminClient, 'turn_state'),
  eras: makeEntityClient(supabaseAdminClient, 'eras'),
  career_milestones: makeEntityClient(supabaseAdminClient, 'career_milestones'),
  players: makeEntityClient(supabaseAdminClient, 'players'),
  access_codes: makeEntityClient(supabaseAdminClient, 'access_codes'),
  songs: makeEntityClient(supabaseAdminClient, 'songs'),
  projects: makeEntityClient(supabaseAdminClient, 'projects'),
  studios: makeEntityClient(supabaseAdminClient, 'studios'),
  platforms: makeEntityClient(supabaseAdminClient, 'platforms'),
  tour_events: makeEntityClient(supabaseAdminClient, 'tour_events'),
  news_items: makeEntityClient(supabaseAdminClient, 'news_items'),
  turn_event_log: makeEntityClient(supabaseAdminClient, 'turn_event_log'),
  player_turn_history: makeEntityClient(supabaseAdminClient, 'player_turn_history'),
  venues: makeEntityClient(supabaseAdminClient, 'venues'),
  tours: makeEntityClient(supabaseAdminClient, 'tours'),
  gigs: makeEntityClient(supabaseAdminClient, 'gigs'),
  travel_logs: makeEntityClient(supabaseAdminClient, 'travel_logs'),
  social_accounts: makeEntityClient(supabaseAdminClient, 'social_accounts'),
  social_posts: makeEntityClient(supabaseAdminClient, 'social_posts'),
  brand_deals: makeEntityClient(supabaseAdminClient, 'brand_deals'),
  xpress_follows: makeEntityClient(supabaseAdminClient, 'xpress_follows'),
  xpress_likes: makeEntityClient(supabaseAdminClient, 'xpress_likes'),
  xpress_reposts: makeEntityClient(supabaseAdminClient, 'xpress_reposts'),
  media_platforms: makeEntityClient(supabaseAdminClient, 'media_platforms'),
  xpress_mentions: makeEntityClient(supabaseAdminClient, 'xpress_mentions'),
  xpress_conversations: makeEntityClient(supabaseAdminClient, 'xpress_conversations'),
  xpress_messages: makeEntityClient(supabaseAdminClient, 'xpress_messages'),
  xpress_notifications: makeEntityClient(supabaseAdminClient, 'xpress_notifications'),
  xpress_campaigns: makeEntityClient(supabaseAdminClient, 'xpress_campaigns'),
  fan_wars: makeEntityClient(supabaseAdminClient, 'fan_wars'),
  charts: makeEntityClient(supabaseAdminClient, 'charts'),
  certifications: makeEntityClient(supabaseAdminClient, 'certifications')
};

// Server-only custom client
const customClient = {
  // Entity CRUD
  entity: entityAdapter,
  
  // Direct Supabase admin client
  supabase: supabaseAdminClient,
  
  // Entity table map
  entityTableMap: BASE44_ENTITY_TABLE_MAP,
  
  // Configuration
  isConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey)
};

export { customClient, supabaseAdminClient, BASE44_ENTITY_TABLE_MAP };
export default customClient;
