import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api, ErrCode, Svr } from '../src/shared/consts';
import { Health } from '../src/core/svrs';
import { Bangumi } from '../src/api/bangumi';
import type { BgmSubject } from '../src/shared/types';

const SEARCH_URL = `${Api.BGM_BASE}${Api.BGM_SEARCH}?limit=${Api.BGM_LIMIT}`;
const SUBJECT_URL = `${Api.BGM_BASE}${Api.BGM_SUBJECT}`;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

afterEach(() => {
  vi.unstubAllGlobals();
  Health.reset();
});

describe('Bangumi.search', () => {
  it('POST 关键词，返回 data 数组，带 token', async () => {
    const data: BgmSubject[] = [{ id: 115908, name: 'ご注文はうさぎですか？？', name_cn: '请问您今天要来点兔子吗？？' }];
    const spy = vi.fn().mockResolvedValue(json({ data }));
    vi.stubGlobal('fetch', spy);

    const out = await Bangumi.search('关键词', 'tok');

    expect(out).toEqual(data);
    const [url, opt] = spy.mock.calls[0];
    expect(url).toBe(SEARCH_URL);
    expect(opt.method).toBe('POST');
    expect(opt.headers['Authorization']).toBe('Bearer tok');
    expect(JSON.parse(opt.body)).toEqual({ keyword: '关键词', filter: { type: [Api.BGM_ANIME_TYPE] } });
  });

  it('无 token 不带 Authorization，缺 data 返回空数组', async () => {
    const spy = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal('fetch', spy);
    const out = await Bangumi.search('k', '');
    expect(out).toEqual([]);
    expect('Authorization' in spy.mock.calls[0][1].headers).toBe(false);
  });

  it('失败 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(Bangumi.search('k', '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });
});

describe('Bangumi.subject', () => {
  it('GET 条目，带 token', async () => {
    const s: BgmSubject = { id: 5, name: 'N', name_cn: 'n' };
    const spy = vi.fn().mockResolvedValue(json(s));
    vi.stubGlobal('fetch', spy);

    const out = await Bangumi.subject(5, 'tok');

    expect(out).toEqual(s);
    const [url, opt] = spy.mock.calls[0];
    expect(url).toBe(`${SUBJECT_URL}5`);
    expect(opt.method).toBe('GET');
    expect(opt.headers['Authorization']).toBe('Bearer tok');
  });

  it('失败 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    await expect(Bangumi.subject(5, '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });
});

describe('Bangumi 熔断', () => {
  it('5xx 后冷却期内直接失败，不再请求', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    vi.stubGlobal('fetch', spy);
    await expect(Bangumi.subject(1, '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
    expect(Health.down(Svr.BGM)).toBe(true);
    await expect(Bangumi.search('k', '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('404 只是条目不存在，不触发熔断', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(Bangumi.subject(1, '')).rejects.toMatchObject({ code: ErrCode.NETWORK });
    expect(Health.down(Svr.BGM)).toBe(false);
  });

  it('请求带超时信号', async () => {
    const spy = vi.fn().mockResolvedValue(json({ id: 1, name: '', name_cn: '' }));
    vi.stubGlobal('fetch', spy);
    await Bangumi.subject(1, '');
    expect(spy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
