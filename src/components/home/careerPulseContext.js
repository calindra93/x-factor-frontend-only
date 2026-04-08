export function getPlayerTags(profile = {}, currentEra = null) {
  return [
    ...(currentEra?.aesthetic_tags || []),
    profile?.genre,
  ].filter(Boolean).map((tag) => String(tag).toLowerCase());
}

export function getTopTrendMatch(trends = [], profile = {}, currentEra = null) {
  const playerTags = getPlayerTags(profile, currentEra);

  return (trends || [])
    .map((trend) => {
      const affinity = (trend?.pillar_affinity || []).map((item) => String(item).toLowerCase());
      const alignTag = String(trend?.alignment_tag || "").toLowerCase();
      const matchedTags = playerTags.filter((tag) => affinity.includes(tag) || alignTag.includes(tag));

      return {
        trend,
        matchedTags,
        isMatch: matchedTags.length > 0,
      };
    })
    .sort((a, b) => {
      if (a.isMatch !== b.isMatch) return a.isMatch ? -1 : 1;
      return Number(b.trend?.intensity || 0) - Number(a.trend?.intensity || 0);
    })[0] || null;
}

export function extractRivals(newsItems = [], profile = null) {
  const myName = String(profile?.artist_name || "").toLowerCase();
  const seen = new Set();

  return (newsItems || [])
    .filter((item) => item?.artist_name && String(item.artist_name).toLowerCase() !== myName)
    .reduce((acc, item) => {
      if (!seen.has(item.artist_name)) {
        seen.add(item.artist_name);
        acc.push(item);
      }
      return acc;
    }, [])
    .slice(0, 4);
}

export function buildCareerPulseContext({
  careerSnapshot = null,
  topTrendMatch = null,
  activeRisk = null,
  negativeNews = [],
  supportNet = 0,
  currentEra = null,
  streak = 0,
  fanProfile = null,
  profile = null,
}) {
  const monthlyListeners = Number(fanProfile?.monthly_listeners || 0);
  const followerCount = Number(profile?.followers || 0);
  const currentStageOrder = Number(careerSnapshot?.current_stage_order || 1);
  const pendingStageOrder = Number(careerSnapshot?.pending_stage_order || 0);
  const pendingStageStreak = Number(careerSnapshot?.pending_stage_streak || 0);
  const nextStageThreshold = Number(careerSnapshot?.next_stage_threshold || 0);
  const listenerGap = Math.max(0, nextStageThreshold - monthlyListeners);
  const laneName = careerSnapshot?.dominant_lane ? String(careerSnapshot.dominant_lane).replace(/_/g, " ") : null;
  const archetypeName = careerSnapshot?.current_archetype ? String(careerSnapshot.current_archetype).replace(/_/g, " ") : null;
  const weatherFit = careerSnapshot?.current_weather_fit ? String(careerSnapshot.current_weather_fit).replace(/_/g, " ") : null;
  const trendHeadline = topTrendMatch?.trend?.name || topTrendMatch?.trend?.trend_type || null;
  const trendSummary = trendHeadline
    ? topTrendMatch?.isMatch
      ? `${trendHeadline} fits your lane right now.`
      : `${trendHeadline} is hot, but it does not naturally fit your lane.`
    : "No clear trend signal is dominating right now.";

  const positives = [
    careerSnapshot?.peaked_top_10 ? "You have a Top 10 chart bonus helping progression." : null,
    careerSnapshot?.weeks_2plus ? "You have a 2+ week chart bonus helping progression." : null,
    supportNet > 0 ? `Last turn generated $${Math.round(supportNet).toLocaleString()} in support revenue.` : null,
    topTrendMatch?.isMatch ? trendSummary : null,
    weatherFit ? `Current weather fit: ${weatherFit}.` : null,
  ].filter(Boolean);

  const negatives = [
    listenerGap > 0 ? `You still need about ${Math.round(listenerGap).toLocaleString()} more monthly listeners for the next stage.` : null,
    activeRisk?.headline ? activeRisk.headline : null,
    negativeNews.length > 1 ? `${negativeNews.length} negative news beats are stacking around you.` : null,
    topTrendMatch?.trend && !topTrendMatch?.isMatch ? trendSummary : null,
  ].filter(Boolean);

  const promotionSummary = careerSnapshot
    ? pendingStageOrder === currentStageOrder + 1
      ? `You are ${pendingStageStreak}/2 turns into a promotion review for ${careerSnapshot?.pending_stage_name || `Stage ${pendingStageOrder}`}.`
      : listenerGap > 0
        ? `You are about ${Math.round(listenerGap).toLocaleString()} monthly listeners away from ${careerSnapshot?.next_stage_name || `Stage ${careerSnapshot?.next_stage_order}`}.`
        : careerSnapshot?.next_stage_name
          ? `You are in range for ${careerSnapshot.next_stage_name}.`
          : `You are currently capped at ${careerSnapshot?.cap_stage_name || `Stage ${careerSnapshot?.max_stage_order || currentStageOrder}`}.`
    : streak >= 1
      ? "You have momentum, but you still need more proof before promotion becomes clear."
      : "You need stronger momentum before the next promotion push becomes visible.";

  return {
    laneLabel: laneName || archetypeName || (currentEra?.phase ? String(currentEra.phase).replace(/_/g, " ") : "Developing artist"),
    archetypeLabel: archetypeName,
    weatherFitLabel: weatherFit,
    _primaryLane: careerSnapshot?.dominant_lane || null,
    _secondaryLane: careerSnapshot?.secondary_lane || null,
    promotionSummary,
    promotionValue: careerSnapshot
      ? pendingStageOrder === currentStageOrder + 1
        ? `${pendingStageStreak}/2`
        : listenerGap > 0
          ? `-${Math.round(listenerGap).toLocaleString()}`
          : careerSnapshot?.next_stage_name || careerSnapshot?.cap_stage_name || `Stage ${currentStageOrder}`
      : streak >= 1
        ? `${streak} turns`
        : currentEra?.phase || "Reset",
    trendSummary,
    trendValue: trendHeadline || (topTrendMatch?.isMatch ? "Aligned" : "Neutral"),
    positives,
    negatives,
    listenerLine: monthlyListeners > 0
      ? `${Math.round(monthlyListeners).toLocaleString()} monthly listeners`
      : followerCount > 0
        ? `${Math.round(followerCount).toLocaleString()} followers in play`
        : null,
    stageLabel: careerSnapshot?.current_stage_name || careerSnapshot?.career_stage || `Stage ${currentStageOrder}`,
    nextStageLabel: careerSnapshot?.next_stage_name || careerSnapshot?.pending_stage_name || null,
  };
}
