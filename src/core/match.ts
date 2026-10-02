import { Score } from '../shared/consts';
import type { BgmSubject, Recog, TmAnilist } from '../shared/types';

export class Matcher {
  /** 去重后的搜索词，优先级：native > chinese > romaji > english */
  static keywords(a: TmAnilist): string[] {
    const out: string[] = [];
    for (const s of [a.title.native, a.title.chinese, a.title.romaji, a.title.english]) {
      const t = s?.trim();
      if (t && !out.includes(t)) out.push(t);
    }
    return out;
  }

  static score(a: TmAnilist, s: BgmSubject): number {
    const names: (string | null | undefined)[] = [
      a.title.native,
      a.title.romaji,
      a.title.english,
      ...(a.synonyms ?? []),
    ];
    const cns: (string | null | undefined)[] = [a.title.chinese, ...(a.synonyms_chinese ?? [])];

    let nameScore = 0;
    for (const t of names) nameScore = Math.max(nameScore, Matcher.cmp(t, s.name));
    if (s.name_cn) for (const t of cns) nameScore = Math.max(nameScore, Matcher.cmp(t, s.name_cn));

    return nameScore + Matcher.date(a, s);
  }

  static pick(a: TmAnilist, list: BgmSubject[]): BgmSubject | null {
    let best: BgmSubject | null = null;
    let top = -Infinity;
    for (const s of list) {
      const sc = Matcher.score(a, s);
      if (sc > top) {
        top = sc;
        best = s;
      }
    }
    return best && top >= Score.MIN ? best : null;
  }

  private static cmp(a?: string | null, b?: string | null): number {
    if (!a || !b) return 0;
    const x = Matcher.norm(a);
    const y = Matcher.norm(b);
    if (!x || !y) return 0;
    if (x === y) return Score.NAME_EQ;
    if (x.includes(y) || y.includes(x)) return Score.NAME_IN;
    return 0;
  }

  private static date(a: TmAnilist, s: BgmSubject): number {
    const st = a.startDate;
    const d = Matcher.ym(s.date);
    if (!st?.year || !d.y) return 0;
    const dy = st.year - d.y;
    if (dy === 0 && st.month && d.m && st.month === d.m) return Score.YM_EQ;
    if (dy === 0) return Score.Y_EQ;
    if (Math.abs(dy) >= Score.FAR_YEARS) return Score.Y_FAR;
    return 0;
  }

  private static ym(date?: string | null): { y: number; m: number } {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(date ?? '');
    return m ? { y: Number(m[1]), m: m[2] ? Number(m[2]) : 0 } : { y: 0, m: 0 };
  }

  /** AnimeTrace 的作品名是否指向该结果（同系列即算：完全相等或较长的前缀包含） */
  static same(work: string, r: Recog): boolean {
    const w = Matcher.norm(work);
    if (!w) return false;
    const a = r.hit?.anilist;
    const names = [
      a?.title.native,
      a?.title.romaji,
      a?.title.english,
      a?.title.chinese,
      ...(a?.synonyms ?? []),
      ...(a?.synonyms_chinese ?? []),
      r.bgm?.name,
      r.bgm?.name_cn,
      r.work,
    ];
    return names.some((n) => {
      const x = n ? Matcher.norm(n) : '';
      if (!x) return false;
      if (x === w) return true;
      return Math.min(x.length, w.length) >= Score.PREFIX_MIN && (x.startsWith(w) || w.startsWith(x));
    });
  }

  /** 仅凭作品名挑选 Bangumi 条目：名字完全相等优先，其次前缀包含，否则 null */
  static byName(work: string, list: BgmSubject[]): BgmSubject | null {
    const w = Matcher.norm(work);
    const eq = list.find((s) => [s.name, s.name_cn].some((n) => n && Matcher.norm(n) === w));
    if (eq) return eq;
    return (
      list.find((s) =>
        [s.name, s.name_cn].some((n) => {
          const x = n ? Matcher.norm(n) : '';
          return x.length >= Score.PREFIX_MIN && w.length >= Score.PREFIX_MIN && (x.startsWith(w) || w.startsWith(x));
        }),
      ) ?? null
    );
  }

  static norm(s: string): string {
    return s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  }
}
