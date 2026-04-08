import React from "react";
import { DollarSign, Bell } from "lucide-react";

export default function CareerRibbon({ profile }) {
  return (
    <div className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="px-4 py-3 flex items-center justify-between">
        <h1 className="text-white text-lg font-bold">Career</h1>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-white text-sm font-semibold">
              {profile.income.toLocaleString()}
            </span>
          </div>
          <button className="relative">
            <Bell className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>
        </div>
      </div>
    </div>
  );
}