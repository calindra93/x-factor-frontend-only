import React from "react";
import { Search, User, Radio, Trophy } from "lucide-react";
import { AppleCoreIcon } from "@/components/shared/AppIcons";

export default function ApplecoreBottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "home", label: "Listen Now", icon: null, custom: true },
    { id: "search", label: "Browse", icon: Search },
    { id: "radio", label: "Radio", icon: Radio },
    { id: "awards", label: "Awards", icon: Trophy },
    { id: "profile", label: "Profile", icon: User }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-[#1a1520]/95 to-[#0f1117]/95 px-2 py-3 shadow-lg shadow-rose-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-around">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center gap-1.5 px-3 py-2 min-h-[44px] justify-center rounded-xl transition-all"
                >
                  {tab.custom ? (
                    <AppleCoreIcon className="h-5 w-5" active={isActive} />
                  ) : (
                    <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-rose-400" : "text-white/40"}`} />
                  )}
                  <span className={`text-[9px] font-medium transition-colors ${isActive ? "text-rose-400" : "text-white/40"}`}>
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