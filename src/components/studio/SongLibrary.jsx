import React, { useState } from "react";
import UnrecordedSongs from "./UnrecordedSongs";
import RecordedSongs from "./RecordedSongs";
import ProjectManagement from "./ProjectManagement";

export default function SongLibrary({
  unrecordedSongs,
  recordedSongs,
  activeProjects,
  songs,
  profile,
  recordingSongId,
  onRecord,
  onReleaseSingle,
  onReleaseProject,
  onCreateRemix,
  onUpdateProject,
  onRefresh
}) {
  const [songsTab, setSongsTab] = useState("singles");

  return (
    <div className="space-y-2">
      <div>
        <div className="flex gap-0 border-b border-white/[0.08] mb-2">
          <button
            onClick={() => setSongsTab("singles")}
            className={`px-3 py-1.5 text-[11px] font-semibold transition-colors relative ${songsTab === "singles" ? "text-white" : "text-gray-500"}`}
          >
            Singles
            {songsTab === "singles" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-400" />}
          </button>
          <button
            onClick={() => setSongsTab("projects")}
            className={`px-3 py-1.5 text-[11px] font-semibold transition-colors relative ${songsTab === "projects" ? "text-white" : "text-gray-500"}`}
          >
            Projects
            {songsTab === "projects" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-400" />}
          </button>
        </div>

        {songsTab === "singles" && (
          <div className="h-[280px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="space-y-2 pr-0.5">
              {unrecordedSongs.length > 0 && (
                <div>
                  <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1.5 font-semibold">Unrecorded</p>
                  <UnrecordedSongs songs={unrecordedSongs} onRecord={onRecord} isRecording={recordingSongId !== null} recordingSongId={recordingSongId} onRefresh={onRefresh} />
                </div>
              )}
              {recordedSongs.length > 0 && (
                <div>
                  <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1.5 mt-2 font-semibold">Recorded</p>
                  <RecordedSongs songs={recordedSongs} profile={profile} onRefresh={onRefresh} onReleaseSingle={onReleaseSingle} />
                </div>
              )}
              {unrecordedSongs.length === 0 && recordedSongs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="text-gray-600 text-xs">No unreleased songs</p>
                  <p className="text-gray-700 text-[10px] mt-1">Write a song to get started</p>
                </div>
              )}
            </div>
          </div>
        )}

        {songsTab === "projects" && (
          <div className="h-[280px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <ProjectManagement projects={activeProjects} songs={songs} profile={profile} onUpdateProject={onUpdateProject} onRefresh={onRefresh} onReleaseProject={onReleaseProject} />
          </div>
        )}
      </div>
    </div>
  );
}