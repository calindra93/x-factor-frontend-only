import React from "react";
import StatusRibbon from "@/components/home/StatusRibbon";

export default function TopBar() {
  return (
    <header className="app-top-bar fixed left-0 right-0 top-0 z-40 border-b border-white/[0.06] bg-[#111118]/95 backdrop-blur-xl">
      <StatusRibbon compact />
    </header>
  );
}
