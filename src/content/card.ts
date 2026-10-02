import css from './card.css';
import { Bus } from './msg';
import { Store } from '../core/store';
import { Metas } from '../core/meta';
import { Api, CardDom, CardState, Def, Dom, ErrText, MetaTxt, Msg, SrcTxt, Txt } from '../shared/consts';
import type { CardData, CardItem, CharInfo } from '../shared/types';

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
    Card.opened.clear();
    Card.clips.clear();
    Card.charInfos.clear();
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

  static seq = 0;
  /** 已展开对比面板的条目（增量重绘时保持展开） */
  static opened = new Set<string>();
  /** 匹配片段缓存：增量重绘时不重复下载 */
  static clips = new Map<string, Promise<string>>();

  static async render(data: CardData, tweetUrl: string, input = '', done = true): Promise<void> {
    Card.build();
    const seq = ++Card.seq;
    if (!data.items.length) {
      if (!done) return; // 仍有来源在识别中，保持加载态
      Card.error(ErrText.NOT_FOUND, () => {});
      return;
    }
    const min = await Card.min();
    if (seq !== Card.seq) return; // 已有更新的结果
    Card.list!.replaceChildren(...data.items.map((it) => Card.item(it, min, tweetUrl, input)));
    Card.notes(data);
    Card.quotaShow(data);
    Card.card!.setAttribute('data-state', CardState.OK);
    Card.show(true);
  }

  /** 收藏 / 取消收藏 */
  static async toggle(item: CardItem, btn: HTMLButtonElement, tweetUrl: string): Promise<void> {
    const key = Store.key(item.recog);
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

  /** 单条结果 DOM（结构见 Temp/card-dom.md；hit 为空表示仅 AnimeTrace 角色识别） */
  static item(it: CardItem, min: number, tweetUrl: string, input = ''): HTMLLIElement {
    const r = it.recog;
    const h = r.hit;
    const a = h?.anilist;
    const b = r.bgm;
    const native = b?.name || a?.title.native || r.work || '';
    const title = b?.name_cn || a?.title.chinese || native || a?.title.romaji || r.work || '';

    const li = Card.mk('li', CardDom.ITEM);
    if (h && h.similarity < min) li.classList.add(CardDom.LOW);

    if (it.cover) {
      const img = Card.mk('img', CardDom.COVER);
      img.src = it.cover;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      li.append(img);
    }

    const info = Card.mk('div', CardDom.INFO);
    info.append(Card.mk('h3', CardDom.TITLE, title));
    if (native && native !== title) info.append(Card.mk('p', CardDom.NATIVE, native));

    const meta = Card.mk('p', CardDom.META);
    if (h) {
      meta.append(Card.mk('span', CardDom.EP, Card.ep(h.episode, h.at ?? h.from)));
      meta.append(Card.mk('span', CardDom.SIM, (h.similarity * 100).toFixed(1) + '%'));
    } else {
      meta.append(Card.mk('span', CardDom.EP, r.unsure ? `${SrcTxt.ROLE_ONLY}${Txt.SEP}${SrcTxt.UNSURE}` : SrcTxt.ROLE_ONLY));
    }
    const score = b?.rating?.score;
    if (score) meta.append(Card.mk('span', CardDom.SCORE, Txt.STAR + score));
    info.append(meta);
    Card.srcs(info, r.srcs);
    // 标题区之外的内容放到下方整行（.xal-more），不再挤在封面右侧的窄列里
    const more = Card.mk('div', CardDom.MORE);
    Card.chars(more, r);
    Card.meta(more, r);

    if (it.shot) {
      const shot = Card.mk('img', CardDom.SHOT);
      shot.src = it.shot;
      shot.alt = '';
      shot.referrerPolicy = 'no-referrer';
      more.append(shot);
    }

    const links = Card.mk('div', CardDom.LINKS);
    if (b) links.append(Card.link(Api.BGM_SITE + b.id, Txt.BGM));
    if (h?.video) links.append(Card.link(h.video, Txt.CLIP));
    if (a?.siteUrl) links.append(Card.link(a.siteUrl, Txt.ANILIST));

    const cmp = Card.mk('div', CardDom.CMP);
    cmp.hidden = true;
    if (input || h?.video) {
      const tog = Card.mk('button', `${CardDom.LINK} ${CardDom.CMP_BTN}`, Txt.CMP);
      tog.type = 'button';
      const key = Store.key(r);
      const flip = (open: boolean, scroll: boolean): void => {
        cmp.hidden = !open;
        tog.textContent = open ? Txt.CMP_OPEN : Txt.CMP;
        tog.classList.toggle(CardDom.ON, open);
        if (open) Card.opened.add(key);
        else Card.opened.delete(key);
        if (open && !cmp.childElementCount) Card.cmp(cmp, input, h?.video ?? '', it.shot);
        if (open && scroll) requestAnimationFrame(() => cmp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      };
      tog.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        flip(cmp.hidden, true);
      });
      if (Card.opened.has(key)) flip(true, false);
      links.prepend(tog);
    }
    if (links.childElementCount) more.append(links);
    li.append(info);

    const fav = Card.mk('button', CardDom.FAV);
    fav.type = 'button';
    Card.fav(fav, it.fav);
    fav.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void Card.toggle(it, fav, tweetUrl);
    });
    li.append(fav, more, cmp);

    return li;
  }

  /** 角色查询缓存：增量重绘时不重复请求 */
  static charInfos = new Map<string, Promise<CharInfo | null>>();

  /** 角色：先显示名字，再异步补头像、中文名与 Bangumi 角色页链接 */
  static chars(box: HTMLElement, r: CardItem['recog']): void {
    if (!r.chars.length) return;
    const row = Card.mk('div', CardDom.CHARS);
    row.append(Card.mk('span', CardDom.CHAR_SUB, SrcTxt.CHARS));
    const subject = r.bgm?.id ?? null;
    for (const name of r.chars) {
      const chip = Card.mk('a', `${CardDom.CHAR} ${CardDom.CHAR_LOAD}`);
      chip.target = '_blank';
      chip.rel = 'noreferrer noopener';
      const av = Card.mk('span', CardDom.CHAR_AV);
      const nm = Card.mk('span', CardDom.CHAR_NAME, name);
      chip.append(av, nm);
      row.append(chip);

      const key = `${subject ?? ''}:${name}`;
      if (!Card.charInfos.has(key)) {
        Card.charInfos.set(key, Bus.send<CharInfo | null>({ type: Msg.CHAR, name, subject }).catch(() => null));
      }
      void Card.charInfos.get(key)!.then((c) => {
        chip.classList.remove(CardDom.CHAR_LOAD);
        if (!c) {
          av.remove(); // 未在 Bangumi 找到，只保留名字
          return;
        }
        chip.href = c.url;
        chip.title = Txt.CHAR_PAGE;
        if (c.img) {
          const img = Card.mk('img', CardDom.CHAR_AV);
          img.src = c.img;
          img.alt = '';
          av.replaceWith(img);
        } else {
          av.remove();
        }
        if (c.cn && c.cn !== c.name) {
          nm.textContent = c.cn;
          nm.after(Card.mk('span', CardDom.CHAR_SUB, c.name));
        }
      });
    }
    box.append(row);
  }

  /** 来源标签；多于一个来源时加“多源一致” */
  static srcs(info: HTMLElement, srcs: string[]): void {
    if (!srcs.length) return;
    const row = Card.mk('div', CardDom.SRCS);
    for (const s of srcs) row.append(Card.mk('span', CardDom.SRC, SrcTxt.NAME[s] ?? s));
    if (srcs.length > 1) row.append(Card.mk('span', `${CardDom.SRC} ${CardDom.MULTI}`, SrcTxt.MULTI));
    info.append(row);
  }

  /** 列表底部提示：未返回的来源、AI 生成图判定 */
  static notes(data: CardData): void {
    const lines = data.errs.map((e) => `${SrcTxt.NAME[e.src] ?? e.src} ${SrcTxt.FAILED}（${ErrText.MAP[e.code] ?? e.msg}）`);
    if (data.ai) lines.push(SrcTxt.AI);
    for (const t of lines) Card.list!.append(Card.mk('li', CardDom.NOTE, t));
    for (const s of data.pending) {
      Card.list!.append(Card.mk('li', `${CardDom.NOTE} ${CardDom.PENDING}`, `${SrcTxt.NAME[s] ?? s} ${SrcTxt.PENDING}`));
    }
  }

  /** 作品信息：形式 / 季度 / 集数 / 原作 / R18 + 类型标签 + 制作与导演 */
  static meta(info: HTMLElement, r: CardItem['recog']): void {
    const m = Metas.of(r);
    const tags = Card.mk('div', CardDom.TAGS);
    for (const t of [m.kind, m.air, m.eps, m.src]) if (t) tags.append(Card.mk('span', CardDom.TAG, t));
    if (m.adult) tags.append(Card.mk('span', `${CardDom.TAG} ${CardDom.ADULT}`, MetaTxt.ADULT));
    for (const g of m.genres) tags.append(Card.mk('span', `${CardDom.TAG} ${CardDom.GENRE}`, g));
    if (tags.childElementCount) info.append(tags);

    const sub = [m.studio && MetaTxt.STUDIO + m.studio, m.staff && MetaTxt.STAFF + m.staff].filter(Boolean);
    if (sub.length) {
      const p = Card.mk('p', CardDom.SUB, sub.join(Txt.SEP));
      p.title = p.textContent ?? '';
      info.append(p);
    }
  }

  /** 展开对比：输入截图 + 匹配片段（片段首次展开时才经 background 拉取） */
  static cmp(box: HTMLElement, input: string, clip: string, shot: string): void {
    if (input) {
      const img = Card.mk('img', CardDom.CMP_MEDIA);
      img.src = input;
      img.alt = '';
      box.append(Card.col(Txt.CMP_IN, img));
    }
    if (!clip) return; // 仅角色识别的结果没有匹配片段
    const hint = Card.mk('p', CardDom.CMP_HINT, Txt.CMP_LOADING);
    const col = Card.col(Txt.CMP_OUT, hint);
    box.append(col);
    if (!Card.clips.has(clip)) Card.clips.set(clip, Bus.send<string>({ type: Msg.CLIP, url: clip }));
    void Card.clips.get(clip)!.then(
      (src) => {
        const v = Card.mk('video', CardDom.CMP_MEDIA);
        v.muted = true;
        v.loop = true;
        v.autoplay = true;
        v.controls = true;
        v.playsInline = true;
        if (shot) v.poster = shot;
        v.src = src;
        hint.replaceWith(v);
      },
      () => (hint.textContent = Txt.CMP_FAIL),
    );
  }

  static col(cap: string, media: HTMLElement): HTMLElement {
    const col = Card.mk('div', CardDom.CMP_COL);
    col.append(Card.mk('span', CardDom.CMP_CAP, cap), media);
    return col;
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
    document.getElementById(Dom.HOST_ID)?.remove(); // 旧实例留下的卡片

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
    const set = Card.mk('button', `${CardDom.OPEN} ${CardDom.SET}`, Txt.SETTINGS);
    set.type = 'button';
    foot.append(open, set);

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
    set.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void Bus.send({ type: Msg.OPEN_SETTINGS }).catch(() => {});
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
      // 按钮（×）不参与拖动：指针捕获会把 click 重定向到 header，导致按钮点击失效
      if ((e.target as Element | null)?.closest('button')) return;
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
