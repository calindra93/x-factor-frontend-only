import React, { useEffect, useState } from "react";
import {
  Users,
  Calendar,
  Activity,
  AlertTriangle,
  Music,
  Ticket,
  Star,
  Handshake,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { invokeFestivalAction } from "@/lib/invokeFestivalAction";
import { formatCurrency, formatNumber } from "@/utils/numberFormat";
import { fadeUp, dockTransition } from "./worldMapMotion";

function CommandSection({ icon: Icon, title, badge, children, defaultOpen = true, accentColor = "#a78bfa", compact = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-[22px] overflow-hidden"
      style={{ background: compact ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.025)", border: compact ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(255,255,255,0.07)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`w-full flex items-center justify-between ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
          <span className={`${compact ? "text-[12px]" : "text-sm"} font-black text-white truncate`}>{title}</span>
          {badge != null ? (
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: `${accentColor}20`, color: accentColor }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
      </button>
      {open ? (
        <div className={`${compact ? "px-3 pb-3" : "px-4 pb-4"} border-t`} style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function VitalBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-black" style={{ color: "#9ca3af" }}>
          {label}
        </span>
        <span className="font-mono text-xs font-black" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE TOUR PANEL — dashboard, previous shows, local scene
// Owns: liveTourPanelView, commandDashboardOpen
// ═══════════════════════════════════════════════════════════════════════════════

const liveModeTabs = [
  { id: "dashboard", kicker: "01", label: "Dashboard" },
  { id: "previous-shows", kicker: "02", label: "Previous Shows" },
  { id: "local-scene", kicker: "03", label: "Local Scene" },
];

export default function LiveTourPanel({
  activeTour,
  profile,
  activeTourDashboardModel,
  activeTourLiveMapModel,
  activeTourGigs: _activeTourGigs,
  activeTourGigsLoading,
  nextLiveStop,
  previousLiveStops,
  recentLiveEvents: _recentLiveEvents,
  currentLiveRegionLabel,
  inspectedLiveStop,
  onSelectInspectedStop,
  liveTourPanelView: controlledLiveTourPanelView,
  onLiveTourPanelViewChange,
  onExitLiveTourMode: _onExitLiveTourMode,
}) {
  const [uncontrolledLiveTourPanelView, setUncontrolledLiveTourPanelView] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [songData, setSongData] = useState({});
  const [upcomingGigs, setUpcomingGigs] = useState([]);
  const [gigsLoading, setGigsLoading] = useState(true);
  const [crewMembers, setCrewMembers] = useState([]);
  const [sponsorships, setSponsorships] = useState([]);
  const [choiceEvents, setChoiceEvents] = useState([]);
  const [openingActs, setOpeningActs] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [resolvingChoice, setResolvingChoice] = useState(null);
  const [respondingInvite, setRespondingInvite] = useState(null);
  const [localStrategy, setLocalStrategy] = useState(activeTourDashboardModel.strategy || {});

  const liveTourPanelView = controlledLiveTourPanelView ?? uncontrolledLiveTourPanelView;

  useEffect(() => {
    setLocalStrategy(activeTourDashboardModel.strategy || {});
  }, [activeTourDashboardModel.strategy]);

  useEffect(() => {
    if (!activeTour?.id) return;
    const loadExpansionData = async () => {
      try {
        const [crewRes, sponsorRes, choiceRes, openerRes] = await Promise.all([
          supabaseClient.from("tour_crew_members").select("*").eq("tour_id", activeTour.id).eq("contract_status", "active"),
          supabaseClient.from("tour_sponsorships").select("*").eq("tour_id", activeTour.id).eq("status", "active"),
          supabaseClient.from("tour_choice_events").select("*").eq("tour_id", activeTour.id).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
          supabaseClient.from("tour_opening_acts").select("id, opener_id, status, revenue_split, fan_crossover_rate, attendance_boost, accepted_turn, created_at").eq("tour_id", activeTour.id).order("created_at", { ascending: false }),
        ]);
        setCrewMembers(crewRes.data || []);
        setSponsorships(sponsorRes.data || []);
        setChoiceEvents(choiceRes.data || []);
        const openerRows = openerRes.data || [];
        const openerIds = openerRows.map((row) => row.opener_id).filter(Boolean);
        let openerProfiles = {};
        if (openerIds.length > 0) {
          const { data: profiles } = await supabaseClient.from("profiles").select("id, artist_name, career_stage, region, followers, fans").in("id", openerIds);
          openerProfiles = Object.fromEntries((profiles || []).map((entry) => [entry.id, entry]));
        }
        setOpeningActs(openerRows.map((row) => ({ ...row, profile: openerProfiles[row.opener_id] || null })));

        if (profile?.id) {
          const [openingInviteRes, supportInviteRes] = await Promise.all([
            supabaseClient
              .from("tour_opening_acts")
              .select("id, tour_id, headliner_id, status, revenue_split, attendance_boost, created_at, tours(tour_name, region)")
              .eq("opener_id", profile.id)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(10),
            supabaseClient
              .from("tour_support_invites")
              .select("id, headliner_id, status, expires_turn_id, payload, created_at")
              .eq("opener_id", profile.id)
              .eq("status", "PENDING")
              .order("created_at", { ascending: false })
              .limit(10),
          ]);

          const openingPendingRows = (openingInviteRes.data || []).map((row) => ({
            ...row,
            invite_source: "tour_opening_acts",
          }));

          const supportPendingRows = (supportInviteRes.data || []).map((row) => ({
            ...row,
            invite_source: "tour_support_invites",
            tour_id: null,
            tours: {
              tour_name: "Backstage support invite",
              region: row?.payload?.region || null,
            },
            revenue_split: Number(row?.payload?.suggested_revenue_split) || 0,
            attendance_boost: Number(row?.payload?.suggested_attendance_boost) || 1,
          }));

          const pendingRows = [...openingPendingRows, ...supportPendingRows]
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 20);

          const headlinerIds = [...new Set(pendingRows.map((row) => row.headliner_id).filter(Boolean))];
          let headlinerMap = {};
          if (headlinerIds.length > 0) {
            const { data: headlinerProfiles } = await supabaseClient.from("profiles").select("id, artist_name, career_stage, followers, fans").in("id", headlinerIds);
            headlinerMap = Object.fromEntries((headlinerProfiles || []).map((entry) => [entry.id, entry]));
          }
          setPendingInvites(pendingRows.map((row) => ({ ...row, headliner: headlinerMap[row.headliner_id] || null })));
        }
      } catch {
      }
    };
    loadExpansionData();
  }, [activeTour?.id, profile?.id]);

  useEffect(() => {
    const resolveSetlist = async () => {
      const setlist = Array.isArray(activeTour?.setlist) ? activeTour.setlist : [];
      if (setlist.length === 0) {
        setSongData({});
        return;
      }
      try {
        const { data: songs, error } = await supabaseClient.from("songs").select("id, title, quality, release_id").in("id", setlist);
        if (error) throw error;
        const songMap = {};
        for (const song of songs || []) {
          let streams = 0;
          if (song.release_id) {
            try {
              const { data: releaseData } = await supabaseClient.from("releases").select("lifetime_streams").eq("id", song.release_id).single();
              streams = releaseData?.lifetime_streams || 0;
            } catch {
            }
          }
          songMap[song.id] = { title: song.title || "Untitled", streams, quality: song.quality || 0 };
        }
        setSongData(songMap);
      } catch (error) {
        console.error("Failed to resolve setlist:", error);
      }
    };
    resolveSetlist();
  }, [activeTour?.setlist]);

  useEffect(() => {
    if (!activeTour?.id) return;
    const loadGigs = async () => {
      setGigsLoading(true);
      try {
        const { data: gigs, error } = await supabaseClient
          .from("gigs")
          .select("id, venue_name, city, scheduled_turn, status, tickets_sold, gross_revenue, capacity")
          .eq("tour_id", activeTour.id)
          .order("scheduled_turn", { ascending: true })
          .limit(10);
        if (error) throw error;
        setUpcomingGigs(gigs || []);
      } catch (error) {
        console.error("Failed to load gigs:", error);
        setUpcomingGigs([]);
      } finally {
        setGigsLoading(false);
      }
    };
    loadGigs();
  }, [activeTour?.id]);

  const setLiveTourPanelView = (nextValue) => {
    onLiveTourPanelViewChange?.(nextValue);
    if (controlledLiveTourPanelView == null) {
      setUncontrolledLiveTourPanelView(nextValue);
    }
  };

  const handleResolveChoice = async (eventId, chosenOptionId) => {
    setResolvingChoice(eventId);
    try {
      await invokeEdgeFunction("touring", {
        action: "resolveChoiceEvent",
        artistId: profile.id,
        choiceEventId: eventId,
        chosenOptionId,
      });
      setChoiceEvents((prev) => prev.filter((event) => event.id !== eventId));
    } catch (error) {
      console.error("Failed to resolve choice:", error);
    }
    setResolvingChoice(null);
  };

  const handleRespondInvite = async (invitationId, response, inviteSource = "tour_opening_acts") => {
    setRespondingInvite(invitationId);
    try {
      if (inviteSource === "tour_support_invites") {
        await invokeFestivalAction("respondTourSupportInvite", {
          artistId: profile.id,
          inviteId: invitationId,
          accept: response === "accepted",
        });
      } else {
        const result = await invokeEdgeFunction("touring", {
          action: "respondOpeningAct",
          artistId: profile.id,
          invitationId,
          response,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to update opening act invitation');
        }
      }
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== invitationId));
    } catch (error) {
      console.error("Failed to respond to invite:", error);
    }
    setRespondingInvite(null);
  };

  const handleRestNext = async () => {
    try {
      setLoading(true);
      const nextStrategy = { ...localStrategy, rest_next: !localStrategy.rest_next };
      await base44.entities.Tour.update(activeTour.id, { strategy: nextStrategy });
      setLocalStrategy(nextStrategy);
    } catch (error) {
      console.error("Failed to update strategy", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPanelView = (viewId) => {
    setLiveTourPanelView(viewId);
    if (viewId === "local-scene") {
      const fallbackStop =
        inspectedLiveStop ||
        activeTourLiveMapModel.currentStop ||
        activeTourLiveMapModel.stops[0] ||
        null;
      if (fallbackStop?.id) {
        onSelectInspectedStop?.(fallbackStop.id);
      }
    }
  };

  const openingActNames = openingActs
    .map((opener) => opener.profile?.artist_name || "Opening Act")
    .filter(Boolean)
    .join(" · ");
  const averageAttendanceBoost = openingActs.length > 0
    ? Math.round(
        openingActs.reduce((sum, opener) => sum + (Number(opener.attendance_boost) || 0), 0) / openingActs.length
      )
    : 0;
  const averageRevenueSplit = openingActs.length > 0
    ? Math.round(
        (openingActs.reduce((sum, opener) => sum + (Number(opener.revenue_split) || 0), 0) / openingActs.length) * 100
      )
    : 0;
  const sponsorNames = sponsorships
    .map((sponsorship) => sponsorship?.brand_name)
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <motion.div
        layout
        transition={dockTransition}
        className="overflow-hidden rounded-[28px]"
        style={{
          background: "linear-gradient(145deg, rgba(9,14,26,0.98), rgba(14,20,36,0.94))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Tab row */}
        <div className="border-b px-4 py-3 md:px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
            {liveModeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSetPanelView(tab.id)}
                className="text-left transition-all"
                style={{ color: liveTourPanelView === tab.id ? "#ffffff" : "#94a3b8" }}
              >
                <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: liveTourPanelView === tab.id ? "#c084fc" : "#64748b" }}>
                  {tab.kicker}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm font-black">{tab.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-0 @[640px]:grid-cols-[1.1fr_0.9fr]">
          {/* Left column — tab content */}
          <div className="px-4 py-5 md:px-5 md:py-5 @[640px]:border-r" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {liveTourPanelView === "dashboard" && (
              <motion.div {...fadeUp} className="space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#a78bfa" }}>
                    Live route
                  </p>

                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[26px] font-black leading-none text-white">{activeTourDashboardModel.displayName}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-[11px] leading-relaxed" style={{ color: "#e2e8f0" }}>
                          {String(currentLiveRegionLabel || "-").toUpperCase()} - shows {activeTourLiveMapModel.completedStops} out of {activeTourLiveMapModel.totalStops || activeTour?.turns_total || 0}
                        </p>
                        {sponsorNames ? (
                          <p className="shrink-0 text-[10px] text-right" style={{ color: "#9ca3af" }}>
                            Sponsored by: {sponsorNames}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>
                        Progress
                      </p>
                      <p className="mt-1 text-[30px] font-black leading-none" style={{ color: "#c084fc" }}>
                        {activeTourDashboardModel.progress}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${activeTourDashboardModel.progress}%` }}
                    transition={dockTransition}
                    style={{ background: "linear-gradient(90deg, #7c3aed, #f472b6)" }}
                  />
                </div>

                <div className="grid grid-cols-4 gap-3 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Health</p>
                    <p className="mt-1 text-[11px] font-black" style={{ color: activeTourDashboardModel.health > 70 ? "#34d399" : "#fbbf24" }}>
                      {activeTourDashboardModel.health}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Momentum</p>
                    <p className="mt-1 text-[11px] font-black" style={{ color: "#c4b5fd" }}>
                      {activeTourDashboardModel.momentum}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Revenue</p>
                    <p className="mt-1 text-[11px] font-black text-white">{formatCurrency(activeTourDashboardModel.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Past shows</p>
                    <p className="mt-1 text-[11px] font-black text-white">{previousLiveStops.length}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="min-w-0 pr-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Next show</p>
                    <p className="mt-1 truncate text-[13px] font-bold text-white">
                      {nextLiveStop ? `${nextLiveStop.cityName} - ${nextLiveStop.venueName}` : "Route details loading"}
                    </p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                      {nextLiveStop ? `Turn ${nextLiveStop.scheduledTurn || activeTourDashboardModel.currentTurn}` : "Awaiting route sync"}
                    </p>
                  </div>
                  <div className="min-w-0 border-l pl-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Route pressure</p>
                    <p className="mt-1 text-[13px] font-bold text-white">Fatigue {activeTourDashboardModel.fatigue}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                      {activeTourDashboardModel.fatigue > 40 ? "Recovery window is tightening." : "Route energy is still holding."}
                    </p>
                  </div>
                </div>

                {openingActs.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="min-w-0 pr-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Opening acts</p>
                      <p className="mt-1 truncate text-[13px] font-bold text-white">{openingActNames}</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                        {openingActs.length} {openingActs.length === 1 ? "artist" : "artists"} on the bill
                      </p>
                    </div>
                    <div className="min-w-0 border-l pl-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Support impact</p>
                      <p className="mt-1 text-[13px] font-bold text-white">+{averageAttendanceBoost}% attendance</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                        {averageRevenueSplit}% average rev split
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="min-w-0 pr-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>Current action</p>
                    <p className="mt-1 text-[13px] font-bold text-white">{localStrategy.rest_next ? "Rest next turn" : "Performing"}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                      {localStrategy.rest_next ? "Skipping the next show to recover energy." : "Show flow stays active this turn."}
                    </p>
                  </div>
                  <div className="min-w-0 border-l pl-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <button
                      type="button"
                      onClick={handleRestNext}
                      disabled={loading}
                      className="w-full rounded-xl px-3 py-2 text-left transition-all disabled:opacity-50"
                      style={{ background: localStrategy.rest_next ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${localStrategy.rest_next ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}` }}
                    >
                      <p className="text-[11px] font-black" style={{ color: localStrategy.rest_next ? "#93c5fd" : "#ffffff" }}>Rest Next Turn</p>
                      <p className="mt-0.5 text-[10px]" style={{ color: localStrategy.rest_next ? "#bfdbfe" : "#9ca3af" }}>
                        {localStrategy.rest_next ? "Recovery mode armed." : "Toggle recovery for the next stop."}
                      </p>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {liveTourPanelView === "previous-shows" && (
              <motion.div {...fadeUp} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#c4b5fd" }}>Previous shows</p>
                    <p className="mt-1 text-sm font-black text-white">Active route timeline</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLiveTourPanelView("dashboard")}
                    className="text-[10px] font-black uppercase tracking-wide"
                    style={{ color: "#9ca3af" }}
                  >
                    Back
                  </button>
                </div>

                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {activeTourGigsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "rgba(139,92,246,0.3)", borderTopColor: "#a78bfa" }} />
                    </div>
                  ) : previousLiveStops.length === 0 ? (
                    <div
                      className="rounded-[18px] px-3 py-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <p className="text-sm font-black text-white">No completed shows yet</p>
                      <p className="mt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                        Completed stops will stack here once the tour starts clearing dates.
                      </p>
                    </div>
                  ) : (
                    previousLiveStops.map((stop) => (
                      <button
                        key={stop.id}
                        type="button"
                        onClick={() => {
                          onSelectInspectedStop?.(stop.id);
                          setLiveTourPanelView("local-scene");
                        }}
                        className="w-full text-left"
                      >
                        <div
                          className="rounded-[18px] px-3 py-3"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">
                                {stop.cityName} - {stop.venueName}
                              </p>
                              <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                                {stop.regionName} • {stop.fanSentiment}
                              </p>
                            </div>
                            <p className="shrink-0 text-[10px] font-black" style={{ color: "#86efac" }}>
                              Turn {stop.scheduledTurn}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {liveTourPanelView === "local-scene" && inspectedLiveStop && (
              <motion.div {...fadeUp} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#60a5fa" }}>Local scene</p>
                    <p className="mt-1 text-sm font-black text-white">{inspectedLiveStop.cityName}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#9ca3af" }}>
                      {inspectedLiveStop.regionName} • {inspectedLiveStop.venueName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLiveTourPanelView("dashboard")}
                    className="text-[10px] font-black uppercase tracking-wide"
                    style={{ color: "#9ca3af" }}
                  >
                    Back
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: "rgba(167,139,250,0.14)", color: "#ddd6fe", border: "1px solid rgba(167,139,250,0.16)" }}>
                    {inspectedLiveStop.dominantGenreLabel}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.05)" }}>
                    {inspectedLiveStop.reputationLabel}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: "rgba(96,165,250,0.12)", color: "#bfdbfe", border: "1px solid rgba(96,165,250,0.16)" }}>
                    {inspectedLiveStop.demandLabel}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: "#60a5fa" }}>Scene pulse</p>
                    <p className="mt-1 text-[11px]" style={{ color: "#d1d5db" }}>{inspectedLiveStop.cityVibe}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: "#34d399" }}>Fan sentiment</p>
                    <p className="mt-1 text-[11px]" style={{ color: "#d1d5db" }}>{inspectedLiveStop.fanSentiment}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: "#c4b5fd" }}>Backend hook</p>
                    <p className="mt-1 text-[11px]" style={{ color: "#d1d5db" }}>
                      Curated local-scene stats can plug into this lane when the backend snapshot expands.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right column — command stack */}
          <div className="px-4 py-4 md:px-5 md:py-5">
            <motion.div {...fadeUp} className="space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "#c4b5fd" }}>Command stack</p>
              </div>

              {activeTourDashboardModel.fatigue > 40 ? (
                <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs" style={{ color: "#fca5a5" }}>
                    High fatigue ({activeTourDashboardModel.fatigue}%) — consider resting next turn to avoid bad events and performance drops.
                  </p>
                </div>
              ) : null}

              {choiceEvents.length > 0 ? (
                <CommandSection icon={AlertCircle} title="Tour decisions" badge={choiceEvents.length} accentColor="#fbbf24" defaultOpen>
                  <div className="space-y-3 pt-3">
                    {choiceEvents.map((event) => {
                      const choices = Array.isArray(event.choices) ? event.choices : [];
                      return (
                        <div key={event.id} className="rounded-2xl p-4" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)" }}>
                          <p className="text-sm font-black text-white mb-1">{event.title || (event.event_key || "").replace(/_/g, " ") || "Decision"}</p>
                          <p className="text-xs mb-3" style={{ color: "#9ca3af" }}>{event.description || "A decision needs to be made."}</p>
                          <div className="flex flex-wrap gap-2">
                            {choices.map((choice, index) => (
                              <button key={index} type="button" onClick={() => handleResolveChoice(event.id, choice.id || `opt_${index}`)} disabled={resolvingChoice === event.id} className="px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                                {choice.label || `Option ${index + 1}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CommandSection>
              ) : null}

              {pendingInvites.length > 0 ? (
                <CommandSection icon={Handshake} title="Tour invitations" badge={pendingInvites.length} accentColor="#fb923c" defaultOpen>
                  <div className="space-y-3 pt-3">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="rounded-2xl p-4" style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)" }}>
                        <p className="text-sm font-black text-white mb-0.5">{invite.headliner?.artist_name || "An artist"} wants you to open!</p>
                        <p className="text-[10px] mb-2" style={{ color: "#9ca3af" }}>
                          {invite.tours?.tour_name || "Tour"}
                          {invite.tours?.region ? ` · ${invite.tours.region}` : ""}
                          {` · ${Math.round((Number(invite.revenue_split) || 0) * 100)}% revenue split`}
                          {invite.invite_source === "tour_support_invites" ? " · Backstage invite" : ""}
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleRespondInvite(invite.id, "accepted", invite.invite_source)} disabled={respondingInvite === invite.id} className="flex-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}>Accept</button>
                          <button type="button" onClick={() => handleRespondInvite(invite.id, "declined", invite.invite_source)} disabled={respondingInvite === invite.id} className="flex-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}>Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CommandSection>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <CommandSection icon={Activity} title="Tour events" badge={_recentLiveEvents.length || undefined} accentColor="#f472b6" defaultOpen={false} compact>
                  <div className="pt-3 space-y-2">
                    {_recentLiveEvents.length > 0 ? (
                      _recentLiveEvents.slice(0, 3).map((event) => (
                        <div key={event.id} className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#64748b" }}>{event.label}</p>
                          <p className="mt-1 text-[10px] text-white">{event.detail}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] pt-2" style={{ color: "#9ca3af" }}>No urgent tour events logged.</p>
                    )}
                  </div>
                </CommandSection>

                {crewMembers.length > 0 ? (
                  <CommandSection icon={Users} title="Tour crew" badge={crewMembers.length} accentColor="#60a5fa" compact>
                    <div className="pt-3 space-y-2">
                      {crewMembers.map((crew) => (
                        <div key={crew.id} className="flex items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-white truncate">{crew.name}</p>
                            <p className="text-[10px] capitalize" style={{ color: "#9ca3af" }}>{(crew.specialty || "").replace(/_/g, " ")} · Q{crew.quality || 50}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black" style={{ color: (crew.morale || 70) > 50 ? "#34d399" : (crew.morale || 70) > 25 ? "#fbbf24" : "#f87171" }}>Morale {crew.morale || 70}</p>
                            <p className="text-[10px]" style={{ color: "#6b7280" }}>${(crew.salary_per_turn || 0).toLocaleString()}/turn</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CommandSection>
                ) : <div />}

                <CommandSection icon={Music} title="Setlist" badge={`${(Array.isArray(activeTour?.setlist) ? activeTour.setlist : []).length} tracks`} accentColor="#34d399" defaultOpen compact>
                  <div className="pt-3 space-y-1.5 max-h-64 overflow-y-auto">
                    {(Array.isArray(activeTour?.setlist) ? activeTour.setlist : []).map((songId, index) => {
                      const song = songData[songId];
                      return (
                        <div key={songId || index} className="flex items-center gap-3 border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <span className="font-mono text-[10px] w-5 shrink-0 text-center" style={{ color: "#4b5563" }}>{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-white truncate">{song?.title || <span className="text-gray-600 text-xs">Loading…</span>}</p>
                            {song && (song.quality > 0 || song.streams > 0) ? (
                              <p className="text-[9px]" style={{ color: "#6b7280" }}>
                                {song.quality > 0 ? <span className="mr-2">Q{song.quality}</span> : null}
                                {song.streams > 0 ? <span>{formatNumber(song.streams)} streams</span> : null}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {(!activeTour?.setlist || activeTour.setlist.length === 0) ? (
                      <div className="text-center py-6">
                        <Music className="w-6 h-6 mx-auto mb-2 opacity-30 text-gray-600" />
                        <p className="text-xs" style={{ color: "#6b7280" }}>No setlist defined</p>
                      </div>
                    ) : null}
                  </div>
                </CommandSection>

                <CommandSection icon={Ticket} title="Tour schedule" accentColor="#fbbf24" defaultOpen={false} compact>
                  <div className="pt-3">
                    {gigsLoading ? (
                      <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(139,92,246,0.3)", borderTopColor: "#a78bfa" }} /></div>
                    ) : upcomingGigs.length === 0 ? (
                      <div className="text-center py-6"><Calendar className="w-6 h-6 mx-auto mb-2 opacity-30 text-gray-600" /><p className="text-xs" style={{ color: "#6b7280" }}>No shows scheduled</p></div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {upcomingGigs.map((gig) => {
                          const isCompleted = gig.status === "Completed" || gig.status === "completed";
                          const isCurrent = gig.scheduled_turn === activeTourDashboardModel.currentTurn;
                          return (
                            <div key={gig.id} className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: isCurrent ? "rgba(139,92,246,0.2)" : isCompleted ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)", opacity: isCompleted && !isCurrent ? 0.7 : 1 }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-black text-white truncate">{gig.venue_name || "Venue TBD"}</p>
                                <p className="text-[10px]" style={{ color: "#9ca3af" }}>{gig.city || "City TBD"}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black" style={{ color: isCurrent ? "#a78bfa" : isCompleted ? "#34d399" : "#6b7280" }}>{isCurrent ? "NOW" : isCompleted ? "✓ Done" : `Turn ${gig.scheduled_turn}`}</p>
                                {isCompleted && gig.tickets_sold > 0 ? <p className="text-[9px]" style={{ color: "#34d399" }}>{formatNumber(gig.tickets_sold)} sold</p> : null}
                                {!isCompleted && gig.capacity > 0 ? <p className="text-[9px]" style={{ color: "#6b7280" }}>Cap {formatNumber(gig.capacity)}</p> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CommandSection>
              </div>

              {(activeTourDashboardModel.state?.fan_reception != null || activeTourDashboardModel.state?.era_synergy != null || activeTourDashboardModel.state?.tour_review_score != null || activeTourDashboardModel.state?.setlist_vibe != null) ? (
                <CommandSection icon={Star} title="Tour performance" accentColor="#f472b6" defaultOpen={false}>
                  <div className="pt-3 space-y-3">
                    {activeTourDashboardModel.state?.fan_reception != null ? <VitalBar label="Fan Reception" value={Math.round(activeTourDashboardModel.state.fan_reception)} color={activeTourDashboardModel.state.fan_reception > 70 ? "#34d399" : activeTourDashboardModel.state.fan_reception > 40 ? "#fbbf24" : "#f87171"} /> : null}
                    {activeTourDashboardModel.state?.era_synergy != null ? <VitalBar label="Era Synergy" value={Math.round((activeTourDashboardModel.state.era_synergy || 0) * 100)} color={activeTourDashboardModel.state.era_synergy > 0.7 ? "#a78bfa" : activeTourDashboardModel.state.era_synergy > 0.4 ? "#60a5fa" : "#6b7280"} /> : null}
                    {activeTourDashboardModel.state?.setlist_vibe != null ? <VitalBar label="Setlist Vibe" value={Math.round(activeTourDashboardModel.state.setlist_vibe)} color="#22d3ee" /> : null}
                    {activeTourDashboardModel.state?.tour_review_score != null ? <VitalBar label="Tour Score" value={Math.round(activeTourDashboardModel.state.tour_review_score)} color={activeTourDashboardModel.state.tour_review_score > 70 ? "#34d399" : activeTourDashboardModel.state.tour_review_score > 40 ? "#fbbf24" : "#f87171"} /> : null}
                  </div>
                </CommandSection>
              ) : null}

              {activeTourDashboardModel.state?.event_history?.length > 0 ? (
                <CommandSection icon={Activity} title="Event history" badge={activeTourDashboardModel.state.event_history.length} accentColor="#60a5fa" defaultOpen={false}>
                  <div className="pt-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {activeTourDashboardModel.state.event_history.map((event, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: event.type === "positive" ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${event.type === "positive" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}` }}>
                        <span style={{ color: event.type === "positive" ? "#34d399" : "#f87171" }}>{event.type === "positive" ? "✓" : "✗"}</span>
                        <span style={{ color: "#d1d5db" }}>{event.text}</span>
                      </div>
                    ))}
                  </div>
                </CommandSection>
              ) : null}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
