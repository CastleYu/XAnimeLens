import { Api, AtDef, AtFile, ErrCode } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { AtResp, AtWork } from '../shared/types';

export class AnimeTrace {
  static async search(img: Blob): Promise<AtResp> {
    const body = new FormData();
    body.append(AtDef.FILE, img, AtFile.NAME);
    body.append(AtDef.MULTI, AtDef.ON);
    body.append(AtDef.AI, AtDef.OFF);

    let r: Response;
    try {
      r = await fetch(Api.AT_SEARCH, { method: 'POST', body });
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (r.status === 429 || r.status === 503) throw new AppErr(ErrCode.QUOTA);

    let j: AtResp;
    try {
      j = (await r.json()) as AtResp;
    } catch (e) {
      if (!r.ok) throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);
      throw new AppErr(ErrCode.NETWORK, String(e));
    }

    if (AtDef.QUOTA.includes(j.code)) throw new AppErr(ErrCode.QUOTA);
    if (AtDef.OK.includes(j.code)) return j;
    throw new AppErr(ErrCode.NETWORK, `code ${j.code}`);
  }

  static group(r: AtResp): AtWork[] {
    const out: AtWork[] = [];
    const at = new Map<string, number>();
    for (const b of r.data ?? []) {
      const c = b.character?.[0];
      if (!c) continue;
      const work = c.work?.trim();
      if (!work || !c.character) continue;
      let i = at.get(work);
      if (i === undefined) {
        i = out.length;
        at.set(work, i);
        out.push({ work, chars: [], unsure: true });
      }
      const w = out[i];
      if (!w.chars.includes(c.character)) w.chars.push(c.character);
      if (!b.not_confident) w.unsure = false;
    }
    return out;
  }
}
