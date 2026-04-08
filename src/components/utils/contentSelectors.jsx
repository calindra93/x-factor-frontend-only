/**
 * Content Selectors — Unified, memoizable functions for release/merch filtering and sorting.
 * Single source of truth for all content derivations.
 */

/**
 * Get top releases by streaming count.
 * @param {Array} releases - All releases
 * @param {number} limit - Max results (default: 5)
 * @returns {Array} Top releases sorted by lifetime_streams
 */
export function getTopReleases(releases, limit = 5) {
  if (!Array.isArray(releases)) return [];
  
  return releases
    .sort((a, b) => (b.lifetime_streams || 0) - (a.lifetime_streams || 0))
    .slice(0, limit);
}

/**
 * Get active merch (Scheduled or Active status).
 * @param {Array} merch - All merch
 * @returns {Array} Active merch sorted by units_sold descending
 */
export function getActiveMerch(merch) {
  if (!Array.isArray(merch)) return [];
  
  return merch
    .filter(m => ['Scheduled', 'Active'].includes(m.status))
    .sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0));
}

/**
 * Calculate merch revenue statistics.
 * @param {Array} merch - All merch
 * @returns {Object} { totalRevenue, totalCost, netProfit, averageQuality }
 */
export function getMerchStats(merch) {
  if (!Array.isArray(merch) || merch.length === 0) {
    return { totalRevenue: 0, totalCost: 0, netProfit: 0, averageQuality: 0 };
  }

  const totalRevenue = merch.reduce((sum, m) => sum + (m.total_revenue || 0), 0);
  const totalCost = merch.reduce((sum, m) => sum + (m.total_manufacturing_cost || 0), 0);
  const netProfit = totalRevenue - totalCost;
  const averageQuality = Math.round(
    merch.reduce((sum, m) => sum + (m.quality || 0), 0) / merch.length
  );

  return { totalRevenue, totalCost, netProfit, averageQuality };
}

/**
 * Get merch sorted by units_sold descending.
 * @param {Array} merch - All merch
 * @param {number} limit - Max results
 * @returns {Array} Top merch
 */
export function getTopMerch(merch, limit = 10) {
  if (!Array.isArray(merch)) return [];
  
  return merch
    .sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0))
    .slice(0, limit);
}

/**
 * Get releases by lifecycle state.
 * @param {Array} releases - All releases
 * @param {string} state - 'Hot' | 'Stable' | 'Declining' | 'Legacy' | 'Scheduled'
 * @returns {Array} Filtered releases
 */
export function getReleasesByState(releases, state) {
  if (!Array.isArray(releases)) return [];
  
  return releases.filter(r => r.lifecycle_state === state);
}

/**
 * Get all releases sorted by creation date (newest first).
 * @param {Array} releases - All releases
 * @returns {Array} Sorted releases
 */
export function getRecentReleases(releases) {
  if (!Array.isArray(releases)) return [];
  
  return [...releases].sort((a, b) => {
    const aDate = new Date(a.created_date || 0);
    const bDate = new Date(b.created_date || 0);
    return bDate.getTime() - aDate.getTime();
  });
}