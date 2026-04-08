/**
 * Platform-specific ranking algorithm.
 * Simulates 200+ artists per platform with unique weighting factors.
 * Each platform values different aspects of an artist's career.
 */

const SIMULATED_ARTIST_NAMES = [
  "Aria Nova","Blaze Carter","Cleo Vance","Dex Monroe","Echo Reign","Faye Luxe","Gio Flame",
  "Halo Storm","Ivy Creed","Jax Onyx","Kira Bliss","Lux Vega","Milo Shade","Nyx Ember",
  "Opal Drift","Pax Zenith","Quinn Frost","Raze Volt","Suki Pearl","Taz Rogue","Uma Glow",
  "Vex Haze","Wren Solace","Xyla Moon","Yuri Blaze","Zara Flux","Ace Prism","Bex Coral",
  "Cade Noir","Diva Spark","Eli Crest","Fern Wilde","Gale Rush","Haven Cruz","Isla Riot",
  "Jade Pulse","Kai Ember","Luna Vex","Mars Echo","Nola Drift","Orion Blaze","Piper Lux",
  "Quinn Ash","Remi Glow","Sage Volt","Tori Flame","Ursa Nyx","Vale Storm","Wynn Frost",
  "Xena Haze","Yara Creed","Zion Shade","Aero Bliss","Bryn Onyx","Cass Vega","Drew Pearl",
  "Ezra Rogue","Flo Zenith","Gray Solace","Hope Moon","Ira Flux","Joss Prism","Knox Coral",
  "Lexi Noir","Mika Spark","Nash Crest","Odin Wilde","Pax Rush","Rae Cruz","Sol Riot",
  "Tate Pulse","Uma Ash","Voss Glow","Wren Volt","Xavi Flame","Yuki Nyx","Zeke Storm",
  "Alva Frost","Beck Haze","Cleo Creed","Dane Shade","Eris Bliss","Finn Onyx","Gaia Vega",
  "Hart Pearl","Ines Rogue","Jude Zenith","Koda Solace","Lark Moon","Mace Flux","Neve Prism",
  "Opal Coral","Penn Noir","Quinn Spark","Rory Crest","Shay Wilde","Tess Rush","Ulric Cruz",
  "Vera Riot","Wade Pulse","Xyla Ash","York Glow","Zara Volt","Alix Flame","Bram Nyx",
  "Cora Storm","Dion Frost","Elan Haze","Faye Creed","Gwen Shade","Hugo Bliss","Iris Onyx",
  "Jett Vega","Kali Pearl","Leo Rogue","Mira Zenith","Noel Solace","Odin Moon","Pia Flux",
  "Reed Prism","Sage Coral","Thea Noir","Uri Spark","Vex Crest","Wynn Wilde","Xena Rush",
  "Yves Cruz","Zola Riot","Arlo Pulse","Bria Ash","Cruz Glow","Dara Volt","Enzo Flame",
  "Fern Nyx","Gael Storm","Hana Frost","Ivan Haze","Jaya Creed","Kian Shade","Lena Bliss",
  "Milo Onyx","Nina Vega","Omar Pearl","Pia Rogue","Ravi Zenith","Suki Solace","Taro Moon",
  "Uma Flux","Veda Prism","Wren Coral","Xavi Noir","Yara Spark","Zion Crest","Aero Wilde",
  "Bryn Rush","Cass Cruz","Drew Riot","Ezra Pulse","Flo Ash","Gray Glow","Hope Volt",
  "Ira Flame","Joss Nyx","Knox Storm","Lexi Frost","Mika Haze","Nash Creed","Odin Shade"
];

function generateSimulatedArtists(count = 200) {
  const artists = [];
  for (let i = 0; i < count; i++) {
    const name = SIMULATED_ARTIST_NAMES[i % SIMULATED_ARTIST_NAMES.length];
    const tier = Math.random();
    let followers, streams, clout, hype;

    if (tier > 0.98) {
      followers = 500000 + Math.floor(Math.random() * 50000000);
      streams = 10000000 + Math.floor(Math.random() * 500000000);
      clout = 800 + Math.floor(Math.random() * 200);
      hype = 70 + Math.floor(Math.random() * 30);
    } else if (tier > 0.9) {
      followers = 50000 + Math.floor(Math.random() * 450000);
      streams = 1000000 + Math.floor(Math.random() * 9000000);
      clout = 300 + Math.floor(Math.random() * 500);
      hype = 50 + Math.floor(Math.random() * 30);
    } else if (tier > 0.7) {
      followers = 5000 + Math.floor(Math.random() * 45000);
      streams = 100000 + Math.floor(Math.random() * 900000);
      clout = 80 + Math.floor(Math.random() * 220);
      hype = 30 + Math.floor(Math.random() * 30);
    } else {
      followers = 100 + Math.floor(Math.random() * 4900);
      streams = 1000 + Math.floor(Math.random() * 99000);
      clout = 5 + Math.floor(Math.random() * 75);
      hype = 10 + Math.floor(Math.random() * 30);
    }

    artists.push({
      id: `sim-${i}`,
      artist_name: `${name}${i > SIMULATED_ARTIST_NAMES.length ? ` ${Math.floor(i / SIMULATED_ARTIST_NAMES.length)}` : ""}`,
      followers,
      totalStreams: streams,
      clout,
      hype,
      monthly_listeners: Math.floor(streams / 12), // Simulate monthly listeners as 1/12 of total streams
      genre: ["Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Country", "Latin", "Indie"][Math.floor(Math.random() * 8)],
      region: ["United States", "Canada", "Europe", "Asia", "Latin America", "Africa", "UK", "Oceania"][Math.floor(Math.random() * 8)],
      _simulated: true,
    });
  }
  return artists;
}

/**
 * Platform-specific scoring functions.
 * Each platform weighs different factors uniquely.
 */
const PLATFORM_SCORERS = {
  soundburst: (artist) => {
    // Underground: values authenticity, grassroots growth, hype over raw numbers
    const hypeWeight = (artist.hype || 0) * 50;
    const cloutWeight = (artist.clout || 0) * 20;
    const followerWeight = Math.log10(Math.max(1, artist.followers || 0)) * 100;
    const streamWeight = Math.log10(Math.max(1, artist.totalStreams || 0)) * 30;
    // Penalize mega-mainstream artists
    const mainstreamPenalty = (artist.followers || 0) > 1000000 ? -200 : 0;
    return hypeWeight + cloutWeight + followerWeight + streamWeight + mainstreamPenalty;
  },

  streamify: (artist) => {
    // Mainstream: values total streams, broad reach, playlist performance
    const streamWeight = Math.log10(Math.max(1, artist.totalStreams || 0)) * 200;
    const followerWeight = Math.log10(Math.max(1, artist.followers || 0)) * 150;
    const cloutWeight = (artist.clout || 0) * 5;
    const hypeWeight = (artist.hype || 0) * 10;
    return streamWeight + followerWeight + cloutWeight + hypeWeight;
  },

  applecore: (artist) => {
    // Premium/Editorial: values quality, clout, curated appeal, revenue potential
    const cloutWeight = (artist.clout || 0) * 40;
    const followerWeight = Math.log10(Math.max(1, artist.followers || 0)) * 120;
    const streamWeight = Math.log10(Math.max(1, artist.totalStreams || 0)) * 80;
    const hypeWeight = (artist.hype || 0) * 15;
    // Bonus for mid-tier artists (editorial sweet spot)
    const editorialBonus = (artist.followers || 0) > 10000 && (artist.followers || 0) < 500000 ? 150 : 0;
    return cloutWeight + followerWeight + streamWeight + hypeWeight + editorialBonus;
  },
};

/**
 * Compute platform-specific ranking for real artists mixed with simulated ones.
 * Returns the rank (1-indexed) of the target artist within 200+ total.
 */
export function computePlatformRank(realArtists, targetArtistId, platform) {
  const scorer = PLATFORM_SCORERS[platform] || PLATFORM_SCORERS.streamify;
  const simulated = generateSimulatedArtists(200);

  const realWithScores = realArtists.map((a) => ({
    id: a.id,
    score: scorer({
      followers: a.followers || 0,
      totalStreams: a.totalStreams || 0,
      clout: a.clout || 0,
      hype: a.hype || 0,
    }),
    _simulated: false,
  }));

  const simWithScores = simulated.map((a) => ({
    id: a.id,
    score: scorer(a),
    _simulated: true,
  }));

  const all = [...realWithScores, ...simWithScores].sort((a, b) => b.score - a.score);
  const idx = all.findIndex((a) => a.id === targetArtistId);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * Get the top N artists for a platform leaderboard, mixing real + simulated.
 */
export function getPlatformLeaderboard(realArtists, platform, topN = 10) {
  const scorer = PLATFORM_SCORERS[platform] || PLATFORM_SCORERS.streamify;
  const simulated = generateSimulatedArtists(200);

  const realScored = realArtists.map((a) => ({
    ...a,
    _score: scorer({
      followers: a.followers || 0,
      totalStreams: a.totalStreams || 0,
      clout: a.clout || 0,
      hype: a.hype || 0,
    }),
    _simulated: false,
  }));

  const simScored = simulated.map((a) => ({
    id: a.id,
    name: a.artist_name,
    image: null,
    totalStreams: a.totalStreams,
    monthlyListeners: a.monthly_listeners || 0,
    genre: a.genre,
    region: a.region,
    _score: scorer(a),
    _simulated: true,
  }));

  return [...realScored, ...simScored]
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}
