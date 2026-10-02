import { Bangumi } from '../api/bangumi';
import { TraceMoe } from '../api/tracemoe';
import { Def, RecogDef, Src } from '../shared/consts';
import { Matcher } from './match';
import type { BgmSubject, Cfg, Recog, RecogResult, TmAnilist, TmHit } from '../shared/types';

export class Recognizer {
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult> {
    const tm = await TraceMoe.search(img, cfg.tmKey);
    const raw = tm.result ?? [];

    let hits = raw.filter((h) => h.similarity >= cfg.minSim);
    hits = Recognizer.dedup(hits).slice(0, Def.TOP_N);
    if (!hits.length && raw.length) {
      hits = [[...raw].sort((a, b) => b.similarity - a.similarity)[0]];
    }

    const items: Recog[] = [];
    for (const hit of hits) {
      items.push({ hit, bgm: await Recognizer.bgm(hit.anilist, cfg.bgmToken), srcs: [Src.TM], chars: [], work: '', unsure: false });
    }
    return { items, quota: tm.quota, quotaUsed: tm.quotaUsed, errs: [] };
  }

  /** 按 AniList ID 去重（保留高相似度），再按相似度降序 */
  private static dedup(hits: TmHit[]): TmHit[] {
    const map = new Map<number, TmHit>();
    for (const h of hits) {
      const prev = map.get(h.anilist.id);
      if (!prev || h.similarity > prev.similarity) map.set(h.anilist.id, h);
    }
    return [...map.values()].sort((a, b) => b.similarity - a.similarity);
  }

  /** Bangumi 任何异常都吞掉并返回 null */
  private static async bgm(a: TmAnilist, token: string): Promise<BgmSubject | null> {
    try {
      for (const kw of Matcher.keywords(a).slice(0, RecogDef.KW_MAX)) {
        const list = await Bangumi.search(kw, token);
        const picked = Matcher.pick(a, list);
        if (picked) return await Bangumi.subject(picked.id, token);
      }
    } catch {
      return null;
    }
    return null;
  }
}
