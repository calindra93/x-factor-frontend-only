import React from "react";
import { ChevronRight, Trophy, Star, Handshake } from "lucide-react";
import { fmt } from "@/utils/numberFormat";
import { REGION_FLAG, LANE_LABEL } from "./amplifiConstants";
import { formatFestivalHistoryTiming, sortFestivalHistoryRecords } from "./festivalHistoryPresentation";

function FestivalHistoryTab({ records }) {
  const [expanded, setExpanded] = React.useState(null);
  const sortedRecords = sortFestivalHistoryRecords(records);

  if (!sortedRecords.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
        <Trophy size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
        No festival history yet.<br />Complete a festival to see your performance record here.
      </div>
    );
  }

  // Career aggregate stats
  const totalShows = sortedRecords.length;
  const totalFollowers = sortedRecords.reduce((s, r) => s + (r.follower_gain || 0), 0);
  const totalClout = sortedRecords.reduce((s, r) => s + (r.clout_gained || 0), 0);
  const avgHeat = sortedRecords.length ? (sortedRecords.reduce((s, r) => s + Number(r.crowd_heat || 0), 0) / sortedRecords.length).toFixed(1) : '0';
  const bestMoment = sortedRecords.find((r) => r.moment_card?.type);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Career stats banner */}
      <div style={{ margin: '16px 18px 0', padding: '14px 16px', background: 'linear-gradient(135deg,rgba(168,85,247,.15),rgba(236,72,153,.1))', border: '1px solid rgba(168,85,247,.2)', borderRadius: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>Festival Career</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#d8b4fe' }}>{totalShows}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Shows</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{fmt(totalFollowers)}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>New Fans</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>+{totalClout}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Clout</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{avgHeat}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Avg Heat</div>
          </div>
        </div>
        {bestMoment && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
            <Star size={10} color="#f59e0b" style={{ display: 'inline', marginRight: 4 }} />
            Best moment: <span style={{ color: '#fcd34d', fontWeight: 700 }}>{bestMoment.moment_card.label || bestMoment.moment_card.type}</span>
          </div>
        )}
      </div>

      {/* Per-festival records */}
      <div className="amp-section" style={{ marginTop: 16 }}>
        <div className="amp-section-label">Past Performances</div>
        {sortedRecords.map((rec) => {
          const fest = rec.festival_instance?.festival;
          const festName = fest?.name || 'Festival';
          const region = fest?.region || '';
          const flag = REGION_FLAG[region] || '\u{1F310}';
          const isOpen = expanded === rec.id;
          // BUG 2 FIX: crowd_heat is already 0-100 scale, don't multiply by 10
          const heatPct = Math.min(100, Math.round(Number(rec.crowd_heat || 0)));
          const lane = rec.lane || rec.desired_lane || '\u2014';

          return (
            <div key={rec.id} className="amp-card" onClick={() => setExpanded(isOpen ? null : rec.id)}>
              <div className="amp-card-inner">
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 15 }}>{flag}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{festName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                      {LANE_LABEL[lane] || lane} · {formatFestivalHistoryTiming(rec)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {rec.moment_card?.type && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(252,211,77,.15)', color: '#fcd34d', border: '1px solid rgba(252,211,77,.2)' }}>
                        ✦ {rec.moment_card.label || rec.moment_card.type}
                      </span>
                    )}
                    <ChevronRight size={14} color="rgba(255,255,255,.3)" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </div>
                </div>

                {/* Compact heat bar */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 3 }}>
                    <span>Crowd Heat</span>
                    <span style={{ color: heatPct >= 70 ? '#10b981' : heatPct >= 40 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{Number(rec.crowd_heat || 0).toFixed(1)}</span>
                  </div>
                  <div className="amp-axis-bar">
                    <div className="amp-axis-fill" style={{ width: `${heatPct}%`, background: heatPct >= 70 ? '#10b981' : heatPct >= 40 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>New Fans</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>+{fmt(rec.follower_gain || 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Clout Gained</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>+{rec.clout_gained || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Credibility</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>{Number(rec.credibility || 0).toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Conversion</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{Number(rec.conversion || 0).toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Brand Interest</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ec4899' }}>+{rec.brand_interest_gain || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Rehearsal</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>{rec.energy_spent || 0}%</div>
                    </div>
                    {rec.hype_gained > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Hype Earned</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>+{rec.hype_gained}</div>
                      </div>
                    )}
                    {rec.payout_earned > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Earnings</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>${fmt(rec.payout_earned)}</div>
                      </div>
                    )}
                    {rec.metadata?.submission_posture && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 2 }}>Performance Style</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{rec.metadata.submission_posture}</div>
                      </div>
                    )}
                    {/* Approach C: Backstage Follow-Through artifacts */}
                    {rec.metadata?.backstage_follow_through?.length > 0 && (
                      <div style={{ gridColumn: '1 / -1', marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Handshake size={10} style={{ opacity: 0.6 }} />
                          Backstage Outcomes
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {rec.metadata.backstage_follow_through.map((item, idx) => {
                            const DEAL_LABELS = {
                              FEATURE_SWAP: { icon: '\u{1F3A4}', label: 'Feature Swap' },
                              REMIX_PERMISSION: { icon: '\u{1F504}', label: 'Remix Permission' },
                              TOURING_INVITE: { icon: '\u{1F68C}', label: 'Tour Invite' },
                              SYNC_PITCH: { icon: '\u{1F3AC}', label: 'Sync Pitch Lead' },
                              BRAND_SCOUT_MEETING: { icon: '\u{1F4BC}', label: 'Brand Scout Meeting' },
                              STAGE_GUEST_SURPRISE: { icon: '\u2B50', label: 'Guest Appearance' },
                            };
                            const cfg = DEAL_LABELS[item.deal_type] || { icon: '\u{1F91D}', label: item.deal_type };
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(168,85,247,.08)', borderRadius: 8, border: '1px solid rgba(168,85,247,.15)' }}>
                                <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#d8b4fe' }}>{cfg.label}</div>
                                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1 }}>
                                    {item.effects_applied ? 'Resolved' : 'Pending'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FestivalHistoryTab;
