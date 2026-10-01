import { Bus } from './msg';
import { CardDom, Def, Dom, ErrCode, Msg } from '../shared/consts';
import { AppErr } from '../shared/err';

/** 裁剪框（图片像素坐标） */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 截帧：优先 canvas；跨域污染时整页截图后按播放器位置裁剪。 */
export class Capture {
  static async frame(video: HTMLVideoElement): Promise<string> {
    if (video.readyState < 2) throw new AppErr(ErrCode.CAPTURE, '视频尚未加载');
    try {
      return Capture.canvas(video);
    } catch {
      // 直链视频（如 GIF 转 mp4）会污染 canvas；video.twimg.com 对 x.com 返回 CORS 头，以 crossOrigin 重新加载即可截帧
    }
    if (/^https?:/.test(video.currentSrc)) {
      try {
        return await Capture.clone(video.currentSrc, video.currentTime);
      } catch {
        // 继续整页截图兜底（需要 activeTab 或 <all_urls>）
      }
    }
    return Capture.fallback(video);
  }

  /** 以 crossOrigin=anonymous 重新加载同一视频，跳到同一时间点截帧 */
  static clone(src: string, t: number): Promise<string> {
    return new Promise((ok, no) => {
      const v = document.createElement('video');
      const timer = setTimeout(() => done(new AppErr(ErrCode.CAPTURE, 'clone timeout')), Def.CLONE_MS);
      const done = (e: unknown, url?: string): void => {
        clearTimeout(timer);
        v.removeAttribute('src');
        v.load();
        if (url) ok(url);
        else no(e);
      };
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.preload = 'auto';
      v.addEventListener('loadeddata', () => (v.currentTime = t), { once: true });
      v.addEventListener(
        'seeked',
        () => {
          try {
            done(null, Capture.canvas(v));
          } catch (e) {
            done(e);
          }
        },
        { once: true },
      );
      v.addEventListener('error', () => done(new AppErr(ErrCode.CAPTURE, 'clone load')), { once: true });
      v.src = src;
    });
  }

  /** canvas.drawImage(video)；跨域时 toDataURL 抛 SecurityError */
  static canvas(video: HTMLVideoElement): string {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new AppErr(ErrCode.CAPTURE, '视频尺寸无效');
    const s = Capture.scale(vw, vh, Def.MAX_EDGE);
    const cv = Capture.board(s.w, s.h);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new AppErr(ErrCode.CAPTURE, 'canvas 不可用');
    ctx.drawImage(video, 0, 0, s.w, s.h);
    return cv.toDataURL('image/jpeg', Def.JPEG_Q);
  }

  /** 整页截图 → 按 rect * (截图宽 / innerWidth) 裁剪 → 缩放 */
  static async fallback(video: HTMLVideoElement): Promise<string> {
    Capture.veil(true);
    try {
      await Capture.frames(2);
      const shot = await Bus.send<string>({ type: Msg.CAPTURE });
      const bmp = await createImageBitmap(await (await fetch(shot)).blob());
      const rect = video.getBoundingClientRect();
      const scale = bmp.width / window.innerWidth;
      const box = Capture.box(rect, scale, bmp.width, bmp.height);
      return Capture.crop(bmp, box);
    } finally {
      Capture.veil(false);
    }
  }

  /** 纯函数：元素 rect + 缩放比例 → 与图片边界取交集的裁剪框 */
  static box(
    rect: { left: number; top: number; width: number; height: number },
    scale: number,
    iw: number,
    ih: number,
  ): Box {
    const x = Capture.clamp(rect.left * scale, 0, iw);
    const y = Capture.clamp(rect.top * scale, 0, ih);
    const r = Capture.clamp((rect.left + rect.width) * scale, 0, iw);
    const b = Capture.clamp((rect.top + rect.height) * scale, 0, ih);
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.max(0, Math.round(r - x)),
      h: Math.max(0, Math.round(b - y)),
    };
  }

  static scale(w: number, h: number, max: number): { w: number; h: number } {
    const m = Math.max(w, h);
    if (m <= max || m <= 0) return { w, h };
    const k = max / m;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  static async crop(bmp: ImageBitmap, box: Box): Promise<string> {
    const s = Capture.scale(box.w, box.h, Def.MAX_EDGE);
    const cv = Capture.board(s.w, s.h);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new AppErr(ErrCode.CAPTURE, 'canvas 不可用');
    ctx.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, s.w, s.h);
    bmp.close?.();
    return cv.toDataURL('image/jpeg', Def.JPEG_Q);
  }

  /** 隐藏/恢复所有按钮宿主与卡片宿主 */
  static veil(hidden: boolean): void {
    const sel = `#${Dom.HOST_ID}, .${CardDom.BTN_HOST}`;
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.style.visibility = hidden ? 'hidden' : '';
    });
  }

  static frames(n: number): Promise<void> {
    return new Promise((resolve) => {
      const step = (k: number): void => {
        if (k <= 0) resolve();
        else requestAnimationFrame(() => step(k - 1));
      };
      step(n);
    });
  }

  private static board(w: number, h: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, w);
    cv.height = Math.max(1, h);
    return cv;
  }

  private static clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }
}
