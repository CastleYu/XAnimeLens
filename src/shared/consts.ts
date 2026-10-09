/** 全局常量：所有键值集中于此，按类分组。 */

export class Api {
  static readonly TM_SEARCH = 'https://api.trace.moe/search';
  static readonly TM_ME = 'https://api.trace.moe/me';
  static readonly TM_KEY_HEADER = 'x-trace-key';
  static readonly BGM_BASE = 'https://api.bgm.tv';
  static readonly BGM_SEARCH = '/v0/search/subjects';
  static readonly BGM_SUBJECT = '/v0/subjects/';
  static readonly BGM_SITE = 'https://bgm.tv/subject/';
  static readonly BGM_CHARS = '/characters'; // 拼在 /v0/subjects/{id} 之后
  static readonly BGM_CHAR = '/v0/characters/';
  static readonly BGM_CHAR_SEARCH = '/v0/search/characters';
  static readonly BGM_CHAR_SITE = 'https://bgm.tv/character/';
  static readonly BGM_CHAR_LIMIT = 5;
  static readonly BGM_CN_KEY = '简体中文名';
  static readonly BGM_ANIME_TYPE = 2;
  static readonly BGM_LIMIT = 10;
  static readonly UA = 'xanimelens (https://github.com/CastleYu/XAnimeLens)';
  static readonly AT_SEARCH = 'https://api.animetrace.com/v1/search';
}

/** 识别来源 */
export enum Src {
  TM = 'tracemoe',
  AT = 'animetrace',
}

/** AnimeTrace 请求参数与状态码（https://www.animetrace.com/api-docs） */
export class AtDef {
  static readonly FILE = 'file';
  static readonly MULTI = 'is_multi';
  static readonly AI = 'ai_detect';
  static readonly ON = '1';
  static readonly OFF = '0';
  static readonly OK = [0, 17720];
  static readonly QUOTA = [17702, 17728, 17731];
}

/** 收藏主键前缀：无 AniList ID 的条目（仅 AnimeTrace 识别） */
export class FavKey {
  static readonly BGM = 'bgm-';
  static readonly WORK = 'at-';
}

export class TmParam {
  static readonly ANILIST = 'anilistInfo';
  static readonly CUT = 'cutBorders';
}

/** 增量识别使用的长连接（chrome.runtime.connect） */
export class PortDef {
  static readonly RECOG = 'recognize';
}

/** 长连接上 background → content 的消息类型 */
export enum PortMsg {
  PART = 'part', // 部分来源已返回
  DONE = 'done', // 全部来源已返回
  ERR = 'err',
}

/** runtime 消息类型 */
export enum Msg {
  CAPTURE = 'capture',
  FAV_ADD = 'favAdd',
  FAV_DEL = 'favDel',
  FAV_HAS = 'favHas',
  FAV_LIST = 'favList',
  CFG_GET = 'cfgGet',
  OPEN_COLLECTION = 'openCollection',
  OPEN_SETTINGS = 'openSettings',
  CLIP = 'clip',
  CHAR = 'char',
  PIC = 'pic',
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
  static readonly CLONE_MS = 15000;
  /** 视频正在缓冲时等待首帧可用的最长时间 */
  static readonly READY_MS = 3000;
  /** 加载封面图（poster）超时 */
  static readonly POSTER_MS = 8000;
}

export enum ErrCode {
  NO_VIDEO = 'noVideo',
  CAPTURE = 'capture',
  NETWORK = 'network',
  QUOTA = 'quota',
  NOT_FOUND = 'notFound',
  BAD_IMPORT = 'badImport',
  STALE = 'stale', // 扩展已更新/重载，页面里的旧脚本与扩展断开
}

/** 注入 X 页面的 DOM 标识 */
export class Dom {
  static readonly HOST_ID = 'xal-host';
  static readonly BTN_CLASS = 'xal-btn';
  static readonly MARK_ATTR = 'data-xal';
  static readonly VIDEO_SEL = 'div[data-testid="videoPlayer"]';
  /** 推文图片；大图查看器 */
  static readonly PHOTO_SEL = 'div[data-testid="tweetPhoto"], div[data-testid="swipe-to-dismiss"]';
  /** 图片显示区域小于此尺寸（CSS 像素）不显示识别按钮 */
  static readonly PHOTO_MIN_W = 120;
  static readonly PHOTO_MIN_H = 90;
  static readonly PHOTO_IMG_SEL = 'img[src*="pbs.twimg.com/media/"]';
  /** pbs.twimg.com 图片尺寸参数 */
  static readonly PIC_NAME = 'name';
  static readonly PIC_SIZE = 'large';
  static readonly TWEET_SEL = 'article[data-testid="tweet"]';
  static readonly STATUS_LINK_SEL = 'a[href*="/status/"]';
  /** 注入实例标识：扩展更新后新脚本据此替换旧脚本留下的失效按钮 */
  static readonly INST_ATTR = 'data-xal-inst';
  /** 写在 <html> 上：当前接管页面的实例，其余实例自行停止 */
  static readonly OWNER_ATTR = 'data-xal-owner';
  static readonly MATCHES = ['https://x.com/*', 'https://twitter.com/*'];
  /** 识别按钮上拦截的指针事件：避免冒泡到播放器触发暂停/播放切换 */
  static readonly GUARD_EVTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick'];
}

export class Page {
  static readonly COLLECTION = 'collection.html';
  static readonly CONTENT_JS = 'content.js';
  /** 收藏集页面 hash：打开时展开设置并聚焦 API Key */
  static readonly SETTINGS_HASH = '#settings';
}

export class Export {
  static readonly JSON_NAME = 'xanimelens-favs.json';
  static readonly CSV_NAME = 'xanimelens-favs.csv';
  static readonly JSON_MIME = 'application/json';
  static readonly CSV_MIME = 'text/csv;charset=utf-8';
  static readonly VERSION = 1;
}

/** 收藏集页面 DOM 标识 */
export class ColDom {
  static readonly ROOT = 'col';
  static readonly HEAD = 'col-head';
  static readonly TITLE = 'col-title';
  static readonly COUNT = 'col-count';
  static readonly SEARCH = 'col-search';
  static readonly EXPORT_JSON = 'col-export-json';
  static readonly EXPORT_CSV = 'col-export-csv';
  static readonly IMPORT_BTN = 'col-import-btn';
  static readonly IMPORT_FILE = 'col-import-file';
  static readonly SETTINGS = 'col-settings';
  static readonly SET_TMKEY = 'col-tmkey';
  static readonly SET_MINSIM = 'col-minsim';
  static readonly SET_BGMTOKEN = 'col-bgmtoken';
  static readonly SET_SAVE = 'col-save';
  static readonly GRID = 'col-grid';
  static readonly EMPTY = 'col-empty';
  static readonly CARD = 'col-card';
  static readonly COVER = 'col-cover';
  static readonly NAME = 'col-name';
  static readonly NATIVE = 'col-native';
  static readonly EPISODE = 'col-episode';
  static readonly SIM = 'col-sim';
  static readonly TIME = 'col-time';
  static readonly LINKS = 'col-links';
  static readonly TWEET = 'col-tweet';
  static readonly BGM = 'col-bgm';
  static readonly NOTE = 'col-note';
  static readonly DEL = 'col-del';
  static readonly STYLE = 'col-style';
  static readonly TAGS = 'col-tags';
  static readonly KIND = 'col-kind';
  static readonly GENRE = 'col-genre';
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
  static readonly PREFIX_MIN = 4;
}

/** Recognizer 参数 */
export class RecogDef {
  static readonly KW_MAX = 3;
}

/** 识别按钮与浮动卡片的 DOM 类名（结构见 src/content/card.ts） */
export class CardDom {
  static readonly BTN_HOST = 'xal-btn-host';
  static readonly BTN = 'xal-btn';
  static readonly BTN_BUSY = 'xal-busy';
  static readonly ICO = 'xal-ico';
  static readonly CARD = 'xal-card';
  static readonly HEAD = 'xal-head';
  static readonly LOGO = 'xal-logo';
  static readonly QUOTA = 'xal-quota';
  static readonly CLOSE = 'xal-close';
  static readonly BODY = 'xal-body';
  static readonly LOADING = 'xal-loading';
  static readonly SPIN = 'xal-spin';
  static readonly ERR = 'xal-err';
  static readonly ERR_MSG = 'xal-err-msg';
  static readonly RETRY = 'xal-retry';
  static readonly LIST = 'xal-list';
  static readonly ITEM = 'xal-item';
  static readonly LOW = 'xal-low';
  static readonly COVER = 'xal-cover';
  static readonly INFO = 'xal-info';
  static readonly TITLE = 'xal-title';
  static readonly NATIVE = 'xal-native';
  static readonly META = 'xal-meta';
  static readonly EP = 'xal-ep';
  static readonly SIM = 'xal-sim';
  static readonly SCORE = 'xal-score';
  static readonly SHOT = 'xal-shot';
  static readonly LINKS = 'xal-links';
  static readonly LINK = 'xal-link';
  static readonly FAV = 'xal-fav';
  static readonly ON = 'xal-on';
  static readonly FOOT = 'xal-foot';
  static readonly OPEN = 'xal-open';
  static readonly SET = 'xal-set';
  static readonly CMP = 'xal-cmp';
  static readonly CMP_BTN = 'xal-cmp-btn';
  static readonly CMP_COL = 'xal-cmp-col';
  static readonly CMP_CAP = 'xal-cmp-cap';
  static readonly CMP_MEDIA = 'xal-cmp-media';
  static readonly CMP_HINT = 'xal-cmp-hint';
  static readonly TAGS = 'xal-tags';
  static readonly TAG = 'xal-tag';
  static readonly GENRE = 'xal-genre';
  static readonly ADULT = 'xal-adult';
  static readonly SUB = 'xal-sub';
  static readonly SRCS = 'xal-srcs';
  static readonly SRC = 'xal-src';
  static readonly MULTI = 'xal-multi';
  static readonly CHARS = 'xal-chars';
  static readonly NOTE = 'xal-note';
  static readonly MORE = 'xal-more';
  static readonly PENDING = 'xal-pending';
  static readonly CHAR = 'xal-char';
  static readonly CHAR_AV = 'xal-char-av';
  static readonly CHAR_NAME = 'xal-char-name';
  static readonly CHAR_SUB = 'xal-char-sub';
  static readonly CHAR_LOAD = 'xal-char-load';
}

/** 卡片状态（写入 .xal-card 的 data-state） */
export enum CardState {
  LOADING = 'loading',
  OK = 'ok',
  ERR = 'err',
}

/** 错误码 → 中文提示 */
export class ErrText {
  static readonly NO_VIDEO = '未找到可识别的视频或图片';
  static readonly CAPTURE = '截帧失败';
  static readonly NETWORK = '网络请求失败';
  static readonly QUOTA = '识别额度已用完或请求过于频繁';
  static readonly NOT_FOUND = '未识别到结果';
  static readonly BAD_IMPORT = '导入文件无效';
  static readonly UNKNOWN = '识别失败，请重试';
  static readonly NOT_READY = '视频尚未加载';
  static readonly STALE = '扩展已更新，请刷新页面后再试';
  static readonly DETAIL_MAX = 80;
  /** 扩展上下文失效时 Chrome 抛出的错误信息片段 */
  static readonly STALE_HINTS = ['Extension context invalidated', 'Receiving end does not exist'];

  static readonly MAP: Record<string, string> = {
    [ErrCode.NO_VIDEO]: ErrText.NO_VIDEO,
    [ErrCode.CAPTURE]: ErrText.CAPTURE,
    [ErrCode.NETWORK]: ErrText.NETWORK,
    [ErrCode.QUOTA]: ErrText.QUOTA,
    [ErrCode.NOT_FOUND]: ErrText.NOT_FOUND,
    [ErrCode.BAD_IMPORT]: ErrText.BAD_IMPORT,
    [ErrCode.STALE]: ErrText.STALE,
  };

  /** 从任意异常提取中文提示（不依赖 AppErr，避免循环引用） */
  static of(e: unknown): string {
    const code = (e as { code?: string } | null)?.code;
    const msg = e instanceof Error ? e.message : String(e ?? '');
    if (code === ErrCode.STALE || ErrText.stale(msg)) return ErrText.STALE;
    const base = (code && ErrText.MAP[code]) || ErrText.UNKNOWN;
    // 附带原始原因，便于用户反馈与排查（STALE 之外的错误都带上）
    const detail = msg && msg !== code ? msg.slice(0, ErrText.DETAIL_MAX) : '';
    return detail ? `${base}（${detail}）` : base;
  }

  static stale(msg: string): boolean {
    return ErrText.STALE_HINTS.some((h) => msg.includes(h));
  }

}

/** 界面文案 */
export class Txt {
  static readonly LOGO = 'XAnimeLens';
  static readonly BTN_TITLE = '识别动漫';
  static readonly BTN_IDLE = '识别';
  static readonly BTN_BUSY = '识别中';
  static readonly LOADING = '识别中…';
  static readonly RETRY = '重试';
  static readonly CLOSE = '关闭';
  static readonly OPEN = '打开收藏集';
  static readonly SETTINGS = '设置 API Key';
  static readonly QUOTA = '近24h';
  static readonly QUOTA_TIP = 'trace.moe 每日额度：最近 24 小时已用 / 每日上限';
  static readonly EP = '第';
  static readonly EP_UNIT = '集';
  static readonly SEP = ' · ';
  static readonly BGM = '作品页';
  static readonly CHAR_PAGE = 'Bangumi 角色页';
  static readonly CLIP = '预览片段';
  static readonly ANILIST = 'AniList';
  static readonly FAV = '☆ 收藏';
  static readonly FAVED = '★ 已收藏';
  static readonly LOW = '相似度低';
  static readonly STAR = '★ ';
  static readonly CMP = '对比 ▾';
  static readonly CMP_OPEN = '收起 ▴';
  static readonly CMP_IN = '输入截图';
  static readonly CMP_OUT = '匹配片段';
  static readonly CMP_LOADING = '片段加载中…';
  static readonly CMP_FAIL = '片段加载失败，可点“预览片段”在新标签页查看';
  static readonly MAG = 'M11 11l5.5 5.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z';
}

/** 作品信息本地化与取舍 */
export class MetaMap {
  static readonly FORMAT: Record<string, string> = {
    TV: 'TV动画',
    TV_SHORT: 'TV短篇',
    MOVIE: '剧场版',
    SPECIAL: '特别篇',
    OVA: 'OVA',
    ONA: '网络动画',
    MUSIC: '音乐MV',
  };
  /** Bangumi platform → 展示名 */
  static readonly PLATFORM: Record<string, string> = {
    TV: 'TV动画',
    WEB: '网络动画',
    OVA: 'OVA',
    剧场版: '剧场版',
  };
  static readonly SOURCE: Record<string, string> = {
    ORIGINAL: '原创',
    MANGA: '漫画改',
    LIGHT_NOVEL: '轻小说改',
    NOVEL: '小说改',
    WEB_NOVEL: '网文改',
    VISUAL_NOVEL: '视觉小说改',
    VIDEO_GAME: '游戏改',
    GAME: '游戏改',
    DOUJINSHI: '同人改',
    ANIME: '动画衍生',
    WEB_MANGA: '网漫改',
    LIVE_ACTION: '真人改',
    PICTURE_BOOK: '绘本改',
    COMIC: '漫画改',
    MULTIMEDIA_PROJECT: '企划',
    OTHER: '其他',
  };
  static readonly SEASON: Record<string, string> = {
    WINTER: '冬',
    SPRING: '春',
    SUMMER: '夏',
    FALL: '秋',
  };
  static readonly GENRE: Record<string, string> = {
    Action: '动作',
    Adventure: '冒险',
    Comedy: '喜剧',
    Drama: '剧情',
    Ecchi: '卖肉',
    Fantasy: '奇幻',
    Horror: '恐怖',
    'Mahou Shoujo': '魔法少女',
    Mecha: '机战',
    Music: '音乐',
    Mystery: '悬疑',
    Psychological: '心理',
    Romance: '恋爱',
    'Sci-Fi': '科幻',
    'Slice of Life': '日常',
    Sports: '运动',
    Supernatural: '超自然',
    Thriller: '惊悚',
    Hentai: '成人',
  };
  /** 与形式/地区/原作重复、不适合当“类型”展示的 Bangumi 标签 */
  static readonly SKIP_TAGS = ['TV', 'WEB', 'OVA', '剧场版', '日本', '中国', '美国', '韩国', '原创'];
  static readonly STAFF_KEYS = ['导演', '总导演', '监督'];
  static readonly STUDIO_KEY = '动画制作';
  static readonly MAX_GENRES = 6;
  static readonly MAX_STUDIOS = 2;
}

export class MetaTxt {
  static readonly YEAR = '年';
  static readonly MONTH = '月';
  static readonly EPS = '共{n}集';
  static readonly MIN = '每集{n}分钟';
  static readonly MOVIE_MIN = '{n}分钟';
  static readonly STAFF = '导演：';
  static readonly STUDIO = '制作：';
  static readonly ADULT = 'R18';
  static readonly JOIN = ' / ';
}

/** 来源与角色相关文案（卡片与收藏集共用） */
export class SrcTxt {
  static readonly NAME: Record<string, string> = {
    [Src.TM]: 'trace.moe',
    [Src.AT]: 'AnimeTrace',
  };
  static readonly MULTI = '多源一致';
  static readonly CHARS = '角色：';
  static readonly CHAR_SEP = '、';
  static readonly ROLE_ONLY = '角色识别';
  static readonly UNSURE = '置信度低';
  static readonly AI = '疑似 AI 生成图';
  static readonly FAILED = '未返回';
  static readonly PENDING = '识别中…';
}

/** AnimeTrace 上传文件名 */
export class AtFile {
  static readonly NAME = 'frame.jpg';
}

/** 收藏集新增 DOM 标识（来源 / 角色 / 设置） */
export class ColDom2 {
  static readonly SRC = 'col-src';
  static readonly SRC_TAG = 'col-src-tag';
  static readonly SRC_MULTI = 'col-src-multi';
  static readonly CHARS = 'col-chars';
  static readonly SET_AT = 'col-at';
}

/** 旧收藏补全参数 */
export class BackfillDef {
  static readonly MAX = 20;
  static readonly GAP_MS = 300;
}
