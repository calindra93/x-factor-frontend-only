import React from "react";
import { Music, Search, Radio } from "lucide-react";

export default function SoundburstNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "discover", label: "Discover", icon: Music },
    { id: "search", label: "Search", icon: Search },
    { id: "events", label: "Events", icon: Radio }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0f]/80 backdrop-blur-xl border-t border-white/[0.04] px-2 py-3 max-w-md mx-auto">
      <div className="flex items-center justify-around gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-all ${
                isActive
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-gray-500 hover:bg-white/5"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}