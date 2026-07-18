# 🐾 Pet Nap · 宠物打盹

**累了？让萌宠来叫你休息。** 一个受 [Cat Gatekeeper](https://github.com/zokuzoku/cat-gatekeeper) 启发的 Chrome 扩展：设定累计使用时长，时间到了萌宠就会铺满屏幕陪你休息。

**与 Cat Gatekeeper 的区别**：多种预设宠物、**可以上传自家宠物照片**、闲时会在页面角落漫游、点击可变大抚摸。

## ✨ 功能

| 功能 | 说明 |
|---|---|
| ⏰ **强制休息** | 累计使用 N 分钟后，宠物铺满屏幕 + 倒计时 + 禁止滚动 |
| 🐱 **真实猫咪** | 内置真实猫咪视频（MP4），躺着的姿态陪你休息 |
| 📷 **上传我家宠物** | 拍张照上传，宠物就会以你家宝贝的样子陪你（内置简易抠图） |
| 🚶 **闲时漫游** | 平时一只小宠物在浏览器角落随机走动 |
| 🫶 **点击变大** | 点角落小宠物 → 平滑变大铺屏 → 可抚摸互动 |
| 🎯 **网站定向** | 只在你选的分心网站计时（YouTube、B 站、微博、抖音...） |

## 🚀 安装

### 从源码加载（开发者模式）

1. 下载 / 克隆本仓库到本地
2. 打开 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点 **加载已解压的扩展程序** → 选择本仓库根目录
5. 工具栏出现 🐾 图标 → 点击开玩

支持 Chrome / Edge / Brave / Arc 等所有基于 Chromium 的浏览器。

## 🎮 快速上手

1. **首次打开**：默认 25 分钟计时 + 3 分钟休息，跟踪 YouTube / B 站等分心网站
2. **换宠物**：popup 里点宠物图标切换，或点 **+ 上传我家宠物** 加入自家宝贝
3. **立刻见效果**：popup 顶部点 **陪我一下** → 宠物立刻铺满屏幕
4. **调时间**：拖两个滑条即可（累计使用 · 强制休息）
5. **加/减网站**：在 popup 的域名文本框里，每行一个域名

## 📂 项目结构

```
pet-nap-extension/
├── manifest.json          # Manifest V3
├── content.js             # 核心：计时 · 覆盖层 · 漫游宠物
├── content.css            # Shadow DOM 样式
├── shared.js              # 存储 · 域名 · 设置工具
├── popup.html/js/css      # 设置面板 + 上传弹窗
├── presets/
│   ├── 19091266-hd_1920_1080_30fps.mp4  # 预设猫咪 A（1080p, Pexels ID 19091266）
│   └── 19787248-uhd_3840_2160_25fps.mp4 # 预设猫咪 B（4K, Pexels ID 19787248）
├── assets/icon-*.png      # 扩展图标
├── scripts/gen_icons.py   # 图标生成脚本（纯 stdlib）
├── LICENSE                # MIT
├── ATTRIBUTIONS.md        # 致谢 · 版权说明
└── README.md
```

## 🛠 加更多预设宠物

`shared.js` 的 `PRESET_PETS` 数组决定内置宠物。加视频的步骤：

1. 从 [Pexels](https://www.pexels.com/search/videos/cat/) 或 [Pixabay](https://pixabay.com/videos/search/cat/) 下载 CC0 的宠物视频（推荐 5-15 秒可循环）
2. 用 [Handbrake](https://handbrake.fr/) / [CloudConvert](https://cloudconvert.com/) 压到 1080p 以内、去音轨、< 5MB
3. 扔到 `presets/` 目录
4. 在 `shared.js` 的 `PRESET_PETS` 追加：
   ```js
   { id: 'cat-loaf', name: '面包猫', species: 'cat', type: 'video',
     mime: 'video/mp4', asset: 'presets/cat-loaf.mp4' }
   ```

代码已经支持 `type: 'video'` 会自动用 `<video autoplay loop muted>` 播放。

**⚠️ 版权提醒**：不要用 Cat Gatekeeper 的 `neko1.webm` / `neko2.webm`（作者保留所有权利）。用之前确认视频的授权协议。

## 🗺 后续路线

- [ ] WebM 视频宠物支持（上面步骤代码化）
- [ ] 更好的抠图（MediaPipe / u2net WASM）
- [ ] 让上传的宠物"走起来"（不只是原地呼吸）
- [ ] 成就系统（累计休息次数解锁新预设）
- [ ] 桌面版（Tauri，宠物在整个桌面漫游）

## 📜 License

MIT · 见 [LICENSE](LICENSE)

代码机制部分参考自 Cat Gatekeeper (MIT © zokuzoku)，详见 [ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
