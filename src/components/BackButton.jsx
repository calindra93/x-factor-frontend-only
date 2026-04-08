import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TouchTarget } from "@/components/ui/touch-target";

export default function BackButton() {
  const navigate = useNavigate();

  return (
    <TouchTarget
      onClick={() => navigate(-1)}
      size="sm"
      className="mb-4 min-w-[76px] justify-start gap-2 px-3 text-white/70 hover:bg-white/5 hover:text-white"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
      <span className="text-sm">Back</span>
    </TouchTarget>
  );
}
