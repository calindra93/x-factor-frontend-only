export function buildXpressFeedPosts({ allPosts = [], feedTab = 'latest', myFollowing = new Set(), currentPlayerId = null, searchQuery = '', profileMap = {} }) {
  let posts = [...allPosts];
  const sortByNewest = (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

  if (feedTab === 'latest') {
    posts.sort(sortByNewest);
  } else if (feedTab === 'foryou') {
    posts.sort((a, b) => {
      const createdAtA = new Date(a.created_at || 0).getTime();
      const createdAtB = new Date(b.created_at || 0).getTime();
      const scoreA = createdAtA + (a.likes || 0) * 2 + (a.shares || 0) * 5 + (a.views || 0) * 0.05;
      const scoreB = createdAtB + (b.likes || 0) * 2 + (b.shares || 0) * 5 + (b.views || 0) * 0.05;
      return scoreB - scoreA;
    });
  } else if (feedTab === 'following') {
    const followingPosts = posts.filter((p) => myFollowing.has(p.artist_id) || p.artist_id === currentPlayerId);
    const followingIds = new Set(followingPosts.map((post) => post.id));
    const fallbackPosts = posts.filter((post) => !followingIds.has(post.id));
    followingPosts.sort(sortByNewest);
    fallbackPosts.sort(sortByNewest);
    posts = [...followingPosts, ...fallbackPosts];
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    posts = posts.filter((p) => {
      const author = profileMap[p.artist_id];
      const outletName = p?.metadata?.media_outlet_name || p?.metadata?.platform_name || p?.metadata?.npc_username || '';
      const outletHandle = p?.metadata?.media_outlet_handle || p?.metadata?.platform_handle || p?.metadata?.npc_handle || '';
      return (
        (p.caption || '').toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        (author?.artist_name || '').toLowerCase().includes(q) ||
        (author?.xpress_handle || '').toLowerCase().includes(q) ||
        outletName.toLowerCase().includes(q) ||
        outletHandle.toLowerCase().includes(q)
      );
    });
  }

  return posts.slice(0, 30);
}
