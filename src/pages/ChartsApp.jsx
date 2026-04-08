import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Star, Music, Disc3, Trophy, Clock, Eye, Users, AlertTriangle, RefreshCw } from "lucide-react";
import BackButton from "@/components/BackButton";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// ─── Config ───────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'singles', label: 'Singles',   icon: Disc3  },
  { id: 'albums',  label: 'Albums',    icon: Music  },
  { id: 'artists', label: 'Artists',   icon: Users  },
  { id: 'certs',   label: 'Certs',     icon: Trophy },
];

export const CHART_REGIONS = [
  { id: 'usa',           label: 'USA' },
  { id: 'global',        label: 'Global' },
  { id: 'global_ex_us',  label: 'Ex-US' },
  { id: 'canada',        label: 'Canada' },
  { id: 'uk',            label: 'UK' },
  { id: 'europe',        label: 'Europe' },
  { id: 'africa',        label: 'Africa' },
  { id: 'asia',          label: 'Asia' },
  { id: 'latin_america', label: 'Latin America' },
  { id: 'oceania',       label: 'Oceania' },
];

const REGION_LABELS = Object.fromEntries(CHART_REGIONS.map((region) => [region.id, region.label]));

const CERT_CFG = {
  Diamond:          { grad: 'from-cyan-300 via-blue-300 to-purple-300', icon: '💎', color: 'text-cyan-300'  },
  'Multi-Platinum': { grad: 'from-slate-300 via-blue-200 to-slate-200', icon: '💿', color: 'text-blue-300'  },
  Platinum:         { grad: 'from-slate-300 to-slate-100',              icon: '💿', color: 'text-slate-300' },
  Gold:             { grad: 'from-yellow-600 to-yellow-400',            icon: '🥇', color: 'text-yellow-500' },
};

export const CHART_SHORT_LABELS = {
  'hot100_weekly_usa':          'Hot 100 (USA)',
  'hot100_weekly_global':       'Hot 100 (Global)',
  'hot100_weekly_global_ex_us': 'Hot 100 (Ex-US)',
  'hot100_daily_usa':           'Daily Hot 100',
  'bb200_weekly_usa':           'BB 200 (USA)',
  'bb200_weekly_global':        'BB 200 (Global)',
  'bb200_weekly_global_ex_us':  'BB 200 (Ex-US)',
  ...Object.fromEntries(
    CHART_REGIONS
      .filter((region) => !['usa', 'global', 'global_ex_us'].includes(region.id))
      .flatMap((region) => ([
        [`hot100_weekly_${region.id}`, `Hot 100 (${region.label})`],
        [`hot100_daily_${region.id}`, `Daily Hot 100 (${region.label})`],
        [`bb200_weekly_${region.id}`, `BB 200 (${region.label})`],
        [`bb200_daily_${region.id}`, `Daily BB 200 (${region.label})`],
      ]))
  ),
};

export function getChartKey(cat, cadence, region) {
  if (cat === 'singles') return `hot100_${cadence}_${region}`;
  if (cat === 'albums')  return `bb200_${cadence}_${region}`;
  return null;
}

export function getChartTitle(cat, region, cadence) {
  const r = REGION_LABELS[region] || region;
  if (cat === 'singles') return cadence === 'weekly' ? `Billboard Hot 100 · ${r}` : `Daily Hot 100 · ${r}`;
  if (cat === 'albums')  return cadence === 'weekly' ? `Billboard 200 · ${r}`     : `Daily Albums · ${r}`;
  if (cat === 'artists') return `Top Artists · ${r}`;
  return 'Certifications';
}

// ─── Movement badge ───────────────────────────────────────────
function MovementBadge({ debut_flag, movement }) {
  if (debut_flag) return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/20">
      NEW
    </span>
  );
  if (movement == null || movement === 0) return <span className="text-gray-600 text-xs">—</span>;
  if (movement > 0) return <span className="text-emerald-400 text-xs font-bold">▲{movement}</span>;
  return <span className="text-red-400 text-xs font-bold">▼{Math.abs(movement)}</span>;
}

// ─── Chart row (songs / albums) ───────────────────────────────
function ChartRow({ entry, rank, isPlayer }) {
  const isTop10 = rank <= 10;
  const isPeak  = entry.peak_position === 1;

  return (
    <div className={`
      flex items-center gap-3 px-4 border-b border-white/[0.04]
      ${isTop10 ? 'py-3' : 'py-2.5'}
      ${isPlayer
        ? 'bg-[#C9A84C]/[0.06] border-l-2 border-l-[#C9A84C]'
        : 'border-l-2 border-l-transparent'}
    `}>
      {/* Rank */}
      <div className={`flex-shrink-0 text-right ${isTop10 ? 'w-9' : 'w-7'}`}>
        <span className={`font-black tabular-nums leading-none ${
          rank === 1 ? 'text-3xl text-[#C9A84C]'  :
          rank <= 3  ? 'text-2xl text-[#E8C87C]'  :
          rank <= 10 ? 'text-xl text-white'        :
                       'text-sm text-gray-500'
        }`}>{rank}</span>
      </div>

      {/* Movement */}
      <div className="w-8 flex-shrink-0 text-center">
        <MovementBadge debut_flag={entry.debut_flag} movement={entry.movement} />
      </div>

      {/* Title / Artist */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${isTop10 ? 'text-white text-sm' : 'text-white/80 text-xs'}`}>
          {entry.title || 'Unknown'}
          {entry.peak_position <= 10 && entry.position === entry.peak_position && (
            <Star className="inline w-3 h-3 text-[#C9A84C] ml-1 mb-0.5" />
          )}
        </p>
        <p className={`text-gray-500 truncate ${isTop10 ? 'text-xs' : 'text-[10px]'}`}>
          {entry.artist_name || '—'}
          {entry.chart_label && <span className="ml-1.5 text-gray-600">· {entry.chart_label}</span>}
        </p>
      </div>

      {/* LW */}
      <div className="w-6 text-right flex-shrink-0">
        <span className="text-gray-600 text-[10px] tabular-nums">
          {entry.last_week != null ? entry.last_week : '—'}
        </span>
      </div>

      {/* Wks */}
      <div className="w-6 text-right flex-shrink-0">
        <span className="text-gray-500 text-[10px] tabular-nums">{entry.weeks_on_chart ?? '—'}</span>
      </div>

      {/* Peak */}
      <div className="w-8 text-right flex-shrink-0">
        {isPeak
          ? <span className="text-[#C9A84C] text-[10px] font-bold">👑 1</span>
          : <span className="text-gray-600 text-[10px] tabular-nums">#{entry.peak_position}</span>
        }
      </div>
    </div>
  );
}

// ─── Artist row (aggregated) ──────────────────────────────────
function ArtistRow({ artist, rank, isPlayer }) {
  return (
    <div className={`
      flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]
      ${isPlayer
        ? 'bg-[#C9A84C]/[0.06] border-l-2 border-l-[#C9A84C]'
        : 'border-l-2 border-l-transparent'}
    `}>
      <div className={`flex-shrink-0 text-right ${rank <= 10 ? 'w-9' : 'w-7'}`}>
        <span className={`font-black tabular-nums leading-none ${
          rank === 1 ? 'text-3xl text-[#C9A84C]'  :
          rank <= 3  ? 'text-2xl text-[#E8C87C]'  :
          rank <= 10 ? 'text-xl text-white'        :
                       'text-sm text-gray-500'
        }`}>{rank}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${rank <= 10 ? 'text-white text-sm' : 'text-white/80 text-xs'}`}>
          {artist.artist_name}
          {artist.no1 && <span className="text-[#C9A84C] ml-1.5 text-xs">👑</span>}
        </p>
        <p className="text-gray-500 text-[10px]">
          {artist.entries} {artist.entries === 1 ? 'entry' : 'entries'} · Best #{artist.best_pos}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <span className="text-gray-600 text-[10px] tabular-nums">{artist.total_wks}w</span>
      </div>
    </div>
  );
}

// ─── Section divider ──────────────────────────────────────────
function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.015]">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">{label}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function ChartsApp() {
  const [category, setCategory] = useState('singles');
  const [region, setRegion]     = useState('usa');
  const [cadence, setCadence]   = useState('weekly');
  const [chartData, setChartData] = useState(null);
  const [certs, setCerts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [playerId, setPlayerId]   = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isDegraded, setIsDegraded] = useState(false);

  const key = getChartKey(category, cadence, region);

  const fetchChart = useCallback(async (k) => {
    if (!k) return { success: false, error: 'Missing chart key' };
    return invokeEdgeFunction('getCharts', { chart_key: k, mode: 'current' });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsDegraded(false);
    try {
      const aid = localStorage.getItem('artist_id');
      setPlayerId(aid);

      if (category === 'certs') {
        try {
          const data = await base44.entities.Certification.list('-turn_achieved', 200);
          setCerts(Array.isArray(data) ? data : []);
        } catch (certError) {
          console.error('[Charts] certification load error', certError);
          setCerts([]);
          setLoadError('Unable to load certifications right now.');
        }
        return;
      }

      if (category === 'artists') {
        const [s, a] = await Promise.all([
          fetchChart(`hot100_weekly_${region}`),
          fetchChart(`bb200_weekly_${region}`),
        ]);

        const singles = s.success ? s.data : null;
        const albums = a.success ? a.data : null;
        const failures = [s, a].filter((result) => !result.success);

        setChartData({ _artists: true, singles, albums });

        if (failures.length === 2) {
          setLoadError('Artist charts are unavailable right now.');
        } else if (failures.length === 1) {
          setLoadError('Top Artists is using partial chart input right now.');
          setIsDegraded(true);
        }
        return;
      }

      const result = await fetchChart(key);

      if (!result.success) {
        setChartData(null);
        setLoadError('Unable to load this chart right now.');
        return;
      }

      setChartData(result.data);
    } catch (e) {
      console.error('[Charts] loadData error', e);
      setChartData(null);
      setLoadError('Unable to load chart data right now.');
    } finally {
      setLoading(false);
    }
  }, [category, region, cadence, key, fetchChart]);

  useEffect(() => {
    loadData();
    window.addEventListener('turnAdvanced', loadData);
    return () => window.removeEventListener('turnAdvanced', loadData);
  }, [loadData]);

  // Artists: aggregate entries from singles + albums charts by artist
  const artistsList = useMemo(() => {
    if (category !== 'artists' || !chartData?._artists) return [];
    const map = new Map();
    const all = [
      ...(chartData.singles?.entries || []),
      ...(chartData.albums?.entries  || []),
    ];
    for (const e of all) {
      const a = map.get(e.artist_id);
      if (!a) {
        map.set(e.artist_id, {
          artist_id: e.artist_id,
          artist_name: e.artist_name,
          entries: 1,
          best_pos: e.position,
          total_wks: e.weeks_on_chart || 0,
          no1: e.position === 1,
        });
      } else {
        a.entries++;
        a.best_pos = Math.min(a.best_pos, e.position);
        a.total_wks += e.weeks_on_chart || 0;
        if (e.position === 1) a.no1 = true;
      }
    }
    return [...map.values()].sort((a, b) => a.best_pos - b.best_pos || b.entries - a.entries);
  }, [category, chartData]);

  // Derived display data
  const entries = category === 'artists' ? artistsList : (chartData?.entries || []);

  const visibility  = chartData?.visibility || 'published';
  const previewNote = chartData?.preview_note;

  const subline = (() => {
    if (!chartData || chartData._artists) return '';
    const wk  = chartData.chart_week_key != null ? `Week ${chartData.chart_week_key}` : '';
    const trk = chartData.tracking_start_turn != null
      ? `Turns ${chartData.tracking_start_turn}–${chartData.tracking_end_turn}`
      : chartData.tracking_end_turn != null
      ? `Turn ${chartData.tracking_end_turn}`
      : '';
    return [wk, trk].filter(Boolean).join(' · ');
  })();

  const sortedCerts = useMemo(() =>
    [...certs].sort((a, b) => {
      const o = { Diamond: 0, 'Multi-Platinum': 1, Platinum: 2, Gold: 3 };
      return (o[a.certification_level] ?? 4) - (o[b.certification_level] ?? 4);
    }),
  [certs]);

  const hasRegion  = ['singles', 'albums', 'artists'].includes(category);
  const hasCadence = ['singles', 'albums'].includes(category);

  return (
    <div className="min-h-full bg-[#08080B] pb-24">

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#08080B]/96 backdrop-blur-xl border-b border-white/[0.06]">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <BackButton />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[#C9A84C] text-[10px] font-black tracking-[0.25em] uppercase">Billboard</span>
              <span className="text-white/20 text-[10px]">×</span>
              <span className="text-gray-500 text-[10px] tracking-widest uppercase">X-Factor</span>
            </div>
            <h1 className="text-white text-base font-bold tracking-tight truncate leading-tight">
              {getChartTitle(category, region, cadence)}
            </h1>
            {subline && <p className="text-gray-600 text-[10px] mt-0.5">{subline}</p>}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-all ${
                  active
                    ? 'bg-[#C9A84C] text-black shadow-lg shadow-[#C9A84C]/20'
                    : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Region + Cadence controls */}
        {(hasRegion || hasCadence) && (
          <div className="flex items-center justify-between px-4 pb-3">
            {hasRegion && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-lg px-2 py-1">
                <span className="text-gray-500 text-[8px] font-black tracking-[0.16em] uppercase">Region</span>
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="bg-transparent text-white text-[10px] font-semibold outline-none pr-4 leading-none"
                >
                  {CHART_REGIONS.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#08080B] text-white">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {hasCadence && (
              <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 ml-auto">
                {['weekly', 'daily'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCadence(c)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      cadence === c ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {c === 'weekly' ? 'Wkly' : 'Dly'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Publish gating banners ─────────────────────────────── */}
      {visibility === 'preview' && previewNote && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-2.5">
          <Eye className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
          <p className="text-[#C9A84C] text-[11px]">{previewNote}</p>
        </div>
      )}
      {visibility === 'hidden' && !['certs', 'artists'].includes(category) && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5">
          <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <p className="text-gray-500 text-[11px]">Showing last published chart — next chart computes at end of tracking period.</p>
        </div>
      )}

      {loadError && (
        <div
          className={`mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
            isDegraded
              ? 'border-amber-400/20 bg-amber-400/10'
              : 'border-red-400/20 bg-red-500/10'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${isDegraded ? 'text-amber-300' : 'text-red-300'}`} />
            <p className={`text-[11px] ${isDegraded ? 'text-amber-100' : 'text-red-100'}`}>{loadError}</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/15"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Loading spinner ─────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── Certifications ─────────────────────────────────── */}
          {category === 'certs' && (
            sortedCerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                {loadError ? (
                  <>
                    <AlertTriangle className="mb-3 h-10 w-10 text-red-300/70" />
                    <p className="text-sm font-semibold text-red-100">Certification feed unavailable</p>
                    <p className="mt-1 text-center text-xs text-red-100/70">{loadError}</p>
                    <button
                      type="button"
                      onClick={loadData}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry
                    </button>
                  </>
                ) : (
                  <>
                    <Trophy className="w-10 h-10 text-gray-700 mb-3" />
                    <p className="text-gray-400 text-sm font-semibold">No certifications yet</p>
                    <p className="text-gray-600 text-xs mt-1 text-center">Build streams to earn Gold, Platinum, and Diamond.</p>
                    <div className="mt-6 space-y-2 w-full max-w-xs">
                      {[
                        { l: 'Gold',           s: '7.5M streams',  c: 'text-yellow-500', d: 'bg-yellow-500' },
                        { l: 'Platinum',       s: '15M streams',   c: 'text-gray-300',   d: 'bg-gray-300'   },
                        { l: 'Multi-Platinum', s: '30M+ streams',  c: 'text-blue-300',   d: 'bg-blue-300'   },
                        { l: 'Diamond',        s: '150M streams',  c: 'text-cyan-300',   d: 'bg-cyan-300'   },
                      ].map(t => (
                        <div key={t.l} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full ${t.d}`} />
                            <span className={`text-xs font-bold ${t.c}`}>{t.l}</span>
                          </div>
                          <span className="text-gray-500 text-xs">{t.s}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="pt-2">
                {sortedCerts.map(cert => {
                  const cfg = CERT_CFG[cert.certification_level] || CERT_CFG.Gold;
                  return (
                    <div key={cert.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.grad} flex items-center justify-center text-lg shadow flex-shrink-0`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-black ${cfg.color}`}>{cert.certification_detail}</p>
                        <p className="text-gray-500 text-[10px] mt-0.5">
                          {cert.region || 'Global'} · Turn {cert.turn_achieved}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-gray-400 text-[10px] tabular-nums">
                          {Number(cert.streams_at_certification || 0).toLocaleString()}
                        </p>
                        <p className="text-gray-600 text-[9px]">streams</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── Chart list (singles / albums / artists) ──────────── */}
          {category !== 'certs' && (
            <div>
              {/* Column headers */}
              {entries.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06] bg-white/[0.015]">
                  <div className="w-9">
                    <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">#</span>
                  </div>
                  {category !== 'artists' && (
                    <div className="w-8 text-center">
                      <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">Mvmt</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">
                      {category === 'artists' ? 'Artist' : 'Title / Artist'}
                    </span>
                  </div>
                  {category !== 'artists' ? (
                    <>
                      <div className="w-6 text-right">
                        <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">LW</span>
                      </div>
                      <div className="w-6 text-right">
                        <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">Wks</span>
                      </div>
                      <div className="w-8 text-right">
                        <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">Peak</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-8 text-right">
                      <span className="text-gray-600 text-[8px] font-black tracking-[0.2em] uppercase">Wks</span>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {entries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  {loadError ? (
                    <>
                      <AlertTriangle className="mb-3 h-10 w-10 text-red-300/70" />
                      <p className="text-sm font-semibold text-red-100">Chart feed unavailable</p>
                      <p className="mt-1 text-center text-xs text-red-100/70">{loadError}</p>
                      <button
                        type="button"
                        onClick={loadData}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </>
                  ) : (
                    <>
                      <Disc3 className="w-10 h-10 text-gray-700 mb-3" />
                      <p className="text-gray-400 text-sm font-semibold">No entries yet</p>
                      <p className="text-gray-600 text-xs mt-1 text-center">
                        {category === 'my'
                          ? 'Release music and build streams to chart!'
                          : 'Charts will populate as releases accumulate streams.'}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Rows */}
              {entries.map((entry, idx) => {
                // Artists don't have a chart position — use index
                const rank     = category === 'artists' ? idx + 1 : entry.position;
                const isPlayer = entry.artist_id === playerId;
                // Divider between top 10 and the rest
                const showDiv  = rank === 11;

                if (category === 'artists') {
                  return (
                    <React.Fragment key={entry.artist_id}>
                      {showDiv && <SectionDivider label={`11–${entries.length}`} />}
                      <ArtistRow artist={entry} rank={rank} isPlayer={isPlayer} />
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={`${idx}-${entry.entity_id ?? ''}`}>
                    {showDiv && <SectionDivider label={`11–${entries.length}`} />}
                    <ChartRow entry={entry} rank={rank} isPlayer={isPlayer} />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
