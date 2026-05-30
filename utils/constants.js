/**
 * Reel Counter — Constants & Configuration
 * Platform detection selectors, default settings, and brain state thresholds.
 */

// ─── Platform Configurations ────────────────────────────────────────────────

export const PLATFORMS = {
  YOUTUBE: {
    id: 'youtube',
    name: 'YouTube Shorts',
    icon: '▶️',
    hostPatterns: ['www.youtube.com', 'youtube.com', 'm.youtube.com'],
    // Selectors for detecting Shorts
    selectors: {
      // The reel container in the Shorts feed
      reelContainer: 'ytd-reel-video-renderer, ytd-shorts-video-renderer',
      // The video element inside a Short
      videoElement: 'video',
      // The Shorts feed container
      feedContainer: '#shorts-container, ytd-shorts',
      // SPA navigation event
      navigationEvent: 'yt-navigate-finish',
      // URL pattern for Shorts
      urlPattern: /\/shorts\//i,
    },
  },
  INSTAGRAM: {
    id: 'instagram',
    name: 'Instagram Reels',
    icon: '📸',
    hostPatterns: ['www.instagram.com', 'instagram.com'],
    selectors: {
      // Reel containers in IG
      reelContainer: 'div[role="presentation"] article, div._aagu, div._ab8w',
      // Video element inside a Reel
      videoElement: 'video',
      // The Reels feed
      feedContainer: 'main[role="main"]',
      // URL pattern for Reels
      urlPattern: /\/reels?\//i,
    },
  },
};

// ─── Detection Settings ─────────────────────────────────────────────────────

export const DETECTION = {
  // Minimum visibility ratio to consider a reel "in view"
  VISIBILITY_THRESHOLD: 0.5,
  // Minimum time (ms) a reel must be visible to count as "watched"
  MIN_WATCH_TIME_MS: 1000,
  // Debounce delay for scroll detection
  DEBOUNCE_MS: 300,
  // How often (ms) to check for DOM changes as a fallback
  POLL_INTERVAL_MS: 2000,
};

// ─── Brain State Thresholds ─────────────────────────────────────────────────

export const BRAIN_STATES = {
  HEALTHY: {
    id: 'healthy',
    label: 'Healthy',
    emoji: '🧠',
    minCount: 0,
    maxCount: 15,
    color: '#10b981',       // Emerald green
    glowColor: '#34d399',
    description: 'Your brain is thriving! Keep it up.',
  },
  TIRED: {
    id: 'tired',
    label: 'Tired',
    emoji: '😴',
    minCount: 16,
    maxCount: 35,
    color: '#f59e0b',       // Amber
    glowColor: '#fbbf24',
    description: 'Your brain is getting tired. Maybe take a break?',
  },
  FRIED: {
    id: 'fried',
    label: 'Fried',
    emoji: '🔥',
    minCount: 36,
    maxCount: Infinity,
    color: '#ef4444',       // Red
    glowColor: '#f87171',
    description: 'Your brain is fried! Time to stop scrolling.',
  },
};

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  // Daily reel limit (0 = unlimited)
  dailyLimit: 50,
  // Show overlay widget on tracked pages
  showOverlay: true,
  // Overlay position
  overlayPosition: { x: 20, y: 100 },
  // Play sound on count increment
  soundEnabled: false,
  // Show browser notification when limit is near
  notifyAtPercent: 80,
  // Enable blocking when limit is reached
  blockOnLimit: false,
  // Track YouTube Shorts
  trackYouTube: true,
  // Track Instagram Reels
  trackInstagram: true,
};

// ─── Storage Keys ───────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  SETTINGS: 'reel_counter_settings',
  STATS_PREFIX: 'stats_',
  WEEKLY_CACHE: 'weekly_cache',
  OVERLAY_POSITION: 'overlay_position',
  FIRST_INSTALL: 'first_install_date',
};

// ─── Message Types ──────────────────────────────────────────────────────────

export const MESSAGES = {
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

// ─── UI Constants ───────────────────────────────────────────────────────────

export const UI = {
  POPUP_WIDTH: 380,
  POPUP_HEIGHT: 520,
  OVERLAY_SIZE: 56,
  OVERLAY_EXPANDED_WIDTH: 240,
  ANIMATION_DURATION_MS: 300,
  CHART_DAYS: 7,
  COLORS: {
    bgPrimary: '#0a0a1a',
    bgSecondary: '#1a1a2e',
    bgCard: 'rgba(255, 255, 255, 0.05)',
    bgCardHover: 'rgba(255, 255, 255, 0.08)',
    accentPurple: '#7c3aed',
    accentCyan: '#06b6d4',
    accentGradient: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: 'rgba(255, 255, 255, 0.1)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
};

// ─── Helper: Get brain state for a given count ──────────────────────────────

export function getBrainState(count) {
  if (count <= BRAIN_STATES.HEALTHY.maxCount) return BRAIN_STATES.HEALTHY;
  if (count <= BRAIN_STATES.TIRED.maxCount) return BRAIN_STATES.TIRED;
  return BRAIN_STATES.FRIED;
}

// ─── Helper: Get today's date key ──────────────────────────────────────────

export function getTodayKey() {
  const now = new Date();
  return `${STORAGE_KEYS.STATS_PREFIX}${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Helper: Get date key for N days ago ────────────────────────────────────

export function getDateKey(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${STORAGE_KEYS.STATS_PREFIX}${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
