import { Api, ErrCode, TmParam } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { TmMe, TmResp } from '../shared/types';

export class TraceMoe {
  static async search(img: Blob, key: string): Promise<TmResp> {
    const url = `${Api.TM_SEARCH}?${TmParam.ANILIST}&${TmParam.CUT}`;
    const headers: Record<string, string> = {
      'Content-Type': img.type || 'image/jpeg',
    };
    if (key) headers[Api.TM_KEY_HEADER] = key;

    let r: Response;
    try {
      r = await fetch(url, { method: 'POST', headers, body: img });
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (r.status === 402 || r.status === 429) throw new AppErr(ErrCode.QUOTA);
    if (!r.ok) throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);

    let j: TmResp;
    try {
      j = (await r.json()) as TmResp;
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (j.error) throw new AppErr(ErrCode.NETWORK, j.error);
    // search 返回的 quotaUsed 不含本次请求；以 /me 为准（与 trace.moe 赞助页一致，含 API Key 额度）
    const me = await TraceMoe.me(key);
    if (me) {
      j.quota = me.quota;
      j.quotaUsed = me.quotaUsed;
    }
    return j;
  }

  /** 当前 IP 或 API Key 的额度；任何失败返回 null */
  static async me(key: string): Promise<TmMe | null> {
    const headers: Record<string, string> = {};
    if (key) headers[Api.TM_KEY_HEADER] = key;
    try {
      const r = await fetch(Api.TM_ME, { headers, cache: 'no-store' });
      if (!r.ok) return null;
      const j = (await r.json()) as TmMe;
      return typeof j.quota === 'number' && typeof j.quotaUsed === 'number' ? j : null;
    } catch {
      return null;
    }
  }
}
