import { useState } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

function SplitSlider({ label, icon, value, onChange, min = 50, max = 90, disabled = false }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/60 flex items-center gap-1.5">
          {icon} {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>{value}%</span>
          <span className="text-xs text-white/30">→ {100 - value}% original</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:opacity-40"
        style={{
          background: `linear-gradient(to right, #C9A84C ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%)`,
        }}
      />
      <div className="flex justify-between text-xs text-white/20">
        <span>{min}% you</span>
        <span>{max}% you</span>
      </div>
    </div>
  );
}

export default function RemixRevenueNegotiator({
  targetArtistId,
  targetArtistName,
  originalSongId,
  originalSongTitle,
  requesterArtistId,
  requesterArtistName: _requesterArtistName,
  openCallId = null,
  openCallDefaults = null,
  onSuccess,
  onClose,
}) {
  const [streamingSplit, setStreamingSplit] = useState(
    openCallDefaults ? Math.round((openCallDefaults.revenue_split_offer || 0.7) * 100) : 70
  );
  const [merchSplit, setMerchSplit] = useState(
    openCallDefaults ? Math.round((openCallDefaults.revenue_split_merch || 0.9) * 100) : 90
  );
  const [touringSplit, setTouringSplit] = useState(100);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // Create a collaboration_request of type 'Remix' with revenue splits
      const { error: insertErr } = await supabaseClient
        .from('collaboration_requests')
        .insert({
          requester_artist_id: requesterArtistId,
          target_artist_id: targetArtistId,
          collaboration_type: 'Remix',
          song_id: originalSongId,
          proposed_concept: message || `Remix collaboration for "${originalSongTitle}"`,
          revenue_split: streamingSplit / 100,
          revenue_split_streaming: streamingSplit / 100,
          revenue_split_merch: merchSplit / 100,
          revenue_split_touring: touringSplit / 100,
          status: openCallId ? 'approved' : 'pending',
        });

      if (insertErr) throw new Error(insertErr.message);

      // If this is an open call, increment counter and create the open_call link
      if (openCallId) {
        await supabaseClient.rpc('increment_open_call_remixes', { call_id: openCallId }).catch(() =>
          supabaseClient.from('remix_open_calls')
            .update({ current_remixes: (openCallDefaults?.current_remixes || 0) + 1 })
            .eq('id', openCallId)
        );
      }

      onSuccess?.({ streamingSplit, merchSplit, touringSplit, openCallId });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isOpenCall = !!openCallId;

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
            <h2 className="text-base font-bold text-white">Remix Revenue Split</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white text-sm transition-colors">✕</button>
          </div>
          <p className="text-xs text-white/40">
            {isOpenCall ? 'Claiming open remix slot for' : 'Proposing remix of'}
            {' '}<span className="text-white/60">"{originalSongTitle}"</span>
            {' '}by <span className="text-white/60">{targetArtistName}</span>
          </p>
        </div>

        <div className="p-4 space-y-5">
          {/* Revenue split sliders */}
          <div
            className="p-4 rounded-xl space-y-5"
            style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
              Your share (remixer)
            </div>

            <SplitSlider
              label="Streaming Revenue"
              icon="🎵"
              value={streamingSplit}
              onChange={setStreamingSplit}
              min={50}
              max={80}
              disabled={isOpenCall}
            />
            <SplitSlider
              label="Merch Revenue"
              icon="👕"
              value={merchSplit}
              onChange={setMerchSplit}
              min={70}
              max={100}
              disabled={isOpenCall}
            />
            <SplitSlider
              label="Touring Revenue"
              icon="🎤"
              value={touringSplit}
              onChange={setTouringSplit}
              min={70}
              max={100}
            />
          </div>

          {/* Summary */}
          <div
            className="rounded-xl p-3 space-y-1.5"
            style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}
          >
            <div className="text-xs font-semibold text-white/50 mb-2">Deal Summary</div>
            {[
              ['Streaming', streamingSplit, 100 - streamingSplit],
              ['Merch', merchSplit, 100 - merchSplit],
              ['Touring', touringSplit, 100 - touringSplit],
            ].map(([type, you, them]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-white/40">{type}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{you}%</span>
                  <span className="text-white/20">→</span>
                  <span className="text-white/40">{them}% {targetArtistName}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Message (only for non-open-call) */}
          {!isOpenCall && (
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Message (optional)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={`Hey ${targetArtistName}, I'd love to remix your track…`}
                rows={2}
                className="w-full p-3 rounded-xl text-sm text-white placeholder-white/20 outline-none resize-none"
                style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
              {error}
            </div>
          )}

          {isOpenCall && (
            <div className="text-xs text-white/30 text-center">
              Open call terms are set by the original artist and cannot be changed.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: '#C9A84C', color: '#000' }}
            >
              {submitting
                ? 'Sending…'
                : isOpenCall ? 'Claim Remix Slot' : `Send to ${targetArtistName}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
