import React, { useState, useEffect, useRef } from "react";
import { Send, ArrowLeft, Heart, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import { ProfileAvatar, fmtNum, timeAgo } from "./XpressShared";

/* ═══════════════════════════════════════════════════════
   QUOTE POST MODAL
   Small centered floating dialog to add a quote message
   ═══════════════════════════════════════════════════════ */
export function QuotePostModal({ post, postAuthor, profile, onClose, onQuoteCreated }) {
  const [quoteText, setQuoteText] = useState("");
  const [posting, setPosting] = useState(false);
  const textRef = useRef(null);

  const previewName = postAuthor?.artist_name || post?.metadata?.media_outlet_name || post?.metadata?.platform_name || post?.metadata?.npc_username || "Unknown";
  const previewAvatar = postAuthor?.artist_image || post?.metadata?.platform_pfp || null;

  useEffect(() => { textRef.current?.focus(); }, []);

  const handleQuote = async () => {
    if (!quoteText.trim() || !profile?.id || !post?.id || posting) return;
    setPosting(true);
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'xpressQuote',
        postId: post.id,
        playerId: profile.id,
        quoteText: quoteText,
      });

      const quotePayload = result?.success ? result : result?.data;
      if (result?.error || !quotePayload?.success) {
        console.error("[Xpress] Quote error:", quotePayload?.error || result?.error);
        setPosting(false);
        return;
      }

      onQuoteCreated?.(quotePayload?.data?.quotePost || quotePayload?.quotePost);
      onClose();
    } catch (e) {
      console.error("[Xpress] Quote post error:", e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#1a1a24] rounded-2xl border border-white/[0.08] overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 text-center">
          <MessageSquare className="w-7 h-7 text-red-400 mx-auto mb-2" />
          <h3 className="text-white text-base font-bold">Quote Post</h3>
          <p className="text-gray-500 text-[12px] mt-1">Add your thoughts about this post:</p>
        </div>

        {/* Original post preview */}
        <div className="mx-4 mb-3 p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-1.5 mb-1">
            <ProfileAvatar src={previewAvatar} alt={previewName} size="sm" />
            <span className="text-white text-[11px] font-bold truncate">{previewName}</span>
          </div>
          <p className="text-gray-400 text-[11px] line-clamp-2">{post?.caption || post?.title || ""}</p>
        </div>

        <div className="px-4 pb-3">
          <textarea
            ref={textRef}
            value={quoteText}
            onChange={(e) => { if (e.target.value.length <= 280) setQuoteText(e.target.value); }}
            placeholder="What do you think?"
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-[14px] p-3 outline-none resize-none placeholder-gray-600 focus:border-red-400/40"
          />
          <div className="text-right mt-1">
            <span className={`text-[10px] ${quoteText.length > 250 ? "text-red-400" : "text-gray-600"}`}>{quoteText.length}/280</span>
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.05] text-white text-[13px] font-semibold hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleQuote}
            disabled={!quoteText.trim() || posting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold disabled:opacity-40 hover:bg-red-500 transition-colors"
          >
            {posting ? "..." : "Quote"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   COMMENTS THREAD
   Full-screen overlay showing comments on a post
   ═══════════════════════════════════════════════════════ */
export function CommentsThread({ post, postAuthor, profile, profileMap, onClose, onProfileClick }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const previewName = postAuthor?.artist_name || post?.metadata?.media_outlet_name || post?.metadata?.platform_name || post?.metadata?.npc_username || "Unknown";
  const previewAvatar = postAuthor?.artist_image || post?.metadata?.platform_pfp || null;

  useEffect(() => {
    if (post?.id) loadComments();
  }, [post?.id]);

  const loadComments = async () => {
    try {
      const { data } = await supabaseClient
        .from("xpress_comments")
        .select("*")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true })
        .limit(50);
      setComments(data || []);

      // Load any missing author profiles
      const authorIds = [...new Set((data || []).map(c => c.author_id).filter(Boolean))];
      if (authorIds.length > 0) {
        const missingIds = authorIds.filter(id => !profileMap[id]);
        if (missingIds.length > 0) {
          const { data: profiles } = await supabaseClient.from("profiles").select("*").in("id", missingIds);
          // profileMap is read-only here, but we store locally
          (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }
      }
    } catch (e) {
      console.error("[Xpress] Load comments error:", e);
    } finally {
      setLoading(false);
    }
  };

  const sendComment = async () => {
    if (!newComment.trim() || !profile?.id || !post?.id || sending) return;
    setSending(true);
    try {
      const result = await base44.functions.invoke('socialMedia', {
        action: 'xpressComment',
        postId: post.id,
        playerId: profile.id,
        content: newComment.trim(),
        postOwnerId: post.artist_id,
      });

      const commentPayload = result?.success ? result : result?.data;
      if (result?.error || !commentPayload?.success) {
        console.error("[Xpress] Comment error:", commentPayload?.error || result?.error);
        setSending(false);
        return;
      }

      setComments(prev => [...prev, commentPayload?.data?.comment || commentPayload?.comment]);
      setNewComment("");

      // Scroll to bottom
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
    } catch (e) {
      console.error("[Xpress] Send comment error:", e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendComment();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[65] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h2 className="text-white text-base font-bold flex-1">Comments</h2>
      </div>

      {/* Original post preview */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex gap-2.5">
          <ProfileAvatar src={previewAvatar} alt={previewName} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-white text-[13px] font-bold">{previewName}</span>
              <span className="text-gray-500 text-[11px]">{timeAgo(post?.created_at)}</span>
            </div>
            <p className="text-gray-300 text-[13px] leading-[1.3] mt-0.5 line-clamp-3">
              {post?.caption || post?.title || ""}
            </p>
            {post?.thumbnail_url && (
              <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.06] max-h-32">
                <img src={post.thumbnail_url} alt="" className="w-full object-cover max-h-32" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-8">
            <MessageSquare className="w-8 h-8 text-gray-700 mb-3" />
            <p className="text-gray-400 text-sm font-semibold">No comments yet</p>
            <p className="text-gray-600 text-[11px] mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {comments.map((comment) => {
              const author = profileMap[comment.author_id];
              return (
                <div key={comment.id} className="px-4 py-3">
                  <div className="flex gap-2.5">
                    <button onClick={() => onProfileClick?.(comment.author_id)} className="flex-shrink-0">
                      <ProfileAvatar src={author?.artist_image} alt={author?.artist_name} size="sm" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onProfileClick?.(comment.author_id)}
                          className="text-white text-[12px] font-bold hover:underline"
                        >
                          {author?.artist_name || "Unknown"}
                        </button>
                        <span className="text-gray-500 text-[11px]">
                          {author?.xpress_handle ? `@${author.xpress_handle}` : ""}
                        </span>
                        <span className="text-gray-600 text-[10px]">{timeAgo(comment.created_at)}</span>
                      </div>
                      <p className="text-gray-200 text-[13px] leading-[1.4] mt-0.5 whitespace-pre-wrap">
                        {comment.content}
                      </p>
                      <div className="flex items-center gap-4 mt-1.5">
                        <button className="flex items-center gap-1 text-gray-600 hover:text-red-400 transition-colors">
                          <Heart className="w-3 h-3" />
                          <span className="text-[10px]">{comment.likes > 0 ? fmtNum(comment.likes) : ""}</span>
                        </button>
                        <button className="text-gray-600 text-[10px] hover:text-gray-400">Reply</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose comment */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0 flex items-center gap-3">
        <ProfileAvatar src={profile?.artist_image} alt={profile?.artist_name} size="sm" />
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={newComment}
            onChange={(e) => { if (e.target.value.length <= 280) setNewComment(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-full text-white text-[13px] px-4 py-2.5 outline-none placeholder-gray-600 focus:border-red-400/30 pr-10"
          />
          {newComment.trim() && (
            <button
              onClick={sendComment}
              disabled={sending}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
