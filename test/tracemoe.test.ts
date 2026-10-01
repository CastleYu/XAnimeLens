import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, ErrCode, TmParam } from '../src/shared/consts';
import { AppErr } from '../src/shared/err';
import { TraceMoe } from '../src/api/tracemoe';
import type { TmResp } from '../src/shared/types';

const URL = `${Api.TM_SEARCH}?${TmParam.ANILIST}&${TmParam.CUT}`;
const img = (type = 'image/png') => new Blob(['x'], { type });

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

afterEach(() => vi.unstubAllGlobals());

describe('TraceMoe.search', () => {
  it('POST 图片并按约定构造请求，解析响应', async () => {
    const body: TmResp = { error: '', result: [], quota: 1, quotaUsed: 2 };
    const spy = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal('fetch', spy);

    const blob = img();
    const out = await TraceMoe.search(blob, 'k');

    expect(out).toEqual(body);
    expect(spy).toHaveBeenCalledOnce();
    const [url, opt] = spy.mock.calls[0];
    expect(url).toBe(URL);
    expect(opt.method).toBe('POST');
    expect(opt.body).toBe(blob);
    expect(opt.headers['Content-Type']).toBe('image/png');
    expect(opt.headers[Api.TM_KEY_HEADER]).toBe('k');
  });

  it('无 type 时 Content-Type 回退 image/jpeg；空 key 不加请求头', async () => {
    const spy = vi.fn().mockResolvedValue(json({ error: '', result: [] }));
    vi.stubGlobal('fetch', spy);

    await TraceMoe.search(new Blob(['x']), '');
    const [, opt] = spy.mock.calls[0];
    expect(opt.headers['Content-Type']).toBe('image/jpeg');
    expect(Api.TM_KEY_HEADER in opt.headers).toBe(false);
  });

  it('402 → QUOTA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 402 })));
    await expect(TraceMoe.search(img(), '')).rejects.toMatchObject({ code: ErrCode.QUOTA });
  });

  it('429 → QUOTA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(TraceMoe.search(img(), '')).rejects.toMatchObject({ code: ErrCode.QUOTA });
  });

  it('其它非 2xx → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(TraceMoe.search(img(), '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });

  it('fetch 抛错 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(TraceMoe.search(img(), '')).rejects.toBeInstanceOf(AppErr);
    await expect(TraceMoe.search(img(), '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });

  it('json.error 非空 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'bad' })));
    await expect(TraceMoe.search(img(), '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });
});
