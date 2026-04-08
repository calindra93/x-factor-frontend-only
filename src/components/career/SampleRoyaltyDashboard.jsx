import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

function StatCard({ label, value, sub, color = '#C9A84C' }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#17171F', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="text-xs text-white/40 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

function DecayBar({ turnsElapsed }) {
  const pct = turnsElapsed <= 50 ? 100 : turnsElapsed <= 100 ? 50 : turnsElapsed <= 150 ? 25 : 0;
  const color = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : pct > 0 ? '#ef4444' : '#6b7280';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right" style={{ color }}>
        {pct > 0 ? `${pct}%` : 'Ended'}
      </span>
    </div>
  );
}

export default function SampleRoyaltyDashboard({ artistId }) {
  const [tab, setTab] = useState('receiving');
  const [_currentTurn, setCurrentTurn] = useState(0);
  const [receiving, setReceiving] = useState([]);
  const [paying, setPaying] = useState([]);
  const [totals, setTotals] = useState({ received: 0, paid: 0, active_sources: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!artistId) return;
    fetchData();
  }, [artistId]);

  async function fetchData() {
    setLoading(true);

    const [turnRes, receivingRes, payingRes] = await Promise.all([
      supabaseClient.from('turn_state').select('global_turn_id').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      // Royalties this artist receives (they own original songs being sampled)
      supabaseClient
        .from('sample_royalty_payments')
        .select(`
          id, royalty_amount, royalty_rate, decay_multiplier, global_turn_id, streaming_revenue,
          sampling_song:songs!sampling_song_id(id, title, artist_id, profiles:artist_id(artist_name))
        `)
        .eq('original_artist_id', artistId)
        .order('global_turn_id', { ascending: false })
        .limit(50),
      // Royalties this artist pays out (they used samples)
      supabaseClient
        .from('sample_royalty_payments')
        .select(`
          id, royalty_amount, royalty_rate, decay_multiplier, global_turn_id, streaming_revenue,
          sampling_song:songs!sampling_song_id(id, title)
        `)
        .eq('sampling_artist_id', artistId)
        .order('global_turn_id', { ascending: false })
        .limit(50),
    ]);

    const turn = turnRes.data?.global_turn_id || 0;
    setCurrentTurn(turn);

    const recData = receivingRes.data || [];
    const payData = payingRes.data || [];
    setReceiving(recData);
    setPaying(payData);

    const totalReceived = recData.reduce((s, r) => s + (r.royalty_amount || 0), 0);
    const totalPaid     = payData.reduce((s, r) => s + (r.royalty_amount || 0), 0);
    const activeSources = new Set(payData.filter(p => (p.decay_multiplier || 0) > 0).map(p => p.sampling_song?.id)).size;

    setTotals({ received: totalReceived, paid: totalPaid, active_sources: activeSources });
    setLoading(false);
  }

  function groupByTurn(payments) {
    const grouped = {};
    for (const p of payments) {
      const key = p.global_turn_id;
      if (!grouped[key]) grouped[key] = { turn: key, items: [], total: 0 };
      grouped[key].items.push(p);
      grouped[key].total += p.royalty_amount || 0;
    }
    return Object.values(grouped).sort((a, b) => b.turn - a.turn);
  }

  const data = tab === 'receiving' ? receiving : paying;
  const grouped = groupByTurn(data);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total Received"
          value={`$${totals.received.toFixed(2)}`}
          sub="from your samples"
          color="#22c55e"
        />
        <StatCard
          label="Total Paid Out"
          value={`$${totals.paid.toFixed(2)}`}
          sub="for samples used"
          color="#ef4444"
        />
        <StatCard
          label="Net Royalties"
          value={`$${(totals.received - totals.paid).toFixed(2)}`}
          sub={totals.active_sources > 0 ? `${totals.active_sources} active source${totals.active_sources !== 1 ? 's' : ''}` : 'no active payments'}
          color={totals.received >= totals.paid ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#17171F' }}>
        {[
          { id: 'receiving', label: '💰 Receiving' },
          { id: 'paying', label: '📤 Paying Out' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? 'rgba(201,168,76,0.15)' : 'transparent',
              color: tab === t.id ? '#C9A84C' : 'rgba(255,255,255,0.4)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Payment history */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        {!loading && grouped.length === 0 && (
          <div className="text-center py-12 text-white/30 text-sm">
            {tab === 'receiving'
              ? 'No royalties received yet. Make your songs sampleable to earn!'
              : 'No royalty payments made yet.'}
          </div>
        )}

        {!loading && grouped.map(group => (
          <div key={group.turn} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ background: '#17171F' }}
            >
              <span className="text-xs text-white/40">Turn {group.turn}</span>
              <span className="text-xs font-semibold" style={{ color: tab === 'receiving' ? '#22c55e' : '#ef4444' }}>
                {tab === 'receiving' ? '+' : '-'}${group.total.toFixed(2)}
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {group.items.map(item => {
                const decay = item.decay_multiplier || 0;
                const songTitle = item.sampling_song?.title || 'Unknown Song';
                const artistName = item.sampling_song?.profiles?.artist_name || '';
                return (
                  <div key={item.id} className="px-3 py-2.5" style={{ background: '#0D0D11' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0 mr-2">
                        <div className="text-xs font-medium text-white truncate">{songTitle}</div>
                        {artistName && <div className="text-xs text-white/30 truncate">{artistName}</div>}
                      </div>
                      <div className="text-xs font-semibold flex-shrink-0" style={{ color: tab === 'receiving' ? '#22c55e' : '#ef4444' }}>
                        ${item.royalty_amount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/30">
                        Rate: {((item.royalty_rate || 0) * 100).toFixed(1)}%
                      </span>
                      <div className="flex-1">
                        <DecayBar turnsElapsed={Math.round((1 - decay) * 150)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
