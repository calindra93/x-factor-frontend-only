import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2, Sparkles, X, UserPlus, Users, Music,
  ChevronDown, ChevronUp, Loader2, TrendingUp
} from "lucide-react";
import { showToast } from "@/components/ui/toast-provider";
import { reportError } from "@/lib/errorReporting";
import { normalizeRegion } from "@/lib/regionConstants";

const getTierColor = (tier) => {
  const colors = {
    0: "text-gray-500 bg-gray-500/10 border-gray-500/20",
    1: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    2: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    3: "text-green-400 bg-green-400/10 border-green-400/20",
    4: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    5: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  };
  return colors[tier] || colors[3];
};

const ENERGY_COST = 15;
const INSPIRATION_COST = 10;

export default function RecordingWizard({ song, batchSongs, profile, songs = [], onComplete, onClose }) {
  const isBatch = Array.isArray(batchSongs) && batchSongs.length > 0;
  const batchCount = isBatch ? batchSongs.length : 1;
  const [studios, setStudios] = useState([]);
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [selectedStudio, setSelectedStudio] = useState(null);
  const [studioRegion, setStudioRegion] = useState("");
  const [renameTitle, setRenameTitle] = useState(song?.title || "");

  const [showCollabPicker, setShowCollabPicker] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [allArtists, setAllArtists] = useState([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [revenueSplit, setRevenueSplit] = useState(15);
  const [featureFee, setFeatureFee] = useState(0);

  const [recording, setRecording] = useState(false);

  useEffect(() => {
    loadStudios();
  }, []);

  const loadStudios = async () => {
    try {
      const allStudios = await base44.entities.Studio.list();
      const normalized = Array.isArray(allStudios) ? allStudios : [];
      const mapped = normalizeRegion(profile?.region) || profile?.region;
      setStudioRegion(mapped);
      setStudios(normalized.filter(s => s.region === mapped));
    } catch (err) {
      console.error("[RecordingWizard] Failed to load studios:", err);
      setStudios([]);
    } finally {
      setLoadingStudios(false);
    }
  };

  const loadArtists = async () => {
    if (allArtists.length > 0) return;
    setLoadingArtists(true);
    try {
      const list = await base44.entities.ArtistProfile.list("-created_date", 50);
      const filtered = (list || [])
        .filter(a => a.id !== profile?.id && a.is_active !== false)
        .map(a => ({ ...a, match_score: computeMatch(a, profile) }))
        .sort((a, b) => b.match_score - a.match_score);
      setAllArtists(filtered);
    } catch (err) {
      console.error("[RecordingWizard] Failed to load artists:", err);
    } finally {
      setLoadingArtists(false);
    }
  };

  const computeMatch = (artist, prof) => {
    if (!prof) return 50;
    const genreMatch = artist.genre === prof.genre ? 0.3 : 0.1;
    const cloutDiff = Math.abs((artist.clout || 0) - (prof.clout || 0));
    const cloutScore = Math.max(0, 1 - cloutDiff / Math.max(1, prof.clout || 1)) * 0.35;
    const fDiff = Math.abs((artist.followers || 0) - (prof.followers || 0));
    const fScore = Math.max(0, 1 - fDiff / Math.max(1, prof.followers || 1)) * 0.25;
    return Math.min(100, Math.round((genreMatch + cloutScore + fScore) * 100));
  };

  const perSongStudioCost = selectedStudio?.cost_per_song || 0;
  const totalStudioCost = perSongStudioCost * batchCount;
  const totalEnergy = isBatch ? Math.ceil(batchCount * ENERGY_COST * 0.5) : ENERGY_COST;
  const totalInspiration = isBatch ? Math.ceil(batchCount * INSPIRATION_COST * 0.5) : INSPIRATION_COST;
  const hasCollab = !isBatch && collaborators.length > 0;
  const canAfford = profile &&
    profile.energy >= totalEnergy &&
    profile.inspiration >= totalInspiration &&
    profile.income >= totalStudioCost;

  const calcQuality = (studio, genre) => {
    const qualityRange = studio.quality_ceiling - studio.quality_floor;
    const consistencyFactor = studio.consistency_rating / 100;
    const variance = qualityRange * (1 - consistencyFactor);
    const baseQuality = studio.quality_floor + (qualityRange * consistencyFactor);
    let quality = Math.floor(baseQuality + Math.random() * variance);
    if (studio.genre_bonuses?.includes(genre)) quality = Math.min(100, quality + 10);
    return quality;
  };

  const trimmedRename = renameTitle.trim();
  const isDuplicateRename = !isBatch && song && trimmedRename &&
    trimmedRename.toLowerCase() !== song.title?.toLowerCase().trim() &&
    songs.some(s => s.id !== song.id && s.title?.toLowerCase().trim() === trimmedRename.toLowerCase());

  const handleRecord = async () => {
    if (!selectedStudio || !profile) return;
    if (!isBatch && !song) return;
    if (!canAfford) {
      showToast("Not enough resources to record.", "warning");
      return;
    }
    if (!isBatch && trimmedRename && isDuplicateRename) {
      showToast(`You already have a song called "${trimmedRename}"`, "error");
      return;
    }

    setRecording(true);
    try {
      const studio = selectedStudio;
      const titlePatch = (!isBatch && trimmedRename && trimmedRename !== song.title) ? { title: trimmedRename } : {};

      if (isBatch) {
        // ── BATCH RECORD ALL ──
        for (const s of batchSongs) {
          const quality = calcQuality(studio, s.genre);
          await base44.entities.Song.update(s.id, {
            status: "recorded",
            quality,
            studio_id: studio.id,
          });
        }

        await base44.entities.ArtistProfile.update(profile.id, {
          energy: profile.energy - totalEnergy,
          inspiration: profile.inspiration - totalInspiration,
          income: profile.income - totalStudioCost,
        });

        showToast(`${batchCount} songs recorded! (50% project discount)`, "success");
      } else {
        // ── SINGLE SONG ──
        const quality = calcQuality(studio, song.genre);

        if (hasCollab) {
          // Create collaboration requests directly via supabaseClient (bypass 401 edge function)
          try {
            const { supabaseClient } = await import("@/lib/supabaseClient");
            for (const collab of collaborators) {
              const { data: collaborationRequest, error } = await supabaseClient
                .from("collaboration_requests")
                .insert({
                  requester_artist_id: profile.id,
                  target_artist_id: collab.id,
                  collaboration_type: "Feature",
                  proposed_concept: `Feature on "${song.title}"`,
                  song_id: song.id,
                  revenue_split: revenueSplit / 100,
                  feature_fee: featureFee,
                  status: "pending",
                })
                .select("id, collaboration_type, proposed_concept")
                .single();
              if (error) throw error;

              // Notify the target artist
              await supabaseClient.from("notifications").insert({
                player_id: collab.id,
                type: "COLLABORATION_REQUEST",
                title: "Feature Request!",
                subtitle: `${profile.artist_name} wants to feature you`,
                body: `Feature request for "${song.title}" — ${revenueSplit}% rev split${featureFee > 0 ? ` + $${featureFee.toLocaleString()} fee` : ""}.`,
                metrics: {
                  collaboration_id: collaborationRequest?.id,
                  collaboration_type: collaborationRequest?.collaboration_type || "Feature",
                  requester_id: profile.id,
                  requester_name: profile.artist_name,
                  song_id: song.id,
                },
                payload: {
                  collaboration_id: collaborationRequest?.id,
                  collaboration_type: collaborationRequest?.collaboration_type || "Feature",
                  requester_id: profile.id,
                  requester_name: profile.artist_name,
                  proposed_concept: collaborationRequest?.proposed_concept || `Feature on "${song.title}"`,
                  song_id: song.id,
                  song_title: song.title,
                  revenue_split: revenueSplit / 100,
                  feature_fee: featureFee,
                },
                deep_links: [
                  { label: "Open Collaboration Inbox", route: "Social", params: { openInbox: "collaborations" } },
                ],
                idempotency_key: `collab_req_${collaborationRequest?.id || `${profile.id}_${song.id}_${collab.id}`}`,
                priority: "high",
                is_read: false,
              });
            }
          } catch (collabErr) {
            console.error("[RecordingWizard] Collab request error:", collabErr);
            showToast(`Failed to send collaboration request: ${collabErr.message}`, "error");
          }

          await base44.entities.Song.update(song.id, {
            status: "waiting_on_collab",
            quality,
            studio_id: studio.id,
            featured_artist_ids: collaborators.map(c => c.id),
            ...titlePatch,
          });
        } else {
          await base44.entities.Song.update(song.id, {
            status: "recorded",
            quality,
            studio_id: studio.id,
            ...titlePatch,
          });
        }

        await base44.entities.ArtistProfile.update(profile.id, {
          energy: profile.energy - totalEnergy,
          inspiration: profile.inspiration - totalInspiration,
          income: profile.income - totalStudioCost,
        });

        showToast(
          hasCollab
            ? `"${song.title}" recorded! Waiting for feature response.`
            : `"${song.title}" recorded successfully!`,
          "success"
        );
      }

      onComplete?.();
    } catch (err) {
      reportError({ scope: "RecordingWizard", message: "Failed to record", error: err });
      showToast(`Recording failed: ${err.message}`, "error");
    } finally {
      setRecording(false);
    }
  };

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
        className="w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden max-h-[min(680px,85vh)] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-white text-sm font-bold truncate max-w-[200px]">{isBatch ? `Record ${batchCount} Songs` : (song?.title || "Record Song")}</h2>
              <p className="text-gray-500 text-[10px]">{isBatch ? `${batchCount} unrecorded tracks • 50% discount` : `${song?.genre} • Q:${song?.quality || "?"}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">

          {/* ─── RENAME SONG ─── */}
          {!isBatch && song && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-white text-xs font-semibold">Song Title</h3>
              </div>
              <Input
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                placeholder="Song title..."
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-9 rounded-lg text-xs"
              />
              {isDuplicateRename && (
                <p className="text-red-400 text-[10px] mt-1">You already have a song with this name</p>
              )}
            </div>
          )}

          {/* ─── SELECT STUDIO ─── */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-white text-xs font-semibold">Select Studio</h3>
              </div>
              <span className="text-gray-600 text-[10px]">{studioRegion}</span>
            </div>

            {loadingStudios ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
              </div>
            ) : studios.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-3">No studios in your region</p>
            ) : (
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                {studios.map((studio) => {
                  const isSelected = selectedStudio?.id === studio.id;
                  const hasGenreBonus = studio.genre_bonuses?.includes(song?.genre);
                  const tierColor = getTierColor(studio.tier);
                  return (
                    <button
                      key={studio.id}
                      onClick={() => setSelectedStudio(studio)}
                      className={`w-full rounded-lg p-2.5 text-left transition-all border ${
                        isSelected
                          ? "border-red-500/40 bg-red-500/10"
                          : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 border ${tierColor}`}>
                          {studio.tier >= 4 ? <Sparkles className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white text-[11px] font-medium truncate">{studio.name}</span>
                            {hasGenreBonus && (
                              <span className="px-1 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[8px] text-red-400 flex-shrink-0">BONUS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
                            <span>Q:{studio.quality_floor}-{studio.quality_ceiling}</span>
                            <span>•</span>
                            <span className="text-yellow-400">${studio.cost_per_song}</span>
                            <span>•</span>
                            <span className="text-green-400">+{studio.virality_modifier}% viral</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── ADD FEATURE (OPTIONAL) ─── */}
          {!isBatch && <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <button
              onClick={() => {
                setShowCollabPicker(!showCollabPicker);
                if (!showCollabPicker) loadArtists();
              }}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                <h3 className="text-white text-xs font-semibold">Add Feature</h3>
                <span className="text-gray-600 text-[10px]">(optional)</span>
              </div>
              {showCollabPicker ? (
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>

            {collaborators.length > 0 && !showCollabPicker && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-1">
                    <span className="text-purple-300 text-[10px] font-medium">{c.artist_name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setCollaborators(prev => prev.filter(x => x.id !== c.id)); }} className="text-purple-400 hover:text-white">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {showCollabPicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                    {loadingArtists ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                      </div>
                    ) : allArtists.length === 0 ? (
                      <p className="text-gray-500 text-[10px] text-center py-2">No artists available</p>
                    ) : (
                      allArtists.map((artist) => {
                        const isSel = collaborators.some(c => c.id === artist.id);
                        return (
                          <button
                            key={artist.id}
                            onClick={() => {
                              if (isSel) {
                                setCollaborators(prev => prev.filter(c => c.id !== artist.id));
                              } else if (collaborators.length < 2) {
                                setCollaborators(prev => [...prev, artist]);
                              }
                            }}
                            className={`w-full rounded-lg p-2 text-left flex items-center gap-2 transition-all border ${
                              isSel ? "border-purple-500/40 bg-purple-500/10" : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {artist.artist_image ? (
                                <img src={artist.artist_image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Users className="w-3 h-3 text-gray-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-white text-[11px] font-medium truncate block">{artist.artist_name}</span>
                              <span className="text-gray-500 text-[9px]">{artist.genre} • {artist.followers?.toLocaleString() || 0} fans</span>
                            </div>
                            <span
                              className="text-[10px] font-semibold flex-shrink-0"
                              style={{ color: artist.match_score >= 80 ? '#4ade80' : artist.match_score >= 60 ? '#fbbf24' : '#94a3b8' }}
                            >
                              {artist.match_score}%
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="text-gray-600 text-[9px] mt-1.5">
                    {hasCollab
                      ? "Song will be recorded but marked as waiting for feature response."
                      : "Select up to 2 featured artists. They must accept before release."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>}

          {/* ─── REVENUE SPLIT ─── */}
          {hasCollab && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
                  <h3 className="text-white text-xs font-semibold">Revenue Split</h3>
                </div>
                <span className="text-yellow-400 text-[11px] font-bold">{revenueSplit}%</span>
              </div>
              <p className="text-gray-500 text-[9px] mb-2">
                How much of this song's revenue goes to the featured artist{collaborators.length > 1 ? 's' : ''}
              </p>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={revenueSplit}
                onChange={(e) => setRevenueSplit(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between mt-1">
                <span className="text-gray-600 text-[8px]">5%</span>
                <span className="text-gray-500 text-[8px]">You keep {100 - revenueSplit}% • They get {revenueSplit}%</span>
                <span className="text-gray-600 text-[8px]">50%</span>
              </div>
            </div>
          )}

          {/* ─── FEATURE FEE ─── */}
          {hasCollab && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400 text-xs">💸</span>
                  <h3 className="text-white text-xs font-semibold">Feature Fee</h3>
                </div>
                <span className="text-yellow-400 text-[11px] font-bold">
                  {featureFee > 0 ? `$${featureFee.toLocaleString()}` : "Free"}
                </span>
              </div>
              <p className="text-gray-500 text-[9px] mb-2">
                Optional upfront cash paid to the featured artist on acceptance
              </p>
              <input
                type="range"
                min={0}
                max={50000}
                step={500}
                value={featureFee}
                onChange={(e) => setFeatureFee(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between mt-1">
                <span className="text-gray-600 text-[8px]">Free</span>
                <span className="text-gray-600 text-[8px]">$50,000</span>
              </div>
            </div>
          )}

          {/* ─── COST SUMMARY ─── */}
          {selectedStudio && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <h3 className="text-white text-xs font-semibold mb-2">Cost Summary</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-lg p-2 text-center border ${profile?.energy >= totalEnergy ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                  <p className="text-[9px] text-gray-400">Energy</p>
                  <p className={`text-sm font-bold ${profile?.energy >= totalEnergy ? 'text-green-400' : 'text-red-400'}`}>
                    -{totalEnergy}
                  </p>
                  <p className="text-[8px] text-gray-500">{profile?.energy || 0} avail</p>
                </div>
                <div className={`rounded-lg p-2 text-center border ${profile?.inspiration >= totalInspiration ? 'border-blue-500/20 bg-blue-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                  <p className="text-[9px] text-gray-400">Inspiration</p>
                  <p className={`text-sm font-bold ${profile?.inspiration >= totalInspiration ? 'text-blue-400' : 'text-red-400'}`}>
                    -{totalInspiration}
                  </p>
                  <p className="text-[8px] text-gray-500">{profile?.inspiration || 0} avail</p>
                </div>
                <div className={`rounded-lg p-2 text-center border ${profile?.income >= totalStudioCost ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                  <p className="text-[9px] text-gray-400">Studio Fee</p>
                  <p className={`text-sm font-bold ${profile?.income >= totalStudioCost ? 'text-yellow-400' : 'text-red-400'}`}>
                    ${totalStudioCost}
                  </p>
                  <p className="text-[8px] text-gray-500">${profile?.income || 0} avail</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Waveform animation — visible only while recording */}
        {recording && (
          <div className="flex items-center justify-center gap-[3px] py-2 border-t border-white/[0.04] flex-shrink-0">
            {[0.4,0.7,1,0.85,0.55,0.9,0.65,1,0.75,0.5,0.8,0.6,0.95,0.45,0.7].map((h, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-red-500"
                animate={{ scaleY: [h, h * 0.3 + 0.1, h] }}
                transition={{ duration: 0.5 + (i % 5) * 0.07, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
                style={{ height: 20, originY: 0.5 }}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 p-3 border-t border-white/[0.06] flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl h-10 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRecord}
            disabled={!selectedStudio || recording || !canAfford || isDuplicateRename}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl h-10 text-xs disabled:opacity-30"
          >
            {recording ? (
              <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recording...</span>
            ) : isBatch ? (
              `Record All (${batchCount})`
            ) : hasCollab ? (
              "Record & Request Feature"
            ) : (
              "Record"
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
