import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

import {
  ARTIST_PICK_DURATION_OPTIONS,
  getArtistPickDurationLabel,
  sortArtistPickReleases,
} from "@/lib/artistPickUtils";

const STEP_TITLES = ["Choose release", "Customize your pick"];

const formatReleaseMeta = (release) => {
  const year = new Date(release?.release_date || release?.created_date || release?.created_at || 0).getFullYear();
  const safeYear = Number.isFinite(year) && year > 1970 ? year : null;
  return [release?.project_type || "Release", safeYear].filter(Boolean).join(" • ");
};

export default function ArtistPickWizardModal({
  open,
  releases = [],
  initialReleaseId = null,
  initialMessage = "",
  initialBackgroundImage = "",
  initialDuration = "7d",
  accentColor = "emerald",
  saving = false,
  onClose,
  onSave,
}) {
  const sortedReleases = useMemo(() => sortArtistPickReleases(releases), [releases]);
  const [step, setStep] = useState(0);
  const [selectedReleaseId, setSelectedReleaseId] = useState(initialReleaseId || null);
  const [message, setMessage] = useState(initialMessage || "");
  const [backgroundImage, setBackgroundImage] = useState(initialBackgroundImage || "");
  const [duration, setDuration] = useState(initialDuration || "7d");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    setStep(0);
    setSelectedReleaseId(initialReleaseId || null);
    setMessage(initialMessage || "");
    setBackgroundImage(initialBackgroundImage || "");
    setDuration(initialDuration || "7d");
  }, [open, initialBackgroundImage, initialDuration, initialMessage, initialReleaseId, sortedReleases]);

  const selectedRelease = sortedReleases.find((release) => release.id === selectedReleaseId) || null;
  const accentClasses = {
    emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
    violet: "border-violet-400/40 bg-violet-500/15 text-violet-200",
    rose: "border-rose-400/40 bg-rose-500/15 text-rose-200",
  }[accentColor] || "border-white/15 bg-white/10 text-white";

  const canGoNext = step !== 0 || Boolean(selectedReleaseId);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || uploadingImage || saving) return;
    if (!file.type.startsWith("image/")) return;

    setUploadingImage(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket: "uploads" });
      setBackgroundImage(result?.file_url || "");
    } catch (error) {
      console.error("[ArtistPickWizardModal] Upload failed", error);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleNext = () => {
    if (!canGoNext || saving) return;
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const handleBack = () => {
    if (saving) return;
    if (step === 0) {
      onClose?.();
      return;
    }
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleSave = async () => {
    if (!selectedRelease || saving) return;
    await onSave?.({
      release: selectedRelease,
      message,
      backgroundImage,
      duration,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-0 sm:px-4"
          onClick={() => !saving && onClose?.()}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-[520px] bg-[#0d0d14] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Artist Pick wizard"
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b border-white/[0.06]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Artist Pick</p>
                <h2 className="text-white font-bold text-base leading-tight">{STEP_TITLES[step]}</h2>
              </div>
              <button
                onClick={() => !saving && onClose?.()}
                aria-label="Close artist pick wizard"
                className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center transition-colors hover:bg-white/[0.12] active:scale-95"
              >
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>

            <div className="px-5 pt-3 pb-2 flex gap-2 flex-shrink-0">
              {STEP_TITLES.map((label, index) => (
                <div key={label} className="flex-1 min-w-0">
                  <div className={`h-1 rounded-full ${index <= step ? accentClasses.split(" ")[1] : "bg-white/10"}`} />
                  <p className={`mt-2 text-[11px] truncate ${index === step ? "text-white" : "text-white/35"}`}>{label}</p>
                </div>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-6 pt-3 space-y-4">
              {step === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">Choose the release to pin. Newest releases appear first.</p>
                  <div className="space-y-2">
                    {sortedReleases.map((release) => {
                      const isSelected = release.id === selectedReleaseId;
                      return (
                        <button
                          key={release.id}
                          type="button"
                          onClick={() => setSelectedReleaseId(release.id)}
                          className={`w-full rounded-2xl border p-3 text-left transition ${isSelected ? accentClasses : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white/5">
                              {release.cover_artwork_url ? (
                                <img src={release.cover_artwork_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[10px] text-white/30">Art</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{release.release_name}</p>
                              <p className="mt-0.5 text-xs text-white/55">{formatReleaseMeta(release)}</p>
                            </div>
                            {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  {selectedRelease && (
                    <div className={`rounded-3xl border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${accentClasses}`}>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Selected release</p>
                      <p className="mt-1 text-sm font-semibold text-white">{selectedRelease.release_name}</p>
                    </div>
                  )}

                  <label className="block space-y-2.5">
                    <span className="text-sm font-medium text-white">Short message</span>
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={120}
                      rows={3}
                      placeholder="Tell fans why this is your pick..."
                      className="w-full rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/25 focus:bg-white/[0.08]"
                    />
                    <span className="text-[11px] text-white/35">Optional. Up to 120 characters.</span>
                  </label>

                  <div className="space-y-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-white">
                      <ImagePlus className="h-4 w-4" />
                      Promotional background image
                    </span>
                    <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#181826] via-[#11111b] to-black shadow-[0_22px_60px_rgba(0,0,0,0.35)]">
                      {backgroundImage ? (
                        <div className="relative h-32 w-full">
                          <img src={backgroundImage} alt="Artist pick background" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                          <button
                            type="button"
                            onClick={() => setBackgroundImage("")}
                            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage || saving}
                          className="flex h-32 w-full items-center justify-center gap-3 px-4 text-sm text-white/65 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {uploadingImage ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                          {uploadingImage ? "Uploading image..." : "Upload promo image"}
                        </button>
                      )}

                      <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
                        <p className="text-[11px] text-white/40">PNG, JPG, or WEBP recommended</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage || saving}
                          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {backgroundImage ? "Replace" : "Choose file"}
                        </button>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-white">Duration</p>
                    <div className="flex flex-wrap gap-2">
                      {ARTIST_PICK_DURATION_OPTIONS.map((option) => {
                        const selected = option === duration;
                        const turns = option === "indefinite" ? null : Number.parseInt(option, 10);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setDuration(option)}
                            className={`group rounded-full border px-3.5 py-2 text-left transition-all duration-200 ${selected ? accentClasses : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white"}`}
                          >
                            <p className="text-xs font-semibold text-white">{option === "indefinite" ? "Indefinite" : option}</p>
                            <p className="mt-0.5 text-[10px] text-white/55">{getArtistPickDurationLabel(turns)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === 0 ? "Cancel" : "Back"}
              </button>

              {step < STEP_TITLES.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="rounded-full bg-white text-black px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!selectedRelease || saving}
                  className="rounded-full bg-white text-black px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving..." : "Save your pick"}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
