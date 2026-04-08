import React, { useMemo, useState } from "react";
import { Music, Disc3, TrendingUp } from "lucide-react";

export default function TopSongs({ releases = [], projects = [], profile }) {
  const [tab, setTab] = useState('songs');

  const fmtNum = (n) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n || 0);
  };

  const topSongs = useMemo(() => {
    if (!Array.isArray(releases)) return [];
    return releases
      .filter(r => {
        // Check multiple possible fields that might indicate the release type
        const releaseType = (r.release_type || r.type || '').toLowerCase().trim();
        const projectName = (r.project_name || '').toLowerCase().trim();
        const releaseName = (r.release_name || '').toLowerCase().trim();
        
        // Filter out albums, EPs, mixtapes, and deluxe editions
        const isAlbum = releaseType === 'album' || projectName.includes('album') || releaseName.includes('album');
        const isEP = releaseType === 'ep' || projectName.includes('ep') || releaseName.includes('ep');
        const isMixtape = releaseType === 'mixtape' || projectName.includes('mixtape') || releaseName.includes('mixtape');
        const isDeluxe = releaseType === 'deluxe' || projectName.includes('deluxe') || releaseName.includes('deluxe');
        
        // Also filter out releases that have project_id set (indicating they're part of a project)
        const hasProject = r.project_id && r.project_id !== null && r.project_id !== '';
        
        return !isAlbum && !isEP && !isMixtape && !isDeluxe && !hasProject;
      })
      .sort((a, b) => (b.lifetime_streams || 0) - (a.lifetime_streams || 0))
      .slice(0, 10);
  }, [releases]);

  const topProjects = useMemo(() => {
    if (!Array.isArray(projects) || projects.length === 0) return [];
    return [...projects]
      .sort((a, b) => (b.total_streams || 0) - (a.total_streams || 0))
      .slice(0, 10);
  }, [projects]);

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-pink-400" />
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Music</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('songs')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              tab === 'songs'
                ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                : 'bg-white/[0.04] text-gray-500 border border-transparent hover:text-gray-300'
            }`}
          >
            Top Songs
          </button>
          <button
            onClick={() => setTab('projects')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              tab === 'projects'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-white/[0.04] text-gray-500 border border-transparent hover:text-gray-300'
            }`}
          >
            Top Albums
          </button>
        </div>
      </div>

      <div className="max-h-[108px] overflow-y-auto hide-scrollbar">
        {tab === 'songs' ? (
          topSongs.length > 0 ? (
            <div className="space-y-1.5">
              {topSongs.map((release, i) => (
                <div key={release.id} className="flex items-center gap-2.5 py-0.5">
                  <span className="text-gray-500 text-[11px] font-bold w-4 text-right">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[12px] font-semibold truncate leading-tight">{release.release_name}</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                      <span>{fmtNum(release.lifetime_streams || 0)} streams</span>
                      {release.lifecycle_state && (
                        <span className={`px-1 py-0 rounded-full text-[7px] font-semibold ${
                          release.lifecycle_state === 'Hot' ? 'bg-red-500/20 text-red-400' :
                          release.lifecycle_state === 'Trending' ? 'bg-amber-500/20 text-amber-400' :
                          release.lifecycle_state === 'Stable' ? 'bg-green-500/20 text-green-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{release.lifecycle_state}</span>
                      )}
                    </div>
                  </div>
                  {release.lifetime_streams > 0 && (
                    <TrendingUp className="w-2.5 h-2.5 text-green-500/50 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-gray-500 text-xs">No songs yet</p>
              <p className="text-gray-600 text-[10px] mt-0.5">Head to Studio to release your first track</p>
            </div>
          )
        ) : (
          topProjects.length > 0 ? (
            <div className="space-y-1.5">
              {topProjects.map((proj, i) => (
                <div key={proj.id} className="flex items-center gap-2.5 py-0.5">
                  <span className="text-gray-500 text-[11px] font-bold w-4 text-right">#{i + 1}</span>
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <Disc3 className="w-3 h-3 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[12px] font-semibold truncate leading-tight">{proj.name || proj.title || 'Untitled'}</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                      <span className="capitalize">{proj.type || proj.project_type || 'Album'}</span>
                      {proj.total_streams > 0 && <span>· {fmtNum(proj.total_streams)} streams</span>}
                      {proj.songs_count > 0 && <span>· {proj.songs_count} tracks</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3">
              <Disc3 className="w-5 h-5 text-gray-600 mx-auto mb-0.5" />
              <p className="text-gray-500 text-xs">No projects yet</p>
              <p className="text-gray-600 text-[10px] mt-0.5">Create an album or EP in the Studio</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}