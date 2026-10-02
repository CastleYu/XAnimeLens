import { Api, ColDom, Def, Export, Key } from '../shared/consts';
import { Store } from '../core/store';
import { Csv } from '../core/csv';
import type { Fav } from '../shared/types';
import css from './collection.css';

class View {
  static items: Fav[] = [];
  static query = '';

  static boot(): void {
    document.head.appendChild(View.style());
    View.on();
    void View.load();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && Object.prototype.hasOwnProperty.call(ch, Key.FAVS)) void View.load();
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

  static on(): void {
    View.el<HTMLInputElement>(ColDom.SEARCH).addEventListener('input', () => {
      View.query = View.el<HTMLInputElement>(ColDom.SEARCH).value;
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
  }

  static async load(): Promise<void> {
    View.items = await Store.list();
    const c = await Store.cfg();
    View.el<HTMLInputElement>(ColDom.SET_TMKEY).value = c.tmKey;
    View.el<HTMLInputElement>(ColDom.SET_MINSIM).value = String(c.minSim);
    View.el<HTMLInputElement>(ColDom.SET_BGMTOKEN).value = c.bgmToken;
    View.render();
  }

  static render(): void {
    const q = View.query.trim().toLowerCase();
    const items = q ? View.items.filter((f) => View.hit(f, q)) : View.items;
    View.el(ColDom.COUNT).textContent = `共 ${View.items.length} 条`;
    const grid = View.el<HTMLElement>(ColDom.GRID);
    grid.replaceChildren(...(items.length ? items.map((f) => View.card(f)) : [View.empty()]));
  }

  static hit(f: Fav, q: string): boolean {
    return [f.title, f.native, f.note, f.kind, ...f.genres].some((s) => (s || '').toLowerCase().includes(q));
  }

  static empty(): HTMLElement {
    const p = document.createElement('p');
    p.className = ColDom.EMPTY;
    p.textContent = View.items.length ? '没有匹配的收藏' : '还没有收藏';
    return p;
  }

  static card(f: Fav): HTMLElement {
    const c = document.createElement('article');
    c.className = ColDom.CARD;
    c.append(View.cover(f));

    const name = document.createElement('h2');
    name.className = ColDom.NAME;
    name.textContent = f.title;
    name.title = f.title;
    c.append(name);

    if (f.native) {
      const nat = document.createElement('p');
      nat.className = ColDom.NATIVE;
      nat.textContent = f.native;
      c.append(nat);
    }

    if (f.kind || f.genres.length) {
      const tags = document.createElement('p');
      tags.className = ColDom.TAGS;
      for (const [cls, t] of [[ColDom.KIND, f.kind] as const, ...f.genres.map((g) => [ColDom.GENRE, g] as const)]) {
        if (!t) continue;
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = t;
        tags.append(s);
      }
      c.append(tags);
    }

    const ep = document.createElement('p');
    ep.className = ColDom.EPISODE;
    ep.textContent = `第 ${f.episode || '-'} 集 ${View.clock(f.at)}`;
    c.append(ep);

    const sim = document.createElement('p');
    sim.className = ColDom.SIM;
    sim.textContent = `相似度 ${(f.similarity * 100).toFixed(1)}%`;
    c.append(sim);

    const time = document.createElement('p');
    time.className = ColDom.TIME;
    time.textContent = View.stamp(f.savedAt);
    c.append(time);

    const links = document.createElement('p');
    links.className = ColDom.LINKS;
    if (f.tweetUrl) links.append(View.link(ColDom.TWEET, f.tweetUrl, '来源推文'));
    if (f.bgmId != null) links.append(View.link(ColDom.BGM, Api.BGM_SITE + f.bgmId, 'bgm.tv'));
    if (links.childElementCount) c.append(links);

    const note = document.createElement('textarea');
    note.className = ColDom.NOTE;
    note.rows = 2;
    note.placeholder = '备注…';
    note.value = f.note;
    note.addEventListener('blur', () => void Store.note(f.key, note.value));
    c.append(note);

    const del = document.createElement('button');
    del.className = ColDom.DEL;
    del.type = 'button';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      if (confirm(`删除「${f.title}」？`)) void Store.del(f.key);
    });
    c.append(del);

    return c;
  }

  static cover(f: Fav): HTMLElement {
    const img = document.createElement('img');
    img.className = ColDom.COVER;
    img.alt = f.title;
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
      alert(`导入成功，新增 ${n} 条`);
    } catch {
      alert('导入失败：文件不是有效的收藏集 JSON');
    }
  }

  static async cfgSave(): Promise<void> {
    const raw = Number(View.el<HTMLInputElement>(ColDom.SET_MINSIM).value);
    await Store.setCfg({
      tmKey: View.el<HTMLInputElement>(ColDom.SET_TMKEY).value.trim(),
      bgmToken: View.el<HTMLInputElement>(ColDom.SET_BGMTOKEN).value.trim(),
      minSim: Math.min(1, Math.max(0.5, Number.isFinite(raw) ? raw : Def.MIN_SIM)),
    });
    alert('设置已保存');
  }
}

View.boot();
