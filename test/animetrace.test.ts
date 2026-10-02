import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, AtDef, AtFile, ErrCode } from '../src/shared/consts';
import { AppErr } from '../src/shared/err';
import { AnimeTrace } from '../src/api/animetrace';
import type { AtBox, AtResp } from '../src/shared/types';

const img = (type = 'image/png') => new Blob(['x'], { type });

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const box = (work: string, character: string, not_confident = false): AtBox => ({
  box: [],
  not_confident,
  character: [{ work, character }],
});

afterEach(() => vi.unstubAllGlobals());

describe('AnimeTrace.search', () => {
  it('成功（code 0）：POST 图片并按约定构造 FormData', async () => {
    const body: AtResp = { code: 0, ai: false, trace_id: 't', data: [] };
    const spy = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal('fetch', spy);

    const blob = img();
    const out = await AnimeTrace.search(blob);

    expect(out).toEqual(body);
    expect(spy).toHaveBeenCalledOnce();
    const [url, opt] = spy.mock.calls[0];
    expect(url).toBe(Api.AT_SEARCH);
    expect(opt.method).toBe('POST');
    expect(opt.headers).toBeUndefined();
    const fd = opt.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get(AtDef.MULTI)).toBe(AtDef.ON);
    expect(fd.get(AtDef.AI)).toBe(AtDef.OFF);
    expect((fd.get(AtDef.FILE) as File).name).toBe(AtFile.NAME);
    expect(fd.has('model')).toBe(false);
  });

  it('成功（code 17720）同样返回', async () => {
    const body: AtResp = { code: 17720, data: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    await expect(AnimeTrace.search(img())).resolves.toEqual(body);
  });

  it('空 data 属成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 0 })));
    const out = await AnimeTrace.search(img());
    expect(out.data).toBeUndefined();
  });

  it('code 17728 → QUOTA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 17728 })));
    await expect(AnimeTrace.search(img())).rejects.toMatchObject({ code: ErrCode.QUOTA });
  });

  it('HTTP 429 → QUOTA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(AnimeTrace.search(img())).rejects.toMatchObject({ code: ErrCode.QUOTA });
  });

  it('其它错误码 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 1 })));
    const p = AnimeTrace.search(img());
    await expect(p).rejects.toBeInstanceOf(AppErr);
    await expect(p).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });

  it('解析失败且 HTTP 非 2xx → NETWORK HTTP 状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 413 })));
    await expect(AnimeTrace.search(img())).rejects.toMatchObject({
      code: ErrCode.NETWORK,
      message: 'HTTP 413',
    });
  });

  it('fetch 抛错 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(AnimeTrace.search(img())).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });
});

describe('AnimeTrace.group', () => {
  it('缺省 data → []', () => {
    expect(AnimeTrace.group({ code: 0 })).toEqual([]);
  });

  it('按作品聚合并保持首次出现顺序，chars 去重保序', () => {
    const r: AtResp = {
      code: 0,
      data: [
        box('A', 'x', false),
        box('B', 'y', true),
        box('A', 'x', true),
        box('A', 'z', true),
      ],
    };
    expect(AnimeTrace.group(r)).toEqual([
      { work: 'A', chars: ['x', 'z'], unsure: false },
      { work: 'B', chars: ['y'], unsure: true },
    ]);
  });

  it('同一作品全部 not_confident → unsure=true；有一个确信 → false', () => {
    const all: AtResp = { code: 0, data: [box('A', 'x', true), box('A', 'y', true)] };
    expect(AnimeTrace.group(all)).toEqual([{ work: 'A', chars: ['x', 'y'], unsure: true }]);

    const one: AtResp = { code: 0, data: [box('A', 'x', true), box('A', 'y', false)] };
    expect(AnimeTrace.group(one)[0].unsure).toBe(false);
  });

  it('work trim 后聚合；候选为空或 work/character 为空则跳过', () => {
    const r: AtResp = {
      code: 0,
      data: [
        { box: [], not_confident: false, character: [] },
        { box: [], not_confident: false, character: [{ work: '', character: 'x' }] },
        { box: [], not_confident: false, character: [{ work: 'A', character: '' }] },
        { box: [], not_confident: false, character: [{ work: '  ', character: 'x' }] },
        box('A ', 'x', false),
        box('A', 'y', false),
      ],
    };
    expect(AnimeTrace.group(r)).toEqual([{ work: 'A', chars: ['x', 'y'], unsure: false }]);
  });
});
