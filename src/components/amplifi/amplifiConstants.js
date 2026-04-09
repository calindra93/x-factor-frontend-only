export const STATUS_LABEL = {
  SCHEDULED: 'Coming Soon',
  OPEN: 'Accepting Apps',
  CLOSED: 'Apps Closed',
  LOCKED: 'Lineup Set',
  LIVE: 'Live Now',
  COMPLETE: 'Ended',
};

export const STATUS_COLOR = {
  SCHEDULED: '#6b7280',
  OPEN: '#10b981',
  CLOSED: '#f59e0b',
  LOCKED: '#6366f1',
  LIVE: '#ef4444',
  COMPLETE: '#4b5563',
};

export const SUBMISSION_STATUS_LABEL = {
  SUBMITTED: 'Applied',
  ELIGIBLE: 'In Review',
  INELIGIBLE: 'Ineligible',
  SELECTED: 'Selected!',
  REJECTED: 'Not Selected',
  WITHDRAWN: 'Withdrawn',
};

export const REGION_FLAG = {
  US: '\u{1F1FA}\u{1F1F8}', Canada: '\u{1F1E8}\u{1F1E6}',
  UK: '\u{1F1EC}\u{1F1E7}', Europe: '\u{1F1EA}\u{1F1FA}',
  Africa: '\u{1F30D}', Oceania: '\u{1F30F}',
};

export const LANE_ORDER = ['HEADLINER', 'MAIN_PRIME', 'MAIN_EARLY', 'SECOND_PRIME', 'DISCOVERY', 'SPOTLIGHT'];

export const LANE_LABEL = {
  HEADLINER: 'Headliner', MAIN_PRIME: 'Main Stage', MAIN_EARLY: 'Main Early',
  SECOND_PRIME: 'Second Stage', DISCOVERY: 'Discovery', SPOTLIGHT: 'Spotlight',
};

export const LANE_SET_MIN = {
  HEADLINER: 90, MAIN_PRIME: 60, MAIN_EARLY: 45,
  SECOND_PRIME: 45, DISCOVERY: 30, SPOTLIGHT: 30,
};

export const STAGE_ORDER = [
  'Unknown', 'Local Artist', 'Local Buzz', 'Underground Artist',
  'Cult Favorite', 'Breakout Artist', 'Mainstream Artist',
  'A-List Star', 'Global Superstar', 'Legacy Icon',
];

export const REGION_GRADIENT = {
  US: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)',
  Canada: 'linear-gradient(135deg, #450a0a 0%, #991b1b 45%, #b91c1c 100%)',
  UK: 'linear-gradient(135deg, #0c1a2e 0%, #1e3a5f 45%, #1d4ed8 100%)',
  Europe: 'linear-gradient(135deg, #1a0933 0%, #2d1b69 45%, #4c1d95 100%)',
  Africa: 'linear-gradient(135deg, #451a03 0%, #92400e 45%, #b45309 100%)',
  Oceania: 'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #047857 100%)',
};

export const FESTIVAL_IMAGE_OVERRIDES = {
  'Coachella Valley': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/coachella-valley.png',
  'Lollapalooza': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/lollapalooza.png',
  'Burning Man': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/burning-man.png',
  'TIFF AfterDark Live': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/tiff-afterdark-live.png',
  'Glastonbury': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/glastonbury.png',
  'Tomorrowland': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/tomorrowland.png',
  'Laneway': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/laneway.png',
  'Splendour in the Grass': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/splendour-in-the-grass.png',
  'Primavera Sound': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/primavera-sound.png',
  'Rolling Loud': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/rolling-loud.png',
  'Boomtown': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/boomtown.png',
  'Amapiano All Night': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/amapiano-all-night.png',
  'Afro Nation': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/afro-nation.png',
  'SXSW Sounds': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/sxsw-sounds.png',
  'Osheaga': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/osheaga.png',
  'Sziget': 'https://ekogzlajllyjabyxqsss.supabase.co/storage/v1/object/public/uploads/amplifi/festivals/sziget.png',
};

export function stageIdx(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 ? i : 0;
}

export function normalizeGenreWeight(raw) {
  const v = Number(raw ?? 0);
  return v > 1 ? v / 100 : v;
}

export function festivalGenreFitLabel(raw) {
  const v = normalizeGenreWeight(raw);
  if (v >= 0.8) return { label: 'Perfect Fit', color: '#f0abfc' };
  if (v >= 0.5) return { label: 'Good Fit', color: '#d8b4fe' };
  if (v >= 0.2) return { label: 'Fair Fit', color: '#f9a8d4' };
  return { label: 'Poor Fit', color: '#c084fc' };
}

export function summarizeBookingPhilosophy(booking = {}) {
  const prestige = Number(booking?.prestige_weight || 0);
  const discovery = Number(booking?.discovery_bias || 0);
  const spectacle = Number(booking?.spectacle_weight || 0);
  if (prestige >= 0.65) return 'Rewards established names and prestige moments.';
  if (discovery >= 0.65) return 'Favors breakout energy and discovery-ready artists.';
  if (spectacle >= 0.65) return 'Big on visuals, theatricality, and crowd spectacle.';
  return 'Balanced booking with room for style, fit, and performance strategy.';
}

export function getFestivalImageUrl(festival, fallback = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop') {
  return FESTIVAL_IMAGE_OVERRIDES[festival?.name] || festival?.cover_image_url || fallback;
}

export function oddsLabel(profile, laneKey, festivalLanes, festivalGenreWeights) {
  if (!laneKey || !festivalLanes) return { label: 'SELECT LANE', color: '#6b7280' };
  const cfg = festivalLanes[laneKey];
  if (!cfg) return { label: 'N/A', color: '#6b7280' };

  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
  const clout = Number(profile?.clout ?? 0);
  const stage = profile?.career_stage || 'Unknown';
  const genre = profile?.genre || '';

  const idx = stageIdx(stage);
  if (idx < (cfg.min_stage_idx || 0)) return { label: 'INELIGIBLE', color: '#ef4444' };
  if (fans < (cfg.min_fans || 0)) return { label: 'INELIGIBLE', color: '#ef4444' };
  if (clout < (cfg.min_clout || 0)) return { label: 'INELIGIBLE', color: '#ef4444' };
  if (cfg.genre_tags?.length && !cfg.genre_tags.includes(genre)) {
    return { label: 'INELIGIBLE', color: '#ef4444' };
  }

  const genreWRaw = (festivalGenreWeights?.[genre] ?? 0);
  const genreW = normalizeGenreWeight(genreWRaw);
  const stageExtra = idx - (cfg.min_stage_idx || 0);
  const cloutScore = Math.log10(Math.max(1, clout)) / 5;
  const approxWeight = (1 + stageExtra * 0.3) * cloutScore * genreW * 0.75;

  if (approxWeight >= 1.2) return { label: 'HIGH', color: '#10b981' };
  if (approxWeight >= 0.4) return { label: 'MEDIUM', color: '#6366f1' };
  if (approxWeight >= 0.08) return { label: 'LOW', color: '#f59e0b' };
  return { label: 'VERY LOW', color: '#ef4444' };
}
