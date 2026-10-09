# XAnimeLens Design

**English** | [简体中文](DESIGN.zh-CN.md)

A Chrome MV3 extension. It injects a **Recognize** button into videos and tweet images on X (x.com / twitter.com), captures the current frame or fetches the original image, queries trace.moe and AnimeTrace in parallel, enriches results via the Bangumi API (Chinese title, rating, format, genres, links) and shows them in a floating card. Results can be saved locally (`chrome.storage.local`), exported as JSON / CSV and imported from JSON.

## Stack

- TypeScript (strict), bundled with esbuild (`npm run build` → `dist/`, loadable as an unpacked extension).
- vitest unit tests (`npm test`), `tsc --noEmit` type check (`npm run check`), Playwright end-to-end (`npm run e2e`).
- Zero runtime dependencies.

## Conventions

- Every string key, URL, message type, storage key, DOM selector and UI string lives in `src/shared/consts.ts`, grouped by class. New constants are **append-only**; never rename existing ones.
- A file contains either only classes or only functions; helpers go into static classes.
- Short function and variable names.
- Shared types live in `src/shared/types.ts` (also append-only).

## Layout

```
src/shared/consts.ts      constants, grouped by class
src/shared/types.ts       shared types
src/shared/err.ts         class AppErr (carries an ErrCode)
src/api/tracemoe.ts       class TraceMoe: scene search, quota
src/api/animetrace.ts     class AnimeTrace: character recognition, grouping by work
src/api/bangumi.ts        class Bangumi: subject / character search and details
src/core/match.ts         class Matcher: score AniList entries against Bangumi subjects
src/core/recognize.ts     class Recognizer: multi-source recognition and merging
src/core/chars.ts         class Chars: AnimeTrace character name → Bangumi character
src/core/meta.ts          class Metas: merge AniList and Bangumi metadata
src/core/backfill.ts      class Backfill: fill missing covers / tags of old favorites
src/core/store.ts         class Store: favorites and settings
src/core/csv.ts           class Csv: CSV export
src/background/main.ts    service worker: message routing, streaming recognition, screenshots,
                          image → dataURL, re-injection after updates
src/background/img.ts     class Img: remote image / Blob → dataURL
src/content/main.ts       X page entry point
src/content/inject.ts     class Inject: find videos/images, inject buttons, run recognition
src/content/capture.ts    class Capture: frame capture
src/content/card.ts       class Card: floating card in Shadow DOM
src/content/card.css      card styles (imported as text by esbuild)
src/content/msg.ts        class Bus: runtime messages and the streaming port
src/pages/collection.*    collection page (list, search, notes, import/export, settings)
test/*.test.ts            unit tests
test/e2e/                 end-to-end test and fixtures
```

## Module contracts

### api/tracemoe.ts

```ts
class TraceMoe {
  /** POST the image to Api.TM_SEARCH?anilistInfo&cutBorders; adds Api.TM_KEY_HEADER when a key is set */
  static async search(img: Blob, key: string): Promise<TmResp>
}
```
- HTTP 402/429 → `AppErr(ErrCode.QUOTA)`; any other non-2xx or non-empty `resp.error` → `ErrCode.NETWORK`.
- Quota is read from `Api.TM_ME` and shown in the card header.

### api/animetrace.ts

```ts
class AnimeTrace {
  static async search(img: Blob): Promise<AtResp>
  static group(r: AtResp): AtWork[]   // group per-character results by work
}
```
- Status codes are in `AtDef`: `OK` counts as success, `QUOTA` maps to a quota error.

### api/bangumi.ts

```ts
class Bangumi {
  static async search(keyword: string, token: string): Promise<BgmSubject[]>  // POST /v0/search/subjects, type = anime
  static async subject(id: number, token: string): Promise<BgmSubject>
}
```
- Sends `Authorization: Bearer <token>` when a token is set. Also exposes subject character lists and character search for `Chars`.

### core/match.ts

trace.moe returns AniList entries, and Bangumi has no AniList ID mapping, so subjects are found by name search and then scored. **Observed in practice: searching Bangumi for the Japanese title of *Is the Order a Rabbit??* (season 2) returns season 1 first**, so the first hit cannot be trusted.

```ts
class Matcher {
  static keywords(a: TmAnilist): string[]          // de-duplicated queries: native > chinese > romaji > english
  static score(a: TmAnilist, s: BgmSubject): number
  static pick(a: TmAnilist, list: BgmSubject[]): BgmSubject | null  // best score if >= threshold, else null
}
```
Scoring (constants in `Score`):
- Exact name match (after NFKC, stripping spaces and punctuation, lower-casing): `s.name` vs native / romaji / english / synonyms, `s.name_cn` vs chinese / synonyms_chinese → +50.
- Substring match → +15.
- Air date: same year and month +40, same year only +15, ≥ 2 years apart −30.
- Threshold 40.

### core/recognize.ts

```ts
class Recognizer {
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult>
}
```
- trace.moe: keep `similarity >= cfg.minSim`, de-duplicate by AniList ID, take the top `Def.TOP_N`. If none pass, keep the single best one and let the card flag it as low similarity. For each, search Bangumi with `Matcher.keywords` until `Matcher.pick` hits, then load `subject(id)` for details.
- AnimeTrace (when `cfg.at` is true): group by work and look each up on Bangumi. A work is merged into a trace.moe result when the titles match or both resolve to the same Bangumi subject ("sources agree"); otherwise it becomes its own entry ("character match", `hit` is null).
- A failing source never blocks the others; a Bangumi failure yields `bgm: null`.

### core/store.ts / core/csv.ts

```ts
class Store {
  static async list(): Promise<Fav[]>                       // newest savedAt first
  static async add(f: Fav): Promise<void>                   // upsert by key
  static async del(key: string): Promise<void>
  static async has(key: string): Promise<boolean>
  static async note(key: string, note: string): Promise<void>
  static async cfg(): Promise<Cfg>                          // fills defaults
  static async setCfg(c: Partial<Cfg>): Promise<void>
  static dump(items: Fav[]): FavExport
  static parse(text: string): Fav[]                         // validates; throws AppErr(ErrCode.BAD_IMPORT)
  static async merge(items: Fav[]): Promise<number>         // import-merge, returns number added
  static toFav(r: Recog, tweetUrl: string): Fav
}
class Csv {
  static of(items: Fav[]): string   // with BOM, escaped fields
}
```
- Favorite key: the AniList ID when available, otherwise prefixed with `FavKey.BGM` / `FavKey.WORK`.

### background/main.ts

- `chrome.runtime.onMessage` routes by `Msg` and always answers with `Res<T>`.
- Recognition runs over a port (`PortDef.RECOG`): `PortMsg.PART` is pushed as each source returns, `PortMsg.DONE` when all are done, `PortMsg.ERR` on failure. Covers (Bangumi first, AniList fallback) and matched frames are converted to dataURLs before being sent.
- `CAPTURE`: full-tab screenshot via `chrome.tabs.captureVisibleTab`.
- `CLIP` / `PIC` / `CHAR`: download trace.moe preview clips, cross-origin images and character avatars in the background (X's CSP only allows data: / blob: media).
- `FAV_*` / `CFG_GET`: forwarded to Store. `OPEN_COLLECTION` / `OPEN_SETTINGS` and the toolbar icon open `collection.html`.
- On install / update, `content.js` is re-injected into open X tabs; old instances step aside via `Dom.OWNER_ATTR`, and their stale buttons are replaced by `Dom.INST_ATTR`.

### content/*

- A `MutationObserver` watches `Dom.VIDEO_SEL` and `Dom.PHOTO_SEL` and injects one floating button per player / image (`Dom.MARK_ATTR` prevents duplicates). Images use a `ResizeObserver`; below `PHOTO_MIN_W × PHOTO_MIN_H` no button is shown.
- The button swallows `Dom.GUARD_EVTS` pointer events, so clicking never toggles playback or opens the photo.
- Video → `Capture.frame(video)`:
  0. While buffering, wait for the first frame (`Def.READY_MS`).
  1. canvas `drawImage(video)` → `toBlob` (scaled to `Def.MAX_EDGE`).
  2. Tainted or unloaded direct-URL video: reload the same URL with `crossOrigin` and capture; if still unloaded, use `video.poster`.
  3. Otherwise: hide button and card → `CAPTURE` full-tab screenshot → crop by `getBoundingClientRect() × devicePixelRatio`.
- Image → rewrite the `name` parameter of `pbs.twimg.com` to get the large version; if reading it in-page fails due to CORS, fetch it through `PIC` in the background.
- Tweet URL: walk up to `Dom.TWEET_SEL`, take the `a[href*="/status/"]` wrapping its `time`, fall back to `location.href`.
- Card: Shadow DOM, fixed bottom-right, draggable and closable; states are loading, streaming results and error (with retry). Each entry shows cover, Chinese / original title, format, season, episodes, timestamp, similarity, Bangumi rating, genre tags, staff, characters, a favorite button and a comparison panel (input frame vs matched clip; the clip pauses when collapsed).

### pages/collection.*

- Grid: cover, title, episode and timestamp, similarity, sources and characters, saved time, source tweet, Bangumi link, note (saved on blur), delete.
- Search filter; export JSON, export CSV, import JSON (merge).
- On open, `Backfill` fills in missing covers and tags of older favorites.
- Settings: trace.moe API key, minimum similarity, Bangumi token, AnimeTrace toggle; opening with `#settings` expands them.

## Data flow

```
[X video / image] --button--> content: Capture.frame / original image --dataURL--> background (port)
   -> TraceMoe.search  ┐
   -> AnimeTrace.search┘-> Matcher / Bangumi / Chars -> merge -> images to dataURL
   --PART / DONE--> content: Card.render (incremental)
Card favorite --FAV_ADD--> background: Store.add (chrome.storage.local)
collection.html calls Store directly (it is an extension page)
```
