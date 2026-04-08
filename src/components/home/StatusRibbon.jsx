import React, { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Settings, Zap, Lightbulb, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { AnimatePresence } from "framer-motion";
import { supabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import NotificationInbox from "../notifications/NotificationInbox";
import { reportError } from "../errorReporting";
import { formatInGameDate, calculateNextTurnDiffMs, formatCountdown } from "../utils/turnMath";
import { NOTIFICATION_POLL_INTERVAL_MS } from "../notifications/notificationConfig";


function fmtMoney(n) {
  const v = Math.round(n ?? 0);
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

export default function StatusRibbon({ profile, compact = false }) {
  const [showInbox, setShowInbox] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [turnTimestamp, setTurnTimestamp] = useState(null);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnStatus, setTurnStatus] = useState('idle');
  const [displayProfile, setDisplayProfile] = useState(profile);
  const closeInbox = useCallback(() => setShowInbox(false), []);
  const turnTriggerRef = useRef(false);
  const lastTriggeredTurnRef = useRef(-1);
  const payloadLoggedRef = useRef(false); // Ref to avoid spamming console logs

  const isDemoMode = () => localStorage.getItem("dev_demo_mode") === "1";
  const isFallbackProfileId = (id) => typeof id === "string" && id.startsWith("fallback-");

  /**
   * Normalized bootstrap function that handles different response shapes
   * Returns: { artistProfile: object|null, fanProfile: object|null, player: object|null }
   */
  async function bootstrapArtistProfile(userAccountId) {
    try {
      // Defensive: check if base44.entities exists
      if (!base44?.entities) {
        console.warn('[StatusRibbon] base44.entities is undefined');
        return { artistProfile: null, fanProfile: null, player: null };
      }

      // Try different entity keys that might exist
      let profiles = null;
      
      // Try ArtistProfile first (legacy)
      if (base44.entities.ArtistProfile) {
        profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      }
      // Fall back to profiles (current entity adapter)
      else if (base44.entities.profiles) {
        profiles = await base44.entities.profiles.filter({ user_account_id: userAccountId });
      }
      
      // Handle different response shapes
      let artistProfile = null;
      
      if (Array.isArray(profiles)) {
        // Direct array response
        artistProfile = profiles[0] || null;
      } else if (profiles?.data && Array.isArray(profiles.data)) {
        // Supabase { data, error } response
        artistProfile = profiles.data[0] || null;
      } else if (profiles?.length > 0) {
        // Array-like object
        artistProfile = profiles[0] || null;
      } else {
        console.warn('[StatusRibbon] Unexpected profiles response shape:', profiles);
        artistProfile = null;
      }

      // Load related data if artist profile found
      let fanProfile = null;
      let player = null;
      
      if (artistProfile?.id) {
        try {
          // Try fan profiles
          if (base44.entities.fan_profiles) {
            fanProfile = await base44.entities.fan_profiles.filter({ artist_id: artistProfile.id });
            fanProfile = Array.isArray(fanProfile) ? fanProfile[0] : fanProfile?.data?.[0] || null;
          }
          
          // Try player account
          if (base44.entities.players) {
            player = await base44.entities.players.get(userAccountId);
          }
        } catch (err) {
          console.warn('[StatusRibbon] Failed to load related data:', err);
        }
      }

      return {
        artistProfile,
        fanProfile,
        player
      };
    } catch (error) {
      console.error('[StatusRibbon] Bootstrap failed:', error);
      return { artistProfile: null, fanProfile: null, player: null };
    }
  }

  useEffect(() => {
    setDisplayProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (profile?.id) return;

    let mounted = true;
    const bootstrapProfile = async () => {
      try {
        if (isDemoMode()) return;
        const userAccountId = localStorage.getItem("user_account_id");
        if (!userAccountId) return;
        
        // Ensure base44 is ready before proceeding
        if (!base44?.entities) {
          console.error('[StatusRibbon] base44.entities not available - skipping bootstrap');
          return;
        }
        
        // Payload shape verified - removed debug logging
        
        // Defensive bootstrap with normalized response
        const result = await bootstrapArtistProfile(userAccountId);
        if (mounted && result.artistProfile) {
          setDisplayProfile(result.artistProfile);
        }
      } catch (error) {
        if (mounted) {
          console.warn('[StatusRibbon] Bootstrap error:', error);
          reportError({ scope: "StatusRibbon", message: "Failed to bootstrap profile", error });
        }
      }
    };

    bootstrapProfile();
    return () => {
      mounted = false;
    };
  }, [profile?.id]);

  // Update clock every second for countdown display
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-trigger turn engine when countdown expires
  useEffect(() => {
    if (!displayProfile?.id || !turnTimestamp || isDemoMode() || isFallbackProfileId(displayProfile?.id)) return;
    // Never trigger if already processing or if trigger lock is active
    if (turnStatus === 'processing' || turnTriggerRef.current) return;
    const diffMs = calculateNextTurnDiffMs(turnTimestamp, 0, now);
    // Only trigger when countdown expires AND we haven't already triggered this turn
    if (diffMs <= 0 && lastTriggeredTurnRef.current !== currentTurnIndex) {
      turnTriggerRef.current = true;
      lastTriggeredTurnRef.current = currentTurnIndex;
      setTurnStatus('processing');
      base44.functions.invoke('turnEngine', {}).then((res) => {
        // base44.functions.invoke already unwraps { data, error } — res IS the data directly
        // Accept success, partial_success (some players failed but turn advanced), or skipped
        // The cron scheduler is now the primary trigger, but frontend can still trigger as backup
        if (res?.status === 'success' || res?.status === 'partial_success' || res?.status === 'skipped') {
          // Turn processed or was already handled — poll will pick up new state
          if (res?.status === 'partial_success') {
            console.warn('[StatusRibbon] Turn advanced with some player failures:', res?.players_failed);
          }
        }
      }).catch((err) => {
        console.warn('[StatusRibbon] Turn engine invoke failed:', err?.message);
      }).finally(() => {
        // 60s cooldown prevents re-triggering during the same processing cycle
        setTimeout(() => { turnTriggerRef.current = false; }, 60000);
      });
    }
  }, [now, turnTimestamp, displayProfile?.id, turnStatus, currentTurnIndex]);

  useEffect(() => {
    if (!displayProfile?.id || !isSupabaseConfigured || isDemoMode() || isFallbackProfileId(displayProfile?.id)) return;

    let isActive = true;
    let prevTurnId = currentTurnIndex;

    const loadTurnState = async () => {
      try {
        const { data } = await supabaseClient
          .from('turn_state')
          .select('global_turn_id,current_turn_id,turn_timestamp,status')
          .eq('id', 1)
          .maybeSingle();
        if (isActive && data) {
          setTurnTimestamp(data.turn_timestamp);
          setCurrentTurnIndex(data.global_turn_id ?? data.current_turn_id ?? 0);
          setTurnStatus(data.status || 'idle');
          // Reset trigger when turn advances (completed or partial_success)
          if (data.status === 'completed' || data.status === 'partial_success' || data.status === 'idle') {
            turnTriggerRef.current = false;
          }
          const nextTurnId = data.global_turn_id ?? data.current_turn_id ?? 0;
          // If turn advanced, notify other components to refresh
          if (nextTurnId > prevTurnId && prevTurnId > 0) {
            prevTurnId = nextTurnId;
            window.dispatchEvent(new CustomEvent('turnAdvanced', { detail: { turnId: nextTurnId } }));
          }
          prevTurnId = nextTurnId;

          const activeProfileId = displayProfile?.id;
          if (activeProfileId) {
            // Use defensive entity access
            let latestProfile = null;
            if (base44.entities.ArtistProfile) {
              latestProfile = await base44.entities.ArtistProfile.get(activeProfileId);
            } else if (base44.entities.profiles) {
              latestProfile = await base44.entities.profiles.get(activeProfileId);
            }
            
            if (latestProfile) {
              setDisplayProfile(latestProfile);
              window.dispatchEvent(new CustomEvent('profileUpdated', { detail: latestProfile }));
            }
          }
        }
      } catch (error) {
        if (isActive) {
          reportError({ scope: "StatusRibbon", message: "Failed to load turn state", error });
        }
      }
    };

    loadTurnState();
    const interval = setInterval(loadTurnState, 10000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [displayProfile?.id]);

  useEffect(() => {
    if (!displayProfile?.id || !isSupabaseConfigured || isDemoMode() || isFallbackProfileId(displayProfile?.id)) {
      setUnreadCount(0);
      return;
    }

    let isActive = true;
    const loadUnreadCount = async () => {
      try {
        const { count } = await supabaseClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', displayProfile.id)
          .eq('is_read', false);
        if (isActive) setUnreadCount(count || 0);
      } catch (error) {
        if (isActive) reportError({ scope: "StatusRibbon", message: "Failed to load notifications", error });
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [displayProfile?.id]);

  // Date display is derived strictly from turn index (no wall-clock date conversion).
  const diffMs = calculateNextTurnDiffMs(turnTimestamp, 0, now);
  const turnTimer = diffMs <= 0 ? 'Processing...' : formatCountdown(diffMs);
  const currentDate = formatInGameDate(currentTurnIndex);

  // Fallback UI when no profile is loaded
  if (!displayProfile) {
    return (
      <div className={`bg-[#111118]/90 backdrop-blur-xl px-4 ${compact ? "pt-[env(safe-area-inset-top)] pb-2.5" : "sticky top-0 z-50 border-b border-white/[0.04] pt-[env(safe-area-inset-top)] pb-2.5"}`}>
        <div className="flex items-center justify-between max-w-[var(--app-max-content-width)] mx-auto">
          {/* Timer */}
          <div className="flex flex-col">
            <span className="text-gray-200 text-[11px] font-medium">{currentDate}</span>
            <span className="text-gray-500 text-[9px]">Next Turn: {turnTimer}</span>
          </div>

          {/* No Profile Message */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs">No profile loaded</span>
            <span className="text-gray-600 text-[10px]">Turn {currentTurnIndex}</span>
          </div>

          {/* Income */}
          <div className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-bold">{fmtMoney(1000)}</span>
          </div>

          {/* Icons */}
          <div className="flex items-center gap-2">
            <button
              disabled
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 cursor-not-allowed"
              title="Notifications unavailable - no profile"
            >
              <Bell className="w-4 h-4" />
            </button>
            <Link
              to="/Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#111118]/90 backdrop-blur-xl px-4 ${compact ? "pt-[env(safe-area-inset-top)] pb-2.5" : "sticky top-0 z-50 border-b border-white/[0.04] pt-[env(safe-area-inset-top)] pb-2.5"}`}>
      <div className="flex items-center justify-between max-w-[var(--app-max-content-width)] mx-auto">
        {/* Timer */}
        <div className="flex flex-col">
          <span className="text-gray-200 text-[11px] font-medium">{currentDate}</span>
          <span className="text-gray-500 text-[9px]">Next Turn: {turnTimer}</span>
        </div>

        {/* Energy & Inspiration & Income — all on one line */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <span className="text-green-400 text-xs font-semibold">{displayProfile?.energy ?? 100}</span>
            <span className="text-gray-600 text-[10px]">/{displayProfile?.max_energy ?? 100}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Lightbulb className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
            <span className="text-pink-400 text-xs font-semibold">{displayProfile?.inspiration ?? 20}</span>
            <span className="text-gray-600 text-[10px]">/100</span>
          </div>
          <div className="flex items-center gap-0.5">
            <DollarSign className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            <span className="text-yellow-400 text-xs font-bold whitespace-nowrap">{fmtMoney(displayProfile?.income ?? 1000)}</span>
          </div>
        </div>

        {/* Icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!displayProfile) return;
              setShowInbox(true);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!displayProfile}
            aria-disabled={!displayProfile}
          >
            <Bell className="w-5 h-5 text-gray-400" />
            {unreadCount > 0 && (
              <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1">
                <span className="text-white text-[9px] font-bold leading-none">{unreadCount}</span>
              </div>
            )}
          </button>
          <Link to={createPageUrl("Settings")} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
            <Settings className="w-4 h-4 text-gray-400" />
          </Link>
        </div>
      </div>

      {/* Notification Inbox */}
      <AnimatePresence>
        {showInbox && (
          <NotificationInbox 
            profile={displayProfile} 
            onClose={closeInbox}
            onUnreadCountChange={setUnreadCount}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
