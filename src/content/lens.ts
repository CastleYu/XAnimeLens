import { Bus } from './msg';
import { Capture } from './capture';
import { Card } from './card';
import { ErrCode, ErrText, Media, MediaSel, Menu } from '../shared/consts';
import { AppErr } from '../shared/err';

/** 右键识别：后台把本脚本注入到任意网页，再通过 Menu.HOOK 调用 run 识别被右键的图片 / 视频。 */
class Lens {
  static boot(): void {
    // 每次注入都覆盖为最新实例（扩展更新后旧实例已失效）
    (globalThis as unknown as Record<string, unknown>)[Menu.HOOK] = (src: string, kind: string) => void Lens.run(src, kind);
  }

  /** 截取 → 识别 → 渲染；失败显示可重试的卡片 */
  static async run(src: string, kind: string): Promise<void> {
    const el = Lens.find(src, kind);
    const job = Lens.grab(src, kind, el); // 先同步截取右键时的画面
    Card.loading(null);
    try {
      const img = await job;
      await Bus.stream(img, (data, done) => Card.render(data, location.href, img, done));
    } catch (e) {
      console.error('[XAnimeLens] recognize failed', e);
      Card.error(ErrText.of(e), () => void Lens.run(src, kind));
    }
  }

  /** 视频取当前帧；图片按地址读取（页面内 → 后台下载 → 截图裁剪） */
  static grab(src: string, kind: string, el: HTMLElement | null): Promise<string> {
    if (kind === Media.VIDEO) {
      return el instanceof HTMLVideoElement ? Capture.frame(el) : Promise.reject(new AppErr(ErrCode.NO_VIDEO));
    }
    return Capture.photo(src, el);
  }

  /** 按地址找到被右键的元素；同一地址有多个时取显示面积最大的 */
  static find(src: string, kind: string): HTMLElement | null {
    const sel = kind === Media.VIDEO ? MediaSel.VIDEO : MediaSel.IMG;
    const els = [...document.querySelectorAll<HTMLImageElement | HTMLVideoElement>(sel)].filter(
      (e) =>
        e.currentSrc === src ||
        e.src === src ||
        [...e.querySelectorAll<HTMLSourceElement>(MediaSel.SOURCE)].some((s) => s.src === src),
    );
    const area = (e: Element): number => {
      const r = e.getBoundingClientRect();
      return r.width * r.height;
    };
    return els.sort((a, b) => area(b) - area(a))[0] ?? null;
  }
}

Lens.boot();
