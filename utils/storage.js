/**
 * Reel Counter — Storage Utilities
 * Wrapper around chrome.storage.local for managing stats and settings.
 */

import { DEFAULT_SETTINGS, STORAGE_KEYS, getTodayKey, getDateKey } from './constants.js';

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * Get current settings, merged with defaults.
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

/**
 * Update settings (partial merge).
 */
export async function updateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}

// ─── Daily Stats ────────────────────────────────────────────────────────────

/**
 * Get today's stats.
 * Returns: { total: number, youtube: number, instagram: number, sessions: number, firstSeen: timestamp, lastSeen: timestamp }
 */
export async function getTodayStats() {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  return result[key] || createEmptyStats();
}

/**
 * Increment reel count for a platform.
 * @param {'youtube' | 'instagram'} platform
 * @returns Updated stats
 */
export async function incrementCount(platform) {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  const stats = result[key] || createEmptyStats();

  stats.total += 1;
  stats[platform] = (stats[platform] || 0) + 1;
  stats.lastSeen = Date.now();

  if (!stats.firstSeen) {
    stats.firstSeen = Date.now();
  }

  await chrome.storage.local.set({ [key]: stats });
  return stats;
}

/**
 * Reset today's stats.
 */
export async function resetToday() {
  const key = getTodayKey();
  await chrome.storage.local.set({ [key]: createEmptyStats() });
}

// ─── Weekly Stats ───────────────────────────────────────────────────────────

/**
 * Get stats for the last N days.
 * @param {number} days - Number of days to look back (default: 7)
 * @returns Array of { date: string, total: number, youtube: number, instagram: number }
 */
export async function getWeeklyStats(days = 7) {
  const keys = [];
  for (let i = 0; i < days; i++) {
    keys.push(getDateKey(i));
  }

  const results = await chrome.storage.local.get(keys);
  const stats = [];

  for (let i = days - 1; i >= 0; i--) {
    const key = getDateKey(i);
    const dateStr = key.replace(STORAGE_KEYS.STATS_PREFIX, '');
    const dayStats = results[key] || createEmptyStats();

    stats.push({
      date: dateStr,
      dayLabel: getDayLabel(i),
      total: dayStats.total,
      youtube: dayStats.youtube || 0,
      instagram: dayStats.instagram || 0,
    });
  }

  return stats;
}

/**
 * Get all-time totals.
 */
export async function getAllTimeStats() {
  const allData = await chrome.storage.local.get(null);
  let total = 0;
  let youtube = 0;
  let instagram = 0;
  let daysTracked = 0;

  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith(STORAGE_KEYS.STATS_PREFIX) && value && typeof value.total === 'number') {
      total += value.total;
      youtube += value.youtube || 0;
      instagram += value.instagram || 0;
      daysTracked++;
    }
  }

  return { total, youtube, instagram, daysTracked, dailyAverage: daysTracked > 0 ? Math.round(total / daysTracked) : 0 };
}

// ─── Overlay Position ───────────────────────────────────────────────────────

/**
 * Save overlay position.
 */
export async function saveOverlayPosition(position) {
  await chrome.storage.local.set({ [STORAGE_KEYS.OVERLAY_POSITION]: position });
}

/**
 * Get saved overlay position.
 */
export async function getOverlayPosition() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OVERLAY_POSITION);
  return result[STORAGE_KEYS.OVERLAY_POSITION] || { x: 20, y: 100 };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createEmptyStats() {
  return {
    total: 0,
    youtube: 0,
    instagram: 0,
    sessions: 0,
    firstSeen: null,
    lastSeen: null,
  };
}

function getDayLabel(daysAgo) {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// ─── Cleanup old data (older than 90 days) ──────────────────────────────────

export async function cleanupOldData() {
  const allData = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const keysToRemove = [];
  for (const key of Object.keys(allData)) {
    if (key.startsWith(STORAGE_KEYS.STATS_PREFIX)) {
      const dateStr = key.replace(STORAGE_KEYS.STATS_PREFIX, '');
      const date = new Date(dateStr);
      if (date < cutoff) {
        keysToRemove.push(key);
      }
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}
