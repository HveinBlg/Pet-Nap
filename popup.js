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

  // 模式切换已从 UI 移除，永远走 'domain' 模式（用户填域名生效）
  // 如果之前存过 'global'，纠正一次
  if (currentSettings.mode !== 'domain') {
    currentSettings.mode = 'domain';
    setStorage({ mode: 'domain' });
  }

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

  $('#add-pet').addEventListener('click', (e) => {
    e.preventDefault();   // 现在是 <a> 链接
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
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return alert('请选择图片或视频文件');

    showProgress(isVideo ? '正在从视频截取一帧...' : '正在处理照片...');
    let success = false;
    try {
      let dataUrl;
      let bgRemovedFlag = false;

      if (isVideo) {
        dataUrl = await extractVideoFrameAsPng(file, MAX_IMAGE_SIZE);
        // 视频通常是实拍复杂场景，上传就自动跑一遍抠图
        showProgress('正在抠掉背景...');
        try {
          const cleaned = await simpleRemoveBg(dataUrl);
          dataUrl = cleaned;
          bgRemovedFlag = true;
        } catch (bgErr) {
          console.warn('auto bg removal failed:', bgErr);
        }
      } else {
        dataUrl = await fileToResizedDataUrl(file, MAX_IMAGE_SIZE);
      }

      uploadState.file = file;
      uploadState.dataUrl = dataUrl;
      uploadState.bgRemoved = bgRemovedFlag;
      preview.src = dataUrl;
      preview.classList.add('show');
      hint.style.display = 'none';
      tools.style.display = 'flex';
      rmBgHint.textContent = bgRemovedFlag ? '已自动抠图 · 不满意可以点"恢复原图"' : '';
      rmBgBtn.textContent = bgRemovedFlag ? '恢复原图' : '尝试抠掉背景';
      $('#upload-save').disabled = false;
      success = true;
    } catch (err) {
      alert('处理失败：' + err.message);
    } finally {
      hideProgress();
      if (!success) {
        // 出错时把界面恢复到"等待上传"状态
        preview.classList.remove('show');
        tools.style.display = 'none';
        hint.style.display = '';
        $('#upload-save').disabled = true;
      }
    }
  }

  function showProgress(text) {
    const p = $('#upload-progress');
    if (!p) return;
    p.hidden = false;
    $('#upload-progress-text').textContent = text;
    preview.classList.remove('show');
    hint.style.display = 'none';
  }
  function hideProgress() {
    const p = $('#upload-progress');
    if (p) p.hidden = true;
  }

  rmBgBtn.addEventListener('click', async () => {
    if (!uploadState.dataUrl || !uploadState.file) return;
    if (uploadState.bgRemoved) {
      // 恢复原图 —— 图片走 fileToResizedDataUrl，视频重新截帧
      rmBgHint.textContent = '恢复中...';
      try {
        const original = uploadState.file.type.startsWith('video/')
          ? await extractVideoFrameAsPng(uploadState.file, MAX_IMAGE_SIZE)
          : await fileToResizedDataUrl(uploadState.file, MAX_IMAGE_SIZE);
        uploadState.dataUrl = original;
        uploadState.bgRemoved = false;
        preview.src = original;
        rmBgBtn.textContent = '尝试抠掉背景';
        rmBgHint.textContent = '';
      } catch (err) {
        rmBgHint.textContent = '恢复失败: ' + err.message;
      }
      return;
    }
    rmBgHint.textContent = '处理中...';
    try {
      const out = await simpleRemoveBg(uploadState.dataUrl);
      uploadState.dataUrl = out;
      uploadState.bgRemoved = true;
      preview.src = out;
      rmBgBtn.textContent = '恢复原图';
      rmBgHint.textContent = '简易抠图 · 背景越干净效果越好';
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

// 从视频里截取"中间一帧"，压缩到 maxDim，返回 PNG data URL
// —— 用来把用户上传的宠物视频转成一张能用的静态图片（chrome.storage 装不下大视频）
function extractVideoFrameAsPng(file, maxDim) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');

    const cleanup = () => URL.revokeObjectURL(url);
    const onError = (e) => { cleanup(); reject(new Error('视频无法解码 · 换个格式试试')); };

    v.addEventListener('loadedmetadata', () => {
      // 跳到视频中段，通常猫已经进画面且姿态稳定
      v.currentTime = Math.min(0.5, v.duration * 0.4);
    });
    v.addEventListener('seeked', () => {
      try {
        const nw = v.videoWidth, nh = v.videoHeight;
        if (!nw || !nh) return onError();
        const scale = Math.min(1, maxDim / Math.max(nw, nh));
        const w = Math.round(nw * scale);
        const h = Math.round(nh * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(v, 0, 0, w, h);
        cleanup();
        resolve(canvas.toDataURL('image/png'));
      } catch (err) { cleanup(); reject(err); }
    }, { once: true });
    v.addEventListener('error', onError, { once: true });
  });
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
