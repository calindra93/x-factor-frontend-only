export function safeNum(x: unknown, fallback = 0): number {
  if (x === null || x === undefined) return fallback;
  const n = typeof x === 'string' ? Number(x.trim()) : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export function computeSponsoredUpliftFromLogRow(metadata: any): number {
  const explicitUplift = safeNum(metadata?.sponsored_boost_revenue, NaN);
  if (Number.isFinite(explicitUplift)) return Math.max(0, explicitUplift);

  const baseRevenue = safeNum(metadata?.base_revenue, 0);
  const boostedRevenue = safeNum(metadata?.boosted_revenue, 0);
  return Math.max(0, boostedRevenue - baseRevenue);
}

export function safeSponsoredUpliftForRow(metadata: any, debugContext: Record<string, unknown> = {}): number {
  const uplift = computeSponsoredUpliftFromLogRow(metadata);
  if (!Number.isFinite(uplift)) {
    console.error('[BrandDeals][SponsorshipAnalytics] Invalid uplift detected; forcing 0', {
      ...debugContext,
      metadata,
      uplift,
    });
    return 0;
  }
  return Math.max(0, uplift);
}
