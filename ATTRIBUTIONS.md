# Attributions · 致谢

## 借鉴的开源项目

### 1. Cat Gatekeeper — 代码机制

Repository: <https://github.com/zokuzoku/cat-gatekeeper>
License: MIT
Copyright © 2025 zokuzoku (konekone2026)

参考的**代码机制**（在 MIT 许可范围内）：

- 内容脚本 + Shadow DOM 隔离样式的覆盖层机制
- 基于 `document.hasFocus()` + `document.hidden` 的活跃时长跟踪
- 每域名独立的使用时长存储 + 过期清理
- 域名规范化 / 匹配逻辑（`shared.js` 中的 `normalizeDomainEntry`、`hostnameMatchesDomain` 等函数）

**未复用**任何 Cat Gatekeeper 的素材（那只橘猫视频、logo、品牌名）。

### 2. Kitty Screen — 透明背景橘猫视频 + 循环参数

Repository: <https://github.com/elliothux/kitty-screen>
License: MIT
Copyright © 2026 Elliot

复用的内容：

- **`presets/orange-cat.webm`** —— 来自 Kitty Screen 的 `resources/videos/windows/kitty-screen.webm`
  - VP9 + Alpha 通道的透明背景橘猫视频
  - 由绿幕原始素材通过 FFmpeg chromakey 生成，完全无边框
- **循环时间参数** —— `loopStartSec: 8.466` 和 `loopEndPadSec: 0.18`，参考自 Kitty Screen 的 `App.tsx`
  - 用来实现"入场只播一次、之后从固定点循环"的效果

MIT 允许自由使用/修改/再分发，本项目已在此明确致谢原作者。

---

## 独立创作

以下内容为 Pet Nap 独立创作：

- ✅ 全部图标（`assets/icon-*.png`）：由 `scripts/gen_icons.py` 程序生成
- ✅ 项目名称 "Pet Nap · 宠物打盹"、UI 文案、界面样式
- ✅ 差异化功能：宠物库 · 上传自定义宠物 · 闲时角落漫游 · 点击变大 · 抚摸模式

---

## 版权兜底

- 代码：MIT（见 `LICENSE`）
- 借鉴代码：MIT，已声明来源
- 视频素材：MIT（来自 Kitty Screen），已声明来源
- 用户上传的自定义宠物照片：**归用户所有**，仅保存在用户本地 `chrome.storage.local`，不上传服务器
