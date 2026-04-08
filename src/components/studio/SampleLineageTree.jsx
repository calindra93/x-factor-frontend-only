import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';

const TIER_COLOR = {
  common: '#6B7280',
  viral: '#3B82F6',
  rare: '#8B5CF6',
  legendary: '#C9A84C',
};

function TreeNode({ node, depth = 0, onSelect, selectedId }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = (node.children || []).length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="relative">
      <div
        className={`flex items-start gap-2 mb-1 ml-${depth * 4}`}
        style={{ paddingLeft: depth * 20 }}
      >
        {depth > 0 && (
          <div className="flex flex-col items-center mr-1 mt-1">
            <div className="w-px flex-1 bg-white/10" style={{ minHeight: 12 }} />
            <div className="w-2 h-px bg-white/10" />
          </div>
        )}

        <button
          onClick={() => { onSelect(node); setExpanded(e => !e); }}
          className={`flex-1 flex items-center gap-2 p-2 rounded-lg text-left transition-all ${
            isSelected ? 'ring-1' : 'hover:bg-white/5'
          }`}
          style={{
            background: isSelected ? `${TIER_COLOR[node.tier] || '#6B7280'}22` : 'transparent',
            borderColor: isSelected ? (TIER_COLOR[node.tier] || '#6B7280') : 'transparent',
          }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
            style={{ background: TIER_COLOR[node.tier] || '#6B7280' }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{node.title}</div>
            <div className="text-xs text-white/40 truncate">{node.artist_name}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {node.sample_clearance_status && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: node.sample_clearance_status === 'cleared'
                    ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: node.sample_clearance_status === 'cleared' ? '#22c55e' : '#ef4444',
                }}
              >
                {node.sample_clearance_status === 'cleared' ? '✓' : '⚠️'}
              </span>
            )}
            {hasChildren && (
              <span className="text-white/30 text-xs">{expanded ? '▾' : '▸'}</span>
            )}
          </div>
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function buildLineageTree(songId, supabaseClient, visited = new Set(), depth = 0) {
  if (visited.has(songId) || depth > 5) return null;
  visited.add(songId);

  const { data: song } = await supabaseClient
    .from('songs')
    .select('id, title, artist_id, original_song_id, is_remix, sample_clearance_status, sample_source_id, sample_royalty_rate, profiles:artist_id(artist_name), sample_sources:sample_source_id(name, tier)')
    .eq('id', songId)
    .maybeSingle();

  if (!song) return null;

  const node = {
    id: song.id,
    title: song.title,
    artist_name: song.profiles?.artist_name || 'Unknown',
    is_remix: song.is_remix,
    sample_clearance_status: song.sample_clearance_status,
    royalty_rate: song.sample_royalty_rate,
    tier: song.sample_sources?.tier || 'common',
    source_name: song.sample_sources?.name || null,
    children: [],
  };

  // Find songs that sample THIS song (descendants)
  const { data: samplers } = await supabaseClient
    .from('songs')
    .select('id')
    .eq('original_song_id', songId)
    .eq('is_remix', true)
    .limit(10);

  for (const sampler of samplers || []) {
    const child = await buildLineageTree(sampler.id, supabaseClient, visited, depth + 1);
    if (child) node.children.push(child);
  }

  return node;
}

async function findRootAncestor(songId, supabaseClient, visited = new Set()) {
  if (visited.has(songId)) return songId;
  visited.add(songId);

  const { data: song } = await supabaseClient
    .from('songs')
    .select('id, original_song_id')
    .eq('id', songId)
    .maybeSingle();

  if (!song?.original_song_id) return songId;
  return findRootAncestor(song.original_song_id, supabaseClient, visited);
}

export default function SampleLineageTree({ songId, onClose }) {
  const [tree, setTree] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!songId) return;
    loadTree();
  }, [songId]);

  async function loadTree() {
    setLoading(true);
    setError(null);
    try {
      const rootId = await findRootAncestor(songId, supabaseClient);
      const treeData = await buildLineageTree(rootId, supabaseClient);
      setTree(treeData);
      // Auto-select the current song
      setSelected(findNodeById(treeData, songId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function findNodeById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/8">
          <div>
            <h2 className="text-base font-bold text-white">Sample Family Tree</h2>
            <p className="text-xs text-white/40 mt-0.5">Full ancestry and derivatives</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Tree panel */}
          <div className="flex-1 overflow-y-auto p-4" style={{ minWidth: 0 }}>
            {loading && (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )}
            {error && (
              <div className="text-red-400 text-sm p-3 rounded-lg bg-red-500/10">{error}</div>
            )}
            {tree && !loading && (
              <TreeNode
                node={tree}
                depth={0}
                onSelect={setSelected}
                selectedId={selected?.id}
              />
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div
              className="w-56 flex-shrink-0 p-4 border-l border-white/8 overflow-y-auto"
              style={{ background: '#17171F' }}
            >
              <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Details</div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-white/40 mb-0.5">Title</div>
                  <div className="text-sm font-semibold text-white">{selected.title}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-0.5">Artist</div>
                  <div className="text-sm text-white">{selected.artist_name}</div>
                </div>
                {selected.tier && (
                  <div>
                    <div className="text-xs text-white/40 mb-1">Sample Tier</div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                      style={{
                        background: `${TIER_COLOR[selected.tier]}22`,
                        color: TIER_COLOR[selected.tier],
                        border: `1px solid ${TIER_COLOR[selected.tier]}44`,
                      }}
                    >
                      {selected.tier}
                    </span>
                  </div>
                )}
                {selected.royalty_rate > 0 && (
                  <div>
                    <div className="text-xs text-white/40 mb-0.5">Royalty Rate</div>
                    <div className="text-sm font-semibold" style={{ color: '#C9A84C' }}>
                      {(selected.royalty_rate * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {selected.sample_clearance_status && (
                  <div>
                    <div className="text-xs text-white/40 mb-0.5">Clearance</div>
                    <div className={`text-sm font-semibold capitalize ${
                      selected.sample_clearance_status === 'cleared' ? 'text-green-400' :
                      selected.sample_clearance_status === 'unlicensed' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {selected.sample_clearance_status}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-white/40 mb-0.5">Derivatives</div>
                  <div className="text-sm text-white">{(selected.children || []).length}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="p-3 border-t border-white/8 flex items-center gap-4">
          {Object.entries(TIER_COLOR).map(([tier, color]) => (
            <div key={tier} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-xs text-white/40 capitalize">{tier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
