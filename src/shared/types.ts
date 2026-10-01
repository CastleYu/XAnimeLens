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
  infobox?: unknown;
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
  | { type: Msg.OPEN_COLLECTION };

export type Res<T> = { ok: true; data: T } | { ok: false; err: Err };

/** 卡片展示用：background 把远程图片转 dataURL（X 的 CSP 禁止外链图片） */
export interface CardItem {
  recog: Recog;
  cover: string; // dataURL 或空串
  shot: string; // trace.moe 截图 dataURL 或空串
  fav: boolean;
}
