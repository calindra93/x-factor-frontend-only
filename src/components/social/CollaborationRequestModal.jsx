import React, { useState, useEffect } from "react";
import { X, Users, Zap, DollarSign, Music, Check, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { showToast } from "@/components/ui/toast-provider";

export default function CollaborationRequestModal({ profile, onClose }) {
  const [step, setStep] = useState(0);
  const [targetArtist, setTargetArtist] = useState(null);
  const [collabType, setCollabType] = useState(null);
  const [energySplit, setEnergySplit] = useState(50);
  const [revenueSplit, setRevenueSplit] = useState(50);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableArtists, setAvailableArtists] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [lastResult, setLastResult] = useState(null);

  const COLLAB_TYPES = [
    { id: "YouTube Collab", label: "YouTube Collab", desc: "Joint video on VidWave", energyCost: 12, revenueShare: 0.5 },
    { id: "TikTok Duet", label: "TikTok Duet", desc: "Duet on LoopTok", energyCost: 4, revenueShare: 0.5 },
    { id: "Feature", label: "Feature", desc: "Guest verse on their track", energyCost: 8, revenueShare: 0.3 },
    { id: "Remix", label: "Remix", desc: "Remix their song", energyCost: 6, revenueShare: 0.2 },
  ];

  useEffect(() => {
    loadAvailableArtists();
  }, []);

  const [pendingCollabs, setPendingCollabs] = useState([]);

  const loadAvailableArtists = async () => {
    setArtistsLoading(true);
    try {
      // Direct DB reads — no edge function
      const [profilesRes, collabsRes] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select('id, artist_name, artist_image, followers, genre, career_stage')
          .neq('id', profile.id)
          .not('artist_name', 'is', null)
          .order('followers', { ascending: false })
          .limit(20)
          .then(r => r.data || []).catch(() => []),
        supabaseClient
          .from('collaboration_requests')
          .select('id, requester_artist_id, target_artist_id, collaboration_type, status, created_at')
          .or(`requester_artist_id.eq.${profile.id},target_artist_id.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(r => r.data || []).catch(() => []),
      ]);

      setAvailableArtists(profilesRes.map(a => ({
        id: a.id,
        artist_name: a.artist_name || 'Artist',
        artist_image: a.artist_image,
        followers: a.followers || 0,
        genre: a.genre || '',
        career_stage: a.career_stage || 'Underground',
        compatibility: null
      })));
      setPendingCollabs(collabsRes);
    } catch (e) {
      console.error("[Collaboration] Load artists error:", e);
      setAvailableArtists([]);
    } finally {
      setArtistsLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!targetArtist || !collabType || !profile?.id || loading) return;
    setLoading(true);
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'requestCollaboration',
        requesterArtistId: profile.id,
        targetArtistId: targetArtist.id,
        collaborationType: collabType.id,
        energyCostSplit: energySplit / 100,
        revenueSplit: revenueSplit / 100,
        proposedConcept: message || `Hey ${targetArtist.artist_name}, let's collaborate!`
      });

      const rPayload = result.data?.data || result.data || {};
      setLastResult(rPayload);
      setStep(3); // Results step
    } catch (e) {
      console.error("[Collaboration] Send request error:", e);
      showToast(`Failed to send request: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setTargetArtist(null);
    setCollabType(null);
    setEnergySplit(50);
    setRevenueSplit(50);
    setMessage("");
    setLastResult(null);
  };

  const getCompatibilityScore = (artist) => {
    // Simple compatibility calculation based on career stage and genre
    const stageMatch = artist.career_stage === profile.career_stage ? 0.3 : 0.1;
    const followerDiff = Math.abs(Math.log10(artist.followers || 1) - Math.log10(profile.followers || 1));
    const followerScore = Math.max(0, 0.4 - followerDiff * 0.1);
    return Math.min(100, Math.floor((stageMatch + followerScore + 0.3) * 100));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111118] border border-white/10 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-white text-base font-bold">Collaboration</h3>
                <p className="text-gray-500 text-[10px]">Connect with other artists</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-white text-sm font-semibold mb-3">Choose Artist</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {artistsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    </div>
                  ) : availableArtists.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No artists available</p>
                      <p className="text-gray-500 text-[10px]">Other players need to join first</p>
                    </div>
                  ) : availableArtists.map(artist => {
                    const compatibility = getCompatibilityScore(artist);
                    return (
                      <button
                        key={artist.id}
                        onClick={() => setTargetArtist(artist)}
                        className={`w-full text-left border rounded-xl p-3 transition-all ${
                          targetArtist?.id === artist.id
                            ? 'bg-purple-500/10 border-purple-500/30'
                            : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                              <Music className="w-4 h-4 text-purple-400" />
                            </div>
                            <div className="text-left">
                              <p className="text-white text-sm font-semibold">{artist.artist_name}</p>
                              <p className="text-gray-500 text-[10px]">{artist.genre} · {artist.career_stage}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-[10px] font-semibold ${
                              compatibility >= 80 ? 'text-green-400' : 
                              compatibility >= 60 ? 'text-yellow-400' : 'text-gray-400'
                            }`}>
                              {compatibility}% match
                            </div>
                            <p className="text-gray-500 text-[8px]">{artist.followers?.toLocaleString()} fans</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                disabled={!targetArtist}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50"
              >
                Next: Collab Type
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-white text-sm font-semibold mb-3">Collaboration Type</h4>
                <div className="space-y-2">
                  {COLLAB_TYPES.map(type => (
                    <button
                      key={type.id}
                      onClick={() => setCollabType(type)}
                      className={`w-full text-left border rounded-xl p-3 transition-all ${
                        collabType?.id === type.id
                          ? 'bg-purple-500/10 border-purple-500/30'
                          : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-white text-sm font-semibold">{type.label}</p>
                        <span className="text-purple-400 text-[10px]">{type.revenueShare * 100}% rev share</span>
                      </div>
                      <p className="text-gray-500 text-[10px] mb-2">{type.desc}</p>
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-yellow-400" />
                        <span className="text-gray-400 text-[9px]">{type.energyCost} energy</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold">
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!collabType}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50"
                >
                  Next: Terms
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-sm font-semibold">Collaboration Summary</p>
                  <span className="text-purple-400 text-[10px]">{collabType?.energyCost} energy</span>
                </div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Artist</span>
                    <span className="text-white">{targetArtist?.artist_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white">{collabType?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your Energy</span>
                    <span className="text-white">{energySplit}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your Revenue</span>
                    <span className="text-white">{revenueSplit}%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-[10px] font-semibold mb-2 block">Energy Split</label>
                <div className="flex items-center gap-3">
                  <span className="text-white text-sm">You: {energySplit}%</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={energySplit}
                    onChange={(e) => setEnergySplit(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-white text-sm">Them: {100 - energySplit}%</span>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-[10px] font-semibold mb-2 block">Revenue Split</label>
                <div className="flex items-center gap-3">
                  <span className="text-white text-sm">You: {revenueSplit}%</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={revenueSplit}
                    onChange={(e) => setRevenueSplit(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-white text-sm">Them: {100 - revenueSplit}%</span>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-[10px] font-semibold mb-1 block">Message (Optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Hey ${targetArtist?.artist_name}, let's collaborate!`}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-purple-500/30 focus:outline-none resize-none"
                  rows={3}
                  maxLength={200}
                />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold">
                  Back
                </button>
                <button
                  onClick={handleSendRequest}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                  ) : (
                    "Send Request"
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 3 && lastResult && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-white text-sm font-bold">Request Sent!</p>
                  </div>
                  
                  <div className="bg-white/[0.03] rounded-lg p-3 mb-3">
                    <p className="text-gray-300 text-sm mb-1">
                      Your collaboration request has been sent to <span className="text-purple-400 font-semibold">{targetArtist?.artist_name}</span>
                    </p>
                    <p className="text-gray-500 text-[10px]">
                      They'll be notified and can accept or decline your offer
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                      <Zap className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                      <p className="text-white text-[10px] font-bold">{collabType?.energyCost}</p>
                      <p className="text-gray-500 text-[8px]">Energy Cost</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                      <DollarSign className="w-4 h-4 text-green-400 mx-auto mb-1" />
                      <p className="text-white text-[10px] font-bold">{revenueSplit}%</p>
                      <p className="text-gray-500 text-[8px]">Your Share</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-400 text-[10px] font-semibold">Next Steps</span>
                  </div>
                  <p className="text-gray-300 text-[9px]">
                    You'll receive a notification when {targetArtist?.artist_name} responds to your request
                  </p>
                </div>

                <button
                  onClick={() => { resetForm(); onClose(); }}
                  className="w-full py-2.5 rounded-xl bg-white/[0.06] text-gray-300 font-semibold"
                >
                  Close
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}
