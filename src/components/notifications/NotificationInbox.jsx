import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, DollarSign, TrendingUp, Users, Zap, Flame, Music, ShoppingBag, Award, ChevronRight, Sparkles, CheckCheck, Trash2, Heart, MessageCircle, Repeat2, UserPlus, Handshake, Trophy, BarChart3, Lock } from "lucide-react";
import { supabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { invokeFestivalAction } from "@/lib/invokeFestivalAction";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { reportError } from "../errorReporting";
import { TURNS_PER_GAME_DAY } from "../utils/turnMath";
import { formatRelativeTurnLabel } from "./notificationAge";
import { formatNumber as formatCompactNumber } from "@/utils/numberFormat";
import { showToast } from "@/components/ui/toast-provider";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_POLL_INTERVAL_MS } from "./notificationConfig";


const PINNED_NOTIFICATION_TYPES = new Set([
  'FESTIVAL_PROMOTER_OUTREACH',
  'FESTIVAL_SELECTED',
  'FESTIVAL_LINEUP_LOCKED',
  'FESTIVAL_SETLIST_REMINDER',
  'FESTIVAL_STARTING_SOON',
  'TOUR_INVITE',
  'TOUR_INVITE_RESPONSE',
  'event_invitation',
  'COLLABORATION_REQUEST',
  'LOOPTOK_DUET',
]);

export default function NotificationInbox({ profile, onClose, onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(NOTIFICATION_PAGE_SIZE);
  const navigate = useNavigate();
  const panelRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (!profile?.id || !isSupabaseConfigured) {
      setNotifications([]);
      setTotalCount(0);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const [notifResult, unreadResult, latestTurnResult] = await Promise.all([
        supabaseClient
          .from('notifications')
          .select('*', { count: 'exact' })
          .eq('player_id', profile.id)
          .order('created_at', { ascending: false })
          .range(0, Math.max(visibleLimit - 1, 0)),
        supabaseClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', profile.id)
          .eq('is_read', false),
        supabaseClient.from('turn_state').select('global_turn_id').eq('id', 1).maybeSingle()
      ]);

      if (notifResult.error) throw notifResult.error;
      if (unreadResult.error) throw unreadResult.error;
      if (latestTurnResult.error) throw latestTurnResult.error;

      setCurrentTurnIndex(latestTurnResult.data?.global_turn_id ?? 0);
      setNotifications(Array.isArray(notifResult.data) ? notifResult.data : []);
      setTotalCount(notifResult.count || 0);
      setUnreadCount(unreadResult.count || 0);
    } catch (error) {
      reportError({
        scope: "NotificationInbox",
        message: "Failed to load notifications",
        error
      });
      // Do NOT clear notifications on fetch error — stale data is better than a false empty state.
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [profile?.id, visibleLimit]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    setVisibleLimit(NOTIFICATION_PAGE_SIZE);
  }, [profile?.id]);

  useEffect(() => {
    loadNotifications();
    const refreshInterval = setInterval(() => { loadNotifications(); }, NOTIFICATION_POLL_INTERVAL_MS);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // ESC key handler
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    
    // Focus trap
    if (panelRef.current) {
      panelRef.current.focus();
    }
    
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEsc);
      clearInterval(refreshInterval);
    };
  }, [loadNotifications, onClose]);

  const markAsRead = async (notif) => {
    if (notif.is_read) return;
    
    try {
      if (!notif?.id) return;
      await supabaseClient.from('notifications').update({ is_read: true }).eq('id', notif.id);
      setNotifications(prev => 
        prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      reportError({
        scope: "NotificationInbox",
        message: "Failed to mark notification as read",
        error
      });
    }
  };

  const handleNotifClick = async (notif) => {
    await markAsRead(notif);
    setSelectedNotif({ ...notif, is_read: true });
  };

  const markAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      if (unread.length === 0) return;
      await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('player_id', profile.id)
        .eq('is_read', false);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      reportError({ scope: 'NotificationInbox', message: 'Failed to mark all as read', error });
    }
  };

  const clearAll = async () => {
    try {
      await supabaseClient
        .from('notifications')
        .delete()
        .eq('player_id', profile.id);
      setNotifications([]);
      setTotalCount(0);
      setUnreadCount(0);
    } catch (error) {
      reportError({ scope: 'NotificationInbox', message: 'Failed to clear notifications', error });
    }
  };

  const loadOlderNotifications = () => {
    setLoadingMore(true);
    setVisibleLimit((prev) => prev + NOTIFICATION_PAGE_SIZE);
  };

  const handleDeepLink = (link) => {
    onClose();
    
    const wantsCollaborationInbox = link.params?.openInbox === 'collaborations' || link.params?.openApp === 'collaborations';
    if (wantsCollaborationInbox) {
      navigate(createPageUrl('Social'));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('openCollaborationInbox'));
      }, 150);
      return;
    }
    
    const params = new URLSearchParams();
    if (link.params) {
      Object.entries(link.params).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const url = createPageUrl(link.route) + (params.toString() ? `?${params.toString()}` : '');
    navigate(url);
  };

  const handleRadioDiscoveryResponse = async (notif, response) => {
    try {
      if (!profile?.id) return;
      const metrics = notif?.metrics || {};
      const result = await invokeEdgeFunction("soundburstRadio", {
        action: "respondToDiscovery",
        artistId: profile.id,
        response,
        eventId: metrics.event_id || null,
        submissionId: metrics.submission_id || null,
        eventType: metrics.event_type || null,
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to resolve discovery offer');
      }

      await markAsRead(notif);
      setSelectedNotif((prev) => prev ? { ...prev, _radioResolved: response } : prev);
      await loadNotifications();
    } catch (error) {
      reportError({
        scope: "NotificationInbox",
        message: "Failed to resolve radio discovery",
        error,
      });
    }
  };

  const getNotificationActionContext = (notif) => {
    const metrics = notif?.metrics || {};
    const payload = notif?.payload || {};

    return {
      collaborationId: metrics.collaboration_id || payload.collaboration_id || null,
      invitationId: metrics.invitation_id || payload.invitation_id || null,
      eventId: metrics.event_id || payload.event_id || null,
      eventType: metrics.event_type || payload.event_type || null,
      requesterName: metrics.requester_name || payload.requester_name || null,
      city: metrics.city || payload.city || null,
      hostName: metrics.host_name || payload.host_name || null,
      collaborationType: metrics.collaboration_type || payload.collaboration_type || null,
    };
  };

  const handleCollaborationRequestResponse = async (notif, response) => {
    const { collaborationId } = getNotificationActionContext(notif);
    if (!profile?.id || !collaborationId) return;

    setActionLoading(notif.id);
    try {
      const result = await invokeEdgeFunction('socialMedia', {
        action: 'respondToCollaboration',
        collaborationId,
        artistId: profile.id,
        response,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to resolve collaboration request');
      }

      await markAsRead(notif);
      setSelectedNotif((prev) => prev ? { ...prev, _inviteResolved: response } : prev);
      showToast(response === 'accept' ? 'Collaboration accepted' : 'Collaboration declined', response === 'accept' ? 'success' : 'info');
      await loadNotifications();
    } catch (error) {
      reportError({
        scope: 'NotificationInbox',
        message: 'Failed to resolve collaboration request',
        error,
      });
      showToast(error.message || 'Failed to resolve collaboration request', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTourInviteResponse = async (notif, response) => {
    const { invitationId } = getNotificationActionContext(notif);
    if (!profile?.id || !invitationId) return;

    setActionLoading(notif.id);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'respondOpeningAct',
        artistId: profile.id,
        invitationId,
        response: response === 'accept' ? 'accepted' : 'declined',
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to resolve tour invitation');
      }

      await markAsRead(notif);
      setSelectedNotif((prev) => prev ? { ...prev, _inviteResolved: response } : prev);
      showToast(response === 'accept' ? 'Tour invitation accepted' : 'Tour invitation declined', response === 'accept' ? 'success' : 'info');
      await loadNotifications();
    } catch (error) {
      reportError({
        scope: 'NotificationInbox',
        message: 'Failed to resolve tour invitation',
        error,
      });
      showToast(error.message || 'Failed to resolve tour invitation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTourSupportInviteResponse = async (notif, response) => {
    const metrics = notif?.metrics || {};
    const payload = notif?.payload || {};
    const inviteId = metrics.invite_id || metrics.support_invite_id || payload.invite_id || payload.support_invite_id || null;
    if (!profile?.id || !inviteId) return;

    setActionLoading(notif.id);
    try {
      await invokeFestivalAction('respondTourSupportInvite', {
        artistId: profile.id,
        inviteId,
        accept: response === 'accept',
      });

      await markAsRead(notif);
      setSelectedNotif((prev) => prev ? { ...prev, _inviteResolved: response } : prev);
      showToast(response === 'accept' ? 'Tour support invitation accepted' : 'Tour support invitation declined', response === 'accept' ? 'success' : 'info');
      await loadNotifications();
    } catch (error) {
      reportError({
        scope: 'NotificationInbox',
        message: 'Failed to resolve tour support invitation',
        error,
      });
      showToast(error.message || 'Failed to resolve tour support invitation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEventInvitationAccept = async (notif) => {
    const { eventId } = getNotificationActionContext(notif);
    if (!profile?.id || !eventId) return;

    setActionLoading(notif.id);
    try {
      const result = await invokeEdgeFunction('touring', {
        action: 'bookEvent',
        artistId: profile.id,
        eventId,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to attend invite-only event');
      }

      await markAsRead(notif);
      setSelectedNotif((prev) => prev ? { ...prev, _inviteResolved: 'accepted' } : prev);
      showToast('Invite-only event booked', 'success');
      await loadNotifications();
    } catch (error) {
      reportError({
        scope: 'NotificationInbox',
        message: 'Failed to accept event invitation',
        error,
      });
      showToast(error.message || 'Failed to accept event invitation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const getNotifIcon = (type) => {
    if (type === 'TURN_RECAP') return DollarSign;
    if (type === 'HIGHLIGHT') return Flame;
    if (type === 'SOCIAL' || type === 'SOCIAL_FOLLOWER_SPIKE') return Users;
    if (type === 'MERCH' || type === 'MERCH_SURGE') return ShoppingBag;
    if (type === 'ACHIEVEMENT') return Trophy;
    if (type === 'STREAMING_SPIKE') return Music;
    if (type === 'MARKET_SHIFT') return TrendingUp;
    if (type === 'PLAYLIST_UPDATE') return Music;
    if (type === 'ERA_UPDATE') return Sparkles;
    if (type === 'CAREER_UPDATE' || type === 'CAREER_PROGRESSION') return Award;
    if (type === 'CAREER_TREND_CHANGE') return Sparkles;
    if (type === 'SOCIAL_MEDIA_INCOME') return DollarSign;
    if (type === 'COLLABORATION_REQUEST') return Handshake;
    if (type === 'COLLABORATION_ACCEPTED') return Handshake;
    if (type === 'COLLABORATION_DECLINED') return Handshake;
    if (type === 'CHART') return BarChart3;
    if (type === 'TOUR_GIG') return Music;
    if (type === 'TOUR_EVENT') return Zap;
    if (type === 'TOUR_INVITE' || type === 'TOUR_INVITE_RESPONSE') return Handshake;
    if (type === 'event_invitation') return Music;
    if (type === 'TOUR_COMPLETED') return Trophy;
    if (type === 'TOUR_UPDATE') return TrendingUp;
    if (type === 'LOOPTOK_DUET') return Sparkles;
    if (type === 'FESTIVAL_SELECTED' || type === 'FESTIVAL_REJECTED') return Music;
    if (type === 'FESTIVAL_DAY_RESULT') return Flame;
    if (type === 'FESTIVAL_PROMOTER_OUTREACH') return Music;
    if (type === 'FESTIVAL_APPLICATIONS_OPEN') return Music;
    if (type === 'FESTIVAL_LINEUP_LOCKED') return Lock;
    if (type === 'FESTIVAL_SETLIST_REMINDER') return Music;
    if (type === 'FESTIVAL_STARTING_SOON') return Flame;
    if (type === 'FESTIVAL_SNIPE_TARGET' || type === 'FESTIVAL_SNIPE_ATTACKER') return Zap;
    if (type === 'FESTIVAL_BACKSTAGE_OFFER' || type === 'FESTIVAL_BACKSTAGE_RESOLVED') return Handshake;
    // Approach C: Backstage follow-through artifact notification types
    if (type === 'TOURING_INVITE') return Handshake;
    if (type === 'SYNC_PITCH_LEAD') return Music;
    if (type === 'RADIO_AIRPLAY') return Music;
    if (type === 'RADIO_DISCOVERY') return TrendingUp;
    if (type === 'RADIO_HOST') return Sparkles;
    return Zap;
  };

  const getNotifColors = (type) => {
    const colors = {
      TURN_RECAP: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      HIGHLIGHT: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      SOCIAL: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
      SOCIAL_FOLLOWER_SPIKE: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
      MERCH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
      MERCH_SURGE: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
      ACHIEVEMENT: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
      STREAMING_SPIKE: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      MARKET_SHIFT: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
      PLAYLIST_UPDATE: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
      ERA_UPDATE: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
      CAREER_UPDATE: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      CAREER_PROGRESSION: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      CAREER_TREND_CHANGE: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      SOCIAL_MEDIA_INCOME: { bg: 'bg-green-500/20', text: 'text-green-400' },
      COLLABORATION_REQUEST: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
      COLLABORATION_ACCEPTED: { bg: 'bg-green-500/20', text: 'text-green-400' },
      COLLABORATION_DECLINED: { bg: 'bg-red-500/20', text: 'text-red-400' },
      CHART: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      TOUR_GIG: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      TOUR_EVENT: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
      TOUR_INVITE: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
      TOUR_INVITE_RESPONSE: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
      event_invitation: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
      TOUR_COMPLETED: { bg: 'bg-green-500/20', text: 'text-green-400' },
      TOUR_UPDATE: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
      LOOPTOK_DUET: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
      FESTIVAL_SELECTED: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
      FESTIVAL_REJECTED: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
      FESTIVAL_DAY_RESULT: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
      FESTIVAL_PROMOTER_OUTREACH: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      FESTIVAL_APPLICATIONS_OPEN: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
      FESTIVAL_LINEUP_LOCKED: { bg: 'bg-green-500/20', text: 'text-green-400' },
      FESTIVAL_SETLIST_REMINDER: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
      FESTIVAL_STARTING_SOON: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      FESTIVAL_SNIPE_TARGET: { bg: 'bg-red-500/20', text: 'text-red-400' },
      FESTIVAL_SNIPE_ATTACKER: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      FESTIVAL_BACKSTAGE_OFFER: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
      FESTIVAL_BACKSTAGE_RESOLVED: { bg: 'bg-green-500/20', text: 'text-green-400' },
      // Approach C: Backstage follow-through artifact notification types
      TOURING_INVITE: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
      SYNC_PITCH_LEAD: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
      RADIO_AIRPLAY: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      RADIO_DISCOVERY: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
      RADIO_HOST: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
    };
    return colors[type] || { bg: 'bg-purple-500/20', text: 'text-purple-400' };
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDetailBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setSelectedNotif(null);
    }
  };


  const normalizeTitle = (title = '') => {
    // Player-facing UI should avoid raw turn-number prefixes like "Turn 491870".
    return title.replace(/^Turn\s+#?\d+\s*/i, '').trim() || title;
  };


  const selectedNotifActionContext = selectedNotif ? getNotificationActionContext(selectedNotif) : null;
  const selectedNotifMetrics = selectedNotif?.metrics || {};
  const selectedNotifPayload = selectedNotif?.payload || {};


  if (selectedNotif) {
    return (
      <AnimatePresence>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDetailBackdropClick}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
        >
          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed right-4 top-1/2 -translate-y-1/2 w-[min(420px,92vw)] max-h-[min(640px,80vh)] bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col z-[61]"
            tabIndex={-1}
          >
            {/* Header */}
            <div className="bg-[#111118] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between flex-shrink-0">
              <button 
                onClick={() => setSelectedNotif(null)} 
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
              <h2 className="text-white text-sm font-semibold">{selectedNotif.title || 'Notification'}</h2>
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {/* Title Section */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                <h1 className="text-white text-sm font-bold mb-0.5">{selectedNotif.title}</h1>
                {selectedNotif.subtitle && (
                  <p className="text-gray-400 text-[11px] mb-1.5">{selectedNotif.subtitle}</p>
                )}
                <p className="text-gray-300 text-xs leading-relaxed">{selectedNotif.body}</p>
              </div>

              {/* SECTION 1: Income (Grouped) */}
              {selectedNotif.type === 'TURN_RECAP' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-3.5 h-3.5 text-green-400" />
                    <h3 className="text-white text-xs font-semibold">Income</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.net_income !== undefined && (
                      <MetricRow 
                        label="Net Income" 
                        value={`${selectedNotif.metrics.net_income >= 0 ? '+' : ''}$${selectedNotif.metrics.net_income?.toLocaleString()}`}
                        positive={selectedNotif.metrics.net_income > 0}
                      />
                    )}
                    {(selectedNotif.metrics.streaming_revenue || 0) > 0 && (
                      <MetricRow 
                        label="Streaming" 
                        value={`$${Math.floor(selectedNotif.metrics.streaming_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.merch_revenue || 0) > 0 && (
                      <MetricRow 
                        label="Merch Sales" 
                        value={`$${Math.floor(selectedNotif.metrics.merch_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.social_revenue || 0) > 0 && (
                      <MetricRow 
                        label="Social Media (VidWave/LoopTok)" 
                        value={`$${Math.floor(selectedNotif.metrics.social_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.brand_deal_revenue || 0) > 0 && (
                      <MetricRow 
                        label="Brand Deals" 
                        value={`$${Math.floor(selectedNotif.metrics.brand_deal_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.touring_revenue || 0) > 0 && (
                      <MetricRow 
                        label="Touring" 
                        value={`$${Math.floor(selectedNotif.metrics.touring_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.fan_sub_revenue || 0) > 0 && (
                      <MetricRow
                        label="Fan Subs"
                        value={`$${Math.floor(selectedNotif.metrics.fan_sub_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.sync_licensing_revenue || 0) > 0 && (
                      <MetricRow
                        label="Sync Licensing"
                        value={`$${Math.floor(selectedNotif.metrics.sync_licensing_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.collab_revenue || 0) > 0 && (
                      <MetricRow
                        label="Collaborations"
                        value={`$${Math.floor(selectedNotif.metrics.collab_revenue || 0).toLocaleString()}`}
                      />
                    )}
                    {(selectedNotif.metrics.expenses || 0) > 0 && (
                      <MetricRow
                        label="Expenses"
                        value={`-$${Math.floor(selectedNotif.metrics.expenses || 0).toLocaleString()}`}
                        positive={false}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 2: Streaming Updates (Grouped) */}
              {selectedNotif.type === 'TURN_RECAP' && selectedNotif.metrics?.total_streams > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-3.5 h-3.5 text-purple-400" />
                    <h3 className="text-white text-xs font-semibold">Streaming</h3>
                  </div>
                  <div className="space-y-1">
                    <MetricRow 
                      label="Total Streams" 
                      value={`+${(selectedNotif.metrics.total_streams / 1000).toFixed(1)}k`}
                    />
                    {selectedNotif.metrics.top_platform && (
                      <MetricRow 
                        label="Top Platform" 
                        value={selectedNotif.metrics.top_platform}
                      />
                    )}
                    {selectedNotif.metrics.platform_streams && Object.keys(selectedNotif.metrics.platform_streams).length > 0 && (
                      Object.entries(selectedNotif.metrics.platform_streams).map(([plat, streams]) => (
                        streams > 0 ? <MetricRow key={plat} label={plat} value={`+${(streams / 1000).toFixed(1)}k`} /> : null
                      ))
                    )}
                    {selectedNotif.metrics.releases_dropped > 0 && (
                      <MetricRow 
                        label="New Releases" 
                        value={`${selectedNotif.metrics.releases_dropped}`}
                      />
                    )}
                    {(selectedNotif.metrics.merch_units_sold || 0) > 0 && (
                      <MetricRow 
                        label="Merch Units Sold" 
                        value={`${selectedNotif.metrics.merch_units_sold}`}
                      />
                    )}
                    {selectedNotif.metrics.stream_milestones > 0 && (
                      <MetricRow 
                        label="Milestones Hit" 
                        value={`${selectedNotif.metrics.stream_milestones}`}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 3: Chart Movement (Grouped) */}
              {selectedNotif.type === 'TURN_RECAP' && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-3.5 h-3.5 text-yellow-400" />
                    <h3 className="text-white text-xs font-semibold">Charts</h3>
                  </div>
                  {selectedNotif.metrics?.chart_summary ? (
                    <div className="space-y-1">
                      {(selectedNotif.metrics.chart_summary.total_entries || 0) > 0 && (
                        <MetricRow label="Charting Releases" value={`${selectedNotif.metrics.chart_summary.total_entries}`} />
                      )}
                      {(selectedNotif.metrics.chart_summary.debuts || 0) > 0 && (
                        <MetricRow label="Debuts" value={`${selectedNotif.metrics.chart_summary.debuts}`} positive />
                      )}
                      {(selectedNotif.metrics.chart_summary.moved_up || 0) > 0 && (
                        <MetricRow label="Moved Up" value={`${selectedNotif.metrics.chart_summary.moved_up}`} positive />
                      )}
                      {(selectedNotif.metrics.chart_summary.moved_down || 0) > 0 && (
                        <MetricRow label="Moved Down" value={`${selectedNotif.metrics.chart_summary.moved_down}`} positive={false} />
                      )}
                      {(selectedNotif.metrics.chart_summary.new_peaks || 0) > 0 && (
                        <MetricRow label="New Peaks" value={`${selectedNotif.metrics.chart_summary.new_peaks}`} positive />
                      )}
                      {(selectedNotif.metrics.chart_summary.number_ones || 0) > 0 && (
                        <MetricRow label="#1 Hits" value={`${selectedNotif.metrics.chart_summary.number_ones}`} positive />
                      )}
                      {Array.isArray(selectedNotif.metrics.chart_summary.top_moves) && selectedNotif.metrics.chart_summary.top_moves.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">Top Moves</p>
                          {selectedNotif.metrics.chart_summary.top_moves.map((move, index) => (
                            <div key={`${move.entity_id}-${index}`} className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-300 truncate pr-3">
                                {move.debut_flag ? 'Debut' : `#${move.previous_position} → #${move.position}`}
                              </span>
                              <span className="text-green-400 font-medium">
                                {move.debut_flag ? `#${move.position}` : `+${move.movement}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-gray-500 text-[10px]">No major chart movement this turn</p>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 4: Era (Grouped) */}
              {selectedNotif.type === 'TURN_RECAP' && selectedNotif.metrics?.era_phase && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <h3 className="text-white text-xs font-semibold">Era</h3>
                  </div>
                  <div className="space-y-1">
                    <MetricRow
                      label="Phase"
                      value={selectedNotif.metrics.era_phase}
                    />
                    {selectedNotif.metrics.era_momentum_change !== undefined && (
                      <MetricRow
                        label="Momentum"
                        value={`${selectedNotif.metrics.era_momentum_change > 0 ? '+' : ''}${selectedNotif.metrics.era_momentum_change}`}
                        positive={selectedNotif.metrics.era_momentum_change > 0}
                      />
                    )}
                    {selectedNotif.metrics.era_tension_change !== undefined && (
                      <MetricRow
                        label="Tension"
                        value={`${selectedNotif.metrics.era_tension_change > 0 ? '+' : ''}${selectedNotif.metrics.era_tension_change}`}
                        positive={selectedNotif.metrics.era_tension_change < 0 ? true : selectedNotif.metrics.era_tension_change > 0 ? false : undefined}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Additional Stats for Turn Recap */}
              {selectedNotif.type === 'TURN_RECAP' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                    <h3 className="text-white text-xs font-semibold">Growth</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.follower_change !== undefined && selectedNotif.metrics.follower_change !== 0 && (
                      <MetricRow 
                        label="Fans" 
                        value={`${selectedNotif.metrics.follower_change > 0 ? '+' : ''}${selectedNotif.metrics.follower_change?.toLocaleString()}`}
                        positive={selectedNotif.metrics.follower_change > 0}
                      />
                    )}
                    {((selectedNotif.metrics.social_follower_growth || selectedNotif.metrics.social_fan_growth) || 0) > 0 && (
                      <MetricRow 
                        label="Social Followers" 
                        value={`+${(selectedNotif.metrics.social_follower_growth || selectedNotif.metrics.social_fan_growth || 0).toLocaleString()}`}
                        positive={true}
                      />
                    )}
                    {selectedNotif.metrics.clout_change > 0 && (
                      <MetricRow 
                        label="Clout" 
                        value={`+${selectedNotif.metrics.clout_change}`}
                      />
                    )}
                    {selectedNotif.metrics.monthly_listeners > 0 && (
                      <MetricRow 
                        label="Monthly Listeners" 
                        value={formatCompactNumber(selectedNotif.metrics.monthly_listeners)}
                      />
                    )}
                    {(selectedNotif.metrics.energy_restored || 0) > 0 && (
                      <MetricRow 
                        label="Energy Restored" 
                        value={`+${selectedNotif.metrics.energy_restored}`}
                      />
                    )}
                    {(selectedNotif.metrics.inspiration_gained || 0) > 0 && (
                      <MetricRow 
                        label="Inspiration" 
                        value={`+${selectedNotif.metrics.inspiration_gained}`}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Merch Detail — covers both legacy MERCH and new MERCH_SURGE */}
              {(selectedNotif.type === 'MERCH' || selectedNotif.type === 'MERCH_SURGE') && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                    <h3 className="text-white text-xs font-semibold">Merch Sales</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.merch_revenue || selectedNotif.metrics.total_revenue || 0) > 0 && (
                      <MetricRow label="Revenue" value={`$${(selectedNotif.metrics.merch_revenue || selectedNotif.metrics.total_revenue || 0).toLocaleString()}`} positive />
                    )}
                    {(selectedNotif.metrics.merch_units_sold || selectedNotif.metrics.total_units || 0) > 0 && (
                      <MetricRow label="Units Sold" value={`${selectedNotif.metrics.merch_units_sold || selectedNotif.metrics.total_units}`} />
                    )}
                    {selectedNotif.is_aggregated && selectedNotif.group_count > 1 && (
                      <MetricRow label="Surge Events" value={`${selectedNotif.group_count} turns`} />
                    )}
                  </div>
                </div>
              )}

              {/* Streaming Spike Detail */}
              {selectedNotif.type === 'STREAMING_SPIKE' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-3.5 h-3.5 text-purple-400" />
                    <h3 className="text-white text-xs font-semibold">Streaming Surge</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.streams_earned || selectedNotif.metrics.total_streams || 0) > 0 && (
                      <MetricRow label="Streams" value={`+${((selectedNotif.metrics.streams_earned || selectedNotif.metrics.total_streams) / 1000).toFixed(1)}k`} positive />
                    )}
                    {(selectedNotif.metrics.streaming_revenue || selectedNotif.metrics.total_revenue || 0) > 0 && (
                      <MetricRow label="Revenue" value={`$${(selectedNotif.metrics.streaming_revenue || selectedNotif.metrics.total_revenue || 0).toLocaleString()}`} positive />
                    )}
                    {selectedNotif.metrics.peak_streams > 0 && (
                      <MetricRow label="Peak Turn" value={`${(selectedNotif.metrics.peak_streams / 1000).toFixed(1)}k`} />
                    )}
                    {selectedNotif.is_aggregated && selectedNotif.group_count > 1 && (
                      <MetricRow label="Spike Events" value={`${selectedNotif.group_count} turns`} />
                    )}
                  </div>
                </div>
              )}

              {/* Social Follower Spike Detail */}
              {selectedNotif.type === 'SOCIAL_FOLLOWER_SPIKE' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <h3 className="text-white text-xs font-semibold">Fan Growth</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.fan_growth || selectedNotif.metrics.latest_gain || 0) > 0 && (
                      <MetricRow label="New Fans" value={`+${(selectedNotif.metrics.fan_growth || selectedNotif.metrics.latest_gain || 0).toLocaleString()}`} positive />
                    )}
                    {(selectedNotif.metrics.total_followers_gained || 0) > 0 && (
                      <MetricRow label="Total Gained" value={`+${selectedNotif.metrics.total_followers_gained.toLocaleString()}`} positive />
                    )}
                    {selectedNotif.is_aggregated && selectedNotif.group_count > 1 && (
                      <MetricRow label="Spike Events" value={`${selectedNotif.group_count} turns`} />
                    )}
                  </div>
                </div>
              )}

              {/* Market Shift Detail */}
              {selectedNotif.type === 'MARKET_SHIFT' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                    <h3 className="text-white text-xs font-semibold">Market Activity</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.region && (
                      <MetricRow label="Region" value={selectedNotif.metrics.region} />
                    )}
                    {selectedNotif.metrics.status && (
                      <MetricRow
                        label="Status"
                        value={selectedNotif.metrics.status === 'heating_up' ? 'Heating Up 🔥' : 'Cooling Down ❄️'}
                        positive={selectedNotif.metrics.status === 'heating_up'}
                      />
                    )}
                    {selectedNotif.metrics.history?.length > 0 && (
                      <MetricRow label="Trend Length" value={`${selectedNotif.metrics.history.length} turns`} />
                    )}
                  </div>
                </div>
              )}

              {/* Playlist Update Detail */}
              {selectedNotif.type === 'PLAYLIST_UPDATE' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-3.5 h-3.5 text-violet-400" />
                    <h3 className="text-white text-xs font-semibold">Playlist Placements</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.total_placements || 0) > 0 && (
                      <MetricRow label="Active Placements" value={`${selectedNotif.metrics.total_placements}`} positive />
                    )}
                    {selectedNotif.metrics.best_release && (
                      <MetricRow label="Top Release" value={selectedNotif.metrics.best_release} />
                    )}
                  </div>
                </div>
              )}

              {/* Era Update Detail */}
              {selectedNotif.type === 'ERA_UPDATE' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <h3 className="text-white text-xs font-semibold">Era Status</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.era_name && (
                      <MetricRow label="Era" value={selectedNotif.metrics.era_name} />
                    )}
                    {selectedNotif.metrics.phase && (
                      <MetricRow label="Phase" value={selectedNotif.metrics.phase} />
                    )}
                    {selectedNotif.metrics.momentum !== undefined && (
                      <MetricRow label="Momentum" value={`${selectedNotif.metrics.momentum}`} positive={selectedNotif.metrics.momentum > 0} />
                    )}
                    {selectedNotif.metrics.tension !== undefined && (
                      <MetricRow label="Tension" value={`${selectedNotif.metrics.tension}`} />
                    )}
                    {selectedNotif.metrics.phase_turns_left !== undefined && (
                      <MetricRow label="Phase Turns Left" value={`${selectedNotif.metrics.phase_turns_left}`} />
                    )}
                  </div>
                </div>
              )}

              {/* Career Update Detail */}
              {(selectedNotif.type === 'CAREER_UPDATE' || selectedNotif.type === 'CAREER_PROGRESSION') && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <h3 className="text-white text-xs font-semibold">Career Progress</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.career_stage && (
                      <MetricRow label="Stage" value={selectedNotif.metrics.career_stage} />
                    )}
                    {selectedNotif.metrics.progress !== undefined && (
                      <MetricRow label="Progress" value={`${selectedNotif.metrics.progress}%`} positive />
                    )}
                    {selectedNotif.metrics.next_stage && (
                      <MetricRow label="Next Stage" value={selectedNotif.metrics.next_stage} />
                    )}
                    {(selectedNotif.metrics.monthly_listeners || 0) > 0 && (
                      <MetricRow label="Monthly Listeners" value={formatCompactNumber(selectedNotif.metrics.monthly_listeners)} />
                    )}
                    {(selectedNotif.metrics.followers || 0) > 0 && (
                      <MetricRow label="Fans" value={selectedNotif.metrics.followers.toLocaleString()} />
                    )}
                    {(selectedNotif.metrics.clout || 0) > 0 && (
                      <MetricRow label="Clout" value={`${selectedNotif.metrics.clout}`} />
                    )}
                  </div>
                </div>
              )}

              {/* Social Media Income Detail */}
              {selectedNotif.type === 'SOCIAL_MEDIA_INCOME' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-3.5 h-3.5 text-green-400" />
                    <h3 className="text-white text-xs font-semibold">Social Revenue</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.social_revenue || 0) > 0 && (
                      <MetricRow label="Ad Revenue" value={`$${selectedNotif.metrics.social_revenue.toLocaleString()}`} positive />
                    )}
                    {(selectedNotif.metrics.social_fan_growth || 0) > 0 && (
                      <MetricRow label="Social Followers" value={`+${selectedNotif.metrics.social_fan_growth}`} positive />
                    )}
                  </div>
                </div>
              )}

              {selectedNotif.type === 'COLLABORATION_REQUEST' && selectedNotifActionContext && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Handshake className="w-3.5 h-3.5 text-indigo-400" />
                    <h3 className="text-white text-xs font-semibold">Collaboration Request</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotifActionContext.requesterName && (
                      <MetricRow label="From" value={selectedNotifActionContext.requesterName} />
                    )}
                    {selectedNotifActionContext.collaborationType && (
                      <MetricRow label="Type" value={selectedNotifActionContext.collaborationType} />
                    )}
                    {selectedNotifActionContext.collaborationId && (
                      <MetricRow label="Request" value={selectedNotifActionContext.collaborationId} />
                    )}
                  </div>
                </div>
              )}

              {/* Tour Invite Detail */}
              {(selectedNotif.type === 'TOUR_INVITE' || selectedNotif.type === 'TOUR_INVITE_RESPONSE') && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Handshake className="w-3.5 h-3.5 text-indigo-400" />
                    <h3 className="text-white text-xs font-semibold">Touring</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.tour_id && (
                      <MetricRow label="Tour" value={selectedNotif.metrics.tour_id} />
                    )}
                    {selectedNotif.metrics.invitation_id && (
                      <MetricRow label="Invitation" value={selectedNotif.metrics.invitation_id} />
                    )}
                    {selectedNotif.metrics.revenue_split !== undefined && (
                      <MetricRow label="Revenue Split" value={`${Math.round(Number(selectedNotif.metrics.revenue_split || 0) * 100)}%`} />
                    )}
                    {selectedNotif.metrics.responder_id && (
                      <MetricRow label="Responder" value={selectedNotif.metrics.responder_id} />
                    )}
                  </div>
                </div>
              )}

              {/* Backstage Tour Support Invite Detail */}
              {selectedNotif.type === 'TOURING_INVITE' && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Handshake className="w-3.5 h-3.5 text-emerald-400" />
                    <h3 className="text-white text-xs font-semibold">Backstage Tour Support</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotifMetrics.headliner_name || selectedNotifPayload.headliner_name) && (
                      <MetricRow label="Headliner" value={selectedNotifMetrics.headliner_name || selectedNotifPayload.headliner_name} />
                    )}
                    {(selectedNotifMetrics.opener_name || selectedNotifPayload.opener_name) && (
                      <MetricRow label="Opener" value={selectedNotifMetrics.opener_name || selectedNotifPayload.opener_name} />
                    )}
                    {(selectedNotifMetrics.invite_id || selectedNotifPayload.invite_id || selectedNotifMetrics.support_invite_id || selectedNotifPayload.support_invite_id) && (
                      <MetricRow label="Invite" value={selectedNotifMetrics.invite_id || selectedNotifPayload.invite_id || selectedNotifMetrics.support_invite_id || selectedNotifPayload.support_invite_id} />
                    )}
                    {(selectedNotifMetrics.expires_turn_id ?? selectedNotifPayload.expires_turn_id) != null && (
                      <MetricRow label="Expires Turn" value={String(selectedNotifMetrics.expires_turn_id ?? selectedNotifPayload.expires_turn_id)} />
                    )}
                    {(selectedNotifMetrics.status || selectedNotifPayload.status) && (
                      <MetricRow label="Status" value={String(selectedNotifMetrics.status || selectedNotifPayload.status).replace(/_/g, ' ')} />
                    )}
                  </div>
                </div>
              )}

              {/* Backstage Sync Lead Detail */}
              {selectedNotif.type === 'SYNC_PITCH_LEAD' && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                    <h3 className="text-white text-xs font-semibold">Sync Pitch Lead</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotifMetrics.from_artist_name || selectedNotifPayload.from_artist_name) && (
                      <MetricRow label="From" value={selectedNotifMetrics.from_artist_name || selectedNotifPayload.from_artist_name} />
                    )}
                    {(selectedNotifMetrics.lead_id || selectedNotifPayload.lead_id) && (
                      <MetricRow label="Lead" value={selectedNotifMetrics.lead_id || selectedNotifPayload.lead_id} />
                    )}
                    {(selectedNotifMetrics.usage_type || selectedNotifPayload.usage_type) && (
                      <MetricRow label="Usage" value={selectedNotifMetrics.usage_type || selectedNotifPayload.usage_type} />
                    )}
                    {(selectedNotifMetrics.fee_range || selectedNotifPayload.fee_range) && (
                      <MetricRow
                        label="Fee Range"
                        value={(() => {
                          const fee = selectedNotifMetrics.fee_range || selectedNotifPayload.fee_range;
                          if (!fee || (fee.min == null && fee.max == null)) return '';
                          const min = fee.min != null ? `$${formatCompactNumber(fee.min)}` : '?';
                          const max = fee.max != null ? `$${formatCompactNumber(fee.max)}` : '?';
                          return `${min} - ${max}`;
                        })()}
                      />
                    )}
                    {(selectedNotifMetrics.expires_turn_id ?? selectedNotifPayload.expires_turn_id) != null && (
                      <MetricRow label="Expires Turn" value={String(selectedNotifMetrics.expires_turn_id ?? selectedNotifPayload.expires_turn_id)} />
                    )}
                  </div>
                </div>
              )}

              {selectedNotif.type === 'event_invitation' && selectedNotifActionContext && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-3.5 h-3.5 text-fuchsia-400" />
                    <h3 className="text-white text-xs font-semibold">Invite-Only Event</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotifActionContext.hostName && (
                      <MetricRow label="Host" value={selectedNotifActionContext.hostName} />
                    )}
                    {selectedNotifActionContext.city && (
                      <MetricRow label="City" value={selectedNotifActionContext.city} />
                    )}
                    {selectedNotifActionContext.eventType && (
                      <MetricRow label="Event Type" value={selectedNotifActionContext.eventType} />
                    )}
                    {selectedNotifActionContext.eventId && (
                      <MetricRow label="Event" value={selectedNotifActionContext.eventId} />
                    )}
                  </div>
                </div>
              )}

              {/* LoopTok Duet Detail */}
              {selectedNotif.type === 'LOOPTOK_DUET' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <h3 className="text-white text-xs font-semibold">LoopTok</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.platform && (
                      <MetricRow label="Platform" value={selectedNotif.metrics.platform} />
                    )}
                    {selectedNotif.metrics.post_id && (
                      <MetricRow label="Post" value={selectedNotif.metrics.post_id} />
                    )}
                    {selectedNotif.metrics.actor_id && (
                      <MetricRow label="Creator" value={selectedNotif.metrics.actor_id} />
                    )}
                  </div>
                </div>
              )}

              {/* Social Detail — legacy SOCIAL type */}
              {selectedNotif.type === 'SOCIAL' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <h3 className="text-white text-xs font-semibold">Social Media</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.social_revenue || 0) > 0 && (
                      <MetricRow label="Ad Revenue" value={`$${selectedNotif.metrics.social_revenue?.toLocaleString()}`} positive />
                    )}
                    {(selectedNotif.metrics.social_fan_growth || 0) > 0 && (
                      <MetricRow label="Social Followers" value={`+${selectedNotif.metrics.social_fan_growth}`} positive />
                    )}
                    {(selectedNotif.metrics.fan_growth || 0) > 0 && (
                      <MetricRow label="New Fans" value={`+${selectedNotif.metrics.fan_growth?.toLocaleString()}`} positive />
                    )}
                  </div>
                </div>
              )}

              {/* Achievement Detail */}
              {selectedNotif.type === 'ACHIEVEMENT' && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                    <h3 className="text-white text-xs font-semibold">Achievement</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.milestone_name && (
                      <MetricRow label="Milestone" value={selectedNotif.metrics.milestone_name} />
                    )}
                    {selectedNotif.metrics.milestone_type && (
                      <MetricRow label="Type" value={selectedNotif.metrics.milestone_type.replace(/_/g, ' ')} />
                    )}
                    {(selectedNotif.metrics.social_revenue || 0) > 0 && (
                      <MetricRow label="Ad Revenue" value={`$${selectedNotif.metrics.social_revenue?.toLocaleString()}`} positive />
                    )}
                  </div>
                </div>
              )}

              {/* Xpress Interaction Detail */}
              {selectedNotif.type?.startsWith('XPRESS_') && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedNotif.type === 'XPRESS_LIKE' && <Heart className="w-3.5 h-3.5 text-red-400" />}
                    {selectedNotif.type === 'XPRESS_COMMENT' && <MessageCircle className="w-3.5 h-3.5 text-violet-400" />}
                    {selectedNotif.type === 'XPRESS_REPOST' && <Repeat2 className="w-3.5 h-3.5 text-green-400" />}
                    {selectedNotif.type === 'XPRESS_FOLLOW' && <UserPlus className="w-3.5 h-3.5 text-pink-400" />}
                    <h3 className="text-white text-xs font-semibold">Xpress Activity</h3>
                  </div>
                  <div className="space-y-1">
                    {(selectedNotif.metrics.liker_name || selectedNotif.metrics.commenter_name || selectedNotif.metrics.reposter_name || selectedNotif.metrics.follower_name) && (
                      <MetricRow label="From" value={selectedNotif.metrics.liker_name || selectedNotif.metrics.commenter_name || selectedNotif.metrics.reposter_name || selectedNotif.metrics.follower_name} />
                    )}
                  </div>
                </div>
              )}

              {/* Collaboration Detail */}
              {selectedNotif.type?.startsWith('COLLABORATION_') && selectedNotif.metrics && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Handshake className="w-3.5 h-3.5 text-indigo-400" />
                    <h3 className="text-white text-xs font-semibold">Collaboration</h3>
                  </div>
                  <div className="space-y-1">
                    {selectedNotif.metrics.collaboration_type && (
                      <MetricRow label="Type" value={selectedNotif.metrics.collaboration_type} />
                    )}
                    {selectedNotif.metrics.partner_name && (
                      <MetricRow label="Artist" value={selectedNotif.metrics.partner_name} />
                    )}
                    {selectedNotif.metrics.status && (
                      <MetricRow label="Status" value={selectedNotif.metrics.status.replace(/_/g, ' ')} />
                    )}
                  </div>
                </div>
              )}

              {/* Generic Highlight Metrics (fallback for HIGHLIGHT and other types) */}
              {selectedNotif.type === 'HIGHLIGHT' && selectedNotif.metrics && Object.keys(selectedNotif.metrics).length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3">
                  <h3 className="text-white text-xs font-semibold mb-2">Details</h3>
                  <div className="space-y-1">
                    {Object.entries(selectedNotif.metrics).filter(([, v]) => v != null).map(([key, value]) => (
                      <MetricRow 
                        key={key}
                        label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        value={typeof value === 'number' ? (value > 0 ? `+${value.toLocaleString()}` : String(value)) : String(value ?? '')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedNotif._inviteResolved && (
                <div className={`rounded-lg border p-2.5 text-xs font-medium ${selectedNotif._inviteResolved === 'decline' || selectedNotif._inviteResolved === 'dismissed'
                  ? 'bg-red-500/10 border-red-400/25 text-red-100'
                  : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-100'
                }`}>
                  {selectedNotif._inviteResolved === 'accept' && 'Request accepted.'}
                  {selectedNotif._inviteResolved === 'accepted' && 'Invitation accepted.'}
                  {selectedNotif._inviteResolved === 'decline' && 'Request declined.'}
                  {selectedNotif._inviteResolved === 'dismissed' && 'Invitation marked read.'}
                </div>
              )}

              {selectedNotif.type === 'COLLABORATION_REQUEST' && selectedNotifActionContext?.collaborationId && !selectedNotif._inviteResolved && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleCollaborationRequestResponse(selectedNotif, 'accept')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-400/30 rounded-lg p-2.5 text-emerald-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Accept Request'}
                  </button>
                  <button
                    onClick={() => handleCollaborationRequestResponse(selectedNotif, 'decline')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-red-400/30 rounded-lg p-2.5 text-red-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Decline'}
                  </button>
                </div>
              )}

              {selectedNotif.type === 'TOUR_INVITE' && selectedNotifActionContext?.invitationId && !selectedNotif._inviteResolved && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleTourInviteResponse(selectedNotif, 'accept')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-400/30 rounded-lg p-2.5 text-emerald-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Accept Invite'}
                  </button>
                  <button
                    onClick={() => handleTourInviteResponse(selectedNotif, 'decline')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-red-400/30 rounded-lg p-2.5 text-red-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Decline'}
                  </button>
                </div>
              )}

              {selectedNotif.type === 'TOURING_INVITE' && (selectedNotifMetrics.invite_id || selectedNotifMetrics.support_invite_id || selectedNotifPayload.invite_id || selectedNotifPayload.support_invite_id) && !selectedNotif._inviteResolved && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleTourSupportInviteResponse(selectedNotif, 'accept')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-400/30 rounded-lg p-2.5 text-emerald-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Accept Invite'}
                  </button>
                  <button
                    onClick={() => handleTourSupportInviteResponse(selectedNotif, 'decline')}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-red-400/30 rounded-lg p-2.5 text-red-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Decline'}
                  </button>
                </div>
              )}

              {selectedNotif.type === 'event_invitation' && selectedNotifActionContext?.eventId && !selectedNotif._inviteResolved && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleEventInvitationAccept(selectedNotif)}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-400/30 rounded-lg p-2.5 text-emerald-100 text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Attend Event'}
                  </button>
                  <button
                    onClick={async () => {
                      setActionLoading(selectedNotif.id);
                      try {
                        await markAsRead(selectedNotif);
                        setSelectedNotif((prev) => prev ? { ...prev, _inviteResolved: 'dismissed' } : prev);
                        await loadNotifications();
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    disabled={actionLoading === selectedNotif.id}
                    className="w-full bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-60 disabled:cursor-not-allowed border border-white/[0.08] rounded-lg p-2.5 text-white text-xs font-semibold transition-colors"
                  >
                    {actionLoading === selectedNotif.id ? 'Working...' : 'Mark Read'}
                  </button>
                </div>
              )}

              {/* Deep Links — supports both object { page, tab } and array [{ label, route, params }] */}
              {selectedNotif.deep_links && (() => {
                const dl = selectedNotif.deep_links;
                const links = Array.isArray(dl) ? dl
                  : (dl.page ? [{ label: `Open ${dl.tab || dl.page}`, route: dl.page, params: { tab: dl.tab, ...(dl.region ? { region: dl.region } : {}) } }] : []);
                return links.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {links.map((link, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleDeepLink(link)}
                        className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg p-2.5 flex items-center justify-between transition-colors"
                      >
                        <span className="text-white text-xs font-medium">{link.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}

              {selectedNotif.type === 'RADIO_DISCOVERY' && !selectedNotif._radioResolved && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleRadioDiscoveryResponse(selectedNotif, 'accept')}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg p-2.5 text-emerald-100 text-xs font-semibold transition-colors"
                  >
                    Accept Offer
                  </button>
                  <button
                    onClick={() => handleRadioDiscoveryResponse(selectedNotif, 'decline')}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg p-2.5 text-red-100 text-xs font-semibold transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleBackdropClick}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
      >
        {/* Panel */}
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="fixed right-4 top-1/2 -translate-y-1/2 w-[min(420px,92vw)] max-h-[min(640px,80vh)] bg-[#111118] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col z-[61]"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="bg-[#111118] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-white text-base font-bold">Notifications</h1>
              <p className="text-[10px] text-gray-500">
                {unreadCount > 0 ? `${unreadCount} unread` : 'Inbox caught up'}
                {totalCount > notifications.length ? ` · showing ${notifications.length} of ${totalCount}` : totalCount > 0 ? ` · ${totalCount} total` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    title="Mark all as read"
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <CheckCheck className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={clearAll}
                    title="Clear all notifications"
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>
                </>
              )}
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* List - Scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">No notifications yet</p>
              </div>
            )}

            {!loading && [...notifications].sort((a, b) => {
              // BUG 7 FIX: Only pin unread notifications; read pinned notifications fall to normal sort order
              const isPinnedA = PINNED_NOTIFICATION_TYPES.has(a.type) && !a.is_read ? 1 : 0;
              const isPinnedB = PINNED_NOTIFICATION_TYPES.has(b.type) && !b.is_read ? 1 : 0;
              if (isPinnedA !== isPinnedB) return isPinnedB - isPinnedA;
              // Pin collab notifications at top (only if unread for consistency)
              const isCollabA = a.type?.startsWith('COLLABORATION_') && !a.is_read ? 1 : 0;
              const isCollabB = b.type?.startsWith('COLLABORATION_') && !b.is_read ? 1 : 0;
              if (isCollabA !== isCollabB) return isCollabB - isCollabA;
              // Then unread before read
              if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
              return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            }).map((notif) => {
              const Icon = getNotifIcon(notif.type);
              return (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full hover:bg-white/[0.06] border rounded-xl p-3 flex items-start gap-3 transition-colors text-left ${
                    notif.is_read 
                      ? 'bg-white/[0.02] border-white/[0.04]' 
                      : 'bg-white/[0.04] border-white/[0.06]'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotifColors(notif.type).bg}`}>
                    <Icon className={`w-4 h-4 ${getNotifColors(notif.type).text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3 className={`text-sm truncate ${notif.is_read ? 'text-gray-300 font-medium' : 'text-white font-semibold'}`}>
                        {normalizeTitle(notif.title)}
                      </h3>
                      {!notif.is_read && (
                        <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    {notif.subtitle && (
                      <p className="text-gray-400 text-xs mb-1 line-clamp-1">{notif.subtitle}</p>
                    )}
                    <p className="text-gray-500 text-[10px]">
                      {formatRelativeTurnLabel(notif, currentTurnIndex, TURNS_PER_GAME_DAY)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
                </button>
              );
            })}

            {!loading && totalCount > notifications.length && (
              <button
                type="button"
                onClick={loadOlderNotifications}
                disabled={loadingMore}
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading older notifications...' : `Load older notifications (${totalCount - notifications.length} remaining)`}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MetricRow({ label, value, positive = undefined }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-gray-400 text-[11px]">{label}</span>
      <span className={`text-xs font-semibold ${
        positive === true ? 'text-green-400' : 
        positive === false ? 'text-red-400' : 'text-white'
      }`}>
        {value}
      </span>
    </div>
  );
}
