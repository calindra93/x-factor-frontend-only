import React, { useState, useEffect } from "react";
import { X, Users, Check, X as XIcon, Clock, AlertCircle, Zap, Music, TrendingUp, Handshake, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { invokeFestivalAction } from "@/lib/invokeFestivalAction";
import { showToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";

const EVENT_INVITATION_TYPE = 'event_invitation';

const normalizeInviteStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'redeemed') return 'active';
  if (normalized === 'offered') return 'pending';
  return normalized || 'pending';
};

const getStatusColor = (status) => {
  switch (status) {
    case 'pending': return 'text-yellow-400';
    case 'accepted':
    case 'active': return 'text-green-400';
    case 'declined': return 'text-red-400';
    case 'read': return 'text-gray-400';
    default: return 'text-gray-400';
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'pending': return Clock;
    case 'accepted':
    case 'active':
    case 'read': return Check;
    case 'declined': return XIcon;
    default: return AlertCircle;
  }
};

const getCollabTypeIcon = (type = '') => {
  if (type.includes('YouTube') || type.includes('VidWave')) return Music;
  if (type.includes('TikTok') || type.includes('LoopTok')) return TrendingUp;
  return Users;
};

const getInboxItemIcon = (item) => {
  if (item.itemType === 'collaboration') return getCollabTypeIcon(item.collaboration_type);
  if (item.itemType === 'tour_invite') return Handshake;
  if (item.itemType === EVENT_INVITATION_TYPE) return Music;
  return Users;
};

export default function CollaborationInbox({ profile, onClose }) {
  const [inboxItems, setInboxItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('incoming'); // 'incoming' | 'outgoing' | 'all'

  useEffect(() => {
    if (!profile?.id) return;
    loadCollaborations();
  }, [profile?.id]);

  const markNotificationRead = async (notificationId) => {
    if (!notificationId) return;
    const { error } = await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  };

  const loadCollaborations = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const [collabsResult, tourInvitesResult, eventInvitesResult] = await Promise.all([
        supabaseClient
          .from('collaboration_requests')
          .select('id, requester_artist_id, target_artist_id, collaboration_type, status, energy_cost_split, revenue_split, proposed_concept, song_id, requester_energy_cost, target_energy_cost, created_at, updated_at')
          .or(`requester_artist_id.eq.${profile.id},target_artist_id.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(30),
        supabaseClient
          .from('tour_opening_acts')
          .select('id, tour_id, opener_id, headliner_id, status, revenue_split, attendance_boost, fan_crossover_rate, created_at, accepted_turn')
          .or(`opener_id.eq.${profile.id},headliner_id.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(30),
        supabaseClient
          .from('notifications')
          .select('id, type, title, subtitle, body, metrics, payload, deep_links, is_read, created_at')
          .eq('player_id', profile.id)
          .eq('type', EVENT_INVITATION_TYPE)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (collabsResult.error) throw collabsResult.error;
      if (tourInvitesResult.error) throw tourInvitesResult.error;
      if (eventInvitesResult.error) throw eventInvitesResult.error;

      const collabs = collabsResult.data || [];
      const tourInvites = tourInvitesResult.data || [];
      const eventInvites = eventInvitesResult.data || [];

      const tourIds = [...new Set(tourInvites.map((invite) => invite.tour_id).filter(Boolean))];
      const eventIds = [...new Set(eventInvites.map((notif) => notif.metrics?.event_id || notif.payload?.event_id).filter(Boolean))];
      const artistIds = new Set([
        ...collabs.map((row) => row.requester_artist_id),
        ...collabs.map((row) => row.target_artist_id),
        ...tourInvites.map((row) => row.headliner_id),
        ...tourInvites.map((row) => row.opener_id),
        ...eventInvites.map((notif) => notif.metrics?.host_id || notif.payload?.host_id),
      ].filter(Boolean));

      const [profilesResult, toursResult, eventsResult] = await Promise.all([
        artistIds.size > 0
          ? supabaseClient.from('profiles').select('id, artist_name, artist_image').in('id', [...artistIds])
          : Promise.resolve({ data: [], error: null }),
        tourIds.length > 0
          ? supabaseClient.from('tours').select('id, tour_name, region').in('id', tourIds)
          : Promise.resolve({ data: [], error: null }),
        eventIds.length > 0
          ? supabaseClient.from('tour_events').select('id, event_name, event_type, city, region, status, hosted_by').in('id', eventIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (toursResult.error) throw toursResult.error;
      if (eventsResult.error) throw eventsResult.error;

      const profileMap = new Map((profilesResult.data || []).map((row) => [row.id, row]));
      const tourMap = new Map((toursResult.data || []).map((row) => [row.id, row]));
      const eventMap = new Map((eventsResult.data || []).map((row) => [row.id, row]));

      const collaborationItems = collabs.map((collab) => {
        const isIncoming = collab.target_artist_id === profile.id;
        const otherArtistId = isIncoming ? collab.requester_artist_id : collab.target_artist_id;
        const otherArtist = profileMap.get(otherArtistId);

        return {
          id: `collaboration-${collab.id}`,
          itemType: 'collaboration',
          sourceId: collab.id,
          status: collab.status,
          isIncoming,
          isPending: collab.status === 'pending',
          title: collab.collaboration_type,
          body: collab.proposed_concept,
          created_at: collab.created_at,
          otherArtistName: otherArtist?.artist_name || 'Unknown Artist',
          otherArtistImage: otherArtist?.artist_image || null,
          collaboration_type: collab.collaboration_type,
          proposed_concept: collab.proposed_concept,
          requester_energy_cost: collab.requester_energy_cost,
          target_energy_cost: collab.target_energy_cost,
          revenue_split: collab.revenue_split,
        };
      });

      const tourInviteItems = tourInvites.map((invite) => {
        const normalizedStatus = normalizeInviteStatus(invite.status);
        const isIncoming = invite.opener_id === profile.id;
        const otherArtistId = isIncoming ? invite.headliner_id : invite.opener_id;
        const otherArtist = profileMap.get(otherArtistId);
        const tour = tourMap.get(invite.tour_id);

        return {
          id: `tour-${invite.id}`,
          itemType: 'tour_invite',
          sourceId: invite.id,
          status: normalizedStatus,
          inviteSource: 'tour_opening_acts',
          isIncoming,
          isPending: normalizedStatus === 'pending',
          title: tour?.tour_name || 'Opening Act Invitation',
          body: isIncoming
            ? `Open this run for ${Math.round(Number(invite.revenue_split || 0) * 100)}% of the revenue split.`
            : `Waiting for a response on your opening act invitation.`,
          created_at: invite.created_at,
          otherArtistName: otherArtist?.artist_name || 'Unknown Artist',
          otherArtistImage: otherArtist?.artist_image || null,
          revenue_split: invite.revenue_split,
          attendance_boost: invite.attendance_boost,
          fan_crossover_rate: invite.fan_crossover_rate,
          tourName: tour?.tour_name || 'Tour',
          region: tour?.region || null,
        };
      });

      const eventInvitationItems = eventInvites
        .map((notif) => {
          const metrics = notif.metrics || {};
          const payload = notif.payload || {};
          const eventId = metrics.event_id || payload.event_id;
          if (!eventId) return null;

          const event = eventMap.get(eventId);
          if (event?.status && event.status !== 'available') return null;

          const hostId = metrics.host_id || payload.host_id || event?.hosted_by;
          const hostProfile = profileMap.get(hostId);
          const eventType = payload.event_type || metrics.event_type || event?.event_type || 'showcase';
          const city = payload.city || metrics.city || event?.city || 'Unknown city';

          return {
            id: `event-invitation-${notif.id}`,
            itemType: EVENT_INVITATION_TYPE,
            sourceId: notif.id,
            notificationId: notif.id,
            status: notif.is_read ? 'read' : 'pending',
            isIncoming: true,
            isPending: true,
            isActionable: true,
            isRead: notif.is_read,
            title: event?.event_name || payload.event_name || metrics.event_name || notif.title || 'Invite-only Event',
            body: notif.body,
            created_at: notif.created_at,
            otherArtistName: hostProfile?.artist_name || payload.host_name || metrics.host_name || 'Host Artist',
            otherArtistImage: hostProfile?.artist_image || null,
            eventId,
            eventType,
            city,
          };
        })
        .filter(Boolean);

      const mergedItems = [
        ...collaborationItems,
        ...tourInviteItems,
        ...eventInvitationItems,
      ].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

      setInboxItems(mergedItems);
    } catch (error) {
      console.error("[CollaborationInbox] Failed to load collaborations:", error);
      setInboxItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCollaborationResponse = async (item, response) => {
    setActionLoading(item.id);
    try {
      const result = await invokeEdgeFunction('socialMedia', {
        action: 'respondToCollaboration',
        collaborationId: item.sourceId,
        artistId: profile.id,
        response,
      });

      if (!result.success) throw new Error(result.error || 'Failed to update collaboration request');

      const payload = result.data?.data || result.data || {};
      
      if (response === 'accept') {
        showToast(`Collaboration accepted! Generated ${payload.performance?.views?.toLocaleString() || 0} views`, "success");
      } else {
        showToast("Collaboration declined", "info");
      }

      // Refresh the list
      await loadCollaborations();
    } catch (error) {
      console.error("[CollaborationInbox] Response error:", error);
      showToast(`Failed to ${response} collaboration: ${error.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTourInviteResponse = async (item, response) => {
    setActionLoading(item.id);
    try {
      let result;
      if (item.inviteSource === 'tour_support_invites') {
        await invokeFestivalAction('respondTourSupportInvite', {
          artistId: profile.id,
          inviteId: item.sourceId,
          accept: response === 'accept',
        });
      } else {
        result = await invokeEdgeFunction('touring', {
          action: 'respondOpeningAct',
          artistId: profile.id,
          invitationId: item.sourceId,
          response: response === 'accept' ? 'accepted' : 'declined',
        });
        if (!result.success) throw new Error(result.error || 'Failed to update opening act invitation');
      }

      showToast(response === 'accept' ? 'Opening act invitation accepted' : 'Opening act invitation declined', response === 'accept' ? 'success' : 'info');
      await loadCollaborations();
    } catch (error) {
      console.error("[CollaborationInbox] Tour invite response error:", error);
      showToast(`Failed to ${response} tour invitation: ${error.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEventInvitationAccept = async (item) => {
    setActionLoading(item.id);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'bookEvent',
        artistId: profile.id,
        eventId: item.eventId,
      });

      if (!result.success) throw new Error(result.error || 'Failed to attend invite-only event');

      await markNotificationRead(item.notificationId);
      showToast(`You're booked for ${item.title}`, 'success');
      await loadCollaborations();
    } catch (error) {
      console.error("[CollaborationInbox] Event invitation accept error:", error);
      showToast(`Failed to accept event invitation: ${error.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEventInvitationRead = async (item) => {
    setActionLoading(item.id);
    try {
      await markNotificationRead(item.notificationId);
      showToast('Invitation marked as read', 'info');
      await loadCollaborations();
    } catch (error) {
      console.error("[CollaborationInbox] Event invitation read error:", error);
      showToast(`Failed to mark invitation as read: ${error.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const getFilteredCollabs = () => {
    switch (activeTab) {
      case 'incoming':
        return inboxItems.filter((item) => item.isIncoming && item.isPending);
      case 'outgoing':
        return inboxItems.filter((item) => !item.isIncoming && item.isPending);
      case 'all':
        return inboxItems;
      default:
        return inboxItems;
    }
  };

  const filteredCollabs = getFilteredCollabs();
  const incomingCount = inboxItems.filter((item) => item.isIncoming && item.isPending).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#111118] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-white text-base font-bold">Invites & Collaborations</h3>
                <p className="text-gray-500 text-[10px]">
                  {incomingCount > 0 && `${incomingCount} pending request${incomingCount > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setActiveTab('incoming')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                activeTab === 'incoming'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
              }`}
            >
              Incoming {incomingCount > 0 && `(${incomingCount})`}
            </button>
            <button
              onClick={() => setActiveTab('outgoing')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                activeTab === 'outgoing'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
              }`}
            >
              Outgoing
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : filteredCollabs.length === 0 ? (
            <div className="text-center py-10">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No {activeTab === 'incoming' ? 'incoming' : activeTab === 'outgoing' ? 'outgoing' : ''} invites</p>
              <p className="text-gray-500 text-[10px] mt-1">
                {activeTab === 'incoming' ? 'Check back later for new requests' : 'Pending requests you send will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCollabs.map((item) => {
                const StatusIcon = getStatusIcon(item.status);
                const TypeIcon = getInboxItemIcon(item);
                const isIncoming = item.isIncoming;
                const counterpartLabel = item.itemType === 'tour_invite'
                  ? (isIncoming ? 'Headliner' : 'Opener')
                  : item.itemType === EVENT_INVITATION_TYPE
                    ? 'Host'
                    : (isIncoming ? 'From' : 'To');

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <TypeIcon className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white text-sm font-semibold">
                              {item.title}
                            </p>
                            <div className={`flex items-center gap-1 text-[10px] ${getStatusColor(item.status)}`}>
                              <StatusIcon className="w-3 h-3" />
                              <span className="capitalize">{item.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                          <p className="text-gray-500 text-[10px]">
                            {counterpartLabel}: {item.otherArtistName}
                          </p>
                        </div>
                      </div>
                      
                      {item.itemType === 'collaboration' && item.status === 'pending' && isIncoming && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleCollaborationResponse(item, 'accept')}
                            disabled={actionLoading === item.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-[10px]"
                          >
                            {actionLoading === item.id ? (
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              'Accept'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCollaborationResponse(item, 'decline')}
                            disabled={actionLoading === item.id}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-[10px]"
                          >
                            Decline
                          </Button>
                        </div>
                      )}

                      {item.itemType === 'tour_invite' && item.status === 'pending' && isIncoming && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleTourInviteResponse(item, 'accept')}
                            disabled={actionLoading === item.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-[10px]"
                          >
                            {actionLoading === item.id ? (
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              'Accept'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTourInviteResponse(item, 'decline')}
                            disabled={actionLoading === item.id}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-[10px]"
                          >
                            Decline
                          </Button>
                        </div>
                      )}

                      {item.itemType === EVENT_INVITATION_TYPE && item.isActionable && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleEventInvitationAccept(item)}
                            disabled={actionLoading === item.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-[10px]"
                          >
                            {actionLoading === item.id ? (
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              'Attend'
                            )}
                          </Button>
                          {!item.isRead && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEventInvitationRead(item)}
                              disabled={actionLoading === item.id}
                              className="border-white/10 text-gray-300 hover:bg-white/10 px-3 py-1.5 text-[10px]"
                            >
                              Mark Read
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {item.body && (
                        <div className="bg-white/[0.02] rounded-lg p-2">
                          <p className="text-gray-300 text-[11px] italic">
                            "{item.body}"
                          </p>
                        </div>
                      )}

                      {item.itemType === 'collaboration' && (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            <span className="text-gray-400">Energy:</span>
                            <span className="text-white">
                              {isIncoming ? item.target_energy_cost : item.requester_energy_cost}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-400" />
                            <span className="text-gray-400">Revenue:</span>
                            <span className="text-white">
                              {Math.round((isIncoming ? (1 - Number(item.revenue_split || 0)) : Number(item.revenue_split || 0)) * 100)}%
                            </span>
                          </div>
                        </div>
                      )}

                      {item.itemType === 'tour_invite' && (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-400" />
                            <span className="text-gray-400">Revenue:</span>
                            <span className="text-white">{Math.round(Number(item.revenue_split || 0) * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            <span className="text-gray-400">Attendance:</span>
                            <span className="text-white">+{Math.round((Number(item.attendance_boost || 1) - 1) * 100)}%</span>
                          </div>
                        </div>
                      )}

                      {item.itemType === EVENT_INVITATION_TYPE && (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-pink-400" />
                            <span className="text-gray-400">City:</span>
                            <span className="text-white">{item.city}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Music className="w-3 h-3 text-purple-400" />
                            <span className="text-gray-400">Event:</span>
                            <span className="text-white">{String(item.eventType || '').replace(/_/g, ' ')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <Button
            onClick={onClose}
            className="w-full bg-white/[0.06] hover:bg-white/[0.08] text-gray-300"
          >
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
