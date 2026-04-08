import React from "react";
import { cn } from "@/lib/utils";

export default function PageContainer({ children, className }) {
  return <div className={cn("page-container px-4 py-4", className)}>{children}</div>;
}
