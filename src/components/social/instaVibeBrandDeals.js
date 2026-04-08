function N(v) {
  return Number(v) || 0;
}

const TIER_EMOJI_MAP = { platinum: '💎', gold: '🏆', silver: '⭐', bronze: '🥉' };
const TIER_EMOJI_NEW = { local: '🏪', regional: '🏙️', national: '🏛️', global: '🌍', luxury: '💎' };

 function getNormalizedPlatformScope(record) {
   const metadataScope = Array.isArray(record?.metadata?.platform_scope)
     ? record.metadata.platform_scope
     : [];
   const recordScope = Array.isArray(record?.platform_scope)
     ? record.platform_scope
     : [];
   const combinedScope = recordScope.length > 0
     ? recordScope
     : metadataScope;

   return combinedScope.map(scope => String(scope || '').toLowerCase());
 }

export function normalizeBrandKey(brandName) {
  return String(brandName || '').trim().toLowerCase();
}

export function getBrandLoyaltyTier(score) {
  if (score <= -4) return 'cold';
  if (score <= 2) return 'neutral';
  if (score <= 5) return 'warm';
  if (score <= 8) return 'favored';
  return 'elite';
}

function buildRequirements(d) {
  const brandName = d.brand_name || 'Brand';
  const handle = '@' + brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hashtag = '#' + brandName.replace(/[^a-zA-Z0-9]/g, '') + 'Partner';
  const deliverables = d.deliverables || {};
  const posts = Number(deliverables.posts) || 1;
  const stories = Number(deliverables.stories) || 0;
  const reqs = [];
  reqs.push(posts === 1 ? `Post a photo or reel featuring ${brandName}` : `Post ${posts} photos or reels featuring ${brandName}`);
  if (stories > 0) reqs.push(`Share ${stories} InstaVibe stor${stories > 1 ? 'ies' : 'y'}`);
  reqs.push(`Tag ${handle} in your post`);
  reqs.push(`Include ${hashtag} in your caption`);
  if ((d.controversy_risk === 'high') || Number(d.risk_score) >= 7) reqs.push('Add #Ad disclosure to caption');
  return reqs;
}

export function mapDbDealToUi(d) {
  const meta = d.metadata || {};
  const rawTier = (d.tier || d.brand_tier || meta.tier || 'local').toLowerCase();
  const tierLabel = rawTier.charAt(0).toUpperCase() + rawTier.slice(1);
  const perTurnFee = Number(d.per_turn_fee) || 0;
  const signingBonus = Number(d.signing_bonus) || 0;
  const performanceBonus = Number(d.performance_bonus) || 0;
  const durationTurns = Number(d.duration_turns) || 1;
  const basePayout = perTurnFee > 0 ? perTurnFee * durationTurns + signingBonus : (Number(d.payout) || 0);
  const riskModel = d.risk_model || {};
  const controversyRisk = d.controversy_risk || 'low';
  const exclusivityCat = d.exclusivity_category || null;
  const regions = d.regions_targeted || [];
  const kpis = d.kpis || {};

  return {
    _dbId: d.id,
    id: d.id,
    _raw: d,
    metadata: meta,
    brand: d.brand_name,
    basePayout,
    payout: basePayout,
    perTurnFee,
    signingBonus,
    performanceBonus,
    durationTurns,
    emoji: TIER_EMOJI_NEW[rawTier] || TIER_EMOJI_MAP[rawTier] || '✨',
    exclusive: !!exclusivityCat,
    exclusivityCategory: exclusivityCat,
    daysLeft: d.expires_turn ? Math.max(0, d.expires_turn - (meta.offer_turn || d.created_turn || 0)) : 5,
    tier: tierLabel,
    tierRaw: rawTier,
    category: d.category || (d.category_name ? String(d.category_name).replace(/_/g, ' ') : null),
    description: d.requirements?.description || `Feature ${d.brand_name} in your content for ${durationTurns} turns.`,
    requirements: buildRequirements({ ...d, risk_score: Number(d.brand_risk_score ?? d.risk_score ?? 0) }),
    type: d.deal_type || 'sponsored_post',
    status: d.status,
    controversyRisk,
    riskModel,
    regions,
    kpis,
    loyaltyTier: d.loyalty_tier || 'neutral',
    sceneFitReason: meta.scene_fit_reason || null,
    sceneBonusPct: Number(meta.scene_brand_bonus_pct || 0),
    sceneTargetRegions: Array.isArray(meta.scene_target_regions) ? meta.scene_target_regions : [],
  };
}

export function getContractKpiSummary(contract) {
  const kpis = contract?.kpis || {};
  const progress = contract?.kpi_progress || {};
  return Object.entries(kpis).map(([key, required]) => ({
    key,
    required: N(required),
    current: N(progress[key]),
    remaining: Math.max(0, N(required) - N(progress[key])),
    met: N(progress[key]) >= N(required),
  }));
}

export function getActiveContractSummary(contract, currentTurn = 0) {
  const startTurn = N(contract?.start_turn_id);
  const endTurn = N(contract?.end_turn_id);
  const durationTurns = Math.max(1, N(contract?.duration_turns) || Math.max(1, endTurn - startTurn));
  const turnsRemaining = Math.max(0, endTurn - N(currentTurn));
  const elapsedTurns = Math.max(0, N(currentTurn) - startTurn);
  const progressPct = Math.min(100, Math.round((elapsedTurns / durationTurns) * 100));
  const deliverablesRequired = Math.max(0, N(contract?.deliverable_count_required));
  const deliverablesCompleted = Math.max(0, N(contract?.deliverable_count_completed));
  const deliverablesRemaining = Math.max(0, deliverablesRequired - deliverablesCompleted);
  const kpiSummary = getContractKpiSummary(contract);

  return {
    startTurn,
    endTurn,
    durationTurns,
    turnsRemaining,
    elapsedTurns,
    progressPct,
    deliverablesRequired,
    deliverablesCompleted,
    deliverablesRemaining,
    kpiSummary,
  };
}

export function contractSupportsPlatform(contract, platform) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const primaryPlatform = String(contract?.primary_platform || contract?.metadata?.primary_platform || contract?.platform || '').toLowerCase();
  const platformScope = getNormalizedPlatformScope(contract);
  return primaryPlatform === normalizedPlatform || platformScope.includes(normalizedPlatform) || platformScope.includes('cross_platform');
}

 export function offerSupportsPlatform(offer, platform) {
   return contractSupportsPlatform(offer, platform);
 }

export function mapDbContractToUi(c, currentTurn = 0) {
  const rawTier = (c.tier || 'local').toLowerCase();
  const perTurnFee = Number(c.per_turn_fee) || 0;
  const signingBonus = Number(c.signing_bonus) || 0;
  const durationTurns = Number(c.duration_turns) || 1;
  const basePayout = perTurnFee > 0 ? perTurnFee * durationTurns + signingBonus : (Number(c.total_paid_to_date) || 0);
  const activeSummary = getActiveContractSummary(c, currentTurn);
  const primaryPlatform = c.primary_platform || (Array.isArray(c.platform_scope) && c.platform_scope[0]) || 'instavibe';
  const categoryLabel = c.category ? String(c.category).replace(/_/g, ' ') : null;

  return {
    _dbId: c.id,
    id: c.id,
    _raw: c,
    brand: c.brand_name,
    payout: basePayout,
    basePayout,
    perTurnFee,
    signingBonus,
    performanceBonus: Number(c.performance_bonus) || 0,
    durationTurns,
    tier: rawTier.charAt(0).toUpperCase() + rawTier.slice(1),
    tierRaw: rawTier,
    emoji: TIER_EMOJI_NEW[rawTier] || TIER_EMOJI_MAP[rawTier] || '✨',
    description: `Active ${(c.deliverable_type || c.deal_type || 'sponsored_post').replace(/_/g, ' ')} · ${durationTurns} turns`,
    loyaltyTier: c.loyalty_tier || 'neutral',
    status: c.status,
    postsNeeded: activeSummary.deliverablesRemaining,
    deliverablesRemaining: activeSummary.deliverablesRemaining,
    deliverablesCompleted: activeSummary.deliverablesCompleted,
    deliverablesRequired: activeSummary.deliverablesRequired,
    turnsRemaining: activeSummary.turnsRemaining,
    startTurn: activeSummary.startTurn,
    endTurn: activeSummary.endTurn,
    progressPct: activeSummary.progressPct,
    kpiSummary: activeSummary.kpiSummary,
    category: c.category || null,
    categoryLabel,
    platformLabel: primaryPlatform,
    platformLabelDisplay: String(primaryPlatform).replace(/_/g, ' '),
    requirementsDescription: c.requirements?.description || null,
    totalPaidToDate: N(c.total_paid_to_date),
  };
}
