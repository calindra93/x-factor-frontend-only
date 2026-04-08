import React, { useMemo, useState, useEffect } from "react";
import { Calendar, Globe, Clock, Handshake, Music, Mic2, X, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";

const TYPE_CONFIG = {
  tour_event: { icon: Music, color: "from-pink-500 to-purple-500", label: "Tour", badge: "bg-pink-500/20 text-pink-300" },
  gig: { icon: Mic2, color: "from-blue-500 to-cyan-500", label: "Gig", badge: "bg-blue-500/20 text-blue-300" },
  brand_deal: { icon: Handshake, color: "from-amber-500 to-orange-500", label: "Deal", badge: "bg-amber-500/20 text-amber-300" },
  showcase: { icon: Music, color: "from-purple-500 to-pink-500", label: "Showcase", badge: "bg-purple-500/20 text-purple-300" },
  battle: { icon: Mic2, color: "from-red-500 to-orange-500", label: "Battle", badge: "bg-red-500/20 text-red-300" },
  open_mic: { icon: Mic2, color: "from-green-500 to-teal-500", label: "Open Mic", badge: "bg-green-500/20 text-green-300" },
  festival_slot: { icon: Music, color: "from-yellow-500 to-orange-500", label: "Festival", badge: "bg-yellow-500/20 text-yellow-300" },
  listening_party: { icon: Music, color: "from-indigo-500 to-purple-500", label: "Listening", badge: "bg-indigo-500/20 text-indigo-300" },
  radio: { icon: Music, color: "from-cyan-500 to-blue-500", label: "Radio", badge: "bg-cyan-500/20 text-cyan-300" },
  block_party: { icon: Music, color: "from-pink-500 to-rose-500", label: "Block Party", badge: "bg-pink-500/20 text-rose-300" },
};

function getImpactBadge(score) {
  if (!score) return null;
  if (score > 0) return { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', label: `+${score}` };
  if (score < 0) return { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10', label: `${score}` };
  return { icon: Minus, color: 'text-gray-400', bg: 'bg-gray-500/10', label: '0' };
}

export default function ScheduleAndNews({ events, news, gigs = [], brandDeals = [], tours = [] }) {
  const [showNewsModal, setShowNewsModal] = useState(false);

  useEffect(() => {
  }, [showNewsModal]);

  const allScheduleItems = useMemo(() => {
    const items = [];

    (events || []).forEach(e => {
      if (e.status === "scheduled" || e.status === "available" || e.status === "booked") {
        // Use event_type for underground events, fallback to tour_event
        const eventType = e.event_type || "tour_event";
        items.push({
          id: `ev-${e.id}`,
          type: eventType,
          name: e.event_name || "Event",
          date: e.scheduled_date || e.event_date || e.created_at,
          detail: e.city || e.venue || e.region || "",
        });
      }
    });

    (gigs || []).forEach(g => {
      if (g.status === "scheduled") {
        items.push({
          id: `gig-${g.id}`,
          type: "gig",
          name: g.gig_name || "Live Show",
          date: g.scheduled_date || g.created_at,
          detail: g.city ? `${g.city}, ${g.region}` : g.region || "",
        });
      }
    });

    (brandDeals || []).forEach(d => {
      if (d.status === "active") {
        items.push({
          id: `deal-${d.id}`,
          type: "brand_deal",
          name: d.brand_name || d.deal_name || "Brand Deal",
          date: d.start_date || d.created_at,
          detail: d.platform || "Sponsorship",
        });
      }
    });

    // Add active tours
    (tours || []).forEach(t => {
      if (t.status === "active") {
        items.push({
          id: `tour-${t.id}`,
          type: "tour_event",
          name: t.tour_name || "Tour",
          date: t.created_at,
          detail: `${t.completed_stops || 0}/${t.total_stops || 0} stops`,
        });
      }
    });

    items.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return items.slice(0, 6);
  }, [events, gigs, brandDeals, tours]);

  const latestNews = news?.[0];
  const newsCount = (news || []).length;

  return (
    <>
      <div className={`grid gap-3 ${newsCount > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Schedule */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Schedule</span>
          </div>
          
          {allScheduleItems.length > 0 ? (
            <div className="space-y-2.5">
              {allScheduleItems.map((item) => {
                const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.tour_event;
                return (
                  <div key={item.id} className="flex gap-2">
                    <div className={`w-0.5 bg-gradient-to-b ${cfg.color} rounded-full flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[7px] px-1 py-0.5 rounded-full font-semibold ${cfg.badge}`}>{cfg.label}</span>
                        {item.date && (
                          <span className="text-gray-600 text-[9px]">
                            {moment(item.date).format("MMM D")}
                          </span>
                        )}
                      </div>
                      <div className="text-white text-[11px] font-semibold truncate">{item.name}</div>
                      {item.detail && <div className="text-gray-500 text-[9px] truncate">{item.detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-xs">No upcoming events</p>
          )}
        </div>

        {/* News — only rendered when news items exist */}
        {newsCount > 0 && <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-green-400" />
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">News</span>
            </div>
            {newsCount > 1 && (
              <span className="text-[8px] text-gray-500 bg-white/[0.06] px-1.5 py-0.5 rounded-full">{newsCount}</span>
            )}
          </div>
          
          {latestNews ? (
            <div>
              <p className="text-gray-300 text-xs leading-relaxed italic line-clamp-3">"{latestNews.headline}"</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1 text-gray-600 text-[10px]">
                  <Clock className="w-3 h-3" />
                  <span>{moment(latestNews.created_date || latestNews.created_at).fromNow()}</span>
                </div>
                {newsCount > 1 && (
                  <button
                    onClick={() => setShowNewsModal(true)}
                    className="flex items-center gap-0.5 text-green-400 text-[9px] font-semibold hover:text-green-300 transition-colors"
                  >
                    See All <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-300 text-xs leading-relaxed italic">
              "Industry buzz is building. Stay tuned for breaking news."
            </p>
          )}
        </div>}
      </div>

      {/* News Modal */}
      <AnimatePresence>
        {showNewsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowNewsModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-[#0f0f18] border-t border-white/[0.08] rounded-t-3xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-green-400" />
                  <h3 className="text-white text-base font-bold">Industry News</h3>
                  <span className="text-[9px] text-gray-500 bg-white/[0.06] px-2 py-0.5 rounded-full">{newsCount} articles</span>
                </div>
                <button onClick={() => setShowNewsModal(false)} className="p-1.5 hover:bg-white/[0.06] rounded-xl transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* News List */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                {(news || []).slice(0, 10).map((item, idx) => {
                  const impact = getImpactBadge(item.impact_score);
                  const ImpactIcon = impact?.icon;
                  return (
                    <motion.div
                      key={item.id || idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[13px] font-semibold leading-snug mb-1.5">
                            {item.headline}
                          </p>
                          {item.body && (
                            <p className="text-gray-400 text-[11px] leading-relaxed line-clamp-2 mb-2">{item.body}</p>
                          )}
                          <div className="flex items-center gap-3 text-[9px]">
                            {item.artist_name && (
                              <span className="text-blue-400 font-medium">{item.artist_name}</span>
                            )}
                            {item.source && (
                              <span className="text-gray-500 font-medium">{item.source}</span>
                            )}
                            <span className="text-gray-600">
                              {moment(item.created_date || item.created_at).fromNow()}
                            </span>
                            {impact && ImpactIcon && (
                              <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${impact.bg} ${impact.color} font-semibold`}>
                                <ImpactIcon className="w-2.5 h-2.5" />
                                {impact.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}