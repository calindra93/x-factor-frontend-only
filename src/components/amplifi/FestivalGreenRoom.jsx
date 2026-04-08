/**
 * FestivalGreenRoom — Aftermath view for a completed festival instance
 * Shows: performance score cards, faction standing changes,
 *        highlight clip choice (FAN/PRESS/BRAND), deal outcomes, setlist score
 * Rendered as a tab panel inside AmplifiApp when a festival is COMPLETE
 * and the player performed.
 */

import React, { useState, useEffect } from 'react';
import { Trophy, Star, Film, CheckCircle, Loader2, Handshake, ExternalLink } from 'lucide-react';
import { fmt } from "@/utils/numberFormat";
import { supabaseClient } from '@/lib/supabaseClient';
import { invokeFestivalAction } from '@/lib/invokeFestivalAction';
import { formatGreenRoomClipDay, sortGreenRoomResults } from '@/components/amplifi/greenRoomPresentation';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Backstage deal type config for follow-through display
const DEAL_TYPE_CONFIG = {
  FEATURE_SWAP:        { label: 'Feature Swap',        icon: '🎤', color: '#a855f7', route: 'Social', desc: 'Collab request created' },
  REMIX_PERMISSION:    { label: 'Remix Permission',    icon: '🔄', color: '#6366f1', route: 'Social', desc: 'Remix collab created' },
  BRAND_SCOUT_MEETING: { label: 'Brand Scout Meeting', icon: '💼', color: '#ec4899', route: 'BrandPortfolioApp', desc: 'Brand boost active' },
  TOURING_INVITE:      { label: 'Touring Invite',      icon: '🚌', color: '#10b981', route: 'TouringAppV2', desc: 'Tour support invite' },
  SYNC_PITCH:          { label: 'Sync Pitch',          icon: '🎵', color: '#f59e0b', route: 'Studio', desc: 'Sync lead created' },
  STAGE_GUEST_SURPRISE:{ label: 'Stage Guest',         icon: '🎉', color: '#d946ef', route: null, desc: 'Performance boost applied' },
};

function heatColor(heat) {
  if (heat >= 75) return '#10b981';
  if (heat >= 50) return '#f59e0b';
  return '#ef4444';
}

const DISTRIBUTION_OPTIONS = [
  {
    key: 'FAN_CLIP',
    label: 'Share with Fans',
    icon: '🎥',
    description: 'LoopTok views surge · follower spike',
    color: '#a855f7',
  },
  {
    key: 'PRESS_CLIP',
    label: 'Send to Press',
    icon: '📰',
    description: 'Credibility boost · news coverage',
    color: '#6366f1',
  },
  {
    key: 'BRAND_CLIP',
    label: 'Pitch to Brands',
    icon: '💼',
    description: 'Festival brand boost extension',
    color: '#ec4899',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color = '#a855f7', suffix = '' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}{suffix}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: .8, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function HeatBar({ value, color }) {
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 3, transition: 'width .6s ease' }} />
    </div>
  );
}

function MomentCardBadge({ card }) {
  if (!card) return null;
  const isPositive = (card.heat_bonus ?? 0) >= 0;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: isPositive ? 'rgba(252,211,77,.12)' : 'rgba(239,68,68,.12)', border: `1px solid ${isPositive ? 'rgba(252,211,77,.25)' : 'rgba(239,68,68,.25)'}` }}>
      <Star size={11} color={isPositive ? '#fcd34d' : '#ef4444'} />
      <span style={{ fontSize: 11, fontWeight: 700, color: isPositive ? '#fcd34d' : '#ef4444' }}>
        {card.label || card.type}
      </span>
    </div>
  );
}

function HighlightClipCard({ clip, onDistribute }) {
  const [chosen, setChosen] = useState(clip.chosen_distribution || null);
  const [loading, setLoading] = useState(false);

  async function pick(key) {
    if (clip.effect_applied || chosen) return;
    setLoading(true);
    try {
      await invokeFestivalAction('resolveHighlightClip', {
        clipId: clip.id,
        distribution: key,
      });
      setChosen(key);
      onDistribute?.(clip.id, key);
    } catch (e) {
      console.error('Clip distribution failed', e);
    } finally {
      setLoading(false);
    }
  }

  const isApplied = clip.effect_applied || !!chosen;

  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Film size={15} color="#a855f7" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Highlight Clip Available</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
            {formatGreenRoomClipDay(clip)} · {clip.moment_card_label || clip.moment_card_type}
          </div>
        </div>
      </div>

      {isApplied ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 10 }}>
          <CheckCircle size={14} color="#10b981" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>
            {clip.effect_summary?.summary || clip.effect_summary || `Distributed as ${chosen || clip.chosen_distribution}`}
          </span>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginBottom: 8, fontWeight: 600 }}>Choose how to distribute this clip:</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DISTRIBUTION_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => pick(opt.key)}
                disabled={loading}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 10,
                  background: `${opt.color}18`, border: `1px solid ${opt.color}50`,
                  color: opt.color, fontSize: 10, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'center',
                  transition: 'all .15s',
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 3 }}>{opt.icon}</div>
                <div>{opt.label}</div>
                <div style={{ fontSize: 8, fontWeight: 400, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{opt.description}</div>
              </button>
            ))}
          </div>
          {loading && <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.3)' }}>Applying…</div>}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// PUBLIC_INTERFACE
/**
 * FestivalGreenRoom — Aftermath view for a completed festival instance.
 * Shows performance score cards, faction standing changes, highlight clip
 * choice (FAN/PRESS/BRAND), deal outcomes, and setlist score.
 * Rendered as a tab panel inside AmplifiApp when a festival is COMPLETE
 * and the player performed.
 */
export default function FestivalGreenRoom({ instanceId, festivalName, profile, onDismiss }) {
  const [results, setResults] = useState([]);
  const [clips, setClips] = useState([]);
  const [factionChanges, setFactionChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [scoutInterest, setScoutInterest] = useState(null); // BUG 4 FIX: Scout interest from player_brand_stats
  const [backstageDeals, setBackstageDeals] = useState([]); // Approach C: follow-through artifacts

  const navigate = useNavigate();

  useEffect(() => {
    if (!instanceId || !profile?.id) return;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // Performance results for this instance
        const { data: perfData } = await supabaseClient
          .from('festival_performance_results')
          .select('*, festival_instance_day:festival_instance_days(day_index)')
          .eq('festival_instance_id', instanceId)
          .eq('artist_id', profile.id);
        setResults(sortGreenRoomResults(perfData || []));

        // BUG 4 FIX: Fetch scout interest from player_brand_stats
        try {
          const { data: brandStats } = await supabaseClient
            .from('player_brand_stats')
            .select('festival_brand_boost, festival_boost_expires_turn')
            .eq('artist_id', profile.id)
            .maybeSingle();
          if (brandStats && brandStats.festival_brand_boost > 0) {
            setScoutInterest(brandStats);
          }
        } catch { /* non-fatal — scout interest display is supplementary */ }

        // Approach C: Fetch backstage deals with follow-through artifacts for this festival
        try {
          const { data: deals } = await supabaseClient
            .from('festival_backstage_deals')
            .select('id, deal_type, payload, effects_applied, resolved_turn_id, created_at')
            .eq('festival_instance_id', instanceId)
            .eq('artist_a_id', profile.id)
            .not('resolved_turn_id', 'is', null);
          setBackstageDeals(deals || []);
        } catch { /* non-fatal — follow-through display is supplementary */ }

        // Fetch current turn for clip expiry filtering (GAP-10)
        let currentTurn = 0;
        try {
          const { data: gsData } = await supabaseClient
            .from('turn_state')
            .select('global_turn_id, last_completed_turn_id')
            .eq('id', 1)
            .maybeSingle();
          currentTurn = gsData?.global_turn_id ?? gsData?.last_completed_turn_id ?? 0;
        } catch { /* non-fatal — show all clips if turn unavailable */ }

        // Highlight clips — filter out expired clips (GAP-10 fix)
        let clipQuery = supabaseClient
          .from('festival_highlight_clips')
          .select('*')
          .eq('festival_instance_id', instanceId)
          .eq('artist_id', profile.id)
          .order('day_index', { ascending: true });

        // Only apply expiry filter if we have a valid turn
        if (currentTurn > 0) {
          clipQuery = clipQuery.or(`expires_turn_id.is.null,expires_turn_id.gt.${currentTurn}`);
        }

        const { data: clipData } = await clipQuery;
        setClips(clipData || []);

        // Faction standings (all factions for this festival's festivals entry)
        // Get festival_id from the instance
        const { data: instData } = await supabaseClient
          .from('festival_instances')
          .select('festival_id')
          .eq('id', instanceId)
          .maybeSingle();

        if (instData?.festival_id) {
          const { data: factions } = await supabaseClient
            .from('festival_factions')
            .select('id, code, label')
            .eq('festival_id', instData.festival_id);

          if (factions?.length) {
            const factionIds = factions.map((f) => f.id);
            const { data: standings } = await supabaseClient
              .from('player_faction_standing')
              .select('faction_id, standing')
              .eq('player_id', profile.id)
              .in('faction_id', factionIds);

            const standingMap = new Map((standings || []).map((s) => [s.faction_id, s.standing]));
            setFactionChanges(factions.map((f) => ({
              ...f,
              standing: Number(standingMap.get(f.id) ?? 0),
            })));
          }
        }
      } catch (err) {
        // GAP-12 fix: surface errors instead of silently swallowing them
        console.error('[FestivalGreenRoom] load error', err);
        setLoadError(err?.message || 'Failed to load festival recap');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [instanceId, profile?.id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
        Loading green room…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
        <div style={{ margin: '0 auto 12px', padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, color: '#fca5a5', fontSize: 12 }}>
          {loadError}
        </div>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.25)', fontSize: 13 }}>
        <Trophy size={32} color="rgba(255,255,255,.08)" style={{ margin: '0 auto 12px', display: 'block' }} />
        No performance data yet.
      </div>
    );
  }

  const sortedResults = sortGreenRoomResults(results);

  // Aggregate across days
  const totalDays = sortedResults.length;
  const avgHeat = Math.round(sortedResults.reduce((s, r) => s + Number(r.crowd_heat || 0), 0) / totalDays);
  const avgCred = Math.round(sortedResults.reduce((s, r) => s + Number(r.credibility || 0), 0) / totalDays);
  const avgConv = Math.round(sortedResults.reduce((s, r) => s + Number(r.conversion || 0), 0) / totalDays);
  const totalFans = sortedResults.reduce((s, r) => s + (r.follower_gain || 0), 0);
  const totalClout = sortedResults.reduce((s, r) => s + (r.clout_gain || 0), 0);
  const totalBrand = sortedResults.reduce((s, r) => s + (r.brand_interest_gain || 0), 0);
  const totalWristband = sortedResults.reduce((s, r) => s + (r.wristband_payout || 0), 0);
  const bestResult = [...sortedResults].sort((a, b) => Number(b.crowd_heat) - Number(a.crowd_heat))[0];

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* Hero banner */}
      <div style={{ margin: '16px 18px 0', padding: '16px', background: 'linear-gradient(135deg,rgba(168,85,247,.2),rgba(236,72,153,.12))', border: '1px solid rgba(168,85,247,.25)', borderRadius: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Green Room</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{festivalName || 'Festival'} Recap</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 3 }}>{totalDays} day{totalDays !== 1 ? 's' : ''} performed</div>
        {bestResult?.moment_card && (
          <div style={{ marginTop: 10 }}>
            <MomentCardBadge card={bestResult.moment_card} />
          </div>
        )}
      </div>

      {/* Performance score cards */}
      <div style={{ margin: '14px 18px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Performance Scores</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <StatCard label="Crowd Heat" value={avgHeat} color={heatColor(avgHeat)} />
          <StatCard label="Credibility" value={avgCred} color="#a855f7" />
          <StatCard label="Conversion" value={avgConv} color="#6366f1" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard label="New Fans" value={`+${fmt(totalFans)}`} color="#10b981" />
          <StatCard label="Clout Earned" value={`+${totalClout}`} color="#f59e0b" />
          {totalBrand > 0 && <StatCard label="Brand Interest" value={`+${totalBrand}`} color="#ec4899" />}
          {totalWristband > 0 && <StatCard label="Wristband Pay" value={`$${fmt(totalWristband)}`} color="#10b981" />}
        </div>
      </div>

      {/* BUG 4 FIX: Scout Interest Section - shows cumulative festival brand boost */}
      {scoutInterest && scoutInterest.festival_brand_boost > 0 && (
        <div style={{ margin: '14px 18px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Scout Interest</div>
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(236,72,153,.12), rgba(168,85,247,.08))',
            border: '1px solid rgba(236,72,153,.25)',
            borderRadius: 14,
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 28, }}>👀</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Brand scouts are watching</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
                  Your festival performances caught their attention
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Active Boost</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#ec4899' }}>+{scoutInterest.festival_brand_boost}%</div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textAlign: 'right' }}>
                Increases brand deal<br/>offer rates
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-day breakdown */}
      {totalDays > 1 && (
        <div style={{ margin: '16px 18px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Day Breakdown</div>
          {sortedResults.map((r, i) => {
            const heat = Number(r.crowd_heat || 0);
            const color = heatColor(heat);
            return (
              <div key={r.id} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Day {r.festival_instance_day?.day_index || i + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.moment_card?.type && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(252,211,77,.1)', color: '#fcd34d', border: '1px solid rgba(252,211,77,.2)' }}>
                        {r.moment_card.label || r.moment_card.type}
                      </span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 800, color }}>{heat}</span>
                  </div>
                </div>
                <HeatBar value={heat} color={color} />
              </div>
            );
          })}
        </div>
      )}

      {/* Highlight clips */}
      {clips.length > 0 && (
        <div style={{ margin: '16px 18px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Highlight Clips</div>
          {clips.map((clip) => (
            <HighlightClipCard
              key={clip.id}
              clip={clip}
              onDistribute={(clipId, dist) => {
                setClips((prev) => prev.map((c) => c.id === clipId ? {
                  ...c,
                  chosen_distribution: dist,
                  effect_applied: true,
                  effect_summary: c.effect_summary?.summary
                    ? c.effect_summary
                    : {
                        ...(typeof c.effect_summary === 'object' && c.effect_summary ? c.effect_summary : {}),
                        summary: `Distributed as ${dist}`,
                        distribution: dist,
                      },
                } : c));
              }}
            />
          ))}
        </div>
      )}

      {/* Faction standings */}
      {factionChanges.length > 0 && (
        <div style={{ margin: '16px 18px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Faction Standing</div>
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '12px 14px' }}>
            {factionChanges.map((faction, i) => {
              const standing = faction.standing;
              const barColor = standing > 20 ? '#10b981' : standing > -20 ? '#f59e0b' : '#ef4444';
              const barWidth = ((standing + 100) / 200) * 100; // map -100..100 to 0..100%
              return (
                <div key={faction.id} style={{ marginBottom: i < factionChanges.length - 1 ? 12 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', textTransform: 'capitalize' }}>{faction.label || faction.code}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: barColor }}>
                      {standing > 0 ? '+' : ''}{standing}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, background: barColor, borderRadius: 2, transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approach C: Backstage Follow-Through Artifacts */}
      {backstageDeals.length > 0 && (
        <div style={{ margin: '16px 18px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            <Handshake size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
            Backstage Follow-Through
          </div>
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '12px 14px' }}>
            {backstageDeals.map((deal, i) => {
              const cfg = DEAL_TYPE_CONFIG[deal.deal_type] || { label: deal.deal_type, icon: '🤝', color: '#a855f7', route: null, desc: 'Deal resolved' };
              const payload = deal.payload || {};
              const hasRoute = cfg.route && ['FEATURE_SWAP', 'REMIX_PERMISSION', 'TOURING_INVITE', 'SYNC_PITCH', 'BRAND_SCOUT_MEETING'].includes(deal.deal_type);
              return (
                <div key={deal.id} style={{ marginBottom: i < backstageDeals.length - 1 ? 12 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 20, lineHeight: 1 }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{cfg.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
                        {payload.original_payload?.reason || cfg.desc}
                      </div>
                    </div>
                    {hasRoute && (
                      <button
                        onClick={() => navigate(createPageUrl(cfg.route))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          fontSize: 10,
                          fontWeight: 700,
                          color: cfg.color,
                          background: `${cfg.color}18`,
                          border: `1px solid ${cfg.color}35`,
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        Go <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                  {payload.original_payload?.details && (
                    <div style={{ marginTop: 6, marginLeft: 30, fontSize: 10, color: 'rgba(255,255,255,.35)', fontStyle: 'italic' }}>
                      {payload.original_payload.details}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ margin: '18px 18px 0' }}>
        <button
          onClick={onDismiss}
          style={{
            width: '100%',
            border: '1px solid rgba(168,85,247,.25)',
            background: 'rgba(168,85,247,.12)',
            color: '#d8b4fe',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Done with recap
        </button>
      </div>
    </div>
  );
}
