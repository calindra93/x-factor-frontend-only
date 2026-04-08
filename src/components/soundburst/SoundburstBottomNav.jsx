import React from "react";
import { Search, Calendar, Radio, User } from "lucide-react";
import { SoundburstIcon } from "@/components/shared/AppIcons";

export default function SoundburstBottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "discover", label: "Discover", icon: null, custom: true },
    { id: "search", label: "Search", icon: Search },
    { id: "radio", label: "Radio", icon: Radio },
    { id: "events", label: "Events", icon: Calendar },
    { id: "profile", label: "Profile", icon: User }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-md px-4 pb-2">
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#1a1f3a]/95 to-[#0f1228]/95 px-2 py-3 shadow-lg shadow-blue-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-around">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center gap-1.5 px-4 py-2 min-h-[44px] justify-center rounded-xl transition-all"
                >
                  {tab.custom ? (
                    <SoundburstIcon className="h-5 w-5" active={isActive} />
                  ) : (
                    <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-blue-400" : "text-white/40"}`} />
                  )}
                  <span className={`text-[9px] font-medium transition-colors ${isActive ? "text-blue-400" : "text-white/40"}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}