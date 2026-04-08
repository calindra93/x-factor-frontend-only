import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, Search, Send, Image, Info, X, User, BellOff, Ban, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { ProfileAvatar, TopNavigationBar, timeAgo, loadProfileMap, getOrCreateConversation } from "./XpressShared";

/* ═══════════════════════════════════════════════════════
   MESSAGES LIST VIEW
   ═══════════════════════════════════════════════════════ */
export default function XpressMessages({ profile, profileMap, currentPlayerId, onProfileClick, onBack }) {
  const [conversations, setConversations] = useState([]);
  const [convoProfiles, setConvoProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeThread, setActiveThread] = useState(null); // { convo, otherProfile }
  const [showNewMessage, setShowNewMessage] = useState(false);

  useEffect(() => { loadConversations(); }, [currentPlayerId]);

  const loadConversations = async () => {
    if (!currentPlayerId) { setLoading(false); return; }
    try {
      const { data } = await supabaseClient
        .from("xpress_conversations")
        .select("*")
        .or(`participant_a.eq.${currentPlayerId},participant_b.eq.${currentPlayerId}`)
        .order("last_message_at", { ascending: false });

      const convos = data || [];
      setConversations(convos);

      // Load profiles for all participants
      const pids = new Set();
      convos.forEach(c => { pids.add(c.participant_a); pids.add(c.participant_b); });
      pids.delete(currentPlayerId);
      const pMap = await loadProfileMap([...pids]);
      setConvoProfiles({ ...profileMap, ...pMap });
    } catch (e) { console.warn("[XpressMsg] Load error:", e?.message); }
    finally { setLoading(false); }
  };

  const getOtherParticipant = (convo) => {
    const otherId = convo.participant_a === currentPlayerId ? convo.participant_b : convo.participant_a;
    return { id: otherId, profile: convoProfiles[otherId] || {} };
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c => {
      const other = getOtherParticipant(c);
      return (
        (other.profile.artist_name || "").toLowerCase().includes(q) ||
        (c.last_message_preview || "").toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery, convoProfiles]);

  const handleStartNewConversation = async (targetId) => {
    try {
      const { data: convo } = await getOrCreateConversation(currentPlayerId, targetId);
      if (convo) {
        const pMap = await loadProfileMap([targetId]);
        setConvoProfiles(prev => ({ ...prev, ...pMap }));
        setActiveThread({ convo, otherProfile: pMap[targetId] || {} });
        setShowNewMessage(false);
      }
    } catch (e) { console.warn("[XpressMsg] New convo error:", e?.message); }
  };

  // If a thread is active, show the thread view
  if (activeThread) {
    return (
      <MessageThread
        convo={activeThread.convo}
        otherProfile={activeThread.otherProfile}
        currentPlayerId={currentPlayerId}
        onBack={() => { setActiveThread(null); loadConversations(); }}
        onProfileClick={onProfileClick}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopNavigationBar
        leftContent={
          <ProfileAvatar src={profile?.artist_image} alt={profile?.artist_name} size="sm" />
        }
        title="Messages"
      />

      {/* Search */}
      <div className="px-4 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Direct Messages"
            className="flex-1 bg-transparent text-white text-[13px] placeholder-gray-500 outline-none"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <Send className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm font-semibold">No messages yet</p>
            <p className="text-gray-600 text-[11px] mt-1">Start a conversation with another artist</p>
          </div>
        ) : (
          filtered.map((convo) => {
            const other = getOtherParticipant(convo);
            const handle = other.profile?.xpress_handle
              ? `@${other.profile.xpress_handle}`
              : `@${(other.profile?.artist_name || "").replace(/\s+/g, "")}`;

            return (
              <button
                key={convo.id}
                onClick={() => setActiveThread({ convo, otherProfile: other.profile })}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] text-left hover:bg-white/[0.02] transition-colors"
              >
                <ProfileAvatar src={other.profile?.artist_image} alt={other.profile?.artist_name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-[13px] font-bold truncate">{other.profile?.artist_name || "Unknown"}</span>
                    <span className="text-gray-500 text-[12px] truncate">{handle}</span>
                    <span className="text-gray-600 text-[11px] flex-shrink-0 ml-auto">{timeAgo(convo.last_message_at)}</span>
                  </div>
                  <p className="text-gray-400 text-[12px] truncate mt-0.5">{convo.last_message_preview || "No messages yet"}</p>
                </div>
                {/* Unread dot — simplified, a blue dot if recent */}
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
              </button>
            );
          })
        )}
      </div>

      {/* FAB — New message */}
      <button
        onClick={() => setShowNewMessage(true)}
        className="absolute bottom-20 right-4 w-14 h-14 rounded-full bg-red-600 shadow-lg shadow-red-600/30 flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95 z-10"
      >
        <Send className="w-5 h-5 text-white" />
      </button>

      {/* New Message Modal */}
      <AnimatePresence>
        {showNewMessage && (
          <NewMessagePicker
            currentPlayerId={currentPlayerId}
            profileMap={profileMap}
            onSelect={handleStartNewConversation}
            onClose={() => setShowNewMessage(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   NEW MESSAGE PICKER — search and select a player to DM
   ═══════════════════════════════════════════════════════ */
function NewMessagePicker({ currentPlayerId, profileMap, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const { data } = await supabaseClient
        .from("profiles")
        .select("id, artist_name, artist_image, xpress_handle, career_stage")
        .neq("id", currentPlayerId)
        .limit(50);
      setAllPlayers(data || []);
    } catch (e) { console.warn("[NewMsg] Load players error:", e?.message); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return allPlayers;
    const q = query.toLowerCase();
    return allPlayers.filter(p =>
      (p.artist_name || "").toLowerCase().includes(q) ||
      (p.xpress_handle || "").toLowerCase().includes(q)
    );
  }, [allPlayers, query]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 400 }} animate={{ y: 0 }} exit={{ y: 400 }}
        transition={{ type: "spring", damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#111118] border-t border-white/[0.08] rounded-t-3xl p-4 max-h-[70vh] flex flex-col"
      >
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-3" />
        <h3 className="text-white font-bold text-base mb-3">New Message</h3>

        <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-3 py-2 mb-3">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players..."
            className="flex-1 bg-transparent text-white text-[13px] placeholder-gray-500 outline-none"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No players found</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
              >
                <ProfileAvatar src={p.artist_image} alt={p.artist_name} size="sm" />
                <div>
                  <p className="text-white text-[13px] font-semibold">{p.artist_name}</p>
                  <p className="text-gray-500 text-[11px]">@{p.xpress_handle || (p.artist_name || "").replace(/\s+/g, "")}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   MESSAGE THREAD — real-time chat between two players
   ═══════════════════════════════════════════════════════ */
function MessageThread({ convo, otherProfile, currentPlayerId, onBack, onProfileClick }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { loadMessages(); }, [convo?.id]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    if (!convo?.id) return;
    try {
      const { data } = await supabaseClient
        .from("xpress_messages")
        .select("*")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages(data || []);

      // Mark unread messages as read
      await supabaseClient
        .from("xpress_messages")
        .update({ is_read: true })
        .eq("conversation_id", convo.id)
        .neq("sender_id", currentPlayerId)
        .eq("is_read", false);
    } catch (e) { console.warn("[MsgThread] Load error:", e?.message); }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !convo?.id || sending) return;
    setSending(true);
    setInputText("");

    // Optimistic update
    const tempMsg = {
      id: `temp-${Date.now()}`,
      conversation_id: convo.id,
      sender_id: currentPlayerId,
      content: text,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data: newMsg } = await supabaseClient
        .from("xpress_messages")
        .insert({
          conversation_id: convo.id,
          sender_id: currentPlayerId,
          content: text,
        })
        .select("*")
        .single();

      // Replace temp with real
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? (newMsg || m) : m));
    } catch (e) {
      console.warn("[MsgThread] Send error:", e?.message);
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setInputText(text);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handle = otherProfile?.xpress_handle
    ? `@${otherProfile.xpress_handle}`
    : `@${(otherProfile?.artist_name || "").replace(/\s+/g, "")}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <TopNavigationBar
        leftIcon={<ArrowLeft className="w-5 h-5 text-gray-400" />}
        onLeftClick={onBack}
        centerContent={
          <button onClick={() => onProfileClick?.(otherProfile?.id)} className="text-center">
            <p className="text-white text-[13px] font-bold">{otherProfile?.artist_name || "Unknown"}</p>
            <p className="text-gray-500 text-[10px]">{handle}</p>
          </button>
        }
        rightIcon={<Info className="w-5 h-5 text-gray-400" />}
        onRightClick={() => setShowInfo(true)}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentPlayerId;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && (
                <ProfileAvatar src={otherProfile?.artist_image} alt={otherProfile?.artist_name} size="sm" />
              )}
              <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                <div className={`rounded-2xl px-3.5 py-2 ${
                  isMine ? "bg-red-600/80 text-white" : "bg-gray-800 text-white"
                }`}>
                  <p className="text-[13px] leading-[1.4] whitespace-pre-wrap">{msg.content}</p>
                </div>
                <p className={`text-gray-600 text-[9px] mt-0.5 ${isMine ? "text-right" : "text-left"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-black/95 flex-shrink-0">
        <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <Image className="w-5 h-5 text-gray-500" />
        </button>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-white/[0.06] rounded-full px-4 py-2.5 text-white text-[13px] placeholder-gray-500 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center disabled:opacity-40 hover:bg-red-500 transition-colors"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Conversation Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <ConversationInfoModal
            otherProfile={otherProfile}
            onClose={() => setShowInfo(false)}
            onProfileClick={onProfileClick}
            convoId={convo?.id}
            currentPlayerId={currentPlayerId}
            onBack={onBack}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CONVERSATION INFO MODAL
   ═══════════════════════════════════════════════════════ */
function ConversationInfoModal({ otherProfile, onClose, onProfileClick, convoId, currentPlayerId, onBack }) {
  const handle = otherProfile?.xpress_handle
    ? `@${otherProfile.xpress_handle}`
    : `@${(otherProfile?.artist_name || "").replace(/\s+/g, "")}`;

  const handleDelete = async () => {
    if (!convoId) return;
    try {
      // Delete all messages first, then conversation
      await supabaseClient.from("xpress_messages").delete().eq("conversation_id", convoId);
      await supabaseClient.from("xpress_conversations").delete().eq("id", convoId);
      onClose();
      onBack();
    } catch (e) { console.warn("[ConvoInfo] Delete error:", e?.message); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center px-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-[#1a1a24] rounded-2xl border border-white/[0.08] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-white text-base font-bold">Conversation Info</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Profile card */}
        <div className="flex items-center gap-3 px-4 py-4 bg-white/[0.02] mx-3 mt-3 rounded-xl">
          <ProfileAvatar src={otherProfile?.artist_image} alt={otherProfile?.artist_name} size="lg" />
          <div>
            <p className="text-white text-[15px] font-bold">{otherProfile?.artist_name || "Unknown"}</p>
            <p className="text-gray-500 text-[12px]">{handle}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 space-y-1">
          <button
            onClick={() => { onClose(); onProfileClick?.(otherProfile?.id); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
          >
            <User className="w-5 h-5 text-gray-400" />
            <span className="text-white text-[14px]">View Profile</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
            <BellOff className="w-5 h-5 text-gray-400" />
            <span className="text-white text-[14px]">Mute Notifications</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
            <Ban className="w-5 h-5 text-gray-400" />
            <span className="text-white text-[14px]">Block User</span>
          </button>
        </div>

        {/* Delete */}
        <div className="px-4 pb-4">
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600/90 text-white text-[14px] font-semibold hover:bg-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Conversation
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
