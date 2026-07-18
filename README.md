# 🐾 Pet Nap · 宠物打盹

**累了？让萌宠来叫你休息。** 一个受 [Cat Gatekeeper](https://github.com/zokuzoku/cat-gatekeeper) 启发的 Chrome 扩展：设定累计使用时长，时间到了萌宠就会铺满屏幕陪你休息。

**与 Cat Gatekeeper 的区别**：多种预设宠物、**可以上传自家宠物照片**、闲时会在页面角落漫游、点击可变大抚摸。

## ✨ 功能

| 功能 | 说明 |
|---|---|
| ⏰ **强制休息** | 累计使用 N 分钟后，宠物铺满屏幕 + 倒计时 + 禁止滚动 |
| 🐱 **多种宠物** | 内置"小橘"、"阿柴"两只 SVG 动画宠物，会呼吸/眨眼/摇尾巴 |
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
│   ├── orange.svg         # 预设：小橘（原创 SVG）
│   └── shiba.svg          # 预设：阿柴（原创 SVG）
├── assets/icon-*.png      # 扩展图标
├── scripts/gen_icons.py   # 图标生成脚本（纯 stdlib）
├── LICENSE                # MIT
├── ATTRIBUTIONS.md        # 致谢 · 版权说明
└── README.md
```

## 🛠 想加自己的 WebM 宠物？

真实猫咪视频比 SVG 更有代入感。如果你想用 WebM/MP4 视频作为宠物：

1. 从 [Pexels](https://www.pexels.com/search/videos/cat/) 或 [Pixabay](https://pixabay.com/videos/search/cat/) 下载 CC0 的宠物视频（推荐 5-15 秒循环）
2. 用 [Handbrake](https://handbrake.fr/) 转成 WebM 格式，去掉音轨，压缩到 1-3MB
3. 扔到 `presets/` 目录，例如 `presets/tabby-nap.webm`
4. 在 `shared.js` 的 `PRESET_PETS` 数组里加一项：
   ```js
   { id: 'tabby-nap', name: '躺平橘', species: 'cat', type: 'video',
     asset: 'presets/tabby-nap.webm', thumb: 'presets/tabby-thumb.png' }
   ```
5. 需要在 `content.js` 的 `createPetElement` 里加分支处理 `type === 'video'` → 生成 `<video autoplay loop muted>` 而不是 `<img>`

**⚠️ 版权提醒**：不要用 Cat Gatekeeper 的 `neko1.webm` / `neko2.webm`（作者保留所有权利）。

## 🗺 后续路线

- [ ] WebM 视频宠物支持（上面步骤代码化）
- [ ] 更好的抠图（MediaPipe / u2net WASM）
- [ ] 让上传的宠物"走起来"（不只是原地呼吸）
- [ ] 成就系统（累计休息次数解锁新预设）
- [ ] 桌面版（Tauri，宠物在整个桌面漫游）

## 📜 License

MIT · 见 [LICENSE](LICENSE)

代码机制部分参考自 Cat Gatekeeper (MIT © zokuzoku)，详见 [ATTRIBUTIONS.md](ATTRIBUTIONS.md)。
