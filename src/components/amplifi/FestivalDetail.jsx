import { ArrowLeft, CheckCircle, Clock, Lock } from 'lucide-react';
import {
  STATUS_LABEL,
  STATUS_COLOR,
  SUBMISSION_STATUS_LABEL,
  REGION_FLAG,
  LANE_ORDER,
  LANE_LABEL,
  LANE_SET_MIN,
  stageIdx,
  normalizeGenreWeight,
  festivalGenreFitLabel,
  summarizeBookingPhilosophy,
  getFestivalImageUrl,
  oddsLabel,
} from './amplifiConstants';
import PhaseTimelinePanel from './PhaseTimelinePanel';
import { formatFestivalTurnDate, getFestivalEndTurn, getFestivalStartTurnFromInstance } from './festivalCalendar';
import { invokeFestivalAction } from '@/lib/invokeFestivalAction';

export default function FestivalDetail({ instance, festival, profile, mySubmission, mySetlist, myResults, onClose, onSubmit, onSetlist, onViewGreenRoom, onEditSubmission }) {
  const genres = Object.entries(festival.genre_weights || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 8);

  const myGenre = profile?.genre || '';
  const myFitRaw = festival.genre_weights?.[myGenre] ?? 0;
  const myFit = normalizeGenreWeight(myFitRaw);
  const fitInfo = festivalGenreFitLabel(myFit);
  const lanes = festival.lanes || {};
  const imageUrl = getFestivalImageUrl(festival, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=900&h=600&fit=crop');
  const statusColor = STATUS_COLOR[instance.status] || '#a855f7';
  const isLive = instance.status === 'LIVE';
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
  const topGenre = genres[0];
  const bookingSummary = summarizeBookingPhilosophy(festival.booking_philosophy);

  // Allow re-application if the player previously withdrew (GAP-05 fix)
  const canApply = instance.status === 'OPEN' && (!mySubmission || mySubmission?.status === 'WITHDRAWN');
  const isSelected = mySubmission?.status === 'SELECTED';
  const canSetlist = isSelected && !mySetlist?.locked && instance.status !== 'COMPLETE';
  const hasResults = (myResults?.length ?? 0) > 0;

  // Determine if we should show a condensed post-submission view
  const isPostSubmit = mySubmission && mySubmission.status !== 'WITHDRAWN';

  // ── SELECTED-phase: setlist creation / prep focused variant ──────────
  if (isSelected) {
    const startTurn = getFestivalStartTurnFromInstance(instance);
    const festStartStr = formatFestivalTurnDate(startTurn);
    const laneLabel = LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane;
    const setMin = LANE_SET_MIN[mySubmission.desired_lane] || 30;

    return (
      <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="amp-modal-sheet">
          <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={18} />
            </button>
            <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(16,185,129,.15)', color: '#10b981', border: '1px solid rgba(16,185,129,.3)' }}>
              SELECTED
            </span>
          </div>

          <div style={{ padding: '0 14px 16px' }}>
            {/* Compact identity banner */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px 14px', background: 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(168,85,247,.08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{REGION_FLAG[festival.region] || '🌐'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{festival.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{festival.region} · {festival.day_count || instance.day_count || 1} days</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>Your fit</div>
                </div>
              </div>

              {/* Your slot info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="amp-stat-pill" style={{ background: 'rgba(16,185,129,.08)' }}>
                  <div className="amp-stat-label">Your Lane</div>
                  <div className="amp-stat-value" style={{ fontSize: 12, color: '#10b981' }}>{laneLabel}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Set Length</div>
                  <div className="amp-stat-value" style={{ fontSize: 12 }}>{setMin}m</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Starts</div>
                  <div className="amp-stat-value" style={{ fontSize: 11 }}>{festStartStr || 'TBD'}</div>
                </div>
              </div>
            </div>

            {/* Phase Timeline */}
            <PhaseTimelinePanel instanceStatus={instance.status} mySubmission={mySubmission} />

            {/* Setlist Prep Section */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px' }}>
              <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>🎵 Setlist & Prep</div>

              {mySetlist?.locked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)' }}>
                  <CheckCircle size={14} color="#10b981" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>Setlist Locked</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>You're ready for the stage. Good luck!</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 10, lineHeight: 1.5 }}>
                    Build your setlist before the festival starts. Pick your best songs for a {setMin}-minute set in the <strong style={{ color: '#d8b4fe' }}>{laneLabel}</strong> lane.
                  </div>
                  {canSetlist && (
                    <button className="amp-primary-btn" onClick={onSetlist} style={{ fontSize: 13 }}>
                      🎤 Build Your Setlist
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Philosophy tags for context */}
            {(festival.aesthetic_tags?.length > 0 || festival.booking_philosophy) && (
              <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
                <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 6 }}>Festival Vibe</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginBottom: 8 }}>{bookingSummary}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(festival.aesthetic_tags || []).slice(0, 6).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.brand_posture && <span className="amp-tag" style={{ color: '#d8b4fe' }}>{festival.brand_posture}</span>}
                </div>
              </div>
            )}

            {/* Phase-specific CTA buttons for SELECTED state */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {/* View Green Room — available when festival is COMPLETE or LIVE with results */}
              {hasResults && (
                <button
                  className="amp-primary-btn"
                  onClick={() => { onClose(); onViewGreenRoom?.(); }}
                  style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  🎤 View Green Room
                </button>
              )}

              {/* Withdraw — allow player to withdraw even after selection, before festival goes LIVE */}
              {instance.status !== 'COMPLETE' && instance.status !== 'LIVE' && (
                <button
                  className="amp-outline-button"
                  onClick={async () => {
                    try {
                      await invokeFestivalAction('withdrawEntry', {
                        festivalInstanceId: instance.id,
                      });
                      onClose();
                    } catch (e) {
                      console.error('[Amplifi] withdraw error', e);
                    }
                  }}
                  style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,.2)', background: 'rgba(239,68,68,.06)' }}
                >
                  Withdraw from Festival
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Condensed post-submission view (SUBMITTED / ELIGIBLE / INELIGIBLE / REJECTED) ──
  if (isPostSubmit) {
    const subColor = {
      SUBMITTED: '#6366f1', ELIGIBLE: '#8b5cf6', INELIGIBLE: '#ef4444',
      REJECTED: '#f59e0b',
    }[mySubmission.status] || '#a855f7';
    const laneLabel = LANE_LABEL[mySubmission.desired_lane] || mySubmission.desired_lane;
    const startTurn = getFestivalStartTurnFromInstance(instance);
    const endTurn = getFestivalEndTurn(instance);
    const appsCloseStr = formatFestivalTurnDate(instance.applications_close_turn_id);
    const lineupLockStr = formatFestivalTurnDate(instance.lineup_lock_turn_id);
    const festStartStr = formatFestivalTurnDate(startTurn);
    const festEndStr = formatFestivalTurnDate(endTurn);

    return (
      <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="amp-modal-sheet">
          <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={18} />
            </button>
            <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${subColor}22`, color: subColor, border: `1px solid ${subColor}44` }}>
              {SUBMISSION_STATUS_LABEL[mySubmission.status] || mySubmission.status}
            </span>
          </div>

          <div style={{ padding: '0 14px 16px' }}>
            {/* Festival hero image at top of modal */}
            <div style={{
              width: '100%',
              height: 180,
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: 12,
              position: 'relative',
              background: 'linear-gradient(135deg,rgba(168,85,247,.3),rgba(236,72,153,.3))',
            }}>
              <img
                src={imageUrl}
                alt={festival.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="amp-vignette" />
            </div>

            {/* At-a-glance summary */}
            <div className="amp-section-card" style={{ marginBottom: 12, padding: '14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{REGION_FLAG[festival.region] || '🌐'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{festival.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{festival.region} · {festival.day_count || instance.day_count || 1} days</div>
                </div>
              </div>

              <div className="amp-stat-grid">
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Status</div>
                  <div className="amp-stat-value" style={{ fontSize: 11, color: STATUS_COLOR[instance.status] || '#a855f7' }}>
                    {STATUS_LABEL[instance.status]}
                  </div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Your Fit</div>
                  <div className="amp-stat-value" style={{ fontSize: 12, color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div className="amp-stat-subtle">{fitInfo.label}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Lane</div>
                  <div className="amp-stat-value" style={{ fontSize: 11 }}>{laneLabel}</div>
                </div>
              </div>

              {/* Description excerpt */}
              {festival.culture_identity && (
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', lineHeight: 1.5, margin: '10px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {festival.culture_identity}
                </p>
              )}

              {/* Tags row */}
              {(festival.aesthetic_tags?.length > 0 || festival.region_weather) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {festival.region_weather && (
                    <span className="amp-weather">
                      {festival.region_weather.condition === 'sunny' ? '☀️' :
                       festival.region_weather.condition === 'rainy' ? '🌧️' :
                       festival.region_weather.condition === 'windy' ? '💨' : '🌤️'}
                      {festival.region_weather.condition}
                    </span>
                  )}
                  {(festival.aesthetic_tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.brand_posture && <span className="amp-tag" style={{ color: '#d8b4fe' }}>{festival.brand_posture}</span>}
                </div>
              )}
            </div>

            {/* Key Dates compact */}
            {(() => {
              const hasAnyDate = appsCloseStr || lineupLockStr || festStartStr || festEndStr;
              if (!hasAnyDate) return null;
              return (
                <div className="amp-section-card" style={{ marginBottom: 12, padding: '10px 14px' }}>
                  <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 6 }}>Key Dates</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {appsCloseStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Apps Close</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f9a8d4' }}>{appsCloseStr}</div>
                      </div>
                    )}
                    {lineupLockStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Lineup Locks</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>{lineupLockStr}</div>
                      </div>
                    )}
                    {festStartStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Starts</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>{festStartStr}</div>
                      </div>
                    )}
                    {festEndStr && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 1 }}>Ends</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{festEndStr}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Phase Timeline */}
            <PhaseTimelinePanel instanceStatus={instance.status} mySubmission={mySubmission} />

            {/* Rejection reason if applicable */}
            {mySubmission.status === 'REJECTED' && mySubmission.ineligibility_reason && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', fontSize: 11, color: 'rgba(255,220,220,.85)' }}>
                ✕ {mySubmission.ineligibility_reason}
              </div>
            )}

            {/* Phase-specific CTA buttons for post-submission states */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Edit Submission — available when apps are still OPEN and player has SUBMITTED/ELIGIBLE status */}
              {(mySubmission.status === 'SUBMITTED' || mySubmission.status === 'ELIGIBLE') && instance.status === 'OPEN' && (
                <button
                  className="amp-primary-btn"
                  onClick={() => onEditSubmission ? onEditSubmission() : onSubmit?.()}
                  style={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  ✏️ Edit Submission
                </button>
              )}

              {/* View Green Room — available when festival is COMPLETE and results exist */}
              {hasResults && (
                <button
                  className="amp-primary-btn"
                  onClick={() => { onClose(); onViewGreenRoom?.(); }}
                  style={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
                >
                  🎤 View Green Room
                </button>
              )}

              {/* Withdraw CTA — allows player to free up the slot */}
              {(mySubmission.status === 'SUBMITTED' || mySubmission.status === 'ELIGIBLE') && instance.status !== 'COMPLETE' && (
                <button
                  className="amp-outline-button"
                  onClick={async () => {
                    try {
                      await invokeFestivalAction('withdrawEntry', {
                        festivalInstanceId: instance.id,
                      });
                      onClose();
                    } catch (e) {
                      console.error('[Amplifi] withdraw error', e);
                    }
                  }}
                  style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,.2)', background: 'rgba(239,68,68,.06)' }}
                >
                  Withdraw Application
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="amp-modal-sheet">
        {/* Compact header with back button and festival name */}
        <div className="amp-modal-header" style={{ padding: '16px 16px 12px', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} />
          </button>
          <span className="amp-modal-title" style={{ fontSize: 16, fontWeight: 800 }}>{festival.name}</span>
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          {/* Hero image + festival identity in one compact card */}
          <div className="amp-detail-card amp-poster-frame" style={{ marginBottom: 12 }}>
            {/* Large hero image */}
            <div style={{
              width: '100%',
              height: 220,
              background: 'linear-gradient(135deg,rgba(168,85,247,.3),rgba(236,72,153,.3))',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img
                src={imageUrl}
                alt={festival.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="amp-vignette" />
              <div className="amp-spotlight" style={{ inset: '-14% auto auto 4%', width: '78%' }} />
              <div className="amp-glow-orb" style={{ width: 180, height: 180, background: 'rgba(168,85,247,.26)', top: -46, right: -24 }} />
              <div className="amp-glow-orb" style={{ width: 130, height: 130, background: 'rgba(236,72,153,.22)', bottom: -30, left: -18 }} />
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span className={`amp-lux-chip${isLive ? ' amp-live-chip' : ''}`} style={{ color: statusColor, borderColor: `${statusColor}45` }}>
                  <span className={`amp-status-dot${isLive ? ' amp-live-dot' : ''}`} style={{ background: statusColor, marginRight: 0 }} />
                  {STATUS_LABEL[instance.status] || instance.status}
                </span>
                <span className="amp-lux-chip">{REGION_FLAG[festival.region] || '🌐'} {festival.region}</span>
                <span className="amp-lux-chip">{festival.day_count || instance.day_count || 1} days</span>
              </div>
              {/* Overlay with region & posture */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 100%)',
                padding: '12px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div className="amp-kicker" style={{ color: '#f5d0fe', marginBottom: 4 }}>
                    {festival.brand_posture || 'Festival brand'}
                  </div>
                  <div className="amp-title-glow" style={{ fontSize: 21, fontWeight: 900, color: '#fff', lineHeight: 1.05, maxWidth: 220 }}>{festival.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', marginTop: 6, maxWidth: 230 }}>{bookingSummary}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: fitInfo.color, marginBottom: 4 }}>{fitInfo.label}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Your sound</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.84)', marginTop: 3 }}>{myGenre || 'No genre'}</div>
                </div>
              </div>
            </div>

            {/* Brief description */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.62)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {festival.culture_identity}
              </p>
              {/* Aesthetic tags + weather badge */}
              {(festival.aesthetic_tags?.length > 0 || festival.region_weather) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, alignItems: 'center' }}>
                  {festival.region_weather && (
                    <span className="amp-weather">
                      {festival.region_weather.condition === 'sunny' ? '☀️' :
                       festival.region_weather.condition === 'rainy' ? '🌧️' :
                       festival.region_weather.condition === 'windy' ? '💨' : '🌤️'}
                      {festival.region_weather.condition}
                    </span>
                  )}
                  {(festival.aesthetic_tags || []).slice(0, 5).map((tag) => (
                    <span key={tag} className="amp-tag">#{tag}</span>
                  ))}
                  {festival.has_secret_stage && (
                    <span className="amp-tag" style={{ background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.25)', color: '#d8b4fe' }}>✦ secret stage</span>
                  )}
                  {festival.wristband_economy && (
                    <span className="amp-tag" style={{ background: 'rgba(236,72,153,.10)', border: '1px solid rgba(236,72,153,.24)', color: '#f9a8d4' }}>💗 wristband</span>
                  )}
                </div>
              )}

              <div className="amp-stat-grid" style={{ marginTop: 12 }}>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Your fit</div>
                  <div className="amp-stat-value" style={{ color: fitInfo.color }}>{Math.round(myFit * 100)}%</div>
                  <div className="amp-stat-subtle">{fitInfo.label}</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Eligible lanes</div>
                  <div className="amp-stat-value">{eligibleLaneCount}</div>
                  <div className="amp-stat-subtle">available now</div>
                </div>
                <div className="amp-stat-pill">
                  <div className="amp-stat-label">Top genre</div>
                  <div className="amp-stat-value">{topGenre?.[0] || 'Mixed'}</div>
                  <div className="amp-stat-subtle">{topGenre ? `${Math.round(normalizeGenreWeight(topGenre[1]) * 100)}% match` : 'open format'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="amp-section-card" style={{ marginBottom: 12 }}>
            <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>What players should know</div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Festival rewards</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>What this booking philosophy is likely to favor.</div>
              </div>
              <div className="amp-info-value" style={{ maxWidth: 180 }}>{bookingSummary}</div>
            </div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Best positioning</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>Strongest signal for applying with intent.</div>
              </div>
              <div className="amp-info-value">{topGenre?.[0] || 'Mixed'} + {festival.brand_posture || 'Flexible'}</div>
            </div>
            <div className="amp-info-row">
              <div>
                <div className="amp-info-key">Special upside</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.46)', marginTop: 3 }}>Bonus systems visible on this festival.</div>
              </div>
              <div className="amp-info-value">
                {festival.has_secret_stage || festival.wristband_economy
                  ? [festival.has_secret_stage ? 'Secret stage' : null, festival.wristband_economy ? 'Wristband payouts' : null].filter(Boolean).join(' · ')
                  : 'No visible bonus systems'}
              </div>
            </div>
          </div>

          {/* Genre Fit section with horizontal scroll */}
          <div className="amp-section-card" style={{ marginBottom: 12, paddingBottom: 4 }}>
            <div className="amp-section-label" style={{ paddingLeft: 14, marginBottom: 6 }}>Genre Fit</div>
            <div className="amp-genres-container">
              <div className="amp-genre-scroll">
                {genres.map(([genre, weight]) => (
                  <div key={genre} className="amp-genre-card" style={{
                    background: genre === myGenre ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.04)',
                    border: genre === myGenre ? '1px solid rgba(168,85,247,.3)' : '1px solid rgba(255,255,255,.08)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: genre === myGenre ? 700 : 600, color: genre === myGenre ? '#d8b4fe' : 'rgba(255,255,255,.7)' }}>
                      {genre}
                    </div>
                    <div style={{ fontSize: 9, color: genre === myGenre ? '#a855f7' : 'rgba(255,255,255,.4)', marginTop: 4 }}>{Math.round(normalizeGenreWeight(weight) * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lanes section with horizontal scroll */}
          <div className="amp-section-card" style={{ marginBottom: 12, paddingBottom: 4 }}>
            <div className="amp-section-label" style={{ paddingLeft: 14, marginBottom: 6 }}>Lanes</div>
            <div className="amp-lanes-container">
              <div className="amp-lanes-scroll">
                {LANE_ORDER.filter(l => lanes[l]).map((laneKey) => {
                  const cfg = lanes[laneKey];
                  const fans = Number(profile?.fans ?? profile?.followers ?? 0);
                  const meetsStage = stageIdx(profile?.career_stage || 'Unknown') >= (cfg.min_stage_idx || 0);
                  const meetsFans = fans >= (cfg.min_fans || 0);
                  const eligible = meetsStage && meetsFans;
                  return (
                    <div key={laneKey} className="amp-lane-card" style={{
                      background: eligible ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.04)',
                      border: eligible ? '1px solid rgba(236,72,153,.22)' : '1px solid rgba(255,255,255,.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                        {eligible ? <CheckCircle size={11} color="#f0abfc" /> : <Lock size={11} color="rgba(255,255,255,.25)" />}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: eligible ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                        {LANE_LABEL[laneKey]}
                      </div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>
                        {cfg.slots} slots
                      </div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)' }}>
                        {cfg.set_min}m set
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dates & Key Info Section — derived from turn IDs */}
          {(() => {
            const startTurn = getFestivalStartTurnFromInstance(instance);
            const endTurn = getFestivalEndTurn(instance);
            const appsOpenStr = formatFestivalTurnDate(instance.applications_open_turn_id);
            const appsCloseStr = formatFestivalTurnDate(instance.applications_close_turn_id);
            const lineupLockStr = formatFestivalTurnDate(instance.lineup_lock_turn_id);
            const festStartStr = formatFestivalTurnDate(startTurn);
            const festEndStr = formatFestivalTurnDate(endTurn);
            const hasAnyDate = appsOpenStr || appsCloseStr || lineupLockStr || festStartStr || festEndStr;
            return (
              <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
                <div className="amp-section-label" style={{ paddingLeft: 0, marginBottom: 8 }}>Key Dates</div>
                {!hasAnyDate && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>Dates will appear once scheduled.</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {appsOpenStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Apps Open</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{appsOpenStr}</div>
                    </div>
                  )}
                  {appsCloseStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Apps Close</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f9a8d4' }}>{appsCloseStr}</div>
                    </div>
                  )}
                  {lineupLockStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Lineup Locks</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc' }}>{lineupLockStr}</div>
                    </div>
                  )}
                  {festStartStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Festival Starts</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>{festStartStr}</div>
                    </div>
                  )}
                  {festEndStr && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Festival Ends</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#d8b4fe' }}>{festEndStr}</div>
                    </div>
                  )}
                  {instance.status && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>Status</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f0abfc' }}>
                        {STATUS_LABEL[instance.status] || instance.status}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Phase Timeline — compact status panel */}
          <PhaseTimelinePanel
            instanceStatus={instance.status}
            mySubmission={mySubmission}
          />

          {canApply && (
            <button className="amp-primary-btn" onClick={onSubmit} style={{ padding: 12, fontSize: 13 }}>
              Apply Now
            </button>
          )}
          {!canApply && !instance.id && !mySubmission && (
            <button className="amp-outline-button" disabled style={{ opacity: .35, padding: 12, fontSize: 13 }}>
              <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Not Open
            </button>
          )}
          {mySubmission && mySubmission.status !== 'SELECTED' && !hasResults && (
            <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
              Status: <strong style={{ color: '#d8b4fe' }}>{SUBMISSION_STATUS_LABEL[mySubmission.status]}</strong>
            </div>
          )}
          {canSetlist && (
            <button className="amp-primary-btn" onClick={onSetlist} style={{ marginTop: 10 }}>
              Build Setlist
            </button>
          )}
          {mySetlist?.locked && !hasResults && (
            <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
              <CheckCircle size={14} color="#10b981" style={{ display: 'inline', marginRight: 5 }} />
              Setlist locked — you're ready
            </div>
          )}
          {/* GAP-06 fix: Show a "View Festival Recap" CTA when results are available */}
          {hasResults && mySubmission?.status === 'SELECTED' && (
            <button
              className="amp-primary-btn"
              onClick={() => { onClose(); onViewGreenRoom?.(); }}
              style={{ marginTop: 10, background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
            >
              🎤 View Festival Recap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
