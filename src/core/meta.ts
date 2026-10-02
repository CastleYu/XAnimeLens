import { MetaMap, MetaTxt } from '../shared/consts';
import type { BgmInfo, BgmSubject, Meta, Recog, TmAnilist } from '../shared/types';

/** 合并 AniList 与 Bangumi 的作品信息；Bangumi 的中文数据优先，AniList 兜底。 */
export class Metas {
  /** 无 trace.moe 命中时的空 AniList 条目，统一走 Bangumi 数据 */
  static readonly NONE: TmAnilist = { id: 0, title: {}, isAdult: false };

  static of(r: Recog): Meta {
    const a = r.hit?.anilist ?? Metas.NONE;
    const b = r.bgm;
    const src = MetaMap.SOURCE[a.source ?? ''] ?? '';
    return {
      kind: Metas.kind(a, b),
      air: Metas.air(a, b),
      eps: Metas.eps(a, b),
      src,
      adult: !!a.isAdult,
      genres: Metas.genres(a, b, src),
      studio: Metas.studio(a, b),
      staff: Metas.staff(b),
    };
  }

  static kind(a: TmAnilist, b: BgmSubject | null): string {
    return MetaMap.PLATFORM[b?.platform ?? ''] || MetaMap.FORMAT[a.format ?? ''] || b?.platform || a.format || '';
  }

  /** 季度优先（2015年秋），否则用开播年月 */
  static air(a: TmAnilist, b: BgmSubject | null): string {
    const y = a.seasonYear ?? a.startDate?.year;
    const s = MetaMap.SEASON[a.season ?? ''];
    if (y && s) return `${y}${MetaTxt.YEAR}${s}`;
    const m = /^(\d{4})-(\d{2})/.exec(b?.date ?? '');
    if (m) return `${m[1]}${MetaTxt.YEAR}${Number(m[2])}${MetaTxt.MONTH}`;
    const sm = a.startDate?.month;
    if (y && sm) return `${y}${MetaTxt.YEAR}${sm}${MetaTxt.MONTH}`;
    return y ? `${y}${MetaTxt.YEAR}` : '';
  }

  static eps(a: TmAnilist, b: BgmSubject | null): string {
    const n = b?.total_episodes || b?.eps || a.episodes || 0;
    const d = a.duration || 0;
    const movie = a.format === 'MOVIE';
    const parts: string[] = [];
    if (n && !(movie && n === 1)) parts.push(MetaTxt.EPS.replace('{n}', String(n)));
    if (d) parts.push((movie ? MetaTxt.MOVIE_MIN : MetaTxt.MIN).replace('{n}', String(d)));
    return parts.join(' · ');
  }

  /** Bangumi meta_tags（官方类型标签）优先，补 AniList 体裁；去掉与形式/原作重复的 */
  static genres(a: TmAnilist, b: BgmSubject | null, src: string): string[] {
    const skip = new Set([...MetaMap.SKIP_TAGS, src, b?.platform ?? '']);
    const out: string[] = [];
    const add = (t: string | undefined): void => {
      const v = t?.trim();
      if (v && !skip.has(v) && !/^\d{4}/.test(v) && !out.includes(v)) out.push(v);
    };
    (b?.meta_tags ?? []).forEach(add);
    (a.genres ?? []).forEach((g) => add(MetaMap.GENRE[g] ?? g));
    return out.slice(0, MetaMap.MAX_GENRES);
  }

  static studio(a: TmAnilist, b: BgmSubject | null): string {
    const main = (a.studios?.edges ?? []).filter((e) => e.isMain).map((e) => e.node.name);
    const names = main.length ? main : Metas.info(b?.infobox, [MetaMap.STUDIO_KEY]).split(/[、,，/]/);
    return names
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MetaMap.MAX_STUDIOS)
      .join(MetaTxt.JOIN);
  }

  static staff(b: BgmSubject | null): string {
    return Metas.info(b?.infobox, MetaMap.STAFF_KEYS);
  }

  /** infobox 取值：value 可能是字符串或 [{v}] 数组 */
  static info(box: BgmInfo[] | undefined, keys: string[]): string {
    const it = (box ?? []).find((i) => keys.includes(i.key));
    if (!it) return '';
    const v = it.value;
    return typeof v === 'string' ? v : v.map((x) => x.v).join(MetaTxt.JOIN);
  }
}
