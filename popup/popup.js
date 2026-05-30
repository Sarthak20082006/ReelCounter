import { CLOUD_CONFIG } from '../utils/config.js';

/**
 * Reel Counter — Popup Script (v2 — Integrated Social Gameplay)
 * Coordinates dashboard stats, weekly canvas charts, tab navigation,
 * custom user profiles, live leaderboard, dynamic roasts, simulated friend activity,
 * and customizable multi-mode scroll battles.
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  const MESSAGES = {
    REEL_COUNTED: 'REEL_COUNTED',
    GET_TODAY_STATS: 'GET_TODAY_STATS',
    GET_WEEKLY_STATS: 'GET_WEEKLY_STATS',
    UPDATE_SETTINGS: 'UPDATE_SETTINGS',
    GET_SETTINGS: 'GET_SETTINGS',
    RESET_TODAY: 'RESET_TODAY',
  };

  const BRAIN_STATES = {
    healthy: {
      emoji: '🧠', label: 'Healthy', color: '#10b981',
      glow: 'rgba(16, 185, 129, 0.25)',
      messages: ['Your brain is thriving! ✨', 'Stay focused! 🌟', 'Looking great! 💚'],
    },
    tired: {
      emoji: '😴', label: 'Tired', color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.25)',
      messages: ['Getting slightly tired...', 'Maybe take a walk? 🚶', 'Slow down a bit... 🐌'],
    },
    fried: {
      emoji: '🔥', label: 'Fried', color: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.25)',
      messages: ['Brain FRIED! 🛑', 'Go touch some grass! 🌳', 'Dopamine overload! 🚨'],
    },
  };

  const RANK_TIERS = [
    { threshold: 10, title: 'Digital Monk', emoji: '🧘' },
    { threshold: 25, title: 'Casual Scroller', emoji: '🚶' },
    { threshold: 50, title: 'Dopamine Chaser', emoji: '⚡' },
    { threshold: 100, title: 'Zombie Mind', emoji: '🧟' },
    { threshold: 200, title: 'Brain Fried', emoji: '🔥' },
    { threshold: Infinity, title: 'Absolute Junkie', emoji: '🚨' },
  ];

  const CHALLENGE_TEMPLATES = {
    'detox-duel': {
      emoji: '🧘',
      name: 'Detox Duel',
      desc: 'Scroll fewer reels than your friend today. Cleanest brain wins!',
      hasLimit: false
    },
    'scroll-showdown': {
      emoji: '🤠',
      name: 'Scroll Showdown',
      desc: 'Three-day race. Lowest cumulative scroll count claims victory!',
      hasLimit: false
    },
    'cold-turkey': {
      emoji: '🦃',
      name: 'Cold Turkey',
      desc: 'First person to scroll even a SINGLE reel loses instantly!',
      hasLimit: false
    },
    'reel-roulette': {
      emoji: '🎰',
      name: 'Reel Roulette',
      desc: 'A random threshold (10-30 reels) is set. Stay under it or face shame!',
      hasLimit: true,
      defaultLimit: 20
    },
    'brain-saver': {
      emoji: '🧠',
      name: 'Brain Saver',
      desc: 'Cooperative survival! Both must stay under 15 reels for a whole week.',
      hasLimit: false,
      fixedLimit: 15
    },
    'shame-game': {
      emoji: '😈',
      name: 'Shame Game',
      desc: 'Loser is branded as "Reel Addict" for a full day!',
      hasLimit: false
    }
  };

  const CHART_COLORS = {
    barGradientStart: '#7c3aed',
    barGradientEnd: '#06b6d4',
    barToday: '#7c3aed',
    gridLine: 'rgba(255, 255, 255, 0.05)',
    label: '#64748b',
    todayLabel: '#f1f5f9',
  };

  // ─── State ──────────────────────────────────────────────────────────────

  let todayStats = { total: 0, youtube: 0, instagram: 0 };
  let weeklyStats = [];
  let settings = {
    dailyLimit: 50,
    showOverlay: true,
    trackYouTube: true,
    trackInstagram: true,
  };

  let myUsername = 'You';
  let myFriendCode = '';
  let friends = [];
  let challenges = [];

  let selectedChallengeType = null;
  let liveSimInterval = null;

  const DB_URL = 'https://reel-counter-default-rtdb.firebaseio.com/users/';

  // ─── Init ───────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupTabNavigation();
    setupEventListeners();
    setupSocialEventListeners();

    // Push profile and sync real friends from cloud immediately
    await syncOwnProfileToCloud();
    await syncFriendsFromCloud();

    renderAll();

    // Start live simulation of active scrollbots and real friend syncs
    startLiveActivitySimulation();
  });

  // ─── Data Loading & Generation ──────────────────────────────────────────

  async function loadInitialData() {
    try {
      // 1. Load today's stats
      const statsResponse = await sendMessage({ type: MESSAGES.GET_TODAY_STATS });
      if (statsResponse && statsResponse.stats) {
        todayStats = statsResponse.stats;
      }

      // 2. Load weekly stats
      const weeklyResponse = await sendMessage({ type: MESSAGES.GET_WEEKLY_STATS, days: 7 });
      if (weeklyResponse && weeklyResponse.stats) {
        weeklyStats = weeklyResponse.stats;
      }

      // 3. Load general settings
      const settingsResponse = await sendMessage({ type: MESSAGES.GET_SETTINGS });
      if (settingsResponse && settingsResponse.settings) {
        settings = settingsResponse.settings;
      }

      // 4. Load Social state directly from chrome storage
      const social = await chrome.storage.local.get([
        'my_username',
        'my_friend_code',
        'friends',
        'challenges'
      ]);

      myUsername = social.my_username || 'You';
      myFriendCode = social.my_friend_code || generateRandomFriendCode();

      // Save friend code if generated first time
      if (!social.my_friend_code) {
        await chrome.storage.local.set({ my_friend_code: myFriendCode });
      }

      friends = social.friends || [];
      challenges = social.challenges || [];

      // Check if shame game loss forces name change
      await checkShameGameLoss();

    } catch (e) {
      console.warn('[ReelCounter Social] Data loading exception:', e);
    }
  }

  async function syncOwnProfileToCloud() {
    try {
      if (!CLOUD_CONFIG.SUPABASE_URL || CLOUD_CONFIG.SUPABASE_URL.includes('your-supabase-project')) return;
      const storage = await chrome.storage.local.get(['firebase_uid']);
      const uid = storage.firebase_uid;
      if (!uid) return;

      const payload = {
        firebase_uid: uid,
        friend_code: myFriendCode,
        username: myUsername,
        avatar: '🧠',
        daily_count: todayStats.total,
        weekly_count: todayStats.total * 6
      };

      await fetch(`${CLOUD_CONFIG.SUPABASE_URL}/rest/v1/users?firebase_uid=eq.${uid}`, {
        method: 'PATCH',
        headers: {
          'apikey': CLOUD_CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CLOUD_CONFIG.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[ReelCounter] Cloud profile sync failed:', e);
    }
  }

  async function syncFriendsFromCloud() {
    if (!CLOUD_CONFIG.SUPABASE_URL || CLOUD_CONFIG.SUPABASE_URL.includes('your-supabase-project')) return;
    let updated = false;
    for (const friend of friends) {
      if (friend.isDemo) continue; // Skip bots
      try {
        const res = await fetch(`${CLOUD_CONFIG.SUPABASE_URL}/rest/v1/users?friend_code=eq.${friend.code}`, {
          headers: {
            'apikey': CLOUD_CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CLOUD_CONFIG.SUPABASE_ANON_KEY}`
          }
        });
        const data = await res.json();
        if (data && data[0]) {
          const record = data[0];
          if (record.username && friend.name !== record.username) {
            friend.name = record.username;
            updated = true;
          }
          if (record.avatar && friend.avatar !== record.avatar) {
            friend.avatar = record.avatar;
            updated = true;
          }
          if (typeof record.daily_count === 'number' && friend.count !== record.daily_count) {
            friend.count = record.daily_count;
            friend.weekly_count = record.weekly_count || (record.daily_count * 6);
            updated = true;
          }
        }
      } catch (e) {
        console.warn(`[ReelCounter] Cloud sync error for friend ${friend.code}:`, e);
      }
    }
    if (updated) {
      await chrome.storage.local.set({ friends });
      // Redraw active views
      const activeTabBtn = document.querySelector('.tab-btn.active');
      const activeTabName = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : '';
      if (activeTabName === 'friends') {
        renderFriendsTab();
      } else if (activeTabName === 'challenges') {
        renderChallengesTab();
      }
    }
  }

  function generateRandomFriendCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable alphanumerics
    const randPart = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `REEL-${randPart()}-${randPart()}`;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  // ─── Rendering Core ──────────────────────────────────────────────────────

  function renderAll() {
    // 1. Stats tab
    renderStatsTab();
    
    // 2. Friends tab
    renderFriendsTab();

    // 3. Challenges tab
    renderChallengesTab();

    // 4. Settings tab
    renderSettingsTab();
  }

  // ─── Tab: Stats (Dashboard) Rendering ───────────────────────────────────

  function renderStatsTab() {
    const countEl = document.getElementById('today-count');
    if (countEl) {
      animateNumber(countEl, parseInt(countEl.textContent || '0'), todayStats.total, 500);
    }

    // Rank Badge
    const rank = calculateRank(todayStats.total);
    const rankEmojiEl = document.getElementById('rank-emoji');
    const rankTitleEl = document.getElementById('rank-title');
    if (rankEmojiEl) rankEmojiEl.textContent = rank.emoji;
    if (rankTitleEl) rankTitleEl.textContent = rank.title;

    // Brain State Header Badge & Large Emoji
    const state = getBrainState(todayStats.total);
    const badge = document.getElementById('brain-badge');
    const badgeEmoji = document.getElementById('brain-badge-emoji');
    const badgeLabel = document.getElementById('brain-badge-label');
    
    if (badge) badge.setAttribute('data-state', state.label.toLowerCase());
    if (badgeEmoji) badgeEmoji.textContent = state.emoji;
    if (badgeLabel) {
      badgeLabel.textContent = state.label;
      badgeLabel.style.color = state.color;
    }

    const emojiLarge = document.getElementById('brain-emoji-large');
    const glowEl = document.getElementById('brain-glow');
    if (emojiLarge) emojiLarge.textContent = state.emoji;
    if (glowEl) glowEl.style.background = `radial-gradient(circle, ${state.glow} 0%, transparent 70%)`;

    // Limit fill bar
    const currentEl = document.getElementById('limit-current');
    const maxEl = document.getElementById('limit-max');
    const fillEl = document.getElementById('limit-fill');

    if (currentEl) currentEl.textContent = todayStats.total;
    if (maxEl) maxEl.textContent = settings.dailyLimit;
    if (fillEl) {
      const percent = settings.dailyLimit > 0
        ? Math.min((todayStats.total / settings.dailyLimit) * 100, 100)
        : 0;
      fillEl.style.width = percent + '%';

      if (percent >= 100) {
        fillEl.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
      } else if (percent >= 80) {
        fillEl.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      } else {
        fillEl.style.background = 'var(--accent-gradient)';
      }
    }

    // Platform breakdown
    const ytEl = document.getElementById('yt-count');
    const igEl = document.getElementById('ig-count');
    if (ytEl) ytEl.textContent = todayStats.youtube || 0;
    if (igEl) igEl.textContent = todayStats.instagram || 0;

    renderWeeklyChart();
  }

  function calculateRank(count) {
    for (const tier of RANK_TIERS) {
      if (count <= tier.threshold) return tier;
    }
    return RANK_TIERS[RANK_TIERS.length - 1];
  }

  function getBrainState(count) {
    if (count <= 15) return BRAIN_STATES.healthy;
    if (count <= 35) return BRAIN_STATES.tired;
    return BRAIN_STATES.fried;
  }

  // ─── Tab: Friends Rendering ─────────────────────────────────────────────

  function renderFriendsTab() {
    // 1. Update own profile card
    const myNameInput = document.getElementById('my-name');
    const myRankEl = document.getElementById('my-rank');
    const myCountEl = document.getElementById('my-count');
    const myCodeEl = document.getElementById('my-friend-code');

    if (myNameInput && document.activeElement !== myNameInput) {
      myNameInput.value = myUsername;
    }
    const myRank = calculateRank(todayStats.total);
    if (myRankEl) myRankEl.textContent = `${myRank.title} ${myRank.emoji}`;
    if (myCountEl) myCountEl.textContent = todayStats.total;
    if (myCodeEl) myCodeEl.textContent = myFriendCode;

    // 2. Clear & populate leaderboard
    const friendsList = document.getElementById('friends-list');
    const friendsEmpty = document.getElementById('friends-empty');
    const labelEl = document.getElementById('friends-count-label');

    if (labelEl) {
      labelEl.textContent = `${friends.length} friend${friends.length === 1 ? '' : 's'}`;
    }

    if (!friendsList) return;

    // Filter out potential duplicates, and construct leaderboard sorting
    // We sort leaderboard by reels count ascending (lower is better/healthier brain!)
    const leaderboard = [
      { name: `${myUsername} (You)`, count: todayStats.total, isMe: true, avatar: '🧠', code: 'ME' },
      ...friends.map(f => ({ ...f, isMe: false }))
    ];

    // Sort ascending by reel count (healthiest brain on top!)
    leaderboard.sort((a, b) => a.count - b.count);

    friendsList.innerHTML = '';

    if (friends.length === 0) {
      if (friendsEmpty) friendsEmpty.style.display = 'flex';
    } else {
      if (friendsEmpty) friendsEmpty.style.display = 'none';

      leaderboard.forEach((member, index) => {
        const row = document.createElement('div');
        row.className = `friend-item ${member.isMe ? 'friend-me' : ''}`;
        
        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        else medal = `#${index + 1}`;

        const friendRank = calculateRank(member.count);

        row.innerHTML = `
          <div class="friend-rank-number">${medal}</div>
          <div class="friend-avatar">${member.avatar || '👤'}</div>
          <div class="friend-details">
            <span class="friend-name">${escapeHTML(member.name)}</span>
            <span class="friend-status-desc">${friendRank.title} ${friendRank.emoji}</span>
          </div>
          <div class="friend-score-box">
            <span class="friend-score">${member.count}</span>
            <span class="friend-score-label">reels</span>
          </div>
          ${!member.isMe ? `<button class="remove-friend-btn" data-code="${member.code}" title="Remove Friend">✕</button>` : ''}
        `;

        // Bind remove button
        if (!member.isMe) {
          row.querySelector('.remove-friend-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Remove ${member.name} from friends?`)) {
              await removeFriend(member.code);
            }
          });
        }

        friendsList.appendChild(row);
      });
    }

    // 3. Update Roasts
    renderRoasts();
  }

  function renderRoasts() {
    const roastBanner = document.getElementById('roast-banner');
    const roastText = document.getElementById('roast-text');
    if (!roastBanner || !roastText) return;

    if (friends.length === 0) {
      roastBanner.style.display = 'none';
      return;
    }

    // Find the friend with the lowest count
    const winningFriend = [...friends].sort((a, b) => a.count - b.count)[0];
    
    // Generate funny roast text
    let text = '';
    if (winningFriend.count < todayStats.total) {
      const roasts = [
        `Ouch! ${winningFriend.name} is touching grass (only ${winningFriend.count} reels), while your brain is sizzling at ${todayStats.total}!`,
        `Put the phone down! ${winningFriend.name} is absolutely destroyng you with only ${winningFriend.count} scrolls today.`,
        `Your brain: 🔥 (${todayStats.total} reels). ${winningFriend.name}'s brain: 🧠 (${winningFriend.count} reels). Do the math.`,
        `${winningFriend.name} is watching your digital demise in real-time. Turn off the feed!`,
      ];
      text = roasts[Math.floor(Math.random() * roasts.length)];
      roastBanner.style.display = 'flex';
      roastBanner.className = 'roast-banner roast-danger';
    } else if (todayStats.total < winningFriend.count) {
      const positiveRoasts = [
        `Looking good! You're outperforming ${winningFriend.name} (${winningFriend.count} reels). Keep meditating! 🧘`,
        `A clean mind! You're currently crushing ${winningFriend.name} in the race to touch grass.`,
        `${winningFriend.name} is drowning in dopamine spikes while you chill at ${todayStats.total} scrolls.`,
      ];
      text = positiveRoasts[Math.floor(Math.random() * positiveRoasts.length)];
      roastBanner.style.display = 'flex';
      roastBanner.className = 'roast-banner roast-success';
    } else {
      text = `Equal minds! You and ${winningFriend.name} are matched at exactly ${todayStats.total} scrolls. Who breaks first?`;
      roastBanner.style.display = 'flex';
      roastBanner.className = 'roast-banner';
    }

    roastText.textContent = text;
  }

  // ─── Tab: Challenges (Battles) Rendering ─────────────────────────────────

  function renderChallengesTab() {
    const listContainer = document.getElementById('active-challenges');
    const emptyState = document.getElementById('challenges-empty');

    if (!listContainer) return;

    // Check expiry & resolve challenges first
    evaluateActiveChallenges();

    listContainer.innerHTML = '';

    if (challenges.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
    } else {
      if (emptyState) emptyState.style.display = 'none';

      challenges.forEach(challenge => {
        const card = document.createElement('div');
        card.className = `challenge-card status-${challenge.status}`;

        // Get relative values
        const totalDuration = challenge.endDate - challenge.startDate;
        const timeLeft = Math.max(0, challenge.endDate - Date.now());
        const percentTimePassed = Math.min(100, ((Date.now() - challenge.startDate) / totalDuration) * 100);

        let myScore = todayStats.total - challenge.myStartCount;
        let friendScore = challenge.friendCurrent - challenge.friendStartCount;
        if (myScore < 0) myScore = 0;
        if (friendScore < 0) friendScore = 0;

        // Challenge status badge
        let statusBadge = '';
        if (challenge.status === 'active') {
          statusBadge = `<span class="badge badge-active">⚔️ Live</span>`;
        } else if (challenge.status === 'won') {
          statusBadge = `<span class="badge badge-won">🏆 Victory</span>`;
        } else if (challenge.status === 'lost') {
          statusBadge = `<span class="badge badge-lost">💀 Defeat</span>`;
        }

        // Render card content
        card.innerHTML = `
          <div class="challenge-card-header">
            <div class="cc-title-row">
              <span class="cc-emoji">${challenge.emoji || '⚔️'}</span>
              <div>
                <h3 class="cc-name">${escapeHTML(challenge.typeName)}</h3>
                <span class="cc-vs">VS ${escapeHTML(challenge.friendName)}</span>
              </div>
            </div>
            ${statusBadge}
          </div>
          <p class="cc-description">${CHALLENGE_TEMPLATES[challenge.type]?.desc || ''}</p>
          
          <div class="cc-battle-stats">
            <div class="cc-stat-bar-container">
              <div class="cc-stat-label">
                <span>You</span>
                <span class="cc-stat-score">${myScore}</span>
              </div>
              <div class="cc-stat-progress">
                <div class="cc-progress-fill my-fill" style="width: ${calculateProgressPercent(challenge, myScore)}%"></div>
              </div>
            </div>
            <div class="cc-stat-bar-container">
              <div class="cc-stat-label">
                <span>${escapeHTML(challenge.friendName)}</span>
                <span class="cc-stat-score">${friendScore}</span>
              </div>
              <div class="cc-stat-progress">
                <div class="cc-progress-fill friend-fill" style="width: ${calculateProgressPercent(challenge, friendScore)}%"></div>
              </div>
            </div>
          </div>

          <div class="challenge-card-footer">
            <span class="cc-time-left">⏱️ ${formatTimeRemaining(timeLeft)} left</span>
            ${challenge.status !== 'active' ? `<button class="challenge-delete-btn" data-id="${challenge.id}">Dismiss</button>` : ''}
          </div>
        `;

        if (challenge.status !== 'active') {
          card.querySelector('.challenge-delete-btn').addEventListener('click', async () => {
            await deleteChallenge(challenge.id);
          });
        }

        listContainer.appendChild(card);
      });
    }
  }

  function calculateProgressPercent(challenge, score) {
    if (challenge.type === 'cold-turkey') {
      // 0 scrolls = 100% health, 1+ scrolls = 0% health
      return score === 0 ? 100 : 0;
    }
    
    // For limited challenges (reel-roulette, brain-saver)
    const limit = challenge.limit || 15;
    return Math.min(100, (score / limit) * 100);
  }

  function formatTimeRemaining(ms) {
    if (ms <= 0) return 'Expired';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    if (hours > 24) {
      return `${Math.ceil(hours / 24)} days`;
    }
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // ─── Tab: Settings Rendering ───────────────────────────────────────────

  function renderSettingsTab() {
    const limitValue = document.getElementById('limit-value');
    const overlayToggle = document.getElementById('overlay-toggle');
    const ytToggle = document.getElementById('youtube-toggle');
    const igToggle = document.getElementById('instagram-toggle');

    if (limitValue) limitValue.textContent = settings.dailyLimit;
    if (overlayToggle) overlayToggle.checked = settings.showOverlay;
    if (ytToggle) ytToggle.checked = settings.trackYouTube;
    if (igToggle) igToggle.checked = settings.trackInstagram;
  }

  // ─── Event Handlers: Navigation & Custom Actions ─────────────────────────

  function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetTab = tab.getAttribute('data-tab');
        const contentPanels = document.querySelectorAll('.tab-content');
        contentPanels.forEach(p => p.classList.remove('active'));

        const targetPanel = document.getElementById(`tab-${targetTab}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }

        // Trigger updates when entering tabs
        if (targetTab === 'friends') {
          renderFriendsTab();
        } else if (targetTab === 'challenges') {
          renderChallengesTab();
        } else if (targetTab === 'dashboard') {
          renderStatsTab();
        }
      });
    });
  }

  function setupEventListeners() {
    // Settings adjustments
    document.getElementById('limit-minus')?.addEventListener('click', () => {
      settings.dailyLimit = Math.max(5, settings.dailyLimit - 5);
      saveSettings();
      renderSettingsTab();
      renderStatsTab();
    });

    document.getElementById('limit-plus')?.addEventListener('click', () => {
      settings.dailyLimit = Math.min(500, settings.dailyLimit + 5);
      saveSettings();
      renderSettingsTab();
      renderStatsTab();
    });

    document.getElementById('overlay-toggle')?.addEventListener('change', (e) => {
      settings.showOverlay = e.target.checked;
      saveSettings();
    });

    document.getElementById('youtube-toggle')?.addEventListener('change', (e) => {
      settings.trackYouTube = e.target.checked;
      saveSettings();
    });

    document.getElementById('instagram-toggle')?.addEventListener('change', (e) => {
      settings.trackInstagram = e.target.checked;
      saveSettings();
    });

    // Reset button
    document.getElementById('reset-btn')?.addEventListener('click', async () => {
      if (confirm("Reset today's reel count to 0?")) {
        await sendMessage({ type: MESSAGES.RESET_TODAY });
        todayStats = { total: 0, youtube: 0, instagram: 0, sessions: 0 };
        renderAll();
      }
    });
  }

  async function saveSettings() {
    await sendMessage({ type: MESSAGES.UPDATE_SETTINGS, settings });
  }

  // ─── Social & Challenges Mechanics ───────────────────────────────────────

  function setupSocialEventListeners() {
    // 1. Edit Name Input
    const myNameInput = document.getElementById('my-name');
    if (myNameInput) {
      myNameInput.addEventListener('change', async () => {
        let name = myNameInput.value.trim();
        if (!name) name = 'You';
        myUsername = name;
        await chrome.storage.local.set({ my_username: myUsername });
        await syncOwnProfileToCloud(); // Sync profile updates to cloud
        renderFriendsTab();
      });
    }

    // 2. Copy Code Button
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(myFriendCode).then(() => {
          copyCodeBtn.textContent = '✅';
          setTimeout(() => { copyCodeBtn.textContent = '📋'; }, 1500);
        });
      });
    }

    // 3. Add Friend Button
    const addFriendBtn = document.getElementById('add-friend-btn');
    const addFriendInput = document.getElementById('add-friend-input');
    if (addFriendBtn && addFriendInput) {
      addFriendBtn.addEventListener('click', async () => {
        const code = addFriendInput.value.trim().toUpperCase();
        if (!code) return;
        
        if (code === myFriendCode) {
          alert("You can't add yourself as a friend!");
          return;
        }

        const isAlreadyFriend = friends.some(f => f.code === code);
        if (isAlreadyFriend) {
          alert("This friend is already added!");
          return;
        }

        // Format validation
        const regex = /^REEL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!regex.test(code)) {
          alert("Invalid friend code format! Must look like: REEL-XXXX-XXXX");
          return;
        }

        // Generate funny random friend name as default, but pull from cloud if exists
        const funnyNames = ['Reel Prodigy', 'Mindful Scroll Pro', 'Grass Toucher Pro', 'Doomscroll Slayer', 'Shorts Surfer'];
        const avatars = ['🤖', '🦊', '🐱', '🐼', '🐵', '🐸', '🦄'];
        
        let name = funnyNames[Math.floor(Math.random() * funnyNames.length)] + ` (${code.slice(-4)})`;
        let avatar = avatars[Math.floor(Math.random() * avatars.length)];
        let count = 0;

        try {
          if (CLOUD_CONFIG.SUPABASE_URL && !CLOUD_CONFIG.SUPABASE_URL.includes('your-supabase-project')) {
            const res = await fetch(`${CLOUD_CONFIG.SUPABASE_URL}/rest/v1/users?friend_code=eq.${code}`, {
              headers: {
                'apikey': CLOUD_CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CLOUD_CONFIG.SUPABASE_ANON_KEY}`
              }
            });
            const data = await res.json();
            if (data && data[0]) {
              const record = data[0];
              if (record.username) name = record.username;
              if (record.avatar) avatar = record.avatar;
              if (typeof record.daily_count === 'number') count = record.daily_count;
            }
          }
        } catch (e) {
          console.warn('[ReelCounter] Error fetching friend profile from cloud:', e);
        }

        const newFriend = {
          code: code,
          name: name,
          avatar: avatar,
          count: count,
          weeklyCount: count * 6,
          isDemo: false
        };

        friends.push(newFriend);
        await chrome.storage.local.set({ friends });
        addFriendInput.value = '';
        renderFriendsTab();
      });
    }

    // 4. Add Demo Friends Button
    const addDemoBtn = document.getElementById('add-demo-friends-btn');
    if (addDemoBtn) {
      addDemoBtn.addEventListener('click', async () => {
        const demoBots = [
          { code: 'REEL-DEMO-BOT1', name: 'Scrollbot 3000 🤖', avatar: '🤖', count: 80, weeklyCount: 310, isDemo: true },
          { code: 'REEL-DEMO-BOT2', name: 'Grass-Toucher Lily 🌸', avatar: '🌸', count: 5, weeklyCount: 22, isDemo: true },
          { code: 'REEL-DEMO-BOT3', name: 'Dopamine Dave ⚡', avatar: '⚡', count: 42, weeklyCount: 190, isDemo: true }
        ];

        // Only add if not already in friends
        demoBots.forEach(bot => {
          if (!friends.some(f => f.code === bot.code)) {
            friends.push(bot);
          }
        });

        await chrome.storage.local.set({ friends });
        renderFriendsTab();
      });
    }

    // 5. Open Challenge Modal
    const challengeCards = document.querySelectorAll('.challenge-type-card');
    const modal = document.getElementById('challenge-modal');
    
    challengeCards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-type');
        selectedChallengeType = type;
        
        const template = CHALLENGE_TEMPLATES[type];
        if (!template) return;

        // Load friend list into select
        const select = document.getElementById('challenge-friend-select');
        if (select) {
          select.innerHTML = '<option value="">Select a friend...</option>';
          friends.forEach(f => {
            select.innerHTML += `<option value="${f.code}">${escapeHTML(f.name)}</option>`;
          });
        }

        // Toggle custom limits fields if applicable
        const limitField = document.getElementById('modal-limit-field');
        if (limitField) {
          if (template.hasLimit) {
            limitField.style.display = 'block';
            document.getElementById('challenge-limit').value = template.defaultLimit || 20;
          } else {
            limitField.style.display = 'none';
          }
        }

        // Populate Modal Headers
        const emojiEl = document.getElementById('modal-challenge-emoji');
        const titleEl = document.getElementById('modal-challenge-title');
        const descEl = document.getElementById('modal-challenge-desc');

        if (emojiEl) emojiEl.textContent = template.emoji;
        if (titleEl) titleEl.textContent = template.name;
        if (descEl) descEl.textContent = template.desc;

        if (modal) modal.style.display = 'flex';
      });
    });

    // 6. Close Modal
    document.getElementById('modal-close')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });

    // 7. Start Battle Submit
    const startBattleBtn = document.getElementById('start-challenge-btn');
    if (startBattleBtn) {
      startBattleBtn.addEventListener('click', async () => {
        const friendCode = document.getElementById('challenge-friend-select').value;
        if (!friendCode) {
          alert('Please select a friend to battle!');
          return;
        }

        const friend = friends.find(f => f.code === friendCode);
        if (!friend) return;

        const durationDays = parseInt(document.getElementById('challenge-duration').value || '1');
        const customLimit = parseInt(document.getElementById('challenge-limit').value || '20');

        const template = CHALLENGE_TEMPLATES[selectedChallengeType];
        
        let limit = customLimit;
        if (selectedChallengeType === 'brain-saver') limit = 15;
        if (selectedChallengeType === 'cold-turkey') limit = 0;

        const durationMs = durationDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        const newChallenge = {
          id: 'battle_' + Math.random().toString(36).substr(2, 9),
          type: selectedChallengeType,
          typeName: template.name,
          emoji: template.emoji,
          friendCode: friend.code,
          friendName: friend.name,
          myStartCount: todayStats.total,
          friendStartCount: friend.count,
          myCurrent: todayStats.total,
          friendCurrent: friend.count,
          limit: limit,
          duration: durationDays,
          startDate: now,
          endDate: now + durationMs,
          status: 'active'
        };

        challenges.push(newChallenge);
        await chrome.storage.local.set({ challenges });

        if (modal) modal.style.display = 'none';
        
        // Switch to challenges view
        renderChallengesTab();
      });
    }
  }

  async function removeFriend(code) {
    friends = friends.filter(f => f.code !== code);
    // Also remove active challenges with this friend
    challenges = challenges.filter(c => c.friendCode !== code);

    await chrome.storage.local.set({ friends, challenges });
    renderFriendsTab();
    renderChallengesTab();
  }

  async function deleteChallenge(id) {
    challenges = challenges.filter(c => c.id !== id);
    await chrome.storage.local.set({ challenges });
    renderChallengesTab();
  }

  // ─── Active Challenges Verification Engine ──────────────────────────────

  function evaluateActiveChallenges() {
    let dirty = false;

    challenges.forEach(challenge => {
      if (challenge.status !== 'active') return;

      const now = Date.now();
      const friend = friends.find(f => f.code === challenge.friendCode);
      if (!friend) return;

      // Update current progress scores
      challenge.myCurrent = todayStats.total;
      challenge.friendCurrent = friend.count;

      let myScore = challenge.myCurrent - challenge.myStartCount;
      let friendScore = challenge.friendCurrent - challenge.friendStartCount;
      if (myScore < 0) myScore = 0;
      if (friendScore < 0) friendScore = 0;

      // 1. Time expiration check
      const expired = now >= challenge.endDate;

      // 2. Specific game modes loss/win triggers
      if (challenge.type === 'cold-turkey') {
        if (myScore > 0) {
          challenge.status = 'lost';
          dirty = true;
          triggerNotification('Challenge Failed!', `You broke cold turkey vs ${challenge.friendName}!`);
        } else if (friendScore > 0) {
          challenge.status = 'won';
          dirty = true;
          triggerNotification('Challenge Won!', `Victory! ${challenge.friendName} broke cold turkey!`);
        } else if (expired) {
          challenge.status = 'won'; // Both survived, but technically user wins
          dirty = true;
        }
      } 
      else if (challenge.type === 'reel-roulette') {
        if (myScore > challenge.limit) {
          challenge.status = 'lost';
          dirty = true;
          triggerNotification('Challenge Failed!', `You exceeded the ${challenge.limit} reels roulette limit!`);
        } else if (friendScore > challenge.limit) {
          challenge.status = 'won';
          dirty = true;
          triggerNotification('Challenge Won!', `Victory! ${challenge.friendName} exceeded the ${challenge.limit} reels roulette limit!`);
        } else if (expired) {
          challenge.status = myScore <= friendScore ? 'won' : 'lost';
          dirty = true;
        }
      } 
      else if (challenge.type === 'brain-saver') {
        if (myScore > 15 || friendScore > 15) {
          challenge.status = 'lost'; // Both lose in cooperative survival
          dirty = true;
          triggerNotification('Brain Saver Failed!', `Someone scrolled over 15 reels. Coop failure!`);
        } else if (expired) {
          challenge.status = 'won';
          dirty = true;
          triggerNotification('Brain Saver Succeeded!', `Great job! You and ${challenge.friendName} saved your brains.`);
        }
      } 
      else {
        // Standard score-based comparison at expiration (detox-duel, scroll-showdown, shame-game)
        if (expired) {
          // In detox-duel and shame-game: lower score is better
          if (myScore < friendScore) {
            challenge.status = 'won';
            triggerNotification('Challenge Won!', `You out-scrolled ${challenge.friendName} by scrolling LESS!`);
          } else {
            challenge.status = 'lost';
            triggerNotification('Challenge Lost!', `${challenge.friendName} had a healthier day than you.`);
          }
          dirty = true;
        }
      }
    });

    if (dirty) {
      chrome.storage.local.set({ challenges });
    }
  }

  function triggerNotification(title, message) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body: message });
        }
      });
    }
  }

  async function checkShameGameLoss() {
    const shameLost = challenges.some(c => c.type === 'shame-game' && c.status === 'lost');
    if (shameLost) {
      if (myUsername !== 'Reel Addict 🤡') {
        myUsername = 'Reel Addict 🤡';
        await chrome.storage.local.set({ my_username: myUsername });
        // Request visual update
        const input = document.getElementById('my-name');
        if (input) input.value = myUsername;
      }
    }
  }

  // ─── Live Multiplayer Simulation (Demo Friends Activity) ──────────────────

  function startLiveActivitySimulation() {
    if (liveSimInterval) clearInterval(liveSimInterval);

    // Update demo bots scrolling stats every 4 seconds to make UI look interactive
    // and pull real friends' active scrolling counts from the cloud!
    liveSimInterval = setInterval(async () => {
      // 1. First sync real friends' active counts from cloud
      await syncFriendsFromCloud();

      // 2. Simulate demo bots scrolling activity
      let dirty = false;
      friends.forEach(friend => {
        if (friend.isDemo) {
          // 30% chance to scroll some reels
          if (Math.random() < 0.3) {
            const reelsScrolled = Math.floor(Math.random() * 2) + 1; // 1 to 2 reels
            friend.count += reelsScrolled;
            friend.weeklyCount += reelsScrolled;
            dirty = true;
          }
        }
      });

      if (dirty) {
        await chrome.storage.local.set({ friends });
        
        // Re-evaluate challenges dynamically if any bot scrolls
        evaluateActiveChallenges();

        // Refresh dynamic tabs
        const activeTabBtn = document.querySelector('.tab-btn.active');
        const activeTabName = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : '';
        
        if (activeTabName === 'friends') {
          renderFriendsTab();
        } else if (activeTabName === 'challenges') {
          renderChallengesTab();
        }
      }
    }, 4000);
  }

  // ─── Weekly Stats Bar Chart Renderer (Canvas API) ─────────────────────────

  function renderWeeklyChart() {
    const canvas = document.getElementById('weekly-chart');
    if (!canvas || weeklyStats.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 10, right: 10, bottom: 28, left: 32 };
    const chartWidth = displayWidth - padding.left - padding.right;
    const chartHeight = displayHeight - padding.top - padding.bottom;

    const maxValue = Math.max(10, ...weeklyStats.map(d => d.total));
    const barWidth = Math.min(30, (chartWidth / weeklyStats.length) * 0.55);
    const barGap = (chartWidth - barWidth * weeklyStats.length) / (weeklyStats.length + 1);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw horizontal grid lines
    const gridLines = 4;
    ctx.strokeStyle = CHART_COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(displayWidth - padding.right, y);
      ctx.stroke();

      const value = Math.round(maxValue - (maxValue / gridLines) * i);
      ctx.fillStyle = CHART_COLORS.label;
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value, padding.left - 6, y + 4);
    }

    // Draw vertical bars
    weeklyStats.forEach((day, i) => {
      const x = padding.left + barGap + i * (barWidth + barGap);
      const barHeight = maxValue > 0 ? (day.total / maxValue) * chartHeight : 0;
      const y = padding.top + chartHeight - barHeight;

      const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
      const isToday = i === weeklyStats.length - 1;

      if (isToday) {
        gradient.addColorStop(0, '#7c3aed');
        gradient.addColorStop(1, '#06b6d4');
      } else {
        gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0.3)');
      }

      ctx.beginPath();
      const radius = Math.min(4, barWidth / 2);
      ctx.moveTo(x, padding.top + chartHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      if (isToday && barHeight > 0) {
        ctx.shadowColor = 'rgba(124, 58, 237, 0.4)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      if (day.total > 0) {
        ctx.fillStyle = isToday ? CHART_COLORS.todayLabel : CHART_COLORS.label;
        ctx.font = `${isToday ? 'bold' : 'normal'} 10px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(day.total, x + barWidth / 2, y - 5);
      }

      ctx.fillStyle = isToday ? CHART_COLORS.todayLabel : CHART_COLORS.label;
      ctx.font = `${isToday ? '600' : '400'} 10px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(day.dayLabel, x + barWidth / 2, displayHeight - 6);
    });

    const weeklyTotal = weeklyStats.reduce((sum, d) => sum + d.total, 0);
    const totalEl = document.getElementById('weekly-total');
    if (totalEl) totalEl.textContent = `${weeklyTotal} total`;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  function animateNumber(element, from, to, duration) {
    if (from === to) {
      element.textContent = to;
      return;
    }
    const start = performance.now();
    const diff = to - from;

    function step(timestamp) {
      const progress = Math.min((timestamp - start) / duration, 1);
      const current = Math.round(from + diff * (1 - Math.pow(1 - progress, 3)));
      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

})();
