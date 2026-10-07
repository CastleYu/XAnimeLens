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
    // 正在播放/缓冲中的视频先短暂等待首帧，拿到的才是当前画面
    if (!Capture.has(video) && Capture.busy(video)) await Capture.ready(video, Def.READY_MS);
    if (Capture.has(video)) {
      try {
        return Capture.canvas(video);
      } catch {
        // 直链视频（如 GIF 转 mp4）会污染 canvas；video.twimg.com 对 x.com 返回 CORS 头，以 crossOrigin 重新加载即可截帧
      }
    }
    // 尚未加载的直链视频同样可以独立重新加载后截帧
    if (/^https?:/.test(video.currentSrc)) {
      try {
        return await Capture.clone(video.currentSrc, video.currentTime);
      } catch {
        // 继续尝试封面图 / 整页截图
      }
    }
    // 未加载（preload=none / MSE blob 尚未拉流）时播放器显示的是封面图
    if (!Capture.has(video) && video.poster) {
      try {
        return await Capture.pic(video.poster);
      } catch {
        // 封面图跨域不可读时退回整页截图（截到的同样是封面）
      }
    }
    return Capture.fallback(video);
  }

  /** 推文图片：页面内 crossOrigin 加载大图 → 后台下载 → 整页截图裁剪图片区域 */
  static async photo(img: HTMLImageElement, el: Element): Promise<string> {
    const url = Capture.big(img.currentSrc || img.src);
    try {
      return await Capture.pic(url);
    } catch {
      // 页面内不可读（缓存的非 CORS 响应等），交给后台下载
    }
    try {
      return await Capture.pic(await Bus.send<string>({ type: Msg.PIC, url }));
    } catch {
      return Capture.fallback(el);
    }
  }

  /** pbs.twimg.com 图片换成大图尺寸（缩略图可能被裁成方形） */
  static big(src: string): string {
    try {
      const u = new URL(src);
      if (!u.searchParams.has(Dom.PIC_NAME)) return src;
      u.searchParams.set(Dom.PIC_NAME, Dom.PIC_SIZE);
      return u.toString();
    } catch {
      return src;
    }
  }

  /** 当前帧可绘制 */
  static has(video: HTMLVideoElement): boolean {
    return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  /** 正在播放、已有进度或正在拉流：值得等待首帧 */
  static busy(video: HTMLVideoElement): boolean {
    return !video.paused || video.currentTime > 0 || video.networkState === HTMLMediaElement.NETWORK_LOADING;
  }

  /** 等待 loadeddata / canplay，超时也正常返回 */
  static ready(video: HTMLVideoElement, ms: number): Promise<void> {
    return new Promise((ok) => {
      const evts = ['loadeddata', 'canplay'];
      const done = (): void => {
        clearTimeout(timer);
        evts.forEach((t) => video.removeEventListener(t, done));
        ok();
      };
      const timer = setTimeout(done, ms);
      evts.forEach((t) => video.addEventListener(t, done));
    });
  }

  /** 以 crossOrigin=anonymous 加载图片（封面 / 推文图片）并绘制 */
  static pic(src: string): Promise<string> {
    return new Promise((ok, no) => {
      const img = new Image();
      const timer = setTimeout(() => no(new AppErr(ErrCode.CAPTURE, 'image timeout')), Def.POSTER_MS);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          ok(Capture.draw(img, img.naturalWidth, img.naturalHeight));
        } catch (e) {
          no(e);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        no(new AppErr(ErrCode.CAPTURE, 'image load'));
      };
      img.src = src;
    });
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
    return Capture.draw(video, video.videoWidth, video.videoHeight);
  }

  /** 按原始尺寸缩放绘制为 JPEG dataURL */
  static draw(src: CanvasImageSource, vw: number, vh: number): string {
    if (!vw || !vh) throw new AppErr(ErrCode.CAPTURE, '视频尺寸无效');
    const s = Capture.scale(vw, vh, Def.MAX_EDGE);
    const cv = Capture.board(s.w, s.h);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new AppErr(ErrCode.CAPTURE, 'canvas 不可用');
    ctx.drawImage(src, 0, 0, s.w, s.h);
    return cv.toDataURL('image/jpeg', Def.JPEG_Q);
  }

  /** 整页截图 → 按 rect * (截图宽 / innerWidth) 裁剪 → 缩放 */
  static async fallback(video: Element): Promise<string> {
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
