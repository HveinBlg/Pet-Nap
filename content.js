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
  ensureFilters(host.shadowRoot);
  return host.shadowRoot;
}

// 注入 SVG 滤镜到 shadow DOM
// - pet-nap-clean-edges：清理 chromakey 抠像残留的粉紫色毛边
//   1. 侵蚀 alpha 通道 0.75px，咬掉最外圈 halo
//   2. feColorMatrix：让"高红+高蓝、低绿"（=粉紫色）像素 alpha 降低
function ensureFilters(shadow) {
  if (shadow.querySelector('.pet-nap-filters')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'pet-nap-filters');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';

  const defs = document.createElementNS(NS, 'defs');

  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'pet-nap-clean-edges');
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  filter.setAttribute('x', '0'); filter.setAttribute('y', '0');
  filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%');

  // 1. 先高斯模糊 alpha 通道，把 halo 边界柔化
  const blurA = document.createElementNS(NS, 'feGaussianBlur');
  blurA.setAttribute('in', 'SourceAlpha');
  blurA.setAttribute('stdDeviation', '0.6');
  blurA.setAttribute('result', 'ba');

  // 2. 阈值化：把半透明 halo 像素砍掉
  const thr = document.createElementNS(NS, 'feComponentTransfer');
  thr.setAttribute('in', 'ba');
  thr.setAttribute('result', 'ta');
  const funcA = document.createElementNS(NS, 'feFuncA');
  funcA.setAttribute('type', 'linear');
  funcA.setAttribute('slope', '4');
  funcA.setAttribute('intercept', '-1.4');
  thr.appendChild(funcA);

  // 3. 侵蚀 1.0 像素，进一步咬掉边缘
  const erode = document.createElementNS(NS, 'feMorphology');
  erode.setAttribute('operator', 'erode');
  erode.setAttribute('radius', '1.0');
  erode.setAttribute('in', 'ta');
  erode.setAttribute('result', 'e');

  // 4. 用处理后的 alpha 遮罩 SourceGraphic（拿到干净轮廓的彩色）
  const compose = document.createElementNS(NS, 'feComposite');
  compose.setAttribute('in', 'SourceGraphic');
  compose.setAttribute('in2', 'e');
  compose.setAttribute('operator', 'in');
  compose.setAttribute('result', 'src');

  // 5. 强力压制粉紫色（R+B 高、G 低）的像素 alpha
  const matrix = document.createElementNS(NS, 'feColorMatrix');
  matrix.setAttribute('in', 'src');
  matrix.setAttribute('type', 'matrix');
  matrix.setAttribute('values',
    '1    0    0    0  0 ' +
    '0    1    0    0  0 ' +
    '0    0    1    0  0 ' +
    '-0.7 1.4 -0.7  1  0'
  );
  matrix.setAttribute('result', 'clean');

  // 6. 轻微高斯模糊结果，让最终边缘看起来更自然
  const softBlur = document.createElementNS(NS, 'feGaussianBlur');
  softBlur.setAttribute('in', 'clean');
  softBlur.setAttribute('stdDeviation', '0.4');

  filter.appendChild(blurA);
  filter.appendChild(thr);
  filter.appendChild(erode);
  filter.appendChild(compose);
  filter.appendChild(matrix);
  filter.appendChild(softBlur);
  defs.appendChild(filter);
  svg.appendChild(defs);
  shadow.appendChild(svg);
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
  // 只有开启 hardBlock 的休息模式才接管整个视口的点击
  // 否则默认 pointer-events: none，让页面正常可交互
  if (state.overlayActive) {
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'none';   // 里面的关闭按钮等自己会打开
  } else if (state.idleActive) {
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'none';
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
    if (pet?.alpha) v.dataset.alpha = 'true';   // → CSS 去掉圆角/阴影
    v.src = src;
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');

    // 有 loopStartSec 就做"入场只播一次、从 loopStartSec 循环"（借用自 Kitty Screen）
    // 否则就用最傻的 loop 属性
    if (pet && typeof pet.loopStartSec === 'number' && pet.loopStartSec > 0) {
      const startAt = pet.loopStartSec;
      const endPad  = typeof pet.loopEndPadSec === 'number' ? pet.loopEndPadSec : 0.18;
      let replaying = false;
      const replay = () => {
        if (replaying) return;
        replaying = true;
        v.currentTime = startAt;
        v.play?.().catch(() => {});
      };
      v.addEventListener('ended', replay);
      v.addEventListener('seeked', () => { replaying = false; });
      v.addEventListener('timeupdate', () => {
        if (replaying || v.seeking || !Number.isFinite(v.duration)) return;
        // 到快结束时提前跳回循环起点，避免"闪一下"的接缝
        if (v.currentTime > startAt + 1 && v.duration - v.currentTime <= endPad) {
          replay();
        }
      });
    } else {
      v.loop = true;
    }

    v.play?.().catch(() => { /* autoplay 政策 → 静默失败 */ });
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
    const blocking = mode === 'break' && state.settings.hardBlock;
    overlay.className = 'pet-overlay '
      + (mode === 'break' ? 'break-mode ' : 'play-mode ')
      + (blocking ? 'blocking' : 'passthrough');

    // 背景遮罩：只在 hardBlock=true 时才有
    if (blocking) {
      const bg = document.createElement('div');
      bg.className = 'pet-overlay-bg';
      overlay.appendChild(bg);
    }

    // 中间那一行：时钟 + 宠物（时钟在左，宠物在右）
    const row = document.createElement('div');
    row.className = 'pet-row';

    if (mode === 'break') {
      const clock = document.createElement('div');
      clock.className = 'pet-timer';
      clock.id = 'pnc';
      clock.setAttribute('role', 'timer');
      clock.setAttribute('aria-live', 'polite');
      clock.textContent = '--:--';
      row.appendChild(clock);
    }

    // 宠物
    const petBox = document.createElement('div');
    petBox.className = 'pet-overlay-pet';
    const petImg = createPetElement(state.activePet, 'size-fullscreen');
    petBox.appendChild(petImg);
    row.appendChild(petBox);

    overlay.appendChild(row);

    // 关闭按钮：右上角，两种模式都有；blocking 模式下隐藏
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pet-close-corner';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => dismissOverlay(overlay, onEnd));
    overlay.appendChild(closeBtn);

    // Play 模式：点猫 → 抚摸反馈（保留互动，但不再显示"陪陪你 · 点宠物摸一下"文字）
    if (mode === 'play') {
      petBox.addEventListener('click', (e) => {
        e.stopPropagation();
        petBox.classList.remove('petting');
        void petBox.offsetWidth;
        petBox.classList.add('petting');
        const heart = document.createElement('div');
        heart.className = 'pet-heart';
        heart.textContent = '❤';
        heart.style.left = (Math.random() * 60 - 30) + 'px';
        petBox.appendChild(heart);
        setTimeout(() => heart.remove(), 1200);
      });
    }

    shadow.appendChild(overlay);

    // 硬拦滚动 + 暂停视频（仅 hardBlock 模式）
    if (blocking) {
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      document.querySelectorAll('video').forEach((v) => v.pause());
    }

    // 倒计时
    if (mode === 'break') {
      startCountdown(breakMinutes * 60, shadow.getElementById('pnc'), () => {
        dismissOverlay(overlay, onEnd);
      });
    }
  });
}

function startCountdown(totalSec, clockEl, onDone) {
  let s = totalSec;
  let cancelled = false;
  state.cancelCountdown = () => { cancelled = true; };

  const paint = () => {
    if (cancelled) return;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    // Cat Gatekeeper 风格：分钟不补 0，秒补 0 —— "0:59"、"12:34"
    if (clockEl) clockEl.textContent = `${m}:${String(sec).padStart(2, '0')}`;
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
