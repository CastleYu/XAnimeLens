import type { ErrCode, Msg } from './consts';

/** trace.moe 原始结果（只列用到的字段） */
export interface TmTitle {
  native?: string | null;
  romaji?: string | null;
  english?: string | null;
  chinese?: string | null;
}

export interface TmDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface TmAnilist {
  id: number;
  idMal?: number | null;
  title: TmTitle;
  synonyms?: string[];
  synonyms_chinese?: string[];
  startDate?: TmDate;
  episodes?: number | null;
  format?: string | null;
  genres?: string[];
  season?: string | null;
  seasonYear?: number | null;
  source?: string | null;
  duration?: number | null;
  studios?: { edges?: { isMain: boolean; node: { name: string } }[] } | null;
  isAdult: boolean;
  coverImage?: { large?: string; medium?: string } | null;
  siteUrl?: string;
}

export interface TmHit {
  anilist: TmAnilist;
  filename: string;
  episode: number | string | null;
  from: number;
  at?: number;
  to: number;
  similarity: number;
  video: string;
  image: string;
}

export interface TmResp {
  error: string;
  result: TmHit[];
  quota?: number;
  quotaUsed?: number;
}

/** Bangumi 条目（只列用到的字段） */
export interface BgmImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface BgmSubject {
  id: number;
  name: string;
  name_cn: string;
  date?: string | null;
  eps?: number;
  summary?: string;
  images?: BgmImages | null;
  rating?: { score?: number; rank?: number; total?: number } | null;
  platform?: string;
  meta_tags?: string[];
  tags?: { name: string; count: number }[];
  total_episodes?: number;
  infobox?: BgmInfo[];
}

export interface BgmInfo {
  key: string;
  value: string | { k?: string; v: string }[];
}

/** 合并 AniList 与 Bangumi 后的作品信息（展示用，字段均已本地化） */
export interface Meta {
  kind: string; // TV动画 / 剧场版 / OVA …
  air: string; // 2015年秋 / 2015年10月
  eps: string; // 共12集 · 每集23分钟
  src: string; // 漫画改 / 原创 …
  adult: boolean;
  genres: string[]; // 日常、百合 …
  studio: string; // WHITE FOX / Kinema Citrus
  staff: string; // 导演：xxx
}

/** 一条识别结果：trace.moe 命中 + 匹配到的 Bangumi 条目 */
export interface Recog {
  hit: TmHit;
  bgm: BgmSubject | null;
}

export interface RecogResult {
  items: Recog[];
  quota?: number;
  quotaUsed?: number;
}

/** 收藏集条目 */
export interface Fav {
  key: string; // `${anilistId}`，去重主键
  anilistId: number;
  bgmId: number | null;
  title: string; // 展示用主标题（name_cn > chinese > native > romaji）
  native: string;
  cover: string; // 远程 URL
  episode: string; // 统一转字符串
  at: number; // 秒
  similarity: number;
  tweetUrl: string;
  savedAt: string; // ISO
  note: string;
  kind: string; // 作品形式，旧数据为空串
  genres: string[]; // 类型标签，旧数据为空数组
}

export interface FavExport {
  app: 'xanimelens';
  version: number;
  exportedAt: string;
  items: Fav[];
}

export interface Cfg {
  tmKey: string;
  minSim: number;
  bgmToken: string;
}

export interface Err {
  code: ErrCode;
  msg: string;
}

/** runtime 消息 */
export type Req =
  | { type: Msg.RECOGNIZE; img: string } // dataURL
  | { type: Msg.CAPTURE } // 返回整个可见标签页 dataURL
  | { type: Msg.FAV_ADD; fav: Fav }
  | { type: Msg.FAV_DEL; key: string }
  | { type: Msg.FAV_HAS; key: string }
  | { type: Msg.FAV_LIST }
  | { type: Msg.CFG_GET }
  | { type: Msg.OPEN_COLLECTION }
  | { type: Msg.CLIP; url: string }; // 返回 trace.moe 片段 dataURL

export type Res<T> = { ok: true; data: T } | { ok: false; err: Err };

/** 卡片展示用：background 把远程图片转 dataURL（X 的 CSP 禁止外链图片） */
export interface CardItem {
  recog: Recog;
  cover: string; // dataURL 或空串
  shot: string; // trace.moe 截图 dataURL 或空串
  fav: boolean;
}

/** background RECOGNIZE 的返回数据 */
export interface CardData {
  items: CardItem[];
  quota?: number;
  quotaUsed?: number;
}
