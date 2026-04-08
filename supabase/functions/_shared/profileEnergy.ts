export async function deductEnergyAtomic(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  artistId: string,
  cost: number,
): Promise<{ success: boolean; remainingEnergy: number }> {
  const { data, error } = await supabase.rpc('deduct_profile_energy', {
    p_artist_id: artistId,
    p_cost: Math.round(cost),
  });

  if (error) {
    console.error('[profileEnergy] deduct_profile_energy RPC error:', error.message);
    return { success: false, remainingEnergy: -1 };
  }

  const remainingEnergy = Number(data);
  if (remainingEnergy === -1) {
    return { success: false, remainingEnergy: -1 };
  }

  return { success: true, remainingEnergy };
}

export async function deductIncomeAtomic(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  artistId: string,
  cost: number,
): Promise<{ success: boolean; remainingIncome: number }> {
  const { data, error } = await supabase.rpc('deduct_profile_income', {
    p_artist_id: artistId,
    p_cost: Math.round(cost),
  });

  if (error) {
    console.error('[profileEnergy] deduct_profile_income RPC error:', error.message);
    return { success: false, remainingIncome: -1 };
  }

  const remainingIncome = Number(data);
  if (remainingIncome === -1) {
    return { success: false, remainingIncome: -1 };
  }

  return { success: true, remainingIncome };
}

export async function creditEnergyAtomic(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  artistId: string,
  amount: number,
): Promise<{ success: boolean; remainingEnergy: number }> {
  const { data, error } = await supabase.rpc('credit_profile_energy', {
    p_artist_id: artistId,
    p_amount: Math.round(amount),
  });

  if (error) {
    console.error('[profileEnergy] credit_profile_energy RPC error:', error.message);
    return { success: false, remainingEnergy: -1 };
  }

  const remainingEnergy = Number(data);
  if (!Number.isFinite(remainingEnergy) || remainingEnergy === -1) {
    return { success: false, remainingEnergy: -1 };
  }

  return { success: true, remainingEnergy };
}
