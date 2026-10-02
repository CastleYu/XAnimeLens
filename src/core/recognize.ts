import { AnimeTrace } from '../api/animetrace';
import { Bangumi } from '../api/bangumi';
import { TraceMoe } from '../api/tracemoe';
import { Def, ErrCode, RecogDef, Src } from '../shared/consts';
import { AppErr } from '../shared/err';
import { Matcher } from './match';
import type {
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

/** 单次识别的增量结果回调；done 为 true 表示所有来源都已返回 */
export type Emit = (r: RecogResult, done: boolean) => void | Promise<void>;

/**
 * 并行调用各来源，先返回的先推送：trace.moe 给出集数与时间，AnimeTrace 补充角色并作为独立佐证。
 * 每个来源返回后都会按当前已有数据重新合并一次并推送。
 */
export class Recognizer {
  /** 一次性返回最终结果（测试与非流式调用使用） */
  static async run(img: Blob, cfg: Cfg): Promise<RecogResult> {
    let last: RecogResult | null = null;
    await Recognizer.stream(img, cfg, (r) => {
      last = r;
    });
    return last!;
  }

  static async stream(img: Blob, cfg: Cfg, emit: Emit): Promise<void> {
    const st: State = { tm: null, tr: null, works: null, named: new Map(), errs: [], ai: undefined };
    const pending = new Set<Src>([Src.TM]);
    if (cfg.at) pending.add(Src.AT);
    let tmErr: unknown = null;
    let q: Promise<void> = Promise.resolve();
    // 串行推送，保证顺序；最终结果由末尾单独推送
    const push = (): Promise<void> => {
      if (!pending.size) return q;
      const r = Recognizer.compose(st, [...pending]);
      if (!r.items.length) return q; // 没有可展示的结果时不打断加载态
      q = q.then(() => emit(r, false));
      return q;
    };

    const tmP = TraceMoe.search(img, cfg.tmKey).then(
      async (tr) => {
        st.tr = tr;
        st.tm = await Recognizer.tm(tr, cfg);
        pending.delete(Src.TM);
        await push();
      },
      (e) => {
        tmErr = e;
        st.errs.push(Recognizer.err(Src.TM, e));
        pending.delete(Src.TM);
      },
    );
    const atP = cfg.at
      ? AnimeTrace.search(img).then(
          async (r) => {
            st.ai = r.ai;
            const works = AnimeTrace.group(r);
            await Promise.all(
              works.map(async (w) => st.named.set(w.work, await Recognizer.named(w.work, cfg.bgmToken))),
            );
            st.works = works;
            pending.delete(Src.AT);
            await push();
          },
          (e) => {
            st.errs.push(Recognizer.err(Src.AT, e));
            pending.delete(Src.AT);
          },
        )
      : Promise.resolve();

    await Promise.all([tmP, atP]);
    await q;
    const final = Recognizer.compose(st, []);
    // 只有 trace.moe 失败且没有别的结果可展示时才整体失败
    if (!final.items.length && tmErr) throw tmErr;
    await emit(final, true);
  }

  /** 按当前已返回的数据合并出结果（不修改状态，可重复调用） */
  static compose(st: State, pending: Src[]): RecogResult {
    const items: Recog[] = (st.tm ?? []).map((r) => ({ ...r, srcs: [...r.srcs], chars: [...r.chars] }));
    for (const w of st.works ?? []) Recognizer.merge(items, w, st.named.get(w.work) ?? null);
    return {
      items,
      quota: st.tr?.quota,
      quotaUsed: st.tr?.quotaUsed,
      errs: [...st.errs],
      ai: st.ai,
      pending,
    };
  }

  /** trace.moe：阈值过滤、按 AniList 去重、取前 N，再补 Bangumi */
  private static async tm(tr: TmResp, cfg: Cfg): Promise<Recog[]> {
    const raw = tr.result ?? [];
    let hits = Recognizer.dedup(raw.filter((h) => h.similarity >= cfg.minSim)).slice(0, Def.TOP_N);
    if (!hits.length && raw.length) {
      hits = [[...raw].sort((a, b) => b.similarity - a.similarity)[0]];
    }
    // 各条结果的 Bangumi 补全互不依赖，并行进行
    return Promise.all(
      hits.map(async (hit) => ({
        hit,
        bgm: await Recognizer.bgm(hit.anilist, cfg.bgmToken),
        srcs: [Src.TM],
        chars: [],
        work: '',
        unsure: false,
      })),
    );
  }

  /** AnimeTrace 作品并入已有结果；同系列或同一 Bangumi 条目即合并，否则新增一条 */
  static merge(items: Recog[], w: AtWork, bgm: BgmSubject | null): void {
    const hit = items.find((r) => Matcher.same(w.work, r) || (bgm != null && r.bgm?.id === bgm.id));
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

  static err(src: Src, e: unknown): SrcErr {
    if (e instanceof AppErr) return { src, code: e.code, msg: e.message };
    return { src, code: ErrCode.NETWORK, msg: e instanceof Error ? e.message : String(e) };
  }
}

/** 单次识别过程中各来源已返回的数据 */
interface State {
  tm: Recog[] | null;
  tr: TmResp | null;
  works: AtWork[] | null;
  named: Map<string, BgmSubject | null>;
  errs: SrcErr[];
  ai: boolean | undefined;
}
