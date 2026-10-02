import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrCode } from '../src/shared/consts';
import { Recognizer } from '../src/core/recognize';
import type { BgmSubject, Cfg, TmHit } from '../src/shared/types';

const cfg: Cfg = { tmKey: '', minSim: 0.9, bgmToken: '', at: false };

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const hit = (id: number, similarity: number, title = 'N'): TmHit => ({
  anilist: { id, title: { native: title }, isAdult: false },
  filename: '',
  episode: 1,
  from: 0,
  to: 0,
  similarity,
  video: '',
  image: '',
});

const isTm = (u: string) => u.includes('trace.moe');
const isSearch = (u: string) => u.includes('/v0/search/subjects');
const isSubject = (u: string) => u.includes('/v0/subjects/');

/** handler 抛错即模拟网络异常 */
const mockFetch = (handler: (url: string) => Response) => {
  const fn = vi.fn(async (url: string) => handler(url));
  vi.stubGlobal('fetch', fn);
  return fn;
};

const img = () => new Blob(['x'], { type: 'image/jpeg' });

afterEach(() => vi.unstubAllGlobals());

describe('Recognizer.run', () => {
  it('识别 + Bangumi 补全 + quota 透传', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.99)], quota: 7, quotaUsed: 3 });
      if (isSearch(url)) return json({ data: [{ id: 101, name: 'N', name_cn: '中文' }] });
      if (isSubject(url)) return json({ id: 101, name: 'N', name_cn: '中文', summary: 's' });
      throw new Error('unexpected ' + url);
    });

    const out = await Recognizer.run(img(), cfg);

    expect(out.items).toHaveLength(1);
    expect(out.items[0].hit!.anilist.id).toBe(1);
    expect(out.items[0].bgm?.id).toBe(101);
    expect(out.quota).toBe(7);
    expect(out.quotaUsed).toBe(3);
  });

  it('全部低于 minSim 时保留相似度最高 1 条', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.5), hit(2, 0.6)] });
      if (isSearch(url)) return json({ data: [] });
      throw new Error('unexpected ' + url);
    });

    const out = await Recognizer.run(img(), cfg);

    expect(out.items).toHaveLength(1);
    expect(out.items[0].hit!.similarity).toBe(0.6);
  });

  it('按 AniList ID 去重保留高相似度并取 TOP_N', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.91), hit(1, 0.99), hit(2, 0.97)] });
      if (isSearch(url)) return json({ data: [] });
      throw new Error('unexpected ' + url);
    });

    const out = await Recognizer.run(img(), cfg);

    expect(out.items.map((i) => i.hit!.anilist.id)).toEqual([1, 2]);
    expect(out.items[0].hit!.similarity).toBe(0.99);
  });

  it('Bangumi 异常被吞掉，bgm 置 null，trace.moe 结果仍返回', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.99)] });
      throw new Error('bgm down');
    });

    const out = await Recognizer.run(img(), cfg);

    expect(out.items).toHaveLength(1);
    expect(out.items[0].bgm).toBeNull();
  });

  it('Bangumi pick 不中时 bgm 为 null', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.99, 'N')] });
      if (isSearch(url)) return json({ data: [{ id: 9, name: 'Other', name_cn: '别的' } as BgmSubject] });
      throw new Error('unexpected ' + url);
    });

    const out = await Recognizer.run(img(), cfg);
    expect(out.items[0].bgm).toBeNull();
  });

  it('trace.moe 异常向上抛', async () => {
    mockFetch((url) => {
      if (isTm(url)) throw new Error('tm down');
      throw new Error('unexpected ' + url);
    });

    await expect(Recognizer.run(img(), cfg)).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });
});
