export const BRAND_DEAL_CONTRACT_STATUSES = ['active', 'completed', 'breached', 'cancelled'];
export const BRAND_DEAL_OFFER_STATUSES = ['offered'];

export function normalizeBrandDealStatus(status) {
  return String(status || '').toLowerCase();
}

export function isActiveContractStatus(status) {
  return normalizeBrandDealStatus(status) === 'active';
}

export function isCompletedContractStatus(status) {
  const normalized = normalizeBrandDealStatus(status);
  return normalized === 'completed' || normalized === 'breached';
}

export function isHistoricalContractStatus(status) {
  const normalized = normalizeBrandDealStatus(status);
  return normalized === 'cancelled' || normalized === 'expired' || normalized === 'declined';
}

export function statusBadgeConfig(status) {
  const normalized = normalizeBrandDealStatus(status);
  if (normalized === 'active') return { label: 'Active', className: 'bg-green-500/20 text-green-300 border-green-500/30' };
  if (normalized === 'completed') return { label: 'Completed', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (normalized === 'breached') return { label: 'Breached', className: 'bg-red-500/20 text-red-300 border-red-500/30' };
  if (normalized === 'cancelled') return { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
  if (normalized === 'offered') return { label: 'Offer', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  return { label: 'Unknown', className: 'bg-white/10 text-gray-300 border-white/20' };
}
