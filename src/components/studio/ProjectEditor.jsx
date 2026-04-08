import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Edit2, Upload, GripVertical, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast-provider";
import { reportError } from "@/lib/errorReporting";
import { getArtworkUrl } from "./projectArtwork";

export default function ProjectEditor({ 
  project, 
  songs, 
  profile, 
  onClose, 
  onUpdateProject,
  onRefresh 
}) {
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name || "");
  const [projectDescription, setProjectDescription] = useState(project.description || "");
  const [tracklist, setTracklist] = useState(project.tracklist || []);
  const [coverArtworkUrl, setCoverArtworkUrl] = useState(getArtworkUrl(project));

  // Sync local state when project prop changes
  useEffect(() => {
    setProjectName(project.name || "");
    setProjectDescription(project.description || "");
    setTracklist(project.tracklist || []);
    const nextCoverArtworkUrl = getArtworkUrl(project);
    // Only update cover art if we don't have a newer local version
    if (!coverArtworkUrl || coverArtworkUrl === nextCoverArtworkUrl) {
      setCoverArtworkUrl(nextCoverArtworkUrl);
    }
  }, [project]);

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const availableSongs = songs.filter(song => 
    !tracklist.includes(song.id) && 
    song.release_status !== "released" &&
    song.status !== "released"
  );

  const handleSaveProject = async () => {
    if (!projectName.trim()) {
      showToast("Project name cannot be empty", "warning");
      return;
    }

    setSaving(true);
    try {
      const projectData = {
        name: projectName.trim(),
        description: projectDescription.trim(),
        tracklist,
        cover_artwork_url: coverArtworkUrl
      };
      const saveResult = await onUpdateProject(project.id, projectData);
      
      // Update cover art for all tracks in the project if cover art changed
      if (coverArtworkUrl && coverArtworkUrl !== getArtworkUrl(project) && tracklist.length > 0) {
        await Promise.all(
          tracklist.map((songId) =>
            base44.entities['Song'].update(songId, { cover_artwork_url: coverArtworkUrl })
          )
        );
      }
      
      showToast("Project updated successfully!", "success");
      onClose();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await onRefresh();
    } catch (error) {
      reportError({
        scope: "ProjectEditor",
        message: "Failed to save project",
        error
      });
      showToast(`Failed to save project: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "warning");
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      showToast("Image file must be less than 5MB", "warning");
      return;
    }

    setUploading(true);
    try {
      const uploadResult = await base44.integrations['Core'].UploadFile({ 
        file: file, 
        bucket: 'uploads' 
      });
      const { file_url } = uploadResult;
      if (!file_url) throw new Error("No file URL returned from upload service");
      setCoverArtworkUrl(file_url);
      
      showToast("Cover image uploaded! Click Save to apply changes.", "success");
    } catch (error) {
      console.error("[ProjectEditor] Upload failed:", error);
      reportError({
        scope: "ProjectEditor",
        message: "Failed to upload image",
        error
      });
      showToast(`Failed to upload image: ${error.message}`, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newTracklist = [...tracklist];
    const draggedTrackId = newTracklist[draggedIndex];
    newTracklist.splice(draggedIndex, 1);
    newTracklist.splice(dropIndex, 0, draggedTrackId);
    
    setTracklist(newTracklist);
    setDraggedIndex(null);
  };

  const handleAddTrack = (songId) => {
    if (tracklist.includes(songId)) return;
    setTracklist([...tracklist, songId]);
  };

  const handleRemoveTrack = (songId) => {
    setTracklist(tracklist.filter(id => id !== songId));
  };

  const getSongById = (songId) => songs.find(s => s.id === songId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 pb-[var(--app-bottom-nav-offset)]"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="bg-[#1a1a1f] rounded-2xl border border-white/[0.1] w-full max-w-lg max-h-[75vh] overflow-hidden project-editor-compact"
        style={{ maxWidth: '448px', maxHeight: '75vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.1]">
          <h2 className="text-white text-lg font-bold">Edit Project</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(75vh-120px)]">
          {/* Cover Image */}
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">Cover Art</label>
            <div className="flex items-center gap-3">
              <div className="relative group">
                <img
                  key={coverArtworkUrl || 'fallback'}
                  src={coverArtworkUrl || "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200&h=200&fit=crop"}
                  alt="Project cover"
                  className="w-16 h-16 rounded-lg object-cover border border-white/[0.1]"
                  onLoad={() => console.log("[ProjectEditor] Image loaded successfully:", coverArtworkUrl)}
                  onError={(e) => console.error("[ProjectEditor] Image failed to load:", coverArtworkUrl, e)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  {uploading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
              <div className="flex-1">
                <p className="text-gray-400 text-xs mb-1">
                  Upload a new cover image for this project
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {uploading ? "Uploading..." : "Choose Image"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Project Name */}
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">Project Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Enter project name"
                  autoFocus
                />
                <Button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-white text-sm">{projectName}</span>
                <Button
                  onClick={() => setEditingName(true)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-white text-sm font-medium mb-3">Description</label>
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
              placeholder="Add a description for this project..."
              rows={3}
            />
          </div>

          {/* Tracklist */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-white text-sm font-medium">Tracklist</label>
              <span className="text-gray-400 text-xs">{tracklist.length} tracks</span>
            </div>

            {/* Current Tracks */}
            {tracklist.length > 0 && (
              <div className="mb-4 space-y-2">
                {tracklist.map((songId, index) => {
                  const song = getSongById(songId);
                  if (!song) return null;

                  return (
                    <div
                      key={songId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`flex items-center gap-3 p-3 bg-white/[0.05] border border-white/[0.1] rounded-lg cursor-move transition-all ${
                        draggedIndex === index ? 'opacity-50' : 'hover:bg-white/[0.08]'
                      }`}
                    >
                      <GripVertical className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-400 text-xs w-4">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{song.title}</p>
                        <p className="text-gray-500 text-xs">
                          {song.status === "recorded" ? "Recorded" : "Unrecorded"} • Q: {song.quality || 0}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveTrack(songId)}
                        className="p-1.5 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available Songs */}
            {availableSongs.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs mb-2">Available tracks to add:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {availableSongs.map(song => (
                    <div
                      key={song.id}
                      className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.08] rounded-lg"
                    >
                      <span className="text-gray-500 text-xs">
                        {song.status === "recorded" ? "R" : "U"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-sm truncate">{song.title}</p>
                        <p className="text-gray-600 text-xs">Q: {song.quality || 0}</p>
                      </div>
                      <button
                        onClick={() => handleAddTrack(song.id)}
                        className="p-1.5 hover:bg-green-600/20 text-green-400 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tracklist.length === 0 && availableSongs.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                No available tracks. Create some songs first!
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/[0.1]">
          <Button
            onClick={onClose}
            variant="outline"
            className="px-4 py-1.5 border border-white/[0.2] text-white hover:bg-white/10 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveProject}
            disabled={saving || !projectName.trim()}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm"
          >
            {saving ? "Saving..." : "Save Project"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
