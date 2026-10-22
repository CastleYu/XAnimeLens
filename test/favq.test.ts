import { describe, expect, it } from 'vitest';
import { FavQuery } from '../src/core/favq';
import { ColSort, SrcPick } from '../src/shared/consts';
import type { Fav } from '../src/shared/types';

const F = (key: string, p: Partial<Fav> = {}): Fav => ({
  key,
  anilistId: 0,
  bgmId: null,
  title: key,
  native: '',
  cover: '',
  episode: '',
  at: 0,
  similarity: 0,
  tweetUrl: '',
  savedAt: '2026-01-01T00:00:00.000Z',
  note: '',
  kind: '',
  genres: [],
  srcs: ['tracemoe'],
  chars: [],
  ...p,
});

const items = [
  F('b', { kind: 'TV动画', similarity: 0.9, savedAt: '2026-02-01T00:00:00.000Z' }),
  F('a', { kind: '剧场版', similarity: 0.95, srcs: ['tracemoe', 'animetrace'], savedAt: '2026-01-01T00:00:00.000Z' }),
  F('c', { kind: 'TV动画', srcs: ['animetrace'], chars: ['香风智乃'], savedAt: '2026-03-01T00:00:00.000Z' }),
];
const all = { q: '', kind: '', src: SrcPick.ALL, sort: ColSort.NEW };
const keys = (fs: Fav[]) => fs.map((f) => f.key);

describe('FavQuery', () => {
  it('默认按收藏时间倒序', () => {
    expect(keys(FavQuery.apply(items, all))).toEqual(['c', 'b', 'a']);
  });

  it('排序：最早 / 标题 / 相似度', () => {
    expect(keys(FavQuery.apply(items, { ...all, sort: ColSort.OLD }))).toEqual(['a', 'b', 'c']);
    expect(keys(FavQuery.apply(items, { ...all, sort: ColSort.TITLE }))).toEqual(['a', 'b', 'c']);
    expect(keys(FavQuery.apply(items, { ...all, sort: ColSort.SIM }))).toEqual(['a', 'b', 'c']);
  });

  it('按形式、来源、搜索词筛选', () => {
    expect(keys(FavQuery.apply(items, { ...all, kind: 'TV动画' }))).toEqual(['c', 'b']);
    expect(keys(FavQuery.apply(items, { ...all, src: SrcPick.AT }))).toEqual(['c', 'a']);
    expect(keys(FavQuery.apply(items, { ...all, src: SrcPick.MULTI }))).toEqual(['a']);
    expect(keys(FavQuery.apply(items, { ...all, q: '智乃' }))).toEqual(['c']);
  });

  it('不修改原数组', () => {
    const copy = [...items];
    FavQuery.apply(items, { ...all, sort: ColSort.OLD });
    expect(items).toEqual(copy);
  });

  it('kinds 去重并保持顺序', () => {
    expect(FavQuery.kinds(items)).toEqual(['TV动画', '剧场版']);
  });
});
