import React, { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, MoreVertical, BarChart3, Share2, Edit, ChevronDown, Music, RefreshCw, Sparkles, Rocket, X, Upload } from "lucide-react";
import { OUTCOME_DISPLAY_META, ACTIVE_PHASE_DISPLAY, REVIVAL_DISPLAY_META, isTerminalState, isActiveState } from "@/data/lifecycleConstants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";
import CatalogActionsModal from "./CatalogActionsModal";
import { getArtworkUrl } from "./projectArtwork";


/**
 * Compact strip shown between card image and stats.
 * Active releases: shows current lifecycle phase + projected outcome badge.
 * Terminal releases: shows locked classification badge.
 */
function TrajectoryStrip({ release }) {
  if (!release) return null;
  const lifecycleState = release.lifecycle_state || '';

  // Terminal: show locked classification using the same strip layout as active phases
  if (isTerminalState(lifecycleState)) {
    const meta = OUTCOME_DISPLAY_META[lifecycleState];
    if (!meta) return null;
    const isArchived = lifecycleState === 'Archived';
    const stripBg = isArchived ? 'bg-black/40' : meta.bg;
    const stripBorder = isArchived ? 'border-white/[0.06]' : meta.border;
    const dotColor = isArchived ? 'bg-gray-500' : `bg-current`;
    return (
      <div className={`px-3 py-2 flex items-center justify-between ${stripBg} border-b ${stripBorder}`}>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex rounded-full h-1.5 w-1.5 ${isArchived ? 'bg-gray-500' : ''} ${meta.color}`} style={!isArchived ? { backgroundColor: 'currentColor' } : undefined} />
          <span className={`text-[10px] font-bold ${meta.color}`}>{meta.emoji} {meta.label}</span>
          <span className="text-[9px] text-white/30">Final classification</span>
        </div>
      </div>
    );
  }

  // Active: show phase label + projected outcome badge
  if (!isActiveState(lifecycleState)) return null;
  const phase = ACTIVE_PHASE_DISPLAY[lifecycleState];
  if (!phase) return null;

  const performanceClass = release.performance_class;
  const confidence = Number(release.performance_class_confidence) || 0;
  const meta = performanceClass && performanceClass !== 'Archived'
    ? OUTCOME_DISPLAY_META[performanceClass]
    : null;
  const showProjection = meta && confidence >= 0.15;

  return (
    <div className={`px-3 py-2 flex items-center justify-between ${phase.bg} border-b ${phase.border}`}>
      <div className="flex items-center gap-1.5">
        {phase.pulse ? (
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${phase.dotColor} opacity-60`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${phase.dotColor}`} />
          </span>
        ) : (
          <span className={`inline-flex rounded-full h-1.5 w-1.5 ${phase.dotColor}`} />
        )}
        <span className={`text-[10px] font-bold ${phase.textColor}`}>{phase.emoji} {phase.label}</span>
        <span className="text-[9px] text-white/30">{phase.subLabel}</span>
      </div>
      {showProjection && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${meta.color} ${meta.bg}`}>
          <span>{meta.emoji}</span>
          <span>{meta.label}</span>
          <span className="text-white/30 font-normal">{Math.round(confidence * 100)}%</span>
        </span>
      )}
      {release.revival_count > 0 && (
        <span className="text-[9px] text-cyan-400/80 ml-1">
          {REVIVAL_DISPLAY_META[release.revival_trigger_reason]?.emoji || '\u{1F504}'} Revived {release.revival_count}/2
        </span>
      )}
    </div>
  );
}

export default function ReleasedLibrary({ releasedProjects, releasedSongs, songs, releases, profile, onRefresh }) {
  const [activeTab, setActiveTab] = useState("singles");
  const [expandedProject, setExpandedProject] = useState(null);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [selectedSongForRemix, setSelectedSongForRemix] = useState(null);
  const [selectedReleaseForDeluxe, setSelectedReleaseForDeluxe] = useState(null);
  const [selectedTrackForSingle, setSelectedTrackForSingle] = useState(null);
  const [analyticsProject, setAnalyticsProject] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editCoverFile, setEditCoverFile] = useState(null);
  const [editCoverPreview, setEditCoverPreview] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const handleViewAnalytics = (project) => {
    setAnalyticsProject(analyticsProject?.id === project.id ? null : project);
  };

  const handleEditDetails = (project) => {
    setEditingProject(project);
    setEditName(project.name || "");
    setEditCoverUrl(getArtworkUrl(project));
    setEditCoverFile(null);
    setEditCoverPreview(getArtworkUrl(project));
  };

  const handleCoverFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditCoverPreview(ev.target.result);
      setEditCoverUrl(""); // clear URL when file selected
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async () => {
    if (!editingProject || !editName.trim()) return;
    setEditSaving(true);
    try {
      let finalCoverUrl = editCoverUrl;

      // If a file was selected, upload to Supabase Storage
      if (editCoverFile) {
        try {
          const { supabaseClient } = await import("@/lib/supabaseClient");
          const ext = editCoverFile.name.split(".").pop();
          const path = `cover-art/${editingProject.id}-${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabaseClient.storage
            .from("uploads")
            .upload(path, editCoverFile, { upsert: true, contentType: editCoverFile.type });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabaseClient.storage.from("uploads").getPublicUrl(path);
          finalCoverUrl = urlData?.publicUrl || "";
        } catch (uploadError) {
          // Fall back to using the data URL as preview only
          console.warn("[ReleasedLibrary] Storage upload failed, using data URL", uploadError);
          finalCoverUrl = editCoverPreview;
        }
      }

      await base44.entities.Project.update(editingProject.id, {
        name: editName.trim(),
        cover_artwork_url: finalCoverUrl
      });
      // Also update any linked release record so artwork shows in timeline + library
      if (finalCoverUrl) {
        try {
          const { supabaseClient } = await import("@/lib/supabaseClient");
          await supabaseClient
            .from("releases")
            .update({ cover_artwork_url: finalCoverUrl })
            .eq("project_id", editingProject.id);
        } catch (releaseUpdateErr) {
          console.warn("[ReleasedLibrary] Could not sync cover art to releases table:", releaseUpdateErr);
        }
      }
      showToast("Project updated!", "success");
      setEditingProject(null);
      setEditCoverFile(null);
      setEditCoverPreview("");
      onRefresh?.();
    } catch (err) {
      showToast(`Failed to update: ${err.message}`, "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleOpenRemixModal = (song) => {
    setSelectedSongForRemix(song);
    setSelectedReleaseForDeluxe(null);
    setCatalogModalOpen(true);
  };

  const handleOpenDeluxeModal = (release) => {
    setSelectedReleaseForDeluxe(release);
    setSelectedSongForRemix(null);
    setSelectedTrackForSingle(null);
    setCatalogModalOpen(true);
  };

  const handleReleaseSingleFromAlbum = (song, release) => {
    setSelectedTrackForSingle({ song, release });
    setSelectedSongForRemix(null);
    setSelectedReleaseForDeluxe(null);
    setCatalogModalOpen(true);
  };

  const handleCatalogActionComplete = () => {
    setCatalogModalOpen(false);
    setSelectedSongForRemix(null);
    setSelectedReleaseForDeluxe(null);
    setSelectedTrackForSingle(null);
    onRefresh?.();
  };

  // Deterministic release selection: prefer album/EP/mixtape release over single
  // so deluxe edition and tracklist features work on the full project release.
  const pickBestRelease = (existing, candidate) => {
    if (!existing) return candidate;
    const existingType = (existing.project_type || '').toLowerCase();
    const candidateType = (candidate.project_type || '').toLowerCase();
    const albumTypes = ['album', 'ep', 'mixtape', 'demo'];
    const existingIsAlbum = albumTypes.includes(existingType);
    const candidateIsAlbum = albumTypes.includes(candidateType);
    // Prefer album-type over single-type
    if (candidateIsAlbum && !existingIsAlbum) return candidate;
    if (existingIsAlbum && !candidateIsAlbum) return existing;
    // Same tier: prefer the one with more streams (more likely the "real" release)
    return (candidate.lifetime_streams || 0) > (existing.lifetime_streams || 0) ? candidate : existing;
  };

  const releaseMap = useMemo(() => {
    const map = new Map();
    releases.forEach((release) => {
      if (!release.project_id) return;
      const existing = map.get(release.project_id);
      map.set(release.project_id, pickBestRelease(existing, release));
    });
    return map;
  }, [releases]);

  const releasedProjectIdSet = useMemo(() => new Set(releasedProjects.map(p => p.id)), [releasedProjects]);
  const singleReleases = useMemo(() => {
    return releases.filter(r =>
      r.project_type === "Single" &&
      (!r.project_id || !releasedProjectIdSet.has(r.project_id))
    );
  }, [releases, releasedProjectIdSet]);

  const resolveProjectType = (project) => String(project?.type || project?.project_type || "").trim();

  // Singles from projects (legacy)
  const projectSingles = releasedProjects.filter((project) => resolveProjectType(project).toLowerCase() === "single");
  
  // Albums: combine from releasedProjects AND directly from releases table
  const projectAlbums = releasedProjects.filter((project) => {
    const projectType = resolveProjectType(project).toLowerCase();
    return projectType === "album" || projectType === "ep" || projectType === "mixtape" || projectType === "demo";
  });
  
  // Get album releases that aren't already covered by releasedProjects
  const albumReleases = useMemo(() => {
    const projectAlbumIds = new Set(projectAlbums.map(p => p.id));
    return releases.filter(r => {
      const type = (r.project_type || "").toLowerCase();
      const isAlbumType = type === "album" || type === "ep" || type === "mixtape" || type === "demo";
      // Include if it's an album type and either has no project_id or the project isn't in projectAlbums
      return isAlbumType && (!r.project_id || !projectAlbumIds.has(r.project_id));
    });
  }, [releases, projectAlbums]);
  
  // Combined albums list
  const albums = projectAlbums;
  


  const getMilestoneData = (streams, isSingle) => {
    // Define milestones in STREAMS - aligned with chartUpdateModule.ts certification thresholds
    // Based on RIAA: 150 streams = 1 unit, scaled ~10x easier for game satisfaction
    const baseMilestones = [
      { threshold: 100000, label: "100K", color: "from-gray-500 to-gray-600", tier: 0 },
      { threshold: 500000, label: "500K", color: "from-blue-500 to-blue-600", tier: 1 },
      { threshold: 1000000, label: "1M", color: "from-green-500 to-green-600", tier: 2 },
      { threshold: 5000000, label: "5M", color: "from-purple-500 to-purple-600", tier: 3 },
      { threshold: 7500000, label: "Gold", color: "from-yellow-400 to-yellow-600", tier: 4 },
      { threshold: 15000000, label: "Platinum", color: "from-gray-200 to-gray-400", tier: 5 },
      { threshold: 150000000, label: "Diamond", color: "from-cyan-400 to-blue-600", tier: 6 }
    ];

    // Calculate units for display (150 streams = 1 unit for singles, 1500 for albums)
    const streamMultiplier = isSingle ? 150 : 1500;
    const units = Math.floor(streams / streamMultiplier);

    let currentMilestone = baseMilestones[0];
    let nextMilestone = null;
    let multiplier = 1;

    // Find highest milestone achieved by comparing streams directly
    for (let i = baseMilestones.length - 1; i >= 0; i--) {
      if (streams >= baseMilestones[i].threshold) {
        currentMilestone = baseMilestones[i];
        
        // Check for multipliers (only for Gold, Platinum, Diamond tiers)
        if (currentMilestone.tier >= 4) {
          multiplier = Math.floor(streams / currentMilestone.threshold);
          const nextMultiplier = multiplier + 1;
          const nextThreshold = currentMilestone.threshold * nextMultiplier;
          
          const nextTierMilestone = baseMilestones[i + 1];
          
          if (nextTierMilestone && streams >= nextTierMilestone.threshold) {
            continue;
          } else if (nextTierMilestone && nextThreshold >= nextTierMilestone.threshold) {
            nextMilestone = nextTierMilestone;
            multiplier = 1;
          } else {
            nextMilestone = {
              ...currentMilestone,
              threshold: nextThreshold,
              multiplier: nextMultiplier
            };
          }
        } else {
          nextMilestone = baseMilestones[i + 1] || null;
        }
        break;
      } else {
        nextMilestone = baseMilestones[i];
      }
    }

    // If 0 streams
    if (streams === 0) {
      return {
        label: baseMilestones[0].label,
        current: 0,
        target: baseMilestones[0].threshold,
        percent: 0,
        color: "from-gray-600 to-gray-700",
        units: 0,
        multiplier: 1,
        isMaxed: false
      };
    }

    // If maxed out
    if (!nextMilestone) {
      return {
        label: multiplier > 1 ? `${multiplier}x ${currentMilestone.label}` : currentMilestone.label,
        current: streams,
        target: currentMilestone.threshold * multiplier,
        percent: 100,
        color: currentMilestone.color,
        units,
        multiplier,
        isMaxed: true
      };
    }

    // Calculate progress to next milestone (in streams)
    const currentThreshold = currentMilestone.threshold * multiplier;
    const progress = streams - currentThreshold;
    const range = nextMilestone.threshold - currentThreshold;
    const percent = Math.max(0, Math.min(100, (progress / range) * 100));

    return {
      label: nextMilestone.multiplier > 1 ? `${nextMilestone.multiplier}x ${nextMilestone.label}` : nextMilestone.label,
      current: streams,
      target: nextMilestone.threshold,
      percent,
      color: nextMilestone.color,
      units,
      multiplier: nextMilestone.multiplier || 1,
      isMaxed: false,
      currentCert: multiplier > 1 ? `${multiplier}x ${currentMilestone.label}` : currentMilestone.label
    };
  };

  const ReleaseCard = ({ project }) => {
    const projectType = resolveProjectType(project) || "Project";
    // Use direct release data if available (for albumReleases), otherwise use releaseMap
    const release = project._directRelease || releaseMap.get(project.id);
    const trackSongs = songs.filter((song) => project.tracklist?.includes(song.id));
    const avgQuality = trackSongs.length
      ? Math.round(trackSongs.reduce((sum, song) => sum + (song.quality || 0), 0) / trackSongs.length)
      : 0;
    const streams = release?.lifetime_streams ?? 0;
    const isSingle = projectType.toLowerCase() === "single";
    const milestone = getMilestoneData(streams, isSingle);
    const trendingUp = (streams % 7) > 2;
    const isExpanded = expandedProject === project.id;

    return (
      <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-black/60 to-black/40 border border-white/[0.08] group hover:border-white/[0.15] transition-all">
        <button 
          onClick={() => setExpandedProject(isExpanded ? null : project.id)}
          className="w-full text-left"
        >
        <div className="relative h-40 overflow-hidden">
          <img
            src={getArtworkUrl(project) || release?.cover_artwork_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop"}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm truncate">{project.name}</h3>
              <div className="flex items-center gap-1.5">
                <p className="text-gray-300 text-xs">{projectType}</p>
              </div>
            </div>
            <div className="ml-2 text-right">
              <p className="text-white font-bold text-lg">{avgQuality}</p>
              <p className="text-gray-400 text-[10px]">Quality</p>
            </div>
          </div>
          {trackSongs.length > 0 && (
            <div className="absolute bottom-3 right-3">
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                className="p-2 rounded-lg bg-black/60 backdrop-blur-sm"
              >
                <ChevronDown className="w-4 h-4 text-white" />
              </motion.div>
            </div>
          )}
        </div>
        </button>
        <TrajectoryStrip release={release} />

        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-white text-[11px] font-bold uppercase tracking-wide">
                {milestone.isMaxed 
                  ? `${milestone.label} CERTIFIED` 
                  : milestone.currentCert 
                    ? `${milestone.currentCert} → ${milestone.label}` 
                    : `NEXT: ${milestone.label}`}
              </span>
              <span className="text-gray-400 text-[10px]">{milestone.percent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${milestone.color} rounded-full transition-all`} 
                style={{ width: `${milestone.percent}%` }} 
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">
              {streams >= 1000000 
                ? `${(streams / 1000000).toFixed(2)}M` 
                : streams >= 1000 
                  ? `${(streams / 1000).toFixed(1)}K` 
                  : streams} streams
              {!milestone.isMaxed && ` / ${milestone.units.toLocaleString()} units`}
            </span>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-0.5 ${trendingUp ? "text-green-400" : "text-red-400"}`}>
                {trendingUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>{((streams % 47) + 5)}{trendingUp ? "↑" : "↓"}</span>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                    <MoreVertical className="w-3.5 h-3.5 text-white/60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-[#1a1a24] border-white/10 text-white">
                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleViewAnalytics(project)}>
                      <BarChart3 className="w-3 h-3 mr-2" />
                      View Analytics
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleEditDetails(project)}>
                      <Edit className="w-3 h-3 mr-2" />
                      Edit Details
                    </DropdownMenuItem>
                    {release && (projectType.toLowerCase() === 'album' || projectType.toLowerCase() === 'ep') && (
                      <DropdownMenuItem 
                        className="text-xs cursor-pointer text-purple-400"
                        onClick={() => handleOpenDeluxeModal(release)}
                      >
                        <Sparkles className="w-3 h-3 mr-2" />
                        Create Deluxe Edition
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && trackSongs.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-white/[0.08] overflow-hidden"
            >
              <div className="px-4 py-3 space-y-2">
                <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-2">
                  Tracklist
                </div>
                {trackSongs.map((song, idx) => {
                  const songStreams = Math.floor(streams / trackSongs.length * (0.7 + ((idx * 37 + 13) % 60) / 100));
                  const songMilestone = getMilestoneData(songStreams, true);
                  return (
                    <div key={song.id} className="bg-white/[0.03] rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                          <Music className="w-2.5 h-2.5 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[11px] font-medium truncate">{idx + 1}. {song.title}</p>
                          <p className="text-gray-500 text-[9px]">Quality: {song.quality || 0}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenRemixModal(song);
                              }}
                              className="p-1.5 rounded-md bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 text-purple-300 transition-colors"
                              title="Create remix"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReleaseSingleFromAlbum(song, release);
                              }}
                              className="p-1.5 rounded-md bg-red-600/15 hover:bg-red-600/25 border border-red-500/20 text-red-300 transition-colors"
                              title="Release as single"
                            >
                              <Rocket className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-right">
                            <p className="text-white text-[10px] font-semibold">
                              {songStreams >= 1000000
                                ? `${(songStreams / 1000000).toFixed(2)}M`
                                : songStreams >= 1000
                                  ? `${(songStreams / 1000).toFixed(1)}K`
                                  : songStreams}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${songMilestone.color} rounded-full`}
                          style={{ width: `${songMilestone.percent}%` }}
                        />
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
  };

  const totalSinglesCount = projectSingles.length + singleReleases.length;
  const totalAlbumsCount = albums.length + albumReleases.length;
  const hasContent = releasedProjects.length > 0 || singleReleases.length > 0 || albumReleases.length > 0;

  if (!hasContent && releasedSongs.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs text-gray-500">
        Released projects will appear here once you publish a project.
      </div>
    );
  }

  const StandaloneSingleCard = ({ release }) => {
    const streams = release.lifetime_streams ?? 0;
    const milestone = getMilestoneData(streams, true);
    const trendingUp = (streams % 7) > 2;

    const handleSingleShare = () => {
      const text = `${release.release_name} — ${streams.toLocaleString()} streams`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showToast("Release info copied!", "success");
      }
    };

    const handleSingleRemix = () => {
      const trackId = release.tracklist?.[0];
      const trackSong = songs.find(s => s.id === trackId);
      if (trackSong) handleOpenRemixModal(trackSong);
      else showToast("Track not found for remix", "warning");
    };

    return (
      <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-black/60 to-black/40 border border-white/[0.08] group hover:border-white/[0.15] transition-all">
        <div className="relative h-40 overflow-hidden">
          <img
            src={release.cover_artwork_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop"}
            alt={release.release_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm truncate">{release.release_name}</h3>
              <div className="flex items-center gap-1.5">
                <p className="text-gray-300 text-xs">{release.project_type || "Single"}</p>
              </div>
            </div>
          </div>
        </div>
        <TrajectoryStrip release={release} />
        <div className="px-4 pt-3 pb-1 space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-white text-[11px] font-bold uppercase tracking-wide">
                {milestone.isMaxed
                  ? `${milestone.label} CERTIFIED`
                  : milestone.currentCert
                    ? `${milestone.currentCert} → ${milestone.label}`
                    : `NEXT: ${milestone.label}`}
              </span>
              <span className="text-gray-400 text-[10px]">{milestone.percent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${milestone.color} rounded-full transition-all`}
                style={{ width: `${milestone.percent}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pb-2">
            <div className={`flex items-center gap-1 text-[10px] ${trendingUp ? "text-green-400" : "text-red-400"}`}>
              {trendingUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span className="text-gray-400">
                {streams >= 1000000 ? `${(streams/1000000).toFixed(2)}M` : streams >= 1000 ? `${(streams/1000).toFixed(1)}K` : streams} streams
              </span>
            </div>
            <div onClick={e => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                  <MoreVertical className="w-3.5 h-3.5 text-white/60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a1a24] border-white/10 text-white">
                  <DropdownMenuItem className="text-xs cursor-pointer" onClick={handleSingleShare}>
                    <Share2 className="w-3 h-3 mr-2" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs cursor-pointer text-purple-400" onClick={handleSingleRemix}>
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Create Remix
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-white/[0.1]">
        <button
          onClick={() => setActiveTab("singles")}
          className={`px-3 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "singles" ? "text-white" : "text-gray-500"
          }`}
        >
          Singles {totalSinglesCount > 0 && <span className="text-[10px]">({totalSinglesCount})</span>}
          {activeTab === "singles" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("albums")}
          className={`px-3 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "albums" ? "text-white" : "text-gray-500"
          }`}
        >
          Albums {totalAlbumsCount > 0 && <span className="text-[10px]">({totalAlbumsCount})</span>}
          {activeTab === "albums" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-400" />
          )}
        </button>
      </div>

      <div>
        {activeTab === "singles" && (
          <div className="grid grid-cols-1 gap-3">
            {totalSinglesCount > 0 ? (
              <>
                {singleReleases.map((release) => (
                  <StandaloneSingleCard key={release.id} release={release} />
                ))}
                {projectSingles.map((project) => (
                  <ReleaseCard key={project.id} project={project} />
                ))}
              </>
            ) : (
              <p className="text-center text-gray-500 text-xs py-4">No singles released yet</p>
            )}
          </div>
        )}

        {activeTab === "albums" && (
          <div className="grid grid-cols-1 gap-3">
            {totalAlbumsCount > 0 ? (
              <>
                {albumReleases.map((release) => {
                  // Convert album releases to project format for ReleaseCard
                  const projectAsRelease = {
                    id: release.id,
                    name: release.release_name,
                    type: release.project_type || "Album",
                    project_type: release.project_type || "Album",
                    cover_artwork_url: release.cover_artwork_url,
                    tracklist: release.tracklist || [],
                    // Add stream data directly so ReleaseCard can find it
                    _directRelease: release, // Pass the original release data
                  };
                  return <ReleaseCard key={release.id} project={projectAsRelease} />;
                })}
                {albums.map((project) => <ReleaseCard key={project.id} project={project} />)}
              </>
            ) : (
              <p className="text-center text-gray-500 text-xs py-4">No albums released yet</p>
            )}
          </div>
        )}
      </div>

      {/* Analytics Detail Panel (inline expandable) */}
      <AnimatePresence>
        {analyticsProject && (() => {
          const release = releaseMap.get(analyticsProject.id);
          const trackSongs = songs.filter(s => analyticsProject.tracklist?.includes(s.id));
          const avgQuality = trackSongs.length
            ? Math.round(trackSongs.reduce((sum, s) => sum + (s.quality || 0), 0) / trackSongs.length)
            : 0;
          const streams = release?.lifetime_streams ?? 0;
          const isSingle = resolveProjectType(analyticsProject).toLowerCase() === "single";
          const milestone = getMilestoneData(streams, isSingle);
          return (
            <motion.div
              key="analytics-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-bold text-sm">{analyticsProject.name} — Analytics</h4>
                  <button onClick={() => setAnalyticsProject(null)} className="text-gray-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/[0.04] rounded-lg p-2 text-center">
                    <p className="text-white font-bold text-sm">{streams >= 1e6 ? `${(streams/1e6).toFixed(2)}M` : streams >= 1e3 ? `${(streams/1e3).toFixed(1)}K` : streams}</p>
                    <p className="text-gray-500 text-[9px]">Streams</p>
                  </div>
                  <div className="bg-white/[0.04] rounded-lg p-2 text-center">
                    <p className="text-white font-bold text-sm">{avgQuality}</p>
                    <p className="text-gray-500 text-[9px]">Avg Quality</p>
                  </div>
                  <div className="bg-white/[0.04] rounded-lg p-2 text-center">
                    <p className="text-white font-bold text-sm">{trackSongs.length}</p>
                    <p className="text-gray-500 text-[9px]">Tracks</p>
                  </div>
                </div>
                <div className="bg-white/[0.04] rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-[10px] font-bold uppercase">{milestone.isMaxed ? `${milestone.label} CERTIFIED` : `NEXT: ${milestone.label}`}</span>
                    <span className="text-gray-400 text-[9px]">{milestone.percent.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${milestone.color} rounded-full`} style={{ width: `${milestone.percent}%` }} />
                  </div>
                </div>
                {release && (
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-gray-400">Release Date: <span className="text-white">{release.release_date || 'N/A'}</span></div>
                    <div className="text-gray-400">Status: <span className="text-white">{release.lifecycle_state || 'N/A'}</span></div>
                    <div className="text-gray-400">Region: <span className="text-white">{release.primary_region || 'Global'}</span></div>
                    <div className="text-gray-400">Type: <span className="text-white">{release.project_type || resolveProjectType(analyticsProject)}</span></div>
                  </div>
                )}
                {trackSongs.length > 1 && trackSongs.some(s => (s.lifetime_streams ?? 0) > 0) && (
                  <div className="bg-white/[0.04] rounded-lg p-3 space-y-2">
                    <p className="text-white/50 text-[9px] uppercase tracking-widest font-semibold">Track Streams</p>
                    {trackSongs
                      .slice()
                      .sort((a, b) => (b.lifetime_streams ?? 0) - (a.lifetime_streams ?? 0))
                      .map((song, idx) => {
                        const songStreams = song.lifetime_streams ?? 0;
                        const delta = song.turn_streams_delta ?? 0;
                        const maxStreams = Math.max(...trackSongs.map(s => s.lifetime_streams ?? 0), 1);
                        const pct = Math.round((songStreams / maxStreams) * 100);
                        const fmt = n => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : n;
                        return (
                          <div key={song.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-300 text-[10px] truncate flex-1 mr-2">{song.title || `Track ${idx + 1}`}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {delta > 0 && <span className="text-emerald-400 text-[9px]">+{fmt(delta)}</span>}
                                <span className="text-white text-[10px] font-semibold">{fmt(songStreams)}</span>
                              </div>
                            </div>
                            <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Edit Details Modal */}
      <AnimatePresence>
        {editingProject && (
          <motion.div
            key="edit-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setEditingProject(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-white font-bold text-sm">Edit Release Details</h3>
                <button onClick={() => setEditingProject(null)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-gray-400 text-xs font-semibold mb-1 block">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs font-semibold mb-1 block">Cover Art</label>
                  {/* Preview */}
                  {editCoverPreview && (
                    <div className="mb-2 w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                      <img src={editCoverPreview} alt="cover preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-xs transition-colors mb-1">
                    <Upload className="w-3.5 h-3.5" />
                    {editCoverFile ? editCoverFile.name : "Choose image file…"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverFileChange}
                    />
                  </label>
                  <div className="flex items-center gap-1.5 my-1">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-gray-600 text-[10px]">or paste URL</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <input
                    type="text"
                    value={editCoverUrl}
                    onChange={e => { setEditCoverUrl(e.target.value); setEditCoverFile(null); if (e.target.value) setEditCoverPreview(e.target.value); }}
                    placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex gap-2">
                <button onClick={() => setEditingProject(null)} className="flex-1 py-2 rounded-lg border border-white/10 text-gray-300 text-xs font-medium hover:bg-white/5">Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSaving || !editName.trim()} className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium">
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalog Actions Modal for Remix/Deluxe */}
      <CatalogActionsModal
        isOpen={catalogModalOpen}
        onClose={() => {
          setCatalogModalOpen(false);
          setSelectedSongForRemix(null);
          setSelectedReleaseForDeluxe(null);
          setSelectedTrackForSingle(null);
        }}
        song={selectedSongForRemix}
        release={selectedReleaseForDeluxe}
        trackForSingle={selectedTrackForSingle}
        profile={profile}
        songs={songs}
        releases={releases}
        onActionComplete={handleCatalogActionComplete}
      />
    </div>
  );
}
