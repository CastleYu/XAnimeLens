# XAnimeLens 设计

[English](DESIGN.md) | **简体中文**

Chrome MV3 扩展。在 X（x.com / twitter.com）的视频与推文图片上注入「识别」按钮，截取当前帧或取原图，并行调用 trace.moe 与 AnimeTrace 识别，再用 Bangumi API 补全中文名、评分、形式、类型和条目链接，结果以浮动卡片展示。识别结果可收藏到本地（`chrome.storage.local`），并支持导出 JSON / CSV、导入 JSON。

## 技术栈

- TypeScript（strict），esbuild 打包（`npm run build` → `dist/`，直接作为未打包扩展加载）。
- vitest 单元测试（`npm test`），`tsc --noEmit` 类型检查（`npm run check`），Playwright 端到端（`npm run e2e`）。
- 不引入任何运行时依赖。

## 编码规范

- 所有字符串键值、URL、消息类型、存储键、DOM 选择器、界面文案都放在 `src/shared/consts.ts`，按类分组；新增常量**只追加**，不改已有名字。
- 一个文件要么全是类，要么全是函数；工具函数放静态类。
- 函数名、变量名简洁。
- 共享类型在 `src/shared/types.ts`，同样只追加。

## 目录

```
src/shared/consts.ts      常量（按类分组）
src/shared/types.ts       共享类型
src/shared/err.ts         class AppErr（带 ErrCode）
src/api/tracemoe.ts       class TraceMoe：画面检索、额度查询
src/api/animetrace.ts     class AnimeTrace：角色识别、按作品分组
src/api/bangumi.ts        class Bangumi：条目 / 角色搜索与详情
src/core/match.ts         class Matcher：AniList 条目 → Bangumi 条目打分匹配
src/core/recognize.ts     class Recognizer：多来源识别与合并
src/core/chars.ts         class Chars：AnimeTrace 角色名 → Bangumi 角色
src/core/meta.ts          class Metas：合并 AniList 与 Bangumi 的作品信息
src/core/backfill.ts      class Backfill：旧收藏补全封面与标签
src/core/store.ts         class Store：收藏与设置
src/core/csv.ts           class Csv：导出 CSV
src/background/main.ts    service worker：消息路由、长连接识别、截屏、图片转 dataURL、升级后重新注入
src/background/img.ts     class Img：远程图片 / Blob → dataURL
src/content/main.ts       X 页面入口
src/content/inject.ts     class Inject：发现视频与图片、注入按钮、调度识别
src/content/capture.ts    class Capture：截帧
src/content/card.ts       class Card：Shadow DOM 浮动卡片
src/content/card.css      卡片样式（esbuild 以文本导入）
src/content/msg.ts        class Bus：runtime 消息与增量识别长连接
src/pages/collection.*    收藏集页面（列表、搜索、备注、导入导出、设置）
test/*.test.ts            单元测试
test/e2e/                 端到端测试与测试素材
```

## 模块契约

### api/tracemoe.ts

```ts
class TraceMoe {
  /** POST 图片到 Api.TM_SEARCH?anilistInfo&cutBorders；有 key 时加 Api.TM_KEY_HEADER */
  static async search(img: Blob, key: string): Promise<TmResp>
}
```
- HTTP 402/429 → `AppErr(ErrCode.QUOTA)`；其它非 2xx 或 `resp.error` 非空 → `ErrCode.NETWORK`。
- 额度经 `Api.TM_ME` 查询，卡片顶部展示。

### api/animetrace.ts

```ts
class AnimeTrace {
  static async search(img: Blob): Promise<AtResp>
  static group(r: AtResp): AtWork[]   // 把逐角色结果按作品分组
}
```
- 状态码见 `AtDef`：`OK` 视为成功，`QUOTA` 映射为额度错误。

### api/bangumi.ts

```ts
class Bangumi {
  static async search(keyword: string, token: string): Promise<BgmSubject[]>  // POST /v0/search/subjects，type=动画
  static async subject(id: number, token: string): Promise<BgmSubject>
}
```
- 有 token 时带 `Authorization: Bearer <token>`。还提供作品角色列表与角色搜索，供 `Chars` 使用。

### core/match.ts

trace.moe 返回 AniList 条目，Bangumi 没有 AniList ID 映射，只能按名字搜索后打分挑选。**实测：用《请问您今天要来点兔子吗？？》（第二季）的日文名搜索，Bangumi 第一条返回的是第一季**，所以不能直接取第一条。

```ts
class Matcher {
  static keywords(a: TmAnilist): string[]          // 去重后的搜索词：native > chinese > romaji > english
  static score(a: TmAnilist, s: BgmSubject): number
  static pick(a: TmAnilist, list: BgmSubject[]): BgmSubject | null  // 最高分且 >= 阈值，否则 null
}
```
打分规则（常量在 `Score`）：
- 名字完全相等（NFKC、去空格和标点、小写后比较）：`s.name` 对 native / romaji / english / synonyms，`s.name_cn` 对 chinese / synonyms_chinese → +50。
- 包含关系 → +15。
- 开播年月：年月相同 +40，仅年相同 +15，年份差 ≥ 2 −30。
- 阈值 40。

### core/recognize.ts

```ts
class Recognizer {
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult>
}
```
- trace.moe：过滤 `similarity >= cfg.minSim`，按 AniList ID 去重，取前 `Def.TOP_N` 条；都低于阈值时保留最高的 1 条，由卡片提示「相似度低」。每条依次用 `Matcher.keywords` 搜 Bangumi，直到 `Matcher.pick` 命中，再取 `subject(id)` 补全详情。
- AnimeTrace（`cfg.at` 为真时）：按作品分组后到 Bangumi 搜索条目；与 trace.moe 结果作品名相同或指向同一 Bangumi 条目时合并（多源一致），否则单独成条（角色识别，`hit` 为空）。
- 任一来源失败不影响其它来源；Bangumi 失败时 `bgm: null`。

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
- 收藏主键：有 AniList ID 时用它，否则用 `FavKey.BGM` / `FavKey.WORK` 前缀。

### background/main.ts

- `chrome.runtime.onMessage` 按 `Msg` 路由，统一返回 `Res<T>`。
- 识别走长连接（`PortDef.RECOG`）：每个来源返回即推送 `PortMsg.PART`，全部完成推送 `PortMsg.DONE`，失败推送 `PortMsg.ERR`。封面（bgm 优先，退回 AniList）与匹配帧转成 dataURL 后下发。
- `CAPTURE`：`chrome.tabs.captureVisibleTab` 整页截图。
- `CLIP` / `PIC` / `CHAR`：后台下载 trace.moe 预览片段、跨域图片和角色头像（X 页面的 CSP 只允许 data: / blob: 媒体）。
- `FAV_*` / `CFG_GET`：转发给 Store。`OPEN_COLLECTION` / `OPEN_SETTINGS` 与点击扩展图标：打开 `collection.html`。
- 安装或更新后，向已打开的 X 标签页重新注入 `content.js`；旧实例通过 `Dom.OWNER_ATTR` 让位，失效按钮按 `Dom.INST_ATTR` 替换。

### content/*

- `MutationObserver` 监听 `Dom.VIDEO_SEL` 与 `Dom.PHOTO_SEL`，给每个播放器 / 图片注入悬浮按钮（`Dom.MARK_ATTR` 防重复）。图片用 `ResizeObserver` 判断显示尺寸，小于 `PHOTO_MIN_W × PHOTO_MIN_H` 时不显示。
- 按钮拦截 `Dom.GUARD_EVTS` 指针事件，点击不会让播放器切换播放 / 暂停，也不会触发图片跳转。
- 视频 → `Capture.frame(video)`：
  0. 缓冲中先等待首帧（`Def.READY_MS`）。
  1. canvas `drawImage(video)` → `toBlob`（缩放到 `Def.MAX_EDGE`）。
  2. 直链视频污染 canvas 或未加载：`crossOrigin` 重新加载同一地址截帧；仍未加载则用 `video.poster`。
  3. 都失败：隐藏按钮和卡片 → `CAPTURE` 整页截图 → 按 `getBoundingClientRect() × devicePixelRatio` 裁剪。
- 图片 → 改写 `pbs.twimg.com` 的 `name` 参数取大图；页面内跨域读取失败时经 `PIC` 由后台下载。
- 推文链接：向上找 `Dom.TWEET_SEL`，取其中 `time` 的父级 `a[href*="/status/"]`，退回 `location.href`。
- 卡片：Shadow DOM，固定在视口右下角，可拖动、可关闭；状态包括加载中、增量结果、错误（可重试）。每条结果显示封面、中文名 / 原名、形式、季度、集数、时间点、相似度、Bangumi 评分、类型标签、制作信息、角色，以及收藏按钮与对比面板（输入帧 vs 匹配片段，收起时暂停片段）。

### pages/collection.*

- 网格列表：封面、标题、集数和时间点、相似度、来源与角色、收藏时间、来源推文、Bangumi 链接、备注（失焦保存）、删除。
- 搜索过滤；导出 JSON、导出 CSV、导入 JSON（合并）。
- 打开时用 `Backfill` 为旧收藏补全缺失的封面与标签。
- 设置区：trace.moe API Key、最低相似度、Bangumi Token、AnimeTrace 开关；`#settings` 打开时自动展开。

## 数据流

```
[X 视频 / 图片] --按钮--> content: Capture.frame / 取原图 --dataURL--> background（长连接）
   -> TraceMoe.search ┐
   -> AnimeTrace.search┘-> Matcher / Bangumi / Chars -> 合并 -> 图片转 dataURL
   --PART / DONE--> content: Card.render（增量重绘）
Card 收藏 --FAV_ADD--> background: Store.add（chrome.storage.local）
collection.html 直接调用 Store（同为扩展页面）
```
