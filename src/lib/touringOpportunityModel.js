const LANE_TAGS = {
  commercial_heat: 'COMMERCIAL HEAT',
  cultural_influence: 'CULTURAL INFLUENCE',
  live_draw: 'LIVE DRAW',
  industry_respect: 'INDUSTRY RESPECT',
  core_fan_devotion: 'CORE FAN DEVOTION',
};

const LANE_SPOTLIGHT_COPY = {
  commercial_heat: {
    title: 'Breakout lane opening in {region}',
    subtitle: '{region} is a stronger commercial market than your home base right now.',
  },
  cultural_influence: {
    title: 'Tastemaker lane forming in {region}',
    subtitle: '{region} gives your tastemaker lane more upside than staying home.',
  },
  live_draw: {
    title: 'Crowd surge building in {region}',
    subtitle: '{region} has the strongest live-room signal on the map.',
  },
  industry_respect: {
    title: 'Prestige play opening in {region}',
    subtitle: '{region} is a better prestige play than another run through your home market.',
  },
  core_fan_devotion: {
    title: 'Loyalty pocket growing in {region}',
    subtitle: '{region} has a stronger loyalty pocket than your home base.',
  },
  default: {
    title: 'New touring opportunity in {region}',
    subtitle: '{region} is worth exploring beyond your home market.',
  },
};

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function rankRegions(demand = {}) {
  return Object.entries(demand)
    .map(([region, score]) => ({ region, score: normalizeScore(score) }))
    .sort((a, b) => b.score - a.score || a.region.localeCompare(b.region));
}

function getBestNonHomeRegion(rankedRegions, homeRegion) {
  return rankedRegions.find((entry) => entry.region && entry.region !== homeRegion) || rankedRegions[0] || null;
}

function formatLaneTag(laneKey) {
  return LANE_TAGS[laneKey] || 'TOURING OPPORTUNITY';
}

function buildSpotlight(region, laneKey) {
  const copy = LANE_SPOTLIGHT_COPY[laneKey] || LANE_SPOTLIGHT_COPY.default;
  return {
    title: copy.title.replace('{region}', region),
    subtitle: copy.subtitle.replaceAll('{region}', region),
    tags: [formatLaneTag(laneKey), 'BREAKOUT'],
    cta: 'planning',
    targetRegion: region,
    reasonType: laneKey || 'demand_shift',
  };
}

function buildActions({ homeRegion, currentRegion, targetRegion, activeTour, laneKey, narrowFootprint }) {
  const actions = [];
  const laneTag = formatLaneTag(laneKey);

  if (!activeTour) {
    actions.push({
      label: `Plan a push into ${targetRegion}`,
      subtitle: `${laneTag} fits that market better than staying home.`,
      icon: '🗓',
      urgency: 'high',
      cta: 'planning',
      targetRegion,
      reasonType: laneKey || 'planning',
    });
  }

  actions.push({
    label: `Explore beyond ${homeRegion || 'home base'}`,
    subtitle: `${targetRegion} is the strongest market outside your home region.`,
    icon: '🔍',
    urgency: 'medium',
    cta: 'planning',
    targetRegion,
    reasonType: 'breakout_market',
  });

  if (narrowFootprint) {
    actions.push({
      label: 'Scout a new travel market',
      subtitle: `${targetRegion} is a clean next expansion move.`,
      icon: '📍',
      urgency: 'low',
      cta: 'travel',
      targetRegion,
      reasonType: 'footprint_expand',
    });
  } else {
    actions.push({
      label: `Scout the route into ${targetRegion}`,
      subtitle: `${currentRegion || 'Your current base'} can pivot there through Travel.`,
      icon: '📍',
      urgency: 'low',
      cta: 'travel',
      targetRegion,
      reasonType: 'travel_scout',
    });
  }

  return actions.slice(0, 3);
}

export function buildTouringOpportunityModel({
  profile = null,
  demand = {},
  footprint = {},
  activeTour = null,
  careerSnapshot = null,
} = {}) {
  const homeRegion = profile?.home_region || profile?.region || null;
  const currentRegion = profile?.region || null;
  const rankedRegions = rankRegions(demand);
  const bestNonHome = getBestNonHomeRegion(rankedRegions, homeRegion);
  const targetRegion = bestNonHome?.region || currentRegion || homeRegion || 'new territory';
  const laneKey = careerSnapshot?.dominant_lane || careerSnapshot?.secondary_lane || null;
  const narrowFootprint = Number(footprint?.regionsPlayed || 0) <= 1;

  return {
    spotlight: buildSpotlight(targetRegion, laneKey),
    actions: buildActions({
      homeRegion,
      currentRegion,
      targetRegion,
      activeTour,
      laneKey,
      narrowFootprint,
    }),
  };
}
