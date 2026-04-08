/**
 * Format large numbers with K/M/B/T suffixes
 * Examples: 1500 → 1.5K, 2500000 → 2.5M, 1500000000 → 1.5B, 1e12 → 1T
 */
export function formatNumber(num) {
  if (num == null || num === 0) return '0';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) {
    return `${sign}${(abs / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  } else if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  } else if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `${sign}${abs.toLocaleString()}`;
}

/**
 * Format currency with K/M/B suffixes
 * Examples: 1500 → $1.5K, 2500000 → $2.5M
 */
export function formatCurrency(num) {
  return `$${formatNumber(num)}`;
}

/** Short alias used across many pages */
export const fmt = formatNumber;
