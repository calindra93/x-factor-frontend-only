// ─── Brand Identity helpers (shared between BrandPortfolioApp and Social) ────
// Extracted from Social.jsx to enable reuse across pages.

export const STAGE_ORDER_SOCIAL = {
  'Unknown': 0, 'Local Artist': 1, 'Local Buzz': 2, 'Underground Artist': 3,
  'Cult Favorite': 4, 'Breakout Artist': 5, 'Mainstream Artist': 6,
  'A-List Star': 7, 'Global Superstar': 8, 'Legacy Icon': 9,
};

export const PERSONA_DISPLAY_LABELS = {
  street_authentic: "Street Authentic",
  luxury_hustler: "Luxury Hustler",
  conscious_voice: "Conscious Voice",
  party_club_catalyst: "Party / Club Catalyst",
  nostalgic_boom_bap: "Nostalgic Boom Bap",
  femme_power: "Femme Power",
  viral_trendsetter: "Viral Trendsetter",
  aesthetic_curator: "Aesthetic Curator",
  relatable_storyteller: "Relatable Storyteller",
  internet_troll: "Internet Troll",
  producer_visionary: "Producer Visionary",
  motivational_hustler: "Motivational Hustler",
};

export const PERSONA_BRAND_MAP = {
  street_authentic:      { strong: ['Streetwear', 'Sneakers', 'Sports'], emerging: ['Auto', 'Gaming'], weak: ['Finance', 'Beauty'] },
  luxury_hustler:        { strong: ['Auto', 'Fashion', 'Finance'], emerging: ['Spirits', 'Tech'], weak: ['Fast Food', 'Budget'] },
  conscious_voice:       { strong: ['Non-Profit', 'Education', 'Wellness'], emerging: ['Organic Food', 'Tech'], weak: ['Alcohol', 'Fast Fashion'] },
  party_club_catalyst:   { strong: ['Beverage', 'Nightlife', 'Energy Drinks'], emerging: ['Streaming', 'Fashion'], weak: ['Finance', 'Education'] },
  nostalgic_boom_bap:    { strong: ['Vinyl', 'Streetwear', 'Heritage Brands'], emerging: ['Sneakers', 'Media'], weak: ['Tech', 'Energy Drinks'] },
  femme_power:           { strong: ['Beauty', 'Fashion', 'Wellness'], emerging: ['Tech', 'Finance'], weak: ['Auto', 'Beer'] },
  viral_trendsetter:     { strong: ['Social Platforms', 'Gaming', 'Streaming'], emerging: ['Fashion', 'Energy Drinks'], weak: ['Heritage Brands', 'Finance'] },
  aesthetic_curator:     { strong: ['Art', 'Fashion', 'Photography'], emerging: ['Tech', 'Fragrance'], weak: ['Fast Food', 'Sports'] },
  relatable_storyteller: { strong: ['Food', 'Family Brands', 'Wellness'], emerging: ['Streaming', 'Education'], weak: ['Luxury', 'Nightlife'] },
  internet_troll:        { strong: ['Gaming', 'Energy Drinks', 'Meme Culture'], emerging: ['Streaming', 'Streetwear'], weak: ['Luxury', 'Finance'] },
  producer_visionary:    { strong: ['Audio Tech', 'Software', 'Synths'], emerging: ['Streaming', 'Fashion'], weak: ['Food', 'Sports'] },
  motivational_hustler:  { strong: ['Fitness', 'Sports', 'Finance'], emerging: ['Tech', 'Education'], weak: ['Nightlife', 'Beer'] },
};

// ─── Lane Display Labels ─────────────────────────────────────────────────────
const LANE_DISPLAY = {
  commercial_heat:    { label: 'Commercial Heat',    short: 'Hit Lane',       color: '#fb923c' },
  cultural_influence: { label: 'Cultural Influence', short: 'Taste Lane',     color: '#a78bfa' },
  live_draw:          { label: 'Live Draw',          short: 'Stage Lane',     color: '#34d399' },
  industry_respect:   { label: 'Industry Respect',   short: 'Prestige Lane',  color: '#fbbf24' },
  core_fan_devotion:  { label: 'Core Fan Devotion',  short: 'Loyalty Lane',   color: '#f472b6' },
};

// Maps career lane → brand positioning flavor
const LANE_BRAND_FIT = {
  commercial_heat:    'Mainstream / Mass Appeal',
  cultural_influence: 'Tastemaker / Premium',
  live_draw:          'Event-Driven / Experiential',
  industry_respect:   'Prestige / Legacy Brands',
  core_fan_devotion:  'Community / DTC Brands',
};

// ─── Market Positioning (grounded in career snapshot, era, fanbase, follower count) ────────
export function computeMarketPositioning(profile, primaryPersona, opts = {}) {
  const { careerSnapshot, fanProfile, currentEra } = opts;
  const stageIdx = STAGE_ORDER_SOCIAL[profile?.career_stage] ?? 0;
  const followers = Number(profile?.followers) || 0;

  // Blend career stage with follower count — large audiences bump the lane up
  const followerBoost = followers >= 10_000_000 ? 3
    : followers >= 5_000_000 ? 2
    : followers >= 1_000_000 ? 1
    : 0;
  const effectiveStage = Math.min(stageIdx + followerBoost, 9);

  // ── Industry Lane: derived from career snapshot dominant_lane when available ──
  const dominantLane = careerSnapshot?.dominant_lane || null;
  const secondaryLane = careerSnapshot?.secondary_lane || null;
  const archetype = careerSnapshot?.current_archetype || null;

  let industryLane;
  if (dominantLane && LANE_DISPLAY[dominantLane]) {
    // Use the real career lane as the primary signal
    if (effectiveStage >= 7) industryLane = `A-List · ${LANE_DISPLAY[dominantLane].short}`;
    else if (effectiveStage >= 5) industryLane = `Rising · ${LANE_DISPLAY[dominantLane].short}`;
    else industryLane = LANE_DISPLAY[dominantLane].short;
  } else {
    industryLane = effectiveStage >= 7 ? 'A-List / Mainstream'
      : effectiveStage >= 5 ? 'Rising Mainstream'
      : effectiveStage >= 3 ? 'Underground / Niche'
      : 'Independent / Local';
  }

  // ── Tour Demand ──
  const tourDemand = effectiveStage >= 8 ? 'Arena / Stadium'
    : effectiveStage >= 6 ? 'Theater / Large Venue'
    : effectiveStage >= 4 ? 'Club / Mid-Venue'
    : effectiveStage >= 2 ? 'Local Venues'
    : 'Open Mic / Small Stage';

  // ── Brand Fit: career lane → brand category alignment, fallback to persona ──
  let brandFit;
  if (dominantLane && LANE_BRAND_FIT[dominantLane]) {
    brandFit = LANE_BRAND_FIT[dominantLane];
  } else {
    brandFit = primaryPersona === 'luxury_hustler' ? 'Premium / Luxury'
      : primaryPersona === 'street_authentic' ? 'Streetwear / Culture'
      : primaryPersona === 'viral_trendsetter' ? 'Digital-First / Hype'
      : primaryPersona === 'conscious_voice' ? 'Purpose-Driven'
      : primaryPersona === 'party_club_catalyst' ? 'Nightlife / Lifestyle'
      : primaryPersona === 'aesthetic_curator' ? 'Visual / Art-Forward'
      : primaryPersona === 'femme_power' ? 'Fashion / Beauty'
      : followers > 100000 ? 'Mass Market' : 'Emerging';
  }

  // ── Collab Pull: grounded in stage + fanbase sentiment ──
  const sentiment = fanProfile?.overall_sentiment;
  const sentimentBoost = sentiment === 'very_positive' ? 1 : sentiment === 'positive' ? 0.5 : 0;
  const collabScore = effectiveStage + sentimentBoost;
  const collabPull = collabScore >= 7 ? 'High demand'
    : collabScore >= 5 ? 'Growing demand'
    : collabScore >= 3 ? 'Niche appeal'
    : 'Building network';

  // ── Enriched metadata for display ──
  const laneInfo = dominantLane && LANE_DISPLAY[dominantLane] ? {
    primary: LANE_DISPLAY[dominantLane],
    secondary: secondaryLane && LANE_DISPLAY[secondaryLane] ? LANE_DISPLAY[secondaryLane] : null,
    archetype: archetype || null,
  } : null;

  const eraLabel = currentEra?.name || currentEra?.title || null;

  return {
    industry_lane: industryLane,
    tour_demand: tourDemand,
    brand_fit: brandFit,
    collab_pull: collabPull,
    lane_info: laneInfo,
    era_label: eraLabel,
    effective_stage: effectiveStage,
  };
}

// ─── Brand Compatibility ────────────────────────────────────────────────────
export function computeBrandCompatibility(primaryPersona, secondaryPersona, _profile) {
  const base = PERSONA_BRAND_MAP[primaryPersona] || { strong: [], emerging: [], weak: [] };
  const sec = PERSONA_BRAND_MAP[secondaryPersona] || { strong: [], emerging: [], weak: [] };
  const strong = [...new Set([...base.strong, ...sec.strong.filter(b => base.strong.includes(b) || base.emerging.includes(b))])].slice(0, 4);
  const emerging = [...new Set([...base.emerging, ...sec.emerging])].filter(b => !strong.includes(b)).slice(0, 3);
  const weak = [...new Set([...base.weak, ...sec.weak])].filter(b => !strong.includes(b) && !emerging.includes(b)).slice(0, 3);
  return { strong, emerging, weak };
}

// ─── Cultural DNA human-readable label helpers ──────────────────────────────
export function culturalGravityLabel(v) {
  if (v >= 1.3) return "Dominant cultural pull";
  if (v >= 1.1) return "Strong cultural pull";
  if (v >= 0.95) return "Moderate cultural pull";
  return "Limited cultural gravity";
}

export function discoveryLabel(v) {
  if (v >= 1.2) return "Highly shareable";
  if (v >= 1.05) return "Strong discovery";
  if (v >= 0.9) return "Average shareability";
  return "Limited discovery";
}

export function longevityLabel(halfLife, dampening) {
  const score = (halfLife + dampening) / 2;
  if (score >= 1.2) return "Strong staying power";
  if (score >= 1.05) return "Above average staying power";
  if (score >= 0.9) return "Average longevity";
  return "Short-cycle content";
}

export function stabilityLabel(dampening) {
  if (dampening >= 1.2) return "High";
  if (dampening >= 1.0) return "Steady";
  if (dampening >= 0.85) return "Moderate";
  return "Volatile";
}

export function depthLabel(audienceDepth, depthTier) {
  const tierStr = depthTier && depthTier !== "Tier 1" ? depthTier : `Tier ${Math.max(1, Math.min(4, Math.floor((Number(audienceDepth) || 0) / 25) + 1))}`;
  const d = Number(audienceDepth) || 0;
  const desc = d >= 70 ? "Loyal core" : d >= 40 ? "Engaged base" : d >= 20 ? "Growing base" : "Early stage";
  return `${tierStr} — ${desc}`;
}

export function trajectoryLabel(effects) {
  const ups = Object.values(effects).filter((v) => v === "Up").length;
  const downs = Object.values(effects).filter((v) => v === "Down").length;
  if (ups >= 3) return "Culture Heating Up";
  if (ups >= 2) return "Positive Trajectory";
  if (downs >= 3) return "Cooling Off";
  if (downs >= 2) return "Under Pressure";
  return "Stable Momentum";
}

export function riskLabel(effects) {
  const downs = Object.values(effects).filter((v) => v === "Down").length;
  if (downs >= 3) return "High";
  if (downs >= 1) return "Moderate";
  return "Low";
}

export function impactLabel(v) {
  if (v === "Up") return "positive";
  if (v === "Down") return "pressure";
  return "balanced";
}

// ─── Persona ID normalization ───────────────────────────────────────────────
export function normalizePersonaId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  return PERSONA_DISPLAY_LABELS[key] ? key : raw;
}
