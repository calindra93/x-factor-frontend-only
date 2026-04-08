import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import AppleMusicHome from "../components/applemusic/AppleMusicHome.jsx";
import AppleMusicSearch from "../components/applemusic/AppleMusicSearch.jsx";
import AppleMusicRadio from "../components/applemusic/AppleMusicRadio.jsx";
import AppleMusicArtistProfile from "../components/applemusic/AppleMusicArtistProfile.jsx";
import AppleMusicBottomNav from "../components/applemusic/AppleMusicBottomNav.jsx";

const buildFallbackAppleProfile = () => ({
  id: "fallback-apple",
  artist_name: "Demo Artist",
  genre: "Pop",
  region: "United States",
  followers: 110,
  clout: 5,
  income: 700,
});

export default function AppleMusic() {
  const [profile, setProfile] = useState(null);
  const [fanProfile, setFanProfile] = useState(null);
  const [allArtists, setAllArtists] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const continueWithFallback = () => {
    setProfile(buildFallbackAppleProfile());
    setFanProfile(null);
    setAllArtists([]);
    setLoadError(null);
    setLoading(false);
  };

  const loadData = async () => {
    try {
      setLoadError(null);
      const userAccountId = localStorage.getItem("user_account_id");
      
      if (userAccountId) {
        const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
        setProfile(profiles[0] || null);
        
        if (profiles[0]) {
          const fanProf = await base44.entities.FanProfile.filter({ artist_id: profiles[0].id });
          setFanProfile(fanProf[0] || null);
        }
      }

      const artists = await base44.entities.ArtistProfile.list("-clout", 100);
      setAllArtists(artists || []);
    } catch (error) {
      if (localStorage.getItem("dev_demo_mode") === "1") {
        continueWithFallback();
        return;
      }
      setLoadError("Unable to sync Apple Music data right now.");
    } finally {
      setLoading(false);
    }
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
          <button onClick={() => { setLoading(true); setLoadError(null); loadData(); }}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <button onClick={continueWithFallback}
            className="px-5 py-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium rounded-xl transition-colors inline-flex items-center gap-2 ml-2">
            Continue demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-24 max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {!selectedArtistId ? (
          <>
            {activeTab === "home" && (
              <AppleMusicHome
                profile={profile}
                fanProfile={fanProfile}
                artists={allArtists}
                onSelectArtist={(id) => setSelectedArtistId(id)}
              />
            )}
            {activeTab === "search" && (
              <AppleMusicSearch
                artists={allArtists}
                onSelectArtist={(id) => setSelectedArtistId(id)}
              />
            )}
            {activeTab === "radio" && <AppleMusicRadio profile={profile} />}
          </>
        ) : (
          <AppleMusicArtistProfile
            artistId={selectedArtistId}
            onClose={() => setSelectedArtistId(null)}
          />
        )}
      </AnimatePresence>

      {!selectedArtistId && (
        <AppleMusicBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}