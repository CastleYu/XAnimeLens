# XAnimeLens

Chrome 扩展：在 X（x.com）的视频或图片上点「识别」，并行调用两个独立来源识别动漫出处，再用 [Bangumi API](https://bangumi.github.io/api/) 补全中文名、评分、形式、类型与条目链接；结果以浮动卡片显示，可收藏到本地并导出。

| 来源 | 识别方式 | 给出 |
|---|---|---|
| [trace.moe](https://trace.moe) | 以画面帧检索动画数据库 | 作品、集数、时间点、相似度、匹配片段 |
| [AnimeTrace](https://www.animetrace.com) | 识别画面中的角色（独立模型） | 作品（系列级）、角色名 |

两个来源并行请求、**先返回的先展示**（另一来源在卡片底部显示「识别中…」，返回后自动合并重绘）。两个来源指向同一作品时合并为一条并标注「多源一致」；仅 AnimeTrace 识别出的作品单独成条（标注「角色识别」）。任一来源失败不影响另一来源，卡片底部会提示。AnimeTrace 可在收藏集「设置」中关闭。

## 安装

```bash
npm install
npm run build
```

Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。

## 使用

- X 上任意视频右上角出现「识别」按钮，点击即识别当前帧，视频继续播放（尽量在没有字幕遮挡的画面点击）；视频还没开始加载时也能识别。
- 推文图片（含点开后的大图）右上角同样有「识别」按钮，按原图识别（时间线里被裁切的缩略图也会取完整大图）；显示区域过小（小于 120×90）的图片不显示按钮。
- 卡片顶部的额度与 trace.moe 赞助页一致（填了 API Key 时显示该 Key 的额度）。
- 卡片中可收藏、打开 Bangumi / AniList / trace.moe 预览片段。
- 点击扩展图标或卡片底部「打开收藏集」进入收藏集：搜索、备注、删除、导出 JSON / CSV、导入 JSON。
- 收藏集页「设置」中可填 trace.moe API Key（提高额度）、最低相似度、Bangumi Token。

## 升级

在 `chrome://extensions` 刷新扩展后，已打开的 X 页面会自动注入新版本脚本，无需刷新页面。

## 开发

| 命令 | 作用 |
|---|---|
| `npm run build` / `npm run watch` | 打包到 `dist/` |
| `npm run check` | TypeScript 类型检查 |
| `npm test` | 单元测试（vitest） |
| `npm run e2e` | 端到端：加载扩展、模拟 x.com 页面、真实调用 trace.moe 与 Bangumi（需联网，消耗 2 次 trace.moe 额度；首次需 `npx playwright install chromium`） |

架构与模块契约见 [DESIGN.md](DESIGN.md)。

## 截帧策略

0. 视频正在缓冲时先最多等待 `Def.READY_MS` 拿到首帧。
1. 直接 `canvas.drawImage(video)`（X 的 MSE 视频不会污染 canvas）。
2. 直链视频（GIF 转 mp4 等）污染 canvas 或尚未加载时，用 `crossOrigin=anonymous` 重新加载同一地址并跳到同一时间点截帧（video.twimg.com 对 x.com 返回 CORS 头）。
3. 视频尚未加载（`preload=none`、MSE 未拉流）时用播放器显示的封面图 `video.poster` 识别。
4. 仍失败时退回整页截图裁剪（`captureVisibleTab`，需要 `<all_urls>` 或 `activeTab`，默认未申请，此时会提示截帧失败）。

## 发布

`package.json` 与 `static/manifest.json` 的版本号同步修改后推送到 `main`，GitHub Actions（`.github/workflows/release.yml`）会自动构建并发布 `v<版本号>` Release，附带 `XAnimeLens-<版本号>.zip`；该版本已发布过则跳过。也可在 Actions 页面手动运行。
