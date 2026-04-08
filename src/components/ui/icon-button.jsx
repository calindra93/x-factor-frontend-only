import * as React from "react";
import { TouchTarget } from "@/components/ui/touch-target";
import { cn } from "@/lib/utils";

const IconButton = React.forwardRef(
  ({ className, size = "md", children, "aria-label": ariaLabel, ...props }, ref) => (
    <TouchTarget
      ref={ref}
      type="button"
      size={size}
      aria-label={ariaLabel}
      className={cn("icon-button shrink-0", className)}
      {...props}
    >
      {children}
    </TouchTarget>
  )
);

IconButton.displayName = "IconButton";

export { IconButton };
