import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ChevronLeft, RefreshCw } from "lucide-react";
import EraManagementAppStandalone from "../components/career/apps/EraManagementAppStandalone";

export default function EraManagementPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [currentEra, setCurrentEra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadData();

    // Re-fetch era data when a turn advances
    const handleTurnAdvanced = () => { loadData(); };
    window.addEventListener('turnAdvanced', handleTurnAdvanced);
    return () => window.removeEventListener('turnAdvanced', handleTurnAdvanced);
  }, []);

  const loadData = async () => {
    try {
      setLoadError(null);
      const userAccountId = localStorage.getItem("user_account_id");
      
      if (userAccountId) {
        const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
        const resolvedProfile = profiles[0] || null;
        setProfile(resolvedProfile);

        // Load current era using resolved profile ID (not stale localStorage)
        if (resolvedProfile?.id) {
          const eras = await base44.entities.Era.filter({ artist_id: resolvedProfile.id });
          const activeEra = eras.find(era => era.is_active);
          setCurrentEra(activeEra || null);
          
          // Update cache as hint, not as source of truth
          localStorage.setItem('artist_id', resolvedProfile.id);
        }
      }
    } catch (error) {
      console.error('[EraManagement] Data load error:', error);
      setLoadError("Failed to load era data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/career');
  };

  const handleEraUpdated = (era) => {
    setCurrentEra(era);
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{loadError}</p>
          <button
            onClick={() => { setLoading(true); setLoadError(null); loadData(); }}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="sticky top-0 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/[0.08] z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 text-xs font-medium text-white/50 transition hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Career
            </button>
            <h1 className="text-xl font-bold text-white">Era Management</h1>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <EraManagementAppStandalone
          currentEra={currentEra}
          profile={profile}
          onClose={handleBack}
          onEraUpdated={handleEraUpdated}
        />
      </div>
    </div>
  );
}
