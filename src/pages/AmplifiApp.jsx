import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Calendar, Music, Loader2, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { RivalryTab, BackstageTab } from "@/components/amplifi/FestivalPhase2Tabs";
import {
  buildFestivalPreviewInstance,
  getEffectiveFestivalStatus,
} from "@/components/amplifi/festivalCalendar";
import FestivalSetlistEditor from "@/components/amplifi/FestivalSetlistEditor";
import FestivalGreenRoom from "@/components/amplifi/FestivalGreenRoom";
import { selectCurrentGreenRoomInstance } from "@/components/amplifi/greenRoomPresentation";
import "@/components/amplifi/amplifiApp.css";

import { FestivalCard, FeaturedCard } from "@/components/amplifi/FestivalCards";
import FestivalCarousel from "@/components/amplifi/FestivalCarousel";
import FestivalDetail from "@/components/amplifi/FestivalDetail";
import FestivalSubmit from "@/components/amplifi/FestivalSubmit";
import FestivalHistoryTab from "@/components/amplifi/FestivalHistoryTab";

export default function AmplifiApp({ onNavigate }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [instances, setInstances] = useState([]);
  const [festivalMap, setFestivalMap] = useState({});
  const [submissionMap, setSubmissionMap] = useState({});
  const [setlistMap, setSetlistMap] = useState({});
  const [resultsMap, setResultsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'festivals';
  });
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [modal, setModal] = useState(null);
  const [lineupArtists, setLineupArtists] = useState([]);
  const [activeFestivalInstanceId, setActiveFestivalInstanceId] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [allFestivals, setAllFestivals] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [, setGreenRoomRecords] = useState([]);
  const [lineupSlotMap, setLineupSlotMap] = useState({});
  const [completedPerformedInstance, setCompletedPerformedInstance] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const goBack = () => {
    if (onNavigate) onNavigate('/Career');
    else navigate('/Career');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) { setLoading(false); return; }
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const p = profiles?.[0];
      if (!p) { setLoading(false); return; }
      setProfile(p);

      const { data: allInstData } = await supabaseClient
        .from('festival_instances')
        .select('*, festival:festivals(*)')
        .order('in_game_year', { ascending: true })
        .order('window_week', { ascending: true })
        .limit(50);

      const allInstances = allInstData || [];
      setInstances(allInstances);

      const fMap = {};
      for (const inst of allInstances) {
        if (inst.festival) fMap[inst.festival_id] = inst.festival;
      }
      setFestivalMap(fMap);

      const { data: catalogData } = await supabaseClient
        .from('festivals')
        .select('id, code, name, region, brand_posture, booking_philosophy, seasonal_windows, day_count, lanes, genre_weights, culture_identity')
        .eq('is_active', true)
        .order('created_at');
      setAllFestivals(catalogData || []);

      let gs = null;
      try {
        const { data: gsData } = await supabaseClient
          .from('turn_state')
          .select('global_turn_id, last_completed_turn_id')
          .eq('id', 1)
          .maybeSingle();
        gs = gsData;
        const displayTurn = gs?.global_turn_id ?? gs?.last_completed_turn_id ?? 0;
        setCurrentTurn(displayTurn);
      } catch { /* non-fatal */ }

      const effectiveTurn = gs?.global_turn_id ?? gs?.last_completed_turn_id ?? 0;
      const displayInstances = allInstances.map((inst) => ({
        ...inst,
        status: getEffectiveFestivalStatus(inst, effectiveTurn),
      }));

      const instanceIds = allInstances.map((i) => i.id);
      if (!instanceIds.length) { setLoading(false); return; }

      setInstances(displayInstances);

      const { data: subData } = await supabaseClient
        .from('festival_submissions')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds);

      const sMap = {};
      for (const sub of (subData || [])) sMap[sub.festival_instance_id] = sub;
      setSubmissionMap(sMap);

      const { data: slData } = await supabaseClient
        .from('festival_setlists')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds);

      const slMap = {};
      for (const sl of (slData || [])) slMap[sl.festival_instance_id] = sl;
      setSetlistMap(slMap);

      const { data: resultData } = await supabaseClient
        .from('festival_performance_results')
        .select('*')
        .eq('artist_id', p.id)
        .in('festival_instance_id', instanceIds)
        .order('resolved_turn_id', { ascending: true });

      const rMap = {};
      for (const r of (resultData || [])) {
        if (!rMap[r.festival_instance_id]) rMap[r.festival_instance_id] = [];
        rMap[r.festival_instance_id].push(r);
      }
      setResultsMap(rMap);

      const mySubInstanceIds = (subData || []).map((s) => s.festival_instance_id);
      if (mySubInstanceIds.length) {
        const { data: slotData } = await supabaseClient
          .from('festival_lineup_slots')
          .select('festival_instance_id, lane, selection_weight, selected_turn_id, artist_id')
          .eq('artist_id', p.id)
          .in('festival_instance_id', mySubInstanceIds);
        const slotMap2 = {};
        for (const sl of (slotData || [])) slotMap2[sl.festival_instance_id] = sl;
        setLineupSlotMap(slotMap2);
      }

      const { data: histData } = await supabaseClient
        .from('festival_applications')
        .select('*, festival_instance:festival_instances(id, festival_id, in_game_year, window_week, festival:festivals(name, region))')
        .eq('artist_id', p.id)
        .eq('status', 'completed')
        .order('archived_at', { ascending: false })
        .limit(15);
      setHistoryRecords(histData || []);

      const { data: greenRoomData } = await supabaseClient
        .from('festival_applications')
        .select('festival_instance_id, status, green_room_viewed_at')
        .eq('artist_id', p.id);
      setGreenRoomRecords(greenRoomData || []);

      const recentComplete = selectCurrentGreenRoomInstance(displayInstances, rMap, greenRoomData || []);
      setCompletedPerformedInstance(recentComplete);

      const activeInst = displayInstances.find((i) =>
        ['LOCKED', 'LIVE'].includes(i.status) && sMap[i.id]?.status === 'SELECTED'
      );
      if (activeInst) {
        setActiveFestivalInstanceId(activeInst.id);

        const { data: slots } = await supabaseClient
          .from('festival_lineup_slots')
          .select('artist_id, lane, secret_stage_unlocked')
          .eq('festival_instance_id', activeInst.id)
          .not('artist_id', 'is', null);

        if (slots?.length) {
          const artistIds = slots.map((s) => s.artist_id);
          const { data: lineupProfiles } = await supabaseClient
            .from('profiles')
            .select('id, artist_name, genre, career_stage, clout')
            .in('id', artistIds);
          const slotLookup = new Map(slots.map((slot) => [slot.artist_id, slot]));
          setLineupArtists((lineupProfiles || []).map((artist) => ({
            ...artist,
            lane: slotLookup.get(artist.id)?.lane || null,
            secret_stage_unlocked: !!slotLookup.get(artist.id)?.secret_stage_unlocked,
          })));
        } else {
          setLineupArtists([]);
        }

        const activeTurn = gs?.last_completed_turn_id ?? gs?.global_turn_id ?? 0;
        const { data: days } = await supabaseClient
          .from('festival_instance_days')
          .select('day_index, status, resolve_turn_id')
          .eq('festival_instance_id', activeInst.id)
          .eq('status', 'SCHEDULED')
          .gt('resolve_turn_id', activeTurn)
          .order('day_index', { ascending: true })
          .limit(1);

        setActiveDayIndex(days?.[0]?.day_index || null);
      } else {
        setActiveFestivalInstanceId(null);
        setLineupArtists([]);
        setActiveDayIndex(null);
      }

    } catch (e) {
      console.error('[AmplifiApp] load error', e);
      setLoadError(e?.message || 'Failed to load festival data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (completedPerformedInstance && tab !== 'greenroom') {
      setTab('greenroom');
    }
  }, [completedPerformedInstance?.id]);

  const openFestivals = instances.filter((i) => i.status === 'OPEN');
  const upcomingFestivals = instances.filter((i) => i.status === 'SCHEDULED');
  const liveFestivals = instances.filter((i) => i.status === 'LIVE');
  const lockedFestivals = instances.filter((i) => i.status === 'LOCKED');
  const completedFestivals = instances.filter((i) => i.status === 'COMPLETE');
  const myInstances = instances.filter((i) => submissionMap[i.id] && i.status !== 'COMPLETE');
  const isInActiveLineup = !!activeFestivalInstanceId;

  const hasActiveInstances = liveFestivals.length > 0 || openFestivals.length > 0
    || lockedFestivals.length > 0 || upcomingFestivals.length > 0;
  const currentYear = Math.floor(currentTurn / 365);
  const currentWeek = Math.ceil(((currentTurn % 365) + 1) / 7) || 1;

  const featuredFromCatalog = allFestivals
    .filter((f) => (f.booking_philosophy?.prestige_weight || 0) >= 0.6)
    .slice(0, 6);
  const upcomingFromCatalog = allFestivals
    .slice()
    .sort((a, b) => {
      const aw = Math.min(...(a.seasonal_windows || [{ week: 999 }]).map((w) => w.week));
      const bw = Math.min(...(b.seasonal_windows || [{ week: 999 }]).map((w) => w.week));
      return aw - bw;
    });

  const dismissGreenRoom = useCallback(async () => {
    if (!completedPerformedInstance?.id || !profile?.id) return;

    const viewedAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from('festival_applications')
      .update({ green_room_viewed_at: viewedAt })
      .eq('festival_instance_id', completedPerformedInstance.id)
      .eq('artist_id', profile.id);

    if (error) throw error;

    setGreenRoomRecords((prev) => {
      const next = [...prev];
      const idx = next.findIndex((record) => record.festival_instance_id === completedPerformedInstance.id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], green_room_viewed_at: viewedAt };
        return next;
      }
      next.push({
        festival_instance_id: completedPerformedInstance.id,
        status: 'completed',
        green_room_viewed_at: viewedAt,
      });
      return next;
    });
    setHistoryRecords((prev) => prev.map((record) => record.festival_instance_id === completedPerformedInstance.id
      ? { ...record, green_room_viewed_at: viewedAt }
      : record));
    setCompletedPerformedInstance(null);
    setTab('history');
  }, [completedPerformedInstance?.id, profile?.id]);

  function openDetail(inst) {
    setSelectedInstance(inst);
    setModal('detail');
  }

  function closeModal() {
    setModal(null);
    setSelectedInstance(null);
  }

  function afterSubmit() {
    setModal(null);
    setSelectedInstance(null);
    load();
  }

  function openCatalogDetail(festival) {
    setSelectedInstance(buildFestivalPreviewInstance(festival, currentTurn));
    setModal('detail');
  }

  const selFestival = selectedInstance ? (selectedInstance.festival || festivalMap[selectedInstance.festival_id]) : null;

  return (
    <div className="amp-app">
      <div className="amp-topbar">
        <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.6)', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} color="#a855f7" />
          <span className="amp-title">Amplifi</span>
        </div>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
          Refresh
        </button>
      </div>

      <div className="amp-tab-bar">
        <button className={`amp-tab${tab === 'festivals' ? ' active' : ''}`} onClick={() => setTab('festivals')}>Festivals</button>
        <button className={`amp-tab${tab === 'myshows' ? ' active' : ''}`} onClick={() => setTab('myshows')}>
          My Shows {myInstances.length > 0 && `(${myInstances.length})`}
        </button>
        <button className={`amp-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {'\u{1F3C6}'} History
        </button>
        {isInActiveLineup && (
          <button className={`amp-tab${tab === 'rivalry' ? ' active' : ''}`} onClick={() => setTab('rivalry')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {'\u{2694}\u{FE0F}'} Rivalry
          </button>
        )}
        {isInActiveLineup && (
          <button className={`amp-tab${tab === 'backstage' ? ' active' : ''}`} onClick={() => setTab('backstage')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {'\u{1F91D}'} Backstage
          </button>
        )}
        {completedPerformedInstance && (
          <button className={`amp-tab${tab === 'greenroom' ? ' active' : ''}`} onClick={() => setTab('greenroom')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {'\u{1F3A4}'} Green Room
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.3)' }}>
          <Loader2 size={24} style={{ margin: '0 auto 10px', display: 'block', animation: 'spin 1s linear infinite' }} />
          Loading festivals...
        </div>
      )}

      {loadError && !loading && (
        <div style={{ margin: '12px 18px', padding: '12px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{loadError}</span>
          <button onClick={load} style={{ background: 'rgba(239,68,68,.2)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 12px', color: '#fca5a5', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Retry</button>
        </div>
      )}

      {!loading && tab === 'festivals' && (
        <div style={{ paddingBottom: 40 }}>
          {currentTurn > 0 && (
            <div className="amp-year-strip">
              <Calendar size={13} color="#a855f7" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)' }}>
                Year {currentYear + 1}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>{'\u00B7'}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>Week {currentWeek}</span>
            </div>
          )}

          {myInstances.length > 0 && (
            <div style={{ padding: '12px 18px 0' }}>
              <button
                onClick={() => setTab('myshows')}
                style={{ width: '100%', padding: '10px 16px', background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)', borderRadius: 12, color: '#d8b4fe', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{'\u{1F3A4}'} {myInstances.length} active application{myInstances.length > 1 ? 's' : ''}</span>
                <span style={{ fontSize: 11, opacity: .6 }}>My Shows {'\u2192'}</span>
              </button>
            </div>
          )}

          {liveFestivals.length > 0 && (
            <div style={{ paddingTop: 18 }}>
              <div className="amp-section-label" style={{ paddingLeft: 18, color: '#ef4444', marginBottom: 10 }}>{'\u{1F534}'} Live Now</div>
              <div className="amp-feat-scroll">
                {liveFestivals.map((inst) => (
                  <FeaturedCard
                    key={inst.id}
                    instance={inst}
                    festival={inst.festival || festivalMap[inst.festival_id] || {}}
                    profile={profile}
                    mySubmission={submissionMap[inst.id]}
                    onClick={() => openDetail(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {(openFestivals.length > 0 || featuredFromCatalog.length > 0) && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title={'\u{2B50} Featured Festivals'}
                festivals={(openFestivals.length > 0 ? openFestivals : featuredFromCatalog).map((item) => ({
                  instance: !!item.status ? item : null,
                  festival: !!item.status ? (item.festival || festivalMap[item.festival_id] || {}) : item,
                  isInstance: !!item.status,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  if (festivalObj.isInstance) {
                    openDetail(festivalObj.originalItem);
                  } else {
                    openCatalogDetail(festivalObj.originalItem);
                  }
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {(upcomingFestivals.length > 0 || upcomingFromCatalog.length > 0) && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title={'\u{1F4C5} Upcoming Festivals'}
                festivals={(upcomingFestivals.length > 0 ? upcomingFestivals : upcomingFromCatalog).map((item) => ({
                  instance: !!item.status ? item : null,
                  festival: !!item.status ? (item.festival || festivalMap[item.festival_id] || {}) : item,
                  isInstance: !!item.status,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  if (festivalObj.isInstance) {
                    openDetail(festivalObj.originalItem);
                  } else {
                    openCatalogDetail(festivalObj.originalItem);
                  }
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {completedFestivals.length > 0 && (
            <div style={{ paddingTop: 18 }}>
              <FestivalCarousel
                title={'\u{1F389} Festival Highlights'}
                festivals={completedFestivals.map((item) => ({
                  instance: item,
                  festival: item.festival || festivalMap[item.festival_id] || {},
                  isInstance: true,
                  originalItem: item,
                }))}
                onCardClick={(festivalObj) => {
                  openDetail(festivalObj.originalItem);
                }}
                showNavButtons={true}
              />
            </div>
          )}

          {!hasActiveInstances && !allFestivals.length && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
              <Radio size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
              No festivals active right now.<br />Check back next season.
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'myshows' && (
        <div style={{ paddingBottom: 40 }}>
          {myInstances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
              <Music size={32} color="rgba(255,255,255,.1)" style={{ margin: '0 auto 12px', display: 'block' }} />
              You haven't applied to any festivals yet.
            </div>
          ) : (
            <div className="amp-section">
              <div className="amp-section-label">Your Applications</div>
              {myInstances.map((inst) => (
                <FestivalCard
                  key={inst.id}
                  instance={inst}
                  festival={inst.festival || festivalMap[inst.festival_id] || {}}
                  profile={profile}
                  mySubmission={submissionMap[inst.id]}
                  lineupSlot={lineupSlotMap[inst.id]}
                  onClick={() => openDetail(inst)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'greenroom' && completedPerformedInstance && (
        <FestivalGreenRoom
          instanceId={completedPerformedInstance.id}
          festivalName={completedPerformedInstance.festival?.name || festivalMap[completedPerformedInstance.festival_id]?.name}
          profile={profile}
          onDismiss={dismissGreenRoom}
        />
      )}

      {!loading && tab === 'rivalry' && isInActiveLineup && (
        <RivalryTab
          profile={profile}
          festivalInstanceId={activeFestivalInstanceId}
          lineupArtists={lineupArtists}
          activeDayIndex={activeDayIndex}
        />
      )}

      {!loading && tab === 'backstage' && isInActiveLineup && (
        <BackstageTab
          profile={profile}
          festivalInstanceId={activeFestivalInstanceId}
          lineupArtists={lineupArtists}
        />
      )}

      {modal === 'detail' && selectedInstance && selFestival && (
        <FestivalDetail
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          mySubmission={submissionMap[selectedInstance.id]}
          mySetlist={setlistMap[selectedInstance.id]}
          myResults={resultsMap[selectedInstance.id]}
          onClose={closeModal}
          onSubmit={() => setModal('submit')}
          onSetlist={() => setModal('setlist')}
          onViewGreenRoom={() => { closeModal(); setTab('greenroom'); }}
          onEditSubmission={() => setModal('submit')}
        />
      )}

      {!loading && tab === 'history' && (
        <FestivalHistoryTab records={historyRecords} />
      )}

      {modal === 'submit' && selectedInstance && selFestival && (
        <FestivalSubmit
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          currentTurn={currentTurn}
          onClose={() => setModal('detail')}
          onSuccess={afterSubmit}
        />
      )}

      {modal === 'setlist' && selectedInstance && selFestival && (
        <FestivalSetlistEditor
          instance={selectedInstance}
          festival={selFestival}
          profile={profile}
          mySetlist={setlistMap[selectedInstance.id]}
          mySubmission={submissionMap[selectedInstance.id]}
          onClose={() => setModal('detail')}
          onSaved={afterSubmit}
        />
      )}
    </div>
  );
}
