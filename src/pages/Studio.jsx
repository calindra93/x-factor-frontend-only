import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Plus, Music2, X, Calendar, Users, Zap, Clock,
  Sparkles, Disc3, ChevronRight, BarChart3, MoreVertical,
  Inbox, FileText, Battery, Handshake, Check, Loader2,
  Music, Search, Scale, Shield, AlertTriangle, Crown, Lock,
  RotateCcw, Wrench
} from "lucide-react";
import { showToast } from "@/components/ui/toast-provider";
import { supabaseClient } from "@/lib/supabaseClient";
import { debugLog, shouldNavigateToPath } from "@/lib/debug";
import { createPageUrl } from "@/components/utils";

// ─── REAL BACKEND-INTEGRATED COMPONENTS ────────────────────────────────────
import SongWritingInterface from "@/components/studio/SongWritingInterface";
import RecordingWizard from "@/components/studio/RecordingWizard";
import ReleaseWizard from "@/components/studio/ReleaseWizard";
import SongLibrary from "@/components/studio/SongLibrary";
import ReleasedLibrary from "@/components/studio/ReleasedLibrary";

import ProjectCreationModal from "@/components/studio/ProjectCreationModal";
import RemixContestBrowser from "@/components/studio/RemixContestBrowser";
import RemixOpportunitiesFilter from "@/components/studio/RemixOpportunitiesFilter";

// ─── FONTS ─────────────────────────────────────────────────────────────────
const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
*{-webkit-font-smoothing:antialiased;}
.fd{font-family:'Bricolage Grotesque',sans-serif;}
.fb{font-family:'DM Sans',sans-serif;}
::-webkit-scrollbar{display:none;}
.sh{scrollbar-width:none;}
@keyframes subtlePulse{0%,100%{opacity:1}50%{opacity:0.6}}
.pulse{animation:subtlePulse 2.5s ease-in-out infinite;}
@keyframes glowBorder{0%,100%{opacity:0.4}50%{opacity:0.8}}
.glow-border{animation:glowBorder 3s ease-in-out infinite;}
`;

// ─── DATA FETCHING ───────────────────────────────────────────────────────
async function fetchStudioData(profile) {
  if (!profile?.id) return { songs: [], projects: [], releases: [], currentTurn: 0 };
  try {
    const [songsData, projectsData, releasesData, turnStates] = await Promise.all([
      base44.entities.Song.filter({ artist_id: profile.id }, "-created_date"),
      base44.entities.Project.filter({ artist_id: profile.id }, "-created_date"),
      base44.entities.Release.filter({ artist_id: profile.id }, "-release_date"),
      base44.entities.TurnState.list("-updated_at", 1).catch(() => []),
    ]);
    const currentTurn = Array.isArray(turnStates) && turnStates[0]
      ? (turnStates[0].last_completed_turn_id ?? turnStates[0].global_turn_id ?? turnStates[0].current_turn_id ?? 0)
      : 0;
    return {
      songs: Array.isArray(songsData) ? songsData : [],
      projects: Array.isArray(projectsData) ? projectsData : [],
      releases: Array.isArray(releasesData) ? releasesData : [],
      currentTurn,
    };
  } catch (error) {
    console.error('[Studio] Failed to fetch data:', error);
    return { songs: [], projects: [], releases: [], currentTurn: 0 };
  }
}

const ENERGY_COST = 15;
const INSPIRATION_COST = 10;

// ─── HELPER FORMATTERS ─────────────────────────────────────────────────────
const fmtNum = n => {
  if (!n && n !== 0) return "0";
  if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toLocaleString();
};

// ─── SHEET PRIMITIVE ──────────────────────────────────────────────────────
function Sheet({ onClose, children, full=false }) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="absolute inset-0 z-50 flex items-end"
      style={{background:"rgba(0,0,0,0.80)",backdropFilter:"blur(14px)"}}
      onClick={onClose}>
      <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
        transition={{type:"spring",damping:32,stiffness:340}}
        className={`fb w-full rounded-t-[28px] border-t border-white/[0.07] flex flex-col ${full?"h-[95%]":"max-h-[92%]"}`}
        style={{background:"linear-gradient(180deg,#13131a 0%,#0a0a0f 100%)"}}
        onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-white/[0.14]"/>
        </div>
        <div className="overflow-y-auto sh flex-1">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ─── ERA OVERVIEW CARD ────────────────────────────────────────────────────
function EraOverviewCard({ profile }) {
  const era = profile?.current_era;
  const defaultColor = "#a78bfa";

  if (!era) {
    return (
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.4}}
        className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
        <div className="relative p-3 flex flex-col items-center gap-2">
          <div className="w-full h-24 rounded-xl bg-white/[0.04] flex items-center justify-center">
            <Music2 size={24} className="text-white/10"/>
          </div>
          <p className="fd font-semibold text-white/25 text-sm text-center">No Active Era</p>
          <p className="fb text-[10px] text-white/15 text-center">Start a new era to track your momentum</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.4}}
      className="relative rounded-2xl overflow-hidden"
      style={{padding:"1px",background:`linear-gradient(135deg,${era.color||defaultColor}60,#ec489940,${era.color||defaultColor}30,transparent 70%)`}}>
      <div className="absolute inset-0 rounded-2xl glow-border pointer-events-none"
        style={{background:`linear-gradient(135deg,${era.color||defaultColor}25,transparent 50%,#ec489915)`}}/>
      <div className="relative rounded-[15px] overflow-hidden"
        style={{background:"linear-gradient(135deg,#110820 0%,#0c0820 50%,#0a0a0f 100%)"}}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-10 -right-6 w-36 h-36 rounded-full blur-3xl opacity-[0.2]" style={{background:era.color||defaultColor}}/>
          <div className="absolute bottom-0 left-6 w-24 h-24 rounded-full blur-3xl opacity-[0.1]" style={{background:"#ec4899"}}/>
        </div>
        <div className="relative p-3 flex flex-col gap-2">
          <span className="fb text-[8px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full border self-start"
            style={{color:era.color||defaultColor, borderColor:(era.color||defaultColor)+"40", background:(era.color||defaultColor)+"12"}}>ERA</span>
          <div className="relative w-full h-28 rounded-xl overflow-hidden bg-white/[0.04] flex items-center justify-center">
            {profile?.artist_image
              ? <img src={profile.artist_image} className="w-full h-full object-cover" alt="" onError={e=>e.target.style.display="none"}/>
              : <div className="w-full h-full flex items-center justify-center"
                  style={{background:`linear-gradient(135deg,${era.color||defaultColor}20,#ec489910,#0a0a0f)`}}>
                  <Music2 size={28} className="text-white/10"/>
                </div>
            }
            <div className="absolute inset-0 flex flex-col justify-end p-2.5"
              style={{background:"linear-gradient(180deg,transparent 30%,rgba(10,10,15,0.85) 100%)"}}>
              <p className="fd font-extrabold text-white tracking-tight leading-tight" style={{fontSize:"16px",letterSpacing:"-0.02em"}}>
                {era.name?.toUpperCase() || "UNTITLED ERA"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="fb text-[10px] text-white/45">
              Phase {era.phase || 1} — {era.phase_description || "Building Momentum"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Sparkles size={10} style={{color:era.color||defaultColor}}/>
              <span className="fb text-[10px] font-medium" style={{color:era.color||defaultColor}}>
                Hype: {era.hype_trend || "Rising"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Battery size={10} className="text-white/30"/>
              <span className="fb text-[10px] text-white/30">Fatigue: {profile?.fatigue || 0}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── STRATEGIC ACTIONS (Half-size, centered text) ────────────────────────
function StrategicActions({ onCollab, onSchedule, onLicensing, collabCount }) {
  const actions = [
    { label:"Collab Inbox", icon:Inbox,    color:"#34d399", onClick:onCollab, badge:collabCount },
    { label:"Schedule",     icon:Calendar, color:"#60a5fa", onClick:onSchedule },
    { label:"Licensing",    icon:Scale,    color:"#fb923c", onClick:onLicensing },
  ];
  return (
    <div>
      <p className="fb text-[9px] text-white/25 uppercase tracking-widest mb-1.5">Strategic Actions</p>
      <div className="flex gap-1.5">
        {actions.map(a=>(
          <motion.button key={a.label} whileTap={{scale:0.95}} onClick={a.onClick}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border border-white/[0.06] transition-all"
            style={{background:`linear-gradient(135deg,${a.color}08 0%,rgba(13,13,20,1) 100%)`}}>
            {a.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet-500 flex items-center justify-center">
                <span className="fb text-[7px] text-white font-bold">{a.badge}</span>
              </span>
            )}
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{background:a.color+"15"}}>
              <a.icon size={10} style={{color:a.color}}/>
            </div>
            <p className="fd font-semibold text-white text-[8px] leading-tight text-center">{a.label}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ─── COMPARISON CHART (Real release data, screenshot 3 style) ────────────
function ComparisonChart({ releases, onClose }) {
  const releasedItems = useMemo(() => {
    return releases
      .filter(r => {
        if (!r.lifecycle_state || r.lifecycle_state === "scheduled") return false;
        const pType = (r.project_type || "").toLowerCase();
        return pType !== "single";
      })
      .sort((a, b) => (b.lifetime_streams || 0) - (a.lifetime_streams || 0))
      .slice(0, 8);
  }, [releases]);

  const maxStreams = releasedItems.length > 0
    ? Math.max(...releasedItems.map(r => r.lifetime_streams || 0), 1)
    : 1;

  return (
    <Sheet onClose={onClose} full>
      <div className="p-5 pb-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="fd font-bold text-white text-xl">Comparison</h2>
          <button onClick={onClose}><X size={17} className="text-white/35"/></button>
        </div>
        <p className="fb text-sm text-white/30 mb-8">Global album units</p>

        {releasedItems.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3 size={32} className="text-white/10 mx-auto mb-3"/>
            <p className="fd font-semibold text-white/25 text-sm">No released projects yet</p>
            <p className="fb text-[10px] text-white/15 mt-1">Release music to see comparisons here</p>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-center gap-3 px-2 mb-8" style={{minHeight:220}}>
              {releasedItems.map((r, i) => {
                const streams = r.lifetime_streams || 0;
                const barH = Math.max(30, Math.round((streams / maxStreams) * 180));
                const colors = ["#7c3aed","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4"];
                const color = colors[i % colors.length];
                return (
                  <motion.div key={r.id} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:i*0.08}}
                    className="flex flex-col items-center gap-1.5" style={{width: Math.max(60, Math.min(80, 300 / releasedItems.length))}}>
                    <p className="fd font-bold text-white text-[11px]">{fmtNum(streams)}</p>
                    <div className="w-full rounded-xl overflow-hidden relative border border-white/[0.06]"
                      style={{height:barH, background:`linear-gradient(180deg,${color}40,${color}15)`}}>
                      {r.cover_artwork_url && (
                        <img src={r.cover_artwork_url} className="w-full h-full object-cover opacity-70" alt={r.title}
                          onError={e=>e.target.style.display="none"}/>
                      )}
                      <div className="absolute inset-0" style={{background:`linear-gradient(180deg,transparent 30%,${color}60 100%)`}}/>
                    </div>
                    <p className="fb text-[9px] text-white/35 text-center w-full truncate">{r.title || r.release_name}</p>
                  </motion.div>
                );
              })}
            </div>

            <p className="fb text-[10px] text-white/25 uppercase tracking-widest mb-3">Rankings</p>
            <div className="flex flex-col gap-2">
              {releasedItems.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <span className="fd font-bold text-white/20 w-5 text-center">{i+1}</span>
                  <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-white/[0.05]">
                    {r.cover_artwork_url
                      ? <img src={r.cover_artwork_url} className="w-full h-full object-cover" alt="" onError={e=>e.target.style.display="none"}/>
                      : <div className="w-full h-full flex items-center justify-center"><Disc3 size={14} className="text-white/20"/></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="fd font-semibold text-white text-sm truncate">{r.title || r.release_name}</p>
                    <p className="fb text-[11px] text-white/30">{r.project_type || "Release"} · {r.lifecycle_state}</p>
                  </div>
                  <div className="text-right">
                    <p className="fd font-bold text-white text-sm">{fmtNum(r.lifetime_streams || 0)}</p>
                    <p className="fb text-[10px] text-white/20">streams</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ─── MY CATALOG TAB ───────────────────────────────────────────────────────
function MyCatalogTab({ ownReleasedSongs }) {
  const [sampleable, setSampleable] = useState(() => {
    const map = {};
    ownReleasedSongs.forEach(s => { map[s.id] = !!s.is_sampleable; });
    return map;
  });
  const [toggling, setToggling] = useState({});

  const handleToggle = async (song) => {
    if (toggling[song.id]) return;
    const next = !sampleable[song.id];
    setToggling(t => ({ ...t, [song.id]: true }));
    setSampleable(prev => ({ ...prev, [song.id]: next }));
    try {
      await base44.entities.Song.update(song.id, { is_sampleable: next });
      showToast(next ? `"${song.title}" is now open for sampling` : `"${song.title}" removed from sampling`, "success");
    } catch {
      setSampleable(prev => ({ ...prev, [song.id]: !next }));
      showToast("Failed to update sampling setting", "error");
    } finally {
      setToggling(t => ({ ...t, [song.id]: false }));
    }
  };

  if (ownReleasedSongs.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText size={24} className="text-white/10 mx-auto mb-2"/>
        <p className="fd font-semibold text-white/25 text-sm">No released songs</p>
        <p className="fb text-[10px] text-white/15 mt-1">Release songs to make them available for licensing</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="fb text-[11px] text-white/55 mb-1">Choose which released songs other artists are allowed to sample:</p>
      {ownReleasedSongs.map(s => {
        const on = !!sampleable[s.id];
        const busy = !!toggling[s.id];
        return (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 overflow-hidden">
              {s.cover_artwork_url
                ? <img src={s.cover_artwork_url} className="w-full h-full object-cover" alt=""/>
                : <Music size={13} className="text-white/20"/>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="fd font-semibold text-white text-[13px] truncate">{s.title}</p>
              <p className="fb text-[10px] text-white/55">{s.genre} · Q:{s.quality || "?"}</p>
            </div>
            <button
              disabled={busy}
              onClick={() => handleToggle(s)}
              className="flex-shrink-0 disabled:opacity-40"
              title={on ? "Open for Sampling" : "Sampling Closed"}
            >
              <div className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-amber-500" : "bg-white/12"}`}>
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`}/>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── LICENSING & COVERS MODAL ─────────────────────────────────────────────
const NPC_TIER_CONFIG = {
  common:    { label: "Common",    color: "#9ca3af", Icon: Disc3 },
  rare:      { label: "Rare",      color: "#60a5fa", Icon: Sparkles },
  legendary: { label: "Legendary", color: "#f59e0b", Icon: Crown },
  viral:     { label: "Viral",     color: "#34d399", Icon: Zap },
};
const NPC_STRATEGY_INFO = {
  direct:         { label: "Direct Clearance", Icon: Shield,         color: "#34d399", desc: "Full cost, legal & safe", costMult: 1.0 },
  underground:    { label: "Underground",      Icon: AlertTriangle,  color: "#f59e0b", desc: "Half cost, may fail", costMult: 0.5 },
  anonymous_flip: { label: "Anonymous Flip",   Icon: Lock,           color: "#ef4444", desc: "Free but risky", costMult: 0 },
};

// ─── COLLAB INBOX MODAL ────────────────────────────────────────────────────────

const isValidUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

function _InboxEmptyState({ icon: Icon, label, sub }) {
  return (
    <div className="py-10 text-center">
      <Icon size={28} className="text-white/10 mx-auto mb-2" />
      <p className="fd font-semibold text-white/30 text-sm">{label}</p>
      <p className="fb text-[11px] text-white/20 mt-0.5">{sub}</p>
    </div>
  );
}

function _InboxSection({ label, children }) {
  return (
    <div>
      <p className="fb text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1.5">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function _InboxCard({ image, title, sub, busy, onAccept, onDecline }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/[0.1] shrink-0 overflow-hidden flex items-center justify-center">
        {image
          ? <img src={image} className="w-full h-full object-cover" alt="" onError={e => e.target.style.display='none'}/>
          : <Users size={13} className="text-white/30"/>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="fd font-semibold text-white text-[12px] truncate">{title}</p>
        <p className="fb text-[10px] text-white/40 truncate">{sub}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button disabled={busy} onClick={onAccept}
          className="w-7 h-7 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center hover:bg-green-500/30 transition-colors disabled:opacity-40">
          {busy ? <Loader2 size={12} className="text-green-400 animate-spin"/> : <Check size={12} className="text-green-400"/>}
        </button>
        <button disabled={busy} onClick={onDecline}
          className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center hover:bg-red-500/30 transition-colors disabled:opacity-40">
          <X size={12} className="text-red-400"/>
        </button>
      </div>
    </div>
  );
}

function _SentCard({ image, title, sub, busy, onCancel }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <Clock size={14} className="text-yellow-400 shrink-0"/>
      <div className="flex-1 min-w-0">
        <p className="fd font-semibold text-white text-[12px] truncate">{title}</p>
        <p className="fb text-[10px] text-white/40 truncate">{sub}</p>
      </div>
      <button disabled={busy} onClick={onCancel}
        className="shrink-0 text-[10px] text-red-400 hover:text-red-300 font-semibold disabled:opacity-40">
        {busy ? <Loader2 size={12} className="animate-spin"/> : "Cancel"}
      </button>
    </div>
  );
}

function CollabInboxModal({ profile, songs, onClose }) {
  const [tab, setTab] = useState("features");
  const [loading, setLoading] = useState(true);
  const [incomingFeatures, setIncomingFeatures] = useState([]);
  const [outgoingFeatures, setOutgoingFeatures] = useState([]);
  const [incomingSamples, setIncomingSamples] = useState([]);
  const [outgoingSamples, setOutgoingSamples] = useState([]);
  const [responding, setResponding] = useState(null);

  useEffect(() => { if (isValidUuid(profile?.id)) loadAll(); }, [profile?.id]);

  const loadAll = async () => {
    if (!isValidUuid(profile?.id)) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: collabRows }, { data: sampleRows }] = await Promise.all([
        supabaseClient
          .from("collaboration_requests")
          .select("*")
          .or(`target_artist_id.eq.${profile.id},requester_artist_id.eq.${profile.id}`)
          .in("status", ["pending", "accepted"]),
        supabaseClient
          .from("sample_requests")
          .select("*, source_song:source_song_id(id, title, quality, cover_artwork_url)")
          .or(`source_artist_id.eq.${profile.id},requester_id.eq.${profile.id}`)
          .in("status", ["pending"]),
      ]);

      // Fetch profiles for collabs
      const collabIds = [...new Set((collabRows || []).flatMap(r => [r.requester_artist_id, r.target_artist_id]))];
      const { data: collabProfiles } = collabIds.length
        ? await supabaseClient.from("profiles").select("id, artist_name, artist_image").in("id", collabIds)
        : { data: [] };
      const collabMap = {};
      (collabProfiles || []).forEach(p => { collabMap[p.id] = p; });

      // Fetch song titles for all song_ids referenced in collab rows
      const songIds = [...new Set((collabRows || []).map(r => r.song_id).filter(Boolean))];
      const { data: songRows } = songIds.length
        ? await supabaseClient.from("songs").select("id, title").in("id", songIds)
        : { data: [] };
      const songMap = {};
      (songRows || []).forEach(s => { songMap[s.id] = s.title; });

      const enrichedCollabs = (collabRows || []).map(r => ({
        ...r,
        requester: collabMap[r.requester_artist_id] || null,
        target: collabMap[r.target_artist_id] || null,
        songTitle: r.song_id ? (songMap[r.song_id] || r.collaboration_type || "Collaboration") : (r.collaboration_type || "Collaboration"),
      }));
      setIncomingFeatures(enrichedCollabs.filter(r => r.target_artist_id === profile.id && r.status === "pending"));
      setOutgoingFeatures(enrichedCollabs.filter(r => r.requester_artist_id === profile.id && r.status === "pending"));

      // Fetch profiles for samples
      const sampleIds = [...new Set((sampleRows || []).flatMap(r => [r.requester_id, r.source_artist_id].filter(Boolean)))];
      const { data: sampleProfiles } = sampleIds.length
        ? await supabaseClient.from("profiles").select("id, artist_name, artist_image").in("id", sampleIds)
        : { data: [] };
      const sampleMap = {};
      (sampleProfiles || []).forEach(p => { sampleMap[p.id] = p; });

      const enrichedSamples = (sampleRows || []).map(r => ({
        ...r,
        requesterProfile: sampleMap[r.requester_id] || null,
        sourceArtistProfile: sampleMap[r.source_artist_id] || null,
      }));
      setIncomingSamples(enrichedSamples.filter(r => r.source_artist_id === profile.id));
      setOutgoingSamples(enrichedSamples.filter(r => r.requester_id === profile.id));
    } catch (err) {
      console.error("[CollabInbox] load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFeatureRespond = async (collabId, accept) => {
    setResponding(collabId);
    try {
      if (accept) {
        const { data, error } = await supabaseClient.rpc('accept_collaboration', { p_collab_id: collabId });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error || 'Accept failed');
        showToast("Feature accepted!", "success");
      } else {
        const { data, error } = await supabaseClient.rpc('decline_collaboration', { p_collab_id: collabId });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error || 'Decline failed');
        showToast("Feature declined.", "info");
      }
      await loadAll();
    } catch (err) { showToast(`Error: ${err.message}`, "error"); }
    finally { setResponding(null); }
  };

  const handleFeatureCancel = async (collabId) => {
    setResponding(collabId);
    try {
      const collab = outgoingFeatures.find(c => c.id === collabId);
      const { error } = await supabaseClient.from("collaboration_requests").update({ status: "cancelled" }).eq("id", collabId);
      if (error) throw error;
      if (collab?.song_id) {
        await supabaseClient.from("songs").update({ status: "recorded" }).eq("id", collab.song_id).eq("status", "waiting_on_collab");
      }
      showToast("Request cancelled.", "info");
      await loadAll();
    } catch (err) { showToast(`Error: ${err.message}`, "error"); }
    finally { setResponding(null); }
  };

  const handleSampleRespond = async (request, decision) => {
    setResponding(request.id);
    try {
      const tsRows = await base44.entities.TurnState?.list("-updated_at", 1).catch(() => []);
      const globalTurnId = (Array.isArray(tsRows) ? tsRows[0] : null)?.global_turn_id || 0;
      const res = await base44.functions.invoke("sampleClearance", {
        action: "respondToSample",
        requestId: request.id,
        sourceArtistId: profile.id,
        decision,
        globalTurnId,
      });
      if (res?.success) {
        showToast(decision === "approved" ? "Sample approved!" : "Sample declined.", decision === "approved" ? "success" : "info");
      } else {
        throw new Error(res?.error || "Failed to respond");
      }
      await loadAll();
    } catch (err) { showToast(`Error: ${err.message}`, "error"); }
    finally { setResponding(null); }
  };

  const handleSampleCancel = async (requestId) => {
    setResponding(requestId);
    try {
      const { error } = await supabaseClient.from("sample_requests").update({ status: "cancelled" }).eq("id", requestId).eq("requester_id", profile.id);
      if (error) throw error;
      showToast("Sample request cancelled.", "info");
      await loadAll();
    } catch (err) { showToast(`Error: ${err.message}`, "error"); }
    finally { setResponding(null); }
  };

  const featureCount = incomingFeatures.length + outgoingFeatures.length;
  const sampleCount = incomingSamples.length + outgoingSamples.length;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-[90] flex items-start justify-center bg-black/70 backdrop-blur-sm px-4 pt-16"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[#0d0d11] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Inbox size={15} className="text-emerald-400"/>
            <h2 className="fd font-bold text-white text-sm">Inbox</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center">
            <X size={14} className="text-white/40"/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-4 shrink-0">
          {[{ id: "features", label: "Features", count: featureCount }, { id: "samples", label: "Samples", count: sampleCount }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-2.5 pt-2 px-1 mr-4 text-[12px] font-semibold border-b-2 transition-colors ${tab === t.id ? "border-emerald-400 text-white" : "border-transparent text-white/30"}`}>
              {t.label}
              {t.count > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 sh">
          {loading ? (
            <div className="py-10 flex justify-center">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"/>
            </div>
          ) : tab === "features" ? (
            <>
              {incomingFeatures.length === 0 && outgoingFeatures.length === 0 &&
                <_InboxEmptyState icon={Handshake} label="No feature requests" sub="Requests from other artists will appear here"/>}
              {incomingFeatures.length > 0 && (
                <_InboxSection label="Incoming">
                  {incomingFeatures.map(c => (
                    <_InboxCard key={c.id} image={c.requester?.artist_image}
                      title={c.requester?.artist_name || "Unknown Artist"}
                      sub={`Feature request · ${c.songTitle}${c.feature_fee > 0 ? ` · $${Number(c.feature_fee).toLocaleString()} fee` : ""}`}
                      busy={responding === c.id}
                      onAccept={() => handleFeatureRespond(c.id, true)}
                      onDecline={() => handleFeatureRespond(c.id, false)}/>
                  ))}
                </_InboxSection>
              )}
              {outgoingFeatures.length > 0 && (
                <_InboxSection label="Sent">
                  {outgoingFeatures.map(c => (
                    <_SentCard key={c.id} image={c.target?.artist_image}
                      title={c.target?.artist_name || "Unknown Artist"}
                      sub={`Awaiting response · ${c.songTitle}${c.feature_fee > 0 ? ` · $${Number(c.feature_fee).toLocaleString()} fee` : ""}`}
                      busy={responding === c.id}
                      onCancel={() => handleFeatureCancel(c.id)}/>
                  ))}
                </_InboxSection>
              )}
            </>
          ) : (
            <>
              {incomingSamples.length === 0 && outgoingSamples.length === 0 &&
                <_InboxEmptyState icon={Music} label="No sample requests" sub="Incoming sample requests will appear here"/>}
              {incomingSamples.length > 0 && (
                <_InboxSection label="Incoming">
                  {incomingSamples.map(r => (
                    <_InboxCard key={r.id} image={r.requesterProfile?.artist_image}
                      title={r.requesterProfile?.artist_name || "Unknown Artist"}
                      sub={`Sample request · "${r.source_song?.title || "?"}" · $${Number(r.fee_offered || 0).toLocaleString()}`}
                      busy={responding === r.id}
                      onAccept={() => handleSampleRespond(r, "approved")}
                      onDecline={() => handleSampleRespond(r, "rejected")}/>
                  ))}
                </_InboxSection>
              )}
              {outgoingSamples.length > 0 && (
                <_InboxSection label="Sent">
                  {outgoingSamples.map(r => (
                    <_SentCard key={r.id} image={r.sourceArtistProfile?.artist_image}
                      title={r.sourceArtistProfile?.artist_name || "Unknown Artist"}
                      sub={`Awaiting response · "${r.source_song?.title || "?"}" · $${Number(r.fee_offered || 0).toLocaleString()}`}
                      busy={responding === r.id}
                      onCancel={() => handleSampleCancel(r.id)}/>
                  ))}
                </_InboxSection>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── LICENSING & COVERS MODAL ──────────────────────────────────────────────────

function LicensingCoversModal({ isOpen, onClose, songs, releases: _releases, profile: _profile }) {
  const [tab, setTab] = useState("npc_samples");
  const [searchQuery, setSearchQuery] = useState("");
  const [sampleableSongs, setSampleableSongs] = useState([]);
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feeInput, setFeeInput] = useState({});
  const [npcSources, setNpcSources] = useState([]);
  const [npcTierFilter, setNpcTierFilter] = useState("all");
  const [selectedNpcSource, setSelectedNpcSource] = useState(null);
  const [selectedNpcStrategy, setSelectedNpcStrategy] = useState(null);
  const [expandedArtist, setExpandedArtist] = useState(null);
  const [expandedCoverArtist, setExpandedCoverArtist] = useState(null);

  const getQualitySignal = useCallback((quality) => {
    const q = Number(quality || 0);
    if (q >= 90) return { label: "Elite", tone: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10" };
    if (q >= 75) return { label: "Strong", tone: "text-sky-300 border-sky-400/30 bg-sky-500/10" };
    if (q >= 60) return { label: "Solid", tone: "text-violet-300 border-violet-400/30 bg-violet-500/10" };
    return { label: "Rough", tone: "text-amber-300 border-amber-400/30 bg-amber-500/10" };
  }, []);

  const getPopularitySignal = useCallback((streams) => {
    const total = Number(streams || 0);
    if (total >= 1000000) return { label: "Big Record", tone: "text-pink-300 border-pink-400/30 bg-pink-500/10" };
    if (total >= 100000) return { label: "Buzzing", tone: "text-cyan-300 border-cyan-400/30 bg-cyan-500/10" };
    if (total >= 10000) return { label: "Niche Motion", tone: "text-indigo-300 border-indigo-400/30 bg-indigo-500/10" };
    return { label: "Low Profile", tone: "text-white/65 border-white/15 bg-white/[0.04]" };
  }, []);

  const getSamplePotential = useCallback((song) => {
    const quality = Number(song?.quality || 0);
    const streams = Number(song?.release?.lifetime_streams || 0);
    if (quality >= 85 && streams >= 100000) return { label: "High hype potential", tone: "text-emerald-200" };
    if (quality >= 75 || streams >= 50000) return { label: "Good flip potential", tone: "text-sky-200" };
    if (quality >= 60) return { label: "Playable source", tone: "text-violet-200" };
    return { label: "More about vibe than impact", tone: "text-white/55" };
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSampleableSongs();
      loadAllSongs();
      loadNpcSources();
    } else {
      setSelectedNpcSource(null);
      setSelectedNpcStrategy(null);
      setExpandedArtist(null);
      setExpandedCoverArtist(null);
    }
  }, [isOpen]);

  const loadSampleableSongs = async () => {
    if (!_profile?.id) return;
    try {
      const { data: songsData, error } = await supabaseClient
        .from("songs")
        .select("id, title, artist_id, genre, quality, release_status, is_sampleable, is_remix, length_minutes, length_seconds, cover_artwork_url")
        .eq("release_status", "released")
        .neq("artist_id", _profile.id)
        .eq("is_remix", false)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const artistIds = [...new Set((songsData || []).map(s => s.artist_id).filter(Boolean))];
      const { data: artistProfiles } = artistIds.length
        ? await supabaseClient.from("profiles").select("id, artist_name, artist_image").in("id", artistIds)
        : { data: [] };
      const artistProfileMap = {};
      (artistProfiles || []).forEach(p => { artistProfileMap[p.id] = p; });

      const enriched = (songsData || []).map(s => ({
        ...s,
        artist_name: artistProfileMap[s.artist_id]?.artist_name || "Unknown Artist",
        artist_image: artistProfileMap[s.artist_id]?.artist_image || null,
      }));
      const sampleable = enriched.filter(s => s.is_sampleable);
      setSampleableSongs(sampleable.length > 0 ? sampleable : enriched);
    } catch (e) {
      console.error("[LicensingCovers] Failed to load sampleable songs:", e);
    }
  };

  const loadAllSongs = async () => {
    setLoading(true);
    try {
      const { data: songsData, error } = await supabaseClient
        .from("songs")
        .select("id, title, artist_id, genre, quality, release_status, is_remix, length_minutes, length_seconds, cover_artwork_url, release:release_id(id, lifetime_streams, lifecycle_state)")
        .eq("release_status", "released")
        .neq("artist_id", _profile.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const allSongsRaw = songsData || [];
      const artistIds = [...new Set(allSongsRaw.map(s => s.artist_id))];
      const { data: artistProfiles } = artistIds.length
        ? await supabaseClient.from("profiles").select("id, artist_name, artist_image").in("id", artistIds)
        : { data: [] };
      const artistProfileMap = {};
      (artistProfiles || []).forEach(p => { artistProfileMap[p.id] = p; });
      setAllSongs(allSongsRaw.map(s => ({
        ...s,
        artist_name: artistProfileMap[s.artist_id]?.artist_name || "Unknown Artist",
        artist_image: artistProfileMap[s.artist_id]?.artist_image || null,
      })));
    } catch {
      console.error("[LicensingCovers] Failed to load songs:");
    } finally {
      setLoading(false);
    }
  };

  const loadNpcSources = async () => {
    try {
      const { data } = await supabaseClient
        .from("sample_sources")
        .select("*")
        .eq("is_active", true)
        .order("tier");
      setNpcSources(data || []);
    } catch {
      console.error("[LicensingCovers] Failed to load NPC sources:");
    }
  };

  const filteredNpcSources = useMemo(() => {
    let list = npcSources;
    if (npcTierFilter !== "all") list = list.filter(s => s.tier === npcTierFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.artist_name.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
      );
    }
    return list;
  }, [npcSources, npcTierFilter, searchQuery]);

  const handleNpcSampleRequest = async () => {
    if (creating || !_profile?.id || !selectedNpcSource || !selectedNpcStrategy) return;
    const strat = NPC_STRATEGY_INFO[selectedNpcStrategy];
    const cost = Math.floor(selectedNpcSource.base_cost * strat.costMult);
    if (cost > 0 && (_profile.cash_balance || 0) < cost) {
      showToast(`Insufficient funds. Need $${cost.toLocaleString()}`, "error");
      return;
    }
    setCreating(true);
    try {
      const tsRows = await base44.entities.TurnState?.list("-updated_at", 1).catch(() => []);
      const globalTurnId = (Array.isArray(tsRows) ? tsRows[0] : null)?.global_turn_id || 0;
      const res = await base44.functions.invoke("sampleClearance", {
        action: "requestNPCSample",
        requesterId: _profile.id,
        sampleSourceId: selectedNpcSource.id,
        clearanceStrategy: selectedNpcStrategy,
        globalTurnId,
      });
      if (res?.success) {
        const stratLabel = selectedNpcStrategy === "anonymous_flip" ? "Flipping anonymously" : selectedNpcStrategy === "underground" ? "Underground clearance started" : "Direct clearance started";
        showToast(`${stratLabel} for \"${selectedNpcSource.name}\"! ${cost > 0 ? `$${cost.toLocaleString()} paid.` : ""}`, "success");
        setSelectedNpcSource(null);
        setSelectedNpcStrategy(null);
        onClose();
      } else {
        showToast(res?.error || "Failed to submit sample request", "error");
      }
    } catch {
      console.error("[LicensingCovers] NPC sample request failed:");
      showToast("Failed to submit sample request", "error");
    } finally {
      setCreating(false);
    }
  };

  // For covers: other artists' released songs (no clearance needed)
  const coverableSongs = useMemo(() => {
    if (!searchQuery) return allSongs;
    const q = searchQuery.toLowerCase();
    return allSongs.filter(s =>
      (s.title || "").toLowerCase().includes(q) ||
      (s.genre || "").toLowerCase().includes(q) ||
      (s.artist_name || "").toLowerCase().includes(q)
    );
  }, [allSongs, searchQuery]);

  // Group coverableSongs by artist (same structure as artistGroups)
  const coverArtistGroups = useMemo(() => {
    const groups = {};
    coverableSongs.forEach(song => {
      const artistId = song.artist_id;
      if (!groups[artistId]) {
        groups[artistId] = { artistId, artistName: song.artist_name || "Unknown Artist", artistImage: song.artist_image || null, songs: [] };
      }
      groups[artistId].songs.push(song);
    });
    return Object.values(groups);
  }, [coverableSongs]);

  // For samples: group by artist, filtered by search
  const artistGroups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = searchQuery
      ? sampleableSongs.filter(s => 
          (s.title || "").toLowerCase().includes(q) || 
          (s.genre || "").toLowerCase().includes(q) ||
          (s.artists?.artist_name || s.artist_name || "").toLowerCase().includes(q)
        )
      : sampleableSongs;
    
    // Group by artist
    const groups = {};
    filtered.forEach(song => {
      const artistId = song.artist_id;
      const artistName = song.artists?.artist_name || song.artist_name || "Unknown Artist";
      if (!groups[artistId]) {
        groups[artistId] = { artistId, artistName, artistImage: song.artist_image || null, songs: [] };
      }
      groups[artistId].songs.push(song);
    });
    
    return Object.values(groups).slice(0, 20);
  }, [sampleableSongs, searchQuery]);

  // Player's own released songs (available for licensing out)
  const ownReleasedSongs = useMemo(() => {
    return songs.filter(s => s.release_status === "released" || s.status === "released");
  }, [songs]);

  // Sample: submit a clearance request via edge function (requires is_sampleable=true)
  const handleSample = async (sourceSong) => {
    if (creating || !_profile?.id) return;
    const fee = parseInt(feeInput[sourceSong.id] || "200", 10);
    if (isNaN(fee) || fee < 50) {
      showToast("Minimum sample fee is $50", "error");
      return;
    }
    if ((_profile.cash_balance || 0) < fee) {
      showToast(`Insufficient funds. You need $${fee.toLocaleString()} to submit this request.`, "error");
      return;
    }
    setCreating(true);
    try {
      const tsRows = await base44.entities.TurnState?.list("-updated_at", 1).catch(() => []);
      const globalTurnId = (Array.isArray(tsRows) ? tsRows[0] : null)?.global_turn_id || 0;
      const res = await base44.functions.invoke("socialMedia", {
        action: "requestSample",
        artistId: _profile.id,
        sourceSongId: sourceSong.id,
        feeOffered: fee,
        globalTurnId,
      });
      if (res?.success) {
        showToast(`Sample request sent for "${sourceSong.title}"! The artist will be notified.`, "success");
        onClose();
      } else {
        showToast(res?.error || "Failed to send sample request", "error");
      }
    } catch {
      console.error("[LicensingCovers] Failed to request sample:");
      showToast("Failed to send sample request", "error");
    } finally {
      setCreating(false);
    }
  };

  // Cover: direct song creation, no clearance needed. Cleans up redundant metadata.
  const handleCover = async (sourceSong) => {
    if (creating || !_profile?.id) return;
    if ((_profile.energy || 0) < ENERGY_COST) {
      showToast("Not enough energy to create a cover", "error");
      return;
    }

    setCreating(true);
    try {
      const sourceQuality = Number(sourceSong.quality || 55);
      const inheritedQuality = Math.max(45, Math.min(95, Math.round(sourceQuality * 0.82 + 8)));
      await base44.entities.Song.create({
        artist_id: _profile.id,
        title: `${sourceSong.title} (Cover)`,
        genre: sourceSong.genre || _profile?.genre || "Pop",
        duration: sourceSong.duration || 210,
        length_minutes: sourceSong.length_minutes || 3,
        length_seconds: sourceSong.length_seconds || 30,
        status: "unrecorded",
        release_status: "unreleased",
        quality: inheritedQuality,
        song_type: "Standard",
        is_remix: true,
        original_song_id: sourceSong.id,
        remix_type: "cover",
        metadata: {
          original_title: sourceSong.title,
          original_artist_name: sourceSong.artist_name,
          source_quality: sourceSong.quality || null,
          source_streams: sourceSong.release?.lifetime_streams || 0,
        },
      });

      await base44.entities.ArtistProfile.update(_profile.id, {
        energy: Math.max(0, (_profile.energy || 0) - ENERGY_COST),
      });

      showToast(`Cover of "${sourceSong.title}" added to your songs!`, "success");
      onClose();
    } catch {
      console.error("[LicensingCovers] Failed to create cover:");
      showToast("Failed to create cover", "error");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-3 pb-[var(--app-bottom-nav-offset)] pt-[var(--app-top-bar-offset)]"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden max-h-[min(680px,85vh)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-white text-base font-bold">Licensing & Covers</h2>
              <p className="text-white/60 text-[11px]">Sample, cover, or license songs</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center">
            <X size={14} className="text-white/40"/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/[0.06] px-4 flex-shrink-0 overflow-x-auto">
          {[{id:"npc_samples",label:"Sample Library"},{id:"sample",label:"Player Samples"},{id:"cover",label:"Covers"},{id:"my_licenses",label:"My Catalog"}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setSearchQuery("");}}
              className={`pb-2 mr-3 fb font-semibold text-[11px] transition-all whitespace-nowrap ${tab===t.id?"text-white border-b-2 border-purple-500":"text-white/30"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        {(tab === "sample" || tab === "cover" || tab === "npc_samples") && (
          <div className="px-4 py-2 border-b border-white/[0.06] flex-shrink-0 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25"/>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                placeholder={tab === "npc_samples" ? "Search samples by name, artist, or genre..." : "Search songs by title or genre..."}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-white fb text-sm outline-none placeholder:text-white/20"/>
            </div>
            {tab === "npc_samples" && (
              <div className="flex gap-1.5">
                {["all","viral","common","rare","legendary"].map(t=>(
                  <button key={t} onClick={()=>setNpcTierFilter(t)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                      npcTierFilter===t?"bg-white/10 border-white/20 text-white":"border-white/[0.06] text-white/30 hover:text-white/50"}`}>
                    {t==="all"?"All":NPC_TIER_CONFIG[t]?.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto sh p-4">
          {/* ── NPC SAMPLE LIBRARY TAB ── */}
          {tab === "npc_samples" && (
            <>
              {filteredNpcSources.length === 0 ? (
                <div className="py-12 text-center">
                  <Music size={24} className="text-white/10 mx-auto mb-2"/>
                  <p className="fd font-semibold text-white/25 text-base">No samples found</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredNpcSources.map(source => {
                    const tier = NPC_TIER_CONFIG[source.tier] || NPC_TIER_CONFIG.common;
                    const TierIcon = tier.Icon;
                    const isSelected = selectedNpcSource?.id === source.id;
                    return (
                      <button key={source.id} onClick={()=>{setSelectedNpcSource(isSelected?null:source);setSelectedNpcStrategy(null);}}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected?"border-amber-500/30 bg-amber-500/5":"border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:tier.color+"15"}}>
                            <TierIcon size={14} style={{color:tier.color}}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-semibold truncate">{source.name}</p>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-bold" style={{color:tier.color,borderColor:tier.color+"40",background:tier.color+"10"}}>{tier.label}</span>
                            </div>
                            <p className="text-white/60 text-[11px]">{source.artist_name} · {source.genre}</p>
                            <p className="text-white/50 text-[10px] mt-0.5">{source.description}</p>
                            <div className="flex gap-3 mt-1 flex-wrap">
                              <span className="text-[10px] text-white/55">💰 ${source.base_cost.toLocaleString()}</span>
                              <span className="text-[10px] text-white/55">🎵 +{source.quality_boost} quality</span>
                              {source.clout_boost > 0 && <span className="text-[10px] text-white/55">⚡ +{source.clout_boost} clout</span>}
                              {source.hype_boost > 0 && <span className="text-[10px] text-white/55">🔥 +{source.hype_boost} hype</span>}
                            </div>
                          </div>
                        </div>

                        {/* Strategy selection inline when selected */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
                              className="mt-2 pt-2 border-t border-white/[0.06] overflow-hidden" onClick={e=>e.stopPropagation()}>
                              <p className="text-white/60 text-[10px] uppercase tracking-widest mb-1.5">Clearance Strategy</p>
                              <div className="space-y-1">
                                {Object.entries(NPC_STRATEGY_INFO).map(([key, strat])=>{
                                  const StratIcon = strat.Icon;
                                  const cost = Math.floor(source.base_cost * strat.costMult);
                                  const canAfford = (_profile?.cash_balance||0) >= cost || cost === 0;
                                  const isActive = selectedNpcStrategy === key;
                                  return (
                                    <button key={key} onClick={()=>setSelectedNpcStrategy(key)} disabled={!canAfford && cost>0}
                                      className={`w-full text-left p-2 rounded-lg border flex items-center gap-2 transition-all ${
                                        isActive?"border-amber-500/30 bg-amber-500/5"
                                        :canAfford||cost===0?"border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03]"
                                        :"border-white/[0.04] bg-white/[0.01] opacity-40"}`}>
                                      <StratIcon size={12} style={{color:strat.color}}/>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-white text-[11px] font-semibold">{strat.label}</p>
                                        <p className="text-white/50 text-[9px]">{strat.desc}</p>
                                      </div>
                                      <span className="text-white/70 text-[11px] font-bold">{cost>0?`$${cost.toLocaleString()}`:"Free"}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <motion.button whileTap={{scale:0.95}} disabled={!selectedNpcStrategy||creating}
                                onClick={handleNpcSampleRequest}
                                className="w-full mt-2 py-2 rounded-lg fd font-semibold text-white text-sm disabled:opacity-30"
                                style={{background:"linear-gradient(90deg,#d97706,#f59e0b)"}}>
                                {creating?"Submitting...":"Confirm Sample"}
                              </motion.button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="fb text-[11px] text-white/60">
                  <b>Direct Clearance:</b> Full price, safe & legal. Takes 1-3 turns.<br/>
                  <b>Underground:</b> Half price but may fail, defaulting to anonymous flip.<br/>
                  <b>Anonymous Flip:</b> Free, but high controversy risk if your song goes viral.
                </p>
              </div>
            </>
          )}

          {tab === "sample" && (
            <>
              {loading ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto"/>
                </div>
              ) : artistGroups.length === 0 ? (
                <div className="py-12 text-center">
                  <Music size={24} className="text-white/10 mx-auto mb-2"/>
                  <p className="fd font-semibold text-white/25 text-base">No songs available</p>
                  <p className="fb text-[11px] text-white/50 mt-1">Released songs from other artists will appear here</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {artistGroups.map(group => {
                    const isExpanded = expandedArtist === group.artistId;
                    return (
                      <div key={group.artistId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <button
                          onClick={() => setExpandedArtist(isExpanded ? null : group.artistId)}
                          className="w-full p-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden border border-white/[0.1]">
                            {group.artistImage
                              ? <img src={group.artistImage} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}/>
                              : null}
                            <Users size={14} className="text-orange-400" style={{ display: group.artistImage ? 'none' : 'block' }}/>
                          </div>
                          <div className="flex-1 text-left">
                            <p className="fd font-semibold text-white text-[13px]">{group.artistName}</p>
                            <p className="fb text-[10px] text-white/55">{group.songs.length} song{group.songs.length !== 1 ? 's' : ''}</p>
                          </div>
                          <ChevronRight size={14} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-white/[0.06] overflow-hidden">
                              <div className="max-h-[280px] overflow-y-auto sh p-2 space-y-1.5">
                                {group.songs.map(s => {
                                  const mins = Number(s.length_minutes) || 0;
                                  const secs = String(Number(s.length_seconds) || 0).padStart(2, "0");
                                  const coverArt = s.cover_artwork_url;
                                  return (
                                    <div key={s.id} className="flex flex-col gap-2 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 overflow-hidden">
                                          {coverArt
                                            ? <img src={coverArt} className="w-full h-full object-cover" alt="" onError={e => e.target.style.display = 'none'}/>
                                            : <Music size={12} className="text-white/20"/>
                                          }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="fd font-semibold text-white text-[12px] truncate">{s.title}</p>
                                          <p className="fb text-[9px] text-white/55">{s.genre} · {mins}:{secs} · Q:{s.quality || "?"}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="fb text-[9px] text-white/60">Offer:</span>
                                        <input
                                          type="number" min="50" step="50"
                                          value={feeInput[s.id] ?? "200"}
                                          onChange={e => setFeeInput(prev => ({ ...prev, [s.id]: e.target.value }))}
                                          className="w-20 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-white fb text-[11px] outline-none"
                                        />
                                        <motion.button whileTap={{ scale: 0.95 }} disabled={creating}
                                          onClick={() => handleSample(s)}
                                          className="flex-1 px-2.5 py-1.3 rounded-lg fd font-semibold text-white text-[10px] disabled:opacity-30"
                                          style={{ background: "linear-gradient(90deg,#f59e0b,#d97706)" }}>
                                          {creating ? "Sending..." : "Request Sample"}
                                        </motion.button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="fb text-[11px] text-white/60">
                  Tap an artist to view their songs. Set your offer price and submit a sample request. The artist will be notified and can approve or reject it.
                </p>
              </div>
            </>
          )}
          {tab === "cover" && (
            <>
              {loading ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto"/>
                </div>
              ) : coverArtistGroups.length === 0 ? (
                <div className="py-12 text-center">
                  <Music size={24} className="text-white/10 mx-auto mb-2"/>
                  <p className="fd font-semibold text-white/25 text-sm">No songs available</p>
                  <p className="fb text-[10px] text-white/15 mt-1">Other artists' released songs will appear here</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {coverArtistGroups.map(group => {
                    const isExpanded = expandedCoverArtist === group.artistId;
                    return (
                      <div key={group.artistId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <button
                          onClick={() => setExpandedCoverArtist(isExpanded ? null : group.artistId)}
                          className="w-full p-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden border border-white/[0.1]">
                            {group.artistImage
                              ? <img src={group.artistImage} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}/>
                              : null}
                            <Users size={14} className="text-purple-400" style={{ display: group.artistImage ? 'none' : 'block' }}/>
                          </div>
                          <div className="flex-1 text-left">
                            <p className="fd font-semibold text-white text-[13px]">{group.artistName}</p>
                            <p className="fb text-[10px] text-white/55">{group.songs.length} song{group.songs.length !== 1 ? 's' : ''}</p>
                          </div>
                          <ChevronRight size={14} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-90' : ''}`}/>
                        </button>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-white/[0.06] overflow-hidden">
                              <div className="max-h-[280px] overflow-y-auto sh p-2 space-y-1.5">
                                {group.songs.map(s => {
                                  const mins = Number(s.length_minutes) || 0;
                                  const secs = String(Number(s.length_seconds) || 0).padStart(2, "0");
                                  const qualitySignal = getQualitySignal(s.quality);
                                  const popularitySignal = getPopularitySignal(s.release?.lifetime_streams || 0);
                                  return (
                                    <div key={s.id} className="p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 overflow-hidden">
                                          {s.cover_artwork_url
                                            ? <img src={s.cover_artwork_url} className="w-full h-full object-cover" alt="" onError={e => e.target.style.display='none'}/>
                                            : <Music size={12} className="text-white/20"/>
                                          }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="fd font-semibold text-white text-[12px] truncate">{s.title}</p>
                                          <p className="fb text-[9px] text-white/55">{s.genre} · {mins}:{secs} · {fmtNum(s.release?.lifetime_streams || 0)}</p>
                                        </div>
                                        <motion.button whileTap={{scale:0.95}} disabled={creating}
                                          onClick={() => handleCover(s)}
                                          className="px-2.5 py-1.5 rounded-lg fd font-semibold text-white text-[10px] disabled:opacity-30 shrink-0"
                                          style={{background:"linear-gradient(90deg,#8b5cf6,#7c3aed)"}}>
                                          {creating ? "…" : "Cover"}
                                        </motion.button>
                                      </div>
                                      <div className="flex gap-1.5 mt-1.5 pl-[44px]">
                                        <span className={`fb text-[9px] px-1.5 py-0.5 rounded-full border ${qualitySignal.tone}`}>{qualitySignal.label}</span>
                                        <span className={`fb text-[9px] px-1.5 py-0.5 rounded-full border ${popularitySignal.tone}`}>{popularitySignal.label}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="fb text-[10px] text-white/30">
                  Covering costs {ENERGY_COST} energy. Creates an unrecorded song you'll need to record at a studio. No clearance needed.
                </p>
              </div>
            </>
          )}

          {tab === "my_licenses" && (
            <MyCatalogTab ownReleasedSongs={ownReleasedSongs} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── ROLLOUT TIMELINE ─────────────────────────────────────────────────────────
function RolloutTimeline({ releases, _songs, _projects, _profile, currentTurn, onOpenRelease, onEditRelease }) {
  const scheduledReleases = useMemo(() => {
    const filtered = releases
      .filter(r => {
        const state = (r.lifecycle_state || '').toLowerCase();
        const status = (r.release_status || r.project_status || '').toLowerCase();
        
        // Exclude releases that have progressed beyond Scheduled (Hot, Trending, Stable, etc.)
        // This fixes the bug where turn engine updated lifecycle_state but not release_status
        const hasProgressed = ['hot', 'trending', 'momentum', 'stable', 'declining', 'archived'].includes(state);
        
        // Only show truly scheduled releases
        const isScheduled = (state === 'scheduled' || status === 'scheduled') && !hasProgressed;
        
        // DATA CONSISTENCY WARNING: Detect invariant violations in development
        if (hasProgressed && status === 'scheduled') {
          console.warn('[RolloutTimeline] ⚠️ DATA INCONSISTENCY DETECTED:', {
            name: r.release_name,
            lifecycle_state: r.lifecycle_state,
            release_status: r.release_status,
            project_status: r.project_status,
            issue: 'lifecycle_state has progressed but release_status/project_status still show "scheduled"',
            fix_needed: 'Backend should auto-correct this via invariant enforcement'
          });
        }

        // Debug logging removed - lifecycle state tracking verified
        
        return isScheduled;
      })
      .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
    
    return filtered;
  }, [releases]);

  const recentReleases = useMemo(() => {
    const cutoffTurn = currentTurn > 0 ? currentTurn - 20 : 0;
    // Sanitize: lifecycle_state_changed_turn > 1e9 means it was stored as a Unix ms timestamp — treat as null
    const sanitizeTurn = (v) => (v && v < 1_000_000_000 ? v : null);
    return releases
      .filter(r => {
        const state = (r.lifecycle_state || '').toLowerCase();
        const hasProgressed = ['hot', 'trending', 'momentum', 'stable', 'declining', 'archived'].includes(state);
        if (!hasProgressed) return false;
        if (currentTurn > 0) {
          const changedTurn = sanitizeTurn(r.lifecycle_state_changed_turn) || sanitizeTurn(r.scheduled_turn);
          if (changedTurn) return changedTurn >= cutoffTurn;
          if (r.release_date) {
            const ageMs = Date.now() - new Date(r.release_date).getTime();
            return ageMs <= 30 * 24 * 60 * 60 * 1000;
          }
          return true;
        }
        return true;
      })
      .sort((a, b) => {
        const aTurn = sanitizeTurn(a.lifecycle_state_changed_turn) || sanitizeTurn(a.scheduled_turn) || 0;
        const bTurn = sanitizeTurn(b.lifecycle_state_changed_turn) || sanitizeTurn(b.scheduled_turn) || 0;
        if (bTurn !== aTurn) return bTurn - aTurn;
        return new Date(b.release_date || 0) - new Date(a.release_date || 0);
      })
      .slice(0, 5);
  }, [releases, currentTurn]);

  const getCountdown = (release) => {
    if (release.scheduled_turn && currentTurn) {
      const turnsLeft = release.scheduled_turn - currentTurn;
      if (turnsLeft <= 0) return 'Imminent';
      return `${turnsLeft} turn${turnsLeft === 1 ? '' : 's'}`;
    }
    if (!release.release_date) return 'TBD';
    const now = new Date();
    const target = new Date(release.release_date);
    const diffMs = target - now;
    if (diffMs <= 0) return 'Imminent';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  if (scheduledReleases.length === 0 && recentReleases.length === 0) {
    return (
      <div id="rollout-timeline" className="mt-4">
        <p className="fb text-[9px] text-white/25 uppercase tracking-widest mb-2">Rollout Timeline</p>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
          <Clock size={20} className="text-white/10 mx-auto mb-2"/>
          <p className="fd font-semibold text-white/20 text-xs">No scheduled releases</p>
          <p className="fb text-[9px] text-white/12 mt-1">Schedule a release to see your rollout timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div id="rollout-timeline" className="mt-4">
      <p className="fb text-[9px] text-white/25 uppercase tracking-widest mb-2">Rollout Timeline</p>

      {scheduledReleases.length > 0 && (
        <div className="mb-3">
          <p className="fb text-[8px] text-violet-400/60 uppercase tracking-widest mb-1.5">Upcoming</p>
          <div className="relative pl-4 border-l border-violet-500/20 space-y-2">
            {scheduledReleases.map((r) => {
              return (
                <motion.div key={r.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
                  className="relative rounded-xl overflow-hidden border border-violet-500/15 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-all"
                  onClick={() => onOpenRelease?.(r)}>
                  <div className="absolute left-[-21px] top-3 w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-[#0a0a0f]"/>
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-11 h-11 rounded-lg bg-white/[0.05] overflow-hidden flex-shrink-0">
                      {r.cover_artwork_url
                        ? <img src={r.cover_artwork_url} className="w-full h-full object-cover" alt="" onError={e=>{e.target.style.display='none'}}/>
                        : <div className="w-full h-full flex items-center justify-center"><Music size={14} className="text-white/15"/></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="fd font-semibold text-white text-xs truncate">{r.release_name || r.title}</p>
                      <p className="fb text-[9px] text-white/30">{r.project_type || 'Release'} · {r.primary_region || 'Global'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="fd font-bold text-violet-300 text-xs">{getCountdown(r)}</p>
                        <p className="fb text-[8px] text-white/20">countdown</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); onEditRelease?.(r); }}
                        className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-violet-500/20 border border-white/[0.08] flex items-center justify-center transition-all"
                        title="Edit scheduled release">
                        <MoreVertical size={10} className="text-white/50"/>
                      </button>
                    </div>
                  </div>
                  {r.surprise_drop && (
                    <div className="px-3 pb-2">
                      <span className="fb text-[8px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">SURPRISE DROP</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {recentReleases.length > 0 && (
        <div>
          <p className="fb text-[8px] text-emerald-400/60 uppercase tracking-widest mb-1.5">Recent</p>
          <div className="relative pl-4 border-l border-emerald-500/15 space-y-2">
            {recentReleases.map((r) => (
              <div key={r.id}
                className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-all"
                onClick={() => onOpenRelease?.(r)}>
                <div className="absolute left-[-21px] top-3 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0a0a0f]"/>
                <div className="flex items-center gap-3 p-3">
                  <div className="w-11 h-11 rounded-lg bg-white/[0.05] overflow-hidden flex-shrink-0">
                    {r.cover_artwork_url
                      ? <img src={r.cover_artwork_url} className="w-full h-full object-cover" alt="" onError={e=>{e.target.style.display='none'}}/>
                      : <div className="w-full h-full flex items-center justify-center"><Disc3 size={14} className="text-white/15"/></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="fd font-semibold text-white text-xs truncate">{r.release_name || r.title}</p>
                    <p className="fb text-[9px] text-white/30">{r.project_type || 'Release'} · {r.lifecycle_state}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="fd font-bold text-white/60 text-[10px]">{fmtNum(r.lifetime_streams || 0)}</p>
                    <p className="fb text-[8px] text-white/20">streams</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Studio() {
  const navigate = useNavigate();
  const mutationLockRef = useRef(false);
  const [profile, setProfile] = useState(null);
  const hasRedirectedRef = useRef(false);

  // ── State ──
  const [tab, setTab] = useState("unreleased");
  const [modal, setModal] = useState(null); // "write" | "project" | "record" | "release" | "compare" | "licensing"
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studioData, setStudioData] = useState({ songs: [], projects: [], releases: [] });
  const [recordingSongId, setRecordingSongId] = useState(null);
  const [licensingOpen, setLicensingOpen] = useState(false);
  const [collabCount, setCollabCount] = useState(0);
  const [showCollabSheet, setShowCollabSheet] = useState(false);
  const [showContestsSheet, setShowContestsSheet] = useState(false);
  const [showRemixSheet, setShowRemixSheet] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // ── Data Loading (profile + studio data + collab count in one pass, like Home.jsx) ──
  const loadData = useCallback(async () => {
    try {
      const userAccountId = localStorage.getItem('user_account_id');
      debugLog("studio-load", { userAccountId });

      if (!userAccountId) {
        const targetPath = createPageUrl("Auth");
        if (!hasRedirectedRef.current && shouldNavigateToPath(window.location.pathname, targetPath)) {
          hasRedirectedRef.current = true;
          navigate(targetPath, { replace: true });
        }
        setLoading(false);
        return;
      }

      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      if (!profiles || profiles.length === 0) {
        const targetPath = createPageUrl("Onboarding");
        if (!hasRedirectedRef.current && shouldNavigateToPath(window.location.pathname, targetPath)) {
          hasRedirectedRef.current = true;
          navigate(targetPath, { replace: true });
        }
        setLoading(false);
        return;
      }

      const p = profiles[0];
      if (!p?.id) { setLoading(false); return; }

      hasRedirectedRef.current = false;

      // Load active era for Studio header + EraOverviewCard
      if (p.active_era_id) {
        try {
          const era = await base44.entities.Era.get(p.active_era_id);
          if (era && era.is_active) {
            p.current_era = {
              name: era.era_name,
              phase: era.phase,
              phase_description: era.phase || 'Building Momentum',
              color: era.theme_color || '#a78bfa',
              hype_trend: era.momentum > 50 ? 'Rising' : era.momentum > 25 ? 'Steady' : 'Cooling',
              momentum: era.momentum,
              tension: era.tension,
            };
          }
        } catch (e) { console.error('[Studio] Failed to load era:', e); }
      }

      setProfile(p);

      const [data, collabResult, sampleResult] = await Promise.all([
        fetchStudioData(p),
        supabaseClient
          .from('collaboration_requests')
          .select('*', { count: 'exact', head: true })
          .eq('target_artist_id', p.id)
          .eq('status', 'pending'),
        supabaseClient
          .from('sample_requests')
          .select('*', { count: 'exact', head: true })
          .eq('source_artist_id', p.id)
          .eq('status', 'pending'),
      ]);

      setStudioData(data);
      setCollabCount((collabResult.error ? 0 : (collabResult.count || 0)) + (sampleResult.error ? 0 : (sampleResult.count || 0)));
      
      showToast("Studio data refreshed", "success");
    } catch (err) {
      console.error('[Studio] Failed to load data:', err);
      showToast("Failed to refresh studio data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // ── Derived Data ──
  const { songs, projects, releases, currentTurn } = studioData;

  const unrecordedSongs = useMemo(() =>
    songs.filter(s => s.status === "unrecorded")
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)), [songs]);

  const recordedSongs = useMemo(() =>
    songs.filter(s => s.status === "recorded" || s.status === "waiting_on_collab")
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)), [songs]);

  const activeProjects = useMemo(() =>
    projects.filter(p => {
      const pStatus = (p.project_status || '').toLowerCase();
      const status = (p.status || '').toLowerCase();
      const releaseStatus = (p.release_status || '').toLowerCase();
      if (pStatus === 'released' || status === 'released' || releaseStatus === 'released') return false;
      return true;
    }).sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)), [projects]);

  const releasedProjects = useMemo(() =>
    projects.filter(p => {
      const status = p.project_status || p.status;
      return status === "released";
    }).sort((a, b) => {
      const aDate = a.release_date || a.created_date || 0;
      const bDate = b.release_date || b.created_date || 0;
      return new Date(bDate) - new Date(aDate);
    }), [projects]);

  const releasedSongs = useMemo(() =>
    songs.filter(s => s.release_status === "released")
      .sort((a, b) => {
        const aDate = a.release_date || a.created_date || 0;
        const bDate = b.release_date || b.created_date || 0;
        return new Date(bDate) - new Date(aDate);
      }), [songs]);

  // ── Handlers ──
  const handleSaveSong = async (songData) => {
    if (mutationLockRef.current) return;
    mutationLockRef.current = true;

    try {
      const energyCost = ENERGY_COST;
      const inspirationCost = INSPIRATION_COST;

      if ((profile?.energy || 0) < energyCost) {
        showToast("Not enough energy to write a song", "error");
        return;
      }
      if ((profile?.inspiration || 0) < inspirationCost) {
        showToast("Not enough inspiration to write a song", "error");
        return;
      }

      // Deduct energy/inspiration server-side first
      await base44.entities.ArtistProfile.update(profile.id, {
        energy: Math.max(0, (profile.energy || 0) - energyCost),
        inspiration: Math.max(0, (profile.inspiration || 0) - inspirationCost)
      });

      const baseQuality = Math.floor(Math.random() * 21) + 40; // 40-60
      const collaboratorBoost = songData.collaborator_boost || 0;
      const sampleQualityBoost = songData.sample_quality_boost || 0;

      const songPayload = {
        artist_id: profile.id,
        title: songData.title,
        genre: songData.genre,
        length_minutes: songData.length_minutes,
        length_seconds: songData.length_seconds,
        song_type: songData.song_type || "Standard",
        cover_artwork_url: songData.cover_artwork_url || "",
        status: "unrecorded",
        release_status: "unreleased",
        quality: baseQuality + collaboratorBoost + sampleQualityBoost,
        collaborator_ids: songData.collaborator_ids || [],
      };

      // Add sample fields if a sample was selected
      if (songData.sample_source_id || songData.sampled_player_song_id) {
        if (songData.sample_source_type === 'npc' && songData.sample_source_id) {
          songPayload.sample_source_id = songData.sample_source_id;
        }
        if (songData.sampled_player_song_id) {
          songPayload.sampled_player_song_id = songData.sampled_player_song_id;
        }
        songPayload.sample_strategy = songData.sample_strategy;
        songPayload.sample_quality_boost = sampleQualityBoost;
        songPayload.sample_clout_boost = songData.sample_clout_boost || 0;
        songPayload.sample_controversy_chance = songData.sample_controversy_chance || 0;
        songPayload.sample_royalty_rate = songData.sample_royalty_rate || 0;
        songPayload.sample_clearance_status = songData.sample_strategy === 'anonymous_flip' ? 'unlicensed' : 'pending';
      }

      const newSong = await base44.entities.Song.create(songPayload);

      const resolvedGlobalTurnId = Number(currentTurn) || 0;

      // Create the appropriate clearance request after song creation
      if ((songData.sample_source_id || songData.sampled_player_song_id) && newSong?.id) {
        try {
          if (songData.sample_source_type === 'player_song' && songData.sampled_player_song_id) {
            await base44.functions.invoke('socialMedia', {
              action: 'requestSample',
              artistId: profile.id,
              sourceSongId: songData.sampled_player_song_id,
              feeOffered: songData.sample_cost || 0,
              clearanceStrategy: songData.sample_strategy,
              songId: newSong.id,
              globalTurnId: resolvedGlobalTurnId,
            });
          } else if (songData.sample_source_id) {
            await base44.functions.invoke('sampleClearance', {
              action: 'requestNPCSample',
              requesterId: profile.id,
              sampleSourceId: songData.sample_source_id,
              clearanceStrategy: songData.sample_strategy,
              songId: newSong.id,
              globalTurnId: resolvedGlobalTurnId,
            });
          }
        } catch (e) {
          console.error('[Studio] Failed to request sample clearance:', e);
          showToast("Failed to request sample clearance", "error");
        }
      }

      // Success feedback - close modal and refresh data
      showToast("Song created!", "success");
      setModal(null);
      await loadData();
    } catch (error) {
      console.error("[Studio] Failed to create song:", error);
      showToast("Failed to create song", "error");
    } finally {
      mutationLockRef.current = false;
    }
  };

  const handleCreateProject = async (projectData) => {
    if (mutationLockRef.current) return;
    mutationLockRef.current = true;

    try {
      await base44.entities.Project.create({
        artist_id: profile.id,
        name: projectData.name,
        type: projectData.type,
        description: projectData.description || "",
        tracklist: projectData.tracklist || [],
        cover_artwork_url: projectData.cover_artwork_url || "",
        project_status: "draft",
        status: "active",
      });

      showToast("Project created!", "success");
      setModal(null);
      await loadData();
    } catch (error) {
      console.error("[Studio] Failed to create project:", error);
      showToast("Failed to create project", "error");
    } finally {
      mutationLockRef.current = false;
    }
  };

  const handleUpdateProject = async (projectId, updates) => {
    try {
      await base44.entities.Project.update(projectId, updates);
      await loadData();
    } catch (error) {
      console.error("[Studio] Failed to update project:", error);
      showToast("Failed to update project", "error");
    }
  };

  const handleRecord = (song) => {
    setSelectedSong(song);
    setModal("record");
  };

  const handleRecordComplete = async () => {
    setModal(null);
    setSelectedSong(null);
    setRecordingSongId(null);
    await loadData();
  };

  const handleReleaseSingle = (song) => {
    setSelectedSong(song);
    setSelectedProject(null);
    setModal("release");
  };

  const handleReleaseProject = (project) => {
    setSelectedProject(project);
    setSelectedSong(null);
    setModal("release");
  };

  const handleReleaseComplete = async () => {
    setModal(null);
    setSelectedSong(null);
    setSelectedProject(null);
    await loadData();
  };

  const handleRepairOrphanedReleases = async () => {
    if (repairing) return;
    setRepairing(true);
    try {
      const { data, error } = await supabaseClient.rpc('repair_orphaned_releases');
      if (error) throw error;
      const fixed = data?.releases_fixed ?? 0;
      const songsLinked = data?.songs_linked ?? 0;
      if (fixed > 0) {
        showToast(`Fixed ${fixed} release${fixed !== 1 ? 's' : ''} — ${songsLinked} song${songsLinked !== 1 ? 's' : ''} re-linked`, "success");
        await loadData();
      } else {
        showToast("No orphaned releases found — everything looks good", "success");
      }
    } catch (e) {
      showToast("Repair failed — try again", "error");
      console.error('[Studio] repair_orphaned_releases error:', e);
    } finally {
      setRepairing(false);
    }
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:"#0a0a0f"}}>
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"/>
      </div>
    );
  }

  return (
    <>
      <style>{FONTS}</style>
      <div className="relative min-h-screen w-full" style={{background:"#0a0a0f"}}>

          {/* Subtle ambient */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-24 right-4 w-56 h-56 rounded-full blur-3xl opacity-[0.05]" style={{background:"#a78bfa"}}/>
            <div className="absolute top-48 -left-16 w-40 h-40 rounded-full blur-3xl opacity-[0.03]" style={{background:"#ec4899"}}/>
          </div>

          {/* ── HEADER (no back button, analytics button on right) ─── */}
          <div className="sticky top-0 z-30 isolate overflow-hidden flex items-center justify-between px-4 pt-4 pb-4 border-b border-white/[0.05]"
            style={{boxShadow:"0 10px 30px rgba(10,10,15,0.28)"}}>
            <div className="absolute inset-0 pointer-events-none"
              style={{background:"linear-gradient(180deg, rgba(10,10,15,0.992) 0%, rgba(10,10,15,0.982) 55%, rgba(10,10,15,0.975) 100%)",backdropFilter:"blur(32px) saturate(140%)",WebkitBackdropFilter:"blur(32px) saturate(140%)"}}/>
            <div className="absolute inset-x-0 bottom-0 h-5 pointer-events-none"
              style={{background:"linear-gradient(180deg, rgba(10,10,15,0) 0%, rgba(10,10,15,0.72) 45%, rgba(10,10,15,0.96) 100%)"}}/>
            <div className="relative z-10">
              <h1 className="fd font-extrabold text-white text-base leading-none">Studio</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="fb text-[9px] text-white/30">{profile?.region || "Unknown"}</span>
                <span className="text-white/15">·</span>
                <span className="fb text-[9px] font-medium" style={{color:profile?.current_era?.color || "#a78bfa"}}>
                  {profile?.current_era?.name ? `${profile.current_era.name} Era` : "No Era"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button whileTap={{scale:0.88}} onClick={loadData}
                className="relative z-10 w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.05] flex items-center justify-center"
                title="Refresh Data">
                <RotateCcw size={14} className="text-white/40"/>
              </motion.button>
              <motion.button whileTap={{scale:0.88}} onClick={()=>setModal("compare")}
                className="relative z-10 w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.05] flex items-center justify-center"
                title="Compare Releases">
                <BarChart3 size={14} className="text-white/40"/>
              </motion.button>
            </div>
          </div>

          {/* ── BODY ───────────────────────────────────────────────── */}
          <div className="overflow-y-auto sh px-3 pt-3 pb-24 flex flex-col gap-3">

            {/* Era Overview Card */}
            <EraOverviewCard profile={profile}/>

            {/* Write Song + Project CTAs */}
            <div className="flex gap-2">
              {[
                {label:"Write Song",  fn:()=>setModal("write"),   grad:"linear-gradient(135deg,#1a1030,#0d0d16)"},
                {label:"Project",   fn:()=>setModal("project"),  grad:"linear-gradient(135deg,#0d1428,#0d0d16)"},
              ].map(b=>(
                <motion.button key={b.label} whileTap={{scale:0.97}} onClick={b.fn}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl fd font-bold text-white text-[11px] border border-white/[0.07]"
                  style={{background:b.grad}}>
                  <Plus size={11}/> {b.label}
                </motion.button>
              ))}
            </div>

            {/* Strategic Actions (half-size) */}
            <StrategicActions
              onCollab={()=>setShowCollabSheet(true)}
              onSchedule={()=>{ /* Scroll to rollout timeline at bottom */ document.getElementById('rollout-timeline')?.scrollIntoView({behavior:'smooth'}); }}
              onLicensing={()=>setLicensingOpen(true)}
              collabCount={collabCount}
            />

            {/* Remix + Samples Row */}
            <div className="flex gap-1.5">
              {[
                { label: '🎛️ Remix Catalog', onClick: () => setShowRemixSheet(true),   color: '#8B5CF6' },
                { label: '🏆 Contests',        onClick: () => setShowContestsSheet(true), color: '#C9A84C' },
              ].map(btn => (
                <motion.button key={btn.label} whileTap={{scale:0.97}} onClick={btn.onClick}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl fd font-bold text-xs border border-white/[0.07] transition-all"
                  style={{background:`${btn.color}12`,color:btn.color}}>
                  {btn.label}
                </motion.button>
              ))}
            </div>

            {/* Discography Header */}
            <div className="flex items-center justify-between">
              <h3 className="fd font-bold text-white text-[13px]">Discography</h3>
              <button
                onClick={handleRepairOrphanedReleases}
                disabled={repairing}
                title="Repair orphaned releases"
                className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-amber-500/20 border border-white/[0.08] flex items-center justify-center transition-all disabled:opacity-40"
              >
                {repairing
                  ? <RotateCcw size={10} className="text-amber-400 animate-spin"/>
                  : <Wrench size={10} className="text-white/30 hover:text-amber-400"/>
                }
              </button>
            </div>

            {/* Unreleased | Released Tabs */}
            <div className="flex gap-0 border-b border-white/[0.06]">
              {["unreleased","released"].map(t=>(
                <button key={t} onClick={()=>setTab(t)}
                  className={`pb-2 mr-3 fb font-semibold text-[11px] capitalize transition-all ${tab===t?"text-white border-b-2 border-violet-500":"text-white/30"}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── UNRELEASED TAB (uses real SongLibrary component) ── */}
            {tab === "unreleased" && (
              <SongLibrary
                unrecordedSongs={unrecordedSongs.filter(s => s.release_status !== "released")}
                recordedSongs={recordedSongs.filter(s => s.release_status !== "released")}
                activeProjects={activeProjects}
                songs={songs}
                profile={profile}
                recordingSongId={recordingSongId}
                onRecord={handleRecord}
                onReleaseSingle={handleReleaseSingle}
                onReleaseProject={handleReleaseProject}
                onCreateRemix={() => {}}
                onUpdateProject={handleUpdateProject}
                onRefresh={loadData}
              />
            )}

            {/* ── RELEASED TAB (uses real ReleasedLibrary component) ── */}
            {tab === "released" && (
              <ReleasedLibrary
                releasedProjects={releasedProjects}
                releasedSongs={releasedSongs}
                songs={songs}
                releases={releases}
                profile={profile}
                onRefresh={loadData}
              />
            )}

            {/* ── ROLLOUT TIMELINE (dedicated section at bottom) ── */}
            <RolloutTimeline
              releases={releases}
              songs={songs}
              projects={projects}
              profile={profile}
              currentTurn={currentTurn}
              onEditRelease={(release) => {
                setSelectedSong(null);
                const proj = projects.find(p => p.id === release.project_id);
                if (proj) setSelectedProject(proj);
                else {
                  const songId = release.tracklist?.[0];
                  const s = songs.find(x => x.id === songId);
                  if (s) setSelectedSong(s);
                }
                setModal("release");
              }}
              onOpenRelease={(release) => {
                // Find the project for this release if it exists
                const proj = projects.find(p => p.id === release.project_id);
                if (proj) {
                  setSelectedProject(proj);
                  setSelectedSong(null);
                } else {
                  // It's a single — find the song from tracklist
                  const songId = release.tracklist?.[0];
                  const s = songs.find(x => x.id === songId);
                  if (s) setSelectedSong(s);
                  setSelectedProject(null);
                }
              }}
            />
          </div>

          {/* ── MODALS ─────────────────────────────────────────────── */}
          <AnimatePresence>
            {modal === "write" && (
              <SongWritingInterface
                key="write-modal"
                onClose={() => setModal(null)}
                onSave={handleSaveSong}
                unlockedGenre={profile?.genre || "Hip-Hop"}
                profile={profile}
                songs={songs}
              />
            )}

            {modal === "project" && (
              <ProjectCreationModal
                key="project-modal"
                isOpen={true}
                onClose={() => setModal(null)}
                songs={songs}
                projects={projects}
                profile={profile}
                onCreateProject={handleCreateProject}
              />
            )}

            {modal === "record" && selectedSong && (
              <motion.div key="record-modal" className="absolute inset-0 z-50 bg-[#0a0a0f] overflow-y-auto sh p-4"
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}>
                <RecordingWizard
                  song={selectedSong}
                  profile={profile}
                  songs={songs}
                  onComplete={handleRecordComplete}
                  onClose={() => { setModal(null); setSelectedSong(null); }}
                />
              </motion.div>
            )}

            {modal === "release" && (
              <motion.div key="release-modal" className="absolute inset-0 z-50 bg-[#0a0a0f] overflow-y-auto sh p-4"
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}>
                <ReleaseWizard
                  project={selectedProject}
                  song={selectedSong}
                  profile={profile}
                  songs={songs}
                  onArtworkUpdated={async () => {
                    await loadData();
                  }}
                  onClose={() => { setModal(null); setSelectedSong(null); setSelectedProject(null); }}
                  onComplete={handleReleaseComplete}
                />
              </motion.div>
            )}

            {modal === "compare" && (
              <ComparisonChart
                key="compare-modal"
                releases={releases}
                onClose={() => setModal(null)}
              />
            )}
          </AnimatePresence>

          {/* ── LICENSING & COVERS MODAL ────────────────────────── */}
          <AnimatePresence>
            {licensingOpen && (
              <LicensingCoversModal
                key="licensing-modal"
                isOpen={licensingOpen}
                onClose={() => { setLicensingOpen(false); loadData(); }}
                songs={songs}
                releases={releases}
                profile={profile}
              />
            )}
          </AnimatePresence>

          {/* ── REMIX CATALOG SHEET ───────────────────────── */}
          <AnimatePresence>
            {showRemixSheet && (
              <motion.div key="remix-sheet" className="absolute inset-0 z-50 bg-[#0a0a0f] overflow-y-auto sh"
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-white/[0.06]">
                  <h2 className="fd font-bold text-white text-sm">Remix Catalog</h2>
                  <button onClick={() => setShowRemixSheet(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
                    <X size={16} className="text-gray-400"/>
                  </button>
                </div>
                <div className="p-3">
                  <RemixOpportunitiesFilter
                    artistId={profile?.id}
                    onRemix={(_song) => { setShowRemixSheet(false); }}
                    onOpenCallAction={() => {}}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── REMIX CONTESTS SHEET ─────────────────────────── */}
          <AnimatePresence>
            {showContestsSheet && (
              <motion.div key="contests-sheet" className="absolute inset-0 z-50 bg-[#0a0a0f] overflow-y-auto sh"
                initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-white/[0.06]">
                  <h2 className="fd font-bold text-white text-sm">Remix Contests</h2>
                  <button onClick={() => setShowContestsSheet(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
                    <X size={16} className="text-gray-400"/>
                  </button>
                </div>
                <div className="p-3">
                  <RemixContestBrowser artistId={profile?.id} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── COLLAB INBOX MODAL ──────────────────────────── */}
          <AnimatePresence>
            {showCollabSheet && (
              <CollabInboxModal
                profile={profile}
                songs={songs}
                onClose={() => { setShowCollabSheet(false); loadData(); }}
              />
            )}
          </AnimatePresence>
      </div>
    </>
  );
}

