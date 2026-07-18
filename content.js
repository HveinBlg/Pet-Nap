// Pet Nap · 宠物打盹 · 内容脚本
// 核心机制参考自 Cat Gatekeeper (MIT © zokuzoku) — 时间跟踪、Shadow DOM、覆盖层
// 新增功能：多种宠物 · 自定义上传 · 闲时角落漫游 · 点击变大

'use strict';

const shared = globalThis.PetNapShared;

// ============ 常量 ============
const HOST_ID = 'pet-nap-host';
const OVERLAY_ID = 'pet-nap-overlay';
const IDLE_ID = 'pet-nap-idle';
const USAGE_KEY_PREFIX = 'petNapUsage';
const CUSTOM_PETS_KEY = 'customPets';
const USAGE_STALE_MS = 30 * 60 * 1000;
const USAGE_SAVE_INTERVAL = 5;   // seconds
const SETTINGS_KEYS = new Set([
  'enabled', 'usageLimit', 'breakTime', 'customDomains',
  'activePetId', 'idleRoaming', 'hardBlock', 'mode',
]);

const hostname = location.hostname;

// ============ 运行状态 ============
let state = {
  settings: shared.normalizeSettings(null),
  customPets: [],
  activePet: null,
  isTracked: false,
  usageKey: '',
  // 计时器
  trackerRunId: 0,
  trackerRunning: false,
  stopTracker: () => {},
  saveUsage: () => {},
  // 覆盖层
  overlayActive: false,
  overlayMode: null,   // 'break' | 'play'
  cancelCountdown: () => {},
  // 漫游
  idleActive: false,
  idleTimer: null,
};

const preventScroll = (e) => e.preventDefault();

// ============ Shadow Root 管理 ============
function getShadow({ create = true } = {}) {
  let host = document.getElementById(HOST_ID);
  if (!host && create) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(host);
  }
  if (!host) return null;
  if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
  return host.shadowRoot;
}

function ensureStylesLoaded(shadow, cb) {
  if (shadow.querySelector('link[data-pet-nap-style]')) { cb(); return; }
  const link = document.createElement('link');
  link.dataset.petNapStyle = 'true';
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content.css');
  link.addEventListener('load', cb, { once: true });
  link.addEventListener('error', cb, { once: true });
  shadow.appendChild(link);
}

function updateHostPointerEvents() {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  // 覆盖层时接管整个视口；漫游时只在小宠物上接管点击
  if (state.overlayActive) {
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'auto';
  } else if (state.idleActive) {
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'none';   // 小宠物自身设 auto
  } else {
    host.style.width = '0';
    host.style.height = '0';
    host.style.pointerEvents = 'none';
  }
}

function removeHostIfEmpty() {
  const shadow = getShadow({ create: false });
  if (shadow && !shadow.querySelector(`#${OVERLAY_ID}, #${IDLE_ID}`)) {
    document.getElementById(HOST_ID)?.remove();
  }
}

// ============ 用户设置读取 ============
function loadAllAndApply(opts = {}) {
  chrome.storage.local.get(null, (all) => {
    state.settings = shared.normalizeSettings(all);
    state.customPets = Array.isArray(all[CUSTOM_PETS_KEY]) ? all[CUSTOM_PETS_KEY] : [];
    state.activePet = shared.getActivePet(state.settings, state.customPets);

    // 决定当前 hostname 是否被跟踪
    if (state.settings.mode === 'global') {
      state.usageKey = '__global__';
      state.isTracked = state.settings.enabled;
    } else {
      const matched = shared.normalizeDomainList(state.settings.customDomains)
        .find((d) => shared.hostnameMatchesDomain(hostname, d)) || '';
      state.usageKey = matched;
      state.isTracked = state.settings.enabled && !!matched;
    }

    applyRuntimeState(opts);
  });
}

function applyRuntimeState({ resetUsage = false } = {}) {
  // 停止旧计时器
  state.stopTracker();

  if (!state.settings.enabled || !state.isTracked) {
    hideIdle();
    return;
  }

  // 覆盖层活跃时不启动计时器
  if (!state.overlayActive) {
    startTracker({ resetUsage });
    if (state.settings.idleRoaming) showIdle();
    else hideIdle();
  }
}

// ============ 使用时长追踪 ============
function usageStorageKey(k) { return `${USAGE_KEY_PREFIX}:${k}`; }

function loadUsage(k, cb) {
  const sk = usageStorageKey(k);
  chrome.storage.local.get({ [sk]: null }, (r) => {
    const entry = r[sk];
    if (!entry || typeof entry !== 'object') return cb(0);
    if (Date.now() - Number(entry.updatedAt || 0) > USAGE_STALE_MS) return cb(0);
    cb(Math.max(0, Number.parseInt(entry.seconds, 10) || 0));
  });
}

function saveUsage(k, seconds) {
  if (!k) return;
  chrome.storage.local.set({
    [usageStorageKey(k)]: { seconds: Math.max(0, seconds), updatedAt: Date.now() },
  });
}

function resetUsageForKey(k) { saveUsage(k, 0); }

function startTracker({ resetUsage = false } = {}) {
  state.stopTracker();
  const runId = ++state.trackerRunId;
  const usageKey = state.usageKey;
  const usageLimit = state.settings.usageLimit;
  const breakTime = state.settings.breakTime;

  if (resetUsage) resetUsageForKey(usageKey);

  loadUsage(usageKey, (initial) => {
    if (runId !== state.trackerRunId || state.overlayActive || !state.isTracked) return;

    state.trackerRunning = true;
    let seconds = resetUsage ? 0 : initial;
    let sinceSave = 0;
    let shouldPersist = true;

    state.saveUsage = ({ clear = false } = {}) => {
      if (clear) { shouldPersist = false; seconds = 0; resetUsageForKey(usageKey); return; }
      saveUsage(usageKey, seconds);
    };

    const tick = setInterval(() => {
      if (usageKey !== state.usageKey || state.overlayActive || !state.isTracked) {
        clearInterval(tick);
        state.trackerRunning = false;
        return;
      }
      if (document.hidden || !document.hasFocus()) return;

      seconds++;
      sinceSave++;
      if (sinceSave >= USAGE_SAVE_INTERVAL) {
        saveUsage(usageKey, seconds);
        sinceSave = 0;
      }
      if (seconds >= usageLimit * 60) {
        clearInterval(tick);
        state.trackerRunning = false;
        shouldPersist = false;
        seconds = 0;
        resetUsageForKey(usageKey);
        showOverlay('break', breakTime, () => {
          if (state.isTracked && usageKey === state.usageKey) startTracker();
        });
      }
    }, 1000);

    state.stopTracker = () => {
      state.trackerRunning = false;
      if (shouldPersist) saveUsage(usageKey, seconds);
      clearInterval(tick);
      state.trackerRunId++;
    };
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.saveUsage({ clear: false });
});
window.addEventListener('pagehide', () => state.saveUsage());

// ============ 宠物渲染 ============
function petAssetSrc(pet) {
  if (!pet) return '';
  if (pet.kind === 'custom') return pet.dataUrl || '';
  return chrome.runtime.getURL(pet.asset);
}

// 生成宠物元素：视频用 <video>，图片/自定义上传用 <img>
function createPetElement(pet, sizeClass) {
  const isVideo = pet && pet.type === 'video';
  const src = petAssetSrc(pet);

  if (isVideo) {
    const v = document.createElement('video');
    v.className = `pet-video ${sizeClass}`;
    v.dataset.petKind = pet?.kind || 'preset';
    v.src = src;
    v.muted = true;
    v.autoplay = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.play?.().catch(() => { /* iOS/autoplay 政策 → 静默失败 */ });
    return v;
  }

  const img = document.createElement('img');
  img.className = `pet-img ${sizeClass}`;
  img.dataset.petKind = pet?.kind || 'preset';
  img.src = src;
  img.draggable = false;
  img.alt = pet?.name || 'pet';
  return img;
}

// ============ 漫游小宠物 ============
function showIdle() {
  if (state.idleActive) return;
  const shadow = getShadow();
  if (!shadow) return;

  state.idleActive = true;
  updateHostPointerEvents();

  ensureStylesLoaded(shadow, () => {
    if (!state.idleActive) return;

    // 移除旧的（如果有）
    shadow.getElementById(IDLE_ID)?.remove();

    const wrap = document.createElement('div');
    wrap.id = IDLE_ID;
    wrap.className = 'pet-idle';
    wrap.title = '点我陪陪你';

    const img = createPetElement(state.activePet, 'size-idle');
    wrap.appendChild(img);

    // 初始位置：屏幕右下
    const margin = 20;
    const w = 130, h = 160;
    wrap.style.setProperty('--pet-x', (window.innerWidth  - w - margin) + 'px');
    wrap.style.setProperty('--pet-y', (window.innerHeight - h - margin) + 'px');

    // 点击 → 变大
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      hideIdle();
      showOverlay('play', 0, () => {
        if (state.settings.idleRoaming && state.isTracked) showIdle();
      });
    });

    shadow.appendChild(wrap);
    scheduleRoam(wrap);
  });
}

function hideIdle() {
  const shadow = getShadow({ create: false });
  shadow?.getElementById(IDLE_ID)?.remove();
  clearTimeout(state.idleTimer);
  state.idleTimer = null;
  state.idleActive = false;
  updateHostPointerEvents();
  removeHostIfEmpty();
}

function scheduleRoam(wrap) {
  const doRoam = () => {
    if (!state.idleActive) return;
    const w = 130, h = 160;
    const margin = 12;
    const tx = Math.random() * Math.max(margin, window.innerWidth  - w - margin);
    const ty = Math.random() * Math.max(margin, window.innerHeight - h - margin);
    // 走路方向：向左走时镜像
    const currentX = parseFloat(wrap.style.getPropertyValue('--pet-x'));
    const facingLeft = tx < currentX;
    wrap.style.setProperty('--pet-facing', facingLeft ? '-1' : '1');
    wrap.style.setProperty('--pet-x', tx + 'px');
    wrap.style.setProperty('--pet-y', ty + 'px');
    wrap.classList.add('walking');
    const dur = 3000 + Math.random() * 4000;   // 3~7s 一次移动
    wrap.style.setProperty('--pet-walk-dur', dur + 'ms');
    setTimeout(() => wrap.classList.remove('walking'), dur);
    state.idleTimer = setTimeout(doRoam, dur + 800 + Math.random() * 3000);   // 停顿再走
  };
  state.idleTimer = setTimeout(doRoam, 1500);
}

// ============ 全屏覆盖层（休息 or 抚摸模式） ============
function showOverlay(mode, breakMinutes, onEnd) {
  if (state.overlayActive) return;
  state.overlayActive = true;
  state.overlayMode = mode;

  hideIdle();   // 隐藏小宠物
  const shadow = getShadow();
  if (!shadow) return;

  updateHostPointerEvents();

  ensureStylesLoaded(shadow, () => {
    if (!state.overlayActive) return;

    shadow.getElementById(OVERLAY_ID)?.remove();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'pet-overlay ' + (mode === 'break' ? 'break-mode' : 'play-mode');

    // 背景遮罩
    const bg = document.createElement('div');
    bg.className = 'pet-overlay-bg';
    overlay.appendChild(bg);

    // 宠物
    const petBox = document.createElement('div');
    petBox.className = 'pet-overlay-pet';
    const petImg = createPetElement(state.activePet, 'size-fullscreen');
    petBox.appendChild(petImg);
    overlay.appendChild(petBox);

    // 顶部文字 / 倒计时
    const label = document.createElement('div');
    label.className = 'pet-overlay-label';

    if (mode === 'break') {
      label.innerHTML = `
        <div class="pet-tag">歇一歇吧</div>
        <div class="pet-countdown" id="pnc">--:--</div>
        <div class="pet-sub">离开屏幕，站起来走走，看看远处</div>
      `;
      // 关闭按钮不显示，强制休息
    } else {
      // play mode - 抚摸模式，右上角有关闭
      label.innerHTML = `
        <div class="pet-tag">陪陪你</div>
        <div class="pet-sub">点击宠物摸一下 · 完事点右上角关闭</div>
      `;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'pet-close';
      closeBtn.setAttribute('aria-label', '关闭');
      closeBtn.innerHTML = '✕';
      closeBtn.addEventListener('click', () => dismissOverlay(overlay, onEnd));
      overlay.appendChild(closeBtn);

      // 点宠物 → 抚摸反馈
      petBox.addEventListener('click', (e) => {
        e.stopPropagation();
        petBox.classList.remove('petting');
        void petBox.offsetWidth;
        petBox.classList.add('petting');
        // 冒出爱心
        const heart = document.createElement('div');
        heart.className = 'pet-heart';
        heart.textContent = '❤';
        heart.style.left = (Math.random() * 60 - 30) + 'px';
        petBox.appendChild(heart);
        setTimeout(() => heart.remove(), 1200);
      });
    }
    overlay.appendChild(label);

    shadow.appendChild(overlay);

    // 硬拦滚动（仅休息模式）
    if (mode === 'break' && state.settings.hardBlock) {
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      // 暂停页面上的其它视频
      document.querySelectorAll('video').forEach((v) => v.pause());
    }

    // 倒计时（仅休息模式）
    if (mode === 'break') {
      startCountdown(breakMinutes * 60, shadow.getElementById('pnc'), () => {
        dismissOverlay(overlay, onEnd);
      });
    }
  });
}

function startCountdown(totalSec, el, onDone) {
  let s = totalSec;
  let cancelled = false;
  state.cancelCountdown = () => { cancelled = true; };
  const paint = () => {
    if (cancelled) return;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (el) el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    if (s <= 0) { onDone(); return; }
    s--;
    setTimeout(paint, 1000);
  };
  paint();
}

function dismissOverlay(overlay, onEnd) {
  state.cancelCountdown();
  overlay.classList.add('leaving');
  setTimeout(() => {
    overlay.remove();
    state.overlayActive = false;
    state.overlayMode = null;
    document.documentElement.style.overflow = '';
    document.removeEventListener('wheel', preventScroll);
    document.removeEventListener('touchmove', preventScroll);
    updateHostPointerEvents();
    removeHostIfEmpty();
    if (typeof onEnd === 'function') onEnd();
  }, 600);
}

// ============ 消息处理（来自 popup / 后台） ============
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_STATUS') {
    sendResponse({
      hostname,
      isTracked: state.isTracked,
      usageKey: state.usageKey,
      trackerRunning: state.trackerRunning,
      overlayActive: state.overlayActive,
      overlayMode: state.overlayMode,
      activePet: state.activePet,
    });
    return;
  }
  if (msg?.type === 'DISMISS_OVERLAY') {
    const shadow = getShadow({ create: false });
    const overlay = shadow?.getElementById(OVERLAY_ID);
    if (overlay) dismissOverlay(overlay, () => {
      if (state.isTracked) startTracker();
      if (state.settings.idleRoaming) showIdle();
    });
    sendResponse({ ok: true });
    return;
  }
  if (msg?.type === 'PLAY_NOW') {
    // 从 popup 手动触发抚摸模式
    if (!state.overlayActive) {
      showOverlay('play', 0, () => {
        if (state.isTracked) startTracker();
        if (state.settings.idleRoaming) showIdle();
      });
    }
    sendResponse({ ok: true });
    return;
  }
});

// ============ 设置变更监听 ============
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const shouldReload = Object.keys(changes).some(
    (k) => SETTINGS_KEYS.has(k) || k === CUSTOM_PETS_KEY
  );
  if (shouldReload) loadAllAndApply({ resetUsage: true });
});

// ============ 启动 ============
loadAllAndApply();
