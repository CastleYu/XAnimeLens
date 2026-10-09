# XAnimeLens

[English](README.md) | **简体中文**

一个 Chrome 扩展：在 X（x.com）的视频或图片上点「识别」，并行调用两个独立来源识别动漫出处，再用 [Bangumi](https://bgm.tv) 补全中文名、评分、形式、类型与制作信息；结果以浮动卡片展示，可收藏到本地并导出。

| 来源 | 识别方式 | 给出 |
|---|---|---|
| [trace.moe](https://trace.moe) | 以画面帧检索动画场景数据库 | 作品、集数、时间点、相似度、匹配片段 |
| [AnimeTrace](https://www.animetrace.com) | 识别画面中的角色（独立模型） | 作品（系列级）、角色名 |

- **先到先显示**：两个来源并行请求，先返回的先展示；另一来源在卡片底部显示「识别中…」，返回后自动合并重绘。
- **多源互证**：两个来源指向同一作品时合并为一条并标注「多源一致」；仅 AnimeTrace 识别出的作品单独成条（标注「角色识别」）。
- **互不影响**：任一来源失败不影响另一来源，卡片底部会提示。AnimeTrace 可在设置中关闭。

## 功能

- X 上每个视频右上角出现「识别」按钮，点击识别当前帧，**视频不会暂停**；视频尚未开始加载时也能识别。尽量在没有字幕遮挡的画面点击。
- 推文图片（含点开后的大图）右上角同样有「识别」按钮，按原图识别（时间线里被裁切的缩略图也会取完整大图）；显示区域小于 120×90 的图片不显示按钮。
- 卡片顶部显示 trace.moe 每日额度（最近 24 小时已用 / 每日上限，与 trace.moe 赞助页一致；填了 API Key 时显示该 Key 的额度）。
- 卡片中可收藏、打开 Bangumi / AniList，并展开「输入帧 vs 匹配片段」对比。
- **收藏集**（点击扩展图标或卡片底部「打开收藏集」）：搜索、备注、删除、导出 JSON / CSV、导入 JSON。
- **设置**（收藏集页）：trace.moe API Key（提高额度）、最低相似度、Bangumi Token、AnimeTrace 开关。
- **无感升级**：在 `chrome://extensions` 刷新扩展后，已打开的 X 页面会自动注入新版本脚本，无需刷新页面。

## 安装

### 从 Release 安装

1. 在 [Releases](https://github.com/CastleYu/XAnimeLens/releases) 下载 `XAnimeLens-<版本号>.zip` 并解压。
2. Chrome 打开 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的目录。

### 从源码构建

需要 Node.js 20+。

```bash
npm install
npm run build
```

然后按上面的方式加载 `dist/` 目录。

## 隐私

无账号、无统计、无自有服务器。截取的画面只发送给 trace.moe 与 AnimeTrace 用于识别；作品名在 Bangumi 上检索；收藏与设置只保存在本机 `chrome.storage.local`。详见 [PRIVACY.md](PRIVACY.md)。

## 开发

| 命令 | 作用 |
|---|---|
| `npm run build` / `npm run watch` | 打包到 `dist/` |
| `npm run check` | TypeScript 类型检查 |
| `npm test` | 单元测试（vitest） |
| `npm run e2e` | 端到端：在 Chromium 中加载扩展、模拟 x.com 页面、真实调用 trace.moe 与 Bangumi（需联网，消耗 2 次 trace.moe 额度；首次需 `npx playwright install chromium`） |

架构、模块契约与编码规范见 [docs/DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)。

### 截帧策略

0. 视频正在缓冲时先最多等待 `Def.READY_MS` 拿到首帧。
1. 直接 `canvas.drawImage(video)`（X 的 MSE 视频不会污染 canvas）。
2. 直链视频（GIF 转 mp4 等）污染 canvas 或尚未加载时，用 `crossOrigin="anonymous"` 重新加载同一地址并跳到同一时间点截帧（video.twimg.com 对 x.com 返回 CORS 头）。
3. 视频尚未加载（`preload="none"`、MSE 未拉流）时用播放器的封面图（poster）识别。
4. 仍失败时退回整页截图（`captureVisibleTab`）并按视频位置裁剪。

## 发布

同步修改 `package.json` 与 `static/manifest.json` 的版本号后推送到 `main`，GitHub Actions（[release.yml](.github/workflows/release.yml)）会类型检查、测试、构建并发布 `v<版本号>` Release，附带 `XAnimeLens-<版本号>.zip`；该版本已发布过则跳过。也可在 Actions 页面手动运行。

## 致谢

- [trace.moe](https://trace.moe)（soruly）— 动画场景检索
- [AnimeTrace](https://www.animetrace.com) — 动漫角色识别
- [Bangumi API](https://bangumi.github.io/api/) — 条目信息
- [AniList](https://anilist.co) — 条目信息（经由 trace.moe）

本项目与 X Corp.、trace.moe、AnimeTrace、Bangumi、AniList 均无关联。请遵守各服务的使用条款与频率限制。

## 许可证

[MIT](LICENSE)
