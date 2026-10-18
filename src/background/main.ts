import { Img } from './img';
import { Recognizer } from '../core/recognize';
import { Chars } from '../core/chars';
import { Store } from '../core/store';
import { Health, Svrs } from '../core/svrs';
import { Api, Dom, ErrCode, Msg, Page, PortDef, PortMsg, Svr, SvrDef, SvrTxt } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { CardData, CardItem, CharInfo, Err, PortReq, PortRes, Recog, RecogResult, Req } from '../shared/types';

class Svc {
  static boot(): void {
    chrome.runtime.onMessage.addListener((req, sender, send) => {
      void Svc.route(req as Req, sender).then(
        (data) => send({ ok: true, data }),
        (e) => send({ ok: false, err: Svc.err(e) }),
      );
      return true;
    });
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== PortDef.RECOG) return;
      port.onMessage.addListener((req: PortReq) => void Svc.stream(port, req));
    });
    chrome.action.onClicked.addListener(() => void Svc.open());
    chrome.runtime.onInstalled.addListener(() => void Svc.reinject());
  }

  static async route(req: Req, sender: chrome.runtime.MessageSender): Promise<unknown> {
    switch (req.type) {
      case Msg.CAPTURE:
        return Svc.capture(sender);
      case Msg.FAV_ADD:
        await Store.add(req.fav);
        return null;
      case Msg.FAV_DEL:
        await Store.del(req.key);
        return null;
      case Msg.FAV_HAS:
        return Store.has(req.key);
      case Msg.FAV_LIST:
        return Store.list();
      case Msg.CFG_GET:
        return Store.cfg();
      case Msg.CLIP:
        return Svc.clip(req.url);
      case Msg.PIC:
        return Svc.pic(req.url);
      case Msg.CHAR:
        return Svc.char(req.name, req.subject);
      case Msg.OPEN_COLLECTION:
        await Svc.open();
        return null;
      case Msg.OPEN_SETTINGS:
        await Svc.open(Page.SETTINGS_HASH);
        return null;
      default:
        throw new AppErr(ErrCode.NETWORK, 'unknown message');
    }
  }

  /** 增量识别：每个来源返回后推送一次 PART，全部返回后推送 DONE */
  static async stream(port: chrome.runtime.Port, req: PortReq): Promise<void> {
    const post = (m: PortRes): void => {
      try {
        port.postMessage(m);
      } catch {
        // content 已断开（关闭卡片 / 页面跳转），忽略
      }
    };
    try {
      const blob = await (await fetch(req.img)).blob();
      const cfg = await Store.cfg();
      const pics = new Pics(); // 同一张图只拉一次
      await Recognizer.stream(blob, cfg, async (r, done) => {
        post({ type: done ? PortMsg.DONE : PortMsg.PART, data: await Svc.card(r, pics, done) });
      });
    } catch (e) {
      post({ type: PortMsg.ERR, err: Svc.err(e) });
    }
  }

  /**
   * 识别结果 → 卡片数据：远程图片转 dataURL（X 的 CSP 禁止外链图片）。
   * 增量推送只等图片一小会儿，没到的留给下一次推送，避免慢图床拖住结果展示；最终推送等全部图片。
   */
  static async card(out: RecogResult, pics: Pics, done: boolean): Promise<CardData> {
    const items: CardItem[] = await Promise.all(
      out.items.map(async (recog: Recog): Promise<CardItem> => {
        const [cover, shot] = await Promise.all([
          Svc.first(Svc.covers(recog), pics, done),
          pics.get(Svc.shot(recog.hit?.image ?? ''), done),
        ]);
        return { recog, cover, shot, fav: await Store.has(Store.key(recog)) };
      }),
    );
    const svrs = Svrs.copy(out.svrs);
    // AniList 封面加载失败也算 AniList 不可用
    if (pics.failed(SvrDef.AL_HOST)) Svrs.fail(svrs, Svr.AL, SvrTxt.NO_IMG);
    return { items, quota: out.quota, quotaUsed: out.quotaUsed, errs: out.errs, ai: out.ai, pending: out.pending, svrs };
  }

  /** 按顺序取第一张成功的图（Bangumi 挂了就用 AniList 封面） */
  static async first(urls: string[], pics: Pics, done: boolean): Promise<string> {
    for (const u of urls) {
      const d = await pics.get(u, done);
      // 只在确认失败时换下一张；仍在加载则先留空，避免封面先 AniList 后 Bangumi 来回切换
      if (d || !pics.bad.has(u)) return d;
    }
    return '';
  }

  /** 封面候选：bgm.common → bgm.large → anilist.large */
  static covers(r: Recog): string[] {
    const b = r.bgm;
    return [b?.images?.common, b?.images?.large, r.hit?.anilist.coverImage?.large].filter((u): u is string => !!u);
  }

  /** 给 trace.moe 截图 URL 追加 size=m（用 URL 对象正确处理已有 query） */
  static shot(url: string): string {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.searchParams.set('size', 'm');
      return u.toString();
    } catch {
      return url;
    }
  }

  /** 角色查询缓存：同一作品同名角色只查一次 */
  static charCache = new Map<string, Promise<CharInfo | null>>();

  /** AnimeTrace 角色名 → Bangumi 角色（头像转 dataURL，X 的 CSP 禁止外链图片） */
  static char(name: string, subject: number | null): Promise<CharInfo | null> {
    const key = `${subject ?? ''}:${name}`;
    if (!Svc.charCache.has(key)) {
      const p = (async (): Promise<CharInfo | null> => {
        const cfg = await Store.cfg();
        const c = await Chars.find(name, subject, cfg.bgmToken);
        // Bangumi 不可用时的“未找到”不可信，抛出以免缓存，恢复后可重新查询
        if (!c && Health.down(Svr.BGM)) throw new AppErr(ErrCode.NETWORK, SvrTxt.DOWN);
        if (!c) return null;
        return { id: c.id, name: c.name, cn: Chars.cn(c), img: await Img.data(Chars.img(c)), url: Api.BGM_CHAR_SITE + c.id };
      })();
      // 失败不缓存，下次可重试
      Svc.charCache.set(key, p.catch((e) => {
        Svc.charCache.delete(key);
        throw e;
      }));
    }
    return Svc.charCache.get(key)!;
  }

  /** trace.moe 预览片段 → dataURL（X 的 CSP 只允许 media-src data:/blob: 与 twimg） */
  static async clip(url: string): Promise<string> {
    const d = await Img.data(Svc.shot(url));
    if (!d) throw new AppErr(ErrCode.NETWORK, 'clip');
    return d;
  }

  /** 页面内跨域读取失败的图片由后台下载（不受页面 CORS / CSP 限制） */
  static async pic(url: string): Promise<string> {
    const d = await Img.data(url);
    if (!d) throw new AppErr(ErrCode.CAPTURE, 'pic');
    return d;
  }

  static async capture(sender: chrome.runtime.MessageSender): Promise<string> {
    const win = sender.tab?.windowId;
    const opts: chrome.tabs.CaptureVisibleTabOptions = { format: 'jpeg', quality: 90 };
    try {
      if (win == null) return await chrome.tabs.captureVisibleTab(opts);
      return await chrome.tabs.captureVisibleTab(win, opts);
    } catch (e) {
      throw new AppErr(ErrCode.CAPTURE, e instanceof Error ? e.message : String(e));
    }
  }

  /** 安装/更新后向已打开的 X 标签页注入新脚本，免去手动刷新页面 */
  static async reinject(): Promise<void> {
    const tabs = await chrome.tabs.query({ url: Dom.MATCHES });
    for (const t of tabs) {
      if (t.id == null) continue;
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: [Page.CONTENT_JS] }).catch(() => {});
    }
  }

  static async open(hash = ''): Promise<void> {
    await chrome.tabs.create({ url: chrome.runtime.getURL(Page.COLLECTION) + hash });
  }

  static err(e: unknown): Err {
    if (e instanceof AppErr) return { code: e.code, msg: e.message };
    return { code: ErrCode.NETWORK, msg: e instanceof Error ? e.message : String(e) };
  }
}

/** 单次识别内的图片缓存：记录已失败的地址，增量推送时可限时等待 */
class Pics {
  map = new Map<string, Promise<string>>();
  bad = new Set<string>();

  /** wait 为 false 时最多等 IMG_WAIT_MS，未完成先返回空串 */
  get(url: string, wait: boolean): Promise<string> {
    if (!url) return Promise.resolve('');
    if (!this.map.has(url)) {
      this.map.set(
        url,
        Img.data(url).then((d) => {
          if (!d) this.bad.add(url);
          return d;
        }),
      );
    }
    const p = this.map.get(url)!;
    if (wait) return p;
    return Promise.race([p, new Promise<string>((ok) => setTimeout(() => ok(''), SvrDef.IMG_WAIT_MS))]);
  }

  failed(host: string): boolean {
    return [...this.bad].some((u) => u.includes(host));
  }
}

Svc.boot();
