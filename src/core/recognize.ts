import { AnimeTrace } from '../api/animetrace';
import { Bangumi } from '../api/bangumi';
import { TraceMoe } from '../api/tracemoe';
import { Def, ErrCode, RecogDef, Src } from '../shared/consts';
import { AppErr } from '../shared/err';
import { Matcher } from './match';
import type {
  AtResp,
  AtWork,
  BgmSubject,
  Cfg,
  Recog,
  RecogResult,
  SrcErr,
  TmAnilist,
  TmHit,
  TmResp,
} from '../shared/types';

/** 并行调用各来源，按作品合并：trace.moe 给出集数与时间，AnimeTrace 补充角色并作为独立佐证。 */
export class Recognizer {
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult> {
    const [tm, at] = await Promise.allSettled([
      TraceMoe.search(img, cfg.tmKey),
      cfg.at ? AnimeTrace.search(img) : Promise.resolve(null),
    ]);
    const errs: SrcErr[] = [];
    const works = at.status === 'fulfilled' && at.value ? AnimeTrace.group(at.value) : [];
    if (at.status === 'rejected') errs.push(Recognizer.err(Src.AT, at.reason));

    let items: Recog[] = [];
    let tr: TmResp | null = null;
    if (tm.status === 'fulfilled') {
      tr = tm.value;
      items = await Recognizer.tm(tr, cfg);
    } else {
      // 只有 trace.moe 失败且没有别的结果可展示时才整体失败
      if (!works.length) throw tm.reason;
      errs.push(Recognizer.err(Src.TM, tm.reason));
    }

    for (const w of works) await Recognizer.merge(items, w, cfg.bgmToken);

    const ai = at.status === 'fulfilled' && at.value ? (at.value as AtResp).ai : undefined;
    return { items, quota: tr?.quota, quotaUsed: tr?.quotaUsed, errs, ai };
  }

  /** trace.moe：阈值过滤、按 AniList 去重、取前 N，再补 Bangumi */
  private static async tm(tr: TmResp, cfg: Cfg): Promise<Recog[]> {
    const raw = tr.result ?? [];
    let hits = Recognizer.dedup(raw.filter((h) => h.similarity >= cfg.minSim)).slice(0, Def.TOP_N);
    if (!hits.length && raw.length) {
      hits = [[...raw].sort((a, b) => b.similarity - a.similarity)[0]];
    }
    const out: Recog[] = [];
    for (const hit of hits) {
      out.push({
        hit,
        bgm: await Recognizer.bgm(hit.anilist, cfg.bgmToken),
        srcs: [Src.TM],
        chars: [],
        work: '',
        unsure: false,
      });
    }
    return out;
  }

  /** AnimeTrace 作品并入已有结果；同系列或同一 Bangumi 条目即合并，否则新增一条 */
  private static async merge(items: Recog[], w: AtWork, token: string): Promise<void> {
    let hit = items.find((r) => Matcher.same(w.work, r));
    let bgm: BgmSubject | null = null;
    if (!hit) {
      bgm = await Recognizer.named(w.work, token);
      if (bgm) hit = items.find((r) => r.bgm?.id === bgm!.id);
    }
    if (hit) {
      if (!hit.srcs.includes(Src.AT)) hit.srcs.push(Src.AT);
      for (const c of w.chars) if (!hit.chars.includes(c)) hit.chars.push(c);
      hit.work ||= w.work;
      return;
    }
    items.push({ hit: null, bgm, srcs: [Src.AT], chars: [...w.chars], work: w.work, unsure: w.unsure });
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

  /** 仅凭作品名查 Bangumi（AnimeTrace 结果）；异常返回 null */
  private static async named(work: string, token: string): Promise<BgmSubject | null> {
    try {
      const picked = Matcher.byName(work, await Bangumi.search(work, token));
      return picked ? await Bangumi.subject(picked.id, token) : null;
    } catch {
      return null;
    }
  }

  private static err(src: Src, e: unknown): SrcErr {
    if (e instanceof AppErr) return { src, code: e.code, msg: e.message };
    return { src, code: ErrCode.NETWORK, msg: e instanceof Error ? e.message : String(e) };
  }
}
