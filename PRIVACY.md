# Privacy Policy / 隐私政策

**English** · [简体中文](#简体中文)

_Last updated: 2026-10-10_

XAnimeLens is a browser extension that identifies anime in videos and images on X (x.com). It has no backend server of its own, requires no account, and contains no analytics or tracking.

## What data is processed

| Data | When | Sent to | Purpose |
|---|---|---|---|
| A single captured video frame or tweet image | Only when you click the recognize button | `api.trace.moe` and, unless disabled in settings, `api.animetrace.com` | Anime scene / character recognition |
| Anime titles and character names returned by those services | After recognition | `api.bgm.tv` | Look up Chinese titles, ratings and other metadata |
| Your trace.moe API key (optional) | With each trace.moe request | `api.trace.moe` only | Higher quota, quota display |
| Your Bangumi access token (optional) | With each Bangumi request | `api.bgm.tv` only | Authenticated Bangumi API access |
| Cover, character and preview images | When a result card is shown | The image hosts used by these services (e.g. `lain.bgm.tv`, `s4.anilist.co`, `api.trace.moe`, `pbs.twimg.com`) | Display in the card |

The extension does **not** read your X account, timeline content, direct messages, cookies or browsing history, and does not send the tweet URL to any service.

## What is stored

Favorites (title, episode, timestamp, cover, source tweet URL, your notes) and settings (API key, token, minimum similarity, AnimeTrace toggle) are stored **only on your device** in `chrome.storage.local`. They are never uploaded. You can export, import or delete them from the collection page; uninstalling the extension removes them.

## Third-party services

Requests to the services above are subject to their own privacy policies:
[trace.moe](https://trace.moe), [AnimeTrace](https://www.animetrace.com), [Bangumi](https://bgm.tv), [AniList](https://anilist.co).

## Data sale and use

The developer does not collect, sell, or transfer user data, and does not use it for any purpose unrelated to the extension's single purpose (identifying anime on X).

## Contact

Questions: open an issue at <https://github.com/CastleYu/XAnimeLens/issues>.

---

## 简体中文

_最后更新：2026-10-10_

XAnimeLens 是一个在 X（x.com）上识别视频与图片中动漫出处的浏览器扩展。它没有自有后端服务器、不需要账号，也不包含任何统计或追踪代码。

### 处理哪些数据

| 数据 | 时机 | 发送到 | 目的 |
|---|---|---|---|
| 截取的单帧画面或推文图片 | 仅在你点击「识别」按钮时 | `api.trace.moe`，以及（未在设置中关闭时）`api.animetrace.com` | 动画场景 / 角色识别 |
| 上述服务返回的作品名、角色名 | 识别完成后 | `api.bgm.tv` | 检索中文名、评分等条目信息 |
| 你的 trace.moe API Key（可选） | 随 trace.moe 请求 | 仅 `api.trace.moe` | 提高额度、显示额度 |
| 你的 Bangumi Token（可选） | 随 Bangumi 请求 | 仅 `api.bgm.tv` | 以登录身份访问 Bangumi API |
| 封面、角色头像与预览片段 | 显示结果卡片时 | 上述服务使用的图片域名（如 `lain.bgm.tv`、`s4.anilist.co`、`api.trace.moe`、`pbs.twimg.com`） | 在卡片中展示 |

扩展**不会**读取你的 X 账号、时间线内容、私信、Cookie 或浏览记录，也不会把推文链接发送给任何服务。

### 存储哪些数据

收藏（作品名、集数、时间点、封面、来源推文链接、你的备注）和设置（API Key、Token、最低相似度、AnimeTrace 开关）**只保存在本机** `chrome.storage.local`，从不上传。可在收藏集页导出、导入或删除；卸载扩展即全部清除。

### 第三方服务

对上述服务的请求受其各自隐私政策约束：[trace.moe](https://trace.moe)、[AnimeTrace](https://www.animetrace.com)、[Bangumi](https://bgm.tv)、[AniList](https://anilist.co)。

### 数据出售与用途

开发者不收集、不出售、不转让用户数据，也不将其用于与扩展单一用途（在 X 上识别动漫出处）无关的任何目的。

### 联系

如有疑问，请在 <https://github.com/CastleYu/XAnimeLens/issues> 提交 issue。
