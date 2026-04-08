import * as React from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { IconButton } from "@/components/ui/icon-button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const BottomSheet = React.forwardRef(({ className, children, ...props }, ref) => (
  <Sheet {...props}>
    <SheetContent
      ref={ref}
      side="bottom"
      className={cn(
        "mobile-bottom-sheet rounded-t-2xl border-white/10 bg-[#111118] p-0",
        className
      )}
    >
      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-white/20" aria-hidden />
      <SheetClose asChild>
        <IconButton
          size="sm"
          className="absolute right-2 top-2 text-white/70 hover:text-white hover:bg-white/10"
          aria-label="Close sheet"
        >
          <X className="h-4 w-4" />
        </IconButton>
      </SheetClose>
      <div className="mobile-bottom-sheet__body">{children}</div>
    </SheetContent>
  </Sheet>
));

BottomSheet.displayName = "BottomSheet";

export {
  BottomSheet,
  SheetTrigger as BottomSheetTrigger,
  SheetClose as BottomSheetClose,
  SheetHeader as BottomSheetHeader,
  SheetFooter as BottomSheetFooter,
  SheetTitle as BottomSheetTitle,
  SheetDescription as BottomSheetDescription,
};
