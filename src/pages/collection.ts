import { Api, Aria, BackfillDef, ColDef, ColDom, ColSort, ColTxt, Def, Export, Page, SrcPick, SrcTxt } from '../shared/consts';
import { Store } from '../core/store';
import { Csv } from '../core/csv';
import { Backfill } from '../core/backfill';
import { FavQuery } from '../core/favq';
import { Bangumi } from '../api/bangumi';
import { Metas } from '../core/meta';
import type { Fav } from '../shared/types';
import css from './collection.css';

class View {
  static items: Fav[] = [];
  static query = '';
  static kind = '';
  static src = SrcPick.ALL;
  static sort = ColSort.NEW;
  static backfilled = false;
  /** 正在编辑备注时收到的重绘请求，留到编辑结束后执行（重绘会替换输入框，丢失正在输入的内容） */
  static held = false;

  static boot(): void {
    document.head.appendChild(View.style());
    View.opts();
    View.on();
    void View.load().then(View.focusSet);
    window.addEventListener('hashchange', View.focusSet);
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && Store.touched(Object.keys(ch))) void View.load();
    });
  }

  static el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  static style(): HTMLStyleElement {
    const s = document.createElement('style');
    s.id = ColDom.STYLE;
    s.textContent = css;
    return s;
  }

  /** 来源与排序下拉框（作品形式的选项随收藏变化，见 kinds） */
  static opts(): void {
    View.fill(View.el<HTMLSelectElement>(ColDom.F_SRC), Object.values(SrcPick).map((v) => [v, ColTxt.SRC[v]]), View.src);
    View.fill(View.el<HTMLSelectElement>(ColDom.F_SORT), Object.values(ColSort).map((v) => [v, ColTxt.SORT[v]]), View.sort);
    View.el(ColDom.F_KIND).setAttribute(Aria.LABEL, ColTxt.F_KIND);
    View.el(ColDom.F_SRC).setAttribute(Aria.LABEL, ColTxt.F_SRC);
    View.el(ColDom.F_SORT).setAttribute(Aria.LABEL, ColTxt.F_SORT);
  }

  static fill(sel: HTMLSelectElement, opts: [string, string][], cur: string): void {
    sel.replaceChildren(...opts.map(([v, t]) => new Option(t, v, false, v === cur)));
  }

  static kinds(): void {
    const ks = FavQuery.kinds(View.items);
    if (View.kind && !ks.includes(View.kind)) View.kind = '';
    View.fill(View.el<HTMLSelectElement>(ColDom.F_KIND), [['', ColTxt.KIND_ALL], ...ks.map((k): [string, string] => [k, k])], View.kind);
  }

  static on(): void {
    View.el<HTMLInputElement>(ColDom.SEARCH).addEventListener('input', () => {
      View.query = View.el<HTMLInputElement>(ColDom.SEARCH).value;
      View.render();
    });
    View.el<HTMLSelectElement>(ColDom.F_KIND).addEventListener('change', (e) => {
      View.kind = (e.target as HTMLSelectElement).value;
      View.render();
    });
    View.el<HTMLSelectElement>(ColDom.F_SRC).addEventListener('change', (e) => {
      View.src = (e.target as HTMLSelectElement).value as SrcPick;
      View.render();
    });
    View.el<HTMLSelectElement>(ColDom.F_SORT).addEventListener('change', (e) => {
      View.sort = (e.target as HTMLSelectElement).value as ColSort;
      View.render();
    });
    View.el(ColDom.EXPORT_JSON).addEventListener('click', () =>
      View.save(Export.JSON_NAME, Export.JSON_MIME, JSON.stringify(Store.dump(View.items), null, 2)),
    );
    View.el(ColDom.EXPORT_CSV).addEventListener('click', () =>
      View.save(Export.CSV_NAME, Export.CSV_MIME, Csv.of(View.items)),
    );
    View.el(ColDom.IMPORT_BTN).addEventListener('click', () =>
      View.el<HTMLInputElement>(ColDom.IMPORT_FILE).click(),
    );
    View.el<HTMLInputElement>(ColDom.IMPORT_FILE).addEventListener('change', (e) => void View.imp(e));
    View.el(ColDom.SET_SAVE).addEventListener('click', () => void View.cfgSave());
    // 备注编辑结束后补上被推迟的重绘（等焦点真正离开后再判断）
    View.el(ColDom.GRID).addEventListener('focusout', () =>
      setTimeout(() => {
        if (View.held && !View.editing()) View.render();
      }),
    );
  }

  /** 从卡片“设置 API Key”或扩展选项进入（#settings）：展开设置并聚焦 trace.moe API Key */
  static focusSet(): void {
    if (location.hash !== Page.SETTINGS_HASH) return;
    View.el<HTMLDetailsElement>(ColDom.SETTINGS).open = true;
    const key = View.el<HTMLInputElement>(ColDom.SET_TMKEY);
    key.scrollIntoView({ block: 'center' });
    key.focus();
  }

  static async load(): Promise<void> {
    View.items = await Store.list();
    const c = await Store.cfg();
    View.el<HTMLInputElement>(ColDom.SET_TMKEY).value = c.tmKey;
    View.el<HTMLInputElement>(ColDom.SET_MINSIM).value = String(c.minSim);
    View.el<HTMLInputElement>(ColDom.SET_BGMTOKEN).value = c.bgmToken;
    View.el<HTMLInputElement>(ColDom.SET_AT).checked = c.at;
    View.kinds();
    View.render();
    if (!View.backfilled) {
      View.backfilled = true;
      void View.backfill();
    }
  }

  /** 旧收藏补全形式与类型标签；写入触发 onChanged 重绘 */
  static async backfill(): Promise<void> {
    const c = await Store.cfg();
    const todo = Backfill.pick(View.items);
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i];
      if (f.bgmId == null) continue;
      try {
        const subj = await Bangumi.subject(f.bgmId, c.bgmToken);
        const m = Metas.of({ hit: null, bgm: subj, srcs: [], chars: [], work: '', unsure: false });
        const cover = f.cover || subj.images?.common || subj.images?.large || '';
        await Store.patch(f.key, { kind: m.kind, genres: m.genres, cover });
      } catch {
        // 单条失败跳过
      }
      if (i < todo.length - 1) await new Promise((r) => setTimeout(r, BackfillDef.GAP_MS));
    }
  }

  /** 焦点在某条备注输入框里 */
  static editing(): boolean {
    return document.activeElement instanceof HTMLTextAreaElement && document.activeElement.classList.contains(ColDom.NOTE);
  }

  static render(): void {
    if (View.editing()) {
      View.held = true;
      return;
    }
    View.held = false;
    const items = FavQuery.apply(View.items, { q: View.query, kind: View.kind, src: View.src, sort: View.sort });
    const n = String(View.items.length);
    View.el(ColDom.COUNT).textContent =
      items.length === View.items.length
        ? ColTxt.COUNT.replace(ColTxt.N, n)
        : ColTxt.COUNT_PART.replace(ColTxt.M, String(items.length)).replace(ColTxt.N, n);
    const grid = View.el<HTMLElement>(ColDom.GRID);
    grid.replaceChildren(...(items.length ? items.map((f) => View.card(f)) : [View.empty()]));
  }

  static empty(): HTMLElement {
    const p = document.createElement('p');
    p.className = ColDom.EMPTY;
    p.textContent = View.items.length ? ColTxt.NO_MATCH : ColTxt.EMPTY;
    return p;
  }

  static card(f: Fav): HTMLElement {
    const c = document.createElement('article');
    c.className = ColDom.CARD;
    c.setAttribute(Aria.LABEL, f.title);
    c.append(View.cover(f));

    const name = document.createElement('h2');
    name.className = ColDom.NAME;
    name.textContent = f.title;
    name.title = f.title;
    c.append(name);

    if (f.native) c.append(View.p(ColDom.NATIVE, f.native));

    if (f.kind || f.genres.length) {
      const tags = document.createElement('p');
      tags.className = ColDom.TAGS;
      for (const [cls, t] of [[ColDom.KIND, f.kind] as const, ...f.genres.map((g) => [ColDom.GENRE, g] as const)]) {
        if (t) tags.append(View.span(cls, t));
      }
      c.append(tags);
    }

    if (f.srcs.length) {
      const srcs = document.createElement('p');
      srcs.className = ColDom.SRC;
      for (const s of f.srcs) srcs.append(View.span(ColDom.SRC_TAG, SrcTxt.NAME[s] ?? s));
      if (f.srcs.length >= 2) srcs.append(View.span(ColDom.SRC_MULTI, SrcTxt.MULTI));
      c.append(srcs);
    }

    if (f.chars.length) c.append(View.p(ColDom.CHARS, SrcTxt.CHARS + f.chars.join(SrcTxt.CHAR_SEP)));

    const roleOnly = f.episode === '' && f.at === 0 && f.similarity === 0;
    const ep = `${ColTxt.EP.replace(ColTxt.N, f.episode || ColTxt.EP_NONE)} ${View.clock(f.at)}`;
    c.append(View.p(ColDom.EPISODE, roleOnly ? SrcTxt.ROLE_ONLY : ep));
    if (!roleOnly) c.append(View.p(ColDom.SIM, ColTxt.SIM.replace(ColTxt.N, (f.similarity * 100).toFixed(1))));
    c.append(View.p(ColDom.TIME, View.stamp(f.savedAt)));

    const links = document.createElement('p');
    links.className = ColDom.LINKS;
    if (f.tweetUrl) links.append(View.link(ColDom.TWEET, f.tweetUrl, ColTxt.TWEET));
    if (f.bgmId != null) links.append(View.link(ColDom.BGM, Api.BGM_SITE + f.bgmId, ColTxt.BGM));
    if (links.childElementCount) c.append(links);

    c.append(View.note(f));

    const del = document.createElement('button');
    del.className = ColDom.DEL;
    del.type = 'button';
    del.textContent = ColTxt.DEL;
    del.setAttribute(Aria.LABEL, ColTxt.DEL_LABEL + f.title);
    del.addEventListener('click', () => void View.del(f));
    c.append(del);

    return c;
  }

  /** 备注：停止输入片刻即保存，失焦时立即保存 */
  static note(f: Fav): HTMLTextAreaElement {
    const note = document.createElement('textarea');
    note.className = ColDom.NOTE;
    note.rows = 2;
    note.placeholder = ColTxt.NOTE;
    note.setAttribute(Aria.LABEL, ColTxt.NOTE_LABEL + f.title);
    note.value = f.note;
    let timer = 0;
    let saved = f.note;
    const flush = (): void => {
      clearTimeout(timer);
      if (note.value === saved) return;
      saved = note.value;
      void Store.note(f.key, saved);
    };
    note.addEventListener('input', () => {
      clearTimeout(timer);
      timer = window.setTimeout(flush, ColDef.NOTE_MS);
    });
    note.addEventListener('blur', flush);
    return note;
  }

  /** 删除不再弹确认框：立即删除，提示条里可撤销 */
  static async del(f: Fav): Promise<void> {
    await Store.del(f.key);
    View.toast(ColTxt.DELETED.replace(ColTxt.T, f.title), ColTxt.UNDO, async () => {
      await Store.add(f);
      View.toast(ColTxt.RESTORED.replace(ColTxt.T, f.title));
    });
  }

  static toastTimer = 0;

  /** 页面底部提示条（读屏会播报）；act 为可选的操作按钮 */
  static toast(msg: string, act = '', run?: () => void | Promise<void>, err = false): void {
    const box = View.el(ColDom.TOAST);
    const btn = View.el<HTMLButtonElement>(ColDom.TOAST_ACT);
    View.el(ColDom.TOAST_MSG).textContent = msg;
    box.classList.toggle(ColDom.TOAST_ERR, err);
    btn.hidden = !act;
    btn.textContent = act;
    btn.onclick = run
      ? () => {
          box.hidden = true;
          void run();
        }
      : null;
    box.hidden = false;
    clearTimeout(View.toastTimer);
    View.toastTimer = window.setTimeout(() => (box.hidden = true), ColDef.TOAST_MS);
  }

  static p(cls: string, text: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }

  static span(cls: string, text: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  static cover(f: Fav): HTMLElement {
    const img = document.createElement('img');
    img.className = ColDom.COVER;
    img.alt = f.cover ? f.title : ''; // 无封面时不显示替代文字，保留占位底色
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    if (f.cover) img.src = f.cover;
    return img;
  }

  static link(cls: string, href: string, text: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.className = cls;
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noreferrer noopener';
    return a;
  }

  static clock(sec: number): string {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  static stamp(iso: string): string {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
  }

  static save(name: string, mime: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  static async imp(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const n = await Store.merge(Store.parse(await file.text()));
      View.toast(ColTxt.IMPORTED.replace(ColTxt.N, String(n)));
    } catch {
      View.toast(ColTxt.IMPORT_FAIL, '', undefined, true);
    }
  }

  static async cfgSave(): Promise<void> {
    const raw = Number(View.el<HTMLInputElement>(ColDom.SET_MINSIM).value);
    await Store.setCfg({
      tmKey: View.el<HTMLInputElement>(ColDom.SET_TMKEY).value.trim(),
      bgmToken: View.el<HTMLInputElement>(ColDom.SET_BGMTOKEN).value.trim(),
      minSim: Math.min(ColDef.MAX_SIM, Math.max(ColDef.MIN_SIM, Number.isFinite(raw) ? raw : Def.MIN_SIM)),
      at: View.el<HTMLInputElement>(ColDom.SET_AT).checked,
    });
    View.toast(ColTxt.SAVED);
  }
}

View.boot();
