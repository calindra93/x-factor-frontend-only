export type BrandDealPayoutType = 'signing' | 'per_turn' | 'bonus' | 'deliverable' | 'penalty' | 'royalty';

export function buildBrandDealPayoutIdempotencyKey(args: {
  playerId: string;
  contractId: string;
  offerId?: string | null;
  dealId?: string | null;
  payoutType: BrandDealPayoutType;
  globalTurnId: number;
  deliverableId?: string | null;
  milestoneId?: string | null;
}) {
  const dealRef = args.offerId || args.dealId || args.contractId;
  if (args.payoutType === 'signing') return `brand_payout:${args.playerId}:${dealRef}:signing`;
  if (args.payoutType === 'per_turn') return `brand_payout:${args.playerId}:${dealRef}:stipend:${args.globalTurnId}`;
  if (args.payoutType === 'deliverable') return `brand_payout:${args.playerId}:${dealRef}:deliverable:${args.deliverableId || 'unknown'}`;
  if (args.payoutType === 'bonus') return `brand_payout:${args.playerId}:${dealRef}:performance:${args.milestoneId || 'contract_completion'}`;
  return `brand_payout:${args.playerId}:${dealRef}:${args.payoutType}:${args.globalTurnId}`;
}
