import { BackfillDef } from '../shared/consts';
import type { Fav } from '../shared/types';

/** 旧收藏补全：挑选缺少作品形式与类型标签或封面、且有 Bangumi ID 的条目。 */
export class Backfill {
  /** 纯函数：按原顺序挑选待补全条目，最多 max 条。 */
  static pick(items: Fav[], max = BackfillDef.MAX): Fav[] {
    const out: Fav[] = [];
    for (const f of items) {
      if (out.length >= max) break;
      if (f.bgmId != null && ((f.kind === '' && f.genres.length === 0) || !f.cover)) out.push(f);
    }
    return out;
  }
}
