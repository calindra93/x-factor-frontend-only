import React, { useEffect } from "react";
import { cn } from "@/lib/utils";

export default function ModalContainer({
  children,
  onClose,
  align = "end",
  className,
  contentClassName,
}) {
  useEffect(() => {
    const handleEscClose = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEscClose);
    return () => window.removeEventListener("keydown", handleEscClose);
  }, [onClose]);

  return (
    <div
      className={cn(
        "app-modal fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm",
        "px-4 pb-[calc(var(--app-bottom-nav-offset)+var(--space-2))] pt-[calc(var(--app-top-bar-offset)+var(--space-2))]",
        align === "center" ? "flex items-center justify-center" : "flex items-end justify-center",
        className
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-[var(--app-max-content-width)] overflow-y-auto rounded-3xl border border-white/10 bg-[#0f0f16]",
          "max-h-[calc(var(--app-usable-height)-var(--space-4))]",
          contentClassName
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
