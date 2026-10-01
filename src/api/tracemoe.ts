import { Api, ErrCode, TmParam } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { TmResp } from '../shared/types';

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
    return j;
  }
}
