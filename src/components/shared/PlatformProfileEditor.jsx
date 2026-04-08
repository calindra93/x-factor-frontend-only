import React, { useState, useEffect, useRef } from "react";
import { Save, X, Camera, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";

export default function PlatformProfileEditor({ 
  profile, 
  platform, 
  onSave,
  accentColor = "violet",
  isOpen = false,
  onClose 
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [editForm, setEditForm] = useState({
    header_image: "",
    profile_image: "",
    bio: ""
  });
  const headerFileRef = useRef(null);
  const profileFileRef = useRef(null);

  useEffect(() => {
    if (isOpen && profile) {
      setEditForm({
        header_image: profile?.[`${platform.toLowerCase()}_header_image`] || "",
        profile_image: profile?.[`${platform.toLowerCase()}_profile_image`] || profile?.artist_image || "",
        bio: profile?.[`${platform.toLowerCase()}_bio`] || profile?.about_text || profile?.bio || ""
      });
    }
  }, [isOpen, profile, platform]);

  const platformColors = {
    streamify: { accent: "violet", ring: "ring-violet-500", btn: "bg-violet-600 hover:bg-violet-500" },
    soundburst: { accent: "emerald", ring: "ring-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-500" },
    applecore: { accent: "rose", ring: "ring-rose-500", btn: "bg-rose-600 hover:bg-rose-500" }
  };
  const colors = platformColors[platform.toLowerCase()] || platformColors.streamify;

  const handleFileUpload = async (file, field) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "error");
      return;
    }
    setUploading(field);
    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket: 'uploads' });
      setEditForm(f => ({ ...f, [field]: result.file_url }));
      showToast("Image uploaded!", "success");
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Failed to upload image", "error");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!profile?.id || saving) return;
    setSaving(true);
    try {
      const updates = {};
      if (editForm.header_image !== (profile?.[`${platform.toLowerCase()}_header_image`] || "")) {
        updates[`${platform.toLowerCase()}_header_image`] = editForm.header_image.trim();
      }
      if (editForm.profile_image !== (profile?.[`${platform.toLowerCase()}_profile_image`] || profile?.artist_image || "")) {
        updates[`${platform.toLowerCase()}_profile_image`] = editForm.profile_image.trim();
      }
      if (editForm.bio !== (profile?.[`${platform.toLowerCase()}_bio`] || profile?.about_text || profile?.bio || "")) {
        updates[`${platform.toLowerCase()}_bio`] = editForm.bio.trim();
      }
      
      // If platform-specific profile image is empty, copy from main artist_image
      if (!updates[`${platform.toLowerCase()}_profile_image`] && !profile?.[`${platform.toLowerCase()}_profile_image`] && profile?.artist_image) {
        updates[`${platform.toLowerCase()}_profile_image`] = profile.artist_image;
      }
      
      if (Object.keys(updates).length > 0) {
        await base44.entities.ArtistProfile.update(profile.id, updates);
        onSave(updates);
        showToast(`${platform} profile updated!`, "success");
      }
      onClose();
    } catch (error) {
      console.error(`[${platform}ProfileEditor] Save error:`, error);
      showToast(`Failed to update: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d14] border border-white/[0.08] rounded-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-white font-bold text-base">Edit {platform} Profile</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Hero Image */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-2">Hero / Header Image</label>
            <div className="relative group rounded-lg overflow-hidden bg-white/[0.04] h-32">
              {editForm.header_image ? (
                <img src={editForm.header_image} alt="Header" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">No header image</div>
              )}
              <button
                onClick={() => headerFileRef.current?.click()}
                disabled={uploading === 'header_image'}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                {uploading === 'header_image' ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
              </button>
              <input ref={headerFileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0], 'header_image')} />
            </div>
          </div>

          {/* Profile Picture */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-2">Profile Picture</label>
            <div className="flex items-center gap-4">
              <div className="relative group w-20 h-20 rounded-full overflow-hidden bg-white/[0.04] flex-shrink-0">
                {editForm.profile_image ? (
                  <img src={editForm.profile_image} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 text-lg font-bold">{profile?.artist_name?.[0] || "?"}</div>
                )}
                <button
                  onClick={() => profileFileRef.current?.click()}
                  disabled={uploading === 'profile_image'}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full"
                >
                  {uploading === 'profile_image' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </button>
                <input ref={profileFileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0], 'profile_image')} />
              </div>
              <p className="text-gray-500 text-[10px]">Tap to change your {platform} profile picture. This only affects your {platform} profile.</p>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-2">Bio</label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm(f => ({ ...f, bio: e.target.value }))}
              placeholder={`Write your custom ${platform} bio...`}
              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/20 resize-none"
              rows={4}
              maxLength={500}
            />
            <p className="text-gray-500 text-[10px] mt-1">{editForm.bio.length}/500 characters</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-white/[0.06] text-white text-sm font-semibold hover:bg-white/[0.1] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className={`flex-1 py-2.5 rounded-lg ${colors.btn} text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
