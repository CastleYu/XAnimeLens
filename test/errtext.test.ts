import { describe, expect, it } from 'vitest';
import { ErrCode, ErrText } from '../src/shared/consts';
import { AppErr } from '../src/shared/err';

describe('ErrText.of', () => {
  it('扩展上下文失效 → 提示刷新页面', () => {
    expect(ErrText.of(new Error('Extension context invalidated.'))).toBe(ErrText.STALE);
    expect(ErrText.of(new AppErr(ErrCode.STALE))).toBe(ErrText.STALE);
    expect(ErrText.of(new AppErr(ErrCode.NETWORK, 'Could not establish connection. Receiving end does not exist.'))).toBe(ErrText.STALE);
  });
  it('已知错误码附带原始原因', () => {
    expect(ErrText.of(new AppErr(ErrCode.NETWORK, 'HTTP 500'))).toBe(`${ErrText.NETWORK}（HTTP 500）`);
    expect(ErrText.of(new AppErr(ErrCode.QUOTA))).toBe(ErrText.QUOTA);
  });
  it('未知异常显示具体信息', () => {
    expect(ErrText.of(new TypeError('x is undefined'))).toBe(`${ErrText.UNKNOWN}（x is undefined）`);
  });
});
