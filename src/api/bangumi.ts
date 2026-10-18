import { Health } from '../core/svrs';
import { Api, ErrCode, Svr, SvrDef, SvrTxt } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { BgmChar, BgmSubject } from '../shared/types';

/**
 * Bangumi API。所有请求带超时；网络故障 / 5xx / 限流后进入熔断冷却期，
 * 冷却期内直接抛错，避免服务挂掉时每次都等到超时。
 */
export class Bangumi {
  static async search(keyword: string, token: string): Promise<BgmSubject[]> {
    const url = `${Api.BGM_BASE}${Api.BGM_SEARCH}?limit=${Api.BGM_LIMIT}`;
    const body = JSON.stringify({ keyword, filter: { type: [Api.BGM_ANIME_TYPE] } });
    const j = await Bangumi.json<{ data?: BgmSubject[] }>(url, { method: 'POST', headers: Bangumi.head(token, true), body });
    return j.data ?? [];
  }

  static subject(id: number, token: string): Promise<BgmSubject> {
    return Bangumi.get<BgmSubject>(`${Api.BGM_SUBJECT}${id}`, token);
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
    const body = JSON.stringify({ keyword });
    const j = await Bangumi.json<{ data?: BgmChar[] }>(url, { method: 'POST', headers: Bangumi.head(token, true), body });
    return j.data ?? [];
  }

  private static head(token: string, json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  private static get<T>(path: string, token: string): Promise<T> {
    return Bangumi.json<T>(`${Api.BGM_BASE}${path}`, { method: 'GET', headers: Bangumi.head(token) });
  }

  private static async json<T>(url: string, init: RequestInit): Promise<T> {
    if (Health.down(Svr.BGM)) throw new AppErr(ErrCode.NETWORK, SvrTxt.DOWN);
    let r: Response;
    try {
      r = await fetch(url, { ...init, signal: AbortSignal.timeout(SvrDef.BGM_MS) });
    } catch (e) {
      Health.fail(Svr.BGM);
      const timeout = e instanceof Error && e.name === 'TimeoutError';
      throw new AppErr(ErrCode.NETWORK, timeout ? SvrTxt.TIMEOUT : String(e));
    }
    if (!r.ok) {
      if (Health.bad(r.status)) Health.fail(Svr.BGM);
      throw new AppErr(ErrCode.NETWORK, `HTTP ${r.status}`);
    }
    try {
      const j = (await r.json()) as T;
      Health.ok(Svr.BGM);
      return j;
    } catch (e) {
      throw new AppErr(ErrCode.NETWORK, String(e));
    }
  }
}
