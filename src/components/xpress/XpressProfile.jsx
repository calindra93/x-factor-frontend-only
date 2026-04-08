import React, { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, MoreVertical, Pencil, Calendar, Link as LinkIcon, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import {
  ProfileAvatar, TopNavigationBar, SocialPostCard, XpressTabBar, fmtNum
} from "./XpressShared";

const PROFILE_TABS = [
  { id: "posts", label: "Posts" },
  { id: "replies", label: "Replies" },
  { id: "highlights", label: "Highlights" },
  { id: "media", label: "Media" },
];

export default function XpressProfile({
  profile, account: _account, allPosts, profileMap, myLikes, myReposts, myFollowing, setMyFollowing,
  currentPlayerId, onProfileClick, onViewCampaign, onDeletePost,
  onBack, onCompose,
  targetProfileId, isOwnProfile, releases: _releases, currentEra: _currentEra, refreshProfile,
}) {
  const [profileTab, setProfileTab] = useState("posts");
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [targetProfile, setTargetProfile] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    const tp = profileMap[targetProfileId] || profile;
    setTargetProfile(tp);
    setIsFollowing(myFollowing.has(targetProfileId));
    loadFollowCounts();
  }, [targetProfileId, profileMap, myFollowing]);

  const loadFollowCounts = async () => {
    if (!targetProfileId) return;
    try {
      // Fetch "following" count (real records) and "followers" from social_account (source of truth)
      const [{ count: fng }, { data: socialAcc }] = await Promise.all([
        supabaseClient.from("xpress_follows").select("id", { count: "exact", head: true }).eq("follower_id", targetProfileId),
        supabaseClient.from("social_accounts").select("followers").eq("artist_id", targetProfileId).eq("platform", "xpress").maybeSingle()
      ]);

      setFollowingCount(fng || 0);

      if (socialAcc) {
        setFollowerCount(socialAcc.followers || 0);
      } else {
        // Fallback: count real followers if no social account exists
        const { count: frs } = await supabaseClient.from("xpress_follows").select("id", { count: "exact", head: true }).eq("following_id", targetProfileId);
        setFollowerCount(frs || 0);
      }
    } catch (e) { console.warn("[XpressProfile] Follow count error:", e?.message); }
  };

  const handleFollow = async () => {
    if (!currentPlayerId || !targetProfileId || isOwnProfile || currentPlayerId === targetProfileId) return;
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'xpressFollow',
        followerId: currentPlayerId,
        targetId: targetProfileId,
        unfollow: isFollowing,
      });
      if (isFollowing) {
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
        setMyFollowing(prev => { const n = new Set(prev); n.delete(targetProfileId); return n; });
      } else {
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        setMyFollowing(prev => new Set([...prev, targetProfileId]));
      }
    } catch (e) { console.warn("[XpressProfile] Follow error:", e?.message); }
  };

  const userPosts = useMemo(() => {
    return (allPosts || []).filter(p => p.artist_id === targetProfileId)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [allPosts, targetProfileId]);

  const filteredPosts = useMemo(() => {
    if (profileTab === "posts") return userPosts;
    if (profileTab === "media") return userPosts.filter(p => p.thumbnail_url);
    if (profileTab === "highlights") return userPosts.filter(p => (p.likes || 0) > 100 || p.is_viral || p.is_promoted);
    return []; // replies — future feature
  }, [userPosts, profileTab]);

  const tp = targetProfile || profile;
  const handle = tp?.xpress_handle ? `@${tp.xpress_handle}` : `@${(tp?.artist_name || "").replace(/\s+/g, "")}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <TopNavigationBar
        leftIcon={<ArrowLeft className="w-5 h-5 text-gray-400" />}
        onLeftClick={onBack}
        title={tp?.artist_name || "Profile"}
        rightIcon={isOwnProfile ? null : <MoreVertical className="w-5 h-5 text-gray-400" />}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Banner */}
        <div className="relative h-32 bg-gradient-to-br from-red-900/30 via-gray-900 to-black overflow-hidden">
          {tp?.xpress_banner_url ? (
            <img src={tp.xpress_banner_url} alt="" className="w-full h-full object-cover" />
          ) : tp?.about_image ? (
            <img src={tp.about_image} alt="" className="w-full h-full object-cover opacity-60" />
          ) : null}
        </div>

        {/* Avatar + Edit/Follow */}
        <div className="px-4 -mt-10 flex items-end justify-between">
          <ProfileAvatar
            src={tp?.artist_image}
            alt={tp?.artist_name}
            size="xl"
          />
          <div className="flex gap-2 mb-1">
            {isOwnProfile ? (
              <button
                onClick={() => setShowEditProfile(true)}
                className="px-4 py-1.5 rounded-full border border-white/20 text-white text-[12px] font-semibold hover:bg-white/5 transition-colors translate-y-1"
              >
                Edit Profile
              </button>
            ) : (
              <button
                onClick={handleFollow}
                className={`px-5 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                  isFollowing
                    ? "bg-white/10 border border-white/20 text-white hover:border-red-500 hover:text-red-400"
                    : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Profile Info */}
        <div className="px-4 mt-3 space-y-1.5">
          <div>
            <h2 className="text-white text-lg font-bold">{tp?.artist_name || "Artist"}</h2>
            <p className="text-gray-500 text-[13px]">{handle}</p>
          </div>

          {(tp?.xpress_bio || tp?.bio) && (
            <p className="text-white text-[13px] leading-[1.4]">{tp?.xpress_bio || tp?.bio}</p>
          )}

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-gray-500 text-[12px]">
            {tp?.label && (
              <span className="flex items-center gap-1">
                <span>🏷️</span> {tp.label}
              </span>
            )}
            {tp?.xpress_website && (
              <span className="flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                <span className="text-red-400">{tp.xpress_website}</span>
              </span>
            )}
            {tp?.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Joined {new Date(tp.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            )}
          </div>

          <div className="flex gap-4 text-[13px]">
            <span><strong className="text-white">{fmtNum(followingCount)}</strong> <span className="text-gray-500">Following</span></span>
            <span><strong className="text-white">{fmtNum(followerCount)}</strong> <span className="text-gray-500">Followers</span></span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3">
          <XpressTabBar tabs={PROFILE_TABS} activeTab={profileTab} onTabChange={setProfileTab} />
        </div>

        {/* Posts */}
        <div>
          {filteredPosts.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-500 text-sm">
                {profileTab === "posts" ? "No posts yet" : `No ${profileTab}`}
              </p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <SocialPostCard
                key={post.id}
                post={post}
                authorProfile={profileMap[post.artist_id] || tp}
                currentPlayerId={currentPlayerId}
                onProfileClick={onProfileClick}
                onViewCampaign={onViewCampaign}
                onDeletePost={onDeletePost}
                myLikes={myLikes}
                myReposts={myReposts}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      {isOwnProfile && (
        <button
          onClick={onCompose}
          className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-red-600 shadow-lg shadow-red-600/30 flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95 z-10"
        >
          <Pencil className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditProfile && (
          <EditProfileModal
            profile={tp}
            onClose={() => setShowEditProfile(false)}
            onSaved={async () => {
              await refreshProfile?.();
              setShowEditProfile(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EDIT PROFILE MODAL
   ═══════════════════════════════════════════════════════ */
function EditProfileModal({ profile, onClose, onSaved }) {
  const [name, setName] = useState(profile?.artist_name || "");
  const [bio, setBio] = useState(profile?.xpress_bio || profile?.bio || "");
  const [website, setWebsite] = useState(profile?.xpress_website || "");
  const [location, setLocation] = useState(profile?.region || "");
  const [saving, setSaving] = useState(false);

  // Image upload state
  const [avatarPreview, setAvatarPreview] = useState(profile?.artist_image || null);
  const [bannerPreview, setBannerPreview] = useState(profile?.xpress_banner_url || profile?.about_image || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const handleFileSelect = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate size (5MB max per bucket config)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (type === "avatar") {
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
    } else {
      setBannerFile(file);
      setBannerPreview(previewUrl);
    }
  };

  const uploadImage = async (file, folder) => {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${folder}/${profile.id}-${Date.now()}.${ext}`;
    const { data, error } = await supabaseClient.storage
      .from("uploads")
      .upload(fileName, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabaseClient.storage.from("uploads").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!profile?.id || saving) return;
    setSaving(true);
    try {
      const updates = {
        artist_name: name.trim() || profile.artist_name,
        xpress_bio: bio,
        xpress_website: website,
        region: location || profile.region,
      };

      // Upload avatar if changed
      if (avatarFile) {
        setUploadProgress("Uploading profile picture...");
        const avatarUrl = await uploadImage(avatarFile, "avatars");
        updates.artist_image = avatarUrl;
      }

      // Upload banner if changed
      if (bannerFile) {
        setUploadProgress("Uploading banner...");
        const bannerUrl = await uploadImage(bannerFile, "banners");
        updates.xpress_banner_url = bannerUrl;
      }

      setUploadProgress("Saving...");
      const { error: saveErr } = await supabaseClient.from("profiles").update(updates).eq("id", profile.id);
      if (saveErr) {
        console.error("[Xpress] Edit profile save error:", saveErr);
        setUploadProgress("Error saving — please try again");
        setSaving(false);
        return;
      }
      if (onSaved) await onSaved();
      else onClose();
    } catch (e) { console.error("[Xpress] Edit profile error:", e); setUploadProgress(""); }
    finally { setSaving(false); setUploadProgress(""); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[60] flex flex-col"
    >
      {/* Hidden file inputs */}
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => handleFileSelect(e, "avatar")} />
      <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => handleFileSelect(e, "banner")} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <button onClick={onClose} className="text-white text-[14px] font-medium">Cancel</button>
        <h2 className="text-white text-base font-bold">Edit Profile</h2>
        <button onClick={handleSave} disabled={saving} className="text-red-400 text-[14px] font-bold disabled:opacity-50">
          {saving ? "..." : "Save"}
        </button>
      </div>

      {/* Upload progress */}
      {uploadProgress && (
        <div className="px-4 py-2 bg-red-600/10 border-b border-red-500/20 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <span className="text-red-400 text-[12px] font-medium">{uploadProgress}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Banner */}
        <div className="relative h-28 bg-gradient-to-br from-red-900/30 via-gray-900 to-black overflow-hidden">
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="w-full h-full object-cover opacity-60" />
          ) : null}
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 border border-white/20">
              <Camera className="w-4 h-4 text-white" />
              <span className="text-white text-[11px] font-medium">{bannerPreview ? "Change Banner" : "Add Banner"}</span>
            </div>
          </button>
        </div>

        {/* Avatar overlay — clickable to upload */}
        <div className="px-4 -mt-10 mb-4">
          <button onClick={() => avatarInputRef.current?.click()} className="relative group">
            <ProfileAvatar src={avatarPreview} alt={name} size="xl" />
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </button>
        </div>

        {/* Form fields */}
        <div className="px-4 space-y-4">
          <div>
            <label className="text-gray-500 text-[11px] font-medium block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full bg-transparent border-b border-white/10 text-white text-[15px] py-2 outline-none placeholder-gray-600"
              placeholder="Display name"
            />
            <p className="text-gray-600 text-[10px] mt-0.5">This is your public display name on Xpress.</p>
          </div>
          <div>
            <label className="text-gray-500 text-[11px] font-medium block mb-1">Username</label>
            <div className="flex items-center justify-between border-b border-white/10 py-2">
              <span className="text-red-400 text-[15px]">{profile?.xpress_handle || (profile?.artist_name || "").replace(/\s+/g, "")}</span>
              <span className="text-gray-600 text-[10px]">🌐</span>
            </div>
            <p className="text-gray-600 text-[10px] mt-1">Username cannot be changed after account creation.</p>
          </div>
          <div>
            <label className="text-gray-500 text-[11px] font-medium block mb-1">Bio</label>
            <textarea
              value={bio} onChange={(e) => setBio(e.target.value)}
              rows={2} maxLength={160}
              className="w-full bg-transparent border-b border-white/10 text-white text-[15px] py-2 outline-none resize-none placeholder-gray-600"
              placeholder="Tell the world about yourself"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[11px] font-medium block mb-1">Location</label>
            <input
              value={location} onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-transparent border-b border-white/10 text-white text-[15px] py-2 outline-none placeholder-gray-600"
              placeholder="Where are you based?"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[11px] font-medium block mb-1">Website</label>
            <input
              value={website} onChange={(e) => setWebsite(e.target.value)}
              className="w-full bg-transparent border-b border-white/10 text-red-400 text-[15px] py-2 outline-none placeholder-gray-600"
              placeholder="yoursite.com"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
