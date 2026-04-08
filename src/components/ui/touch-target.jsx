import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const TouchTarget = React.forwardRef(
  ({ className, asChild = false, size = "md", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          "touch-target inline-flex items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          size === "sm" && "min-h-11 min-w-11 p-2.5",
          size === "md" && "min-h-12 min-w-12 p-3",
          className
        )}
        {...props}
      />
    );
  }
);

TouchTarget.displayName = "TouchTarget";

export { TouchTarget };
