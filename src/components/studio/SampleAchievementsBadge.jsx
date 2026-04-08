import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

const TIERS = [
  {
    tier: 'bronze',
    label: 'Bronze',
    threshold: 5,
    color: '#CD7F32',
    bg: 'rgba(205,127,50,0.15)',
    border: 'rgba(205,127,50,0.4)',
    benefits: '5% fee discount',
    icon: '🥉',
  },
  {
    tier: 'silver',
    label: 'Silver',
    threshold: 25,
    color: '#A8A9AD',
    bg: 'rgba(168,169,173,0.15)',
    border: 'rgba(168,169,173,0.4)',
    benefits: '8% fee discount + quality boost',
    icon: '🥈',
  },
  {
    tier: 'gold',
    label: 'Gold',
    threshold: 100,
    color: '#C9A84C',
    bg: 'rgba(201,168,76,0.15)',
    border: 'rgba(201,168,76,0.4)',
    benefits: '12% discount + legendary unlocked',
    icon: '🥇',
  },
  {
    tier: 'platinum',
    label: 'Platinum',
    threshold: 500,
    color: '#E5E4E2',
    bg: 'rgba(229,228,226,0.15)',
    border: 'rgba(229,228,226,0.4)',
    benefits: '15% discount + all perks maxed',
    icon: '💎',
  },
];

export default function SampleAchievementsBadge({ artistId, compact = false }) {
  const [achievements, setAchievements] = useState([]);
  const [clearedCount, setClearedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    if (!artistId) return;
    fetchData();
  }, [artistId]);

  async function fetchData() {
    setLoading(true);
    const [achRes, countRes] = await Promise.all([
      supabaseClient
        .from('sample_achievements')
        .select('tier, samples_cleared_count, unlocked_at')
        .eq('artist_id', artistId),
      supabaseClient
        .from('sample_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', artistId)
        .in('status', ['completed', 'approved']),
    ]);
    setAchievements(achRes.data || []);
    setClearedCount(countRes.count || 0);
    setLoading(false);
  }

  const unlockedSet = new Set((achievements || []).map(a => a.tier));

  if (loading) {
    return (
      <div className="flex gap-2 animate-pulse">
        {TIERS.map(t => (
          <div key={t.tier} className="w-8 h-8 rounded-full bg-white/10" />
        ))}
      </div>
    );
  }

  if (compact) {
    const highestUnlocked = [...TIERS].reverse().find(t => unlockedSet.has(t.tier));
    if (!highestUnlocked) return null;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
        style={{ background: highestUnlocked.bg, border: `1px solid ${highestUnlocked.border}`, color: highestUnlocked.color }}
      >
        {highestUnlocked.icon} Sample Master: {highestUnlocked.label}
      </span>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Sample Master</h3>
        <span className="text-xs text-white/50">{clearedCount} cleared</span>
      </div>

      <div className="space-y-3">
        {TIERS.map((tierDef, idx) => {
          const isUnlocked = unlockedSet.has(tierDef.tier);
          const prevThreshold = idx === 0 ? 0 : TIERS[idx - 1].threshold;
          const progress = Math.min(1, Math.max(0, (clearedCount - prevThreshold) / (tierDef.threshold - prevThreshold)));
          const isNext = !isUnlocked && (idx === 0 || unlockedSet.has(TIERS[idx - 1].tier));
          const ach = achievements.find(a => a.tier === tierDef.tier);

          return (
            <div
              key={tierDef.tier}
              className="relative"
              onMouseEnter={() => setTooltip(tierDef.tier)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div
                className="flex items-center gap-3 p-2.5 rounded-lg transition-all"
                style={{
                  background: isUnlocked ? tierDef.bg : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isUnlocked ? tierDef.border : 'rgba(255,255,255,0.06)'}`,
                  opacity: isUnlocked || isNext ? 1 : 0.4,
                }}
              >
                <span className="text-lg">{isUnlocked ? tierDef.icon : '🔒'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: isUnlocked ? tierDef.color : '#ffffff60' }}>
                      {tierDef.label}
                    </span>
                    <span className="text-xs text-white/40">
                      {isUnlocked ? '✓ Unlocked' : `${Math.min(clearedCount, tierDef.threshold)}/${tierDef.threshold}`}
                    </span>
                  </div>
                  {!isUnlocked && (
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress * 100}%`, background: tierDef.color }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {tooltip === tierDef.tier && (
                <div
                  className="absolute z-20 left-full ml-2 top-0 w-52 p-3 rounded-lg text-xs text-white/80 shadow-xl pointer-events-none"
                  style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <div className="font-semibold mb-1" style={{ color: tierDef.color }}>
                    {tierDef.icon} Sample Master: {tierDef.label}
                  </div>
                  <div className="text-white/50 mb-2">Clear {tierDef.threshold} samples</div>
                  <div className="text-white/70">
                    <span className="text-white/40">Rewards: </span>
                    {tierDef.benefits}
                  </div>
                  {ach && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-white/40">
                      Unlocked {new Date(ach.unlocked_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
