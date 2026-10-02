import { Img } from './img';
import { Recognizer } from '../core/recognize';
import { Store } from '../core/store';
import { Dom, ErrCode, Msg, Page, PortDef, PortMsg } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { CardData, CardItem, Err, PortReq, PortRes, Recog, RecogResult, Req } from '../shared/types';

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
      case Msg.OPEN_COLLECTION:
        await Svc.open();
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
      const imgs = new Map<string, Promise<string>>(); // 同一张图只拉一次
      await Recognizer.stream(blob, cfg, async (r, done) => {
        post({ type: done ? PortMsg.DONE : PortMsg.PART, data: await Svc.card(r, imgs) });
      });
    } catch (e) {
      post({ type: PortMsg.ERR, err: Svc.err(e) });
    }
  }

  /** 识别结果 → 卡片数据：远程图片转 dataURL（X 的 CSP 禁止外链图片） */
  static async card(out: RecogResult, imgs: Map<string, Promise<string>>): Promise<CardData> {
    const data = (url: string): Promise<string> => {
      if (!url) return Promise.resolve('');
      if (!imgs.has(url)) imgs.set(url, Img.data(url));
      return imgs.get(url)!;
    };
    const items: CardItem[] = await Promise.all(
      out.items.map(async (recog: Recog): Promise<CardItem> => {
        const [cover, shot] = await Promise.all([
          data(Svc.cover(recog)),
          data(Svc.shot(recog.hit?.image ?? '')),
        ]);
        return { recog, cover, shot, fav: await Store.has(Store.key(recog)) };
      }),
    );
    return { items, quota: out.quota, quotaUsed: out.quotaUsed, errs: out.errs, ai: out.ai, pending: out.pending };
  }

  /** 封面优先级：bgm.common → bgm.large → anilist.large */
  static cover(r: Recog): string {
    const b = r.bgm;
    return (
      b?.images?.common ||
      b?.images?.large ||
      r.hit?.anilist.coverImage?.large ||
      ''
    );
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

  /** trace.moe 预览片段 → dataURL（X 的 CSP 只允许 media-src data:/blob: 与 twimg） */
  static async clip(url: string): Promise<string> {
    const d = await Img.data(Svc.shot(url));
    if (!d) throw new AppErr(ErrCode.NETWORK, 'clip');
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

  static async open(): Promise<void> {
    await chrome.tabs.create({ url: chrome.runtime.getURL(Page.COLLECTION) });
  }

  static err(e: unknown): Err {
    if (e instanceof AppErr) return { code: e.code, msg: e.message };
    return { code: ErrCode.NETWORK, msg: e instanceof Error ? e.message : String(e) };
  }
}

Svc.boot();
