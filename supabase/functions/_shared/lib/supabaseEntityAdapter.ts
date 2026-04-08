const ENTITY_TABLE_MAP = {
  ArtistProfile: 'profiles',
  FanProfile: 'fan_profiles',
  Release: 'releases',
  Merch: 'merch',
  Notification: 'notifications',
  TurnState: 'turn_state',
  PlayerTurnHistory: 'player_turn_history',
  TurnEventLog: 'turn_event_log',
  Era: 'eras',
  CareerMilestone: 'career_milestones',
  CareerEvent: 'career_events',
  AccessCode: 'access_codes',
  UserAccount: 'players',
  Song: 'songs',
  Project: 'projects',
  NewsItem: 'news_items',
  Tour: 'tours',
  Gig: 'gigs',
  Studio: 'studios',
  Platform: 'platforms',
  TourEvent: 'tour_events',
  SocialPost: 'social_posts',
  SocialAccount: 'social_accounts',
  BrandDeal: 'brand_deals',
  Brand: 'brands',
  BrandCategory: 'brand_categories',
  PlayerBrandStats: 'player_brand_stats',
  Venue: 'venues',
  TravelLog: 'travel_logs',
  FanWar: 'fan_wars',
  XpressFollow: 'xpress_follows',
  XpressLike: 'xpress_likes',
  XpressRepost: 'xpress_reposts',
  XpressMention: 'xpress_mentions',
  XpressConversation: 'xpress_conversations',
  XpressMessage: 'xpress_messages',
  XpressNotification: 'xpress_notifications',
  XpressCampaign: 'xpress_campaigns',
  Chart: 'charts',
  Certification: 'certifications',
  MediaPlatform: 'media_platforms',
  CareerTrendEvent: 'career_trend_events',
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
      if (error) throw new Error(`${tableName}.list: ${error.message || JSON.stringify(error)}`);
      return data || [];
    },

    async filter(filter: Filter = {}, sort?: string, limit?: number) {
      let query = supabase.from(tableName).select('*');
      query = applyFilter(query, filter);
      query = applySort(query, sort);
      if (Number.isInteger(limit)) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw new Error(`${tableName}.filter: ${error.message || JSON.stringify(error)}`);
      return data || [];
    },

    async create(payload: any) {
      const { data, error } = await supabase.from(tableName).insert(payload).select('*').single();
      if (error) throw new Error(`${tableName}.create: ${error.message || JSON.stringify(error)}`);
      return data;
    },

    async get(id: any) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) throw new Error(`${tableName}.get(${id}): ${error.message || JSON.stringify(error)}`);
      return data;
    },

    async update(id: any, patch: any) {
      const { data, error } = await supabase.from(tableName).update(patch).eq('id', id).select('*').single();
      if (error) throw new Error(`${tableName}.update(${id}): ${error.message || JSON.stringify(error)}`);
      return data;
    },

    async delete(id: any) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw new Error(`${tableName}.delete(${id}): ${error.message || JSON.stringify(error)}`);
    }
  };
}

export function createSupabaseEntitiesAdapter(supabase: any) {
  const entities: any = {};
  for (const [entityName, tableName] of Object.entries(ENTITY_TABLE_MAP)) {
    entities[entityName] = makeEntityClient(supabase, tableName);
  }
  entities.supabaseClient = supabase;
  return entities;
}
