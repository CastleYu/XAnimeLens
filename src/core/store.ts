import { Def, ErrCode, Export, FavKey, Key, Src } from '../shared/consts';
import { AppErr } from '../shared/err';
import { Metas } from './meta';
import type { Cfg, Fav, FavExport, Recog } from '../shared/types';

/**
 * 本地收藏集与配置，存于 chrome.storage.local。
 * 每条收藏单独一个键（fav:<key>），写操作只读写自己的那一条，并在本上下文内串行执行，
 * 避免“读出整表 → 改 → 写回”在并发时互相覆盖（例如补全标签与编辑备注同时发生）。
 */
export class Store {
  /** 本上下文内的写操作队列 */
  static q: Promise<unknown> = Promise.resolve();

  static lock<T>(fn: () => Promise<T>): Promise<T> {
    const p = Store.q.then(fn, fn);
    Store.q = p.catch(() => {});
    return p;
  }

  /** 收藏 key → 存储键 */
  static id(key: string): string {
    return Key.FAV + key;
  }

  /** 存储键变化是否涉及收藏（含旧版整表键） */
  static touched(keys: string[]): boolean {
    return keys.some((k) => k === Key.FAVS || k.startsWith(Key.FAV));
  }

  static async all(): Promise<Record<string, Fav>> {
    await Store.migrate();
    const r = await chrome.storage.local.get(null);
    // 逐条补齐缺省字段，兼容旧版本存下的数据
    const m: Record<string, Fav> = {};
    for (const [k, o] of Object.entries(r)) {
      if (!k.startsWith(Key.FAV)) continue;
      const f = Store.norm(o);
      if (f) m[f.key] = f;
    }
    return m;
  }

  /** 旧版（0.3.x 及之前）整表存于 favs：拆成逐条存储，已存在的条目不覆盖 */
  static async migrate(): Promise<void> {
    const r = await chrome.storage.local.get(Key.FAVS);
    const v = r[Key.FAVS];
    if (v === undefined) return;
    const add: Record<string, Fav> = {};
    if (v && typeof v === 'object') {
      const ids = Object.values(v as Record<string, unknown>)
        .map((o) => Store.norm(o))
        .filter((f): f is Fav => !!f);
      const have = await chrome.storage.local.get(ids.map((f) => Store.id(f.key)));
      for (const f of ids) if (!(Store.id(f.key) in have)) add[Store.id(f.key)] = f;
    }
    if (Object.keys(add).length) await chrome.storage.local.set(add);
    await chrome.storage.local.remove(Key.FAVS);
  }

  /** 整体替换收藏集 */
  static put(m: Record<string, Fav>): Promise<void> {
    return Store.lock(async () => {
      const cur = await Store.all();
      const gone = Object.keys(cur).filter((k) => !(k in m)).map(Store.id);
      if (gone.length) await chrome.storage.local.remove(gone);
      await Store.set(Object.values(m));
    });
  }

  static async set(items: Fav[]): Promise<void> {
    if (!items.length) return;
    await chrome.storage.local.set(Object.fromEntries(items.map((f) => [Store.id(f.key), f])));
  }

  static async one(key: string): Promise<Fav | null> {
    await Store.migrate();
    const id = Store.id(key);
    const r = await chrome.storage.local.get(id);
    return Store.norm(r[id]);
  }

  /** 按收藏时间(savedAt)倒序 */
  static async list(): Promise<Fav[]> {
    const m = await Store.all();
    return Object.values(m).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  }

  /**
   * 收藏；与已有条目是同一作品（同 key 或同 Bangumi ID）时合并为一条，返回最终的 key。
   * 合并时以带 trace.moe 命中（有集数时间）的一方为主，来源与角色取并集，保留原备注与收藏时间。
   */
  static add(f: Fav): Promise<string> {
    return Store.lock(async () => {
      const m = await Store.all();
      const dup = Store.match(m, f.key, f.bgmId);
      const out = dup ? Store.fuse(m[dup], f) : f;
      if (dup && dup !== out.key) await chrome.storage.local.remove(Store.id(dup));
      await Store.set([out]);
      return out.key;
    });
  }

  /** 已收藏的同一作品：先按 key，再按 Bangumi ID；没有返回 null */
  static match(m: Record<string, Fav>, key: string, bgmId: number | null): string | null {
    if (Object.prototype.hasOwnProperty.call(m, key)) return key;
    if (bgmId == null) return null;
    return Object.values(m).find((f) => f.bgmId === bgmId)?.key ?? null;
  }

  /** 同一作品的两条收藏合并为一条 */
  static fuse(old: Fav, neu: Fav): Fav {
    const base = neu.anilistId || !old.anilistId ? neu : old;
    const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
    return {
      ...base,
      bgmId: base.bgmId ?? old.bgmId ?? neu.bgmId,
      srcs: union(old.srcs, neu.srcs),
      chars: union(old.chars, neu.chars),
      note: old.note || neu.note,
      savedAt: old.key === neu.key ? neu.savedAt : old.savedAt,
    };
  }

  static del(key: string): Promise<void> {
    return Store.lock(() => chrome.storage.local.remove(Store.id(key)));
  }

  static async has(key: string): Promise<boolean> {
    return (await Store.one(key)) != null;
  }

  static note(key: string, note: string): Promise<void> {
    return Store.patch(key, { note });
  }

  /** 缺省值补全 */
  static async cfg(): Promise<Cfg> {
    const r = await chrome.storage.local.get(Key.CFG);
    const v = (r[Key.CFG] ?? {}) as Partial<Cfg>;
    return {
      tmKey: typeof v.tmKey === 'string' ? v.tmKey : '',
      minSim: typeof v.minSim === 'number' ? v.minSim : Def.MIN_SIM,
      bgmToken: typeof v.bgmToken === 'string' ? v.bgmToken : '',
      at: typeof v.at === 'boolean' ? v.at : true,
    };
  }

  static async setCfg(c: Partial<Cfg>): Promise<void> {
    const cur = await Store.cfg();
    await chrome.storage.local.set({ [Key.CFG]: { ...cur, ...c } });
  }

  static dump(items: Fav[]): FavExport {
    return {
      app: 'xanimelens',
      version: Export.VERSION,
      exportedAt: new Date().toISOString(),
      items,
    };
  }

  /** 接受 FavExport 或纯 Fav 数组；校验必需字段，非法抛 BAD_IMPORT */
  static parse(text: string): Fav[] {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AppErr(ErrCode.BAD_IMPORT, 'invalid json');
    }
    let raw: unknown[];
    if (Array.isArray(data)) raw = data;
    else if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
      raw = (data as { items: unknown[] }).items;
    } else {
      throw new AppErr(ErrCode.BAD_IMPORT, 'invalid format');
    }
    const items: Fav[] = [];
    for (const r of raw) {
      const f = Store.norm(r);
      if (f) items.push(f);
    }
    if (!items.length) throw new AppErr(ErrCode.BAD_IMPORT, 'no valid items');
    return items;
  }

  /** 导入合并：已存在的 key 不覆盖，返回新增条数 */
  static merge(items: Fav[]): Promise<number> {
    return Store.lock(async () => {
      const m = await Store.all();
      const add = new Map<string, Fav>();
      for (const f of items) if (!Object.prototype.hasOwnProperty.call(m, f.key) && !add.has(f.key)) add.set(f.key, f);
      await Store.set([...add.values()]);
      return add.size;
    });
  }

  /** 收藏主键：有 AniList ID 用 ID（兼容旧数据），否则用 Bangumi ID 或作品名 */
  static key(r: Recog): string {
    if (r.hit) return String(r.hit.anilist.id);
    if (r.bgm) return FavKey.BGM + r.bgm.id;
    return FavKey.WORK + r.work;
  }

  static toFav(r: Recog, tweetUrl: string): Fav {
    const a = r.hit?.anilist;
    const b = r.bgm;
    const native = b?.name || a?.title.native || r.work || '';
    const title =
      b?.name_cn || a?.title.chinese || native || a?.title.romaji || a?.title.english || r.work || '';
    const cover = b?.images?.common || b?.images?.large || a?.coverImage?.large || '';
    const m = Metas.of(r);
    return {
      key: Store.key(r),
      anilistId: a?.id ?? 0,
      bgmId: b?.id ?? null,
      title,
      native,
      cover,
      episode: r.hit?.episode == null ? '' : String(r.hit.episode),
      at: r.hit ? (r.hit.at ?? r.hit.from) : 0,
      similarity: r.hit?.similarity ?? 0,
      tweetUrl,
      savedAt: new Date().toISOString(),
      note: '',
      kind: m.kind,
      genres: m.genres,
      srcs: [...r.srcs],
      chars: [...r.chars],
    };
  }

  private static norm(r: unknown): Fav | null {
    if (!r || typeof r !== 'object') return null;
    const o = r as Record<string, unknown>;
    const key = typeof o.key === 'string' && o.key ? o.key : '';
    if (!key || typeof o.anilistId !== 'number' || !Number.isFinite(o.anilistId)) return null;
    if (typeof o.title !== 'string') return null;
    return {
      key,
      anilistId: o.anilistId,
      bgmId: typeof o.bgmId === 'number' ? o.bgmId : null,
      title: o.title,
      native: typeof o.native === 'string' ? o.native : '',
      cover: typeof o.cover === 'string' ? o.cover : '',
      episode: typeof o.episode === 'string' ? o.episode : o.episode == null ? '' : String(o.episode),
      at: typeof o.at === 'number' ? o.at : 0,
      similarity: typeof o.similarity === 'number' ? o.similarity : 0,
      tweetUrl: typeof o.tweetUrl === 'string' ? o.tweetUrl : '',
      savedAt: typeof o.savedAt === 'string' && o.savedAt ? o.savedAt : new Date().toISOString(),
      note: typeof o.note === 'string' ? o.note : '',
      kind: typeof o.kind === 'string' ? o.kind : '',
      genres: Store.strs(o.genres),
      // 0.2.0 及之前的收藏都来自 trace.moe
      srcs: Array.isArray(o.srcs) ? Store.strs(o.srcs) : [Src.TM],
      chars: Store.strs(o.chars),
    };
  }

  private static strs(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string') : [];
  }

  /** 局部更新条目字段；条目不存在则忽略 */
  static patch(key: string, p: Partial<Fav>): Promise<void> {
    return Store.lock(async () => {
      const f = await Store.one(key);
      if (f) await Store.set([{ ...f, ...p, key }]);
    });
  }
}
