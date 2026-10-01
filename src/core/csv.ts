import type { Fav } from '../shared/types';

/** 收藏集 CSV 序列化。 */
export class Csv {
  static readonly cols = [
    'key',
    'anilistId',
    'bgmId',
    'title',
    'native',
    'episode',
    'at',
    'similarity',
    'tweetUrl',
    'savedAt',
    'note',
    'cover',
  ] as const;

  static of(items: Fav[]): string {
    const rows = [Csv.cols.join(',')];
    for (const f of items) {
      rows.push(Csv.cols.map((c) => Csv.esc(f[c])).join(','));
    }
    return '\uFEFF' + rows.join('\n');
  }

  private static esc(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
}
