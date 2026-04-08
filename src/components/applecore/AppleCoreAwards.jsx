import React, { useMemo } from "react";
import { Calendar, ChevronRight, Disc3, Trophy } from "lucide-react";

const CATEGORY_LABELS = {
  song_of_year: "Song of the Year",
  album_of_year: "Album of the Year",
  artist_of_year: "Artist of the Year",
  breakthrough_artist: "Breakthrough Artist",
};

function getPlacementLabel(position) {
  if (position === 1) return "Winner";
  if (position === 2) return "Runner-Up";
  return `Nominee #${position}`;
}

function AwardPlacementPill({ position }) {
  const isWinner = position === 1;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        isWinner
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-white/10 bg-white/[0.04] text-white/60"
      }`}
    >
      {getPlacementLabel(position)}
    </span>
  );
}

export default function AppleCoreAwards({
  latestAwardYear,
  latestAwards,
  playerAwards,
  currentTurnIndex,
  loadError,
}) {
  const groupedLatestAwards = useMemo(() => {
    const groups = new Map();

    for (const award of latestAwards || []) {
      const existing = groups.get(award.category) || [];
      existing.push(award);
      groups.set(award.category, existing);
    }

    return [...groups.entries()].map(([category, awards]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      awards: [...awards].sort((left, right) => (left.position || 99) - (right.position || 99)),
    }));
  }, [latestAwards]);

  const wins = (playerAwards || []).filter((award) => award.position === 1).length;
  const nominations = (playerAwards || []).length;
  const completedAwardCycles = Math.floor((currentTurnIndex || 0) / 365);
  const nextAwardYear = completedAwardCycles + 1;
  const nextAwardTurn = nextAwardYear * 365;
  const turnsUntilNextAwards = Math.max(0, nextAwardTurn - (currentTurnIndex || 0));
  const hasAwards = Number.isInteger(latestAwardYear);
  const awardsAreOverdue = !hasAwards && completedAwardCycles > 0;

  return (
    <div className="space-y-6 pb-4">
      <div className="px-4 pt-2">
        <h1 className="text-2xl font-bold text-white">Awards</h1>
        <p className="mt-0.5 text-xs text-white/40">AppleCore nominations, winners, and yearly cadence.</p>
      </div>

      {loadError && (
        <div className="mx-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">Awards feed unavailable</p>
          <p className="mt-1 text-xs text-amber-100/70">{loadError}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 px-4">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Latest Ceremony</p>
          <p className="mt-2 text-lg font-bold text-white">{hasAwards ? `Year ${latestAwardYear}` : "Pending"}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Your Wins</p>
          <p className="mt-2 text-lg font-bold text-emerald-300">{wins}</p>
          <p className="text-[10px] text-white/35">{nominations} total nods</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Next Ceremony</p>
          <p className="mt-2 text-lg font-bold text-white">Year {nextAwardYear}</p>
          <p className="text-[10px] text-white/35">{turnsUntilNextAwards} turns</p>
        </div>
      </div>

      {!hasAwards && (
        <div className="mx-4 rounded-3xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.02] px-5 py-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05]">
            <Calendar className="h-6 w-6 text-white/45" />
          </div>
          <p className="text-sm font-semibold text-white">
            {awardsAreOverdue ? "No AppleCore awards are recorded yet" : "The first AppleCore ceremony has not run yet"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            {awardsAreOverdue
              ? "The yearly awards cycle should already have produced rows by this turn, so this is a real data gap rather than a normal empty state."
              : `Awards are issued every 365 turns. The first ceremony lands at turn 365, with ${turnsUntilNextAwards} turns remaining.`}
          </p>
        </div>
      )}

      {hasAwards && (
        <section className="space-y-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Latest Ceremony</h2>
              <p className="text-[11px] text-white/40">Year {latestAwardYear} winners and nominees.</p>
            </div>
            <Trophy className="h-4 w-4 text-amber-300" />
          </div>

          {groupedLatestAwards.map(({ category, label, awards }) => (
            <div key={category} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">AppleCore awards</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </div>

              <div className="space-y-2.5">
                {awards.map((award) => (
                  <div
                    key={award.id}
                    className={`rounded-xl border px-3 py-3 ${
                      award.position === 1
                        ? "border-emerald-400/20 bg-emerald-400/10"
                        : "border-white/[0.06] bg-black/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{award.artist_name || "Unknown Artist"}</p>
                        <p className="mt-1 truncate text-[11px] text-white/45">
                          {award.release_title || "Artist-level award"}
                        </p>
                      </div>
                      <AwardPlacementPill position={award.position} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Your AppleCore History</h2>
            <p className="text-[11px] text-white/40">Nominations and wins for your artist.</p>
          </div>
          <Disc3 className="h-4 w-4 text-rose-300" />
        </div>

        {playerAwards?.length > 0 ? (
          <div className="space-y-2">
            {playerAwards.map((award) => (
              <div key={award.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {CATEGORY_LABELS[award.category] || award.category}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-white/45">
                      Year {award.award_year}
                      {award.release_title ? ` · ${award.release_title}` : ""}
                    </p>
                  </div>
                  <AwardPlacementPill position={award.position} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-5 text-center">
            <p className="text-sm font-semibold text-white">No AppleCore nominations yet</p>
            <p className="mt-2 text-xs text-white/45">
              This panel stays empty until your artist lands a nomination or win. It should not fabricate award history.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}