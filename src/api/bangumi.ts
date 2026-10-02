import { Api, ErrCode } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { BgmChar, BgmSubject } from '../shared/types';

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

  /** 作品的角色列表（含头像，名字为原名） */
  static chars(subject: number, token: string): Promise<BgmChar[]> {
    return Bangumi.get<BgmChar[]>(`${Api.BGM_SUBJECT}${subject}${Api.BGM_CHARS}`, token);
  }

  /** 角色详情（infobox 含简体中文名） */
  static char(id: number, token: string): Promise<BgmChar> {
    return Bangumi.get<BgmChar>(`${Api.BGM_CHAR}${id}`, token);
  }

  static async searchChar(keyword: string, token: string): Promise<BgmChar[]> {
    const url = `${Api.BGM_BASE}${Api.BGM_CHAR_SEARCH}?limit=${Api.BGM_CHAR_LIMIT}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const j = await Bangumi.json<{ data?: BgmChar[] }>(url, { method: 'POST', headers, body: JSON.stringify({ keyword }) });
    return j.data ?? [];
  }

  private static get<T>(path: string, token: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return Bangumi.json<T>(`${Api.BGM_BASE}${path}`, { method: 'GET', headers });
  }

  private static async json<T>(url: string, init: RequestInit): Promise<T> {
    let r: Response;
    try {
      r = await fetch(url, init);
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
    if (!r.ok) throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);
    try {
      return (await r.json()) as T;
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
  }
}
