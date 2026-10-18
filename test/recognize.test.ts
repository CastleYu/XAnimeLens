import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrCode, Svr, SvrState } from '../src/shared/consts';
import { Recognizer } from '../src/core/recognize';
import { Health } from '../src/core/svrs';
import type { BgmSubject, Cfg, RecogResult, SvrStat, TmHit } from '../src/shared/types';

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

afterEach(() => {
  vi.unstubAllGlobals();
  Health.reset();
});

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

const state = (list: SvrStat[], s: Svr) => list.find((x) => x.svr === s)!.state;

describe('Recognizer.stream 服务状态与 Bangumi 异步补全', () => {
  it('Bangumi 未返回前先推送 trace.moe 结果，返回后再补全', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.99)] });
      if (isSearch(url)) return json({ data: [{ id: 101, name: 'N', name_cn: '中文' }] });
      if (isSubject(url)) return json({ id: 101, name: 'N', name_cn: '中文' });
      throw new Error('unexpected ' + url);
    });
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (isSearch(url)) await gate; // Bangumi 卡住
      return real(url, init);
    });
    const seen: RecogResult[] = [];
    const run = Recognizer.stream(img(), cfg, (r) => void seen.push(r));
    await vi.waitFor(() => expect(seen.some((r) => r.items.length)).toBe(true));
    const first = seen.find((r) => r.items.length)!;
    expect(first.items[0].bgm).toBeNull();
    expect(state(first.svrs, Svr.TM)).toBe(SvrState.OK);
    expect(state(first.svrs, Svr.BGM)).toBe(SvrState.WAIT);
    release();
    await run;
    const last = seen.at(-1)!;
    expect(last.items[0].bgm?.id).toBe(101);
    expect(state(last.svrs, Svr.BGM)).toBe(SvrState.OK);
  });

  it('Bangumi 故障：标记不可用，熔断后不再重复请求', async () => {
    const fn = mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [hit(1, 0.99, 'A'), hit(2, 0.98, 'B')] });
      if (isSearch(url)) return new Response('', { status: 503 });
      throw new Error('unexpected ' + url);
    });
    const out = await Recognizer.run(img(), cfg);
    expect(out.items).toHaveLength(2);
    expect(state(out.svrs, Svr.BGM)).toBe(SvrState.FAIL);
    expect(state(out.svrs, Svr.TM)).toBe(SvrState.OK);
    expect(state(out.svrs, Svr.AL)).toBe(SvrState.OK);
    expect(state(out.svrs, Svr.AT)).toBe(SvrState.OFF);
    expect(Health.down(Svr.BGM)).toBe(true);
    // 冷却期内再识别：Bangumi 不再发请求
    const before = fn.mock.calls.filter(([u]) => isSearch(u)).length;
    await Recognizer.run(img(), cfg);
    expect(fn.mock.calls.filter(([u]) => isSearch(u)).length).toBe(before);
  });

  it('trace.moe 未返回 AniList 信息时 AniList 标为不可用，结果仍可展示', async () => {
    mockFetch((url) => {
      if (isTm(url)) return json({ error: '', result: [{ ...hit(1, 0.99), anilist: 1 }] });
      if (isSearch(url)) return json({ data: [] });
      throw new Error('unexpected ' + url);
    });
    const out = await Recognizer.run(img(), cfg);
    expect(out.items[0].hit!.anilist.id).toBe(1);
    expect(state(out.svrs, Svr.AL)).toBe(SvrState.FAIL);
  });

  it('trace.moe 失败时 AniList 为未请求', async () => {
    mockFetch(() => {
      throw new Error('down');
    });
    const seen: RecogResult[] = [];
    await expect(Recognizer.stream(img(), cfg, (r) => void seen.push(r))).rejects.toBeTruthy();
    const last = seen.at(-1)!;
    expect(state(last.svrs, Svr.TM)).toBe(SvrState.FAIL);
    expect(state(last.svrs, Svr.AL)).toBe(SvrState.OFF);
  });
});
