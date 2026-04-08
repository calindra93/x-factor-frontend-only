import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import EventsTourSchedule from "../components/events/EventsTourSchedule";
import EventsUpcomingProjects from "../components/events/EventsUpcomingProjects";
import ArtistsPickCard from "../components/events/ArtistsPickCard";

export default function Events() {
  const [loading, setLoading] = useState(true);
  const [tourStops, setTourStops] = useState([]);
  const [upcomingProjects, setUpcomingProjects] = useState([]);
  const [artistsPick, setArtistsPick] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const userAccountId = localStorage.getItem("user_account_id");
        if (!userAccountId) {
          setLoading(false);
          return;
        }

        const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
        const profile = profiles?.[0];

        if (!profile) {
          setLoading(false);
          return;
        }

        const [gigs, projects, releases, songs] = await Promise.all([
          base44.entities.Gig.filter({ artist_id: profile.id, status: "Booked" }, "scheduled_turn"),
          base44.entities.Project.filter({ artist_id: profile.id }, "-created_date"),
          base44.entities.Release.filter({ artist_id: profile.id }, "-release_date"),
          base44.entities.Song.filter({ artist_id: profile.id }, "-popularity"),
        ]);

        // Process Tour Stops
        // Group by City/Venue
        const stopsMap = new Map();
        (gigs || []).forEach(gig => {
          const key = `${gig.city}-${gig.venue_name}`;
          if (!stopsMap.has(key)) {
            stopsMap.set(key, {
              city: gig.city,
              venue: gig.venue_name,
              status: gig.tickets_sold ? "Sold Out" : "On Sale", // Simplified logic
              dates: []
            });
          }
          const stop = stopsMap.get(key);
          const dateObj = new Date(gig.scheduled_date || gig.created_at);
          stop.dates.push({
            day: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            note: gig.gig_type === 'concert' ? "Live Show" : gig.gig_type,
            time: "8:00 PM" // Placeholder time
          });
        });
        setTourStops(Array.from(stopsMap.values()));

        // Process Upcoming Projects
        const upcoming = (projects || []).filter(
          p => p.project_status !== "released" && p.project_status !== "archived"
        ).map(p => ({
          type: p.project_type || "Project",
          title: p.project_name || "Untitled",
          releaseDate: p.target_release_date ? new Date(p.target_release_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBA",
          status: p.project_status === 'scheduled' ? 'In Production' : (p.project_status.charAt(0).toUpperCase() + p.project_status.slice(1)),
          description: `A new ${p.project_type?.toLowerCase() || "project"} currently in the ${p.project_status} phase.`,
          highlights: [`${p.tracklist?.length || 0} tracks`, "Coming soon"]
        }));
        setUpcomingProjects(upcoming);

        // Process Artist Pick (Latest Release or Best Song)
        // Ideally we'd have a 'featured_release_id' on the profile, but let's default to latest release
        if (releases && releases.length > 0) {
          const pick = releases[0];
          setArtistsPick({
            type: pick.project_type || "Release",
            title: pick.release_name,
            releaseDate: `Released: ${new Date(pick.release_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
            description: "The latest drop from your discography.",
            tags: ["New Release", "Streamify Available"],
            image: pick.cover_artwork_url,
            stats: [
              { label: "Streams", value: (pick.lifetime_streams || 0).toLocaleString(), detail: "Total" },
              { label: "State", value: pick.lifecycle_state || "New", detail: "Lifecycle" },
            ]
          });
        }

        setLoading(false);
      } catch (e) {
        console.error("Failed to load events data", e);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-white/50">Loading...</div>;
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-4 max-w-md mx-auto px-4 pt-8">
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">Events</p>
          <h1 className="text-2xl font-semibold text-white">Touring + release calendar</h1>
          <p className="text-sm text-white/60">
            Keep the next shows, rollouts, and spotlight moments aligned across platforms.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {tourStops.length > 0 ? (
            <EventsTourSchedule stops={tourStops} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-white/50 text-sm">No upcoming tour dates scheduled.</p>
            </div>
          )}
          
          {artistsPick ? (
            <ArtistsPickCard pick={artistsPick} />
          ) : (
             <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center flex items-center justify-center">
              <p className="text-white/50 text-sm">No releases featured yet.</p>
            </div>
          )}
        </div>

        {upcomingProjects.length > 0 ? (
          <EventsUpcomingProjects projects={upcomingProjects} />
        ) : (
           <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-white/50 text-sm">No upcoming projects in the pipeline.</p>
            </div>
        )}
      </div>
    </div>
  );
}