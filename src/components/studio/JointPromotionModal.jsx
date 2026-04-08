import { useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

const PROMO_OPTIONS = [
  {
    id: 'social_boost',
    label: 'Social Media Boost',
    icon: '📱',
    description: 'Both artists post about the remix. 2× engagement and virality on social posts.',
    energyCost: 5,
    inspirationCost: 0,
    hypeBoost: 3,
    viralityBoost: 15,
    automatic: true,
  },
  {
    id: 'fanbase_crossover',
    label: 'Fanbase Crossover',
    icon: '👥',
    description: 'Remix exposed to both fanbases. Combined follower reach multiplier.',
    energyCost: 8,
    inspirationCost: 5,
    hypeBoost: 5,
    viralityBoost: 10,
    automatic: false,
  },
  {
    id: 'coordinated_campaign',
    label: 'Coordinated Campaign',
    icon: '🚀',
    description: 'Full joint promo: synchronized drops, cross-platform posts, shared press. Maximum impact.',
    energyCost: 15,
    inspirationCost: 10,
    hypeBoost: 12,
    viralityBoost: 25,
    automatic: false,
  },
];

function CostBadge({ icon, value, color }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md" style={{ background: `${color}20`, color }}>
      {icon} {value}
    </span>
  );
}

export default function JointPromotionModal({
  remixSongId,
  remixSongTitle,
  originalArtistId,
  originalArtistName,
  currentArtistId,
  currentArtistEnergy = 100,
  currentArtistInspiration = 100,
  onSuccess,
  onClose,
}) {
  const [selected, setSelected] = useState(['social_boost']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function toggleOption(id) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const chosenOptions = PROMO_OPTIONS.filter(o => selected.includes(o.id));
  const totalEnergy = chosenOptions.reduce((s, o) => s + o.energyCost, 0);
  const totalInspiration = chosenOptions.reduce((s, o) => s + o.inspirationCost, 0);
  const totalHype = chosenOptions.reduce((s, o) => s + o.hypeBoost, 0);
  const totalVirality = chosenOptions.reduce((s, o) => s + o.viralityBoost, 0);

  const canAfford = currentArtistEnergy >= totalEnergy && currentArtistInspiration >= totalInspiration;

  async function handleLaunch() {
    if (!canAfford || selected.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      // Deduct costs from requesting artist
      await supabaseClient
        .from('profiles')
        .update({
          energy: Math.max(0, currentArtistEnergy - totalEnergy),
          inspiration: Math.max(0, currentArtistInspiration - totalInspiration),
        })
        .eq('id', currentArtistId);

      // Apply virality boost to the remix release
      const { data: remixSong } = await supabaseClient
        .from('songs')
        .select('release_id')
        .eq('id', remixSongId)
        .maybeSingle();

      if (remixSong?.release_id) {
        const { data: release } = await supabaseClient
          .from('releases')
          .select('virality_modifier_bonus_pct, algorithmic_boost')
          .eq('id', remixSong.release_id)
          .maybeSingle();

        await supabaseClient
          .from('releases')
          .update({
            virality_modifier_bonus_pct: Math.min(100, (release?.virality_modifier_bonus_pct || 0) + totalVirality),
            algorithmic_boost: Math.min(3.0, (release?.algorithmic_boost || 1.0) + 0.1 * chosenOptions.length),
          })
          .eq('id', remixSong.release_id);
      }

      // Notify the original artist
      const needsOtherArtist = chosenOptions.some(o => !o.automatic);
      if (needsOtherArtist && originalArtistId && originalArtistId !== currentArtistId) {
        await supabaseClient
          .from('notifications')
          .insert({
            player_id: originalArtistId,
            type: 'JOINT_PROMO_REQUEST',
            title: '🚀 Joint Promo Invitation',
            subtitle: `For: "${remixSongTitle}"`,
            body: `An artist wants to run a joint promotion campaign for their remix of your song. Options: ${chosenOptions.filter(o => !o.automatic).map(o => o.label).join(', ')}. Accept to amplify the reach!`,
            priority: 'high',
            is_read: false,
            idempotency_key: `joint_promo_${remixSongId}_${currentArtistId}`,
            metrics: {
              remix_song_id: remixSongId,
              options: selected,
              hype_boost: totalHype,
              virality_boost: totalVirality,
            },
            deep_links: { page: 'Studio', tab: 'Remixes' },
          })
          .onConflict('idempotency_key')
          .ignore();
      }

      setSuccess(true);
      setTimeout(() => onSuccess?.({ selected, totalHype, totalVirality, totalEnergy, totalInspiration }), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-white">Joint Promotion</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">✕</button>
          </div>
          <p className="text-xs text-white/40">
            Promoting <span className="text-white/60">"{remixSongTitle}"</span>
            {originalArtistName && <> with <span className="text-white/60">{originalArtistName}</span></>}
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-4xl">🚀</div>
            <div className="text-base font-bold text-white">Campaign Launched!</div>
            <div className="text-xs text-white/40 text-center">
              +{totalVirality}% virality boost applied to your remix
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Option list */}
            <div className="space-y-2">
              {PROMO_OPTIONS.map(option => {
                const isSelected = selected.includes(option.id);
                const affordable = currentArtistEnergy >= option.energyCost && currentArtistInspiration >= option.inspirationCost;

                return (
                  <button
                    key={option.id}
                    onClick={() => toggleOption(option.id)}
                    disabled={!affordable && !isSelected}
                    className="w-full text-left p-3 rounded-xl transition-all disabled:opacity-40"
                    style={{
                      background: isSelected ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{option.icon}</span>
                      <span className="text-sm font-semibold" style={{ color: isSelected ? '#C9A84C' : '#fff' }}>
                        {option.label}
                      </span>
                      {option.automatic && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-white/30" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          auto
                        </span>
                      )}
                      <div
                        className="ml-auto w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: isSelected ? '#C9A84C' : 'transparent',
                          borderColor: isSelected ? '#C9A84C' : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {isSelected && <span className="text-black text-xs font-bold">✓</span>}
                      </div>
                    </div>
                    <p className="text-xs text-white/40 mb-2">{option.description}</p>
                    <div className="flex items-center gap-2">
                      <CostBadge icon="⚡" value={option.energyCost} color="#f59e0b" />
                      {option.inspirationCost > 0 && <CostBadge icon="✨" value={option.inspirationCost} color="#8b5cf6" />}
                      <div className="ml-auto flex items-center gap-2">
                        <CostBadge icon="🔥" value={`+${option.hypeBoost}`} color="#ef4444" />
                        <CostBadge icon="📈" value={`+${option.viralityBoost}%`} color="#22c55e" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Total summary */}
            {selected.length > 0 && (
              <div
                className="rounded-xl p-3 space-y-2"
                style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Total Cost & Impact</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-white/30 mb-0.5">You spend</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-amber-400">⚡ {totalEnergy}</span>
                      {totalInspiration > 0 && <span className="text-sm font-bold text-purple-400">✨ {totalInspiration}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/30 mb-0.5">You gain</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-400">🔥 +{totalHype}</span>
                      <span className="text-sm font-bold text-green-400">📈 +{totalVirality}%</span>
                    </div>
                  </div>
                </div>
                {!canAfford && (
                  <div className="text-xs text-red-400 pt-1">Not enough energy or inspiration.</div>
                )}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleLaunch}
                disabled={submitting || !canAfford || selected.length === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#C9A84C', color: '#000' }}
              >
                {submitting ? 'Launching…' : '🚀 Launch Campaign'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
