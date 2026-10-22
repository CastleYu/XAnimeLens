import { ErrCode, SvrTxt } from './consts';

export class AppErr extends Error {
  constructor(public code: ErrCode, msg = '') {
    super(msg || code);
  }

  /** fetch 抛出的异常 → NETWORK；超时给出可读的“请求超时” */
  static net(e: unknown): AppErr {
    const timeout = e instanceof Error && e.name === AppErr.TIMEOUT;
    return new AppErr(ErrCode.NETWORK, timeout ? SvrTxt.TIMEOUT : String(e));
  }

  /** AbortSignal.timeout 触发时的异常名 */
  static readonly TIMEOUT = 'TimeoutError';
}
