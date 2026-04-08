import React from "react";
import { Search, User } from "lucide-react";
import { StreamifyIcon } from "@/components/shared/AppIcons";

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: null, custom: true },
  { id: "search", label: "Search", icon: Search },
  { id: "profile", label: "Profile", icon: User },
];

export default function StreamifyBottomNav({ currentView, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-[#1a1530]/95 to-[#0f1117]/95 px-2 py-3 shadow-lg shadow-violet-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const isActive = currentView === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id)}
                  className="flex flex-col items-center gap-1.5 px-4 py-2 min-h-[44px] justify-center rounded-xl transition-all"
                >
                  {item.custom ? (
                    <StreamifyIcon className="h-5 w-5" active={isActive} />
                  ) : (
                    <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-violet-400" : "text-white/40"}`} />
                  )}
                  <span className={`text-[9px] font-medium transition-colors ${isActive ? "text-violet-400" : "text-white/40"}`}>
                    {item.label}
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