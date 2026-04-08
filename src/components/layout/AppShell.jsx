import React from "react";
import { cn } from "@/lib/utils";

export default function AppShell({ children, className }) {
  return (
    <div className={cn("app-shell", className)}>
      <div className="app-shell__frame">{children}</div>
    </div>
  );
}
