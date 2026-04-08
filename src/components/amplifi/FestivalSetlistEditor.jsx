/**
 * FestivalSetlistEditor — Drag-and-drop setlist builder with live quality preview
 * Uses HTML5 native drag-and-drop (no library dependency)
 * Replaces the existing FestivalSetlist checkbox modal
 */

import React, { useState, useEffect } from 'react';
import { GripVertical, X, CheckCircle, Loader2, Lock, Music } from 'lucide-react';
import { supabaseClient } from '@/lib/supabaseClient';
import { invokeFestivalAction } from '@/lib/invokeFestivalAction';

// ── Setlist scoring (client-side preview, mirrors festivalSetlistModule.ts logic) ─

const LANE_SET_MIN = {
  HEADLINER: 90, MAIN_PRIME: 60, MAIN_EARLY: 45,
  SECOND_PRIME: 45, DISCOVERY: 30, SPOTLIGHT: 30,
};
const MAX_SONGS = 12;

function previewScore(songs) {
  if (!songs.length) return 0;
  const avgQuality = songs.reduce((s, sg) => s + (sg.quality ?? 50), 0) / songs.length;
  const lengthScore = Math.min(100, (songs.length / 8) * 100);
  // Simple preview: 50% quality + 50% length (full formula is server-side)
  return Math.round(avgQuality * 0.5 + lengthScore * 0.5);
}

function scoreColor(score) {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score) {
  if (score >= 80) return 'LEGENDARY';
  if (score >= 65) return 'STRONG';
  if (score >= 50) return 'DECENT';
  if (score >= 35) return 'WEAK';
  return 'POOR';
}

// ── Drag-and-drop helpers ─────────────────────────────────────────────────────

export default function FestivalSetlistEditor({ instance, festival, profile, mySetlist, mySubmission, onClose, onSaved }) {
  const lane = mySubmission?.desired_lane || mySetlist?.lane || 'DISCOVERY';
  const minSongs = Math.max(3, Math.ceil((LANE_SET_MIN[lane] || 30) / 15)); // ~1 song per 15min
  const maxSongs = MAX_SONGS;

  const [allSongs, setAllSongs] = useState([]);     // full pool
  const [setlist, setSetlist] = useState([]);        // ordered setlist (song objects)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);  // index in setlist being dragged

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabaseClient
          .from('songs')
          .select('id, title, genre, quality, status, release_status')
          .eq('artist_id', profile.id)
          .eq('status', 'recorded')
          .eq('release_status', 'released')
          .order('quality', { ascending: false })
          .limit(60);
        const pool = data || [];
        setAllSongs(pool);

        // Pre-populate from existing setlist
        if (mySetlist?.songs?.length) {
          const existingIds = mySetlist.songs.map((s) => s.songId || s.id || s);
          const ordered = existingIds
            .map((id) => pool.find((s) => s.id === id))
            .filter(Boolean);
          setSetlist(ordered);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile.id, mySetlist]);

  const setlistIds = new Set(setlist.map((s) => s.id));
  const pool = allSongs.filter((s) => !setlistIds.has(s.id));

  function addSong(song) {
    if (setlist.length >= maxSongs) return;
    setSetlist((prev) => [...prev, song]);
  }

  function removeSong(index) {
    setSetlist((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Drag handlers (within setlist reorder) ────────────────────────────────
  function onDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function onDragOver(e, targetIndex) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null || dragIndex === targetIndex) return;
    const from = dragIndex;
    setSetlist((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(targetIndex);
  }

  function onDragEnd() { setDragIndex(null); }

  // ── Drop song from pool into setlist ──────────────────────────────────────
  function onDropFromPool(e, song) {
    e.preventDefault();
    addSong(song);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function save(lock = false) {
    if (!setlist.length) return;
    lock ? setLocking(true) : setSaving(true);
    try {
      const songIds = setlist.map((s) => s.id);
      await invokeFestivalAction('saveSetlist', {
        festivalInstanceId: instance.id,
        lane,
        songs: songIds,
        locked: lock,
      });
      onSaved();
    } catch (e) {
      console.error('Setlist save failed', e);
    } finally {
      setSaving(false);
      setLocking(false);
    }
  }

  const score = previewScore(setlist);
  const isLocked = mySetlist?.locked;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 420, background: '#13121a', border: '1px solid rgba(255,255,255,.09)', borderBottom: 'none', borderRadius: '24px 24px 0 0', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Build Setlist</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>
              {festival?.name} · {lane.replace('_', ' ')} · {setlist.length}/{maxSongs} songs
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Score preview bar */}
        <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: 1 }}>SET QUALITY PREVIEW</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(score) }}>{score}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: scoreColor(score) + '22', color: scoreColor(score) }}>{scoreLabel(score)}</span>
            </div>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor(score)}, ${scoreColor(Math.max(0, score - 20))})`, borderRadius: 2, transition: 'width .3s' }} />
          </div>
          {setlist.length < minSongs && (
            <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 5 }}>
              Add {minSongs - setlist.length} more song{minSongs - setlist.length !== 1 ? 's' : ''} minimum for this lane
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>

          {/* Setlist — drag to reorder */}
          <div style={{ padding: '12px 16px 4px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, marginBottom: 8 }}>YOUR SETLIST</div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,.3)' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', margin: '0 auto', display: 'block' }} />
              </div>
            ) : setlist.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,.2)', fontSize: 12 }}>
                Add songs from the pool below
              </div>
            ) : (
              <div>
                {setlist.map((song, i) => (
                  <div
                    key={song.id}
                    draggable={!isLocked}
                    onDragStart={(e) => onDragStart(e, i)}
                    onDragOver={(e) => onDragOver(e, i)}
                    onDragEnd={onDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 10, marginBottom: 4,
                      background: dragIndex === i ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${dragIndex === i ? 'rgba(168,85,247,.4)' : 'rgba(255,255,255,.06)'}`,
                      cursor: isLocked ? 'default' : 'grab', opacity: isLocked ? 0.7 : 1, transition: 'all .15s',
                    }}
                  >
                    <GripVertical size={14} color="rgba(255,255,255,.2)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>Q{song.quality ?? '—'} · {song.genre}</div>
                    </div>
                    {!isLocked && (
                      <button onClick={() => removeSong(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.3)', padding: 2, flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pool — tap to add */}
          {!loading && !isLocked && pool.length > 0 && (
            <div style={{ padding: '8px 16px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.35)', letterSpacing: 1, marginBottom: 8 }}>ADD SONGS</div>
              {pool.map((song) => (
                <div
                  key={song.id}
                  draggable
                  onDragEnd={(e) => { e.preventDefault(); }}
                  onDrop={(e) => onDropFromPool(e, song)}
                  onClick={() => addSong(song)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 10, marginBottom: 4,
                    background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)',
                    cursor: setlist.length >= maxSongs ? 'not-allowed' : 'pointer',
                    opacity: setlist.length >= maxSongs ? 0.4 : 1, transition: 'all .15s',
                  }}
                >
                  <Music size={13} color="rgba(255,255,255,.2)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>Q{song.quality ?? '—'} · {song.genre}</div>
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(168,85,247,.7)', flexShrink: 0 }}>+ ADD</span>
                </div>
              ))}
            </div>
          )}

          {!loading && allSongs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.25)', fontSize: 12 }}>
              No released songs found.<br />Release music first.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '12px 16px 28px', borderTop: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
          {isLocked ? (
            <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 12 }}>
              <CheckCircle size={16} color="#10b981" style={{ display: 'inline', marginRight: 6 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Setlist locked — ready for showday</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => save(false)}
                disabled={setlist.length < minSongs || saving}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(168,85,247,.15)', border: '1px solid rgba(168,85,247,.4)', color: '#d8b4fe', fontSize: 13, fontWeight: 700, cursor: setlist.length < minSongs ? 'not-allowed' : 'pointer', opacity: setlist.length < minSongs ? 0.4 : 1 }}
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={() => save(true)}
                disabled={setlist.length < minSongs || locking}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff', fontSize: 13, fontWeight: 800, border: 'none', cursor: setlist.length < minSongs ? 'not-allowed' : 'pointer', opacity: setlist.length < minSongs ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <Lock size={13} />
                {locking ? 'Locking…' : 'Lock Setlist'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
