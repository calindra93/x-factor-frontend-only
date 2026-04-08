import React from "react";
import { Home, Search, Radio } from "lucide-react";

export default function AppleMusicBottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "radio", label: "Radio", icon: Radio }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="rounded-2xl border border-white/10 bg-[#0f1117]/95 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between">
        {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center gap-1 px-3 py-2 min-h-[44px] justify-center text-center"
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-red-400" : "text-white/50"}`} />
                <span className={`text-[10px] ${isActive ? "text-red-400" : "text-white/50"}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
        </div>
        );
}