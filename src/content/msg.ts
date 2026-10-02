import { ErrCode, ErrText, PortDef, PortMsg } from '../shared/consts';
import { AppErr } from '../shared/err';
import type { CardData, PortReq, PortRes, Req, Res } from '../shared/types';

/** 封装 chrome.runtime.sendMessage：统一解包 Res<T>，失败抛 AppErr。 */
export class Bus {
  static send<T>(req: Req): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 扩展重载后旧脚本的 chrome.runtime.id 变为 undefined，sendMessage 会同步抛错
      if (!chrome.runtime?.id) {
        reject(new AppErr(ErrCode.STALE));
        return;
      }
      try {
        chrome.runtime.sendMessage(req, (resp: Res<T> | undefined) => {
          const le = chrome.runtime.lastError;
          if (le) {
            const m = le.message ?? '';
            reject(new AppErr(ErrText.stale(m) ? ErrCode.STALE : ErrCode.NETWORK, m));
            return;
          }
          if (!resp) {
            reject(new AppErr(ErrCode.NETWORK, 'no response'));
            return;
          }
          if (resp.ok) resolve(resp.data);
          else reject(new AppErr(resp.err.code, resp.err.msg));
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        reject(new AppErr(ErrText.stale(m) ? ErrCode.STALE : ErrCode.NETWORK, m));
      }
    });
  }

  /** 增量识别：每收到一次结果回调 on(data, done)；全部完成后 resolve */
  static stream(img: string, on: (d: CardData, done: boolean) => void | Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new AppErr(ErrCode.STALE));
        return;
      }
      let port: chrome.runtime.Port;
      let end = false;
      try {
        port = chrome.runtime.connect({ name: PortDef.RECOG });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        reject(new AppErr(ErrText.stale(m) ? ErrCode.STALE : ErrCode.NETWORK, m));
        return;
      }
      port.onMessage.addListener((m: PortRes) => {
        if (m.type === PortMsg.ERR) {
          end = true;
          port.disconnect();
          reject(new AppErr(m.err.code, m.err.msg));
          return;
        }
        const done = m.type === PortMsg.DONE;
        void Promise.resolve(on(m.data, done)).then(() => {
          if (!done) return;
          end = true;
          port.disconnect();
          resolve();
        }, reject);
      });
      port.onDisconnect.addListener(() => {
        if (end) return;
        const m = chrome.runtime.lastError?.message ?? 'disconnected';
        reject(new AppErr(ErrText.stale(m) || !chrome.runtime?.id ? ErrCode.STALE : ErrCode.NETWORK, m));
      });
      port.postMessage({ img } satisfies PortReq);
    });
  }
}
