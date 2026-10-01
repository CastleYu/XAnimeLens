import { describe, expect, it } from 'vitest';
import { Matcher } from '../src/core/match';
import { Score } from '../src/shared/consts';
import type { BgmSubject, TmAnilist } from '../src/shared/types';

const anilist = (over: Partial<TmAnilist> = {}): TmAnilist => ({
  id: 1,
  title: {},
  isAdult: false,
  ...over,
});

describe('Matcher.keywords', () => {
  it('优先级 native > chinese > romaji > english，且去重去空', () => {
    const a = anilist({
      title: { native: 'A', chinese: '甲', romaji: 'A', english: 'B' },
    });
    expect(Matcher.keywords(a)).toEqual(['A', '甲', 'B']);
  });

  it('忽略空白词', () => {
    const a = anilist({ title: { native: '  ', romaji: '', english: 'E' } });
    expect(Matcher.keywords(a)).toEqual(['E']);
  });
});

describe('Matcher.score', () => {
  it('完全相等 +50，年月相同再 +40', () => {
    const a = anilist({
      title: { native: 'ご注文はうさぎですか？？' },
      startDate: { year: 2015, month: 10 },
    });
    const s: BgmSubject = { id: 115908, name: 'ご注文はうさぎですか？？', name_cn: '', date: '2015-10-10' };
    expect(Matcher.score(a, s)).toBe(Score.NAME_EQ + Score.YM_EQ);
  });

  it('年份差 >=2 记负分', () => {
    const a = anilist({ title: { native: 'X' }, startDate: { year: 2020, month: 1 } });
    const s: BgmSubject = { id: 9, name: 'X', name_cn: '', date: '2010-01-01' };
    expect(Matcher.score(a, s)).toBe(Score.NAME_EQ + Score.Y_FAR);
  });
});

describe('Matcher.pick（真实数据：点兔第二季）', () => {
  const a: TmAnilist = {
    id: 1,
    title: {
      native: 'ご注文はうさぎですか？？',
      chinese: '請問您今天要來點兔子嗎？？',
    },
    startDate: { year: 2015, month: 10 },
    isAdult: false,
  };
  const list: BgmSubject[] = [
    { id: 88287, name: 'ご注文はうさぎですか？', name_cn: '请问您今天要来点兔子吗？', date: '2014-04-10' },
    { id: 115908, name: 'ご注文はうさぎですか？？', name_cn: '请问您今天要来点兔子吗？？', date: '2015-10-10' },
  ];

  it('第二季（同季）胜出：115908', () => {
    expect(Matcher.pick(a, list)?.id).toBe(115908);
    expect(Matcher.score(a, list[0])).toBe(Score.NAME_EQ);
    expect(Matcher.score(a, list[1])).toBe(Score.NAME_EQ + Score.YM_EQ);
  });

  it('全部低于阈值 → null', () => {
    const far: BgmSubject = { id: 9, name: 'Naruto', name_cn: '火影忍者', date: '2002-10-03' };
    expect(Matcher.pick(a, [far])).toBeNull();
  });

  it('空候选 → null', () => {
    expect(Matcher.pick(a, [])).toBeNull();
  });
});
