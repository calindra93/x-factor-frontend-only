// Combo reality check — generates an "industry read" paragraph
// based on genre + region + city + persona + strategy combo.
// Used in onboarding Step 7 (Spotlight Check).

import { PERSONA_DISPLAY_LABELS } from "@/data/brandIdentityHelpers";

// ─── City-specific flavor fragments ──────────────────────────────────────────

const CITY_FLAVOR = {
  "New York":        { boost: "pressure and prestige", risk: "the competition is brutal and attention spans are short" },
  "Los Angeles":     { boost: "industry access and visibility", risk: "polish can feel hollow without substance" },
  "Atlanta":         { boost: "immediate scene credibility and hitmaking culture", risk: "expectations for heat and consistency are sky-high" },
  "Chicago":         { boost: "raw underground authenticity", risk: "breaking out nationally takes extra effort from here" },
  "Miami":           { boost: "Latin crossover and nightlife energy", risk: "the scene is seasonal and hype-dependent" },
  "Houston":         { boost: "fiercely independent cred", risk: "the market rewards patience more than speed" },
  "Nashville":       { boost: "deep roots in artist-driven storytelling", risk: "stepping outside country norms gets scrutinized" },
  "Toronto":         { boost: "moody crossover appeal and tastemaker respect", risk: "the world is watching for the next Drake, which is a blessing and a curse" },
  "Montreal":        { boost: "underground cool and experimental freedom", risk: "mainstream breakthrough requires leaving the bubble" },
  "Vancouver":       { boost: "Pacific creative crossover", risk: "the local scene is small — you'll need to export early" },
  "London":          { boost: "global tastemaker credibility and scene depth", risk: "the gatekeepers are real and the press is ruthless" },
  "Manchester":      { boost: "indie heritage and fierce local pride", risk: "the shadow of past legends hangs heavy" },
  "Glasgow":         { boost: "DIY grit and post-punk pedigree", risk: "the scene is tight-knit — outsiders take longer to win trust" },
  "Birmingham":      { boost: "grime and jungle roots with something to prove", risk: "national media often overloooks the Midlands" },
  "Berlin":          { boost: "underground freedom and experimental credibility", risk: "commercial ambition gets side-eyed here" },
  "Paris":           { boost: "fashion-forward cultural weight", risk: "the scene is insular — French-language pressure is real" },
  "Amsterdam":       { boost: "festival circuit access and open-minded audiences", risk: "the local market is small without European touring" },
  "Barcelona":       { boost: "Mediterranean vibes and Latin-electronic crossover", risk: "international breakthrough requires English or collab strategy" },
  "Stockholm":       { boost: "pop songwriting pedigree and global export history", risk: "the pressure to be polished and commercial is baked in" },
  "Tokyo":           { boost: "precision standards and deeply loyal fanbases", risk: "the market is conservative — controversy tolerance is near zero" },
  "Seoul":           { boost: "K-Pop infrastructure and global fandom intensity", risk: "the standards are impossibly high and scandals end careers overnight" },
  "Mumbai":          { boost: "massive population reach and hip-hop momentum", risk: "Bollywood still dominates and indie visibility is a fight" },
  "Bangkok":         { boost: "nightlife energy and Southeast Asian growth", risk: "the scene is still emerging — infrastructure is thin" },
  "Shanghai":        { boost: "massive market potential and cultural gateway status", risk: "content restrictions and regulatory risk are real" },
  "Lagos":           { boost: "Afrobeats global momentum and rhythmic authority", risk: "the competition for attention is fierce and infrastructure is scrappy" },
  "Johannesburg":    { boost: "amapiano's birthplace energy and cultural weight", risk: "the market is passionate but monetization lags global standards" },
  "Nairobi":         { boost: "East Africa's creative hub energy", risk: "the scene is young — you're building the playbook, not following one" },
  "Accra":           { boost: "highlife heritage meets modern Afrobeats boom", risk: "global visibility still depends heavily on diaspora networks" },
  "Sao Paulo":       { boost: "massive passionate audiences and funk-forward culture", risk: "language barrier limits global crossover without strategy" },
  "Mexico City":     { boost: "cultural powerhouse reach across Latin America", risk: "reggaeton dominance makes other lanes harder to carve out" },
  "Buenos Aires":    { boost: "bohemian credibility and electronic underground respect", risk: "the economy is volatile — monetization is tricky" },
  "Bogota":          { boost: "reggaeton surge and Latin pop access", risk: "the market is crowded and trends shift fast" },
  "Sydney":          { boost: "festival culture and strong pop infrastructure", risk: "geographic isolation means touring costs hit harder" },
  "Melbourne":       { boost: "indie-forward audiences and small-venue culture", risk: "breaking mainstream requires leaving the indie bubble" },
  "Auckland":        { boost: "Polynesian-Western fusion and underdog appeal", risk: "the market is tiny — export strategy is non-negotiable" },

  // US additions
  "New Orleans":     { boost: "jazz heritage and a uniquely soulful creative energy", risk: "the scene is insular and tradition-bound — genre experimentation gets side-eyed" },
  "Seattle":         { boost: "grunge legacy and alternative credibility", risk: "the gig economy makes retention harder and the scene rewards homegrown over importing" },
  "Washington D.C.": { boost: "go-go roots and political capital energy that gives artists cultural depth", risk: "the audience is transient — building lasting local loyalty takes longer here" },
  "Philadelphia":    { boost: "classic soul roots and an underdog hunger that audiences respond to", risk: "the city has been overlooked for decades — breaking nationally takes extra hustle" },
  "Boston":          { boost: "college-town audience density and touring circuit momentum", risk: "the scene skews legacy and academic — breaking new sounds takes patience" },
  "Memphis":         { boost: "blues and soul DNA that runs through everything you touch", risk: "local infrastructure is thin — resources and industry presence lag the cultural output" },

  // Canada additions
  "Calgary":         { boost: "country-crossover access and a western independent spirit", risk: "the market is conservative — new sound adoption is slower than major markets" },
  "Edmonton":        { boost: "DIY festival culture and an underdog resilience that builds loyal fans", risk: "the pool is small — anything niche needs export strategy from day one" },
  "Ottawa":          { boost: "folk and indie infrastructure with surprising arts funding depth", risk: "the political atmosphere can make cutting-edge culture feel out of place" },
  "Halifax":         { boost: "East Coast grit and a proud indie-folk identity", risk: "the market is tiny — touring and exporting is non-negotiable from the start" },
  "Winnipeg":        { boost: "prairie rawness and a fiercely loyal local listener base", risk: "geographic isolation makes scaling nationally and internationally harder" },

  // UK additions
  "Liverpool":       { boost: "Merseybeat heritage and a deeply proud local music identity", risk: "the city's legendary past sets extremely high expectations for new acts" },
  "Bristol":         { boost: "trip-hop legacy and underground electronic credibility", risk: "the scene is tight-knit — outsiders have to earn trust through consistent presence" },
  "Leeds":           { boost: "indie and alternative scene depth beyond most UK cities", risk: "Northern England media invisibility makes press breakthrough harder to achieve" },
  "Belfast":         { boost: "post-conflict creative energy and a passionate underdog spirit", risk: "the market is tiny and often overlooked — national attention requires leaving" },

  // Europe additions
  "Copenhagen":      { boost: "Scandinavian pop infrastructure and festival circuit access", risk: "the market is small — Nordic success alone doesn't translate globally" },
  "Madrid":          { boost: "Latin pop gateway status and rich Mediterranean cultural energy", risk: "the Spanish-language barrier creates real friction for non-Iberian crossover" },
  "Milan":           { boost: "fashion-forward brand identity and design-culture crossover potential", risk: "Italy's pop infrastructure is conservative — indie visibility is a fight" },
  "Lisbon":          { boost: "a buzzing fado-electronic crossover scene with rising global attention", risk: "the market is small and heavily dependent on European touring to sustain" },
  "Vienna":          { boost: "classical-meets-electronic experimental credibility", risk: "commercial ambition is harder to sustain here — the scene leans art over commerce" },
  "Brussels":        { boost: "European festival circuit access and multicultural crossover energy", risk: "the city lacks a defining sound — it's a connector, not a trendsetter" },
  "Ibiza":           { boost: "global DJ culture access and explosive summer revenue potential", risk: "the hype is seasonal — sustaining year-round momentum is a structural challenge" },

  // Asia additions
  "Osaka":           { boost: "rougher, cooler alternative energy to Tokyo with distinct underground credentials", risk: "Tokyo controls Japanese industry access — Osaka distances you from gatekeepers" },
  "Busan":           { boost: "South Korea's second city indie energy and a growing scene of its own", risk: "Seoul dominates K-Pop infrastructure — distance from the machine is a real barrier" },
  "Manila":          { boost: "explosive fan passion and some of the most dedicated streaming audiences globally", risk: "monetization lags behind fan intensity — the economics are structurally tough" },
  "Jakarta":         { boost: "Southeast Asia's fastest-growing youth music scene with massive population reach", risk: "infrastructure is fragmented — the market is enormous but hard to navigate" },
  "Chennai":         { boost: "Tollywood and classical Tamil music authority in a massive regional market", risk: "film industry music dominance makes independent artist visibility a grind" },
  "Singapore":       { boost: "pan-Asian gateway access and a wealthy, cosmopolitan audience", risk: "the market is tiny — it's a launchpad city, not a home base" },
  "Hong Kong":       { boost: "Cantopop infrastructure and a historic gateway to Chinese-speaking markets", risk: "political volatility has created cultural uncertainty and ongoing talent exodus" },
  "Taipei":          { boost: "Mandopop craft standards and a sophisticated, eclectic music culture", risk: "the island's small size makes export-first thinking mandatory from the start" },

  // Latin America additions
  "Guadalajara":     { boost: "deep mariachi roots and the epicenter of modern corridos tumbados momentum", risk: "crossover beyond Regional Mexican takes real infrastructure and strategic investment" },
  "San Juan":        { boost: "reggaeton's birthplace energy and maximum Latin urban credibility", risk: "the island's size and economic fragility create real infrastructure constraints" },
  "Medellin":        { boost: "scrappy Colombian passion and a fast-growing urban music hub energy", risk: "the market is crowded and trends move fast — staying relevant requires constant heat" },
  "Rio de Janeiro":  { boost: "Carioca baile funk energy and carnival-scale fan passion", risk: "economic inequality creates uneven monetization and the scene's infrastructure varies sharply" },
  "Havana":          { boost: "unmatched musical heritage with legendary jazz and son cubano credibility", risk: "limited commercial infrastructure and international access due to political isolation" },
  "Santo Domingo":   { boost: "bachata and merengue authority that shapes Latin music globally", risk: "the island's small market means international reach depends entirely on diaspora networks" },
  "Santiago":        { boost: "politically conscious rock and hip-hop credibility in Latin America's most aware music culture", risk: "mid-sized market — regional LatAm strategy is needed to achieve real scale" },
  "Lima":            { boost: "vibrant chicha underground and cumbia crossover with massive regional audience", risk: "infrastructure is fragmented and the music economy is still developing its pathways" },

  // Africa additions
  "Abuja":           { boost: "Nigeria's capital prestige and a polished Afrobeats production aesthetic", risk: "Lagos dominates the Nigerian music economy — proximity to power isn't the same as scene depth" },
  "Cape Town":       { boost: "cosmopolitan diversity and Cape jazz–amapiano crossover appeal", risk: "the city's expense and tourist culture can distance artists from where the real heat originates" },
  "Durban":          { boost: "gqom's birthplace energy and relentless percussive innovation credentials", risk: "commercial infrastructure hasn't caught up to the cultural output — support systems are thin" },
  "Cairo":           { boost: "Arab world entertainment capital reach and Egyptian pop's massive regional pull", risk: "content restrictions and conservative expectations limit genre risk-taking significantly" },
  "Casablanca":      { boost: "a unique African-Arab-European crossover bridge with a growing urban scene", risk: "the market is still emerging — Moroccan hip-hop hasn't fully broken internationally" },
  "Kinshasa":        { boost: "soukous and ndombolo heritage with enormous rhythmic authority and cultural depth", risk: "economic instability and infrastructure gaps create real practical barriers to scale" },

  // Oceania additions
  "Brisbane":        { boost: "Queensland's sunny outdoor festival culture and a zero-pretension scene", risk: "Sydney and Melbourne dominate Australian industry — Brisbane is still building its pipeline" },
  "Adelaide":        { boost: "DIY arts festival culture and a disproportionately influential indie scene", risk: "the market is small and isolated — breakthrough requires active export strategy" },
  "Perth":           { boost: "the focused creative intensity that geographic isolation forces into artists", risk: "the furthest major city from Australian industry hubs — everything costs more to reach" },
  "Wellington":      { boost: "New Zealand's creative capital arts infrastructure and an intimate, supportive scene", risk: "even domestic success doesn't translate to Australasian scale without sustained touring" },
};

// ─── Genre strength descriptors ──────────────────────────────────────────────

const GENRE_STRENGTH = {
  "Pop":             "algorithm-friendly and brand-safe",
  "Rap":             "culture-driving with high beef potential",
  "Hip-Hop":         "versatile with deep cultural roots",
  "R&B":             "built for loyal, emotionally invested fans",
  "Trap":            "hype-forward with mainstream pull",
  "Melodic Rap":     "algorithm-optimized with collab upside",
  "EDM":             "festival-ready and novelty-driven",
  "Trance":          "niche but deeply devoted audiences",
  "Techno":          "underground-credible with innovation potential",
  "Afrobeats":       "globally ascendant with massive collab energy",
  "Amapiano":        "scene-loyal with passionate community",
  "Reggaeton":       "streaming-dominant with Latin crossover heat",
  "Latin Pop":       "mainstream accessible with broad appeal",
  "K-Pop":           "fandom-intense with global infrastructure",
  "J-Pop":           "niche-loyal with high engagement ceilings",
  "UK Drill":        "scene-credible with maximum tension energy",
  "Drill":           "raw, confrontational, and beef-heavy",
  "Indie":           "ride-or-die fans with anti-mainstream cred",
  "Alternative":     "art-forward with anti-mainstream positioning",
  "Alternative Rap": "experimental with dedicated cult following",
  "Dancehall":       "clash-culture ready with collab bridges",
  "Reggae":          "devoted peaceful fanbase with deep roots",
  "Country":         "loyal base with traditional momentum",
  "Folk":            "devoted audience in a zero-drama lane",
  "Salsa":           "culturally rooted with intense loyalty",
  "Rock":            "marathon fans in a low-drama lane",
};

// ─── Persona strength descriptors ────────────────────────────────────────────

const PERSONA_STRENGTH = {
  street_authentic:      "credibility and raw fan connection",
  luxury_hustler:        "brand deal magnetism and aspirational energy",
  conscious_voice:       "cultural impact and deep listener loyalty",
  party_club_catalyst:   "virality and nightlife energy",
  nostalgic_boom_bap:    "purist respect and heritage credibility",
  femme_power:           "visibility, empowerment branding, and fashion access",
  viral_trendsetter:     "algorithm mastery and trend creation",
  aesthetic_curator:      "visual identity and art-world crossover",
  relatable_storyteller: "emotional fan attachment and word-of-mouth growth",
  internet_troll:        "chaotic attention and meme virality",
  producer_visionary:    "industry respect and behind-the-scenes leverage",
  motivational_hustler:  "brand sponsorship fit and inspirational positioning",
};

// ─── Strategy flavor ─────────────────────────────────────────────────────────

const STRATEGY_FLAVOR = {
  HIT_CHASE:            "built for quick commercial impact and singles-driven momentum",
  ALBUM_AUTEUR:         "designed for era-defining artistic cohesion",
  SCENE_DOMINANCE:      "rooted in local market control and regional clout",
  TOUR_MONSTER:         "optimized for live revenue and stage presence",
  DIGITAL_CULT:         "engineered for viral growth and online obsession",
  BRAND_MOGUL:          "structured around merch, deals, and empire building",
  CROSSOVER_KING:       "positioned for genre-blending and audience expansion",
  UNDERGROUND_LEGEND:   "built on hardcore authenticity and cult loyalty",
  GLOBAL_EXPANSION:     "targeted at international markets and worldwide reach",
  MEDIA_DARLING:        "calibrated for press coverage and spotlight visibility",
};

// ─── Main generator ──────────────────────────────────────────────────────────

export function generateIndustryRead({ genre, region, city, persona, strategy }) {
  const cityData = CITY_FLAVOR[city];
  const genreStr = GENRE_STRENGTH[genre] || "genre-forward";
  const personaStr = PERSONA_STRENGTH[persona] || "distinctive";
  const strategyStr = STRATEGY_FLAVOR[strategy] || "ambitious";
  const personaLabel = PERSONA_DISPLAY_LABELS[persona] || persona;

  if (!cityData) {
    return `This ${genre} artist with a ${personaLabel} brand is ${strategyStr}. The combo leans into ${genreStr} with ${personaStr} as the core edge. Watch for overextension early — build a base before chasing scale.`;
  }

  const sentences = [];

  // Opener — what the combo is strongest at
  sentences.push(
    `This package is ${genreStr}, coming out of ${city} with ${cityData.boost}.`
  );

  // Persona + strategy synergy
  sentences.push(
    `The ${personaLabel} brand adds ${personaStr}, and the strategy is ${strategyStr}.`
  );

  // Risk / watch-out — always city-grounded
  sentences.push(
    `The watch-out: ${cityData.risk}.`
  );

  // Closing insight
  const closers = [
    "Land the first few releases clean and this package builds fast.",
    "Consistency is the multiplier here — don't let the hype outpace the output.",
    "The audience this attracts will be intense. Deliver, and they'll never leave.",
    "This combo rewards boldness but punishes gaps. Keep the momentum tight.",
    "First impressions carry extra weight with this setup. Make them count.",
  ];
  // Deterministic pick based on inputs
  const hash = (genre + city + persona + strategy).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  sentences.push(closers[hash % closers.length]);

  return sentences.join(" ");
}

export function generatePublicistRead({ artistName, genre, region, city, persona, strategy, fanbaseName, pillars }) {
  const personaLabel = PERSONA_DISPLAY_LABELS[persona] || persona;
  const strategyLabel = strategy?.replace(/_/g, " ").toLowerCase() || "ambitious";
  const pillarStr = pillars?.length > 0 ? pillars.join(", ") : null;
  const fanStr = fanbaseName ? ` with a fanbase called "${fanbaseName}"` : "";
  const pillarSuffix = pillarStr ? ` built around ${pillarStr}` : "";

  return `${artistName || "This artist"} is a ${genre} artist coming out of ${city || region}, with a ${personaLabel} brand and a ${strategyLabel} strategy${fanStr}${pillarSuffix}.`;
}
