import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Check, X, ChevronDown, ChevronUp, Loader2, Clock, Music } from "lucide-react";
import { showToast } from "@/components/ui/toast-provider";
import { reportError } from "@/lib/errorReporting";
import { supabaseClient } from "@/lib/supabaseClient";

// UUID validation helper
const isUuid = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export default function PendingCollabs({ profile, songs, onRefresh }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [responding, setResponding] = useState(null);
  const [didAutoExpand, setDidAutoExpand] = useState(false);

  useEffect(() => {
    if (profile?.id) loadCollabs();
  }, [profile?.id]);

  // Auto-expand when there are incoming requests
  useEffect(() => {
    if (!didAutoExpand && incoming.length > 0) {
      setExpanded(true);
      setDidAutoExpand(true);
    }
  }, [incoming.length, didAutoExpand]);

  const loadCollabs = async () => {
    // Validate profile ID is a UUID before querying Supabase
    if (!profile?.id || !isUuid(profile.id)) {
      console.warn('[PendingCollabs] Invalid profile ID, skipping collab load:', profile?.id);
      setIncoming([]);
      setOutgoing([]);
      setLoading(false);
      return;
    }

    try {
      // FK goes to players table, not profiles — so we skip the join and fetch names separately
      const { data: rows, error } = await supabaseClient
        .from("collaboration_requests")
        .select("*")
        .or(`target_artist_id.eq.${profile.id},requester_artist_id.eq.${profile.id}`)
        .in("status", ["pending", "accepted"]);

      if (error) throw error;
      if (!rows || rows.length === 0) {
        setIncoming([]);
        setOutgoing([]);
        setLoading(false);
        return;
      }

      // Collect unique artist IDs and fetch their names from profiles
      const artistIds = [...new Set(rows.flatMap(r => [r.requester_artist_id, r.target_artist_id]))];
      const { data: artistProfiles } = await supabaseClient
        .from("profiles")
        .select("id, artist_name, artist_image, genre")
        .in("id", artistIds);
      const profileMap = {};
      (artistProfiles || []).forEach(p => { profileMap[p.id] = p; });

      // Enrich rows with artist data
      const enriched = rows.map(r => ({
        ...r,
        requester: profileMap[r.requester_artist_id] || null,
        target: profileMap[r.target_artist_id] || null,
      }));

      setIncoming(enriched.filter(r => r.target_artist_id === profile.id && r.status === "pending"));
      setOutgoing(enriched.filter(r => r.requester_artist_id === profile.id));
    } catch (err) {
      console.error("[PendingCollabs] load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (collabId, accept) => {
    setResponding(collabId);
    try {
      const collab = incoming.find(c => c.id === collabId);
      if (!collab) throw new Error("Collaboration request not found");

      if (accept) {
        const { data, error } = await supabaseClient.rpc('accept_collaboration', { p_collab_id: collabId });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error || 'Accept failed');
        showToast("Feature accepted! Song is now ready.", "success");
      } else {
        const { data, error } = await supabaseClient.rpc('decline_collaboration', { p_collab_id: collabId });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.error || 'Decline failed');
        showToast("Feature declined.", "info");
      }

      await loadCollabs();
      onRefresh?.();
    } catch (err) {
      reportError({ scope: "PendingCollabs", message: "Failed to respond to collab", error: err });
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setResponding(null);
    }
  };

  const handleCancel = async (collabId) => {
    setResponding(collabId);
    try {
      // Cancel = decline from requester side
      const collab = outgoing.find(c => c.id === collabId);
      
      const { error } = await supabaseClient
        .from("collaboration_requests")
        .update({ status: "cancelled" })
        .eq("id", collabId);
      if (error) throw error;

      // Restore song to recorded (remove waiting state)
      if (collab?.song_id) {
        await supabaseClient
          .from("songs")
          .update({ status: "recorded" })
          .eq("id", collab.song_id)
          .eq("status", "waiting_on_collab");
      }
      showToast("Feature request cancelled.", "info");
      await loadCollabs();
      onRefresh?.();
    } catch (err) {
      reportError({ scope: "PendingCollabs", message: "Failed to cancel collab", error: err });
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setResponding(null);
    }
  };

  const totalPending = incoming.length + outgoing.filter(o => o.status === "pending").length;
  
  // Always show the component so users know where to look for collaboration requests
  if (loading) {
    return (
      <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          <span className="text-purple-300 text-sm">Loading collaborations...</span>
        </div>
      </div>
    );
  }

  const getSongTitle = (songId) => {
    const song = songs?.find(s => s.id === songId);
    return song?.title || "Unknown Song";
  };

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center">
            <Handshake className="w-3 h-3 text-purple-400" />
          </div>
          <span className="text-white text-sm font-semibold">Feature Requests</span>
          <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-[11px] text-purple-300 font-bold">
            {totalPending}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Empty state */}
              {totalPending === 0 && (
                <div className="text-center py-4">
                  <Handshake className="w-8 h-8 text-purple-400/30 mx-auto mb-2" />
                  <p className="text-purple-300 text-sm font-medium mb-1">No pending requests</p>
                  <p className="text-purple-400/60 text-[11px]">Feature requests will appear here</p>
                </div>
              )}
              
              {/* Incoming requests */}
              {incoming.length > 0 && (
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1.5">Incoming</p>
                  {incoming.map((collab) => (
                    <div key={collab.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[12px] font-medium truncate">
                          {collab.requester?.artist_name || "Unknown"} wants to feature
                        </p>
                        <p className="text-gray-500 text-[10px] flex items-center gap-1">
                          <Music className="w-2.5 h-2.5" />
                          {collab.song_id ? getSongTitle(collab.song_id) : collab.collaboration_type}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRespond(collab.id, true)}
                          disabled={responding === collab.id}
                          className="w-7 h-7 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          {responding === collab.id ? <Loader2 className="w-3 h-3 text-green-400 animate-spin" /> : <Check className="w-3 h-3 text-green-400" />}
                        </button>
                        <button
                          onClick={() => handleRespond(collab.id, false)}
                          disabled={responding === collab.id}
                          className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Outgoing pending */}
              {outgoing.filter(o => o.status === "pending").length > 0 && (
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1.5">Sent</p>
                  {outgoing.filter(o => o.status === "pending").map((collab) => (
                    <div key={collab.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[12px] font-medium truncate">
                          Waiting on {collab.target?.artist_name || "Unknown"}
                        </p>
                        <p className="text-gray-500 text-[10px]">
                          {collab.song_id ? getSongTitle(collab.song_id) : collab.collaboration_type}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCancel(collab.id)}
                        disabled={responding === collab.id}
                        className="text-[10px] text-red-400 hover:text-red-300 font-medium flex-shrink-0 disabled:opacity-50"
                      >
                        {responding === collab.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Cancel"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
