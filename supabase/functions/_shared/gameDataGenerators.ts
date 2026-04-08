/**
 * GAME DATA GENERATORS - Deterministic, No LLM
 * Generates feedback, news, challenges, narratives
 * All data-driven, fast, and repeatable
 */

const FEEDBACK_TEMPLATES = {
  followers: {
    positive: [
      "Your fanbase is growing steadily. Keep releasing quality music.",
      "People are following you in droves. Momentum is building.",
      "Follower growth is strong. The strategy is working."
    ],
    neutral: [
      "Follower growth is steady but not explosive.",
      "You're building a solid foundation with your audience.",
      "Consistent growth. Keep the pace up."
    ],
    negative: [
      "Follower growth has slowed. Try a release or tour.",
      "Your fanbase isn't growing as fast as it could.",
      "You need to re-engage your audience somehow."
    ]
  },
  streams: {
    positive: [
      "Your streams are climbing. The algorithm is working for you.",
      "Streaming numbers are strong across platforms.",
      "People are actually listening to your music. Keep going."
    ],
    neutral: [
      "Streaming is stable but not explosive.",
      "Your releases are getting consistent plays.",
      "Stream growth is in line with expectations."
    ],
    negative: [
      "Stream numbers are declining. A fresh release might help.",
      "Your recent releases aren't getting the traction they should.",
      "Consider changing your release strategy."
    ]
  },
  clout: {
    positive: [
      "Your clout is rising. The industry is noticing you.",
      "You're becoming a bigger deal. Leverage this.",
      "Your profile is getting stronger in the game."
    ],
    neutral: [
      "Clout growth is steady.",
      "You're building credibility slowly.",
      "Industry respect is coming."
    ],
    negative: [
      "Your clout isn't growing fast enough.",
      "You need bigger moments to gain respect.",
      "Do something bold to shake up your profile."
    ]
  }
};

const NEWS_TEMPLATES = {
  release_dropped: [
    "🎵 {artist_name}'s new {project_type} is now live on all platforms.",
    "{artist_name} just dropped a fresh {project_type} and the fans are already tuning in.",
    "Fresh music alert: {artist_name} releases new {project_type} today."
  ],
  stream_milestone: [
    "🎧 {artist_name}'s '{release_title}' just hit {milestone} streams—a huge milestone!",
    "{artist_name} celebrating: '{release_title}' breaks through {milestone} lifetime streams.",
    "Chart watch: {artist_name}'s '{release_title}' crosses {milestone} streams."
  ],
  audience_surge: [
    "📈 {artist_name}'s monthly listener count just exploded—major growth this month.",
    "{artist_name} is on a run—listener counts spiked hard this week.",
    "Breakout moment: {artist_name}'s audience is growing at a record pace."
  ],
  follower_surge: [
    "📱 {artist_name} is gaining followers at a rapid clip—momentum is undeniable.",
    "{artist_name}'s social following is skyrocketing. Something's clicking.",
    "Viral alert: {artist_name}'s follower growth is off the charts."
  ],
  era_flop: [
    "⚠️ {artist_name}'s current era is struggling to find its footing.",
    "Tough turn for {artist_name}—the {genre} scene is moving on.",
    "{artist_name} hits a creative wall: current direction isn't resonating."
  ],
  one_hit_wonder: [
    "💥 {artist_name}'s '{release_title}' is consuming the charts—a breakout moment.",
    "Breakout alert: One song has defined {artist_name}'s entire era right now.",
    "Phenomenon: {artist_name}'s '{release_title}' is inescapable."
  ]
};

const CHALLENGE_TEMPLATES = [
  { type: 'release', description: 'Drop a new release this era' },
  { type: 'tour', description: 'Complete a tour event' },
  { type: 'merch', description: 'Sell 1000+ merch units this era' },
  { type: 'collab', description: 'Feature a notable artist' },
  { type: 'streak', description: 'Release something 3 turns in a row' },
  { type: 'listener_milestone', description: 'Hit 100k monthly listeners' },
  { type: 'streaming_milestone', description: 'Get a song to 500k streams' }
];

export function generateEraNarrativeFeedback(eraData, playerStats, goalProgress) {
  const feedback = {
    summary: [],
    goal_insights: [],
    next_steps: []
  };

  // Goal progress feedback
  for (const goal of goalProgress || []) {
    const progress = goal.current / goal.target;
    
    if (progress >= 1.0) {
      feedback.goal_insights.push(`🎯 Goal "${goal.type}" is complete! Next target?`);
    } else if (progress >= 0.75) {
      feedback.goal_insights.push(`📍 "${goal.type}" is almost there (${Math.floor(progress * 100)}%)`);
    } else if (progress >= 0.5) {
      feedback.goal_insights.push(`🔄 "${goal.type}" is halfway there`);
    } else if (progress > 0) {
      feedback.goal_insights.push(`⏳ "${goal.type}" is in progress`);
    } else {
      feedback.goal_insights.push(`❌ "${goal.type}" hasn't started yet`);
    }
  }

  // Overall narrative
  if (playerStats.followers > 50000) {
    feedback.summary.push("You're building a real fanbase now. The exposure is real.");
  } else if (playerStats.followers > 10000) {
    feedback.summary.push("You've got a solid core audience. Time to expand it.");
  } else {
    feedback.summary.push("Small but dedicated fanbase. Keep building.");
  }

  if (playerStats.clout > 500) {
    feedback.summary.push("The industry is taking notice. Leverage this momentum.");
  } else if (playerStats.clout > 100) {
    feedback.summary.push("Growing credibility. Keep gaining respect.");
  }

  // Next steps
  if (!playerStats.recent_release) {
    feedback.next_steps.push("Drop something new to re-engage your audience.");
  }
  if (playerStats.followers < 5000) {
    feedback.next_steps.push("Focus on listener conversion to followers.");
  }
  if (playerStats.hype < 30) {
    feedback.next_steps.push("Your hype is low. A strategic release could change that.");
  }

  return feedback;
}

export function generateDynamicChallenges(eraData, playerStats, turnId, rng = null) {
  const challenges = [];
  const availableChallenges = CHALLENGE_TEMPLATES.slice();
  
  // Shuffle deterministically
  for (let i = availableChallenges.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableChallenges[i], availableChallenges[j]] = [availableChallenges[j], availableChallenges[i]];
  }

  // Pick 2-3 relevant challenges
  const count = Math.min(3, Math.max(2, Math.floor(availableChallenges.length / 3)));
  
  for (let i = 0; i < count && i < availableChallenges.length; i++) {
    challenges.push({
      id: `challenge_${turnId}_${i}`,
      type: availableChallenges[i].type,
      description: availableChallenges[i].description,
      expires_turn: turnId + 48,
      completed: false
    });
  }

  return challenges;
}

export function generateNewsArticle(eventType, artistName, genre, region, metrics = {}, context = {}) {
  const templates = NEWS_TEMPLATES[eventType] || NEWS_TEMPLATES.release_dropped;
  const template = templates[Math.floor(Math.random() * templates.length)];

  const releaseTitle = metrics.release_title || context.release_name || "new track";
  const projectType = context.project_type || "single";
  const milestone = metrics.milestone || context.milestone || "milestone";
  
  const headline = template
    .replace('{artist_name}', artistName)
    .replace('{genre}', genre)
    .replace('{region}', region)
    .replace('{project_type}', projectType)
    .replace('{release_title}', releaseTitle)
    .replace('{milestone}', milestone.toLocaleString());

  const bodies = {
    release_dropped: `${artistName}'s latest ${projectType} is available now. Fans are already streaming and the response has been positive. Will this be a breakthrough moment?`,
    stream_milestone: `${releaseTitle} continues to gain traction. With ${milestone} streams, it's becoming a staple in the ${genre} scene.`,
    audience_surge: `${artistName}'s listener base expanded significantly this period. The artist is resonating with more people than ever before.`,
    follower_surge: `Social following is climbing fast for ${artistName}. The buzz is real and growing.`,
    era_flop: `${artistName}'s current creative direction isn't landing as expected. The ${genre} community is moving in different directions.`,
    one_hit_wonder: `One song has dominated ${artistName}'s entire conversation lately. ${releaseTitle} is everywhere—for better or worse.`
  };

  const body = bodies[eventType] || "The ${genre} scene continues to evolve, and artists like ${artistName} are shaping its future.";

  return {
    headline,
    body,
    category: eventType.includes('flop') ? 'trending' : 'industry',
    tone: eventType.includes('flop') ? 'cautionary' : 'positive'
  };
}

export function selectFeedback(category, performance) {
  const templates = FEEDBACK_TEMPLATES[category];
  if (!templates) return "Keep pushing forward.";

  let key = 'neutral';
  if (performance > 0.75) key = 'positive';
  if (performance < 0.25) key = 'negative';

  const options = templates[key];
  return options[Math.floor(Math.random() * options.length)];
}