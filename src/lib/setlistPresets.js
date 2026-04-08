/**
 * setlistPresets.js
 * localStorage-backed helpers for saving and loading named setlist loadouts.
 * All functions are pure or side-effect isolated — no React, no API calls.
 */

const STORAGE_KEY = 'xfactor:setlist_presets';
const MAX_PRESETS = 20;

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Build a named setlist preset payload (pure, no side effects).
 *
 * @param {string}   name    - Display name for the preset
 * @param {string[]} songIds - Array of song IDs
 * @returns {{ name: string, songIds: string[], createdAt: string }}
 */
export function buildNamedSetlistPreset(name, songIds) {
  return {
    name: String(name || '').trim(),
    songIds: Array.isArray(songIds) ? [...songIds] : [],
    createdAt: new Date().toISOString(),
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load all saved presets from localStorage.
 * Returns [] if storage is unavailable or corrupted.
 *
 * @returns {{ name: string, songIds: string[], createdAt: string }[]}
 */
export function loadSetlistPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save a preset. If a preset with the same name exists, it is overwritten.
 * Enforces MAX_PRESETS limit by dropping the oldest.
 *
 * @param {{ name: string, songIds: string[], createdAt?: string }} preset
 * @returns {boolean} true if saved successfully
 */
export function saveSetlistPreset(preset) {
  if (!preset?.name?.trim() || !Array.isArray(preset.songIds)) return false;
  try {
    const existing = loadSetlistPresets();
    const filtered = existing.filter((p) => p.name !== preset.name);
    const updated = [...filtered, { ...preset, createdAt: preset.createdAt || new Date().toISOString() }];
    // Drop oldest if over limit
    const trimmed = updated.length > MAX_PRESETS ? updated.slice(updated.length - MAX_PRESETS) : updated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a preset by name.
 *
 * @param {string} name
 * @returns {boolean} true if a preset was removed
 */
export function deleteSetlistPreset(name) {
  try {
    const existing = loadSetlistPresets();
    const filtered = existing.filter((p) => p.name !== name);
    if (filtered.length === existing.length) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Rename an existing preset.
 *
 * @param {string} oldName
 * @param {string} newName
 * @returns {boolean} true if renamed
 */
export function renameSetlistPreset(oldName, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) return false;
  try {
    const existing = loadSetlistPresets();
    const idx = existing.findIndex((p) => p.name === oldName);
    if (idx === -1) return false;
    const updated = [...existing];
    updated[idx] = { ...updated[idx], name: trimmed };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all presets.
 */
export function clearAllSetlistPresets() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
