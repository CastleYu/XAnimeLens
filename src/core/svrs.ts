import { ErrText, Svr, SvrDef, SvrState } from '../shared/consts';
import type { SvrStat } from '../shared/types';

/**
 * 服务熔断：一次网络故障后进入冷却期，期间请求直接失败，
 * 避免某个服务挂掉时每个请求都要等到超时（service worker 存活期间有效）。
 */
export class Health {
  static until = new Map<Svr, number>();

  static down(s: Svr): boolean {
    return (Health.until.get(s) ?? 0) > Date.now();
  }

  static fail(s: Svr): void {
    Health.until.set(s, Date.now() + SvrDef.DOWN_MS);
  }

  static ok(s: Svr): void {
    Health.until.delete(s);
  }

  static reset(): void {
    Health.until.clear();
  }

  /** 该 HTTP 状态是否说明服务本身出了问题（而非请求无效） */
  static bad(status: number): boolean {
    return status >= SvrDef.DOWN_HTTP || status === SvrDef.RATE_HTTP;
  }
}

/** 单次识别内各服务状态的维护（纯数据操作，可重复调用） */
export class Svrs {
  static init(at: boolean): SvrStat[] {
    return SvrDef.ORDER.map((svr) => ({
      svr,
      state: svr === Svr.AT && !at ? SvrState.OFF : SvrState.WAIT,
      msg: '',
    }));
  }

  static get(list: SvrStat[], s: Svr): SvrStat {
    return list.find((x) => x.svr === s)!;
  }

  /** 失败优先：同一服务部分请求成功、部分失败时仍显示不可用 */
  static ok(list: SvrStat[], s: Svr): void {
    const x = Svrs.get(list, s);
    if (x.state !== SvrState.FAIL) x.state = SvrState.OK;
  }

  static fail(list: SvrStat[], s: Svr, e: unknown): void {
    const x = Svrs.get(list, s);
    x.state = SvrState.FAIL;
    x.msg = typeof e === 'string' ? e : ErrText.of(e);
  }

  static off(list: SvrStat[], s: Svr): void {
    const x = Svrs.get(list, s);
    if (x.state === SvrState.WAIT) x.state = SvrState.OFF;
  }

  /** 识别结束：仍在等待的服务视为本次未请求 */
  static settle(list: SvrStat[]): void {
    for (const x of list) if (x.state === SvrState.WAIT) x.state = SvrState.OFF;
  }

  static copy(list: SvrStat[]): SvrStat[] {
    return list.map((x) => ({ ...x }));
  }
}
