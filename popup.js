// Pet Nap · Popup 设置面板 + 上传流程
'use strict';

// ============ 独立预览兼容层 ============
// preview.html 里直接打开 popup.html 时，chrome API 不存在
// 这里提供一个 no-op 版让 UI 至少能正常渲染
if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb({}),
        set: (_obj, cb) => cb && cb(),
        onChanged: { addListener: () => {} },
      },
    },
    tabs: {
      query: (_opts, cb) => cb([{ id: -1 }]),
      sendMessage: (_id, _msg, cb) => cb && cb({ ok: false }),
    },
    runtime: {
      getURL: (p) => p,
      lastError: null,
    },
  };
}

const shared = globalThis.PetNapShared;
const CUSTOM_PETS_KEY = 'customPets';
const MAX_CUSTOM_PETS = 8;
const MAX_IMAGE_SIZE = 512;   // 保存前压缩边长上限

const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentSettings = null;
let currentCustom = [];
let uploadState = { file: null, dataUrl: '', bgRemoved: false };

// ============ 启动 ============
init();

async function init() {
  const all = await getAll();
  currentSettings = shared.normalizeSettings(all);
  currentCustom = Array.isArray(all[CUSTOM_PETS_KEY]) ? all[CUSTOM_PETS_KEY] : [];

  renderAll();
  bindEvents();
}

function getAll() {
  return new Promise((r) => chrome.storage.local.get(null, r));
}
function setStorage(obj) {
  return new Promise((r) => chrome.storage.local.set(obj, r));
}

function renderAll() {
  const s = currentSettings;
  $('#enabled').checked        = s.enabled;
  $('#domains').value          = s.customDomains.join('\n');
  $('#idleRoaming').checked    = s.idleRoaming;
  $('#hardBlock').checked      = s.hardBlock;
  $(`input[name="mode"][value="${s.mode}"]`).checked = true;
  $('#domains-wrap').style.display = s.mode === 'domain' ? '' : 'none';

  syncChips('usageLimit', s.usageLimit);
  syncChips('breakTime',  s.breakTime);

  renderCurrentPet();
  renderPetGrid();
}

// 让选中的 chip 高亮；若没有匹配项，就高亮"最接近"的
function syncChips(key, value) {
  const wrap = document.querySelector(`.chips[data-key="${key}"]`);
  if (!wrap) return;
  const btns = [...wrap.querySelectorAll('button')];
  let match = btns.find((b) => +b.dataset.value === value);
  if (!match) {
    // 没精确匹配（用户之前 slider 时代的老值）→ 就近取一个
    match = btns.reduce((best, b) => {
      const bv = +b.dataset.value;
      const dv = Math.abs(bv - value);
      return (!best || dv < Math.abs(+best.dataset.value - value)) ? b : best;
    }, null);
  }
  btns.forEach((b) => b.classList.toggle('active', b === match));
}

function renderCurrentPet() {
  const pet = shared.getActivePet(currentSettings, currentCustom);
  $('#pet-name').textContent = pet.name || '未命名';
  const label = pet.kind === 'custom'
    ? '自定义 · 我家的'
    : `预设 · ${pet.species === 'cat' ? '猫咪' : (pet.species === 'dog' ? '狗狗' : '宠物')}`;
  $('#pet-status').textContent = label;
  // 预览卡已删除。宠物库瓦片里会显示视频，那里更合适（且能对比多只）
}

// 创建一个"跳过入场、只循环 loopStartSec 之后"的 video
// 关键：初始时隐藏，seek 到猫出现的时间后再显示，避免看到"透明入场帧"
function makeLoopVideo(src, loopStartSec) {
  const v = document.createElement('video');
  v.src = src;
  v.muted = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';

  if (typeof loopStartSec === 'number' && loopStartSec > 0) {
    const startAt = loopStartSec;
    v.style.opacity = '0';
    v.style.transition = 'opacity 0.25s ease';
    let seekedOnce = false;

    v.addEventListener('loadedmetadata', () => {
      v.currentTime = startAt;
    });
    v.addEventListener('seeked', () => {
      if (!seekedOnce) {
        seekedOnce = true;
        v.style.opacity = '1';
        v.play?.().catch(() => {});
      }
    });
    v.addEventListener('timeupdate', () => {
      if (!seekedOnce || !Number.isFinite(v.duration)) return;
      if (v.duration - v.currentTime < 0.2) v.currentTime = startAt;
    });
    v.addEventListener('ended', () => {
      v.currentTime = startAt;
      v.play?.().catch(() => {});
    });
  } else {
    v.loop = true;
  }
  v.play?.().catch(() => {});
  return v;
}

function renderPetGrid() {
  const grid = $('#pet-grid');
  grid.innerHTML = '';

  const activeId = currentSettings.activePetId;

  // 预设
  shared.PRESET_PETS.forEach((p) => {
    grid.appendChild(makeTile({
      id: p.id,
      name: p.name,
      thumbSrc: chrome.runtime.getURL(p.asset),
      isVideo: p.type === 'video',
      loopStartSec: p.loopStartSec,
      active: activeId === p.id,
      isCustom: false,
    }));
  });

  // 自定义
  currentCustom.forEach((cp) => {
    const activeKey = 'custom:' + cp.id;
    grid.appendChild(makeTile({
      id: activeKey,
      name: cp.name || '我家的',
      thumbSrc: cp.dataUrl,
      isVideo: false,
      active: activeId === activeKey,
      isCustom: true,
      customId: cp.id,
    }));
  });
}

function makeTile({ id, name, thumbSrc, isVideo, loopStartSec, active, isCustom, customId }) {
  const el = document.createElement('div');
  el.className = 'pet-tile' + (active ? ' active' : '');
  el.dataset.petId = id;

  // media（视频用 DOM API，方便挂 loopStart 逻辑）
  const media = isVideo ? makeLoopVideo(thumbSrc, loopStartSec) : (() => {
    const img = document.createElement('img');
    img.src = thumbSrc; img.alt = '';
    return img;
  })();
  el.appendChild(media);

  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = name;
  el.appendChild(nameEl);

  if (isCustom) {
    const del = document.createElement('button');
    del.className = 'tile-del custom';
    del.dataset.customId = customId;
    del.title = '删除';
    del.textContent = '✕';
    el.appendChild(del);
  }
  el.addEventListener('click', async (e) => {
    if (e.target.matches('.tile-del')) return;
    currentSettings = { ...currentSettings, activePetId: id };
    await setStorage({ activePetId: id });
    renderAll();
  });
  const delBtn = el.querySelector('.tile-del');
  if (delBtn) {
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`删除 "${name}"？`)) return;
      currentCustom = currentCustom.filter((c) => c.id !== customId);
      const patch = { [CUSTOM_PETS_KEY]: currentCustom };
      if (currentSettings.activePetId === 'custom:' + customId) {
        patch.activePetId = shared.DEFAULT_SETTINGS.activePetId;
        currentSettings.activePetId = patch.activePetId;
      }
      await setStorage(patch);
      renderAll();
    });
  }
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ============ 事件绑定 ============
function bindEvents() {
  $('#enabled').addEventListener('change', (e) => {
    currentSettings.enabled = e.target.checked;
    setStorage({ enabled: e.target.checked });
  });

  // 时长预设 chip 点击
  document.querySelectorAll('.chips').forEach((wrap) => {
    const key = wrap.dataset.key;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const val = +btn.dataset.value;
      wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentSettings[key] = val;
      setStorage({ [key]: val });
    });
  });

  $$('input[name="mode"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      const mode = e.target.value;
      currentSettings.mode = mode;
      $('#domains-wrap').style.display = mode === 'domain' ? '' : 'none';
      setStorage({ mode });
    });
  });

  $('#domains').addEventListener('change', (e) => {
    const list = shared.normalizeDomainList(e.target.value);
    currentSettings.customDomains = list;
    setStorage({ customDomains: list });
    e.target.value = list.join('\n');
  });

  $('#idleRoaming').addEventListener('change', (e) => setStorage({ idleRoaming: e.target.checked }));
  $('#hardBlock').addEventListener('change', (e) => setStorage({ hardBlock: e.target.checked }));

  // Play now
  $('#play-now').addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return alert('请在网页 Tab 中使用');
    const url = tab.url || '';
    // chrome:// / edge:// / about: / chrome-extension:// 等特殊页面不能注入
    if (/^(chrome|edge|about|chrome-extension|file):/.test(url)) {
      return alert('这个页面（' + url.split('://')[0] + '://）不能注入脚本，换个普通网页试试～');
    }
    const ok = await sendPlayNow(tab.id);
    if (ok) window.close();
    else alert('没能唤起宠物，试试刷新一下页面再来');
  });

  // 上传流程
  bindUpload();

  // 打赏
  $('#tip').addEventListener('click', (e) => {
    e.preventDefault();
    $('#tip-modal').classList.remove('hidden');
  });
  $('#tip-close').addEventListener('click', () => $('#tip-modal').classList.add('hidden'));
  $('#tip-attr').addEventListener('click', () => {
    $('#tip-modal').classList.add('hidden');
    $('#attr-modal').classList.remove('hidden');
  });
  $('#attr-close').addEventListener('click', () => $('#attr-modal').classList.add('hidden'));

  // 点击遮罩关闭 modal
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });
}

function getActiveTab() {
  return new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => r(tabs[0])));
}

// 发送 PLAY_NOW 消息；若内容脚本还没注入到该 tab（比如扩展刚安装 / 更新），
// 用 chrome.scripting 主动注入一次再重试。
async function sendPlayNow(tabId) {
  const trySend = () => new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'PLAY_NOW' }, () => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(true);
      });
    } catch { resolve(false); }
  });

  // 第一次尝试
  if (await trySend()) return true;

  // 注入 shared.js + content.js
  if (!chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['shared.js', 'content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css'],
    }).catch(() => { /* content.css 通过 web_accessible_resources 加载即可，失败不致命 */ });
  } catch (err) {
    console.warn('inject failed:', err);
    return false;
  }

  // 稍等一下让脚本初始化
  await new Promise((r) => setTimeout(r, 150));
  return trySend();
}

// ============ 上传流程 ============
function bindUpload() {
  const modal = $('#upload-modal');
  const slot = $('#upload-slot');
  const fileInput = $('#file-input');
  const preview = $('#upload-preview');
  const hint = $('#upload-hint');
  const nameInput = $('#pet-name-input');
  const tools = $('#upload-tools');
  const rmBgBtn = $('#rm-bg');
  const rmBgHint = $('#rm-bg-hint');

  $('#add-pet').addEventListener('click', () => {
    if (currentCustom.length >= MAX_CUSTOM_PETS) {
      alert(`最多保存 ${MAX_CUSTOM_PETS} 只自定义宠物`);
      return;
    }
    resetUploadState();
    modal.classList.remove('hidden');
  });

  slot.addEventListener('click', () => fileInput.click());
  slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('dragover'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('请选择图片文件');
    try {
      const dataUrl = await fileToResizedDataUrl(file, MAX_IMAGE_SIZE);
      uploadState.file = file;
      uploadState.dataUrl = dataUrl;
      uploadState.bgRemoved = false;
      preview.src = dataUrl;
      preview.classList.add('show');
      hint.style.display = 'none';
      tools.style.display = 'flex';
      rmBgHint.textContent = '';
      $('#upload-save').disabled = false;
    } catch (err) {
      alert('加载图片失败：' + err.message);
    }
  }

  rmBgBtn.addEventListener('click', async () => {
    if (!uploadState.dataUrl) return;
    if (uploadState.bgRemoved) {
      // 恢复原图
      const original = await fileToResizedDataUrl(uploadState.file, MAX_IMAGE_SIZE);
      uploadState.dataUrl = original;
      uploadState.bgRemoved = false;
      preview.src = original;
      rmBgBtn.textContent = '尝试抠掉背景';
      rmBgHint.textContent = '';
      return;
    }
    rmBgHint.textContent = '处理中...';
    try {
      const out = await simpleRemoveBg(uploadState.dataUrl);
      uploadState.dataUrl = out;
      uploadState.bgRemoved = true;
      preview.src = out;
      rmBgBtn.textContent = '恢复原图';
      rmBgHint.textContent = '简易抠图 · 背景越简单效果越好';
    } catch (err) {
      rmBgHint.textContent = '抠图失败: ' + err.message;
    }
  });

  $('#upload-cancel').addEventListener('click', () => modal.classList.add('hidden'));
  $('#upload-save').addEventListener('click', async () => {
    if (!uploadState.dataUrl) return;
    const petId = 'p' + Date.now();
    const newPet = {
      id: petId,
      name: nameInput.value.trim() || '我家的',
      species: 'custom',
      dataUrl: uploadState.dataUrl,
      addedAt: Date.now(),
    };
    currentCustom.push(newPet);
    const activePetId = 'custom:' + petId;
    currentSettings.activePetId = activePetId;
    await setStorage({
      [CUSTOM_PETS_KEY]: currentCustom,
      activePetId,
    });
    modal.classList.add('hidden');
    renderAll();
  });
}

function resetUploadState() {
  uploadState = { file: null, dataUrl: '', bgRemoved: false };
  $('#file-input').value = '';
  $('#upload-preview').classList.remove('show');
  $('#upload-preview').src = '';
  $('#upload-hint').style.display = '';
  $('#upload-tools').style.display = 'none';
  $('#pet-name-input').value = '';
  $('#upload-save').disabled = true;
  $('#rm-bg').textContent = '尝试抠掉背景';
  $('#rm-bg-hint').textContent = '';
}

// 读取文件 → 压缩到 maxDim → 返回 data URL
function fileToResizedDataUrl(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============ 简易抠图（角落像素采样 + 颜色距离）============
// 效果一般，仅适合背景比较纯净的照片。以后可换成 MediaPipe 或 ONNX。
async function simpleRemoveBg(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('图片加载失败'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const w = canvas.width, h = canvas.height;
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      // 采样 8 个边缘位置的像素作为"背景候选"
      const samples = [];
      const pts = [
        [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
        [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)],
      ];
      pts.forEach(([px, py]) => {
        const i = (py * w + px) * 4;
        samples.push([d[i], d[i + 1], d[i + 2]]);
      });

      // 计算每个像素到最近背景样本的距离，距离小的抠掉
      const threshold = 60;   // 0-441（RGB 空间对角线约 441）
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          let minDist = Infinity;
          for (const [sr, sg, sb] of samples) {
            const dr = r - sr, dg = g - sg, db = b - sb;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < minDist) minDist = dist;
          }
          if (minDist < threshold) {
            // 边缘平滑：距离越接近阈值，透明度越渐进
            const alpha = Math.max(0, (minDist - threshold * 0.5) / (threshold * 0.5));
            d[i + 3] = Math.round(alpha * 255);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}
