/**
 * Event Thumbnail System (M5)
 * Deterministic stock image selection for underground events.
 * Uses Unsplash source URLs with curated photo IDs per event type.
 */

// ─── Photo pools per event type (≥6 each, 8 types) ──────────────
// Each entry is an Unsplash photo ID. The full URL is constructed at runtime.
const PHOTO_POOLS: Record<string, string[]> = {
  open_mic: [
    'YTjMXGhOZDs', 'hgO1wFPXl3I', 'JO19V2RTXCI', 'iXqCT5r8hwA',
    'SY20hLiGecE', 'Ak5c5VTch5E', 'W_9mOGUwR08', 'qnWPjzewski',
  ],
  showcase: [
    '1HCb2gPk3ik', 'LEgwEaBVGMo', 'JmDdnfnQZVQ', 'hzgs56Ze49s',
    'AHBvAIVqk64', 'N7rl2dYx6tw', 'GcinB4ESWPY', 'YRMWVcdyhmI',
  ],
  battle: [
    'JmF_RJdt5K0', '1oKxSKSOowE', 'YI_9SivVt_s', 'pPquxoraq_M',
    'rX12B5uX7QM', 'm1WZS5ye404', 'n1B6ftPB55E', '7BjmDICVloE',
  ],
  collab_night: [
    'hTv8aaPziOQ', 'CSpjU6hYnFg', 'DOoYFgTQWfs', 'y2azHvupCVo',
    'MYbhN8KaaEc', 'xTSA3MsfVJo', 'Av_PUsmgukg', 'J39X2xX_8CQ',
  ],
  block_party: [
    'aWf7mjwwJJo', 'MEL-jJnm7RQ', 'hV2bRMEYFL0', '2PODhmrvLik',
    'KnBAq428Bfc', 'cOxM03AVLPs', 'J75UCf8hHcM', 'NYrVisodQ2M',
  ],
  listening_party: [
    'FV_PxCqMqOI', 'SlhksGewbf0', 'DJ4vjcD-wkg', 'qy0BHykaq0E',
    'WahfNoqbYnM', 'OKOOGO578eo', 'HXiUidwVz0I', 'byGTytEGjBo',
  ],
  radio: [
    'PDRFeeDniCk', 'JJMoAiVl9jA', 'tLKOj6cNwe0', 'Wc8k4Qp9ejo',
    'Jc3tSAVmgrg', 'LY1eyQMFeyo', 'gdTxVSAE5sk', 'OzBLe_jW0Vc',
  ],
  festival_slot: [
    'hzgs56Ze49s', 'pPquxoraq_M', 'MEL-jJnm7RQ', 'JmDdnfnQZVQ',
    '1HCb2gPk3ik', 'rX12B5uX7QM', 'aWf7mjwwJJo', 'LEgwEaBVGMo',
  ],
};

const FALLBACK_POOL = PHOTO_POOLS.showcase;

// ─── Hash function (matches sceneMath.ts hashStr pattern) ────────
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildUrl(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?w=400&h=300&fit=crop&auto=format`;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Deterministic thumbnail for a single event.
 * Same inputs always produce the same URL.
 */
export function getEventThumbnail(eventType: string, city: string, seed: number = 0): string {
  const pool = PHOTO_POOLS[eventType] || FALLBACK_POOL;
  const idx = hashStr(city + eventType + String(seed)) % pool.length;
  return buildUrl(pool[idx]);
}

/**
 * Batch thumbnail generation with anti-collision.
 * Returns `count` distinct URLs for the same eventType+city context.
 * Caps at pool size to prevent infinite loops.
 */
export function getEventThumbnailBatch(eventType: string, city: string, count: number): string[] {
  const pool = PHOTO_POOLS[eventType] || FALLBACK_POOL;
  const maxUnique = pool.length;
  const actualCount = Math.min(count, maxUnique);

  const used = new Set<string>();
  const urls: string[] = [];
  let seed = 0;

  while (urls.length < actualCount && seed < maxUnique * 10) {
    const idx = hashStr(city + eventType + String(seed)) % pool.length;
    const photoId = pool[idx];
    if (!used.has(photoId)) {
      used.add(photoId);
      urls.push(buildUrl(photoId));
    }
    seed++;
  }

  return urls;
}
