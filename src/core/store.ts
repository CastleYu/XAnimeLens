import { Def, ErrCode, Export, Key } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { Cfg, Fav, FavExport, Recog } from '../shared/types';

/** 本地收藏集与配置，存于 chrome.storage.local。 */
export class Store {
  static async all(): Promise<Record<string, Fav>> {
    const r = await chrome.storage.local.get(Key.FAVS);
    const v = r[Key.FAVS];
    return v && typeof v === 'object' ? (v as Record<string, Fav>) : {};
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

  static toFav(r: Recog, tweetUrl: string): Fav {
    const a = r.hit.anilist;
    const b = r.bgm;
    const native = b?.name || a.title.native || '';
    const title = b?.name_cn || a.title.chinese || native || a.title.romaji || a.title.english || '';
    const cover = b?.images?.common || b?.images?.large || a.coverImage?.large || '';
    return {
      key: String(a.id),
      anilistId: a.id,
      bgmId: b?.id ?? null,
      title,
      native,
      cover,
      episode: r.hit.episode == null ? '' : String(r.hit.episode),
      at: r.hit.at ?? r.hit.from,
      similarity: r.hit.similarity,
      tweetUrl,
      savedAt: new Date().toISOString(),
      note: '',
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
    };
  }
}
