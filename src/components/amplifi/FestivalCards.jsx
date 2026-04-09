import React from "react";
import { ChevronRight, CheckCircle, Lock } from "lucide-react";
import {
  STATUS_LABEL, STATUS_COLOR, SUBMISSION_STATUS_LABEL, REGION_FLAG,
  LANE_ORDER, LANE_LABEL, REGION_GRADIENT,
  stageIdx, normalizeGenreWeight, festivalGenreFitLabel, getFestivalImageUrl,
} from "./amplifiConstants";

export function FestivalCard({ instance, festival, profile, mySubmission, lineupSlot, onClick }) {
  const status = instance.status;
  const statusColor = STATUS_COLOR[status] || '#6b7280';
  const flag = REGION_FLAG[festival.region] || '\u{1F310}';
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=520&fit=crop');
  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const lanes = festival.lanes || {};
  const eligibleLaneCount = LANE_ORDER.filter((laneKey) => {
    const cfg = lanes[laneKey];
    if (!cfg) return false;
    const fans = Number(profile?.fans ?? profile?.followers ?? 0);
    const clout = Number(profile?.clout ?? 0);
    const stage = stageIdx(profile?.career_stage || 'Unknown');
    return stage >= (cfg.min_stage_idx || 0)
      && fans >= (cfg.min_fans || 0)
      && clout >= (cfg.min_clout || 0);
  }).length;
  const laneLabel = mySubmission
    ? LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane
    : null;
  const subStatus = mySubmission ? SUBMISSION_STATUS_LABEL[mySubmission.status] || mySubmission.status : null;
  const isRejected = mySubmission?.status === 'REJECTED';
  const isSelected = mySubmission?.status === 'SELECTED';
  const isLive = status === 'LIVE';
  const selectionOdds = lineupSlot?.selection_weight;
  const topGenre = Object.entries(festival.genre_weights || {}).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="amp-card" onClick={onClick}>
      <div className="amp-poster-frame" style={{ position: 'relative', minHeight: 230, overflow: 'hidden' }}>
        <img
          src={imageUrl}
          alt={festival.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="amp-vignette" />
        <div className="amp-spotlight" />
        <div className="amp-glow-orb" style={{ width: 140, height: 140, background: 'rgba(168,85,247,.32)', top: -36, right: -20 }} />
        <div className="amp-glow-orb" style={{ width: 110, height: 110, background: 'rgba(236,72,153,.24)', bottom: 18, left: -28 }} />
        <div className="amp-card-inner" style={{ position: 'relative', zIndex: 1, minHeight: 230, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className={`amp-lux-chip${isLive ? ' amp-live-chip' : ''}`} style={{ color: statusColor, borderColor: `${statusColor}55` }}>
                <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, marginRight: 0 }} />
                {STATUS_LABEL[status]}
              </span>
              <span className="amp-lux-chip">{flag} {festival.region}</span>
              {mySubmission && (
                <span className="amp-lux-chip" style={{
                  color: isSelected ? '#f0abfc' : isRejected ? '#f472b6' : '#d8b4fe',
                  borderColor: isSelected ? 'rgba(240,171,252,.38)' : isRejected ? 'rgba(244,114,182,.35)' : 'rgba(168,85,247,.35)',
                }}>
                  {subStatus}
                </span>
              )}
            </div>
            <ChevronRight size={16} color="rgba(255,255,255,.5)" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{flag}</span>
              <div style={{ minWidth: 0 }}>
                <div className="amp-title-glow" style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{festival.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)', marginTop: 4 }}>
                  {festival.brand_posture || 'Open format'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Your fit</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color }}>{fitInfo.label}</span>
                </div>
                <div className="amp-fit-meter">
                  <div className={`amp-fit-fill${myFit >= 0.8 ? ' hot' : ''}`} style={{ width: `${Math.max(8, Math.min(100, myFit * 100))}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Favored sound</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', marginTop: 3 }}>{topGenre?.[0] || 'Mixed'}</div>
              </div>
            </div>

            <div className="amp-stat-grid">
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Eligible lanes</div>
                <div className="amp-stat-value">{eligibleLaneCount}</div>
                <div className="amp-stat-subtle">of {Object.keys(lanes).length || 0}</div>
              </div>
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Festival run</div>
                <div className="amp-stat-value">{festival.day_count || instance.day_count || 1} days</div>
                <div className="amp-stat-subtle">multi-day impact</div>
              </div>
              <div className="amp-stat-pill">
                <div className="amp-stat-label">Specials</div>
                <div className="amp-stat-value">{(festival.has_secret_stage ? 1 : 0) + (festival.wristband_economy ? 1 : 0)}</div>
                <div className="amp-stat-subtle">bonus systems</div>
              </div>
            </div>

            {mySubmission && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {laneLabel && <span className="amp-lux-chip">Lane: {laneLabel}</span>}
                <span className="amp-lux-chip">Posture: {festival.brand_posture}</span>
                {isSelected && selectionOdds != null && (
                  <span className="amp-lux-chip" style={{ color: '#f0abfc', borderColor: 'rgba(240,171,252,.35)' }}>
                    Weight {Number(selectionOdds).toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {isRejected && mySubmission.ineligibility_reason && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.22)', fontSize: 10, color: 'rgba(255,220,220,.9)' }}>
                {mySubmission.ineligibility_reason}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturedCard({ festival, instance, profile, mySubmission, onClick }) {
  const status = instance?.status;
  const flag = REGION_FLAG[festival.region] || '\u{1F310}';
  const grad = REGION_GRADIENT[festival.region] || REGION_GRADIENT.US;
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&h=450&fit=crop');
  const statusLabel = status ? STATUS_LABEL[status] : null;
  const statusColor = status ? STATUS_COLOR[status] : null;
  const subStatus = mySubmission ? SUBMISSION_STATUS_LABEL[mySubmission.status] : null;
  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const isLive = status === 'LIVE';

  return (
    <div className="amp-feat-card" onClick={onClick}>
      <div className="amp-feat-bg" style={{ background: grad }}>
        <img
          src={imageUrl}
          alt={festival.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="amp-feat-overlay" />
        <div className="amp-vignette" />
        <div className="amp-spotlight" style={{ inset: '-18% auto auto 8%' }} />
        <div className="amp-glow-orb" style={{ width: 160, height: 160, background: 'rgba(168,85,247,.28)', top: -34, right: -24 }} />
        {statusLabel && (
          <span className={`amp-feat-status${isLive ? ' amp-live-chip' : ''}`} style={{ background: statusColor + '28', color: statusColor, border: `1px solid ${statusColor}40` }}>
            <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, width: 5, height: 5 }} />
            {statusLabel}
          </span>
        )}
        {!instance && (
          <span className="amp-feat-status" style={{ background: 'rgba(168,85,247,.2)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,.3)' }}>
            Featured
          </span>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="amp-kicker" style={{ marginBottom: 3 }}>{flag} {festival.region}</div>
          <div className="amp-title-glow" style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{festival.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.5px' }}>{festival.region}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="amp-lux-chip" style={{ color: fitInfo.color, borderColor: `${fitInfo.color}40` }}>{fitInfo.label}</span>
            <span className="amp-lux-chip">{festival.day_count || instance?.day_count || 1} days</span>
          </div>
        </div>
      </div>
      <div className="amp-feat-footer">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.72)', fontWeight: 700 }}>{festival.brand_posture}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', marginTop: 2 }}>
            {(festival.culture_identity || 'Festival identity TBD').slice(0, 46)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {festival.has_secret_stage && <span className="amp-lux-chip" style={{ padding: '4px 8px' }}>Secret</span>}
          {subStatus && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: mySubmission.status === 'SELECTED' ? 'rgba(236,72,153,.2)' : 'rgba(168,85,247,.2)',
              color: mySubmission.status === 'SELECTED' ? '#f0abfc' : '#d8b4fe' }}>
              {subStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MiniCard({ festival, instance, onClick }) {
  const flag = REGION_FLAG[festival.region] || '\u{1F310}';
  const imageUrl = getFestivalImageUrl(festival);
  const statusColor = instance ? STATUS_COLOR[instance.status] : '#a855f7';
  const isLive = instance?.status === 'LIVE';

  return (
    <div className="amp-mini-card" onClick={onClick}>
      <img
        src={imageUrl}
        alt={festival.name}
        className="amp-mini-card-image"
        style={{ position: 'relative' }}
      />
      <div className="amp-vignette" />
      <div style={{
        position: 'absolute',
        top: 6,
        right: 6,
        fontSize: '8px',
        fontWeight: '700',
        padding: '2px 5px',
        borderRadius: '4px',
        background: statusColor + '40',
        color: statusColor,
        border: `1px solid ${statusColor}60`,
      }} className={isLive ? ' amp-live-chip' : ''}>
        {instance ? STATUS_LABEL[instance.status] : 'Featured'}
      </div>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 1 }}>
        <span className="amp-kicker" style={{ color: 'rgba(255,255,255,.78)' }}>{flag} {festival.region}</span>
        {festival.has_secret_stage && <span className="amp-lux-chip" style={{ padding: '3px 7px', fontSize: 8 }}>Secret</span>}
      </div>
      <div className="amp-mini-card-content">
        <div className="amp-mini-card-name">{flag} {festival.name}</div>
        <div className="amp-mini-card-region">{festival.region}</div>
      </div>
    </div>
  );
}
