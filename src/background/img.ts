import { SvrDef } from '../shared/consts';

/** 远程图片 / Blob → dataURL。任何失败（含超时）返回空串，不抛出。 */
export class Img {
  static async data(url: string): Promise<string> {
    if (!url) return '';
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(SvrDef.IMG_MS) });
      if (!r.ok) return '';
      return await Img.blob(await r.blob());
    } catch {
      return '';
    }
  }

  static blob(b: Blob): Promise<string> {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
      fr.onerror = () => resolve('');
      fr.readAsDataURL(b);
    });
  }
}
