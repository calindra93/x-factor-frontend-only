import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../components/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, ChevronLeft, Sparkles, Camera, Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getDefaultHomeCityForRegion } from "@/lib/homeCityDefaults";
import { getCitiesForRegion } from "@/data/onboardingCities";
import { computeStartingResources } from "@/data/startingResources";
import { getGenreLabels } from "@/data/genreTraitLabels";
import { MARKETING_PERSONA_OPTIONS } from "@/lib/marketingPersonas";
import { FOCUS_PATHS } from "@/data/focusPathConstants";
import { FANBASE_PILLARS, MAX_PILLARS } from "@/data/fanbasePillars";
import { generateIndustryRead, generatePublicistRead } from "@/data/comboReality";

const GENRES = [
  "Rap", "Melodic Rap", "Alternative Rap", "Trap", "Pop", "Hip-Hop", "R&B", "Rock", "EDM",
  "Trance", "Techno", "Afrobeats", "Amapiano", "Reggaeton", "Latin Pop",
  "Salsa", "Dancehall", "Reggae", "K-Pop", "J-Pop", "UK Drill", "Drill", "Indie",
  "Alternative", "Folk", "Country", "Go-Go", "Grunge", "Blues", "Jazz",
  "Soul", "Gospel", "Punk", "Metal", "Indie Rock", "Latin Rap", "Latin"
];

const REGIONS = [
  "Canada", "United States", "Latin America", "Africa", "Europe", "UK", "Asia", "Oceania"
];

const SOCIAL_PLATFORMS = [
  { key: "looptok",   label: "LoopTok",  abbr: "LT", grad: "linear-gradient(135deg,#0e7490,#22d3ee)" },
  { key: "instavibe", label: "InstaVibe", abbr: "IV", grad: "linear-gradient(135deg,#9333ea,#e879f9)" },
  { key: "xpress",    label: "Xpress",    abbr: "XP", grad: "linear-gradient(135deg,#475569,#94a3b8)" },
  { key: "vidwave",   label: "VidWave",   abbr: "VW", grad: "linear-gradient(135deg,#b91c1c,#f97316)" },
];

const PERSONA_DESCS = {
  street_authentic:    "Raw credibility. Speaks to the culture, no filter.",
  luxury_hustler:      "Boss energy. Brands want to be around you.",
  conscious_voice:     "Art with weight. The culture needs what you're saying.",
  party_club_catalyst: "You are the event. People show up for you.",
  nostalgic_boom_bap:  "Old school respect. Timeless lane. Legendary ceiling.",
  femme_power:         "Unapologetic force. Feminine energy as the whole brand.",
  viral_trendsetter:   "You create the moment everyone else copies.",
  aesthetic_curator:   "Visuals-first. Every drop is an era.",
  relatable_storyteller: "They feel like they know you personally. That's everything.",
  internet_troll:      "Chaos is the content. Drama is the fuel.",
  producer_visionary:  "Behind the board. Ahead of the game.",
  motivational_hustler: "Grind aesthetic. Built to inspire.",
};

const STEP_META = [
  { label: "Name & Face"   },
  { label: "Origin Story"  },
  { label: "Identity"      },
  { label: "Game Plan"     },
  { label: "Fanbase"       },
  { label: "Press Kit"     },
  { label: "Spotlight"     },
];

/* ── Shimmer / glitter CSS ── */
const SHIMMER_CSS = `
@keyframes onb-shimmer {
  0%   { background-position: -300% center; }
  100% { background-position:  300% center; }
}
.onb-glitter {
  background: linear-gradient(90deg, #e0c3fc 0%, #a78bfa 20%, #ec4899 42%, #C9A84C 62%, #e0c3fc 82%);
  background-size: 300% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: onb-shimmer 5s linear infinite;
  display: inline-block;
}
.onb-scroll::-webkit-scrollbar { display: none; }
.onb-scroll { scrollbar-width: none; -ms-overflow-style: none; }
.onb-label {
  background: linear-gradient(90deg, #dc2626 0%, #C9A84C 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
`;

function cx(...a) { return a.filter(Boolean).join(" "); }
function initials(s) { return (s || "").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }

/* ── 2-column selection card ── */
function PickCard({ active, disabled, accent = "#a78bfa", title, sub, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "relative rounded-2xl border text-left px-3 py-3 transition-all duration-200",
        disabled ? "opacity-25 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.97]",
      )}
      style={{
        borderColor: active ? `${accent}50` : "rgba(255,255,255,0.07)",
        background: active
          ? `linear-gradient(145deg, ${accent}16 0%, rgba(255,255,255,0.03) 100%)`
          : "rgba(255,255,255,0.02)",
        boxShadow: active ? `0 0 16px ${accent}1a` : "none",
      }}
    >
      <p className="font-bold text-white text-[12px] leading-snug pr-4">{title}</p>
      {sub && <p className="mt-1 text-[9.5px] text-white/35 leading-snug">{sub}</p>}
      {active && (
        <div
          className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: accent }}
        >
          <Check className="w-2.5 h-2.5 text-black" strokeWidth={3.5} />
        </div>
      )}
    </button>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [nameError, setNameError] = useState("");
  const [form, setForm] = useState({
    artist_name: "",
    artist_image: "",
    genre: "",
    region: "",
    city: "",
    persona_primary: "",
    persona_secondary: "",
    strategy_primary: "",
    strategy_secondary: "",
    fanbase_name: "",
    fanbase_pillars: [],
    social_looptok: "",    social_looptok_img: "",
    social_instavibe: "",  social_instavibe_img: "",
    social_xpress: "",     social_xpress_img: "",
    social_vidwave: "",    social_vidwave_img: "",
  });
  const fileInputRef = useRef(null);
  const socialImgRefs = useRef([null, null, null, null]);
  const norm = v => v.trim().toLowerCase();

  // Check if user already has a profile on mount
  useEffect(() => {
    const checkExistingProfile = async () => {
      try {
        const userAccountId = localStorage.getItem('user_account_id');
        if (!userAccountId) { navigate(createPageUrl("Auth")); return; }
        const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
        if (profiles.length > 0) navigate(createPageUrl("HomeV2"));
      } catch (error) {
        console.error("[Onboarding] Error checking existing profile:", error.message);
      }
    };
    checkExistingProfile();
  }, []);

  const checkArtistName = async (name) => {
    if (!name.trim()) { setNameError(""); return; }
    setChecking(true);
    try {
      const all = await base44.entities.ArtistProfile.list();
      const taken = all.some(p => norm(p.artist_name || "") === norm(name));
      setChecking(false);
      if (taken) { setNameError("That name's taken, honey."); return false; }
      setNameError("");
      return true;
    } catch (error) {
      console.error("[Onboarding] Error checking artist name:", error.message);
      setChecking(false);
      return false;
    }
  };

  const handleImageFile = async (file, key = "artist_image") => {
    if (!file) return;
    setUploadingImg(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, bucket: "uploads" });
      setForm(f => ({ ...f, [key]: file_url }));
    } catch (e) {
      console.error("[Onboarding] upload failed:", e.message);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleFinish = async () => {
    const ok = await checkArtistName(form.artist_name);
    if (!ok) { setStep(0); return; }
    setLoading(true);
    try {
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) throw new Error("No user account found");
      const start = computeStartingResources(form.genre, form.region);
      const city = form.city || getDefaultHomeCityForRegion(form.region);
      const { supabaseClient, isSupabaseConfigured } = await import('@/lib/supabaseClient');
      if (isSupabaseConfigured) {
        const { error: rpcError } = await supabaseClient.rpc('ensure_player_for_user', { user_uuid: userAccountId });
        if (rpcError) console.warn("[Onboarding] ensure_player_for_user:", rpcError);
      }
      await base44.entities.ArtistProfile.create({
        id: userAccountId,
        artist_name: form.artist_name.trim(),
        artist_name_normalized: norm(form.artist_name),
        artist_image: form.artist_image,
        genre: form.genre,
        home_region: form.region,
        home_city: city,
        region: form.region,           // current region (starts same as home)
        current_city: city,            // current city (starts same as home)
        career_stage: "Unknown",       // starting career stage
        user_account_id: userAccountId,
        core_brand_identity_primary: form.persona_primary || null,
        core_brand_identity_secondary: form.persona_secondary || null,
        energy: start.energy,         max_energy: start.max_energy,
        inspiration: start.inspiration, income: start.income,
        fans: start.fans,             followers: start.followers,
        fan_growth: start.fan_growth, follower_growth: start.follower_growth,
        clout: start.clout,           global_rank: start.global_rank,
        hype: start.hype,             fame: start.fame,
        label: "Independent",
        onboarding_complete: true,
      });

      // Create debut era
      try {
        const newEra = await base44.entities.Era.create({
          artist_id: userAccountId,
          era_name: "Debut Era",
          start_turn: 0,
          is_active: true,
          trigger_event: "onboarding",
          is_player_declared: false,
          theme_color: "#ff3b30",
          motifs: ["Hustle", "Identity", "Late Nights"],
          signature: "First Flame",
          focus_path: form.strategy_primary || "DIGITAL_CULT",
          phase: "TEASE",
          phase_turns_left: 60,
          momentum: 15,
          tension: 10,
          volatility_level: 20,
          career_stage: "EARLY",
          budget_marketing: 0, budget_visuals: 0, budget_features: 0,
          budget_community: 0, budget_tourprep: 0, budget_total: 0,
          current_multiplier_streaming: 1, current_multiplier_virality: 1,
          current_multiplier_retention: 1, current_multiplier_hype_decay: 1,
        });
        // Update profile with era ID
        if (newEra?.id) {
          await base44.entities.ArtistProfile.update(userAccountId, { active_era_id: newEra.id });
        }
      } catch (eraErr) {
        console.warn("[Onboarding] Era creation failed (non-fatal):", eraErr.message);
      }

      // Create fandom with selected pillars
      try {
        if (supabaseClient) {
          await supabaseClient.from('fandoms').upsert({
            player_id: userAccountId,
            fanbase_name: form.fanbase_name || null,
            identity_pillars: form.fanbase_pillars || [],
            alignment_score: 50,
            fan_morale: 70,
            brand_trust: 50,
            toxicity_score: 0,
            controversy_shadow: false,
          }, { onConflict: 'player_id' });
        }
      } catch (fandomErr) {
        console.warn("[Onboarding] Fandom creation failed (non-fatal):", fandomErr.message);
      }

      if (form.strategy_primary) localStorage.setItem("xf_onboarding_focus_path", form.strategy_primary);
      if (form.fanbase_name) localStorage.setItem("xf_onboarding_fanbase_name", form.fanbase_name);
      if (form.fanbase_pillars.length) localStorage.setItem("xf_onboarding_fanbase_pillars", JSON.stringify(form.fanbase_pillars));
      localStorage.setItem("xf_just_onboarded", "true");
      localStorage.removeItem("xf_welcome_dismissed");
      const socials = {};
      SOCIAL_PLATFORMS.forEach(p => { const v = form[`social_${p.key}`]?.trim(); if (v) socials[p.key] = v; });
      if (Object.keys(socials).length) localStorage.setItem("xf_onboarding_socials", JSON.stringify(socials));
      navigate(createPageUrl("HomeV2"));
    } catch (error) {
      console.error("[Onboarding] Failed to create profile:", error.message);
      setLoading(false);
    }
  };

  /* ── Derived ── */
  const cities = useMemo(() => getCitiesForRegion(form.region), [form.region]);
  const genreTraits = useMemo(() => form.genre ? getGenreLabels(form.genre) : [], [form.genre]);
  const personaPrimary = MARKETING_PERSONA_OPTIONS.find(p => p.id === form.persona_primary);
  const strategyPrimary = FOCUS_PATHS.find(f => f.value === form.strategy_primary);
  const pillarItems = form.fanbase_pillars.map(v => FANBASE_PILLARS.find(x => x.value === v)).filter(Boolean);

  const industryRead = useMemo(() => {
    if (step < 6) return "";
    try { return generateIndustryRead({ genre: form.genre, region: form.region, city: form.city, persona: form.persona_primary, strategy: form.strategy_primary }); }
    catch { return "This combination opens real doors. The lane exists — now it's about execution."; }
  }, [step, form.genre, form.region, form.city, form.persona_primary, form.strategy_primary]);

  const publicistRead = useMemo(() => {
    if (step < 6) return "";
    try { return generatePublicistRead({ artistName: form.artist_name, genre: form.genre, region: form.region, city: form.city, persona: form.persona_primary, strategy: form.strategy_primary, fanbaseName: form.fanbase_name, pillars: form.fanbase_pillars }); }
    catch { return `${form.artist_name || "This artist"} is a ${form.genre || "genre"} act out of ${form.region || "the scene"}.`; }
  }, [step, form]);

  const stepEyebrow = () => (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: "#C9A84C" }}>
        Step {step + 1} of 7
      </span>
      <span className="text-[9px] text-white/22 uppercase tracking-[0.14em]">· {STEP_META[step].label}</span>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════
     STEPS
     ══════════════════════════════════════════════════════════════════ */

  const steps = [

    /* ── Step 0: Name & Face ── */
    <div key="face" className="space-y-5">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">You're up, honey. Introduce yourself.</h2>
        <p className="text-[12px] text-white/50">No cheesy shit. Make it good.</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f, "artist_image"); if (fileInputRef.current) fileInputRef.current.value = ""; }}
      />

      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="relative group">
          <div
            className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center transition-all"
            style={{
              border: `2px solid ${form.artist_image ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.1)"}`,
              background: form.artist_image ? "transparent" : "rgba(255,255,255,0.04)",
              boxShadow: form.artist_image ? "0 0 28px rgba(201,168,76,0.15)" : "none",
            }}
          >
            {uploadingImg
              ? <Loader2 className="w-7 h-7 text-white/30 animate-spin" />
              : form.artist_image
              ? <img src={form.artist_image} alt="Artist" className="w-full h-full object-cover" />
              : <Camera className="w-7 h-7 text-white/20 group-hover:text-white/45 transition-colors" />}
          </div>
          {form.artist_image && !uploadingImg && (
            <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
          )}
          {form.artist_image && !uploadingImg && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, artist_image: "" })); }}
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500/90 flex items-center justify-center hover:bg-red-500 transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          )}
        </button>
        <span className="text-[10px] text-white/25">
          {uploadingImg ? "Uploading…" : form.artist_image ? "Tap to change" : "Tap to upload"}
        </span>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Artist Name</label>
        <input
          type="text"
          value={form.artist_name}
          onChange={e => { setForm(f => ({ ...f, artist_name: e.target.value })); setNameError(""); }}
          onBlur={e => checkArtistName(e.target.value)}
          placeholder="Stage name"
          className="w-full rounded-xl px-4 py-3.5 text-white font-bold text-sm placeholder:text-white/20 focus:outline-none transition-all"
          style={{ background: "#1a1a28", border: `1.5px solid ${nameError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}` }}
        />
        <div className="h-4 flex items-center gap-1.5">
          {checking && <span className="text-[11px] text-white/35 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking…</span>}
          {nameError && <span className="text-[11px] text-red-400 flex items-center gap-1"><X className="w-3 h-3" />{nameError}</span>}
          {!checking && !nameError && form.artist_name.trim() && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />Artist name available!</span>}
        </div>
      </div>
    </div>,

    /* ── Step 1: Origin Story ── */
    <div key="origin" className="space-y-5">
      {stepEyebrow()}
      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1">You look as good as it's gonna get, babes.</h2>
        <p className="text-[12px] text-white/50">What's your sound & the city you're reppin?</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Genre</label>
        <Select value={form.genre} onValueChange={v => setForm(f => ({ ...f, genre: v, city: "" }))}>
          <SelectTrigger className="bg-white/[0.04] border-white/10 text-white h-12 rounded-xl">
            <SelectValue placeholder="Select your genre…" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a24] border-white/10 max-h-[280px]">
            {GENRES.map(g => <SelectItem key={g} value={g} className="text-white hover:bg-white/5 focus:bg-white/10">{g}</SelectItem>)}
          </SelectContent>
        </Select>
        {genreTraits.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-1.5 pt-0.5">
            {genreTraits.map(t => (
              <span key={t.label} className="px-2.5 py-0.5 rounded-full border text-[9.5px] font-semibold"
                style={{ borderColor: `${t.color}30`, background: `${t.color}10`, color: t.color }}>
                {t.label}
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {form.genre && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Home Region</label>
          <div className="grid grid-cols-2 gap-1.5">
            {REGIONS.map(r => (
              <button type="button" key={r} onClick={() => setForm(f => ({ ...f, region: r, city: "" }))}
                className={cx("rounded-xl border px-3 py-2.5 text-[12px] font-semibold text-left transition-all",
                  form.region === r ? "border-white/30 bg-white/[0.08] text-[#E8C87C]" : "border-transparent bg-white/[0.025] text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
                )}>
                {r}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {form.region && (
          <motion.div key={form.region} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Home City</label>
            <div className="max-h-[160px] overflow-y-auto onb-scroll rounded-xl border border-white/[0.07] bg-white/[0.015]">
              {cities.map(c => (
                <button type="button" key={c.name} onClick={() => setForm(f => ({ ...f, city: c.name }))}
                  className={cx("w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.04]",
                    form.city === c.name && "bg-white/[0.04]")}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <div className="flex-1 text-left min-w-0">
                    <p className={cx("text-sm font-semibold", form.city === c.name ? "text-[#E8C87C]" : "text-white/70")}>{c.name}</p>
                    {c.vibe && <p className="text-[10px] text-white/35 truncate">{c.vibe}</p>}
                  </div>
                  {form.city === c.name && <Check className="w-3.5 h-3.5 text-[#C9A84C]/60 shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,

    /* ── Step 2: Identity ── */
    <div key="identity" className="space-y-5">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">When people talk, what they saying about you?</h2>
        <p className="text-[12px] text-white/50">Pick your lane. Max two — primary + optional secondary.</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Brand Persona</label>
          <div className="flex items-center gap-1.5">
            {form.persona_primary && <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>PRIMARY</span>}
            {form.persona_secondary && <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(236,72,153,0.15)", color: "#ec4899" }}>+SECONDARY</span>}
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto onb-scroll">
          <div className="grid grid-cols-2 gap-2 pb-6">
            {MARKETING_PERSONA_OPTIONS.map(p => {
              const isPrimary = form.persona_primary === p.id;
              const isSecondary = form.persona_secondary === p.id;
              const accent = isPrimary ? "#a78bfa" : isSecondary ? "#ec4899" : "#a78bfa";
              return (
                <PickCard
                  key={p.id}
                  active={isPrimary || isSecondary}
                  accent={accent}
                  title={p.label}
                  sub={(isPrimary ? "★ Primary · " : isSecondary ? "◈ Secondary · " : "") + (PERSONA_DESCS[p.id] || "")}
                  onClick={() => {
                    if (isPrimary) setForm(f => ({ ...f, persona_primary: f.persona_secondary, persona_secondary: "" }));
                    else if (isSecondary) setForm(f => ({ ...f, persona_secondary: "" }));
                    else if (!form.persona_primary) setForm(f => ({ ...f, persona_primary: p.id }));
                    else if (!form.persona_secondary && form.persona_primary !== p.id) setForm(f => ({ ...f, persona_secondary: p.id }));
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>,

    /* ── Step 3: Game Plan ── */
    <div key="strategy" className="space-y-5">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">There's plenty of ways to the top.</h2>
        <p className="text-[12px] text-white/50">How you gonna get there? Pick your path — or two.</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Career Focus</label>
          <div className="flex items-center gap-1.5">
            {form.strategy_primary && <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>PRIMARY</span>}
            {form.strategy_secondary && <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(236,72,153,0.15)", color: "#ec4899" }}>+SECONDARY</span>}
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto onb-scroll">
          <div className="grid grid-cols-2 gap-2 pb-6">
            {FOCUS_PATHS.map(fp => {
              const isPrimary = form.strategy_primary === fp.value;
              const isSecondary = form.strategy_secondary === fp.value;
              return (
                <PickCard
                  key={fp.value}
                  active={isPrimary || isSecondary}
                  accent={fp.color || "#a78bfa"}
                  title={fp.label}
                  sub={(isPrimary ? "★ Primary · " : isSecondary ? "◈ Secondary · " : "") + (fp.desc || "")}
                  onClick={() => {
                    if (isPrimary) setForm(f => ({ ...f, strategy_primary: f.strategy_secondary, strategy_secondary: "" }));
                    else if (isSecondary) setForm(f => ({ ...f, strategy_secondary: "" }));
                    else if (!form.strategy_primary) setForm(f => ({ ...f, strategy_primary: fp.value }));
                    else if (!form.strategy_secondary && form.strategy_primary !== fp.value) setForm(f => ({ ...f, strategy_secondary: fp.value }));
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>,

    /* ── Step 4: Fanbase ── */
    <div key="fans" className="space-y-5">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">Who's ridin' for you?</h2>
        <p className="text-[12px] text-white/50">Define the community before the community defines you.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Fanbase Nickname</label>
        <div className="flex items-center rounded-xl overflow-hidden"
          style={{ border: "1.5px solid rgba(255,255,255,0.08)", background: "#1a1a28" }}>
          <span className="pl-4 pr-1 py-3.5 text-white/40 font-black text-sm shrink-0 select-none">The</span>
          <input
            type="text"
            value={form.fanbase_name}
            onChange={e => setForm(f => ({ ...f, fanbase_name: e.target.value }))}
            placeholder="Beliebers, Navy, Monsters…"
            className="flex-1 bg-transparent pr-4 py-3.5 text-white font-semibold text-sm placeholder:text-white/18 focus:outline-none"
          />
        </div>
        {form.fanbase_name && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] font-black pl-0.5 pt-0.5">
            <span className="onb-glitter">The {form.fanbase_name}</span>
          </motion.p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] onb-label">Identity Pillars</label>
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full border" style={{ borderColor: "rgba(201,168,76,0.3)", color: "#C9A84C" }}>
            {form.fanbase_pillars.length}/{MAX_PILLARS}
          </span>
        </div>
        <p className="text-[10px] text-white/25 -mt-1">Loyalty, chaos, exclusivity, empowerment — what energy does your fanbase carry?</p>
        <div className="max-h-[200px] overflow-y-auto onb-scroll">
          <div className="grid grid-cols-2 gap-2 pb-4">
            {FANBASE_PILLARS.map(pillar => {
              const sel = form.fanbase_pillars.includes(pillar.value);
              const dis = !sel && form.fanbase_pillars.length >= MAX_PILLARS;
              return (
                <PickCard key={pillar.value} active={sel} disabled={dis} accent={pillar.color}
                  title={pillar.label} sub={pillar.desc}
                  onClick={() => {
                    if (dis) return;
                    setForm(f => ({
                      ...f,
                      fanbase_pillars: sel
                        ? f.fanbase_pillars.filter(v => v !== pillar.value)
                        : [...f.fanbase_pillars, pillar.value]
                    }));
                  }} />
              );
            })}
          </div>
        </div>
      </div>
    </div>,

    /* ── Step 5: Press Kit ── */
    <div key="press" className="space-y-5">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">What's the socials, honey?</h2>
        <p className="text-[12px] text-white/50">Give us the handles. Tap the circle to upload a platform photo.</p>
      </div>

      <div className="space-y-3">
        {SOCIAL_PLATFORMS.map((plat, i) => {
          const handleKey = `social_${plat.key}`;
          const imgKey = `social_${plat.key}_img`;
          return (
            <div key={plat.key} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <button
                type="button"
                onClick={() => socialImgRefs.current[i]?.click()}
                className="relative group w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                style={{ background: form[imgKey] ? "transparent" : plat.grad }}
              >
                {form[imgKey]
                  ? <img src={form[imgKey]} alt="" className="w-full h-full object-cover" />
                  : <span className="text-[11px] font-black text-white">{plat.abbr}</span>}
                <div className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </button>
              <input
                type="file" accept="image/*" className="hidden"
                ref={el => socialImgRefs.current[i] = el}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f, imgKey); }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 mb-1">{plat.label}</p>
                <input
                  type="text" value={form[handleKey]}
                  onChange={e => setForm(f => ({ ...f, [handleKey]: e.target.value }))}
                  placeholder="@handle"
                  className="w-full bg-transparent border-b border-white/[0.07] focus:border-white/20 pb-1 text-sm font-semibold text-white placeholder:text-white/18 focus:outline-none transition-colors"
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[10px] text-white/20">All optional — skip any you want.</p>
    </div>,

    /* ── Step 6: Spotlight Check ── */
    <div key="spotlight" className="space-y-4">
      {stepEyebrow()}
      <div>
        <h2 className="text-xl font-black text-white mb-1">Here's the package.</h2>
        <p className="text-[12px] text-white/50 italic">This is the version of you the industry is about to meet.</p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.3),rgba(236,72,153,0.2),transparent)" }} />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-white/10"
            style={{ background: form.artist_image ? "transparent" : "rgba(255,255,255,0.05)" }}>
            {form.artist_image
              ? <img src={form.artist_image} alt="" className="w-full h-full object-cover" />
              : <span className="text-base font-black text-white/30">{initials(form.artist_name)}</span>}
          </div>
          <div>
            <p className="text-lg font-black text-white leading-tight">{form.artist_name || "—"}</p>
            <p className="text-[11px] text-white/38">{form.genre}{form.region ? ` · ${form.region}` : ""}</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-white/[0.05] pt-3">
          {[
            ["Sound",    `${form.genre}${form.city ? ` · ${form.city}` : ""}`],
            ["Brand",    [personaPrimary?.label, MARKETING_PERSONA_OPTIONS.find(p => p.id === form.persona_secondary)?.label].filter(Boolean).join(" + ")],
            ["Strategy", [strategyPrimary?.label, FOCUS_PATHS.find(f => f.value === form.strategy_secondary)?.label].filter(Boolean).join(" + ")],
            ["Fanbase",  form.fanbase_name ? `The ${form.fanbase_name}` : null],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25 w-14 shrink-0">{k}</span>
              <span className="text-[12px] font-semibold text-white/60">{v}</span>
            </div>
          ))}
          {pillarItems.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25 w-14 shrink-0 pt-0.5">Pillars</span>
              <div className="flex flex-wrap gap-1.5">
                {pillarItems.map(p => (
                  <span key={p.value} className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold border"
                    style={{ borderColor: `${p.color}35`, background: `${p.color}12`, color: p.color }}>
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publicist Read */}
      {publicistRead && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "#C9A84C" }}>Publicist Read</p>
          <p className="text-[12px] italic leading-relaxed text-white/65">"{publicistRead}"</p>
        </div>
      )}

      {/* Industry Read */}
      {industryRead && (
        <div className="rounded-2xl border p-4 relative overflow-hidden"
          style={{ borderColor: "rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.04)" }}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.45),transparent)" }} />
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/65 mb-2">Industry Read</p>
          <p className="text-[12px] leading-relaxed text-white/82">{industryRead}</p>
        </div>
      )}
    </div>,
  ];

  /* ── Gating ── */
  const canNext = [
    form.artist_name.trim().length > 0 && !nameError && !checking,
    form.genre.length > 0 && form.region.length > 0 && form.city.length > 0,
    form.persona_primary.length > 0,
    form.strategy_primary.length > 0,
    true,
    true,
    true,
  ][step];

  return (
    <div className="min-h-full bg-[#0a0a0f] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <style>{SHIMMER_CSS}</style>

      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-red-600/8 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-[100px]" style={{ background: "rgba(167,139,250,0.04)" }} />

      {/* Logo */}
      <div className="mb-8 text-center relative z-10">
        <h1 className="text-5xl font-black tracking-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-rose-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            X-Factor
          </span>
        </h1>
        <p className="text-gray-500 text-xs mt-1 tracking-[0.3em] uppercase">Build Your Empire</p>
      </div>

      {/* Progress dots — gold active dot matching FandomApp style */}
      <div className="flex gap-1.5 mb-6 relative z-10">
        {STEP_META.map((_, i) => (
          <div key={i} className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === step ? 28 : i < step ? 14 : 6,
              background: i === step ? "#C9A84C" : i < step ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)",
            }} />
        ))}
      </div>

      {/* Card — same shell as original */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle FandomApp-style top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg,transparent 0%,rgba(167,139,250,0.2) 30%,rgba(236,72,153,0.15) 70%,transparent 100%)" }} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {steps[step]}
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex items-center justify-center w-12 h-12 rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/55 hover:text-white/80 hover:bg-white/[0.04] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => step < 6 ? (canNext && setStep(s => s + 1)) : handleFinish()}
              disabled={!canNext || loading}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: step === 6
                  ? "linear-gradient(135deg, #dc2626, #f43f5e)"
                  : "linear-gradient(135deg, #991b1b, #dc2626)",
                color: "white",
                boxShadow: canNext ? "0 8px 24px rgba(220,38,38,0.22)" : "none",
              }}
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : step === 6
                ? <><Sparkles className="w-4 h-4" /> Enter The Industry</>
                : <>Continue <ChevronRight className="w-4 h-4 ml-0.5" /></>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}