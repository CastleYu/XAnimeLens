import { describe, expect, it } from 'vitest';
import { Metas } from '../src/core/meta';
import type { BgmSubject, Recog, TmAnilist, TmHit } from '../src/shared/types';

// 实测数据：《请问您今天要来点兔子吗？？》（AniList 21034 / Bangumi 123568）
const A: TmAnilist = {
  id: 21034,
  title: { native: 'ご注文はうさぎですか？？' },
  format: 'TV',
  genres: ['Slice of Life'],
  season: 'FALL',
  seasonYear: 2015,
  episodes: 12,
  source: 'MANGA',
  duration: 23,
  isAdult: false,
  studios: {
    edges: [
      { isMain: true, node: { name: 'WHITE FOX' } },
      { isMain: true, node: { name: 'Kinema Citrus' } },
      { isMain: false, node: { name: 'Houbunsha' } },
    ],
  },
};
const B: BgmSubject = {
  id: 123568,
  name: 'ご注文はうさぎですか？？',
  name_cn: '请问您今天要来点兔子吗？？',
  date: '2015-10-10',
  platform: 'TV',
  meta_tags: ['TV', '日本', '漫画改', '萌系', '日常'],
  total_episodes: 12,
  infobox: [
    { key: '导演', value: '橋本裕之' },
    { key: '动画制作', value: 'WHITE FOX' },
  ],
};
const R = (a: TmAnilist, b: BgmSubject | null): Recog => ({ hit: { anilist: a } as TmHit, bgm: b });

describe('Metas.of', () => {
  it('合并 AniList 与 Bangumi', () => {
    expect(Metas.of(R(A, B))).toEqual({
      kind: 'TV动画',
      air: '2015年秋',
      eps: '共12集 · 每集23分钟',
      src: '漫画改',
      adult: false,
      genres: ['萌系', '日常'],
      studio: 'WHITE FOX / Kinema Citrus',
      staff: '橋本裕之',
    });
  });

  it('无 Bangumi 时用 AniList 兜底并翻译体裁', () => {
    const m = Metas.of(R({ ...A, genres: ['Action', 'Sci-Fi'] }, null));
    expect(m.kind).toBe('TV动画');
    expect(m.genres).toEqual(['动作', '科幻']);
    expect(m.staff).toBe('');
  });

  it('剧场版：不显示“共1集”，时长单独显示', () => {
    const m = Metas.of(R({ ...A, format: 'MOVIE', episodes: 1, duration: 105, season: null }, null));
    expect(m.kind).toBe('剧场版');
    expect(m.eps).toBe('105分钟');
    expect(m.air).toBe('2015年');
  });

  it('infobox 数组值与制作公司兜底', () => {
    const b: BgmSubject = { ...B, infobox: [{ key: '动画制作', value: [{ v: 'A社' }, { v: 'B社' }] }] };
    expect(Metas.of(R({ ...A, studios: null }, b)).studio).toBe('A社 / B社');
  });
});
