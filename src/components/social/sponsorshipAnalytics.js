export function safeNum(x, fallback = 0) {
  if (x === null || x === undefined) return fallback;
  const n = typeof x === 'string' ? Number(x.trim()) : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export function computeSponsoredUpliftFromLogRow(metadata) {
  const explicitUplift = safeNum(metadata?.sponsored_boost_revenue, NaN);
  if (Number.isFinite(explicitUplift)) return Math.max(0, explicitUplift);

  const baseRevenue = safeNum(metadata?.base_revenue, 0);
  const boostedRevenue = safeNum(metadata?.boosted_revenue, 0);
  return Math.max(0, boostedRevenue - baseRevenue);
}
