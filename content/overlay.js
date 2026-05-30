/**
 * Reel Counter — Content Script: Floating Overlay Widget
 * Injects a draggable floating counter bubble into the page.
 * Premium glassmorphism design with brain state visualization.
 */

(function () {
  'use strict';

  // Prevent double-initialization
  if (window.__reelCounterOverlayInit) return;
  window.__reelCounterOverlayInit = true;

  // ─── Brain States ───────────────────────────────────────────────────────

  const BRAIN_STATES = {
    healthy: {
      emoji: '🧠',
      label: 'Healthy',
      color: '#10b981',
      glow: '#34d399',
      bg: 'rgba(16, 185, 129, 0.15)',
      maxCount: 15,
    },
    tired: {
      emoji: '😴',
      label: 'Tired',
      color: '#f59e0b',
      glow: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.15)',
      maxCount: 35,
    },
    fried: {
      emoji: '🔥',
      label: 'Fried',
      color: '#ef4444',
      glow: '#f87171',
      bg: 'rgba(239, 68, 68, 0.15)',
      maxCount: Infinity,
    },
  };

  // ─── State ──────────────────────────────────────────────────────────────

  let count = 0;
  let dailyLimit = 50;
  let isExpanded = false;
  let isDragging = false;
  let isVisible = true;
  let dragOffset = { x: 0, y: 0 };
  let position = { x: 20, y: 100 };
  let stats = { total: 0, youtube: 0, instagram: 0 };
  let overlay = null;
  let prevCount = 0;

  // ─── Create Overlay DOM ─────────────────────────────────────────────────

  function createOverlay() {
    // Remove existing overlay if any
    const existing = document.getElementById('reel-counter-overlay');
    if (existing) existing.remove();

    overlay = document.createElement('div');
    overlay.id = 'reel-counter-overlay';
    overlay.innerHTML = `
      <div class="rc-widget" id="rc-widget">
        <!-- Collapsed View: Just the counter bubble -->
        <div class="rc-bubble" id="rc-bubble">
          <div class="rc-bubble-brain" id="rc-brain-emoji">🧠</div>
          <div class="rc-bubble-count" id="rc-count">0</div>
          <svg class="rc-progress-ring" width="60" height="60" id="rc-progress-ring">
            <circle class="rc-progress-bg" cx="30" cy="30" r="26" />
            <circle class="rc-progress-fill" cx="30" cy="30" r="26" id="rc-progress-fill" />
          </svg>
        </div>

        <!-- Expanded View: Detailed stats -->
        <div class="rc-expanded" id="rc-expanded">
          <div class="rc-expanded-header">
            <span class="rc-expanded-title">Reel Counter</span>
            <button class="rc-close-btn" id="rc-close-btn" title="Collapse">✕</button>
          </div>

          <div class="rc-stat-main">
            <div class="rc-stat-count" id="rc-stat-count">0</div>
            <div class="rc-stat-label">reels today</div>
          </div>

          <div class="rc-brain-state" id="rc-brain-state">
            <span class="rc-brain-icon" id="rc-brain-icon">🧠</span>
            <span class="rc-brain-label" id="rc-brain-label">Healthy</span>
          </div>

          <div class="rc-limit-bar" id="rc-limit-section">
            <div class="rc-limit-text">
              <span id="rc-limit-current">0</span>
              <span class="rc-limit-separator">/</span>
              <span id="rc-limit-max">50</span>
            </div>
            <div class="rc-limit-track">
              <div class="rc-limit-fill" id="rc-limit-fill"></div>
            </div>
          </div>

          <div class="rc-platform-breakdown">
            <div class="rc-platform-item">
              <span class="rc-platform-icon">▶️</span>
              <span class="rc-platform-name">YouTube</span>
              <span class="rc-platform-count" id="rc-yt-count">0</span>
            </div>
            <div class="rc-platform-item">
              <span class="rc-platform-icon">📸</span>
              <span class="rc-platform-name">Instagram</span>
              <span class="rc-platform-count" id="rc-ig-count">0</span>
            </div>
          </div>

          <div class="rc-brain-message" id="rc-brain-message">
            Your brain is thriving! Keep it up.
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Position the overlay
    updatePosition();

    // Set up event listeners
    setupEventListeners();

    // Load initial state
    loadInitialState();
  }

  // ─── Event Listeners ──────────────────────────────────────────────────

  function setupEventListeners() {
    const bubble = document.getElementById('rc-bubble');
    const closeBtn = document.getElementById('rc-close-btn');
    const widget = document.getElementById('rc-widget');

    // Click to expand/collapse
    bubble.addEventListener('click', (e) => {
      if (!isDragging) {
        toggleExpanded();
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExpanded(false);
    });

    // Dragging
    bubble.addEventListener('mousedown', startDrag);
    widget.addEventListener('mousedown', (e) => {
      if (e.target === widget || e.target.closest('.rc-expanded-header')) {
        startDrag(e);
      }
    });
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch dragging (mobile web)
    bubble.addEventListener('touchstart', startDragTouch, { passive: false });
    document.addEventListener('touchmove', onDragTouch, { passive: false });
    document.addEventListener('touchend', endDragTouch);

    // Listen for updates from detector
    window.addEventListener('reelcounter:update', (e) => {
      updateStats(e.detail.stats);
    });

    window.addEventListener('reelcounter:limit-reached', (e) => {
      showLimitReached();
    });

    window.addEventListener('reelcounter:limit-warning', (e) => {
      pulseWarning();
    });

    window.addEventListener('reelcounter:settings-updated', (e) => {
      const s = e.detail.settings;
      if (s.dailyLimit !== undefined) dailyLimit = s.dailyLimit;
      if (s.showOverlay !== undefined) {
        isVisible = s.showOverlay;
        overlay.style.display = isVisible ? 'block' : 'none';
      }
      updateUI();
    });
  }

  // ─── Drag Handling ────────────────────────────────────────────────────

  let dragStartPos = { x: 0, y: 0 };
  let hasMoved = false;

  function startDrag(e) {
    isDragging = false;
    hasMoved = false;
    dragStartPos = { x: e.clientX, y: e.clientY };
    dragOffset = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    overlay.classList.add('rc-dragging');
  }

  function onDrag(e) {
    if (dragOffset.x === 0 && dragOffset.y === 0 && !overlay.classList.contains('rc-dragging')) return;
    if (!overlay.classList.contains('rc-dragging')) return;

    const dx = Math.abs(e.clientX - dragStartPos.x);
    const dy = Math.abs(e.clientY - dragStartPos.y);

    if (dx > 5 || dy > 5) {
      hasMoved = true;
      isDragging = true;
    }

    if (hasMoved) {
      position.x = e.clientX - dragOffset.x;
      position.y = e.clientY - dragOffset.y;
      constrainPosition();
      updatePosition();
    }
  }

  function endDrag() {
    overlay.classList.remove('rc-dragging');
    if (hasMoved) {
      // Save position
      savePosition();
      setTimeout(() => { isDragging = false; }, 100);
    }
    hasMoved = false;
  }

  // Touch equivalents
  function startDragTouch(e) {
    const touch = e.touches[0];
    startDrag({ clientX: touch.clientX, clientY: touch.clientY });
  }

  function onDragTouch(e) {
    const touch = e.touches[0];
    onDrag({ clientX: touch.clientX, clientY: touch.clientY });
    if (hasMoved) e.preventDefault();
  }

  function endDragTouch() {
    endDrag();
  }

  // ─── Position Management ──────────────────────────────────────────────

  function constrainPosition() {
    const maxX = window.innerWidth - 70;
    const maxY = window.innerHeight - 70;
    position.x = Math.max(0, Math.min(position.x, maxX));
    position.y = Math.max(0, Math.min(position.y, maxY));
  }

  function updatePosition() {
    if (overlay) {
      overlay.style.left = position.x + 'px';
      overlay.style.top = position.y + 'px';
    }
  }

  function savePosition() {
    try {
      chrome.runtime.sendMessage({
        type: 'SAVE_OVERLAY_POSITION',
        position: position,
      });
    } catch (e) {
      // Fallback to localStorage
      localStorage.setItem('rc_overlay_pos', JSON.stringify(position));
    }
  }

  function loadPosition() {
    try {
      const saved = localStorage.getItem('rc_overlay_pos');
      if (saved) {
        position = JSON.parse(saved);
        constrainPosition();
      }
    } catch (e) {
      // Use default
    }
  }

  // ─── UI Updates ───────────────────────────────────────────────────────

  function updateStats(newStats) {
    prevCount = count;
    stats = newStats;
    count = newStats.total || 0;
    updateUI();

    // Animate count change
    if (count > prevCount) {
      animateCountBump();
    }
  }

  function updateUI() {
    const brainState = getBrainState(count);

    // Bubble
    const countEl = document.getElementById('rc-count');
    const brainEmoji = document.getElementById('rc-brain-emoji');
    if (countEl) countEl.textContent = count;
    if (brainEmoji) brainEmoji.textContent = brainState.emoji;

    // Progress ring
    updateProgressRing(count, dailyLimit, brainState.color);

    // Expanded view
    const statCount = document.getElementById('rc-stat-count');
    const brainIcon = document.getElementById('rc-brain-icon');
    const brainLabel = document.getElementById('rc-brain-label');
    const brainMsg = document.getElementById('rc-brain-message');
    const limitCurrent = document.getElementById('rc-limit-current');
    const limitMax = document.getElementById('rc-limit-max');
    const limitFill = document.getElementById('rc-limit-fill');
    const ytCount = document.getElementById('rc-yt-count');
    const igCount = document.getElementById('rc-ig-count');

    if (statCount) statCount.textContent = count;
    if (brainIcon) brainIcon.textContent = brainState.emoji;
    if (brainLabel) {
      brainLabel.textContent = brainState.label;
      brainLabel.style.color = brainState.color;
    }
    if (brainMsg) brainMsg.textContent = getBrainMessage(brainState);
    if (limitCurrent) limitCurrent.textContent = count;
    if (limitMax) limitMax.textContent = dailyLimit;
    if (ytCount) ytCount.textContent = stats.youtube || 0;
    if (igCount) igCount.textContent = stats.instagram || 0;

    // Limit bar fill
    if (limitFill) {
      const percent = dailyLimit > 0 ? Math.min((count / dailyLimit) * 100, 100) : 0;
      limitFill.style.width = percent + '%';
      limitFill.style.background = `linear-gradient(90deg, ${brainState.color}, ${brainState.glow})`;
    }

    // Update bubble glow color
    const bubble = document.getElementById('rc-bubble');
    if (bubble) {
      bubble.style.setProperty('--rc-state-color', brainState.color);
      bubble.style.setProperty('--rc-state-glow', brainState.glow);
      bubble.style.setProperty('--rc-state-bg', brainState.bg);
    }

    // Update brain state section
    const brainStateEl = document.getElementById('rc-brain-state');
    if (brainStateEl) {
      brainStateEl.style.background = brainState.bg;
    }
  }

  function updateProgressRing(current, max, color) {
    const fill = document.getElementById('rc-progress-fill');
    if (!fill) return;

    const circumference = 2 * Math.PI * 26; // r=26
    const percent = max > 0 ? Math.min(current / max, 1) : 0;
    const offset = circumference - percent * circumference;

    fill.style.strokeDasharray = circumference;
    fill.style.strokeDashoffset = offset;
    fill.style.stroke = color;
  }

  function animateCountBump() {
    const bubble = document.getElementById('rc-bubble');
    if (!bubble) return;
    bubble.classList.add('rc-bump');
    setTimeout(() => bubble.classList.remove('rc-bump'), 400);

    // Also animate the count number
    const countEl = document.getElementById('rc-count');
    if (countEl) {
      countEl.classList.add('rc-count-flip');
      setTimeout(() => countEl.classList.remove('rc-count-flip'), 400);
    }
  }

  function toggleExpanded(force) {
    isExpanded = force !== undefined ? force : !isExpanded;
    const widget = document.getElementById('rc-widget');
    if (widget) {
      widget.classList.toggle('rc-expanded-open', isExpanded);
    }
  }

  function showLimitReached() {
    const bubble = document.getElementById('rc-bubble');
    if (bubble) {
      bubble.classList.add('rc-limit-hit');
      setTimeout(() => bubble.classList.remove('rc-limit-hit'), 3000);
    }
  }

  function pulseWarning() {
    const bubble = document.getElementById('rc-bubble');
    if (bubble) {
      bubble.classList.add('rc-warning-pulse');
      setTimeout(() => bubble.classList.remove('rc-warning-pulse'), 2000);
    }
  }

  // ─── Brain State Helper ───────────────────────────────────────────────

  function getBrainState(count) {
    if (count <= 15) return BRAIN_STATES.healthy;
    if (count <= 35) return BRAIN_STATES.tired;
    return BRAIN_STATES.fried;
  }

  function getBrainMessage(state) {
    const messages = {
      healthy: [
        'Your brain is thriving! Keep it up. 🌱',
        'Nice and balanced. Stay focused! ✨',
        'Looking good! Your brain thanks you. 💚',
      ],
      tired: [
        'Your brain is getting tired. Maybe take a break? 😮‍💨',
        'Time to slow down a bit... 🐌',
        'Your brain could use some rest. 📖',
      ],
      fried: [
        'Your brain is FRIED! Time to stop scrolling. 🛑',
        'Put the phone down! Go outside! 🌳',
        'Emergency! Brain overload detected! 🚨',
      ],
    };
    const list = messages[state.label.toLowerCase()] || messages.healthy;
    return list[Math.floor(Math.random() * list.length)];
  }

  // ─── Load Initial State ───────────────────────────────────────────────

  function loadInitialState() {
    loadPosition();
    updatePosition();

    // Request current stats from background
    try {
      chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.stats) {
          updateStats(response.stats);
        }
      });

      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.settings) {
          dailyLimit = response.settings.dailyLimit || 50;
          isVisible = response.settings.showOverlay !== false;
          overlay.style.display = isVisible ? 'block' : 'none';
          updateUI();
        }
      });
    } catch (e) {
      console.warn('[ReelCounter Overlay] Failed to load state:', e);
    }
  }

  // ─── Initialize ─────────────────────────────────────────────────────────

  function init() {
    createOverlay();
    console.log('[ReelCounter] 🫧 Overlay widget initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
