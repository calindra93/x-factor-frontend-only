import React from "react";
import { Clock } from "lucide-react";
import PastTourHeroCard from "./PastTourHeroCard";

export default function PastToursPanel({ pastTours = [], onOpenDetail }) {
  if (!pastTours || pastTours.length === 0) {
    return (
      <div
        className="rounded-[24px] px-5 py-8 text-center"
        style={{ background: "linear-gradient(145deg, rgba(8,11,21,0.78), rgba(18,24,38,0.52))", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: "#475569" }} />
        <p className="text-sm font-black text-white">No completed tours yet</p>
        <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "#64748b" }}>
          Complete your first tour to see your history here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pastTours.map((t) => (
        <PastTourHeroCard key={t.id} tour={t} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  );
}
