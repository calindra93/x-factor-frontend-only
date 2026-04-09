import React from "react";
import { STATUS_COLOR, SUBMISSION_STATUS_LABEL } from "./amplifiConstants";

export default function PhaseTimelinePanel({ instanceStatus, mySubmission }) {
  const PHASES = [
    { key: 'SCHEDULED', label: 'Scheduled', icon: '\u{1F4C5}' },
    { key: 'OPEN', label: 'Apps Open', icon: '\u{270F}\u{FE0F}' },
    { key: 'CLOSED', label: 'Reviewing', icon: '\u{1F50D}' },
    { key: 'LOCKED', label: 'Lineup Set', icon: '\u{1F512}' },
    { key: 'LIVE', label: 'Live', icon: '\u{1F534}' },
    { key: 'COMPLETE', label: 'Complete', icon: '\u{1F3C1}' },
  ];

  const currentIdx = PHASES.findIndex((p) => p.key === instanceStatus);
  const activeIdx = currentIdx >= 0 ? currentIdx : 0;

  const subStatus = mySubmission?.status;
  const nextHint = (() => {
    if (instanceStatus === 'COMPLETE') return 'Festival has ended \u2014 check your results.';
    if (instanceStatus === 'LIVE') {
      if (subStatus === 'SELECTED') return 'You\u2019re performing! Rock the stage.';
      return 'Festival is live \u2014 watch the action.';
    }
    if (instanceStatus === 'LOCKED') {
      if (subStatus === 'SELECTED') return 'You made the lineup! Prep your setlist.';
      if (subStatus === 'REJECTED') return 'Not selected this time \u2014 next season!';
      return 'Lineup is locked \u2014 awaiting festival start.';
    }
    if (instanceStatus === 'CLOSED') {
      if (subStatus === 'SUBMITTED' || subStatus === 'ELIGIBLE') return 'Your app is under review.';
      return 'Applications closed \u2014 lineup announcement next.';
    }
    if (instanceStatus === 'OPEN') {
      if (subStatus === 'SUBMITTED') return 'Applied! Sit tight until review.';
      return 'Applications are open \u2014 apply now!';
    }
    return 'Festival not open yet \u2014 stay tuned.';
  })();

  const subBadgeColor = {
    SUBMITTED: '#6366f1', ELIGIBLE: '#8b5cf6', INELIGIBLE: '#ef4444',
    SELECTED: '#10b981', REJECTED: '#f59e0b', WITHDRAWN: '#6b7280',
  }[subStatus] || null;

  return (
    <div className="amp-section-card" style={{ marginBottom: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="amp-section-label" style={{ paddingLeft: 0, margin: 0 }}>Phase Timeline</div>
        {subStatus && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${subBadgeColor}22`, color: subBadgeColor, border: `1px solid ${subBadgeColor}44`, letterSpacing: '.4px' }}>
            {SUBMISSION_STATUS_LABEL[subStatus] || subStatus}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
        {PHASES.map((phase, idx) => {
          const isPast = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          const dotColor = isCurrent ? (STATUS_COLOR[phase.key] || '#a855f7') : isPast ? 'rgba(168,85,247,.55)' : 'rgba(255,255,255,.12)';
          return (
            <React.Fragment key={phase.key}>
              {idx > 0 && (
                <div style={{ flex: 1, height: 2, background: isPast || isCurrent ? 'linear-gradient(90deg, rgba(168,85,247,.5), rgba(236,72,153,.4))' : 'rgba(255,255,255,.08)', borderRadius: 1 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36, flexShrink: 0 }}>
                <div style={{ width: isCurrent ? 22 : 14, height: isCurrent ? 22 : 14, borderRadius: '50%', background: dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isCurrent ? 10 : 7, transition: 'all .2s', boxShadow: isCurrent ? `0 0 12px ${dotColor}88` : 'none', border: isCurrent ? '2px solid rgba(255,255,255,.2)' : '1px solid transparent' }}>
                  {isCurrent ? phase.icon : isPast ? '\u2713' : ''}
                </div>
                <span style={{ fontSize: 8, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#fff' : isPast ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.2)', letterSpacing: '.3px', textAlign: 'center', lineHeight: 1.1, maxWidth: 48 }}>
                  {phase.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12 }}>{'\u{1F4A1}'}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.6)', lineHeight: 1.4 }}>
          {nextHint}
        </span>
      </div>
    </div>
  );
}
