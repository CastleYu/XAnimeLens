import { ErrCode } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { Req, Res } from '../shared/types';

/** 封装 chrome.runtime.sendMessage：统一解包 Res<T>，失败抛 AppErr。 */
export class Bus {
  static send<T>(req: Req): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      chrome.runtime.sendMessage(req, (resp: Res<T> | undefined) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reject(new AppErr(ErrCode.NETWORK, le.message));
          return;
        }
        if (!resp) {
          reject(new AppErr(ErrCode.NETWORK, 'no response'));
          return;
        }
        if (resp.ok) resolve(resp.data);
        else reject(new AppErr(resp.err.code, resp.err.msg));
      });
    });
  }
}
