import { Def, ErrCode, Export, FavKey, Key, Src } from '../shared/consts';
import { AppErr } from '../shared/err';
import { Metas } from './meta';
import type { Cfg, Fav, FavExport, Recog } from '../shared/types';

/** 本地收藏集与配置，存于 chrome.storage.local。 */
export class Store {
  static async all(): Promise<Record<string, Fav>> {
    const r = await chrome.storage.local.get(Key.FAVS);
    const v = r[Key.FAVS];
    if (!v || typeof v !== 'object') return {};
    // 逐条补齐缺省字段，兼容旧版本存下的数据
    const m: Record<string, Fav> = {};
    for (const [k, o] of Object.entries(v as Record<string, unknown>)) {
      const f = Store.norm(o);
      if (f) m[k] = f;
    }
    return m;
  }

  static async put(m: Record<string, Fav>): Promise<void> {
    await chrome.storage.local.set({ [Key.FAVS]: m });
  }

  /** 按收藏时间(savedAt)倒序 */
  static async list(): Promise<Fav[]> {
    const m = await Store.all();
    return Object.values(m).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  }

  /** 按 key 覆盖 */
  static async add(f: Fav): Promise<void> {
    const m = await Store.all();
    m[f.key] = f;
    await Store.put(m);
  }

  static async del(key: string): Promise<void> {
    const m = await Store.all();
    delete m[key];
    await Store.put(m);
  }

  static async has(key: string): Promise<boolean> {
    const m = await Store.all();
    return Object.prototype.hasOwnProperty.call(m, key);
  }

  static async note(key: string, note: string): Promise<void> {
    const m = await Store.all();
    if (Object.prototype.hasOwnProperty.call(m, key)) {
      m[key].note = note;
      await Store.put(m);
    }
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
  static async merge(items: Fav[]): Promise<number> {
    const m = await Store.all();
    let n = 0;
    for (const f of items) {
      if (!Object.prototype.hasOwnProperty.call(m, f.key)) {
        m[f.key] = f;
        n++;
      }
    }
    await Store.put(m);
    return n;
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
  static async patch(key: string, p: Partial<Fav>): Promise<void> {
    const m = await Store.all();
    if (!Object.prototype.hasOwnProperty.call(m, key)) return;
    m[key] = { ...m[key], ...p };
    await Store.put(m);
  }
}
