import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { User, MapPin, Music, Edit3, Save, X, RefreshCw, Handshake, Bus, Sparkles, ExternalLink } from "lucide-react";
import ImageUpload from "@/components/ui/ImageUpload";
import { showToast } from "@/components/ui/toast-provider";
import SampleAchievementsBadge from "@/components/studio/SampleAchievementsBadge";
import { supabaseClient } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/components/utils";

const LOAD_TIMEOUT_MS = 8000;

const buildFallbackProfile = () => ({
  id: "fallback-profile",
  artist_name: "Demo Artist",
  bio: "",
  artist_image: "",
  genre: "Pop",
  region: "United States",
  followers: 110,
  clout: 5,
  income: 700,
  label: "Independent",
});

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ artist_name: '', bio: '', artist_image: '' });
  const activeRef = useRef(true);
  // Approach C: Pending follow-through items
  const [pendingCollabs, setPendingCollabs] = useState([]);
  const [pendingTourInvites, setPendingTourInvites] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    activeRef.current = true;
    loadProfile();
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) setLoadError('Loading took too long. Tap retry.');
        return false;
      });
    }, LOAD_TIMEOUT_MS);
    return () => { activeRef.current = false; clearTimeout(timeout); };
  }, []);

  // Approach C: Fetch pending follow-through items when profile loads
  useEffect(() => {
    if (!profile?.id || profile.id === 'fallback-profile') return;
    const fetchPendingItems = async () => {
      try {
        // Pending collaboration requests (inbound, awaiting response)
        const { data: collabs } = await supabaseClient
          .from('collaboration_requests')
          .select('id, collaboration_type, status, created_at')
          .eq('target_artist_id', profile.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5);
        setPendingCollabs(collabs || []);

        // Pending tour support invites from festival backstage deals
        const { data: tourInvites } = await supabaseClient
          .from('tour_support_invites')
          .select('id, headliner_id, status, created_at')
          .eq('opener_id', profile.id)
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
          .limit(5);
        setPendingTourInvites(tourInvites || []);
      } catch (err) {
        console.error('[Profile] Failed to fetch pending items:', err);
        // Non-fatal - don't show error UI
      }
    };
    fetchPendingItems();
  }, [profile?.id]);

  const continueWithFallback = () => {
    const fallback = buildFallbackProfile();
    setProfile(fallback);
    setEditForm({
      artist_name: fallback.artist_name || '',
      bio: fallback.bio || '',
      artist_image: fallback.artist_image || '',
    });
    setLoadError(null);
    setLoading(false);
  };

  const loadProfile = async () => {
    try {
      setLoadError(null);
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) {
        if (activeRef.current) setLoading(false);
        return;
      }

      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      const p = profiles[0] || null;
      if (!p && localStorage.getItem("dev_demo_mode") === "1") {
        if (activeRef.current) continueWithFallback();
        return;
      }
      if (activeRef.current) {
        setProfile(p);
        if (p) setEditForm({ artist_name: p.artist_name || '', bio: p.bio || '', artist_image: p.artist_image || '' });
      }
    } catch (error) {
      console.error("[Profile] Load error:", error);
      if (activeRef.current) {
        if (localStorage.getItem("dev_demo_mode") === "1") {
          continueWithFallback();
          return;
        }
        setLoadError("Unable to sync profile data right now.");
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.id || saving) return;
    setSaving(true);
    try {
      const updates = {
        artist_name: editForm.artist_name.trim() || profile.artist_name,
        bio: editForm.bio.trim(),
        artist_image: editForm.artist_image.trim(),
      };
      await base44.entities.ArtistProfile.update(profile.id, updates);
      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      setEditing(false);
      window.dispatchEvent(new CustomEvent('profileUpdated', { detail: updatedProfile }));
    } catch (error) {
      console.error("[Profile] Save error:", error);
      showToast('Failed to save: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{loadError}</p>
          <button onClick={() => { setLoading(true); setLoadError(null); loadProfile(); }}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <button onClick={continueWithFallback}
            className="px-5 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2 ml-2">
            Continue demo
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-full bg-[#0a0a0f] pb-4 max-w-md mx-auto flex items-center justify-center">
        <p className="text-gray-400">No profile found</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-4 max-w-md mx-auto">
      <div className="px-4">
        <div className="flex items-center gap-3 mb-8 pt-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <User className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Profile</h1>
            <p className="text-gray-500 text-xs">Your artist details</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Artist Image & Name */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center text-center relative">
            <button
              onClick={() => { setEditing(!editing); if (!editing) setEditForm({ artist_name: profile.artist_name || '', bio: profile.bio || '', artist_image: profile.artist_image || '' }); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              {editing ? <X className="w-4 h-4 text-gray-400" /> : <Edit3 className="w-4 h-4 text-gray-400" />}
            </button>

            {profile.artist_image ? (
              <img src={profile.artist_image} alt={profile.artist_name} className="w-24 h-24 rounded-full mb-4 object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <User className="w-10 h-10 text-gray-600" />
              </div>
            )}

            {editing ? (
              <div className="w-full space-y-3 mt-2">
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-wider block mb-1 text-left">Artist Name</label>
                  <input value={editForm.artist_name} onChange={e => setEditForm(f => ({ ...f, artist_name: e.target.value }))}
                    className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-red-500/40" />
                </div>
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-wider block mb-1 text-left">Bio</label>
                  <textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={2}
                    className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-red-500/40 resize-none" />
                </div>
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-wider block mb-1 text-left">Profile Image</label>
                  <ImageUpload
                    value={editForm.artist_image}
                    onChange={(url) => setEditForm(f => ({ ...f, artist_image: url }))}
                    placeholder="Upload profile picture or enter image URL"
                    maxSizeMB={2}
                  />
                </div>
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-white text-2xl font-bold">{profile.artist_name}</h2>
                {profile.bio && <p className="text-gray-400 text-sm mt-1">{profile.bio}</p>}
                {!profile.bio && <p className="text-gray-500 text-sm mt-1">Artist Profile</p>}
              </>
            )}
          </div>

          {/* Genre & Region */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-4 h-4 text-red-400" />
                <p className="text-gray-400 text-xs">Genre</p>
              </div>
              <p className="text-white font-medium">{profile.genre}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-red-400" />
                <p className="text-gray-400 text-xs">Region</p>
              </div>
              <p className="text-white font-medium">{profile.region || 'Unknown'}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2">Fans</p>
              <p className="text-white text-xl font-bold">{(profile.followers || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2">Clout</p>
              <p className="text-white text-xl font-bold">{(profile.clout || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2">Income</p>
              <p className="text-white text-xl font-bold">${(profile.income || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-2">Label</p>
              <p className="text-white text-xl font-bold">{profile.label || "Independent"}</p>
            </div>
          </div>

          {/* Approach C: Pending Follow-Through Mini Panel */}
          {(pendingCollabs.length > 0 || pendingTourInvites.length > 0) && (
            <div className="bg-gradient-to-br from-violet-500/10 to-pink-500/5 border border-violet-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <p className="text-white text-sm font-semibold">Needs Your Attention</p>
              </div>
              <div className="space-y-2">
                {pendingCollabs.length > 0 && (
                  <button
                    onClick={() => {
                      navigate(createPageUrl('Social'));
                      window.setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('openCollaborationInbox'));
                      }, 150);
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <Handshake className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white text-sm font-medium">{pendingCollabs.length} Collab Request{pendingCollabs.length !== 1 ? 's' : ''}</p>
                      <p className="text-gray-500 text-xs">Awaiting your response</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                {pendingTourInvites.length > 0 && (
                  <button
                    onClick={() => navigate(createPageUrl('TouringAppV2'))}
                    className="w-full flex items-center gap-3 p-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Bus className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white text-sm font-medium">{pendingTourInvites.length} Tour Invite{pendingTourInvites.length !== 1 ? 's' : ''}</p>
                      <p className="text-gray-500 text-xs">Support slots available</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Achievements */}
          {profile.id && profile.id !== "fallback-profile" && (
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">Achievements</p>
              <SampleAchievementsBadge artistId={profile.id} compact={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}