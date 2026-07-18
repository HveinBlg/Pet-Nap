# Attributions · 致谢

## 借鉴的开源项目

**Cat Gatekeeper**  
Repository: <https://github.com/zokuzoku/cat-gatekeeper>  
License: MIT  
Copyright © 2025 zokuzoku (konekone2026)

本项目的以下**代码机制**参考自 Cat Gatekeeper（在 MIT 许可范围内）：

- 内容脚本 + Shadow DOM 隔离样式的覆盖层机制
- 基于 `document.hasFocus()` + `document.hidden` 的活跃时长跟踪
- 每域名独立的使用时长存储 + 过期清理
- 域名规范化 / 匹配逻辑（`shared.js` 中的 `normalizeDomainEntry`、`hostnameMatchesDomain` 等函数）

## 独立创作 · 与 Cat Gatekeeper 无关联

以下内容均为 Pet Nap 独立创作，**未复用**任何 Cat Gatekeeper 的素材：

- ✅ 全部图标（`assets/icon-*.png`）：由 `scripts/gen_icons.py` 程序生成
- ✅ 项目名称 "Pet Nap · 宠物打盹"、UI 文案、界面样式
- ✅ 新增功能：宠物库、上传自定义宠物、闲时角落漫游、点击变大、抚摸模式

## 预设宠物视频

`presets/*.mp4` 中的视频文件来自第三方平台（文件名的数字为 Pexels 视频 ID）：

- `19091266-hd_1920_1080_30fps.mp4` — Pexels video ID [19091266](https://www.pexels.com/video/19091266/)
- `19787248-uhd_3840_2160_25fps.mp4` — Pexels video ID [19787248](https://www.pexels.com/video/19787248/)

Pexels 上的内容使用 [Pexels License](https://www.pexels.com/license/)，允许免费商用、修改，无需署名。使用前请自行确认视频当前的授权协议。

## 声明

- Cat Gatekeeper 的品牌名、Logo、猫咪视频素材均归 zokuzoku 所有，本项目**未包含**这些素材。
- 如果你要在 Chrome Web Store 上架，请自行确认不要在描述里冒用 "Cat Gatekeeper" 品牌。
