import React, { useState } from "react";
import { X } from "lucide-react";
import { LANE_ORDER, LANE_LABEL, LANE_SET_MIN, oddsLabel } from "./amplifiConstants";
import { invokeFestivalAction } from "@/lib/invokeFestivalAction";

function FestivalSubmit({ instance, festival, profile, currentTurn, onClose, onSuccess }) {
  const lanes = festival.lanes || {};
  const [selectedLane, setSelectedLane] = useState(null);
  const [posture, setPosture] = useState('CLEAN');
  const [rehearsal, setRehearsal] = useState(50);
  const [visuals, setVisuals] = useState(50);
  const [wristbandOptedIn, setWristbandOptedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const odds = oddsLabel(profile, selectedLane, lanes, festival.genre_weights);

  async function handleSubmit() {
    if (!selectedLane || odds.label === 'INELIGIBLE') return;
    setSubmitting(true);
    setError(null);
    try {
      const setLen = LANE_SET_MIN[selectedLane] || 30;
      await invokeFestivalAction('submitEntry', {
        festivalInstanceId: instance.id,
        desired_lane: selectedLane,
        rehearsal_investment: rehearsal,
        visuals_budget: visuals,
        posture,
        wristband_opted_in: wristbandOptedIn,
        set_length: setLen,
      });
      onSuccess();
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="amp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="amp-modal-sheet">
        <div className="amp-modal-header">
          <span className="amp-modal-title">Apply — {festival.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '16px 20px 32px' }}>

          {/* Lane selection */}
          <div className="amp-input-group">
            <div className="amp-input-label">Choose Lane</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {LANE_ORDER.filter(l => lanes[l]).map((laneKey) => {
                const o = oddsLabel(profile, laneKey, lanes, festival.genre_weights);
                const inelig = o.label === 'INELIGIBLE';
                return (
                  <button
                    key={laneKey}
                    className={`amp-lane-btn${selectedLane === laneKey ? ' selected' : ''}${inelig ? ' ineligible' : ''}`}
                    onClick={() => !inelig && setSelectedLane(laneKey)}
                    disabled={inelig}
                  >
                    {LANE_LABEL[laneKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedLane && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,.04)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Your odds</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: odds.color }}>{odds.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 3 }}>
                Set length: {LANE_SET_MIN[selectedLane]}min · {lanes[selectedLane]?.slots} slots
              </div>
            </div>
          )}

          {/* Posture */}
          <div className="amp-input-group">
            <div className="amp-input-label">Performance Posture</div>
            <div style={{ display: 'flex' }}>
              {['CLEAN', 'EDGY', 'CHAOTIC'].map((p) => (
                <button
                  key={p}
                  className={`amp-posture-btn${posture === p ? ' selected' : ''}`}
                  onClick={() => setPosture(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
              {posture === 'CLEAN' ? 'Safe, polished, brand-friendly.' :
               posture === 'EDGY' ? 'Takes risks, more memorable.' :
               'Unpredictable, high ceiling, higher variance.'}
            </div>
          </div>

          {/* Rehearsal slider */}
          <div className="amp-input-group">
            <div className="amp-input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rehearsal Investment</span>
              <span style={{ color: '#d8b4fe' }}>{rehearsal}%</span>
            </div>
            <input type="range" min="0" max="100" value={rehearsal}
              onChange={(e) => setRehearsal(Number(e.target.value))}
              className="amp-slider" style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>
              <span>Wing it</span><span>Full prep</span>
            </div>
          </div>

          {/* Visuals slider */}
          <div className="amp-input-group">
            <div className="amp-input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Visuals Budget</span>
              <span style={{ color: '#d8b4fe' }}>{visuals}%</span>
            </div>
            <input type="range" min="0" max="100" value={visuals}
              onChange={(e) => setVisuals(Number(e.target.value))}
              className="amp-slider" style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>
              <span>Bare stage</span><span>Full production</span>
            </div>
          </div>

          {festival.wristband_economy && (
            <div className="amp-input-group">
              <div className="amp-input-label">Wristband Payout Program</div>
              <button
                type="button"
                onClick={() => setWristbandOptedIn((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${wristbandOptedIn ? 'rgba(16,185,129,.35)' : 'rgba(255,255,255,.08)'}`,
                  background: wristbandOptedIn ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: wristbandOptedIn ? '#10b981' : '#fff' }}>
                    {wristbandOptedIn ? 'Opted into wristband payouts' : 'Opted out of wristband payouts'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 3 }}>
                    Join the festival wristband program to qualify for crowd-threshold bonus payouts.
                  </div>
                </div>
                <div style={{
                  width: 40,
                  height: 22,
                  borderRadius: 999,
                  background: wristbandOptedIn ? '#10b981' : 'rgba(255,255,255,.14)',
                  padding: 3,
                  display: 'flex',
                  justifyContent: wristbandOptedIn ? 'flex-end' : 'flex-start',
                  transition: 'all .15s ease',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff' }} />
                </div>
              </button>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#ef4444' }}>
              {error}
            </div>
          )}

          <button
            className="amp-primary-btn"
            onClick={handleSubmit}
            disabled={!selectedLane || odds.label === 'INELIGIBLE' || submitting}
          >
            {submitting ? 'Submitting\u2026' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FestivalSubmit;
