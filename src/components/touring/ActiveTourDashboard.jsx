import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  DollarSign, Users, Battery, Zap, Calendar, Activity,
  AlertTriangle, Music, Ticket, Shield, Star, Handshake, AlertCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatCurrency, formatNumber } from "@/utils/numberFormat";

// ─── Reusable command section shell ───────────────────────────────────────────

function CommandSection({ icon: Icon, title, badge, children, defaultOpen = true, accentColor = "#a78bfa" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
          <span className="text-sm font-black text-white">{title}</span>
          {badge != null && (
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: `${accentColor}20`, color: accentColor }}
            >
              {badge}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-600" />
          : <ChevronDown className="w-4 h-4 text-gray-600" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Vitals bar ───────────────────────────────────────────────────────────────

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
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function buildActiveTourDashboardModel(tour = {}) {
  const state = tour?.state || { fatigue: 0, morale: 100 };
  const strategy = tour?.strategy || {};
  const completedStops = Number(tour?.completed_stops) || 0;
  const turnsTotal = Number(tour?.turns_total) || 0;

  return {
    state,
    strategy,
    progress: turnsTotal > 0 ? Math.min(100, Math.round((completedStops / turnsTotal) * 100)) : 0,
    currentTurn: completedStops + 1,
    totalRevenue: Number(tour?.total_net_revenue) || 0,
    totalAttendance: Number(tour?.total_attendance) || 0,
    health: state.health ?? state.morale ?? 80,
    momentum: state.momentum ?? state.route_momentum ?? 70,
    fatigue: state.fatigue ?? 0,
    isCoTour: Boolean(tour?.co_headliner_name),
    displayName: tour?.name || tour?.tour_name || 'Active Tour',
    displayRegion: tour?.region || '—',
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveTourDashboard({ tour, profile, onRefresh }) {
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

  // ── Load expansion data (crew, sponsors, choice events, opening acts) ───────
  useEffect(() => {
    if (!tour?.id) return;
    const loadExpansionData = async () => {
      try {
        const [crewRes, sponsorRes, choiceRes, openerRes] = await Promise.all([
          supabaseClient.from('tour_crew_members').select('*').eq('tour_id', tour.id).eq('contract_status', 'active'),
          supabaseClient.from('tour_sponsorships').select('*').eq('tour_id', tour.id).eq('status', 'active'),
          supabaseClient.from('tour_choice_events').select('*').eq('tour_id', tour.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
          supabaseClient.from('tour_opening_acts').select('id, opener_id, status, revenue_split, fan_crossover_rate, attendance_boost, accepted_turn, created_at').eq('tour_id', tour.id).order('created_at', { ascending: false }),
        ]);
        setCrewMembers(crewRes.data || []);
        setSponsorships(sponsorRes.data || []);
        setChoiceEvents(choiceRes.data || []);
        const openerRows = openerRes.data || [];
        const openerIds = openerRows.map((row) => row.opener_id).filter(Boolean);
        let openerProfiles = {};
        if (openerIds.length > 0) {
          const { data: profiles } = await supabaseClient.from('profiles').select('id, artist_name, career_stage, region, followers, fans').in('id', openerIds);
          openerProfiles = Object.fromEntries((profiles || []).map((entry) => [entry.id, entry]));
        }
        setOpeningActs(openerRows.map((row) => ({ ...row, profile: openerProfiles[row.opener_id] || null })));

        // Load pending invites where THIS player is the opener
        if (profile?.id) {
          const { data: incomingInvites } = await supabaseClient
            .from('tour_opening_acts')
            .select('id, tour_id, headliner_id, status, revenue_split, attendance_boost, created_at, tours(tour_name, region)')
            .eq('opener_id', profile.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10);
          const pendingRows = incomingInvites || [];
          const headlinerIds = [...new Set(pendingRows.map((r) => r.headliner_id).filter(Boolean))];
          let headlinerMap = {};
          if (headlinerIds.length > 0) {
            const { data: hProfiles } = await supabaseClient
              .from('profiles')
              .select('id, artist_name, career_stage, followers, fans')
              .in('id', headlinerIds);
            headlinerMap = Object.fromEntries((hProfiles || []).map((p) => [p.id, p]));
          }
          setPendingInvites(pendingRows.map((r) => ({ ...r, headliner: headlinerMap[r.headliner_id] || null })));
        }
      } catch { /* non-fatal */ }
    };
    loadExpansionData();
  }, [tour?.id]);

  // ── Resolve setlist song names + streams ─────────────────────────────────
  useEffect(() => {
    const resolveSetlist = async () => {
      const setlist = Array.isArray(tour.setlist) ? tour.setlist : [];
      if (setlist.length === 0) { setSongData({}); return; }
      try {
        const { data: songs, error } = await supabaseClient
          .from('songs').select('id, title, quality, release_id').in('id', setlist);
        if (error) throw error;
        const map = {};
        for (const song of (songs || [])) {
          let streams = 0;
          if (song.release_id) {
            try {
              const { data: releaseData } = await supabaseClient
                .from('releases').select('lifetime_streams').eq('id', song.release_id).single();
              streams = releaseData?.lifetime_streams || 0;
            } catch { /* non-fatal */ }
          }
          map[song.id] = { title: song.title || 'Untitled', streams, quality: song.quality || 0 };
        }
        setSongData(map);
      } catch (e) { console.error('Failed to resolve setlist:', e); }
    };
    resolveSetlist();
  }, [tour.setlist, profile?.id]);

  // ── Load gigs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadGigs = async () => {
      if (!tour?.id) return;
      setGigsLoading(true);
      try {
        const { data: gigs, error } = await supabaseClient
          .from('gigs')
          .select('id, venue_name, city, scheduled_turn, status, tickets_sold, gross_revenue, capacity')
          .eq('tour_id', tour.id)
          .order('scheduled_turn', { ascending: true })
          .limit(10);
        if (error) throw error;
        setUpcomingGigs(gigs || []);
      } catch (e) {
        console.error('Failed to load gigs:', e);
        setUpcomingGigs([]);
      } finally {
        setGigsLoading(false);
      }
    };
    loadGigs();
  }, [tour?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleResolveChoice = async (eventId, chosenOptionId) => {
    setResolvingChoice(eventId);
    try {
      await invokeEdgeFunction('touring', {
        action: 'resolveChoiceEvent',
        artistId: profile.id,
        choiceEventId: eventId,
        chosenOptionId,
      });
      setChoiceEvents((prev) => prev.filter((e) => e.id !== eventId));
      onRefresh();
    } catch (e) { console.error('Failed to resolve choice:', e); }
    setResolvingChoice(null);
  };

  const handleRespondInvite = async (invitationId, response) => {
    setRespondingInvite(invitationId);
    try {
      await invokeEdgeFunction('touring', {
        action: 'respondOpeningAct',
        artistId: profile.id,
        invitationId,
        response,
      });
      setPendingInvites((prev) => prev.filter((inv) => inv.id !== invitationId));
      onRefresh();
    } catch (e) { console.error('Failed to respond to invite:', e); }
    setRespondingInvite(null);
  };

  const handleRestNext = async () => {
    try {
      setLoading(true);
      const newStrategy = { ...strategy, rest_next: !strategy.rest_next };
      await base44.entities.Tour.update(tour.id, { strategy: newStrategy });
      onRefresh();
    } catch (err) { console.error("Failed to update strategy", err); }
    finally { setLoading(false); }
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const dashboardModel = buildActiveTourDashboardModel(tour);
  const {
    state,
    strategy,
    progress,
    currentTurn,
    totalRevenue,
    totalAttendance,
    health,
    momentum,
    fatigue,
  } = dashboardModel;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Hero command card ─────────────────────────────────────────────── */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(139,92,246,0.15), rgba(244,114,182,0.08))",
          border: "1px solid rgba(139,92,246,0.3)",
        }}
      >
        {/* Tour name + region */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0 mr-3">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#34d399" }}>
                  Live Tour
                </span>
                {tour.co_headliner_name && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase ml-1"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                    Co-Tour
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-white truncate">{tour.name || tour.tour_name}</h2>
              <p className="text-xs" style={{ color: "#6b7280" }}>
                {tour.region}
                {tour.co_headliner_name && (
                  <span style={{ color: "#fbbf24" }}> · w/ {tour.co_headliner_name}</span>
                )}
              </p>
            </div>

            {/* Revenue + attendance pills */}
            <div className="shrink-0 text-right space-y-1">
              <div>
                <p className="font-mono font-black text-sm" style={{ color: "#34d399" }}>
                  {formatCurrency(totalRevenue)}
                </p>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>Revenue</p>
              </div>
              <div>
                <p className="font-mono font-black text-sm text-white">
                  {formatNumber(totalAttendance)}
                </p>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>Fans</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full mt-3 mb-1" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #f472b6)" }}
            />
          </div>
          <div className="flex justify-between">
            <p className="text-[10px]" style={{ color: "#6b7280" }}>
              {tour.completed_stops || 0} shows done
            </p>
            <p className="text-[10px]" style={{ color: "#6b7280" }}>
              Turn {currentTurn} of {tour.turns_total || "?"}
            </p>
          </div>
        </div>

        {/* Vitals grid */}
        <div
          className="grid grid-cols-3 border-t"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          {[
            { label: "Health", value: health, color: health > 70 ? "#34d399" : "#fbbf24" },
            { label: "Momentum", value: momentum, color: "#a78bfa" },
            { label: "Fatigue", value: fatigue, color: fatigue > 60 ? "#f87171" : "#60a5fa" },
          ].map((v) => (
            <div
              key={v.label}
              className="px-3 py-3 text-center border-r last:border-r-0"
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <p className="font-mono font-black text-xl" style={{ color: v.color }}>{v.value}</p>
              <p className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "#9ca3af" }}>{v.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pending Opening Act Invites (opener's view) ─────────────────── */}
      {pendingInvites.length > 0 && (
        <CommandSection
          icon={Handshake}
          title="Tour Invitations"
          badge={pendingInvites.length}
          accentColor="#fb923c"
          defaultOpen
        >
          <div className="space-y-3 pt-3">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="rounded-2xl p-4"
                style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)" }}
              >
                <p className="text-sm font-black text-white mb-0.5">
                  {inv.headliner?.artist_name || 'An artist'} wants you to open!
                </p>
                <p className="text-[10px] mb-2" style={{ color: "#9ca3af" }}>
                  {(inv.tours?.tour_name) || 'Tour'} · {inv.tours?.region || ''} · {Math.round((Number(inv.revenue_split) || 0) * 100)}% revenue split
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespondInvite(inv.id, 'accepted')}
                    disabled={respondingInvite === inv.id}
                    className="flex-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                    style={{ background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondInvite(inv.id, 'declined')}
                    disabled={respondingInvite === inv.id}
                    className="flex-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                    style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CommandSection>
      )}

      {/* ── Choice Events (urgent — always shown open) ────────────────────── */}
      {choiceEvents.length > 0 && (
        <CommandSection
          icon={AlertCircle}
          title="Tour Decisions"
          badge={choiceEvents.length}
          accentColor="#fbbf24"
          defaultOpen
        >
          <div className="space-y-3 pt-3">
            {choiceEvents.map((evt) => {
              const choices = Array.isArray(evt.choices) ? evt.choices : [];
              return (
                <div
                  key={evt.id}
                  className="rounded-2xl p-4"
                  style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)" }}
                >
                  <p className="text-sm font-black text-white mb-1">
                    {evt.title || (evt.event_key || '').replace(/_/g, ' ') || 'Decision'}
                  </p>
                  <p className="text-xs mb-3" style={{ color: "#9ca3af" }}>
                    {evt.description || 'A decision needs to be made.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {choices.map((choice, ci) => (
                      <button
                        key={ci}
                        onClick={() => handleResolveChoice(evt.id, choice.id || `opt_${ci}`)}
                        disabled={resolvingChoice === evt.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                      >
                        {choice.label || `Option ${ci + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CommandSection>
      )}

      {/* ── Fatigue warning ───────────────────────────────────────────────── */}
      {fatigue > 40 && (
        <div
          className="flex items-start gap-3 rounded-2xl px-4 py-3"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: "#fca5a5" }}>
            High fatigue ({fatigue}%) — consider resting next turn to avoid bad events and performance drops.
          </p>
        </div>
      )}

      {/* ── Current action + rest toggle ──────────────────────────────────── */}
      <CommandSection icon={Zap} title="Current Action" accentColor="#fbbf24" defaultOpen>
        <div className="pt-3 space-y-3">
          <div
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: strategy.rest_next ? "rgba(96,165,250,0.08)" : "rgba(139,92,246,0.08)",
              border: `1px solid ${strategy.rest_next ? "rgba(96,165,250,0.2)" : "rgba(139,92,246,0.2)"}`,
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: strategy.rest_next ? "rgba(96,165,250,0.15)" : "rgba(139,92,246,0.15)" }}
            >
              {strategy.rest_next
                ? <Battery className="w-4 h-4 text-blue-400" />
                : <Music className="w-4 h-4 text-purple-400" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-white">
                {strategy.rest_next ? "Resting" : "Performing"}
              </p>
              <p className="text-[10px]" style={{ color: "#9ca3af" }}>
                {strategy.rest_next ? "Skipping next show to recover energy." : "Show scheduled for this turn."}
              </p>
            </div>
          </div>

          <button
            onClick={handleRestNext}
            disabled={loading}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-black transition-all disabled:opacity-50"
            style={{
              background: strategy.rest_next ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${strategy.rest_next ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: strategy.rest_next ? "#93c5fd" : "#9ca3af",
            }}
          >
            <div className="flex items-center gap-2">
              <Battery className="w-4 h-4" />
              Rest Next Turn
            </div>
            {strategy.rest_next && (
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "rgba(96,165,250,0.2)", color: "#93c5fd" }}
              >
                ACTIVE
              </span>
            )}
          </button>

          {/* Recent event */}
          {state.last_event_text && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <Zap className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[11px]" style={{ color: "#d1d5db" }}>{state.last_event_text}</p>
            </div>
          )}
        </div>
      </CommandSection>

      {/* ── Performance metrics ───────────────────────────────────────────── */}
      {(state.fan_reception != null || state.era_synergy != null || state.tour_review_score != null) && (
        <CommandSection icon={Star} title="Tour Performance" accentColor="#f472b6">
          <div className="pt-3 space-y-3">
            {state.fan_reception != null && (
              <VitalBar
                label="Fan Reception"
                value={Math.round(state.fan_reception)}
                color={state.fan_reception > 70 ? "#34d399" : state.fan_reception > 40 ? "#fbbf24" : "#f87171"}
              />
            )}
            {state.era_synergy != null && (
              <VitalBar
                label="Era Synergy"
                value={Math.round((state.era_synergy || 0) * 100)}
                color={state.era_synergy > 0.7 ? "#a78bfa" : state.era_synergy > 0.4 ? "#60a5fa" : "#6b7280"}
              />
            )}
            {state.setlist_vibe != null && (
              <VitalBar
                label="Setlist Vibe"
                value={Math.round(state.setlist_vibe)}
                color="#22d3ee"
              />
            )}
            {state.tour_review_score != null && (
              <VitalBar
                label="Tour Score"
                value={Math.round(state.tour_review_score)}
                color={state.tour_review_score > 70 ? "#34d399" : state.tour_review_score > 40 ? "#fbbf24" : "#f87171"}
              />
            )}
          </div>
        </CommandSection>
      )}

      {/* ── Opening Acts ──────────────────────────────────────────────────── */}
      {openingActs.length > 0 && (
        <CommandSection icon={Handshake} title="Opening Acts" badge={openingActs.length} accentColor="#c4b5fd">
          <div className="pt-3 space-y-2">
            {openingActs.map((opener) => (
              <div
                key={opener.id}
                className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">
                    {opener.profile?.artist_name || 'Opening Act'}
                  </p>
                  <p className="text-[10px]" style={{ color: "#9ca3af" }}>
                    {opener.profile?.career_stage || 'Unknown stage'} · {Math.round((Number(opener.revenue_split) || 0) * 100)}% revenue split
                  </p>
                </div>
                <span
                  className="text-[9px] font-black px-2 py-1 rounded-full shrink-0"
                  style={{
                    background: opener.status === 'active' ? "rgba(52,211,153,0.15)" : opener.status === 'declined' ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
                    color: opener.status === 'active' ? "#34d399" : opener.status === 'declined' ? "#f87171" : "#fbbf24",
                  }}
                >
                  {opener.status?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </CommandSection>
      )}

      {/* ── Crew ──────────────────────────────────────────────────────────── */}
      {crewMembers.length > 0 && (
        <CommandSection icon={Users} title="Tour Crew" badge={crewMembers.length} accentColor="#60a5fa">
          <div className="pt-3 space-y-2">
            {crewMembers.map((crew) => (
              <div
                key={crew.id}
                className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{crew.name}</p>
                  <p className="text-[10px] capitalize" style={{ color: "#9ca3af" }}>
                    {(crew.specialty || '').replace(/_/g, ' ')} · Q{crew.quality || 50}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-xs font-black"
                    style={{ color: (crew.morale || 70) > 50 ? "#34d399" : (crew.morale || 70) > 25 ? "#fbbf24" : "#f87171" }}
                  >
                    Morale {crew.morale || 70}
                  </p>
                  <p className="text-[10px]" style={{ color: "#6b7280" }}>
                    ${(crew.salary_per_turn || 0).toLocaleString()}/turn
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CommandSection>
      )}

      {/* ── Sponsorships ──────────────────────────────────────────────────── */}
      {sponsorships.length > 0 && (
        <CommandSection icon={DollarSign} title="Sponsorships" badge={sponsorships.length} accentColor="#34d399">
          <div className="pt-3 space-y-2">
            {sponsorships.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{sp.brand_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(Array.isArray(sp.alignment_tags) ? sp.alignment_tags : []).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[9px]"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#6b7280" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-black" style={{ color: "#34d399" }}>
                    +{formatCurrency(sp.payout || 0)}
                  </p>
                  {sp.clash_triggered && (
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <Shield className="w-3 h-3 text-red-400" />
                      <p className="text-[9px] text-red-400">Clash</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CommandSection>
      )}

      {/* ── Setlist ───────────────────────────────────────────────────────── */}
      <CommandSection
        icon={Music}
        title="Setlist"
        badge={(Array.isArray(tour.setlist) ? tour.setlist : []).length + " tracks"}
        accentColor="#34d399"
        defaultOpen={false}
      >
        <div className="pt-3 space-y-1.5 max-h-64 overflow-y-auto">
          {(Array.isArray(tour.setlist) ? tour.setlist : []).map((songId, i) => {
            const song = songData[songId];
            return (
              <div
                key={songId || i}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                <span className="font-mono text-[10px] w-5 text-center" style={{ color: "#4b5563" }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {song?.title || <span className="text-gray-600 text-xs">Loading…</span>}
                  </p>
                  {song && (song.quality > 0 || song.streams > 0) && (
                    <p className="text-[10px]" style={{ color: "#6b7280" }}>
                      {song.quality > 0 && <span className="mr-2">Q{song.quality}</span>}
                      {song.streams > 0 && <span>{formatNumber(song.streams)} streams</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {(!tour.setlist || tour.setlist.length === 0) && (
            <div className="text-center py-6">
              <Music className="w-6 h-6 mx-auto mb-2 opacity-30 text-gray-600" />
              <p className="text-xs" style={{ color: "#6b7280" }}>No setlist defined</p>
            </div>
          )}
        </div>
      </CommandSection>

      {/* ── Tour Schedule / Gigs ──────────────────────────────────────────── */}
      <CommandSection icon={Ticket} title="Tour Schedule" accentColor="#fbbf24" defaultOpen={false}>
        <div className="pt-3">
          {gigsLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(139,92,246,0.3)", borderTopColor: "#a78bfa" }} />
            </div>
          ) : upcomingGigs.length === 0 ? (
            <div className="text-center py-6">
              <Calendar className="w-6 h-6 mx-auto mb-2 opacity-30 text-gray-600" />
              <p className="text-xs" style={{ color: "#6b7280" }}>No shows scheduled</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {upcomingGigs.map((gig) => {
                const isCompleted = gig.status === 'Completed' || gig.status === 'completed';
                const isCurrent = gig.scheduled_turn === currentTurn;
                return (
                  <div
                    key={gig.id}
                    className="flex items-start justify-between gap-2 rounded-xl px-3 py-2.5"
                    style={{
                      background: isCurrent ? "rgba(139,92,246,0.1)" : isCompleted ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isCurrent ? "rgba(139,92,246,0.25)" : isCompleted ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)"}`,
                      opacity: isCompleted && !isCurrent ? 0.7 : 1,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{gig.venue_name || 'Venue TBD'}</p>
                      <p className="text-[10px]" style={{ color: "#9ca3af" }}>{gig.city || 'City TBD'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-xs font-black"
                        style={{ color: isCurrent ? "#a78bfa" : isCompleted ? "#34d399" : "#6b7280" }}
                      >
                        {isCurrent ? "NOW" : isCompleted ? "✓ Done" : `Turn ${gig.scheduled_turn}`}
                      </p>
                      {isCompleted && gig.tickets_sold > 0 && (
                        <p className="text-[9px]" style={{ color: "#34d399" }}>
                          {formatNumber(gig.tickets_sold)} sold
                        </p>
                      )}
                      {!isCompleted && gig.capacity > 0 && (
                        <p className="text-[9px]" style={{ color: "#6b7280" }}>
                          Cap {formatNumber(gig.capacity)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CommandSection>

      {/* ── Event History ─────────────────────────────────────────────────── */}
      {state.event_history && state.event_history.length > 0 && (
        <CommandSection icon={Activity} title="Event History" badge={state.event_history.length} accentColor="#60a5fa" defaultOpen={false}>
          <div className="pt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {state.event_history.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs rounded-xl px-3 py-2"
                style={{
                  background: event.type === 'positive' ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)",
                  border: `1px solid ${event.type === 'positive' ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}`,
                }}
              >
                <span style={{ color: event.type === 'positive' ? "#34d399" : "#f87171" }}>
                  {event.type === 'positive' ? '✓' : '✗'}
                </span>
                <span style={{ color: "#d1d5db" }}>{event.text}</span>
              </div>
            ))}
          </div>
        </CommandSection>
      )}

    </div>
  );
}
