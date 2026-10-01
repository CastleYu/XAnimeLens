import { ErrCode } from './consts';

export class AppErr extends Error {
  constructor(public code: ErrCode, msg = '') {
    super(msg || code);
  }
}
