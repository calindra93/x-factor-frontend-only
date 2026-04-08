import React, { useState, useEffect, useMemo } from "react";
import { Settings, Heart, Repeat2, Bell, UserPlus, AtSign, MessageSquare } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import { ProfileAvatar, TopNavigationBar, XpressTabBar, timeAgo, loadProfileMap } from "./XpressShared";

const NOTIF_TABS = [
  { id: "all", label: "All" },
  { id: "mentions", label: "Mentions" },
  { id: "verified", label: "Verified" },
];

const NOTIF_ICON_MAP = {
  like: { icon: Heart, color: "text-red-400" },
  repost: { icon: Repeat2, color: "text-green-400" },
  mention: { icon: AtSign, color: "text-blue-400" },
  follow: { icon: UserPlus, color: "text-purple-400" },
  reply: { icon: MessageSquare, color: "text-blue-400" },
  tag: { icon: Bell, color: "text-yellow-400" },
  message: { icon: MessageSquare, color: "text-gray-400" },
};

export default function XpressNotifications({ profile, profileMap, currentPlayerId, onProfileClick, onBack }) {
  const [notifTab, setNotifTab] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [actorProfiles, setActorProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, [currentPlayerId]);

  const loadNotifications = async () => {
    if (!currentPlayerId) { setLoading(false); return; }
    try {
      const { data } = await supabaseClient
        .from("xpress_notifications")
        .select("*")
        .eq("recipient_id", currentPlayerId)
        .order("created_at", { ascending: false })
        .limit(50);

      const notifs = data || [];
      setNotifications(notifs);

      // Mark all as read
      if (notifs.some(n => !n.is_read)) {
        await supabaseClient
          .from("xpress_notifications")
          .update({ is_read: true })
          .eq("recipient_id", currentPlayerId)
          .eq("is_read", false);
      }

      // Load actor profiles
      const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))];
      const pMap = await loadProfileMap(actorIds);
      setActorProfiles({ ...profileMap, ...pMap });
    } catch (e) {
      console.warn("[XpressNotifs] Load error:", e?.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (notifTab === "all") return notifications;
    if (notifTab === "mentions") return notifications.filter(n => n.type === "mention" || n.type === "tag");
    if (notifTab === "verified") return notifications.filter(n => {
      const actor = actorProfiles[n.actor_id];
      return actor && (actor.career_stage === "Superstar" || actor.career_stage === "Legend" || actor.career_stage === "Mainstream");
    });
    return notifications;
  }, [notifications, notifTab, actorProfiles]);

  const getNotifText = (notif) => {
    switch (notif.type) {
      case "like": return `liked your post ${notif.preview_text || ""}`;
      case "repost": return `reposted your post ${notif.preview_text || ""}`;
      case "mention": return `mentioned you in a post`;
      case "follow": return `followed you`;
      case "reply": return `replied to your post`;
      case "tag": return `tagged you in a post`;
      case "message": return `sent you a message`;
      default: return `interacted with you`;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <TopNavigationBar
        leftContent={
          <ProfileAvatar src={profile?.artist_image} alt={profile?.artist_name} size="sm" />
        }
        title="Notifications"
        rightIcon={<Settings className="w-5 h-5 text-gray-400" />}
      />

      <XpressTabBar tabs={NOTIF_TABS} activeTab={notifTab} onTabChange={setNotifTab} />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <Bell className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm font-semibold">No notifications yet</p>
            <p className="text-gray-600 text-[11px] mt-1">
              When other players interact with your posts, you'll see it here
            </p>
          </div>
        ) : (
          filtered.map((notif) => {
            const actor = actorProfiles[notif.actor_id] || {};
            const iconInfo = NOTIF_ICON_MAP[notif.type] || NOTIF_ICON_MAP.tag;
            const IconComp = iconInfo.icon;

            return (
              <button
                key={notif.id}
                onClick={() => onProfileClick?.(notif.actor_id)}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] text-left hover:bg-white/[0.02] transition-colors ${
                  !notif.is_read ? "bg-white/[0.02]" : ""
                }`}
              >
                <IconComp className={`w-4 h-4 mt-1 flex-shrink-0 ${iconInfo.color}`} />
                <ProfileAvatar src={actor.artist_image} alt={actor.artist_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[13px]">
                    <strong className="font-bold">{actor.artist_name || "Someone"}</strong>{" "}
                    <span className="text-gray-400">{getNotifText(notif)}</span>
                  </p>
                </div>
                <span className="text-gray-600 text-[11px] flex-shrink-0 mt-0.5">
                  {timeAgo(notif.created_at)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
