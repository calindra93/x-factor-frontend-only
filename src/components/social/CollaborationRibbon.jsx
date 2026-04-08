import React, { useState, useEffect } from "react";
import { Users, Handshake, X, Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { showToast } from "@/components/ui/toast-provider";

export default function CollaborationRibbon({ profile, compact = false }) {
  const [collaborations, setCollaborations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInbox, setShowInbox] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadCollaborations();
  }, [profile]);

  const loadCollaborations = async () => {
    if (!profile?.id) {
      setCollaborations([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Direct DB read — no edge function
      const { data: collabs, error } = await supabaseClient
        .from('collaboration_requests')
        .select('id, requester_artist_id, target_artist_id, collaboration_type, status, energy_cost_split, revenue_split, proposed_concept, song_id, created_at, updated_at')
        .or(`requester_artist_id.eq.${profile.id},target_artist_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      const rows = collabs || [];

      // Batch-load artist names for display
      const artistIds = [...new Set([...rows.map(c => c.requester_artist_id), ...rows.map(c => c.target_artist_id)].filter(Boolean))];
      const { data: profiles } = artistIds.length > 0
        ? await supabaseClient.from('profiles').select('id, artist_name, artist_image').in('id', artistIds)
        : { data: [] };
      const pMap = new Map((profiles || []).map(p => [p.id, p]));

      const enriched = rows.map(c => ({
        ...c,
        requester_name: pMap.get(c.requester_artist_id)?.artist_name || 'Artist',
        requester_image: pMap.get(c.requester_artist_id)?.artist_image || null,
        target_name: pMap.get(c.target_artist_id)?.artist_name || 'Artist',
        target_image: pMap.get(c.target_artist_id)?.artist_image || null,
      }));

      setCollaborations(enriched);
      const unread = enriched.filter(c => c.target_artist_id === profile.id && c.status === 'pending').length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("[CollaborationRibbon] Failed to load collaborations:", error);
      setCollaborations([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const closeInbox = () => setShowInbox(false);

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-purple-300 text-xs font-semibold">
              Collaborations
            </span>
            {unreadCount > 0 && (
              <span className="bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowInbox(true)}
            className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-purple-300" />
          </button>
        </div>

        <AnimatePresence>
          {showInbox && (
            <CollaborationInboxModal 
              profile={profile} 
              onClose={closeInbox}
              collaborations={collaborations}
              onRefresh={loadCollaborations}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Handshake className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-purple-300 text-sm font-bold">Collaborations</h3>
            <p className="text-purple-400 text-xs">
              {unreadCount > 0 ? `${unreadCount} pending requests` : 'No pending requests'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowInbox(true)}
          className="p-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 transition-colors relative"
        >
          <Bell className="w-4 h-4 text-purple-300" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">{unreadCount}</span>
            </div>
          )}
        </button>
      </div>

      <AnimatePresence>
        {showInbox && (
          <CollaborationInboxModal 
            profile={profile} 
            onClose={closeInbox}
            collaborations={collaborations}
            onRefresh={loadCollaborations}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CollaborationInboxModal({ profile, onClose, collaborations, onRefresh }) {
  const [actionLoading, setActionLoading] = useState(null);

  const handleAccept = async (collabId) => {
    setActionLoading(collabId);
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'acceptCollaboration',
        collaborationId: collabId
      });
      showToast("Collaboration accepted!", "success");
      onRefresh();
    } catch (error) {
      console.error("[CollaborationInbox] Failed to accept collaboration:", error);
      showToast("Failed to accept collaboration", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (collabId) => {
    setActionLoading(collabId);
    try {
      await base44.functions.invoke('socialMedia', {
        action: 'declineCollaboration',
        collaborationId: collabId
      });
      showToast("Collaboration declined", "success");
      onRefresh();
    } catch (error) {
      console.error("[CollaborationInbox] Failed to decline collaboration:", error);
      showToast("Failed to decline collaboration", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const incomingCollabs = collaborations.filter(c => c.target_artist_id === profile.id);
  const outgoingCollabs = collaborations.filter(c => c.requester_artist_id === profile.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#1a1a2e] rounded-2xl border border-purple-500/20 max-w-md w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-purple-500/20">
          <div className="flex items-center justify-between">
            <h2 className="text-purple-300 text-lg font-bold">Collaboration Requests</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-purple-500/20 transition-colors"
            >
              <X className="w-4 h-4 text-purple-300" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {incomingCollabs.length === 0 && outgoingCollabs.length === 0 ? (
            <div className="text-center py-8">
              <Handshake className="w-12 h-12 text-purple-400/30 mx-auto mb-3" />
              <p className="text-purple-300 text-sm">No collaboration requests</p>
            </div>
          ) : (
            <>
              {incomingCollabs.length > 0 && (
                <div>
                  <h3 className="text-purple-300 text-sm font-semibold mb-2">Incoming Requests</h3>
                  <div className="space-y-2">
                    {incomingCollabs.map((collab) => (
                      <div key={collab.id} className="bg-purple-500/10 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-purple-300 text-sm font-semibold">
                            {collab.requester_artist_name}
                          </span>
                          <span className="text-purple-400 text-xs">
                            {collab.status}
                          </span>
                        </div>
                        <p className="text-purple-200 text-xs mb-3">{collab.message}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(collab.id)}
                            disabled={actionLoading === collab.id || collab.status !== 'pending'}
                            className="flex-1 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {actionLoading === collab.id ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => handleDecline(collab.id)}
                            disabled={actionLoading === collab.id || collab.status !== 'pending'}
                            className="flex-1 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {outgoingCollabs.length > 0 && (
                <div>
                  <h3 className="text-purple-300 text-sm font-semibold mb-2">Outgoing Requests</h3>
                  <div className="space-y-2">
                    {outgoingCollabs.map((collab) => (
                      <div key={collab.id} className="bg-purple-500/10 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-purple-300 text-sm font-semibold">
                            To: {collab.target_artist_name}
                          </span>
                          <span className="text-purple-400 text-xs capitalize">
                            {collab.status}
                          </span>
                        </div>
                        <p className="text-purple-200 text-xs">{collab.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
