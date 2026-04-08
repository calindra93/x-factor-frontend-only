import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { Folder } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import ReleaseWizard from "./ReleaseWizard";
import ProjectCard from "./ProjectCard";
import ProjectAnalytics from "./ProjectAnalytics";
import RecordingWizard from "./RecordingWizard";
import ProjectEditor from "./ProjectEditor";
// LeadSingleSelector removed: singles only released from already-released albums (ReleasedLibrary)
import CatalogActionsModal from "./CatalogActionsModal";
import { showToast } from "@/components/ui/toast-provider";
import { reportError } from "@/lib/errorReporting";

const getProjectStatus = (songs, tracklist) => {
  if (tracklist.length === 0) return "draft";
  const trackSongs = songs.filter(s => tracklist.includes(s.id));
  const allRecorded = trackSongs.every(s => s.status === "recorded" || s.status === "waiting_on_collab");
  const hasUnrecorded = trackSongs.some(s => s.status === "unrecorded");
  
  if (allRecorded) return "ready_for_release";
  if (hasUnrecorded) return "needs_recording";
  return "draft";
};

export default function ProjectManagement({
  projects,
  songs,
  profile,
  onUpdateProject,
  onRefresh,
  onReleaseProject
}) {
  const [expandedProject, setExpandedProject] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [editName, setEditName] = useState("");
  const [showSongSelector, setShowSongSelector] = useState(null);
  const [editingDetails, setEditingDetails] = useState(null);
  const [detailsForm, setDetailsForm] = useState({ description: "" });
  const [uploading, setUploading] = useState(null);
  const [recording, setRecording] = useState(null);
  const [showStudioSelector, setShowStudioSelector] = useState(null);
  const [remixingSong, setRemixingSong] = useState(null);
  const [recordAllProject, setRecordAllProject] = useState(null);
  const [showReleaseWizard, setShowReleaseWizard] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(null);
  const [showProjectEditor, setShowProjectEditor] = useState(null);

  const handleImageUpload = async (projectId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "warning");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image file must be less than 5MB", "warning");
      return;
    }
    
    try {
      setUploading(projectId);
      
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
      const { error: uploadError } = await supabaseClient.storage
        .from('uploads')
        .upload(filename, file, { contentType: file.type });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabaseClient.storage.from('uploads').getPublicUrl(filename);
      if (!publicUrl) throw new Error("No public URL returned from storage");
      
      await onUpdateProject(projectId, { cover_artwork_url: publicUrl });
      const project = projects.find((item) => item.id === projectId);
      const tracklist = project?.tracklist || [];
      if (tracklist.length > 0) {
        await Promise.all(
          tracklist.map((songId) =>
            base44.entities.Song.update(songId, { cover_artwork_url: publicUrl })
          )
        );
        await onRefresh();
      }
      showToast("Cover art updated successfully!", "success");
    } catch (error) {
      reportError({
        scope: "ProjectManagement",
        message: "Failed to upload image",
        error,
        extra: {
          projectId
        }
      });
      showToast(`Failed to upload image: ${error.message}`, "error");
    } finally {
      setUploading(null);
    }
  };

  const handleSaveName = async (projectId) => {
    if (!editName) return;
    await onUpdateProject(projectId, { name: editName });
    setEditingName(null);
    setEditName("");
  };

  const handleSaveDetails = async (projectId) => {
    await onUpdateProject(projectId, {
      description: detailsForm.description
    });
    setEditingDetails(null);
    setDetailsForm({ description: "" });
  };

  const handleDeleteProject = async (projectId) => {
    if (!projectId) return;
    const shouldDelete = window.confirm("Delete this project? This cannot be undone.");
    if (!shouldDelete) return;
    try {
      await base44.entities.Project.delete(projectId);
      await onRefresh();
    } catch (error) {
      reportError({
        scope: "ProjectManagement",
        message: "Failed to delete project",
        error,
        extra: {
          projectId
        }
      });
      showToast(`Failed to delete project: ${error.message}`, "error");
    }
  };

  const handleUpdateTracklist = async (projectId, newTracklist) => {
    await onUpdateProject(projectId, { tracklist: newTracklist });
  };

  const handleSelectSongs = async (projectId, selectedSongs) => {
    await onUpdateProject(projectId, { tracklist: selectedSongs });
    setShowSongSelector(null);
  };

  const handleRecordSingle = async (song, studioId) => {
    if (!studioId) {
      showToast("No studio selected", "warning");
      return;
    }

    const energyCost = 15;
    const inspirationCost = 10;

    try {
      const [studioResult] = await base44.entities.Studio.filter({ id: studioId });
      const studioData = studioResult;

      if (!studioData) {
        showToast("Studio not found", "error");
        return;
      }

      if (profile.income < studioData.cost_per_song) {
        showToast(`Insufficient funds. Studio costs $${studioData.cost_per_song}`, "warning");
        return;
      }

      if (profile.energy < energyCost || profile.inspiration < inspirationCost) {
        showToast(`Need ${energyCost} energy & ${inspirationCost} inspiration.`, "warning");
        return;
      }

      setRecording(song.id);

      const qualityRange = studioData.quality_ceiling - studioData.quality_floor;
      const consistencyFactor = studioData.consistency_rating / 100;
      const variance = qualityRange * (1 - consistencyFactor);
      const baseQuality = studioData.quality_floor + (qualityRange * consistencyFactor);
      let quality = Math.floor(baseQuality + Math.random() * variance);

      if (studioData.genre_bonuses?.includes(song.genre)) {
        quality = Math.min(100, quality + 10);
      }

      await base44.entities.Song.update(song.id, {
        status: "recorded",
        quality,
        studio_id: studioId
      });

      await base44.entities.ArtistProfile.update(profile.id, {
        energy: profile.energy - energyCost,
        inspiration: profile.inspiration - inspirationCost,
        income: profile.income - studioData.cost_per_song
      });

      showToast("Song recorded successfully!", "success");
      await onRefresh();
    } catch (error) {
      reportError({ scope: "ProjectManagement", message: "Failed to record song", error });
      showToast(`Failed to record: ${error.message}`, "error");
    } finally {
      setRecording(null);
      setShowStudioSelector(null);
    }
  };

  const handleRecordAll = async (project, studioId) => {
    if (!project || !project.tracklist) {
      showToast("Invalid project data", "error");
      return;
    }

    if (!studioId) {
      showToast("No studio selected", "warning");
      return;
    }

    const unrecordedSongs = songs.filter(s => 
      project.tracklist.includes(s.id) && s.status === "unrecorded"
    );
    
    if (unrecordedSongs.length === 0) {
      showToast("No unrecorded songs in this project", "info");
      return;
    }

    // 50% discount for recording as a project vs individual songs
    const energyCost = Math.ceil(unrecordedSongs.length * 15 * 0.5);
    const inspirationCost = Math.ceil(unrecordedSongs.length * 10 * 0.5);

    if (!profile) {
      showToast("No artist profile found", "error");
      return;
    }

    if (profile.energy < energyCost || profile.inspiration < inspirationCost) {
      const individualEnergy = unrecordedSongs.length * 15;
      const individualInspiration = unrecordedSongs.length * 10;
      showToast(`Need ${energyCost} energy & ${inspirationCost} inspiration (50% project discount from ${individualEnergy}/${individualInspiration}). You have ${profile.energy}/${profile.inspiration}.`, "warning");
      return;
    }

    // Fetch studio and check total cost before proceeding
    let studioData;
    try {
      const studioResult = await base44.entities.Studio.filter({ id: studioId });
      const studioList = Array.isArray(studioResult) ? studioResult : [];
      if (studioList.length === 0) {
        showToast("Studio not found", "error");
        return;
      }
      studioData = studioList[0];
      const totalCost = unrecordedSongs.length * studioData.cost_per_song;
      if (profile.income < totalCost) {
        showToast(`Insufficient funds. $${totalCost} needed, you have $${profile.income}.`, "warning");
        return;
      }
    } catch (error) {
      showToast("Error checking studio cost. Try again.", "error");
      return;
    }

    setRecording(project.id);

    try {
      const recordedSongs = songs.filter(s =>
        project.tracklist.includes(s.id) && s.status === "recorded"
      );
      
      let totalCost = 0;

      for (const song of unrecordedSongs) {
        try {
          const qualityRange = studioData.quality_ceiling - studioData.quality_floor;
          const consistencyFactor = studioData.consistency_rating / 100;
          const variance = qualityRange * (1 - consistencyFactor);
          const baseQuality = studioData.quality_floor + (qualityRange * consistencyFactor);
          const randomVariance = Math.random() * variance;
          let finalQuality = Math.floor(baseQuality + randomVariance);
          
          if (studioData.genre_bonuses?.includes(song.genre)) {
            finalQuality = Math.min(100, finalQuality + 10);
          }

          await base44.entities.Song.update(song.id, {
            status: "recorded",
            studio_id: studioId,
            quality: finalQuality
          });

          totalCost += studioData.cost_per_song || 0;
        } catch (error) {
          reportError({
            scope: "ProjectManagement",
            message: `Failed to record song ${song.id}`,
            error
          });
          throw error;
        }
      }

      try {
        await base44.entities.ArtistProfile.update(profile.id, {
          energy: profile.energy - energyCost,
          inspiration: profile.inspiration - inspirationCost,
          income: profile.income - totalCost
        });
      } catch (profileError) {
        reportError({
          scope: "ProjectManagement",
          message: "Failed to update profile resources after record all",
          error: profileError,
          extra: {
            projectId: project.id
          }
        });
        showToast("Songs recorded but resources didn't sync. Refresh to fix.", "warning");
      }

      setRecording(null);
      setShowStudioSelector(null);
      onRefresh();
    } catch (error) {
      reportError({
        scope: "ProjectManagement",
        message: "Failed to record all songs",
        error,
        extra: {
          projectId: project.id
        }
      });
      showToast(`Failed to record songs: ${error.message}`, "error");
      setRecording(null);
    }
  };

  return (
    <div>

      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 w-full">
          {projects.map((project) => (
            <div key={project.id}>
              <ProjectCard
                project={project}
                songs={songs}
                onExpand={(expanded) => setExpandedProject(expanded ? project.id : null)}
                isExpanded={expandedProject === project.id}
                onReleaseSingle={() => onReleaseProject ? onReleaseProject(project) : setShowReleaseWizard(project.id)}
                onLeadSingle={null}
                onShowAnalytics={setShowAnalytics}
                onEdit={() => setShowProjectEditor(project.id)}
                recordingCount={songs.filter(s => project.tracklist?.includes(s.id) && s.status === "unrecorded").length}
                onRecord={(song) => setShowStudioSelector(song)}
                onRecordAll={(proj) => setRecordAllProject(proj)}
                onCollab={(song) => setShowStudioSelector(song)}
                recordingSongId={recording}
                isRecordingAll={recording === project.id}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-6 text-center">
          <Folder className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No projects yet</p>
          <p className="text-gray-600 text-xs mt-1">Create a project to organize your tracks</p>
        </div>
      )}

      <AnimatePresence>
        {showAnalytics && (
          <ProjectAnalytics
            project={projects.find(p => p.id === showAnalytics)}
            songs={songs}
            onClose={() => setShowAnalytics(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReleaseWizard && (
          <ReleaseWizard
            project={projects.find(p => p.id === showReleaseWizard)}
            song={null}
            profile={profile}
            songs={songs}
            onArtworkUpdated={async () => {
              await onRefresh();
            }}
            onClose={() => setShowReleaseWizard(null)}
            onComplete={() => {
              setShowReleaseWizard(null);
              onRefresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStudioSelector && (
          <RecordingWizard
            song={showStudioSelector}
            batchSongs={null}
            profile={profile}
            songs={songs}
            onComplete={() => {
              setShowStudioSelector(null);
              onRefresh();
            }}
            onClose={() => setShowStudioSelector(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recordAllProject && (
          <RecordingWizard
            song={null}
            batchSongs={songs.filter(s => recordAllProject.tracklist?.includes(s.id) && s.status === "unrecorded")}
            profile={profile}
            songs={songs}
            onComplete={() => {
              setRecordAllProject(null);
              onRefresh();
            }}
            onClose={() => setRecordAllProject(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProjectEditor && (
          <ProjectEditor
            project={projects.find(p => p.id === showProjectEditor)}
            songs={songs}
            profile={profile}
            onClose={() => setShowProjectEditor(null)}
            onUpdateProject={onUpdateProject}
            onRefresh={onRefresh}
          />
        )}
      </AnimatePresence>

      {/* LeadSingleSelector removed: singles only released from already-released albums */}

      <CatalogActionsModal
        isOpen={!!remixingSong}
        onClose={() => setRemixingSong(null)}
        song={remixingSong}
        release={null}
        profile={profile}
        songs={songs}
        releases={[]}
        onActionComplete={() => {
          setRemixingSong(null);
          onRefresh();
        }}
      />
    </div>
  );
}