import css from './card.css';
import { Bus } from './msg';
import { Store } from '../core/store';
import { Api, CardDom, CardState, Def, Dom, ErrText, Msg, Txt } from '../shared/consts';
import type { CardData, CardItem } from '../shared/types';

/** 全局唯一浮动卡片（Shadow DOM）。 */
export class Card {
  static host: HTMLDivElement | null = null;
  static card: HTMLElement | null = null;
  static list: HTMLUListElement | null = null;
  static quota: HTMLElement | null = null;
  static errMsg: HTMLElement | null = null;
  static retry: HTMLButtonElement | null = null;
  static minSim: number | null = null;

  static loading(): void {
    Card.build();
    Card.card!.setAttribute('data-state', CardState.LOADING);
    Card.show(true);
  }

  static error(msg: string, retry: () => void | Promise<void>): void {
    Card.build();
    Card.card!.setAttribute('data-state', CardState.ERR);
    Card.errMsg!.textContent = msg;
    Card.retry!.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      void retry();
    };
    Card.show(true);
  }

  static async render(data: CardData, tweetUrl: string): Promise<void> {
    Card.build();
    if (!data.items.length) {
      Card.error(ErrText.NOT_FOUND, () => {});
      return;
    }
    const min = await Card.min();
    Card.list!.replaceChildren(...data.items.map((it) => Card.item(it, min, tweetUrl)));
    Card.quotaShow(data);
    Card.card!.setAttribute('data-state', CardState.OK);
    Card.show(true);
  }

  /** 收藏 / 取消收藏 */
  static async toggle(item: CardItem, btn: HTMLButtonElement, tweetUrl: string): Promise<void> {
    const key = String(item.recog.hit.anilist.id);
    try {
      if (item.fav) {
        await Bus.send({ type: Msg.FAV_DEL, key });
        item.fav = false;
      } else {
        await Bus.send({ type: Msg.FAV_ADD, fav: Store.toFav(item.recog, tweetUrl) });
        item.fav = true;
      }
      Card.fav(btn, item.fav);
    } catch (e) {
      Card.error(ErrText.of(e), () => void Card.toggle(item, btn, tweetUrl));
    }
  }

  /** 单条结果 DOM（严格遵循 Temp/card-dom.md） */
  static item(it: CardItem, min: number, tweetUrl: string): HTMLLIElement {
    const r = it.recog;
    const a = r.hit.anilist;
    const b = r.bgm;
    const native = b?.name || a.title.native || '';
    const title = b?.name_cn || a.title.chinese || native || a.title.romaji || '';

    const li = Card.mk('li', CardDom.ITEM);
    if (r.hit.similarity < min) li.classList.add(CardDom.LOW);

    if (it.cover) {
      const img = Card.mk('img', CardDom.COVER);
      img.src = it.cover;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      li.append(img);
    }

    const info = Card.mk('div', CardDom.INFO);
    info.append(Card.mk('h3', CardDom.TITLE, title));
    if (native) info.append(Card.mk('p', CardDom.NATIVE, native));

    const meta = Card.mk('p', CardDom.META);
    meta.append(Card.mk('span', CardDom.EP, Card.ep(r.hit.episode, r.hit.at ?? r.hit.from)));
    meta.append(Card.mk('span', CardDom.SIM, (r.hit.similarity * 100).toFixed(1) + '%'));
    const score = b?.rating?.score;
    if (score) meta.append(Card.mk('span', CardDom.SCORE, Txt.STAR + score));
    info.append(meta);

    if (it.shot) {
      const shot = Card.mk('img', CardDom.SHOT);
      shot.src = it.shot;
      shot.alt = '';
      shot.referrerPolicy = 'no-referrer';
      info.append(shot);
    }

    const links = Card.mk('div', CardDom.LINKS);
    if (b) links.append(Card.link(Api.BGM_SITE + b.id, Txt.BGM));
    if (r.hit.video) links.append(Card.link(r.hit.video, Txt.CLIP));
    if (a.siteUrl) links.append(Card.link(a.siteUrl, Txt.ANILIST));
    if (links.childElementCount) info.append(links);
    li.append(info);

    const fav = Card.mk('button', CardDom.FAV);
    fav.type = 'button';
    Card.fav(fav, it.fav);
    fav.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void Card.toggle(it, fav, tweetUrl);
    });
    li.append(fav);

    return li;
  }

  /** 集数 + 时间（集数空则只显示时间） */
  static ep(episode: number | string | null, at: number): string {
    const time = Card.clock(at);
    if (episode == null || episode === '') return time;
    return `${Txt.EP} ${episode} ${Txt.EP_UNIT}${Txt.SEP}${time}`;
  }

  /** mm:ss；≥1 小时 h:mm:ss */
  static clock(sec: number): string {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    return `${String(m).padStart(2, '0')}:${ss}`;
  }

  static fav(btn: HTMLButtonElement, on: boolean): void {
    btn.textContent = on ? Txt.FAVED : Txt.FAV;
    btn.classList.toggle(CardDom.ON, on);
  }

  static show(on: boolean): void {
    if (Card.host) Card.host.style.display = on ? '' : 'none';
  }

  static async min(): Promise<number> {
    if (Card.minSim == null) {
      try {
        Card.minSim = (await Bus.send<{ minSim: number }>({ type: Msg.CFG_GET })).minSim;
      } catch {
        Card.minSim = Def.MIN_SIM;
      }
    }
    return Card.minSim;
  }

  static build(): void {
    if (Card.host) return;

    const host = document.createElement('div');
    host.id = Dom.HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
    });
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    root.append(style);

    const card = Card.mk('div', CardDom.CARD);
    card.setAttribute('data-state', CardState.LOADING);

    const head = Card.mk('header', CardDom.HEAD);
    const quota = Card.mk('span', CardDom.QUOTA);
    quota.hidden = true;
    const close = Card.mk('button', CardDom.CLOSE, '×');
    close.type = 'button';
    close.title = Txt.CLOSE;
    head.append(Card.mk('span', CardDom.LOGO, Txt.LOGO), quota, close);

    const body = Card.mk('div', CardDom.BODY);
    const loading = Card.mk('div', CardDom.LOADING);
    loading.append(Card.mk('div', CardDom.SPIN), Card.mk('p', undefined, Txt.LOADING));
    const err = Card.mk('div', CardDom.ERR);
    const errMsg = Card.mk('p', CardDom.ERR_MSG);
    const retry = Card.mk('button', CardDom.RETRY, Txt.RETRY);
    retry.type = 'button';
    err.append(errMsg, retry);
    const list = Card.mk('ul', CardDom.LIST);
    body.append(loading, err, list);

    const foot = Card.mk('footer', CardDom.FOOT);
    const open = Card.mk('button', CardDom.OPEN, Txt.OPEN);
    open.type = 'button';
    foot.append(open);

    card.append(head, body, foot);
    root.append(card);
    document.body.append(host);

    Card.host = host;
    Card.card = card;
    Card.list = list;
    Card.quota = quota;
    Card.errMsg = errMsg;
    Card.retry = retry;

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      Card.show(false);
    });
    open.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void Bus.send({ type: Msg.OPEN_COLLECTION }).catch(() => {});
    });
    Card.drag(head, host);
  }

  static quotaShow(data: CardData): void {
    if (!Card.quota) return;
    if (data.quota == null) {
      Card.quota.hidden = true;
      return;
    }
    Card.quota.hidden = false;
    Card.quota.textContent = `${Txt.QUOTA} ${data.quotaUsed ?? 0}/${data.quota}`;
  }

  static drag(head: HTMLElement, host: HTMLElement): void {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let on = false;

    head.addEventListener('pointerdown', (e) => {
      on = true;
      const r = host.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      sx = e.clientX;
      sy = e.clientY;
      host.style.left = r.left + 'px';
      host.style.top = r.top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!on) return;
      const x = Card.clamp(ox + e.clientX - sx, 0, window.innerWidth - host.offsetWidth);
      const y = Card.clamp(oy + e.clientY - sy, 0, window.innerHeight - host.offsetHeight);
      host.style.left = x + 'px';
      host.style.top = y + 'px';
    });
    const end = (e: PointerEvent): void => {
      on = false;
      if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId);
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  static link(href: string, text: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.className = CardDom.LINK;
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noreferrer noopener';
    return a;
  }

  static mk<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  private static clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(lo, v), Math.max(lo, hi));
  }
}
