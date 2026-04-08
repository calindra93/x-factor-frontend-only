export type OpenerTourCredit = {
  opener_id?: string;
  income?: number;
  tour_id?: string;
  gig_id?: string;
};

export type AggregatedOpenerTourCredit = {
  opener_id: string;
  income: number;
  credit_count: number;
  tour_id: string | null;
  gig_id: string | null;
};

export function aggregateOpenerTourCredits(
  credits: OpenerTourCredit[] = [],
): AggregatedOpenerTourCredit[] {
  const byOpener = new Map<string, AggregatedOpenerTourCredit>();

  for (const credit of credits) {
    const openerId = String(credit?.opener_id || '').trim();
    const income = Number(credit?.income || 0);

    if (!openerId || !Number.isFinite(income) || income <= 0) continue;

    const existing = byOpener.get(openerId);
    if (!existing) {
      byOpener.set(openerId, {
        opener_id: openerId,
        income,
        credit_count: 1,
        tour_id: credit?.tour_id || null,
        gig_id: credit?.gig_id || null,
      });
      continue;
    }

    existing.income += income;
    existing.credit_count += 1;

    if (!existing.tour_id && credit?.tour_id) existing.tour_id = credit.tour_id;
    if (!existing.gig_id && credit?.gig_id) existing.gig_id = credit.gig_id;
  }

  return [...byOpener.values()];
}
