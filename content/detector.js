/**
 * Reel Counter — Content Script: Reel Detector (v3 — Simplified & Robust)
 * 
 * APPROACH: Instead of complex container detection and IntersectionObserver,
 * we use a simple, reliable strategy:
 *   1. Poll every 300ms for ALL <video> elements on the page
 *   2. Find which video is currently "active" (playing or most visible)
 *   3. When the active video changes → count it as a scroll
 *   4. Also watch URL changes for YouTube (each Short = unique URL)
 * 
 * This works regardless of how Instagram or YouTube structures their DOM.
 */

(function () {
  'use strict';

  if (window.__reelCounterDetectorInit) return;
  window.__reelCounterDetectorInit = true;

  // ─── Config ─────────────────────────────────────────────────────────────

  const POLL_INTERVAL = 300;       // Check for active video every 300ms
  const COUNT_DELAY = 200;         // Wait 200ms before counting (prevents jitter)

  // ─── State ──────────────────────────────────────────────────────────────

  let platform = null;            // 'youtube' | 'instagram'
  let polling = false;            // Is the poll loop running?
  let pollTimer = null;
  let activeVideo = null;         // Currently active <video> element
  let pendingCountTimer = null;   // Timer before we finalize a count
  let lastCountedSrc = null;      // src/currentSrc of last counted video
  let lastUrl = '';               // For detecting YT URL changes
  let todayCount = 0;
  let firstDetection = true;      // Skip counting the very first detection

  // ─── Platform Detection ─────────────────────────────────────────────────

  function detectPlatform() {
    const h = location.hostname;
    if (h.includes('youtube.com')) return 'youtube';
    if (h.includes('instagram.com')) return 'instagram';
    return null;
  }

  function isReelsPage() {
    const url = location.href;
    if (platform === 'youtube') return /\/shorts/i.test(url);
    if (platform === 'instagram') return /\/reel/i.test(url);
    return false;
  }

  // ─── Core: Find the Currently Active Video ─────────────────────────────

  function findActiveVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length === 0) return null;

    // Strategy 1: Find a video that is currently PLAYING and visible
    let bestPlaying = null;
    let bestPlayingArea = 0;

    // Strategy 2: Find the video with the most viewport visibility
    let bestVisible = null;
    let bestVisibleArea = 0;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (const video of videos) {
      // Skip tiny videos (thumbnails, ads, etc.)
      if (video.offsetWidth < 100 || video.offsetHeight < 100) continue;
      // Skip hidden videos
      if (video.offsetParent === null) continue;

      const rect = video.getBoundingClientRect();
      
      // Calculate how much of this video is visible in the viewport
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(vw, rect.right);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleWidth * visibleHeight;
      const totalArea = rect.width * rect.height;
      const visibleRatio = totalArea > 0 ? visibleArea / totalArea : 0;

      // Must be at least 30% visible
      if (visibleRatio < 0.3) continue;

      // Check if playing
      if (!video.paused && video.readyState >= 2) {
        if (visibleArea > bestPlayingArea) {
          bestPlayingArea = visibleArea;
          bestPlaying = video;
        }
      }

      // Track most visible regardless
      if (visibleArea > bestVisibleArea) {
        bestVisibleArea = visibleArea;
        bestVisible = video;
      }
    }

    // Prefer a playing video, fall back to most visible
    return bestPlaying || bestVisible;
  }

  // ─── Core: Get a Unique Identifier for a Video ─────────────────────────

  function getVideoId(video) {
    // Use the video's current source as an identifier
    // This changes when you scroll to a new reel/short
    if (video.currentSrc) return video.currentSrc;
    if (video.src) return video.src;
    // Fallback: use source element
    const source = video.querySelector('source');
    if (source && source.src) return source.src;
    // Last resort: use the video's position in DOM
    const videos = document.querySelectorAll('video');
    return 'pos_' + Array.from(videos).indexOf(video);
  }

  // ─── Core: Poll Loop ───────────────────────────────────────────────────

  function pollForActiveVideo() {
    if (!polling) return;

    // Check if we're still on a reels/shorts page
    if (!isReelsPage()) {
      // Keep polling but don't detect — user might navigate back
      pollTimer = setTimeout(pollForActiveVideo, POLL_INTERVAL * 3);
      return;
    }

    const video = findActiveVideo();

    if (video && video !== activeVideo) {
      // The active video changed!
      const videoId = getVideoId(video);
      const prevVideo = activeVideo;
      activeVideo = video;

      // Clear any pending count
      if (pendingCountTimer) {
        clearTimeout(pendingCountTimer);
        pendingCountTimer = null;
      }

      // On the VERY FIRST detection after page load, don't count
      // (user just opened the page, didn't scroll yet)
      if (firstDetection) {
        firstDetection = false;
        lastCountedSrc = videoId;
      } else {
        // Start count timer
        pendingCountTimer = setTimeout(() => {
          // Verify the same video is still active
          if (activeVideo === video) {
            // Count it! (even if same src as before — user scrolled away and back)
            lastCountedSrc = videoId;
            doCount();
          }
        }, COUNT_DELAY);
      }
    }

    // For YouTube: also detect URL changes (each Short has unique URL)
    if (platform === 'youtube') {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl && lastUrl !== '') {
        const wasShorts = /\/shorts\//i.test(lastUrl);
        const isShorts = /\/shorts\//i.test(currentUrl);
        if (wasShorts && isShorts) {
          // URL changed between two different shorts — definitely scrolled
          // The video change detection above should catch it, but this is a backup
          if (!pendingCountTimer && !firstDetection) {
            pendingCountTimer = setTimeout(() => {
              doCount();
            }, COUNT_DELAY);
          }
        }
      }
      lastUrl = currentUrl;
    }

    pollTimer = setTimeout(pollForActiveVideo, POLL_INTERVAL);
  }

  // ─── Count a Reel ─────────────────────────────────────────────────────

  function doCount() {
    todayCount++;

    try {
      chrome.runtime.sendMessage(
        { type: 'REEL_COUNTED', platform: platform },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[ReelCounter] Message error:', chrome.runtime.lastError.message);
            return;
          }
          if (response && response.stats) {
            todayCount = response.stats.total;
            window.dispatchEvent(
              new CustomEvent('reelcounter:update', { detail: { stats: response.stats } })
            );
          }
        }
      );
    } catch (e) {
      console.warn('[ReelCounter] Send failed:', e);
    }

    console.log(`[ReelCounter] 🎬 Reel #${todayCount} on ${platform}`);
  }

  // ─── Start / Stop ─────────────────────────────────────────────────────

  function startPolling() {
    if (polling) return;
    polling = true;
    firstDetection = true;
    activeVideo = null;
    lastCountedSrc = null;
    lastUrl = location.href;
    console.log(`[ReelCounter] ▶️ Polling started on ${platform}`);
    pollForActiveVideo();
  }

  function stopPolling() {
    polling = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pendingCountTimer) { clearTimeout(pendingCountTimer); pendingCountTimer = null; }
    console.log('[ReelCounter] ⏹️ Polling stopped');
  }

  // ─── SPA Navigation Watchers ──────────────────────────────────────────

  function watchNavigation() {
    // YouTube SPA events
    if (platform === 'youtube') {
      document.addEventListener('yt-navigate-finish', () => {
        firstDetection = true;
        activeVideo = null;
        if (isReelsPage() && !polling) startPolling();
      });
    }

    // Generic: watch pushState / replaceState / popstate
    const origPush = history.pushState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      onUrlChange();
    };
    const origReplace = history.replaceState;
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      onUrlChange();
    };
    window.addEventListener('popstate', onUrlChange);

    function onUrlChange() {
      setTimeout(() => {
        if (isReelsPage()) {
          if (!polling) {
            firstDetection = true;
            activeVideo = null;
            startPolling();
          }
        }
      }, 200);
    }
  }

  // ─── Message Listener (from background) ──────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATS_UPDATED') {
      todayCount = message.stats.total;
      window.dispatchEvent(
        new CustomEvent('reelcounter:update', { detail: { stats: message.stats } })
      );
    } else if (message.type === 'LIMIT_REACHED') {
      window.dispatchEvent(
        new CustomEvent('reelcounter:limit-reached', { detail: message })
      );
    } else if (message.type === 'LIMIT_WARNING') {
      window.dispatchEvent(
        new CustomEvent('reelcounter:limit-warning', { detail: message })
      );
    } else if (message.type === 'UPDATE_SETTINGS') {
      window.dispatchEvent(
        new CustomEvent('reelcounter:settings-updated', { detail: { settings: message.settings } })
      );
    }
  });

  // ─── Init ───────────────────────────────────────────────────────────────

  function init() {
    platform = detectPlatform();
    if (!platform) return;

    console.log(`[ReelCounter] 🚀 Detector v3 initialized on ${platform}`);

    // Load initial stats
    try {
      chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' }, (r) => {
        if (chrome.runtime.lastError) return;
        if (r && r.stats) {
          todayCount = r.stats.total;
          window.dispatchEvent(
            new CustomEvent('reelcounter:update', { detail: { stats: r.stats } })
          );
        }
      });
    } catch (e) { /* ignore */ }

    // Set up navigation watchers
    watchNavigation();

    // Start polling — always poll, the poll loop checks isReelsPage() internally
    startPolling();

    window.__reelCounterPlatform = platform;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
