import { ColSort, SrcPick } from '../shared/consts';
import type { Fav } from '../shared/types';

/** 收藏集页面的筛选条件 */
export interface FavFilter {
  q: string; // 搜索词（标题 / 原名 / 备注 / 形式 / 类型 / 角色）
  kind: string; // 作品形式，空串为全部
  src: SrcPick;
  sort: ColSort;
}

/** 收藏集筛选与排序（纯函数）。 */
export class FavQuery {
  static apply(items: Fav[], f: FavFilter): Fav[] {
    const q = f.q.trim().toLowerCase();
    const out = items.filter(
      (x) => (!q || FavQuery.hit(x, q)) && (!f.kind || x.kind === f.kind) && FavQuery.src(x, f.src),
    );
    return out.sort(FavQuery.cmp(f.sort));
  }

  static hit(f: Fav, q: string): boolean {
    return [f.title, f.native, f.note, f.kind, ...f.genres, ...f.chars].some((s) => (s || '').toLowerCase().includes(q));
  }

  static src(f: Fav, p: SrcPick): boolean {
    if (p === SrcPick.ALL) return true;
    if (p === SrcPick.MULTI) return f.srcs.length >= 2;
    return f.srcs.includes(p);
  }

  static cmp(s: ColSort): (a: Fav, b: Fav) => number {
    switch (s) {
      case ColSort.OLD:
        return (a, b) => (a.savedAt || '').localeCompare(b.savedAt || '');
      case ColSort.TITLE:
        return (a, b) => a.title.localeCompare(b.title);
      case ColSort.SIM:
        return (a, b) => b.similarity - a.similarity;
      default:
        return (a, b) => (b.savedAt || '').localeCompare(a.savedAt || '');
    }
  }

  /** 收藏中出现过的作品形式（去重，保持首次出现顺序） */
  static kinds(items: Fav[]): string[] {
    return [...new Set(items.map((f) => f.kind).filter(Boolean))];
  }
}
