import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeTrace } from '../src/api/animetrace';
import { Bangumi } from '../src/api/bangumi';
import { TraceMoe } from '../src/api/tracemoe';
import { Matcher } from '../src/core/match';
import { Recognizer } from '../src/core/recognize';
import { ErrCode, Src } from '../src/shared/consts';
import { AppErr } from '../src/shared/err';
import type { AtResp, BgmSubject, Cfg, Recog, TmHit, TmResp } from '../src/shared/types';

const cfg: Cfg = { tmKey: '', minSim: 0.87, bgmToken: '', at: true };
const img = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });

// 实测：trace.moe 命中第二季，AnimeTrace 给出系列名（第一季名）
const hit = {
  anilist: { id: 21034, title: { native: 'ご注文はうさぎですか？？' }, isAdult: false, startDate: { year: 2015, month: 10 } },
  similarity: 0.99,
  episode: 1,
  from: 1,
  to: 2,
  filename: '',
  video: 'v',
  image: 'i',
} as TmHit;
const s2: BgmSubject = { id: 123568, name: 'ご注文はうさぎですか？？', name_cn: '请问您今天要来点兔子吗？？', date: '2015-10-10' };
const s1: BgmSubject = { id: 88287, name: 'ご注文はうさぎですか？', name_cn: '请问您今天要来点兔子吗？', date: '2014-04-10' };
const kon: BgmSubject = { id: 1424, name: 'けいおん！', name_cn: '轻音少女', date: '2009-04-02' };

const tm = (result: TmHit[]): TmResp => ({ error: '', result, quota: 100, quotaUsed: 1 });
const at = (pairs: [string, string, boolean?][]): AtResp => ({
  code: 0,
  ai: false,
  data: pairs.map(([work, character, unsure]) => ({ box: [0, 0, 1, 1], not_confident: !!unsure, character: [{ work, character }] })),
});

function bgm(): void {
  vi.spyOn(Bangumi, 'search').mockImplementation(async (kw: string) => {
    if (kw.startsWith('けいおん')) return [kon];
    return [s1, s2];
  });
  vi.spyOn(Bangumi, 'subject').mockImplementation(async (id: number) => [s1, s2, kon].find((s) => s.id === id)!);
}

afterEach(() => vi.restoreAllMocks());

describe('Recognizer 多来源合并', () => {
  it('同系列合并到 trace.moe 结果：保留第二季，追加来源与角色', async () => {
    bgm();
    vi.spyOn(TraceMoe, 'search').mockResolvedValue(tm([hit]));
    vi.spyOn(AnimeTrace, 'search').mockResolvedValue(at([['ご注文はうさぎですか？', '天々座理世']]));
    const out = await Recognizer.run(img, cfg);
    expect(out.items).toHaveLength(1);
    const r = out.items[0];
    expect(r.bgm?.id).toBe(123568);
    expect(r.srcs).toEqual([Src.TM, Src.AT]);
    expect(r.chars).toEqual(['天々座理世']);
    expect(out.errs).toEqual([]);
  });

  it('不同作品单独成条（仅角色识别，hit 为 null）', async () => {
    bgm();
    vi.spyOn(TraceMoe, 'search').mockResolvedValue(tm([hit]));
    vi.spyOn(AnimeTrace, 'search').mockResolvedValue(at([['けいおん！', '平沢唯', true]]));
    const out = await Recognizer.run(img, cfg);
    expect(out.items).toHaveLength(2);
    const r = out.items[1];
    expect(r.hit).toBeNull();
    expect(r.bgm?.id).toBe(1424);
    expect(r.srcs).toEqual([Src.AT]);
    expect(r.unsure).toBe(true);
  });

  it('trace.moe 失败但 AnimeTrace 有结果：降级展示并记录错误', async () => {
    bgm();
    vi.spyOn(TraceMoe, 'search').mockRejectedValue(new AppErr(ErrCode.QUOTA));
    vi.spyOn(AnimeTrace, 'search').mockResolvedValue(at([['けいおん！', '平沢唯']]));
    const out = await Recognizer.run(img, cfg);
    expect(out.items.map((r) => r.bgm?.id)).toEqual([1424]);
    expect(out.errs).toEqual([{ src: Src.TM, code: ErrCode.QUOTA, msg: ErrCode.QUOTA }]);
  });

  it('两边都没有结果时抛出 trace.moe 的错误', async () => {
    vi.spyOn(TraceMoe, 'search').mockRejectedValue(new AppErr(ErrCode.NETWORK, 'x'));
    vi.spyOn(AnimeTrace, 'search').mockRejectedValue(new AppErr(ErrCode.QUOTA));
    await expect(Recognizer.run(img, cfg)).rejects.toMatchObject({ code: ErrCode.NETWORK });
  });

  it('AnimeTrace 失败不影响 trace.moe 结果', async () => {
    bgm();
    vi.spyOn(TraceMoe, 'search').mockResolvedValue(tm([hit]));
    vi.spyOn(AnimeTrace, 'search').mockRejectedValue(new AppErr(ErrCode.QUOTA));
    const out = await Recognizer.run(img, cfg);
    expect(out.items).toHaveLength(1);
    expect(out.errs[0].src).toBe(Src.AT);
  });

  it('关闭 AnimeTrace 时不调用', async () => {
    bgm();
    vi.spyOn(TraceMoe, 'search').mockResolvedValue(tm([hit]));
    const spy = vi.spyOn(AnimeTrace, 'search');
    await Recognizer.run(img, { ...cfg, at: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Matcher.same / byName', () => {
  const r = { hit, bgm: s2, srcs: [Src.TM], chars: [], work: '', unsure: false } as Recog;
  it('系列名与续作名视为同一作品', () => {
    expect(Matcher.same('ご注文はうさぎですか？', r)).toBe(true);
    expect(Matcher.same('けいおん！', r)).toBe(false);
  });
  it('过短的名字不做前缀匹配', () => {
    expect(Matcher.same('ご注', r)).toBe(false);
  });
  it('byName：名字相等优先，无匹配返回 null', () => {
    expect(Matcher.byName('けいおん！', [s1, kon])?.id).toBe(1424);
    expect(Matcher.byName('轻音少女', [s1, kon])?.id).toBe(1424);
    expect(Matcher.byName('完全不相关的作品', [s1, kon])).toBeNull();
  });
});
