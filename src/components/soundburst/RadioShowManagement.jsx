import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  Sparkles,
  Lock,
  Unlock,
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  MapPin,
  Music2,
  Mic2,
  Users,
  Settings,
  BarChart3,
  X,
} from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

// Available regions and cities
const REGIONS = [
  { id: "united-states", name: "United States", cities: ["New York", "Los Angeles", "Atlanta", "Chicago", "Miami", "Houston"] },
  { id: "uk", name: "UK", cities: ["London", "Manchester", "Birmingham", "Bristol", "Leeds"] },
  { id: "europe", name: "Europe", cities: ["Berlin", "Paris", "Amsterdam", "Stockholm", "Barcelona"] },
  { id: "canada", name: "Canada", cities: ["Toronto", "Vancouver", "Montreal", "Calgary"] },
  { id: "latin-america", name: "Latin America", cities: ["Mexico City", "Sao Paulo", "Buenos Aires", "Bogota"] },
  { id: "africa", name: "Africa", cities: ["Lagos", "Johannesburg", "Nairobi", "Accra", "Cairo"] },
  { id: "asia", name: "Asia", cities: ["Tokyo", "Seoul", "Mumbai", "Singapore", "Hong Kong"] },
  { id: "oceania", name: "Oceania", cities: ["Sydney", "Melbourne", "Auckland", "Brisbane"] },
];

// Available genres - 37 canonical genres + 8 non-canonical (Electronic, House, Funk, Lo-Fi, Ambient, UK Garage, Grime, DnB)
const GENRES = [
  // Hip-hop cluster
  "Hip-Hop", "Rap", "Melodic Rap", "Trap", "Drill", "UK Drill", "Alternative Rap", "Latin Rap",
  // R&B/Soul cluster
  "R&B", "Soul", "Blues", "Jazz", "Gospel",
  // Pop cluster
  "Pop", "K-Pop", "J-Pop", "Indie", "Indie Rock",
  // Rock cluster
  "Rock", "Alternative", "Grunge", "Punk", "Metal", "Folk",
  // Electronic cluster
  "EDM", "House", "Techno", "Trance", "Electronic", "Lo-Fi", "Ambient", "UK Garage", "Grime", "DnB",
  // World/Latin cluster
  "Afrobeats", "Amapiano", "Reggaeton", "Latin Pop", "Latin", "Salsa", "Dancehall", "Reggae",
  // Other
  "Country", "Go-Go", "Funk",
];

// Identity pillars (placeholder for backend integration)
const IDENTITY_PILLARS = [
  { id: "underground", label: "Underground", description: "Raw, unfiltered sounds from the streets" },
  { id: "mainstream", label: "Mainstream Ready", description: "Polished hits for the masses" },
  { id: "experimental", label: "Experimental", description: "Pushing boundaries and breaking rules" },
  { id: "nostalgic", label: "Nostalgic", description: "Classic vibes with modern production" },
  { id: "global", label: "Global Fusion", description: "Blending cultures and sounds" },
  { id: "local", label: "Local Hero", description: "Championing your city's sound" },
];

// Unlock paths info
const UNLOCK_PATHS = [
  { icon: Radio, title: "Radio Submission", description: "Get a track accepted on an existing radio show" },
  { icon: Users, title: "Scene Contact", description: "Unlock the Scene Contact perk through networking" },
  { icon: Sparkles, title: "High Influence", description: "Reach high influence + clout levels" },
];

// Wizard step definitions
const WIZARD_STEPS = [
  { id: "name", label: "Name", icon: Mic2 },
  { id: "identity", label: "Identity", icon: Sparkles },
  { id: "audience", label: "Audience", icon: MapPin },
  { id: "genres", label: "Genres", icon: Music2 },
  { id: "thumbnail", label: "Thumbnail", icon: Upload },
];

function parsePlaylistInput(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
}

// Locked state component - prompts user to unlock
function LockedState({ unlockStatus, onStartWizard }) {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08] p-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />
        
        <div className="relative space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white text-lg font-bold">Host Your Own Show</h2>
              <p className="text-white/50 text-sm">Build your audience, curate your sound</p>
            </div>
          </div>

          <p className="text-white/60 text-sm leading-relaxed">
            Create your own radio station and become a tastemaker in the underground scene. 
            Curate playlists, build a loyal listener base, and help emerging artists get discovered.
          </p>

          {unlockStatus?.unlocked ? (
            <button
              onClick={onStartWizard}
              className="w-full px-4 py-3 rounded-xl bg-white text-black text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/90 transition"
            >
              <Unlock className="w-4 h-4" />
              Create Your Radio Show
            </button>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="text-amber-200 text-sm">Hosting is currently locked</span>
            </div>
          )}
        </div>
      </div>

      {/* Unlock Paths */}
      {!unlockStatus?.unlocked && (
        <div className="space-y-3">
          <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider px-1">
            How to Unlock
          </h3>
          <div className="space-y-2">
            {UNLOCK_PATHS.map((path) => (
              <div
                key={path.title}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <path.icon className="w-4 h-4 text-white/70" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{path.title}</p>
                  <p className="text-white/40 text-xs mt-0.5">{path.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Creation wizard component
function CreationWizard({ onClose, onComplete, artistId }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    identityPillars: [],
    region: "",
    city: "",
    genres: [],
    thumbnailPreview: null,
  });

  const currentStepData = WIZARD_STEPS[currentStep];
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;
  const selectedRegion = REGIONS.find(r => r.name === formData.region);

  const updateFormData = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleGenre = (genre) => {
    setFormData(prev => {
      const current = prev.genres;
      if (current.includes(genre)) {
        return { ...prev, genres: current.filter(g => g !== genre) };
      }
      if (current.length >= 4) return prev;
      return { ...prev, genres: [...current, genre] };
    });
  };

  const togglePillar = (pillarId) => {
    setFormData(prev => {
      const current = prev.identityPillars;
      if (current.includes(pillarId)) {
        return { ...prev, identityPillars: current.filter(p => p !== pillarId) };
      }
      if (current.length >= 2) return prev;
      return { ...prev, identityPillars: [...current, pillarId] };
    });
  };

  const canProceed = useMemo(() => {
    switch (currentStepData.id) {
      case "name":
        return formData.name.trim().length >= 3 && formData.description.trim().length >= 10;
      case "identity":
        return formData.identityPillars.length >= 1;
      case "audience":
        return formData.region && formData.city;
      case "genres":
        return formData.genres.length >= 3;
      case "thumbnail":
        return true; // Thumbnail is optional
      default:
        return true;
    }
  }, [currentStepData.id, formData]);

  const handleNext = () => {
    if (isLastStep) {
      handleSubmit();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!artistId) return;
    setIsSubmitting(true);
    setError("");

    const result = await invokeEdgeFunction("soundburstRadio", {
      action: "createShow",
      artistId,
      name: formData.name.trim(),
      description: formData.description.trim(),
      region: formData.region,
      city: formData.city,
      schedule_label: "Weekly",
      genre_focus: formData.genres,
      identity_pillars: formData.identityPillars,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to create show");
      return;
    }

    onComplete?.();
  };

  const handleThumbnailUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateFormData("thumbnailPreview", reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="w-full sm:max-w-lg bg-[#17171F] border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Create Your Radio Show</h2>
            <p className="text-white/40 text-xs mt-0.5">Step {currentStep + 1} of {WIZARD_STEPS.length}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 transition"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={`flex-1 h-1 rounded-full transition ${
                    idx < currentStep
                      ? "bg-white"
                      : idx === currentStep
                        ? "bg-white/50"
                        : "bg-white/10"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <currentStepData.icon className="w-4 h-4 text-white/70" />
            <span className="text-white text-sm font-medium">{currentStepData.label}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepData.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Step 1: Name & Description */}
              {currentStepData.id === "name" && (
                <>
                  <div className="space-y-2">
                    <label className="text-white text-sm font-medium">Show Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateFormData("name", e.target.value)}
                      placeholder="e.g., Late Night Frequencies"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
                      maxLength={40}
                    />
                    <p className="text-white/30 text-xs">{formData.name.length}/40 characters</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-white text-sm font-medium">Quick Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => updateFormData("description", e.target.value)}
                      placeholder="Describe your show's vibe and what listeners can expect..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 resize-none"
                      maxLength={200}
                    />
                    <p className="text-white/30 text-xs">{formData.description.length}/200 characters</p>
                  </div>
                </>
              )}

              {/* Step 2: Identity Pillars */}
              {currentStepData.id === "identity" && (
                <>
                  <p className="text-white/60 text-sm">
                    Choose up to 2 identity pillars that define your show's character.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {IDENTITY_PILLARS.map((pillar) => {
                      const isSelected = formData.identityPillars.includes(pillar.id);
                      return (
                        <button
                          key={pillar.id}
                          onClick={() => togglePillar(pillar.id)}
                          className={`p-3 rounded-lg border text-left transition ${
                            isSelected
                              ? "bg-white/10 border-white/30"
                              : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm font-medium">{pillar.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <p className="text-white/40 text-[11px] leading-tight">{pillar.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs">{formData.identityPillars.length}/2 selected</p>
                </>
              )}

              {/* Step 3: Target Audience (Region -> City) */}
              {currentStepData.id === "audience" && (
                <>
                  <p className="text-white/60 text-sm">
                    Select your target region and city to reach the right audience.
                  </p>
                  <div className="space-y-2">
                    <label className="text-white text-sm font-medium">Region</label>
                    <div className="grid grid-cols-2 gap-2">
                      {REGIONS.map((region) => {
                        const isSelected = formData.region === region.name;
                        return (
                          <button
                            key={region.id}
                            onClick={() => {
                              updateFormData("region", region.name);
                              updateFormData("city", "");
                            }}
                            className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                              isSelected
                                ? "bg-white/10 border-white/30 text-white"
                                : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/[0.06]"
                            }`}
                          >
                            {region.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {selectedRegion && (
                    <div className="space-y-2">
                      <label className="text-white text-sm font-medium">City</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedRegion.cities.map((city) => {
                          const isSelected = formData.city === city;
                          return (
                            <button
                              key={city}
                              onClick={() => updateFormData("city", city)}
                              className={`px-3 py-2 rounded-lg border text-sm transition ${
                                isSelected
                                  ? "bg-white text-black border-white"
                                  : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/[0.06]"
                              }`}
                            >
                              {city}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step 4: Genres */}
              {currentStepData.id === "genres" && (
                <>
                  <p className="text-white/60 text-sm">
                    Select 3-4 genres that your show will feature.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((genre) => {
                      const isSelected = formData.genres.includes(genre);
                      return (
                        <button
                          key={genre}
                          onClick={() => toggleGenre(genre)}
                          disabled={!isSelected && formData.genres.length >= 4}
                          className={`px-3 py-2 rounded-lg border text-sm transition ${
                            isSelected
                              ? "bg-white text-black border-white"
                              : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/30 text-xs">{formData.genres.length}/4 genres selected (minimum 3)</p>
                </>
              )}

              {/* Step 5: Thumbnail Upload */}
              {currentStepData.id === "thumbnail" && (
                <>
                  <p className="text-white/60 text-sm">
                    Upload a thumbnail image for your radio show (optional).
                  </p>
                  <div className="space-y-4">
                    {formData.thumbnailPreview ? (
                      <div className="relative aspect-square w-40 mx-auto rounded-lg overflow-hidden bg-black">
                        <img
                          src={formData.thumbnailPreview}
                          alt="Thumbnail preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => updateFormData("thumbnailPreview", null)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed border-white/20 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition">
                        <Upload className="w-8 h-8 text-white/40 mb-2" />
                        <span className="text-white/60 text-sm">Click to upload</span>
                        <span className="text-white/30 text-xs mt-1">PNG, JPG up to 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleThumbnailUpload}
                          className="hidden"
                        />
                      </label>
                    )}

                    {/* Summary */}
                    <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.08] space-y-2">
                      <h4 className="text-white text-sm font-semibold">Show Summary</h4>
                      <div className="space-y-1 text-xs">
                        <p className="text-white/60">Name: <span className="text-white">{formData.name || "—"}</span></p>
                        <p className="text-white/60">Location: <span className="text-white">{formData.city ? `${formData.city}, ${formData.region}` : "—"}</span></p>
                        <p className="text-white/60">Genres: <span className="text-white">{formData.genres.join(", ") || "—"}</span></p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.08] flex items-center gap-3">
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium flex items-center gap-1.5 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed || isSubmitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white text-black text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Creating...
              </>
            ) : isLastStep ? (
              <>
                <Radio className="w-4 h-4" />
                Pitch Show
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Management state component (placeholder)
function ManagementState({ myShow, artistId, onRefresh }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [discoveryEvents, setDiscoveryEvents] = useState([]);

  const loadDiscoveryEvents = async () => {
    if (!artistId) return;
    const result = await invokeEdgeFunction("soundburstRadio", {
      action: "getDiscoveryEvents",
      artistId,
    });
    if (result.success) {
      setDiscoveryEvents(result.data?.events || []);
    }
  };

  useEffect(() => {
    loadDiscoveryEvents();
  }, [artistId]);

  const runManageAction = async (subAction, extra = {}) => {
    if (!artistId) return;
    setActionLoading(true);
    setMessage("");
    const result = await invokeEdgeFunction("soundburstRadio", {
      action: "manageShow",
      artistId,
      subAction,
      ...extra,
    });
    setActionLoading(false);
    if (!result.success) {
      setMessage(result.error || `Failed to ${subAction}`);
      return;
    }
    setMessage(`${subAction} completed.`);
    await onRefresh?.();
  };

  return (
    <div className="space-y-4">
      {/* Show Overview Card */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08] p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
        
        <div className="relative">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center">
                <Radio className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-white text-lg font-bold">{myShow.name}</h2>
                <p className="text-white/50 text-sm">{myShow.region || "Unknown Region"}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white/70 text-xs font-medium uppercase">
              {myShow.show_tier}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Listeners</p>
              <p className="text-white text-lg font-bold">{Number(myShow.listener_count || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Reputation</p>
              <p className="text-white text-lg font-bold">{Number(myShow.reputation_score || 0)}</p>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Episodes</p>
              <p className="text-white text-lg font-bold">{Number(myShow.total_episodes_hosted || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-2">
        <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider px-1">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => runManageAction("hostEpisode")}
            disabled={actionLoading}
            className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition disabled:opacity-50"
          >
            <Mic2 className="w-4 h-4 text-white/70" />
            <span className="text-white text-sm font-medium">Host Episode</span>
          </button>
          <button
            onClick={() => runManageAction("promoteShow")}
            disabled={actionLoading}
            className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-white/70" />
            <span className="text-white text-sm font-medium">Promote Show</span>
          </button>
          <button
            disabled
            className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] opacity-50 cursor-not-allowed"
          >
            <Settings className="w-4 h-4 text-white/70" />
            <span className="text-white text-sm font-medium">Settings</span>
          </button>
          <button
            disabled
            className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] opacity-50 cursor-not-allowed"
          >
            <BarChart3 className="w-4 h-4 text-white/70" />
            <span className="text-white text-sm font-medium">Analytics</span>
          </button>
        </div>
      </div>

      {/* Placeholder for more management features */}
      <div className="p-4 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.1]">
        <p className="text-white/30 text-sm text-center">
          More management features coming soon...
        </p>
      </div>

      {message && (
        <p className="text-white/60 text-sm px-1">{message}</p>
      )}
    </div>
  );
}

export default function RadioShowManagement({ artistId, myShow, unlockStatus, onRefresh }) {
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleWizardComplete = async () => {
    setWizardOpen(false);
    await onRefresh?.();
  };

  // If user has a show, render management state
  if (myShow) {
    return (
      <ManagementState
        myShow={myShow}
        artistId={artistId}
        onRefresh={onRefresh}
      />
    );
  }

  // Otherwise render locked/creation state
  return (
    <>
      <LockedState
        unlockStatus={unlockStatus}
        onStartWizard={() => setWizardOpen(true)}
      />

      <AnimatePresence>
        {wizardOpen && (
          <CreationWizard
            onClose={() => setWizardOpen(false)}
            onComplete={handleWizardComplete}
            artistId={artistId}
          />
        )}
      </AnimatePresence>
    </>
  );
}
