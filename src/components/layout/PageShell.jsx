import React from "react";
import { cn } from "@/lib/utils";

export default function PageShell({
  children,
  className,
  contentClassName,
  withBottomNav = false,
  withTopBar = false,
}) {
  return (
    <div className={cn("page-shell", className)}>
      <div
        className={cn(
          "page-shell__scroll",
          withTopBar && "pt-[var(--app-top-bar-offset)]",
          withBottomNav && "pb-[var(--app-bottom-nav-offset)]",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
