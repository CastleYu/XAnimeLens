import { Api, ErrCode } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { BgmSubject } from '../shared/types';

export class Bangumi {
  static async search(keyword: string, token: string): Promise<BgmSubject[]> {
    const url = `${Api.BGM_BASE}${Api.BGM_SEARCH}?limit=${Api.BGM_LIMIT}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const body = JSON.stringify({ keyword, filter: { type: [Api.BGM_ANIME_TYPE] } });

    let r: Response;
    try {
      r = await fetch(url, { method: 'POST', headers, body });
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (!r.ok) throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);

    try {
      const j = (await r.json()) as { data?: BgmSubject[] };
      return j.data ?? [];
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
  }

  static async subject(id: number, token: string): Promise<BgmSubject> {
    const url = `${Api.BGM_BASE}${Api.BGM_SUBJECT}${id}`;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let r: Response;
    try {
      r = await fetch(url, { method: 'GET', headers });
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (!r.ok) throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);

    try {
      return (await r.json()) as BgmSubject;
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
  }
}
