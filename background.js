import { CLOUD_CONFIG } from './utils/config.js';

/**
 * Reel Counter — Background Service Worker
 * Manages state, badge updates, alarms for daily reset, and messaging.
 * 
 * NOTE: Content scripts cannot use ES module imports, so this service worker
 * duplicates some constants/logic that content scripts also need.
 */

// ─── Constants (duplicated here since service worker is a module but we need
//     them inline for quick access) ──────────────────────────────────────────

const STORAGE_KEYS = {
  SETTINGS: 'reel_counter_settings',
  STATS_PREFIX: 'stats_',
  OVERLAY_POSITION: 'overlay_position',
};

const DEFAULT_SETTINGS = {
  dailyLimit: 50,
  showOverlay: true,
  overlayPosition: { x: 20, y: 100 },
  soundEnabled: false,
  notifyAtPercent: 80,
  blockOnLimit: false,
  trackYouTube: true,
  trackInstagram: true,
};

const MESSAGES = {
  REEL_COUNTED: 'REEL_COUNTED',
  GET_TODAY_STATS: 'GET_TODAY_STATS',
  GET_WEEKLY_STATS: 'GET_WEEKLY_STATS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_SETTINGS: 'GET_SETTINGS',
  RESET_TODAY: 'RESET_TODAY',
  STATS_UPDATED: 'STATS_UPDATED',
  LIMIT_REACHED: 'LIMIT_REACHED',
  LIMIT_WARNING: 'LIMIT_WARNING',
};

const BRAIN_STATES = {
  HEALTHY: { id: 'healthy', maxCount: 15, color: '#10b981' },
  TIRED: { id: 'tired', maxCount: 35, color: '#f59e0b' },
  FRIED: { id: 'fried', maxCount: Infinity, color: '#ef4444' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTodayKey() {
  const now = new Date();
  return `${STORAGE_KEYS.STATS_PREFIX}${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getDateKey(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${STORAGE_KEYS.STATS_PREFIX}${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createEmptyStats() {
  return { total: 0, youtube: 0, instagram: 0, sessions: 0, firstSeen: null, lastSeen: null };
}

function getBrainState(count) {
  if (count <= BRAIN_STATES.HEALTHY.maxCount) return BRAIN_STATES.HEALTHY;
  if (count <= BRAIN_STATES.TIRED.maxCount) return BRAIN_STATES.TIRED;
  return BRAIN_STATES.FRIED;
}

function getDayLabel(daysAgo) {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// ─── Storage Operations ─────────────────────────────────────────────────────

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

async function updateSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}

async function getTodayStats() {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  return result[key] || createEmptyStats();
}

async function incrementCount(platform) {
  const key = getTodayKey();
  const result = await chrome.storage.local.get(key);
  const stats = result[key] || createEmptyStats();

  stats.total += 1;
  stats[platform] = (stats[platform] || 0) + 1;
  stats.lastSeen = Date.now();
  if (!stats.firstSeen) stats.firstSeen = Date.now();

  await chrome.storage.local.set({ [key]: stats });
  return stats;
}

async function getWeeklyStats(days = 7) {
  const keys = [];
  for (let i = 0; i < days; i++) keys.push(getDateKey(i));
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

// ─── Badge Update ───────────────────────────────────────────────────────────

async function updateBadge(count) {
  const brainState = getBrainState(count);
  const text = count > 0 ? String(count) : '';

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: brainState.color });
  await chrome.action.setTitle({ title: `Reel Counter — ${count} reels today` });
}

// ─── Limit Check ────────────────────────────────────────────────────────────

async function checkLimit(stats) {
  const settings = await getSettings();
  if (settings.dailyLimit <= 0) return; // No limit set

  const percent = (stats.total / settings.dailyLimit) * 100;

  if (stats.total >= settings.dailyLimit) {
    // Limit reached — notify all content script tabs
    broadcastToTabs({ type: MESSAGES.LIMIT_REACHED, stats, limit: settings.dailyLimit });
  } else if (percent >= settings.notifyAtPercent) {
    // Approaching limit
    broadcastToTabs({ type: MESSAGES.LIMIT_WARNING, stats, limit: settings.dailyLimit, percent: Math.round(percent) });
  }
}

// ─── Tab Broadcasting ───────────────────────────────────────────────────────

async function broadcastToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://*.instagram.com/*'] });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Tab might not have content script loaded
      }
    }
  } catch {
    // Ignore errors
  }
}

async function ensureFirebaseAuthenticated() {
  try {
    if (!CLOUD_CONFIG.FIREBASE_API_KEY || CLOUD_CONFIG.FIREBASE_API_KEY.includes('YOUR_FIREBASE_API_KEY')) return null;

    const storage = await chrome.storage.local.get(['firebase_uid', 'my_username', 'my_friend_code']);
    let uid = storage.firebase_uid;
    let name = storage.my_username || 'You';
    let code = storage.my_friend_code;

    if (!uid) {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CLOUD_CONFIG.FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });
      const data = await res.json();
      if (data && data.localId) {
        uid = data.localId;
        await chrome.storage.local.set({ firebase_uid: uid });
        console.log('[ReelCounter BG] Firebase Anonymous Auth successful! UID:', uid);
      } else {
        throw new Error('Anonymous Auth API failed');
      }
    }

    if (!code) {
      code = generateRandomFriendCode();
      await chrome.storage.local.set({ my_friend_code: code });
    }

    await upsertSupabaseProfile(uid, code, name);
    return uid;
  } catch (error) {
    console.warn('[ReelCounter BG] Auth/Sync failed:', error);
    return null;
  }
}

function generateRandomFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randPart = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `REEL-${randPart()}-${randPart()}`;
}

async function upsertSupabaseProfile(uid, code, name) {
  try {
    if (!CLOUD_CONFIG.SUPABASE_URL || CLOUD_CONFIG.SUPABASE_URL.includes('your-supabase-project')) return;
    
    const stats = await getTodayStats();
    
    const payload = {
      firebase_uid: uid,
      friend_code: code,
      username: name,
      avatar: '🧠',
      daily_count: stats.total,
      weekly_count: stats.total * 6
    };

    const res = await fetch(`${CLOUD_CONFIG.SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': CLOUD_CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CLOUD_CONFIG.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      console.log('[ReelCounter BG] Supabase sync completed successfully.');
    } else {
      const errText = await res.text();
      console.warn('[ReelCounter BG] Supabase upsert returned error status:', res.status, errText);
    }
  } catch (error) {
    console.warn('[ReelCounter BG] Supabase upsert failed:', error);
  }
}

async function syncProfileToCloud() {
  try {
    if (!CLOUD_CONFIG.SUPABASE_URL || CLOUD_CONFIG.SUPABASE_URL.includes('your-supabase-project')) return 0;

    const storage = await chrome.storage.local.get(['firebase_uid', 'my_username', 'my_friend_code']);
    let uid = storage.firebase_uid;

    if (!uid) {
      uid = await ensureFirebaseAuthenticated();
    }
    if (!uid) return 0;

    const res = await fetch(`${CLOUD_CONFIG.SUPABASE_URL}/rest/v1/rpc/increment_user_reels`, {
      method: 'POST',
      headers: {
        'apikey': CLOUD_CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CLOUD_CONFIG.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_uid: uid })
    });
    
    if (res.ok) {
      const serverCount = await res.json();
      if (typeof serverCount === 'number') {
        console.log('[ReelCounter BG] Securely incremented on cloud. Server count:', serverCount);
        return serverCount;
      }
    } else {
      console.warn('[ReelCounter BG] Secure RPC increment failed status:', res.status);
    }
  } catch (e) {
    console.warn('[ReelCounter BG] Supabase RPC increment failed:', e);
  }
  return 0;
}

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // We must return true for async responses
  (async () => {
    try {
      switch (message.type) {
        case MESSAGES.REEL_COUNTED: {
          const stats = await incrementCount(message.platform);
          await checkLimit(stats);
          
          // Securely increment count in cloud
          const serverCount = await syncProfileToCloud();
          if (serverCount > 0 && serverCount !== stats.total) {
            stats.total = serverCount;
            const key = getTodayKey();
            await chrome.storage.local.set({ [key]: stats });
          }

          await updateBadge(stats.total);
          // Broadcast updated stats to all tabs
          broadcastToTabs({ type: MESSAGES.STATS_UPDATED, stats });
          sendResponse({ success: true, stats });
          break;
        }
        case MESSAGES.GET_TODAY_STATS: {
          const stats = await getTodayStats();
          sendResponse({ success: true, stats });
          break;
        }
        case MESSAGES.GET_WEEKLY_STATS: {
          const stats = await getWeeklyStats(message.days || 7);
          sendResponse({ success: true, stats });
          break;
        }
        case MESSAGES.GET_SETTINGS: {
          const settings = await getSettings();
          sendResponse({ success: true, settings });
          break;
        }
        case MESSAGES.UPDATE_SETTINGS: {
          const settings = await updateSettings(message.settings);
          broadcastToTabs({ type: MESSAGES.UPDATE_SETTINGS, settings });
          sendResponse({ success: true, settings });
          break;
        }
        case MESSAGES.RESET_TODAY: {
          const key = getTodayKey();
          await chrome.storage.local.set({ [key]: createEmptyStats() });
          await updateBadge(0);
          broadcastToTabs({ type: MESSAGES.STATS_UPDATED, stats: createEmptyStats() });
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[ReelCounter BG] Error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
});

// ─── Alarms (Daily Reset) ───────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-reset') {
    // Badge and state will naturally reset because getTodayKey() changes
    await updateBadge(0);
    broadcastToTabs({ type: MESSAGES.STATS_UPDATED, stats: createEmptyStats() });
    console.log('[ReelCounter] Daily reset triggered');
  }

  if (alarm.name === 'cleanup') {
    // Remove data older than 90 days
    const allData = await chrome.storage.local.get(null);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const keysToRemove = [];
    for (const key of Object.keys(allData)) {
      if (key.startsWith(STORAGE_KEYS.STATS_PREFIX)) {
        const dateStr = key.replace(STORAGE_KEYS.STATS_PREFIX, '');
        if (new Date(dateStr) < cutoff) keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);
  }
});

// ─── Extension Install / Startup ────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ReelCounter] Installed:', details.reason);

  // Set up daily reset alarm at midnight
  setupAlarms();

  // Perform Firebase Auth check
  await ensureFirebaseAuthenticated();

  // Initialize badge
  const stats = await getTodayStats();
  await updateBadge(stats.total);

  if (details.reason === 'install') {
    // First install — save install date
    await chrome.storage.local.set({ [STORAGE_KEYS.FIRST_INSTALL]: Date.now() });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  setupAlarms();
  await ensureFirebaseAuthenticated();
  const stats = await getTodayStats();
  await updateBadge(stats.total);
});

function setupAlarms() {
  // Calculate milliseconds until next midnight
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  // Set alarm for midnight, repeating daily
  chrome.alarms.create('daily-reset', {
    when: Date.now() + msUntilMidnight,
    periodInMinutes: 24 * 60,
  });

  // Weekly cleanup alarm
  chrome.alarms.create('cleanup', {
    periodInMinutes: 24 * 60 * 7, // weekly
  });
}
