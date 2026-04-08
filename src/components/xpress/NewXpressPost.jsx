import React, { useState, useMemo, useRef } from "react";
import { Camera, ChevronDown, X, Megaphone, Check, Image as ImageIcon, Target } from "lucide-react";
import { motion } from "framer-motion";
import { supabaseClient } from "@/lib/supabaseClient";
import { ProfileAvatar } from "./XpressShared";

const PROMO_OPTIONS = [
  {
    id: "general",
    title: "General Promo",
    desc: "Boost visibility across the entire Xpress feed",
    energyCost: 15,
    moneyCost: 500,
    benefits: { popularity: "+20%", hype: "+5" },
  },
  {
    id: "targeted",
    title: "Targeted Promo",
    desc: "Target fans of similar artists and link a release",
    energyCost: 25,
    moneyCost: 1500,
    benefits: { popularity: "+50%", hype: "+12" },
  },
];

export default function NewXpressPost({ profile, account: _account, releases, onClose, onPostCreated }) {
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [charCount, setCharCount] = useState(0);

  // Photo upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const imageInputRef = useRef(null);

  // Promote state
  const [promoteEnabled, setPromoteEnabled] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);
  const [showReleaseSelector, setShowReleaseSelector] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [promoConfigured, setPromoConfigured] = useState(false);

  // @mention autocomplete
  const [, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef(null);

  // Subtweet targeting
  const [subtweetEnabled, setSubtweetEnabled] = useState(false);
  const [subtweetTarget, setSubtweetTarget] = useState(null);
  const [subtweetSearch, setSubtweetSearch] = useState("");
  const [subtweetResults, setSubtweetResults] = useState([]);
  const [alignmentTag, setAlignmentTag] = useState("");

  const maxChars = 280;

  const handleCaptionChange = (e) => {
    const text = e.target.value;
    if (text.length > maxChars) return;
    setCaption(text);
    setCharCount(text.length);

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
      searchPlayers(atMatch[1]);
    } else {
      setShowMentions(false);
    }
  };

  const searchPlayers = async (query) => {
    if (!query || query.length < 1) {
      setMentionResults([]);
      return;
    }
    try {
      const { data } = await supabaseClient
        .from("profiles")
        .select("id, artist_name, artist_image, xpress_handle")
        .neq("id", profile?.id)
        .ilike("artist_name", `%${query}%`)
        .limit(5);
      setMentionResults(data || []);
    } catch { setMentionResults([]); }
  };

  const insertMention = (player) => {
    const handle = player.xpress_handle || (player.artist_name || "").replace(/\s+/g, "");
    const cursorPos = textareaRef.current?.selectionStart || caption.length;
    const textBeforeCursor = caption.substring(0, cursorPos);
    const textAfterCursor = caption.substring(cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const beforeAt = textBeforeCursor.substring(0, atMatch.index);
      const newText = `${beforeAt}@${handle} ${textAfterCursor}`;
      setCaption(newText);
      setCharCount(newText.length);
    }
    setShowMentions(false);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setPostError("Image must be under 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setPostError("");
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handlePost = async () => {
    if ((!caption.trim() && !imageFile) || !profile?.id || posting) return;
    setPosting(true);
    setPostError("");
    try {
      const isPromoted = promoteEnabled && selectedPromo;
      const promoType = selectedPromo?.id || null;

      if (promoteEnabled && !promoConfigured) {
        setPostError("Apply your promotion setup before posting.");
        setPosting(false);
        return;
      }

      if (promoType === "targeted" && !selectedRelease?.id) {
        setPostError("Targeted promo requires a release selection.");
        setShowReleaseSelector(true);
        setPosting(false);
        return;
      }

      // Upload image if present
      let thumbnailUrl = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const fileName = `posts/${profile.id}-${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabaseClient.storage
          .from("uploads")
          .upload(fileName, imageFile, { upsert: true, contentType: imageFile.type });
        if (uploadErr) {
          console.error("[Xpress] Image upload error:", uploadErr);
          setPostError("Failed to upload image");
          setPosting(false);
          return;
        }
        const { data: urlData } = supabaseClient.storage.from("uploads").getPublicUrl(uploadData.path);
        thumbnailUrl = urlData.publicUrl;
      }

      // Extract mentions and hashtags from caption
      const mentionHandles = [...(caption || "").matchAll(/@(\w+)/g)].map(m => m[1]);
      const hashtags = [...(caption || "").matchAll(/#(\w+)/g)].map(m => m[1]);

      const mentionHandles_arr = mentionHandles;
      const hashtags_arr = hashtags;

      if (isPromoted) {
        // Route through edge function for server-side validation:
        // - energy check, money deduction, hype gain, xpress_campaigns write
        const { data: fnData, error: fnError } = await supabaseClient.functions.invoke('socialMedia', {
          body: {
            action: 'createXpressPost',
            artistId: profile.id,
            caption: caption || '',
            postType: imageFile ? 'photo' : 'text',
            thumbnailUrl: thumbnailUrl || null,
            isPromoted: true,
            promotionType: promoType,
            linkedReleaseId: selectedRelease?.id || null,
            mentionHandles: mentionHandles_arr,
            hashtags: hashtags_arr,
            subtweetTargetId: subtweetTarget?.id || null,
            alignmentTag: alignmentTag || null,
          }
        });
        if (fnError) throw fnError;
        if (!fnData?.success) {
          throw new Error(fnData?.error || 'Promotion failed');
        }
        onPostCreated?.(fnData?.data?.socialPost);
      } else {
        // Non-promoted: direct DB write (no money cost, minimal energy)
        const { data: fnData, error: fnError } = await supabaseClient.functions.invoke('socialMedia', {
          body: {
            action: 'createXpressPost',
            artistId: profile.id,
            caption: caption || '',
            postType: imageFile ? 'photo' : 'text',
            thumbnailUrl: thumbnailUrl || null,
            isPromoted: false,
            promotionType: null,
            linkedReleaseId: selectedRelease?.id || null,
            mentionHandles: mentionHandles_arr,
            hashtags: hashtags_arr,
            subtweetTargetId: subtweetTarget?.id || null,
            alignmentTag: alignmentTag || null,
          }
        });
        if (fnError) throw fnError;
        if (!fnData?.success) {
          throw new Error(fnData?.error || 'Post failed');
        }
        onPostCreated?.(fnData?.data?.socialPost);
      }
    } catch (e) {
      console.error("[Xpress] Post error:", e);
      setPostError(e?.message || e?.error?.message || "Something went wrong");
    } finally {
      setPosting(false);
    }
  };

  const releasedReleases = useMemo(() => {
    // Include all releases that are actually available to promote.
    return (releases || []).filter(r =>
      r.lifecycle_state !== "Scheduled" ||
      r.status === "released" || 
      r.release_status === "released" || 
      r.is_released ||
      r.lifetime_streams > 0 ||
      r.release_date  // Has a release date
    );
  }, [releases]);

  const releaseLabel = (r) => r?.title || r?.name || r?.project_name || "Untitled";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[60] flex flex-col"
    >
      {/* Hidden file input */}
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleImageSelect} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onClose} className="text-white text-[14px] font-medium">Cancel</button>
        <button
          onClick={handlePost}
          disabled={(!caption.trim() && !imageFile) || posting}
          className="px-5 py-1.5 rounded-full bg-zinc-700 text-white text-[13px] font-bold disabled:opacity-40 enabled:bg-red-500 enabled:hover:bg-red-400 transition-colors"
        >
          {posting ? "Posting..." : (promoteEnabled && promoConfigured ? "Post with Promo" : "Post")}
        </button>
      </div>

      {/* Error banner */}
      {postError && (
        <div className="px-4 py-2 bg-red-600/10 border-b border-red-500/20">
          <p className="text-red-400 text-[12px]">{postError}</p>
        </div>
      )}

      {/* Visibility dropdown */}
      <div className="px-4 pt-3">
        <button className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/30">
          <span className="text-red-400 text-[12px] font-semibold">Everyone</span>
          <ChevronDown className="w-3 h-3 text-red-400" />
        </button>
      </div>

      {/* Compose area */}
      <div className="flex-1 px-4 pt-3 relative overflow-y-auto">
        <div className="flex gap-3">
          <ProfileAvatar src={profile?.artist_image} alt={profile?.artist_name} size="sm" />
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={caption}
              onChange={handleCaptionChange}
              placeholder="What's happening?"
              className="w-full bg-transparent text-white text-[15px] leading-[1.4] placeholder-gray-600 outline-none resize-none min-h-[100px]"
              autoFocus
            />

            {/* @mention autocomplete */}
            {showMentions && mentionResults.length > 0 && (
              <div className="absolute left-0 right-0 bg-[#1a1a24] border border-white/[0.08] rounded-xl shadow-xl z-10 max-h-40 overflow-y-auto">
                {mentionResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => insertMention(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <ProfileAvatar src={p.artist_image} alt={p.artist_name} size="sm" />
                    <div>
                      <p className="text-white text-[12px] font-semibold">{p.artist_name}</p>
                      <p className="text-gray-500 text-[10px]">@{p.xpress_handle || (p.artist_name || "").replace(/\s+/g, "")}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Character count */}
        <div className="absolute top-3 right-0">
          <span className={`text-[11px] ${charCount > maxChars * 0.9 ? "text-red-400" : "text-gray-600"}`}>
            {charCount}
          </span>
        </div>

        {/* Image preview — above promotion section */}
        {imagePreview && (
          <div className="mt-3 ml-11 relative">
            <div className="rounded-xl overflow-hidden border border-white/[0.08] max-h-52">
              <img src={imagePreview} alt="" className="w-full object-cover max-h-52" />
            </div>
            <button
              onClick={removeImage}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Subtweet targeting + alignment */}
      <div className="px-4 pb-2 space-y-2 flex-shrink-0">
        {/* Alignment tag */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-200 text-[11px] font-semibold">Post vibe:</span>
          <div className="flex gap-1 flex-wrap">
            {[
              { id: '', label: 'Normal', color: 'text-gray-400' },
              { id: 'subtweet', label: 'Subtweet', color: 'text-red-400' },
              { id: 'hype_post', label: 'Hype', color: 'text-amber-400' },
              { id: 'vulnerable_post', label: 'Vulnerable', color: 'text-blue-400' },
              { id: 'flex_post', label: 'Flex', color: 'text-green-400' },
              { id: 'stan_cta', label: 'Stan Rally ⚡', color: 'text-purple-400' },
              { id: 'radio_shoutout', label: 'Radio Shoutout 📻', color: 'text-blue-400' },
              { id: 'receipts_drop', label: 'Drop Receipts 🔥', color: 'text-orange-400' },
              { id: 'clapback', label: 'Clapback 🎯', color: 'text-rose-400' },
              { id: 'chill_pill', label: 'Deescalate 🕊', color: 'text-teal-400' },
            ].map(tag => (
              <button
                key={tag.id}
                onClick={() => {
                  setAlignmentTag(tag.id);
                  const needsTarget = ['subtweet', 'receipts_drop', 'clapback'].includes(tag.id);
                  if (needsTarget) setSubtweetEnabled(true);
                  else { setSubtweetEnabled(false); setSubtweetTarget(null); }
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  alignmentTag === tag.id
                    ? `${tag.color} border-current bg-current/10`
                    : 'text-zinc-200 border-white/[0.10] bg-white/[0.03] hover:border-white/25 hover:text-white'
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtweet target selector */}
        {subtweetEnabled && (
          <div className="border border-red-500/20 rounded-xl p-2.5 bg-red-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400 text-[11px] font-semibold">Who's this about?</span>
              {subtweetTarget && (
                <button onClick={() => setSubtweetTarget(null)} className="ml-auto text-gray-500 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {subtweetTarget ? (
              <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1.5">
                {subtweetTarget.artist_image && (
                  <img src={subtweetTarget.artist_image} alt="" className="w-5 h-5 rounded-full object-cover" />
                )}
                <span className="text-white text-[11px] font-semibold">{subtweetTarget.artist_name}</span>
                <span className="text-gray-500 text-[9px]">@{subtweetTarget.xpress_handle || subtweetTarget.artist_name?.replace(/\s+/g, '')}</span>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={subtweetSearch}
                  onChange={async (e) => {
                    setSubtweetSearch(e.target.value);
                    if (e.target.value.length >= 1) {
                      try {
                        const { data } = await supabaseClient
                          .from('profiles')
                          .select('id, artist_name, artist_image, xpress_handle')
                          .neq('id', profile?.id)
                          .ilike('artist_name', `%${e.target.value}%`)
                          .limit(5);
                        setSubtweetResults(data || []);
                      } catch { setSubtweetResults([]); }
                    } else {
                      setSubtweetResults([]);
                    }
                  }}
                  placeholder="Search artist..."
                  className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder-gray-600 outline-none focus:border-red-500/30"
                />
                {subtweetResults.length > 0 && (
                  <div className="mt-1 bg-[#1a1a24] border border-white/[0.08] rounded-lg overflow-hidden">
                    {subtweetResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSubtweetTarget(p); setSubtweetSearch(''); setSubtweetResults([]); }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.04] transition-colors text-left"
                      >
                        {p.artist_image && <img src={p.artist_image} alt="" className="w-5 h-5 rounded-full object-cover" />}
                        <span className="text-white text-[11px] font-semibold">{p.artist_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-gray-600 text-[9px] mt-1">Subtweets can trigger controversies if you're high-profile.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Promote section */}
      <div className="px-4 pb-3 space-y-3 flex-shrink-0 max-h-[50vh] overflow-y-auto">
        <div className="border border-white/[0.08] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-red-400" />
              <span className="text-white text-[13px] font-bold">Promote This Post</span>
            </div>
            {promoteEnabled && (
              <button
                onClick={() => { setPromoteEnabled(false); setSelectedPromo(null); setSelectedRelease(null); }}
                className="text-gray-500 text-[11px] hover:text-gray-300"
              >
                Cancel
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={promoteEnabled}
              onChange={(e) => { setPromoteEnabled(e.target.checked); if (!e.target.checked) { setSelectedPromo(null); setSelectedRelease(null); } }}
              className="w-4 h-4 rounded border-gray-600 bg-transparent accent-red-600"
            />
            <span className="text-zinc-200 text-[12px] font-medium">Run as Promoted Post</span>
          </label>

          {promoteEnabled && (
            <div className="mt-3 space-y-2">
              {PROMO_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setSelectedPromo(opt);
                    setPromoConfigured(false);
                    if (opt.id === "targeted") setShowReleaseSelector(true);
                    if (opt.id !== "targeted") setSelectedRelease(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selectedPromo?.id === opt.id
                      ? "border-red-400 bg-red-400/5"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-[13px] font-bold">{opt.title}</span>
                    {selectedPromo?.id === opt.id && <Check className="w-4 h-4 text-red-400" />}
                  </div>
                  <p className="text-zinc-300 text-[11px] mb-2">{opt.desc}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-none">
                    <span className="text-yellow-400">⚡ {opt.energyCost} Energy</span>
                    <span className="text-green-400">💰 ${opt.moneyCost}</span>
                    <span className="text-blue-400">📈 {opt.benefits.popularity} Popularity</span>
                    <span className="text-purple-400">🔥 {opt.benefits.hype} Hype</span>
                  </div>
                </button>
              ))}

              {/* Show selected content for targeted promo */}
              {selectedPromo?.id === "targeted" && (
                <div className="space-y-2">
                  <div className="text-zinc-200 text-[10px] font-semibold mb-2">Choose a release to promote:</div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <span className="text-zinc-300 text-[10px] block mb-1 font-medium">Release</span>
                    {selectedRelease ? (
                      <div className="flex items-center gap-2">
                        <span className="text-red-400 text-[11px] font-semibold flex-1">{releaseLabel(selectedRelease)}</span>
                        <button onClick={() => { setSelectedRelease(null); setPromoConfigured(false); setShowReleaseSelector(true); }} className="p-0.5">
                          <X className="w-3 h-3 text-gray-500 hover:text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setShowReleaseSelector(true); }}
                        className="text-red-300 text-[11px] font-medium hover:text-red-200"
                      >
                        Select a release...
                      </button>
                    )}
                  </div>
                  {!selectedRelease && (
                    <p className="text-amber-300 text-[10px]">Targeted promo needs a release so Xpress can point fans to the right single or project.</p>
                  )}
                </div>
              )}

              {selectedPromo && (
                promoConfigured ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-emerald-300 text-[12px] font-bold">Promotion attached to draft</p>
                        <p className="text-zinc-200 text-[11px]">
                          {selectedPromo.title}
                          {selectedPromo.id === "targeted" && selectedRelease ? ` • ${releaseLabel(selectedRelease)}` : ""}
                        </p>
                      </div>
                      <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPromoConfigured(false)}
                        className="flex-1 py-2 rounded-lg bg-white/[0.06] text-zinc-100 text-[11px] font-semibold hover:bg-white/[0.10] transition-colors"
                      >
                        Edit Promotion
                      </button>
                      <button
                        onClick={() => {
                          setPromoteEnabled(false);
                          setSelectedPromo(null);
                          setSelectedRelease(null);
                          setPromoConfigured(false);
                        }}
                        className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-[11px] font-semibold hover:bg-zinc-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="text-zinc-300 text-[10px]">This promotion will run when you tap the main Post button.</p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (selectedPromo?.id === "targeted" && !selectedRelease) {
                        setPostError("Targeted promo requires a release selection.");
                        setShowReleaseSelector(true);
                        return;
                      }
                      setPostError("");
                      setPromoConfigured(true);
                    }}
                    disabled={selectedPromo?.id === "targeted" && !selectedRelease}
                    className="w-full py-3 rounded-xl bg-red-500 text-white text-[13px] font-bold disabled:opacity-50 hover:bg-red-400 transition-colors"
                  >
                    {selectedPromo?.id === "targeted" ? "Attach Promotion to Draft" : "Apply Promotion to Draft"}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar — camera / image button */}
      <div className="px-4 py-2 border-t border-white/[0.06] flex-shrink-0 flex items-center gap-3">
        <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <ImageIcon className="w-5 h-5 text-red-400" />
        </button>
        <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <Camera className="w-5 h-5 text-red-400" />
        </button>
      </div>

      {/* Release Selector Modal */}
      {showReleaseSelector && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-6"
          onClick={() => setShowReleaseSelector(false)}
        >
          <motion.div
            initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#1a1a24] rounded-2xl border border-white/[0.08] overflow-hidden max-h-[70vh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-white text-base font-bold">Select Release to Promote</h3>
              <p className="text-zinc-300 text-[11px] mt-0.5">Choose from your singles and projects:</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {releasedReleases.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No released music yet</p>
              ) : (
                releasedReleases.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRelease(r);
                      setPromoConfigured(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedRelease?.id === r.id
                        ? "border-red-400 bg-red-400/5"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <p className="text-white text-[13px] font-bold">{releaseLabel(r)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">
                        {r.project_type || r.type || "Single"}
                      </span>
                      <span className="text-gray-500 text-[11px]">
                        {r.release_year || (r.created_at ? new Date(r.created_at).getFullYear() : "")}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-white/[0.06]">
              <button
                onClick={() => setShowReleaseSelector(false)}
                disabled={!selectedRelease}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold disabled:opacity-40 hover:bg-red-500 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => { setShowReleaseSelector(false); setSelectedRelease(null); }}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 text-white text-[13px] font-semibold hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
