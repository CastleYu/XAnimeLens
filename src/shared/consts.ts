/** 全局常量：所有键值集中于此，按类分组。 */

export class Api {
  static readonly TM_SEARCH = 'https://api.trace.moe/search';
  static readonly TM_ME = 'https://api.trace.moe/me';
  static readonly TM_KEY_HEADER = 'x-trace-key';
  static readonly BGM_BASE = 'https://api.bgm.tv';
  static readonly BGM_SEARCH = '/v0/search/subjects';
  static readonly BGM_SUBJECT = '/v0/subjects/';
  static readonly BGM_SITE = 'https://bgm.tv/subject/';
  static readonly BGM_ANIME_TYPE = 2;
  static readonly BGM_LIMIT = 10;
  static readonly UA = 'xanimelens/0.1 (https://github.com/)';
}

export class TmParam {
  static readonly ANILIST = 'anilistInfo';
  static readonly CUT = 'cutBorders';
}

/** runtime 消息类型 */
export enum Msg {
  RECOGNIZE = 'recognize',
  CAPTURE = 'capture',
  FAV_ADD = 'favAdd',
  FAV_DEL = 'favDel',
  FAV_HAS = 'favHas',
  FAV_LIST = 'favList',
  CFG_GET = 'cfgGet',
  OPEN_COLLECTION = 'openCollection',
}

/** chrome.storage.local 键 */
export class Key {
  static readonly FAVS = 'favs';
  static readonly CFG = 'cfg';
}

export class Def {
  static readonly MIN_SIM = 0.87;
  static readonly TOP_N = 3;
  static readonly JPEG_Q = 0.9;
  static readonly MAX_EDGE = 1280;
}

export enum ErrCode {
  NO_VIDEO = 'noVideo',
  CAPTURE = 'capture',
  NETWORK = 'network',
  QUOTA = 'quota',
  NOT_FOUND = 'notFound',
  BAD_IMPORT = 'badImport',
}

/** 注入 X 页面的 DOM 标识 */
export class Dom {
  static readonly HOST_ID = 'xal-host';
  static readonly BTN_CLASS = 'xal-btn';
  static readonly MARK_ATTR = 'data-xal';
  static readonly VIDEO_SEL = 'div[data-testid="videoPlayer"]';
  static readonly TWEET_SEL = 'article[data-testid="tweet"]';
  static readonly STATUS_LINK_SEL = 'a[href*="/status/"]';
}

export class Page {
  static readonly COLLECTION = 'collection.html';
}

export class Export {
  static readonly JSON_NAME = 'xanimelens-favs.json';
  static readonly CSV_NAME = 'xanimelens-favs.csv';
  static readonly JSON_MIME = 'application/json';
  static readonly CSV_MIME = 'text/csv;charset=utf-8';
  static readonly VERSION = 1;
}

/** Matcher 打分 */
export class Score {
  static readonly NAME_EQ = 50;
  static readonly NAME_IN = 15;
  static readonly YM_EQ = 40;
  static readonly Y_EQ = 15;
  static readonly Y_FAR = -30;
  static readonly FAR_YEARS = 2;
  static readonly MIN = 40;
}
