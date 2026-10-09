# XAnimeLens

**English** | [简体中文](README.zh-CN.md)

A Chrome extension that tells you which anime a video or image on X (x.com) comes from. Click **识别 (Recognize)** on any video or tweet image; the extension queries two independent recognition services in parallel, enriches the result with [Bangumi](https://bgm.tv) metadata (Chinese title, rating, format, genres, staff), and shows everything in a floating card. Results can be saved to a local collection and exported.

| Source | Method | Provides |
|---|---|---|
| [trace.moe](https://trace.moe) | Frame search against an anime scene database | Title, episode, timestamp, similarity, matching clip |
| [AnimeTrace](https://www.animetrace.com) | Character recognition (independent model) | Title (series level), character names |

- **Fastest result first** — whichever source answers first is rendered immediately; the other source shows "识别中…" (recognizing) at the bottom of the card and is merged in when it arrives.
- **Cross-checked** — when both sources point to the same work they are merged and labelled "多源一致" (sources agree); works found only by AnimeTrace get their own entry labelled "角色识别" (character match).
- **Fault tolerant** — one source failing never blocks the other; the card notes the failure. AnimeTrace can be turned off in settings.

> The extension UI is currently in Simplified Chinese. Bangumi metadata is Chinese-first, with AniList as fallback.

## Features

- A recognize button on every X video (top-right corner). The current frame is captured **without pausing playback**; videos that have not started loading are supported too. Tip: click on a frame without subtitles for better accuracy.
- A recognize button on tweet images, including the full-screen viewer. The original full-size image is used, even for cropped timeline thumbnails. Images displayed smaller than 120×90 px get no button.
- The card header shows today's trace.moe quota (used in the last 24 h / daily limit, matching trace.moe's own sponsor page; reflects your API key when one is set).
- From the card: save to collection, open Bangumi / AniList, and expand a side-by-side comparison of your frame and the matched clip.
- **Collection page** (click the toolbar icon or "打开收藏集" on the card): search, notes, delete, export JSON / CSV, import JSON.
- **Settings** (in the collection page): trace.moe API key (higher quota), minimum similarity, Bangumi access token, AnimeTrace on/off.
- **Seamless updates** — after the extension is reloaded, open X tabs receive the new content script automatically; no page refresh needed.

## Install

### From a release

1. Download `XAnimeLens-<version>.zip` from [Releases](https://github.com/CastleYu/XAnimeLens/releases) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

### From source

Requires Node.js 20+.

```bash
npm install
npm run build
```

Then load the `dist/` folder via **Load unpacked** as above.

## Privacy

No accounts, no analytics, no remote server of our own. Captured frames are sent only to trace.moe and AnimeTrace for recognition; titles are looked up on Bangumi; favorites and settings stay in `chrome.storage.local`. See [PRIVACY.md](PRIVACY.md).

## Development

| Command | Purpose |
|---|---|
| `npm run build` / `npm run watch` | Bundle into `dist/` |
| `npm run check` | TypeScript type check |
| `npm test` | Unit tests (vitest) |
| `npm run e2e` | End-to-end: loads the extension into Chromium against a mocked x.com page and calls the real trace.moe and Bangumi APIs (needs network, uses 2 trace.moe quota; run `npx playwright install chromium` first) |

Architecture, module contracts and coding conventions: [docs/DESIGN.md](docs/DESIGN.md).

### Frame capture strategy

0. If the video is buffering, wait up to `Def.READY_MS` for the first frame.
1. `canvas.drawImage(video)` directly — X's MSE videos do not taint the canvas.
2. For direct-URL videos (e.g. GIFs served as mp4) that taint the canvas or are not loaded, reload the same URL with `crossOrigin="anonymous"`, seek to the same time and capture (video.twimg.com sends CORS headers for x.com).
3. If the video has not loaded at all (`preload="none"`, MSE not streaming yet), use the player's poster image.
4. As a last resort, take a screenshot of the visible tab (`captureVisibleTab`) and crop it to the video's bounds.

## Releasing

Bump the version in both `package.json` and `static/manifest.json`, then push to `main`. GitHub Actions ([release.yml](.github/workflows/release.yml)) type-checks, tests, builds and publishes a `v<version>` release with `XAnimeLens-<version>.zip` attached; versions already released are skipped. The workflow can also be run manually from the Actions tab.

## Credits

- [trace.moe](https://trace.moe) by soruly — anime scene search
- [AnimeTrace](https://www.animetrace.com) — anime character recognition
- [Bangumi API](https://bangumi.github.io/api/) — metadata
- [AniList](https://anilist.co) — metadata (via trace.moe)

This project is not affiliated with X Corp., trace.moe, AnimeTrace, Bangumi or AniList. Please respect each service's terms and rate limits.

## License

[MIT](LICENSE)
