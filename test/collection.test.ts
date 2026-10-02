import { describe, expect, it } from 'vitest';
import { Backfill } from '../src/core/backfill';
import { BackfillDef } from '../src/shared/consts';
import type { Fav } from '../src/shared/types';

const F = (key: string, p: Partial<Fav> = {}): Fav => ({
  key,
  anilistId: Number(key) || 0,
  bgmId: null,
  title: key,
  native: '',
  cover: '',
  episode: '',
  at: 0,
  similarity: 0.9,
  tweetUrl: '',
  savedAt: '2026-01-01T00:00:00.000Z',
  note: '',
  kind: '',
  genres: [],
  srcs: ['tracemoe'],
  chars: [],
  ...p,
});

describe('Backfill.pick', () => {
  it('挑出缺 kind/genres 且有 bgmId 的条目并保持顺序', () => {
    const items = [
      F('1', { bgmId: 10 }),
      F('2', { bgmId: 20, kind: 'TV动画' }),
      F('3', { bgmId: 30, genres: ['日常'] }),
      F('4', { bgmId: null }),
      F('5', { bgmId: 50 }),
    ];
    expect(Backfill.pick(items).map((f) => f.key)).toEqual(['1', '5']);
  });

  it('最多返回 max 条', () => {
    const items = Array.from({ length: 25 }, (_, i) => F(String(i), { bgmId: i + 1 }));
    expect(Backfill.pick(items, 3)).toHaveLength(3);
  });

  it('默认上限为 BackfillDef.MAX', () => {
    const items = Array.from({ length: 25 }, (_, i) => F(String(i), { bgmId: i + 1 }));
    expect(Backfill.pick(items)).toHaveLength(BackfillDef.MAX);
  });
});
