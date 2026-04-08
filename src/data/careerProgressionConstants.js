/**
 * Career Progression Constants - Frontend Shared
 * Moved from backend to prevent import path issues
 */

// Player-triggered legendary moments (keyed to career_stages DB table names)
export const PLAYER_TRIGGERED_MOMENTS = {
  'Unknown': [
    {
      type: 'viral_moment',
      name: 'Viral Breakthrough',
      description: 'Your track unexpectedly goes viral on social media',
      requirements: { hype: 60, followers: 500 },
      rewards: { followers: 2000, hype: 15, income: 5000 },
      cost: 500
    },
    {
      type: 'local_hero',
      name: 'Local Hero',
      description: 'Become the talk of your local scene',
      requirements: { clout: 100, region_plays: 1000 },
      rewards: { clout: 200, hype: 10, income: 3000 },
      cost: 300
    },
    {
      type: 'fan_art',
      name: 'Fan Art Movement',
      description: 'Fans start creating art inspired by your music',
      requirements: { hype: 50, followers: 750 },
      rewards: { hype: 25, followers: 500 },
      cost: 200
    }
  ],
  'Local Artist': [
    {
      type: 'first_1k',
      name: 'First 1K Fans',
      description: 'Reach your first major fan milestone',
      requirements: { followers: 1000 },
      rewards: { hype: 20, income: 2000 },
      cost: 500
    },
    {
      type: 'studio_deal',
      name: 'Studio Deal',
      description: 'Get offered free studio time',
      requirements: { inspiration: 70, tracks_released: 3 },
      rewards: { inspiration: 30, energy: 50 },
      cost: 800
    }
  ],
  'Local Buzz': [
    {
      type: 'regional_radio',
      name: 'Regional Radio Play',
      description: 'Your song gets picked up by regional radio',
      requirements: { clout: 300, streams: 50000 },
      rewards: { clout: 400, followers: 3000, income: 8000 },
      cost: 2000
    },
    {
      type: 'opening_slot',
      name: 'Opening Slot',
      description: 'Get offered to open for a touring artist',
      requirements: { hype: 65, followers: 2500 },
      rewards: { clout: 350, income: 10000, hype: 15 },
      cost: 3000
    },
    {
      type: 'blog_feature',
      name: 'Blog Feature',
      description: 'Featured in major music blog',
      requirements: { hype: 70, inspiration: 60 },
      rewards: { hype: 20, followers: 1500 },
      cost: 1500
    },
    {
      type: 'first_10k',
      name: 'First 10K Fans',
      description: 'Reach another major fan milestone',
      requirements: { followers: 10000 },
      rewards: { hype: 30, income: 15000 },
      cost: 2500
    },
    {
      type: 'brand_interest',
      name: 'Brand Interest',
      description: 'Local brands want to work with you',
      requirements: { clout: 400, followers: 5000 },
      rewards: { income: 12000, hype: 10 },
      cost: 2000
    }
  ],
  'Underground Artist': [
    {
      type: 'festival_spot',
      name: 'Festival Spot',
      description: 'Booked for indie music festival',
      requirements: { clout: 800, followers: 15000 },
      rewards: { clout: 1000, income: 25000, hype: 25 },
      cost: 8000
    },
    {
      type: 'playlist_placement',
      name: 'Playlist Placement',
      description: 'Featured on major editorial playlist',
      requirements: { streams: 200000, hype: 75 },
      rewards: { streams: 50000, followers: 8000, income: 20000 },
      cost: 6000
    },
    {
      type: 'press_coverage',
      name: 'Press Coverage',
      description: 'Featured in music publications',
      requirements: { clout: 1000, inspiration: 80 },
      rewards: { clout: 1200, hype: 30 },
      cost: 5000
    },
    {
      type: 'first_50k',
      name: 'First 50K Fans',
      description: 'Breaking into the big leagues',
      requirements: { followers: 50000 },
      rewards: { hype: 40, income: 30000 },
      cost: 7000
    },
    {
      type: 'sync_deal',
      name: 'Sync Deal',
      description: 'Your song licensed for TV/film',
      requirements: { inspiration: 85, tracks_released: 10 },
      rewards: { income: 35000, hype: 35 },
      cost: 10000
    }
  ],
  'Cult Favorite': [
    {
      type: 'chart_debut',
      name: 'Chart Debut',
      description: 'Enter the charts for the first time',
      requirements: { streams: 500000, followers: 75000 },
      rewards: { clout: 2500, followers: 15000, income: 50000 },
      cost: 20000
    },
    {
      type: 'award_nomination',
      name: 'Award Nomination',
      description: 'Nominated for emerging artist award',
      requirements: { clout: 2000, hype: 80 },
      rewards: { clout: 3000, hype: 40 },
      cost: 15000
    },
    {
      type: 'tour_offer',
      name: 'Tour Offer',
      description: 'Offered your first headlining tour',
      requirements: { followers: 100000, income: 100000 },
      rewards: { income: 150000, clout: 3500 },
      cost: 25000
    },
    {
      type: 'first_100k',
      name: 'First 100K Fans',
      description: 'Six-figure fanbase',
      requirements: { followers: 100000 },
      rewards: { hype: 50, income: 75000 },
      cost: 18000
    },
    {
      type: 'major_interest',
      name: 'Major Label Interest',
      description: 'Major labels start reaching out',
      requirements: { clout: 3000, inspiration: 90 },
      rewards: { income: 100000, hype: 45 },
      cost: 30000
    }
  ]
};

/**
 * Check if player can trigger a legendary moment
 */
export function canTriggerMoment(momentType, profile, stage) {
  const moments = PLAYER_TRIGGERED_MOMENTS[stage] || [];
  const moment = moments.find(m => m.type === momentType);

  if (!moment) return { can: false, reason: 'Moment not available in current stage' };

  // Check requirements
  for (const [key, value] of Object.entries(moment.requirements)) {
    if ((profile[key] || 0) < value) {
      return { can: false, reason: `Need ${key}: ${value}` };
    }
  }

  return { can: true, rewards: moment.rewards };
}
