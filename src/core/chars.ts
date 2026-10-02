import { Bangumi } from '../api/bangumi';
import { Api } from '../shared/consts';
import { Matcher } from './match';
import { Metas } from './meta';
import type { BgmChar } from '../shared/types';

/** 把 AnimeTrace 给出的角色名对应到 Bangumi 角色。 */
export class Chars {
  /** 作品角色列表缓存（service worker 存活期间有效） */
  static lists = new Map<number, Promise<BgmChar[]>>();

  /**
   * 优先在作品角色列表里按原名精确匹配（最准）；
   * 找不到再全站搜索，也只接受名字完全相同的结果，避免“坂本”这类同名误配。
   */
  static async find(name: string, subject: number | null, token: string): Promise<BgmChar | null> {
    let hit: BgmChar | null = null;
    if (subject != null) {
      if (!Chars.lists.has(subject)) Chars.lists.set(subject, Bangumi.chars(subject, token).catch(() => []));
      hit = Chars.pick(name, await Chars.lists.get(subject)!);
    }
    if (!hit) hit = Chars.pick(name, await Bangumi.searchChar(name, token).catch(() => []));
    if (!hit) return null;
    // 角色列表不含中文名，补拉详情；失败则沿用列表数据
    return Bangumi.char(hit.id, token).catch(() => hit);
  }

  static pick(name: string, list: BgmChar[]): BgmChar | null {
    const n = Matcher.norm(name);
    return (n && list.find((c) => Matcher.norm(c.name) === n)) || null;
  }

  static cn(c: BgmChar): string {
    return Metas.info(c.infobox, [Api.BGM_CN_KEY]);
  }

  static img(c: BgmChar): string {
    const i = c.images;
    return i?.grid || i?.small || i?.medium || i?.large || '';
  }
}
