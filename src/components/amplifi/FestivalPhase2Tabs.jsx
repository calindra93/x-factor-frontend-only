// src/components/amplifi/FestivalPhase2Tabs.jsx
// Amplifi Phase 2: Rivalry Tab + Backstage Tab
// Rendered inside AmplifiApp when player is in a LOCKED or LIVE festival lineup.

import React, { useState, useEffect, useCallback } from "react";
import { Handshake, Zap, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { invokeFestivalAction as invokeFestivalActionRequest } from "@/lib/invokeFestivalAction";

// ── Constants ────────────────────────────────────────────────────────────────

const SNIPE_ACTIONS = [
  { type: 'COUNTERPROGRAM_DROP', label: 'Counter-Program Drop', icon: '💿', cost: 3, desc: 'Drop content during their set to split crowd attention. Requires a recent release.' },
  { type: 'TIMELINE_FLOOD', label: 'Timeline Flood', icon: '📱', cost: 2, desc: 'Flood social feeds during their timeslot, reducing conversion.' },
  { type: 'RUMOR_SPARK', label: 'Rumor Spark', icon: '🔥', cost: 4, desc: 'Start a backstage rumor. Hits crowd heat, conversion, and credibility.' },
  { type: 'CLIP_HIJACK', label: 'Clip Hijack', icon: '🎬', cost: 5, desc: 'Redirect viral clips. Biases their moment cards toward negatives, yours toward positives.' },
  { type: 'PEACE_SIGNAL', label: 'Peace Signal', icon: '🕊️', cost: 1, desc: 'Activate a defensive shield. Absorbs 50% of incoming snipe effects, but slightly lowers your own crowd heat.' },
  { type: 'TRUCE_OFFER', label: 'Offer Truce', icon: '🤝', cost: 2, desc: 'Propose a truce. If accepted, neither side can snipe each other — and both get a small boost.' },
  { type: 'TRUCE_BETRAY', label: 'Betray Truce', icon: '🗡️', cost: 3, desc: 'Stab an active truce in the back for amplified snipe effects. Credibility hit if exposed.' },
];

const DEAL_TYPES = {
  FEATURE_SWAP:        { label: 'Feature Swap',        icon: '🎤', desc: 'Trade feature spots for mutual credibility and conversion boost.' },
  REMIX_PERMISSION:    { label: 'Remix Permission',     icon: '🔄', desc: 'Grant/receive remix rights for clout and credibility.' },
  BRAND_SCOUT_MEETING: { label: 'Brand Scout Meeting',  icon: '💼', desc: 'A brand scout wants a meeting. Extra brand deal opportunities.' },
  STAGE_GUEST_SURPRISE:{ label: 'Stage Guest Surprise', icon: '🎉', desc: 'Bring a surprise guest on stage. Biases moment cards toward crowd favorites.' },
  TOURING_INVITE:      { label: 'Touring Invite',       icon: '🚌', desc: 'Invite an artist on your upcoming tour for mutual clout and brand tokens.' },
  SYNC_PITCH:          { label: 'Sync Pitch',           icon: '🎵', desc: 'Pitch a song for a sync license deal. Credibility boost for both parties.' },
};

const PLAYER_INITIABLE_DEALS = ['TOURING_INVITE', 'SYNC_PITCH'];
const PLAYER_DEAL_CONFIG = {
  TOURING_INVITE:   { label: 'Touring Invite',    icon: '🚌', desc: 'Invite them on your upcoming tour for mutual clout.' },
  SYNC_PITCH:       { label: 'Sync Pitch',        icon: '🎵', desc: 'Pitch a song together for credibility boost.' },
};

const TRUCE_STATUS_LABEL = {
  PENDING: 'Awaiting Response',
  ACTIVE: 'Active Truce',
  BETRAYED_BY_OFFERER: 'Betrayed',
  BETRAYED_BY_TARGET: 'Betrayed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};
const TRUCE_STATUS_COLOR = {
  PENDING: '#f59e0b',
  ACTIVE: '#10b981',
  BETRAYED_BY_OFFERER: '#ef4444',
  BETRAYED_BY_TARGET: '#ef4444',
  REJECTED: '#6b7280',
  EXPIRED: '#4b5563',
};

const STATUS_COLORS = {
  STAGED: '#6366f1',
  RESOLVED: '#10b981',
  REJECTED: '#ef4444',
  OFFERED: '#f59e0b',
  ACCEPTED: '#6366f1',
  DECLINED: '#6b7280',
  EXPIRED: '#4b5563',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function invokeFestivalAction(subAction, params) {
  return await invokeFestivalActionRequest(subAction, params);
}

// ── Rivalry Tab ──────────────────────────────────────────────────────────────

export function RivalryTab({ profile, festivalInstanceId, lineupArtists, activeDayIndex }) {
  const [influence, setInfluence] = useState(null);
  const [actions, setActions] = useState([]);
  const [truces, setTruces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [expandedAction, setExpandedAction] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [showTruces, setShowTruces] = useState(false);
  const [respondingTruce, setRespondingTruce] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [infRes, actRes, truceRes] = await Promise.all([
        invokeFestivalAction('influence', {}),
        invokeFestivalAction('myRivalActions', { festivalInstanceId }),
        invokeFestivalAction('getTruces', { festivalInstanceId }),
      ]);
      setInfluence(infRes?.influence_points ?? 8);
      setActions(actRes?.actions || []);
      setTruces(truceRes?.truces || []);
    } catch (e) {
      console.error('[Rivalry] load error', e);
    } finally {
      setLoading(false);
    }
  }, [festivalInstanceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStageSnipe = async () => {
    if (!selectedTarget || !selectedType || !activeDayIndex) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await invokeFestivalAction('stageSnipe', {
        festivalInstanceId,
        targetArtistId: selectedTarget,
        actionType: selectedType,
        dayIndex: activeDayIndex,
      });
      setSelectedTarget(null);
      setSelectedType(null);
      loadData();
    } catch (e) {
      setError(e?.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespondToTruce = async (truceId, accept) => {
    try {
      setRespondingTruce(truceId);
      setError(null);
      await invokeFestivalAction('respondToTruce', { truceId, accept });
      loadData();
    } catch (e) {
      setError(e?.message || 'Network error');
    } finally {
      setRespondingTruce(null);
    }
  };

  const rivals = (lineupArtists || []).filter((a) => a.id !== profile?.id);
  const myLineupEntry = (lineupArtists || []).find((a) => a.id === profile?.id);
  const secretStageUnlocked = !!myLineupEntry?.secret_stage_unlocked;
  const snipeConfig = selectedType ? SNIPE_ACTIONS.find((s) => s.type === selectedType) : null;
  const canSubmit = selectedTarget && selectedType && activeDayIndex && influence >= (snipeConfig?.cost || 0);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,.3)' }}>
        <Loader2 size={20} style={{ margin: '0 auto 8px', display: 'block', animation: 'spin 1s linear infinite' }} />
        Loading rivalry data…
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 18px', paddingBottom: 40 }}>
      {/* Influence bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} color="#a855f7" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#d8b4fe' }}>Influence</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (influence / 15) * 100)}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#a855f7,#ec4899)' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#a855f7' }}>{Math.floor(influence || 0)}/15</span>
        </div>
      </div>

      {secretStageUnlocked && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(168,85,247,.12)',
          border: '1px solid rgba(168,85,247,.28)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: 1 }}>
            Secret Stage Unlocked
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
            Your `PATRON_SIGNAL` access is live. If your credibility clears the festival threshold, your performance rewards get amplified.
          </div>
        </div>
      )}

      {/* Stage a snipe */}
      {activeDayIndex && (
        <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Stage a Move · Day {activeDayIndex}
          </div>

          {/* Target selector */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>Target</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {rivals.map((artist) => (
              <button
                key={artist.id}
                onClick={() => setSelectedTarget(artist.id)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedTarget === artist.id ? 'rgba(168,85,247,.2)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${selectedTarget === artist.id ? '#a855f7' : 'rgba(255,255,255,.1)'}`,
                  color: selectedTarget === artist.id ? '#d8b4fe' : 'rgba(255,255,255,.6)',
                }}
              >
                {artist.artist_name || artist.name || 'Artist'}
              </button>
            ))}
            {rivals.length === 0 && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>No other artists in lineup</span>
            )}
          </div>

          {/* Action type selector */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>Action</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {SNIPE_ACTIONS.map((action) => {
              const isSelected = selectedType === action.type;
              const canAfford = influence >= action.cost;
              return (
                <button
                  key={action.type}
                  onClick={() => canAfford && setSelectedType(action.type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                    background: isSelected ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${isSelected ? '#a855f7' : 'rgba(255,255,255,.07)'}`,
                    cursor: canAfford ? 'pointer' : 'not-allowed', opacity: canAfford ? 1 : 0.4,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{action.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#d8b4fe' : '#fff' }}>{action.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{action.desc}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: canAfford ? '#a855f7' : '#ef4444', whiteSpace: 'nowrap' }}>
                    {action.cost} <Zap size={10} style={{ verticalAlign: 'middle' }} />
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStageSnipe}
            disabled={!canSubmit || submitting}
            className="amp-primary-btn"
            style={{ fontSize: 13 }}
          >
            {submitting ? 'Staging…' : selectedType === 'PEACE_SIGNAL' ? '🕊️ Activate Peace Signal' : '⚔️ Stage Move'}
          </button>
        </div>
      )}

      {!activeDayIndex && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
          No active festival day to target. Snipes can only be staged before a day resolves.
        </div>
      )}

      {/* Action history */}
      {actions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>
            Your Actions
          </div>
          {actions.map((action) => {
            const config = SNIPE_ACTIONS.find((s) => s.type === action.action_type);
            const isExpanded = expandedAction === action.id;
            const isAttacker = action.attacker_artist_id === profile?.id;
            return (
              <div
                key={action.id}
                onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                style={{
                  background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: 12, padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{config?.icon || '⚔️'}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        {isAttacker ? `You → ${action.target?.artist_name || 'target'}` : `${action.attacker?.artist_name || 'Rival'} → You`}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>
                        {config?.label || action.action_type} · Day {action.applies_to_day_index}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: `${STATUS_COLORS[action.status] || '#6b7280'}22`,
                      color: STATUS_COLORS[action.status] || '#6b7280',
                    }}>
                      {action.status}
                    </span>
                    {isExpanded ? <ChevronUp size={12} color="rgba(255,255,255,.3)" /> : <ChevronDown size={12} color="rgba(255,255,255,.3)" />}
                  </div>
                </div>
                {isExpanded && action.resolved_effects && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.05)', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                    <div>Crowd Heat: {((action.resolved_effects.crowd_heat_mod || 0) * 100).toFixed(1)}%</div>
                    <div>Conversion: {((action.resolved_effects.conversion_mod || 0) * 100).toFixed(1)}%</div>
                    <div>Credibility: {((action.resolved_effects.credibility_mod || 0) * 100).toFixed(1)}%</div>
                    {action.resolved_effects.rng_roll != null && (
                      <div style={{ color: 'rgba(255,255,255,.3)', marginTop: 2 }}>RNG: {(action.resolved_effects.rng_roll * 100).toFixed(0)}% roll</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Truces section */}
      {truces.length > 0 && (
        <div>
          <button
            onClick={() => setShowTruces((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8 }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)' }}>
              Truces ({truces.length})
            </span>
            {showTruces ? <ChevronUp size={13} color="rgba(255,255,255,.3)" /> : <ChevronDown size={13} color="rgba(255,255,255,.3)" />}
          </button>
          {showTruces && truces.map((truce) => {
            const isOfferer = truce.offerer_id === profile?.id;
            const other = isOfferer ? truce.target : truce.offerer;
            const otherName = other?.artist_name || (isOfferer ? 'the target' : 'the offerer');
            const statusColor = TRUCE_STATUS_COLOR[truce.status] || '#6b7280';
            const canRespond = !isOfferer && truce.status === 'PENDING';
            const isResponding = respondingTruce === truce.id;
            return (
              <div key={truce.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${statusColor}30`, borderRadius: 12, padding: '10px 12px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {isOfferer ? `You offered truce to ${otherName}` : `${otherName} offered you a truce`}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>
                      {truce.status === 'ACTIVE' ? '🤝 Neither side can snipe — both receive a performance boost' :
                       truce.status === 'PENDING' ? '⏳ Awaiting response from the other side' :
                       truce.status.includes('BETRAY') ? '🗡️ The truce was broken' : TRUCE_STATUS_LABEL[truce.status]}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${statusColor}22`, color: statusColor }}>
                    {TRUCE_STATUS_LABEL[truce.status] || truce.status}
                  </span>
                </div>
                {canRespond && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => handleRespondToTruce(truce.id, true)}
                      disabled={isResponding}
                      style={{
                        flex: 1, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg,#10b981,#34d399)', color: '#fff',
                        fontSize: 12, fontWeight: 700, opacity: isResponding ? 0.5 : 1,
                      }}
                    >
                      {isResponding ? '…' : '✓ Accept'}
                    </button>
                    <button
                      onClick={() => handleRespondToTruce(truce.id, false)}
                      disabled={isResponding}
                      style={{
                        flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                        color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 700,
                        opacity: isResponding ? 0.5 : 1,
                      }}
                    >
                      {isResponding ? '…' : '✗ Decline'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Backstage Tab ────────────────────────────────────────────────────────────

export function BackstageTab({ profile, festivalInstanceId, lineupArtists = [] }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(null);
  const [showInitiate, setShowInitiate] = useState(false);
  const [initTarget, setInitTarget] = useState(null);
  const [initType, setInitType] = useState(null);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState(null);

  const loadOffers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await invokeFestivalAction('myBackstageOffers', { festivalInstanceId });
      setOffers(res?.offers || []);
    } catch (e) {
      console.error('[Backstage] load error', e);
    } finally {
      setLoading(false);
    }
  }, [festivalInstanceId]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  const handleRespond = async (offerId, accept) => {
    try {
      setResponding(offerId);
      const res = await invokeFestivalAction('respondOffer', { offerId, accept });
      if (!res?.success) {
        console.error('[Backstage] respond error:', res?.error);
      }
      loadOffers();
    } catch (e) {
      console.error('[Backstage] respond error', e);
    } finally {
      setResponding(null);
    }
  };

  const handleInitiateDeal = async () => {
    if (!initTarget || !initType) return;
    setInitiating(true);
    setInitError(null);
    try {
      const res = await invokeFestivalAction('initiateBackstageDeal', {
        festivalInstanceId,
        targetArtistId: initTarget,
        offerType: initType,
      });
      if (!res?.success) {
        setInitError(res?.error || 'Failed to initiate deal');
        return;
      }
      setShowInitiate(false);
      setInitTarget(null);
      setInitType(null);
      loadOffers();
    } catch (e) {
      setInitError(e?.message || 'Network error');
    } finally {
      setInitiating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,.3)' }}>
        <Loader2 size={20} style={{ margin: '0 auto 8px', display: 'block', animation: 'spin 1s linear infinite' }} />
        Loading backstage offers…
      </div>
    );
  }

  const pendingOffers = offers.filter((o) => o.status === 'OFFERED');
  const resolvedOffers = offers.filter((o) => o.status !== 'OFFERED');

  return (
    <div style={{ padding: '16px 18px', paddingBottom: 40 }}>
      {/* Pending offers */}
      {pendingOffers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 10 }}>
            Pending Offers
          </div>
          {pendingOffers.map((offer) => {
            const dealConfig = DEAL_TYPES[offer.offer_type] || {};
            const isFrom = offer.from_artist_id === profile?.id;
            const fromName = offer.from_artist?.artist_name || (offer.from_artist_id ? 'Another artist' : 'Brand Scout');
            const isResponding = responding === offer.id;

            return (
              <div
                key={offer.id}
                style={{
                  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(168,85,247,.15)',
                  borderRadius: 14, padding: 14, marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{dealConfig.icon || '🤝'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{dealConfig.label || offer.offer_type}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                      {isFrom ? 'Your offer to another artist' : `From: ${fromName}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>
                      {offer.payload?.reason || dealConfig.desc || 'A backstage opportunity.'}
                    </div>
                  </div>
                </div>

                {!isFrom && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => handleRespond(offer.id, true)}
                      disabled={isResponding}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff',
                        fontSize: 12, fontWeight: 700, opacity: isResponding ? 0.5 : 1,
                      }}
                    >
                      {isResponding ? '…' : '✓ Accept'}
                    </button>
                    <button
                      onClick={() => handleRespond(offer.id, false)}
                      disabled={isResponding}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                        color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 700,
                        opacity: isResponding ? 0.5 : 1,
                      }}
                    >
                      ✗ Decline
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved/past offers */}
      {resolvedOffers.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 10 }}>
            Deal History
          </div>
          {resolvedOffers.map((offer) => {
            const dealConfig = DEAL_TYPES[offer.offer_type] || {};
            const fromName = offer.from_artist?.artist_name || (offer.from_artist_id ? 'Another artist' : 'Brand Scout');
            return (
              <div
                key={offer.id}
                style={{
                  background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)',
                  borderRadius: 12, padding: '10px 12px', marginBottom: 6,
                  opacity: offer.status === 'EXPIRED' || offer.status === 'DECLINED' ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{dealConfig.icon || '🤝'}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{dealConfig.label || offer.offer_type}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{fromName}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: `${STATUS_COLORS[offer.status] || '#6b7280'}22`,
                    color: STATUS_COLORS[offer.status] || '#6b7280',
                  }}>
                    {offer.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {offers.length === 0 && !showInitiate && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
          <Handshake size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
          No backstage offers yet.<br />
          Perform well to attract scouts and collaborators.
        </div>
      )}

      {/* Initiate Deal CTA */}
      {!showInitiate && lineupArtists.filter((a) => a.id !== profile?.id).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowInitiate(true)}
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.3)',
              color: '#d8b4fe', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Handshake size={15} />
            Initiate Backstage Deal
          </button>
        </div>
      )}

      {/* Initiate Deal panel */}
      {showInitiate && (
        <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 14, padding: 14, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Initiate a Deal
          </div>

          {/* Target artist */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>Target Artist</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {lineupArtists.filter((a) => a.id !== profile?.id).map((artist) => (
              <button
                key={artist.id}
                onClick={() => setInitTarget(artist.id)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: initTarget === artist.id ? 'rgba(168,85,247,.2)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${initTarget === artist.id ? '#a855f7' : 'rgba(255,255,255,.1)'}`,
                  color: initTarget === artist.id ? '#d8b4fe' : 'rgba(255,255,255,.6)',
                }}
              >
                {artist.artist_name || artist.name || 'Artist'}
              </button>
            ))}
          </div>

          {/* Deal type */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>Deal Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {PLAYER_INITIABLE_DEALS.map((type) => {
              const cfg = PLAYER_DEAL_CONFIG[type];
              const isSelected = initType === type;
              return (
                <button
                  key={type}
                  onClick={() => setInitType(type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                    background: isSelected ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${isSelected ? '#a855f7' : 'rgba(255,255,255,.07)'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#d8b4fe' : '#fff' }}>{cfg.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{cfg.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {initError && (
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>
              {initError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setShowInitiate(false); setInitTarget(null); setInitType(null); setInitError(null); }}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 700,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleInitiateDeal}
              disabled={!initTarget || !initType || initiating}
              style={{
                flex: 2, padding: '10px', borderRadius: 10, border: 'none', cursor: !initTarget || !initType ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff',
                fontSize: 12, fontWeight: 700, opacity: (!initTarget || !initType) ? 0.4 : 1,
              }}
            >
              {initiating ? '…' : '🤝 Send Offer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
