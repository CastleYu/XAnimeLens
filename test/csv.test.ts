import { describe, expect, it } from 'vitest';
import { Csv } from '../src/core/csv';
import type { Fav } from '../src/shared/types';

const F = (over: Partial<Fav> = {}): Fav => ({
  key: '1',
  anilistId: 1,
  bgmId: 2,
  title: 't',
  native: 'n',
  cover: '',
  episode: '1',
  at: 10,
  similarity: 0.9,
  tweetUrl: '',
  savedAt: '2024-01-01T00:00:00.000Z',
  note: '',
  ...over,
});

describe('Csv.of', () => {
  it('带 BOM 与表头', () => {
    const out = Csv.of([]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain(
      'key,anilistId,bgmId,title,native,episode,at,similarity,tweetUrl,savedAt,note,cover',
    );
  });

  it('字段顺序与空值', () => {
    const out = Csv.of([F({ title: 'x', episode: '3', at: 12, similarity: 0.5 })]);
    const rows = out.split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe('1,1,2,x,n,3,12,0.5,,2024-01-01T00:00:00.000Z,,');
  });

  it('转义逗号 / 引号 / 换行', () => {
    const out = Csv.of([F({ title: 'a,b', native: 'say "hi"', note: 'l1\nl2' })]);
    expect(out).toContain('"a,b"');
    expect(out).toContain('"say ""hi"""');
    expect(out).toContain('"l1\nl2"');
  });

  it('一行一条', () => {
    const out = Csv.of([F(), F({ key: '2', anilistId: 2 })]);
    expect(out.split('\n')).toHaveLength(3);
  });
});
