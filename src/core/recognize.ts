import { AnimeTrace } from '../api/animetrace';
import { Bangumi } from '../api/bangumi';
import { TraceMoe } from '../api/tracemoe';
import { Def, ErrCode, RecogDef, Src, Svr, SvrTxt } from '../shared/consts';
import { AppErr } from '../shared/err';
import { Matcher } from './match';
import { Metas } from './meta';
import { Svrs } from './svrs';
import type {
  AtWork,
  BgmSubject,
  Cfg,
  Recog,
  RecogResult,
  SrcErr,
  SvrStat,
  TmAnilist,
  TmHit,
  TmResp,
} from '../shared/types';

/** 单次识别的增量结果回调；done 为 true 表示所有来源都已返回 */
export type Emit = (r: RecogResult, done: boolean) => void | Promise<void>;

/**
 * 并行调用各来源，先返回的先推送：trace.moe 给出集数与时间（含 AniList 信息），AnimeTrace 补充角色并作为独立佐证。
 * Bangumi 补全在识别结果展示之后异步进行，每返回一条都按当前已有数据重新合并并推送；
 * 某个服务挂掉只影响它自己的那部分信息，并记录在 svrs 中供卡片显示。
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
    const st: State = {
      hits: null,
      tr: null,
      works: null,
      bgm: new Map(),
      named: new Map(),
      errs: [],
      ai: undefined,
      svrs: Svrs.init(cfg.at),
    };
    const pending = new Set<Src>([Src.TM]);
    if (cfg.at) pending.add(Src.AT);
    const looks: Promise<void>[] = []; // 进行中的后续补全（Bangumi / 额度）
    let left = 0;
    let tmErr: unknown = null;
    let q: Promise<void> = Promise.resolve();
    // 串行推送，保证顺序；全部结束后的最终结果由末尾单独推送
    const push = (): Promise<void> => {
      if (!pending.size && !left) return q;
      const r = Recognizer.compose(st, [...pending]);
      q = q.then(() => emit(r, false));
      return q;
    };
    // 后续补全不阻塞展示：先推送已有数据，每项补全返回后再推送一次
    const track = (p: Promise<void>): void => {
      left++;
      looks.push(
        p.then(() => {
          left--;
          return push();
        }),
      );
    };
    const look = (run: () => Promise<BgmSubject | null>, put: (b: BgmSubject | null) => void): void =>
      track(
        run().then(
          (b) => {
            put(b);
            Svrs.ok(st.svrs, Svr.BGM);
          },
          (e) => {
            put(null);
            Svrs.fail(st.svrs, Svr.BGM, e);
          },
        ),
      );

    void push(); // 先推送一次各服务的等待状态
    const tmP = TraceMoe.search(img, cfg.tmKey).then(
      (tr) => {
        st.tr = tr;
        st.hits = Recognizer.tm(tr, cfg, st.svrs);
        Svrs.ok(st.svrs, Svr.TM);
        pending.delete(Src.TM);
        for (const h of st.hits) look(() => Recognizer.bgm(h.anilist, cfg.bgmToken), (b) => st.bgm.set(h.anilist.id, b));
        // search 返回的额度不含本次请求，以 /me 为准；失败则保留 search 自带的额度
        track(
          TraceMoe.me(cfg.tmKey).then((me) => {
            if (me && st.tr) Object.assign(st.tr, { quota: me.quota, quotaUsed: me.quotaUsed });
          }),
        );
        return push();
      },
      (e) => {
        tmErr = e;
        st.errs.push(Recognizer.err(Src.TM, e));
        Svrs.fail(st.svrs, Svr.TM, e);
        Svrs.off(st.svrs, Svr.AL); // AniList 数据随 trace.moe 返回
        pending.delete(Src.TM);
        return push();
      },
    );
    const atP = cfg.at
      ? AnimeTrace.search(img).then(
          (r) => {
            st.ai = r.ai;
            st.works = AnimeTrace.group(r);
            Svrs.ok(st.svrs, Svr.AT);
            pending.delete(Src.AT);
            for (const w of st.works) look(() => Recognizer.named(w.work, cfg.bgmToken), (b) => st.named.set(w.work, b));
            return push();
          },
          (e) => {
            st.errs.push(Recognizer.err(Src.AT, e));
            Svrs.fail(st.svrs, Svr.AT, e);
            pending.delete(Src.AT);
            return push();
          },
        )
      : Promise.resolve();

    await Promise.all([tmP, atP]);
    await Promise.all(looks);
    await q;
    Svrs.settle(st.svrs);
    const final = Recognizer.compose(st, []);
    // 只有 trace.moe 失败且没有别的结果可展示时才整体失败
    if (!final.items.length && tmErr) {
      await emit(final, false); // 先推送服务状态，卡片头部才能显示哪个服务挂了
      throw tmErr;
    }
    await emit(final, true);
  }

  /** 按当前已返回的数据合并出结果（不修改状态，可重复调用） */
  static compose(st: State, pending: Src[]): RecogResult {
    const items: Recog[] = (st.hits ?? []).map((hit) => ({
      hit,
      bgm: st.bgm.get(hit.anilist.id) ?? null,
      srcs: [Src.TM],
      chars: [],
      work: '',
      unsure: false,
    }));
    for (const w of st.works ?? []) Recognizer.merge(items, w, st.named.get(w.work) ?? null);
    return {
      items,
      quota: st.tr?.quota,
      quotaUsed: st.tr?.quotaUsed,
      errs: [...st.errs],
      ai: st.ai,
      pending,
      svrs: Svrs.copy(st.svrs),
    };
  }

  /**
   * trace.moe：阈值过滤、按 AniList 去重、取前 N。
   * AniList 信息随 trace.moe 返回；缺失时（只给了 ID）补空条目并把 AniList 标为不可用。
   */
  private static tm(tr: TmResp, cfg: Cfg, svrs: SvrStat[]): TmHit[] {
    let bare = false;
    const raw = (tr.result ?? []).map((h) => {
      if (h.anilist && typeof h.anilist === 'object') return h;
      bare = true;
      return { ...h, anilist: { ...Metas.NONE, id: Number(h.anilist) || 0 } };
    });
    if (bare) Svrs.fail(svrs, Svr.AL, SvrTxt.NO_INFO);
    else Svrs.ok(svrs, Svr.AL);
    let hits = Recognizer.dedup(raw.filter((h) => h.similarity >= cfg.minSim)).slice(0, Def.TOP_N);
    if (!hits.length && raw.length) {
      hits = [[...raw].sort((a, b) => b.similarity - a.similarity)[0]];
    }
    return hits;
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

  /** 按 AniList 标题查 Bangumi；未找到返回 null，请求失败向上抛（用于标记服务状态） */
  private static async bgm(a: TmAnilist, token: string): Promise<BgmSubject | null> {
    for (const kw of Matcher.keywords(a).slice(0, RecogDef.KW_MAX)) {
      const picked = Matcher.pick(a, await Bangumi.search(kw, token));
      if (picked) return Bangumi.subject(picked.id, token);
    }
    return null;
  }

  /** 仅凭作品名查 Bangumi（AnimeTrace 结果）；未找到返回 null，请求失败向上抛 */
  private static async named(work: string, token: string): Promise<BgmSubject | null> {
    const picked = Matcher.byName(work, await Bangumi.search(work, token));
    return picked ? Bangumi.subject(picked.id, token) : null;
  }

  static err(src: Src, e: unknown): SrcErr {
    if (e instanceof AppErr) return { src, code: e.code, msg: e.message };
    return { src, code: ErrCode.NETWORK, msg: e instanceof Error ? e.message : String(e) };
  }
}

/** 单次识别过程中各来源已返回的数据 */
interface State {
  hits: TmHit[] | null;
  tr: TmResp | null;
  works: AtWork[] | null;
  bgm: Map<number, BgmSubject | null>; // AniList ID → Bangumi 条目
  named: Map<string, BgmSubject | null>; // AnimeTrace 作品名 → Bangumi 条目
  errs: SrcErr[];
  ai: boolean | undefined;
  svrs: SvrStat[];
}
