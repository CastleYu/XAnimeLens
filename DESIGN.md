# XAnimeLens 设计

Chrome MV3 扩展。在 X（x.com / twitter.com）的视频上注入“识别”按钮，截取当前帧，调用 trace.moe 识别，再用 Bangumi API 补全中文名、评分和条目链接，结果以浮动卡片展示。识别结果可收藏到本地（`chrome.storage.local`），并支持导出 JSON / CSV、导入 JSON。

## 技术栈

- TypeScript（strict），esbuild 打包（`npm run build` → `dist/`，直接作为未打包扩展加载）。
- vitest 单元测试（`npm test`），`tsc --noEmit` 类型检查（`npm run check`）。
- 不引入任何运行时依赖。

## 编码规范（所有执行者必须遵守）

- 所有字符串键值、URL、消息类型、存储键、DOM 选择器都放在 `src/shared/consts.ts`，按类分组；需要新增常量时**只追加**，不改已有名字。
- 一个文件要么全是类，要么全是函数。工具函数放静态类。
- 函数名、变量名简洁。
- 共享类型在 `src/shared/types.ts`，同样只追加。

## 目录与模块契约

```
src/shared/consts.ts      常量（已完成）
src/shared/types.ts       类型（已完成）
src/api/tracemoe.ts       class TraceMoe
src/api/bangumi.ts        class Bangumi
src/core/match.ts         class Matcher
src/core/recognize.ts     class Recognizer
src/core/store.ts         class Store
src/core/csv.ts           class Csv
src/background/main.ts    service worker：消息路由、截屏、图片转 dataURL
src/content/main.ts       X 页面：发现视频、注入按钮、调度识别
src/content/capture.ts    class Capture：截帧（canvas，失败则整页截屏后裁剪）
src/content/card.ts       class Card：Shadow DOM 浮动卡片
src/content/card.css      卡片样式（esbuild 以文本导入）
src/pages/collection.*    收藏集页面（列表、删除、备注、导入导出、设置）
test/*.test.ts            单元测试
```

### api/tracemoe.ts

```ts
class TraceMoe {
  /** POST 图片二进制到 Api.TM_SEARCH?anilistInfo&cutBorders；有 key 时加 Api.TM_KEY_HEADER */
  static async search(img: Blob, key: string): Promise<TmResp>
}
```
- HTTP 402/429 → 抛出 `{code: ErrCode.QUOTA}`；其它非 2xx 或 `resp.error` 非空 → `ErrCode.NETWORK`。错误统一用 `class AppErr extends Error { code: ErrCode }`（放在 `src/shared/err.ts`）。

### api/bangumi.ts

```ts
class Bangumi {
  static async search(keyword: string, token: string): Promise<BgmSubject[]>  // POST v0/search/subjects?limit=Api.BGM_LIMIT, filter.type=[2]
  static async subject(id: number, token: string): Promise<BgmSubject>
}
```
- 有 token 时带 `Authorization: Bearer <token>`。

### core/match.ts

trace.moe 返回 AniList 条目，Bangumi 没有 AniList ID 映射，只能按名字搜索后打分挑选。**实测：用《请问您今天要来点兔子吗？？》（第二季）的日文名搜索，Bangumi 第一条返回的是第一季**，所以不能直接取第一条。

```ts
class Matcher {
  static keywords(a: TmAnilist): string[]          // 去重后的搜索词，优先级：native > chinese > romaji > english
  static score(a: TmAnilist, s: BgmSubject): number
  static pick(a: TmAnilist, list: BgmSubject[]): BgmSubject | null  // 最高分且 >= 阈值，否则 null
}
```
打分规则（可调，需写在常量里）：
- 名字完全相等（归一化后：NFKC、去空格和标点、小写）：`s.name` 对 native/romaji/english/synonyms，`s.name_cn` 对 chinese/synonyms_chinese（繁简不转换，只比原文）→ +50。
- 包含关系 → +15。
- 开播年月：`s.date` 与 `startDate` 年月相同 +40，仅年相同 +15，年份差 ≥2 −30。
- 阈值 40。

### core/recognize.ts

```ts
class Recognizer {
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult>
}
```
- 调 trace.moe；过滤 `similarity >= cfg.minSim`，按 AniList ID 去重，取前 `Def.TOP_N` 条；都低于阈值时保留最高的 1 条，由卡片提示“相似度低”。
- 对每条：依次用 `Matcher.keywords` 搜索 Bangumi，直到 `Matcher.pick` 命中；命中后取 `subject(id)` 补全详情。Bangumi 失败不影响 trace.moe 结果（`bgm: null`）。

### core/store.ts / core/csv.ts

```ts
class Store {
  static async list(): Promise<Fav[]>                       // 按 savedAt 倒序
  static async add(f: Fav): Promise<void>                   // 按 key 覆盖
  static async del(key: string): Promise<void>
  static async has(key: string): Promise<boolean>
  static async note(key: string, note: string): Promise<void>
  static async cfg(): Promise<Cfg>                          // 缺省值补全
  static async setCfg(c: Partial<Cfg>): Promise<void>
  static dump(items: Fav[]): FavExport
  static parse(text: string): Fav[]                         // 校验；非法抛 AppErr(ErrCode.BAD_IMPORT)
  static async merge(items: Fav[]): Promise<number>         // 导入合并，返回新增条数
  static toFav(r: Recog, tweetUrl: string): Fav
}
class Csv {
  static of(items: Fav[]): string   // 带 BOM，字段转义
}
```

### background/main.ts

- `chrome.runtime.onMessage` 按 `Msg` 路由，统一返回 `Res<T>`。
- `RECOGNIZE`：dataURL → Blob → `Recognizer.run` → 为每条结果拉取封面（bgm.images.common，退回 anilist.coverImage.large）和 `hit.image`，转成 dataURL，返回 `CardItem[]`（附带 `fav` 状态）。
- `CAPTURE`：`chrome.tabs.captureVisibleTab(sender.tab.windowId, {format:'jpeg', quality:90})`。
- `FAV_*` / `CFG_GET`：转发给 Store。
- `OPEN_COLLECTION` 与点击扩展图标：打开 `collection.html`。

### content/*

- `MutationObserver` 监听 `Dom.VIDEO_SEL`，给每个播放器注入一个悬浮按钮（`Dom.MARK_ATTR` 防重复）。按钮放在播放器右上角，不遮挡 X 自己的控件。
- 点击后：暂停视频 → `Capture.frame(video)`：
  1. 优先 canvas `drawImage(video)` → `toBlob`（缩放到 `Def.MAX_EDGE`）。
  2. 抛 SecurityError（跨域污染）时：隐藏按钮和卡片 → 发 `CAPTURE` 拿整页截图 → 按 `video.getBoundingClientRect() * devicePixelRatio` 裁剪。
- 推文链接：向上找 `Dom.TWEET_SEL`，取其中 `time` 的父级 `a[href*="/status/"]`，退回 `location.href`。
- 卡片：Shadow DOM，固定在视口右下角，可拖动、可关闭；状态包括加载中、结果列表、错误。每条结果显示封面、中文名 / 日文名、集数、时间点 `mm:ss`、相似度百分比、Bangumi 评分、链接（bgm.tv 条目、trace.moe 预览视频、AniList），以及收藏 / 取消收藏按钮。底部有“打开收藏集”入口。

### pages/collection.*

- 网格列表：封面、标题、集数和时间点、相似度、收藏时间、来源推文链接、bgm 链接、备注（可编辑，失焦保存）、删除。
- 支持搜索过滤。
- 导出 JSON、导出 CSV、导入 JSON（合并）。
- 设置区：trace.moe API Key、最低相似度、Bangumi Token。

## 数据流

```
[X video] --button--> content: Capture.frame --dataURL--> background: Recognizer.run
   -> TraceMoe.search -> Matcher/Bangumi -> 图片转 dataURL -> CardItem[] --> content: Card.render
Card 收藏 --FAV_ADD--> background: Store.add (chrome.storage.local)
collection.html 直接调用 Store（同为扩展页面）
```
