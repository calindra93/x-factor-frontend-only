import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Mic2, Plane, Handshake, Calendar, Clock, Disc3 } from "lucide-react";

const EVENT_TYPE_CONFIG = {
  tour_event: { icon: Calendar, label: "Tour Date", color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
  gig: { icon: Mic2, label: "Live Show", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  tour: { icon: Plane, label: "Tour", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  brand_deal: { icon: Handshake, label: "Brand Deal", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  upcoming_release: { icon: Disc3, label: "Upcoming", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
};

export default function ArtistEventsTab({ artistId, events = [], platformAccent = "blue" }) {
  const [gigs, setGigs] = useState([]);
  const [tours, setTours] = useState([]);
  const [brandDeals, setBrandDeals] = useState([]);
  const [upcomingProjects, setUpcomingProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!artistId) return;
    const load = async () => {
      try {
        const [g, t, d, p] = await Promise.all([
          base44.entities.Gig?.filter({ artist_id: artistId }).catch(() => []) || [],
          base44.entities.Tour?.filter({ artist_id: artistId }).catch(() => []) || [],
          base44.entities.BrandDeal?.filter({ artist_id: artistId }).catch(() => []) || [],
          base44.entities.Project?.filter({ artist_id: artistId }).catch(() => []) || [],
        ]);
        setGigs(Array.isArray(g) ? g : []);
        setTours(Array.isArray(t) ? t : []);
        setBrandDeals(Array.isArray(d) ? d : []);
        const upcoming = (Array.isArray(p) ? p : []).filter(
          proj => proj.project_status === "recording" || proj.project_status === "mixing" || proj.project_status === "mastering" || proj.project_status === "scheduled"
        );
        setUpcomingProjects(upcoming);
      } catch (e) {
        console.error("[ArtistEventsTab] Load error:", e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, [artistId]);

  const allItems = useMemo(() => {
    const items = [];

    (events || []).forEach(e => {
      if (e.status === "scheduled") {
        items.push({ id: `ev-${e.id}`, type: "tour_event", name: e.event_name || "Tour Date", date: e.scheduled_date || e.event_date, detail: e.city ? `${e.city} • ${e.venue || ""}` : e.venue || "", status: "Upcoming" });
      }
    });

    gigs.filter(g => g.status === "scheduled" || g.status === "Booked").forEach(g => {
      items.push({ id: `gig-${g.id}`, type: "gig", name: g.gig_name || g.venue_name || "Live Show", date: g.scheduled_date || g.created_at, detail: g.city ? `${g.city}, ${g.region}` : g.region || "", status: g.tickets_sold ? `${g.tickets_sold} sold` : "Booked" });
    });

    tours.filter(t => t.status === "active" || t.status === "in_progress").forEach(t => {
      items.push({ id: `tour-${t.id}`, type: "tour", name: t.tour_name || "Tour", date: t.created_at, detail: `${t.shows_completed || 0}/${t.total_shows} shows • ${t.turns_remaining || 0} turns left`, status: "On Tour" });
    });

    brandDeals.filter(d => d.status === "active").forEach(d => {
      items.push({ id: `deal-${d.id}`, type: "brand_deal", name: d.brand_name || d.deal_name || "Brand Deal", date: d.start_date || d.created_at, detail: d.platform || "Sponsorship", status: `$${(d.payout || 0).toLocaleString()}` });
    });

    upcomingProjects.forEach(p => {
      items.push({ id: `proj-${p.id}`, type: "upcoming_release", name: p.project_name || "Untitled Project", date: p.target_release_date || p.created_date, detail: `${p.project_type || "Release"} • ${p.tracklist?.length || 0} tracks`, status: p.project_status || "In Progress" });
    });

    items.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    return items;
  }, [events, gigs, tours, brandDeals, upcomingProjects]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <Calendar className="w-8 h-8 text-white/20 mx-auto mb-2" />
        <p className="text-white/50 text-xs">No upcoming events, tours, or releases scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {allItems.map(item => {
        const cfg = EVENT_TYPE_CONFIG[item.type] || EVENT_TYPE_CONFIG.tour_event;
        const Icon = cfg.icon;
        return (
          <div key={item.id} className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-3.5`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-xs font-semibold truncate">{item.name}</p>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full bg-white/[0.06] ${cfg.color} font-semibold flex-shrink-0`}>
                    {cfg.label}
                  </span>
                </div>
                {item.detail && <p className="text-white/40 text-[10px] mt-0.5 truncate">{item.detail}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {item.date && (
                    <span className="text-white/30 text-[9px] flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  <span className="text-white/50 text-[9px] font-medium">{item.status}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
