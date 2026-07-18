// Pet Nap 共享工具库
// 附着到 globalThis.PetNapShared，被 content.js / popup.js 复用
// 部分域名规范化逻辑参考自 Cat Gatekeeper (MIT, zokuzoku)
(function attach(root, factory) {
  const shared = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = shared;
  root.PetNapShared = shared;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // ============ 默认设置 ============
  const DEFAULT_DOMAINS = Object.freeze([
    'x.com',
    'twitter.com',
    'youtube.com',
    'bilibili.com',
    'weibo.com',
    'xiaohongshu.com',
    'zhihu.com',
    'douyin.com',
    'reddit.com',
    'facebook.com',
    'instagram.com',
  ]);

  // 预设宠物库（视频/图片）
  // - type: 'video' → 用 <video> 播放
  // - type: 'image' → 用 <img> 显示
  // - alpha: true → 视频有 alpha 通道（透明背景），显示时不加圆角/阴影
  // - loopStartSec: 循环起点秒数，用来做"入场只播一次、之后从此处循环"
  const PRESET_PETS = Object.freeze([
    {
      id: 'orange-cat',
      name: '大胖橘',
      species: 'cat',
      type: 'video',
      mime: 'video/webm',
      asset: 'presets/orange-cat.webm',
      alpha: true,
      // 来自 Kitty Screen 的默认时间参数：入场约 8.5s，之后从此处循环
      loopStartSec: 8.466,
      loopEndPadSec: 0.18,
    },
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,               // 总开关
    usageLimit: 25,              // 累计多少分钟触发（默认 25 min = 一个番茄钟）
    breakTime: 3,                // 休息时长（分钟）
    customDomains: DEFAULT_DOMAINS,
    activePetId: 'orange-cat',   // 当前使用的宠物 ID（可以是预设 ID 或 'custom:xxx'）
    idleRoaming: true,           // 是否开启平时的漫游小宠物
    hardBlock: false,            // 默认 false：不遮盖背景 / 不禁止滚动，只透明覆盖
    mode: 'domain',              // 'domain'=只在特定网站计时  'global'=在所有网站计时
  });

  // ============ 数值 clamp ============
  function clampNumber(value, min, max, fallback) {
    const v = Number.parseInt(value, 10);
    if (Number.isNaN(v)) return fallback;
    return Math.min(Math.max(v, min), max);
  }

  // ============ 域名规范化 ============
  function normalizeDomainEntry(entry) {
    if (typeof entry !== 'string') return '';
    let v = entry.trim().toLowerCase();
    if (!v) return '';
    v = v.replace(/^[*.]+/, '');
    try {
      const url = new URL(v.includes('://') ? v : `https://${v}`);
      v = url.hostname.toLowerCase();
    } catch {
      v = v.split(/[/?#]/, 1)[0].trim().toLowerCase();
      v = v.replace(/:\d+$/, '');
    }
    v = v.replace(/^www\./, '').replace(/^[*.]+/, '').replace(/\.+$/, '');
    if (!v || !v.includes('.') || !/^[a-z0-9.-]+$/.test(v)) return '';
    return v;
  }

  function normalizeDomainList(domains) {
    const list = Array.isArray(domains)
      ? domains
      : typeof domains === 'string'
        ? domains.split(/[\n,]+/)
        : [];
    const out = [];
    const seen = new Set();
    list.forEach((d) => {
      const n = normalizeDomainEntry(d);
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    });
    return out;
  }

  function hostnameMatchesDomain(hostname, domain) {
    const h = normalizeDomainEntry(hostname);
    const d = normalizeDomainEntry(domain);
    if (!h || !d) return false;
    return h === d || h.endsWith(`.${d}`);
  }

  function isTrackedHostname(hostname, settings) {
    const s = normalizeSettings(settings);
    if (s.mode === 'global') return true;
    return normalizeDomainList(s.customDomains).some((d) =>
      hostnameMatchesDomain(hostname, d)
    );
  }

  // ============ 宠物工具 ============
  function findPreset(id) {
    return PRESET_PETS.find((p) => p.id === id) || null;
  }

  function getActivePet(settings, customPets) {
    const s = normalizeSettings(settings);
    const cps = Array.isArray(customPets) ? customPets : [];
    if (s.activePetId && s.activePetId.startsWith('custom:')) {
      const cid = s.activePetId.slice('custom:'.length);
      const cp = cps.find((p) => p.id === cid);
      if (cp) return { ...cp, type: 'custom', kind: 'custom' };
    }
    const preset = findPreset(s.activePetId) || PRESET_PETS[0];
    return { ...preset, kind: 'preset' };
  }

  // ============ 设置归一化 ============
  function normalizeSettings(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};
    const domains = normalizeDomainList(s.customDomains);
    const hasDomains = Object.prototype.hasOwnProperty.call(s, 'customDomains');
    return {
      enabled: s.enabled !== false,
      usageLimit: clampNumber(s.usageLimit, 1, 480, DEFAULT_SETTINGS.usageLimit),
      breakTime: clampNumber(s.breakTime, 1, 60, DEFAULT_SETTINGS.breakTime),
      customDomains: hasDomains ? domains : [...DEFAULT_SETTINGS.customDomains],
      activePetId: typeof s.activePetId === 'string' && s.activePetId
        ? s.activePetId
        : DEFAULT_SETTINGS.activePetId,
      idleRoaming: s.idleRoaming !== false,
      hardBlock: s.hardBlock !== false,
      mode: s.mode === 'global' ? 'global' : 'domain',
    };
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_DOMAINS,
    PRESET_PETS,
    clampNumber,
    hostnameMatchesDomain,
    normalizeDomainEntry,
    normalizeDomainList,
    normalizeSettings,
    isTrackedHostname,
    findPreset,
    getActivePet,
  };
});
