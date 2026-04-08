export function getArtworkUrl(item) {
  if (!item || typeof item !== "object") return "";
  const primary = item.cover_artwork_url;
  if (typeof primary === 'string' && primary.trim() !== '') return primary;

  const legacy = item.cover_art_url;
  if (typeof legacy === 'string' && legacy.trim() !== '') return legacy;

  return "";
}
