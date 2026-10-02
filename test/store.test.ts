import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/core/store';
import { AppErr } from '../src/shared/err';
import { Def, ErrCode, Export, Key } from '../src/shared/consts';
import type { Fav, Recog } from '../src/shared/types';

interface Mem {
  storage: {
    local: {
      get: (k: string) => Promise<Record<string, unknown>>;
      set: (o: Record<string, unknown>) => Promise<void>;
    };
  };
}

function mem(): Mem {
  const data: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: (k: string) => Promise.resolve(k in data ? { [k]: data[k] } : {}),
        set: (o: Record<string, unknown>) => {
          Object.assign(data, o);
          return Promise.resolve();
        },
      },
    },
  };
}

const F = (key: string, savedAt: string, title = key): Fav => ({
  key,
  anilistId: Number(key),
  bgmId: null,
  title,
  native: '',
  cover: '',
  episode: '',
  at: 0,
  similarity: 0.9,
  kind: '',
  genres: [],
  tweetUrl: '',
  savedAt,
  note: '',
});

beforeEach(() => {
  vi.stubGlobal('chrome', mem());
});

describe('Store 基本操作', () => {
  it('add / has / list 按 savedAt 倒序', async () => {
    await Store.add(F('1', '2024-01-01T00:00:00.000Z'));
    await Store.add(F('2', '2025-01-01T00:00:00.000Z'));
    expect(await Store.has('1')).toBe(true);
    expect(await Store.has('9')).toBe(false);
    expect((await Store.list()).map((f) => f.key)).toEqual(['2', '1']);
  });

  it('add 覆盖同 key', async () => {
    await Store.add(F('1', '2024-01-01T00:00:00.000Z', 'old'));
    await Store.add(F('1', '2024-02-01T00:00:00.000Z', 'new'));
    const list = await Store.list();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('new');
  });

  it('del 删除', async () => {
    await Store.add(F('1', '2024-01-01T00:00:00.000Z'));
    await Store.del('1');
    expect(await Store.has('1')).toBe(false);
    expect(await Store.list()).toEqual([]);
  });

  it('note 保存备注', async () => {
    await Store.add(F('1', '2024-01-01T00:00:00.000Z'));
    await Store.note('1', '好看');
    expect((await Store.list())[0].note).toBe('好看');
  });
});

describe('Store 配置', () => {
  it('cfg 默认值补全', async () => {
    expect(await Store.cfg()).toEqual({ tmKey: '', minSim: Def.MIN_SIM, bgmToken: '' });
  });

  it('setCfg 部分更新并保留其余默认', async () => {
    await Store.setCfg({ tmKey: 'abc' });
    const c = await Store.cfg();
    expect(c.tmKey).toBe('abc');
    expect(c.minSim).toBe(Def.MIN_SIM);
    expect(c.bgmToken).toBe('');
  });
});

describe('Store 导入导出', () => {
  it('dump → parse 往返', () => {
    const items = [F('1', '2024-01-01T00:00:00.000Z', 'a')];
    const out = Store.dump(items);
    expect(out.app).toBe('xanimelens');
    expect(out.version).toBe(Export.VERSION);
    expect(Store.parse(JSON.stringify(out))).toEqual(items);
  });

  it('parse 接受纯数组并补默认值', () => {
    const items = Store.parse(JSON.stringify([{ key: '5', anilistId: 5, title: 't' }]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: '5', anilistId: 5, title: 't', bgmId: null, note: '' });
    expect(items[0].savedAt).toMatch(/^\d{4}-/);
  });

  it('parse 非法 JSON 抛 BAD_IMPORT', () => {
    let code: ErrCode | null = null;
    try {
      Store.parse('{');
    } catch (e) {
      code = (e as AppErr).code;
    }
    expect(code).toBe(ErrCode.BAD_IMPORT);
    expect(() => Store.parse('{')).toThrow(AppErr);
  });

  it('parse 无有效条目抛 BAD_IMPORT', () => {
    expect(() => Store.parse(JSON.stringify({ app: 'xanimelens', items: [{ key: 1 }] }))).toThrow(AppErr);
    expect(() => Store.parse('{"app":"xanimelens"}')).toThrow(AppErr);
  });

  it('merge 不覆盖已存在并返回新增数', async () => {
    await Store.add(F('1', '2024-01-01T00:00:00.000Z', 'old'));
    const n = await Store.merge([
      F('1', '2025-01-01T00:00:00.000Z', 'new'),
      F('2', '2025-01-01T00:00:00.000Z'),
    ]);
    expect(n).toBe(1);
    const list = await Store.list();
    expect(list).toHaveLength(2);
    expect(list.find((f) => f.key === '1')!.title).toBe('old');
  });
});

describe('Store.toFav', () => {
  it('字段映射与回退', () => {
    const r = {
      hit: {
        anilist: {
          id: 42,
          title: { native: 'JP', romaji: 'R', chinese: 'CN', english: 'EN' },
          isAdult: false,
          coverImage: { large: 'cov' },
        },
        filename: '',
        episode: 3,
        from: 12.5,
        to: 30,
        similarity: 0.91,
        video: '',
        image: '',
      },
      bgm: { id: 7, name: 'bgm native', name_cn: '中文名', images: { common: 'bgm cov' } },
    } as unknown as Recog;
    const f = Store.toFav(r, 'https://x.com/a/status/1');
    expect(f.key).toBe('42');
    expect(f.anilistId).toBe(42);
    expect(f.bgmId).toBe(7);
    expect(f.title).toBe('中文名');
    expect(f.native).toBe('bgm native');
    expect(f.cover).toBe('bgm cov');
    expect(f.episode).toBe('3');
    expect(f.at).toBe(12.5);
    expect(f.similarity).toBe(0.91);
    expect(f.tweetUrl).toBe('https://x.com/a/status/1');
    expect(f.note).toBe('');
    expect(f.savedAt).toMatch(/T/);
  });

  it('无 bgm 时回退', () => {
    const r = {
      hit: {
        anilist: { id: 9, title: { native: 'JP' }, isAdult: false },
        filename: '',
        episode: null,
        from: 1,
        to: 2,
        similarity: 0.5,
        video: '',
        image: '',
      },
      bgm: null,
    } as unknown as Recog;
    const f = Store.toFav(r, '');
    expect(f.title).toBe('JP');
    expect(f.native).toBe('JP');
    expect(f.cover).toBe('');
    expect(f.episode).toBe('');
    expect(f.at).toBe(1);
    expect(f.bgmId).toBeNull();
  });
});

describe('Store 兼容旧数据', () => {
  it('旧版收藏缺少 kind/genres 时补默认值', async () => {
    const c = mem();
    vi.stubGlobal('chrome', c);
    const old = { key: '7', anilistId: 7, bgmId: null, title: 'old', savedAt: '2026-01-01T00:00:00.000Z' };
    await c.storage.local.set({ [Key.FAVS]: { '7': old } });
    const [f] = await Store.list();
    expect(f.kind).toBe('');
    expect(f.genres).toEqual([]);
    expect(f.title).toBe('old');
  });
});
