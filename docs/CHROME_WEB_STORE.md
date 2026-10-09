# Chrome Web Store 发布资料

提交 [Chrome Web Store 开发者控制台](https://chrome.google.com/webstore/devconsole) 时可直接复制的文案。上传包使用 Release 附带的 `XAnimeLens-<版本号>.zip`（即 `dist/` 的内容，`manifest.json` 位于压缩包根目录）。

## 商品详情 / Store listing

**名称 / Name**：XAnimeLens

**简短说明 / Summary**（≤ 132 字符，与 manifest `description` 一致）

- zh-CN：在 X 上识别视频与图片里的动漫（trace.moe + Bangumi），并收藏到本地。
- en：Identify the anime behind videos and images on X with trace.moe, AnimeTrace and Bangumi, and keep a local collection.

**详细说明 / Description**

```
Click "识别" (Recognize) on any video or image on X (x.com) to find out which anime it comes from.

• Two independent sources in parallel: trace.moe (scene search: title, episode, timestamp, similarity, matching clip) and AnimeTrace (character recognition).
• Results enriched with Bangumi: Chinese title, rating, format, season, genres, studio and staff.
• Videos keep playing while you recognize; works on videos that have not loaded yet and on full-size tweet images.
• Compare your frame with the matched clip side by side.
• Save results to a local collection with notes; export JSON / CSV, import JSON.
• Optional trace.moe API key and Bangumi token for higher quota.

No account, no analytics. Frames are sent only to the recognition services when you click the button; everything else stays on your device.
Interface language: Simplified Chinese.
Source code: https://github.com/CastleYu/XAnimeLens
```

**类别 / Category**：Tools（工具）或 Entertainment（娱乐）

**语言 / Language**：中文（简体）

## 隐私权规范 / Privacy practices

**单一用途 / Single purpose**

```
Identify the source anime of videos and images on X (x.com) and let the user keep a local list of identified works.
```

**权限理由 / Permission justifications**

| 权限 | Justification |
|---|---|
| `storage` | Stores the user's favorites and settings (optional API key/token, minimum similarity) locally in chrome.storage.local. |
| `activeTab` | Fallback frame capture: takes a screenshot of the visible X tab with captureVisibleTab when a video frame cannot be read from the canvas. |
| `tabs` | Finds open x.com / twitter.com tabs to re-inject the updated content script after the extension updates, and opens the collection page in a new tab. |
| `scripting` | Re-injects the content script into already-open X tabs after install/update so the user does not have to reload the page. |
| Host permissions | x.com / twitter.com: inject the recognize button. api.trace.moe, api.animetrace.com: send the captured frame for recognition. api.bgm.tv, lain.bgm.tv, s4.anilist.co: metadata and cover images. pbs.twimg.com and api.trace.moe previews: download tweet images and preview clips in the background because X's CSP blocks them in the page. |
| 远程代码 / Remote code | No. All code is bundled in the package; only JSON APIs and images/videos are fetched. |

**数据使用 / Data usage** — 勾选：

- 网站内容（Website content）：用户点击按钮时截取的视频帧 / 推文图片，发送给 trace.moe 与 AnimeTrace 用于识别。
- 其余类别（个人身份信息、健康、财务、身份验证信息、个人通讯、位置、网络历史、用户活动）均不勾选。
  - 可选的 trace.moe API Key / Bangumi Token 仅保存在本地，仅发送给对应服务；如审核要求，可按「身份验证信息」披露。

三项声明全部勾选：不出售给第三方；不用于与单一用途无关的目的；不用于信用评估或放贷。

**隐私权政策网址 / Privacy policy URL**：`https://github.com/CastleYu/XAnimeLens/blob/main/PRIVACY.md`

## 素材清单 / Assets

| 素材 | 规格 | 必需 |
|---|---|---|
| 扩展图标 | 128×128 PNG，放入 `static/icons/` 并在 manifest `icons` 中声明 | 是 |
| 商店图标 | 128×128 PNG（可与上面相同） | 是 |
| 截图 | 1280×800 或 640×400，1–5 张 | 至少 1 张 |
| 小型宣传图 | 440×280 | 否 |
| 顶部宣传图 | 1400×560 | 否 |
